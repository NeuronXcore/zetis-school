// Service worker ZETIS Clip : menus contextuels + envoi direct au RAG.
//
// Le popup gère le flux riche (aperçu, matière, chapitre, PDF). Les menus
// contextuels offrent un envoi rapide en un clic : la capture part en `pending`
// sans métadonnée, à compléter/valider ensuite dans « Sources de cours ».

import { ApiError, postClip, postClipUrl } from "../lib/api";
import { captureTab, scrapeTranscript, tabLooksLikeVideo } from "../lib/capture";
import { cleanVideoTitle } from "../lib/messages";
import { getToken } from "../lib/storage";

const MENU_SELECTION = "zetis-clip-selection";
const MENU_PAGE = "zetis-clip-page";
const MENU_VIDEO = "zetis-clip-video";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: "Envoyer la sélection à ZETIS",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: "Envoyer la page à ZETIS",
    contexts: ["page"],
  });
  // Restreint aux pages YouTube (pas de scan ailleurs) : n'apparaît que là.
  chrome.contextMenus.create({
    id: MENU_VIDEO,
    title: "Importer la transcription de cette vidéo",
    contexts: ["page"],
    documentUrlPatterns: ["*://*.youtube.com/*", "*://youtu.be/*"],
  });
});

/** Retour visuel sans permission « notifications » : on peint le badge de l'action. */
async function flashBadge(ok: boolean): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: ok ? "#10b981" : "#ef4444" });
  await chrome.action.setBadgeText({ text: ok ? "✓" : "!" });
  setTimeout(() => void chrome.action.setBadgeText({ text: "" }), 4000);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleMenuClick(info, tab);
});

async function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (tab?.id == null) return;

  // Pas connecté : on ne peut rien envoyer — on guide vers les Options.
  if (!(await getToken())) {
    await flashBadge(false);
    await chrome.runtime.openOptionsPage();
    return;
  }

  try {
    if (info.menuItemId === MENU_VIDEO) {
      await importVideoTranscript(tab);
      await flashBadge(true);
      return;
    }

    let title = tab.title || "Capture web";
    let text = info.selectionText?.trim() ?? "";

    if (info.menuItemId === MENU_PAGE || !text) {
      // Page entière : on passe par le content script (Readability).
      const captured = await captureTab(tab.id);
      if (captured.isPdf) throw new Error("PDF : utilise le popup pour l'envoyer.");
      title = captured.title || title;
      text = info.menuItemId === MENU_SELECTION ? captured.selectionText : captured.articleText;
    }

    if (!text.trim()) throw new Error("Rien à capturer.");

    await postClip({ title, text, source_url: tab.url ?? null });
    await flashBadge(true);
  } catch {
    await flashBadge(false);
  }
}

/** Import transcription : serveur d'abord, repli DOM si indisponible. Lève si tout échoue. */
async function importVideoTranscript(tab: chrome.tabs.Tab): Promise<void> {
  if (!tabLooksLikeVideo(tab)) throw new Error("Onglet non vidéo.");
  const url = tab.url ?? "";
  const title = cleanVideoTitle(tab.title ?? "");
  try {
    await postClipUrl({ url, title });
  } catch (err) {
    if (err instanceof ApiError && err.code === "transcript_unavailable" && tab.id != null) {
      const scraped = await scrapeTranscript(tab.id);
      if (!scraped.found || !scraped.text.trim()) throw new Error("Transcription introuvable.");
      await postClip({ title: title || scraped.title, text: scraped.text, source_url: url });
      return;
    }
    throw err;
  }
}
