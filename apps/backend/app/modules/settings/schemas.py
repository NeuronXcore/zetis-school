"""Schémas des réglages d'autonomie (ADR-0032) — Papa uniquement."""

from datetime import datetime

from pydantic import BaseModel


class AutonomyClassOut(BaseModel):
    """Une classe d'objets, son palier, et ce qu'elle autorise.

    `choices` est envoyé au front **pour qu'il n'ait aucune liste en dur** : le serveur refuse ce
    qui n'y est pas, l'interface ne fait que le rendre lisible. `reason` accompagne toujours un
    verrou — un cadenas muet se lit comme une panne.
    """

    key: str
    code: str
    label: str
    value: int
    choices: list[int]
    locked: bool
    reason: str | None = None


class AutonomyOut(BaseModel):
    classes: list[AutonomyClassOut]
    #: Le NIVEAU, DÉRIVÉ des valeurs — jamais stocké. `null` = « sur mesure ».
    #:
    #: ⚠️ S'appelait `preset` jusqu'au 2026-08-04. Renommé avec le reste du vocabulaire (addendum
    #: ADR-0032 §8.0) : un NIVEAU est l'un des trois régimes, un PALIER est le degré 0-3 d'une
    #: classe. Le seul consommateur de cet endpoint est `frontend-papa` — aucun contrat externe.
    niveau: str | None = None
    #: ⚠️ **Champ SÉPARÉ de `classes`, délibérément** (ADR-0035 §5) : ce n'est pas un palier mais
    #: une autre question — « ZETIS a-t-il le droit de DÉMARRER seul ? » là où les paliers disent
    #: « a-t-il le droit de SERVIR sans relecture ? ». Le mettre dans `classes` ferait qu'un
    #: préréglage l'armerait, et le front le rendrait comme un palier à 4 valeurs.
    auto_trigger_enabled: bool = False
    #: ZETIS est-il SUSPENDU ? (ADR-0063 §6) — la sidebar lit ce GET sur les 22 écrans, et un
    #: ZETIS suspendu invisible serait la panne des six heures causée par Papa lui-même.
    #:
    #: ⚠️ **Transport partagé, question distincte, ÉCRITURE SÉPARÉE** : même patron que le
    #: déclencheur (ADR-0035 §5). `AutonomyRequest` ne gagne AUCUN champ — la bascule passe par
    #: `PUT /production-suspension`, sinon deux chemins d'écriture pour la même question.
    production_suspended: bool = False


class AutonomyRequest(BaseModel):
    """Écriture partielle : on n'envoie que ce qui change.

    Pas de champ `niveau` : un niveau est un raccourci d'ÉCRITURE côté client, qui se traduit
    en valeurs. L'accepter ici en ferait un second chemin d'écriture — donc une seconde source de
    vérité pour la même question.
    """

    values: dict[str, int] = {}
    #: Bascule du déclencheur automatique. **Optionnel et séparé de `values`** : `write_autonomy`
    #: rejette toute clé hors des six paliers, et cette clé n'en est pas un. `None` = ne pas y
    #: toucher — envoyer un préréglage ne doit jamais armer ZETIS au passage.
    auto_trigger_enabled: bool | None = None


class EcartsOut(BaseModel):
    """Les réglages qui s'écartent du défaut (ADR-0062 §4).

    ⚠️ **Les clés seulement, jamais les valeurs.** La question posée est « qu'est-ce qui n'est plus
    au défaut ? » — une valeur n'y répond pas, et chaque champ qui sort est un champ à protéger.
    """

    keys: list[str]


# --- 🧠 La machine (ADR-0062 §2) ----------------------------------------------------------------
#
# ⚠️ **Aucun champ éditable n'existe ici, et c'est structurel** : il n'y a pas de `MachineRequest`.
# Le routage vit en variables d'environnement lues au démarrage — un schéma d'écriture serait la
# première pierre d'un interrupteur sans effet.


class SondeOut(BaseModel):
    nom: str
    #: `ok` · `degrade` · `ko`. 🔴 `degrade` n'est pas un demi-`ko` : c'est « le service répond,
    #: mais pas ce qu'on attend de lui » — l'état qui distingue un volume non monté d'un modèle mal
    #: nommé. Un seul `❌` ferait chercher une panne réseau devant un disque débranché.
    etat: str
    detail: str
    latence_ms: int | None = None


