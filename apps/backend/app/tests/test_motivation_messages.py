"""Ce que ZETIS dit à Massimo : choix du message et vocabulaire.

Le choix est une fonction PURE d'un contexte : la majorité de ces tests n'a besoin ni de base ni
de client HTTP. Les plus importants sont ceux qui vérifient ce qu'on ne dit JAMAIS.
"""

import re
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.motivation import service
from app.modules.motivation.messages import (
    WelcomeContext,
    WrapUpContext,
    choose_welcome,
    choose_wrap_up,
)

UTC = timezone.utc

BASE = WelcomeContext(
    first_name="Massimo",
    has_history=True,
    days_since_last_visit=0,
    last_notion=None,
    consolidated_this_week=0,
    gaps_closed_this_week=0,
    reviews_due=0,
    goal_days=3,
    days_done=1,
    goal_met=False,
    goal_met_today=False,
    mission_steps_left=0,
    mission_notion=None,
)


class TestChoixDuMessage:
    def test_premiere_visite(self) -> None:
        assert choose_welcome(replace(BASE, has_history=False)).code == "first_visit"

    def test_retour_apres_longue_absence_reprend_la_notion(self) -> None:
        msg = choose_welcome(
            replace(BASE, days_since_last_visit=6, last_notion="le théorème de Pythagore")
        )
        assert msg.code == "back_after_break"
        assert "Pythagore" in msg.subtitle

    def test_retour_sans_notion_connue_degrade_proprement(self) -> None:
        """Une séance passée entièrement en quiz ne laisse pas de notion : on accueille quand
        même, sans inventer."""
        msg = choose_welcome(replace(BASE, days_since_last_visit=6, last_notion=None))
        assert msg.code == "back_after_break"
        assert msg.subtitle and "arrêté" not in msg.subtitle

    def test_absence_courte(self) -> None:
        msg = choose_welcome(replace(BASE, days_since_last_visit=2, last_notion="les fractions"))
        assert msg.code == "back_short_break"

    def test_pas_encore_d_objectif(self) -> None:
        assert choose_welcome(replace(BASE, goal_days=None)).code == "no_goal_yet"

    def test_objectif_franchi_aujourd_hui(self) -> None:
        assert choose_welcome(replace(BASE, goal_met=True, goal_met_today=True)).code == (
            "goal_reached_today"
        )

    def test_progres_visible(self) -> None:
        msg = choose_welcome(replace(BASE, consolidated_this_week=2))
        assert msg.code == "progress_visible"
        assert "2 notions" in msg.title

    def test_accord_au_singulier(self) -> None:
        assert "1 notion " in choose_welcome(replace(BASE, consolidated_this_week=1)).title

    def test_reprise_de_mission(self) -> None:
        msg = choose_welcome(replace(BASE, mission_steps_left=2, mission_notion="les fractions"))
        assert msg.code == "resume_notion"
        assert msg.cta_target == "missions"

    def test_cartes_dues(self) -> None:
        assert choose_welcome(replace(BASE, reviews_due=4)).code == "reviews_due"

    def test_rien_a_faire(self) -> None:
        msg = choose_welcome(BASE)
        assert msg.code == "all_clear"

    def test_l_humain_prime_sur_le_compteur(self) -> None:
        """Deux règles applicables : le retour après absence gagne sur la félicitation. Ce qui
        est humain passe avant tout compteur."""
        msg = choose_welcome(
            replace(
                BASE,
                days_since_last_visit=6,
                last_notion="les fractions",
                consolidated_this_week=3,
                goal_met=True,
                goal_met_today=True,
            )
        )
        assert msg.code == "back_after_break"

    def test_l_invitation_du_lundi_passe_avant_la_felicitation(self) -> None:
        """Sans objectif posé, on invite à s'engager plutôt que de féliciter : c'est la seule
        fenêtre où proposer un objectif a du sens."""
        msg = choose_welcome(replace(BASE, goal_days=None, consolidated_this_week=3))
        assert msg.code == "no_goal_yet"


