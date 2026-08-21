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
// ⚠️ **Aucun sondage de fond** (adr-0062 §5) : lecture au montage, et le rafraîchissement est un
// bouton. La SEULE exception est l'attente armée du §1 de l'ADR-0067, plus bas — bornée par cinq
// conditions, et elle meurt avec sa réponse.
//
// 🔴 **Pourquoi l'attente n'est PAS le sondage que l'adr-0062 §5 interdit.** Le §5 vise une page
// de réglages qui se rafraîchit **toute seule**, et son motif est écrit noir sur blanc : elle
// *« ferait bouger un champ sous les doigts »*. Ici, trois choses le désamorcent — et si une seule
// tombait, l'exception tomberait avec elle :
//
//   1. rien ne part au montage : seul un **202 obtenu sur cette page** arme l'attente ;
//   2. l'onglet 💾 **n'a aucun champ** — sa seule saisie vit dans le dialogue de confirmation,
//      qui est fermé avant que l'attente ne commence ;
//   3. elle **meurt au premier verdict** (et au démontage) : ce n'est pas une boucle de fond,
//      c'est une question posée jusqu'à ce qu'elle ait sa réponse.
//
// ⚠️ Sans cette note, le prochain lecteur verra un `setInterval` dans une page de réglages, y lira
// une entorse, et la « corrigera » — en rendant à Papa la consigne de surveillance qu'on retire.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button, ConfirmDialog, Input, cn } from "@zetis/ui";
import { type ArchiveSauvegarde, type Donnees, type RestaurationArchive } from "@zetis/types";

import { Toast, type ToastMessage } from "../Toast";
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

/** L'attente armée du §1 — ses deux nombres, et aucun n'est neuf.
 *
 *  **4 s** est la valeur DÉJÀ MESURÉE du dépôt (`useProductionActivity`, ADR-0041, ramenée de 20 s
 *  le 2026-08-03 contre des lots de 15-17 s). ⚠️ Elle n'est PAS ajustée sur les 1,738 s d'une
 *  restauration réelle : une lecture qui arrive trop tôt coûte une requête et recommence — alors
 *  qu'inventer un nombre pour cette page seule ferait diverger deux cadences sur le même écran.
 *
 *  **15 lectures (≈ 1 min)** est la borne du §1.5, et elle est CHOISIE, pas mesurée — l'ADR
 *  l'assume. Repère du 2026-08-21 : le geste complet a duré **1,738 s** sur la plus grosse base
 *  disponible (9 173 lignes), soit ~35× moins. Son unique effet est de **cesser de demander**.
 *  🔴 Le jour où le renoncement se déclenche en usage normal, on REMESURE la durée réelle — on ne
 *  relève pas la borne, ce qui masquerait la seule information intéressante (§Signaux). */
const CADENCE_MS = 4000;
const LECTURES_MAX = 15;

/** L'attente en vol : l'archive visée, et l'état de SON sidecar au moment où le geste est parti.
 *
 *  🔴 Le témoin n'est pas un luxe. Restaurer une archive **déjà restaurée** laisse son sidecar
 *  terminal sur la cible : sans lui, la première lecture rendrait le verdict du geste PRÉCÉDENT,
 *  à l'instant, comme si le nouveau était fini. */
interface Attente {
  archive: string;
  temoin: string;
}

/** La projection publiée du sidecar, réduite à une chaîne comparable — le témoin ci-dessus. */
function empreinteRestauration(r: RestaurationArchive | null | undefined): string {
  return JSON.stringify(r ?? null);
}

