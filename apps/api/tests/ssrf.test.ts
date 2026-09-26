import { isPrivateIp } from "@/utils/ssrf";

// A name that is public when it is first checked and private when the connection is opened:
// the DNS-rebinding trick. dns/promises (the first check) says public, dns (the connect) says internal.
jest.mock("dns/promises", () => ({ __esModule: true, default: { lookup: jest.fn(async () => [{ address: "93.184.216.34", family: 4 }]) } }));
jest.mock("dns", () => ({
  __esModule: true,
  default: {
    lookup: jest.fn((_host: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) =>
      opts.all ? cb(null, [{ address: "169.254.169.254", family: 4 }]) : cb(null, "169.254.169.254", 4)),
  },
}));

describe("what counts as a non-public address", () => {
  it.each([
    "127.0.0.1", "10.0.0.5", "172.16.9.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1",
    "224.0.0.1", "255.255.255.255", "192.0.2.1", "::1", "::", "fd00::1", "fe80::1", "fec0::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2001:db8::1",
  ])("refuses %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["8.8.8.8", "93.184.216.34", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows the public address %s", (ip) =>
    expect(isPrivateIp(ip)).toBe(false)
  );

  it("never treats something that isn't an address as safe", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });
});

describe("outbound requests to addresses someone else chose", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { safeRequest } = require("@/utils/safeHttp");

  it("refuses a literal internal address", async () => {
    await expect(safeRequest("https://169.254.169.254/latest/meta-data")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(safeRequest("https://[::1]/")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("refuses plain http and embedded credentials in production", async () => {
    await expect(safeRequest("http://example.com/")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(safeRequest("https://user:pass@example.com/")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("blocks a name that turns internal between the check and the connection (DNS rebinding)", async () => {
    await expect(safeRequest("https://rebind.example.com/hook", { method: "POST", body: "{}" })).rejects.toThrow(/blocked/);
  });
});
