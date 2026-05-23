# Audit qualite scan 3D

## Contexte et perimetre

Objectif de cet audit : ameliorer la qualite des scans 3D pour des maisons, appartements et pieces immobilieres, sans connecter l'application au site web et sans upload automatique.

Le projet actuel repose sur :

- capture ARCore / Huawei AR Engine
- reconstruction volumique via Tango 3DR
- texturing via Tango 3DR + post-traitement maison
- export principal en `OBJ + MTL + textures`
- export secondaire en `PLY` pour point cloud / debug

Le coeur utile du projet se trouve surtout dans :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/AbstractActivity.java`
- `scanner/app/src/main/jni/app.cc`
- `common/arcore/arcore.cc`
- `common/thread/reconstr.cc`
- `common/tango/scan.cc`
- `common/tango/retango.cc`
- `common/tango/texturize.cc`
- `common/data/file3d.cc`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java`

## Comment fonctionne actuellement le scan

## Vue d'ensemble

Le pipeline actuel est le suivant :

1. L'application lit les preferences de scan dans `Main.bindAR()`.
2. Elle initialise un service ARCore / Huawei et un contexte de reconstruction Tango 3DR.
3. A chaque frame :
   - ARCore met a jour la pose camera
   - l'application recupere une image camera
   - l'application derive un pseudo nuage de points depuis la profondeur
   - ce nuage est fusionne dans Tango 3DR
4. Tango 3DR reconstruit des segments de mesh par blocs de grille.
5. Les segments sont fusionnes pour l'affichage temps reel.
6. Lors de la sauvegarde, le mesh est exporte brut en `OBJ`.
7. Lors du post-traitement, un pipeline de texturing reconstruit des textures a partir des images sauvegardees.

## Capture des donnees 3D

La capture 3D est pilotee par :

- `Main.bindAR()` pour les preferences utilisateur
- `App::OnARServiceConnected()` pour initialiser AR + reconstruction
- `ARCore::Process()` pour actualiser tracking, vue et projection
- `ARCore::GetPointCloud()` / `UpdateFeaturePoints()` pour convertir la profondeur en points utilisables

Points importants observes :

- Le mode Google sans capteur profondeur dedie degrade deja la resolution interne : `mRes *= 1.5f`.
- Le mode Huawei SFM double encore la resolution voxel effective : `res *= 2.0f`.
- La profondeur peut provenir soit de `RAW_DEPTH_ONLY`, soit de `ALWAYS_ENABLED` selon le telephone.
- Le nuage de points n'est pas un vrai nuage dense natif persistant : il est regenere depuis la profondeur a chaque frame puis reintegre.
- La capture est refusee quand l'ecart de pose depasse un seuil (`GetPoseDiff() < 25`).

En pratique, la qualite finale depend deja fortement :

- du type de profondeur disponible sur le telephone
- de la stabilite du tracking
- de la vitesse de mouvement
- du niveau de lumiere
- de la resolution voxel choisie

## Generation du mesh

Le mesh est genere principalement dans :

- `common/thread/reconstr.cc`
- `common/tango/scan.cc`
- `common/tango/retango.cc`

Pipeline detaille :

1. `ProcessReconstruction()` pousse les points dans `Retango::ADD(...)`.
2. `Retango::PCL()` convertit les points au format `Tango3DR_PointCloud`.
3. `TangoScan::Update()` appelle `Tango3DR_updateFromPointCloud(...)`.
4. Tango 3DR renvoie les cellules de grille modifiees.
5. Chaque segment de mesh est extrait avec `Tango3DR_extractMeshSegment(...)`.
6. `TangoScan::Merge()` remplace les anciens segments par les nouveaux.

Le mesh temps reel depend donc d'une reconstruction volumique voxelisee. Cela explique plusieurs artefacts :

- facettes visibles quand la resolution voxel est trop grossiere
- perte des details fins sur meubles, chants, poignées, bords
- trous quand la profondeur manque ou quand certains voxels ne sont pas stabilises
- surfaces molles quand la fusion absorbe des mesures instables

## Comment les textures sont generees

Le pipeline texture repose sur :

- `common/tango/texturize.cc`
- `scanner/app/src/main/jni/app.cc`
- `common/postproc/texturize.cc`

