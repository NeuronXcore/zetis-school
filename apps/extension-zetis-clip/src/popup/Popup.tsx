import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner } from "@zetis/ui";

import {
  ApiError,
  type Chapter,
  type Subject,
  listChapters,
  listSubjects,
  postClip,
  postClipUrl,
  postPdfUpload,
} from "../lib/api";
import {
  getActiveTab,
  captureTab,
  scrapeTranscript,
  tabLooksLikePdf,
  tabLooksLikeVideo,
} from "../lib/capture";
import { fetchMe } from "../lib/auth";
import { cleanVideoTitle, type CaptureKind } from "../lib/messages";

type Phase = "loading" | "anonymous" | "ready" | "sending" | "done" | "error";

interface Draft {
  kind: CaptureKind;
  title: string;
  text: string;
  sourceUrl: string;
  pdfUrl: string | null;
  tabId: number | null;
}

const KIND_LABEL: Record<CaptureKind, string> = {
  page: "Page web",
  selection: "Sélection",
  pdf: "PDF",
  video: "Vidéo",
};

export function Popup() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [chapter, setChapter] = useState("");
  const [level, setLevel] = useState("");
  const [result, setResult] = useState<{ document_id: number; chunks: number } | null>(null);

  // Au montage : auth Papa → capture de l'onglet → matières.
  useEffect(() => {
    void (async () => {
      try {
        const me = await fetchMe();
        if (!me) {
          setPhase("anonymous");
          return;
        }
        const [tab] = [await getActiveTab()];
        if (!tab?.id) throw new Error("Aucun onglet actif.");

        const draft = await buildDraft(tab);
        setDraft(draft);
        setSubjects(await listSubjects());
        setPhase("ready");
      } catch (err) {
        setError(messageOf(err));
        setPhase("error");
      }
    })();
  }, []);

  // Chapitres rechargés quand la matière change (autocomplétion du champ libre).
  useEffect(() => {
    if (subjectId === "") {
      setChapters([]);
      return;
    }
    void listChapters(subjectId)
      .then(setChapters)
      .catch(() => setChapters([]));
  }, [subjectId]);

  const canSend = useMemo(() => {
    if (!draft) return false;
    if (draft.kind === "pdf") return Boolean(draft.pdfUrl);
    if (draft.kind === "video") return Boolean(draft.sourceUrl);
    return draft.text.trim().length > 0;
  }, [draft]);

  async function send() {
    if (!draft) return;
    setPhase("sending");
    setError("");
    try {
      const meta = {
        subject_id: subjectId === "" ? null : subjectId,
        level: level.trim() || null,
        chapter: chapter.trim() || null,
      };
      let res;
      if (draft.kind === "pdf" && draft.pdfUrl) {
        res = await sendPdf(draft, meta);
      } else if (draft.kind === "video") {
        res = await sendVideo(draft, meta);
      } else {
        res = await postClip({
          title: draft.title.trim() || "Capture web",
          text: draft.text,
          source_url: draft.sourceUrl || null,
          ...meta,
        });
      }
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError(messageOf(err));
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return (
      <Centered>
        <Spinner />
        <p className="mt-3 text-sm text-muted-foreground">Lecture de la page…</p>
      </Centered>
    );
  }

  if (phase === "anonymous") {
    return (
      <Centered>
        <p className="text-2xl">🔒</p>
        <p className="mt-2 font-medium">Connecte-toi à ZETIS</p>
        <p className="mt-1 text-sm text-muted-foreground">
          L’extension est réservée à Papa. Connecte-toi et règle l’URL du backend dans les options.
        </p>
        <Button className="mt-4" onClick={() => void chrome.runtime.openOptionsPage()}>
          Ouvrir les options
        </Button>
      </Centered>
    );
  }

  if (phase === "done" && result) {
    return (
      <Centered>
        <p className="text-2xl">✅</p>
        <p className="mt-2 font-medium">Importé en attente</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.chunks} extrait(s) ajouté(s). À valider dans « Sources de cours » (espace Papa).
        </p>
        <Button className="mt-4" variant="outline" onClick={() => window.close()}>
          Fermer
        </Button>
      </Centered>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">ZETIS Clip</h1>
        {draft && <Badge>{KIND_LABEL[draft.kind]}</Badge>}
      </header>

      {error && (
        <p className="rounded-lg border border-papa-warn/40 bg-papa-warn/10 px-3 py-2 text-sm text-papa-warn">
          {error}
        </p>
      )}

      {draft && (
        <>
          <Field label="Titre">
            <input
              className="w-full px-3 py-2 text-sm"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>

          {draft.kind === "pdf" ? (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              PDF détecté — le fichier sera envoyé tel quel et son texte extrait côté serveur.
            </p>
          ) : draft.kind === "video" ? (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              Vidéo détectée — la <strong>transcription</strong> sera importée (langue d’origine
              conservée). Si elle est indisponible, ouvre le panneau « Transcription » sous la
              vidéo et réessaie.
            </p>
          ) : (
            <Field label="Contenu extrait (modifiable)">
              <textarea
                className="h-40 w-full resize-none px-3 py-2 text-sm leading-relaxed"
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Matière">
              <select
                className="w-full px-2 py-2 text-sm"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">— Aucune —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Niveau (optionnel)">
              <input
                className="w-full px-3 py-2 text-sm"
                placeholder="ex. 4e"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Chapitre / thème (texte libre)">
            <input
              className="w-full px-3 py-2 text-sm"
              list="zetis-chapters"
              placeholder="ex. Théorème de Pythagore"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
            />
            <datalist id="zetis-chapters">
              {chapters.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>

          <Button disabled={!canSend || phase === "sending"} onClick={() => void send()}>
            {phase === "sending" ? "Envoi…" : "Envoyer à ZETIS"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            La source arrive <strong>en attente</strong> : rien n’est montré à Massimo avant validation.
          </p>
        </>
      )}
    </div>
  );
}

// --- Sous-composants -------------------------------------------------------

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center p-6 text-center">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// --- Logique de capture ----------------------------------------------------

async function buildDraft(tab: chrome.tabs.Tab): Promise<Draft> {
  const url = tab.url ?? "";
  const tabId = tab.id ?? null;
  // Vidéo (plateforme allowlistée) : transcription extraite côté serveur, pas de
  // capture DOM en amont (repli DOM seulement si le serveur échoue).
  if (tabLooksLikeVideo(tab)) {
    return {
      kind: "video",
      title: cleanVideoTitle(tab.title || url),
      text: "",
      sourceUrl: url,
      pdfUrl: null,
      tabId,
    };
  }
  // PDF natif : le content script ne s'exécute pas → on s'appuie sur l'URL.
  if (tabLooksLikePdf(tab)) {
    return { kind: "pdf", title: tab.title || pdfName(url), text: "", sourceUrl: url, pdfUrl: url, tabId };
  }
  try {
    const c = await captureTab(tab.id!);
    if (c.isPdf) {
      return { kind: "pdf", title: c.title, text: "", sourceUrl: c.url, pdfUrl: c.url, tabId };
    }
    const hasSelection = c.selectionText.length > 0;
    return {
      kind: hasSelection ? "selection" : "page",
      title: c.title,
      text: hasSelection ? c.selectionText : c.articleText,
      sourceUrl: c.url,
      pdfUrl: null,
      tabId,
    };
  } catch {
    throw new Error("Cette page ne peut pas être capturée (page protégée du navigateur ?).");
  }
}

async function sendVideo(
  draft: Draft,
  meta: { subject_id: number | null; level: string | null; chapter: string | null },
) {
  const title = draft.title.trim();
  try {
    // Primaire : extraction serveur (youtube-transcript-api).
    return await postClipUrl({ url: draft.sourceUrl, title, ...meta });
  } catch (err) {
    // Repli : le serveur n'a pas de transcription → on scrape le panneau DOM de l'onglet.
    if (err instanceof ApiError && err.code === "transcript_unavailable" && draft.tabId != null) {
      const scraped = await scrapeTranscript(draft.tabId);
      if (!scraped.found || !scraped.text.trim()) {
        throw new Error(
          "Transcription introuvable. Ouvre le panneau « Transcription » sous la vidéo, puis réessaie.",
        );
      }
      return postClip({
        title: title || scraped.title,
        text: scraped.text,
        source_url: draft.sourceUrl || null,
        ...meta,
      });
    }
    throw err;
  }
}

async function sendPdf(
  draft: Draft,
  meta: { subject_id: number | null; level: string | null; chapter: string | null },
) {
  const pdfUrl = draft.pdfUrl!;
  // Permission d'hôte demandée à la volée (geste utilisateur) pour lire le PDF.
  const origin = new URL(pdfUrl).origin + "/*";
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error("Permission refusée pour accéder au PDF.");
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Téléchargement du PDF impossible (${res.status}).`);
  const blob = await res.blob();
  return postPdfUpload(blob, pdfName(pdfUrl), { title: draft.title.trim(), ...meta });
}

function pdfName(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = path.slice(path.lastIndexOf("/") + 1);
    return name || "document.pdf";
  } catch {
    return "document.pdf";
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Erreur inconnue";
}
