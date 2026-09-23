import { open, seal } from "@/utils/secretBox";

describe("secretBox (AES-256-GCM)", () => {
  it("round-trips provider credentials without leaving them readable", () => {
    const box = seal({ apiKey: "sk_live_supersecret", secretKey: "shh" });
    expect(JSON.stringify(box)).not.toContain("supersecret");
    expect(open<{ apiKey: string }>(box).apiKey).toBe("sk_live_supersecret");
  });

  it("uses a fresh IV each time", () => {
    expect(seal({ a: "x" }).iv).not.toBe(seal({ a: "x" }).iv);
  });

  it("rejects tampered ciphertext or tag", () => {
    const box = seal({ a: "x" });
    expect(() => open({ ...box, data: Buffer.from("tampered!!").toString("base64") })).toThrow();
    expect(() => open({ ...box, tag: Buffer.alloc(16).toString("base64") })).toThrow();
  });
});
