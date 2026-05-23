# Proposition d'architecture realiste pour un PC processor Windows

## Reponse courte

Oui, un outil PC Windows local est faisable.

Mais il faut etre precis :

- Reutilisation du code C++ existant sur Windows : **partiellement**
- Recompilation directe du pipeline Android complet : **non**
- Meilleur MVP : **CLI local Windows**, avec **validation dataset** et **rapport**, pilote par un petit wrapper Python au debut

## Peut-on reutiliser le code C++ existant sur Windows ?

### Reponse

**Partiellement.**

### Reutilisable ou adaptable

Ces zones sont de bonnes candidates pour un futur port PC :

- `common/data/dataset.cc`
- `common/data/file3d.cc`
- `common/data/image.cc`
- `common/data/mesh.cc`
- `common/postproc/texturize.cc`
- `common/postproc/poisson.cc`
- `common/exporter/*`
- `common/editor/rasterizer.cc`
- `dataset_extractor/app.cpp`
- `dataset_extractor/CMakeLists.txt`

Signal important :

- Le dossier `dataset_extractor/` montre qu'une partie desktop existe deja pour lire un dataset et lancer `oc::Texturize`.

### Non reutilisable tel quel

Ces zones sont fortement couplees a Android ou a des libs non disponibles ici pour Windows :

