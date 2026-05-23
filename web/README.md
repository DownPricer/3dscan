# Site Ready SHD

Application web Next.js pour publier des visites virtuelles 3D de biens immobiliers.

## Fonctionnalités

- Landing page premium pour `sitereadyshd.com`
- Admin sécurisé par email/mot de passe
- Création, édition, suppression et publication de propriétés
- Upload local en développement des images et modèles 3D
- Génération automatique de slugs et liens publics
- Page publique `/visite/[slug]`
- Viewer 3D mobile/desktop avec GLB, GLTF, OBJ, plein écran, reset caméra, vue libre et vue du dessus
- Fallback clair pour les ZIP contenant OBJ/MTL/textures

## Installation

```bash
npm install
cp .env.example .env
```

Renseignez ensuite `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

## Base de données

Le projet utilise PostgreSQL avec Prisma.

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Le seed crée ou met à jour le premier admin avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

## Lancement local

```bash
npm run dev
```

- Site public : `http://localhost:3000`
- Admin : `http://localhost:3000/admin/login`
- Visite locale : `http://localhost:3000/visite/nom-de-la-propriete`

## Variables d'environnement

- `DATABASE_URL` : connexion PostgreSQL
- `AUTH_SECRET` : secret long pour signer les sessions admin
- `NEXT_PUBLIC_APP_URL` : URL du domaine principal
- `NEXT_PUBLIC_VISIT_BASE_URL` : base des liens de visite
- `UPLOAD_PROVIDER` : `local` pour le MVP
- `UPLOAD_MAX_SIZE_MB` : limite d'upload configurable
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` : identifiants utilisés par le seed

## Workflow admin

1. Connectez-vous sur `/admin/login`.
2. Cliquez sur “Ajouter une propriété”.
3. Remplissez le nom et les informations du bien.
4. Uploadez le scan 3D, idéalement au format `.glb`.
5. Choisissez `Brouillon` ou `Publié`.
6. Cliquez sur “Créer”.
7. Copiez le lien généré et envoyez-le au client.

## Formats 3D

Le format recommandé est `.glb`.

Pourquoi GLB :

- un seul fichier contenant modèle, matériaux et textures
- affichage fiable avec Three.js
- meilleur choix pour mobile et partage web
- pas besoin d'extraction serveur

Formats pris en charge par le MVP :

- `.glb` : recommandé
- `.gltf` : pris en charge si les ressources référencées sont accessibles
- `.obj` : chargé avec `OBJLoader`, sans pipeline avancé de textures
- `.zip` : accepté à l'upload, mais affichage non activé tant qu'un traitement serveur OBJ/MTL/textures n'est pas branché

Pour les exports “3D Life Scanner”, privilégiez donc GLB dès que possible.

## Stockage fichiers

En développement, les uploads sont stockés dans `public/uploads`.

Pour la production sur Vercel, le stockage local n'est pas persistant. Branchez Supabase Storage ou S3 dans `lib/storage.ts` en conservant le même contrat de retour :

```ts
{
  url: string;
  modelType?: "GLB" | "GLTF" | "OBJ" | "ZIP";
}
```

## Déploiement Vercel

1. Créez une base PostgreSQL accessible par Vercel.
2. Ajoutez les variables d'environnement dans Vercel.
3. Lancez `prisma db push` ou une migration Prisma.
4. Exécutez le seed avec les identifiants admin souhaités.
5. Configurez un stockage distant pour les fichiers 3D.
6. Déployez avec `npm run build`.

## Domaines

Domaine principal :

- `sitereadyshd.com` pointe vers l'application Vercel.
- `NEXT_PUBLIC_APP_URL=https://sitereadyshd.com`

Sous-domaine des visites :

- `visite-virtuelle.sitereadyshd.com` peut pointer vers la même application Vercel.
- Configurez `NEXT_PUBLIC_VISIT_BASE_URL=https://visite-virtuelle.sitereadyshd.com`.

Dans cette configuration, les liens générés prennent la forme :

```text
https://visite-virtuelle.sitereadyshd.com/nom-de-la-propriete
```

Le middleware inclus réécrit automatiquement `https://visite-virtuelle.sitereadyshd.com/:slug` vers `/visite/:slug` pour garder une URL courte côté client.

## Sécurité

- Les routes `/admin/*` sont protégées par middleware.
- Les sessions admin sont signées et stockées dans un cookie `httpOnly`.
- Les extensions uploadées sont vérifiées.
- La taille maximale d'upload est configurable.
- Les données admin ne sont jamais envoyées aux pages publiques.
