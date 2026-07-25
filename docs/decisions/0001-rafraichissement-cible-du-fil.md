---
status: "accepted"
date: "2026-07-25"
decision-makers: "tdurouchoux"
---

# Rafraîchir le fil uniquement sur les événements du dossier logbook, avec debounce

## Contexte et énoncé du problème

`LogbookView` rechargeait et réanalysait l'intégralité du dossier logbook sur presque toute activité du coffre, sans debounce ni filtrage sur le dossier : éditer un fichier quelconque, n'importe où dans le coffre, déclenchait un rechargement complet du fil. Une mesure sur un coffre synthétique de 10 000 notes chiffre un rechargement à 20 ms à chaud et 1 936 ms à froid, déclenché deux fois par édition (`vault.modify` puis `metadataCache.changed`). Comment ramener ce coût à un niveau acceptable sans réécrire la couche d'accès au coffre ?

## Options envisagées

* Écouteurs limités au dossier logbook, rafraîchissement debouncé, et signature de carte allégée
* Cache incrémental de notes dans `NoteStore` (`Map<path, LogNote>` avec invalidation par chemin)
* Parallélisation des lectures de fichiers via `Promise.all`

## Résultat de la décision

Option choisie : « Écouteurs limités au dossier logbook, rafraîchissement debouncé, et signature de carte allégée », parce qu'elle s'attaque à la *fréquence* des rechargements — la cause réelle du problème — pour une trentaine de lignes et sans toucher à l'API publique de `NoteStore`, là où le cache incrémental demande une machinerie d'invalidation (renommage, suppression, changement de dossier, instance distincte du serveur MCP) pour un gain qui ne se matérialise qu'une fois la fréquence déjà maîtrisée.

La parallélisation via `Promise.all` est explicitement rejetée : mesurée plus lente que le parcours séquentiel à chaud (25 ms contre 20 ms sur 10 000 notes) et provoquant un `EMFILE` au-delà de 5 000 fichiers à froid.

Le retrait de `note.body` de `cardSignature` accompagne la décision : toute écriture modifiant un corps met déjà à jour `file.stat.mtime`, déjà présent dans la clé, si bien que sérialiser le texte intégral de chaque carte à chaque rendu ne fait que dupliquer un signal existant (52 ms contre 8 ms sur 10 000 cartes rendues).

### Conséquences

* Bien, parce que l'activité hors du dossier logbook ne coûte plus rien, et qu'une rafale d'événements (synchronisation, sauvegarde automatique) se résout en un seul rechargement.
* Bien, parce que le filtrage par dossier a forcé la correction d'un bug latent : une note déplacée *hors* du dossier ne déclenchait aucun rafraîchissement, sa carte restant affichée indéfiniment — masqué jusqu'ici par les écouteurs non filtrés.
* Mal, parce qu'une modification externe met jusqu'à 300 ms à apparaître dans le fil.
* Neutre, parce que le coût d'un rechargement reste linéaire en nombre de notes ; si un profilage sur un coffre réel le justifie, le cache incrémental reste ouvert — sous sa forme mesurée la plus efficace, celle qui conserve le tableau assemblé et n'y remplace que l'entrée modifiée (0,11 ms contre 3,3 ms pour une simple `Map` reconstruisant le tableau).
