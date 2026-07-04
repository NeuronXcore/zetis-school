import { type ReactNode, useEffect, useRef } from "react";
import { SoundToggle } from "@zetis/ui";
import { ProgressRing } from "../components/ProgressRing";
import { NeonBackdrop, GlassPanel, NEON_BUTTON, NEON_TEXT } from "../components/glass";
import { type AnswerMode, type Eli5Chip, eli5SourceBadge, useEli5 } from "../hooks/useEli5";
import { speak, stopSpeaking } from "../lib/speech";
import eli5Icon from "../assets/app/ELI5.png";
import zetisAvatar from "../assets/app/zetis-avatar.png";

// Page ELI5 Massimo — refonte « la boucle » (Lot B, pur frontend).
// Conversation empilée qui grandit vers le bas : les sections s'accumulent le long
// d'un rail dégradé indigo→cyan (comprendre → reformuler). Toute la logique vit dans
// useEli5 ; ce composant est purement présentationnel.

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

// Phrase d'accueil dite par ZETIS pendant la préparation. AFFICHÉE avec « ELI5 » propre ;
// PRONONCÉE en phonétique pour que la voix Piper française sonne « anglais » (ee-el-eye-five).
// TODO(voix) : ajuster la phonétique à l'oreille (candidats A–D testés).
const ELI5_PREPARING = "Massimo, je prépare ton ELI5…";
// Phonétique retenue à l'oreille (voix Piper FR) : « i èl aïe faille-ve » ≈ "ee-el-eye-five".
const ELI5_PREPARING_SAY = "Massimo, je prépare ton i èl aïe faille-ve";

