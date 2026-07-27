"""Correction déterministe des questions de quiz (ADR-0014 Décision 3).

Sept correcteurs, chacun une **fonction pure sans I/O** : `(answer_json, correct_answer_json)
-> bool`. Aucun appel réseau, aucune session DB, aucune IA au moment de la correction — la
justesse envers l'enfant est garantie par du code testable (le jugement LLM est réservé au
Lot 2, format `open`).

Conventions de forme (les mêmes structures voyagent du générateur → `choices_json` /
`correct_answer_json` → réponse élève) :

- ``mcq``        clé = index ``int``            ; réponse = ``{"choice_index": int}`` | ``int``
- ``mcq_multi``  clé = ``list[int]``            ; réponse = ``{"choice_indices": list}`` | ``list``
                 (tout-ou-rien : l'ensemble doit être exactement égal)
- ``true_false`` clé = ``bool``                 ; réponse = ``{"value": bool}`` | ``bool`` | ``"vrai"``
- ``cloze``      clé = ``{"blanks": [[acceptées…], …]}`` ; réponse = ``{"blanks": [str, …]}``
                 (chaque trou : réponse normalisée ∈ ensemble accepté ; tous les trous requis)
- ``numeric``    clé = ``{"value": …, "tolerance": …?, "accept": [str…]?}`` ; réponse = ``{"value": …}``
                 (tolérance numérique ``3,14`` ≡ ``3.14`` ; repli texte pour mot/date)
- ``ordering``   clé = ``{"order": [labels]}``  ; réponse = ``{"order": [labels]}`` (séquence exacte)
- ``matching``   clé = ``{"pairs": {g: d}}``    ; réponse = ``{"pairs": {g: d}}`` (tout-ou-rien)

Toute réponse absente / malformée ⇒ ``False`` (jamais d'exception : une réponse illisible est
simplement fausse, l'enfant n'est pas puni par un crash). Périmètre strict V1 de la
normalisation ``numeric`` : nombre, mot, date — pas d'unités ni de fractions (ADR-0014).
"""

import unicodedata

__all__ = ["correct", "normalize_text", "parse_number"]


# --- Normalisation partagée (cloze / numeric / ordering / matching) -----------


def normalize_text(value: object) -> str:
    """Casse, accents (décomposition NFD) et espaces superflus retirés.

    « Trois  » ≡ « trois » ≡ « TROIS ». Décompose en NFD puis supprime les diacritiques
    combinants, casefold (casse Unicode), et écrase les espaces internes."""
    text = "" if value is None else str(value)
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(without_marks.casefold().split())


def parse_number(value: object) -> float | None:
    """Convertit en nombre, virgule décimale tolérée (``3,14`` → ``3.14``). None si pas un nombre."""
    if isinstance(value, bool):  # bool est un int en Python — ne jamais l'accepter ici
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = normalize_text(value).replace(" ", "").replace(",", ".")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


# --- Extracteurs de forme (réponse tolérante à l'enveloppe) -------------------


def _unwrap(answer: object, key: str) -> object:
    """Déballe ``{"<key>": v}`` → v ; sinon renvoie la valeur telle quelle."""
    if isinstance(answer, dict) and key in answer:
        return answer[key]
    return answer


def _as_index(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None


def _as_bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    norm = normalize_text(value)
    if norm in {"true", "vrai", "v", "oui", "1"}:
        return True
    if norm in {"false", "faux", "f", "non", "0"}:
        return False
    return None


# --- Les sept correcteurs -----------------------------------------------------


def _correct_mcq(answer: object, key: object) -> bool:
    chosen = _as_index(_unwrap(answer, "choice_index"))
    expected = _as_index(key)
    return chosen is not None and expected is not None and chosen == expected


def _correct_mcq_multi(answer: object, key: object) -> bool:
    raw = _unwrap(answer, "choice_indices")
    if not isinstance(raw, (list, tuple)) or not isinstance(key, (list, tuple)):
        return False
    chosen = {_as_index(i) for i in raw}
    expected = {_as_index(i) for i in key}
    if None in chosen or None in expected or not expected:
        return False
    return chosen == expected  # tout-ou-rien


def _correct_true_false(answer: object, key: object) -> bool:
    chosen = _as_bool(_unwrap(answer, "value"))
    expected = _as_bool(key)
    return chosen is not None and expected is not None and chosen == expected


def _accepted_set(blank: object) -> set[str]:
    """Un trou peut accepter plusieurs formulations : ``["trois", "3"]`` → {normalisées}."""
    if isinstance(blank, (list, tuple)):
        return {normalize_text(a) for a in blank}
    return {normalize_text(blank)}


def _correct_cloze(answer: object, key: object) -> bool:
    given = _unwrap(answer, "blanks")
    expected = _unwrap(key, "blanks")
    if not isinstance(given, (list, tuple)) or not isinstance(expected, (list, tuple)):
        return False
    if len(given) != len(expected) or not expected:
        return False
    for value, blank in zip(given, expected):
        if normalize_text(value) not in _accepted_set(blank):
            return False
    return True


def _correct_numeric(answer: object, key: object) -> bool:
    given = _unwrap(answer, "value")
    expected = key.get("value") if isinstance(key, dict) else key
    accept = key.get("accept") if isinstance(key, dict) else None
    tolerance = key.get("tolerance") if isinstance(key, dict) else None

    given_num, expected_num = parse_number(given), parse_number(expected)
    if given_num is not None and expected_num is not None:
        tol = parse_number(tolerance)
        tol = 1e-9 if tol is None else abs(tol)
        return abs(given_num - expected_num) <= tol

    # Repli texte (mot, date) : égalité normalisée contre la valeur ou les variantes acceptées.
    given_text = normalize_text(given)
    if given_text and given_text == normalize_text(expected):
        return True
    if isinstance(accept, (list, tuple)):
        return given_text != "" and given_text in {normalize_text(a) for a in accept}
    return False


def _correct_ordering(answer: object, key: object) -> bool:
    given = _unwrap(answer, "order")
    expected = _unwrap(key, "order")
    if not isinstance(given, (list, tuple)) or not isinstance(expected, (list, tuple)):
        return False
    if len(given) != len(expected) or not expected:
        return False
    return [normalize_text(x) for x in given] == [normalize_text(x) for x in expected]


def _correct_matching(answer: object, key: object) -> bool:
    given = _unwrap(answer, "pairs")
    expected = _unwrap(key, "pairs")
    if not isinstance(given, dict) or not isinstance(expected, dict) or not expected:
        return False
    given_norm = {normalize_text(k): normalize_text(v) for k, v in given.items()}
    expected_norm = {normalize_text(k): normalize_text(v) for k, v in expected.items()}
    return given_norm == expected_norm  # tout-ou-rien, ordre indifférent


_CORRECTORS = {
    "mcq": _correct_mcq,
    "mcq_multi": _correct_mcq_multi,
    "true_false": _correct_true_false,
    "cloze": _correct_cloze,
    "numeric": _correct_numeric,
    "ordering": _correct_ordering,
    "matching": _correct_matching,
}

SUPPORTED_TYPES = frozenset(_CORRECTORS)


def correct(question_type: str, answer_json: object, correct_answer_json: object) -> bool:
    """Corrige une réponse selon le format. Format inconnu ⇒ ``False`` (jamais d'exception)."""
    corrector = _CORRECTORS.get(question_type)
    if corrector is None:
        return False
    try:
        return corrector(answer_json, correct_answer_json)
    except Exception:  # noqa: BLE001 — une réponse illisible est fausse, jamais un crash
        return False
