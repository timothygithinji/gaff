/**
 * EPC (Energy Performance Certificate) API client factory.
 *
 * The EPC API uses HTTP Basic auth with credentials in the form `email:token`.
 * Gaff stores this as a single secret `EPC_OPENDATA_TOKEN` already in the
 * `email:token` shape, so the factory only needs to base64-encode it and
 * prefix with `Basic `.
 *
 * The OpenAPI spec declares `servers: [{ url: "/api/v1" }]` (relative), so we
 * override the base URL with the full origin here.
 */

import { createClient, createConfig } from "./generated/client";
import type { Client } from "./generated/client";

const EPC_BASE_URL = "https://epc.opendatacommunities.org/api/v1";

export interface CreateEpcClientOptions {
  /**
   * EPC credentials in the form `email:token` (the value stored in
   * Doppler / env as `EPC_OPENDATA_TOKEN`). The factory will base64-encode
   * this and send it as the `Authorization: Basic <...>` header.
   */
  token: string;
  /** Override the base URL. Defaults to the production EPC API. */
  baseUrl?: string;
  /** Custom fetch implementation (useful in tests / Workers). */
  fetch?: typeof fetch;
}

export function createEpcClient(options: CreateEpcClientOptions): Client {
  const { token, baseUrl = EPC_BASE_URL, fetch: fetchImpl } = options;
  if (!token) {
    throw new Error(
      "createEpcClient: token is required (expected 'email:token')"
    );
  }
  const basic = btoa(token);
  return createClient(
    createConfig({
      baseUrl,
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
      },
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    })
  );
}
