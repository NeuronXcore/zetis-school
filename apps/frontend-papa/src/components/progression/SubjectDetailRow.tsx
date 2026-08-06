import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@zetis/ui";
import type { AnalysisNotion, ConsolidatedSkill, ProgressionSubject } from "@zetis/types";
import { useSubjectAnalysis } from "../../hooks/useSubjectAnalysis";
import { createMissionsFromReco, equipNotion } from "../../lib/councilClass";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";

// Durées d'attente estimées. ⚠️ Ce ne sont PAS des mesures : le serveur ne rend aucune
// progression, la barre est une ESTIMATION honnête (convention Papa — jamais de spinner nu, jamais
// de barre réinventée). `EQUIP_MS` reprend la valeur du Conseil de classe, qui lance exactement le
// même équipement : deux estimations différentes pour le même travail se contrediraient à l'écran.
const EQUIP_MS = 90_000; // jusqu'à 5 générations LLM locales (cours, fiche, cartes, quiz, mindmap)
const MISSION_MS = 8_000; // composition pur-DB, sans LLM

// Le dépliage d'une ligne de Progression (addendum ADR-0038).
//
// 🔴 **Chaque bloc RECOMPOSE le nombre de sa ligne.** C'est le verrou de tout le chantier,
// transposé d'un écran à l'autre à l'intérieur du même : un détail qui ne recompose pas son nombre
// est un constat qui ment, à quelques pixels d'écart.
//
// ⚠️ **Aucun des quatre nombres n'est redemandé au réseau** : ils viennent de `/progress/overview`,
// déjà en mémoire dans `subject`. Le dépliage ne charge que des NOMS — même règle que le panneau
// d'analyse du dashboard, et pour le même motif.
//
// ⚠️ **Les actions portent sur une notion DÉSIGNÉE**, jamais sur « les 8 » d'un coup : un geste en
// masse depuis une page de mesure serait la surface de décision que l'ADR-0038 §6 refusait — et sur
// ce point le refus reste juste. Toutes appellent des routes existantes ; aucune n'est écrite ici.

/** Ce que chaque motif d'XP veut dire, en mots de Papa. Un motif inconnu s'affiche tel quel plutôt
 *  que d'être masqué : la somme des lignes doit valoir le total, toujours. */
const REASON_LABEL: Record<string, string> = {
  mission_remediation: "missions de consolidation",
  mission_champion: "défis champion",
  eli5_reverse: "verbalisations",
  diagnostic: "diagnostics",
  quiz_completed: "quiz de fin de cours",
  mindmap_reconstruction: "cartes mentales reconstruites",
  review: "révisions",
  review_consolidation: "révisions consolidées",
};

const SEGMENT_LABEL: Record<string, string> = {
  consolidated: "acquise",
  fragile: "à renforcer",
  in_progress: "en cours",
};

const SEGMENT_DOT: Record<string, string> = {
  consolidated: "bg-papa-accent",
  fragile: "bg-papa-warn",
  in_progress: "bg-papa-muted",
};

type Action = { kind: "mission" | "equip"; skillId: number; skillName: string };

