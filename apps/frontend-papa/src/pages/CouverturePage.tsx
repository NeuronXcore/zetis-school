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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ConfirmDialog,
  GenerationProgress,
  SubjectFilterChips,
  type SubjectFilterOption,
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
  parseCoverageFilter,
  parseMissing,
  subjectAnomalies,
} from "../lib/coverageFilters";
import { fetchSubjects } from "../lib/subjects";
import { GENERATION_LABEL } from "../lib/production";
import { useProgressionEstimee } from "../hooks/useEstimations";

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

/** La cellule de la matrice → le `job_type` dont elle lit la durée (ADR-0041 §9).
 *
 *  ⚠️ Ce n'est PAS une table de durées, c'est une table de NOMS : les durées vivent côté serveur,
 *  où elles sont mesurées. `GENERATION_MS` portait ici la cinquième valeur du cours. */
const CELLULE_VERS_TYPE: Record<CoverageCellKey, string> = {
  cours: "lesson_content",
  fiche: "fiche_generate",
  quiz: "quiz_generate",
  mindmap: "mindmap_generate",
};

export function CouverturePage() {
  const navigate = useNavigate();
  // Matière, pilule d'état et colonne manquante vivent dans l'URL (adr-0039 §9) : sans ça, aucun
  // lien du Dashboard ne peut ouvrir la matrice sur ce qu'il annonce. La recherche, elle, reste
  // locale — c'est une frappe en cours, pas une destination qu'on partage.
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectId = Number(searchParams.get("subject")) || null;
  const filter = parseCoverageFilter(searchParams.get("filter"));
  const missing = parseMissing(searchParams.get("manque"));
  const [search, setSearch] = useState("");

  /** Écriture d'URL en forme FONCTIONNELLE, et clé par clé.
   *
   *  ⚠️ Deux clés posées dans le même tick depuis une fermeture sur `searchParams` s'écrasent
   *  l'une l'autre — piège documenté par l'addendum ADR-0028 §3. Et reconstruire l'URL à partir
   *  de rien effacerait `?chapitre=`, qui vient de la pastille d'en-tête.
   *
   *  `replace` : choisir un filtre n'est pas naviguer. Sans lui, revenir en arrière depuis la
   *  Couverture rejouerait chaque clic de pilule au lieu de ramener Papa au Dashboard. */
  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [clef, valeur] of Object.entries(patch)) {
            if (valeur === null) next.delete(clef);
            else next.set(clef, valeur);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setSubjectId = useCallback(
    (id: number | null) => patchParams({ subject: id === null ? null : String(id) }),
    [patchParams],
  );
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
    skippedNotice,
    reload,
  } = useCoverage(subjectId);
  // Production en lot (ADR-0031) : patron preview → confirm. La matrice se relit à la fin du lot
  // — sans ça, Papa verrait ses trous inchangés alors que le contenu vient d'arriver.
  const production = useChapterProduction(() => void reload());
  // Chapitre mis en évidence, arrivé par la pastille d'en-tête « ZETIS produit un chapitre ».
  // Sans lui, le clic ouvrait la Couverture entière et laissait Papa chercher lequel travaille.
  const highlightChapterId = Number(searchParams.get("chapitre")) || null;
  // La Couverture lance les quatre producteurs migrés : la durée vient de leur `job_type`, plus
  // d'une table locale. `GENERATION_MS` portait ici la cinquième valeur du cours (§9).
  const pct = useProgressionEstimee(
    generating !== null,
    generating ? CELLULE_VERS_TYPE[generating.key] : "",
  );

  const counts = useMemo(() => filterCounts(coverage), [coverage]);
  // Second clic = « Tout », écrit comme une ABSENCE de clé (`null`) et non comme `"all"` : ainsi
  // `parseCoverageFilter` reste la source unique de la valeur courante, et l'URL ne traîne pas un
  // paramètre qui ne filtre rien. Changer de pilule relâche aussi `?manque=`, qui appartient au
  // lien d'où on vient et non à la pilule qu'on choisit.
  const toggleFilter = (key: CoverageFilter) =>
    patchParams({ filter: filter === key ? null : key, manque: null });

  // La requête filtrée par matière restreint AUSSI la liste des matières renvoyée
  // (`coverage.subjects` ne contient plus que la sélectionnée). Les pastilles ont donc leur propre
  // source, indépendante de la couverture courante.
  //
  // 🔴 **Elles se lisaient auparavant sur le premier chargement NON filtré** — ce qui marchait
  // tant que la page s'ouvrait toujours sur « Toutes ». Depuis qu'un lien peut arriver avec
  // `?subject=3` (adr-0039), ce chargement-là n'a jamais lieu : `allSubjects` restait vide **pour
  // toujours**, les pastilles disparaissaient, et Papa n'avait plus aucun moyen de revenir à
  // « Toutes » sans éditer l'URL à la main. D'où une lecture propre, au montage, une seule fois.
  const [allSubjects, setAllSubjects] = useState<SubjectFilterOption[]>([]);
  useEffect(() => {
    let annule = false;
    void fetchSubjects()
      .then((rows) => {
        if (!annule) setAllSubjects(rows.map(({ id, name, slug }) => ({ id, name, slug })));
      })
      .catch(() => {
        // Silencieux et volontairement : une liste de pastilles absente dégrade la page, elle ne
        // la casse pas — la matrice, elle, a déjà son propre message d'erreur.
      });
    return () => {
      annule = true;
    };
  }, []);

  // Dépliage des matières. L'état par défaut se DÉDUIT du contexte au lieu d'être stocké :
  // en vue d'ensemble (toutes matières, aucun filtre) tout est replié — c'est ce qui fait tenir
  // les huit matières dans un écran ; dès qu'on a demandé quelque chose d'explicite (une pilule
  // d'état, une matière), tout est déplié — on ne cache jamais ce qui vient d'être demandé.
  // `openOverrides` ne retient que les matières que Papa a lui-même ouvertes ou fermées, et se
  // vide à chaque changement de contexte pour que le défaut reprenne la main.
  const [openOverrides, setOpenOverrides] = useState<Record<number, boolean>>({});
  const openByDefault = filter !== "all" || subjectId !== null;
  useEffect(() => setOpenOverrides({}), [filter, subjectId]);
  // La matière qui CONTIENT le chapitre mis en évidence s'ouvre d'office. Sans ça, le clic sur
  // « Voir le chapitre » depuis la pastille arrivait sur une Couverture repliée : le surlignage
  // existait, caché dans une matière fermée — donc invisible, donc inutile.
  const highlightedSubjectId = useMemo(() => {
    if (highlightChapterId === null) return null;
    for (const subject of coverage?.subjects ?? []) {
      if (subject.chapters.some((c) => c.id === highlightChapterId)) return subject.id;
    }
    return null;
  }, [coverage, highlightChapterId]);

  const isOpen = (id: number) =>
    openOverrides[id] ?? (id === highlightedSubjectId ? true : openByDefault);

  // Comptes d'anomalies pris sur la couverture NON filtrée : `subjects` (plus bas) est déjà passé
  // au filtre, ses compteurs ne diraient plus l'état réel de la matière.
  const anomalies = useMemo(
    () => new Map((coverage?.subjects ?? []).map((s) => [s.id, subjectAnomalies(s)])),
    [coverage],
  );
  const subjects = useMemo(
    () => (coverage ? filterCoverage(coverage.subjects, filter, search, missing) : []),
    [coverage, filter, search, missing],
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
              {/* ⚠️ Le bouton ne PORTE PAS le compteur du bandeau, et c'est délibéré :
                  `pending_count` compte les dérivés `pending` de CETTE matrice (§F), la file en
                  couvre cinq familles dont deux absentes d'ici (capsules, chapitres). Écrire
                  « Relire les 12 » enverrait vers une page qui en montre 33. Le bandeau garde son
                  chiffre, qui est vrai chez lui ; le bouton n'en promet aucun. */}
              <Link
                to="/relecture"
                className="rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
              >
                File de relecture
              </Link>
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
              onClick={() => patchParams({ filter: entry.key, manque: null })}
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
      {/* Ce que le dernier lot a SAUTÉ. ⚠️ **Ton neutre, pas rouge** : le geste a réussi pour le
          reste, ce n'est pas un échec — c'est un constat. Sans lui, Papa cliquerait « valider les
          leçons », verrait la ligne inchangée, et n'aurait aucun moyen de savoir pourquoi ; un
          manque silencieux se lit comme une panne. */}
      {skippedNotice && (
        <p className="mb-4 rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-sm text-papa-muted">
          {skippedNotice}
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
          highlightChapterId={highlightChapterId}
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
