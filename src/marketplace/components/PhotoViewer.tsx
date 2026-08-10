import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Fullscreen photo viewer for listing detail. Zoom lives here, never in the
 * inline gallery — tapping the hero opens this, the gallery itself stays
 * exactly as it was. Built from scratch on native touch/pointer/wheel
 * events rather than a gesture library: nothing already in this codebase
 * (ImageZoomModal, BundleImageZoom, admin's ImageZoomModal) supports more
 * than a single non-zoomable enlarged image, and layering a custom
 * swipe-to-change-photo gesture on top of a third-party pan/pinch library
 * risks the two fighting over the same pointer events — full manual control
 * here is what keeps the zoomed-out-vs-zoomed-in transition deliberate.
 *
 * THE CORE RULE, exactly as specified: zoomed out (scale === 1), a
 * horizontal drag changes photo. Zoomed in (scale > 1), a drag pans the
 * current photo and never changes photo. The two are told apart once,
 * right when a touch starts moving (whichever axis has the bigger delta
 * past a small deadzone), never re-decided mid-gesture. Panning at scale > 1
 * is bounds-clamped to the image's own edges (computed from its real
 * rendered size at the current scale vs. the viewport) — dragging past an
 * edge simply stops there, it can never fall through into a photo change.
 *
 * Zoom cap 2.5x: listing photos are stored at 1200x1200 (see
 * processListingImage); beyond roughly 2-2.5x that source starts showing
 * JPEG compression blocking rather than genuine extra detail, which risks a
 * buyer misreading compression artefacts as damage. 2.5x is the top of
 * that honest range, not a round number picked for its own sake.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 2.5;
const DOUBLE_TAP_SCALE = 2.2; // a deliberate inspection zoom, short of the hard cap
const SWIPE_PHOTO_THRESHOLD = 60; // px, horizontal, to commit to next/prev on release
const CLOSE_DRAG_THRESHOLD = 90; // px, vertical downward, to close on release
const DIRECTION_DEADZONE = 10; // px, before a drag commits to swipe vs. pan vs. close
const DOUBLE_TAP_WINDOW = 300; // ms

type Gesture = "none" | "pending" | "swipe-photo" | "pan" | "close-swipe" | "pinch";

interface Props {
  images: string[];
  initialIndex: number;
  title: string;
  onClose: () => void;
}

