// Le suiveur de travail unique (ADR-0041 §4 et §9) — comment Papa attend un producteur migré.
//
// ## Ce que ce module remplace
//
// Quinze routes ne produisent plus rien elles-mêmes : elles rendent `202` et enfilent. Sans ce
// module, chaque écran aurait dû écrire sa propre boucle de sondage — c'est-à-dire refaire, à
// quinze exemplaires, exactement la dispersion que le §9 vient de supprimer sur les durées.
//
// Et il en supprime une autre, plus discrète : **les vingt-trois constantes de durée**. La durée
// attendue n'est plus devinée par l'écran, elle est **lue** (`estimated_ms`, servi par le serveur,
// qui la calcule comme la médiane des exécutions réussies de ce type de travail). Deux surfaces ne
// peuvent plus annoncer deux nombres pour le même travail : il n'y a plus qu'un nombre.
//
// ⚠️ **Les clients gardent leur signature.** `generateFiche(lessonId)` rend toujours une
// `FicheDetail` ; ce qui a changé, c'est qu'elle se résout après un sondage au lieu d'une requête
// de trente secondes. Aucun appelant n'a eu à être réécrit — et c'est voulu : une migration qui
// oblige vingt écrans à changer de forme est une migration qu'on n'ose plus finir.

import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";
import { signalerEnfilement } from "./productionSignal";

/** Ce qu'une barre locale a besoin de savoir, et rien de plus. */
export type EtatTravail = {
  status: string;
  /** Instant de démarrage **serveur**. `null` tant que le travail attend en file. */
  startedAtMs: number | null;
  /** Durée attendue, **mesurée par le serveur**. `null` s'il ne sait pas encore. */
  estimatedMs: number | null;
};

export type SuiviTravail = (e: EtatTravail) => void;

/** Période de sondage. Ce n'est PAS une estimation de durée — à ne pas confondre avec ce que le
 *  §9 interdit. 2 s : un travail court se voit finir vite, un long ne coûte rien. */
const POLL_MS = 2000;

/** Plafond de patience. Il existe pour qu'une panne du worker **finisse par se dire**, plutôt que
 *  de laisser une promesse pendante à jamais. La barre du header, elle, dit « arrêté » bien avant
 *  (`worker_alive: false`). */
const PLAFOND_MS = 15 * 60_000;

type ReponseJob = {
  status: string;
  output: unknown;
  error: string | null;
  started_at: string | null;
  estimated_ms: number | null;
};

/** Lance un travail (route `202`), puis SONDE jusqu'à son issue. Rend `output`.
 *
 *  ⚠️ **`signalerEnfilement()` n'est appelé qu'APRÈS le succès du POST.** Un réveil de la barre sur
 *  un refus (409 du régulateur, 503 de file injoignable, 409 d'un gate) lui ferait chercher un
 *  travail qui n'existe pas — et clignoter juste après un refus, c'est-à-dire au pire moment.
 *
 *  ⚠️ **L'échec est levé avec le motif du SERVEUR**, tel quel. Un motif d'échec n'est pas un texte
 *  d'interface : il sert à savoir quoi réparer (décision du 2026-08-06, `barre-de-production.md`).
 */
export async function lancerEtSuivre<T>(
  url: string,
  init: RequestInit,
  onEtat?: SuiviTravail,
): Promise<T> {
  const { job_id } = await asJson<{ job_id: number; status: string }>(await fetch(url, init));
  signalerEnfilement();
  onEtat?.({ status: "queued", startedAtMs: null, estimatedMs: null });
  return suivre<T>(job_id, onEtat);
}

/** Sonde un travail déjà enfilé. Séparé de `lancerEtSuivre` parce que certaines surfaces
 *  retrouvent un travail qu'elles n'ont pas lancé (un rechargement de page pendant l'exécution). */
export async function suivre<T>(jobId: number, onEtat?: SuiviTravail): Promise<T> {
  const debut = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const job = await asJson<ReponseJob>(
      await fetch(`${API_URL}/api/ai/jobs/${jobId}`, { headers: authHeader() }),
    );
    onEtat?.({
      status: job.status,
      startedAtMs: job.started_at ? Date.parse(job.started_at) : null,
      estimatedMs: job.estimated_ms,
    });
    if (job.status === "succeeded") return job.output as T;
    if (job.status === "failed") throw new Error(job.error ?? "Ce travail a échoué.");
    if (Date.now() - debut > PLAFOND_MS) {
      throw new Error(
        "Le travail n'a pas répondu — vérifie qu'un moteur de production tourne (barre du header).",
      );
    }
  }
}
