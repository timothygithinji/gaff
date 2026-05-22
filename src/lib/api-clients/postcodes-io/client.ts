/**
 * postcodes.io client factory.
 *
 * postcodes.io is an unauthenticated public API. The factory only sets the
 * base URL and optional fetch implementation.
 */

import { createClient, createConfig } from "./generated/client";
import type { Client } from "./generated/client";

const POSTCODES_BASE_URL = "https://api.postcodes.io";

export interface CreatePostcodesClientOptions {
  /** Override the base URL. Defaults to https://api.postcodes.io. */
  baseUrl?: string;
  /** Custom fetch implementation (useful in tests / Workers). */
  fetch?: typeof fetch;
}

export function createPostcodesClient(
  options: CreatePostcodesClientOptions = {}
): Client {
  const { baseUrl = POSTCODES_BASE_URL, fetch: fetchImpl } = options;
  return createClient(
    createConfig({
      baseUrl,
      headers: {
        Accept: "application/json",
      },
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    })
  );
}
