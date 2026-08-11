import { useState } from "react";
import type { DiagnosticRelecture, DiagnosticRelectureNotion } from "@zetis/types";

// Le questionnaire d'un diagnostic, tel que Papa le relit (adr-0051 Décision 3).
//
// PRÉSENTATIONNEL : aucun appel, aucun état de chargement propre. La page charge, ce composant
// rend. C'est ce qui lui permet d'être monté sur les TROIS crans — les deux panneaux l'affichent,
// seul le premier y adjoint des verdicts.
//
// 🔴 **LA NOTION EST L'EN-TÊTE DU GROUPE, jamais une étiquette par question.** Répétée sous chaque
// question, elle devient du bruit qu'on cesse de lire. Portée par le groupe, elle POSE LA QUESTION
// à Papa — « ces cinq-là mesurent-elles bien celle-ci ? ». Le défaut qu'une relecture peut attraper
// est un ÉCART entre un titre et N contenus, et un écart ne se voit que si les deux termes sont
// présentés comme tels.
//
// 🔴 **Aucun compteur d'avancement**, pas de « 3/8 relues », pas de barre (adr-0039 §7) : un
// compteur transforme « relire ce qui compte » en « vider la file ». Les chevrons ne gardent aucune
// mémoire de ce qui a été ouvert.
//
// ⚠️ Un diagnostic est `mcq` et rien d'autre (en dur à la génération). Le `KeyView` de
// `QuizInspectModal` couvre sept formats : le réutiliser importerait six branches mortes.

/** Le nom affiché d'une notion. 🔴 Jamais `"Notion"` : un repli qui ressemble à un nom ferait
 *  passer un défaut de génération pour une notion, sur l'écran fait pour repérer ce défaut-là. */
export function nomNotion(notion: DiagnosticRelectureNotion): string {
  return notion.skill_name ?? "— notion non renseignée —";
}

/** « 40 questions » + le détail du grain quand il est uniforme.
 *
 *  ⚠️ Le grain n'est PAS toujours uniforme dans le dépôt : `QUESTIONS_PER_SKILL` est passé de 2 à 5
 *  (adr-0043 D3), et les deux générations cohabitent. On ne dit « N chacune » que si c'est vrai. */
export function libelleVolume(relecture: DiagnosticRelecture): string {
  const groupes = relecture.notions;
  const tailles = new Set(groupes.map((n) => n.questions.length));
  const notions = `${groupes.length} notion${groupes.length > 1 ? "s" : ""}`;
  if (tailles.size === 1) {
    const parNotion = [...tailles][0];
    return `${notions}, ${parNotion} question${parNotion > 1 ? "s" : ""} chacune`;
  }
  return notions;
}

/** Un choix proposé à Massimo. La clé porte trois signaux, jamais un seul.
 *
 *  🔴 **Les quatre options ont TOUTES un cadre** — trouvé à la relecture visuelle du 2026-08-11 par
 *  le commanditaire. Sans bordure, les non-clé se lisaient comme des **lignes libres** et non comme
 *  un ensemble : on ne voyait plus « voici les quatre choix, celui-ci est le bon », on voyait un
 *  choix encadré posé au milieu de trois phrases. Or c'est précisément ce que Papa doit juger — la
 *  qualité des **distracteurs** autant que celle de la clé.
 *
 *  ⚠️ **Aucun test ne pouvait le voir**, et c'est le motif habituel : les verrous vérifiaient que
 *  la clé est marquée et que les quatre textes sont rendus. Les deux passaient. **La conformité
 *  d'un composant ne dit rien de ce que l'écran raconte.**
 *
 *  La clé reste distinguée par **trois** choses — bordure accent, fond teinté, graisse — plus le
 *  mot `✓ CLÉ`. La couleur ne porte jamais l'information seule (`crans.ts`, règle du dépôt). */
function Choix({ texte, cle }: { texte: string; cle: boolean }) {
  return (
    <li
      className={[
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
        cle
          ? "border-papa-accent/40 bg-papa-accent/10 font-semibold text-papa-accent"
          : "border-papa-border bg-papa-surface-2/40 text-papa-text",
      ].join(" ")}
    >
      <span>{texte}</span>
      {cle && (
        <span className="ml-auto font-mono text-[10.5px] font-bold tracking-wider">✓ CLÉ</span>
      )}
    </li>
  );
}

