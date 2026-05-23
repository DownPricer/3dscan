# Plan de tests — analyse téléphone différée

Pré-requis : build debug installée, permissions caméra / notifications si demandées, espace disque suffisant.

1. **Scanner → Analyser maintenant → modèle prêt**  
   - Lancer un scan, enregistrer, choisir **Analyser maintenant**.  
   - Vérifier la fin du traitement et l’ouverture / disponibilité du modèle comme avant.

2. **Scanner → Analyser plus tard → pas d’analyse immédiate**  
   - Choisir **Analyser plus tard**.  
   - Vérifier qu’aucune phase « analyse des images / textures » ne démarre tout de suite sur le téléphone (seule la sauvegarde du `.dataset` + notification / retour liste).

3. **Fermer / réouvrir l’app → scan en attente visible**  
   - Après **Analyser plus tard**, forcer l’arrêt de l’app puis rouvrir.  
   - Vérifier que le dossier `.dataset` apparaît avec le libellé **En attente d’analyse** (ou équivalent selon la langue).

4. **Analyser depuis la liste**  
   - Sélectionner le scan en attente, appuyer sur **Analyser** (ou appui direct sur la vignette si prévu).  
   - Vérifier les étapes de progression (préparation, analyse des images, validation, scan prêt).  
   - Après succès : statut **Modèle prêt** et ouverture du modèle exporté au prochain appui sur la vignette.

5. **Scan en attente → Exporter PC**  
   - Sélectionner un scan en attente, **Exporter PC**.  
   - Vérifier création du ZIP et message de succès ; optionnel : vérifier que la mention **Export PC** apparaît sur la ligne du scan.

6. **Supprimer un scan en attente**  
   - Supprimer le dossier `.dataset` en attente depuis la liste.  
   - Vérifier qu’il disparaît et que le dossier n’est plus présent sur le stockage.

7. **Erreur dataset manquant / incomplet**  
   - Renommer ou supprimer `state.txt` dans un `.dataset` de test, puis tenter **Analyser**.  
   - Vérifier le message d’erreur explicite (dataset incomplet / introuvable).

8. **Concurrence**  
   - Lancer une analyse puis tenter une seconde opération : message **Une autre opération est déjà en cours** (ou équivalent).

9. **Réessai après échec**  
   - Simuler une annulation pendant le post-traitement d’un scan précédemment « en attente ».  
   - Vérifier que le statut revient à **en attente** et qu’un nouvel essai est possible.
