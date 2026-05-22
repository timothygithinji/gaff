/**
 * Portal HTML parsers.
 *
 * Pure `(html) => result` functions for the three rental portals we
 * scrape via Zyte. Each `parseXSearch` returns `ListingSummary[]` and
 * each `parseXDetail` returns `ListingDetail`. Parsers throw only when
 * the page's root data structure is missing (page-shape change); they
 * leave individual missing fields as `undefined`.
 */

export {
  decodeEntities,
  extractPostcode,
  extractScriptJson,
  pluck,
  pluckSafe,
  probe,
} from "./common";
export { parseOpenrentDetail, parseOpenrentSearch } from "./openrent";
export { extractRightmoveModel } from "./page-model";
export { parseRightmoveDetail, parseRightmoveSearch } from "./rightmove";
export { findByKey, findInFlight, parseFlight } from "./rsc-flight";
export type {
  Furnished,
  ListingDetail,
  ListingSummary,
  NearestStation,
  Portal,
} from "./types";
export { parseZooplaDetail, parseZooplaSearch } from "./zoopla";
