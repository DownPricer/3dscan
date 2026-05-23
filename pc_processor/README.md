# pc_processor

Debut reel du logiciel PC Windows local pour `3DLiveScanner`.

## Ce que le logiciel fait aujourd'hui

Fonctionnel :

- lit un dossier `.dataset`
- lit un `.zip`
- detecte le dataset Android legacy avec ou sans `metadata.json`
- valide `state.txt`, `distortion.txt`, `rotation.txt`
- compte `jpg`, `mat`, `tms`, `pcl`
- detecte les fichiers manquants, vides et les frames incompletes
- produit `dataset_report.json`
- produit `dataset_report.txt`
- extrait un ZIP vers un dossier de travail
- genere un `debug_pointcloud.ply` si le dataset contient des couples `pose + pcl`
- genere `preview.html` + `open_preview.bat` pour visualiser sans MeshLab/CloudCompare
- genere `web_pointcloud.ply` (export web temporaire, point cloud uniquement)
- point cloud interne (validation) — exports gris / preview desactives
- **traitement texturé PC Meshroom** (photogrammétrie JPG) — voir section ci-dessous
- lit le format `.mat` Android reel (3 matrices 4x4 par frame, 12 lignes texte)
- produit `processing_stats.json`

## Ce que le logiciel ne fait pas encore

- reconstruction complete PC
- texturing complet PC
- export final texturise equivalent a Android
- remplacement de `tango_3d_reconstruction`

## Flux utilisateur complet (recommande)

