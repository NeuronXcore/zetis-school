# Prompt Claude Code — ELI5 v2 (slice B frontend) : refonte page + `SubjectDeckGrid` partagé

> Numérotation : à ajuster. GARDE DE SÉQUENCE : ne lance cette slice QUE si la
> slice A (routes `/api/student/notions/summary` et
> `/api/student/subjects/{slug}/notions`) est mergée — vérifie leur présence dans
> le backend au point 0 ; si absentes, ARRÊTE-TOI et signale-le.

---

Chantier : refonte de l'entrée ELI5 par decks matières — slice B, frontend Massimo
uniquement. Deux livrables : (1) extraction du composant partagé `SubjectDeckGrid`
depuis la page Révision, (2) refonte de la page ELI5 en 3 écrans. Le moteur ELI5
(explain/reverse, badge leçon) ne change pas.

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/frontend-massimo/page-eli5.md` (v2) EN ENTIER — c'est la spec ; le mockup
   validé `mockup-page-eli5-v2.html` est la référence visuelle ;
3. Le CODE réel, sans rien supposer :
   - la page Révision ENTIÈRE (`/revision`) : le rendu des decks circulaires
     (anneau conique, pile de cartes, illustration PNG par slug via
     `import.meta.glob`, repli emoji, badge, état atténué) — c'est LA source de
     l'extraction, pixel pour pixel ;
   - la page ELI5 actuelle + son hook + `lib/eli5.ts` : comment `explain` est
     appelé aujourd'hui (champs réellement envoyés, gestion du `job_id`, badge
     « 📚 D'après ta leçon » livré par le chantier ELI5 v2/ADR-0011) ;
   - le fichier de routes du routeur : chemins RÉELS (n'invente aucune route) ;
   - `packages/types` : les types ajoutés par la slice A (ne les redéclare pas) ;
   - le pattern deep-link de Révision (`/revision?subject=slug`, `replace: true`).

## Point 0 — vérifications (AVANT tout code)

(a) routes slice A présentes dans le backend ; (b) le payload d'`explain` côté
front accepte `skill_id`/`subject_id` — si le client actuel n'envoie pas ces
champs, l'ajout est dans le périmètre, mais signale la forme réelle trouvée.

## Travail demandé

### 1. Extraction `SubjectDeckGrid` (composant partagé Massimo)

- `frontend-massimo/src/components/` (PAS `packages/ui` — style Massimo pur).
- Contrat : `subjects: {slug, name, badge?, hint?, dimmed?}[]`,
  `onSelect(slug)`, slot optionnel de deck spécial en tête de grille (utilisé par
  ELI5 pour « Question libre », par Révision pour les mélanges si sa structure s'y
  prête — sinon les mélanges restent locaux à Révision, signale ton choix).
- Le visuel vient de Révision, à l'identique : **aucune nouvelle couleur, aucune
  classe ad hoc** — tu déplaces du code, tu n'en inventes pas.
- **Migre la page Révision** sur le composant dans la même slice. Parité visuelle
  OBLIGATOIRE : un œil qui compare avant/après ne doit voir AUCUNE différence.
  Si la migration exige de déformer le contrat du composant, préfère un contrat
  plus riche à un fork visuel.

### 2. Page ELI5 — 3 écrans (route `/eli5` inchangée)

- **Écran 1** : deck « ✨ Question libre » en tête (anneau animé, respect
  `prefers-reduced-motion`), grille `SubjectDeckGrid` avec badge = `notion_count`
  (via `GET /api/student/notions/summary`) ; matière à 0 → `dimmed` + hint
  « bientôt ✨ », TOUJOURS cliquable.
- **Écran 2** : chips plates des notions (`GET /api/student/subjects/{slug}/notions`)
  — notion en gras, `chapter_title` en sous-texte ; carte positive si liste vide ;
  champ « Ou pose ta question » toujours présent (placeholder contextualisé).
  Variante « Question libre » : pas de section chips.
- **Écran 3** : la session ELI5 EXISTANTE (ne pas la réécrire) ; le refactor se
  limite au câblage d'entrée : chip → `explain` avec `skill_id` (+ `subject_id`) ;
  question libre → `explain` sans `skill_id`. Le badge leçon existant fait le reste.
- Deep-link `?subject=slug` → ouvre l'écran 2 (`replace: true`, pattern Révision).
- Toute la logique dans un hook dédié (`useEli5Page` ou équivalent aligné sur la
  convention réelle) — aucune logique métier dans les composants.
- Aucun vocabulaire d'atelier à l'écran : « notions », jamais « skills »/« validé ».

### 3. États standard

Loading / erreur douce / vide selon les patterns existants des pages branchées.
Une erreur réseau sur les notions ne bloque JAMAIS la question libre (dégradation :
l'écran 2 s'ouvre avec le champ seul + message doux).

## Tests

Suis la convention de tests front réelle du repo (si les pages branchées n'en ont
pas, signale-le et n'en invente pas un cadre nouveau). Au minimum, vérifie à la
main et rapporte : les 3 écrans, le deep-link, chip → badge leçon présent,
question libre → badge absent, matière vide → parcours question libre, Révision
avant/après identique.

## Hors périmètre strict (ne pas commencer)

- Tout le backend ; toute modification du moteur ELI5/reverse.
- Migration de la page Quiz (elle consommera le composant à sa création).
- Reverse vocal, mindmap, XP, historique, suggestions « à revoir ».

## Si tu es bloqué

La structure des decks de Révision résiste à l'extraction (mélanges trop couplés) →
propose le contrat minimal viable et ARRÊTE-TOI ; le client `explain` a une forme
inattendue → signale avant d'adapter ; une route manque au routeur → n'en crée pas
sans le signaler.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé :
`feat(massimo): ELI5 subject-deck entry + shared SubjectDeckGrid (revision migrated)`
