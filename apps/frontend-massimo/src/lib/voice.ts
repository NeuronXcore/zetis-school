// Lecture de la voix de ZETIS (Lot 2) + analyse temps réel pour l'avatar.
//
// La brique avatar consomme un flux d'articulation `[ouverture, grave, médium, aigu]` (contrat
// gelé). En Lot 1, la source était la pseudo-phonétique du texte ; en Lot 2, c'est CE module : un
// `AnalyserNode` Web Audio branché sur l'audio réel de Piper. Le CONSOMMATEUR ne change pas — seule
// la source change, exactement comme l'ADR-0026 slice B le prévoyait.
//
// Aucune API vocale du navigateur (ni synthèse ni reconnaissance côté navigateur) : on lit un WAV
// produit LOCALEMENT par le serveur (Piper). Feature-détecté : sans `AudioContext` (jsdom,
// navigateur ancien), on lève et la page retombe sur le karaoké muet du Lot 1.
import type { Articulation } from "@zetis/ui/avatar";

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

export function isVoicePlaybackSupported(): boolean {
  return audioContextCtor() !== null;
}

let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

/** À appeler DANS un handler de geste utilisateur (iOS exige un geste pour débloquer l'audio). */
export function primeAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export interface VoicePlayback {
  /** Durée de l'audio en secondes. */
  duration: number;
  /** Résolue quand la lecture se termine naturellement. */
  ended: Promise<void>;
  /** Flux d'articulation LIVE, dérivé du spectre de l'audio en cours (pour l'avatar). */
  getArticulation: (ts: number) => Articulation | null;
  /** Coupe la lecture (barge-in). */
  stop: () => void;
}

function bandAvg(bins: Uint8Array, from: number, to: number): number {
  let sum = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    sum += bins[i];
    count++;
  }
  return count ? sum / count / 255 : 0; // normalisé 0..1
}

/** Joue un WAV et expose un flux d'articulation dérivé de son spectre. Lève si l'audio est
 *  indisponible (le contexte doit avoir été débloqué par un geste — cf. `primeAudio`). */
export async function playSpeech(buf: ArrayBuffer): Promise<VoicePlayback> {
  const c = getCtx();
  if (!c) throw new Error("AudioContext indisponible");
  if (c.state === "suspended") await c.resume();

  // decodeAudioData détache le buffer : on décode une COPIE pour ne pas invalider l'original.
  const audio = await c.decodeAudioData(buf.slice(0));
  const src = c.createBufferSource();
  src.buffer = audio;

  const analyser = c.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  src.connect(analyser);
  analyser.connect(c.destination);
  const bins = new Uint8Array(analyser.frequencyBinCount);

  let resolveEnded: () => void = () => {};
  const ended = new Promise<void>((r) => (resolveEnded = r));
  src.onended = () => resolveEnded();
  src.start();

  const getArticulation = (): Articulation | null => {
    analyser.getByteFrequencyData(bins);
    const n = bins.length;
    const low = bandAvg(bins, 0, Math.max(1, Math.floor(n / 6)));
    const mid = bandAvg(bins, Math.floor(n / 6), Math.floor(n / 2));
    const high = bandAvg(bins, Math.floor(n / 2), n);
    // L'ouverture de bouche suit l'énergie grave+médium (les voyelles ouvrent, les sifflantes non).
    const opening = Math.min(1, low * 1.15 + mid * 0.85);
    return [opening, low, mid, high];
  };

  return {
    duration: audio.duration,
    ended,
    getArticulation,
    stop: () => {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* déjà arrêté */
      }
    },
  };
}
