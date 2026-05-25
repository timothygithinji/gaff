import type useEmblaCarousel from "embla-carousel-react";
import { useEffect, useState } from "react";

type EmblaApi = ReturnType<typeof useEmblaCarousel>[1];

/**
 * Track an Embla carousel's selected slide index as React state. Mirrors
 * Embla's `select`/`reInit` events and seeds from `startIndex` until the
 * api is ready. Shared by the photo carousels on the review and
 * listing-detail screens.
 */
export function useEmblaSelectedIndex(emblaApi: EmblaApi, startIndex = 0) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }
    const sync = () => setIndex(emblaApi.selectedScrollSnap());
    sync();
    emblaApi.on("select", sync);
    emblaApi.on("reInit", sync);
    return () => {
      emblaApi.off("select", sync);
      emblaApi.off("reInit", sync);
    };
  }, [emblaApi]);

  return index;
}
