import { Link } from "react-router-dom";
import { type AgendaAhead, type AgendaAheadGeste } from "@zetis/types";
import { AgendaGlyph, subjectColorFor } from "@zetis/ui";
import { longDayLabel } from "../../lib/agendaSections";
import { subjectRouteFor } from "../../lib/notionRoutes";

// « Prendre de l'avance » — la troisième question de l'agenda (ADR-0025 Amdt 9).
//
// L'agenda doit répondre à trois questions : *qu'est-ce qui est en retard*, *qu'est-ce qu'il y a
// à faire*, *comment m'avancer*. Les deux premières avaient leur surface ; celle-ci n'en avait
// aucune depuis que l'Amendement 8 §D8 a retiré « Ce qui arrive ».
//
// 🔴 **Le bloc est ANCRÉ, il n'inventorie pas.** Il part de la prochaine échéance et propose les
// gestes qui la préparent. La forme alternative — quatre listes empilées, une par source — a été
// écartée par le commanditaire, et le motif est le §7 : quatre listes de choses à faire
// **grossissent quand Massimo ne vient pas**, ce qui est la définition du compteur d'arriéré.
//
// 🔴 **Aucun nombre.** Ni décompte de jours, ni compte de cartes, ni score. L'ancre NOMME son
// jour (« vendredi 21 ») ; elle ne le décompte pas — §D8 avait retiré « Ce qui arrive » entre
// autres parce que `days_left` était le dernier décompte chiffré de la page.
//
// ⚠️ **C'est le SERVEUR qui décide quels gestes existent** (§B6, *« un bouton mort se lit comme
// une panne »*). Ce composant ne fabrique aucune porte : il rend ce qu'on lui donne.

/** La copie vit ICI, pas au serveur — le vocabulaire du `CLAUDE.md` est une décision de produit,
 *  et une phrase en dur dans un service Python serait hors de portée de la relecture.
 *
 *  🔴 **DEUX défauts par geste, et la distinction n'est pas cosmétique.** Vu à l'écran le
 *  2026-08-17 : sans échéance à venir, le bloc annonçait *« Revois tes cartes — de ce chapitre »*
 *  alors qu'**aucun chapitre n'était nommé nulle part**. La phrase désignait un contexte absent,
 *  ce qui est pire que pas de phrase : Massimo cherche le chapitre dont on lui parle.
 *  `ancre` = quand une échéance est là ; `seul` = quand le geste tient debout tout seul. */
const GESTE_UI: Record<
  AgendaAheadGeste["kind"],
  { titre: string; emoji: string; ancre: string; seul: string }
> = {
  plan: {
    titre: "Suis ton plan",
    emoji: "✦",
    ancre: "ZETIS l'a préparé pour cette échéance",
    seul: "ZETIS l'a préparé",
  },
  mindmap: {
    titre: "Reconstruis la carte",
    emoji: "🧠",
    ancre: "de ce chapitre",
    seul: "choisis-en une",
  },
  revision: {
    titre: "Revois tes cartes",
    emoji: "🃏",
    ancre: "de ce chapitre",
    seul: "celles qui t'attendent",
  },
  mission: { titre: "Fais ta mission", emoji: "🎯", ancre: "sur cette notion", seul: "du moment" },
  // ⚠️ « à renforcer », JAMAIS « lacune », « faiblesse » ni « point faible » — vocabulaire imposé
  // par le `CLAUDE.md`, et c'est la même règle qui a fait écrire « à reprendre » plus haut.
  renforcer: {
    titre: "Renforce une notion",
    emoji: "💪",
    ancre: "encore en construction",
    seul: "encore en construction",
  },
};

interface Props {
  ahead: AgendaAhead;
  /** Ouvre la panoplie d'une notion, exactement comme les notions travaillées du panneau (§D10)
   *  — même geste, même destination, une seule mécanique à apprendre. */
  onOpenNotion: (skillId: number) => void;
  /** Ouvre le jour de l'ancre sous la bande. C'est là que vit le plan de préparation, déplié
   *  dans la ligne de son échéance (ADR-0050) : la porte « suis ton plan » l'y emmène plutôt que
   *  d'ouvrir une seconde surface qui dirait la même chose. */
  onOpenDay: (date: string) => void;
}

