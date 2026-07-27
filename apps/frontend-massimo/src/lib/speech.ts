// Voix de ZETIS pour l'UI (ex. « Massimo, je prépare ton ELI5 »). Utilise la MÊME voix
// que la narration des capsules (Piper backend, ADR-0007) via POST /api/ai/tts — une
// seule voix ZETIS partout, cohérente. Piper tourne en local (aucun tiers). Gated par
// le réglage son partagé ; dégradation SILENCIEUSE si la voix est indisponible (503).
import { isSoundEnabled } from "@zetis/ui";
import { API_URL, authClient } from "./authClient";

let current: HTMLAudioElement | null = null;
// Époque incrémentée à chaque speak()/stopSpeaking() : invalide une lecture dont le
// fetch était encore en vol (évite qu'un audio en retard démarre après un stop).
let epoch = 0;

function stopAudio(): void {
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
}

/** Interrompt toute parole en cours (ex. quand la carte remplace l'onde). */
export function stopSpeaking(): void {
  epoch++;
  stopAudio();
}

/** Fait parler ZETIS (voix Piper des capsules). No-op si son coupé / voix indisponible. */
export async function speak(text: string): Promise<void> {
  if (!isSoundEnabled()) return;
  const clean = text.trim();
  if (!clean) return;
  const myEpoch = ++epoch;
  try {
    const token = authClient.getToken();
    const res = await fetch(`${API_URL}/api/ai/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: clean }),
    });
    if (myEpoch !== epoch || !res.ok) return; // annulé / voix indisponible → silence
    const blob = await res.blob();
    if (myEpoch !== epoch) return; // annulé pendant le téléchargement
    stopAudio();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (current === audio) current = null;
    };
    await audio.play().catch(() => {}); // autoplay bloqué (pas de geste) → silencieux
  } catch {
    /* réseau / voix indisponible : échec silencieux */
  }
}
