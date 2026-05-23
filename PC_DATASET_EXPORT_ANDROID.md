# Export dataset Android pour le PC processor

## Ou sont stockes les vrais datasets aujourd'hui ?

Le pipeline Android actuel ecrit les datasets dans le stockage externe public de l'application :

```text
Documents/3D Live Scanner/
```

Chemin exact reconstruit par le code :

```text
/storage/emulated/0/Documents/3D Live Scanner/
```

Le dossier temporaire live utilise pendant le scan est :

```text
/storage/emulated/0/Documents/3D Live Scanner/dataset/
```

Quand l'utilisateur sauvegarde un dataset pour post-traitement, le dossier temporaire est deplace vers un dossier final :

```text
/storage/emulated/0/Documents/3D Live Scanner/<timestamp>.dataset/
```

## Est-ce visible depuis Windows ?

Oui pour le dossier public `Documents/3D Live Scanner/`.

Le ZIP d'export PC, lui, est volontairement stocke dans un emplacement app-specific plus propre :

```text
/storage/emulated/0/Android/data/com.lvonasek.arcore3dscanner/files/pc-datasets/
```

## Comment recuperer le ZIP avec ADB

La commande exacte attendue est :

```bat
adb pull "/storage/emulated/0/Android/data/com.lvonasek.arcore3dscanner/files/pc-datasets/scan-session-YYYYMMDD-HHMMSS.zip" .
```

## Comment l'utilisateur declenche l'export

### Chemin recommande (apres scan)

1. Terminer le scan.
2. Appuyer sur **Sauvegarder**.
3. Choisir **Exporter pour PC** (et non *Sauvegarder sur telephone*).

Ce chemin appelle `ScanProcessingService.startSavePcDataset()` :

- sauvegarde le dataset brut uniquement
- ecrit `metadata.json`
- cree `scan-session-YYYYMMDD-HHMMSS.zip` dans `pc-datasets/`
- **ne lance pas** l'analyse d'images ni le texturing sur le telephone
- affiche l'ecran fichiers avec **Partager le ZIP**

### Chemin secondaire (dataset deja sauve)

Depuis l'ecran de fichiers, apres selection d'un dossier `*.dataset`, le bouton **PC** exporte aussi un ZIP sans relancer le scan.

Ce bouton reutilise `PcDatasetExporter.export(...)` sur un dataset existant.

## Ce que contient le ZIP

Contenu reel exporte :

```text
metadata.json
capture_log.txt
state.txt
distortion.txt
rotation.txt
position.txt            # si present
*.jpg
*.mat
*.tms
*.pcl
```

Le format interne du dataset original n'est pas modifie.

## Fichier `test.txt` dans le dataset

Le code natif Android (`scanner/app/src/main/jni/app.cc`) cree un fichier vide `test.txt` a la racine du dataset temporaire pour verifier l'acces ecriture du stockage.

Ce fichier peut apparaitre dans un ZIP si le dossier `.dataset` complet est archive. L'export PC via `PcDatasetExporter` ne l'inclut pas dans le staging ZIP.

Le processeur PC ignore un `test.txt` vide (warning non bloquant).

## Pourquoi ce chemin est adapte

- il est app-specific
- il est stable
- il est facile a recuperer avec ADB
- il ne demande pas de gros changement du pipeline Android

## Etape de test Windows

Une fois le ZIP recupere :

```bat
cd pc_processor
run_pc_processing.bat "..\scan-session-YYYYMMDD-HHMMSS.zip" "..\output\real_phone_test"
```

Sorties attendues :

```text
output/real_phone_test/
  dataset_report.json
  dataset_report.txt
  debug_pointcloud.ply
  processing_stats.json
```
