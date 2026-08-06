import { Button, Spinner } from "@zetis/ui";
import { type ChampionFlavor, type ChampionNotion } from "../lib/missionsPilotage";
import { type UseChampionMission } from "../hooks/useChampionMission";
import { ProgressBar } from "./ProgressBar";
import { subjectEmoji } from "../lib/subjectEmoji";
import { useProgressionEstimee } from "../hooks/useEstimations";

// Modale « Défi champion » (ADR-0022). Purement présentationnelle : la résolution des notions
// (classement par saveur, décochage, plafond) et l'équipement (ADR-0021) vivent côté serveur ;
// ici on n'orchestre que saveur + scope (≥ 2 matières) → preview → (dé)cochage → confirm → récap.

const FLAVORS: { key: ChampionFlavor; icon: string; title: string; sub: string }[] = [
  { key: "boss", icon: "🏆", title: "Boss", sub: "Notions bien maîtrisées — célébrer la force" },
  { key: "consolidation", icon: "🔧", title: "Consolidation", sub: "Notions à renforcer, regroupées" },
  { key: "mix", icon: "⚡", title: "Mix", sub: "Socle solide + un défi à pousser" },
];

function masteryBadge(n: ChampionNotion): { label: string; cls: string } {
  if (n.mastery < 0.5)
    return { label: `fragile ${n.mastery.toFixed(2)}`, cls: "bg-rose-500/15 text-rose-300" };
  if (n.mastery < 0.8)
    return { label: `moyen ${n.mastery.toFixed(2)}`, cls: "bg-amber-500/15 text-amber-300" };
  return { label: `solide ${n.mastery.toFixed(2)}`, cls: "bg-emerald-500/15 text-emerald-300" };
}

