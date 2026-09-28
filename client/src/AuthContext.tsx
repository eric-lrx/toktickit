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
    const check = () =>
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
    check();

    // Lab 4 — a page restored from the back-forward cache comes back frozen
    // as it was: if it was left while this check was still in flight (the
    // request is aborted by the navigation), it stayed on "Loading…" forever.
    // That was the cause of Lab 3 E2E-02's intermittent failure after
    // logout + back. A restored page asks the server again.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
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
