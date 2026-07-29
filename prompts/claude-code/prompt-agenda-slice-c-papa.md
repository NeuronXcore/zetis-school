# Prompt Claude Code — Agenda scolaire · Slice C frontend Papa (ADR-0025, Lot 1)

> Périmètre : **frontend Papa uniquement** — page `/agenda` (saisie en lot, vue charge de la
> semaine, note parent, archivage). Backend livré en Slice A.
> Ne touche pas au frontend Massimo (Slice B).
> **La page n'a aucune case à cocher.** C'est l'invariant principal de cette slice.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (séparation stricte des deux interfaces) ;
2. `docs/decisions/adr-0025-agenda-scolaire.md` §2 (co-édition) et §3 (traçabilité) ;
3. Les contrats réels `/api/agenda/*` livrés en Slice A (`AgendaItemPilotOut`, corps en lot,
   403 sur `done_at`, DELETE = archivage) ;
4. Une page Papa récente et complète (page Couverture, `QuizPilotagePage` ou « Cartes SRS ») :
   conventions de tableau, filtres, modales, `ConfirmDialog`, états de chargement ;
5. `docs/design/design-system.md` (§ pilotage) et `PapaLayout` / `PapaSidebar`.

## Objectif

Papa inscrit rapidement plusieurs échéances (un contrôle annoncé, une semaine relevée sur
l'ENT), voit la charge de la semaine de Massimo, annote — et ne peut ni cocher, ni supprimer
définitivement, ni réécrire silencieusement.

## Travail demandé

### 1. Route et navigation

Route `/agenda`, **entrée de sidebar à part entière** — Papa est en phase 0 la seule source
d'items et vient ici pour écrire, de façon répétée. Placement visé : **après Dashboard, avant
Progression** ; vérifie l'ordre réel de `PapaSidebar` avant d'insérer (l'intention est « premier
tiers, près du Dashboard », pas un index absolu). Ni dans le Dashboard (analytique) ni dans le
Cahier de bord (rétrospectif) : c'est une surface de saisie.

### 2. Saisie en lot

Un formulaire multi-lignes : chaque ligne = `matière` · `intitulé` · `date` · `type`
(devoir / contrôle / rendu). Bouton « Ajouter une ligne », envoi **en une requête**
(`POST /api/agenda/items` accepte une liste). C'est le mode d'usage réel : Papa saisit une
semaine d'un coup, pas un item à la fois.

### 3. Vue charge de la semaine

Un tableau ou une bande 7 jours (thème émeraude, registre analytique — **ne réutilise pas**
la bande de Massimo, ce n'est pas le même objet) montrant, par jour :

- les items, avec leur origine (`ajouté par Massimo` / `ajouté par vous`) ;
- l'état : fait / non fait / archivé par Massimo ;
- un item édité par Papa porte visiblement son horodatage `edited_by_parent_at`.

L'écart déclaré / fait se **lit** ici. Il ne produit **aucune alerte**, aucun badge, aucun
compteur en rouge : l'ADR interdit d'émettre un événement d'échec, et l'UI ne doit pas le
réintroduire visuellement.

### 4. Actions

- **Éditer** un item de Massimo : possible, et l'interface **prévient explicitement** que la
  correction sera visible dans son agenda (« complété par papa »). Pas de modification
  silencieuse.
- **Note** (`parent_note`) : champ libre, avec la mention claire qu'elle **n'est jamais
  visible par Massimo**.
- **Archiver** (`DELETE`) : `ConfirmDialog` obligatoire, libellé « archiver », pas
  « supprimer ». Les items archivés restent consultables via un filtre.
- **Aucune case à cocher, nulle part.** Si l'API renvoie 403 sur une tentative d'écriture de
  `done_at`, c'est un bug de cette page — l'affordance ne doit pas exister.

### 5. Interrupteur d'ouverture de la saisie élève (ADR-0025 §10)

En phase 0, Massimo lit et coche mais ne saisit pas ; Papa est la **seule** source d'items.
Ajoute un réglage discret — **pas un KPI, pas une bannière** — *« Autoriser Massimo à ajouter
ses propres échéances »*, qui bascule `AGENDA_STUDENT_ENTRY_ENABLED`.

**Jamais de bascule automatique**, et **aucune suggestion calculée** du type « Massimo a coché
12 fois, vous pouvez ouvrir » : faire dépendre un droit d'un seuil observé transforme la page
en surveillance. Le geste appartient à Papa, à la date qu'il juge bonne.

### 6. Filtres

Matière · période · état (à venir / passés / archivés). Conventions des pages Papa
existantes, sans en inventer de nouvelles.

## Hors périmètre strict (ne pas commencer)

- Toute UI Massimo (Slice B).
- Import Pronote/ENT, saisie photo/OCR (hors ADR en V1).
- Plan de préparation, parsing (Lot 2).
- Remontée de l'agenda dans le Dashboard, le Cahier de bord ou le **Conseil de classe IA**
  (ADR-0020) : **différé et non tranché**. Un item non fait ne doit pas devenir un signal
  pédagogique, et surtout pas entrer dans le contexte d'évidence narré par le LLM du conseil
  — ce serait contourner l'invariant « non probant » par la porte de la narration.

## Si tu es bloqué

Écarts probables : `POST /items` n'accepte pas de corps en lot ; `edited_by_parent_at` absent
du `PilotOut` ; convention de filtre/tableau divergente. Signale et attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé : `feat(agenda): Papa agenda page with batch entry and weekly load view`
