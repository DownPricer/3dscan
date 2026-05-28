"use client";

import { MatterportImportMode } from "@prisma/client";
import { Expand } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModelViewer } from "@/components/viewer/model-viewer";

type ModelType = "GLB" | "GLTF" | "OBJ" | "ZIP";

export type MatterportViewerProps = {
  propertyName: string;
  modelUrl: string;
  modelType: ModelType;
  matterportEmbedUrl?: string | null;
  matterportImportMode?: MatterportImportMode | null;
};

export function MatterportViewer({
  propertyName,
  modelUrl,
  modelType,
  matterportEmbedUrl,
  matterportImportMode,
}: MatterportViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function fullscreen() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  if (matterportImportMode === MatterportImportMode.MATTERPAK_OBJ) {
    return <ModelViewer modelUrl={modelUrl} modelType={modelType} propertyName={propertyName} />;
  }

  const src = matterportEmbedUrl?.trim() || null;

  if (!src) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-900">
        <h2 className="text-2xl font-black">Visite Matterport indisponible</h2>
        <p className="mt-3 leading-7">
          Aucun lien d’intégration Matterport n’est configuré pour ce bien.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-[2rem] bg-[#0b1720] shadow-2xl"
    >
      <div className="flex items-center justify-end gap-2 border-b border-white/10 bg-[#0b1720] p-3 text-white">
        <Button type="button" size="sm" variant="secondary" onClick={fullscreen}>
          <Expand size={15} /> Plein écran
        </Button>
      </div>

      <div className="relative h-[72vh] min-h-[520px] bg-black">
        {!loaded ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white/80">
              Chargement de la visite Matterport…
            </div>
          </div>
        ) : null}

        <iframe
          title={`Matterport — ${propertyName}`}
          src={src}
          className="absolute inset-0 h-full w-full"
          allow="fullscreen; xr-spatial-tracking"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}

