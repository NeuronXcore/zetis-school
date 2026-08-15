import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type QuizSubjectSummary, type StudentQuizListItem } from "@zetis/types";
import { groupBySubjectChapter } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { SubjectBackLink } from "../components/SubjectBackLink";
import { SubjectChapterShelves } from "../components/browse/SubjectChapterShelves";
import { SUBJECT_BACK_PARAM } from "../lib/notionRoutes";
import { QuizHero } from "../components/quiz/QuizHero";
import { fetchQuizById, fetchQuizIndex, fetchQuizSubjects } from "../lib/quiz";
import { subjectEmoji } from "../lib/subjectEmoji";
import { type QuizSessionState } from "./QuizSessionPage";

// Page « Quiz » de Massimo (/quiz). Deux écrans internes (maquette validée) :
//   1. grille des matières (grisée si aucun quiz) ;
//   2. quiz de la matière, **rangés par chapitre**, avec un champ de recherche (ADR-0057).
// Le lecteur (passation, feedback, résumé) vit dans QuizSessionPage. Massimo ne voit un
// quiz que s'il existe : rien de généré à la volée ici.
//
// 🔴 **La page charge un listing LÉGER** — titres, matière, chapitre, nombre de questions. Le
// quiz complet ne se charge qu'AU CLIC (`fetchQuizById`), comme le fait déjà le menu de notion.
// Mesuré le 2026-08-14 : 7,6 ko pour les 37 quiz de toutes les matières, contre 27,7 ko pour les
// 17 du seul Français quand les questions voyageaient avec.

function lessonFromTitle(title: string): string {
  return title.replace(/^Quiz\s*[—-]\s*/, "");
}

