# Audit des changements de scan — variantes de comparaison

## Contexte

**Objectif :** comprendre pourquoi le scan actuel est moins fiable qu’avant, et préparer 5 APK testables côte à côte.

**Périmètre :** application Android `scanner/` + pipeline natif `common/arcore/`.  
**Exclus :** site web, `pc_processor/` (sauf lecture des audits existants).

**Historique Git :** le dépôt local **n’a pas de `.git`**. La baseline « originale » est donc **reconstruite par configuration** (variante BASE), à partir des audits déjà présents dans le projet et du code actuel.

---

## Résumé exécutif

| Symptôme utilisateur | Cause probable (code) | Sévérité |
|---------------------|------------------------|----------|
| Profondeurs mauvaises / derrière les murs | Raw Depth + filtre confidence + rejet depth/pose mismatch | Élevée |
| Surfaces décalées / glissement | Rejet pose tardif + intégration pendant reprise tracking | Élevée |
| Scan parfois plus net mais moins fiable | Profils High / Real estate HD trop stricts | Moyenne |
| Trous / zones noires | Filtrage agressif + refus d’intégrer pixels faible confidence | Moyenne (parfois souhaitable) |
| Sauvegarde lente | Plus de rejets → moins de fusion → utilisateur rescanne | Moyenne |

Les changements documentés dans `ARCORE_CAPTURE_IMPROVEMENT_AUDIT.md` et `POSE_STABILITY_AUDIT.md` ont ajouté des **garde-fous** utiles en théorie, mais en pratique ils peuvent **rejeter trop de frames** et **forcer Raw Depth** sur certains profils, ce qui dégrade la stabilité perçue par rapport à l’app d’origine (depth classique, seuils permissifs).

---

## Comportement original (avant modifications récentes)

D’après `SCAN_QUALITY_AUDIT.md` et le code restant :

| Fonctionnalité | État original |
|----------------|---------------|
| Depth API | `AR_DEPTH_MODE_AUTOMATIC` / depth classique via `ArFrame_acquireDepthImage16Bits` |
| Raw Depth | Non prioritaire ; pas de profil HD forçant Raw |
| Confidence map | Filtrage pixel optionnel, pas de rejet frame global |
| Rejet de frames | Surtout `poseDiff` (seuil ~25) et nuage vide |
| Vitesse caméra / rotation | Limites surtout en profils High / Real estate HD |
| Temporisation tracking lost | Limitée, profil Normal permissif |
| Real estate HD | N’existait pas ou n’était pas le défaut |
| Capture quality score | Pas de score composite bloquant l’UX |
| Coverage warnings | Informatifs ou absents |
| Export PC | Ajout récent (hors scan live) |

**Pipeline typique original :** pose ARCore → depth classique → points → Tango 3DR → mesh temps réel → JPG/poses à chaque frame intégrée.

---

## Ce qui a été ajouté (modifications récentes)

### 1. Raw Depth (`common/arcore/arcore.cc`)

- Détection `AR_DEPTH_MODE_RAW_DEPTH_ONLY`.
- `ShouldPreferRawDepth()` : **true** pour `QUALITY_HIGH` et `QUALITY_REAL_ESTATE_HD`.
- Fallback depth classique si échec frame.
- **Risque :** Raw Depth sparse, reprojection, incohérences avec depth secondaire → surfaces fantômes.

### 2. Confidence map bloquante (`arcore.cc` → `UpdateFeaturePoints`)

- `ArFrame_acquireRawDepthConfidenceImage`.
- Seuil `minConfidence` (128 sans capteur depth, plus en HD).
- Rejet pixels + hole filling + wall completion.
- **Risque :** moins de points → trous, score qualité bas, messages RESCAN_ZONE.

### 3. Rejet de frames (`common/arcore/service.cc` → `GetPointCloud`)

| Raison | Condition |
|--------|-----------|
| `pose_jump` | `GetPoseDiff() >= maxDiff` |
| `tracking_state` | pas `TRACKING` |
| `tracking_recovering` | délai + N frames stables après reset |
| `pose_jump_translation/rotation` | saut impossible vs pose acceptée |
| `depth_*_mismatch` | timestamp depth, saut profondeur moyenne, ratio instabilité Raw/classic |
| `empty_point_cloud` | après filtrage depth |

`CaptureStabilityConfig` par profil (Fast / Normal / High / Real estate HD) dans `StabilityConfigForProfile()`.

