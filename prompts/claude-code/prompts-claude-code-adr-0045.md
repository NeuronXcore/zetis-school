# Prompts Claude Code — chantier ADR-0045 (les 4 optimisations du Diagnostic de Papa)

> **Deux sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code, **après `/slice`**, qui porte la discipline. Le prompt ne porte que le chantier.
>
> **Le chantier est petit et entièrement FRONT.** Aucune migration, aucun endpoint, aucun champ
> ajouté au contrat — c'est l'invariant de la **Décision 8** de l'`adr-0045`. Si une session en
> vient à proposer une migration ou une route, **c'est un blocker, pas une bonne idée**.
>
> ✅ **L'ADR est `Accepté` (2026-08-08).** Le prérequis de décision est levé : les sessions peuvent
> démarrer. Les neuf décisions sont **gelées** — on les **relit**, on ne les rouvre pas.
>
> ⚠️ La **Décision 7** (le mot « générées ») est née **à l'écran** pendant le cadrage et n'était
> écrite nulle part avant. Elle n'a donc **aucune antériorité dans le dépôt** : si une lecture la
> contredit, c'est un blocker à remonter, pas un détail à trancher seul.

---

## Ce que chaque session doit avoir lu

- `docs/decisions/adr-0045-la-page-diagnostic-papa-montre-ce-qu-elle-annonce.md` — les 9 décisions ;
- `docs/frontend-papa/page-diagnostic.md` — les passages marqués **`[0045]`** ;
- `docs/frontend-papa/mockup/mockup-papa-diagnostic-v4-optimisations.html` — **ouvre-la dans un
  navigateur, ne la lis pas comme un fichier** : le comportement des focus s'y joue, il ne se lit
  pas dans le HTML.

---

## Protocole commun aux deux sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index du dépôt avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de la liste « À LIRE AVANT D'ÉCRIRE » avant
   d'écrire une ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. L'ADR-0045 a été
   écrit sur un read-before-code du 2026-08-08, sur la page live ET dans le code : ses constats
   sont des MESURES à cette date, pas des lois.

3. Stop-on-blocker. Si une lecture contredit l'ADR ou la spec, ARRÊTE-TOI et remonte la
   contradiction. N'improvise pas une résolution. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, route, type et composant.

6. 🔴 PIÈGE HTML DÉJÀ PAYÉ SUR LA MAQUETTE DE CE CHANTIER — UN BOUTON DANS UN BOUTON.
   La 1ʳᵉ jauge doit être cliquable ET contenir deux pastilles cliquables. Un <button> imbriqué
   dans un <button> est du HTML INVALIDE : le parseur éjecte les enfants hors du parent, et la
   grille se disloque. Vu à l'écran sur la v1 de la maquette.
   → La carte est un <div> ; la zone principale est un <button> ; les pastilles sont ses SŒURS.
   → L'état visuel de la carte se pilote alors par :has(), pas par une classe sur le parent.

7. 🔴 LE CRAN « généré » N'EXISTE PAS EN BASE DE DEV — `a_relire` vaut ZÉRO, les 12 non-passés
   sont TOUS au cran « proposé », et la jauge le masque (segment rendu seulement si > 0).
   → La moitié de l'optimisation ② (« Refuser ce lot ») NE PEUT PAS ÊTRE VUE sans en créer un.
   → Crée-en un avant la vérification à l'écran, et DIS-LE dans la checklist de clôture.
   → C'est exactement le motif par lequel le bandeau Massimo de la PR #79 est parti non vu.

8. ⚠️ Le rail NE SE RE-TRIE JAMAIS. L'ordre vient du serveur (RailPassations.tsx:66-67 : « on ne
   re-trie pas : deux tris pour la même liste finiraient par se contredire »). Un focus FILTRE,
   il ne réordonne pas.

9. ⚠️ Les pastilles de matière filtrent DÉJÀ la même liste. Le focus doit COMPOSER avec elles,
   et leur intersection vide doit être ÉCRITE — pas rendue comme un rail par hasard vide.

