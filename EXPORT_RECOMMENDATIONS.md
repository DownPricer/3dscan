# Recommandations export

## Objectif

Produire des exports propres, reutilisables facilement dans d'autres outils, avec un bon compromis entre qualite, poids et compatibilite.

Le projet actuel exporte surtout :

- `OBJ + MTL + textures`
- `PLY`

Il n'exporte pas encore :

- `GLB`
- `glTF`

## Recommandation principale

## Format cible recommande

Priorite recommandee :

1. `GLB` si implemente
2. sinon `OBJ + MTL + textures`
3. `PLY` pour debug et controle qualite

## Pourquoi GLB est la meilleure cible

Avantages :

- un seul fichier
- transport plus simple
- textures integrees
- bonnes metadonnees
- interop moderne
- plus simple a ouvrir dans beaucoup de viewers et moteurs

Limitations actuelles :

- aucun pipeline `GLB` n'existe dans le projet
- il faut ajouter un exporteur glTF / GLB

## Pourquoi OBJ reste le meilleur choix court terme

Avantages :

- deja supporte
- simple a debugger
- supporte par la plupart des outils 3D
- pipeline existant pour textures

Inconvenients :

- plusieurs fichiers
- plus fragile en deplacement
- normals / UV / textures plus faciles a casser
- moins pratique pour un usage produit moderne

## Pourquoi garder PLY

`PLY` doit rester disponible pour :

- debug geometrie
- comparaison avant / apres filtrage
- analyse point cloud
- inspection technique sans materiaux

Il ne doit pas etre le format utilisateur principal pour l'immobilier.

## Etat actuel du projet

## Formats identifies

- `OBJ`
- `PLY`
- `PCL`
- `dataset` interne

## Fichiers principaux

- `scanner/app/src/main/jni/app.cc`
- `common/data/file3d.cc`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java`

## Points a surveiller

- `App::Save()` utilise `GenerateFaceNormals()`
- `App::Texturize()` reecrit l'orientation du mesh exporte
- `Exporter.java` deplace les ressources `OBJ/MTL/textures`

## Recommandations pour un export propre

## 1. Geometrie

L'export final doit :

- etre centre proprement
- conserver une echelle coherente en metres
- garder une orientation stable
- eviter la sur-simplification
- avoir des normales propres

## 2. Normales

Recommandation :

- remplacer les normales de face seules par des normales par sommet
- lisser les normales seulement entre faces coplanaires ou quasi coplanaires
- proteger les angles saillants

Objectif :

- reduire l'aspect facette
- garder des angles nets sur murs, portes, meubles

## 3. Textures

L'export texturé doit :

- inclure toutes les textures utiles
- garder des noms de fichiers stables
- verifier les liens `map_Kd`
- limiter le nombre de textures inutiles

Recommandation :

- `2048` pour export standard
- `4096` pour export haute qualite / archive si memoire OK

## 4. Poids fichier

Il faut eviter les exports inutilement lourds.

Strategie :

- pas de decimation forte par defaut
- decimation differenciee selon preset export
- compresser / simplifier raisonnablement pour le web
- garder plus de detail pour archive

## Presets d'export recommandes

## Qualite web

But :

- partage rapide
- affichage viewer leger

Reglages recommandes :

- simplification moderee
- textures `1024` ou `2048`
- normales propres
- suppression des petits artefacts isoles

Format recommande :

- `GLB` si disponible
- sinon `OBJ + MTL + textures`

## Qualite haute

But :

- reutilisation dans d'autres logiciels 3D
- rendu propre

Reglages recommandes :

- simplification faible
- textures `2048`
- normales preservees
- conservation des details importants

Format recommande :

- `GLB`
- sinon `OBJ + MTL + textures`

## Qualite archive

But :

- conservation maximale
- post-traitements futurs

Reglages recommandes :

- simplification minimale ou nulle
- textures `4096` si possible
- export geometrique le plus propre possible
- point cloud ou PLY de controle optionnel

Format recommande :

- `GLB` a terme
- sinon `OBJ + MTL + textures`
- `PLY` en export technique complementaire

## Recommandations techniques court terme

## A faire rapidement

1. Ajouter de vrais presets d'export.
2. Recalculer les normales correctement avant export.
3. Verifier que l'orientation finale est coherente pour tous les formats.
4. Exposer un choix `Web / Haute / Archive`.
5. Mieux gerer la taille texture selon RAM et preset.

## A faire ensuite

1. Ajouter `GLB`.
2. Integrer textures et mesh dans un package unique.
3. Ajouter un controle de poids estime avant export.
4. Ajouter un export "debug" geometrique sans texture.

## Strategie GLB recommandee

## Approche minimale

Conserver la pipeline actuelle :

- reconstruction -> OBJ interne
- texturing -> OBJ final

Puis ajouter une conversion interne :

- `OBJ + MTL + textures -> GLB`

Avantage :

- faible impact sur le coeur scan

Inconvenient :

- double pipeline temporaire

## Approche propre moyen terme

Exporter directement un maillage final avec :

- positions
- normales
- UV
- textures
- materiaux

vers `glTF/GLB`.

Avantage :

- pipeline moderne

Inconvenient :

- plus de travail

## Recommandation finale

Pour ce projet, la strategie la plus pragmatique est :

1. fiabiliser `OBJ + MTL + textures`
2. ajouter presets export
3. corriger les normales et la proprete du mesh exporte
4. introduire `GLB` ensuite comme format premium

En resume :

- `GLB` = meilleure cible produit
- `OBJ` = meilleure base court terme
- `PLY` = meilleur format debug

## PHASE 2 IMPLEMENTED CHANGES

## Fichiers modifies

- `common/data/mesh.cc`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/QualityProfiles.java`

