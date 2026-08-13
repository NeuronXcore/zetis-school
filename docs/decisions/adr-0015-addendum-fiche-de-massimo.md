# Addendum ADR-0015 — La fiche que Massimo fabrique lui-même

## Statut

Proposé — 2026-08-12

> Tranche la **sous-décision explicitement différée** de l'ADR-0015 (§ Alternatives, dernier
> point) : *« Fiche générée par Massimo lui-même — pédagogiquement l'acte le plus fort (faire sa
> fiche ≫ la lire), **mais** heurte la règle "seul le contenu validé atteint Massimo". […]
> **Différé** ; à trancher en addendum. »*
>
> L'ADR-0015 n'est **pas rouvert** : la fiche ZETIS, son `FicheSpec` fermé à budgets, sa
> génération dérivée du cours canonique (ADR-0011) et sa validation Papa restent inchangés.
> Cet addendum **ajoute un second auteur** au même objet.
>
> Consomme : `adr-0011` (contexte canonique), `adr-0012` (STT Whisper local),
> `adr-0026`/`adr-0027` (voix Piper, garde-fou « ZETIS oriente, il n'écrit pas »).

## Contexte

La fiche actuelle est **servie** à Massimo : ZETIS la fabrique, Papa la valide, Massimo la relit.
C'est utile pour réviser, mais l'acte qui fait apprendre — **choisir ce qui compte, et le
redire avec ses mots** — reste entièrement du côté de la machine.

Le besoin exprimé par le commanditaire : *« comment apprendre et aider Massimo à concevoir ses
fiches avec l'aide pédagogique de ZETIS ; plusieurs versions pour Massimo avec le soutien de
ZETIS »*.

Deux précisions apportées en cadrage, qui ont déplacé le design :

1. **les échanges doivent être bienveillants**, et **verbaux** (« ce sera plus vivant ») ;
2. **ZETIS analyse ce que Massimo a écrit et propose des améliorations.**

### Le risque central, nommé d'emblée

> Si ZETIS propose une amélioration et que Massimo l'accepte d'un clic, on a reconstruit la
> fiche générée, avec des étapes en plus.

Toute la décision qui suit est ordonnée par ce risque. Et un second, moins visible :
**résumer est une compétence qui s'apprend** — un élève non entraîné devant une fiche vide
recopie son cours. La page blanche est donc interdite ; ce qui est en jeu n'est pas
« laisser Massimo faire », c'est **lui apprendre à faire**.

## Constat read-before-code (2026-08-12, code réel)

Sept constats. Les deux premiers changent la décision, le cinquième la sécurise, et les deux
derniers — relevés en seconde passe, après la construction du mockup — commandent à eux seuls
le §11.

1. **`source` existe déjà, avec un vocabulaire fermé `generated | manual`**
   ([content.py:69](../../apps/backend/app/db/models/content.py:69)). Il dit **comment** la
   pièce a été produite, pas **à qui** elle appartient. ⚠️ Ne **pas** y ajouter une valeur
   `massimo` : ce serait mélanger deux axes, et une fiche personnelle partiellement assistée
   n'aurait plus de valeur juste. → `author` est une **colonne nouvelle**, second axe.

2. 🔴 **Le gate `validated` est appliqué par PLUSIEURS lecteurs du flux élève**, chacun avec sa
   propre clause : `list_subject_fiches`
   ([service.py:446](../../apps/backend/app/modules/fiches/service.py:446)), `fiches_summary`
   ([service.py:463](../../apps/backend/app/modules/fiches/service.py:463)), et la lecture
   unitaire (404 si non validée). C'est **exactement le motif du piège de l'agenda** (trois
   lecteurs non filtrés de `learning_events`). Une colonne `author` ajoutée sans toucher les
   trois lecteurs donne l'un ou l'autre de deux défauts : la fiche de Massimo lui est
   **invisible**, ou — bien pire — la clause est relâchée et **une fiche ZETIS non validée
   fuit**. → Le prédicat de lecture élève devient **un helper unique et partagé**, jamais
   trois clauses recopiées.

3. **`fiche_views` est déjà clé `(student_id, fiche_id)`**
   ([progress.py:282](../../apps/backend/app/db/models/progress.py:282)) : le mécanisme « vue /
   nouveau » fonctionne tel quel sur une fiche personnelle. Rien à faire.

4. **`fiches` ne porte aucun `student_id`** — la table est aujourd'hui non nominative (une fiche
   ZETIS appartient à une leçon, pas à un enfant). Une fiche personnelle en a besoin.
   → `student_id` **nullable** ; `NULL` = fiche ZETIS. Cohérent avec la trajectoire multi-enfant
   de `CLAUDE.md` sans la précipiter.

5. **`validated_by` a le vocabulaire `parent | parent_bulk | system`**
   ([content.py:66](../../apps/backend/app/db/models/content.py:66)), et `pilotage_tree`
   n'applique **aucun** filtre `validated` (assumé, [service.py:319](../../apps/backend/app/modules/fiches/service.py:319)).
   Deux conséquences : la fiche de Massimo **n'a pas de cycle de vie éditorial** (elle n'est ni
   validée ni rejetée — elle est à lui), et si rien n'est fait elle **apparaîtrait dans l'arbre
   de pilotage de Papa**, avec ses boutons Valider / Rejeter / Éditer. Ce serait la négation de
   la décision §5.6.

6. 🔴 **Toute édition d'un spec renvoie la fiche en `pending`** — `update_fiche_spec` écrit
   `row.validation_status = "pending"` sans condition
   ([service.py:264](../../apps/backend/app/modules/fiches/service.py:264)), conformément au cycle
   éditorial de l'addendum ADR-0016. Conséquence **non évidente et dimensionnante** : un
   enrichissement de masse des fiches déjà validées (§11) les **retirerait toutes à Massimo
   d'un coup**, jusqu'à ce que Papa les revalide une par une. Le besoin « mettre à jour les
   fiches déjà créées » ne peut donc pas être servi par une passe en lot naïve.

7. **`FicheSpec` est en `extra="forbid"`** ([schemas.py:39](../../apps/backend/app/modules/fiches/schemas.py:39)).
   Deux effets opposés : un champ **optionnel avec défaut** se lit sans casse sur les `spec_json`
   existants — **aucune migration de données n'est nécessaire** (§10) ; mais le schéma est aussi
   ce qui est envoyé au modèle (`FicheSpec.model_json_schema()`), donc **ajouter un champ change
   la génération de TOUTES les fiches**, pas seulement des nouvelles. Un modèle qui voit un champ
   se croit tenu de le remplir — c'est exactement le mécanisme de l'acronyme forcé.

