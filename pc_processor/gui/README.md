# Interface Windows pc_processor

Interface locale simple pour analyser un dataset Android sans utiliser le terminal.

## Lancement

Depuis `pc_processor/` :

```bat
run_gui.bat
```

Ou directement :

```bat
py -3 gui\scan_processor_gui.py
```

## Utilisation

1. Recuperez le ZIP depuis le telephone (USB, Drive, Nearby Share, etc.).
2. Double-cliquez sur `run_gui.bat`.
3. Cliquez sur **Choisir un ZIP ou dossier dataset**.
4. Cliquez sur **Generer fichier pour le site** (mesh + GLB par defaut).
5. Cliquez sur **Ouvrir dossier site-ready** — uploadez `site_model.glb` dans l'admin.
6. (Optionnel) Preview debug via la case « Inclure preview.html ».

## Sorties

Par defaut, les resultats sont ecrits dans :

```text
pc_processor/output_gui/run_YYYYMMDD_HHMMSS/
  dataset_report.json
  dataset_report.txt
  debug_pointcloud.ply
  preview.html
  open_preview.bat
  web_pointcloud.ply
  processing_stats.json
  export_summary.json
  preview/
  extracted/
  logs/
```

**Fichier final site (Meshroom) :**

```text
site-ready/site_model.glb
site-ready/site_model.obj + site_model.mtl + textures/
```

GUI : section **Traitement PC texturé (Meshroom)**.

Validation dataset seule : bouton **Valider le dataset**.

## Fichiers

- `scan_processor_gui.py` : interface Tkinter
- `processing_runner.py` : orchestration partagee avec le CLI

Le CLI `run_pc_processing.bat` continue de fonctionner en parallele (`--mesh`, `--site-glb`).
