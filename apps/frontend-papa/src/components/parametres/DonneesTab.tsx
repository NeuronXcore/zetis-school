// 💾 L'onglet Données (ADR-0065 §7) — les archives, le certificat, et les DEUX gestes.
//
// 🔴 **Le mot « sauvegarde » se mérite.** Une archive jamais restaurée à blanc s'affiche pour ce
// qu'elle est : un « export non vérifié ». Le mot n'apparaît qu'après un verdict `reussie` de
// `backup_verify` — c'est la phrase de la maquette qui méritait d'être gardée, et un test-verrou
// la tient.
//
// 🔴 **Aucun octet d'archive ne passe par ici** (§1) : cette page lit des noms, des tailles, des
// empreintes, des verdicts — jamais un contenu. Pas de bouton « Télécharger », et ce n'est pas un
// oubli : l'archive naît sur le disque cible et y reste.
//
// ⚠️ **Aucun sondage** (adr-0062 §5) : lecture au montage, et le rafraîchissement est un bouton.
// Après un 202, le suivi vit dans la barre du header (travail de file, comme tout le reste) —
// le ⟳ relit l'état quand le travail est fini.
import { useCallback, useEffect, useState } from "react";
import { Button, cn } from "@zetis/ui";
import { type ArchiveSauvegarde, type Donnees } from "@zetis/types";

import { estRefus } from "../../lib/httpClient";
import { signalerEnfilement } from "../../lib/productionSignal";
import { fetchDonnees, lancerSauvegarde, lancerVerification } from "../../lib/settings";

/** L'issue d'un geste, à l'écran : un 202 (accepté), un 409 (refusé AVEC son motif — reconnu au
 *  CODE via `estRefus`, jamais au texte), ou une panne. Les trois sont des PHRASES à afficher. */
type Geste = null | "en-cours" | { genre: "accepte" | "refus" | "panne"; texte: string };