1. Scanner sur Android.
2. **Sauvegarder** puis choisir **Exporter pour PC** (avant toute analyse d'images).
3. Attendre la creation du ZIP (etats : *Sauvegarde du dataset*, *Creation du ZIP pour PC*, *Dataset PC pret*).
4. Appuyer sur **Partager le ZIP** (Drive, Nearby Share, USB, WhatsApp, fichiers, etc.).
5. Sur Windows : double-cliquer `run_gui.bat`.
6. **Choisir un ZIP ou dossier dataset** puis **Lancer l'analyse**.
7. Cliquer **Ouvrir la previsualisation** (ou `open_preview.bat`) et consulter `dataset_report.json`.

L'analyse d'images et le texturing lourds se font sur PC plus tard, pas sur le telephone dans ce mode.

## Comment recuperer un dataset depuis le telephone

Depuis l'application Android, exporter un dataset de scan (voir flux ci-dessus).

Le dossier reel attendu ressemble a :

```text
scan-YYYYMMDD_HHMMSS.dataset/
  state.txt
  distortion.txt
  rotation.txt
  00000000.jpg
  00000000.mat
  00000000.tms
  00000000.pcl
  ...
```

Ce dossier peut etre copie tel quel sur le PC ou compresse en `.zip`.

## Test avec un vrai phone dataset

1. Installer l'APK debug `3DLiveScanner-pc-export-before-analysis-debug.apk`.
2. Faire un scan court.
3. **Sauvegarder** puis **Exporter pour PC**.
4. Verifier que l'app n'affiche jamais *Analyse des images* ni *Generation des textures*.
5. **Partager le ZIP** ou le recuperer depuis `pc-datasets/`.
6. Lancer `run_gui.bat` et analyser le ZIP.
7. Cliquer **Ouvrir la previsualisation** dans la GUI (pas besoin de MeshLab).

## Voir le scan sans MeshLab

1. Lancer `run_gui.bat`.
2. Choisir le ZIP dataset.
3. Cliquer **Lancer l'analyse**.
4. Cliquer **Ouvrir la previsualisation**.

La preview utilise Three.js dans le navigateur. Si le fichier ne charge pas en double-cliquant `preview.html`, utilisez `open_preview.bat` : il demarre un mini serveur `http://localhost:8765` puis ouvre la page.

Controles : orbite souris, zoom molette, bouton reinitialiser camera, bascule point cloud / mesh experimental.

## Traitement texturé PC avec Meshroom

Objectif : modèle **texturé** pour le site sans analyse lourde sur le téléphone.

1. Installer [Meshroom](https://github.com/alicevision/Meshroom/releases) (GPU recommandé).
2. `run_gui.bat` → **Choisir dossier Meshroom** → **Lancer traitement texturé Meshroom**.
3. Récupérer `site-ready/site_model.glb` (ou OBJ+MTL+textures).

CLI :

```bat
py -3 tools\run_meshroom_pipeline.py "C:\chemin\scan.zip" "output_gui\meshroom_run" --meshroom-dir "C:\Program Files\Meshroom" --save-meshroom-config
```

Voir `meshroom/README.md` et `PC_PHOTOGRAMMETRY_TOOLS_AUDIT.md`.

**Note :** Meshroom utilise les JPG en photogrammétrie classique (pas les poses `.mat` ARCore).

---

## Export pour le site (fichier final)

**Fichier a uploader dans l'admin du site :**

```text
{dossier_sortie}/site-ready/site_model.glb
```

Voir aussi `SITE_FINAL_MODEL_FORMAT_AUDIT.md` (formats acceptes par le site) et `PC_TEXTURING_STRATEGY.md`.

| Emplacement | Role |
|-------------|------|
| `site-ready/site_model.glb` | **Produit final** — upload admin Visitevirtuel |
| `site-ready/metadata.json` | Format, compatible site, texturé ou non |
| `site-ready/README_UPLOAD_SITE.txt` | Instructions upload |
| `debug_pointcloud.ply` | Debug uniquement (ne pas uploader) |
| `preview.html` | Preview locale debug |
| `web_pointcloud.ply` | Point cloud test (site refuse le .ply) |
| `debug_mesh.obj` | Mesh experimental intermediaire |

Le modele PC est **non texturé** (geometrie grise) tant que le texturing photo n'est pas porte. Compatible site en `.glb`, mais pas un rendu immobilier marketing.

Dependances pour mesh + GLB :

```bat
install_dependencies.bat
```

ou :

```bat
py -3 -m pip install -r requirements.txt
```

## Utilisation avec interface Windows

Pour eviter les commandes `adb pull`, utilisez l'interface locale :

```bat
run_gui.bat
```

Etapes :

1. Recuperez le ZIP depuis le telephone par le moyen de votre choix (USB, Drive, Nearby Share, WhatsApp, etc.).
2. Double-cliquez sur `run_gui.bat`.
3. Cliquez sur **Choisir un ZIP ou dossier dataset**.
4. Cliquez sur **Generer fichier pour le site**.
5. Cliquez sur **Ouvrir dossier site-ready** puis uploadez `site_model.glb` dans l'admin.
6. (Optionnel) Cochez preview debug pour `preview.html`.

Les resultats sont ecrits dans `output_gui/run_YYYYMMDD_HHMMSS/` par defaut.

Voir aussi `gui/README.md`.

## Commandes Windows (CLI)

Depuis `pc_processor/` :

```bat
run_pc_processing.bat "..\scan-20260519_120000.dataset" "..\output\scan_test"
```

Ou :

```bat
run_pc_processing.bat "..\scan-session.zip" "..\output\scan_test"
```

Commande pour un vrai ZIP exporte depuis le telephone :

```bat
run_pc_processing.bat "..\scan-session-YYYYMMDD-HHMMSS.zip" "..\output\real_phone_test"
```

Validation seule :

```bat
py -3 validate_dataset.py "..\scan-20260519_120000.dataset" "..\output\validate_only"
```

Point cloud debug seul :

```bat
py -3 tools\build_pointcloud.py "..\scan-20260519_120000.dataset" "..\output\pointcloud_only"
```

## Sorties

Le dossier de sortie contient au minimum :

```text
output_folder/
  dataset_report.json
  dataset_report.txt
  preview/
  extracted/
  logs/
```

Si le calcul point cloud est possible :

```text
output_folder/
  debug_pointcloud.ply
  preview.html
  open_preview.bat
  web_pointcloud.ply
  processing_stats.json
  export_summary.json
```

Si mesh experimental (Open3D) :

```text
  debug_mesh.ply
  debug_mesh.obj
```

Si export site (Open3D + trimesh) :

```text
  site-ready/
    site_model.glb
    metadata.json
    README_UPLOAD_SITE.txt
  debug_mesh.obj
```

## Comment lire les rapports

`dataset_report.txt` :

- resume humain du dataset
- comptages
- intrinsics lus depuis `state.txt`
- erreurs
- warnings
- recommandation de traitement

`dataset_report.json` :

- meme information en format machine

`processing_stats.json` :

- nombre de frames lues
- nombre de points lus
- nombre de points exportes
- frames ignorees
- duree

## Arborescence

- `validate_dataset.py`
  - validation dataset

- `tools/run_pc_processing.py`
  - orchestration Windows locale

- `tools/build_pointcloud.py`
  - premier calcul PC reel

- `src/pc_processor_core.py`
  - coeur commun Python

- `native/`
  - preparation du futur moteur C++

- `gui/scan_processor_gui.py`
  - interface Windows Tkinter

- `run_gui.bat`
  - lanceur double-clic pour l'interface

## Creer un EXE Windows plus tard

L'interface peut etre emballee plus tard avec PyInstaller, sans changer le moteur Python.

Installation future :

```bat
py -3 -m pip install pyinstaller
```

Commande future proposee :

```bat
cd pc_processor
py -3 -m PyInstaller --onefile --windowed --name SiteReadyScanProcessor gui\scan_processor_gui.py
```

PyInstaller n'est pas obligatoire aujourd'hui : `run_gui.bat` suffit si Python 3 est installe.
