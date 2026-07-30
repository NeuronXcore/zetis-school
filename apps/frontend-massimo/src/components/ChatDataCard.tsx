// Carte de données inline du chat (ADR-0027, slice B). Le backend renvoie `show_data{data}` SANS
// donnée (pipeline aveugle au contenu, §1c) : c'est CE composant qui récupère l'endpoint élève
// existant et rend une réponse compacte + un bouton d'ouverture. Vocabulaire bienveillant.
import { useEffect, useState } from "react";
import type { ChatDataKind } from "../lib/chat";
import { fetchAgendaWeek } from "../lib/agenda";
import { fetchReviewsSummary } from "../lib/reviews";
import { fetchToday } from "../lib/missions";

interface Content {
  title: string;
  lines: string[];
}

async function loadAgenda(): Promise<Content> {
  const week = await fetchAgendaWeek();
  const todo = week.days.flatMap((d) => d.fixed_items).filter((i) => !i.done);
  if (todo.length === 0) return { title: "Tes devoirs", lines: ["Rien à faire pour l'instant 🎉"] };
  const lines = todo.slice(0, 5).map((i) => (i.subject?.name ? `${i.label} — ${i.subject.name}` : i.label));
  return { title: "Ce que tu as à faire", lines };
}

async function loadReviews(): Promise<Content> {
  const s = await fetchReviewsSummary();
  if (!s.total_due) return { title: "Révisions", lines: ["Tout est à jour ✓"] };
  const lines = s.subjects
    .filter((x) => x.due_count > 0)
    .slice(0, 5)
    .map((x) => `${x.name} — ${x.due_count} carte${x.due_count > 1 ? "s" : ""}`);
  const title = `${s.total_due} carte${s.total_due > 1 ? "s" : ""} à réviser`;
  return { title, lines: lines.length ? lines : [title] };
}

async function loadMissions(): Promise<Content> {
  const today = await fetchToday();
  if (!today.elected) {
    return { title: "Missions", lines: ["Pas de mission imposée aujourd'hui — c'est toi qui choisis !"] };
  }
  return { title: "Ta mission du jour", lines: [`${today.elected.title} — ${today.elected.subject}`] };
}

const LOADERS: Record<ChatDataKind, () => Promise<Content>> = {
  agenda: loadAgenda,
  reviews: loadReviews,
  missions: loadMissions,
};

export function ChatDataCard({
  data,
  openLabel,
  onOpen,
}: {
  data: ChatDataKind;
  openLabel: string;
  onOpen: () => void;
}) {
  const [content, setContent] = useState<Content | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setContent(null);
    setFailed(false);
    LOADERS[data]()
      .then((c) => {
        if (alive) setContent(c);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [data]);

  return (
    <div className="chat-datacard" role="group" aria-label="Ce que ZETIS a trouvé pour toi">
      {failed ? (
        <p className="chat-datacard-line">Je n'ai pas réussi à charger ça — ouvre la page 👇</p>
      ) : content === null ? (
        <p className="chat-datacard-line">Un instant…</p>
      ) : (
        <>
          <div className="chat-datacard-title">{content.title}</div>
          <ul className="chat-datacard-list">
            {content.lines.map((line, i) => (
              <li key={i} className="chat-datacard-line">
                {line}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="chat-tool" onClick={onOpen}>
        {openLabel} →
      </button>
    </div>
  );
}
