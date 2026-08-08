import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmDialog, EmptyState, SubjectPictogram } from "@zetis/ui";
import type { OpenGap } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { ProgressBar, useEstimatedProgress } from "../components/ProgressBar";
import { equipNotion, type EtatTravail } from "../lib/councilClass";
import { gesteDe } from "../lib/gesteLacune";
import { useLacunes } from "../hooks/useLacunes";

// Lacunes Papa — la surface de DÉCISION vers laquelle le dashboard renvoie.
//
// 🔴 **Vocabulaire renommé par l'`adr-0040` §5, et ce n'est pas cosmétique.** Trois surfaces
// employaient « à renforcer » pour TROIS populations : le KPI du dashboard comptait 13
// `SkillMastery ∈ {weak, learning}`, le titre de cette page 1 ligne `Gap` ouverte, et
// `SEVERITY.medium` un sous-ensemble de ce sous-ensemble. Conséquence visible : cette page
// affichait « Rien à renforcer » pendant que le dashboard en annonçait 13.
//
// Ici on dit **« lacune ouverte »** — le libellé du `GLOSSARY`. « À renforcer » appartient au
// PALIER DE MAÎTRISE et vit sur Progression, jamais sur une surface `Gap`. Un test-verrou
// l'interdit dans ce fichier : ce dépôt a déjà prouvé deux fois qu'un mot partagé finit par
// fondre deux mesures.
//
// Le mot « lacune » reste hors de toute formulation pouvant atteindre Massimo (surface Papa).
//
// Deux gestes, aucun automatisme et aucune route nouvelle — les deux générateurs existaient déjà :
//   · consolidation → notions découvertes et jamais prises en charge (lacunes `open`) ;
//   · révision      → notions revenues par le SRS après un « à revoir » (lacunes `in_progress`),
//                     c'est le relais que l'ADR-0017 §5bis désigne.
//
// Les missions créées naissent `pending` : elles n'atteignent Massimo qu'après validation.

const SEVERITY: Record<OpenGap["severity"], { label: string; className: string }> = {
  // Aucune teinte rouge : ce sont des notions à travailler, pas des fautes (adr-0024, adr-0028 §6).
  low: { label: "à surveiller", className: "bg-papa-surface-2 text-papa-muted" },
  medium: { label: "à traiter", className: "bg-papa-accent-2/15 text-papa-accent-2" },
  high: { label: "prioritaire", className: "bg-papa-warn/15 text-papa-warn" },
};

const STATUS_LABEL: Record<OpenGap["status"], string> = {
  open: "découverte, jamais travaillée",
  in_progress: "déjà travaillée, pas encore acquise",
};

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
}

/** Les trois gestes irréversibles de la page passent par la même confirmation. */
type Confirmation =
  | { kind: "remediation" }
  | { kind: "revision" }
  | { kind: "equip"; skillId: number; skillName: string };

