"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import type { PanoramaScenePublic } from "@/lib/hybrid-types";
import { PanoramaViewer } from "@/components/viewer/panorama-viewer";
import { Button } from "@/components/ui/button";

type PanoramaTourViewerProps = {
  panoramaScenes: PanoramaScenePublic[];
};

export function PanoramaTourViewer({ panoramaScenes }: PanoramaTourViewerProps) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    panoramaScenes[0]?.id ?? null,
  );

  const activeScene = panoramaScenes.find((s) => s.id === activeSceneId);

  if (panoramaScenes.length === 0) {
    return (
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-amber-900">
        <h2 className="text-2xl font-black">Visite 360 non configurée</h2>
        <p className="mt-3 leading-7">
          Ajoutez des panoramas 360 dans l&apos;admin pour activer cette visite.
        </p>
      </div>
    );
  }

  if (!activeScene) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="premium-card flex flex-wrap gap-2 rounded-2xl p-4">
        <span className="flex w-full items-center gap-2 text-sm font-semibold text-[#0f2f3f]">
          <MapPin size={16} className="text-[#2f6f5e]" />
          Pièces
        </span>
        {panoramaScenes.map((scene) => (
          <Button
            key={scene.id}
            type="button"
            size="sm"
            variant={activeSceneId === scene.id ? "default" : "secondary"}
            onClick={() => setActiveSceneId(scene.id)}
          >
            {scene.name}
          </Button>
        ))}
      </div>

      <PanoramaViewer
        imageUrl={activeScene.imageUrl}
        roomName={activeScene.name}
        mode="inline"
        onSwitchRoom={setActiveSceneId}
        otherRooms={panoramaScenes.filter((s) => s.id !== activeScene.id)}
      />
    </div>
  );
}