## Décision

### §1 — Un seul objet, deux auteurs

Pas de table parallèle. La table `fiches` reçoit **deux colonnes** :

```python
author: Mapped[str] = mapped_column(String(10), default="zetis")   # zetis | massimo
student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), nullable=True)
```

`FicheSpec` est **inchangé** — et c'est le cœur du dispositif : le schéma fermé à budgets bornés
(`essentiel` 2–3 phrases, `points_cles` ≤ 5, `definitions` ≤ 4…), conçu pour empêcher **le LLM**
de déborder, contraint **Massimo** exactement de la même façon : *« tu n'as droit qu'à 5
points-clés, choisis. »* **La contrainte de format est la pédagogie**, et elle est déjà écrite.

Bénéfice structurel : les deux fiches ayant **la même forme**, la comparaison est **champ à
champ** (`points_cles` de Massimo contre `points_cles` de ZETIS). Avec du texte libre des deux
côtés, cette comparaison serait de la bouillie — c'est elle qui porte tout le §6.

### §1 bis — 🔴 Un brouillon n'est **pas** un `FicheSpec`

Constat né du cadrage de la reprise (« Massimo doit pouvoir revenir sur une fiche déjà faite ») :
une sélection à **3 points-clés sur 5**, sans `essentiel`, ne passe **aucune** des bornes du
`FicheSpec` (`essentiel` est `min_length=1`, obligatoire). Or reprendre une fiche commencée
suppose exactement de **persister cet état incomplet**.

Deux issues, une seule acceptable :

- ~~relâcher les bornes du `FicheSpec`~~ — **détruirait le « 1 leçon = 1 page » garanti par
  construction**, qui est la décision fondatrice de l'ADR-0015. Écarté sans discussion ;
- **un second schéma, permissif, pour l'état intermédiaire** : `FicheDraft` — mêmes champs, tous
  optionnels, aucune borne minimale, mêmes bornes **maximales** (la place sur la page reste
  bornée même en brouillon).

```python
class FicheDraft(BaseModel):
    """État INTERMÉDIAIRE d'une fiche en cours de fabrication. Jamais servi comme une fiche,
    jamais imprimable, jamais dérivable (ni SRS ni quiz). Devient un FicheSpec quand il valide."""
    model_config = ConfigDict(extra="forbid")
    # mêmes champs, tous optionnels, bornes MAX conservées, aucune borne MIN
```

`FicheSpec` reste donc **littéralement inchangé** (§1), et la promesse de l'ADR-0015 tient : un
brouillon n'est pas une fiche, il **devient** une fiche le jour où il valide le schéma strict.
Le passage `FicheDraft` → `FicheSpec` est le moment où la fiche existe.

⚠️ **Conséquence à ne pas manquer** : tant qu'une fiche personnelle est un brouillon, elle n'est
ni exportable en A5, ni convertible en cartes SRS. Ce n'est pas une restriction arbitraire —
c'est ce qui empêche un demi-travail d'entrer dans le circuit de révision.

### §2 — Le gate porte sur ce que ZETIS **sert**, jamais sur ce que Massimo **écrit**

C'est la levée du blocage nommé par l'ADR-0015. La règle de sécurité protège le **contenu servi**
à l'enfant ; une fiche qui sort de l'enfant n'est pas du contenu servi. Le projet a déjà cette
catégorie : « productions de Massimo » est une classe de source RAG distincte (`CLAUDE.md`
§ Règles RAG).

Prédicat de lecture élève, **un seul helper** (constat 2) :

```python
def _readable_by_student(student_id: int):
    return or_(
        and_(Fiche.author == "zetis",   Fiche.validation_status == "validated"),
        and_(Fiche.author == "massimo", Fiche.student_id == student_id),
    )
```

**Sécurité par construction** : `validation_status` d'une fiche personnelle vaut **`personal`**
— une 4ᵉ valeur, hors cycle éditorial. Ainsi, **si un lecteur oublie le filtre d'auteur**, sa
clause `== "validated"` exclut naturellement la fiche de Massimo. Le mode d'échec de l'oubli
devient « sa fiche ne s'affiche pas » (visible, bénin) au lieu de « du contenu non validé
fuit » (silencieux, grave). On choisit le défaut qui se voit.

Corollaire (constat 5) : **`pilotage_tree` exclut `author='massimo'`**. Papa ne valide pas, ne
rejette pas, n'édite pas la fiche de son fils. Il la **lit**, sur une surface séparée.

**Les dérivés, eux, repassent par le gate normal** : une carte SRS ou un quiz engendré depuis la
fiche de Massimo est du contenu servi, et suit le cycle habituel.

### §3 — La fiche ZETIS reste, et devient le corrigé — **un défaut, pas un verrou**

> ⚠️ **RÉVISÉ le 2026-08-12, arbitrage du commanditaire : « lire avant de fabriquer, c'est ok ».**
> La version initiale posait un **verrou** — la fiche ZETIS ne se déverrouillait qu'**après** la
> tentative. Elle est **révoquée**.

Version retenue : **rien n'est verrouillé.** Massimo peut lire le cours, et lire la fiche ZETIS,
avant de fabriquer la sienne. Ce qui change n'est pas l'accès, c'est **ce qui s'ouvre en premier** :

- sur une leçon où une fiche personnelle existe ou est attendue, la tuile ouvre **sa fiche ou son
  atelier** ; la fiche ZETIS est **à un clic**, jamais plus loin ;
- la **comparaison côte à côte** (§6) reste proposée **après** une tentative — elle n'a de sens
  qu'à ce moment-là, mais elle ne conditionne plus rien.

**Pourquoi la révision est meilleure que ma version.** Un verrou est une contrainte imposée à
l'enfant, et `CLAUDE.md` proscrit l'objectif subi : *« un objectif subi se fuit, un objectif qu'on
s'est donné se tient »*. Le §4 refuse déjà d'imposer un niveau d'aide ; verrouiller le corrigé
était la même faute, à un autre endroit. **Un défaut oriente sans contraindre** — et il n'a pas
besoin d'être défendu par du code (ni 403, ni état « a-t-il tenté ? » à tenir côté serveur).

Argument pédagogique, du reste : on ne résume pas ce qu'on n'a pas lu. **Interdire de lire avant
de fabriquer n'a jamais eu de sens pour le cours**, et l'étendre à la fiche ZETIS revenait à
traiter la lecture comme une triche.

