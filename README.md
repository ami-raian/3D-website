# Lumen: a lightweight scroll-driven 3D website

Next.js 16 (App Router) + raw WebGL + Lenis. **No videos, no image sequences**: the whole
scroll "film" is ray-marched live on the GPU, so the page is about 210 KB transferred in total.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## How it works

| File | What it does |
| --- | --- |
| `lib/engine.ts` | One `requestAnimationFrame` loop for everything. Steps Lenis, measures sections only on resize, and writes a `--p` (0 to 1) CSS variable on every tracked section. |
| `components/Track.tsx` | Wrap any section to give it a live `--p`. Modes: `view`, `pin` (sticky sections), `enter`, `exit`. |
| `components/shaders.ts` | The 3D film: blob, then torus, then twisted monolith, then crystal, then ringed planet, plus a field of pearls. |
| `components/ShaderCanvas.tsx` | Maps scroll to the shader timeline and adapts render resolution to the device's speed. |
| `app/globals.css` | Nearly all animation is plain CSS `calc()` on `--p`. No animation library. |

## Hero showreel (scroll-scrubbed image sequence)

The hero plays a video made of images as you scroll (`components/HeroSequence.tsx`). It stays light:
the first frame is a normal `<img>`, the rest stream in progressively (every 16th frame first, then
filling in), it crossfades between neighbouring frames while you scroll, and phones get a
portrait-cropped set where only every 2nd frame is loaded.

To use your own footage, export the video as frames (png/jpg) into a folder, then run:

```bash
node scripts/build-sequence.mjs "C:/path/to/frames" 144
```

This writes WebP frames to `public/sequence/` (1280px desktop, 540px portrait mobile) and updates
`lib/sequence.ts`. 120 to 160 frames is the sweet spot. The current reel is 792 PNGs (684 MB)
squeezed into 144 frames (about 4.5 MB desktop, about 1.9 MB actually loaded on phones).

## Customise

- **Text and content**: `components/Hero.tsx`, `Film.tsx` (chapters), `Work.tsx` (projects), `Process.tsx`, `Footer.tsx`
- **Colours**: `:root` in `app/globals.css`, and the `mood()` function in `components/shaders.ts` (one colour grade per chapter)
- **Film length**: `.film { height: 640vh }` in `globals.css`. Taller means slower scrubbing.
- **3D shapes**: the `shape()` function in `components/shaders.ts`
# 3D-website
