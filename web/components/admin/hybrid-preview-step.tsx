"use client";

import { ExternalLink } from "lucide-react";
import { HybridVisitViewer } from "@/components/viewer/hybrid-visit-viewer";
import { Button } from "@/components/ui/button";
import type { HotspotInput, PanoramaSceneInput } from "@/lib/hybrid-types";
import { tempSceneId } from "@/components/admin/hotspot-placement-step";

type HybridPreviewStepProps = {
  propertyName: string;
  modelUrl: string;
  modelType: "GLB" | "GLTF" | "OBJ" | "ZIP";
  panoramaScenes: PanoramaSceneInput[];
  hotspots: HotspotInput[];
  publicUrl?: string | null;
};

export function HybridPreviewStep({
  propertyName,
  modelUrl,
  modelType,
  panoramaScenes,
  hotspots,
  publicUrl,
}: HybridPreviewStepProps) {
  const publicScenes = panoramaScenes
    .filter((s) => s.imageUrl?.trim())
    .map((scene, index) => ({
      id: tempSceneId(index, scene.id),
      name: scene.name,
      imageUrl: scene.imageUrl,
      sortOrder: scene.sortOrder ?? index,
    }));

  const publicHotspots = hotspots
    .filter((h) => h.panoramaSceneId && isPlaced(h))
    .map((h, index) => ({
      id: h.id ?? `preview-hs-${index}`,
      label: h.label,
      x: h.x,
      y: h.y,
      z: h.z,
      panoramaSceneId: h.panoramaSceneId ?? null,
    }));

  if (!modelUrl) {
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        Ajoutez un modèle 3D pour prévisualiser la visite.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#667085]">
        Aperçu identique à la visite publique : modèle 3D, pins, clic vers panoramas 360.
      </p>
      <HybridVisitViewer
        modelUrl={modelUrl}
        modelType={modelType}
        propertyName={propertyName || "Aperçu"}
        panoramaScenes={publicScenes}
        hotspots={publicHotspots}
      />
      {publicUrl ? (
        <Button type="button" variant="secondary" size="sm" asChild>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} />
            Ouvrir la visite publique dans un nouvel onglet
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function isPlaced(h: HotspotInput) {
  return h.x !== 0 || h.y !== 0 || h.z !== 0;
}
