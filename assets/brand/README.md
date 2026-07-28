# Assets ZETIS

Ce dossier contient les ressources visuelles officielles du projet ZETIS.

Il sert de **bibliothèque source** pour tous les éléments graphiques fixes du projet : logo, avatars, icônes, variantes visuelles, éléments de marque et images réutilisables dans les interfaces Massimo et Papa.

---

## Rôle du dossier `assets/`

Le dossier `assets/` est placé à la racine du projet :

```txt
zetis/
├── assets/
├── apps/
├── docs/
├── database/
├── storage/
└── prompts/
```

Il ne contient pas les fichiers générés par les utilisateurs ou par l’IA.

Il contient uniquement les ressources graphiques stables du projet.

---

## Structure recommandée

```txt
assets/
├── README.md
│
└── brand/
    ├── logo/
    │   ├── zetis-logo-primary.png
    │   ├── zetis-logo-dark.png
    │   ├── zetis-logo-light.png
    │   ├── zetis-icon-rounded.png
    │   └── zetis-icon-circle.png
    │
    ├── avatars/
    │   ├── zetis/
    │   │   ├── zetis-avatar-circle.png
    │   │   ├── zetis-avatar-square.png
    │   │   ├── zetis-avatar-speaking.png
    │   │   └── zetis-avatar-idle.png
    │   │
    │   ├── massimo/
    │   │   ├── massimo-avatar.png
    │   │   ├── massimo-avatar-small.png
    │   │   └── massimo-avatar-profile.png
    │   │
    │   └── papa/
    │       ├── papa-avatar.png
    │       ├── papa-avatar-small.png
    │       └── papa-avatar-profile.png
    │
    ├── icons/
    │   ├── favicon.png
    │   ├── app-icon-512.png
    │   ├── app-icon-1024.png
    │   └── sidebar-icons/
    │
    ├── backgrounds/
    │   ├── massimo-home-bg.png
    │   ├── papa-dashboard-bg.png
    │   └── capsule-ai-bg.png
    │
    └── references/
        ├── zetis-logo-original.png
        ├── zetis-avatar-original.png
        └── design-notes.md
```

---

## Différence entre `assets/` et `storage/`

### `assets/`

Contient les visuels officiels du projet.

Exemples :

```txt
logo ZETIS
avatar ZETIS
avatar Massimo
avatar Papa
icônes de navigation
icône d'application
fonds fixes
visuels de marque
```

Ces fichiers sont versionnés avec le code.

---

### `storage/`

Contient les fichiers créés ou ajoutés pendant l’utilisation de l’application.

Exemples :

```txt
documents uploadés
capsules IA générées
images générées par IA
exports PDF
fichiers audio
réponses vocales
contenus temporaires
```

Ces fichiers ne sont pas des ressources graphiques officielles du projet.

---

## Règle principale

**Les originaux vont dans `assets/brand/`** — pleine résolution, versionnés, jamais importés par
le code, jamais servis directement.

**Les copies allégées vont là où le code les importe**, et le critère est la portée :

| Portée | Emplacement | Accès |
|---|---|---|
| Les deux interfaces | `packages/ui/src/assets/<famille>/` | résolveur dédié (ex. `subjectIconFor`) |
| Une seule interface | `apps/frontend-<app>/src/assets/{app,brand}/` | `import` TS |

### Pourquoi `src/assets/` et pas `public/assets/`

C'est l'inverse de ce que disait ce README jusqu'ici, et la pratique avait déjà tranché. Un
`import` TypeScript :

- **fait échouer le build** si le fichier manque — un chemin absolu `/assets/x.png` cassé ne se
  voit qu'à l'exécution, en image blanche, souvent en production ;
- **hashe le nom de fichier** (`ZETIS_map_256-YDJyCzsm.png`), donc invalide le cache navigateur
  à chaque changement de visuel ;
- **sort du bundle ce qui n'est plus importé**, alors que `public/` embarque tout, pour toujours.

`apps/frontend-*/public/assets/` ne contient plus que son README. Les visuels historiques posés à
la racine de `public/` (avatars, logo, `zetis-logo.mp4`) y restent : ils sont référencés par
chemin absolu depuis `index.html` et les balises de partage, où un `import` n'a pas cours.

### Toujours déposer une version réduite

Un pictogramme rendu à 24 px n'a pas besoin de 1248 px. Réduire à 256 px avant d'importer :

```bash
sips -Z 256 assets/brand/icons/mon-icone.png --out apps/frontend-papa/src/assets/app/mon-icone_256.png
```

Le suffixe `_256` est la convention du dépôt (cf. `packages/ui/src/assets/subjects/`, qui livre
`_120` et `_256`). L'original reste dans `assets/brand/icons/`, seule la réduction est importée.

---

## Convention de nommage

Utiliser uniquement :

