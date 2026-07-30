import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AvatarCanvas,
  phonemeForWord,
  type Articulation,
  type AvatarState,
} from "@zetis/ui/avatar";
import { splitKaraoke, type KaraokeWord } from "../lib/karaoke";
import {
  ChatQuotaReached,
  ChatSessionExpired,
  closeChatSession,
  createChatSession,
  sendChatMessage,
  type ChatToolType,
} from "../lib/chat";
import "./chat.css";

// Phrase FIXE de l'asymétrie (ADR-0026 §5) : toujours visible, non fermable. Affichée avant même
// la première session (constante), puis confirmée par la valeur serveur (même texte).
const FIXED_TRANSPARENCY = "ZETIS retient les notions que tu travailles, pas tes mots.";

// Outils que ZETIS peut proposer. Seul ELI5 est réellement adressable par URL (`/eli5?skill_id=`) ;
// le reste est NON-NAVIGANT en V1 (pas de deep-link stable — ne pas inventer de route).
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
}

export function ChatPage() {
  const navigate = useNavigate();
  const [awake, setAwake] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [input, setInput] = useState("");
  const [words, setWords] = useState<KaraokeWord[]>([]);
  const [wordIdx, setWordIdx] = useState(-1);
  const [tool, setTool] = useState<ChatToolType | null>(null);
  const [skillId, setSkillId] = useState<number | null>(null);
  const [transparency, setTransparency] = useState(FIXED_TRANSPARENCY);
  const [quota, setQuota] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reducedManual, setReducedManual] = useState(false);

  const sessionRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const speechRef = useRef<Speech>({ words: [], idx: -1, wordStart: 0, suggested: null });
  const avatarStateRef = useRef(avatarState);
  avatarStateRef.current = avatarState;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // SOURCE du flux d'articulation (contrat gelé) : la pseudo-phonétique du mot courant. Lue chaque
  // frame par la brique avatar ; renvoie null hors parole (bouche close). Remplacée par un
  // AnalyserNode au lot TTS — sans toucher au consommateur.
  const getArticulation = useCallback((ts: number): Articulation | null => {
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

  const finishSpeaking = useCallback(() => {
    clearTimers();
    const sp = speechRef.current;
    sp.idx = -1;
    setWordIdx(sp.words.length); // tous « dits »
    setAvatarState("idle");
    if (sp.suggested) setTool(sp.suggested); // carte outils APRÈS la parole, jamais pendant
  }, [clearTimers]);

  // État 3 : parole = karaoké mot à mot (minuté en Lot 1, cf. lib/karaoke).
  const speak = useCallback(
    (text: string, suggested: ChatToolType | null) => {
      const w = splitKaraoke(text);
      speechRef.current = { words: w, idx: -1, wordStart: performance.now(), suggested };
      setWords(w);
      setWordIdx(-1);
      setTool(null);
      setAvatarState("speaking");
      clearTimers();
      let acc = 0;
      w.forEach((word, i) => {
        timersRef.current.push(window.setTimeout(() => markWord(i), acc));
        acc += word.dur;
      });
      timersRef.current.push(window.setTimeout(finishSpeaking, acc + 260));
    },
    [clearTimers, finishSpeaking, markWord],
  );

  // Tap sur la scène pendant la parole = barge-in : coupe l'animation, texte entier (états 3).
  const cut = useCallback(() => {
    if (avatarStateRef.current === "speaking") finishSpeaking();
  }, [finishSpeaking]);

  const send = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || busy || quota) return;
      setInput("");
      setError(null);
      setAwake(true);
      setTool(null);
      clearTimers();
      setWords([]);
      setWordIdx(-1);
      setBusy(true);
      setAvatarState("thinking"); // état 2 : la latence du moteur est absorbée par la giration
      try {
        if (!sessionRef.current) {
          const s = await createChatSession();
          sessionRef.current = s.session_id;
          setTransparency(s.transparency);
        }
        const reply = await sendChatMessage(sessionRef.current, { text: msg });
        setSkillId(reply.skill_id);
        speak(reply.reply, reply.tool_suggestion);
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
    [busy, quota, clearTimers, speak],
  );

  const respondTool = useCallback(async (t: ChatToolType, accepted: boolean) => {
    setTool(null);
    // La réponse à une proposition est un ACTE : le serveur émet `chat_tool_response`.
    if (sessionRef.current) {
      try {
        await sendChatMessage(sessionRef.current, {
          tool_response: { tool_type: t, accepted },
        });
      } catch {
        /* best-effort : ne bloque pas l'orientation */
      }
    }
  }, []);

  const acceptTool = useCallback(
    async (t: ChatToolType) => {
      await respondTool(t, true);
      // Seul câblage réel : deep-link ELI5 par notion résolue. Les autres outils sont
      // NON-NAVIGANTS en V1 (TODO : deep-links fiche/mindmap/révision quand ils existeront).
      if (t === "eli5" && skillId != null) navigate(`/eli5?skill_id=${skillId}`);
    },
    [respondTool, skillId, navigate],
  );

  const endSession = useCallback(async () => {
    clearTimers();
    const s = sessionRef.current;
    sessionRef.current = null;
    if (s) {
      try {
        await closeChatSession(s);
      } catch {
        /* best-effort : le TTL serveur purge de toute façon */
      }
    }
    setAwake(false);
    setAvatarState("idle");
    setWords([]);
    setWordIdx(-1);
    setTool(null);
    setQuota(false);
    setInput("");
    setError(null);
  }, [clearTimers]);

  const speaking = avatarState === "speaking";

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

      {/* Carte d'outil : APRÈS la parole seulement (jamais pendant `speaking`). 1 proposition
          + une sortie « je réessaie tout seul » (2 max, ADR-0026 slice B). */}
      {!speaking && tool && (
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
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
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
