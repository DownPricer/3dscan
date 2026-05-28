import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRaw } from "node:zlib";
import { MatterportImportMode, MatterportImportStatus, ModelType, VisitType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { promisify } from "node:util";
import sharp from "sharp";
import { requireAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  auditExtractedMatterportBackup,
  type MatterportBackupAudit,
  renderMatterportAuditMarkdown,
} from "@/lib/matterport-backup-audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const inflateRawAsync = promisify(inflateRaw);
const matterportAllowedZipExtensions = new Set([
  "",
  ".obj",
  ".mtl",
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".glb",
  ".gltf",
  ".bin",
  ".json",
  ".e57",
  ".xyz",
  ".pdf",
  ".pb",
  ".mmp",
  ".dam",
  ".swl",
  ".mfst",
  ".txt",
]);
const maxOptimizedPanoramaWidth = 8192;
const optimizedJpegQuality = 84;

function toPosixPath(p: string) {
  return p.replace(/\\/g, "/");
}

function isUnsafeZipPath(entryPath: string) {
  const normalized = path.posix.normalize(toPosixPath(entryPath).replace(/^\/+/, ""));
  if (!normalized || normalized === "." || normalized.startsWith("/")) return true;
  if (normalized.includes("..")) return true;
  // Windows drive letters in zip entries (rare but possible)
  if (/^[a-zA-Z]:/.test(normalized)) return true;
  return false;
}

function safeZipRelPath(entryPath: string) {
  if (isUnsafeZipPath(entryPath)) return null;
  return path.posix.normalize(toPosixPath(entryPath).replace(/^\/+/, ""));
}

function extensionOf(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function isAllowedMatterportBackupFile(relPath: string) {
  const ext = extensionOf(relPath);
  if (!matterportAllowedZipExtensions.has(ext)) return false;
  if (ext) return true;
  return path.posix.basename(relPath).startsWith("backup_data");
}

function matterportLimitError(limitMb: number) {
  return `Le ZIP Matterport est trop volumineux pour la limite actuelle. Limite : ${limitMb} Mo. Augmentez MATTERPORT_IMPORT_MAX_UNCOMPRESSED_MB si nécessaire.`;
}

function lastToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // keep quoted paths with spaces
  const quoted = trimmed.match(/"([^"]+)"\s*$/);
  if (quoted?.[1]) return quoted[1];
  const parts = trimmed.split(/\s+/g);
  return parts[parts.length - 1] ?? "";
}

