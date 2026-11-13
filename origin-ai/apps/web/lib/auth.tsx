"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type Theme, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  setTheme: (t: Theme) => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function applyTheme(theme: Theme) {
  try {
    localStorage.setItem("origin-theme", theme);
  } catch {}
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u?.preferences.theme) applyTheme(u.preferences.theme);
  }, []);

  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser, () => setUser(null))
      .finally(() => setLoading(false));
  }, [setUser]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      setUser,
      logout: async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => {});
        setUserState(null);
      },
      setTheme: async (theme) => {
        applyTheme(theme);
        setUser(await api<User>("/auth/me", { method: "PATCH", body: { theme } }));
      },
    }),
    [user, loading, setUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
