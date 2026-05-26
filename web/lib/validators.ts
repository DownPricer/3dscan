import { ExternalStatus, ModelType, PropertyStatus, VisitType } from "@prisma/client";
import { z } from "zod";

export const allowedPanoramaExtensions = [".jpg", ".jpeg", ".png"] as const;

export const allowedModelExtensions = [".glb", ".gltf", ".obj", ".zip"] as const;
export const allowedModelAssetExtensions = [
  ...allowedModelExtensions,
  ".mtl",
  ".bin",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;
export const allowedCoverExtensions = [".jpg", ".jpeg", ".png", ".webp"] as const;

export const panoramaSceneSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Le nom de la pièce est obligatoire."),
  imageUrl: z.string().trim().min(1, "L'image panorama est obligatoire."),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const hotspotSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Le nom du pin est obligatoire."),
  x: z.coerce.number({ message: "Placez le pin sur le modèle 3D." }),
  y: z.coerce.number({ message: "Placez le pin sur le modèle 3D." }),
  z: z.coerce.number({ message: "Placez le pin sur le modèle 3D." }),
  panoramaSceneId: z.string().trim().optional().nullable(),
});

export const propertySchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire."),
  address: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  postalCode: z.string().trim().optional().or(z.literal("")),
  price: z.coerce.number().int().positive().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  coverImageUrl: z.string().trim().optional().or(z.literal("")),
  modelUrl: z.string().trim().min(1, "Le modèle 3D est obligatoire."),
  modelType: z.nativeEnum(ModelType),
  visitType: z.nativeEnum(VisitType).default(VisitType.MODEL_3D),
  status: z.nativeEnum(PropertyStatus),
  catalogEnabled: z.boolean().optional().default(false),
  catalogTitle: z.string().trim().optional().or(z.literal("")),
  catalogSubtitle: z.string().trim().optional().or(z.literal("")),
  catalogPriceLabel: z.string().trim().optional().or(z.literal("")),
  catalogCityLabel: z.string().trim().optional().or(z.literal("")),
  catalogSurface: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  catalogRooms: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  catalogBedrooms: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  catalogLandSurface: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  catalogPropertyType: z.string().trim().optional().or(z.literal("")),
  catalogTags: z.array(z.string().trim().min(1)).optional().default([]),
  catalogFeatured: z.boolean().optional().default(false),
  catalogSortOrder: z.coerce.number().int().optional().default(0),
  externalUrl: z.string().trim().optional().or(z.literal("")),
  externalSource: z.string().trim().optional().or(z.literal("")),
  externalStatus: z.nativeEnum(ExternalStatus).optional(),
  panoramaScenes: z.array(panoramaSceneSchema).optional().default([]),
  hotspots: z.array(hotspotSchema).optional().default([]),
});

export const propertyUpdateSchema = propertySchema.partial().extend({
  name: z.string().trim().min(2, "Le nom est obligatoire.").optional(),
  panoramaScenes: z.array(panoramaSceneSchema).optional(),
  hotspots: z.array(hotspotSchema).optional(),
});

export type PropertyInput = z.infer<typeof propertySchema>;

export function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function extensionOf(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

export function modelTypeFromFilename(filename: string): ModelType | null {
  const ext = extensionOf(filename);

  if (ext === ".glb") return ModelType.GLB;
  if (ext === ".gltf") return ModelType.GLTF;
  if (ext === ".obj") return ModelType.OBJ;
  if (ext === ".zip") return ModelType.ZIP;

  return null;
}
