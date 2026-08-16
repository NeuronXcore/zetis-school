# Benchmark T4 « curriculum » — connaissance du programme (ADR-0009 §7)

> **Annexe versionnée de l'ADR-0009 (addendum du 2026-07-03).** Copie archivée du rapport
> généré par `scripts/bench_llm.py --curriculum --repeats 3` le 2026-07-03 (commit `b40cb9b`)
> — `scratchpad/` étant git-ignoré, cette copie est la pièce de référence durable. Ne pas
> régénérer par-dessus : tout re-run futur doit utiliser un `--out` daté.

Mesure la connaissance factuelle du programme scolaire français (BO) — capacité distincte de la richesse pédagogique (T1-T3). Sert à trancher le §7 de l'ADR-0009 (local / cloud / hybride) par un addendum.

- Répétitions par cellule : **3**. Latence = médiane.
- Moteurs exécutés : anthropic, ollama, openai.
- Clés cloud (yardstick benchmark uniquement, jamais en prod) : OpenAI présente, Anthropic présente.

## Récapitulatif (moteur, modèle, tâche)

| Moteur | Modèle | Tâche | Latence méd. (s) | tok/s méd. | JSON valide |
|---|---|---|---|---|---|
| ollama | qwen3.6:35b-a3b | curriculum_math | 7.2 | 71.8 | 3/3 |
| ollama | qwen3.6:35b-a3b | curriculum_svt | 5.9 | 71.1 | 3/3 |
| openai | gpt-4o | curriculum_math | 2.9 | 83.4 | 3/3 |
| openai | gpt-4o | curriculum_svt | 3.4 | 74.6 | 3/3 |
| anthropic | claude-sonnet-5 | curriculum_math | 30.8 | 110.3 | 0/3 |
| anthropic | claude-sonnet-5 | curriculum_svt | 16.6 | 105.2 | 3/3 |

> ⚠️ « JSON valide » mesure la CONFORMITÉ au schéma jetable (3-15 chapitres, `extra` interdit), pas la qualité du contenu. Un modèle peut échouer pour un motif de FORME — découpage plus fin que 15 chapitres, ou sortie tronquée au plafond `max_tokens` du harnais — sans que sa connaissance du BO soit en cause. Juger le contenu sur les sorties complètes ci-dessous, indépendamment de cette colonne.

## Sorties complètes + grille de scorage (jugement humain — Papa, BO ouvert)

Barème par run : intitulés conformes au BO (0-2) · découpage plausible (0-2) · répartition par classe correcte / incertitude bien signalée (0-2) · sans invention ni mélange de versions (0-2). **Total /8** + verdict libre.

### ollama / qwen3.6:35b-a3b / curriculum_math
| Run | Intitulés de thèmes conformes au BO (0-2) | Découpage / granularité plausible (0-2) | Classe correcte (T4a) / incertitude signalée (T4b) (0-2) | Sans invention ni mélange de versions (0-2) | Total /8 | Verdict |
|---|---|---|---|---|---|---|
| #1 |  |  |  |  |  |  |
| #2 |  |  |  |  |  |  |
| #3 |  |  |  |  |  |  |

**Run #1**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres et calculs",
      "themes": [
        "Calcul mental",
        "Nombres relatifs : opérations",
        "Priorités opératoires et parenthèses",
        "Fractions et nombres décimaux",
        "Puissances de 10 et écriture scientifique",
        "Racine carrée d'un nombre positif",
        "Équations du premier degré à une inconnue",
        "Inéquations du premier degré à une inconnue"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères annuels)"
    },
    {
      "title": "Organisation et gestion de données",
      "themes": [
        "Statistiques descriptives (moyenne, médiane, étendue)",
        "Diagrammes en bâtons, circulaires ou semi-circulaires",
        "Probabilités simples",
        "Tableaux de données et graphiques"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères annuels)"
    },
    {
      "title": "Grandeurs et mesures",
      "themes": [
        "Unités de longueur, aire, volume, masse, durée",
        "Périmètre et aire du cercle",
        "Volume du cylindre",
        "Vitesse moyenne",
        "Échelles"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères annuels)"
    },
    {
      "title": "Espace et géométrie",
      "themes": [
        "Symétrie centrale et axiale",
        "Translations et rotations",
        "Théorème de Thalès",
        "Propriétés du triangle rectangle (cercle circonscrit, médiane)",
        "Trigonométrie dans le triangle rectangle (cosinus)",
        "Angles alternes-internes et angles correspondants",
        "Représentation en perspective cavalière",
        "Vues en orthogonales"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères annuels)"
    },
    {
      "title": "Algorithmique et programmation",
      "themes": [
        "Boucles et conditions",
        "Variables et affectations",
        "Fonctions (définition et appel)",
        "Utilisation d'un tableur ou d'un logiciel de géométrie"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères annuels)"
    }
  ]
}
```

**Run #2**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres et calculs",
      "themes": [
        "Calcul mental",
        "Nombres relatifs",
        "Fractions et nombres décimaux",
        "Puissances",
        "Ordre de grandeur et approximation",
        "Écriture scientifique"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères)"
    },
    {
      "title": "Organisation et gestion de données, fonctions",
      "themes": [
        "Statistiques descriptives",
        "Probabilités",
        "Fonctions linéaires et affines",
        "Proportionnalité"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères)"
    },
    {
      "title": "Grandeurs et mesures",
      "themes": [
        "Longueur, aire, volume",
        "Angle",
        "Durée",
        "Masse"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères)"
    },
    {
      "title": "Espace et géométrie",
      "themes": [
        "Figures planes",
        "Solides",
        "Transformations du plan",
        "Symétries",
        "Théorème de Thalès",
        "Propriétés de l'angle droit (Pythagore)",
        "Trigonométrie"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères)"
    },
    {
      "title": "Algorithmique et programmation",
      "themes": [
        "Boucles",
        "Conditions",
        "Variables",
        "Fonctions"
      ],
      "suggested_class": "5e, 4e, 3e (progression indicative selon les repères)"
    }
  ]
}
```

