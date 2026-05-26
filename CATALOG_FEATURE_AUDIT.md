# Audit — Catalogue immobilier public (Visitevirtuel)

Date : 2026-05-25  
Projet : site web **Visitevirtuel** dans le monorepo `3dscan` (dossier `web/`)  
Objectif : transformer la home `/` en **catalogue public** de biens, sans casser l’existant (admin, `/visite/[slug]`, uploads GLB/panoramas, hybride, auth, déploiement Docker/VPS).

---

## 1) État actuel (confirmé)

### Modèle Prisma actuel
Fichier : `web/prisma/schema.prisma`

**Enums existants :**
- `PropertyStatus`: `DRAFT`, `PUBLISHED`
- `VisitType`: `MODEL_3D`, `PANORAMA_360`, `HYBRID_3D_360`
- `ModelType`: `GLB`, `GLTF`, `OBJ`, `ZIP`

**Model `Property` (champs existants) :**
- Identité : `id`, `name`, `slug`
- Immobilier (déjà utile catalogue) : `address?`, `city?`, `postalCode?`, `price?`, `description?`, `coverImageUrl?`
- Visite : `modelUrl` (requis), `modelType`, `visitType`, `status` (draft/published)
- Métadonnées : `createdAt`, `updatedAt`
- Hybride : relations `panoramaScenes[]`, `hotspots[]`

**Tables hybride :**
- `PanoramaScene`: `name`, `imageUrl`, `sortOrder`, relation `property`
- `Hotspot`: `label`, `x`, `y`, `z`, `panoramaSceneId?`, relation `property`

### Routes/pages existantes

**Public**
- `/` : landing marketing (actuel) → `web/app/page.tsx`
- `/visite/[slug]` : page visite 3D/360/hybride → `web/app/visite/[slug]/page.tsx`
  - Si `Property.status !== PUBLISHED` : accès **uniquement** si cookie session admin valide (sinon `notFound()`).

**Admin (protégé)**
- `/admin` : dashboard liste propriétés → `web/app/admin/(protected)/page.tsx`
- `/admin/properties/new` → `web/app/admin/(protected)/properties/new/page.tsx`
- `/admin/properties/[id]/edit` → `web/app/admin/(protected)/properties/[id]/edit/page.tsx`
- Layout protégé : `web/app/admin/(protected)/layout.tsx` (utilise `requireAdmin()`).

**API admin**
- `GET/POST /api/admin/properties` → `web/app/api/admin/properties/route.ts`
- `GET/PATCH/DELETE /api/admin/properties/[id]` → `web/app/api/admin/properties/[id]/route.ts`
- `POST /api/admin/upload` (kinds `model|cover|panorama`) → `web/app/api/admin/upload/route.ts`

**API publique (actuelle)**
- `GET /api/properties/[slug]` : ne renvoie que si `status=PUBLISHED` → `web/app/api/properties/[slug]/route.ts`

### Uploads (ne pas casser)
Fichiers : `web/app/api/admin/upload/route.ts`, `web/lib/storage.ts`, `web/lib/validators.ts`

- Upload **cover** : 1 fichier image → écrit dans `web/public/uploads/covers/` → stocke l’URL dans `Property.coverImageUrl`
- Upload **panorama** : 1 image → `web/public/uploads/panoramas/`
- Upload **model** :
  - `.glb/.gltf/.zip` : 1 fichier
  - multi-fichiers réservé à **OBJ** (textures + `.mtl`) → `web/public/uploads/models/{bundleId}/...`

### Middleware (point d’attention)
Fichier : `web/middleware.ts`

- Réécrit les URLs si le host commence par `visite-virtuelle.` vers `/visite/...` (sauf `/`, `/api`, `/_next`, assets).
- Exclut `/api` du matcher (important pour éviter de tronquer les bodies multipart d’upload).

---

## 2) Réponses demandées (PHASE 1)

### 2.1 Quels champs existent déjà (réutilisables catalogue) ?
Dans `Property`, on a déjà :
- **Titre** (peut servir de base) : `name`
- **URL publique stable** : `slug`
- **Prix** : `price?`
- **Localisation** : `city?`, `postalCode?`, `address?`
- **Image de couverture** : `coverImageUrl?` (upload admin déjà en place)
- **Description** : `description?`
- **Badges “type de visite”** : `visitType` (`MODEL_3D` / `PANORAMA_360` / `HYBRID_3D_360`)
- **Brouillon / publié** : `status` (`DRAFT` / `PUBLISHED`) — aujourd’hui utilisé pour l’accès à `/visite/[slug]`
- **Données hybride** : `panoramaScenes[]`, `hotspots[]` (ne pas toucher au schéma de ces tables)

### 2.2 Quels champs doivent être ajoutés ?
Pour répondre au besoin “catalogue public + statut externe Leboncoin” **sans détourner `Property.status`** (qui pilote déjà la visite), il faut ajouter des champs dédiés “catalogue” et “external listing”.

Recommandation : ajouter sur `Property` (comme demandé en PHASE 2) :

**Catalogue**
- `catalogEnabled Boolean @default(false)`
- `catalogStatus CatalogStatus @default(DRAFT)` avec enum :
  - `DRAFT`, `ONLINE`, `EXTERNAL_DOWN`, `HIDDEN`, `SOLD`