/** 🔴 Ce geste-ci a-t-il rendu son verdict ? Deux conditions, et il faut les DEUX.
 *
 *  **1. L'état doit avoir changé** depuis l'armement — sinon on relit le geste précédent (voir
 *  `Attente.temoin`).
 *
 *  **2. L'état doit être TERMINAL.** Et c'est le piège que le read-before-code a trouvé : pendant
 *  le geste, le journal existe avec `termine_le: null` — la route en dérive donc `verdict:
 *  "interrompue"`, en toute bonne foi, **alors que rien n'a échoué**. Une attente naïve peindrait
 *  un ÉCHEC ROUGE au milieu d'une restauration parfaitement saine.
 *
 *  Ce qui sépare « arrêtée » de « en train de courir » est déjà dans le sidecar : `etape_arretee`.
 *  Il ne vaut que si une étape a **réellement** échoué — `_etape()` écrit `statut: "echec"` avant
 *  de laisser remonter l'exception, quelle qu'elle soit. On ne CALCULE donc aucun verdict que le
 *  serveur ne porterait pas (§Périmètre 2) : on refuse seulement de lire un geste en vol comme un
 *  geste fini.
 *
 *  ⚠️ Reste un cas sans étape fautive : le processus tué net (SIGKILL, coupure). Le sidecar y
 *  garde à jamais l'aspect d'un geste en vol — et c'est exactement ce à quoi sert le renoncement
 *  du §1.5, qui n'affirme rien. */
function verdictRendu(r: RestaurationArchive | null | undefined, temoin: string): boolean {
  if (!r || empreinteRestauration(r) === temoin) return false;
  return r.termine_le !== null || r.etape_arretee !== null;
}

/** L'histoire de la dernière restauration d'une archive — les TROIS issues de l'Amendement 1.
 *
 *  🔴 **Elle vit sur sa propre ligne, pleine largeur, et c'est la décision de surface de la
 *  slice.** Elle vivait dans la cellule « Archive » : mesuré à l'écran le 2026-08-21, ça donnait
 *  **117 px** — le texte s'y coupait en deux, sous un nom de fichier monospace qui se coupe déjà,
 *  et le commanditaire ne l'a pas vu (il était pourtant peint, contrasté à 5,73:1 : ce n'était PAS
 *  un problème de couleur). L'état d'interruption est **plus long** que le succès : au même
 *  endroit, un échec aurait été MOINS visible qu'une réussite — l'exact inverse du §3. Une colonne
 *  de plus était exclue : le tableau défile déjà en largeur.
 *
 *  🔴 **`avec_ecarts` n'est PAS un échec** (Amendement 1) : la base est remplacée, les médias sont
 *  en place. L'ambre du dépôt — celui du refus motivé, jamais le rose de la panne — dit exactement
 *  ça : ça a abouti, avec une réserve.
 *
 *  ⚠️ `etape_arretee` et `motif` sont rendus **tels quels**, noms bruts du journal serveur compris
 *  (`filet`, `restauration`, `reveil`, `swap`, `medias`, `purge_files`, `migrations`,
 *  `recyclage`). Une table « nom technique → jolie phrase » est ce que l'ADR-0041 §8 a écarté :
 *  elle diverge du serveur au premier motif reformulé. */
