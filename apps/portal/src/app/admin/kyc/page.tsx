"use client";

import { useEffect, useState } from "react";
import { api, apiBlob } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, Select, Table, TextInput } from "@/components/ui";

interface Row { client_id: string; client_name: string; email: string | null; status: string; account_type: string | null; full_name: string | null; website_url: string | null; submitted_at: string | null }
interface Detail {
  client: { id: string; name: string }; status: string; submitted_at: string | null; review_note: string | null;
  profile: { account_type: string; full_name: string; date_of_birth: string; phone: string; address: string; city: string; country: string; id_type: string; id_number: string; website_url: string; website_status: number | null; business_name: string | null; business_description: string; expected_volume: string | null };
  required_documents: string[];
  documents: { type: string; mime: string; size: number; sha256: string }[];
}

export default function AdminKyc() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);
  const [mode, setMode] = useState<"reject" | "approve" | "revoke" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadRows = () => api<{ submissions: Row[] }>(`/admin/kyc${status ? `?status=${status}` : ""}`).then((d) => setRows(d.submissions)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Photos are fetched with the admin's session and shown from memory; nothing is cached or linked.
  useEffect(() => () => Object.values(images).forEach((u) => URL.revokeObjectURL(u)), [images]);

  async function open(clientId: string) {
    setError(null);
    setImages({});
    setMode(null);
    setNote("");
    try {
      const d = await api<Detail>(`/admin/kyc/${clientId}`);
      setDetail(d);
      const entries = await Promise.all(d.documents.map(async (doc) => [doc.type, URL.createObjectURL(await apiBlob(`/admin/kyc/${clientId}/documents/${doc.type}`))] as const));
      setImages(Object.fromEntries(entries));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function decide() {
    if (!detail || !mode) return;
    setError(null);
    try {
      await api(`/admin/kyc/${detail.client.id}/${mode}`, { method: "POST", body: { note } });
      setDetail(null);
      setImages({});
      setMode(null);
      await loadRows();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const tone = (s: string) => (s === "approved" ? "active" : s === "pending" ? "pending" : "failed");
  const p = detail?.profile;

  return (
    <div>
      <PageTitle title={t("admin.kyc.title")} subtitle={t("admin.kyc.subtitle")} />
      <ErrorNote message={error} />
      <div className="max-w-xs mb-4">
        <Select label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">{t("kyc.status.pending")}</option>
          <option value="approved">{t("kyc.status.approved")}</option>
          <option value="rejected">{t("kyc.status.rejected")}</option>
          <option value="">{t("common.all")}</option>
        </Select>
      </div>
      <Table head={[t("tx.created"), t("admin.fund.client"), t("auth.email"), t("kyc.accountType"), t("kyc.website"), t("common.status"), ""]} empty={t("admin.fund.empty")}>
        {rows.map((r) => (
          <tr key={r.client_id}>
            <td className="whitespace-nowrap">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}</td>
            <td>{r.client_name}{r.full_name ? <span className="block text-xs text-slate-500">{r.full_name}</span> : null}</td>
            <td className="text-xs">{r.email}</td>
            <td>{r.account_type ? t(`kyc.${r.account_type}`) : "—"}</td>
            <td className="text-xs break-all">{r.website_url ?? "—"}</td>
            <td><Badge value={tone(r.status)} label={t(`kyc.status.${r.status}`)} /></td>
            <td><Button variant="secondary" onClick={() => open(r.client_id)}>{t("admin.kyc.review")}</Button></td>
          </tr>
        ))}
      </Table>

      {detail && p && (
        <Card className="p-5 mt-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-navy text-lg">{detail.client.name}</h2>
            <Badge value={tone(detail.status)} label={t(`kyc.status.${detail.status}`)} />
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
            {[
              [t("kyc.accountType"), t(`kyc.${p.account_type}`)],
              [t("kyc.fullName"), p.full_name],
              [t("kyc.dob"), p.date_of_birth],
              [t("kyc.phone"), p.phone],
              [t("kyc.address"), `${p.address}, ${p.city} (${p.country})`],
              [t("kyc.idType"), `${t(`kyc.idType.${p.id_type}`)} · ${p.id_number}`],
              ...(p.business_name ? [[t("kyc.businessName"), p.business_name]] : []),
              [t("kyc.volume"), p.expected_volume ? t(`kyc.volume.${p.expected_volume}`) : "—"],
            ].map(([k, v]) => (<div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-800">{v}</dd></div>))}
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">{t("kyc.website")}</dt>
              <dd className="text-slate-800 break-all">
                {/* Opened without referrer/opener, as a plain address to inspect. */}
                <a href={p.website_url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline">{p.website_url}</a>{" "}
                <Badge value={p.website_status !== null && p.website_status < 500 ? "active" : "failed"} label={p.website_status !== null && p.website_status < 500 ? `${t("admin.kyc.reachable")} (${p.website_status})` : t("admin.kyc.unreachable")} />
              </dd>
            </div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-500">{t("kyc.description")}</dt><dd className="text-slate-800 whitespace-pre-wrap">{p.business_description}</dd></div>
          </dl>

          <h3 className="font-semibold text-navy mt-6 mb-2">{t("kyc.docs.title")}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {detail.required_documents.map((type) => (
              <div key={type} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-navy mb-2">{t(`kyc.doc.${type}`)}</p>
                {images[type] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={images[type]} alt={t(`kyc.doc.${type}`)} onClick={() => setZoom(images[type])} className="h-40 w-full object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                ) : (
                  <p className="text-xs text-red-600">{t("kyc.missing")}</p>
                )}
              </div>
            ))}
          </div>

          {detail.status === "pending" && !mode && (
            <div className="flex gap-2 mt-6">
              <Button onClick={() => { setMode("approve"); setNote(""); }}>{t("admin.fund.approve")}</Button>
              <Button variant="danger" onClick={() => { setMode("reject"); setNote(""); }}>{t("admin.fund.reject")}</Button>
            </div>
          )}
          {detail.status === "approved" && !mode && <div className="mt-6"><Button variant="danger" onClick={() => { setMode("revoke"); setNote(""); }}>{t("admin.kyc.revoke")}</Button></div>}
          {mode && (
            <div className="mt-6 max-w-xl space-y-3">
              <TextInput label={mode === "approve" ? t("fund.note") : t("admin.kyc.rejectReason")} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2">
                <Button variant={mode === "approve" ? "primary" : "danger"} onClick={decide} disabled={mode !== "approve" && note.trim().length < 5}>{mode === "approve" ? t("admin.fund.approve") : mode === "reject" ? t("admin.fund.reject") : t("admin.kyc.revoke")}</Button>
                <Button variant="secondary" onClick={() => setMode(null)}>{t("common.cancel")}</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {zoom && (
        <div role="dialog" aria-modal="true" onClick={() => setZoom(null)} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
