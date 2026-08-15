"""Schémas d'entrée/sortie du chat (ADR-0026, slice A).

Aucun schéma ne transporte de verbatim vers une couche durable : ce sont des DTO de requête HTTP.
La réponse d'un tour porte le texte que ZETIS vient de dire — il vit dans Redis, pas en base.
"""

from typing import Literal

from pydantic import BaseModel, Field


class ChatSessionOut(BaseModel):
    """Ouverture de session. `transparency` = la phrase FIXE de l'asymétrie (§5), affichée par
    l'UI (slice B) : Massimo sait ce qui est retenu. `announcement` = la réponse aux demandes qu'il
    avait formulées, quand il y en a une (addendum ADR-0026)."""

    session_id: str
    transparency: str
    announcement: "ChatAnnouncement | None" = None


class ChatToolResponse(BaseModel):
    """Réponse de Massimo à une proposition d'outil — un ACTE, tracé tel quel (§2).

    `skill_id` : la notion que portait la carte tapée, **renvoyée telle que le serveur l'avait
    émise** (`ChatAction.skill_id`). Elle n'est PAS crue sur parole — le serveur la revalide
    (`is_notion_visible`) avant de l'écrire au journal, et elle ne remplace jamais une notion
    résolue dans le même tour : elle ne se substitue qu'au repli sur le dernier `chat_topic`.
    """

    tool_type: str
    accepted: bool
    skill_id: int | None = None


class ChatMessageIn(BaseModel):
    """Un tour. Soit un message texte, soit une réponse à une proposition d'outil (ou les deux :
    Massimo peut accepter une fiche ET continuer à parler)."""

    text: str | None = Field(default=None, max_length=4000)
    tool_response: ChatToolResponse | None = None


class ChatSpeechIn(BaseModel):
    """Texte à synthétiser en voix (Lot 2). C'est la réponse de ZETIS (jamais un propos de
    Massimo) — pas une donnée privée. L'audio est produit à la volée et JAMAIS persisté."""

    text: str = Field(min_length=1, max_length=2000)


class ChatMenuItem(BaseModel):
    """Une entrée du menu d'une notion : un contenu DISPONIBLE + sa route ancrée."""

    kind: str  # cours|eli5|fiche|mindmap|revision
    route: str
    label: str


class ChatAction(BaseModel):
    """Action d'orchestration (ADR-0027) — **ancrée serveur, jamais hallucinée**.

    `navigate` : une destination construite serveur depuis un id VALIDÉ (`route` = chemin d'app,
    ex. `/eli5?skill_id=3`). `show_data` : le **front** récupère l'endpoint existant et rend une
    carte inline (`data ∈ agenda|reviews|missions`) — le backend reste aveugle au contenu (§1c).
    `notion_menu` : la LISTE de ce qui existe pour une notion (`items`), quand Massimo la nomme sans
    préciser d'outil — chaque entrée est une route ancrée. `request_notion` : la notion N'EST PAS au
    programme (résolution échouée) → carte OPT-IN « Demander à Papa d'ajouter « X » » ; le tap crée
    un `notion_request` (précédent ELI5). `text` porte la notion à demander."""

    kind: Literal["navigate", "show_data", "notion_menu", "request_notion"]
    label: str
    route: str | None = None
    # Notion que porte l'action, quand elle en porte une. Sert UNIQUEMENT à ancrer la trace
    # `chat_tool_response` du tap : sans elle, un tap qui est le PREMIER acte d'une session (le cas
    # d'une annonce d'ouverture) retombait sur le dernier `chat_topic` de l'élève — parfois vieux
    # de plusieurs jours, donc attribué à la mauvaise notion.
    skill_id: int | None = None
    data: str | None = None
    name: str | None = None  # notion_menu : nom de la notion
    items: list[ChatMenuItem] | None = None  # notion_menu : contenus disponibles
    text: str | None = None  # request_notion : la notion hors-programme à proposer à Papa
    # `confirm=True` : offre IMPLICITE (ZETIS propose parce que Massimo a nommé une notion) →
    # toujours une carte à taper, même à la voix. `confirm=False` : demande EXPLICITE
    # (« montre/ouvre ») → auto-navigation autorisée à la voix. (ADR-0027, correctif 2026-07-30.)
    confirm: bool = False


