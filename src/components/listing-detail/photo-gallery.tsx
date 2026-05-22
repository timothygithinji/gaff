/**
 * Photo gallery for the listing-detail screen.
 *
 * Layout: a full-bleed hero photo with a "View all N photos" pill at
 * the bottom-right, plus a horizontal thumbnail strip below. The fourth
 * (and last visible) thumbnail gets an "+N" overlay when there are
 * more photos than thumbnail slots.
 *
 * Photos come from `listing_photos` — the route resolves the URL via
 * `r2Key ?? url` so the gallery itself is a thin presentational
 * component that doesn't care about R2 vs. portal sources.
 */
import type { ListingDetailPhoto } from "../../server/functions/listing-detail";

type Props = {
  photos: ListingDetailPhoto[];
  alt: string;
};

const THUMB_COUNT = 4;

export function PhotoGallery({ photos, alt }: Props) {
  const hero = photos[0];
  const thumbnails = photos.slice(1, 1 + THUMB_COUNT);
  const overflow = Math.max(photos.length - (1 + THUMB_COUNT), 0);

  if (!hero) {
    return (
      <div className="px-4 pt-2">
        <div className="flex h-70 w-full items-center justify-center rounded-[14px] bg-muted">
          <p className="text-muted-foreground text-sm">No photos yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 pt-2">
      <div className="relative h-70 w-full overflow-hidden rounded-[14px] bg-muted">
        {/* biome-ignore lint/nursery/noImgElement: TanStack Start; <Image> isn't available. */}
        <img alt={alt} className="h-full w-full object-cover" src={hero.url} />
        <button
          className="absolute right-3 bottom-3 rounded-[999px] bg-[#FDFAF4EB] px-3 py-1.5 font-semibold text-[#1C1A17] text-[11px] backdrop-blur"
          type="button"
        >
          View all {photos.length} photo{photos.length === 1 ? "" : "s"}
        </button>
      </div>

      {thumbnails.length > 0 ? (
        <div className="flex gap-1.5 overflow-hidden">
          {thumbnails.map((p, idx) => {
            const isLast = idx === thumbnails.length - 1;
            return (
              <div
                className="relative h-16 grow basis-0 overflow-hidden rounded-md bg-muted"
                key={`${p.position}:${p.url}`}
              >
                {/* biome-ignore lint/nursery/noImgElement: same reasoning. */}
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  src={p.url}
                />
                {isLast && overflow > 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-foreground/55">
                    <span className="font-medium font-serif text-[15px] text-primary-foreground">
                      +{overflow}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
