"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { ChevronLeft, ChevronRight, Expand, MapPin, RotateCcw } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CubeTextureLoader, SRGBColorSpace } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { OrbitControls } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { PanoramaViewer } from "@/components/viewer/panorama-viewer";

type MatterportLocalPanorama = {
  id: string;
  file: string | null;
  files?: string[];
  width: number | null;
  height: number | null;
  kind: "equirectangular_candidate" | "cube_face_set_candidate";
  position: { x: number; y: number; z: number } | null;
  rotation: { yaw?: number; pitch?: number; roll?: number; quaternion?: number[] } | null;
};

type MatterportLocalManifest = {
  type: "MATTERPORT_BACKUP_LOCAL";
  source: "backup";
  panoramas: MatterportLocalPanorama[];
  scanPoints: Array<{
    id: string;
    panoramaId: string | null;
    label: string;
    position: { x: number; y: number; z: number } | null;
  }>;
  floorplans: string[];
  summary?: {
    panoramaCandidates: number;
    cubeFaceSetCandidates: number;
    scanPointsFound: number;
    hasFloorplan: boolean;
    hasMesh: boolean;
  };
};

type MatterportLocalViewerProps = {
  manifestUrl: string;
  propertyName: string;
  auditReportUrl?: string | null;
};

function CubeBackground({
  files,
  resetSignal,
}: {
  files: string[];
  resetSignal: number;
}) {
  const texture = useLoader(CubeTextureLoader, files);
  const { scene, camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    scene.background = texture;
    return () => {
      scene.background = null;
    };
  }, [scene, texture]);

  useEffect(() => {
    camera.position.set(0, 0, 0.1);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  }, [camera, resetSignal]);

  useFrame(() => controlsRef.current?.update());

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableZoom
      enablePan={false}
      rotateSpeed={-0.35}
      minDistance={0.1}
      maxDistance={2}
    />
  );
}

