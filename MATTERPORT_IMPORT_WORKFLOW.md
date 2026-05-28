# Workflow d’import Matterport (site Visitevirtuel)

Ce document explique comment publier une visite Matterport dans le site (`web/`), sans casser les modes existants (GLB/OBJ, 360, hybride).

## 1) Option recommandée — Lien Matterport / iframe

Pourquoi c’est recommandé :

- conserve l’expérience native Matterport (dollhouse, plan, navigation, tags, transitions)
- aucune extraction serveur à maintenir
- compatible immédiatement

### Étapes admin

1. Aller sur `/admin/login`, puis créer/éditer une propriété.
2. Dans **Type de visite**, choisir **Matterport**.
3. Dans la section **Visite Matterport**, coller :
   - soit une URL Matterport (ex. `https://my.matterport.com/show/?m=...`)
   - soit un code iframe `<iframe ... src="https://...">`
4. Vérifier la **prévisualisation**.
5. Cliquer sur **Enregistrer** puis **Publier**.

### Test public

- `/visite/[slug]` doit afficher l’iframe Matterport en plein écran responsive.
- `/bien/[slug]` doit afficher le badge **Matterport** et le bouton de visite.
- Catalogue `/` : badge **Matterport** sur la carte du bien.

## 2) Option fichier — MatterPak OBJ (si disponible)

Quand l’utiliser :

- quand vous avez un export OBJ + MTL + textures (souvent appelé “MatterPak”)
- si vous voulez un affichage “modèle 3D” dans le viewer existant (Three.js)

### Étapes admin

1. Créer/éditer la propriété.
2. Choisir **Matterport**.
3. **Enregistrer** une première fois (pour obtenir un ID).
4. Dans **Importer un ZIP Matterport / MatterPak**, envoyer le ZIP.
5. Le serveur extrait dans `/uploads/matterport/<propertyId>/<bundleId>/` et tente de détecter :
   - `.obj` + `.mtl` + textures référencées (`map_Kd`)
6. Si tout est OK : statut import **READY** et la visite affiche le modèle OBJ.

### Cas d’erreur

- Si le `.mtl` est absent ou non détectable : statut **UNSUPPORTED**.
- Si une texture référencée dans le `.mtl` est manquante : l’import est refusé avec :
  - “Textures manquantes dans le ZIP Matterport.”

## 3) Formats non directement affichables (E57 / XYZ)

Si le ZIP ne contient que des formats point cloud / CAD :

- le site **ne prétend pas l’afficher**
- l’import est marqué **UNSUPPORTED**
- message : “Ce ZIP Matterport contient un format non directement affichable. Utilisez un lien Matterport ou un export OBJ/GLB.”

Conversion future possible (hors scope) : E57/XYZ → maillage → GLB.

## 4) Sécurité de l’import ZIP

Règles appliquées :

- anti path traversal (`../`, chemins absolus, etc.)
- extraction uniquement d’extensions autorisées :
  - `.obj .mtl .jpg .jpeg .png .glb .gltf .bin .json .e57 .xyz .pdf`
- pas d’exécution, pas de `.html`/`.js` servis depuis le ZIP
- limite de taille basée sur `UPLOAD_MAX_SIZE_MB`

## 5) Plan de test (checklist)

- [ ] Coller lien Matterport public → iframe visible
- [ ] Coller embed Matterport → iframe visible
- [ ] Upload ZIP MatterPak OBJ complet → modèle affiché (OBJ+MTL+textures)
- [ ] Upload ZIP incomplet (textures manquantes) → erreur claire
- [ ] Upload ZIP E57 seul → status UNSUPPORTED, pas de crash
- [ ] Bien Matterport visible dans catalogue
- [ ] `/bien/[slug]` OK
- [ ] `/visite/[slug]` OK
- [ ] GLB/OBJ/hybride existants toujours OK

