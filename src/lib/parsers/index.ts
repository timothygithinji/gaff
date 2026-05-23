/**
 * Portal HTML parsers.
 *
 * Pure `(html) => result` functions for the three rental portals we
 * scrape via Zyte. Each `parseXSearch` returns `ListingSummary[]` and
 * each `parseXDetail` returns `ListingDetail`. Parsers throw only when
 * the page's root data structure is missing (page-shape change); they
 * leave individual missing fields as `undefined`.
 *
 * Only the per-portal `parseX*` functions are exposed via this barrel;
 * shared helpers in `./common`, `./page-model`, and `./rsc-flight` are
 * imported from their files directly. Same for the result types in
 * `./types`. Keeps the barrel honest about what's actually a public
 * entry point.
 */

export { parseOpenrentDetail, parseOpenrentSearch } from "./openrent";
export { parseRightmoveDetail, parseRightmoveSearch } from "./rightmove";
export { parseZooplaDetail, parseZooplaSearch } from "./zoopla";
