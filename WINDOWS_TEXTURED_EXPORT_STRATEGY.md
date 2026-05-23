# Stratégie export texturé Windows

## Contexte

Le PC processor ne peut **pas** aujourd’hui reproduire le modèle coloré Android, car le texturing final est entièrement délégué à **Tango3DR** (binaire Android ARM absent sur Windows). Voir `ANDROID_TEXTURED_EXPORT_PIPELINE_AUDIT.md`.

Les exports gris (PLY debug, preview, GLB Poisson) sont **désactivés par défaut** en attendant un vrai pipeline couleur.

---

## Option A — Porter le pipeline Android original sur Windows

Réutiliser `common/postproc/texturize.cc` + `common/tango/texturize.cc` + Tango3DR.

| Critère | Évaluation |
|---------|------------|
| **Faisable** | **Non** (sans binaire Tango3DR Windows ou sources complètes) |
| **Dépendances manquantes** | `libtango_3d_reconstruction` (.dll/.lib), ARCore (scan), possiblement OpenGL ES pour `TANGO_3DR_GL_TEXTURING` |
| **Temps estimé** | Inconnu / très élevé si Google ne fournit pas les binaires ; réécriture complète sinon (mois) |
| **Risque** | Élevé — dépendance propriétaire historique Tango, pas de sources dans le repo |

**Tango3DR Windows disponible : non**  
**Port direct possible : non**  
**Remplacement nécessaire : oui** (pour UV + projection multi-vues)

---

## Option B — `dataset_extractor` comme base desktop

| Critère | Évaluation |
|---------|------------|
| **Faisable** | **Partiellement** — compile sans Tango (CMake + OpenCV + libpng + turbojpeg) |
| **Contenu actuel** | `app.cpp` appelle seulement `oc::Texturize::Process(dataset, "model.obj", true)` |
| **Limite** | `Texturize` attend un mesh **avec UV** ; les UV viennent de `Tango3DR_getTexturedMesh` sur Android. Sans Tango → pas d’atlas, pas d’équivalent Android |
| **Utilité** | Réutiliser **l’analyse de frames** (sélection JPG) + lecture dataset ; **pas** le texturing final |
| **Temps estimé** | 1–2 semaines pour outil CLI « analyse frames + stats » ; pas suffisant seul pour rendu immobilier |
| **Risque** | Moyen — fausse impression de complétude si on croit que `dataset_extractor` suffit |

**Verdict :** bon socle pour la **sélection d’images**, insuffisant pour le **produit final coloré**.

---

## Option C — Texturing PC maison (recommandé)

| Étape | Technique | Qualité attendue |
|-------|-----------|------------------|
| Mesh | Open3D Poisson / Ball Pivoting depuis PLY dataset | Moyenne (trous possibles) |
| Court terme + | **Vertex colors** — projection centre triangle → JPG le plus proche | Correcte pour preview, limitée en détail |
| Moyen terme | UV atlas (xatlas) + projection multi-vues + PNG | Proche immobilier si poses OK |
| Export | trimesh / pygltflib → **GLB** avec textures embarquées | Compatible site Visitevirtuel |

| Critère | Évaluation |
|---------|------------|
| **Faisable** | **Oui** |
| **Qualité attendue** | Vertex colors : 60–70 % d’un vrai texturing ; UV maison : 75–90 % selon scan |
| **Temps estimé** | Vertex colors MVP : **3–7 jours** ; UV + atlas : **2–4 semaines** |
| **Ce qui manque pour immobilier** | Calibration fine, gestion distortion, fusion multi-textures, nettoyage trous mesh |

**Verdict :** seule route réaliste sans Tango3DR.

---

## Comparaison synthétique

| | Option A | Option B | Option C |
|---|:---:|:---:|:---:|
| Même qualité qu’Android | Théorique | Non | Approchant |
| Faisable maintenant | Non | Partiel | Oui |
| GLB coloré site | Si A marche | Non | Oui |
| Risque | Très élevé | Moyen | Modéré |

---

## Plan par phases (sans mentir)

### 1. Court terme — arrêt des faux « finaux »

- [x] Désactiver exports gris / preview / `site_model.glb` non texturé par défaut
- Garder validation dataset + PLY interne pour le futur texturing

### 2. Court terme + — `site_model_colored.glb` (MVP)

**Prochain développement concret choisi** (Tango3DR non portable) :

1. Charger mesh Open3D depuis PLY dataset
2. Pour chaque triangle : caméra la plus alignée (poses `.mat` COLOR_CAMERA)
3. Échantillonner couleur JPG (distortion simple depuis `distortion.txt`)
4. Exporter GLB avec **vertex colors** (trimesh)
5. `metadata.json` : `textured: true`, `texture_mode: vertex_colors`, couverture %

Fichiers à créer :

- `pc_processor/src/vertex_color_texturing.py`
- Intégration dans `processing_runner.py` (flag `enable_colored_site_export`)

### 3. Moyen terme — textures UV

- Atlas UV (xatlas ou équivalent)
- Réutiliser logique `oc::Texturize::ProjectFrames` portée en Python
- Export OBJ+MTL+PNG ou GLB texturé

### 4. Long terme — remplacement Tango3DR

- Reconstruction + texturing open source (Open3D, OpenMVS, ou moteur maison)
- Ou négocier / retrouver binaires Tango desktop (peu probable)

---

## Route recommandée (mise à jour 2026-05-19)

**Option D — Meshroom / AliceVision** (photogrammétrie PC sur les JPG du dataset)

- Intégration : `pc_processor/tools/run_meshroom_pipeline.py`
- Doc : `pc_processor/meshroom/README.md`
- Audit outils : `PC_PHOTOGRAMMETRY_TOOLS_AUDIT.md`

**Option C** (vertex colors maison) — repli si Meshroom indisponible ou échec qualité.

**Option A** (Tango3DR) — abandonnée tant qu’aucun binaire Windows n’existe.

---

## Estimation temps / risque (prochain sprint)

| Livrable | Durée | Risque |
|----------|-------|--------|
| Audit (ce document) | Fait | — |
| Vertex color GLB | 3–7 j | Moyen (poses, échelle) |
| GLB + textures UV | 2–4 sem | Élevé (qualité mesh) |
| Parité Android | Mois+ | Très élevé sans Tango3DR |

---

## Ce qui permettra un vrai GLB coloré pour le site

1. Mesh avec faces (Open3D) — déjà possible
2. Poses + JPG du dataset — **déjà dans le ZIP**
3. Projection couleur (vertex ou UV) — **à implémenter** (Option C)
4. Export GLB trimesh — déjà possible
5. **Pas besoin** de Tango3DR si Option C est acceptée qualitativement

Le site accepte `.glb` avec matériaux / vertex colors / textures embarquées (`useGLTF`).
