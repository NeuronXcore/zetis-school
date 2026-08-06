import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, SubjectPictogram } from "@zetis/ui";
import type { ProgressionSubject } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { SubjectDetailRow } from "../components/progression/SubjectDetailRow";
import { VueNotion } from "../components/progression/VueNotion";
import { VuePeriode } from "../components/progression/VuePeriode";
import { useConsolidatedSkills } from "../hooks/useConsolidatedSkills";
import { useProgression } from "../hooks/useProgression";
import { useSkillsIndex } from "../hooks/useSkillsIndex";

// ⚠️ TROIS GRAINS, UN SEUL ÉCRAN (adr-0040 §1) : la matière, la notion, le fait daté. La table
// matière n'est PAS remplacée — elle est mesurée, elle est la cible d'un constat du dashboard
// (`?subject=`), et son dépliage garde ce que les autres vues ne portent pas (XP par motif, état
// du référentiel).
//
// ⚠️ La fenêtre temporelle n'existe QUE dans la vue période (§2). Les deux autres sont des stocks
// « à aujourd'hui », sans sélecteur — leur en donner un serait le mensonge que l'ADR écarte.

const VUES = [
  { cle: "matiere", label: "Par matière" },
  { cle: "notion", label: "Par notion" },
  { cle: "periode", label: "Par période" },
] as const;
type Vue = (typeof VUES)[number]["cle"];

function estVue(v: string | null): v is Vue {
  return v === "matiere" || v === "notion" || v === "periode";
}

// Progression Papa — l'avancement du programme, matière par matière (ADR-0038).
//
// Cette page rendait un MOCK jusqu'au 2026-08-05 : un pourcentage, un XP et un compte de lacunes
// qui ne venaient d'aucune mesure. Elle est pourtant la cible d'un constat cliquable du dashboard
// (« N notions consolidées »), qui se dit adossé à une trace comptée.
//
// 🔴 **La barre mesure l'AVANCEMENT, pas l'acquisition.** Numérateur = notions engagées
// (consolidées ∪ fragiles ∪ en cours), dénominateur = notions au programme. Les acquis ont leur
// PROPRE colonne et ne se fondent jamais dans la barre : il y a 1 notion consolidée sur 280 en
// base réelle, une barre bâtie sur les acquis afficherait zéro pour sept matières sur huit.
//
// ⚠️ **Aucun pourcentage à l'écran, volontairement.** « 10 / 96 » se lit « on en a abordé 10 sur
// 96 » ; « 10 % » se lit « il ne sait que 10 % ». Le signal d'erreur n°1 de l'ADR est justement que
// Papa lise la barre comme un taux d'acquisition — le format des nombres est ce qui l'en empêche.
//
// ⚠️ **Aucune période, aucune tendance, aucune action** (ADR-0038 §6). Agir se fait depuis
// « Où agir », les missions ou le Conseil ; l'historique vit dans « Évolution de la mémoire ».

function AdvancementCell({ subject }: { subject: ProgressionSubject }) {
  // Deux absences qui se ressemblent et ne veulent PAS dire la même chose (ADR-0038, spec) :
  // pas de référentiel = il n'y a rien à travailler, il faut générer le programme ; référentiel
  // vide = les chapitres existent mais aucune notion n'y est rattachée. Les confondre enverrait
  // Papa générer un programme qu'il a déjà.
  if (!subject.has_referentiel) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-papa-muted">
        référentiel non généré
        <Link to="/programme" className="font-semibold text-papa-accent underline">
          Ouvrir le programme →
        </Link>
      </span>
    );
  }

  if (subject.notions.total === 0) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-papa-muted">
        aucune notion rattachée
        <Link to="/programme" className="font-semibold text-papa-accent underline">
          Ouvrir le programme →
        </Link>
      </span>
    );
  }

  const ratio = Math.min(1, subject.engaged / subject.notions.total);
  return (
    <span className="flex items-center gap-3">
      <span
        className="h-2 w-32 shrink-0 overflow-hidden rounded-full bg-papa-surface-2"
        role="presentation"
      >
        <span
          className="block h-full rounded-full bg-papa-accent"
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="whitespace-nowrap tabular-nums">
        {subject.engaged} / {subject.notions.total}
      </span>
    </span>
  );
}

