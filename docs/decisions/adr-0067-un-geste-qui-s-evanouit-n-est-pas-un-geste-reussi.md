---
id: "0067"
titre: "Un geste qui s'évanouit n'est pas un geste réussi"
type: surface
statut: propose
date: 2026-08-21
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0026", "0041", "0060", "0062", "0063", "0065", "0066"]
---
# ADR-0067 — Un geste qui s'évanouit n'est pas un geste réussi

## Statut

**Proposé — 2026-08-21.** La fin des gestes de l'onglet 💾 — comment Papa apprend qu'un geste
qu'il a lancé s'est terminé, et **comment il s'est terminé**. Nommé en hors-périmètre de
l'amendement 1 de l'ADR-0066 : *« Le toast de fin de restauration (demande du 2026-08-19) — son
propre cadrage, autre mécanique (la découverte de fin sans sondage). »*

**Cadré en cas 3 de l'ADR-0060**, et le classement a été vérifié dans l'ordre des quatre
questions, pas supposé :

| # | Question | Réponse |
|---|---|---|
| 1 | Rangement — rien n'est décidé ? | **Non.** Il y a du comportement à construire, pas de la doc à remettre au réel. |
| 2 | Application — la règle existe déjà ? | **Non**, et c'est le point. Aucune règle du dépôt ne dit qu'un geste enfilé annonce sa fin ; le seul mécanisme d'annonce qui existe (`ProductionDoneModal`) ne couvre **que les lots**, et pour la restauration il est **structurellement inapplicable** — la ligne du travail meurt au swap (ADR-0066 §3). |
| 3 | Migration, ou annulation > 1 commit ? | **Oui pour la seconde.** Le champ publié `restauree_le` est **remplacé** par un verdict (§2), ce qui touche `packages/types`, le schéma serveur, la route, la page et ses tests. Et le §1 **taille une exception bornée** dans une règle déjà décidée — l'ADR-0062 §5, *« rien ne se rafraîchit tout seul »*. Une exception à une règle décidée est une décision. |

> Aucune migration Alembic. La réponse « oui » vient de la seconde branche du cas 3, pas de la
> première — et c'est écrit ici pour qu'on puisse me contredire sur ce point précis.

