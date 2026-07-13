# Multi-agent workflows

Two `Workflow()` scripts raise page quality before ship: a **copy panel** (diverse
drafts -> one synthesized arc) and an **adversarial QA pass** (per-dimension review ->
per-finding verification). Both run on the workflow runner, which injects these
primitives into scope:

| primitive | signature | notes |
|---|---|---|
| `meta` | `export const meta = { name, description, phases }` | UI/labeling; `phases` is display order |
| `phase(title)` | `phase('Draft')` | marks the current phase for the runner; call before the work of that phase |
| `agent(prompt, opts)` | `await agent(str, { label, phase, schema })` | one sub-agent call; resolves to JSON validated against `schema` (or `null` on failure) |
| `parallel(thunks)` | `await parallel([() => agent(...), ...])` | runs an array of **thunks** (zero-arg fns) concurrently, resolves to an array |
| `pipeline(items, stage1, stage2)` | see QA below | maps each item through `stage1`, then `stage2`; per-item stages run concurrently across items |

`schema` is standard JSON Schema with `additionalProperties: false` and `required`;
the agent must return conforming JSON. Filter `null`s (`.filter(Boolean)`) since a
failed/blocked agent resolves to `null`. The script's `return` value is the workflow
result the orchestrator reads.

---

## A. Copy panel: N drafters -> 1 director synthesis

**Pattern.** Fan out `N` copywriters in parallel, each given the **same brief** but a
**distinct voice**, each returning the full section set. Then one director agent
synthesizes a single coherent arc, free to mix across drafts or rewrite. Diversity in
phase 1 widens the search space; synthesis in phase 2 collapses it to one voice.

**When to use.** Any all-at-once copy deck where sections must read as one arc (a
scroll page, a landing hero sequence), and where a single first draft tends to be
locally-good but globally-flat. Overkill for a one-liner.

**Hard constraints go in BOTH the brief and the synthesis prompt** (belt and braces),
and are re-encoded in the schema where possible:
- **Exact CTA** verbatim (including punctuation) - stated as a MUST in both prompts.
- **No fabricated facts** - no invented stats/scores/quotes/results; "keep it true".
- **Titles sized for huge word-by-word type** - 2-5 words, "every word must earn its
  place", because the GSAP copy layer splits each title into per-word masked spans.

### Skeleton

```js
export const meta = {
  name: 'copy-panel',
  description: 'Draft N diverse copy sets in parallel, then synthesize the best coherent arc',
  phases: [{ title: 'Draft' }, { title: 'Synthesize' }],
}

// The exact in-world facts + structure every writer must respect. Keep it factual;
// spell out the scenes in scroll order, the timing, and the HARD constraints.
const BRIEF = `
PRODUCT: <one-line what this scroll page is; note it is a DEMO / unofficial if so>.
THE SCENES (in scroll order, copy must read as ONE continuous arc):
1. id=<slug> - <who/where/what happens, the camera/subject action>
... one block per scene ...
STRUCTURE each scene needs:
- eyebrow: SHORT uppercase kicker (2-5 words).
- title:   BIG headline, 2-5 words, splits into 1-2 lines, animates WORD-BY-WORD -
           every word must land.
