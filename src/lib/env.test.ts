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
});
