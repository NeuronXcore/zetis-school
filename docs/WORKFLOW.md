# WORKFLOW.md — Méthode de dev agentique ZETIS

> À relire avant chaque nouveau chantier. Les textes-types (§6) se collent tels quels dans
> Claude Code. Réfs internes : `CLAUDE.md` (Graphify, garde-fous), convention 7 fichiers
> (`MEMORY.md`…), `DECISIONS.md` (rituel ADR), discipline mono-chantier.

## 1. Principe directeur

En dev agentique, le goulot n'est plus d'**écrire** le code — l'agent le fait vite. Le goulot,
c'est la **décision** (en amont) et la **vérification** (en aval). Optimiser le workflow, ce
n'est donc pas taper plus vite : c'est **muscler les deux bouts** et rendre le milieu
(l'agent code) le plus mécanique possible.

**Règle qui chapeaute tout : l'agent propose, tu disposes. Les décisions et la mémoire vivent
dans le dépôt, pas dans le contexte de l'agent.**

## 2. La boucle, par chantier (un seul à la fois)

1. **Cadrer** — rituel `mockup → spec → ADR → prompt`. Chaque décision est écrite *avant* la
   moindre ligne. *Pourquoi :* une décision figée ne se re-discute pas à chaque session,
   l'agent la relit au lieu de la rouvrir. Le cadrage se rembourse 10× en exécution.
2. **Isoler** — mono-chantier + `git switch -c feat/<chantier>` + un **hors-périmètre
   explicite** dans le prompt. *Pourquoi :* le mode d'échec n°1 d'un agent est la dérive
   (« tant qu'on y est… »). Le hors-périmètre est une clôture, pas une correction après coup.
3. **Exécuter** — l'agent tourne dans une cage : `graphify update .` → **read-before-code** →
   build → **stop-on-blocker**. *Pourquoi :* le read-before-code empêche l'agent d'**inventer**
   une API ; le stop-on-blocker le force à **s'arrêter et signaler** au lieu de coder autour.
4. **Vérifier** — **toi** : tu lances les tests (jamais confiance au « c'est vert »), tu relis
   le diff, tu vérifies que le périmètre a tenu. *Pourquoi :* c'est la seule étape non
   délégable. Point critique récurrent : la **non-régression** (un test existant *modifié* pour
   passer = régression masquée).
5. **Mémoriser** — l'agent écrit la reprise (`MEMORY.md`) **pendant qu'il est lucide**, puis
   commit. *Pourquoi :* pour que la doc voyage *dans* le commit. La conversation est volatile,
   le dépôt est permanent.
6. **Intégrer** — PR → revue du diff → merge → `git pull` sur `main` → chantier suivant depuis
   un `main` à jour. *Pourquoi la PR même en solo :* c'est la porte de revue matérialisée,
   *avant* que le code n'entre dans `main`.

## 3. Les deux mémoires (ne pas les confondre)

| | Mémoire de **session** (contexte) | Mémoire du **code** |
|---|---|---|
| Objet | ce qui a été *dit / décidé* | comment le *code* est structuré |
| Se perd quand ? | nouvelle session, contexte saturé | jamais (fichier sur disque) |
| Récupérée par | `MEMORY.md` · Git · ADR/specs | **graphify** (`query`/`explain`/`path`) |

Trois canaux persistent la mémoire de session :

- **Git** = mémoire de l'**état du code** (commits, historique). Source de vérité sur « où en
  est le code ».
- **`MEMORY.md`** = mémoire du **raisonnement** (fait / en cours / à-faire / décisions actives /
  prochain pas). Écrit pour un lecteur sans contexte : la prochaine session.
- **ADR / specs** = mémoire des **décisions** figées. C'est la raison d'être du rituel
  `mockup→spec→ADR` : externaliser la décision hors du contexte volatil.

**Graphify n'est pas de la mémoire — c'est de l'orientation.** Il ne « garde » rien qui se
perd ; il **réduit le coût de reconstruction** du contexte-code après un reset : une session
neuve interroge la carte (`graphify explain "<zone>"`) au lieu de relire 40 fichiers. D'où
`graphify` en tête de chaque prompt, **puis** read-before-code (la carte oriente, le code réel
vérifie).

## 4. Les trois leviers d'optimisation

- **Front-load les décisions.** Le temps ne se gagne pas en codant vite, il se perd en
  re-décidant. Une heure d'ADR économise trois sessions qui tournent en rond.
- **Gère le contexte comme un budget.** Une session se dégrade *avant* de planter. **Coupe-la
  toi-même quand elle ralentit**, pendant qu'elle écrit encore un bon `MEMORY.md`. Une session
  neuve qui relit la doc repart plus nette qu'une session saturée qui radote.
- **Muscle les deux bouts, allège le milieu.** Qualité au cadrage (prompt fermé,
  read-before-code, hors-périmètre) et à la vérification (tests, revue). Si tu débats archi
  *pendant* que l'agent code, c'est que le cadrage était incomplet — remonte, ne rustine pas.

## 5. Timeline fin de session → reprise (sans perdre la mémoire)

La chaîne de flèches **se rompt à la coupure** : le contexte n'est pas transporté, il est jeté.
Ce qui relie les deux sessions, c'est le **dépôt** (écrit en phase 1, relu en phase 2).

```txt
FIN DE SESSION (l'agent est encore lucide)
  1. [décisions]  l'agent écrit la reprise   → MEMORY.md (fait / à-faire / décisions)
  2. [code]       graphify update .          → carte du code à jour
  3. [vérif]      TU vérifies la reprise      → contrôle de MEMORY.md
  4. [décisions]  commit wip + push           → l'état du code est figé
─────────────  coupure — le contexte est perdu  ─────────────
NOUVELLE SESSION (amnésique, repart de zéro)
  5. [code]       graphify update / explain   → réorientation, sans tout relire
  6. [décisions]  git log + lis MEMORY.md      → récupère les décisions
  7. [vérif]      vérifie l'existant           → ne recode rien de fait
  8. →            reprends au « prochain pas »  → le chantier continue
```

## 6. Textes-types (à coller dans Claude Code)

### 6.1 Ouverture de session (nouveau chantier)

```
Chantier : <nom> — Slice <A/B> (<ADR>). Branche : feat/<chantier> (étape <n>).
Mono-chantier : cette session ne touche QUE <périmètre>. Hors de ça, tu t'arrêtes.

Décisions déjà tranchées (ne les rouvre pas) : <lister>.
Frontière non négociable : <ex. layout=présentation client ; métier=serveur>.
Préconditions (déjà vraies — ne les recrée pas) : <branche, doc committée, deps mergées>.

Déroulé imposé :
1. `graphify update .` en premier.
2. Read-before-code STRICT : lis TOUTE la liste du prompt avant d'écrire une ligne.
   Ne suppose jamais une API/un modèle — vérifie dans le code réel.
3. Stop-on-blocker : toute divergence réelle avec la doc → tu T'ARRÊTES, signales,
   proposes l'ajustement minimal. Tu ne codes pas autour.
4. À la fin : checklist standard 9 points.
Le prompt complet suit.
```

### 6.2 Reprise de session (contexte perdu, même chantier)

```
Reprise — <chantier> Slice <A/B> (feat/<chantier>). Contexte précédent perdu.
NE REPARS PAS de zéro. Dans cet ordre, AVANT d'écrire :
1. `graphify update .`
2. `git log --oneline -8` — l'état réel du code.
3. Lis MEMORY.md § "Reprise" — fait / en cours / à-faire + décisions actives.
4. Relis <ADR> + <prompt de référence> — les décisions ne se rediscutent pas.
5. `graphify explain "<zone>"` — comprends la zone à reprendre sans tout relire.
6. Vérifie dans le code ce qui existe déjà — ce qui est fait ne se recode pas.
Puis reprends au "PROCHAIN PAS" du MEMORY.md.
```

### 6.3 Clôture de session (avant le commit)

```
Avant de committer, mets à jour la doc de chantier (toi l'agent, pendant que tu es lucide) :
1. MEMORY.md § Reprise : fait / en cours / à-faire + décisions actives + prochain pas.
2. TROUBLESHOOTING.md : tout écart réel rencontré (signature d'API inattendue, etc.).
3. ARCHITECTURE.md : UNIQUEMENT si une structure a été ajoutée (table, module).
   Ne touche PAS CHANGELOG (rien de livré tant que la slice n'est pas finie), ni ROADMAP,
   ni CLAUDE.md.
Puis donne-moi la checklist 9 points + le message de commit suggéré.
```

### 6.4 Checklist de clôture (9 points)

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes lancées ·
6. Tests (résultat) · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Message de commit conseillé.

## 7. Garde-fou méta — la sobriété vaut aussi pour le process

Ne sur-applique pas la méthode. Pas d'ADR pour un choix de couleur ; pas 7 fichiers parfaits à
chaque `wip` (un `MEMORY.md` juste vaut mieux que sept fichiers effleurés) ; pas de PR pour un
commit d'une ligne. Chaque artefact doit **gagner** sa place : décision réutilisable → ADR ;
choix d'IA de navigation → une ligne de spec ; rien → rien. La méthode aide tant qu'elle réduit
l'incertitude ; dès qu'elle devient rituel vide, elle coûte.
