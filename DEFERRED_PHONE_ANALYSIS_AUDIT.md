# Audit — analyse téléphone différée (dataset brut)

## Où est stocké le dataset brut ?

- Après capture, les données temporaires vivent sous le répertoire temporaire de l’activité (`AbstractActivity.getTempPath()`).
- La sauvegarde « dataset » (y compris **Analyser plus tard**) déplace ce dossier vers le stockage utilisateur de l’app : `AbstractActivity.getPath(false)` sous un nom `yyyyMMdd_HHmmss.dataset` (voir `ScanProcessingService.saveRawDatasetFolder()`).
- Le fichier d’état attendu pour un dataset valide inclut notamment `state.txt` à la racine du dossier `.dataset`.

## Métadonnées de session (`scan_session.json`)

- Fichier : `scan_session.json` à la racine du dossier `.dataset`.
- Géré par `ScanSessionMetadata` (statuts `RAW_PENDING_ANALYSIS`, `ANALYZING_ON_PHONE`, `PROCESSED_MODEL`, et `pcExportStatus` = `PC_EXPORTED` pour l’export ZIP PC sans remplacer le statut téléphone).

## Quelle méthode lance l’analyse téléphone « originale » depuis un dataset déjà sauvé ?

- **`ScanProcessingService.startAnalyzeSavedDataset(Context, String datasetAbsolutePath)`**  
  - Vérifie que le chemin est un dossier `.dataset`, que `state.txt` existe, et que le statut n’est pas déjà `PROCESSED_MODEL`.  
  - Configure les préférences `pref_later` / `pref_mode` = `realtime` puis ouvre **`Main`** avec l’extra `FILE_KEY` pointant vers le dossier `.dataset`.
- Dans **`Main.bindAR()`**, si `mToPostprocess` est non nul, JNI est initialisé avec le chemin du dataset (`JNI.onARServiceConnected(..., path)`), puis **`ScanProcessingService.startPostprocess(...)`** est appelé — même pipeline que l’ouverture d’un scan depuis la liste (export « modèle temps réel »).

## Peut-on relancer l’analyse plus tard depuis un dataset existant ?

- **Oui**, tant que le dossier `.dataset` est intact et contient les fichiers nécessaires (au minimum `state.txt` ; le pipeline natif attend le même contenu que pour un post-traitement classique).
- L’UI liste les scans **en attente** (`RAW_PENDING_ANALYSIS`) et propose **Analyser** (ou un appui direct sur la vignette) qui appelle `startAnalyzeSavedDataset`.

## Fichiers nécessaires (côté Java / UX)

- Dossier `.dataset` finalisé (déplacement depuis le temp, sans `.bin` superflus — logique inchangée dans `saveRawDatasetFolder`).
- `state.txt` (utilisé pour le comptage de frames et la validation côté `startAnalyzeSavedDataset`).
- `scan_session.json` pour les flux « différés » (création à la sauvegarde **Analyser plus tard**, mises à jour pendant / après post-traitement).

## Éviter de supprimer le dataset avant analyse

- **Analyser plus tard** n’appelle pas `JNI.texturize` : seule la copie / finalisation du dossier `.dataset` est effectuée, puis `scan_session.json` avec statut `RAW_PENDING_ANALYSIS`.
- Le dataset reste sous `getPath(false)` comme les autres scans ; il n’est pas supprimé automatiquement.

## Erreur / reprise

- Pendant le post-traitement **realtime** sur un `.dataset` qui possède déjà `scan_session.json`, le statut passe à `ANALYZING_ON_PHONE` au démarrage.
- En cas d’**échec** ou d’**annulation** (`CancellationException` ou autre `RuntimeException` remontée depuis `runPostprocess`), si le statut était `ANALYZING_ON_PHONE`, il est **restauré** à `RAW_PENDING_ANALYSIS` via `ScanSessionMetadata.markRawPendingRestored()` pour permettre un nouvel essai.
- En cas de succès, `markProcessed` enregistre le nom du dossier modèle exporté (`.obj`) pour ouverture directe depuis la liste.

## Fichiers Java touchés (workflow uniquement)

- `Main.java` — dialogue à 3 choix, branche **Analyser plus tard**.
- `ScanProcessingService.java` — opération `save_deferred_raw`, métadonnées pendant `runPostprocess`, `startAnalyzeSavedDataset`.
- `ScanSessionMetadata.java` — persistance JSON et statuts.
- `FileAdapter.java` / `FileManager.java` / `activity_files.xml` / `strings.xml` — liste, actions, textes.

Aucune modification du moteur natif / ARCore / JNI de capture au-delà des appels existants déjà utilisés par le flux de post-traitement.
