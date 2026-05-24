import * as crypto from "node:crypto";
import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import * as doppler from "@pulumiverse/doppler";

const config = new pulumi.Config();
const accountId = config.require("accountId");

const projectName = "gaff";
const domain = "gaff.example.com";

// Cloudflare resource naming convention: timothygithinji-{appName}-{environment}.
// Matches the existing `timothygithinji-scout-production` bucket and keeps
// R2 bucket names globally unique across the org's R2 footprint. KV
// namespaces are account-scoped (don't need to be globally unique) but
// reusing the same convention keeps dashboard hygiene consistent.
const resourceName = `timothygithinji-${projectName}-production`;

// KV namespace bound to the worker as `KV`. Renameable in place — the
// Worker binding in wrangler.jsonc references the KV by `id`, not by
// title, so changing the title here is a no-op for runtime behavior.
const kv = new cloudflare.WorkersKvNamespace(`${projectName}-kv`, {
  accountId,
  title: resourceName,
});

// R2 bucket bound to the worker as `BUCKET`.
// R2 names must be lowercase with no underscores.
const bucket = new cloudflare.R2Bucket(`${projectName}-r2`, {
  accountId,
  name: resourceName,
  location: "wnam",
});

// ---------------------------------------------------------------------------
// R2 API token (S3-compatible) for the Trigger.dev workers.
//
// The Cloudflare Worker writes to R2 via the BUCKET binding — no auth
// needed. But Trigger.dev tasks run on Node-on-Fly, not workerd, so they
// can't reach the binding. They use the S3-compatible HTTP endpoint
// instead (see src/lib/r2-s3.ts, src/lib/raw-html.ts), which needs an
// access_key_id + secret_access_key pair.
//
// We mint a Cloudflare API token scoped to ONLY this bucket. R2's S3
// adapter accepts Cloudflare API tokens directly:
//   accessKeyId     = sha256(tokenValue)
//   secretAccessKey = tokenValue
// — per Cloudflare's R2 S3 compatibility docs.
//
// The permission group is looked up by name so we never hardcode IDs
// that may rotate between Cloudflare account versions.
// ---------------------------------------------------------------------------

// Look up the bucket-scoped R2 permission groups by name. These live in
// the account-token namespace (`/accounts/{id}/tokens/permission_groups`)
// — distinct from the IAM permission groups returned by
// `/accounts/{id}/iam/permission_groups`. The Pulumi t-stack token needs
// `Account API Tokens > Read` to query this endpoint; ensure that
// permission is on the provisioning token if this data source 403s.
//
// We use the bucket-scoped groups (`Workers R2 Storage Bucket Item
// Read/Write`) rather than the account-wide ones (`Workers R2 Storage
// Read/Write`) so the resulting token is locked to a single bucket even
// at the permission-group level, not just via the `resources` string.
const r2BucketReadPermGroup =
  cloudflare.getAccountApiTokenPermissionGroupsListOutput({
    accountId,
    name: "Workers R2 Storage Bucket Item Read",
  });
const r2BucketWritePermGroup =
  cloudflare.getAccountApiTokenPermissionGroupsListOutput({
    accountId,
    name: "Workers R2 Storage Bucket Item Write",
  });

function firstPermGroupId(
  list: pulumi.Output<{ results: { id: string; name: string }[] }>,
  expectedName: string,
): pulumi.Output<string> {
  return list.apply((res) => {
    const match = res.results.find((g) => g.name === expectedName);
    if (!match) {
      throw new Error(
        `Cloudflare API didn't return a "${expectedName}" permission group; ` +
          `got ${res.results.length} groups (${res.results.map((r) => r.name).join(", ")})`,
      );
    }
    return match.id;
  });
}

