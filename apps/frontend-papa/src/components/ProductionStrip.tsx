import { useEffect, useRef, useState } from "react";
import { type ActivityItem, type ProductionActivity } from "@zetis/types";

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

/** La boîte s'illumine quand `pieces_produced` AUGMENTE — les `generated` seules.
 *
 *  ⚠️ Jamais sur `pieces_done` : une pièce `skipped` a bien traversé le tapis, mais elle était
 *  déjà dans le stock. L'y faire tomber une seconde fois mentirait sur ce que ZETIS a fabriqué. */
function useBoiteRecoit(produites: number | undefined): boolean {
  const [recoit, setRecoit] = useState(false);
  const precedent = useRef<number | undefined>(undefined);

  useEffect(() => {
    const avant = precedent.current;
    precedent.current = produites;
    if (avant === undefined || produites === undefined || produites <= avant) return;
    setRecoit(true);
    const t = setTimeout(() => setRecoit(false), 500);
    return () => clearTimeout(t);
  }, [produites]);

  return recoit;
}

function Rouages({ ton }: { ton: string }) {
  return (
    <span className={`relative block h-8 w-10 shrink-0 ${ton}`} aria-hidden>
      <svg
        className="zetis-rouage-a absolute left-0 top-px h-6 w-6 overflow-visible"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="5.2" />
        <circle cx="12" cy="12" r="1.8" />
        <g fill="currentColor" stroke="none" opacity="0.85">
          <rect x="11" y="0.6" width="2" height="3.4" rx="0.6" />
          <rect x="11" y="20" width="2" height="3.4" rx="0.6" />
          <rect x="0.6" y="11" width="3.4" height="2" rx="0.6" />
          <rect x="20" y="11" width="3.4" height="2" rx="0.6" />
        </g>
      </svg>
      <svg
        className="zetis-rouage-b absolute left-[18px] top-3 h-[18px] w-[18px] overflow-visible"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="5.6" />
        <circle cx="12" cy="12" r="2" />
        <g fill="currentColor" stroke="none" opacity="0.85">
          <rect x="10.8" y="1" width="2.4" height="3.6" rx="0.6" />
          <rect x="10.8" y="19.4" width="2.4" height="3.6" rx="0.6" />
          <rect x="1" y="10.8" width="3.6" height="2.4" rx="0.6" />
          <rect x="19.4" y="10.8" width="3.6" height="2.4" rx="0.6" />
        </g>
      </svg>
    </span>
  );
}

/** La boîte de connaissance — **le seul objet permanent** de la bande.
 *
 *  Elle est la destination de tout ce que ZETIS fabrique, et le seul élément cliquable qui reste
 *  au repos : c'est ce qui a justifié de replier la bande plutôt que de la faire disparaître
 *  (§19, qui révoque le §7 sur ce point et sur celui-là seulement). */
function Boite({
  produites,
  ratio,
  recoit,
  ton,
}: {
  produites: number;
  ratio: number;
  recoit: boolean;
  ton: string;
}) {
  return (
    <span className="relative block h-[34px] w-[38px] shrink-0">
      {recoit && (
        <span
          aria-hidden
          className="zetis-boite-recoit pointer-events-none absolute -inset-2 rounded-xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-papa-accent-2) 55%, transparent), transparent 66%)",
          }}
        />
      )}
      <svg viewBox="0 0 44 34" className="h-full w-full overflow-visible" aria-hidden>
        <path
          d="M6 12 L22 5 L38 12"
          fill="none"
          strokeWidth="1.4"
          className={ton}
          stroke="currentColor"
          style={{ transform: recoit ? "translateY(-3px)" : undefined, transition: "transform .25s" }}
        />
        <path
          d="M6 12 L22 19 L38 12 L38 27 L22 34 L6 27 Z"
          className="fill-papa-surface-2 stroke-papa-border"
          strokeWidth="1.4"
        />
        {[1, 2, 3].map((i) => (
          <path
            key={i}
            d={
              i === 1
                ? "M9 15.5 L22 21 L35 15.5 L35 18 L22 23.5 L9 18 Z"
                : i === 2
                  ? "M9 19 L22 24.5 L35 19 L35 21.5 L22 27 L9 21.5 Z"
                  : "M9 22.5 L22 28 L35 22.5 L35 25 L22 30.5 L9 25 Z"
            }
            className="fill-papa-accent transition-opacity duration-500"
            // Les couches se remplissent avec l'avancement : la boîte MONTRE le stock, elle ne
            // l'annonce pas en chiffres.
            style={{ opacity: ratio >= i / 3.6 ? 0.55 : 0 }}
          />
        ))}
      </svg>
      {produites > 0 && (
        <span className="absolute -right-1 -top-1.5 rounded-full bg-papa-accent px-1 text-[9.5px] font-semibold tabular-nums text-papa-bg">
          +{produites}
        </span>
      )}
    </span>
  );
}

