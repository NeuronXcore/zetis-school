import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type AuthClient } from "./client";
import { type AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    client
      .fetchMe()
      .then((u) => active && setUser(u))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [client]);

  async function login(username: string, password: string): Promise<void> {
    setUser(await client.login(username, password));
  }

  function logout(): void {
    client.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
