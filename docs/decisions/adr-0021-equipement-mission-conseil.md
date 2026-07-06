# ADR-0021 — Équipement pédagogique d'une mission à sa création (depuis le Conseil de classe)

## Statut

Proposé — 2026-07-06. Prolonge le pont d'actionnabilité de l'ADR-0020 (Conseil de
classe → missions via Commander ADR-0018).

> S'appuie sur : `adr-0011` (résolution de la leçon canonique validée — substrat des
> dérivés), `adr-0015`/`adr-0016` (fiche / mindmap dérivés leçon-centrés, nés
> `pending`), `adr-0009`/`adr-0013` (cours et cartes SRS), `adr-0017 §5ter`
> (validation Papa avant exposition à Massimo), `adr-0018` (missions `manual`
> validées par l'action Papa). 100 % local (ADR-0008) : tous ces générateurs
> tournent sur Ollama, aucune donnée de Massimo vers le cloud.

## Contexte

L'ADR-0020 a livré le bouton « Créer ces missions » : une recommandation du Conseil
de classe crée des missions mono-notion (fan-out Commander). Mais une mission n'a de
valeur que si ses **étapes** ont des ressources à jouer : une étape `quiz` sans quiz
prêt est omise, une étape `mindmap` sans carte validée aussi (dégradation ADR-0017).
Pour une **notion fragile fraîchement identifiée**, ces ressources n'existent souvent
pas encore. Résultat : la mission créée est pauvre (parfois réduite à un ELI5).

Demande produit : « Créer ces missions » doit **équiper** la notion — ZETIS génère le
**kit pédagogique complet** (cours, fiche, cartes SRS, quiz, mindmap) pour que la
mission soit immédiatement riche et jouable.

Deux décisions figées encadrent ce geste :
1. **La règle fondatrice de validation** : tout contenu généré naît `pending` et ne
   doit atteindre Massimo qu'après approbation Papa (ADR-0017 §5ter, CLAUDE.md).
2. **Le verrou leçon-centré** : cours/fiche/SRS/quiz/mindmap dérivent tous d'une
   **leçon canonique validée** (ADR-0011). Une notion sans leçon (rattrapage
   skills-only, ADR-0010) ne peut pas être dérivée.

## Décision

1. **« Créer ces missions » = confirmer → équiper → créer.** Le clic ouvre une
   **popup de confirmation** (« ZETIS va générer cours, fiche, cartes, quiz et carte
   mentale pour N notion(s). Continuer ? »). À la confirmation, pour chaque notion,
   ZETIS génère le kit **puis** crée la mission (ordre imposé — décision 4).

2. **Auto-validation assumée, bornée à ce flux.** Le kit généré est marqué
   **`validated` immédiatement** : *la popup de confirmation Papa EST l'acte
   d'approbation humain* (même raisonnement que les missions `manual` validées par
   l'action Papa, ADR-0018). C'est la **soupape d'auto-validation** que l'ADR-0017
   §5ter réservait à un constat d'usage — **actée ici, étroitement** : elle ne
   s'applique qu'au contenu généré *par ce geste Papa explicite*, jamais à une
   génération de fond. Contrepartie assumée : Papa n'a pas relu pièce par pièce avant
   Massimo ; il **réédite ou rejette après coup** via les pages de pilotage
   existantes (fiches / quiz / mindmaps / cartes). La confiance est déplacée du
   « avant chaque pièce » vers « un geste d'ensemble + correction a posteriori ».

3. **Dégradation gracieuse leçon-centrée (générer le possible, signaler).** Par
   notion : leçon canonique validée présente → kit complet ; **absente → contenus
   leçon-dépendants sautés** (fiche/quiz/mindmap/SRS/cours), et l'omission est
   **remontée à Papa** (« notion X : pas de leçon, kit non généré »). Aucune
   fabrication de structure curriculum (chapitre/leçon) à la volée — hors périmètre
   (ce serait un autre chantier, avec sa propre validation).

4. **Équiper AVANT de créer la mission.** On génère et valide le kit d'abord ; la
   mission est créée ensuite, de sorte que son moteur d'étapes résout les ressources
   **fraîchement créées** (quiz/mindmap validés). Créer puis générer laisserait des
   étapes omises.

5. **On ne régénère jamais l'existant — on complète.** Toute pièce **déjà créée**
   n'est **jamais régénérée**, quel que soit son statut : cela inclut un contenu
   **créé manuellement par Papa** et encore en **brouillon `pending`** (une fiche,
   un quiz, une carte mentale, un cours). ZETIS ne génère **que ce qui manque** ;
   pour une pièce existante non encore validée, il la **valide** simplement (pas de
   rappel du LLM) afin de rendre la mission jouable. Chaque pièce est isolée
   (`try/except`) : l'échec de l'une n'abandonne pas les autres. Zéro génération
   compensatoire.

6. **Progression visible (barres estimées avec %).** Le kit d'une notion = une
   opération longue (jusqu'à 5 générations LLM locales) : le front affiche une
   **barre de progression estimée avec pourcentage** (patron `useEstimatedProgress`
   + `ProgressBar`, convention Papa) **par notion**, avec le libellé de l'étape en
   cours. Un récapitulatif final liste, par notion, ce qui a été généré / sauté.

## Périmètre

**v1** : endpoint d'équipement d'une notion (`POST` sous `reports`), orchestrant les
5 générateurs existants avec auto-validation + dégradation leçon-centrée ; refonte du
bouton « Créer ces missions » (popup de confirmation + barres de progression par
notion + récap) ; création des missions après équipement.

**Hors v1** : fabrication d'une leçon/chapitre manquant ; régénération d'un contenu
déjà validé ; parallélisme (générations séquentielles, une barre à la fois) ;
équipement hors du Conseil de classe (la page Commander garde son flux léger actuel).

## Conséquences

### Positives
- La mission naît **riche et jouable** : le débouché actionnable du Conseil de classe
  devient un vrai parcours (cours → fiche → SRS → quiz → mindmap), pas une coquille.
- Réutilisation maximale : zéro nouveau générateur, on **orchestre** l'existant.
- La soupape d'auto-validation est **cadrée et bornée** (un geste Papa), pas ouverte
  en grand.

### Négatives / coûts
- **Auto-validation = confiance a posteriori** : du contenu LLM non relu pièce par
  pièce atteint Massimo. Mitigé par la popup (intention explicite) + l'édition/rejet
  toujours possibles. À surveiller ; réversible (on peut resserrer par type).
- **Latence** : plusieurs minutes pour un lot de notions — d'où les barres estimées.
  L'estimation reste approximative (LLM local variable).
- **Couverture partielle** : les notions sans leçon ne sont pas équipées — signalé,
  jamais masqué (pas de fausse impression de complétude).

## Suivi
- **Docs** : ligne `DECISIONS.md` ; `API_SPEC.md §Conseil de classe` (endpoint
  d'équipement) ; note dans `adr-0020` (le pont d'actionnabilité équipe désormais).
- **Backend** : orchestration dans le module `reports` (résolution leçon canonique,
  appels aux 5 générateurs + validation, `try/except` par pièce, résumé typé) ; tests
  (kit complet avec leçon ; saut gracieux sans leçon ; auto-validation ; idempotence).
- **Frontend Papa** : popup de confirmation, barres de progression par notion (%),
  récapitulatif généré/sauté, puis création des missions.
