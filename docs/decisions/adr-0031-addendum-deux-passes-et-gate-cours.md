# Addendum ADR-0031 — Les deux passes du §7 : le gate vit dans la sélection, pas dans l'orchestrateur

## Statut

Proposé — 2026-08-02. Écrit **pendant** la slice A, à partir de son read-before-code. Il tranche
avant la slice C, qui ne peut pas être écrite sans lui.

> S'appuie sur : `adr-0031` (production en lot), `adr-0023 §7` (deux passes non fusionnables —
> doctrine reprise), `adr-0021 §2/§5` (équipement auto-validé, soupape §5ter), `adr-0011 §F.4`
> (l'auto-validation existe déjà et `parent_bulk` la couvre), `adr-0017 §5ter` (la soupape).
> **Ne rouvre aucune décision.** Il constate qu'une décision n'a jamais été implémentée et dit où
> l'implémenter.

## Contexte — ce que le read-before-code de la slice A a trouvé

L'ADR-0023 §7 exige **deux passes distinctes et non fusionnables** : rédiger les cours → validation
Papa **obligatoire et bloquante** → équiper. L'ADR-0031 et l'addendum ADR-0011 §G le citent tous
deux comme *« le seul endroit du dispositif où le gate humain reste obligatoire et bloquant, **et
il ne bouge pas** »*.

**Elles sont fusionnées.** `production/equipment.py::equip_notion` valide le cours lui-même, par
deux chemins distincts :

| Ligne | Situation | Ce qui se passe |
|---|---|---|
| 126 | le cours existe, `status == "draft"` | `set_lesson_validation(…, "validate")` — **un brouillon que Papa avait peut-être délibérément laissé en attente** |
| 130 | aucun cours | génération, puis validation — **Papa n'a jamais vu ce cours** |

Puis les dérivés s'enchaînent dans la foulée.

**Ce n'est pas un bug.** À l'échelle d'UNE notion, c'est la soupape §5ter de l'ADR-0021, « ouverte
étroitement » : Papa clique « Créer ces missions » sur une notion, la popup de confirmation vaut
acte d'approbation, un cours est concerné. Le §F.4 le sait, l'assume, et le trace en `parent_bulk`
précisément pour que ce basculement cesse d'être indétectable.

> **C'est l'ÉCHELLE qui rend la fusion inacceptable, pas le mécanisme.** Un clic sur
> « ⚡ Compléter le chapitre » ferait rédiger et auto-valider **quinze cours** — le seul contenu que
> Massimo lit vraiment. La soupape ouverte étroitement pour une notion deviendrait une porte
> ouverte sur un chapitre.

## Décision

### 1. `equip_notion` ne change pas

Aucune modification de son comportement. Le Conseil de classe et la composition champion
continuent d'équiper une notion exactement comme aujourd'hui, soupape §5ter comprise.

Toucher l'orchestrateur pour satisfaire le scope chapitre régresserait deux fonctionnalités
livrées, et rouvrirait l'ADR-0021 §2 que personne n'a demandé à rouvrir.

### 2. Le gate du §7 vit dans la **sélection**, pas dans l'orchestrateur

> La passe 2 n'équipe que les notions dont la leçon est **déjà `validated` et porte un contenu**.
> Les autres ne sont pas équipées : elles sont **rendues à Papa comme bloquées**, avec leur motif.
>
> Le scope chapitre n'appelle donc **jamais** `equip_notion` sur une leçon en brouillon. Les deux
> chemins d'auto-validation du cours deviennent inatteignables depuis un lot — sans qu'une ligne
> de l'orchestrateur ait bougé.

C'est le §7 appliqué à la lettre : les deux passes sont séparées **par ce que la passe 2 accepte
de traiter**, et rien ne peut les fusionner par inadvertance.

### 3. Les deux passes, explicitement

**Passe 1 — « Rédiger les cours »** : génère `content_markdown` pour les leçons du chapitre qui
n'en ont pas. **Elles restent en brouillon.** Aucune validation, aucun dérivé.

**Le gate — Papa valide**, par les surfaces qui existent déjà : validation par leçon (page
Programme) ou `validate-all` de chapitre (qui écrit `parent_bulk`, §F.3). Rien à construire.

**Passe 2 — « Équiper »** : pour chaque notion retenue par la sélection du §2, `equip_notion`
inchangé. Une leçon validée avec contenu fait `skipped.append("cours")` — le chemin
d'auto-validation n'est même pas emprunté.

### 4. Corollaire : `plan(scope)` ne filtre pas, et c'est cohérent

La slice A a livré `plan(scope)` **sans** le filtre `validated` que l'ADR-0023 §2 mentionnait, pour
une raison locale : la matrice de couverture retient `status != "archived"` (son travail est de
montrer ce qui MANQUE, brouillons compris), et filtrer dans le résolveur aurait forcé deux
résolutions différentes — perdre le substrat partagé pour gagner un filtre d'une ligne.

Le §2 ci-dessus lui donne sa justification de fond :

> **Le filtre `validated` n'est pas un détail de résolution, c'est LE GATE.** Il n'a rien à faire
> dans un résolveur partagé avec une page de lecture. Il appartient à la passe 2, où il est visible,
> nommé, et testable comme la règle qu'il est.

L'écart avec la lettre de l'ADR-0023 §2 est donc **acté**, pas subi.

## Périmètre

**Dans cet addendum** : la décision ci-dessus, et rien d'autre. Aucun code — la slice B implémente
l'exécution, la slice C la surface et les deux passes.

**Hors** : le libellé exact des deux boutons et le rendu des notions bloquées (spec
`page-couverture.md`, slice C) ; le régulateur `PRODUCTION_MAX_PENDING` (ADR-0031 §5) ; tout ce qui
relève du palier 3 (ADR-0032).

## Conséquences

### Positives

- Le §7 devient **vrai** au lieu d'être cité. Il ne l'était nulle part.
- **Zéro régression** : l'orchestrateur, ses deux appelants et leurs tests ne bougent pas.
- La soupape §5ter de l'ADR-0021 reste ce qu'elle est — étroite, à l'échelle d'une notion.
- L'écart de `plan(scope)` cesse d'être une dérogation locale : il devient la conséquence d'une
  décision d'architecture.

### Négatives / coûts

- **Un lot sur un chapitre neuf ne produira rien à la passe 2**, et c'est voulu : tout sera bloqué
  en attente de validation. La surface doit le dire clairement, sinon Papa lira un échec là où il y
  a un gate. **C'est le point le plus facile à rater de la slice C.**
- Deux gestes de Papa au lieu d'un pour un chapitre complet. C'est le prix explicite du §7, et
  l'ADR-0023 l'avait déjà payé en décision.
- L'observation de l'ADR-0031 (« 15 objets d'un coup sont-ils relisables ? ») se mesure désormais
  **après** le gate, pas avant — ce qui est plus juste : elle mesure la relecture des dérivés, pas
  celle des cours, qui a sa propre passe.

## Suivi

Tests-verrous exigés à la slice B/C :

1. **Le lot n'auto-valide aucun cours.** Un chapitre dont toutes les leçons sont en brouillon :
   après un lot complet, **aucune** leçon n'est passée `validated`, et aucun dérivé n'existe.
   *(Le verrou qui protège le §7 — sans lui, tout cet addendum est décoratif.)*
2. Un chapitre dont les leçons sont validées avec contenu : la passe 2 équipe, et `equip_notion`
   rend `cours` en `skipped` (le chemin d'auto-validation n'est pas emprunté).
3. Les notions bloquées sont **rendues avec leur motif**, jamais silencieusement omises.
4. `equip_notion` et ses deux appelants existants : tests **inchangés**.
