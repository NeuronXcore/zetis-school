// Capture micro locale (MediaRecorder) pour la dictée ELI5 (ADR-0012). L'audio est
// enregistré côté navigateur puis envoyé à /transcribe (Whisper LOCAL) — aucune API
// vocale tierce. Aucune donnée durable côté front : le Blob est éphémère.

export interface Recording {
  /** Arrête l'enregistrement et rend l'audio capturé. */
  stop: () => Promise<Blob>;
  /** Annule sans produire d'audio (libère le micro). */
  cancel: () => void;
  /**
   * Analyseur Web Audio du flux micro, pour visualiser le niveau en direct
   * (barres réactives). `null` si l'AudioContext est indisponible : la capture
   * fonctionne quand même, seule l'animation dégrade.
   */
  analyser: AnalyserNode | null;
}

/** La dictée est-elle possible dans ce navigateur ? (micro + MediaRecorder). */
export function isDictationSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

/** Démarre un enregistrement. Peut rejeter si l'utilisateur refuse le micro. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Analyseur temps réel pour l'animation de voix. Facultatif : dégrade proprement.
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor();
      void audioCtx.resume(); // parfois « suspended » à la création
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
    }
  } catch {
    audioCtx = null;
    analyser = null;
  }

  recorder.start();

  // Libère TOUT : pistes micro + AudioContext (sinon fuite de ressources audio).
  const releaseMic = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      try {
        void audioCtx.close();
      } catch {
        /* déjà fermé */
      }
      audioCtx = null;
    }
  };

  return {
    analyser,
    stop: () =>
      new Promise<Blob>((resolve) => {
        const finish = () => {
          releaseMic();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        // Le recorder peut déjà être 'inactive' (piste arrêtée hors de notre contrôle :
        // micro débranché, OS qui révoque). recorder.stop() lèverait InvalidStateError :
        // on libère et on résout avec ce qu'on a — jamais de fuite micro + AudioContext.
        if (recorder.state === "inactive") {
          finish();
          return;
        }
        recorder.onstop = finish;
        try {
          recorder.stop();
        } catch {
          finish();
        }
      }),
    cancel: () => {
      try {
        recorder.stop();
      } catch {
        /* déjà arrêté */
      }
      releaseMic();
    },
  };
}
