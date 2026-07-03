# Prompt Claude Code — Étape 13-bis : métadonnées de chapitre en `metadata_json` (correctif de contrat, avant Slice B)

> Micro-correctif chirurgical sur la branche `feat/curriculum-lot1`, AVANT tout merge et
> avant la Slice B. Motif : la Slice A sérialise `themes` / `suggested_class` /
> `repartition` dans `Chapter.description` (risque n°2 de ta propre checklist d'étape 13).
> Ce champ doit redevenir du texte humain librement éditable par Papa ; les métadonnées
> structurées doivent être requêtables et consommables par le frontend sans parsing.

---

Lis d'abord, avant toute modification :

1. `docs/decisions/adr-0009-referentiel-programme-scolaire.md` §5 (le « dans la
   description ou `settings_json` » qui a motivé le choix initial — ce correctif tranche
   pour un champ dédié) ;
2. Le code réel livré à l'étape 13 : `app/modules/curriculum/schemas.py`, `service.py`,
   `router.py`, le modèle `Chapter` dans `school.py`, la migration
   `b8c9dae1f2a3_add_curriculum_chapter_fields.py`, et `packages/types/src/curriculum.ts` ;
3. Les tests existants du module (`test_curriculum_service.py`, `test_curriculum_api.py`)
   pour identifier ceux qui assertent sur `description`.

## Travail demandé

### 1. Colonne `chapters.metadata_json`

- Type JSONB, nullable. Contenu : `{"themes": [...], "suggested_class": str | null,
  "repartition": "officielle" | "interpretee" | null, "prompt_version": "v1"}`.
- **Gestion de la migration — procédure stricte** : la branche n'étant pas mergée, on
  vise UNE seule migration pour toute la feature (historique propre). Exécute
  `alembic current` :
  - si `b8c9dae1f2a3` est appliquée sur ta base locale → `alembic downgrade -1`, puis
    **amende le fichier de migration existant** pour y ajouter la colonne, puis
    `alembic upgrade head` ;
  - si elle n'est pas appliquée → amende directement le fichier.
  - Si tu détectes que cette migration a été appliquée AILLEURS que sur la base locale
    de dev (tu ne peux normalement pas le savoir → considère que non), ou si le
    downgrade échoue : ARRÊTE-TOI et propose une migration séparée à la place.
    **Ne réécris jamais une migration potentiellement appliquée ailleurs.**

### 2. Service et schémas

- `service.py` : à la création des chapitres générés, écrire les métadonnées dans
  `metadata_json` ; `description` reçoit UNIQUEMENT le texte descriptif humain produit
  par le LLM (une à deux phrases), sans aucune sérialisation.
- La création manuelle (`POST`) accepte `description` libre et, optionnellement, les
  métadonnées (sinon `metadata_json` reste null).
- Schémas de réponse : exposer `themes`, `suggested_class`, `repartition` comme champs
  de premier niveau (dépliés depuis `metadata_json`) — le frontend ne doit jamais voir
  la structure de stockage.
- `packages/types/src/curriculum.ts` : aligner le contrat (règle CLAUDE.md n°8).

### 3. Tests

- Ajuster les tests qui assertaient sur le contenu sérialisé de `description`.
- **Nouveau test-verrou** : après une génération, `description` ne contient ni `{`,
  ni `themes`, ni `suggested_class` (le bug corrigé ne doit pas pouvoir revenir).
- Test : les champs dépliés apparaissent dans la réponse API ; `metadata_json` null
  (chapitre manuel sans métadonnées) produit des champs null, pas une erreur.

## Hors périmètre strict

Tout le reste : pas de passe 2, pas de frontend, pas de nouveau champ au-delà de
`metadata_json`, pas de refonte du prompt v1 (la sortie LLM ne change pas — seul le
rangement change).

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé : `refactor(curriculum): move chapter metadata to dedicated JSONB field`
(à committer séparément sur `feat/curriculum-lot1`, avant la Slice B).
