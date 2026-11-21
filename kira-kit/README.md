# kira-kit: motion for this site

Kira put these files here. They are served with the site, and the page may
load scripts only from this project, so use these instead of a CDN.

| File | What it is | Licence |
|---|---|---|
| `kira-motion.js` + `kira-motion.css` | Kira's own motion through HTML attributes. Reach for it first. | MIT |
| `lenis.min.js` | Smooth scrolling (Lenis 1.3.11) | MIT |
| `gsap.min.js` + `ScrollTrigger.min.js` | GSAP 3.13.0 for timelines and scroll-driven scenes | GSAP Standard License (free, keep the notice) |

## kira-motion

```html
<link rel="stylesheet" href="kira-kit/kira-motion.css">
<script src="kira-kit/kira-motion.js" defer></script>
```

| Attribute | Effect |
|---|---|
| `data-motion="fade-up"` (or `fade-down`, `fade-left`, `fade-right`, `fade`, `zoom`, `blur`) | reveal on scroll into view |
| `data-motion-delay="150"` | extra delay in ms |
| `data-motion-stagger="80"` on a parent | its `data-motion` children reveal one after another |
| `data-split="words"` with `data-motion` | a heading reveals word by word (`chars` for letters) |
| `data-count-to="1200"` (+ `data-count-prefix`, `-suffix`, `-decimals`) | a number counts up when seen. Write the final value in the element too. |
| `data-parallax="0.2"` | moves at a different speed while scrolling (−0.5 to 0.5) |
| `data-marquee="40"` | children scroll sideways forever, in px/second (logos, words) |
| `data-progress` | a bar that fills as the page is read (give it a height and colour) |
| `data-header-scrolled` | gets `.is-scrolled` once the page scrolls (style a compact header) |

Content stays visible if the script never runs, and people who ask for
reduced motion get no movement. Use motion on headings, cards and images as
they arrive, not on every paragraph.

## GSAP, when kira-motion is not enough

```html
<script src="kira-kit/gsap.min.js" defer></script>
<script src="kira-kit/ScrollTrigger.min.js" defer></script>
```

Register the plugin with `gsap.registerPlugin(ScrollTrigger)`, and wrap your
animation in `gsap.matchMedia()` with `(prefers-reduced-motion: no-preference)`.
