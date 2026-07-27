import { toPng } from "html-to-image";

// Export d'une fiche au format IMAGE A5 (papier). On capture un rendu CLAIR dédié (FicheA5),
// PAS la carte en verre sombre : image lisible et peu encrée. Cela contourne aussi l'impression
// du shell de l'app (hauteur fixe + scroll interne -> page blanche) : on génère un document
// autonome à imprimer, indépendant de la page.

/** Capture un nœud DOM en PNG (fond blanc, 2x pour la netteté à l'impression). */
export async function ficheToPng(node: HTMLElement): Promise<string> {
  return toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
}

/** Déclenche le téléchargement d'un data URL sous `filename`. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Ouvre un document autonome calé sur une page A5 avec l'image, puis lance l'impression.
 *  Renvoie `false` si la popup a été bloquée (l'appelant peut retomber sur le téléchargement). */
export function printImageA5(dataUrl: string): boolean {
  const w = window.open("", "_blank", "width=680,height=920");
  if (!w) return false;
  w.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche</title>' +
      "<style>@page{size:A5;margin:8mm}html,body{margin:0;padding:0}" +
      "img{display:block;width:100%;height:auto}</style>" +
      '<script>window.addEventListener("afterprint",function(){window.close()});</script>' +
      '</head><body><img src="' +
      dataUrl +
      '" alt="Fiche" onload="setTimeout(function(){window.focus();window.print()},60)"></body></html>',
  );
  w.document.close();
  return true;
}

/** Nom de fichier sûr à partir d'un titre (tout caractère non alphanumérique ASCII -> tiret). */
export function slugifyFilename(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `fiche-${base || "revision"}.png`;
}
