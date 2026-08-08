import { useCallback, useEffect, useMemo, useState } from "react";
import { SubjectFilterChips } from "@zetis/ui";
import type { DiagnosticApercu, DiagnosticPortee, DiagnosticRailEntry, DiagnosticResult } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { DiagnosticIcon } from "../components/DiagnosticIcon";
import { BandeauInstrument } from "../components/diagnostic/BandeauInstrument";
import { RailPassations } from "../components/diagnostic/RailPassations";
import { PanneauPassation, PanneauSansMesure } from "../components/diagnostic/PanneauPassation";
import { LancerDiagnosticDialog } from "../components/diagnostic/LancerDiagnosticDialog";
import { fetchApercu, fetchPortee, fetchResultDetail } from "../lib/diagnostic";

// Page Papa « Diagnostic » (adr-0043) — refonte complète.
//
// Elle répond à UNE question, dans cet ordre et sans sauter d'étape : *cette mesure, qu'a-t-elle
// mesuré, qu'a-t-elle ouvert, et qu'est-ce que ZETIS en a fait ?* Une passation est une **mesure
// datée** : la page la traite comme un instrument, pas comme un bulletin.
//
// Ce qu'elle S'INTERDIT, et pourquoi :
//
// - **aucun score avant le 3ᵉ cran du témoin** — il n'en existe pas ;
// - **aucun compteur de jours d'attente côté Massimo, aucune relance** — l'attente est une
//   information pour Papa, pas une pression sur l'enfant ;
// - **aucun classement de matières**, aucun « meilleur / moins bon » ;
// - **aucune note globale de l'élève** — un diagnostic mesure des notions, pas un enfant
//   (adr-0028 §9, non rouvert) ;
// - **aucune interpolation** dans la portée ;
// - **aucune modification de contenu** — la page lit et oriente ; produire a ses pages.
//
// ⚠️ **Deux appels seulement au chargement** (`/apercu`), puis un couple `détail + portée` par
// sélection. La portée n'est pas préchargée pour toutes les matières : c'est une liste, pas un
// agrégat borné, et le dashboard précharge pour une raison qui ne vaut pas ici (adr-0028 §1).

export function DiagnosticsPapaPage() {
  const [apercu, setApercu] = useState<DiagnosticApercu | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [selection, setSelection] = useState<DiagnosticRailEntry | null>(null);
  const [detail, setDetail] = useState<DiagnosticResult | null>(null);
  const [portee, setPortee] = useState<DiagnosticPortee | null>(null);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const donnees = await fetchApercu();
      setApercu(donnees);
      // Sélection par défaut : la passation la plus récente. Ouvrir sur du vide obligerait Papa à
      // cliquer pour voir ce qu'il vient chercher.
      setSelection((courante) => courante ?? donnees.rail.find((e) => e.cran === "passe") ?? donnees.rail[0] ?? null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    // ⚠️ `annule` : en StrictMode le montage est joué deux fois, et sans ce drapeau la réponse du
    // premier passage peut écraser celle du second. Piège déjà payé sur le chat (adr-0026).
    let annule = false;
    if (selection === null || selection.attempt_id === null) {
      setDetail(null);
      setPortee(null);
      return;
    }
    const attemptId = selection.attempt_id;
    const matiere = selection.subject_id;
    void (async () => {
      try {
        const [d, p] = await Promise.all([fetchResultDetail(attemptId), fetchPortee(matiere)]);
        if (annule) return;
        setDetail(d);
        setPortee(p);
      } catch (cause: unknown) {
        if (!annule) setError(cause instanceof Error ? cause.message : "Chargement impossible");
      }
    })();
    return () => {
      annule = true;
    };
  }, [selection]);

  const railVisible = useMemo(
    () =>
      (apercu?.rail ?? []).filter((e) => subjectId === null || e.subject_id === subjectId),
    [apercu, subjectId],
  );

  if (error !== null && apercu === null) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="rounded-lg bg-papa-warn/15 px-3 py-2 text-sm text-papa-warn">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={<DiagnosticIcon size="header" breathing />}
        title="Diagnostic"
        subtitle="Chaque passation est une mesure datée. Cette page dit ce qu'elle a mesuré, ce qu'elle a ouvert, et ce que ZETIS en a produit — dans cet ordre, et sans sauter d'étape."
        actions={
          <button
            type="button"
            onClick={() => setDialogOuvert(true)}
            className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg"
          >
            Lancer un diagnostic
          </button>
        }
      />

      {apercu && <BandeauInstrument jauges={apercu.jauges} />}

      {apercu && (
        <div className="mb-5">
          <SubjectFilterChips
            subjects={apercu.subjects.map((s) => ({ id: s.id, slug: s.slug, name: s.name }))}
            value={subjectId}
            onChange={setSubjectId}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <RailPassations
          entrees={railVisible}
          jamaisGenere={apercu?.jamais_genere ?? []}
          selection={selection?.cle ?? null}
          onSelect={setSelection}
        />

        <div>
          {selection === null ? (
            <div className="rounded-xl border border-dashed border-papa-border bg-papa-surface/50 p-6">
              <p className="font-medium">Rien à lire pour l'instant</p>
              <p className="mt-1 text-sm text-papa-muted">
                Lance un diagnostic : il rejoindra le rail au premier cran, en relecture — pas
                encore chez Massimo.
              </p>
            </div>
          ) : selection.cran !== "passe" ? (
            // 🔴 Deux premiers crans : aucun score, aucun palier, aucune lacune. Il n'en existe pas.
            <PanneauSansMesure entree={selection} />
          ) : detail ? (
            <PanneauPassation detail={detail} portee={portee} rang={selection.rang} />
          ) : (
            <p className="text-sm text-papa-muted">Chargement…</p>
          )}
        </div>
      </div>

      {dialogOuvert && apercu && (
        <LancerDiagnosticDialog
          subjects={apercu.subjects}
          onClose={() => setDialogOuvert(false)}
          onTermine={() => {
            setDialogOuvert(false);
            void charger();
          }}
        />
      )}
    </div>
  );
}
