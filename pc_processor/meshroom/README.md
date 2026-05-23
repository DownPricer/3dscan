# Traitement texturé PC — Meshroom / AliceVision

## Objectif

Transformer un **ZIP dataset Android** (export « pour PC ») en modèle **texturé** pour le site, sans refaire l’analyse lourde sur le téléphone.

```
dataset.zip  →  extraction JPG  →  meshroom_batch  →  site-ready/site_model.glb
```

## Prérequis

1. **Meshroom** installé sur Windows  
   Téléchargement : https://github.com/alicevision/Meshroom/releases  
2. **GPU NVIDIA** fortement recommandé (CUDA)
3. **trimesh** (optionnel, pour GLB) :
   ```bat
   py -3 -m pip install trimesh
   ```

## Configuration

### Interface

1. `run_gui.bat`
2. Section **Traitement PC texturé**
3. **Choisir dossier Meshroom** — dossier contenant `meshroom_batch.exe`
4. Choisir le ZIP dataset
5. **Lancer traitement texturé Meshroom**

### Ligne de commande

```bat
cd pc_processor
py -3 tools\run_meshroom_pipeline.py "C:\chemin\scan.zip" "output_gui\meshroom_test" --meshroom-dir "C:\Program Files\Meshroom" --save-meshroom-config
```

Extraction JPG seule (sans Meshroom) :

```bat
py -3 tools\run_meshroom_pipeline.py scan.zip output_test --extract-only
```

Config persistante : `meshroom/user_config.json`

Variable d’environnement : `MESHROOM_DIR`

## Sortie attendue

```text
output_folder/
  work/
    images/           # JPG copies
    meshroom_out/     # sortie Meshroom
    meshroom_cache/   # cache AliceVision
  site-ready/
    site_model.glb    # si trimesh OK
    site_model.obj    # sinon
    site_model.mtl
    textures/
    metadata.json
    README_UPLOAD_SITE.txt
```

## Différence avec le scan Android (ARCore)

| | Android Tango3DR | Meshroom PC |
|---|------------------|-------------|
| Entrées | Mesh + JPG + poses `.mat` | **JPG uniquement** |
| Poses | ARCore | Estimées (SfM) |
| Textures | Tango3DR | AliceVision |

**Avantages Meshroom :** vrai modèle texturé PC, téléphone libéré.  
**Limites :** murs blancs, peu de recouvrement, pièces sombres → échec possible ; plus lent sans GPU ; géométrie peut différer du scan live.

## Route B — COLMAP + OpenMVS (non implémentée)

Si Meshroom échoue systématiquement :

1. **COLMAP** — reconstruction :
   ```bat
   colmap automatic_reconstructor --workspace_path COLMAP_WORK --image_path work/images
   ```
2. **OpenMVS** — densification + mesh + texturing :
   ```bat
   InterfaceOpenMVS.exe -i scene.mvs -w DENSIFY
   InterfaceOpenMVS.exe -i scene_dense.mvs -w MESH
   InterfaceOpenMVS.exe -i scene_dense_mesh.mvs -w TEXTURE
   ```
3. Conversion OBJ → GLB (trimesh)

Documenter les chemins d’install et adapter `run_meshroom_pipeline.py` en `run_colmap_openmvs_pipeline.py` si besoin.

## Dépannage

| Problème | Action |
|----------|--------|
| Meshroom non trouvé | Installer Meshroom, bouton « Choisir dossier Meshroom » |
| Pas assez d’images | Minimum 8 JPG ; refaire un scan plus long |
| meshroom_batch code ≠ 0 | Ouvrir Meshroom GUI sur `work/images`, vérifier GPU/CUDA |
| Pas d’OBJ en sortie | Vérifier `work/meshroom_out/` ; pipeline incomplet |
| GLB absent | `pip install trimesh` ; uploader OBJ+MTL+textures |

## Fichiers

- `../src/meshroom_pipeline.py` — logique
- `../tools/run_meshroom_pipeline.py` — CLI
- `user_config.json` — chemin Meshroom (créé par la GUI)
