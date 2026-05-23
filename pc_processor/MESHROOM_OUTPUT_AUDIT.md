# Audit sortie Meshroom

Ce fichier est **regenere automatiquement** a chaque lancement Meshroom dans le dossier de sortie du run (`{output_dir}/MESHROOM_OUTPUT_AUDIT.md`).

## Objectif

Documenter si Meshroom a produit un **vrai** modele texturé (OBJ + MTL avec `map_Kd` + images PNG/JPG), et pourquoi un GLB final pourrait rester blanc/gris.

## Criteres « modele texturé valide »

| Critere | Requis |
|--------|--------|
| OBJ avec faces | oui |
| MTL avec `map_Kd` | oui |
| Fichiers texture references existent | oui |
| Pas seulement `Kd 0.64` gris | oui |
| Source dans `work/meshroom_out/` ou cache Meshroom | oui |
| **Exclu** : `model.obj` du dataset Android extrait | oui |

## Fichiers de log

- `logs/meshroom_stdout.log` — sortie complete meshroom_batch
- `logs/meshroom_stderr.log` — erreurs meshroom_batch
- `logs/meshroom_summary.json` — resume machine (texturing trouve, validation, etc.)

## Dossier site-ready/

Le dossier `site-ready/` n'est cree/rempli **que si** la validation texture reussit.

Sinon : message d'erreur GUI + causes possibles (photos, GPU, Texturing echoue, etc.).

## Bug corrige (2026-05-20)

Avant correction, le pipeline pouvait copier `work/extracted/.../model.obj` (mesh gris Android, MTL sans `map_Kd`) vers `site-ready/` en le marquant `textured: true`.

Maintenant : recherche limitee aux sorties Meshroom + validation obligatoire.

## Chemins Windows avec espaces (2026-05-20)

`meshroom_batch.exe` (Meshroom 2025) **casse les arguments** si un chemin contient des espaces (ex. `3D Scan 2.0`), meme avec `subprocess.run([...], shell=False)`.

**Correctif :** workdir temporaire sans espaces `%LOCALAPPDATA%\MeshroomRuns\run_YYYYMMDD_HHMMSS`, puis recopie vers `work/meshroom_out` et `work/meshroom_cache`.

Commande : liste d'arguments `-i`, `-o`, `--cache`, `-p` (jamais de string concaténée). Erreur `unrecognized arguments` detectee dans stderr meme si code sortie 0.
