# native

Preparation du futur moteur C++ Windows.

## But

Isoler progressivement les modules potentiellement portables du projet principal, sans forcer aujourd'hui une compilation complete qui dependrait encore d'Android ou de Tango3DR.

## Candidats portables

- `common/data/dataset.cc`
- `common/data/file3d.cc`
- `common/data/image.cc`
- `common/data/mesh.cc`
- `common/postproc/texturize.cc`
- `common/exporter/*`

## Blocages actuels

- `common/arcore/*`
- `scanner/app/src/main/jni/app.cc`
- `common/tango/scan.cc`
- `common/tango/texturize.cc`
- dependances Android / ARCore / Tango3DR

## Dataset extractor

Le dossier `dataset_extractor/` semble desktop-friendly, mais son build Windows depend encore de :

- OpenCV
- libpng
- turbojpeg

et il n'est pas encore verifie ici comme build Windows complet.

## Fichiers

- `CMakeLists.txt`
  - squelette de build Windows natif

- `build_dataset_extractor_windows.bat`
  - tentative de build Windows non destructive pour `dataset_extractor`
