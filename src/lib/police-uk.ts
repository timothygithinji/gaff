/**
 * data.police.uk client.
 *
 * Free, unauthenticated public API. The "crimes-street/all-crime"
 * endpoint returns every reported crime within a ~1 mile radius of
 * the given lat/lng for the requested month. Data is ~2 months lagged
 * (e.g. May 2026 queries return data through ~March 2026).
 *
 * We aggregate per-category here so the consumer just sees totals
 * rather than the full raw crime list, which can be 1–2k records.
 */

const CRIMES_ENDPOINT = "https://data.police.uk/api/crimes-street/all-crime";

type RawCrime = {
  category: string;
  month: string;
};

export type CrimeAggregate = {
  /** YYYY-MM. Taken from the month field on the returned crimes. */
  month: string;
  total: number;
  byCategory: Record<string, number>;
};

export type GetCrimesInput = {
  lat: number;
  lng: number;
  /** Optional YYYY-MM. Omitted → most recent month with data. */
  month?: string;
};

/**
 * Fetch and aggregate crimes within a 1 mile radius of (lat, lng).
 * Returns `null` when the API has no records for the area+month
 * (the dataset has gaps in rural areas and in the most recent month).
 */
export async function getCrimeAggregate(
  input: GetCrimesInput
): Promise<CrimeAggregate | null> {
  const params = new URLSearchParams({
    lat: input.lat.toFixed(6),
    lng: input.lng.toFixed(6),
  });
  if (input.month) {
    params.set("date", input.month);
  }
  const url = `${CRIMES_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `data.police.uk ${res.status} ${res.statusText}: ${text.slice(0, 400)}`
    );
  }
  const crimes = (await res.json()) as RawCrime[];
  if (!Array.isArray(crimes) || crimes.length === 0) {
    return null;
  }
  const byCategory: Record<string, number> = {};
  for (const crime of crimes) {
    if (typeof crime?.category !== "string") {
      continue;
    }
    byCategory[crime.category] = (byCategory[crime.category] ?? 0) + 1;
  }
  // The whole window is one month; pick any record's month label.
  const month = crimes.find((c) => typeof c?.month === "string")?.month ?? "";
  return {
    month,
    total: crimes.length,
    byCategory,
  };
}