Fonctionnement :

1. Pendant le scan, les images JPG, poses et timestamps sont stockes dans un dataset.
2. Au post-traitement, `App::Texturize()` recharge le mesh OBJ.
3. `TangoTexturize::CreateContext()` cree un contexte de texturing Tango 3DR.
4. Les frames sont appliquees au mesh avec `Tango3DR_updateTexture(...)`.
5. `Tango3DR_getTexturedMesh(...)` sort un mesh UV + textures.
6. L'OBJ est reecrit, puis reoriente selon le yaw stocke.

La qualite texture est actuellement limitee par :

- une resolution texture Java fixee a `2048`
- un nombre de textures borne par la RAM et la preference `pref_textures`
- une decimation texture / mesh via `mesh_simplification_factor`
- une selection d'images assez simple, meme si un mode deux passes existe
- aucun vrai score de nettete, blur, exposition ou angle de vue par image

## Ou la qualite est perdue

## 1. Perte de detail geometrique

Les pertes les plus nettes viennent de :

- `pref_resolution` : voxel de `0.01`, `0.02`, `0.04`, `0.08`
- degradation automatique sur appareils sans bonne depth
- sous-echantillonnage de la depth (`depthWidth / 240`)
- filtrage de bruit via `min_num_vertices`
- simplification du mesh pendant texturing

Consequence :

- murs et meubles paraissent simplifies
- petits objets se dissolvent
- chants et angles deviennent approximatifs

## 2. Facettes visibles

Les facettes sont surtout visibles parce que :

- le mesh est issu d'une grille volumique assez coarse
- l'export scan utilise `GenerateFaceNormals()`, donc des normales par face, pas de vraies normales lissees par sommet
- aucune phase robuste de recalcul des normales avec preservation des angles n'est visible dans l'export principal
- la simplification peut casser la regularite des transitions

Conclusion : une grande part de l'aspect "facette" vient autant des normales et de l'export que de la reconstruction brute.

## 3. Zones molles ou deformees

Causes probables identifiees :

- tracking degrade ou saut AR (`MT_JUMP`, `MT_LOST`)
- mouvement trop rapide
- profondeur instable
- lumiere faible ou scene peu texturee
- fusion de points bruites dans le volume
- remplissage de trous heuristique
- estimations geometriques ajoutees dans `Retango`

Les zones molles apparaissent surtout quand la profondeur et la pose ne sont pas assez coherentes pour soutenir une integration volumique propre.

## 4. Trous et fermetures bizarres

Le code contient plusieurs heuristiques de remplissage :

- remplissage de trous dans `ARCore::GetPointCloud()`
- generation de composantes et fermeture de bords dans `TangoScan`
- densification / murs / trous dans `Retango`

Ces heuristiques aident a fermer certains manques, mais elles peuvent aussi :

- inventer des surfaces
- lisser des ouvertures reelles
- deformer des angles
- rendre des meubles "gonfles"

## Pourquoi certaines surfaces deviennent molles ou deformees

Les raisons principales sont :

1. Fusion volumique a resolution trop basse.
2. Profondeur partiellement interpolatee ou completee.
3. Tracking corrige ou refuse de facon assez binaire.
4. Estimation de murs / trous via heuristiques 2D -> 3D.
5. Normales non reestimees proprement a l'export.
6. Decimation / texturing qui re-simplifie le mesh final.

Un point de vigilance particulier a ete trouve dans `common/arcore/arcore.cc` :

- le remplissage vertical de trou utilise une interpolation basee sur `x` au lieu de `y`
- cela ressemble fortement a un bug ou a minima a une source d'instabilite pour la profondeur reconstruite

C'est une amelioration "petite et sure" a tester rapidement.

## Parties du code qui controlent la qualite

