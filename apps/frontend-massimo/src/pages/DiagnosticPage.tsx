import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CarteRaconteMoi } from "../components/CarteRaconteMoi";
import { PageHeader } from "../components/PageHeader";
import { useObservationPassation } from "../hooks/useObservationPassation";
import { useDiagnostics, type GroupeMatiere, type Raison } from "../hooks/useDiagnostics";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";
import {
  type DiagnosticListItem,
  type DiagnosticQuiz,
  type DiagnosticResult,
  fetchDiagnosticQuiz,
  fetchMonResultat,
  submitDiagnostic,
} from "../lib/diagnostic";

// Page Diagnostic Massimo — refonte ADR-0044 : elle PROPOSE au lieu de lister.
//
// Le défaut d'origine, nommé par la relecture humaine du 2026-08-08 : « une liste infinie de
// diagnostics sans savoir ce qu'il doit faire ou pas ». La page ne répond plus « voici les 15
// diagnostics » mais « commence par là, et voici pourquoi ».

/** ~45 s par question, arrondi. Déterministe et dérivé, comme `estimated_minutes` des missions. */
function minutes(questions: number): number {
  return Math.max(2, Math.round(questions * 0.75));
}

/** « 12 juillet », « 1er juillet » — sur ce qui est FAIT seulement. Sur le à-faire, la
 *  formulation reste qualitative : un décompte de jours est interdit (`CLAUDE.md` §gamification).
 *
 *  ⚠️ Le « 1er » est à la main : `toLocaleDateString("fr-FR")` rend « 1 juillet », faute de
 *  français. Défaut vu À L'ÉCRAN le 2026-08-08 — aucun test ne l'aurait signalé, et c'est
 *  exactement le genre de chose pour laquelle la relecture visuelle existe. */
function leJour(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const jour = d.getDate();
  const mois = d.toLocaleDateString("fr-FR", { month: "long" });
  return `${jour === 1 ? "1er" : jour} ${mois}`;
}

function IconeMatiere({ slug, taille }: { slug: string; taille: "hero" | "ligne" }) {
  const src = subjectIconFor(slug);
  const cls = taille === "hero" ? "h-14 w-14" : "h-10 w-10";
  // Icône de marque, repli emoji — jamais de mapping local (« ne pas hardcoder les matières »).
  return src ? (
    <img src={src} alt="" aria-hidden className={`${cls} flex-none rounded-[22%] object-cover`} />
  ) : (
    <span className={`${cls} flex flex-none items-center justify-center text-2xl`} aria-hidden>
      {subjectEmoji(slug)}
    </span>
  );
}

/** L'encart de la carte — et il CHANGE DE REGISTRE selon qui a choisi.
 *
 *  🔴 Quand ZETIS propose, la phrase dit **pourquoi il recommande celui-là**. Quand Massimo a
 *  choisi lui-même, elle se réduit au **fait brut** : servir la phrase de recommandation sur un
 *  diagnostic qu'il a pris de sa propre initiative ferait revendiquer à ZETIS un conseil qu'il
 *  n'a pas donné. L'information reste utile, la recommandation n'est pas usurpée.
 */
function PhraseRaison({ raison, estUnChoix }: { raison: Raison; estUnChoix: boolean }) {
  const texte = estUnChoix
    ? raison === "jamais"
      ? "ZETIS ne l'a encore jamais mesuré."
      : "Dernière mesure : il y a un moment."
    : raison === "jamais"
      ? "ZETIS ne t'a encore jamais posé de questions dans cette matière. C'est celle où il en apprendra le plus sur toi."
      : "La dernière mesure de ZETIS commence à dater. Un petit tour et il saura où tu en es maintenant.";

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-zetis-border bg-zetis-surface-2 p-3 text-sm">
      <span aria-hidden>💡</span>
      <span>{texte}</span>
    </div>
  );
}

