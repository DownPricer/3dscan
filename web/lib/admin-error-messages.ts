/**
 * Traduit les erreurs techniques (API, Zod, upload) en messages compréhensibles.
 */
export function formatAdminError(raw: string | undefined | null): string {
  if (!raw?.trim()) {
    return "Une erreur est survenue. Réessayez ou contactez le support.";
  }

  const msg = raw.trim();
  const lower = msg.toLowerCase();

  if (
    lower.includes("panoramasceneid") ||
    lower.includes("panorama scene") ||
    lower.includes("panorama cible")
  ) {
    return "Choisissez la photo 360 liée à ce pin.";
  }

  if (
    (lower.includes("invalid") || lower.includes("invalide")) &&
    (lower.includes(" x") || lower.includes('"x"') || lower.includes("coordinate") || lower.includes("coordonn"))
  ) {
    return "Placez le pin sur le modèle 3D.";
  }

  if (
    lower.includes("upload failed") ||
    lower.includes("upload impossible") ||
    lower.includes("échec") && lower.includes("upload")
  ) {
    return "L'image n'a pas pu être envoyée. Essayez une image JPG ou PNG moins lourde.";
  }

  if (lower.includes("modèle 3d est obligatoire") || lower.includes("modelurl")) {
    return "Ajoutez d'abord votre modèle 3D (.glb recommandé).";
  }

  if (lower.includes("image panorama est obligatoire") || lower.includes("imageurl")) {
    return "Ajoutez une photo 360 pour cette pièce.";
  }

  if (lower.includes("nom de la pièce")) {
    return "Donnez un nom à la pièce (ex. Salon, Cuisine).";
  }

  if (lower.includes("label du hotspot") || lower.includes("label")) {
    return "Le nom du pin est obligatoire.";
  }

  if (lower.includes("non autorisé") || lower.includes("unauthorized")) {
    return "Session expirée. Reconnectez-vous à l'admin.";
  }

  if (lower.includes("enregistrement impossible") || lower.includes("impossible de créer")) {
    return "La visite n'a pas pu être enregistrée. Vérifiez les champs obligatoires.";
  }

  return msg;
}
