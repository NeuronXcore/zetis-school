"""« De quoi dispose-t-on pour retravailler cette notion ? » — une seule réponse (ADR-0042).

Module **neutre**, sur le patron de `lesson_resolution` : aucun domaine ne le possède, plusieurs
le lisent. Il est né le 2026-08-08 avec son **second** lecteur, pas avant — la fonction vivait
jusque-là en privé dans `diagnostics.service`, par accident d'antériorité.

## Pourquoi ici, et pas dans `lesson_resolution`

`lesson_resolution` écrit qu'il ne porte **aucun filtre de statut de leçon**, « c'est là que les
appelants diffèrent légitimement » — imposer le `validated` de la galaxie à la production
supprimerait le palier 3. Cette règle-là n'est **pas** amendée : classer n'est pas filtrer, mais la
frontière est écrite noir sur blanc et on ne la réinterprète pas en passant. D'où un domicile à part.

## Pourquoi pas dans `diagnostics`

Le concept parle de **leçons**, pas de diagnostics. `progress` en a besoin pour dire à la page
Lacunes ce qui est produisible ; l'y faire chercher lui donnerait une dépendance sur `diagnostics`
que rien ne justifie. Le dépôt a déjà payé ce genre de logement de fortune : `lesson_resolution`
est né parce que trois modules répondaient différemment à la même question.

## Les CINQ lecteurs

> 🔴 **Ce tableau en annonçait DEUX jusqu'au 2026-08-09**, et c'était faux : `graphify affected`
> en rend cinq. L'écart comptait — il change ce qu'on peut se permettre de modifier ici. Toute
> évolution de la **signature** de `etat_contenu` touche ces cinq appelants ; c'est pourquoi
> `lecons_visees` (ci-dessous) est une fonction **sœur** et non un retour élargi.

| Appelant | Ce qu'il en fait |
|---|---|
| `diagnostics.lacunes_de_passation` | le badge de la station ② et le geste qu'il propose |
| `diagnostics.apercu` | le même badge, sur l'aperçu d'une passation |
| `diagnostics.result_detail` | le même badge, sur le détail d'un résultat |
| `progress.open_gaps` | le champ `content_state` de la page Lacunes, et son filtre `contenu=absent` |
| `progress.open_gap_count` | rien — il compte, mais il paie le coût (il appelle `open_gaps`) |
"""

from sqlalchemy.orm import Session

from app.db.models import Lesson
from app.modules.lesson_resolution import lessons_by_skill

# État du contenu d'une notion, du point de vue de la remédiation (ADR-0042).
#
# 🔴 **`aucune_lecon` et `cours_brouillon` ne se confondent pas, et le geste de Papa diffère.**
# Sans leçon, le quiz s'ancre sur la notion — la lacune est *réparable*, sous réserve d'une source
# RAG. Avec une leçon en brouillon, la voie notion **refuse** (dernier recours réservé aux notions
# sans leçon) : il faut valider le cours. Un état unique rendrait les deux indistinguables.
CONTENU_OK = "ok"
CONTENU_AUCUNE_LECON = "aucune_lecon"
CONTENU_COURS_BROUILLON = "cours_brouillon"


def etat_contenu(db: Session, skill_ids: list[int]) -> dict[int, str]:
    """Par notion : de quoi dispose-t-on pour la retravailler ?

    ⚠️ **Le plancher RAG n'est PAS consulté ici.** L'ADR-0042 ne rouvre la voie notion que si une
    source validée documente la matière — mais le vérifier coûte un appel d'embedding *par notion*,
    sur une surface de lecture qu'on ouvre à chaque affichage. On sert donc « aucune leçon », qui
    est un fait de structure, et la page propose le geste ; c'est la génération qui refusera, avec
    son message, si la source manque. Une jauge qui mentirait par excès d'optimisme vaut mieux
    qu'une page qui met huit secondes à s'afficher.

    Batch par `lessons_by_skill` : une notion sans leçon n'apparaît pas dans le résultat, et c'est
    l'information — le même trou qui a coûté l'ADR-0037 puis l'addendum ADR-0034.
    """
    if not skill_ids:
        return {}
    return {skill_id: etat for skill_id, (etat, _lecon) in etat_et_lecon(db, skill_ids).items()}