- body:    1 short sentence (<= ~18 words), present tense, grounded (no invented facts).
- tags:    1-2 tiny pill chips.
HARD CTA: the finale primary CTA label MUST be EXACTLY "<verbatim label incl. period>".
VOICE: <the overall tone>. Do NOT fabricate stats/quotes/results.
`

const SECTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    id:      { type: 'string', enum: ['<slug1>', '<slug2>', '<slugN>'] },
    eyebrow: { type: 'string' },
    title:   { type: 'string' },
    body:    { type: 'string' },
    tags:    { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 },
  },
  required: ['id', 'eyebrow', 'title', 'body', 'tags'],
}
const CTA_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { primaryLabel: { type: 'string' }, secondaryLabel: { type: 'string' } },
  required: ['primaryLabel', 'secondaryLabel'],
}
const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    voice: { type: 'string' },
    sections: { type: 'array', items: SECTION_SCHEMA, minItems: 5, maxItems: 5 },
    finaleCta: CTA_SCHEMA,
    rationale: { type: 'string' },
  },
  required: ['voice', 'sections', 'finaleCta', 'rationale'],
}
const FINAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    sections: { type: 'array', items: SECTION_SCHEMA, minItems: 5, maxItems: 5 },
    finaleCta: CTA_SCHEMA,
    // plain-prose crawlable fallback: one paragraph per scene, in order, no markup
    seoParagraphs: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 6 },
    arcNote: { type: 'string' },  // how the titles read as one arc
    qaNote:  { type: 'string' },  // confirm CTA exact, nothing fabricated, narrative flows
  },
  required: ['sections', 'finaleCta', 'seoParagraphs', 'arcNote', 'qaNote'],
}

// Distinct voices = distinct search directions. 3 is a good default.
const VOICES = [
  { key: 'broadcast', dir: 'BROADCAST POETRY - cinematic promo VO, short present-tense lines, muscular verbs.' },
  { key: 'literary',  dir: 'LITERARY & HUMAN - quieter, evocative, restraint over hype, let white space breathe.' },
  { key: 'kinetic',   dir: 'KINETIC MODERN - bold staccato fragments, striking two-word titles, hype-film energy, never cheesy.' },
]

phase('Draft')
const drafts = await parallel(VOICES.map(v => () =>
  agent(
    `You are an elite copywriter. Write the full copy in this voice:\n${v.dir}\n\n${BRIEF}\n\n` +
    `Return all sections in scroll order, the finaleCta (primaryLabel MUST be exactly ` +
    `"<verbatim CTA>"), and a one-line rationale. Titles are HUGE and animate word-by-word - ` +
    `keep them 2-5 words and make every word land.`,
    { label: `draft:${v.key}`, phase: 'Draft', schema: DRAFT_SCHEMA }
  )
)).then(r => r.filter(Boolean))

phase('Synthesize')
const finalCopy = await agent(
  `You are the creative director. Below are ${drafts.length} independent drafts of the same page. ` +
  `Synthesize the SINGLE BEST version: pick the strongest eyebrow/title/body/tags per scene ` +
  `(mix across drafts freely, or rewrite to improve) so the titles read as one continuous arc. ` +
  `Enforce: titles 2-5 words for huge word-by-word type; bodies one short grounded sentence ` +
  `(no invented facts); finaleCta.primaryLabel EXACTLY "<verbatim CTA>"; a sensible secondaryLabel. ` +
  `Also produce seoParagraphs (one plain-prose paragraph per scene, for crawlers/no-JS), an arcNote, ` +
  `and a qaNote confirming the CTA is exact, nothing is fabricated, and the narrative flows.\n\n` +
  `${BRIEF}\n\nDRAFTS:\n${JSON.stringify(drafts, null, 2)}`,
  { label: 'synthesize:final', phase: 'Synthesize', schema: FINAL_SCHEMA }
)

return { drafts, finalCopy }
```

**How to read the results.** Ship `finalCopy.sections` (+ `finaleCta`) into the copy
layer; ship `seoParagraphs` into the `data-sw-seo` crawlable block. Before wiring, spot-check
`finalCopy.qaNote` and independently re-verify the two things models drift on:
`finaleCta.primaryLabel === '<verbatim CTA>'` and no fabricated facts. `arcNote` is
your sanity check that the titles form one story. Keep `drafts` around - if synthesis
picked a weak line you can pull a stronger alternative from a specific voice.

---

## B. Adversarial QA: per-dimension review -> per-finding verify

**Pattern.** Two stages via `pipeline`. **Stage 1 (Review):** one reviewer per QA
dimension, each reading the same files through a single narrow lens, emitting raw
findings. **Stage 2 (Verify):** every raw finding is handed to a fresh adversarial
agent that re-reads the code and rules it REAL or a false positive - **defaulting to
false when uncertain** or when it looks like the reviewer misread intentional design.
Only confirmed findings survive, sorted by severity. The verify stage is what makes the
output trustworthy: narrow reviewers over-report, so a skeptical second pass strips
nitpicks and hallucinated line references.

**When to use.** A pre-ship review of a self-contained build (a few files) where you
want breadth (a11y + perf + copy + mobile + markup) without one generalist reviewer
missing a whole class of issue. The verify gate matters most on **polished demo pages**
where "technically true but not worth fixing" noise wastes review time.

**Key rules baked into the prompts:**
- Give reviewers a `CONTEXT` block listing **known intentional choices (NOT bugs)** so
  they don't report them (e.g. external CDN, no SSR hydration, the exact CTA label,
  editorial use of real names). Also name project-specific bans to flag (e.g. em-dashes).
- Tell reviewers to return an **empty array** when clean on their lens.
- Verifier default is `isReal=false` on any doubt.

### Skeleton

```js
export const meta = {
  name: 'gsap-review',
  description: 'Adversarial multi-dimension review of a scroll page, each finding verified',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const FILES = {
  index:  '<abs>/index.html',
  copy:   '<abs>/gsap-copy.js',
  engine: '<abs>/scrub-engine.js',
}

// Orient the reviewers: architecture in one paragraph + the choices that are NOT bugs.
const CONTEXT = `
<1-paragraph architecture: engine scrubs videos + fires 'sw:layout'; gsap-copy drives text
 word-by-word from that event; index.html wires CDN + mounts>.
Known intentional choices (NOT bugs): <CDN ok / no hydration / exact CTA label + link /
 real names used editorially / ...>. <Project ban, e.g.: em-dashes are banned - flag any "-">.
