"""Provenance de la validation — un seul point d'écriture (addendum ADR-0011 §F).

`validation_status` dit SI un contenu est passé ; `validated_by` dit QUI l'a laissé passer.
Trois situations portaient jusqu'ici la même valeur `validated` :

- `PARENT` — objet ouvert et relu individuellement ;
- `PARENT_BULK` — passé dans une validation groupée (`validate-all`, équipement ADR-0021 §2,
  composition champion ADR-0022 §5), jamais ouvert pièce par pièce ;
- `SYSTEM` — servi sans relecture **par doctrine**, strictement réservé au quiz (ADR-0014 §2).

`mark_validated` est le SEUL chemin d'écriture : passer par lui garantit qu'aucun objet ne
devient `validated` sans provenance (§F.3, test-verrou). Toute action groupée écrit
`PARENT_BULK` **sans exception** — y compris quand elle valide un brouillon `pending`
préexistant de Papa, cas aujourd'hui indétectable et qui est précisément celui qu'il faut voir.

La provenance est un **fait, jamais un reproche** (§F.2) : elle s'affiche par objet, ne se
totalise pas, ne déclenche aucune relance. Un compteur qui reproche à Papa une tâche qu'il a
choisi de ne pas faire n'est pas un outil.
"""

from datetime import datetime, timezone
from typing import Any, Literal

ValidatedBy = Literal["parent", "parent_bulk", "parent_rule", "system"]

PARENT: ValidatedBy = "parent"
PARENT_BULK: ValidatedBy = "parent_bulk"
# `parent_rule` — aucun humain n'a ouvert la pièce NI CLIQUÉ POUR CE LOT ; un humain a autorisé la
# règle permanente qui l'a produite (addendum §G.1). Un cran de plus sur la même échelle.
#
# ⚠️ **LÉGALE ET NON ÉMISE** en l'état, et le motif n'est pas celui qu'on croit : ce n'est pas le
# palier 3 qui la déclenche, c'est l'ABSENCE DE CLIC. Tant que tout lot part d'un geste de Papa
# (`production_runs.authorized_by = 'parent_direct'`), la provenance juste reste `parent_bulk`,
# même à A1 = 3. Elle s'émettra le jour où un lot démarrera sans que personne l'ait demandé.
PARENT_RULE: ValidatedBy = "parent_rule"
SYSTEM: ValidatedBy = "system"


def mark_validated(row: Any, by: ValidatedBy, *, field: str = "validation_status") -> None:
    """Passe `row` en `validated` ET horodate sa provenance. Unique écrivain (§F.3).

    `field` vaut `status` pour les leçons (dont le statut de validation s'appelle ainsi) et
    `validation_status` partout ailleurs.
    """
    setattr(row, field, "validated")
    row.validated_at = datetime.now(timezone.utc)
    row.validated_by = by