export function ChampionMissionModal({ champ }: { champ: UseChampionMission }) {
  // Barre estimée pendant l'équipement (opération LLM longue) : ~1 min par notion cochée.
  // Un champion équipe N notions : la durée UNITAIRE est mesurée, le facteur la multiplie.
  const pct = useProgressionEstimee(champ.busy, "equip_notion", {
    facteur: champ.checked.size,
  });
  if (!champ.open) return null;
  const atCap = champ.checked.size >= champ.maxSkills;
  const subjectsChecked = new Set(
    (champ.preview?.notions ?? [])
      .filter((n) => champ.checked.has(n.skill_id))
      .map((n) => n.subject_id),
  ).size;
  // Notions groupées par matière (l'ordre de saveur est déjà appliqué serveur).
  const bySubject = new Map<number, ChampionNotion[]>();
  for (const n of champ.preview?.notions ?? []) {
    const list = bySubject.get(n.subject_id) ?? [];
    list.push(n);
    bySubject.set(n.subject_id, list);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-10"
      onClick={champ.closeModal}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-papa-border bg-papa-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-bold text-papa-text">🏆 Défi champion</h2>
          <button
            type="button"
            onClick={champ.closeModal}
            className="text-xl leading-none text-papa-muted hover:text-papa-text"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-papa-muted">
          Un parcours unique qui croise <strong>au moins 2 matières</strong> et enchaîne plusieurs
          outils (carte mentale, quiz, ELI5). ZETIS équipe chaque notion puis compose le défi. Rien
          n'est créé avant confirmation.
        </p>

        {/* ================= RÉCAP après création ================= */}
        {champ.result ? (
          <ChampionRecap champ={champ} />
        ) : champ.busy ? (
          <div className="py-6">
            <ProgressBar pct={pct} label="Équipement des notions puis composition du défi…" />
            <p className="mt-3 text-center text-xs text-papa-muted">
              Génération locale (cours, fiche, cartes, quiz, carte mentale) — cela peut prendre
              quelques minutes.
            </p>
          </div>
        ) : (
          <>
            {/* Saveur */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              {FLAVORS.map((f) => {
                const active = champ.flavor === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => champ.setFlavor(f.key)}
                    className={[
                      "rounded-xl border p-2.5 text-left transition-colors",
                      active
                        ? "border-papa-accent bg-papa-accent/10"
                        : "border-papa-border hover:bg-papa-surface-2",
                    ].join(" ")}
                  >
                    <div className="text-sm font-bold text-papa-text">
                      {f.icon} {f.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-papa-muted">{f.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Scope : matières (≥ 2) */}
            <div className="mb-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-papa-muted">
                Matières à croiser (au moins 2)
              </div>
              {champ.loadingSubjects ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {champ.subjects.map((s) => {
                    const on = champ.selectedSubjects.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => champ.toggleSubject(s.id)}
                        className={[
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          on
                            ? "border-papa-accent bg-papa-accent/15 font-semibold text-papa-accent"
                            : "border-papa-border text-papa-muted hover:text-papa-text",
                        ].join(" ")}
                      >
                        {subjectEmoji(s.slug, s.icon)} {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notions résolues (groupées par matière) */}
            {champ.loadingPreview ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : champ.selectedSubjects.size < 2 ? (
              <p className="mb-4 rounded-xl border border-dashed border-papa-border px-3 py-6 text-center text-sm text-papa-muted">
                Sélectionnez au moins 2 matières pour résoudre les notions du défi.
              </p>
            ) : champ.preview ? (
              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-papa-muted">
                    Notions résolues — décochez ce qui ne convient pas
                  </span>
                  {atCap && (
                    <span className="text-[11px] text-amber-300">max {champ.maxSkills} notions</span>
                  )}
                </div>
                {champ.preview.notions.length === 0 ? (
                  <p className="rounded-xl border border-papa-border px-3 py-4 text-sm text-papa-muted">
                    Aucune notion travaillée dans ces matières — fais quelques activités d'abord.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {[...bySubject.entries()].map(([subjectId, notions]) => (
                      <div key={subjectId}>
                        <div className="mb-1 text-xs font-semibold text-papa-text">
                          {notions[0].subject_name}
                        </div>
                        <div className="divide-y divide-papa-border overflow-hidden rounded-xl border border-papa-border">
                          {notions.map((n) => {
                            const badge = masteryBadge(n);
                            const isChecked = champ.checked.has(n.skill_id);
                            const disabled = !isChecked && atCap;
                            return (
                              <label
                                key={n.skill_id}
                                className={`flex items-center gap-3 px-3 py-2 text-sm ${disabled ? "opacity-45" : "cursor-pointer"}`}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-papa-accent"
                                  checked={isChecked}
                                  disabled={disabled}
                                  onChange={() => champ.toggleNotion(n.skill_id)}
                                />
                                <span className="flex-1 text-papa-text">
                                  {n.name}
                                  {n.level ? <span className="text-papa-muted"> · {n.level}</span> : null}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 rounded-lg border-l-2 border-papa-accent bg-papa-accent/5 px-3 py-1.5 text-xs text-papa-muted">
                  {champ.checked.size >= 2 && subjectsChecked >= 2
                    ? `Défi sur ${champ.checked.size} notions de ${subjectsChecked} matières — parcours 🧠→❓→💡 par notion, XP majoré.`
                    : "Coche au moins 2 notions réparties sur 2 matières pour composer le défi."}
                </p>
              </div>
            ) : null}

            {champ.error && (
              <p className="mb-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
                {champ.error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={champ.closeModal} className="border border-papa-border">
                Annuler
              </Button>
              <Button
                onClick={() => void champ.confirm()}
                disabled={champ.checked.size < 2 || subjectsChecked < 2}
              >
                🏆 Créer le défi
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChampionRecap({ champ }: { champ: UseChampionMission }) {
  const result = champ.result;
  if (!result) return null;
  const mission = result.mission;
  return (
    <div>
      {mission && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="text-sm font-bold text-emerald-200">✅ {mission.title} — créé</div>
          <div className="mt-0.5 text-xs text-papa-muted">
            {mission.steps.length} étapes · validé, visible pour Massimo dans son deck « Défi champion ».
          </div>
        </div>
      )}
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-papa-muted">
        Équipement par notion
      </div>
      <div className="divide-y divide-papa-border overflow-hidden rounded-xl border border-papa-border">
        {result.equipment.map((e) => (
          <div key={e.skill_id} className="px-3 py-2 text-sm">
            <div className="font-medium text-papa-text">
              {e.has_lesson ? "📦" : "⚠️"} {e.skill_name}
            </div>
            <div className="mt-0.5 text-xs text-papa-muted">
              {e.reason
                ? e.reason
                : [
                    e.generated.length ? `généré : ${e.generated.join(", ")}` : null,
                    e.skipped.length ? `déjà là : ${e.skipped.join(", ")}` : null,
                    e.errors.length ? `échecs : ${e.errors.map((x) => x.piece).join(", ")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "rien à générer"}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-papa-muted">
        Le contenu généré est auto-validé (votre confirmation vaut approbation, ADR-0021). Vous
        pouvez le rééditer via les pages Fiches / Quiz / Cartes mentales.
      </p>
      <div className="mt-4 flex justify-end">
        <Button onClick={champ.closeModal}>Fermer</Button>
      </div>
    </div>
  );
}
