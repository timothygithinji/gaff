#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const url = "https://www.rightmove.co.uk/properties/88608822";
const res = await zyteFetch(apiKey, { url, httpResponseBody: true, httpResponseHeaders: true, geolocation: "GB" });
const html = res.html;
console.log(`HTML length: ${html.length}`);

// 1. Are we hitting the right page? Check title/h1
const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "(none)";
console.log(`<title>: ${title.slice(0, 120)}`);
const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "(none)";
console.log(`<h1>: ${h1.slice(0, 120)}`);

// 2. Is the response a CSR shell or full server-rendered?
// Count visible text vs script content
const scriptBytes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].reduce((s, m) => s + m[1].length, 0);
const styleBytes = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].reduce((s, m) => s + m[1].length, 0);
console.log(`Script bytes: ${scriptBytes}`);
console.log(`Style bytes: ${styleBytes}`);

// 3. Look for any JSON-shaped payload — primaryPrice context
const primaryPriceMatches = [...html.matchAll(/primaryPrice/g)];
for (const m of primaryPriceMatches.slice(0, 4)) {
  const start = Math.max(0, m.index! - 200);
  const slice = html.slice(start, m.index! + 200);
  console.log(`\nContext around primaryPrice @ ${m.index}:`);
  console.log(slice.replace(/\s+/g, " "));
}

// 4. Are there JSON-LD scripts?
const lds = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
console.log(`\nJSON-LD scripts: ${lds.length}`);
for (let i = 0; i < lds.length; i++) {
  try {
    const parsed = JSON.parse(lds[i][1]);
    console.log(`  [${i}] @type: ${(parsed as { "@type"?: string })["@type"] ?? "(none)"}`);
    console.log(`  [${i}] keys: ${Object.keys(parsed).slice(0, 15).join(", ")}`);
  } catch (err) {
    console.log(`  [${i}] parse fail: ${(err as Error).message}`);
  }
}

// 5. window.__APP_STATE__, window.__PRELOADED__, etc
const winStateMatches = [...html.matchAll(/window\.(__[A-Z_]+|[a-zA-Z_$]+)\s*=\s*(\{[\s\S]*?\});/g)];
console.log(`\nwindow.X = {…}; assignments: ${winStateMatches.length}`);
for (const m of winStateMatches.slice(0, 5)) {
  console.log(`  ${m[1]} (${m[2].length} bytes)`);
}

// 6. Inline script names (any meaningful ids)
const idScripts = [...html.matchAll(/<script\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)];
console.log(`\nInline scripts with id (${idScripts.length}):`);
for (const m of idScripts) console.log(`  ${m[1]}`);

// 7. Pricing/bedroom literals in the body — server rendered as text?
const bedroomMentions = [...html.matchAll(/(\d+)\s*bedroom/gi)].slice(0, 3);
console.log(`\nbedroom mentions: ${bedroomMentions.length}`);
for (const m of bedroomMentions) console.log(`  "${m[0]}" at idx ${m.index}`);

const priceMatches = [...html.matchAll(/£[\d,]+(?:\s*pcm|\s*pw|\s*per\s*month)?/gi)].slice(0, 4);
console.log(`Price mentions (in body): ${priceMatches.length}`);
for (const m of priceMatches) console.log(`  ${m[0]}`);

// 8. Where does the data come from? Check for any /api/ or /properties/{id} fetch URLs
const apiUrls = [...new Set([...html.matchAll(/(?:fetch|axios)\(["'](\/[^"']+)["']/g)].map((m) => m[1]))];
console.log(`\nDetected API fetch URLs (${apiUrls.length}):`);
for (const u of apiUrls.slice(0, 10)) console.log(`  ${u}`);

const apiUrls2 = [...new Set([...html.matchAll(/["'](https?:\/\/[^"']*?\/api\/[^"']+)["']/g)].map((m) => m[1]))];
console.log(`Detected /api/ URLs anywhere (${apiUrls2.length}):`);
for (const u of apiUrls2.slice(0, 10)) console.log(`  ${u}`);

// 9. Save first 4KB of HTML body (after <body>) for visual inspection
const bodyStart = html.indexOf("<body");
const bodyChunk = bodyStart >= 0 ? html.slice(bodyStart, bodyStart + 3000) : html.slice(0, 3000);
console.log(`\nFirst 3KB after <body>:`);
console.log(bodyChunk.replace(/\s+/g, " "));