Elle garde ses deux autres rôles : référence de comparaison pour le §6, et fiche de révision
ordinaire sur les leçons sans fiche personnelle. **Aucune fiche ZETIS existante n'est touchée.**

⚠️ **Le risque demeure, il est simplement assumé autrement** : si la fiche toute faite est à un
clic, Massimo peut la lire au lieu de fabriquer la sienne. Ce n'est plus le code qui l'en empêche,
c'est le fait qu'il ait choisi d'ouvrir l'atelier. Le signal d'alerte correspondant est nommé plus
bas.

### §4 — L'échafaudage est **implicite** : trois niveaux dans le code, aucun menu à l'écran

Trois états d'échafaudage — **je complète** (fiche pré-remplie à trous), **je choisis** (12 phrases
candidates tirées du cours, 5 à retenir, aucune écriture), **je fais** (production libre, ZETIS
muet). Ils vivent comme **état serveur de la session de fiche**, et ne sont **jamais** affichés
comme un choix de niveau.

Motif : demander à Massimo « quel niveau d'aide veux-tu ? » lui demande de **s'auto-évaluer avant
d'avoir vu la tâche** — or cette lucidité est précisément ce qu'on construit, elle ne peut pas
être un prérequis. Et un menu l'**étiquette** (« je prends le facile »), ce que `CLAUDE.md`
proscrit.

Le niveau bouge donc par l'échange : **« aide-moi »** le fait descendre d'un cran,
**« laisse-moi essayer »** le fait remonter, et sur blocage détecté (champ vide durable, deux
essais) ZETIS **propose une fois** — jamais deux, jamais imposé. Ce que Massimo choisit n'est pas
un niveau, c'est *« maintenant, est-ce que je veux un coup de main »* : une question à laquelle un
enfant de 12 ans peut répondre honnêtement. **L'objectif reste choisi, jamais subi**
(`CLAUDE.md` § Gamification).

### §5 — Le contrat d'échange : sept règles, portées par un prompt versionné

Prompt `app/prompts/fiche_coach.py`, même lignée que `eli5.py` et `chat.py` — la bienveillance de
ce projet est portée par les prompts, pas par des intentions.

1. **ZETIS parle de la fiche, jamais de Massimo.** « Cette phrase est un peu longue » ≠ « tu
   écris trop long ». La critique vise l'objet.
2. **Nommer d'abord une réussite, et précisément.** « Ton point sur X, c'est celui que ton cours
   met en gras » ≫ « bravo ! ». Le compliment générique est du bruit ; le précis est une
   information.
3. **Deux questions maximum avant de donner quelque chose de concret.** C'est le vice du tuteur
   socratique : une troisième question à la place d'une réponse, et l'enfant se sent baladé.
   **Budget dur dans le prompt.**
4. **« Je sèche » est toujours visible et ne coûte rien.** Réponse jamais déçue, jamais « tu es
   sûr ? ». Si dire « je ne sais pas » est gratuit, il le dit — sinon il recopie son cours.
5. **ZETIS ne dit jamais « c'est faux », il dit « ce n'est pas dans ton cours ».** Ce n'est pas
   qu'une question de ton : le modèle **produira des faux positifs**, et « pas dans ton cours »
   est un fait vérifiable là où « faux » est un jugement que ZETIS n'a pas les moyens de porter.
   Sortie de secours : ouvrir le passage source (le `CoursPanel` est déjà à droite de la fiche),
   puis « on demande à Papa ? » via `notion_requests`.
6. **Le dernier mot est à Massimo.** Il refuse une suggestion et garde sa phrase, **en un clic,
   sans confirmation ni commentaire**.
7. 🔴 **ZETIS n'écrit jamais dans la fiche à la place de Massimo.** Il propose des phrases
   **tirées du cours** ; le geste de les y mettre est toujours un clic de Massimo. C'est la
   transposition directe du garde-fou `chat_v2` — *« ZETIS **oriente**, il n'**écrit pas** »*
   ([chat.py:6](../../apps/backend/app/prompts/chat.py:6), ADR-0027 §3).

Les six premières règlent le ton. **La 7ᵉ est celle qui fait que la fiche est la sienne** ; sans
elle, les six autres décorent une fiche générée.

#### §5 bis — La voix

Oui, ZETIS parle. La brique existe et est partagée : `TtsProvider` (Piper local, seul provider)
[provider.py:28](../../apps/backend/app/modules/tts/provider.py:28), déjà consommée par le chat,
le routeur `ai` et les capsules. **Quatrième consommateur, zéro brique nouvelle.**

Règle de partage, imposée par le média : **ZETIS parle le relationnel, il écrit le référentiel.**
L'audio est linéaire et volatil ; une fiche est spatiale et persistante. Lire à voix haute 12
phrases candidates serait un supplice — ni balayage du regard, ni retour en arrière, ni
comparaison. Et doubler à l'oral un texte qui est *l'objet du travail* dégrade la compréhension.

| ZETIS **parle** | ZETIS **écrit** |
|---|---|
| accueil de session, une phrase | les 12 phrases candidates |
| la question qui relance | la comparaison avec le cours, point par point |
| « tu veux un coup de main ? » | ce qu'il reste à attraper |
| la réussite nommée | tout ce qui doit être relu ou manipulé |

Jamais les deux pour la même chose. Quatre garde-fous :

- **toujours sur un geste de Massimo** (bouton 🔊). Contrainte technique — `playSpeech` exige un
  `AudioContext` débloqué par un geste, **piège payé au test live du 2026-08-02** — *et* règle
  produit : *« l'annonce s'AFFICHE, elle ne se parle pas »*
  ([page-chat.md:237](../frontend-massimo/page-chat.md:237)) ; une voix qui part seule est une
  notification poussée ;
- **silence pendant qu'il écrit ou dicte.** Le barge-in audio réel n'existe pas
  ([page-chat.md:156](../frontend-massimo/page-chat.md:156)) : ZETIS ne peut pas être interrompu,
  donc il ne doit pas parler quand Massimo veut parler. Sur iPhone sans écouteurs, sa voix
  repartirait droit dans le micro Whisper ;
- **le muet est mémorisé** — il ne re-clique pas à chaque session ;
- **une à deux phrases maximum.** Une longue phrase passée dans Piper sonne froide et robotique,
  et défait le travail des sept règles.

