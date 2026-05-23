# Stratégie texturing PC — visite immobilière

## État actuel (honnête)

Le PC processor génère aujourd'hui un **mesh géométrique non texturé** (couleur uniforme grise dans Open3D, pas de photos projetées). Ce n'est **pas** un rendu immobilier final, mais c'est **compatible site** en `.glb` pour test technique.

La preview locale grise/blanche reproduit le même problème : pas de pipeline photo → mesh côté PC.

## Solution court terme (disponible maintenant)

| Action | Détail |
|--------|--------|
| Mesh Open3D | Poisson ou Ball Pivoting depuis `debug_pointcloud.ply` |
| Export GLB | trimesh convertit `debug_mesh.obj` → `site-ready/site_model.glb` |
| Couleurs sommets | Possible : exporter les couleurs du PLY (si présentes) vers le mesh — **pas encore implémenté** |
| GLB vertex colors | trimesh peut embarquer des couleurs par sommet — amélioration MVP rapide sans vraies textures photo |

**Limite :** pas de textures photo réalistes ; visite utilisable en test 3D, pas en marketing immobilier.

## Solution moyen terme

### Option A — Porter `common/postproc/texturize.cc` sur PC

- Classe `oc::Texturize` : sélection des meilleures vues, projection des JPG du dataset sur le mesh, génération PNG + MTL
- Dépendances : OpenCV, glm, libjpeg, pipeline dataset C++ existant
- Fichiers : `common/postproc/texturize.cc`, `common/data/dataset.cc`, `common/data/image.cc`, etc.
- **Blocage :** gros portage natif (CMake, bindings Python ou CLI), pas un simple `pip install`

### Option B — Porter `common/tango/texturize.cc` (Tango3DR)

- Utilisé par `JNI.texturize` sur Android
- **Blocage Tango3DR :** bibliothèque propriétaire / lourde, liée au SDK Tango ; port PC non trivial sans licence et build chain complète

### Option C — Texturing MVP Python (recommandé pour itération)

1. Charger mesh + poses `.mat` + JPG du dataset extrait
2. Pour chaque face/triangle : projeter le centre dans la caméra la plus proche
3. Échantillonner couleur JPG (avec distortion si `distortion.txt` parsé)
4. Générer atlas UV simple (xatlas ou unwrap basique) ou vertex colors denses
5. Exporter `site_model.glb` avec textures embarquées (trimesh / pygltflib)

Dépendances : `open3d`, `trimesh`, `numpy`, `opencv-python`, `Pillow`, éventuellement `xatlas`

### Option D — Continuer texturing sur Android puis exporter GLB

- Réactiver le pipeline `JNI.texturize` sur téléphone (lourd, lent)
- Exporter OBJ+MTL+textures depuis l'app
- PC processor ne fait que valider / repackager en GLB pour le site
- **Contre :** retour au traitement long sur mobile (contre-objectif « export PC avant analyse »)

## Difficultés

| Difficulté | Description |
|------------|-------------|
| Tango3DR | Bloque le port direct du chemin Android `tango/texturize.cc` |
| Poses + distortion | Nécessaires pour une projection correcte des JPG |
| Qualité mesh Poisson | Trous, artefacts → textures étirées / floues |
| Échelle / orientation | Mesh PC peut différer du repère Android |
| Temps de calcul | Analyse multi-vues (`Texturize::Process`) = minutes |

## Fichiers à porter (référence)

| Fichier | Rôle |
|---------|------|
| `common/postproc/texturize.cc` | Sélection frames + projection textures |
| `common/postproc/texturize.h` | API `oc::Texturize` |
| `common/tango/texturize.cc` | Wrapper Tango3DR |
| `common/data/dataset.cc` | Lecture dataset |
| `scanner/app/src/main/jni/app.cc` | Orchestration `JNI.texturize` |

## Dépendances nécessaires

**Court terme (mesh + GLB) :**

```bat
py -3 -m pip install open3d trimesh
```

**Moyen terme (texturing MVP Python) :**

```bat
py -3 -m pip install open3d trimesh numpy opencv-python Pillow
```

**Long terme (port C++) :** CMake, OpenCV, libpng, libjpeg-turbo, éventuellement Tango3DR ou remplacement open source.

## Prochaine étape recommandée

1. Valider `site-ready/site_model.glb` sur le site (test technique).
2. Implémenter **vertex colors depuis le PLY coloré** (gain visuel rapide).
3. Prototyper **Option C** (projection JPG + atlas) sans Tango3DR.
4. Ne pas viser Tango3DR sur PC tant qu'Option C n'est pas épuisée.
