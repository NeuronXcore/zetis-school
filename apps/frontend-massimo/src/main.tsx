import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@zetis/auth";
import App from "./App";
import { authClient } from "./lib/authClient";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider client={authClient}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
