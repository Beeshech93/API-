"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Button, Card, ErrorNote, TextInput } from "@/components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const t = useT();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <Card className="p-6">
        <h1 className="text-2xl font-bold text-navy mb-6">{t("auth.signinTitle")}</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput required type="email" autoComplete="email" label={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextInput required type="password" autoComplete="current-password" label={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorNote message={error} />
          <Button type="submit" disabled={busy} className="w-full">{busy ? t("auth.signingIn") : t("auth.signinTitle")}</Button>
        </form>
        <p className="text-sm text-slate-600 mt-4">{t("auth.noAccount")} <Link href="/signup" className="text-brand underline">{t("auth.createOne")}</Link></p>
      </Card>
    </div>
  );
}
