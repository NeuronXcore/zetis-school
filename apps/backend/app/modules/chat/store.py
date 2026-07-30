"""Store de session de chat — le verbatim de M1, ÉPHÉMÈRE PAR CONSTRUCTION (ADR-0026 §1).

Les messages d'une session vivent UNIQUEMENT ici, dans Redis : jamais PostgreSQL, jamais MinIO,
jamais un fichier. Ce n'est pas une politique de confidentialité, c'est une impossibilité
structurelle — Redis est hors sauvegarde et hors transfert de bâton (ARCHITECTURE §Redis prévoit
explicitement « sessions temporaires » et « anti-spam chat »). Le pipeline IA n'écrit jamais de
message dans une couche durable (§1c) : le service lit/écrit ICI, et ne trace dans `ai_jobs` que
des métadonnées.

Deux implémentations derrière le même contrat :

- `RedisChatStore` — production. Clé `chat:{student_id}:{session_id}`, TTL GLISSANT rafraîchi à
  chaque tour, purge explicite à la clôture.
- `InMemoryChatStore` — tests (aucun Redis en CI). Même contrat ; expose `last_ttl_seconds` pour
  prouver que le TTL est bien posé.

`get_chat_store` est la dépendance FastAPI, surchargée en test par un `InMemoryChatStore` partagé.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass

from app.core.config import settings

ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"


@dataclass
class ChatTurn:
    role: str  # user | assistant
    text: str


class ChatStore:
    """Logique commune (id de session, sérialisation, comptage) ; les primitives de stockage
    (`_read_raw`/`_write_raw`/`_delete_raw`/`_exists_raw`) sont fournies par les sous-classes.

    `_write_raw` DOIT (re)poser le TTL à chaque écriture — le TTL est glissant : tant que la
    session est active, elle ne s'éteint pas ; dès qu'elle se tait, elle expire seule."""

    def __init__(self, ttl_minutes: int) -> None:
        self.ttl_seconds = max(1, ttl_minutes) * 60

    # --- Primitives à implémenter -------------------------------------------------------------
    def _read_raw(self, key: str) -> str | None:
        raise NotImplementedError

    def _write_raw(self, key: str, value: str) -> None:
        raise NotImplementedError

    def _delete_raw(self, key: str) -> None:
        raise NotImplementedError

    def _exists_raw(self, key: str) -> bool:
        raise NotImplementedError

    # --- Contrat public -----------------------------------------------------------------------
    @staticmethod
    def _key(student_id: int, session_id: str) -> str:
        return f"chat:{student_id}:{session_id}"

    def create_session(self, student_id: int) -> str:
        """Ouvre une session vide et pose le TTL. Renvoie l'identifiant opaque."""
        session_id = uuid.uuid4().hex
        self._write_raw(self._key(student_id, session_id), json.dumps([]))
        return session_id

    def exists(self, student_id: int, session_id: str) -> bool:
        return self._exists_raw(self._key(student_id, session_id))

    def read_turns(self, student_id: int, session_id: str) -> list[ChatTurn]:
        raw = self._read_raw(self._key(student_id, session_id))
        if raw is None:
            return []
        return [ChatTurn(role=str(t["role"]), text=str(t["text"])) for t in json.loads(raw)]

    def append_turn(self, student_id: int, session_id: str, *, role: str, text: str) -> None:
        """Ajoute un tour et RAFRAÎCHIT le TTL (mémoire glissante)."""
        turns = self.read_turns(student_id, session_id)
        turns.append(ChatTurn(role=role, text=text))
        self._write_raw(self._key(student_id, session_id), json.dumps([asdict(t) for t in turns]))

    def close_session(self, student_id: int, session_id: str) -> None:
        """Purge EXPLICITE à la clôture — le verbatim disparaît immédiatement, sans attendre le TTL."""
        self._delete_raw(self._key(student_id, session_id))

    def user_turn_count(self, student_id: int, session_id: str) -> int:
        """Nombre de messages de Massimo (base de l'anti-spam §Points ouverts 3)."""
        return sum(1 for t in self.read_turns(student_id, session_id) if t.role == ROLE_USER)


class InMemoryChatStore(ChatStore):
    """Store de test : dict en mémoire. `last_ttl_seconds` prouve que le TTL est posé."""

    def __init__(self, ttl_minutes: int | None = None) -> None:
        super().__init__(ttl_minutes or settings.chat_session_ttl_minutes)
        self._data: dict[str, str] = {}
        self.last_ttl_seconds: int | None = None

    def _read_raw(self, key: str) -> str | None:
        return self._data.get(key)

    def _write_raw(self, key: str, value: str) -> None:
        self._data[key] = value
        self.last_ttl_seconds = self.ttl_seconds  # TTL « posé » à chaque écriture (glissant)

    def _delete_raw(self, key: str) -> None:
        self._data.pop(key, None)

    def _exists_raw(self, key: str) -> bool:
        return key in self._data


class RedisChatStore(ChatStore):
    """Store de production sur Redis. La construction ne se connecte pas (Redis.from_url est
    paresseux) ; seules les commandes touchent le serveur — d'où la surcharge en test."""

    def __init__(self, url: str, ttl_minutes: int) -> None:
        super().__init__(ttl_minutes)
        from redis import Redis  # import local : le backend ne dépend de redis qu'ici et dans RQ.

        self._r = Redis.from_url(url, decode_responses=True)

    def _read_raw(self, key: str) -> str | None:
        return self._r.get(key)

    def _write_raw(self, key: str, value: str) -> None:
        # `ex` (re)pose le TTL à chaque écriture : glissant par construction.
        self._r.set(key, value, ex=self.ttl_seconds)

    def _delete_raw(self, key: str) -> None:
        self._r.delete(key)

    def _exists_raw(self, key: str) -> bool:
        return bool(self._r.exists(key))


_store: RedisChatStore | None = None


def get_chat_store() -> ChatStore:
    """Dépendance FastAPI : le store de chat (Redis en production, singleton paresseux).

    Surchargée en test par un `InMemoryChatStore` partagé — jamais de Redis en CI."""
    global _store
    if _store is None:
        _store = RedisChatStore(settings.redis_url, settings.chat_session_ttl_minutes)
    return _store
