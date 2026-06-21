/**
 * Preview entry for the React Email studio (`bun run email`). Renders the
 * real `MatchEmail` template with representative sample data so you can
 * eyeball it without sending. Preview-only — not bundled into the app or any
 * Trigger task (nothing imports this file outside the studio).
 */
import { MatchEmail } from "../src/lib/email/match-email";

const APP = "https://gaff.example.com";

export default function MatchEmailPreview() {
  return (
    <MatchEmail
      partnerName="Sam"
      address="Lavender Hill"
      price="£1,750/mo"
      beds={2}
      outcode="SW11"
      photoUrl="https://picsum.photos/seed/gaff-match/960/480"
      listingUrl={`${APP}/listings/clst-1`}
    />
  );
}
