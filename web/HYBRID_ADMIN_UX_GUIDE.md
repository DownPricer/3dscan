# Guide UX — Admin visite hybride 3D + 360

Guide pour les utilisateurs non techniques (agents immobiliers, chargés de publication).

---

## Vue d’ensemble

La création d’une visite passe par un **assistant en étapes**. Vous n’avez pas besoin de connaître les coordonnées 3D : vous uploadez des fichiers, vous cliquez sur le plan, vous prévisualisez, vous publiez.

---

## Étape 1 — Type de visite

Choisissez une carte :

| Type | Usage |
|------|--------|
| **Modèle 3D seulement** | Plan 3D navigable, sans photos 360 |
| **Visite 360 seulement** | Galerie de pièces en panorama |
| **Hybride 3D + 360** | Plan 3D + clic sur un pin → photo 360 de la pièce |

Pour l’hybride, un encadré explique : *« Utilisez le modèle 3D comme plan de navigation, puis ajoutez des photos 360 par pièce. »*

---

## Étape 2 — Modèle 3D global

1. Cliquez **Choisir un fichier 3D**.
2. Envoyez de préférence un **.glb** (export Meshroom / 3D Live Scanner).
3. Attendez le message **Modèle chargé**.
4. Un **aperçu rapide** s’affiche sous le fichier.
5. Cliquez **Enregistrer et continuer** (sauvegarde le brouillon si le nom du bien est renseigné).

> Les fichiers **.zip** ne permettent pas le placement des pins : repassez en .glb.

---

## Étape 3 — Pièces / panoramas

1. **Ajouter pièces types** : Salon, Cuisine, Chambre, Salle de bain.
2. Pour chaque carte : renommez si besoin, **Ajouter photo 360** (JPG/PNG équirectangulaire Insta360).
3. Vérifiez le badge vert **Image 360 ajoutée**.
4. **Remplacer** ou **Supprimer** une pièce si nécessaire.

---

## Étape 4 — Placer les pins (hybride uniquement)

1. Liste à gauche : pièces **orange** (à placer) ou **vertes** (pin OK).
2. Cliquez une pièce, ex. **Salon**.
3. Cliquez sur le **modèle 3D** à l’endroit du pin (sol, seuil, centre de pièce).
4. Passez à la pièce suivante (sélection automatique possible).
5. **Replacer le pin** ou **Supprimer le pin** si besoin.

**Mode avancé** (accordéon en bas) : coordonnées x/y/z pour ajustement fin — à éviter en usage normal.

---

## Étape 5 — Prévisualiser

- Aperçu **identique à la visite publique** : modèle, pins, clic → panorama, retour 3D.
- Lien **Ouvrir la visite publique** si la propriété est déjà enregistrée.

Colonne de droite : **Prévisualiser la visite** (lien après sauvegarde).

---

## Étape 6 — Publier

Checklist :

- Modèle 3D chargé
- Au moins 1 photo 360 (si 360 ou hybride)
- Chaque pièce importante a un pin (hybride)
- Visite enregistrée

Puis **Publier la visite** (colonne droite) ou **Enregistrer le brouillon**.

---

## Indicateurs de sauvegarde

| Message | Signification |
|---------|----------------|
| Enregistrement… | Sauvegarde en cours |
| Sauvegardé | Données enregistrées |
| Erreur de sauvegarde | Voir le message rouge (texte simple) |

---

## Messages d’erreur courants

| Message | Action |
|---------|--------|
| Placez le pin sur le modèle 3D | Cliquez sur une surface du mesh, pas dans le vide |
| Choisissez la photo 360 liée à ce pin | Associez le pin à une pièce avec image |
| Image non envoyée — JPG plus léger | Réduire la taille du fichier panorama |
| Ajoutez d’abord votre modèle 3D | Étape 2 avant la suite |

---

## Mobile / tablette

- L’assistant et les cartes pièces sont **responsive**.
- Le placement des pins est **plus confortable sur ordinateur** (grand écran), mais l’interface reste utilisable sur tablette.

---

## Fichiers techniques (référence)

| Composant | Fichier |
|-----------|---------|
| Assistant | `components/admin/hybrid-tour-wizard.tsx` |
| Cartes pièces | `components/admin/panorama-scene-card.tsx` |
| Placement pins | `components/admin/hotspot-placement-step.tsx` |
| Prévisualisation | `components/admin/hybrid-preview-step.tsx` |
| Messages erreurs | `lib/admin-error-messages.ts` |

Audit détaillé : `UX_HYBRID_ADMIN_AUDIT.md`
