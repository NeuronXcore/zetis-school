import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@zetis/auth";
import { CelebrationProvider } from "@zetis/ui";
import App from "./App";
import { authClient } from "./lib/authClient";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider client={authClient}>
        <CelebrationProvider>
          <App />
        </CelebrationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
