# scroll-cinema

**A Claude skill for building cinematic, scroll-scrubbed landing pages** - where scroll drives a
camera through AI-generated video and the headlines animate word-by-word in lockstep with the
footage. Like an Apple scroll-through product page, but the film is generated (Higgsfield / Kling
3.0) and the copy is choreographed to the camera.

### See it first

**Live demo:** https://fanacrack-demo-sites.vercel.app/worldcup/

That page ("The Final Four") is the reference build: one ball's POV flight across the four World
Cup 2026 semifinalists to the trophy. Scroll it - notice how each headline lands *right before*
the ball reaches the next player. That is the whole idea.

---

## What this skill gives you

A repeatable pipeline for the whole thing, plus the two reusable engines that power it:

1. **Still-to-still frame pinning.** Every camera leg is pinned at BOTH ends to an approved still
   (`--start-image still_i`, `--end-image still_{i+1}`). Seams are frame-perfect *by construction*,
   legs are independent so they render in **parallel**, and there is no cross-scene ghosting.
2. **A GSAP kinetic-copy layer.** The scrub engine hands its text layer to `gsap-copy.js`, which
   drives word-by-word title reveals, eyebrow/body/tags and the CTA - all scrubbed 1:1 with the
   video, and timed so **the copy leads the ball**.
3. **Quality workflows.** A multi-agent copy panel (diverse drafts to synthesis) and an adversarial
   QA pass (review then verify each finding) so what you ship is tight.
4. **Copy that sits beside the subject.** Each scene places its headline in the open half of the frame
   next to the moving subject (`pos:{h,v}`, biased high, alternating sides), over **fully-visible
   footage** - no dark box; legibility is a text-shadow on the glyphs. Phones get the full-res 1080p
   master, and every block (finale CTAs included) stays above the fold.

Both engines are self-contained vanilla JS (no framework, no build step) - they drop into plain
HTML, Next.js, Vue, anything.

---

## What's inside

```
scroll-cinema/
  SKILL.md                     # the skill entry point - read this first
  references/
    scrub-engine.js            # the scroll-scrub camera engine (copy:false + sw:layout)
    gsap-copy.js               # the GSAP kinetic-copy layer (word reveals, finale gating)
    index-template.html        # a generalized, parametrized page to fill in
    pipeline.md                # stills -> still-to-still Kling legs -> encode -> seam gate -> mobile tier
    gsap-timing.md             # the copy-timing contract ("the copy leads the ball")
    prompts.md                 # the subject-POV leg prompt shape + likeness/NSFW rules
    workflows.md               # the copy-panel + adversarial-QA agent workflows
    example-worldcup.md        # the World Cup build, annotated - study this to build your own
  scripts/
    serve.mjs                  # zero-dep static server on :3100 (for local QA)
    screenshot.mjs             # Puppeteer screenshotter (for local QA)
```

---

## Install

Drop the skill into your Claude skills directory:

```bash
# clone straight into your user skills folder
git clone https://github.com/nextgentrainingacademy88-max/scroll-cinema.git \
  ~/.claude/skills/scroll-cinema
```

or clone anywhere and copy the folder into `~/.claude/skills/`. Restart Claude Code and invoke it
with `/scroll-cinema`, or just say "build me a scroll-cinema landing page about &lt;your idea&gt;".

You will also need the `higgsfield` CLI (for image/video generation) and `ffmpeg` on your PATH.
See `SKILL.md` Step 0.

---

## How it works, in one paragraph

You write N scene stills (anchor-gated so they are a matched set), render one Kling 3.0 leg per
scene pinned start+end to consecutive stills (so they render in parallel with frame-tight seams),
encode them GOP-8 for smooth scrubbing, trim each clip to land exactly on the next clip's first
frame, and assemble the page with the scrub engine + the GSAP copy layer. The engine scrubs the
video by scroll position; the copy layer reads the engine's per-section scroll ranges and reveals
each headline in the previous clip's tail, so the words arrive with the camera. Full method in
`SKILL.md`.

---

## Credits

Built by [Edison Chua](https://nextgentrainingacademy.com) / NextGen Training Academy with Claude.
Descendant of the `scroll-world` technique, extended with still-to-still rendering, a GSAP
kinetic-copy layer, and agent workflows.

If you build something with it, tag it - I would love to see it.

## License

MIT - see [LICENSE](LICENSE). Use it, remix it, ship it.
