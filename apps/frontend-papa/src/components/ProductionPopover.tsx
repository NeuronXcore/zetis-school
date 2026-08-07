import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useEstimatedProgress } from "@zetis/ui";
import { type ActivityItem, type ProductionActivity } from "@zetis/types";

import { depuis } from "../lib/depuis";

// Le détail de ce que ZETIS fabrique, ouvert depuis la bande (addendum 2 ADR-0041 §23).
//
// Remplace `ActiveProductionModal`. Ce n'est pas un changement d'habillage : une modale arrête
// tout pour montrer un état qu'on consulte en passant. Le popover se ferme au premier clic à côté
// et à `Escape` — deux gestes que la modale n'avait NI l'UN NI L'AUTRE.
//
// ⚠️ **Les sept invariants de la modale sont portés, pas supprimés** : l'ordre de service visible,
// l'origine toujours dite, aucun pourcentage sur ce qui attend, l'échec avec son motif et son
// acquittement, la troncature déclarée, le résumé qui compte les STATUTS, l'état vide.

/** D'où vient ce travail, en mots de Papa (§7).
 *
 *  ⚠️ Sans cela, Papa ouvre son écran à 8 h et voit ZETIS travailler sur quelque chose qu'il n'a
 *  pas demandé, sans pouvoir savoir pourquoi. */
const ORIGINE: Record<string, string> = {
  manual: "lancé par vous",
  agenda: "préparé pour une échéance",
  request: "demandé par Massimo",
};

const COULOIR: Record<string, string> = {
  llm: "couloir LLM",
  media: "couloir média",
};

/** Ce qui rouvrira un travail refusé, par régulateur.
 *
 * 🔴 **Une phrase générique mentait sur un cas sur cinq.** Le popover disait « reprendra dès que la
 * limite sera levée » pour tous les refus — or `already_produced` ne reprendra **jamais** : il est
 * satisfait par construction, le contenu existe déjà. Papa attendait donc une production qui ne
 * viendrait pas, et rien à l'écran ne le détrompait.
 *
 * ⚠️ Vocabulaire fermé, aligné sur `REGULATORS` côté serveur. Un code inconnu ne se rend pas : le
 * repli est le silence, jamais une promesse inventée. */
const REPRISE: Record<string, string> = {
  duplicate: "reprendra quand le lot en cours sera fini",
  already_produced: "ne reprendra pas — ce contenu existe déjà",
  pending_backlog: "reprendra après relecture",
  request_volume: "reprendra quand la fenêtre de 7 jours se sera dégagée",
  auto_volume: "reprendra quand la fenêtre de 7 jours se sera dégagée",
};

/** Ce qui se passe · depuis quand · qui l'a demandé — en une phrase, pas en codes.
 *
 * Le popover encodait ce que la maquette explique : `37 %` isolé dans une colonne de droite,
 * `en file — 1ᵉʳ` en langage abrégé, et l'origine seule en sous-titre. Papa recomposait trois
 * fragments ; il lit désormais une ligne.
 *
 * ⚠️ **Fonction PURE et exportée** : sept branches dans le JSX ne se testent qu'en rendant sept
 * fois le composant. Ici chaque état se vérifie par un appel.
 *
 * @param ilYADuTravail  quelque chose TOURNE-t-il vraiment ? ⚠️ Sans ce drapeau, une file arrêtée
 *   afficherait « derrière le lot en cours » alors que rien ne tourne — exactement la faute du
 *   résumé « 1 en cours » corrigée à l'écran le 2026-08-06.
 */
