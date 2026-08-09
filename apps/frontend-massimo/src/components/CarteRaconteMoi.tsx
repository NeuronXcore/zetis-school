import { useRef, useState } from "react";
import { Eli5SttUnavailable, transcribeEli5 } from "../lib/eli5";
import { isDictationSupported, startRecording, type Recording } from "../lib/dictation";
import { envoyerExplication, type DiagnosticVerbalisation } from "../lib/diagnostic";

// « Raconte-moi » — la verbalisation après un diagnostic (ADR-0048 Décision 5).
//
// 🔴 **C'est la SEULE part de l'anti-triche que Massimo voit**, et elle s'affiche parce qu'elle n'a
// rien à cacher : c'est une question, et `CLAUDE.md` prescrit déjà la verbalisation par Massimo.
//
// 🔴 **Elle est là à CHAQUE passation, quel que soit le verdict.** La conditionner au doute la
// transformerait en accusation : deux ou trois passations suffisent à un enfant pour comprendre,
// et le seul signal non falsifiable du lot serait détruit par la manière de le demander. Le
// composant ne reçoit d'ailleurs AUCUNE information de fiabilité — il ne peut pas la conditionner.

const MAX = 200;

/** 🔴 LA LIGNE QUI FAIT TOUT LE TRAVAIL, et celle qu'on aurait le plus envie d'enlever.
 *
 * Elle **nomme** la réponse qu'on cherche à détecter et la déclare **acceptable**. Un enfant qui
 * sait qu'il peut dire « j'ai cherché » sans conséquence le **dira** — et ZETIS obtient librement
 * ce qu'aucun des cinq autres signaux ne peut prouver, sans que personne n'ait été soupçonné.
 *
 * ⚠️ Ce qui la détruit : qu'une seule fois, « j'ai cherché » revienne à Massimo sous forme de
 * reproche. La question ne recevrait plus jamais de réponse vraie. */
const PERMISSION =
  "Tu peux dire « je le savais », « je l'ai vu en cours », « j'ai deviné » ou « j'ai cherché » — tout ça compte pareil.";

