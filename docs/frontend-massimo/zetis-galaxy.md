> ⚠️ **BROUILLON NON RÉCONCILIÉ — à lire avec cette réserve.**
> Rédigé fin juin 2026, resté dans un `git stash` (`feat/design-system`) et récupéré le
> 2026-07-28 sans jamais avoir été confronté à l'implémentation. Quatre semaines de
> développement se sont écoulées entre-temps. **Ce document ne fait pas autorité en l'état** :
> la phrase « si une décision est ici, elle prime » vaut pour l'intention d'origine, pas pour
> l'existant. Vérifier chaque point contre le code avant de s'y fier ou de le faire appliquer.

# zetis-galaxy.md — Vue graphe de connaissances « ZETIS Galaxy »

> À placer dans `docs/frontend-massimo/zetis-galaxy.md`.
> Complète `navigation.md`, `DATA_MODEL.md` et `API_SPEC.md`.
> ZETIS Galaxy est une **vue**, pas une nouvelle fonctionnalité de données : le graphe existe déjà dans le modèle. Claude Code ne doit pas créer un modèle parallèle.

## 1. Objet

ZETIS Galaxy est la représentation animée des connaissances de Massimo, pensée pour motiver. C'est la page de progression de l'espace Massimo. Elle n'est **pas** un onglet de la navigation : on l'atteint par trois accès (§7).

## 2. Métaphore et cadrage

Métaphore unique : une **galaxie qu'on allume**. Une galaxie s'étend et s'illumine ; il n'y a pas de « trou », seulement des étoiles pas encore nées.

Règles de cadrage (non négociables, cf. `CLAUDE.md`) :

- Croissance, jamais manque. On parle d'« étoiles à découvrir », pas de « notions ratées ».
- **Pas de rouge.** Une notion non vue est sombre/neutre (« à découvrir »), pas rouge (« échec »).
- L'animation récompense un **événement réel** d'apprentissage, jamais une boucle décorative ou un timer.

## 3. Hiérarchie visuelle

- **Galaxie** = l'ensemble des connaissances de Massimo (aperçu sur l'Accueil, vue d'ensemble).
- **Système / constellation** = une matière (le niveau qu'on zoome).
- **Étoile** = une notion (`Skill`).
- **Lien stellaire** = un prérequis acquis qui connecte deux étoiles (`Skill.prerequisite_skill_ids`, `Skill.parent_skill_id`).

## 4. Source de données

Le graphe se dérive directement du modèle existant, sans nouvelle table :

- **Nœuds** = `Skill` (`id`, `subject_id`, `name`, `level`, `parent_skill_id`, `prerequisite_skill_ids`).
- **Arêtes** = `parent_skill_id` (hiérarchie) et `prerequisite_skill_ids` (prérequis).
- **Luminosité / état d'un nœud** = `SkillMastery.status` du couple (`student_id`, `skill_id`).

## 5. États lumineux (mapping `SkillMastery.status`)

| `status`   | Rendu étoile                         | Libellé enfant            |
|------------|--------------------------------------|---------------------------|
| `unknown`  | sombre, contour léger                | « À découvrir »           |
| `weak`     | faible lueur                         | « On commence »           |
| `learning` | lueur moyenne                        | « En construction »       |
| `solid`    | brillante                            | « Bien acquis »           |
| `mastered` | pleine, halo discret                 | « Maîtrisé »              |

Aucun état n'est rouge ni négatif. `mastery_score` (0-100) peut moduler finement l'intensité à l'intérieur d'un état.

## 6. Contrat API

Étendre la route existante plutôt que d'en improviser une :

`GET /progress/skills?subject_id=` renvoie `{ nodes, edges }` :

```json
{
  "nodes": [
    {
      "skill_id": "uuid",
      "name": "Fractions équivalentes",
      "subject_id": "uuid",
      "level": "4e",
      "status": "learning",
      "mastery_score": 58
    }
  ],
  "edges": [
    { "from": "uuid", "to": "uuid", "type": "prerequisite" },
    { "from": "uuid", "to": "uuid", "type": "parent" }
  ]
}
```

Sans `subject_id`, renvoyer la vue d'ensemble agrégée par matière (systèmes/planètes).

## 7. Trois accès (pas un onglet)

1. **Bandeau XP** — accès permanent, tap → galaxy plein écran.
2. **Aperçu sur l'Accueil** — quelques étoiles vivantes ; tap → plein écran. C'est l'accès qui crée l'envie au quotidien.
3. **Fin de mission (option retenue)** — quand une notion est maîtrisée, **annonce discrète** au bandeau XP (« +1 étoile », étoile qui pulse) + invitation à ouvrir la galaxy. **Pas de plein écran imposé** : on ne casse pas l'élan de Massimo. Le plein écran est **réservé aux paliers** (ex. une matière entière qui s'illumine).

## 8. Déclencheurs d'animation (reliés à `learning_events`)

L'animation est pilotée par les événements, pas par un timer :

- **Étoile qui s'allume** : quand `mastery_score` franchit le seuil d'un nouvel état (ex. `learning → solid`), suite à un `learning_event` (typiquement `event_type=eli5_reverse` ou `quiz_attempted`).
- **Lien stellaire qui se connecte** : quand un prérequis passe à `solid`/`mastered`, on relie les deux étoiles.
- **Source de vérité** : `learning_events` est le flux qui alimente l'animation. Une étoile ne « brille » jamais sans événement correspondant.

Branchement Étape 10 : un reverse-eval réussi (`POST /ai/eli5/reverse-evaluate`) fait monter `mastery_score`, écrit un `learning_event`, et déclenche l'illumination — c'est la récompense visible de toute la boucle pédagogique.

## 9. Règle de scope (lisibilité et perf)

- **Une constellation par matière**, jamais un seul graphe global en force-directed (illisible et lourd, surtout sur iPhone — phase 11).
- Vue d'ensemble = matières en systèmes/planètes ; on **zoome** dans une matière pour voir ses étoiles.
- Limiter le nombre de nœuds affichés simultanément (pagination par chapitre/niveau si une matière est dense).

## 10. Techno conseillée

- `react-force-graph` ou `cytoscape.js` pour le rendu graphe.
- Limiter les nœuds visibles ; animations sobres (apparition/illumination), respect de `prefers-reduced-motion`.
- Pas de logique métier dans le composant : les états viennent de l'API (§6), le composant ne fait que rendre.

## 11. Pour Claude Code

À faire :

- Dériver le graphe des tables existantes (`skills`, `skill_mastery`) ; aucune table « galaxy » dédiée.
- Étendre `GET /progress/skills` au format `{ nodes, edges }`.
- Mapper strictement `status` → luminosité selon §5, sans rouge.
- Câbler l'illumination sur `learning_events`, pas sur un timer.
- Implémenter les trois accès (§7) et l'option « fin de mission » discrète par défaut.

À éviter :

- Faire de ZETIS Galaxy un 6ᵉ onglet de navigation.
- Un graphe global unique non scoppé par matière.
- Toute couleur ou tout libellé suggérant l'échec ou le manque.
- Une animation décorative déconnectée des événements d'apprentissage.
