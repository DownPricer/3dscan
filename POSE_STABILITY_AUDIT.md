# POSE STABILITY AUDIT

## Objectif

Identifier ou la pose ARCore est lue, comment elle pilote l'integration depth/reconstruction, et quels garde-fous existent ou manquaient contre les sauts de pose.

## Pipeline audite

### 1. Ou la pose ARCore est recuperee

- `common/arcore/arcore.cc`
  - `ARCore::Process()`
  - lecture de la camera ARCore via `ArFrame_acquireCamera`
  - lecture de la vue via `ArCamera_getViewMatrix`
  - lecture de la projection via `ArCamera_getProjectionMatrix`
  - lecture de l'etat de tracking via `ArCamera_getTrackingState`
  - lecture de `TrackingFailureReason` quand ARCore est en pause

- `common/arcore/service.cc`
  - `ARCoreService::Process()`
  - derive la pose camera applicative via `GetPose()[COLOR_CAMERA]`
  - calcule maintenant les metriques de stabilite:
    - `translationDelta`
    - `rotationDeltaDeg`
    - `cameraSpeed`
    - `angularSpeed`
    - deltas depuis la derniere pose acceptee

### 2. Ou la pose est utilisee pour integrer la profondeur

- `scanner/app/src/main/jni/app.cc`
  - `App::OnDrawFrame()`
  - met a jour `reconstruction.frame_pose`, `frame_viewmat`, `frame_image`
  - appelle `ar->GetPointCloud(maxDiff)` avant de lancer l'integration

- `common/thread/reconstr.cc`
  - `ProcessReconstruction()`
  - injecte les points dans `depth.ADD(...)`
  - met a jour Tango 3DR via `scan.Update(...)`
  - confirme ensuite l'image et la pose dans le dataset via `texturize.Add(...)`

Conclusion:
une frame douteuse devait etre arretee avant `ProcessReconstruction()`. Le meilleur point de garde reste `ARCoreService::GetPointCloud()`.

## Etat avant correction

### Le code verifiait-il seulement `TrackingState.TRACKING` ?

Non, mais presque.

Avant correction il y avait deja:

- controle `trackingState == TRACKING`
- controle simple de `poseDiff < maxDiff`
- delai de reprise de tracking seulement en profils stricts
- limites de vitesse surtout en `High` et `Real estate HD`

En revanche il manquait:

- une comparaison explicite avec la derniere pose acceptee
- une vraie detection conservative de saut translation/rotation selon le temps ecoule
- une stabilisation multi-frames apres reprise ou pose instable
- une verification de coherence depth/camera timestamp
- une memoire locale de la profondeur acceptee pour bloquer les incoherences brutales

### Le code utilisait-il `TrackingFailureReason` ?

Oui.

- lecture dans `common/arcore/arcore.cc`
- mapping utilisateur dans `common/arcore/service.cc`
- messages existants:
  - faible lumiere
  - mouvement excessif
  - manque de details

Limite avant correction:
`TrackingFailureReason` alimentait surtout le message, pas une vraie temporisation conservative apres reprise.

### Le code detectait-il les sauts de pose ?

Partiellement.

Il existait:

- `poseDiff`
- quelques limites de vitesse selon le profil
- un arret plus brutal cote `app.cc` avec `MT_JUMP`

Mais il manquait:

- detection par translation/rotation impossible par rapport au temps
- comparaison avec la derniere pose acceptee
- reprise graduelle sans couper brutalement la capture

### Le code comparait-il la pose actuelle a la pose precedente ?

Oui, seulement de maniere partielle.

- comparaison a la pose precedente pour `cameraSpeed`, `angularSpeed`, `last_diff`
- pas de comparaison robuste a la derniere pose acceptee

### Le code temporisait-il apres tracking perdu puis retrouve ?

Oui, mais uniquement de facon limitee.

- present surtout pour `High` et `Real estate HD`
- absent ou trop permissif en `Normal`
- ne couvrait pas bien les cas "tracking revenu mais encore instable"

### Le code pouvait-il integrer une frame avec une pose aberrante ?

Oui.

Cas identifies avant correction:

- tracking revenu tres recemment mais frame quand meme integree en `Normal`
- gros decalage compatible avec `TRACKING` mais incoherent avec le temps ecoule
- profondeur brusquement incoherente avec la scene recente
- saut lateral qui pouvait etre accepte si `poseDiff` global ne coupait pas assez tot

