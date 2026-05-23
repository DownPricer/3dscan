# Plan de test — 5 variantes scan 3D

## Préparation

1. Générer les APK : `build_all_scan_variants.bat` (depuis la racine du projet).
2. Installer les 5 APK sur le même téléphone (Android 7+ ARM64).
3. Désinstaller d’anciennes versions si conflit de signature (debug différent par `applicationId`).
4. Pour chaque variante, vérifier dans **Réglages → About** le libellé (ex. `BASE+PC — 2.0-variants-basepc`).

| APK | applicationId | Label launcher |
|-----|---------------|----------------|
| 3DScan-BASE-debug.apk | com.lvonasek.arcore3dscanner.base | 3D Scan BASE |
| 3DScan-BASE-PC-debug.apk | com.lvonasek.arcore3dscanner.basepc | 3D Scan BASE+PC |
| 3DScan-FAST-debug.apk | com.lvonasek.arcore3dscanner.fast | 3D Scan FAST |
| 3DScan-STABLE-debug.apk | com.lvonasek.arcore3dscanner.stable | 3D Scan STABLE |
| 3DScan-PHOTO-debug.apk | com.lvonasek.arcore3dscanner.photo | 3D Scan PHOTO |

**Réglages communs pour comparer la capture :**

- Profil scan : **Normal** (dans l’app, sauf test volontaire HD).
- Même résolution / même pièce / même durée (~2 min par test).

**Logs :** filtrer `adb logcat` avec `[VARIANT]` et `[CAPTURE]` / `[POSE]`.

---

## Tableau de comparaison (à remplir)

| Critère | BASE | BASE+PC | FAST | STABLE | PHOTO |
|---------|------|---------|------|--------|-------|
| Scan démarre (oui/non) | | | | | |
| Tracking stable (oui/non) | | | | | |
| Profondeur correcte (oui/non) | | | | | |
| Sauts gauche/droite (oui/non) | | | | | |
| Murs propres (oui/non) | | | | | |
| Trous (faible/moyen/fort) | | | | | |
| Zones noires (faible/moyen/fort) | | | | | |
| Temps sauvegarde téléphone (s) | | | | | |
| Export PC fonctionne (oui/non) | N/A | | | | |
| Nombre JPG dans ZIP PC | N/A | | | | |
| Qualité Meshroom si testé (1–5) | N/A | | | | |
| Note globale (1–5) | | | | | |

**Appareil :** _______________________  
**Date :** _______________________  
**Scène principale :** _______________________

---

## Scénarios de test

### 1. Petit objet coloré

- Objet 20–40 cm, textures visibles (boîte, figurine, plante).
- Mouvement lent autour de l’objet, 90–120 s.
- **Attendu BASE/FAST :** fusion continue, peu de messages RESCAN.
- **Attendu STABLE :** moins de « murs fantômes », parfois plus de trous.

### 2. Mur blanc + objet texturé

- Coin de pièce : mur clair + meuble/objet détaillé.
- **Critère :** le mur ne doit pas « avaler » l’objet ni créer plan lointain faux.
- Comparer BASE vs STABLE vs PHOTO.

### 3. Angle de pièce

- Scan d’un angle (2 murs + sol).
- **Critère :** arêtes droites, pas de glissement global du nuage.
- Noter sauts de pose (POSE_JUMP dans l’UI).

### 4. Meuble avec arêtes droites

- Table / étagère / chaise.
- **Critère :** arêtes lisibles sans facettes excessives (qualité mesh temps réel).

### 5. Petit scan — export PC (BASE+PC, FAST, STABLE, PHOTO)

- Scan 60–90 s → **Exporter pour PC** → partager / récupérer ZIP.
- Compter les `.jpg` dans le ZIP.
- Vérifier `metadata.json` : champs `scan_variant_id`, `scan_variant_label`.

### 6. Test Meshroom (PHOTO recommandé)

- ZIP de la variante **PHOTO** (ou meilleur score JPG).
- Pipeline PC Meshroom existant (inchangé).
- Noter qualité modèle final (1–5).

---

## Critères de décision

| Priorité | Variante si… |
|----------|----------------|
| 1 | Scan fiable comme l’ancienne app **et** export PC OK → **BASE+PC** |
| 2 | Scan très fluide mais qualité depth moyenne → **FAST** |
| 3 | Moins de fantômes derrière murs, scan encore utilisable → **STABLE** |
| 4 | Meilleur ZIP Meshroom (nombre + netteté JPG) → **PHOTO** |
| 5 | Référence « sans PC » → **BASE** |

---

## Commandes utiles

```bat
build_all_scan_variants.bat
```

```bat
adb install -r build-output\variants\3DScan-BASE-PC-debug.apk
adb logcat -s arcore_app:* | findstr VARIANT
```

---

## Après le test

Documenter la variante retenue et les réglages à fusionner dans la branche principale (un seul `applicationId`), sans toucher au site ni au `pc_processor`.
