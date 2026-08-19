"""« Qu'est-ce que j'ai bricolé, déjà ? » — les réglages qui s'écartent du défaut (ADR-0062 §4).

## Pourquoi ce module tient en dix lignes

Parce que la réponse est **déjà dans la forme de la table**. `db/models/settings.py` pose la
doctrine en tête de fichier :

    « Tant qu'aucune ligne n'existe, c'est la variable d'environnement qui répond ; la première
      bascule depuis l'UI crée la ligne, qui prime ensuite. »

Donc **« modifié » = « une ligne existe »**. Il n'y a rien à calculer, aucun défaut à recopier ici,
et surtout aucune seconde source de vérité : le jour où un défaut change dans `core/config.py` ou
dans `AUTONOMY_CLASSES`, cette réponse reste juste **sans qu'on y touche**.

⚠️ **Comparer les valeurs aux défauts serait le piège.** Ça marcherait, et ça obligerait ce module
à connaître le défaut de chaque clé — c'est-à-dire à en tenir une copie. Deux copies d'un défaut
finissent par diverger, et celle qui ment est toujours celle qu'on lit.

## Les CLÉS, jamais les valeurs

On ne rend que les clés. Une valeur n'apporte rien à la question posée (« qu'est-ce qui n'est plus
au défaut ? ») et chaque champ qui sort est un champ à protéger. La page lit ces clés et les
rapproche de sa carte ; elle n'en affiche aucune telle quelle.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AppSetting


def cles_ecartees(db: Session) -> list[str]:
    """Les clés `app_settings` qui portent une ligne — donc celles qui ne sont plus au défaut.

    Triées, pour que deux lectures successives ne rendent pas deux ordres : un écran qui
    réordonne ses lignes sans raison se lit comme un changement.
    """
    return list(db.scalars(select(AppSetting.key).order_by(AppSetting.key)))
