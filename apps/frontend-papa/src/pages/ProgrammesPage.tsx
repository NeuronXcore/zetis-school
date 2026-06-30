import { type FormEvent, type ReactNode, useState } from "react";
import { type SubjectDetail, type Theme } from "../lib/subjects";
import { SUBJECT_EMOJI_OPTIONS, subjectEmoji } from "../lib/subjectEmoji";
import { subjectIconFor } from "../lib/subjectIcons";
import { type SubjectsData, useSubjects } from "../hooks/useSubjects";

// Icône d'une matière : image PNG (assets copiés de Massimo) si dispo, sinon emoji.
function SubjectIcon({
  slug,
  fallbackIcon,
  className = "h-10 w-10",
  emojiClassName = "text-2xl",
}: {
  slug: string;
  fallbackIcon?: string | null;
  className?: string;
  emojiClassName?: string;
}) {
  const src = subjectIconFor(slug);
  if (src) {
    return <img src={src} alt="" className={`${className} object-contain`} />;
  }
  return <span className={emojiClassName}>{subjectEmoji(slug, fallbackIcon)}</span>;
}

// Matières & programmes (Papa). Style verre inspiré de la page Matières de Massimo,
// décliné sur l'accent émeraude Papa. Données 100 % live (module backend `subjects`) :
// Subject → Theme → Chapter. Aucune logique métier ici (cf. useSubjects).

const GLASS = "rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur-xl";
const ACCENT_BTN =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-sm font-semibold text-papa-bg shadow-lg shadow-emerald-900/30 transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";
const GHOST_BTN =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-papa-text transition-colors hover:bg-white/10";
const FIELD =
  "w-full rounded-lg border border-papa-border bg-papa-bg/60 px-3 py-2 text-sm text-papa-text placeholder:text-papa-muted focus:border-papa-accent focus:outline-none";

export function ProgrammesPage() {
  const data = useSubjects();

  return (
    <div className="relative isolate -m-6 min-h-full overflow-hidden bg-papa-bg p-6 text-papa-text">
      <Backdrop />
      <div className="relative mx-auto flex max-w-5xl flex-col gap-5">
        <Header count={data.subjects.length} />
        {data.error && (
          <div className="rounded-xl border border-papa-warn/40 bg-papa-warn/10 px-4 py-3 text-sm text-papa-warn">
            {data.error}
          </div>
        )}
        <AddSubjectCard onAdd={data.addSubject} />
        <SubjectsGrid data={data} />
        {data.selectedId !== null && (
          <SubjectDetailPanel
            detail={data.selected}
            loading={data.selectLoading}
            onClose={() => data.select(null)}
            onAddTheme={(d) => data.addTheme(data.selectedId!, d)}
            onAddChapter={data.addChapter}
          />
        )}
      </div>
    </div>
  );
}

// Halos décoratifs (émeraude / sky) — déclinaison Papa du NeonBackdrop Massimo.
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-emerald-600/15 blur-[120px]" />
      <div className="absolute right-1/4 top-1/3 h-80 w-80 rounded-full bg-sky-500/10 blur-[120px]" />
      <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-teal-600/15 blur-[120px]" />
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div className={`${GLASS} p-6`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/80">
        Cockpit pédagogique
      </p>
      <h1 className="mt-1 text-2xl font-bold">Matières &amp; programmes</h1>
      <p className="mt-1 text-sm text-papa-muted">
        Configurer les matières, structurer les thèmes et chapitres du programme.{" "}
        {count} matière{count > 1 ? "s" : ""}.
      </p>
    </div>
  );
}

