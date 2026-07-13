# Worked example: World Cup 2026 "The Final Four"

Live: https://fanacrack-demo-sites.vercel.app/worldcup/

A 5-scene scroll-cinema page. Scroll drives one ball's POV camera on a single flight
across the four World Cup 2026 semifinalists (Paris, Wembley, Madrid, Buenos Aires) and
lands on the trophy. The film is 5 Kling 3.0 still-to-still legs; a GSAP copy layer runs
word-by-word titles in lockstep so the copy lands right before the ball arrives.

Study this to build your own: the whole thing is three files plus an `assets/` folder,
and the numbers below (scroll spans, LEAD, crossfade, credits) are the ones that shipped.

Files:
- `index.html` - config + two mount calls (this is the only file you author per project)
- `scrub-engine.js` - the scroll/video engine (drop-in, unchanged from the skill)
- `gsap-copy.js` - the kinetic copy layer (drop-in, unchanged from the skill)
- `assets/` - 5 stills (`.webp`), 5 desktop clips + 5 mobile clips (`vid/*.mp4`), posters

---

## Concept

One ball, one continuous flight, four rivals, one prize. The camera is the ball: it is
struck skyward in Paris, falls to Kane at Wembley, clears a bullring wall in Madrid,
comes home to Messi in Buenos Aires, then pulls back to reveal all four facing a flaming
trophy. Each leg names the real semifinal matchup, so the narrative doubles as the
fixture list. It is an unofficial fan concept, all imagery AI-generated, not affiliated
with FIFA - which is why every scene tags its matchup and the crawlable block carries the
disclaimer verbatim.

---

## The 5 scenes

| # | id | Place / stage | Subject | Scene | accent | scroll · linger |
|---|----|--------------|---------|-------|--------|-----------------|
| 1 | `france` | Paris · Semifinal | Mbappe, royal blue No.10 | Eiffel Tower at dusk; he strikes it high into the sky | `#4D7CFF` | 1.8 · 0.4 |
| 2 | `england` | Wembley · Semifinal | Kane, white No.9 | Red-and-white smoke under the arch; first-time volley onward | `#FF5A6E` | 1.6 · 0.35 |
| 3 | `spain` | Madrid · Semifinal | "The Kid", red No.19 | Bullring golden sand; outsprints a charging black bull, flicks it over the wall | `#FFB703` | 1.6 · 0.35 |
| 4 | `argentina` | Buenos Aires · Semifinal | Messi, sky-blue-and-white No.10 | Golden-hour street pitch, murals, giant flag, confetti; gathers on the run | `#7EC8E3` | 1.6 · 0.35 |
| 5 | `finale` | The Trophy | All four, from behind | Shoulder to shoulder on the center circle, four flags, giant glowing golden trophy | `#FFD75E` | 2.0 · 0.5 |

`scroll` = viewport-heights of scroll each scene owns; `linger` = extra hold on its
resting frame. Hero and finale get more of both. The per-scene `accent` drives BOTH the
engine section and the copy layer's `--wc-accent`, so the color shifts nation by nation.

---

## The copy arc

Word-by-word titles, one per scene, that read as a single sentence when scrolled top to
bottom:

```
Struck Skyward  ->  It Falls to Kane  ->  Over the Wall  ->  Home to Messi  ->  Four Chase One
```

The finale is the only scene with CTAs: primary **Watch Final Now** (`#top`) and a ghost
**How this was made** (`../#guide`). Each scene's copy is eyebrow + number + title + body
+ two tags. The full `COPY` array (single source of truth for the words - the engine
runs `copy:false` and never renders text):

