"""Résolution d'un scope de production (ADR-0031 §2, ex-ADR-0023 §2).

`plan(scope) -> [skill_id]`. Un chapitre se résout en ses leçons → `lesson_skills` → notions.
**Fonction pure** : aucun appel IA, aucune écriture, aucun effet de bord, ordre déterministe.

## Un substrat, deux consommateurs — littéralement

L'étape leçon → notions n'est pas réécrite : `plan` appelle `coverage.notions_by_lesson`, la
fonction que la matrice utilise déjà. La page affiche donc ce que la production exécutera, **par
construction** et pas par coïncidence surveillée. Deux résolutions jumelles se paieraient comme le
prédicat de disponibilité s'est payé le 2026-07-30 — une porte ouverte sur du vide. Un test
d'accord (`test_production_scope.py`) tient la propriété de bout en bout.

## Deux écarts avec la matrice, tous deux voulus

**1. Le grain.** La matrice est LEÇON-centrée : une notion rattachée à trois leçons y apparaît
trois fois, une par ligne. `plan` est NOTION-centrée : on équipe une notion **une fois**. D'où une
déduplication, qui préserve le premier rang d'apparition.

**2. Le filtre `validated` n'est PAS ici, et c'est une décision.** L'ADR-0023 §2 écrivait « ses
leçons **validées** ». Le read-before-code du 2026-08-02 a montré que la matrice, elle, retient
`status != "archived"` — **et elle a raison** : son travail est de montrer ce qui MANQUE, brouillons
compris. Mettre le filtre dans le résolveur aurait donc forcé deux résolutions différentes, c'est-à-
dire perdu le substrat partagé pour gagner un filtre d'une ligne.

> Le gate de validation appartient à la **production**, pas au résolveur. `equip_notion` le porte
> déjà : sans leçon validée et sans contenu, il saute les dérivés et le signale.

⚠️ Cet écart avec la lettre de l'ADR-0023 §2 est **assumé et à consigner** dans l'addendum ADR-0031
en préparation — celui qui traite aussi de la fusion des deux passes du §7.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Lesson
from app.modules.production.coverage import notions_by_lesson


def plan(db: Session, *, chapter_id: int) -> list[int]:
    """Les notions d'un chapitre, dédupliquées, dans l'ordre de la matrice.

    L'étape leçon → notions **n'est pas réécrite ici** : c'est `notions_by_lesson`, la fonction que
    la matrice de couverture utilise déjà. `plan` n'ajoute que l'étape chapitre → leçons. Une
    seconde implémentation « qui donne le même résultat » serait une divergence en sursis — un test
    d'accord la rattraperait, mais seulement après qu'elle a été écrite.

    Coût assumé : `notions_by_lesson` calcule aussi les fractions cartes/capsules, inutiles ici.
    Elles sont bornées par les leçons du chapitre, et ceci tourne une fois par lot de production,
    pas à chaque rendu de page. **On paie la requête, pas la divergence.**

    Ordre : leçon (`sort_order`, puis `id`), puis notion (`id`). Un ordre instable ferait varier la
    production d'un lot à l'autre, donc il est explicite.

    Un chapitre sans leçon exploitable rend `[]`, **jamais une erreur** : c'est un état normal
    (chapitre neuf, leçons toutes archivées), pas un incident.
    """
    lesson_ids = list(
        db.scalars(
            select(Lesson.id)
            .where(Lesson.chapter_id == chapter_id, Lesson.status != "archived")
            .order_by(Lesson.sort_order, Lesson.id)
        )
    )
    details = notions_by_lesson(db, lesson_ids)

    # Dédup en préservant l'ordre : une notion portée par deux leçons du chapitre s'équipe UNE fois.
    seen: set[int] = set()
    out: list[int] = []
    for lesson_id in lesson_ids:  # l'ordre des leçons, pas celui du dict
        for item in details[lesson_id]["items"]:
            if item["skill_id"] not in seen:
                seen.add(item["skill_id"])
                out.append(item["skill_id"])
    return out
