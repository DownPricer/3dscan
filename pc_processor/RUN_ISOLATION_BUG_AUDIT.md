# RUN_ISOLATION_BUG_AUDIT

Date : 2026-05-20

## Symptôme utilisateur

- Nouveau ZIP sélectionné (contenu différent)
- Nouveau dossier `run_YYYYMMDD_HHMMSS` créé
- Résultat / preview / `site-ready` = **ancien modèle 3D**
- Temps écoulé incohérent (ex. 35 s alors que le run vient de démarrer)

## Causes identifiées

### 1. GUI : polling du mauvais run (CRITIQUE)

`scan_processor_gui.py` utilisait `_find_latest_run_logs_dir(output_gui)` :

- Cherchait le `run_status.json` le plus récent dans **tout** `output_gui/`
- Au démarrage d’un nouveau run, le fichier n’existait pas encore → affichage du **run précédent**
- Explique le temps écoulé faux (35 s d’un ancien traitement)

### 2. Recherche globale du modèle Meshroom (CRITIQUE)

`meshroom_pipeline._expand_meshroom_search_roots` :

- Parcourait **tous** les dossiers `%TEMP%\MeshroomCache\Texturing\*` et `Publish\*`
- `_find_textured_mesh` prenait le « meilleur » OBJ global → souvent **7f3268ef…** (ancien scan)
- Même avec un nouveau ZIP, la publication utilisait l’ancien `texturedMesh.obj`

### 3. Cache Meshroom global

- `meshroom_batch` écrit souvent dans `%LOCALAPPDATA%\Temp\MeshroomCache` malgré `--cache`
- Les logs stdout référençaient ces chemins ; le pipeline les **ajoutait** aux racines de recherche

### 4. `site-ready/` non purgé au nouveau run

- `publish_site_ready` ne supprimait pas l’ancien `site-ready/` avant copie
- Preview / bouton « Ouvrir site-ready » pouvaient montrer un GLB restant

### 5. Empreinte ZIP insuffisante

- Ancienne empreinte = hash partiel faible
- Pas de `run_manifest.json` / `source_manifest.json` pour preuve de provenance

### 6. Preview

- `preview.html` du pipeline **validation dataset** (point cloud PLY) ≠ preview Meshroom GLB
- Pas de preview liée au run Meshroom courant

## Corrections appliquées

| Zone | Correction |
|------|------------|
| GUI | `allocate_run_for_input()` **avant** le thread ; `_current_run_id` fixé ; poll **uniquement** ce run |
| GUI | Temps remis à 0 ; journal vidé ; `run_status.json` initial avec `elapsed_seconds: 0` |
| Pipeline | Dossiers run `run_YYYYMMDD_HHMMSS_<hash8>` |
| Pipeline | `get_allowed_search_roots()` — **jamais** `%TEMP%\MeshroomCache` global |
| Pipeline | Suppression du fallback « recherche élargie cache global » |
| Pipeline | `validate_mesh_provenance()` — rejet exit 9 si hors run |
| Pipeline | `TEMP` / `TMP` / `MESHROOM_CACHE` isolés sous `MeshroomRuns/<run_id>/` |
| Pipeline | `run_manifest.json` + `site-ready/source_manifest.json` |
| Pipeline | `preview.html` par run avec ZIP, hash, run id, GLB du run |
| publish | `_clear_site_ready()` avant toute publication |

## Fichiers modifiés

- `src/run_isolation.py` (nouveau)
- `src/meshroom_pipeline.py`
- `src/meshroom_monitor.py`
- `gui/scan_processor_gui.py`
- `RUN_ISOLATION_BUG_AUDIT.md` (ce document)
- `tools/test_run_isolation_ab.py` (test non-régression manifest)

## Critère de réussite

Impossible de publier un `site_model.glb` dont la provenance n’est pas dans le dossier du run courant lié au SHA256 du ZIP sélectionné.
