---
id: "0010"
titre: "Génération « skills-only » pour un niveau antérieur (rattrapage)"
type: surface
statut: accepte
date: 2026-07-03
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0010 — Génération « skills-only » pour un niveau antérieur (rattrapage)

## Statut

Accepté — 2026-07-03.

> S'appuie sur : `adr-0009` (§2 : les skills sont le référentiel durable, les
> chapitres son instanciation annuelle ; §3 : co-construction ; addendum 1 :
> dérogation cloud `curriculum_*`), `adr-0007` (pipeline sortie structurée `fmt`
> + 1 réparation + traces). Ne modifie aucune décision de l'adr-0009 — il en
> exploite la distinction skills/chapitres et **précise** un comportement de sa
> passe 1 (§ Décision, point 5 ; pointeur à ajouter dans l'adr-0009).

## Contexte

Besoin exprimé (Papa) : rattrapage des lacunes de 5e de Massimo (français
notamment). Le circuit existant — check-up (`POST /diagnostics/generate` avec
`level`), lacunes, missions, maîtrise, répétition espacée — opère entièrement sur
les `Skill`, persistantes et scopées (matière, niveau), indépendantes des années
scolaires. Il ne manque que le **corpus de notions 5e en base**.

Vérification sur pièce du prompt v1 (`app/prompts/curriculum.py`, 2026-07-03) :
la passe 1 génère strictement « pour ce niveau » — et pour les matières à repères
annuels (français, maths, EMC), la répartition par classe est exigée conforme.
Les notions 5e n'entreront donc **jamais** en base via la génération de l'année 4e.
Incohérence relevée au passage : le few-shot SVT contient un chapitre
`suggested_class: "5e"` pour une demande de niveau 4e — débordement non spécifié.

## Alternatives considérées

- **Année scolaire 5e rétroactive** : instancierait des chapitres avec progression
  temporelle (`period`, `status`) pour une année jamais vécue — pollution du modèle
  temporel pour un besoin structurel. Contraire à la distinction de l'adr-0009 §2.
  → Écarté.
- **Générer tout le cycle dans l'année active** : mélangerait trois classes dans la
  page Programme de l'année 4e et casserait la règle « strictement conforme aux
  repères annuels » pour les matières qui en disposent. → Écarté.
- **Saisie manuelle des notions 5e par Papa** : possible aujourd'hui, mais ~30-60
  notions par matière à écrire une à une ; la génération + revue est le même effort
  de validation pour un dixième de l'effort de saisie. → Écarté comme chemin
  principal (reste disponible en complément, co-construction oblige).

## Décision

1. **Chemin de génération « skills-only »** : pour un couple (matière, niveau
   antérieur du même cycle), le service enchaîne la passe 1 puis la passe 2
   **en mémoire** — les chapitres et leçons générés servent d'échafaudage de
   cadrage et ne sont **jamais persistés**. Seules les **notions** sont upsertées
   en `Skill`, avec `level` = niveau cible. Réutilisation intégrale des prompts
   versionnés et du pipeline validation Pydantic → 1 réparation → traces.
2. **Validation Papa préservée, sans nouvelle colonne** : `Skill` n'a pas de
   `validation_status` et n'en reçoit pas. La revue humaine se fait **avant
   persistance** : flux en deux temps — génération → prévisualisation des notions
   (groupées par chapitre d'échafaudage) → confirmation explicite → upsert.
   Rien n'est écrit en base avant confirmation. Papa peut retirer ou renommer des
   notions dans la prévisualisation (co-construction, adr-0009 §3). Flux
   **stateless** : aucun brouillon serveur, le client porte la liste entre
   generate et confirm ; le confirm revalide ses entrées.
3. **Traces et routage** : trace `ai_jobs` de type `curriculum_skills_backfill`
   (avec `engine_id`/`model_tag`, `prompt_version`), une par génération
   matière×niveau. La dérogation cloud `curriculum_*` (adr-0009 addendum 1)
   s'applique telle quelle : prompts génériques, zéro donnée de Massimo
   (invariant testé).
4. **Idempotence et dégradation** : l'upsert réutilise la clé et la logique de la
   passe 2 existante — relancer puis confirmer ne duplique pas ; les skills
   existantes (seed, diagnostics passés) sont préservées (réconciliation fine :
   adr-0009 Lot 3). Échec d'un chapitre d'échafaudage en passe 2 : les autres
   continuent, les échecs sont signalés (`failed_scaffolds`) — liste partielle
   plutôt que rien.
5. **Précision portée à la passe 1 de l'adr-0009 (tranche l'ambiguïté relevée)** :
   **la passe 1 reste strictement mono-niveau pour toutes les matières** ; le
   besoin multi-niveaux est couvert par le présent chemin ciblé, explicite et
   validé. L'exemple SVT du few-shot est corrigé (tous les chapitres au niveau
   demandé) et `CURRICULUM_PROMPT_VERSION` passe à `v2` (tout changement de texte
   de prompt = bump, traçabilité `ai_jobs` et `metadata_json.prompt_version`).
   Un test-verrou garantit que les few-shots restent mono-niveau.

## Conséquences

### Positives

- Le rattrapage devient une **consommation du référentiel** : dès l'upsert
  confirmé, le check-up `level=5e` est opérationnel sans autre développement.
- Zéro migration, zéro table, zéro colonne : le mécanisme n'exploite que
  l'existant — c'est la sobriété de `TECH_STACK.md` appliquée au modèle.
- L'ancrage RAG (adr-0009 §6, Lot 2 restant) bénéficiera automatiquement à ce
  chemin — les *Attendus de fin d'année de 5e* (français) ingérés en source
  officielle fiabiliseront la génération 5e. Ordre recommandé : ancrage d'abord,
  backfill ensuite.

### Négatives / coûts

- Une génération = ~6-9 appels LLM séquentiels (passe 2 par chapitre
  d'échafaudage) — action Papa explicite, latence assumée comme pour la
  génération de chapitres.
- Les skills créées n'ont ni `prerequisite_skill_ids` ni chapitre associé : le
  chaînage des prérequis (nécessaire à l'ordonnancement fin des missions de
  rattrapage) reste un chantier ultérieur.
- L'échafaudage jeté n'est pas tracé au-delà de `ai_jobs` : si Papa veut revoir
  la structure proposée après confirmation, il régénère (assumé : coût faible,
  idempotence garantie).

## Suivi

- **Docs** : ligne dans `DECISIONS.md` (« ADR-0010 — génération skills-only pour
  niveau antérieur ») ; pointeur dans `adr-0009` (fin de §1 ou du suivi :
  « comportement mono-niveau de la passe 1 précisé par l'adr-0010, décision 5 ») ;
  note dans `DATA_MODEL.md` sous `Skill` (« peut être alimentée par génération
  skills-only pour un niveau antérieur, ADR-0010, sans chapitre associé »).
- **Slice backend** : correction few-shot + v2, service d'orchestration, endpoints
  generate/confirm, tests (prompt Claude Code dédié).
- **Slice UI** : maquette validée d'abord (déclenchement depuis la page Programme),
  puis prompt Claude Code.
- Ordre dans la file : après la page Années scolaires et la Slice A-bis
  (ancrage RAG) — inchangé.
- Commit suggéré : `feat(curriculum): skills-only generation for prior level
  (backfill, backend)`.
