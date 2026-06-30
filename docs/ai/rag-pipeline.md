# IA — RAG Pipeline

## Objectif

Permettre à ZETIS de répondre à partir de documents validés : programmes, cours, fiches, documents importés.

## Pipeline

```txt
Upload document
  ↓
Extract text
  ↓
Clean text
  ↓
Split into chunks
  ↓
Attach metadata
  ↓
Generate embeddings
  ↓
Store in pgvector
  ↓
Retrieve by query
  ↓
Generate answer with citations
```

## Métadonnées obligatoires

- source type ;
- matière ;
- niveau ;
- chapitre ;
- notion ;
- statut validation ;
- date import ;
- propriétaire ;
- page si PDF.

## Types de sources

- official ;
- parent_upload ;
- school_document ;
- ai_generated ;
- student_output.

## Règle programmes officiels

Ne pas figer les programmes dans le code. Prévoir un import depuis sources vérifiées, puis validation Papa.

## Recherche

La recherche doit filtrer par :

- matière ;
- niveau ;
- statut validé ;
- type de document.

## Réponse

Une réponse RAG doit contenir :

- réponse enfant ;
- sources internes ;
- confiance ;
- points à vérifier ;
- suggestion d’exercice.

## État d'implémentation (2026-06-30)

Implémenté (Étapes 11–12) :

- **Stockage** : `rag_documents` / `rag_chunks` (`vector(768)`) + index ivfflat cosinus
  (migration `a1b2c3d4e5f6`).
- **Embeddings** : `OllamaEmbeddingProvider` (`/api/embed`, `nomic-embed-text`, 768d).
- **Ingestion texte** : `POST /api/rag/documents` (JSON) → statut `validated`.
- **Ingestion fichiers** : `POST /api/rag/upload` (MD/TXT/PDF via `extract.py`/pypdf) →
  statut **`pending`** ; extraction → chunking → embedding.
- **Validation Papa** : `POST /api/rag/documents/{id}/validate|reject` (synchronise le
  statut du document et de ses chunks) ; UI Papa « Sources de cours ».
- **Récupération** : `search` (top-k cosinus, filtre matière) ; seuls les chunks
  `validated`/`official` sont renvoyés ; `retrieve_for_skill` injecte le contexte dans ELI5 `explain`.
- **Visibilité enfant** (Étape 13) : `explain` expose `sources_used` (nb de passages
  injectés) dans `output_json` → badge « 📚 D'après ton cours » côté Massimo.

Reporté : génération de réponse sourcée dédiée (`/rag/answer`), `confiance`/citations,
stockage du fichier brut (MinIO), sources `student_output`, import des programmes officiels.
