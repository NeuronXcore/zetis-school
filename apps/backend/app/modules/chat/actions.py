"""Résolveur d'action d'orchestration (ADR-0027) — le LLM PROPOSE, le serveur ANCRE.

Un intent brut du moteur (`{kind, notion_query?, subject_query?, tool?, data?}`) devient une
`ChatAction` **construite depuis un id validé**, ou rien. Jamais de route hallucinée : la seule
source de destinations réelles est `galaxy.notion_panel` (le pont notion → matière + contenus
`available`, ADR-0024) et les slugs de matière de l'année active. Transpose le patron
`reports._anchor()` : ce que le LLM invente qui n'est pas ancrable est jeté.

Garde-fous (ADR-0027) : orienter vers l'EXISTANT VALIDÉ uniquement (router seulement vers un
contenu `available`) ; contenu absent → **honnêteté** (+ demande à Papa, décision figée dont le
MÉCANISME est différé — Point ouvert n°4, non implémenté ici) ; cibles `location.state` (quiz par
notion, mission précise) hors v1 → pas d'action.
"""

from dataclasses import dataclass, field
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Subject
from app.modules.ai.provider import EmbeddingProvider
from app.modules.ai.skill_resolution import resolve_skill
from app.modules.chat.schemas import ChatAction, ChatMenuItem
from app.modules.galaxy.service import notion_panel

DATA_KINDS = ("agenda", "reviews", "missions")
# 🔴 **Cette liste EST la panoplie, et rien d'autre** : les sept `GalaxyActionKind` que
# `resolve_panoply` sait servir. `quiz` et `capsule` y sont entrés avec l'`adr-0059` §A1, une
# fois leurs adresses créées (`?quiz=`, `?capsule=`) — auparavant la session de quiz ne
# transitait que par `location.state` et la capsule n'avait aucune adresse du tout.
NOTION_TOOLS = ("eli5", "cours", "fiche", "mindmap", "revision", "quiz", "capsule")
# Outils qui ont une route de MATIÈRE. ⚠️ `capsule` n'y est pas — `/capsules` est une liste
# globale, il n'existe pas de page capsules par matière (même raison que le `null` de
# `subjectRouteFor`). `eli5` non plus : il ne s'adresse que par notion.
# ⚠️ `galaxy` n'est PAS dans `NOTION_TOOLS` : ce n'est pas une activité de la panoplie (aucun
# `resolve_panoply` ne la sert), c'est une vue d'ensemble de matière. Elle n'existe donc qu'ici.
SUBJECT_TOOLS = ("cours", "fiche", "mindmap", "revision", "quiz", "galaxy")
# Contenus DURABLES d'une notion (≠ ELI5, génératif à la volée et toujours offert). Leur absence
# totale = « notion vide » → on réclame le cours à Papa (addendum ADR-0027, déclencheur b).
DURABLE_NOTION_TOOLS = ("cours", "fiche", "mindmap", "revision")

# Outil demandé → type de contenu à réclamer à Papa (addendum ADR-0027).
#
# `eli5` se dérive du cours canonique : pas d'ELI5 ⇒ pas de cours validé ⇒ la vraie demande est le
# cours. `revision` = carte SRS. Aligné sur `content_requests.service.CONTENT_KINDS`.
#
# 🔴 **TOTALE depuis l'`adr-0059` §16, et le repli `.get(tool, "cours")` est RÉVOQUÉ.** « Je n'ai
# pas de quiz sur X — je le note » enregistrait une demande de **cours**. Papa lisait une
# traduction là où il devait lire une demande. La page matière, elle, émettait déjà `quiz` et
# `capsule` sans repli (`REQUESTABLE_KIND` dans `notionRoutes.ts`) : **le chat était le seul
# menteur du dépôt**, et cette table en est désormais le miroir exact — sept outils, six types.
_TOOL_TO_CONTENT_KIND = {
    "eli5": "cours",
    "cours": "cours",
    "fiche": "fiche",
    "mindmap": "mindmap",
    "revision": "card",
    "quiz": "quiz",
    "capsule": "capsule",
    # L'atelier ne se demande pas : c'est Massimo qui écrit. Ce qui lui manque, c'est le COURS
    # à résumer — et c'est cela qu'on réclame à Papa.
    "atelier": "cours",
}

_TOOL_WORD = {
    "eli5": "explication",
    "cours": "cours",
    "fiche": "fiche",
    "mindmap": "carte",
    "revision": "révision",
    "quiz": "quiz",
    "atelier": "cours à résumer",
    # ⚠️ `capsule` doit y être : `_open_subject` fait `_TOOL_WORD[tool]` **sans `.get`**, et un
    # outil de `SUBJECT_TOOLS` absent d'ici lèverait un `KeyError` en plein tour de chat.
    "capsule": "capsule",
    "galaxy": "galaxie",
}
_DATA_LABEL = {
    "agenda": "Ouvrir ton agenda",
    "reviews": "Voir tes révisions",
    "missions": "Voir tes missions",
}

