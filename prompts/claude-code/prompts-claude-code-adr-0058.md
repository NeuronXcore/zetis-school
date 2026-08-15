# Prompts Claude Code — ADR-0058 « La fiche répond quand on la touche »

> **Trois gestes, une slice.** À coller après `/slice`.
>
> Lire d'abord : `docs/decisions/adr-0058-la-fiche-repond-quand-on-la-touche.md` (**tout**),
> `docs/frontend-massimo/page-fiches.md` — ⚠️ **elle a été complétée à l'ouverture** aux trois
> endroits concernés (pied de colonne, §7 versions, §Pont SRS) : elle dit maintenant ce qu'il faut
> faire —, et `adr-0054` §1 (l'adresse `?fiche=`) et §7 (l'asymétrie brouillon / fiche finie).

---

## Ce qui a été mesuré à l'ouverture — vérifie-le, ne le crois pas

| Fait | Vérifié les 2026-08-14 et 15 |
|---|---|
| 🔴 **Deux boutons, une seule destination** | « C'est fini, je la garde » **et** « J'ai fini pour aujourd'hui » font tous deux `retourAuDeck()` (`AtelierPage.tsx:740` et `:748`) |
| 🔴 **Le défaut 4 est RÉALISÉ en base** | brouillons **id=54** (v3, leçon 1) et **id=59** (v4, leçon 7), **vides**, derrière des fiches finies |
| 🔴 **La porte « sûre » rend le vide** | `rework` fait `if en_cours is not None: return` (`atelier.py:330`) — et `en_cours`, c'est le fantôme |
| 🔴 **55 tests backend sur l'atelier, ZÉRO sur « ouvrir après avoir fini »** | il y a `ouvrir_deux_fois`, `retravailler_cree_une_version`… et pas celui-là |
| Le patron `busy` existe **à trois lignes** du pont | `porte={{ …, busy: porteEnCours }}` (`FicheSubjectPage.tsx`) |
| Le `catch {}` du pont est **vide et commenté** | l'argument est juste, le silence total ne l'est pas |
| Tests existants | `AtelierPage` **28** · `FicheSubjectPage` **26** · `test_fiche_atelier.py` **55** |
| Statut d'un brouillon | 🔴 **`personal_draft`**, PAS `draft` (`population.py:47`) |

---

## 🔴 LE POINT DUR — réparer la cause sans réécrire `rework`

L'ADR le tranche (§4) : `open_or_get_draft`, quand il ne trouve **aucun brouillon** mais qu'une
fiche **finie** existe, **délègue à `rework`**. Ce qu'il faut tenir en le faisant :

1. 🔴 **`rework` n'est pas modifié.** Son asymétrie est la décision de l'`adr-0054` §7. On lui
   délègue, on ne la réécrit pas — sinon deux formulations d'une même règle, et elles divergeront.
2. ⚠️ **`open_or_get_draft` est déjà dense** : idempotence, ordre stable (`ORDER BY id`), course
   StrictMode, rattrapage d'`IntegrityError`. La branche neuve s'insère **avant** la création, pas
   au milieu de ces mécanismes. Si tu te retrouves à en déplacer un, arrête-toi.
3. 🔴 **Le §5 est une SECONDE règle, pas la même** : un brouillon **qui existe déjà** et qui est
   **vide**, sur une leçon portant une fiche finie, se **repeuple** depuis la dernière finie. Sans
   elle, les deux fantômes survivent au chantier — ils sont des brouillons, donc la branche du §4
   ne les voit même pas.

⚠️ **« Vide » se lit sur les SIX sections** (`essentiel`, `definitions`, `pieges`, `exemple`,
`methode`, `mnemonique`) — **jamais** sur le décor (titre, matière, niveau, chapitre), pré-rempli
par construction. Se tromper ici, c'est repeupler un brouillon **rempli** : le pire résultat
possible du chantier, et son **signal d'erreur n° 3**.

---

## Ce qu'il y a à faire, dans cet ordre

**1. Backend — la cause.** Les deux règles du §4 et du §5 dans `atelier.open_or_get_draft`.
🔴 **Aucune migration, aucun endpoint neuf** (§6) : si tu écris un script de nettoyage des deux
fantômes, tu es sorti du périmètre — la règle doit les réparer **en passant**.

**2. Front — les deux réponses d'écran.**
- `AtelierPage.terminer()` : sur un `finish` **réussi**, naviguer vers
  `/fiches/{slug}?fiche={id}`. ⚠️ **Le 422 ne navigue pas** — on reste dans l'atelier, l'écran dit
  ce qui manque. C'est déjà juste, ne le touche pas.
- `FicheSubjectPage.pontVersLesCartes` : un état **occupé** (patron `porteEnCours`, trois lignes
  au-dessus) et un **message d'échec à côté du bouton** (patron `portePanne`, juste au-dessus).
  Le `catch {}` vide tombe.