def etat_et_lecon(db: Session, skill_ids: list[int]) -> dict[int, tuple[str, Lesson | None]]:
    """État **et** leçon visée, en UNE passe — c'est ce que `progress.open_gaps` doit appeler.

    🔴 **Ne PAS appeler `etat_contenu` puis `lecons_visees` dans le même flux** : ce serait deux
    passes sur `lessons_by_skill`, donc deux requêtes là où l'ADR-0047 Décision 5 en promet zéro de
    plus — et `open_gap_count` les paierait une seconde fois, puisqu'il appelle `open_gaps`.
    Les deux fonctions de projection existent pour les appelants qui ne veulent qu'une moitié.

    Rend `{skill_id: (état, leçon visée | None)}` pour **chaque** notion demandée.
    """
    if not skill_ids:
        return {}
    par_notion = lessons_by_skill(db, skill_ids)
    out: dict[int, tuple[str, Lesson | None]] = {}
    for skill_id in skill_ids:
        lecons = par_notion.get(skill_id, [])
        if not lecons:
            out[skill_id] = (CONTENU_AUCUNE_LECON, None)
            continue
        # `lecons` est déjà trié (`updated_at` DESC, puis `id`) par `lessons_by_skill` : le premier
        # du statut cherché EST le départage, on n'en pose pas un second.
        validee = next((lecon for lecon in lecons if lecon.status == "validated"), None)
        if validee is not None:
            out[skill_id] = (CONTENU_OK, validee)
        else:
            out[skill_id] = (CONTENU_COURS_BROUILLON, lecons[0])
    return out


def lecons_visees(db: Session, skill_ids: list[int]) -> dict[int, int]:
    """Par notion : la leçon que le GESTE proposé doit ouvrir (ADR-0047 Décision 4).

    **La leçon suit l'état visé par le geste**, jamais l'inverse :

    | État | Leçon rendue | Parce que le geste est… |
    |---|---|---|
    | `cours_brouillon` | une leçon en **brouillon** | « Valider le cours de cette leçon → » |
    | `ok` | une leçon **validée** | « Relire la leçon → » |
    | `aucune_lecon` | **absente du résultat** | le geste vise la notion, pas une leçon |

    🔴 **Ouvrir une leçon déjà validée sous le libellé « Valider le cours » recréerait le défaut
    que l'ADR-0047 corrige** — un libellé qui promet ce que le lien ne livre pas.

    ⚠️ **Le départage n'est PAS réinventé ici.** Une notion porte jusqu'à quatre leçons
    (« Priorités opératoires » en avait quatre le 2026-08-09), et `lessons_by_skill` les trie
    **déjà** par `updated_at` décroissant puis `id`. On prend donc la première du bon statut. L'ADR
    prescrivait d'abord « l'`id` le plus grand » : c'était un SECOND ordre de « la plus récente »
    dans un dépôt qui en a déjà un, et l'ADR a été corrigé plutôt que le code.

    ⚠️ **Fonction sœur, pas un retour élargi** : `etat_contenu` a **cinq** appelants, dont trois
    dans `diagnostics` qui n'ont que faire d'une leçon. Élargir sa signature les aurait tous touchés
    pour le besoin d'un seul.

    ⚠️ **Projection de `etat_et_lecon`, pour un appelant qui ne veut que cette moitié.** Dans un
    flux qui a AUSSI besoin de l'état — `progress.open_gaps` — appeler les deux ferait deux passes
    sur `lessons_by_skill` : c'est `etat_et_lecon` qu'il faut appeler là-bas, une seule fois.
    """
    return {
        skill_id: lecon.id
        for skill_id, (_etat, lecon) in etat_et_lecon(db, skill_ids).items()
        if lecon is not None
    }
