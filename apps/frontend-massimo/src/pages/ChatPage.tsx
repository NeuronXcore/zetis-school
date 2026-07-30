import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AvatarCanvas,
  phonemeForWord,
  type Articulation,
  type AvatarState,
} from "@zetis/ui/avatar";
import { splitKaraoke, type KaraokeWord } from "../lib/karaoke";
import { isDictationSupported, startRecording, type Recording } from "../lib/dictation";
import { Eli5SttUnavailable, requestNotion, transcribeEli5 } from "../lib/eli5";
import {
  ChatQuotaReached,
  ChatSessionExpired,
  ChatVoiceUnavailable,
  closeChatSession,
  createChatSession,
  sendChatMessage,
  synthesizeChatSpeech,
  type ChatAction,
  type ChatMenuItem,
  type ChatToolType,
} from "../lib/chat";
import { DATA_OPEN_LABEL, DATA_ROUTE, surfaceOf } from "../lib/chatActions";
import { ChatDataCard } from "../components/ChatDataCard";
import { ACTION_UI } from "../lib/notionActionUi";
import { isVoicePlaybackSupported, playSpeech, primeAudio, type VoicePlayback } from "../lib/voice";
import "./chat.css";

type Origin = "voice" | "text";

// Phrase FIXE de l'asymétrie (ADR-0026 §5) : toujours visible, non fermable.
const FIXED_TRANSPARENCY = "ZETIS retient les notions que tu travailles, pas tes mots.";

const TOOL_LABEL: Record<ChatToolType, string> = {
  eli5: "🧠 Réexplique-moi",
  fiche: "🗂️ Fais-moi une fiche",
  mindmap: "🗺️ Fais-moi une carte",
  revision: "🎯 On révise ensemble",
};

interface Speech {
  words: KaraokeWord[];
  idx: number;
  wordStart: number;
  suggested: ChatToolType | null;
  action: ChatAction | null;
  origin: Origin;
}