# 🔴 **Les INDEX — « montre-moi TOUTES mes fiches »** (`adr-0059`, complément du 2026-08-15).
#
# Le chat savait viser une notion, un chapitre, une matière… et pas la page qui les rassemble.
# « Montre-moi mes fiches » sans autre précision n'avait aucune réponse : le moteur devinait une
# matière, ou renonçait. Or c'est la demande la plus simple qu'un enfant puisse formuler.
#
# ⚠️ **Ce sont des pages, pas des activités** : aucun id, aucun gate de disponibilité — un index
# vide s'affiche vide, et c'est une réponse juste (« tu n'as pas encore de cartes »). Ils ne
# passent donc pas par `resolve_panoply`, contrairement à tout le reste de ce module.
#
# ⚠️ `/diagnostic` en est ABSENT, et ce n'est pas un oubli : l'`adr-0027` §3 l'écarte du routage
# — *« jamais routé de façon anxiogène »* (`navigation.md` §9). Une décision, pas un manque.
_INDEX_ROUTES = {
    "matieres": ("/matieres", "Toutes tes matières"),
    "fiches": ("/fiches", "Toutes tes fiches"),
    "mindmaps": ("/mindmaps", "Toutes tes cartes"),
    "quiz": ("/quiz", "Tous tes quiz"),
    "capsules": ("/capsules", "Toutes tes capsules"),
    "revision": ("/revision", "Tes révisions"),
    "missions": ("/missions", "Tes missions"),
    "agenda": ("/agenda", "Ton agenda"),
    "galaxy": ("/galaxy", "Ta galaxie"),
}


def _a_du_durable(actions: dict) -> bool:
    """Cette notion porte-t-elle au moins un contenu DURABLE (cours/fiche/carte/révision) ?

    ELI5 ne compte pas : il se génère à la volée et n'est jamais la preuve que quelque chose
    existe. C'est le prédicat du déclencheur « notion vide », partagé par les deux chemins qui en
    ont besoin plutôt que redérivé dans chacun.
    """
    return any(actions.get(k, {}).get("available") for k in DURABLE_NOTION_TOOLS)


@dataclass
class ActionResult:
    """Résultat de la résolution. `action` = destination ancrée (ou None). `note` = phrase honnête
    à ajouter au `reply` quand rien n'est ancrable (§3). `meta` = métadonnées de trace (ai_jobs),
    JAMAIS de texte de message."""

    action: ChatAction | None = None
    note: str | None = None
    meta: dict = field(default_factory=dict)


def _matiere_exacte(db: Session, query: str) -> tuple[str, str] | None:
    """La requête EST-ELLE le nom (ou le slug) d'une matière ? Correspondance stricte.

    Distinct de `_resolve_subject`, qui accepte aussi les radicaux et les inclusions (« maths »,
    « fiches de français »). Ici on ne veut aucune approximation, parce que le résultat sert à
    TRANCHER contre une résolution de notion.
    """
    q = (query or "").strip().casefold()
    if not q:
        return None
    for s in db.scalars(select(Subject)).all():
        if s.slug.casefold() == q or s.name.casefold() == q:
            return (s.slug, s.name)
    return None


def _resolve_chapitre(db: Session, query: str, *, exact: bool = False) -> dict | None:
    """La requête nomme-t-elle un CHAPITRE visible ? (correctif live 2026-08-15)

    Constaté au micro : « fais-moi réviser l'orthographe » proposait **« Ajouter orthographe à mon
    programme »**. Or « Orthographe » n'est ni une matière ni une notion — c'est un **chapitre** de
    Français, déjà au programme et validé. Le chat ne connaissait que les deux extrémités de la
    hiérarchie (matière et notion) et ratait tout l'étage du milieu, qui est pourtant celui dont un
    enfant parle le plus naturellement.

    ⚠️ **On emprunte `_visible_notions`, on ne rejoue pas la chaîne de visibilité.** Elle porte
    déjà l'année active, le chapitre validé et la leçon validée — trois conditions qu'une seconde
    requête finirait par appliquer différemment. Même discipline que le gate de `resolve_panoply` :
    un chapitre n'est atteignable que s'il a au moins une notion visible.

    Correspondance EXACTE sur le nom, puis inclusion (« l'orthographe » contient « orthographe »).
    Rien de flou : le résultat sert à trancher contre une résolution de notion par embeddings.
    """
    from app.modules.galaxy.service import _visible_notions

    q = (query or "").strip().casefold()
    if not q:
        return None
    try:
        notions = _visible_notions(db)
    except HTTPException:
        # ⚠️ **Un résolveur ne fait JAMAIS échouer une conversation.** `_visible_notions` lève un
        # 404 quand aucune année scolaire n'est active — un état parfaitement normal (avant la
        # rentrée, sur une base neuve). Sans cette garde, une simple question dans le chat
        # renvoyait une erreur au lieu d'une réponse. Attrapé par la suite le 2026-08-15, sur un
        # test qui ne parlait pas de chapitres.
        return None
    vues: dict[str, dict] = {}
    for notion in notions:
        nom = (notion.get("chapter_title") or "").strip()
        if nom and nom.casefold() not in vues:
            vues[nom.casefold()] = {
                "chapter_id": notion.get("chapter_id"),
                "name": nom,
                "subject_slug": notion.get("subject_slug"),
                "subject_name": notion.get("subject_name"),
            }
    if q in vues:
        return vues[q]
    if exact:
        return None
    # 🔴 **Correspondance par INCLUSION — réservée au cas où aucune notion n'a résolu.**
    # « l'orthographe », « le chapitre orthographe » : le nom du chapitre est contenu dans la
    # requête. Mais « Nombres relatifs » contient aussi « Nombres », qui est un chapitre — appliquer
    # cette branche avant la notion détournerait une notion vers son propre chapitre, et Massimo
    # obtiendrait le dossier au lieu de la fiche qu'il demandait. D'où les deux modes.
    candidats = [v for nom, v in vues.items() if nom in q]
    return max(candidats, key=lambda c: len(c["name"])) if candidats else None


