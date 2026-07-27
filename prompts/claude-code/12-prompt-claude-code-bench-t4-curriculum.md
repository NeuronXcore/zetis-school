# Prompt Claude Code — Bench T4 « curriculum » (préalable ADR-0009 §7)

> À coller tel quel dans Claude Code. Périmètre : **script de benchmark uniquement**,
> aucun code de production.

---

Lis d'abord, dans cet ordre, avant d'écrire la moindre ligne :

1. `CLAUDE.md` (règles générales du projet) ;
2. `docs/decisions/adr-0008-inference-mlx-vs-ollama.md` (harnais de bench existant,
   usage cloud « yardstick », gestion des clés, extraction des sorties Sonnet) ;
3. `docs/decisions/adr-0009-referentiel-programme-scolaire.md` — en particulier le §7
   (les trois issues que ce bench doit départager) et le §5 (versions de programme) ;
4. `scripts/bench_llm.py` **en entier** : structure des tâches existantes (eli5,
   diagnostic, capsule), boucle de mesure, validation Pydantic, options CLI
   (`--ollama-models`, `--anthropic-models`, `--openai-models`, `--repeats`, `--out`,
   `--env-file`), helpers d'extraction (`_unfence`, gestion du bloc `thinking`) ;
5. La définition réelle de `LLMRequest` / `LLMResponse` et du champ `fmt` dans
   `app/modules/ai/` — ne suppose JAMAIS la forme de l'API, lis-la.

## Objectif

Ajouter une **tâche T4 « curriculum »** au harnais `scripts/bench_llm.py`, pour mesurer
la connaissance factuelle du programme scolaire français (BO) des modèles — capacité
distincte de la richesse pédagogique déjà mesurée. Le résultat servira à trancher le §7
de l'ADR-0009 (local / cloud / hybride) par un addendum.

## Travail demandé

### 1. Schéma de validation local au script

Définis **dans `scripts/bench_llm.py`** (ou un module voisin sous `scripts/`, PAS sous
`app/`) un schéma Pydantic minimal `CurriculumChapters` :

- `subject: str`, `cycle: str`, `program_version: str`
- `chapters: list[ChapterItem]` avec `ChapterItem = { title: str, themes: list[str],
  suggested_class: str | None }` (bornes : 3 à 15 chapitres, `extra="forbid"`)

⚠️ Ce schéma est un **outil de mesure jetable** : le schéma de production sera défini au
Lot 1 de l'ADR-0009. N'ajoute rien dans `app/modules/`, ne crée aucun prompt versionné
dans `app/prompts/` — c'est volontairement hors périmètre ici.

### 2. Deux prompts T4 (génériques, zéro donnée de Massimo)

- **T4a — matière AVEC repères annuels** : « Liste les chapitres de mathématiques du
  cycle 4 (programme officiel français, BO du 30 juillet 2020), en indiquant pour chacun
  les thèmes couverts et la classe suggérée (5e/4e/3e) selon les repères annuels de
  progression de 2019. »
- **T4b — matière SANS repères annuels (cas dur)** : même consigne pour les **SVT**
  cycle 4, en demandant explicitement de signaler que la répartition par classe est
  indicative (pas de repères officiels pour cette matière).

Sortie structurée via `fmt` (JSON Schema du modèle Pydantic ci-dessus), comme les tâches
existantes. Réutilise le pipeline de réparation/extraction déjà en place s'il existe dans
le harnais ; sinon, valide simplement et compte les échecs.

### 3. Moteurs à mesurer

- Local : `qwen3.6:35b-a3b` (défaut actuel — le harnais gère déjà `think:false`).
- Cloud yardstick, **seulement si les clés sont présentes dans `.env`** :
  `claude-sonnet-5` et `gpt-4o` (mêmes options CLI que la phase 2 de l'ADR-0008).
  Si aucune clé n'est trouvée : exécute le local seul et signale-le dans la sortie,
  ne bloque pas.

### 4. Sortie : échantillons + grille de scorage humain

Écris le rapport dans `scratchpad/bench_curriculum.md` :

- tableau récapitulatif par (moteur, modèle) : latence médiane, JSON valide (n/n) ;
- **la sortie complète de chaque run** (les chapitres générés, lisibles) — c'est la
  matière du jugement humain ;
- une **grille de scorage vide** à remplir par Papa, BO ouvert à côté, par run :
  - intitulés de thèmes conformes au BO (0-2) ;
  - découpage/granularité plausible (0-2) ;
  - répartition par classe correcte (T4a) ou incertitude correctement signalée (T4b) (0-2) ;
  - absence d'inventions / de mélange avec d'autres versions de programme (0-2) ;
  - total /8 et champ « verdict » libre.

### 5. Contraintes strictes

- **Aucune modification** de `app/` (providers, services, prompts de prod, config).
- Aucune nouvelle dépendance.
- `--repeats 3` par défaut pour T4 ; les tâches existantes du bench ne doivent pas
  être cassées (lance au moins un run rapide d'une tâche existante pour le vérifier).
- Clés cloud lues comme aujourd'hui (`.env` racine git-ignoré / `--env-file`) ; ne
  jamais les afficher dans la sortie.

## Si tu es bloqué

Si `bench_llm.py` a une structure qui rend l'ajout de tâche non trivial (ex. tâches
hardcodées sans point d'extension), ARRÊTE-TOI et propose le refactor minimal nécessaire
avant de l'exécuter. Ne restructure pas le harnais de ta propre initiative.

## À la fin, réponds avec la checklist standard

1. Étape traitée
2. Résumé de ce qui a été fait
3. Fichiers créés
4. Fichiers modifiés
5. Commandes à lancer (le run complet local + le run cloud si clés)
6. Tests réalisés ou à réaliser
7. Points non traités volontairement
8. Prochaine étape recommandée
9. Message de commit Git conseillé (suggestion :
   `feat(bench): add T4 curriculum knowledge task to LLM benchmark`)
