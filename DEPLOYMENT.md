# Déploiement — GitHub et VPS

Guide pour publier **ce dépôt source** sur GitHub et coexister avec les autres projets sur le VPS, **sans casser** les services existants.

---

## 1. Prérequis locaux

- Git installé
- Compte GitHub avec accès à `DownPricer/3dscan`
- Vérifier que les gros dossiers sont ignorés (voir `DEPLOYMENT_AUDIT.md`)

Contrôle rapide avant commit :

```powershell
cd "c:\chemin\vers\3DLiveScanner-main"
git status
# Ne doit PAS lister : scanner/app/build, pc_processor/output_gui, build-output
```

---

## 2. Premier push GitHub

```bash
git init
git remote add origin https://github.com/DownPricer/3dscan.git
git add .
git status
git commit -m "Initial deploy-ready version"
git branch -M main
git push -u origin main
```

Si le remote existe déjà :

```bash
git remote set-url origin https://github.com/DownPricer/3dscan.git
```

Authentification : PAT GitHub ou `gh auth login`.

---

## 3. Sur le VPS — clone de **ce** repo (sources)

**Recommandation** : chemin dédié, hors des apps web existantes.

```bash
sudo mkdir -p /var/www/3dscan-src
sudo chown $USER:$USER /var/www/3dscan-src
cd /var/www/3dscan-src
git clone https://github.com/DownPricer/3dscan.git .
```

Usage typique sur VPS :

- sauvegarde / synchronisation du code ;
- future CI ou worker de traitement ;
- **pas** de remplacement du site Next.js.

---

## 4. Site web `scan.siteready.fr` (projet Visitevirtuel)

Le site public est un projet **Next.js séparé** (Prisma, upload GLB). Ce monorepo produit les fichiers `.glb` ; Visitevirtuel les sert.

### Règles de sécurité multi-projets

| Interdit | Autorisé |
|----------|----------|
| Modifier `/etc/nginx/sites-enabled/default` ou configs d’autres sites | Nouveau fichier `scan.siteready.fr` |
| `pm2 delete all` ou réutiliser un nom PM2 existant | `pm2 start` avec nom unique, ex. `siteready-visite` |
| Changer les ports des autres apps | Choisir un port libre (`ss -tlnp` ou `netstat`) |
| Toucher aux bases PostgreSQL/MySQL des autres projets | Base dédiée pour Visitevirtuel uniquement |

### Exemple Nginx (nouveau fichier uniquement)

`/etc/nginx/sites-available/scan.siteready.fr` :

```nginx
server {
    listen 80;
    server_name scan.siteready.fr;

    location / {
        proxy_pass http://127.0.0.1:3015;   # PORT LIBRE — adapter
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activation :

```bash
sudo ln -s /etc/nginx/sites-available/scan.siteready.fr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Certificat TLS : `sudo certbot --nginx -d scan.siteready.fr`

### Exemple PM2 (Visitevirtuel, pas ce repo)

```bash
cd /var/www/visitevirtuel   # chemin du projet Next.js
cp .env.example .env        # puis editer DATABASE_URL, secrets
npm ci
npx prisma migrate deploy
npm run build
pm2 start npm --name "siteready-visite" -- start -- -p 3015
pm2 save
```

Variables typiques : voir `.env.example` du projet Visitevirtuel (`DATABASE_URL`, `UPLOAD_MAX_SIZE_MB`, etc.).

---

## 5. DNS OVH

Dans la zone du domaine `siteready.fr` :

| Type | Sous-domaine | Cible |
|------|--------------|-------|
| A | `scan` | IP publique du VPS |

Propagation : quelques minutes à quelques heures.

---

## 6. Mises à jour

### Code source 3dscan (ce repo)

```bash
cd /var/www/3dscan-src
git pull origin main
```

Aucun redémarrage PM2 requis pour ce seul repo (pas de service web).

### Site Visitevirtuel

```bash
cd /var/www/visitevirtuel
git pull
npm ci
npm run build
pm2 restart siteready-visite
```

---

## 7. Pipeline métier SiteReady

```
[Téléphone] scanner/ APK
     → export ZIP dataset PC
[PC Windows] pc_processor/run_gui.bat + Meshroom
     → site-ready/site_model.glb
[Admin web] Visitevirtuel upload GLB
     → visite publique scan.siteready.fr
```

---

## 8. Dépannage

| Problème | Piste |
|----------|-------|
| Push GitHub échoue (fichier > 100 Mo) | Vérifier `.gitignore`, retirer `output_gui/` ou `build/` du staging |
| `nginx -t` en erreur | Conflit `server_name` — ne pas dupliquer un site existant |
| 502 Bad Gateway | PM2 arrêté ou mauvais port dans `proxy_pass` |
| Site affiche autre projet | Mauvais `server_name` ou symlink Nginx |

---

## 9. Fichiers de référence

- [`DEPLOYMENT_AUDIT.md`](DEPLOYMENT_AUDIT.md) — stack, ports, exclusions Git
- [`.env.example`](.env.example) — variables documentées
- [`SITE_FINAL_MODEL_FORMAT_AUDIT.md`](SITE_FINAL_MODEL_FORMAT_AUDIT.md) — format GLB pour le site
