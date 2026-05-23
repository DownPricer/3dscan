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
          ...("status" in parsed ? { status: parsed.status } : {}),
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