**Run #3**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres et calculs",
      "themes": [
        "Calcul mental",
        "Nombres relatifs",
        "Fractions et nombres décimaux",
        "Puissances",
        "Notation scientifique",
        "Ordre de grandeur et approximation"
      ],
      "suggested_class": "5e, 4e, 3e (progression continue sur le cycle)"
    },
    {
      "title": "Organisation et gestion de données, fonctions",
      "themes": [
        "Proportionnalité",
        "Fonctions linéaires et affines",
        "Statistiques descriptives",
        "Probabilités"
      ],
      "suggested_class": "5e (proportionnalité, statistiques), 4e (fonctions), 3e (probabilités, fonctions)"
    },
    {
      "title": "Grandeurs et mesures",
      "themes": [
        "Mesures de longueurs, aires et volumes",
        "Mesures d'angles",
        "Périmètre et aire du cercle",
        "Vitesse"
      ],
      "suggested_class": "5e (aires, périmètres), 4e (volumes, angles), 3e (théorème de Pythagore, trigonométrie)"
    },
    {
      "title": "Espace et géométrie",
      "themes": [
        "Figures planes et solides",
        "Symétries (centrale et axiale)",
        "Transformations du plan",
        "Théorème de Thalès",
        "Trigonométrie dans le triangle rectangle",
        "Théorème de Pythagore"
      ],
      "suggested_class": "5e (symétries, figures), 4e (transformations, théorème de Thalès), 3e (Pythagore, trigonométrie)"
    }
  ]
}
```

### ollama / qwen3.6:35b-a3b / curriculum_svt
| Run | Intitulés de thèmes conformes au BO (0-2) | Découpage / granularité plausible (0-2) | Classe correcte (T4a) / incertitude signalée (T4b) (0-2) | Sans invention ni mélange de versions (0-2) | Total /8 | Verdict |
|---|---|---|---|---|---|---|
| #1 |  |  |  |  |  |  |
| #2 |  |  |  |  |  |  |
| #3 |  |  |  |  |  |  |

**Run #1**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Le peuplement d'un milieu",
      "themes": [
        "La nature du vivant",
        "La diversité des organismes vivants",
        "Les relations au sein des écosystèmes"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le fonctionnement du corps humain et la santé",
      "themes": [
        "Le maintien de l'intégrité de l'organisme : rôle du système immunitaire",
        "La transmission de la vie chez l'homme",
        "Le contrôle de la reproduction",
        "Les effets des comportements sur la santé"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La dynamique des territoires",
      "themes": [
        "Le peuplement des territoires : mobilités et dynamiques spatiales",
        "Les ressources en eau douce et leur gestion",
        "L'occupation du territoire par les activités humaines"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Des enjeux du développement durable à la perspective globale",
      "themes": [
        "Les ressources alimentaires et leur gestion",
        "L'impact des activités humaines sur l'environnement",
        "La biodiversité et son évolution"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

**Run #2**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Le peuplement d'un milieu",
      "themes": [
        "Les organismes vivent dans des milieux présentant des caractéristiques physiques et chimiques différentes.",
        "Au cours du temps, les milieux se modifient et les organismes évoluent avec eux.",
        "La présence d'organismes permet de connaître certaines caractéristiques d'un milieu."
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le fonctionnement du corps humain et la santé",
      "themes": [
        "L'effort physique provoque des modifications physiologiques dont certaines sont mesurables.",
        "Les risques liés à l'alimentation, aux drogues, au tabac, à l'alcool, etc., peuvent être évalués par des études épidémiologiques.",
        "Le corps humain est soumis à des agressions qui provoquent des réponses immunitaires."
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La nature du vivant",
      "themes": [
        "Les êtres vivants sont répartis en grands groupes.",
        "L'unité du vivant repose sur des caractéristiques moléculaires communes.",
        "Le vivant, bactérien et eucaryote, est composé de cellules."
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La planète Terre, l'environnement et l'action humaine",
      "themes": [
        "Les risques naturels sont liés à l'activité interne et externe de la planète.",
        "L'exploitation des ressources naturelles par les humains a des conséquences sur le fonctionnement de la planète.",
        "Le changement climatique actuel est d'origine anthropique."
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

**Run #3**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Le peuplement d'un milieu",
      "themes": [
        "La nature du vivant",
        "La diversité des organismes vivants",
        "Les relations au sein des écosystèmes"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le fonctionnement du corps humain et la santé",
      "themes": [
        "Le maintien de l'intégrité de l'organisme : rôle du système immunitaire",
        "La transmission de la vie chez l'homme",
        "Le fonctionnement du système nerveux",
        "L'organisation du travail musculaire"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La planète Terre, l'environnement et l'action humaine",
      "themes": [
        "Les risques d'aggravation des effets de l'activité humaine sur l'environnement",
        "L'évolution d'une situation face à un problème environnemental local",
        "Le devenir des gaz à effet de serre dans les différents réservoirs"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La nature du vivant",
      "themes": [
        "L'unité chimique du vivant",
        "La diversité des êtres vivants",
        "Les relations au sein des écosystèmes"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

### openai / gpt-4o / curriculum_math
| Run | Intitulés de thèmes conformes au BO (0-2) | Découpage / granularité plausible (0-2) | Classe correcte (T4a) / incertitude signalée (T4b) (0-2) | Sans invention ni mélange de versions (0-2) | Total /8 | Verdict |
|---|---|---|---|---|---|---|
| #1 |  |  |  |  |  |  |
| #2 |  |  |  |  |  |  |
| #3 |  |  |  |  |  |  |

**Run #1**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres et calculs",
      "themes": [
        "Nombres entiers et rationnels",
        "Calcul littéral",
        "Proportionnalité"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Organisation et gestion de données, fonctions",
      "themes": [
        "Statistiques",
        "Probabilités",
        "Fonctions"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Grandeurs et mesures",
      "themes": [
        "Unités de mesure",
        "Périmètres, aires, volumes",
        "Échelles"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Espace et géométrie",
      "themes": [
        "Figures planes",
        "Solides",
        "Transformations géométriques"
      ],
      "suggested_class": "indicatif"
    }
  ]
}
```

