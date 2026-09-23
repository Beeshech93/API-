"use client";

import { useState } from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>{children}</div>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-navy";
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </Card>
  );
}

const BADGES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  succeeded: "bg-emerald-100 text-emerald-700",
  active: "bg-emerald-100 text-emerald-700",
  operational: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-700",
  open: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  exhausted: "bg-red-100 text-red-700",
  down: "bg-red-100 text-red-700",
  past_due: "bg-red-100 text-red-700",
  suspended: "bg-red-100 text-red-700",
  revoked: "bg-slate-200 text-slate-600",
  cancelled: "bg-slate-200 text-slate-600",
  expired: "bg-slate-200 text-slate-600",
  degraded: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-200 text-slate-600",
  test: "bg-violet-100 text-violet-700",
  live: "bg-brand-100 text-brand-600",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGES[value] ?? "bg-slate-100 text-slate-600"}`}>{label ?? value}</span>;
}

export function Button({
  children, onClick, type = "button", variant = "primary", disabled, className = "",
}: {
  children: React.ReactNode; onClick?: () => void; type?: "button" | "submit"; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; className?: string;
}) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-600",
    secondary: "bg-white border border-slate-300 text-navy hover:bg-slate-50",
    danger: "bg-white border border-red-300 text-red-600 hover:bg-red-50",
    ghost: "text-brand hover:bg-brand-100",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const { label, className = "", ...rest } = props;
  return (
    <label className="block text-sm">
      {label && <span className="block text-slate-600 mb-1">{label}</span>}
      <input {...rest} className={`w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand ${className}`} />
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const { label, className = "", children, ...rest } = props;
  return (
    <label className="block text-sm">
      {label && <span className="block text-slate-600 mb-1">{label}</span>}
      <select {...rest} className={`w-full border border-slate-300 rounded-lg px-3 py-2 bg-white ${className}`}>
        {children}
      </select>
    </label>
  );
}

export function ErrorNote({ message, requestId }: { message: string | null; requestId?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600 mt-2">
      {message}
      {requestId && <span className="text-red-400"> ({requestId})</span>}
    </p>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
            {head.map((h, i) => (
              <th key={i} className="py-3 px-4 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-slate-100 [&_td]:px-4 [&_td]:py-3">{children}</tbody>
      </table>
      {!hasRows && empty && <p className="text-center text-slate-400 py-8 text-sm">{empty}</p>}
    </Card>
  );
}

export function CopyButton({ text, label, doneLabel }: { text: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? doneLabel : label}
    </Button>
  );
}

export function BarChart({ data, color = "#16a34a", height = 120 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 4 - 2);
          return (
            <rect key={i} x={i * barWidth + barWidth * 0.15} y={height / 4 - h} width={barWidth * 0.7} height={Math.max(h, d.value ? 0.6 : 0.2)} rx={0.6} fill={color} opacity={d.value ? 1 : 0.25}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number | null }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-brand";
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemax={max ?? undefined}>
      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function lastNDays(rows: { day: string; [k: string]: string | number }[] | undefined, key: string, n = 14) {
  const map = new Map((rows ?? []).map((r) => [String(r.day).slice(0, 10), Number(r[key])]));
  const out: { label: string; value: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ label: d.slice(5), value: map.get(d) ?? 0 });
  }
  return out;
}
