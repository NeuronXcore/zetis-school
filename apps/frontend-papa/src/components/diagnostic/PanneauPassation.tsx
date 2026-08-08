import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@zetis/ui";
import type { DiagnosticPortee, DiagnosticRailEntry, DiagnosticResult } from "@zetis/types";
import { PorteeEscalier } from "./PorteeEscalier";
import { badgeLacune, motifLacune, palierLabel, palierTon } from "./paliers";
import { actionPrincipale, CRAN_TEXTE, RETRAIT } from "./crans";

// Le panneau d'une passation : la portée, puis les trois stations — ce qui a été mesuré, ce qui a
// été ouvert, ce que ZETIS en a produit. Dans cet ordre, et sans sauter d'étape.

function Station({
  numero,
  titre,
  chapeau,
  children,
}: {
  numero: string;
  titre: string;
  chapeau: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-papa-border bg-papa-surface p-4">
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full border border-papa-accent/50 text-[11px] text-papa-accent"
        >
          {numero}
        </span>
        <h3 className="font-semibold">{titre}</h3>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-papa-muted">{chapeau}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export interface PanneauSansMesureProps {
  entree: DiagnosticRailEntry;
  /** Le geste secondaire : `POST /reject`. La page le porte — c'est elle qui recharge l'aperçu et
   *  qui doit oublier une sélection dont la ligne vient de sortir du rail. */
  onRetirer: () => void;
  retraitEnCours: boolean;
}

/** L'état « pas encore de mesure » — les deux premiers crans du témoin.
 *
 *  🔴 Il n'affiche AUCUN score, aucun palier, aucune lacune : il n'en existe pas. C'est le seul
 *  rendu honnête d'un diagnostic généré ou proposé mais jamais passé.
 *
 *  🔴 **Mais il n'est plus un CUL-DE-SAC** (adr-0045 Décision 5). Le cran « proposé » n'avait
 *  aucune action — pas une seule : trois lignes de texte et une colonne vide jusqu'en bas, parce
 *  que le lien de relecture était rendu sous `{genere && …}`. */
export function PanneauSansMesure({
  entree,
  onRetirer,
  retraitEnCours,
}: PanneauSansMesureProps) {
  const [dialogue, setDialogue] = useState(false);
  const genere = entree.cran === "genere";
  const texte = CRAN_TEXTE[entree.cran];
  const principale = actionPrincipale(entree.cran);
  const retrait = RETRAIT[genere ? "genere" : "propose"];

  return (
    <div className="rounded-xl border border-papa-border bg-papa-surface p-5">
      {/* Le sur-titre reprend MOT POUR MOT la mention du rail : une ligne sélectionnée et son
          panneau ne doivent pas se nommer différemment. */}
      <p className="text-xs uppercase tracking-wide text-papa-muted">
        <span className={texte.ton}>{texte.acteur}</span> · {texte.etat}
      </p>
      <h2 className="mt-1 text-xl font-bold">Diagnostic {entree.subject}</h2>
      <p className="mt-3 text-sm leading-relaxed text-papa-muted">
        {genere ? (
          <>
            Le questionnaire existe et attend ta relecture. <strong>Rien n'est visible par
            Massimo</strong>, et rien ne le sera tant que tu ne l'auras pas relu : c'est un gate,
            pas un délai.
          </>
        ) : (
          <>
            Tu l'as relu et proposé. Aucune tentative n'a été enregistrée : il n'y a donc{" "}
            <strong>ni score, ni palier, ni lacune</strong> — et il n'y en aura pas tant qu'il ne
            l'aura pas passé.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {principale && (
          <Link
            to={principale.to}
            className="inline-flex rounded-lg border border-papa-accent/50 px-3 py-1.5 text-sm text-papa-accent hover:bg-papa-accent/10"
          >
            {principale.libelle}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDialogue(true)}
          className="inline-flex rounded-lg border border-transparent px-3 py-1.5 text-sm text-papa-muted hover:border-papa-border hover:text-papa-text"
        >
          {retrait.bouton}
        </button>
      </div>

      {/* 🔴 Destructif du point de vue de Massimo quand il s'agit d'une proposition : le diagnostic
          disparaît de sa page. D'où la confirmation — et un corps qui ne lui reproche rien. */}
      <ConfirmDialog
        open={dialogue}
        tone="danger"
        title={retrait.titre}
        confirmLabel={retrait.bouton}
        busy={retraitEnCours}
        onCancel={() => setDialogue(false)}
        onConfirm={() => {
          setDialogue(false);
          onRetirer();
        }}
      >
        {retrait.corps}
      </ConfirmDialog>
    </div>
  );
}

export interface PanneauPassationProps {
  detail: DiagnosticResult;
  portee: DiagnosticPortee | null;
  rang: number | null;
}

export function PanneauPassation({ detail, portee, rang }: PanneauPassationProps) {
  const grains = new Set(detail.per_skill.map((s) => s.questions_count).filter(Boolean));
  const marche = grains.size === 1 ? Math.round(100 / [...grains][0]) : null;

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-papa-border bg-papa-surface p-5">
        {rang !== null && (
          <p className="text-xs uppercase tracking-wide text-papa-muted">{rang}ᵉ passation</p>
        )}
        <h2 className="mt-1 text-xl font-bold">
          Diagnostic {detail.subject}
          {detail.completed_at && (
            <span className="font-normal text-papa-muted">
              {" "}
              —{" "}
              {new Date(detail.completed_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-papa-accent/40 bg-papa-accent/10 px-2.5 py-0.5 text-papa-accent">
            passé par Massimo
          </span>
          <span className="rounded-full border border-papa-border px-2.5 py-0.5 text-papa-muted">
            {detail.per_skill.length} notion{detail.per_skill.length > 1 ? "s" : ""}
          </span>
          <span className="rounded-full border border-papa-border px-2.5 py-0.5 text-papa-muted">
            {detail.score_percent} %
          </span>
        </div>
      </header>

      {portee && <PorteeEscalier portee={portee} />}

      <Station
        numero="1"
        titre="Ce qui a été mesuré"
        chapeau={`Score par notion, corrigé serveur${
          marche ? `, par paliers de ${marche} points` : " — granularité mixte selon la passation"
        }. Le palier de maîtrise et la lacune sont deux colonnes distinctes : une notion peut être à renforcer sans lacune ouverte, et l'inverse.`}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-papa-muted">
              <th className="pb-2 font-normal">Notion</th>
              <th className="pb-2 font-normal" />
              <th className="pb-2 text-right font-normal">Score</th>
              <th className="pb-2 pl-4 font-normal">Palier</th>
              <th className="pb-2 pl-4 font-normal">Lacune</th>
            </tr>
          </thead>
          <tbody>
            {detail.per_skill.map((notion) => {
              // 🔴 La lacune se cherche dans `gaps`, elle ne se DÉDUIT PAS du score. Deux
              // populations disjointes : une notion sous 70 peut n'avoir aucune lacune ouverte, et
              // une lacune peut rester sur une notion remontée. Les fusionner serait un recul.
              const lacune = detail.gaps.find((g) => g.skill_id === notion.skill_id);
              return (
                <tr key={notion.skill_id} className="border-t border-papa-border/60">
                  <td className="py-2 pr-3">{notion.skill_name}</td>
                  <td className="w-32 py-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-papa-bg">
                      <div
                        className={`h-full ${
                          notion.status === "mastered"
                            ? "bg-emerald-400"
                            : notion.status === "solid"
                              ? "bg-papa-accent"
                              : "bg-papa-warn"
                        }`}
                        style={{ width: `${notion.score}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{notion.score} %</td>
                  <td className="py-2 pl-4">
                    {/* Le palier vient du SERVEUR (`status`), il n'est pas recalculé depuis le
                        score : c'est ce qui fait réapparaître « acquise » (≥ 90), invisible de
                        l'ancienne page qui recoloriait avec ses propres bornes. */}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${palierTon(notion.status)}`}
                    >
                      {palierLabel(notion.status)}
                    </span>
                  </td>
                  <td className="py-2 pl-4 text-xs text-papa-muted">
                    {lacune ? badgeLacune(lacune.status, lacune.content_state).label : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Station>

      <Station
        numero="2"
        titre="Ce qui a été ouvert"
        chapeau={`${detail.gaps.length} lacune${detail.gaps.length > 1 ? "s" : ""} · état à aujourd'hui, pas à la date de la passation.`}
      >
        {detail.gaps.length === 0 ? (
          <p className="text-sm text-papa-muted">
            Aucune lacune sur les notions de cette passation.
          </p>
        ) : (
          <div className="space-y-2">
            {detail.gaps.map((lacune) => {
              const badge = badgeLacune(lacune.status, lacune.content_state);
              return (
                <div
                  key={lacune.skill_id}
                  className="rounded-lg border border-papa-border bg-papa-surface-2 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{lacune.skill_name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-papa-muted">
                        {motifLacune(lacune.status, lacune.content_state)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${badge.ton}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <Link
                    to={
                      lacune.content_state === "cours_brouillon"
                        ? `/programme?subject=${detail.subject_id ?? ""}`
                        : lacune.content_state === "aucune_lecon"
                          ? `/quiz?subject=${detail.subject_id ?? ""}`
                          : "/lacunes"
                    }
                    className="mt-2 inline-flex text-xs text-papa-accent hover:underline"
                  >
                    {badge.geste} →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Station>

      <Station
        numero="3"
        titre="Ce que ZETIS en a produit"
        chapeau="Le lot de production commandé par cette mesure."
      >
        {/* 🔴 Un MUR, pas un trou. `EMITTED_TRIGGERS` n'inclut pas `evidence`, et le modèle porte
            la raison en toutes lettres : « écarté EN CONNAISSANCE DE CAUSE, pas par manque de
            temps ». Une formulation qui exprimerait un regret pousserait à demander l'ouverture
            d'un déclencheur écarté volontairement. */}
        <div className="rounded-lg border border-dashed border-papa-border bg-papa-surface-2/50 p-3">
          <p className="text-sm font-medium">Aucun — et c'est une décision, pas une panne.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-papa-muted">
            ZETIS ne se commande pas de production sur sa propre mesure. Une mesure fausse
            produirait alors du contenu que rien d'extérieur ne viendrait contredire : la boucle se
            refermerait sur elle-même. Seule une source du monde réel — un contrôle inscrit à
            l'agenda — déclenche ZETIS toute seule.
          </p>
          <p className="mt-2 text-xs text-papa-muted">
            Le fil s'arrête ici volontairement. C'est à toi de décider si cette mesure mérite une
            production.
          </p>
        </div>
        <Link
          to="/journal"
          className="mt-3 inline-flex rounded-lg bg-papa-accent px-3 py-1.5 text-sm font-semibold text-papa-bg"
        >
          Commander une production →
        </Link>
      </Station>
    </div>
  );
}
