"""Le résultat en forme ENFANT : ce que Massimo voit de sa propre mesure (ADR-0044 Décision 5).

Ce fichier porte **le verrou comportemental** de la session B — *aucune route élève ne sert
`score_percent` ni `severity`* — et sa **contre-épreuve** : la vue de Papa ne change en rien.

⚠️ **Le verrou est écrit en BALAYANT la réponse, pas en énumérant ses clés.** Un
`assert "score_percent" not in payload` ne verrait pas un score réapparu à l'intérieur d'une liste
imbriquée — et c'est précisément par là qu'il est déjà passé une fois (`per_skill[].score`).

100 % hors-ligne (SQLite + `FakeLLMProvider`).
"""

import app.db.models as m
from app.tests.test_diagnostics import _generate, as_massimo, as_papa

# Ce qui n'a rien à faire dans une réponse servie à l'enfant. `status` n'y figure pas : il est
# légitime ailleurs (statut d'un travail, d'un quiz), et un verrou trop large finit désarmé.
INTERDITS_CHEZ_MASSIMO = ("score_percent", "score", "severity", "mastery_score", "per_skill")


def _cles_profondes(valeur, chemin: str = "") -> list[str]:
    """Tous les noms de clés d'un JSON, à toute profondeur, avec leur chemin."""
    trouvees: list[str] = []
    if isinstance(valeur, dict):
        for cle, sous in valeur.items():
            trouvees.append(f"{chemin}.{cle}" if chemin else cle)
            trouvees += _cles_profondes(sous, f"{chemin}.{cle}" if chemin else cle)
    elif isinstance(valeur, list):
        for i, sous in enumerate(valeur):
            trouvees += _cles_profondes(sous, f"{chemin}[{i}]")
    return trouvees


def _passer(client, quiz_id: int, *, bonnes: bool = True) -> dict:
    quiz = client.get(f"/api/diagnostics/quizzes/{quiz_id}").json()
    reponses = [
        {"question_id": q["id"], "choice_index": 0 if bonnes else 1} for q in quiz["questions"]
    ]
    return client.post(
        f"/api/diagnostics/quizzes/{quiz_id}/submit", json={"answers": reponses}
    ).json()


