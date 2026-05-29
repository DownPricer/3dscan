import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";
import type { Prisma } from "@prisma/client";

const inflateRawAsync = promisify(inflateRaw);

export type ZipEntry = {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export type ImageKind =
  | "equirectangular_candidate"
  | "cube_face_candidate"
  | "thumbnail"
  | "classic_image"
  | "unknown_image";

export type ImageInventory = {
  path: string;
  extension: string;
  size: number;
  magic: string;
  width: number | null;
  height: number | null;
  ratio: string | null;
  kind: ImageKind;
};

export type FileInventory = {
  path: string;
  extension: string;
  size: number;
  magic: string;
  detectedFormat: string;
  entropy: number | null;
  strings: string[];
  protobufRaw?: unknown;
  floatSamples?: number[];
  image?: ImageInventory;
};

export type MatterportLocalManifest = {
  type: "MATTERPORT_BACKUP_LOCAL";
  source: "backup";
  generatedAt: string;
  panoramas: Array<{
    id: string;
    file: string | null;
    files?: string[];
    width: number | null;
    height: number | null;
    kind: "panorama_360" | "equirectangular_candidate" | "cube_face_set_candidate";
    position: { x: number; y: number; z: number } | null;
    rotation: { yaw?: number; pitch?: number; roll?: number; quaternion?: number[] } | null;
  }>;
  floorplans: string[];
  scanPoints: Array<{
    id: string;
    panoramaId: string | null;
    label: string;
    position: { x: number; y: number; z: number } | null;
    rotation: { yaw?: number; pitch?: number; roll?: number; quaternion?: number[] } | null;
  }>;
  unsupportedFiles: string[];
  summary: AuditSummary;
};

export type AuditSummary = {
  totalFiles: number;
  totalBytes: number;
  sourceZipBytes?: number;
  extractedBytes?: number;
  importLimitMb?: number;
  optimizedImageCount?: number;
  extensionCounts: Record<string, number>;
  imageCount: number;
  panoramaCandidates: number;
  cubeFaceSetCandidates: number;
  scanPointsFound: number;
  hasDepthImages: boolean;
  hasFloorplan: boolean;
  hasMesh: boolean;
  hasCoordinates: boolean;
};

export type MatterportAuditSummary = {
  totalFiles?: number;
  totalBytes?: number;
  sourceZipBytes?: number;
  extractedBytes?: number;
  importLimitMb?: number;
  optimizedImageCount?: number;
  imageCount?: number;
  panoramaCandidates?: number;
  cubeFaceSetCandidates?: number;
  scanPointsFound?: number;
  hasFloorplan?: boolean;
  hasMesh?: boolean;
};

export type MatterportBackupAudit = {
  generatedAt: string;
  sourceName: string;
  rootDir: string;
  files: FileInventory[];
  images: ImageInventory[];
  manifest: MatterportLocalManifest;
  answers: {
    panoramas360: string;
    depthImages: string;
    scanPoses: string;
    floorplan: string;
    mesh: string;
    localVisit: string;
    bestMvp: string;
  };
};

type ExtractOptions = {
  outputDir: string;
  maxTotalBytes: number;
  include?: (entryPath: string) => boolean;
};

type AuditOptions = {
  rootDir: string;
  relPaths: string[];
  sourceName: string;
  publicBaseUrl?: string;
  imageUrlOverrides?: Record<string, string>;
  sourceZipBytes?: number;
  extractedBytes?: number;
  importLimitMb?: number;
  optimizedImageCount?: number;
};

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".bmp"]);
const metadataExtensions = new Set([".pb", ".mmp", ".dam", ".swl"]);
const meshExtensions = new Set([".obj", ".glb", ".gltf", ".fbx", ".dae", ".ply", ".stl"]);
const depthHints = [/depth/i, /_d\./i, /distance/i];
const floorplanHints = [/floor/i, /plan/i, /map/i, /layout/i];