## Resolution

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/AbstractActivity.java`
  - `getResolution()`
- `scanner/app/src/main/res/values/array.xml`
  - valeurs : `0.01`, `0.02`, `0.04`, `0.08`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
  - degradation automatique de `mRes` sur certains appareils
- `common/tango/scan.cc`
  - `Tango3DR_Config_setDouble(..., "resolution", res)`

## Filtrage / bruit

- `Main.bindAR()` lit `pref_noise`
- `scan.cc` mappe cela a `min_num_vertices`
- `arcore.cc` applique des seuils de confiance profondeur
- `retango.cc` ajoute ses propres filtres / estimations

## Lissage / reconstruction implicite

Il n'y a pas de vrai module de lissage de mesh explicite de haute qualite. Le "lissage" actuel vient surtout de :

- la voxelisation / fusion Tango 3DR
- la simplification pendant texturing
- certaines heuristiques de remplissage

Donc aujourd'hui, le projet lisse surtout "par perte d'information", pas par un algorithme de lissage geometrique controle.

## Simplification

- `pref_decimation` dans `settings.xml`
- `TangoTexturize::SetTextureParams()`
- `TangoTexturize::CreateContext()`
  - `mesh_simplification_factor`

Valeurs actuelles :

- `1`
- `10`
- `100`

Une simplification a `100` est clairement trop agressive pour un rendu immobilier propre.

## Export

- `App::Save()` pour OBJ brut
- `App::SaveWithTextures()` pour OBJ + textures
- `App::Extract()` pour floorplan / pointcloud
- `common/data/file3d.cc` pour ecriture `OBJ`, `PLY`, `PCL`
- `Exporter.java` pour deplacer les ressources exportees

## Formats actuellement disponibles

- `OBJ + MTL + textures`
- `PLY`
- `PCL`
- `dataset` interne

Absence importante :

- pas de `GLB`
- pas de `glTF`

## Ce qui limite actuellement la qualite

## Limitations structurelles

- Dependance forte a Tango 3DR pour la reconstruction et le texturing
- Reconstruction voxelisee plutot que surfacique adaptive
- Qualite profondeur heterogene selon les telephones
- Export principal avec normales de face seulement
- Pas de pipeline moderne de GLB / glTF
- Pas d'analyse qualite temps reel assez riche pour guider l'utilisateur

## Limitations de produit

- pas de "modes qualite" lisibles pour l'utilisateur
- pas de score de couverture
- pas d'indicateur de densite ou de zone manquante
- pas d'alerte explicite "avancez plus lentement" / "manque de lumiere"
- pas de vrai mode immobilier HD oriente qualite

## Ameliorations faciles

Ces ameliorations sont realistes sans refonte lourde :

1. Corriger les bugs et heuristiques evidentes dans `arcore.cc` sur l'interpolation profondeur.
2. Ajouter des profils de qualite :
   - Rapide
   - Normal
   - Haute qualite
   - Immobilier HD
3. Abaisser la simplification par defaut au post-traitement.
4. Ajouter des options d'export :
   - Web
   - Haute qualite
   - Archive
5. Recalculer des normales par sommet avec preservation des aretes au lieu de normales purement par face.
6. Afficher des warnings UX derives de l'etat existant :
   - tracking perdu
   - mouvement trop rapide
   - profondeur faible
   - zone a rescanner
7. Augmenter la resolution texture maximale selon l'appareil.
8. Mieux choisir les frames pour le texturing :
   - exclure les images floues
   - exclure les images trop obliques
   - exclure les images sous-exposees

## Ameliorations risquees

Ces ameliorations sont faisables mais peuvent casser la stabilite ou la performance :

1. Diminuer trop fortement la resolution voxel sur telephones moyens.
2. Ajouter un filtrage spatial / temporel maison trop agressif avant Tango 3DR.
3. Changer la logique de remplissage de trous dans `Retango`.
4. Modifier fortement la pose correction ORB.
5. Ajouter un lissage de mesh sans protection d'angles.

Le risque principal est de produire un mesh plus "propre visuellement" mais geometriquement faux.

## Ameliorations qui demandent une grosse refonte

1. Remplacer Tango 3DR par une pipeline TSDF / SDF moderne maison.
2. Refaire entierement la reconstruction avec un maillage adaptatif multi-resolution.
3. Introduire une vraie fusion profondeur probabiliste.
4. Passer a un pipeline GLB / glTF complet avec PBR.
5. Ajouter une carte de couverture 3D temps reel basee sur voxels / surfels.
6. Ajouter une vraie photogrammetrie hybride pour les textures et les details fins.

## Proposition de modes de qualite

Ces modes ne sont pas encore implementes comme produit final, mais ils sont directement compatibles avec l'architecture actuelle.

| Mode | Usage | Resolution voxel cible | Bruit | Limite distance | Textures | Decimation | Objectif |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rapide | scan brouillon / preview | `0.04` a `0.08` | fort | `2m` | `1x 1024/2048` | forte | vitesse et stabilite |
| Normal | usage courant | `0.02` a `0.04` | moyen | `4m` | `4x 2048` | faible | bon compromis |
| Haute qualite | interieur detaille | `0.02` | faible | `4m` a `7m` | `4x 2048/4096` | tres faible | nettete geometrique |
| Immobilier HD | piece complete propre | `0.01` a `0.02` | faible adapte | `7m+` selon appareil | `4 a 8 textures`, `4096` si RAM OK | quasi nulle | qualite avant vitesse |

## Plan d'amelioration progressif

## Phase 1 - Securiser les gains faciles

- corriger le point suspect d'interpolation verticale profondeur
- reduire les reglages destructeurs par defaut
- introduire des profils de qualite lisibles
- mieux cadrer l'export avec normales plus propres

## Phase 2 - Ameliorer la capture

- score tracking / depth / mouvement
- messages utilisateur plus explicites
- ralentissement conseille si pose instable
- detection faible lumiere / profondeur pauvre

## Phase 3 - Ameliorer la geometrie

- recalcul de normales par sommet avec angle threshold
- filtrage des outliers avant integration
- meilleure fusion temporelle
- remplissage de trous plus conservateur

## Phase 4 - Ameliorer les textures

- selection de frames plus stricte
- texture resolution adaptative
- exclusion du flou et des mauvaises expositions
- meilleur alignement texture / mesh

## Phase 5 - Export premium

- presets export Web / Haute qualite / Archive
- OBJ propre a court terme
- GLB en vraie cible moyen terme
- PLY garde pour debug et controle qualite

## Recommandation de priorite

Pour obtenir un vrai gain visible rapidement sur de l'immobilier, l'ordre le plus rentable est :

1. profils de qualite + meilleurs defaults
2. corrections profondeur / tracking / warnings
3. normales et export propre
4. texturing plus intelligent
5. refonte plus profonde seulement si necessaire

## Conclusion

Le projet est exploitable et sa base de scan est deja serieuse, mais la qualite est actuellement bridee par :

- une reconstruction voxelisee assez grossiere
- des heuristiques de profondeur et de remplissage agressives
- un export qui accentue les facettes
- un manque de guidage utilisateur pendant la capture
- un pipeline texture encore trop simple pour un rendu immobilier premium

La bonne strategie n'est pas de tout recrire d'un coup. Il faut d'abord extraire les gains "surs" sur la capture, les normales, l'export et les profils qualite, puis seulement envisager une refonte plus lourde de la reconstruction.

## PHASE 2 IMPLEMENTED CHANGES

## Fichiers modifies

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`
- `common/arcore/service.cc`
- `common/arcore/service.h`
- `common/data/mesh.cc`
- `common/data/mesh.h`
- `common/thread/reconstr.cc`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/QualityProfiles.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/Settings.java`
- `scanner/app/src/main/res/values/array.xml`
- `scanner/app/src/main/res/values/id.xml`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/xml/settings.xml`

