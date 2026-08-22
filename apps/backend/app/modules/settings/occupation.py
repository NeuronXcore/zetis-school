"""Ce qui prend de la place — les quatre postes de l'ADR-0069, mesurés à la demande.

🔴 **La question est « qu'est-ce qui prend de la place ? », pas « vais-je manquer de place ? »**
(§1). Ce module ne rend **aucun espace libre**, et c'est un choix : l'espace libre a deux
plafonds qui ne se valent pas — un bind-mount rend le disque de l'hôte, la racine du conteneur
rend le disque virtuel de Docker Desktop (3,6 T contre 910,7 G, mesurés le 2026-08-22). En
montrer un seul mentirait. Une taille PRODUITE, elle, est vraie partout : elle ne dépend
d'aucun montage.

🔴 **Aucun chemin en dur** (§4), et le motif est mesuré : `audio_storage_dir` vaut
`"storage/generated"`, un chemin **relatif** résolu depuis le cwd du processus — l'audio vit donc
dans `apps/backend/storage/generated`, tandis que le `storage/` de la racine ne porte que les
modèles. Deux `storage/` coexistent dans le dépôt, et une constante écrite ici désignerait le
mauvais. (`backup_dir` est relatif lui aussi : même règle, même raison.)

⚠️ **Absent ≠ non mesurable.** Un répertoire qui n'existe pas rend **0** — c'est un fait, il n'y
a rien dedans. Une mesure IMPOSSIBLE rend **`None`** : `pg_database_size` sous SQLite, un MinIO
injoignable. Le total suit la même règle et devient `None` dès qu'un de ses trois postes manque,
plutôt que de sous-compter en silence — un total amputé serait exactement le « chiffre faux le
jour où il compte » que le §1 refuse.
"""

from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.capsules import storage


def _taille_repertoire(base: Path) -> int:
    """La somme des fichiers sous `base`. Répertoire absent ⇒ **0**, jamais une erreur.

    Le cas n'est pas théorique : sur un déploiement neuf, aucun média n'a encore été produit et
    `audio_storage_dir` n'existe pas. Le panneau doit rendre 0, pas tomber.
    """
    total = 0
    for chemin in base.rglob("*"):
        try:
            if chemin.is_file():
                total += chemin.stat().st_size
        except OSError:
            # Lien cassé, fichier disparu entre le parcours et le `stat` : il ne compte pas.
            # Une mesure d'état ne tombe pas pour un fichier volatil.
            continue
    return total


def _medias() -> int | None:
    """Ce que ZETIS a fabriqué pour Massimo — l'audio ET la vidéo, en UN seul nombre.

    🔴 **L'audio n'est JAMAIS dans MinIO, et c'est le point que le cadrage avait manqué.**
    `settings.storage_backend` ne gouverne que le **MP4 rendu** (`capsules/storage.py`) ; les
    pistes voix restent sur le disque quel que soit le backend. Interroger « le backend actif et
    lui seul » tairait donc 100 % de l'audio dès qu'on passe à MinIO — soit, aujourd'hui, la
    quasi-totalité du poste.

    ⚠️ **Et sous `disk`, on n'additionne rien** : le MP4 vit DANS le répertoire audio
    (`_capsule_dir/video.mp4`), la marche l'a déjà compté. L'ajouter une seconde fois doublerait
    chaque vidéo.

    🔴 **Le backend INACTIF n'est jamais interrogé** (§3), et ce n'est pas une économie : un
    contrôle qui devinait le backend a produit un « 0 fichier » alarmant sur des données intactes
    le 2026-08-18. Un panneau qui afficherait « disque : 47 Mo · MinIO : 0 Mo » referait la
    même peur.
    """
    total = _taille_repertoire(Path(settings.audio_storage_dir))
    if settings.storage_backend != "minio":
        return total
    videos = storage.taille_videos()
    return None if videos is None else total + videos


def _base(db: Session) -> int | None:
    """La taille LOGIQUE de la base courante — `pg_database_size`, jamais `du` sur le volume.

    Le volume `zetis_postgres_data` porte en plus les WAL et l'espace non rendu : 90,4 Mo là où
    la base en pèse 12 (mesuré le 2026-08-22). Deux nombres pour une chose, dont un que Papa ne
    peut pas interpréter — le §Alternatives a tranché pour le second.

    ⚠️ **`None` quand le moteur ne sait pas répondre**, et le cas est quotidien : toute la suite
    de tests tourne sur SQLite in-memory (`conftest.py`), où cette fonction n'existe pas. Le
    `rollback` n'est pas décoratif — sous Postgres, une erreur avorte la transaction, et la
    session rendrait une erreur à tout ce qui la réutilise ensuite.
    """
    try:
        return int(db.execute(text("SELECT pg_database_size(current_database())")).scalar_one())
    except Exception:  # noqa: BLE001 — un état ne tombe pas ; il dit « je ne sais pas »
        db.rollback()
        return None


def _modeles() -> int:
    """Les modèles de voix — **hors total**, mais à l'écran (§2).

    Le seul chemin de modèle que la configuration connaisse est `piper_voice_model`, un FICHIER :
    son répertoire est la mesure. Écrire `storage/models` ici serait le chemin en dur que le §4
    interdit. (Whisper vit dans le cache Hugging Face, Ollama hors dépôt : ni l'un ni l'autre
    n'est nommé par l'ADR.)
    """
    return _taille_repertoire(Path(settings.piper_voice_model).parent)


def mesurer(db: Session, archives: list[dict]) -> dict:
    """Les quatre postes du §2, plus les modèles à part.

    ⚠️ **Le total des archives se SOMME sur la liste déjà construite** — il ne se recalcule pas.
    `etat_donnees` a déjà parcouru la cible et posé un `stat` par archive ; un second `glob` ici
    rendrait deux vérités pour un même dossier, et elles divergeraient le jour où l'une des deux
    filtre un nom que l'autre garde.

    🔴 **Les modèles ne sont JAMAIS dans le total** (§2). Ils dominent — 194 Mo contre quelques
    dizaines pour tout le reste — et ils sont **régénérables** : la sauvegarde les exclut déjà
    nommément. Les compter ferait croire que ZETIS grossit alors que c'est un téléchargement
    figé. Les taire, à l'inverse, ferait de ces 194 Mo un mystère : ils s'affichent, en note.
    """
    medias = _medias()
    base = _base(db)
    total_archives = sum(a["taille"] for a in archives)

    postes = (medias, base, total_archives)
    return {
        "medias": medias,
        "base": base,
        "archives": total_archives,
        "total": None if any(p is None for p in postes) else sum(postes),
        "modeles": _modeles(),
    }