export function sousTitre(
  item: ActivityItem,
  rang: number | null,
  ilYADuTravail: boolean,
  estime: number,
  maintenant?: number,
): string {
  // L'échec remplace TOUT : son motif est la seule chose qui compte, et il est rendu tel quel.
  if (item.status === "failed") {
    return item.error ?? "ce travail a échoué, sans motif enregistré";
  }

  const origine = ORIGINE[item.trigger ?? ""] ?? "origine non enregistrée";
  const morceaux: string[] = [];

  if (item.status === "stale") {
    morceaux.push("arrêté — plus rien ne l'exécute");
  } else if (item.status === "queued") {
    // Le RANG reste, même si la maquette l'abandonne : « derrière le lot en cours » ne distingue
    // pas le 1ᵉʳ du 3ᵉ, et la priorité doit être VISIBLE, pas seulement vraie.
    const place = rang ? `${rang}${rang === 1 ? "ᵉʳ" : "ᵉ"} dans la file` : "en file";
    morceaux.push(ilYADuTravail ? `${place}, derrière le lot en cours` : place);
  } else if (item.lane === "media") {
    // Le couloir média a son propre worker : le dire évite de le lire comme un travail de plus
    // dans la file de production.
    morceaux.push("en cours · couloir séparé, ne retarde rien");
  } else if (item.pct_is_measured && item.pieces_total) {
    // 🔴 La FRACTION, pas le seul pourcentage : « 37 % » ne se distingue pas d'une estimation bien
    // tournée, « 7 / 19 pièces » prouve que le serveur compte vraiment.
    morceaux.push(`${item.pieces_done ?? 0} / ${item.pieces_total} pièces`);
  } else {
    morceaux.push(`≈ ${estime} %`);
  }

  const anciennete = depuis(item.started_at, maintenant);
  if (anciennete) morceaux.push(`démarré ${anciennete}`);
  // ⚠️ L'origine SURVIT à la fusion (arbitrage du 2026-08-07). La maquette la supprimait ; sans
  // elle, Papa ouvre son écran à 8 h et voit ZETIS travailler sur quelque chose qu'il n'a pas
  // demandé, sans pouvoir savoir pourquoi.
  morceaux.push(origine);

  return morceaux.join(" · ");
}

