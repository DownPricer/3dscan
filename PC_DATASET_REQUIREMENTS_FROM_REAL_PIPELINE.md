# Exigences dataset PC basees sur le pipeline reel

## Principe

Ce document ne propose pas un dataset invente. Il part du dataset reel deja produit par l'application Android aujourd'hui, puis indique ce qu'il faut ajouter pour qu'un traitement PC soit robuste.

Conclusion courte :

- Le dataset Android actuel est deja un bon point de depart.
- Le dataset reel est plat, pas encore structure autour d'un `metadata.json`.
- Pour ne pas casser l'application Android, la meilleure evolution est d'ajouter des metadonnees au format actuel, pas de re-inventer tout le stockage.

## Dataset reel actuellement produit

Quand l'application sauvegarde un dataset pour post-traitement, elle deplace le dossier temporaire `dataset/` vers un dossier final `*.dataset`.

Contenu reel observe dans le code :

```text
scan-YYYYMMDD_HHMMSS.dataset/
  state.txt
  distortion.txt
  rotation.txt
  position.txt                # seulement si GPS actif
  00000000.jpg
  00000000.mat
  00000000.tms
  00000000.pcl
  00000001.jpg
  00000001.mat
  00000001.tms
  00000001.pcl
  ...
```

Pendant la capture il existe aussi des `*.bin` de preview mesh, mais `ScanProcessingService.runSaveDataset()` les supprime volontairement avant finalisation du dataset portable.

## Signification des fichiers actuels

### Fichiers globaux

- `state.txt`
  - format : `count width height cx cy fx fy`
  - contient le nombre de frames capturees et les intrinsics globaux

- `distortion.txt`
  - nombre de coefficients puis valeurs de distorsion

- `rotation.txt`
  - yaw global

- `position.txt`
  - optionnel, coordonnees GPS si activees

### Fichiers par frame

- `NNNNNNNN.jpg`
  - image couleur sauvegardee

- `NNNNNNNN.mat`
  - matrices de pose de la frame

- `NNNNNNNN.tms`
  - timestamp relatif

- `NNNNNNNN.pcl`
  - point cloud binaire de la frame acceptee

## Donnees actuellement disponibles

Disponibles et deja sauvees :

- RGB par frame
- poses par frame
- timestamps par frame
- point cloud par frame
- intrinsics globaux
- distorsion globale
- yaw global
- GPS optionnel

Disponibles en memoire mais pas exportees comme fichiers dedies :

- depth map ARCore
- raw depth ARCore
- confidence map raw depth
- tracking state / tracking failure reason
- scores de qualite capture
- parametres exacts de scan resolves par profil

## Dataset minimal necessaire pour le PC

### Cas 1 : validation dataset + audit + reporting

Minimum :

- `state.txt`
- `distortion.txt` (ou tolerance si absent, car le code sait tomber a zero)
- toutes les paires `.jpg` / `.mat`

Tres recommande aussi :

- `.tms`
- `.pcl`
- `rotation.txt`

### Cas 2 : replay de reconstruction selon le pipeline courant

Minimum reel pour rejouer ce que l'app sait deja faire aujourd'hui :

- `state.txt`
- `distortion.txt`
- toutes les images `.jpg`
- toutes les poses `.mat`
- tous les point clouds `.pcl`

Recommande :

- `.tms`
- `rotation.txt`

### Cas 3 : analyse d'images / texturing selon le pipeline courant

Le pipeline actuel n'utilise pas seulement le dataset brut. Il a aussi besoin d'un mesh d'entree.

Minimum reel :

- dataset complet ci-dessus
- un OBJ d'entree genere a partir de la reconstruction

Pour reproduire exactement le texturing actuel, il faut en plus :

- la bibliotheque Tango3DR ou un remplacement equivalent

## Donnees indispensables pour le PC

Indispensables des aujourd'hui :

- `state.txt`
- `distortion.txt`
- toutes les images `.jpg`
- toutes les poses `.mat`

Indispensables si on veut rejouer la reconstruction actuelle :

- toutes les `.pcl`

Indispensables si on veut garder le comportement de reorientation actuel :

- `rotation.txt`

Indispensables si on veut faire un pipeline PC fiable et tracable :

- `metadata.json` a ajouter

## Donnees optionnelles

Optionnelles mais utiles :

- `position.txt`
- `*.tms`
- logs de capture
- resume des profils qualite
- compteurs de frames retenues/rejetees

Optionnelles pour une future amelioration PC :

