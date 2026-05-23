# SITE_3D_MODEL_REQUIREMENTS (Site Ready SHD)

Ce document décrit **les formats, contraintes et informations idéales** pour que l’application de scan 3D exporte des fichiers affichables **proprement, rapidement et fidèlement** sur le site Site Ready SHD.

Il est basé sur l’implémentation actuelle :

- **Viewer** : `components/viewer/model-viewer.tsx` (React Three Fiber + drei)
- **Upload admin** : `components/admin/property-form.tsx`
- **API upload** : `app/api/admin/upload/route.ts`
- **Stockage** : `lib/storage.ts` (MVP en local, fichiers servis depuis `public/uploads`)
- **Page visite** : `app/visite/[slug]/page.tsx`

## 1) Quel format 3D est le meilleur pour le site ?

### Résumé

- **Format recommandé #1 : GLB (`.glb`)**
- **Acceptable : GLTF (`.gltf`)** (avec ressources correctement packagées)
- **Acceptable (fallback) : OBJ + MTL + textures** (multi-fichiers, fragile mais supporté)
- **À éviter : ZIP** (accepté à l’upload mais le viewer ne l’affiche pas)
- **Non supporté actuellement : PLY (`.ply`)** (ni loader ni upload “principal”)

### Comparatif détaillé (par rapport au code)

#### GLB (`.glb`) — **recommandé**

**Pourquoi c’est le meilleur choix ici :**

- Le viewer charge GLB/GLTF via `useGLTF` (GLTFLoader) → stable et standard web.
- **Un seul fichier** = moins d’erreurs (pas de textures manquantes, pas de chemins relatifs cassés).
- Meilleur contrôle du rendu (PBR), compatibilité mobile supérieure.
- L’upload et le stockage du site sont pensés “1 fichier modèle = 1 URL”.

**Ce que le site attend idéalement :**

- GLB **avec textures embarquées** (ou à défaut, textures à côté mais c’est moins robuste).
- Matériaux PBR (baseColor/roughness/metalness) si possible.

#### GLTF (`.gltf`) — acceptable (mais à condition)

Le site peut charger du GLTF, mais :

- Un `.gltf` “JSON” référence souvent des fichiers externes (`.bin`, textures).
- Si les fichiers associés ne sont pas bien packagés/servis à côté, le rendu casse.

**Recommandation :** si tu exportes en GLTF, exporte **en GLB** à la place dès que possible.

#### OBJ + MTL + textures — acceptable en fallback (supporté)

Le site supporte maintenant l’upload **multi-fichiers** pour OBJ :

- L’admin peut sélectionner en même temps : `.obj` + `.mtl` + textures (`.png/.jpg/.webp`) + `.bin`.
- Le stockage place tout dans un même dossier (`/uploads/models/<bundleId>/...`) et le viewer :
  - lit l’OBJ,
  - détecte `mtllib ...`,
  - charge le MTL,
  - charge les textures **avec le même `baseUrl`**.

**Limites OBJ/MTL (raison d’éviter si possible) :**

- Fragile (chemins, noms, encodage MTL, textures manquantes → rendu gris).
- Matériaux plus pauvres que GLB PBR.
- Performance moins bonne (parsing text, tailles plus grosses).

#### PLY (`.ply`) — **non supporté**

- Le site n’a pas de loader PLY.
- L’upload n’accepte pas `.ply` comme fichier principal.

Si l’app de scan sort du PLY, il faut le convertir côté scan (idéalement → GLB).

#### ZIP (`.zip`) — **à éviter pour l’instant**

- Le site peut uploader un ZIP **mais ne sait pas l’extraire/servir** automatiquement.
- Le viewer affiche un message “ZIP non disponible dans ce MVP”.

## 2) Quelle taille de fichier maximale recommander ?

Le site permet techniquement de gros uploads (configurée à **250 MB**), mais pour l’expérience utilisateur **mobile-first**, il faut viser beaucoup plus bas.

### Recommandations “poids total téléchargé” (modèle + textures)

#### Mobile (4G/5G variable)

- **Idéal** : **≤ 25 MB**
- **Acceptable** : **25–60 MB**
- **Lourd** : **60–120 MB**
- **À éviter** : **> 120 MB**

#### Ordinateur (wifi/ethernet)

- **Idéal** : **≤ 60 MB**
- **Acceptable** : **60–150 MB**
- **Lourd** : **150–250 MB**
- **À éviter** : **> 250 MB**

#### Connexion mauvaise / zones faibles

