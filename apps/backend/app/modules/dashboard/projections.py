"""Projections PURES de l'agrégat dashboard : aucun accès DB, testables isolément.

Même patron que la section 1 de `activity/service.py`, dont ce module réutilise les briques
(`event_minutes`, `local_day`) plutôt que de refaire un calcul de minutes actives — il n'en existe
qu'une définition dans le dépôt, et elle est versionnée par `ACTIVE_GAP_CAP_MINUTES`.
"""

from datetime import date, datetime, timedelta

from app.modules.activity.service import bucket_days, event_minutes
from app.modules.activity.timeutils import local_day, to_utc, tz

# --- Fenêtres -----------------------------------------------------------------------------------

PERIODS = (7, 30, 90, 365)
SERIES_POINTS = 12

# Profondeur d'historique que l'agrégat doit charger pour que CHAQUE fenêtre soit vraie.
#
# ⚠️ Le facteur 2 n'est pas une marge : les KPI portent un delta calculé contre la fenêtre
# PRÉCÉDENTE de même longueur (`previous_window`). Charger seulement `max(PERIODS)` jours donnerait
# une valeur juste et un delta structurellement nul — un écran crédible et faux. C'est ce qui serait
# arrivé à la fenêtre 365 en la posant sur l'ancien chargement de 26 semaines : 182 jours vus sur
# 365 annoncés, et « +0 » à vie.
HISTORY_DAYS = max(PERIODS) * 2

# --- Créneaux horaires --------------------------------------------------------------------------

SLOT_START_HOUR = 8
SLOT_HOURS = 2
SLOT_COUNT = 8  # 8 h → 24 h (adr-0028 §6 : « 8 h → 22 h » n'en faisait que sept)
WEEKDAYS = 7

# --- Statuts de maîtrise (adr-0028 §3 bis) ------------------------------------------------------
# Les quatre segments de la carte « État des notions ». Écrits ICI, côté serveur, parce qu'un
# client qui rejouerait ces seuils pourrait diverger d'une autre surface Papa.
#
# ⚠️ `in_progress` est un SIXIÈME statut, écrit par `missions/service.py` au verdict
# `review_later`, et il ne sort d'aucun `_status_from_score()`. Un mapping qui n'énumérerait que
# les cinq paliers de score le manquerait en silence.
CONSOLIDATED_STATUSES = frozenset({"mastered"})
FRAGILE_STATUSES = frozenset({"weak", "learning"})
IN_PROGRESS_STATUSES = frozenset({"solid", "in_progress"})


def period_window(period: int, today: date) -> tuple[date, date]:
    """Fenêtre glissante de `period` jours, bornes incluses, se terminant aujourd'hui."""
    return today - timedelta(days=period - 1), today


def previous_window(period: int, today: date) -> tuple[date, date]:
    """Fenêtre précédente de même longueur — c'est la base des deltas `{value, delta}`."""
    end = today - timedelta(days=period)
    return end - timedelta(days=period - 1), end


def series_marks(period: int, today: date) -> list[date]:
    """Les 12 instants d'observation d'une fenêtre, du plus ancien au plus récent.

    Le DERNIER point est toujours aujourd'hui : c'est ce qui garantit que la fin d'une courbe
    coïncide avec le compteur affiché en KPI et avec les barres empilées. Une courbe qui finirait
    ailleurs que sur le chiffre affiché à côté d'elle serait illisible.
    """
    first, last = period_window(period, today)
    span = (last - first).days
    return [first + timedelta(days=round(span * i / (SERIES_POINTS - 1))) for i in range(SERIES_POINTS)]


