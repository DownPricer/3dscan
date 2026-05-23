# Audit — site web visite 3D/360 (Visitevirtuel)

Date : 2026-05-23

---

## Dossier exact du site web

Dans le monorepo **3dscan** :

```
web/
```

(Chemin local historique : `VPS Mega BAse/Visitevirutel` — même code, intégré sous `web/`.)

Nom npm : `site-ready-shd`

---

## Repo GitHub

| Question | Réponse |
|----------|---------|
| Repo unique | **`https://github.com/DownPricer/3dscan.git`** |
| Dossier site web dans le repo | **`web/`** (Next.js Visitevirtuel) |
| Dossiers hors déploiement VPS web | `scanner/`, `pc_processor/`, `common/` (non servis par Docker front) |

Sur le VPS : cloner tout le repo, builder uniquement `web/` (voir `web/deploy/`).

---

## Stack détectée

| Couche | Technologie |
|--------|-------------|
| Framework | **Next.js 16** (App Router) |
| UI | React 19, Tailwind 4, Radix |
| Viewer 3D | **React Three Fiber** + drei (`useGLTF`, `OBJLoader`) |
| Viewer 360 | `panorama-viewer.tsx`, visites hybrides |
| ORM | **Prisma 6** |
| Base | **PostgreSQL** (pas SQLite, pas la DB VTC) |
| Auth admin | JWT (`jose`) + `bcryptjs` |
| Uploads | Fichiers locaux `public/uploads/` |

---

## Routes confirmées

| Route | Rôle |
|-------|------|
| `/admin`, `/admin/login` | Back-office |
| `/admin/(protected)/properties/...` | CRUD biens |
| `/api/admin/upload` | Upload GLB / panoramas / couvertures |
| `/visite/[slug]` | Visite publique 3D / 360 / hybride |
| `/` | Landing SiteReady |

Middleware : réécriture `visite-virtuelle.*` → `/visite/*` (voir `middleware.ts`).

---

## Commandes

```bash
# Développement
npm run dev

# Production
npm run build    # prisma generate && next build
npm run start    # next start (port 3000 par défaut)

# Base
npm run db:push
npm run db:seed
```

---

## Variables `.env` nécessaires

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | Oui | PostgreSQL **dédié** (pas VTC) |
| `AUTH_SECRET` | Oui | Secret JWT sessions admin |
| `NEXT_PUBLIC_APP_URL` | Oui | URL publique, ex. `https://scan.sitereadyshd.fr` |
| `NEXT_PUBLIC_VISIT_BASE_URL` | Oui | Ex. `https://scan.sitereadyshd.fr/visite` |
| `UPLOAD_PROVIDER` | Oui | `local` en production VPS |
| `UPLOAD_MAX_SIZE_MB` | Non | Défaut `250` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seed | Premier admin (`npm run db:seed`) |

Voir `.env.example` et `deploy/.env.example` (VPS).

---

## Dossiers uploads persistants

| Chemin conteneur | Chemin hôte VPS | Contenu |
|------------------|-----------------|---------|
| `/app/public/uploads` | `/opt/3dscan/uploads` | `models/`, `panoramas/`, `covers/` |

**Ne pas versionner** : ~351 Mo de fichiers de test en local (déjà dans `.gitignore`).

---

## Domaine recommandé

Les autres services VPS utilisent **`*.sitereadyshd.fr`** (VTC, API, Anthea).

| Option | Recommandation |
|--------|----------------|
| `scan.sitereadyshd.fr` | **Recommandé** (cohérent avec l’existant) |
| `scan.siteready.fr` | Possible si zone DNS `siteready.fr` gérée |

DNS : enregistrement **A** `scan` → `51.210.179.212`

---

## Infrastructure VPS (passation SiteReady)

- Reverse proxy : conteneur **`downpricer-nginx`**
- Configs Nginx hôte : `/opt/downpricer/nginx/conf.d/`
- Certificats : `/opt/downpricer/nginx/ssl` (monté dans le conteneur)
- **Ne pas** installer Nginx sur l’hôte pour ce site
- **Ne pas** toucher `/opt/vtc`, conteneurs VTC, configs Nginx VTC

---

## Déploiement cible

| Élément | Valeur |
|---------|--------|
| Dossier VPS | `/opt/3dscan` |
| Port hôte | `127.0.0.1:3015` → conteneur `:3000` |
| Conteneur app | `3dscan-front` |
| Conteneur DB | `3dscan-db` |
| Réseau Docker | `3dscan_default` |
| Fichier Nginx | `/opt/downpricer/nginx/conf.d/scan-siteready.conf` |

Fichiers prêts : dossier `deploy/` à la racine du projet.

---

## Ce qui n’est pas déployé par ce plan

- `3DLiveScanner` Android (`scanner/`)
- `pc_processor` / Meshroom
- Base de données VTC
- PM2 global / `docker compose down` sur d’autres stacks