interface Props {
  activity: ProductionActivity;
  onOpen: () => void;
  /** Le clic de la boîte mène au stock — la Couverture. */
  onOpenStock: () => void;
}

export function ProductionStrip({ activity, onOpen, onOpenStock }: Props) {
  // ⚠️ Un échec passe devant : ce n'est pas un état d'avancement, c'est un état d'anomalie. Un
  // refus vient juste après — c'est un FAIT, pas une panne, mais il explique pourquoi rien ne
  // tourne, ce qu'aucun autre état ne dirait.
  const echec: ActivityItem | null = activity.failed[0] ?? null;
  const refus = activity.refused[0] ?? null;
  const item: ActivityItem | null = activity.current;

  const jetons = useJetons(item?.current_piece);
  const recoit = useBoiteRecoit(item?.pieces_produced);

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

  // Le repos : rien ne tourne, rien n'a échoué, rien n'a été refusé.
  const repos = item == null && echec == null && refus == null;

  // 🔴 Les rouages ne tournent QUE pendant un travail. Un mouvement sur une file arrêtée ment
  // avant qu'on ait lu le texte — et c'est le mouvement qu'on regarde en premier.
  const tourne = enCours && !echec;

  const ton = echec
    ? "text-red-300"
    : arrete || refus
      ? "text-papa-warn"
      : "text-papa-accent-2";

  const ratio = mesure && item.pieces_total ? (item.pieces_done ?? 0) / item.pieces_total : 0;

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
    ligne2 = "aucun moteur de production actif — personne ne viendra";
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
      <div className="flex h-7 items-center justify-end border-y border-papa-border bg-papa-surface/40 px-4">
        <button
          type="button"
          onClick={onOpenStock}
          title="Le stock de contenu de Massimo — voir la Couverture"
          className="scale-[.62] opacity-60 transition-opacity hover:opacity-100"
        >
          <Boite produites={0} ratio={0} recoit={false} ton="text-papa-muted" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex h-[46px] items-center gap-3.5 border-y border-papa-border px-4 ${
        arrete || refus ? "bg-papa-warn/5" : echec ? "bg-red-400/5" : "bg-papa-surface/40"
      }`}
    >
      {/* ⚠️ `data-tourne` PORTE l'animation (voir `index.css`) : l'observer, c'est observer le
          mouvement lui-même, et non une classe utilitaire qu'un refactor peut renommer. */}
      <span {...(tourne ? { "data-tourne": "" } : {})}>
        <Rouages ton={`${ton} ${refus ? "opacity-45" : ""}`} />
      </span>

      <button
        type="button"
        onClick={onOpen}
        title="Voir le détail de ce que ZETIS fabrique"
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        {/* Le contexte cède avant le tapis : c'est lui qui porte l'information de mouvement. */}
        <span className="hidden min-w-0 max-w-[300px] shrink-0 @max-[800px]/entete:!hidden md:block">
          <span className="block truncate text-[12.5px] text-papa-text">{ligne1}</span>
          <span className="block truncate text-[10.5px] text-papa-muted @max-[880px]/entete:hidden">
            {ligne2}
          </span>
        </span>

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
        {activity.queued_count > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-papa-accent/25 bg-papa-accent/10 px-2 py-0.5 text-[10.5px] text-papa-accent @max-[980px]/entete:hidden">
            {activity.queued_count} en attente
          </span>
        )}

        {/* ⚠️ Sans granularité, aucun chiffre — et AUCUNE CASE. Un « — » à cet endroit se lirait
            encore comme une valeur. */}
        {mesure && (
          <span className="shrink-0 text-right leading-tight @max-[880px]/entete:hidden">
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
        <Boite
          produites={item?.pieces_produced ?? 0}
          ratio={ratio}
          recoit={recoit}
          ton={ton}
        />
      </button>
    </div>
  );
}
