import { PropertyStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getPublicVisitUrl } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const property = await prisma.property.findUnique({
    where: { slug },
  });

  if (!property || property.status !== PropertyStatus.PUBLISHED) {
    return NextResponse.json({ error: "Visite introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    property,
    publicUrl: getPublicVisitUrl(property.slug),
  });
}
