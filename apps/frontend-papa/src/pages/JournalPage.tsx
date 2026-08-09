// Journal de production (ADR-0034) — ce que ZETIS a fait, et ce que Papa peut encore retirer.
//
// Deux choses qu'un écran de suivi ne fait PAS, et qui sont ici des règles :
//
// - **Aucun total, aucun ratio ZETIS/Papa** (§F.2). La provenance est un fait, jamais un
//   reproche : elle s'affiche par objet et ne se totalise pas. Un compteur « 31 objets servis
//   sans relecture » en tête de page serait un bulletin de retard.
// - **La portée est dite, pas devinée.** ⚠️ Elle a CHANGÉ le 2026-08-06 (addendum ADR-0041
//   §16-§18) : le Journal ne montrait que la production EN LOT, et le commentaire ci-dessous
//   avertissait que « le silence sur le hors-lot ne doit pas se lire comme rien d'autre n'a été
//   produit ». Depuis la migration des quinze producteurs, ce silence aurait couvert les trois
//   quarts de ce qui produit — les travaux unitaires y entrent donc, entrelacés par date.
//   Ils y disent ce qu'ils savent et **se taisent sur le reste** : ni régime, ni pièces, ni veto
//   (§17). Un filtre qu'ils ne portent pas les écarte, et la page l'annonce (§18).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmDialog, type SubjectFilterOption } from "@zetis/ui";
import {
  type JournalPiece,
  type JournalRun,
  type JournalTravail,
  type PieceKind,
  type VetoPreview,
} from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import {
  JournalFilterBar,
  type ChapitreOption,
} from "../components/journal/JournalFilterBar";
import { NIVEAU_LABEL } from "../lib/settings";
import { REGIME_AVATAR } from "../lib/regimeVisuals";
import { journalLink } from "../lib/pilotageLinks";
import { SCOPE_NOUN } from "../lib/production";
import { fetchActiveSchoolYear, fetchChapters } from "../lib/curriculum";
import {
  FILTRE_VIDE,
  depuisUrl,
  filtreActif,
  versUrl,
  type JournalFiltre,
} from "../lib/journalFilters";
import {
  AUTHORITY_LABEL,
  PIECE_ICON,
  PIECE_LABEL,
  RUN_STATUS_LABEL,
  TRIGGER_LABEL,
  fetchJournal,
  previewRemoval,
  removePiece,
} from "../lib/journal";

type Target = { piece: JournalPiece; preview: VetoPreview };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TONE: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-300",
  running: "bg-sky-500/15 text-sky-300",
  queued: "bg-slate-500/15 text-slate-300",
  failed: "bg-rose-500/15 text-rose-300",
  stale: "bg-amber-500/15 text-amber-300",
};