La voix du **navigateur** (Web Speech) reste **interdite** — données vocales hors local-first
([page-chat.md:61](../frontend-massimo/page-chat.md:61)).

**Effet de bord favorable** : les répliques relationnelles forment un **petit ensemble fixe** (elles
sont déterministes, cf. §6), donc leur audio est **synthétisé une fois et mis en cache** — zéro
appel Piper à l'exécution, zéro latence. Ce qui exigerait une synthèse live (le retour de
comparaison, variable) est précisément ce qui est classé « écrit ».

### §6 — L'analyse : ZETIS rend le défaut visible, il ne fournit pas la phrase

Quatre types d'analyse, de fiabilité très inégale — les distinguer est ce qui rend la
fonctionnalité tenable :

| Ce que ZETIS regarde | Comment | Fiabilité |
|---|---|---|
| **`recopie`** — phrase reprise du cours | recouvrement de n-grammes avec le texte source | **déterministe, 100 %** |
| **`trop_long`** — au-delà des bornes | compte de caractères (`FICHE_BUDGETS`) | **déterministe** |
| **`idee_manquante`** | comparaison champ à champ avec la fiche ZETIS de la même leçon | bonne — ensemble candidat **borné et connu** |
| **`absent_du_cours`** | LLM sur extrait canonique | **faible — maillon fragile** |

Deux observations qui commandent le reste. D'abord, **le signal le plus important
pédagogiquement est aussi le moins cher et le plus fiable** : la phrase recopiée mot pour mot est
le mode d'échec du résumé non entraîné, et se détecte sans LLM ni faux positif. La réponse de
ZETIS n'est surtout pas une reformulation, mais : *« ces mots viennent de ton cours — tu peux le
dire avec les tiens ? »* Ensuite, la fiche ZETIS existant déjà pour la même leçon (§3), on ne
demande pas au modèle « qu'est-ce qui manque ? » (question ouverte, réponse molle) mais « cette
idée-là est-elle dite autrement ? » (question fermée, sur un ensemble de 5).

**Proposer sans donner** — escalade, déclenchée par le « aide-moi » de Massimo (§4) :

1. **il montre** — surligne, nomme ce qui cloche, se tait ;
2. **il oriente** — une question : « si tu devais garder 5 mots là-dedans, lesquels ? » ;
3. **il donne du matériau** — **deux ou trois** formulations possibles, dont « aucune des trois ».

Le passage de 1 à 3 propositions n'est pas cosmétique : **une suggestion unique est une correction
à accepter, trois sont un choix à faire** — et le choix demande un jugement, donc travaille.

**Quand l'analyse tourne** — **jamais pendant la frappe.** Un correcteur qui commente chaque
phrase au moment où elle sort est un évaluateur par-dessus l'épaule : l'enfant cesse d'écrire, ou
écrit pour plaire. Elle tourne **sur demande** (« regarde ma fiche ») ou à la fermeture d'une
section. Patron déjà établi dans le projet : le reverse ELI5, « j'ai fini, dis-moi ».

**Budget de retour** — objet fermé, même discipline que le reste du dépôt :

```ts
export interface FicheFeedback {
  reussites: string[];                    // 1–2, précises, JAMAIS vide
  remarques: {                            // 0–2 MAXIMUM (borne dure)
    section: FicheSection;                // vocabulaire fermé
    index: number;
    type: 'recopie' | 'trop_long' | 'idee_manquante' | 'absent_du_cours';
    message: string;                      // template DÉTERMINISTE pour les 2 premiers types
    piste?: string;                       // une question, jamais la phrase corrigée
  }[];
}
```

Sept remarques ne sont pas de l'aide, c'est un bulletin — et un enfant abandonne. `type` étant
fermé, `recopie` et `trop_long` sont des **templates serveur, zéro LLM** ; le modèle n'intervient
que sur les deux derniers. C'est la même ligne de partage que le message d'accueil, *« composé
SERVEUR et déterministe (aucun LLM) »* ([page-accueil.md:82](../frontend-massimo/page-accueil.md:82)) :
**ce qui est fixe est déterministe, ce qui varie passe par le modèle.**

### §7 — Les versions dans le temps (« la fiche qui rétrécit ») — **remontées en périmètre**

⚠️ **Révision du 2026-08-12** : ce § était « décidé, pas implémenté ». La demande « Massimo doit
pouvoir revenir sur une fiche déjà faite » le **rend nécessaire dès la slice 1** — rouvrir une
fiche finie ne doit ni l'écraser, ni être interdit. Deux régimes, et un seul mérite une version :

- **brouillon → reprise en place** : il continue où il s'était arrêté, aucune version créée ;
- **fiche finie → nouvelle version** : l'ancienne reste lisible, la nouvelle est ouverte en
  travail.

Coût vérifié, et il est faible : `fiches.lesson_id` est **indexé, pas unique**, et
`list_fiches_for_lesson` renvoie déjà une **liste** — plusieurs fiches par leçon sont **déjà
supportées** par le modèle. Le besoin se réduit à une colonne `version` et à un ordre.

**Le remplissage se fait par passes, pas d'une traite.** Six sections enchaînées font une séance
longue, contre la contrainte des 5 minutes (§ Périmètre). Une fiche se remplit **une section à la
fois, sur plusieurs jours** — ce qui n'est pas une concession mais exactement le mécanisme des
versions ci-dessous. **Aucune section n'est obligatoire pour que la fiche existe** : une fiche à
deux sections est une fiche.

Axe **distinct** du §4 — à ne pas confondre : le §4 dit *combien ZETIS tient la main*, le §7 dit
*combien de passes dans le temps*.

- **v1**, après le cours : longue, encore collée au cours ;
- **v2**, après un quiz ou une session SRS : corrigée **par les faits** (ce sur quoi il s'est
  trompé), pas par l'avis de ZETIS ;
- **v3**, avant le contrôle : compressée à ce qui est encore fragile.

Massimo **voit ses versions côte à côte**. La trajectoire (longue et recopiée → courte et dans ses
mots) est une preuve d'apprentissage lisible, et un signal que ZETIS ne mesure aujourd'hui nulle
part : non pas « sait-il répondre », mais **« sait-il ce qui compte »**.

### §8 — Le plan des sections ne change pas ; leur **mode d'auteur**, si

C'est l'apport principal de la seconde passe de cadrage. Les cinq sections de l'ADR-0015 sont
bonnes — ce qui manquait, c'est **qui remplit quoi, et comment**. Elles ne se fabriquent pas de la
même façon : certaines se **choisissent**, d'autres ne peuvent que s'**écrire**, et une ne devrait
être écrite par personne.