export function DiagnosticPage() {
  const {
    tete,
    raison,
    estUnChoix,
    choisir,
    revenirALaProposition,
    groupes,
    faits,
    chargement,
    erreur,
    toutAJour,
    rienEncore,
    recharger,
  } = useDiagnostics();
  const [quiz, setQuiz] = useState<DiagnosticQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [depliee, setDepliee] = useState<string | null>(null);
  // Observation de la passation (ADR-0048). Elle ne rend RIEN à l'écran — voir le hook.
  const observation = useObservationPassation();
  const zoneB = useRef<HTMLDivElement | null>(null);
  const carte = useRef<HTMLElement | null>(null);

  async function startQuiz(quizId: number) {
    // 🔴 EN TÊTE, ET AVANT TOUT `await`. Le plein écran exige le contexte de geste utilisateur, que
    // le premier `await` fait perdre : demandé après le chargement du quiz, il serait refusé en
    // silence. C'est aussi ici que démarre le chronométrage de la passation.
    observation.demarrer();
    setBusy(true);
    setErreurAction(null);
    try {
      const q = await fetchDiagnosticQuiz(quizId);
      setQuiz(q);
      setAnswers({});
      setResult(null);
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  /** Promeut le diagnostic dans la carte, PUIS la ramène dans le champ de vision.
   *
   *  ⚠️ Le scroll n'est pas un ornement : la carte est en haut de page et Massimo vient de
   *  cliquer en bas. Sans lui, le choix change quelque chose qu'il ne voit pas — et il croirait
   *  que son clic n'a rien fait. */
  function choisirEtRemonter(quizId: number) {
    choisir(quizId);
    carte.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** Rouvre une passation passée (ADR-0044 Décision 5). Avant elle, le résultat n'était montré
   *  qu'UNE FOIS : aucune route élève ne permettait de le relire. */
  async function relire(attemptId: number) {
    setBusy(true);
    setErreurAction(null);
    try {
      setResult(await fetchMonResultat(attemptId));
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (quiz == null) return;
    setBusy(true);
    setErreurAction(null);
    try {
      const observe = observation.recolter();
      const payload = quiz.questions.map((q) => ({
        question_id: q.id,
        choice_index: answers[q.id] ?? -1,
        ...(observe?.parQuestion.get(q.id) ?? {}),
      }));
      setResult(await submitDiagnostic(quiz.quiz_id, payload, observe?.conditions));
      observation.terminer();
      setQuiz(null);
      recharger();
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  // ── 1) Résultat bienveillant ───────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="C'est noté ✨" subtitle={`Voici ce que ZETIS retient (${result.subject}).`} />
        {/* Aucune note brute (ADR-0044 Décision 5) : la spec le prescrivait depuis l'étape 14, et
            cet écran affichait « Score global : X % » juste au-dessus de la phrase qui promettait
            le contraire. Le score existe toujours — Papa le voit, Massimo non. */}
        <p className="mb-4 text-sm text-zetis-muted">
          Pas de note : juste ce qui est solide, et ce qu'on va renforcer ensemble.
        </p>
        {result.strengths.length > 0 && (
          <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
            <p className="font-semibold text-emerald-300">Tes forces</p>
            <ul className="mt-2 list-inside list-disc text-sm text-zetis-muted">
              {result.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {/* 🔴 ENTRE « Tes forces » et « Tes prochaines étapes » : après les forces parce qu'elle
            parle d'une BONNE réponse et porte le même élan ; avant les prochaines étapes parce que
            ce bloc finit par « Voir mes missions → », et que rien ne doit venir après la sortie.
            Servie à CHAQUE passation — la conditionner au verdict en ferait une accusation. */}
        {result.verbalisation && (
          <CarteRaconteMoi attemptId={result.attempt_id} verbalisation={result.verbalisation} />
        )}
        {result.gaps.length > 0 && (
          <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
            <p className="font-semibold text-zetis-accent-2">Tes prochaines étapes</p>
            <ul className="mt-2 space-y-2">
              {result.gaps.map((g) => (
                <li
                  key={`${g.skill_id}-${g.skill_name}`}
                  className="rounded-lg bg-zetis-surface-2 px-3 py-2 text-sm"
                >
                  Notion à renforcer : {g.skill_name}
                </li>
              ))}
            </ul>
            {/* La SUITE. Chaque ligne portait une « → » qui ne menait nulle part — une flèche qui
                promet un ailleurs inexistant est le cul-de-sac dont l'ADR-0039 est né.
                ⚠️ UN seul lien, pas un par ligne : `/missions` n'accepte pas de lien profond
                (contrairement à `/revision?subject=`), donc N flèches iraient toutes au même
                endroit en laissant croire que chacune mène à SA notion. Et c'est la mission qui
                referme une lacune — c'est donc là que la suite se trouve vraiment. */}
            <Link
              to="/missions"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-zetis-accent-2 hover:underline"
            >
              Voir mes missions →
            </Link>
          </section>
        )}
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-4 text-sm text-zetis-muted hover:text-zetis-text"
        >
          ← Retour aux diagnostics
        </button>
      </div>
    );
  }

  // ── 2) Passation du QCM (inchangée — hors périmètre ADR-0044) ──────────────────────────────
  if (quiz) {
    const allAnswered = quiz.questions.every((q) => answers[q.id] != null);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={quiz.title} subtitle="Réponds tranquillement, il n'y a pas de piège." />
        {erreurAction && <p className="mb-3 text-sm text-rose-400">{erreurAction}</p>}
        <div className="space-y-4">
          {quiz.questions.map((q, idx) => (
            // `data-question-id` sert UNIQUEMENT à localiser une copie d'énoncé dans le DOM —
            // c'est ce qui fait de la copie le seul signal par question qui survive à un écran
            // qui les affiche toutes. Aucun rendu n'en dépend.
            <section
              key={q.id}
              data-question-id={q.id}
              className="rounded-2xl border border-zetis-border bg-zetis-surface p-4"
            >
              <p className="text-sm font-medium">
                {idx + 1}. {q.prompt}
              </p>
              <div className="mt-3 space-y-2">
                {q.choices.map((choice, ci) => (
                  <label
                    key={ci}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      answers[q.id] === ci
                        ? "border-zetis-accent bg-zetis-accent/10"
                        : "border-zetis-border hover:bg-zetis-surface-2"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[q.id] === ci}
                      onChange={() => {
                        observation.noterReponse(q.id);
                        setAnswers((a) => ({ ...a, [q.id]: ci }));
                      }}
                      className="accent-zetis-accent"
                    />
                    {choice}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !allAnswered}
          className="mt-5 rounded-xl bg-zetis-accent px-6 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "…" : "Envoyer mes réponses"}
        </button>
        <button
          type="button"
          onClick={() => setQuiz(null)}
          className="mt-3 block text-sm text-zetis-muted hover:text-zetis-text"
        >
          ← Annuler
        </button>
      </div>
    );
  }

  // ── 3) La page — trois zones (ADR-0044 Décisions 1, 3, 4) ──────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="🧭 Diagnostic"
        subtitle="ZETIS vérifie ce qu'il faut renforcer pour t'aider plus vite."
      />
      {(erreur || erreurAction) && (
        <p className="mb-3 text-sm text-rose-400">{erreurAction ?? erreur}</p>
      )}
      {chargement && <p className="text-sm text-zetis-muted">Un instant…</p>}

      {/* ZONE A — UNE seule proposition, avec sa raison. */}
      {tete && raison && (
        <section
          ref={carte}
          className="rounded-3xl border border-zetis-border bg-zetis-surface p-6 shadow-lg shadow-zetis-accent/10"
        >
          <div className="mb-4 flex items-center gap-3">
            <IconeMatiere slug={tete.subject_slug} taille="hero" />
            <div>
              {/* Le BANDEAU DE REGISTRE : qui a choisi. La matière descend dans la ligne d'infos,
                  où elle a sa place — ici, ce qui compte est d'où vient la proposition. */}
              <p className="text-xs font-bold uppercase tracking-widest text-zetis-accent-2">
                {estUnChoix ? "Ton choix" : "ZETIS te propose"}
              </p>
              <h2 className="mt-0.5 text-lg font-extrabold leading-snug">{tete.title}</h2>
            </div>
          </div>
          <PhraseRaison raison={raison} estUnChoix={estUnChoix} />
          {/* Deux registres, deux lignes : les FAITS d'un côté, la RASSURANCE de l'autre. Sur une
              seule ligne, ça se casse en trois colonnes bancales dès 375 px — vu sur la maquette. */}
          <p className="text-sm text-zetis-muted">
            {tete.subject} · {tete.questions_count} questions · environ{" "}
            {minutes(tete.questions_count)} min
          </p>
          <p className="mb-4 text-sm text-zetis-muted">Tu peux t'arrêter quand tu veux.</p>
          <button
            type="button"
            onClick={() => startQuiz(tete.quiz_id)}
            disabled={busy}
            className="w-full rounded-2xl bg-zetis-accent px-6 py-3.5 text-base font-extrabold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            Commencer →
          </button>
          {/* La SORTIE. Sans elle, « commence par là » est un objectif imposé — et un objectif
              subi se fuit, quand un objectif qu'on s'est donné se tient (`CLAUDE.md`).
              Son symétrique — le retour — n'apparaît que si un choix a été fait : les deux
              chemins restent réversibles, et aucun n'est un aller simple. */}
          {estUnChoix ? (
            <button
              type="button"
              onClick={revenirALaProposition}
              className="mt-3 w-full py-1.5 text-sm text-zetis-muted hover:text-zetis-text"
            >
              ← Revenir à ce que ZETIS propose
            </button>
          ) : (
            groupes.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  zoneB.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                className="mt-3 w-full py-1.5 text-sm text-zetis-muted hover:text-zetis-text"
              >
                Je préfère autre chose ↓
              </button>
            )
          )}
        </section>
      )}

      {/* ZONE A bis — tout est à jour : une carte calme, jamais une page vide. */}
      {toutAJour && (
        <section className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-10 text-center">
          <p className="mb-3 text-4xl" aria-hidden>
            ✨
          </p>
          <h2 className="mb-2 text-lg font-extrabold">Tout est à jour</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-zetis-muted">
            ZETIS a une mesure récente dans chacune de tes matières. Rien ne t'attend ici — tu peux
            quand même en refaire un si tu en as envie.
          </p>
        </section>
      )}

      {/* ZONE A ter — rien encore : la formulation NOMME Papa, pas de cul-de-sac. */}
      {rienEncore && (
        <section className="rounded-3xl border border-zetis-border bg-zetis-surface p-10 text-center">
          <p className="mb-3 text-4xl" aria-hidden>
            🧭
          </p>
          <h2 className="mb-2 text-lg font-extrabold">Rien à mesurer pour l'instant</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-zetis-muted">
            Papa prépare les diagnostics depuis son espace. Dès qu'il en laisse passer un, il
            apparaît ici.
          </p>
        </section>
      )}

      {/* ZONE B — le reste, groupé par matière et REPLIÉ. Aucun plafond, aucune troncature
          (Décision 4) : structurer n'est pas masquer. */}
      {groupes.length > 0 && (
        <div ref={zoneB}>
          <h3 className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest text-zetis-muted">
            Si tu préfères autre chose
          </h3>
          {groupes.map((g: GroupeMatiere) => (
            <div key={g.slug}>
              <button
                type="button"
                aria-expanded={depliee === g.slug}
                onClick={() => setDepliee(depliee === g.slug ? null : g.slug)}
                className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-zetis-border bg-zetis-surface p-3.5 text-left transition-colors hover:bg-zetis-surface-2"
              >
                <IconeMatiere slug={g.slug} taille="ligne" />
                <span>
                  <span className="block font-bold">{g.nom}</span>
                  <span className="block text-xs text-zetis-muted">
                    {g.items.length} diagnostic{g.items.length > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="ml-auto text-zetis-muted" aria-hidden>
                  {depliee === g.slug ? "⌄" : "›"}
                </span>
              </button>
              {depliee === g.slug && (
                <div className="mb-3 space-y-2 pl-6">
                  {g.items.map((d: DiagnosticListItem) => (
                    <button
                      key={d.quiz_id}
                      type="button"
                      onClick={() => choisirEtRemonter(d.quiz_id)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-xl border border-zetis-border bg-zetis-surface-2 px-4 py-3 text-left transition-colors hover:bg-zetis-surface disabled:opacity-60"
                    >
                      <span>
                        <span className="block text-sm font-semibold">{d.title}</span>
                        <span className="block text-xs text-zetis-muted">
                          {d.questions_count} questions · environ {minutes(d.questions_count)} min
                        </span>
                      </span>
                      {/* CHOISIR, pas lancer : le diagnostic remonte dans la carte du haut, et
                          c'est de là qu'il démarre. Un seul endroit où l'action arrive — et le
                          chemin que Massimo choisit devient aussi bien traité que celui qu'on lui
                          propose, alors qu'il partait avec moins d'informations. */}
                      <span className="ml-auto whitespace-nowrap text-sm font-bold text-zetis-accent-2">
                        Choisir ↑
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ZONE C — le déjà-fait, SÉPARÉ du à-faire. C'est le défaut nommé qui se referme :
          `taken` ne changeait qu'un mot dans une liste plate. */}
      {faits.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest text-zetis-muted">
            Déjà mesuré avec toi
          </h3>
          {faits.map((d) => (
            // `flex-wrap` + `w-full` sur les boutons : sous `sm`, ils passent SOUS le texte au
            // lieu de se serrer à côté. Mesuré à l'écran sur un iPhone SE (375 px) avant
            // correction : les boutons prenaient ~171 pt et le texte ~102 pt — le texte avait
            // MOINS de place que les boutons, « août » et « juillet » tombaient seuls sur leur
            // ligne. C'est très exactement ce que la spec interdit (§ zone A : « ils se cassent
            // en trois colonnes bancales dès 375 px »), l'avertissement n'ayant été appliqué
            // qu'à la zone A. ⚠️ L'ancien `sm:flex-row` ne corrigeait rien : `sm` vaut 640 px,
            // donc AUCUN téléphone ne l'atteint — le cas étroit était traité sur le mauvais axe
            // (empiler les boutons, au lieu de les descendre).
            <div
              key={d.quiz_id}
              className="mb-2 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5"
            >
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                aria-hidden
              >
                ✓
              </span>
              {/* `min-w-0` : sans lui, un titre long refuse de rétrécir et repousse le reste. */}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{d.title}</span>
                <span className="block text-xs text-zetis-muted">
                  {d.subject} · tu l'as passé le {leJour(d.taken_at)}
                </span>
              </span>
              <span className="flex w-full flex-none gap-2 sm:ml-auto sm:w-auto">
                {d.last_attempt_id !== null && (
                  <button
                    type="button"
                    onClick={() => relire(d.last_attempt_id as number)}
                    disabled={busy}
                    className="rounded-lg border border-zetis-border bg-zetis-surface px-3 py-1.5 text-xs font-bold hover:bg-zetis-surface-2 disabled:opacity-60"
                  >
                    Ce que ZETIS a retenu
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startQuiz(d.quiz_id)}
                  disabled={busy}
                  className="rounded-lg border border-zetis-border bg-zetis-surface px-3 py-1.5 text-xs font-bold hover:bg-zetis-surface-2 disabled:opacity-60"
                >
                  Refaire ↻
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