function taille(octets: number): string {
  if (octets >= 1024 * 1024) {
    return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  }
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/** `2026-08-19T14:30` (heure LOCALE du nom d'archive) ou ISO complet AVEC fuseau → `19/08/2026 14:30`.
 *
 *  ⚠️ Deux natures de chaîne, deux traitements — vu à l'écran le 2026-08-19 : `verifie_le` arrive
 *  en UTC (`…+00:00`) et s'affichait 09:43 à côté d'une archive créée 11:42 (heure locale du nom).
 *  Un ISO à fuseau se convertit en heure locale ; le `cree_le` du nom, déjà local, ne se décale
 *  jamais. */
function quand(iso: string | null): string {
  if (!iso) return "—";
  if (iso.includes("+") || iso.endsWith("Z")) {
    const d = new Date(iso);
    return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const [date, heure] = iso.split("T");
  const jmy = date.split("-").reverse().join("/");
  return heure ? `${jmy} ${heure.slice(0, 5)}` : jmy;
}

/** Le STATUT d'une archive — c'est ici que le mot « sauvegarde » se gagne ou se refuse (§7). */
function statutArchive(a: ArchiveSauvegarde): { label: string; classe: string } {
  if (!a.verification) {
    return {
      label: "export non vérifié",
      classe: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    };
  }
  if (a.verification.verdict === "reussie") {
    return {
      label: `Sauvegarde vérifiée · ${quand(a.verification.verifie_le)}`,
      classe: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    };
  }
  const n = a.verification.ecarts;
  return {
    label: `vérification en échec (${n} écart${n > 1 ? "s" : ""})`,
    classe: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  };
}

function MessageGeste({ geste }: { geste: Geste }) {
  if (!geste || geste === "en-cours") return null;
  return (
    <p
      className={cn(
        "mt-2 text-sm",
        geste.genre === "accepte" && "text-emerald-300",
        // Un refus n'est pas une panne : ZETIS a dit non EN CONNAISSANCE DE CAUSE, et son motif
        // dit quoi faire. Le rouge est réservé à ce qui est cassé.
        geste.genre === "refus" && "text-amber-300",
        geste.genre === "panne" && "text-rose-300",
      )}
    >
      {geste.texte}
    </p>
  );
}

export function DonneesTab() {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState<Geste>(null);
  const [verification, setVerification] = useState<{ archive: string; geste: Geste } | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    fetchDonnees()
      .then(setDonnees)
      .catch((e: unknown) => {
        // 🔴 On VIDE l'état (adr-0062 §6) : à l'erreur de lecture, AUCUNE valeur n'est affichée.
        // Une liste d'archives périmée dirait « la sauvegarde existe » pendant que le disque a
        // peut-être disparu.
        setDonnees(null);
        setErreur(e instanceof Error ? e.message : "lecture impossible");
      });
  }, []);

  useEffect(charger, [charger]);

  const issue = (e: unknown): Geste => ({
    genre: estRefus(e) ? "refus" : "panne",
    texte: e instanceof Error ? e.message : "le geste n'a pas abouti",
  });

  if (erreur) {
    return (
      <div className="rounded-xl border border-papa-warn/40 bg-papa-warn/10 p-5">
        <p className="font-semibold text-papa-warn">État de la sauvegarde illisible — {erreur}</p>
        <p className="mt-2 text-sm text-papa-muted">
          Aucune valeur n'est affichée : une liste d'archives périmée ferait croire à une
          sauvegarde qui n'existe peut-être plus.
        </p>
        <Button className="mt-3" onClick={charger}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (!donnees) {
    return (
      <div className="rounded-xl border border-papa-border bg-papa-surface p-5 text-sm text-papa-muted">
        Lecture de l'état de la sauvegarde…
      </div>
    );
  }

  const derniere = donnees.archives[0] ?? null;
  const gesteOccupe = sauvegardeEnCours === "en-cours" || verification?.geste === "en-cours";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            donnees.certificat.valable
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-amber-400/40 bg-amber-400/10 text-amber-200",
          )}
        >
          {donnees.certificat.valable
            ? "● cible certifiée — sur un autre volume que les données"
            : "● cible non certifiée"}
        </span>
        {/* Le rafraîchissement est un GESTE. Aucun `setInterval` n'existe dans ce fichier. */}
        <Button variant="secondary" onClick={charger}>
          ⟳ Rafraîchir
        </Button>
      </div>

      {!donnees.certificat.valable && (
        // Le verrou vient du serveur, AVEC son motif (adr-0062 §6) — le même texte que le 409.
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
          {donnees.certificat.motif}
        </div>
      )}

      <section className="mb-4 rounded-xl border border-papa-border bg-papa-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">💾 Sauvegarder maintenant</h2>
            <p className="mt-1 text-sm text-papa-muted">
              Écrit une archive complète — base, médias, manifeste scellé — directement sur la
              cible certifiée. Rien ne passe par le navigateur.
            </p>
            {/* OÙ, en toutes lettres — le chemin HÔTE du certificat. « Certifiée » sans dire où
                obligeait à demander (relevé à la relecture d'écran du 2026-08-19). Et POURQUOI la
                destination ne se choisit pas ici : les UUID de volume sont illisibles depuis le
                conteneur (ADR-0065 §3) — un champ « destination » serait un interrupteur menteur. */}
            {donnees.certificat.cible && (
              <p className="mt-1 text-xs text-papa-muted">
                Cible : <span className="font-mono">{donnees.certificat.cible}</span> — se change
                sur le Mac (`ZETIS_BACKUP_DIR` + re-certification), jamais depuis cette page :
                seul l'hôte peut prouver qu'un disque est bien un autre disque.
              </p>
            )}
            {derniere && (
              <p className="mt-1 text-xs text-papa-muted">
                Dernière archive : {derniere.nom} · {taille(derniere.taille)}
                {derniere.lignes !== null && derniere.tables !== null && (
                  <> · {derniere.lignes} lignes / {derniere.tables} tables</>
                )}
              </p>
            )}
          </div>
          <Button
            disabled={!donnees.certificat.valable || gesteOccupe}
            title={donnees.certificat.motif ?? undefined}
            onClick={() => {
              setSauvegardeEnCours("en-cours");
              lancerSauvegarde()
                .then((r) => {
                  setSauvegardeEnCours({
                    genre: "accepte",
                    texte: `Travail #${r.job_id} enfilé — la barre en haut suit son avancement ; ⟳ ensuite pour relire l'état.`,
                  });
                  // Réveille la barre tout de suite, au lieu de « quelque part dans les 4 s ».
                  signalerEnfilement();
                })
                .catch((e: unknown) => setSauvegardeEnCours(issue(e)));
            }}
          >
            💾 Sauvegarder
          </Button>
        </div>
        <MessageGeste geste={sauvegardeEnCours} />
      </section>

      <section className="mb-4 rounded-xl border border-papa-border bg-papa-surface p-5">
        <h2 className="mb-1 text-base font-semibold">Archives sur la cible</h2>
        <p className="mb-3 text-xs text-papa-muted">
          Vérifier = rejouer l'archive à blanc dans une base jetable (`zetis_verify`), détruite
          ensuite — la base vivante n'est jamais touchée. Une archive n'a droit au mot
          « sauvegarde » qu'après une restauration à blanc réussie.
        </p>
        {donnees.archives.length === 0 ? (
          <p className="text-sm text-papa-muted">
            Aucune archive sur la cible.
            {donnees.certificat.valable && " Le premier geste est à vous — 💾 Sauvegarder."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-papa-border text-left text-[11px] uppercase tracking-wide text-papa-muted">
                  <th className="py-2 pr-3 font-bold">Archive</th>
                  <th className="py-2 pr-3 font-bold">Créée</th>
                  <th className="py-2 pr-3 font-bold">Taille</th>
                  <th className="py-2 pr-3 font-bold">Empreinte</th>
                  <th className="py-2 pr-3 font-bold">Statut</th>
                  <th className="py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {donnees.archives.map((a) => {
                  const statut = statutArchive(a);
                  return (
                    <tr key={a.nom} className="border-b border-papa-border/60">
                      <td className="py-2.5 pr-3 font-mono text-xs">{a.nom}</td>
                      <td className="py-2.5 pr-3">{quand(a.cree_le)}</td>
                      <td className="py-2.5 pr-3">{taille(a.taille)}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs" title={a.sha256 ?? undefined}>
                        {a.sha256 ? `${a.sha256.slice(0, 12)}…` : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-semibold",
                            statut.classe,
                          )}
                        >
                          {statut.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="secondary"
                          disabled={gesteOccupe}
                          onClick={() => {
                            setVerification({ archive: a.nom, geste: "en-cours" });
                            lancerVerification(a.nom)
                              .then((r) => {
                                setVerification({
                                  archive: a.nom,
                                  geste: {
                                    genre: "accepte",
                                    texte: `Travail #${r.job_id} enfilé — le verdict s'affichera ici après ⟳.`,
                                  },
                                });
                                signalerEnfilement();
                              })
                              .catch((e: unknown) =>
                                setVerification({ archive: a.nom, geste: issue(e) }),
                              );
                          }}
                        >
                          ✓ Vérifier
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {verification && (
          <div className="mt-1">
            {verification.geste === "en-cours" && (
              <p className="mt-2 text-sm text-papa-muted">
                vérification de {verification.archive} en file…
              </p>
            )}
            <MessageGeste geste={verification.geste} />
          </div>
        )}
        {donnees.derniere_verification && (
          <p className="mt-3 border-t border-papa-border pt-3 text-xs text-papa-muted">
            Dernière vérification : {donnees.derniere_verification.archive} —{" "}
            {donnees.derniere_verification.verdict === "reussie"
              ? "réussie"
              : `en échec (${donnees.derniere_verification.ecarts} écart${
                  donnees.derniere_verification.ecarts > 1 ? "s" : ""
                })`}{" "}
            · {quand(donnees.derniere_verification.verifie_le)}
          </p>
        )}
      </section>

      <p className="text-xs text-papa-muted">
        🔴 Aucune archive ne se télécharge ici, et ce n'est pas un oubli : le dump porte toute la
        vie scolaire de Massimo et les empreintes de mots de passe — l'archive naît sur le disque
        cible et y reste (ADR-0065 §1). Restaurer, purger, exporter en lisible : phase E, pas
        cette page.
      </p>
    </div>
  );
}