**3. Les tests.** Voir la contre-épreuve — et **la recette sur les deux cas réels** est une
condition, pas un bonus.

**4. La doc.** `page-fiches.md` est **déjà à jour** (faite à l'ouverture) : relis-la, elle est ton
cahier des charges. Restent `CHANGELOG.md` et, si le contrat bouge, `API_SPEC.md` — ⚠️ *il ne
devrait pas bouger*, et s'il bouge, dis pourquoi.

---

## 🔴 La contre-épreuve — CONDITION DE LIVRAISON

1. **Ouvrir l'atelier après un `finish` rend le TRAVAIL**, pas un vide — le test qui manquait aux
   55. *Sabotage : retirer la délégation à `rework` → rouge.*
2. 🔴 **Un brouillon VIDE derrière une fiche finie se repeuple.** *Sabotage : retirer la règle du
   §5 → rouge.* C'est celle qui répare les deux fantômes ; sans test, on ne saura pas qu'elle a
   cessé de marcher.
3. 🔴 **Un brouillon REMPLI n'est JAMAIS repeuplé** — le signal d'erreur n° 3, en verrou.
   ⚠️ **Décor : une seule section remplie**, et une seule, pour prouver que le seuil est « au moins
   une » et non « toutes ».
4. ⚠️ **Le décor doit distinguer sections et décor** : un brouillon dont **seul** le titre/la
   matière est rempli est **vide**. Sans ce cas, la règle du §5 pourrait tester le décor sans que
   rien ne rougisse.
5. **`finish` réussi → la fiche ; `finish` en 422 → on reste.** *Sabotage : naviguer aussi sur le
   422 → rouge.*
6. **Le pont dit qu'il travaille, et dit qu'il a échoué.** *Sabotage : rétablir le `catch {}` vide
   → rouge.*
7. **Les 55 + 28 + 26 tests existants passent SANS être touchés.** Rends les deux chiffres.
8. 🔴 **RECETTE SUR LES DEUX CAS RÉELS** — après le chantier, ouvrir l'atelier sur la **leçon 1**
   doit rendre le travail de la v2, et sur la **leçon 7** celui de la v3. En base, pas en test.

---

## Les pièges, nommés d'avance

1. 🔴 **`personal_draft`, pas `draft`.** Le cadrage s'y est fait prendre : sa première mesure
   annonçait **0 cas** là où il y en a deux. Toute requête que tu écris sur les brouillons doit
   utiliser `draft_of_student` ou `STATUS_DRAFT`, jamais une chaîne écrite à la main.
2. 🔴 **Repeupler un brouillon rempli détruit du travail** — c'est le seul risque irréversible de
   ce chantier. Le verrou 3 existe pour ça.
3. ⚠️ **`rework` rend le brouillon en cours quand il existe** : c'est pour ça que les deux portes
   désamorcées ne protègent plus rien aujourd'hui. Ne « corrige » pas ce comportement — c'est
   `open_or_get_draft` qui doit ne plus créer le vide, et le §5 qui répare l'existant.
4. ⚠️ **Le 422 de `finish` porte un OBJET** (`message` + `champs`), pas une chaîne — `lib/atelier.ts`
   le dit déjà en commentaire.
5. ⚠️ **StrictMode monte deux fois** : `AtelierPage` mémorise **la promesse**, pas un drapeau. Ne
   touche pas à ce mécanisme, il a coûté 4 brouillons pour 2 leçons.
6. ⚠️ **Un `prop` déclaré et jamais lu** passe les tests et pas `tsc` (`TS6133`, déjà payé).
7. ⚠️ **`fireEvent`**, pas `@testing-library/user-event` (absent du dépôt).
8. ⚠️ **`graphify affected` a rendu vide ou ambigu trois fois cette semaine.** Recoupe au `grep`.

---

## Vérification exigée

**1. Les suites** : backend (référence **1302** ; ⚠️ **infra Docker allumée**), Massimo (**765**),
Papa (**814**), `tsc -b` des deux côtés.

**2. 🔴 REGARDER L'ÉCRAN**, et sur les **vraies données** — les deux fantômes sont en base, c'est
une chance : la recette est jouable pour de vrai. Au minimum : terminer une fiche et **atterrir
dessus** · taper le pont et **voir qu'il travaille** · ouvrir l'atelier sur la **leçon 1** et
**retrouver son travail** au lieu de la page blanche.
Paire `backend` + `massimo` de `.claude/launch.json` ; token dans `localStorage`
(`zetis_massimo_token`).

**3. Mesure dans le DOM**, pas sur capture. ⚠️ Un `click()` JS puis une mesure **dans le même
appel** lit l'état d'AVANT (React n'a pas rendu) ; et mesurer une géométrie **sous le curseur**
rend des nombres faux (`hover:scale-*`).

**4. Dis ce que tu n'as pas pu voir.** L'échec du pont ne se provoque pas facilement en vrai —
si tu ne l'as vu qu'en test, **dis-le**, ne l'arrondis pas en « vérifié ».
