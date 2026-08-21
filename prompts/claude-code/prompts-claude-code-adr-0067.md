# Prompts d'exécution — ADR-0067 « Un geste qui s'évanouit n'est pas un geste réussi »

Deux slices (budget backlog : la fin d'un geste = 1, phase E). Chaque prompt se colle après
`/slice`. Les mesures du cadrage (2026-08-21) font foi, et elles ont été prises sur les vraies
données — sidecar d'un geste réellement joué, base de prod, vraie fonction `_revocations` :
restauration réelle **1,738 s bout en bout**, 8/8 étapes, **swap à +0,736 s**, sur 9 172 lignes
et 76 fichiers audio · barre du header à **4 s** · l'annonce de fin (`ProductionDoneModal`) ne
couvre **QUE les lots** · le composant `Toast` n'a **qu'UN usage** dans tout le front Papa
(`DemandesPage.tsx`) · la session Papa **survit au swap** (JWT sans état, `decode_token` ne
touche jamais la base).

⚠️ **Les 0,20 s / 0,29 s de prod ne servent de seuil à rien** : 220 lignes, zéro média.

---

## Slice 1 — le verdict : le sidecar cesse d'être jeté

Chantier : la slice 1 de l'ADR-0067, sur la branche EXISTANTE `feat/la-fin-d-un-geste-se-raconte`
(ne pas la recréer — vérifier qu'on est dessus, arbre propre). L'ADR
`docs/decisions/adr-0067-un-geste-qui-s-evanouit-n-est-pas-un-geste-reussi.md` est LA référence :
relire §2, §4, §6, §Périmètre et §Suivi avant toute ligne. Les décisions y sont figées — les
relire, jamais les rouvrir. Les patrons existants se RÉUTILISENT : le champ `verification` /
`VerificationArchive` est le **modèle exact à copier** (même famille, même place, même façon de
rendre un verdict) · le contrat capturé de `packages/types/contracts/` (README à lire AVANT) ·
`modules/settings/sauvegarde.py` pour tout le reste.

### Livrables

1. **La lecture complète du sidecar.** Aujourd'hui `GET /donnees` n'en lit **qu'une clé** —
   `sauvegarde.py:1563-1571`, `.get("termine_le")`. Il doit rendre le §2 : `termine_le` ·
   `verdict` · `etape_arretee` · `motif` · `ecarts`. 🔴 `etape_arretee` vient du **dernier pas
   dont `statut == "echec"`**, et son nom sort de `ETAPES_RESTAURATION` (`sauvegarde.py:947` :
   filet · restauration · reveil · swap · medias · purge_files · migrations · recyclage) —
   **jamais un texte réécrit à la main**. `motif` est rendu **tel quel** (doctrine ADR-0041 §8 :
   une table « motif technique → phrase douce » est exactement ce qui a été écarté).

   🔴 **Un point que l'ADR NE TRANCHE PAS, et qu'il faut lui rapporter** : `journal.ecart()` est
   réellement appelé (`sauvegarde.py:1386` — *« recyclage ⑧ non demandé : aucun worker courant »*),
   donc une restauration peut **se terminer AVEC des écarts**. Le §2 fait de `verdict` un binaire
   adossé à `termine_le` et compte les `ecarts` à côté : vérifier que ça ne fabrique pas un
   « réussie » qui **masque** un écart. C'est la doctrine `adr-0065` §7 — *le mot se mérite* —
   appliquée à un autre mot. **Rapporter et proposer ; ne pas trancher seul, ne pas coder autour.**

2. **`restauration` REMPLACE `restauree_le`** — pas de doublon (§2), et **les deux côtés dans le
   MÊME commit**. Les **six fichiers**, relevés au cadrage puis **recomptés** (le premier
   relevé en annonçait cinq et en oubliait un — le test backend) :
   `packages/types/src/settings.ts:231` · `apps/backend/app/modules/settings/schemas.py:316` ·
   `apps/backend/app/modules/settings/sauvegarde.py:1563-1571` et `:1595` ·
   `apps/backend/app/tests/test_sauvegarde_donnees.py` · `DonneesTab.tsx:280-282` (le rendu
   « ↺ restaurée le … ») · `DonneesTab.test.tsx:49` et `:303`.
   ⚠️ Recompter soi-même avant de retirer — `grep -rn restauree_le apps packages` — plutôt que de
   se fier à cette liste : c'est précisément l'endroit où elle s'est trompée une fois.

3. 🔴 **Le contrat capturé `packages/types/contracts/donnees.example.json` + ses deux tests.**
   C'est la parade obligatoire, et elle n'est pas décorative : le dépôt sait qu'**un renommage de
   clé JSON est INVISIBLE aux tests unitaires** — le backend se teste contre lui-même, le front
   mocke ; renommez d'un seul côté et les deux suites restent vertes (payé le 2026-08-04 sur
   `preset` → `niveau`). ⚠️ Le fichier se **CAPTURE** par un `curl` sur le backend réel, jamais
   écrit à la main — écrit à la main ce n'est qu'un mock de plus. Seules les **clés** engagent :
   figer des valeurs le rendrait rouge au premier geste joué en dev.

   ⚠️ **Piège dans le piège, déjà payé** : renommer la clé dans `router.py` seul ne change RIEN à
   la réponse — Pydantic filtre sur les champs du `response_model` et jette la clé inconnue. La
   mutation qui prouve le test doit toucher **`schemas.py`**.

4. **Le front ne fait que suivre le contrat dans cette slice** : `DonneesTab` continue d'afficher
   « ↺ restaurée le … », lu désormais de `restauration.termine_le`. Aucune surface neuve, aucun
   toast, aucune attente — tout ça est la slice 2.

### 🔴 LE test existant qui DOIT évoluer — et c'est le seul

`apps/backend/app/tests/test_sauvegarde_donnees.py::test_un_geste_interrompu_ne_rend_pas_restauree_le`
**fige le défaut** que ce chantier répare. Il confond deux cas, et sa docstring l'écrit :
*« et sans sidecar du tout, **même réponse** »*.

| Ce qu'il assert | Après le §2 |
|---|---|
| aucun sidecar ⇒ `None` | **inchangé** — jamais restaurée reste `restauration: null` |
| sidecar à `termine_le: null` ⇒ `None` | 🔴 **DOIT changer** — `verdict: "interrompue"` + l'étape |

⚠️ C'est un **changement de comportement voulu**, pas un verrou qu'on desserre pour passer au vert
— et c'est la distinction que le `WORKFLOW.md` §2.3 surveille (*un test modifié pour passer = une
régression masquée*). Le patron du dépôt s'applique : **nommer ce test dans le rapport de fin de
slice, dire quelle assertion évolue et pourquoi, et vérifier qu'aucune autre n'a bougé.** Son
nom devient faux aussi (« ne rend pas restauree_le ») : le renommer fait partie du livrable.

