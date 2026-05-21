/**
 * Neon helpers — minimal subset needed for per-branch database provisioning.
 *
 * Uses the Neon REST API (https://console.neon.tech/api/v2) for branch
 * list/create/delete and endpoint polling. `neonctl` is shelled out to only
 * inside `getConnectionString`, since Neon's control plane returns the full
 * URL (with credentials) most reliably through that command.
 *
 * Auth: reads `NEON_API_KEY` from the environment, falling back to the OAuth
 * `access_token` in `~/.config/neonctl/credentials.json` (created by
 * `bunx neonctl auth`).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
const NEONCTL_CREDENTIALS_PATH = `${process.env.HOME}/.config/neonctl/credentials.json`;
// `.neon` lives at the repo root; this file is at `<repo>/scripts/lib/neon.ts`.
const NEON_CONFIG_PATH = fileURLToPath(new URL("../../.neon", import.meta.url));
const MAX_BRANCH_NAME_LENGTH = 63;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_EXPIRY_DAYS = 7;
// Neon enforces a 30-day max on expires_at; clamp to be safe.
const MAX_NEON_EXPIRY_DAYS = 30;
// Neon OAuth access tokens expire after ~1h. neonctl refreshes transparently
// on any command and writes the new token back to credentials.json, so when
// the stored token is near expiry we trigger a cheap neonctl call to refresh.
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export interface NeonBranch {
  default?: boolean;
  id: string;
  name: string;
  primary?: boolean;
  protected?: boolean;
}

interface NeonEndpoint {
  branch_id: string;
  current_state: string;
  id: string;
  type: string;
}

export function readNeonProjectId(): string {
  let raw: string;
  try {
    raw = readFileSync(NEON_CONFIG_PATH, "utf-8");
  } catch (err) {
    throw new Error(
      `Could not read Neon project config at ${NEON_CONFIG_PATH}: ${(err as Error).message}`
    );
  }
  const parsed = JSON.parse(raw) as { projectId?: unknown };
  if (typeof parsed.projectId !== "string" || !parsed.projectId) {
    throw new Error(
      `Missing "projectId" in ${NEON_CONFIG_PATH}; expected a non-empty string.`
    );
  }
  return parsed.projectId;
}

export function computeExpiryTimestamp(
  days: number = DEFAULT_EXPIRY_DAYS
): string {
  const clamped = Math.min(Math.max(days, 1), MAX_NEON_EXPIRY_DAYS);
  return new Date(Date.now() + clamped * MS_PER_DAY).toISOString();
}

export function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BRANCH_NAME_LENGTH);
}

function refreshNeonctlTokenIfNeeded(): void {
  let expiresAt: number | undefined;
  try {
    const credentials = JSON.parse(
      readFileSync(NEONCTL_CREDENTIALS_PATH, "utf-8")
    ) as { expires_at?: number };
    expiresAt = credentials.expires_at;
  } catch {
    return;
  }
  if (expiresAt && Date.now() < expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return;
  }
  spawnSync("bunx", ["neonctl", "me"], { stdio: "ignore" });
}

function getNeonApiKey(): string {
  const apiKey = process.env.NEON_API_KEY;
  if (apiKey) {
    return apiKey;
  }
  refreshNeonctlTokenIfNeeded();
  try {
    const credentials = JSON.parse(
      readFileSync(NEONCTL_CREDENTIALS_PATH, "utf-8")
    ) as { access_token?: string };
    if (credentials.access_token) {
      return credentials.access_token;
    }
  } catch {
    // fall through to throw
  }
  throw new Error(
    "NEON_API_KEY not set and no neonctl credentials found. Run 'bunx neonctl auth' or set NEON_API_KEY."
  );
}

async function neonFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const apiKey = getNeonApiKey();
  return await fetch(`${NEON_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

export async function listBranches(projectId: string): Promise<NeonBranch[]> {
  const response = await neonFetch(`/projects/${projectId}/branches`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to list Neon branches: ${response.status} ${response.statusText} - ${text}`
    );
  }
  const data = (await response.json()) as { branches?: NeonBranch[] };
  return data.branches ?? [];
}

export async function getBranchByName(
  projectId: string,
  branchName: string
): Promise<NeonBranch | undefined> {
  const branches = await listBranches(projectId);
  return branches.find((b) => b.name === branchName);
}

export async function branchExists(
  projectId: string,
  branchName: string
): Promise<{ exists: boolean; branchId?: string }> {
  try {
    const found = await getBranchByName(projectId, branchName);
    return found ? { exists: true, branchId: found.id } : { exists: false };
  } catch {
    return { exists: false };
  }
}

export async function createBranch(
  projectId: string,
  branchName: string,
  options: { expiresAt?: string; parentId?: string } = {}
): Promise<{ branchId: string }> {
  // Omitting `parent_id` makes Neon branch from the project's default branch
  // (main). Callers wanting to branch from a non-default parent must pass
  // parentId explicitly.
  const branch: { name: string; expires_at?: string; parent_id?: string } = {
    name: branchName,
  };
  if (options.expiresAt) {
    branch.expires_at = options.expiresAt;
  }
  if (options.parentId) {
    branch.parent_id = options.parentId;
  }
  const response = await neonFetch(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch,
      endpoints: [{ type: "read_write" }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create branch '${branchName}': ${response.status} ${response.statusText} - ${text}`
    );
  }

  const data = (await response.json()) as { branch: { id: string } };
  if (!data.branch?.id) {
    throw new Error(`Branch created but no ID returned for '${branchName}'`);
  }
  return { branchId: data.branch.id };
}

export async function setBranchExpiry(
  projectId: string,
  branchId: string,
  expiresAt: string | null
): Promise<void> {
  const response = await neonFetch(
    `/projects/${projectId}/branches/${branchId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ branch: { expires_at: expiresAt } }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to set expiry on branch '${branchId}': ${response.status} ${response.statusText} - ${text}`
    );
  }
}

async function listEndpoints(projectId: string): Promise<NeonEndpoint[]> {
  const response = await neonFetch(`/projects/${projectId}/endpoints`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to list endpoints: ${response.status} ${response.statusText} - ${text}`
    );
  }
  const data = (await response.json()) as { endpoints?: NeonEndpoint[] };
  return data.endpoints ?? [];
}

export async function waitForEndpointReady(
  projectId: string,
  branchId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<void> {
  const { timeoutMs = 2 * 60 * 1000, pollIntervalMs = 3000 } = options;
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Endpoint not ready after ${Math.round(timeoutMs / 1000)}s for branch '${branchId}'`
      );
    }

    const endpoints = await listEndpoints(projectId);
    const endpoint = endpoints.find(
      (ep) => ep.branch_id === branchId && ep.type === "read_write"
    );
    if (
      endpoint?.current_state === "active" ||
      endpoint?.current_state === "idle"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function deleteBranch(
  projectId: string,
  branchName: string
): Promise<void> {
  const branch = await getBranchByName(projectId, branchName);
  if (!branch) {
    return;
  }

  const response = await neonFetch(
    `/projects/${projectId}/branches/${branch.id}`,
    { method: "DELETE" }
  );
  if (response.ok || response.status === 404) {
    return;
  }
  const text = await response.text();
  throw new Error(
    `Failed to delete branch '${branchName}': ${response.status} ${response.statusText} - ${text}`
  );
}

export function getConnectionString(
  projectId: string,
  branchName: string,
  databaseName: string,
  roleName: string
): string {
  const result = execFileSync(
    "bunx",
    [
      "neonctl",
      "connection-string",
      branchName,
      "--project-id",
      projectId,
      "--database-name",
      databaseName,
      "--role-name",
      roleName,
    ],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();

  if (!result) {
    throw new Error(`Empty connection string returned for '${branchName}'`);
  }
  return result;
}
