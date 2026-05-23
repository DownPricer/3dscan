# TESTING SCAN QUALITY

## Build validation status

Build Android debug validee localement avec :

- repertoire de build : `X:\scanner`
- commande : `gradlew.bat assembleDebug`
- resultat : `BUILD SUCCESSFUL`

Remarque :

- la build echoue depuis le chemin Windows long avec espaces pour une raison NDK de resolution `Android.mk`
- le chemin `X:\scanner` contourne ce probleme sur cette machine

## APKs de test

- source build : `X:\scanner\app\build\outputs\apk\debug\app-debug.apk`
- copie workflow/texture : `build-output/3DLiveScanner-workflow-texture-ux-debug.apk`
- copie capture quality : `build-output/3DLiveScanner-capture-quality-debug.apk`
- copie pose stability : `build-output/3DLiveScanner-pose-stability-debug.apk`
- copie export PC avant analyse : `build-output/3DLiveScanner-pc-export-before-analysis-debug.apk`

## Objectif

Verifier que le workflow Android post-scan est maintenant correct, que les textures sont reellement generees et que l'application ne montre plus READY tant que le modele n'est pas valide.

## WORKFLOW + TEXTURE TEST PLAN

### Preparation

1. installer l'APK debug
2. ouvrir Logcat :

```bash
adb logcat -s arcore_app:I
```

3. verifier que la version visible dans les reglages contient :
   - nom
   - version
   - build
   - mention `Debug texture workflow build`

### Test principal

1. scanner un objet colore
2. terminer le scan
3. verifier les etats affiches dans l'application :
   - `Preparation du scan`
   - `Analyse des images`
   - `Generation des textures`
   - `Validation du modele`
   - `Scan pret`
4. verifier que `Scan pret` n'apparait pas trop tot
5. verifier que le modele n'est pas blanc
6. verifier Logcat :
   - `[WORKFLOW]`
   - `[TEXTURE]`
7. tester retour arriere
8. tester `Nouveau scan`
9. tester `Normal`
10. tester `Real estate HD`

### Ce qu'il faut voir dans Logcat

Workflow :

- `[WORKFLOW] State: SCANNING`
- `[WORKFLOW] State: PROCESSING_GEOMETRY`
- `[WORKFLOW] State: ANALYZING_IMAGES`
- `[WORKFLOW] State: GENERATING_TEXTURES`
- `[WORKFLOW] State: VALIDATING_EXPORT`
- `[WORKFLOW] State: READY`

Texture :

- `[TEXTURE] Image frames available: X`
- `[TEXTURE] Selected frames for texturing: X`
- `[TEXTURE] Texture files generated: X`
- `[TEXTURE] OBJ has UV coordinates: yes`
- `[TEXTURE] MTL generated: yes`
- `[TEXTURE] Texture file exists: yes`

### Cas d'echec attendus

L'application doit afficher `ERROR` et ne pas afficher READY si l'un de ces cas arrive :

- `No camera images selected for texturing`
- `Texture generation failed`
- `Model exported without textures`
- `Texture files missing`
- `MTL file missing`
- `Model exported without UV coordinates`
- `Model exported without MTL reference`

### Verification fichiers export

Verifier dans le dossier export final :

- presence du `.obj`
- presence du `.mtl`
- presence d'au moins une texture image
- `.obj` contient `vt`
- `.obj` contient `mtllib`
- `.obj` contient `usemtl`
- `.mtl` contient `map_Kd`

### Verification viewer interne

1. a la fin du traitement, utiliser `Voir le modele`
2. verifier que le modele affiche les couleurs
3. verifier qu'on ne revient pas sur un ecran blanc ou bloque

### Verification viewer externe

Si possible :

1. ouvrir l'OBJ exporte dans Blender ou MeshLab
2. verifier que le MTL et les textures se chargent sans correction manuelle
3. verifier que le modele n'apparait pas blanc

## Tests prioritaires sur telephone

### Test A - Normal

- scan objet colore
- attendre toutes les etapes
- verifier que READY arrive seulement apres validation
- verifier que le modele n'est pas blanc

### Test B - Real estate HD

- refaire exactement la meme scene
- verifier la meme sequence d'etats
- comparer la qualite texture avec `Normal`

### Test C - Erreur exploitable

Si un cas de texture echoue :