function GroupeNotion({ notion }: { notion: DiagnosticRelectureNotion }) {
  const [ouvert, setOuvert] = useState(false);
  const nom = nomNotion(notion);
  const n = notion.questions.length;

  return (
    <li
      className={[
        "overflow-hidden rounded-xl border bg-papa-surface-2",
        ouvert ? "border-papa-accent/40" : "border-papa-border",
      ].join(" ")}
    >
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-papa-surface/40"
      >
        <span aria-hidden className="w-3 text-[11px] text-papa-muted">
          {ouvert ? "▾" : "▸"}
        </span>
        <span className="font-semibold">{nom}</span>
        <span className="ml-auto font-mono text-[11.5px] text-papa-muted">
          {n} question{n > 1 ? "s" : ""}
        </span>
      </button>

      {ouvert && (
        <ol className="flex list-none flex-col gap-3 px-4 pb-4">
          {notion.questions.map((q, index) => (
            <li key={q.id} className="rounded-lg border border-papa-border bg-papa-surface p-4">
              <p className="font-mono text-[11px] tracking-wide text-papa-muted">
                Question {index + 1} / {n}
              </p>
              <p className="mt-1 mb-3 text-sm leading-relaxed">{q.prompt_markdown}</p>

              <ul className="flex list-none flex-col gap-1">
                {q.choices_json.map((choix, i) => (
                  <Choix key={i} texte={choix} cle={q.correct_answer_json === i} />
                ))}
              </ul>

              {/* 🔴 Servi `null` quand la clé n'est pas un index exploitable. Le serveur refuse de
                  coercer : désigner le MAUVAIS choix comme bonne réponse serait le pire défaut
                  possible ici. On le DIT plutôt que de laisser Papa croire qu'il a tout vu. */}
              {q.correct_answer_json === null && (
                <p className="mt-2 text-sm font-semibold text-papa-warn">
                  ⚠ Bonne réponse illisible — cette question ne peut pas être corrigée.
                </p>
              )}

              {/* L'explication est marquée pour qu'on sache QUI la lit : c'est le seul endroit du
                  diagnostic qui enseigne quelque chose, et la laisser passer sans l'avoir vue,
                  ce serait relire la moitié de ce qu'on valide. */}
              {q.explanation_markdown && (
                <p className="mt-3 rounded-lg border-l-2 border-papa-accent-2/40 bg-papa-accent-2/10 px-3 py-2 text-[13px] text-papa-muted">
                  <span className="font-semibold text-papa-accent-2">
                    Ce que Massimo lira après coup —
                  </span>{" "}
                  {q.explanation_markdown}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export interface QuestionnaireRelectureProps {
  /** `null` = pas encore chargé. Le composant ne charge rien lui-même. */
  relecture: DiagnosticRelecture | null;
}

/** Le questionnaire complet, groupes REPLIÉS à l'arrivée.
 *
 *  Les huit noms de notions sont déjà un premier niveau de relecture : un hors-sujet, un doublon,
 *  une notion étrangère au chapitre se repèrent sans ouvrir une seule question. */
export function QuestionnaireRelecture({ relecture }: QuestionnaireRelectureProps) {
  if (relecture === null) {
    return <p className="mt-4 text-sm text-papa-muted">Chargement du questionnaire…</p>;
  }

  // 🔴 Un lot vide se DIT. Il ne se rend pas comme une liste vide, qui se lirait « pas encore
  // chargé » — et c'est sur ce cas que le panneau retire « Laisser passer ».
  if (relecture.total === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-papa-border bg-papa-surface/50 p-4">
        <p className="font-medium">Ce diagnostic ne contient aucune question.</p>
        <p className="mt-1 text-sm text-papa-muted">
          Il n'y a rien à relire, et rien à laisser passer : un lot vide mesurerait zéro notion.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-papa-border pt-4">
      <p className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">
          {relecture.total} question{relecture.total > 1 ? "s" : ""}
        </span>
        <span className="text-[12.5px] text-papa-muted">· {libelleVolume(relecture)}</span>
      </p>

      <ul className="flex list-none flex-col gap-2">
        {relecture.notions.map((notion, i) => (
          <GroupeNotion key={notion.skill_id ?? `sans-notion-${i}`} notion={notion} />
        ))}
      </ul>
    </div>
  );
}
