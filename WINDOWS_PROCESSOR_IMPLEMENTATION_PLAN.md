# Plan d'implementation du processeur Windows

## But

Construire un vrai debut d'outil Windows local pour traiter les datasets Android `3DLiveScanner`, sans pretendre que la reconstruction/texturing complet PC est deja termine.

## Donnees Android reellement disponibles

Aujourd'hui, le telephone exporte deja un dataset plat exploitable :

- `state.txt`
- `distortion.txt`
- `rotation.txt`
- `position.txt` optionnel
- `NNNNNNNN.jpg`
- `NNNNNNNN.mat`
- `NNNNNNNN.tms`
- `NNNNNNNN.pcl`

Le format `.pcl` est documente par le code existant :

- 4 octets little-endian pour `num_points`
- puis `num_points` points binaires `XYZC`
- `X`, `Y`, `Z`, `C` sont 4 flottants 32 bits
- `C` represente la confiance

## Ce que le PC peut lire immediatement

Lisible tout de suite sur Windows sans ARCore :

- `state.txt`
- `distortion.txt`
- `rotation.txt`
- images `jpg`
- poses `mat`
- timestamps `tms`
- point clouds `pcl`

Donc le PC peut deja :

- valider la structure du dataset
- verifier les comptages et les incoherences
- mesurer le poids du dataset
- preparer une extraction ZIP
- fusionner les `.pcl` en un point cloud global de debug

## Parties C++ portables

Candidates realistes pour extraction/portage :

- `common/data/dataset.cc`
- `common/data/file3d.cc`
- `common/data/image.cc`
- `common/data/mesh.cc`
- `common/postproc/texturize.cc`
- `common/postproc/poisson.cc`
- `common/exporter/*`
- `common/editor/rasterizer.cc`
- `dataset_extractor/*`

## Parties bloquees par Android / ARCore / Tango3DR

Bloquees ou tres fortement couplees :

- `common/arcore/*`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/renderer.cc`
- `scanner/app/src/main/java/*`
- `common/tango/scan.cc`
- `common/tango/texturize.cc`
- tout ce qui depend d'ARCore/AREngine/JNI/Media NDK/OpenGL Android
- le texturing exact base sur `tango_3d_reconstruction`

## Ce qu'on peut calculer maintenant sur Windows

Faisable maintenant :

1. validation dataset dossier/ZIP
2. rapports JSON/TXT
3. extraction ZIP vers dossier de travail
4. fusion des `.pcl` en un `PLY` global de debug
5. statistiques de lecture dataset et point cloud

## Ce qu'on ne peut pas encore calculer

Pas encore fiable aujourd'hui :

- reconstruction complete identique a Android
- texturing complet identique a Android
- export final texturise equivalent a `TangoTexturize`
- replay complet du pipeline Tango3DR sous Windows

## Analyse de `dataset_extractor`

`dataset_extractor` est interessant, mais il n'est pas encore un point de depart Windows "plug and play".

Ce qu'il sait deja faire :

- lire un dataset avec `oc::Dataset`
- s'appuyer sur `common/exporter/*`
- lancer `oc::Texturize().Process(...)`

Ce qu'il ne fait pas directement pour notre MVP :

- il ne fournit pas un pipeline Windows utilisateur propre
- il ne remplace pas Tango3DR pour la reconstruction/texturing complet
- son build Windows depend encore de prerequis non verifies ici (`OpenCV`, `png`, `turbojpeg`)

Conclusion :

- on prepare le terrain pour le C++ Windows
- mais le MVP fonctionnel reste en Python CLI

## Meilleur ordre de developpement

### Etape 1

- verrouiller le format dataset reel
- valider dossier/ZIP
- produire des rapports lisibles

### Etape 2

- ajouter un premier calcul reel et utile
- fusionner les `.pcl`
- sortir un `PLY` de debug

### Etape 3

- preparer un sous-projet `native/`
- documenter les modules portables
- preparer les scripts de build Windows

### Etape 4

- tester/adapter `dataset_extractor`
- verifier la portabilite reelle de `common/postproc/*`

### Etape 5

- decider de la strategie de reconstruction/texturing PC
- soit port/remplacement de Tango3DR
- soit nouveau moteur PC specifique

## Decision de mise en oeuvre pour cette session

Dans cette session, le processeur Windows doit devenir :

- un CLI local Windows
- capable de lire un dataset reel ou ZIP
- capable de verifier sa completude
- capable de produire un rapport de qualite
- capable de generer un point cloud global de debug si les `.pcl` sont exploitables

Et il doit rester honnete :

- pas de reconstruction complete promise
- pas de faux export texturise
- pas de dependance Android ajoutee cote PC