## Parametres ajoutes

- `pref_scan_quality`
- `pref_export_quality`
- smoothing des normales export via angle de crete
- nouveaux messages internes :
  - `LOW_LIGHT`
  - `MOVE_SLOWLY`
  - `QUALITY_WARN`

## Comportement avant / apres

Avant :

- interpolation verticale profondeur potentiellement incoherente
- export scan surtout en normales de face
- viewer qui retransformait souvent un OBJ en rendu tres facette
- pas de profils qualite haut niveau
- messages qualite limites a tracking perdu / jump

Apres :

- correction de l'interpolation verticale de trous de profondeur
- normales exportees lissees avec preservation des angles selon preset
- rendu charge depuis OBJ moins facette
- profils `Fast`, `Normal`, `High quality`, `Real estate HD`
- presets export `Web quality`, `High quality`, `Archive quality`
- premiers signaux utilisateur pour lumiere, mouvement et tracking instable

## Risques

- lissage des normales trop doux sur certains petits objets si le seuil d'angle est mal adapte
- profil `Real estate HD` plus lourd en temps et en memoire
- message `LOW_LIGHT` seulement fiable sur backend ARCore Google
- lissage des normales n'ameliore pas la geometrie reelle, seulement sa lecture visuelle

## Tests a faire sur telephone