def _resolve_subject(db: Session, query: str) -> tuple[str, str] | None:
    """Nom/slug libre → (slug, nom) d'une matière, ou None. Correspondance exacte puis par radical
    (les 4 premières lettres : « maths » → « Mathématiques »)."""
    q = (query or "").strip().casefold()
    if not q:
        return None
    subjects = db.scalars(select(Subject)).all()
    for s in subjects:
        if s.slug.casefold() == q or s.name.casefold() == q:
            return (s.slug, s.name)
    stem = q[:4]
    for s in subjects:
        name = s.name.casefold()
        if stem and (name.startswith(stem) or q.startswith(name[:4]) or q in name or name in q):
            return (s.slug, s.name)
    return None


def _notion_route(
    tool: str, *, skill_id: int, name: str, slug: str, subject_name: str, action: dict
) -> tuple[str | None, str]:
    """Route ANCRÉE la plus ciblée pour (notion, outil), ou `(None, "")` si rien n'est routable.

    ## Trois règles, et elles se lisent dans cet ordre (ADR-0059 §A2)

    1. **Un id présent ⇒ la route CIBLÉE** — la fiche, le cours, le quiz, la capsule, la carte.
    2. **Pas d'id ⇒ la route de MATIÈRE**, quand elle existe. Ce n'est pas un repli honteux :
       c'est la réponse juste quand la demande elle-même est de niveau matière (« revoir les
       mindmaps de maths »), et `_open_subject` appelle précisément avec `action={}` pour
       l'obtenir.
    3. **Ni l'un ni l'autre ⇒ rien.** Une porte qu'on ouvre sur du vide est pire que pas de porte.

    Jusqu'au 2026-08-15, cette fonction recevait `fiche_id` et `lesson_id` de `notion_panel`…
    et rendait `/fiches/{slug}` : les douze fiches de Maths au lieu de celle sur les fractions.
    Les adresses existaient pourtant — `?fiche=` (`adr-0054` §1), `?carte=` (`adr-0057`),
    `?lesson=` (addendum `adr-0025` §15) — et **aucune** des deux tables de routes du dépôt ne
    les consommait. Le défaut est mot pour mot celui de l'`adr-0058`, sur une autre surface.

    ⚠️ **Le chat n'émet JAMAIS `&from=`.** Ce paramètre veut dire « reviens à `/subjects/<slug>` ».
    Depuis le chat, Massimo vient de `/chat` : un rétrolien vers une matière le dépayserait au
    lieu de le ramener. C'est la seule différence assumée avec `notionRoutes.ts` côté front, et
    le contrat de parité la traite comme une **décoration**, pas comme un écart.

    ⚠️ **`skill_id`, `name` et `action` peuvent être vides** — `_open_subject` appelle avec
    `skill_id=0, name="", action={}`. Chaque branche lit donc les ids avec `.get`, jamais par
    indexation : c'est ce qui fait tomber la règle 2 toute seule, sans branche dédiée.
    """
    if tool == "eli5":
        # Seule surface adressable par NOTION de longue date, et sans repli matière : `/eli5` ne
        # sait rien faire d'une matière seule.
        if not skill_id:
            return None, ""
        return f"/eli5?skill_id={skill_id}&name={quote(name)}", f"T'expliquer {name}"

    if tool == "cours":
        lesson_id = action.get("lesson_id")
        if lesson_id:
            # ⚠️ `?lesson=` **cadre et déplie**, il n'ouvre pas le volet de lecture — le
            # comportement est partagé avec l'agenda (`agendaCourseRoute`), et le changer ici
            # changerait une surface tierce. « Voici ton cours, dans son chapitre » EST la
            # ressource exacte ; écart nommé dans l'ADR pour qu'on ne le relise pas comme un bug.
            return f"/subjects/{slug}/cours?lesson={lesson_id}", f"Ton cours sur {name}"
        return f"/subjects/{slug}/cours", f"Ton cours de {subject_name}"

    if tool == "fiche":
        fiche_id = action.get("fiche_id")
        if fiche_id:
            return f"/fiches/{slug}?fiche={fiche_id}", f"Ta fiche sur {name}"
        return f"/fiches/{slug}", f"Tes fiches de {subject_name}"

    if tool == "mindmap":
        mindmap_id = action.get("mindmap_id")
        if mindmap_id:  # carte précise → reconstruction ciblée par id
            return f"/mindmaps/reconstruire/{mindmap_id}", f"Ta carte sur {name}"
        return f"/mindmaps/{slug}", f"Tes cartes de {subject_name}"

    if tool == "quiz":
        quiz_id = action.get("quiz_id")
        if quiz_id:
            return f"/quiz?quiz={quiz_id}", f"Ton quiz sur {name}"
        return f"/quiz?subject={slug}", f"Tes quiz de {subject_name}"

    if tool == "atelier":
        # 🔴 **« Je veux faire MA fiche »** (complément du 2026-08-15). L'atelier de fiche existe
        # depuis l'addendum `adr-0015` et son adresse aussi — `/fiches/<slug>/<lessonId>/atelier`,
        # une PAGE et non une quatrième vue (addendum §12). Le chat n'y menait pas.
        #
        # ⚠️ Il s'adresse par **leçon**, pas par fiche : c'est le cours qu'on résume. Sans leçon
        # rattachée, il n'y a rien à résumer — on ne route pas, et la branche « contenu absent »
        # réclamera le cours à Papa.
        #
        # ⚠️ **Ce n'est PAS une activité de la panoplie** : `resolve_panoply` ne le sert pas (il
        # n'a pas à être « disponible » — Massimo peut toujours écrire la sienne dès qu'un cours
        # existe). D'où son absence de `NOTION_TOOLS`, et le fait qu'il ne passe jamais par le
        # menu de notion.
        lesson_id = action.get("lesson_id")
        if lesson_id:
            return f"/fiches/{slug}/{lesson_id}/atelier", f"Écrire ta fiche sur {name}"
        return None, ""

    if tool == "capsule":
        capsule_id = action.get("capsule_id")
        if capsule_id:
            return f"/capsules?capsule={capsule_id}", f"Ta capsule sur {name}"
        # ⚠️ **Aucun repli matière**, et ce n'est pas un oubli : `/capsules` est une liste
        # GLOBALE, il n'existe pas de page capsules par matière. `subjectRouteFor` rend `null`
        # pour la même raison — y envoyer Massimo depuis « les capsules de maths » serait une
        # petite trahison.
        return None, ""

    if tool == "revision":
        # 🔴 **Aucune route par notion, et ce n'est pas un manque** : le grain le plus fin du SRS
        # est le CHAPITRE (`adr-0049`), et `resolve_panoply` ne sert donc aucun id ici. Six
        # activités sont adressables par id, pas sept.
        return f"/revision?subject={slug}", f"Réviser {subject_name}"

    if tool == "galaxy":
        # 🔴 **Câblée le 2026-08-15**, après un essai au micro : « montre-moi ma galaxie d'histoire
        # géo » ouvrait les FICHES d'histoire-géo. Le moteur n'avait pas d'outil pour la galaxie et
        # rabattait sur le plus proche — une réponse plausible et fausse, la pire espèce.
        #
        # La route était **déjà écrite** dans l'ADR-0027 (note du 2026-07-31) : *« "progression"
        # n'a jamais été câblée ; si elle l'est, la route est `/galaxy?subject=<slug>` »*
        # (`/progression` n'étant plus qu'une redirection depuis l'addendum ADR-0024 §A). On ne
        # l'invente pas, on l'applique.
        #
        # ⚠️ Aucune route par NOTION : la galaxie est une vue d'ensemble. `resolve_panoply` ne sert
        # d'ailleurs aucun id pour elle — ce n'est pas une activité de la panoplie.
        return f"/galaxy?subject={slug}", f"Ta galaxie de {subject_name}"

    if not tool:
        # La matière nue, demandée sans outil. Fabriquée ICI et non plus dans `_open_subject` :
        # l'invariant « une seule fabrique de destinations » était faux en lettre, et le
        # test-verrou n°8 ne balayait qu'`announce.py`.
        return f"/subjects/{slug}", f"Ouvrir {subject_name}"

    return None, ""  # outil inconnu (hallucination du moteur) : rien, jamais une route inventée


