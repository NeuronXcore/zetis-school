import { type ReactNode } from "react";

// ⚠️ **Ce composant ne porte PAS `RETRAIT_TITRE_PAGE`, et c'est mesuré, pas oublié** (2026-08-12).
// Il a été posé ici, puis retiré : la moitié des dix pages qui l'utilisent alignent leurs
// **libellés de section** sur le bord du conteneur, hors des cartes — `/agenda` en a six
// (« Aujourd'hui », « Demain », « Ce qui arrive », « À reprendre »), `/revision` deux
// (« Mélanges », « Par matière »). Sur ces pages, le titre n'est pas seul au bord : il leur est
// ALIGNÉ. Le retrait y aurait cassé cet alignement — soit un défaut neuf pour en corriger un autre.
// Voir `lib/pageTitle.ts`.
interface PageHeaderProps {
  title: ReactNode;
  /** `ReactNode` et non `string` depuis le 2026-08-17 : `/agenda` y place l'avatar de ZETIS
   *  devant son sous-titre. Élargissement sûr — `ReactNode` contient `string`, et les dix pages
   *  qui passent une chaîne restent valides sans y toucher. */
  subtitle?: ReactNode;
  right?: ReactNode;
}

export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && (
          <p className="mt-1 flex items-center gap-2 text-zetis-muted">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}
