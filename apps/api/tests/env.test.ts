describe("production refuses to start with a weak or missing JWT secret", () => {
  const load = (secret?: string) => {
    jest.resetModules();
    const previous = process.env.JWT_SECRET;
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require("@/config/env").env.jwt.secret as string;
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  };

  it("throws when it is missing", () => expect(() => load(undefined)).toThrow(/JWT_SECRET/));
  it("throws when it is short", () => expect(() => load("short-secret")).toThrow(/JWT_SECRET/));
  it("accepts a long random one", () => expect(load("x".repeat(48))).toBe("x".repeat(48)));
});
