/**
 * Minimal SigV4 PUT for Cloudflare R2 over the S3-compatible HTTP API.
 *
 * This is the leaner cousin of the inline signer in
 * `src/trigger/cache-photos.ts` — same algorithm, hoisted into a shared
 * module so the new raw-HTML uploader can reuse it without re-importing
 * 2MB of `@aws-sdk`. workerd has everything we need (`crypto.subtle`,
 * `TextEncoder`, `fetch`) and Trigger.dev's Node runtime does too.
 *
 * Keep this dependency-free: no Node-only APIs, no `Buffer`. That way
 * both the Worker and Trigger sides can import it.
 */

export type R2Credentials = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type R2PutInput = {
  creds: R2Credentials;
  key: string;
  body: ArrayBuffer | Uint8Array;
  contentType: string;
  /**
   * Extra headers to sign in addition to the canonical three (host,
   * x-amz-content-sha256, x-amz-date). Use this for things like
   * `content-encoding: gzip` so R2 stores the value on the object.
   */
  extraHeaders?: Record<string, string>;
};

function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(
  key: string | Uint8Array,
  data: string
): Promise<Uint8Array> {
  const keyBytes =
    typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(new TextEncoder().encode(data))
  );
  return new Uint8Array(sig);
}

async function hmacHex(key: Uint8Array, data: string): Promise<string> {
  const sig = await hmac(key, data);
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * PUT one object to R2 with SigV4 signing. Throws on non-2xx so callers
 * can `try` once at the top and not have to inspect the response.
 */
export async function r2Put(input: R2PutInput): Promise<void> {
  const { creds, key, body, contentType, extraHeaders } = input;
  const host = `${creds.accountId}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${creds.bucket}/${key}`;

  const bodyBuf = body instanceof ArrayBuffer ? body : toArrayBuffer(body);
  const byteLength =
    body instanceof ArrayBuffer ? body.byteLength : body.byteLength;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const payloadHash = await sha256Hex(bodyBuf);

  // Build canonical headers, sorted lower-case. Extra headers participate
  // in the signature so callers can set content-encoding etc.
  const allHeaders: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(extraHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    ),
  };
  const sortedNames = Object.keys(allHeaders).sort();
  const canonicalHeaders =
    `${sortedNames.map((n) => `${n}:${allHeaders[n]}`).join("\n")}\n`;
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    "PUT",
    `/${creds.bucket}/${key}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const kDate = await hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = await hmacHex(kSigning, stringToSign);

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Headers actually sent (lower-cased to match the canonical form we signed).
  const httpHeaders: Record<string, string> = {
    Host: host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: authorization,
    "Content-Type": contentType,
    "Content-Length": byteLength.toString(),
  };
  for (const [k, v] of Object.entries(extraHeaders ?? {})) {
    httpHeaders[k] = v;
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: httpHeaders,
    body: bodyBuf,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `R2 PUT ${res.status} ${res.statusText}: ${errBody.slice(0, 200)}`
    );
  }
}