export default function PhotoViewer({ images, initialIndex, title, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(MIN_SCALE);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  // Live visual feedback for an in-progress swipe (photo change or close),
  // separate from translate (which is only ever the pan offset while
  // zoomed) so the two gestures never fight over the same number.
  const [dragPreview, setDragPreview] = useState({ x: 0, y: 0, opacity: 1 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const gesture = useRef<Gesture>("none");
  const start = useRef({ x: 0, y: 0 });
  const startTranslate = useRef({ x: 0, y: 0 });
  const pinchStart = useRef({ dist: 0, scale: 1 });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  // Mirrors `scale` state but updated synchronously, never stale — a fast
  // trackpad fires several wheel events per animation frame, faster than
  // React re-renders in between, so reading the `scale` closure value in
  // onWheel would only ever apply ONE 0.2 step per burst no matter how many
  // events actually fired (caught live: 12 dispatched wheel-in events only
  // moved the image from 1.0x to 1.2x). This ref is what onWheel reads
  // instead, so every single event genuinely accumulates.
  const scaleRef = useRef(MIN_SCALE);

  const image = images[index] ?? images[0];
  const canPrev = index > 0;
  const canNext = index < images.length - 1;

  // Fresh photo, fresh zoom — matches how any simple photo viewer behaves,
  // and avoids the real complexity of tracking independent zoom state per
  // photo for no real benefit here.
  useEffect(() => {
    applyScale(MIN_SCALE);
    setTranslate({ x: 0, y: 0 });
  }, [index]);

  // Browser back closes the viewer instead of leaving listing detail. One
  // history entry is pushed on open; both the physical/OS back gesture
  // (popstate) and every on-screen close control go through history.back(),
  // so the same single code path handles closing either way and no extra
  // phantom entries pile up.
  useEffect(() => {
    window.history.pushState({ mktPhotoViewer: true }, "");
    const onPopState = () => onClose();
    window.addEventListener("popstate", onPopState);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  function close() {
    window.history.back();
  }

  function applyScale(next: number) {
    scaleRef.current = next;
    setScale(next);
  }

  function clampPan(tx: number, ty: number, s: number) {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return { x: tx, y: ty };
    // The image's own base (scale-1) contained size, measured live rather
    // than assumed, so this works for a wide OR tall source photo, not just
    // the square case the listing pipeline usually produces.
    const baseW = img.clientWidth;
    const baseH = img.clientHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const displayedW = baseW * s;
    const displayedH = baseH * s;
    const maxX = Math.max(0, (displayedW - cw) / 2);
    const maxY = Math.max(0, (displayedH - ch) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, tx)), y: Math.min(maxY, Math.max(-maxY, ty)) };
  }

  function goTo(next: number) {
    if (next < 0 || next >= images.length) return;
    setIndex(next);
  }

  function toggleZoomAt(clientX: number, clientY: number) {
    if (scaleRef.current > MIN_SCALE) {
      applyScale(MIN_SCALE);
      setTranslate({ x: 0, y: 0 });
      return;
    }
    const container = containerRef.current;
    if (!container) { applyScale(DOUBLE_TAP_SCALE); return; }
    const rect = container.getBoundingClientRect();
    // Zoom toward where the person actually tapped, not blindly to centre.
    const offsetX = (rect.left + rect.width / 2 - clientX) * (DOUBLE_TAP_SCALE - 1);
    const offsetY = (rect.top + rect.height / 2 - clientY) * (DOUBLE_TAP_SCALE - 1);
    applyScale(DOUBLE_TAP_SCALE);
    setTranslate(clampPan(offsetX, offsetY, DOUBLE_TAP_SCALE));
  }

  // ── Touch (mobile) ──────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      gesture.current = "pinch";
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchStart.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: scaleRef.current };
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    startTranslate.current = translate;
    // Double-tap: two single-touch taps, close together in time and position.
    const now = Date.now();
    if (lastTap.current && now - lastTap.current.t < DOUBLE_TAP_WINDOW
      && Math.hypot(t.clientX - lastTap.current.x, t.clientY - lastTap.current.y) < 30) {
      toggleZoomAt(t.clientX, t.clientY);
      lastTap.current = null;
      gesture.current = "none";
      return;
    }
    lastTap.current = { t: now, x: t.clientX, y: t.clientY };
    gesture.current = scaleRef.current > MIN_SCALE ? "pan" : "pending";
  }

  function onTouchMove(e: React.TouchEvent) {
    if (gesture.current === "pinch" && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.current.scale * (dist / pinchStart.current.dist)));
      applyScale(next);
      setTranslate((tr) => clampPan(tr.x, tr.y, next));
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;

    if (gesture.current === "pan") {
      e.preventDefault();
      setTranslate(clampPan(startTranslate.current.x + dx, startTranslate.current.y + dy, scale));
      return;
    }
    if (gesture.current === "pending") {
      if (Math.abs(dx) < DIRECTION_DEADZONE && Math.abs(dy) < DIRECTION_DEADZONE) return;
      // Decided once, right here, never re-evaluated for the rest of this touch.
      if (Math.abs(dx) > Math.abs(dy)) gesture.current = "swipe-photo";
      else if (dy > 0) gesture.current = "close-swipe";
      else gesture.current = "none"; // an upward swipe while zoomed out is not a gesture here
    }
    if (gesture.current === "swipe-photo") {
      e.preventDefault();
      // Resist swiping past either end rather than pretending there's more.
      const resisted = (!canNext && dx < 0) || (!canPrev && dx > 0) ? dx * 0.3 : dx;
      setDragPreview({ x: resisted, y: 0, opacity: 1 });
    } else if (gesture.current === "close-swipe") {
      e.preventDefault();
      const opacity = Math.max(0.4, 1 - dy / 400);
      setDragPreview({ x: 0, y: dy, opacity });
    }
  }

  function onTouchEnd() {
    if (gesture.current === "swipe-photo") {
      if (dragPreview.x <= -SWIPE_PHOTO_THRESHOLD && canNext) goTo(index + 1);
      else if (dragPreview.x >= SWIPE_PHOTO_THRESHOLD && canPrev) goTo(index - 1);
      setDragPreview({ x: 0, y: 0, opacity: 1 });
    } else if (gesture.current === "close-swipe") {
      if (dragPreview.y >= CLOSE_DRAG_THRESHOLD) { close(); return; }
      setDragPreview({ x: 0, y: 0, opacity: 1 });
    } else if (gesture.current === "pinch" || gesture.current === "pan") {
      if (scaleRef.current <= MIN_SCALE) { applyScale(MIN_SCALE); setTranslate({ x: 0, y: 0 }); }
    }
    gesture.current = "none";
  }

  // ── Desktop: wheel to zoom, double-click to toggle, drag to pan when zoomed ──
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    // Reads scaleRef, not the scale closure — a fast trackpad fires several
    // wheel events before React re-renders between them, and each of those
    // events needs to see what the LAST one just set, not what the last
    // *render* saw, or the whole burst collapses into a single 0.2 step.
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current + (e.deltaY < 0 ? 0.2 : -0.2)));
    applyScale(next);
    setTranslate((tr) => (next <= MIN_SCALE ? { x: 0, y: 0 } : clampPan(tr.x, tr.y, next)));
  }

  function onDoubleClick(e: React.MouseEvent) {
    toggleZoomAt(e.clientX, e.clientY);
  }

  const mouseDrag = useRef<{ x: number; y: number } | null>(null);
  function onMouseDown(e: React.MouseEvent) {
    if (scaleRef.current <= MIN_SCALE) return;
    mouseDrag.current = { x: e.clientX, y: e.clientY };
    startTranslate.current = translate;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!mouseDrag.current) return;
    const dx = e.clientX - mouseDrag.current.x;
    const dy = e.clientY - mouseDrag.current.y;
    setTranslate(clampPan(startTranslate.current.x + dx, startTranslate.current.y + dy, scale));
  }
  function onMouseUp() {
    mouseDrag.current = null;
  }

  const zoomed = scale > MIN_SCALE;
  const swiping = gesture.current === "swipe-photo" || gesture.current === "close-swipe";

  return createPortal(
    <div
      className="mkt-pv"
      role="dialog"
      aria-modal="true"
      aria-label={`${title}, photo ${index + 1} of ${images.length}`}
    >
      <div className="mkt-pv-top">
        <button type="button" className="mkt-pv-close" onClick={close} aria-label="Close">✕</button>
        {images.length > 1 && <span className="mkt-pv-count">{index + 1} / {images.length}</span>}
      </div>

      <div
        ref={containerRef}
        className="mkt-pv-stage"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          ref={imgRef}
          src={image}
          alt={title}
          draggable={false}
          className="mkt-pv-img"
          style={{
            transform: `translate(${translate.x + dragPreview.x}px, ${translate.y + dragPreview.y}px) scale(${scale})`,
            opacity: dragPreview.opacity,
            transition: swiping || gesture.current === "pan" || gesture.current === "pinch" ? "none" : "transform 0.2s ease, opacity 0.2s ease",
            cursor: zoomed ? "grab" : "default",
          }}
        />
      </div>

      {/* Desktop-only prev/next, mirroring the thumbnails' own reach — touch
          uses the swipe above instead, matching the mobile-first priority. */}
      {images.length > 1 && (
        <>
          {canPrev && <button type="button" className="mkt-pv-nav prev" onClick={() => goTo(index - 1)} aria-label="Previous photo">‹</button>}
          {canNext && <button type="button" className="mkt-pv-nav next" onClick={() => goTo(index + 1)} aria-label="Next photo">›</button>}
        </>
      )}

      {images.length > 1 && !zoomed && (
        <div className="mkt-pv-dots">
          {images.map((url, i) => (
            <button key={url} type="button" className={i === index ? "mkt-pv-dot on" : "mkt-pv-dot"} onClick={() => goTo(i)} aria-label={`Photo ${i + 1}`} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