# 🔴 **`_MENU_LABEL` a été SUPPRIMÉE le 2026-08-15** (`adr-0059` §A2), et le motif mérite d'être
# gardé ici : elle listait des libellés d'entrées de menu que **plus personne ne rendait**.
# `ChatPage` fait `ACTION_UI[item.kind] ?? item.label` — le libellé serveur était systématiquement
# écrasé. Elle avait donc divergé sans que quiconque le voie : elle disait encore
# « 🧠 Reconstruire la carte » quand `notionActionUi.ts` était passé à « Reconstruire la mindmap »
# le 2026-08-12, avec un test-verrou contre la collision du mot « carte ». La correction du 12
# n'avait jamais atteint le chat — et n'avait pas besoin de l'atteindre.
#
# **Une table de libellés que le seul renderer ignore n'est pas une source, c'est un piège à
# divergence.** `ACTION_UI` fait foi ; `ChatMenuItem.label` reste au contrat et porte désormais le
# `kind`, comme étiquette technique de repli pour un futur consommateur non-React.


def _notion_menu(db: Session, skill_id: int) -> ActionResult:
    """Q1 : la LISTE de ce qui EXISTE pour une notion (quand Massimo la nomme sans préciser d'outil).

    Construit depuis `notion_panel(skill_id).actions` filtrées `available`, chaque entrée via
    `_notion_route` (SEULE source de routes). 1 seul contenu → carte simple ; ≥2 → menu. Offre
    implicite → `confirm=True` (carte à taper, jamais d'auto-nav vocale)."""
    try:
        panel = notion_panel(db, skill_id)
    except HTTPException:
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "notion_menu", "skill_id": skill_id, "visible": False},
        )
    name, slug, subject_name = panel["name"], panel["subject_slug"], panel["subject_name"]
    # ⚠️ Le filtre « ELI5 seulement si un cours validé existe » vivait ICI (correctif live du
    # 2026-07-30). Il a été SUPPRIMÉ le 2026-08-01, non pas abandonné : la règle est descendue
    # dans `galaxy.resolve_panoply`, qui rend désormais `eli5.available = False` sans cours. Le
    # filtre `available` ci-dessous la porte donc déjà. La garder ici en aurait fait une règle
    # écrite à deux endroits — exactement ce que l'addendum ADR-0024 interdit.
    items: list[ChatMenuItem] = []
    for act in panel["actions"]:
        kind = act["kind"]
        if kind not in NOTION_TOOLS or not act.get("available"):
            continue
        route, _label = _notion_route(
            kind, skill_id=skill_id, name=name, slug=slug, subject_name=subject_name, action=act
        )
        if route:
            items.append(ChatMenuItem(kind=kind, route=route, label=kind))

    # Notion « vide » = aucun contenu DURABLE (cours/fiche/carte/révision) — ELI5 ne compte pas :
    # il se génère à la volée, il n'est jamais la preuve qu'un contenu existe. Sans contenu durable →
    # réclamer le COURS à Papa (la porte des dérivés). Signal best-effort, aveugle au contenu (§1c),
    # émis par le service (addendum ADR-0027, déclencheur b).
    has_durable = any(i.kind != "eli5" for i in items)
    meta: dict = {"intent": "notion_menu", "skill_id": skill_id}
    if not has_durable:
        meta["content_requests"] = [{"skill_id": skill_id, "content_kind": "cours"}]

    if not items:
        # Rien de validé à offrir → honnêteté (ZETIS ne fabrique pas, il oriente vers l'existant).
        return ActionResult(
            # §16 — l'adulte ne se nomme pas dans l'espace de Massimo. ZETIS parle déjà à la
            # première personne ici : « je le note » suffit, et ne fait de personne un tiers.
            note=f"Je n'ai pas encore de contenu validé sur « {name} » — je le note.",
            meta={**meta, "items": 0},
        )
    if len(items) == 1:
        only = items[0]
        return ActionResult(
            action=ChatAction(kind="navigate", label=only.label, route=only.route, confirm=True),
            meta={**meta, "tool": only.kind, "route": only.route},
        )
    return ActionResult(
        action=ChatAction(
            kind="notion_menu", label=f"Sur « {name} », tu peux :", name=name, items=items, confirm=True
        ),
        meta={**meta, "items": [i.kind for i in items]},
    )