⚠️ Il faut donc **relire les cinq tests** de ce fichier qui touchent le sujet (`:193` et `:213`)
avant d'écrire quoi que ce soit. Tout autre test qui tomberait au vert par accident est suspect.

### Test-verrous (chacun un test nommé, aucun affaibli)

- 🔴 **Une restauration interrompue ne se lit PLUS comme une archive jamais restaurée.** C'est le
  défaut exact que le cadrage a trouvé : sidecar sans `termine_le` ⇒ `verdict: "interrompue"` +
  l'étape + le motif, et surtout **pas `null`**. Contre-épreuve due : un sidecar fabriqué sans
  `termine_le`, arrêté à `medias`, doit rendre l'étape `medias` et SON motif.
- 🔴 **Le contrat tient des deux côtés** : côté back « la réponse réelle a exactement ces clés » ;
  côté front « les composants rendent à partir du contrat, SANS mock ». Contre-épreuve : muter
  `schemas.py` (pas `router.py`) doit rendre l'un des deux ROUGE.
- **Aucun sidecar ⇒ `restauration: null`** — jamais restaurée, et ça ne se confond avec rien.
- **Sidecar illisible ⇒ `restauration: null`, l'archive s'affiche quand même** — cacher un fichier
  présent sur la cible serait un mensonge (règle déjà tenue par `sha256`, la garder).
- **`etape_arretee` appartient à `ETAPES_RESTAURATION`** — un test qui lie la valeur à la CONSTANTE,
  pas à une chaîne recopiée (patron du verrou `estOngletRendu` : une chaîne recopiée n'attrape pas
  un renommage).
- **Aucun octet d'archive sur HTTP** (ADR-0065 §1, cité tel quel) : la réponse ne porte que des
  métadonnées et des verdicts.
- **`restauree_le` a disparu du contrat** — un test-cliquet qui rougit si quelqu'un le réintroduit
  « pour compatibilité » : deux formulations d'un même fait finissent par diverger (§2).

### Read-before-code à rendre en RAPPORT (§Suivi 4 de l'ADR)

