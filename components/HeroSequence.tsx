"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/engine";
import { SEQUENCE } from "@/lib/sequence";

const PORTRAIT = "(max-aspect-ratio: 17/20)";
/** the reel finishes at this point of the hero scroll, so the lens is whole again before it flies away */
const REEL_END = 0.92;
/** how much of the gap to the scroll target is closed per 60 Hz frame; lower = slower, heavier motion */
const FOLLOW = 0.12;
const pad = (n: number) => String(n).padStart(4, "0");

/**
 * Scroll-scrubbed image sequence ("video made of images"), built to stay light:
 * - the first frame is a normal <img> (shows instantly, before any JS)
 * - the reel frames are AVIF (small even with transparency); a browser that can't
 *   decode AVIF just keeps the poster: a still lens instead of a broken reel
 * - other frames stream in progressively: every 16th first, then 8th, 4th...
 *   so scrubbing works right away and just gets more detailed as frames arrive
 * - between two loaded frames it crossfades, so 180 frames feel like real video
 * - frames are transparent (just the lens, no backdrop), so the lens floats over the page
 * - phones load a portrait-cropped set, and only every 2nd frame
 * - redraws only when the frame actually changes
 */
export default function HeroSequence() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { count, base } = SEQUENCE;
    const portrait = matchMedia(PORTRAIT).matches;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const minStride = conn?.saveData ? 8 : coarse ? 2 : 1;
    const url = (i: number) => `${base}/${portrait ? "m" : "d"}/${pad(i + 1)}.${SEQUENCE.ext}`;

    // ---- progressive load queue ----
    const frames: (HTMLImageElement | null)[] = new Array(count).fill(null);
    const order: number[] = [count - 1];
    const seen = new Set([0, count - 1]);
    for (const stride of [16, 8, 4, 2, 1]) {
      if (stride < minStride) break;
      for (let i = 0; i < count; i += stride) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }

    let cancelled = false;
    let dirty = true;
    let next = 0;
    let active = 0;
    const load = (i: number) => {
      const img = new Image();
      img.decoding = "async";
      img.src = url(i);
      return img.decode().then(() => {
        if (cancelled) return;
        frames[i] = img;
        dirty = true;
      });
    };
    const pump = () => {
      while (!cancelled && active < 6 && next < order.length) {
        const i = order[next++];
        active++;
        load(i)
          .catch(() => {})
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    // frame 1 goes first and alone: it doubles as the AVIF support check (one retry
    // for a network hiccup). If it never decodes, the poster stays and nothing else loads.
    const start = (tries = 2) =>
      load(0).then(pump, () => {
        if (tries > 1 && !cancelled) setTimeout(() => start(tries - 1), 1000);
      });
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => start(), { timeout: 800 });
    else setTimeout(() => start(), 200);

    // ---- canvas sizing ----
    const resize = () => {
      const s = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(canvas.clientWidth * s);
      canvas.height = Math.round(canvas.clientHeight * s);
      dirty = true;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (img: HTMLImageElement, alpha: number) => {
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    };

    /** index of the loaded frame closest to x */
    const nearest = (x: number) => {
      let a = Math.floor(x);
      while (a >= 0 && !frames[a]) a--;
      let b = Math.ceil(x);
      while (b < count && !frames[b]) b++;
      if (a < 0) return b < count ? b : x;
      if (b >= count) return a;
      return x - a <= b - x ? a : b;
    };

    // ---- scroll → frame ----
    let cur = 0;
    let drawn = -1;
    let lastRaw = -1;
    let stillMs = 0;
    const off = engine.onTick((_t, dt) => {
      const hero = engine.find("hero");
      if (!hero || engine.y > hero.top + hero.height) return; // off screen: do nothing

      // while scrolling, blend between frames (reads as motion blur);
      // once the scroll rests, settle on one clean frame so nothing looks double-exposed.
      // Time-based, so slow devices settle just as fast as 120 Hz screens.
      const raw = Math.min(1, hero.progress / REEL_END) * (count - 1);
      stillMs = Math.abs(raw - lastRaw) < 1e-4 ? stillMs + dt : 0;
      lastRaw = raw;
      const target = stillMs > 70 ? nearest(raw) : raw;
      cur += (target - cur) * (1 - Math.pow(1 - FOLLOW, dt / 16.7));
      if (Math.abs(target - cur) < 0.002) cur = target;
      if (!dirty && Math.abs(cur - drawn) < 0.002) return;

      let a = Math.floor(cur);
      while (a >= 0 && !frames[a]) a--;
      let b = Math.ceil(cur);
      while (b < count && !frames[b]) b++;
      const A = a >= 0 ? frames[a] : null;
      const B = b < count ? frames[b] : null;
      if (!A && !B) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (A && B && b > a && b - a <= 3) {
        // neighbouring frames: crossfade = smooth "in-between" frame.
        // The frames are transparent, so add the two weighted frames together ("lighter");
        // painting B over A would let A show through B's empty areas and leave ghosts.
        const t = (cur - a) / (b - a);
        if (t < 0.004) draw(A, 1);
        else if (t > 0.996) draw(B, 1);
        else {
          draw(A, 1 - t);
          ctx.globalCompositeOperation = "lighter";
          draw(B, t);
          ctx.globalCompositeOperation = "source-over";
        }
      } else if (A && B) {
        // big gap (still loading): show the nearest frame, blending would ghost
        draw(cur - a <= b - cur ? A : B, 1);
      } else draw((A ?? B)!, 1);
      ctx.globalAlpha = 1;
      drawn = cur;
      dirty = false;
      // the canvas has taken over; the transparent placeholder underneath would double up
      if (imgRef.current && imgRef.current.style.visibility !== "hidden") imgRef.current.style.visibility = "hidden";
    });

    return () => {
      cancelled = true;
      off();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="seq" aria-hidden>
      <picture>
        {/* AVIF browsers get frame 1 itself (tiny, and the canvas reuses it from cache);
            the WebP poster is only for browsers without AVIF */}
        <source media={PORTRAIT} type="image/avif" srcSet={`${SEQUENCE.base}/m/0001.${SEQUENCE.ext}`} />
        <source media={PORTRAIT} srcSet={`${SEQUENCE.base}/m/poster.webp`} />
        <source type="image/avif" srcSet={`${SEQUENCE.base}/d/0001.${SEQUENCE.ext}`} />
        <img
          ref={imgRef}
          src={`${SEQUENCE.base}/d/poster.webp`}
          alt=""
          fetchPriority="high"
          decoding="async"
          width={SEQUENCE.desktop.w}
          height={SEQUENCE.desktop.h}
        />
      </picture>
      <canvas ref={canvasRef} />
    </div>
  );
}
