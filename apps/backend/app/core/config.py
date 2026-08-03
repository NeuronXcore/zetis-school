from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Convention du monorepo : les clés API (secrets) vivent UNIQUEMENT dans le .env à la
# racine du projet ; apps/backend/.env ne porte que la config locale du backend.
# Chemins absolus (indépendants du cwd d'uvicorn) ; un fichier absent est ignoré.
_BACKEND_DIR = Path(__file__).resolve().parents[2]  # apps/backend
_REPO_ROOT = _BACKEND_DIR.parents[1]


class Settings(BaseSettings):
    """Configuration du backend ZETIS (surchargée via .env ou variables d'env)."""

    # Ordre = priorité croissante : le .env du backend surcharge celui de la racine ;
    # les vraies variables d'environnement priment sur les deux.
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _BACKEND_DIR / ".env"),
        env_prefix="ZETIS_",
        extra="ignore",
    )

    app_name: str = "zetis-backend"
    version: str = "0.1.0"

    # --- Base de données (Étape 9) ---
    database_url: str = "postgresql+psycopg://zetis:zetis_dev_password@localhost:5432/zetis"

    # --- IA (Étape 10) : provider LLM de génération. Variables sans préfixe ZETIS_. ---
    # 'ollama' (défaut) ou 'mlx' (mlx_lm.server, Apple Silicon). Cf. ADR-0008.
    llm_provider: str = Field(default="ollama", validation_alias="LLM_PROVIDER")
    ollama_base_url: str = Field(default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL")
    # Modèle de génération retenu (ADR-0008 phase 2) : MoE Qwen3 — qualité ≈ 72b à la vitesse
    # la plus rapide (~5 s ELI5). `OllamaProvider` passe automatiquement `think:false` pour qwen3.
    ollama_model: str = Field(default="qwen3.6:35b-a3b", validation_alias="OLLAMA_MODEL")
    # --- MLX (ADR-0008) : serveur d'inférence local OpenAI-compatible (mlx_lm.server). ---
    # Le backend n'importe pas `mlx` : il parle en HTTP, comme pour ollama.
    mlx_base_url: str = Field(default="http://localhost:8080", validation_alias="MLX_BASE_URL")
    mlx_model: str = Field(default="mlx-community/Qwen2.5-32B-Instruct-4bit", validation_alias="MLX_MODEL")
    # --- Curriculum (ADR-0009, addendum) : dérogation cloud étroite pour `curriculum_*`. ---
    # Seules les tâches de génération de référentiel sont routées vers Anthropic (bench T4,
    # issue (b)) ; zéro donnée de Massimo dans ces prompts. Sans clé : erreur explicite,
    # jamais de bascule silencieuse. Repli local assumé : CURRICULUM_LLM_PROVIDER=ollama.
    curriculum_llm_provider: str = Field(
        default="anthropic", validation_alias="CURRICULUM_LLM_PROVIDER"
    )
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    anthropic_base_url: str = Field(
        default="https://api.anthropic.com", validation_alias="ANTHROPIC_BASE_URL"
    )
    anthropic_model: str = Field(default="claude-sonnet-5", validation_alias="ANTHROPIC_MODEL")

    # --- Missions (ADR-0017 lot 1) : récompense d'effort + seuils du verdict d'acquisition. ---
    # L'XP récompense l'EFFORT (crédité à la complétion, inconditionnel) : +50 (arbitrage 5bis,
    # valeur DATA_MODEL.md retenue). Le VERDICT (acquired vs review_later) est découplé : il
    # exige score reverse ET score quiz ≥ seuils. Seuils versionnés avec le scoring (Lot 2).
    mission_xp_reward: int = Field(default=50, validation_alias="MISSION_XP_REWARD")
    mission_reverse_threshold: int = Field(default=70, validation_alias="MISSION_REVERSE_THRESHOLD")
    mission_quiz_threshold: int = Field(default=70, validation_alias="MISSION_QUIZ_THRESHOLD")
    # ADR-0019 (verdict option B) : seuil du signal de rappel « mindmap ». Une reconstruction
    # ≥ ce seuil peut tenir lieu de rappel à la place du quiz dans le verdict d'acquisition.
    mission_mindmap_threshold: int = Field(default=70, validation_alias="MISSION_MINDMAP_THRESHOLD")

    # --- Sélecteur de la mission du jour (ADR-0017 lot 2, décision 2) : scoring DÉTERMINISTE,
    # zéro LLM. La formule est VERSIONNÉE (`MISSION_SCORING_VERSION` couvre formule ET templates
    # d'étapes) : tout changement de facteur/pondération = bump, tracé dans la sortie du sélecteur.
    # Pondérations et seuils vivent ICI, jamais dans le code du service. ---
    # v2 (ADR-0018) : le facteur `forced_priority` lit le flag `mission.force_priority` au lieu du
    # type `manual`. v3 (ADR-0019) : le parcours généré peut inclure un step `mindmap`, et le
    # verdict admet la reconstruction comme signal de rappel (option B). v4 (addendum ADR-0017
    # §5bis) : le template `revision` reçoit l'étape de RÉEXPLICATION qui lui manquait — sans elle
    # le verdict ne pouvait jamais conclure `acquired`, donc la boucle SRS que le §5bis désigne
    # comme relais ne se refermait jamais. Le versionnage couvre formule ET templates de parcours —
    # tout changement = bump tracé.
    mission_scoring_version: str = Field(default="v4", validation_alias="MISSION_SCORING_VERSION")
    mission_weight_severity: float = Field(default=1.0, validation_alias="MISSION_WEIGHT_SEVERITY")
    mission_weight_due_pressure: float = Field(
        default=0.8, validation_alias="MISSION_WEIGHT_DUE_PRESSURE"
    )
    mission_weight_continuity: float = Field(
        default=0.6, validation_alias="MISSION_WEIGHT_CONTINUITY"
    )
    # `variety` est un MALUS (soustrait) : anti-répétition si la même matière a été élue la veille
    # (proxy déterministe : matière de la dernière mission complétée — l'ADR interdit de stocker
    # les élections).
    mission_weight_variety: float = Field(default=0.5, validation_alias="MISSION_WEIGHT_VARIETY")
    # Plancher des missions `manual` (priorité forcée Papa) : domine le score sans jamais être
    # dominé (une mission « avant le contrôle » court-circuite le score, jamais l'inverse).
    mission_weight_forced_priority: float = Field(
        default=100.0, validation_alias="MISSION_WEIGHT_FORCED_PRIORITY"
    )
    # Nombre de cartes dues qui sature `due_pressure` à 1.0.
    mission_due_pressure_cap: int = Field(default=6, validation_alias="MISSION_DUE_PRESSURE_CAP")
    # Générateur `revision` (ADR-0017 §5, amendé 2026-07-06) : UNE mission par notion due, bornée
    # aux N notions les plus en retard (mono-notion — le verdict d'acquisition §5bis l'exige ; N
    # borne aussi la file de validation Papa).
    mission_revision_top_n: int = Field(default=3, validation_alias="MISSION_REVISION_TOP_N")

    # --- Commander une mission (ADR-0018) : Papa apporte le scope, ZETIS résout les notions les
    # plus fragiles, une mission mono-skill par notion cochée. Seuil et plafond versionnés
    # (`MISSION_COMMAND_VERSION`), même discipline que le scoring. ---
    mission_command_version: str = Field(default="v1", validation_alias="MISSION_COMMAND_VERSION")
    # Une notion `mastery ≥ seuil` arrive décochée par défaut (recochable côté Papa).
    mission_command_mastered_threshold: float = Field(
        default=0.8, validation_alias="MISSION_COMMAND_MASTERED_THRESHOLD"
    )
    # Plafond de notions cochées par commande = plafond de missions créées (fan-out atomique).
    mission_command_max_skills: int = Field(
        default=3, validation_alias="MISSION_COMMAND_MAX_SKILLS"
    )

    # --- Missions croisées « champion » (ADR-0022) : UNE mission multi-matières, multi-outils,
    # verdict PAR NOTION. Papa choisit une saveur (boss/consolidation/mix) puis ZETIS compose ; la
    # mission est exclue du sélecteur quotidien (jamais élue « mission du jour », ADR-0017 §6). Les
    # seuils de verdict (`mission_{reverse,quiz,mindmap}_threshold`) sont RÉUTILISÉS tels quels. ---
    mission_champion_version: str = Field(
        default="v1", validation_alias="MISSION_CHAMPION_VERSION"
    )
    # Plafond de notions d'un défi champion (borne la longueur — une champion dépasse volontairement
    # le budget 15 min, c'est un défi). ≥ 2 matières distinctes exigées (sinon ce n'est pas croisé).
    mission_champion_max_skills: int = Field(
        default=3, validation_alias="MISSION_CHAMPION_MAX_SKILLS"
    )
    # XP majoré (l'effort d'un défi transversal) : forfait de base + bonus par notion travaillée.
    mission_champion_xp_base: int = Field(
        default=80, validation_alias="MISSION_CHAMPION_XP_BASE"
    )
    mission_champion_xp_per_notion: int = Field(
        default=30, validation_alias="MISSION_CHAMPION_XP_PER_NOTION"
    )

    # --- Agenda scolaire (ADR-0025) : première source exogène, déclarative et NON PROBANTE. ---
    # Verrou de phase (§10). Phase 0 : Papa écrit, Massimo LIT, COCHE et MASQUE. La saisie élève
    # s'ouvre en phase 1, sur un geste de Papa — jamais automatiquement, jamais sur un seuil de
    # coches observé (ce serait faire dépendre un droit d'une surveillance).
    # Le verrou est SERVEUR : une UI cachée n'est pas une règle. `done`/`dismiss` ne sont jamais
    # concernés par ce flag.
    agenda_student_entry_enabled: bool = Field(
        default=False, validation_alias="AGENDA_STUDENT_ENTRY_ENABLED"
    )
    # Bande glissante (§6) : JAMAIS alignée sur la semaine calendaire (elle passerait de 6 jours
    # d'horizon le lundi à 0 le dimanche).
    #
    # **Asymétrie volontaire — 3 jours en arrière, 10 en avant** (élargie de 7 à 14 jours le
    # 2026-07-29). Tout l'élargissement va vers l'AVANT : l'ADR borne le regard en arrière à
    # 3 jours (« scroll arrière au-delà » est hors périmètre), parce qu'un passé qu'on parcourt
    # rend les trous visibles — le motif même qui a fait écarter la vue mois. L'anticipation,
    # elle, n'a pas cet inconvénient.
    agenda_band_days_before: int = Field(default=3, validation_alias="AGENDA_BAND_DAYS_BEFORE")
    agenda_band_days_after: int = Field(default=10, validation_alias="AGENDA_BAND_DAYS_AFTER")
    # Traces d'un jour passé : nombre d'activités distinctes, PLAFONNÉ. Comptage grossier et
    # généreux — surtout pas une durée, surtout pas un score (§7, point ouvert n°3 tranché ici).
    agenda_traces_cap: int = Field(default=3, validation_alias="AGENDA_TRACES_CAP")
    # « Ce qui arrive » (§6) : contrôles et rendus seulement, horizon court, liste bornée — la
    # section ne grossit jamais, quel qu'en soit le nombre réel.
    agenda_upcoming_horizon_days: int = Field(
        default=21, validation_alias="AGENDA_UPCOMING_HORIZON_DAYS"
    )
    agenda_upcoming_max: int = Field(default=4, validation_alias="AGENDA_UPCOMING_MAX")

    # --- Chat ZETIS mémoire (ADR-0026) : le verbatim est ÉPHÉMÈRE PAR CONSTRUCTION. ---
    # M1 (les messages du tour) vit dans Redis, JAMAIS en PostgreSQL/MinIO : la confidentialité
    # n'est pas une politique, c'est une impossibilité structurelle (§1). TTL glissant, rafraîchi
    # à chaque tour, purge explicite à la clôture. Constantes VERSIONNÉES (comme le scoring de
    # mission) : tout changement de comportement mémoire = bump tracé.
    chat_session_ttl_minutes: int = Field(
        default=120, validation_alias="CHAT_SESSION_TTL_MINUTES"
    )
    # Anti-spam (§Points ouverts 3) : plafond de tours par session (clé Redis dédiée). Au-delà,
    # 429 — un chat n'est pas un puits sans fond, et le moteur local a un coût.
    chat_max_turns_per_session: int = Field(
        default=40, validation_alias="CHAT_MAX_TURNS_PER_SESSION"
    )
    # Budget de contexte injecté par tour (§6) : borné pour que la sélection d'évidence reste
    # ciblée. Estimé en tokens (~4 caractères/token) ; le contexte composé est tronqué à ce budget.
    chat_context_token_budget: int = Field(
        default=300, validation_alias="CHAT_CONTEXT_TOKEN_BUDGET"
    )
    # Résolution question libre → skill_id (§6, module partagé) : seuil de confiance cosinus
    # en-deçà duquel on N'ANCRE PAS (best-effort — pas de `chat_topic`, pas de contexte ciblé,
    # jamais un mauvais ancrage). Versionné : c'est le curseur qualité de la mémoire.
    #
    # Relevé 0.55 → 0.72 le 2026-07-30 après un test live : `nomic-embed-text` donne ~0.68 à des
    # requêtes SANS RAPPORT partageant seulement la langue/le domaine (« verbe être en espagnol » →
    # « Registre de langue » 0.68 ; « conjugaison espagnol » → « Contre-exemple » 0.68), pendant que
    # les vrais matchs sont à 0.83+. La MARGE top-1/top-2 ne sépare pas (un cluster de notions
    # proches l'aplatit) ; seul le score absolu le fait. 0.72 rejette les faux positifs (≤ 0.684) et
    # garde les vrais (≥ 0.839). Doctrine du module : mieux vaut « je ne le trouve pas » qu'un
    # mauvais ancrage — un faux positif MONTRE du contenu erroné avec aplomb (bien pire).
    chat_skill_resolution_min_score: float = Field(
        default=0.72, validation_alias="CHAT_SKILL_RESOLUTION_MIN_SCORE"
    )
    # Fenêtre du « rappel » d'ouverture (§2) : notions récentes de chat rappelées en début de
    # session. Rappel, JAMAIS relance (§4) — aucune notification, uniquement dans une session
    # que Massimo a ouverte.
    chat_recall_window_days: int = Field(default=7, validation_alias="CHAT_RECALL_WINDOW_DAYS")

    # --- Activité (journal `learning_events`) : les SESSIONS NE SONT PAS STOCKÉES, elles sont
    # reconstruites à la lecture (event sourcing : le journal est la vérité brute, la session une
    # projection). Changer une constante recalcule tout l'historique — aucune migration, pas de
    # table `sessions`. Versionnées comme `MISSION_SCORING_VERSION` : tout changement = bump. ---
    activity_projection_version: str = Field(
        default="v1", validation_alias="ACTIVITY_PROJECTION_VERSION"
    )
    # Coupure de session : deux événements espacés de PLUS que ce seuil ouvrent une session.
    session_gap_minutes: int = Field(default=15, validation_alias="SESSION_GAP_MINUTES")
    # Temps actif = somme des écarts entre événements, chaque écart PLAFONNÉ à cette valeur.
    # Heuristique de PRÉSENCE assumée, pas une mesure d'attention (l'UI l'explicite).
    active_gap_cap_minutes: int = Field(default=5, validation_alias="ACTIVE_GAP_CAP_MINUTES")
    # Bucketing par jour et par semaine côté Papa ; `created_at` reste stocké en UTC.
    activity_timezone: str = Field(default="Europe/Paris", validation_alias="ACTIVITY_TIMEZONE")
    # Bornes serveur des lectures parent (le client ne choisit pas l'ampleur d'un scan).
    activity_max_weeks: int = Field(default=53, validation_alias="ACTIVITY_MAX_WEEKS")
    activity_max_range_days: int = Field(default=366, validation_alias="ACTIVITY_MAX_RANGE_DAYS")
    # Longueur maximale d'une route de télémétrie (borne d'écriture client).
    telemetry_route_max_length: int = Field(
        default=200, validation_alias="TELEMETRY_ROUTE_MAX_LENGTH"
    )

    # --- Demandes de contenu depuis une surface élève (addendum ADR-0027) ---
    # Plafond de types de contenu demandables en UN appel. v1 = 7 = la panoplie entière, pour que
    # « demander tout ce qui manque » tienne en une requête sans jamais devenir un robinet : au-delà
    # de la panoplie, il n'y a rien de plus à demander sur une notion.
    content_request_max_kinds: int = Field(
        default=7, validation_alias="CONTENT_REQUEST_MAX_KINDS"
    )

    # --- RAG (Étape 11) : embeddings locaux + récupération sémantique pgvector ---
    # Découplé de `llm_provider` : les embeddings restent sur ollama même si la
    # génération passe sur MLX (évite toute migration pgvector). Cf. ADR-0008.
    embed_provider: str = Field(default="ollama", validation_alias="EMBED_PROVIDER")
    ollama_embed_model: str = Field(
        default="nomic-embed-text", validation_alias="OLLAMA_EMBED_MODEL"
    )
    embed_dim: int = Field(default=768, validation_alias="EMBED_DIM")
    rag_top_k: int = Field(default=3, validation_alias="RAG_TOP_K")

    # --- TTS (voix des capsules) : Piper local. Le binaire `piper` doit être sur le PATH
    # et `piper_voice_model` pointer un modèle FR (.onnx). Cf. ADR-0007 (narration). ---
    tts_provider: str = Field(default="piper", validation_alias="TTS_PROVIDER")
    # 'macos' : voix `say` (dev local Mac). Ex. "Jacques", "Amelie", ou une voix « Premium »
    # téléchargée dans Réglages Système (neurale, chaleureuse). `say_rate` = débit posé.
    say_voice: str = Field(default="Jacques", validation_alias="TTS_SAY_VOICE")
    say_rate: int = Field(default=165, validation_alias="TTS_SAY_RATE")
    piper_binary: str = Field(default="piper", validation_alias="PIPER_BINARY")
    piper_voice_model: str = Field(
        default="storage/models/piper/fr_FR-siwis-medium.onnx",
        validation_alias="PIPER_VOICE_MODEL",
    )
    # Piper : ralentit un peu la diction pour un ton plus rassurant (1.0 = normal).
    piper_length_scale: float = Field(default=1.1, validation_alias="PIPER_LENGTH_SCALE")
    # Index de locuteur pour un modèle Piper multi-voix (ex. upmc : pierre=1). None = mono-voix.
    piper_speaker: int | None = Field(default=None, validation_alias="PIPER_SPEAKER")
    audio_storage_dir: str = Field(
        default="storage/generated", validation_alias="AUDIO_STORAGE_DIR"
    )

    # --- STT (dictée ELI5, ADR-0012) : Whisper LOCAL via faster-whisper. 100 % local,
    # aucun tiers (vie privée de Massimo). Dépendance optionnelle `[stt]` : sans elle,
    # l'endpoint /transcribe répond 503 et le frontend masque le micro. ---
    stt_provider: str = Field(default="faster-whisper", validation_alias="STT_PROVIDER")
    # 'small' = rapide sur CPU/Apple Silicon (défaut), déjà bon en français. Pour plus de
    # précision (plus lent) : 'medium' (bon compromis) ou 'large-v3' (max, ~3 Go).
    whisper_model: str = Field(default="small", validation_alias="WHISPER_MODEL")
    whisper_device: str = Field(default="cpu", validation_alias="WHISPER_DEVICE")
    # int8 = rapide/léger. Pour grappiller un peu de précision : 'int8_float16' ou 'float32'
    # (plus lent, plus de RAM). Le levier dominant reste la taille du modèle ci-dessus.
    whisper_compute_type: str = Field(
        default="int8", validation_alias="WHISPER_COMPUTE_TYPE"
    )

    # --- Stockage objet des vidéos de capsule (Lot 2) : 'disk' (fallback dev) | 'minio'. ---
    # L'audio reste sur disque ; seul le MP4 rendu passe par ce backend.
    storage_backend: str = Field(default="disk", validation_alias="STORAGE_BACKEND")
    minio_endpoint: str = Field(default="localhost:9000", validation_alias="MINIO_ENDPOINT")
    minio_access_key: str = Field(default="zetis_minio", validation_alias="MINIO_ROOT_USER")
    minio_secret_key: str = Field(
        default="zetis_minio_password", validation_alias="MINIO_ROOT_PASSWORD"
    )
    minio_secure: bool = Field(default=False, validation_alias="MINIO_SECURE")
    minio_bucket_capsules: str = Field(
        default="capsules", validation_alias="MINIO_BUCKET_CAPSULES"
    )

    # --- File de rendu asynchrone des capsules (Lot 2) : RQ sur Redis, hors backend. ---
    redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")
    render_queue: str = Field(default="media", validation_alias="RENDER_QUEUE")

    # --- Production en lot (ADR-0031 §3-§5) : file DÉDIÉE, distincte de `media`. ---
    # Un rendu vidéo bloqué ne doit pas retarder une production, et l'inverse.
    production_queue: str = Field(default="production", validation_alias="PRODUCTION_QUEUE")
    # Un chapitre = jusqu'à ~15 pièces générées par LLM local. Large, mais borné : au-delà, le
    # job est tué plutôt que de tenir la file indéfiniment.
    production_job_timeout: int = Field(
        default=3600, validation_alias="PRODUCTION_JOB_TIMEOUT"
    )
    # Régulateur du PALIER 2 (ADR-0031 §5) : au-delà de N objets en attente de relecture, la
    # production refuse de démarrer. Une production qui dépasse durablement la capacité de
    # relecture fabrique une dette qui tue le dispositif.
    production_max_pending: int = Field(
        default=30, validation_alias="PRODUCTION_MAX_PENDING"
    )
    # « Massimo passe devant » : s'il a une activité plus récente que ça, le worker attend —
    # ENTRE deux notions, jamais pendant (un appel LLM n'est pas préemptible).
    production_pause_if_active_minutes: int = Field(
        default=5, validation_alias="PRODUCTION_PAUSE_IF_ACTIVE_MINUTES"
    )
    # Borne de l'attente ci-dessus : au-delà, le lot reprend malgré tout. Sans elle, une session
    # longue de Massimo laisserait un run « running » indéfiniment.
    production_max_wait_minutes: int = Field(
        default=30, validation_alias="PRODUCTION_MAX_WAIT_MINUTES"
    )
    # Battement de cœur (ADR-0034 §2) : un lot `running` muet depuis plus longtemps que ça est
    # considéré comme mort. Le seuil doit dépasser LARGEMENT l'attente maximale ci-dessus, sinon
    # un lot qui attend Massimo se ferait déclarer zombie alors qu'il fait exactement son travail.
    production_heartbeat_timeout_minutes: int = Field(
        default=90, validation_alias="PRODUCTION_HEARTBEAT_TIMEOUT_MINUTES"
    )

    # --- Déclencheur automatique (ADR-0035) ---------------------------------------------------
    # Le régulateur de VOLUME, qui devient obligatoire dès qu'un lot peut partir sans clic. Il ne
    # remplace pas `production_max_pending` : celui-là borne l'arriéré de relecture (et reste à
    # zéro au palier 3, où plus rien n'est `pending`), celui-ci borne ce qui est PRODUIT.
    #
    # ⚠️ Calibrage ASSUMÉ et révisable, tiré de la seule mesure réelle disponible : 69 s par
    # notion (chapitre « Fractions », 11 notions en 12 min 35 s, 2026-08-02). Un chapitre dense de
    # 31 notions coûte ~36 min. Le défaut prudent fait rater des productions, jamais l'inverse.
    production_auto_max_runs: int = Field(
        default=2, validation_alias="PRODUCTION_AUTO_MAX_RUNS"
    )
    production_auto_window_days: int = Field(
        default=7, validation_alias="PRODUCTION_AUTO_WINDOW_DAYS"
    )
    # Fenêtre d'anticipation : une échéance plus lointaine ne déclenche pas. Produire trois
    # semaines à l'avance, c'est produire pour un programme qui aura changé.
    production_auto_lookahead_days: int = Field(
        default=7, validation_alias="PRODUCTION_AUTO_LOOKAHEAD_DAYS"
    )
    # Période du réveil du scan. Il ne PRODUIT rien : il regarde si le monde réel a demandé
    # quelque chose. C'est ce qui distingue ce scheduler de celui que `production_worker.py`
    # refusait — « tous les dimanches, produire » reste interdit.
    production_scan_interval_minutes: int = Field(
        default=180, validation_alias="PRODUCTION_SCAN_INTERVAL_MINUTES"
    )

    # --- Demandes de Massimo (ADR-0036 §5) ----------------------------------------------------
    # ⚠️ **Un compteur DISTINCT, et c'est une décision.** Le régulateur ci-dessus compte des LOTS,
    # pas du COÛT : un lot-pièce (une fiche, ~30 s) y pèserait autant qu'un lot-chapitre (~36 min).
    # Sous un plafond commun, **deux fiches demandées empêcheraient de préparer un contrôle**.
    #
    # Trois origines, trois natures : Papa clique (aucun régulateur — le geste EST le régulateur) ·
    # échéance (2/semaine, exogène) · demande de Massimo (endogène — il peut en poser dix un soir
    # d'ennui). Les mélanger ferait qu'un soir d'ennui prive son contrôle du jeudi.
    #
    # Calibrage initial : 10/semaine, plus haut que les lots d'échéance parce qu'une pièce coûte
    # deux ordres de grandeur de moins qu'un chapitre. **À réviser avec l'observation.**
    production_request_max_runs: int = Field(
        default=10, validation_alias="ZETIS_REQUEST_MAX_RUNS"
    )

    # Origines autorisées par CORS — frontends Massimo (5173) et Papa (5174) en local.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]

    # --- Auth (Étape 6) : JWT de développement + identifiants locaux ---
    # Les mots de passe en clair ne servent qu'au prototype local. Les vrais
    # utilisateurs (hashés, en base) arrivent à l'Étape 9.
    secret_key: str = "dev-secret-change-me-in-production-please-32b"
    access_token_expire_minutes: int = 720  # 12 h
    papa_username: str = "papa"
    papa_password: str = "papa1234"
    massimo_username: str = "massimo"
    massimo_password: str = "massimo1234"

    @property
    def dev_users(self) -> dict[str, dict[str, str]]:
        """Annuaire des utilisateurs de développement : username -> {password, role}."""
        return {
            self.papa_username: {"password": self.papa_password, "role": "papa"},
            self.massimo_username: {"password": self.massimo_password, "role": "massimo"},
        }


settings = Settings()
