// Page Papa « Couverture de production » (ADR-0023 ; addenda ADR-0011 §E fraîcheur / §F provenance).
//
// L'union des cinq pilotages par type : où en est le stock de contenu de Massimo ? Ce qui existe,
// ce qui attend une relecture, ce qui a décroché de son cours, ce qui reste à produire.
//
// Trois règles qui expliquent ce qu'on NE trouve pas ici :
// - LECTURE D'ABORD — rien n'est généré sans un clic explicite, et rien automatiquement, jamais ;
// - AUCUN AGRÉGAT DE PROVENANCE (§F.2) — pas de « N validés en lot », pas de filtre « jamais
//   relu », pas d'alerte : un compteur qui reproche à Papa une tâche qu'il a choisi de ne pas
//   faire n'est pas un outil de pilotage ;
// - AUCUN TRI, AUCUN SCORE PAR MATIÈRE, AUCUN GRAPHE — une matrice à cases vides invite déjà
//   assez à tout remplir ; l'envie de compléter n'est pas un critère pédagogique.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ConfirmDialog,
  GenerationProgress,
  SubjectFilterChips,
  type SubjectFilterOption,
  useEstimatedProgress,
} from "@zetis/ui";
import { type CoverageCellKey, type CoverageLesson } from "@zetis/types";
import { CouvertureIcon } from "../components/CouvertureIcon";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { CoverageFootnotes, CoverageLegend } from "../components/couverture/CoverageLegend";
import { CoverageMatrix, lessonRequestsOf } from "../components/couverture/CoverageMatrix";
import { ChapterProductionModal } from "../components/couverture/ChapterProductionModal";
import { useChapterProduction } from "../hooks/useChapterProduction";
import { OrphansPanel } from "../components/couverture/OrphansPanel";
import { NotionsPopover } from "../components/couverture/NotionsPopover";
import { RequestedPopover } from "../components/couverture/RequestedPopover";
import { StalePopover } from "../components/couverture/StalePopover";
import { useCoverage } from "../hooks/useCoverage";
import {
  type AnomalyKey,
  type CoverageFilter,
  filterCoverage,
  filterCounts,
  subjectAnomalies,
} from "../lib/coverageFilters";
import { GENERATION_LABEL, GENERATION_MS } from "../lib/production";

const FILTERS: { key: CoverageFilter; label: string; tone?: "warn" | "alert" }[] = [
  { key: "all", label: "Tout" },
  { key: "no_lesson", label: "🔒 Non validées" },
  { key: "no_course", label: "📝 Sans cours" },
  { key: "ready", label: "🟢 Prêtes, incomplètes" },
  { key: "pending", label: "⏳ À relire", tone: "warn" },
  { key: "stale", label: "⚠ Périmés", tone: "alert" },
];

/** Repli si la matière n'est pas dans la couverture courante — jamais lu en pratique, mais une
 *  matrice sans compteurs vaut mieux qu'un plantage. */
const EMPTY_ANOMALIES: Record<AnomalyKey, number> = {
  no_lesson: 0,
  no_course: 0,
  pending: 0,
  stale: 0,
};