10. ⚠️ Tout nouveau type nommé doit être ré-exporté depuis `packages/types/src/index.ts`
    (CLAUDE.md §8). Piège déjà payé sur les cartes SRS.
    → Mais commence par vérifier qu'il en faut un : ce chantier n'en attend AUCUN.

11. ⚠️ `tsc --noEmit` à la racine NE VÉRIFIE RIEN. Seul `tsc -b` compile réellement les projets.

12. ⚠️ Les compteurs d'appels de `vi.fn()` s'ADDITIONNENT entre tests côté front (pas de
    `clearMocks`) : une assertion de comptage est fausse dès le second test du fichier.

13. 🔴 TOUT TEST-VERROU SE VÉRIFIE PAR SABOTAGE. Casse la règle, observe le test rougir, remets.
    Et le sabotage doit être VALIDE — deux conditions, apprises par cinq verrous VERTS sur
    sabotage dans ce dépôt :
      - décor NON DÉGÉNÉRÉ — un verrou posé sur un décor à zéro ne peut rien distinguer ;
      - sabotage MATHÉMATIQUEMENT NON NEUTRE — il doit produire une valeur atteignable
        DIFFÉRENTE, sinon son vert ne prouve rien.

14. 🔴 UN DÉFAUT DE MISE EN PAGE NE SE VERROUILLE PAS PAR UN TEST, et c'est assumé. jsdom n'a pas
    de moteur de rendu. Comparer des chaînes de classes Tailwind serait une TAUTOLOGIE qui casse
    au premier refactor sans jamais voir le défaut. La preuve d'un rendu est une CAPTURE.
    → Ce qui se teste ici : la STRUCTURE (quels éléments, quels textes, quels rôles), jamais
      l'apparence.

15. Checklist de clôture (9 points) :
    fichiers touchés · migrations (AUCUNE attendue — si une migration apparaît, STOP, c'est un
    blocker) · routes nouvelles (AUCUNE attendue — même règle) · requêtes nouvelles · suites de
    tests (backend / Papa / Massimo, avant → après) · tsc -b et vite build · vérifié à l'écran
    (par qui, sur quelles données, et le cran « généré » a-t-il été créé) · docs mis à jour ·
    résidus et dettes assumées.
