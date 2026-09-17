import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api.js";
import { AuthUser } from "./api.js";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Lab 3 §5, migration step 5 — the Lab 2 selector's client-side state must
// not just go unused, it must be actively cleared on first load of this
// build (specification.md §7 migration path).
const LEGACY_REQUESTER_STORAGE_KEY = "toktickit.requesterId";
localStorage.removeItem(LEGACY_REQUESTER_STORAGE_KEY);

// Issue 33 — single source of truth for "who is signed in." Login and
// ChangePassword call these actions directly rather than the raw api.ts
// functions, so the context's user state (and therefore what AppRoot
// renders next) always reflects the latest server response without a
// separate manual refresh step.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const current = await api.login(email, password);
    setUser(current);
    return current;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.changePassword(currentPassword, newPassword);
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
