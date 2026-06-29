# Prompt Claude Code — RAG pipeline

Lis `docs/ai/rag-pipeline.md`, `DATA_MODEL.md` et `API_SPEC.md`.

Implémente une V1 :

- upload document ;
- stockage MinIO ;
- extraction texte simple ;
- chunking ;
- table document_sources ;
- table rag_chunks ;
- champ embedding pgvector placeholder si embedding non configuré ;
- endpoint recherche.

Prévoir métadonnées matière/niveau/chapitre.
