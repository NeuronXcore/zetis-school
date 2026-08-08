# Prompts Claude Code — chantier ADR-0047 (la page Lacunes permet d'agir)

> **Deux sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code, **après `/slice`**, qui porte la discipline. Le prompt ne porte que le chantier.
>
> ⚠️ **L'ADR est `Proposé` au moment où ce fichier est écrit.** Les sessions ne démarrent
> **qu'après** son acceptation — c'est le prérequis, et `/ouverture` s'arrêtera sinon.
>
> **Aucune migration.** Les deux champs ajoutés au contrat sont **déjà calculés puis jetés** par le
> service. Si une session en vient à proposer une migration, **c'est un blocker, pas une bonne
> idée**.
>
> ⚠️ **Trois décisions viennent du commanditaire, prises pendant le cadrage après exposé de
> l'alternative** : le **grain** (Décision 1), le **périmètre de la 3ᵉ section** (Décision 2) et la
> **résolution de la leçon** (Décision 4). On les **relit**, on ne les rouvre pas.

---

## Ce que chaque session doit avoir lu

- `docs/decisions/adr-0047-la-page-lacunes-permet-d-agir.md` — les 8 décisions, et surtout le
  **Constat read-before-code**, qui dit ce que le `BACKLOG` avait faux ;
- `docs/frontend-papa/page-lacunes.md` — les passages marqués **`[0047]`** ;
- `docs/frontend-papa/mockup/mockup-papa-lacunes-v1.html` — **ouvre-la dans un navigateur**, et
  **regarde-la aussi à 375 px** : l'écran C (l'état réel de la base) et la règle responsive ne se
  lisent pas dans le HTML.

---

## Protocole commun aux deux sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de « À LIRE AVANT D'ÉCRIRE » avant d'écrire une
   ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. L'ADR-0047 est écrit sur un
   read-before-code du 2026-08-09 : ses constats sont des MESURES à cette date, pas des lois. Le
   cadrage précédent (le BACKLOG) s'est trompé QUATRE fois — ce n'est pas un accident de rédaction,
   c'est le taux normal.

3. Stop-on-blocker. Si une lecture contredit l'ADR ou la spec, ARRÊTE-TOI et remonte. N'improvise
   pas. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, route, type et composant.

6. 🔴 PIÈGE DÉJÀ PAYÉ SUR CE SERVICE EXACT — `response_model` FILTRE EN SILENCE.
   L'ADR-0045 a ajouté `source` et `content_state` à ce même `open_gaps` : les deux clés étaient
   produites par le service et DISPARAISSAIENT à la sérialisation, sans erreur, parce que
   `OpenGapOut` ne les déclarait pas. Ce chantier ajoute deux champs au même endroit. Déclare-les
   dans le schéma AVANT de croire qu'ils sont servis, et vérifie la réponse HTTP réelle.

7. 🔴 UN SABOTAGE PEUT ÊTRE VERT SANS QUE LE VERROU SOIT MAUVAIS.
   Si le décor du test ne peut pas atteindre la branche sabotée, le sabotage ne prouve rien.
   Contrôle systématiquement que le remplacement a EU LIEU (le script doit échouer bruyamment
   sinon) et que le décor construit bien le cas visé.

8. HORS PÉRIMÈTRE, ET C'EST FERME. Ne touche pas : les trois titres de section et leurs notes, les
   deux boutons de génération, la ConfirmDialog et ses portées, le filtre par matière, les
   bandeaux de filtre, les deux états vides. Tout cela est livré et tenu par des tests.