function RunHeader({ run }: { run: JournalRun }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[run.status] ?? ""}`}>
        {RUN_STATUS_LABEL[run.status] ?? run.status}
      </span>
      <span className="text-sm font-semibold">Lot #{run.id}</span>
      <span className="text-sm text-papa-muted">{formatDate(run.created_at)}</span>
      {/* « Demandé par » — c'est ici que `parent_rule` deviendra visible, le jour où un lot
          partira sans que personne l'ait demandé (ADR-0035). */}
      <span className="text-sm text-papa-muted">
        · {TRIGGER_LABEL[run.trigger] ?? run.trigger}
      </span>
      {/* ⚠️ Le RÉGIME de ce lot-là. Sans lui, « 0 produit » sous *Manual* (un gate qui a
          fonctionné) et « 0 produit » sur panne se lisent pareil — c'est ce qui est arrivé aux
          lots #21/#22 le 2026-08-04. Il vient du serveur, capturé au démarrage : jamais le
          réglage d'aujourd'hui plaqué sur un lot d'hier. */}
      {/* ⚠️ Le visage porte une taille FIXE (20 px) et non celle du texte : à `text-xs` un
          pictogramme devient une tache, et un badge qui grandit décale toute la ligne d'en-tête. */}
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-papa-muted"
        title={run.zetis_mode_source === "deduit" ? "Régime reconstitué de ce que ce lot a fait — il est antérieur à l'enregistrement du régime" : "Le régime d'autonomie sous lequel ce lot a tourné"}
      >
        {run.zetis_mode === null ? (
          "régime inconnu"
        ) : (
          <>
            {/* ⚠️ **Le VISAGE du régime, pas un emoji générique.** 🔒/⚖️/🚀 étaient des symboles
                choisis ici ; ZETIS a déjà un visage par régime, et c'est celui que Papa voit dans
                la sidebar et sur la page des réglages. Deux images pour un même objet, c'est deux
                choses à reconnaître — et l'écran de production doit se trier à l'œil.
                `REGIME_AVATAR` est la source unique (cf. `regimeVisuals.ts`) : on n'en fabrique
                pas une seconde. « Sur mesure » prend le visage NEUTRE, qui ne désigne aucun
                régime — c'est précisément ce pour quoi il existe. */}
            <img
              src={REGIME_AVATAR[run.zetis_mode === "sur_mesure" ? "neutre" : run.zetis_mode]}
              alt=""
              aria-hidden
              className="h-5 w-5 shrink-0 rounded-[22%] object-cover"
            />
            <span className="font-medium">
              {run.zetis_mode === "sur_mesure" ? "sur mesure" : NIVEAU_LABEL[run.zetis_mode]}
            </span>
            {/* ⚠️ « déduit » n'est pas « enregistré », et l'écran ne doit pas pouvoir les
                confondre. Un lot antérieur à la capture rend quand même son régime — reconstitué
                de ce qu'il a FAIT (un cours qu'il a rédigé, un dérivé qu'il a laissé à relire) —
                mais il le dit. Sans cette marque, une déduction se lirait comme un fait. */}
            {run.zetis_mode_source === "deduit" && (
              <span className="text-[10px] italic opacity-70">déduit</span>
            )}
          </>
        )}
      </span>
      {run.total_notions !== null && (
        <span className="text-sm text-papa-muted">
          · {run.done_notions ?? 0}/{run.total_notions} notions
        </span>
      )}
      {run.current_skill_name && (
        <span className="text-sm text-sky-300">· en cours : {run.current_skill_name}</span>
      )}
      {/* Ce que le lot a laissé, compté — pour que rien d'important ne dorme dans le repli. */}
      <RunSummary run={run} />
    </div>
  );
}

function PieceRow({
  piece,
  onRemove,
}: {
  piece: JournalPiece;
  onRemove: (p: JournalPiece) => void;
}) {
  const lien = piece.target ? journalLink(piece.kind, piece.target, piece.skill_id) : null;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
      <span aria-hidden>{PIECE_ICON[piece.kind]}</span>
      <span className="text-sm font-medium">{PIECE_LABEL[piece.kind]}</span>
      {/* ⚠️ `title` : le libellé est tronqué sur une ligne, et il coupe volontiers au milieu d'une
          formule (« comme $B = (4 - 7 »). Le survol rend le texte entier plutôt que de laisser
          Papa deviner. */}
      <span className="min-w-0 flex-1 truncate text-sm text-papa-muted" title={piece.label}>
        {piece.label}
      </span>
      {piece.skill_name && (
        <span className="text-xs text-papa-muted">{piece.skill_name}</span>
      )}
      {/* ⚠️ **La liste des pièces n'offrait AUCUN lien**, alors qu'elle est la seule partie du lot
          toujours visible — le détail, lui, dort dans un repli. Dit à l'écran le 2026-08-04 :
          « les liens cibles ne sont pas mis en place ». Même convention que partout ailleurs. */}
      {lien && (
        <Link to={lien} className="text-xs font-semibold text-papa-accent hover:underline">
          Ouvrir →
        </Link>
      )}
      {/* Provenance PAR OBJET — la seule forme que le §F.2 autorise. */}
      {piece.validated_by && (
        <span className="text-xs text-papa-muted">
          {AUTHORITY_LABEL[piece.validated_by] ?? piece.validated_by}
        </span>
      )}
      {piece.consumed ? (
        // La consommation ferme la fenêtre, pas l'horloge (§G.3). On le DIT plutôt que de
        // masquer le bouton : un geste qui disparaît sans explication se lit comme un bug.
        <span className="text-xs text-papa-muted" title="Massimo l'a déjà ouvert">
          Déjà ouvert par Massimo
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onRemove(piece)}
          className="rounded-md border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
        >
          Retirer
        </button>
      )}
    </li>
  );
}

// Le marqueur d'état d'une ligne — une case, pas un mot.
//
// ⚠️ **« non produit » portait à confusion**, dit à l'écran le 2026-08-04 : la formule se lit comme
// un échec alors que, sur une ligne bloquée, c'est un gate qui a fonctionné. Une case **à cocher**
// dit la même chose sans la charge : ce qui est fait est coché, ce qui reste à faire ne l'est pas.
//
// ⚠️ **Ce n'est PAS un `<input type="checkbox">`, et c'en est le contraire exact.** Un journal est
// un registre : rien ne s'y coche à la main. Une vraie case laisserait croire qu'on peut la cocher
// — un contrôle qui ne contrôle rien, et un mensonge pour les lecteurs d'écran. D'où un glyphe
// décoratif, et le mot rendu au clavier par `aria-label`.
// ⚠️ **La case est DESSINÉE, pas écrite.** Première version en `☐` / `☑` (U+2610/U+2611) : ces
// glyphes sont rendus en trait d'un demi-pixel par les polices système, et sur le fond sombre de
// Papa ils étaient **invisibles à l'écran** — constaté le 2026-08-04, « je ne vois aucune
// checkbox ». Un caractère dont l'apparence dépend de la police installée n'est pas un élément
// d'interface : on le dessine.
const OUTCOME_MARK: Record<
  string,
  { glyphe: "check" | "vide" | "croix"; mot: string; ton: string }
> = {
  generated: { glyphe: "check", mot: "produit", ton: "text-emerald-300" },
  skipped: { glyphe: "check", mot: "déjà présent", ton: "text-papa-muted" },
  // Rien n'a été produit : la case reste VIDE, même quand la cause a disparu depuis. Ce que le lot
  // a fait ne change pas ; c'est le badge « depuis résolu » qui dit le présent.
  blocked: { glyphe: "vide", mot: "à faire", ton: "text-amber-300" },
  error: { glyphe: "croix", mot: "erreur", ton: "text-rose-300" },
};

/** La case d'état d'une ligne — un carré arrondi, la couleur venant de la ligne (`currentColor`).
 *
 *  ⚠️ **Ce n'est pas un `<input type="checkbox">`, et c'en est le contraire exact.** Un journal est
 *  un registre : rien ne s'y coche à la main. Une vraie case laisserait croire qu'on peut la
 *  cocher — un contrôle qui ne contrôle rien, et un mensonge pour les lecteurs d'écran. D'où un
 *  dessin porteur de son seul `aria-label`, verrouillé par un test qui exige l'absence de tout
 *  `role="checkbox"` dans la page. */
function OutcomeBox({ outcome, muette }: { outcome: string; muette?: boolean }) {
  const mark = OUTCOME_MARK[outcome] ?? OUTCOME_MARK.error!;
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      // ⚠️ `muette` dans le RÉSUMÉ : « 1 à faire » est écrit juste à côté. Y répéter le nom
      // accessible ferait annoncer deux fois la même chose, et rendrait le mot ambigu pour les
      // tests comme pour un lecteur d'écran.
      {...(muette ? { "aria-hidden": true } : { role: "img", "aria-label": mark.mot })}
      className={`shrink-0 self-center ${mark.ton}`}
    >
      {/* ⚠️ Pas de `<title>` : le mot est écrit JUSTE À CÔTÉ. Un tooltip qui répète le texte
          visible n'ajoute rien, et il devenait une seconde occurrence du même mot dans l'arbre —
          `getByText("à faire")` en trouvait deux. Le nom accessible reste porté par `aria-label`. */}
      {/* Le fond translucide n'est pas décoratif : sur fond sombre, une bordure seule à 1,5 px se
          perd dès que la ligne est dense. */}
      <rect
        x="0.9"
        y="0.9"
        width="12.2"
        height="12.2"
        rx="3"
        fill="currentColor"
        fillOpacity={mark.glyphe === "vide" ? 0.08 : 0.2}
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {mark.glyphe === "check" && (
        <path
          d="M3.6 7.2 L6 9.5 L10.4 4.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {mark.glyphe === "croix" && (
        <path
          d="M4.6 4.6 L9.4 9.4 M9.4 4.6 L4.6 9.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Ce que le lot a laissé, compté — dans l'EN-TÊTE, hors du repli.
 *
 *  ⚠️ **Le repli est fermé par défaut**, et c'est ce qui a fait dire « je ne vois aucune checkbox »
 *  le 2026-08-04 : les cases, les motifs et les liens vivent tous dedans. Ce que Papa vient
 *  chercher en ouvrant le Journal — *qu'est-ce qui reste à faire ?* — demandait un clic par lot
 *  pour être découvert. Le résumé le remonte ; le repli garde le détail.
 *
 *  ⚠️ **Une ligne bloquée mais RÉSOLUE ne compte pas dans « à faire ».** C'est la même exigence que
 *  le badge du §3 : le motif est au passé, le compte est au présent. La compter reviendrait à
 *  réclamer un geste qui n'a plus lieu d'être — exactement ce qu'on a passé la journée à corriger.
 */
function RunSummary({ run }: { run: JournalRun }) {
  const compte = { blocked: 0, resolu: 0, error: 0, generated: 0, skipped: 0 };
  for (const e of run.events) {
    if (e.outcome === "blocked") {
      if (e.resolved) compte.resolu += 1;
      else compte.blocked += 1;
    } else if (e.outcome in compte) {
      compte[e.outcome as "error" | "generated" | "skipped"] += 1;
    }
  }
  const s = (n: number) => (n > 1 ? "s" : "");
  // L'ordre est celui de l'urgence : ce qui attend un geste d'abord, ce qui est fait ensuite.
  const groupes: { cle: string; outcome: string; texte: string; attenue?: boolean }[] = [
    { cle: "blocked", outcome: "blocked", texte: `${compte.blocked} à faire` },
    { cle: "error", outcome: "error", texte: `${compte.error} erreur${s(compte.error)}` },
    { cle: "generated", outcome: "generated", texte: `${compte.generated} produit${s(compte.generated)}` },
    { cle: "resolu", outcome: "blocked", texte: `${compte.resolu} depuis résolu`, attenue: true },
    {
      cle: "skipped",
      outcome: "skipped",
      texte: `${compte.skipped} déjà présent${s(compte.skipped)}`,
    },
  ].filter((g) => compte[g.cle as keyof typeof compte] > 0);

  if (groupes.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-2.5 text-xs">
      {groupes.map((g) => (
        <span key={g.cle} className={`inline-flex items-center gap-1.5 ${g.attenue ? "opacity-60" : ""}`}>
          <OutcomeBox outcome={g.outcome} muette />
          <span className={OUTCOME_MARK[g.outcome]?.ton}>{g.texte}</span>
        </span>
      ))}
    </span>
  );
}

function EventList({ run }: { run: JournalRun }) {
  if (run.events.length === 0) return null;
  return (
    // ⚠️ Plus de `<details>` ici : le lot entier en porte un seul (2026-08-04). Deux plis imbriqués
    // demandaient deux clics pour lire une ligne, et le second se refermait à chaque rechargement.
    <div className="mt-3">
      <p className="text-sm text-papa-muted">
        Détail de ce que ZETIS a fait ({run.events.length})
      </p>
      <ul className="mt-2 space-y-1">
        {run.events.map((e, i) => {
          const mark = OUTCOME_MARK[e.outcome] ?? OUTCOME_MARK.error!;
          const href = e.target ? journalLink(e.piece, e.target, e.skill_id) : null;
          return (
          <li key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
            <OutcomeBox outcome={e.outcome} />
            <span className="text-papa-muted">{e.skill_name ?? "—"}</span>
            {e.piece && <span>{PIECE_LABEL[e.piece]}</span>}
            <span className={mark.ton}>{mark.mot}</span>
            {e.detail && <span className="text-papa-muted">— {e.detail}</span>}
            {/* ⚠️ **Au présent, à côté du motif — jamais à sa place.** La ligne d'origine reste
                exacte : le lot #23 a bien été bloqué par un cours inexistant, deux minutes avant
                qu'il soit écrit. La réécrire ferait perdre la raison pour laquelle il n'a rien
                produit (§F.4). Sans cette mention, elle se lit comme un problème actuel. */}
            {e.resolved && (
              <span
                className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
                title="La cause de ce blocage n'existe plus — un lot lancé maintenant passerait"
              >
                depuis résolu
              </span>
            )}
            {/* La destination, à côté de l'état — dans les DEUX sens de lecture. Sur une ligne
                bloquée, elle mène au cours à écrire (le reproche du 2026-08-04 : un motif sans
                destination oblige Papa à retrouver la leçon à la main). Sur une ligne produite,
                elle mène à la pièce : voir ce que ZETIS vient de faire est le geste suivant le
                plus naturel, et il manquait. Les ids viennent du serveur (ADR-0037) ; l'URL suit
                la convention `pilotageLinks`, déjà en place pour la Couverture. */}
            {href && (
              <Link to={href} className="font-semibold text-papa-accent hover:underline">
                {e.outcome === "blocked"
                  ? "Ouvrir la leçon →"
                  /* `SCOPE_NOUN` et pas `PIECE_LABEL` : celui-là n'a pas d'article, et
                       « Voir fiche → » n'est pas du français. La table existe déjà pour dire ce
                       qu'un lot produit — on ne crée pas un sixième vocabulaire. */
                  : `Voir ${e.piece ? SCOPE_NOUN[e.piece] ?? "le contenu" : "le contenu"} →`}
              </Link>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Taille d'une page. Le serveur plafonne à 50 : demander plus ne rendrait pas plus. */
const PAGE = 20;

/** UNE ligne de travail unitaire au Journal (addendum ADR-0041 §17).
 *
 *  ⚠️ **Elle dit ce qu'elle sait, et se tait sur le reste.** Pas de régime, pas de pli « contenu du
 *  lot », **pas de bouton de retrait** : un `AIJob` ne grave aucun palier et ne tamponne aucune
 *  pièce, donc un veto ne pourrait rien retirer. Afficher les mêmes affordances qu'un lot ferait
 *  promettre à l'écran ce que la donnée ne porte pas — la faute que l'ADR-0011 §F et l'ADR-0040
 *  ont chacun payée.
 *
 *  Visuellement plus SOBRE qu'un lot, et c'est voulu : un geste unitaire n'est pas une campagne. */
function TravailRow({ travail }: { travail: JournalTravail }) {
  const echec = travail.status === "failed";
  const arrete = travail.status === "stale";
  const ton = echec
    ? "border-red-400/25 bg-red-400/[0.04]"
    : arrete
      ? "border-amber-400/25 bg-amber-400/[0.04]"
      : "border-white/[0.06] bg-white/[0.015]";
  const etat = echec
    ? "échec"
    : arrete
      ? "arrêté"
      : travail.status === "succeeded"
        ? "fait"
        : travail.status === "running"
          ? "en cours"
          : "en file";
  return (
    <section className={`rounded-xl border ${ton} px-4 py-3`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs uppercase tracking-widest text-papa-muted">Travail</span>
        <span className="font-semibold text-papa-text">{travail.label}</span>
        <span
          className={`text-xs ${echec ? "text-red-300" : arrete ? "text-amber-300" : "text-papa-muted"}`}
        >
          {etat}
        </span>
        {travail.duration_ms ? (
          <span className="text-xs tabular-nums text-papa-muted">
            {Math.round(travail.duration_ms / 1000)} s
          </span>
        ) : null}
        <span className="ml-auto text-xs text-papa-muted">
          {new Date(travail.created_at).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {/* Le motif d'échec est rendu TEL QUEL — décision du 2026-08-06 : il sert à savoir quoi
          réparer, le reformuler ajouterait une couche entre le fait et celui qui doit agir. */}
      {echec && travail.error && <p className="mt-1.5 text-sm text-red-300">{travail.error}</p>}
      {/* 🔴 **CE QUE LE TRAVAIL A PRODUIT** (addendum ADR-0041). Avant cette ligne, `fait` voulait
          dire « le programme est allé au bout » et Papa lisait « la donnée existe » — deux choses
          qui divergent, et un `Équipement · fait · 0 s` qui n'avait rien fabriqué se lisait comme
          une production réussie.

          ⚠️ Le texte, le ton et la route sont **calculés serveur** : « qu'a produit ce travail »
          a une seule réponse dans le dépôt (motif ADR-0037). Un `switch` sur `job_type` ici en
          serait une deuxième, qui divergerait au premier type ajouté.

          ⚠️ `avertissement` est AMBRE, jamais rouge : ne rien produire parce que tout existait
          déjà est un résultat correct — il surprend, il ne fâche pas. */}
      {travail.production && (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              travail.production.ton === "succes"
                ? "bg-papa-accent-2/10 text-papa-accent-2"
                : travail.production.ton === "avertissement"
                  ? "bg-papa-warn/10 text-papa-warn"
                  : "bg-white/5 text-papa-muted"
            }`}
          >
            {travail.production.texte}
          </span>
          {/* 🔴 Pas de lien quand rien n'a été produit — le serveur rend `route: null` dans ce cas
              et un test-verrou l'épingle. L'écran n'a donc rien à décider ici : il suit. */}
          {travail.production.route && (
            <Link
              to={travail.production.route}
              className="text-xs text-papa-accent-2 underline-offset-2 hover:underline"
            >
              {/* 🔴 Le libellé vient du SERVEUR et nomme son grain (« voir la leçon → », « voir les
                  diagnostics d'Histoire-Géo → »). Un « voir → » nu laissait Papa découvrir où il
                  atterrissait — trouvé à la relecture du 2026-08-09, et c'est le défaut que
                  l'`adr-0047` Décision 8 avait déjà corrigé sur la station ②. */}
              {travail.production.route_texte ?? "voir →"}
            </Link>
          )}
        </p>
      )}
      {/* ⚠️ L'ORIGINE, jamais le régime (§17) : « lancé par vous » dit qui a demandé, pas sous
          quelles règles ZETIS avait le droit de servir sans relecture. */}
      <p className="mt-1 text-xs text-papa-muted">lancé par vous · hors lot</p>
    </section>
  );
}

