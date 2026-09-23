"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import en, { MessageKey } from "@/locales/en";
import fr from "@/locales/fr";
import es from "@/locales/es";
import ht from "@/locales/ht";

// Français is the default language; the user's choice is remembered.
export const LOCALES = ["fr", "en", "ht", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English", ht: "Kreyòl Ayisyen", es: "Español" };

const STORAGE_KEY = "haitipay_locale";
const DICTS: Record<Locale, Record<MessageKey, string>> = { fr, en, ht, es };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && (LOCALES as readonly string[]).includes(stored)) setLocaleState(stored as Locale);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = useCallback((key: string) => (DICTS[locale] as Record<string, string>)[key] ?? (en as Record<string, string>)[key] ?? key, [locale]);

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}

// Prefer a translation keyed by the API's stable error `code`; otherwise fall
// back to the server's own English message.
export function useErrorMessage() {
  const t = useT();
  return (err: unknown, fallbackKey = "auth.generic") => {
    const code = (err as { code?: string })?.code;
    const message = (err as { message?: string })?.message;
    if (code && t(`err.${code}`) !== `err.${code}`) {
      // These codes carry actionable detail from the server (which field, which limit).
      const detailed = ["INVALID_REQUEST", "INVALID_AMOUNT", "FORBIDDEN"].includes(code);
      return detailed && message ? `${t(`err.${code}`)} (${message})` : t(`err.${code}`);
    }
    return message || t(fallbackKey);
  };
}
