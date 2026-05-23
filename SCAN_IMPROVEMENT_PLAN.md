# Plan d'amelioration scan 3D

## Objectif

Ameliorer progressivement la qualite des scans 3D pour l'immobilier, sans reecrire tout le projet d'un coup et sans toucher au site web ni a l'upload.

Le plan ci-dessous suit cet ordre :

1. audit du code
2. identification des parametres qualite
3. plan d'amelioration
4. petites ameliorations sures
5. ajout de modes de qualite
6. amelioration export
7. documentation

## Resultat cible

On vise un scan plus :

- fin
- net
- stable
- moins facette
- mieux texture
- plus propre a exporter

pour des maisons, appartements, pieces et volumes interieurs.

## Phase 0 - Base documentaire

Livrables :

- `SCAN_QUALITY_AUDIT.md`
- `SCAN_IMPROVEMENT_PLAN.md`
- `EXPORT_RECOMMENDATIONS.md`
- `TESTING_SCAN_QUALITY.md`

But :

- figer l'etat actuel
- identifier les limites reelles
- eviter les changements a l'aveugle

## Phase 1 - Petites ameliorations sures

## 1.1 Corriger les points suspects de profondeur

Priorite haute :

- corriger l'interpolation verticale douteuse dans `common/arcore/arcore.cc`
- verifier les conditions de confiance depth
- rendre les heuristiques de comblement plus conservatrices

Impact attendu :

- moins de surfaces molles
- moins d'artefacts locaux
- profondeur plus stable

Risque :

- faible

## 1.2 Assainir les reglages par defaut

Actions :

- reduire l'usage de simplifications trop destructrices
- verifier que les valeurs par defaut ne favorisent pas trop la vitesse
- reserver les reglages aggressifs au mode Rapide

Impact attendu :

- meilleure qualite "out of the box"

Risque :

- faible a moyen sur les telephones lents

## 1.3 Ameliorer les normales a l'export

Actions :

- remplacer les normales de face seules par un recalcul par sommet
- lisser les normales avec preservation des angles marquants
- conserver des aretes propres sur murs et meubles

Impact attendu :

- forte reduction de l'aspect facette
- rendu plus propre sans lisser la geometrie en exces

Risque :

- faible si le seuil d'angle est bien choisi

## Phase 2 - Ajouter des modes de qualite

## Profils proposes

### Rapide

Usage :

- preview
- appareil moyen
- relevé rapide

Priorites :

- vitesse
- stabilite
- faible memoire

Reglage suggere :

- resolution voxel : `0.04` ou `0.08`
- bruit : moyen/fort
- limite distance : `2m`
- textures : `1`
- texture size : `1024` ou `2048`
- decimation : forte

### Normal

Usage :

- scan general

Priorites :

- compromis vitesse / qualite

Reglage suggere :

- resolution voxel : `0.02` ou `0.04`
- bruit : moyen
- limite distance : `4m`
- textures : `4`
- texture size : `2048`
- decimation : faible

### Haute qualite

Usage :

- petits interieurs
- mobiliers et details visibles

Priorites :

- meilleure geometrie
- meilleure texture

Reglage suggere :

- resolution voxel : `0.02`
- bruit : faible
- limite distance : `4m` a `7m`
- textures : `4`
- texture size : `2048` a `4096`
- decimation : minimale

### Immobilier HD

Usage :

- appartement / maison / piece complete
- qualite privilegiee a la vitesse

Priorites :

- finesse
- stabilite
- proprete export

Reglage suggere :

- resolution voxel : `0.01` ou `0.02`
- bruit : faible adapte
- limite distance : `7m+` si l'appareil suit
- textures : `4` a `8`
- texture size : `4096` si memoire suffisante
- decimation : quasi nulle
- meilleure selection d'images
- warnings qualite plus stricts

## Implementation recommandee

Technique :

- introduire une enum / constante de profil de qualite cote Java
- mapper chaque profil vers :
  - `pref_resolution`
  - `pref_noise`
  - `pref_limit`
  - `pref_decimation`
  - `pref_textures`
  - `texture_res`
- autoriser une adaptation selon capacites du telephone