## Parametres ajoutes

- preset export `Web quality`
- preset export `High quality`
- preset export `Archive quality`
- smoothing de normales avec angle de crete par preset

## Comportement avant / apres

Avant :

- export scan en normales de face
- rendu souvent tres facette au rechargement
- pas de preset export lisible

Apres :

- recalcul de normales plus propre avec preservation relative des aretes
- smoothing plus fort pour web, plus conservateur pour archive
- presets export relies a la simplification et a la resolution texture

## Risques

- lissage de normales trop visible sur certaines petites pieces tres anguleuses
- `Archive quality` plus lourd en taille et RAM
- pas de `GLB` natif implemente a ce stade

## Tests a faire sur telephone

- exporter un meme scan en `Web`, `High`, `Archive`
- ouvrir les 3 versions dans Blender / MeshLab
- verifier que les textures restent correctement liees
- verifier que les angles de murs restent propres

## Impact attendu sur la qualite

- moins d'effet facette
- OBJ plus propre a reutiliser
- meilleur preset `High quality` pour visite immobiliere
- PLY toujours conserve pour debug

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

## Changements faits

- export toujours base sur `OBJ + MTL + textures`, sans ajout d'upload ni de web
- profils scan plus conservateurs pour limiter la geometrie molle avant export
- score profondeur utilise pour avertir quand une zone doit etre rescannée
- pas de `GLB` implemente, mais la base reste preparee a un export futur plus propre

## Impact attendu sur les zones molles

- moins de geometrie douteuse qui passe jusqu'a l'export
- export plus honnete, avec moins de surfaces artificiellement remplies

## Impact attendu sur les trous

- plus de trous visibles quand la data est mauvaise
- moins de trous "rebouches" de facon peu credible

## Impact attendu sur les details

- meilleurs details reels
- moins de pseudo-details nes d'une completion agressive

## Risques

- certains scans peuvent sembler plus incomplets
- le poids d'un export `Archive quality` peut rester eleve

## Comment desactiver ou ajuster

- choisir `Normal` ou `Fast` si le scan devient trop conservateur
- choisir `High quality` plutot que `Archive quality` pour un meilleur compromis
- ajuster les seuils de filtrage dans `common/arcore/arcore.cc`

## Tests recommandes

- comparer exports `High quality` et `Archive quality`
- verifier normals, facettes, trous et deformation dans Blender / MeshLab
- verifier poids fichier et nombre de triangles

## PHASE 4 IMPLEMENTED CHANGES

## Fichiers modifies

- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`

## Logique ajoutee

- meilleure guidance de rescan avant export
- couverture faible et zones a revisiter mieux signalees
- priorite renforcee de `RESCAN_ZONE` pour limiter les exports de zones molles

## Impact attendu

- scans plus fiables avant export
- moins de geometrie douteuse exportee
- meilleure comprehension utilisateur avant de terminer le scan

## Risques

- plus de reprises de scan necessaires
- si les seuils sont trop stricts, workflow plus lent

## Parametres a ajuster apres tests

- agressivite des warnings dans `Real estate HD`
- seuils de couverture faible

## Ce qu'il reste a faire

- validation terrain avant de toucher au pipeline export plus profond
- `GLB` natif plus tard seulement
