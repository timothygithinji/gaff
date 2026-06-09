/**
 * Preview entry for the React Email studio (`bun run email`). Renders the
 * real `DigestEmail` template with representative sample data so you can
 * eyeball it without sending. Preview-only — not bundled into the app or any
 * Trigger task (nothing imports this file outside the studio).
 */
import { DigestEmail } from "../src/lib/email/digest-email";

const APP = "https://gaff.example.com";

export default function DigestEmailPreview() {
  return (
    <DigestEmail
      count={6}
      reviewUrl={`${APP}/`}
      items={[
        {
          address: "Lavender Hill",
          price: "£1,750/mo",
          beds: 2,
          outcode: "SW11",
          photoUrl: "https://picsum.photos/seed/gaff-1/192/168",
          listingUrl: `${APP}/listings/clst-1?from=review`,
        },
        {
          address: "Tooting Bec Road",
          price: "£1,625/mo",
          beds: 2,
          outcode: "SW17",
          photoUrl: "https://picsum.photos/seed/gaff-2/192/168",
          listingUrl: `${APP}/listings/clst-2?from=review`,
        },
        {
          address: "Bramfield Road",
          price: "£1,900/mo",
          beds: 3,
          outcode: "SW11",
          photoUrl: "https://picsum.photos/seed/gaff-3/192/168",
          listingUrl: `${APP}/listings/clst-3?from=review`,
        },
        {
          // No-photo case — the row should collapse to text-only.
          address: "Ritherdon Road",
          price: "Price on request",
          beds: null,
          outcode: "SW17",
          photoUrl: null,
          listingUrl: `${APP}/listings/clst-4?from=review`,
        },
      ]}
    />
  );
}
