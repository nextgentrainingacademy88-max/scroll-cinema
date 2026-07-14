---
name: scroll-cinema
description: >-
  Build a cinematic, scroll-scrubbed landing page where scroll drives a camera through
  AI-generated video (Higgsfield/Kling) and a GSAP kinetic-copy layer animates the words
  in lockstep with the footage. Use when someone wants an Apple-style scroll-through / a
  scroll-driven film / a "one continuous flight" hero site with headlines that reveal as
  the camera moves. Enhanced descendant of scroll-world: adds still-to-still frame pinning,
  a GSAP word-reveal copy layer timed to "lead the ball", and copy + QA agent workflows.
---

# scroll-cinema

Produce a landing page where **scroll drives a camera**: it flies continuously through a
sequence of AI-generated scenes with no visible cuts, and the **copy animates in sync with
the footage** - titles reveal word-by-word, timed to land *right before* the subject arrives
on screen. The visuals are pre-rendered video; the page just scrubs `currentTime` by scroll
position. Same technique as Apple's scroll-through product pages, with two upgrades over the
older `scroll-world` skill:

1. **Still-to-still frame pinning.** Every camera leg is pinned at BOTH ends to an approved
   still (`--start-image still_i`, `--end-image still_{i+1}`). Seams are frame-perfect *by
   construction*, legs are independent so they render in **parallel**, and there is no prompt-
   drift ghosting between scenes.
2. **A GSAP kinetic-copy layer.** The scrub engine runs with `copy:false` and hands its text
   layer to `gsap-copy.js`, which drives word-by-word reveals, eyebrow/body/tags and the CTA,
   all scrubbed 1:1 with the video.

**The two rules that make or break it:**
- **Seams must be frame-identical.** Still-to-still pinning gives you this for free; the tail-
  trim + SSIM gate in [pipeline.md](references/pipeline.md) verifies it.
- **The copy leads the ball.** Each section's copy starts entering in the *previous* clip's
  tail and finishes just as the subject lands, so words and footage feel like one motion. See
  [gsap-timing.md](references/gsap-timing.md).

Reference build: World Cup 2026 "The Final Four" (5 scenes, one ball's POV flight across four
semifinalists to the trophy) - live at https://fanacrack-demo-sites.vercel.app/worldcup/ .
Study it in [example-worldcup.md](references/example-worldcup.md).

The engine (`references/scrub-engine.js`) and copy layer (`references/gsap-copy.js`) are self-
contained vanilla JS - they build their own DOM and inject their own namespaced CSS, so they
drop into plain HTML, Next.js, Vue, anything. The value of this skill is the Higgsfield
pipeline, the seam method, the copy-timing contract, and the workflows - not a framework.

---

## Step 0 - Bootstrap

1. **Higgsfield CLI** on `$PATH` (install per the `higgsfield-generate` skill). Confirm auth
   (`higgsfield workspace list`) and enough credits: a lean run is `N` image gens + `N` Kling
   legs (~22 credits/leg at `--mode pro`, 10s) + a ~20-30% re-roll buffer.
2. **ffmpeg / ffprobe** on `$PATH` (frame extraction, encoding, SSIM).
3. **GSAP + ScrollTrigger** - loaded from CDN in the page (`index-template.html`); no build step.
4. **A local static server + screenshotter** for QA - `scripts/serve.mjs` (port 3100) and
   `scripts/screenshot.mjs` (Puppeteer) are included.

---

## Step 1 - Plan the flight

Ask the subject as an **open question** ("What should this world be about?") - never a canned
multiple-choice. Then lock:

- **The journey**: an ordered list of scenes the camera flies through. Each scene = one still +
  one leg. The camera follows a **moving subject** (a ball, a product, a character, a vehicle)
  that is struck/sent from scene `i` and lands in scene `i+1`. The last scene is the payoff +
  CTA.
- **Budget**: scene count drives cost. Lean = 4 scenes (4 stills + 4 legs). Each extra scene is
  ~1 still + ~1 leg + re-roll buffer. Fewer, well-chosen beats read as a complete world - give
  each scene more scroll distance (`scroll: 1.6-2.0`) rather than adding beats.
