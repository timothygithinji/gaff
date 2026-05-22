#!/usr/bin/env bun
/**
 * Smoke test for the generated postcodes.io client.
 *
 * Calls the live API for `SW1A1AA` and prints the result. If this prints a
 * postcode record with sensible fields (longitude/latitude/admin_district),
 * the client is wired correctly.
 *
 * Run: `bun run scripts/verify/postcodes-io-smoke.ts`
 */

import {
  createPostcodesClient,
  lookupOutcode,
  lookupPostcode,
} from "../../src/lib/api-clients/postcodes-io";

const client = createPostcodesClient();

console.log("=== postcodes.io · GET /postcodes/SW1A1AA ===");
const single = await lookupPostcode({
  client,
  path: { postcode: "SW1A1AA" },
});

if (single.error) {
  console.error("Request failed:", single.error);
  process.exit(1);
}

const result = single.data?.result;
if (!result) {
  console.error("No result in response", single.data);
  process.exit(1);
}

console.log("Postcode:        ", result.postcode);
console.log("Country:         ", result.country);
console.log("Region:          ", result.region);
console.log("Admin district:  ", result.admin_district);
console.log("Admin ward:      ", result.admin_ward);
console.log("Longitude:       ", result.longitude);
console.log("Latitude:        ", result.latitude);
console.log("LSOA:            ", result.lsoa);
console.log("MSOA:            ", result.msoa);
console.log("Outcode:         ", result.outcode);
console.log("Incode:          ", result.incode);
console.log("Parliament cons.:", result.parliamentary_constituency);

console.log("\n=== postcodes.io · GET /outcodes/NW3 ===");
const outcode = await lookupOutcode({
  client,
  path: { outcode: "NW3" },
});
if (outcode.error) {
  console.error("Outcode request failed:", outcode.error);
  process.exit(1);
}
const outRes = outcode.data?.result;
console.log("Outcode:         ", outRes?.outcode);
console.log("Longitude:       ", outRes?.longitude);
console.log("Latitude:        ", outRes?.latitude);
console.log("Admin districts: ", outRes?.admin_district?.join(", "));
console.log("Country:         ", outRes?.country?.join(", "));

console.log("\nDone.");
