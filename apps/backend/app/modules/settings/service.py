"""Paliers d'autonomie de ZETIS (ADR-0032) — six clés plates, un vocabulaire fermé.

## Pourquoi six clés et pas un blob

Une clé plate se lit, se journalise et se corrige seule. Un blob JSON ferait d'un changement de
réglage une réécriture de tous les autres, et d'une migration d'un réglage une migration de tous.

## Pourquoi le préréglage n'est pas stocké

`Manuel` / `Semi-autonome` / `Autonome` sont un **raccourci d'écriture**, jamais un état. Rien ne
les persiste : `preset_of()` les **dérive** des six valeurs. Un mode stocké *plus* six clés
donnerait **deux réponses à une seule question** — exactement le mal que le §G.1 a évité en
refusant une colonne `authority` à côté de `validated_by`. Le jour où les deux divergent,
laquelle fait foi ?

## Pourquoi les défauts sont des constantes et pas des variables d'environnement

Le patron de `agenda.service` (env var comme défaut, ligne DB qui prime) répond à un besoin de
**déploiement**. Ici le défaut n'est pas un choix d'installation : c'est le **régime réel
d'aujourd'hui**, mesuré le 2026-08-02 (dérivés et cartes servis sans relecture, cours gaté). Le
mettre en env var laisserait croire qu'il se configure ; il se **constate**.

## Le verrou est porté par la donnée, jamais par le code appelant

Chaque classe expose ses `choices`. **Une valeur hors `choices` est refusée côté serveur**, quel
que soit le chemin — préréglage compris. L'interface ne fait que rendre lisible ce que le serveur
refuse déjà ; elle ne détient aucune liste en dur.
"""

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import AppSetting

# --- Vocabulaire des paliers -------------------------------------------------------------------
#
# 0 — jamais autonome (réservé à la classe terminale)
# 1 — ZETIS propose, Papa fait
# 2 — ZETIS produit, Papa valide avant que Massimo le voie
# 3 — ZETIS produit ET sert ; Papa dispose d'un veto tant que Massimo n'a pas consommé
NEVER, PROPOSE, VALIDATE, SERVE = 0, 1, 2, 3

# ⚠️ Le palier 3 d'A1 est refusé TANT QUE LE VETO N'A PAS DE SURFACE (ADR-0032, verrou n°5).
# Laisser ZETIS servir des cours sans écran pour les retirer, ce serait livrer un droit qui
# n'existe pas. Le jour où le Journal est livré, ce drapeau passe à `True` — et c'est le seul
# geste à faire ici.
VETO_SURFACE_AVAILABLE = False


@dataclass(frozen=True)
class AutonomyClass:
    """Une classe d'objets et le palier qu'elle peut atteindre.

    `choices` EST le verrou : ce qui n'y est pas est refusé. Une classe à un seul choix est
    verrouillée — et `reason` dit pourquoi, parce qu'un cadenas muet se lit comme une panne.
    """

    key: str
    code: str
    label: str
    default: int
    choices: tuple[int, ...]
    # UN seul champ de motif, et c'est délibéré : deux champs (« verrouillé par doctrine » vs
    # « restreint par la phase de livraison ») demanderaient à l'UI de choisir lequel afficher,
    # pour un texte qui dit déjà lequel c'est. Une question, une réponse.
    reason: str | None = None

    @property
    def locked(self) -> bool:
        return len(self.choices) == 1


_A1_CHOICES = (VALIDATE, SERVE) if VETO_SURFACE_AVAILABLE else (VALIDATE,)

# L'ordre de ce tuple est l'ordre d'affichage. Il suit la matrice du §G.2.
AUTONOMY_CLASSES: tuple[AutonomyClass, ...] = (
    AutonomyClass(
        key="zetis_autonomy_a0a_derives",
        code="A0a",
        label="Dérivés inertes",
        default=SERVE,
        choices=(VALIDATE, SERVE),
    ),
    AutonomyClass(
        key="zetis_autonomy_a0b_cards",
        code="A0b",
        label="Cartes de révision",
        default=SERVE,
        choices=(SERVE,),
        # Constat de code, pas une doctrine : `spaced_review_cards` n'a ni `validation_status`
        # ni `validated_by`. Offrir « vous validez » mettrait les cartes dans un état que le
        # code ne sait pas produire — un interrupteur sans effet, exactement le piège soldé sur
        # cette page le 2026-08-02.
        reason=(
            "Aucune étape de validation n'existe pour les cartes de révision. "
            "« Vous validez » serait un réglage sans effet tant qu'elle n'est pas construite."
        ),
    ),
    AutonomyClass(
        key="zetis_autonomy_a1_course",
        code="A1",
        label="Rédaction de cours",
        default=VALIDATE,
        choices=_A1_CHOICES,
        reason=(
            None
            if VETO_SURFACE_AVAILABLE
            else "« ZETIS sert » sera disponible avec le Journal — sans lui, le retrait n'existe pas."
        ),
    ),
    AutonomyClass(
        key="zetis_autonomy_a2_curriculum",
        code="A2",
        label="Programme",
        default=PROPOSE,
        choices=(PROPOSE,),
        reason="Une erreur ici redessine la carte : ZETIS propose, vous tranchez.",
    ),
    AutonomyClass(
        key="zetis_autonomy_a3_missions",
        code="A3",
        label="Création de missions",
        default=VALIDATE,
        choices=(VALIDATE,),
        reason="Élire n'est pas créer : le sélecteur quotidien est déjà autonome, la création non.",
    ),
    AutonomyClass(
        key="zetis_autonomy_a4_terminal",
        code="A4",
        label="Supprimer, archiver, dévalider",
        default=NEVER,
        choices=(NEVER,),
        reason="Définitif. Aucun réglage ne l'ouvrira.",
    ),
)