function parseMapKdTextures(mtl: string) {
  const textures = new Set<string>();
  for (const line of mtl.split(/\r?\n/g)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;
    if (!/^map_Kd\s+/i.test(clean)) continue;
    const after = clean.replace(/^map_Kd\s+/i, "");
    const tex = lastToken(after);
    if (tex) textures.add(tex);
  }
  return Array.from(textures);
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function readUInt32LE(buf: Buffer, offset: number) {
  return buf.readUInt32LE(offset);
}

function readUInt16LE(buf: Buffer, offset: number) {
  return buf.readUInt16LE(offset);
}

function findEocdOffset(zip: Buffer) {
  // EOCD record is at most 65,535 + 22 bytes from end (ZIP spec).
  const maxBack = Math.min(zip.length, 0xffff + 22);
  for (let i = zip.length - 22; i >= zip.length - maxBack; i--) {
    if (i < 0) break;
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

type CentralEntry = {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function parseCentralDirectory(zip: Buffer): CentralEntry[] {
  const eocdOffset = findEocdOffset(zip);
  if (eocdOffset < 0) throw new Error("ZIP invalide (EOCD introuvable).");

  const totalEntries = readUInt16LE(zip, eocdOffset + 10);
  const cdSize = readUInt32LE(zip, eocdOffset + 12);
  const cdOffset = readUInt32LE(zip, eocdOffset + 16);

  // ZIP64 detection (simplifiée)
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("ZIP64 non supporté pour l’instant.");
  }

  let cursor = cdOffset;
  const end = cdOffset + cdSize;
  const entries: CentralEntry[] = [];

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
    const nameEnd = nameStart + filenameLen;
    const filename = zip.subarray(nameStart, nameEnd).toString("utf8");

    entries.push({
      filename,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor = nameEnd + extraLen + commentLen;
  }

  return entries;
}

async function extractEntryToDisk(args: {
  zip: Buffer;
  entry: CentralEntry;
  outputDir: string;
  maxTotalBytes: number;
  maxFileBytes: number;
  limitMb: number;
  currentTotalBytes: number;
}): Promise<{ rel: string | null; totalBytes: number }> {
  const { zip, entry, outputDir, maxTotalBytes, maxFileBytes, limitMb } = args;
  let totalBytes = args.currentTotalBytes;

  const rawPath = entry.filename;
  const normalized = safeZipRelPath(rawPath);
  if (!normalized) return { rel: null, totalBytes };
  if (!isAllowedMatterportBackupFile(normalized)) return { rel: null, totalBytes };
  if (entry.uncompressedSize > maxFileBytes) {
    throw new Error(
      `Le fichier ${normalized} est trop volumineux pour l’import Matterport. Limite par fichier : ${Math.round(
        maxFileBytes / 1024 / 1024,
      )} Mo.`,
    );
  }
  totalBytes += entry.uncompressedSize;
  if (totalBytes > maxTotalBytes) {
    throw new Error(matterportLimitError(limitMb));
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
    // Unsupported compression method
    return { rel: null, totalBytes };
  }

  // Safety: respect declared uncompressed size if provided
  if (entry.uncompressedSize > 0 && content.length !== entry.uncompressedSize) {
    // Some zips lie; we don't hard fail, but we still enforce maxTotalBytes via content length too.
    const delta = content.length - entry.uncompressedSize;
    if (delta > 0) {
      totalBytes += delta;
      if (totalBytes > maxTotalBytes) {
        throw new Error(matterportLimitError(limitMb));
      }
    }
  }

  const destPath = path.join(outputDir, ...normalized.split("/"));
  const resolved = path.resolve(destPath);
  const resolvedRoot = path.resolve(outputDir);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    return { rel: null, totalBytes };
  }

  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, content);
  return { rel: normalized, totalBytes };
}

function optimizedRelPathForImage(relPath: string) {
  const parsed = path.posix.parse(relPath);
  return path.posix.join("web", parsed.dir, `${parsed.name}.jpg`);
}

async function optimizeMatterportPanoramas(args: {
  audit: MatterportBackupAudit;
  outputDir: string;
  publicBaseUrl: string;
}) {
  const overrides: Record<string, string> = {};
  let optimizedImageCount = 0;

  for (const image of args.audit.images) {
    if (image.kind !== "equirectangular_candidate") continue;
    const source = path.join(args.outputDir, ...image.path.split("/"));
    const optimizedRel = optimizedRelPathForImage(image.path);
    const destination = path.join(args.outputDir, ...optimizedRel.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });

    const pipeline = sharp(source).rotate();
    if ((image.width ?? 0) > maxOptimizedPanoramaWidth) {
      pipeline.resize({ width: maxOptimizedPanoramaWidth, withoutEnlargement: true });
    }

    await pipeline.jpeg({ quality: optimizedJpegQuality, mozjpeg: true }).toFile(destination);
    overrides[image.path] = `${args.publicBaseUrl}/${optimizedRel
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    optimizedImageCount++;
  }

  return { overrides, optimizedImageCount };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest(request);
  if (!admin) return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });

  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) {
    return NextResponse.json({ ok: false, error: "Propriété introuvable." }, { status: 404 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    file = candidate instanceof File ? candidate : null;
  } catch {
    // ignore
  }

  if (!file) {
    return NextResponse.json({ ok: false, error: "Fichier ZIP manquant." }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ ok: false, error: "Format invalide. Envoyez un .zip." }, { status: 400 });
  }

  const maxImportMb = env.matterportImportMaxUncompressedMb;
  const maxBytes = maxImportMb * 1024 * 1024;
  const maxFileBytes = Math.min(maxBytes, 1024 * 1024 * 1024);
  if (file.size > maxBytes) {
    return NextResponse.json(
      { ok: false, error: matterportLimitError(maxImportMb) },
      { status: 413 },
    );
  }

  await prisma.property.update({
    where: { id },
    data: {
      visitType: VisitType.MATTERPORT,
      matterportImportStatus: MatterportImportStatus.PENDING,
      matterportZipOriginalName: file.name,
      matterportImportMode: MatterportImportMode.MATTERPAK_UNKNOWN,
      matterportImportError: null,
      matterportLocalManifestUrl: null,
      matterportAuditReportUrl: null,
      matterportAuditSummary: undefined,
    },
  });

  const bundleId = `${Date.now()}-${randomUUID()}`;
  const outputDir = path.join(process.cwd(), "public", "uploads", "matterport", id, bundleId);
  await mkdir(outputDir, { recursive: true });

  const extractedRelPaths: string[] = [];
  let extractedBytes = 0;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const entries = parseCentralDirectory(buffer);
    for (const entry of entries) {
      const result = await extractEntryToDisk({
        zip: buffer,
        entry,
        outputDir,
        maxTotalBytes: maxBytes,
        maxFileBytes,
        limitMb: maxImportMb,
        currentTotalBytes: extractedBytes,
      });
      extractedBytes = result.totalBytes;
      if (result.rel) extractedRelPaths.push(result.rel);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction ZIP impossible.";
    await rm(outputDir, { recursive: true, force: true });
    await prisma.property.update({
      where: { id },
      data: {
        matterportImportStatus: MatterportImportStatus.ERROR,
        matterportImportError: message,
      },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  const publicBaseUrl = `/uploads/matterport/${id}/${bundleId}`;
  const manifestRel = "matterport_local_manifest.json";
  const inventoryRel = "matterport_backup_inventory.json";
  const reportRel = "MATTERPORT_BACKUP_DEEP_AUDIT.md";
  const publicManifestUrl = `${publicBaseUrl}/${manifestRel}`;
  const publicReportUrl = `${publicBaseUrl}/${reportRel}`;
  let audit: MatterportBackupAudit;

  try {
    const initialAudit = await auditExtractedMatterportBackup({
      rootDir: outputDir,
      relPaths: extractedRelPaths,
      sourceName: file.name,
      publicBaseUrl,
      sourceZipBytes: file.size,
      extractedBytes,
      importLimitMb: maxImportMb,
    });
    const optimization = await optimizeMatterportPanoramas({
      audit: initialAudit,
      outputDir,
      publicBaseUrl,
    });
    audit = await auditExtractedMatterportBackup({
      rootDir: outputDir,
      relPaths: extractedRelPaths,
      sourceName: file.name,
      publicBaseUrl,
      imageUrlOverrides: optimization.overrides,
      sourceZipBytes: file.size,
      extractedBytes,
      importLimitMb: maxImportMb,
      optimizedImageCount: optimization.optimizedImageCount,
    });

    await writeFile(path.join(outputDir, manifestRel), JSON.stringify(audit.manifest, null, 2), "utf8");
    await writeFile(path.join(outputDir, inventoryRel), JSON.stringify(audit, null, 2), "utf8");
    await writeFile(path.join(outputDir, reportRel), renderMatterportAuditMarkdown(audit), "utf8");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Audit Matterport impossible.";
    await rm(outputDir, { recursive: true, force: true });
    await prisma.property.update({
      where: { id },
      data: {
        matterportImportStatus: MatterportImportStatus.ERROR,
        matterportImportError: message,
      },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  const auditData = {
    matterportLocalManifestUrl: publicManifestUrl,
    matterportAuditReportUrl: publicReportUrl,
    matterportAuditSummary: audit.manifest.summary,
  };
  const auditResponse = {
    localManifestUrl: publicManifestUrl,
    auditReportUrl: publicReportUrl,
    auditSummary: audit.manifest.summary,
  };

  const byExt = (ext: string) =>
    extractedRelPaths.filter((p) => extensionOf(p) === ext).map((p) => p);

  const objFiles = byExt(".obj");
  const mtlFiles = byExt(".mtl");
  const glbFiles = byExt(".glb");
  const gltfFiles = byExt(".gltf");
  const e57Files = byExt(".e57");
  const xyzFiles = byExt(".xyz");

  // 1) MatterPak OBJ
  if (objFiles.length > 0) {
    // Heuristique: plus gros OBJ
    const sizes = await Promise.all(
      objFiles.map(async (rel) => {
        const abs = path.join(outputDir, ...rel.split("/"));
        const info = await stat(abs);
        return { rel, size: info.size };
      }),
    );
    const mainObj = sizes.sort((a, b) => b.size - a.size)[0]?.rel ?? objFiles[0]!;
    const objAbs = path.join(outputDir, ...mainObj.split("/"));
    const objText = await readFile(objAbs, "utf8").catch(() => "");
    const mtllib = objText.match(/^mtllib\s+(.+)$/im)?.[1]?.trim() ?? null;

    let chosenMtl: string | null = null;
    if (mtllib) {
      const candidate = path.posix.normalize(toPosixPath(mtllib));
      const inSameDir = path.posix.normalize(path.posix.join(path.posix.dirname(mainObj), candidate));
      if (mtlFiles.includes(inSameDir)) chosenMtl = inSameDir;
      else if (mtlFiles.includes(candidate)) chosenMtl = candidate;
    }

    // fallback: 1 seul mtl
    if (!chosenMtl && mtlFiles.length === 1) chosenMtl = mtlFiles[0]!;

    if (!chosenMtl) {
      const message =
        "Ce ZIP Matterport contient un OBJ mais aucun fichier .mtl exploitable. Utilisez un lien Matterport ou un export OBJ complet (OBJ+MTL+textures).";
      await prisma.property.update({
        where: { id },
        data: {
          visitType: VisitType.MATTERPORT,
          matterportImportMode: MatterportImportMode.MATTERPAK_OBJ,
          matterportImportStatus: MatterportImportStatus.UNSUPPORTED,
          matterportImportError: message,
          ...auditData,
        },
      });
      return NextResponse.json({
        ok: true,
        importMode: MatterportImportMode.MATTERPAK_OBJ,
        importStatus: MatterportImportStatus.UNSUPPORTED,
        importError: message,
        ...auditResponse,
      });
    }

    if (chosenMtl) {
      const mtlAbs = path.join(outputDir, ...chosenMtl.split("/"));
      const mtlText = await readFile(mtlAbs, "utf8").catch(() => "");
      const refs = parseMapKdTextures(mtlText);
      const lowerMap = new Map(extractedRelPaths.map((p) => [p.toLowerCase(), p]));
      const missing: string[] = [];

      for (const ref of refs) {
        const normalized = path.posix.normalize(toPosixPath(ref));
        const resolvedRel = path.posix.normalize(
          path.posix.join(path.posix.dirname(chosenMtl), normalized),
        );
        const abs = path.join(outputDir, ...resolvedRel.split("/"));
        if (await exists(abs)) continue;
        const caseInsensitive = lowerMap.get(resolvedRel.toLowerCase());
        if (caseInsensitive) continue;
        missing.push(ref);
      }

      if (missing.length > 0) {
        const message = "Textures manquantes dans le ZIP Matterport.";
        await prisma.property.update({
          where: { id },
          data: {
            matterportImportStatus: MatterportImportStatus.ERROR,
            matterportImportMode: MatterportImportMode.MATTERPAK_OBJ,
            matterportImportError: `${message} (${missing.slice(0, 8).join(", ")}${
              missing.length > 8 ? ", ..." : ""
            })`,
            ...auditData,
          },
        });
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
      }
    }

    const publicObjUrl = `/uploads/matterport/${id}/${bundleId}/${mainObj}`;
    await prisma.property.update({
      where: { id },
      data: {
        visitType: VisitType.MATTERPORT,
        modelUrl: publicObjUrl,
        modelType: ModelType.OBJ,
        matterportImportMode: MatterportImportMode.MATTERPAK_OBJ,
        matterportImportStatus: MatterportImportStatus.READY,
        matterportImportError: null,
        ...auditData,
      },
    });

    return NextResponse.json({
      ok: true,
      modelUrl: publicObjUrl,
      modelType: "OBJ",
      importMode: MatterportImportMode.MATTERPAK_OBJ,
      importStatus: MatterportImportStatus.READY,
      importError: null,
      ...auditResponse,
    });
  }

  // 2) GLB/GLTF
  const mainGlb = glbFiles[0] ?? null;
  if (mainGlb) {
    const publicUrl = `/uploads/matterport/${id}/${bundleId}/${mainGlb}`;
    await prisma.property.update({
      where: { id },
      data: {
        visitType: VisitType.MATTERPORT,
        modelUrl: publicUrl,
        modelType: ModelType.GLB,
        matterportImportMode: MatterportImportMode.MATTERPAK_UNKNOWN,
        matterportImportStatus: MatterportImportStatus.READY,
        matterportImportError: null,
        ...auditData,
      },
    });
    return NextResponse.json({
      ok: true,
      modelUrl: publicUrl,
      modelType: "GLB",
      importMode: MatterportImportMode.MATTERPAK_UNKNOWN,
      importStatus: MatterportImportStatus.READY,
      importError: null,
      ...auditResponse,
    });
  }

  const mainGltf = gltfFiles[0] ?? null;
  if (mainGltf) {
    const publicUrl = `/uploads/matterport/${id}/${bundleId}/${mainGltf}`;
    await prisma.property.update({
      where: { id },
      data: {
        visitType: VisitType.MATTERPORT,
        modelUrl: publicUrl,
        modelType: ModelType.GLTF,
        matterportImportMode: MatterportImportMode.MATTERPAK_UNKNOWN,
        matterportImportStatus: MatterportImportStatus.READY,
        matterportImportError: null,
        ...auditData,
      },
    });
    return NextResponse.json({
      ok: true,
      modelUrl: publicUrl,
      modelType: "GLTF",
      importMode: MatterportImportMode.MATTERPAK_UNKNOWN,
      importStatus: MatterportImportStatus.READY,
      importError: null,
      ...auditResponse,
    });
  }

  // 3) Backup Matterport interne: rendu local 360/cube faces si possible.
  if (audit.manifest.panoramas.length > 0) {
    const message =
      "Import local partiel créé : vues 360 extraites. Le dollhouse Matterport complet n’est pas encore reconstruit.";
    await prisma.property.update({
      where: { id },
      data: {
        visitType: VisitType.MATTERPORT,
        modelUrl: publicManifestUrl,
        modelType: ModelType.ZIP,
        matterportImportMode: MatterportImportMode.LOCAL_BACKUP_VIEWER,
        matterportImportStatus: MatterportImportStatus.READY_PARTIAL,
        matterportImportError: message,
        ...auditData,
      },
    });
    return NextResponse.json({
      ok: true,
      modelUrl: publicManifestUrl,
      modelType: "ZIP",
      importMode: MatterportImportMode.LOCAL_BACKUP_VIEWER,
      importStatus: MatterportImportStatus.READY_PARTIAL,
      importError: message,
      ...auditResponse,
    });
  }

  // 4) Point cloud only
  if (e57Files.length > 0 || xyzFiles.length > 0) {
    const message =
      "Ce ZIP Matterport contient un nuage de points mais aucune vue 360 exploitable automatiquement. Le rapport d’audit est disponible.";
    await prisma.property.update({
      where: { id },
      data: {
        visitType: VisitType.MATTERPORT,
        matterportImportMode: MatterportImportMode.MATTERPAK_UNKNOWN,
        matterportImportStatus: MatterportImportStatus.UNSUPPORTED,
        matterportImportError: message,
        ...auditData,
      },
    });
    return NextResponse.json({
      ok: true,
      importMode: MatterportImportMode.MATTERPAK_UNKNOWN,
      importStatus: MatterportImportStatus.UNSUPPORTED,
      importError: message,
      ...auditResponse,
    });
  }

  // 5) Unsupported
  const message =
    "Backup restaurable par Matterport, mais pas encore convertible localement. Le rapport d’audit détaille les fichiers trouvés.";
  await prisma.property.update({
    where: { id },
    data: {
      visitType: VisitType.MATTERPORT,
      matterportImportMode: MatterportImportMode.MATTERPAK_UNKNOWN,
      matterportImportStatus: MatterportImportStatus.UNSUPPORTED,
      matterportImportError: message,
      ...auditData,
    },
  });
  return NextResponse.json({
    ok: true,
    importMode: MatterportImportMode.MATTERPAK_UNKNOWN,
    importStatus: MatterportImportStatus.UNSUPPORTED,
    importError: message,
    ...auditResponse,
  });
}

