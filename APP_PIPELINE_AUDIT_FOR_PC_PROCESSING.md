# Audit du pipeline reel pour un futur traitement PC

## Objectif

Ce document decrit le pipeline reel de `3DLiveScanner` aujourd'hui, pour eviter de concevoir un futur outil PC sur une hypothese fausse.

Conclusion courte :

- La capture live est pilotee par Android/Java puis executee en JNI/C++.
- La reconstruction geometrique tourne deja pendant la capture.
- Le traitement long est surtout le post-traitement de reconstruction rejouee, d'analyse d'images et de texturing.
- Le dataset reel deja produit par l'application est exploitable pour un futur outil PC, mais il manque encore des metadonnees propres pour industrialiser ce flux.
- Le pipeline de texturing actuel depend fortement de `tango_3d_reconstruction`, qui n'existe ici qu'en integration Android.

## Vue d'ensemble du pipeline actuel

Workflow reel :

1. `FileManager.startScanning()` lance `Main`.
2. `Main.bindAR()` initialise ARCore/AREngine, configure les profils de scan/export, vide le dossier temporaire de dataset et appelle `JNI.onARServiceConnected(...)`.
3. Chaque frame GL appelle `JNI.onGlSurfaceDrawFrame(...)`.
4. `app.cc` recupere pose, image, profondeur/point cloud via `ARCoreService`.
5. Si le scan est actif, un thread `ProcessReconstruction` fusionne la frame dans la reconstruction 3D et ecrit des donnees sur disque.
6. Quand l'utilisateur sauvegarde, `ScanProcessingService` lance soit :
   - un export dataset brut,
   - un export modele simple,
   - ou le pipeline complet reconstruction/post-traitement/texturing.
7. `READY` n'est appele qu'apres validation finale de l'export.

## Capture

### Ou le scan commence ?

Entree utilisateur :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/FileManager.java`
  - `startScanning()`

Initialisation du scan :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
  - `bindAR()`
  - `onSurfaceCreated(...)`
  - `onDrawFrame(...)`

Activation/desactivation du scan :

- `Main.java`
  - `m3drRunning`
  - `JNI.onToggleButtonClicked(m3drRunning)`

### Quelle classe Java lance le scan ?

La classe principale est :

- `com.lvonasek.arcore3dscanner.main.Main`

Le point d'entree utilisateur est :

- `com.lvonasek.arcore3dscanner.ui.FileManager`

### Quel code JNI est appele ?

Pont Java/JNI :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`

Appels cle du pipeline :

- `onARServiceConnected(...)`
- `onGlSurfaceChanged(...)`
- `onGlSurfaceDrawFrame(...)`
- `onToggleButtonClicked(...)`
- `onUndoButtonClicked(...)`
- `save(...)`
- `texturize(...)`
- `extract(...)`

Bibliotheque chargee :

- `System.loadLibrary("3dscanner")`

### Quel code C++ recoit les frames ?

Implementation JNI :

- `scanner/app/src/main/jni/app.cc`

Fonctions cle :

- `App::OnARServiceConnected(...)`
- `App::OnDrawFrame(...)`
- `App::OnToggleButtonClicked(...)`
- `App::Save(...)`
- `App::Texturize(...)`

Couche AR/depth/point cloud :

- `common/arcore/service.cc`
- `common/arcore/arcore.cc`
- `common/arcore/arengine.cc`

Thread de reconstruction :

- `common/thread/reconstr.cc`
  - `ProcessReconstruction`
  - `ProcessPoseCorrection`

### Quelles donnees sont capturees ?

#### Donnees effectivement utilisees pendant le scan

- Image couleur RGB/YUV camera
- Depth map ARCore
- Raw depth ARCore quand disponible
- Confidence de raw depth quand disponible
- Pose camera
- Intrinsics derives de la projection
- Distorsion optique
- Point cloud 3D derive du depth
- Tracking state et tracking failure reason
- Timestamps frame/depth
- Indicateurs de qualite depth/coverage

#### D'ou viennent-elles ?

Principalement de :

- `common/arcore/arcore.cc`
- `common/arcore/service.cc`

#### Reponse detaillee par type