export function QuizPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedRef = useRef(false); // `?subject=`
  const quizLinkRef = useRef(false); // `?quiz=` — garde SÉPARÉE, cf. l'effet plus bas
  const [subjects, setSubjects] = useState<QuizSubjectSummary[] | null>(null);
  const [index, setIndex] = useState<StudentQuizListItem[]>([]);
  const [selected, setSelected] = useState<QuizSubjectSummary | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [subjectList, quizIndex] = await Promise.all([
          fetchQuizSubjects(),
          fetchQuizIndex(),
        ]);
        setSubjects(subjectList);
        setIndex(quizIndex);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openSubject = useCallback((subject: QuizSubjectSummary) => {
    setSelected(subject);
    setSearch(""); // un filtre ne survit pas au changement de portée (ADR-0057 §8, règle 3)
  }, []);

  // Lien profond `?subject=slug` → ouvre directement les quiz de la matière (patron de
  // `/revision?subject=` et `/eli5?subject=`). Sans lui, la page matière ne pouvait envoyer
  // Massimo que sur la grille de TOUTES les matières — depuis sa page de maths, une petite
  // trahison. On retire le paramètre en `replace` : le retour ne relance pas l'ouverture.
  useEffect(() => {
    if (!subjects || deepLinkedRef.current) return;
    const slug = searchParams.get("subject");
    if (!slug) return;
    const subject = subjects.find((s) => s.slug === slug);
    deepLinkedRef.current = true;
    // Matière inconnue ou sans quiz : on reste sur la grille, sans message d'échec — ce n'est
    // pas la faute de Massimo, et la grille répond déjà à « où y a-t-il des quiz ? ».
    if (subject) openSubject(subject);
    const next = new URLSearchParams(searchParams);
    next.delete("subject");
    setSearchParams(next, { replace: true });
  }, [subjects, searchParams, setSearchParams, openSubject]);

  // 🔴 Le quiz complet se charge AU CLIC, jamais avant. Repli identique à celui du menu de
  // notion : si le quiz a disparu entre l'affichage et le clic, on ne montre pas d'échec.
  const launch = async (item: StudentQuizListItem) => {
    if (launching) return;
    setLaunching(true);
    try {
      const quiz = await fetchQuizById(item.quiz_id);
      const state: QuizSessionState = {
        quiz,
        label: `${item.subject} · ${lessonFromTitle(item.title)}`,
      };
      navigate("/quiz/session", { state });
    } catch {
      setIndex((list) => list.filter((q) => q.quiz_id !== item.quiz_id));
    } finally {
      setLaunching(false);
    }
  };

  // Lien profond `?quiz=<id>` — **L'ADRESSE d'un quiz**, qui n'en avait aucune (ADR-0059 §A1).
  //
  // `/quiz/session` attend le quiz COMPLET dans `location.state` : il n'est donc adressable
  // par personne — ni par le chat, dont l'exécuteur ne sait que `navigate(route)`, ni par un
  // signet. Cette page, elle, sait charger un quiz par id (`launch` le fait déjà au clic) : le
  // lien profond n'invente rien, il emprunte ce chemin.
  //
  // ⚠️ **Garde de consommation DISTINCTE de celle de `?subject=`.** Partager `deepLinkedRef`
  // ferait que le premier lien consommé condamnerait l'autre — une URL portant les deux
  // (`?subject=maths&quiz=9`, ce qu'un rétrolien produira tôt ou tard) n'en honorerait qu'un.
  //
  // ⚠️ `replace: true` sur la navigation : sans lui, revenir depuis la session relancerait le
  // quiz — l'entrée d'historique porterait encore `?quiz=`. C'est ce que fait déjà `launch`
  // côté `/revision?subject=`.
  useEffect(() => {
    if (quizLinkRef.current) return;
    const brut = searchParams.get("quiz");
    if (!brut) return;
    const quizId = Number(brut);
    quizLinkRef.current = true;
    // On nettoie l'URL AVANT de tenter l'ouverture : que le quiz existe ou non, le paramètre a
    // été consommé, et il ne doit pas survivre à un retour arrière.
    const next = new URLSearchParams(searchParams);
    next.delete("quiz");
    setSearchParams(next, { replace: true });
    if (!Number.isFinite(quizId) || quizId <= 0) return;
    void (async () => {
      try {
        const quiz = await fetchQuizById(quizId);
        const item = index.find((q) => q.quiz_id === quizId);
        // Le libellé vient du listing léger s'il est là ; sinon du quiz lui-même. Un en-tête
        // approximatif vaut mieux qu'une page qui refuse de s'ouvrir.
        const label = item
          ? `${item.subject} · ${lessonFromTitle(item.title)}`
          : lessonFromTitle(quiz.title ?? "Quiz");
        const from = searchParams.get(SUBJECT_BACK_PARAM);
        const state: QuizSessionState = {
          quiz,
          label,
          ...(from ? { returnTo: `/subjects/${encodeURIComponent(from)}` } : {}),
        };
        navigate("/quiz/session", { state, replace: true });
      } catch {
        // Quiz disparu, archivé, ou id inventé : **on reste sur la grille, en silence**. Pas
        // d'écran d'erreur — le dépôt l'a déjà arbitré trois fois (`?carte=`, `?subject=`,
        // `launch`) : « ce n'est pas la faute de Massimo », et la grille répond déjà à la
        // question « où y a-t-il des quiz ? ».
      }
    })();
  }, [index, searchParams, setSearchParams, navigate]);

  // ── Écran 2 : quiz de la matière, par chapitre ────────────────────────────
  if (selected) {
    // ⚠️ **La recherche porte sur TOUTE la page, toutes matières confondues** — règle des
    // capsules, arbitrée le 2026-08-14 : chercher sans savoir la matière est ce que fait un
    // enfant. Un résultat d'une autre matière apparaît sous SON étagère, et le clic **emmène**
    // Massimo dessus (il lance le quiz) — jamais un résultat qui s'affiche sans y mener.
    const searching = search.trim().length > 0;
    const source = searching ? index : index.filter((q) => q.subject_slug === selected.slug);
    const groups = groupBySubjectChapter(source, search);

    return (
      <div className="mx-auto max-w-xl">
        {/* Rétrolien vers la MATIÈRE quand on arrive de sa page (`?from=`). Sans lui, Massimo
            atterrissait sur ses quiz sans pouvoir revenir d'où il venait. Il ne se rend pas
            s'il n'y a pas de `from` — une arrivée par la sidebar n'invente pas de retour. */}
        <SubjectBackLink
          name={subjects?.find((s) => s.slug === searchParams.get(SUBJECT_BACK_PARAM))?.name}
        />
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setSearch("");
          }}
          className="mb-4 text-sm text-cyan-300 hover:underline"
        >
          ← Toutes les matières
        </button>
        {/* 🔴 Trouvé À L'ÉCRAN le 2026-08-14 : en cherchant « thales » depuis les quiz de
            Français, les deux quiz de Mathématiques s'affichaient **sous un titre « Français »**.
            La recherche traverse les matières (règle des capsules) — l'en-tête doit cesser de
            prétendre qu'on est encore dans une seule. Aucun test ne pouvait le dire : ils
            vérifiaient les résultats, pas ce que la page dit d'elle-même. */}
        <PageHeader
          title={
            searching ? "🔎 Résultats de recherche" : `${subjectEmoji(selected.slug)} ${selected.name}`
          }
        />

        {error && (
          <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}

        <SubjectChapterShelves
          groups={groups}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher un quiz…"
          emptyLabel={(q) =>
            q.trim()
              ? `Aucun quiz ne correspond à « ${q} ».`
              : "Aucun quiz pour cette matière."
          }
          itemKey={(q) => q.quiz_id}
          gridClassName="flex flex-col gap-2.5"
          defaultOpen
          renderItem={(q) => (
            <button
              type="button"
              onClick={() => void launch(q)}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-l-4 border-white/10 border-l-fuchsia-400 bg-white/5 px-4 py-4 text-left backdrop-blur-lg transition hover:-translate-y-0.5 hover:border-indigo-400/70"
            >
              <span className="text-2xl">📝</span>
              <span className="min-w-0">
                <span className="block font-bold">{lessonFromTitle(q.title)}</span>
                <span className="text-xs text-zetis-muted">
                  {q.questions_count} question{q.questions_count > 1 ? "s" : ""} · quiz du cours
                </span>
              </span>
              <span className="ml-auto text-lg text-indigo-400">▶</span>
            </button>
          )}
        />
      </div>
    );
  }

  // ── Écran 1 : grille des matières ─────────────────────────────────────────
  return (
    <div className="mx-auto max-w-xl">
      <QuizHero />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}
      {loading && <p className="text-zetis-muted">Chargement…</p>}
      {subjects && subjects.length === 0 && (
        <p className="text-sm italic text-zetis-muted">
          Tes quiz arrivent bientôt — quand un cours aura son quiz, il apparaîtra ici.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {subjects?.map((s) => {
          const off = s.quiz_count === 0;
          return (
            <button
              key={s.subject_id}
              type="button"
              disabled={off}
              onClick={() => openSubject(s)}
              className={`rounded-2xl border bg-white/5 px-3 py-4 text-center backdrop-blur-lg transition ${off ? "cursor-default border-white/10 opacity-40 grayscale" : "border-indigo-400/40 hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(99,102,241,0.25)]"}`}
            >
              <span className="mb-2 block text-3xl">{subjectEmoji(s.slug)}</span>
              <span className="block text-[13px] font-bold">{s.name}</span>
              <span
                className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${off ? "bg-white/10 text-zetis-muted" : "bg-indigo-500/20 text-indigo-200"}`}
              >
                {off ? "bientôt" : `${s.quiz_count} quiz`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
