// Panneau « ⚡ Autonomie de ZETIS » (ADR-0032, spec `docs/frontend-papa/page-parametres.md`).
//
// Quatre blocs, dans cet ordre et pas un autre : état des lieux → régime → détail → veto.
//
// Trois refus qui expliquent le code :
//
// 1. **Pas d'auto-save.** Un réglage d'autonomie ne se change pas par inadvertance au survol.
//    Brouillon local, bouton explicite, « Annuler » qui revient à l'état serveur.
// 2. **Aucune valeur par défaut inventée.** À l'erreur de lecture, on affiche l'erreur et AUCUN
//    réglage : un régime faux affiché une seconde est un mensonge, et celui-là engage ce que
//    Massimo reçoit.
// 3. **La monotonie est appliquée localement ET côté serveur.** Ici pour que l'écran ne montre
//    jamais un état incohérent entre deux clics ; là-bas parce que c'est le serveur qui décide.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, ConfirmDialog } from "@zetis/ui";
import { type Autonomy, type AutonomyLevel, type AutonomyPreset } from "@zetis/types";

import {
  A1_COURSE_KEY,
  SERVE,
  fetchAutonomy,
  levelsForPreset,
  saveAutonomy,
} from "../../lib/settings";
import { ClassRow } from "./ClassRow";
import { PresetCards } from "./PresetCards";
import { RegimeToday } from "./RegimeToday";

type Draft = Record<string, AutonomyLevel>;

/** Miroir client de `apply_monotonicity` : servir un cours sans relecture force les dérivés au
 *  même régime. On ne relit pas un dérivé d'un cours qu'on n'a pas relu. */
function withMonotonicity(draft: Draft, classes: Autonomy["classes"]): Draft {
  if (draft[A1_COURSE_KEY] !== SERVE) return draft;
  const derives = classes.find((c) => c.code === "A0a");
  return derives ? { ...draft, [derives.key]: SERVE } : draft;
}

function draftOf(autonomy: Autonomy): Draft {
  return Object.fromEntries(autonomy.classes.map((c) => [c.key, c.value]));
}

/** Le régime du BROUILLON — dérivé comme le serveur dérive celui de l'état enregistré.
 *
 * Ne prend PAS l'`Autonomy` : un régime se lit dans les valeurs, jamais dans les verrous. Un
 * brouillon reste « Manuel » même si le serveur venait à verrouiller une classe entre-temps. */
function presetOfDraft(draft: Draft): AutonomyPreset | null {
  for (const preset of ["manuel", "semi", "autonome"] as AutonomyPreset[]) {
    const levels = levelsForPreset(preset);
    if (Object.entries(levels).every(([key, value]) => draft[key] === value)) return preset;
  }
  return null;
}

