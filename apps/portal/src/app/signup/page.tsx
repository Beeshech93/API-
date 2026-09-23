"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";
import { useErrorMessage, useT } from "@/lib/i18n";

export default function SignupPage() {
  const { signup } = useAuth();
  const t = useT();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(email, password, name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-navy mb-6">{t("auth.signupTitle")}</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("auth.name")} value={name} onChange={setName} />
        <Field label={t("auth.email")} type="email" value={email} onChange={setEmail} />
        <Field label={t("auth.password")} type="password" value={password} onChange={setPassword} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-navy text-white py-2.5 rounded-lg font-semibold disabled:opacity-50"
        >
          {submitting ? t("auth.creating") : t("auth.createAccount")}
        </button>
      </form>
      <p className="text-sm text-slate-600 mt-4">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="text-navy underline">
          {t("auth.signInLink")}
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime"
      />
    </label>
  );
}
