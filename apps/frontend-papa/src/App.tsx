import { Routes, Route } from "react-router-dom";
import { PapaLayout } from "./layouts/PapaLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RequireAuth } from "./auth/RequireAuth";
import { PAPA_NAV } from "./lib/navigation";

// Routes Papa (Étapes 3/6) : login public + cockpit protégé (dashboard + placeholders).
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <PapaLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        {PAPA_NAV.filter((item) => item.to !== "/").map((item) => (
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
