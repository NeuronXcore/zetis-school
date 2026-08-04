// Journal de production (ADR-0034) — ce que ZETIS a fait, et ce que Papa peut encore retirer.
//
// Deux choses qu'un écran de suivi ne fait PAS, et qui sont ici des règles :
//
// - **Aucun total, aucun ratio ZETIS/Papa** (§F.2). La provenance est un fait, jamais un
//   reproche : elle s'affiche par objet et ne se totalise pas. Un compteur « 31 objets servis
//   sans relecture » en tête de page serait un bulletin de retard.
// - **La portée est dite, pas devinée.** Le Journal ne montre que la production EN LOT ; le
//   Conseil de classe et la composition champion équipent hors lot. Le silence sur eux ne doit
//   pas se lire comme « rien d'autre n'a été produit ».
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@zetis/ui";
import { type JournalPiece, type JournalRun, type PieceKind, type VetoPreview } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { NIVEAU_LABEL } from "../lib/settings";
import { REGIME_AVATAR } from "../lib/regimeVisuals";
import { journalLink } from "../lib/pilotageLinks";
import { SCOPE_NOUN } from "../lib/production";
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

export function JournalPage() {
  const [runs, setRuns] = useState<JournalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJournal();
      setRuns(data.runs);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement du journal échoué");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      await reload();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Retrait échoué");
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }, [target, reload]);

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
        Ce journal ne montre que la production <strong>en lot</strong>. Les contenus créés par le
        Conseil de classe ou une mission champion n'y figurent pas : vous les avez demandés d'un
        clic, ils n'ont pas de fenêtre de retrait.
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-papa-muted">Chargement…</p>}

      {!loading && runs.length === 0 && (
        <p className="text-sm text-papa-muted">
          Aucun lot de production pour l'instant. Lancez-en un depuis la Couverture.
        </p>
      )}

      <div className="space-y-4">
        {runs.map((run) => (
          <section key={run.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
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
        ))}
      </div>

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