**Run #2**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres et calculs",
      "themes": [
        "Nombres entiers et rationnels",
        "Calcul numérique",
        "Calcul littéral"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Organisation et gestion de données, fonctions",
      "themes": [
        "Proportionnalité",
        "Statistiques",
        "Fonctions"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Grandeurs et mesures",
      "themes": [
        "Unités de mesure",
        "Périmètres, aires, volumes",
        "Angles"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Espace et géométrie",
      "themes": [
        "Figures planes",
        "Solides",
        "Transformations géométriques"
      ],
      "suggested_class": "indicatif"
    }
  ]
}
```

**Run #3**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres et calculs",
      "themes": [
        "Nombres entiers et rationnels",
        "Calcul numérique",
        "Proportionnalité"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Organisation et gestion de données, fonctions",
      "themes": [
        "Statistiques",
        "Probabilités",
        "Fonctions"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Grandeurs et mesures",
      "themes": [
        "Unités de mesure",
        "Périmètres, aires, volumes",
        "Grandeurs composées"
      ],
      "suggested_class": "indicatif"
    },
    {
      "title": "Espace et géométrie",
      "themes": [
        "Figures planes",
        "Solides",
        "Transformations géométriques"
      ],
      "suggested_class": "indicatif"
    }
  ]
}
```

### openai / gpt-4o / curriculum_svt
| Run | Intitulés de thèmes conformes au BO (0-2) | Découpage / granularité plausible (0-2) | Classe correcte (T4a) / incertitude signalée (T4b) (0-2) | Sans invention ni mélange de versions (0-2) | Total /8 | Verdict |
|---|---|---|---|---|---|---|
| #1 |  |  |  |  |  |  |
| #2 |  |  |  |  |  |  |
| #3 |  |  |  |  |  |  |

