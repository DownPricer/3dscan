import { isMatterportUrl } from "@/lib/validators";

export type MatterportParseResult =
  | {
      ok: true;
      matterportUrl: string;
      matterportEmbedUrl: string;
      matterportModelId: string | null;
    }
  | { ok: false; error: string };

function normalizeUrl(url: URL): string {
  url.hash = "";
  return url.toString();
}

function extractModelId(url: URL): string | null {
  const m = url.searchParams.get("m");
  if (m && /^[a-zA-Z0-9]+$/.test(m)) return m;
  return null;
}

function buildEmbedUrl(url: URL): string {
  // Matterport embed généralement basé sur /show/?m=<id>
  const modelId = extractModelId(url);
  if (modelId) {
    const embed = new URL("https://my.matterport.com/show/");
    embed.searchParams.set("m", modelId);
    return normalizeUrl(embed);
  }

  // Fallback: on conserve l'URL telle quelle si elle est déjà Matterport.
  return normalizeUrl(url);
}

export function parseMatterportInput(raw: string): MatterportParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Champ vide." };

  // Iframe HTML -> on extrait src=""
  if (/<iframe\b/i.test(input)) {
    const match = input.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!match?.[1]) {
      return { ok: false, error: "Impossible de lire l’attribut src de l’iframe." };
    }
    raw = match[1];
  } else {
    raw = input;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "URL invalide." };
  }

  if (!isMatterportUrl(url.toString())) {
    return { ok: false, error: "Ce lien ne vient pas de matterport.com." };
  }

  const modelId = extractModelId(url);
  return {
    ok: true,
    matterportUrl: normalizeUrl(url),
    matterportEmbedUrl: buildEmbedUrl(url),
    matterportModelId: modelId,
  };
}

