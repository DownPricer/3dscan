# Audit de déploiement — 3DLiveScanner / SiteReady Scan

Date : 2026-05-23  
Dépôt cible : https://github.com/DownPricer/3dscan.git  
Domaine envisagé : `scan.siteready.fr`

---

## Stack détectée

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **scanner/** | Android (Gradle 8.1, AGP, NDK, Java 8) | Application mobile ARCore / AREngine — capture 3D, export dataset PC |
| **pc_processor/** | Python 3 + Tkinter GUI | Traitement local Windows : validation dataset, preview, pipeline Meshroom → GLB |
| **common/** | C++ (NDK + outils Linux) | Reconstruction native partagée |
| **night_vision/** | Android (module séparé) | Viewer capteur ToF (hors scope scan SiteReady) |
| **dataset_extractor/**, **dataset_viewer/** | C++ Linux | Outils dev / dataset (optionnels) |

**Ce que ce dépôt n’est pas :**

- Pas de `package.json` → **pas de Next.js, React, Vite ni Express**
- Pas de Prisma ni base de données applicative
- Pas de serveur HTTP de production intégré
- Le site public **Visitevirtuel** (Next.js + Prisma, upload GLB) est un **projet distinct** — voir `SITE_FINAL_MODEL_FORMAT_AUDIT.md`

---

## Commandes

### Développement / build Android

```bat
cd scanner
gradlew.bat assembleDebug
```

Variantes multiples (BASE, BASE+PC, FAST, STABLE, PHOTO) :

```bat
build_all_scan_variants.bat
```

Prérequis : JDK 17+, Android SDK, NDK, chemin court recommandé (`subst X:` sur Windows pour éviter les limites de chemin NDK).

### Processeur PC (Windows)

```bat
cd pc_processor
install_dependencies.bat
run_gui.bat
```

Dépendances Python (`pc_processor/requirements.txt`) : `open3d`, `trimesh`, `numpy`, `OpenEXR`, `Pillow`.

### Preview locale (non production)

```bat
cd pc_processor\output_gui\<run_id>
open_preview.bat
```

→ `python -m http.server 8765` sur **localhost uniquement** (chargement PLY/GLB dans le navigateur).

### Commande « start » production

**Aucune** pour ce dépôt en l’état. Il n’existe pas de `npm start` ni service web à lancer.

Pour servir `scan.siteready.fr`, déployer le projet **Visitevirtuel** (Next.js), pas ce monorepo tel quel.

---

## Port recommandé

| Usage | Port | Notes |
|-------|------|-------|
| Preview PC locale | **8765** | Dev uniquement, `http.server` Python |
| Site public SiteReady | **3000** (défaut Next.js) ou autre | Projet Visitevirtuel — **à isoler** sur le VPS |
| Nginx | 80 / 443 | Reverse proxy vers l’app Next.js |

**Ne pas réutiliser** un port déjà pris par d’autres apps PM2 sur le VPS. Choisir un port libre (ex. `3015`) et le documenter dans un **nouveau** fichier Nginx dédié.

---

## Variables d’environnement

Pas de fichier `.env` applicatif dans ce repo. Variables utiles côté **poste de dev / traitement PC** :

| Variable | Contexte | Obligatoire |
|----------|----------|-------------|
| `MESHROOM_DIR` | Chemin installation Meshroom (Windows/Linux) | Si pipeline photogrammétrie |
| `MESHROOM_HOME` | Alias accepté par le code | Optionnel |
| `JAVA_HOME` | Build Android | Build APK |
| `ANDROID_HOME` | SDK Android | Build APK |
| `LOCALAPPDATA` | Cache MeshroomRuns (Windows) | Automatique |

Voir `.env.example` à la racine (documentation uniquement).

**Sketchfab OAuth** : tokens gérés côté app Android (`sketchfab/OAuth.java`), pas dans le repo.

---

## Dossiers persistants

### À ne **pas** versionner (artefacts locaux)

| Dossier | Taille typique (ce workspace) | Contenu |
|---------|-------------------------------|---------|
| `scanner/app/build/` | ~1,1 Go | APK, dex, intermediates Gradle |
| `pc_processor/output_gui/` | ~1,7 Go | Runs Meshroom, GLB/OBJ, logs |
| `build-output/` | ~940 Mo | APK variants, audits, backups |
| `zip test/` | ~45 Mo | Archives de test |
| `scanner/.gradle/` | variable | Cache Gradle |

### À conserver sur disque (hors Git)

- `pc_processor/output/` — sorties traitement (`.gitkeep` présent)
- `pc_processor/logs/` — journaux
- Datasets Android : sur téléphone (`Android/data/.../pc-datasets/`), pas dans le repo

### Sur VPS (si traitement headless futur)

```
/var/www/3dscan/data/          # uploads datasets (optionnel)
/var/www/3dscan/output/        # sorties GLB site-ready
```

Non requis tant qu’aucun service API n’est ajouté à ce dépôt.

---

## Stockage fichiers

- **Mobile** : scans dans stockage app (`/SiteReady Scan/`, exports ZIP PC)
- **PC** : `pc_processor/output_gui/run_*/site-ready/site_model.glb` → upload manuel vers admin Visitevirtuel
- **Pas d’upload serveur** dans ce monorepo

Format cible site : `.glb` (250 Mo max côté Visitevirtuel).

---

## Dépendances système

### Build Android

- JDK 17+
- Android SDK Platform 33, Build-Tools, NDK
- Gradle wrapper (`scanner/gradlew.bat`)

### PC processor (Windows)

- Python 3.10+
- Meshroom + AliceVision (GPU NVIDIA recommandé)
- Optionnel : CMake pour modules natifs (`pc_processor/native/`)

### VPS (déploiement actuel de **ce** repo)

**Non applicable** pour servir une interface web. Clone Git utile pour :

- sauvegarde source ;
- CI build APK ;
- évolution future d’un worker Linux (Meshroom headless).

Si worker Linux un jour : Python 3, Meshroom, GPU, **sans** PM2 Node pour ce repo en l’état.

---

## Risques de conflit avec autres projets VPS

| Risque | Niveau | Mitigation |
|--------|--------|------------|
| Confondre ce repo avec le site Next.js | **Élevé** | Déployer Visitevirtuel sous un chemin / domaine distinct ; ce repo = sources scan uniquement |
| Écraser config Nginx existante | **Élevé** | Ajouter uniquement `/etc/nginx/sites-available/scan.siteready.fr` + symlink sites-enabled |
| Port PM2 déjà utilisé | **Moyen** | `pm2 list` avant tout `pm2 start` ; nom unique ex. `siteready-scan` |
| Réutiliser port 8765 | **Faible** | Réservé preview locale, ne pas exposer sur VPS |
| Gros clone Git (~4 Go si artefacts inclus) | **Élevé** | `.gitignore` strict (build, output_gui, build-output) |
| Meshroom / GPU sur VPS partagé | **Moyen** | Traitement lourd — préférer poste Windows ou worker dédié |

---

## Synthèse pour `scan.siteready.fr`

1. **GitHub (ce repo)** : versionner le code Android + `pc_processor` + docs — **pas** les builds ni outputs.
2. **VPS (site web)** : déployer le projet **Visitevirtuel** (Next.js) avec Nginx + PM2, port dédié, config Nginx **nouvelle**.
3. **Ce monorepo sur VPS** : optionnel (clone pour backup/CI) ; **ne remplace pas** l’app web.

---

## Checklist avant push GitHub

- [ ] `scanner/app/build/` exclu
- [ ] `pc_processor/output_gui/` exclu
- [ ] `build-output/` exclu
- [ ] `zip test/` exclu
- [ ] Aucun `.env` avec secrets
- [ ] Pas de datasets / GLB de test volumineux
