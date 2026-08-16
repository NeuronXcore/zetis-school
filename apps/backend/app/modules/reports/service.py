"""Service du Conseil de classe IA (ADR-0020).

Narration LLM **locale** posée sur le **service d'évidence** (2e consommateur, ADR-0011/0017) :
1. `_build_context` compose l'évidence CALCULÉE (mastery, lacunes, signal quiz, pression SRS) en
   un contexte par matière → notions fragiles ;
2. le LLM (provider local — jamais `curriculum` cloud, données privées de Massimo) narre et
   hiérarchise, sortie **typée** validée dur (patron ADR-0007/0015), une réparation ;
3. `_anchor` revalide chaque `skill_id`/`subject_id` contre l'évidence (garde-fou
   anti-hallucination : le LLM ne peut pas inventer d'identifiant) ;
4. on **fige** l'artefact + l'évidence (`evidence_snapshot_json`) : un rapport LLM n'est pas
   rejouable, l'auditabilité vient du figeage (contraste avec l'élection de mission).

Le pont d'actionnabilité réutilise le flux Commander (ADR-0018) tel quel : une recommandation →
`create_command_missions` (fan-out mono-notion, validées par le clic Papa).
"""

from datetime import datetime, time, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    CouncilReport,
    Skill,
    Subject,
)
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.evidence import service as evidence
from app.modules.missions import command
from app.prompts import council

from app.modules.reports.schemas import CouncilReportSpec, generation_schema

# Bornes de composition : on plafonne les notions fournies au LLM (prompt borné + focus sur les
# plus fragiles). Purement de présentation — l'évidence complète reste calculable.
_MAX_NOTIONS_PER_SUBJECT = 8
# En portée matière il n'y a plus qu'UNE matière dans le prompt : le budget de jetons libéré permet
# d'en montrer davantage. ⚠️ Le panneau d'analyse, lui, n'est PAS plafonné — les deux nombres
# diffèrent donc légitimement, et l'écart est DÉCLARÉ (`scope.notions_available`), pas gommé.
_MAX_NOTIONS_SCOPED = 16
_RECENT_VERDICTS = 20


class CouncilGenerationError(Exception):
    """Sortie LLM invalide après réparation, ou erreur provider."""


def _skill_name(db: Session, skill_id: int) -> str:
    skill = db.get(Skill, skill_id)
    return skill.name if skill is not None else f"notion {skill_id}"


def _strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: -3]
    return text.strip()


def _default_period(db: Session, student) -> str:
    return "Bilan"


def _transitions_by_subject(
    db: Session, student, *, subject_id: int | None, cap: int
) -> tuple[dict[int, list[dict]], str | None, int, int]:
    """Bascules de palier, groupées par matière et plafonnées — la mesure du Lot 3 (adr-0040 §8).

    ⚠️ **Une seule fonction de mesure** (§10) : `evidence.mastery_transitions`, celle que sert déjà
    Progression. Recalculer les bascules ici referait la classe de bug que ce dépôt paie depuis
    trois chantiers — deux mesures divergentes sous un même mot.

    ⚠️ `evidence.history_since` rend une **`date`** quand `mastery_transitions` attend un
    **`datetime`** : la conversion se fait ICI, à minuit UTC, et pas dans l'appelant.

    ⚠️ La borne est celle de l'élève, **pas de la matière** : c'est ce qu'exige le §8 (« `since`
    vaut `history_since` »). Conséquence assumée en portée matière — la borne annoncée peut
    précéder la première bascule de CETTE matière. Elle dit « voilà depuis quand on trace », jamais
    « voilà depuis quand cette matière bouge ».
    """
    since_date = evidence.history_since(db, student_id=student.id)
    if since_date is None:
        return {}, None, 0, 0

    since_dt = datetime.combine(since_date, time.min, tzinfo=timezone.utc)
    rows = evidence.mastery_transitions(
        db, student_id=student.id, since=since_dt, subject_id=subject_id
    )

    grouped: dict[int, list[dict]] = {}
    for t in rows:
        grouped.setdefault(t["subject_id"], []).append(
            {
                "skill_id": t["skill_id"],
                "skill_name": t["skill_name"],
                "from": t["from_status"],
                "to": t["to_status"],
                "changed_at": t["changed_at"].date().isoformat(),
            }
        )

    # Plafond aligné sur celui des notions (§8) : servir l'événementiel sans borne ferait exploser
    # le budget de jetons que le plafond des notions existe précisément pour tenir.
    available = sum(len(v) for v in grouped.values())
    for sid in grouped:
        grouped[sid] = grouped[sid][:cap]
    considered = sum(len(v) for v in grouped.values())
    return grouped, since_date.isoformat(), available, considered


