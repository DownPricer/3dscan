# Dataset format pour `pc_processor`

## Regle principale

Le logiciel Windows doit accepter :

- un dossier `.dataset`
- un `.zip`
- un dataset avec ou sans `metadata.json`

Le format cible doit rester compatible avec le dataset reel deja produit par Android.

## Dataset Android legacy reel

```text
scan-session.dataset/
  state.txt
  distortion.txt
  rotation.txt
  position.txt            # optionnel
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

## Dataset enrichi recommande

```text
scan-session/
  metadata.json
  capture_log.txt         # optionnel
  state.txt
  distortion.txt
  rotation.txt
  position.txt            # optionnel
  00000000.jpg
  00000000.mat
  00000000.tms
  00000000.pcl
  00000001.jpg
  00000001.mat
  00000001.tms
  00000001.pcl
  ...
  processing_input.obj    # optionnel futur
```

## Format de `state.txt`

Une ligne :

```text
count width height cx cy fx fy
```

## Format de `distortion.txt`

Format reel :

```text
<nombre de coefficients>
<coef 1>
<coef 2>
...
```

## Format de `rotation.txt`

Une valeur flottante :

```text
<yaw_degres>
```

## Format de `NNNNNNNN.mat`

Le code Android ecrit **3** matrices `4x4` (`COLOR_CAMERA`, `OPENGL_CAMERA`, `SCREEN_CAMERA`).

Important :

- texte ASCII, une ligne = une colonne GLM (`pose[camera][col][row]`)
- **12 lignes** de 4 flottants par fichier (48 valeurs)
- le dataset synthetique PC de test peut en avoir 16 (4 matrices) ; les deux formats sont supportes
- pour le PLY debug PC, utiliser **COLOR_CAMERA** (premiere matrice)

Voir `PC_MAT_FORMAT_AUDIT.md` pour le detail et les exemples reels.

## Format de `NNNNNNNN.pcl`

Format binaire reel observe dans `common/data/dataset.cc` et `tango_3d_reconstruction_api.h` :

```text
uint32 little-endian : num_points
num_points * struct {
  float x;
  float y;
  float z;
  float confidence;
}
```

Notes :

- les points sont stockes en `XYZC`
- `confidence` est dans `[0.0, 1.0]`
- le logiciel PC actuel exporte un `PLY` de debug en niveaux de gris a partir de cette confiance

## Champs recommandes pour `metadata.json`

```json
{
  "dataset_format_version": 1,
  "app_version": "android-app-version",
  "capture_backend": "ARCore|AREngine",
  "capture_mode": "GOOGLE_SFM|GOOGLE_TOF|GOOGLE_FACE|HUAWEI_SFM|HUAWEI_TOF|HUAWEI_FACE",
  "scan_quality_profile": "FAST|NORMAL|HIGH|REAL_ESTATE_HD",
  "resolution": 0.02,
  "dmin": 0.01,
  "dmax": 7.0,
  "noise": 3,
  "holes_filling": false,
  "pose_correction": false,
  "clearing": false,
  "analyse_images": true,
  "poisson": false,
  "texture_detail": 10,
  "texture_resolution": 2048,
  "texture_count": 4,
  "frame_count_expected": 123,
  "has_timestamps": true,
  "has_pointcloud": true
}
```

## Verifications faites aujourd'hui

Le validateur verifie :

- `state.txt`
- `distortion.txt`
- `rotation.txt`
- comptage `jpg`
- comptage `mat`
- comptage `tms`
- comptage `pcl`
- coherence du nombre de frames
- fichiers manquants
- fichiers vides (critiques = erreur, non critiques comme `test.txt` = warning seulement)
- taille totale du dataset
- frames incompletes

## Remarque importante

Le logiciel PC actuel supporte le format Android legacy sans `metadata.json`, mais la prochaine evolution recommandee cote telephone reste l'ajout de `metadata.json`.
