// Bouton d'activation/coupure du son des célébrations (persisté, partagé Massimo + Papa).
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { isSoundEnabled, onSoundChange, playCelebrationChime, setSoundEnabled } from "../lib/sound";

export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState<boolean>(isSoundEnabled);

  // Reste synchronisé si le réglage change ailleurs (autre onglet / autre toggle).
  useEffect(() => onSoundChange(setOn), []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
        if (next) playCelebrationChime(); // petit aperçu quand on réactive
      }}
      aria-pressed={on}
      title={on ? "Sons activés — cliquer pour couper" : "Sons coupés — cliquer pour activer"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base transition-colors hover:border-white/25",
        className,
      )}
    >
      <span aria-hidden>{on ? "🔊" : "🔇"}</span>
      <span className="sr-only">{on ? "Sons activés" : "Sons coupés"}</span>
    </button>
  );
}