## Corrections implementees

### 1. Metriques de pose ajoutees

Dans `common/arcore/service.cc`, l'application loggue maintenant:

- `[POSE] tracking=...`
- `[POSE] failureReason=...`
- `[POSE] translationDelta=...`
- `[POSE] rotationDeltaDeg=...`
- `[POSE] translationFromAccepted=...`
- `[POSE] rotationFromAcceptedDeg=...`
- `[POSE] cameraSpeed=...`
- `[POSE] angularSpeed=...`
- `[POSE] poseJumpDetected=true/false`
- `[POSE] trackingRecentlyRecovered=true/false`
- `[POSE] depthTimestampDeltaMs=...`
- `[POSE] depthPoseMismatch=true/false`
- `[POSE] frameIntegrated=true/false`
- `[POSE] rejectReason=...`

### 2. Detection conservative des sauts de pose

La frame est maintenant rejetee si la pose courante est impossible vis-a-vis de la derniere pose acceptee:

- translation trop grande
- rotation trop grande
- vitesse lineaire impossible pour le temps ecoule
- vitesse angulaire impossible pour le temps ecoule

Le mode `Normal` reste volontairement permissif:

- il rejette surtout les gros sauts evidents
- il tolere encore les petites imperfections

`High` et `Real estate HD` sont plus stricts.

### 3. Temporisation apres reprise

Apres:

- tracking perdu
- `TrackingFailureReason != NONE`
- pose instable
- depth/pose mismatch

la capture n'integre plus immediatement.

Le pipeline attend maintenant:

- un court delai dependant du profil
- plusieurs frames stables d'affilee

Messages associes:

- `TRACKING_RECOVERING`
- `TRACKING_UNSTABLE`
- `MOVE_SLOWLY`
- `POSE_JUMP`

### 4. Verification depth/image legere

Dans `common/arcore/arcore.cc`, des metriques supplementaires sont exposees:

- timestamp frame camera
- timestamp depth
- delta timestamp depth/camera
- distance moyenne des points de la frame
- ratio d'instabilite RawDepth vs depth secondaire

Dans `common/arcore/service.cc`, une frame peut etre rejetee si:

- depth timestamp trop eloigne de la frame camera
- la profondeur moyenne saute brutalement alors que la pose a peu bouge
- Raw Depth et depth secondaire sont trop incoherents

But:
eviter d'integrer immediatement une frame qui "scanne derriere le mur".

### 5. Anti-corruption du modele

Le garde-fou principal reste:

- si la frame est suspecte, `GetPointCloud()` retourne vide
- `ProcessReconstruction()` ne se lance pas pour cette frame
- le mesh existant n'est donc pas modifie

C'est volontairement minimal et peu intrusif:

- pas de grosse feature
- pas de rework du pipeline texture/READY
- pas de Raw Depth rendu obligatoire

### 6. Changement important cote UI

Dans `scanner/app/src/main/jni/app.cc`:

- le saut de pose n'entraine plus automatiquement l'arret brutal du scan
- la camera continue a tourner
- la frame est simplement refusee
- un message leger `POSE_JUMP` est affiche

But produit:
ne pas casser la capture quand ARCore saute une fois, tout en empechant l'integration d'une frame corrompue.

## Fichiers modifies pour cette phase

- `common/arcore/service.h`
- `common/arcore/service.cc`
- `common/arcore/arcore.h`
- `common/arcore/arcore.cc`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`

## Risques residuels

- les seuils restent heuristiques et devront etre verifies sur telephone
- les scenes tres pauvres en texture peuvent encore produire des warnings frequents
- `Normal` est moins strict par design, donc il pourra laisser passer de petites imperfections
- la protection "derriere le mur" reste volontairement legere et conservative, sans rearchitecture lourde du moteur de reconstruction

## Conclusion

Avant cette phase, la capture pouvait encore integrer des frames avec pose `TRACKING` mais localement peu fiable.

Apres cette phase:

- la pose est evaluee avec memoire
- la reprise est temporisee
- les gros sauts evidents sont bloques
- les incoherences depth/pose les plus flagrantes sont rejetees
- `Normal` reste utilisable grace a des seuils souples et au mode compatibilite existant