def _build_context(
    db: Session, student, period: str, *, subject_id: int | None = None
) -> tuple[dict, set[int], set[int], dict[int, dict]]:
    """Compose l'évidence read-only en un contexte par matière (notions fragiles d'abord).

    `subject_id` restreint le contexte à UNE matière (`adr-0020-conseil-de-classe-ia` (Amendement 1)). `None`
    = conseil global, comportement historique inchangé.
    """
    mastery = evidence.mastery_by_skill(db, student_id=student.id)
    gaps = evidence.open_gaps(db, student_id=student.id)
    weak = evidence.weighted_quiz_signal(db, student_id=student.id)
    srs = evidence.srs_pressure(db, student_id=student.id)
    verdicts = evidence.recent_verdicts(db, student_id=student.id, limit=_RECENT_VERDICTS)

    gap_by_skill = {g["skill_id"]: g for g in gaps}
    candidate_ids = set(mastery) | set(gap_by_skill) | set(weak)

    per_subject: dict[int, list[dict]] = {}
    for skill_id in candidate_ids:
        skill = db.get(Skill, skill_id)
        if skill is None:
            continue
        # UNIQUE point de filtrage, et il porte sur `skill.subject_id` — déjà la clé de groupement
        # de `per_subject`, donc de `subjects_ctx`, donc de `allowed_subject_ids`. Filtrer ailleurs
        # laisserait passer une notion dont le rapport ne saurait plus de quelle matière elle est.
        if subject_id is not None and skill.subject_id != subject_id:
            continue
        m = float(mastery.get(skill_id, {}).get("mastery", 0.0))
        per_subject.setdefault(skill.subject_id, []).append(
            {
                "skill_id": skill_id,
                "name": skill.name,
                "mastery": round(m, 2),
                "status": mastery.get(skill_id, {}).get("status"),
                "open_gap": skill_id in gap_by_skill,
                "gap_severity": gap_by_skill.get(skill_id, {}).get("severity"),
                "weak_quiz_signal": round(float(weak[skill_id]), 2) if skill_id in weak else None,
                "_fragility": round(1.0 - m, 2),
            }
        )

    cap = _MAX_NOTIONS_SCOPED if subject_id is not None else _MAX_NOTIONS_PER_SUBJECT
    available = 0
    considered = 0

    transitions, since_iso, tr_available, tr_considered = _transitions_by_subject(
        db, student, subject_id=subject_id, cap=cap
    )

    subjects_ctx: list[dict] = []
    allowed_skill_ids: set[int] = set()
    for sid, notions in per_subject.items():
        subject = db.get(Subject, sid)
        if subject is None:
            continue
        notions.sort(key=lambda n: (-n["_fragility"], n["skill_id"]))
        available += len(notions)
        notions = notions[:cap]
        considered += len(notions)
        for n in notions:
            allowed_skill_ids.add(n["skill_id"])
        s = srs.get(sid, {})
        subjects_ctx.append(
            {
                "subject_id": sid,
                "subject_name": subject.name,
                "srs_due": int(s.get("due", 0)),
                "srs_max_overdue_days": int(s.get("max_overdue_days", 0)),
                "notions": [{k: v for k, v in n.items() if k != "_fragility"} for n in notions],
                # 🔴 LISTE FERMÉE (§8.2). Le modèle ne reçoit que ces bascules-là et n'en produit
                # aucune : il ne rend qu'un COMMENTAIRE. Les dates ne transitent jamais par lui,
                # donc aucune date inventée ne peut atteindre le rapport — l'ancrage est structurel,
                # pas un filtre appliqué après coup.
                "transitions": transitions.get(sid, []),
            }
        )
    subjects_ctx.sort(key=lambda s: s["subject_id"])

    acquired = sum(1 for v in verdicts if v.get("verdict") == "acquired")
    review_later = sum(1 for v in verdicts if v.get("verdict") == "review_later")
    scope = None
    if subject_id is not None:
        cible = db.get(Subject, subject_id)
        # `notions_available` / `notions_considered` rendent la TRONCATURE auditable dans
        # `evidence_snapshot_json`. Sans eux, un rapport ciblé qui ignore 7 notions sur 23 est
        # indiscernable d'un rapport complet — et l'auditabilité du figeage, seul argument
        # justifiant l'absence de mode aperçu, ne tiendrait plus.
        scope = {
            "subject_id": subject_id,
            "subject_name": cible.name if cible is not None else None,
            "notions_available": available,
            "notions_considered": considered,
        }

    context = {
        "period": period,
        "note": (
            "Deux natures dans ce contexte, et c'est DÉCLARÉ (adr-0040 §9) : des bascules de "
            "palier DATÉES, et une maîtrise à l'instant, SANS fenêtre. `period` est une étiquette, "
            "elle ne sélectionne aucune donnée."
        ),
        "scope": scope,
        # 🔴 La borne de trace et l'écart de troncature vivent ICI, pas dans `scope` : `scope`
        # n'existe qu'en portée matière (voir plus haut), et l'écart d'un conseil GLOBAL serait
        # alors invisible. Le patron `available`/`considered` est celui des notions ; c'est sa
        # PLACE qui change, pas sa forme.
        "trace": {
            "since": since_iso,
            "transitions_available": tr_available,
            "transitions_considered": tr_considered,
        },
        "subjects": subjects_ctx,
        "recent_activity": {
            "verdicts_considered": len(verdicts),
            "acquired": acquired,
            "review_later": review_later,
        },
    }
    allowed_subject_ids = {s["subject_id"] for s in subjects_ctx}
    # Le bloc d'évolution PRÊT À POSER, par matière — la structure du §8 moins son `comment`, que
    # seul le modèle fournit. Ses CLÉS sont exactement l'ensemble « matières portant au moins une
    # bascule » que le Lot 0 laissait vide : `_anchor` interroge la même chose, au même endroit,
    # pour le même motif d'ancrage. Le Lot 3 remplit ce trou, il ne le rebouche pas.
    #
    # Une seule structure et non deux (un `set` + une table) : deux porteurs de la même information
    # finissent toujours par diverger — c'est la faute que tout ce chantier corrige.
    evolution_by_subject: dict[int, dict] = {
        sid: {"since": since_iso, "transitions": rows}
        for sid, rows in transitions.items()
        # Une matière absente de l'évidence n'entre pas dans le rapport : lui construire une
        # évolution serait produire un bloc que `_anchor` jetterait de toute façon.
        if rows and sid in allowed_subject_ids
    }
    return context, allowed_subject_ids, allowed_skill_ids, evolution_by_subject


