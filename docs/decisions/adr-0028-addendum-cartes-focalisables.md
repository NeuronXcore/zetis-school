# Addendum ADR-0028 — Deux cartes ne pouvaient que s'éteindre

## Statut

Accepté — 2026-08-06.

> S'appuie sur : `adr-0028` **§5** (les KPI sont des filtres de focus, `CARD_SCOPES`) ;
> `adr-0028-addendum-kpi-a-renforcer` **§5 quinquies** (« un focus qui n'atténue plus rien est un
> clic qui ne veut plus rien dire ») et sa leçon sur le `Record` typé par l'union ;
> `adr-0028-addendum-memoire-quatre-vues` (les quatre vues, dont deux servent de preuve ici).
>
> **Ne rouvre pas** : le bandeau reste à cinq KPI ; `DashboardFocus` garde sa définition
> (`keyof DashboardKpis`) ; l'agrégat unique n'est pas touché — **aucune requête, aucun champ de
> payload, aucune migration**.
>
> **Ne révoque rien.** Il **complète** le §5 : le focus cesse d'être l'apanage du bandeau.

## Contexte

Le §5 pose que le focus est porté par les KPI. Conséquence non écrite, et jamais constatée jusqu'ici :

| carte | focus qui l'allument | sur 5 |
|---|---|---|
| `charge` — Charge de révision | `active_days`, `consolidated` | **2** |
| `chaine` — Chaîne de contenus | `open_gaps` | **1** |

> 🔴 **Ces deux cartes ne pouvaient que S'ÉTEINDRE.** Aucun geste de la page ne pouvait les
> désigner : leur mesure — la charge SRS à venir, l'entonnoir de production — n'est le sujet
> d'**aucun** des cinq KPI. Trois focus sur cinq éteignaient `charge`, quatre sur cinq éteignaient
> `chaine`, et rien ne pouvait les rallumer.

Relevé au navigateur le 2026-08-06, en confirmation : ce sont aussi **les deux seules cartes de la
page à ne contenir aucun élément cliquable** (0 bouton, contre 5 pour `notions`, 4 pour `memoire`).
Elles étaient passives de bout en bout.

## Décision

### §5 undecies — Le focus n'est plus l'apanage du bandeau

Une carte dont la mesure n'a **aucun KPI** peut prendre le focus elle-même, au clic sur son titre.
Deux cartes sont dans ce cas, et elles seules : `charge` et `chaine`.

**Un seul focus sur la page.** Le même `toggleFocus`, la même clé d'URL `?focus=`, le même second
clic qui relâche. Cliquer une carte **relâche le KPI pressé** : deux mesures allumées en même temps
diraient que la page répond à deux questions à la fois.

### §5 duodecies — `PageFocus`, type DISTINCT et non élargissement de `DashboardFocus`

```
DashboardFocus     = keyof DashboardKpis          (les 5 du bandeau)
DashboardCardFocus = "charge" | "chaine"          (les 2 cartes autonomes)
PageFocus          = DashboardFocus | DashboardCardFocus
```

Élargir `DashboardFocus` aurait été plus court **et faux** : il sert les `Record` du bandeau
(`KPI_LABELS`, `KPI_FOCUS_HINTS`, `KPI_ORDER`), qu'il aurait fallu remplir avec un libellé de KPI
pour `charge` et `chaine` — **qui n'en sont pas**. Un type qui ment se paie au premier lecteur.

> ⚠️ **Le garde `isFocus` doit être élargi EN MÊME TEMPS, et c'est le piège central de cet
> addendum.** Le dépôt a déjà payé ce bug exact sur le KPI « À renforcer » : le clic écrivait bien
> `?focus=…`, la liste blanche — un **tableau** incomplet — le refusait, la carte ne s'allumait
> **jamais**, et `tsc` restait muet. `FOCUSES` est un `Record<PageFocus, true>` : l'omission ne
> compile pas. **Quatrième fois que cette règle se paie** (`DashboardPeriod`, `COUNCIL_PERIOD_LABEL`,
> le KPI fragile, et celle-ci).

### §5 terdecies — Le TITRE, pas la carte

> 🔴 `ContentChainCard` contient des `<Link>` (« ↓ 47 à produire »). Rendre la carte entière
> cliquable aurait mis une **ancre dans un bouton** — HTML invalide, et le lien cesse de
> fonctionner.

La cible est donc l'en-tête. Elle reste juste le jour où ces cartes gagnent des contrôles.

**Le bouton se glisse DANS le `h3`, il ne le remplace pas.** Remplacer le titre par un bouton
retirerait ces deux cartes de la liste des titres de la page : une carte gagnée au clic contre une
carte perdue à la navigation au clavier n'est pas un échange acceptable.

**Un `⌖` marque l'affordance**, `aria-hidden` (le nom accessible reste « Charge de révision »).
Sans lui, « ceci se clique » ne s'apprendrait qu'au survol — or ces deux cartes ont vécu jusqu'ici
sans aucun clic : personne n'irait l'essayer.

### §5 quaterdecies — Ce que ces deux focus allument

| focus | cartes conservées | pourquoi |
|---|---|---|
| **charge** | `charge` · `memoire` | la vue « Révisions » montre les **mêmes** 14 jours à venir, et le passé qui les a produits |
| **chaine** | `chaine` · `memoire` · `lecture` | la ligne « couvertes par un cours validé » **est** l'effet de la production sur les notions ; la Lecture ZETIS propose quoi produire |

