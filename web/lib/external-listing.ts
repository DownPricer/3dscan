import "server-only";

import { CatalogStatus, ExternalListingStatus } from "@prisma/client";
import { prisma } from "./prisma";

const CHECK_TIMEOUT_MS = 10_000;

function cleanUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "SiteReadySHD/visitevirtuel external-check",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

type CheckResult = {
  status: ExternalListingStatus;
  httpStatus: number | null;
  error: string | null;
};

function classifyHttpStatus(status: number): ExternalListingStatus {
  if (status >= 200 && status <= 399) return ExternalListingStatus.ONLINE;
  if (status === 404 || status === 410) return ExternalListingStatus.OFFLINE;
  if (status === 403) return ExternalListingStatus.CHECK_ERROR;
  return ExternalListingStatus.CHECK_ERROR;
}

async function checkUrlOnce(url: string): Promise<CheckResult> {
  // HEAD d’abord, puis fallback GET si HEAD n’aide pas.
  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" });
    const headClass = classifyHttpStatus(head.status);
    if (headClass === ExternalListingStatus.ONLINE) {
      return { status: ExternalListingStatus.ONLINE, httpStatus: head.status, error: null };
    }
    if (headClass === ExternalListingStatus.OFFLINE) {
      return { status: ExternalListingStatus.OFFLINE, httpStatus: head.status, error: null };
    }

    // Certains sites bloquent HEAD ou renvoient des statuts ambigus → fallback GET.
    const shouldFallbackGet =
      head.status === 405 || head.status === 501 || (head.status >= 400 && head.status !== 404);
    if (!shouldFallbackGet) {
      return { status: headClass, httpStatus: head.status, error: null };
    }
  } catch (error) {
    // Erreur réseau/timeout → on tentera GET ensuite.
    const message = error instanceof Error ? error.message : "Erreur réseau";
    // continue
    void message;
  }

  try {
    const get = await fetchWithTimeout(url, { method: "GET" });
    const cls = classifyHttpStatus(get.status);
    return { status: cls, httpStatus: get.status, error: null };
  } catch (error) {
    return {
      status: ExternalListingStatus.CHECK_ERROR,
      httpStatus: null,
      error: error instanceof Error ? error.message : "Erreur réseau",
    };
  }
}

export async function checkExternalListing(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      externalListingUrl: true,
      catalogStatus: true,
    },
  });

  if (!property) {
    throw new Error("Propriété introuvable.");
  }

  const url = cleanUrl(property.externalListingUrl);
  const now = new Date();

  if (!url) {
    return prisma.property.update({
      where: { id: property.id },
      data: {
        externalListingStatus: ExternalListingStatus.UNKNOWN,
        externalLastCheckedAt: now,
        externalLastStatusCode: null,
        externalLastError: null,
      },
      select: {
        id: true,
        externalListingStatus: true,
        externalLastCheckedAt: true,
        externalLastStatusCode: true,
        externalLastError: true,
        catalogStatus: true,
      },
    });
  }

  const result = await checkUrlOnce(url);

  const nextCatalogStatus =
    result.status === ExternalListingStatus.OFFLINE && property.catalogStatus === CatalogStatus.ONLINE
      ? CatalogStatus.EXTERNAL_DOWN
      : undefined;

  return prisma.property.update({
    where: { id: property.id },
    data: {
      externalListingStatus: result.status,
      externalLastCheckedAt: now,
      externalLastStatusCode: result.httpStatus,
      externalLastError: result.error,
      ...(nextCatalogStatus ? { catalogStatus: nextCatalogStatus } : {}),
    },
    select: {
      id: true,
      externalListingStatus: true,
      externalLastCheckedAt: true,
      externalLastStatusCode: true,
      externalLastError: true,
      catalogStatus: true,
    },
  });
}