def _try_validate(raw: str) -> tuple[CouncilReportSpec | None, str | None]:
    try:
        return CouncilReportSpec.model_validate_json(_strip_fences(raw)), None
    except ValidationError as exc:
        return None, str(exc)


def _anchor(
    spec: CouncilReportSpec,
    allowed_subject_ids: set[int],
    allowed_skill_ids: set[int],
    evolution_by_subject: dict[int, dict],
) -> list[dict]:
    """Ne garde que les matières et `skill_id` présents dans l'évidence (anti-hallucination).

    Écrase aussi `recent_evolution` sur toute matière dont l'évidence ne porte aucune bascule
    (adr-0040 §8.1) — **quoi que le modèle ait écrit**. Le garde-fou existait pour les `skill_id`
    et pas pour ce champ : la validation portait sur le TYPE, jamais sur le CONTENU, et un `str`
    non-nullable OBLIGEAIT le producteur à remplir. Le résultat était figé dans `subjects_json`,
    donc rétroactivement indiscernable du vrai.

    Sur une matière qui EN porte, le champ devient la structure du §8 : `since` et `transitions`
    viennent du serveur, `comment` est la seule part du modèle. **Aucune date ne transite par
    lui** — il n'a donc rien à en inventer.
    """
    out: list[dict] = []
    for s in spec.subjects:
        if s.subject_id not in allowed_subject_ids:
            continue
        recos: list[dict] = []
        for r in s.recommendations:
            ids = [sid for sid in dict.fromkeys(r.skill_ids) if sid in allowed_skill_ids]
            if not ids:
                continue
            recos.append(
                {
                    "skill_ids": ids,
                    "mission_type": "manual",  # v1 : mono-notion via Commander (croisées différées)
                    "template_hint": r.template_hint,
                    "justification": r.justification,
                }
            )
        out.append(
            {
                "subject_id": s.subject_id,
                "subject_name": s.subject_name,
                "strengths": s.strengths,
                "to_reinforce": s.to_reinforce,
                "recent_evolution": _evolution(evolution_by_subject.get(s.subject_id), s.recent_evolution),
                "recommendations": recos,
            }
        )
    return out