export function AutonomyPanel() {
  const [autonomy, setAutonomy] = useState<Autonomy | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Le passage du cours en « ZETIS sert » retire le dernier contrôle humain : il se confirme.
  // Le passage INVERSE n'a aucune friction — on ne freine pas un retour au contrôle.
  const [pending, setPending] = useState<Draft | null>(null);
  // État PROPRE, jamais mêlé au brouillon des paliers : le fusionner ferait qu'un préréglage
  // l'armerait au passage — exactement ce que l'ADR-0035 §5 refuse.
  const [autoTrigger, setAutoTrigger] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAutonomy()
      .then((data) => {
        if (!alive) return;
        setAutonomy(data);
        setDraft(draftOf(data));
        setAutoTrigger(data.auto_trigger_enabled);
      })
      .catch(() => alive && setError("Réglages illisibles — rien n'est affiché tant qu'ils le sont."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const preset = useMemo(() => (autonomy ? presetOfDraft(draft) : null), [autonomy, draft]);
  const dirty = useMemo(
    () =>
      Boolean(autonomy) &&
      (Object.entries(draft).some(([k, v]) => draftOf(autonomy!)[k] !== v) ||
        autonomy!.auto_trigger_enabled !== autoTrigger),
    [autonomy, draft, autoTrigger],
  );

  const propose = useCallback(
    (next: Draft) => {
      if (!autonomy) return;
      const resolved = withMonotonicity(next, autonomy.classes);
      const raising =
        resolved[A1_COURSE_KEY] === SERVE && draft[A1_COURSE_KEY] !== SERVE;
      if (raising) setPending(resolved);
      else setDraft(resolved);
    },
    [autonomy, draft],
  );

  const persist = useCallback(() => {
    if (!autonomy) return;
    setSaving(true);
    setError(null);
    saveAutonomy(draft, autoTrigger)
      .then((fresh) => {
        setAutonomy(fresh);
        setDraft(draftOf(fresh));
        setAutoTrigger(fresh.auto_trigger_enabled);
      })
      .catch((cause: unknown) => {
        // Le serveur DIT pourquoi il refuse (422 motivé) : on relaie son message tel quel, et on
        // revient à l'état enregistré — un brouillon refusé qui resterait à l'écran laisserait
        // croire qu'il est actif.
        setError(cause instanceof Error ? cause.message : "Enregistrement refusé.");
        setDraft(draftOf(autonomy));
        setAutoTrigger(autonomy.auto_trigger_enabled);
      })
      .finally(() => setSaving(false));
  }, [autonomy, draft, autoTrigger]);

  return (
    <section className="mt-4 rounded-xl border border-papa-border bg-papa-surface p-5">
      <h2 className="flex items-center gap-2 text-[14.5px] font-bold">
        <span aria-hidden>⚡</span> Autonomie de ZETIS
        {preset === null && !loading && autonomy && (
          <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10.5px] font-bold text-sky-300">
            Sur mesure
          </span>
        )}
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-papa-muted">
        Jusqu'où ZETIS produit le contenu de Massimo tout seul. Le réglage se dose{" "}
        <b className="text-papa-text">par type de contenu</b> — le coût d'une erreur n'est pas le
        même sur une fiche et sur un cours.
      </p>

      <div className="mt-5">
        <RegimeToday />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-400/40 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-papa-muted">Lecture des réglages…</p>
      ) : autonomy ? (
        <>
          <h3 className="mt-6 text-[12.5px] font-bold">Régime</h3>
          <PresetCards
            autonomy={autonomy}
            current={preset}
            onPick={(picked) => propose({ ...draft, ...levelsForPreset(picked) })}
          />

          <details className="mt-4 rounded-xl border border-papa-border bg-papa-bg">
            <summary className="cursor-pointer px-4 py-3 text-[12.5px] font-semibold text-papa-muted">
              Détail par type de contenu
            </summary>
            <div className="px-4 pb-1">
              {autonomy.classes.map((cls) => (
                <ClassRow
                  key={cls.key}
                  cls={cls}
                  value={draft[cls.key]}
                  onChange={(level) => propose({ ...draft, [cls.key]: level })}
                />
              ))}
            </div>
          </details>

          <div className="mt-4 flex items-start gap-3.5 rounded-xl border border-papa-border bg-papa-bg p-3.5">
            <span aria-hidden className="text-lg leading-none">
              ↩️
            </span>
            <div>
              <b className="text-[13px]">Vous pouvez retirer ce que ZETIS a servi</b>
              <p className="mt-1 text-[12px] leading-relaxed text-papa-muted">
                Tant que Massimo ne l'a pas ouvert, un contenu se retire{" "}
                <b className="text-papa-text">sans trace et sans qu'il le sache</b>. Une fois
                ouvert, il ne se retire plus — il se corrige. Rien à faire pour accepter : le
                silence vaut accord.
              </p>
              {/* La page des réglages RENVOIE, elle n'énumère pas : une liste ici en referait un
                  compteur, et le §F.2 l'interdit. */}
              <p className="mt-2">
                {/* ⚠️ Pointait vers `/couverture` jusqu'au 2026-08-03 — écrit avant que le Journal
                    existe, alors que l'ADR-0032 §4 avait DÉJÀ tranché « le veto s'exerce sur le
                    Journal, pas sur la Couverture ». La Couverture est une matrice d'état
                    (« qu'est-ce qui manque ») ; le veto a besoin d'un flux daté. */}
                <Link
                  to="/journal"
                  className="text-[12px] font-semibold text-papa-accent hover:underline"
                >
                  📓 Voir ce que ZETIS a servi →
                </Link>
              </p>
            </div>
          </div>

          {/* ⚠️ SOUS les six classes, et visuellement SÉPARÉ d'elles : ce n'est pas un septième
              palier, c'est une autre question (ADR-0035 §5). Le palier dit si ZETIS peut SERVIR
              sans relecture ; ceci dit s'il peut DÉMARRER sans clic. Les préréglages ne le
              touchent jamais. */}
          <div className="mt-4 flex items-start gap-3.5 rounded-xl border border-papa-border bg-papa-bg p-3.5">
            <span aria-hidden className="text-lg leading-none">
              ⏰
            </span>
            <div className="min-w-0 flex-1">
              <b className="text-[13px]">ZETIS peut démarrer sans vous</b>
              <p className="mt-1 text-[12px] leading-relaxed text-papa-muted">
                Quand un <b className="text-papa-text">contrôle</b> approche et qu'il est rattaché à
                un chapitre, ZETIS prépare ce chapitre sans attendre votre clic. Il ne démarre
                jamais pendant que Massimo travaille, et au plus{" "}
                <b className="text-papa-text">deux fois par semaine</b>.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-papa-muted">
                C'est une question <b className="text-papa-text">différente</b> des réglages
                ci-dessus : ceux-là disent ce que ZETIS peut servir sans relecture, celui-ci dit
                s'il peut se mettre au travail seul.
              </p>
              <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12px] font-semibold">
                <input
                  type="checkbox"
                  checked={autoTrigger}
                  disabled={saving}
                  onChange={(e) => setAutoTrigger(e.target.checked)}
                />
                Laisser ZETIS démarrer seul
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!dirty || saving}
              title={dirty ? undefined : "Aucune modification à annuler"}
              onClick={() => {
                setDraft(draftOf(autonomy));
                setAutoTrigger(autonomy.auto_trigger_enabled);
              }}
            >
              Annuler
            </Button>
            <Button
              disabled={!dirty || saving}
              title={dirty ? undefined : "Aucune modification à enregistrer"}
              onClick={persist}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        tone="important"
        title="⚠️ Vous retirez le dernier contrôle humain"
        confirmLabel="Je comprends, laisser ZETIS servir"
        cancelLabel="Garder mon contrôle"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) setDraft(pending);
          setPending(null);
        }}
      >
        <p>
          Aujourd'hui, le cours est{" "}
          <b className="text-papa-text">le seul contenu de ZETIS qui passe devant vous</b> avant
          d'atteindre Massimo. Les fiches, les cartes, les quiz partent déjà sans relecture.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>ZETIS rédige et publie le cours ; Massimo peut le lire dans la minute ;</li>
          <li>
            chaque cours reste marqué{" "}
            <b className="text-papa-text">« servi par une règle que vous avez posée »</b> ;
          </li>
          <li>vous pouvez le retirer tant que Massimo ne l'a pas ouvert, sans trace ;</li>
          <li>
            revenir en arrière arrête la suite —{" "}
            <b className="text-papa-text">ça ne retire pas ce qui est déjà servi</b>.
          </li>
        </ul>
      </ConfirmDialog>
    </section>
  );
}
