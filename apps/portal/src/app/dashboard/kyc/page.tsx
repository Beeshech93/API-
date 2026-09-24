"use client";

import { useEffect, useRef, useState } from "react";
import { api, uploadImage } from "@/lib/apiClient";
import { prepareImage } from "@/lib/image";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, Select, TextArea, TextInput } from "@/components/ui";

interface Profile {
  account_type: "individual" | "business"; full_name: string; date_of_birth: string; phone: string; address: string; city: string; country: string;
  id_type: string; id_number_last4: string; website_url: string; website_reachable: boolean | null; business_name: string | null;
  business_description: string; expected_volume: string | null;
}
interface Kyc {
  status: "not_started" | "pending" | "approved" | "rejected";
  editable: boolean;
  review_note: string | null;
  profile: Profile | null;
  required_documents: string[];
  documents: { type: string; size: number; uploaded_at: string }[];
}

const EMPTY = { account_type: "individual", full_name: "", date_of_birth: "", phone: "", address: "", city: "", country: "HT", id_type: "national_id", id_number: "", website_url: "https://", business_name: "", business_description: "", expected_volume: "" };

export default function KycPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = () =>
    api<Kyc>("/portal/kyc")
      .then((d) => {
        setKyc(d);
        if (d.profile) {
          const p = d.profile;
          setForm((f) => ({ ...f, account_type: p.account_type, full_name: p.full_name, date_of_birth: p.date_of_birth, phone: p.phone, address: p.address, city: p.city, country: p.country, id_type: p.id_type, website_url: p.website_url, business_name: p.business_name ?? "", business_description: p.business_description, expected_volume: p.expected_volume ?? "" }));
        }
      })
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<typeof EMPTY>) => setForm({ ...form, ...patch });

  async function saveDetails() {
    setBusy("profile");
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.id_number) delete body.id_number;
      if (!body.expected_volume) delete body.expected_volume;
      if (form.account_type !== "business") delete body.business_name;
      // The ID number is only sent when typed (it is never sent back to the browser).
      const d = await api<Kyc>("/portal/kyc/profile", { method: "PUT", body });
      setKyc(d);
      setForm((f) => ({ ...f, id_number: "" }));
      setMessage(t("kyc.saved"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function upload(type: string, file: File | undefined) {
    if (!file) return;
    setBusy(type);
    setError(null);
    setMessage(null);
    try {
      const image = await prepareImage(file);
      setPreviews((p) => ({ ...p, [type]: URL.createObjectURL(image) }));
      setKyc(await uploadImage<Kyc>(`/portal/kyc/documents/${type}`, image));
    } catch (e) {
      setError(e instanceof Error && e.message === "not-an-image" ? t("kyc.notImage") : e instanceof Error && e.message === "too-large" ? t("kyc.tooLarge") : errorMessage(e));
    } finally {
      setBusy(null);
      if (inputs.current[type]) inputs.current[type]!.value = "";
    }
  }

  async function remove(type: string) {
    setBusy(type);
    try {
      setKyc(await api<Kyc>(`/portal/kyc/documents/${type}`, { method: "DELETE" }));
      setPreviews((p) => { const n = { ...p }; delete n[type]; return n; });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("submit");
    setError(null);
    setMessage(null);
    try {
      setKyc(await api<Kyc>("/portal/kyc/submit", { method: "POST" }));
      setMessage(t("kyc.submitted"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!kyc) return <p className="text-slate-500">{error ?? t("common.loading")}</p>;

  const has = (type: string) => kyc.documents.some((d) => d.type === type);
  const required = form.account_type === "business" ? ["id_front", ...(form.id_type === "passport" ? [] : ["id_back"]), "selfie", "proof_of_address", "business_registration"] : ["id_front", ...(form.id_type === "passport" ? [] : ["id_back"]), "selfie", "proof_of_address"];
  const allDocs = required.every(has);
  const detailsOk = form.full_name.trim().length >= 2 && form.date_of_birth && form.phone && form.address && form.city && form.website_url.startsWith("http") && form.business_description.trim().length >= 20 && (kyc.profile !== null || form.id_number.trim().length >= 4) && (form.account_type !== "business" || form.business_name.trim().length >= 2);
  const locked = !kyc.editable;
  const tone = kyc.status === "approved" ? "active" : kyc.status === "pending" ? "pending" : kyc.status === "rejected" ? "failed" : "unknown";

  return (
    <div>
      <PageTitle title={t("kyc.title")} subtitle={t("kyc.subtitle")} action={<Badge value={tone} label={t(`kyc.status.${kyc.status}`)} />} />
      {message && <p className="mb-4 rounded-lg bg-brand-100 text-brand-600 text-sm px-4 py-3">{message}</p>}
      <ErrorNote message={error} />

      <Card className={`p-5 mb-6 ${kyc.status === "rejected" ? "border-red-300 bg-red-50" : kyc.status === "approved" ? "border-brand/40 bg-brand-50" : ""}`}>
        <p className="font-semibold text-navy">{t(`kyc.banner.${kyc.status}.title`)}</p>
        <p className="text-sm text-slate-600 mt-1">{t(`kyc.banner.${kyc.status}.body`)}</p>
        {kyc.review_note && <p className="text-sm mt-2"><span className="font-semibold">{t("kyc.reason")}:</span> {kyc.review_note}</p>}
        {locked && <p className="text-xs text-slate-500 mt-2">{t("kyc.readOnly")}</p>}
      </Card>

      <Card className="p-5 mb-6 max-w-3xl">
        <h2 className="font-semibold text-navy mb-3">{t("kyc.detailsTitle")}</h2>
        <fieldset disabled={locked} className="space-y-4">
          <div className="flex gap-2">
            {(["individual", "business"] as const).map((a) => (
              <button key={a} type="button" aria-pressed={form.account_type === a} onClick={() => set({ account_type: a })} className={`px-4 py-2 rounded-full border text-sm font-medium ${form.account_type === a ? "bg-brand text-white border-brand" : "border-slate-300 text-slate-600"}`}>{t(`kyc.${a}`)}</button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <TextInput label={t("kyc.fullName")} value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} autoComplete="name" />
            <TextInput label={t("kyc.dob")} type="date" value={form.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
            <TextInput label={t("kyc.phone")} value={form.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" />
            <TextInput label={t("kyc.city")} value={form.city} onChange={(e) => set({ city: e.target.value })} />
            <div className="sm:col-span-2"><TextInput label={t("kyc.address")} value={form.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" /></div>
            <Select label={t("kyc.idType")} value={form.id_type} onChange={(e) => set({ id_type: e.target.value })}>
              {["national_id", "passport", "driver_license"].map((x) => <option key={x} value={x}>{t(`kyc.idType.${x}`)}</option>)}
            </Select>
            <TextInput label={t("kyc.idNumber")} type="password" autoComplete="off" value={form.id_number} onChange={(e) => set({ id_number: e.target.value })} placeholder={kyc.profile ? `•••• ${kyc.profile.id_number_last4}` : ""} />
            {form.account_type === "business" && <div className="sm:col-span-2"><TextInput label={t("kyc.businessName")} value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} /></div>}
            <div className="sm:col-span-2">
              <TextInput label={t("kyc.website")} type="url" value={form.website_url} onChange={(e) => set({ website_url: e.target.value })} placeholder="https://" />
              <p className="text-xs text-slate-500 mt-1">{t("kyc.websiteHint")}</p>
              {kyc.profile && kyc.profile.website_reachable === false && <p className="text-xs text-amber-700 mt-1">{t("kyc.websiteDown")}</p>}
            </div>
            <div className="sm:col-span-2">
              <TextArea label={t("kyc.description")} rows={4} maxLength={1000} value={form.business_description} onChange={(e) => set({ business_description: e.target.value })} />
              <p className="text-xs text-slate-500 mt-1">{t("kyc.descriptionHint")}</p>
            </div>
            <Select label={t("kyc.volume")} value={form.expected_volume} onChange={(e) => set({ expected_volume: e.target.value })}>
              <option value="">—</option>
              {["lt_100k", "100k_1m", "1m_10m", "gt_10m"].map((x) => <option key={x} value={x}>{t(`kyc.volume.${x}`)}</option>)}
            </Select>
          </div>
        </fieldset>
        {!locked && <div className="mt-4"><Button onClick={saveDetails} disabled={busy !== null || !detailsOk}>{busy === "profile" ? t("kyc.saving") : t("kyc.saveDetails")}</Button></div>}
      </Card>

      <Card className="p-5 mb-6 max-w-3xl">
        <h2 className="font-semibold text-navy">{t("kyc.docs.title")}</h2>
        <p className="text-sm text-slate-600 mt-1 mb-4">{t("kyc.docs.hint")}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {required.map((type) => (
            <div key={type} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-navy">{t(`kyc.doc.${type}`)}</p>
                <Badge value={has(type) ? "active" : "pending"} label={has(type) ? t("kyc.uploaded") : t("kyc.missing")} />
              </div>
              {previews[type] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={previews[type]} alt="" className="mt-3 h-28 w-full object-cover rounded-lg border border-slate-200" />}
              {!locked && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input ref={(el) => { inputs.current[type] = el; }} type="file" accept="image/*" capture={type === "selfie" ? "user" : undefined} className="hidden" onChange={(e) => upload(type, e.target.files?.[0])} />
                  <Button variant="secondary" disabled={busy !== null} onClick={() => inputs.current[type]?.click()}>{busy === type ? t("kyc.uploading") : has(type) ? t("kyc.replace") : t("kyc.upload")}</Button>
                  {has(type) && <Button variant="ghost" disabled={busy !== null} onClick={() => remove(type)}>{t("kyc.remove")}</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {!locked && (
        <div className="max-w-3xl">
          <Button onClick={submit} disabled={busy !== null || !kyc.profile || !allDocs}>{busy === "submit" ? t("kyc.saving") : t("kyc.submit")}</Button>
          {(!kyc.profile || !allDocs) && <p className="text-xs text-slate-500 mt-2">{t("kyc.submitHint")}</p>}
        </div>
      )}
    </div>
  );
}
