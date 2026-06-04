/**
 * Photo gallery for the mobile listing-detail screen.
 *
 * Layout (Paper mobile 2T3-0 "gallery"): a 280px hero photo with a
 * "View all N photos" pill bottom-right (navy/82% scrim, white text),
 * plus a four-up thumbnail strip below (h64, radius 10, gap 6). The
 * last visible thumbnail gets a "+N" overlay when there are more photos
 * than thumbnail slots.
 *
 * Photos come from `listing_photos` — the route resolves each URL via
 * `resolvePhotoUrl` so the gallery is a thin presentational component.
 */
import { sizedPhoto } from "../../lib/photo-size";
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
      <div className="px-4">
        <div className="flex h-[280px] w-full items-center justify-center rounded-2xl bg-[#dfe6ea]">
          <p className="text-muted-foreground text-sm">No photos yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-4">
      <div className="relative h-[280px] w-full overflow-hidden rounded-2xl bg-[#dfe6ea]">
        {/* biome-ignore lint/nursery/noImgElement: TanStack Start; <Image> isn't available. */}
        <img
          alt={alt}
          className="h-full w-full object-cover"
          src={sizedPhoto(hero.url, 640)}
        />
        <span className="absolute right-3.5 bottom-3.5 rounded-full bg-[rgba(15,42,63,0.82)] px-3 py-[7px] font-semibold text-[11px] text-white leading-[14px]">
          View all {photos.length} photo{photos.length === 1 ? "" : "s"}
        </span>
      </div>

      {thumbnails.length > 0 ? (
        <div className="flex gap-1.5 overflow-hidden">
          {thumbnails.map((p, idx) => {
            const isLast = idx === thumbnails.length - 1;
            return (
              <div
                className="relative h-16 grow basis-0 overflow-hidden rounded-[10px] bg-[#dfe6ea]"
                key={`${p.position}:${p.url}`}
              >
                {/* biome-ignore lint/nursery/noImgElement: same reasoning. */}
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  src={sizedPhoto(p.url, 96)}
                />
                {isLast && overflow > 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#c4ced5]/85">
                    <span className="font-semibold text-[15px] text-foreground">
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
