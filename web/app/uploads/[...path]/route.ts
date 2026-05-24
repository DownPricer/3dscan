import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function contentTypeFor(filename: string): string | null {
  switch (path.extname(filename).toLowerCase()) {
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json";
    case ".obj":
      return "model/obj";
    case ".mtl":
      return "text/plain; charset=utf-8";
    case ".bin":
      return "application/octet-stream";
    case ".zip":
      return "application/zip";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return null;
  }
}

function resolveUploadPath(segments: string[]): string | null {
  if (
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || segment.includes("\0"),
    )
  ) {
    return null;
  }

  const resolved = path.resolve(UPLOADS_ROOT, ...segments);
  const relative = path.relative(UPLOADS_ROOT, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return resolved;
}

async function serveUpload(request: NextRequest, segments: string[]) {
  const filePath = resolveUploadPath(segments);
  if (!filePath) {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = contentTypeFor(path.basename(filePath));
  if (!contentType) {
    return new NextResponse(null, { status: 404 });
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!fileStat.isFile()) {
    return new NextResponse(null, { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(fileStat.size),
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  if (request.method === "HEAD") {
    return new NextResponse(null, { status: 200, headers });
  }

  const body = await readFile(filePath);
  return new NextResponse(body, { status: 200, headers });
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path: segments } = await context.params;
  return serveUpload(request, segments);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const { path: segments } = await context.params;
  return serveUpload(request, segments);
}
