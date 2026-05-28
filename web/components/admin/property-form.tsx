"use client";

import {
  CatalogStatus,
  ExternalListingSource,
  ExternalListingStatus,
  MatterportImportMode,
  MatterportImportStatus,
  VisitType,
} from "@prisma/client";
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
import { parseMatterportInput } from "@/lib/matterport";

type PropertyFormValue = {
  id?: string;
  name: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  price?: number | null;
  description?: string | null;
  coverImageUrl?: string | null;
  catalogEnabled?: boolean | null;
  catalogStatus?: CatalogStatus | null;
  catalogTitle?: string | null;
  catalogDescription?: string | null;
  catalogPrice?: number | null;
  catalogCity?: string | null;
  catalogPostalCode?: string | null;
  catalogSurface?: number | null;
  catalogRooms?: number | null;
  catalogBedrooms?: number | null;
  catalogCoverImageUrl?: string | null;
  externalListingUrl?: string | null;
  externalListingSource?: ExternalListingSource | null;
  externalListingStatus?: ExternalListingStatus | null;
  externalLastCheckedAt?: string | Date | null;
  externalLastStatusCode?: number | null;
  externalLastError?: string | null;
  modelUrl: string;
  modelType: "GLB" | "GLTF" | "OBJ" | "ZIP";
  visitType?: VisitType;
  matterportUrl?: string | null;
  matterportEmbedUrl?: string | null;
  matterportModelId?: string | null;
  matterportImportMode?: MatterportImportMode | null;
  matterportZipOriginalName?: string | null;
  matterportImportStatus?: MatterportImportStatus | null;
  matterportImportError?: string | null;
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
  const [catalogCoverImageUrl, setCatalogCoverImageUrl] = useState<string | null>(
    property?.catalogCoverImageUrl ?? property?.coverImageUrl ?? null,
  );
  const [visitType, setVisitType] = useState<VisitType>(
    property?.visitType ?? VisitType.MODEL_3D,
  );
  const [matterportRaw, setMatterportRaw] = useState<string>(
    property?.matterportEmbedUrl ?? property?.matterportUrl ?? "",
  );
  const [matterportUrl, setMatterportUrl] = useState<string | null>(
    property?.matterportUrl ?? null,
  );
  const [matterportEmbedUrl, setMatterportEmbedUrl] = useState<string | null>(
    property?.matterportEmbedUrl ?? null,
  );
  const [matterportModelId, setMatterportModelId] = useState<string | null>(
    property?.matterportModelId ?? null,
  );
  const [matterportImportStatus, setMatterportImportStatus] = useState<MatterportImportStatus>(
    property?.matterportImportStatus ?? MatterportImportStatus.NONE,
  );
  const [matterportImportMode, setMatterportImportMode] = useState<MatterportImportMode>(
    property?.matterportImportMode ?? MatterportImportMode.EMBED,
  );
  const [matterportZipOriginalName, setMatterportZipOriginalName] = useState<string | null>(
    property?.matterportZipOriginalName ?? null,
  );
  const [matterportImportError, setMatterportImportError] = useState<string | null>(
    property?.matterportImportError ?? null,
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
  const [uploadingCatalogCover, setUploadingCatalogCover] = useState(false);
  const [uploadingPanoramaIndex, setUploadingPanoramaIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [checkingExternal, setCheckingExternal] = useState(false);

  function buildPayload(statusOverride?: "DRAFT" | "PUBLISHED") {
    const form = formRef.current;
    if (!form) return null;
    const formData = new FormData(form);
    const effectiveModelUrl =
      visitType === VisitType.MATTERPORT
        ? (matterportEmbedUrl ?? matterportUrl ?? uploadState.modelUrl)
        : uploadState.modelUrl;
    const effectiveModelType =
      visitType === VisitType.MATTERPORT ? "ZIP" : uploadState.modelType;

    return {
      name: formData.get("name"),
      address: formData.get("address"),
      city: formData.get("city"),
      postalCode: formData.get("postalCode"),
      price: formData.get("price") || "",
      description: formData.get("description"),
      coverImageUrl: uploadState.coverImageUrl ?? "",
      catalogEnabled: formData.get("catalogEnabled") === "on",
      catalogStatus: formData.get("catalogStatus") ?? CatalogStatus.DRAFT,
      catalogTitle: formData.get("catalogTitle"),
      catalogDescription: formData.get("catalogDescription"),
      catalogPrice: formData.get("catalogPrice") || "",
      catalogCity: formData.get("catalogCity"),
      catalogPostalCode: formData.get("catalogPostalCode"),
      catalogSurface: formData.get("catalogSurface") || "",
      catalogRooms: formData.get("catalogRooms") || "",
      catalogBedrooms: formData.get("catalogBedrooms") || "",
      catalogCoverImageUrl: catalogCoverImageUrl ?? "",
      externalListingUrl: formData.get("externalListingUrl"),
      externalListingSource: formData.get("externalListingSource") ?? "",
      modelUrl: effectiveModelUrl,
      modelType: effectiveModelType,
      visitType,
      status: statusOverride ?? formData.get("status"),
      matterportUrl: matterportUrl ?? "",
      matterportEmbedUrl: matterportEmbedUrl ?? "",
      matterportModelId: matterportModelId ?? "",
      matterportImportMode,
      matterportZipOriginalName: matterportZipOriginalName ?? "",
      matterportImportStatus,
      matterportImportError: matterportImportError ?? "",
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
    if (visitType === VisitType.MATTERPORT) {
      const embed = (matterportEmbedUrl ?? matterportUrl ?? "").trim();
      if (!embed) {
        setError("Ajoutez un lien Matterport ou un code iframe avant d'enregistrer.");
        setSaveStatus("error");
        return false;
      }
    } else if (!uploadState.modelUrl) {
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

  async function uploadMatterportZip(file: File) {
    const id = propertyId ?? property?.id;
    if (!id) {
      setError("Enregistrez d'abord la propriété pour activer l'import ZIP Matterport.");
      return;
    }

    setError(null);
    setMatterportImportError(null);
    setMatterportZipOriginalName(file.name);
    setMatterportImportStatus(MatterportImportStatus.PENDING);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/admin/properties/${id}/matterport-zip`, {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as
      | {
          ok: true;
          modelUrl?: string;
          modelType?: "GLB" | "GLTF" | "OBJ" | "ZIP";
          importMode?: MatterportImportMode;
          importStatus?: MatterportImportStatus;
          importError?: string | null;
        }
      | { ok: false; error: string };

    if (!response.ok || !("ok" in data) || data.ok === false) {
      setMatterportImportStatus(MatterportImportStatus.ERROR);
      setMatterportImportError(
        "ok" in data && data.ok === false ? data.error : "Import ZIP Matterport impossible.",
      );
      setError(
        "ok" in data && data.ok === false ? data.error : "Import ZIP Matterport impossible.",
      );
      return;
    }

    setMatterportImportMode(data.importMode ?? MatterportImportMode.MATTERPAK_UNKNOWN);
    setMatterportImportStatus(data.importStatus ?? MatterportImportStatus.READY);
    setMatterportImportError(data.importError ?? null);

    if (data.modelUrl && data.modelType) {
      setUploadState((current) => ({
        ...current,
        modelUrl: data.modelUrl!,
        modelType: data.modelType!,
      }));
    }
  }

  function handleMatterportRaw(value: string) {
    setMatterportRaw(value);
    setMatterportImportMode(MatterportImportMode.EMBED);
    setMatterportImportStatus(MatterportImportStatus.READY);
    setMatterportImportError(null);

    if (!value.trim()) {
      setMatterportUrl(null);
      setMatterportEmbedUrl(null);
      setMatterportModelId(null);
      return;
    }

    const parsed = parseMatterportInput(value);
    if (!parsed.ok) {
      setMatterportImportStatus(MatterportImportStatus.ERROR);
      setMatterportImportError(parsed.error);
      return;
    }

    setMatterportUrl(parsed.matterportUrl);
    setMatterportEmbedUrl(parsed.matterportEmbedUrl);
    setMatterportModelId(parsed.matterportModelId);
  }

  async function uploadCatalogCover(file: File) {
    setUploadingCatalogCover(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "cover");

    let response: Response;
    try {
      response = await fetch("/api/admin/upload", { method: "POST", body: formData });
    } catch {
      setUploadingCatalogCover(false);
      setError("Connexion interrompue pendant l'envoi. Vérifiez le réseau et réessayez.");
      return;
    }

    setUploadingCatalogCover(false);

    let data: { url?: string; error?: string };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      setError(
        response.status === 413
          ? "Fichier trop volumineux pour le serveur. Essayez une image plus légère."
          : "Réponse serveur invalide. Redémarrez `npm run dev` après une mise à jour du site.",
      );
      return;
    }

    if (!response.ok || !data.url) {
      setError(formatAdminError(data.error ?? "Upload impossible."));
      return;
    }

    setCatalogCoverImageUrl(data.url);
  }

  async function checkExternalNow() {
    const id = propertyId ?? property?.id;
    if (!id) return;
    setCheckingExternal(true);
    setError(null);
    const response = await fetch(`/api/admin/properties/${id}/check-external`, {
      method: "POST",
    });
    const data = (await response.json()) as { error?: string };
    setCheckingExternal(false);
    if (!response.ok) {
      setError(formatAdminError(data.error ?? "Vérification impossible."));
      return;
    }
    router.refresh();
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
      <div className="space-y-6">
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
        </Card>

        <Card className="space-y-5 bg-white">
          <div>
            <h2 className="text-xl font-black text-[#0f2f3f]">Catalogue public</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Ces informations sont utilisées pour la page catalogue (<code>/</code>) et la fiche
              publique du bien (<code>/bien/[slug]</code>).
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee7dc] bg-[#f7f5f0]/60 p-4">
            <div>
              <p className="font-bold text-[#0f2f3f]">Afficher dans le catalogue</p>
              <p className="text-sm text-[#667085]">
                Si désactivé, le bien n’apparaît pas publiquement dans le catalogue.
              </p>
            </div>
            <input
              name="catalogEnabled"
              type="checkbox"
              defaultChecked={Boolean(property?.catalogEnabled)}
              className="h-5 w-5 accent-[#2f6f5e]"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalogStatus">Statut catalogue</Label>
              <Select
                id="catalogStatus"
                name="catalogStatus"
                defaultValue={property?.catalogStatus ?? CatalogStatus.DRAFT}
              >
                <option value={CatalogStatus.DRAFT}>Brouillon</option>
                <option value={CatalogStatus.ONLINE}>En ligne</option>
                <option value={CatalogStatus.EXTERNAL_DOWN}>Lien externe hors ligne</option>
                <option value={CatalogStatus.HIDDEN}>Masqué</option>
                <option value={CatalogStatus.SOLD}>Vendu</option>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalogTitle">Titre catalogue</Label>
              <Input
                id="catalogTitle"
                name="catalogTitle"
                defaultValue={property?.catalogTitle ?? ""}
                placeholder="Ex. Maison familiale avec jardin"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalogDescription">Description courte</Label>
              <Textarea
                id="catalogDescription"
                name="catalogDescription"
                defaultValue={property?.catalogDescription ?? ""}
                placeholder="Résumé pour la carte et la fiche du bien..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogPrice">Prix</Label>
              <Input
                id="catalogPrice"
                name="catalogPrice"
                type="number"
                min="0"
                defaultValue={property?.catalogPrice ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogCity">Ville</Label>
              <Input
                id="catalogCity"
                name="catalogCity"
                defaultValue={property?.catalogCity ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogPostalCode">Code postal</Label>
              <Input
                id="catalogPostalCode"
                name="catalogPostalCode"
                defaultValue={property?.catalogPostalCode ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogSurface">Surface (m²)</Label>
              <Input
                id="catalogSurface"
                name="catalogSurface"
                type="number"
                min="0"
                defaultValue={property?.catalogSurface ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogRooms">Pièces</Label>
              <Input
                id="catalogRooms"
                name="catalogRooms"
                type="number"
                min="0"
                defaultValue={property?.catalogRooms ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogBedrooms">Chambres</Label>
              <Input
                id="catalogBedrooms"
                name="catalogBedrooms"
                type="number"
                min="0"
                defaultValue={property?.catalogBedrooms ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="catalogCover">Image de couverture (catalogue)</Label>
            <Input
              id="catalogCover"
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              disabled={uploadingCatalogCover}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadCatalogCover(file);
              }}
            />
            {catalogCoverImageUrl ? (
              <p className="text-xs text-emerald-700">Couverture catalogue ajoutée</p>
            ) : (
              <p className="text-xs text-[#667085]">
                Optionnel. Sinon, la couverture “visite” sera utilisée en fallback.
              </p>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="externalListingUrl">Lien annonce externe (Leboncoin)</Label>
              <Input
                id="externalListingUrl"
                name="externalListingUrl"
                defaultValue={property?.externalListingUrl ?? ""}
                placeholder="https://www.leboncoin.fr/..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="externalListingSource">Source externe</Label>
              <Select
                id="externalListingSource"
                name="externalListingSource"
                defaultValue={property?.externalListingSource ?? ""}
              >
                <option value="">Non renseignée</option>
                <option value={ExternalListingSource.LEBONCOIN}>Leboncoin</option>
                <option value={ExternalListingSource.OTHER}>Autre</option>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={checkingExternal || !(propertyId ?? property?.id)}
                onClick={() => void checkExternalNow()}
              >
                {checkingExternal ? "Vérification…" : "Tester le lien maintenant"}
              </Button>
            </div>
          </div>

          {property?.externalListingStatus ? (
            <div className="rounded-2xl border border-[#eee7dc] bg-white p-4 text-sm text-[#475467]">
              <p className="font-bold text-[#0f2f3f]">Statut du lien externe</p>
              <div className="mt-2 grid gap-1">
                <p>
                  <span className="font-semibold">Statut :</span> {property.externalListingStatus}
                </p>
                <p>
                  <span className="font-semibold">Dernier check :</span>{" "}
                  {property.externalLastCheckedAt
                    ? new Date(property.externalLastCheckedAt).toLocaleString()
                    : "—"}
                </p>
                <p>
                  <span className="font-semibold">Code HTTP :</span>{" "}
                  {property.externalLastStatusCode ?? "—"}
                </p>
                {property.externalLastError ? (
                  <p className="text-red-700">
                    <span className="font-semibold">Erreur :</span> {property.externalLastError}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-5 bg-white">
          <HybridTourWizard
            visitType={visitType}
            onVisitTypeChange={setVisitType}
            modelUrl={
              visitType === VisitType.MATTERPORT
                ? (matterportEmbedUrl ?? matterportUrl ?? "")
                : uploadState.modelUrl
            }
            modelType={visitType === VisitType.MATTERPORT ? "ZIP" : uploadState.modelType}
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

        {visitType === VisitType.MATTERPORT ? (
          <Card className="space-y-5 bg-white">
            <div>
              <h2 className="text-xl font-black text-[#0f2f3f]">Visite Matterport</h2>
              <p className="mt-1 text-sm text-[#667085]">
                Option recommandée : collez un lien Matterport ou un code iframe. Option avancée :
                importez un ZIP Matterport (MatterPak OBJ) si disponible.
              </p>
            </div>

            <div className="grid gap-5">
              <div className="space-y-2">
                <Label htmlFor="matterportRaw">Lien Matterport ou code iframe</Label>
                <Textarea
                  id="matterportRaw"
                  value={matterportRaw}
                  onChange={(e) => handleMatterportRaw(e.target.value)}
                  placeholder="Collez une URL https://my.matterport.com/show/?m=... ou un <iframe ...>…"
                />
                {matterportImportError ? (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {matterportImportError}
                  </p>
                ) : null}
              </div>

              {matterportEmbedUrl ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#0f2f3f]">Prévisualisation</p>
                  <div className="overflow-hidden rounded-2xl border border-[#e4e7ec] bg-black">
                    <iframe
                      title="Prévisualisation Matterport"
                      src={matterportEmbedUrl}
                      className="h-[420px] w-full"
                      allow="fullscreen; xr-spatial-tracking"
                      allowFullScreen
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (matterportEmbedUrl) window.open(matterportEmbedUrl, "_blank");
                      }}
                    >
                      Tester l’intégration
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="matterportZip">Importer un ZIP Matterport / MatterPak</Label>
                <Input
                  id="matterportZip"
                  type="file"
                  accept=".zip"
                  disabled={!(propertyId ?? property?.id)}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadMatterportZip(file);
                    event.target.value = "";
                  }}
                />
                <p className="text-xs text-[#667085]">
                  Extraction serveur vers <code>/uploads/matterport/&lt;id&gt;/</code>. Seuls certains
                  formats sont autorisés. Si le ZIP ne contient pas d’OBJ/GLB, il sera marqué comme
                  non supporté.
                </p>
                {matterportImportStatus !== MatterportImportStatus.NONE ? (
                  <p className="text-xs font-semibold text-[#475467]">
                    Statut import : {matterportImportStatus}
                    {matterportZipOriginalName ? ` — ${matterportZipOriginalName}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
      </div>

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
          disabled={
            loading ||
            (visitType === VisitType.MATTERPORT
              ? !(matterportEmbedUrl ?? matterportUrl ?? "").trim()
              : !uploadState.modelUrl)
          }
          onClick={() => void saveDraft()}
        >
          Enregistrer le brouillon
        </Button>

        <Button
          type="submit"
          name="intent"
          value="publish"
          className="w-full"
          disabled={
            loading ||
            (visitType === VisitType.MATTERPORT
              ? !(matterportEmbedUrl ?? matterportUrl ?? "").trim()
              : !uploadState.modelUrl)
          }
        >
          {loading ? "Publication…" : "Publier la visite"}
        </Button>

        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="secondary"
          className="w-full"
          disabled={
            loading ||
            (visitType === VisitType.MATTERPORT
              ? !(matterportEmbedUrl ?? matterportUrl ?? "").trim()
              : !uploadState.modelUrl)
          }
        >
          {loading ? "Enregistrement..." : property ? "Modifier (brouillon)" : "Créer"}
        </Button>
      </Card>
    </form>
  );
}