- 🔴 **Mesurer une restauration sur la plus grosse base disponible.** La seule mesure du dépôt
  porte sur 9 172 lignes ; la prod en compte 220. La cadence et la borne de la slice 2 en
  dépendent. **Si la mesure n'est pas faisable, le dire** — ne pas l'estimer.
- 🔴 **Que répond `GET /donnees` PENDANT la fenêtre de swap ?** Les connexions sont tuées
  (`AdminShutdown`) et les pools se reconnectent, mais **ce n'est pas mesuré**. L'attente de la
  slice 2 tombera dedans par construction : une lecture en erreur pendant le swap ne doit **PAS**
  se lire comme un échec du geste. C'est le read-before-code le plus important des deux slices.
- Recompter les lecteurs de `restauree_le` (back, front, **tests**, docs, contrats) — le relevé
  du cadrage s'est trompé une fois en oubliant `test_sauvegarde_donnees.py`.
- Le verdict quand `termine_le` est posé ET `ecarts` non vide (livrable 1) — rapporter, proposer.

### Hors-périmètre de CETTE slice

L'attente armée · le toast · l'état persistant d'échec (slice 2) · **et tout le hors-périmètre de
l'ADR** : formulation et rendu (surface, cas 4, décidés devant l'écran) · la barre du header ·
un canal poussé · le bouton « annuler la restauration » · toute notification hors écran · toute
surface Massimo · les quatre autres sous-chantiers de la phase E.

Les trois critères du §Périmètre mordent : **aucune migration, aucune colonne** · **aucune
information nouvelle PRODUITE côté serveur** — le sidecar l'écrit déjà, on cesse de la jeter ; si
une ligne se met à *calculer* un verdict que le sidecar ne porte pas, la borne est franchie ·
**aucune surface neuve hors de l'onglet 💾**.

### Fin de slice

Suites complètes backend + les deux frontends, `bash scripts/check_adr_refs.sh` en 0,
`graphify update .`, puis `/cloture` — sans commit.

---

## Slice 2 — l'attente et les deux issues *(après le merge de la slice 1)*

### 🔴 CE QUE L'ÉCRAN A DÉMENTI EN SLICE 1 — mesuré, et ça change le travail de la slice 2

Relecture visuelle du **2026-08-21**, sur les vraies données de dev (l'archive `…-1844.tar`,
réellement restaurée). **Le commanditaire n'a pas vu la mention alors qu'elle était bien peinte.**
Mesures DOM prises dans la foulée :

| Mesure | Valeur |
|---|---|
| Texte peint | `↺ restaurée le 19/08/2026 18:46` — présent, `visibility: visible`, `opacity: 1` |
| Contraste | **5,73:1** — passe AA. ⚠️ **Ce n'est PAS un problème de couleur**, ne pas partir là-dessus |
| Taille | 11 px |
| 🔴 Lignes peintes | **2** — la mention passe à la ligne |
| Largeur de la cellule | **117 px** (le span en occupe 105) |

**Le diagnostic** : dans 117 px, la mention se coupe en deux, **juste sous un nom de fichier
monospace qui se coupe déjà lui-même** (`zetis-2026-08-` / `19-1844.tar`). Elle ne se lit pas comme
une information distincte — elle se confond avec le retour à la ligne du nom au-dessus.

🔴 **Ce que ça impose à CETTE slice.** L'état persistant d'échec (§3) est **plus long** que le
succès : verdict + étape + motif. Au même endroit, il s'écraserait davantage — **un échec de
restauration serait alors MOINS visible qu'un succès**, exactement l'inverse de ce que le §3
décide. La question n'est donc pas « comment ne pas couper cette ligne » mais **où vit l'histoire
d'une restauration dans ce tableau**. La slice 2 tranche l'**emplacement pour les deux états d'un
coup** — c'est le second cas qui rend la décision possible, et c'est pourquoi elle n'a pas été
prise en slice 1 (arbitrage du commanditaire, 2026-08-21).

⚠️ Cette section EST la matière de la « ce que l'écran a démenti » du compte rendu de surface
(ADR-0060 §2). Elle ne se réinvente pas : elle se cite.


À affiner à la clôture de la slice 1 : son read-before-code sur la fenêtre de swap peut déplacer
des détails, et c'est prévu. Le squelette :

- **L'attente armée** (§1), et ses cinq bornes sont la décision, pas des détails : armée par un
  **202 parti de cette page**, jamais au montage · s'arrête au **premier verdict** · cadence
  **4 s**, la valeur déjà mesurée du dépôt — aucun nombre neuf n'est inventé, et elle n'est pas
  ajustée sur les 1,738 s : une lecture trop tôt coûte une requête et recommence · s'arrête si
  Papa quitte l'onglet · 🔴 **le renoncement ne rend AUCUN verdict**, il rend la main au ⟳.