export function CouverturePage() {
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [filter, setFilter] = useState<CoverageFilter>("all");
  const [search, setSearch] = useState("");
  const [stale, setStale] = useState<{
    key: CoverageCellKey;
    lesson: CoverageLesson;
    href: string | null;
  } | null>(null);
  // Confirmation avant validation en lot : l'action est réversible leçon par leçon, mais elle
  // écrit une provenance « validé en lot » que rien n'efface — autant l'annoncer.
  const [toValidate, setToValidate] = useState<{ chapterId: number; count: number } | null>(null);
  const [notions, setNotions] = useState<{
    column: "cards" | "capsules";
    lesson: CoverageLesson;
    subjectId: number;
    chapterId: number;
  } | null>(null);
  const [requested, setRequested] = useState<CoverageLesson | null>(null);

  const {
    coverage,
    orphans,
    requestsBySkill,
    setRequestStatus,
    loading,
    error,
    generating,
    generatingSkillId,
    generate,
    regenerate,
    generateCards,
    validatingChapterId,
    validateChapterLessons,
    reload,
  } = useCoverage(subjectId);
  // Production en lot (ADR-0031) : patron preview → confirm. La matrice se relit à la fin du lot
  // — sans ça, Papa verrait ses trous inchangés alors que le contenu vient d'arriver.
  const production = useChapterProduction(() => void reload());
  const pct = useEstimatedProgress(generating !== null, generating ? GENERATION_MS[generating.key] : 30000);

  const counts = useMemo(() => filterCounts(coverage), [coverage]);
  const toggleFilter = (key: CoverageFilter) =>
    setFilter((current) => (current === key ? "all" : key));

  // La requête filtrée par matière restreint AUSSI la liste des matières renvoyée
  // (`coverage.subjects` ne contient plus que la sélectionnée). On mémorise donc celle du
  // chargement non filtré : sans ça, les pastilles s'effondreraient à une seule au premier clic
  // et il faudrait repasser par « Toutes » pour changer de matière.
  const [allSubjects, setAllSubjects] = useState<SubjectFilterOption[]>([]);
  useEffect(() => {
    if (subjectId === null && coverage) {
      setAllSubjects(coverage.subjects.map(({ id, name, slug }) => ({ id, name, slug })));
    }
  }, [coverage, subjectId]);

  // Dépliage des matières. L'état par défaut se DÉDUIT du contexte au lieu d'être stocké :
  // en vue d'ensemble (toutes matières, aucun filtre) tout est replié — c'est ce qui fait tenir
  // les huit matières dans un écran ; dès qu'on a demandé quelque chose d'explicite (une pilule
  // d'état, une matière), tout est déplié — on ne cache jamais ce qui vient d'être demandé.
  // `openOverrides` ne retient que les matières que Papa a lui-même ouvertes ou fermées, et se
  // vide à chaque changement de contexte pour que le défaut reprenne la main.
  const [openOverrides, setOpenOverrides] = useState<Record<number, boolean>>({});
  const openByDefault = filter !== "all" || subjectId !== null;
  useEffect(() => setOpenOverrides({}), [filter, subjectId]);
  const isOpen = (id: number) => openOverrides[id] ?? openByDefault;

  // Comptes d'anomalies pris sur la couverture NON filtrée : `subjects` (plus bas) est déjà passé
  // au filtre, ses compteurs ne diraient plus l'état réel de la matière.
  const anomalies = useMemo(
    () => new Map((coverage?.subjects ?? []).map((s) => [s.id, subjectAnomalies(s)])),
    [coverage],
  );
  const subjects = useMemo(
    () => (coverage ? filterCoverage(coverage.subjects, filter, search) : []),
    [coverage, filter, search],
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="Couverture de production" />
        <div className="space-y-3" aria-busy="true" aria-label="Chargement de la matrice">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl bg-papa-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !coverage) {
    return (
      <div>
        <PageHeader title="Couverture de production" />
        <p className="rounded-xl border border-red-400/40 bg-papa-surface px-4 py-6 text-sm text-red-300">
          {error}
        </p>
      </div>
    );
  }

  if (!coverage?.school_year) {
    return (
      <div>
        <PageHeader title="Couverture de production" />
        <p className="rounded-xl border border-papa-border bg-papa-surface px-4 py-8 text-center text-sm text-papa-muted">
          Aucune année scolaire active. Crée-en une dans « Années scolaires » pour voir la
          couverture.
        </p>
      </div>
    );
  }

  const { totals, school_year: year } = coverage;

  return (
    <div>
      <PageHeader
        title="Couverture de production"
        icon={<CouvertureIcon size="header" breathing />}
        subtitle="Ce qui existe, ce qui attend ta relecture, ce qui a décroché de son cours. Une ligne = une leçon. Rien n'est généré depuis cette page sans un clic explicite."
        actions={
          <span className="rounded-lg border border-papa-border bg-papa-surface px-3 py-2 text-sm">
            Année {year.label} · {year.level}
          </span>
        }
      />

      {/* Chaque KPI ouvre son COMPLÉMENT, pas ce qu'il compte : depuis « 27 cours rédigés sur
          78 », ce qui se pilote ce sont les 51 restants — la matrice filtrée sur les leçons
          validées qui attendent leur cours. Un chiffre atteint ne se travaille pas.
          Un second clic revient à « Tout » : une carte qui ne sait qu'allumer un filtre
          oblige à aller le rechercher ailleurs pour l'éteindre. */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Leçons validées"
          value={String(totals.lessons_validated)}
          mode="filter"
          expanded={filter === "no_lesson"}
          actionLabel={`Voir · ${counts.no_lesson} non validées →`}
          onClick={() => toggleFilter("no_lesson")}
        />
        <KpiCard
          label="Cours rédigés"
          value={`${totals.courses_written} / ${totals.lessons}`}
          hint="le cours est la condition des dérivés"
          mode="filter"
          expanded={filter === "no_course"}
          actionLabel={`Voir · ${counts.no_course} sans cours →`}
          onClick={() => toggleFilter("no_course")}
        />
        <KpiCard
          label="Dérivés produits"
          value={`${totals.derivatives_percent} %`}
          hint="quiz · fiche · mindmap — le cours n'y est pas compté"
          mode="filter"
          expanded={filter === "ready"}
          actionLabel={`Voir · ${counts.ready} incomplètes →`}
          onClick={() => toggleFilter("ready")}
        />
        <KpiCard
          label="Périmés"
          value={String(totals.stale_count)}
          hint="servis dans une version obsolète"
          mode="filter"
          expanded={filter === "stale"}
          actionLabel={`Voir · ${counts.stale} périmés →`}
          onClick={() => toggleFilter("stale")}
        />
      </div>

      {/* Bandeaux d'anomalie AU-DESSUS de la matrice : un objet produit qui dort est une
          information plus actionnable qu'une case vide. Masqués si leur compteur est nul. */}
      {(totals.pending_count > 0 || totals.orphan_count > 0) && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {totals.pending_count > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/5 px-4 py-3">
              <span className="text-xl">⏳</span>
              <div className="flex-1 text-[12.5px] leading-snug">
                <b className="text-amber-300">
                  {totals.pending_count} objet{totals.pending_count > 1 ? "s" : ""} produit
                  {totals.pending_count > 1 ? "s" : ""} n'atteignent pas Massimo
                </b>{" "}
                — ils attendent seulement d'être relus.
              </div>
              <button
                type="button"
                disabled
                title="File de relecture — chantier distinct, non livré"
                className="cursor-not-allowed rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-muted opacity-45"
              >
                File de relecture
              </button>
            </div>
          )}
          {totals.orphan_count > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-red-400/40 bg-red-500/5 px-4 py-3">
              <span className="text-xl">🧩</span>
              <div className="flex-1 text-[12.5px] leading-snug">
                <b className="text-red-300">
                  {totals.orphan_count} dérivé{totals.orphan_count > 1 ? "s" : ""} orphelin
                  {totals.orphan_count > 1 ? "s" : ""}
                </b>{" "}
                — leur leçon a été archivée.
              </div>
              <a
                href="#orphelins"
                className="rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
              >
                Voir
              </a>
            </div>
          )}
        </div>
      )}

      {/* Choix de la matière AU-DESSUS des pilules d'état : on choisit d'abord de quoi on parle,
          ensuite dans quel état. Pastilles à pictogramme plutôt qu'un menu déroulant — les huit
          matières tiennent sur une ligne, et un pictogramme se retrouve d'un coup d'œil là où un
          libellé replié dans un `select` demandait de l'ouvrir pour savoir ce qu'il contenait. */}
      <SubjectFilterChips
        subjects={allSubjects}
        value={subjectId}
        onChange={setSubjectId}
        allLabel="Toutes les matières"
        className="mb-3"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((entry) => {
          const active = filter === entry.key;
          const activeTone =
            entry.tone === "warn"
              ? "border-amber-400 bg-amber-500/20 text-amber-200"
              : entry.tone === "alert"
                ? "border-red-400 bg-red-500/20 text-red-200"
                : "border-papa-accent bg-papa-accent/20 text-papa-accent";
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                active
                  ? `${activeTone} font-semibold`
                  : "border-papa-border bg-papa-surface text-papa-muted hover:text-papa-text"
              }`}
            >
              {entry.label} ({counts[entry.key]})
            </button>
          );
        })}
        <div className="flex-1" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="🔎 Leçon…"
          aria-label="Rechercher une leçon"
          className="min-w-[170px] rounded-lg border border-papa-border bg-papa-surface px-3 py-1.5 text-sm"
        />
      </div>

      {generating && (
        <div className="mb-4">
          <GenerationProgress value={pct} label={GENERATION_LABEL[generating.key]} />
        </div>
      )}
      {error && coverage && (
        <p className="mb-4 rounded-lg border border-red-400/40 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <CoverageLegend />

      {subjects.map((subject) => (
        <CoverageMatrix
          key={subject.id}
          subject={subject}
          anomalies={anomalies.get(subject.id) ?? EMPTY_ANOMALIES}
          open={isOpen(subject.id)}
          onToggle={() =>
            setOpenOverrides((current) => ({ ...current, [subject.id]: !isOpen(subject.id) }))
          }
          busyCell={generating}
          onGenerate={(key, lessonId) => void generate(key, lessonId)}
          onStale={(key, lesson, href) => setStale({ key, lesson, href })}
          onNotions={(column, lesson, chapterId) =>
            setNotions({ column, lesson, subjectId: subject.id, chapterId })
          }
          onRequested={(lesson) => setRequested(lesson)}
          requestsBySkill={requestsBySkill}
          onValidateChapter={(chapterId, count) => setToValidate({ chapterId, count })}
          validatingChapterId={validatingChapterId}
          onCompleteChapter={(chapterId) => production.open(chapterId)}
        />
      ))}

      <ChapterProductionModal prod={production} />
      <OrphansPanel orphans={orphans} />
      <CoverageFootnotes />

      <ConfirmDialog
        open={toValidate !== null}
        // `important` : cadre doré pulsé + bouton ambré. Une validation en lot engage plus
        // qu'un clic ordinaire — elle doit se voir comme telle, pas se fondre dans la page.
        tone="important"
        title="Valider les leçons du chapitre"
        confirmLabel={`Valider les ${toValidate?.count ?? 0} leçons`}
        onConfirm={() => {
          const target = toValidate;
          setToValidate(null);
          if (target) void validateChapterLessons(target.chapterId);
        }}
        onCancel={() => setToValidate(null)}
      >
        {/* Trois faits séparés plutôt qu'un pavé : le compte, ce que ça NE fait pas, et la
            trace que ça laisse. Un texte dense en gris atténué ne se lit pas — et une
            confirmation qu'on ne lit pas ne confirme rien. */}
        <p className="text-base text-foreground">
          <b className="text-2xl font-bold text-amber-300">{toValidate?.count ?? 0}</b> leçon
          {(toValidate?.count ?? 0) > 1 ? "s" : ""} en brouillon passeront en{" "}
          <b className="text-foreground">validée</b>.
        </p>

        <ul className="mt-4 flex flex-col gap-2.5">
          <li className="flex gap-2.5 rounded-lg border border-border bg-background/60 px-3 py-2">
            <span aria-hidden>🔓</span>
            <span className="text-foreground">
              <b>Rien n'est généré.</b> Leurs dérivés deviennent seulement{" "}
              <i>possibles</i> — cours, quiz et fiches restent à produire.
            </span>
          </li>
          <li className="flex gap-2.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2">
            <span aria-hidden>🏷️</span>
            <span className="text-foreground">
              <b className="text-amber-300">Provenance « validé en lot ».</b> La trace, honnête,
              que tu ne les as pas ouvertes une à une. Elle restera visible dans la colonne
              Cours.
            </span>
          </li>
        </ul>

        <p className="mt-3 text-xs">
          Réversible leçon par leçon depuis Programme.
        </p>
      </ConfirmDialog>

      {notions && (
        <NotionsPopover
          column={notions.column}
          lessonTitle={notions.lesson.title}
          items={notions.lesson.notions.items}
          subjectId={notions.subjectId}
          chapterId={notions.chapterId}
          busySkillId={generatingSkillId}
          onGenerateCards={(skillId) => void generateCards(skillId)}
          onClose={() => setNotions(null)}
        />
      )}

      {requested && (
        <RequestedPopover
          lessonTitle={requested.title}
          requests={lessonRequestsOf(requested, requestsBySkill)}
          onSetStatus={(id, status) => {
            void setRequestStatus(id, status);
            // Referme quand la dernière demande de la leçon vient d'être triée.
            if (lessonRequestsOf(requested, requestsBySkill).length <= 1) setRequested(null);
          }}
          onClose={() => setRequested(null)}
        />
      )}

      {stale && (
        <StalePopover
          cellKey={stale.key}
          lesson={stale.lesson}
          href={stale.href}
          onRegenerate={() => {
            const target = stale;
            setStale(null);
            // `object_id` = le dérivé lui-même. Une cellule `stale` en porte toujours un ;
            // le repli sur la leçon ne sert que la colonne Cours.
            const objectId = target.lesson.cells[target.key].object_id ?? target.lesson.id;
            void regenerate(target.key, objectId);
          }}
          onInspect={(route) => {
            setStale(null);
            navigate(route);
          }}
          onClose={() => setStale(null)}
        />
      )}
    </div>
  );
}
