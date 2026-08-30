# À LIRE EN PREMIER — HANDOFF DÉVELOPPEUR PLÂTRERIE V1.1

## Le chemin simple

1. **10 min — ouvrir `01_REFERENCE_UX.html`** : charger la démo en Notice puis CCTP.

### Maquette HTML originale
Le fichier `V22_3_3_ASSISTANT_PIECES_ECRITES_PLATRERIE.html` est également fourni à la racine du handoff. Il s’agit de la maquette HTML complète courante, avec son nom de version explicite. `01_REFERENCE_UX.html` est une copie canonique du même contenu destinée à servir de référence stable dans le handoff.

2. **15 min — lire `02_RECONSTRUCTION_MAP.md`** : comprendre l’ordre d’exécution des moteurs.
3. **20 min — lire `03_CONTRAT_PRODUIT.md`** : connaître les invariants qui ne peuvent pas être changés.
4. **Coder à partir de `04_LOADABLE_CONTRACTS/`** : ce sont les contrats machine directement chargeables.
5. **Comparer avec `05_RUNTIME_REFERENCE/`** : implémentation Python de référence, autonome et exécutable.
6. **Charger `06_LOADABLE_FIXTURES/`** dans l’application en développement.
7. **Faire passer `07_ACCEPTANCE/run_all_checks.py`**.

Le développeur n’a pas besoin de lire tous les fichiers de `08_RULEBOOK_DETAIL/` avant de commencer. Ils servent lorsqu’il implémente la brique concernée.

## Les 12 briques qui doivent être reproduites

1. état canonique projet/ouvrages ;
2. questionnaire 112 questions / 41 widgets ;
3. moteur d’applicabilité et de complétude ;
4. profil UX CCTP ;
5. profil UX Notice ;
6. conflits + alertes/vigilances de cohérence ;
7. besoin particulier / longue traîne ;
8. projection des réponses vers la requête technique ;
9. moteur technique V20.4 + DCE assessment ;
10. Clause Engine ;
11. renderer CCTP ;
12. renderer Notice.

**Si une de ces briques manque, la reconstruction n’est pas complète.**

## Fichiers directement chargeables

Le dossier `04_LOADABLE_CONTRACTS/` contient les fichiers à importer tels quels : manifest questionnaire, applicabilité, profil Notice, clauses, règles de cohérence, schémas d’état et base SQLite métier.

Le dossier `06_LOADABLE_FIXTURES/` contient des projets JSON déjà remplis : démo, Épron, Coubron et 24 micro-cas de cohérence. Ils servent à tester l’implémentation sans ressaisir manuellement les questionnaires.

## Règle de vérité

En cas de doute :

1. `04_LOADABLE_CONTRACTS/` pour les données/règles machine ;
2. `03_CONTRAT_PRODUIT.md` pour la sémantique ;
3. `02_RECONSTRUCTION_MAP.md` pour l’ordre d’exécution ;
4. `01_REFERENCE_UX.html` pour le comportement UX ;
5. `07_ACCEPTANCE/` pour décider PASS/FAIL ;
6. `05_RUNTIME_REFERENCE/` pour voir l’implémentation qui produit le comportement attendu.

Aucun ancien audit n’a priorité sur ces fichiers.