export function Eli5Page() {
  const eli5 = useEli5();
  const {
    status,
    busy,
    question,
    setQuestion,
    answer,
    setAnswer,
    explanation,
    reverse,
    currentTitle,
    chips,
    error,
    noMatch,
    requesting,
    requested,
    requestNotion,
    submitQuestion,
    submitChip,
    reExplain,
    submitAnswer,
    mode,
    setMode,
    sttAvailable,
    recording,
    transcribing,
    micAnalyser,
    micError,
    toggleDictation,
  } = eli5;

  // Auto-scroll : chaque section révélée entre dans la vue. Déclenché sur les
  // transitions d'état uniquement (jamais pendant la frappe du textarea, qui ne
  // change pas l'état). prefers-reduced-motion → saut instantané.
  const explainRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target =
      status === "generating" || status === "explained"
        ? explainRef.current
        : status === "evaluating" || status === "feedback"
          ? feedbackRef.current
          : null;
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [status]);

  const started = status !== "idle";

  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />

      <div className="relative">
        {/* En-tête : duo ELI5 ↔ ZETIS (l'explication file de l'un à l'autre) + titre.
            SoundToggle à droite = coupe la voix de ZETIS (aucun autoplay si muet). */}
        <header className="mb-6 flex flex-wrap items-center gap-4">
          <ExplainDuo />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">Comprendre avec ELI5</h1>
            <p className="mt-1 text-zetis-muted">
              ZETIS t'explique simplement, puis tu réexpliques pour vérifier.
            </p>
          </div>
          <SoundToggle className="shrink-0" />
        </header>

        {/* ── État 1 — Question (action principale unique) ── */}
        <GlassPanel className="p-5">
          <label htmlFor="eli5-question" className="mb-2 block text-sm font-medium">
            Quelle notion veux-tu comprendre&nbsp;?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="eli5-question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitQuestion();
              }}
              placeholder="Les nombres relatifs, la photosynthèse…"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-zetis-text outline-none placeholder:text-zetis-muted focus:border-zetis-accent focus:ring-2 focus:ring-zetis-accent/40"
            />
            <button
              type="button"
              onClick={submitQuestion}
              disabled={busy}
              className={NEON_BUTTON}
            >
              {status === "generating" ? "…" : "Expliquer"}
            </button>
          </div>

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <ChipButton key={chip.key} chip={chip} onClick={() => submitChip(chip)} />
              ))}
            </div>
          )}

          {/* Champ sans match : état vide bienveillant + « Dis à Papa d'ajouter ». */}
          {noMatch && (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              {requested ? (
                <p>C'est noté&nbsp;! Papa pourra l'ajouter à ton programme&nbsp;👍</p>
              ) : (
                <>
                  <p>
                    Cette notion n'est pas encore dans ton programme — choisis une suggestion
                    ci-dessus&nbsp;👆
                  </p>
                  <button
                    type="button"
                    onClick={requestNotion}
                    disabled={requesting}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 font-medium text-amber-100 transition-colors hover:bg-amber-300/20 disabled:opacity-60"
                  >
                    {requesting ? "…" : `📨 Dis à Papa d'ajouter « ${question.trim()} »`}
                  </button>
                </>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </GlassPanel>

        {/* ── La boucle : rail + phases empilées ── */}
        {started && (
          <div className="relative mt-6">
            {/* Rail dégradé indigo→cyan : grandit avec les sections révélées. */}
            <div
              aria-hidden
              className="absolute bottom-6 left-[21px] top-6 w-[2px] rounded bg-gradient-to-b from-indigo-500 to-cyan-400"
            />

            {/* Phase 1 — ZETIS explique (nœud = marque ELI5) */}
            <LoopRow
              ref={explainRef}
              node={
                <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                  <img src={eli5Icon} alt="ELI5" className="h-full w-full object-cover" />
                </span>
              }
              halo="indigo"
            >
              {status === "generating" ? (
                <ZetisWave text={ELI5_PREPARING} say={ELI5_PREPARING_SAY} />
              ) : explanation ? (
                <ExplanationCard eli5={eli5} onReExplain={reExplain} busy={busy} />
              ) : null}
            </LoopRow>

            {/* Phase 2 — À toi d'expliquer (visible dès qu'une explication existe) */}
            {explanation && (
              <LoopRow node={<span aria-hidden>🎙️</span>} halo="cyan">
                <AnswerBlock
                  title={currentTitle}
                  answer={answer}
                  setAnswer={setAnswer}
                  onSubmit={submitAnswer}
                  disabled={busy}
                  mode={mode}
                  onMode={setMode}
                  sttAvailable={sttAvailable}
                  recording={recording}
                  transcribing={transcribing}
                  micAnalyser={micAnalyser}
                  micError={micError}
                  onToggleDictation={toggleDictation}
                />
              </LoopRow>
            )}

            {/* Phase 3 — Le retour de ZETIS */}
            {(status === "evaluating" || status === "feedback") && (
              <LoopRow ref={feedbackRef} node={<span aria-hidden>✨</span>} halo="fuchsia">
                {status === "evaluating" ? (
                  <ZetisWave text="ZETIS regarde ton explication…" />
                ) : reverse ? (
                  <FeedbackCard reverse={reverse} />
                ) : null}
              </LoopRow>
            )}
          </div>
        )}
      </div>

      {/* Toast XP sticky — retour visuel. Le crédit réel est fait côté serveur. */}
      {status === "feedback" && <XpToast />}
    </div>
  );
}

// ── Sous-composants présentationnels ───────────────────────────────────────────

// Duo d'avatars de l'en-tête : ELI5 (agrandi) et ZETIS côte à côte. Des bulles filent
// d'ELI5 vers ZETIS — « comme si Massimo expliquait à ZETIS ». ELI5 flotte, ZETIS
// « écoute » (halo pulsé). Tout est motion-safe → immobile sous prefers-reduced-motion.
function ExplainDuo() {
  const reduced = prefersReducedMotion();
  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* ELI5 — agrandi, flottant */}
      <span className="relative flex h-20 w-20 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-indigo-500/30 blur-lg motion-safe:animate-pulse"
        />
        <img
          src={eli5Icon}
          alt="ELI5"
          className="relative h-20 w-20 rounded-2xl object-cover shadow-lg shadow-indigo-900/40 motion-safe:animate-[eli5-float_3.5s_ease-in-out_infinite]"
        />
      </span>

      {/* Flux d'explication ELI5 → ZETIS */}
      <span aria-hidden className="relative mx-0.5 h-6 w-12 shrink-0">
        {reduced ? (
          <span className="absolute inset-0 flex items-center justify-center text-lg leading-none text-zetis-muted">
            ···
          </span>
        ) : (
          [0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute left-0 top-2 h-2 w-2 rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300 motion-safe:animate-[eli5-talk_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.35}s` }}
            />
          ))
        )}
      </span>

      {/* ZETIS — vrai avatar (emblème circulaire), « écoute » (halo cyan pulsé) */}
      <div className="relative flex h-[72px] w-[72px] items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-cyan-400/25 blur-md motion-safe:animate-pulse"
        />
        <img
          src={zetisAvatar}
          alt="ZETIS"
          className="relative h-[72px] w-[72px] rounded-full object-cover shadow-lg shadow-cyan-900/40"
        />
      </div>
    </div>
  );
}

function ChipButton({ chip, onClick }: { chip: Eli5Chip; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zetis-text transition-colors hover:border-zetis-accent hover:bg-white/10"
    >
      <span aria-hidden>{chip.emoji}</span>
      <span className="font-medium">{chip.name}</span>
      <span className="text-xs text-zetis-muted">· {chip.note}</span>
    </button>
  );
}

const HALO: Record<"indigo" | "cyan" | "fuchsia", string> = {
  indigo: "shadow-[0_0_20px_rgba(99,102,241,0.55)] ring-indigo-400/40",
  cyan: "shadow-[0_0_20px_rgba(34,211,238,0.5)] ring-cyan-400/40",
  fuchsia: "shadow-[0_0_20px_rgba(232,121,249,0.5)] ring-fuchsia-400/40",
};

// Une ligne de la boucle : nœud (rond halo) sur le rail + contenu à droite.
const LoopRow = ({
  ref,
  node,
  halo,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>;
  node: ReactNode;
  halo: "indigo" | "cyan" | "fuchsia";
  children: ReactNode;
}) => (
  <div ref={ref} className="relative mb-6 scroll-mt-24 pl-16 last:mb-0">
    <span
      className={`absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zetis-surface text-lg ring-2 ${HALO[halo]}`}
    >
      {node}
    </span>
    {children}
  </div>
);

// Onde ZETIS : barres animées à la place de la future carte (pas de spinner plein
// écran). Immobile sous prefers-reduced-motion. ZETIS énonce la phrase à voix haute
// (voix Piper des capsules, gardée par le réglage son) — coupée si la carte remplace
// l'onde. `say` = texte prononcé quand il diffère de l'affiché (ex. « ELI5 » en
// phonétique anglaise pour une voix française).
function ZetisWave({ text, say }: { text: string; say?: string }) {
  useEffect(() => {
    void speak(say ?? text);
    return () => stopSpeaking();
  }, [text, say]);
  return (
    <GlassPanel className="flex items-center gap-3 p-5">
      <span aria-hidden className="flex items-end gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-gradient-to-t from-indigo-500 to-cyan-400 motion-safe:animate-pulse"
            style={{ height: 10 + (i % 3) * 8, animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>
      <span className="text-sm text-zetis-muted">{text}</span>
    </GlassPanel>
  );
}

function ExplanationCard({
  eli5,
  onReExplain,
  busy,
}: {
  eli5: ReturnType<typeof useEli5>;
  onReExplain: () => void;
  busy: boolean;
}) {
  const { explanation } = eli5;
  if (!explanation) return null;
  const badge = eli5SourceBadge(explanation);
  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{explanation.title}</h2>
        {badge.variant === "lesson" ? (
          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
            📚 D'après ta leçon <em>{badge.lessonTitle}</em>
          </span>
        ) : badge.variant === "course" ? (
          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
            📚 D'après ton cours
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-zetis-text">
        {explanation.simple_explanation}
      </p>

      <TintBlock tone="cyan" label="Analogie">
        {explanation.analogy}
      </TintBlock>
      <TintBlock tone="fuchsia" label="Exemple">
        {explanation.example}
      </TintBlock>
      <TintBlock tone="indigo" label="Mini-question">
        {explanation.check_question}
      </TintBlock>

      <button
        type="button"
        onClick={onReExplain}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-zetis-text transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        🔄 Je réexplique autrement
      </button>
    </GlassPanel>
  );
}

const TINT: Record<"cyan" | "fuchsia" | "indigo", string> = {
  cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  fuchsia: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200",
  indigo: "border-indigo-400/20 bg-indigo-400/10 text-indigo-200",
};

function TintBlock({
  tone,
  label,
  children,
}: {
  tone: "cyan" | "fuchsia" | "indigo";
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${TINT[tone]}`}>
      <span className="font-semibold">{label} : </span>
      <span className="text-zetis-text">{children}</span>
    </div>
  );
}

function AnswerBlock({
  title,
  answer,
  setAnswer,
  onSubmit,
  disabled,
  mode,
  onMode,
  sttAvailable,
  recording,
  transcribing,
  micAnalyser,
  micError,
  onToggleDictation,
}: {
  title: string | null;
  answer: string;
  setAnswer: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  mode: AnswerMode;
  onMode: (m: AnswerMode) => void;
  sttAvailable: boolean;
  recording: boolean;
  transcribing: boolean;
  micAnalyser: AnalyserNode | null;
  micError: string | null;
  onToggleDictation: () => void;
}) {
  // Sans dictée dispo, on force le mode clavier (le toggle est masqué).
  const speaking = sttAvailable && mode === "speak";
  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">🎙️ À toi d'expliquer</h2>
        {/* Toggle Écrire / Parler (ADR-0012). Masqué si la dictée n'est pas possible. */}
        {sttAvailable && (
          <ModeToggle mode={mode} onMode={onMode} disabled={transcribing} />
        )}
      </div>
      <p className="mt-1 text-sm text-zetis-muted">
        Explique {title ? <strong className="text-zetis-text">{title}</strong> : "cette notion"}{" "}
        avec tes mots, comme si tu l'apprenais à quelqu'un.
      </p>

      {speaking ? (
        <SpeakMode
          recording={recording}
          transcribing={transcribing}
          analyser={micAnalyser}
          onToggle={onToggleDictation}
        />
      ) : (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Écris ton explication…"
            className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zetis-text outline-none placeholder:text-zetis-muted focus:border-zetis-accent-2 focus:ring-2 focus:ring-zetis-accent-2/40"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled || transcribing || answer.trim().length === 0}
              className={NEON_BUTTON}
            >
              Envoyer à ZETIS
            </button>
            <SoonButton emoji="🗺️" label="Mindmap" />
          </div>
        </>
      )}

      {micError && (
        <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          {micError}
        </p>
      )}
    </GlassPanel>
  );
}

// Bascule segmentée Écrire / Parler.
function ModeToggle({
  mode,
  onMode,
  disabled,
}: {
  mode: AnswerMode;
  onMode: (m: AnswerMode) => void;
  disabled: boolean;
}) {
  const base = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
  const on = "bg-zetis-accent text-white shadow";
  const off = "text-zetis-muted hover:text-zetis-text";
  return (
    <div
      role="group"
      aria-label="Mode de réponse"
      className="inline-flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1"
    >
      <button
        type="button"
        aria-pressed={mode === "write"}
        disabled={disabled}
        onClick={() => onMode("write")}
        className={`${base} ${mode === "write" ? on : off}`}
      >
        ✍️ Écrire
      </button>
      <button
        type="button"
        aria-pressed={mode === "speak"}
        disabled={disabled}
        onClick={() => onMode("speak")}
        className={`${base} ${mode === "speak" ? on : off}`}
      >
        🎤 Parler
      </button>
    </div>
  );
}

// Mode vocal : onde réactive au micro pendant la capture, puis Stop → transcription.
function SpeakMode({
  recording,
  transcribing,
  analyser,
  onToggle,
}: {
  recording: boolean;
  transcribing: boolean;
  analyser: AnalyserNode | null;
  onToggle: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      <div className="flex h-16 w-full items-center justify-center">
        {recording ? (
          <VoiceWaveform analyser={analyser} />
        ) : transcribing ? (
          <ZetisWave text="ZETIS écrit ce que tu as dit…" />
        ) : (
          <span aria-hidden className="text-4xl opacity-70">
            🎤
          </span>
        )}
      </div>

      {!transcribing && (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={recording}
          className={
            recording
              ? "inline-flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-5 py-2.5 font-semibold text-rose-200 transition-colors hover:bg-rose-500/25"
              : NEON_BUTTON
          }
        >
          {recording ? "⏹️ Stop" : "🎤 Commencer à parler"}
        </button>
      )}

      <p role="status" className="text-xs text-zetis-muted">
        {recording
          ? "ZETIS t'écoute… clique Stop quand tu as fini."
          : transcribing
            ? "Un instant, ZETIS met ta voix en mots…"
            : "Clique, parle, puis Stop — ton explication s'écrira toute seule."}
      </p>
    </div>
  );
}

// Onde de voix réactive : barres animées pilotées par le niveau réel du micro
// (AnalyserNode). Immobile sous prefers-reduced-motion (ou si l'analyseur manque).
function VoiceWaveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced || !analyser) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Backing-store à la taille CSS × devicePixelRatio → barres nettes sur écran Retina ;
    // on dessine ensuite en pixels CSS via setTransform.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || 280;
    const cssH = rect.height || 56;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // roundRect absent sur iOS Safari < 16.4 : sans ce garde, il jetterait dans la boucle rAF
    // et figerait l'onde tout l'enregistrement. Repli sur fillRect (barres droites).
    const canRound = typeof ctx.roundRect === "function";

    const bins = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const draw = () => {
      analyser.getByteFrequencyData(bins);
      ctx.clearRect(0, 0, cssW, cssH);
      const bars = 28;
      const gap = 3;
      const bw = (cssW - gap * (bars - 1)) / bars;
      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
      grad.addColorStop(0, "#6366f1"); // indigo
      grad.addColorStop(1, "#22d3ee"); // cyan
      ctx.fillStyle = grad;
      for (let i = 0; i < bars; i++) {
        const v = bins[Math.floor((i / bars) * bins.length)] / 255; // 0..1
        const bh = Math.max(2, v * cssH);
        const x = i * (bw + gap);
        const y = (cssH - bh) / 2;
        if (canRound) {
          ctx.beginPath();
          ctx.roundRect(x, y, bw, bh, Math.min(bw / 2, 3));
          ctx.fill();
        } else {
          ctx.fillRect(x, y, bw, bh);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, reduced]);

  // Repli immobile : retour d'état clair sans animation.
  if (reduced || !analyser) {
    return (
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-3 rounded-full bg-rose-400" />
        <span className="text-sm text-zetis-muted">Enregistrement en cours…</span>
      </div>
    );
  }
  return <canvas ref={canvasRef} aria-hidden className="max-w-full" style={{ width: 280, height: 56 }} />;
}

