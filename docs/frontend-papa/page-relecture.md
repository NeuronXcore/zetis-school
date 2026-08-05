# Page Papa — File de relecture

> Réalise `adr-0039`. Route `/relecture`, sidebar juste après la Couverture.
> Le bouton qui l'ouvre existait, **inerte**, depuis l'`adr-0023` : *« File de relecture — chantier
> distinct, non livré »*.

## Ce que la page répond

*« Qu'est-ce qui est produit et n'atteint pas encore Massimo, et par quoi je commence ? »*

Une ligne = un contenu. Deux gestes : **valider**, **rejeter**. Un lien de sortie : **Voir →**,
pour lire avant de trancher.

C'est le complément de deux surfaces qui ne pouvaient pas y répondre :

- la **file « À décider »** du Dashboard **trie** (une ligne par famille) et n'a pas vocation à
  devenir une liste de tâches — c'est écrit au-dessus de `DecisionQueue.tsx` ;
- la **Couverture** est leçon-centrée, en quatre colonnes : les **capsules** (pas de leçon) et les
  **chapitres** (pas de leçon parente) n'y entrent pas.

## Structure

### En-tête

Sablier + titre + sous-titre : *« Ce qui est produit et n'atteint pas encore Massimo. Une ligne = un
contenu. »*

### Pastilles de famille (6)

`Tout · N` puis 📖 Cours · 📄 Fiches · 🧠 Mindmaps · 🎬 Capsules · 🗂️ Chapitres.

Pilotées par `?kind=`, `aria-pressed`, second clic = « Tout ». Elles restent cliquables à zéro —
même arbitrage que les KPI de la Couverture (choix du user, 2026-07-28).

> 🔴 **Les compteurs ne bougent JAMAIS avec le filtre.** Le serveur sert `counts` et `subjects` non
> filtrés (`adr-0039 §4`). Des pastilles qui s'effondrent au premier clic obligeraient à repasser
> par « Tout » pour savoir ce qui reste ailleurs — leçon déjà payée deux fois dans ce dépôt
> (`coverageFilters.ts::filterCounts`, et le piège `allSubjects` de la Couverture).

### Pastilles de matière

`SubjectFilterChips` de `@zetis/ui`, la même brique que le Dashboard, la Couverture et le cahier de
bord. Pilotées par `?subject=`. Masquées s'il n'y a qu'une matière dans la file.

### Liste

Groupée par famille, dans **l'ordre du curriculum** (matière → chapitre → titre). Une ligne porte :

| | |
|---|---|
| Titre | celui de l'objet ; pour une fiche ou une mindmap, **celui de sa leçon** — « Fiche 12 » ne dirait rien de ce qu'il y a à relire |
| Fil | `matière › chapitre › leçon`, **partiel par nature** et **sans répétition du titre** |
| Voir → | `reviewLink()`, vers la page de pilotage du type |
| Valider / Rejeter | `ContentLifecycleActions` en mode réduit |

Le fil d'un **chapitre** s'arrête à sa matière, et **c'est l'information** : c'est lui le nœud, ses
leçons ne peuvent pas être validées avant lui. Celui d'une **capsule** peut n'avoir aucun chapitre.

### Actions

**Valider** part directement. **Rejeter** passe par un `ConfirmDialog` : valider est réversible par
régénération, rejeter une leçon l'archive.

**Après une action, la ligne quitte la liste — optimiste, sans rechargement** (patron
`DemandesPage::triageContent`) : recharger ferait sauter la liste sous le curseur au moment précis
où Papa enchaîne. En cas d'échec, la file est relue **puis** le message posé — l'ordre compte, le
rechargement efface l'erreur s'il vient après.

La file se relit aussi **au retour de focus**, jamais au chronomètre : c'est exactement le moment où
la réponse a pu changer (Papa revient d'une page de pilotage), et ça ne coûte rien le reste du temps.

### État vide

Du texte, sans illustration ni félicitation. Deux formulations, parce que ce ne sont pas deux
situations :

- file réellement vide → *« Rien n'attend de relecture. Tout ce qui est produit atteint Massimo. »*
- vide **sous filtre** → *« Aucun contenu ne correspond à ce filtre — les compteurs ci-dessus disent
  où en trouver. »*

Récompenser une file vide installerait côté Papa la mécanique que ZETIS refuse côté Massimo.

## Ce que la page s'interdit

Elle regarde le même stock que la Couverture et hérite des interdits de son §F.2 :

- **aucune barre de progression, aucun « X/Y relus », aucun pourcentage** — un compteur d'avancement
  transforme « relire ce qui compte » en « vider la file » ;
- **aucun classement par matière** ;
- **aucun contrôle de tri** — « le plus vieux d'abord » est un reproche daté ;
- **aucun bouton « tout valider »** — c'est l'agrégat de provenance que le §F.2 refuse, déplacé
  d'une page ;
- **ni Éditer, ni Régénérer, ni Supprimer** — relire n'est pas produire ; ces gestes ont leurs pages.

Quatre de ces cinq interdits sont tenus par des **tests-verrous** dans `RelecturePage.test.tsx`.

## Périmètre des données

**Année active uniquement**, comme la Couverture (`adr-0039 §3`). Le compteur du Dashboard a
**baissé** au déploiement : ce qui a disparu est exactement ce qu'aucune page ne savait ouvrir.

**Les quiz n'y sont pas** : `quizzes` n'a pas de `validation_status`, il est servi sans gate par
doctrine (`adr-0014 §2`). Un test le verrouille pour que l'absence se lise comme un choix.

## Contrat

`GET /api/parent/review-queue?subject_id=&kind=` → `ReviewQueueOut` (`counts`, `subjects`, `items`).
**Lecture seule**, `require_parent`, module `review_queue`.

Les gestes passent par les endpoints **par type**, via l'adaptateur pur `lib/reviewActions.ts` — la
file oriente, elle ne concentre pas les pouvoirs :

| famille | valider | rejeter |
|---|---|---|
| cours | `POST /api/lessons/{id}/validate` | `/reject` |
| fiche | `POST /api/fiches/{id}/validate` | `/reject` **(créé par ce chantier)** |
| mindmap | `POST /api/mindmaps/{id}/validate` | `/reject` **(créé par ce chantier)** |
| capsule | `POST /api/capsules/{id}/validate` | `/reject` |
| chapitre | `PATCH /api/chapters/{id}` avec `validation_action` | idem |

## Hors périmètre

Les quiz · la validation en lot · la pastille de compteur en sidebar (le nombre vit déjà sur le
Dashboard, une seconde source pour la même mesure est ce que l'addendum `adr-0028` interdit) · le
rattrapage des objets `pending` hors année active · tout aperçu du contenu sur place.
