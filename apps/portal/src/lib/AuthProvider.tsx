"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { callPortalApi, clearStoredToken, getStoredToken, setStoredToken } from "@/lib/apiClient";

interface Developer {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  developer: Developer | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = getStoredToken();
    const storedDeveloper = window.localStorage.getItem("ayitipay_developer");
    if (stored && storedDeveloper) {
      setToken(stored);
      setDeveloper(JSON.parse(storedDeveloper));
    }
    setLoading(false);
  }, []);

  const applySession = useCallback((result: { token: string; developer: Developer }) => {
    setStoredToken(result.token);
    window.localStorage.setItem("ayitipay_developer", JSON.stringify(result.developer));
    setToken(result.token);
    setDeveloper(result.developer);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await callPortalApi<{ token: string; developer: Developer }>("/auth/login", {
        method: "POST",
        body: { email, password },
        token: null,
      });
      applySession(result);
      router.push("/dashboard");
    },
    [applySession, router]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await callPortalApi<{ token: string; developer: Developer }>("/auth/signup", {
        method: "POST",
        body: { email, password, name },
        token: null,
      });
      applySession(result);
      router.push("/dashboard");
    },
    [applySession, router]
  );

  const logout = useCallback(() => {
    clearStoredToken();
    window.localStorage.removeItem("ayitipay_developer");
    setToken(null);
    setDeveloper(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ developer, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