- l'app doit afficher un message clair
- pas de READY
- si le traitement vient d'un dataset, `Reessayer le traitement` doit etre propose

## Criteres de succes

Le correctif est valide si :

1. l'analyse d'image est visible dans le workflow
2. la generation des textures est visible dans le workflow
3. la validation du modele est visible dans le workflow
4. READY n'apparait jamais avant validation texture
5. le modele final n'est plus blanc
6. les fichiers OBJ/MTL/textures sont coherents sur disque

## CAPTURE QUALITY TEST PLAN

### Objectif

Verifier que la capture integre moins de frames douteuses, derive moins, produit moins de carres noirs et garde intact le workflow texture/READY.

### Preparation

1. installer `build-output/3DLiveScanner-capture-quality-debug.apk`
2. ouvrir Logcat :

```bash
adb logcat -s arcore_app:I
```

3. verifier la presence des logs :
   - `[CAPTURE]`
   - `[WORKFLOW]`
   - `[TEXTURE]`

### Mesures a noter pour chaque test

- trous noirs
- carres noirs
- glissement gauche/droite
- tracking perdu
- warnings affiches
- texture finale
- temps de traitement
- qualite finale

### Test 1 - Objet colore en Normal

1. scanner lentement un objet colore
2. verifier que la capture reste stable
3. verifier qu'il y a peu de carres noirs
4. verifier les logs :
   - `captureQuality=GOOD` ou `MEDIUM`
   - `frameAccepted=true`

### Test 2 - Mur blanc

1. scanner un mur blanc ou peu texture
2. verifier que l'app ne "gonfle" pas artificiellement le mur
3. verifier qu'elle affiche plutot :
   - `Trop peu de profondeur fiable ici, repassez sur cette zone`
   - ou un warning tracking
4. verifier que les trous restent honnetes plutot que remplis n'importe comment

### Test 3 - Angle de piece

1. scanner un angle de piece avec mouvement lent
2. verifier que l'angle reste plus stable
3. comparer `Normal` puis `Real estate HD`
4. verifier que `Real estate HD` est plus strict sur les zones faibles

### Test 4 - Mouvement trop rapide

1. scanner volontairement trop vite
2. verifier l'affichage d'un warning type :
   - `Ralentissez pour obtenir un scan plus propre`
   - `Le tracking est instable, faites une courte pause puis reprenez lentement`
3. verifier dans Logcat :
   - `frameAccepted=false reason=camera_speed`
   - ou `frameAccepted=false reason=angular_speed`

### Test 5 - Faible lumiere

1. scanner une zone sombre
2. verifier la presence de `LOW_LIGHT`
3. verifier que la qualite capture baisse dans les logs
4. verifier que l'app n'invente pas des surfaces sales juste pour combler

### Test 6 - Normal vs Real estate HD

1. scanner la meme scene en `Normal`
2. rescanner la meme scene en `Real estate HD`
3. comparer :
   - quantite de trous
   - quantite de carres noirs
   - glissement lateral
   - qualite finale du modele
4. verifier que `Real estate HD` rejette plus souvent les frames faibles

### Logs attendus

- `[CAPTURE] tracking=TRACKING`
- `[CAPTURE] failureReason=...`
- `[CAPTURE] depthSupported=true/false`
- `[CAPTURE] rawDepthSupported=true/false`
- `[CAPTURE] confidenceAvailable=true/false`
- `[CAPTURE] validDepthRatio=...`
- `[CAPTURE] avgConfidence=...`
- `[CAPTURE] cameraSpeed=...`
- `[CAPTURE] angularSpeed=...`
- `[CAPTURE] frameAccepted=true/false reason=...`
- `[CAPTURE] blackHolesRatio=...`
- `[CAPTURE] captureQuality=GOOD/MEDIUM/LOW`
- `[POSE] tracking=TRACKING`
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

### Verification workflow texture apres capture

Apres les tests capture, verifier aussi :

1. que `Analyse des images` est toujours lancee
2. que `Generation des textures` fonctionne toujours
3. que `Validation du modele` reste avant `Scan pret`
4. que le modele final n'est pas blanc
5. que les logs `[WORKFLOW]` et `[TEXTURE]` sont toujours presents

## CAPTURE REGRESSION TEST PLAN

### Objectif

Verifier que le mode `Normal` scanne a nouveau correctement apres le rollback partiel du filtrage capture.

### Test prioritaire