| Section | Qui la remplit | Comment | Slice |
|---|---|---|---|
| ⭐ `essentiel` | Massimo | **champ libre / dictée**, avec amorce | 2 |
| 📖 `definitions` | ZETIS le **terme**, Massimo la **définition** | champ libre court | 2 |
| 🔑 `points_cles` | Massimo | **choix** parmi 12 candidates | **1** |
| ⚠️ `erreurs_a_eviter` | **son historique d'erreurs**, confirmé par lui | pré-rempli, reformulable | 3 |
| 💡 `mini_exemple` | Massimo | champ libre | 3 |
| 🎩 `mnemonique` | Massimo l'invente, ZETIS après | champ libre, **conditionnel** | 3 |

Deux conséquences qui ne se déduisaient pas de la liste :

- 🔴 **`essentiel` ne peut pas se choisir.** C'est une **synthèse** : par définition elle n'existe
  nulle part dans le cours, donc aucune phrase candidate ne peut la porter. Champ libre
  obligatoire — et c'est la section la plus difficile des six.
- 🔴 **`erreurs_a_eviter` ne se rédige pas, ça se constate.** Un piège n'est pas une idée qu'on
  décide de retenir, c'est une erreur dans laquelle on est tombé. Ni Massimo ni ZETIS ne devraient
  l'inventer : ZETIS **a la donnée** (quiz ratés, cartes SRS échouées, verdicts de mission).
  C'est la **seule** section que ZETIS peut pré-remplir **sans enfreindre la règle 7** — parce
  qu'il ne propose pas *une idée*, il rappelle *un fait de Massimo* : « tu t'es trompé deux fois
  sur foyer / épicentre, on le met en piège ? ». Écarter un piège **n'efface aucune mesure** :
  l'erreur reste dans son historique, elle ne va simplement pas sur la fiche.

`definitions` mérite une note : ZETIS donne le terme, Massimo écrit la définition — c'est déjà un
test de récupération, et cela devient une **carte SRS recto/verso sans aucune transformation**
(recto le terme de ZETIS, verso la phrase de Massimo). C'est *sa* formulation qu'il révisera.

### §9 — Les champs libres

Ils sont nécessaires (§8) et ce sont eux qui peuvent tuer la fonctionnalité. Trois règles :

1. **Jamais de zone de saisie vide — une amorce.** « Un séisme, c'est… » supprime l'essentiel du
   coût de la page blanche. Même principe que le `FicheSpec` : la contrainte aide.
2. **La dictée avant le clavier**, surtout pour `essentiel`. Whisper local est déjà là
   (ADR-0012), et dire à voix haute est bien plus facile qu'écrire à 12 ans — c'est la
   « verbalisation par Massimo » de `CLAUDE.md`. ⚠️ Pendant l'enregistrement, **ZETIS se tait et
   ses boutons de voix se désactivent** (§5 bis : pas de barge-in).
3. **Le budget se montre comme de la place, jamais comme un compteur.** `FICHE_BUDGETS` existe
   déjà : « il te reste de la place pour 2 lignes », et à saturation « ta fiche est pleine — et
   c'est très bien ». Jamais « 412 / 600 », jamais de rouge. La borne est dure côté serveur ; sa
   **présentation** à un enfant est une décision distincte.

**« Je sèche » existe par section, pas une fois pour la fiche.** Sécher sur une définition n'est
pas sécher sur la fiche (§5, règle 4). Et **quitter une section vide n'est pas un abandon** : la
fiche reste *commencée*, jamais « inachevée ».

Les deux analyses déterministes du §6 (`recopie` par n-grammes, `trop_long`) fonctionnent
**telles quelles** sur du texte libre. C'est le LLM qui devient plus fragile — raison
supplémentaire de garder `absent_du_cours` hors périmètre.

### §10 — `mnemonique` : 6ᵉ section, **conditionnelle**

Extension prévue par l'ADR-0015 §2 (« le vocabulaire s'étend **section par section** si besoin,
comme le `CapsuleSpec` de l'`adr-0007` ») — donc la voie sanctionnée, pas une entorse.

```ts
mnemonique?: { moyen: string; sert_a: string };   // 0–1
```

**La condition est tout le sujet.** Un moyen mnémotechnique marche sur une **liste ou un ordre
arbitraire** (les planètes, les conjonctions de coordination). Sur un concept, il ne marche pas :
il n'y a pas de mnémonique pour « pourquoi la Terre tremble ». Combiné au constat 7
(`extra="forbid"` : le schéma part au modèle, et un modèle qui voit un champ se croit tenu de le
remplir), demander un mnémonique à chaque fiche produirait **des acronymes forcés plus durs à
retenir que la chose elle-même, sur peut-être 4 leçons sur 5**.

Trois garde-fous, tous nécessaires ensemble :

- champ **optionnel** avec défaut `None` ;
- consigne de prompt explicite : *« n'en propose que s'il y a une liste ou un ordre arbitraire à
  retenir ; sinon laisse vide »* ;
- **au moins un exemple few-shot où `mnemonique` est nul.** C'est le seul des trois qui agit sur
  le comportement réel du modèle plutôt que sur son instruction. **Le vide doit être le cas
  fréquent et normal.**

Et le principe qui rattache la section au reste du chantier :

> **Le meilleur moyen mnémotechnique est celui que Massimo invente.** Celui d'un autre est une
> chose de plus à mémoriser ; le sien s'accroche à ses propres associations.

Donc le patron du §3, appliqué une seconde fois : ZETIS **détecte l'occasion** (« il y a 5 étapes
dans l'ordre — ça, ça se retient avec un truc »), **Massimo invente**, et ZETIS ne montre le sien
**qu'après**, comme un corrigé. C'est aussi le seul endroit de la fiche où **le ridicule est une
qualité** — un mnémonique bête se retient mieux, et il faut le lui dire.

**Libellé — « Mnemonics », en anglais.** Arbitré par le commanditaire le 2026-08-12, contre
« Mon truc pour retenir » que j'avais proposé : le terme anglais est court, il se retient, et il
évite « moyen mnémotechnique », qui est un mot d'adulte. Le champ reste `mnemonique` au schéma —
le reste du `FicheSpec` étant nommé en français (`points_cles`, `erreurs_a_eviter`,
`mini_exemple`), la convention interne ne bouge pas. **Écart libellé / API assumé**, au même titre
que les paliers d'autonomie de la sidebar Papa.

