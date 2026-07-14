# gsap-timing.md - The Copy Timing Contract

How `references/gsap-copy.js` (`mountCopyLayer`) drives the kinetic-type layer in lockstep with the scrubbed Higgsfield footage.

**Core design rule: the copy leads the ball.** Each section's words finish revealing *just before* the subject (the ball / camera-followed player) arrives on screen, hold while it is there, and clear out *before* it departs for the next scene. Every number below exists to enforce that.

---

## 1. Division of labour: engine vs. copy layer

The scrub engine (`scrub-engine.js`) is mounted with `copy:false`, so it renders and drives **no** text. It owns only the video scrub, and it publishes the geometry the copy layer needs by firing a `sw:layout` CustomEvent on the container:

```js
mountCopyLayer(el, { sections:[ /* same ids + order as engine config */ ] });
mountScrollWorld(el, { /* ... */, copy:false });   // fires sw:layout on mount + on resize
```

The copy layer listens and (re)builds all ScrollTriggers from the px ranges in the event:

```js
container.addEventListener('sw:layout', e => build(e.detail));
```

Because the engine re-fires on resize and `build()` kills its old triggers first (`triggers.forEach(t => t.kill())`), the copy timing always tracks the current viewport and the current per-section scroll math. GSAP + ScrollTrigger must be loaded first (`window.gsap`, `window.ScrollTrigger`).

## 2. The `sw:layout` event contract

`e.detail` is:

```js
{
  vh: Number,              // the viewport height the engine used for its px math
  sections: [
    { id: 'france', start: Number, end: Number },   // px scroll offsets for THIS clip
    { id: 'brazil', start: Number, end: Number },
    // ... one per section, same ids the copy layer was configured with
  ]
}
```

- `start` / `end` are absolute px scroll positions where each **clip** (video leg) formally runs.
- The copy layer joins on `id` (`range[s.id] = r`), not index, so ordering drift is safe. A section with no matching range, or `end <= start`, is skipped.

## 3. What `mountCopyLayer` builds

For each configured section it creates one `<article class="wc-copy">` inside a fixed, `pointer-events:none` overlay (`.wc-copylayer`, `z-index:22`). There is no dark panel behind the copy - legibility is a text-shadow on the glyphs themselves, with only a light top-only vignette to keep the navbar legible. Structure per block: `.wc-num` (`01 / 05`), `.wc-eyebrow`, `.wc-title` (`<h1>` for section 0, else `<h2>`), `.wc-body`, `.wc-tags li`, `.wc-cta`. Only `.wc-cta` re-enables `pointer-events:auto`, so links are clickable but the rest never blocks the scroll surface.

### The word-mask split (the reveal primitive)

Titles are split per word into a clipping mask plus a transforming inner span:

```js
function splitWords(title) {
  return String(title).trim().split(/\s+/).map(w =>
    `<span class="wc-wmask"><span class="wc-w">${esc(w)}</span></span>`).join(' ');
}
```

```css
.wc-wmask{display:inline-block;overflow:hidden;vertical-align:top;padding:0 .015em;}
.wc-w{display:inline-block;will-change:transform,opacity;}
```

`.wc-wmask` has `overflow:hidden`; only `.wc-w` is animated (`yPercent` / `rotateX` / `opacity`). So a word rising from `yPercent:118` is physically clipped by its own mask until it crosses into view - the "wipe up from behind a line" look, with nothing bleeding outside the text box.

## 4. Pre-state and no-GSAP fallback

Before any trigger builds, blocks are set so nothing flashes; if GSAP/ST failed to load, only the hero is shown (never five stacked blocks):

```js
if (!gsap || !ST) { blocks.forEach((b, i) => { b.style.opacity = i === 0 ? '1' : '0'; }); return; }
// ...
blocks.forEach((b, i) => {
  const first = i === 0;
  gsap.set(b, { autoAlpha: first ? 1 : 0 });
  if (!reduce && !first) gsap.set(b.querySelectorAll('.wc-w'), { yPercent: 118, opacity: 0, rotateX: -42 });
});
```

## 5. Timing geometry: the LEAD offset

This is the heart of "the copy leads the ball." Each section's copy ScrollTrigger does **not** start where its own clip starts. It starts `LEAD` viewport-heights **earlier** - i.e. inside the *tail of the previous clip* - which is exactly when the ball is arriving at this section's player.

