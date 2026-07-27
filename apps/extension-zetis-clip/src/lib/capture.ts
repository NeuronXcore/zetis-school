// Helpers de capture partagés (popup + service worker).

import type {
  CaptureRequest,
  CaptureResult,
  TranscriptScrapeRequest,
  TranscriptScrapeResult,
} from "./messages";

// Plateformes vidéo supportées (Lot 2) — MÊME allowlist que le backend.
const VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be"];

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Demande au content script d'extraire le contenu de l'onglet. Lève si la page
 *  n'accepte pas de content script (ex. chrome://, viewer PDF natif). */
export async function captureTab(tabId: number): Promise<CaptureResult> {
  const req: CaptureRequest = { type: "zetis-clip:capture" };
  return (await chrome.tabs.sendMessage(tabId, req)) as CaptureResult;
}

/** Un onglet pointant un PDF (URL .pdf), détectable sans content script. */
export function tabLooksLikePdf(tab: chrome.tabs.Tab | undefined): boolean {
  const url = tab?.url ?? "";
  return /\.pdf(\?.*)?(#.*)?$/i.test(url);
}

/** Onglet vidéo sur une plateforme allowlistée (détection locale, même liste que le backend). */
export function tabLooksLikeVideo(tab: chrome.tabs.Tab | undefined): boolean {
  try {
    return VIDEO_HOSTS.includes(new URL(tab?.url ?? "").hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Repli DOM : demande au content script de scraper le panneau de transcription. */
export async function scrapeTranscript(tabId: number): Promise<TranscriptScrapeResult> {
  const req: TranscriptScrapeRequest = { type: "zetis-clip:scrape-transcript" };
  return (await chrome.tabs.sendMessage(tabId, req)) as TranscriptScrapeResult;
}
