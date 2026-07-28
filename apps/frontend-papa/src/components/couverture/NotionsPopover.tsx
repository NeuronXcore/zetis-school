// Détail d'une colonne NOTION-centrée : quelles notions de la leçon portent quoi, et par où agir.
//
// Sans ce détail, un clic sur « 1/3 » générerait à l'aveugle. Ici Papa voit *laquelle* manque
// avant de lancer quoi que ce soit — la page reste une page de lecture qui propose des actions,
// pas une page qui agit à sa place.
//
// Deux objets, deux traitements, parce que leur nature diffère :
// - **carte de révision** : mécanique (recto/verso extraits du cours) → un clic suffit ;
// - **capsule** : elle exige une INSTRUCTION que Papa seul peut écrire (`instruction` est
//   obligatoire côté API). On ouvre donc le compositeur pré-rempli, on n'invente pas la commande.
import { Link } from "react-router-dom";
import { Badge } from "@zetis/ui";
import { type CoverageNotionItem } from "@zetis/types";

export function NotionsPopover({
  column,
  lessonTitle,
  items,
  subjectId,
  chapterId,
  busySkillId,
  onGenerateCards,
  onClose,
}: {
  column: "cards" | "capsules";
  lessonTitle: string;
  items: CoverageNotionItem[];
  subjectId: number;
  chapterId: number;
  busySkillId: number | null;
  onGenerateCards: (skillId: number) => void;
  onClose: () => void;
}) {
  const isCards = column === "cards";
  const covers = (item: CoverageNotionItem) => (isCards ? item.has_card : item.has_capsule);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[420px] max-w-full rounded-xl border border-papa-border bg-papa-surface p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={isCards ? "Cartes de révision par notion" : "Capsules par notion"}
      >
        <h4 className="text-[13px] font-bold">
          {isCards ? "Cartes de révision" : "Capsules IA"} — par notion
        </h4>
        <p className="mb-3 mt-1 text-[11.5px] leading-relaxed text-papa-muted">
          Notions enseignées par « {lessonTitle} ». Ces objets sont rattachés à la{" "}
          <b className="text-papa-text">notion</b>, pas à la leçon : une notion couverte ici peut
          l'avoir été depuis le cours d'une autre leçon.
        </p>

        {items.length === 0 ? (
          <p className="rounded-lg border border-papa-border bg-papa-bg/50 px-3 py-4 text-center text-[12px] text-papa-muted">
            Aucune notion rattachée à cette leçon — rien à générer.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => {
              const done = covers(item);
              const busy = busySkillId === item.skill_id;
              return (
                <li
                  key={item.skill_id}
                  className="flex items-center gap-2 rounded-lg border border-papa-border/70 bg-papa-bg/40 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{item.name}</span>
                  {done ? (
                    // Couverte ≠ rien à faire : on doit pouvoir aller VOIR l'objet.
                    <Link
                      to={
                        isCards
                          ? `/cartes-revision?subject=${subjectId}&focus=${item.skill_id}`
                          : `/capsules?skill=${item.skill_id}&name=${encodeURIComponent(item.name)}`
                      }
                      title={
                        isCards
                          ? "Ouvrir les cartes de cette notion"
                          : "Voir les capsules de cette notion"
                      }
                      className="shrink-0 rounded-full transition-opacity hover:opacity-80"
                    >
                      <Badge variant="success">✓ couverte →</Badge>
                    </Link>
                  ) : isCards ? (
                    <button
                      type="button"
                      onClick={() => onGenerateCards(item.skill_id)}
                      disabled={busy || busySkillId !== null}
                      className="shrink-0 rounded-lg bg-papa-accent px-2.5 py-1 text-xs font-semibold text-papa-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? "Génération…" : "Générer"}
                    </button>
                  ) : (
                    // Le compositeur, pré-rempli. `skill` est indispensable : sans lui la
                    // capsule ne serait rattachée à aucune notion et ne compterait jamais ici.
                    <Link
                      to={`/capsules?subject=${subjectId}&chapter=${chapterId}&skill=${item.skill_id}&name=${encodeURIComponent(item.name)}&compose=1`}
                      className="shrink-0 rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
                      title="Ouvrir le compositeur — tu écris l'instruction, ZETIS ne l'invente pas"
                    >
                      Composer…
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!isCards && (
          <p className="mt-3 text-[11px] leading-relaxed text-papa-muted">
            ⓘ Une capsule ne compte comme couverte qu'une fois <b>validée et rendue en MP4</b> :
            générer le script ne suffit pas, il reste la voix et le rendu.
          </p>
        )}
      </div>
    </div>
  );
}
