# Contrats capturés

Des réponses **réelles** du backend, figées et versionnées, qui servent de **point de contact**
entre les deux côtés d'un endpoint.

## Pourquoi

Les tests unitaires ne peuvent pas prouver qu'un contrat tient : le backend teste le backend, le
front **mocke** le backend. Renommez une clé JSON d'un seul côté et **les deux suites restent
vertes** — c'est arrivé le 2026-08-04 sur `preset` → `niveau`, et seul un appel réel l'a montré.

Un fichier ici est lu par **deux** tests, un de chaque côté :

| Test | Ce qu'il tient |
|---|---|
| `apps/backend/app/tests/test_settings_autonomy.py` | la réponse réelle a **exactement** les clés du contrat |
| `apps/frontend-papa/src/.../contrat-autonomy.test.tsx` | les composants **rendent** correctement à partir du contrat |

Renommer côté serveur casse le premier. Mettre le contrat à jour sans toucher au front casse le
second. Les deux au vert ⇒ le contrat tient.

## Règle

⚠️ **Ne jamais éditer un fichier de ce dossier à la main.** Il se **capture** :

```bash
curl -s localhost:8001/api/settings/autonomy -H "Authorization: Bearer $T" | python3 -m json.tool
```

Un contrat écrit à la main n'est qu'un mock de plus — il prouverait seulement qu'on est d'accord
avec soi-même.

⚠️ **Les VALEURS n'engagent rien**, seules les **clés** font foi. Les tests comparent des formes,
jamais des contenus : un contrat qui figerait des valeurs deviendrait rouge au premier réglage
changé en base de dev, pour une raison qui n'est pas une régression.