- `common/arcore/*`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/renderer.cc`
- `common/tango/scan.cc`
- `common/tango/texturize.cc`
- `scanner/app/src/main/java/*`

### Dependances

Dependances importantes visibles dans le projet :

- OpenCV
- libpng
- turbojpeg
- ARCore
- AREngine
- `tango_3d_reconstruction`

### Obstacles majeurs

1. `ARCore` et `AREngine` sont des dependances de capture mobile, pas des briques PC a reprendre.
2. `app.cc` melange JNI, OpenGL Android, workflow et traitement.
3. `tango_3d_reconstruction` n'apparait ici qu'en integration Android :
   - `third_party/tango_3d_reconstruction/Android.mk`
   - header present
   - pas de binaire Windows fourni dans ce depot
4. Le texturing exact actuel depend de Tango3DR pour l'unwrap et l'export texture final.

## Quel type d'outil faut-il commencer ?

### C++ natif pur des le debut ?

Pas comme premier MVP.

Pourquoi :

- trop de friction de build immediate
- besoin d'abord de verrouiller le format dataset reel
- il faut un outil rapide a produire pour verifier les datasets Android reellement transferes

### Python qui orchestre le C++ ?

**Oui, c'est la meilleure base de depart.**

Pourquoi :

- lecture ZIP/dossiers tres simple
- bon pour la validation, le reporting et les checks de structure
- excellent pour un MVP honnete
- peut ensuite appeler un binaire C++ quand les briques natives seront pretes

### Java/Kotlin desktop ?

Je ne le recommande pas pour ce projet.

Pourquoi :

- la capture Android reste cote telephone
- le traitement lourd est surtout C++/vision/mesh
- Java desktop n'apporte pas d'avantage clair ici

### Electron/Tauri ?

Plus tard seulement pour une UI locale.

Pas pour le MVP.

## Meilleur MVP recommande

Je confirme ton intuition, avec une petite nuance.

### MVP recommande

- dossier `pc_processor/`
- script Windows `.bat`
- outil CLI
- lecture dossier ou ZIP dataset
- validation des donnees
- rapport JSON
- copie preview minimale

### Nuance importante

Je garderais **Python pour le wrapper CLI** au debut, puis **C++ pour les briques de traitement** au fur et a mesure.

Donc la cible la plus realiste est :

- **MVP 1 : Python CLI**
- **MVP 2 : ajout progressif de binaires C++ portables**
- **MVP 3 : eventuelle UI locale**

## Structure de dossier recommandee

Structure propre et realiste pour la suite :

```text
pc_processor/
  README.md
  ROADMAP.md
  DATASET_FORMAT.md
  run_pc_processing.bat
  validate_dataset.py
  output/
```

Structure cible a moyen terme :

```text
pc_processor/
  README.md
  ROADMAP.md
  DATASET_FORMAT.md
  run_pc_processing.bat
  validate_dataset.py
  src/
  include/
  third_party/
  tools/
  output/
  test_datasets/
  CMakeLists.txt
```

Je ne cree pas tout cela maintenant, pour ne pas faire semblant qu'un moteur PC complet existe deja.

## Ordre des MVP

### MVP 1

Ton ordre est bon :

- lire ZIP dataset
- verifier metadata
- compter frames/depth/poses
- generer rapport

J'ajoute seulement :

- compatibilite avec le dataset Android legacy actuel, meme sans `metadata.json`

### MVP 2

Je modifierais legerement l'objectif.

Plutot que promettre "reproduire le texturing/export sur PC" tout de suite, je recommande :

- port de la validation dataset en C++ si utile
- lecture du dataset en C++
- port des utilitaires non Android (`dataset`, `file3d`, export helpers)
- essais sur `dataset_extractor`
- verification de ce qui manque vraiment pour lancer `oc::Texturize` proprement sous Windows

Pourquoi :

- l'export OBJ/MTL maison est faisable
- l'analyse d'images partielle est probablement portable
- le texturing exact actuel reste bloque par Tango3DR

### MVP 3

La, oui :

- reconstruction complete PC
- ou remplacement cible des dependances Tango3DR
- puis pipeline texturing final

## Ce qu'on peut faire en premier sans risque

Ordre concret recommande :

1. documenter le dataset reel et son contrat
2. valider automatiquement les datasets Android exportes
3. ajouter `metadata.json` cote Android
4. tester `dataset_extractor` sur Windows ou adapter son build
5. isoler les modules C++ non Android dans un vrai sous-projet desktop
6. traiter ensuite le gros sujet : remplacement/port de Tango3DR

## Point critique : ou est vraiment le risque ?

Le risque principal n'est pas "faire une CLI Windows".

Le vrai risque est :

- croire que la reconstruction/texturing actuelle se recompilent telles quelles sur Windows

La partie la plus risquee aujourd'hui est :

- `common/tango/scan.cc`
- `common/tango/texturize.cc`
- plus generalement toute dependance a `tango_3d_reconstruction`

## Recommandation techno finale

### Ce que je recommande

- **Maintenant** : Python CLI local
- **Ensuite** : extraire/porter progressivement du C++ non Android
- **Plus tard** : UI Windows locale seulement si necessaire

### Ce que je ne recommande pas

- gros outil desktop GUI des maintenant
- Electron/Tauri avant d'avoir un moteur stable
- refonte Android prematurée
- promesse de reconstruction complete PC sans traiter le sujet Tango3DR

## Reponse finale aux questions

### Est-ce qu'on peut reutiliser le code C++ existant sur Windows ?

- **Oui, partiellement**
- surtout `common/data/*`, `common/postproc/*`, `common/exporter/*`
- **Non** pour le pipeline Android/JNI/ARCore/Tango complet tel quel

### Quel est le meilleur MVP ?

- **CLI local Windows**
- **wrapper Python**
- **validation dataset**
- **rapport JSON**
- **aucune pretention de reconstruction complete tant que le coeur natif n'est pas porte**

### Quelle structure de dossier creer maintenant ?

- `pc_processor/`
  - `README.md`
  - `run_pc_processing.bat`
  - `DATASET_FORMAT.md`
  - `ROADMAP.md`
  - `validate_dataset.py`

### L'ordre MVP 1 / 2 / 3 est-il bon ?

- **Oui pour MVP 1**
- **Oui avec ajustement pour MVP 2**
- **Oui pour MVP 3**, mais seulement apres decision sur la strategie Tango3DR/reconstruction
