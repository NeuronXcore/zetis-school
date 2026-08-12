// Matchers DOM (toBeInTheDocument, etc.) pour Vitest.
import "@testing-library/jest-dom/vitest";

// ⚠️ CE FICHIER DIVERGE VOLONTAIREMENT DE CELUI DES DEUX APPS — ne pas « aligner les trois ».
//
// Les `setup.ts` de `frontend-massimo` et `frontend-papa` s'arrêtent à la ligne ci-dessus. Celui-ci
// ajoute un polyfill de `ResizeObserver`, et c'est ce qui rend les tests de ce paquet possibles :
// **React Flow en dépend**, et **jsdom ne le fournit pas**. Sans lui, monter `MindmapWorkspace`
// échoue TOUJOURS — pour une raison qui n'a rien à voir avec le code testé. Un test qui échoue
// toujours finit désactivé, et l'angle mort que ce paquet vient de payer reviendrait avec bonne
// conscience (ADR-0053 Décision 3).
//
// 🔴 **Un polyfill n'est PAS un mock.** On donne à jsdom ce que le navigateur a ; on ne remplace
// pas ce qu'on teste. C'est exactement la différence qui rend `MindmapPreviewModal.test.tsx`
// (côté Papa) incapable de voir quoi que ce soit : il moque `@zetis/ui/mindmap` en entier.
//
// ⚠️ **DEUX polyfills, et la liste est FERMÉE.** Chaque ajout ici éloigne le test du navigateur
// réel. La règle qui les autorise est étroite : *une API que le navigateur fournit et que jsdom
// n'a pas, dont l'absence ferait échouer un montage pour une raison étrangère au code testé.*
// Tout ce qui ne rentre pas dans cette phrase est un **mock**, et un mock n'a rien à faire ici.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverStub;
}

// `matchMedia` — ADDENDUM à la Décision 3, arbitré par le commanditaire le 2026-08-12.
//
// L'ADR-0053 écrivait « `ResizeObserver`, et **rien d'autre** ». `AvatarCanvas` a montré que la
// LETTRE était trop étroite pour son propre RAISONNEMENT : `window.matchMedia` est exactement de
// même nature — jsdom ne l'a pas, et sans lui le composant ne se monte pas, pour une raison qui
// n'a rien à voir avec son code. Le laisser tomber aurait exclu un composant de 444 lignes qui,
// dans un vrai navigateur, se monte parfaitement.
//
// ⚠️ `prefers-reduced-motion` répond donc **`false`** dans les tests : les composants s'y croient
// en mouvement autorisé. C'est le défaut du navigateur, pas une neutralisation — mais un test qui
// voudrait vérifier le comportement en mouvement réduit devra le surcharger lui-même.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
