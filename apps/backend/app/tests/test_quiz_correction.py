"""Tables de tests des sept correcteurs déterministes (ADR-0014 Décision 3).

Écrites AVANT le service : elles fixent le contrat de `app.modules.quizzes.correction`
(fonctions pures, aucune I/O). Cas nominaux + cas limites imposés par le prompt : accents,
casse, virgule décimale, ordre partiel faux, association incomplète, tout-ou-rien.
"""

import pytest

from app.modules.quizzes.correction import correct, normalize_text, parse_number

# (question_type, answer_json, correct_answer_json, expected) --------------------
CASES = [
    # ── mcq : index simple, enveloppe {"choice_index"} ou brut ────────────────
    ("mcq-ok-wrapped", "mcq", {"choice_index": 2}, 2, True),
    ("mcq-ok-bare", "mcq", 2, 2, True),
    ("mcq-ok-strindex", "mcq", {"choice_index": "2"}, 2, True),
    ("mcq-wrong", "mcq", {"choice_index": 1}, 2, False),
    ("mcq-none", "mcq", {"choice_index": None}, 2, False),
    ("mcq-missing", "mcq", {}, 2, False),
    # ── mcq_multi : ensemble, tout-ou-rien, ordre indifférent ─────────────────
    ("multi-ok-order", "mcq_multi", {"choice_indices": [2, 0]}, [0, 2], True),
    ("multi-ok-bare", "mcq_multi", [0, 2], [0, 2], True),
    ("multi-partial", "mcq_multi", {"choice_indices": [0]}, [0, 2], False),
    ("multi-extra", "mcq_multi", {"choice_indices": [0, 2, 3]}, [0, 2], False),
    ("multi-empty-answer", "mcq_multi", {"choice_indices": []}, [0, 2], False),
    # ── true_false : bool, tolère "vrai"/"faux" ───────────────────────────────
    ("tf-true", "true_false", {"value": True}, True, True),
    ("tf-vrai-word", "true_false", "vrai", True, True),
    ("tf-false-word", "true_false", {"value": "Faux"}, False, True),
    ("tf-mismatch", "true_false", {"value": True}, False, False),
    ("tf-garbage", "true_false", {"value": "peut-être"}, True, False),
    # ── cloze : trous multiples, accents/casse, variantes acceptées ───────────
    ("cloze-ok", "cloze", {"blanks": ["trois", "quatre"]}, {"blanks": [["trois"], ["quatre"]]}, True),
    ("cloze-accents-casse", "cloze", {"blanks": ["ÉLÈVE"]}, {"blanks": [["eleve"]]}, True),
    ("cloze-variant", "cloze", {"blanks": ["3"]}, {"blanks": [["trois", "3"]]}, True),
    ("cloze-one-wrong", "cloze", {"blanks": ["trois", "cinq"]}, {"blanks": [["trois"], ["quatre"]]}, False),
    ("cloze-len-mismatch", "cloze", {"blanks": ["trois"]}, {"blanks": [["trois"], ["quatre"]]}, False),
    # ── numeric : tolérance, virgule décimale, mot, date ──────────────────────
    ("num-comma", "numeric", {"value": "3,14"}, {"value": "3.14"}, True),
    ("num-tolerance", "numeric", {"value": "3.1"}, {"value": 3.14, "tolerance": 0.05}, True),
    ("num-out-of-tol", "numeric", {"value": "3.5"}, {"value": 3.14, "tolerance": 0.05}, False),
    ("num-int", "numeric", 12, {"value": 12}, True),
    ("num-word", "numeric", {"value": "Août"}, {"value": "aout"}, True),
    ("num-word-accept", "numeric", {"value": "1789"}, {"value": "1789", "accept": ["mille sept cent quatre-vingt-neuf"]}, True),
    ("num-empty", "numeric", {"value": ""}, {"value": "3.14"}, False),
    # ── ordering : séquence exacte, ordre partiel faux ────────────────────────
    ("order-ok", "ordering", {"order": ["a", "b", "c"]}, {"order": ["a", "b", "c"]}, True),
    ("order-norm", "ordering", {"order": ["À", "b"]}, {"order": ["a", "B"]}, True),
    ("order-swapped", "ordering", {"order": ["a", "c", "b"]}, {"order": ["a", "b", "c"]}, False),
    ("order-short", "ordering", {"order": ["a", "b"]}, {"order": ["a", "b", "c"]}, False),
    # ── matching : tout-ou-rien, association incomplète ───────────────────────
    ("match-ok", "matching", {"pairs": {"chat": "mammifère", "truite": "poisson"}}, {"pairs": {"chat": "mammifère", "truite": "poisson"}}, True),
    ("match-norm", "matching", {"pairs": {"Chat": "Mammifère"}}, {"pairs": {"chat": "mammifere"}}, True),
    ("match-incomplete", "matching", {"pairs": {"chat": "mammifère"}}, {"pairs": {"chat": "mammifère", "truite": "poisson"}}, False),
    ("match-one-wrong", "matching", {"pairs": {"chat": "poisson", "truite": "poisson"}}, {"pairs": {"chat": "mammifère", "truite": "poisson"}}, False),
    # ── format inconnu / clé absente ⇒ jamais une exception, toujours False ────
    ("unknown-type", "open", {"value": "x"}, {"value": "x"}, False),
    ("mcq-key-none", "mcq", {"choice_index": 2}, None, False),
]


@pytest.mark.parametrize("case", CASES, ids=[c[0] for c in CASES])
def test_correctors(case) -> None:
    _id, qtype, answer, key, expected = case
    assert correct(qtype, answer, key) is expected


def test_normalize_text_strips_accents_case_and_spaces() -> None:
    assert normalize_text("  Élève  ") == "eleve"
    assert normalize_text("Deux   Mots") == "deux mots"
    assert normalize_text(None) == ""


def test_parse_number_tolerates_comma_and_rejects_bool_and_words() -> None:
    assert parse_number("3,14") == pytest.approx(3.14)
    assert parse_number(12) == 12.0
    assert parse_number("douze") is None
    assert parse_number(True) is None  # bool n'est pas un nombre ici