```js
var COPY = [
  { id:'france',    accent:'#4D7CFF', eyebrow:'Paris · Semifinal',
    title:'Struck Skyward',
    body:'Beneath the glowing tower, Mbappe gathers in royal blue and strikes it high into the Paris dusk.',
    tags:['Mbappe · No.10','France vs Spain'] },
  { id:'england',   accent:'#FF5A6E', eyebrow:'Wembley · Semifinal',
    title:'It Falls to Kane',
    body:"Out of the red-and-white smoke under Wembley's arch, Kane meets it first-time and volleys it onward.",
    tags:['Kane · No.9','Argentina vs England'] },
  { id:'spain',     accent:'#FFB703', eyebrow:'Madrid · Semifinal',
    title:'Over the Wall',
    body:'A fearless teenager in red outsprints the bull across golden sand and flicks it over the wall.',
    tags:['No.19 · The Kid','France vs Spain'] },
  { id:'argentina', accent:'#7EC8E3', eyebrow:'Buenos Aires · Semifinal',
    title:'Home to Messi',
    body:'Golden hour on a Buenos Aires street, Messi gathers it on the run beneath a giant flag.',
    tags:['Messi · No.10','Argentina vs England'] },
  { id:'finale',    accent:'#FFD75E', eyebrow:'The Final Four',
    title:'Four Chase One',
    body:'Four rivals shoulder to shoulder on the center circle, flags flying, facing the trophy only one can lift.',
    tags:['Semis · 14-15 July','Four rivals, one prize'],
    cta:{ primary:{ label:'Watch Final Now', href:'#top' },
          secondary:{ label:'How this was made', href:'../#guide' } } },
];
```

### The copy leads the ball

`gsap-copy.js` listens for the engine's `sw:layout` event (px scroll range per section)
and starts each scene's title reveal `LEAD` = `0.28 * viewportHeight` BEFORE that scene's
clip formally begins - i.e. in the tail of the previous leg, exactly when the ball is
arriving at this scene's player. The reveal finishes just before the clip's resting frame
(`atStart`), so the words have landed by the time the subject is on screen. Titles rise
per word (`yPercent 118 -> 0`, `rotateX -42 -> 0`, staggered); eyebrow/number/body/tags
follow; everything exits up before the ball departs. `prefers-reduced-motion` collapses
all of it to a plain opacity envelope (no splits, no scrub). You tune one number - `LEAD`
- to slide the copy earlier or later against the footage.

---

## The still-to-still render (the enhancement over scroll-world)

This is the core upgrade. Instead of prompt-only chained clips (which drift - the
Eiffel-tower ghosting problem in older builds), **every camera leg is pinned at BOTH ends
to an approved still**. Leg `i` renders `--start-image still_i --end-image still_{i+1}`, a
ball/subject-POV camera that follows the moving subject out of scene `i` and lands exactly
on scene `i+1`. Because both endpoints are fixed frames, the legs are INDEPENDENT: they
render in PARALLEL, and the seam between leg `i` and leg `i+1` is frame-perfect by
construction (leg `i`'s last frame IS `still_{i+1}`, which IS leg `i+1`'s first frame).
No connector clips are needed - the config ships `connectors: []`.

Leg map (5 approved stills, 5 legs):

| leg | clip file | start-image | end-image | handoff |
|-----|-----------|-------------|-----------|---------|
| 1 | `vid/france.mp4`    | `france.webp`    | `england.webp`   | ball struck up in Paris, drops toward Wembley |
| 2 | `vid/england.mp4`   | `england.webp`   | `spain.webp`     | Kane's volley carries it to Madrid |
| 3 | `vid/spain.mp4`     | `spain.webp`     | `argentina.webp` | cleared over the wall, on to Buenos Aires |
| 4 | `vid/argentina.mp4` | `argentina.webp` | `finale.webp`    | Messi gathers, camera pulls to the center circle |
| 5 | `vid/finale.mp4`    | `finale.webp`    | `finale.webp`    | terminal leg - slow orbit/pull-back that opens and closes on the trophy still |

Stills first (GPT Image 2, 3:2, anchor-then-batch with the approved anchor as a style
lock - see `pipeline.md`). Then render the 5 legs in parallel on Kling 3.0:

```bash
# Kling 3.0, still-to-still, one leg. VOPTS for kling3_0: --mode std --sound off (no --resolution flag).
higgsfield generate create kling3_0 --prompt "$(cat leg_$i.txt)" \
  --start-image "still_$i.png" --end-image "still_$((i+1)).png" \
  --mode std --sound off --aspect_ratio 16:9 --duration 10 \
  --wait --wait-timeout 20m --json > leg_$i.json
```

Encode each for frame-accurate scrubbing (tight GOP, no audio, faststart):

```bash
ffmpeg -v error -y -i leg_$i.mp4 -an -vf "unsharp=5:5:0.8:5:5:0.0" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart assets/vid/france.mp4
```

