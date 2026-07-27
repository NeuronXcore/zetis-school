# ADR-0008 — Moteur d'inférence LLM : Ollama vs MLX (décision guidée par benchmark)

## Statut

Accepté — 2026-07-02 (rejet de MLX sur données ; choix du modèle Ollama laissé à Papa)

> Complète la couche IA (`app/modules/ai`) sans remplacer d'ADR. Ne touche PAS aux embeddings
> RAG ni à `adr-0004-postgresql-pgvector` (dimension pgvector inchangée).

## Contexte

Besoin exprimé (Papa) : « plus de performance » pour l'IA de ZETIS, comprise comme **à la fois
plus rapide ET de meilleure qualité**. Question posée : faut-il passer à **MLX** (moteur
d'inférence Apple Silicon) et/ou changer de modèle LLM, et est-ce un gros refactor ?

État des lieux (M3 Max / 128 Go) :

- ZETIS est **déjà 100 % local et accéléré Metal** via **Ollama** : génération `qwen2.5:32b`
  (~19,9 Go), embeddings `nomic-embed-text` → 768 dims (pgvector, index ivfflat).
- La couche IA est **déjà découplée** : `Protocol` `LLMProvider` / `EmbeddingProvider`,
  sélection via `get_provider()` / `get_embedder()`, injection FastAPI. Aucun consommateur
  (ELI5, diagnostics, capsules, RAG) n'appelle un provider concret directement.
- Le backend tourne **nativement sur macOS** (uvicorn) → un serveur MLX local est joignable
  en HTTP sans contrainte Docker.

Constat clé : **ce n'est pas un gros refactor.** Le seul vrai coût serait de changer le modèle
d'**embeddings** (dimension ≠ 768 → migration Alembic + réindex ivfflat + ré-embed de tous les
chunks) — décision explicite de **ne pas** le faire.

Nuance : passer à MLX n'accélère pas « magiquement » — Ollama utilise déjà le GPU Metal. MLX est
souvent ~20–40 % plus rapide à modèle égal sur Apple Silicon, mais le plus gros levier de vitesse
reste le **choix du modèle** (14b ≪ 32b ≪ 72b). D'où une décision **guidée par des mesures**.

## Décision

1. **Découpler les embeddings de la génération.** Nouveau réglage `EMBED_PROVIDER` (défaut
   `ollama`) : `get_embedder()` ne dépend plus de `LLM_PROVIDER`. Basculer la génération sur MLX
   **ne casse pas** le RAG et n'implique **aucune migration pgvector**.

2. **Ajouter un provider MLX en HTTP pur.** `MLXProvider` (`app/modules/ai/mlx_provider.py`)
   implémente le `Protocol` `LLMProvider` et parle à `mlx_lm.server` (API OpenAI-compatible
   `/v1/chat/completions`). **Le backend n'importe aucun paquet `mlx`** : miroir exact du modèle
   HTTP d'`OllamaProvider` → le backend reste portable Linux et Ollama demeure le défaut/fallback.
   La sortie structurée est portée : `LLMRequest.fmt` (JSON Schema, Ollama) → `response_format`
   (`json_schema` ou `json_object`, OpenAI).

3. **Décider sur benchmark.** `scripts/bench_llm.py` mesure, sur les **vrais prompts ZETIS**
   (ELI5, diagnostic, capsule), pour chaque couple (moteur, modèle) : latence, tokens/s, et
   **taux de JSON valide** (validation `CapsuleSpec` / questions de diagnostic), plus des
   échantillons de sortie pour un **jugement qualité humain** (Papa). Le choix final (moteur +
   modèle) est arbitré par ces chiffres — pas à l'aveugle.

   **Point de bascule** : si Ollama + un modèle mieux choisi suffit → simple changement
   `OLLAMA_MODEL` (zéro code). Si MLX gagne nettement → `LLM_PROVIDER=mlx` + `MLX_MODEL`.

## Conséquences

**Positives**
- Bascule moteur/modèle par simple variable d'environnement, réversible, sans refactor.
- RAG intact (embeddings toujours Ollama/768) → zéro migration DB.
- Décision documentée par des mesures reproductibles sur la charge réelle.

**Coûts / risques**
- `mlx_lm.server` peut offrir une contrainte JSON-Schema moins stricte qu'Ollama `fmt` : fallback
  = mode JSON + la boucle de réparation 1× déjà présente côté capsules ; le bench mesure le taux
  de JSON valide pour trancher.
- MLX = Apple Silicon uniquement. Un éventuel déploiement Linux/prod garderait Ollama (défaut).
- Un très gros modèle (72b) améliore la qualité mais réduit la vitesse → arbitrage tranché par le
  benchmark selon l'objectif « les deux ».

## Résultats du benchmark

Exécuté le 2026-07-02 sur M3 Max / 128 Go, `scripts/bench_llm.py --repeats 3`, sur les 3 tâches
réelles (eli5 / diagnostic / capsule). Latence & tok/s = **médiane** ; JSON valide = capsule
validée par `CapsuleSpec` + questions de diagnostic parsées.