**Run #1**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "La planète Terre, l'environnement et l'action humaine",
      "themes": [
        "Les enjeux contemporains de la planète",
        "Les ressources naturelles",
        "Les impacts de l'activité humaine sur l'environnement"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le vivant et son évolution",
      "themes": [
        "La biodiversité, sa dynamique et sa gestion",
        "Les fonctions de nutrition",
        "Les fonctions de reproduction",
        "L'évolution des organismes vivants"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé",
      "themes": [
        "Le fonctionnement du corps humain et la santé",
        "Les comportements responsables face à la santé",
        "Les bases biologiques de la santé"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

**Run #2**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "La planète Terre, l'environnement et l'action humaine",
      "themes": [
        "Les enjeux contemporains de la planète",
        "Les ressources naturelles",
        "Les impacts de l'activité humaine sur l'environnement"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le vivant et son évolution",
      "themes": [
        "La biodiversité, sa dynamique et sa gestion",
        "Les relations entre les êtres vivants et leur environnement",
        "L'évolution des espèces vivantes"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé",
      "themes": [
        "Le fonctionnement du corps humain et la santé",
        "Les comportements responsables face à la santé",
        "Les mécanismes de défense de l'organisme"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

**Run #3**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "La planète Terre, l'environnement et l'action humaine",
      "themes": [
        "Les enjeux contemporains de la planète",
        "La dynamique interne de la Terre",
        "Les risques géologiques",
        "Les ressources naturelles"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le vivant et son évolution",
      "themes": [
        "La biodiversité, résultat et étape de l'évolution",
        "La reproduction et le peuplement des milieux",
        "Les relations entre les êtres vivants et leur environnement"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé",
      "themes": [
        "Le fonctionnement du corps humain et la santé",
        "Les systèmes de régulation du corps humain",
        "Les comportements responsables face à la santé"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

### anthropic / claude-sonnet-5 / curriculum_math
| Run | Intitulés de thèmes conformes au BO (0-2) | Découpage / granularité plausible (0-2) | Classe correcte (T4a) / incertitude signalée (T4b) (0-2) | Sans invention ni mélange de versions (0-2) | Total /8 | Verdict |
|---|---|---|---|---|---|---|
| #1 |  |  |  |  |  |  |
| #2 |  |  |  |  |  |  |
| #3 |  |  |  |  |  |  |

**Run #1**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres entiers et décimaux",
      "themes": [
        "Sens des opérations sur les décimaux",
        "Priorités opératoires",
        "Multiples et diviseurs",
        "Notion de nombre premier (introduction)"
      ],
      "suggested_class": "5e"
    },
    {
      "title": "Nombres relatifs",
      "themes": [
        "Comparaison et repérage",
        "Addition et soustraction de relatifs",
        "Multiplication et division de relatifs (approfondissement)"
      ],
      "suggested_class": "5e (introduction), 4e (consolidation)"
    },
    {
      "title": "Fractions",
      "themes": [
        "Sens de la fraction, quotient",
        "Comparaison de fractions",
        "Opérations sur les fractions (addition, soustraction, multiplication, division)"
      ],
      "suggested_class": "5e, 4e, 3e (progressif)"
    },
    {
      "title": "Proportionnalité",
      "themes": [
        "Reconnaître une situation de proportionnalité",
        "Pourcentages",
        "Échelles, vitesses moyennes",
        "Représentation graphique d'une situation de proportionnalité"
      ],
      "suggested_class": "5e, 4e, 3e (approfondissement progressif)"
    },
    {
      "title": "Calcul littéral",
      "themes": [
        "Introduction des expressions littérales",
        "Développement et factorisation (identités remarquables en 3e)",
        "Réduction d'expressions"
      ],
      "suggested_class": "4e (introduction), 3e (approfondissement)"
    },
    {
      "title": "Puissances",
      "themes": [
        "Notation puissance, puissances de 10",
        "Écriture scientifique",
        "Règles de calcul sur les puissances"
      ],
      "suggested_class": "4e, 3e"
    },
    {
      "title": "Équations et inéquations",
      "themes": [
        "Résolution d'équations du premier degré",
        "Mise en équation d'un problème",
        "Inéquations du premier degré (introduction)"
      ],
      "suggested_class": "4e (équations), 3e (inéquations et systèmes)"
    },
    {
      "title": "Racines carrées",
      "themes": [
        "Définition et calculs avec des racines carrées",
        "Lien avec le théorème de Pythagore"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Statistiques",
      "themes": [
        "Recueil et organisation de données",
        "Moyenne, médiane, étendue",
        "Représentations graphiques (diagrammes, histogrammes)"
      ],
      "suggested_class": "5e, 4e, 3e (progressif)"
    },
    {
      "title": "Probabilités",
      "themes": [
        "Vocabulaire probabiliste",
        "Calcul de probabilités simples",
        "Expériences aléatoires à une ou deux épreuves"
      ],
      "suggested_class": "4e (introduction), 3e (approfondissement)"
    },
    {
      "title": "Notion de fonction",
      "themes": [
        "Vocabulaire fonctionnel (antécédent, image)",
        "Représentation graphique d'une fonction",
        "Lecture graphique"
      ],
      "suggested_class": "4e"
    },
    {
      "title": "Fonctions linéaires et affines",
      "themes": [
        "Définition et caractérisation",
        "Représentation graphique",
        "Lien avec la proportionnalité"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Grandeurs et mesures : aires, périmètres et volumes",
      "themes": [
        "Calcul d'aires et de périmètres de figures usuelles",
        "Calcul de volumes de solides usuels",
        "Changements d'unités"
      ],
      "suggested_class": "5e, 4e (approfondissement)"
    },
    {
      "title": "Grandeurs composées",
      "themes": [
        "Vitesses moyennes",
        "Débits",
        "Autres grandeurs quotients et produits"
      ],
      "suggested_class": "4e, 3e"
    },
    {
      "title": "Figures planes et configurations géométriques",
      "themes": [
        "Constructions géométriques",
        "Propriétés des triangles et quadrilatères",
        "Médiatrices, bissectrices, hauteurs"
      ],
      "suggested_class": "5e"
    },
    {
      "title": "Théorème de Pythagore",
      "themes": [
        "Énoncé et démonstration",
        "Applications au calcul de longueurs",
        "Réciproque du théorème"
      ],
      "suggested_class": "4e"
    },
    {
      "title": "Théorème de Thalès",
      "themes": [
        "Configuration de Thalès",
        "Calcul de longueurs",
        "Réciproque du théorème"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Trigonométrie",
      "themes": [
        "Cosinus, sinus, tangente dans le triangle rectangle",
        "Calculs de longueurs et d'angles"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Transformations géométriques",
      "themes": [
        "Symétries axiale et centrale (consolidation)",
        "Translations",
        "Homothéties (introduction)"
      ],
      "suggested_class": "5e, 4e (translations), 3e (homothéties)"
    },
    {
      "title": "Solides et géométrie dans l'espace",
      "themes": [
        "Patrons et représentations de solides",
        "Sections de solides",
        "Volumes de solides usuels"
      ],
      "suggested_class": "5e, 4e, 3e (progressif)"
    },
    {
      "title": "Algorithmique et programmation",
      "themes": [
        "Notions de variable, boucle, condition",
        "Programmation d'algorithmes simples (Scratch, puis langage textuel)",
        "Utilisation d'un tableur pour automatiser des calculs"
      ],
      "suggested_class": "5e, 4e, 3e (enseignement transversal, indicatif)"
    }
  ]
}
```

**Run #2**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres relatifs",
      "themes": [
        "Nombres et calculs",
        "addition/soustraction de relatifs",
        "multiplication/division de relatifs"
      ],
      "suggested_class": "5e (introduction), 4e (consolidation et opérations complètes)"
    },
    {
      "title": "Fractions",
      "themes": [
        "Nombres et calculs",
        "comparaison, addition, soustraction de fractions",
        "multiplication et division de fractions"
      ],
      "suggested_class": "5e (bases), 4e (consolidation), indicatif"
    },
    {
      "title": "Proportionnalité",
      "themes": [
        "Organisation et gestion de données",
        "situations de proportionnalité",
        "pourcentages",
        "vitesses et échelles"
      ],
      "suggested_class": "5e (introduction et approfondissement), réinvesti en 4e/3e"
    },
    {
      "title": "Calcul littéral - initiation",
      "themes": [
        "Nombres et calculs",
        "expressions littérales simples",
        "substitution de valeurs"
      ],
      "suggested_class": "5e"
    },
    {
      "title": "Puissances",
      "themes": [
        "Nombres et calculs",
        "puissances entières",
        "notation scientifique (introduction)"
      ],
      "suggested_class": "4e"
    },
    {
      "title": "Calcul littéral - développement et équations",
      "themes": [
        "Nombres et calculs",
        "développement",
        "réduction d'expressions",
        "équations du premier degré simples"
      ],
      "suggested_class": "4e"
    },
    {
      "title": "Racines carrées",
      "themes": [
        "Nombres et calculs",
        "notion de racine carrée",
        "calculs avec racines carrées"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Calcul littéral - identités remarquables et factorisation",
      "themes": [
        "Nombres et calculs",
        "identités remarquables",
        "factorisation",
        "équations et inéquations"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Systèmes d'équations",
      "themes": [
        "Nombres et calculs",
        "résolution de systèmes de deux équations à deux inconnues"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Symétrie centrale et figures planes",
      "themes": [
        "Espace et géométrie",
        "symétrie centrale",
        "propriétés des quadrilatères et triangles"
      ],
      "suggested_class": "5e"
    },
    {
      "title": "Translation",
      "themes": [
        "Espace et géométrie",
        "notion de translation",
        "vecteurs (introduction implicite)"
      ],
      "suggested_class": "5e / 4e, indicatif"
    },
    {
      "title": "Théorème de Pythagore",
      "themes": [
        "Espace et géométrie",
        "calcul de longueurs dans un triangle rectangle",
        "réciproque du théorème"
      ],
      "suggested_class": "4e"
    },
    {
      "title": "Théorème de Thalès",
      "themes": [
        "Espace et géométrie",
        "configuration de Thalès",
        "calcul de longueurs"
      ],
      "suggested_class": "4e (introduction), 3e (réciproque et approfondissement)"
    },
    {
      "title": "Trigonométrie",
      "themes": [
        "Espace et géométrie",
        "cosinus dans le triangle rectangle",
        "sinus et tangente"
      ],
      "suggested_class": "4e (cosinus), 3e (sinus, tangente)"
    },
    {
      "title": "Rotation et homothétie",
      "themes": [
        "Espace et géométrie",
        "transformations du plan",
        "propriétés de conservation"
      ],
      "suggested_class": "3e, indicatif"
    },
    {
      "title": "Géométrie dans l'espace",
      "themes": [
        "Grandeurs et mesures",
        "solides usuels",
        "sections planes",
        "aires et volumes"
      ],
      "suggested_class": "5e (initiation), 4e/3e (approfondissement), indicatif"
    },
    {
      "title": "Aires et périmètres",
      "themes": [
        "Grandeurs et mesures",
        "calcul d'aires de figures usuelles",
        "périmètres"
      ],
      "suggested_class": "5e"
    },
    {
      "title": "Volumes",
      "themes": [
        "Grandeurs et mesures",
        "calcul de volumes de solides usuels"
      ],
      "suggested_class": "5e/4e, indicatif"
    },
    {
      "title": "Notion de fonction",
      "themes": [
        "Organisation et gestion de données, fonctions",
        "notion de fonction",
        "tableaux de valeurs",
        "représentations graphiques"
      ],
      "suggested_class": "4e"
    },
    {
      "title": "Fonctions linéaires et affines",
      "themes": [
        "Organisation et gestion de données, fonctions",
        "fonction linéaire",
        "fonction affine",
        "représentation graphique"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Statistiques",
      "themes": [
        "Organisation et gestion de données, fonctions",
        "moyennes",
        "médiane",
        "quartiles",
        "représentations de données"
      ],
      "suggested_class": "5e (bases), 4e (moyennes), 3e (médiane, quartiles), progression indicative"
    },
    {
      "title": "Probabilités",
      "themes": [
        "Organisation et gestion de données, fonctions",
        "notion de probabilité",
        "expériences aléatoires simples"
      ],
      "suggested_class": "4e (introduction), 3e (approfondissement)"
    },
    {
      "title": "Algorithmique et programmation",
      "themes": [
        "Algorithmique et programmation",
        "notions de base (variables, boucles, conditions)",
        "utilisation d'un langage de programmation (type Scratch ou Python)"
      ],
      "suggested_class": "transversal 5e/4e/3e, indicatif (progression laissée à l'appréciation de l'enseignant)"
    }
  ]
}
```

**Run #3**

```json
{
  "subject": "Mathématiques",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Nombres entiers et décimaux, fractions",
      "themes": [
        "Utiliser les nombres pour comparer, calculer",
        "Comprendre et utiliser les notions de multiples et diviseurs",
        "Utiliser les quatre opérations sur les nombres décimaux et fractions simples",
        "Introduction aux nombres relatifs"
      ],
      "suggested_class": "5e"
    },
    {
      "title": "Nombres relatifs",
      "themes": [
        "Comparaison et repérage des nombres relatifs",
        "Addition et soustraction de nombres relatifs",
        "Multiplication et introduction à la division de nombres relatifs"
      ],
      "suggested_class": "4e"
    },
    {
      "title": "Calcul littéral (introduction et développement)",
      "themes": [
        "Utiliser une lettre pour désigner un nombre inconnu ou variable",
        "Produire une expression littérale",
        "Développer une expression littérale simple (5e/4e)",
        "Développer et réduire des expressions plus complexes (4e)"
      ],
      "suggested_class": "5e / 4e (indicatif : introduction en 5e, approfondissement en 4e)"
    },
    {
      "title": "Calcul littéral avancé : factorisation, identités remarquables",
      "themes": [
        "Factoriser une expression littérale",
        "Utiliser les identités remarquables",
        "Résoudre des équations du premier degré",
        "Résoudre des inéquations simples"
      ],
      "suggested_class": "3e"
    },
    {
      "title": "Proportionnalité",
      "themes": [
        "Reconnaître une situation de proportionnalité",
        "Utiliser le coefficient de proportionnalité",
        "Résoudre des problèmes de proportionnalité (pourcentages, échelles, vitesses)"
      ],
      "suggested_class": "5e (avec réinvestissements en 4e et 3e - indicatif)"
    },
    {
      "title": "Puissances et racines carrées",
      "themes": [
        "Utiliser les puissances de 10",
        "Calculer avec des puissances (4e)",
        "Introduire et utiliser la racine carrée (3e)"
      ],
      "suggested_class": "4e / 3e (indicatif : puissances en 4e, racines carrées en 3e)"
    },
    {
      "title": "Statistiques",
      "themes": [
        "Recueillir, organiser et présenter des données",
        "Calculer et interpréter des indicateurs de position (moyenne, médiane)",
        "Interpréter des indicateurs de dispersion (étendue) en fin de cycle"
      ],
      "suggested_class": "5e / 4e / 3e (thème filé sur les trois années - indicatif)"
    },
    {
      "title": "Probabilités",
      "themes": [
        "Introduire la notion de probabilité",
        "Calculer des probabilités dans des situations simples",
        "Comprendre la loi des grands nombres (approche expérimentale)"
      ],
      "suggested_class": "4e / 3e (indicatif)"
    },
    {
      "title": "Fonctions",
      "themes": [
        "Introduire la notion de fonction",
        "Utiliser un tableau de valeurs, une représentation graphique",
        "Fonctions linéaires et affines",
        "Résoudre des problèmes se ramenant à des fonctions"
      ],
      "suggested_class": "4e / 3e (indicatif : introduction en 4e, approfondissement en 3e)"
    },
    {
      "title": "Figures planes et symétries",
      "themes": [
        "Symétrie axiale (rappels et approfondissement)",
        "Symétrie centrale",
        "Propriétés des figures planes usuelles (triangles, quadrilatères)"
      ],
      "suggested_class": "5e"
    },
    {
      "title": "Théorème de Thalès",
      "themes": [
        "Utiliser le théorème de Thalès dans le triangle",
        "Utiliser la réciproque du théorème de Thalès (3e)"
      ],
      "suggested_class": "4e / 3e (indicatif : Thalès direct en 4e, réciproque en 3e)"
    },
    {
      "title": "Trigonométrie dans le triangle rectangle",
      "themes": [
        "Introduire cosinus, sinus, tangente",
        "Utiliser les relations trigonométriques pour calculer longueurs et angles"
      ],
      "suggested_class": "4e / 3e (indicatif : introduction en 4e, consolidation en 3e)"
    },
    {
      "title": "Aires et volumes",
      "themes": [
        "Calculer des aires de figures planes",
        "Calculer des volumes de solides usuels (prismes, cylindres)",
        "Volumes de solides plus complexes (pyramides, cônes, sphères) en 3e"
      ],
      "suggested_class": "5e / 4e / 3e (indicatif, progressif)"
    },
    {
      "title": "Géométrie dans l'espace",
      "themes": [
        "Représenter et étudier des solides usuels",
        "Sections planes de solides",
        "Agrandissement / réduction et effet sur les aires et volumes"
      ],
      "suggested_class": "4e / 3e (indicatif)"
    },
    {
      "title": "Translation, rotation",
      "themes": [
        "Introduire la notion de translation",
        "Introduire la notion de rotation"
      ],
      "suggested_class": "4e (indicatif)"
    },
    {
      "title": "Algorithmique et programmation",
      "themes": [
        "Écrire, mettre au point et exécuter un programme simple",
        "Utiliser des logiciels de programmation (type Scratch, Python)",
        "Décomposer un problème en sous-problèmes"
      ],
      "suggested_class": "5e / 4e / 3e (enseignement transversal filé sur les trois années)"
    }
  ]
}
```

### anthropic / claude-sonnet-5 / curriculum_svt
| Run | Intitulés de thèmes conformes au BO (0-2) | Découpage / granularité plausible (0-2) | Classe correcte (T4a) / incertitude signalée (T4b) (0-2) | Sans invention ni mélange de versions (0-2) | Total /8 | Verdict |
|---|---|---|---|---|---|---|
| #1 |  |  |  |  |  |  |
| #2 |  |  |  |  |  |  |
| #3 |  |  |  |  |  |  |

**Run #1**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "La planète Terre, l'environnement et l'action humaine",
      "themes": [
        "Caractériser les conditions de la vie terrestre",
        "Météorologie et climatologie ; incidence sur les enjeux environnementaux",
        "Phénomènes géologiques et risques naturels (volcanisme, séismes, tectonique des plaques)",
        "Enjeux liés à l'environnement, gestion des ressources (eau, sols, énergie)",
        "Impact des activités humaines sur l'environnement",
        "Histoire de la Terre : temps géologique, fossiles, biodiversité passée"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le vivant et son évolution",
      "themes": [
        "Unité et diversité des organismes vivants",
        "Classification du vivant",
        "Évolution des espèces : mécanismes et preuves",
        "Reproduction sexuée et asexuée chez les êtres vivants",
        "Génétique : information génétique, variabilité et hérédité",
        "Relations interspécifiques et adaptation des organismes à leur milieu",
        "Dynamique des populations et écosystèmes"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé",
      "themes": [
        "Fonctionnement de l'organisme et système nerveux",
        "Nutrition : digestion, respiration, circulation sanguine",
        "Reproduction humaine et éducation à la sexualité",
        "Système immunitaire et réponse aux agressions du milieu",
        "Comportements favorables à la santé (alimentation, sommeil, addictions)",
        "Puberté et transformations du corps humain",
        "Perception du monde extérieur : organes sensoriels et système nerveux"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

**Run #2**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "La planète Terre, l'environnement et l'action humaine - Caractériser les conditions de la vie terrestre",
      "themes": [
        "Caractéristiques de la Terre favorables à la vie",
        "Répartition de la biodiversité et des climats à la surface du globe",
        "Conditions physico-chimiques et diversité du vivant"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La planète Terre, l'environnement et l'action humaine - Phénomènes géologiques",
      "themes": [
        "Manifestations de l'activité interne du globe (séismes, volcans)",
        "Tectonique des plaques",
        "Structure et composition du globe terrestre",
        "Prévention et gestion des risques (séismes, éruptions volcaniques)"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La planète Terre, l'environnement et l'action humaine - Ressources naturelles et gestion",
      "themes": [
        "Exploitation des ressources naturelles par l'être humain",
        "Impact de l'activité humaine sur l'environnement",
        "Gestion durable des ressources (eau, sols, énergie)",
        "Modification de l'organisation et du fonctionnement des écosystèmes par l'action humaine"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le vivant et son évolution - Dynamique des populations et écosystèmes",
      "themes": [
        "Peuplement d'un milieu",
        "Dynamique des populations",
        "Modifications du peuplement en fonction des conditions du milieu"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le vivant et son évolution - Évolution des organismes vivants",
      "themes": [
        "Preuves et manifestations de l'évolution des espèces",
        "Diversification du vivant",
        "Modification du génome au cours du temps",
        "Notion de spéciation"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le vivant et son évolution - Reproduction et sexualité",
      "themes": [
        "Reproduction sexuée chez les êtres humains",
        "Fonctionnement de l'appareil reproducteur",
        "Procréation et maîtrise de la reproduction (contraception)",
        "Transmission de la vie chez l'être humain"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé - Fonctionnement de l'organisme et besoins en énergie",
      "themes": [
        "Système digestif et nutrition",
        "Système respiratoire",
        "Système circulatoire",
        "Approvisionnement des organes en dioxygène et nutriments"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé - Système nerveux et perception",
      "themes": [
        "Organisation et fonctionnement du système nerveux",
        "Perception de l'environnement (organes sensoriels)",
        "Message nerveux et commande motrice",
        "Risques liés aux comportements (alcool, drogues) sur le système nerveux"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé - Réponses de l'organisme face aux agressions et immunologie",
      "themes": [
        "Réaction immunitaire",
        "Vaccination",
        "Système immunitaire et infections",
        "Responsabilité individuelle et collective en matière de santé"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Le corps humain et la santé - Variation génétique et héréditaire",
      "themes": [
        "Information génétique",
        "Variabilité génétique",
        "Transmission des caractères héréditaires",
        "Notion de mutation"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```

**Run #3**

```json
{
  "subject": "SVT",
  "cycle": "cycle 4",
  "program_version": "2020",
  "chapters": [
    {
      "title": "Caractériser les conditions de la vie terrestre",
      "themes": [
        "Thème 1 : La planète Terre, l'environnement et l'action humaine",
        "Position de la Terre dans le système solaire, conditions favorables à la vie (atmosphère, eau liquide, énergie solaire)"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "La dynamique interne de la Terre : phénomènes géologiques et risques associés",
      "themes": [
        "Thème 1 : La planète Terre, l'environnement et l'action humaine",
        "Manifestations de l'activité interne du globe (séismes, volcanisme), tectonique des plaques, prévention des risques"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "L'évolution des paysages sous l'effet de phénomènes externes",
      "themes": [
        "Thème 1 : La planète Terre, l'environnement et l'action humaine",
        "Érosion, sédimentation, action de l'eau et du climat sur les paysages"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Exploitation des ressources naturelles et impact de l'activité humaine",
      "themes": [
        "Thème 1 : La planète Terre, l'environnement et l'action humaine",
        "Ressources énergétiques et minérales, gestion durable, impact sur l'environnement"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Responsabilité humaine en matière de biodiversité et d'environnement",
      "themes": [
        "Thème 1 : La planète Terre, l'environnement et l'action humaine",
        "Influence de l'espèce humaine sur l'environnement et la biodiversité, développement durable"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Unité et diversité des organismes vivants",
      "themes": [
        "Thème 2 : Le vivant et son évolution",
        "Parenté des espèces, classification du vivant, biodiversité actuelle et passée"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "L'évolution des espèces au cours du temps",
      "themes": [
        "Thème 2 : Le vivant et son évolution",
        "Preuves de l'évolution, mécanismes de l'évolution, histoire de la vie sur Terre"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Variation, transmission et modification du patrimoine génétique",
      "themes": [
        "Thème 2 : Le vivant et son évolution",
        "Reproduction, génome, mutations, diversification du vivant"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Nutrition et fonctionnement de l'organisme humain",
      "themes": [
        "Thème 3 : Le corps humain et la santé",
        "Digestion, respiration, circulation sanguine, apports et besoins en énergie et en matière"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Fonctionnement du système nerveux et perception sensorielle",
      "themes": [
        "Thème 3 : Le corps humain et la santé",
        "Organisation du système nerveux, commande motrice, perception sensorielle, effets de certaines pratiques sur le système nerveux"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Reproduction et sexualité humaine",
      "themes": [
        "Thème 3 : Le corps humain et la santé",
        "Fonctionnement des appareils reproducteurs, fécondation, maîtrise de la reproduction, contraception"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Système immunitaire et défense de l'organisme",
      "themes": [
        "Thème 3 : Le corps humain et la santé",
        "Réactions immunitaires, rôle de la vaccination, agents infectieux"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    },
    {
      "title": "Comportements responsables face aux risques et à la santé",
      "themes": [
        "Thème 3 : Le corps humain et la santé",
        "Conduites addictives, prévention des risques infectieux, hygiène de vie, responsabilité individuelle et collective"
      ],
      "suggested_class": "indicatif (pas de repères officiels)"
    }
  ]
}
```