| Donnee | Capturee | Sauvegardee aujourd'hui | Notes |
| --- | --- | --- | --- |
| RGB camera | Oui | Oui (`.jpg`) | Sauvegarde par frame acceptee |
| Depth | Oui | Non comme fichier depth natif | Sert au point cloud/reconstruction |
| Raw depth | Oui si supporte | Non | Utilise en memoire |
| Confidence | Oui si supporte | Non | Utilise en memoire pour filtrer |
| Pose camera | Oui | Oui (`.mat`) | Plusieurs matrices camera/OpenGL/screen |
| Intrinsics | Oui | Oui via `state.txt` | Sauvegarde globale, pas par frame |
| Distorsion | Oui | Oui via `distortion.txt` | Globale |
| Point cloud | Oui | Oui (`.pcl`) | Un nuage binaire par frame acceptee |
| Tracking state | Oui | Non | Utilise pour filtrer les frames |
| Tracking failure | Oui | Non | Utilise pour messages/qualite |
| Timestamp | Oui | Oui (`.tms`) | Timestamp relatif de capture |
| Mesh preview | Oui | Partiellement (`.bin`) | Supprime quand on sauvegarde un dataset portable |

### Ou ces donnees sont stockees en memoire ?

Structure centrale :

- `common/thread/reconstr.h`
- `oc::Reconstruction`

Champs importants :

- `frame_image`
- `frame_points`
- `frame_pose`
- `frame_calibration`
- `frame_distortion`
- `frame_viewmat`
- `frame_timestamp`
- `depth`
- `scan`
- `texturize`

Le mesh live est maintenu principalement dans :

- `common/tango/scan.cc`
- `TangoScan::meshes`

### Est-ce qu'elles sont ecrites sur disque pendant le scan ?

Oui.

Le scan ecrit deja un dataset incrementiel dans le dossier temporaire Android :

- `AbstractActivity.getTempPath()`
- dossier physique : `dataset/`

Fichiers ecrits pendant la capture :

- `00000000.jpg`
- `00000000.mat`
- `00000000.tms`
- `00000000.pcl`
- `00000000.bin`
- `state.txt`
- `distortion.txt`
- `rotation.txt`

Ecriture principale :

- `common/tango/texturize.cc`
- `common/data/dataset.cc`
- `common/thread/reconstr.cc`

## Reconstruction

### Ou est faite la reconstruction 3D ?

La reconstruction se fait en natif C++.

Fichiers responsables :

- `common/thread/reconstr.cc`
- `common/tango/retango.cc`
- `common/tango/scan.cc`
- `scanner/app/src/main/jni/app.cc`

### Est-ce fait en temps reel ou apres le scan ?

Les deux, mais pas de la meme facon :

- Pendant la capture : la geometrie est deja integree en temps reel frame par frame.
- Apres le scan : le service Android peut rejouer le dataset via `onUndoButtonClicked(...)` avant l'export final.

### Le mesh est-il construit progressivement ?

Oui.

Le mesh est mis a jour par blocs/grilles Tango3DR puis fusionne progressivement. L'utilisateur voit donc un maillage evoluer pendant le scan.

### Quel format interne est utilise ?

Principalement :

- `Tango3DR_PointCloud`
- `Tango3DR_Mesh`
- structures `GridIndex`
- `unordered_map<GridIndex, Tango3DR_Mesh*>` pour le mesh live

### Quels parametres controlent la reconstruction ?

Ils sont resolus cote Android puis passes au natif dans `JNI.onARServiceConnected(...)` :

- resolution voxel / scan
- profondeur min/max
- niveau de bruit
- clearing
- holes filling
- pose correction
- profil qualite natif

Sources :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/QualityProfiles.java`
- `Main.bindAR()`
- `common/tango/scan.cc`

### Qu'est-ce qui tourne deja pendant la capture ?

Pendant la capture tournent deja :

- acquisition ARCore / AREngine
- calcul pose / tracking
- extraction point cloud
- fusion profondeur
- integration reconstruction 3D
- merge du mesh
- ecriture dataset incrementielle
- messages de guidance / qualite

### Qu'est-ce qui tourne apres la capture ?

Apres la capture :

- replay de reconstruction si besoin
- export OBJ provisoire
- texturing Tango
- eventuelle analyse custom d'images
- validation export
- deplacement final vers le stockage utilisateur

## Analyse image / texturing

### Ou commence l'etape "analyse d'image" ?

Le workflow Android entre dans cet etat dans :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanProcessingService.java`
  - `runSaveTexturedScan(...)`
  - `runPostprocess(...)`