### 4. Mode compatibilité (`EnableCompatibilityMode`)

- Activé après N rejets consécutifs ou timeout sans frame acceptée.
- Assouplit ensuite les seuils.
- **Risque :** comportement bi-modal (strict puis permissif) difficile à prévoir.

### 5. Guidance / scores (`app.cc`, `arcore.cc`)

- `depth_quality_score_`, `black_holes_ratio_`, `capture_quality_`.
- Events : `COVERAGE_LOW`, `COVERAGE_MEDIUM`, `DEPTH_LOW`, `RESCAN_ZONE`, `POSE_JUMP`.
- Seuils plus agressifs en Real estate HD.
- **Risque :** l’utilisateur croit que le scan est « mauvais » alors que le pipeline refuse d’intégrer (comportement voulu mais frustrant).

### 6. Real estate HD (`QualityProfiles.java`)

- Résolution 0.01 m, noise 1, maxDepth 7, pose correction, full HD.
- Profil natif `QUALITY_REAL_ESTATE_HD` → seuils les plus stricts.
- **Risque :** scan lent, beaucoup de rejets, rendu temps réel irrégulier.

### 7. Export PC (Java — inchangé pour le scan live)

- `ScanProcessingService.startSavePcDataset` : pas d’analyse image, ZIP + metadata.
- **Ne modifie pas** la capture en direct si workflow respecté.

---

## Matrice : strict vs permissif

| Paramètre | Original (approx.) | Actuel (Normal+) | Actuel (Real estate HD) |
|-----------|-------------------|------------------|-------------------------|
| Raw Depth forcé | Non | Non (sauf High/HD) | Oui |
| Confidence bloquante | Légère | Moyenne | Forte |
| Recovery delay | ~0–0.2 s | 0.18 s | 0.65 s |
| Pose jump vs acceptée | Faible | Moyen | Strict |
| Depth mismatch | Non | Oui | Oui (strict) |
| maxDiff pose | 25 | 25 | 25 (hardJump 38) |

---

## Variantes APK créées pour A/B test

Configuration centralisée : `BuildScanVariant.java` + `common/arcore/scan_variant_config.{h,cc}`.

| Variante | But | Résumé réglages |
|----------|-----|-----------------|
| **BASE** | Retrouver scan original | Depth classique, pas Raw, pas confidence bloquante, rejet frame minimal, warnings only, pas export PC |
| **BASE+PC** | BASE + ZIP Meshroom | Identique BASE + export PC |
| **FAST** | Hypothèse « trop strict » | Très permissif, export PC |
| **STABLE** | Anti profondeurs absurdes | Rejets modérés, depth mismatch actif, profil Normal forcé |
| **PHOTO** | Dataset photogrammétrie | Permissif + JPG extra si depth vide + guidance utilisateur |

Logs au démarrage :

```
[VARIANT] name=BASE+PC
[VARIANT] raw_depth=false
[VARIANT] frame_rejection=0
...
```

---

## Fichiers modifiés pour le protocole de variantes

| Fichier | Rôle |
|---------|------|
| `scanner/app/build.gradle` | productFlavors × 5 |
| `scanner/.../BuildScanVariant.java` | Constantes compile-time → JNI |
| `common/arcore/scan_variant_config.*` | Config native |
| `common/arcore/service.cc` | Gates rejet frame |
| `common/arcore/arcore.cc` | Raw depth + confidence + filtre depth |
| `scanner/app/src/main/jni/app.cc` | maxDiff, guidance, keyframes photo |
| `build_all_scan_variants.bat` | Build + copie APK |

---

## Recommandation de test

1. Installer les 5 APK sur la **même scène** (meuble texturé + mur clair).
2. Scanner 2 minutes chacun avec **profil Normal** dans les réglages.
3. Noter : tracking, profondeur, sauts, trous, temps sauvegarde.
4. Sur **BASE+PC** et **PHOTO** : exporter ZIP et comparer nombre de JPG.
5. Choisir la variante la plus proche de l’original **avec** export PC → probablement **BASE+PC** ou **FAST**.

Voir `SCAN_VARIANTS_TEST_PLAN.md` pour le tableau à remplir.

---

## Baseline retrouvée ?

**Partiellement :** sans Git, la variante **BASE** désactive les garde-fous identifiés comme post-régression. Ce n’est pas un binaire historique exact, mais une **approximation configurable** la plus proche du comportement décrit dans les audits « avant phase capture ».