- **Copy**: write it with the **copy panel** workflow ([workflows.md](references/workflows.md)) -
  titles must be 2-5 words (they animate word-by-word in huge type), bodies one grounded
  sentence, no fabricated facts.

Get an explicit spend go-ahead before generating. The only further gates are the anchor-still
approval (Step 2) and the render review (Step 3).

---

## Step 2 - Scene stills (anchor-gated)

One still per scene, all sharing a style preamble. Default model `gpt_image_2` (16:9, 2k).
**Generate ONE anchor still first, get it approved, THEN batch the rest** with the anchor as
`--image` style-lock. A style miss on the anchor costs 1 gen; after a cold batch it costs N.
Full commands in [pipeline.md](references/pipeline.md).

Likeness/NSFW note: Higgsfield applies **output-level** blocks on some real named people. Use
generic descriptors, or a user-supplied image submitted through the platform's own filter (which
arbitrates). **Never bypass or circumvent likeness/NSFW protections** - no face-swap, no filter
evasion. Back-shots and wide shots pass more often. See [prompts.md](references/prompts.md).

---

## Step 3 - Still-to-still camera legs (the core method)

Render each leg on **Kling 3.0**, pinned at both ends to approved stills:

```bash
higgsfield generate create kling3_0 \
  --prompt "$(cat leg_i.txt)" \
  --start-image still_i.png --end-image still_{i+1}.png \
  --mode pro --sound off --aspect_ratio 16:9 --duration 10 \
  --wait --wait-timeout 25m --json
```

The prompt whips the camera into a tight **subject-POV chase** at the kick, follows the object
through a connective space, and lands exactly on the next still (`prompts.md`). The final leg
has a **start image only** (no end) - a slow settle on the payoff.

Because both endpoints are pinned to approved stills, **the legs are independent** - launch all
of them in **parallel** (background), not sequentially. This is the big win over prompt-only
chaining: ~1 render cycle instead of N, frame-perfect seams, and zero cross-scene ghosting.
Re-roll any single leg that trips the content filter; never restart the batch.

Verify each leg's mid-frame matches its approved stills before encoding.

---

## Step 4 - Encode, seam gate, posters, mobile tier

Per [pipeline.md](references/pipeline.md):

- **Encode** each leg: `scale=1920:1080`, `unsharp`, `crf 20`, `-g 8`, `+faststart`, `-an`.
  Kling returns odd widths (1912/1916) - always normalize to 1920x1080.
- **Frame-match tail-trim** so each clip ENDS exactly on the next clip's first frame, then run
  the **SSIM seam gate** (>= 0.90 pass; 0.75-0.90 eyeball - the crossfade `0.08` covers cloud/
  confetti metric noise).
- **Posters** from each ENCODED clip's first frame (so the still->video swap is pixel-identical).
- **720p mobile tier** (`-g 4`, ~40-55% smaller) wired as `clipMobile`/`posterMobile` - kept as a
  **save-data / slow-network fallback only**. By default every device (incl. high-DPI phones) gets
  the full-res 1080p master for clarity; the engine drops to the mobile tier only on `save-data` or
  2-3G. Still generate it.

---

## Step 5 - Assemble the page

Copy `references/scrub-engine.js` + `references/gsap-copy.js` next to a page built from
`references/index-template.html`. The contract:

- Engine mounts with **`copy:false`**; it scrubs the video and fires a **`sw:layout`** event with
  each section's px scroll range.
- `mountCopyLayer(container, { sections })` is called **first** (so its listener is ready), then
  `mountScrollWorld(container, { copy:false, sections, ... })`.
- Copy data (eyebrow/title/body/tags/CTA/accent) lives in one `COPY` array; engine config carries
  only visual/asset props (still/poster/clip + mobile variants, accent, scroll, linger).