def _open_notion(
    db, embedder, *, student_id, intent, fallback_skill_id, fallback_skill, fallback_text=None
) -> ActionResult:
    tool = str(intent.get("tool") or "").strip().lower()
    # Notion : `notion_query` si fournie (résolution dédiée), sinon la notion déjà résolue du message.
    query = str(intent.get("notion_query") or "").strip()
    skill_id = fallback_skill_id
    query_resolue = False
    if query:
        res = resolve_skill(db, embedder, student_id=student_id, text=query)
        if res.skill_id is not None:
            skill_id = res.skill_id
            query_resolue = True

    # 🔴 **Rattrapage MATIÈRE — et il se teste AVANT tout le reste** (correctif live 2026-08-15).
    #
    # Constaté au micro : « montre-moi mes fiches de français » a été classé `open_notion` par le
    # moteur, avec `notion_query="français"`. Aucune notion ne porte ce nom, mais une MATIÈRE si —
    # et ZETIS a proposé **« Ajouter "français" à mon programme »**. La file de Papa se serait
    # remplie d'absurdités, une par matière.
    #
    # ⚠️ **Ne pas le placer derrière `skill_id is None` : `skill_id` ment.** Il retombe sur la
    # notion déduite du message ENTIER, qui accroche presque toujours quelque chose. Le test ne se
    # déclencherait jamais et le rattrapage resterait mort — vérifié en l'écrivant d'abord ainsi.
    # Ce qui compte est que **la chose NOMMÉE par le moteur** ne soit pas une notion.
    #
    # Le moteur PROPOSE, le serveur ANCRE. On ne corrige pas cela dans le seul prompt : un exemple
    # de plus ne garantit rien, un ancrage garantit toujours.
    # 🔴 **Un nom de matière EXACT bat une résolution de notion** (2ᵉ correctif live, 2026-08-15).
    #
    # Constaté au micro : « montre-moi mes fiches de mathématiques » a donné `notion_query =
    # "mathématiques"`, et l'embedder a trouvé une notion au-dessus du seuil (id 217, fiche
    # indisponible) → **aucune redirection**, alors que « mes mindmaps de mathématiques » marchait.
    # La différence n'était pas dans la demande, elle était dans le hasard de la similarité.
    #
    # La règle : la résolution de notion est FLOUE (cosinus d'embeddings) ; un nom de matière est
    # EXACT. Quand les deux répondent, l'exact gagne — c'est la seule des deux qui ne peut pas se
    # tromper. Un match seulement approché (« maths », « fiches de français ») reste subordonné à
    # l'échec de la notion, juste en dessous.
    if query and _matiere_exacte(db, query) is not None:
        return _open_subject(db, intent={"subject_query": query, "tool": tool})

    # 🔴 **L'étage du milieu — le CHAPITRE** (correctif live 2026-08-15). « Fais-moi réviser
    # l'orthographe » proposait d'ajouter « orthographe » au programme, alors que c'est un
    # chapitre de Français, déjà là et validé. Le chat ne connaissait que matière et notion, et
    # ratait l'étage dont un enfant parle le plus naturellement.
    #
    # Placé APRÈS la matière (une matière est plus large, et son nom est plus discriminant) et
    # AVANT la notion : un nom de chapitre EXACT bat une similarité d'embeddings, même raison que
    # pour la matière — l'exact ne peut pas se tromper, le flou si.
    if query:
        chapitre = _resolve_chapitre(db, query, exact=True)
        if chapitre is not None:
            return _open_chapitre(chapitre, tool)

    # Les correspondances SOUPLES (radical de matière, inclusion de chapitre) ne s'appliquent que
    # si la notion n'a rien donné : elles sont utiles en dernier recours, dangereuses en premier.
    if query and not query_resolue:
        if _resolve_subject(db, query) is not None:
            return _open_subject(db, intent={"subject_query": query, "tool": tool})
        chapitre = _resolve_chapitre(db, query)
        if chapitre is not None:
            return _open_chapitre(chapitre, tool)

    if skill_id is None:
        # Notion HORS PROGRAMME (rien ne résout) → carte OPT-IN « Demander à Papa d'ajouter » (le tap
        # crée un notion_request, précédent ELI5). Libellé = la notion nommée (notion_query), sinon le
        # message. Sans libellé exploitable → note seule (rien à proposer d'ajouter).
        label_text = (query or str(fallback_text or "").strip())[:160]
        if label_text:
            return ActionResult(
                action=ChatAction(
                    kind="request_notion",
                    label=f"Ajouter « {label_text} » à mon programme",
                    text=label_text,
                    confirm=True,
                ),
                note="Ça, je ne le trouve pas encore dans ton programme.",
                meta={"intent": "open_notion", "skill_id": None, "request_notion": True},
            )
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "open_notion", "skill_id": None},
        )
    # Pas d'outil précis → MENU de ce qui existe pour la notion (Q1).
    if not tool:
        return _notion_menu(db, skill_id)
    try:
        panel = notion_panel(db, skill_id)  # ancrage : matière + contenus `available`
    except HTTPException:
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "open_notion", "skill_id": skill_id},
        )

    name, slug, subject_name = panel["name"], panel["subject_slug"], panel["subject_name"]
    actions = {a["kind"]: a for a in panel["actions"]}
    # ELI5 sans cours validé → il inventerait (ADR-0011) : on NE route pas vers lui (ADR-0027 §3).
    # On délègue au menu, qui offre l'existant validé (fiche/carte…) ou reste honnête + demande Papa.
    # ⚠️ La condition lit `eli5.available` — le prédicat partagé — et non plus `cours.available`
    # qu'elle redérivait. Ce branchement n'est PAS la règle de disponibilité (elle est portée par
    # `resolve_panoply`) : c'est un choix de ROUTAGE, qui préfère montrer les alternatives réelles
    # plutôt que la branche « contenu absent ». Comportement éprouvé live, conservé tel quel.
    if tool == "eli5" and not bool(actions.get("eli5", {}).get("available")):
        return _notion_menu(db, skill_id)
    # ⚠️ L'atelier n'est pas une activité de la panoplie : il n'a pas d'entrée à lui, et sa
    # condition n'est pas une « disponibilité » mais l'existence d'une LEÇON à résumer. On lui
    # passe donc l'entrée `cours`, d'où vient le `lesson_id`.
    entry = actions.get("cours") if tool == "atelier" else actions.get(tool)
    if entry is None or (tool != "atelier" and not entry.get("available")):
        # Contenu absent → honnêteté + DEMANDE À PAPA (ADR-0027 §3, mécanisme tranché par
        # l'addendum content_requests). Le signal (métadonnée pure, aveugle au contenu §1c) est
        # émis par le service ; ici on l'expose seulement.
        #
        # 🔴 **Le repli `.get(tool, "cours")` est RÉVOQUÉ** (`adr-0059` §16). Il défendait deux
        # choses distinctes, et les confondait :
        #
        # - *« la promesse doit être tenue »* — une note « je le note » sans écriture est un
        #   mensonge. **Reste vrai, et tient sans le repli** : sur un outil que le moteur a
        #   halluciné (« podcast »), on ne promet pas. La note perd son « — je le note » et aucun
        #   signal n'est émis. ZETIS devient honnête *et* silencieux, au lieu d'honnête et menteur.
        # - *« le cours est la porte des dérivés »* — **reste vrai aussi, mais c'est le
        #   déclencheur « notion vide », pas le repli**, qui faisait ce travail par accident, un
        #   cas sur deux. Il est promu juste en dessous.
        content_kind = _TOOL_TO_CONTENT_KIND.get(tool)
        demandes = [{"skill_id": skill_id, "content_kind": content_kind}] if content_kind else []
        # La porte s'AJOUTE, elle ne remplace pas : sur une notion sans aucun contenu durable, un
        # lot ne produirait pas le dérivé réclamé faute de cours. Papa reçoit donc les DEUX lignes
        # — ce qu'il a demandé, et ce qu'il faut faire d'abord. `blocked_reason` dit « ça ne
        # produira rien » ; il ne dit pas « voici quoi faire », et une demande est actionnable en
        # un clic dans sa file.
        if demandes and content_kind != "cours" and not _a_du_durable(actions):
            demandes.append({"skill_id": skill_id, "content_kind": "cours"})
        meta = {
            "intent": "open_notion",
            "skill_id": skill_id,
            "tool": tool,
            "available": False,
            "content_requests": demandes,
        }
        mot = _TOOL_WORD.get(tool, "contenu")
        note = f"Je n'ai pas encore de {mot} sur « {name} »"
        return ActionResult(note=f"{note} — je le note." if demandes else f"{note}.", meta=meta)
    route, label = _notion_route(
        tool, skill_id=skill_id, name=name, slug=slug, subject_name=subject_name, action=entry
    )
    if route is None:
        return ActionResult(
            note="Ça, je ne peux pas encore te l'ouvrir directement — mais on peut en parler !",
            meta={"intent": "open_notion", "skill_id": skill_id, "tool": tool, "route": None},
        )
    result_meta = {"intent": "open_notion", "skill_id": skill_id, "tool": tool, "route": route}
    # « Notion vide » (déclencheur b) : on route (souvent vers ELI5, toujours dispo), mais AUCUN
    # contenu DURABLE n'existe (cours/fiche/carte/révision) → on réclame le COURS à Papa. ELI5 seul
    # ne prouve rien (génératif à la volée). Vaut sur TOUS les chemins, pas seulement le menu :
    # sinon un intent `tool=eli5` sur une notion sans cours n'enregistrerait jamais la demande.
    if not _a_du_durable(actions):
        result_meta["content_requests"] = [{"skill_id": skill_id, "content_kind": "cours"}]
    return ActionResult(
        action=ChatAction(kind="navigate", route=route, label=label),
        meta=result_meta,
    )