def _evolution(bloc: dict | None, comment: str | None) -> dict | None:
    """Assemble le champ du §8, ou `None` si l'évidence ne porte aucune bascule.

    ⚠️ `comment` reste `null` quand le modèle n'a rien écrit — et une chaîne vide COMPTE comme
    rien. Sans ce repli, `""` se rendrait à l'écran comme un commentaire présent mais muet, ce qui
    est encore une façon d'affirmer sans rien dire.
    """
    if not bloc:
        return None
    return {**bloc, "comment": (comment or "").strip() or None}


def _to_out(db: Session, report: CouncilReport) -> dict:
    subjects = []
    for s in report.subjects_json or []:
        recos = []
        for r in s.get("recommendations", []):
            skill_ids = r.get("skill_ids", [])
            recos.append(
                {
                    "skill_ids": skill_ids,
                    "skill_names": [_skill_name(db, sid) for sid in skill_ids],
                    "mission_type": r.get("mission_type", "manual"),
                    "template_hint": r.get("template_hint"),
                    "justification": r.get("justification", ""),
                }
            )
        subjects.append(
            {
                "subject_id": s.get("subject_id"),
                "subject_name": s.get("subject_name", ""),
                "strengths": s.get("strengths", ""),
                "to_reinforce": s.get("to_reinforce", ""),
                # Pas de défaut `""` : un rapport figé AVANT ce lot garde sa prose telle quelle
                # (aucune réécriture, adr-0040 §8), et l'absence de clé doit se rendre `None` —
                # une chaîne vide se confondrait avec « le modèle n'a rien eu à dire ».
                "recent_evolution": s.get("recent_evolution"),
                "recommendations": recos,
            }
        )
    cible = db.get(Subject, report.subject_id) if report.subject_id else None
    return {
        "id": report.id,
        "period": report.period,
        "subject_id": report.subject_id,
        "subject_name": cible.name if cible is not None else None,
        "global_summary": report.global_summary,
        "subjects": subjects,
        "prompt_version": report.prompt_version,
        "created_at": report.created_at,
    }