BY_KEY = {c.key: c for c in AUTONOMY_CLASSES}
A0A, A0B, A1, A2, A3, A4 = (c.key for c in AUTONOMY_CLASSES)

# Les trois régimes nommés. Ils n'écrivent que les classes réglables : recopier les classes
# verrouillées ferait d'un préréglage une porte dérobée sur une décision figée.
PRESETS: dict[str, dict[str, int]] = {
    "manuel": {A0A: VALIDATE, A1: VALIDATE},
    "semi": {A0A: SERVE, A1: VALIDATE},
    "autonome": {A0A: SERVE, A1: SERVE},
}


# --- Lecture -----------------------------------------------------------------------------------


def read_autonomy(db: Session) -> dict[str, int]:
    """Les six valeurs. Une clé absente rend son défaut — aucun back-fill, aucune écriture."""
    values: dict[str, int] = {}
    for cls in AUTONOMY_CLASSES:
        row = db.get(AppSetting, cls.key)
        try:
            values[cls.key] = cls.default if row is None else int(row.value)
        except ValueError:
            # Une valeur illisible (édition manuelle en base) ne doit pas faire tomber une page
            # de réglages : on retombe sur le défaut, qui est un état sûr.
            values[cls.key] = cls.default
    return values


def preset_of(values: dict[str, int]) -> str | None:
    """Le nom du régime, DÉRIVÉ. `None` = « sur mesure » — un état rendu, jamais stocké."""
    for name, preset in PRESETS.items():
        if all(values[key] == value for key, value in preset.items()):
            return name
    return None


# --- Écriture ----------------------------------------------------------------------------------


def _reject(key: str, value: int) -> None:
    cls = BY_KEY[key]
    detail = cls.reason or (
        f"Palier {value} indisponible pour « {cls.label} »."
    )
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def apply_monotonicity(values: dict[str, int]) -> dict[str, int]:
    """Servir un cours sans relecture force les dérivés au même régime.

    Règle, pas préférence : on ne sert pas un cours non relu tout en relisant les fiches qui en
    dérivent. L'état inverse (A0a=2, A1=3) est incohérent et n'est jamais produit.
    """
    if values.get(A1) == SERVE:
        values[A0A] = SERVE
    return values


def write_autonomy(db: Session, changes: dict[str, int]) -> dict[str, int]:
    """Écrit les clés demandées. Refuse — et DIT pourquoi — tout ce qui sort des `choices`."""
    unknown = sorted(set(changes) - set(BY_KEY))
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Réglage inconnu : {unknown[0]}."
        )

    target = apply_monotonicity({**read_autonomy(db), **changes})
    for key, value in target.items():
        if value not in BY_KEY[key].choices:
            _reject(key, value)

    for key, value in target.items():
        row = db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=str(value)))
        else:
            row.value = str(value)
    db.commit()
    return target


# --- Ce que les paliers COMMANDENT, exprimé une fois -------------------------------------------
#
# Ces deux fonctions sont le seul pont entre les réglages et la production. Les nommer ici évite
# que chaque appelant réinterprète un entier à sa façon.


def course_gate_enabled(db: Session) -> bool:
    """A1 < 3 → la production n'équipe que les notions dont le cours est DÉJÀ validé.

    C'est le gate du §7 (addendum ADR-0031), et il vit dans la sélection. À A1 = 3, il tombe :
    `equip_notion` retrouve ses deux chemins de rédaction/validation du cours, sans qu'une ligne
    de l'orchestrateur ait bougé.
    """
    return read_autonomy(db)[A1] < SERVE


def derivatives_are_served(db: Session) -> bool:
    """A0a ≥ 3 → les dérivés produits en lot sont validés d'office ; sinon ils restent `pending`."""
    return read_autonomy(db)[A0A] >= SERVE