### §11 — Les fiches **déjà créées** : enrichissement à la demande, **jamais en lot**

Besoin exprimé : *« il faut prévoir de mettre à jour les fiches déjà créées avec le
mnémotechnique »*. Le read-before-code interdit la solution évidente.

**Lecture : rien à faire.** Champ optionnel à défaut `None` + `extra="forbid"` (constat 7) ⇒ les
`spec_json` existants, dépourvus de la clé, **valident sans modification**. Aucune migration de
données, aucune reprise de l'existant côté lecture.

**Écriture : le piège.** Toute édition d'un spec repasse la fiche en `pending` (constat 6, sans
condition). Donc :

> 🔴 Une passe d'enrichissement en lot sur les fiches validées **les retirerait toutes à Massimo
> en même temps**, jusqu'à revalidation de Papa une par une. Un enfant qui ouvre l'app pendant
> cette fenêtre trouve ses decks vides — sans que rien n'ait échoué.

Trois options, une seule retenue :

- ~~régénérer les fiches~~ : écraserait le contenu que Papa a validé **et les éditions manuelles**
  faites via `FicheEditorModal`. Écarté.
- ~~enrichir en lot puis valider en masse~~ (`PARENT_BULK` existe pourtant) : laisse la fenêtre
  ci-dessus ouverte, et surtout — la section étant **conditionnelle** (§10) — produirait ~4
  propositions vides ou forcées sur 5, que Papa devrait rejeter une par une. Mauvais rendement.
  Écarté.
- ✅ **Enrichissement à la demande, fiche par fiche, précédé d'une détection d'occasion.** ZETIS
  **signale** les fiches existantes qui présentent une occasion (une liste ou un ordre arbitraire
  dans `points_cles`) ; Papa n'enrichit que celles-là, une à une, et la revalidation est immédiate
  puisqu'il vient de la lire. Aucune fenêtre d'invisibilité : une seule fiche à la fois quitte le
  service, le temps d'un clic.

La détection d'occasion est **une passe de lecture seule** : elle n'écrit pas dans `spec_json`,
donc elle ne déclenche pas le retour en `pending`. C'est ce qui rend le dispositif sûr.

Et pour les **fiches de Massimo** déjà faites : rien de spécial à prévoir — ajouter un truc pour
retenir, c'est **la retravailler**, donc une nouvelle version (§7). Le mécanisme existe déjà.

### §12 — Le gabarit : l'atelier, la sidebar, et le cours qu'on appelle

⚠️ **Angle mort du premier cadrage, signalé par le commanditaire le 2026-08-12** : les §1 à §11
décrivent *ce que Massimo fait*, jamais *où ça se pose à l'écran*. J'avais repris le `CoursPanel`
« à droite » hérité du viewer en lecture seule sans le réexaminer pour un atelier devenu une
**colonne de six étapes**. Quatre constats de code, dont trois interdisent la reprise telle quelle.

1. **La sidebar est dans le flux au-dessus de `md`** (`md:static`, `fixed inset-y-0 left-0 z-40`
   en dessous, [MassimoSidebar.tsx:53](../../apps/frontend-massimo/src/components/MassimoSidebar.tsx:53)).
   Elle **vole de la largeur en permanence** sur desktop. Sidebar + colonne d'atelier + cours à
   droite = **trois colonnes** : serré sur MacBook, intenable sur iPad.
2. 🔴 **`CoursPanel` n'est `sticky` qu'au-dessus de `lg`**
   ([CoursPanel.tsx:55](../../apps/frontend-massimo/src/components/CoursPanel.tsx:55)). En dessous,
   « Voir le cours » **empile le cours SOUS la fiche**. Tolérable sous une fiche courte ; avec six
   étapes au-dessus, **le cours devient inatteignable**. C'est très exactement le défaut que
   l'`adr-0052` vient de constater le même jour sur la banque de nœuds des mindmaps.
3. 🔴 **`CoursPanel` se mesure en `vh`** (`max-h-[80vh]`, `lg:max-h-[calc(100vh-2rem)]`) — ce que
   l'`adr-0052` §2 vient de condamner : le viewport n'est pas le conteneur.
4. **`FicheSubjectPage` porte déjà trois états dans une seule page** (liste `list`, fiche
   `openIdx`, cours `coursOpen`). L'atelier y serait le **quatrième**.

**Décisions.**

- **L'atelier est une page à part entière, en plein écran** (`/fiches/:slug/:lessonId/atelier`),
  **jamais** une quatrième vue de `FicheSubjectPage`. C'est une **séance de travail**, pas une
  consultation — même nature que le mode *Reconstruire* des mindmaps, passé en plein écran par
  l'`adr-0052`.
- **On réutilise le patron de plein écran de l'`adr-0052`, on n'en invente pas un second** :
  overlay CSS + état React (**pas** l'API `requestFullscreen`), `CloseFullscreenButton` (cible
  44 px), Échap, verrouillage du défilement du corps. Le dépôt a déjà son mécanisme
  (`GalaxyPage.tsx`), c'est celui-là.
- 🔴 **L'atelier ne va JAMAIS dans `ActivityModal`.** La modale borne son corps à
  `max-h-[calc(100vh-4rem)]` avec défilement interne
  ([ActivityModal.tsx:109](../../apps/frontend-massimo/src/components/ActivityModal.tsx:109)) :
  une colonne de six étapes dedans rejouerait le piège de l'`adr-0052`, en pire. Le jour où
  l'atelier devient une activité de mission, la modale **route vers la page** — elle n'embarque
  pas la colonne.
- **Dans l'atelier, le cours s'ouvre en tiroir PAR-DESSUS, pas à côté** : `fixed inset-y-0
  right-0` + voile, même mécanique que la sidebar mobile ; pleine largeur sous `md`. Motif : dans
  le viewer, on lit le cours **en parallèle** de la fiche ; dans l'atelier, on va y **vérifier une
  phrase et revenir**. Deux usages, deux gabarits — et le tiroir ne vole aucune largeur à une
  colonne qui en manque déjà.
- **`CoursPanel` cesse de se mesurer en `vh`** et remplit son conteneur (constat 3). Il servira
  deux gabarits — `variant="aside"` (viewer, existant) et `variant="drawer"` (atelier) — ou sera
  extrait. **Il a aujourd'hui un seul consommateur** (`FicheSubjectPage`), donc le coût de le
  toucher est faible ; il ne le restera pas.

