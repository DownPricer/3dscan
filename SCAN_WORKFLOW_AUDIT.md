# SCAN WORKFLOW AUDIT

## Portee

Audit limite a l'application Android `scanner/app`.

Hors perimetre volontaire :

- site web
- upload
- GLB
- nouveau background service

## Fichiers cles

### Texte "Traitement du scan"

- `scanner/app/src/main/res/values-fr/strings.xml`
- cle : `scan_processing_notification_title`

### Texte "Scan pret"

- `scanner/app/src/main/res/values-fr/strings.xml`
- cle : `scan_processing_ready_notification`

### Service de workflow post-scan

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanProcessingService.java`

### Etat UI / ecran de traitement

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/FileManager.java`
- `scanner/app/src/main/res/layout/activity_files.xml`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/Service.java`

### Point d'entree fin de scan

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`

### Lancement analyse image / texturing

- Java JNI : `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- JNI/C++ : `scanner/app/src/main/jni/app.cc`
- Analyse image : `common/postproc/texturize.cc`
- Texturing Tango / export OBJ+MTL+textures : `common/tango/texturize.cc`

### Export final et ressources OBJ/MTL/textures

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java`
- `common/data/file3d.cc`

## Workflow actuel corrige

### 1. Fin du scan

Point d'entree :

- `Main.save()`

Cas Android scanner non-face :

1. `Main.save()` loggue `[WORKFLOW] State: SCAN_FINISHED`
2. le mode normal ne passe plus par `startSaveModel()`
3. il lance maintenant `ScanProcessingService.startSaveTexturedScan(...)`

Cas dataset "post-process later" :

1. `Main.save()`
2. `ScanProcessingService.startSaveDataset(...)`
3. plus tard, ouverture d'un `.dataset`
4. `Main.bindAR()` detecte `mToPostprocess`
5. `ScanProcessingService.startPostprocess(...)`

Cas face scan :

- `startSaveModel()` reste utilise pour l'export face

## 2. Traitement Android

Le service central est :

- `ScanProcessingService.onStartCommand()`

Il lance selon l'operation :

- `runSaveTexturedScan(...)`
- `runPostprocess(...)`
- `runSaveDataset()`
- `runSaveModel()` pour le face

## 3. Geometrie temporaire

Dans `runSaveTexturedScan(...)` et `runPostprocess(...)` :

1. etat `PROCESSING_GEOMETRY`
2. `JNI.save(...)` ecrit un OBJ temporaire
3. ce fichier sert d'entree au texturing

## 4. Analyse d'image

Fonction qui lance l'analyse d'image :

- `JNI.texturize(...)` cote Java
- `App::Texturize(...)` cote C++

Analyse image reelle :

1. `App::Texturize(...)`
2. si `twoPass == true`
3. creation d'un `oc::Texturize`
4. `oc::Texturize::Process(reconstruction.dataset, output, false)`
5. `common/postproc/texturize.cc` :
   - charge le modele
   - projette les frames
   - supprime les mauvaises frames
   - calcule la liste finale `GetFrames()`

Callback visible :

- `AnalyseCallback(...)` dans `scanner/app/src/main/jni/app.cc`
- emet `ANALYSE current/count`

## 5. Generation des textures

Fonction qui lance le texturing reel :

- `App::Texturize(...)`

Etapes :

1. `reconstruction.texturize.ApplyFrames(...)`
2. `reconstruction.texturize.Process(output, true, poisson)`
3. implementation dans `common/tango/texturize.cc`
4. generation unwrap / OBJ / MTL / images texture

## 6. Validation export

Validation obligatoire avant READY :

- `TextureExportValidator.validate(...)`

Verifications :

- au moins 1 image disponible
- au moins 1 image selectionnee pour texturing
- `.obj` existe
- `.mtl` existe
- `.obj` contient `vt`
- `.obj` contient `mtllib`
- `.obj` contient `usemtl`
- `.mtl` contient `map_Kd`
- chaque texture referencee existe sur disque

## 7. Condition de passage a READY

Maintenant, READY n'est autorise que si :

1. `JNI.texturize(...)` retourne `true`
2. `Exporter.export(...)` retourne un vrai fichier exporte
3. `TextureExportValidator.validate(...)` retourne `ok`
4. alors seulement :
   - `ScanProcessingService.finishSuccess(...)`
   - `Service.backgroundFinish(...)`
   - etat `READY`

## 8. Chargement du viewer

Le viewer n'est plus ouvert automatiquement a la fin du traitement.

Nouveau comportement :

1. `FileManager.onResume()` detecte un traitement termine
2. affiche un ecran "Scan pret"
3. propose :
   - `Voir le modele` seulement si le resultat est un modele exploitable
   - `Nouveau scan`
   - `Reessayer le traitement` si un dataset retryable a echoue

Le chargement du viewer se fait ensuite vers :

- `Main`
- puis `JNI.load(...)`

## Reponse precise aux questions

### Quel fichier affiche "Traitement du scan" ?

- `scanner/app/src/main/res/values-fr/strings.xml`
- utilise par `ScanProcessingService`

### Quel fichier affiche "Scan pret" ?

- `scanner/app/src/main/res/values-fr/strings.xml`
- utilise par `ScanProcessingService` et `FileManager`

### Quelle fonction lance l'analyse d'image ?

- `App::Texturize(...)`
- via `oc::Texturize::Process(...)`

### Quelle fonction lance le texturing ?

- `App::Texturize(...)`
- via `reconstruction.texturize.ApplyFrames(...)`
- puis `reconstruction.texturize.Process(...)`

### Quelle condition permettait de passer a "Scan pret" ?

Avant correction :

- `Exporter.export(...) != null`

Probleme :

- `Exporter.export(...)` pouvait renvoyer une destination meme si le move du `.obj` echouait
- aucune validation texture bloquante n'etait faite avant `backgroundFinish(...)`

Maintenant :

- READY seulement apres validation texture complete

### Pourquoi l'etape "analyse d'image" ne semblait plus visible ?

Cause principale trouvee :

- le workflow de fin de scan normal passait par `startSaveModel()`
- ce chemin exportait directement le modele
- il ne lancait ni `JNI.texturize(...)`, ni l'analyse d'image

Donc l'etape etait effectivement sautee sur ce chemin.

### Pourquoi pouvait-on arriver a "Scan pret" alors que le modele etait blanc ?

Causes cumulees :

1. le chemin "save model" de fin de scan normal contournait totalement le texturing
2. `Exporter.getObjResources(...)` ajoutait a tort un faux fichier `*.mtl.png`
3. `Exporter.export(...)` pouvait laisser passer un faux succes meme si les ressources n'etaient pas correctement deplacees
4. `ValidateTexturedExport(...)` cote natif ne bloquait pas READY
5. l'UI passait a l'etat fini sans validation texture obligatoire

## Cause racine retenue

La vraie regression n'etait pas seulement un probleme de normales.

La cause principale etait :

- le workflow de fin de scan normal ne passait pas par le pipeline d'analyse image + texturing

Causes secondaires critiques :

- export OBJ/MTL/textures non fiable
- absence de validation bloquante avant READY

## Correctif applique

1. fin de scan normal reroutee vers un vrai pipeline texture
2. etats workflow explicites ajoutes
3. validation texture obligatoire avant READY
4. faux succes d'export bloques
5. UI de traitement clarifiee
