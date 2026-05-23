# PERFORMANCE AUDIT

## Objectif

Documenter les traitements longs du pipeline scan/export et leur risque si l'application passe en arriere-plan.

## Resume

Avant l'ajout du foreground service, les traitements longs etaient lances depuis `Main` via `Service.process(...)` avec un `Runnable` statique attache indirectement a l'`Activity`.

Problemes observes :

- dependance forte au cycle de vie de `Main`
- fermeture de l'activite juste avant le traitement, mais execution encore couplee a l'etat du process UI
- progression uniquement exposee par polling de `JNI.getEvent(...)`
- annulation inexistante ou brutale
- usage de `System.exit(0)` dans plusieurs chemins

Apres cette phase, les traitements longs de scan passent par `ScanProcessingService`, un `Foreground Service` Android dedie, avec notification persistante, etat partage, et annulation best effort.

## Traitements longs identifies

| Etape | Methode/fichier | Thread/declencheur avant refonte | Risque si app en arriere-plan | Duree estimee | Progression possible |
|---|---|---|---|---|---|
| Sauvegarde scan vers OBJ | `Main.save()` -> `JNI.save(...)` dans `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Main.java` | `Runnable` lance via `Service.process(...)` | Moyen a fort, depend du process UI et du pseudo-service statique | quelques secondes a dizaines de secondes selon taille scan | Oui, etapes textuelles + resume perf |
| Sauvegarde dataset | `Main.save()` -> `JNI.save(...)` + renommage dossier | `Runnable` lance via `Service.process(...)` | Moyen, surtout si l'activite est fermee au mauvais moment | quelques secondes | Oui, etapes textuelles |
| Reconstruction finale dataset | `JNI.onUndoButtonClicked(...)` -> `Reconstruction::Undo(...)` dans `common/thread/reconstr.cc` | appelee depuis `Main.bindAR()` pendant post-traitement | Fort, operation lourde dependante du natif et du process en cours | secondes a dizaines de secondes | Oui, `CONVERT x/y` et resume `[PERF]` |
| Analyse d'image / selection des meilleures vues | `App::Texturize(...)` -> `oc::Texturize::Process(...)` dans `common/postproc/texturize.cc` | appelee depuis `Main.bindAR()` pendant post-traitement | Fort, c'est l'etape la plus longue et la plus visible | dizaines de secondes a plusieurs minutes | Oui, `ANALYSE x/y`, `IMAGE x/y`, logs `[PERF]` |
| Texturing Tango 3DR | `TangoTexturize::ApplyFrames(...)` et `TangoTexturize::Process(...)` dans `common/tango/texturize.cc` | appelee depuis `App::Texturize(...)` | Fort, depend d'un appel JNI long et non annulable immediatement | dizaines de secondes | Oui, `IMAGE x/y`, `UNWRAP`, `CONVERT` |
| Nettoyage mesh / simplification | `TangoTexturize::CreateContext(...)`, `Poisson().Process(...)`, `Optimizer().Process(...)` | appele selon le mode export et les options | Moyen a fort selon la taille du modele | secondes a dizaines de secondes | Partiellement, etapes textuelles + logs `[PERF]` |
| Recalcul normales | `ApplyExportNormals(...)` dans `scanner/app/src/main/jni/app.cc` | appele juste avant ecriture du modele | Moyen | secondes sur gros mesh | Oui, log `[PERF] Normal recompute` |
| Export OBJ/MTL/textures | `File3d(...).WriteModel(...)` et `Tango3DR_Mesh_saveToObj(...)` | appele depuis `App::Save`, `App::SaveWithTextures`, `App::Texturize`, `TangoTexturize::Process` | Moyen | secondes a dizaines de secondes | Oui, etapes textuelles + logs `[PERF]` |
| Sauvegarde fichiers finaux | `Exporter.export(...)` dans `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/Exporter.java` | avant: souvent au retour dans `FileManager`; maintenant deplace dans le foreground service | Moyen | quelques secondes | Oui, etape `Finalizing files` |

## Dependance actuelle a l'Activity

### Avant le foreground service

- `Main.bindAR()` lancait le post-traitement long.
- `Main.save()` lancait aussi les grosses sauvegardes.
- `Service.process(...)` conservait un `Runnable` statique et une reference `parent` vers l'`Activity`.
- le traitement commencait avec fermeture de l'`Activity`, mais la logique restait attachee au meme process UI, sans composant Android robuste de long terme
- `FileManager` ne faisait que lire un etat de preferences et afficher un texte

