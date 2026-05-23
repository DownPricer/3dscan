import { env } from "@/lib/env";

export function getPublicVisitUrl(slug: string) {
  const base = env.visitBaseUrl.replace(/\/$/, "");
  return `${base}/${slug}`;
}
