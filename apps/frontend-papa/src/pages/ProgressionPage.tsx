import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, SubjectPictogram } from "@zetis/ui";
import type { ProgressionSubject } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { SubjectDetailRow } from "../components/progression/SubjectDetailRow";
import { palierDemande, VueNotion } from "../components/progression/VueNotion";
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

// Les SIX colonnes de la table matière sont triables (2026-08-06). La discipline est celle de la
// vue « Par notion », à l'identique — deux tables du même écran qui trieraient selon des règles
// différentes se contrediraient dès qu'on passerait de l'une à l'autre :
//
//   · l'en-tête EST le contrôle — aucun sélecteur « Trier » à côté, deux contrôles pour un même
//     état finissent toujours par diverger ;
//   · le départage est TOUJOURS (nom, subject_id), et le sens ne s'y applique JAMAIS. Inverser
//     aussi la queue rendrait l'ordre des ex æquo dépendant du sens, donc imprévisible — et les
//     ex æquo sont la règle ici (sept matières sur huit à zéro acquis) ;
//   · « Matière » suit l'ORDRE DE L'ANNÉE servi par le serveur (`sort_order`), jamais l'alphabet.
type Tri = "matiere" | "avancement" | "acquis" | "xp" | "renforcer" | "lacune";
type Sens = "asc" | "desc";

/** ⚠️ Le premier clic d'une colonne de COMPTE part en DESCENDANT : on trie sur « Acquis » pour
 *  voir les plus acquises, pas les sept zéros. Ce n'est pas une divergence avec la vue notion,
 *  c'est la MÊME règle — « le premier clic montre ce qu'on cherche » — appliquée à des nombres au
 *  lieu de booléens. La flèche affiche le sens réel : rien n'est à deviner. */
const COLONNES: { cle: Tri; label: string; aDroite?: boolean; defaut: Sens }[] = [
  { cle: "matiere", label: "Matière", defaut: "asc" },
  { cle: "avancement", label: "Avancement", defaut: "desc" },
  { cle: "acquis", label: "Acquis", aDroite: true, defaut: "desc" },
  { cle: "xp", label: "XP", aDroite: true, defaut: "desc" },
  { cle: "renforcer", label: "À renforcer", aDroite: true, defaut: "desc" },
  { cle: "lacune", label: "Lacune", aDroite: true, defaut: "desc" },
];

/** Une ligne est MESURABLE quand sa barre existe. Sans référentiel, ou avec un référentiel vide,
 *  il n'y a pas de ratio — et compter 0 dirait « pas avancée » là où la vérité est « pas
 *  mesurable ». Ces lignes restent donc EN BAS dans les DEUX sens, comme les blocs d'absence de la
 *  vue notion : ce qui sépare une absence d'une valeur ne se retourne pas avec le sens. */
function mesurable(s: ProgressionSubject): boolean {
  return s.has_referentiel && s.notions.total > 0;
}

/** 🔴 Le lien porte SA matière — sinon il retombe sur celle que la page cible ouvre par défaut, et
 *  huit lignes différentes mènent toutes à Français. C'était le cas des trois liens « Ouvrir le
 *  programme » jusqu'au 2026-08-06.
 *
 *  ⚠️ **Le paramètre `subject` ne porte pas le même type selon la destination**, et rien dans son
 *  nom ne le dit : `/programme` et `/couverture` attendent un `subject_id` NUMÉRIQUE, `/lacunes` et
 *  `/conseil` attendent un SLUG. Se tromper ne produit aucune erreur — juste une page qui ignore
 *  le paramètre et ouvre sa matière par défaut. C'est exactement le symptôme qu'on vient de
 *  corriger, et il est silencieux. */
