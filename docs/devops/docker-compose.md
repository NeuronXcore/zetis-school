# DevOps — Docker Compose

## Services attendus

- postgres
- redis
- minio
- api
- worker-ai
- worker-media
- frontend-massimo
- frontend-papa

## Réseau

Tous les services utilisent un réseau Docker interne `zetis-net`.

## Volumes

- `postgres_data`
- `redis_data`
- `minio_data`

## Commandes

```bash
docker compose up -d

docker compose logs -f api

docker compose down
```

## À faire par Claude Code

Créer un `docker-compose.yml` minimal puis l’améliorer progressivement.
