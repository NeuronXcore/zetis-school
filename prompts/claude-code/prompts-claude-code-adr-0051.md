# Prompts Claude Code — chantier ADR-0051 (Papa peut lire un diagnostic)

> **Deux sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code, **après `/slice`**, qui porte la discipline. Le prompt ne porte que le chantier.
>
> ✅ **L'ADR est `Proposé` (2026-08-11), ses six décisions sont GELÉES.** On les **relit**, on ne les
> rouvre pas.
>
> ⚠️ **Quatre décisions viennent du commanditaire**, rendues au cadrage après exposé de leurs
> options et de leur coût : **où l'on lit** (D1), **si lire permet de trancher au même endroit**
> (D2), **ce que montre une question** (D3) et **le rejet partiel** (D4).
>
> 🔴 **Aucune migration.** Ce chantier **lit** un contenu qui existe déjà en base. Si une session en
> vient à proposer une migration, **c'est un blocker, pas une bonne idée**.

---

## Ce que chaque session doit avoir lu

- `docs/decisions/adr-0051-papa-peut-lire-un-diagnostic.md` — les six décisions, et surtout le
  **Constat read-before-code** : trois de ses cinq faits n'étaient écrits nulle part, et deux ont
  changé la conception ;
- `docs/frontend-papa/page-diagnostic.md` — les passages marqués **`[0051]`**, et le tableau
  `[0045]` dont **l'action principale du premier cran est périmée** ;
- `docs/frontend-papa/page-relecture.md` — l'encart `[0051]` ;
- `docs/frontend-papa/mockup/mockup-papa-lire-diagnostic-v1.html` — **ouvre-la dans un navigateur**.
  Le bloc C (les états sans décor) et le volume réel de 40 questions ne se lisent pas dans le HTML.

---

## Protocole commun aux deux sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de « À LIRE AVANT D'ÉCRIRE » avant d'écrire une
   ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. L'ADR-0051 est écrit sur un
   read-before-code et des mesures en base du 2026-08-11 : ce sont des MESURES à cette date, pas
   des lois. Le cadrage de ce chantier s'est déjà trompé UNE fois sur un chiffre central (il
   annonçait 8 questions, il y en a 40) — cherche la deuxième.

3. Stop-on-blocker. Si une lecture contredit l'ADR ou la spec, ARRÊTE-TOI et remonte. N'improvise
   pas. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, route, type et composant.

6. 🔴 LA SURFACE QUE TU CONSTRUIS N'A AUCUN DÉCOR EN BASE DE DEV.
   Au 2026-08-11 : 18 diagnostics, TOUS `validated`. Zéro `pending`, zéro `rejected`. Le cran
   « chez toi · à relire » ne s'affiche pour AUCUN. Tu dois fabriquer ton décor (générer un
   diagnostic, ou basculer un existant en `pending`) et DIRE lequel tu as fabriqué. Conclure
   « ça marche » sur un rail vide est un mode d'échec déjà payé deux fois dans ce dépôt.

7. 🔴 UN VERROU QUI N'ASSERT QU'UNE ABSENCE NE VERROUILLE RIEN.
   Un écran vide satisfait toute assertion négative. `expect(x).not.toBe(...)` passe sur "" et sur
   undefined. Chaque verrou de ce chantier doit asserter une PRÉSENCE à côté de son absence —
   c'est la règle qui a fait survivre les verrous de la session précédente au sabotage
   « la surface disparaît ».

8. Sabotages obligatoires. Pour chaque verrou central, casse le code qu'il prétend tenir et
   VÉRIFIE qu'il rougit. Un verrou vert sur son sabotage est arrivé QUATRE fois dans ce dépôt.
```

---

## SESSION A — backend : la route de lecture

```txt
CHANTIER : ADR-0051, Décision 5 — Papa peut ouvrir un diagnostic non relu, avec les clés,
les explications et les notions visées.

À LIRE AVANT D'ÉCRIRE
- apps/backend/app/modules/diagnostics/service.py  — _quiz_or_404, _servable_quiz_or_404,
  get_quiz_for_taking, set_validation
- apps/backend/app/modules/diagnostics/router.py   — les rôles, route par route (ADR-0043 D2)
- apps/backend/app/modules/diagnostics/schemas.py
- apps/backend/app/modules/quizzes/service.py      — _papa_question_out, get_quiz_papa,
  _mission_quiz_or_404  (la FORME à reprendre, le GATE à ne pas toucher)
- packages/types/src/quiz.ts                       — PapaQuizQuestion, PapaQuizDetail
- apps/backend/app/tests/test_diagnostic_gate.py   — les trois portes du gate élève

CE QU'IL FAUT ÉCRIRE
1. `GET /api/diagnostics/quizzes/{quiz_id}/relecture`, `require_parent`, LECTURE SEULE.
   Résolue par le `_quiz_or_404` QUI EXISTE DÉJÀ — n'écris pas un troisième résolveur.
   Sa docstring dit déjà « C'est le résolveur de PAPA » : elle cesse enfin d'annoncer un usage
   qui n'existait pas. Complète-la, ne la réécris pas.

