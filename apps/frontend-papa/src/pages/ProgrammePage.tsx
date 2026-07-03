import { useState } from "react";
import { Button, EmptyState, Spinner } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { ProgressBar, useEstimatedProgress } from "../components/ProgressBar";
import { AddChapterForm } from "../components/programme/AddChapterForm";
import { ChapterRow } from "../components/programme/ChapterRow";
import { SubjectPills } from "../components/programme/SubjectPills";
import { useCurriculum } from "../hooks/useCurriculum";

// Page Programme (Papa, Slice B — ADR-0009 §9) : éditeur du référentiel de l'année
// active. Aucune logique métier ici (cf. useCurriculum + chapterActions).

// Affichage seulement — le backend fait sa propre résolution (service curriculum).
const CYCLE_BY_LEVEL: Record<string, string> = {
  "6e": "cycle 3",
  "5e": "cycle 4",
  "4e": "cycle 4",
  "3e": "cycle 4",
};

export function ProgrammePage() {
  const data = useCurriculum();
  const [adding, setAdding] = useState(false);
  // Progression *estimée* (même pattern que les capsules) : l'appel de génération est
  // synchrone et opaque (~18-20 s mesurés), la barre monte vers 95 % puis se complète.
  const generationPct = useEstimatedProgress(data.generating, 22000);

  const cycle = data.year ? CYCLE_BY_LEVEL[data.year.level] : undefined;
  // Version déclarative du programme, portée par les chapitres générés (ADR-0009 §5).
  const programVersion = data.chapters.find((c) => c.program_version)?.program_version;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={
          data.year
            ? `Programme · ${cycle ? `${cycle} — ` : ""}${data.year.level}`
            : "Programme"
        }
        subtitle={`${programVersion ? `Version ${programVersion} · ` : ""}référentiel co-construit`}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => void data.generate()}
              disabled={data.generating || data.selectedSysId === null}
            >
              {data.generating ? (
                <>
                  <Spinner size={16} /> Génération en cours…
                </>
              ) : (
                "⚡ Générer"
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAdding(true)}
              disabled={adding || data.selectedSysId === null}
            >
              + Ajouter
            </Button>
          </div>
        }
      />

      {data.generating && (
        <div className="mb-4">
          <ProgressBar
            pct={generationPct}
            label="ZETIS génère les chapitres de la matière (10 à 30 s)… La liste reste affichée."
          />
        </div>
      )}
      {data.actionError && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
          {data.actionError}
        </p>
      )}

      {data.loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : data.error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-rose-300">{data.error}</p>
          <Button variant="outline" onClick={data.retry}>
            Réessayer
          </Button>
        </div>
      ) : data.year ? (
        <div className="flex flex-col gap-4">
          <SubjectPills
            subjects={data.year.subjects}
            selectedSysId={data.selectedSysId}
            onSelect={data.select}
          />
          {adding && (
            <AddChapterForm
              chapters={data.chapters}
              onCreate={async (chapter, position) => {
                await data.addChapter(chapter, position);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          <ChapterList data={data} adding={adding} onAdd={() => setAdding(true)} />
          <p className="text-xs text-papa-muted">
            ⓘ La régénération ne touche jamais les chapitres manuels ni validés. Chaque
            génération est tracée (cahier de bord IA).
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ChapterList({
  data,
  adding,
  onAdd,
}: {
  data: ReturnType<typeof useCurriculum>;
  adding: boolean;
  onAdd: () => void;
}) {
  if (data.chaptersLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={24} />
      </div>
    );
  }
  if (data.chapters.length === 0) {
    return (
      <EmptyState
        icon="📖"
        title="Aucun chapitre pour cette matière"
        description="Génère une proposition de programme avec ZETIS, ou ajoute un chapitre à la main."
        action={
          <div className="flex gap-2">
            <Button onClick={() => void data.generate()} disabled={data.generating}>
              ⚡ Générer
            </Button>
            <Button variant="secondary" onClick={onAdd} disabled={adding}>
              + Ajouter
            </Button>
          </div>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {data.chapters.map((chapter, i) => (
        <ChapterRow
          key={chapter.id}
          chapter={chapter}
          isFirst={i === 0}
          isLast={i === data.chapters.length - 1}
          disabled={data.generating}
          onValidate={() => void data.validate(chapter.id)}
          onReject={() => void data.reject(chapter.id)}
          onRegenerate={() => void data.generate()}
          onEdit={(patch) => data.editChapter(chapter.id, patch)}
          onDelete={() => {
            // Confirmation minimale : un chapitre validé supprimé ne se régénère pas seul.
            if (window.confirm(`Supprimer le chapitre « ${chapter.name} » ?`)) {
              void data.removeChapter(chapter.id);
            }
          }}
          onMove={(direction) => void data.move(chapter.id, direction)}
        />
      ))}
    </ul>
  );
}