export function normalizeMatterportAuditSummary(
  value: Prisma.JsonValue | null | undefined,
): MatterportAuditSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const summary: MatterportAuditSummary = {};

  if (typeof source.totalFiles === "number") summary.totalFiles = source.totalFiles;
  if (typeof source.totalBytes === "number") summary.totalBytes = source.totalBytes;
  if (typeof source.sourceZipBytes === "number") summary.sourceZipBytes = source.sourceZipBytes;
  if (typeof source.extractedBytes === "number") summary.extractedBytes = source.extractedBytes;
  if (typeof source.importLimitMb === "number") summary.importLimitMb = source.importLimitMb;
  if (typeof source.optimizedImageCount === "number") {
    summary.optimizedImageCount = source.optimizedImageCount;
  }
  if (typeof source.imageCount === "number") summary.imageCount = source.imageCount;
  if (typeof source.panoramaCandidates === "number") {
    summary.panoramaCandidates = source.panoramaCandidates;
  }
  if (typeof source.cubeFaceSetCandidates === "number") {
    summary.cubeFaceSetCandidates = source.cubeFaceSetCandidates;
  }
  if (typeof source.scanPointsFound === "number") {
    summary.scanPointsFound = source.scanPointsFound;
  }
  if (typeof source.hasFloorplan === "boolean") summary.hasFloorplan = source.hasFloorplan;
  if (typeof source.hasMesh === "boolean") summary.hasMesh = source.hasMesh;

  return Object.keys(summary).length > 0 ? summary : null;
}

function readUInt32LE(buf: Buffer, offset: number) {
  return buf.readUInt32LE(offset);
}

function readUInt16LE(buf: Buffer, offset: number) {
  return buf.readUInt16LE(offset);
}

function toPosixPath(p: string) {
  return p.replace(/\\/g, "/");
}

function isUnsafeZipPath(entryPath: string) {
  const normalized = path.posix.normalize(toPosixPath(entryPath).replace(/^\/+/, ""));
  if (!normalized || normalized === "." || normalized.startsWith("/")) return true;
  if (normalized.includes("..")) return true;
  return /^[a-zA-Z]:/.test(normalized);
}

function safeZipRelPath(entryPath: string) {
  if (isUnsafeZipPath(entryPath)) return null;
  return path.posix.normalize(toPosixPath(entryPath).replace(/^\/+/, ""));
}

