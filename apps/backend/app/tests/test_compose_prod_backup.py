"""Test-verrou : la cible de sauvegarde est montée FAIL-CLOSED sur `backend` ET `worker` (ADR-0065 §2).

Deux pièges que ce fichier ferme, tous deux silencieux :

- **le montage manquant sur l'un des deux** : l'ancre YAML `generation-env` ne porte que
  l'ENVIRONNEMENT — les volumes se déclarent par service. Oublier le worker ferait échouer
  `backup_create` (c'est LUI qui écrit l'archive) pendant que le backend, monté, listerait un
  répertoire vide sans broncher ;
- **le `:-` à la place du `:?`** : une prod qui se rabat en silence sur un chemin de dev n'a pas
  de cible de sauvegarde — elle a une illusion de cible. Doctrine du compose de prod, posée sur
  `POSTGRES_PASSWORD` : sans la variable, `prod:up` s'arrête avec son motif.

Réutilise le parseur de `test_compose_prod_restart` (PyYAML n'est pas déclaré dans
`pyproject.toml` — l'importer passerait en local et tomberait en CI).
"""

from app.tests.test_compose_prod_restart import _blocs_de_services

#: Les deux services qui lisent `ZETIS_BACKUP_DIR` : le worker écrit, le backend liste (§2).
_SERVICES_MONTES = ("backend", "worker")


def test_backend_et_worker_montent_la_cible_en_fail_closed() -> None:
    blocs = _blocs_de_services()
    for service in _SERVICES_MONTES:
        lignes = [l.strip() for l in blocs[service]]
        montage = [l for l in lignes if ":/backups" in l]
        assert montage, (
            f"Le service `{service}` ne monte plus la cible de sauvegarde sur /backups : "
            "l'ancre `generation-env` ne porte que l'environnement — le volume se déclare "
            "PAR service (ADR-0065 §2)."
        )
        assert any("${ZETIS_BACKUP_DIR:?" in l for l in montage), (
            f"Le montage /backups de `{service}` n'est plus fail-closed (`:?`) : une prod sans "
            "cible de sauvegarde ne doit pas démarrer en silence (ADR-0065 §2, doctrine "
            "POSTGRES_PASSWORD)."
        )


def test_l_ancre_donne_le_chemin_conteneur_aux_deux_services() -> None:
    """`ZETIS_BACKUP_DIR: /backups` vit DANS l'ancre du backend — le worker la reçoit par
    `*generation-env`, donc les deux conteneurs lisent le même chemin. La déplacer hors de
    l'ancre ferait diverger les deux au premier ajout."""
    blocs = _blocs_de_services()
    assert any(
        l.strip() == "ZETIS_BACKUP_DIR: /backups" for l in blocs["backend"]
    ), "Le backend ne fixe plus ZETIS_BACKUP_DIR=/backups dans l'ancre `generation-env` (ADR-0065 §2)."
