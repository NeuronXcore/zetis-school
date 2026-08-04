// Boîte de réception « Demandes de Massimo » (addendum ADR-0027) — file UNIFIÉE.
//
// Quand ZETIS n'a pas de quoi répondre à Massimo, il enregistre une demande ici. Deux natures :
// - « À ajouter au programme » : une notion HORS-PROGRAMME (`notion_requests`) → Papa l'ajoute
//   (Skill) ou crée directement la leçon (via les ponts réutilisant skills-backfill / leçon manuelle).
// - « Contenu à créer » : une notion DU programme dont un contenu manque (`content_requests`) → Papa
//   le produit dans la Couverture. Les mutations passent par ces modules, jamais par `production`.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { type ContentRequest, type ContentRequestStatus } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import {
  CONTENT_KIND_LABEL,
  fetchContentRequests,
  setContentRequestStatus,
} from "../lib/contentRequests";
import {
  fetchNotionRequests,
  resolveNotionRequest,
  type NotionRequest,
} from "../lib/notionRequests";
import { NotionRequestActionModal } from "../components/demandes/NotionRequestActionModal";
import { ProductionProgress } from "../components/demandes/ProductionProgress";
import { ProgressBar } from "../components/ProgressBar";
import { produceForRequest } from "../lib/production";
import { notifyDemandesChanged } from "../lib/demandesEvents";

