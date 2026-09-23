"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, authRequest, refreshSession, setAccessToken } from "@/lib/apiClient";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  clientId: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // On load, silently resume the session from the httpOnly refresh cookie.
  useEffect(() => {
    (async () => {
      if (await refreshSession()) {
        try {
          setUser((await api<{ user: SessionUser }>("/auth/me")).user);
        } catch {
          setAccessToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const start = useCallback((data: { access_token: string; user: SessionUser }) => {
    setAccessToken(data.access_token);
    setUser(data.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authRequest("/auth/login", { email, password });
      start(data);
      router.push(data.user.role === "ADMIN" ? "/admin" : "/dashboard");
    },
    [router, start]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const data = await authRequest("/auth/signup", { email, password, name });
      start(data);
      router.push("/dashboard");
    },
    [router, start]
  );

  const logout = useCallback(async () => {
    try {
      await authRequest("/auth/logout");
    } catch {}
    setAccessToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
