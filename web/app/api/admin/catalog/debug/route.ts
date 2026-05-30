import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth";
import {
  getCatalogVisibilityReasons,
  isVisibleInCatalog,
} from "@/lib/catalog-visibility";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const properties = await prisma.property.findMany({
    orderBy: [{ catalogSortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      catalogEnabled: true,
      catalogStatus: true,
      externalListingUrl: true,
      externalListingStatus: true,
      catalogCoverImageUrl: true,
      coverImageUrl: true,
    },
  });

  return NextResponse.json({
    properties: properties.map((property) => ({
      id: property.id,
      slug: property.slug,
      name: property.name,
      status: property.status,
      catalogEnabled: property.catalogEnabled,
      catalogStatus: property.catalogStatus,
      externalListingUrl: property.externalListingUrl,
      externalListingStatus: property.externalListingStatus,
      visibleInCatalog: isVisibleInCatalog(property),
      reasons: getCatalogVisibilityReasons(property),
    })),
  });
}
