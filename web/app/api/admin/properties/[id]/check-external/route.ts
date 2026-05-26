import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth";
import { checkExternalListing } from "@/lib/external-listing";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const updated = await checkExternalListing(id);
    return NextResponse.json({ property: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Vérification impossible." },
      { status: 400 },
    );
  }
}

