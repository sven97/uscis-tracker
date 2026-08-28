import { useEffect, useRef, useState } from "react";

type Opts = { threshold?: number; max?: number; resistance?: number };

/**
 * Touch pull-to-refresh for the whole page. iOS standalone web apps have no
 * native pull-to-refresh, so we roll our own: while the page is scrolled to the
 * top, a downward drag is captured, rubber-banded, and — past `threshold` —
 * fires `onRefresh`.
 *
 * Returns the live pull distance (px) and whether a refresh is running, for a
 * caller-rendered indicator.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, opts: Opts = {}) {
  const { threshold = 72, max = 110, resistance = 2.5 } = opts;
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const st = useRef({ startX: 0, startY: 0, tracking: false, dist: 0, busy: false });

  useEffect(() => {
    const scroller = () => document.scrollingElement || document.documentElement;
    const atTop = () => scroller().scrollTop <= 0;
    const modalOpen = () =>
      !!document.querySelector(
        '[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[role="dialog"]',
      );

    const reset = () => {
      st.current.tracking = false;
      st.current.dist = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      if (st.current.busy || e.touches.length !== 1 || !atTop() || modalOpen()) return;
      st.current.startX = e.touches[0].clientX;
      st.current.startY = e.touches[0].clientY;
      st.current.tracking = true;
      st.current.dist = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!st.current.tracking) return;
      const dx = e.touches[0].clientX - st.current.startX;
      const dy = e.touches[0].clientY - st.current.startY;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !atTop()) {
        reset();
        return;
      }
      e.preventDefault(); // own the gesture: no page scroll / rubber-band
      const d = Math.min(dy / resistance, max);
      st.current.dist = d;
      setPull(d);
    };

    const onEnd = async () => {
      if (!st.current.tracking) return;
      st.current.tracking = false;
      if (st.current.dist < threshold) {
        st.current.dist = 0;
        setPull(0);
        return;
      }
      st.current.busy = true;
      setRefreshing(true);
      setPull(threshold);
      try {
        await cb.current();
      } finally {
        st.current.busy = false;
        st.current.dist = 0;
        setRefreshing(false);
        setPull(0);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [threshold, max, resistance]);

  return { pull, refreshing, threshold };
}
