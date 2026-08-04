> ⚠️ **BROUILLON NON RÉCONCILIÉ — à lire avec cette réserve.**
> Rédigé fin juin 2026, resté dans un `git stash` (`feat/design-system`) et récupéré le
> 2026-07-28 sans jamais avoir été confronté à l'implémentation. Quatre semaines de
> développement se sont écoulées entre-temps. **Ce document ne fait pas autorité en l'état** :
> la phrase « si une décision est ici, elle prime » vaut pour l'intention d'origine, pas pour
> l'existant. Vérifier chaque point contre le code avant de s'y fier ou de le faire appliquer.

# navigation.md — Architecture de navigation du frontend Massimo

> À placer dans `docs/frontend-massimo/navigation.md`.
> Ce document complète `CLAUDE.md`, `PRODUCT_SPEC.md`, `DATA_MODEL.md` et `API_SPEC.md`.
> Il fixe les décisions de navigation de l'espace Massimo. Claude Code ne doit pas inventer une organisation différente : si une décision est ici, elle prime.

## 1. Objet

Définir l'organisation de navigation de `apps/frontend-massimo` : écrans, hiérarchie, éléments persistants et règles de cadrage enfant. L'objectif est une interface simple pour un enfant de 12 ans, motivante, jamais anxiogène, et transposable sur iPhone.

## 2. Principe directeur : deux modèles d'écran

L'espace Massimo combine deux modèles, et un seul s'applique par écran.

- **Modèle A — Accueil = launcher.** L'Accueil n'a **pas** de sidebar. Les 5 verbes y sont présentés en gros boutons. C'est un hub immersif, port d'attache de l'enfant.
- **Modèle B — sous-pages = navigation persistante.** Toutes les sous-pages affichent la navigation des 5 verbes en permanence : **sidebar latérale** sur desktop/tablette, **bottom-nav** sur iPhone.

Règle : ne jamais afficher la sidebar sur l'Accueil (sinon doublon avec les gros boutons), ne jamais retirer la navigation persistante des sous-pages.

## 3. Éléments persistants (Modèle B, et adaptés sur l'Accueil)

- **Bandeau XP.** Toujours visible en haut. Affiche niveau + barre d'XP. Tappable → ouvre **ZETIS Galaxy** (voir `zetis-galaxy.md`). Sert aussi à annoncer une nouvelle étoile de façon discrète (chip « +1 étoile », sans plein écran).
- **Avatar ZETIS.** Présent partout. Dans la salutation sur l'Accueil ; réduit en **bouton flottant** (bas-droite) sur les sous-pages. Ouvre le chat/aide ZETIS. À ne pas confondre avec le verbe « ZETIS » de la nav, qui est la section assistant complète.
- **Progression.** Elle n'a pas d'onglet propre : la page progression **est** ZETIS Galaxy, atteinte via le bandeau XP et l'aperçu de l'Accueil.

## 4. Les 5 verbes et le découpage 4 + 1

Navigation principale, en verbes d'action (jamais des noms) :

`Apprendre · Réviser · Quiz · Missions · ZETIS`

- Sur les **sous-pages** (sidebar / bottom-nav), les 5 verbes sont au même rang.
- Sur l'**Accueil**, ils sont découpés **4 + 1** : grille 2×2 des activités (Apprendre, Réviser, Quiz, Missions) + un bouton large **« Parler à ZETIS »**. Raison : ZETIS n'est pas une activité mais l'assistant ; le mettre à part le garde accessible et résout l'écueil de la 5ᵉ couleur.

## 5. Écran Accueil (Modèle A)

Composition, de haut en bas :

1. Bandeau XP (avec annonce « +1 étoile » le cas échéant).
2. Salutation + avatar ZETIS + un court message ZETIS (1 phrase).
3. **Mission du jour** en carte héro, avec **une seule action accentuée** : « Commencer ». C'est le chemin guidé.
4. **Aperçu ZETIS Galaxy** : quelques étoiles, certaines allumées, d'autres « à découvrir ». Tap → galaxy plein écran.
5. **Grille 2×2** des activités + bouton large **« Parler à ZETIS »**.

Règle « une action principale par écran » : sur l'Accueil, l'unique bouton plein/accentué est « Commencer ». Tout le reste est secondaire ou tinté.

## 6. Sous-pages (Modèle B)

Composition type d'une sous-page :

