---
id: "0006"
titre: "Extension navigateur `zetis-clip` (capture de sources RAG, côté Papa)"
type: surface
statut: accepte
date: 2026-07-01
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0006 — Extension navigateur `zetis-clip` (capture de sources RAG, côté Papa)

## Statut

Accepté — 2026-07-01

## Contexte

Le pipeline RAG de ZETIS est opérationnel depuis les étapes 11–12 : ingestion (`ingest_document`), chunking, embeddings pgvector, recherche cosinus, et validation manuelle des sources par Papa (page « Sources de cours », `validate`/`reject`). Aujourd'hui, alimenter le RAG suppose de copier-coller du texte ou d'uploader un fichier via l'interface Papa.

Papa a besoin d'un moyen rapide de **capturer du contenu pédagogique depuis le web** (pages de cours, sélections de texte, PDF ouverts dans l'onglet) et de l'envoyer directement à ZETIS, classé par matière/chapitre, sans quitter sa navigation.

Contraintes du projet à respecter :

- Aucune source ne doit alimenter l'IA de l'enfant sans relecture humaine (`CLAUDE.md`).
- Séparation stricte Massimo / Papa : cette capacité est réservée à Papa (parent/admin), comme `/api/rag/upload`.
- Sobriété : ne pas réinventer le pipeline RAG, ne pas ajouter de framework lourd sans justification (`TECH_STACK.md`, `CLAUDE.md`).
- Les données de Massimo et l'accès parent doivent rester protégés (`SECURITY.md`).

## Décision

Créer une nouvelle application `apps/extension-zetis-clip` : une **extension navigateur Manifest V3** qui agit comme **client de capture** du pipeline RAG existant, sans nouvelle brique de traitement.

**Stack** : Vite + `@crxjs/vite-plugin`, TypeScript strict, Tailwind v4. Réutilisation en source TS de `@zetis/auth` (client API + token) et `@zetis/ui` (primitives), à l'identique des frontends.

**Périmètre initial (Lot 1)** : page web, sélection de texte, PDF de l'onglet. Reportés : transcript vidéo, OCR image, audio, file d'attente offline, import multi-onglets.

**Extraction** :

- HTML → texte **côté client** (Mozilla Readability), pour gérer les pages JS-rendu / authentifiées **et** éviter que le backend aille fetch des URL arbitraires (surface SSRF).
- PDF → **côté serveur** (pypdf déjà présent), via l'upload de fichier existant.

**Ingestion — tout arrive en `pending`** :

- Texte (page + sélection) → nouvel endpoint mince `POST /api/rag/clip` appelant `ingest_document(validation_status="pending")` (fonction existante, étape 12). Aucun second pipeline.
- PDF → réutilise `POST /api/rag/upload` (déjà `pending`). Zéro ajout backend.
- La validation reste sur la page Papa « Sources de cours » déjà en place. Le contrat de `POST /api/rag/documents` (= `validated`, seed de confiance) n'est pas modifié.

**Taxonomie** : le popup charge `GET /subjects` et `GET /subjects/{id}/chapters`. « Thème » n'étant pas une entité du modèle, il est replié dans le champ libre `chapter` — aucune table ni migration ajoutée.

**Sécurité** :

- Token JWT dans `chrome.storage.local` (jamais `localStorage`).
- `host_permissions` du manifeste vers l'URL backend → pas de modification du CORS backend.
- Endpoint `/api/rag/clip` protégé par le rôle parent/admin, comme `/upload`.

## Conséquences

### Positives

- Alimentation du RAG nettement plus rapide pour Papa, sans changer le modèle de données.
- Risque technique faible : on ajoute un client à une API stable, pas de logique cœur.
- Sécurité préservée : capture web toujours en `pending`, extraction côté client (anti-SSRF), Papa-only.
- Cohérent avec le local-first et la frontière Massimo/Papa.

### Négatives / coûts

- Nouvelle dépendance `@crxjs/vite-plugin` et une nouvelle cible de build (extension MV3) à maintenir.
- Dépendance à Readability pour la qualité d'extraction HTML (variable selon les sites).
- Une légère dette à lever : confirmer/créer `GET /subjects` (lecture seule) s'il n'est pas encore implémenté.

### Suivi

- Implémentation : étape 19 (Lot 1), `feat(zetis-clip): Papa browser extension …`.
- Étape 20+ : transcript vidéo (`youtube-transcript-api`), OCR (Tesseract.js), audio (Whisper), envoi différé hors-ligne.

---

## Addendum — étape 20 (Lot 2 : transcription vidéo)

**Statut** : Accepté — 2026-07-01.

**Contexte** : le Lot 1 a choisi l'extraction **côté client** précisément pour que le
backend ne fetch jamais d'URL arbitraire (surface SSRF). Le Lot 2 importe des
transcriptions vidéo, ce qui est bien plus fiable côté serveur (`youtube-transcript-api`)
que via un scrape DOM fragile. Cela **réintroduit un fetch sortant côté serveur** — une
exception à la décision du Lot 1.

**Décision (exception bornée)** :

- Nouvel endpoint `POST /api/rag/clip-url` (Papa-only, comme `/upload` et `/clip`).
- Le fetch sortant est **borné par une allowlist d'hôtes** : `youtube.com`,
  `www.youtube.com`, `youtu.be`. L'URL est **validée/normalisée avant tout appel réseau**
  (`transcript.validate_video_url`) : schéma http(s) obligatoire, rejet des IP littérales
  et de tout hôte hors allowlist, extraction bornée de l'identifiant vidéo.
- **Architecture hybride** : primaire = serveur ; **repli = client** — si le serveur
  renvoie `transcript_unavailable`, le content script scrape le panneau « Transcription »
  de l'onglet actif (via `activeTab`, sur action utilisateur) et envoie le texte au
  `POST /api/rag/clip` existant. Pas de nouvel endpoint pour le repli.
- Ingestion toujours en **`pending`** (`source_type = video_transcript`) ; contrats de
  `/rag/documents` et `/rag/clip` inchangés ; `clip-url` est purement additif.
- **Langue conservée** : transcription humaine préférée à l'auto-générée ; jamais de
  traduction automatique ; langue d'origine tracée dans le contenu (pas de migration).
- **Nouvelle dépendance backend** : `youtube-transcript-api` (import paresseux ; le
  récupérateur est abstrait derrière `TranscriptFetcher`, mockable pour les tests offline).

**Conséquences** :

- Positif : import vidéo fiable, surface SSRF réduite à une allowlist explicite et
  validée, repli robuste quand la plateforme ne fournit pas de transcription API.
- Coût : une exception au principe « zéro fetch serveur » du Lot 1, strictement bornée et
  documentée ici ; une dépendance de plus.
- Reporté (étapes 21+) : OCR image, audio/podcast (Whisper), file d'attente offline,
  import multi-onglets, autres plateformes vidéo (Vimeo, etc.).
