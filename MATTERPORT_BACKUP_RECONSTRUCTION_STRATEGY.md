# Matterport Backup Reconstruction Strategy

## Objectif

Construire une interopérabilité locale raisonnable depuis un ZIP backup Matterport sans iframe, sans appel à des services privés Matterport, sans scraping et sans contournement de DRM.

## Ce qui est déjà extractible

- Arborescence complète du ZIP et inventaire par extension.
- Images JPG/PNG/BMP avec dimensions, ratio et classification.
- Panoramas équirectangulaires 2:1 si présents.
- Groupes de 6 faces cube quand les images suivent un motif Matterport-like.
- Signatures, chaînes lisibles, entropie et flottants candidats dans `.pb`, `.mmp`, `.dam`, `.swl` et `backup_data*`.
- Décodage protobuf brut expérimental sur les `.pb`.
- Manifest local `matterport_local_manifest.json` pour alimenter un viewer 360 local.

## Données encore manquantes pour un vrai dollhouse local

- Schéma officiel des protobuf Matterport ou mapping stable des champs.
- Association fiable scan node -> images -> pose caméra.
- Orientation exacte des faces cube et convention d’axes Matterport.
- Images de profondeur validées et leur calibration.
- Intrinsics caméra, extrinsics, échelles et repères par étage.
- Mesh reconstruit ou règles de génération point cloud/mesh depuis depth + poses.
- Texturing et fusion multi-vues robustes.

## MVP recommandé

Le meilleur MVP est une visite locale Matterport-like partielle :

- afficher les panoramas 2:1 détectés ;
- afficher les groupes de 6 faces cube candidats quand aucun panorama 2:1 n’existe ;
- proposer navigation précédent/suivant et liste latérale des vues ;
- afficher un plan 2D seulement si des scan points fiables sont récupérés ;
- exposer le rapport d’audit pour comprendre les limites du backup.

Ce MVP ne prétend pas reproduire le dollhouse Matterport complet. Il transforme ce qui est lisible localement en expérience utile.

## Étapes futures expérimentales

1. Stabiliser le décodage `.pb` par corpus de plusieurs backups.
2. Identifier les champs de pose, étage, scan node et liens vers images.
3. Valider la présence et le format des données de profondeur.
4. Générer un point cloud par panorama/depth/pose.
5. Fusionner les points, filtrer le bruit, reconstruire un mesh.
6. Texturer le mesh ou conserver un viewer hybride mesh + panoramas.

## Difficulté estimée

- Viewer 360 local : faible à moyenne, déjà faisable si images exploitables.
- Association automatique image/pose : moyenne à élevée selon stabilité des protobuf.
- Reconstruction point cloud : élevée.
- Dollhouse local comparable Matterport : très élevée sans documentation du format.