2. La réponse porte : quiz_id, title, subject, total (le compte de questions), et
   `notions` — une liste de groupes, chacun { skill_id, skill_name, questions }, dans l'ordre de
   `sort_order`. Par question : id, prompt_markdown, choices_json, correct_answer_json,
   explanation_markdown.
   🔴 LE GROUPEMENT EST FAIT SERVEUR (D5). C'est lui qui connaît sort_order ; deux clients n'ont
   pas à en inventer deux.
   ⚠️ `skill_id` est NULLABLE. Le groupe sans notion rend `skill_name = null` — c'est le CLIENT
   qui écrit « — notion non renseignée — ». Ne remplis pas "Notion" côté serveur : c'est ce que
   fait `get_quiz_for_taking`, et ça fait passer un défaut de génération pour une notion.

3. Le schéma Pydantic déclare TOUS les champs. Vérifie la réponse HTTP RÉELLE, pas le retour du
   service : `response_model` filtre en silence, et ce piège a déjà été payé sur `open_gaps`.

4. Les types partagés (`packages/types`) gagnent le contrat. Réutilise la FORME de
   PapaQuizQuestion là où elle colle ; n'invente pas un second vocabulaire pour les mêmes champs.

LES DEUX VERROUS CENTRAUX, et ce qu'ils doivent asserter
- « Papa ouvre ce que Massimo ne voit pas » : sur un diagnostic `pending`, la route de Papa rend
  200 AVEC ses questions ET leurs clés (présence), et les TROIS routes élève rendent toujours 404
  (absence). Les deux moitiés dans le même test — c'est l'absence seule qui ne prouve rien.
- « la clé et l'explication sont là » : au moins une question rend un correct_answer_json non nul
  ET un explanation_markdown non vide.
  SABOTAGE : retire `correct_answer_json` du schéma de sortie. Le test doit rougir.

🔴 HORS PÉRIMÈTRE, ET C'EST UNE DÉCISION (D4)
- N'ÉLARGIS PAS `_mission_quiz_or_404`. Il garde six routes du module quizzes : l'élargir
  ouvrirait regenerate, add_question et delete_quiz aux diagnostics, EN SILENCE.
- NE TOUCHE PAS `_servable_quiz_or_404` ni les trois routes élève. Elles rendent 404, pas 403,
  et c'est écrit (ADR-0043).
- NE POSE PAS le contrôle de type manquant sur `_question_or_404`, même en l'ayant vu. C'est un
  arbitrage à part, consigné au BACKLOG.
- Aucune migration. Aucun champ ajouté à un modèle.
```

---

## SESSION B — Papa : le panneau lit, et tranche

```txt
CHANTIER : ADR-0051, Décisions 1, 1 bis, 2 et 3 — le questionnaire se lit dans le panneau, les
deux verdicts vivent à côté, et le lien de la file cesse de rendre null.

À LIRE AVANT D'ÉCRIRE
- apps/frontend-papa/src/components/diagnostic/PanneauPassation.tsx  — PanneauSansMesure
- apps/frontend-papa/src/components/diagnostic/crans.ts              — actionPrincipale, RETRAIT
- apps/frontend-papa/src/pages/DiagnosticsPapaPage.tsx               — l'amorçage ?subject=,
  l'état local `focus` du bandeau, `retirer()`
- apps/frontend-papa/src/lib/pilotageLinks.ts                        — reviewLink, et le `null`
  daté du diagnostic
- apps/frontend-papa/src/lib/diagnostic.ts                           — validateDiagnostic,
  rejectDiagnostic
- apps/frontend-papa/src/components/quiz/QuizInspectModal.tsx        — pour NE PAS la réutiliser,
  et pour réécrire sa ligne d'en-tête

CE QU'IL FAUT ÉCRIRE
1. Le panneau du cran « chez toi · à relire » porte le questionnaire : les huit notions listées et
   REPLIÉES, chacune dépliable sur ses cinq questions (énoncé · choix · clé marquée · explication).
   🔴 LA NOTION EST L'EN-TÊTE DU GROUPE, jamais une étiquette par question (D3).
   L'explication est marquée « ce que Massimo lira après coup » — on doit savoir QUI la lit.

2. Les deux verdicts sous le questionnaire : « Laisser passer » (principal) et « Refuser ce lot »
   (secondaire, DÉJÀ LIVRÉ — reprends-le, ne le réécris pas, son dialogue de confirmation et sa
   formulation sont verrouillés par un test de doctrine).
   Après un verdict : la ligne change de cran SANS RECHARGEMENT (optimiste), rétablie en cas
   d'échec. Patron : reviewActions / DemandesPage::triageContent.

3. `reviewLink()` rend enfin `/diagnostics?subject=<subject_id>&focus=<quiz_id>` pour un
   diagnostic. Retire le `null` et son commentaire daté — il annonçait ce chantier.