def _route_de_chapitre(chapitre: dict, tool: str) -> tuple[str, str]:
    """Où mène un CHAPITRE nommé, selon l'outil demandé (correctif live 2026-08-15).

    Trois destinations seulement, et **aucune adresse nouvelle n'est inventée** — le critère qui
    borne l'`adr-0059` §3 tient : ce sont des paramètres sur des routes qui existent.

    - `revision` → `/revision?chapitre=<id>` : le deck de chapitre existe depuis l'`adr-0049`,
      il n'avait simplement **aucune adresse** (il se lançait par `location.state`, comme le quiz
      avant ce chantier). C'est le cas d'usage qui a révélé le manque : « fais-moi réviser
      l'orthographe ».
    - `cours` → `/subjects/<slug>/cours?chapter=<id>` : paramètre déjà consommé par la page
      (addendum `adr-0025` §15, chemin de l'agenda).
    - tout le reste → **la maison du chapitre**, `/subjects/<slug>?onglet=chapitres&chapitre=<id>`,
      d'où Massimo voit ses leçons et ses activités. Aucun deck de chapitre n'existe pour la
      fiche, la carte, le quiz ou la capsule : y router à la maille matière ferait passer une
      approximation pour une réponse.
    """
    slug = quote(chapitre["subject_slug"])
    nom = chapitre["name"]
    cid = chapitre["chapter_id"]
    if tool == "revision":
        return f"/revision?chapitre={cid}", f"Réviser {nom}"
    if tool == "cours":
        return f"/subjects/{slug}/cours?chapter={cid}", f"Ton cours sur {nom}"
    return f"/subjects/{slug}?onglet=chapitres&chapitre={cid}", f"Ouvrir {nom}"


