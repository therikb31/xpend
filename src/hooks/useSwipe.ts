// Month-swipe gesture — port of the legacy .swipe-mk pointer handlers.
// Left = previous month, right = next month; a real swipe suppresses the tap.

import { useRef } from "react";
import type { PointerEvent as RPointerEvent } from "react";

export function useSwipe(onPrev: () => void, onNext: () => void) {
  const st = useRef<{ el: HTMLElement; x: number; y: number; t: number } | null>(null);
  const swipedAt = useRef(0);

  const handlers = {
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      st.current = { el: e.currentTarget, x: e.clientX, y: e.clientY, t: Date.now() };
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      const s = st.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > Math.abs(dy) * 1.4 && Math.abs(dx) > 6) {
        const c = Math.max(-70, Math.min(70, dx));
        s.el.style.transition = "none";
        s.el.style.transform = "translateX(" + c.toFixed(1) + "px)";
      }
    },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => {
      const s = st.current;
      st.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      s.el.style.transform = "";
      s.el.style.transition = "";
      if (Math.abs(dx) > 44 && Date.now() - s.t < 600) {
        swipedAt.current = Date.now();
        if (dx < 0) onPrev();
        else onNext();
      }
    },
    onPointerCancel: () => {
      const s = st.current;
      st.current = null;
      if (s) {
        s.el.style.transform = "";
        s.el.style.transition = "";
      }
    },
  };

  /** True shortly after a swipe — callers skip their tap action then. */
  const tapped = () => Date.now() - swipedAt.current < 250;

  return { handlers, tapped };
}
