# ADR-0015 — Fiches de révision (spec fermé « 1 leçon = 1 page », dérivé canonique, validé Papa)

## Statut

Accepté — 2026-07-05

> **Implémentation en file d'attente** (mono-chantier : après le référentiel/backfill, séquencée
> avec les autres dérivés). L'ADR fige la décision ; la page-spec `page-fiches.md` reste à
> écrire/committer avant la session Claude Code.
>
> Consomme `adr-0011-contexte-canonique-partage` : la fiche est un **dérivé** du cours validé
> (`resolve_canonical_context`, gate `status='validated'`). Réutilise le modèle de
> `adr-0007` (contenu = **spec structuré fermé** produit par le LLM, jamais de format libre).
> Sœur de `adr-0016` (mindmaps) : même lignée de dérivés, même frontière Massimo/Papa.

## Contexte

Besoin exprimé : **toute une leçon doit tenir sur une page, comme une fiche, dans un format
sympa** ; Massimo se constitue **un deck de fiches par matière**. Le mockup validé
(`mockup-page-fiches.html`) sert de contrat visuel.

Clarification de vocabulaire, structurante : **une fiche n'est pas une flashcard.**

- **Flashcard** (`SpacedReviewCard`, cf. SRS) : recto/verso question-réponse, granularité
  **notion** (`Skill`), faite pour **se tester** (répétition espacée).
- **Fiche** : synthèse d'**une leçon entière** sur une page, granularité **`Lesson`**, faite
  pour **relire** avant un contrôle.

Les deux sont complémentaires et vivent à des granularités différentes. Tordre
`SpacedReviewCard` pour porter une fiche mélangerait les deux.

Contrainte dure du besoin : **« tient sur une page »**. Un LLM qui génère du markdown libre ne
la respectera jamais de façon fiable.

Contraintes projet : sobriété ; interface Massimo **read-only** ; **contenu servi filtré sur
`validated`** avant d'atteindre Massimo (règle de sécurité, pas préférence d'affichage) ;
séparation stricte Massimo (verre sombre) / Papa (émeraude) ; local-first.

## Décision

### 1. La fiche est un **objet distinct**, granularité `Lesson`

Table nouvelle `fiches`, **pas** d'extension de `SpacedReviewCard`. Une fiche ↔ une leçon.
Le « deck par matière » est une **vue filtrée** (`Fiche → Lesson → Chapter → Subject`) —
**aucune relation nouvelle** à créer.

### 2. La fiche est un **spec structuré fermé**, pas du markdown libre *(garantie du « 1 page »)*

Le LLM ne produit **pas** de prose libre : il remplit un `FicheSpec` (JSON) à **vocabulaire
fermé** et **sections à budget borné**. C'est le budget structurel — pas une consigne dans le
prompt — qui garantit qu'une leçon tient sur une feuille. Le rendu React impose le format
(carte type A5, typographie fixe) ; **l'export impression/PDF devient quasi gratuit**.

Schéma partagé (`packages/types`), **miroir Pydantic** côté backend avec **bornes dures** :

```ts
// packages/types/src/fiche.ts — vocabulaire FERMÉ, chaque section à budget
export interface FicheSpec {
  title: string;         // = titre de la leçon (source canonique)
  subject: string;
  level: string;
  chapter?: string;
  essentiel: string;                                   // 2–3 phrases (borne dure)
  definitions: { terme: string; definition: string }[]; // 0–4
  points_cles: string[];                                // 0–5, phrases courtes
  erreurs_a_eviter: string[];                           // 0–3
  mini_exemple?: string;                                // 0–1
}
```

Pydantic : `max_length` sur chaque liste + garde de longueur sur `essentiel` /
`mini_exemple`. Sortie non conforme → **1 tentative de réparation**, sinon erreur propre.
**Une fiche invalide n'est jamais persistée.** Le vocabulaire s'étend **section par section**
si besoin (comme le `CapsuleSpec` de `adr-0007`), jamais « génère n'importe quoi ».

### 3. Génération = dérivé canonique (conforme `adr-0011` + `CLAUDE.md`)

- Entrée : `resolve_canonical_context(lesson)` → `build_canonical_sections` (cours validé +
  extraits RAG + règle « le cours fait foi »). La fiche **dérive du cours**, pas du RAG brut
  ni de la connaissance du modèle.
- Prompt **versionné** `app/prompts/fiche.py` (v1), few-shot, sortie JSON stricte via
  `LLMProvider.generate(LLMRequest(fmt=FicheSpec.model_json_schema()))`.
