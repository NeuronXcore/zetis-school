# DEPLOYMENT.md — Déploiement ZETIS

## Objectif

Permettre de lancer ZETIS localement pendant le développement, puis préparer un accès distant sécurisé si nécessaire.

## Développement local

### Prérequis

- Docker Desktop ou Docker Engine.
- Node.js LTS.
- Python 3.11+.
- Git.

### Démarrage infra

```bash
docker compose up -d postgres redis minio
```

### Backend

```bash
cd apps/backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

### Frontend Massimo

```bash
cd apps/frontend-massimo
npm install
npm run dev
```

### Frontend Papa

```bash
cd apps/frontend-papa
npm install
npm run dev
```

## Docker Compose cible

Services :

```txt
postgres
redis
minio
api
worker-ai
worker-media
frontend-massimo
frontend-papa
```

## Ports recommandés en développement

| Service | Port |
|---|---:|
| frontend-massimo | 5173 |
| frontend-papa | 5174 |
| api | 8000 |
| postgres | 5432 |
| redis | 6379 |
| minio api | 9000 |
| minio console | 9001 |

## Variables

Voir `.env.example`.

## Accès distant

### Option A — WireGuard

Recommandée pour MVP familial.

Avantages :

- pas d’exposition publique directe ;
- contrôle réseau ;
- adapté si Massimo a un appareil autorisé.

Inconvénients :

- configuration initiale ;
- dépend du réseau maison.

### Option B — VPS reverse proxy

Architecture :

```txt
Massimo iPhone/Mac
    ↓ HTTPS
VPS reverse proxy
    ↓ tunnel sécurisé
Serveur maison ZETIS
```

Avantages :

- accès simple par URL ;
- certificat HTTPS ;
- disponibilité meilleure.

Inconvénients :

- surface d’attaque ;
- maintenance ;
- monitoring nécessaire.

### Option C — Déploiement cloud complet

À éviter au MVP sauf besoin fort.

## Sauvegardes

### PostgreSQL

```bash
pg_dump $DATABASE_URL > backups/zetis_$(date +%F).sql
```

### MinIO

Utiliser `mc mirror` vers un disque de sauvegarde.

## Mise à jour

Procédure :

1. Pull Git.
2. Lire notes migration.
3. Sauvegarder DB.
4. Appliquer migrations Alembic.
5. Redémarrer services.
6. Vérifier `/health`.
7. Tester login Massimo/Papa.

## Monitoring MVP

- endpoint `/health` ;
- logs Docker ;
- taille DB ;
- taille MinIO ;
- erreurs jobs IA ;
- coût IA.

## Rollback

Pour le MVP :

- restaurer dump DB ;
- restaurer bucket MinIO ;
- revenir au commit Git précédent.

## Checklist avant accès distant

- [ ] HTTPS.
- [ ] Auth activée.
- [ ] Mots de passe forts.
- [ ] CORS restreint.
- [ ] Firewall.
- [ ] Sauvegarde.
- [ ] Logs.
- [ ] Secrets hors Git.
- [ ] Rate limiting minimal.