/** UNE section de LOT — extraite telle quelle pour que le flux puisse entrelacer lots et
 *  travaux (addendum ADR-0041 §16).
 *
 *  ⚠️ **Aucune ligne de rendu n'a changé** : c'est un déplacement à comportement constant — la
 *  condition pour que l'entrelacement ne soit pas, en plus, une refonte du lot. */
function RunSection({
  run,
  askRemove,
}: {
  run: JournalRun;
  /** Le veto, passé en PROP : il vit dans l'état de la page (modale de confirmation, rechargement).
   *  ⚠️ Une section de lot l'offre ; une ligne de travail unitaire **non** — un `AIJob` ne tamponne
   *  aucune pièce, donc il n'y aurait rien à retirer (addendum §17). */
  askRemove: (piece: JournalPiece) => void;
}) {
  return (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <RunHeader run={run} />
          {/* ⚠️ **Un lot = un pli, fermé.** La liste des pièces était toujours déployée : le lot
              #3 en aligne 33, ce qui noie les autres lots et rend la page illisible — constaté à
              l'écran le 2026-08-04. L'en-tête raconte désormais le lot (régime, notions, résumé
              des issues) ; le pli garde tout le reste.
              ⚠️ Un SEUL pli, pas deux : les pièces et le détail répondent à la même question
              (« qu'a fait ce lot ? »), et deux plis imbriqués obligeaient à deux clics. */}
          {(run.pieces.length > 0 || run.events.length > 0) && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-papa-muted">
                Voir le contenu du lot
                {run.pieces.length > 0 && ` — ${run.pieces.length} pièce${run.pieces.length > 1 ? "s" : ""}`}
              </summary>
              {run.pieces.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {run.pieces.map((p) => (
                    <PieceRow key={`${p.kind}-${p.id}`} piece={p} onRemove={askRemove} />
                  ))}
                </ul>
              )}
              <EventList run={run} />
            </details>
          )}
          {/* ⚠️ Vu à l'écran le 2026-08-03, sur les vrais lots du 2 août : un lot terminé
              « 3/3 notions » qui n'affiche NI pièce NI détail se lit comme une panne. C'est
              l'inverse — soit tout existait déjà, soit le lot est antérieur au journal (aucune
              rétro-attribution, §F.4). Un vide non expliqué est un vide qui inquiète. */}
          {run.pieces.length === 0 && run.events.length === 0 && (
            <p className="mt-3 text-sm text-papa-muted">
              Aucun contenu neuf rattaché à ce lot — soit tout existait déjà, soit il est
              antérieur au journal, qui ne reconstitue pas le passé.
            </p>
          )}
        </section>
  );
}

