# Déploiement VPS — SiteReady Scan (Visitevirtuel)

**Repo** : `https://github.com/DownPricer/3dscan.git`  
**Site web** : sous-dossier `web/` (ne pas builder `scanner/` ni `pc_processor/` sur le VPS).

---

## 1. DNS OVH

| Type | Sous-domaine | Cible |
|------|--------------|-------|
| A | `scan` | `51.210.179.212` |

Zone recommandée : `sitereadyshd.fr` → `scan.sitereadyshd.fr`

---

## 2. Première installation

```bash
ssh ubuntu@51.210.179.212

sudo mkdir -p /opt/3dscan/uploads
sudo chown -R ubuntu:ubuntu /opt/3dscan
cd /opt/3dscan

# Monorepo complet (Android + PC + site web)
git clone https://github.com/DownPricer/3dscan.git app

# Compose + env (depuis web/deploy/)
cp app/web/deploy/docker-compose.yml .
cp app/web/deploy/.env.example .env
nano .env   # POSTGRES_PASSWORD, AUTH_SECRET, URLs, admin

mkdir -p uploads
touch uploads/.gitkeep

docker compose up -d --build
```

Attendre que `3dscan-db` soit healthy et `3dscan-front` démarré.

### Seed admin (une fois)

Après le premier `docker compose up -d --build` :

```bash
bash /opt/3dscan/app/web/deploy/seed-on-vps.sh
```

Ce script applique `prisma db push` et crée l’admin défini dans `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

---

## 3. Nginx (downpricer-nginx)

```bash
sudo cp /opt/3dscan/app/web/deploy/nginx-downpricer/scan-siteready.conf \
  /opt/downpricer/nginx/conf.d/scan-siteready.conf

docker network connect 3dscan_default downpricer-nginx 2>/dev/null || true
docker exec downpricer-nginx nginx -t
docker exec downpricer-nginx nginx -s reload
```

Tests :

```bash
curl -I http://127.0.0.1:3015
curl -I -H 'Host: scan.sitereadyshd.fr' http://127.0.0.1/
```

---

## 4. SSL (certbot)

```bash
docker stop downpricer-nginx

sudo docker run --rm -p 80:80 \
  -v /opt/downpricer/nginx/ssl:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d scan.sitereadyshd.fr \
  --email contact@sitereadyshd.fr \
  --agree-tos \
  --no-eff-email

docker start downpricer-nginx
docker network connect 3dscan_default downpricer-nginx 2>/dev/null || true
```

Décommenter le bloc HTTPS dans `scan-siteready.conf`, ajuster les chemins `ssl_certificate*` selon le montage réel dans `downpricer-nginx`, puis `nginx -s reload`.

---

## 5. Mises à jour

```bash
sudo cp /opt/3dscan/app/web/deploy/deploy.sh /opt/3dscan/deploy.sh
sudo chmod +x /opt/3dscan/deploy.sh
/opt/3dscan/deploy.sh
```

---

## 6. Interdictions

- `docker compose down` dans `/opt/vtc` ou stacks globales
- `pm2 delete all`
- Modifier les fichiers Nginx VTC existants
- Utiliser la base VTC pour ce site

---

## 7. Vérifications

- [ ] `curl http://127.0.0.1:3015` → 200
- [ ] `https://scan.sitereadyshd.fr` → landing
- [ ] `/admin/login` → formulaire
- [ ] Upload GLB + panorama
- [ ] `/visite/[slug]` publié
- [ ] Fichiers dans `/opt/3dscan/uploads` conservés après `deploy.sh`
