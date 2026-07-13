/* ============================================================================
   scroll-world · GSAP copy layer
   ----------------------------------------------------------------------------
   A drop-in, self-contained kinetic-type layer for the scroll-world scrub engine.
   The engine (scrub-engine.js) is told `copy:false`, so it builds and drives NO
   text — it just scrubs the video AND fires a `sw:layout` CustomEvent carrying each
   section's exact scroll range (px). This module listens for that event and drives
   every text element with GSAP ScrollTrigger, so the WORDS, eyebrow, number, body,
   tags and CTA all animate on scroll in lockstep with the video — not just the film.

   USAGE
     mountCopyLayer(document.getElementById('world'), {
       sections: [
         { id:'france', accent:'#4D7CFF', eyebrow:'…', title:'Four nations. One ball.',
           body:'…', tags:['…'], cta:{ primary:{label,href}, secondary:{label,href} } },
         …                         // same ids/order as the engine config
       ],
     });
     // then mountScrollWorld(el, { …, copy:false });  // engine fires sw:layout on mount + resize

   Requires GSAP + ScrollTrigger loaded first (window.gsap, window.ScrollTrigger).
   Respects prefers-reduced-motion (no splits, no scrub — a clean fade envelope).
   ========================================================================== */

function mountCopyLayer(container, cfg) {
  const SECTIONS = (cfg && cfg.sections) || [];
  const N = SECTIONS.length;
  if (!N) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  injectCopyCSS();

  // ---- build DOM: a fixed overlay with one article per section ----
  const layer = document.createElement('div');
  layer.className = 'wc-copylayer';
  const scrim = document.createElement('div'); scrim.className = 'wc-scrim'; layer.appendChild(scrim);

  const blocks = SECTIONS.map((s, i) => {
    const art = document.createElement('article');
    art.className = 'wc-copy';
    art.dataset.id = s.id || ('s' + i);
    art.style.setProperty('--wc-accent', s.accent || '#4D7CFF');
    art.innerHTML =
      `<span class="wc-num">${pad(i + 1)} <i>/</i> ${pad(N)}</span>` +
      (s.eyebrow ? `<span class="wc-eyebrow">${esc(s.eyebrow)}</span>` : '') +
      (s.title ? `<${i === 0 ? 'h1' : 'h2'} class="wc-title">${splitWords(s.title)}</${i === 0 ? 'h1' : 'h2'}>` : '') +
      (s.body ? `<p class="wc-body">${esc(s.body)}</p>` : '') +
      (s.tags && s.tags.length ? `<ul class="wc-tags">${s.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
      (s.cta ? `<div class="wc-cta">${ctaBtns(s.cta)}</div>` : '');
    layer.appendChild(art);
    return art;
  });
  container.appendChild(layer);

  const gsap = window.gsap, ST = window.ScrollTrigger;
  // No-GSAP fallback (CDN blocked/slow): show only the hero, not five stacked blocks.
  if (!gsap || !ST) { blocks.forEach((b, i) => { b.style.opacity = i === 0 ? '1' : '0'; }); return; }
  gsap.registerPlugin(ST);

  // pre-state so nothing flashes before the first ScrollTrigger build
  blocks.forEach((b, i) => {
    const first = i === 0;
    gsap.set(b, { autoAlpha: first ? 1 : 0 });
    if (!reduce && !first) gsap.set(b.querySelectorAll('.wc-w'), { yPercent: 118, opacity: 0, rotateX: -42 });
  });

  let triggers = [];
  function build(detail) {
    triggers.forEach(t => t.kill());
    triggers = [];
    const range = {};
    (detail.sections || []).forEach(r => { range[r.id] = r; });

    SECTIONS.forEach((s, i) => {
      const r = range[s.id];
      const b = blocks[i];
      if (!r || r.end <= r.start) return;
      const first = i === 0, last = i === N - 1;
      const words = b.querySelectorAll('.wc-w');
      const meta = [b.querySelector('.wc-num'), b.querySelector('.wc-eyebrow')].filter(Boolean);
      const rest = [b.querySelector('.wc-body'), ...b.querySelectorAll('.wc-tags li'), b.querySelector('.wc-cta')].filter(Boolean);

      // Timing geometry: start each section's copy trigger LEAD viewport-heights
      // BEFORE its own clip begins, i.e. in the tail of the previous clip. That is
      // exactly when the ball is arriving at THIS section's player, so the words land
      // right before the ball hits. `atStart` = the progress where this clip formally
      // begins (player on screen); we finish the reveal just before it.
      const V = detail.vh || window.innerHeight;
      const LEAD = first ? 0 : 0.28 * V;
      const stStart = Math.max(0, r.start - LEAD);
      const span = Math.max(1, r.end - stStart);
      const atStart = (r.start - stStart) / span;

      // ---- reduced motion: a plain opacity envelope, no transforms, no scrub ----
      if (reduce) {
        gsap.set(b, { clearProps: 'transform' });
        triggers.push(ST.create({
          start: stStart, end: r.end,
          onUpdate: self => {
            const p = self.progress, up = Math.max(0.06, atStart);
            let o;
            if (first) o = 1 - clamp((p - 0.5) / 0.32);
            else if (last) o = clamp(p / up);
            else o = Math.min(clamp(p / up), 1 - clamp((p - 0.64) / 0.2));
            gsap.set(b, { autoAlpha: clamp(o) });
          },
        }));
        return;
      }

      // ---- kinetic timeline, scrubbed 1:1 across [stStart, r.end] ----
      // Finale starts hidden (autoAlpha:0) and is only revealed inside its own range,
      // so its CTA links are never focusable / tappable while scrolled away.
      gsap.set(b, { autoAlpha: last ? 0 : 1, clearProps: 'transform' });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { start: stStart, end: r.end, scrub: true },
      });
      tl.to({}, { duration: 1 }, 0);                          // lock total duration = 1
      tl.fromTo(b, { yPercent: first ? 0 : 6 }, { yPercent: -8, duration: 1 }, 0); // whole-block parallax drift
      if (last) tl.to(b, { autoAlpha: 1, immediateRender: false, duration: 0.01 }, 0); // reveal finale as it enters

      if (!first) {
        // Fast, front-loaded reveal that completes just before the ball lands (atStart).
        const inEnd = Math.max(0.12, atStart * 0.9);
        const inStart = Math.max(0, inEnd - 0.14);
        const inDur = inEnd - inStart;
        tl.fromTo(words, { yPercent: 118, opacity: 0, rotateX: -42 },
          { yPercent: 0, opacity: 1, rotateX: 0, stagger: inDur * 0.34, ease: 'power3.out', duration: inDur }, inStart);
        tl.fromTo(meta, { y: 24, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.04, ease: 'power2.out', duration: inDur * 0.8 }, inStart + 0.01);
        tl.fromTo(rest, { y: 20, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.04, ease: 'power2.out', duration: 0.12 }, inEnd - 0.03);
      }
      if (!last) {
        // Leave quickly, before the ball departs toward the next player.
        const outStart = first ? 0.5 : 0.62, outDur = 0.22;
        tl.fromTo(words, { yPercent: 0, opacity: 1, rotateX: 0 },
          { yPercent: -96, opacity: 0, rotateX: 24, stagger: 0.02, ease: 'power2.in', duration: outDur, immediateRender: false }, outStart);
        tl.fromTo([...meta, ...rest], { y: 0, opacity: 1 },
          { y: -22, opacity: 0, ease: 'power2.in', duration: outDur, immediateRender: false }, outStart);
      }
      triggers.push(tl.scrollTrigger);
    });

    // hero (first) intro: one-time word rise on load, then the scrub above owns the exit
    if (!reduce && !container._wcIntroDone) {
      container._wcIntroDone = true;
      const hero = blocks[0];
      gsap.from(hero.querySelectorAll('.wc-w'),
        { yPercent: 120, opacity: 0, rotateX: -45, stagger: 0.06, duration: 0.9, ease: 'power3.out', delay: 0.15 });
      gsap.from([hero.querySelector('.wc-num'), hero.querySelector('.wc-eyebrow'), hero.querySelector('.wc-body'), ...hero.querySelectorAll('.wc-tags li')].filter(Boolean),
        { y: 24, opacity: 0, stagger: 0.07, duration: 0.7, ease: 'power2.out', delay: 0.1 });
    }
  }

  container.addEventListener('sw:layout', e => build(e.detail));

  // ---- helpers ----
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(x) { return String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function splitWords(title) {
    return String(title).trim().split(/\s+/).map(w =>
      `<span class="wc-wmask"><span class="wc-w">${esc(w)}</span></span>`).join(' ');
  }
  function ctaBtns(cta) {
    let h = '';
    if (cta.primary) h += `<a class="wc-btn wc-btn--primary" href="${esc(cta.primary.href || '#')}"${cta.primary.notrack ? ' data-notrack' : ''}>${esc(cta.primary.label)}</a>`;
    if (cta.secondary) h += `<a class="wc-btn wc-btn--ghost" href="${esc(cta.secondary.href || '#')}">${esc(cta.secondary.label)}</a>`;
    return h;
  }
  function clamp(x, a = 0, b = 1) { return Math.min(b, Math.max(a, x)); }
}

function injectCopyCSS() {
  if (document.getElementById('wc-css')) return;
  const css = `
  .wc-copylayer{position:fixed;inset:0;z-index:22;pointer-events:none;}
  .wc-scrim{position:absolute;inset:0;width:min(66vw,940px);
    background:linear-gradient(90deg,color-mix(in srgb,var(--sw-bg,#0A0E16) 96%,transparent) 0%,
      color-mix(in srgb,var(--sw-bg,#0A0E16) 82%,transparent) 34%,
      color-mix(in srgb,var(--sw-bg,#0A0E16) 46%,transparent) 66%,transparent 100%);}
  .wc-copy{position:absolute;left:clamp(20px,5.2vw,72px);top:50%;transform:translateY(-50%);
    width:min(48vw,620px);max-width:620px;transform-origin:left center;}
  .wc-num{display:inline-flex;align-items:center;gap:.4em;font-family:ui-monospace,"SF Mono",Menlo,monospace;
    font-size:.82rem;letter-spacing:.28em;color:var(--sw-ink-soft,#97A3B6);}
  .wc-num i{font-style:normal;opacity:.5;}
  .wc-eyebrow{display:block;margin-top:20px;font-family:var(--sw-font-body,Inter),system-ui,sans-serif;
    font-weight:700;font-size:.82rem;letter-spacing:.34em;text-transform:uppercase;
    color:var(--wc-accent,#4D7CFF);}
  .wc-title{margin:14px 0 0;font-family:var(--sw-font-display,"Anton"),Impact,sans-serif;font-weight:400;
    text-transform:uppercase;color:var(--sw-ink,#F2F5F9);
    font-size:clamp(3rem,7.6vw,7.6rem);line-height:.9;letter-spacing:-.006em;
    text-shadow:0 6px 40px color-mix(in srgb,var(--sw-bg,#0A0E16) 62%,transparent);}
  .wc-wmask{display:inline-block;overflow:hidden;vertical-align:top;padding:0 .015em;}
  .wc-w{display:inline-block;will-change:transform,opacity;}
  .wc-body{margin-top:22px;font-family:var(--sw-font-body,Inter),system-ui,sans-serif;
    font-size:clamp(1.05rem,1.35vw,1.28rem);line-height:1.5;max-width:34ch;
    color:color-mix(in srgb,var(--sw-ink,#F2F5F9) 84%,var(--sw-ink-soft,#97A3B6));
    text-shadow:0 1px 16px color-mix(in srgb,var(--sw-bg,#0A0E16) 88%,transparent);}
  .wc-tags{list-style:none;display:flex;flex-wrap:wrap;gap:9px;margin:26px 0 0;padding:0;}
  .wc-tags li{font-family:var(--sw-font-body,Inter),system-ui,sans-serif;font-size:.84rem;font-weight:600;
    color:color-mix(in srgb,var(--wc-accent,#4D7CFF) 45%,#fff);padding:8px 15px;border-radius:999px;
    background:color-mix(in srgb,var(--sw-bg,#0A0E16) 60%,transparent);
    border:1px solid color-mix(in srgb,var(--wc-accent,#4D7CFF) 55%,transparent);
    text-shadow:0 1px 10px color-mix(in srgb,var(--sw-bg,#0A0E16) 85%,transparent);
    backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
  .wc-cta{display:flex;flex-wrap:wrap;gap:14px;margin-top:32px;pointer-events:auto;}
  .wc-btn{font-family:var(--sw-font-body,Inter),system-ui,sans-serif;text-decoration:none;font-weight:700;
    font-size:1rem;padding:16px 30px;border-radius:999px;letter-spacing:.01em;min-height:48px;
    display:inline-flex;align-items:center;transition:transform .22s ease,box-shadow .22s ease,background .22s ease;}
  .wc-btn--primary{color:#0A0E16;background:var(--wc-accent,#4D7CFF);
    box-shadow:0 10px 34px -8px color-mix(in srgb,var(--wc-accent,#4D7CFF) 70%,transparent);}
  .wc-btn--primary:hover{transform:translateY(-3px);box-shadow:0 16px 42px -8px color-mix(in srgb,var(--wc-accent,#4D7CFF) 85%,transparent);}
  .wc-btn--primary:active{transform:translateY(-1px);}
  .wc-btn--ghost{color:var(--sw-ink,#F2F5F9);border:1.5px solid color-mix(in srgb,var(--sw-ink,#F2F5F9) 34%,transparent);
    background:color-mix(in srgb,var(--sw-bg,#0A0E16) 30%,transparent);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
  .wc-btn--ghost:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--sw-ink,#F2F5F9) 60%,transparent);}
  .wc-btn:focus-visible{outline:3px solid color-mix(in srgb,var(--wc-accent,#4D7CFF) 80%,#fff);outline-offset:3px;}
  @media (max-width:860px){
    .wc-scrim{width:100%;height:66%;top:auto;bottom:0;
      background:linear-gradient(0deg,var(--sw-bg,#0A0E16) 6%,color-mix(in srgb,var(--sw-bg,#0A0E16) 74%,transparent) 44%,transparent 100%);}
    .wc-copy{left:clamp(18px,6vw,40px);right:clamp(18px,6vw,40px);top:auto;bottom:clamp(60px,13vh,120px);
      transform:none;width:auto;max-width:none;}
    .wc-copy{bottom:calc(clamp(54px,12dvh,110px) + env(safe-area-inset-bottom));}
    .wc-title{font-size:clamp(2.6rem,12vw,4.4rem);line-height:.92;}
    .wc-body{max-width:none;font-size:clamp(1rem,4vw,1.14rem);}
    .wc-cta{gap:10px;}.wc-btn{font-size:.95rem;padding:15px 24px;}
  }
  /* Short phones (and landscape): the finale is the tallest block; keep it inside the scrim. */
  @media (max-width:860px) and (max-height:730px){
    .wc-copy{bottom:calc(clamp(36px,7dvh,64px) + env(safe-area-inset-bottom));}
    .wc-title{font-size:clamp(2.1rem,9.5vw,3.2rem);}
    .wc-body{font-size:clamp(.92rem,3.4vw,1.02rem);margin-top:12px;}
    .wc-tags{margin-top:14px;}.wc-cta{margin-top:18px;}
    .wc-num{font-size:.74rem;}
  }
  @media (prefers-reduced-motion:reduce){
    .wc-w{transform:none!important;opacity:1!important;}
  }
  `;
  const style = document.createElement('style');
  style.id = 'wc-css';
  style.textContent = '@layer wc {\n' + css + '\n}';
  document.head.appendChild(style);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { mountCopyLayer };
if (typeof window !== 'undefined') window.mountCopyLayer = mountCopyLayer;