export function JournalPage() {
  const [runs, setRuns] = useState<JournalRun[]>([]);
  // Les travaux unitaires de la MÊME page (addendum ADR-0041 §16). Ils arrivent à part parce
  // qu'ils ne portent ni régime, ni pièces, ni journal ligne à ligne (§17) — les mêler au type
  // `JournalRun` les obligerait à faire semblant. L'entrelacement se fait à l'affichage.
  const [travaux, setTravaux] = useState<JournalTravail[]>([]);
  // Pourquoi ils sont absents, quand un filtre les écarte (§18). ⚠️ À AFFICHER : une exclusion
  // muette se lit comme un vide.
  const [travauxExclus, setTravauxExclus] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  /** Le total SANS filtre, retenu au premier chargement — « 7 lots sur 23 » a besoin des deux. */
  const [totalNonFiltre, setTotalNonFiltre] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);

  // Le filtre vit dans l'URL : un journal filtré se rouvre tel quel, et le retour arrière défait
  // le filtre au lieu de quitter la page.
  const [params, setParams] = useSearchParams();
  const filtre = useMemo(() => depuisUrl(params), [params]);
  const [deplie, setDeplie] = useState(false);

  const [subjects, setSubjects] = useState<SubjectFilterOption[]>([]);
  const [sysParMatiere, setSysParMatiere] = useState<Record<number, number>>({});
  const [chapitres, setChapitres] = useState<ChapitreOption[]>([]);

  const majFiltre = useCallback(
    (suivant: JournalFiltre) => setParams(versUrl(suivant), { replace: true }),
    [setParams],
  );

  /** Recharge depuis le début, en gardant AUTANT de lots qu'on en avait déjà déplié.
   *
   * ⚠️ Rien ici ne concerne le veto : c'est le retrait d'une pièce qui rappelle cette fonction, et
   * repartir à la première page renverrait Papa en haut du journal après chaque geste. On refait
   * donc la même hauteur de lecture. Au-delà de 50, le serveur tronque — la fin de la liste se
   * recharge alors d'un clic, ce qui est le pire cas et il est rare. */
  const requete = useMemo(() => versUrl(filtre), [filtre]);

  const reload = useCallback(
    async (combien = PAGE) => {
      setError(null);
      try {
        const data = await fetchJournal(Math.min(50, Math.max(PAGE, combien)), 0, requete);
        setRuns(data.runs);
        setTravaux(data.travaux);
        setTravauxExclus(data.travaux_exclus);
        setTotal(data.total);
        setHasMore(data.has_more);
        // Le total de référence ne se lit QUE sur une réponse non filtrée : le relire sous filtre
        // ferait afficher « 7 sur 7 », ce qui cacherait qu'il existe autre chose.
        if (!filtreActif(filtre)) setTotalNonFiltre(data.total);
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Chargement du journal échoué");
      } finally {
        setLoading(false);
      }
    },
    [requete, filtre],
  );

  /** La page suivante EMPILE — un journal se lit de haut en bas, il ne se feuillette pas.
   *
   * ⚠️ Ce bouton répare un manque ANTÉRIEUR au chantier : `fetchJournal` était appelée sans
   * argument, donc bornée à 20 lots, et `has_more` voyageait dans la réponse **sans être lu par
   * personne**. Au-delà de vingt lots, le Journal était muet — et il ne disait pas qu'il l'était. */
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      // 🔴 **L'offset compte les DEUX modèles.** La page est découpée en SQL sur leur union
      // (§16) : paginer sur `runs.length` seul redemanderait des lignes déjà affichées et en
      // sauterait d'autres, en silence.
      const data = await fetchJournal(PAGE, runs.length + travaux.length, requete);
      setRuns((precedents) => [...precedents, ...data.runs]);
      setTravaux((precedents) => [...precedents, ...data.travaux]);
      setTotal(data.total);
      setHasMore(data.has_more);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement des lots plus anciens échoué");
    } finally {
      setLoadingMore(false);
    }
  }, [runs.length, travaux.length, requete]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ⚠️ **Le total de RÉFÉRENCE, quand on arrive déjà filtré.** Vu à l'écran le 2026-08-04 : ouvrir
  // une URL filtrée affichait « 1 lot » tout court — la page n'ayant jamais fait de lecture non
  // filtrée, elle n'avait aucun « sur 9 » à montrer. La ligne de synthèse doit se suffire à
  // elle-même, sinon « 1 lot » se lit comme « ZETIS n'a produit qu'une fois ».
  //
  // Une requête de plus, **une seule fois**, et seulement dans ce cas : `limit=1` parce qu'on ne
  // veut que le compteur, pas les lots.
  useEffect(() => {
    if (totalNonFiltre !== null || !filtreActif(filtre)) return;
    let annule = false;
    void (async () => {
      try {
        const data = await fetchJournal(1, 0);
        if (!annule) setTotalNonFiltre(data.total);
      } catch {
        // Sans lui, la ligne perd son « sur N » — elle reste juste, en disant moins.
      }
    })();
    return () => {
      annule = true;
    };
  }, [filtre, totalNonFiltre]);

  // Les matières viennent de l'année active, pas de la réponse du Journal — un appel, une fois.
  useEffect(() => {
    void (async () => {
      try {
        const annee = await fetchActiveSchoolYear();
        setSubjects(
          annee.subjects.map((s) => ({
            id: s.subject_id,
            name: s.subject_name,
            slug: s.subject_slug,
          })),
        );
        setSysParMatiere(Object.fromEntries(annee.subjects.map((s) => [s.subject_id, s.id])));
      } catch {
        // Sans la liste, la rangée matière est vide et le reste de la barre fonctionne. Un journal
        // qui tomberait parce que ses pastilles n'ont pas chargé serait pire que des pastilles
        // absentes.
      }
    })();
  }, []);

  // ⚠️ Les chapitres se lisent par MATIÈRE D'ANNÉE (`school_year_subject_id`), pas par matière :
  // il n'existe aucune liste « tous les chapitres ». Le select dépend donc de la matière choisie.
  useEffect(() => {
    const sysId = filtre.subjectId === null ? undefined : sysParMatiere[filtre.subjectId];
    if (sysId === undefined) {
      setChapitres([]);
      return;
    }
    let annule = false;
    void (async () => {
      try {
        const liste = await fetchChapters(sysId);
        if (!annule) setChapitres(liste.map((c) => ({ id: c.id, name: c.name })));
      } catch {
        if (!annule) setChapitres([]);
      }
    })();
    return () => {
      annule = true;
    };
  }, [filtre.subjectId, sysParMatiere]);

  // La modale annonce la portée AVANT le geste : un veto qui surprend n'est pas exercé deux fois.
  const askRemove = useCallback(async (piece: JournalPiece) => {
    try {
      const preview = await previewRemoval(piece.kind, piece.id);
      setTarget({ piece, preview });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Aperçu du retrait échoué");
    }
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!target) return;
    setBusy(true);
    try {
      await removePiece(target.piece.kind, target.piece.id);
      setTarget(null);
      await reload(runs.length + travaux.length);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Retrait échoué");
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }, [target, reload, runs.length, travaux.length]);

  const cascade = target?.preview.cascade ?? {};
  const cascadeEntries = Object.entries(cascade).filter(([, ids]) => (ids?.length ?? 0) > 0);
  const refused = target !== null && !target.preview.removable;

  return (
    <div>
      <PageHeader
        title="Journal de production"
        subtitle="Ce que ZETIS a produit, lot par lot — et ce que vous pouvez encore retirer."
        icon={<span aria-hidden>📜</span>}
      />

      {/* La portée est DITE. Le Conseil de classe et la composition champion équipent hors lot :
          leurs contenus n'apparaissent pas ici, et un journal qui paraît exhaustif sans l'être
          est pire qu'un journal qui borne son sujet. */}
      <p className="mb-6 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-papa-muted">
        Ce journal montre les <strong>lots</strong> et les <strong>travaux</strong>, mêlés par
        date. ⚠️ Un travail dit ce qu'il a fait, mais <strong>ne se retire pas</strong> : le retrait
        s'appuie sur le tampon que seul un lot pose sur ce qu'il produit. Les compositions
        instantanées — une mission champion, un conseil de classe — n'y figurent toujours pas.
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      <JournalFilterBar
        filtre={filtre}
        onChange={majFiltre}
        onReset={() => majFiltre(FILTRE_VIDE)}
        subjects={subjects}
        chapitres={chapitres}
        total={total}
        totalNonFiltre={totalNonFiltre}
        deplie={deplie}
        onToggleDeplie={() => setDeplie((d) => !d)}
      />

      {loading && <p className="text-sm text-papa-muted">Chargement…</p>}

      {!loading && runs.length === 0 && !filtreActif(filtre) && (
        <p className="text-sm text-papa-muted">
          Aucun lot de production pour l'instant. Lancez-en un depuis la Couverture.
        </p>
      )}

      {/* ⚠️ **L'état vide filtré est BAVARD, et c'est le signal d'échec nommé par l'addendum** : un
          filtre qui rend vide sans dire POURQUOI est indiscernable d'une panne. Deux causes
          existent par construction, et l'écran doit les nommer sans quoi Papa conclura que ZETIS
          n'a rien fait. */}
      {!loading && runs.length === 0 && filtreActif(filtre) && (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-8 text-center">
          <h3 className="text-sm font-bold text-papa-text">Aucun lot ne correspond à ce filtre.</h3>
          {totalNonFiltre !== null && (
            <p className="mx-auto mt-2 max-w-xl text-sm text-papa-muted">
              Le journal compte {totalNonFiltre} entrée{totalNonFiltre > 1 ? "s" : ""} au total —
              lots et travaux confondus.
            </p>
          )}
          {filtre.pieces.length > 0 && (
            <p className="mx-auto mt-3 max-w-xl rounded-lg border border-white/10 bg-papa-bg px-4 py-3 text-left text-sm leading-relaxed text-papa-muted">
              ⚠️ Un filtre <strong className="text-papa-text">par contenu</strong> écarte deux
              sortes de lots qui existent pourtant : ceux qui ont été{" "}
              <strong className="text-papa-text">bloqués avant de produire quoi que ce soit</strong>{" "}
              — ils n'ont atteint aucun type — et ceux{" "}
              <strong className="text-papa-text">antérieurs au détail par pièce</strong>, qui n'ont
              rien laissé à comparer même quand ils ont produit.
            </p>
          )}
          {filtre.modes.length > 0 && (
            <p className="mx-auto mt-3 max-w-xl rounded-lg border border-white/10 bg-papa-bg px-4 py-3 text-left text-sm leading-relaxed text-papa-muted">
              ⚠️ Un filtre <strong className="text-papa-text">par mode</strong> écarte les lots dont
              le régime n'a jamais été enregistré et dont les actes ne le prouvent pas. Ajoutez
              « Non enregistré » pour les voir.
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => majFiltre(FILTRE_VIDE)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Tout effacer
            </button>
          </div>
        </div>
      )}

      {/* ⚠️ Une exclusion muette se lit comme un VIDE (§18) — la page nomme la dimension. */}
      {travauxExclus && (
        <p className="mb-3 rounded-lg border border-white/10 bg-papa-bg px-4 py-3 text-sm text-papa-muted">
          ⚠️ {travauxExclus}
        </p>
      )}

      <div className="space-y-4">
        {/* 🔴 **Un seul flux, entrelacé par date** (§16). Ce tri n'est PAS un filtrage côté client :
            la page reçue est déjà la bonne, découpée en SQL sur l'union des deux modèles — on ne
            fait qu'ordonner ce qu'elle contient. Trier des lignes déjà chargées pour en choisir
            serait le défaut que l'addendum « tri et filtre » §2 a nommé ; les ranger ne l'est pas. */}
        {[
          ...runs.map((r) => ({ quand: r.created_at, cle: `run-${r.id}`, run: r, travail: null })),
          ...travaux.map((t) => ({
            quand: t.created_at,
            cle: `job-${t.id}`,
            run: null,
            travail: t,
          })),
        ]
          .sort((a, b) => (a.quand < b.quand ? 1 : a.quand > b.quand ? -1 : 0))
          .map((ligne) =>
            ligne.travail ? (
              <TravailRow key={ligne.cle} travail={ligne.travail} />
            ) : (
              <RunSection key={ligne.cle} run={ligne.run!} askRemove={askRemove} />
            ),
          )}
      </div>


      {/* ⚠️ Le bouton EMPILE, il ne feuillette pas : un journal se lit de haut en bas. Et il porte
          ce qui RESTE, pas ce qui est chargé — « 4 plus anciens » répond à la question que Papa se
          pose devant le bas de la liste. */}
      {hasMore && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-papa-text hover:border-white/30 disabled:opacity-50"
          >
            {loadingMore
              ? "Chargement…"
              : `Voir les lots plus anciens (${total - runs.length} restant${total - runs.length > 1 ? "s" : ""})`}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={target !== null}
        title={
          target
            ? refused
              ? `« ${PIECE_LABEL[target.piece.kind]} » ne peut plus être retiré`
              : `Retirer « ${PIECE_LABEL[target.piece.kind]} » ?`
            : ""
        }
        // ⚠️ Sur un refus, le bouton ne propose pas un geste qui partirait en 409 : il ferme.
        // Une commande qui ne fait rien est un piège — c'est le motif exact du verrou écrit sur
        // `ParametresPage` le 2026-08-02, et il vaut pour toutes les pages Papa.
        confirmLabel={refused ? "Fermer" : "Retirer"}
        cancelLabel={refused ? "" : "Annuler"}
        busy={busy}
        tone={refused ? "default" : "danger"}
        onConfirm={refused ? () => setTarget(null) : confirmRemove}
        onCancel={() => setTarget(null)}
      >
        {refused ? (
          // Le refus porte TOUJOURS son motif : un refus muet se lit comme une panne.
          <p className="text-sm">{target.preview.reason}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              Ce contenu sera supprimé définitivement. Massimo ne l'a pas ouvert : il n'en saura
              rien, et rien ne lui manquera.
            </p>
            {cascadeEntries.length > 0 && (
              // Le cours est la source canonique de ses dérivés : en laisser un orphelin
              // servirait à Massimo un contenu dont la source n'existe plus.
              <p className="text-papa-muted">
                Ce retrait emporte aussi :{" "}
                {cascadeEntries
                  .map(([kind, ids]) => `${ids!.length} ${PIECE_LABEL[kind as PieceKind]}`)
                  .join(", ")}
                .
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
