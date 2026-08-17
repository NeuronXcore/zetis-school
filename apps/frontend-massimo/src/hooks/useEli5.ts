import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type DueReview,
  type Eli5Explain,
  type Eli5Reverse,
  type LessonSuggestion,
  type Skill,
  Eli5SttUnavailable,
  explainEli5,
  fetchDueReviews,
  fetchLessonSuggestions,
  fetchSkills,
  requestNotion as requestNotionApi,
  reverseEli5,
  transcribeEli5,
} from "../lib/eli5";
import { type Recording, isDictationSupported, startRecording } from "../lib/dictation";

// Toute la logique de la page ELI5 vit ici (le composant reste présentationnel).
// Machine à états de « la boucle » : comprendre → reformuler.
//
// Contrainte de contrat (lue dans le code, prime sur la spec) : le backend
// n'accepte que des `skill_id` réels — jamais de texte libre. Le champ reste
// librement saisissable, mais au clic « Expliquer » son texte est résolu côté
// client contre les skills réels (`fetchSkills()`). Pas de match → état vide
// bienveillant, aucune requête backend impossible.

export type Eli5Status = "idle" | "generating" | "explained" | "evaluating" | "feedback";

// Mode de saisie de l'État 3 « À toi d'expliquer » : clavier ou voix.
export type AnswerMode = "write" | "speak";

// Suggestion cliquable de l'État 1. Porte TOUJOURS un `skillId` réel (le libellé
// n'est que cosmétique) : une chip clique = question pré-remplie + skill_id connu.
export interface Eli5Chip {
  key: string;
  kind: "lesson" | "review";
  emoji: string;
  /** Nom de notion affiché (résolu, ou repli strippé depuis le markdown). */
  name: string;
  /** Étiquette de source : « Ta leçon » | « à réviser » (jamais « à renforcer »). */
  note: string;
  skillId: number;
}

// Variante de badge de source (contrat ELI5 v2 / ADR-0011). Logique pure et testable,
// extraite du composant : leçon canonique > cours RAG > rien.
export type Eli5SourceBadge =
  | { variant: "lesson"; lessonTitle: string }
  | { variant: "course" }
  | { variant: "none" };

export function eli5SourceBadge(explanation: Eli5Explain | null): Eli5SourceBadge {
  if (!explanation) return { variant: "none" };
  if (explanation.lesson_title) {
    return { variant: "lesson", lessonTitle: explanation.lesson_title };
  }
  if ((explanation.sources_used ?? 0) > 0) return { variant: "course" };
  return { variant: "none" };
}

