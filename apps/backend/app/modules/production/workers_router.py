"""Le geste sur les workers de production (chantier « redémarrer un worker ») — `require_parent`.

Routeur DISTINCT, pour la même raison qui a déjà séparé les trois autres :
`production/router.py` est documenté « LECTURE SEULE » et un test le garantit ; `runs_router` écrit
les LOTS ; `activity_router` annonce lui-même ne porter « qu'UN seul geste d'écriture »
(l'acquittement). Y glisser un second geste ferait mentir son en-tête — un routeur de quatre lignes
coûte moins qu'un docstring faux.

⚠️ Aucune surface Massimo. Le worker est un objet de la machine ; l'enfant n'a pas à savoir
qu'elle a des rouages.
"""

from fastapi import APIRouter, Depends, status

from app.modules.auth.deps import require_parent
from app.modules.production import workers

router = APIRouter(
    prefix="/api/production/workers",
    tags=["production"],
    dependencies=[Depends(require_parent)],
)


@router.post("/{name}/restart", status_code=status.HTTP_202_ACCEPTED)
def restart_worker(name: str) -> dict:
    """Arrêt gracieux d'un worker périmé — le superviseur le relance avec le code à jour.

    **202, pas 200** : l'ordre est accepté, pas exécuté. La pièce en cours se termine d'abord
    (un appel LLM n'est pas préemptible), ce qui peut prendre jusqu'à ~77 s — l'écran doit
    l'annoncer plutôt que de laisser croire à un bouton cassé.

    Refus : 409 si rien ne supervise (le motif dit quoi faire à la place) · 404 si le nom est
    inconnu des files de production · 503 si Redis est injoignable (rien n'a été envoyé).
    """
    return workers.redemarrer(name)
