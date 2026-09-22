"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { callPortalApi } from "@/lib/apiClient";
import { Application } from "@/lib/types";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { developer, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [applications, setApplications] = useState<Application[]>([]);
  const [newAppName, setNewAppName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !developer) router.push("/login");
  }, [loading, developer, router]);

  useEffect(() => {
    if (developer) {
      callPortalApi<Application[]>("/portal/applications").then(setApplications).catch(() => {});
    }
  }, [developer]);

  async function createApplication(e: FormEvent) {
    e.preventDefault();
    if (!newAppName.trim()) return;
    setCreating(true);
    try {
      const app = await callPortalApi<Application>("/portal/applications", {
        method: "POST",
        body: { name: newAppName },
      });
      setApplications((prev) => [app, ...prev]);
      setNewAppName("");
      router.push(`/dashboard/${app.id}`);
    } finally {
      setCreating(false);
    }
  }

  if (loading || !developer) {
    return <div className="max-w-6xl mx-auto px-6 py-16 text-slate-500">Loading…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 flex gap-8">
      <aside className="w-64 shrink-0">
        <p className="text-sm text-slate-500 mb-4">{developer.email}</p>
        <nav className="space-y-1 mb-6">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`/dashboard/${app.id}`}
              className={`block px-3 py-2 rounded-lg text-sm ${
                pathname?.includes(app.id) ? "bg-navy text-white" : "hover:bg-slate-100"
              }`}
            >
              {app.name}
            </Link>
          ))}
          {applications.length === 0 && <p className="text-sm text-slate-400">No applications yet.</p>}
        </nav>
        <form onSubmit={createApplication} className="space-y-2">
          <input
            value={newAppName}
            onChange={(e) => setNewAppName(e.target.value)}
            placeholder="New application name"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="w-full bg-lime text-navy font-semibold py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {creating ? "Creating…" : "+ New application"}
          </button>
        </form>
        <button onClick={logout} className="mt-8 text-sm text-slate-500 underline">
          Sign out
        </button>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
