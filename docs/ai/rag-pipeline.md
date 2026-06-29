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
