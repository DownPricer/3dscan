"use client";

import { MatterportImportMode, VisitType } from "@prisma/client";
import type { HotspotPublic, PanoramaScenePublic } from "@/lib/hybrid-types";
import { HybridVisitViewer } from "@/components/viewer/hybrid-visit-viewer";
import { MatterportViewer } from "@/components/viewer/matterport-viewer";
import { ModelViewer } from "@/components/viewer/model-viewer";
import { PanoramaTourViewer } from "@/components/viewer/panorama-tour-viewer";

type ModelType = "GLB" | "GLTF" | "OBJ" | "ZIP";

type VisitViewerProps = {
  visitType: VisitType;
  modelUrl: string;
  modelType: ModelType;
  propertyName: string;
  panoramaScenes: PanoramaScenePublic[];
  hotspots: HotspotPublic[];
  matterportEmbedUrl?: string | null;
  matterportImportMode?: MatterportImportMode | null;
};

export function VisitViewer({
  visitType,
  modelUrl,
  modelType,
  propertyName,
  panoramaScenes,
  hotspots,
  matterportEmbedUrl,
  matterportImportMode,
}: VisitViewerProps) {
  if (visitType === VisitType.HYBRID_3D_360) {
    return (
      <HybridVisitViewer
        modelUrl={modelUrl}
        modelType={modelType}
        propertyName={propertyName}
        panoramaScenes={panoramaScenes}
        hotspots={hotspots}
      />
    );
  }

  if (visitType === VisitType.PANORAMA_360) {
    return <PanoramaTourViewer panoramaScenes={panoramaScenes} />;
  }

  if (visitType === VisitType.MATTERPORT) {
    return (
      <MatterportViewer
        propertyName={propertyName}
        modelUrl={modelUrl}
        modelType={modelType}
        matterportEmbedUrl={matterportEmbedUrl}
        matterportImportMode={matterportImportMode ?? MatterportImportMode.EMBED}
      />
    );
  }

  return (
    <ModelViewer
      modelUrl={modelUrl}
      modelType={modelType}
      propertyName={propertyName}
    />
  );
}