export function extensionOf(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function findEocdOffset(zip: Buffer) {
  const maxBack = Math.min(zip.length, 0xffff + 22);
  for (let i = zip.length - 22; i >= zip.length - maxBack; i--) {
    if (i < 0) break;
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

export function parseZipCentralDirectory(zip: Buffer): ZipEntry[] {
  const eocdOffset = findEocdOffset(zip);
  if (eocdOffset < 0) throw new Error("ZIP invalide (EOCD introuvable).");

  const totalEntries = readUInt16LE(zip, eocdOffset + 10);
  const cdSize = readUInt32LE(zip, eocdOffset + 12);
  const cdOffset = readUInt32LE(zip, eocdOffset + 16);

  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("ZIP64 non supporté pour l’instant.");
  }

  let cursor = cdOffset;
  const end = cdOffset + cdSize;
  const entries: ZipEntry[] = [];

  while (cursor < end) {
    const sig = readUInt32LE(zip, cursor);
    if (sig !== 0x02014b50) break;

    const compressionMethod = readUInt16LE(zip, cursor + 10);
    const compressedSize = readUInt32LE(zip, cursor + 20);
    const uncompressedSize = readUInt32LE(zip, cursor + 24);
    const filenameLen = readUInt16LE(zip, cursor + 28);
    const extraLen = readUInt16LE(zip, cursor + 30);
    const commentLen = readUInt16LE(zip, cursor + 32);
    const localHeaderOffset = readUInt32LE(zip, cursor + 42);
    const nameStart = cursor + 46;
    const filename = zip.subarray(nameStart, nameStart + filenameLen).toString("utf8");

    entries.push({ filename, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = nameStart + filenameLen + extraLen + commentLen;
  }

  return entries;
}

export async function extractZipEntries(zip: Buffer, entries: ZipEntry[], options: ExtractOptions) {
  let extractedBytes = 0;
  const extractedRelPaths: string[] = [];

  for (const entry of entries) {
    const normalized = safeZipRelPath(entry.filename);
    if (!normalized) continue;
    if (normalized.endsWith("/")) continue;
    if (options.include && !options.include(normalized)) continue;

    extractedBytes += entry.uncompressedSize;
    if (extractedBytes > options.maxTotalBytes) {
      throw new Error("Extraction interrompue : le contenu dépasse la limite configurée.");
    }

    const localOffset = entry.localHeaderOffset;
    if (readUInt32LE(zip, localOffset) !== 0x04034b50) {
      throw new Error("ZIP invalide (local header introuvable).");
    }

    const filenameLen = readUInt16LE(zip, localOffset + 26);
    const extraLen = readUInt16LE(zip, localOffset + 28);
    const dataStart = localOffset + 30 + filenameLen + extraLen;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > zip.length) throw new Error("ZIP invalide (données tronquées).");

    const compressed = zip.subarray(dataStart, dataEnd);
    let content: Buffer;
    if (entry.compressionMethod === 0) {
      content = Buffer.from(compressed);
    } else if (entry.compressionMethod === 8) {
      content = (await inflateRawAsync(compressed)) as Buffer;
    } else {
      continue;
    }

    const destPath = path.join(options.outputDir, ...normalized.split("/"));
    const resolved = path.resolve(destPath);
    const resolvedRoot = path.resolve(options.outputDir);
    if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) continue;

    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, content);
    extractedRelPaths.push(normalized);
  }

  return { extractedRelPaths, extractedBytes };
}

function magicBytes(buffer: Buffer) {
  return buffer.subarray(0, Math.min(16, buffer.length)).toString("hex").match(/../g)?.join(" ") ?? "";
}

function detectedFormat(buffer: Buffer, ext: string) {
  if (buffer.subarray(0, 4).toString("latin1") === "PK\u0003\u0004") return "zip";
  if (buffer.subarray(0, 2).toString("hex") === "1f8b") return "gzip";
  if (buffer.subarray(0, 16).toString("latin1") === "SQLite format 3\u0000") return "sqlite";
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (buffer.subarray(0, 3).toString("hex") === "ffd8ff") return "jpeg";
  if (buffer.subarray(0, 2).toString("latin1") === "BM") return "bmp";
  const textStart = buffer.subarray(0, 128).toString("utf8").trimStart();
  if (textStart.startsWith("{") || textStart.startsWith("[")) return "json";
  if (textStart.startsWith("<?xml") || textStart.startsWith("<plist")) return "xml-plist";
  if (metadataExtensions.has(ext)) return "matterport-binary-candidate";
  return ext ? ext.slice(1) : "unknown";
}

function extractStrings(buffer: Buffer, limit = 80) {
  const text = buffer.toString("latin1");
  const matches = text.match(/[ -~]{4,}/g) ?? [];
  return Array.from(new Set(matches.map((s) => s.trim()).filter(Boolean))).slice(0, limit);
}

function entropy(buffer: Buffer) {
  if (buffer.length === 0) return 0;
  const sample = buffer.subarray(0, Math.min(buffer.length, 256 * 1024));
  const counts = new Array<number>(256).fill(0);
  for (const byte of sample) counts[byte]++;
  return counts.reduce((sum, count) => {
    if (!count) return sum;
    const p = count / sample.length;
    return sum - p * Math.log2(p);
  }, 0);
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readBmpDimensions(buffer: Buffer) {
  if (buffer.length < 26 || buffer.subarray(0, 2).toString("latin1") !== "BM") return null;
  return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
}

function readJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function readImageDimensions(buffer: Buffer, ext: string) {
  if (ext === ".png") return readPngDimensions(buffer);
  if (ext === ".bmp") return readBmpDimensions(buffer);
  if (ext === ".jpg" || ext === ".jpeg") return readJpegDimensions(buffer);
  return readPngDimensions(buffer) ?? readBmpDimensions(buffer) ?? readJpegDimensions(buffer);
}

function classifyImage(relPath: string, width: number | null, height: number | null): ImageKind {
  if (!width || !height) return "unknown_image";
  const ratio = width / height;
  if (width >= 2048 && Math.abs(ratio - 2) < 0.03) return "equirectangular_candidate";
  if (Math.abs(ratio - 1) < 0.02 && width >= 256) return "cube_face_candidate";
  if (width <= 1024 && height <= 1024) return "thumbnail";
  if (/thumb|thumbnail|preview/i.test(relPath)) return "thumbnail";
  return "classic_image";
}

function ratioLabel(width: number | null, height: number | null) {
  if (!width || !height) return null;
  const ratio = width / height;
  if (Math.abs(ratio - 2) < 0.03) return "2:1";
  if (Math.abs(ratio - 1) < 0.02) return "1:1";
  return `${ratio.toFixed(3)}:1`;
}

function extractFloatSamples(buffer: Buffer) {
  const floats: number[] = [];
  const maxOffset = Math.min(buffer.length - 4, 512 * 1024);
  for (let offset = 0; offset <= maxOffset; offset += 4) {
    const value = buffer.readFloatLE(offset);
    if (!Number.isFinite(value)) continue;
    if (Math.abs(value) > 0.000001 && Math.abs(value) < 100000) {
      floats.push(Number(value.toFixed(5)));
      if (floats.length >= 120) break;
    }
  }
  return floats;
}

function readVarint(buffer: Buffer, start: number) {
  let result = 0;
  let shift = 0;
  let cursor = start;
  while (cursor < buffer.length && shift < 35) {
    const byte = buffer[cursor++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result >>> 0, cursor };
    shift += 7;
  }
  return null;
}

function decodeProtobufRaw(buffer: Buffer, depth = 0): unknown[] {
  if (depth > 2) return [];
  const fields: unknown[] = [];
  let cursor = 0;
  while (cursor < buffer.length && fields.length < 200) {
    const key = readVarint(buffer, cursor);
    if (!key) break;
    cursor = key.cursor;
    const field = key.value >>> 3;
    const wire = key.value & 7;
    if (field <= 0 || field > 100000) break;

    if (wire === 0) {
      const value = readVarint(buffer, cursor);
      if (!value) break;
      cursor = value.cursor;
      fields.push({ field, wire, value: value.value });
    } else if (wire === 1) {
      if (cursor + 8 > buffer.length) break;
      fields.push({ field, wire, fixed64Hex: buffer.subarray(cursor, cursor + 8).toString("hex") });
      cursor += 8;
    } else if (wire === 2) {
      const length = readVarint(buffer, cursor);
      if (!length) break;
      cursor = length.cursor;
      if (length.value < 0 || cursor + length.value > buffer.length) break;
      const slice = buffer.subarray(cursor, cursor + length.value);
      const strings = extractStrings(slice, 8);
      fields.push({
        field,
        wire,
        length: length.value,
        strings,
        nested: length.value > 0 && length.value < 4096 ? decodeProtobufRaw(slice, depth + 1).slice(0, 20) : [],
      });
      cursor += length.value;
    } else if (wire === 5) {
      if (cursor + 4 > buffer.length) break;
      fields.push({ field, wire, fixed32: buffer.readUInt32LE(cursor), float: buffer.readFloatLE(cursor) });
      cursor += 4;
    } else {
      break;
    }
  }
  return fields;
}

function publicUrlFor(
  relPath: string,
  publicBaseUrl?: string,
  imageUrlOverrides?: Record<string, string>,
) {
  const override = imageUrlOverrides?.[relPath];
  if (override) return override;
  if (!publicBaseUrl) return relPath;
  return `${publicBaseUrl.replace(/\/$/, "")}/${relPath.split("/").map(encodeURIComponent).join("/")}`;
}

function findCubeGroups(
  images: ImageInventory[],
  publicBaseUrl?: string,
  imageUrlOverrides?: Record<string, string>,
) {
  const groups = new Map<string, ImageInventory[]>();
  for (const image of images) {
    if (image.kind !== "cube_face_candidate") continue;
    const match = image.path.match(/^(.*?)(?:_|\b)(128|256|512|1024|2048)_(00[0-5])\.(jpe?g|png)$/i);
    if (!match) continue;
    const key = `${match[1]}_${match[2]}`;
    groups.set(key, [...(groups.get(key) ?? []), image]);
  }

  return Array.from(groups.entries())
    .map(([key, faces]) => ({ key, faces: faces.sort((a, b) => a.path.localeCompare(b.path)) }))
    .filter((group) => group.faces.length === 6)
    .map((group) => ({
      id: `cube-${randomUUID()}`,
      file: null,
      files: group.faces.map((face) => publicUrlFor(face.path, publicBaseUrl, imageUrlOverrides)),
      width: group.faces[0]?.width ?? null,
      height: group.faces[0]?.height ?? null,
      kind: "cube_face_set_candidate" as const,
      position: null,
      rotation: null,
    }));
}

function isUsableEquirectangular(image: ImageInventory) {
  if (image.kind !== "equirectangular_candidate") return false;
  if (!image.width || !image.height) return false;
  return image.width >= 2048 && Math.abs(image.width / image.height - 2) < 0.03;
}

function buildManifest(
  images: ImageInventory[],
  files: FileInventory[],
  options: AuditOptions,
): MatterportLocalManifest {
  const equirectangular = images
    .filter(isUsableEquirectangular)
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))
    .map((image) => ({
      id: `pano-${randomUUID()}`,
      file: publicUrlFor(image.path, options.publicBaseUrl, options.imageUrlOverrides),
      width: image.width,
      height: image.height,
      kind: "panorama_360" as const,
      position: null,
      rotation: null,
    }));

  const cubeGroups = findCubeGroups(images, options.publicBaseUrl, options.imageUrlOverrides);
  const panoramas = equirectangular;
  const floorplans = images
    .filter(
      (image) =>
        image.kind !== "equirectangular_candidate" &&
        image.kind !== "cube_face_candidate" &&
        !/ScanLocal/i.test(image.path) &&
        floorplanHints.some((hint) => hint.test(image.path)),
    )
    .map((image) => publicUrlFor(image.path, options.publicBaseUrl, options.imageUrlOverrides));
  const unsupportedFiles = files
    .filter((file) => !imageExtensions.has(file.extension) && !metadataExtensions.has(file.extension) && !meshExtensions.has(file.extension))
    .map((file) => file.path);
  const hasCoordinates = files.some((file) => (file.floatSamples?.length ?? 0) >= 12 && [".pb", ".mmp"].includes(file.extension));

  const summary: AuditSummary = {
    totalFiles: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    sourceZipBytes: options.sourceZipBytes,
    extractedBytes: options.extractedBytes,
    importLimitMb: options.importLimitMb,
    optimizedImageCount: options.optimizedImageCount ?? 0,
    extensionCounts: files.reduce<Record<string, number>>((acc, file) => {
      const key = file.extension || "(none)";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    imageCount: images.length,
    panoramaCandidates: equirectangular.length,
    cubeFaceSetCandidates: cubeGroups.length,
    scanPointsFound: 0,
    hasDepthImages: files.some((file) => depthHints.some((hint) => hint.test(file.path))),
    hasFloorplan: floorplans.length > 0,
    hasMesh: files.some((file) => meshExtensions.has(file.extension)),
    hasCoordinates,
  };

  return {
    type: "MATTERPORT_BACKUP_LOCAL",
    source: "backup",
    generatedAt: new Date().toISOString(),
    panoramas,
    floorplans,
    scanPoints: [],
    unsupportedFiles,
    summary,
  };
}

export async function auditExtractedMatterportBackup(options: AuditOptions): Promise<MatterportBackupAudit> {
  const files: FileInventory[] = [];
  const images: ImageInventory[] = [];

  for (const relPath of options.relPaths.sort((a, b) => a.localeCompare(b))) {
    const abs = path.join(options.rootDir, ...relPath.split("/"));
    const info = await stat(abs);
    if (!info.isFile()) continue;
    const ext = extensionOf(relPath);
    const buffer = await readFile(abs);
    const format = detectedFormat(buffer, ext);
    const strings = extractStrings(buffer);
    const inventory: FileInventory = {
      path: relPath,
      extension: ext,
      size: info.size,
      magic: magicBytes(buffer),
      detectedFormat: format,
      entropy: metadataExtensions.has(ext) || /backup_data/i.test(relPath) ? Number(entropy(buffer).toFixed(3)) : null,
      strings,
    };

    if (imageExtensions.has(ext)) {
      const dimensions = readImageDimensions(buffer, ext);
      const image: ImageInventory = {
        path: relPath,
        extension: ext,
        size: info.size,
        magic: inventory.magic,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        ratio: ratioLabel(dimensions?.width ?? null, dimensions?.height ?? null),
        kind: classifyImage(relPath, dimensions?.width ?? null, dimensions?.height ?? null),
      };
      inventory.image = image;
      images.push(image);
    }

    if (ext === ".pb") {
      inventory.protobufRaw = decodeProtobufRaw(buffer);
      inventory.floatSamples = extractFloatSamples(buffer);
    } else if (ext === ".mmp" || ext === ".dam" || ext === ".swl" || /backup_data/i.test(relPath)) {
      inventory.floatSamples = extractFloatSamples(buffer);
    }

    files.push(inventory);
  }

  const manifest = buildManifest(images, files, options);
  const answers = {
    panoramas360:
      manifest.summary.panoramaCandidates > 0
        ? `Oui, ${manifest.summary.panoramaCandidates} image(s) 2:1 haute résolution détectée(s).`
        : manifest.summary.cubeFaceSetCandidates > 0
          ? `Pas d’équirectangulaire 2:1, mais ${manifest.summary.cubeFaceSetCandidates} groupe(s) de 6 faces cube détecté(s).`
          : "Non détecté avec certitude dans les images extraites.",
    depthImages: manifest.summary.hasDepthImages
      ? "Indices de fichiers depth/distance détectés, à valider manuellement."
      : "Aucune image de profondeur explicite détectée.",
    scanPoses: manifest.summary.hasCoordinates
      ? "Des flottants récurrents existent dans les métadonnées, mais aucune association image ↔ pose fiable n’a été reconstruite."
      : "Aucune pose de scan exploitable avec certitude.",
    floorplan: manifest.summary.hasFloorplan
      ? "Oui, au moins une image porte un nom de type plan/floor/map."
      : "Aucun floorplan explicite détecté.",
    mesh: manifest.summary.hasMesh
      ? "Oui, un fichier mesh standard a été trouvé."
      : "Aucun OBJ/GLB/GLTF/mesh standard détecté.",
    localVisit:
      manifest.summary.panoramaCandidates > 0
        ? "Oui, une visite locale partielle peut être créée avec les panoramas 360 2:1 détectés."
        : "Pas encore, sauf galerie/rapport, car aucune vue 360 exploitable n’a été identifiée.",
    bestMvp:
      manifest.summary.panoramaCandidates > 0
        ? "Viewer local avec navigation entre panoramas 360 2:1, liste latérale, plein écran et rapport d’audit."
        : "Afficher le rapport et une galerie des images, puis ajouter un placement manuel si des vues deviennent identifiables.",
  };

  return {
    generatedAt: new Date().toISOString(),
    sourceName: options.sourceName,
    rootDir: options.rootDir,
    files,
    images,
    manifest,
    answers,
  };
}

export function renderMatterportAuditMarkdown(audit: MatterportBackupAudit) {
  const s = audit.manifest.summary;
  const extensionRows = Object.entries(s.extensionCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ext, count]) => `- ${ext}: ${count}`)
    .join("\n");
  const panoramaRows = audit.manifest.panoramas
    .map((p) => `- ${p.id}: ${p.kind}, ${p.width ?? "?"}x${p.height ?? "?"}, ${p.file ?? p.files?.[0] ?? "faces cube"}`)
    .join("\n") || "- Aucun";
  const cubeGroupRows = findCubeGroups(audit.images)
    .map((p) => `- ${p.id}: ${p.width ?? "?"}x${p.height ?? "?"}, ${p.files?.[0] ?? "faces cube"}`)
    .join("\n") || "- Aucun";
  const treeRows = audit.files
    .map((file) => `- ${file.path} (${file.size} octets, ${file.detectedFormat}, magic ${file.magic || "n/a"})`)
    .join("\n") || "- Aucun";
  const imageRows = audit.images
    .map(
      (image) =>
        `- ${image.path}: ${image.width ?? "?"}x${image.height ?? "?"}, ratio ${image.ratio ?? "?"}, ${image.kind}`,
    )
    .join("\n") || "- Aucun";
  const metadataRows = audit.files
    .filter((file) => metadataExtensions.has(file.extension) || /backup_data/i.test(file.path))
    .map(
      (file) =>
        `- ${file.path}: ${file.size} octets, magic ${file.magic || "n/a"}, format ${file.detectedFormat}, entropie ${file.entropy ?? "n/a"}, strings ${file.strings.length}`,
    )
    .join("\n") || "- Aucun";

  return `# Matterport Backup Deep Audit

Source: ${audit.sourceName}
Généré: ${audit.generatedAt}

## Résumé
- Fichiers analysés: ${s.totalFiles}
- Taille ZIP source: ${s.sourceZipBytes ?? "n/a"} octets
- Taille totale extraite: ${s.totalBytes} octets
- Taille extraite mesurée: ${s.extractedBytes ?? "n/a"} octets
- Limite import: ${s.importLimitMb ?? "n/a"} Mo
- Images: ${s.imageCount}
- Images optimisées: ${s.optimizedImageCount ?? 0}
- Panoramas 2:1 candidats: ${s.panoramaCandidates}
- Groupes cube faces candidats: ${s.cubeFaceSetCandidates}
- Scan points reconstruits: ${s.scanPointsFound}
- Plan/floorplan détecté: ${s.hasFloorplan ? "oui" : "non"}
- Mesh standard détecté: ${s.hasMesh ? "oui" : "non"}
- Coordonnées/poses candidates: ${s.hasCoordinates ? "indices seulement" : "non"}

## Extensions
${extensionRows}

## Arborescence complète
${treeRows}

## Images analysées
${imageRows}

## Réponses techniques
1. Panoramas 360 exploitables: ${audit.answers.panoramas360}
2. Images de profondeur: ${audit.answers.depthImages}
3. Coordonnées/poses de scan: ${audit.answers.scanPoses}
4. Plan top-down/floorplan: ${audit.answers.floorplan}
5. Mesh caché: ${audit.answers.mesh}
6. Visite locale sans Matterport: ${audit.answers.localVisit}
7. Meilleur MVP: ${audit.answers.bestMvp}

## Panoramas / vues candidates
${panoramaRows}

## Groupes cube faces détectés non affichés dans le viewer
${cubeGroupRows}

## Métadonnées propriétaires auditées
${metadataRows}

## Limites
Ce rapport n’appelle aucun service Matterport et ne contourne aucun DRM. Les fichiers .mmp/.swl/.dam/.pb sont traités comme formats propriétaires: seules les signatures, chaînes lisibles, flottants candidats et structures protobuf brutes sont extraits.
`;
}