Le traitement natif se fait dans :

- `common/postproc/texturize.cc`
  - `oc::Texturize::Process(...)`

### Quel fichier contient le texturing ?

Il y a en pratique deux sous-pipelines :

1. Texturing Tango / unwrap / atlas / export OBJ-MTL-textures
   - `common/tango/texturize.cc`

2. Analyse custom des images / selection des meilleures frames / reprojection texels
   - `common/postproc/texturize.cc`

### Comment les images sont selectionnees ?

Dans `common/postproc/texturize.cc` :

- `LoadModel(...)`
- `ProjectFrames(true)`
- `RemoveBadFrames()`
- `ProjectFrames(false)`

Le code score les frames via leurs texels projetes, puis supprime les plus mauvaises tant que la couverture texture reste acceptable.

### Comment les UV sont generees ?

Les UV finales sont generees par Tango3DR :

- `Tango3DR_getTexturedMesh(...)`
- `Tango3DR_Mesh_saveToObj(...)`

`oc::Texturize` suppose ensuite qu'un mesh avec UV existe deja pour faire sa projection d'images.

### Comment les textures sont creees ?

Pipeline reel :

1. `JNI.save(...)` genere un OBJ de geometrie temporaire.
2. `TangoTexturize::Init(...)` cree le contexte de texturing.
3. `TangoTexturize::ApplyFrames(...)` recharge les images `.jpg` et leurs poses.
4. Optionnellement, `oc::Texturize::Process(...)` fait l'analyse d'images et la selection de frames.
5. `TangoTexturize::Process(...)` lance unwrap + export OBJ/MTL/textures.

### Pourquoi cette etape peut prendre 30 minutes ?

Ca peut etre lent pour plusieurs raisons cumulees :

- beaucoup de frames a relire du dataset
- passage CPU sur toutes les images
- analyse Canny + depth render + projection UV + ecriture `.tex`
- seconde passe de reprojection finale
- unwrap / conversion texture Tango3DR en CPU
- grosses textures possibles (`2048` a `4096`)
- Poisson optionnel
- forte I/O disque
- tres peu de parallelisme visible dans ce code

Le point lent principal n'est donc pas la simple capture Android ; c'est surtout le post-traitement image/texturing et, selon le mode, le rejeu de reconstruction.

### Quelles donnees exactes sont necessaires pour refaire cette etape sur PC ?

Pour rejouer l'analyse d'images actuelle :

- toutes les images `.jpg`
- toutes les poses `.mat`
- `state.txt`
- `distortion.txt`
- un mesh geometrique d'entree

Pour refaire exactement le texturing actuel :

- le dataset ci-dessus
- le mesh d'entree
- la bibliotheque `tango_3d_reconstruction` ou un remplacement compatible

Important :

- les cartes depth raw/confidence ne sont pas necessaires pour l'analyse image actuelle, car le code relit surtout `jpg + mat + state + mesh`.
- elles seraient utiles seulement si on change de strategie de reconstruction/texturing cote PC.

## Export

### Ou sont generes OBJ / MTL / textures ?

Generation principale :

- `common/tango/texturize.cc`
  - `Tango3DR_Mesh_saveToObj(...)`

Reecriture / finalisation :

- `scanner/app/src/main/jni/app.cc`
  - `App::Texturize(...)`
  - validation native

Ecriture alternative OBJ/MTL :

- `common/data/file3d.cc`

### Quelles classes/fichiers font l'export ?