- comparer `Normal` vs `Real estate HD` dans une meme piece
- verifier l'apparition du message `Move slower for a cleaner scan`
- verifier le message faible lumiere sur un appareil ARCore recent
- comparer un export `Web quality` et `High quality`
- verifier que murs et angles restent droits dans Blender / MeshLab

## Impact attendu sur la qualite

- moins de facettes visibles
- surfaces plus propres visuellement
- warning plus tot quand le scan se degrade
- meilleure coherence entre qualite de scan et qualite d'export
- meilleur point de depart pour les phases suivantes sans refonte risquee

## PHASE 3 IMPLEMENTED CHANGES

## Fichiers modifies

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`
- `common/arcore/service.cc`
- `common/arcore/service.h`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/QualityProfiles.java`
- `scanner/app/src/main/res/values/strings.xml`

## Changements faits

- ajout d'un profil natif de filtrage profondeur aligne sur `Fast`, `Normal`, `High quality`, `Real estate HD`
- filtrage plus strict des profondeurs secondaires incoherentes
- limitation de la fermeture des trous aux petites zones plausibles
- desactivation des completions murales speculatives en profils stricts
- score interne de qualite profondeur utilise pour des warnings
- message `RESCAN_ZONE` pour les zones a refaire

## Impact attendu sur les zones molles

- moins de surfaces molles issues d'une depth contradictoire
- moins de murs localement deformes
- meilleur comportement dans les scenes immobilières a grands aplats

## Impact attendu sur les trous

- plus de trous conserves quand la donnee est mauvaise
- moins de trous remplis de facon bizarre
- reconstruction plus honnete geometriquement

## Impact attendu sur les details

- les details fiables sont mieux preserves
- les details douteux sont plus souvent rejetes au lieu d'etre lisses artificiellement

## Risques

- augmentation visible des trous dans les profils les plus stricts
- besoin de tests terrain pour affiner les seuils par appareil
- score qualite depth base sur heuristiques de couverture / rejet

## Comment desactiver ou ajuster

- utiliser `Normal` au lieu de `Real estate HD` si le filtrage parait trop dur
- utiliser `Fast` pour recuperer plus vite de la geometrie, au prix de plus d'approximations
- ajuster les multiplicateurs de seuils dans `common/arcore/arcore.cc`

## Tests recommandes

- mur blanc en lumiere bonne puis moyenne
- meuble avec angles nets
- balayage lent puis trop rapide
- comparaison `Normal` vs `Real estate HD`
- verification dans Blender / MeshLab des murs, trous, facettes et normales

## PHASE 4 IMPLEMENTED CHANGES

## Fichiers modifies

- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`

## Logique ajoutee

- arbitrage plus propre des warnings avec priorite
- temporisation pour eviter le spam des messages qualite
- signal simple de couverture base sur :
  - qualite profondeur
  - progression reelle du scan
  - stagnation de la capture
- messages supplementaires :
  - `COVERAGE_MEDIUM`
  - `COVERAGE_LOW`
- `RESCAN_ZONE` rendu plus prioritaire et plus clair

## Impact attendu

- messages plus compréhensibles pendant le scan
- moins de spam
- meilleure identification des zones a revisiter
- comportement plus utile du mode `Real estate HD`

## Risques

- la couverture reste un signal heuristique, pas une vraie carte 3D
- certains telephones peuvent donner des warnings plus souvent que d'autres
- un seuil trop strict peut sur-signaler les zones a rescanner

## Parametres a ajuster apres tests

- delai avant `RESCAN_ZONE`
- seuils `COVERAGE_LOW` / `COVERAGE_MEDIUM`
- severite du mode `Real estate HD`
- duree de maintien des messages

## Ce qu'il reste a faire

- valider ces seuils sur vrai telephone
- eventuellement ajouter une visualisation de couverture plus tard
- corriger definitivement la build TLS locale pour une validation complete
