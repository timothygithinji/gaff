/**
 * Fullscreen photo gallery — opened from a hero image, thumbnail or "View
 * all" tag, starting on whichever photo was tapped. Embla carousel inside a
 * dialog; ←/→ navigate, swipe on touch, Esc closes (base-ui Dialog handles
 * it). Shared by the desktop and mobile listing-detail galleries.
 */
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import useEmblaCarousel from "embla-carousel-react";
import { useEffect } from "react";
import { useEmblaSelectedIndex } from "../../hooks/use-embla-selected-index";
import { useEmblaWheelGestures } from "../../hooks/use-embla-wheel-gestures";
import type { ListingDetailPhoto } from "../../server/functions/listing-detail";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";

export function GalleryLightbox({
  open,
  onOpenChange,
  photos,
  startIndex,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: ListingDetailPhoto[];
  startIndex: number;
}) {
  const photoCount = photos.length;
  const canPaginate = photoCount > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    duration: 28,
    startIndex,
    watchDrag: canPaginate,
  });
  const index = useEmblaSelectedIndex(emblaApi, startIndex);
  useEmblaWheelGestures(emblaApi);

  // Re-sync to the clicked photo each time the lightbox opens.
  useEffect(() => {
    if (open && emblaApi) {
      emblaApi.scrollTo(startIndex, true);
    }
  }, [open, emblaApi, startIndex]);

  // ←/→ navigate while open (base-ui's Dialog already closes on Esc).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        emblaApi?.scrollPrev();
      } else if (e.key === "ArrowRight") {
        emblaApi?.scrollNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, emblaApi]);

  if (photoCount === 0) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="grid h-[95vh] w-[95vw] max-w-none place-items-stretch gap-0 overflow-hidden border-0 bg-black/95 p-0 ring-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Listing photos</DialogTitle>
        <div className="relative flex h-full w-full items-center justify-center">
          <div className="h-full w-full overflow-hidden" ref={emblaRef}>
            <div className="flex h-full touch-pan-y">
              {photos.map((p, i) => (
                <div
                  className="relative flex h-full min-w-0 flex-[0_0_100%] items-center justify-center"
                  key={p.url || `lb-${i}`}
                >
                  {/* biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component. */}
                  <img
                    alt={`Listing view ${i + 1}`}
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                    src={p.url}
                  />
                </div>
              ))}
            </div>
          </div>
          {canPaginate ? (
            <>
              <button
                aria-label="Previous photo"
                className="-translate-y-1/2 absolute top-1/2 left-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                onClick={() => emblaApi?.scrollPrev()}
                type="button"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
              </button>
              <button
                aria-label="Next photo"
                className="-translate-y-1/2 absolute top-1/2 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                onClick={() => emblaApi?.scrollNext()}
                type="button"
              >
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={20}
                  strokeWidth={2}
                />
              </button>
            </>
          ) : null}
          <span className="-translate-x-1/2 pointer-events-none absolute top-4 left-1/2 rounded-full bg-white/10 px-3 py-1.5 font-medium text-white text-xs backdrop-blur">
            {index + 1} / {photoCount}
          </span>
          <DialogClose
            aria-label="Close"
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