```js
const V = detail.vh || window.innerHeight;
const LEAD = first ? 0 : 0.28 * V;          // 0.28 vh head-start; hero has none
const stStart = Math.max(0, r.start - LEAD);
const span    = Math.max(1, r.end - stStart);
const atStart = (r.start - stStart) / span; // progress where THIS clip formally begins
```

- `stStart` - where the copy timeline begins (in the previous clip's tail).
- `r.end` - where it ends (this clip's end).
- The timeline is scrubbed `1:1` across `[stStart, r.end]`, so **all positions below are progress units 0..1**, not px.
- `atStart` is the single most important derived value: the progress at which the player is on screen (px `r.start`). Everything "in" must complete *before* `atStart`; everything "out" must finish *before* progress 1.

For non-first sections `atStart > 0` (because `LEAD` widened the front of the range). For the hero, `LEAD = 0`, `atStart = 0`, and the reveal is handled by the one-time load intro instead (Section 8).

## 6. Per-section phases (kinetic, scrubbed)

```js
// Finale starts hidden; all others visible. transform cleared so scrub owns it.
gsap.set(b, { autoAlpha: last ? 0 : 1, clearProps: 'transform' });

const tl = gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: { start: stStart, end: r.end, scrub: true },
});
tl.to({}, { duration: 1 }, 0);                                   // lock total duration = 1
tl.fromTo(b, { yPercent: first ? 0 : 6 }, { yPercent: -8, duration: 1 }, 0); // whole-block drift
if (last) tl.to(b, { autoAlpha: 1, immediateRender: false, duration: 0.01 }, 0); // reveal finale on enter
```

`tl.to({}, {duration:1}, 0)` pins the timeline's total length to 1 so every other tween's position/duration reads as a fraction of the `[stStart, r.end]` range regardless of its px size.

### Phase A - IN (fast, front-loaded, lands before `atStart`)

Applied only when `!first`. The reveal completes at `atStart * 0.9` - deliberately ahead of the clip's own start:

```js
const inEnd   = Math.max(0.12, atStart * 0.9);   // finish at 90% of the way to the ball
const inStart = Math.max(0, inEnd - 0.14);        // a tight ~0.14-progress window
const inDur   = inEnd - inStart;

// title words: wipe up out of the mask, de-skew, fade in
tl.fromTo(words, { yPercent: 118, opacity: 0, rotateX: -42 },
  { yPercent: 0, opacity: 1, rotateX: 0, stagger: inDur * 0.34, ease: 'power3.out', duration: inDur }, inStart);
// num + eyebrow
tl.fromTo(meta, { y: 24, opacity: 0 },
  { y: 0, opacity: 1, stagger: 0.04, ease: 'power2.out', duration: inDur * 0.8 }, inStart + 0.01);
// body + tags + cta, snapped on right at the tail of the word reveal
tl.fromTo(rest, { y: 20, opacity: 0 },
  { y: 0, opacity: 1, stagger: 0.04, ease: 'power2.out', duration: 0.12 }, inEnd - 0.03);
```

`meta = [.wc-num, .wc-eyebrow]`; `rest = [.wc-body, .wc-tags li..., .wc-cta]`.

### Phase B - HOLD

There is no explicit hold tween. Between `inEnd` (`~atStart*0.9`) and `outStart` the copy simply sits fully revealed while the block does its slow `yPercent 6 -> -8` parallax drift. The subject is on screen during this window.

### Phase C - OUT (quick exit, before the ball leaves)

Applied only when `!last`. Words leave up-and-back; meta/rest slide up and fade:

```js
const outStart = first ? 0.5 : 0.62, outDur = 0.22;
tl.fromTo(words, { yPercent: 0, opacity: 1, rotateX: 0 },
  { yPercent: -96, opacity: 0, rotateX: 24, stagger: 0.02, ease: 'power2.in', duration: outDur, immediateRender: false }, outStart);
tl.fromTo([...meta, ...rest], { y: 0, opacity: 1 },
  { y: -22, opacity: 0, ease: 'power2.in', duration: outDur, immediateRender: false }, outStart);
```

`immediateRender:false` on the OUT (and finale reveal) tweens stops GSAP from pre-applying the end state and fighting the pre-state / IN tweens.

### Progress map (non-first, non-last section)

| Progress | px | Event |
|---|---|---|
| `0` | `stStart` (prev clip tail, `-0.28vh`) | timeline enters; block pre-hidden words at `yPercent 118` |
| `inStart` (`inEnd-0.14`) | - | IN begins |
| `inEnd` (`atStart*0.9`) | just before `r.start` | copy fully landed - **ball has not arrived yet** |
| `atStart` | `r.start` | clip formally begins; player on screen (copy already up) |
| `0.62` | - | OUT begins |
| `0.84` (`0.62+0.22`) | - | copy gone |
| `1` | `r.end` | timeline ends |

## 7. Whole-block parallax

Independent of the phases, every block drifts `yPercent: (first?0:6) -> -8` across the full `duration:1`, giving the copy a subtle counter-motion against the footage. This is the only place `b` itself transforms; word/meta/rest transforms are local.

## 8. Hero (section 0): greet on load, then scrub the exit

The hero does not use the IN phase (`!first` guards it). Instead it plays a **one-time** intro on page load, then the scrubbed timeline above owns its OUT (`outStart = 0.5`). The `_wcIntroDone` flag makes it fire once even though `build()` re-runs on resize:

```js
if (!reduce && !container._wcIntroDone) {
  container._wcIntroDone = true;
  const hero = blocks[0];
  gsap.from(hero.querySelectorAll('.wc-w'),
    { yPercent: 120, opacity: 0, rotateX: -45, stagger: 0.06, duration: 0.9, ease: 'power3.out', delay: 0.15 });
  gsap.from([hero.querySelector('.wc-num'), hero.querySelector('.wc-eyebrow'),
             hero.querySelector('.wc-body'), ...hero.querySelectorAll('.wc-tags li')].filter(Boolean),
    { y: 24, opacity: 0, stagger: 0.07, duration: 0.7, ease: 'power2.out', delay: 0.1 });
}
```

## 9. Finale (last section): visibility-gated CTA

The finale holds the real CTA links, so it must never be focusable or tappable while scrolled away above the fold. It is created at `autoAlpha:0` and only revealed once its own range is entered:

```js
gsap.set(b, { autoAlpha: last ? 0 : 1, clearProps: 'transform' });
// ...
if (last) tl.to(b, { autoAlpha: 1, immediateRender: false, duration: 0.01 }, 0); // reveal as it enters
```

`autoAlpha` maps to `visibility:hidden` + `opacity:0` at 0, so while scrolled away the finale block (and its `.wc-cta` anchors) is `visibility:hidden` = not focusable, not clickable. It flips visible the instant the timeline enters `[stStart, r.end]`. The finale has no OUT phase (`!last` guards it), so it stays up through `r.end`.

## 10. Reduced motion: plain opacity envelope

`prefers-reduced-motion: reduce` replaces the entire kinetic timeline with a transform-free opacity crossfade driven by a bare `ScrollTrigger.create`. No splits animate, no scrub tweens, no `yPercent`/`rotateX`:

```js
if (reduce) {
  gsap.set(b, { clearProps: 'transform' });
  triggers.push(ST.create({
    start: stStart, end: r.end,
    onUpdate: self => {
      const p = self.progress, up = Math.max(0.06, atStart);
      let o;
      if (first)      o = 1 - clamp((p - 0.5) / 0.32);          // hero fades out past mid
      else if (last)  o = clamp(p / up);                         // finale fades in, stays
      else            o = Math.min(clamp(p / up), 1 - clamp((p - 0.64) / 0.2)); // in then out
      gsap.set(b, { autoAlpha: clamp(o) });
    },
  }));
  return;
}
```

CSS also hard-pins the split words so nothing is stuck off-screen:

```css
@media (prefers-reduced-motion:reduce){ .wc-w{transform:none!important;opacity:1!important;} }
```

The same `atStart` lead still governs *when* the fade-in completes (`p / atStart`), so reduced-motion copy still leads the ball - it just arrives by opacity rather than motion.

## 11. Contract summary (for the engine + section authors)

- Fire `sw:layout` with `{ vh, sections:[{id,start,end}] }` on mount and on every resize. `vh` must be the height used for the px math (the copy layer derives `LEAD = 0.28*vh` from it).
- `sections[].id` must match the copy config ids; order-independent, joined by id.
- Copy positions are progress-relative (timeline locked to `duration:1`), so px range size is irrelevant to phase timing - only the `atStart` ratio (set by `LEAD` vs. clip length) matters.
- Tune the lead by section length: longer clips push `atStart` smaller, so the reveal lands earlier in absolute px; the `0.28*vh` head-start keeps the copy ahead of the subject regardless.
- Non-negotiable invariants: hero intro fires once (`_wcIntroDone`); finale stays `autoAlpha:0` until its range (CTA not focusable when away); IN completes by `atStart*0.9`; OUT completes by progress ~0.84 for interior sections. Keep those and the copy always leads the ball.
