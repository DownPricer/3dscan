"use client";

import { VisitType } from "@prisma/client";
import type { HotspotPublic, PanoramaScenePublic } from "@/lib/hybrid-types";
import { HybridVisitViewer } from "@/components/viewer/hybrid-visit-viewer";
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
};

export function VisitViewer({
  visitType,
  modelUrl,
  modelType,
  propertyName,
  panoramaScenes,
  hotspots,
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

  return (
    <ModelViewer
      modelUrl={modelUrl}
      modelType={modelType}
      propertyName={propertyName}
    />
  );
}
