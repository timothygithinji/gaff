/**
 * Desktop Listing detail — two-column workspace shown above the `md`
 * breakpoint. Mirrors the `Desktop · Listing detail` artboard:
 *
 *   - TOP    : back arrow, breadcrumb (Review / search / listing), and
 *              Save PDF / Share / Open on portal actions.
 *   - LEFT   : hero photo (with cluster + photo counter overlays), 5-up
 *              photo strip, floor-plan card with room annotations, and a
 *              location card with mini-map + commute pills.
 *   - RIGHT  : price + portals cluster card, AI "small print" signals,
 *              public records grid, sticky decision bar pinned at the
 *              bottom.
 *
 * Renders nothing below `md` so the existing mobile shell stays
 * untouched on small viewports.
 */
import {
  AiMagicIcon,
  Alert01Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Download01Icon,
  FavouriteIcon,
  LinkSquare01Icon,
  Share05Icon,
  StarIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type {
  ListingDetailPayload,
  ListingDetailPortalRow,
  ListingDetailPublicRecords,
  ListingDetailSmallPrintItem,
} from "../../server/functions/listing-detail";
import { AdminSidebar } from "../layout/admin-sidebar";

type Outcome = "keep" | "skip" | "shortlist";

type Props = {
  data: ListingDetailPayload;
  disabled?: boolean;
  onKeep: () => void;
  onSkip: () => void;
  onShortlist: () => void;
};

export function DesktopListingDetail({
  data,
  disabled,
  onKeep,
  onSkip,
  onShortlist,
}: Props) {
  return (
    <div className="hidden min-h-screen bg-ground md:flex">
      <AdminSidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar headline={data.headline} mySwipe={data.mySwipe} />
        <div className="flex min-w-0 flex-1 gap-6 px-10 pt-6 pb-8">
          <MediaColumn data={data} />
          <InfoColumn
            data={data}
            disabled={disabled}
            onKeep={onKeep}
            onShortlist={onShortlist}
            onSkip={onSkip}
          />
        </div>
      </main>
    </div>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar({
  headline,
  mySwipe,
}: {
  headline: ListingDetailPayload["headline"];
  mySwipe?: Outcome;
}) {
  const navigate = useNavigate();
  const title = shortAddressTitle(headline.addressRaw);
  return (
    <header className="flex items-center justify-between border-bone border-b px-10 py-5">
      <div className="flex items-center gap-3.5">
        <button
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            } else {
              navigate({ to: "/" });
            }
          }}
          type="button"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        </button>
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-2 text-xs"
        >
          <Link className="text-muted-foreground" to="/">
            Review
          </Link>
          <span className="text-[#B5A893]">/</span>
          <span className="text-muted-foreground">
            {portalLabel(headline.portal)}
          </span>
          <span className="text-[#B5A893]">/</span>
          <span className="font-semibold text-foreground">{title}</span>
        </nav>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-foreground text-xs"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.print();
            }
          }}
          type="button"
        >
          <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.6} />
          <span className="font-medium">Save PDF</span>
        </button>
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-foreground text-xs"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.share) {
              navigator
                .share({ title: headline.addressRaw, url: headline.url })
                .catch(() => {
                  // user cancelled
                });
            }
          }}
          type="button"
        >
          <HugeiconsIcon icon={Share05Icon} size={14} strokeWidth={1.6} />
          <span className="font-medium">Share with household</span>
        </button>
        <a
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-bone text-xs"
          href={headline.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <HugeiconsIcon icon={LinkSquare01Icon} size={14} strokeWidth={1.6} />
          <span className="font-semibold">
            Open on {portalLabel(headline.portal)}
          </span>
        </a>
        {mySwipe === "shortlist" ? (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-bone px-2 py-1 font-semibold text-[10px] text-primary uppercase tracking-wider">
            Starred
          </span>
        ) : null}
      </div>
    </header>
  );
}

/* ---------------- Media column ---------------- */

