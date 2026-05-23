import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import {
  allowedCoverExtensions,
  allowedModelAssetExtensions,
  allowedModelExtensions,
  allowedPanoramaExtensions,
  extensionOf,
  modelTypeFromFilename,
} from "@/lib/validators";

type UploadKind = "model" | "cover" | "panorama";

export type UploadResult = {
  url: string;
  modelType?: NonNullable<ReturnType<typeof modelTypeFromFilename>>;
};

function assertAllowedFile(file: File, kind: UploadKind) {
  const extension = extensionOf(file.name);
  const allowed =
    kind === "model"
      ? allowedModelExtensions
      : kind === "panorama"
        ? allowedPanoramaExtensions
        : allowedCoverExtensions;

  if (!allowed.includes(extension as never)) {
    throw new Error(
      kind === "model"
        ? "Format non supporté. Utilisez .glb, .gltf, .obj ou .zip."
        : kind === "panorama"
          ? "Format panorama non supporté. Utilisez .jpg ou .png équirectangulaire."
          : "Format image non supporté. Utilisez .jpg, .png ou .webp.",
    );
  }

  const maxBytes = env.uploadMaxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Le fichier dépasse la limite de ${env.uploadMaxSizeMb} Mo.`);
  }
}

function assertAllowedModelAsset(file: File) {
  const extension = extensionOf(file.name);

  if (!allowedModelAssetExtensions.includes(extension as never)) {
    throw new Error(
      "Format non supporté dans le scan. Utilisez .glb, .gltf, .obj, .mtl, .bin, .jpg, .png ou .webp.",
    );
  }
}

function assertTotalSize(files: File[]) {
  const maxBytes = env.uploadMaxSizeMb * 1024 * 1024;
  const totalSize = files.reduce((total, file) => total + file.size, 0);

  if (totalSize > maxBytes) {
    throw new Error(`Les fichiers dépassent la limite de ${env.uploadMaxSizeMb} Mo.`);
  }
}

function safeFilename(filename: string) {
  return path
    .basename(filename)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadLocal(file: File, kind: UploadKind): Promise<UploadResult> {
  assertAllowedFile(file, kind);

  const extension = extensionOf(file.name);
  const folder =
    kind === "model" ? "models" : kind === "panorama" ? "panoramas" : "covers";
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const relativePath = `/uploads/${folder}/${filename}`;
  const outputDir = path.join(process.cwd(), "public", "uploads", folder);

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, filename),
    Buffer.from(await file.arrayBuffer()),
  );

  return {
    url: relativePath,
    modelType: kind === "model" ? (modelTypeFromFilename(file.name) ?? undefined) : undefined,
  };
}

async function uploadLocalModelBundle(files: File[]): Promise<UploadResult> {
  if (files.length === 0) {
    throw new Error("Fichier manquant.");
  }

  files.forEach(assertAllowedModelAsset);
  assertTotalSize(files);

  const mainFile =
    files.find((file) => extensionOf(file.name) === ".glb") ??
    files.find((file) => extensionOf(file.name) === ".gltf") ??
    files.find((file) => extensionOf(file.name) === ".obj") ??
    files.find((file) => extensionOf(file.name) === ".zip");

  if (!mainFile) {
    throw new Error("Ajoutez au moins un fichier principal .glb, .gltf, .obj ou .zip.");
  }

  const modelType = modelTypeFromFilename(mainFile.name);
  if (!modelType) {
    throw new Error("Format principal non supporté.");
  }

  if (modelType !== "OBJ" && files.length > 1) {
    throw new Error(
      "Les uploads multiples sont réservés aux exports OBJ avec .mtl et textures. Pour GLB, envoyez un seul fichier .glb.",
    );
  }

  const bundleId = `${Date.now()}-${randomUUID()}`;
  const outputDir = path.join(process.cwd(), "public", "uploads", "models", bundleId);
  await mkdir(outputDir, { recursive: true });

  for (const file of files) {
    const filename = safeFilename(file.name);
    await writeFile(
      path.join(outputDir, filename),
      Buffer.from(await file.arrayBuffer()),
    );
  }

  return {
    url: `/uploads/models/${bundleId}/${safeFilename(mainFile.name)}`,
    modelType,
  };
}

export async function uploadFile(file: File, kind: UploadKind) {
  if (env.uploadProvider !== "local") {
    // The provider boundary is intentionally small so S3/Supabase can replace
    // only this function without changing admin forms or Prisma records.
    throw new Error(
      "Le stockage distant n'est pas encore configuré. Utilisez UPLOAD_PROVIDER=local ou branchez S3/Supabase dans lib/storage.ts.",
    );
  }

  return uploadLocal(file, kind);
}

export async function uploadFiles(files: File[], kind: UploadKind) {
  if (kind === "cover" || kind === "panorama") {
    if (files.length !== 1) {
      throw new Error(
        kind === "panorama"
          ? "Envoyez une seule image panorama 360."
          : "Envoyez une seule image de couverture.",
      );
    }

    return uploadFile(files[0], kind);
  }

  if (env.uploadProvider !== "local") {
    throw new Error(
      "Le stockage distant n'est pas encore configuré. Utilisez UPLOAD_PROVIDER=local ou branchez S3/Supabase dans lib/storage.ts.",
    );
  }

  return uploadLocalModelBundle(files);
}