## Phase 3 - Indicateurs qualite temps reel

## Signaux deja disponibles

Le projet sait deja detecter :

- tracking perdu
- saut AR
- faible disponibilite memoire
- batterie faible

## Signaux a ajouter

1. Score tracking
2. Score profondeur utile
3. Score couverture
4. Score mouvement utilisateur
5. Score texture potentiel

## Messages UX a ajouter

- `Avancez plus lentement`
- `Manque de lumiere`
- `Tracking perdu`
- `Re-scanner cette zone`
- `Zone insuffisamment couverte`
- `Profondeur instable`

## UX cible

Ajouter dans l'ecran de scan :

- score qualite global
- indicateur de couverture de piece
- zones deja scannees
- zones manquantes
- bouton pause
- bouton reprendre
- bouton terminer le scan
- bouton previsualiser
- bouton exporter

## Phase 4 - Qualite geometrique

## 4.1 Densite et precision

Actions :

- mieux exploiter la depth des appareils recents
- limiter les degradations automatiques trop fortes
- augmenter la densite de points quand l'appareil le permet
- affiner les seuils de fusion

## 4.2 Filtrage

Actions :

- suppression des outliers
- filtrage temporel leger
- filtrage spatial local
- protection des details fins
- nettoyage des petits artefacts isoles

## 4.3 Trous et deformees

Actions :

- heuristiques de remplissage plus conservatrices
- ne pas fermer de trou si la geometrie est incertaine
- proteger les angles plans forts
- eviter d'inventer des murs ou des liaisons non observees

## Phase 5 - Textures

## 5.1 Selection de frames

Ajouter un score par image base sur :

- nettete
- mouvement
- exposition
- angle de vue
- redondance

## 5.2 Resolution texture adaptative

Actions :

- `2048` par defaut
- `4096` pour Haute qualite / Immobilier HD si memoire suffisante
- fallback automatique si appareil trop limite

## 5.3 Alignement et coherence visuelle

Actions :

- exclure les images floues
- exclure les images trop sombres
- privilegier les images plus frontales
- equilibrer l'utilisation des textures

## Phase 6 - Export propre

## Court terme

- OBJ + MTL + textures propre
- normales corrigees
- orientation propre
- echelle coherente
- options Web / Haute qualite / Archive

## Moyen terme

- export `GLB`
- encapsulation textures + maillage dans un seul fichier
- meilleure interop avec viewers et moteurs 3D

## PLY

Conserver `PLY` pour :

- debug
- controle qualite
- inspection point cloud

## Phase 7 - Compatibilite telephones recents

Actions :

- detecter Depth API disponible
- detecter RAW depth / ToF
- detecter RAM et profils camera
- choisir automatiquement un mode de qualite compatible
- appliquer des fallbacks propres

Strategie :

- si depth haut niveau dispo : autoriser Haute qualite / Immobilier HD
- sinon : rester sur Normal / Rapide avec messages clairs

## Ordre d'implementation recommande

## Sprint A

- corriger le bug depth suspect
- revoir les defaults
- introduire les profils de qualite

## Sprint B

- recalcul de normales export
- presets export
- documentation utilisateur

## Sprint C

- score qualite temps reel
- warnings utilisateur
- filtres profondeur plus stables

## Sprint D

- meilleure selection de frames texture
- texture size adaptative
- nettoyage artefacts

## Sprint E

- export GLB
- couverture de scan
- optimisations avancees

## Critere de succes

Une amelioration est validee si elle reduit au moins l'un de ces problemes sans introduire de regressions majeures :

- facettes visibles
- murs mous
- trous
- deformees
- textures floues
- fichiers exportes trop lourds ou peu utilisables

## Ce qu'il ne faut pas faire

- ne pas lisser aveuglement tout le mesh
- ne pas sur-decimer par defaut
- ne pas cacher les problemes de tracking avec du lissage excessif
- ne pas fermer tous les trous automatiquement
- ne pas viser la "beaute" au prix d'une fausse geometrie

## Priorite produit

Pour l'immobilier, le plus rentable est :