def generate_council_report(
    db: Session, student, llm: LLMProvider, *, period: str | None = None,
    subject_id: int | None = None,
) -> dict:
    """Génère + persiste un rapport figé. 100 % local (`llm` = provider Ollama/MLX).

    `subject_id` = portée matière (`adr-0020-conseil-de-classe-ia` (Amendement 1)). `None` = global.
    """
    period = (period or "").strip() or _default_period(db, student)
    context, allowed_subject_ids, allowed_skill_ids, evolution_by_subject = _build_context(
        db, student, period, subject_id=subject_id
    )

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="council_generate",
        status="running",
        input_json={
            "period": period,
            "prompt_version": council.COUNCIL_PROMPT_VERSION,
            "subject_id": subject_id,
            "subjects": len(context["subjects"]),
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    if not context["subjects"]:
        # Dégradation gracieuse : aucune évidence → rapport serein, pas d'appel LLM.
        spec_subjects: list[dict] = []
        # Le message doit être CADRÉ sur ce qui a été demandé : dire « pas assez de données pour un
        # conseil de classe » à propos d'une seule matière laisserait croire que toute la scolarité
        # est muette.
        cible = context.get("scope") or {}
        if cible.get("subject_name"):
            global_summary = (
                f"Pas encore assez de données sur {cible['subject_name']} pour un conseil ciblé. "
                "Lance quelques activités dans cette matière, puis reviens."
            )
        else:
            global_summary = (
                "Pas encore assez de données pour un conseil de classe. Lance quelques activités "
                "avec Massimo, puis reviens : la synthèse s'appuiera sur ses résultats réels."
            )
    else:
        system, prompt = council.build_prompt(context)
        schema = generation_schema()
        try:
            raw = llm.generate(
                LLMRequest(system=system, prompt=prompt, fmt=schema, temperature=0.2)
            ).text
            spec, error = _try_validate(raw)
            if spec is None:
                repair = (
                    f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
                    f"{council.REPAIR_INSTRUCTION}{error}"
                )
                raw = llm.generate(
                    LLMRequest(system=system, prompt=repair, fmt=schema, temperature=0.2)
                ).text
                spec, error = _try_validate(raw)
        except Exception as exc:  # provider indisponible / erreur réseau locale
            job.status = "failed"
            job.error_message = str(exc)
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            raise CouncilGenerationError(str(exc)) from exc

        if spec is None:
            job.status = "failed"
            job.error_message = error
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            raise CouncilGenerationError(error or "sortie LLM invalide")

        spec_subjects = _anchor(
            spec, allowed_subject_ids, allowed_skill_ids, evolution_by_subject
        )
        global_summary = spec.global_summary

    report = CouncilReport(
        student_id=student.id,
        subject_id=subject_id,
        period=period,
        global_summary=global_summary,
        subjects_json=spec_subjects,
        prompt_version=council.COUNCIL_PROMPT_VERSION,
        evidence_snapshot_json=context,
        created_by="ai",
        created_at=datetime.now(timezone.utc),
    )
    db.add(report)
    job.status = "succeeded"
    job.output_json = {"report_subjects": len(spec_subjects)}
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(report)
    return _to_out(db, report)


def list_reports(
    db: Session, student, *, period: str | None = None, subject_id: int | None = None
) -> list[dict]:
    """Historique des rapports. ⚠️ SANS `subject_id`, rend TOUT — globaux et ciblés confondus.

    C'est ce qui garde le client existant intact : `fetchCouncilReports()` ne passe rien et
    continue de tout voir. Chaque élément porte sa portée, à charge du client de grouper.
    """
    q = select(CouncilReport).where(CouncilReport.student_id == student.id)
    if period:
        q = q.where(CouncilReport.period == period)
    if subject_id is not None:
        q = q.where(CouncilReport.subject_id == subject_id)
    rows = db.scalars(q.order_by(CouncilReport.created_at.desc(), CouncilReport.id.desc()))
    out: list[dict] = []
    for r in rows:
        cible = db.get(Subject, r.subject_id) if r.subject_id else None
        out.append(
            {
                "id": r.id,
                "period": r.period,
                "subject_id": r.subject_id,
                "subject_name": cible.name if cible is not None else None,
                "subjects_count": len(r.subjects_json or []),
                "created_at": r.created_at,
                # Sert la marque de lecture SANS ouvrir le rapport : dans une liste où neuf
                # entrées se ressemblent, savoir laquelle est adossée à un historique daté est
                # justement ce qui aide à choisir. Zéro requête de plus — la colonne est déjà lue.
                "prompt_version": r.prompt_version,
            }
        )
    return out


def get_report(db: Session, student, report_id: int) -> dict:
    report = db.get(CouncilReport, report_id)
    if report is None or report.student_id != student.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Rapport introuvable.")
    return _to_out(db, report)


def create_missions_from_reco(
    db: Session, student, *, skill_ids: list[int], due_date, force_priority: bool
) -> list[dict]:
    """Pont d'actionnabilité (ADR-0020 déc. 6) : recommandation → missions mono-notion via le
    flux Commander (ADR-0018). La validation Papa exigée pour le scolaire = ce clic."""
    return command.create_command_missions(
        db, student, skill_ids=skill_ids, due_date=due_date, force_priority=force_priority
    )


def create_champion_from_reco(db: Session, student, *, skill_ids: list[int], flavor: str) -> dict:
    """Pont d'actionnabilité CROISÉ (ADR-0022 §8) : une recommandation champion → UNE mission
    `champion` multi-matières. La page Conseil a déjà **équipé** chaque notion (boucle `equip_notion`,
    barres par notion) ; ici on ne fait que **composer** (compose-only). Import paresseux → pas de
    cycle reports↔missions."""
    from app.modules.missions import champion, pilot

    mission = champion.compose_champion_mission(db, student, skill_ids=skill_ids, flavor=flavor)
    return pilot._to_pilot_out(db, mission)