4. `/diagnostics` lit `?focus=<quiz_id>` et AMORCE la sélection du rail dessus.
   🔴 AMORÇAGE, PAS SYNCHRONISATION — même règle que `?subject=`, déjà écrite dans le fichier.
   ⚠️ Un ?focus= illisible, ou qui vise un diagnostic hors année active, ne présélectionne rien et
   NE CASSE RIEN : la sélection par défaut reprend.

5. 🔴 RENOMME l'état local `focus` du bandeau en `filtre` (D1). Le mot `focus` revient au paramètre
   d'URL, qui suit la convention des cinq autres familles. Ce renommage est DANS le périmètre.

6. 🔴 SUPPRIME `actionPrincipale()` de crans.ts (D1 bis) et le lien qu'elle rendait. Elle ne
   servait plus qu'un cas sur trois, et ce cas vient de disparaître. Vérifie qu'aucun test ne
   verrouille encore « /relecture?kind=diagnostic » comme action principale du cran `genere` — s'il
   y en a un, il ne s'AFFAIBLIT pas : il change d'objet.

7. Réécris la ligne d'en-tête de QuizInspectModal.tsx : « c'est le SEUL endroit où la clé et
   l'explication sont visibles » devient faux à cette livraison.

LE VERROU CENTRAL, et ce qu'il doit asserter
- « le panneau montre la clé, l'explication et la notion » : rendu du panneau sur un diagnostic
  `pending`, une notion dépliée → la bonne réponse est marquée (présence), l'explication est
  rendue (présence), le nom de la notion est l'en-tête du groupe (présence).
  SABOTAGE : fais rendre le composant sans les explications. Le test doit rougir.
- « un lot sans question n'offre pas Laisser passer » : le bouton est ABSENT, pas désactivé — et
  « Refuser ce lot » est PRÉSENT dans le même test.

🔴 HORS PÉRIMÈTRE, ET C'EST UNE DÉCISION
- AUCUN geste dans /relecture au-delà de son lien « Voir → » (ADR-0039 §8). Le questionnaire ne
  s'affiche pas dans la file.
- NI Éditer, NI Retirer une question, NI Régénérer (D4). Le verdict porte sur le LOT.
- AUCUN compteur d'avancement, aucun « 3/8 relues », aucune barre (ADR-0039 §7).
- N'EXTRAIS PAS le KeyView de QuizInspectModal : un diagnostic est `mcq` et rien d'autre
  (diagnostics/service.py:203, en dur), les six autres branches seraient mortes.
- Le rail, les trois crans, le bandeau et ses focus : intacts.
```

---

## Les pièges nommés d'avance

| Piège | Pourquoi il se déclenchera |
|---|---|
| 🔴 **Le décor manquant** | 18 diagnostics en dev, **tous `validated`**. Le cran à construire ne s'affiche pour aucun. Une session qui ne fabrique pas son décor vérifiera un écran vide et le rapportera vert. |
| 🔴 **La collision du mot `focus`** | Il désigne le filtre du bandeau **dans le composant** et l'objet visé **dans l'URL**. Deux sens à trois lignes d'écart ; le renommage de l'état local est dans le périmètre, pas une coquetterie. |
| ⚠️ **`response_model` filtre en silence** | Déjà payé sur `open_gaps` : deux clés produites par le service disparaissaient à la sérialisation, sans erreur. Vérifie la réponse HTTP réelle. |
| ⚠️ **`skill_name` replié à `"Notion"`** | `get_quiz_for_taking` le fait déjà. Recopier ce repli ferait passer un défaut de génération pour une notion. Le serveur rend `null` ; le client écrit le texte. |
| ⚠️ **`npx tsc` ne lance pas TypeScript ici** | Seul `tsc -b` le fait, et un `\| head` masque le code de sortie. Les deux pièges se sont représentés le 2026-08-10, à une heure d'intervalle. |
| ⚠️ **Les tests de Massimo ne sont pas typecheckés** | `tsconfig.app.json` les exclut. Ceux de Papa le sont — et `tsc -b` y a attrapé une prop manquante en une seconde. Ce chantier est côté Papa : le filet existe, sers-t'en. |

---

## Ce qui clôt le chantier

1. Les deux sessions livrées, `main` à jour, suites vertes aux trois étages.
2. 🔴 **Relecture visuelle humaine AVANT le merge**, sur le décor fabriqué. Sur les deux derniers
   chantiers, **cinq décisions d'écran sont nées de l'œil du commanditaire et aucune d'un test.**
3. Les trois contrôles de l'ADR (§Suivi) : la ligne de `QuizInspectModal` réécrite,
   `actionPrincipale()` disparue, aucun test ne verrouillant plus l'ancien lien.
4. `/cloture` — `MEMORY.md`, `CHANGELOG.md`, `TROUBLESHOOTING.md`, puis l'étape **4bis** après le
   merge : éteindre l'annonce du chantier là où elle était promise (`BACKLOG.md`, `DECISIONS.md`,
   `MEMORY.md`).