export function ProgressionPage() {
  const p = useProgression();
  const [params, setParams] = useSearchParams();

  // ⚠️ `?view=` est un état d'AFFICHAGE : `replace: true`, comme la mise en avant. Sans lui,
  // « Retour » rejouerait chaque bascule d'onglet (§Navigation).
  const vue: Vue = estVue(params.get("view")) ? (params.get("view") as Vue) : "matiere";
  const setVue = (v: Vue) => {
    const next = new URLSearchParams(params);
    if (v === "matiere") next.delete("view");
    else next.set("view", v);
    setParams(next, { replace: true });
  };

  // L'index des notions alimente les vues notion ET période. Un seul appel, au montage — filtres,
  // tri et bascule de vue ne coûtent aucune requête.
  const idx = useSkillsIndex();

  // ⚠️ Le constat « Français : 1 notion consolidée » pointe ici avec `?subject=francais`. On MET
  // EN ÉVIDENCE sa ligne, on ne filtre PAS : comparer les matières est la raison d'être de cette
  // page, et une preuve qui vide l'écran autour d'elle enlève ce qu'on venait chercher. Un slug
  // inconnu ne surligne rien plutôt que de vider la table — même règle que `visibleSubjects`.
  const requested = params.get("subject");
  const highlighted = p.subjects.find((s) => s.slug === requested) ?? null;

  // ⚠️ UN SEUL dépliage à la fois (addendum ADR-0038 §1) : deux matières ouvertes feraient défiler
  // la table hors de l'écran, alors que le dépliage existe pour RAPPROCHER le détail de son nombre.
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // La matière visée par un constat s'ouvre d'office : venir d'une preuve et devoir cliquer encore
  // pour la voir serait un pas de trop sur le chemin que ce chantier existe pour raccourcir.
  useEffect(() => {
    if (highlighted) setOpenSlug(highlighted.slug);
  }, [highlighted?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Les notions acquises ne sont demandées qu'au PREMIER dépliage, une fois pour toute la page.
  const acquises = useConsolidatedSkills(openSlug !== null);

  const clearHighlight = () => {
    const next = new URLSearchParams(params);
    next.delete("subject");
    // `replace` : la mise en avant est un état d'affichage, pas une étape de navigation. Sans lui,
    // « Retour » ramènerait Papa sur la même page surlignée, indéfiniment.
    setParams(next, { replace: true });
  };

  // `max-w-6xl` sur les TROIS vues : faire varier la largeur du shell selon l'onglet ferait
  // sauter la page à chaque bascule (§1).
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Progression"
        subtitle="Où en est Massimo — et qu'est-ce qui a bougé."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {VUES.map((v) => (
          <button
            key={v.cle}
            type="button"
            aria-pressed={vue === v.cle}
            onClick={() => setVue(v.cle)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              vue === v.cle
                ? "border-papa-accent bg-papa-accent/10 text-papa-accent"
                : "border-papa-border text-papa-muted hover:border-papa-accent"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vue === "matiere" && (
      <p className="mb-4 text-sm text-papa-muted">
        La barre compte les notions <strong className="font-semibold">abordées</strong> sur les
        notions au programme — pas ce qui est acquis. Les acquis ont leur propre colonne.
        {p.schoolYear && (
          <span className="whitespace-nowrap">
            {" "}
            Année {p.schoolYear.label} · {p.schoolYear.level}.
          </span>
        )}
      </p>
      )}

      {highlighted && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-papa-accent/30 bg-papa-accent/5 px-4 py-2.5 text-sm text-papa-accent">
          {/* La phrase est UN SEUL enfant flex : sans ce span, `gap-2` insérait un blanc entre le
              nom de la matière et son point final — « Français . ». Invisible en test, flagrant à
              l'écran. */}
          <span>
            Depuis le constat sur <strong className="font-semibold">{highlighted.name}</strong>.
          </span>
          <button
            type="button"
            onClick={clearHighlight}
            className="rounded-lg border border-papa-accent/40 px-2 py-0.5 text-xs font-semibold hover:border-papa-accent"
          >
            Tout voir
          </button>
        </p>
      )}

      {p.error && (
        <div className="mb-4 rounded-xl border border-papa-warn/30 bg-papa-warn/5 p-4">
          <p className="text-sm text-papa-warn">{p.error}</p>
          <button
            type="button"
            onClick={p.reload}
            className="mt-2.5 rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
          >
            Réessayer
          </button>
        </div>
      )}

      {vue === "matiere" ? (
      p.loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-xl bg-papa-surface motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : p.subjects.length === 0 ? (
        // ⚠️ Sur ERREUR, on ne rend rien ici : le bandeau au-dessus a déjà dit ce qui s'est passé.
        // Un tableau vide avec ses en-têtes se lirait « aucune matière », et un état vide dirait
        // « crée une année scolaire » — deux mensonges pour un simple backend éteint.
        p.error ? null : (
          <EmptyState
            title="Aucune matière dans l'année active"
            description="Crée une année scolaire et ses matières pour que la progression ait quelque chose à mesurer."
            action={
              <Link
                to="/annees"
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
              >
                Années scolaires →
              </Link>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-papa-border">
          <table className="w-full text-sm">
            <thead className="bg-papa-surface-2 text-left text-xs uppercase tracking-wide text-papa-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  Matière
                </th>
                <th scope="col" className="px-4 py-2">
                  Avancement
                </th>
                {/* Deux colonnes distinctes, jamais un total : « abordé » et « acquis » sont deux
                    questions, et aucune n'est un raffinement de l'autre. */}
                <th scope="col" className="px-4 py-2 text-right">
                  Acquis
                </th>
                <th scope="col" className="px-4 py-2 text-right">
                  XP
                </th>
                {/* ⚠️ Les notions FRAGILES, pas les lacunes ouvertes : c'est ce que compte le
                    constat du dashboard qui pointe ici (« N notions à renforcer »). Les deux
                    populations diffèrent — 8 fragiles pour 1 lacune ouverte en Français. */}
                <th scope="col" className="px-4 py-2 text-right">
                  À renforcer
                </th>
              </tr>
            </thead>
            <tbody>
              {p.subjects.map((s) => (
                <Fragment key={s.slug}>
                <tr
                  aria-current={highlighted?.slug === s.slug ? "true" : undefined}
                  className={
                    highlighted?.slug === s.slug
                      ? "border-t border-papa-accent/40 bg-papa-accent/10"
                      : "border-t border-papa-border bg-papa-surface"
                  }
                >
                  <td className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      aria-expanded={openSlug === s.slug}
                      onClick={() => setOpenSlug(openSlug === s.slug ? null : s.slug)}
                      className="flex items-center gap-2 text-left hover:text-papa-accent"
                    >
                      <span
                        aria-hidden
                        className={`text-xs text-papa-muted transition-transform ${openSlug === s.slug ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                      <SubjectPictogram slug={s.slug} name={s.name} size="sm" />
                      {s.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <AdvancementCell subject={s} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.notions.consolidated}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.xp}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {/* Aucune teinte rouge au-delà de l'ambre : ce sont des notions à travailler,
                        pas des fautes (CLAUDE.md §pédagogie). */}
                    <span className={s.notions.fragile > 0 ? "text-papa-warn" : "text-papa-muted"}>
                      {s.notions.fragile}
                    </span>
                  </td>
                </tr>
                {openSlug === s.slug && (
                  <tr className="border-t border-papa-border bg-papa-surface-2/40">
                    <td colSpan={5} className="p-0">
                      <SubjectDetailRow
                        subject={s}
                        consolidated={acquises.skills.filter((n) => n.subject_slug === s.slug)}
                        consolidatedLoading={acquises.loading}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )
      ) : idx.error ? (
        <div className="rounded-xl border border-papa-warn/30 bg-papa-warn/5 p-4">
          <p className="text-sm text-papa-warn">{idx.error}</p>
          <button
            type="button"
            onClick={idx.reload}
            className="mt-2.5 rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
          >
            Réessayer
          </button>
        </div>
      ) : idx.loading || !idx.index ? (
        // Squelette, jamais un spinner nu (§États).
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-xl bg-papa-surface motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : vue === "notion" ? (
        <VueNotion
          index={idx.index}
          subjectSlug={requested}
          timelines={idx.timelines}
          timelineLoading={idx.timelineLoading}
          onOpenTimeline={idx.loadTimeline}
          onVoirPeriode={() => setVue("periode")}
        />
      ) : (
        <VuePeriode index={idx.index} subjectId={highlighted?.subject_id ?? null} />
      )}
    </div>
  );
}
