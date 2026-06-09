/**
 * "You both want this" email — sent the instant a cluster becomes a
 * mutual match (every household member has kept/shortlisted it). This is
 * the one notification that fires immediately rather than waiting for the
 * per-household digest: a match is the rare "enquire now" moment, and UK
 * lets go fast. Rendered by `send-match-email`.
 *
 * Styling tracks the maritime + all-Inter design system (the "Gaff" Paper
 * file → globals.css). Email clients can't read CSS variables, so the
 * palette is inlined as literal hex; the names mirror the maritime tokens.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type MatchEmailProps = {
  /** The household member whose swipe completed the match. */
  partnerName: string;
  address: string;
  /** Pre-formatted, e.g. "£1,800/mo". */
  price: string;
  beds: number | null;
  outcode: string;
  photoUrl: string | null;
  /** Absolute app URL to the listing detail. */
  listingUrl: string;
};

// Maritime palette (light scene), inlined — email clients don't do CSS vars.
const NAVY = "#0e2235"; // ink: headings, body, primary button
const GROUND = "#eef1f4"; // page background + primary-button text
const WHITE = "#ffffff"; // card surface
const SLATE = "#1f3a5f"; // small-caps kicker + muted body text
const STEEL = "#5a7596"; // captions / tertiary
const LINE = "#c9d3dc"; // hairline borders
const SANS = "Inter, Helvetica, Arial, sans-serif";

/**
 * Small-screen polish. The table layout is already fluid (max-width + 100%
 * shrink to the viewport); this only refines phones — full-width shell, a
 * shorter hero, and slightly smaller display type. Apple Mail and the Gmail
 * app honour `<style>` media queries; desktop Outlook ignores them and
 * renders the fluid base, which is never the narrow case.
 */
const MOBILE_CSS = `
  @media only screen and (max-width: 600px) {
    .gaff-shell { width: 100% !important; max-width: 100% !important; }
    .gaff-hero { height: 200px !important; }
    .gaff-h1 { font-size: 21px !important; }
    .gaff-price { font-size: 24px !important; }
    .gaff-pad { padding-left: 20px !important; padding-right: 20px !important; }
  }
`;

export function MatchEmail({
  partnerName,
  address,
  price,
  beds,
  outcode,
  photoUrl,
  listingUrl,
}: MatchEmailProps) {
  const bedLabel = beds == null ? "" : `${beds} bed · `;
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/** biome-ignore lint/security/noDangerouslySetInnerHtml: media-query <style> is the only way to add responsive rules to an HTML email. */}
        <style dangerouslySetInnerHTML={{ __html: MOBILE_CSS }} />
      </Head>
      <Preview>{`You both want ${address} — ${price}`}</Preview>
      <Body
        style={{
          backgroundColor: GROUND,
          fontFamily: SANS,
          margin: 0,
          padding: "24px 16px",
        }}
      >
        <Container
          className="gaff-shell"
          style={{
            backgroundColor: WHITE,
            border: `1px solid ${LINE}`,
            borderRadius: "10px",
            maxWidth: "480px",
            margin: "0 auto",
            overflow: "hidden",
          }}
        >
          {photoUrl ? (
            <Img
              alt={address}
              className="gaff-hero"
              src={photoUrl}
              style={{
                width: "100%",
                height: "240px",
                maxWidth: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : null}
          <Section className="gaff-pad" style={{ padding: "24px 28px" }}>
            <Text
              style={{
                color: SLATE,
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                margin: "0 0 8px",
              }}
            >
              It's a match
            </Text>
            <Heading
              className="gaff-h1"
              style={{
                color: NAVY,
                fontFamily: SANS,
                fontSize: "24px",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
                margin: "0 0 6px",
              }}
            >
              You both want {address}
            </Heading>
            <Text style={{ color: STEEL, fontSize: "14px", margin: "0 0 4px" }}>
              {bedLabel}
              {outcode || "—"}
            </Text>
            <Text
              className="gaff-price"
              style={{
                color: NAVY,
                fontFamily: SANS,
                fontSize: "28px",
                fontWeight: 700,
                margin: "8px 0 20px",
              }}
            >
              {price}
            </Text>
            <Text style={{ color: SLATE, fontSize: "14px", margin: "0 0 20px" }}>
              {partnerName} just kept this too — so it's a mutual shortlist.
              Good places go fast; enquire before someone else does.
            </Text>
            <Button
              href={listingUrl}
              style={{
                backgroundColor: NAVY,
                borderRadius: "12px",
                color: GROUND,
                display: "inline-block",
                fontSize: "15px",
                fontWeight: 600,
                padding: "12px 28px",
                textDecoration: "none",
              }}
            >
              Open it in Gaff
            </Button>
          </Section>
          <Hr style={{ borderColor: LINE, margin: 0 }} />
          <Section className="gaff-pad" style={{ padding: "16px 28px" }}>
            <Text style={{ color: STEEL, fontSize: "12px", margin: 0 }}>
              You're getting this because you and {partnerName} both
              shortlisted this place in Gaff.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default MatchEmail;