export function CarteRaconteMoi({
  attemptId,
  verbalisation,
}: {
  attemptId: number;
  verbalisation: DiagnosticVerbalisation;
}) {
  const [texte, setTexte] = useState(verbalisation.explication ?? "");
  const [envoye, setEnvoye] = useState(verbalisation.explication != null);
  const [passe, setPasse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  // 503 : le service Whisper est éteint. Le micro DISPARAÎT, le champ reste, et rien ne s'affiche
  // sur ce qui manque — un enfant n'a pas à savoir qu'un service est en panne (patron ADR-0012).
  const [sttGone, setSttGone] = useState(false);
  const recRef = useRef<Recording | null>(null);
  const cycle = useRef(0);
  const micSupported = isDictationSupported();
  const showMic = micSupported && !sttGone && !envoye;

  async function envoyer() {
    const propre = texte.trim();
    if (!propre || busy) return;
    setBusy(true);
    try {
      await envoyerExplication(attemptId, verbalisation.question_id, propre);
      setEnvoye(true);
    } catch {
      // Silencieux et sans conséquence : ce mot est un cadeau, pas un dû. Afficher une erreur
      // ferait porter à Massimo le poids d'un réseau qui a hoqueté.
      setEnvoye(true);
    } finally {
      setBusy(false);
    }
  }

  async function demarrerMicro() {
    if (!showMic || recording) return;
    try {
      recRef.current = await startRecording();
      setRecording(true);
    } catch {
      // Micro refusé : on ne dit rien, le champ texte est là.
    }
  }

  async function arreterMicro() {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    setRecording(false);
    const run = ++cycle.current;
    let blob: Blob;
    try {
      blob = await rec.stop();
    } catch {
      return;
    }
    try {
      const { transcript } = await transcribeEli5(blob);
      if (run !== cycle.current) return; // cycle abandonné pendant la transcription
      const propre = transcript.trim();
      // 🔴 LA TRANSCRIPTION ATTERRIT DANS LE CHAMP — ELLE NE S'ENVOIE PAS TOUTE SEULE.
      // C'est le patron d'ELI5, PAS celui de ChatPage (`send(transcript, "voice")`). Deux raisons :
      // Massimo doit pouvoir CORRIGER ce que Whisper a mal entendu — sinon il découvrirait sa
      // propre phrase déformée chez Papa — et un envoi automatique créerait un SECOND chemin de
      // soumission sur une carte qui n'en a qu'un.
      if (propre) setTexte((p) => (p.trim() ? `${p.trim()} ${propre}` : propre).slice(0, MAX));
    } catch (e) {
      if (e instanceof Eli5SttUnavailable) setSttGone(true);
      // Toute autre erreur : rien. Il réessaie, ou il écrit.
    }
  }

  if (passe) return null;

  if (envoye) {
    return (
      <section className="mt-4 rounded-2xl border border-emerald-300/40 bg-emerald-300/10 p-5">
        <p className="font-bold text-emerald-300">Merci ✨</p>
        {/* 🔴 IL RELIT CE QU'IL A ÉCRIT — la spec §6 le dit en toutes lettres (« Massimo relit ce
            qu'il a écrit, il ne se le voit pas redemander »), et l'écran n'en faisait que la
            moitié : trouvé à la relecture visuelle du 2026-08-09. Le serveur servait bien
            l'explication, le composant la jetait.
            Deux raisons de la montrer, et la seconde est la vraie : « c'est gardé » n'est une
            promesse tenable que si Massimo SAIT ce qui est gardé — et après une DICTÉE, c'est le
            seul endroit où il peut découvrir que Whisper l'a mal entendu. */}
        {texte.trim() && (
          <p className="mt-2 border-l-2 border-emerald-300/40 pl-3 text-[14.5px] italic">
            « {texte.trim()} »
          </p>
        )}
        {/* 🔴 ZETIS, ET NON PAPA (décision du 2026-08-09, à la relecture visuelle). L'accusé de
            réception disait « Papa le verra à côté de ta réponse » — vrai, mais ça remet l'ENJEU que
            la phrase de permission passe tout son texte à retirer. Un enfant à qui l'on dit « Papa
            va lire ça » pèse sa réponse au lieu de la dire, et le seul signal infalsifiable du
            chantier se referme.
            ⚠️ **Ce n'est pas pour autant recueilli en douce** — l'inverse serait pire : la phrase
            dit que le mot est GARDÉ, et à quel endroit. Rien n'est caché, c'est juste que ZETIS ne
            convoque personne. Et AUCUNE récompense n'est promise — pas d'XP sur ce mot. */}
        <p className="mt-2 text-sm text-zetis-muted">
          C'est noté. ZETIS le garde à côté de ta réponse.
        </p>
      </section>
    );
  }

  return (
    <section
      className="mt-4 rounded-2xl border border-zetis-accent/45 p-5"
      style={{
        background:
          "linear-gradient(160deg, rgba(99,102,241,.16), rgba(34,211,238,.06))",
      }}
    >
      <p className="flex items-center gap-2 text-base font-extrabold">
        <span aria-hidden>💬</span> Raconte-moi
      </p>
      <p className="mt-2.5 text-[14.5px]">
        Tu as trouvé <b className="text-zetis-accent-2">{verbalisation.skill_name}</b>. Comment tu as
        fait ?
      </p>
      <p className="mt-2 text-[13.5px] text-zetis-muted">
        En une phrase, avec tes mots. Il n'y a pas de bonne réponse à cette question-là.
      </p>
      <p className="mt-2 border-l-2 border-zetis-muted/35 pl-3 text-[13px] text-zetis-muted">
        {PERMISSION}
      </p>

      <div className="mt-3 flex items-start gap-2.5">
        <input
          type="text"
          maxLength={MAX}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={showMic ? "dis-le, ou écris-le ici" : "écris-le ici"}
          aria-label="Comment tu as trouvé"
          className="min-w-0 flex-1 rounded-xl border border-zetis-border bg-zetis-bg px-3.5 py-3 text-[14.5px] outline-none focus:ring-2 focus:ring-zetis-accent"
        />
        {showMic && (
          <button
            type="button"
            aria-label={recording ? "Arrêter" : "Appuie pour parler"}
            onPointerDown={demarrerMicro}
            onPointerUp={arreterMicro}
            onPointerLeave={() => {
              if (recRef.current) void arreterMicro();
            }}
            onPointerCancel={() => {
              if (recRef.current) void arreterMicro();
            }}
            className={`grid h-12 w-12 flex-none place-items-center rounded-2xl border text-xl ${
              recording
                ? "animate-pulse border-fuchsia-400 bg-fuchsia-500/25"
                : "border-zetis-accent-2/45 bg-zetis-accent-2/15"
            }`}
          >
            {recording ? "⏹️" : "🎤"}
          </button>
        )}
      </div>
      {recording ? (
        <p className="mt-1.5 text-[12.5px] text-zetis-accent-2">
          🎙️ Je t'écoute… relâche quand tu as fini.
        </p>
      ) : (
        <p className="mt-1.5 text-right text-[11.5px] text-zetis-muted/70">
          {texte.length} / {MAX}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3.5">
        <button
          type="button"
          onClick={envoyer}
          disabled={busy || !texte.trim()}
          className="rounded-xl bg-zetis-accent px-[18px] py-2.5 font-extrabold text-white disabled:opacity-50"
        >
          Envoyer
        </button>
        {/* « Passer » est RÉEL et sans conséquence. Il ne déclenche aucun appel réseau, et le
            serveur ne compte le silence nulle part : le compter ferait de ce bouton un aveu. */}
        <button
          type="button"
          onClick={() => setPasse(true)}
          className="px-1 py-2.5 font-semibold text-zetis-muted hover:text-zetis-text"
        >
          Passer
        </button>
      </div>
    </section>
  );
}
