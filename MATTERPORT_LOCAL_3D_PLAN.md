# Plan long terme Matterport local 3D

## Peut-on reconstruire un vrai dollhouse depuis un backup ?

Peut-être, mais ce n'est pas garanti avec les données actuellement exploitées. Le viewer local doit rester présenté comme un mode 360 extrait du backup, pas comme une reconstruction du dollhouse Matterport officiel.

Un vrai dollhouse nécessiterait au minimum des poses de scans fiables, une association stable entre panoramas et positions, et des données de profondeur ou de mesh suffisamment décodées. Aujourd'hui, ces éléments ne sont pas reconstruits de manière fiable.

## Données manquantes aujourd'hui

- Positions de scans fiables : non extraites de façon exploitable aujourd'hui.
- Association panoramas vers positions : non fiable aujourd'hui.
- Profondeur exploitable : non détectée comme donnée décodée.
- Mesh ou dollhouse propriétaire : non détecté dans un format standard exploitable.
- Orientation exacte des panoramas : non reconstruite automatiquement.
- Plan 2D navigable fiable : seulement possible après extraction/validation des positions.

## État actuel acceptable

Le court terme doit rester un viewer local 360 propre :

- panoramas equirectangulaires 2:1 uniquement ;
- groupes cube faces conservés dans l'audit mais non affichés comme vues publiques ;
- navigation entre vues 360 ;
- mini-plan approximatif si un floorplan est détecté ;
- message explicite : mode local 360 extrait du backup ;
- mention explicite : dollhouse 3D non reconstruit.

## Prochaine piste technique

1. Décoder les fichiers `.pb`, `.dam` et `.mmp` sans dépendre de Matterport.
2. Retrouver des positions de scans fiables.
3. Associer chaque panorama 360 à une position et à une orientation.
4. Reconstruire un plan 2D navigable validable par l'admin.
5. Seulement ensuite tenter une reconstruction mesh/3D si des données de profondeur cohérentes sont disponibles.

## Garde-fous produit

Ne pas présenter les faces cube comme des panoramas tant qu'elles ne sont pas assemblées proprement.

Ne pas prétendre reconstruire le dollhouse Matterport tant que les poses, la profondeur et le mesh ne sont pas démontrés.

Ne pas utiliser d'iframe Matterport, ne pas dépendre des services Matterport, et ne pas reverse-engineer l'application Android.
