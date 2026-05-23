# Audit — Placement de hotspots par clic (admin)

## Fichiers analysés

| Fichier | Rôle |
|---------|------|
| `components/admin/hybrid-property-section.tsx` | Formulaire scènes + hotspots (x/y/z manuels) |
| `components/viewer/model-viewer.tsx` | Viewer public : `Bounds margin={1.25}` + `Center` + pins `Html` |
| `components/viewer/hybrid-visit-viewer.tsx` | Orchestre public, délègue à `ModelViewer` |
| `lib/hybrid-types.ts` | `HotspotInput` / `HotspotPublic` avec x, y, z |
| `components/admin/property-form.tsx` | Passe `modelUrl` / `modelType` via `uploadState` |

## Repère des coordonnées (critique)

Le viewer public place les pins **à l’intérieur de `<Center>`** (drei), après `<Bounds fit margin={1.25}>`.  
Les coordonnées stockées en base sont donc dans l’**espace local du groupe centré**, pas dans l’espace brut du fichier GLB/OBJ.

**Règle admin :** même empilement `Bounds (1.25) → Center → group ref → modèle + pins`.  
Au clic : `groupRef.worldToLocal(event.point)` → `{ x, y, z }` identiques au public.

## Réponses architecture

### Où intégrer le viewer admin ?

Composant dédié **`components/admin/hotspot-placement-viewer.tsx`**, monté dans `hybrid-property-section.tsx` sous la liste des hotspots (uniquement si `visitType === HYBRID_3D_360` et `modelUrl` présent).

### Comment récupérer les coordonnées 3D du clic ?

- `onPointerDown` sur le mesh (`<primitive object={...} />`)
- `event.stopPropagation()` pour ne pas interférer avec l’orbite
- `coordSpaceRef.worldToLocal(event.point.clone())`
- `Canvas onPointerMissed` si clic hors mesh → message « Aucune surface détectée »

### Synchronisation formulaire

État parent `placingHotspotIndex` :
1. Clic « Placer sur le modèle » → active le mode placement
2. Clic mesh → `updateHotspot(index, { x, y, z })` + désactive le mode
3. Champs x/y/z restent éditables manuellement

### Éviter de modifier le viewer public

- **Aucun changement** à `model-viewer.tsx` / `hybrid-visit-viewer.tsx` pour cette feature
- Viewer admin **fichier séparé**, importé uniquement depuis l’admin

## Cohérence public / admin

| Paramètre | Public | Admin placement |
|-----------|--------|-----------------|
| Bounds margin | 1.25 | 1.25 |
| Center | oui | oui |
| Conversion clic | — | `worldToLocal` sur `coordSpaceRef` |
| Pins | `Html` dans Center | idem |

Si décalage après test : vérifier que `Center` et `Bounds` sont identiques ; ne pas stocker de coords monde brutes.