class TestVocabulaire:
    """CLAUDE.md cesse d'être une intention et devient une assertion."""

    INTERDITS = re.compile(
        r"échec|echec|nul\b|raté|rate\b|manqué|perdu|tu n'as pas|dommage|mauvais",
        re.IGNORECASE,
    )
    # Aucun décompte de jours ne doit être LU par l'enfant — ni d'absence, ni de reste-à-faire.
    DECOMPTE_JOURS = re.compile(r"\d+\s*jours?", re.IGNORECASE)

    def _tous_les_messages(self) -> list:
        variantes = [
            replace(BASE, has_history=False),
            replace(BASE, days_since_last_visit=9, last_notion="les fractions"),
            replace(BASE, days_since_last_visit=9, last_notion=None),
            replace(BASE, days_since_last_visit=3, last_notion="les fractions"),
            replace(BASE, goal_days=None),
            replace(BASE, goal_met=True, goal_met_today=True),
            replace(BASE, goal_met=True),
            replace(BASE, consolidated_this_week=2),
            replace(BASE, gaps_closed_this_week=1),
            replace(BASE, mission_steps_left=2, mission_notion="les fractions"),
            replace(BASE, reviews_due=4),
            BASE,
        ]
        messages = [choose_welcome(c) for c in variantes]
        wrap = WrapUpContext(
            first_name="Massimo",
            mission_steps_left=0,
            mission_notion=None,
            reviews_due=0,
            goal_met_today=False,
            today_done=True,
        )
        messages += [
            choose_wrap_up(replace(wrap, goal_met_today=True)),
            choose_wrap_up(replace(wrap, mission_steps_left=2, mission_notion="les fractions")),
            choose_wrap_up(replace(wrap, reviews_due=3)),
            choose_wrap_up(wrap),
            choose_wrap_up(replace(wrap, today_done=False)),
        ]
        return messages

    def test_aucun_vocabulaire_d_echec(self) -> None:
        for msg in self._tous_les_messages():
            texte = f"{msg.title} {msg.subtitle or ''} {msg.cta_label or ''}"
            assert not self.INTERDITS.search(texte), f"[{msg.code}] {texte}"

    def test_aucun_decompte_de_jours_affiche(self) -> None:
        """Même après neuf jours d'absence, la phrase ne dit pas combien."""
        for msg in self._tous_les_messages():
            texte = f"{msg.title} {msg.subtitle or ''}"
            assert not self.DECOMPTE_JOURS.search(texte), f"[{msg.code}] {texte}"

    def test_la_cloture_ne_dit_jamais_ce_qu_il_reste_a_tenir(self) -> None:
        """Ligne rouge : la fin de séance ne rappelle pas l'objectif restant, ce serait la
        pression quotidienne interdite."""
        wrap = WrapUpContext(
            first_name="Massimo",
            mission_steps_left=0,
            mission_notion=None,
            reviews_due=0,
            goal_met_today=False,
            today_done=True,
        )
        texte = " ".join(
            f"{m.title} {m.subtitle or ''}"
            for m in [choose_wrap_up(wrap), choose_wrap_up(replace(wrap, reviews_due=2))]
        )
        assert "objectif" not in texte.lower()


class TestRoutes:
    def test_welcome_sur_base_vierge(self, client_db) -> None:
        client, _ = client_db
        body = client.get("/api/student/motivation/welcome").json()

        assert body["code"] == "first_visit"
        assert body["context"]["consolidated_this_week"] == 0
        assert len(body["context"]["regularity"]["days"]) == 7

    def test_welcome_est_deterministe(self, client_db) -> None:
        """Aucun LLM, aucun aléa : deux appels sur le même état rendent la MÊME phrase."""
        client, _ = client_db
        first = client.get("/api/student/motivation/welcome").json()
        second = client.get("/api/student/motivation/welcome").json()
        assert first["title"] == second["title"]
        assert first["code"] == second["code"]

    def test_l_absence_ignore_les_evenements_du_jour(self, client_db) -> None:
        """LE piège : le `login` est journalisé AVANT l'appel à l'accueil. Sans la règle
        « strictement antérieur à aujourd'hui », l'absence vaudrait toujours 0 et le message de
        retour ne se déclencherait jamais."""
        client, TestSession = client_db
        now = datetime.now(UTC)
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            # Une visite ancienne, et une connexion aujourd'hui (comme en vrai).
            for moment in (now - timedelta(days=6), now):
                db.add(
                    m.LearningEvent(
                        student_id=student.id,
                        event_type="login",
                        payload_json={},
                        created_at=moment,
                    )
                )
            db.commit()

        body = client.get("/api/student/motivation/welcome").json()
        assert body["code"] == "back_after_break"
        assert body["context"]["days_since_last_visit"] == 6

    def test_wrap_up_repond(self, client_db) -> None:
        client, _ = client_db
        body = client.get("/api/student/motivation/wrap-up").json()
        assert body["code"] in {
            "week_goal_reached",
            "mission_in_progress",
            "reviews_left",
            "day_done",
            "all_clear",
        }

    def test_papa_n_a_acces_a_aucun_des_deux(self, client_db) -> None:
        client, _ = client_db
        app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}
        assert client.get("/api/student/motivation/welcome").status_code == 403
        assert client.get("/api/student/motivation/wrap-up").status_code == 403

    def test_le_nombre_de_jours_est_dans_le_contexte_mais_pas_dans_le_texte(
        self, client_db
    ) -> None:
        client, TestSession = client_db
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    event_type="login",
                    payload_json={},
                    created_at=datetime.now(UTC) - timedelta(days=8),
                )
            )
            db.commit()

        body = client.get("/api/student/motivation/welcome").json()
        assert body["context"]["days_since_last_visit"] == 8
        assert "8" not in f"{body['title']} {body['subtitle'] or ''}"
