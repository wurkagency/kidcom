import { afterEach, describe, expect, it, vi } from "vitest";

// Production must fail closed: a missing, placeholder or development secret
// stops the process at startup instead of silently running on a value that
// is public in the source code (security sweep 2026-09-24, finding 1).

const REAL = { a: "a3".repeat(32), b: "b4".repeat(32), c: "c5".repeat(32) };

function production(overrides: Record<string, string> = {}) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SESSION_SECRET", REAL.a);
  vi.stubEnv("MEDICAL_INFO_ENCRYPTION_KEY", REAL.b);
  vi.stubEnv("MEDIA_ENCRYPTION_KEY", REAL.c);
  vi.stubEnv("HOST", "");
  for (const [k, v] of Object.entries(overrides)) vi.stubEnv(k, v);
}

async function loadConfig() {
  vi.resetModules();
  return (await import("./config")).config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config in production", () => {
  it("starts with real secrets, listening on loopback only", async () => {
    production();
    const config = await loadConfig();
    expect(config.isProduction).toBe(true);
    expect(config.host).toBe("127.0.0.1");
    expect(config.sessionSecret).toBe(REAL.a);
  });

  it("HOST overrides the listen address", async () => {
    production({ HOST: "10.0.0.5" });
    expect((await loadConfig()).host).toBe("10.0.0.5");
  });

  it("refuses to start without a secret (no silent development fallback)", async () => {
    production({ SESSION_SECRET: "" });
    await expect(loadConfig()).rejects.toThrow("Missing required environment variable: SESSION_SECRET");
    vi.unstubAllEnvs();
    production({ MEDICAL_INFO_ENCRYPTION_KEY: "" });
    await expect(loadConfig()).rejects.toThrow("Missing required environment variable: MEDICAL_INFO_ENCRYPTION_KEY");
  });

  it.each([
    ["the .env.example placeholder", "SESSION_SECRET", "change-me-in-prod"],
    ["the development fallback", "SESSION_SECRET", "dev-only-secret-change-me"],
    ["a short value", "SESSION_SECRET", "k8J2m9Qx"],
    ["the medical development fallback", "MEDICAL_INFO_ENCRYPTION_KEY", "dev-only-medical-encryption-key-change-me"],
    ["the development media key", "MEDIA_ENCRYPTION_KEY", "d0".repeat(32)],
    ["a template placeholder", "MEDIA_ENCRYPTION_KEY", "<openssl rand -hex 32 — back up apart from the media>"],
  ])("refuses %s", async (_label, name, value) => {
    production({ [name]: value });
    await expect(loadConfig()).rejects.toThrow(`${name} must be a random secret of at least 32 characters in production`);
  });

  it("tells how to keep existing medical info readable when the medical key is refused", async () => {
    production({ MEDICAL_INFO_ENCRYPTION_KEY: "change-me-in-prod" });
    await expect(loadConfig()).rejects.toThrow(/MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS.*medical:rekey/);
  });

  it("reads previous medical keys for a rotation", async () => {
    production({ MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS: "old-one, dev-only-medical-encryption-key-change-me" });
    expect((await loadConfig()).medicalInfoEncryptionKeysPrevious).toEqual(["old-one", "dev-only-medical-encryption-key-change-me"]);
  });

  it("email refuses to fall back to the log without SMTP", async () => {
    production({ SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" });
    vi.resetModules();
    await expect(import("./lib/mailSender")).rejects.toThrow("SMTP_HOST, SMTP_USER and SMTP_PASS are required in production");
  });

  it("email uses SMTP when it's configured", async () => {
    production({ SMTP_HOST: "smtp-relay.example.com", SMTP_USER: "user", SMTP_PASS: "pass" });
    vi.resetModules();
    const { mailSender, SmtpMailSender } = await import("./lib/mailSender");
    expect(mailSender).toBeInstanceOf(SmtpMailSender);
  });
});

describe("config in development", () => {
  it("falls back to development values and listens on all interfaces", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("HOST", "");
    const config = await loadConfig();
    expect(config.sessionSecret).toBe("dev-only-secret-change-me");
    expect(config.host).toBeUndefined();
  });
});
