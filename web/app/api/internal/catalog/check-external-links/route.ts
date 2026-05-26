import { ExternalListingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { checkExternalListing } from "@/lib/external-listing";
import { prisma } from "@/lib/prisma";

function readBearerSecret(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.CATALOG_CHECK_SECRET ?? "";
  if (!expected) return false;
  const bearer = readBearerSecret(request);
  const query = request.nextUrl.searchParams.get("secret");
  const provided = bearer ?? query;
  return Boolean(provided && provided === expected);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const candidates = await prisma.property.findMany({
    where: {
      externalListingUrl: { not: null, notIn: [""] },
      OR: [{ externalLastCheckedAt: null }, { externalLastCheckedAt: { lt: cutoff } }],
    },
    orderBy: { externalLastCheckedAt: "asc" },
    take: 20,
    select: { id: true },
  });

  const summary = { checked: 0, online: 0, offline: 0, errors: 0 };

  for (const property of candidates) {
    const updated = await checkExternalListing(property.id);
    summary.checked += 1;
    if (updated.externalListingStatus === ExternalListingStatus.ONLINE) summary.online += 1;
    else if (updated.externalListingStatus === ExternalListingStatus.OFFLINE) summary.offline += 1;
    else if (updated.externalListingStatus === ExternalListingStatus.CHECK_ERROR) summary.errors += 1;
  }

  return NextResponse.json(summary);
}

