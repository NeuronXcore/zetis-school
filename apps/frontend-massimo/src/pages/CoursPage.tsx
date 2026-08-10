import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  type StudentCours,
  type StudentLessonContent,
  type StudentLessonRef,
  type StudentQuiz,
} from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { SubjectBackLink } from "../components/SubjectBackLink";
import { fetchStudentCours, fetchStudentLessonCours } from "../lib/cours";
import { resolveFocusLesson } from "../lib/coursFocus";
import { fetchSubjectQuizzes } from "../lib/quiz";
import { type QuizSessionState } from "./QuizSessionPage";

// Page Cours (élève) — /subjects/:slug/cours (spec docs/frontend-massimo/page-cours.md).
// Chapitres validés → leçons validées → lecture du cours. Le serveur ne sert QUE du
// validé : aucun badge d'atelier ici, Massimo voit des cours, pas la co-construction.

const CARD = "rounded-2xl border border-zetis-border bg-zetis-surface p-5";

// Styles markdown manuels (mêmes sélecteurs que la modale Papa, tokens Massimo).
const MARKDOWN_STYLES =
  "leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-zetis-surface-2 [&_code]:px-1";

export function CoursPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  // Lien profond depuis l'agenda (addendum ADR-0025 §15) : `?lesson=` ou, en repli, `?chapter=`.
  // L'URL n'est PAS nettoyée après coup, contrairement à `/quiz` et `/eli5` — ces deux-là
  // DÉCLENCHENT une action (ouvrir un deck, lancer une session) et doivent éviter de la rejouer
  // au rechargement. Ici le paramètre ne fait que désigner : le garder rend la page partageable
  // et le rechargement idempotent.
  const [params] = useSearchParams();
  const urlLessonId = Number(params.get("lesson")) || null;
  const focusChapterId = Number(params.get("chapter")) || null;
  // `?title=` — rattrapage des échéances sans `lesson_id` (§15.6). La règle vit dans un module
  // pur : elle se teste sans rendre la page, et elle est bornée là plutôt qu'ici.
  const focusTitle = params.get("title");
  const leconVisee = useRef<HTMLLIElement | null>(null);
  const [cours, setCours] = useState<StudentCours | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reading, setReading] = useState<StudentLessonContent | null>(null);
  const [readingLoading, setReadingLoading] = useState(false);
  // Quiz jouables de la matière, indexés par leçon : un bouton n'apparaît que si un quiz existe.
  const [quizByLesson, setQuizByLesson] = useState<Record<number, StudentQuiz>>({});

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStudentCours(slug);
      setCours(data);
      // Le chapitre visé par le lien profond d'abord ; à défaut, le premier chapitre avec des
      // leçons — action immédiate.
      //
      // ⚠️ **Repli silencieux ASSUMÉ** : le serveur ne sert que du validé (ADR-0009 §9), donc une
      // leçon dévalidée après la saisie de l'échéance n'est tout simplement plus là. Massimo
      // atterrit alors sur le premier chapitre plutôt que sur une page qui l'accuserait d'un lien
      // mort — un enfant n'a rien à faire d'un message d'erreur technique.
      const vise =
        (urlLessonId !== null
          ? data.chapters.find((c) => c.lessons.some((l) => l.id === urlLessonId))
          : focusChapterId !== null
            ? data.chapters.find((c) => c.id === focusChapterId)
            : undefined) ?? data.chapters.find((c) => c.lessons.length > 0);
      setExpandedId(vise?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
    // Quiz de la matière — NON bloquant (leur absence/erreur ne retarde jamais la lecture).
    try {
      const quizzes = await fetchSubjectQuizzes(slug);
      const map: Record<number, StudentQuiz> = {};
      for (const q of quizzes) if (q.lesson_id != null) map[q.lesson_id] = q;
      setQuizByLesson(map);
    } catch {
      setQuizByLesson({});
    }
  }, [slug, urlLessonId, focusChapterId]);

  useEffect(() => {
    void load();
  }, [load]);

  // La leçon encadrée : l'identifiant s'il existe, sinon le rattrapage par titre exact (§15.6).
  // Calculée APRÈS le chargement — le titre ne se résout que contre les leçons servies.
  const focusLessonId = useMemo(
    () => resolveFocusLesson(cours, { lessonId: urlLessonId, chapterId: focusChapterId, title: focusTitle }),
    [cours, urlLessonId, focusChapterId, focusTitle],
  );

  // Un cadre lumineux hors de l'écran n'éclaire rien : la matière peut porter treize chapitres.
  // Après le rendu du chapitre déplié, on amène la leçon sous les yeux — `center` et non `start`,
  // pour qu'elle arrive avec son contexte au lieu d'être collée en haut.
  useEffect(() => {
    if (!leconVisee.current) return;
    leconVisee.current.scrollIntoView({
      block: "center",
      // Le défilement animé fait partie de ce que `prefers-reduced-motion` veut éteindre.
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [cours, focusLessonId]);

  async function openLesson(lesson: StudentLessonRef) {
    setReadingLoading(true);
    setError(null);
    try {
      setReading(await fetchStudentLessonCours(lesson.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setReadingLoading(false);
    }
  }

  // Mode lecture : le cours prend toute la carte, retour clair.
  if (reading) {
    return (
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          className="mb-4 text-sm text-zetis-accent-2"
          onClick={() => setReading(null)}
        >
          ← Retour aux leçons
        </button>
        <article className={CARD}>
          <div className={MARKDOWN_STYLES}>
            <ReactMarkdown>{reading.content}</ReactMarkdown>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Seul rétrolien du dépôt qui visait déjà la bonne destination — il passe à la brique
          partagée pour que les cinq surfaces filles se ressemblent. */}
      <SubjectBackLink name={cours?.subject_name} />
      <PageHeader
        title={`📘 Cours${cours ? ` — ${cours.subject_name}` : ""}`}
        subtitle={cours ? `Niveau ${cours.level}` : undefined}
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}
      {readingLoading && <p className="mb-4 text-sm text-zetis-muted">Ouverture du cours…</p>}

      {loading ? (
        <p className="text-zetis-muted">Chargement…</p>
      ) : cours && cours.chapters.length === 0 ? (
        <div className={`${CARD} text-center`}>
          <p className="text-lg">📚 Tes cours arrivent bientôt !</p>
          <p className="mt-1 text-sm text-zetis-muted">
            Cette matière n'a pas encore de chapitre prêt.
          </p>
        </div>
      ) : cours ? (
        <div className="flex flex-col gap-3">
          {cours.chapters.map((chapter) => (
            <section key={chapter.id} className={CARD}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() =>
                  setExpandedId((current) => (current === chapter.id ? null : chapter.id))
                }
                aria-expanded={expandedId === chapter.id}
              >
                <span className="font-semibold">{chapter.name}</span>
                <span aria-hidden className="text-xs text-zetis-muted">
                  {expandedId === chapter.id ? "▲" : "▼"}
                </span>
              </button>
              {expandedId === chapter.id && (
                <ul className="mt-3 flex flex-col gap-2 border-t border-zetis-border pt-3">
                  {chapter.lessons.length === 0 && (
                    <li className="text-sm text-zetis-muted">
                      Les leçons de ce chapitre arrivent bientôt.
                    </li>
                  )}
                  {chapter.lessons.map((lesson) => (
                    <li
                      key={lesson.id}
                      ref={lesson.id === focusLessonId ? leconVisee : undefined}
                      // La leçon venue de l'agenda porte un CADRE LUMINEUX, et elle n'est pas
                      // ouverte d'office : elle n'a pas toujours de contenu (`has_content`), et
                      // une modale qui s'ouvre sur du vide se lit comme une panne. Massimo voit
                      // où il doit aller ; il décide d'y aller.
                      //
                      // Le cadre pulse TROIS FOIS puis se repose — une pulsation perpétuelle
                      // serait un aimant à attention sur une page de lecture. Sous
                      // prefers-reduced-motion il ne bouge pas : c'est le CADRE l'information,
                      // pas le clignotement.
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg ${
                        lesson.id === focusLessonId
                          ? "bg-indigo-400/10 px-2 py-2 shadow-[0_0_0_1px_rgba(129,140,248,0.5),0_0_16px_0_rgba(99,102,241,0.28)] motion-safe:animate-[zetis-lecon-visee_1.1s_ease-in-out_3]"
                          : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">📄 {lesson.title}</p>
                        {lesson.summary && (
                          <p className="text-xs text-zetis-muted">{lesson.summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {quizByLesson[lesson.id] && (
                          <button
                            type="button"
                            className="rounded-lg border border-indigo-400/50 px-3 py-1.5 text-sm font-semibold text-indigo-200"
                            onClick={() =>
                              navigate("/quiz/session", {
                                state: {
                                  quiz: quizByLesson[lesson.id],
                                  label: `${cours?.subject_name ?? ""} · ${lesson.title}`,
                                } satisfies QuizSessionState,
                              })
                            }
                          >
                            🎯 Quiz
                          </button>
                        )}
                        {lesson.has_content ? (
                          <button
                            type="button"
                            className="rounded-lg bg-zetis-accent px-3 py-1.5 text-sm font-semibold text-white"
                            onClick={() => void openLesson(lesson)}
                            disabled={readingLoading}
                          >
                            Lire →
                          </button>
                        ) : (
                          <span className="text-xs text-zetis-muted">bientôt disponible</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