- **Per-scene copy placement.** Give each `COPY` entry a `pos:{ h:'left'|'right', v:'top'|'upper'|'mid' }`
  so the words sit BESIDE that scene's subject (in the open half of the frame), biased high, and
  alternate sides as the subject moves. There is **no dark panel** behind the copy - legibility is a
  text-shadow on the glyphs, so the film stays fully visible; don't add a scrim back. On phones the
  anchor auto-varies per scene and every block (finale title + CTAs included) stays **above the fold**
  (down to 375x667 and landscape); that mobile headroom rule keys off `id:"finale"` on the last scene.
- Put a plain-markup `data-sw-seo` block inside the container for crawlers/no-JS (the hero title
  as `h1`, one `h2`+`p` per scene). The engine hides it on mount.

The copy-timing behaviour (word reveals leading the subject, hero intro, **finale CTA visibility-
gating** so links are never focusable/tappable while scrolled away, reduced-motion envelope) is
documented in [gsap-timing.md](references/gsap-timing.md).

---

## Step 6 - Copy (agent workflow)

Run the **copy panel** ([workflows.md](references/workflows.md)): N diverse copywriters draft the
full set in parallel, a director synthesizes the best coherent arc. Enforce hard constraints
(exact CTA text, no fabricated facts, 2-5 word titles). The five titles should read as one
sentence - in the reference build: "Struck Skyward -> It Falls to Kane -> Over the Wall -> Home
to Messi -> Four Chase One".

---

## Step 7 - QA

1. **Adversarial QA workflow** ([workflows.md](references/workflows.md)): one reviewer per
   dimension (accessibility, motion/perf, copy, mobile, markup), then each finding is
   adversarially **verified** (default to false-positive if uncertain) and only confirmed ones
   are kept. Apply the fixes.
2. **Browser QA**: `node scripts/serve.mjs`, then screenshot the hero, each seam (down + up), the
   finale CTA, and a phone viewport. Confirm: first paint shows the poster (no pop into video),
   words land right before each subject arrives, the finale CTA is hidden until the finale and
   visible there, zero console errors.

---

## Step 8 - Deploy

Static host (Vercel, Netlify, any). Keep the engine, copy layer, index page, and `assets/`
together. On Vercel: `vercel deploy --prod`. Ignore dev-only files (screenshots, serve/
screenshot scripts, node_modules).

---

## Reference index

- [pipeline.md](references/pipeline.md) - stills -> still-to-still Kling legs -> encode + tail-trim
  + SSIM seam gate + posters + 720p mobile tier, with exact commands.
- [gsap-timing.md](references/gsap-timing.md) - the copy-timing contract: `sw:layout`, the lead
  offset, per-section phases, finale gating, reduced-motion.
- [prompts.md](references/prompts.md) - the still-to-still subject-POV leg prompt shape + the
  likeness/NSFW guidance.
- [workflows.md](references/workflows.md) - the copy-panel and adversarial-QA agent workflows.
- [index-template.html](references/index-template.html) - a generalized, parametrized page.
- [example-worldcup.md](references/example-worldcup.md) - the World Cup reference build, annotated.
- `references/scrub-engine.js` - the scroll-scrub engine (`copy:false` + `sw:layout`).
- `references/gsap-copy.js` - the GSAP kinetic-copy layer.
- `scripts/serve.mjs`, `scripts/screenshot.mjs` - local QA helpers (port 3100, Puppeteer).

## Gotchas

- **One video model for the whole chain.** Mixing renderers mid-chain keeps position continuity
  but the render-character shift reads as a pop.
- **Never combine GSAP y-transforms with CSS `translate` on the same element** - let one own the
  transform (the copy layer uses `clearProps:'transform'` before rebuilding).
- **Re-fire on resize.** The engine re-fires `sw:layout` on relayout; the copy layer kills and
  rebuilds its ScrollTriggers each time - keep that (don't cache stale px ranges).
- **Full-res everywhere; mobile tier = fallback.** Phones get the 1080p master by default (the 720p
  `-m` tier loads only on save-data / slow networks). The tiers only change which files load; the
  animation + full scroll are identical.
- **Kling specifics:** `--sound off` required; no `--resolution`; `--mode pro` = 1080p; outputs
  need normalizing to 1920x1080.