- `catalogTitle String?`
- `catalogDescription String?`
- `catalogPrice Int?`
- `catalogCity String?`
- `catalogPostalCode String?`
- `catalogAddress String?` (optionnel si tu veux séparer adresse privée vs adresse publique)
- `catalogSurface Int?`
- `catalogRooms Int?`
- `catalogBedrooms Int?`
- `catalogCoverImageUrl String?`

**Listing externe**
- `externalListingUrl String?`
- `externalListingSource ExternalListingSource?` enum : `LEBONCOIN`, `OTHER`
- `externalListingStatus ExternalListingStatus @default(UNKNOWN)` enum :
  - `UNKNOWN`, `ONLINE`, `OFFLINE`, `CHECK_ERROR`
- `externalLastCheckedAt DateTime?`
- `externalLastStatusCode Int?`
- `externalLastError String?`

**Note importante (cohabitation avec champs existants) :**
- On peut **afficher** le catalogue en fallback sur les champs existants (`name`, `price`, `city`, `postalCode`, `description`, `coverImageUrl`) tant que les champs `catalog*` ne sont pas renseignés.
- Mais **stocker** des champs `catalog*` donne la liberté d’avoir une annonce “portail” différente du contenu visite (et évite de casser l’admin existant).

### 2.3 Quelle page devient le catalogue ?
**La page `/`** (actuellement marketing) devient le **catalogue public**.

Recommandation pour ne pas perdre la valeur business de la landing actuelle :
- Déplacer l’actuelle landing vers une autre route (ex : `/pro`, `/services`, ou `/offre`) lors de l’implémentation (PHASE 4/6), puis garder des CTA “Propriétaire / Agence” sur `/`.

### 2.4 Comment garder `/visite/[slug]` intact ?
Stratégie sûre :
- **Ne pas changer** la logique d’accès actuelle :
  - `status=PUBLISHED` → public
  - `status=DRAFT` → accessible seulement si session admin
- Ajouter le catalogue comme un **chemin parallèle** :
  - `/` → liste des biens filtrés sur `catalogEnabled=true` et `catalogStatus=ONLINE`
  - `/bien/[slug]` (nouvelle page) → détail annonce
  - Bouton “Lancer la visite” → redirige vers `/visite/[slug]`
- Ne pas réutiliser `Property.status` pour “en ligne / vendu / masqué”.
  - `Property.status` reste le “statut de visite”.
  - Le statut “catalogue” est géré par `catalogStatus`.

### 2.5 Comment ajouter le check Leboncoin sans risque ?
Approche prudente, conforme à tes contraintes (pas de scraping, pas de contournement, check léger) :

- **Implémenter une fonction serveur** `checkExternalListing(propertyId)` :
  - Si pas `externalListingUrl` → `externalListingStatus=UNKNOWN`
  - `fetch()` avec `timeout=10s`, suivre redirections
  - Tester `HEAD` puis fallback `GET` si `HEAD` est bloqué
  - Interprétation :
    - `200` → `ONLINE`
    - `404/410` → `OFFLINE`
    - `403`, captcha, timeout, erreur réseau → `CHECK_ERROR` (**ne pas masquer automatiquement**)
  - Toujours remplir :
    - `externalLastCheckedAt`, `externalLastStatusCode`, `externalLastError`, `externalListingStatus`
  - **Ne jamais supprimer** la propriété.

- **Masquage catalogue (règle prudente)** :
  - Si `externalListingStatus=OFFLINE` confirmé → masquer du catalogue (ex : `catalogStatus=EXTERNAL_DOWN` ou `HIDDEN`)
  - Si `CHECK_ERROR` → laisser l’annonce visible mais afficher un warning en admin

- **Exécution** :
  - Route interne sécurisée `POST /api/internal/catalog/check-external-links` avec secret `CATALOG_CHECK_SECRET`
  - Traiter par lots (ex : 20/run), seulement celles non vérifiées depuis 48–72h
  - Cron côté VPS qui appelle l’endpoint tous les 2 jours (pas de cron dans le conteneur, pas de scraping massif)

---

## 3) Impacts techniques (ce qui ne doit pas bouger)

### “Ne pas casser l’admin existant”
Le cœur admin actuel s’appuie sur :
- `PropertyForm` (`web/components/admin/property-form.tsx`)
- Zod schemas (`web/lib/validators.ts`) → `propertySchema` / `propertyUpdateSchema`
- API routes (`web/app/api/admin/properties/...`)

Quand on ajoutera les champs catalogue (PHASE 3), on le fera en **ajoutant** des champs optionnels (sans changer les champs requis existants comme `modelUrl`).

### “Ne pas casser upload GLB / panoramas / hybride”
L’upload est isolé via `kind` et exclu du middleware `/api`.
Le catalogue ne doit pas modifier :
- `POST /api/admin/upload`
- `web/lib/storage.ts`
- les tables `PanoramaScene`, `Hotspot`
- la logique `replaceHybridData(...)`

---

## 4) Checklist de mise en œuvre (pour phases suivantes)

- Ajouter enums Prisma `CatalogStatus`, `ExternalListingSource`, `ExternalListingStatus`
- Migration Prisma (ajouts uniquement, champs nullable + defaults)
- Admin : nouvelle section “Catalogue public” dans la page propriété (sans impacter “Publication” existante)
- Public : `/` devient catalogue, ajout page `/bien/[slug]`, conserver `/visite/[slug]`
- Ajout endpoint interne + secret + documentation cron

