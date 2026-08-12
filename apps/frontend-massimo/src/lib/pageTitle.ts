/**
 * Retrait horizontal d'un titre de page, pour qu'il rejoigne la colonne de texte des cartes.
 *
 * ## Le défaut, mesuré
 *
 * Rapporté comme « *« Bonjour Massimo » est coupé à gauche sur iPhone* ». Mesuré sur l'Accueil à
 * 390 px le 2026-08-12 : **rien n'était coupé** — le texte tenait sur une ligne avec 136 px de
 * marge, et la page ne débordait pas d'un pixel. Le titre était simplement le **seul** texte de la
 * page à `x = 16` ; les quarante autres commençaient à 33, 37 ou 41 selon le padding de leur carte.
 * L'œil prend la colonne des cartes pour la marge de la page, et un titre qui en sort **se lit
 * comme coupé**. C'est ainsi que le défaut a été vécu, et c'est la seule chose qui compte.
 *
 * ## Pourquoi 16 px, et pas autre chose
 *
 * La valeur place le titre sur le texte d'une carte `p-4`, **à chaque point de rupture** : mobile
 * 16 + 16 = 32 contre les 33 de la carte ; bureau 24 + 16 = 40 contre ses 40. La changer désaligne
 * les deux. Les cartes, elles, **ne bougent pas** : elles gardent le bord du conteneur, qui est ce
 * que prescrit `docs/frontend-massimo/mockup/mockup-page-accueil-v3.html` (`padding: 26px 20px`,
 * `h1` sans retrait). On ne corrige pas le design — on sort le titre de la seule position que plus
 * rien d'autre n'occupe.
 *
 * ## 🔴 Pourquoi ce n'est PAS dans `PageHeader`, et pourquoi il ne faut pas l'y mettre
 *
 * C'est la tentation évidente : `PageHeader` titre dix pages, une ligne réglerait tout. Elle a été
 * essayée, **puis retirée après mesure**. La moitié de ces pages alignent leurs **libellés de
 * section** sur le bord du conteneur, hors des cartes :
 *
 * | Page | Textes au bord `x = 16` | Le retrait y serait |
 * |---|---|---|
 * | Accueil, Matières, Missions | 0 | juste — le titre est seul |
 * | `/agenda` | 6 — « Aujourd'hui », « Demain », « Ce qui arrive », « À reprendre » | **faux** |
 * | `/revision` | 2 — « Mélanges », « Par matière » | **faux** |
 *
 * Sur ces pages-là le titre **n'est pas seul** : il est *aligné* sur ces libellés. Le rentrer y
 * casserait un alignement existant — un défaut neuf pour en corriger un autre.
 *
 * **La règle est donc conditionnelle, page par page** : *ce retrait s'applique quand le titre
 * serait le seul texte au bord du conteneur.* Elle ne peut pas vivre dans un composant partagé, et
 * l'unifier (rentrer AUSSI tous les libellés de section) est une décision de design qui mérite un
 * ADR, pas un passage en force.
 *
 * Les titres **centrés** (ELI5, Placeholder) ne sont pas concernés : ils ne touchent aucun bord.
 */
export const RETRAIT_TITRE_PAGE = "pl-4";
