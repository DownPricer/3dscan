# Windows processor implementation plan

Copie operationnelle du plan Windows pour garder `pc_processor/` autoportant.

## Ce que le PC lit deja

- `state.txt`
- `distortion.txt`
- `rotation.txt`
- `jpg`
- `mat`
- `tms`
- `pcl`

## Ce que le logiciel Windows fait maintenant

- validation dataset dossier/ZIP
- rapports JSON/TXT
- extraction ZIP
- fusion des `.pcl` en `debug_pointcloud.ply`

## Ce qui reste bloque

- ARCore / AREngine
- JNI / UI Android
- `common/tango/scan.cc`
- `common/tango/texturize.cc`
- pipeline complet base sur `tango_3d_reconstruction`

## Ordre de developpement retenu

1. validation fiable dataset
2. point cloud debug PLY
3. preparation du futur C++ Windows
4. etude `dataset_extractor`
5. strategie reconstruction/texturing PC

## Regle d'honnetete

Le logiciel PC actuel :

- ne fait pas encore de reconstruction complete
- ne fait pas encore de texturing complet
- ne remplace pas encore le pipeline Android final
