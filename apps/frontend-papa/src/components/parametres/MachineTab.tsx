// 🧠 L'onglet La machine (ADR-0062 §2) — qui fait quoi, et est-ce que ça tourne.
//
// **Un seul écran, parce que c'est une seule question.** Quand une génération échoue, il faut
// « Ollama est-il joignable ? » ET « quel modèle ? » dans la même seconde. La maquette en faisait
// deux onglets ; les tenir séparés obligeait à garder un écran en mémoire pendant qu'on lisait
// l'autre.
//
// 🔴 **Aucun champ éditable ici.** Ni `<select>`, ni `<input>` : seuls « Tester le moteur » et
// « Acquitter » sont actionnables, et un test-verrou le tient. Le routage vit en variables
// d'environnement lues au démarrage — un déroulant serait mort, ou serait un autre chantier.
//
// 🔴 **Aucun sondage.** Le rafraîchissement est un bouton. Une page de réglages qui bouge toute
// seule ferait glisser un champ sous les doigts (§5).
import { useCallback, useEffect, useState } from "react";
import { Button, cn } from "@zetis/ui";
import { type EtatSonde, type Machine, type TestMoteur } from "@zetis/types";

import { acquitterEchec, fetchMachine, testMoteur } from "../../lib/settings";

const TON_SONDE: Record<EtatSonde, string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  degrade: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  ko: "border-rose-400/40 bg-rose-400/10 text-rose-200",
};

function Carte({ titre, enfants }: { titre: string; enfants: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-papa-border bg-papa-surface p-5">
      <h2 className="mb-3 text-base font-semibold">{titre}</h2>
      {enfants}
    </section>
  );
}

