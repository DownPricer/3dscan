# Audit outils photogrammétrie PC

Date : 2026-05-19  
Contexte : export dataset Android (JPG) → modèle **texturé** sur PC pour le site immobilier.

---

## Tableau comparatif

| Critère | Meshroom / AliceVision | COLMAP | OpenMVS | Pipeline maison Open3D/trimesh |
|---------|------------------------|--------|---------|-------------------------------|
| **Windows disponible** | Oui (installateur officiel) | Oui | Oui (après COLMAP) | Oui (Python) |
| **Ligne de commande** | Oui — `meshroom_batch` | Oui — `colmap` CLI | Oui — `DensifyPointCloud`, etc. | Oui — scripts Python |
| **Modèle texturé** | Oui (nœud Texturing) | Non seul (nuage/sparse) | Oui (étape texturing) | Non (gris / vertex colors MVP) |
| **OBJ + MTL + textures** | Oui (`texturedMesh.obj` + PNG) | Via export partiel | Oui | OBJ gris seulement |
| **GLB direct** | Non (conversion externe) | Non | Non | Oui (non texturé) |
| **Intégrable pc_processor** | **Oui** (MVP prévu) | Oui (plus complexe) | Oui (chaîne multi-outils) | Déjà partiel |
| **Difficulté** | Moyenne | Élevée | Élevée | Faible mais **insuffisant qualité** |
| **Dépendances** | Meshroom + CUDA optionnel | COLMAP + CUDA | COLMAP + OpenMVS + CUDA | open3d, trimesh |
| **GPU** | Fortement recommandé | Recommandé | Recommandé | Optionnel |
| **Avantage immobilier** | Pipeline complet « clé en main », UI connue | Contrôle fin, standard recherche | Qualité mesh élevée | Rapide, pas photogrammétrie réelle |
| **Inconvénient** | Lourd, lent sans GPU, ignore poses ARCore | Beaucoup d’étapes manuelles | Chaînage fragile | Pas de vraies textures photo |

---

## 1. Meshroom / AliceVision

- **Site :** https://alicevision.org / https://github.com/alicevision/Meshroom
- **CLI :** `meshroom_batch -i <images> -o <output> -p photogrammetry`
- **Sortie typique :** `texturedMesh.obj`, `.mtl`, `texture_*.png` (nœud Texturing + Publish)
- **GLB :** conversion via trimesh / Blender / obj2gltf
- **Intégration :** extraction JPG du ZIP → dossier images → subprocess batch → copie `site-ready/`

**Pour notre usage :** meilleur candidat pour un **premier MVP PC texturé** sans réécrire Tango3DR.

---

## 2. COLMAP

- Reconstruction SfM + MVS partielle en CLI
- Ne produit **pas** directement un OBJ texturé prêt site
- Nécessite enchaînement OpenMVS ou autre pour mesh + textures
- **Intégration possible** mais 3–5× plus de glue code que Meshroom

---

## 3. OpenMVS

- Complète COLMAP (dense cloud → mesh → texturing)
- Qualité excellente, installation Windows plus pénible
- **Route B** documentée dans `pc_processor/meshroom/README.md` (section COLMAP/OpenMVS)

---

## 4. Pipeline maison actuel

- Point cloud depuis `.pcl` + poses `.mat`
- Mesh Poisson Open3D gris
- **Ne remplace pas** la photogrammétrie multi-vues sur JPG
- Conservé pour validation dataset uniquement

---

## Différence avec pipeline ARCore Android

| | Android (Tango3DR) | Meshroom (PC) |
|---|------------------|---------------|
| Entrée | Mesh voxel + JPG + poses | **JPG seuls** (photogrammétrie classique) |
| Poses | ARCore `.mat` utilisées | Estimées par SfM |
| Texturing | Tango3DR atlas | AliceVision Texturing |
| Résultat | Proche du scan live | Dépend du recouvrement / texture des murs |

**Avantage PC Meshroom :** vrai modèle texturé sans calcul lourd sur téléphone.  
**Inconvénients :** temps GPU, échec possible (murs blancs, peu de parallaxe), géométrie peut différer du scan ARCore.

---

## Route recommandée

1. **Court terme :** Meshroom batch intégré (`run_meshroom_pipeline.py`)
2. **Si échec Meshroom :** documenter COLMAP + OpenMVS
3. **Ne pas** présenter le pipeline Open3D gris comme produit final