- ⚠️ **Écrire dans le code POURQUOI ce n'est pas le sondage que l'ADR-0062 §5 interdit** : le §5
  vise une page qui se rafraîchit *toute seule* et *« ferait bouger un champ sous les doigts »* —
  l'onglet 💾 n'a aucun champ hors du dialogue, déjà fermé. Sans cette note, le prochain lecteur
  y verra une entorse et la « corrigera ».
### 🔴 CE PROMPT A ÉTÉ ÉCRIT AVANT L'AMENDEMENT 1 — le verdict a TROIS valeurs, pas deux

⚠️ **Tout ce qui suit parlait d'un monde binaire** (« succès » / « échec »). L'Amendement 1 de
l'ADR-0067, écrit et **appliqué** le même jour (squash `e4d707f`), a tranché autrement :

| Valeur | Ce que la slice 2 doit en faire |
|---|---|
| `reussie` | allée au bout **et zéro écart** — le cas du « succès » ci-dessous |
| 🔴 `avec_ecarts` | allée au bout, **mais N écarts**. **PAS un échec** — la base est remplacée, les médias sont en place. Le rendre comme une panne enverrait Papa relancer un second swap |
| `interrompue` | le cas de l'« échec » ci-dessous |

🔴 **La question que ce prompt ne pouvait pas poser, et qui est maintenant la vraie question de la
slice** : `avec_ecarts` est un **succès**, donc le §3 lui donne un toast — mais un toast est
éphémère, et un écart est un **fait durable inscrit sur la cible**. Six secondes ne peuvent pas
porter une réserve qui, elle, reste vraie. Il lui faut donc probablement **les deux** : le toast
comme retour d'action, **et** une marque durable sur la ligne de l'archive.

**À trancher devant l'écran**, avec l'emplacement — pas ici. Mais ne pas le trancher du tout
reviendrait à laisser `avec_ecarts` se rendre comme `reussie`, ce que l'amendement interdit
précisément.

⚠️ **Trois états à loger, pas deux** : la contrainte d'emplacement mesurée ci-dessus s'en trouve
resserrée, pas allégée.

- **Succès → toast éphémère** : le composant `Toast` EXISTE (`role="status"`, 6 s), il se réutilise
  tel quel — ne pas en écrire un second. Il nomme l'archive · ni pourcentage, ni promesse, ni
  durée · jamais « sauvegarde » pour un export non vérifié · il **ne remplace pas** l'état de la
  page · pour une restauration réussie il rappelle que **ZETIS s'est réveillé suspendu** et que la
  levée appartient à Papa (ADR-0063) — le taire ferait croire que le produit est reparti.
- 🔴 **Échec → état persistant sur la page, JAMAIS un toast** (§3). Sans acquittement : ce n'est
  pas une notification, c'est un **fait durable inscrit sur la cible**. La mécanique
  d'acquittement serveur de l'ADR-0041 n'est ni réutilisée ni dupliquée — il n'y a pas de ligne à
  acquitter.
- **Les trois gestes**, une seule mécanique (§6). Rappel : seule la restauration perd sa ligne ;
  l'échec de Sauvegarder et de Vérifier continue d'atterrir dans **Échecs** comme aujourd'hui.
- **La spec suit** : `docs/frontend-papa/page-parametres.md` gagne la fin d'un geste dans son
  §💾 (elle décrit les gestes, pas leur fin) · entrée `CHANGELOG` · le message d'aujourd'hui
  — *« ⟳ ensuite pour relire l'état »* — **disparaît** : c'était une consigne de surveillance,
  et c'est ce chantier qui la supprime.
- Test-verrous : un échec ne passe **jamais** par un toast (contre-épreuve : forcer une issue
  d'échec, asserter qu'aucun `role="status"` n'apparaît) · l'attente **ne démarre pas au montage**
  · le renoncement ne rend aucun verdict · l'attente s'arrête au démontage.

### Puis, dans la MÊME session que la relecture visuelle

Le **compte rendu de surface** (cas 4 de l'ADR-0060) : la formulation et le rendu, avec sa section
« **ce que l'écran a démenti** » — 🔴 si elle est vide ou générique, c'est que la relecture n'a pas
eu lieu et l'ADR n'est pas écrivable. **Jamais reporté au lendemain** : l'ADR-0060 borne cette
fenêtre à une session, et le corpus a déjà oublié l'étape 4bis six fois.
