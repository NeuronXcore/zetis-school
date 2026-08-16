---
id: "0012"
titre: "STT (dictée) via Whisper local pour ELI5"
type: mesure
statut: accepte
date: 2026-07-04
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0008", "0009"]
---
# ADR-0012 — STT (dictée) via Whisper local pour ELI5

- Statut : Accepté
- Date : 2026-07-04
- Contexte produit : page ELI5 Massimo — « soit il écrit, soit il parle »

## Contexte

La page ELI5 demande à Massimo de **reformuler** une notion avec ses mots (étape
« reverse »). Jusqu'ici, la seule entrée est le clavier (`input_mode: "text"`). On
veut permettre à l'enfant de **dicter** son explication au micro — plus naturel,
surtout pour un enfant qui verbalise mieux qu'il n'écrit.

La spec ELI5 prévoyait le STT en **Phase 9** avec Whisper local (bouton « 🎤 Parler »
en « bientôt »). Cet ADR active cette brique pour ELI5.

## Décision

**STT 100 % local via [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper)**
(CTranslate2), français, exposé par un endpoint synchrone dédié à ELI5.

Points clés :

1. **Zéro tiers — vie privée de Massimo.** L'explication dictée est une production
   pédagogique privée de l'enfant. L'API vocale du navigateur (`webkitSpeechRecognition`)
   enverrait l'audio à un service tiers (Google) : **exclue**. On reste sur la ligne
   de l'ADR-0008 (« tâches pédagogiques quotidiennes = 100 % local ») et de la règle
   `CLAUDE.md` (« les données de Massimo ne doivent pas être envoyées à des tiers »).
   Le modèle Whisper est téléchargé **une fois** puis mis en cache ; l'inférence
   n'appelle **aucun** service externe.

2. **Moteur : `faster-whisper`** plutôt que `openai-whisper`/`transformers+torch` :
   rapide sur CPU / Apple Silicon, **sans dépendance torch**, décodage des conteneurs
   audio (WebM/Opus, MP4, WAV) via PyAV embarqué. Modèle par défaut **`small`**
   (rapide, déjà bon en français), réglable via `ZETIS_WHISPER_MODEL`. `device=cpu`,
   `compute_type=int8` par défaut.
   - **Vitesse d'abord** : CTranslate2 tourne en **CPU** sur Apple Silicon (pas de Metal).
     `small` garde la dictée réactive. Pour plus de précision (plus lent), basculer sur
     `medium` (bon compromis) ou `large-v3` (max, ~3 Go) via l'env var, sans changer de code.

3. **Endpoint synchrone**, calqué sur le pattern ELI5 existant :
   `POST /api/ai/eli5/transcribe` (multipart `file`) → `{ transcript, duration_seconds }`.
   La transcription **remplit le même textarea** puis part en `reverse-evaluate`
   (`input_mode: "text"`) — le backend d'évaluation **ne change pas**. Trace obligatoire
   dans `ai_jobs` (`job_type="eli5_transcribe"`), comme toute tâche IA (`CLAUDE.md`).

4. **Dépendance optionnelle + dégradation propre.** `faster-whisper` vit dans un extra
   `[stt]` du `pyproject`. Sans le paquet (ou modèle introuvable), l'endpoint répond
   **503** et le frontend **masque le micro** (repli « bientôt » / clavier seul) —
   même esprit que la dérogation Anthropic « sans clé, erreur explicite, pas de bascule
   silencieuse » (ADR-0009).

## Alternatives écartées

- **Web Speech API navigateur** — rapide, zéro backend, mais **envoie l'audio de
  l'enfant à un tiers** : rédhibitoire (vie privée). C'est la raison d'être de cet ADR.
- **`openai-whisper` (torch)** — lourd (torch), plus lent sur CPU. `faster-whisper`
  donne une qualité équivalente pour une empreinte bien moindre.
- **Job asynchrone (RQ/worker-ai)** — inutile ici : une dictée ELI5 (< ~30 s) se
  transcrit en quelques secondes en synchrone, cohérent avec `explain`/`reverse`.
  Réservé si la durée devenait un problème (addendum futur).

## Conséquences

- Nouveau module `app/modules/stt/` (provider abstrait + `FasterWhisperProvider`),
  `get_stt()` (dépendance FastAPI), settings `STT_PROVIDER`/`WHISPER_MODEL`/
  `WHISPER_DEVICE`/`WHISPER_COMPUTE_TYPE`.
- Frontend Massimo : le bouton « 🎤 Parler » d'ELI5 devient actif (capture
  `MediaRecorder` → `POST /transcribe` → textarea). TTS et STT restent découplés.
- Installation one-time côté dev/prod : `pip install -e '.[stt]'` puis 1er
  téléchargement du modèle (`small`). Tests hermétiques via `FakeSttProvider`.
- N'introduit aucune donnée durable côté front ; la trace `ai_jobs` ne stocke pas
  l'audio brut (seulement métadonnées + transcription).
