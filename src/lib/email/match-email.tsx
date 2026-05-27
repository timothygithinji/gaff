/**
 * "You both want this" email — sent the instant a cluster becomes a
 * mutual match (every household member has kept/shortlisted it). This is
 * the one notification that fires immediately rather than waiting for the
 * daily digest: a match is the rare "enquire now" moment, and UK lets go
 * fast. Rendered by `send-match-email`.
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

const INK = "#1C1A17";
const PAPER = "#FDFAF4";
const COPPER = "#A0673E";
const MUTED = "#6B6253";

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
      <Head />
      <Preview>{`You both want ${address} — ${price}`}</Preview>
      <Body
        style={{
          backgroundColor: PAPER,
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #EFE7D8",
            borderRadius: "16px",
            maxWidth: "480px",
            margin: "0 auto",
            overflow: "hidden",
          }}
        >
          {photoUrl ? (
            <Img
              alt={address}
              src={photoUrl}
              style={{ width: "100%", height: "240px", objectFit: "cover" }}
            />
          ) : null}
          <Section style={{ padding: "24px 28px" }}>
            <Text
              style={{
                color: COPPER,
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 8px",
              }}
            >
              It's a match
            </Text>
            <Heading
              style={{
                color: INK,
                fontFamily: "Fraunces, Georgia, serif",
                fontSize: "24px",
                lineHeight: 1.2,
                margin: "0 0 6px",
              }}
            >
              You both want {address}
            </Heading>
            <Text style={{ color: MUTED, fontSize: "14px", margin: "0 0 4px" }}>
              {bedLabel}
              {outcode || "—"}
            </Text>
            <Text
              style={{
                color: INK,
                fontFamily: "Fraunces, Georgia, serif",
                fontSize: "28px",
                margin: "8px 0 20px",
              }}
            >
              {price}
            </Text>
            <Text style={{ color: MUTED, fontSize: "14px", margin: "0 0 20px" }}>
              {partnerName} just kept this too — so it's a mutual shortlist.
              Good places go fast; enquire before someone else does.
            </Text>
            <Button
              href={listingUrl}
              style={{
                backgroundColor: INK,
                borderRadius: "999px",
                color: PAPER,
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
          <Hr style={{ borderColor: "#EFE7D8", margin: 0 }} />
          <Section style={{ padding: "16px 28px" }}>
            <Text style={{ color: MUTED, fontSize: "12px", margin: 0 }}>
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
