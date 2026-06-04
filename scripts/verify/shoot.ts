import { existsSync } from "node:fs";
/**
 * Standalone screenshot harness for UI verification.
 *
 * Drives a real Chromium (Playwright) against the local dev server, logs in
 * once (session cached to disk), then screenshots any route at any viewport.
 * Used by the rebuild verify loop to diff the running app against Paper.
 *
 * Usage:
 *   bun scripts/verify/shoot.ts <job> [<job> ...]
 *   where each job is  label:route:WIDTHxHEIGHT
 *   e.g. bun scripts/verify/shoot.ts review-mobile:/:390x844 review-desktop:/:1440x900
 *
 * Routes with a leading slash are joined to BASE_URL (default http://localhost:3000).
 * Output PNGs are written to OUT_DIR (default /tmp/gaff-shots).
 *
 * Env:
 *   BASE_URL        default http://localhost:3000
 *   OUT_DIR         default /tmp/gaff-shots
 *   E2E_EMAIL       default uiv2-tester@example.com
 *   E2E_PASSWORD    default Password123!
 *   FRESH_LOGIN=1   ignore cached session and log in again
 *   FULL_PAGE=1     capture the full scrollable page (default: viewport only)
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp/gaff-shots";
const EMAIL = process.env.E2E_EMAIL ?? "uiv2-tester@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Password123!";
const AUTH_FILE = `${OUT_DIR}/.auth.json`;
const FULL_PAGE = process.env.FULL_PAGE === "1";

type Job = { label: string; route: string; width: number; height: number };

function parseJob(arg: string): Job {
  // label:route:WxH  — route may itself contain colons? keep it simple: split on first and last.
  const first = arg.indexOf(":");
  const last = arg.lastIndexOf(":");
  if (first === -1 || first === last) {
    throw new Error(`Bad job "${arg}". Expected label:route:WIDTHxHEIGHT`);
  }
  const label = arg.slice(0, first);
  const route = arg.slice(first + 1, last);
  const dims = arg.slice(last + 1);
  const m = dims.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`Bad dimensions "${dims}" in job "${arg}"`);
  return { label, route, width: Number(m[1]), height: Number(m[2]) };
}

async function main() {
  const jobs = process.argv.slice(2).map(parseJob);
  if (jobs.length === 0) {
    console.error("No jobs. Usage: bun scripts/verify/shoot.ts label:route:WxH ...");
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const haveAuth = existsSync(AUTH_FILE) && process.env.FRESH_LOGIN !== "1";
  const context = await browser.newContext(
    haveAuth ? { storageState: AUTH_FILE } : {},
  );

  // Log in if we don't have a cached session.
  if (!haveAuth) {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 });
    await context.storageState({ path: AUTH_FILE });
    await page.close();
    console.log("logged in, session cached");
  }

  const results: string[] = [];
  for (const job of jobs) {
    const page = await context.newPage();
    await page.setViewportSize({ width: job.width, height: job.height });
    const url = job.route.startsWith("http") ? job.route : `${BASE_URL}${job.route}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // settle: fonts + any client hydration
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const out = `${OUT_DIR}/${job.label}.png`;
    await page.screenshot({ path: out, fullPage: FULL_PAGE });
    results.push(`${job.label}\t${job.width}x${job.height}\t${url}\t${out}`);
    await page.close();
  }

  await browser.close();
  console.log("\nshots:");
  for (const r of results) {
    console.log(`  ${r}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