function secondes(ms: number | null): string {
  // `null` reste `—` : zéro n'est pas une durée courte, c'est une absence de réponse.
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace(".", ",")} s` : `${ms} ms`;
}

export function MachineTab() {
  const [machine, setMachine] = useState<Machine | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState<TestMoteur | "en-cours" | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    fetchMachine()
      .then(setMachine)
      .catch((e: unknown) => {
        // 🔴 On VIDE l'état : à l'erreur de lecture, aucun réglage n'est affiché. Garder l'ancien
        // instantané montrerait des sondes vertes pendant que le serveur est injoignable — le
        // mensonge exact que la règle §6 interdit.
        setMachine(null);
        setErreur(e instanceof Error ? e.message : "lecture impossible");
      });
  }, []);

  useEffect(charger, [charger]);

  if (erreur) {
    return (
      <div className="rounded-xl border border-papa-warn/40 bg-papa-warn/10 p-5">
        <p className="font-semibold text-papa-warn">État de la machine illisible — {erreur}</p>
        <p className="mt-2 text-sm text-papa-muted">
          Aucune valeur n'est affichée : un chiffre faux, sur cet écran, ferait chercher une panne
          au mauvais endroit.
        </p>
        <Button className="mt-3" onClick={charger}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="rounded-xl border border-papa-border bg-papa-surface p-5 text-sm text-papa-muted">
        Lecture de l'état de la machine…
      </div>
    );
  }

  // 🔴 Le compte vient du SERVEUR, jamais de `lignes.length` : la liste est plafonnée.
  const nonAcquittes = machine.echecs.non_acquittes;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {machine.sondes.map((s) => (
            <span
              key={s.nom}
              title={s.detail}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                TON_SONDE[s.etat],
              )}
            >
              ● {s.nom}
              {s.latence_ms !== null && ` · ${s.latence_ms} ms`}
            </span>
          ))}
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              machine.cle_anthropic_presente ? TON_SONDE.ok : TON_SONDE.degrade,
            )}
          >
            {/* 🔴 Sa PRÉSENCE, jamais sa valeur. */}
            ● clé Anthropic {machine.cle_anthropic_presente ? "présente" : "absente"}
          </span>
        </div>
        {/* Le rafraîchissement est un GESTE. Aucun `setInterval` n'existe dans ce fichier. */}
        <Button variant="secondary" onClick={charger}>
          ⟳ Rafraîchir
        </Button>
      </div>

      {machine.sondes.some((s) => s.etat === "degrade") && (
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
          <b>Un service répond, mais pas ce qu'on attend de lui.</b> C'est la panne qui se déguise
          en bug de code : si le volume des modèles n'est pas monté, Ollama démarre avec zéro
          modèle et répond « model not found » — exactement le message d'un modèle mal nommé.
          <ul className="mt-2 list-disc pl-5">
            {machine.sondes
              .filter((s) => s.etat === "degrade")
              .map((s) => (
                <li key={s.nom}>
                  <b>{s.nom}</b> — {s.detail}
                </li>
              ))}
          </ul>
        </div>
      )}

      <Carte
        titre="Qui fait quoi"
        enfants={
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-papa-border text-left text-[11px] uppercase tracking-wide text-papa-muted">
                    <th className="py-2 pr-3 font-bold">Tâche</th>
                    <th className="py-2 pr-3 font-bold">Moteur</th>
                    <th className="py-2 pr-3 font-bold">Modèle</th>
                    <th className="py-2 pr-3 font-bold">Où</th>
                    <th className="py-2 font-bold">Ce qui part</th>
                  </tr>
                </thead>
                <tbody>
                  {machine.moteurs.map((m) => (
                    <tr key={m.tache} className="border-b border-papa-border/60">
                      <td className="py-2.5 pr-3">
                        {m.tache}
                        {m.motif && <span title={m.motif}> 🔒</span>}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{m.moteur}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{m.modele}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-semibold",
                            m.ou === "local"
                              ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                              : "border-violet-400/30 bg-violet-400/10 text-violet-200",
                          )}
                        >
                          {m.ou === "local" ? "🏠 local" : "☁️ dérogation"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-papa-muted">{m.ce_qui_part}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-papa-muted">
              🔴 Le local/cloud par tâche n'est pas un réglage, c'est de la doctrine. Un déroulant
              permettrait d'expédier les données de Massimo chez un tiers d'un clic — on l'affiche,
              on le verrouille, et on dit pourquoi.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-papa-border pt-4">
              <Button
                onClick={() => {
                  setEssai("en-cours");
                  testMoteur()
                    .then(setEssai)
                    .catch(() =>
                      setEssai({
                        ok: false,
                        latence_ms: 0,
                        modele: "—",
                        detail: "l'essai n'a pas abouti",
                      }),
                    );
                }}
                disabled={essai === "en-cours"}
              >
                ▶︎ Tester le moteur
              </Button>
              {essai === "en-cours" && (
                <span className="text-sm text-papa-muted">un vrai appel est en cours…</span>
              )}
              {essai && essai !== "en-cours" && (
                <span
                  className={cn("text-sm", essai.ok ? "text-emerald-300" : "text-rose-300")}
                >
                  {essai.ok ? "✅" : "❌"} {essai.detail} · {secondes(essai.latence_ms)} ·{" "}
                  <span className="font-mono text-xs">{essai.modele}</span>
                </span>
              )}
            </div>
          </>
        }
      />

      <Carte
        titre={`Échecs${nonAcquittes ? ` — ${nonAcquittes} non acquitté${nonAcquittes > 1 ? "s" : ""}` : ""}`}
        enfants={
          machine.echecs.total === 0 ? (
            <p className="text-sm text-papa-muted">Aucun échec enregistré.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {machine.echecs.lignes.map((e) => (
                  <tr key={e.id} className="border-b border-papa-border/60">
                    <td className="py-2.5 pr-3 whitespace-nowrap font-mono text-xs text-papa-muted">
                      {new Date(e.quand).toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2.5 pr-3">{e.job_type}</td>
                    {/* Le message du serveur, relayé TEL QUEL : c'est la vraie demande derrière
                        « les logs ». */}
                    <td className="py-2.5 pr-3 font-mono text-xs text-rose-300">{e.message}</td>
                    <td className="py-2.5 text-right">
                      {e.acquitte ? (
                        <span className="text-xs text-papa-muted">acquitté</span>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => acquitterEchec(e.id).then(charger)}
                        >
                          Acquitter
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      />

      {machine.echecs.total > machine.echecs.lignes.length && (
        <p className="-mt-2 mb-4 px-1 text-xs text-papa-muted">
          {/* Jamais de plafond muet : une liste tronquée qui ne le dit pas se lit comme un total. */}
          Les {machine.echecs.lignes.length} plus récents sur {machine.echecs.total} enregistrés.
        </p>
      )}

      <Carte
        titre="Ce qui tourne"
        enfants={
          <>
            <p className="text-sm text-papa-muted">
              {machine.file.en_cours} en cours · {machine.file.en_attente} en file
            </p>
            {machine.workers.length === 0 ? (
              <p className="mt-2 text-sm text-papa-muted">
                Aucun worker vu — ou Redis est injoignable (voir les sondes).
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {machine.workers.map((w) => (
                  <li key={w.nom} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{w.nom}</span>
                    <span className="text-xs text-papa-muted">· {w.file}</span>
                    {w.age_minutes !== null && (
                      <span
                        className={cn(
                          "text-xs",
                          w.age_minutes > 120 ? "text-amber-300" : "text-papa-muted",
                        )}
                      >
                        démarré il y a {w.age_minutes} min
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-papa-muted">
              🔴 « Vivant » ne veut pas dire « à jour » : un <code>SimpleWorker</code> RQ ne
              recharge jamais le code. Un worker plus vieux que le dernier déploiement répond
              « aucun exécutant » — un message qui se lit comme un bug du code.
            </p>
          </>
        }
      />

      <Carte
        titre="7 derniers jours"
        enfants={
          machine.sept_derniers_jours.length === 0 ? (
            <p className="text-sm text-papa-muted">Aucun travail de file sur la période.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-papa-border text-left text-[11px] uppercase tracking-wide text-papa-muted">
                    <th className="py-2 pr-3 font-bold">Travail</th>
                    <th className="py-2 pr-3 font-bold">Réussis</th>
                    <th className="py-2 pr-3 font-bold">Échoués</th>
                    <th className="py-2 font-bold">Durée médiane</th>
                  </tr>
                </thead>
                <tbody>
                  {machine.sept_derniers_jours.map((s) => (
                    <tr key={s.job_type} className="border-b border-papa-border/60">
                      <td className="py-2.5 pr-3">{s.job_type}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{s.reussis}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{s.echoues}</td>
                      <td className="py-2.5 font-mono text-xs">{secondes(s.mediane_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-papa-muted">
                Une médiane serveur, une source — là où 23 surfaces déclaraient chacune leur durée
                en dur, dont une seule mesurée. Les traces d'appels ne comptent pas ici.
              </p>
            </>
          )
        }
      />

      <Carte
        titre="Ce qui est sorti de la maison"
        enfants={
          !machine.sorties_reseau.actif ? (
            <p className="text-sm text-papa-muted">
              Aucune tâche n'est routée hors de la maison. La génération est 100 % locale.
            </p>
          ) : (
            <>
              <p className="text-sm text-papa-muted">
                Destinataire : <span className="font-mono">{machine.sorties_reseau.destinataire}</span>{" "}
                · {machine.sorties_reseau.total} appel(s) sur 30 jours
                {machine.sorties_reseau.total > machine.sorties_reseau.appels.length &&
                  ` — les ${machine.sorties_reseau.appels.length} plus récents ci-dessous`}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {machine.sorties_reseau.appels.map((a, i) => (
                  <li key={`${a.tache}-${i}`} className="text-papa-muted">
                    <span className="font-mono text-xs">
                      {new Date(a.quand).toLocaleDateString("fr-FR")}
                    </span>{" "}
                    · {a.tache} · {a.classe_de_donnees}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-papa-muted">
                Ce n'est pas un tableau de coût, c'est un <b>journal de confidentialité</b>. Il est
                dérivé du type de travail : <code>ai_jobs</code> ne trace pas le moteur employé.
              </p>
            </>
          )
        }
      />

      <Carte
        titre="Ce qui se règle en .env — visible, jamais éditable"
        enfants={
          <table className="w-full text-sm">
            <tbody>
              {machine.reglages_env.map((r) => (
                <tr key={r.variable} className="border-b border-papa-border/60">
                  <td className="py-2.5 pr-3">{r.nom}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {r.variable} = {r.valeur}
                  </td>
                  <td className="py-2.5 text-xs text-papa-muted">{r.motif}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />

      <Carte
        titre="Prompts actifs"
        enfants={
          <>
            <div className="flex flex-wrap gap-2">
              {machine.prompts.map((p) => (
                <span
                  key={`${p.module}.${p.constante}`}
                  className="rounded-full border border-papa-border bg-papa-surface/60 px-2.5 py-1 font-mono text-xs text-papa-muted"
                >
                  {p.module} · {p.version}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-papa-muted">
              🚫 Aucun champ éditable : un curseur « ton » ou « longueur » fabriquerait une
              génération non tracée et rendrait le corpus incomparable dans le temps. Un ton qui
              change, c'est une nouvelle version de prompt.
            </p>
          </>
        }
      />

      <Carte
        titre="Version installée"
        enfants={
          <>
            <p className="text-sm">
              <span className="text-papa-muted">Version</span>{" "}
              <span className="font-mono">{machine.installation.version}</span>
              {machine.installation.alembic_head && (
                <>
                  {" · "}
                  <span className="text-papa-muted">tête Alembic</span>{" "}
                  <span className="font-mono">{machine.installation.alembic_head}</span>
                </>
              )}
            </p>
            {machine.installation.mot_de_passe_dev_en_place && (
              <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
                <b>⚠️ Le mot de passe de développement est en place.</b> Procédure de rotation sans
                perte de données : <code>DEPLOYMENT.md</code>.
              </div>
            )}
            <p className="mt-3 text-xs text-papa-muted">
              On affiche, on ne lance pas : une mise à jour qui échoue à mi-chemin laisserait
              l'application dans un état que cette page ne pourrait plus décrire.
            </p>
          </>
        }
      />
    </div>
  );
}