class ChatMessageOut(BaseModel):
    """Réponse d'un tour. `skill_id` = notion ancrée (None si non résolue — best-effort §6).
    `tool_suggestion` = outil proposé par ZETIS (vide si aucun). `action` = orchestration ancrée
    (navigate/show_data) ou None (ADR-0027)."""

    session_id: str
    turn_index: int
    reply: str
    skill_id: int | None = None
    tool_suggestion: str | None = None
    difficulty_declared: bool = False
    action: ChatAction | None = None
    #: Sur quoi la réponse s'appuie (`adr-0059` §7). `None` quand le tour n'était pas une question
    #: de fond — la puce de source ne s'affiche alors pas du tout. Référence différée (le schéma
    #: est défini plus bas, avec les autres objets d'orchestration) et résolue en fin de fichier,
    #: exactement comme `ChatSessionOut` → `ChatAnnouncement`.
    grounding: "ChatGrounding | None" = None
    #: Interrogation orale en cours (`adr-0059` §10), ou `None`.
    recall: "ChatRecall | None" = None


class ChatAnnouncement(BaseModel):
    """Réponse aux demandes de Massimo, portée par le contexte d'ouverture (addendum ADR-0026).

    `text` est composé SERVEUR, en Python, déterministe — jamais par le LLM (§4 : deux voix de
    ZETIS sur le même état, dont une hallucinée, détruiraient la confiance). Il ne nomme aucun
    auteur : le contenu scolaire atteint Massimo dans la voix de ZETIS.

    `actions` : uniquement des `navigate` ancrées par `_notion_route`, `confirm=True` (une offre,
    jamais un ordre). Peut être VIDE — une notion tout juste ajoutée au programme s'annonce même
    quand son contenu n'existe pas encore.
    """

    text: str
    actions: list[ChatAction] = []


class ChatRecall(BaseModel):
    """Où en est l'interrogation orale (`adr-0059` §10). `None` = aucune en cours.

    ⚠️ **Un repère de progression, jamais un score.** `asked` / `total` dit « question 2 sur 3 » ;
    il n'y a ni compteur d'erreurs, ni pourcentage, ni bilan — les règles de gamification du
    projet interdisent le décompte anxiogène, et un enfant qui voit « 1/2 » arrête de répondre
    pour protéger son chiffre.
    """

    asked: int
    total: int
    skill_name: str
    #: `True` sur le dernier tour : l'interrogation est close, l'état a été effacé côté serveur.
    finished: bool = False


class ChatGrounding(BaseModel):
    """Sur quoi la réponse de ZETIS s'appuie — **calculé SERVEUR** (`adr-0059` §7).

    Le moteur déclare sa source dans `answer.used_source` ; cette déclaration n'est jamais
    recopiée ici. Le serveur sait ce qu'il a injecté (une leçon ? des extraits ? rien ?) et c'est
    lui qui tranche — patron d'`eli5/service.py`, qui dérive `lesson_id`/`sources_used` de `ctx`
    et jamais de la sortie du modèle.

    `kind` :
    - `cours` — la réponse s'appuie sur le cours canonique validé de la notion ;
    - `extraits` — sur des passages du RAG au-dessus du plancher de pertinence ;
    - `aucune` — **rien n'ancrait la question**. ZETIS le dit et le note pour Papa ; il ne
      répond pas de mémoire.
    """

    kind: str  # cours|extraits|aucune
    #: Titre de la leçon quand `kind == "cours"` — c'est ce que la puce affiche à Massimo
    #: (« 📖 D'après ta leçon « … » »). ⚠️ **§16 : c'est une DONNÉE, pas du code.** Un titre saisi
    #: par l'adulte pourrait contenir le mot « papa » ; on ne censure pas ses données, mais
    #: l'angle mort est nommé ici plutôt que découvert à l'écran.
    lesson_title: str | None = None
    #: Nombre de passages RAG réellement injectés (0 quand `kind != "extraits"`).
    sources_used: int = 0


class ChatTranscribeOut(BaseModel):
    """Ce que rend la dictée du chat (`adr-0059` §18).

    `transcript` est **rendu, jamais écrit** : il traverse la réponse HTTP et n'entre dans aucune
    table. `duration_seconds` est la durée de l'AUDIO — pas le temps de transcription, qui vit
    dans `ai_jobs.duration_ms` et n'a aucune raison d'être servi à l'enfant.
    """

    transcript: str
    duration_seconds: float


# `ChatSessionOut` référence `ChatAnnouncement` avant sa définition (l'ouverture de session est le
# premier schéma du fichier, la carte d'action le dernier) : la référence différée se résout ici.
# Idem pour `ChatMessageOut` → `ChatGrounding` depuis l'`adr-0059` §7.
ChatSessionOut.model_rebuild()
ChatMessageOut.model_rebuild()