**Le sens inverse — cours → fiche — n'existe pas et se crée sans réserve.**
`CoursPage` (`/subjects/:slug/cours`) mène au **quiz** et jamais aux fiches. L'entrée à créer se
pose **sur chaque leçon du cours** : « 🧩 En faire ma fiche » si rien n'existe, « ✍️ Ma fiche » si
elle existe.

C'était **le même bouton** que celui de l'écran H (depuis une fiche ZETIS déjà lue), donc la même
question — **tranchée le 2026-08-12 : lire avant de fabriquer est permis** (§3 révisé). Les deux
entrées s'ouvrent, sans condition et sans gate. Une seule décision, deux entrées, **plus aucun
blocage**.

## Alternatives considérées

- **Table `fiches_massimo` séparée.** Écarté : rend la comparaison champ à champ (§1) coûteuse,
  duplique le viewer, l'export A5 et le mécanisme de vue, et le « deck par matière » deviendrait
  deux requêtes. La colonne `author` coûte une migration triviale.
- **Ajouter `massimo` au vocabulaire de `source`** (constat 1). Écarté : mélange « comment c'est
  produit » et « à qui c'est ». Une fiche personnelle assistée n'aurait plus de valeur juste, et
  tout lecteur existant de `source` hériterait d'un sens qu'il n'attend pas.
- **Un menu « choisis ton niveau d'aide ».** Écarté, cf. §4 : demande une auto-évaluation
  impossible avant la tâche, et étiquette l'enfant.
- **Analyse en direct pendant la frappe.** Écarté, cf. §6 : transforme l'aide en surveillance.
- **ZETIS réécrit la phrase et Massimo accepte.** Écarté — c'est le risque central : la fiche
  générée avec des étapes en plus.
- **Noter la fiche.** Écarté : un artefact personnel qu'on note cesse d'être personnel. Retour
  oui, score non.
- **Faire du chat `/chat` la surface de l'échange.** Écarté : l'échange porte sur une section
  précise d'une fiche précise ; changer de page casse le travail et perd l'ancrage. On réutilise
  la **discipline** d'ADR-0027 (intent ancré serveur, ids validés), pas la page.
- **Relâcher les bornes du `FicheSpec` pour porter les brouillons** (§1 bis). Écarté : détruirait
  le « 1 leçon = 1 page » garanti par construction, décision fondatrice de l'ADR-0015.
- **Rendre `mnemonique` systématique** (§10). Écarté : produirait des acronymes forcés sur la
  majorité des leçons, plus durs à retenir que la chose elle-même.
- **Régénérer ou enrichir en lot les fiches déjà validées** (§11). Écarté : la première écrase les
  éditions manuelles de Papa, la seconde vide les decks de Massimo le temps de la revalidation.

## Périmètre

**Première slice, volontairement minuscule** — elle ne teste qu'une hypothèse : *est-ce qu'il le
refait une deuxième fois ?*

- **une notion**, pas une leçon entière (une leçon est trop grosse pour une première fiche, et la
  notion est déjà la granularité du SRS) ;
- **une seule section : `points_cles`**, échafaudage « je choisis » — 12 phrases candidates → 5
  retenues. **Aucune écriture** : l'écriture est la friction n°1, et « choisir » est la compétence
  visée ;
- **`recopie` seul** côté analyse ;
- **voix sur geste**, répliques fixes pré-synthétisées ;
- **`FicheDraft` + reprise** (§1 bis, §7) : il ferme, il revient, il retrouve son état. Sans ça,
  la slice ne se teste pas sur plus d'une séance ;
- la sélection retenue **devient ses cartes SRS**.

Contrainte de conception qui prime sur tout le reste : **la première fiche que Massimo fabrique
doit prendre moins de 5 minutes et produire quelque chose qu'il ait envie de garder.**

> **Mockup de référence** : `docs/frontend-massimo/mockup/mockup-fiche-de-massimo.html` —
> 12 scénarios, tokens repris de `mockup-page-fiches.html`. Les écrans **B** (je choisis),
> **I** (champ libre), **J** (terme / définition), **K** (pièges depuis ses erreurs),
> **L** (mnémonique) et **G** (reprise + versions) sont le contrat visuel de cet addendum.

## Hors périmètre (nommé)

- **`absent_du_cours`** — le seul type à faux positifs, et un faux positif ici est une injustice
  (ZETIS dit à Massimo que sa phrase juste est douteuse). À activer **après** que la boucle et le
  ton soient prouvés en vrai. `recopie` seul justifie déjà la fonctionnalité.
- **La dictée de la fiche par Massimo** (Whisper, ADR-0012) — disponible, non câblée en slice 1 ;
  le champ doit être **conçu pour l'accueillir**.
- **Les échafaudages « je complète » et « je fais »** (§4) — les états existent dans le modèle, un
  seul est implémenté.
- **Les cinq autres sections** (§8) — `essentiel` et `definitions` en slice 2, `erreurs_a_eviter`,
  `mini_exemple` et `mnemonique` en slice 3. La slice 1 n'en implémente **qu'une**.
- **L'enrichissement des fiches existantes** (§11) — la décision est prise (à la demande, jamais
  en lot, précédé d'une détection d'occasion), l'implémentation vient **avec** la slice 3 : elle
  n'a aucun sens avant que `mnemonique` existe.
- **La surface Papa de lecture** des fiches de son fils — décidée (§2), pas dessinée.
- **Le pont fiche → SRS de l'ADR-0015 §6**, toujours **stub** pour les fiches ZETIS : la slice 1
  ouvre le pont **depuis la fiche de Massimo uniquement**.
- **`FicheSpec`, la génération ZETIS, la validation Papa, l'export A5** — ADR-0015 non rouvert.

## Conséquences

### Positives

- Lève un blocage vieux de cinq semaines par une **reformulation**, pas par une exception : le
  gate porte sur ce que ZETIS sert. Aucune règle de sécurité affaiblie.
- **Zéro brique nouvelle** : `FicheSpec`, `TtsProvider`, `fiche_views`, `CoursPanel`,
  `notion_requests`, la discipline de prompt versionné — tout existe.
- La contrainte qui garantissait « 1 leçon = 1 page » pour le LLM devient **l'échafaudage
  pédagogique** pour l'enfant. Le même schéma sert deux fois.
- Le mode d'échec de l'oubli d'un filtre devient **visible et bénin** au lieu de silencieux et
  grave (§2).
- Ouvre un signal absent du dépôt : **« sait-il ce qui compte »**, distinct de la maîtrise.