| Moteur | Modèle | eli5 (s) | diagnostic (s) | capsule (s) | tok/s méd. | JSON valide |
|---|---|---|---|---|---|---|
| ollama | qwen2.5:32b (actuel) | 15,9 | 15,3 | 38,4 | ~15 | 9/9 ✅ |
| **ollama** | **qwen2.5:14b** | **8,3** | **7,1** | **16,2** | **~33** | **9/9 ✅** |
| mlx | Qwen2.5-14B-Instruct-4bit | 10,0 | 9,0 | 25,2 | ~26 | 9/9 ✅ |
| mlx | Qwen2.5-32B-Instruct-4bit | — | — | — | — | non complété¹ |

¹ Téléchargement HF du 32b-4bit throttlé/interrompu de façon répétée (requêtes non authentifiées).
Non bloquant pour la décision : au 14b, MLX est **plus lent** qu'Ollama sur les 3 tâches → aucune
raison d'attendre un avantage MLX au 32b. À retester avec un `HF_TOKEN` si l'on veut le confirmer.

### Conclusions

1. **MLX n'apporte pas de gain de vitesse sur ce Mac.** MLX 14b est plus lent qu'Ollama 14b sur
   les 3 tâches (eli5 10,0 vs 8,3 s ; capsule 25,2 vs 16,2 s). Ollama est déjà Metal-accéléré et
   mieux optimisé ici (prompt caching, warm model). → **On garde Ollama**, on n'adopte pas MLX.
2. **Le vrai levier de vitesse = le modèle.** Ollama `qwen2.5:14b` est **~2,3× plus rapide** que
   `:32b` (capsule 38 → 16 s ; eli5 16 → 8 s), avec une **validité JSON identique (100 %)**.
3. **Qualité 14b vs 32b : proche.** Sur les échantillons ELI5, le 32b est marginalement plus
   précis sur les nuances ; le 14b reste pédagogiquement correct et bienveillant. Arbitrage final
   (réactivité vs finesse) laissé à Papa sur pièces (échantillons du bench).
4. **Bug corrigé grâce au bench** : `mlx_lm.server` plafonne à 512 tokens par défaut → tronquait
   la capsule (JSON invalide). `MLXProvider` fixe désormais `max_tokens` (défaut 4096).

### Décision retenue

- **Rejeter MLX** (garder `LLM_PROVIDER=ollama` par défaut). Le `MLXProvider` reste câblé et testé
  pour un usage futur/autre machine, sans être activé.
- **Modèle : Papa choisit de garder `qwen2.5:32b`** (précision pédagogique privilégiée sur la
  vitesse). Défaut de config inchangé. Le passage à `qwen2.5:14b` reste disponible à tout moment
  via une seule variable (`OLLAMA_MODEL=qwen2.5:14b`) si la réactivité devient prioritaire —
  bénéfice mesuré : ~2,3× plus rapide, validité JSON identique.

### Comment exécuter le benchmark (phase 1, vitesse)

```bash
ollama pull qwen2.5:14b            # (qwen2.5:32b déjà présent)
apps/backend/.venv/bin/python scripts/bench_llm.py \
    --ollama-models qwen2.5:14b qwen2.5:32b \
    --repeats 3 --out scratchpad/bench_llm.md
```

---

## Addendum — Comparaison QUALITÉ (phase 2, 2026-07-02)

Papa a ensuite tranché : **la qualité prime sur la vitesse**. On compare donc des modèles **locaux
haut de gamme** entre eux et à une **référence cloud** (Claude + GPT). Le cloud est un **yardstick de
benchmark uniquement** (prompts génériques, aucune donnée réelle de Massimo) — **la production reste
100 % locale** ; aucun provider cloud n'est ajouté au backend. Pas d'ADR vie privée requis.

Candidats locaux : `qwen2.5:72b` (référence sûre, même famille que le 32b → prompts/JSON fiables sans
retouche), `llama3.3:70b`, `mistral-large` (familles ≠ → vérifier taux de JSON valide + bienveillance FR).

### Résultats qualité

| Moteur | Modèle | JSON valide | Vitesse (eli5 / capsule) | Qualité (observée) |
|---|---|---|---|---|
| ollama | qwen2.5:32b (actuel) | 9/9 ✅ | ~18 s / ~38 s | Bon, calibré 12 ans (référence) |
| ollama | qwen2.5:72b | 9/9 ✅ | ~46 s / ~93 s | ELI5 très riche (dette, thermomètre) ; capsule parfois trop technique (« cathètes ») ; **même famille → 0 risque prompt** |
| ollama | **llama3.3:70b** | 9/9 ✅ | ~44 s / ~78 s | ELI5 clair (distance à zéro) ; **capsule bien calibrée** (évite « cathètes ») ; **le + rapide des gros** ; famille ≠ (mesuré OK) |
| ollama | mistral-large (123B) | 9/9 ✅ | ~77 s / ~171 s | ELI5 riche (droite + échelle + dette) ; capsule bien calibrée ; **beaucoup trop lent** (~3 min/capsule), sans avantage qualité net |
| ollama | **qwen3.6:35b-a3b** (MoE) | 9/9 ✅¹ | **~5,6 s / ~11 s** | Qualité ≈ 72b (ELI5 riche : dette, temp.) ; capsule « cathètes » comme 72b ; **le + rapide de tous** (~8× le 72b). ⚡ **Meilleur rapport qualité/vitesse** |
| openai | gpt-4o (réf. cloud) | 9/9 ✅ | ~2 s / ~3,4 s | Correct mais **concis/sec** (json_object) — moins riche que le local |
| anthropic | claude-sonnet-5 (réf. cloud) | 9/9 ✅ | ~8 s / ~7 s | **Riche et créatif** (ascenseur/parking) ≈ qwen3.6 ; raisonnement étendu activé |

