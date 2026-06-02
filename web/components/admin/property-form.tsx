"use client";

import {
  CatalogStatus,
  ExternalListingSource,
  ExternalListingStatus,
  ListingType,
  MatterportImportMode,
  MatterportImportStatus,
  PropertyStatus,
  VisitType,
} from "@prisma/client";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useRef, useState } from "react";
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
import {
  getCatalogVisibilityReasons,
  isVisibleInCatalog,
  resolveCatalogOnPublish,
} from "@/lib/catalog-visibility";
import type { HotspotInput, PanoramaSceneInput } from "@/lib/hybrid-types";
import { parseMatterportInput } from "@/lib/matterport";
import type { MatterportAuditSummary } from "@/lib/matterport-backup-audit";

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
  listingType?: ListingType | null;
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
  matterportLocalManifestUrl?: string | null;
  matterportAuditReportUrl?: string | null;
  matterportAuditSummary?: MatterportAuditSummary | null;
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

function isMatterportEmbedMode(mode: MatterportImportMode) {
  return mode === MatterportImportMode.EMBED;
}

function isMatterportLocalMode(mode: MatterportImportMode) {
  return mode !== MatterportImportMode.EMBED;
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return "—";
  const units = ["octets", "Ko", "Mo", "Go"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function AdminSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="section-admin">
      <h2 className="text-xl font-black text-[#0f2f3f]">{title}</h2>
      {description ? <p className="text-muted mt-1 text-sm">{description}</p> : null}
    </div>
  );
}

