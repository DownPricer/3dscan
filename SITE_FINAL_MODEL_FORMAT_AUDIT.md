# Audit format modèle final — site Visitevirtuel

Date : 2026-05-19  
Projet site : `VPS Mega BAse/Visitevirutel` (Next.js + React Three Fiber + Prisma)

## Formats supportés actuellement (code)

| Extension | Accepté upload admin | Affiché dans le viewer public | Notes |
|-----------|---------------------|-------------------------------|-------|
| `.glb` | Oui | Oui (`useGLTF`) | **Format recommandé** dans le formulaire admin |
| `.gltf` | Oui (+ `.bin` si besoin) | Oui (`useGLTF`) | Un seul fichier principal à l'upload (pas multi-fichiers sauf OBJ) |
| `.obj` | Oui | Oui (`OBJLoader` + `MTLLoader`) | Upload **multiple** autorisé : `.obj` + `.mtl` + textures |
| `.zip` | Oui (stockage) | **Non** — message MVP « exportez en .glb » | ZIP enregistré mais pas extrait côté serveur |
| `.ply` | **Non** | **Non** | Aucun `PLYLoader` sur le site |

Sources :

- `lib/validators.ts` : `allowedModelExtensions = [".glb", ".gltf", ".obj", ".zip"]`
- `lib/storage.ts` : validation upload, bundle multi-fichiers réservé à OBJ
- `components/viewer/model-viewer.tsx` : GLB/GLTF via `useGLTF`, OBJ via `OBJLoader`/`MTLLoader`
- `prisma/schema.prisma` : enum `ModelType { GLB, GLTF, OBJ, ZIP }`

## Réponses directes

| Question | Réponse |
|----------|---------|
| Le site accepte-t-il `.glb` ? | **Oui** — format privilégié |
| Le site accepte-t-il `.gltf` ? | **Oui** |
| Le site accepte-t-il `.obj` + `.mtl` + textures ? | **Oui** (upload multiple dans l'admin) |
| Le site accepte-t-il `.ply` ? | **Non** |
| Format recommandé dans le code ? | **GLB** (texte admin : « Le format recommandé pour le scan 3D est le fichier .glb ») |
| Format le plus simple à uploader ? | **Un seul fichier `.glb`** |
| Format final à générer côté PC ? | **`site-ready/site_model.glb`** |

## Format recommandé final

```
output_xxx/
  site-ready/
    site_model.glb      ← fichier à uploader dans l'admin
    metadata.json
    README_UPLOAD_SITE.txt
    thumbnail.jpg       ← optionnel, pas utilisé par le viewer aujourd'hui
```

Alternative si trimesh absent mais mesh OBJ présent :

```
site-ready/
  site_model.obj
  site_model.mtl        ← seulement si MTL généré (pas le cas actuellement)
  textures/             ← vide tant que pas de texturing PC
```

## Contraintes de taille

- Limite upload : `UPLOAD_MAX_SIZE_MB` (défaut **250 Mo**) — `lib/env.ts`
- GLB : **un seul fichier** (pas d'upload multi-fichiers)
- OBJ : total bundle ≤ 250 Mo (somme de tous les fichiers)

## Contraintes textures

- Viewer GLB/GLTF : affiche les matériaux/textures embarqués dans le GLB
- Viewer OBJ : charge le `.mtl` référencé par `mtllib` dans le `.obj` ; textures via chemins dans le MTL
- Sans textures : rendu **gris/beige** (mode « premium » sur OBJ) ou géométrie brute
- Message site pour OBJ gris : « uploade aussi les textures (.png/.jpg) référencées dans le .mtl »

## Ce que le PC processor doit produire (cible)

1. Dossier `site-ready/` avec uniquement les fichiers utiles au site.
2. Fichier principal : `site_model_colored.glb` (mesh **texturé** — pas encore implémenté).
3. En attendant : **ne pas** livrer `site_model.glb` gris comme produit final (désactivé).

État actuel : le pipeline Android utilise Tango3DR pour les textures ; non portable Windows.
Voir `ANDROID_TEXTURED_EXPORT_PIPELINE_AUDIT.md` et `WINDOWS_TEXTURED_EXPORT_STRATEGY.md`.

Ancien export intermédiaire (désactivé) :

2. ~~`site_model.glb` (mesh reconstruit, non texturé)~~
3. `metadata.json` : format, `site_compatible`, `textured`, chemin recommandé.
4. `README_UPLOAD_SITE.txt` : instructions upload admin.

Fichiers **debug** (hors produit final) — restent à la racine du dossier de sortie :

- `debug_pointcloud.ply`
- `preview.html`, `open_preview.bat`
- `web_pointcloud.ply`
- `debug_mesh.obj`

## Ce qui manque côté site (si besoin)

| Manque | Impact | Priorité |
|--------|--------|----------|
| Extraction ZIP côté serveur | ZIP uploadé mais non affichable | Moyenne (contourné par GLB PC) |
| Support PLY | Nuage de points non visualisable | Basse (pas l'objectif immobilier) |
| Validation qualité mesh (trous, échelle) | Mauvais scans acceptés | Basse |
| Champ `thumbnail` lié au modèle 3D | Pas de vignette auto depuis scan | Basse |

## Fichier à prendre après traitement PC

**Chemin :** `{dossier_sortie}/site-ready/site_model.glb`

Dans l'admin du site : créer une propriété → uploader ce fichier `.glb` → publier la visite.
