import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth";
import { replaceHybridData } from "@/lib/property-hybrid";
import { getPublicVisitUrl } from "@/lib/public-url";
import { createUniquePropertySlug } from "@/lib/slug";
import { prisma } from "@/lib/prisma";
import { normalizeOptionalString, propertySchema } from "@/lib/validators";

function normalizePropertyPayload(input: unknown) {
  const parsed = propertySchema.parse(input);

  return {
    data: {
      name: parsed.name,
      address: normalizeOptionalString(parsed.address),
      city: normalizeOptionalString(parsed.city),
      postalCode: normalizeOptionalString(parsed.postalCode),
      price: parsed.price === "" ? null : parsed.price ?? null,
      description: normalizeOptionalString(parsed.description),
      coverImageUrl: normalizeOptionalString(parsed.coverImageUrl),
      modelUrl: parsed.modelUrl,
      modelType: parsed.modelType,
      visitType: parsed.visitType,
      status: parsed.status,
    },
    panoramaScenes: parsed.panoramaScenes ?? [],
    hotspots: parsed.hotspots ?? [],
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    properties: properties.map((property) => ({
      ...property,
      publicUrl: getPublicVisitUrl(property.slug),
    })),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const { data, panoramaScenes, hotspots } = normalizePropertyPayload(
      await request.json(),
    );
    const slug = await createUniquePropertySlug(data.name);
    const property = await prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: { ...data, slug },
      });
      if (panoramaScenes.length > 0 || hotspots.length > 0) {
        await replaceHybridData(created.id, panoramaScenes, hotspots, tx);
      }
      return tx.property.findUniqueOrThrow({
        where: { id: created.id },
        include: { panoramaScenes: { orderBy: { sortOrder: "asc" } }, hotspots: true },
      });
    });

    return NextResponse.json(
      { property, publicUrl: getPublicVisitUrl(property.slug) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de créer la propriété.",
      },
      { status: 400 },
    );
  }
}