- **Idéal** : **≤ 15 MB**
- **Acceptable** : **15–40 MB**
- **À éviter** : **> 40 MB**

### Note importante

Le viewer actuel n’a pas (encore) :

- de barre de progression
- de streaming “progressif” type LOD automatique
- de fallback “modèle trop lourd”

Donc **plus c’est lourd**, plus l’impression est “ça bloque / ça ne marche pas” sur téléphone.

## 3) Quel niveau de détail est idéal ?

Le bon compromis dépend de la surface scannée et de l’usage (plan global vs détails de finition).

### Recommandations (triangles / vertices)

#### Mobile (objectif prioritaire)

- **Idéal** : **200k – 600k triangles**
- **Acceptable** : **600k – 1.2M triangles**
- **Lourd** : **1.2M – 2.5M triangles**
- **À éviter** : **> 2.5M triangles**

#### Desktop

- **Idéal** : **0.8M – 2M triangles**
- **Acceptable** : **2M – 4M triangles**
- **À éviter** : **> 4M triangles**

### Recommandations de simplification

- Garder les arêtes structurantes (murs/sol/plafond) → éviter une décimation “uniforme” qui détruit la lecture du bien.
- Vérifier les **normales** et le **smoothing** : l’effet “facettes” vient souvent de normales non lissées / cassées.
- Éviter un lissage excessif qui rend les surfaces “molles”.

### Compression (fortement recommandée)

Le site **ne décode pas encore** (dans le code actuel) :

- Draco
- Meshopt
- KTX2/Basis

Donc, si l’app de scan exporte un GLB compressé, **il faudra aussi ajouter le support côté site**. Pour un export “plug & play” immédiat, exporte en GLB non Draco, textures WebP/JPEG optimisées.

## 4) Quelles textures sont recommandées ?

### Ce que le site “préfère”

- **GLB avec textures intégrées** (robuste, 1 seul fichier)
- Sinon : textures **à côté** avec chemins relatifs propres (GLTF JSON + `.bin` + textures)
- Pour OBJ : textures référencées dans le `.mtl` et présentes dans le même dossier.

### Formats d’images

- **Recommandé** : **WebP** (bon rapport qualité/poids)
- **Acceptable** : **JPEG** (diffuse/baseColor)
- **Acceptable** : **PNG** (si transparence indispensable, sinon éviter)

### Résolution & nombre de textures

Mobile charge vite si on reste raisonnable :

- **Idéal** : 1 à 6 textures principales, max **2048×2048**
- **Acceptable** : jusqu’à 10–12 textures, max **4096×4096** (desktop OK, mobile parfois lourd)
- **À éviter** : textures > 4096, ou des dizaines de textures séparées

### Types de maps (si GLB PBR)

Priorité :

- BaseColor (diffuse/albedo)
- Roughness/Metalness (souvent packées)
- Normal map (si elle apporte vraiment)
- AO (optionnel)

Si tu dois choisir, préfère **BaseColor + une normal map légère** plutôt que beaucoup de maps lourdes.

## 5) Orientation, échelle, origine (pivot)

Le viewer :

- utilise `Bounds` + `Center` pour recadrer automatiquement,
- place la caméra “vue libre” à \(x=4, y=3, z=6\),
- place la caméra “vue du dessus” à \(x=0, y=12, z≈0\),
- utilise une ombre de contact proche de \(y≈0\).

### Recommandations d’export (à respecter côté scan)

- **Unités : mètres** (ou conversion vers mètres avant export).
- **Axe vertical : Y+ vers le haut** (standard Three.js).
- **Sol horizontal** : le plan du sol doit être stable (pas incliné).
- **Origine / pivot** :
  - idéal : modèle centré sur X/Z,
  - et le sol “pose” autour de **Y = 0** (le point le plus bas au sol).
- **Échelle réelle** : la taille du bien doit correspondre à la réalité (1 unité = 1 m).

### Caméra initiale idéale (si tu veux exporter des hints)

- Target : centre du bien (0, 1.2, 0) environ
- Distance : 6–12 m selon taille

Le site recadre déjà, mais fournir ces métadonnées permettrait un meilleur “premier plan”.

## 6) Métadonnées utiles (`metadata.json` optionnel)

Le site n’en dépend pas aujourd’hui, mais un `metadata.json` exporté à côté du modèle serait très utile pour :

- afficher des infos qualité / poids / temps de scan,
- adapter le viewer (DPR, qualité, warnings),
- diagnostiquer rapidement un rendu “bizarre”.

### Schéma proposé