Cote Java :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanProcessingService.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/TextureExportValidator.java`

Cote C++ :

- `scanner/app/src/main/jni/app.cc`
- `common/tango/texturize.cc`
- `common/data/file3d.cc`
- `common/exporter/*.cc`

### Est-ce que l'export depend d'Android ?

Partiellement.

- L'orchestration du workflow depend d'Android.
- Le format OBJ/MTL lui-meme n'est pas Android-specifique.
- Mais le pipeline exact de texturing depend de `tango_3d_reconstruction` et de l'integration Android actuelle.

### Est-ce que l'export peut etre compile sur Windows ?

Partiellement seulement.

Portable ou presque :

- `common/data/file3d.cc`
- une partie de `common/postproc/*`
- le format dataset
- la logique de validation

Bloquants majeurs :

- `common/arcore/*`
- `scanner/app/src/main/jni/app.cc` monolithique Android/GL/JNI
- `common/tango/scan.cc`
- `common/tango/texturize.cc`
- dependance `tango_3d_reconstruction` fournie ici uniquement pour Android

## Workflow Android

### Workflow exact actuel

Workflow nominal scan normal :

1. `SCANNING`
2. utilisateur appuie sur sauvegarde
3. `SCAN_FINISHED`
4. `PROCESSING_GEOMETRY`
5. `ANALYZING_IMAGES`
6. `GENERATING_TEXTURES`
7. `VALIDATING_EXPORT`
8. `READY`

Workflow dataset brut :

1. `SCANNING`
2. `SCAN_FINISHED`
3. `VALIDATING_EXPORT`
4. `READY`

### Ou sont les etats ?

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanWorkflowState.java`

Etats declares :

- `IDLE`
- `SCANNING`
- `SCAN_FINISHED`
- `PROCESSING_GEOMETRY`
- `ANALYZING_IMAGES`
- `GENERATING_TEXTURES`
- `VALIDATING_EXPORT`
- `READY`
- `ERROR`

### Ou est appele READY ?

Dans :

- `ScanProcessingService.finishSuccess(...)`

Le workflow n'annonce pas `READY` avant la fin de l'export et de la validation.

### Ou est la validation texture ?

Deux niveaux :

- validation Java :
  - `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/TextureExportValidator.java`

- validation C++ :
  - `scanner/app/src/main/jni/app.cc`
  - `ValidateTexturedExport(...)`

### Quels fichiers recents/centraux ont modifie ce workflow ?

Fichiers code centraux :

- `Main.java`
- `ScanProcessingService.java`
- `TextureExportValidator.java`
- `Exporter.java`
- `app.cc`
- `common/tango/texturize.cc`
- `common/postproc/texturize.cc`

Documents d'audit deja presents dans le depot :

- `SCAN_WORKFLOW_AUDIT.md`
- `TEXTURE_REGRESSION_FIX.md`
- `PERFORMANCE_AUDIT.md`
- `EXPORT_RECOMMENDATIONS.md`

## Dependances Android difficiles a deplacer sur PC

Tres difficiles ou non portables telles quelles :

- ARCore direct
- AREngine
- Android Bitmap / Media NDK
- Android filesystem / cycle de vie Activity/Service
- OpenGL Android tel qu'integre ici
- JNI
- UI Android
- permissions Android
- classes Java Android
- dependance `tango_3d_reconstruction` version Android

## Ce qui peut etre deplace sur PC

Reutilisable totalement ou partiellement :

- format dataset courant (`.jpg`, `.mat`, `.tms`, `.pcl`, `state.txt`, `distortion.txt`, `rotation.txt`)
- validation dataset
- analyse d'images `common/postproc/texturize.cc`
- export OBJ/MTL via `common/data/file3d.cc`
- une partie des `common/exporter/*`
- eventuellement Poisson / traitements postproc C++

## Reponse strategique pour le futur PC processor

Le projet permet deja un futur decouplage :

- Android = capture + dataset brut
- PC = validation dataset + replay/traitement lourd

Mais il ne faut pas supposer que tout le C++ Android compile tel quel sur Windows.

Le vrai point de rupture est :

- la couche AR Android pour la capture live
- la couche Tango3DR pour reconstruction/texturing identiques a l'existant

Autrement dit :

- Oui, un PC processor local Windows est faisable.
- Non, il ne faut pas le baser sur l'idee que `scanner/app/src/main/jni/app.cc` et `common/tango/*` seront juste recompiles tels quels sur Windows sans travail d'extraction/remplacement.
