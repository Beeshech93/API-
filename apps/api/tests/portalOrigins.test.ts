describe("portal origins", () => {
  const load = (value?: string) => {
    jest.resetModules();
    const previous = process.env.PORTAL_APP_URL;
    if (value === undefined) delete process.env.PORTAL_APP_URL;
    else process.env.PORTAL_APP_URL = value;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { env } = require("@/config/env");
    if (previous === undefined) delete process.env.PORTAL_APP_URL;
    else process.env.PORTAL_APP_URL = previous;
    return env as { portalAppUrls: string[]; portalAppUrl: string };
  };

  it("accepts one address (the usual case)", () => {
    const env = load("https://portal.example.com");
    expect(env.portalAppUrls).toEqual(["https://portal.example.com"]);
    expect(env.portalAppUrl).toBe("https://portal.example.com");
  });

  it("accepts several while moving to a new domain; the first is canonical", () => {
    const env = load("https://new.example.com/, https://old.example.com ,");
    expect(env.portalAppUrls).toEqual(["https://new.example.com", "https://old.example.com"]);
    expect(env.portalAppUrl).toBe("https://new.example.com");
  });

  it("defaults to the local portal", () => {
    expect(load(undefined).portalAppUrl).toBe("http://localhost:3000");
  });
});
