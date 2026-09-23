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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signup(email, password, name);
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
          <ErrorNote message={error} />
          <Button type="submit" disabled={busy} className="w-full">{busy ? t("auth.creating") : t("auth.createAccount")}</Button>
        </form>
        <p className="text-sm text-slate-600 mt-4">{t("auth.haveAccount")} <Link href="/login" className="text-electric underline">{t("auth.signInLink")}</Link></p>
      </Card>
    </div>
  );
}
