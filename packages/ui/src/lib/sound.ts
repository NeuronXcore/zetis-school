// Son de « mini-victoire » synthétisé via la Web Audio API (aucun fichier binaire à embarquer).
// Doux, court, joyeux. Le réglage on/off est persistant (localStorage) et partagé Massimo + Papa.

const STORAGE_KEY = "zetis:sound";
const CHANGE_EVENT = "zetis:sound-changed";

/** Le son est-il activé ? (défaut : activé). Tolère l'absence de localStorage. */
export function isSoundEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Active/désactive le son (persisté) et notifie les toggles montés (autres onglets/composants). */
export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: on }));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

/** S'abonner aux changements du réglage son. Renvoie une fonction de désabonnement. */
export function onSoundChange(cb: (on: boolean) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

// AudioContext paresseux et unique (créé au 1er usage, après un geste utilisateur en général).
let ctx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Joue un petit carillon ascendant (Mi–Sol–Si, sinusoïdes, enveloppe douce ~0.5 s).
 * Ne fait rien si le son est désactivé ou si l'audio est bloqué (autoplay) — échoue en silence.
 */
export function playCelebrationChime(): void {
  if (!isSoundEnabled()) return;
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const notes = [659.25, 783.99, 987.77]; // Mi5, Sol5, Si5 : accord clair et joyeux
  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.09;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = notes[i];
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.02); // volume max doux
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  }
}
