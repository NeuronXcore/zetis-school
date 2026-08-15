"""Substrat de contexte canonique partagé par TOUS les dérivés (ADR-0011).

Un dérivé (ELI5, quiz, mindmap, fiches, SRS…) NE réimplémente PAS sa résolution de
contexte : il appelle `resolve_canonical_context` puis insère `build_canonical_sections`
dans son propre prompt. Contexte commun, tâche propre à chacun (ADR-0011 §2).

Module NEUTRE : il ne connaît aucun dérivé et n'en importe aucun — ce sont eux qui
l'importent. Aucun code ELI5 ici (invariant du chantier). Le module est testé SANS
importer `eli5/` : preuve mécanique que le substrat est partagé (test-verrou ADR-0011).

Le gate `status='validated'` vit DANS la requête (§1) : un dérivé ne PEUT pas recevoir un
cours non validé — la donnée n'existe pas dans ce qu'il reçoit. Read-only : le résolveur
ne valide rien, ne trace rien, aucun effet de bord.

Note d'implémentation (écart assumé vs le croquis §C de l'ADR) : `retrieve_for_skill` du
module `rag` exige un `embedder` et une `query` (il vectorise la requête) et renvoie
`list[str]`. Le résolveur les propage donc — le contrat conceptuel de l'ADR est inchangé,
seuls les paramètres réels du RAG transitent.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Lesson
from app.modules.ai.provider import EmbeddingProvider
from app.modules.lesson_resolution import lessons_of_skill
from app.modules.rag.service import retrieve_for_skill


def is_stale(derived_at: datetime | None, content_updated_at: datetime | None) -> bool:
    """Un dérivé est périmé si le cours source a été réécrit APRÈS sa production (§E.1).

    Vit ici, jamais dupliquée dans un module dérivé — même règle que le résolveur (§1) : une
    définition du périmé qui existe en deux exemplaires finit par en avoir deux différentes.

    Deux `None` possibles, tous deux non périmés : pas de cours (rien n'a pu changer), ou pas
    de dérivé (rien à périmer). L'égalité stricte n'est PAS périmée : un dérivé produit dans la
    même transaction que son cours est frais.

    Référence côté dérivé = son propre `updated_at` (§E.4). Conséquence assumée : un dérivé que
    Papa édite après un changement de cours redevient « frais » sans avoir été régénéré. On
    présume Papa informé — le faux négatif est sans danger, c'est le faux POSITIF qu'on élimine
    (un badge « périmé » à tort tue la crédibilité de la page qui l'affiche).
    """
    if derived_at is None or content_updated_at is None:
        return False
    return content_updated_at > derived_at


@dataclass(frozen=True)
class CanonicalContext:
    """Contexte résolu pour une notion : le cours validé (source canonique) + complément RAG."""

    lesson: Lesson | None  # cours validé, source canonique (None si aucune leçon validée)
    chunks: list[str]  # complément RAG (BO, sources Papa) — peut être vide

    @property
    def has_course(self) -> bool:
        return self.lesson is not None


def resolve_canonical_context(
    db: Session,
    embedder: EmbeddingProvider,
    *,
    skill_id: int,
    query: str = "",
    k_with_course: int = 3,
    k_without: int = 5,
) -> CanonicalContext:
    """Résout le contexte canonique d'une notion (cours validé d'abord, RAG en complément).

    Cascade de dégradation : cours validé → RAG seul → connaissance du modèle. Le premier
    cran est ajouté ici, une fois pour tous les dérivés. `k` réduit quand un cours existe
    (le RAG n'est plus que complément).

    ⚠️ **Le gate `validated` a quitté le SELECT le 2026-08-03** (ADR-0037), et l'addendum ADR-0009
    §C insistait sur ce point : *« une clause du SELECT — impossible de recevoir un cours non
    validé »*. **La garantie tient toujours, mais elle tient autrement** : le résolveur partagé rend
    les leçons de la notion (brouillons compris, parce que la production en a besoin au palier 3),
    et le filtre est appliqué ici, en un seul endroit, sur le chemin unique par lequel tous les
    dérivés passent. Ce qui était impossible à contourner par construction reste impossible à
    contourner par unicité.

    ⚠️ **Et le périmètre s'est resserré à l'ANNÉE ACTIVE.** Un cours porté par une leçon d'une année
    close n'ancre plus les générateurs — ils dégradent vers le RAG. C'est cohérent : ce qui n'est
    pas atteignable par Massimo n'a pas à nourrir ce qu'on produit pour lui.

    Read-only : aucune écriture, aucune trace, aucun effet de bord.
    """
    lesson = next(
        (
            l
            for l in lessons_of_skill(db, skill_id)
            if l.status == "validated" and l.content_markdown is not None
        ),
        None,
    )
    chunks = retrieve_for_skill(
        db,
        embedder,
        skill_id=skill_id,
        query=query,
        k=k_with_course if lesson is not None else k_without,
    )
    return CanonicalContext(lesson=lesson, chunks=chunks)


def _tronquer_par_paragraphe(texte: str, max_chars: int) -> str:
    """Coupe à la frontière de paragraphe la plus proche sous `max_chars`.

    Un cours coupé en plein mot — ou pire, au milieu d'une formule — n'est pas un cours plus
    court : c'est un cours faux. On préfère perdre un paragraphe entier.
    """
    if max_chars <= 0 or len(texte) <= max_chars:
        return texte
    coupe = texte[:max_chars]
    frontiere = coupe.rfind("\n\n")
    # Pas de frontière exploitable (un seul long paragraphe) → on retombe sur la fin de ligne,
    # puis sur la coupe brute. Mieux vaut un paragraphe amputé qu'un budget non tenu.
    if frontiere <= 0:
        frontiere = coupe.rfind("\n")
    return (coupe[:frontiere] if frontiere > 0 else coupe).rstrip()


def build_canonical_sections(
    ctx: CanonicalContext,
    *,
    max_lesson_chars: int | None = None,
    max_chunk_chars: int | None = None,
) -> str:
    """Compose le BLOC de contexte (pas le prompt entier) à insérer dans un prompt dérivé.

    Deux sections + une règle d'autorité. La ligne « le cours fait foi » est la garantie de
    cohérence inter-dérivés : même cours → mêmes notations/vocabulaire partout (ADR-0011 §2).

    ⚠️ **Les deux bornes sont OPTIONNELLES et à défaut NEUTRE** (`adr-0059` §12). L'ADR-0011 est
    un contrat gelé, et il l'reste : le gel porte sur *ce qui est composé et dans quel ordre*, pas
    sur l'absence de bornes. Aucun appelant existant ne change de comportement — seul le chat, qui
    doit tenir dans un budget de tour, les renseigne.

    🔴 **La règle d'autorité est posée APRÈS la troncature, donc jamais coupée.** C'est tout
    l'intérêt : jusqu'au 2026-08-15, le chat tronquait le bloc COMPOSÉ à 1200 caractères, et la
    règle — écrite en dernier — disparaissait systématiquement. ZETIS recevait un cours arbitraire-
    ment coupé sans la phrase qui lui disait quoi en faire. Tronquer côté appelant recréerait une
    seconde définition de « comment couper un cours » ; c'est exactement ce que ce contrat évite.
    """
    parts: list[str] = []
    if ctx.lesson is not None:
        contenu = ctx.lesson.content_markdown or ""
        if max_lesson_chars is not None:
            contenu = _tronquer_par_paragraphe(contenu, max_lesson_chars)
        parts.append(f"## COURS VALIDÉ (source canonique)\n{contenu}")
    if ctx.chunks:
        extraits = list(ctx.chunks)
        if max_chunk_chars is not None:
            # On retire des passages ENTIERS, on n'en coupe aucun : un extrait tronqué se cite mal
            # et s'ancre encore plus mal.
            gardes: list[str] = []
            budget = max_chunk_chars
            for extrait in extraits:
                if len(extrait) > budget:
                    break
                gardes.append(extrait)
                budget -= len(extrait)
            extraits = gardes
        if extraits:
            parts.append("## EXTRAITS COMPLÉMENTAIRES\n" + "\n\n".join(extraits))
    parts.append(
        "Règle : appuie-toi d'abord sur le COURS VALIDÉ. Si tes connaissances ou les "
        "extraits le contredisent, le cours fait foi (vocabulaire, notations, méthode)."
    )
    return "\n\n".join(parts)