// Bouton d'une capacité Phase 9 (vocal / mindmap) : désactivé, badge « bientôt ».
function SoonButton({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-zetis-muted opacity-70">
      <span aria-hidden>{emoji}</span>
      {label}
      <span className="rounded-full bg-fuchsia-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">
        bientôt
      </span>
    </span>
  );
}

function FeedbackCard({ reverse }: { reverse: ReturnType<typeof useEli5>["reverse"] }) {
  if (!reverse) return null;
  const nothingMissing = reverse.missing_points.length === 0;
  return (
    <GlassPanel className="p-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={reverse.score} size={64} />
        <div>
          <h2 className="text-base font-semibold">✨ Le retour de ZETIS</h2>
          <p className="text-sm text-zetis-muted">
            {reverse.score}% compris — bravo d'avoir expliqué&nbsp;!
          </p>
        </div>
      </div>

      {/* Colonne verte AVANT l'ambre. Le contrat ne fournit pas de liste de points
          justes : la colonne verte porte le feedback (prose), pas des puces rêvées. */}
      <div className="mt-4 grid grid-cols-1 gap-3 min-[620px]:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
          <h3 className="text-sm font-semibold text-emerald-300">Le retour de ZETIS</h3>
          <p className="mt-1 text-sm text-zetis-text">{reverse.feedback}</p>
        </div>

        {/* missing_points vide ne montre pas une colonne vide (se lirait comme un bug). */}
        {nothingMissing ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <h3 className="text-sm font-semibold text-emerald-300">🎉 Tu n'as rien oublié&nbsp;!</h3>
            <p className="mt-1 text-sm text-zetis-text">
              Ton explication couvre tout l'essentiel.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
            <h3 className="text-sm font-semibold text-amber-300">À ajouter à ton explication</h3>
            <ul className="mt-1 space-y-1 text-sm text-zetis-text">
              {reverse.missing_points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="text-amber-300">
                    →
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Mini-mission — bouton non-navigant en V1. TODO: deep-link mission quand la
          boucle mission↔ELI5 sera câblée. Ne pas inventer de route. */}
      <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-400/10 p-4">
        <h3 className="text-sm font-semibold text-indigo-200">🎯 Mini-mission</h3>
        <p className="mt-1 text-sm text-zetis-text">{reverse.next_action}</p>
        <button
          type="button"
          className={`mt-3 ${NEON_BUTTON}`}
          // TODO: deep-link mission (boucle mission↔ELI5) — non-navigant en V1.
        >
          C'est parti
        </button>
      </div>
    </GlassPanel>
  );
}

function XpToast() {
  // miroir du crédit serveur ELI5-reverse (+10) : garder synchro
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 motion-safe:animate-[eli5-toast-in_0.3s_ease-out]">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zetis-surface/90 px-5 py-2.5 shadow-2xl backdrop-blur-xl">
        <span className={NEON_TEXT}>⚡ +10 XP</span>
        <span className="text-sm text-zetis-muted">· Tu as expliqué avec tes mots</span>
      </div>
    </div>
  );
}