1. installer `build-output/3DLiveScanner-capture-rollback-fix-debug.apk`
2. ouvrir l'application
3. choisir un objet simple a scanner en `Normal`
4. verifier que des frames sont acceptees
5. verifier qu'un modele commence a se reconstruire
6. verifier qu'il n'y a pas d'ecran noir vide
7. verifier Logcat :
   - `[CAPTURE] frameAccepted=true`
   - `[CAPTURE] acceptedFrames=...`
   - `[CAPTURE] usingClassicDepth=true`
   - `[CAPTURE] fallbackCompatibilityMode=true/false`

### Verification si la capture est difficile

Si le scan est dur :

1. continuer quelques secondes
2. verifier qu'un message de compatibilite peut apparaitre
3. verifier dans Logcat :
   - `consecutiveRejectedFrames=...`
   - `fallbackCompatibilityMode=true`

### Seulement apres validation du mode Normal

Reprendre les tests en `Real estate HD` :

1. verifier que le scan demarre bien
2. verifier qu'il n'est pas totalement bloque
3. verifier que Raw Depth peut etre utilise sans tuer toute la capture

## POSE STABILITY TEST PLAN

### Objectif

Verifier que les sauts de pose ARCore et les incoherences depth/pose ne corrompent plus le modele, sans rendre `Normal` inutilisable.

### Preparation

1. installer `build-output/3DLiveScanner-pose-stability-debug.apk`
2. ouvrir Logcat :

```bash
adb logcat -s arcore_app:I
```

3. verifier la presence des logs :
   - `[CAPTURE]`
   - `[POSE]`
   - `[PERF]`

### Mesures a noter

- glissement gauche/droite
- sauts visibles de la scene
- warnings affiches
- nombre de rejets consecutifs
- apparition de profondeur derriere un mur
- difference de comportement entre `Normal` et `Real estate HD`

### Test 1 - Normal reste utilisable

1. scanner une zone detaillee en `Normal`
2. verifier que le modele continue a se construire
3. verifier dans Logcat :
   - `[POSE] frameIntegrated=true`
   - `[CAPTURE] acceptedFrames=...`
4. verifier qu'on n'observe pas un blocage total du scan

### Test 2 - Saut de pose evident

1. faire un mouvement lateral rapide ou un demi-tour brusque
2. verifier que l'app garde la camera active
3. verifier que la frame suspecte n'est pas integree
4. verifier un message du type :
   - `La capture a saute, repassez lentement sur cette zone`
   - ou `Ralentissez pour obtenir un scan plus propre`
5. verifier dans Logcat :
   - `[POSE] poseJumpDetected=true`
   - `[POSE] frameIntegrated=false`
   - `[POSE] rejectReason=pose_jump_translation` ou `pose_jump_rotation`

### Test 3 - Reprise de tracking

1. provoquer une perte de tracking courte
2. attendre son retour
3. verifier le message de reprise
4. verifier que l'app n'integre pas immediatement
5. verifier dans Logcat :
   - `[POSE] trackingRecentlyRecovered=true`
   - `[POSE] frameIntegrated=false`
   - `[POSE] rejectReason=tracking_recovering`

### Test 4 - Zone pauvre en details

1. viser un mur blanc ou uniforme
2. verifier un warning utile plutot qu'une fausse geometrie
3. verifier un message du type :
   - `Trop peu de details, visez une zone plus texturee`
   - `Le tracking est instable...`

### Test 5 - Profondeur incoherente

1. scanner une surface plane puis repasser avec mouvement un peu trop rapide
2. verifier que les frames depth incoherentes sont rejetees
3. verifier dans Logcat :
   - `[POSE] depthTimestampDeltaMs=...`
   - `[POSE] depthPoseMismatch=true`
   - `[POSE] rejectReason=depth_timestamp_mismatch` ou `depth_history_mismatch` ou `depth_secondary_mismatch`

### Test 6 - Comparaison profils

1. scanner la meme scene en `Normal`
2. rescanner la meme scene en `Real estate HD`
3. verifier que :
   - `Normal` accepte encore des frames regulierement
   - `Real estate HD` rejette plus de frames douteuses
   - `Real estate HD` prefere des trous propres a une geometrie fausse

### Criteres de succes

1. les gros sauts ne sont pas integres
2. la reprise de tracking attend quelques frames stables
3. `Normal` reste exploitable
4. la scene derive moins lateralement
5. le modele part moins souvent derriere les murs
6. le workflow texture/READY reste intact apres capture

