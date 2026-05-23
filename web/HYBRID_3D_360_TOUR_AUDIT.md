# Audit — Mode hybride 3D + 360 (Visitevirtel)

Date : mai 2026  
Projet site : `Visitevirutel` (Next.js 16, React 19, Prisma, R3F/Three.js)  
Projet scan : `3DLiveScanner-main` (Android + `pc_processor` Meshroom → `site_model.glb`)

---

## 1. Viewer 3D actuel

| Élément | Détail |
|--------|--------|
| **Fichier** | `components/viewer/model-viewer.tsx` |
| **Stack** | React Three Fiber + @react-three/drei + Three.js 0.181 |
| **Formats** | GLB/GLTF (`useGLTF`), OBJ+MTL (`OBJLoader`/`MTLLoader`) |
| **Contrôles** | OrbitControls, vue libre / vue du dessus, rendu premium, reset, plein écran, partage |
| **Pas de** | `<model-viewer>` Google, hotspots, multi-scènes |

**Intégration hotspots recommandée :** composant `HotspotMarkers` dans le même `<Center>` que le mesh, avec `Html` (drei) aux coordonnées `(x, y, z)` saisies en admin.

---

## 2. Structure des propriétés (avant hybride)

```prisma
Property {
  modelUrl, modelType (GLB|GLTF|OBJ|ZIP)
  status (DRAFT|PUBLISHED)
  // pas de visitType, pas de panoramas
}
```

**Après hybride :** `visitType`, tables `PanoramaScene` et `Hotspot` (voir `prisma/schema.prisma`).

---

## 3. Upload fichiers 3D

| Étape | Fichier |
|-------|---------|
| Formulaire | `components/admin/property-form.tsx` |
| API | `POST /api/admin/upload` — `kind=model\|cover\|panorama` |
| Stockage | `lib/storage.ts` → `public/uploads/models/`, `covers/`, `panoramas/` |

Pipeline scan : Android → PC Meshroom → `site-ready/site_model.glb` → upload admin manuel.

---

## 4. Stockage

- **Local uniquement** (`UPLOAD_PROVIDER=local`), pas de cloud externe
- Modèles : `/uploads/models/{bundleId}/site_model.glb`
- Panoramas 360 : `/uploads/panoramas/{timestamp-uuid}.jpg`
- Limite : `UPLOAD_MAX_SIZE_MB` (défaut 250 Mo)

---

## 5. Page publique visite

- **Route** : `/visite/[slug]`
- **Fichier** : `app/visite/[slug]/page.tsx`
- **Comportement actuel** : `<ModelViewer />` pour toutes les propriétés
- **Comportement hybride** : `<HybridVisitViewer />` si `visitType = HYBRID_3D_360`

---

## 6. Admin

| Route | Rôle |
|-------|------|
| `/admin` | Dashboard |
| `/admin/properties/new` | Création |
| `/admin/properties/[id]/edit` | Édition + scènes 360 + hotspots |

---

## 7. Support 360 existant

**Aucun** avant cette évolution. Pas de Pannellum ni photo-sphere-viewer.

---

## Réponses aux questions d’architecture

### Où intégrer les hotspots sur le modèle 3D ?

Dans `model-viewer.tsx` (ou wrapper) : marqueurs `Html` (drei) à `position={[x,y,z]}` **à l’intérieur de `<Center>`** pour partager le repère du modèle exporté.

### Comment relier une pièce du modèle à un panorama 360 ?

Table `Hotspot` : `label`, `x`, `y`, `z`, `panoramaSceneId` → `PanoramaScene.imageUrl`.  
Clic hotspot → `setActiveSceneId(panoramaSceneId)` → overlay panorama.

### Comment afficher le panorama sans casser le viewer 3D ?

- **Vue par défaut** : canvas 3D inchangé (orbit, zoom, hotspots)
- **Clic hotspot** : overlay plein écran `PanoramaViewer` (sphère équirectangulaire R3F) au-dessus du canvas, canvas 3D masqué ou en arrière-plan démonté
- **Retour** : fermer overlay → réafficher modèle 3D (état caméra conservé via non-démontage optionnel)

### Quel composant pour le viewer 360 ?

**Photo-sphere via R3F** (`panorama-viewer.tsx`) : sphère inversée + `TextureLoader` sur JPG équirectangulaire.  
Réutilise Three.js déjà présent — pas de dépendance externe, mobile-friendly (touch drag).

Alternative future : Pannellum ou Photo Sphere Viewer si besoin de hotspots *dans* le panorama.

---

## Fichiers clés (chemins absolus)

### Site Visitevirutel
- Viewer 3D : `...\Visitevirutel\components\viewer\model-viewer.tsx`
- Viewer hybride : `...\Visitevirutel\components\viewer\hybrid-visit-viewer.tsx`
- Panorama : `...\Visitevirutel\components\viewer\panorama-viewer.tsx`
- Visite publique : `...\Visitevirutel\app\visite\[slug]\page.tsx`
- Admin : `...\Visitevirutel\components\admin\property-form.tsx`
- Schéma : `...\Visitevirutel\prisma\schema.prisma`

### Scan (non modifié)
- GLB site-ready : `...\3DLiveScanner-main\pc_processor\src\glb_export.py`
- Preview PC : `...\pc_processor\src\run_isolation.py` (`<model-viewer>` local uniquement)

---

## Synthèse

Le site avait une **visite 3D unique** par propriété. Le mode hybride ajoute `visitType`, scènes panorama et hotspots 3D → 360, sans supprimer le viewer 3D ni le futur mode panorama seul.