export function AheadBlock({ ahead, onOpenNotion, onOpenDay }: Props) {
  const { anchor, gestes } = ahead;

  // 🔴 **Le bloc RÉPOND toujours** — même sans échéance et même sans geste. C'est la leçon du
  // toast muet du 2026-08-17 : un vide CONFIRMÉ est une réponse, un silence n'en est pas une.
  // ⚠️ Et ce n'est pas un réceptacle (§B1) : une phrase n'est pas une case en attente.
  if (anchor === null && gestes.length === 0) {
    return (
      <p className="mt-2 text-sm leading-relaxed text-zetis-muted">
        Rien à préparer pour l'instant. Profites-en pour revoir ce que tu veux.
      </p>
    );
  }

  const teinte = anchor?.subject
    ? subjectColorFor(anchor.subject.slug, anchor.subject.color)
    : undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {anchor && (
        <div
          className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          // La teinte reste celle de la MATIÈRE, jamais celle d'un état (doctrine des cinq
          // canaux, Amdt 8 §D3) : ce liseré dit « maths », pas « urgent ».
          style={teinte ? { borderLeft: `3px solid ${teinte}` } : undefined}
        >
          <span className="mt-0.5 shrink-0">
            <AgendaGlyph kind={anchor.kind} color={anchor.subject?.color} size={11} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-snug">{anchor.label}</span>
            {/* 🔴 Le JOUR est nommé, jamais décompté. « dans 4 jours » serait le décompte
                chiffré que §D8 a retiré de cette page. */}
            <span className="text-[11.5px] text-zetis-muted">
              {anchor.subject?.name ?? "sans matière"} · {longDayLabel(anchor.due_on)}
            </span>
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {gestes.map((geste) => (
          <li key={geste.kind}>
            <Porte
              geste={geste}
              anchor={anchor}
              onOpenNotion={onOpenNotion}
              onOpenDay={onOpenDay}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Une porte. **Toutes les destinations viennent de `notionRoutes.ts`** — la table de routage du
 *  produit n'existe qu'une fois, et la recopier ici en ferait un second jeu qui divergerait au
 *  premier correctif (c'est écrit en tête de ce module-là). */
function Porte({
  geste,
  anchor,
  onOpenNotion,
  onOpenDay,
}: {
  geste: AgendaAheadGeste;
  anchor: AgendaAhead["anchor"];
  onOpenNotion: (skillId: number) => void;
  onOpenDay: (date: string) => void;
}) {
  const ui = GESTE_UI[geste.kind];
  const slug = anchor?.subject?.slug;
  const classe =
    "flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm transition-colors hover:border-violet-400/45 hover:bg-white/[0.06] motion-reduce:transition-none";

  const corps = (
    <>
      <span aria-hidden className="shrink-0 text-base">
        {ui.emoji}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-snug">{ui.titre}</span>
        <span className="block truncate text-[11.5px] text-zetis-muted">
          {geste.detail ?? (anchor ? ui.ancre : ui.seul)}
        </span>
      </span>
      <span aria-hidden className="ml-auto shrink-0 text-zetis-muted">
        →
      </span>
    </>
  );

  // DEUX gestes agissent SUR CETTE PAGE plutôt que de naviguer — parce que leur réponse y est
  // déjà : la panoplie d'une notion (§D10) et le jour de l'échéance, qui porte le plan.
  if (geste.kind === "renforcer" && geste.skill_id !== null) {
    const skillId = geste.skill_id;
    return (
      <button type="button" onClick={() => onOpenNotion(skillId)} className={classe}>
        {corps}
      </button>
    );
  }
  if (geste.kind === "plan" && anchor) {
    return (
      <button type="button" onClick={() => onOpenDay(anchor.due_on)} className={classe}>
        {corps}
      </button>
    );
  }

  const to = destination(geste, slug);
  // ⚠️ **Aucune affordance morte** : sans destination, on ne rend rien plutôt qu'un bouton inerte.
  // Le serveur ne devrait jamais servir un geste sans cible — ce garde-fou est la seconde barrière,
  // pas la première.
  if (to === null) return null;

  return (
    <Link to={to} className={classe}>
      {corps}
    </Link>
  );
}

function destination(geste: AgendaAheadGeste, slug: string | undefined): string | null {
  switch (geste.kind) {
    case "plan":
      // Traité plus haut : il ouvre le jour, il ne navigue pas. Sans ancre il n'a aucun sens —
      // et le serveur ne le sert jamais dans ce cas.
      return null;
    case "mindmap":
      return geste.mindmap_id !== null
        ? `/mindmaps/reconstruire/${geste.mindmap_id}`
        : slug
          ? subjectRouteFor("mindmap", slug)
          : "/mindmaps";
    case "revision":
      return slug ? subjectRouteFor("revision", slug) : "/revision";
    case "mission":
      return "/missions";
    case "renforcer":
      // Sans `skill_id` (cas théorique), la panoplie de la matière reste une réponse honnête.
      return slug ? `/subjects/${encodeURIComponent(slug)}` : null;
  }
}
