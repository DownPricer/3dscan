# Restore Base Scan Audit

## Conclusion courte

La base originale exploitable a ete retrouvee via l'archive locale `3d live scanner original .zip`.
Il n'existe pas d'historique Git utilisable dans ce workspace, donc la restauration la plus sure consiste a repartir des fichiers sources originaux contenus dans cette archive et a ne garder que les ajouts Java/UI non intrusifs autour du scan.

## Reponses directes

### 1. Est-ce qu'un historique Git existe ?

Non.

- Aucun dossier `.git` n'est present dans ce workspace.
- Aucun tag, commit, branche ou remote upstream n'est donc consultable localement.
- Aucune APK "originale" pre-modification n'est presente dans le projet courant.

### 2. Peut-on retrouver le commit original avant modifications ?

Non, pas sous forme de commit Git local.

Oui, sous forme de baseline source :

- archive locale : `3d live scanner original .zip`
- contenu : arbre source complet `3DLiveScanner-main/...`

Cette archive remplace ici le role de baseline "avant modifications".

### 3. Quels fichiers ont ete modifies dans le moteur de scan ?

Les fichiers suivants influencent directement la capture, la reconstruction ou le pipeline de traitement telephone :

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`
- `common/arcore/service.cc`
- `common/arcore/service.h`
- `common/data/file3d.cc`
- `common/data/mesh.cc`
- `common/data/mesh.h`
- `common/postproc/texturize.cc`
- `common/postproc/texturize.h`
- `common/tango/retango.cc`
- `common/tango/texturize.cc`
- `common/thread/reconstr.cc`
- `common/thread/reconstr.h`
- `scanner/app/src/main/jni/Android.mk`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`

Couche experimentale ajoutee autour du scan :

- `common/arcore/scan_variant_config.cc`
- `common/arcore/scan_variant_config.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/BuildScanVariant.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/QualityProfiles.java`
- `scanner/app/build.gradle` avec `productFlavors` `base/basepc/fast/stable/photo`

### 4. Quels fichiers doivent etre restaures ?

Pour retrouver le comportement original du scan, les fichiers suivants doivent etre restaures depuis l'archive d'origine :

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`
- `common/arcore/service.cc`
- `common/arcore/service.h`
- `common/data/file3d.cc`
- `common/data/mesh.cc`
- `common/data/mesh.h`
- `common/postproc/texturize.cc`
- `common/postproc/texturize.h`
- `common/tango/retango.cc`
- `common/tango/texturize.cc`
- `common/thread/reconstr.cc`
- `common/thread/reconstr.h`
- `scanner/app/src/main/jni/Android.mk`
- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/jni/app.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`

Etat actuel :

- tous les fichiers ci-dessus ont ete verifies comme `RESTORED` par comparaison de hash avec l'archive originale

### 5. Quels fichiers peuvent rester modifies sans toucher au scan ?

Ces fichiers peuvent rester modifies car ils servent l'UX, l'export PC, le branding ou le suivi de workflow, sans reintroduire les variantes de capture :

- `scanner/app/build.gradle`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/PcDatasetExporter.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/CameraControl.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/AbstractActivity.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/FileAdapter.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/FileManager.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/Initializator.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanProcessingService.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/ScanWorkflowState.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/Service.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/Settings.java`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/ui/TextureExportValidator.java`
- `scanner/app/src/main/res/layout/activity_files.xml`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`
- `scanner/app/src/main/res/xml/provider_paths.xml`
- `scanner/app/src/main/res/xml/settings.xml`

Important :

- `Main.java` a ete remis sur les parametres de capture d'origine pour `bindAR()` et `onSurfaceChanged()`
- le choix post-scan "Analyser maintenant / Exporter pour PC" reste une couche UX
- l'export PC reste limite a la sauvegarde dataset + `metadata.json` + ZIP + partage

### 6. Quelle strategie est la plus sure ?

La strategie la plus sure est :

1. Restaurer les fichiers natifs/JNI directement depuis l'archive source originale.
2. Supprimer toute la couche `variant/profile` ajoutee apres coup.
3. Garder une seule APK.
4. Reposer les ajouts PC uniquement au-dessus du scan restaure :
   - dialogue post-scan
   - export dataset ZIP
   - partage ZIP
   - metadata non intrusive
   - branding leger

C'est plus sur que d'essayer de "corriger a la main" les filtres depth, les rejets de frames ou les seuils de tracking.

## Statut du projet apres audit

### Base originale retrouvee

Oui, via :

- `3d live scanner original .zip`

### Historique Git

Non disponible.

### Branche `base-scan-with-pc-export`

Impossible a creer localement sans depot Git.

Equivalent retenu :

- etat de travail nettoye dans ce workspace
- build cible unique base + export PC
- nom fonctionnel vise : `SiteReady Scan BASE`

### APK ancienne

Non trouvee dans le workspace comme baseline fiable.

Des APK debug de tests precedents existent dans `build-output/`, mais ce ne sont pas des references "origine" garanties.
