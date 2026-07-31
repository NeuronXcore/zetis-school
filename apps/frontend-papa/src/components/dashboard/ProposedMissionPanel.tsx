import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@zetis/ui";
import type { ProposedMission, ProposedStepType } from "@zetis/types";
import { generateRemediation, notifyPendingChanged } from "../../lib/missionsPilotage";

// « Mission proposée » — l'encart de décision de la carte Lecture ZETIS.
//
// ZETIS compose depuis les preuves ; **Papa ne crée pas unilatéralement, et l'affichage ne crée
// rien du tout**. Le parcours montré ici a été composé EN LECTURE par le moteur de missions
// (patron preview/confirm, ADR-0010) : ouvrir le dashboard n'écrit aucune ligne. La mission
// n'existe qu'après confirmation explicite.
//
// Le bouton appelle la route de création DÉJÀ EN PLACE (`generate-remediation`) — aucune surface
// d'écriture n'a été ajoutée pour cette carte. La confirmation passe par `ConfirmDialog`, comme
// toute action qui laisse une trace côté Massimo.
//
// Rien de ce cadre n'apparaît dans l'interface de Massimo.

/** Libellés lisibles des types d'étape. Le serveur sert des identifiants stables ; Papa lit du
 *  français. Pure présentation — l'ordre, lui, vient du moteur et n'est jamais réarrangé ici. */
const STEP_LABELS: Record<ProposedStepType, string> = {
  eli5: "Explication ELI5",
  vocal_explain: "Reformulation orale",
  mindmap: "Reconstruction de carte",
  quiz: "Questions ciblées",
  lesson: "Lecture du cours",
};

interface ProposedMissionPanelProps {
  proposal: ProposedMission | null;
  /** Lacunes ouvertes qu'aucune mission active ne couvre. Sert à distinguer deux vides très
   *  différents — voir l'état vide ci-dessous. */
  withoutMission: number;
  /** Recharge l'agrégat. Créer une mission est une **invalidation métier réelle** — le seul type
   *  d'événement qui autorise un refetch (ADR-0028 §1) ; un geste de filtrage, jamais. */
  onCreated: () => void;
}

export function ProposedMissionPanel({
  proposal,
  withoutMission,
  onCreated,
}: ProposedMissionPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Écart LOCAL à la session : masquer durablement demanderait une table, hors périmètre. La
  // proposition revient au rechargement — ce qui est cohérent, la lacune, elle, est toujours là.
  const [dismissed, setDismissed] = useState(false);

  if (!proposal || dismissed) {
    return (
      <div className="self-start rounded-xl border border-dashed border-papa-border p-3.5">
        {done ? (
          <p className="text-sm text-papa-muted">
            Mission créée. Elle attend ta validation sur la page Missions avant d'atteindre
            Massimo.
          </p>
        ) : withoutMission > 0 ? (
          // Vide TROMPEUR si on n'y prend pas garde : il reste des notions découvertes sans
          // mission, mais le générateur automatique ne reprend que les lacunes encore `open`.
          // Une notion déjà travaillée dont le verdict fut « à revoir » passe en `in_progress`
          // et sort de son champ — elle demande une décision de Papa, pas un automatisme.
          // Écrire « tout est pris en charge » ici serait faux.
          <p className="text-sm text-papa-muted">
            {withoutMission} notion{withoutMission > 1 ? "s" : ""} à renforcer n'
            {withoutMission > 1 ? "ont" : "a"} pas de mission active, mais {withoutMission > 1 ? "elles ont" : "elle a"}{" "}
            déjà été travaillée{withoutMission > 1 ? "s" : ""} : ZETIS ne relance pas seul.{" "}
            <Link to="/lacunes" className="text-papa-accent hover:underline">
              Décider quoi en faire →
            </Link>
          </p>
        ) : (
          <p className="text-sm text-papa-muted">
            Aucune mission à proposer : chaque notion à renforcer est déjà prise en charge.
          </p>
        )}
      </div>
    );
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await generateRemediation();
      setDone(true);
      setDismissed(true);
      setConfirming(false);
      // La sidebar tient un compteur « à valider » sur l'entrée Missions : sans ce signal, il
      // mentirait jusqu'au prochain rechargement complet.
      notifyPendingChanged();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "La mission n'a pas pu être créée.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="self-start rounded-xl border border-dashed border-papa-accent/35 bg-papa-surface-2 p-3.5">
      <p className="text-sm font-semibold">Mission proposée — « {proposal.skill_name} »</p>

      <p className="mt-1.5 text-xs leading-relaxed text-papa-muted">
        {proposal.steps.length} étape{proposal.steps.length > 1 ? "s" : ""} composée
        {proposal.steps.length > 1 ? "s" : ""} depuis les traces mesurées :{" "}
        {proposal.steps.map((step) => STEP_LABELS[step.step_type] ?? step.step_type).join(" → ")}.
        ~{proposal.estimated_minutes} min.
      </p>

      {proposal.mission_type === "remediation" && (
        <p className="mt-1.5 text-[11px] italic text-papa-muted">
          Notion déjà vue : le rappel passe avant la ré-explication (récupération active).
        </p>
      )}

      {error && <p className="mt-2 text-xs text-papa-warn">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-papa-accent px-3 py-1.5 text-xs font-bold text-[#042f1f]"
        >
          Créer la mission
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-lg border border-papa-border px-3 py-1.5 text-xs font-semibold hover:border-papa-accent"
        >
          Écarter
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Créer cette mission de consolidation ?"
        confirmLabel="Créer la mission"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirm()}
      >
        <p>
          ZETIS créera <b>« {proposal.title} »</b> ({proposal.steps.length} étapes, ~
          {proposal.estimated_minutes} min) à partir des contenus déjà validés. Aucun contenu n'est
          généré.
        </p>
        <p className="mt-2">
          La mission naît <b>en attente de ta validation</b> : elle n'atteindra Massimo qu'une fois
          relue sur la page Missions.
        </p>
      </ConfirmDialog>
    </div>
  );
}
