# Base Scan Restore Test Plan

## Objectif

Verifier que le moteur de scan restaure se comporte comme l'application de base originale, sans les regressions recentes de capture, tout en conservant :

- `Analyser maintenant`
- `Exporter pour PC`
- ZIP dataset partageable

## Regles de comparaison

Pour chaque test, comparer avec le comportement degrade observe avant restauration.

Points a noter a chaque fois :

- tracking stable ?
- saut gauche/droite ?
- profondeur derriere mur ?
- trous visibles ?
- qualite visuelle globale ?
- temps d'analyse telephone ?
- ZIP PC cree ?

## Tests

### 1. Petit objet colore

Scene :

- objet avec texture visible
- bonne lumiere
- distance courte

A verifier :

- acquisition rapide
- pas de sauts
- maillage coherent
- textures correctes en mode `Analyser maintenant`

### 2. Angle de piece

Scene :

- coin de mur avec profondeur nette

A verifier :

- pas de geometrie fantome derriere les murs
- coin propre
- tracking stable pendant le balayage lent

### 3. Mur + meuble

Scene :

- mur plan avec meuble devant

A verifier :

- separation correcte entre premier plan et arriere-plan
- pas d'inversion de profondeur
- peu de trous autour du meuble

### 4. Scan court

Scene :

- capture de quelques secondes seulement

A verifier :

- sauvegarde sans erreur
- `Analyser maintenant` termine correctement
- modele final visualisable sur telephone

### 5. Scan piece simple

Scene :

- petite piece ou zone simple d'interieur

A verifier :

- pas de mouvement "qui saute"
- suivi stable en rotation lente
- comportement proche de l'app originale

### 6. Sauvegarder sur telephone

Flux :

1. lancer un scan
2. cliquer sauvegarder
3. choisir `Analyser maintenant`

A verifier :

- pipeline telephone lance
- analyse images telephone
- creation texture telephone
- modele final telephone genere

### 7. Exporter pour PC

Flux :

1. lancer un scan
2. cliquer sauvegarder
3. choisir `Exporter pour PC`

A verifier :

- pas d'analyse images telephone
- pas de texturing telephone
- dataset brut sauvegarde
- `metadata.json` present
- ZIP cree dans `Android/data/.../files/pc-datasets/` ou equivalent
- partage ZIP disponible

## Resultat attendu

Le build est valide si :

- le scan retrouve un comportement proche de la base originale
- les regressions "saute / mauvaise profondeur / scan piece inutilisable" disparaissent ou diminuent nettement
- `Analyser maintenant` conserve le pipeline telephone original
- `Exporter pour PC` reste non intrusif pour la capture