export function LacunesPage() {
  const [params, setParams] = useSearchParams();
  // Le filtre vit dans l'URL, pas dans un état local : le lien qui amène ici le porte, et
  // recharger la page ne le perd pas.
  // `source` et `contenu` (adr-0045) : les renvois des jauges du Diagnostic les portent. Sans eux,
  // « dont 4 sans contenu → » menait ici et en montrait 10 — un nombre cliquable qui conduit à un
  // autre nombre est pire que le nombre invisible qu'il remplace.
  const l = useLacunes(params.get("subject"), {
    source: params.get("source"),
    contenu: params.get("contenu"),
  });
  // ⚠️ **Une SEULE `ConfirmDialog`, discriminée** — pas une seconde à côté. Deux dialogues dans le
  // même composant piégeraient les tests qui cherchent le bouton « Créer » par son rôle, et
  // surtout : deux gestes irréversibles doivent passer par la même porte.
  const [confirming, setConfirming] = useState<Confirmation | null>(null);

  // L'équipement d'une notion orpheline (ADR-0047 §3). Il passe par la FILE de production : son
  // avancement se sonde côté serveur, il ne s'estime pas localement — une barre qui monterait sur
  // un travail encore en file mentirait (ADR-0041 §9).
  const [equipement, setEquipement] = useState<{ skillName: string } | null>(null);
  const [etat, setEtat] = useState<EtatTravail | null>(null);
  const [equipResult, setEquipResult] = useState<string | null>(null);

  async function lancerEquipement(skillId: number, skillName: string) {
    setEquipement({ skillName });
    setEtat(null);
    setEquipResult(null);
    try {
      const kit = await equipNotion(skillId, setEtat);
      const rates = kit.errors?.length ?? 0;
      setEquipResult(
        rates === 0
          ? `« ${skillName} » est équipée : cours, fiche, cartes, quiz et carte mentale.`
          : `« ${skillName} » est équipée, mais ${rates} pièce${rates > 1 ? "s ont" : " a"} échoué.`,
      );
      // La lacune peut avoir changé d'état : elle a une leçon maintenant.
      l.reload();
    } catch (e) {
      setEquipResult(e instanceof Error ? e.message : "L'équipement a échoué.");
    } finally {
      setEquipement(null);
      setEtat(null);
    }
  }

  // Les trois sections dérivent TOUTES du jeu filtré par le hook — aucune ne peut l'oublier.
  const discovered = l.pending.filter((gap) => gap.status === "open");
  const returning = l.pending.filter((gap) => gap.status === "in_progress");

  // ⚠️ Les comptes des BOUTONS, eux, ne sont PAS filtrés — et c'est voulu. Les deux routes de
  // génération n'ont aucun paramètre de matière : elles agissent sur tout. Un bouton qui
  // annoncerait « 3 » et en créerait 7 serait le défaut même que ce chantier corrige, transposé à
  // une action. Le libellé porte donc le compte réel, et le dit quand un filtre est posé.
  const allDiscovered = l.allPending.filter((gap) => gap.status === "open");
  const scopeNote = l.activeSubject ? " · toutes matières" : "";

  const clearFilter = () => {
    const next = new URLSearchParams(params);
    next.delete("subject");
    // `replace` : un filtre est un état d'affichage, pas une étape de navigation.
    setParams(next, { replace: true });
  };

  const clearOrigine = () => {
    const next = new URLSearchParams(params);
    next.delete("source");
    next.delete("contenu");
    setParams(next, { replace: true });
  };

  // 🔴 **Un filtre NOMMÉ, jamais une troncature** : la page dit ce qu'elle montre et comment en
  // sortir. Même règle que le rail du Diagnostic — si une surface borne ce qu'elle montre, elle
  // doit dire ce qu'elle laisse dehors.
  //
  // ⚠️ `filtreOrigine` dépend de la PRÉSENCE du filtre, jamais de ma capacité à le nommer
  // joliment. Une première version ne le déclarait actif que pour les deux valeurs connues :
  // `?source=revision` retombait alors sur « Aucune lacune ouverte », c'est-à-dire sur la phrase
  // d'un dépôt vide, servie à quelqu'un qui a dix lacunes. Un test l'a attrapé.
  const filtreOrigine = l.activeFiltres.source !== null || l.activeFiltres.contenu !== null;
  const nomsFiltres = [
    l.activeFiltres.source === "diagnostic"
      ? "ouvertes par un diagnostic"
      : l.activeFiltres.source
        ? `d'origine « ${l.activeFiltres.source} »`
        : null,
    l.activeFiltres.contenu === "absent" ? "sans contenu produisible" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Lacunes ouvertes"
        subtitle="Ce que les diagnostics et les missions ont mesuré — et ce qu'il reste à décider."
      />

      {filtreOrigine && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-papa-accent/30 bg-papa-accent/5 px-4 py-2.5 text-sm text-papa-accent">
          <span>
            Ne montre que les lacunes{" "}
            <strong className="font-semibold">{nomsFiltres.join(" et ")}</strong>.
          </span>
          <button
            type="button"
            onClick={clearOrigine}
            className="rounded-lg border border-papa-accent/40 px-2 py-0.5 text-xs font-semibold hover:border-papa-accent"
          >
            Toutes les lacunes
          </button>
        </p>
      )}

      {l.activeSubject && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-papa-accent/30 bg-papa-accent/5 px-4 py-2.5 text-sm text-papa-accent">
          <span>
            Filtré sur <strong className="font-semibold">{l.activeSubject.name}</strong>.
          </span>
          <button
            type="button"
            onClick={clearFilter}
            className="rounded-lg border border-papa-accent/40 px-2 py-0.5 text-xs font-semibold hover:border-papa-accent"
          >
            Toutes les matières
          </button>
        </p>
      )}

      {l.error && (
        <div className="mb-4 rounded-xl border border-papa-warn/30 bg-papa-warn/5 p-4">
          <p className="text-sm text-papa-warn">{l.error}</p>
          <button
            type="button"
            onClick={l.reload}
            className="mt-2.5 rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
          >
            Réessayer
          </button>
        </div>
      )}

      {l.result && (
        <p className="mb-4 rounded-xl border border-papa-accent/30 bg-papa-accent/5 px-4 py-3 text-sm text-papa-accent">
          {l.result}{" "}
          <Link to="/missions" className="underline">
            Voir les missions →
          </Link>
        </p>
      )}

      {/* ⚠️ Une BARRE, jamais un spinner nu — convention Papa pour toute action backend opaque.
          Et son avancement vient du SERVEUR : `active` reste faux tant que le travail attend son
          tour dans la file, parce qu'une barre qui monte sur un travail en file mentirait. */}
      {equipement && (
        <div className="mb-4">
          <EquipementEnCours skillName={equipement.skillName} etat={etat} />
        </div>
      )}

      {equipResult && (
        <p className="mb-4 rounded-xl border border-papa-accent/30 bg-papa-accent/5 px-4 py-3 text-sm text-papa-accent">
          {equipResult}
        </p>
      )}

      {l.loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-papa-surface motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : l.gaps.length === 0 ? (
        // 🔴 **L'état vide dit LAQUELLE des deux situations il rend.** « Aucune lacune ouverte »
        // annonce un dépôt vide : le servir à un lecteur qui en a dix mais filtre sur une origine
        // est un mensonge — et il cohabiterait avec le bandeau qui vient d'annoncer le filtre.
        // Même piège que l'état vide du rail du Diagnostic, même parade.
        filtreOrigine ? (
          <EmptyState
            title="Aucune lacune de ce type"
            description="D'autres lacunes existent en dehors de ce filtre — il n'en laisse simplement passer aucune."
            action={
              <button
                type="button"
                onClick={clearOrigine}
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
              >
                Voir toutes les lacunes
              </button>
            }
          />
        ) : (
          <EmptyState
            title="Aucune lacune ouverte"
            description="Les notions apparaissent ici quand un diagnostic ou une mission mesure qu'elles ne tiennent pas encore. ⚠️ Des notions peuvent rester fragiles SANS lacune ouverte : les deux populations sont disjointes."
            action={
              <Link
                to="/progression?view=notion"
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
              >
                Voir les paliers sur Progression →
              </Link>
            }
          />
        )
      ) : (
        <>
          <Section
            title="Découvertes, jamais travaillées"
            note="Un diagnostic les a repérées et aucune mission ne les prend en charge."
            gaps={discovered}
            action={
              discovered.length > 0
                ? {
                    label: `Créer ${allDiscovered.length} mission${allDiscovered.length > 1 ? "s" : ""} de consolidation${scopeNote}`,
                    onClick: () => setConfirming({ kind: "remediation" }),
                    busy: l.busy === "remediation",
                  }
                : undefined
            }
            onEquiper={(skillId, skillName) => setConfirming({ kind: "equip", skillId, skillName })}
            equipEnCours={equipement !== null}
          />

          <Section
            title="Revenues par la révision"
            note="Déjà travaillées, pas encore acquises : leur carte de révision les ramène d'elle-même. ZETIS ne relance pas de consolidation dessus — c'est la révision qui vérifie l'acquisition dans le temps."
            gaps={returning}
            action={
              returning.length > 0
                ? {
                    label: `Créer les missions de révision dues${scopeNote}`,
                    onClick: () => setConfirming({ kind: "revision" }),
                    busy: l.busy === "revision",
                  }
                : undefined
            }
            onEquiper={(skillId, skillName) => setConfirming({ kind: "equip", skillId, skillName })}
            equipEnCours={equipement !== null}
          />

          <Section
            title="Déjà prises en charge"
            note="Une mission active couvre ces notions — rien à décider, mais on peut aller la voir."
            gaps={l.gaps.filter((gap) => gap.has_active_mission)}
          />
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming?.kind === "equip"
            ? `Équiper « ${confirming.skillName} » ?`
            : confirming?.kind === "revision"
              ? "Créer les missions de révision dues ?"
              : "Créer les missions de consolidation ?"
        }
        confirmLabel={confirming?.kind === "equip" ? "Équiper" : "Créer"}
        busy={l.busy !== null || equipement !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const demande = confirming;
          setConfirming(null);
          if (demande?.kind === "revision") void l.createRevision();
          else if (demande?.kind === "remediation") void l.createRemediation();
          else if (demande?.kind === "equip")
            void lancerEquipement(demande.skillId, demande.skillName);
        }}
      >
        {/* 🔴 L'équipement ne compose pas à partir de l'existant : il GÉNÈRE et AUTO-VALIDE. Le
            dire est ce qui rend la confirmation utile — même texte que le dépliage de Progression,
            parce que c'est le même geste et qu'il ne doit pas se raconter de deux façons. */}
        {confirming?.kind === "equip" ? (
          <p>
            ZETIS génère et <b>auto-valide</b> le kit de cette notion : cours, fiche, cartes de
            révision, quiz et carte mentale. Cela peut prendre plusieurs minutes.
          </p>
        ) : (
          <>
        {l.activeSubject && (
          <p className="mb-2 rounded-lg border border-papa-warn/30 bg-papa-warn/5 px-3 py-2 text-papa-warn">
            L'écran est filtré sur <b>{l.activeSubject.name}</b>, mais cette création porte sur{" "}
            <b>toutes les matières</b> : la génération ne sait pas se restreindre.
          </p>
        )}
        <p>
          Les missions sont composées à partir des <b>contenus déjà validés</b> — aucun contenu
          n'est généré.
        </p>
        <p className="mt-2">
          Elles naissent <b>en attente de ta validation</b> : elles n'atteindront Massimo qu'une
          fois relues sur la page Missions.
        </p>
        {confirming?.kind === "revision" && (
          <p className="mt-2 text-papa-muted">
            Seules les notions dont la carte de révision est <b>due</b> sont reprises, et leur
            nombre est plafonné : une séance reste courte.
          </p>
        )}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

interface SectionAction {
  label: string;
  onClick: () => void;
  busy: boolean;
}

/** L'équipement en cours — ce que ZETIS fait, et l'ordre de grandeur de l'attente.
 *
 * ⚠️ **`active` suit le SERVEUR, pas une estimation locale.** L'équipement passe par la file de
 * production : tant que `status` n'est pas `running`, le travail attend son tour et la barre reste
 * indéterminée. Le 2026-08-06, une page a déroulé dix secondes de pipeline sur un travail de 11 ms
 * parce qu'elle DEVINAIT au lieu de lire — c'est le motif de l'ADR-0041 §9. */
function EquipementEnCours({
  skillName,
  etat,
}: {
  skillName: string;
  etat: EtatTravail | null;
}) {
  const pct = useEstimatedProgress(
    etat?.status === "running" && (etat?.estimatedMs ?? 0) > 0,
    etat?.estimatedMs ?? 0,
    etat?.startedAtMs ?? null,
  );
  return (
    <ProgressBar
      pct={pct}
      label={
        etat?.status === "running"
          ? `Équipement de « ${skillName} » — cours, fiche, cartes, quiz, carte mentale`
          : `« ${skillName} » attend son tour dans la file de production`
      }
    />
  );
}

function Section({
  title,
  note,
  gaps,
  action,
  onEquiper,
  equipEnCours,
}: {
  title: string;
  note: string;
  gaps: OpenGap[];
  action?: SectionAction;
  /** Le geste `aucune_lecon` est une ACTION : la section ne la porte pas, elle la remonte. */
  onEquiper?: (skillId: number, skillName: string) => void;
  equipEnCours?: boolean;
}) {
  // Une section vide n'est pas affichée : elle n'apprendrait rien et pousserait le reste hors
  // de l'écran.
  if (gaps.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest">
          {title} <span className="font-mono text-papa-muted">({gaps.length})</span>
        </h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.busy}
            className="rounded-lg bg-papa-accent px-3.5 py-1.5 text-xs font-bold text-[#042f1f] disabled:opacity-60"
          >
            {action.busy ? "Création…" : action.label}
          </button>
        )}
      </div>
      <p className="mb-2.5 text-xs text-papa-muted">{note}</p>

      <ul className="space-y-2">
        {gaps.map((gap) => {
          const severity = SEVERITY[gap.severity] ?? SEVERITY.medium;
          const detected = formatDate(gap.first_detected_at);
          const geste = gesteDe(gap);
          return (
            <li
              key={`${gap.skill_id}-${gap.status}`}
              // 🔴 **Sous 640 px, le corps prend TOUTE la largeur** (`basis-full`), et le badge et
              // le geste descendent sur leur propre ligne. Sans ça, `flex-1 min-w-0` est comprimé
              // SOUS sa largeur minimale par deux frères `shrink-0`, et le titre part en colonne,
              // un mot par ligne. Vu à 375 px sur la maquette AVANT d'être écrit — c'est le défaut
              // exact que la PR #101 a dû corriger après coup sur la zone C du Diagnostic.
              className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-papa-border bg-papa-surface px-4 py-3 sm:items-center"
            >
              {gap.subject_slug && (
                <SubjectPictogram slug={gap.subject_slug} name={gap.subject_name ?? ""} size="sm" />
              )}
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <p className="font-medium">
                  {gap.subject_name ? `${gap.subject_name} — ` : ""}
                  {gap.skill_name}
                </p>
                <p className="text-xs text-papa-muted">
                  {STATUS_LABEL[gap.status]}
                  {detected && ` · repérée le ${detected}`}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${severity.className}`}
              >
                {severity.label}
              </span>

              {/* Le geste — et il est ABSENT quand aucun ne peut être tenu, plutôt que par défaut. */}
              {geste?.kind === "lien" && (
                <Link
                  to={geste.href}
                  className={`ml-auto shrink-0 text-xs font-semibold hover:underline ${
                    geste.ton === "sky" ? "text-papa-accent-2" : "text-papa-accent"
                  }`}
                >
                  {geste.libelle}
                </Link>
              )}
              {geste?.kind === "equiper" && (
                <button
                  type="button"
                  onClick={() => onEquiper?.(gap.skill_id, gap.skill_name)}
                  disabled={equipEnCours}
                  className="ml-auto shrink-0 rounded-lg border border-papa-accent/40 px-2.5 py-1 text-xs font-semibold text-papa-accent hover:border-papa-accent disabled:opacity-50"
                >
                  {geste.libelle}
                </button>
              )}

              {/* Le motif, en clair — c'est lui qui distingue ce geste d'un lien nu. */}
              {geste && (
                <p className="basis-full text-xs leading-relaxed text-papa-muted sm:pl-[2.3rem]">
                  {geste.motif}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
