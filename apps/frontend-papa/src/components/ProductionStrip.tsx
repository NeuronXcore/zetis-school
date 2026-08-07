import { useEffect, useRef, useState } from "react";
import { type ActivityItem, type ProductionActivity } from "@zetis/types";

import { GearsSpinner } from "./GearsSpinner";
import { KnowledgeFolder } from "./KnowledgeFolder";

// La bande de production du header Papa (addendum 2 ADR-0041,
// `docs/frontend-papa/bande-de-production.md`).
//
// Elle remplace la pilule `ProductionBar`, dont elle garde INTÉGRALEMENT la doctrine d'énoncé :
// jamais 0 % pour dire « ça démarre », « en file » ≠ « arrêté », `worker_alive === false` et jamais
// la fausseté, le motif rendu tel quel. Ce qui change est la FORME et le GRAIN.
//
// 🔴 **Ce n'est pas une barre, c'est un tapis.** Une pilule qui passe de 0/31 à 1/31 toutes les
// 69 secondes ne bouge pas à l'œil : c'est le motif d'origine du chantier. Les rouages fabriquent
// à gauche, la pièce traverse, la boîte l'avale à droite — et la texture en biais dit le sens de
// marche, ce qui fait avancer quelque chose même entre deux paliers.

/** D'où vient ce travail, en mots de Papa (§7). Sans cela, Papa ouvre son écran à 8 h et voit
 *  ZETIS travailler sur quelque chose qu'il n'a pas demandé, sans pouvoir savoir pourquoi. */
const ORIGINE: Record<string, string> = {
  manual: "lancé par vous",
  agenda: "préparé pour une échéance",
  request: "demandé par Massimo",
};

/** Le mot de la pièce en cours, pour le jeton qui traverse. */
const MOT_PIECE: Record<string, string> = {
  cours: "cours",
  fiche: "fiche",
  srs: "cartes",
  quiz: "quiz",
  mindmap: "mindmap",
};

/** Les paliers de repli, mesurés sur la largeur du HEADER (spec § Responsive).
 *
 *  🔴 **Ces seuils ont d'abord été écrits en container queries Tailwind
 *  (`@max-[980px]/entete:hidden`) — et Tailwind n'en a compilé AUCUNE.** Vérifié dans le
 *  navigateur le 2026-08-07 : zéro `CSSContainerRule` dans toutes les feuilles de style, alors
 *  que le CSS maison du même chantier était bien là. L'échelle de repli était donc entièrement
 *  inopérante : la bande ne cédait jamais rien, c'est-à-dire exactement le défaut « sans échelle
 *  explicite, elle ne se replie pas, elle s'écrase » que la spec avait mesuré et écarté.
 *
 *  ⚠️ **Aucun test ne pouvait l'attraper** : jsdom n'applique pas le CSS, et les tests rendent à
 *  pleine largeur. Ce défaut n'existait qu'à l'écran — c'est le § « Vérification humaine » de
 *  l'ADR qui l'a sorti, pas la suite.
 *
 *  On revient donc à la mesure JS, qui fonctionnait. ⚠️ Elle observe le HEADER, jamais son propre
 *  conteneur : celui-ci est déjà écrasé quand il se lit (30 px mesurés le 2026-08-06). */
const SEUIL_COMPTEUR = 980;
const SEUIL_SOUS_TITRE = 880;
const SEUIL_CONTEXTE = 800;

function useLargeurHeader(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [largeur, setLargeur] = useState(9999);
  useEffect(() => {
    const noeud = ref.current?.closest("header") ?? ref.current;
    if (!noeud || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([e]) => setLargeur(e.contentRect.width));
    obs.observe(noeud);
    return () => obs.disconnect();
  }, []);
  return [ref, largeur];
}

interface Jeton {
  id: number;
  mot: string;
}

/** Les jetons naissent d'un CHANGEMENT de `current_piece`, jamais d'un minuteur.
 *
 *  Quand la pièce en cours passe de `cours` à `fiche`, c'est le **cours** qui vient d'être fini :
 *  le jeton part avec son vrai nom, à l'instant. Un `setInterval` décoratif ferait bouger l'écran
 *  quand rien ne se passe — exactement ce que cette bande existe pour ne plus faire.
 *
 *  ⚠️ Le compteur d'id ne se réinitialise pas : deux pièces du même nom doivent rester deux
 *  éléments distincts pour React, sinon la seconde réutilise le nœud de la première et n'anime
 *  rien. */
