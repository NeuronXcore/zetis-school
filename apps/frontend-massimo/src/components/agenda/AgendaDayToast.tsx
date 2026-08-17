import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type AgendaItemStudent,
  type AgendaTrace,
  type AgendaTraceDetail,
} from "@zetis/types";
import { AgendaGlyph, AGENDA_KIND_LABEL, subjectColorFor } from "@zetis/ui";
import { fetchAgendaDayTraces } from "../../lib/agenda";
import { JOUR_VIDE, longDayLabel } from "../../lib/agendaSections";

// Aperçu au survol d'un jour (ADR-0025 Amdt 8 §D12) — mois ET bande.
//
// **Survoler donne un aperçu, taper ouvre le détail.** Le toast ne remplace pas le panneau : il
// évite d'avoir à ouvrir douze jours pour retrouver lequel portait le contrôle.
//
// 🔴 **Pointeur FIN uniquement.** Au doigt il n'y a pas de survol, et un « appui long » ferait
// concurrence au tap qui ouvre le jour. Le composant n'est monté que si `(pointer: fine)`.
//
// ⚠️ **Le toast n'introduit AUCUNE mesure.** Il montre ce que le panneau montre : des échéances
// et des matières travaillées. Pas de compte, pas de durée, pas de « 3 sur 5 ».

/** Combien de temps le curseur doit rester sur un jour avant qu'on demande son détail.
 *
 *  ⚠️ Ce délai n'est pas cosmétique : sans lui, balayer la grille déclencherait une requête par
 *  cellule traversée — quarante-deux en un geste. */
const DELAI_MS = 220;

/** Les matières travaillées, chargées à la demande et **mises en cache pour la session**.
 *  Un jour déjà survolé ne se redemande pas : son passé ne change plus. */
const cache = new Map<string, AgendaTraceDetail[]>();

/** Notions montrées par matière — le même 3 que le panneau du jour. */
const NOTIONS_MAX = 3;

/** Entrées montrées par registre — le même 3 que les glyphes d'une cellule (`MAX_GLYPHES`).
 *
 *  🔴 **C'est un plafond de HAUTEUR, et il a une raison mesurée.** Un aperçu ne peut pas être
 *  plus grand que la place disponible autour de la cellule qu'il commente : sur la bande, qui vit
 *  à ~330 px du haut d'un écran de 856, il reste 320 px au-dessus et 429 en dessous. Un jour à
 *  quatre matières faisait 469 px — donc il sortait de l'écran **par construction**, quel que
 *  soit le côté choisi. Le placement ne pouvait pas réparer ça tout seul.
 *
 *  ⚠️ Le débordement se marque par une **ellipse, jamais par un nombre** : « +2 matières » serait
 *  un compte, et un compte de ce qu'on a travaillé est exactement ce que le §7 interdit. */
const ENTREES_MAX = 3;

export interface AgendaDayToastProps {
  /** Le jour survolé, ou `null` quand le curseur est sorti. */
  date: string | null;
  /** Position de la cellule survolée, en coordonnées écran. */
  ancre: DOMRect | null;
  items: AgendaItemStudent[];
  /** Les matières du jour, telles que la grille les détient déjà — servent d'aperçu immédiat
   *  pendant que le détail se charge. */
  traces: AgendaTrace[];
}

/** Marge entre le toast et le bord de la cellule, et entre le toast et le bord de la fenêtre. */
const MARGE = 8;

