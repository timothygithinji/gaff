/**
 * Daily "new places to review" digest. Sent each morning (08:00
 * Europe/London) when a household has had new in-band listings appear
 * since the last digest. Because it goes out in the morning, overnight
 * enrichment has finished, so each row is rich (price, beds, area). One
 * email to every member; blind review is preserved (it lists places to
 * review, never a peer's verdict). Rendered by `daily-digest`.
 *
 * Styling tracks the maritime + all-Inter design system (the "Gaff" Paper
 * file → globals.css). Email clients can't read CSS variables, so the
 * palette is inlined as literal hex; the names mirror the maritime tokens.
 */
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export type DigestItem = {
  address: string;
  /** Pre-formatted, e.g. "£1,800/mo". */
  price: string;
  beds: number | null;
  outcode: string;
  photoUrl: string | null;
  listingUrl: string;
};

export type DigestEmailProps = {
  /** Total new clusters (may exceed the listed `items`). */
  count: number;
  items: DigestItem[];
  /** Absolute app URL to the review screen. */
  reviewUrl: string;
};

// Maritime palette (light scene), inlined — email clients don't do CSS vars.
const NAVY = "#0e2235"; // ink: headings, body, primary button
const GROUND = "#eef1f4"; // page background + primary-button text
const WHITE = "#ffffff"; // card surface
const COPPER = "#d77a4a"; // the one accent — small-caps label
const STEEL = "#5a7596"; // captions / tertiary
const LINE = "#c9d3dc"; // hairline borders
const SANS = "Inter, Helvetica, Arial, sans-serif";

export function DigestEmail({ count, items, reviewUrl }: DigestEmailProps) {
  const heading =
    count === 1 ? "1 new place to review" : `${count} new places to review`;
  const overflow = count - items.length;
  return (
    <Html>
      <Head />
      <Preview>{heading}</Preview>
      <Body
        style={{
          backgroundColor: GROUND,
          fontFamily: SANS,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container style={{ maxWidth: "520px", margin: "0 auto" }}>
          <Section style={{ padding: "0 8px 16px" }}>
            <Text
              style={{
                color: COPPER,
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 6px",
              }}
            >
              Your daily Gaff
            </Text>
            <Heading
              style={{
                color: NAVY,
                fontFamily: SANS,
                fontSize: "26px",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {heading}
            </Heading>
          </Section>

          {items.map((item) => (
            <Section
              key={item.listingUrl}
              style={{
                backgroundColor: WHITE,
                border: `1px solid ${LINE}`,
                borderRadius: "8px",
                marginBottom: "10px",
                overflow: "hidden",
              }}
            >
              <Link href={item.listingUrl} style={{ textDecoration: "none" }}>
                <Row>
                  {item.photoUrl ? (
                    <Column style={{ width: "120px" }}>
                      <Img
                        alt={item.address}
                        src={item.photoUrl}
                        style={{
                          width: "120px",
                          height: "96px",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Column>
                  ) : null}
                  <Column style={{ padding: "12px 14px", verticalAlign: "top" }}>
                    <Text
                      style={{
                        color: NAVY,
                        fontFamily: SANS,
                        fontSize: "18px",
                        fontWeight: 700,
                        margin: "0 0 2px",
                      }}
                    >
                      {item.price}
                    </Text>
                    <Text
                      style={{ color: NAVY, fontSize: "14px", margin: "0 0 2px" }}
                    >
                      {item.address}
                    </Text>
                    <Text style={{ color: STEEL, fontSize: "12px", margin: 0 }}>
                      {item.beds == null ? "" : `${item.beds} bed · `}
                      {item.outcode || "—"}
                    </Text>
                  </Column>
                </Row>
              </Link>
            </Section>
          ))}

          {overflow > 0 ? (
            <Text style={{ color: STEEL, fontSize: "13px", padding: "4px 8px" }}>
              + {overflow} more waiting in your queue.
            </Text>
          ) : null}

          <Section style={{ padding: "12px 8px 8px" }}>
            <Button
              href={reviewUrl}
              style={{
                backgroundColor: NAVY,
                borderRadius: "8px",
                color: GROUND,
                display: "inline-block",
                fontSize: "15px",
                fontWeight: 600,
                padding: "12px 28px",
                textDecoration: "none",
              }}
            >
              Review them in Gaff
            </Button>
          </Section>
          <Hr style={{ borderColor: LINE, margin: "8px 0" }} />
          <Text style={{ color: STEEL, fontSize: "12px", padding: "0 8px" }}>
            New listings that matched your searches since yesterday.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestEmail;
