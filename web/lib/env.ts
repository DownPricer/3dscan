export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  visitBaseUrl:
    process.env.NEXT_PUBLIC_VISIT_BASE_URL ?? "http://localhost:3000/visite",
  uploadProvider: process.env.UPLOAD_PROVIDER ?? "local",
  uploadMaxSizeMb: Number(process.env.UPLOAD_MAX_SIZE_MB ?? 250),
  jwtSecret: process.env.AUTH_SECRET,
};

export function getRequiredAuthSecret() {
  if (!env.jwtSecret) {
    throw new Error("AUTH_SECRET doit être défini dans les variables d'environnement.");
  }

  return env.jwtSecret;
}
