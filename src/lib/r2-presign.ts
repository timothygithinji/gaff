/**
 * Presign an R2 (S3-compatible) GET URL — auth carried in the query string.
 *
 * Why: the Worker downscales listing photos via `cf.image` (see
 * `src/server.ts`). The image-resizing pipeline fetches the source WITHOUT
 * forwarding custom request headers, so it can't authenticate to the
 * Access-gated `/clusters/*` path — it gets the login page and fails with
 * `9412 (origin returned a non-image)`. R2's S3 endpoint
 * (`<account>.r2.cloudflarestorage.com`) is a different host, not behind the
 * zone's Access app, and a *presigned* URL puts the SigV4 auth in the query
 * string, which `cf.image` preserves. So we point the resizer at the
 * presigned R2 URL instead. `/clusters/*` itself stays gated.
 *
 * Workerd-compatible: uses only Web Crypto + standard string ops.
 */

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

async function hmac(
  key: ArrayBuffer | string,
  msg: string
): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg));
}

/** Encode each path segment but keep the `/` separators. */
function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export type R2PresignArgs = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  /** Link lifetime in seconds. Short — the resizer fetches it immediately. */
  expiresSec?: number;
};

/**
 * Build a SigV4 presigned GET URL for an R2 object. Anyone with the URL can
 * read that one object until it expires, so keep `expiresSec` small.
 */
export async function presignR2GetUrl(args: R2PresignArgs): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket, key } = args;
  const expiresSec = args.expiresSec ?? 120;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  // `new Date()` is fine here (request-time), unlike workflow scripts.
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${bucket}/${encodeKeyPath(key)}`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map(
      (k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k] as string)}`
    )
    .join("&");

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