def slot_index(moment: datetime) -> int | None:
    """Créneau de 2 h d'un instant, en heure locale. `None` = hors plage 8 h–24 h.

    Les minutes de 0 h à 8 h ne sont PAS repliées dans le premier créneau : elles seraient datées
    d'une heure fausse. Elles ressortent à part (`slots_outside_minutes`), ce qui permet à la carte
    de les mentionner sans mentir sur la grille.
    """
    # `to_utc` d'abord : SQLite (tests) rend des datetimes naïfs, `astimezone` les lirait alors
    # dans le fuseau du serveur. Même normalisation que partout ailleurs dans le dépôt.
    hour = to_utc(moment).astimezone(tz()).hour
    if hour < SLOT_START_HOUR:
        return None
    return min(SLOT_COUNT - 1, (hour - SLOT_START_HOUR) // SLOT_HOURS)


def minutes_per_event(events: list) -> list[tuple[object, int]]:
    """Apparie chaque événement aux minutes qu'il porte, **découpé par jour**.

    C'est la convention de tout le dépôt (`heatmap`, `_week_metrics`) : l'écart entre le dernier
    événement d'un jour et le premier du lendemain n'est pas du temps de travail. Calculer les
    minutes sur la suite complète compterait une nuit entière plafonnée à cinq minutes par jour
    de plus — faible, mais faux, et divergent du chiffre déjà affiché ailleurs.

    Renvoie `[(événement, minutes)]`. Sommer la seconde colonne d'une fenêtre donne exactement le
    temps actif de cette fenêtre : aucun consommateur n'a jamais à recalculer.
    """
    pairs: list[tuple[object, int]] = []
    for _day, day_events in bucket_days(events).items():
        # Même clé de tri que `activity.service._sorted` : `event_minutes` rend ses minutes dans
        # CET ordre, les apparier à un autre ordre décalerait chaque minute d'un événement.
        ordered = sorted(day_events, key=lambda e: (to_utc(e.created_at), e.id or 0))
        pairs.extend(zip(ordered, event_minutes(day_events)))
    return pairs


def bucket_slots(
    pairs: list[tuple[object, int]], *, first_day: date, last_day: date
) -> tuple[list[list[int]], int]:
    """Semaine type : minutes actives MOYENNES par (créneau, jour de semaine), + hors plage.

    Prend des paires `(événement, minutes)` — et non des événements bruts — pour que le découpage
    par jour reste décidé en UN endroit (`minutes_per_event`) et que la grille des créneaux ne
    puisse pas diverger du total affiché au-dessus d'elle.

    Renvoie `(matrice 8×7, minutes_hors_plage)`. La moyenne divise par le nombre d'occurrences du
    jour de semaine DANS LA FENÊTRE (un lundi sur une fenêtre de 7 jours, treize sur 90) — sinon
    une fenêtre longue afficherait mécaniquement des créneaux plus chargés qu'une courte, alors
    que c'est la même habitude.
    """
    totals = [[0 for _ in range(WEEKDAYS)] for _ in range(SLOT_COUNT)]
    outside = 0
    for event, gained in pairs:
        if gained <= 0:
            continue
        slot = slot_index(event.created_at)
        if slot is None:
            outside += gained
            continue
        totals[slot][local_day(event.created_at).weekday()] += gained

    occurrences = _weekday_occurrences(first_day, last_day)
    matrix = [
        [round(totals[s][d] / occurrences[d]) if occurrences[d] else 0 for d in range(WEEKDAYS)]
        for s in range(SLOT_COUNT)
    ]
    return matrix, outside


def _weekday_occurrences(first_day: date, last_day: date) -> list[int]:
    """Combien de lundis, mardis… la fenêtre contient-elle."""
    counts = [0] * WEEKDAYS
    cursor = first_day
    while cursor <= last_day:
        counts[cursor.weekday()] += 1
        cursor += timedelta(days=1)
    return counts


def notions_breakdown(statuses: list[str], total: int) -> dict[str, int]:
    """Répartit les notions d'une matière sur les quatre segments (adr-0028 §3 bis).

    `total` est le nombre de notions AU PROGRAMME ; « non abordées » est le reste, c'est-à-dire les
    notions sans aucune ligne de maîtrise. Un statut inconnu tombe volontairement dans « en cours »
    plutôt que d'être perdu : mieux vaut une notion mal rangée qu'une notion invisible.
    """
    consolidated = sum(1 for s in statuses if s in CONSOLIDATED_STATUSES)
    fragile = sum(1 for s in statuses if s in FRAGILE_STATUSES)
    in_progress = len(statuses) - consolidated - fragile
    return {
        "consolidated": consolidated,
        "fragile": fragile,
        "in_progress": in_progress,
        "total": max(total, len(statuses)),
    }


def reconstruct_series(current: int, entered_after: list[date], marks: list[date]) -> list[int]:
    """Reconstruit une courbe à rebours : **l'ensemble d'aujourd'hui, moins ce qui y est entré après.**

    Règle unique appliquée aux trois courbes de « Évolution de la mémoire » (`covered`,
    `consolidated`, `fragile`) et à la sparkline des notions consolidées. Elle a trois propriétés
    qui font tenir la carte :

    1. le dernier point vaut exactement le compteur courant — la courbe finit sur le chiffre
       affiché à côté d'elle ;
    2. elle est croissante et n'invente jamais un passé qu'on ne sait pas dater ;
    3. un élément dont l'entrée n'est pas datable est réputé présent sur toute la fenêtre — ce qui
       sous-estime la progression au lieu de la gonfler. C'est le sens du biais qu'on veut : mieux
       vaut une courbe trop plate qu'une courbe qui célèbre des acquis anciens.
    """
    return [current - sum(1 for when in entered_after if when > mark) for mark in marks]


def bucket_counts(days: list[date], marks: list[date]) -> list[int]:
    """Répartit des jours d'activité sur les 12 intervalles d'une sparkline.

    Contrairement à `reconstruct_series` (un STOCK observé à des instants), il s'agit ici d'un
    FLUX : chaque point compte ce qui s'est passé entre le point précédent et lui.
    """
    counts = [0] * len(marks)
    for day in days:
        for index, mark in enumerate(marks):
            if day <= mark:
                counts[index] += 1
                break
    return counts


def bucket_sums(pairs: list[tuple[date, int]], marks: list[date]) -> list[int]:
    """Idem `bucket_counts`, en sommant une valeur par jour (minutes actives)."""
    totals = [0] * len(marks)
    for day, value in pairs:
        for index, mark in enumerate(marks):
            if day <= mark:
                totals[index] += value
                break
    return totals


# --- Flux, par opposition aux stocks reconstruits ------------------------------------------------
#
# Tout ce qui précède `reconstruct_series` dans ce module projette des STOCKS à rebours. Les deux
# fonctions ci-dessous comptent des ÉVÉNEMENTS DATÉS, et c'est une différence de nature :
#
#   - un stock reconstruit est croissant PAR CONSTRUCTION et ne peut jamais redescendre ;
#   - un flux peut être négatif, et c'est tout son intérêt.
#
# ⚠️ Les deux ne se réconcilient PAS et ne doivent pas être présentés comme deux vues du même
# nombre. `adr-0028-dashboard-papa-agregat-unique (Amendement 2) §5 ter` écarte le solde AU TITRE DU DELTA DE KPI,
# précisément parce qu'il contredirait la sparkline voisine. Ce qui est servi ici ne remplace aucun
# KPI : c'est une vue autonome, à charge pour la carte de nommer la différence.


def window_days(days: list[date], marks: list[date]) -> list[date]:
    """Restreint des jours à la fenêtre couverte par `marks`, bornes incluses.

    ⚠️ Indispensable avant tout `bucket_counts` sur un FLUX. `bucket_counts` range chaque jour dans
    le PREMIER repère qui l'atteint : un jour antérieur à la fenêtre tombe donc dans le bucket 0 au
    lieu d'être ignoré, et gonfle silencieusement le premier point. Sur un stock la question ne se
    pose pas (rien n'est bucketisé) ; sur un flux, l'oubli fabrique un pic à gauche.
    """
    if not marks:
        return []
    return [day for day in days if marks[0] <= day <= marks[-1]]


def consolidation_flux(
    transitions: list[tuple[int, str, date]], marks: list[date]
) -> tuple[list[int], list[int]]:
    """Entrées et sorties du palier « consolidée », par intervalle.

    `transitions` = `(skill_id, statut APRÈS la bascule, jour)`, dans n'importe quel ordre. Rend
    `(gagnées, perdues)`, deux listes positives de la longueur de `marks` — le signe est porté par
    le sens de lecture de la carte, pas par les nombres.

    Trois règles, toutes destinées à ne jamais inventer un événement qu'on ne sait pas prouver :

    1. l'état AVANT la première bascule connue d'une notion est inconnu, et le reste. Une première
       bascule vers `mastered` compte comme une entrée (c'est ce que le backfill de la migration a
       posé, depuis `mastered_at`) ; une première bascule vers autre chose ne compte **rien** —
       en particulier pas une perte, qui supposerait un acquis qu'on n'a pas observé ;
    2. seule une notion **observée consolidée** peut être comptée perdue ;
    3. une bascule qui ne traverse pas la frontière (`weak` → `learning`) ne compte nulle part.

    ⚠️ Une notion peut entrer et sortir plusieurs fois dans la même fenêtre. Les deux listes
    comptent alors **les deux fois** : ce sont des mouvements, pas un solde de population.
    """
    ordered = sorted(transitions, key=lambda row: row[2])
    previous: dict[int, str] = {}
    gained: list[date] = []
    lost: list[date] = []

    for skill_id, status, day in ordered:
        before = previous.get(skill_id)
        previous[skill_id] = status
        now = status in CONSOLIDATED_STATUSES
        if before is None:
            if now:
                gained.append(day)
            continue
        was = before in CONSOLIDATED_STATUSES
        if now and not was:
            gained.append(day)
        elif was and not now:
            lost.append(day)

    return (
        bucket_counts(window_days(gained, marks), marks),
        bucket_counts(window_days(lost, marks), marks),
    )
