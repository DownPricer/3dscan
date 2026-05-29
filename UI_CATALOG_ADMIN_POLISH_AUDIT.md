# Audit UI — Catalogue public & Admin

Date : 2026-05-29

## Fichiers audités

- `web/app/page.tsx`
- `web/app/bien/[slug]/page.tsx`
- `web/components/admin/property-form.tsx`
- `web/app/admin/(protected)/page.tsx`
- `web/components/ui/button.tsx`
- `web/components/ui/badge.tsx`
- `web/components/ui/card.tsx`

---

## Problèmes identifiés

### Textes illisibles

| Zone | Problème |
|------|----------|
| Badges sur images catalogue | Fond `bg-[#0f2f3f]/10` semi-transparent → texte foncé illisible sur photo |
| Bouton « Voir le bien » | Variant `default` foncé OK, mais parfois perçu comme noir sur bleu selon rendu |
| Bouton « Visite virtuelle » | Variant `secondary` blanc sur carte blanche — peu de contraste |
| Bouton « Lancer la visite virtuelle » | Même variant secondary, action principale pas assez visible |
| Admin « Modifier » / « Voir » | Tous en `secondary` blanc — actions peu différenciées |
| Textes secondaires | `#667085` trop clair sur fond crème |

### Couleurs trop faibles

- Badges `published` : vert pâle sur image
- Badges `default` : 10 % d'opacité sur photos
- Boutons secondary : ring fin `#0f2f3f/15` peu visible
- Placeholder images : icône à 30 % d'opacité

### Boutons sans contraste

- Pas de variant `outline` avec bordure épaisse
- Action secondaire et primaire trop proches visuellement
- CTA hero en `secondary` au lieu de primaire

### Images trop petites

- Cards catalogue : `h-44` (176 px) — en dessous du minimum 220–240 px demandé
- Page détail : 320–420 px OK mais prix/description mal hiérarchisés

### Sections mal rangées

- Hero trop verbeux, pas de barre recherche/filtres
- Cards sans description courte
- Page détail : prix relégué en sidebar, description noyée
- Admin : sections formulaire sans séparation visuelle forte

### Éléments admin confus

- Formulaire propriété : blocs Publication / Catalogue / 3D / Matterport collés
- Boutons sidebar publication peu différenciés (brouillon vs publier)
- Messages erreur/succès OK mais textes d'aide trop pâles

---

## Correctifs appliqués

1. **Design system** — boutons `default` / `outline` / `secondary`, badge `overlay` pour images
2. **Catalogue `/`** — hero épuré, barre filtres client-side, grille espacée, cards 16/10
3. **Cards** — images 240 px+, badges opaques, prix 24 px, description 2 lignes, boutons contrastés
4. **`/bien/[slug]`** — hero large, prix XXL, caractéristiques icônes, sidebar sticky, description visible
5. **CTA propriétaire** — bandeau bas de page catalogue
6. **Admin** — boutons primaire/outline, sections titrées, textes `#475467`
