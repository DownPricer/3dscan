"use client";

import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Center,
  Environment,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { MapPin, RotateCcw } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  ACESFilmicToneMapping,
  DoubleSide,
  Group,
  Mesh,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MTLLoader, OBJLoader } from "three-stdlib";
import { Button } from "@/components/ui/button";
import type { HotspotInput } from "@/lib/hybrid-types";

/** Même marge que le viewer public (`model-viewer.tsx`). */
export const HOTSPOT_BOUNDS_MARGIN = 1.25;

type ModelType = "GLB" | "GLTF" | "OBJ" | "ZIP";

function roundCoord(value: number) {
  return Math.round(value * 10000) / 10000;
}

function cloneWithClonedMaterials(object: Object3D) {
  const cloned = object.clone(true);
  cloned.traverse((node) => {
    const mesh = node as unknown as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as Material | Material[];
    if (Array.isArray(material)) {
      mesh.material = material.map((mat) => mat.clone());
    } else if (material) {
      mesh.material = material.clone();
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return cloned;
}

function applyTextureColorSpace(object: Object3D) {
  object.traverse((node) => {
    const mesh = node as unknown as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? (mesh.material as Material[])
      : [mesh.material as Material];
    materials.forEach((mat) => {
      const anyMat = mat as unknown as {
        map?: Texture | null;
        emissiveMap?: Texture | null;
        needsUpdate?: boolean;
        side?: number;
      };
      if (anyMat.map) anyMat.map.colorSpace = SRGBColorSpace;
      if (anyMat.emissiveMap) anyMat.emissiveMap.colorSpace = SRGBColorSpace;
      anyMat.side = DoubleSide;
      anyMat.needsUpdate = true;
    });
  });
}

function GltfModel({
  url,
  onPointerDown,
}: {
  url: string;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const gltf = useGLTF(url);
  const [object, setObject] = useState<Object3D | null>(null);

  useEffect(() => {
    const cloned = cloneWithClonedMaterials(gltf.scene);
    applyTextureColorSpace(cloned);
    setObject(cloned);
  }, [gltf.scene]);

  if (!object) return null;
  return <primitive object={object} onPointerDown={onPointerDown} />;
}

function ObjModel({
  url,
  onPointerDown,
}: {
  url: string;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const [object, setObject] = useState<Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = url.slice(0, url.lastIndexOf("/") + 1);
    const objFilename = url.slice(url.lastIndexOf("/") + 1);

    async function loadObj() {
      const objText = await fetch(url).then((response) => response.text());
      const mtlFilename = objText.match(/^mtllib\s+(.+)$/im)?.[1]?.trim();
      const objLoader = new OBJLoader();

      if (mtlFilename) {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath(baseUrl);
        mtlLoader.setResourcePath(baseUrl);
        const materials = await mtlLoader.loadAsync(mtlFilename);
        materials.preload();
        objLoader.setMaterials(materials);
      }

      objLoader.setPath(baseUrl);
      const loadedObject = await objLoader.loadAsync(objFilename);
      const cloned = cloneWithClonedMaterials(loadedObject);
      applyTextureColorSpace(cloned);
      if (!cancelled) setObject(cloned);
    }

    void loadObj().catch(() => {
      const fallbackLoader = new OBJLoader();
      void fallbackLoader.loadAsync(url).then((loadedObject) => {
        const cloned = cloneWithClonedMaterials(loadedObject);
        applyTextureColorSpace(cloned);
        if (!cancelled) setObject(cloned);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!object) return null;
  return <primitive object={object} onPointerDown={onPointerDown} />;
}

function AdminHotspotPin({
  label,
  variant,
}: {
  label: string;
  variant: "existing" | "active" | "draft";
}) {
  const styles =
    variant === "active"
      ? "border-amber-300 bg-amber-500"
      : variant === "draft"
        ? "border-dashed border-amber-400 bg-amber-400/90 animate-pulse"
        : "border-white bg-[#2f6f5e]";

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-bold text-white shadow-lg ${styles}`}
    >
      <MapPin size={12} />
      {label}
    </div>
  );
}

function HotspotMarkersAdmin({
  hotspots,
  activeIndex,
  draftPosition,
  draftLabel,
}: {
  hotspots: HotspotInput[];
  activeIndex: number | null;
  draftPosition: { x: number; y: number; z: number } | null;
  draftLabel: string;
}) {
  return (
    <>
      {hotspots.map((hotspot, index) => {
        const isActive = activeIndex === index;

        return (
          <Html
            key={hotspot.id ?? `hs-${index}`}
            position={[hotspot.x, hotspot.y, hotspot.z]}
            center
            distanceFactor={12}
            zIndexRange={[100, 0]}
          >
            <AdminHotspotPin
              label={hotspot.label}
              variant={isActive ? "active" : "existing"}
            />
          </Html>
        );
      })}
      {draftPosition ? (
        <Html
          position={[draftPosition.x, draftPosition.y, draftPosition.z]}
          center
          distanceFactor={12}
          zIndexRange={[110, 0]}
        >
          <AdminHotspotPin label={draftLabel || "Nouveau pin"} variant="draft" />
        </Html>
      ) : null}
    </>
  );
}

function PlacementScene({
  modelUrl,
  modelType,
  hotspots,
  activeHotspotIndex,
  placementMode,
  draftPosition,
  coordSpaceRef,
  onMeshClick,
  resetSignal,
  controlsRef,
}: {
  modelUrl: string;
  modelType: Exclude<ModelType, "ZIP">;
  hotspots: HotspotInput[];
  activeHotspotIndex: number | null;
  placementMode: boolean;
  draftPosition: { x: number; y: number; z: number } | null;
  coordSpaceRef: MutableRefObject<Group | null>;
  onMeshClick: (position: { x: number; y: number; z: number }) => void;
  resetSignal: number;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!placementMode || !coordSpaceRef.current) return;
    event.stopPropagation();
    const local = coordSpaceRef.current.worldToLocal(event.point.clone());
    onMeshClick({
      x: roundCoord(local.x),
      y: roundCoord(local.y),
      z: roundCoord(local.z),
    });
  };

  useEffect(() => {
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  }, [controlsRef, resetSignal]);

  const activeLabel =
    activeHotspotIndex !== null ? hotspots[activeHotspotIndex]?.label ?? "" : "";

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 12, 6]} intensity={1.6} />
      <Environment preset="apartment" environmentIntensity={0.85} />
      <Bounds fit clip observe margin={HOTSPOT_BOUNDS_MARGIN}>
        <Center>
          <group ref={coordSpaceRef}>
            {modelType === "OBJ" ? (
              <ObjModel url={modelUrl} onPointerDown={handlePointerDown} />
            ) : (
              <GltfModel url={modelUrl} onPointerDown={handlePointerDown} />
            )}
            <HotspotMarkersAdmin
              hotspots={hotspots}
              activeIndex={activeHotspotIndex}
              draftPosition={draftPosition}
              draftLabel={activeLabel}
            />
          </group>
        </Center>
      </Bounds>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan
        enableZoom
        minDistance={0.8}
        maxDistance={80}
      />
    </>
  );
}

export type HotspotPlacementViewerProps = {
  modelUrl: string;
  modelType: ModelType;
  hotspots: HotspotInput[];
  activeHotspotIndex: number | null;
  placementMode: boolean;
  onPositionPlaced: (position: { x: number; y: number; z: number }) => void;
  onPlacementMiss?: () => void;
  onCancelPlacement?: () => void;
};

export function HotspotPlacementViewer({
  modelUrl,
  modelType,
  hotspots,
  activeHotspotIndex,
  placementMode,
  onPositionPlaced,
  onPlacementMiss,
  onCancelPlacement,
}: HotspotPlacementViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coordSpaceRef = useRef<Group | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [draftPosition, setDraftPosition] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);

  useEffect(() => {
    if (!placementMode) {
      setDraftPosition(null);
      return;
    }
    if (activeHotspotIndex !== null) {
      const hs = hotspots[activeHotspotIndex];
      if (hs && (hs.x !== 0 || hs.y !== 0 || hs.z !== 0)) {
        setDraftPosition({ x: hs.x, y: hs.y, z: hs.z });
      }
    }
  }, [placementMode, activeHotspotIndex, hotspots]);

  if (!modelUrl || modelType === "ZIP") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Ajoutez un modèle 3D (.glb recommandé) à l&apos;étape précédente pour placer les pins en
        cliquant sur le plan.
      </div>
    );
  }

  function handleMeshClick(position: { x: number; y: number; z: number }) {
    setDraftPosition(position);
    onPositionPlaced(position);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#0f2f3f]">Placement sur le modèle 3D</p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setResetSignal((v) => v + 1)}
          >
            <RotateCcw size={14} /> Reset caméra
          </Button>
          {placementMode && onCancelPlacement ? (
            <Button type="button" size="sm" variant="secondary" onClick={onCancelPlacement}>
              Annuler placement
            </Button>
          ) : null}
        </div>
      </div>

      {placementMode ? (
        <p className="rounded-lg bg-[#e8f4ef] px-3 py-2 text-sm font-medium text-[#2f6f5e]">
          Cliquez sur le modèle pour placer le pin
          {activeHotspotIndex !== null && hotspots[activeHotspotIndex]
            ? ` « ${hotspots[activeHotspotIndex].label} »`
            : ""}
          .
        </p>
      ) : (
        <p className="text-xs text-[#667085]">
          Sélectionnez une pièce dans la liste, puis cliquez sur le modèle pour placer le pin.
        </p>
      )}

      <div
        ref={containerRef}
        className={`overflow-hidden rounded-2xl bg-[#111827] shadow-lg ${
          placementMode ? "ring-2 ring-amber-400 ring-offset-2" : ""
        }`}
      >
        <div
          className={`relative h-[420px] min-h-[320px] touch-none ${
            placementMode ? "cursor-crosshair" : ""
          }`}
        >
          <Canvas
            camera={{ position: [4, 3, 6], fov: 45 }}
            shadows
            dpr={[1, 2]}
            onPointerMissed={() => {
              if (placementMode) onPlacementMiss?.();
            }}
            gl={{
              outputColorSpace: SRGBColorSpace,
              toneMapping: ACESFilmicToneMapping,
              toneMappingExposure: 1.0,
            }}
          >
            <color attach="background" args={["#eef0ed"]} />
            <Suspense fallback={null}>
              <PlacementScene
                modelUrl={modelUrl}
                modelType={modelType}
                hotspots={hotspots}
                activeHotspotIndex={activeHotspotIndex}
                placementMode={placementMode}
                draftPosition={draftPosition}
                coordSpaceRef={coordSpaceRef}
                onMeshClick={handleMeshClick}
                resetSignal={resetSignal}
                controlsRef={controlsRef}
              />
            </Suspense>
          </Canvas>
        </div>
      </div>
    </div>
  );
}
