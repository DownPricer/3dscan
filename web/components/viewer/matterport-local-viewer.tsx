"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ChevronLeft, ChevronRight, Expand, MapPin, RotateCcw } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BackSide, Mesh, SRGBColorSpace, TextureLoader, type Texture } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { OrbitControls } from "@react-three/drei";
import { Button } from "@/components/ui/button";

type MatterportLocalPanorama = {
  id: string;
  file: string | null;
  files?: string[];
  width: number | null;
  height: number | null;
  kind:
    | "panorama_360"
    | "equirectangular_candidate"
    | "cube"
    | "cube_face_candidate"
    | "cube_face_set_candidate";
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

function isPublicPanorama(panorama: MatterportLocalPanorama) {
  if (panorama.kind !== "panorama_360" && panorama.kind !== "equirectangular_candidate") return false;
  if (!panorama.file) return false;
  if (!panorama.width || !panorama.height) return false;
  return Math.abs(panorama.width / panorama.height - 2) < 0.03;
}

function PanoramaSphere({ imageUrl }: { imageUrl: string }) {
  const meshRef = useRef<Mesh>(null);
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    const loader = new TextureLoader();
    let cancelled = false;

    loader.load(imageUrl, (loaded) => {
      if (cancelled) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = SRGBColorSpace;
      setTexture((current) => {
        current?.dispose();
        return loaded;
      });
    });

    return () => {
      cancelled = true;
      setTexture((current) => {
        current?.dispose();
        return null;
      });
    };
  }, [imageUrl]);

  if (!texture) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[500, 64, 32]} />
      <meshBasicMaterial map={texture} side={BackSide} />
    </mesh>
  );
}

function PanoramaControls({
  resetSignal,
  controlsRef,
}: {
  resetSignal: number;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 0.1);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  }, [camera, controlsRef, resetSignal]);

  useFrame(() => controlsRef.current?.update());

  return null;
}