export function PropertyForm({ property }: { property?: PropertyFormValue }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const matterportZipInputRef = useRef<HTMLInputElement | null>(null);
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
  const [matterportLocalManifestUrl, setMatterportLocalManifestUrl] = useState<string | null>(
    property?.matterportLocalManifestUrl ?? null,
  );
  const [matterportAuditReportUrl, setMatterportAuditReportUrl] = useState<string | null>(
    property?.matterportAuditReportUrl ?? null,
  );
  const [matterportAuditSummary, setMatterportAuditSummary] = useState<
    PropertyFormValue["matterportAuditSummary"]
  >(property?.matterportAuditSummary ?? null);
  const [matterportZipSelected, setMatterportZipSelected] = useState<File | null>(null);
  const [matterportZipUploading, setMatterportZipUploading] = useState(false);
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
  const [showInCatalogOnPublish, setShowInCatalogOnPublish] = useState(
    property?.catalogEnabled ?? true,
  );
  const [catalogEnabledPreview, setCatalogEnabledPreview] = useState(
    Boolean(property?.catalogEnabled),
  );
  const [catalogStatusPreview, setCatalogStatusPreview] = useState<CatalogStatus>(
    property?.catalogStatus ?? CatalogStatus.DRAFT,
  );
  const [listingTypePreview, setListingTypePreview] = useState<ListingType>(
    property?.listingType ?? ListingType.SALE,
  );
  const [propertyStatusPreview, setPropertyStatusPreview] = useState<PropertyStatus>(
    property?.status ?? PropertyStatus.DRAFT,
  );

  const catalogVisibilityPreview = {
    status: propertyStatusPreview,
    catalogEnabled: catalogEnabledPreview,
    catalogStatus: catalogStatusPreview,
    externalListingUrl: property?.externalListingUrl ?? null,
    externalListingStatus:
      property?.externalListingStatus ?? ExternalListingStatus.UNKNOWN,
    catalogCoverImageUrl: catalogCoverImageUrl,
    coverImageUrl: uploadState.coverImageUrl ?? property?.coverImageUrl ?? null,
  };
  const visibleInCatalogPreview = isVisibleInCatalog(catalogVisibilityPreview);
  const catalogVisibilityReasons = getCatalogVisibilityReasons(catalogVisibilityPreview);

  function buildPayload(statusOverride?: "DRAFT" | "PUBLISHED") {
    const form = formRef.current;
    if (!form) return null;
    const formData = new FormData(form);
    const matterportLocalSource = matterportLocalManifestUrl ?? uploadState.modelUrl;
    const effectiveModelUrl =
      visitType === VisitType.MATTERPORT
        ? isMatterportEmbedMode(matterportImportMode)
          ? (matterportEmbedUrl ?? matterportUrl ?? "")
          : matterportLocalSource
        : uploadState.modelUrl;
    const effectiveModelType =
      visitType === VisitType.MATTERPORT &&
      (isMatterportEmbedMode(matterportImportMode) ||
        matterportImportMode === MatterportImportMode.LOCAL_BACKUP_VIEWER)
        ? "ZIP"
        : uploadState.modelType;

    const intendedStatus =
      statusOverride ?? ((formData.get("status") as "DRAFT" | "PUBLISHED") ?? "DRAFT");
    const publishInCatalog =
      intendedStatus === "PUBLISHED" && formData.get("showInCatalogOnPublish") === "on";
    let catalogEnabled = formData.get("catalogEnabled") === "on";
    let catalogStatus = (formData.get("catalogStatus") as CatalogStatus) ?? CatalogStatus.DRAFT;
    const externalListingUrl = String(formData.get("externalListingUrl") ?? "");

    if (publishInCatalog) {
      const catalogPatch = resolveCatalogOnPublish({
        showInCatalog: true,
        catalogStatus,
        externalListingUrl,
      });
      catalogEnabled = catalogPatch.catalogEnabled ?? catalogEnabled;
      catalogStatus = catalogPatch.catalogStatus ?? catalogStatus;
    }

    return {
      name: formData.get("name"),
      address: formData.get("address"),
      city: formData.get("city"),
      postalCode: formData.get("postalCode"),
      price: formData.get("price") || "",
      description: formData.get("description"),
      coverImageUrl: uploadState.coverImageUrl ?? "",
      catalogEnabled,
      catalogStatus,
      catalogTitle: formData.get("catalogTitle"),
      catalogDescription: formData.get("catalogDescription"),
      catalogPrice: formData.get("catalogPrice") || "",
      listingType: (formData.get("listingType") as ListingType) || ListingType.SALE,
      catalogCity: formData.get("catalogCity"),
      catalogPostalCode: formData.get("catalogPostalCode"),
      catalogSurface: formData.get("catalogSurface") || "",
      catalogRooms: formData.get("catalogRooms") || "",
      catalogBedrooms: formData.get("catalogBedrooms") || "",
      catalogCoverImageUrl: catalogCoverImageUrl ?? "",
      externalListingUrl,
      externalListingSource: formData.get("externalListingSource") ?? "",
      modelUrl: effectiveModelUrl,
      modelType: effectiveModelType,
      visitType,
      status: intendedStatus,
      matterportUrl: matterportUrl ?? "",
      matterportEmbedUrl: matterportEmbedUrl ?? "",
      matterportModelId: matterportModelId ?? "",
      matterportImportMode,
      matterportZipOriginalName: matterportZipOriginalName ?? "",
      matterportImportStatus,
      matterportImportError: matterportImportError ?? "",
      matterportLocalManifestUrl: matterportLocalManifestUrl ?? "",
      matterportAuditReportUrl: matterportAuditReportUrl ?? "",
      matterportAuditSummary,
      panoramaScenes,
      hotspots,
    };
  }

  async function persistProperty(statusOverride?: "DRAFT" | "PUBLISHED"): Promise<boolean> {
    const payload = buildPayload(statusOverride);
    const intendedStatus = (payload?.status as "DRAFT" | "PUBLISHED" | undefined) ?? "DRAFT";
    if (!payload?.name || String(payload.name).trim().length < 2) {
      setError("Indiquez le nom de la propriété avant d'enregistrer.");
      setSaveStatus("error");
      return false;
    }
    if (
      intendedStatus === "PUBLISHED" &&
      visitType === VisitType.MATTERPORT &&
      isMatterportEmbedMode(matterportImportMode)
    ) {
      const embedSource = (matterportEmbedUrl ?? matterportUrl ?? "").trim();
      if (!embedSource) {
        setError("Ajoutez un lien Matterport avant publication.");
        setSaveStatus("error");
        return false;
      }
    } else if (
      intendedStatus === "PUBLISHED" &&
      visitType === VisitType.MATTERPORT &&
      matterportImportMode === MatterportImportMode.LOCAL_BACKUP_VIEWER
    ) {
      const localSource = (matterportLocalManifestUrl ?? uploadState.modelUrl ?? "").trim();
      const importReady =
        matterportImportStatus === MatterportImportStatus.READY ||
        matterportImportStatus === MatterportImportStatus.READY_PARTIAL;
      if (!localSource && !importReady) {
        setError("Importez le ZIP Matterport avant publication.");
        setSaveStatus("error");
        return false;
      }
    } else if (
      intendedStatus === "PUBLISHED" &&
      visitType === VisitType.MATTERPORT &&
      isMatterportLocalMode(matterportImportMode) &&
      !uploadState.modelUrl
    ) {
      setError("Ajoutez le fichier local Matterport avant publication.");
      setSaveStatus("error");
      return false;
    } else if (intendedStatus === "PUBLISHED" && !uploadState.modelUrl) {
      setError("Ajoutez d'abord votre modèle 3D (.glb recommandé).");
      setSaveStatus("error");
      return false;
    }

    setSaveStatus("saving");
    setError(null);

    const id = propertyId ?? property?.id;
    const isNewProperty = !id;
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
    setPropertyStatusPreview(intendedStatus);
    setCatalogEnabledPreview(Boolean(payload.catalogEnabled));
    setCatalogStatusPreview(
      (payload.catalogStatus as CatalogStatus) ?? CatalogStatus.DRAFT,
    );
    setSaveStatus("saved");
    if (isNewProperty && visitType === VisitType.MATTERPORT && data.property?.id) {
      router.push(`/admin/properties/${data.property.id}/edit`);
      return true;
    }
    router.refresh();
    return true;
  }

  async function saveDraft() {
    return persistProperty("DRAFT");
  }

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

  const canImportMatterportZip = Boolean(propertyId ?? property?.id);

  function handleMatterportZipSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setMatterportZipSelected(file);
    event.target.value = "";
  }

  async function submitMatterportZipImport() {
    if (!matterportZipSelected) return;
    setMatterportZipUploading(true);
    try {
      await uploadMatterportZip(matterportZipSelected);
    } finally {
      setMatterportZipUploading(false);
    }
  }

  async function uploadMatterportZip(file: File) {
    const id = propertyId ?? property?.id;
    if (!id) {
      setError("Enregistrez d'abord le bien avant d'importer un ZIP Matterport.");
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
          localManifestUrl?: string;
          auditReportUrl?: string;
          auditSummary?: PropertyFormValue["matterportAuditSummary"];
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

    const nextImportMode = data.importMode ?? MatterportImportMode.MATTERPAK_UNKNOWN;
    setVisitType(VisitType.MATTERPORT);
    setMatterportImportMode(nextImportMode);
    setMatterportImportStatus(data.importStatus ?? MatterportImportStatus.READY);
    setMatterportImportError(data.importError ?? null);
    setMatterportLocalManifestUrl(data.localManifestUrl ?? null);
    setMatterportAuditReportUrl(data.auditReportUrl ?? null);
    setMatterportAuditSummary(data.auditSummary ?? null);

    if (isMatterportLocalMode(nextImportMode)) {
      setMatterportRaw("");
      setMatterportUrl(null);
      setMatterportEmbedUrl(null);
      setMatterportModelId(null);
    }

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
    setMatterportLocalManifestUrl(null);
    setMatterportAuditReportUrl(null);
    setMatterportAuditSummary(null);

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
        : intent === "draft"
          ? "DRAFT"
        : ((formData.get("status") as "DRAFT" | "PUBLISHED") ?? "DRAFT");
    const ok = await persistProperty(status);
    setLoading(false);
    if (!ok) return;
  }

  const matterportLocalSource = matterportLocalManifestUrl ?? uploadState.modelUrl;
  const matterportEmbedSource = matterportEmbedUrl ?? matterportUrl ?? "";
  const canSaveDraft =
    visitType === VisitType.MATTERPORT || Boolean(uploadState.modelUrl.trim());
  const matterportImportReady =
    matterportImportStatus === MatterportImportStatus.READY ||
    matterportImportStatus === MatterportImportStatus.READY_PARTIAL;
  const canPublishMatterport =
    visitType !== VisitType.MATTERPORT ||
    (isMatterportEmbedMode(matterportImportMode)
      ? Boolean(matterportEmbedSource.trim())
      : matterportImportMode === MatterportImportMode.LOCAL_BACKUP_VIEWER
        ? Boolean(matterportLocalSource.trim()) || matterportImportReady
        : Boolean(uploadState.modelUrl.trim()));
  const canPublish =
    visitType === VisitType.MATTERPORT
      ? canPublishMatterport
      : Boolean(uploadState.modelUrl.trim());
  const usableMatterportPanoramaCount = matterportAuditSummary?.panoramaCandidates ?? 0;
  const hiddenMatterportCubeGroupCount = matterportAuditSummary?.cubeFaceSetCandidates ?? 0;
  const publicVisitUrl = successUrl ?? (property?.slug ? `/visite/${property.slug}` : null);
  const matterportImportIsProblem =
    matterportImportStatus === MatterportImportStatus.ERROR ||
    matterportImportStatus === MatterportImportStatus.UNSUPPORTED;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="grid gap-8 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]"
    >
      <div className="space-y-8">
        <Card className="space-y-5 bg-white">
          <AdminSectionHeader
            title="Informations générales"
            description="Nom, adresse, prix et description de base du bien."
          />
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
          <AdminSectionHeader
            title="Catalogue public"
            description="Informations affichées sur / et /bien/[slug]. Le lien Leboncoin est optionnel."
          />

          <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-[#0f2f3f]/15 bg-[#f7f5f0] p-4">
            <div>
              <p className="font-bold text-[#0f2f3f]">Afficher dans le catalogue</p>
              <p className="text-muted text-sm">
                Si désactivé, le bien n&apos;apparaît pas publiquement dans le catalogue.
              </p>
            </div>
            <input
              name="catalogEnabled"
              type="checkbox"
              checked={catalogEnabledPreview}
              onChange={(event) => setCatalogEnabledPreview(event.target.checked)}
              className="h-5 w-5 accent-[#2f6f5e]"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalogStatus">Statut catalogue</Label>
              <Select
                id="catalogStatus"
                name="catalogStatus"
                value={catalogStatusPreview}
                onChange={(event) =>
                  setCatalogStatusPreview(event.target.value as CatalogStatus)
                }
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
              <Label htmlFor="listingType">Type d&apos;annonce</Label>
              <Select
                id="listingType"
                name="listingType"
                value={listingTypePreview}
                onChange={(event) =>
                  setListingTypePreview(event.target.value as ListingType)
                }
              >
                <option value={ListingType.SALE}>Vente</option>
                <option value={ListingType.RENT}>Location</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogPrice">
                {listingTypePreview === ListingType.RENT ? "Loyer mensuel" : "Prix de vente"}
              </Label>
              <Input
                id="catalogPrice"
                name="catalogPrice"
                type="number"
                min="0"
                defaultValue={property?.catalogPrice ?? ""}
              />
              {listingTypePreview === ListingType.RENT ? (
                <p className="text-muted text-xs">
                  Montant par mois, hors charges si non précisé.
                </p>
              ) : null}
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

          <div
            className={`rounded-2xl border p-4 ${
              visibleInCatalogPreview
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-amber-200 bg-amber-50/60"
            }`}
          >
            <p className="font-bold text-[#0f2f3f]">Visibilité catalogue</p>
            <div className="mt-3 grid gap-1 text-sm text-[#475467]">
              <p>
                <span className="font-semibold">Visite publiée :</span>{" "}
                {propertyStatusPreview === PropertyStatus.PUBLISHED ? "oui" : "non"}
              </p>
              <p>
                <span className="font-semibold">Catalogue activé :</span>{" "}
                {catalogEnabledPreview ? "oui" : "non"}
              </p>
              <p>
                <span className="font-semibold">Statut catalogue :</span> {catalogStatusPreview}
              </p>
              <p>
                <span className="font-semibold">Lien externe :</span>{" "}
                {property?.externalListingUrl?.trim()
                  ? property.externalListingStatus ?? ExternalListingStatus.UNKNOWN
                  : "vide"}
              </p>
              <p>
                <span className="font-semibold">Visible sur le catalogue :</span>{" "}
                {visibleInCatalogPreview ? "oui" : "non"}
              </p>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#475467]">
              {catalogVisibilityReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="space-y-5 bg-white">
          <AdminSectionHeader
            title="Visite 3D / 360 / hybride"
            description="Modèle 3D, panoramas et points d'intérêt."
          />
          <HybridTourWizard
            visitType={visitType}
            onVisitTypeChange={setVisitType}
            modelUrl={
              visitType === VisitType.MATTERPORT
                ? isMatterportEmbedMode(matterportImportMode)
                  ? matterportEmbedSource
                  : matterportLocalSource
                : uploadState.modelUrl
            }
            modelType={
              visitType === VisitType.MATTERPORT && isMatterportEmbedMode(matterportImportMode)
                ? "ZIP"
                : uploadState.modelType
            }
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
            <AdminSectionHeader
              title="Visite Matterport"
              description="Import local ZIP ou intégration iframe Matterport en ligne."
            />

            <div className="grid gap-5">
              <div className="space-y-3 rounded-2xl border border-[#d7eadf] bg-emerald-50/40 p-4">
                <p className="text-sm font-semibold text-[#0f2f3f]">
                  A. Import local Matterport
                </p>
                <p className="text-sm text-[#475467]">
                  Aucun lien Matterport nécessaire pour ce mode. Le ZIP est audité localement et le
                  viewer utilise le manifest extrait.
                </p>
                {matterportImportMode !== MatterportImportMode.LOCAL_BACKUP_VIEWER ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setMatterportImportMode(MatterportImportMode.LOCAL_BACKUP_VIEWER);
                      setMatterportImportStatus(MatterportImportStatus.NONE);
                      setMatterportImportError(null);
                      setMatterportRaw("");
                      setMatterportUrl(null);
                      setMatterportEmbedUrl(null);
                      setMatterportModelId(null);
                    }}
                  >
                    Choisir l’import local ZIP / backup Matterport
                  </Button>
                ) : null}
                {!canImportMatterportZip ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Enregistrez d&apos;abord le brouillon pour importer le ZIP.
                  </p>
                ) : null}
                <input
                  ref={matterportZipInputRef}
                  id="matterportZip"
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  disabled={!canImportMatterportZip}
                  onChange={handleMatterportZipSelected}
                />
                <div className="relative z-10 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!canImportMatterportZip || matterportZipUploading}
                    onClick={() => matterportZipInputRef.current?.click()}
                  >
                    Choisir un ZIP Matterport
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      !canImportMatterportZip ||
                      !matterportZipSelected ||
                      matterportZipUploading
                    }
                    onClick={() => void submitMatterportZipImport()}
                  >
                    {matterportZipUploading ? "Import en cours…" : "Importer le ZIP"}
                  </Button>
                </div>
                {isMatterportLocalMode(matterportImportMode) && matterportLocalSource ? (
                  <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    Import local actif. Aucun lien Matterport ne sera demandé à l’enregistrement.
                  </p>
                ) : null}
                {matterportZipSelected ? (
                  <p className="text-sm font-semibold text-emerald-800">
                    Fichier sélectionné : {matterportZipSelected.name}
                  </p>
                ) : null}
                <p className="text-xs text-[#667085]">
                  Extraction serveur vers <code>/uploads/matterport/&lt;id&gt;/</code>. Les backups
                  Matterport internes sont maintenant audités : OBJ/GLB si présents, sinon tentative
                  de visite 360 locale depuis les images.
                </p>
                {matterportImportStatus !== MatterportImportStatus.NONE ? (
                  <div className="rounded-2xl border border-[#eee7dc] bg-[#f7f5f0]/60 p-4 text-xs text-[#475467]">
                    <p className="font-semibold">
                      Statut import : {matterportImportStatus}
                      {matterportZipOriginalName ? ` — ${matterportZipOriginalName}` : ""}
                    </p>
                    {matterportImportError ? (
                      <p
                        className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                          matterportImportIsProblem
                            ? "bg-red-50 text-red-700"
                            : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {matterportImportError}
                      </p>
                    ) : null}
                    {matterportAuditSummary ? (
                      <div className="mt-3 grid gap-1 sm:grid-cols-2">
                        <p>ZIP source : {formatBytes(matterportAuditSummary.sourceZipBytes)}</p>
                        <p>
                          Taille extraite :{" "}
                          {formatBytes(
                            matterportAuditSummary.extractedBytes ??
                              matterportAuditSummary.totalBytes,
                          )}
                        </p>
                        <p>Fichiers analysés : {matterportAuditSummary.totalFiles ?? 0}</p>
                        <p>Images : {matterportAuditSummary.imageCount ?? 0}</p>
                        <p>{usableMatterportPanoramaCount} panoramas 360 utilisables</p>
                        <p>
                          {hiddenMatterportCubeGroupCount} groupes cube faces détectés mais non
                          affichés
                        </p>
                        <p>Images optimisées : {matterportAuditSummary.optimizedImageCount ?? 0}</p>
                        <p>Limite actuelle : {matterportAuditSummary.importLimitMb ?? "—"} Mo</p>
                        <p>Scan points : {matterportAuditSummary.scanPointsFound ?? 0}</p>
                        <p>Plan détecté : {matterportAuditSummary.hasFloorplan ? "oui" : "non"}</p>
                        <p>Dollhouse 3D non reconstruit</p>
                        <p className="sm:col-span-2">
                          Mode généré :{" "}
                          {matterportImportMode === MatterportImportMode.LOCAL_BACKUP_VIEWER
                            ? "Visite 360 locale"
                            : matterportImportMode === MatterportImportMode.MATTERPAK_OBJ
                              ? "Modèle 3D local"
                              : matterportImportStatus === MatterportImportStatus.UNSUPPORTED
                                ? "Backup non exploitable"
                                : "Analyse terminée"}
                        </p>
                      </div>
                    ) : null}
                    {matterportAuditReportUrl ? (
                      <a
                        className="mt-3 inline-block font-bold text-[#2f6f5e] underline"
                        href={matterportAuditReportUrl}
                        target="_blank"
                      >
                        Télécharger le rapport d’audit
                      </a>
                    ) : null}
                    {matterportImportMode === MatterportImportMode.LOCAL_BACKUP_VIEWER &&
                    publicVisitUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="ml-0 mt-3 sm:ml-3"
                        onClick={() => window.open(publicVisitUrl, "_blank")}
                      >
                        Ouvrir la visite locale
                      </Button>
                    ) : null}
                    <p className="mt-3 text-[#667085]">
                      Ce rendu local affiche uniquement les panoramas 360 extraits du backup. Il ne
                      reconstruit pas le dollhouse 3D Matterport.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-2xl border border-[#eee7dc] bg-white p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#0f2f3f]">
                    B. Intégration Matterport en ligne
                  </p>
                  <p className="text-sm text-[#667085]">
                    Utilisez ce bloc uniquement si vous voulez afficher une iframe Matterport
                    officielle. Dans ce mode, un lien est obligatoire.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matterportRaw">Lien Matterport ou code iframe</Label>
                  <Textarea
                    id="matterportRaw"
                    value={matterportRaw}
                    onChange={(e) => handleMatterportRaw(e.target.value)}
                    placeholder="Collez une URL https://my.matterport.com/show/?m=... ou un <iframe ...>…"
                  />
                  {isMatterportEmbedMode(matterportImportMode) && matterportImportError ? (
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
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <Card className="h-fit space-y-6 bg-white lg:sticky lg:top-6">
        <AdminSectionHeader
          title="Publication"
          description="Couverture, statut et mise en ligne de la visite."
        />

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
          <Select
            id="status"
            name="status"
            value={propertyStatusPreview}
            onChange={(event) =>
              setPropertyStatusPreview(event.target.value as PropertyStatus)
            }
          >
            <option value={PropertyStatus.DRAFT}>Brouillon</option>
            <option value={PropertyStatus.PUBLISHED}>Publié</option>
          </Select>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-[#eee7dc] bg-[#f7f5f0]/60 p-4">
          <input
            id="showInCatalogOnPublish"
            name="showInCatalogOnPublish"
            type="checkbox"
            checked={showInCatalogOnPublish}
            onChange={(event) => setShowInCatalogOnPublish(event.target.checked)}
            className="mt-1 h-5 w-5 accent-[#2f6f5e]"
          />
          <div>
            <Label htmlFor="showInCatalogOnPublish" className="font-bold text-[#0f2f3f]">
              Afficher dans le catalogue public
            </Label>
            <p className="mt-1 text-sm text-[#667085]">
              Lors de la publication, active le catalogue et met le statut En ligne. Le lien
              Leboncoin reste optionnel.
            </p>
          </div>
        </div>

        {saveStatus !== "idle" ? (
          <p
            className={`rounded-xl p-3 text-sm font-bold ${
              saveStatus === "saving"
                ? "bg-[#f4f1ea] text-[#475467]"
                : saveStatus === "saved"
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-red-100 text-red-900"
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
          <p className="rounded-xl bg-red-100 p-3 text-sm font-semibold text-red-900">{error}</p>
        ) : null}
        {successUrl ? (
          <div className="rounded-xl bg-emerald-100 p-4 text-sm font-semibold text-emerald-900">
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
            (visitType !== VisitType.MATTERPORT && !canPublish)
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
            !canSaveDraft
          }
        >
          {loading ? "Publication…" : "Publier la visite"}
        </Button>

        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="outline"
          className="w-full"
          disabled={
            loading ||
            !canSaveDraft
          }
        >
          {loading ? "Enregistrement..." : property ? "Modifier (brouillon)" : "Créer"}
        </Button>
      </Card>
    </form>
  );
}