```json
{
  "scanName": "Appartement - Salon",
  "scanDate": "2026-05-18T13:52:39+02:00",
  "sourceApp": {
    "name": "3D Life Scanner",
    "version": "1.2.3",
    "device": "iPhone 15 Pro",
    "sensor": "LiDAR"
  },
  "model": {
    "format": "glb",
    "unit": "meter",
    "upAxis": "Y",
    "file": {
      "name": "appartement-salon.glb",
      "sizeBytes": 28451234
    },
    "geometry": {
      "triangles": 620000,
      "vertices": 410000,
      "hasNormals": true,
      "hasUVs": true
    },
    "textures": {
      "embedded": true,
      "count": 6,
      "maxResolution": 2048,
      "formats": ["webp"]
    },
    "boundsMeters": {
      "width": 7.8,
      "height": 2.7,
      "depth": 10.2
    }
  },
  "quality": {
    "estimated": "high",
    "notes": "Bon éclairage, peu de zones bruitées."
  },
  "warnings": [
    "none"
  ],
  "viewerHints": {
    "initialCamera": {
      "position": [4, 3, 6],
      "target": [0, 1.2, 0]
    },
    "recommendedViewMode": "free",
    "recommendedRenderStyle": "original"
  }
}
```

## 7) Fonctionnalités viewer importantes (état actuel & recommandations)

### Déjà présent (dans le site)

- OrbitControls (rotation/zoom/pan, tactile)
- Vue libre / vue du dessus
- Plein écran
- Reset caméra
- Copier / Partager
- Recadrage automatique via `Bounds` + `Center`
- Tonemapping ACES + sRGB output (meilleur rendu que “linear brut”)
- Détection WebXR + message de fallback (pas de session VR démarrée)

### Manques actuels (à prévoir pour une expérience “scan maison” parfaite)

- **Chargement progressif / barre de progression** (ex: `useProgress` + UI)
- **Message d’erreur clair** si le modèle ne charge pas (textures manquantes, GLTF refs cassées, etc.)
- **Fallback “modèle trop lourd”** (avertissement + option “mode léger”)
- **Support compression GLB** :
  - Draco / Meshopt (géométrie)
  - KTX2/Basis (textures)
- Ajustement auto des perfs mobile :
  - DPR plus faible par défaut sur mobile
  - désactiver certains effets si FPS faible

## 8) Recommandations à donner à l’application de scan

### Recommandations “export idéal”

- **Exporte en GLB** si possible (format #1).
- **Textures intégrées** dans le GLB.
- **Échelle en mètres**, axe vertical **Y+**.
- **Centre le modèle** et place le sol autour de **Y = 0**.
- **Vérifie les normales** (éviter facettes). Si besoin, recalculer normales avec un angle de lissage adapté.
- **Réduis le poids** :
  - limite les triangles (LOD ou décimation contrôlée),
  - compresse les textures (WebP/JPEG, 2K en priorité).
- **Évite OBJ** si possible (garde-le seulement en fallback).
- Fournis une **miniature** (cover) : JPG/WebP 1600px large par exemple.
- Fournis éventuellement un **`metadata.json`** à côté.

### Si tu dois sortir en OBJ (fallback)

- Exporter **.obj + .mtl + textures** (toutes les images référencées dans le MTL).
- Garder des chemins simples dans le MTL (pas de chemins absolus).
- Nommer les fichiers simplement (ASCII, sans espaces) pour éviter des soucis.

## 9) Synthèse (ce que le site veut idéalement)

- **Format recommandé** : **GLB**
- **Taille recommandée** :
  - mobile idéal ≤ **25 MB** (acceptable jusqu’à 60 MB)
  - desktop idéal ≤ **60 MB**
- **Limites à éviter** :
  - > **120 MB** sur mobile
  - > **2.5M triangles** pour usage mobile fluide
  - textures > **4096²** ou trop nombreuses
- **Infos utiles à fournir** :
  - triangles/vertices, dimensions en mètres, présence UV/normales, nombre/résolution textures
  - hints caméra (optionnel)
  - warnings (textures manquantes, décimation, etc.)

## Modifications simples possibles côté site (optionnel, recommandé)

Sans connecter l’app de scan, voici des améliorations simples pour mieux accepter les scans :

- Ajouter une UI de **progress bar** de chargement (drei `useProgress`).
- Ajouter un **message d’erreur** visible si le modèle ne charge pas.
- Ajouter des **limites/recommandations** visibles dans l’admin (poids, formats, checklist textures OBJ).
- Ajouter (plus tard) support **Draco/Meshopt/KTX2** si l’app de scan exporte compressé.