```

---

## 🔴 Ce que les données de dev vont te faire croire

**Relevé le 2026-08-09 : les 10 lacunes ouvertes ont TOUTES `has_active_mission`.**

Conséquence pratique, et elle va te gêner aux deux sessions : **les sections « Découvertes, jamais
travaillées » et « Revenues par la révision » ne s'affichent pas** (`if (gaps.length === 0) return
null`). Tu ne verras à l'écran que « Déjà prises en charge ».

**Pour voir les deux autres en vrai, il faut fabriquer le cas** — retirer la mission qui couvre une
notion, ou en créer une lacune neuve. **Fais-le explicitement, dis-le, et remets la base en état.**
Ne conclus pas « la section ne marche pas » : elle est vide, c'est différent.

⚠️ Et ne « corrige » pas ce comportement : une section vide n'est pas affichée **par décision**
(spec, § Structure).

---

## SESSION A — le contrat porte de quoi agir

**Objectif** : `OpenGap` gagne `lesson_id` et `mission_id`. Rien à l'écran ne change encore.

### À LIRE AVANT D'ÉCRIRE

- `apps/backend/app/modules/progress/service.py` — `open_gaps`, `skills_with_active_mission`,
  `active_missions` ;
- `apps/backend/app/modules/content_state.py` — **en entier**, c'est 70 lignes ;
- `apps/backend/app/modules/lesson_resolution.py` — `lessons_by_skill` et ce qu'il rend ;
- `apps/backend/app/modules/progress/router.py` et son **schéma `OpenGapOut`** ;
- `packages/types/src/activity.ts` — l'interface `OpenGap`.

### Ce qu'il faut faire

1. **`lesson_id`** — la leçon visée **suit l'état visé par le geste** (Décision 4) :
   `cours_brouillon` → une leçon en **brouillon** ; `ok` → une leçon **validée**. Départage entre
   candidates de même statut : **la plus récente** (`id` le plus grand). `aucune_lecon` → `null`.

   ⚠️ **`etat_contenu` a déjà les objets `Lesson` en main** et les jette. C'est là que ça se
   calcule, **pas** dans une seconde requête. Décide si la fonction rend un objet plus riche ou une
   seconde structure — mais **une seule passe sur `lessons_by_skill`**.

   🔴 **Une notion porte jusqu'à QUATRE leçons.** Vérifie-le : « Priorités opératoires » en avait
   #151 `draft`, #145 `draft`, #48 `validated`, #23 `validated` au 2026-08-09.

2. **`mission_id`** — `skills_with_active_mission` réduit des `Mission` à un `set[int]`. Rends la
   correspondance `skill_id → mission_id`.

   ⚠️ **Cette fonction est PARTAGÉE** : le dashboard et la vue notion de Progression s'appuient
   dessus, après avoir divergé une fois. Ne change pas ce qu'elle *compte* — ajoute, ne remplace
   pas. Une notion peut être couverte par plusieurs missions : dis dans le code laquelle tu rends,
   et pourquoi.

3. **Le schéma `OpenGapOut` déclare les deux champs.** Voir le point 6 du protocole.

4. **`packages/types/src/activity.ts`** : les deux champs, **et** `content_state` typé en union
   `"ok" | "aucune_lecon" | "cours_brouillon"` — en gardant `string` accepté au bord si le contrat
   ne peut pas garantir l'exhaustivité (Décision 6).

### Verrous attendus

- La leçon rendue pour `cours_brouillon` **est en brouillon** ; celle rendue pour `ok` **est
  validée**. Sabote la règle en inversant les deux : le test doit rougir.
- Une notion à **quatre** leçons rend bien la plus récente du bon statut.
- `aucune_lecon` rend `lesson_id: null`, et **pas** l'absence de clé.
- La réponse **HTTP** porte les deux champs — pas seulement le dict du service.
- `open_gaps` ne fait **pas plus de requêtes qu'avant**. Compte-les.

---

## SESSION B — la ligne devient un geste

**Objectif** : le geste, son motif, le responsive, les deux destinations, et la station ②.

### À LIRE AVANT D'ÉCRIRE

- `apps/frontend-papa/src/pages/LacunesPage.tsx` — **en entier**, y compris `Section` en bas ;
- `apps/frontend-papa/src/hooks/useLacunes.ts` — **en entier** ;
- `apps/frontend-papa/src/pages/LacunesPage.test.tsx` — ce qui est déjà verrouillé ;
- `apps/frontend-papa/src/components/diagnostic/PanneauPassation.tsx` — la station ②, ses trois
  liens (l. 266-277) et `badgeLacune`/`motifLacune` ;
- `apps/frontend-papa/src/pages/QuizPilotagePage.tsx` et `MissionsPage.tsx` — ce qu'elles lisent
  déjà dans l'URL ;
- `apps/frontend-papa/src/pages/CapsulesPilotagePage.tsx` l. 171-180 — **le patron `?skill=`**, il
  existe déjà, ne l'invente pas.

### Ce qu'il faut faire

1. **Le geste de ligne**, table de la Décision 3. `has_active_mission` **testé en premier**.
   La branche par défaut ne rend **aucun** geste (Décision 6) — pas « Relire la leçon ».

2. **Le motif en clair sous la ligne**, comme la station ②.

3. **La règle responsive sous 640 px** (Décision 7). Elle est écrite dans la maquette, avec son
   motif. **Ne la réinvente pas : reprends-la et vérifie-la à 375 px.**

4. **`/quiz?skill=<id>`** — `QuizPilotagePage` ne lit aujourd'hui que `?focus=` et `?subject=`.
   Patron : `CapsulesPilotagePage`.

5. **`/missions?focus=<id>`** — `MissionsPage` ne lit **aucun** paramètre d'URL. Vérifie-le.

6. **La station ② (Décision 8)** — ses deux gestes passent au grain de la notion, et
   « Voir la lacune → » transporte la matière (`/lacunes?subject=<slug>`).

   ⚠️ C'est un **élargissement du périmètre annoncé**, assumé par l'ADR. Trois lignes. Si ça en
   demande trente, **arrête-toi et remonte** : c'est que le constat était faux.

### Verrous attendus

- Chaque état rend **son** geste et **sa** destination — quatre cas, quatre tests.
- Un `content_state` **inconnu** ne rend aucun geste, et la ligne ne plante pas.
- `has_active_mission` **gagne** sur `content_state` : une notion couverte ET `aucune_lecon` rend
  « Voir la mission → ».
- Le geste porte le **bon id** dans son `href` — sabote en passant `skill_id` là où `lesson_id` est
  attendu : les deux étant des entiers, **seul un test qui compare l'URL complète le verra**.
- La station ② ne pointe plus sur `?subject=` pour ses deux premiers gestes.

---

## 🔴 VÉRIFICATION À L'ÉCRAN — OBLIGATOIRE, ET PAR UN HUMAIN

Ce chantier naît d'une **relecture visuelle humaine** (celle de l'`adr-0045`). Le livrer sans en
avoir une contredirait son acte de naissance — c'est exactement ce qui est arrivé à l'`adr-0044`,
dont la relecture a eu lieu **après** le merge et a rendu un correctif.

À regarder, dans cet ordre :

1. **375 px d'abord, desktop ensuite.** Le défaut de ce chantier est un défaut d'écrasement, et il
   ne se voit qu'en petit. La PR #101 a déjà payé ce prix sur la zone C.
2. Les **quatre** gestes, chacun sur une vraie ligne — donc en ayant fabriqué le cas (voir plus
   haut), puis remis la base en état.
3. **Le clic aboutit**, et la page d'arrivée montre **la notion**, pas la matière. C'est tout le
   chantier : un libellé qui promet un grain doit livrer ce grain.
4. La station ②, sur une passation réelle.

⚠️ Le panneau navigateur ne suffit pas pour un clic derrière `RequireAuth` : passer par
`claude-in-chrome` (dette connue, parade écrite).

---

## Après la Session B

`/cloture` : `MEMORY.md`, `TROUBLESHOOTING.md` (section `feat/lacunes-permettent-d-agir`),
`CHANGELOG.md`, et la carte Graphify. Puis **l'humain vérifie, puis committe**.

⚠️ **Et l'étape 4bis après le merge** — dont le geste que le dépôt vient d'apprendre à ses dépens :
**retirer l'annonce « à faire »** partout où ce chantier était promis (`BACKLOG.md`, le statut de
l'ADR, `DECISIONS.md`, `MEMORY.md`). Un chantier livré qui continue de s'annoncer est invisible aux
quatre contrôles, et il a déjà envoyé une session entière re-cadrer du travail fait.
