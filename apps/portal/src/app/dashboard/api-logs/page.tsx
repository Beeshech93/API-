"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, ErrorNote, PageTitle, Select, Table, TextInput } from "@/components/ui";

interface Log { request_id: string; endpoint: string; method: string; status_code: number; response_time_ms: number; ip: string | null; provider: string | null; environment: string | null; created_at: string }

export default function ApiLogsPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [logs, setLogs] = useState<Log[]>([]);
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ limit: "100", ...(method ? { method } : {}), ...(status ? { status } : {}), ...(endpoint ? { endpoint } : {}), ...(requestId ? { request_id: requestId } : {}) });
      api<{ logs: Log[] }>(`/portal/api-logs?${qs}`).then((d) => setLogs(d.logs)).catch((e) => setError(errorMessage(e)));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, status, endpoint, requestId]);

  const tone = (code: number) => (code >= 500 ? "failed" : code >= 400 ? "pending" : "completed");

  return (
    <div>
      <PageTitle title={t("nav.apiLogs")} subtitle={t("logs.subtitle")} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Select label={t("logs.method")} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">{t("common.all")}</option>
          {["GET", "POST", "DELETE"].map((m) => <option key={m}>{m}</option>)}
        </Select>
        <Select label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("common.all")}</option>
          {[200, 201, 400, 401, 403, 404, 422, 429, 500, 502, 504].map((c) => <option key={c}>{c}</option>)}
        </Select>
        <TextInput label={t("logs.endpoint")} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/moncash/payments" />
        <TextInput label={t("tx.requestId")} value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="req_..." />
      </div>
      <ErrorNote message={error} />
      <Table head={[t("tx.requestId"), t("logs.method"), t("logs.endpoint"), t("common.status"), t("logs.time"), "IP", t("tx.provider"), t("tx.created")]} empty={t("logs.empty")}>
        {logs.map((l) => (
          <tr key={l.request_id + l.created_at}>
            <td className="font-mono text-xs">{l.request_id}</td>
            <td>{l.method}</td>
            <td className="font-mono text-xs">{l.endpoint}</td>
            <td><Badge value={tone(l.status_code)} label={String(l.status_code)} /></td>
            <td>{l.response_time_ms} ms</td>
            <td className="font-mono text-xs">{l.ip}</td>
            <td className="capitalize">{l.provider ?? "—"}</td>
            <td className="whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
