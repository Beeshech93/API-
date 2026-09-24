"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Button, Card, ErrorNote, TextInput } from "@/components/ui";

export default function SignupPage() {
  const { signup } = useAuth();
  const t = useT();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [services, setServices] = useState<{ receive: boolean; send: boolean }>({ receive: false, send: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signup(email, password, name, (["receive", "send"] as const).filter((s) => services[s]));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <Card className="p-6">
        <h1 className="text-2xl font-bold text-navy mb-6">{t("auth.signupTitle")}</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput required autoComplete="name" label={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput required type="email" autoComplete="email" label={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <div>
            <TextInput required type="password" autoComplete="new-password" minLength={10} label={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">{t("auth.passwordHint")}</p>
          </div>
          <fieldset>
            <legend className="text-sm text-slate-600 mb-2">{t("auth.services")}</legend>
            <div className="grid gap-2">
              {(["receive", "send"] as const).map((s) => (
                <label key={s} className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${services[s] ? "border-brand bg-brand-50" : "border-slate-300"}`}>
                  <input type="checkbox" className="mt-1" checked={services[s]} onChange={(e) => setServices({ ...services, [s]: e.target.checked })} />
                  <span>
                    <span className="block text-sm font-semibold text-navy">{t(`auth.services.${s}`)}</span>
                    <span className="block text-xs text-slate-500">{t(`auth.services.${s}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t("auth.servicesHint")}</p>
          </fieldset>
          <ErrorNote message={error} />
          <Button type="submit" disabled={busy || (!services.receive && !services.send)} className="w-full">{busy ? t("auth.creating") : t("auth.createAccount")}</Button>
        </form>
        <p className="text-sm text-slate-600 mt-4">{t("auth.haveAccount")} <Link href="/login" className="text-brand underline">{t("auth.signInLink")}</Link></p>
      </Card>
    </div>
  );
}
