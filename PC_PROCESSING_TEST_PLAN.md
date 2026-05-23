# Plan de test du processeur PC Windows

## Objectif

Verifier que le debut de logiciel Windows local :

- lit un dossier `.dataset`
- lit un `.zip`
- detecte les problemes de structure
- produit des rapports
- genere un `PLY` de debug si `pose + pcl` sont presents
- genere `preview.html` + `open_preview.bat` pour visualisation locale
- genere `web_pointcloud.ply` pour test web
- mesh experimental optionnel (Open3D) et dossier `site-ready/site_model.glb` (trimesh)

## Android .mat real format support

### Cas reel telephone

Entree :

```text
C:\Users\ironi\Outils\Buisnesss\test\20260519_173716.dataset.zip
```

Commande :

```bat
cd pc_processor
python tools\run_pc_processing.py "C:\Users\ironi\Outils\Buisnesss\test\20260519_173716.dataset.zip" "output_gui\retest_mat_parser"
```

Attendu :

- `Dataset valide : oui` (warning `test.txt` vide acceptable)
- `.mat` parsees : **34 / 34** (3 matrices x 4 colonnes = 12 lignes par fichier)
- `.pcl` lus : **34**
- `debug_pointcloud.ply` avec **> 0** points
- `preview.html` et `open_preview.bat` presents
- `web_pointcloud.ply` present
- `processing_stats.json` : `mat_files_parsed=34`, `points_exported > 0`
- log `logs/mat_parse.log` avec lignes `[MAT]`, `[PCL]`, `[PLY]`
- avec `--mesh --site-glb` et Open3D/trimesh : `site-ready/site_model.glb` si reconstruction OK

Matrice utilisee pour le PLY : **COLOR_CAMERA** (index 0), comme `common/exporter/exporter.cc`.

Voir `PC_MAT_FORMAT_AUDIT.md`.

## Jeu de test minimal

### Cas 1 - Dataset Android legacy complet

Attendu :

- validation `oui`
- rapport JSON/TXT produits
- `debug_pointcloud.ply` produit
- `processing_stats.json` produit

### Cas 2 - Dataset ZIP complet

Attendu :

- extraction vers `output_folder/extracted/`
- validation `oui`
- `debug_pointcloud.ply` produit

### Cas 3 - Dataset sans `metadata.json`

Attendu :

- validation possible
- warning explicite sur l'absence de `metadata.json`

### Cas 4 - Dataset sans `.pcl`

Attendu :

- rapport produit
- recommandation `impossible` pour le calcul actuel
- pas de `debug_pointcloud.ply`

### Cas 5 - Dataset avec `state.txt` incoherent

Attendu :

- validation `non`
- erreurs de comptage explicites

### Cas 6 - Dataset avec fichiers vides

Attendu :

- validation `non`
- liste des fichiers vides

## Commandes Windows

Depuis `pc_processor/` :

```bat
run_pc_processing.bat "..\scan-20260519_120000.dataset" "..\output\scan_test"
```

Ou :

```bat
run_pc_processing.bat "..\scan-session.zip" "..\output\scan_test"
```

Validation seule :

```bat
py -3 validate_dataset.py "..\scan-20260519_120000.dataset" "..\output\validate_only"
```

Point cloud debug seul :

```bat
py -3 tools\build_pointcloud.py "..\scan-20260519_120000.dataset" "..\output\pointcloud_only"
```

## Utilisation avec interface Windows

1. Recuperer le ZIP depuis le telephone (USB, Drive, Nearby Share, etc.).
2. Double-cliquer `pc_processor/run_gui.bat`.
3. Cliquer **Choisir un ZIP ou dossier dataset**.
4. Cliquer **Lancer l'analyse**.
5. Verifier les logs dans la fenetre.
6. Cliquer **Ouvrir le dossier resultat**.
7. Cliquer **Ouvrir la previsualisation** (navigateur + serveur local si besoin).

## Voir le scan sans MeshLab

1. `run_gui.bat`
2. Choisir le ZIP
3. **Lancer l'analyse**
4. **Ouvrir la previsualisation**

Alternative : double-cliquer `open_preview.bat` dans le dossier resultat.

## Export pour le site

**Fichier a prendre pour l'admin :** `site-ready/site_model.glb`

- `site-ready/site_model.glb` = upload admin (format accepte par Visitevirtuel)
- `site-ready/metadata.json` = `textured: false` tant que pas de texturing photo
- `debug_pointcloud.ply` = debug technique (ne pas uploader)
- `preview.html` = visualisation locale debug
- `web_pointcloud.ply` = refuse par le site (.ply non supporte)

### Test Meshroom (texturé PC)

```bat
cd pc_processor
py -3 tools\run_meshroom_pipeline.py "C:\Users\ironi\Outils\Buisnesss\test\20260519_173716.dataset.zip" "output_gui\meshroom_test" --meshroom-dir "CHEMIN_MESHROOM" --save-meshroom-config
```

Extraction JPG seule (sans Meshroom installe) :

```bat
py -3 tools\run_meshroom_pipeline.py "...\scan.zip" "output_gui\meshroom_extract" --extract-only
```

Attendu si Meshroom OK : `site-ready/site_model.glb` ou `site_model.obj` + `textures/`

Attendu si Meshroom absent : code 4 + message clair

### Tests GUI minimaux

- lancement de `run_gui.bat`
- selection d'un ZIP synthetique
- selection d'un dossier `.dataset`
- creation de `dataset_report.json` et `dataset_report.txt`
- generation de `debug_pointcloud.ply` si dataset complet
- bouton **Ouvrir le dossier resultat** fonctionnel
- bouton **Ouvrir la previsualisation** fonctionnel
- `preview.html` genere avec point cloud visible via serveur local
- cases mesh / export site GLB testables

## Real Phone Dataset Test

1. Installer l'APK debug Android.
2. Faire un scan court sur telephone.
3. Dans l'ecran de fichiers, selectionner le dossier `*.dataset`.
4. Cliquer sur `PC` pour exporter le ZIP PC.
5. Recuperer le fichier avec ADB.
6. Lancer `run_pc_processing.bat` sur le ZIP.
7. Ouvrir `debug_pointcloud.ply` dans MeshLab ou CloudCompare.
8. Verifier `dataset_report.json` et `dataset_report.txt`.

## Fichiers attendus

Dans `output_folder/` :

- `dataset_report.json`
- `dataset_report.txt`
- `debug_pointcloud.ply` si calcul possible
- `preview.html`, `open_preview.bat`, `web_pointcloud.ply` si calcul possible
- `site-ready/site_model.glb` si options mesh/site activees
- `debug_mesh.obj` si mesh experimental OK
- `processing_stats.json`, `export_summary.json` si calcul possible
- `preview/`
- `extracted/`
- `logs/`

## Ce que le test ne doit pas conclure

Le test ne doit pas conclure a tort :

- que la reconstruction complete PC est faite
- que le texturing complet PC est fini
- que le pipeline Android est obsolete

Le test valide seulement :

- l'ingestion dataset
- la validation structurelle
- un premier calcul point cloud de debug
