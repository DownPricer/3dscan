import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth";
import { uploadFiles } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await requireAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData
      .getAll("file")
      .filter((file): file is File => file instanceof File);
    const kind = formData.get("kind");

    if (files.length === 0) {
      return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }

    if (kind !== "model" && kind !== "cover" && kind !== "panorama") {
      return NextResponse.json({ error: "Type d'upload invalide." }, { status: 400 });
    }

    const uploaded = await uploadFiles(files, kind);
    return NextResponse.json(uploaded);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload impossible." },
      { status: 400 },
    );
  }
}