def test_aucune_route_eleve_ne_sert_de_score_ni_de_severite(client_db, executer_travail) -> None:
    """LE VERROU COMPORTEMENTAL. Sabotage : remets `score_percent` au schéma enfant → rouge.

    ⚠️ **Décor non dégénéré, et il a fallu le construire.** La passation doit produire À LA FOIS
    une force et une lacune : tout bon ne créerait aucune lacune, donc le verrou ne dirait rien de
    `severity` ; tout faux ne créerait aucune force. Or la fixture n'a **qu'une notion**, et
    répondre partiellement dessus donne 60 % — sous le seuil, donc une lacune et zéro force.
    D'où la **seconde notion**, répondue juste quand la première est répondue faux.
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)

    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    notions = sorted({q["skill_id"] for q in quiz["questions"]})
    assert len(notions) == 2, "le décor exige deux notions, sinon force et lacune s'excluent"
    reponses = [
        {"question_id": q["id"], "choice_index": 0 if q["skill_id"] == notions[0] else 1}
        for q in quiz["questions"]
    ]
    soumission = client.post(
        f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": reponses}
    ).json()
    relecture = client.get(f"/api/diagnostics/mes-resultats/{soumission['attempt_id']}").json()

    for nom, payload in (("submit", soumission), ("relecture", relecture)):
        cles = _cles_profondes(payload)
        for interdit in INTERDITS_CHEZ_MASSIMO:
            fautives = [c for c in cles if c.split(".")[-1].split("[")[0] == interdit]
            assert not fautives, f"la réponse « {nom} » sert {interdit} à Massimo : {fautives}"

    # ⚠️ L'anti-test-à-vide : sans lui, un payload VIDE passerait le balayage les doigts dans le nez.
    assert soumission["strengths"], "le décor doit produire au moins une force"
    assert soumission["gaps"], "le décor doit produire au moins une notion à renforcer"


def test_la_relecture_rend_EXACTEMENT_ce_que_la_soumission_a_rendu(client_db, executer_travail) -> None:
    """Un seul schéma, deux routes — donc deux réponses identiques, champ pour champ.

    C'est la raison d'être de la fabrique unique : deux surfaces composées séparément seraient
    libres de diverger, et c'est l'écran de l'enfant.
    """
    client, TestSession = client_db
    body = _generate(client, TestSession, executer_travail)
    soumission = _passer(client, body["quiz_id"], bonnes=True)

    relecture = client.get(f"/api/diagnostics/mes-resultats/{soumission['attempt_id']}").json()
    assert relecture == soumission


def test_massimo_peut_relire_une_passation_ANCIENNE(client_db, executer_travail) -> None:
    """Le défaut que la décision referme : le résultat n'était visible qu'UNE FOIS.

    Une seconde passation intervient entre-temps — sans elle, « on peut relire » serait vrai d'une
    passation qui vient juste d'être rendue, ce qui ne prouve rien de la durabilité.
    """
    client, TestSession = client_db
    body = _generate(client, TestSession, executer_travail)
    premiere = _passer(client, body["quiz_id"], bonnes=False)
    seconde = _passer(client, body["quiz_id"], bonnes=True)
    assert premiere["attempt_id"] != seconde["attempt_id"]

    relue = client.get(f"/api/diagnostics/mes-resultats/{premiere['attempt_id']}").json()
    assert relue["attempt_id"] == premiere["attempt_id"]
    assert relue["gaps"], "la première passation était tout faux : ses notions à renforcer restent"
    assert relue["completed_at"] is not None


def test_une_passation_qui_n_est_pas_la_sienne_est_INTROUVABLE(client_db, executer_travail) -> None:
    """`404`, jamais `403` : un `403` apprendrait l'existence de ce qu'on ne peut pas ouvrir."""
    client, TestSession = client_db
    _generate(client, TestSession, executer_travail)

    assert client.get("/api/diagnostics/mes-resultats/999999").status_code == 404


def test_la_route_de_relecture_est_INTERDITE_a_Papa(client_db, executer_travail) -> None:
    """La frontière élève/pilote, dans les deux sens.

    Sans ce test, la nouvelle route pourrait être servie à `get_current_user` sans que rien ne le
    dise — et la « route élève » deviendrait une seconde route Papa qui s'ignore.
    """
    client, TestSession = client_db
    body = _generate(client, TestSession, executer_travail)
    soumission = _passer(client, body["quiz_id"])

    as_papa()
    assert client.get(f"/api/diagnostics/mes-resultats/{soumission['attempt_id']}").status_code == 403
    as_massimo()


def test_CONTRE_EPREUVE_la_vue_de_Papa_ne_change_en_rien(client_db, executer_travail) -> None:
    """🔴 Sans elle, amaigrir le contrat de Papa « pour faire propre » passerait inaperçu.

    Les tests de Massimo resteraient tous verts — c'est le piège d'homonymie nommé par l'ADR
    (`DiagnosticResult` / `DiagnosticGap` existent dans `packages/types` avec la forme de Papa).
    """
    client, TestSession = client_db
    body = _generate(client, TestSession, executer_travail)
    soumission = _passer(client, body["quiz_id"], bonnes=False)

    as_papa()
    detail = client.get(f"/api/diagnostics/results/{soumission['attempt_id']}").json()

    assert detail["score_percent"] == 0
    assert [r["score"] for r in detail["per_skill"]] == [0]
    assert [g["severity"] for g in detail["gaps"]] == ["high"]
    assert [g["status"] for g in detail["gaps"]] == ["open"]
    as_massimo()
