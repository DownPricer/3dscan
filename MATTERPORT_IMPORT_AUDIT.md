# Audit import Matterport — `ZipTest Matterport`

Date: 2026-05-28  
Source inspectée: `zip test/Matterport`

## Résumé

- **Nombre de fichiers**: 176
- **Taille totale**: 258.76 MiB (~271,334,651 bytes)
- **Dossiers**: `Backup/`, `Backup/Jobs/<jobId>/`, `Backup/Jobs/<jobId>/Floors/*`

## Structure des dossiers

- `zip test/Matterport/Backup/`
  - `backup_data`, `backup_data-wal`, `backup_data-shm` (probable **SQLite + WAL/SHM**)
  - `Jobs/b41cab0f-47f3-4177-a19f-69d8e9c33a73/`
    - `Floors/27c5b9fe-893b-4f6b-bdbe-3370fb71815f/*`
    - `Floors/ScanLocal/*`
    - fichiers `.swl`, `.mmp`, `.pb`, `.dam`, images `.jpg`, `manifest.mfst`, `job-log.txt`

## Extensions trouvées (comptage)

- `.jpg`: 126
- `.pb`: 13
- `.mmp`: 13
- `.png`: 7
- `.dam`: 6
- `.swl`: 6
- `.mfst`: 1
- `.txt`: 1
- **sans extension**: 3 (`backup_data*`)

## Présence des formats attendus

- **OBJ (`.obj`)**: non
- **MTL (`.mtl`)**: non
- **Textures `.jpg/.png`**: oui (mais **pas** dans le sens “textures référencées par un `.mtl`”)
- **GLB/GLTF (`.glb/.gltf`)**: non
- **E57 (`.e57`)**: non
- **XYZ (`.xyz`)**: non
- **PDF**: non
- **HTML / embed**: non (`.html` absent)
- **JSON metadata**: non (`.json` absent)

## Fichiers notables

### Base backup (à la racine de `Backup/`)

- `Backup/backup_data` (84 KiB)
- `Backup/backup_data-wal` (410.4 KiB)
- `Backup/backup_data-shm` (32 KiB)

### Metadata / logs du job

- `Backup/Jobs/b41cab0f-47f3-4177-a19f-69d8e9c33a73/manifest.mfst` (14.6 KiB, **binaire**)
- `Backup/Jobs/b41cab0f-47f3-4177-a19f-69d8e9c33a73/job-log.txt` (1.2 KiB)

Extrait `job-log.txt` (indicateur de “job upload” plutôt qu’un export modèle):

```text
2026-05-28 ... Failed to upload swl ... swl_upload_max_attempts_reached
2026-05-28 ... Swl Uploaded successfully: <uuid>
2026-05-28 ... Upload manifest started
```

### Données “scan/capture” (formats non standards web viewer)

Dans `Backup/Jobs/<jobId>/`:

- **`.swl` (6 fichiers, ~18–22 MiB chacun)**: ex `317750fe-... .swl`, `6c3be552-... .swl`, etc.
- **`.pb` (13 fichiers)**: ex `*_sweep_cloud.pb`, `*_sweep_features.pb`, `*_location_data.pb`
- **`.mmp` (13 fichiers)** + **aperçus `.mmp.png`**
- **`.dam` (6 fichiers)** (même base de nom que les sweeps)
- **`.jpg`**:
  - pattern principal: `<uuidSansTirets>_{128|256|512}_{000..005}.jpg` (vignettes multi-résolution)
  - `*_skybox*.jpg` (images “skybox”)
  - `Floors/ScanLocal/*.jpg` (quelques très grosses images, ~16–20 MiB chacune)

## Lien Matterport / embed

- Aucun fichier `.html` ou `.json` trouvé.
- `manifest.mfst` contient des chaînes (ex. `Insta360 X5`, `scan_align_success`, localisation), mais **aucune URL Matterport exploitable** n’a été détectée lors d’une extraction de chaînes ASCII.

## Réponses demandées (Phase 1)

1. **Est-ce un MatterPak ?**  
   **Non.** Il n’y a ni `.obj/.mtl` ni arborescence/artefacts typiques d’un MatterPak (modèle + textures + metadata export).

2. **Est-ce un export OBJ texturé ?**  
   **Non.** Aucun `.obj` / `.mtl`.

3. **Est-ce un export E57 / point cloud ?**  
   **Non.** Aucun `.e57` / `.xyz`.

4. **Est-ce directement visualisable dans notre viewer actuel ?**  
   **Non.** Notre viewer sait afficher GLB/OBJ et des panoramas/hybride. Ici ce sont des données de capture (`.swl/.mmp/.pb/.dam`) + des images, **non directement affichables** par le viewer actuel.

5. **Mieux vaut l’importer comme modèle 3D ou l’intégrer en iframe Matterport ?**  
   **Iframe Matterport** est **l’option recommandée** si tu as une URL publique / un embed (ou un `modelId`), car elle conserve l’expérience native (dollhouse, plan, navigation, tags, transitions).  
   Pour un import “fichier”, il faut obtenir depuis Matterport un export **GLB/GLTF** ou **MatterPak OBJ**; ce backup ne convient pas.

6. **Quels fichiers exacts doivent être uploadés sur le site ?**
   - **Option iframe (recommandée)**: aucun fichier. **Uploader/stockage uniquement d’un `matterportUrl` ou `matterportEmbedUrl`**.
   - **Option import fichier (si export obtenu)**:
     - **GLB**: `*.glb`
     - **GLTF**: `*.gltf` + `*.bin` + textures (`.jpg/.png`) si nécessaire
     - **MatterPak OBJ**: `*.obj` + `*.mtl` + toutes les textures référencées dans le `.mtl` (`map_Kd`, etc.)
   - **Pour ce dossier précis**: **aucun** (à traiter comme **UNSUPPORTED** côté admin/import).

## Commande pour relister tous les fichiers (si besoin)

Depuis la racine du repo (PowerShell):

```powershell
$base = (Resolve-Path '.\\zip test\\Matterport').Path
Get-ChildItem -LiteralPath $base -Recurse -File -Force |
  Sort-Object FullName |
  ForEach-Object {
    $rel = $_.FullName.Substring($base.Length+1)
    $kb = [math]::Round($_.Length/1KB,1)
    \"$kb KiB`t$rel\"
  }
```

