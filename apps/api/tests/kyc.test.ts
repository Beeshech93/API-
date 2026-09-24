import { detectImage, requiredDocuments } from "@/services/kyc.service";
import { openBytes, sealBytes } from "@/utils/secretBox";
import { DEFAULT_LIMITS, liveBlockReason } from "@/services/limits.service";

jest.mock("@/utils/prisma", () => ({ prisma: {} }));

describe("document photos", () => {
  it("recognises real images by their bytes", () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))?.mime).toBe("image/jpeg");
    expect(detectImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]))?.mime).toBe("image/png");
    expect(detectImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))?.mime).toBe("image/webp");
  });

  it("refuses anything that only claims to be an image", () => {
    expect(detectImage(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImage(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(detectImage(Buffer.from("GIF89a"))).toBeNull();
    expect(detectImage(Buffer.alloc(0))).toBeNull();
    expect(detectImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]))).toBeNull();
  });

  it("encrypts photos, and a tampered or truncated blob doesn't decrypt", () => {
    const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("secret pixels")]);
    const box = sealBytes(photo);
    expect(box.length).toBe(photo.length + 28);
    expect(box.includes(Buffer.from("secret pixels"))).toBe(false);
    expect(openBytes(box).equals(photo)).toBe(true);
    expect(sealBytes(photo).equals(box)).toBe(false); // fresh IV every time
    const tampered = Buffer.from(box);
    tampered[tampered.length - 1] ^= 1;
    expect(() => openBytes(tampered)).toThrow();
    expect(() => openBytes(box.subarray(0, 20))).toThrow();
  });
});

describe("which documents a submission needs", () => {
  it("depends on the kind of account and ID", () => {
    expect(requiredDocuments("INDIVIDUAL", "national_id")).toEqual(["ID_FRONT", "SELFIE", "PROOF_OF_ADDRESS", "ID_BACK"]);
    expect(requiredDocuments("INDIVIDUAL", "passport")).toEqual(["ID_FRONT", "SELFIE", "PROOF_OF_ADDRESS"]);
    expect(requiredDocuments("BUSINESS", "driver_license")).toContain("BUSINESS_REGISTRATION");
  });
});

describe("the LIVE gate", () => {
  const approvedAndEnabled = { kycStatus: "APPROVED" as const, liveEnabled: true };
  it("opens only for a verified client with LIVE access", () => {
    expect(liveBlockReason(DEFAULT_LIMITS, approvedAndEnabled)).toBeNull();
  });
  it("KYC always comes first, whatever the approval setting", () => {
    for (const requireLiveApproval of [true, false]) {
      const limits = { ...DEFAULT_LIMITS, requireLiveApproval };
      expect(liveBlockReason(limits, { kycStatus: "NOT_STARTED", liveEnabled: true })).toMatch(/KYC is required|KYC\) is required/);
      expect(liveBlockReason(limits, { kycStatus: "PENDING", liveEnabled: true })).toMatch(/under review/);
      expect(liveBlockReason(limits, { kycStatus: "REJECTED", liveEnabled: true })).toMatch(/not approved/);
    }
  });
  it("a verified client still needs LIVE access unless the administrator switched that off", () => {
    expect(liveBlockReason(DEFAULT_LIMITS, { kycStatus: "APPROVED", liveEnabled: false })).toMatch(/LIVE access has not been enabled/);
    expect(liveBlockReason({ ...DEFAULT_LIMITS, requireLiveApproval: false }, { kycStatus: "APPROVED", liveEnabled: false })).toBeNull();
  });
});