**Ce que cet ADR consomme sans le redécider** : le sidecar `.restauration.json` comme seul témoin
survivant du geste et l'interdit d'insérer une trace dans la base restaurée (ADR-0066 §3) · la
surface de l'onglet 💾 et *« un toast n'est qu'un retour d'action, jamais une confirmation »*
(ADR-0066 §6-§7) · *« aucun octet d'archive ne passe par HTTP »*, dont le texte précise que les routes ne rendent
que *« listes, tailles, empreintes, verdicts »* (ADR-0065 §1 — un **verdict** y est donc
explicitement autorisé) · le mot
« sauvegarde » qui se mérite (ADR-0065 §7) · *un échec ne s'efface pas tout seul* et *le motif est
rendu tel quel, sans table de traduction* (ADR-0041 §8 et sa doctrine d'énoncé) · la suspension
comme geste explicite de Papa (ADR-0063).

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-21 | « Réussie » veut dire zéro écart, ici comme ailleurs | Proposé | oui |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

### Ce que le geste dit à Papa aujourd'hui, mot pour mot

Après un 202, `DonneesTab.tsx` affiche :

> *« Travail #N enfilé — ZETIS bascule sur cette archive. La ligne disparaîtra de la barre au
> moment de la bascule (c'est prévu : son journal vit sur la cible) ; ⟳ ensuite pour relire
> l'état. »*

**C'est une consigne, pas une nouvelle.** ZETIS demande à Papa de surveiller la disparition d'une
ligne, puis d'appuyer sur un bouton pour savoir ce qui s'est passé — au moment précis où il vient
de remplacer l'état vivant du produit.

### Les mesures du 2026-08-21 — sur les vraies données, pas sur des exemples

Toutes faites en lisant les fichiers et la base réels ; la provenance est indiquée pour chacune.

| Mesure | Résultat | D'où elle vient |
|---|---|---|
| 🔴 **Durée réelle d'une restauration complète** | **1,738 s** bout en bout, **8/8 étapes franchies, 0 écart** | sidecar `zetis-2026-08-19-1844.tar.restauration.json` (geste réellement joué) |
| Le swap, dans cette séquence | à **+0,736 s** après le début | même sidecar, étape `swap` |
| Volume de ce geste | **9 172 lignes**, 48 tables, **76 fichiers audio**, 0 objet MinIO | même sidecar, étapes `filet` et `medias` |
| `backup_create` / `backup_verify` en prod | **0,20 s** / **0,29 s** | `ai_jobs` #36 et #37, base de prod |
| ⚠️ **Ce que pèse cette prod-là** | **220 lignes**, 174 Ko, **0 objet MinIO, 0 fichier audio** | `output_json` du travail #36 + `ls` de la cible |
| Sondage de la barre du header | **4 s** | `useProductionActivity.ts` / `useActiveProductionRun.ts` |
| Annonce de fin existante (`ProductionDoneModal`) | **lots uniquement** — lit `/runs/active`, relit par `fetchProductionRun` | `useActiveProductionRun.ts`, qui le dit lui-même : *« celui-là ne voyait que les LOTS »* |
| Usages du composant `Toast` dans tout le front Papa | **1** — `DemandesPage.tsx`. **Jamais** dans `DonneesTab` | `grep -rln "Toast" apps/frontend-papa/src` |
| Sondage sur la page Paramètres | **aucun**, par décision | ADR-0062 §5 |
| La session de Papa survit-elle au swap ? | **oui** — JWT sans état, `decode_token` ne touche jamais la base, les comptes viennent des réglages | `modules/auth/service.py`, `deps.py` |

> ⚠️ **Les 0,20 s / 0,29 s de prod ne prédisent rien** et ne servent de seuil à rien dans cet ADR :
> ils sont mesurés sur une base de **220 lignes sans un seul média**. La seule mesure de geste
> réaliste dont le dépôt dispose est la restauration de dev ci-dessus, et elle porte sur 9 172
> lignes. Aucun seuil de durée n'est figé ici — voir le §1.

### 🔴 Ce que la mesure démontre : l'évanouissement est **ambigu**

Le geste dure 1,738 s ; la barre sonde toutes les 4 s et reçoit en plus un réveil immédiat à
l'enfilement. Elle voit donc le travail **au moins une fois** — le réveil le lui montre `queued` —
puis, au tour suivant, il n'est plus là.

Et **la disparition a exactement le même aspect** dans les quatre cas :

1. la restauration a réussi de bout en bout ;
2. elle s'est arrêtée à l'étape 6, après le swap ;
3. le worker est mort en route ;
4. la ligne a simplement migré vers `zetis_avant` pendant qu'un autre problème couvait.

Une surface qui rend indiscernables « c'est fait » et « c'est cassé » sur le geste **le plus
destructif du produit** n'est pas une surface incomplète : elle est fausse.

### 🔴 Le trou trouvé au read-before-code : un échec **après le swap** n'existe nulle part

`run_ai_job` referme le travail ainsi :

```python
job = db.get(AIJob, job_id)
if job is None:
    # … la ligne est morte en route (restauration ADR-0066 §3)
    return {"error": "introuvable"}
```

Ce garde est **juste** et il est délibéré. Mais le chemin d'échec, quelques lignes plus haut, fait
la même chose : `echoue = db.get(AIJob, job_id)` — et **si la ligne est morte, rien n'est écrit du
tout**.

**Conséquence, jamais énoncée jusqu'ici :** une restauration qui échoue **après** le swap ne laisse
aucune trace en base. Elle n'apparaît pas dans **Échecs**, pas dans la barre, pas dans le Journal.
Un échec **avant** le swap, lui, atterrit normalement — la même panne est visible ou invisible
selon la seconde à laquelle elle survient.

### 🔴 L'information existe déjà sur le disque. Personne ne la lit.

`_JournalRestauration` réécrit le sidecar **à chaque étape**, et sa méthode `echouer()` y inscrit
l'étape fautive, l'horodatage et le **motif** — avant de laisser l'exception remonter, précisément
pour que le fichier survive au crash.

Or `GET /donnees` n'en lit **qu'une seule clé** :

```python
restauree_le = json.loads(sidecar_restauration.read_text(...)).get("termine_le")
```

`termine_le` est `null` sur un geste interrompu. Donc, à l'écran, **une restauration à moitié
franchie est rigoureusement identique à une archive jamais restaurée.** L'étape fautive et son
motif sont écrits, présents, lisibles — et ne sont demandés par aucune ligne de code.

**Ce chantier n'a donc pas à produire l'information. Il a à cesser de la jeter.**

## Décision

### §1 — La fin se découvre par une **attente armée**, bornée — et ce n'est pas le sondage que l'ADR-0062 §5 interdit

Après un **202 parti de cette page**, l'onglet 💾 relit `GET /donnees` jusqu'à ce que le geste
rende un verdict. Cinq bornes, et elles sont la décision :

1. **Armée par le geste de Papa, jamais au montage.** Ouvrir l'onglet ne déclenche rien. Seul un
   202 obtenu ici arme l'attente.
2. **Elle s'arrête au premier verdict.** Ce n'est pas une boucle de fond : c'est une question
   posée jusqu'à ce qu'elle ait sa réponse.
3. **Cadence : 4 s** — la valeur **déjà mesurée** du dépôt pour un travail en vol (ADR-0041,
   ramenée de 20 s à 4 s le 2026-08-03 contre des lots de 15-17 s). **Aucun nombre neuf n'est
   inventé ici**, et il n'est pas ajusté sur les 1,738 s mesurées : une lecture qui arrive trop
   tôt coûte une requête et recommence.
4. **Elle s'arrête si Papa quitte l'onglet.** Rien ne continue en arrière-plan.
5. 🔴 **Le renoncement ne rend AUCUN verdict.** Passé un nombre borné de lectures, l'attente
   s'arrête et la page dit qu'elle n'a pas vu la fin, en rendant la main au ⟳. Elle ne déclare
   ni succès, ni échec.

> ⚠️ **La borne du 5 n'est PAS mesurée, et elle ne peut pas l'être aujourd'hui.** La seule
> restauration réelle du dépôt a duré 1,738 s sur 9 172 lignes ; la prod en compte 220. Rien ne
> dit ce que durera le geste sur la base de Massimo dans un an. Elle est donc choisie **généreuse**
> — de l'ordre de la minute — et son unique effet est de **cesser de demander**. C'est pourquoi
> elle ne peut pas mentir : un renoncement n'affirme rien. La mesure sur la plus grosse base
> disponible est due dans la slice (§Suivi).

**Pourquoi ce n'est pas ce que l'ADR-0062 §5 interdit.** Le §5 interdit qu'une page de réglages se
rafraîchisse **toute seule**, et son motif est écrit : *« ferait bouger un champ sous les doigts »*.
Ici : Papa a lancé le geste, l'attente meurt avec sa réponse, et **l'onglet 💾 n'a aucun champ à
faire bouger** — son unique saisie vit dans le dialogue de confirmation, qui est fermé avant que
l'attente ne commence. Le motif du §5 ne mord pas ici ; la règle est donc bornée, pas contournée.

### §2 — Le sidecar rend un **verdict**, et il remplace `restauree_le`

`GET /donnees` cesse de ne lire que `termine_le`. Chaque archive porte l'état de sa dernière
restauration, sur le modèle exact du champ `verification` qui existe déjà à côté :

```txt
restauration: {
  termine_le:     string | null,   # null = geste interrompu
  verdict:        "reussie" | "interrompue",
  etape_arretee:  string | null,   # le nom d'étape du sidecar — jamais un texte inventé
  motif:          string | null,   # celui du sidecar, RENDU TEL QUEL (doctrine ADR-0041)
  ecarts:         int
} | null                            # null = jamais restaurée
```

🔴 **`restauree_le` est SUPPRIMÉ**, pas doublé. Garder les deux ferait deux formulations du même
fait, qui finiraient par diverger — le dépôt a déjà payé cette leçon. C'est ce remplacement de
champ publié qui met ce chantier en cas 3.

Cela **ne viole pas** l'ADR-0065 §1 : il énumère lui-même ce que les routes ont le droit de
rendre — *« listes, tailles, empreintes, verdicts »* — et l'ADR-0066 le reprend dans son
§Périmètre sous la forme *« des métadonnées, des verdicts et des 202/409 »*. Aucun octet
d'archive ne passe.

### §3 — Succès → toast éphémère. Échec → état persistant, **jamais** un toast.

| Issue | Où elle se dit | Pourquoi |
|---|---|---|
| **Succès** | un **toast** (le composant `Toast` existant, `role="status"`, 6 s) | c'est un retour d'action, il ne laisse aucune trace à traiter — ADR-0066 §6 |
| **Échec / interruption** | l'**état de l'archive** sur la page, durablement | ADR-0041 §8 : *« un échec qui disparaît après six secondes pendant que Papa est dans une autre pièce est un travail perdu en silence »* |

**Aucun échec ne s'annonce par un toast.** La règle vaut pour les trois gestes et n'admet pas
d'exception « pour cette fois ».

L'échec persistant **ne demande aucun acquittement**, et c'est délibéré : ce n'est pas une
notification, c'est un **fait durable inscrit sur la cible**. « Cette archive a été restaurée à
moitié le 19/08 à 16:46, arrêtée à l'étape *médias* » reste vrai tant que le sidecar le dit. Rien
à cliquer, rien à vider — la mécanique d'acquittement serveur de l'ADR-0041 n'est ni réutilisée ni
dupliquée ici, faute de ligne à acquitter.

### §4 — L'échec après le swap cesse d'être invisible, **sans écrire dans la base restaurée**

L'interdit de l'ADR-0066 §3 tient tel quel : **aucune ligne n'est insérée** dans `ai_jobs` ni
`production_runs` après le swap. Y insérer une trace falsifierait l'histoire qu'on vient de
restaurer.

La visibilité vient du §2 : le sidecar porte déjà l'étape fautive et son motif, la route les sert,
la page les rend. **Rien de neuf n'est produit — ce qui était écrit cesse d'être jeté.**

### §5 — Ce que le toast dit, et ce qu'il ne dira jamais

La **formulation** et le **rendu** sont une surface : ils se décideront devant l'écran (cas 4 de
l'ADR-0060), pas ici. Ce qui est décidé ici, ce sont les interdits :

- il **nomme l'archive** — un toast anonyme après un geste de classe A4 ne vaut rien ;
- il ne porte **ni pourcentage, ni promesse, ni durée estimée** ;
- il n'appelle jamais « sauvegarde » un export non vérifié (ADR-0065 §7) ;
- il **ne remplace pas** l'état de la page : la page reste la vérité, le toast n'est qu'un retour
  d'action ;
- pour une restauration réussie, il rappelle que **ZETIS s'est réveillé suspendu** et que la
  levée appartient à Papa (ADR-0063) — c'est la seule chose que Papa doit faire ensuite, et la
  taire ferait croire que le produit est reparti.

### §6 — Une seule mécanique pour les trois gestes de l'onglet

L'attente du §1 sert **Sauvegarder**, **Vérifier** et **Restaurer** : les trois rendent un 202 et
aucun des trois n'annonce sa fin aujourd'hui. Deux mécaniques pour un même défaut en feraient
diverger une.

**La restauration reste le seul cas où la ligne meurt**, donc le seul qui dépende entièrement du
sidecar. Pour les deux autres, la ligne survit : leur échec continue d'atterrir dans **Échecs**
comme aujourd'hui, et le §3 n'y change rien.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Ne rien faire — le ⟳ suffit** | C'est l'état actuel, et il demande à Papa de surveiller la disparition d'une ligne pour deviner un résultat. Mesuré : la disparition a le même aspect en cas de succès, d'interruption post-swap et de worker mort. |
| **Étendre la barre du header à l'annonce de fin des travaux unitaires** | Ne peut pas marcher pour la restauration : l'annonce de fin relit le travail **par son id**, et la ligne est dans `zetis_avant`. La barre est en outre **hors de l'écran du geste** — l'ADR-0041 la borne à *« il se passe quelque chose, quelque part »*, la page dit *« où en est ce que tu viens de lancer »*. Élargir la barre pour réparer une page mélangerait les deux distances de lecture. |
| **Sonder `/donnees` en permanence sur l'onglet** | C'est exactement ce que l'ADR-0062 §5 interdit, et le coût porterait sur toutes les visites de l'onglet pour un geste qui n'arrive presque jamais. L'attente du §1 ne vit que le temps d'une réponse. |
| **Écrire la ligne du travail dans la base restaurée après le swap** | Écarté par l'ADR-0066 §3 et son tableau d'alternatives : *une trace du futur dans un état du passé*. Cet ADR ne le rouvre pas. |
| **Un canal poussé (SSE / WebSocket)** | La bonne réponse à « découvrir sans sondage » dans l'absolu, et hors de proportion ici : un transport neuf, un point de coupure de plus au moment précis où la base est remplacée sous le backend, pour trois gestes qui durent 1,7 s et se comptent par mois. À rouvrir le jour où d'autres surfaces le demandent aussi — pas pour celle-ci seule. |
| **Un toast pour l'échec aussi, « c'est plus simple »** | Le contraire d'une simplification : six secondes pour un geste destructif raté, pendant que Papa est parti se faire un café. L'ADR-0041 §8 a déjà tranché — *« la négation exacte de rien ne doit se perdre »* — et sa phrase tient telle quelle. |
| **Garder `restauree_le` et ajouter le verdict à côté** | Deux formulations du même fait, qui divergent tôt ou tard. Le champ est remplacé, pas doublé — et c'est ce qui rend ce chantier réversible en plus d'un commit, donc cadrable. |
| **Faire du renoncement du §1.5 un verdict d'échec** | Le mensonge le plus facile de tout ce chantier : « je n'ai pas vu la fin » n'est pas « ça a échoué ». Sur une base dix fois plus grosse, la borne serait dépassée par des gestes parfaitement sains. |

## Périmètre

🔴 **Trois critères qui bornent, et ils mordent dès le premier jour :**

1. **Aucune migration, aucune colonne, aucune ligne écrite dans la base restaurée.** L'ADR-0066 §3
   tient intact. Le jour où ce chantier veut une table, il est sorti de son périmètre.
2. **Aucune information nouvelle n'est PRODUITE côté serveur.** Le sidecar écrit déjà l'étape
   fautive et son motif ; la route les sert, la page les rend. Si une slice se met à calculer un
   verdict que le sidecar ne porte pas, elle a franchi la borne.
3. **Aucune surface neuve hors de l'onglet 💾.** Pas de barre modifiée, pas de nouvelle modale,
   pas de composant `Toast` de remplacement — celui qui existe est réutilisé tel quel.

**Livré** : l'attente armée et bornée du §1 · le verdict de restauration servi par `GET /donnees`
et le retrait de `restauree_le` (§2) · le toast de succès et l'état persistant d'échec (§3) · les
test-verrous (dont : un échec ne passe **jamais** par un toast · le renoncement ne rend aucun
verdict · l'attente ne démarre pas au montage · une restauration interrompue **ne se lit plus**
comme une archive jamais restaurée · aucun octet d'archive sur HTTP).

## Hors périmètre — nommé

- 🔴 **La formulation exacte et le rendu du toast et de l'état d'échec** — surface, cas 4 de
  l'ADR-0060 : ils se décident **devant l'écran**, dans la même session que la relecture visuelle.
- **L'extension de la barre du header aux travaux unitaires** — écartée ci-dessus ; si elle
  redevient due, c'est son propre cadrage.
- **Un canal poussé (SSE / WebSocket)**, pour cette surface comme pour les autres.
- **Le bouton « annuler la restauration »** — reste le runbook `zetis_avant` de l'ADR-0066 §4.
- **Toute notification hors de l'écran** (courriel, système, mobile) — jamais demandé, et l'ADR-0026
  §4 vaut ici par analogie : une relance n'est pas un rappel.
- **Toute surface Massimo** — l'ADR-0041 §12 tient : ce qui se prépare ne s'annonce pas à l'enfant,
  et une restauration encore moins que le reste.
- **Les quatre autres sous-chantiers de la phase E** (occupation disque, purges des voix, remises à
  zéro, export RGPD) — inchangés, chacun garde son cadrage.
- **La levée automatique de la suspension après une restauration réussie** — l'ADR-0063 est formel,
  Papa lève. Le §5 se contente de le **dire**.

## Conséquences

**Ce que ça donne.** Le geste le plus destructif du produit cesse de se terminer par une consigne
de surveillance. Un échec survenu après le swap — aujourd'hui invisible sur **tous** les écrans —
devient lisible, avec l'étape où ça s'est arrêté et le motif, sans qu'une seule ligne soit écrite
dans l'histoire restaurée.

**Ce que ça coûte, et c'est nommé.**

- **Une exception à une règle décidée** (ADR-0062 §5). Bornée à cinq conditions, motivée sur le
  motif du §5 lui-même — mais c'est une exception, et la prochaine sera plus facile à demander.
  Le §Signaux la surveille.
- **Un champ publié disparaît** (`restauree_le`). Rien d'autre ne le lit aujourd'hui que la page
  qu'on modifie — vérifié — mais c'est une rupture de contrat, à faire des deux côtés en même
  temps. ⚠️ Le dépôt sait déjà que **ce genre de renommage est invisible aux tests unitaires** :
  la parade est le fichier de contrat capturé, pas un mock de plus.
- **Une borne non mesurée** au §1.5, assumée telle quelle, et dont l'unique effet est de cesser de
  demander.
- **La trace d'une interruption est écrasée par la restauration suivante de la MÊME archive** — le
  sidecar porte le nom de l'archive, pas celui du geste. C'est cohérent (le dernier geste fait
  foi) mais cela veut dire qu'un échec **se répare en silence** si on relance sans regarder.
  Écrit ici pour ne pas être découvert plus tard.
- **Trois requêtes de plus**, au plus, par geste — négligeable, et seulement après un clic.

## Le signal qui dirait qu'on s'est trompé

- 🔴 **Le renoncement du §1.5 se déclenche en usage normal.** Alors le geste a grandi au-delà de ce
  que la mesure de 2026-08-21 laissait croire. **Remesurer la durée réelle sur la vraie base — ne
  jamais se contenter de relever la borne**, ce qui masquerait la seule information intéressante.
- 🔴 **Un échec est vu pour la première fois dans un toast.** Le §3 a sauté, et il a sauté du
  mauvais côté : c'est exactement la faute que l'ADR-0041 §8 avait payée.
- **L'attente fait bouger quelque chose sous les doigts de Papa** — un champ, un dialogue, une
  sélection. Alors l'exception du §1 a été taillée sur un motif faux et doit être **révoquée**,
  pas rétrécie : l'ADR-0062 §5 reprend tel quel.
- **Papa relance une restauration parce qu'il n'a pas compris que la première avait réussi.** Le
  verdict du §2 est rendu de façon ambiguë — et sur ce geste-là, le coût de l'ambiguïté est un
  second swap.
- **Une deuxième surface réclame la même attente armée** (le Journal, Couverture, une autre page de
  réglages). Alors le mécanisme du §1 n'était pas une exception mais un manque général, et le
  canal poussé écarté ci-dessus redevient la vraie question — à rouvrir alors, franchement.
- **La section « ce que l'écran a démenti » du compte rendu de surface est vide.** La relecture
  visuelle n'a pas eu lieu, et l'ADR-0060 §2 dit quoi en conclure.

## Suivi

1. **Slice 1 — le verdict** : lecture complète du sidecar dans `GET /donnees`, champ `restauration`
   (§2), retrait de `restauree_le` des deux côtés en même temps, verrous serveur. Branche
   `feat/la-fin-d-un-geste-se-raconte`.
2. **Slice 2 — l'attente et les deux issues** : l'attente armée du §1, le toast de succès et l'état
   persistant d'échec (§3), les verrous front.
3. **Compte rendu de surface** (cas 4 de l'ADR-0060) : la formulation et le rendu, écrits **dans la
   même session que la relecture visuelle**, jamais reportés au lendemain.
4. **Read-before-code dus dans les slices :**
   - 🔴 **Mesurer une restauration sur la plus grosse base disponible** — la borne du §1.5 et la
     cadence du §1.3 en dépendent, et la seule mesure existante porte sur 9 172 lignes ;
   - 🔴 **Que répond `GET /donnees` PENDANT la fenêtre de swap** ? Les connexions sont tuées
     (`AdminShutdown`) et le pool se reconnaît — mais **ce n'est pas mesuré**, et l'attente du §1
     tombera dedans par construction. Une lecture en erreur pendant le swap ne doit **pas** être
     lue comme un échec du geste ;
   - le nom exact des étapes du sidecar tel qu'il doit apparaître à l'écran (`_ETAPES`), pour que
     `etape_arretee` ne soit jamais un texte réécrit à la main ;
   - vérifier qu'aucun autre appelant que `DonneesTab` ne lit `restauree_le` avant de le retirer.
5. **La preuve vivante** : le sidecar `zetis-2026-08-19-1844.tar.restauration.json` existe sur la
   cible de dev avec ses 8 étapes franchies — la page doit en rendre « restaurée » **et** le geste
   fabriqué à l'envers (un sidecar sans `termine_le`) doit rendre « interrompue » avec son étape.


## Amendement 1 — « Réussie » veut dire zéro écart, ici comme ailleurs — 2026-08-21

### Statut

**Proposé — 2026-08-21.** Tranche le point que le §2 avait laissé ouvert et que la slice 1 avait
signalé sans le décider. **Révoque le caractère BINAIRE du `verdict`**, et rien d'autre : le §1,
le §3, le §4, le §5 et le §6 ne bougent pas, non plus que le remplacement de l'ancien champ.

### Contexte — ce que la mesure a retourné

La slice 1 a implémenté le §2 à la lettre : `verdict` adossé au seul `termine_le`, `ecarts` comptés
à côté. Une restauration allée au bout en consignant un écart se lisait donc **« réussie · 1 écart »**.

**Mesures du 2026-08-21, sur le code et les sidecars réels :**

| Mesure | Résultat |
|---|---|
| Sites appelant `journal.ecart()` dans `restaurer_sauvegarde` | **1 seul** — et il ne dit rien de l'état restauré : *« recyclage ⑧ non demandé : aucun worker courant (appel hors file) »* |
| Restaurations réelles existantes, toutes cibles confondues | **1** (`…-1844.tar`) — `ecarts: 0`, 8/8 étapes |
| Le cas « terminée AVEC écarts » | **ne s'est JAMAIS produit** |
| 🔴 Le verdict de **vérification**, `sauvegarde.py:686` | `"verdict": "reussie" if not ecarts else "echec"` |

🔴 **C'est la dernière ligne qui tranche, et elle n'avait pas été vue au cadrage.** Sur la même
page, dans la même famille de sidecars, **le mot `reussie` signifie déjà « zéro écart »** — c'est
le verdict de `backup_verify`, celui-là même qui fait qu'une archive mérite le mot « sauvegarde »
(ADR-0065 §7). Le §2 lui donnait un second sens : « la séquence est allée au bout ». **Un mot,
deux significations, un seul écran** — exactement la divergence que ce dépôt paie à répétition.

⚠️ **L'argument qui semblait décisif ne l'est pas.** « Ne pas inventer un vocabulaire pour un cas
jamais observé » (ADR-0060) plaidait pour garder le binaire. Il ne s'applique pas : le troisième
cas n'est pas inventé pour une hypothèse, il est **imposé par un sens déjà en vigueur**. Sans lui,
le premier écart réel serait rendu « réussie » — et cet ADR l'aurait béni.

### Décision

**`restauration.verdict` prend trois valeurs**, et `reussie` retrouve le sens qu'il a partout
ailleurs sur cette page :

| Valeur | Sens |
|---|---|
| `reussie` | allée au bout **ET zéro écart** — le même sens que le verdict de vérification |
| `avec_ecarts` | allée au bout, mais **N écarts consignés** : le geste a abouti, quelque chose n'a pas eu lieu comme prévu |
| `interrompue` | pas allée au bout (`termine_le` nul) — inchangé |

🔴 **`avec_ecarts` n'est PAS un échec** et ne doit jamais être rendu comme tel : la base est
remplacée, les médias sont en place, le monde s'est réveillé suspendu. C'est un succès **qui se
dit avec sa réserve** — le seul écart existant aujourd'hui signifie que le worker n'a pas été
recyclé, donc qu'il tourne sur un schéma qu'il n'a pas rechargé (ADR-0066 §2.⑧).

**Le coût est nul, et c'est ce qui distingue ce cas de celui que l'amendement 1 de l'ADR-0066 a
écarté.** Là-bas, un statut neuf était refusé parce que le vocabulaire `queued|running|succeeded|
failed` est *« requêté partout »*. Ici, `restauration.verdict` est **né la veille**, il est lu à
**un seul endroit**, et rien d'autre ne l'interroge.

### Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Garder le binaire** (l'état livré par la slice 1) | Fait dire deux choses au même mot sur le même écran. Le premier écart réel serait rendu « réussie ». |
| **Un écart dégrade en `interrompue`** | Ment dans l'autre sens : le geste EST allé au bout, la base EST remplacée. Rendre ça comme une interruption enverrait Papa relancer une restauration — un second swap pour rien. |
| **Retirer ce `journal.ecart()`** (ce n'est pas un écart du geste mais du contexte d'appel) | Défendable, mais c'est rouvrir l'ADR-0066 depuis un chantier de surface. Et ça ne règle rien pour le prochain écart, qui pourrait, lui, être une vraie dégradation. |
| **`reussie_avec_ecarts`** | Garde le mot dans la valeur dégradée : on relit « réussie » en diagonale et on manque la réserve. C'est le défaut qu'on répare. |

### Périmètre

1. **Le §2 seul est amendé** — la table des valeurs de `verdict`. Le champ, son emplacement, le
   remplacement de l'ancien : inchangés.
2. **Aucune migration, aucune colonne, aucune route neuve.**
3. **Le contrat capturé ne change pas** : la seule restauration réelle porte `ecarts: 0`, donc
   `reussie` reste `reussie`. ⚠️ **À revérifier** au premier sidecar à écarts.

### Hors périmètre — nommé

- **Le rendu des trois valeurs** — surface, cas 4 de l'ADR-0060 : il se décide devant l'écran,
  avec l'emplacement que la slice 2 doit trancher de toute façon.
- **Toucher aux écarts de l'ADR-0066** — ni en retirer un, ni en ajouter.
- **Le verdict de vérification** — il est la référence ici, il ne se rediscute pas.

### Conséquences

**⚠️ Une divergence bornée, écrite plutôt que subie** : le code livré par la slice 1 (squash
`8a315e0`) implémente le binaire, donc **l'ADR et le code se contredisent tant que cet amendement
n'est pas appliqué**. La fenêtre est nommée ici et se referme en un commit — l'application est un
**cas 2** de l'ADR-0060 : une ligne dans `_resume_restauration`, les commentaires du schéma et du
type, un test-verrou. **À faire AVANT la slice 2**, qui rend ce verdict à l'écran.

### Le signal qui dirait qu'on s'est trompé

- **Un `avec_ecarts` est rendu comme un échec** à l'écran, ou pousse Papa à relancer une
  restauration : la valeur a été traitée comme une panne, ce que le §Décision interdit.
- **Aucun écart n'est jamais consigné en un an d'usage** : le troisième verdict était du zèle, et
  le retirer redevient une option — mesure à refaire sur les sidecars réels, pas de mémoire.
- 🔴 **Un écart survient qui dégrade réellement l'état restauré** (médias partiels, migration non
  jouée) : alors `avec_ecarts` est trop doux pour lui, et c'est un quatrième cas qu'il faut —
  pas un assouplissement de celui-ci.

### Suivi

1. **Application (cas 2)** : branche directe `fix/reussie-veut-dire-zero-ecart`, périmètre posé au
   premier message, pas d'`/ouverture`. Test-verrous dus : les trois valeurs, dont **un sidecar à
   `termine_le` posé ET `ecarts` non vide ⇒ `avec_ecarts`** (le cas qui n'existe pas encore en
   vrai, et qui doit exister en test).
2. La **slice 2** rend les trois valeurs — et son compte rendu de surface dira comment.
