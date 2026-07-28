"""Fuseau et découpage temporel de l'activité.

Règle du chantier : `created_at` est STOCKÉ en UTC, mais tout regroupement présenté à Papa
(jour, semaine) se fait en **Europe/Paris**. Sans ça, une session de 23h30 en heure française
tomberait la veille (UTC+1/+2 selon la saison) et la heatmap mentirait d'une case.

Fonctions pures, sans accès DB — testables isolément.
"""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings


def tz() -> ZoneInfo:
    """Fuseau de présentation de l'activité (configurable, `Europe/Paris` par défaut)."""
    return ZoneInfo(settings.activity_timezone)


def to_utc(moment: datetime) -> datetime:
    """Datetime conscient du fuseau, ramené en UTC.

    Un datetime NAÏF est interprété comme UTC : c'est ce que rend SQLite, qui perd le tzinfo
    d'une colonne `DateTime(timezone=True)` là où PostgreSQL le conserve. Sans cette
    normalisation, les projections planteraient en test (soustraction naïf − aware) tout en
    marchant en production."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def local_day(moment: datetime) -> date:
    """Jour Europe/Paris auquel appartient un instant stocké en UTC."""
    return to_utc(moment).astimezone(tz()).date()


def local_time_label(moment: datetime) -> str:
    """Heure locale « HH:MM » d'un instant stocké en UTC (affichage du journal)."""
    return to_utc(moment).astimezone(tz()).strftime("%H:%M")


def day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """Bornes UTC [début, fin[ d'un jour Europe/Paris — l'intervalle à passer en SQL."""
    zone = tz()
    start = datetime.combine(day, time.min, tzinfo=zone)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=zone)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def range_bounds_utc(first: date, last: date) -> tuple[datetime, datetime]:
    """Bornes UTC [début du premier jour, fin du dernier jour[ en Europe/Paris."""
    start, _ = day_bounds_utc(first)
    _, end = day_bounds_utc(last)
    return start, end


def today_local() -> date:
    """Date du jour en Europe/Paris (et non en UTC)."""
    return datetime.now(timezone.utc).astimezone(tz()).date()


def week_start(day: date) -> date:
    """Lundi de la semaine contenant `day` (semaine lun→dim, cf. spec des deltas KPI)."""
    return day - timedelta(days=day.weekday())
