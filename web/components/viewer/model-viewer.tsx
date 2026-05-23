"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bounds,
  Center,
  ContactShadows,
  Environment,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Clipboard, Expand, RotateCcw, Share2, Sparkles } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  ACESFilmicToneMapping,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MTLLoader, OBJLoader } from "three-stdlib";
import { Button } from "@/components/ui/button";
import type { HotspotPublic } from "@/lib/hybrid-types";

type ModelType = "GLB" | "GLTF" | "OBJ" | "ZIP";
type ViewMode = "free" | "top";
type RenderStyle = "original" | "premium";

type ModelViewerProps = {
  modelUrl: string;
  modelType: ModelType;
  propertyName: string;
  hotspots?: HotspotPublic[];
  onHotspotClick?: (panoramaSceneId: string) => void;
};

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

      // Les textures couleur doivent être en sRGB pour éviter un rendu trop "blanc".
      if (anyMat.map) anyMat.map.colorSpace = SRGBColorSpace;
      if (anyMat.emissiveMap) anyMat.emissiveMap.colorSpace = SRGBColorSpace;

      anyMat.side = DoubleSide;
      anyMat.needsUpdate = true;
    });
  });
}

function applyPremiumMaterial(object: Object3D) {
  const baseColor = new Color("#d8d2c7");

  object.traverse((node) => {
    const mesh = node as unknown as Mesh;
    if (!mesh.isMesh) return;

    const materials = Array.isArray(mesh.material)
      ? (mesh.material as Material[])
      : [mesh.material as Material];

    const hasAnyTexture = materials.some((mat) => {
      const anyMat = mat as unknown as {
        map?: unknown;
        normalMap?: unknown;
        emissiveMap?: unknown;
        roughnessMap?: unknown;
        metalnessMap?: unknown;
        aoMap?: unknown;
      };
      return Boolean(
        anyMat?.map ||
          anyMat?.normalMap ||
          anyMat?.emissiveMap ||
          anyMat?.roughnessMap ||
          anyMat?.metalnessMap ||
          anyMat?.aoMap,
      );
    });

    // Si une texture est présente, on laisse le matériau original.
    if (hasAnyTexture) {
      materials.forEach((mat) => {
        const anyMat = mat as unknown as { side?: number };
        anyMat.side = DoubleSide;
      });
      return;
    }

    const premium = new MeshStandardMaterial({
      color: baseColor,
      roughness: 0.92,
      metalness: 0.02,
    });
    premium.side = DoubleSide;

    mesh.material = premium;
  });
}

function GltfModel({ url, style }: { url: string; style: RenderStyle }) {
  const gltf = useGLTF(url);
  const [object, setObject] = useState<Object3D | null>(null);

  useEffect(() => {
    const cloned = cloneWithClonedMaterials(gltf.scene);
    applyTextureColorSpace(cloned);
    if (style === "premium") applyPremiumMaterial(cloned);
    setObject(cloned);
  }, [gltf.scene, style]);

  if (!object) return null;
  return <primitive object={object} />;
}