export function SubjectDetailRow({
  subject,
  consolidated,
  consolidatedLoading,
}: {
  subject: ProgressionSubject;
  /** Déjà filtrées sur la matière par la page : le composant n'en refiltre pas une seconde fois. */
  consolidated: ConsolidatedSkill[];
  consolidatedLoading: boolean;
}) {
  const { analysis, loading, error, retry } = useSubjectAnalysis(subject.subject_id);
  const [confirming, setConfirming] = useState<Action | null>(null);
  // ⚠️ On garde l'ACTION en cours, pas seulement son `skillId` : sans son `kind`, impossible de
  // dire à l'écran ce que ZETIS est en train de faire ni combien de temps ça prend.
  const [running, setRunning] = useState<Action | null>(null);
  const busy = running?.skillId ?? null;
  const [result, setResult] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async (action: Action) => {
    setRunning(action);
    setResult(null);
    setFailure(null);
    try {
      if (action.kind === "mission") {
        const missions = await createMissionsFromReco([action.skillId]);
        setResult(
          missions.length === 0
            ? `Rien à créer sur « ${action.skillName} » : une mission la couvre déjà.`
            : `Mission créée sur « ${action.skillName} », en attente de ta validation.`,
        );
      } else {
        const kit = await equipNotion(action.skillId);
        const rates = kit.errors?.length ?? 0;
        setResult(
          rates === 0
            ? `« ${action.skillName} » est équipée : cours, fiche, cartes, quiz et carte mentale.`
            : `« ${action.skillName} » partiellement équipée — ${rates} pièce(s) non produite(s).`,
        );
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "L'action a échoué.");
    } finally {
      setRunning(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-lg bg-papa-surface-2 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="px-4 py-4 text-sm text-papa-warn">
        {error ?? "Le détail n'a pas pu être chargé."}{" "}
        <button type="button" onClick={retry} className="underline">
          Réessayer
        </button>
      </div>
    );
  }

  const engaged = analysis.engaged ?? [];
  const notStarted = analysis.not_started ?? [];
  const xpByReason = analysis.xp_by_reason ?? [];
  const fragiles = analysis.to_reinforce.filter((n) => n.is_fragile);

  return (
    <div className="space-y-5 px-4 py-4">
      {/* 🔴 ZETIS DIT QU'IL TRAVAILLE. Sans ce bloc, confirmer « Équiper » ne faisait que griser un
          bouton : l'équipement enchaîne jusqu'à CINQ générations LLM locales (~90 s), et Papa
          n'avait aucun moyen de savoir si quelque chose se produisait, ni s'il devait attendre.
          Convention Papa : `useEstimatedProgress` + `<ProgressBar>` — jamais un spinner nu, jamais
          une barre réinventée.
          ⚠️ La barre est une ESTIMATION, pas une mesure : le serveur ne rend aucune progression.
          Elle dit « c'est parti et voilà l'ordre de grandeur », elle ne prétend pas compter. */}
      {running && <ActionEnCours action={running} />}

      {(result || failure) && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            failure
              ? "border border-papa-warn/30 bg-papa-warn/5 text-papa-warn"
              : "border border-papa-accent/30 bg-papa-accent/5 text-papa-accent"
          }`}
        >
          {failure ?? result}{" "}
          {!failure && (
            <Link to="/missions" className="underline">
              Voir les missions →
            </Link>
          )}
        </p>
      )}

      <Bloc titre={`Avancement — ${subject.engaged} notions abordées sur ${subject.notions.total}`}>
        {engaged.length === 0 ? (
          <p className="text-sm text-papa-muted">Aucune notion n'a encore été abordée.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {engaged.map((n) => (
              <li key={n.skill_id} className="flex items-center gap-1.5 text-sm">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEGMENT_DOT[n.segment]}`} />
                {n.skill_name}
                <span className="text-xs text-papa-muted">{SEGMENT_LABEL[n.segment]}</span>
              </li>
            ))}
          </ul>
        )}
        {notStarted.length > 0 && (
          <p className="mt-2 text-xs text-papa-muted">
            {notStarted.length} notion{notStarted.length > 1 ? "s" : ""} pas encore abordée
            {notStarted.length > 1 ? "s" : ""}.{" "}
            <Link to="/programme" className="font-semibold text-papa-accent underline">
              Ouvrir le programme →
            </Link>
          </p>
        )}
      </Bloc>

      <Bloc titre={`Acquis — ${subject.notions.consolidated}`}>
        {consolidatedLoading ? (
          <p className="text-sm text-papa-muted">Chargement…</p>
        ) : consolidated.length === 0 ? (
          <p className="text-sm text-papa-muted">
            Aucune notion consolidée pour l'instant — c'est ce que l'avancement finit par produire.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {consolidated.map((n) => (
              <li key={n.skill_id} className="text-sm">
                {n.skill_name}{" "}
                <span className="text-xs tabular-nums text-papa-muted">{n.mastery_score} %</span>
              </li>
            ))}
          </ul>
        )}
      </Bloc>

      <Bloc titre={`XP — ${subject.xp}, depuis toujours`}>
        {xpByReason.length === 0 ? (
          <p className="text-sm text-papa-muted">Aucun XP gagné dans cette matière.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {xpByReason.map((x) => (
                <li key={x.reason} className="flex items-baseline gap-2 text-sm">
                  <span className="tabular-nums text-papa-muted">{x.count} ×</span>
                  <span className="flex-1">{REASON_LABEL[x.reason] ?? x.reason}</span>
                  <span className="tabular-nums font-medium">{x.amount} XP</span>
                </li>
              ))}
            </ul>
            {/* Écrit à l'écran, pas seulement dans l'ADR : sans cette phrase, Papa lirait un
                détail « par activité » comme un détail « par notion » et chercherait longtemps
                laquelle a rapporté quoi. */}
            <p className="mt-2 text-xs text-papa-muted">
              Réparti par activité — le XP n'est pas rattaché à une notion précise.
            </p>
          </>
        )}
      </Bloc>

      <Bloc titre={`À renforcer — ${subject.notions.fragile}`}>
        {fragiles.length === 0 ? (
          <p className="text-sm text-papa-muted">Rien à renforcer dans cette matière.</p>
        ) : (
          <ul className="space-y-2">
            {fragiles.map((n) => (
              <NotionRow
                key={n.skill_id}
                notion={n}
                busy={busy === n.skill_id}
                disabled={busy !== null}
                onAct={(kind) =>
                  setConfirming({ kind, skillId: n.skill_id, skillName: n.skill_name })
                }
              />
            ))}
          </ul>
        )}
      </Bloc>

      <div className="flex justify-end">
        <Link
          to={`/conseil?subject=${subject.slug}`}
          className="rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
        >
          Conseil de classe sur {subject.name} →
        </Link>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming?.kind === "equip"
            ? `Équiper « ${confirming?.skillName} » ?`
            : `Créer une mission sur « ${confirming?.skillName} » ?`
        }
        confirmLabel={confirming?.kind === "equip" ? "Équiper" : "Créer"}
        busy={busy !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const action = confirming;
          setConfirming(null);
          if (action) void run(action);
        }}
      >
        {confirming?.kind === "equip" ? (
          <p>
            ZETIS génère et <b>auto-valide</b> le kit de cette notion : cours, fiche, cartes de
            révision, quiz et carte mentale. Cela peut prendre plusieurs minutes.
          </p>
        ) : (
          <>
            <p>
              La mission est composée à partir des <b>contenus déjà validés</b> — aucun contenu
              n'est généré.
            </p>
            <p className="mt-2">
              Elle naît <b>en attente de ta validation</b> : elle n'atteindra Massimo qu'une fois
              relue sur la page Missions.
            </p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Ce que ZETIS est en train de faire, et l'ordre de grandeur de l'attente. */
function ActionEnCours({ action }: { action: Action }) {
  const equipe = action.kind === "equip";
  const pct = useEstimatedProgress(true, equipe ? EQUIP_MS : MISSION_MS);
  return (
    <ProgressBar
      pct={pct}
      label={
        equipe
          ? `ZETIS équipe « ${action.skillName} » — cours, fiche, cartes, quiz, carte mentale`
          : `ZETIS compose une mission sur « ${action.skillName} »`
      }
    />
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-widest text-papa-muted">{titre}</h3>
      {children}
    </section>
  );
}

function NotionRow({
  notion,
  busy,
  disabled,
  onAct,
}: {
  notion: AnalysisNotion;
  busy: boolean;
  disabled: boolean;
  onAct: (kind: "mission" | "equip") => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-papa-border bg-papa-surface px-3 py-2">
      <span className="min-w-0 flex-1 text-sm">
        {notion.skill_name}
        {notion.mastery_score != null && (
          <span className="ml-2 text-xs tabular-nums text-papa-muted">
            {notion.mastery_score} %
          </span>
        )}
      </span>
      {notion.has_active_mission ? (
        // Même drapeau que la page `/lacunes` (`skills_with_active_mission`) : les deux surfaces
        // ne peuvent pas se contredire sur « est-ce déjà pris en charge ».
        <span className="text-xs text-papa-muted">déjà prise en charge</span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAct("mission")}
          className="rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold hover:border-papa-accent disabled:opacity-50"
        >
          {busy ? "…" : "Créer une mission"}
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAct("equip")}
        className="rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold hover:border-papa-accent disabled:opacity-50"
      >
        {busy ? "…" : "Équiper"}
      </button>
    </li>
  );
}