Deux et trois cartes sur huit — la portée reste étroite, comme `active_days` (2). Un focus qui
n'atténue plus rien est un clic qui ne veut plus rien dire.

> ⚠️ **La relation n'est pas symétrique, et n'a aucune raison de l'être.** Le focus `chaine` allume
> `lecture`, alors que le focus `fragile` n'allume **pas** `chaine`. « Quelles cartes justifient
> cette mesure » n'est pas « quelles mesures cette carte justifie ». Quiconque « corrigera » cette
> asymétrie élargira les deux portées jusqu'à ce que le focus n'atténue plus rien.

### §5 quindecies — La courbe « couvertes » revient, et c'est ce qui rend `memoire` justifiable

> 🔴 **Régression introduite la veille, trouvée en écrivant cet addendum.** La refonte en quatre
> vues a fait **disparaître de l'écran** la série `covered` : l'ancien tracé la portait, aucune des
> quatre nouvelles ne la reprenait, aucun test ne l'a signalé. C'est la **seule mesure du dashboard
> qui relie la PRODUCTION aux NOTIONS** — précisément le lien dont le focus `chaine` a besoin.

Elle revient sur la vue « Paliers », en **ligne pointillée de contexte** et non en bande : une
notion couverte par un cours validé peut être à n'importe lequel des quatre paliers, l'empiler
mentirait sur la partition. Elle ne peut plus confisquer l'échelle comme avant — l'axe est borné
par le programme entier, pas par le maximum d'une courbe.

### §5 sexdecies — Le verrou

> 🔴 **Cliquer l'en-tête d'une carte autonome doit l'ALLUMER pour de vrai.**

Quatre tests : le clic allume et relâche ; la carte atténue celles qui ne la justifient pas ; elle
relâche le KPI pressé ; le titre reste un titre.

> ⚠️ **Prouvé par sabotage.** Retirer `charge`/`chaine` de `FOCUSES` — en retypant la table en
> `Record<string, true>` pour que ça compile, exactement la forme du bug d'origine — fait tomber
> **3 tests sur 4**. Sans ce sabotage, ce verrou n'en serait pas un.

## Vérifications de read-before-code — effectuées le 2026-08-06

| Hypothèse de départ | Verdict |
|---|---|
| Quelque chose est `disabled` quand aucun focus n'est actif | ❌ **Rien** n'est `disabled` sur la page. La seule « désactivation » est l'atténuation visuelle de `DashboardCard` |
| Les cartes atténuées ont des contrôles devenus inertes | ❌ Elles restent cliquables. Le problème est ailleurs : `charge` et `chaine` n'ont **aucun** contrôle |
| Rendre la carte entière cliquable est le plus simple | ❌ `ContentChainCard` porte des `<Link>` — ancre dans un bouton |
| Élargir `DashboardFocus` suffit | ❌ Il sert les `Record` du bandeau, qu'il faudrait remplir de libellés de KPI pour deux non-KPI |
| La courbe `covered` est toujours affichée quelque part | ❌ **Disparue** depuis la refonte de la veille. Trouvée en cherchant ce qui justifierait le focus `chaine` |

## Ce que cet addendum ne fait pas

- **Il n'ajoute aucun KPI au bandeau.** Cinq mesures de tête est la limite posée par l'addendum
  précédent ; ces deux cartes portent leur mesure **là où elle est dessinée**.
- **Il ne rend pas les six autres cartes focalisables.** Leur mesure a déjà un KPI : leur donner un
  second chemin fabriquerait deux gestes pour un même focus.
- **Il ne mémorise rien de neuf** — `?focus=charge` passe par la clé d'URL existante.
- **Il ne touche à aucune donnée.** Aucune requête, aucun champ, aucune migration.

## Le signal qui dirait qu'on s'est trompé

- **Papa clique ces titres et ne comprend pas ce qui vient de s'éteindre.** L'indication « Filtre
  actif → … » n'aura pas suffi, et la réponse serait de nommer les cartes conservées, pas d'élargir
  la portée.
- **Quelqu'un rend les huit cartes focalisables « par cohérence ».** Le bandeau deviendrait
  décoratif et le focus perdrait son sens : il ne désigne pas une carte, il désigne une **mesure**.
- **Les portées s'élargissent au fil des chantiers** jusqu'à ce qu'un focus n'atténue plus rien.
  C'est le §5 quinquies qu'il faudra relire, pas contourner.

## Coût

1. `packages/types` : `DashboardCardFocus`, `PageFocus` (+ exports dans le baril).
2. `dashboardDerive.ts` : `CARD_SCOPES` en `PageFocus[]` avec quatre entrées de plus,
   `CARD_FOCUS_HINTS`, `matchesFocus` élargi.
3. `useDashboard.ts` : `FOCUSES` en `Record<PageFocus, true>`, signatures élargies.
4. `DashboardCard.tsx` : `focusKey` / `onToggleFocus`, le bouton dans le `h3`, l'indication de
   focus.
5. `ReviewLoadCard` / `ContentChainCard` : la prop passée ; six autres cartes : le type élargi.
6. `MemoryTrendCard.tsx` : la ligne « couvertes » restaurée sur la vue « Paliers ».
7. Tests : les quatre du §5 sexdecies, **et leur sabotage**.