function Ligne({
  item,
  rang,
  ilYADuTravail,
  onAcknowledge,
}: {
  item: ActivityItem;
  /** Position dans la file, à partir de 1. `null` pour le travail courant et pour un échec. */
  rang: number | null;
  /** Quelque chose TOURNE-t-il vraiment ? Décide de « derrière le lot en cours ». */
  ilYADuTravail: boolean;
  onAcknowledge?: (kind: "run" | "job" | "refusal", id: number) => void;
}) {
  // ⚠️ Appelé sans condition — un hook ne se saute pas. `active` décide, et il est faux tant que
  // le travail n'a pas démarré : une barre qui monte sur un travail en file mentirait.
  // ⚠️ La durée vient du SERVEUR, par type de travail (§9). C'est ici que vit désormais la seule
  // estimation de l'en-tête : la bande, elle, n'affiche AUCUN chiffre sans granularité.
  const estime = useEstimatedProgress(
    item.status === "running" && !item.pct_is_measured && item.estimated_ms > 0,
    item.estimated_ms,
    item.started_at ? Date.parse(item.started_at) : null,
  );

  const enEchec = item.status === "failed";
  const arrete = item.status === "stale";
  const enCours = item.status === "running";
  const pastille = enEchec
    ? "bg-red-400"
    : arrete
      ? "bg-papa-warn"
      : enCours
        ? "bg-papa-accent shadow-[0_0_8px_var(--color-papa-accent)]"
        : "bg-papa-border";

  return (
    <li className={`flex gap-2.5 rounded-lg p-2 ${enEchec ? "bg-red-400/5" : "hover:bg-white/[.03]"}`}>
      <span aria-hidden className={`mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${pastille}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-papa-text">{item.label}</span>
        {/* ⚠️ **Tout l'état tient dans cette phrase**, y compris ce qui vivait à droite. La colonne
            de droite ne garde que le geste — c'est ce qui rend la ligne lisible d'un seul regard. */}
        <span className={`block text-[10.5px] ${enEchec ? "text-red-300" : "text-papa-muted"}`}>
          {sousTitre(item, rang, ilYADuTravail, estime)}
        </span>
        {/* ⚠️ Le couloir se DIT : un rendu vidéo ne retarde pas la production, et sans ce mot
            Papa le lirait comme un travail de plus dans la même file. */}
        <span className="mt-0.5 inline-block rounded border border-papa-border px-1.5 py-px text-[9px] uppercase tracking-wider text-papa-muted">
          {COULOIR[item.lane] ?? item.lane}
        </span>
      </span>
      {enEchec && onAcknowledge && (
        <button
          type="button"
          onClick={() => onAcknowledge(item.kind, item.id)}
          className="h-fit shrink-0 rounded-full border border-red-400/45 px-2 py-0.5 text-[10px] font-semibold text-red-300 hover:bg-red-400/15"
        >
          J'ai vu
        </button>
      )}
    </li>
  );
}

export function ProductionPopover({
  activity,
  onClose,
  onAcknowledge,
}: {
  activity: ProductionActivity;
  onClose: () => void;
  onAcknowledge: (kind: "run" | "job" | "refusal", id: number) => void;
}) {
  const { current, queued, failed, refused, queued_count } = activity;
  const rien =
    !current && queued.length === 0 && failed.length === 0 && refused.length === 0;
  // ⚠️ Le serveur borne la file à 20 et `queued_count` dit le TOTAL. Une troncature muette se
  // lirait comme une exhaustivité : on la déclare.
  const masques = Math.max(0, queued_count - queued.length);
  // Le travail « courant » compte comme EN ATTENTE tant qu'il n'a pas démarré.
  const attendent = queued_count + (current && current.status !== "running" ? 1 : 0);
  const suivis = (current ? 1 : 0) + queued.length + failed.length;
  // ⚠️ **`current` n'est pas forcément EN COURS** : quand rien ne tourne, il porte le premier de la
  // file. Ce drapeau décide si les lignes en attente ont le droit de dire « derrière le lot en
  // cours » — sur une file arrêtée, la phrase serait fausse.
  const ilYADuTravail = current?.status === "running";

  const boite = useRef<HTMLDivElement | null>(null);

  // Deux fermetures que la modale n'avait pas. Un panneau qu'on ne peut fermer que par un bouton
  // se referme mal, donc reste ouvert, donc masque l'écran qu'il commente.
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const aCote = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", auClavier);
    // ⚠️ `mousedown` et non `click`, en phase de CAPTURE : posé sur `click`, l'écouteur voyait le
    // clic qui vient d'ouvrir le panneau et le refermait dans la foulée.
    document.addEventListener("mousedown", aCote, true);
    return () => {
      document.removeEventListener("keydown", auClavier);
      document.removeEventListener("mousedown", aCote, true);
    };
  }, [onClose]);

  return (
    <div
      ref={boite}
      role="dialog"
      aria-label="Travaux en cours"
      className="absolute right-3 top-full z-40 mt-1.5 w-[340px] rounded-xl border border-papa-border bg-papa-surface-2 p-1.5 shadow-[0_18px_46px_rgba(0,0,0,.6)]"
    >
      <h3 className="mx-2 mb-2 mt-1.5 flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-[.14em] text-papa-muted">
        Travaux en cours
        <span className="tracking-normal">
          {/* ⚠️ **Le compte suit les STATUTS, pas la présence d'un objet.** `current` n'est pas
              forcément EN COURS : quand rien ne tourne il porte le premier de la file, et le
              résumé disait « 1 en cours » sur une file arrêtée pendant que la ligne juste en
              dessous disait « en file ». Vu à l'écran le 2026-08-06. */}
          {rien
            ? "rien en vol"
            : [
                current?.status === "running" ? "1 en cours" : null,
                attendent ? `${attendent} en attente` : null,
                failed.length ? `${failed.length} échec${failed.length > 1 ? "s" : ""}` : null,
                refused.length ? `${refused.length} refus` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </h3>

      <ul className="max-h-[50vh] overflow-y-auto">
        {failed.map((f) => (
          <Ligne
            key={`f-${f.kind}-${f.id}`}
            item={f}
            rang={null}
            ilYADuTravail={ilYADuTravail}
            onAcknowledge={onAcknowledge}
          />
        ))}
        {/* 🔴 **Le rang compte depuis le HAUT de la liste, pas depuis le travail courant.** Vu à
            l'écran le 2026-08-07 : quand rien ne tourne, `current` porte le premier de la file et
            s'affichait sans rang, pendant que la ligne juste EN DESSOUS s'annonçait « 1ᵉʳ ». La
            seconde ligne prétendait être la première. Le rang était compté « derrière le travail
            en cours », ce qui n'a de sens que s'il y en a un. */}
        {current && (
          <Ligne
            key={`c-${current.kind}-${current.id}`}
            item={current}
            rang={ilYADuTravail ? null : 1}
            ilYADuTravail={ilYADuTravail}
          />
        )}
        {queued.map((q, i) => (
          <Ligne
            key={`q-${q.kind}-${q.id}`}
            item={q}
            rang={ilYADuTravail ? i + 1 : i + 2}
            ilYADuTravail={ilYADuTravail}
          />
        ))}

        {/* Les refus : un régulateur a dit non. ⚠️ Ton AMBRE, jamais rouge — ce n'est pas une
            panne, c'est une limite que Papa a lui-même posée, et le popover dit ce qui la lèvera. */}
        {refused.map((r) => (
          <li key={`r-${r.id}`} className="flex gap-2.5 rounded-lg bg-papa-warn/5 p-2">
            <span aria-hidden className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-papa-warn" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-papa-text">Rien lancé</span>
              {/* Le motif TEL QUEL : une table « technique → phrase douce » a été écartée (§8). */}
              <span className="block text-[10.5px] text-papa-warn/90">{r.detail}</span>
              {/* 🔴 **Ce qui rouvrira CE refus, pas une formule générale.** « reprendra dès que la
                  limite sera levée » était faux pour `already_produced`, qui ne reprendra jamais :
                  Papa attendait une production qui ne viendrait pas. Un code inconnu ne dit rien
                  plutôt que d'inventer une promesse. */}
              <span className="text-[10px] text-papa-muted">
                {[ORIGINE[r.trigger] ?? "origine non enregistrée", REPRISE[r.regulator]]
                  .filter(Boolean)
                  .join(" — ")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onAcknowledge("refusal", r.id)}
              className="h-fit shrink-0 rounded-full border border-papa-warn/45 px-2 py-0.5 text-[10px] font-semibold text-papa-warn hover:bg-papa-warn/15"
            >
              J'ai vu
            </button>
          </li>
        ))}

        {rien && (
          <li className="px-2 py-6 text-center text-[12.5px] text-papa-muted">
            ZETIS ne fabrique rien en ce moment.
          </li>
        )}
        {masques > 0 && (
          <li className="px-2 py-1.5 text-center text-[10.5px] text-papa-muted">
            …et {masques} autre{masques > 1 ? "s" : ""} plus loin dans la file
          </li>
        )}
      </ul>

      <div className="mt-1 border-t border-papa-border px-2 pb-1 pt-2 text-[10.5px] text-papa-muted">
        {/* Le §5 rendu VISIBLE : une règle de priorité qu'on ne peut pas vérifier à l'œil n'est
            pas vérifiée. Et ce que « passer devant » veut dire doit être dit, sinon Papa l'attend
            au mauvais moment. */}
        Un travail lancé à la main passe devant les travaux automatiques —{" "}
        <b className="font-semibold text-papa-text">l'ordre ci-dessus est celui qui sera servi</b>.
        Le travail en cours n'est jamais interrompu : le vôtre démarrera à la fin de la{" "}
        <b className="font-semibold text-papa-text">notion</b> en cours, pas à la fin du lot.
      </div>

      <div className="flex items-center justify-between border-t border-papa-border px-2 py-2">
        {/* ⚠️ Paramètre RÉPÉTÉ, jamais une liste : `?statut=queued,running` serait
            silencieusement ignoré par `depuisUrl` (`params.getAll`). */}
        <Link
          to="/journal?statut=queued&statut=running"
          onClick={onClose}
          className="text-[12px] text-papa-accent-2 hover:underline"
        >
          Voir au Journal →
        </Link>
        <span className="text-[10.5px] text-papa-muted">
          rien n'est perdu · {suivis} travail{suivis > 1 ? "x" : ""} suivi{suivis > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
