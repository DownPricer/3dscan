"use client";

import { VisitType } from "@prisma/client";
import {
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  Home,
  Layers,
  MapPin,
  Sparkles,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { HotspotPlacementStep, isHotspotPlaced, tempSceneId } from "@/components/admin/hotspot-placement-step";
import { HybridPreviewStep } from "@/components/admin/hybrid-preview-step";
import { HotspotPlacementViewer } from "@/components/admin/hotspot-placement-viewer";
import { PanoramaSceneCard } from "@/components/admin/panorama-scene-card";
import { Button } from "@/components/ui/button";
import type { HotspotInput, PanoramaSceneInput } from "@/lib/hybrid-types";

const ROOM_PRESETS = ["Salon", "Cuisine", "Chambre", "Salle de bain"] as const;

type WizardStepId = "type" | "model" | "rooms" | "pins" | "preview" | "publish";

const STEP_META: Record<
  WizardStepId,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  type: { label: "Type de visite", icon: Layers },
  model: { label: "Modèle 3D", icon: Box },
  rooms: { label: "Pièces 360", icon: Home },
  pins: { label: "Placer les pins", icon: MapPin },
  preview: { label: "Prévisualiser", icon: Eye },
  publish: { label: "Publier", icon: Sparkles },
};

function stepsForVisitType(visitType: VisitType): WizardStepId[] {
  switch (visitType) {
    case VisitType.MODEL_3D:
      return ["type", "model", "publish"];
    case VisitType.PANORAMA_360:
      return ["type", "model", "rooms", "preview", "publish"];
    case VisitType.HYBRID_3D_360:
      return ["type", "model", "rooms", "pins", "preview", "publish"];
    default:
      return ["type", "model", "publish"];
  }
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type HybridTourWizardProps = {
  visitType: VisitType;
  onVisitTypeChange: (value: VisitType) => void;
  modelUrl: string;
  modelType: "GLB" | "GLTF" | "OBJ" | "ZIP";
  onUploadModel: (files: File[]) => void;
  uploadingModel: boolean;
  panoramaScenes: PanoramaSceneInput[];
  onPanoramaScenesChange: (scenes: PanoramaSceneInput[]) => void;
  hotspots: HotspotInput[];
  onHotspotsChange: (hotspots: HotspotInput[]) => void;
  onUploadPanorama: (file: File, sceneIndex: number) => Promise<void>;
  uploadingPanoramaIndex: number | null;
  propertyName: string;
  publicUrl?: string | null;
  saveStatus?: SaveStatus;
  onSaveAndContinue?: () => Promise<boolean>;
  uploadError?: string | null;
};

export function HybridTourWizard({
  visitType,
  onVisitTypeChange,
  modelUrl,
  modelType,
  onUploadModel,
  uploadingModel,
  panoramaScenes,
  onPanoramaScenesChange,
  hotspots,
  onHotspotsChange,
  onUploadPanorama,
  uploadingPanoramaIndex,
  propertyName,
  publicUrl,
  saveStatus = "idle",
  onSaveAndContinue,
  uploadError = null,
}: HybridTourWizardProps) {
  const steps = useMemo(() => stepsForVisitType(visitType), [visitType]);
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex] ?? "type";

  function goNext() {
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
  }

  function goPrev() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  async function handleContinue() {
    if (onSaveAndContinue) {
      const ok = await onSaveAndContinue();
      if (!ok) return;
    }
    goNext();
  }

  function addPresetRooms() {
    const existing = panoramaScenes.length;
    const toAdd = ROOM_PRESETS.slice(existing, ROOM_PRESETS.length);
    if (toAdd.length === 0) {
      addRoom();
      return;
    }
    onPanoramaScenesChange([
      ...panoramaScenes,
      ...toAdd.map((name, i) => ({
        name,
        imageUrl: "",
        sortOrder: existing + i,
      })),
    ]);
  }

  function addRoom() {
    const n = panoramaScenes.length + 1;
    onPanoramaScenesChange([
      ...panoramaScenes,
      { name: `Pièce ${n}`, imageUrl: "", sortOrder: panoramaScenes.length },
    ]);
  }

  function updateScene(index: number, patch: Partial<PanoramaSceneInput>) {
    onPanoramaScenesChange(
      panoramaScenes.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
    if (patch.name) {
      const sceneId = tempSceneId(index, panoramaScenes[index]?.id);
      onHotspotsChange(
        hotspots.map((h) =>
          h.panoramaSceneId === sceneId ? { ...h, label: patch.name! } : h,
        ),
      );
    }
  }

  function removeScene(index: number) {
    const removedId = tempSceneId(index, panoramaScenes[index]?.id);
    onPanoramaScenesChange(panoramaScenes.filter((_, i) => i !== index));
    onHotspotsChange(hotspots.filter((h) => h.panoramaSceneId !== removedId));
  }

  const scenesWithImage = panoramaScenes.filter((s) => s.imageUrl?.trim());

  function sceneHasPin(sceneIndex: number) {
    const sid = tempSceneId(sceneIndex, panoramaScenes[sceneIndex]?.id);
    return isHotspotPlaced(hotspots.find((h) => h.panoramaSceneId === sid));
  }

  const pinnedSceneCount = panoramaScenes.filter(
    (s, i) => s.imageUrl?.trim() && sceneHasPin(i),
  ).length;

  const canContinueModel = Boolean(modelUrl?.trim());
  const canContinueRooms =
    visitType === VisitType.PANORAMA_360 || visitType === VisitType.HYBRID_3D_360
      ? scenesWithImage.length > 0
      : true;

  const checklist = {
    model: canContinueModel,
    panoramas: scenesWithImage.length > 0,
    pins:
      visitType !== VisitType.HYBRID_3D_360 ||
      (scenesWithImage.length > 0 &&
        panoramaScenes.every((s, i) => !s.imageUrl?.trim() || sceneHasPin(i))),
    public: Boolean(publicUrl),
  };

  return (
    <div className="space-y-6 rounded-2xl border border-[#e4e7ec] bg-[#faf9f6] p-4 sm:p-5">
      {/* Stepper */}
      <nav aria-label="Étapes de création" className="overflow-x-auto pb-1">
        <ol className="flex min-w-max gap-1 sm:gap-2">
          {steps.map((stepId, i) => {
            const meta = STEP_META[stepId];
            const Icon = meta.icon;
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={stepId} className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setStepIndex(i)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm ${
                    active
                      ? "bg-[#0f2f3f] text-white"
                      : done
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-white text-[#667085] ring-1 ring-[#e4e7ec]"
                  }`}
                >
                  {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                  <span className="hidden sm:inline">{meta.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
                {i < steps.length - 1 ? (
                  <ChevronRight size={14} className="text-[#98a2b3]" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      {saveStatus !== "idle" ? (
        <p
          className={`text-center text-xs font-semibold ${
            saveStatus === "saving"
              ? "text-[#667085]"
              : saveStatus === "saved"
                ? "text-emerald-700"
                : "text-red-700"
          }`}
        >
          {saveStatus === "saving"
            ? "Enregistrement…"
            : saveStatus === "saved"
              ? "Sauvegardé"
              : "Erreur de sauvegarde"}
        </p>
      ) : null}

      {/* Step content */}
      <div className="min-h-[200px]">
        {currentStep === "type" ? (
          <div className="space-y-4">
            <p className="text-sm text-[#667085]">
              Choisissez le type de visite pour ce bien. Vous pourrez modifier ce choix plus tard.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    value: VisitType.MODEL_3D,
                    title: "Modèle 3D seulement",
                    desc: "Navigation 3D sans photos 360.",
                  },
                  {
                    value: VisitType.PANORAMA_360,
                    title: "Visite 360 seulement",
                    desc: "Photos panoramiques par pièce.",
                  },
                  {
                    value: VisitType.HYBRID_3D_360,
                    title: "Hybride 3D + 360",
                    desc: "Plan 3D + photos 360 par pièce.",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onVisitTypeChange(opt.value);
                    setStepIndex(0);
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    visitType === opt.value
                      ? "border-[#2f6f5e] bg-[#e8f4ef] ring-2 ring-[#2f6f5e]/20"
                      : "border-white bg-white hover:border-[#2f6f5e]/30"
                  }`}
                >
                  <p className="font-black text-[#0f2f3f]">{opt.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#667085]">{opt.desc}</p>
                </button>
              ))}
            </div>
            {visitType === VisitType.HYBRID_3D_360 ? (
              <div className="rounded-xl bg-[#e8f4ef] px-4 py-3 text-sm text-[#2f6f5e]">
                Utilisez le modèle 3D comme plan de navigation, puis ajoutez des photos 360 par
                pièce. Placez ensuite un pin sur le modèle pour chaque pièce.
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep === "model" ? (
          <div className="space-y-4">
            <p className="text-sm text-[#667085]">
              Importez le modèle 3D du bien (.glb recommandé, export 3D Live Scanner ou Meshroom).
            </p>
            {uploadError ? (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</p>
            ) : null}
            <ModelFilePicker
              uploading={uploadingModel}
              onFilesSelected={onUploadModel}
            />
            {modelUrl ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 size={18} />
                <span>
                  Modèle chargé ({modelType})
                  {modelType === "ZIP" ? " — utilisez .glb pour placer les pins" : ""}
                </span>
              </div>
            ) : (
              <p className="text-sm text-amber-700">Aucun modèle — ajoutez un fichier pour continuer.</p>
            )}
            {modelUrl && modelType !== "ZIP" ? (
              <div className="overflow-hidden rounded-2xl">
                <p className="mb-2 text-xs font-semibold text-[#667085]">Aperçu rapide</p>
                <HotspotPlacementViewer
                  modelUrl={modelUrl}
                  modelType={modelType}
                  hotspots={[]}
                  activeHotspotIndex={null}
                  placementMode={false}
                  onPositionPlaced={() => {}}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep === "rooms" ? (
          <div className="space-y-4">
            <p className="text-sm text-[#667085]">
              Ajoutez une photo 360 par pièce (JPG équirectangulaire Insta360).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={addPresetRooms}>
                <Home size={14} /> Ajouter pièces types
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={addRoom}>
                Ajouter une pièce
              </Button>
            </div>
            {panoramaScenes.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Commencez par « Ajouter pièces types » ou « Ajouter une pièce ».
              </p>
            ) : (
              <div className="space-y-3">
                {panoramaScenes.map((scene, index) => (
                  <PanoramaSceneCard
                    key={tempSceneId(index, scene.id)}
                    scene={scene}
                    index={index}
                    onNameChange={(name) => updateScene(index, { name })}
                    onUpload={(file) => void onUploadPanorama(file, index)}
                    onRemove={() => removeScene(index)}
                    uploading={uploadingPanoramaIndex === index}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {currentStep === "pins" && visitType === VisitType.HYBRID_3D_360 ? (
          <HotspotPlacementStep
            modelUrl={modelUrl}
            modelType={modelType}
            panoramaScenes={panoramaScenes}
            hotspots={hotspots}
            onHotspotsChange={onHotspotsChange}
          />
        ) : null}

        {currentStep === "preview" ? (
          visitType === VisitType.HYBRID_3D_360 ? (
            <HybridPreviewStep
              propertyName={propertyName}
              modelUrl={modelUrl}
              modelType={modelType}
              panoramaScenes={panoramaScenes}
              hotspots={hotspots}
              publicUrl={publicUrl}
            />
          ) : visitType === VisitType.PANORAMA_360 ? (
            <p className="text-sm text-[#667085]">
              La prévisualisation panoramique sera disponible après publication sur la page
              publique. Enregistrez puis ouvrez le lien de visite.
            </p>
          ) : null
        ) : null}

        {currentStep === "publish" ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-[#0f2f3f]">Checklist avant publication</p>
            <ul className="space-y-2">
              <ChecklistItem ok={checklist.model} label="Modèle 3D chargé" />
              {(visitType === VisitType.PANORAMA_360 ||
                visitType === VisitType.HYBRID_3D_360) && (
                <ChecklistItem ok={checklist.panoramas} label="Au moins 1 photo 360" />
              )}
              {visitType === VisitType.HYBRID_3D_360 ? (
                <ChecklistItem
                  ok={checklist.pins}
                  label="Chaque pièce importante a un pin sur le modèle"
                  hint={`${pinnedSceneCount} / ${scenesWithImage.length} pièces avec pin`}
                />
              ) : null}
              <ChecklistItem
                ok={checklist.public}
                label="Visite enregistrée (lien public disponible après 1ère sauvegarde)"
              />
            </ul>
            <p className="text-xs text-[#667085]">
              Utilisez le bouton « Publier la visite » dans la colonne de droite pour passer en statut
              Publié, ou enregistrez en brouillon pour continuer plus tard.
            </p>
          </div>
        ) : null}
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e7ec] pt-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={goPrev}
          disabled={stepIndex === 0}
        >
          <ChevronLeft size={14} /> Retour
        </Button>
        {stepIndex < steps.length - 1 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleContinue()}
            disabled={
              (currentStep === "model" && !canContinueModel) ||
              (currentStep === "rooms" && !canContinueRooms)
            }
          >
            {onSaveAndContinue ? "Enregistrer et continuer" : "Continuer"}
            <ChevronRight size={14} />
          </Button>
        ) : (
          <span className="text-xs font-semibold text-emerald-700">Dernière étape — publiez à droite</span>
        )}
      </div>
    </div>
  );
}

function ModelFilePicker({
  uploading,
  onFilesSelected,
}: {
  uploading: boolean;
  onFilesSelected: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#c5cdd8] bg-white px-6 py-8">
      <Upload size={32} className="text-[#2f6f5e]" />
      <p className="text-sm font-semibold text-[#0f2f3f]">
        {uploading ? "Envoi en cours…" : "Ajoutez votre modèle 3D"}
      </p>
      <p className="text-center text-xs text-[#667085]">
        Un seul fichier .glb de préférence. Pour OBJ, sélectionnez .obj + .mtl + textures en une
        fois.
      </p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept=".glb,.gltf,.obj,.mtl,.bin,.jpg,.jpeg,.png,.webp,.zip"
        disabled={uploading}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFilesSelected(files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Envoi…" : "Parcourir les fichiers"}
      </Button>
    </div>
  );
}

function ChecklistItem({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
      ) : (
        <Circle size={18} className="shrink-0 text-amber-500" />
      )}
      <span className={ok ? "text-[#0f2f3f]" : "text-amber-800"}>
        {label}
        {hint ? <span className="block text-xs text-[#667085]">{hint}</span> : null}
      </span>
    </li>
  );
}
