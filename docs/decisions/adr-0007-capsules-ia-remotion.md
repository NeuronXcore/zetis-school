---
id: "0007"
titre: "Capsules IA : moteur Remotion (capsule = spec typé, Player en Lot 1)"
type: architecture
statut: accepte
date: 2026-07-01
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0007 — Capsules IA : moteur Remotion (capsule = spec typé, Player en Lot 1)

## Statut

Accepté — 2026-07-01

> Précise `adr-0005-capsules-ia-progressives` : 0005 pose la **stratégie** (capsule courte,
> approche progressive script → storyboard → audio → slides → rendu). 0007 tranche le
> **choix technique du moteur** et la façon dont la capsule est générée. 0007 ne remplace
> pas 0005 ; il en est l'implémentation concrète.

## Contexte

Besoin exprimé : Papa donne une **instruction en langage naturel** à ZETIS, une capsule est
**générée**, et Papa doit pouvoir la **modifier pour l'améliorer, la régénérer ou la
supprimer**. Plus tard, Massimo la regarde.

Contraintes du projet :

- La capsule est **écrite par un LLM**, pas par un humain. Le choix du moteur doit d'abord
  optimiser la **fiabilité de génération par le LLM** (qwen2.5 local via `LLMProvider`),
  puis la cohérence visuelle et la sécurité.
- `CLAUDE.md` : IA tracée + prompt versionné + schéma d'entrée/sortie ; validation humaine
  avant tout contenu atteignant l'enfant ; vocabulaire bienveillant ; **prompts jamais dans
  les composants React**.
- `SECURITY.md` : données d'un enfant ; **exécuter du code généré par un LLM = exécution de
  code arbitraire** → à traiter explicitement.
- Séparation stricte Massimo / Papa : génération/pilotage = Papa (`parent`/`admin`).
- Sobriété (`TECH_STACK.md`) ; local-first.
- L'existant est **React/TypeScript partout** (frontends, `@zetis/ui`, `@zetis/auth`) et
  **Python côté backend** (`LLMProvider`, `ai_jobs`, RAG pgvector).

## Décision

### 1. Moteur : Remotion (React) comme moteur **hôte** des capsules

