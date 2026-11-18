"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/engine";

export default function Nav() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let last = -1;
    return engine.onTick(() => {
      const p = Math.round(engine.progress * 1000) / 1000;
      if (p === last || !bar.current) return;
      last = p;
      bar.current.style.transform = `scaleX(${p})`;
    });
  }, []);

  return (
    <>
      <div className="progress" aria-hidden>
        <div ref={bar} className="progress-bar" />
      </div>
      <nav className="nav" aria-label="Main">
        <a href="#top" className="logo" data-cursor>
          <span className="logo-mark" aria-hidden />
          LUMEN
        </a>
        <div className="nav-links">
          <a href="#film" data-cursor>Film</a>
          <a href="#work" data-cursor>Work</a>
          <a href="#process" data-cursor>Process</a>
        </div>
        <a href="#contact" className="nav-cta" data-cursor>
          Let&apos;s talk
        </a>
      </nav>
    </>
  );
}