function LigneRestauration({ r }: { r: RestaurationArchive }) {
  if (r.verdict === "interrompue" && r.termine_le === null && r.etape_arretee === null) {
    // 🔴 **Un journal OUVERT n'est pas un geste ARRÊTÉ**, et le test-verrou de cette ligne est né
    // d'un rendu faux : pendant la restauration, le sidecar existe sans `termine_le`, donc la
    // route en dérive `interrompue` — en toute bonne foi — et la page peignait un ÉCHEC ROUGE au
    // beau milieu d'un geste parfaitement sain.
    //
    // Aucune étape en échec consignée ⇒ on ne sait pas conclure, donc on ne conclut pas. Le même
    // aspect couvre le cas du processus tué net (coupure, SIGKILL), où le journal reste ouvert
    // pour toujours : dire « en cours » serait faux à terme, dire « échec » serait faux tout
    // court — la phrase ci-dessous n'affirme ni l'un ni l'autre.
    //
    // ⚠️ Le contrat publié ne porte PAS `commence_le` : rien ici ne peut dater ce journal, ni
    // distinguer « lancé il y a trois secondes » de « abandonné le mois dernier ». C'est signalé,
    // pas contourné.
    return (
      <div className="text-papa-muted">
        <span>↺ restauration commencée, jamais close — aucune étape en échec consignée.</span>
      </div>
    );
  }
  if (r.verdict === "interrompue") {
    return (
      <div className="text-rose-200">
        <span className="font-semibold">
          ↺ restauration interrompue
          {r.etape_arretee ? <> — arrêtée à l'étape « {r.etape_arretee} »</> : null}
        </span>
        {r.motif && <span className="mt-0.5 block font-mono text-[11px] text-rose-300/90">{r.motif}</span>}
        {/* ⚠️ La phrase « rien à acquitter : ce n'est pas une notification… » a été écrite, peinte,
            puis RETIRÉE devant l'écran : mesurée à 5,73:1, c'était l'élément le MOINS lisible du
            bloc le plus important, et elle expliquait une décision de conception au lieu de dire
            un fait. L'absence d'acquittement se constate — elle n'a pas besoin de se justifier à
            chaque ligne. Le pourquoi vit dans l'ADR-0067 §3 et dans la spec, pas ici. */}
      </div>
    );
  }
  const n = r.ecarts;
  if (r.verdict === "avec_ecarts") {
    return (
      <div className="text-amber-200">
        <span className="font-semibold">
          ↺ restaurée le {quand(r.termine_le)} — {n} écart{n > 1 ? "s" : ""} consigné
          {n > 1 ? "s" : ""}
        </span>
        {/* Cette phrase-là RESTE, et c'est mesuré à l'écran : `avec_ecarts` est l'état qu'on lit
            de travers, et le lire comme une panne enverrait Papa relancer un second swap. */}
        <span className="mt-0.5 block text-[11px] text-amber-200/80">
          La bascule a bien eu lieu — base remplacée, médias en place. Un écart n'annule pas le
          geste.
        </span>
      </div>
    );
  }
  return (
    <div className="text-emerald-200/90">
      <span>↺ restaurée le {quand(r.termine_le)}</span>
    </div>
  );
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
  // L'attente armée du §1 — `null` tant que Papa n'a rien lancé DEPUIS CETTE PAGE.
  const [attente, setAttente] = useState<Attente | null>(null);
  // Le renoncement du §1.5, en toutes lettres. 🔴 Ce n'est PAS un verdict : la page dit qu'elle
  // n'a pas vu la fin, et rend la main au ⟳. Elle ne déclare ni succès ni échec.
  const [renoncement, setRenoncement] = useState<string | null>(null);
  // 🔴 Le succès parle par un toast, l'échec JAMAIS (§3, ADR-0041 §8) — voir l'effet plus bas.
  const [toast, setToast] = useState<ToastMessage | null>(null);

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

  // ⚠️ Le compteur vit dans une ref, pas dans un état : le faire entrer dans les dépendances de
  // l'effet relancerait le minuteur à chaque lecture, et la cadence de 4 s n'existerait plus.
  const lectures = useRef(0);

  /** Ce que la page DIT d'un verdict — et c'est ici que le §3 se joue.
   *
   *  🔴 **Aucun échec ne passe par un toast.** L'interruption ne dit rien ici : elle est déjà
   *  écrite, durablement, sur la ligne de l'archive (`LigneRestauration`) — six secondes pendant
   *  que Papa est dans une autre pièce, c'est un travail perdu en silence (ADR-0041 §8).
   *
   *  🔴 **`avec_ecarts` reçoit les DEUX, et c'était la question ouverte de la slice.** C'est un
   *  succès, donc le §3 lui doit son toast ; mais un écart est un **fait durable inscrit sur la
   *  cible**, et six secondes ne peuvent pas porter une réserve qui, elle, reste vraie. Le toast
   *  est le retour d'action, la ligne est la mémoire. Ne trancher ni l'un ni l'autre l'aurait
   *  laissé se rendre comme `reussie` — ce que l'Amendement 1 interdit précisément. */
  const annoncer = (archive: string, r: RestaurationArchive) => {
    if (r.verdict === "interrompue") return;
    const n = r.ecarts;
    // ⚠️ Le toast NOMME l'archive (§5) — un toast anonyme après un geste de classe A4 ne vaut
    // rien — et ne porte ni pourcentage, ni durée, ni promesse. Le rappel de la suspension n'est
    // pas décoratif : le taire ferait croire que ZETIS est reparti (ADR-0063, Papa lève).
    const reserve =
      r.verdict === "avec_ecarts"
        // ⚠️ Pas « le détail reste sur la ligne » : la route publie le COMPTE des écarts, pas
        // leur texte — et pour une restauration il n'y a pas de ligne de travail où aller le
        // lire, elle meurt au swap. Promettre un détail introuvable serait pire que se taire.
        ? ` ${n} écart${n > 1 ? "s" : ""} consigné${n > 1 ? "s" : ""}, et la ligne de l'archive le garde.`
        : "";
    setToast({
      id: Date.now(),
      texte: `« ${archive} » restaurée.${reserve} ZETIS s'est réveillé suspendu : la remise en route vous appartient.`,
      ton: r.verdict === "avec_ecarts" ? "avertissement" : "info",
    });
  };

  // --- 🔴 L'ATTENTE ARMÉE (ADR-0067 §1) — la fin du geste cesse d'être une consigne de
  // surveillance. Ses cinq bornes SONT la décision ; le motif d'exception est en tête de fichier.
  useEffect(() => {
    if (attente === null) return; // ① rien au montage : seul un 202 arme.
    lectures.current = 0;
    let vivant = true;

    const tick = () => {
      if (!vivant) return;
      lectures.current += 1;
      const numero = lectures.current;
      void fetchDonnees()
        .then((d) => {
          if (!vivant) return;
          setDonnees(d);
          const r = d.archives.find((a) => a.nom === attente.archive)?.restauration ?? null;
          if (verdictRendu(r, attente.temoin)) {
            // ② l'attente s'arrête au PREMIER verdict — elle ne survit pas à sa réponse.
            setAttente(null);
            annoncer(attente.archive, r as RestaurationArchive);
            return;
          }
          if (numero >= LECTURES_MAX) {
            // ⑤ le renoncement : la page cesse de demander, et n'affirme RIEN.
            setAttente(null);
            setRenoncement(attente.archive);
          }
        })
        .catch(() => {
          // 🔴 **Une lecture ratée n'est PAS un échec du geste, et surtout pas une panne de page.**
          //
          // Mesuré le 2026-08-21 sur le vrai serveur : pendant la fenêtre de bascule (④, 62 ms
          // relevés dans le sidecar du geste réel), la base `zetis` est momentanément ABSENTE
          // entre les deux RENAME — `GET /donnees` rend alors **500**. L'attente tombe dedans par
          // construction : elle interroge précisément pendant que la base est remplacée.
          //
          // ⚠️ Passer par `charger()` ici serait la faute : il VIDE `donnees` et bascule la page
          // sur « État de la sauvegarde illisible ». Le tableau entier disparaîtrait au milieu du
          // geste le plus destructif du produit, pour une erreur qui dure quelques dizaines de
          // millisecondes. On ignore la lecture ; la suivante arrive dans 4 s.
          //
          // ⚠️ Le cas voisin, lui, est TRANSPARENT et n'a jamais besoin de ce garde-fou : les
          // connexions tuées (`pg_terminate_backend`, ligne du swap) sont rattrapées par
          // `pool_pre_ping=True` — 60 lectures sur 60 à 200, mesurées le même jour.
          if (!vivant) return;
          if (lectures.current >= LECTURES_MAX) {
            setAttente(null);
            setRenoncement(attente.archive);
          }
        });
    };

    // ③ cadence 4 s. La première lecture attend un tour : le 202 vient de partir, le travail
    // n'a pas encore commencé.
    const timer = window.setInterval(tick, CADENCE_MS);
    // ④ Papa quitte l'onglet ⇒ le composant est démonté (`ParametresPage` ne rend que l'onglet
    // actif) ⇒ plus rien ne tourne en arrière-plan.
    return () => {
      vivant = false;
      window.clearInterval(timer);
    };
    // `annoncer` est stable (défini plus bas, sans dépendance d'état) : l'omettre garde l'effet
    // arrimé au SEUL armement — le remettre ferait repartir le minuteur à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente]);


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
    suppression?.geste === "en-cours" ||
    // Tant que l'attente court, la bascule est EN COURS : le serveur refuserait de toute façon
    // (409, préconditions du §2), mais laisser les boutons vifs inviterait au second swap que
    // l'ADR nomme comme le coût de l'ambiguïté.
    attente !== null;

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
                    <Fragment key={a.nom}>
                    <tr
                      className={cn(
                        "border-papa-border/60",
                        // Pas de trait de séparation quand l'histoire de la restauration suit :
                        // les deux lignes sont UNE archive, et un trait entre elles les
                        // séparerait en deux enregistrements.
                        a.restauration ? "border-b-0" : "border-b",
                      )}
                    >
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
                    {/* 🔴 L'histoire de la dernière restauration — sur sa PROPRE ligne, pleine
                        largeur. Voir `LigneRestauration` : c'est la décision d'emplacement de la
                        slice, et elle vient de l'écran, pas d'un avis. */}
                    {a.restauration && (
                      <tr className="border-b border-papa-border/60">
                        {/* ⚠️ Un filet vertical a été essayé ici, puis RETIRÉ après mesure : à
                            `border-papa-border` sur le fond du tableau, il était invisible — et
                            surtout inutile. Ce qui rattache l'histoire à SON archive est déjà là :
                            la ligne de l'archive perd son trait du bas quand une histoire suit,
                            si bien que les deux vivent entre deux séparateurs (mesuré : 0 px
                            entre elles, un trait seulement après). Une règle décorative qui ne
                            se voit pas est pire que pas de règle. */}
                        <td colSpan={6} className="pb-2.5 pl-3 pr-3 text-xs">
                          <LigneRestauration r={a.restauration} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
        {/* L'attente en vol. `aria-live="polite"` et non `alert` : on informe, on n'interrompt
            pas — même règle que le toast. */}
        {attente && (
          <p role="status" aria-live="polite" className="mt-2 text-sm text-papa-muted">
            ⏳ ZETIS bascule sur {attente.archive} — cette page suit et dira la fin.
          </p>
        )}
        {/* 🔴 LE RENONCEMENT (§1.5) — et il n'affirme RIEN. « Je n'ai pas vu la fin » n'est pas
            « ça a échoué » : sur une base plus grosse, la borne serait dépassée par des gestes
            parfaitement sains. Il rend la main au ⟳, et c'est tout ce qu'il fait. */}
        {renoncement && (
          <p className="mt-2 text-sm text-papa-muted">
            Cette page a cessé de demander où en est {renoncement} : la fin n'est pas venue dans
            la minute. Ce n'est <strong>ni un succès ni un échec</strong> — le geste peut très
            bien être en train de se terminer. ⟳ Rafraîchir pour relire l'état.
          </p>
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
          setRenoncement(null);
          lancerRestauration(archive.nom)
            .then((r) => {
              setRestauration({
                archive: archive.nom,
                geste: {
                  genre: "accepte",
                  // ⚠️ « ⟳ ensuite pour relire l'état » a DISPARU d'ici, et c'est le point du
                  // chantier : c'était une consigne de surveillance — on demandait à Papa de
                  // guetter la disparition d'une ligne pour deviner un résultat. La page attend
                  // maintenant elle-même. (Sauvegarder et Vérifier gardent la leur : le §6 les
                  // réunira, c'est son propre chantier.)
                  texte: `Travail #${r.job_id} enfilé — ZETIS bascule sur cette archive. La ligne disparaîtra de la barre au moment de la bascule (c'est prévu : son journal vit sur la cible). Cette page attend la fin et vous la dira.`,
                },
              });
              signalerEnfilement();
              // 🔴 ① L'attente s'arme ICI, et NULLE PART ailleurs : sur un 202 obtenu depuis
              // cette page. Le témoin est l'état du sidecar AVANT le geste — sans lui, une
              // archive déjà restaurée rendrait le verdict de la fois précédente (voir
              // `verdictRendu`).
              setAttente({
                archive: archive.nom,
                temoin: empreinteRestauration(archive.restauration),
              });
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

      {/* 🔴 Le composant `Toast` EXISTANT, réutilisé tel quel (§Périmètre 3 : aucune surface
          neuve). Il ne porte QUE des succès — voir `annoncer`. */}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
