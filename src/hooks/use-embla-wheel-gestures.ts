import type useEmblaCarousel from "embla-carousel-react";
import { useEffect } from "react";

type EmblaApi = ReturnType<typeof useEmblaCarousel>[1];

/** Horizontal travel from a wheel event: trackpad deltaX, or a vertical
 * wheel held with shift. 0 for a plain vertical gesture (left to the page). */
function horizontalDelta(e: WheelEvent): number {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    return e.deltaX;
  }
  return e.shiftKey ? e.deltaY : 0;
}

/**
 * Let a two-finger horizontal trackpad swipe (or shift+wheel) drive an
 * Embla carousel. Embla is transform-based and ignores native wheel events,
 * so on a MacBook you otherwise can't scroll a gallery without dragging or
 * hitting the arrows. This bridges the gap.
 *
 * Only horizontally-dominant gestures are consumed — a vertical scroll over
 * the gallery still scrolls the page. A short cooldown after each step keeps
 * one flick (and its momentum tail) from skipping several photos at once.
 *
 * Shared by the photo carousels on the review and listing-detail screens.
 */
export function useEmblaWheelGestures(emblaApi: EmblaApi): void {
  useEffect(() => {
    if (!emblaApi) {
      return;
    }
    const node = emblaApi.rootNode();
    if (!node) {
      return;
    }

    // px of horizontal travel per slide step, and the lock after a step.
    const THRESHOLD = 40;
    const COOLDOWN_MS = 350;
    // After this long with no wheel events the gesture is considered over.
    const IDLE_MS = 120;

    let accumulated = 0;
    let locked = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let cooldownTimer: ReturnType<typeof setTimeout> | undefined;

    const step = (delta: number) => {
      if (delta > 0) {
        emblaApi.scrollNext();
      } else {
        emblaApi.scrollPrev();
      }
      accumulated = 0;
      locked = true;
      cooldownTimer = setTimeout(() => {
        locked = false;
      }, COOLDOWN_MS);
    };

    const onWheel = (e: WheelEvent) => {
      const horizontal = horizontalDelta(e);
      if (horizontal === 0) {
        return; // vertical gesture — let the page scroll
      }
      e.preventDefault();

      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        accumulated = 0;
      }, IDLE_MS);

      if (locked) {
        return;
      }
      accumulated += horizontal;
      if (Math.abs(accumulated) >= THRESHOLD) {
        step(accumulated);
      }
    };

    // Non-passive so preventDefault can stop the page from rubber-banding.
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
      clearTimeout(idleTimer);
      clearTimeout(cooldownTimer);
    };
  }, [emblaApi]);
}