// Normalisation de comparaison : casse + espaces (résolution volontairement simple ;
// TODO(api): résolution serveur par embeddings nomic-embed-text, cf. Reporté).
function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Résout un texte libre en `skill_id` réel via la liste déjà chargée (aucun rappel
// réseau). Égalité normalisée d'abord, puis inclusion tolérante. null = aucun match.
export function resolveSkillId(text: string, skills: Skill[]): number | null {
  const q = norm(text);
  if (!q) return null;
  const exact = skills.find((s) => norm(s.name) === q);
  if (exact) return exact.id;
  const loose = skills.find((s) => {
    const n = norm(s.name);
    return n.includes(q) || q.includes(n);
  });
  return loose ? loose.id : null;
}

// Markdown → texte plat court pour un repli de libellé de chip (pas de **gras**/LaTeX
// brut dans une chip). Troncature ~40 caractères.
export function stripMarkdown(md: string, max = 40): string {
  const flat = md
    .replace(/\$[^$]*\$/g, "") // LaTeX inline
    .replace(/[*_`#>~]/g, "") // marqueurs markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // liens → texte
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// Construit les chips (≤ 4). Chips « 📖 Ta leçon » = notions RÉELLES des leçons en cours
// (suggestions), repli sur le mock skills[0] si aucune suggestion. Puis « à réviser » (SRS)
// remplissent le reste, dédup skill_id — le `skill_id` reste toujours le vrai.
export function buildChips(
  skills: Skill[],
  dueReviews: DueReview[],
  suggestions: LessonSuggestion[] = [],
): Eli5Chip[] {
  const chips: Eli5Chip[] = [];
  const used = new Set<number>();

  // Notions de la leçon en cours : suggestions réelles (≤ 2) ; à défaut, repli mock
  // sur le premier skill (toujours une affordance) — TODO(api) supprimé, endpoint câblé.
  const lessonNotions: { id: number; name: string }[] =
    suggestions.length > 0
      ? suggestions.slice(0, 2).map((s) => ({ id: s.skill_id, name: s.name }))
      : skills[0]
        ? [{ id: skills[0].id, name: skills[0].name }]
        : [];
  for (const n of lessonNotions) {
    if (used.has(n.id)) continue;
    chips.push({
      key: `lesson-${n.id}`,
      kind: "lesson",
      emoji: "📖",
      name: n.name,
      note: "Ta leçon",
      skillId: n.id,
    });
    used.add(n.id);
  }

  // Chips « à réviser » — RÉELLES, dérivées de fetchDueReviews() (SRS). Libellé résolu
  // via skills (repli front_markdown strippé), skill_id toujours réel.
  const byId = new Map(skills.map((s) => [s.id, s.name]));
  for (const dr of dueReviews) {
    if (chips.length >= 4) break;
    if (used.has(dr.skill_id)) continue; // évite un doublon avec une chip leçon
    const name = byId.get(dr.skill_id) ?? stripMarkdown(dr.front_markdown);
    chips.push({
      key: `review-${dr.id}`,
      kind: "review",
      emoji: "🔁",
      name,
      note: "à réviser",
      skillId: dr.skill_id,
    });
    used.add(dr.skill_id);
  }

  return chips;
}

export interface UseEli5 {
  status: Eli5Status;
  /** true pendant generating/evaluating (une requête est en vol). */
  busy: boolean;
  question: string;
  setQuestion: (v: string) => void;
  answer: string;
  setAnswer: (v: string) => void;
  explanation: Eli5Explain | null;
  reverse: Eli5Reverse | null;
  /** Notion en cours d'explication (pour la consigne de l'État 3). */
  currentTitle: string | null;
  chips: Eli5Chip[];
  error: string | null;
  /** Champ sans match : état vide bienveillant, aucune requête backend émise. */
  noMatch: boolean;
  /** Envoi en cours de la demande « Dis à Papa ». */
  requesting: boolean;
  /** La notion hors-programme a été signalée à Papa (confirmation affichée). */
  requested: boolean;
  /** Trace la notion tapée pour que Papa l'ajoute au programme. */
  requestNotion: () => void;
  submitQuestion: () => void;
  submitChip: (chip: Eli5Chip) => void;
  reExplain: () => void;
  submitAnswer: () => void;
  // Dictée ELI5 (ADR-0012) : « soit il écrit, soit il parle ».
  /** Mode de saisie courant (clavier / voix). */
  mode: AnswerMode;
  /** Change de mode (annule proprement une capture en cours si on repasse en Écrire). */
  setMode: (next: AnswerMode) => void;
  /** La dictée est-elle possible ? (micro dispo + STT serveur pas signalé 503). */
  sttAvailable: boolean;
  /** Enregistrement micro en cours. */
  recording: boolean;
  /** Transcription (Whisper local) en cours. */
  transcribing: boolean;
  /** Analyseur Web Audio du micro pour l'animation de voix (null hors capture). */
  micAnalyser: AnalyserNode | null;
  /** Message d'erreur de dictée à afficher (micro refusé, rien entendu, serveur KO…). */
  micError: string | null;
  /** Démarre/arrête la dictée ; la transcription est ajoutée au textarea. */
  toggleDictation: () => void;
}

export function useEli5(): UseEli5 {
  const [searchParams] = useSearchParams();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [dueReviews, setDueReviews] = useState<DueReview[]>([]);
  // Notions des leçons en cours (chips « Ta leçon » réelles).
  const [suggestions, setSuggestions] = useState<LessonSuggestion[]>([]);

  const [status, setStatus] = useState<Eli5Status>("idle");
  const [question, setQuestionState] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState<Eli5Explain | null>(null);
  const [reverse, setReverse] = useState<Eli5Reverse | null>(null);
  const [currentSkillId, setCurrentSkillId] = useState<number | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  // Demande « Dis à Papa d'ajouter cette notion » (état vide hors-programme).
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  // Dictée (ADR-0012) : capture micro → /transcribe (Whisper local) → textarea.
  const [mode, setModeState] = useState<AnswerMode>("write"); // défaut : clavier
  const [sttAvailable, setSttAvailable] = useState(isDictationSupported);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  // Analyseur du flux micro exposé à l'UI pour l'animation de voix (null hors capture).
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  // Ferme la fenêtre async du double-démarrage (getUserMedia en vol) : sans lui, un 2ᵉ clic
  // pendant l'invite micro ouvrirait un 2ᵉ MediaStream + AudioContext orphelins.
  const startingRef = useRef(false);

  // Anti-course : ignore les réponses d'un cycle abandonné (reset / nouvelle question).
  const runIdRef = useRef(0);

  // Source skills UNIQUE : résolution du champ ET libellés de chips.
  useEffect(() => {
    let active = true;
    fetchSkills()
      .then((list) => {
        if (active) setSkills(list);
      })
      .catch((e: unknown) => {
        console.warn("[eli5] chargement des notions", e); // trace devtools (diagnostic)
        if (active) setError("La liste des notions n'a pas voulu se charger. Réessaie dans un instant ✨");
      });
    // fetchDueReviews() reste appelée ici — non pour une liste autonome (retirée),
    // mais pour nourrir les chips « à réviser ». Échec silencieux : pas de chips SRS.
    fetchDueReviews()
      .then((list) => {
        if (active) setDueReviews(list);
      })
      .catch(() => {
        if (active) setDueReviews([]);
      });
    // Suggestions « d'après tes leçons en cours » — échec silencieux → repli mock dans buildChips.
    fetchLessonSuggestions()
      .then((list) => {
        if (active) setSuggestions(list);
      })
      .catch(() => {
        if (active) setSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const chips = useMemo(
    () => buildChips(skills, dueReviews, suggestions),
    [skills, dueReviews, suggestions],
  );

  const setQuestion = useCallback((v: string) => {
    setQuestionState(v);
    setNoMatch(false); // toute frappe efface l'état vide bienveillant
    setRequested(false); // …et la confirmation « c'est noté »
  }, []);

  // Cœur d'un cycle explain (depuis champ résolu, chip ou deep-link).
  const runExplain = useCallback((skillId: number, title: string) => {
    const runId = ++runIdRef.current;
    setNoMatch(false);
    setError(null);
    setMicError(null); // une dictée abandonnée ne doit pas laisser son avertissement sur le nouveau cycle
    // Reset propre : démonte les sections du cycle précédent.
    setReverse(null);
    setExplanation(null);
    setAnswer("");
    setCurrentSkillId(skillId);
    setCurrentTitle(title);
    setStatus("generating");

    explainEli5(skillId)
      .then((exp) => {
        if (runId !== runIdRef.current) return; // cycle abandonné
        setExplanation(exp);
        setCurrentTitle(exp.title || title);
        setStatus("explained");
      })
      .catch((e) => {
        if (runId !== runIdRef.current) return;
        console.warn("[eli5] génération de l'explication", e); // trace devtools (diagnostic)
        setError("ZETIS n'a pas réussi à préparer l'explication. Réessaie dans un instant ✨");
        setStatus("idle");
      });
  }, []);

  const submitQuestion = useCallback(() => {
    const skillId = resolveSkillId(question, skills);
    if (skillId == null) {
      setNoMatch(true); // état vide bienveillant, aucune requête impossible
      return;
    }
    const skill = skills.find((s) => s.id === skillId);
    runExplain(skillId, skill?.name ?? question);
  }, [question, skills, runExplain]);

  const submitChip = useCallback(
    (chip: Eli5Chip) => {
      setQuestionState(chip.name); // pré-remplit le champ (traces propres)
      runExplain(chip.skillId, chip.name);
    },
    [runExplain],
  );

  // « Dis à Papa d'ajouter cette notion » : trace la notion hors-programme pour Papa.
  const requestNotion = useCallback(async () => {
    const clean = question.trim();
    if (!clean || requesting || requested) return;
    setRequesting(true);
    try {
      await requestNotionApi(clean);
      setRequested(true); // confirmation bienveillante côté UI
    } catch {
      /* échec silencieux : on garde l'état vide, l'enfant peut réessayer */
    } finally {
      setRequesting(false);
    }
  }, [question, requesting, requested]);

  const reExplain = useCallback(() => {
    if (currentSkillId == null) return;
    runExplain(currentSkillId, currentTitle ?? "");
  }, [currentSkillId, currentTitle, runExplain]);

  const submitAnswer = useCallback(() => {
    if (currentSkillId == null || answer.trim().length === 0) return;
    const runId = ++runIdRef.current;
    setError(null);
    setStatus("evaluating");
    reverseEli5(currentSkillId, answer)
      .then((rev) => {
        if (runId !== runIdRef.current) return;
        setReverse(rev);
        setStatus("feedback");
      })
      .catch((e) => {
        if (runId !== runIdRef.current) return;
        console.warn("[eli5] évaluation de la réponse (reverse)", e); // trace devtools (diagnostic)
        // Le fait qui compte : `answer` n'est pas vidé et le statut retombe sur « explained » —
        // ce qu'il a écrit est TOUJOURS dans le champ. Sans cette phrase, rien ne le lui dit.
        setError("ZETIS n'a pas réussi à écouter ta réponse. Elle est toujours là — réessaie dans un instant ✨");
        setStatus("explained"); // on reste sur l'explication, l'élève peut réessayer
      });
  }, [currentSkillId, answer]);

  // Démarre la dictée (demande le micro). Refus/erreur → dictée désactivée en douceur.
  const startDictation = useCallback(async () => {
    if (!isDictationSupported()) {
      setSttAvailable(false);
      return;
    }
    // Anti double-démarrage : capture déjà en cours ou getUserMedia en vol → no-op.
    if (recordingRef.current || startingRef.current) return;
    startingRef.current = true;
    setMicError(null);
    try {
      const rec = await startRecording();
      if (!startingRef.current) {
        // Capture abandonnée pendant le await (démontage / bascule en Écrire) : libère, n'assigne pas.
        rec.cancel();
        return;
      }
      recordingRef.current = rec;
      setMicAnalyser(rec.analyser); // alimente l'animation de voix
      setRecording(true);
    } catch {
      setRecording(false);
      setMicAnalyser(null);
      setMicError("Micro indisponible ou refusé. Autorise le micro puis réessaie.");
    } finally {
      startingRef.current = false;
    }
  }, []);

  // Arrête la dictée, transcrit en local, ajoute le texte au textarea (n'écrase pas la saisie).
  const stopDictation = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    const runId = ++runIdRef.current; // revendique le cycle (comme runExplain / submitAnswer)
    recordingRef.current = null;
    setRecording(false);
    setMicAnalyser(null);
    setTranscribing(true);
    try {
      const audio = await rec.stop();
      if (runId !== runIdRef.current) return; // cycle abandonné pendant stop()
      const { transcript } = await transcribeEli5(audio);
      if (runId !== runIdRef.current) return; // cycle abandonné pendant la transcription
      const clean = transcript.trim();
      if (clean) {
        setAnswer((prev) => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
        setMicError(null);
        setModeState("write"); // Q1 : bascule en Écrire, texte transcrit éditable
      } else {
        // Audio capté mais rien de transcrit (silence / trop court / trop faible).
        // On reste en mode Parler pour réessayer tout de suite.
        setMicError("Je n'ai pas bien entendu — réessaie en parlant un peu plus fort 🙂");
      }
    } catch (e) {
      if (runId !== runIdRef.current) return; // n'écris pas une erreur périmée sur un nouveau cycle
      console.warn("[eli5] dictée échouée", e); // trace devtools (diagnostic)
      if (e instanceof Eli5SttUnavailable) {
        // 503 = STT serveur indisponible → repli clavier.
        setSttAvailable(false);
        setMicError("La dictée n'est pas disponible sur le serveur pour l'instant.");
      } else {
        // Réseau / backend injoignable / endpoint absent (backend à redémarrer) / etc.
        setMicError("La dictée a échoué. Vérifie que le serveur tourne, puis réessaie.");
      }
    } finally {
      // Toujours retomber le spinner : les early-returns empêchent déjà toute écriture
      // périmée, mais un `transcribing` laissé à true bloquerait l'UI du nouveau cycle.
      setTranscribing(false);
    }
  }, []);

  const toggleDictation = useCallback(() => {
    if (recording) void stopDictation();
    else void startDictation();
  }, [recording, startDictation, stopDictation]);

  // Bascule Écrire/Parler. Quitter le vocal en pleine capture = annulation propre
  // (libère micro + AudioContext). Le texte déjà saisi/transcrit n'est pas touché.
  const setMode = useCallback((next: AnswerMode) => {
    setMicError(null);
    if (next === "write" && (recordingRef.current || startingRef.current)) {
      startingRef.current = false; // annule un getUserMedia en vol (sera cancel() à sa résolution)
      recordingRef.current?.cancel();
      recordingRef.current = null;
      setRecording(false);
      setMicAnalyser(null);
    }
    setModeState(next);
  }, []);

  // Filet de sécurité : si la section se démonte (nouvelle question, navigation) pendant
  // une capture, on libère le micro et l'AudioContext.
  useEffect(() => {
    return () => {
      startingRef.current = false;
      if (recordingRef.current) {
        recordingRef.current.cancel();
        recordingRef.current = null;
      }
    };
  }, []);

  // Deep-link /eli5?skill={id} : pré-remplit + lance (une seule fois, skills chargés).
  // Skill inconnu → champ vide, aucune erreur.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (deepLinkDoneRef.current || skills.length === 0) return;
    const raw = searchParams.get("skill");
    if (raw == null) return;
    deepLinkDoneRef.current = true;
    const id = Number(raw);
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    setQuestionState(skill.name);
    runExplain(skill.id, skill.name);
  }, [searchParams, skills, runExplain]);

  return {
    status,
    busy: status === "generating" || status === "evaluating",
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
  };
}