class MoteurOut(BaseModel):
    tache: str
    moteur: str
    modele: str
    #: `local` | `cloud`. Affiché, jamais réglable : un déroulant permettrait d'expédier les
    #: données de Massimo chez un tiers d'un clic.
    ou: str
    ce_qui_part: str
    #: Motif du verrou. Toujours présent quand la ligne est verrouillée — un cadenas muet se lit
    #: comme une panne.
    motif: str | None = None


class PromptOut(BaseModel):
    module: str
    constante: str
    version: str


class WorkerOut(BaseModel):
    nom: str
    file: str
    #: 🔴 L'ÂGE, pas une pastille verte : un `SimpleWorker` RQ ne recharge jamais le code, donc
    #: « vivant » ne veut pas dire « à jour ».
    age_minutes: int | None = None


class EchecOut(BaseModel):
    id: int
    job_type: str
    #: Le message DU SERVEUR, relayé tel quel. Un « échec » sans motif oblige à ouvrir les logs.
    message: str | None = None
    quand: datetime
    #: Acquittement SERVEUR (`ai_jobs.acknowledged_at`), jamais un `localStorage` : sinon l'échec
    #: réapparaît sur l'autre appareil.
    acquitte: bool


class StatTravailOut(BaseModel):
    job_type: str
    reussis: int
    echoues: int
    #: `None` et jamais `0` : zéro n'est pas une durée courte, c'est une absence de réponse.
    mediane_ms: int | None = None


class SortieReseauOut(BaseModel):
    quand: datetime
    tache: str
    classe_de_donnees: str


class EchecsOut(BaseModel):
    """🔴 Les compteurs sont COMPTÉS en base ; `lignes` est plafonnée.

    Les déduire de la liste ferait dire « 20 non acquittés » à une base qui en porte 200 — une
    troncature silencieuse déguisée en mesure.
    """

    total: int
    non_acquittes: int
    lignes: list[EchecOut] = []


class SortiesReseauOut(BaseModel):
    actif: bool
    destinataire: str | None = None
    #: Compté sur 30 jours, jamais `len(appels)` : c'est un journal de confidentialité, il ne peut
    #: pas sous-compter.
    total: int = 0
    appels: list[SortieReseauOut] = []


class ReglageEnvOut(BaseModel):
    nom: str
    variable: str
    valeur: str
    motif: str


class InstallationOut(BaseModel):
    version: str
    alembic_head: str | None = None
    mot_de_passe_dev_en_place: bool


class FileOut(BaseModel):
    en_attente: int
    en_cours: int


class SupervisionOut(BaseModel):
    """Le geste « Redémarrer un worker » existe-t-il ici ? — et sinon, POURQUOI (chantier A1).

    Le motif est celui du 409 de la route, écrit une fois dans `workers.py` : l'écran grise le
    bouton AVEC ce texte au lieu de laisser Papa cliquer pour apprendre le refus."""

    supervised: bool
    motif: str | None = None


class MachineOut(BaseModel):
    """L'instantané complet. Un seul appel, une seule vérité à l'instant t.

    🔴 **Aucun secret n'y figure** : la clé Anthropic est rendue en booléen de PRÉSENCE, jamais sa
    valeur ni un préfixe, et aucune URL de service ne porte d'identifiant. Un test le verrouille.
    """

    #: ZETIS est-il suspendu ? (ADR-0063) — l'état vit à côté du geste, dans le même instantané.
    production_suspended: bool
    workers_supervision: SupervisionOut
    sondes: list[SondeOut]
    moteurs: list[MoteurOut]
    cle_anthropic_presente: bool
    prompts: list[PromptOut]
    file: FileOut
    workers: list[WorkerOut]
    echecs: EchecsOut
    sept_derniers_jours: list[StatTravailOut]
    sorties_reseau: SortiesReseauOut
    reglages_env: list[ReglageEnvOut]
    installation: InstallationOut


class TestMoteurOut(BaseModel):
    """Le résultat d'un vrai appel : une vraie latence, un vrai JSON valide ou non.

    C'est le seul geste de l'onglet, et il ne persiste rien. Il transforme la page d'une
    déclaration en une preuve.
    """

    ok: bool
    latence_ms: int
    modele: str
    detail: str

class SuspensionOut(BaseModel):
    """ZETIS est-il suspendu ? (ADR-0063) — lu par la page et par la sidebar."""

    suspended: bool


class SauvegardeAccepteeOut(BaseModel):
    """Le 202 des routes `POST /donnees/*` (ADR-0065 §1, §7) : des MÉTADONNÉES de travail,
    rien d'autre. Aucun octet d'archive ne passe par HTTP — ce schéma est le contrat qui
    l'empêche de dériver : y ajouter un champ de contenu ferait rougir le test-verrou."""

    job_id: int
    status: str