- **Sidebar** (desktop/tablette) : wordmark ZETIS, puis les 5 verbes, le verbe courant en surbrillance.
- **Bandeau XP** en barre haute de la zone de contenu (accès Galaxy conservé).
- **Contenu** de la section, avec au besoin une **barre secondaire** (onglets de la section).
- **Bouton flottant ZETIS** (bas-droite).

Sur iPhone : la sidebar disparaît au profit de la **bottom-nav** (les 5 verbes en bas), le reste est identique. Cible : phase 11 de la `ROADMAP`.

> ### ⚠️ Ce qui a été LIVRÉ le 2026-08-04 : un TIROIR, pas la bottom-nav
>
> **Le défaut réparé, mesuré et non supposé** : la sidebar était `w-60 shrink-0` **sans aucun point
> de rupture**. Sur 375 px elle en prenait **240**, laissant **135 px** à Massimo et un canevas de
> galaxie de **170 px** de large. Sous `md`, l'`aside` sort désormais du flux (`fixed`) et coulisse
> derrière un bouton ☰ ; à partir de `md`, **rien ne change d'un pixel**.
>
> **Pourquoi pas la bottom-nav que ce document prescrit** — et c'est un écart assumé, pas un oubli :
> cette spec date de l'étape 2 et ne connaît que **5 verbes**. La navigation en porte **13**,
> chacune ajoutée par une décision **postérieure** :
>
> | Entrée | Décidée par |
> |---|---|
> | **Agenda**, en position 2 | **ADR-0025** — « contre-intuitif et assumé » |
> | **Ma Galaxie**, à position constante | **addendum ADR-0024 §A**, qui *interdit* d'en faire un 6ᵉ onglet |
> | six entrées à témoin | **ADR-0030**, avec un test qui verrouille la liste |
>
> Appliquer la lettre de ce document **masquerait 8 sections sur mobile**, dont l'Agenda que
> l'ADR-0025 a délibérément mis en avant. Le tiroir répare la largeur **sans rien retirer**.
>
> **Reste donc ouvert** : réconcilier les 5 verbes de cette spec avec les 13 entrées livrées.
>
> ⚠️ **Mais ce n'est PAS un cadrage à faire — la décision est déjà prise.** L'**ADR-0024**, section
> « Divergence assumée avec `navigation.md` », a tranché il y a quatre semaines :
>
> > « Il décrit une navigation à 5 verbes et interdit un onglet Progression ; le code en a 12 depuis
> > quatre semaines et Progression est un onglet. **L'existant prime.** Réconcilier `navigation.md`
> > est un autre chantier, resté au `BACKLOG.md` — il n'est pas ouvert ici. »
>
> Ce qui reste est donc **de la documentation** : mettre ce fichier au réel (13 entrées, Progression
> est un onglet, l'Accueil porte la sidebar). **Aucun ADR à écrire, aucune décision à rouvrir** — le
> chantier est déjà nommé et rangé au `BACKLOG.md`.

## 7. Arborescence des sous-pages par verbe

- **Apprendre** → Matières (par défaut), Cours, ELI5, Mind maps, Capsules.
- **Réviser** → Flashcards, Erreurs, Dictées.
- **Quiz** → Entraînement, Boss final, Contrôle blanc.
- **Missions** → Parcours gamifiés. (Le Diagnostic apparaît ici comme mission spéciale, voir §9.)
- **ZETIS** → Chat, Voix, Aide, Conseil IA.

## 8. Double rôle d'ELI5 / Mind maps / Capsules

Ces trois éléments ont deux usages distincts, à ne pas confondre :

- **Onglets de section (Apprendre)** = **galeries** de ce que Massimo a déjà reçu ou produit (« mes mind maps », « mes capsules »). On y *retrouve*.
- **Boutons en contexte (écran de lecture d'un cours)** = **génération en contexte** : la notion est à l'écran, ELI5/carte/capsule savent sur quoi travailler. On y *crée*.

Conséquence : un onglet ELI5 « nu », sans notion sélectionnée, ne doit pas tenter de générer — il liste l'existant et renvoie vers un cours pour générer du neuf.

## 9. Diagnostic

Le Diagnostic **n'est pas** un item de menu libre pour Massimo. Il est déclenché par ZETIS ou par Papa, et se présente à Massimo comme une **mission spéciale** dans Missions. Justification : `CLAUDE.md` interdit les diagnostics formulés de façon anxiogène côté enfant.

## 10. Écran de lecture d'un cours (écran charnière)

C'est le pivot entre l'apprentissage et le moteur pédagogique (Étape 10).

Composition :

- Fil d'Ariane + retour vers Cours, titre de la leçon.
- **Contenu court** : blocs brefs, un encadré-exemple. Pas de gros pavés (Massimo décroche dessus).
- **Outils en contexte** : ELI5, Carte mentale, Capsule (tintés, secondaires).
- **Action primaire accentuée** : « Explique à ZETIS ce que tu as compris » → mode **reverse ELI5**.
- **Action secondaire** : « Faire le quiz ».

Branchement Étape 10 (boucle cible) :

```txt
explain (lecture / ELI5)
   → reverse-evaluate (Massimo explique)        POST /ai/eli5/reverse-evaluate
   → trace learning_events (event_type=eli5_reverse)
   → maj skill_mastery (mastery_score, status)
   → génération spaced_review_card (intervalles 1/3/7 j)
   → si seuil franchi : étoile allumée dans ZETIS Galaxy ("+1 étoile" au bandeau)
```

Chaque appel LLM écrit une ligne `ai_jobs`, même en mode synchrone. La verbalisation (reverse) est l'action primaire, pas le quiz : c'est la méthode pédagogique signature de ZETIS.

## 11. Réviser vs Quiz (distinction à rendre lisible)

Frontière facile à confondre pour un enfant ; à clarifier par l'icône et une phrase courte :

- **Réviser** = *ce que ZETIS me redonne*, piloté par la mémoire espacée (`spaced_review_cards` dues). C'est l'app qui propose.
- **Quiz** = *je me teste quand je veux* (entraînement, boss, contrôle blanc). C'est moi qui choisis.

## 12. Règles de cadrage enfant

Obligatoires sur tout l'espace Massimo (cf. `CLAUDE.md`) :

- Jamais « nul », « échec », « lacune », « en retard ». Utiliser « notion à renforcer », « niveau en construction », « à découvrir », « prochaine étape ».
- **Pas de rouge** dans l'UI Massimo pour signaler un manque. Le rouge n'encode pas l'échec ; un état non acquis est « à découvrir » (neutre/sombre), pas « raté ».
- Statuts de contenu non punitifs : `Nouveau`, `En cours`, `Vu`. Pas de « non fait ».
- « Prochaine révision » du `PRODUCT_SPEC` : matérialisée par des **pastilles de compte** sur les tuiles (Réviser, Missions), pas par un bloc anxiogène dédié.
- Une action principale par écran. Un seul bouton accentué visible à la fois (règle de retenue).

## 13. Mapping écrans → API / données

- Bandeau XP : `GET /progress/xp`, `GET /progress/summary`.
- Aperçu / page Galaxy : `GET /progress/skills?subject_id=` étendu en `{ nodes, edges }` (voir `zetis-galaxy.md`).
- Apprendre / Matières : `GET /subjects`, `GET /subjects/{slug}/overview`.
- Apprendre / Cours : `GET /chapters/{chapter_id}/lessons`, `GET /lessons/{lesson_id}`.
- Lecture → ELI5 : `POST /ai/eli5/explain` → `GET /ai/jobs/{job_id}`.
- Lecture → « Explique à ZETIS » : `POST /ai/eli5/reverse-evaluate`.
- Réviser : cartes dues issues de `spaced_review_cards` (`due_at`).
- Missions / Mission du jour : `GET /missions/today`, `GET /missions/{id}`.

## 14. Pour Claude Code

À faire :

- Implémenter l'Accueil en Modèle A (launcher, sans sidebar) et les sous-pages en Modèle B (navigation persistante).
- Réutiliser un même shell de sous-page (sidebar + bandeau XP + bouton flottant ZETIS) pour toutes les sections.
- Garder ZETIS Galaxy hors de la rangée des 5 verbes ; l'atteindre par le bandeau XP et l'aperçu Accueil.
- Centraliser les libellés de statut/feedback dans un module unique, pour faire respecter §12 partout.

À éviter :

- Ajouter un 6ᵉ onglet (Progression, Galaxy, Diagnostic) à la nav principale.
- Afficher la sidebar sur l'Accueil.
- Dupliquer la génération ELI5/carte/capsule entre onglet-galerie et bouton-contexte.
- Écrire des prompts IA dans les composants React (cf. `CLAUDE.md` : prompts versionnés dans `packages/prompts`).
- Tout vocabulaire négatif ou tout rouge « échec » dans l'UI Massimo.
