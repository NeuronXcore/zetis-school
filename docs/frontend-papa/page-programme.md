# Page Papa — Programme (éditeur du référentiel)

## Objectif

Éditer le référentiel de programme de l'année active : générer les chapitres d'une
matière par IA, en ajouter à la main, valider/rejeter/éditer/réordonner — selon les
règles de co-construction de l'ADR-0009 §3. La page rend visibles la **source** de
chaque chapitre (IA / Manuel) et son **statut de validation**, indépendamment de son
statut de progression. Depuis le Lot 2, l'état déplié d'un chapitre expose ses
**leçons** et leurs notions, avec les mêmes règles de co-construction.

Maquettes de référence validées le 2026-07-03 (session Claude) : page Programme,
état chapitre déplié, formulaire d'ajout inline.

## Principes UX (issus de l'ADR-0009)

- **Pas de mode global** : Générer (IA) et Ajouter (manuel) coexistent toujours,
  côte à côte dans le header. Générer = bouton plein (chemin majoritaire),
  Ajouter = secondaire.
- **Deux badges par ligne, jamais plus** : source (`IA` violet / `Manuel` émeraude)
  + validation (`Validé` émeraude / `À valider` ambre / `Rejeté` rouge).
- **Les actions dépendent de l'état** : « Valider » et « Rejeter » uniquement sur
  `pending` ; « Régénérer » uniquement sur `rejected` ; édition inline et suppression
  partout (confirmation avant suppression) ; les chapitres `manual` ne sont jamais
  affectés par une régénération (le backend le garantit, l'UI le rappelle).
- **La génération est longue** (~10-30 s, appel cloud synchrone) : bouton désactivé +
  spinner + message d'attente pendant l'appel ; en cas de 503 (clé absente), afficher
  le message backend tel quel (il explique le repli possible).

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────────┐
│ Programme · cycle 4 — 4e            [⚡ Générer] [+ Ajouter]     │
│ Version 2020 · référentiel co-construit                          │
├──────────────────────────────────────────────────────────────────┤
│ (Maths) (Français) (Histoire-géo) (SVT) (Physique-chimie) (+3)   │  ← pills matière
├──────────────────────────────────────────────────────────────────┤
│ ↕ Nombres relatifs et calcul          [IA] [Validé]        ▼    │
│ ↕ Théorème de Pythagore               [IA] [À valider]           │
│     « Proposé par ZETIS »            [Valider] [Rejeter] ✎ 🗑    │
│ ↕ Programmation Scratch               [Manuel] [Validé]   ✎ 🗑   │
│     « intouchable par la régénération »                          │
│ ↕ Proportionnalité (grisé)            [IA] [Rejeté]  [Régénérer] │
├──────────────────────────────────────────────────────────────────┤
│ ⓘ La régénération ne touche jamais les chapitres manuels ni      │
│   validés. Chaque génération est tracée (cahier de bord IA).     │
└──────────────────────────────────────────────────────────────────┘
```

### État déplié (chevron ▼ sur une ligne)

Le dépliage charge les leçons du chapitre **à la demande** (`GET
/api/chapters/{id}/lessons` — jamais au chargement de la page : une matière peut
avoir 8 chapitres × 12 leçons).

En tête du panneau déplié : la description (texte humain), puis les métadonnées du
chapitre (thèmes, classe suggérée, badge de répartition `officielle`/`interpretee`).

Puis la liste des leçons, chacune sur une ligne :

```txt
┌────────────────────────────────────────────────────────────────┐
│ 📄 Découvrir la relation dans le triangle rectangle            │
│    notions : (hypoténuse) (carrés des côtés) (égalité)         │
│                                    [IA] [Validé]               │
│ 📄 Calculer une longueur                                       │
│    notions : (côté de l'angle droit) (racine carrée)           │
│                    [IA] [À valider]  [Valider] [Rejeter] ✎ 🗑  │
│ 📄 Réciproque (exercice type brevet)                           │
│                                    [Manuel] [Validé]  ✎ 🗑     │
├────────────────────────────────────────────────────────────────┤
│ [+ Ajouter une leçon]   [⚡ Proposer des leçons]               │
└────────────────────────────────────────────────────────────────┘
```

**Mapping des statuts (décision Slice A du Lot 2 — asymétrie assumée avec les
chapitres)** :

| Donnée API (`Lesson`)            | Badge UI     |
|----------------------------------|--------------|
| `created_by: ai`                 | `IA` (violet)|
| `created_by: parent`             | `Manuel`     |
| `status: draft`                  | `À valider`  |
| `status: validated`              | `Validé`     |
| `status: archived`               | **non affichée** |

Les leçons `archived` (= rejetées par Papa ou retirées du flux) ne sont PAS
affichées : elles sont hors du flux et remplacées à la régénération. Pas de badge
« Rejeté » ni « Archivé » côté leçons — si un besoin de consultation émerge, ce
sera un toggle ultérieur, pas la V1.

**Notions** : chips en lecture seule à l'affichage (dépliées par l'API :
`{skill_id, name}`). Éditables dans le formulaire ✎ (ajout/retrait par nom) pour
relire et corriger la proposition IA avant validation : l'enregistrement REMPLACE le
rattachement (`PATCH /lessons/{id}` avec `notions`, upsert par nom normalisé) — les
`Skill` elles-mêmes ne sont jamais supprimées (elles vivent dans le référentiel de
skills).

**Actions par état** (même fonction pure testée que pour les chapitres, étendue) :
`Valider`/`Rejeter` sur `draft` uniquement ; édition (titre/résumé/notions) et
suppression (avec confirmation) sur toute leçon visible ; réordonnancement par boutons
monter/descendre.

**« Proposer des leçons »** : visible uniquement si le chapitre est validé ou
manuel (le backend renvoie 409 sinon — l'UI ne montre simplement pas le bouton
dans les autres cas). Requête longue (~10-30 s) : réutiliser le composant de
progression estimée des chapitres (même pattern que le pilotage capsules). Après
génération : re-fetch des leçons du chapitre, panneau maintenu ouvert.

**« Ajouter une leçon »** : formulaire inline dans le panneau (Titre requis,
Résumé optionnel), badge `Manuel` affiché d'emblée, créée validée d'office —
symétrie exacte avec l'ajout de chapitre.

### Modale de lecture du cours (action 📖 par leçon visible)

Chaque leçon visible (draft incluse — relire le cours aide à valider) porte une
action 📖 qui ouvre une modale : titre + badges + résumé, puis le **cours complet**
(`lesson.content`, markdown rendu). Si le cours n'existe pas encore : état vide +
bouton « ⚡ Rédiger le cours » → `POST /api/lessons/{id}/generate-content`, requête
longue synchrone (~40-60 s) sur le **moteur local** (`get_provider`, qwen3.6 — jamais
la dérogation cloud `curriculum_*`, réservée au référentiel), barre de progression
estimée réutilisée (calibrage 42 s, pattern capsules). La réponse est la leçon
complète : remplacement dans le cache, la modale se met à jour sans re-fetch.
« ↻ Régénérer le cours » écrase l'existant (même route). Erreurs (409 archivée,
502 génération) : `detail` backend verbatim DANS la modale. Trace `ai_jobs`
(`job_type="lesson_content"`).

La modale permet aussi de **trancher sur place** après lecture, sans repasser par la
liste : boutons `Valider`/`Rejeter` dans l'en-tête, sur une leçon `draft` uniquement
(même règle pure que la ligne). Après validation, le badge passe à `Validé` et la
modale reste ouverte ; un rejet archive la leçon (hors du flux) → la modale se ferme
d'elle-même.

**Rédaction en lot** : « ⚡ Rédiger les cours manquants (N) » dans le pied du panneau —
N = leçons **validées sans cours** du chapitre (les drafts se lisent une à une avant
validation). Séquentiel (N × ~40-60 s, moteur local), progression réelle `n/total` avec
le titre en cours, **annulable entre deux leçons**, arrêt à la première erreur (verbatim).
Valider une leçon ne rédige JAMAIS son cours tout seul : deux actes distincts.

### Formulaire d'ajout inline (clic « Ajouter un chapitre »)

Carte insérée en tête de liste, bordure émeraude :

- Badge `Manuel` affiché d'emblée + rappel « validé d'office, intouchable par la
  régénération » ;
- Champs : Titre (requis), Position (select : à la fin / après <chapitre> / au début),
  Description (optionnelle, visible par Massimo) ;
- Boutons : Créer (plein) / Annuler.

### Réordonnancement

Boutons monter/descendre par ligne (pas de drag & drop en V1) → appel `reorder`
avec la liste complète ordonnée des ids.

## États de page

- **Chargement** : Spinner partagé (`@zetis/ui`).
- **Vide** (matière sans chapitre) : EmptyState avec les deux CTA (Générer / Ajouter).
- **Erreur** : message + bouton réessayer ; 503 génération = message backend verbatim.
- **Pendant génération** : liste inchangée, bouton Générer en état loading.

## Données API (contrat : `packages/types/src/curriculum.ts` — source de vérité)

- `GET /api/subjects` — pills de matières (croisé avec l'année active pour obtenir
  le `school_year_subject_id` de chaque matière).
- Liste des chapitres d'une matière de l'année active (endpoint de lecture du module
  curriculum — vérifier le chemin réel dans `router.py`).
- `POST .../generate-chapters` — passe 1.
- `POST` chapitre manuel · `PATCH` (nom/description/période + validate/reject) ·
  `DELETE` · `POST .../reorder`.
- Leçons (Lot 2) : `GET /api/chapters/{id}/lessons` · `POST .../generate-lessons`
  (409 si chapitre ni validé ni manuel) · `POST .../lessons` (manuel) ·
  `PATCH /lessons/{id}` · `POST /lessons/{id}/validate` et `/reject` ·
  `DELETE /lessons/{id}` · `POST .../lessons/reorder` ·
  `POST /lessons/{id}/generate-content` (cours markdown, moteur local, 409 si archivée).

## Thème

Papa émeraude (`@zetis/ui`, tokens sémantiques). Badges : IA = violet clair,
Manuel/Validé = émeraude clair, À valider = ambre clair, Rejeté = rouge clair —
texte foncé de la même famille que le fond (jamais noir pur).

## Hors périmètre de cette page

Bandeau d'ancrage RAG (viendra avec l'ancrage, Lot 2 backend restant) ; case
« proposer des leçons juste après » du formulaire d'ajout de chapitre (le bouton
du panneau déplié couvre le besoin en deux clics) ; drag & drop ; édition des
métadonnées de chapitre ; consultation des leçons archivées ;
page Années scolaires (étape dédiée).
