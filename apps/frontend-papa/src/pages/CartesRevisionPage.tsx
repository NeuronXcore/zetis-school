import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { type SrsNotion } from "@zetis/types";
import { Button, ConfirmDialog, EmptyState, Spinner } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { SubjectSection } from "../components/srs-cards/SubjectSection";
import { useSrsCards } from "../hooks/useSrsCards";

// Page Papa « Cartes de révision » (ADR-0013) : état des cartes SRS de Massimo par notion,
// génération depuis les cours validés (par matière), aperçu recto/verso, réconciliation des
// suspendues. Aucune logique métier ici (cf. useSrsCards). Elle CONSOMME les leçons validées,
// ne les édite jamais (corriger un cours = page Programme).

interface DeleteTarget {
  subjectId: number;
  notion: SrsNotion;
}

export function CartesRevisionPage() {
  const cards = useSrsCards();
  const [confirm, setConfirm] = useState<DeleteTarget | null>(null);

  // Lien profond depuis la Couverture : ?focus=<skill_id>. On DÉPLIE l'aperçu de la notion
  // visée — arriver sur la bonne ligne sans voir les cartes obligerait à cliquer encore.
  const [params] = useSearchParams();
  const focusSubjectId = Number(params.get("subject")) || null;
  const focusSkillId = Number(params.get("focus")) || null;
  const openedRef = useRef<number | null>(null);
  const { overview, togglePreview, previewOpen, expanded, toggleSubject } = cards;
  useEffect(() => {
    if (focusSkillId === null || !overview) return;
    if (openedRef.current === focusSkillId) return; // une seule ouverture : replier doit replier
    // DÉPLIER LA MATIÈRE D'ABORD : les sections sont repliées par défaut, la ligne visée
    // n'existerait même pas dans le DOM — ni aperçu, ni défilement, rien à voir.
    if (focusSubjectId !== null && !expanded.has(focusSubjectId)) toggleSubject(focusSubjectId);
    openedRef.current = focusSkillId;
    if (!previewOpen.has(focusSkillId)) togglePreview(focusSkillId);
  }, [
    focusSkillId,
    focusSubjectId,
    overview,
    togglePreview,
    previewOpen,
    expanded,
    toggleSubject,
  ]);

  const totals = cards.overview?.totals;
  const subjects = cards.overview?.subjects ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Cartes de révision"
        subtitle="Génère les cartes SRS de Massimo depuis les cours validés. Rien n'est envoyé à l'élève sans cours validé."
      />

      {cards.error && (
        <p className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">
          {cards.error}{" "}
          <button type="button" onClick={cards.reload} className="underline">
            Réessayer
          </button>
        </p>
      )}

      {cards.loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Chargement…
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title="Aucune leçon validée"
          description="Commence par valider des cours dans Programme : les cartes se génèrent depuis les cours validés."
          action={
            <Link to="/programme">
              <Button size="sm">Aller au Programme</Button>
            </Link>
          }
        />
      ) : (
        <>
          {totals && (
            <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <span>
                <strong className="text-foreground">{totals.covered}</strong>{" "}
                <span className="text-muted-foreground">notions couvertes</span>
              </span>
              <span>
                <strong className="text-primary">{totals.active}</strong>{" "}
                <span className="text-muted-foreground">cartes actives</span>
              </span>
              <span>
                <strong className="text-amber-300">{totals.to_generate}</strong>{" "}
                <span className="text-muted-foreground">à générer</span>
              </span>
              <span>
                <strong className="text-foreground">{totals.suspended}</strong>{" "}
                <span className="text-muted-foreground">suspendues</span>
              </span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {subjects.map((subject) => (
              <SubjectSection
                key={subject.subject_id}
                subject={subject}
                expanded={cards.expanded.has(subject.subject_id)}
                tree={cards.trees[subject.subject_id]}
                treeLoading={cards.treeLoading.has(subject.subject_id)}
                busySubject={cards.busySubject.has(subject.subject_id)}
                isBusySkill={(id) => cards.busySkill.has(id)}
                isPreviewOpen={(id) => cards.previewOpen.has(id)}
                focusSkillId={focusSkillId}
                previewCards={(id) => cards.previews[id]}
                onToggle={() => cards.toggleSubject(subject.subject_id)}
                onGenerateSubject={() => void cards.generateSubject(subject.subject_id)}
                onGenerateSkill={(id) => void cards.generateSkill(subject.subject_id, id)}
                onTogglePreview={(id) => cards.togglePreview(id)}
                onReactivate={(id) => void cards.reactivate(subject.subject_id, id)}
                onRemove={(notion) => setConfirm({ subjectId: subject.subject_id, notion })}
                onEditCard={(skillId, cardId, body) => cards.editCard(skillId, cardId, body)}
                onDeleteCard={(skillId, cardId) =>
                  cards.removeCard(subject.subject_id, skillId, cardId)
                }
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        tone="danger"
        title="Retirer les cartes de cette notion ?"
        confirmLabel="Retirer"
        busy={confirm !== null && cards.busySkill.has(confirm.notion.skill_id)}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          await cards.remove(confirm.subjectId, confirm.notion.skill_id);
          setConfirm(null);
        }}
      >
        {confirm && (
          <>
            Supprime les cartes de « <strong>{confirm.notion.name}</strong> » <strong>ET</strong> leur
            historique de révision. Action irréversible.
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
