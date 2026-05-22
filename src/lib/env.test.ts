import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const BETTER_AUTH_URL_RE = /BETTER_AUTH_URL/;
const SECRET_LEN_RE = /at least 32 characters/;
const AUD_HEX_RE = /64-char lowercase hex/;
const ANTHROPIC_PREFIX_RE = /sk-ant-/;

const VALID: Record<string, string> = {
  DATABASE_URL: "postgres://u:p@h:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  CLOUDFLARE_ACCESS_AUD: "a".repeat(64),
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  ZYTE_API_KEY: "zk_test",
  ANTHROPIC_API_KEY: "sk-ant-test",
  EPC_OPENDATA_TOKEN: "me@example.com:tok",
  GOOGLE_MAPS_API_KEY: "gm_test",
  TRIGGER_SECRET_KEY: "tr_test",
};

describe("parseEnv", () => {
  it("accepts a fully valid source", () => {
    const e = parseEnv(VALID);
    expect(e.BETTER_AUTH_URL).toBe("http://localhost:3000");
    expect(e.NODE_ENV).toBe("development");
  });

  it("rejects a missing BETTER_AUTH_URL with a readable message", () => {
    const partial = { ...VALID } as Record<string, string | undefined>;
    partial.BETTER_AUTH_URL = undefined;
    expect(() => parseEnv(partial)).toThrowError(BETTER_AUTH_URL_RE);
  });

  it("rejects a too-short BETTER_AUTH_SECRET", () => {
    expect(() => parseEnv({ ...VALID, BETTER_AUTH_SECRET: "short" })).toThrow(
      SECRET_LEN_RE
    );
  });

  it("rejects an AUD that isn't 64-char hex", () => {
    expect(() =>
      parseEnv({ ...VALID, CLOUDFLARE_ACCESS_AUD: "not-hex" })
    ).toThrow(AUD_HEX_RE);
  });

  it("rejects ANTHROPIC_API_KEY without the sk-ant- prefix", () => {
    expect(() =>
      parseEnv({ ...VALID, ANTHROPIC_API_KEY: "wrong-prefix" })
    ).toThrow(ANTHROPIC_PREFIX_RE);
  });

  it("defaults NODE_ENV to development", () => {
    const noNodeEnv = { ...VALID };
    expect(parseEnv(noNodeEnv).NODE_ENV).toBe("development");
  });

  // R2_* vars are deliberately optional — the Worker uses the BUCKET
  // binding and never reads them, and Trigger workers without credentials
  // staged should still pass env() so unrelated tasks don't crash. The
  // cache-photos task short-circuits at the read site if they're missing.
  it("leaves R2_* vars optional (parse succeeds with all four absent)", () => {
    const e = parseEnv(VALID);
    expect(e.R2_ACCOUNT_ID).toBeUndefined();
    expect(e.R2_ACCESS_KEY_ID).toBeUndefined();
    expect(e.R2_SECRET_ACCESS_KEY).toBeUndefined();
    expect(e.R2_BUCKET).toBeUndefined();
  });

  it("accepts R2_* vars when populated", () => {
    const e = parseEnv({
      ...VALID,
      R2_ACCOUNT_ID: "acct_123",
      R2_ACCESS_KEY_ID: "AKIA_FAKE",
      R2_SECRET_ACCESS_KEY: "secret_fake",
      R2_BUCKET: "gaff-photos-test",
    });
    expect(e.R2_ACCOUNT_ID).toBe("acct_123");
    expect(e.R2_ACCESS_KEY_ID).toBe("AKIA_FAKE");
    expect(e.R2_SECRET_ACCESS_KEY).toBe("secret_fake");
    expect(e.R2_BUCKET).toBe("gaff-photos-test");
  });
});