- depth map 16 bits par frame
- confidence map par frame
- evenements tracking/qualite par frame

## Donnees disponibles mais non sauvegardees aujourd'hui

Le code les calcule ou les lit deja, mais elles ne sont pas serialisees proprement dans le dataset portable :

- raw depth
- confidence raw depth
- tracking state
- tracking failure reason
- score qualite depth
- couverture/avertissements capture
- parametres exacts du scan resolves dans `QualityProfiles`
- mode AR exact (`GOOGLE_SFM`, `GOOGLE_TOF`, etc.)
- options `clearing`, `holes`, `poseCorrection`, `poisson`, `analyseImages`
- version application / version format dataset

## Donnees a ajouter cote telephone

Pour un futur PC processor solide, il faut ajouter sans casser le format existant :

### 1. `metadata.json`

A placer a la racine du dataset actuel, sans deplacer les fichiers legacy.

Contenu recommande :

- `dataset_format_version`
- `app_version`
- `capture_backend`
- `capture_mode`
- `scan_quality_profile`
- `native_scan_profile`
- `resolution`
- `dmin`
- `dmax`
- `noise`
- `holes_filling`
- `pose_correction`
- `clearing`
- `analyse_images`
- `poisson`
- `texture_detail`
- `texture_resolution`
- `texture_count`
- `smooth_normals`
- `smooth_normal_angle`
- `frame_count_expected`
- `has_gps`
- `has_pointcloud`
- `has_timestamps`

### 2. Un petit log de session

Exemple :

- `capture_log.txt`

Utilite :

- diagnostiquer les datasets incomplets
- verifier les profils utilises
- aider le futur outil PC a expliquer les erreurs

### 3. Eventuellement un mesh intermediaire optionnel

Exemple :

- `processing_input.obj`

Ce n'est pas obligatoire pour le MVP dataset, mais utile si on veut rejouer plus vite l'analyse image cote PC sans refaire une partie de la reconstruction.

## Donnees difficiles ou impossibles a recuperer proprement

Difficiles a recuperer ou couteuses a stocker :

- toutes les depth maps brutes pour chaque frame
- confidence maps completes par frame
- etats ARCore internes non exposes proprement comme format de dataset
- contexte interne Tango3DR

Important :

- les `*.bin` ne doivent pas etre consideres comme source de verite pour le PC processor ; ce sont des previews/caches temporaires.

## Recommandation de format cible sans casser le pipeline actuel

Le meilleur format cible est une extension minimale du dataset reel, pas un nouveau schema radical.

Proposition pragmatique :

```text
scan-session/
  metadata.json                 # nouveau
  capture_log.txt               # nouveau, optionnel
  state.txt                     # deja produit
  distortion.txt                # deja produit
  rotation.txt                  # deja produit
  position.txt                  # optionnel
  00000000.jpg                  # deja produit
  00000000.mat                  # deja produit
  00000000.tms                  # deja produit
  00000000.pcl                  # deja produit
  00000001.jpg
  00000001.mat
  00000001.tms
  00000001.pcl
  ...
  processing_input.obj          # optionnel futur
```

Pourquoi ce choix est le plus realiste :

- le code C++ actuel sait deja lire ce layout plat
- on n'oblige pas Android a changer tout son pipeline de sauvegarde
- on peut zipper directement ce dossier pour transfert PC

## Recommandation pour le MVP PC

Pour le MVP PC, il suffit de viser :

1. lecture d'un dossier ou ZIP contenant ce layout
2. verification des incoherences de comptage
3. lecture optionnelle de `metadata.json`
4. rapport JSON

Il ne faut pas exiger des maintenant :

- GLB
- raw depth par frame
- texturing complet reproduit a l'identique

## Resume actionnable

### Donnees actuellement disponibles

- `jpg`, `mat`, `tms`, `pcl`, `state.txt`, `distortion.txt`, `rotation.txt`

### Donnees disponibles mais pas sauvegardees

- depth, raw depth, confidence, tracking/qualite, parametres complets de session

### Donnees a ajouter

- `metadata.json`
- `capture_log.txt`
- eventuellement `processing_input.obj`

### Donnees difficiles a recuperer

- raw depth/confidence complets
- contexte interne ARCore/Tango3DR

### Donnees indispensables pour le PC

- `state.txt`
- `distortion.txt`
- `jpg`
- `mat`
- `pcl` si on veut replay reconstruction

### Donnees optionnelles

- `tms`
- `rotation.txt`
- `position.txt`
- logs
- depth/confidence si futur pipeline custom
