// Icône de marque ANIMÉE pour l'en-tête « Mes mindmaps » (remplace l'emoji 🧠). Une carte mentale
// qui se CONSTRUIT en boucle : le nœud central puis chaque nœud-rectangle apparaît un à un, relié
// par des liens DORÉS qui se tracent juste avant. 100 % SVG + CSS (aucune dépendance), motion-safe
// (tout se fige si prefers-reduced-motion). Purement décorative.

export function AnimatedMindmapIcon({ className = "" }: { className?: string }) {
  return (
    <span className={`mmr inline-block align-middle ${className}`} aria-hidden>
      <style>{MMR_CSS}</style>
      <svg viewBox="0 0 48 48" className="mmr-svg h-full w-full overflow-visible">
        <defs>
          <linearGradient id="mmr-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="mmr-core" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="0.5" stopColor="#818cf8" />
            <stop offset="1" stopColor="#e879f9" />
          </linearGradient>
        </defs>

        {/* Liens DORÉS : tracés un à un, juste avant que leur nœud n'apparaisse. */}
        <g
          className="mmr-edges"
          stroke="url(#mmr-gold)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        >
          <line className="mmr-edge d1" x1="24" y1="24" x2="11" y2="10" />
          <line className="mmr-edge d2" x1="24" y1="24" x2="37" y2="10" />
          <line className="mmr-edge d3" x1="24" y1="24" x2="11" y2="38" />
          <line className="mmr-edge d4" x1="24" y1="24" x2="37" y2="38" />
        </g>

        {/* Nœuds = rectangles arrondis, apparition « pop » décalée. Le central en premier. */}
        <rect className="mmr-node c" x="15" y="19" width="18" height="10" rx="2.5" fill="url(#mmr-core)" />
        <rect className="mmr-node p1" x="5" y="6" width="13" height="8" rx="2" fill="#22d3ee" />
        <rect className="mmr-node p2" x="31" y="6" width="13" height="8" rx="2" fill="#818cf8" />
        <rect className="mmr-node p3" x="5" y="34" width="13" height="8" rx="2" fill="#a855f7" />
        <rect className="mmr-node p4" x="31" y="34" width="13" height="8" rx="2" fill="#e879f9" />
      </svg>
    </span>
  );
}

// Boucle unique (3.8 s) : chaque élément apparaît à sa fenêtre, tient, puis tout s'efface en fin de
// cycle et se reconstruit. Ordre : central → lien1 → nœud1 → lien2 → nœud2 → … (délais décalés).
const MMR_CSS = `
.mmr{position:relative}
/* Halo DORÉ derrière l'icône, qui respire doucement. */
.mmr::before{content:"";position:absolute;inset:-30%;border-radius:9999px;z-index:-1;
  background:radial-gradient(circle, rgba(245,158,11,.6), rgba(245,158,11,0) 68%);
  filter:blur(5px);animation:mmr-halo 3s ease-in-out infinite}
@keyframes mmr-halo{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.95;transform:scale(1.14)}}

.mmr-svg *{transform-box:fill-box;transform-origin:center}
.mmr-node{animation:mmr-pop 3.8s ease-out infinite both}
.mmr-edge{stroke-dasharray:20;animation:mmr-draw 3.8s ease-out infinite both}

.mmr-node.c{animation-delay:0s}
.mmr-edge.d1{animation-delay:.35s}
.mmr-node.p1{animation-delay:.55s}
.mmr-edge.d2{animation-delay:.8s}
.mmr-node.p2{animation-delay:1s}
.mmr-edge.d3{animation-delay:1.25s}
.mmr-node.p3{animation-delay:1.45s}
.mmr-edge.d4{animation-delay:1.7s}
.mmr-node.p4{animation-delay:1.9s}

@keyframes mmr-pop{
  0%{opacity:0;transform:scale(.2)}
  9%{opacity:1;transform:scale(1.15)}
  18%{transform:scale(1)}
  86%{opacity:1;transform:scale(1)}
  100%{opacity:0;transform:scale(.86)}
}
@keyframes mmr-draw{
  0%{opacity:0;stroke-dashoffset:20}
  6%{opacity:1}
  18%{stroke-dashoffset:0}
  86%{opacity:1;stroke-dashoffset:0}
  100%{opacity:0;stroke-dashoffset:0}
}

@media (prefers-reduced-motion: reduce){
  .mmr-node,.mmr-edge{animation:none;opacity:1}
  .mmr-edge{stroke-dasharray:none}
  .mmr::before{animation:none}
}
`;