function MediaColumn({ data }: { data: ListingDetailPayload }) {
  const {
    photos,
    headline,
    portalSpread,
    features,
    floorplan,
    commuteMinutes,
  } = data;
  const heroPhoto = photos[0]?.url;
  const stripPhotos = photos.slice(1, 5);
  const alsoOn =
    portalSpread.length > 1
      ? `${portalSpread.length} portals · same property`
      : "Single listing";
  const photoCount = Math.max(photos.length, 1);

  return (
    <section className="flex w-[720px] shrink-0 flex-col gap-3.5">
      <HeroPhoto
        alsoOn={alsoOn}
        alt={headline.addressRaw}
        photo={heroPhoto}
        photoCount={photoCount}
      />
      {stripPhotos.length > 0 ? (
        <PhotoStrip photos={stripPhotos} remaining={photos.length - 5} />
      ) : null}
      <FloorplanCard features={features} floorplanUrl={floorplan?.url} />
      <LocationCard
        commuteMinutes={commuteMinutes}
        postcode={headline.postcode ?? data.cluster.postcode}
      />
    </section>
  );
}

function HeroPhoto({
  photo,
  photoCount,
  alsoOn,
  alt,
}: {
  photo: string | undefined;
  photoCount: number;
  alsoOn: string;
  alt: string;
}) {
  return (
    <div className="relative h-[400px] w-full overflow-hidden rounded-2xl bg-muted">
      {photo ? (
        // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available.
        <img
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          src={photo}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
          No photo yet
        </div>
      )}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent"
      />
      <span className="absolute top-5 left-5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E2B584]" />
        <span className="font-semibold text-[10px] text-white uppercase tracking-wider">
          {alsoOn}
        </span>
      </span>
      <span className="absolute top-5 right-5 rounded-full bg-black/70 px-3 py-1.5 font-semibold text-[11px] text-white">
        1 / {photoCount}
      </span>
      <span className="absolute right-5 bottom-5 inline-flex items-center gap-1.5 rounded-full bg-foreground/85 px-3.5 py-2 font-semibold text-[12px] text-white">
        View all {photoCount} photos
      </span>
    </div>
  );
}

