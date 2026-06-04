/**
 * Photo gallery for the mobile listing-detail screen.
 *
 * Layout (Paper mobile 2T3-0 "gallery"): a 280px hero — now a swipeable
 * Embla carousel with an "n / N" counter and a "View all N photos" pill —
 * plus a four-up thumbnail strip below (h64, radius 10, gap 6). The last
 * visible thumbnail gets a "+N" overlay when there are more photos than
 * slots. Tapping the hero, a thumbnail, or the pill opens the shared
 * fullscreen {@link GalleryLightbox} at that photo.
 *
 * Photos come from `listing_photos` — the route resolves each URL via
 * `resolvePhotoUrl` so the gallery stays presentational.
 */
import useEmblaCarousel from "embla-carousel-react";
import { useState } from "react";
import { useEmblaSelectedIndex } from "../../hooks/use-embla-selected-index";
import { sizedPhoto } from "../../lib/photo-size";
import type { ListingDetailPhoto } from "../../server/functions/listing-detail";
import { GalleryLightbox } from "./gallery-lightbox";

type Props = {
  photos: ListingDetailPhoto[];
  alt: string;
};

const THUMB_COUNT = 4;

export function PhotoGallery({ photos, alt }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxStart, setLightboxStart] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    watchDrag: photos.length > 1,
  });
  const index = useEmblaSelectedIndex(emblaApi);

  const openAt = (i: number) => {
    setLightboxStart(i);
    setLightboxOpen(true);
  };

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
        <div className="h-full overflow-hidden" ref={emblaRef}>
          <div className="flex h-full">
            {photos.map((p, i) => (
              <button
                aria-label={`View photo ${i + 1}`}
                className="relative h-full w-full flex-[0_0_100%]"
                key={`${p.position}:${p.url}`}
                onClick={() => openAt(i)}
                type="button"
              >
                {/* biome-ignore lint/nursery/noImgElement: TanStack Start; <Image> isn't available. */}
                <img
                  alt={alt}
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                  src={sizedPhoto(p.url, 720)}
                />
              </button>
            ))}
          </div>
        </div>
        {photos.length > 1 ? (
          <span className='pointer-events-none absolute bottom-3.5 left-3.5 rounded-full bg-[rgba(15,42,63,0.82)] px-2.5 py-1 font-medium text-[11px] text-white tabular-nums leading-[14px]'>
            {index + 1} / {photos.length}
          </span>
        ) : null}
        <button
          className="absolute right-3.5 bottom-3.5 rounded-full bg-[rgba(15,42,63,0.82)] px-3 py-[7px] font-semibold text-[11px] text-white leading-[14px]"
          onClick={() => openAt(index)}
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
              <button
                className="relative h-16 grow basis-0 overflow-hidden rounded-[10px] bg-[#dfe6ea]"
                key={`${p.position}:${p.url}`}
                onClick={() => openAt(1 + idx)}
                type="button"
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
              </button>
            );
          })}
        </div>
      ) : null}

      <GalleryLightbox
        onOpenChange={setLightboxOpen}
        open={lightboxOpen}
        photos={photos}
        startIndex={lightboxStart}
      />
    </div>
  );
}