1. geometrie stable
2. angles propres
3. trous limites
4. textures nettes
5. export facile a reutiliser

Autrement dit : un scan un peu plus lent mais propre vaut mieux qu'un scan rapide et deformé.

## PHASE 2 IMPLEMENTED CHANGES

## Fichiers modifies

- `common/arcore/arcore.cc`
- `common/data/mesh.cc`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/QualityProfiles.java`
- `scanner/app/src/main/res/xml/settings.xml`
- fichiers de ressources associes (`strings`, `arrays`, `id`)

## Parametres ajoutes

- profil scan :
  - `Fast`
  - `Normal`
  - `High quality`
  - `Real estate HD`
- preset export :
  - `Web quality`
  - `High quality`
  - `Archive quality`
- smoothing de normales base sur un angle de crete

## Comportement avant / apres

Avant :

- les reglages qualite etaient eclates
- aucun preset haut niveau n'orchestrait capture + export
- l'effet facette etait renforce a l'export / rechargement

Apres :

- un preset scan pilote resolution, filtrage, distance et capture photo
- un preset export pilote simplification, textures et normales
- l'export OBJ est nettoye visuellement sans lisser aveuglement la geometrie

## Risques

- `Real estate HD` peut etre trop lourd pour certains telephones
- `Archive quality` augmente taille et temps de traitement
- le lissage des normales ne corrige pas les trous ou les erreurs de tracking

## Tests a faire sur telephone

- tester chaque profil sur la meme scene
- verifier temperature / memoire sur `High quality` et `Real estate HD`
- comparer viewer interne et Blender sur le meme OBJ
- verifier que les warnings qualite apparaissent au bon moment

## Impact attendu sur la qualite

- base produit plus claire pour l'utilisateur
- meilleur rendu de surface
- meilleurs exports pour une visite immobiliere
- premiere reduction concrete des facettes visibles

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

- adaptation du filtrage profondeur selon les profils
- politique plus conservatrice sur les trous et la depth instable
- ajout d'un score qualite profondeur et d'un hint `RESCAN_ZONE`
- build mieux analysee : wrapper OK, JVM 17 OK, blocage TLS repository documente

## Impact attendu sur les zones molles

- baisse des reconstructions artificielles molles
- baisse des surfaces bombees issues de profondeur contradictoire
- meilleure stabilite des murs en profils qualite

## Impact attendu sur les trous

- plus de trous assumes en mode qualite
- moins de comblement speculatif

## Impact attendu sur les details

- details stables mieux conserves
- details non fiables plus souvent rejetes que lisses

## Risques

- rendu parfois plus incomplet en `Real estate HD`
- calibration des seuils a affiner selon appareil

## Comment desactiver ou ajuster

- repasser en `Normal` si `Real estate HD` devient trop severement conservateur
- editer les seuils dans `common/arcore/arcore.cc`
- choisir `High quality` ou `Archive quality` selon le besoin export

## Tests recommandes

- mur blanc
- meuble a angles francs
- lumiere bonne puis moyenne
- vitesse lente puis rapide
- `Normal` vs `Real estate HD`
- `High quality` vs `Archive quality`

## PHASE 4 IMPLEMENTED CHANGES

## Fichiers modifies

- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`

## Logique ajoutee

- verification et stabilisation des warnings existants
- meilleure priorite de `RESCAN_ZONE`
- anti-spam des messages
- logique simple de couverture / stagnation
- mode `Real estate HD` plus prompt a demander de rescanner sans devenir constamment bruyant

## Impact attendu

- guidance plus utile pendant la capture
- meilleure comprehension des zones mal scannees
- meilleur compromis entre aide temps reel et sobriete UX

## Risques

- seuils encore a ajuster sur appareil reel
- couverture estimee de facon simple, non visuelle

## Parametres a ajuster apres tests

- priorite relative `LOW_LIGHT` / `MOVE_SLOWLY` / `RESCAN_ZONE`
- duree de maintien des messages
- seuils de stagnation
- seuils de couverture par profil

## Ce qu'il reste a faire

- validation terrain
- validation build complete
- si necessaire, ajout ulterieur d'une visualisation de couverture plus riche
