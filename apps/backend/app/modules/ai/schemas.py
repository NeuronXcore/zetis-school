"""Schémas partagés du module `ai` — le travail unitaire et son accusé de réception.

⚠️ **Ici et non dans `production/`** : les cinq modules générateurs ont interdiction d'importer
`modules.production` (verrou `test_les_generateurs_nimportent_pas_production`), et ce sont eux qui
rendent ce schéma. Voir l'en-tête de `ai/travaux.py` pour le raisonnement complet.
"""

from pydantic import BaseModel

class TravailAccepteOut(BaseModel):
    """`202` : le travail est ACCEPTÉ, pas exécuté (ADR-0041 §4).

    Le corps commun à tous les producteurs migrés en slice C. **Un seul schéma**, parce qu'un `202`
    ne dit qu'une chose — *voilà le numéro de ce que tu viens de demander* — et que quinze schémas
    identiques auraient divergé au premier champ ajouté.

    Ce que le travail a PRODUIT (`fiche_id`, `quiz_id`…) se lit ensuite dans `output` de
    `GET /api/ai/jobs/{job_id}`, quand il est `succeeded`.
    """

    job_id: int
    status: str = "queued"