```txt
minuscules
tirets simples
noms explicites
extension claire
```

Exemples corrects :

```txt
zetis-logo-primary.png
zetis-avatar-circle.png
massimo-avatar-profile.png
papa-avatar-small.png
app-icon-512.png
```

Exemples à éviter :

```txt
Logo Final.png
avatar papa nouveau 2.png
image1.png
zetis FINAL FINAL.png
Capture d’écran 2026-06-29.png
```

---

## Formats recommandés

### Logos

Formats recommandés :

```txt
.png
.svg
.webp
```

Utilisation :

```txt
PNG pour compatibilité immédiate
SVG pour logo vectoriel si disponible
WEBP pour optimisation web
```

---

### Avatars

Formats recommandés :

```txt
.png
.webp
```

Dimensions recommandées :

```txt
1024 x 1024 pour les originaux
512 x 512 pour les versions web
128 x 128 pour les miniatures
```

---

### Icônes

Formats recommandés :

```txt
.png
.svg
.ico
```

Dimensions utiles :

```txt
32 x 32
64 x 64
128 x 128
512 x 512
1024 x 1024
```

---

## Variantes à prévoir

Pour chaque logo important, prévoir si possible :

```txt
version claire
version sombre
version carrée
version ronde
version favicon
version icône macOS / iOS
```

Pour l’avatar ZETIS, prévoir :

```txt
idle
speaking
thinking
success
warning
encouragement
```

Pour l’avatar Massimo, prévoir :

```txt
profil
petit format
récompense
progression
mission
```

Pour l’avatar Papa, prévoir :

```txt
profil
dashboard
validation
supervision
paramètres
```

---

## Optimisation des images

Avant utilisation dans le frontend, les images doivent être optimisées.

Objectifs :

```txt
réduire le poids
garder une bonne qualité visuelle
accélérer le chargement
éviter les fichiers trop lourds dans l’interface
```

Recommandations :

```txt
ne pas utiliser d’image de plusieurs Mo dans le frontend
préférer WebP pour les images lourdes
conserver les originaux haute qualité dans assets/brand/references/
utiliser des versions optimisées dans les dossiers public/assets/
```

---

## Ce qu’il ne faut pas mettre ici

Ne pas mettre dans `assets/` :

```txt
fichiers uploadés par Massimo
fichiers uploadés par Papa
PDF scolaires
cours importés
captures temporaires
vidéos générées par IA
audios générés
exports PDF
fichiers de test volumineux
données personnelles
```

Ces fichiers doivent aller dans :

```txt
storage/uploads/
storage/generated/
storage/capsules/
storage/exports/
```

---

## Sécurité et vie privée

Ne pas stocker dans `assets/` de fichiers contenant :

```txt
photos personnelles non nécessaires
documents scolaires privés
informations médicales
informations administratives
données d’identification
documents familiaux
```

Les avatars peuvent être stylisés ou symboliques afin d’éviter de stocker des images personnelles sensibles dans le dépôt du projet.

---

## Checklist avant ajout d’un fichier

Avant d’ajouter une image dans `assets/`, vérifier :

```txt
[ ] Le fichier est-il un visuel officiel ou stable du projet ?
[ ] Le nom du fichier est-il clair ?
[ ] Le fichier est-il au bon endroit ?
[ ] Le fichier est-il dans un format adapté ?
[ ] Le fichier n’est-il pas trop lourd ?
[ ] Le fichier ne contient-il pas de donnée personnelle inutile ?
[ ] Une version optimisée existe-t-elle pour le frontend ?
```

---

## Règle pour Claude Code

Claude Code doit respecter les règles suivantes :

```txt
1. Ne jamais supprimer les fichiers originaux dans assets/brand/ sans demande explicite.
2. Utiliser assets/brand/ comme source officielle.
3. Copier uniquement les fichiers nécessaires dans apps/*/public/assets/.
4. Ne pas mélanger assets/ et storage/.
5. Ne pas générer automatiquement des dizaines de variantes inutiles.
6. Documenter toute nouvelle convention visuelle dans ce README.
```

---

## Exemple de flux correct

```txt
1. Papa ajoute un nouveau logo ZETIS dans assets/brand/logo/
2. Claude Code crée une version web optimisée si nécessaire
3. Claude Code copie cette version dans apps/frontend-massimo/public/assets/logo/
4. Claude Code copie cette version dans apps/frontend-papa/public/assets/logo/
5. Les composants React utilisent les fichiers depuis /assets/logo/
```

---

## Résumé

```txt
assets/brand/ = source officielle des visuels ZETIS
apps/*/public/assets/ = images utilisées par chaque frontend
storage/ = fichiers générés ou uploadés pendant l’utilisation
```

Le dossier `assets/` protège la cohérence visuelle du projet ZETIS.