function ObjModel({ url, style }: { url: string; style: RenderStyle }) {
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
      if (style === "premium") applyPremiumMaterial(cloned);
      if (!cancelled) setObject(cloned);
    }

    void loadObj().catch(() => {
      const fallbackLoader = new OBJLoader();
      void fallbackLoader.loadAsync(url).then((loadedObject) => {
        const cloned = cloneWithClonedMaterials(loadedObject);
        applyTextureColorSpace(cloned);
        if (style === "premium") applyPremiumMaterial(cloned);
        if (!cancelled) setObject(cloned);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [style, url]);

  if (!object) return null;

  return <primitive object={object} />;
}

function CameraRig({
  mode,
  resetSignal,
  controlsRef,
}: {
  mode: ViewMode;
  resetSignal: number;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (mode === "top") {
      camera.position.set(0, 12, 0.01);
      camera.lookAt(0, 0, 0);
      controlsRef.current?.target.set(0, 0, 0);
      controlsRef.current?.update();
      return;
    }

    camera.position.set(4, 3, 6);
    camera.lookAt(0, 0, 0);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  }, [camera, controlsRef, mode, resetSignal]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
}

function HotspotMarkers({
  hotspots,
  onHotspotClick,
}: {
  hotspots: HotspotPublic[];
  onHotspotClick?: (panoramaSceneId: string) => void;
}) {
  return (
    <>
      {hotspots.map((hotspot) => (
        <Html
          key={hotspot.id}
          position={[hotspot.x, hotspot.y, hotspot.z]}
          center
          distanceFactor={12}
          zIndexRange={[100, 0]}
        >
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-white bg-[#2f6f5e] px-3 py-1.5 text-xs font-bold text-white shadow-lg transition hover:scale-105 hover:bg-[#3d8a74]"
            onClick={(event) => {
              event.stopPropagation();
              if (hotspot.panoramaSceneId) onHotspotClick?.(hotspot.panoramaSceneId);
            }}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-white" />
            {hotspot.label}
          </button>
        </Html>
      ))}
    </>
  );
}

function Scene({
  modelUrl,
  modelType,
  viewMode,
  resetSignal,
  renderStyle,
  hotspots,
  onHotspotClick,
}: {
  modelUrl: string;
  modelType: Exclude<ModelType, "ZIP">;
  viewMode: ViewMode;
  resetSignal: number;
  renderStyle: RenderStyle;
  hotspots?: HotspotPublic[];
  onHotspotClick?: (panoramaSceneId: string) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 12, 6]} intensity={1.6} />
      <Environment preset="apartment" environmentIntensity={0.85} />
      <CameraRig mode={viewMode} resetSignal={resetSignal} controlsRef={controlsRef} />
      <Bounds fit clip observe margin={1.25}>
        <Center>
          {modelType === "OBJ" ? (
            <ObjModel url={modelUrl} style={renderStyle} />
          ) : (
            <GltfModel url={modelUrl} style={renderStyle} />
          )}
          {hotspots && hotspots.length > 0 ? (
            <HotspotMarkers hotspots={hotspots} onHotspotClick={onHotspotClick} />
          ) : null}
        </Center>
      </Bounds>
      <ContactShadows opacity={0.28} scale={16} blur={2.5} far={8} position={[0, -0.02, 0]} />
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

export function ModelViewer({
  modelUrl,
  modelType,
  propertyName,
  hotspots,
  onHotspotClick,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [renderStyle, setRenderStyle] = useState<RenderStyle>(
    modelType === "OBJ" ? "premium" : "original",
  );
  const [resetSignal, setResetSignal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [xrSupported, setXrSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const xr = navigator.xr;
    if (!xr) {
      setXrSupported(false);
      return;
    }

    void xr
      .isSessionSupported("immersive-vr")
      .then(setXrSupported)
      .catch(() => setXrSupported(false));
  }, []);

  async function fullscreen() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({
        title: propertyName,
        text: `Visite virtuelle 3D - ${propertyName}`,
        url: window.location.href,
      });
      return;
    }

    await copy();
  }

  if (modelType === "ZIP") {
    return (
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-amber-900">
        <h2 className="text-2xl font-black">Traitement ZIP non disponible dans ce MVP</h2>
        <p className="mt-3 leading-7">
          Le fichier ZIP a bien été enregistré, mais l'extraction OBJ/MTL/textures
          doit être branchée côté serveur avant affichage. Exportez le scan en
          .glb pour obtenir une visite web immédiate.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-hidden rounded-[2rem] bg-[#111827] shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0b1720] p-3 text-white">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "free" ? "default" : "secondary"}
            onClick={() => setViewMode("free")}
          >
            Vue libre
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "top" ? "default" : "secondary"}
            onClick={() => setViewMode("top")}
          >
            Vue du dessus
          </Button>
          <Button
            type="button"
            size="sm"
            variant={renderStyle === "premium" ? "default" : "secondary"}
            onClick={() => setRenderStyle((v) => (v === "premium" ? "original" : "premium"))}
          >
            {renderStyle === "premium" ? "Rendu premium" : "Rendu original"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setResetSignal((v) => v + 1)}>
            <RotateCcw size={15} /> Reset caméra
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={fullscreen}>
            <Expand size={15} /> Plein écran
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={copy}>
            <Clipboard size={15} /> {copied ? "Copié" : "Copier"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={share}>
            <Share2 size={15} /> Partager
          </Button>
        </div>
      </div>

      <div className="relative h-[64vh] min-h-[460px] touch-none">
        <Canvas
          camera={{ position: [4, 3, 6], fov: 45 }}
          shadows
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            (gl as unknown as { useLegacyLights?: boolean }).useLegacyLights = false;
          }}
          gl={{
            outputColorSpace: SRGBColorSpace,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.0,
          }}
        >
          <color attach="background" args={["#eef0ed"]} />
          <Suspense fallback={null}>
            <Scene
              modelUrl={modelUrl}
              modelType={modelType}
              viewMode={viewMode}
              resetSignal={resetSignal}
              renderStyle={renderStyle}
              hotspots={hotspots}
              onHotspotClick={onHotspotClick}
            />
          </Suspense>
        </Canvas>
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white">
          {hotspots && hotspots.length > 0
            ? "Cliquez sur un pin pour entrer dans la pièce en 360°"
            : "Touchez et faites glisser pour visiter"}
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#0b1720] px-4 py-3 text-sm text-white/75">
        <Sparkles size={16} className="text-[#a7d7c5]" />
        {modelType === "OBJ" ? (
          <span>
            Si tout est gris, uploade aussi les textures (.png/.jpg) référencées dans le .mtl.
          </span>
        ) : null}
        {xrSupported
          ? "Mode immersion disponible sur cet appareil via navigateur compatible WebXR."
          : "Mode immersion non disponible sur cet appareil."}
      </div>
    </div>
  );
}
