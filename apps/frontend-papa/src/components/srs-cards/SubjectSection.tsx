import {
  type SrsCardContent,
  type SrsCardUpdate,
  type SrsNotion,
  type SrsOverviewSubject,
  type SrsSubjectTree,
} from "@zetis/types";
import { Button, Spinner } from "@zetis/ui";
import { subjectGenerateLabel } from "../../hooks/useSrsCards";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { NotionRow } from "./NotionRow";

// Section « matière » (présentation pure) : accordéon + bouton « Générer les N » (visible
// seulement si des notions sont à générer) + arbre chapitre → leçon → notion + suspendues.

export interface SubjectSectionProps {
  subject: SrsOverviewSubject;
  expanded: boolean;
  tree?: SrsSubjectTree;
  treeLoading: boolean;
  busySubject: boolean;
  isBusySkill: (skillId: number) => boolean;
  isPreviewOpen: (skillId: number) => boolean;
  /** Notion ciblée par un lien profond. */
  focusSkillId?: number | null;
  previewCards: (skillId: number) => SrsCardContent[] | undefined;
  onToggle: () => void;
  onGenerateSubject: () => void;
  onGenerateSkill: (skillId: number) => void;
  onTogglePreview: (skillId: number) => void;
  onReactivate: (skillId: number) => void;
  onRemove: (notion: SrsNotion) => void;
  onEditCard: (skillId: number, cardId: number, body: SrsCardUpdate) => Promise<void>;
  onDeleteCard: (skillId: number, cardId: number) => Promise<void>;
}

export function SubjectSection(props: SubjectSectionProps) {
  const { subject, expanded, tree, treeLoading, busySubject } = props;
  const genLabel = subjectGenerateLabel(subject.to_generate);
  // Rien « à générer » mais des cartes existent → bouton secondaire « ↻ Régénérer » : relance
  // la réconciliation de la matière (réécrit le contenu, planification de Massimo préservée —
  // non destructif). Utile après avoir édité un cours, et déclenche la barre % ci-dessous.
  const canRegenerate = subject.to_generate === 0 && subject.active_cards > 0;
  // Barre de progression estimée pendant la génération par matière (même pattern que
  // Programme/Capsules : le backend LLM ne renvoie pas d'avancement). Durée cible ≈ nombre
  // de notions à générer × ~8 s (moteur local), plancher 20 s.
  const genPct = useEstimatedProgress(busySubject, Math.max(20000, subject.to_generate * 8000));

  const notionRow = (notion: SrsNotion) => (
    <NotionRow
      key={notion.skill_id}
      notion={notion}
      focused={notion.skill_id === props.focusSkillId}
      busy={props.isBusySkill(notion.skill_id)}
      previewOpen={props.isPreviewOpen(notion.skill_id)}
      previewCards={props.previewCards(notion.skill_id)}
      onGenerate={() => props.onGenerateSkill(notion.skill_id)}
      onTogglePreview={() => props.onTogglePreview(notion.skill_id)}
      onReactivate={() => props.onReactivate(notion.skill_id)}
      onRemove={() => props.onRemove(notion)}
      onEditCard={(cardId, body) => props.onEditCard(notion.skill_id, cardId, body)}
      onDeleteCard={(cardId) => props.onDeleteCard(notion.skill_id, cardId)}
    />
  );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Bouton de toggle et bouton « Générer les N » = frères (HTML valide : pas de bouton
          imbriqué) → générer ne toggle jamais l'accordéon, sans stopPropagation fragile. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={props.onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span aria-hidden className="text-xs text-muted-foreground">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="font-semibold text-foreground">{subject.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {subject.active_cards} carte{subject.active_cards > 1 ? "s" : ""}
            {subject.to_generate > 0 && ` · ${subject.to_generate} à générer`}
            {subject.suspended > 0 && ` · ${subject.suspended} suspendue${subject.suspended > 1 ? "s" : ""}`}
          </span>
        </button>
        {genLabel ? (
          <Button size="sm" onClick={props.onGenerateSubject} disabled={busySubject}>
            {busySubject ? "Génération…" : `${genLabel} ▶`}
          </Button>
        ) : canRegenerate ? (
          <Button variant="ghost" size="sm" onClick={props.onGenerateSubject} disabled={busySubject}>
            {busySubject ? "Génération…" : "↻ Régénérer"}
          </Button>
        ) : null}
      </div>

      {busySubject && (
        <div className="px-4 pb-3">
          <ProgressBar
            pct={genPct}
            label={`ZETIS génère les cartes de « ${subject.name} » (moteur local)…`}
          />
        </div>
      )}

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          {treeLoading && !tree ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Chargement…
            </div>
          ) : tree ? (
            <div className="flex flex-col gap-4">
              {tree.chapters.map((chapter) => (
                <div key={chapter.chapter_id}>
                  <p className="text-sm font-semibold text-foreground">{chapter.name}</p>
                  {chapter.lessons.map((lesson) => (
                    <div key={lesson.lesson_id} className="mt-2">
                      <p className="text-xs text-muted-foreground">📄 {lesson.title} — cours validé</p>
                      <ul className="mt-1.5 flex flex-col gap-1.5">
                        {lesson.notions.map(notionRow)}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
              {tree.suspended.length > 0 && (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    ⏸ Suspendues · planification conservée
                  </p>
                  <ul className="flex flex-col gap-1.5">{tree.suspended.map(notionRow)}</ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