export function MatterportLocalViewer({
  manifestUrl,
  propertyName,
  auditReportUrl,
}: MatterportLocalViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const [manifest, setManifest] = useState<MatterportLocalManifest | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);
  const [isFading, setIsFading] = useState(false);

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

  const allManifestPanoramas = useMemo(() => manifest?.panoramas ?? [], [manifest]);
  const panoramas = useMemo(() => allManifestPanoramas.filter(isPublicPanorama), [allManifestPanoramas]);
  const hiddenCandidates = useMemo(
    () => allManifestPanoramas.filter((panorama) => !isPublicPanorama(panorama)),
    [allManifestPanoramas],
  );
  const activeIndexSafe = panoramas.length ? Math.min(activeIndex, panoramas.length - 1) : 0;
  const active = panoramas[activeIndexSafe] ?? null;
  const scanPointsWithPosition = useMemo(
    () =>
      manifest?.scanPoints.filter(
        (point) => point.position && panoramas.some((panorama) => panorama.id === point.panoramaId),
      ) ?? [],
    [manifest, panoramas],
  );
  const planPoints = useMemo(() => {
    if (scanPointsWithPosition.length > 0) {
      return scanPointsWithPosition.map((point) => {
        const index = panoramas.findIndex((panorama) => panorama.id === point.panoramaId);
        return {
          id: point.id,
          label: point.label,
          index,
          left: 50 + Math.max(-45, Math.min(45, (point.position?.x ?? 0) * 8)),
          top: 50 + Math.max(-45, Math.min(45, (point.position?.z ?? 0) * 8)),
        };
      });
    }

    const columns = Math.max(1, Math.ceil(Math.sqrt(panoramas.length)));
    const rows = Math.max(1, Math.ceil(panoramas.length / columns));
    return panoramas.map((panorama, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      return {
        id: panorama.id,
        label: `Vue ${index + 1}`,
        index,
        left: ((col + 1) / (columns + 1)) * 100,
        top: ((row + 1) / (rows + 1)) * 100,
      };
    });
  }, [panoramas, scanPointsWithPosition]);

  useEffect(
    () => () => {
      if (fadeTimeoutRef.current) window.clearTimeout(fadeTimeoutRef.current);
    },
    [],
  );

  function selectPanorama(index: number) {
    if (fadeTimeoutRef.current) window.clearTimeout(fadeTimeoutRef.current);
    setIsFading(true);
    fadeTimeoutRef.current = window.setTimeout(() => setIsFading(false), 220);
    setActiveIndex(index);
    setResetSignal((current) => current + 1);
  }

  async function fullscreen() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  function previous() {
    if (!panoramas.length) return;
    selectPanorama((activeIndexSafe - 1 + panoramas.length) % panoramas.length);
  }

  function next() {
    if (!panoramas.length) return;
    selectPanorama((activeIndexSafe + 1) % panoramas.length);
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
          Backup restaurable par Matterport, mais aucun vrai panorama 360 2:1 exploitable n’a été
          détecté pour le viewer local.
        </p>
        <p className="mt-3 text-sm">
          Groupes cube faces détectés : {manifest.summary?.cubeFaceSetCandidates ?? 0}. Ils restent
          dans l’audit et ne sont pas affichés comme panoramas.
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
          Mode local 360 extrait du backup. Le dollhouse 3D Matterport n’est pas reconstruit.
        </p>

        <div className="mt-5 space-y-2">
          {panoramas.map((panorama, index) => (
            <Button
              key={panorama.id}
              type="button"
              size="sm"
              variant={index === activeIndexSafe ? "default" : "secondary"}
              className="w-full justify-start"
              onClick={() => selectPanorama(index)}
            >
              <MapPin size={15} />
              Vue {index + 1}
              <span className="ml-auto text-xs opacity-70">
                360
              </span>
            </Button>
          ))}
        </div>

        {manifest.floorplans.length > 0 || planPoints.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-bold">Mini-plan local</p>
            <p className="mt-1 text-xs text-white/60">
              {scanPointsWithPosition.length > 0
                ? "Positions extraites à valider."
                : "positions non reconstruites automatiquement"}
            </p>
            <div
              className="relative mt-3 h-44 overflow-hidden rounded-xl bg-white/10 bg-cover bg-center"
              style={{
                backgroundImage: manifest.floorplans[0] ? `url("${manifest.floorplans[0]}")` : undefined,
              }}
            >
              <div className="absolute inset-0 bg-[#0b1720]/35" />
              {planPoints.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  className={`absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition ${
                    point.index === activeIndexSafe ? "bg-white" : "bg-[#a7d7c5]"
                  }`}
                  style={{
                    left: `${point.left}%`,
                    top: `${point.top}%`,
                  }}
                  title={point.label}
                  onClick={() => selectPanorama(point.index)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-1 text-xs text-white/60">
          <p>Panoramas 360 utilisables: {panoramas.length}</p>
          <p>Groupes cube faces non affichés: {manifest.summary?.cubeFaceSetCandidates ?? 0}</p>
          <p>Scan points: {manifest.summary?.scanPointsFound ?? 0}</p>
          <p>Plan détecté: {manifest.summary?.hasFloorplan ? "oui" : "non"}</p>
          <p>Dollhouse 3D reconstruit: non</p>
        </div>

        {hiddenCandidates.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3">
            <button
              type="button"
              className="text-left text-xs font-bold uppercase tracking-wider text-white/70"
              onClick={() => setShowCandidates((current) => !current)}
            >
              {showCandidates ? "Masquer" : "Afficher"} les images candidates
            </button>
            {showCandidates ? (
              <div className="mt-3 space-y-2 text-xs text-white/60">
                {hiddenCandidates.map((candidate) => (
                  <p key={candidate.id}>
                    {candidate.kind} · {candidate.width ?? "?"}x{candidate.height ?? "?"}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

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
              Vue {activeIndexSafe + 1} / {panoramas.length}
            </p>
            <p className="font-bold">Panorama 360 local</p>
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

        <div className="relative min-h-0 flex-1 touch-none bg-black">
          {active.file ? (
            <Canvas camera={{ position: [0, 0, 0.1], fov: 75 }}>
              <Suspense fallback={null}>
                <PanoramaSphere imageUrl={active.file} />
                <PanoramaControls controlsRef={controlsRef} resetSignal={resetSignal} />
                <OrbitControls
                  ref={controlsRef}
                  makeDefault
                  enableZoom
                  enablePan={false}
                  enableDamping
                  rotateSpeed={-0.35}
                  minDistance={0.1}
                  maxDistance={2}
                />
              </Suspense>
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-white">
              Cette vue 360 n’a pas d’image exploitable.
            </div>
          )}
          <div
            className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${
              isFading ? "opacity-55" : "opacity-0"
            }`}
          />
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white">
            Glissez pour regarder autour · pincez pour zoomer
          </div>
          <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-black/65 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/80">
            mode local 360 extrait du backup
          </div>
        </div>
      </section>
    </div>
  );
}
