"""Réglages d'application modifiables **à chaud** par Papa depuis son interface.

Table clé/valeur volontairement minimale. Elle n'existe que pour une raison : certains réglages
sont des **gestes de Papa**, pas des choix de déploiement. `AGENDA_STUDENT_ENTRY_ENABLED` en est
le premier cas (ADR-0025 §10) — « la bascule est un geste de Papa, un interrupteur sur sa page ».
Une variable d'environnement demanderait d'éditer un fichier et de redémarrer le serveur : ce
n'est pas un geste, c'est une opération.

**La variable d'environnement reste la valeur par défaut.** Tant qu'aucune ligne n'existe, c'est
elle qui répond ; la première bascule depuis l'UI crée la ligne, qui prime ensuite. Aucun
back-fill, aucune duplication de configuration.

Ne pas transformer cette table en fourre-tout : un réglage qui ne change jamais en production
appartient à `core/config.py`.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AppSetting(Base, TimestampMixin):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    # Sérialisation texte : le seul consommateur actuel est un booléen, et un JSON générique
    # rendrait la lecture plus obscure qu'elle ne doit l'être pour deux valeurs possibles.
    value: Mapped[str] = mapped_column(String(200))
