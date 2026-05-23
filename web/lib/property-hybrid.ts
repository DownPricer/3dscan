import type { Hotspot, PanoramaScene, Prisma } from "@prisma/client";
import type { HotspotInput, PanoramaSceneInput } from "@/lib/hybrid-types";

export const propertyWithHybridInclude = {
  panoramaScenes: { orderBy: { sortOrder: "asc" as const } },
  hotspots: true,
} satisfies Prisma.PropertyInclude;

export type PropertyWithHybrid = Prisma.PropertyGetPayload<{
  include: typeof propertyWithHybridInclude;
}>;

export function syncPanoramaScenes(
  scenes: PanoramaSceneInput[],
): Prisma.PanoramaSceneCreateWithoutPropertyInput[] {
  return scenes.map((scene, index) => ({
    name: scene.name,
    imageUrl: scene.imageUrl,
    sortOrder: scene.sortOrder ?? index,
  }));
}

export function buildHotspotCreates(
  hotspots: HotspotInput[],
  sceneIdMap: Map<string, string>,
): Prisma.HotspotCreateWithoutPropertyInput[] {
  return hotspots.map((hotspot) => ({
    label: hotspot.label,
    x: hotspot.x,
    y: hotspot.y,
    z: hotspot.z,
    panoramaScene:
      hotspot.panoramaSceneId && sceneIdMap.has(hotspot.panoramaSceneId)
        ? { connect: { id: sceneIdMap.get(hotspot.panoramaSceneId)! } }
        : undefined,
  }));
}

/** Map client temp IDs (scene-0) to DB IDs after create. */
export function mapSceneIds(
  inputScenes: PanoramaSceneInput[],
  createdScenes: PanoramaScene[],
): Map<string, string> {
  const map = new Map<string, string>();
  inputScenes.forEach((input, index) => {
    const created = createdScenes[index];
    if (!created) return;
    if (input.id) map.set(input.id, created.id);
    map.set(`scene-${index}`, created.id);
  });
  return map;
}

export function resolveHotspotSceneId(
  panoramaSceneId: string | null | undefined,
  sceneIdMap: Map<string, string>,
): string | null {
  if (!panoramaSceneId) return null;
  return sceneIdMap.get(panoramaSceneId) ?? panoramaSceneId;
}

export async function replaceHybridData(
  propertyId: string,
  scenes: PanoramaSceneInput[],
  hotspots: HotspotInput[],
  tx: Prisma.TransactionClient,
) {
  await tx.hotspot.deleteMany({ where: { propertyId } });
  await tx.panoramaScene.deleteMany({ where: { propertyId } });

  const createdScenes: PanoramaScene[] = [];
  for (const [index, scene] of scenes.entries()) {
    const created = await tx.panoramaScene.create({
      data: {
        propertyId,
        name: scene.name,
        imageUrl: scene.imageUrl,
        sortOrder: scene.sortOrder ?? index,
      },
    });
    createdScenes.push(created);
  }

  const sceneIdMap = mapSceneIds(scenes, createdScenes);

  for (const hotspot of hotspots) {
    const panoramaSceneId = resolveHotspotSceneId(hotspot.panoramaSceneId, sceneIdMap);
    await tx.hotspot.create({
      data: {
        propertyId,
        label: hotspot.label,
        x: hotspot.x,
        y: hotspot.y,
        z: hotspot.z,
        panoramaSceneId,
      },
    });
  }
}

export function toPublicHybridData(property: PropertyWithHybrid) {
  return {
    panoramaScenes: property.panoramaScenes.map((s) => ({
      id: s.id,
      name: s.name,
      imageUrl: s.imageUrl,
      sortOrder: s.sortOrder,
    })),
    hotspots: property.hotspots.map((h: Hotspot) => ({
      id: h.id,
      label: h.label,
      x: h.x,
      y: h.y,
      z: h.z,
      panoramaSceneId: h.panoramaSceneId,
    })),
  };
}