Justification (par ordre d'importance pour ce projet) :

- **Fiabilité de génération LLM** : un LLM produit du React/TypeScript nettement mieux que
  du Manim (volume d'entraînement, pas de piège de versions API), et le **typage TS attrape
  une grande partie des erreurs à la compilation** — avant même le rendu. La boucle
  « génère → vérifie → corrige » sur modèle local en profite directement.
- **Réutilisation** : Remotion est du React → l'identité visuelle ZETIS (glassmorphisme,
  néon, `@zetis/ui`) et les animations SVG/CSS existantes se réutilisent telles quelles.
- **Continuité** : le même composant de composition sert l'aperçu in-browser (Lot 1) **et**
  le rendu MP4 (Lot 2). Rien n'est jeté entre les lots.

### 2. La capsule est un **spec structuré typé**, pas du code généré *(décision de sûreté centrale)*

Le LLM ne produit **pas** de `.tsx`. Il produit un `CapsuleSpec` (JSON) conforme à un
**vocabulaire de scènes fermé**, joué par des composants Remotion **que nous écrivons**.
Conséquence directe : **aucune exécution de code arbitraire** dans la boucle interactive de
Papa (génération / édition / aperçu). C'est ce qui rend le Lot 1 sûr par construction.

Schéma partagé (`packages/types`), avec **miroir Pydantic** côté backend et **validation
stricte** de la sortie LLM :

```ts
// packages/types/src/capsule.ts — vocabulaire FERMÉ (chaque kind = un composant fixe)
export type CapsuleScene =
  | { kind: "title";      title: string; subtitle?: string;                         durationInFrames: number }
  | { kind: "bullet";     heading: string; points: string[];                         durationInFrames: number }
  | { kind: "definition"; term: string; body: string; example?: string;             durationInFrames: number }
  | { kind: "numberline"; min: number; max: number;
      marks: { value: number; label?: string; color?: string }[];                    durationInFrames: number };

export interface CapsuleSpec {
  title: string; subject: string; skill?: string; level: string;
  fps: number; width: number; height: number;
  scenes: CapsuleScene[];
}
```

- « Générer » = le LLM remplit un `CapsuleSpec`. « Améliorer » = muter le spec (textes,
  ajout/retrait/réordonnancement de scènes) **ou** réinstruire et régénérer. « Supprimer » =
  supprimer la ligne.
- Sortie LLM non conforme au schéma → **1 tentative de correction**, sinon erreur propre.
  **Un spec invalide n'est jamais persisté.**
- Le vocabulaire s'**étend scène par scène** : ajouter un `kind` = ajouter un composant
  Remotion + sa validation. Jamais « anime n'importe quoi ».

### 3. Découpage en deux lots

**Lot 1 — in-browser, sûr, livrable sans infra de rendu** *(Papa uniquement)* :
génération (LLM → spec, trace `ai_jobs`), **aperçu via `@remotion/player`** (React, dans la
page ; ne rend rien, pas de Chromium), édition / régénération / suppression, validation
Papa (`pending` → `validated`). **Aucun MP4.**

**Lot 2 — rendu** *(ADR déjà couvert ici, prompt séparé)* :
export MP4 via `@remotion/renderer`, **sandboxé et asynchrone dans `worker-media`**,
stockage **MinIO**, endpoint `publish`, **lecture côté Massimo**, **inserts Manim**, et en
option l'édition de `.tsx` brut.

### 4. Manim en **insert spécialisé** (Lot 2), pas en moteur concurrent

Pour les plans strictement mathématiques (droites graduées, transformations de figures,
LaTeX), Manim reste plus expressif. Il est utilisé comme **générateur d'assets** : rendu
Manim → clip MP4 → incrusté via `<OffthreadVideo>` dans la composition Remotion qui porte
l'habillage ZETIS, les titres et l'audio. **Un seul pipeline hôte (Remotion) ; Manim est un
outil d'appoint derrière lui**, pas un second pipeline à maintenir à égalité.

### 5. Pipeline IA (conforme `CLAUDE.md`)

- Prompt **versionné** `app/prompts/capsule.py` (v1), sortie JSON stricte + few-shot.
- Génération via **`LLMProvider`** abstrait ; **`FakeLLMProvider`** renvoie un `CapsuleSpec`
  déterministe pour les tests offline.
- **Trace `ai_jobs`** (`job_type = "capsule_generate"`) à chaque appel (génération et
  régénération).
- La tâche « écrire un spec » peut cibler un modèle plus costaud (cloud) via le même
  `LLMProvider`, sans changer la boucle d'apprentissage quotidienne de Massimo (locale).

### 6. Données

Réutilise la table `capsules` (`DATA_MODEL.md`). Champs Lot 1 : `instruction` (prompt Papa),
`spec_json` (le `CapsuleSpec`), `validation_status` (`pending` | `validated` | `rejected`).
Champs MP4/URL/durée ajoutés au **Lot 2**. **Migration Alembic seulement si** ces colonnes
manquent.

### 7. Sécurité

- **Lot 1** : pas d'exécution de code (spec typé joué par composants fixes) → surface nulle.
- **Lot 2** : le renderer exécute la composition dans un Chromium headless ; et *si* un jour
  le LLM génère du `.tsx`, c'est de l'exécution de code arbitraire. Dans les deux cas, le
  rendu tourne **sandboxé** : conteneur `worker-media` dédié, **sans réseau**, timeout de
  rendu, limites CPU/RAM, système de fichiers isolé — **jamais dans le process backend**.
  Déclarer `licenseKey: "free-license"` au rendu.
- **Papa-only** ; rien n'atteint Massimo avant validation (`pending` → `validated`), comme
  pour le RAG.

### 8. Licence Remotion

Gratuite pour un particulier / une entité ≤ 3 personnes → éligible en l'état. **Versions
épinglées exactes** (pas de `^`). À réévaluer uniquement si ZETIS devient une organisation à
but lucratif de 4 personnes ou plus (licence entreprise, minimum ~100 $/mois).

## Alternatives considérées

- **Manim seul comme moteur** : meilleur pour les maths pures, mais un LLM le génère mal
  (API niche, deux versions incompatibles ManimGL/Community, erreurs visibles seulement au
  rendu), le résultat visuel est étranger à l'identité ZETIS, et Python sort du monde
  frontend. → **Retenu comme insert (§4), pas comme moteur.**
- **Motion Canvas (TypeScript, MIT)** : bon éditeur à preview, mais ce n'est **pas React**
  (aucune réutilisation des composants existants) et un LLM y est moins fiable que sur du
  React standard. → Écarté.
- **Lecteur maison SVG/CSS sans Remotion** : idéal pour une V1 statique, mais **aucun chemin
  propre vers l'export MP4**. Remotion couvre l'in-browser (Player) **et** le rendu
  (renderer) avec **le même composant**. → Écarté au profit de Remotion, qui absorbe ce
  besoin.

## Conséquences

### Positives

- Réutilisation de l'écosystème React et de l'identité ZETIS ; génération LLM plus fiable ;
  le typage TS sert d'auto-vérification.
- **Lot 1 sûr par construction** (zéro exécution de code) et **livrable sans infra de
  rendu**.
- Un seul composant de composition sert l'aperçu (Lot 1) et le rendu (Lot 2).
- Cohérent avec `adr-0005` (stratégie capsules) et la frontière Massimo/Papa.

### Négatives / coûts

- Nouvelle dépendance Remotion ; et au **Lot 2**, une toolchain de rendu lourde (Chromium
  headless + ffmpeg) à héberger et sandboxer dans `worker-media`.
- qwen2.5 local peut sortir des specs pauvres → mitigé par le **vocabulaire fermé**, le
  **few-shot**, et la possibilité de router cette tâche vers un modèle plus fort via
  `LLMProvider`.
- Rendu Remotion plus lourd/lent par image que le rendu Cairo de Manim — **non bloquant** car
  asynchrone dans `worker-media`.
- Expressivité bornée par le vocabulaire de scènes fermé — assumé, étendu au fil de l'eau.

### Suivi

- **Lot 1** (étape à numéroter, **≠ 19/20** réservées à `zetis-clip`) :
  `feat(capsules): Papa AI capsule authoring with Remotion Player`.
- **Lot 2** (étape suivante) : rendu MP4 sandboxé + MinIO + `publish` + lecture Massimo +
  inserts Manim.
- **Mettre à jour l'index de `DECISIONS.md`** : y ajouter la ligne `adr-0006` (manquante) et
  cette ligne `adr-0007`.

## Addendum — 2026-07-01 · sortie structurée `LLMProvider.fmt` (Slice A)

La Slice A backend (schéma `CapsuleSpec` + prompt versionné + service de génération) est
livrée. Un point d'implémentation précise le §5 (« sortie JSON stricte ») :

- **Contrat `LLMProvider` étendu, rétro-compatible.** L'API réelle est
  `generate(request: LLMRequest) -> LLMResponse` (**synchrone**, deux chaînes `system`/`prompt`
  via le dataclass, **pas** de liste de messages multi-tour). On ajoute à `LLMRequest` un champ
  optionnel `fmt: dict | str | None = None`. `OllamaProvider` le mappe sur la clé `format` de
  `/api/generate` : un **JSON Schema** (`CapsuleSpec.model_json_schema()`) ou `"json"`. Défaut
  `None` → comportement historique inchangé (diagnostics, ELI5, RAG). `FakeLLMProvider` ignore
  `fmt` (renvoie un `CapsuleSpec` déterministe quand `fmt` est fourni, pour les tests offline).
- **Trois couches, trois rôles** : few-shot (`app/prompts/capsule.py`, `v1`) = qualité
  pédagogique ; `format` ollama = validité JSON ; `CapsuleSpec.model_validate` (Pydantic,
  `extra="forbid"`) = garantie dure. Une réparation au plus, sinon `CapsuleGenerationError` —
  aucun spec invalide renvoyé ni persisté.
- `build_prompt(instruction, subject, level, skill=None) -> (system, prompt)` intègre le
  few-shot dans la chaîne `prompt` (conforme à l'API réelle).

## Addendum — 2026-07-02 · Lot 1 + Lot 2 livrés, vocabulaire étendu, pilotage enrichi

État réel sur la branche `feat/capsules-ia-remotion`, au-delà de la Slice A ci-dessus.

### Vocabulaire de scènes : 4 → 9 `kind`

Le §2 listait 4 `kind` (title/bullet/definition/numberline). Le vocabulaire fermé en compte
désormais **9** (l'extension « scène par scène » prévue au §2 ; chaque ajout = type
`@zetis/types` + modèle Pydantic + composant Remotion + few-shot + option de formulaire) :
`title`, `bullet`, `definition`, `numberline`, **`barmodel`** (barre de fractions),
**`geometry`** (triangle rectangle / triangle / rectangle, côtés libellés — Pythagore, aires),
**`steps`** (étapes numérotées), **`timeline`** (frise chronologique — Histoire),
**`diagram`** (schéma annoté autour d'un concept central — SVT / physique). Chaque scène porte
en plus `narration` (texte écrit par le LLM) et `audioUrl` (piste TTS remplie par le serveur).
Bornes actualisées : **4 à 9 scènes**, `durationInFrames` 60→900 (la voix pilote la durée),
première scène toujours `title`.

### Lot 1 livré (Papa) — + narration vocale

Génération / CRUD / aperçu `@remotion/player` / validation opérationnels. Ajout de la **voix
Piper** (module `app/modules/tts/`, `TtsProvider` / `PiperProvider`, `POST /{id}/voice`) : TTS
par scène, la durée de chaque scène s'aligne sur sa narration. Trace `ai_jobs` `capsule_voice`.

### Lot 2 livré — rendu MP4 sandboxé (détail dans `docs/ai/capsules-ia.md` §Lot 2)

`worker-media` (Python RQ, process séparé) consomme un job Redis et rend la composition via
`@remotion/renderer` (Chromium headless + ffmpeg, `licenseKey:"free-license"`) ; stockage via
`VideoBackend` (**MinIO** ou disque en dev, `STORAGE_BACKEND`). `POST /{id}/render` (async, 202)
→ `status` `rendering` → `published` (+ `video_url`). **Massimo** : `GET /library` (validées +
rendues uniquement), `GET /{id}/video?token=`, `POST /{id}/view`, `GET /stats`. Inserts Manim
et migration audio→MinIO **toujours différés**.

### Rendu auto à la validation

`service.validate_capsule` : valider une capsule dont la voix est prête **enfile aussitôt** le
rendu MP4 (plus de clic « Rendre » manuel). Un échec d'enfilement (Redis KO) ne casse pas la
validation (retour en `draft`) — la robustesse locale prime.

### Axes de génération (prompt `v1` → `v5`)

`build_prompt(instruction, subject, level, skill, visual, duration, difficulty)`. À la
génération, Papa choisit : le **visuel pédagogique** (auto + 6 scènes ciblées), la **durée**
(courte / moyenne / longue / ≈ 1 min) et la **difficulté** (`facile` / `moyen` / `difficile`,
⭐ / ⭐⭐ / ⭐⭐⭐) — la difficulté pilote strictement le niveau de langue et d'abstraction (badge
côté Massimo).

### Données (complète le §6)

Table `capsules` : + `chapter_id` (FK `chapters` — regroupement matière → chapitre),
`difficulty`, `status` (cycle de rendu), `video_url`. Nouvelle table **`capsule_views`**
(`CapsuleView`, unique `(student, capsule)`, colonne `count`) = visionnages complets de Massimo
(répétitions + « vu / nouvelles » + `view_count` exposé à Papa). Migrations Alembic dédiées.

### Pilotage Papa & lecture Massimo (UI)

- **Papa** : liste **groupée par matière → chapitre** + recherche + icônes de matière ; **modale
  de création** (badge capsule-AI) ; **modale d'édition JSON** brute du spec (revalidée →
  `pending`) ; compteur « vue N fois » ; **barres de progression** live (%) pendant génération /
  voix / rendu.
- **Massimo** : **étagères par matière / chapitre**, badges « Nouveau » + difficulté, compteurs
  (nouvelles / capsules vues), **lecteur MP4 plein écran**, visionnage compté à la fin
  (`onEnded`).