```

---

## SESSION A — le bandeau devient un instrument

**Optimisations ① et ④.** Les jauges deviennent des focus, et une jauge cesse de compter
« générées » en écrivant « mesurées ».

### À LIRE AVANT D'ÉCRIRE

| Fichier | Pourquoi |
|---|---|
| `apps/frontend-papa/src/components/diagnostic/BandeauInstrument.tsx` | les 4 jauges, le rendu `mur`, et **le libellé fautif ligne 59** |
| `apps/frontend-papa/src/components/diagnostic/RailPassations.tsx` | ce qui va être filtré ; **son commentaire sur le non-re-tri** |
| `apps/frontend-papa/src/pages/DiagnosticsPapaPage.tsx` | où vit l'état de la page, et comment les pastilles de matière filtrent déjà |
| `apps/frontend-papa/src/components/dashboard/KpiFocusCard.tsx` | le **principe** repris — pas le composant (alternative (a) de l'ADR) |
| `apps/backend/app/modules/diagnostics/service.py` **:1012-1075** | ce que chaque jauge compte **vraiment** |
| `packages/types/src/diagnostic.ts` | `DiagnosticJauges`, `DiagnosticRailEntry`, `DiagnosticSubjectRef` |

### CE QU'IL FAUT FAIRE

1. **La 1ʳᵉ jauge écrit « jamais générées »** (Décision 7). Un mot. Vérifie au passage qu'aucune
   autre surface ne porte la même confusion.
2. **Les jauges 1 et 2 deviennent actionnables**, la 3ᵉ porte deux liens nommés, la 4ᵉ **reste
   inerte et le dit** (mention `inerte`).
3. **Les deux sous-populations du détail de la 1ʳᵉ jauge deviennent des pastilles** (Décision 2) —
   `proposes` et `jamais-generees`.
4. **Le focus filtre le rail** et affiche un **bandeau nommé** avec sa sortie (Décision 3).
5. **Le focus `non-mesurees`** montre les matières sans aucune passation : celles jamais générées
   **et** celles générées jamais passées. C'est ce qui rend la Décision 7 vérifiable à l'œil.
6. **La jauge 2 sélectionne** la passation qu'elle désigne — elle n'en désigne qu'une.

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**`matieres_mesurees` et `jamais_generees` ne sont pas complémentaires**, et tout le chantier tient
à ne pas les confondre une seconde fois :

- `mesurees` = matières ayant **au moins une tentative** (`service.py:1013`) ;
- `jamais_generees` = matières **sans aucun quiz** (`service.py:1058`) ;
- **entre les deux** vivent les matières **générées, proposées, jamais passées** — invisibles des
  deux compteurs.

Le focus `non-mesurees` doit contenir **les deux dernières catégories**. S'il ne montre que
`jamais_generees`, il redit la pastille voisine et l'addition ne se ferme toujours pas.

⚠️ **Le serveur ne sert pas « non mesurée » comme un champ.** Il faut le dériver côté client depuis
le rail et `subjects[].a_un_diagnostic`. **Vérifie que `a_un_diagnostic` dit bien « a un quiz » et
non « a une mesure »** avant de t'en servir — c'est la même confusion, un cran plus bas.

### TEST-VERROU CENTRAL DE LA SESSION

**« Le focus des matières non mesurées contient une matière qui a un diagnostic proposé. »**

Décor **non dégénéré** exigé : au moins une matière jamais générée, **une matière générée jamais
passée**, et une matière mesurée. Sans les trois, le verrou ne distingue rien.

**Sabotage à jouer** : fais retourner au focus les seules matières `jamais_generees`. Le test doit
**rougir**. S'il reste vert, c'est que le décor n'a pas la matière du milieu — refais le décor.

### DEUX AUTRES VERROUS, PLUS COURTS

- **La 4ᵉ jauge n'est jamais un bouton et ne pose aucun focus.** Sabotage : rends-la actionnable.
- **Un focus actif affiche toujours son bandeau nommé.** Sabotage : filtre sans afficher le
  bandeau — le test doit rougir. C'est le verrou de « filtre nommé, jamais troncature ».

### HORS PÉRIMÈTRE DE LA SESSION A

Les libellés des crans · les actions des panneaux (Session B) · le bloc « Jamais généré » qui reste
en lignes inertes · le N+1 de `GET /quizzes` · toute migration, toute route.

---

## SESSION B — les crans non passés

**Optimisations ③ et ②.** L'acteur est nommé, et chaque cran non passé porte deux actions.

> ⚠️ **Après la Session A**, pas en parallèle : les deux sessions touchent `RailPassations.tsx`.

### À LIRE AVANT D'ÉCRIRE

| Fichier | Pourquoi |
|---|---|
| `apps/frontend-papa/src/components/diagnostic/RailPassations.tsx` **:15-19, :119-137, :163-167** | `CRAN_TEXTE`, le rendu de droite, la légende |
| `apps/frontend-papa/src/components/diagnostic/PanneauPassation.tsx` **:37-74** | `PanneauSansMesure` et son `{genere && …}` |
| `apps/frontend-papa/src/lib/diagnostic.ts` **:105-127** | `rejectDiagnostic` — **il existe déjà** |
| `apps/backend/app/modules/diagnostics/service.py` **:389-405** | `set_validation` — **aucune précondition d'état** |
| `apps/frontend-papa/src/components/ConfirmDialog.tsx` | la brique de confirmation du dépôt |

### CE QU'IL FAUT FAIRE

1. **`CRAN_TEXTE` porte l'acteur puis l'état** (Décision 6) — « chez toi » / à relire, « chez
   Massimo » / pas encore passé. L'acteur en premier, en couleur ; l'état en gris, en second.
2. **La légende du rail dit la règle en toutes lettres.**
3. **Le sur-titre du panneau reprend la même formulation** que la ligne sélectionnée.
4. **`PanneauSansMesure` rend deux actions sur les DEUX crans** (Décision 5). Le
   `{genere && …}` disparaît.
5. **« Retirer la proposition » et « Refuser ce lot » passent par une confirmation**, et leur texte
   ne désigne **aucun manquement de Massimo**.

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**Un diagnostic peut être passé entre le chargement de la page et le clic de Papa.**

`set_validation` acceptera le `reject` sans broncher — il n'a aucune précondition. Le résultat
serait de **cacher une mesure qui existe**.

La règle de l'ADR : **un diagnostic `passe` n'offre jamais l'action**, et le rail le montre au
troisième cran **quel que soit son `validation_status`**. Vérifie que c'est bien le cas dans
`apercu` — le rail est construit depuis les tentatives, pas depuis le statut, mais **vérifie-le,
ne le suppose pas**.

### VERROUS EXIGÉS

- **Chacun des deux crans non passés rend exactement deux actions.** Sabotage : remets le
  `{genere && …}` — le test du cran `propose` doit rougir.
- 🔴 **Aucun libellé de cran non passé ne contient un nombre de jours.** C'est un verrou de
  **doctrine** (`CLAUDE.md` §gamification, « NOUVEAU jamais DÛ »). Sabotage : ajoute
  « depuis 6 jours » — il doit rougir.
  ⚠️ Fais-le porter sur **le texte rendu**, pas sur une constante : un verrou lexical sur une
  constante ne voit pas un compte calculé au rendu.
- **Un diagnostic passé n'offre jamais « Retirer la proposition ».** Décor non dégénéré : il faut
  une passation **et** un proposé dans le même décor.

### HORS PÉRIMÈTRE DE LA SESSION B

Le bandeau et ses focus (Session A) · les trois stations du panneau d'une passation · le gate de
relecture · la page de Massimo · toute migration, toute route.

---

## 🔴 VÉRIFICATION À L'ÉCRAN — OBLIGATOIRE, ET PAR UN HUMAIN

**Ce chantier naît entièrement d'une relecture visuelle humaine, et sa quatrième décision a été
trouvée à l'écran pendant son propre cadrage.** Le livrer sans relecture contredirait son acte de
naissance deux fois.

Avant la PR, sur la paire `backend-dev` (8001) + `papa-dev` (5175) :

1. **Créer un diagnostic au cran « généré »** — sans lui, « Refuser ce lot » part non vu (§7 du
   protocole).
2. Cliquer **chacun** des focus, et vérifier que le rail montre bien la population annoncée.
3. Faire la soustraction `matieres_total − matieres_mesurees` et **vérifier qu'elle tombe juste**
   contre le focus `non-mesurees`. C'est la preuve de la Décision 7, et elle se fait à l'œil.
4. Vérifier que la 4ᵉ jauge **ne réagit à rien**.
5. Ouvrir un cran « proposé » et un cran « généré », et voir **deux actions dans chacun**.
6. Composer un focus **et** une pastille de matière, jusqu'à l'intersection vide — et lire ce
   qu'elle écrit.

⚠️ **Ce qui est vu doit être consigné** : par qui, sur quelles données, et ce qui n'a pas pu
l'être. Un « vérifié » sans ces trois-là n'est pas une vérification.

## Après la Session B

- `MEMORY.md` — état, décisions actives, dettes, prochain pas ;
- `TROUBLESHOOTING.md` — une section par branche, avec les pièges **réellement** rencontrés ;
- `CHANGELOG.md` — une entrée de version ;
- **Chantier suivant, déjà décidé** : l'**anti-triche du diagnostic**, au `BACKLOG.md`.
