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
import { requestNotion } from "../lib/eli5";
import {
  ChatDictationUnavailable,
  ChatQuotaReached,
  ChatSessionExpired,
  ChatVoiceUnavailable,
  closeChatSession,
  createChatSession,
  sendChatMessage,
  synthesizeChatSpeech,
  transcribeChat,
  type ChatAction,
  type ChatGrounding,
  type ChatRecall,
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
  /** Ce que Massimo vient de dire, affiché le temps que ZETIS réponde (ADR-0059 §5.2). */
  const [dit, setDit] = useState<string | null>(null);
  /** Sur quoi la réponse s'appuie (ADR-0059 §7) — AFFICHÉ sous le karaoké, jamais parlé. */
  const [source, setSource] = useState<ChatGrounding | null>(null);
  /** Interrogation orale en cours (ADR-0059 §10) : un repère, jamais un score. */
  const [interro, setInterro] = useState<ChatRecall | null>(null);
  const [tool, setTool] = useState<ChatToolType | null>(null);
  const [action, setAction] = useState<ChatAction | null>(null);
  // Annonce d'ouverture (addendum ADR-0026) — état SÉPARÉ d'`action` : elle précède la
  // conversation et ne doit pas être écrasée par la première réponse de ZETIS.
  const [announceText, setAnnounceText] = useState<string | null>(null);
  const [announceActions, setAnnounceActions] = useState<ChatAction[]>([]);
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
  // L'ouverture est UNIQUE : l'annonce est auto-extinctive côté serveur, donc un double montage
  // (StrictMode en dev) la consommerait au premier passage et n'afficherait rien au second.
  const openedRef = useRef(false);
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
  const finDesOffresRef = useRef<HTMLDivElement | null>(null); // ancre de défilement (voir bas du rendu)
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
            // `skill_id` réémis tel que le serveur l'avait donné : il ancre la trace sur la notion
            // de la carte. Sans lui, un tap qui ouvre la session (annonce) était attribué au
            // dernier `chat_topic` de l'élève, parfois vieux de plusieurs jours.
            // Omis — et non `null` — quand l'action n'en porte pas : le payload des actions
            // existantes reste alors IDENTIQUE, et leurs tests n'ont pas à être retouchés.
            tool_response: {
              tool_type: surfaceOf(act),
              accepted: true,
              ...(act.skill_id != null ? { skill_id: act.skill_id } : {}),
            },
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
        // ⚠️ Ici Massimo parle À ZETIS : « je n'ai pas réussi à prévenir ZETIS » ferait de ZETIS
        // un tiers dans sa propre conversation. La première personne est la forme juste (§16).
        setError("Je n'ai pas réussi à noter ta demande — réessaie dans un instant.");
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

      // 🔴 **Le texte s'affiche AVANT la voix** (ADR-0059 §5.1) — le plus gros gain de
      // réactivité du chantier, et il ne coûte rien au backend.
      //
      // Jusqu'au 2026-08-15, ces quatre lignes venaient APRÈS `await synthesizeChatSpeech` :
      // Piper devait synthétiser la réponse ENTIÈRE avant que le premier mot n'apparaisse. Sur
      // une chaîne déjà série (STT → moteur → synthèse), c'était un maillon entier de silence
      // noir, pendant lequel Massimo ne voyait qu'un avatar qui tourne.
      //
      // ⚠️ **Effet de bord vertueux, et il vaut d'être écrit** : l'affichage ne dépend plus de
      // la promesse de `playSpeech`, qui fait `await ctx.resume()` et reste PENDANTE POUR
      // TOUJOURS sans geste utilisateur préalable. C'est le bug réel du 2026-08-02 (addendum
      // ADR-0026 §8), où un `speakReply` au montage se bloquait avant `setWords` et l'annonce
      // n'apparaissait jamais. Il ne peut plus se produire : au pire, le texte s'affiche muet.
      setWords(w);
      setWordIdx(-1);
      setTool(null);
      setAvatarState("speaking");

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

      // ⚠️ **Le tour a-t-il été abandonné pendant la synthèse ?** Le barge-in (`cut`) et un
      // nouveau message peuvent tomber pendant l'`await` ci-dessus — ce qui ne pouvait pas
      // arriver quand l'affichage suivait la synthèse, puisque rien n'était encore affiché ni
      // coupable. Si `speechRef` ne porte plus CE tour, on ne démarre ni audio ni karaoké : sans
      // ce garde, une voix coupée se remettrait à parler par-dessus la suivante.
      if (speechRef.current.words !== w) {
        playback?.stop();
        return;
      }

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

  // Ouverture de session AU MONTAGE (addendum ADR-0026). La session naissait au premier message :
  // le « contexte d'ouverture » de l'ADR-0026 §4 n'avait alors aucun moment où se dire, et une
  // annonce serait arrivée APRÈS que Massimo ait parlé. Ouvrir le chat EST son geste — le pull
  // reste strict : hors de cette session, l'annonce n'existe nulle part.
  //
  // ⚠️ L'annonce s'AFFICHE, elle ne se PARLE pas — écart trouvé au test live du 2026-08-02, et
  // deux raisons de le graver :
  //  1. « L'arrivée sur la page ne réveille PAS l'avatar » (page-chat.md §États 1). Faire parler
  //     ZETIS au chargement est un message poussé, exactement ce que l'ADR interdit.
  //  2. `playSpeech` fait `await ctx.resume()` : sans geste utilisateur préalable, le navigateur
  //     laisse la promesse EN ATTENTE POUR TOUJOURS. Un `speakReply` au montage se bloque avant
  //     `setWords`, et l'annonce n'apparaît jamais. C'est ce qui s'est produit en vrai.
  // ⚠️ AUCUN drapeau `cancelled` ici, et c'est délibéré (bug du 2026-08-02, trouvé en vrai) :
  // sous `StrictMode`, l'effet joue, se démonte, rejoue. Le garde `openedRef` bloque le SECOND
  // passage — donc si le cleanup du premier posait `cancelled`, la réponse du seul fetch réellement
  // parti serait JETÉE. L'annonce était consommée côté serveur (tamponnée) et perdue côté client :
  // deux garde-fous corrects qui s'annulent. React 18 ignore silencieusement un setState après
  // démontage ; `openedRef` suffit à garantir l'appel unique, qui est le seul invariant qui compte.
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void (async () => {
      try {
        const s = await createChatSession();
        sessionRef.current = s.session_id;
        setTransparency(s.transparency);
        if (s.announcement) {
          setAnnounceText(s.announcement.text);
          setAnnounceActions(s.announcement.actions ?? []);
        }
      } catch {
        // Best-effort : `send` rouvre une session si celle-ci a échoué. Un retour manqué ne vaut
        // pas un chat inutilisable — l'annonce reste éligible tant qu'elle n'est pas tamponnée.
      }
    })();
  }, []);

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
      // Écho de ce que Massimo vient de dire (ADR-0059 §5.2), le temps que ZETIS réponde.
      // ⚠️ **À la voix SEULEMENT.** Au clavier, il a sous les yeux ce qu'il a tapé pendant qu'il
      // le tape ; le lui répéter serait du bruit. À la voix, il n'a jamais rien vu — et c'est
      // précisément là que le doute « est-ce qu'il m'a entendu ? » s'installait.
      setDit(origin === "voice" ? msg : null);
      // Massimo passe à autre chose : l'annonce a été lue, elle s'efface.
      setAnnounceText(null);
      setAnnounceActions([]);
      setSource(null); // la source du tour précédent ne survit pas au tour suivant
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
        // ⚠️ La source est posée AVANT `speakReply`, mais elle n'entre JAMAIS dans le texte
        // synthétisé : `speakReply` ne reçoit que `reply.reply`. Une incise administrative
        // (« d'après ta leçon Les fractions ») dans chaque réponse parlée casserait le rythme
        // d'une conversation d'enfant — même discipline que l'annonce d'ouverture, qui s'affiche
        // et ne se parle pas.
        setSource(reply.grounding ?? null);
        // L'interrogation disparaît de l'écran dès qu'elle est close côté serveur — le repère de
        // progression ne doit pas survivre à ce qu'il mesure.
        setInterro(reply.recall && !reply.recall.finished ? reply.recall : null);
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
      // Route DÉDIÉE au chat (ADR-0059 §18) : celle d'ELI5 écrivait les phrases de Massimo en
      // base — 78 lignes mesurées le 2026-08-15.
      const { transcript } = await transcribeChat(blob);
      const propre = transcript.trim();
      if (propre) await send(propre, "voice"); // voix → navigation directe
      else setAvatarState("idle");
    } catch (e) {
      setAvatarState("idle");
      if (e instanceof ChatDictationUnavailable) {
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

  // Voir le commentaire au point d'ancrage, en bas du rendu. On ne suit PAS `words` : le karaoké
  // grandit mot à mot, et défiler à chaque tic arracherait la lecture. On suit ce qui APPARAÎT.
  useEffect(() => {
    if (speaking) return; // les blocs ne sont pas encore rendus — rien à montrer
    if (!action && !interro && !announceText && !tool && !requestedNotion && !error) return;
    const ancre = finDesOffresRef.current;
    // ⚠️ `scrollIntoView` n'existe pas dans jsdom — même famille que le piège `AudioContext` du
    // 2026-08-02. Le test le remplace pour observer l'appel ; la garde protège les navigateurs
    // qui ne l'auraient pas, et évite de faire tomber un tour de chat pour un défilement.
    if (typeof ancre?.scrollIntoView === "function") {
      ancre.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [speaking, action, interro, announceText, tool, requestedNotion, error]);

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

      {/* Ce que Massimo vient de dire (ADR-0059 §5.2). Il partait jusqu'ici directement dans
          `send()` sans jamais s'afficher : Massimo parlait, et n'avait AUCUNE confirmation
          d'avoir été entendu avant que ZETIS réponde — c'est-à-dire après le STT, le moteur ET
          la synthèse vocale. L'afficher coupe l'attente perçue en deux, et transforme un silence
          inquiétant en accusé de réception. Il s'efface dès que ZETIS parle : deux textes à
          l'écran en même temps se disputeraient le regard. */}
      {dit && words.length === 0 && (
        <p className="chat-said-by-me" aria-live="polite">
          {dit}
        </p>
      )}

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

      {/* D'où vient la réponse (ADR-0059 §7) — AFFICHÉE, jamais parlée. Discrète : c'est une
          garantie, pas un message. Rien ne s'affiche quand ZETIS n'a pas répondu au fond, ni
          quand il n'avait pas de source (il l'a alors dit dans sa réponse même).
          ⚠️ §16 — le titre de leçon est une DONNÉE saisie par l'adulte : si un jour l'un d'eux
          contient le mot « papa », il s'affichera. On ne censure pas les données de Papa ;
          l'angle mort est nommé dans l'ADR plutôt que découvert à l'écran. */}
      {source && source.kind !== "aucune" && words.length > 0 && (
        <p className="chat-source">
          {source.kind === "cours" && source.lesson_title
            ? `📖 D'après ta leçon « ${source.lesson_title} »`
            : "📄 D'après tes documents"}
        </p>
      )}

      {/* Interrogation en cours (ADR-0059 §10) : un REPÈRE, et une SORTIE.
          ⚠️ « Question 2 sur 3 » — jamais un score, jamais un compteur d'erreurs : les règles de
          gamification interdisent le décompte anxiogène, et un enfant qui voit son résultat en
          direct cesse de répondre pour protéger son chiffre.
          La sortie est la « sortie » de la règle « ≤ 2 propositions + une sortie » (ADR-0027). */}
      {interro && !speaking && (
        <div className="chat-offer" role="group" aria-label="Interrogation en cours">
          <p className="chat-recall-step">
            Question {interro.asked} sur {interro.total} · {interro.skill_name}
          </p>
          <div className="chat-offer-row">
            {/* ⚠️ `chat-tool chat-ghost`, jamais `chat-ghost` seul : la règle CSS est le
                sélecteur COMPOSÉ `.chat-tool.chat-ghost`. Posée seule, la classe ne correspond à
                rien — vu à l'écran le 2026-08-15 : la SEULE sortie visible d'une interrogation
                était 68 px de texte nu, sans fond, sans bordure, sans marge de clic. Un enfant
                qui veut arrêter ne reconnaît pas un bouton là-dedans, et l'`adr-0026` §4 promet
                qu'on peut toujours partir. */}
            <button
              type="button"
              className="chat-tool chat-ghost"
              onClick={() => void send("stop", "text")}
            >
              On arrête
            </button>
          </div>
        </div>
      )}

      {error && <p className="chat-quota">{error}</p>}

      {/* Retour de demande (addendum ADR-0026) : ce que Massimo avait réclamé et qui est
          RÉELLEMENT servable. AFFICHÉ, jamais parlé — l'arrivée sur la page ne réveille pas
          l'avatar. `actions` peut être vide : une notion ajoutée s'annonce même sans contenu.
          Routes ancrées serveur — le front n'en fabrique aucune. */}
      {!speaking && announceText && (
        <div className="chat-offer" role="group" aria-label="Ce que tu avais demandé">
          <p className="chat-announce">{announceText}</p>
          {announceActions.length > 0 && (
            <div className="chat-offer-row">
              {announceActions.map((act) => (
                <button
                  key={act.route ?? act.label}
                  type="button"
                  className="chat-tool"
                  onClick={() => runAction(act)}
                >
                  {act.label} →
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
      {/* Notion hors-programme : ZETIS ne l'a pas → carte OPT-IN pour la faire ajouter au
          programme (jamais une génération). Le tap enregistre la demande ; ZETIS remercie.
          ⚠️ Le nom de l'adulte a disparu de l'étiquette le 2026-08-10 (§16) : Massimo parle à
          ZETIS, et ZETIS ne se désigne pas à la 3ᵉ personne dans sa propre conversation. */}
      {!speaking && action?.kind === "request_notion" && action.text && (
        <div className="chat-offer" role="group" aria-label="Ajouter à mon programme">
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
          📩 C'est noté&nbsp;! Je garde ta demande pour «&nbsp;{requestedNotion}&nbsp;».
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

      {/* 🔴 Ce qu'on propose doit être VU (défaut trouvé au navigateur le 2026-08-15).
          Le menu d'une notion — six boutons — était rendu **788 px sous le pli** d'un écran de
          812 px : présent dans le DOM, cliquable, invisible. La page n'a jamais eu la moindre
          logique de défilement, et ça tenait tant que ZETIS ne répondait qu'une ligne. Le §7 lui
          a appris à répondre au FOND : le karaoké occupe désormais tout l'écran et pousse dehors
          ce qui le suit. Une porte ouverte sur du vide, cette fois par le bas.
          `block: "nearest"` ne fait RIEN quand le bloc est déjà visible — pas de saut de page
          parasite, et le regard n'est déplacé que lorsqu'il le faut. */}
      <div ref={finDesOffresRef} aria-hidden="true" />

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
