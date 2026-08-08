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

## Les deux lecteurs

| Appelant | Ce qu'il en fait |
|---|---|
| `diagnostics.lacunes_de_passation` | le badge de la station ② et le geste qu'il propose |
| `progress.open_gaps` | le champ `content_state` de la page Lacunes, et son filtre `contenu=absent` |
"""

from sqlalchemy.orm import Session

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
    par_notion = lessons_by_skill(db, skill_ids)
    etats: dict[int, str] = {}
    for skill_id in skill_ids:
        lecons = par_notion.get(skill_id, [])
        if not lecons:
            etats[skill_id] = CONTENU_AUCUNE_LECON
        elif any(lecon.status == "validated" for lecon in lecons):
            etats[skill_id] = CONTENU_OK
        else:
            etats[skill_id] = CONTENU_COURS_BROUILLON
    return etats
