# Correction du workflow export PC

## Probleme observe

Apres un scan, le bouton **Sauvegarder** declenchait par defaut :

```text
Main.save()
  -> ScanProcessingService.startSaveTexturedScan(...)
     -> JNI.texturize(...)
        -> ANALYZING_IMAGES
        -> GENERATING_TEXTURES
```

C'est long sur telephone et ce n'est pas souhaite quand le traitement doit se faire sur PC.

## Chemin incorrect (avant correction)

| Etape | Fichier | Comportement |
|-------|---------|--------------|
| Clic sauvegarder | `Main.onClick(save_button)` | Confirmation puis `save()` |
| Choix automatique | `Main.save()` | `isPostProcessLaterOn()` rarement actif |
| Defaut | `Main.save()` | `startSaveTexturedScan(...)` |
| Pipeline lourd | `ScanProcessingService.runSaveTexturedScan` | `JNI.texturize` + validation texture |

Le bouton **PC** dans `FileManager` n'apparaissait qu'**apres** qu'un dataset `.dataset` existait deja. Il ne bloquait pas l'analyse si l'utilisateur appuyait sur Sauvegarder.

## Chemin corrige (apres correction)

| Etape | Fichier | Comportement |
|-------|---------|--------------|
| Clic sauvegarder | `Main.showSaveDestinationDialog()` | Choix **Telephone** ou **PC** |
| Choix PC | `Main.saveForPc()` | `ScanProcessingService.startSavePcDataset(...)` |
| Export PC | `ScanProcessingService.runSavePcDataset()` | dataset brut seulement |
| ZIP | `PcDatasetExporter.export(...)` | `metadata.json` + ZIP |
| Fin | `finishPcSuccess(zip)` | Etat `READY_PC_DATASET` + partage |

## Ce que le mode PC ne fait pas

- pas de `JNI.texturize(...)`
- pas d'etat UI `Analyse des images`
- pas d'etat UI `Generation des textures`
- pas de `TextureExportValidator` (reserve au mode telephone texturé)

## Ce que le mode telephone garde

- `startSaveTexturedScan(...)` inchange
- validation texture stricte conservee
- workflow READY texture intact

## Recuperation du ZIP sans ADB

Apres export PC :

- ecran fichiers : bouton **Partager le ZIP**
- `ACTION_SEND` + `FileProvider`
- compatible Drive / Nearby Share / USB / WhatsApp / etc.

Chemin typique du ZIP :

```text
/storage/emulated/0/Android/data/com.lvonasek.arcore3dscanner/files/pc-datasets/scan-session-YYYYMMDD-HHMMSS.zip
```

## Flux PC complet

```text
Scan Android
  -> Sauvegarder
  -> Exporter pour PC
  -> dataset brut + metadata.json + ZIP
  -> Partager ZIP
  -> PC : run_gui.bat
  -> validation + debug_pointcloud.ply
```
