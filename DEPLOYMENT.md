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

## Ports

> 📍 **Source unique : [`docs/devops/ports.md`](docs/devops/ports.md)** — et `pnpm ports` pour
> l'état réel de la machine.

La table qui vivait ici donnait **8000 / 5173 / 5174 comme ports « de développement »**. C'est
faux depuis que la prod tourne en permanence sur le Mac : ce sont les **ports canoniques**, tenus
par les conteneurs, et `pnpm dev` refuse de démarrer tant qu'ils sont pris. Elle ignorait aussi
les six paires de `.claude/launch.json` (8001 → 8005) qui existent précisément pour développer
pendant que la prod tourne, et annonçait la console MinIO joignable alors que sa publication est
inerte. Une seconde table ici la ferait mentir à nouveau : la carte est ailleurs, ce renvoi la
remplace.

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

## ⚠️ Ce que « déployer » veut dire ici — et ce que ça ne veut pas dire

**Il n'existe AUCUNE CI et AUCUN environnement distant.** Merger une PR ne lance aucun test et ne
déploie rien : `main` est simplement la branche de référence. Les tests sont ceux qu'on lance à la
main, avant le merge.

**Les migrations passent au (re)démarrage du backend** — entrypoint Docker et `scripts/dev.sh`.
Il n'y a pas d'étape de déploiement séparée à déclencher.

**La variable de base de données est `ZETIS_DATABASE_URL`**, avec son préfixe. `Settings` déclare
`env_prefix="ZETIS_"` et `database_url` n'a aucun `validation_alias` : un `DATABASE_URL` nu est
**ignoré**, et le backend repart en silence sur son défaut (localhost, mot de passe de dev). Ce
document et `.env.example` l'annonçaient sans préfixe — corrigé le 2026-08-04.

## Sauvegardes

### PostgreSQL

```bash
pg_dump $ZETIS_DATABASE_URL > backups/zetis_$(date +%F).sql
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
