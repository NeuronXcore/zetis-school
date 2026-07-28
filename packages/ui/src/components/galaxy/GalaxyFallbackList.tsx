/**
 * Repli sans WebGL (ADR-0024 §6) — obligation de livraison, pas une option.
 *
 * Si le contexte 3D ne démarre pas, Massimo voit ses notions groupées par chapitre avec
 * leur état. La 3D est la belle version ; celle-ci est la version qui ne l'abandonne
 * jamais. Elle sert aussi de cible de test : les cinq états y sont lisibles en texte.
 */
import type { GalaxyEdge, GalaxyNode, GalaxyStatus } from "@zetis/types";
import { starStyle } from "./galaxyTheme";

export interface GalaxyFallbackListProps {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  onNodeClick?: (node: GalaxyNode) => void;
  /** Même filtre que le canvas : sans WebGL, Massimo garde exactement les mêmes moyens. */
  highlightStatus?: GalaxyStatus | null;
}

export function GalaxyFallbackList({
  nodes,
  edges,
  onNodeClick,
  highlightStatus = null,
}: GalaxyFallbackListProps) {
  const chapters = nodes.filter((n) => n.kind === "chapter");
  const skillsById = new Map(nodes.filter((n) => n.kind === "skill").map((n) => [n.id, n]));

  const byChapter = new Map<string, GalaxyNode[]>();
  for (const edge of edges) {
    const skill = skillsById.get(edge.target);
    if (!skill) continue;
    const list = byChapter.get(edge.source) ?? [];
    list.push(skill);
    byChapter.set(edge.source, list);
  }

  return (
    <div className="space-y-4">
      {chapters.map((chapter) => (
        <section key={chapter.id}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zetis-muted">
            {chapter.label}
          </h3>
          <ul className="space-y-1.5">
            {(byChapter.get(chapter.id) ?? []).map((skill) => {
              const style = starStyle(skill.status);
              // Atténué, jamais retiré : la liste garde sa structure sous le filtre.
              const dimmed = Boolean(highlightStatus) && skill.status !== highlightStatus;
              return (
                <li key={skill.id}>
                  <button
                    type="button"
                    onClick={() => onNodeClick?.(skill)}
                    aria-label={`${skill.label} — ${style.label}`}
                    className={
                      "flex w-full items-center gap-3 rounded-xl border bg-zetis-surface px-4 py-3 text-left transition hover:border-zetis-accent-2 " +
                      (dimmed
                        ? "border-zetis-border opacity-35"
                        : highlightStatus
                          ? "border-zetis-accent-2"
                          : "border-zetis-border")
                    }
                  >
                    <span
                      aria-hidden
                      className="inline-block shrink-0 rounded-full"
                      style={{
                        width: 12,
                        height: 12,
                        backgroundColor: style.color,
                        boxShadow: style.glow
                          ? `0 0 ${6 + style.glow * 10}px ${style.color}`
                          : "none",
                      }}
                    />
                    <span className="flex-1 text-sm font-medium">{skill.label}</span>
                    <span className="shrink-0 text-xs text-zetis-muted">{style.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
