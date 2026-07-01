// Content script ZETIS Clip — extraction côté client (anti-SSRF : le backend ne
// fetch jamais d'URL arbitraire, cf. ADR-0006). Reste passif : il ne fait rien
// tant que le popup ou le service worker ne demande pas une capture.

import { Readability } from "@mozilla/readability";

import {
  cleanVideoTitle,
  isCaptureRequest,
  isTranscriptScrapeRequest,
  type CaptureResult,
  type TranscriptScrapeResult,
} from "../lib/messages";

function currentSelection(): string {
  return (window.getSelection()?.toString() ?? "").trim();
}

function isPdfDocument(): boolean {
  // Le viewer PDF natif de Chrome n'exécute pas les content scripts ; cette
  // détection couvre les PDF rendus dans un document HTML (embed/inline).
  return document.contentType === "application/pdf";
}

function readableText(): string {
  try {
    // Readability mute le DOM : on travaille sur un clone pour ne pas casser la page.
    const clone = document.cloneNode(true) as Document;
    const article = new Readability(clone).parse();
    if (article?.textContent) return article.textContent.trim();
  } catch {
    /* page non « article » : on retombera sur le texte brut */
  }
  // Repli : texte brut visible de la page.
  return (document.body?.innerText ?? "").trim();
}

function capture(): CaptureResult {
  return {
    url: window.location.href,
    title: document.title || window.location.href,
    selectionText: currentSelection(),
    articleText: readableText(),
    isPdf: isPdfDocument(),
  };
}

// Repli DOM transcription (YouTube) : lit le panneau « Transcription » s'il est
// ouvert. On ne l'ouvre pas nous-mêmes (respect de la page) — si le panneau est
// fermé/absent, on renvoie `found=false` et le popup guide Papa pour l'ouvrir.
function scrapeTranscript(): TranscriptScrapeResult {
  const nodes = document.querySelectorAll<HTMLElement>(
    "ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-renderer yt-formatted-string",
  );
  const parts = Array.from(nodes)
    .map((el) => (el.textContent ?? "").trim())
    .filter(Boolean);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return {
    found: text.length > 0,
    text,
    title: cleanVideoTitle(document.title || window.location.href),
    url: window.location.href,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isCaptureRequest(msg)) {
    sendResponse(capture());
    return true;
  }
  if (isTranscriptScrapeRequest(msg)) {
    sendResponse(scrapeTranscript());
    return true;
  }
  return undefined;
});
