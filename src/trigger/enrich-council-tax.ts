/**
 * Per-cluster council tax billing-authority resolution.
 *
 * Council tax band comes off the listing during the detail scrape; the
 * *rate* depends on which billing authority the property sits in. This
 * task resolves that authority once per building — postcode →
 * `codes.admin_district` via postcodes.io — and stamps the GSS code +
 * name onto the `property_clusters` row.
 *
 * The actual annual figure isn't computed or stored here. It's derived
 * at read time (`listing-detail.ts`) by joining the authority code
 * against the `council_tax_rates` reference table (seeded annually by
 * `scripts/seed-council-tax.ts`) and applying the statutory band ratios
 * in `src/lib/council-tax.ts`. Keeping it read-time means re-seeding next
 * year's rates updates every estimate without re-running this task.
 *
 * Fan-out: dispatched alongside enrich-epc / enrich-crime / … from
 * `clusterTask.onSuccess`. No-ops when the cluster has no postcode or
 * the postcode doesn't resolve (e.g. non-England, where we hold no
 * rates anyway).
 */

import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { resolveBillingAuthority } from "../lib/council-tax";
import { scrapeQueue } from "./queues";

export type EnrichCouncilTaxPayload = {
  clusterId: string;
};

export type EnrichCouncilTaxOutput = {
  clusterId: string;
  authorityCode: string | null;
};

export const enrichCouncilTaxTask = task({
  id: "enrich-council-tax",
  queue: scrapeQueue,
  maxDuration: 60,

  run: async (
    payload: EnrichCouncilTaxPayload
  ): Promise<EnrichCouncilTaxOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const empty = { clusterId, authorityCode: null };

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`enrich-council-tax: cluster ${clusterId} not found`);
    }
    if (!cluster.postcode) {
      logger.warn("enrich-council-tax: cluster has no postcode, skipping", {
        clusterId,
      });
      return empty;
    }

    const authority = await resolveBillingAuthority(cluster.postcode);
    if (!authority) {
      logger.log("enrich-council-tax: postcode did not resolve, skipping", {
        clusterId,
        postcode: cluster.postcode,
      });
      return empty;
    }

    await db
      .update(schema.propertyClusters)
      .set({
        councilTaxAuthorityCode: authority.code,
        councilTaxAuthorityName: authority.name,
      })
      .where(eq(schema.propertyClusters.id, clusterId));

    logger.log("enrich-council-tax: done", {
      clusterId,
      authorityCode: authority.code,
      authorityName: authority.name,
      country: authority.country,
    });

    return { clusterId, authorityCode: authority.code };
  },
});