- **`FakeLLMProvider`** renvoie un `FicheSpec` déterministe (tests offline).
- **Trace `ai_jobs`** `job_type="fiche_generate"`. Tâche routable vers un modèle plus costaud
  via `LLMProvider` sans changer la boucle locale de Massimo.

### 4. Frontière Massimo / Papa (sécurité)

- **Papa** (émeraude) : page « Fiches », **génération par matière**, aperçu recto (carte),
  validation `pending → validated`. Rien n'atteint Massimo avant `validated`.
- **Massimo** (verre sombre) : viewer **read-only** — deck circulaire par matière (icônes PNG,
  convention ELI5/mindmaps) → liste des fiches → **la fiche**. Contenu **filtré `validated`**
  côté serveur avant livraison. **Jamais mélanger les deux interfaces** (contrainte dure
  `CLAUDE.md` / `SECURITY.md`).

### 5. Rendu & impression — **aucune dépendance nouvelle**

Composant React `frontend-massimo` (carte à sections fixes, `@zetis/ui`). Impression /
PDF via **CSS `@media print` + `window.print()`** — pas de lib. (Un pont vers le rendu
Remotion/PDF avancé n'est **pas** requis : la fiche est statique.)

### 6. Pont fiche → flashcard (SRS), **couplage faible**

Le pied de fiche porte « **Ajouter à mes cartes** » : point d'entrée vers la génération de
`SpacedReviewCard` (SRS). La fiche (relire) et les cartes (se tester) restent des objets
séparés ; on **référence**, on ne fusionne pas.

### 7. Données

Table **`fiches`** : `id`, `lesson_id` (FK `lessons`), `spec_json` (`FicheSpec`),
`validation_status` (`pending` | `validated` | `rejected`), `source`, `program_version`
(anti-contamination, cf. `adr-0009`), timestamps. **Migration Alembic** dédiée. Deck par
matière = jointure `lesson → chapter → subject` (aucune table de plus).

## Alternatives considérées

- **Étendre `SpacedReviewCard`** : granularité (notion vs leçon) et finalité (se tester vs
  relire) différentes → mélange nuisible. → Écarté ; objet distinct.
- **Génération markdown libre** : ne garantit **pas** le « 1 page ». Le schéma fermé à budgets
  est précisément ce qui le garantit (comme `adr-0007`). → Écarté.
- **Réutiliser `CapsuleSpec`** : la capsule est **temporelle** (vidéo/scènes), la fiche est
  **statique** et orientée impression. Médias différents. → Écarté.
- **Fiche générée par Massimo lui-même** *(sous-décision différée)* : pédagogiquement l'acte le
  plus fort (faire sa fiche ≫ la lire), **mais** heurte la règle « seul le contenu validé
  atteint Massimo ». Piste : distinguer **fiches ZETIS** (validées, servies) et **fiches
  personnelles de Massimo** (sa production, statut distinct, pas du « contenu servi »,
  éventuellement relues par Papa). → **Différé** ; à trancher en addendum, conformément à
  « on discutera ensuite ».

## Conséquences

### Positives

- **« 1 leçon = 1 page » garanti par construction** (budgets de sections), pas par un vœu dans
  le prompt ; export impression/PDF quasi gratuit.
- Réutilise le substrat canonique (`adr-0011`) et le patron de spec fermé (`adr-0007`) — zéro
  mécanique nouvelle à inventer ; premier bénéfice concret du substrat partagé.
- Deck par matière = simple vue filtrée ; pont propre vers le SRS ; frontière Massimo/Papa
  respectée.

### Négatives / coûts

- **Nouvelle table `fiches` + migration Alembic** ; nouveau prompt versionné.
- Le modèle local peut produire des fiches pauvres → mitigé par few-shot, **schéma fermé** et
  routage possible vers un modèle plus fort via `LLMProvider`.
- Expressivité bornée par le vocabulaire fermé — assumé, étendu au fil de l'eau.

### Suivi

- **En attente du chantier fiches** (mono-chantier). **Écrire/committer `page-fiches.md`**
  (spec de page : deck → liste → fiche, sections, pied avec badge canonique + pont SRS) **avant**
  la session Claude Code.
- Slices : (A) backend `FicheSpec` + prompt v1 + service de génération + migration `fiches` ;
  (B) frontend Massimo (viewer + impression) ; pilotage Papa (génération + validation).
- **Ajouter la ligne `adr-0015` à l'index `DECISIONS.md`.**
- Ajouter « fiches » à la lignée des dérivés canoniques citée dans `adr-0011`
  (quiz → mindmap → **fiches** → SRS → capsule).
```