// `AccountToken` hits POST /accounts/{id}/tokens which accepts Bearer
// auth — `ApiToken` hits the user-scoped POST /user/tokens which
// requires legacy key+email and 403s with the t-stack token. Same
// resulting token shape, just a different namespace.
const r2Token = new cloudflare.AccountToken(`${projectName}-r2-token`, {
  accountId,
  name: `${projectName}-r2-trigger-workers`,
  policies: [
    {
      effect: "allow",
      permissionGroups: [
        {
          id: firstPermGroupId(
            r2BucketReadPermGroup,
            "Workers R2 Storage Bucket Item Read",
          ),
        },
        {
          id: firstPermGroupId(
            r2BucketWritePermGroup,
            "Workers R2 Storage Bucket Item Write",
          ),
        },
      ],
      // Scope to THIS bucket only — `default` is the jurisdiction prefix
      // for non-EU / non-FedRAMP buckets. The bucket-scoped permission
      // groups above only accept resources in this namespace.
      resources: pulumi
        .all([accountId, bucket.name])
        .apply(([aid, name]) =>
          JSON.stringify({
            [`com.cloudflare.edge.r2.bucket.${aid}_default_${name}`]: "*",
          }),
        ),
    },
  ],
});

// Cloudflare Access — restrict the domain to members of the org email.
// In @pulumi/cloudflare v6 the policy is declared as a separate resource
// and then attached via the application's `policies` array.
const accessPolicy = new cloudflare.ZeroTrustAccessPolicy(`${projectName}-access-policy`, {
  accountId,
  name: "Allow timothygithinji.com",
  decision: "allow",
  includes: [
    {
      emailDomain: { domain: "timothygithinji.com" },
    },
  ],
});

const accessApp = new cloudflare.ZeroTrustAccessApplication(`${projectName}-access-app`, {
  accountId,
  name: `${projectName}`,
  domain,
  type: "self_hosted",
  sessionDuration: "24h",
  autoRedirectToIdentity: false,
  policies: [{ id: accessPolicy.id }],
});

export const accessAppId = accessApp.id;
export const accessAppAud = accessApp.aud;
export const accessPolicyId = accessPolicy.id;

export const kvNamespaceId = kv.id;
export const kvNamespaceTitle = kv.title;
export const r2BucketName = bucket.name;
export const workerUrl = `https://${domain}`;

// R2 S3-compatible credentials for the Trigger.dev workers.
// Per Cloudflare's R2 S3 compatibility docs:
//   AWS_ACCESS_KEY_ID     = the Cloudflare API token's ID (32 char hex)
//   AWS_SECRET_ACCESS_KEY = sha256(token value), lowercase hex (64 chars)
// (Not to be confused with the value itself — R2's S3 endpoint will
// reject a 64-char access_key_id with "should be 32".)
// `pulumi.secret(...)` flags the secret as encrypted in stack state;
// the access key id is the token's resource id and isn't sensitive.
export const r2AccountId = accountId;
export const r2AccessKeyId = r2Token.id;
export const r2SecretAccessKey = pulumi.secret(
  r2Token.value.apply((v) =>
    crypto.createHash("sha256").update(v).digest("hex"),
  ),
);

// ---------------------------------------------------------------------------
// Doppler: push the four R2_* secrets into gaff/prd so the Trigger.dev
// workers (which read them via the syncEnvVars extension in
// trigger.config.ts) and any other Doppler-consuming services see them
// without a manual `doppler secrets set` step.
//
// Provider auth comes from the DOPPLER_TOKEN env var (Pulumi run sources
// it from the local Doppler CLI login via `doppler configure get token`).
//
// `r2Token` is declared above this block; the secret values flow as
// pulumi.Output<string>, never landing as plain text in stack state or
// in the secret-resource args.
// ---------------------------------------------------------------------------

const DOPPLER_PROJECT = projectName;
const DOPPLER_CONFIG = "prd";

const dopplerSecrets: Record<string, pulumi.Input<string>> = {
  R2_ACCOUNT_ID: accountId,
  R2_BUCKET: bucket.name,
  R2_ACCESS_KEY_ID: r2AccessKeyId,
  R2_SECRET_ACCESS_KEY: r2SecretAccessKey,
};

for (const [name, value] of Object.entries(dopplerSecrets)) {
  new doppler.Secret(`${projectName}-doppler-${name.toLowerCase()}`, {
    project: DOPPLER_PROJECT,
    config: DOPPLER_CONFIG,
    name,
    value,
  });
}
