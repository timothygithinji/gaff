#!/usr/bin/env bun
/**
 * Verify EPC opendatacommunities access:
 *   - Basic auth with email:token from EPC_OPENDATA_TOKEN works
 *   - Search by postcode returns expected shape
 *   - Pull a single certificate using lmk-key
 */

const token = process.env.EPC_OPENDATA_TOKEN;
if (!token) {
  console.error("EPC_OPENDATA_TOKEN not set");
  process.exit(1);
}

const basic = btoa(token); // value is "email:token", btoa wraps it
const headers = {
  Authorization: `Basic ${basic}`,
  Accept: "application/json",
};

const postcode = "NW3 4QT"; // central Belsize Park
const searchUrl = `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}&size=5`;

console.log(`=== EPC search · postcode ${postcode} ===`);
console.log(`URL: ${searchUrl}\n`);

const res = await fetch(searchUrl, { headers });
console.log(`Status: ${res.status} ${res.statusText}`);
console.log(`Content-Type: ${res.headers.get("content-type")}`);

if (!res.ok) {
  const body = await res.text();
  console.error("✗ Request failed");
  console.error(body.slice(0, 600));
  process.exit(1);
}

const body = await res.json();
console.log(`✓ JSON parsed. Top-level keys: ${Object.keys(body).join(", ")}`);

const rows = (body as { rows?: unknown[] }).rows ?? [];
console.log(`Rows returned: ${rows.length}`);
if (rows.length === 0) {
  console.warn("⚠ Zero results — try a different postcode");
  process.exit(0);
}

const first = rows[0] as Record<string, unknown>;
console.log("\nFirst row keys:");
console.log(`  ${Object.keys(first).sort().join(", ")}`);

const interestingFields = [
  "lmk-key",
  "address",
  "address1",
  "address2",
  "address3",
  "postcode",
  "current-energy-rating",
  "current-energy-efficiency",
  "potential-energy-rating",
  "potential-energy-efficiency",
  "property-type",
  "built-form",
  "inspection-date",
  "lodgement-date",
  "transaction-type",
  "environment-impact-current",
  "co2-emissions-current",
  "main-fuel",
  "heating-type",
  "mainheat-description",
  "walls-description",
  "floor-description",
  "windows-description",
  "total-floor-area",
  "number-habitable-rooms",
  "tenure",
];
console.log("\nKey fields:");
for (const k of interestingFields) {
  if (k in first) {
    const v = first[k];
    const display = typeof v === "string" && v.length > 60 ? `${v.slice(0, 60)}…` : String(v);
    console.log(`  ✓ ${k}: ${display}`);
  } else {
    console.log(`  · ${k}: (absent)`);
  }
}

// Now fetch full certificate
const lmkKey = first["lmk-key"] as string | undefined;
if (lmkKey) {
  console.log(`\n=== Fetch full certificate by lmk-key ===`);
  const certUrl = `https://epc.opendatacommunities.org/api/v1/domestic/certificate/${encodeURIComponent(lmkKey)}`;
  const cert = await fetch(certUrl, { headers });
  console.log(`Status: ${cert.status}`);
  if (cert.ok) {
    const certBody = (await cert.json()) as { rows?: unknown[] };
    console.log(`✓ Certificate fetched. Rows: ${certBody.rows?.length ?? 0}`);
    const c0 = (certBody.rows?.[0] ?? {}) as Record<string, unknown>;
    const totalKeys = Object.keys(c0).length;
    console.log(`  Full record fields: ${totalKeys}`);
    if (totalKeys > 0) {
      const sampleKeys = Object.keys(c0).slice(0, 10);
      console.log(`  First 10 keys: ${sampleKeys.join(", ")}`);
    }
  } else {
    console.warn("⚠ Cert fetch failed");
  }
}

console.log("\nDone.");
