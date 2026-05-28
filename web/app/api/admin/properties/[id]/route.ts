import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth";
import { getPublicVisitUrl } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";
import { createUniquePropertySlug } from "@/lib/slug";
import { replaceHybridData } from "@/lib/property-hybrid";
import { normalizeOptionalString, propertyUpdateSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });

  if (!property) {
    return NextResponse.json({ error: "Propriété introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    property,
    publicUrl: getPublicVisitUrl(property.slug),
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const current = await prisma.property.findUnique({ where: { id } });

    if (!current) {
      return NextResponse.json({ error: "Propriété introuvable." }, { status: 404 });
    }

    const parsed = propertyUpdateSchema.parse(await request.json());
    const slug =
      parsed.name && parsed.name !== current.name
        ? await createUniquePropertySlug(parsed.name, id)
        : current.slug;

    const property = await prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id },
        data: {
          ...("name" in parsed ? { name: parsed.name } : {}),
          slug,
          ...("address" in parsed
            ? { address: normalizeOptionalString(parsed.address) }
            : {}),
          ...("city" in parsed ? { city: normalizeOptionalString(parsed.city) } : {}),
          ...("postalCode" in parsed
            ? { postalCode: normalizeOptionalString(parsed.postalCode) }
            : {}),
          ...("price" in parsed
            ? { price: parsed.price === "" ? null : parsed.price ?? null }
            : {}),
          ...("description" in parsed
            ? { description: normalizeOptionalString(parsed.description) }
            : {}),
          ...("coverImageUrl" in parsed
            ? { coverImageUrl: normalizeOptionalString(parsed.coverImageUrl) }
            : {}),
          ...("modelUrl" in parsed ? { modelUrl: parsed.modelUrl } : {}),
          ...("modelType" in parsed ? { modelType: parsed.modelType } : {}),
          ...("visitType" in parsed ? { visitType: parsed.visitType } : {}),
          ...("matterportUrl" in parsed
            ? { matterportUrl: normalizeOptionalString(parsed.matterportUrl) }
            : {}),
          ...("matterportEmbedUrl" in parsed
            ? { matterportEmbedUrl: normalizeOptionalString(parsed.matterportEmbedUrl) }
            : {}),
          ...("matterportModelId" in parsed
            ? { matterportModelId: normalizeOptionalString(parsed.matterportModelId) }
            : {}),
          ...("matterportImportMode" in parsed
            ? {
                matterportImportMode:
                  parsed.matterportImportMode === "" ? null : parsed.matterportImportMode,
              }
            : {}),
          ...("matterportZipOriginalName" in parsed
            ? { matterportZipOriginalName: normalizeOptionalString(parsed.matterportZipOriginalName) }
            : {}),
          ...("matterportImportStatus" in parsed
            ? { matterportImportStatus: parsed.matterportImportStatus }
            : {}),
          ...("matterportImportError" in parsed
            ? { matterportImportError: normalizeOptionalString(parsed.matterportImportError) }
            : {}),
          ...("status" in parsed ? { status: parsed.status } : {}),
          ...("catalogEnabled" in parsed ? { catalogEnabled: parsed.catalogEnabled } : {}),
          ...("catalogStatus" in parsed ? { catalogStatus: parsed.catalogStatus } : {}),
          ...("catalogTitle" in parsed
            ? { catalogTitle: normalizeOptionalString(parsed.catalogTitle) }
            : {}),
          ...("catalogSubtitle" in parsed
            ? { catalogSubtitle: normalizeOptionalString(parsed.catalogSubtitle) }
            : {}),
          ...("catalogPriceLabel" in parsed
            ? { catalogPriceLabel: normalizeOptionalString(parsed.catalogPriceLabel) }
            : {}),
          ...("catalogCityLabel" in parsed
            ? { catalogCityLabel: normalizeOptionalString(parsed.catalogCityLabel) }
            : {}),
          ...("catalogDescription" in parsed
            ? { catalogDescription: normalizeOptionalString(parsed.catalogDescription) }
            : {}),
          ...("catalogPrice" in parsed
            ? { catalogPrice: parsed.catalogPrice === "" ? null : parsed.catalogPrice ?? null }
            : {}),
          ...("catalogCity" in parsed
            ? { catalogCity: normalizeOptionalString(parsed.catalogCity) }
            : {}),
          ...("catalogPostalCode" in parsed
            ? { catalogPostalCode: normalizeOptionalString(parsed.catalogPostalCode) }
            : {}),
          ...("catalogSurface" in parsed
            ? { catalogSurface: parsed.catalogSurface === "" ? null : parsed.catalogSurface ?? null }
            : {}),
          ...("catalogRooms" in parsed
            ? { catalogRooms: parsed.catalogRooms === "" ? null : parsed.catalogRooms ?? null }
            : {}),
          ...("catalogBedrooms" in parsed
            ? {
                catalogBedrooms:
                  parsed.catalogBedrooms === "" ? null : parsed.catalogBedrooms ?? null,
              }
            : {}),
          ...("catalogLandSurface" in parsed
            ? {
                catalogLandSurface:
                  parsed.catalogLandSurface === "" ? null : parsed.catalogLandSurface ?? null,
              }
            : {}),
          ...("catalogPropertyType" in parsed
            ? { catalogPropertyType: normalizeOptionalString(parsed.catalogPropertyType) }
            : {}),
          ...("catalogTags" in parsed ? { catalogTags: parsed.catalogTags ?? [] } : {}),
          ...("catalogFeatured" in parsed ? { catalogFeatured: parsed.catalogFeatured } : {}),
          ...("catalogSortOrder" in parsed
            ? { catalogSortOrder: parsed.catalogSortOrder ?? 0 }
            : {}),
          ...("externalUrl" in parsed
            ? { externalUrl: normalizeOptionalString(parsed.externalUrl) }
            : {}),
          ...("externalSource" in parsed
            ? { externalSource: normalizeOptionalString(parsed.externalSource) }
            : {}),
          ...("externalStatus" in parsed ? { externalStatus: parsed.externalStatus } : {}),
          ...("catalogCoverImageUrl" in parsed
            ? { catalogCoverImageUrl: normalizeOptionalString(parsed.catalogCoverImageUrl) }
            : {}),
          ...("externalListingUrl" in parsed
            ? { externalListingUrl: normalizeOptionalString(parsed.externalListingUrl) }
            : {}),
          ...("externalListingSource" in parsed
            ? {
                externalListingSource:
                  parsed.externalListingSource === "" ? null : parsed.externalListingSource,
              }
            : {}),
          ...("externalListingStatus" in parsed
            ? { externalListingStatus: parsed.externalListingStatus }
            : {}),
        },
      });

      if ("panoramaScenes" in parsed || "hotspots" in parsed) {
        await replaceHybridData(
          id,
          parsed.panoramaScenes ?? [],
          parsed.hotspots ?? [],
          tx,
        );
      }

      return tx.property.findUniqueOrThrow({
        where: { id },
        include: { panoramaScenes: { orderBy: { sortOrder: "asc" } }, hotspots: true },
      });
    });

    return NextResponse.json({
      property,
      publicUrl: getPublicVisitUrl(property.slug),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de modifier la propriété.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const { id } = await params;
  await prisma.property.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