export function DemandesPage() {
  const [content, setContent] = useState<ContentRequest[]>([]);
  const [notions, setNotions] = useState<NotionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ request: NotionRequest; mode: "add" | "lesson" } | null>(null);
  // Notions entrées au programme mais qu'aucune leçon ne porte : ZETIS ne produira rien pour
  // elles. Verdict du SERVEUR, jamais déduit ici — une notion déjà rattachée n'y figure pas.
  const [orphelines, setOrphelines] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [c, n] = await Promise.all([
        fetchContentRequests("pending"),
        fetchNotionRequests("pending"),
      ]);
      // La file a-t-elle MAIGRI sans que Papa ne trie ? C'est le serveur qui a refermé ce qui est
      // devenu disponible — la pastille de la sidebar doit suivre, sinon elle annonce « 1 » devant
      // une page vide. On n'émet que sur un vrai changement : l'événement sert à réveiller, pas à
      // battre la mesure.
      setContent((avant) => {
        if (c.length !== avant.length) notifyDemandesChanged();
        return c;
      });
      setNotions(n);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement des demandes échoué");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ⚠️ **La file se relit quand Papa REVIENT.** Le serveur referme désormais ce qui est devenu
  // disponible à chaque ouverture de la file — mais un onglet resté ouvert ne l'apprenait jamais,
  // et c'est précisément le parcours que cette page crée : « Écrire le cours → » envoie Papa sur
  // Programme, il écrit, il revient… et il retrouvait la même ligne, comme si son geste n'avait
  // servi à rien.
  //
  // ⚠️ **Sur le RETOUR, pas au chronomètre.** Un sondage ferait travailler une page que personne
  // ne regarde ; ici l'événement est exactement le moment où la réponse peut avoir changé, et il
  // ne coûte rien le reste du temps. Un rafraîchissement périodique serait à ajouter le jour où
  // une production démarrerait seule pendant que Papa regarde l'écran — pas avant.
  useEffect(() => {
    const revenir = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", revenir);
    document.addEventListener("visibilitychange", revenir);
    return () => {
      window.removeEventListener("focus", revenir);
      document.removeEventListener("visibilitychange", revenir);
    };
  }, [reload]);

  const triageContent = useCallback(async (id: number, status: ContentRequestStatus) => {
    setContent((cur) => cur.filter((r) => r.id !== id)); // optimiste
    try {
      await setContentRequestStatus(id, status);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Triage échoué");
      await reload();
    }
  }, [reload]);

  // Demandes dont la production tourne : `id de demande → id de lot`. ⚠️ **La ligne ne disparaît
  // PAS** : rien n'est encore fermé. C'est la DISPONIBILITÉ du contenu qui refermera la demande
  // (ADR-0036 §4). La retirer d'ici rejouerait le mensonge que le §4 tue — « c'est fait » alors
  // que le worker n'a pas commencé.
  const [runs, setRuns] = useState<Record<number, { id: number; kind: string } | null>>({});

  const produce = useCallback(async (id: number) => {
    setError(null);
    setRuns((cur) => ({ ...cur, [id]: null })); // null = lot demandé, réponse pas encore revenue
    try {
      const run = await produceForRequest(id);
      // ⚠️ On prend le `scope_kind` DU LOT, pas le `content_kind` de la demande : la traduction
      // `card → srs` vit côté serveur et n'a pas à être recopiée ici.
      setRuns((cur) => ({ ...cur, [id]: { id: run.id, kind: run.scope_kind ?? "" } }));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Lancement de la production échoué");
      setRuns((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
    }
  }, []);

  // Le lot est fini : on relit la file. Si le contenu est réellement servable, le serveur a déjà
  // refermé la demande (§4) et la ligne s'en va d'elle-même — sur un FAIT, pas sur un clic.
  const onRunFinished = useCallback(async () => {
    await reload();
    setRuns({});
  }, [reload]);

  const dismissNotion = useCallback(async (id: number) => {
    setNotions((cur) => cur.filter((r) => r.id !== id));
    try {
      await resolveNotionRequest(id, "dismissed");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Triage échoué");
      await reload();
    }
  }, [reload]);

  const contentBySubject = useMemo(() => {
    const groups = new Map<string, { subjectId: number | null; items: ContentRequest[] }>();
    for (const req of content) {
      const key = req.subject_name ?? "Autres";
      const g = groups.get(key) ?? { subjectId: req.subject_id, items: [] };
      g.items.push(req);
      groups.set(key, g);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [content]);

  const empty = content.length === 0 && notions.length === 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Demandes de Massimo"
        subtitle="Ce que Massimo a réclamé dans le chat sans le trouver. À ajouter, à créer, ou à écarter."
        icon={<span aria-hidden className="text-2xl">📥</span>}
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-400/40 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* ⚠️ Verdict SERVEUR, affiché seulement quand il est vrai : une notion déjà portée par une
          leçon n'y figure pas. Un avertissement systématique s'apprend à s'ignorer.
          Le geste qui répare est à côté du constat — sinon il désigne un problème sans issue. */}
      {orphelines.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-500/5 px-4 py-3 text-[12.5px] text-amber-200">
          <b className="text-papa-text">
            {orphelines.length === 1 ? "Notion ajoutée" : "Notions ajoutées"} sans leçon :
          </b>{" "}
          {orphelines.map((n) => `« ${n} »`).join(", ")}. ZETIS ne produira rien pour{" "}
          {orphelines.length === 1 ? "elle" : "elles"} tant qu'aucune leçon ne{" "}
          {orphelines.length === 1 ? "la" : "les"} porte.{" "}
          <Link to="/programme" className="font-semibold underline">
            Les rattacher dans le Programme →
          </Link>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-papa-muted">Chargement…</p>
      ) : empty ? (
        <div className="rounded-xl border border-papa-border bg-papa-surface px-4 py-10 text-center">
          <p className="text-3xl" aria-hidden>✅</p>
          <p className="mt-2 text-sm font-medium">Aucune demande en attente.</p>
          <p className="mt-1 text-xs text-papa-muted">
            Quand Massimo réclamera quelque chose que ZETIS n'a pas, il apparaîtra ici.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1 : notions hors-programme à ajouter */}
          {notions.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-bold">📚 À ajouter au programme</h2>
              <p className="mb-3 text-[12px] text-papa-muted">
                Notions que Massimo a demandées mais qui ne sont pas (encore) à son programme. Ajoute
                la notion, crée la leçon, ou écarte si ce n'est pas de son niveau.
              </p>
              <ul className="space-y-2">
                {notions.map((req) => (
                  <li
                    key={req.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-papa-border bg-papa-surface px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      « {req.text} »
                    </span>
                    <button
                      type="button"
                      onClick={() => setModal({ request: req, mode: "add" })}
                      className="shrink-0 rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
                      title="Ajouter la notion au programme (elle devient réelle ; le cours suit)"
                    >
                      + Programme
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ request: req, mode: "lesson" })}
                      className="shrink-0 rounded-lg bg-papa-accent px-2.5 py-1 text-xs font-semibold text-papa-bg transition-opacity hover:opacity-90"
                      title="Créer directement une leçon pour cette notion"
                    >
                      Créer la leçon
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismissNotion(req.id)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-papa-muted hover:text-papa-text"
                      title="Écarter (hors niveau / non pertinent)"
                    >
                      Ignorer
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Section 2 : contenu manquant sur une notion du programme */}
          {content.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-bold">🗒️ Contenu à créer</h2>
              <p className="mb-3 text-[12px] text-papa-muted">
                Notions déjà au programme dont un contenu manque. ZETIS peut le produire d'ici — la
                demande se refermera d'elle-même quand le contenu sera réellement consultable.
              </p>
              <div className="space-y-4">
                {contentBySubject.map(([subjectName, group]) => (
                  <div key={subjectName}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[12.5px] font-bold text-papa-muted">{subjectName}</h3>
                      <Link
                        to={group.subjectId ? `/couverture?subject=${group.subjectId}` : "/couverture"}
                        className="text-xs font-semibold text-papa-accent hover:underline"
                      >
                        Produire dans la Couverture →
                      </Link>
                    </div>
                    <ul className="space-y-2">
                      {group.items.map((req) => (
                        <li
                          key={req.id}
                          className="flex items-center gap-3 rounded-lg border border-papa-border bg-papa-surface px-4 py-2.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm">
                            <b className="font-semibold">
                              {req.skill_name ?? `notion #${req.skill_id}`}
                            </b>
                            <span className="text-papa-muted">
                              {" "}— {CONTENT_KIND_LABEL[req.content_kind] ?? req.content_kind}
                            </span>
                          </span>
                          {/* ⚠️ `producible` est un verdict SERVEUR, jamais déduit du type ici :
                              la table des générateurs vit en un seul endroit (ADR-0036 §3). */}
                          {req.id in runs ? (
                            runs[req.id] ? (
                              <ProductionProgress
                                runId={runs[req.id]!.id}
                                scopeKind={runs[req.id]!.kind}
                                onFinished={onRunFinished}
                              />
                            ) : (
                              <div className="min-w-[190px] shrink-0">
                                <ProgressBar pct={1} label="Lancement…" />
                              </div>
                            )
                          ) : req.producible && req.blocked_reason ? (
                            /* ⚠️ Un CONSTAT, pas un bouton grisé — patron du §3, appliqué cette
                               fois à la SITUATION et non au type. Le 2026-08-04, Papa a cliqué
                               deux fois sur « Produire » pour un cours que le palier interdisait
                               d'écrire : les deux lots ont fini `done` en produisant zéro, et il
                               ne l'a appris qu'au Journal. Le motif vient du serveur, calculé par
                               le code même que le lot exécute. */
                            <span
                              className="flex shrink-0 items-center gap-2"
                              title="Un lot lancé maintenant ne produirait rien"
                            >
                              <span className="max-w-[260px] text-right text-[11.5px] leading-tight text-papa-muted">
                                {req.blocked_reason}
                              </span>
                              {/* Le geste qui répare est à côté du constat, jamais ailleurs.
                                  ⚠️ **`/programme`, pas `/matieres`** — corrigé le jour même :
                                  Matières ne fait que LIRE un cours (« cours en préparation »
                                  quand il manque). C'est le référentiel qui porte « ⚡ Rédiger le
                                  cours ». Un lien qui mène là où le geste n'existe pas est un
                                  cul-de-sac de plus, exactement celui qu'on referme ici. */}
                              <Link
                                to={
                                  group.subjectId
                                    ? `/programme?subject=${group.subjectId}`
                                    : "/programme"
                                }
                                className="rounded-lg border border-papa-border px-3 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
                              >
                                Écrire le cours →
                              </Link>
                            </span>
                          ) : req.producible ? (
                            <button
                              type="button"
                              onClick={() => void produce(req.id)}
                              className="shrink-0 rounded-lg bg-papa-accent px-3 py-1 text-xs font-semibold text-papa-bg transition-opacity hover:opacity-90"
                              title="ZETIS produit ce contenu maintenant"
                            >
                              Produire
                            </button>
                          ) : (
                            /* ⚠️ Un CONSTAT, pas un bouton grisé : une capsule a besoin de ton
                               intention pédagogique en toutes lettres, que la demande ne porte
                               pas. Le geste qui répare est à côté du constat. */
                            <Link
                              to="/capsules"
                              className="shrink-0 rounded-lg border border-papa-border px-3 py-1 text-xs font-semibold text-papa-muted hover:bg-papa-surface-2 hover:text-papa-text"
                              title="Une capsule a besoin de ta consigne — ZETIS ne la devine pas"
                            >
                              À écrire toi-même →
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => void triageContent(req.id, "done")}
                            className="shrink-0 rounded-lg border border-papa-border px-3 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
                            title="Marquer comme traitée sans production"
                          >
                            Fait
                          </button>
                          <button
                            type="button"
                            onClick={() => void triageContent(req.id, "dismissed")}
                            className="shrink-0 rounded-lg border border-papa-border px-3 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
                          >
                            Ignorer
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {modal && (
        <NotionRequestActionModal
          request={modal.request}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onDone={(result) => {
            if (result?.needsLesson) setOrphelines((cur) => [...cur, result.label]);
            setNotions((cur) => cur.filter((r) => r.id !== modal.request.id));
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