def _open_chapitre(chapitre: dict, tool: str) -> ActionResult:
    route, label = _route_de_chapitre(chapitre, tool)
    return ActionResult(
        action=ChatAction(kind="navigate", route=route, label=label),
        meta={
            "intent": "open_chapter",
            "chapter_id": chapitre["chapter_id"],
            "tool": tool or None,
            "route": route,
        },
    )


def _start_recall(
    db, embedder, *, student_id, intent, fallback_skill_id
) -> ActionResult:
    """« Interroge-moi sur X » → ouverture d'une interrogation, ou refus honnête (`adr-0059` §10).

    🔴 **Le gate est EMPRUNTÉ à `resolve_panoply`, jamais redérivé.** Sans cours validé, ZETIS
    inventerait les questions *et* les corrections — c'est exactement ce que la disponibilité
    d'ELI5 exprime déjà (`eli5.available` ⇔ un cours existe). Précédent direct : le filtre
    « ELI5 seulement si cours validé » a dû être **supprimé** d'ici le 2026-08-01 parce qu'il
    dupliquait une règle portée ailleurs. On ne refait pas l'erreur.

    Le refus réutilise le chemin existant : note honnête + demande de `cours` à Papa.
    """
    query = str(intent.get("notion_query") or "").strip()
    skill_id = fallback_skill_id
    if query:
        res = resolve_skill(db, embedder, student_id=student_id, text=query)
        if res.skill_id is not None:
            skill_id = res.skill_id
    if skill_id is None:
        return ActionResult(
            note="Sur quoi tu veux que je t'interroge ?",
            meta={"intent": "start_recall", "skill_id": None},
        )
    try:
        panel = notion_panel(db, skill_id)
    except HTTPException:
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "start_recall", "skill_id": skill_id, "visible": False},
        )

    actions = {a["kind"]: a for a in panel["actions"]}
    if not bool(actions.get("eli5", {}).get("available")):
        # Pas de cours → pas d'interrogation. ZETIS le dit, et le note.
        return ActionResult(
            note=f"Je n'ai pas encore de cours sur « {panel['name']} » pour t'interroger — je le note.",
            meta={
                "intent": "start_recall",
                "skill_id": skill_id,
                "available": False,
                "content_requests": [{"skill_id": skill_id, "content_kind": "cours"}],
            },
        )
    return ActionResult(
        meta={
            "intent": "start_recall",
            "skill_id": skill_id,
            "recall": {"skill_id": skill_id, "skill_name": panel["name"]},
        }
    )