export function AgendaDayToast({ date, ancre, items, traces }: AgendaDayToastProps) {
  const [detail, setDetail] = useState<AgendaTraceDetail[] | null>(null);
  const minuteur = useRef<number | null>(null);
  const boite = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useState(0);

  useEffect(() => {
    setDetail(date ? (cache.get(date) ?? null) : null);
    if (minuteur.current !== null) window.clearTimeout(minuteur.current);
    if (date === null || cache.has(date)) return;
    // Le détail ne se demande qu'après une pause : traverser la grille ne doit rien déclencher.
    minuteur.current = window.setTimeout(() => {
      void fetchAgendaDayTraces(date)
        .then((data) => {
          cache.set(date, data.subjects);
          setDetail(data.subjects);
        })
        // Échec silencieux : le toast garde son aperçu immédiat. Une erreur technique sur
        // l'écran d'un enfant coûte plus qu'une ligne manquante.
        .catch(() => undefined);
    }, DELAI_MS);
    return () => {
      if (minuteur.current !== null) window.clearTimeout(minuteur.current);
    };
  }, [date]);

  // 🔴 **LA HAUTEUR SE MESURE, ELLE NE SE SUPPOSE PAS.** Sans dépendances : le contenu grandit
  // en cours de vie (le détail des matières arrive après `DELAI_MS`), et une hauteur figée à la
  // première passe replacerait le toast d'après un corps qu'il n'a plus. Le garde-fou
  // `Math.abs(...) > 0.5` coupe la boucle de rendu ; `useLayoutEffect` corrige AVANT la peinture,
  // donc le toast n'est jamais vu à sa mauvaise place.
  useLayoutEffect(() => {
    const mesure = boite.current?.getBoundingClientRect().height ?? 0;
    if (mesure > 0 && Math.abs(mesure - hauteur) > 0.5) setHauteur(mesure);
  });

  if (date === null || ancre === null) return null;

  // 🔴 **LE TOAST RÉPOND TOUJOURS**, y compris pour dire que le jour était vide.
  //
  // Il y avait ici un `return null` quand le jour n'avait ni échéance ni trace, au motif
  // « plutôt rien qu'un toast qui dit rien ». Mesuré à l'écran le 2026-08-17 : **18 jours sur
  // 31** sont dans ce cas sur un mois ordinaire — sur 58 % de la grille, le survol ne répondait
  // pas, et la fonctionnalité passait pour cassée (*« les toasts au survol ont disparu »*).
  //
  // ⚠️ Le dépôt avait DÉJÀ tranché cette question dans l'autre sens : l'addendum §17 existe
  // parce qu'un tap muet sur un jour passé *« se lit comme une panne »*, et son panneau
  // « répond toujours, y compris pour dire qu'il n'y avait rien à rendre ». La même règle vaut
  // ici : un vide CONFIRMÉ est une réponse, un silence n'en est pas une.
  const vide = items.length === 0 && traces.length === 0;
  const passe = date < new Date().toISOString().slice(0, 10);

  // ── « À REPRENDRE » : un jour passé qui garde une échéance non faite ──────────────────────
  //
  // 🔴 **AMBRE, et le mot « à reprendre ». Jamais de rouge, jamais « en retard ».**
  // Le §7 l'interdit en toutes lettres — *« aucun rouge, aucun "en retard", aucun compteur
  // d'arriéré »* — et le `CLAUDE.md` impose le vocabulaire : « notion à renforcer »,
  // « à reprendre », jamais « échec ». Ce n'est pas une règle de style : c'est la doctrine
  // pédagogique du produit, et elle a déjà coûté le retrait de la série (2026-07-27).
  //
  // ⚠️ Ambre et mot sont ceux que la page emploie **DÉJÀ** dans sa section « À reprendre » et
  // dans `AgendaItemRow tone="resume"`. Massimo n'apprend donc pas un second code pour la même
  // chose — c'est le même objet vu par une autre porte.
  //
  // 🔴 **La PORTE est le tap, pas un bouton dans le toast.** Ce toast porte `pointer-events:
  // none` (§D12 borne 1) : y mettre une action le rendrait survolable, donc capable
  // d'intercepter le clic qui ouvre le jour — et de provoquer un `mouseleave` en s'interposant
  // sous le curseur. Le panneau du jour, lui, coche et mène à la notion : c'est là qu'on agit.
  const aReprendre = passe && items.some((item) => !item.done);

  /** La couleur du texte atténué — **elle dépend de la trame**, et ce n'est pas cosmétique.
   *
   *  🔴 `zetis-muted` (#8b95b5) est à **4,5:1 pile** sur `zetis-surface-2`, c'est-à-dire au
   *  plancher AA exact. Toute trame posée derrière le fait passer dessous (3,5:1 à 18 %). Monter
   *  l'opacité du fond SANS toucher au texte aurait donc gagné en visibilité ce qu'on aurait
   *  perdu en lisibilité — sur l'écran d'un enfant, et sur la seule ligne qui dit la matière.
   *  `slate-300` remonte à **6,9:1** au-dessus de la crête. */
  const attenue = aReprendre ? "text-slate-300" : "text-zetis-muted";

  // Placement : recentré sur la cellule, et rabattu dans la fenêtre. `position: fixed` parce que
  // la bande défile — un toast en `absolute` partirait avec elle.
  const LARGEUR = 250;
  const gauche = Math.min(
    Math.max(MARGE, ancre.left + ancre.width / 2 - LARGEUR / 2),
    window.innerWidth - LARGEUR - MARGE,
  );

  // 🔴 **LE CÔTÉ SE DÉCIDE SUR LA HAUTEUR RÉELLE, ET LE HAUT EST BORNÉ.**
  //
  // Il y avait ici `const versLeHaut = ancre.top > 220`, c'est-à-dire un seuil qui SUPPOSAIT un
  // toast d'au plus 220 px, et rien qui le rabatte ensuite dans la fenêtre. Mesuré sur la bande
  // le 2026-08-17, jour du 14 août : hauteur **469 px**, `top` calculé à **−149** — cent quarante
  // -neuf pixels hors écran, et ce sont EXACTEMENT ceux du haut, donc la date et le badge
  // « En retard » (*« les toasts sont trop vers le haut et je ne lis pas retard »*).
  //
  // ⚠️ Le défaut ne se voyait que sur la BANDE : elle vit à ~330 px du haut, la grille mois
  // descend bien plus bas. Un seuil constant ne peut pas servir deux surfaces de hauteurs
  // différentes — c'est la supposition, pas le chiffre, qui était fausse.
  //
  // L'ordre est : au-dessus si ça tient, sinon au-dessous si ça tient, sinon le côté le plus
  // large — et dans tous les cas `Math.max(MARGE, …)` garantit que **le haut du toast reste
  // visible**. Quand rien ne tient, c'est le BAS qui se coupe : on perd la fin des traces, jamais
  // le jour dont on parle.
  const espaceHaut = ancre.top - MARGE;
  const espaceBas = window.innerHeight - ancre.bottom - MARGE;
  const tientEnHaut = hauteur > 0 && espaceHaut >= hauteur;
  const tientEnBas = hauteur > 0 && espaceBas >= hauteur;
  // Première passe (hauteur pas encore mesurée) : AU-DESSOUS. Un placement au-dessus sans hauteur
  // connue poserait le coin haut du toast sur la cellule — corrigé avant peinture, mais autant ne
  // pas écrire l'état faux.
  const versLeHaut =
    hauteur === 0 ? false : tientEnHaut ? true : tientEnBas ? false : espaceHaut > espaceBas;
  const haut = Math.max(
    MARGE,
    Math.min(
      versLeHaut ? ancre.top - MARGE - hauteur : ancre.bottom + MARGE,
      window.innerHeight - hauteur - MARGE,
    ),
  );

  return (
    <div
      ref={boite}
      role="tooltip"
      // `pointer-events-none` : le toast ne doit jamais intercepter le clic qui ouvre le jour,
      // ni provoquer un `mouseleave` en s'interposant sous le curseur.
      className={`pointer-events-none fixed z-50 overflow-hidden rounded-2xl border bg-zetis-surface-2 p-3 shadow-xl ${
        aReprendre
          ? // DEUX animations, et elles ne disent pas la même chose : le FOND dérive (12 s,
            // linéaire) — c'est la texture ; le CADRE respire (3 s) — c'est l'appel.
            //
            // ⚠️ Le fond reste une dérive **sans temps fort**, même maintenant que le registre
            // a basculé (§D17) : deux animations qui pulsent ensemble feraient un stroboscope.
            // L'amplitude du cadre est faible (45 % → 85 %) pour la même raison.
            //
            // `motion-safe:` → sous `prefers-reduced-motion`, rien ne bouge et les deux signaux
            // restent : ce sont des signaux, pas des ornements.
            "border-amber-400/45 motion-safe:[animation:agenda-reprendre-derive_12s_linear_infinite,agenda-retard-respire_3s_ease-in-out_infinite]"
          : "border-zetis-border"
      }`}
      style={{
        width: LARGEUR,
        left: gauche,
        top: haut,
        // Dernier filet : un toast plus grand que la fenêtre se coupe **par le bas**, jamais par
        // le haut. Combiné à `overflow-hidden`, il n'y a plus de cas où la date sort de l'écran.
        maxHeight: window.innerHeight - 2 * MARGE,
        // La trame du fond reprend la teinte du cadre — même famille, deux intensités.
        //
        // ⚠️ **7 % → 18 %, et le premier chiffre n'était pas mesuré : il était supposé.** Le
        // commentaire d'origine affirmait qu'au-delà « le texte perdrait son contraste ». Le
        // calcul dit l'inverse — sur `zetis-surface-2` (#1b2440), la crête du fond monte à
        // #43403b, où le corps du toast (#e8ecf8) tient encore **8,6:1**.
        //
        // 🔴 **Le vrai plafond n'était pas là où je le croyais, et il n'est pas celui du corps
        // du texte : c'est celui du texte ATTÉNUÉ.** `zetis-muted` (#8b95b5) est déjà à
        // **4,5:1 pile** sur ce fond SANS trame — au plancher AA exact. La moindre trame le
        // fait donc passer dessous (3,5:1 à 18 %). D'où l'éclaircissement ci-dessous : la trame
        // ne monte pas seule, elle emmène la couleur du texte avec elle.
        ...(aReprendre
          ? {
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent 0 4.5px, rgba(251,191,36,0.18) 4.5px 7px)",
            }
          : {}),
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zetis-accent-2">
          {longDayLabel(date)}
        </p>
        {/* 🔴 **« EN RETARD » — mot RÉVOQUÉ du §7 par le commanditaire le 2026-08-17.**
            Le §7 l'interdisait en toutes lettres (*« aucun rouge, aucun "en retard", aucun
            compteur d'arriéré »*), et le `CLAUDE.md` impose « à reprendre ». Le commanditaire
            l'avait lui-même écarté quelques heures plus tôt au profit de l'ambre (§D14), puis
            l'a redemandé explicitement. Révocation écrite au §D17 — pas un effet de bord.

            ⚠️ **Le ROUGE, lui, n'est PAS révoqué** : le badge est ambre, comme le cadre. C'est
            le MOT qui a changé de statut, pas la couleur. */}
        {aReprendre && (
          <span className="shrink-0 rounded-md border border-amber-400/70 bg-amber-400/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-300">
            En retard
          </span>
        )}
      </div>

      {/* Le vide CONFIRMÉ — **une seule phrase, au passé comme à venir** (§D15).
          Elle disait « Ce jour-là, l'école ne demandait rien. » au passé : écartée par le
          commanditaire le 2026-08-17. Deux motifs, dont un que la formulation trahissait —
          **le toast mélangeait deux voix** : son titre dit « Ce que ZETIS te demandait », et
          deux lignes plus bas « l'école » reprenait la parole, alors que le §D9 a tranché que
          c'est ZETIS qui s'adresse à Massimo sur cette page.
          « Rien de prévu » n'attribue la demande à personne : plus de collision. */}
      {vide && (
        <p className={`mt-1.5 text-[12px] leading-snug ${attenue}`}>{JOUR_VIDE}</p>
      )}

      {/* 🔴 **LES DEUX REGISTRES SONT NOMMÉS, ou aucun ne l'est.**
          Cette liste n'avait pas de titre, alors que le bloc des traces en avait un. L'œil
          rattachait donc « Ce que tu as travaillé » aux ÉCHÉANCES juste au-dessus — et sur un
          jour portant une échéance non faite, le toast semblait se contredire
          (*« ce que tu as travaillé, non puisque non fait »*, commanditaire, 2026-08-17).

          Les deux blocs disent des choses différentes, et c'est tout l'objet de l'Amendement 8 :
          en haut ce que l'école a demandé, en bas ce que Massimo a réellement fait — deux
          ensembles qui ne coïncident pas (le 11 août : demandé français + SVT, travaillé maths
          + anglais). Un seul des deux titré, et le lecteur les fusionne.

          ⚠️ Le libellé reprend **mot pour mot le sous-titre de la page** (§D9), qui annonce déjà
          les deux registres : « Ce que ZETIS te demande, et ce que tu as travaillé. » */}
      {items.length > 0 && (
        <>
          <p className={`mt-2 text-[10px] font-bold uppercase tracking-wider ${attenue}`}>
            {passe ? "Ce que ZETIS te demandait" : "Ce que ZETIS te demande"}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
          {items.slice(0, ENTREES_MAX).map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <span className="mt-1 shrink-0">
                <AgendaGlyph kind={item.kind} color={item.subject?.color} size={9} />
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-[12.5px] leading-snug ${item.done ? "text-zetis-muted" : ""}`}
                >
                  {item.label}
                </span>
                <span className={`text-[10.5px] ${attenue}`}>
                  {item.subject?.name ?? "sans matière"} · {AGENDA_KIND_LABEL[item.kind]}
                  {/* « fini » et non « fait le … » : aucune date de complétion, aucun horodatage. */}
                  {item.done && " · fini"}
                  {/* Le seul mot autorisé pour un passé non fait. Ni « en retard », ni « oublié »,
                      ni « non rendu » : « à reprendre » dit ce qu'il reste à FAIRE, pas ce qui a
                      été manqué. C'est la différence entre une adresse et un reproche. */}
                  {passe && !item.done && (
                    <span className="text-amber-300/90"> · à reprendre</span>
                  )}
                </span>
              </span>
            </li>
          ))}
          {items.length > ENTREES_MAX && (
            <li className={`text-[10.5px] leading-none ${attenue}`}>…</li>
          )}
          </ul>
        </>
      )}

      {/* La PORTE — elle NOMME le geste sans le porter : ce toast est `pointer-events: none`,
          un bouton dedans intercepterait le clic qui ouvre le jour. Le panneau du jour coche et
          mène à la notion ; le toast dit seulement où aller. */}
      {aReprendre && (
        <p className="mt-2 border-t border-amber-400/20 pt-2 text-[11px] font-semibold text-amber-300/90">
          Ouvre ce jour pour le reprendre →
        </p>
      )}

      {(detail ?? []).length > 0 ? (
        <div className={items.length > 0 ? "mt-2.5 border-t border-white/10 pt-2" : "mt-2"}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${attenue}`}>
            Ce que tu as travaillé
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {detail!.slice(0, ENTREES_MAX).map((matiere, index) => (
              <li key={`${matiere.slug ?? "neutre"}-${index}`} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-1 h-2.5 w-[3px] shrink-0 rounded-full"
                  style={{
                    backgroundColor: matiere.slug
                      ? subjectColorFor(matiere.slug, matiere.color)
                      : "var(--color-zetis-muted)",
                  }}
                />
                <span className="min-w-0">
                  {matiere.name && (
                    <span className="block text-[12px] font-semibold leading-snug">
                      {matiere.name}
                    </span>
                  )}
                  {/* 🔴 **UNE LIGNE CHACUN, ET DEUX LIGNES SÉPARÉES.**
                      Les notions et les formes étaient jointes par « — » dans un seul bloc de
                      texte libre. Deux raisons de les séparer, et la seconde est née de la
                      première :
                      1. **La hauteur.** Une journée à quatre matières faisait un toast de
                         **469 px** — plus de la moitié d'un écran de 856, mesuré le 2026-08-17.
                         C'est ce qui rendait le placement insoluble : ni au-dessus ni au-dessous
                         de la bande il n'y avait la place, donc *quelque* chose devait sortir de
                         l'écran.
                      2. **Le rognage garni.** Rogné en bloc, le texte donnait « Thalès … —… » :
                         l'ellipse du plafond de notions, puis le tiret, puis celle du navigateur.
                         Séparées, chaque ligne se rogne proprement — et surtout la forme
                         (« Cours lu · Fiche ») ne disparaît plus derrière une liste de notions
                         trop longue, alors que c'est elle que le commanditaire a demandée
                         nommément (*« et sous quelles formes »*).
                      ⚠️ Aucune information n'est PERDUE : le panneau du jour, ouvert d'un tap,
                      montre tout. C'est le contrat écrit en tête de ce fichier — survoler donne
                      un aperçu, taper ouvre le détail. */}
                  {matiere.notions.length > 0 && (
                    <span className={`line-clamp-1 text-[10.5px] leading-snug ${attenue}`}>
                      {/* PLAFOND, comme dans le panneau : une journée de maths rend six notions,
                          et six notions dans un toast de 250 px sont un mur (vu à l'écran le
                          2026-08-17, deux fois — le panneau puis ici).
                          ⚠️ Une ellipse, jamais un nombre : « +3 » serait un compte. */}
                      {matiere.notions
                        .slice(0, NOTIONS_MAX)
                        .map((n) => n.name)
                        .join(" · ") + (matiere.notions.length > NOTIONS_MAX ? " …" : "")}
                    </span>
                  )}
                  {matiere.forms.length > 0 && (
                    <span className={`line-clamp-1 text-[10.5px] leading-snug ${attenue}`}>
                      {matiere.forms.join(" · ")}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {detail!.length > ENTREES_MAX && (
              <li className={`pl-[11px] text-[10.5px] leading-none ${attenue}`}>…</li>
            )}
          </ul>
        </div>
      ) : (
        // Aperçu IMMÉDIAT pendant que le détail arrive : les matières que la grille détient
        // déjà. Sans lui, le toast sauterait de vide à plein, ce qui se lit comme un bug.
        traces.length > 0 && (
          <p className={`text-[10.5px] text-zetis-muted ${items.length > 0 ? "mt-2" : "mt-1"}`}>
            Travaillé : {traces.map((t) => t.name ?? "autre").join(" · ")}
          </p>
        )
      )}
    </div>
  );
}