### Négatives / coûts

- **Migration** : `fiches.author`, `fiches.student_id`, `fiches.version`, 4ᵉ valeur `personal` de
  `validation_status`. **Aucune migration de données** en revanche (constat 7).
- **Un second schéma à maintenir** (`FicheDraft`, §1 bis) en miroir du `FicheSpec` — deux formes
  pour un même objet, dont l'une est un état transitoire. Coût réel, assumé : l'alternative
  détruisait la garantie « 1 page ».
- 🔴 **`FICHE_PROMPT_VERSION` doit passer de v1 à v2** (§10) : ajouter un champ au schéma change la
  génération de **toutes** les fiches, pas seulement des nouvelles (constat 7). Les fiches
  produites avant et après ne sont plus comparables sans lire la version du prompt.
- **La détection d'occasion de mnémonique** (§11) est une passe supplémentaire sur le corpus
  existant — bornée, en lecture seule, mais elle a un coût de calcul non nul.
- **`CoursPanel` doit être repris** (§12) : dé-`vh`-isé et doté d'un second gabarit. Composant
  existant, un seul consommateur aujourd'hui — le coût est faible **maintenant**.
- **Un troisième plein écran** dans l'app (après la galaxie et, si l'`adr-0052` est accepté, les
  mindmaps). C'est un signe : le patron mérite d'être **extrait** plutôt que copié une troisième
  fois — mais pas dans ce chantier.
- 🔴 **Trois lecteurs à reprendre ensemble** (constat 2). Si un seul est oublié, le défaut est
  réel. Un test-verrou doit **saboter le prédicat partagé** et rougir sur les trois chemins.
- **Le deck change de comportement** sur les leçons à fiche personnelle (§3) — le point le plus
  cher, arbitré comme tel.
- `pilotage_tree` doit **exclure** `author='massimo'` (constat 5), sous peine d'offrir à Papa des
  boutons Valider / Rejeter sur la fiche de son fils.
- **Le risque n'est pas technique, il est motivationnel.** Un enfant de 12 ans fait sa fiche une
  fois, avec enthousiasme, puis plus jamais — sauf si l'effort est minuscule et le résultat
  visiblement meilleur que ce que ZETIS aurait produit seul.

## Le signal qui dirait qu'on s'est trompé

- **Massimo ne revient pas** après la première fiche → l'effort dépasse le seuil ; réduire encore
  la granularité avant d'ajouter quoi que ce soit.
- **Il clique « aide-moi » systématiquement, dès la première seconde** → l'échafaudage de départ
  est trop haut, ou la tâche n'est pas comprise ; ce n'est pas un défaut de motivation.
- **Ses fiches restent intégralement recopiées** malgré la remarque `recopie` → la remarque ne
  suffit pas, il faut l'escalade §6 niveau 2 dès la première passe.
- **Il ne rouvre jamais la fiche ZETIS après sa tentative** → le corrigé n'intéresse pas ; le
  proposer plus tôt, ou comparer automatiquement.
- 🔴 **Il ouvre systématiquement la fiche ZETIS et n'entre jamais dans l'atelier** → le **défaut**
  du §3 révisé ne suffit pas à orienter. C'est le signal le plus important à surveiller, parce que
  c'est celui que le verrou empêchait par construction : sans lui, seul l'usage réel peut le dire.
  Réponse graduée, dans cet ordre — rendre l'atelier plus visible sur la tuile, puis proposer la
  fabrication **avant** la lecture dans l'ordre des actions ; **rétablir un verrou en dernier
  recours seulement**, et ce serait rouvrir cet arbitrage.
- **Papa corrige les fiches de son fils** malgré §2 → la surface de lecture a été comprise comme
  une surface de pilotage ; la re-dessiner.
- **Massimo ne revient jamais sur une fiche finie** → les versions (§7) coûtent une colonne pour
  rien ; le brouillon suffisait, et « la fiche qui rétrécit » est une idée d'adulte.
- **Il remplit les six sections d'une traite** malgré le remplissage par passes → la séance longue
  ne le gêne pas ; c'est la contrainte des 5 minutes qui était mal posée, pas le découpage.
- **Papa enrichit toutes les fiches signalées sans en rejeter aucune** (§11) → la détection
  d'occasion est trop permissive, elle signale des leçons sans liste ; la resserrer.
- **`mnemonique` est rempli sur plus d'une fiche générée sur trois** → les trois garde-fous du §10
  n'ont pas tenu ; le few-shot nul est le premier à vérifier.

## Suivi

1. **Compléter `docs/frontend-massimo/page-fiches.md`** — la spec de page ne décrit aujourd'hui
   qu'un viewer **lecture seule** en trois écrans. L'écran de fabrication, l'échange, la voix et
   le retour d'analyse sont à **ajouter**, pas à corriger. À faire **avant** la session de code
   (règle propre à l'ADR-0015, § Suivi).
2. **Indexer cet addendum dans `DECISIONS.md`** sous la ligne `adr-0015`.
3. Slices : (A) migration + `author`/`student_id`/`version`/`personal` + `FicheDraft` +
   **prédicat de lecture partagé** et son test-verrou par sabotage ; (B) écran « je choisis » +
   détection `recopie` déterministe + reprise d'un brouillon ; (C) voix sur geste + cache de
   répliques ; (D) pont vers les cartes SRS.
4. **Mesurer, ne pas supposer** : le seuil des 5 minutes se vérifie sur un vrai usage, pas sur une
   estimation — et sur **l'appareil le plus contraint** (iPhone), pas seulement au bureau.
5. `docs/ai/README.md` : ajouter `fiche_coach` à la liste des prompts versionnés.
6. **Slice 3 uniquement** : bump `FICHE_PROMPT_VERSION` v1 → v2, few-shot à `mnemonique` nul, puis
   détection d'occasion sur le corpus existant (§11). **Vérifier sur les fiches réelles** quelle
   proportion se voit proposer un mnémonique — si elle dépasse le tiers, les garde-fous ont cédé.
7. ~~Question ouverte : entrer dans l'atelier après avoir lu.~~ **TRANCHÉE le 2026-08-12 par le
   commanditaire — « lire avant de fabriquer, c'est ok ».** Conséquences à répercuter au code :
   le §3 ne pose **plus de verrou**, `GET /lessons/{id}/fiche-zetis` **ne renvoie plus 403**, et
   **aucun état « a-t-il tenté ? » n'est à tenir côté serveur** — une simplification, pas
   seulement un assouplissement.
