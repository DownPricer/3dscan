# Workflow — Visite hybride 3D + 360 Insta360

Guide opérationnel pour publier une propriété avec modèle 3D global et panoramas par pièce.

> **Admin** : l’interface utilise un assistant en étapes. Guide utilisateur : `HYBRID_ADMIN_UX_GUIDE.md` — Audit UX : `UX_HYBRID_ADMIN_AUDIT.md`.

---

## 1. Scanner la maison (3D Live Scanner)

1. Ouvrir l’app **3D Live Scanner** sur Android (ARCore).
2. Scanner toutes les pièces avec un parcours régulier.
3. Exporter le dataset PC (`scan-session-*.zip`) vers le PC.

---

## 2. Générer le modèle 3D (pc_processor)

1. Lancer la GUI Meshroom : `pc_processor` → traitement du ZIP.
2. Récupérer le dossier `site-ready/` :
   - `site_model.glb` (recommandé pour le web)
   - `metadata.json` (validation textures / UV)
3. Optionnel : ouvrir `preview.html` localement pour contrôler le GLB.

> Le `pc_processor` n’est pas modifié par le mode hybride — il continue de produire le GLB global.

---

## 3. Capturer les panoramas Insta360 (par pièce)

1. Dans chaque pièce, placer la caméra au centre ou point de vue représentatif.
2. Capturer en **mode 360°**.
3. Exporter en **JPG équirectangulaire** (ratio 2:1, ex. 5760×2880).

Nommage conseillé : `salon_360.jpg`, `cuisine_360.jpg`, `chambre_360.jpg`.

---

## 4. Créer la visite dans l’admin (assistant)

1. Admin → **Nouvelle propriété** (ou modifier).
2. Renseigner **nom**, adresse, description.

### Étape 1 — Type de visite
Choisir **Hybride 3D + 360**.

### Étape 2 — Modèle 3D
Uploader `site_model.glb` → vérifier **Modèle chargé** → **Enregistrer et continuer**.

### Étape 3 — Pièces 360
- **Ajouter pièces types** (Salon, Cuisine, Chambre, Salle de bain).
- Upload JPG 360 par carte → badge **Image 360 ajoutée**.

### Étape 4 — Placer les pins
1. Cliquer une pièce dans la liste (orange → verte).
2. Cliquer sur le modèle 3D à l’emplacement du pin.
3. Répéter pour chaque pièce.
4. Coordonnées x/y/z : uniquement dans **Coordonnées avancées** si besoin.

### Étape 5 — Prévisualiser
Vérifier navigation 3D, pins, clic → panorama, retour 3D (même rendu que `/visite/{slug}`).

### Étape 6 — Publier
Checklist verte → **Publier la visite** (colonne droite).

---

## 5. Modes non hybrides (inchangés)

| Mode | Étapes assistant |
|------|------------------|
| Modèle 3D seul | Type → Modèle → Publier |
| 360 seul | Type → Modèle → Pièces → Prévisualiser → Publier |

---

## 6. Tester la visite publique

1. Ouvrir `/visite/{slug}`.
2. Vérifier :
   - Vue 3D + pins visibles
   - Clic pin → panorama 360 plein écran
   - Bouton **Retour vue 3D**
   - Liste des pièces

Voir aussi : `HYBRID_HOTSPOT_PLACEMENT_AUDIT.md` (repère `Bounds` + `Center`, marge 1.25).

---

## Récapitulatif des assets

| Asset | Source | Stockage site |
|-------|--------|---------------|
| Modèle 3D global | 3D Live Scanner + Meshroom | `/uploads/models/` |
| Panorama pièce | Insta360 JPG équirect. | `/uploads/panoramas/` |
| Hotspots | Admin (clic mesh → x,y,z + lien scène) | PostgreSQL |

---

## Dépannage

| Problème | Solution |
|----------|----------|
| Pin mal placé | Replacer le pin sur le modèle ; mode avancé x/y/z en dernier recours |
| Panorama noir / déformé | Format équirectangulaire 2:1 |
| Pin sans panorama | Ajouter la photo 360 à la pièce à l’étape 3 |
| Modèle gris (OBJ) | Uploader .obj + .mtl + textures |
| ZIP uploadé | Repasser en .glb pour placer les pins |
| Clic sans pin | Cliquer sur une surface du modèle, pas dans le vide |
