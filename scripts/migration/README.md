# scripts/migration/ — le kit qui a déplacé ZETIS du MacBook vers le Mac Studio

Ces cinq scripts ont servi pour de vrai, le **2026-08-17**. Ils vivaient jusqu'ici dans
`/Volumes/NX-Projects/`, hors du dépôt : donc **non versionnés, non relus, non testés**. Un bug de
portabilité y a survécu jusqu'au jour de la bascule (voir plus bas).

> ⚠️ **Les copies de `/Volumes/NX-Projects/` restent en place** — elles sont le point d'entrée
> opérationnel. Ce dossier-ci est la version **relue**. Les deux ne sont pas synchronisées
> automatiquement : si tu modifies l'une, reporte à la main.

## Sur quelle machine, et dans quel ordre

| # | Script | Se lance sur | Rôle | Écrit ? |
|---|---|---|---|---|
| 0 | `check-docker.sh` | **la machine cible** | Avant tout le reste : volume monté, emplacement de `Docker.raw`, réglages Docker Desktop, démon vivant, réglages d'énergie, Ollama | **non** — lit et rapporte |
| 1 | `zetis-export.sh` | **la source** | Inventaire, `.env`, dump Postgres *depuis le conteneur*, archivage des volumes MinIO/Redis | écrit **uniquement** dans le dossier de destination |
| 2 | `zetis-import.sh` | **la cible** | `.env`, démarrage de l'infra, restauration du dump dans une base **vide**, volumes + `storage/` | 🔴 **DESTRUCTIF** — il DROP puis recrée la base cible |
| 3 | `zetis-verify.sh` | **la cible** | Conteneurs, structure de la base, volumétrie, utilisateurs et XP, fichiers MinIO, backend HTTP | **non** — lecture seule |

### `zetis-pull.sh` — la variante réseau, celle qui a réellement servi

Elle remplace les étapes 1 et 2 quand les deux machines sont sur le même réseau : lancée **depuis la
cible**, elle appelle `zetis-export.sh --no-repo` à distance en SSH, rapatrie l'export, puis tire le
dépôt en direct. Prérequis : « Connexion à distance » activée sur la source, Docker Desktop démarré
des deux côtés.

Elle est **rejouable** : c'est l'outil de la répétition *et* celui de la bascule. Rien n'est modifié
sur la source. Et elle porte un garde-fou explicite — `rsync --delete` est destructeur, donc elle
**refuse** de tirer par-dessus du travail fait localement sur la cible plutôt que de l'écraser en
silence.

## 🔴 Le bug qui a fait échouer le rapatriement, et sa correction

`zetis-export.sh` détectait déjà (l. 23-24) que **macOS livre un rsync qui ignore
`--info=progress2`**, et retombait proprement sur `--progress` via `$RSPROG`.

**`zetis-pull.sh` ne portait pas cette détection.** Il codait `--info=progress2` en dur à deux
endroits. Mesuré sur le Mac Studio : `/usr/bin/rsync` est **openrsync, protocole 29** (« rsync 2.6.9
compatible »), et il **refuse** cette option — le transfert a cassé en plein vol. Le contournement
appliqué ce jour-là, `brew install rsync`, ne tient pas sur une machine sans Homebrew : c'est-à-dire
sur une machine neuve, le cas exact d'une migration.

La détection a été portée telle quelle depuis `zetis-export.sh`. *Le défaut n'était pas de ne pas
savoir — c'était de ne pas l'avoir porté ici.*

## Ce qui a été vérifié en versant le kit, et ce qui ne l'a pas été

**Vérifié** : `bash -n` passe sur les cinq ; aucune construction bash 4+ (les en-têtes promettent
bash 3.2, et ils tiennent) ; `-aH` est accepté par openrsync (donc pas un second problème de
portabilité) ; aucune autre option GNU-only (`sed -i`, `date -d`, `stat -c`, `md5sum`, `readlink -f`…)
dans les cinq fichiers.

🔴 **NON vérifié, et il faut le savoir** : **aucun de ces scripts n'a été exécuté** lors de leur mise
sous version. Le correctif de `zetis-pull.sh` est prouvé par lecture et par la mesure de
`/usr/bin/rsync --info=progress2` (refusé), **pas** par un transfert réel. La prochaine migration
sera le premier essai du chemin corrigé.
