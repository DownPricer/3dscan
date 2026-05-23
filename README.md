# SiteReady Scan — 3DLiveScanner

Monorepo pour la capture 3D mobile (ARCore) et le traitement PC des scans, dans l’écosystème **SiteReady**.

- Application Android : `scanner/`
- Processeur PC Windows : `pc_processor/`
- Code natif partagé : `common/`, `arcore/`, `arengine/`

Dépôt GitHub : https://github.com/DownPricer/3dscan.git

## Ce que fait le projet

1. **Sur téléphone** — scanner une scène en 3D, sauvegarder, exporter un dataset ZIP pour PC (`BASE+PC`).
2. **Sur PC** — valider le dataset, prévisualiser, lancer Meshroom pour produire un modèle **site-ready** (`site-ready/site_model.glb`).
3. **Sur le site web** — uploader le GLB dans l’admin du projet **Visitevirtuel** (Next.js, déployé séparément sur le VPS).

## Démarrage rapide

### Android (APK debug)

```bat
cd scanner
gradlew.bat assembleDebug
```

Variantes : `build_all_scan_variants.bat` à la racine.

### PC (Windows)

```bat
cd pc_processor
install_dependencies.bat
run_gui.bat
```

Documentation détaillée : [`pc_processor/README.md`](pc_processor/README.md).

## Structure

| Dossier | Description |
|---------|-------------|
| `scanner/` | App Android 3D Live Scanner (SiteReady) |
| `pc_processor/` | GUI Python + pipeline Meshroom / export GLB |
| `common/` | Sources C++ partagées |
| `night_vision/` | Module ToF séparé (héritage upstream) |
| `third_party/` | Bibliothèques tierces |

## Déploiement

- **Audit stack** : [`DEPLOYMENT_AUDIT.md`](DEPLOYMENT_AUDIT.md)
- **Procédure GitHub + VPS** : [`DEPLOYMENT.md`](DEPLOYMENT.md)

> Ce dépôt n’est **pas** une application web. Le domaine `scan.siteready.fr` correspond au site **Visitevirtuel** (Next.js), pas à un `npm start` de ce repo.

## Licence / crédits

Basé sur [3D Live Scanner](https://github.com/lvonasek/3DLiveScanner) (Lubos Vonasek). Voir `third_party/README.md` pour les licences des dépendances.
