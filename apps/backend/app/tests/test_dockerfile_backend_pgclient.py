"""Test-verrou : l'image backend embarque le client PostgreSQL, ALIGNÉ sur le serveur (ADR-0065).

`pg_dump` n'est PAS dans l'image de base (mesuré au cadrage : `which pg_dump` → rien ;
`psycopg[binary]` embarque libpq, pas les binaires clients). La sauvegarde dumpe — et la slice 2
restaurera à blanc — depuis le conteneur backend/worker : sans le paquet, `backup_create` échoue
au premier `subprocess.run(["pg_dump", …])`.

Et la contrainte qui vivra plus longtemps que ce chantier : **la majeure du client suit celle du
serveur** (`pgvector/pgvector:pgN` du compose de prod). Un `pg_dump` plus vieux que son serveur
refuse de servir — le jour où le serveur passe en pg17, l'image doit suivre, et c'est CE test qui
le rappellera.

⚠️ LECTURE DE TEXTE, jamais d'exécution — même règle que `test_dockerfile_backend_extras.py` :
la CI n'a ni Docker ni le paquet. Un échec ici ne se répare pas en ajustant l'assertion : il se
répare dans `backend.Dockerfile`.
"""

import re
from pathlib import Path

RACINE = Path(__file__).resolve().parents[4]
DOCKERFILE = RACINE / "infra" / "docker" / "backend.Dockerfile"
COMPOSE = RACINE / "docker-compose.prod.yml"

#: Le paquet PGDG, vérifié dans un conteneur d'essai le 2026-08-19 : `postgresql-client-16`
#: (16.15-1.pgdg12+2), dépôt `bookworm-pgdg` — bookworm seul ne porte que pg15.
_CLIENT = re.compile(r"postgresql-client-(\d+)")
_SERVEUR = re.compile(r"pgvector/pgvector:pg(\d+)")


def test_le_client_postgres_vient_du_depot_pgdg() -> None:
    """Sans le dépôt PGDG, `apt-get install postgresql-client-16` ne résout pas sur bookworm —
    l'image se construirait avec le pg15 de Debian, plus vieux que le serveur."""
    texte = DOCKERFILE.read_text(encoding="utf-8")
    assert "apt.postgresql.org" in texte, (
        "backend.Dockerfile n'ajoute plus le dépôt PGDG : bookworm seul ne fournit que pg15, "
        "et un pg_dump plus vieux que le serveur pg16 refuse de servir. Cf. ADR-0065."
    )
    assert _CLIENT.search(texte), (
        "backend.Dockerfile n'installe plus `postgresql-client-N` : backup_create échouera au "
        "premier pg_dump. Cf. ADR-0065 §Livré."
    )


def test_la_majeure_du_client_est_epinglee_sur_celle_du_serveur() -> None:
    """La contrainte d'alignement de l'ADR-0065 §Conséquences, tenue par comparaison des DEUX
    fichiers — pas par un chiffre recopié qui divergerait au premier upgrade."""
    client = _CLIENT.search(DOCKERFILE.read_text(encoding="utf-8"))
    serveur = _SERVEUR.search(COMPOSE.read_text(encoding="utf-8"))
    assert client, "backend.Dockerfile : ligne `postgresql-client-N` introuvable."
    assert serveur, "docker-compose.prod.yml : image `pgvector/pgvector:pgN` introuvable."
    assert client.group(1) == serveur.group(1), (
        f"Le client PostgreSQL de l'image ({client.group(1)}) ne suit plus la majeure du serveur "
        f"({serveur.group(1)}). Un pg_dump plus vieux que son serveur refuse de servir : mettre "
        "backend.Dockerfile au niveau du serveur (jamais l'inverse en silence). Cf. ADR-0065."
    )