`

const DIMENSIONS = [
  { key: 'accessibility', lens: 'ACCESSIBILITY (WCAG): contrast over scrim, focus-visible on all interactive els, keyboard operability, aria/labels on icon-only controls, heading order, reduced-motion correctness, touch targets >=44px.' },
  { key: 'motion-perf',   lens: 'MOTION & PERFORMANCE: ScrollTrigger rebuilt cleanly on sw:layout/resize (no leaks/dupes), only transform/opacity animated, fromTo immediateRender flashes at load/seams, hero intro runs once, text not stuck hidden if CDN slow/fails.' },
  { key: 'copy',          lens: 'COPY & FACTUAL COHERENCE: titles read as one arc, no fabricated stats/quotes, eyebrow/body/tags match each scene, SEO block matches visible copy, typos, banned em-dash.' },
  { key: 'mobile',        lens: 'MOBILE ROBUSTNESS: copy layer positions at <=860px (bottom-anchored, safe-area), title clamp sane, CTAs tappable, scrim keeps text legible over bright video, no overflow-x.' },
  { key: 'markup',        lens: 'MARKUP & INTEGRITY: valid HTML, no duplicate IDs, copy escaping, sw:layout event contract matches producer/consumer, no dead config, graceful fallback when window.gsap missing.' },
]

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          severity:   { type: 'string', enum: ['high', 'medium', 'low'] },
          file:       { type: 'string' },
          line:       { type: 'number' },
          issue:      { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'file', 'issue', 'suggestion'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    isReal:   { type: 'boolean' },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason:   { type: 'string' },
  },
  required: ['isReal', 'severity', 'reason'],
}

// pipeline(items, stage1, stage2): each dimension -> raw findings -> verified findings.
const results = await pipeline(
  DIMENSIONS,
  // STAGE 1 - review through ONE lens, tag findings with their dimension
  d => agent(
    `Read these files and review ONLY through this lens:\n${d.lens}\n\n${CONTEXT}\n\n` +
    `Files:\n- index.html: ${FILES.index}\n- gsap-copy.js: ${FILES.copy}\n- scrub-engine.js: ${FILES.engine}\n\n` +
    `Report concrete findings with file + approximate line. Do NOT report the known-intentional ` +
    `choices. If clean on this lens, return an empty findings array.`,
    { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }
  ).then(r => (r && r.findings ? r.findings.map(f => ({ ...f, dim: d.key })) : [])),
  // STAGE 2 - verify each finding adversarially, in parallel
  findings => parallel(findings.map(f => () =>
    agent(
      `Adversarially verify this code-review finding. Read the file and decide if it is a REAL ` +
      `defect worth fixing on a polished page, or a false positive / nitpick. Default to ` +
      `isReal=false if uncertain or if the reviewer misread intentional design.\n\n` +
      `Finding (${f.dim}, ${f.severity}): ${f.issue}\nFile: ${f.file} (~line ${f.line || '?'})\n` +
      `Suggestion: ${f.suggestion}\n\n${CONTEXT}\n\nFiles: ${FILES.index} | ${FILES.copy} | ${FILES.engine}`,
      { label: `verify:${f.dim}:${f.severity}`, phase: 'Verify', schema: VERDICT_SCHEMA }
    ).then(v => ({ ...f, verdict: v }))
  ))
)

const rank = { high: 0, medium: 1, low: 2 }
const confirmed = results.flat().filter(Boolean)
  .filter(f => f.verdict && f.verdict.isReal)
  .sort((a, b) => rank[a.verdict.severity] - rank[b.verdict.severity])

return { confirmed, totalRaw: results.flat().filter(Boolean).length }
```

**How to read the results.** Work `confirmed` top-down: it is already severity-sorted
(high -> low) and each item carries `dim`, `file`, `line`, `issue`, `suggestion`, and the
verifier's `verdict.reason`. The `totalRaw` vs `confirmed.length` gap is your
false-positive rate - a large gap is expected and healthy (it means the verify gate did
its job), not a sign the review was weak. Fix the `high`s, batch the `medium`s, treat
`low`s as optional polish. Note the verifier can **downgrade** severity (its `verdict.severity`
overrides the reviewer's), so trust `verdict.severity` for triage.

### Tuning both workflows

- **Scale N/dimensions to the stakes.** 3 voices and 5 QA lenses are defaults; add a
  voice or a lens (e.g. `seo`, `security`) as needed - each is one array entry.
- **Every constraint that must not drift goes in the schema first, the prompt second.**
  Enums pin ids/severities; `minItems/maxItems` pin section counts; verbatim strings
  (the exact CTA) still need a prompt MUST because schema can't assert string equality.
- **Always `.filter(Boolean)`** after `parallel`/`pipeline` - a blocked or malformed
  agent resolves to `null`.
