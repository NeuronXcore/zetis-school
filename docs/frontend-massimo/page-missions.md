# Page Massimo — Missions (parcours mixtes, arbitrage ADR-0017)

## Objectif

Donner à Massimo ses missions du moment via une **navigation par decks** (même
motif visuel qu'ELI5 v2 / Révision) : un **accueil** de disques ronds par matière
+ un disque **« Mission du jour »** (l'élue par l'arbitrage déterministe,
ADR-0017), puis — par matière — la **liste** des missions, puis le **parcours**
d'une mission sous forme de **timeline horizontale**.

Une mission est un **parcours mixte** (ADR-0017 §5) : jamais une activité unique,
toujours un enchaînement typé (découvrir / verbaliser / mini-quiz / reconstruire).
**L'ordre des étapes dépend du type** — voir ADR-0017 §5 *amendé* : ELI5 n'est pas
toujours en tête. La complétion d'une étape exige sa **preuve serveur** (§5) ; la
fin de mission produit un **verdict d'acquisition** découplé de la complétion (§5bis).

Chaque activité s'ouvre **EN MODALE in-page** : Massimo ne quitte jamais
`/missions`, et l'étape se valide **dans la modale** (preuve serveur) — plus de
redirection vers `/eli5` `/quiz` `/mindmaps`, plus de marqueur de retour.

Route : `/missions`.

## Règles UX (CLAUDE.md — interface enfant)

- Vocabulaire des pastilles de type (traduction enfant du `mission_type`) :
  `remediation` → **Renforcer** · `revision` → **Réviser** · `progression` →
  **Découvrir** · `manual` → **Sur mesure**. Jamais de jargon de source.
- **Aucune pastille ne nomme un auteur** (corrigé le 2026-08-02 ; `manual` disait
  « Mission de Papa », et le champ `origin` affichait « 👤 par Papa » / « 🤖 par
  ZETIS »). Les cinq libellés disent ce que Massimo **fait**, jamais qui a produit.
  Le motif est la tenue dans le temps : le contenu scolaire doit atteindre Massimo
  dans la voix de ZETIS, quel que soit son producteur réel, sinon il faudra changer
  l'auteur de son monde le jour où ZETIS produira seul. Papa reste présent ailleurs
  — dans l'agenda co-édité, et dans la maison.
- **Aucune notion de retard** : pas de compteur de retard, pas d'état « en
  retard », pas de rouge. Les badges compteurs comptent les missions
  **disponibles**.
- **Verdict à deux issues, toutes deux positives** : « ✓ Notion bien en place »
  (vert) / « 🌙 On la reverra bientôt » (indigo doux — une promesse, pas un
  échec atténué ; jamais d'orange/warning). L'XP s'affiche dans les deux cas.
- Sur la timeline, l'**étape courante nomme l'activité** (« ❓ Mini-quiz — ▶ À
  toi de jouer »), jamais un « Continuer » générique ; l'étape suivante =
  « Ensuite », jamais « verrouillée ».
- Icônes de matière : **PNG par slug via `lib/subjectIcons.ts`** (repli emoji
  `subjectEmoji`) — AUCUN mapping emoji local (« ne pas hardcoder les matières »).

## Structure — 3 écrans (navigation par decks)

> Le header global vit dans `MassimoLayout` — pas dans cette page.

1. **Accueil** : `SubjectDeckGrid` (disques ronds par matière, icône PNG + badge
   compteur de missions **disponibles** ; matières sans mission = disque
   « à jour ✓ » atténué, non cliquable) précédé d'un **disque hero
   « 🎯 Mission du jour »** (→ ouvre directement le parcours de l'élue ;
   `elected: null` → disque « Rien d'obligatoire », inerte). En bas :
   **Terminées aujourd'hui** (cartes verdict + XP) + message ZETIS.
2. **Matière** (clic d'un disque) : la **liste des missions** de la matière
   (cartes : pastille type, durée, XP, **mini-parcours typé**, « n/N faits »).
   L'élue est incluse dans son groupe matière (le disque du jour n'est qu'un
   raccourci).
3. **Mission** (clic d'une carte, ou du disque Mission du jour) : titre, pastille
   `reason` (si élue), chips matière / durée / XP, puis la **timeline
   HORIZONTALE** du parcours — étapes typées : faite ✓ / **courante = bouton
   lumineux cliquable (« ▶ À toi de jouer »), auto-scrollée dans le champ** /
   suivantes « Ensuite ». Clic sur l'étape courante → la **modale** de l'activité.

## Missions croisées (multi-matières) — ~~DIFFÉRÉES~~ **LIVRÉES**

> 🔴 **Ce paragraphe a dit le faux jusqu'au 2026-08-14 `[0057]`.** Il annonçait *« le modèle
> `Mission` est mono-matière (un seul `subject_id`) »* et *« non implémentées »* — deux
> affirmations démenties par le dépôt : `Mission.subject_id` est **nullable** depuis l'ADR-0017
> §5ter, et les croisées `champion` sont **livrées** par l'ADR-0022.

Une mission `champion` porte `subject_id` **et** `skill_id` à `NULL` : ses notions vivent sur ses
**étapes** (`MissionStep.skill_id`), sur au moins deux matières. Elle a son **propre deck 🏆** sur
l'écran 1, et n'entre **jamais** dans un groupe matière — `useMissions` l'extrait avant le
regroupement, et ne la compte pas non plus dans les matières « à jour ».

⚠️ **Elle est servie avec `subject: ""`** — un repli qui passe pour une valeur. Invisible tant que
le deck 🏆 ne le lit pas (il affiche « Plusieurs matières »), mais à corriger le jour où une
surface le lira. Signalé par l'`adr-0057` addendum §5, non traité.

## Écran 2 — matière → chapitre + recherche `[0057]`

La liste d'une matière est **rangée par chapitre**, et un champ de recherche la filtre.

🔴 **Le chapitre d'une mission n'existe pas : il se DÉRIVE.** C'est ce qui distingue cette page des
quatre autres du motif — elles rangent des **leçons**, qui portent exactement un `chapter_id` ; une
mission range une **notion**, et `Skill` n'a aucun chapitre. La chaîne est
`Skill → LessonSkill → Lesson(validated) → Chapter`, et elle peut rendre zéro, un, ou plusieurs
chapitres.

- **une seule** → ce chapitre (90 % des missions, mesuré) ;
- **zéro ou plusieurs** → **« Sans chapitre »**, rendu en dernier. 🔴 **On n'en choisit JAMAIS un
  parmi plusieurs** : « Priorités opératoires » est enseignée en Fractions *et* en Nombres
  relatifs — la ranger sous la première afficherait du faux sous une apparence de certitude.
- **Rien n'est persisté** : aucune colonne, aucune migration. Une notion change de chapitres dès
  que Papa valide une leçon.

⚠️ **La recherche traverse les matières** (`adr-0057` §9(3)) : depuis les Maths, « participe »
ramène les missions de Français, sous un en-tête d'étagère qui **nomme leur matière** — sans quoi
un résultat s'afficherait sans dire d'où il vient. Hors recherche, l'en-tête est masqué : l'écran
nomme déjà la matière.

## Wireframe

```txt
ACCUEIL                          MATIÈRE (clic disque)        MISSION (clic carte)
┌──────────────────────────┐    ┌───────────────────────┐   ┌───────────────────────┐
│ 🎯 Mes missions          │    │ ← Matières   🌿 SVT   │   │ ← Retour              │
│      (   🎯   )          │    │ ┌───────────────────┐ │   │ Progresser : Magnitude│
│   Mission du jour        │    │ │ Magnitude         │ │   │ 💡 …prochaine étape   │
│   ┌────┐ ┌────┐ ┌────┐   │    │ │ Découvrir ⏱16 +50 │ │   │ 🌿 SVT · ⏱16 · +50 XP │
│   │📖 6│ │➗ 8│ │🌿 3│   │    │ │ ✓ ✓ 🗺  2/3 faits │ │   │ LE PARCOURS           │
│   └────┘ └────┘ └────┘   │    │ └───────────────────┘ │   │ [✓]─[✓]─[🗺 ▶ À toi]  │
│   Espagnol  à jour ✓     │    │ … autres missions …   │   │  clic 🗺 → MODALE     │
│ ✨ Terminées aujourd'hui │    └───────────────────────┘   └───────────────────────┘
└──────────────────────────┘
```

## Timeline / mini-parcours (étapes typées)

Vocabulaire visuel des `step_type` — le même sur la timeline (écran mission) et
le mini-parcours des cartes (écran matière) :

| `step_type`     | Icône | Libellé enfant        | Preuve serveur (§5)                  |
|-----------------|-------|-----------------------|--------------------------------------|
| `lesson`        | 📘    | Lire                  | consultation                          |
| `eli5`          | 💡    | Découvrir             | consultation                          |
| `vocal_explain` | 🎙    | Verbaliser            | score reverse retourné                |
| `quiz`          | ❓    | Mini-quiz             | `QuizAttempt` (`context=mission`)     |
| `mindmap`       | 🗺    | Reconstruire          | `MindmapAttempt` scorée (ADR-0016)    |

Étape prouvée = ✓. Le front **affiche l'ordre servi** (`sort_order`) et n'ouvre
que l'**étape courante** (les preuves se produisent dans l'ordre, garde serveur).

## Modales d'activité (in-page)

- Brique **`components/ActivityModal.tsx`** : grande modale (scroll interne,
  Escape / clic backdrop / ✕, **confirm-on-close** si l'activité est en cours,
  `prefers-reduced-motion`). ⚠️ **Pas de `backdrop-filter`/`transform` sur le
  panneau** — ils créeraient un bloc conteneur pour les descendants
  `position: fixed` (fantôme de drag du mindmap, toast XP d'ELI5), qui se
  décaleraient du viewport.
- Une modale « mission-aware » par type : **`Eli5MissionModal`** (couvre **eli5 +
  vocal_explain** en UNE session ELI5 : valide `eli5` à l'affichage de
  l'explication, `vocal_explain` au retour du reverse, dans l'ordre, stop au 1er
  409), **`QuizMissionModal`** (valide au résumé du quiz), **`MindmapMissionModal`**
  (valide sur l'auto-soumission de la reconstruction). Chacune appelle
  `completeStep` sur le signal de succès et affiche le **verdict inline** +
  « Terminer ✓ » en fin de mission.
- Les UI d'activité sont **partagées** avec leurs pages pleines (`Eli5Session`,
  `QuizRunner`, `MindmapWorkspace` — extraites, zéro duplication).

## Données API (contrat : ADR-0017 §3 et §5/§5bis)

- `GET /api/missions/today` — `{ elected: MissionStudentOut | null, reason,
  reason_code, scoring_version, alternatives }`. `elected: null` → « Aucune mission ».
- `GET /api/missions` — liste `MissionStudentOut` : **jamais** de scores, facteurs
  ni motifs (frontière §3). **Champs d'affichage enfant** : `estimated_minutes`
  (durée estimée, dérivée des étapes, déterministe) + `xp_reward` (XP d'effort,
  constant) — l'XP est le **seul** nombre montré. Regroupement par matière côté
  client (hook) ; l'élue est incluse dans son groupe.
- `POST /api/missions/{id}/start`.
- `POST /api/missions/{id}/steps/{step_id}/complete` — refusé sans preuve (409,
  postérieure au `start`, ordre `sort_order`) ; dernière étape → verdict
  `{ mission_status, verdict: "acquired" | "review_later", xp_awarded }`.
- `GET /api/missions/completed-today` — terminées du jour (verdict + XP), relues
  des `LearningEvent(mission_verdict)` horodatés, **sans aucun score** (frontière §3).
- **Ordre des étapes dépendant du type** (ADR-0017 §5 *amendé*) : `progression` →
  découverte d'abord ; `remediation`/`revision` → **rappel d'abord**. Le front est
  **agnostique** (rend le `sort_order` servi).

## États

- **Accueil** : decks matières + disque Mission du jour + terminées + note ZETIS.
- **Mission** : timeline avec étape courante cliquable ; toutes faites → « 🎉 ».
- **Fin de mission** : mini-victoire (`@zetis/ui`, son doux, `prefers-reduced-motion`)
  + verdict inline (une des deux formulations) + bouton « Terminer ✓ ».
- **Preuve manquante (409)** : message doux **inline dans la modale**, jamais un échec.
- **Chargement / erreur** : Spinner partagé ; message + réessayer.

## Implémentation

- Logique dans **`useMissions`** (aucune logique métier dans le composant) :
  regroupement par matière, `activeActivity`, `openStep` (démarre la mission puis
  ouvre la modale), `onStepDone` (rafraîchit + verdict + célébration),
  `closeActivity`. **Aucun marqueur `sessionStorage`** : la validation vit dans la modale.
- Decks : `SubjectDeckGrid` / `DeckDisc` **partagés** (ELI5 / Révision).
- Icônes matière : `lib/subjectIcons.ts` (repli `subjectEmoji`).
- Thème Massimo (verre/néon, tokens `zetis-*`, primitives glass existantes).

## Hors périmètre V1

- ~~Missions croisées multi-matières~~ (**livrées**, ADR-0022) ; XP par étape (l'XP reste à la
  mission) ; ~~recherche~~ (**livrée** le 2026-08-14, `adr-0057` addendum Missions — écran 2
  uniquement). La page de pilotage Papa est une slice sœur séparée.
- **Reste hors périmètre** : le tri par chapitre sur l'écran 1 (les disques restent des matières),
  le tri par TYPE de mission (⚠️ à reconsidérer en filtre **secondaire** si « Sans chapitre »
  devait grossir), et toute persistance du chapitre dérivé.

## Voir aussi

- `docs/decisions/adr-0017-arbitrage-missions.md` (§5 *amendé* : ordre par type ;
  §5bis verdict ; §3 frontière de schémas).
- `page-accueil.md` (la carte « Mission du jour » de l'Accueil consomme le même
  `GET /missions/today` — même élue, même raison, jamais deux vérités).
