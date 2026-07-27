# Prompt Claude Code — UI Papa · Rattrapage skills-only (frontend pur)

Travaille uniquement sur l'UI Papa du rattrapage « skills-only » (ADR-0010),
dans `apps/frontend-papa`. **Frontend pur** : le backend est livré et en prod
(endpoints `POST /api/curriculum/skills-backfill/generate|confirm`) — aucun
endpoint, schéma Pydantic ou migration ne doit être créé ou modifié. Aucune
modification du frontend Massimo.

## À lire AVANT d'écrire la moindre ligne de code

1. `docs/frontend-papa/page-programme-skills-backfill.md` — la maquette validée,
   source de vérité UX de cette slice.
2. `packages/types/src/curriculum.ts` — les 6 interfaces `SkillsBackfill*`
   déjà exportées par `@zetis/types` sont le **contrat** : ne redéclare aucun
   type, importe-les. Note les formes exactes (`groups[].scaffold_chapter`,
   `groups[].notions`, `failed_scaffolds`, `{ created, existing }`).
3. La page Programme existante (`apps/frontend-papa/src/pages/…Programme…`) :
   structure réelle du header (boutons `Générer` / `Ajouter`), comment la pill
   matière fournit `subject_id`, et le style des **chips éditables** des notions
   de leçon (à réutiliser tel quel).
4. Le pattern de progression des capsules : `useEstimatedProgress` + `ProgressBar`
   (signatures réelles, valeur de cible utilisée).
5. `packages/ui` : `Modal`/`ConfirmDialog`, `Button` (plein/secondaire/tertiaire),
   `Badge`. Thème Papa émeraude.
6. `CLAUDE.md`.

Si un composant attendu n'existe pas (chip éditable réutilisable, `Modal`,
`ConfirmDialog`) : **STOP**, propose son extraction dans `@zetis/ui` et attends
validation — ne code pas une variante locale en douce.

## À implémenter

### 1. Point d'entrée (page Programme)

- Bouton **tertiaire** `🎯 Rattrapage` dans le header, à droite de
  `Générer` / `Ajouter`, actif pour la matière sélectionnée. Il ouvre la modale ;
  la liste des chapitres de l'année active n'est jamais touchée.

### 2. Modale — machine à états (hook `useSkillsBackfill`, logique hors composants)

`idle → level_select → generating → preview → confirming → done | error`

**Étape 1 — Choix du niveau**
- Titre « Rattrapage — {matière} » + badge violet « IA ».
- Texte : « …Aucun chapitre ni cours n'est créé — seules les notions que tu
  confirmes sont ajoutées. »
- Sélecteur des 3 niveaux du cycle 4 (`5e | 4e | 3e`), un seul actif. Le niveau
  de l'année active est **marqué « année en cours », pas désactivé ni masqué**
  (arbitrage validé : l'UI reflète le contrat, le backend accepte les trois).
- Mention « ⓘ ~1 à 3 min (génération cloud, comme les chapitres) ».

**Étape 1b — Génération**
- `POST …/generate` corps `{ subject_id, level }`. Bouton en loading + désactivé,
  `ProgressBar` estimée via `useEstimatedProgress` (même cible que les capsules).
- Fermer la modale pendant/après génération non confirmée = **ConfirmDialog**
  « la proposition sera perdue » (flux stateless : le serveur ne garde rien).

**Étape 2 — Prévisualisation éditable**
- « Relis et ajuste. Rien n'est enregistré tant que tu ne confirmes pas. »
- `failed_scaffolds` non vide → bandeau ambre discret « N sections n'ont pas
  abouti — tu peux confirmer ce qui est proposé, ou régénérer ».
- Un groupe par `scaffold_chapter` : en-tête + tag pointillé
  **« échafaudage · non créé »** (jamais présenté comme un chapitre du référentiel).
- Notions = chips : retirables (×), renommables inline (clic sur le libellé),
  ajout via chip « ＋ ajouter une notion ». Chips vides ou blanches à l'envoi :
  trim + ignorées silencieusement.
- **Doublons inter-groupes : signalés (bordure pointillée + mention « aussi
  dans "…" »), jamais bloqués** (arbitrage validé : l'upsert idempotent les
  fusionne, bloquer mentirait sur la gravité). Comparaison insensible à la casse.
- Compteur live « N notions · M sections », mis à jour à chaque édition.
- `↻ Régénérer` : isolé à gauche, style neutre — seule action destructive de
  l'écran → ConfirmDialog « perdre tes ajustements ? » avant de relancer.
- **Bouton « ✓ Confirmer N notions »** (le compte dans le libellé, arbitrage
  validé), désactivé si N == 0.

**Étape 2b — Confirmation**
- `POST …/confirm` corps `{ subject_id, level, notions: [{ scaffold_chapter,
  name }] }` : le client **aplatit** la prévisualisation revue. Loading court
  (pas de LLM côté serveur).

**Étape 3 — Résultat**
- Depuis `{ created, existing }` : « ✓ X notions ajoutées au référentiel ·
  Y déjà présentes. » + « Le check-up "{matière} · {niveau}" est maintenant
  disponible. » Re-confirmation intégrale → « 0 ajoutée · N déjà présentes »
  affiché comme un succès, pas une erreur.

**État erreur**
- 503 / 502 : afficher le `detail` backend **verbatim** (style mono), l'édition
  en cours est **conservée**, boutons Fermer / Réessayer. Ne reformule pas le
  message : il explique le repli local (ADR-0009 §7).

## Contraintes

- Toute la logique dans `useSkillsBackfill` ; composants de présentation purs.
- Réutilise `@zetis/ui` et le style chips de la page Programme — zéro CSS dupliqué,
  aucune nouvelle dépendance.
- Aucune persistance côté client entre sessions ; l'état vit dans le hook.
- Vocabulaire Papa (analytique) — mais le mot « échafaudage » reste, il est
  pédagogique pour Papa lui-même.

## Tests (Vitest)

- Hook : transitions d'états ; aplatissement du payload confirm (groupes → liste
  `{ scaffold_chapter, name }`) ; chips vides ignorées ; compteur exact après
  retrait/ajout/renommage ; détection de doublon inter-groupes (signalement, pas
  suppression) ; erreur 502 → l'édition est conservée.
- Rendu : tag « échafaudage · non créé » présent sur chaque groupe ; bandeau
  `failed_scaffolds` ; libellé « Confirmer N notions » reflète le compteur ;
  message résultat créées/déjà présentes.
- La suite existante reste verte.

## Hors périmètre strict (ne pas commencer)

- Ancrage RAG des attendus (Slice A-bis, backend).
- Réconciliation skills seed / diagnostics passés (Lot 3).
- `prerequisite_skill_ids`, multi-niveaux, multi-matières.
- Toute modification du backend ou des types partagés (sauf extraction validée
  d'un composant vers `@zetis/ui`).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : `Modal`/`ConfirmDialog` absents de
`@zetis/ui` ; pas de chip éditable réutilisable ; forme réelle des types
`SkillsBackfill*` différente de la maquette ; header Programme structuré
autrement. Dans ces cas : propose l'ajustement minimal et attends validation.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé :
`feat(papa): skills-backfill UI — level picker, editable preview, idempotent confirm`
