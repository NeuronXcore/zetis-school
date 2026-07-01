# FRONTEND_ROADMAP.md — Feuille de route frontend & design ZETIS

> Objectif : avancer **vite** sur le frontend et le design des pages, sans casser
> la séparation Massimo / Papa ni les pages déjà branchées sur l'API.
> Réf. specs design : `docs/frontend-massimo/page-*.md` et `docs/frontend-papa/page-*.md`.

État au 2026-06-30 — backend aux étapes 1→16 (ELI5, RAG, diagnostic, remédiation, gamification).

---

## 1. État des lieux des pages

Légende : ✅ branchée API · 🟡 maquette (mock) · ⬜ placeholder

### Massimo (interface enfant)

| Page | État | Donnée live dispo ? |
|---|---|---|
| Accueil | 🟡 mock | partiel (gamification + missions/today) |
| Matières | 🟡 mock | ⚠️ besoin endpoint `/subjects` |
| Matière dédiée | 🟡 mock | ⚠️ besoin `/subjects/{slug}/overview` |
| ELI5 | ✅ | oui |
| Diagnostic | ✅ | oui |
| Missions | ✅ | oui |
| Progression | ✅ (résiduel mock « par matière ») | oui (gamification) |
| Mindmaps | 🟡 mock | non (pas de backend) |
| Capsules IA | 🟡 mock | non (Phase 8) |
| Quiz | ⬜ placeholder | partiel (réutiliser moteur diagnostic) |
| Chat ZETIS | ⬜ placeholder | non |

### Papa (interface adulte)

| Page | État | Donnée live dispo ? |
|---|---|---|
| Dashboard | 🟡 mock | partiel (agréger diagnostics/missions/XP) |
| Diagnostics | ✅ | oui |
| Missions | ✅ | oui |
| Sources de cours | ✅ | oui (capture aussi via l'extension `zetis-clip`, étape 19) |
| Lacunes | 🟡 mock | ⚠️ besoin endpoint `/gaps` |
| Progression | 🟡 mock | oui (gamification) + ⚠️ par matière |
| Programmes & matières | 🟡 mock | ⚠️ besoin endpoints school/subjects |
| Années scolaires | 🟡 mock | ⚠️ besoin endpoints school-years |
| Cahier de bord IA | 🟡 mock | partiel (`ai_jobs`) |
| Conseil de classe IA | 🟡 mock | non |
| Capsules (pilotage) | 🟡 mock | non (Phase 8) |
| Mode focus | 🟡 mock | non |
| Paramètres | ⬜ statique | — |

---

## 2. Fondations design à poser EN PREMIER (débloque tout le reste)

Ces chantiers accélèrent toutes les pages ensuite. À faire avant la cosmétique page par page.

- **F1 — `packages/ui` partagé** : extraire les primitives dupliquées entre les deux
  apps en composants typés : `Button`, `Card`, `Badge`, `Input`, `Select`, `Progress`,
  `PageHeader`, `EmptyState`, `Skeleton`. Aujourd'hui chaque page réécrit le même Tailwind.
- **F2 — Tokens de thème centralisés** : formaliser les variables `--color-zetis-*`
  (enfant) et `--color-papa-*` (adulte) dans un seul endroit + documenter dans un
  mini design system. Garder deux thèmes distincts (gaming sobre vs analytique).
- **F3 — Décision librairie** : adopter **shadcn/ui** (recommandé par CLAUDE.md) **ou**
  rester en Tailwind brut structuré. À trancher car cela conditionne F1. (Voir §5.)
- **F4 — États standard** : composants `Loading` / `Error` / `Empty` réutilisables
  (les pages live les réimplémentent à la main).
- **F5 — Responsive & mobile Massimo** : audit iPhone (cible CLAUDE.md), breakpoints,
  navigation mobile (la sidebar actuelle n'est pas pensée petit écran).

---

## 3. Plan par lots (priorisé pour aller vite)

### Lot A — Design system (fondations) ✅ FAIT (étape 17)
`packages/ui` (`@zetis/ui`) avec `Button/Card/Badge/Spinner/EmptyState` + `cn`,
théming par tokens sémantiques mappés par app (shadcn/ui), consommé par
`MissionsPage` (Massimo + Papa). Reste de F1 (Input/Select/Progress…) au fil de l'eau.

### Lot B — Polissage des pages DÉJÀ live (gros impact visuel, zéro backend)
Refondre avec le design system : ELI5, Diagnostic, Missions (Massimo + Papa),
Progression, Sources, Diagnostics Papa. Animations sobres, états vides soignés,
feedback de complétion (mission/diagnostic). **Pur frontend.**

### Lot C — Accueil & Progression Papa (câblage léger, données déjà dispo)
- Accueil Massimo : brancher `gamification/summary` + `missions/today` (déjà servis).
- Progression Papa : brancher `gamification/summary` (déjà servi).
**Frontend + endpoints existants — rapide.**

### Lot D — Pages mock nécessitant un petit endpoint backend
Matières / Matière dédiée / Lacunes / Dashboard Papa : chacune a besoin d'un endpoint
de lecture simple (`/subjects`, `/subjects/{slug}/overview`, `/gaps`, agrégat dashboard).
Faire l'UI d'abord avec un type partagé, brancher ensuite.

### Lot E — Nouvelles pages fonctionnelles (plus gros)
Quiz (réutiliser le moteur diagnostic), Programmes & Années scolaires (CRUD Papa),
Cahier de bord IA (lecture `ai_jobs`). Mindmaps / Capsules / Chat = phases ultérieures.

---

## 4. Quick wins (faisables tout de suite, sans backend)

1. Extraire `Button` + `Card` + `Badge` dans `packages/ui` et refondre une page témoin.
2. Composants `EmptyState` et `Spinner` partagés → appliquer aux pages live.
3. Accueil Massimo : widget XP/niveau/streak (données `gamification/summary` déjà dispo).
4. Feedback de complétion de mission plus gaming (animation sobre, pas addictive).
5. Audit responsive d'une page Massimo sur largeur iPhone + correctifs.

---

## 5. Décisions à trancher (bloquent F1/F3)

- **Librairie de composants** : shadcn/ui (Radix + Tailwind, accessible, recommandé
  CLAUDE.md) **vs** primitives maison en Tailwind. Impacte tout le Lot A.
- **Périmètre `packages/ui`** : composants neutres partagés + thème par app, **vs**
  deux bibliothèques séparées (Massimo gaming / Papa analytique).
- **Ordre** : design system d'abord (Lot A→B) **vs** câbler d'abord les pages mock
  (Lot C→D) pour avoir des vraies données à styliser.

---

## 6. Hors périmètre frontend immédiat (rappel backend)

Endpoints à créer pour débloquer le Lot D/E : `/subjects`(+overview), `/gaps`,
agrégat dashboard Papa, CRUD `school-years`/`chapters`. À planifier en parallèle.