**Comparaison cloud (2026-07-02, prompts génériques)** : sur ELI5, **le local `qwen3.6:35b-a3b` égale
Claude Sonnet 5 en richesse pédagogique (analogies variées : dette + thermomètre) et dépasse GPT-4o**
(plus sec/textbook). Les 3 rendent 9/9 JSON valide. **Conclusion : aucun gain de qualité à passer au
cloud** pour les tâches ZETIS → la décision de rester 100 % local (qwen3.6) est confirmée ET validée
par la référence cloud, avec le bénéfice vie privée (données de Massimo jamais envoyées à un tiers).
Notes d'intégration bench : Sonnet 5 déprécie `temperature` et renvoie un bloc `thinking` + du JSON
entouré de balises ``` → le harnais extrait les blocs `text` et retire les balises (`_unfence`).

¹ **Qwen3 « thinking » (important)** : par défaut, le JSON part dans le champ `thinking` d'ollama et
`response` est **vide** → sortie invalide. Il faut passer **`think: false`** dans la requête ollama.
Le bench le fait automatiquement pour tout modèle `qwen3*`. **En production, `OllamaProvider` devrait
faire de même** si un modèle Qwen3 est adopté (petit ajout ciblé). `think:false` = réponse directe sans
raisonnement visible ; suffisant et excellent ici. (Activer le thinking = qualité potentiellement encore
meilleure mais + lent et parsing du champ `thinking` requis — levier futur.)

**Lecture (2026-07-02)** : les **5 modèles rendent 9/9 JSON valide** (prompts robustes multi-familles).
Découverte majeure : **`qwen3.6:35b-a3b` (MoE, ~3B actifs)** offre une **qualité ≈ 72b à la vitesse la
plus rapide de tous** (ELI5 ~5,6 s vs 46 s ; capsule ~11 s vs 93 s) → il **casse le compromis
qualité/vitesse**. `mistral-large` écarté (trop lent). Reco : **`qwen3.6:35b-a3b`** comme meilleur choix
global ; alternatives « dense » = `qwen2.5:72b` (même famille, 0 risque) ou `llama3.3:70b`. Adoption du
MoE = `OLLAMA_MODEL=qwen3.6:35b-a3b` **+** `think:false` dans `OllamaProvider`. Réf. cloud encore à
faire (clé requise).

### Décision finale (2026-07-02) — ADOPTÉ

**Papa adopte `qwen3.6:35b-a3b`** comme modèle de génération ZETIS. Livré :
- `OLLAMA_MODEL` par défaut = `qwen3.6:35b-a3b` (`core/config.py` + `.env.example`).
- `OllamaProvider` passe `think:false` automatiquement pour tout modèle `qwen3*` (sinon `response`
  vide) — testé (`test_ollama_provider.py`).
- **Vérifié en réel** via le vrai code backend : ELI5 JSON valide (~1,8 s) ; capsule (vrai
  `build_prompt`) **3/3 CapsuleSpec valide** (fps=30, 1280×720, ~7,7 s). 98 tests verts.

Reste optionnel : comparaison cloud (Claude+GPT) quand une clé sera fournie ; envisager le mode
« thinking » activé comme levier qualité futur (au prix de latence + parsing du champ `thinking`).

### Comment exécuter (phase 2, qualité)

```bash
# Local (séquencé — téléchargements lourds)
ollama pull qwen2.5:72b            # ~47 Go
apps/backend/.venv/bin/python scripts/bench_llm.py \
    --ollama-models qwen2.5:32b qwen2.5:72b --repeats 3 --out scratchpad/bench_quality.md
# puis, optionnel :
ollama pull llama3.3:70b ; ollama pull mistral-large

# Cloud (référence qualité — nécessite une clé ; prompts génériques uniquement)
# Clés lues depuis le `.env` racine (git-ignoré) par défaut : y coller
#   OPENAI_API_KEY=...  et/ou  ANTHROPIC_API_KEY=...
# (ou --env-file <chemin>, ou export shell). Cf. .env.example.
apps/backend/.venv/bin/python scripts/bench_llm.py \
    --ollama-models qwen3.6:35b-a3b \
    --openai-models gpt-4o --anthropic-models claude-sonnet-5 \
    --repeats 3 --out scratchpad/bench_quality_cloud.md
```
