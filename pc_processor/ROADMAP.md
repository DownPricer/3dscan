# Roadmap `pc_processor`

## Etat actuel

Fait maintenant :

- audit du pipeline Android reel
- plan d'implementation Windows
- validation dataset dossier/ZIP
- rapports JSON/TXT
- detection de frames incompletes et fichiers vides
- extraction ZIP vers dossier de travail
- premier calcul PC reel : fusion `.pcl` -> `debug_pointcloud.ply`
- preparation d'une base `native/` pour le futur C++

Pas fait :

- reconstruction complete PC
- texturing complet PC
- export texturise final equivalent Android

## MVP 1 - ingestion et validation

Objectif :

- lire dossier `.dataset` ou `.zip`
- verifier la structure
- produire des rapports fiables

Statut :

- **fonctionnel**

## MVP 2 - premier calcul utile

Objectif :

- reutiliser les `.pcl` du dataset
- produire un point cloud global de controle
- exporter un `PLY` de debug

Statut :

- **fonctionnel**

## MVP 3 - enrichissement dataset

Objectif :

- ajouter `metadata.json` cote Android
- ajouter un log de capture
- fiabiliser les diagnostics PC

Statut :

- **documente, pas encore implemente cote Android**

## MVP 4 - extraction du code portable

Objectif :

- isoler `common/data/*`
- isoler `common/exporter/*`
- preparer un build desktop propre
- tester `dataset_extractor`

Statut :

- **prepare structurellement**

## MVP 5 - traitement image/mesh portable

Objectif :

- porter des briques non Android
- verifier la portabilite de `common/postproc/*`
- etudier une voie desktop pour l'analyse d'images

Statut :

- **a faire**

## MVP 6 - reconstruction/texturing PC reel

Objectif :

- traiter le verrou `tango_3d_reconstruction`
- soit porter/remplacer cette dependance
- soit concevoir un pipeline PC specifique

Statut :

- **bloque stratégiquement tant que la direction Tango3DR n'est pas tranchee**

## Principe de travail

Toujours separer :

- ce qui marche reellement aujourd'hui
- ce qui est seulement prepare
- ce qui depend encore d'Android
- ce qui reste bloque par des dependances natives