function useJetons(piece: string | null | undefined): Jeton[] {
  const [jetons, setJetons] = useState<Jeton[]>([]);
  const precedente = useRef<string | null | undefined>(undefined);
  const compteur = useRef(0);

  useEffect(() => {
    const avant = precedente.current;
    precedente.current = piece;
    // Premier rendu : on ne lance rien. Sinon un simple changement de route ferait traverser un
    // jeton pour un travail commencé depuis dix minutes.
    if (avant === undefined || avant === piece || !avant) return;
    const jeton = { id: (compteur.current += 1), mot: MOT_PIECE[avant] ?? avant };
    setJetons((liste) => [...liste, jeton]);
    const t = setTimeout(
      () => setJetons((liste) => liste.filter((j) => j.id !== jeton.id)),
      1600,
    );
    return () => clearTimeout(t);
  }, [piece]);

  return jetons;
}

interface Props {
  activity: ProductionActivity;
  onOpen: () => void;
  /** Le clic de la boîte mène au stock — la Couverture. */
  onOpenStock: () => void;
}

export function ProductionStrip({ activity, onOpen, onOpenStock }: Props) {
  const [ref, largeur] = useLargeurHeader();
  // ⚠️ Un échec passe devant : ce n'est pas un état d'avancement, c'est un état d'anomalie. Un
  // refus vient juste après — c'est un FAIT, pas une panne, mais il explique pourquoi rien ne
  // tourne, ce qu'aucun autre état ne dirait.
  const echec: ActivityItem | null = activity.failed[0] ?? null;
  const refusEnAttente = activity.refused[0] ?? null;
  const item: ActivityItem | null = activity.current;

  const jetons = useJetons(item?.current_piece);

  // 🔴 **Le worker de SON couloir, pas « le » worker** (addendum 2 §22, trouvé à l'écran le
  // 2026-08-07 sur un rendu vidéo réellement bloqué). `worker_alive` ne parle que des files de
  // production : un rendu média en attente derrière un worker vidéo mort affichait « ZETIS va
  // produire » — la file paraissait servie alors que personne ne l'écoutait. C'est le défaut exact
  // que ce paragraphe existe pour supprimer, reproduit d'un couloir à l'autre.
  //
  // ⚠️ `=== false`, jamais la fausseté : `null` veut dire « la question n'a pas été posée ».
  const vivantDuCouloir = item?.lane === "media" ? activity.media_alive : activity.worker_alive;
  const arrete = item != null && (item.status === "stale" || vivantDuCouloir === false);
  const enFile = item?.status === "queued";
  const enCours = item?.status === "running" && !arrete;
  // 🔴 **`status === "running"` fait partie de la garde, et ce n'est pas de la ceinture-bretelles.**
  // Le serveur ne pose `pct_is_measured` que sur un travail qui tourne — mais l'ancienne pilule
  // gardait DÉJÀ ici, et retirer cette garde a fait afficher « 37 % · 7 / 19 pièces » sur un lot
  // EN FILE (attrapé par `ProductionStrip.test.tsx`, 2026-08-07). La doctrine « aucun chiffre sur
  // ce qui n'a pas démarré » ne se délègue pas au serveur : c'est ici qu'elle se voit.
  const mesure =
    item?.status === "running" && !!item.pct_is_measured && item.pct !== null && !arrete;

  // 🔴 **Un refus ne masque JAMAIS une production en cours** — trouvé à l'écran le 2026-08-07 :
  // la bande annonçait « Rien lancé » pendant que ses rouages tournaient et que son tapis
  // défilait. Elle se contredisait à elle-même, dans le même coup d'œil.
  //
  // La règle qui en sort : un ÉCHEC passe devant tout — c'est une anomalie qui demande un geste.
  // Un REFUS explique pourquoi rien n'a démarré : il n'a de sens que quand, justement, rien ne
  // tourne. Dès que ZETIS produit, la production EST la nouvelle ; le refus reste compté et
  // acquittable dans le popover, où il ne contredit rien.
  const refus = enCours ? null : refusEnAttente;

  // Le repos : rien ne tourne, rien n'a échoué, rien n'a été refusé.
  const repos = item == null && echec == null && refusEnAttente == null;

  // 🔴 Les rouages ne tournent QUE pendant un travail. Un mouvement sur une file arrêtée ment
  // avant qu'on ait lu le texte — et c'est le mouvement qu'on regarde en premier.
  const tourne = enCours && !echec;

  const ton = echec
    ? "text-red-300"
    : arrete || refus
      ? "text-papa-warn"
      : "text-papa-accent-2";

  // ⚠️ `ratio` a disparu avec l'ancienne boîte. Elle se remplissait par PROPORTION du lot ; le
  // dossier se remplit par ACCUMULATION (4 feuilles au plus, `ceil(count / 2)`) — il dit « ça
  // s'accumule », pas « combien ». Le compte exact est porté par le tapis et la pastille, qui ne
  // l'ont jamais lâché ; deux objets disant le même pourcentage feraient doublon, pas redondance.

  const [tete, ...reste] = (item?.label ?? "").split(" · ");
  const sujet = reste.join(" · ");

  // ⚠️ **Le VERBE suit l'état**, décision verrouillée depuis le 2026-08-05 et que la maquette
  // conserve : « ZETIS produit … en file d'attente » se contredirait tout seul.
  let ligne1: React.ReactNode;
  let ligne2 = "";
  if (echec) {
    ligne1 = <>Échec — <b className="font-semibold">{echec.label}</b></>;
    ligne2 = echec.error ?? "ce travail a échoué, sans motif enregistré";
  } else if (refus) {
    ligne1 = <><b className="font-semibold">Rien lancé</b> — {refus.detail}</>;
    ligne2 = "un régulateur a dit non — ce n'est pas une panne";
  } else if (arrete) {
    ligne1 = <>ZETIS <b className="font-semibold">ne produit pas</b></>;
    // ⚠️ **Le mot nomme LE BON moteur** (trouvé à l'écran le 2026-08-07). Un rendu vidéo bloqué
    // annonçait « aucun moteur de production actif » : Papa serait allé vérifier le worker de
    // production, qui tournait très bien. Deux couloirs, deux processus, donc deux phrases —
    // sinon le diagnostic envoie au mauvais endroit, ce qui est pire que pas de diagnostic.
    ligne2 =
      item?.lane === "media"
        ? "aucun moteur de rendu vidéo actif — personne ne viendra"
        : "aucun moteur de production actif — personne ne viendra";
  } else if (enFile) {
    ligne1 = <>ZETIS va produire · en file d'attente</>;
    ligne2 = item?.label ?? "";
  } else {
    ligne1 = <>ZETIS produit — <b className="font-semibold">{sujet || tete}</b></>;
    ligne2 = [sujet ? tete : null, ORIGINE[item?.trigger ?? ""]].filter(Boolean).join(" · ");
  }

  // ── Au repos : la bande se replie et ne garde que la boîte ────────────────────────────────
  // §19 — révocation PARTIELLE du §7. Un liseré immobile n'est pas un indicateur : il n'annonce
  // rien, ne compte rien, ne reproche rien. Ce que le §7 interdisait — un compteur permanent qui
  // vous regarde — reste interdit, et le repos ne porte QU'UN SEUL objet cliquable.
  if (repos) {
    return (
      <div ref={ref} className="flex h-7 items-center justify-end border-y border-papa-border bg-papa-surface/40 px-4">
        <button
          type="button"
          onClick={onOpenStock}
          title="Le stock de contenu de Massimo — voir la Couverture"
          className="scale-[.62] opacity-60 transition-opacity hover:opacity-100"
        >
          {/* ⚠️ `decorative` : le bouton porte déjà son `title`. Sans cela, le lecteur d'écran
              annonce « 0 pièces déposées » sur une bande au repos, ce qui n'apprend rien. */}
          <KnowledgeFolder count={0} decorative className="text-papa-muted" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`flex h-[46px] items-center gap-3.5 border-y border-papa-border px-4 ${
        arrete || refus ? "bg-papa-warn/5" : echec ? "bg-red-400/5" : "bg-papa-surface/40"
      }`}
    >
      {/* ⚠️ `data-tourne` PORTE l'animation (voir `index.css`) : l'observer, c'est observer le
          mouvement lui-même, et non une classe utilitaire qu'un refactor peut renommer. */}
      <span {...(tourne ? { "data-tourne": "" } : {})}>
        {/* ⚠️ `decorative` : « ZETIS produit — Fractions » est juste à côté. Un `role="status"`
            ici ferait annoncer l'attente deux fois. */}
        <GearsSpinner
          decorative
          stopped={arrete}
          className={`${ton} ${refus ? "opacity-45" : ""}`}
        />
      </span>

      <button
        type="button"
        onClick={onOpen}
        title="Voir le détail de ce que ZETIS fabrique"
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        {/* Le contexte cède avant le tapis : c'est lui qui porte l'information de mouvement.
            🔴 **DEUX EXCEPTIONS, et elles sont la règle qui compte** (spec § Responsive) : une
            ANOMALIE garde son mot à TOUTE largeur. Constaté à l'écran le 2026-08-07 — à 700 px, un
            arrêt se réduisait à un tapis ambre et devenait indistinguable d'une production qui va
            bien. Un état d'avancement peut se taire ; un état d'anomalie, jamais. */}
        {(largeur > SEUIL_CONTEXTE || arrete || echec || refus) && (
          <span className="hidden min-w-0 max-w-[300px] shrink-0 md:block">
            <span className="block truncate text-[12.5px] text-papa-text">{ligne1}</span>
            {largeur > SEUIL_SOUS_TITRE && (
              <span className="block truncate text-[10.5px] text-papa-muted">{ligne2}</span>
            )}
          </span>
        )}

        {/* ── LE TAPIS ────────────────────────────────────────────────────────────────── */}
        <span className="relative h-1.5 min-w-[60px] flex-1">
          <span className="absolute inset-0 overflow-hidden rounded-full bg-papa-text/10">
            {mesure ? (
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                style={{
                  width: `${item.pct}%`,
                  background:
                    "linear-gradient(90deg, color-mix(in srgb, var(--color-papa-accent) 55%, black), var(--color-papa-accent) 55%, var(--color-papa-accent-2))",
                }}
              >
                {/* La texture DIT LE SENS DE MARCHE — et elle bouge même quand le compte ne
                    bouge pas, ce qui est toute la raison d'être du tapis. */}
                {tourne && <span className="zetis-tapis-texture absolute inset-0" />}
              </span>
            ) : (
              // Indéterminé : un liseré qui balaie, JAMAIS un remplissage partiel — il n'y a rien
              // à mesurer. À l'arrêt il s'immobilise : une animation sur une file arrêtée ment.
              <span
                {...(arrete || refus ? {} : { "data-balaie": "" })}
                className={`absolute inset-y-0 w-1/3 rounded-full ${
                  arrete || refus ? "bg-papa-warn/35" : "bg-papa-accent-2/70"
                }`}
                style={arrete || refus ? { left: 0, width: "100%" } : undefined}
              />
            )}
          </span>
          {/* Les pièces voyagent SUR le tapis et tombent dans la boîte. */}
          {jetons.map((j) => (
            <span
              key={j.id}
              aria-hidden
              className="zetis-jeton absolute top-1/2 whitespace-nowrap rounded border border-papa-accent-2/45 bg-papa-surface-2 px-1.5 py-0.5 text-[9.5px] text-papa-accent-2"
            >
              {j.mot}
            </span>
          ))}
        </span>

        {/* La file se COMPTE, elle ne se dessine pas : fondre plusieurs travaux dans une barre
            unique la ferait reculer à chaque ajout. */}
        {activity.queued_count > 0 && largeur > SEUIL_COMPTEUR && (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-papa-accent/25 bg-papa-accent/10 px-2 py-0.5 text-[10.5px] text-papa-accent">
            {activity.queued_count} en attente
          </span>
        )}

        {/* ⚠️ Sans granularité, aucun chiffre — et AUCUNE CASE. Un « — » à cet endroit se lirait
            encore comme une valeur. */}
        {mesure && largeur > SEUIL_SOUS_TITRE && (
          <span className="shrink-0 text-right leading-tight">
            <span className="block text-[13px] font-medium tabular-nums text-papa-text">
              {item.pct} %
            </span>
            <span className="block text-[10.5px] tabular-nums text-papa-muted">
              {item.pieces_done} / {item.pieces_total} pièces
            </span>
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onOpenStock}
        title="Le stock de contenu de Massimo — voir la Couverture"
        className="shrink-0"
      >
        {/* 🔴 `pieces_produced`, JAMAIS `pieces_done` : une pièce `skipped` a traversé le tapis
            mais était déjà en stock — l'y faire tomber une seconde fois mentirait sur ce que ZETIS
            a fabriqué. Le composant détecte lui-même l'incrément ; c'est ce qui a rendu
            `useBoiteRecoit` inutile, et il a été retiré plutôt que laissé en doublon. */}
        <KnowledgeFolder
          count={item?.pieces_produced ?? 0}
          total={item?.pieces_total ?? null}
          stopped={arrete}
          className={ton}
        />
      </button>
    </div>
  );
}