### Apres cette phase

- `ScanProcessingService` porte les traitements longs utilisateur
- passage en foreground immediat avec notification persistante
- progression et etape courante poussees via preferences partagees + notification
- `FileManager` relit cet etat si l'app est rouverte
- annulation disponible en best effort depuis notification et UI

## Risques restants

1. Les gros appels JNI comme `JNI.texturize(...)` et certaines etapes 3DR ne sont pas interrompables finement.
   L'annulation est donc "best effort" : immediate entre etapes, mais potentiellement retardee pendant un appel natif monolithique.

2. Certaines etapes de reconstruction et de texturing reposent encore sur l'etat natif global initialise avant la fermeture de `Main`.
   Le foreground service garde le process vivant, mais un kill systeme extremement agressif reste un risque a tester.

3. Les progressions numeriques exactes n'existent pas partout.
   Le service utilise donc :
   - un pourcentage quand il detecte un motif `x/y`
   - sinon une etape textuelle utile

## Points de mesure a comparer

Comparer au minimum les durees Logcat suivantes :

- `[PERF] Reconstruction`
- `[PERF] Depth fusion`
- `[PERF] Mesh cleanup`
- `[PERF] Normal recompute`
- `[PERF] Image analysis`
- `[PERF] Image analysis/texturing`
- `[PERF] Export OBJ/MTL/textures`
- `[PERF] Save files`
- `[PERF] Total processing`

## Ce qu'il faut verifier sur telephone

1. la notification apparait immediatement au lancement du traitement
2. le traitement continue apres appui sur `Home`
3. le traitement continue ecran verrouille
4. la reouverture de l'application affiche bien l'etape en cours
5. un deuxieme traitement identique n'est pas relance
6. l'annulation n'abime pas l'export final

## Capture quality phase

### Scope

This phase adds capture-side safeguards only:

- Raw Depth support detection
- confidence-aware filtering
- frame rejection after unstable tracking recovery
- camera speed / angular speed gating
- richer `[CAPTURE]` diagnostics

### Expected performance impact

Expected runtime impact is low to moderate:

1. extra metrics are derived from data already read in the frame pipeline
2. new gating avoids feeding obviously bad frames into reconstruction
3. logging is throttled to remain readable and avoid excessive spam

In practice, these changes may slightly reduce the number of fused frames, but that is intentional:

- fewer bad frames
- less unstable geometry
- fewer black square artifacts

### What was not changed for performance safety

- no heavy new post-processing pass
- no global pose optimization
- no large UI work
- no texture pipeline rewrite

### What to measure on phone

Compare before/after on the same scene:

- `[CAPTURE] frameAccepted=true/false reason=...`
- `[CAPTURE] captureQuality=GOOD/MEDIUM/LOW`
- `[PERF] Scan frame`
- `[PERF] Depth fusion`
- `[PERF] Reconstruction`
- total wall-clock scan time

### Success criteria

This phase is acceptable if:

1. drift and unstable integration are reduced
2. black square artifacts are reduced
3. capture warnings appear earlier and more usefully
4. realtime scanning does not become noticeably slower on the target phone
5. the texture/READY workflow remains unchanged after scan completion

## Pose stability phase

### Scope

This phase adds pose-stability safeguards on top of the capture filters:

- pose delta tracking between frames
- comparison against the last accepted pose
- short stabilization window after tracking recovery
- light depth/camera timestamp coherence checks
- rejection of clearly implausible frames before reconstruction
- richer `[POSE]` logs for field debugging

### Expected performance impact

Expected runtime impact remains low:

1. pose metrics reuse transforms already computed every frame
2. timestamp checks are scalar comparisons only
3. depth-history checks use aggregated values, not a heavy global pass
4. rejected bad frames may even reduce downstream reconstruction work

The main practical cost is slightly fewer integrated frames in unstable moments, which is intentional if it avoids corrupt geometry.

### What to compare on phone

- `[POSE] frameIntegrated=true/false`
- `[POSE] rejectReason=...`
- `[POSE] trackingRecentlyRecovered=true/false`
- `[POSE] depthPoseMismatch=true/false`
- `[PERF] Scan frame`
- `[PERF] Reconstruction`
- overall wall-clock scan duration on the same scene
