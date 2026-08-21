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
import { Button, ConfirmDialog, Input, cn } from "@zetis/ui";
import { type ArchiveSauvegarde, type Donnees } from "@zetis/types";

import { estRefus } from "../../lib/httpClient";
import { signalerEnfilement } from "../../lib/productionSignal";
import {
  fetchDonnees,
  lancerRestauration,
  lancerSauvegarde,
  lancerVerification,
  supprimerArchive,
} from "../../lib/settings";

/** La saisie qui arme « Restaurer » (ADR-0066 §7) : geste de classe A4, un clic ne suffit pas.
 *  Le MOT plutôt que le nom d'archive — le dialogue nomme déjà l'archive, et un nom de 25
 *  caractères à recopier transformerait la confirmation en épreuve de dactylographie. */
const MOT_DE_CONFIRMATION = "RESTAURER";

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
  const [restauration, setRestauration] = useState<{ archive: string; geste: Geste } | null>(null);
  const [suppression, setSuppression] = useState<{ archive: string; geste: Geste } | null>(null);
  // Les DIALOGUES (ADR-0066 §7) : chacun nomme l'archive qu'il vise — jamais un « êtes-vous
  // sûr ? » anonyme. La saisie n'existe que pour Restaurer (classe A4) ; Supprimer confirme
  // sans saisie.
  const [aRestaurer, setARestaurer] = useState<ArchiveSauvegarde | null>(null);
  const [saisie, setSaisie] = useState("");
  const [aSupprimer, setASupprimer] = useState<ArchiveSauvegarde | null>(null);

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
  const gesteOccupe =
    sauvegardeEnCours === "en-cours" ||
    verification?.geste === "en-cours" ||
    restauration?.geste === "en-cours" ||
    suppression?.geste === "en-cours";

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
          « sauvegarde » qu'après une restauration à blanc réussie — et Restaurer ne s'offre
          qu'à elle : le mot se mérite dans les deux sens.
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
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {a.nom}
                        {/* L'état du dernier geste (ADR-0067 §2) — du sidecar
                            `.restauration.json`, seul survivant : la ligne du travail est morte
                            au swap, c'est ici que l'histoire se lit.
                            ⚠️ Cette slice ne rend QUE le succès. Le serveur sait désormais
                            qu'un geste s'est interrompu (`verdict: "interrompue"`, son étape,
                            son motif) — l'état persistant qui le MONTRE est la slice 2 (§3). */}
                        {a.restauration?.termine_le && (
                          <span className="mt-0.5 block font-sans text-[11px] text-papa-muted">
                            ↺ restaurée le {quand(a.restauration.termine_le)}
                          </span>
                        )}
                      </td>
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
                        <div className="flex justify-end gap-2">
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
                          {/* « Restaurer » n'APPARAÎT que sur une archive au verdict `reussie`
                              (ADR-0066 §7) — la compatibilité (§5), elle, GRISE avec son motif :
                              deux verdicts, deux traitements (un cadenas muet se lirait comme
                              une panne, adr-0062 §6). */}
                          {a.verification?.verdict === "reussie" && (
                            <Button
                              variant="secondary"
                              disabled={gesteOccupe || !a.restaurable}
                              title={a.motif ?? undefined}
                              onClick={() => {
                                setSaisie("");
                                setARestaurer(a);
                              }}
                            >
                              ↺ Restaurer
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="text-rose-300 hover:text-rose-200"
                            disabled={gesteOccupe}
                            onClick={() => setASupprimer(a)}
                          >
                            🗑 Supprimer
                          </Button>
                        </div>
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
        {restauration && (
          <div className="mt-1">
            {restauration.geste === "en-cours" && (
              <p className="mt-2 text-sm text-papa-muted">
                restauration de {restauration.archive} en file…
              </p>
            )}
            <MessageGeste geste={restauration.geste} />
          </div>
        )}
        {suppression && (
          <div className="mt-1">
            <MessageGeste geste={suppression.geste} />
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
        cible et y reste (ADR-0065 §1). Purger en masse, faire tourner les archives, exporter en
        lisible : d'autres sous-chantiers de la phase E, pas cette page.
      </p>

      {/* Le dialogue RESTAURER (ADR-0066 §7) : il nomme l'archive, énonce la séquence — filet
          compris — et EXIGE une saisie (classe A4, un clic ne suffit pas). Renoncer ne coûte
          rien : Échap, l'overlay ou « Annuler ». */}
      <ConfirmDialog
        open={aRestaurer !== null}
        tone="danger"
        title={`Restaurer « ${aRestaurer?.nom ?? ""} » ?`}
        confirmLabel="Restaurer cette archive"
        busy={restauration?.geste === "en-cours"}
        confirmDisabled={saisie.trim() !== MOT_DE_CONFIRMATION}
        onCancel={() => {
          setARestaurer(null);
          setSaisie("");
        }}
        onConfirm={() => {
          const archive = aRestaurer;
          // Ceinture ET bretelles : le bouton est désactivé sans la saisie, et le geste ne part
          // pas non plus si ce garde tombait — un clic seul ne restaure JAMAIS.
          if (!archive || saisie.trim() !== MOT_DE_CONFIRMATION) return;
          setRestauration({ archive: archive.nom, geste: "en-cours" });
          lancerRestauration(archive.nom)
            .then((r) => {
              setRestauration({
                archive: archive.nom,
                geste: {
                  genre: "accepte",
                  texte: `Travail #${r.job_id} enfilé — ZETIS bascule sur cette archive. La ligne disparaîtra de la barre au moment de la bascule (c'est prévu : son journal vit sur la cible) ; ⟳ ensuite pour relire l'état.`,
                },
              });
              signalerEnfilement();
              setARestaurer(null);
              setSaisie("");
            })
            .catch((e: unknown) => {
              // Un 409 est un REFUS motivé (préconditions du §2) — il s'affiche en ambre sous
              // le tableau, pas dans le dialogue : le dialogue se ferme, le motif dit quoi faire.
              setRestauration({ archive: archive.nom, geste: issue(e) });
              setARestaurer(null);
              setSaisie("");
            });
        }}
      >
        <div className="space-y-3">
          <p>
            ZETIS remplace l'état vivant par cette archive. La séquence : une{" "}
            <strong>sauvegarde-filet de l'état actuel</strong> d'abord (si elle échoue, rien
            n'est remplacé) → l'archive est rejouée dans une base de travail → bascule en
            quelques millisecondes (les requêtes en vol échouent) → médias remplacés → files
            purgées → migrations rejouées → le worker se recycle.
          </p>
          <p>
            Au réveil, ZETIS est <strong>suspendu</strong>, en régime Manual, déclencheur
            désarmé — c'est vous qui relèverez. L'état d'avant reste en repli immédiat
            (`zetis_avant`, écrasé au prochain geste), en plus de la sauvegarde-filet.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide">
              Tapez {MOT_DE_CONFIRMATION} pour armer le geste
            </span>
            <Input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder={MOT_DE_CONFIRMATION}
              aria-label="saisie de confirmation"
            />
          </label>
        </div>
      </ConfirmDialog>

      {/* Le dialogue SUPPRIMER (§6-§7) : il nomme l'archive, sans saisie — le serveur garde de
          toute façon la dernière archive vérifiée (409 motivé : jamais zéro filet). */}
      <ConfirmDialog
        open={aSupprimer !== null}
        tone="danger"
        title={`Supprimer « ${aSupprimer?.nom ?? ""} » ?`}
        confirmLabel="Supprimer cette archive"
        busy={suppression?.geste === "en-cours"}
        onCancel={() => setASupprimer(null)}
        onConfirm={() => {
          const archive = aSupprimer;
          if (!archive) return;
          setSuppression({ archive: archive.nom, geste: "en-cours" });
          supprimerArchive(archive.nom)
            .then((r) => {
              setSuppression({
                archive: archive.nom,
                geste: {
                  genre: "accepte",
                  texte: `Archive ${r.archive} supprimée — ${r.supprimes.length} fichier(s) retirés de la cible.`,
                },
              });
              setASupprimer(null);
              charger();
            })
            .catch((e: unknown) => {
              setSuppression({ archive: archive.nom, geste: issue(e) });
              setASupprimer(null);
            });
        }}
      >
        <p>
          Le tar et tous ses sidecars (empreinte, manifeste, journal de restauration) sont
          retirés de la cible. Aucune rotation automatique n'existe : ce geste est le seul qui
          supprime — et rien ne se récupère ensuite.
        </p>
      </ConfirmDialog>
    </div>
  );
}
