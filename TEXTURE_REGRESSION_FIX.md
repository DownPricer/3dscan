# TEXTURE REGRESSION FIX

## Resume

Le bug "modele blanc" venait de plusieurs causes combinees dans le workflow Android.

La cause principale trouvee est :

- le chemin de fin de scan normal passait par `startSaveModel()` puis `runSaveModel()`
- ce chemin n'executait pas le pipeline complet d'analyse image + texturing

Autrement dit :

- l'analyse d'image et le texturing etaient reellement sautes sur le workflow principal de fin de scan

## Causes exactes

### Cause A - Texturing jamais appele sur le flux principal

Fichiers :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanProcessingService.java`

Avant correction :

- scan normal termine
- `Main.save()` appelait `ScanProcessingService.startSaveModel()`
- `runSaveModel()` faisait seulement `JNI.save(...)` puis `Exporter.export(...)`
- aucun `JNI.texturize(...)`

Impact :

- pas d'etape "Analyse des images"
- pas de textures garanties
- modele potentiellement blanc

### Cause D - READY appele trop tot

Fichier :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanProcessingService.java`

Avant correction :

- `backgroundFinish(...)` et "Scan pret" pouvaient arriver sans validation texture bloquante

### Cause E - Export OBJ/MTL/PNG faux succes

Fichier :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java`

Problemes :

1. `getObjResources(...)` ajoutait un faux fichier `*.mtl.png`
2. `export(...)` pouvait renvoyer un fichier de sortie meme si le move du `.obj` ou des ressources echouait

Impact :

- le viewer pouvait recevoir un OBJ sans MTL ou sans textures presentes

## Correctifs appliques

### 1. Le flux normal passe maintenant par le vrai pipeline texture

Dans `Main.save()` :

- le scan non-face n'utilise plus `startSaveModel()`
- il utilise `ScanProcessingService.startSaveTexturedScan(...)`

Dans `ScanProcessingService.runSaveTexturedScan(...)` :

1. `JNI.save(...)` vers OBJ temporaire
2. `JNI.texturize(...)`
3. `Exporter.export(...)`
4. `TextureExportValidator.validate(...)`
5. READY seulement si tout est valide

### 2. Validation texture obligatoire avant READY

Fichier :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/TextureExportValidator.java`

Verification imposee :

- au moins 1 image disponible
- au moins 1 image selectionnee pour texturing
- `.obj` present
- `.mtl` present
- `vt` present
- `mtllib` present
- `usemtl` present
- `map_Kd` present
- textures referencees presentes sur disque

Si une verification echoue :

- pas de READY
- etat ERROR
- message explicite
- logs `[TEXTURE][ERROR]`

### 3. Retour d'echec natif remonte au Java

Fichiers :

- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`

Changements :

- `JNI.texturize(...)` retourne maintenant un bool
- `App::Texturize(...)` remonte les echecs
- message natif lisible via `JNI.getLastProcessingError()`

Cas couverts :

- texturing init impossible
- aucune image retenue
- export texture invalide

### 4. Export OBJ/MTL/textures fiabilise

Fichier :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java`

Correction :

- suppression du faux `*.mtl.png`
- export renvoie `null` si le move/copy du `.obj` ou des ressources echoue
- fallback copy si `renameTo(...)` echoue

### 5. Etats workflow et UX clarifies

Fichiers :

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanWorkflowState.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanProcessingService.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/FileManager.java`

Etats utilises :

- `SCANNING`
- `SCAN_FINISHED`
- `PROCESSING_GEOMETRY`
- `ANALYZING_IMAGES`
- `GENERATING_TEXTURES`
- `VALIDATING_EXPORT`
- `READY`
- `ERROR`

## Logs attendus

Workflow :

- `[WORKFLOW] State: SCANNING`
- `[WORKFLOW] State: PROCESSING_GEOMETRY`
- `[WORKFLOW] State: ANALYZING_IMAGES`
- `[WORKFLOW] State: GENERATING_TEXTURES`
- `[WORKFLOW] State: VALIDATING_EXPORT`
- `[WORKFLOW] State: READY`
- `[WORKFLOW][ERROR] ...`

Texture :

- `[TEXTURE] Image frames available: X`
- `[TEXTURE] Selected frames for texturing: X`
- `[TEXTURE] Texture files generated: X`
- `[TEXTURE] OBJ has UV coordinates: yes/no`
- `[TEXTURE] MTL generated: yes/no`
- `[TEXTURE] Texture file exists: yes/no`
- `[TEXTURE][ERROR] ...`

## Resultat attendu

L'application ne doit plus afficher "Scan pret" si :

- aucune frame n'a ete retenue
- aucune texture n'a ete generee
- le `.mtl` manque
- l'OBJ n'a pas de UV
- l'OBJ ne reference pas de MTL
- le MTL ne reference pas de texture
- une texture referencee manque sur disque

## Risques restants

1. Le pipeline natif reste long et sensible aux donnees du dataset.
2. Les viewers externes peuvent encore dependre de leur propre support OBJ/MTL.
3. Les messages doivent maintenant etre verifies sur telephone reel, surtout entre `ANALYZING_IMAGES` et `GENERATING_TEXTURES`.
