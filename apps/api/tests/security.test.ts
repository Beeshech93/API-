import { assertPublicHttpUrl } from "@/utils/ssrf";
import { buildSignatureHeader, signHmac, verifyHmac } from "@/utils/hmac";
import { signAccessToken, verifyAccessToken } from "@/utils/jwt";

describe("SSRF guard for webhook URLs", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/hook",
    "https://192.168.1.10/hook",
    "https://172.16.0.1/hook",
    "https://[::1]/hook",
    "https://user:pass@example.com/hook",
    "ftp://example.com/hook",
    "not a url",
  ])("blocks %s", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("allows a public IP literal", async () => {
    await expect(assertPublicHttpUrl("https://93.184.216.34/hook")).resolves.toBeUndefined();
  });
});

describe("webhook signatures", () => {
  it("signs t=<ts>,v1=<hmac> over `${t}.${body}` and verifies", () => {
    const body = JSON.stringify({ event: "payment.completed" });
    const header = buildSignatureHeader("whsec_x", body);
    const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
    expect(verifyHmac("whsec_x", `${t}.${body}`, v1)).toBe(true);
    expect(verifyHmac("whsec_other", `${t}.${body}`, v1)).toBe(false);
    expect(signHmac("k", "a")).toHaveLength(64);
  });
});

describe("access tokens", () => {
  it("round-trips claims and rejects tampering", () => {
    const token = signAccessToken({ sub: "u1", clientId: "c1", role: "USER" });
    expect(verifyAccessToken(token)).toMatchObject({ sub: "u1", clientId: "c1", role: "USER" });
    expect(() => verifyAccessToken(token.slice(0, -2) + "xx")).toThrow();
  });
});
