"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { ErrorNote, PageTitle, Table } from "@/components/ui";

interface Log { requestId: string; clientId: string | null; endpoint: string; method: string; statusCode: number; responseMs: number; ip: string | null; createdAt: string }
interface Audit { id: string; action: string; actorUserId: string | null; clientId: string | null; ip: string | null; createdAt: string }

export default function AdminLogs() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [logs, setLogs] = useState<Log[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api<{ logs: Log[] }>("/admin/api-logs"), api<{ logs: Audit[] }>("/admin/audit-logs")])
      .then(([a, b]) => { setLogs(a.logs); setAudit(b.logs); })
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <PageTitle title={t("nav.apiLogs")} />
      <ErrorNote message={error} />
      <Table head={[t("tx.requestId"), t("admin.client"), t("logs.method"), t("logs.endpoint"), t("common.status"), t("logs.time"), "IP", t("tx.created")]} empty={t("logs.empty")}>
        {logs.map((l) => (
          <tr key={l.requestId + l.createdAt}><td className="font-mono text-xs">{l.requestId}</td><td className="font-mono text-xs">{l.clientId?.slice(0, 8) ?? "—"}</td><td>{l.method}</td><td className="font-mono text-xs">{l.endpoint}</td><td>{l.statusCode}</td><td>{l.responseMs} ms</td><td className="font-mono text-xs">{l.ip}</td><td>{new Date(l.createdAt).toLocaleString()}</td></tr>
        ))}
      </Table>
      <h2 className="font-semibold text-navy mt-8 mb-2">{t("admin.audit")}</h2>
      <Table head={[t("admin.action"), t("admin.client"), "IP", t("tx.created")]} empty={t("common.empty")}>
        {audit.map((a) => (
          <tr key={a.id}><td><code className="text-xs">{a.action}</code></td><td className="font-mono text-xs">{a.clientId?.slice(0, 8) ?? "—"}</td><td className="font-mono text-xs">{a.ip}</td><td>{new Date(a.createdAt).toLocaleString()}</td></tr>
        ))}
      </Table>
    </div>
  );
}