export function MatterportLocalViewer({
  manifestUrl,
  propertyName,
  auditReportUrl,
}: MatterportLocalViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [manifest, setManifest] = useState<MatterportLocalManifest | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(manifestUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Manifest local introuvable.");
        return response.json() as Promise<MatterportLocalManifest>;
      })
      .then((data) => {
        if (!cancelled) setManifest(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Manifest local illisible.");
      });
    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  const panoramas = manifest?.panoramas ?? [];
  const active = panoramas[activeIndex] ?? null;
  const scanPointsWithPosition = useMemo(
    () => manifest?.scanPoints.filter((point) => point.position) ?? [],
    [manifest],
  );

  async function fullscreen() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  function previous() {
    setActiveIndex((current) => (panoramas.length ? (current - 1 + panoramas.length) % panoramas.length : 0));
  }

  function next() {
    setActiveIndex((current) => (panoramas.length ? (current + 1) % panoramas.length : 0));
  }

  if (error) {
    return (
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-amber-900">
        <h2 className="text-2xl font-black">Visite locale indisponible</h2>
        <p className="mt-3 leading-7">{error}</p>
        {auditReportUrl ? (
          <a className="mt-4 inline-block font-bold underline" href={auditReportUrl} target="_blank">
            Télécharger le rapport d’audit
          </a>
        ) : null}
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="rounded-[2rem] bg-[#0b1720] p-8 text-white">
        Chargement de la visite locale Matterport-like…
      </div>
    );
  }

  if (!active) {
    return (
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-amber-900">
        <h2 className="text-2xl font-black">Backup non convertible localement</h2>
        <p className="mt-3 leading-7">
          Backup restaurable par Matterport, mais aucune vue 360 exploitable n’a encore été
          reconstruite localement.
        </p>
        {auditReportUrl ? (
          <a className="mt-4 inline-block font-bold underline" href={auditReportUrl} target="_blank">
            Télécharger le rapport d’audit
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="grid overflow-hidden rounded-[2rem] bg-[#0b1720] shadow-2xl lg:grid-cols-[280px_1fr]"
    >
      <aside className="order-2 border-t border-white/10 bg-[#0b1720] p-4 text-white lg:order-1 lg:border-r lg:border-t-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a7d7c5]">
          Visite locale Matterport-like
        </p>
        <h2 className="mt-2 text-xl font-black">{propertyName}</h2>
        <p className="mt-3 text-sm leading-6 text-white/70">
          Rendu local partiel depuis le backup. Le dollhouse Matterport complet reste propriétaire.
        </p>

        <div className="mt-5 space-y-2">
          {panoramas.map((panorama, index) => (
            <Button
              key={panorama.id}
              type="button"
              size="sm"
              variant={index === activeIndex ? "default" : "secondary"}
              className="w-full justify-start"
              onClick={() => setActiveIndex(index)}
            >
              <MapPin size={15} />
              Vue {index + 1}
              <span className="ml-auto text-xs opacity-70">
                {panorama.kind === "cube_face_set_candidate" ? "cube" : "360"}
              </span>
            </Button>
          ))}
        </div>

        {scanPointsWithPosition.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-bold">Plan 2D approximatif</p>
            <div className="relative mt-3 h-44 rounded-xl bg-white/10">
              {scanPointsWithPosition.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  className="absolute h-3 w-3 rounded-full bg-[#a7d7c5] ring-2 ring-white"
                  style={{
                    left: `${50 + Math.max(-45, Math.min(45, (point.position?.x ?? 0) * 8))}%`,
                    top: `${50 + Math.max(-45, Math.min(45, (point.position?.z ?? 0) * 8))}%`,
                  }}
                  title={point.label}
                  onClick={() => {
                    const index = panoramas.findIndex((p) => p.id === point.panoramaId);
                    if (index >= 0) setActiveIndex(index);
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-1 text-xs text-white/60">
          <p>Panoramas 2:1: {manifest.summary?.panoramaCandidates ?? 0}</p>
          <p>Groupes cube faces: {manifest.summary?.cubeFaceSetCandidates ?? 0}</p>
          <p>Scan points: {manifest.summary?.scanPointsFound ?? 0}</p>
          <p>Plan détecté: {manifest.summary?.hasFloorplan ? "oui" : "non"}</p>
          <p>Mesh détecté: {manifest.summary?.hasMesh ? "oui" : "non"}</p>
        </div>

        {auditReportUrl ? (
          <a className="mt-5 block text-sm font-bold text-[#a7d7c5] underline" href={auditReportUrl} target="_blank">
            Télécharger le rapport d’audit
          </a>
        ) : null}
      </aside>

      <section className="order-1 flex min-h-[560px] flex-col lg:order-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3 text-white">
          <div>
            <p className="text-xs font-semibold text-white/60">
              Vue {activeIndex + 1} / {panoramas.length}
            </p>
            <p className="font-bold">
              {active.kind === "cube_face_set_candidate" ? "Panorama cube faces candidat" : "Panorama 360 candidat"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={previous}>
              <ChevronLeft size={15} /> Précédent
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={next}>
              Suivant <ChevronRight size={15} />
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setResetSignal((v) => v + 1)}>
              <RotateCcw size={15} /> Reset
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={fullscreen}>
              <Expand size={15} /> Plein écran
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-black">
          {active.kind === "equirectangular_candidate" && active.file ? (
            <PanoramaViewer
              key={active.id}
              imageUrl={active.file}
              roomName={`Vue ${activeIndex + 1}`}
              mode="inline"
            />
          ) : active.files?.length === 6 ? (
            <Canvas camera={{ position: [0, 0, 0.1], fov: 75 }}>
              <Suspense fallback={null}>
                <CubeBackground key={active.id} files={active.files} resetSignal={resetSignal} />
              </Suspense>
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-white">
              Cette vue candidate n’a pas assez d’images pour être affichée en 360.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