// Bouton + formulaire repliable « Ajouter une matière ».
function AddSubjectCard({ onAdd }: { onAdd: SubjectsData["addSubject"] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  async function submit() {
    await onAdd({ name, icon: icon || null });
    setName("");
    setIcon("");
  }

  return (
    <div className={`${GLASS} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Ajouter une matière</p>
          <p className="text-xs text-papa-muted">Une matière regroupe des thèmes et des chapitres.</p>
        </div>
        <button type="button" className={open ? GHOST_BTN : ACCENT_BTN} onClick={() => setOpen((v) => !v)}>
          {open ? "Annuler" : "+ Nouvelle matière"}
        </button>
      </div>
      {open && (
        <InlineForm
          submitLabel="Créer la matière"
          disabled={!name.trim()}
          onSubmit={submit}
          className="mt-4"
        >
          <input
            className={FIELD}
            placeholder="Nom (ex : Physique-Chimie)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div>
            <p className="mb-1.5 text-xs text-papa-muted">Emoji (mêmes que Massimo)</p>
            <EmojiPicker value={icon} onChange={setIcon} />
          </div>
        </InlineForm>
      )}
    </div>
  );
}

function SubjectsGrid({ data }: { data: SubjectsData }) {
  if (data.loading) {
    return <p className="text-sm text-papa-muted">Chargement des matières…</p>;
  }
  if (data.subjects.length === 0) {
    return (
      <p className="text-sm text-papa-muted">
        Aucune matière. Crée la première avec « + Nouvelle matière ».
      </p>
    );
  }
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-papa-muted">
        Tes matières
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.subjects.map((s) => {
          const active = s.id === data.selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => data.select(active ? null : s.id)}
              className={`${GLASS} flex flex-col gap-2 p-4 text-left transition-colors ${
                active ? "border-emerald-400/50 bg-emerald-400/10" : "hover:bg-white/[0.07]"
              }`}
            >
              <SubjectIcon slug={s.slug} fallbackIcon={s.icon} />
              <span className="font-semibold leading-tight">{s.name}</span>
              <span className="text-xs text-papa-muted">
                {s.theme_count} thème{s.theme_count > 1 ? "s" : ""} · {s.chapter_count} chapitre
                {s.chapter_count > 1 ? "s" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Panneau de détail : thèmes + chapitres + ajout de thème/chapitre.
function SubjectDetailPanel({
  detail,
  loading,
  onClose,
  onAddTheme,
  onAddChapter,
}: {
  detail: SubjectDetail | null;
  loading: boolean;
  onClose: () => void;
  onAddTheme: (data: { name: string; description?: string | null }) => Promise<void>;
  onAddChapter: SubjectsData["addChapter"];
}) {
  return (
    <section className={`${GLASS} p-5`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          {detail ? (
            <>
              <SubjectIcon
                slug={detail.slug}
                fallbackIcon={detail.icon}
                className="h-7 w-7"
                emojiClassName="text-xl"
              />
              {detail.name}
            </>
          ) : (
            "Chargement…"
          )}
        </h2>
        <button type="button" className={GHOST_BTN} onClick={onClose}>
          Fermer
        </button>
      </div>

      {loading && <p className="text-sm text-papa-muted">Chargement du programme…</p>}

      {detail && !loading && (
        <div className="flex flex-col gap-4">
          {detail.themes.length === 0 && (
            <p className="text-sm text-papa-muted">
              Aucun thème pour l'instant. Ajoute le premier ci-dessous.
            </p>
          )}
          {detail.themes.map((theme) => (
            <ThemeBlock key={theme.id} theme={theme} onAddChapter={onAddChapter} />
          ))}
          <AddThemeForm onAddTheme={onAddTheme} />
        </div>
      )}
    </section>
  );
}

function ThemeBlock({
  theme,
  onAddChapter,
}: {
  theme: Theme;
  onAddChapter: SubjectsData["addChapter"];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("");

  async function submit() {
    await onAddChapter(theme.id, { name, period: period || null });
    setName("");
    setPeriod("");
    setOpen(false);
  }

  return (
    <div className="rounded-2xl border border-papa-border bg-papa-surface/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{theme.name}</p>
          {theme.description && <p className="text-xs text-papa-muted">{theme.description}</p>}
        </div>
        <button type="button" className={GHOST_BTN} onClick={() => setOpen((v) => !v)}>
          {open ? "Annuler" : "+ Chapitre"}
        </button>
      </div>

      {theme.chapters.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {theme.chapters.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg bg-papa-bg/50 px-3 py-2 text-sm"
            >
              <span>{c.name}</span>
              <span className="text-xs text-papa-muted">
                {c.period ? `${c.period} · ` : ""}
                {c.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-papa-muted">Aucun chapitre.</p>
      )}

      {open && (
        <InlineForm
          submitLabel="Ajouter le chapitre"
          disabled={!name.trim()}
          onSubmit={submit}
          className="mt-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
            <input
              className={FIELD}
              placeholder="Nom du chapitre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <input
              className={FIELD}
              placeholder="Période (ex : Trimestre 1)"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
        </InlineForm>
      )}
    </div>
  );
}

function AddThemeForm({
  onAddTheme,
}: {
  onAddTheme: (data: { name: string; description?: string | null }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit() {
    await onAddTheme({ name, description: description || null });
    setName("");
    setDescription("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className={ACCENT_BTN} onClick={() => setOpen(true)}>
        + Ajouter un thème
      </button>
    );
  }

  return (
    <InlineForm submitLabel="Créer le thème" disabled={!name.trim()} onSubmit={submit}>
      <div className="flex flex-col gap-3">
        <input
          className={FIELD}
          placeholder="Nom du thème (ex : Nombres et calculs)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          className={FIELD}
          placeholder="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </InlineForm>
  );
}

// Sélecteur d'emoji : palette alignée sur les matières de Massimo.
function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUBJECT_EMOJI_OPTIONS.map((emoji) => {
        const active = value === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onChange(active ? "" : emoji)}
            aria-pressed={active}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors ${
              active
                ? "border-emerald-400/60 bg-emerald-400/15"
                : "border-papa-border bg-papa-bg/60 hover:bg-white/10"
            }`}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}

// Formulaire générique : gère soumission, état d'envoi et erreur locale.
function InlineForm({
  children,
  submitLabel,
  disabled,
  onSubmit,
  className = "",
}: {
  children: ReactNode;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: () => Promise<void>;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSubmit();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handle} className={`flex flex-col gap-3 ${className}`}>
      {children}
      {err && <p className="text-xs text-papa-warn">{err}</p>}
      <div>
        <button type="submit" className={ACCENT_BTN} disabled={disabled || saving}>
          {saving ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