Verify seams automatically before eyeballing - a true still handoff scores SSIM >= 0.95;
< 0.75 means the wrong frame was pinned, regenerate (do not rationalize):

```bash
# last frame of leg A vs first frame of leg B
ffmpeg -v error -y -sseof -0.05 -i assets/vid/france.mp4 -frames:v 1 _a.png
ffmpeg -v error -y -ss 0      -i assets/vid/england.mp4 -frames:v 1 _b.png
ffmpeg -v info -i _a.png -i _b.png -lavfi ssim -f null - 2>&1 | grep -o 'All:[0-9.]*'
```

Posters are extracted from the ENCODED clip's own first frame (not the 3:2 still) to kill
the still-to-video pop, and mobile gets a 720p / tighter-GOP `-m.mp4` sibling per leg.

### Approximate spend

- **~75 Higgsfield credits** for the 5 Kling 3.0 pro legs (~15 credits each, std, ~10s).
- Plus the image gens: 5 approved stills on GPT Image 2, a handful of re-rolls for the
  anchor/style pass. Small next to the video.
- Legs render in parallel, so wall-clock is ~one leg's render time, not five.

Previz tip: run the whole chain once on a cheap frame-locking draft tier before spending
the pro credits - seams behave the same, so journey/pacing/copy all validate cheaply, and
you only re-render the video pass.

---

## The wiring (index.html)

Everything is two mount calls. Mount the copy layer FIRST so its `sw:layout` listener is
ready before the engine fires the event on mount:

```js
mountCopyLayer(world, { sections: COPY });   // owns all text

mountScrollWorld(world, {
  brand: { name: 'THE FINAL FOUR', href: '#top' },
  cta:   { label: 'More demo sites', href: '../' },
  hint:  'scroll to follow the ball',
  copy: false,          // engine renders NO text; it just scrubs + fires sw:layout
  diveScroll: 1.6,
  connScroll: 0.9,
  crossfade: 0.08,      // tiny cross-dissolve masks any sub-pixel seam
  sections: [
    { id:'france',    still:'assets/france.webp',    poster:'assets/france-poster.webp',
      posterMobile:'assets/france-poster-m.webp',
      clip:'assets/vid/france.mp4',    clipMobile:'assets/vid/france-m.mp4',
      accent:'#4D7CFF', scroll:1.8, linger:0.4 },
    // england / spain / argentina identical shape, accent + scroll/linger per the table
    { id:'finale',    still:'assets/finale.webp',    poster:'assets/finale-poster.webp',
      posterMobile:'assets/finale-poster-m.webp',
      clip:'assets/vid/finale.mp4',    clipMobile:'assets/vid/finale-m.mp4',
      accent:'#FFD75E', scroll:2.0, linger:0.5 },
  ],
  connectors: [],       // none - the legs ARE the seams (still-to-still architecture)
});
```

Load order in `<body>`: GSAP + ScrollTrigger (CDN) -> `scrub-engine.js` -> `gsap-copy.js`
-> the inline `COPY` + mount script.

### Crawlable copy (AEO / SEO)

The page ships a real `<section data-sw-seo>` inside `#world` containing an `<h1>`, the
five scene `<h2>` + paragraph pairs, and the disclaimer - the same words as `COPY`, in
prose. That is what crawlers and no-JS clients read; the engine overlays the cinematic
layer on top. No prerender step and no `<noscript>` needed - the content is in the initial
HTML.

---

## What to lift into your own build

1. **Pin every leg to two approved stills.** Frame-perfect seams for free, parallel
   renders, no prompt-chaining drift. This is the whole point of the still-to-still
   architecture - do not fall back to prompt-only chaining.
2. **Engine `copy:false`, copy layer owns the words.** One `COPY` array is the single
   source of truth; the engine only carries assets and scroll geometry.
3. **Copy leads the ball.** `LEAD = 0.28 * vh` starts each title in the previous leg's
   tail. Tune that one number to taste.
4. **Author only `index.html`.** `scrub-engine.js` and `gsap-copy.js` are drop-in and
   unchanged across projects.
5. **Verify seams with SSIM, extract posters from encoded clips, ship mobile `-m` clips.**
   The unglamorous steps are what make it feel seamless on a real phone.
6. **Keep a crawlable `data-sw-seo` block.** The cinematic layer is decoration; the words
   still have to exist as HTML.