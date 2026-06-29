import { Routes, Route } from "react-router-dom";
import { MassimoLayout } from "./layouts/MassimoLayout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RequireAuth } from "./auth/RequireAuth";
import { MASSIMO_NAV } from "./lib/navigation";

// Routes Massimo (Étapes 2/6) : login public + espace protégé (accueil + placeholders).
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <MassimoLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        {MASSIMO_NAV.filter((item) => item.to !== "/").map((item) => (
          <Route
            key={item.to}
            path={item.to}
            element={<PlaceholderPage title={item.label} icon={item.icon} />}
          />
        ))}
        <Route path="*" element={<PlaceholderPage title="Page introuvable" icon="🔍" />} />
      </Route>
    </Routes>
  );
}
