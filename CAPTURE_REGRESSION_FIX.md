# CAPTURE REGRESSION FIX

## Probleme

La version `3DLiveScanner-capture-quality-debug.apk` a introduit une regression critique :

- rendu tres sombre/noir pendant le scan
- aucun vrai scan integre
- impression que toutes les frames etaient refusees
- la version precedente `workflow-texture-ux-debug` scannait mieux

## Cause exacte

La cause principale etait un rejet de frame trop strict place au mauvais endroit.

Concretement :

1. `common/arcore/service.cc` verifiait `validDepthRatio`, `avgConfidence` et d'autres seuils avant d'appeler `google->GetPointCloud()`.
2. Or ces metriques sont calculees dans `common/arcore/arcore.cc` pendant `UpdateFeaturePoints()`, donc pendant `GetPointCloud()`.
3. Resultat : le code pouvait refuser une frame en se basant sur des valeurs encore a zero ou non mises a jour.
4. Comme la frame etait refusee trop tot, la depth n'etait jamais recalculee proprement.
5. Cela creait une boucle de blocage :
   - frame rejetee
   - depth non mise a jour
   - metriques toujours mauvaises
   - frame suivante rejetee

Cette regression etait encore aggravee par :

- Raw Depth trop present en `Normal`
- seuils trop stricts pour `cameraSpeed`, `angularSpeed`, `tracking_recovering`
- confidence map utilisee de facon trop bloquante

## Rollback / correction appliquee

## 1. Normal et Fast redeviennent permissifs

`Fast` et `Normal` reviennent sur un comportement depth classique par defaut.

Effet :

- plus de capture bloquee a cause de Raw Depth
- comportement plus proche de la version qui scannait
- meilleure robustesse immediate sur telephone

## 2. Raw Depth reste reserve aux profils plus stricts

Raw Depth reste possible pour :

- `High quality`
- `Real estate HD`

Mais :

- il n'est plus obligatoire en `Normal`
- il peut retomber automatiquement vers la depth classique

## 3. Confidence map non bloquante

Si la confidence map est :

- absente
- vide
- trop faible
- ou peu exploitable

alors :

- le probleme est loggue
- la capture continue
- un fallback depth classique peut etre active
- la frame n'est pas condamnee juste a cause de la confidence

## 4. Mode compatibilite de securite

Un fallback immediat a ete ajoute :

si trop de frames sont rejetees ou si aucune frame n'est acceptee pendant un certain temps :

- le mode compatibilite s'active
- la capture revient sur un chemin plus permissif
- un message utilisateur est affiche :
  - `Capture difficile, mode compatibilite active`

Objectif :

- ne jamais rester bloque avec zero frame integree

## 5. Filtres stricts limites

Les filtres stricts restent surtout pour :

- `High quality`
- `Real estate HD`

Et meme la :

- ils sont plus moderes
- ils peuvent etre contournes par le mode compatibilite si besoin

## Ce qui reste active

- logs `[CAPTURE]` utiles
- warnings non bloquants
- fallback couleur neutre au lieu du noir dans `common/tango/retango.cc`
- support Raw Depth la ou il est utile

## Ce qui a ete desactive ou assoupli

- rejet strict sur `validDepthRatio` avant calcul du frame courant
- rejet strict sur `avgConfidence` en `Normal`
- Raw Depth de fait actif en `Normal`
- temporisation trop dure apres reprise du tracking
- seuils de vitesse trop severes en `Normal`

## Fichiers modifies pour le fix

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`
- `common/arcore/service.cc`
- `common/arcore/service.h`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`

## Comment verifier que le scan fonctionne a nouveau

1. installer `build-output/3DLiveScanner-capture-rollback-fix-debug.apk`
2. lancer un scan simple en `Normal`
3. verifier qu'il y a des frames acceptees
4. verifier qu'un volume commence a se reconstruire
5. verifier qu'on n'a plus un ecran noir vide
6. verifier dans Logcat :
   - `[CAPTURE] frameAccepted=true`
   - `[CAPTURE] acceptedFrames=X`
   - `[CAPTURE] usingClassicDepth=true` en `Normal`
7. seulement ensuite tester `Real estate HD`

## Conclusion

La regression venait bien d'une logique de rejet trop stricte et placee trop tot dans le pipeline. Le correctif remet `Normal` sur un comportement robuste, garde les logs utiles, et rend les chemins plus stricts non bloquants grace au fallback compatibilite.
