import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Options } from "./Options";
import "../popup/index.css";

document.body.classList.add("zetis-options");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