export function ChatPage() {
  const navigate = useNavigate();
  const [awake, setAwake] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [input, setInput] = useState("");
  const [words, setWords] = useState<KaraokeWord[]>([]);
  const [wordIdx, setWordIdx] = useState(-1);
  const [tool, setTool] = useState<ChatToolType | null>(null);
  const [action, setAction] = useState<ChatAction | null>(null);
  const [requestedNotion, setRequestedNotion] = useState<string | null>(null); // « demandé à Papa »
  const [skillId, setSkillId] = useState<number | null>(null);
  const [transparency, setTransparency] = useState(FIXED_TRANSPARENCY);
  const [quota, setQuota] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sttGone, setSttGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reducedManual, setReducedManual] = useState(false);

  const micSupported = isDictationSupported();

  const sessionRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const speechRef = useRef<Speech>({
    words: [],
    idx: -1,
    wordStart: 0,
    suggested: null,
    action: null,
    origin: "text",
  });
  const avatarStateRef = useRef(avatarState);
  avatarStateRef.current = avatarState;
  const recRef = useRef<Recording | null>(null);
  const voiceRef = useRef<VoicePlayback | null>(null); // audio en cours → pilote la bouche
  const voiceGoneRef = useRef(false); // le serveur n'a pas de TTS : on cesse d'essayer

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const stopVoice = useCallback(() => {
    if (voiceRef.current) {
      voiceRef.current.stop();
      voiceRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      stopVoice();
      recRef.current?.cancel();
    },
    [clearTimers, stopVoice],
  );

  // SOURCE du flux d'articulation. En parole VOIX : dérivé du spectre audio réel (AnalyserNode).
  // En repli MUET : pseudo-phonétique du texte. Le consommateur (brique avatar) ne le sait pas.
  const getArticulation = useCallback((ts: number): Articulation | null => {
    if (voiceRef.current) return voiceRef.current.getArticulation(ts);
    const sp = speechRef.current;
    if (avatarStateRef.current !== "speaking" || sp.idx < 0) return null;
    const w = sp.words[sp.idx];
    if (!w) return null;
    return phonemeForWord(w.text, (ts - sp.wordStart) / w.dur);
  }, []);

  const markWord = useCallback((i: number) => {
    speechRef.current.idx = i;
    speechRef.current.wordStart = performance.now();
    setWordIdx(i);
  }, []);

  // Exécute une action ANCRÉE : trace `chat_tool_response` (journal, zéro XP) puis navigue vers la
  // route (le backend l'a construite depuis un id validé ; le front ne fabrique aucune destination).
  const runAction = useCallback(
    async (act: ChatAction) => {
      const sid = sessionRef.current;
      if (sid) {
        try {
          await sendChatMessage(sid, {
            tool_response: { tool_type: surfaceOf(act), accepted: true },
          });
        } catch {
          /* best-effort */
        }
      }
      const route = act.kind === "show_data" && act.data ? DATA_ROUTE[act.data] : act.route;
      if (route) navigate(route);
    },
    [navigate],
  );

  // Une entrée du menu de notion (Q1) : trace `chat_tool_response` (surface = type de contenu) puis
  // navigue vers sa route ancrée (construite serveur — le front n'invente rien).
  const goMenuItem = useCallback(
    async (item: ChatMenuItem) => {
      const sid = sessionRef.current;
      if (sid) {
        try {
          await sendChatMessage(sid, { tool_response: { tool_type: item.kind, accepted: true } });
        } catch {
          /* best-effort */
        }
      }
      navigate(item.route);
    },
    [navigate],
  );

  // Notion HORS-PROGRAMME (request_notion) : le tap enregistre une demande à Papa (précédent ELI5) —
  // ZETIS ne fabrique rien, il transmet. Trace `chat_tool_response` (journal, zéro XP), puis remercie.
  const askPapaToAdd = useCallback(
    async (text: string) => {
      const sid = sessionRef.current;
      if (sid) {
        try {
          await sendChatMessage(sid, {
            tool_response: { tool_type: "request_notion", accepted: true },
          });
        } catch {
          /* best-effort */
        }
      }
      // La demande à Papa est l'ACTION PRINCIPALE du geste, pas de la télémétrie : on ne confirme
      // QUE si elle est réellement enregistrée (patron `useEli5.ts`). Sinon la carte RESTE affichée
      // et ZETIS le dit — jamais un « c'est noté » alors que rien n'est parti (backend éteint,
      // session expirée, réseau).
      try {
        await requestNotion(text);
        setAction(null);
        setRequestedNotion(text);
      } catch {
        setError("Je n'ai pas réussi à prévenir Papa — réessaie dans un instant.");
      }
    },
    [],
  );

  const finishSpeaking = useCallback(() => {
    clearTimers();
    stopVoice();
    const sp = speechRef.current;
    sp.idx = -1;
    setWordIdx(sp.words.length);
    setAvatarState("idle");
    if (sp.suggested) setTool(sp.suggested); // carte outils APRÈS la parole, jamais pendant
    // Orchestration (ADR-0027) : voix → navigation DIRECTE ; clavier → carte à taper ; données → carte inline.
    if (sp.action) {
      // Auto-navigation vocale RÉSERVÉE aux demandes explicites (`!confirm`) : une offre implicite
      // (notion nommée) reste une carte à taper, même à la voix (correctif 2026-07-30).
      if (sp.action.kind === "navigate" && sp.origin === "voice" && !sp.action.confirm) {
        void runAction(sp.action);
      } else {
        setAction(sp.action);
      }
    }
  }, [clearTimers, stopVoice, runAction]);

  // État 3 : parole. Tente la VOIX serveur (Piper) ; à défaut, karaoké MUET (Lot 1).
  const speakReply = useCallback(
    async (text: string, suggested: ChatToolType | null, act: ChatAction | null, origin: Origin) => {
      const w = splitKaraoke(text);
      speechRef.current = {
        words: w,
        idx: -1,
        wordStart: performance.now(),
        suggested,
        action: act,
        origin,
      };
      clearTimers();
      stopVoice();

      let playback: VoicePlayback | null = null;
      if (!voiceGoneRef.current && isVoicePlaybackSupported()) {
        try {
          const buf = await synthesizeChatSpeech(text);
          playback = await playSpeech(buf);
        } catch (e) {
          if (e instanceof ChatVoiceUnavailable) voiceGoneRef.current = true; // inutile de réessayer
          playback = null;
        }
      }

      setWords(w);
      setWordIdx(-1);
      setTool(null);
      setAvatarState("speaking");

      if (playback) {
        voiceRef.current = playback;
        // Karaoké calé sur la DURÉE RÉELLE de l'audio (les bornes de mots viendront d'un TTS
        // à timestamps plus tard ; ici on étire les durées estimées pour finir avec le son).
        const totalMs = playback.duration * 1000;
        const sumDur = w.reduce((s, x) => s + x.dur, 0) || 1;
        const scale = totalMs / sumDur;
        let acc = 0;
        w.forEach((word, i) => {
          timersRef.current.push(window.setTimeout(() => markWord(i), acc * scale));
          acc += word.dur;
        });
        void playback.ended.then(() => finishSpeaking());
      } else {
        // Repli muet : karaoké minuté (Lot 1).
        let acc = 0;
        w.forEach((word, i) => {
          timersRef.current.push(window.setTimeout(() => markWord(i), acc));
          acc += word.dur;
        });
        timersRef.current.push(window.setTimeout(finishSpeaking, acc + 260));
      }
    },
    [clearTimers, stopVoice, finishSpeaking, markWord],
  );

  const cut = useCallback(() => {
    if (avatarStateRef.current === "speaking") finishSpeaking(); // barge-in : coupe voix + anim
  }, [finishSpeaking]);

  const send = useCallback(
    async (text: string, origin: Origin) => {
      const msg = text.trim();
      if (!msg || busy || quota) return;
      primeAudio(); // geste utilisateur → débloque l'audio (iOS) pour la voix à venir
      setInput("");
      setError(null);
      setAwake(true);
      setTool(null);
      setAction(null);
      setRequestedNotion(null);
      clearTimers();
      stopVoice();
      setWords([]);
      setWordIdx(-1);
      setBusy(true);
      setAvatarState("thinking"); // la giration absorbe la latence (moteur + synthèse voix)
      try {
        if (!sessionRef.current) {
          const s = await createChatSession();
          sessionRef.current = s.session_id;
          setTransparency(s.transparency);
        }
        const reply = await sendChatMessage(sessionRef.current, { text: msg });
        setSkillId(reply.skill_id);
        await speakReply(reply.reply, reply.tool_suggestion, reply.action ?? null, origin);
      } catch (e) {
        if (e instanceof ChatQuotaReached) {
          setQuota(true);
          setAvatarState("idle");
        } else if (e instanceof ChatSessionExpired) {
          sessionRef.current = null;
          setAvatarState("idle");
          setError("La conversation s'est mise en pause. Renvoie ton message quand tu veux.");
        } else {
          setAvatarState("idle");
          setError("ZETIS n'a pas pu répondre. Réessaie dans un instant.");
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, quota, clearTimers, stopVoice, speakReply],
  );

  // Micro : appui-pour-parler → Whisper LOCAL (endpoint ELI5) → texte → tour de chat.
  const startMic = useCallback(async () => {
    if (!micSupported || sttGone || busy || recRef.current) return;
    primeAudio(); // geste → débloque aussi l'audio de sortie
    setError(null);
    setAwake(true);
    try {
      const rec = await startRecording();
      recRef.current = rec;
      setRecording(true);
      setAvatarState("listening");
    } catch {
      setError("Je n'ai pas pu ouvrir le micro. Tu peux m'écrire !");
    }
  }, [micSupported, sttGone, busy]);

  const stopMic = useCallback(async () => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    setRecording(false);
    setAvatarState("thinking");
    let blob: Blob;
    try {
      blob = await rec.stop();
    } catch {
      setAvatarState("idle");
      return;
    }
    try {
      const { transcript } = await transcribeEli5(blob);
      if (transcript.trim()) await send(transcript, "voice"); // voix → navigation directe
      else setAvatarState("idle");
    } catch (e) {
      setAvatarState("idle");
      if (e instanceof Eli5SttUnavailable) {
        setSttGone(true);
        setError("La dictée n'est pas dispo pour l'instant. Écris-moi !");
      } else {
        setError("Je n'ai pas bien entendu — réessaie, ou écris-moi.");
      }
    }
  }, [send]);

  const respondTool = useCallback(async (t: ChatToolType, accepted: boolean) => {
    setTool(null);
    if (sessionRef.current) {
      try {
        await sendChatMessage(sessionRef.current, { tool_response: { tool_type: t, accepted } });
      } catch {
        /* best-effort */
      }
    }
  }, []);

  const acceptTool = useCallback(
    async (t: ChatToolType) => {
      await respondTool(t, true);
      if (t === "eli5" && skillId != null) navigate(`/eli5?skill_id=${skillId}`);
      // Autres outils : non-navigants en V1 (TODO deep-links fiche/mindmap/révision).
    },
    [respondTool, skillId, navigate],
  );

  const endSession = useCallback(async () => {
    clearTimers();
    stopVoice();
    recRef.current?.cancel();
    recRef.current = null;
    const s = sessionRef.current;
    sessionRef.current = null;
    if (s) {
      try {
        await closeChatSession(s);
      } catch {
        /* best-effort : le TTL serveur purge */
      }
    }
    setAwake(false);
    setAvatarState("idle");
    setRecording(false);
    setWords([]);
    setWordIdx(-1);
    setTool(null);
    setAction(null);
    setQuota(false);
    setInput("");
    setError(null);
  }, [clearTimers, stopVoice]);

  const speaking = avatarState === "speaking";
  const showMic = micSupported && !sttGone;

  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <button
          type="button"
          className="chat-reduce-btn"
          aria-pressed={reducedManual}
          onClick={() => setReducedManual((v) => !v)}
        >
          {reducedManual ? "Animations réduites ✓" : "Animations réduites"}
        </button>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className={`chat-stage${speaking ? " chat-cuttable" : ""}`}
        onClick={cut}
        title={speaking ? "Tape pour couper" : undefined}
      >
        <AvatarCanvas
          state={avatarState}
          awake={awake}
          getArticulation={getArticulation}
          reducedMotion={reducedManual || undefined}
        />
      </div>

      {words.length > 0 && (
        <div className="chat-transcript" aria-live="polite">
          {words.map((w, i) => {
            const cls =
              i < wordIdx ? "chat-w chat-said" : i === wordIdx ? "chat-w chat-now" : "chat-w";
            return (
              <span key={i} className={cls}>
                {w.text}{" "}
              </span>
            );
          })}
        </div>
      )}

      {error && <p className="chat-quota">{error}</p>}

      {/* Orchestration (ADR-0027) : action ANCRÉE. Voix a déjà navigué ; clavier → carte à taper,
          données → carte inline. */}
      {!speaking && action?.kind === "navigate" && (
        <div className="chat-offer" role="group" aria-label="ZETIS peut t'ouvrir ça">
          <div className="chat-offer-row">
            <button type="button" className="chat-tool" onClick={() => runAction(action)}>
              {action.label} →
            </button>
          </div>
        </div>
      )}
      {!speaking && action?.kind === "notion_menu" && action.items && (
        <div className="chat-offer" role="group" aria-label={action.label}>
          <div className="chat-offer-head">{action.label}</div>
          <div className="chat-offer-row">
            {action.items.map((item) => {
              const ui = ACTION_UI[item.kind as keyof typeof ACTION_UI];
              return (
                <button
                  key={item.kind}
                  type="button"
                  className="chat-tool"
                  onClick={() => goMenuItem(item)}
                >
                  {ui ? `${ui.icon} ${ui.label}` : item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!speaking && action?.kind === "show_data" && action.data && (
        <ChatDataCard
          data={action.data}
          openLabel={DATA_OPEN_LABEL[action.data]}
          onOpen={() => runAction(action)}
        />
      )}
      {/* Notion hors-programme : ZETIS ne l'a pas → carte OPT-IN pour demander à Papa de l'ajouter
          (jamais une génération). Le tap enregistre la demande ; ZETIS remercie. */}
      {!speaking && action?.kind === "request_notion" && action.text && (
        <div className="chat-offer" role="group" aria-label="Demander à Papa">
          <div className="chat-offer-row">
            <button
              type="button"
              className="chat-tool"
              onClick={() => askPapaToAdd(action.text as string)}
            >
              📩 {action.label}
            </button>
          </div>
        </div>
      )}
      {!speaking && requestedNotion && (
        <p className="chat-quota" role="status">
          📩 C'est noté&nbsp;! Papa verra ta demande pour «&nbsp;{requestedNotion}&nbsp;».
        </p>
      )}

      {!speaking && !action && tool && (
        <div className="chat-offer" role="group" aria-label="ZETIS te propose">
          <div className="chat-offer-head">On continue comment&nbsp;?</div>
          <div className="chat-offer-row">
            <button type="button" className="chat-tool" onClick={() => acceptTool(tool)}>
              {TOOL_LABEL[tool]}
            </button>
          </div>
          <button
            type="button"
            className="chat-tool chat-ghost"
            onClick={() => respondTool(tool, false)}
          >
            Non, je réessaie tout seul
          </button>
        </div>
      )}

      <div className="chat-actions">
        {quota ? (
          <p className="chat-quota">On a beaucoup parlé aujourd'hui ! On se reparle demain&nbsp;?</p>
        ) : (
          <>
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                send(input, "text"); // clavier → carte-action à taper
              }}
            >
              <input
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setAwake(true)}
                placeholder="Écris à ZETIS…"
                aria-label="Écris à ZETIS"
                autoComplete="off"
              />
              <button className="chat-send" type="submit" disabled={busy || !input.trim()}>
                Envoyer
              </button>
            </form>

            {showMic && (
              <button
                type="button"
                className={`chat-mic${recording ? " chat-recording" : ""}`}
                disabled={busy && !recording}
                onPointerDown={startMic}
                onPointerUp={stopMic}
                onPointerLeave={() => {
                  if (recRef.current) void stopMic();
                }}
                onPointerCancel={() => {
                  if (recRef.current) void stopMic();
                }}
              >
                {recording ? "🎙️ Je t'écoute… relâche quand tu as fini" : "🎤 Appuie pour parler"}
              </button>
            )}
          </>
        )}

        {sessionRef.current && (
          <button type="button" className="chat-end" onClick={endSession}>
            C'est fini pour aujourd'hui
          </button>
        )}
      </div>

      <p className="chat-transparency">{transparency}</p>
    </div>
  );
}
