import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

// Garde de routes : redirige vers /login si non authentifié.
// `fallback` permet à chaque app de styliser son état de chargement.
export function RequireAuth({
  children,
  fallback = null,
  loginPath = "/login",
}: {
  children: ReactNode;
  fallback?: ReactNode;
  loginPath?: string;
}) {
  const { user, loading } = useAuth();
  if (loading) return <>{fallback}</>;
  if (!user) return <Navigate to={loginPath} replace />;
  return <>{children}</>;
}
