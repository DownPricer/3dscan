"use client";

import { useMemo, useState } from "react";
import { Home, MapPin, Sparkles } from "lucide-react";
import type { HotspotPublic, PanoramaScenePublic } from "@/lib/hybrid-types";
import { ModelViewer } from "@/components/viewer/model-viewer";
import { PanoramaViewer } from "@/components/viewer/panorama-viewer";
import { Button } from "@/components/ui/button";

type ModelType = "GLB" | "GLTF" | "OBJ" | "ZIP";

type HybridVisitViewerProps = {
  modelUrl: string;
  modelType: ModelType;
  propertyName: string;
  panoramaScenes: PanoramaScenePublic[];
  hotspots: HotspotPublic[];
};

type ViewTab = "3d" | "immersive";

export function HybridVisitViewer({
  modelUrl,
  modelType,
  propertyName,
  panoramaScenes,
  hotspots,
}: HybridVisitViewerProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("3d");
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const sceneById = useMemo(
    () => new Map(panoramaScenes.map((scene) => [scene.id, scene])),
    [panoramaScenes],
  );

  const activeScene = activeSceneId ? sceneById.get(activeSceneId) : null;

  function openScene(sceneId: string) {
    if (!sceneById.has(sceneId)) return;
    setActiveSceneId(sceneId);
    setActiveTab("immersive");
  }

  function closePanorama() {
    setActiveSceneId(null);
    setActiveTab("3d");
  }

  const linkedHotspots = hotspots.filter(
    (h) => h.panoramaSceneId && sceneById.has(h.panoramaSceneId),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={activeTab === "3d" && !activeScene ? "default" : "secondary"}
          onClick={() => {
            setActiveSceneId(null);
            setActiveTab("3d");
          }}
        >
          <Home size={15} /> Vue 3D
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeTab === "immersive" ? "default" : "secondary"}
          onClick={() => {
            if (panoramaScenes[0]) openScene(panoramaScenes[0].id);
          }}
          disabled={panoramaScenes.length === 0}
        >
          <Sparkles size={15} /> Vue immersive
        </Button>
      </div>

      {panoramaScenes.length > 0 ? (
        <div className="premium-card flex flex-wrap gap-2 rounded-2xl p-4">
          <span className="flex w-full items-center gap-2 text-sm font-semibold text-[#0f2f3f]">
            <MapPin size={16} className="text-[#2f6f5e]" />
            Pièces disponibles
          </span>
          {panoramaScenes.map((scene) => (
            <Button
              key={scene.id}
              type="button"
              size="sm"
              variant={activeSceneId === scene.id ? "default" : "secondary"}
              onClick={() => openScene(scene.id)}
            >
              {scene.name}
            </Button>
          ))}
        </div>
      ) : null}

      {activeTab === "3d" && !activeScene ? (
        <ModelViewer
          modelUrl={modelUrl}
          modelType={modelType}
          propertyName={propertyName}
          hotspots={linkedHotspots}
          onHotspotClick={openScene}
        />
      ) : null}

      {activeScene ? (
        <PanoramaViewer
          imageUrl={activeScene.imageUrl}
          roomName={activeScene.name}
          onClose={closePanorama}
          onSwitchRoom={openScene}
          otherRooms={panoramaScenes.filter((s) => s.id !== activeScene.id)}
        />
      ) : null}
    </div>
  );
}
