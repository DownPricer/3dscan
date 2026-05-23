"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Expand, RotateCcw, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { BackSide, Mesh, SRGBColorSpace, TextureLoader, type Texture } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { OrbitControls } from "@react-three/drei";
import { Button } from "@/components/ui/button";

type PanoramaViewerProps = {
  imageUrl: string;
  roomName: string;
  onClose?: () => void;
  onSwitchRoom?: (sceneId: string) => void;
  otherRooms?: { id: string; name: string }[];
  mode?: "overlay" | "inline";
};

function PanoramaSphere({ imageUrl }: { imageUrl: string }) {
  const meshRef = useRef<Mesh>(null);
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    const loader = new TextureLoader();
    let cancelled = false;

    loader.load(imageUrl, (loaded) => {
      if (cancelled) return;
      loaded.colorSpace = SRGBColorSpace;
      setTexture(loaded);
    });

    return () => {
      cancelled = true;
      texture?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  controlsRef,
  resetSignal,
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  resetSignal: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 0.1);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  }, [camera, controlsRef, resetSignal]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
}

export function PanoramaViewer({
  imageUrl,
  roomName,
  onClose,
  onSwitchRoom,
  otherRooms = [],
  mode = "overlay",
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  async function fullscreen() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  const containerClass =
    mode === "overlay"
      ? "fixed inset-0 z-50 flex flex-col bg-[#0b1720]"
      : "flex h-[64vh] min-h-[460px] flex-col overflow-hidden rounded-[2rem] bg-[#0b1720] shadow-2xl";

  return (
    <div
      ref={containerRef}
      className={containerClass}
      role="dialog"
      aria-label={`Panorama 360 — ${roomName}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a7d7c5]">
            Vue immersive
          </p>
          <h2 className="text-lg font-black">{roomName}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setResetSignal((v) => v + 1)}
          >
            <RotateCcw size={15} /> Reset
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={fullscreen}>
            <Expand size={15} /> Plein écran
          </Button>
          {onClose ? (
            <Button type="button" size="sm" variant="default" onClick={onClose}>
              <X size={15} /> {mode === "overlay" ? "Retour vue 3D" : "Fermer"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 touch-none">
        <Canvas camera={{ position: [0, 0, 0.1], fov: 75 }}>
          <Suspense fallback={null}>
            <PanoramaSphere imageUrl={imageUrl} />
            <PanoramaControls controlsRef={controlsRef} resetSignal={resetSignal} />
            <OrbitControls
              ref={controlsRef}
              makeDefault
              enableZoom
              enablePan={false}
              rotateSpeed={-0.35}
              minDistance={0.1}
              maxDistance={2}
            />
          </Suspense>
        </Canvas>
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white">
          Glissez pour regarder autour — pincez pour zoomer
        </div>
      </div>

      {otherRooms.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-t border-white/10 p-3">
          <span className="w-full text-xs font-semibold uppercase tracking-wider text-white/60">
            Autres pièces
          </span>
          {otherRooms.map((room) => (
            <Button
              key={room.id}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onSwitchRoom?.(room.id)}
            >
              {room.name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