function PhotoStrip({
  photos,
  remaining,
}: {
  photos: ListingDetailPayload["photos"];
  remaining: number;
}) {
  return (
    <div className="flex gap-2.5">
      {photos.map((p, i) => (
        <div
          className="relative h-[90px] flex-1 overflow-hidden rounded-xl bg-muted"
          key={p.url || `strip-${i}`}
        >
          {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={p.url}
          />
          {i === photos.length - 1 && remaining > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-foreground/55 font-serif text-[18px] text-white">
              +{remaining}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FloorplanCard({
  features,
  floorplanUrl,
}: {
  features?: ListingDetailPayload["features"];
  floorplanUrl?: string;
}) {
  const giaSqm = features?.floorplan?.giaSqm;
  const listedSqft = giaSqm ? Math.round((giaSqm * 10.7639) / 10) * 10 : null;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-end justify-between px-6 pt-5 pb-3.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              className="text-primary"
              icon={AiMagicIcon}
              size={12}
              strokeWidth={2}
            />
            <Eyebrow tone="primary">Floor plan read · Claude</Eyebrow>
          </div>
          <h2 className="font-serif text-[22px] text-foreground">
            What we see
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {giaSqm ? (
            <span className="inline-flex items-center rounded-full bg-bone px-2.5 py-1.5 font-semibold text-[11px] text-primary">
              {Math.round(giaSqm)} m² GIA
            </span>
          ) : null}
          {listedSqft ? (
            <span className="inline-flex items-center rounded-full bg-[#FBEDDC] px-2.5 py-1.5 font-semibold text-[#B26B3F] text-[11px]">
              vs {listedSqft} sqft listed
            </span>
          ) : null}
        </div>
      </header>
      <div className="mx-6 mb-6 flex h-[280px] items-center justify-center overflow-hidden rounded-xl border border-bone bg-[#FBF6EA]">
        {floorplanUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available.
          <img
            alt="Floor plan"
            className="max-h-full max-w-full object-contain"
            src={floorplanUrl}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            No floor plan attached to this listing.
          </p>
        )}
      </div>
    </article>
  );
}

function LocationCard({
  postcode,
  commuteMinutes,
}: {
  postcode: string | null;
  commuteMinutes?: Record<string, number>;
}) {
  const firstTarget = commuteMinutes
    ? Object.entries(commuteMinutes)[0]
    : undefined;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-end justify-between px-6 pt-5 pb-3.5">
        <div className="flex flex-col gap-1">
          <Eyebrow>Where it sits</Eyebrow>
          <h2 className="font-serif text-[22px] text-foreground">
            {postcode ? `London ${postcode.toUpperCase()}` : "Where it sits"}
          </h2>
        </div>
        {firstTarget ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-bone px-3 py-1.5">
            <span className="font-semibold text-[11px] text-primary">
              {firstTarget[0]}
            </span>
            <span className="font-semibold text-[11px] text-foreground">
              {firstTarget[1]} min
            </span>
          </span>
        ) : null}
      </header>
      <div className="mx-6 mb-6 flex h-[220px] items-center justify-center overflow-hidden rounded-xl border border-bone bg-[#F3EBDC]">
        <p className="text-muted-foreground text-sm">
          Map renders here · see the embedded Google Maps view in the mobile
          equivalent.
        </p>
      </div>
    </article>
  );
}

/* ---------------- Info column ---------------- */

function InfoColumn({
  data,
  disabled,
  onKeep,
  onSkip,
  onShortlist,
}: {
  data: ListingDetailPayload;
  disabled?: boolean;
  onKeep: () => void;
  onSkip: () => void;
  onShortlist: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3.5">
      <PriceCard data={data} />
      <AiCard items={data.smallPrint} />
      <RecordsCard epc={data.epc} publicRecords={data.publicRecords} />
      <DecisionBar
        disabled={disabled}
        mySwipe={data.mySwipe}
        onKeep={onKeep}
        onShortlist={onShortlist}
        onSkip={onSkip}
        partnerNames={data.partnerSwipes
          .filter((s) => s.outcome === null)
          .map((s) => s.name)}
      />
    </section>
  );
}

function PriceCard({ data }: { data: ListingDetailPayload }) {
  const { headline, portalSpread, cluster } = data;
  const title = shortAddressTitle(headline.addressRaw);
  const subtitle = subtitleFor(headline.postcode, cluster.postcode);
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[38px] text-foreground leading-none tracking-tight">
              {formatPrice(headline.priceMonthly)}
            </span>
            <span className="text-[13px] text-muted-foreground">/mo</span>
          </div>
          <Eyebrow>
            {listedAgoLabel(headline.firstSeenAt)} · {portalSpread.length}{" "}
            portal{portalSpread.length === 1 ? "" : "s"} tracking
          </Eyebrow>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-bone px-2.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5D7A4A]" />
          <span className="font-semibold text-[#5D7A4A] text-[11px]">
            {portalSpread.length > 1 ? "Same property" : "Tracking"}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-serif text-[22px] text-foreground">{title}</h1>
        {subtitle ? (
          <p className="text-[13px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-col border-bone border-t pt-3.5">
        {portalSpread.map((row, i) => (
          <PortalRow
            isLast={i === portalSpread.length - 1}
            key={`${row.portal}-${row.url}`}
            row={row}
          />
        ))}
      </div>
    </article>
  );
}

function PortalRow({
  row,
  isLast,
}: {
  row: ListingDetailPortalRow;
  isLast: boolean;
}) {
  const delta = row.deltaFromHeadline ?? 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5",
        !isLast && "border-[#F2EBDE] border-b"
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bone font-semibold font-serif text-[13px] text-primary">
        {portalLabel(row.portal).charAt(0)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[13px] text-foreground">
          {portalLabel(row.portal)}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {row.agentName ?? "Direct from landlord"}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-medium font-serif text-[15px] text-foreground">
          {formatPrice(row.priceMonthly)}
        </span>
        {delta > 0 ? (
          <span className="font-semibold text-[#B26B3F] text-[10px]">
            +{formatPrice(delta).replace("£", "£")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AiCard({ items }: { items: ListingDetailSmallPrintItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            className="text-primary"
            icon={AiMagicIcon}
            size={12}
            strokeWidth={2}
          />
          <Eyebrow tone="primary">Description read · Haiku</Eyebrow>
        </div>
        <h2 className="font-serif text-[20px] text-foreground">
          What's in the small print
        </h2>
      </header>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <SmallPrintRow item={item} key={item.label} />
        ))}
      </ul>
    </article>
  );
}

function SmallPrintRow({ item }: { item: ListingDetailSmallPrintItem }) {
  const positive = item.severity === "ok";
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
          positive ? "bg-[#E3EBD7]" : "bg-[#FBEDDC]"
        )}
      >
        <HugeiconsIcon
          className={positive ? "text-[#5D7A4A]" : "text-[#B26B3F]"}
          icon={positive ? Tick01Icon : Alert01Icon}
          size={10}
          strokeWidth={2.2}
        />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-[13px] text-foreground">
          {item.label}
        </p>
        {item.note ? (
          <p className="text-[12px] text-muted-foreground leading-4">
            {item.note}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function RecordsCard({
  epc,
  publicRecords,
}: {
  epc?: ListingDetailPayload["epc"];
  publicRecords?: ListingDetailPublicRecords;
}) {
  const rows = buildRecordRows(epc, publicRecords);
  if (rows.length === 0) {
    return null;
  }
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
      <header className="flex flex-col gap-1">
        <Eyebrow>The boring numbers</Eyebrow>
        <h2 className="font-serif text-[20px] text-foreground">
          Public records
        </h2>
      </header>
      <ul className="flex flex-col">
        {rows.map((row, i) => (
          <li
            className={cn(
              "flex items-center justify-between py-3",
              i < rows.length - 1 && "border-[#F2EBDE] border-b"
            )}
            key={row.label}
          >
            <span className="text-[13px] text-foreground">{row.label}</span>
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-medium font-serif text-[16px] text-foreground">
                {row.value}
              </span>
              {row.meta ? (
                <span className="text-[10px] text-muted-foreground">
                  {row.meta}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function DecisionBar({
  disabled,
  mySwipe,
  onKeep,
  onSkip,
  onShortlist,
  partnerNames,
}: {
  disabled?: boolean;
  mySwipe?: Outcome;
  onKeep: () => void;
  onSkip: () => void;
  onShortlist: () => void;
  partnerNames: string[];
}) {
  const headline = decisionHeadline(mySwipe, partnerNames);
  return (
    <article className="flex items-center gap-2.5 rounded-2xl bg-foreground px-5 py-4">
      <button
        aria-label="Keep"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-bone"
        disabled={disabled}
        onClick={onKeep}
        type="button"
      >
        <HugeiconsIcon icon={FavouriteIcon} size={16} strokeWidth={1.8} />
      </button>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[13px] text-bone">{headline}</span>
        <span className="text-[11px] text-white/55">
          {partnerNames.length > 0
            ? `${partnerNames.join(" & ")} hasn't seen this yet · expect a reply soon`
            : "Your call only — keep, skip, or star to revisit"}
        </span>
      </div>
      <button
        aria-label="Skip"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
        disabled={disabled}
        onClick={onSkip}
        type="button"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.6} />
      </button>
      <button
        aria-label="Star"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          mySwipe === "shortlist"
            ? "bg-bone text-primary"
            : "bg-white/10 text-white"
        )}
        disabled={disabled}
        onClick={onShortlist}
        type="button"
      >
        <HugeiconsIcon icon={StarIcon} size={16} strokeWidth={1.6} />
      </button>
    </article>
  );
}

/* ---------------- Atoms + helpers ---------------- */

function Eyebrow({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary";
}) {
  return (
    <span
      className={cn(
        "font-semibold text-[11px] uppercase tracking-[0.12em]",
        tone === "primary" ? "text-primary" : "text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function formatPrice(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `£${value.toLocaleString("en-GB")}`;
}

function listedAgoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return "Listed today";
  }
  if (days === 1) {
    return "Listed yesterday";
  }
  if (days < 7) {
    return `Listed ${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  return `Listed ${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function shortAddressTitle(addressRaw: string): string {
  const idx = addressRaw.indexOf(",");
  if (idx === -1) {
    return addressRaw;
  }
  return addressRaw.slice(0, idx).trim();
}

function portalLabel(portal: string): string {
  if (portal === "rightmove") {
    return "Rightmove";
  }
  if (portal === "zoopla") {
    return "Zoopla";
  }
  if (portal === "openrent") {
    return "OpenRent";
  }
  return portal;
}

function subtitleFor(
  headlinePostcode: string | null,
  clusterPostcode: string | null
): string {
  if (headlinePostcode) {
    return `London ${headlinePostcode.toUpperCase()}`;
  }
  if (clusterPostcode) {
    return `London ${clusterPostcode.toUpperCase()}`;
  }
  return "";
}

type RecordRow = { label: string; value: string; meta?: string };

function buildRecordRows(
  epc: ListingDetailPayload["epc"],
  publicRecords?: ListingDetailPublicRecords
): RecordRow[] {
  const rows: RecordRow[] = [];
  const epcRow = epcRecordRow(epc);
  if (epcRow) {
    rows.push(epcRow);
  }
  if (publicRecords?.broadband) {
    rows.push({ label: "Broadband", value: publicRecords.broadband });
  }
  const crimeRow = crimeRecordRow(publicRecords?.crime);
  if (crimeRow) {
    rows.push(crimeRow);
  }
  if (publicRecords?.floodRisk) {
    rows.push({ label: "Flood risk", value: publicRecords.floodRisk });
  }
  const within = within500mRecordRow(publicRecords?.within500m);
  if (within) {
    rows.push(within);
  }
  return rows;
}

function epcRecordRow(epc: ListingDetailPayload["epc"]): RecordRow | null {
  if (!epc) {
    return null;
  }
  return {
    label: "EPC rating",
    value: epc.rating,
    meta: epc.potential ? `Potential ${epc.potential}` : undefined,
  };
}

function crimeRecordRow(
  crime: ListingDetailPublicRecords["crime"]
): RecordRow | null {
  if (!crime) {
    return null;
  }
  const meta = crime.incidents12mo
    ? `${crime.incidents12mo} incidents`
    : crime.area;
  return { label: "Crime · last 12mo", value: crime.rateLabel, meta };
}

function within500mRecordRow(
  w: ListingDetailPublicRecords["within500m"]
): RecordRow | null {
  if (!w) {
    return null;
  }
  const parts = [
    w.parks ? `${w.parks} park` : null,
    w.cafes ? `${w.cafes} cafés` : null,
    w.gp ? "GP" : null,
    w.pubs ? `${w.pubs} pubs` : null,
  ].filter((s): s is string => Boolean(s));
  if (parts.length === 0) {
    return null;
  }
  return { label: "Within 500m", value: parts.join(" · ") };
}

function decisionHeadline(
  mySwipe: Outcome | undefined,
  partnerNames: string[]
): string {
  if (mySwipe === "keep" && partnerNames.length > 0) {
    return `Kept · waiting on ${partnerNames.join(" & ")}`;
  }
  if (mySwipe === "shortlist") {
    return "Starred · plan a viewing";
  }
  if (mySwipe === "skip") {
    return "Skipped · still here if you change your mind";
  }
  return "Decide together";
}
