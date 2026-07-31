# Prompt Claude Code — Accueil/Galaxie · Slice A : renommage de route

```
Chantier : Accueil & Galaxie — Slice A (addendum ADR-0024 du 2026-07-31).
Branche : feat/accueil-galaxy (étape 1, documents déjà committés).
Mono-chantier : cette session ne touche QUE le NOM de la route de la Galaxy et ses
références. Aucun contenu de page n'est modifié. Hors de ça, tu t'arrêtes.

Décisions déjà tranchées (ne les rouvre pas) :
- La route devient /galaxy. C'est un RENOMMAGE, pas un ajout : /progression ne
  survit qu'en redirection permanente, jamais en page.
- Le libellé de sidebar devient « Ma Galaxie », À LA MÊME POSITION. Le nombre
  d'entrées de la sidebar ne change pas — pas de 6ᵉ onglet (ADR-0024 §1).
- Le contenu de la page ne bouge pas d'un pixel dans cette slice.
- Zéro travail backend : aucune route API n'est créée, renommée ni supprimée.

Frontière non négociable : présentation et routage côté client uniquement.
Aucun schéma, aucune migration, aucun endpoint.

Déroulé imposé :
1. `graphify update .` en premier.
2. Read-before-code STRICT : lis TOUTE la liste ci-dessous avant d'écrire une ligne.
   Ne suppose aucun chemin de fichier — vérifie dans le code réel.
3. Stop-on-blocker : toute divergence réelle avec ce prompt → tu T'ARRÊTES, tu
   signales, tu proposes l'ajustement minimal. Tu ne codes pas autour.
4. À la fin : checklist standard 9 points.
```

## Read-before-code

Documents (décisions — ne pas les rediscuter) :

- `docs/decisions/adr-0024-zetis-galaxy-progression.md` — **§1, §5 et l'addendum en fin de
  fichier**. Le reste est du contexte.
- `docs/frontend-massimo/zetis-galaxy.md` — §12 (divergence `navigation.md`) et §13.

Code — **localise chaque cible par `graphify`, ne devine aucun chemin** :

- `graphify explain "routage frontend-massimo"` — où les routes sont déclarées, et comment une
  redirection est déjà exprimée ailleurs dans le routeur s'il en existe une.
- `graphify query "progression"` — **toutes** les occurrences, y compris les tests, les libellés
  de sidebar et les liens en dur.
- `graphify explain "page progression massimo"` — **le chemin exact du fichier de page**
  (`ProgressionPage.tsx` d'après l'ADR-0024 §1) et de son test, ainsi que la façon dont il est
  importé par le routeur (import direct ou `lazy()`).
- `MassimoBannerHeader.tsx` — la cible actuelle du lien XP.
- Le composant de sidebar Massimo — libellé et icône de l'entrée courante.
- Côté Papa : `graphify query "pageview"` puis `graphify query "route"` dans le module d'activité.
  Tu cherches **l'endroit qui traduit une route en libellé lisible** pour le cahier de bord et
  le dashboard. Il peut être côté client Papa **ou** côté serveur (module `parent/activity`).

⚠️ **Si ce mapping est côté serveur, tu T'ARRÊTES et tu me le signales avant de le modifier** :
ce chantier est annoncé sans travail backend, et c'est une hypothèse à vérifier, pas un acquis.

## À faire

1. **Route** — `/galaxy` sert la page actuellement servie par `/progression`. `/progression`
   devient une **redirection permanente** (`replace`), jamais une page.
2. **Sidebar** — libellé « Ma Galaxie », même position, même comportement d'état actif. L'icône
   peut changer si une icône Lucide dit mieux « galaxie » que l'actuelle ; sinon, ne la touche pas.
3. **Bandeau XP** (`MassimoBannerHeader`) — pointe vers `/galaxy`.
4. **Le fichier de page lui-même** — `ProgressionPage.tsx` devient `GalaxyPage.tsx`, **avec
   `git mv`** pour que l'historique suive, ainsi que son fichier de test. Même raison que le
   reste de cette slice : un fichier dont le nom décrit l'ancien contenu est la dette qu'on est
   en train de solder. Mets à jour tous les imports, y compris un éventuel `lazy()`.
   ⚠️ **Localise le fichier par `graphify`, ne devine pas son dossier.** Si son nom réel diffère
   de `ProgressionPage.tsx`, applique la même logique sans t'arrêter.
5. **Toutes les autres références** trouvées à l'étape read-before-code : liens en dur, tests,
   libellés. Aucun `/progression` résiduel hors de la redirection.
6. **Mapping de télémétrie côté Papa** — il doit accepter **`/progression` ET `/galaxy`** et les
   rendre sous **le même libellé**. Raison, à ne pas contourner : `POST /api/telemetry/pageview`
   a enregistré la route brute depuis le 2026-07-28. Sans ce mapping, trois jours de
   fréquentation réelle de Massimo apparaîtraient comme une page disparue, ou comme deux pages
   distinctes. **L'historique ne se réécrit pas** — on l'interprète.

## Tests

- La redirection `/progression` → `/galaxy` est couverte.
- Le mapping Papa rend le même libellé pour les deux routes.
- Un test de non-régression sur l'entrée de sidebar : elle existe, elle est unique, elle est
  active sur `/galaxy`.

**Aucun test existant ne doit être modifié pour passer.** Si un test échoue à cause du
renommage, c'est son *attendu de libellé ou d'URL* qui change — pas sa logique. Si tu te
surprends à assouplir une assertion, arrête-toi et signale.

## Hors périmètre (clôture)

- Le **contenu** de l'Accueil et de la page Galaxie — c'est la slice B.
- Le retrait du canvas 3D de l'Accueil — slice B.
- `navigation.md`, non réconcilié : ne le corrige pas, ne t'y réfère pas comme autorité.
- L'entrée « Diagnostic » de la sidebar (divergence connue `README` vs `navigation.md §9`) :
  ne l'ajoute pas, ne la retire pas.
- Tout renommage « tant qu'on y est » d'une autre route.

## Documentation, avant le commit

- `docs/frontend-massimo/zetis-galaxy.md` : route, libellé, §13.
- `README` frontend-massimo : entrée de sidebar renommée.
- `MEMORY.md` § Reprise : fait / en cours / prochain pas (= slice B).
- `TROUBLESHOOTING.md` : **uniquement** si le mapping de télémétrie s'est révélé ailleurs que
  prévu, ou si une référence à `/progression` était planquée dans un endroit non évident.
- Ne touche pas `CHANGELOG.md` (rien n'est livré tant que la slice B n'est pas passée), ni
  `ROADMAP`, ni `CLAUDE.md`.
