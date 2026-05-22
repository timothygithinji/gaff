/**
 * "What we see" — the AI floorplan analysis section.
 *
 * Renders an annotated diagram showing each room from
 * `enrichments.features.floorplan.rooms`, with the GIA pinned bottom-
 * right when present. When no floorplan data exists yet, falls back to
 * a "Floor plan not available" placeholder; when the portal exposed a
 * floorplan image URL, we render it underneath so the user can still
 * eyeball the real plan.
 *
 * The "Open plan ▾" dropdown is visual-only for v1 — the layout label
 * comes from `features.floorplan.layout`, but tapping it is a no-op.
 */
import type { Features } from "../../lib/ai/prompt";

type Props = {
  features?: Features;
  floorplan?: { url: string };
};

const ROOM_SLOTS: Array<{
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Match priority for assigning a room to this slot. */
  match: RegExp;
  fallback: string;
}> = [
  {
    position: "top-left",
    match: /kitchen/i,
    fallback: "Kitchen",
  },
  {
    position: "top-right",
    match: /^bed\s*1|^bedroom\s*1|primary|master/i,
    fallback: "Bed 1",
  },
  {
    position: "bottom-right",
    match: /^bed\s*2|^bedroom\s*2|second/i,
    fallback: "Bed 2",
  },
  {
    position: "bottom-left",
    match: /living|lounge|reception/i,
    fallback: "Living",
  },
];

const POSITION_CLASS: Record<(typeof ROOM_SLOTS)[number]["position"], string> =
  {
    "top-left": "top-3 left-3",
    "top-right": "top-3 right-3",
    "bottom-left": "bottom-3 left-3",
    "bottom-right": "bottom-22 right-3",
  };

function formatLayout(layout: Features["floorplan"]["layout"]): string {
  if (layout === "open_plan") {
    return "Open plan";
  }
  if (layout === "separate") {
    return "Separate";
  }
  if (layout === "mixed") {
    return "Mixed";
  }
  return "Layout pending";
}

function formatSqm(sqm: number | null): string | null {
  if (sqm === null) {
    return null;
  }
  return `${sqm.toFixed(1)} m²`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: room-to-slot assignment + optional-rendering branches; splitting the helpers into separate components would just hop the same logic across files.
export function FloorplanAnalysis({ features, floorplan }: Props) {
  const fp = features?.floorplan;
  const rooms = fp?.rooms ?? [];

  // Assign rooms to slots in priority order; rooms not matched fall
  // through to remaining slots in declaration order.
  const slotRooms = new Map<
    (typeof ROOM_SLOTS)[number]["position"],
    { label: string; sqm: number | null; notes: string | null }
  >();
  const used = new Set<number>();

  for (const slot of ROOM_SLOTS) {
    const matchIdx = rooms.findIndex(
      (r, i) => !used.has(i) && slot.match.test(r.name)
    );
    if (matchIdx >= 0) {
      const r = rooms[matchIdx];
      used.add(matchIdx);
      slotRooms.set(slot.position, {
        label: r?.name ?? slot.fallback,
        sqm: r?.sqm ?? null,
        notes: r?.notes ?? null,
      });
    }
  }

  // Fill leftover slots with any remaining rooms (best-effort).
  for (const slot of ROOM_SLOTS) {
    if (slotRooms.has(slot.position)) {
      continue;
    }
    const nextIdx = rooms.findIndex((_r, i) => !used.has(i));
    if (nextIdx >= 0) {
      const r = rooms[nextIdx];
      if (r) {
        used.add(nextIdx);
        slotRooms.set(slot.position, {
          label: r.name,
          sqm: r.sqm,
          notes: r.notes,
        });
      }
    }
  }

  const giaLabel = fp?.giaSqm ? `${fp.giaSqm.toFixed(0)} m²` : null;

  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="text-[11px] text-copper">
              ✦
            </span>
            <span className="font-semibold text-[10px] text-copper uppercase tracking-[0.12em]">
              Floor plan read · Claude
            </span>
          </div>
          <h2 className="font-medium font-serif text-[22px] text-ink leading-[130%] tracking-[-0.02em]">
            What we see
          </h2>
        </div>
        <button
          className="flex items-center gap-1 rounded-[999px] border border-[#E5DDD0] bg-[#FDFAF4] px-2.5 py-1"
          type="button"
        >
          <span className="font-medium text-[11px] text-brass">
            {formatLayout(fp?.layout ?? null)}
          </span>
          <span aria-hidden className="text-[10px] text-brass">
            ▾
          </span>
        </button>
      </header>

      {rooms.length === 0 && !floorplan ? (
        <div className="flex h-70 w-full items-center justify-center rounded-[14px] border border-[#E5DDD0] bg-[#FDFAF4]">
          <p className="text-brass text-sm">Floor plan not available</p>
        </div>
      ) : (
        <div className="relative h-70 w-full overflow-hidden rounded-[14px] border border-[#E5DDD0] bg-[#FDFAF4]">
          {floorplan?.url ? (
            // biome-ignore lint/nursery/noImgElement: TanStack Start; <Image> isn't available.
            <img
              alt="Floorplan from the listing"
              className="absolute inset-0 h-full w-full object-contain opacity-90"
              src={floorplan.url}
            />
          ) : (
            <SchematicGrid />
          )}

          {ROOM_SLOTS.map((slot) => {
            const room = slotRooms.get(slot.position);
            if (!room) {
              return null;
            }
            const sqm = formatSqm(room.sqm);
            return (
              <div
                className={`absolute rounded-lg border border-[#E8D6C9] bg-[#FDFAF4F2] px-2 py-1.5 ${POSITION_CLASS[slot.position]}`}
                key={slot.position}
              >
                <p className="font-semibold text-[9px] text-copper uppercase tracking-[0.08em]">
                  {room.label}
                </p>
                <p className="mt-0.5 font-medium font-serif text-[13px] text-ink leading-[120%]">
                  {sqm ?? room.label}
                </p>
                {room.notes ? (
                  <p className="mt-0.5 font-medium text-[10px] text-brass leading-[120%]">
                    {room.notes}
                  </p>
                ) : null}
              </div>
            );
          })}

          {giaLabel ? (
            <div className="absolute right-3 bottom-3 rounded-lg bg-ink px-2 py-1.5">
              <p className="font-semibold text-[#E8D6C9] text-[9px] uppercase tracking-[0.08em]">
                GIA
              </p>
              <p className="mt-0.5 font-medium font-serif text-[14px] text-bone leading-[120%] tracking-[-0.01em]">
                {giaLabel}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * Background hatch — a faint dotted grid that reads as "schematic"
 * without needing a real floorplan. Rendered as an inline SVG so it
 * scales with the container.
 */
function SchematicGrid() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      role="img"
      viewBox="0 0 340 260"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Floorplan schematic background</title>
      <defs>
        <pattern
          height="20"
          id="floorplan-grid"
          patternUnits="userSpaceOnUse"
          width="20"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="#F0E8DC"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect fill="url(#floorplan-grid)" height="260" width="340" />
    </svg>
  );
}
