"use client";

import { VisitType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useRef, useState } from "react";
import {
  HybridTourWizard,
  type SaveStatus,
} from "@/components/admin/hybrid-tour-wizard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatAdminError } from "@/lib/admin-error-messages";
import type { HotspotInput, PanoramaSceneInput } from "@/lib/hybrid-types";

type PropertyFormValue = {
  id?: string;
  name: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  price?: number | null;
  description?: string | null;
  coverImageUrl?: string | null;
  modelUrl: string;
  modelType: "GLB" | "GLTF" | "OBJ" | "ZIP";
  visitType?: VisitType;
  status: "DRAFT" | "PUBLISHED";
  slug?: string;
  panoramaScenes?: { id: string; name: string; imageUrl: string; sortOrder: number }[];
  hotspots?: {
    id: string;
    label: string;
    x: number;
    y: number;
    z: number;
    panoramaSceneId: string | null;
  }[];
};

type UploadState = {
  coverImageUrl?: string | null;
  modelUrl: string;
  modelType: "GLB" | "GLTF" | "OBJ" | "ZIP";
};

export function PropertyForm({ property }: { property?: PropertyFormValue }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [propertyId, setPropertyId] = useState(property?.id);
  const [propertyName, setPropertyName] = useState(property?.name ?? "");
  const [uploadState, setUploadState] = useState<UploadState>({
    coverImageUrl: property?.coverImageUrl,
    modelUrl: property?.modelUrl ?? "",
    modelType: property?.modelType ?? "GLB",
  });
  const [visitType, setVisitType] = useState<VisitType>(
    property?.visitType ?? VisitType.MODEL_3D,
  );
  const [panoramaScenes, setPanoramaScenes] = useState<PanoramaSceneInput[]>(
    property?.panoramaScenes?.map((s) => ({
      id: s.id,
      name: s.name,
      imageUrl: s.imageUrl,
      sortOrder: s.sortOrder,
    })) ?? [],
  );
  const [hotspots, setHotspots] = useState<HotspotInput[]>(
    property?.hotspots?.map((h) => ({
      id: h.id,
      label: h.label,
      x: h.x,
      y: h.y,
      z: h.z,
      panoramaSceneId: h.panoramaSceneId,
    })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(
    property?.slug ? `/visite/${property.slug}` : null,
  );
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadingPanoramaIndex, setUploadingPanoramaIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  function buildPayload(statusOverride?: "DRAFT" | "PUBLISHED") {
    const form = formRef.current;
    if (!form) return null;
    const formData = new FormData(form);
    return {
      name: formData.get("name"),
      address: formData.get("address"),
      city: formData.get("city"),
      postalCode: formData.get("postalCode"),
      price: formData.get("price") || "",
      description: formData.get("description"),
      coverImageUrl: uploadState.coverImageUrl ?? "",
      modelUrl: uploadState.modelUrl,
      modelType: uploadState.modelType,
      visitType,
      status: statusOverride ?? formData.get("status"),
      panoramaScenes,
      hotspots,
    };
  }

  async function persistProperty(statusOverride?: "DRAFT" | "PUBLISHED"): Promise<boolean> {
    const payload = buildPayload(statusOverride);
    if (!payload?.name || String(payload.name).trim().length < 2) {
      setError("Indiquez le nom de la propriété avant d'enregistrer.");
      setSaveStatus("error");
      return false;
    }
    if (!uploadState.modelUrl) {
      setError("Ajoutez d'abord votre modèle 3D (.glb recommandé).");
      setSaveStatus("error");
      return false;
    }

    setSaveStatus("saving");
    setError(null);

    const id = propertyId ?? property?.id;
    const response = await fetch(
      id ? `/api/admin/properties/${id}` : "/api/admin/properties",
      {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const data = (await response.json()) as {
      error?: string;
      publicUrl?: string;
      property?: { id: string; slug: string };
    };

    if (!response.ok) {
      setError(formatAdminError(data.error));
      setSaveStatus("error");
      return false;
    }

    if (data.property?.id) setPropertyId(data.property.id);
    if (data.publicUrl) setSuccessUrl(data.publicUrl);
    setSaveStatus("saved");
    router.refresh();
    return true;
  }

  const saveDraft = useCallback(async () => persistProperty("DRAFT"), [
    uploadState,
    visitType,
    panoramaScenes,
    hotspots,
    propertyId,
  ]);

  async function upload(files: File[], kind: "model" | "cover" | "panorama") {
    setUploading(kind);
    setError(null);

    const formData = new FormData();
    files.forEach((file) => formData.append("file", file));
    formData.append("kind", kind);

    let response: Response;
    try {
      response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
    } catch {
      setUploading(null);
      setError(
        "Connexion interrompue pendant l'envoi. Vérifiez le réseau et réessayez.",
      );
      return;
    }

    setUploading(null);

    let data: {
      url?: string;
      modelType?: "GLB" | "GLTF" | "OBJ" | "ZIP";
      error?: string;
    };

    try {
      data = (await response.json()) as typeof data;
    } catch {
      setError(
        response.status === 413
          ? "Fichier trop volumineux pour le serveur. Essayez un .glb plus léger ou augmentez UPLOAD_MAX_SIZE_MB."
          : "Réponse serveur invalide. Redémarrez `npm run dev` après une mise à jour du site.",
      );
      return;
    }

    if (!response.ok || !data.url) {
      setError(formatAdminError(data.error ?? "Upload impossible."));
      return;
    }

    if (kind === "model") {
      setUploadState((current) => ({
        ...current,
        modelUrl: data.url!,
        modelType: data.modelType ?? current.modelType,
      }));
    } else if (kind === "cover") {
      setUploadState((current) => ({ ...current, coverImageUrl: data.url }));
    }

    return data.url;
  }

  async function uploadPanorama(file: File, sceneIndex: number) {
    setUploadingPanoramaIndex(sceneIndex);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "panorama");

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    setUploadingPanoramaIndex(null);

    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setError(
        formatAdminError(
          data.error ??
            "L'image n'a pas pu être envoyée. Essayez une image JPG ou PNG moins lourde.",
        ),
      );
      return;
    }

    setPanoramaScenes((current) =>
      current.map((scene, index) =>
        index === sceneIndex ? { ...scene, imageUrl: data.url! } : scene,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const intent = formData.get("intent");
    const status =
      intent === "publish"
        ? "PUBLISHED"
        : ((formData.get("status") as "DRAFT" | "PUBLISHED") ?? "DRAFT");
    const ok = await persistProperty(status);
    setLoading(false);
    if (!ok) return;
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="grid gap-6 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]"
    >
      <Card className="space-y-5 bg-white">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Nom de la propriété *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={property?.name}
              required
              onChange={(e) => setPropertyName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" name="address" defaultValue={property?.address ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Ville</Label>
            <Input id="city" name="city" defaultValue={property?.city ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">Code postal</Label>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={property?.postalCode ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Prix du bien optionnel</Label>
            <Input
              id="price"
              name="price"
              type="number"
              min="0"
              defaultValue={property?.price ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={property?.description ?? ""}
            placeholder="Décrivez le bien, ses volumes, son emplacement..."
          />
        </div>

        <HybridTourWizard
          visitType={visitType}
          onVisitTypeChange={setVisitType}
          modelUrl={uploadState.modelUrl}
          modelType={uploadState.modelType}
          onUploadModel={(files) => void upload(files, "model")}
          uploadingModel={uploading === "model"}
          panoramaScenes={panoramaScenes}
          onPanoramaScenesChange={setPanoramaScenes}
          hotspots={hotspots}
          onHotspotsChange={setHotspots}
          onUploadPanorama={uploadPanorama}
          uploadingPanoramaIndex={uploadingPanoramaIndex}
          propertyName={propertyName}
          publicUrl={successUrl}
          saveStatus={saveStatus}
          onSaveAndContinue={saveDraft}
          uploadError={error}
        />
      </Card>

      <Card className="h-fit space-y-5 bg-white lg:sticky lg:top-6">
        <div>
          <h2 className="text-xl font-black text-[#0f2f3f]">Publication</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Image de couverture optionnelle et statut de la visite.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cover">Image de couverture</Label>
          <Input
            id="cover"
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload([file], "cover");
            }}
          />
          {uploadState.coverImageUrl ? (
            <p className="text-xs text-emerald-700">Couverture ajoutée</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Statut</Label>
          <Select id="status" name="status" defaultValue={property?.status ?? "DRAFT"}>
            <option value="DRAFT">Brouillon</option>
            <option value="PUBLISHED">Publié</option>
          </Select>
        </div>

        {saveStatus !== "idle" ? (
          <p
            className={`rounded-2xl p-3 text-sm font-semibold ${
              saveStatus === "saving"
                ? "bg-[#f4f1ea] text-[#667085]"
                : saveStatus === "saved"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-700"
            }`}
          >
            {saveStatus === "saving"
              ? "Enregistrement…"
              : saveStatus === "saved"
                ? "Sauvegardé"
                : "Erreur de sauvegarde"}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}
        {successUrl ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-bold">Visite enregistrée.</p>
            <a className="mt-1 block break-all underline" href={successUrl} target="_blank">
              Prévisualiser la visite
            </a>
          </div>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={loading || !uploadState.modelUrl}
          onClick={() => void saveDraft()}
        >
          Enregistrer le brouillon
        </Button>

        <Button
          type="submit"
          name="intent"
          value="publish"
          className="w-full"
          disabled={loading || !uploadState.modelUrl}
        >
          {loading ? "Publication…" : "Publier la visite"}
        </Button>

        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="secondary"
          className="w-full"
          disabled={loading || !uploadState.modelUrl}
        >
          {loading ? "Enregistrement..." : property ? "Modifier (brouillon)" : "Créer"}
        </Button>
      </Card>
    </form>
  );
}
