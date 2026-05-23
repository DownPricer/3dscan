"use client";

import { useState } from "react";
import { ChevronDown, MapPin, Trash2 } from "lucide-react";
import { HotspotPlacementViewer } from "@/components/admin/hotspot-placement-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HotspotInput, PanoramaSceneInput } from "@/lib/hybrid-types";

export function tempSceneId(index: number, id?: string) {
  return id ?? `scene-${index}`;
}

export function isHotspotPlaced(hotspot: HotspotInput | undefined) {
  if (!hotspot) return false;
  return hotspot.x !== 0 || hotspot.y !== 0 || hotspot.z !== 0;
}

type HotspotPlacementStepProps = {
  modelUrl: string;
  modelType: "GLB" | "GLTF" | "OBJ" | "ZIP";
  panoramaScenes: PanoramaSceneInput[];
  hotspots: HotspotInput[];
  onHotspotsChange: (hotspots: HotspotInput[]) => void;
};

export function HotspotPlacementStep({
  modelUrl,
  modelType,
  panoramaScenes,
  hotspots,
  onHotspotsChange,
}: HotspotPlacementStepProps) {
  const [activeSceneIndex, setActiveSceneIndex] = useState<number | null>(
    panoramaScenes.length > 0 ? 0 : null,
  );
  const [placementFeedback, setPlacementFeedback] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const scenesWithImage = panoramaScenes.filter((s) => s.imageUrl?.trim());

  function getHotspotIndexForScene(sceneId: string) {
    return hotspots.findIndex((h) => h.panoramaSceneId === sceneId);
  }

  function getHotspotForScene(sceneIndex: number) {
    const sceneId = tempSceneId(sceneIndex, panoramaScenes[sceneIndex]?.id);
    const idx = getHotspotIndexForScene(sceneId);
    return idx >= 0 ? hotspots[idx] : undefined;
  }

  function upsertHotspotForScene(
    sceneIndex: number,
    position: { x: number; y: number; z: number },
  ) {
    const scene = panoramaScenes[sceneIndex];
    if (!scene) return;
    const sceneId = tempSceneId(sceneIndex, scene.id);
    const existingIndex = getHotspotIndexForScene(sceneId);

    if (existingIndex >= 0) {
      onHotspotsChange(
        hotspots.map((h, i) =>
          i === existingIndex
            ? { ...h, ...position, label: scene.name, panoramaSceneId: sceneId }
            : h,
        ),
      );
    } else {
      onHotspotsChange([
        ...hotspots,
        {
          label: scene.name,
          x: position.x,
          y: position.y,
          z: position.z,
          panoramaSceneId: sceneId,
        },
      ]);
    }
    setPlacementFeedback(`Pin « ${scene.name} » placé sur le modèle.`);
  }

  function removePinForScene(sceneIndex: number) {
    const sceneId = tempSceneId(sceneIndex, panoramaScenes[sceneIndex]?.id);
    onHotspotsChange(hotspots.filter((h) => h.panoramaSceneId !== sceneId));
    setPlacementFeedback(null);
  }

  function updateHotspotCoords(
    sceneIndex: number,
    patch: Partial<Pick<HotspotInput, "x" | "y" | "z">>,
  ) {
    const sceneId = tempSceneId(sceneIndex, panoramaScenes[sceneIndex]?.id);
    const idx = getHotspotIndexForScene(sceneId);
    if (idx < 0) return;
    onHotspotsChange(
      hotspots.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
    );
  }

  const activeHotspotIndex =
    activeSceneIndex !== null ? getHotspotIndexForScene(tempSceneId(activeSceneIndex, panoramaScenes[activeSceneIndex]?.id)) : -1;

  const placementHotspotIndex = activeHotspotIndex >= 0 ? activeHotspotIndex : null;

  function handlePositionPlaced(position: { x: number; y: number; z: number }) {
    if (activeSceneIndex === null) return;
    upsertHotspotForScene(activeSceneIndex, position);
    const nextWithoutPin = panoramaScenes.findIndex(
      (scene, i) => scene.imageUrl?.trim() && !isHotspotPlaced(getHotspotForScene(i)),
    );
    if (nextWithoutPin >= 0 && nextWithoutPin !== activeSceneIndex) {
      setActiveSceneIndex(nextWithoutPin);
    }
  }

  if (scenesWithImage.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        Ajoutez au moins une pièce avec sa photo 360 à l&apos;étape précédente, puis revenez placer les
        pins.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(220px,280px)_1fr]">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#0f2f3f]">Pièces à placer</p>
        <ol className="space-y-2">
          {panoramaScenes.map((scene, index) => {
            if (!scene.imageUrl?.trim()) return null;
            const placed = isHotspotPlaced(getHotspotForScene(index));
            const isActive = activeSceneIndex === index;

            return (
              <li key={tempSceneId(index, scene.id)}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSceneIndex(index);
                    setPlacementFeedback(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    isActive
                      ? "border-[#2f6f5e] bg-[#e8f4ef] ring-1 ring-[#2f6f5e]/30"
                      : placed
                        ? "border-emerald-200 bg-emerald-50/80"
                        : "border-amber-200 bg-amber-50/60"
                  }`}
                >
                  <MapPin
                    size={16}
                    className={placed ? "text-emerald-600" : "text-amber-600"}
                  />
                  <span className="flex-1 font-semibold text-[#0f2f3f]">{scene.name}</span>
                  <span
                    className={`text-xs font-bold ${placed ? "text-emerald-700" : "text-amber-700"}`}
                  >
                    {placed ? "Pin OK" : "À placer"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="text-xs leading-5 text-[#667085]">
          1. Cliquez une pièce dans la liste — 2. Cliquez sur le modèle 3D à droite pour placer le pin.
        </p>
      </div>

      <div className="space-y-4 min-w-0">
        {activeSceneIndex !== null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPlacementFeedback(null)}
            >
              Replacer le pin
            </Button>
            {isHotspotPlaced(getHotspotForScene(activeSceneIndex)) ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => removePinForScene(activeSceneIndex)}
              >
                <Trash2 size={14} /> Supprimer le pin
              </Button>
            ) : null}
          </div>
        ) : null}

        <HotspotPlacementViewer
          modelUrl={modelUrl}
          modelType={modelType}
          hotspots={hotspots}
          activeHotspotIndex={placementHotspotIndex}
          placementMode={activeSceneIndex !== null}
          onPositionPlaced={handlePositionPlaced}
          onPlacementMiss={() =>
            setPlacementFeedback("Cliquez sur une surface du modèle (sol, mur, meuble).")
          }
          onCancelPlacement={() => setActiveSceneIndex(null)}
        />

        {placementFeedback ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              placementFeedback.includes("Cliquez")
                ? "bg-amber-50 text-amber-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {placementFeedback}
          </p>
        ) : null}

        <details
          className="rounded-xl border border-[#e4e7ec] bg-white"
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-[#0f2f3f]">
            Coordonnées avancées
            <ChevronDown
              size={16}
              className={`transition ${advancedOpen ? "rotate-180" : ""}`}
            />
          </summary>
          <div className="space-y-3 border-t border-[#e4e7ec] px-4 py-4">
            <p className="text-xs text-[#667085]">
              Réservé aux ajustements précis. En usage normal, placez les pins en cliquant sur le
              modèle.
            </p>
            {activeSceneIndex !== null && isHotspotPlaced(getHotspotForScene(activeSceneIndex)) ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {(["x", "y", "z"] as const).map((axis) => {
                  const hs = getHotspotForScene(activeSceneIndex)!;
                  return (
                    <div key={axis} className="space-y-1">
                      <Label className="uppercase">{axis}</Label>
                      <Input
                        type="number"
                        step="any"
                        value={hs[axis]}
                        onChange={(e) =>
                          updateHotspotCoords(activeSceneIndex, {
                            [axis]: Number.parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-amber-700">Sélectionnez une pièce avec pin placé.</p>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