class SauvegardeVerificationRequest(BaseModel):
    """La désignation d'UNE archive à vérifier (ADR-0065 §6) — un NOM, jamais un chemin.

    Le serveur ne fait pas confiance à ce champ : la route le confronte à la whitelist
    `zetis-AAAA-MM-JJ-hhmm.tar` avant d'enfiler (traversée de répertoire sinon)."""

    archive: str


class SauvegardeRestaurationRequest(BaseModel):
    """La désignation d'UNE archive à restaurer (ADR-0066 §2) — même contrat que la
    vérification : un NOM confronté à la whitelist, jamais un chemin. Toutes les autres
    préconditions (verdict `reussie`, suspension, supervision, compatibilité) sont refusées
    en 409 motivé par la route, AVANT d'enfiler."""

    archive: str


class SauvegardeSuppressionOut(BaseModel):
    """Le 200 de `DELETE /donnees/archives/{nom}` (ADR-0066 §6) : les NOMS retirés de la
    cible — le tar et TOUS ses sidecars, rien d'orphelin. Des métadonnées, jamais un contenu."""

    archive: str
    supprimes: list[str]


# --- 💾 Données (ADR-0065 §7) — l'état, jamais un contenu -----------------------------------------


class CertificatCibleOut(BaseModel):
    """La cible est-elle certifiée et valable ? Le MOTIF voyage avec le refus (adr-0062 §6 :
    un cadenas muet se lit comme une panne) — c'est le même texte que le 409 de la route."""

    valable: bool
    motif: str | None = None
    #: OÙ la sauvegarde s'écrit — le chemin HÔTE consigné par le certificat (§3). `None` tant
    #: que la cible n'est pas certifiée. Relevé à la relecture d'écran : « certifiée » sans dire
    #: où obligeait Papa à demander.
    cible: str | None = None


class VerificationArchiveOut(BaseModel):
    """Le résumé d'un verdict de `backup_verify` (§6) — le DÉTAIL des écarts reste dans
    l'`output_json` du travail ; la page n'en montre que le compte."""

    archive: str
    #: `reussie` | `echec` — c'est ce verdict qui donne (ou refuse) le mot « sauvegarde » (§7).
    verdict: str | None = None
    verifie_le: str | None = None
    ecarts: int = 0


class ArchiveOut(BaseModel):
    """Une archive telle que la CIBLE la porte — métadonnées de sidecars, jamais un contenu.

    `sha256`, `lignes`, `tables` sont `None` quand le sidecar manque ou est illisible : la page
    montre l'archive quand même — cacher un fichier présent sur la cible serait un mensonge."""

    nom: str
    taille: int
    cree_le: str
    sha256: str | None = None
    lignes: int | None = None
    tables: int | None = None
    #: `None` = jamais vérifiée — « export non vérifié » à l'écran, et c'est le point du §7.
    verification: VerificationArchiveOut | None = None
    #: Le verdict de COMPATIBILITÉ (ADR-0066 §5) : la tête Alembic du manifeste contre les
    #: migrations du code installé — rendu AVANT le geste, fail-closed. Ne dit RIEN de
    #: l'intégrité (ça, c'est `verification`) : les deux verdicts se cumulent pour « Restaurer ».
    restaurable: bool = False
    #: Pourquoi pas restaurable — `None` quand `restaurable` est vrai (adr-0062 §6 : un
    #: cadenas muet se lit comme une panne).
    motif: str | None = None
    #: « Restaurée le … » (ADR-0066 §7) — lu du sidecar `.restauration.json` (§3), le seul
    #: survivant du geste : la ligne `ai_jobs` du travail meurt au swap. `None` = jamais
    #: restaurée, ou geste interrompu — un swap à moitié franchi n'a pas droit au mot.
    restauree_le: str | None = None


class DonneesOut(BaseModel):
    """Le 200 de `GET /donnees` (ADR-0065 §7). Des listes, des tailles, des empreintes, des
    verdicts — AUCUN octet d'archive ne passe par HTTP (§1), ni ici ni ailleurs."""

    certificat: CertificatCibleOut
    archives: list[ArchiveOut]
    derniere_verification: VerificationArchiveOut | None = None


class SuspensionRequest(BaseModel):
    """La bascule, dans les deux sens. Pas d'expiration, pas de durée : un suspend ne se lève que
    par le geste inverse (ADR-0063 §5) — un champ « pendant N minutes » en ferait un minuteur."""

    suspended: bool