def _open_subject(db, *, intent) -> ActionResult:
    resolved = _resolve_subject(db, str(intent.get("subject_query") or ""))
    if resolved is None:
        return ActionResult(
            note="Je ne vois pas de quelle matière tu parles.",
            meta={"intent": "open_subject", "slug": None},
        )
    slug, subject_name = resolved
    tool = str(intent.get("tool") or "").strip().lower()
    # ⚠️ **Plus aucune route n'est fabriquée ici** (`adr-0059` §A2). La branche « matière nue »
    # construisait `f"/subjects/{slug}"` sur place : l'invariant « `_notion_route` est la seule
    # fabrique de destinations » était donc faux **en lettre**, et le test-verrou n°8 ne le
    # voyait pas parce qu'il ne balayait qu'`announce.py`. Un outil hors `SUBJECT_TOOLS` est
    # traité comme une absence d'outil — la matière nue est la bonne réponse à « ouvre-moi les
    # maths », et à « ouvre-moi les podcasts de maths » aussi.
    effectif = tool if tool in SUBJECT_TOOLS else ""
    route, _ = _notion_route(
        effectif, skill_id=0, name="", slug=slug, subject_name=subject_name, action={}
    )
    label = (
        f"{_TOOL_WORD[effectif].capitalize()} de {subject_name}"
        if effectif
        else f"Ouvrir {subject_name}"
    )
    if route is None:
        # `capsule` : aucune route de matière (cf. `_notion_route`). On ne fabrique pas un lien
        # vers la liste globale — on le dit.
        return ActionResult(
            note=f"Je ne peux pas t'ouvrir les {_TOOL_WORD.get(tool, 'contenus')} par matière.",
            meta={"intent": "open_subject", "slug": slug, "tool": tool or None, "route": None},
        )
    return ActionResult(
        action=ChatAction(kind="navigate", route=route, label=label),
        meta={"intent": "open_subject", "slug": slug, "tool": tool or None, "route": route},
    )


def resolve_action(
    db: Session,
    embedder: EmbeddingProvider,
    *,
    student_id: int,
    intent: dict | None,
    fallback_skill_id: int | None = None,
    fallback_skill=None,
    fallback_text: str | None = None,
) -> ActionResult:
    """Ancre l'intent proposé par le LLM en une `ChatAction` réelle, ou rien. Ne lève jamais.

    `fallback_text` (= le message de Massimo) sert de libellé à l'offre `request_notion` quand la
    notion est hors-programme et que le LLM n'a pas isolé de `notion_query`."""
    if not intent:
        return ActionResult()
    kind = str(intent.get("kind") or "").strip().lower()

    if kind == "show_data":
        data = str(intent.get("data") or "").strip().lower()
        if data in DATA_KINDS:
            return ActionResult(
                action=ChatAction(kind="show_data", data=data, label=_DATA_LABEL[data]),
                meta={"intent": "show_data", "data": data},
            )
        return ActionResult(meta={"intent": "show_data", "data": None})

    if kind == "open_notion":
        return _open_notion(
            db,
            embedder,
            student_id=student_id,
            intent=intent,
            fallback_skill_id=fallback_skill_id,
            fallback_skill=fallback_skill,
            fallback_text=fallback_text,
        )

    if kind == "open_subject":
        return _open_subject(db, intent=intent)

    if kind == "open_index":
        # Vocabulaire FERMÉ, comme `DATA_KINDS` : une valeur hallucinée ne produit rien plutôt
        # qu'une route inventée. Même doctrine que partout ailleurs ici.
        index = str(intent.get("index") or "").strip().lower()
        if index in _INDEX_ROUTES:
            route, label = _INDEX_ROUTES[index]
            return ActionResult(
                action=ChatAction(kind="navigate", route=route, label=label),
                meta={"intent": "open_index", "index": index, "route": route},
            )
        return ActionResult(meta={"intent": "open_index", "index": None})

    if kind == "start_recall":
        return _start_recall(
            db, embedder, student_id=student_id, intent=intent, fallback_skill_id=fallback_skill_id
        )

    if kind == "stop_recall":
        # Sortie explicite (« stop », « j'arrête »). Aucune action, aucune note : le service
        # efface l'état et le tour redevient une conversation ordinaire. **ZETIS n'insiste
        # jamais** (`adr-0026` §4) — pas de « tu es sûr ? », pas de « encore une ! ».
        return ActionResult(meta={"intent": "stop_recall"})

    return ActionResult(meta={"intent": kind or "none"})
