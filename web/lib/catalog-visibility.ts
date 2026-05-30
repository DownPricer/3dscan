import {
  CatalogStatus,
  ExternalListingStatus,
  PropertyStatus,
  type Prisma,
} from "@prisma/client";

export type CatalogVisibilityInput = {
  status: PropertyStatus;
  catalogEnabled: boolean;
  catalogStatus: CatalogStatus;
  externalListingUrl?: string | null;
  externalListingStatus: ExternalListingStatus;
  catalogCoverImageUrl?: string | null;
  coverImageUrl?: string | null;
};

export function hasExternalListingUrl(url?: string | null) {
  return Boolean(url?.trim());
}

export function isExternalListingBlocking(status: ExternalListingStatus, url?: string | null) {
  if (!hasExternalListingUrl(url)) return false;
  return status === ExternalListingStatus.OFFLINE;
}

export function isVisibleInCatalog(property: CatalogVisibilityInput): boolean {
  if (property.status !== PropertyStatus.PUBLISHED) return false;
  if (!property.catalogEnabled) return false;
  if (property.catalogStatus !== CatalogStatus.ONLINE) return false;
  if (isExternalListingBlocking(property.externalListingStatus, property.externalListingUrl)) {
    return false;
  }
  return true;
}

export function getCatalogVisibilityReasons(property: CatalogVisibilityInput): string[] {
  const reasons: string[] = [];

  if (property.status !== PropertyStatus.PUBLISHED) {
    reasons.push("La visite est encore en brouillon");
  }
  if (!property.catalogEnabled) {
    reasons.push("Le catalogue n'est pas activé");
  }
  if (property.catalogStatus === CatalogStatus.DRAFT) {
    reasons.push("Le statut catalogue n'est pas En ligne");
  } else if (property.catalogStatus === CatalogStatus.HIDDEN) {
    reasons.push("Le statut catalogue est Masqué");
  } else if (property.catalogStatus === CatalogStatus.SOLD) {
    reasons.push("Le statut catalogue est Vendu");
  } else if (property.catalogStatus === CatalogStatus.EXTERNAL_DOWN) {
    reasons.push("Le statut catalogue est Lien externe hors ligne");
  } else if (property.catalogStatus !== CatalogStatus.ONLINE) {
    reasons.push("Le statut catalogue n'est pas En ligne");
  }
  if (isExternalListingBlocking(property.externalListingStatus, property.externalListingUrl)) {
    reasons.push("Le lien externe est marqué hors ligne");
  }

  const hasCover = Boolean(property.catalogCoverImageUrl?.trim() || property.coverImageUrl?.trim());
  if (!hasCover) {
    reasons.push("Aucune image de couverture, mais ce n'est pas bloquant");
  }

  if (isVisibleInCatalog(property)) {
    return ["Visible sur le catalogue", ...reasons.filter((r) => r.includes("couverture"))];
  }

  return reasons;
}

export const catalogVisibilityWhere = {
  status: PropertyStatus.PUBLISHED,
  catalogEnabled: true,
  catalogStatus: CatalogStatus.ONLINE,
  OR: [
    { externalListingUrl: null },
    { externalListingUrl: "" },
    { externalListingStatus: ExternalListingStatus.UNKNOWN },
    { externalListingStatus: ExternalListingStatus.ONLINE },
    { externalListingStatus: ExternalListingStatus.CHECK_ERROR },
  ],
} satisfies Prisma.PropertyWhereInput;

export function resolveExternalListingStatus(
  url: string | null | undefined,
  current?: ExternalListingStatus | null,
): ExternalListingStatus {
  if (!hasExternalListingUrl(url)) {
    return ExternalListingStatus.UNKNOWN;
  }
  return current ?? ExternalListingStatus.UNKNOWN;
}

export function resolveCatalogOnPublish(input: {
  showInCatalog: boolean;
  catalogStatus?: CatalogStatus | null;
  externalListingUrl?: string | null;
}) {
  if (!input.showInCatalog) {
    return {};
  }

  const nextCatalogStatus =
    !input.catalogStatus || input.catalogStatus === CatalogStatus.DRAFT
      ? CatalogStatus.ONLINE
      : input.catalogStatus;

  return {
    catalogEnabled: true,
    catalogStatus: nextCatalogStatus,
    externalListingStatus: resolveExternalListingStatus(input.externalListingUrl),
  };
}