function lienProgramme(s: Pick<ProgressionSubject, "subject_id">): string {
  return `/programme?subject=${s.subject_id}`;
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
        <Link
          to={lienProgramme(subject)}
          className="font-semibold text-papa-accent underline"
        >
          Ouvrir le programme →
        </Link>
      </span>
    );
  }

  if (subject.notions.total === 0) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-papa-muted">
        aucune notion rattachée
        <Link
          to={lienProgramme(subject)}
          className="font-semibold text-papa-accent underline"
        >
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

  // Tri par défaut = l'ordre servi, c'est-à-dire l'ordre de l'année. La page trie donc exactement
  // comme avant tant que Papa ne clique rien.
  const [tri, setTri] = useState<Tri>("matiere");
  const [sens, setSens] = useState<Sens>("asc");

  // Le rang vient de l'ORDRE SERVI (`Subject.sort_order, Subject.name`), pas d'un tri refait ici.
  // Le recalculer, fût-ce alphabétiquement, ferait diverger cette table de la vue « Par notion »
  // qui suit déjà ce même ordre.
  const rangMatiere = useMemo(() => {
    const r = new Map<number, number>();
    p.subjects.forEach((s, i) => r.set(s.subject_id, i));
    return r;
  }, [p.subjects]);

  const triees = useMemo(() => {
    const cle: Record<Tri, (s: ProgressionSubject) => number> = {
      matiere: (s) => rangMatiere.get(s.subject_id) ?? 0,
      // Le RATIO, pas le numérateur : « 10 sur 96 » est moins avancé que « 8 sur 12 », et trier
      // sur `engaged` seul mettrait la grosse matière à peine entamée devant la petite bien
      // avancée. C'est la barre qu'on trie, donc c'est ce que la barre montre.
      avancement: (s) => (mesurable(s) ? s.engaged / s.notions.total : 0),
      acquis: (s) => s.notions.consolidated,
      xp: (s) => s.xp,
      renforcer: (s) => s.notions.fragile,
      lacune: (s) => s.gaps_open,
    };
    const k = cle[tri];
    const signe = sens === "asc" ? 1 : -1;
    return [...p.subjects].sort((a, b) => {
      // Avant le sens, et pour cette colonne seulement : les lignes sans barre n'ont pas de rang.
      // Les autres colonnes n'ont pas ce problème — zéro acquis, zéro XP, zéro lacune sont des
      // valeurs vraies, pas des absences.
      if (tri === "avancement" && mesurable(a) !== mesurable(b)) return mesurable(a) ? -1 : 1;
      return (
        signe * (k(a) - k(b)) ||
        a.name.localeCompare(b.name, "fr") ||
        a.subject_id - b.subject_id
      );
    });
  }, [p.subjects, tri, sens, rangMatiere]);

  /** Un clic trie sur la colonne, dans SON sens par défaut ; un second inverse. */
  const trierPar = (t: Tri) => {
    if (tri === t) setSens((s) => (s === "asc" ? "desc" : "asc"));
    else {
      setTri(t);
      setSens(COLONNES.find((c) => c.cle === t)?.defaut ?? "asc");
    }
  };

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
        {/* 🔴 Même doctrine que l'infobulle permanente de la vue « Par notion » : sans cette
            phrase, « 8 à renforcer » et « 1 lacune » sur la même ligne se lisent comme une
            incohérence, et Papa cherche laquelle des deux se trompe. Aucune : ce sont deux
            populations, et elles n'ont aucune raison d'être égales. */}{" "}
        <strong className="font-semibold">À renforcer</strong> compte les notions au palier
        fragile ; <strong className="font-semibold">Lacune</strong> compte les lacunes ouvertes —
        deux mesures distinctes, jamais le même nombre.
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
            {/* « Acquis » et « Avancement » sont deux colonnes distinctes, jamais un total :
                « abordé » et « acquis » sont deux questions, et aucune n'est un raffinement de
                l'autre. Même chose pour les deux dernières — voir la phrase au-dessus de la
                table. */}
            <thead className="bg-papa-surface-2 text-left text-xs uppercase tracking-wide text-papa-muted">
              <tr>
                {COLONNES.map((c) => (
                  <th
                    key={c.cle}
                    scope="col"
                    // `aria-sort` porte l'état à l'assistive tech : sans lui, la flèche n'est
                    // qu'un caractère décoratif.
                    aria-sort={tri === c.cle ? (sens === "asc" ? "ascending" : "descending") : "none"}
                    className={`px-4 py-2 ${c.aDroite ? "text-right" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => trierPar(c.cle)}
                      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-papa-accent ${
                        tri === c.cle ? "text-papa-accent" : ""
                      }`}
                    >
                      {c.label}
                      <span aria-hidden className={tri === c.cle ? "" : "opacity-25"}>
                        {tri === c.cle && sens === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {triees.map((s) => (
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
                  {/* 🔴 Le nombre MÈNE quelque part (ADR-0039) : `/lacunes` est la maison de ces
                      lacunes, et c'est la MÊME attribution par `Gap.subject_id` des deux côtés —
                      le compte ne peut donc pas se contredire d'un écran à l'autre. Zéro ne
                      s'attache à rien : un lien vers une liste vide serait le cul-de-sac que ce
                      chantier existe pour supprimer. */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.gaps_open === 0 ? (
                      <span className="text-papa-muted">0</span>
                    ) : (
                      <Link
                        to={`/lacunes?subject=${s.slug}`}
                        className="font-semibold text-papa-warn underline"
                      >
                        {s.gaps_open}
                      </Link>
                    )}
                  </td>
                </tr>
                {openSlug === s.slug && (
                  <tr className="border-t border-papa-border bg-papa-surface-2/40">
                    <td colSpan={6} className="p-0">
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
          palierInitial={palierDemande(params.get("palier"))}
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
