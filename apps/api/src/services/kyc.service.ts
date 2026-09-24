import crypto from "crypto";
import { Client, KycAccountType, KycDocumentType, KycProfile, KycStatus, Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { assertPublicHttpUrl } from "@/utils/ssrf";
import { open, openBytes, seal, sealBytes, SealedBox } from "@/utils/secretBox";
import { audit } from "@/services/audit.service";

// Identity verification (KYC). Every client goes through it before anything touches real
// money. The client declares who they are and what their website/business is, uploads photos
// of their documents, and an administrator reviews and approves or rejects.
//
// Sensitive data handling:
//  - document photos are validated by their actual bytes (never the declared type), size-capped,
//    and encrypted with AES-256-GCM before they are stored;
//  - the ID number is encrypted; only its last 4 characters are kept readable;
//  - clients never get their documents back, and only administrators can open them — each
//    time is written to the audit log;
//  - while a submission is under review, or once approved, the client can't change it.

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const ALL_DOCUMENT_TYPES: KycDocumentType[] = ["ID_FRONT", "ID_BACK", "SELFIE", "PROOF_OF_ADDRESS", "BUSINESS_REGISTRATION"];
const ID_TYPES = ["national_id", "passport", "driver_license"] as const;
export type IdType = (typeof ID_TYPES)[number];

export interface ProfileInput {
  accountType: KycAccountType;
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  phone: string;
  address: string;
  city: string;
  country: string;
  idType: IdType;
  idNumber: string;
  websiteUrl: string;
  businessName?: string;
  businessDescription: string;
  expectedVolume?: string;
}

// Which documents a submission must include.
export function requiredDocuments(accountType: KycAccountType, idType: string): KycDocumentType[] {
  const docs: KycDocumentType[] = ["ID_FRONT", "SELFIE", "PROOF_OF_ADDRESS"];
  if (idType !== "passport") docs.push("ID_BACK");
  if (accountType === "BUSINESS") docs.push("BUSINESS_REGISTRATION");
  return docs;
}

// The real type of an image, from its first bytes. Anything that isn't a plain photo is refused.
export function detectImage(buf: Buffer): { mime: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp" };
  return null;
}

const editable = (status: KycStatus) => status === "NOT_STARTED" || status === "REJECTED";

async function load(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  return client;
}

function assertEditable(client: Client) {
  if (client.kycStatus === "PENDING") throw new AppError("CONFLICT", "Your verification is under review and can't be changed right now.");
  if (client.kycStatus === "APPROVED") throw new AppError("CONFLICT", "Your verification is approved. Contact support to change it.");
}

// ---- Client side ------------------------------------------------------------

const publicProfile = (p: KycProfile) => ({
  account_type: p.accountType.toLowerCase(),
  full_name: p.fullName,
  date_of_birth: p.dateOfBirth.toISOString().slice(0, 10),
  phone: p.phone,
  address: p.address,
  city: p.city,
  country: p.country,
  id_type: p.idType,
  id_number_last4: p.idNumberLast4,
  website_url: p.websiteUrl,
  website_reachable: p.websiteStatus === null ? null : p.websiteStatus < 500,
  business_name: p.businessName,
  business_description: p.businessDescription,
  expected_volume: p.expectedVolume,
});

export async function getClientKyc(clientId: string) {
  const client = await load(clientId);
  const [profile, docs] = await Promise.all([
    prisma.kycProfile.findUnique({ where: { clientId } }),
    prisma.kycDocument.findMany({ where: { clientId }, select: { type: true, mime: true, size: true, updatedAt: true } }),
  ]);
  return {
    status: client.kycStatus.toLowerCase(),
    editable: editable(client.kycStatus),
    submitted_at: client.kycSubmittedAt,
    reviewed_at: client.kycReviewedAt,
    // The reason shown to the client after a rejection.
    review_note: client.kycStatus === "REJECTED" ? client.kycReviewNote : null,
    profile: profile ? publicProfile(profile) : null,
    required_documents: (profile ? requiredDocuments(profile.accountType, profile.idType) : ["ID_FRONT", "SELFIE", "PROOF_OF_ADDRESS"]).map((t) => t.toLowerCase()),
    documents: docs.map((d) => ({ type: d.type.toLowerCase(), mime: d.mime, size: d.size, uploaded_at: d.updatedAt })),
  };
}

// Is the site up? Recorded for the reviewer; the body is never read or returned.
async function checkWebsite(url: string): Promise<number | null> {
  try {
    await assertPublicHttpUrl(url);
  } catch {
    throw new AppError("INVALID_REQUEST", "The website must be a public HTTPS address.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal, headers: { "User-Agent": "HaitiPay-KYC/1.0" } });
    await res.body?.cancel().catch(() => undefined);
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveProfile(clientId: string, input: ProfileInput) {
  const client = await load(clientId);
  assertEditable(client);
  const websiteStatus = await checkWebsite(input.websiteUrl);
  const idNumber = input.idNumber.trim();
  const data = {
    accountType: input.accountType,
    fullName: input.fullName,
    dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00Z`),
    phone: input.phone,
    address: input.address,
    city: input.city,
    country: input.country.toUpperCase(),
    idType: input.idType,
    idNumberSealed: seal({ idNumber }) as unknown as Prisma.InputJsonValue,
    idNumberLast4: idNumber.slice(-4),
    websiteUrl: input.websiteUrl,
    websiteStatus,
    websiteCheckedAt: new Date(),
    businessName: input.accountType === "BUSINESS" ? input.businessName ?? null : null,
    businessDescription: input.businessDescription,
    expectedVolume: input.expectedVolume ?? null,
  };
  const profile = await prisma.kycProfile.upsert({ where: { clientId }, create: { clientId, ...data }, update: data });
  await audit({ action: "kyc.profile_saved", clientId, targetType: "kyc", targetId: clientId });
  return profile;
}

export async function putDocument(clientId: string, type: KycDocumentType, bytes: Buffer) {
  const client = await load(clientId);
  assertEditable(client);
  if (!bytes.length) throw new AppError("INVALID_REQUEST", "The file is empty.");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new AppError("INVALID_REQUEST", "The photo is too large (2 MB maximum).");
  const detected = detectImage(bytes);
  if (!detected) throw new AppError("INVALID_REQUEST", "Upload a photo in JPEG, PNG or WebP format.");
  const row = {
    mime: detected.mime,
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    data: sealBytes(bytes),
  };
  await prisma.kycDocument.upsert({ where: { clientId_type: { clientId, type } }, create: { clientId, type, ...row }, update: row });
  await audit({ action: "kyc.document_uploaded", clientId, targetType: "kyc_document", targetId: type, metadata: { type, size: bytes.length } });
}

export async function deleteDocument(clientId: string, type: KycDocumentType) {
  const client = await load(clientId);
  assertEditable(client);
  await prisma.kycDocument.deleteMany({ where: { clientId, type } });
}

export async function submitKyc(clientId: string) {
  const client = await load(clientId);
  assertEditable(client);
  const profile = await prisma.kycProfile.findUnique({ where: { clientId } });
  if (!profile) throw new AppError("INVALID_REQUEST", "Complete your details before submitting.");
  const have = new Set((await prisma.kycDocument.findMany({ where: { clientId }, select: { type: true } })).map((d) => d.type));
  const missing = requiredDocuments(profile.accountType, profile.idType).filter((t) => !have.has(t));
  if (missing.length) throw new AppError("INVALID_REQUEST", `Missing documents: ${missing.map((m) => m.toLowerCase()).join(", ")}.`);

  // Only from an editable state, so two submissions can't race.
  const { count } = await prisma.client.updateMany({
    where: { id: clientId, kycStatus: { in: ["NOT_STARTED", "REJECTED"] } },
    data: { kycStatus: "PENDING", kycSubmittedAt: new Date(), kycReviewedAt: null, kycReviewedBy: null, kycReviewNote: null },
  });
  if (count !== 1) throw new AppError("CONFLICT", "This verification was already submitted.");
  await audit({ action: "kyc.submitted", clientId, targetType: "kyc", targetId: clientId });
}

// ---- Administrator side -----------------------------------------------------

export async function listKyc(status?: KycStatus) {
  const rows = await prisma.client.findMany({
    where: { kycStatus: status ?? { not: "NOT_STARTED" } },
    orderBy: [{ kycSubmittedAt: "asc" }],
    take: 100,
    include: { kycProfile: { select: { fullName: true, accountType: true, websiteUrl: true, websiteStatus: true } }, users: { select: { email: true }, take: 1 } },
  });
  return rows.map((c) => ({
    client_id: c.id,
    client_name: c.name,
    email: c.users[0]?.email ?? null,
    status: c.kycStatus.toLowerCase(),
    account_type: c.kycProfile?.accountType.toLowerCase() ?? null,
    full_name: c.kycProfile?.fullName ?? null,
    website_url: c.kycProfile?.websiteUrl ?? null,
    submitted_at: c.kycSubmittedAt,
    reviewed_at: c.kycReviewedAt,
  }));
}

// Everything a reviewer needs, including the ID number. Opening it is audited.
export async function getKycForReview(clientId: string, actor: { userId: string; ip?: string }) {
  const client = await load(clientId);
  const [profile, docs] = await Promise.all([
    prisma.kycProfile.findUnique({ where: { clientId } }),
    prisma.kycDocument.findMany({ where: { clientId }, select: { type: true, mime: true, size: true, sha256: true, updatedAt: true } }),
  ]);
  if (!profile) throw new AppError("NOT_FOUND", "This client has not submitted any details.");
  await audit({ action: "admin.kyc_viewed", actorUserId: actor.userId, clientId, ip: actor.ip, targetType: "kyc", targetId: clientId });
  const idNumber = open<{ idNumber: string }>(profile.idNumberSealed as unknown as SealedBox).idNumber;
  return {
    client: { id: client.id, name: client.name },
    status: client.kycStatus.toLowerCase(),
    submitted_at: client.kycSubmittedAt,
    reviewed_at: client.kycReviewedAt,
    review_note: client.kycReviewNote,
    profile: { ...publicProfile(profile), id_number: idNumber, website_status: profile.websiteStatus, website_checked_at: profile.websiteCheckedAt },
    required_documents: requiredDocuments(profile.accountType, profile.idType).map((t) => t.toLowerCase()),
    documents: docs.map((d) => ({ type: d.type.toLowerCase(), mime: d.mime, size: d.size, sha256: d.sha256, uploaded_at: d.updatedAt })),
  };
}

export async function getDocumentForReview(clientId: string, type: KycDocumentType, actor: { userId: string; ip?: string }) {
  const doc = await prisma.kycDocument.findUnique({ where: { clientId_type: { clientId, type } } });
  if (!doc) throw new AppError("NOT_FOUND", "Document not found.");
  await audit({ action: "admin.kyc_document_viewed", actorUserId: actor.userId, clientId, ip: actor.ip, targetType: "kyc_document", targetId: type });
  return { mime: doc.mime, bytes: openBytes(Buffer.from(doc.data)) };
}

export async function approveKyc(clientId: string, actor: { userId: string; ip?: string }, note?: string) {
  const profile = await prisma.kycProfile.findUnique({ where: { clientId } });
  if (!profile) throw new AppError("INVALID_REQUEST", "This client has not submitted any details.");
  const have = new Set((await prisma.kycDocument.findMany({ where: { clientId }, select: { type: true } })).map((d) => d.type));
  const missing = requiredDocuments(profile.accountType, profile.idType).filter((t) => !have.has(t));
  if (missing.length) throw new AppError("INVALID_REQUEST", `Missing documents: ${missing.map((m) => m.toLowerCase()).join(", ")}.`);
  // Approval also opens LIVE access: the administrator has just vetted this client.
  const { count } = await prisma.client.updateMany({
    where: { id: clientId, kycStatus: "PENDING" },
    data: { kycStatus: "APPROVED", kycReviewedAt: new Date(), kycReviewedBy: actor.userId, kycReviewNote: note?.trim() || null, liveEnabled: true },
  });
  if (count !== 1) throw new AppError("CONFLICT", "This verification is not waiting for review.");
  await audit({ action: "admin.kyc_approved", actorUserId: actor.userId, clientId, ip: actor.ip, targetType: "kyc", targetId: clientId });
}

export async function rejectKyc(clientId: string, actor: { userId: string; ip?: string }, note: string) {
  const { count } = await prisma.client.updateMany({
    where: { id: clientId, kycStatus: "PENDING" },
    data: { kycStatus: "REJECTED", kycReviewedAt: new Date(), kycReviewedBy: actor.userId, kycReviewNote: note },
  });
  if (count !== 1) throw new AppError("CONFLICT", "This verification is not waiting for review.");
  await audit({ action: "admin.kyc_rejected", actorUserId: actor.userId, clientId, ip: actor.ip, targetType: "kyc", targetId: clientId });
}

// Reopens a verification that was approved (e.g. documents expired). LIVE access closes with it.
export async function revokeKyc(clientId: string, actor: { userId: string; ip?: string }, note: string) {
  const { count } = await prisma.client.updateMany({
    where: { id: clientId, kycStatus: "APPROVED" },
    data: { kycStatus: "REJECTED", kycReviewedAt: new Date(), kycReviewedBy: actor.userId, kycReviewNote: note, liveEnabled: false },
  });
  if (count !== 1) throw new AppError("CONFLICT", "This verification is not approved.");
  await audit({ action: "admin.kyc_revoked", actorUserId: actor.userId, clientId, ip: actor.ip, targetType: "kyc", targetId: clientId });
}
