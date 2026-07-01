// Contrats de messages entre popup / service worker / content script.

export type CaptureKind = "page" | "selection" | "pdf" | "video";

/** Résultat brut d'extraction renvoyé par le content script. */
export interface CaptureResult {
  url: string;
  title: string;
  /** Texte de la sélection courante (vide si rien de sélectionné). */
  selectionText: string;
  /** Texte de l'article extrait par Readability (vide si échec). */
  articleText: string;
  /** L'onglet affiche un PDF (capture via upload, pas via clip texte). */
  isPdf: boolean;
}

/** Message popup/SW → content script : « extrais le contenu de cette page ». */
export interface CaptureRequest {
  type: "zetis-clip:capture";
  /** Si défini, force le type plutôt que de laisser le content script décider. */
  prefer?: CaptureKind;
}

export function isCaptureRequest(msg: unknown): msg is CaptureRequest {
  return typeof msg === "object" && msg !== null && (msg as CaptureRequest).type === "zetis-clip:capture";
}

/** Message → content script : « scrape le panneau de transcription de l'onglet »
 *  (repli DOM quand l'extraction serveur échoue). Déclenché sur action utilisateur. */
export interface TranscriptScrapeRequest {
  type: "zetis-clip:scrape-transcript";
}

/** Résultat du repli DOM. `found=false` si le panneau transcription est absent/fermé. */
export interface TranscriptScrapeResult {
  found: boolean;
  text: string;
  title: string;
  url: string;
}

export function isTranscriptScrapeRequest(msg: unknown): msg is TranscriptScrapeRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as TranscriptScrapeRequest).type === "zetis-clip:scrape-transcript"
  );
}

/** Nettoie un titre d'onglet vidéo (retire les suffixes de plateforme, ex. « - YouTube »). */
export function cleanVideoTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*[-–|]\s*YouTube\s*$/i, "")
    .replace(/^\(\d+\)\s*/, "") // badge « (3) » de notifications d'onglet
    .trim();
}