## PC EXPORT WITHOUT PHONE ANALYSIS TEST

### Objectif

Verifier que le mode **Exporter pour PC** ne declenche jamais l'analyse d'images ni le texturing sur le telephone.

### Preparation

1. Installer l'APK debug : `build-output/3DLiveScanner-pc-export-before-analysis-debug.apk`
2. Ouvrir Logcat :

```bash
adb logcat -s arcore_app:I
```

### Etapes

1. Faire un petit scan.
2. Terminer le scan.
3. Appuyer sur **Sauvegarder**.
4. Choisir **Exporter pour PC** (pas *Sauvegarder sur telephone*).
5. Observer l'ecran de progression / notification.

### Resultats attendus sur le telephone

L'application doit afficher uniquement des etapes du type :

- `Preparation du scan` / finalisation
- `Sauvegarde du dataset`
- `Creation du ZIP pour PC`
- `Dataset PC pret`

L'application ne doit **jamais** afficher :

- `Analyse des images`
- `Generation des textures` / `Creation des textures`

### Logcat attendu

- `[PC_EXPORT] Starting PC dataset export`
- `[PC_EXPORT] Saving raw dataset only`
- `[PC_EXPORT] Skipping image analysis on phone`
- `[PC_EXPORT] Skipping texturing on phone`
- `[PC_EXPORT] metadata.json written`
- `[PC_EXPORT] zip created: ...`
- `[PC_EXPORT] done`

Absence obligatoire en mode PC :

- `[TEXTURE]`
- etats workflow `ANALYZING_IMAGES` / `GENERATING_TEXTURES` issus du natif

### ZIP et partage

1. Verifier qu'un ZIP `scan-session-YYYYMMDD-HHMMSS.zip` est cree.
2. Chemin typique :

```text
/storage/emulated/0/Android/data/com.lvonasek.arcore3dscanner/files/pc-datasets/
```

3. Appuyer sur **Partager le ZIP** et envoyer vers Drive / USB / Nearby Share / fichiers.
4. Ouvrir le ZIP sur Windows via `run_gui.bat`.
5. Verifier `dataset_report.json` + `debug_pointcloud.ply`.

### Contenu ZIP minimum

- `metadata.json`
- `state.txt`
- `distortion.txt`
- `rotation.txt`
- fichiers `*.jpg`, `*.mat`, `*.tms`, `*.pcl`

Pas d'exigence OBJ/MTL/textures dans ce mode.

### Controle negatif (mode telephone)

1. Refaire un scan.
2. Choisir **Sauvegarder sur telephone**.
3. Verifier que l'analyse d'images et les textures sont bien lancees (workflow texture intact).

## REAL PHONE DATASET TEST

### Objectif

Verifier le flux complet :

1. scan Android reel
2. export dataset PC
3. recuperation du ZIP
4. validation PC
5. debug point cloud PLY

### Preparation

1. installer l'APK debug PC dataset export
2. faire un scan court
3. terminer le scan
4. ouvrir l'ecran de fichiers
5. selectionner le dossier `*.dataset`
6. cliquer sur `PC`

### Ce qu'il faut obtenir sur le telephone

- un ZIP `scan-session-YYYYMMDD-HHMMSS.zip`
- un message indiquant le chemin de recuperation
- un ZIP stocke dans :

```text
/storage/emulated/0/Android/data/com.lvonasek.arcore3dscanner/files/pc-datasets/
```

### Recuperation ADB

```bash
adb pull "/storage/emulated/0/Android/data/com.lvonasek.arcore3dscanner/files/pc-datasets/scan-session-YYYYMMDD-HHMMSS.zip" .
```

### Test Windows

```bat
cd pc_processor
run_pc_processing.bat "..\scan-session-YYYYMMDD-HHMMSS.zip" "..\output\real_phone_test"
```

### Fichiers attendus

```text
output/real_phone_test/
  dataset_report.json
  dataset_report.txt
  debug_pointcloud.ply
  processing_stats.json
```

### Verification

1. ouvrir `dataset_report.json`
2. verifier que le dataset est valide
3. ouvrir `debug_pointcloud.ply` dans MeshLab ou CloudCompare
4. verifier que les points correspondent au scan
5. verifier que le script PC n'essaie pas de faire une reconstruction complete
