/**
 * "New places to review" digest. Sent when a household's scheduled scrape
 * completes (the full scrape→enrich chain has joined, so each row is rich:
 * price, beds, area, photo) and new reviewable listings have appeared since
 * the last digest. One email to every member; blind review is preserved (it
 * lists places to review, never a peer's verdict). Rendered by
 * `household-digest`.
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
const SLATE = "#1f3a5f"; // small-caps kicker (matches the app's REVIEW_EYEBROW)
const STEEL = "#5a7596"; // captions / tertiary
const LINE = "#c9d3dc"; // hairline borders
const SANS = "Inter, Helvetica, Arial, sans-serif";

/**
 * Small-screen polish. The table layout is already fluid (max-width + 100%
 * tables shrink to the viewport), so this only refines phones: full-width
 * shell, a touch more breathing room at the edges, a smaller headline, and a
 * tighter thumbnail so the text column keeps a sensible measure on a ~320px
 * screen. Apple Mail and the Gmail app honour `<style>` media queries;
 * desktop Outlook ignores them and just renders the fluid base — which is
 * fine, it's never the narrow case.
 */
const MOBILE_CSS = `
  @media only screen and (max-width: 600px) {
    .gaff-shell { width: 100% !important; max-width: 100% !important; }
    .gaff-h1 { font-size: 22px !important; line-height: 1.25 !important; }
    .gaff-thumb-col { width: 92px !important; }
    .gaff-thumb { width: 80px !important; height: 72px !important; }
  }
`;

export function DigestEmail({ count, items, reviewUrl }: DigestEmailProps) {
  const heading =
    count === 1
      ? "1 new place matched your search"
      : `${count} new places matched your search`;
  const overflow = count - items.length;
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/** biome-ignore lint/security/noDangerouslySetInnerHtml: media-query <style> is the only way to add responsive rules to an HTML email. */}
        <style dangerouslySetInnerHTML={{ __html: MOBILE_CSS }} />
      </Head>
      <Preview>{heading}</Preview>
      <Body
        style={{
          backgroundColor: GROUND,
          fontFamily: SANS,
          margin: 0,
          padding: "24px 12px",
        }}
      >
        <Container
          className="gaff-shell"
          style={{ maxWidth: "520px", margin: "0 auto" }}
        >
          <Section style={{ padding: "0 8px 16px" }}>
            <Text
              style={{
                color: SLATE,
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                margin: "0 0 6px",
              }}
            >
              New since your last digest
            </Text>
            <Heading
              className="gaff-h1"
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
                borderRadius: "6px",
                marginBottom: "10px",
                padding: "10px",
              }}
            >
              <Link
                href={item.listingUrl}
                style={{ textDecoration: "none", display: "block" }}
              >
                <Row>
                  {item.photoUrl ? (
                    <Column
                      className="gaff-thumb-col"
                      style={{ width: "108px", verticalAlign: "top" }}
                    >
                      <Img
                        alt={item.address}
                        className="gaff-thumb"
                        src={item.photoUrl}
                        style={{
                          width: "96px",
                          height: "84px",
                          maxWidth: "100%",
                          objectFit: "cover",
                          borderRadius: "4px",
                          display: "block",
                        }}
                      />
                    </Column>
                  ) : null}
                  <Column style={{ verticalAlign: "top", paddingTop: "1px" }}>
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
              + {overflow} more new — open Gaff to see them all.
            </Text>
          ) : null}

          <Section style={{ padding: "12px 8px 8px" }}>
            <Button
              href={reviewUrl}
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
              Review them in Gaff
            </Button>
          </Section>
          <Hr style={{ borderColor: LINE, margin: "8px 0" }} />
          <Text style={{ color: STEEL, fontSize: "12px", padding: "0 8px" }}>
            New listings that matched your searches since your last digest.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestEmail;
