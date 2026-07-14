# scroll-cinema asset pipeline

End-to-end build for the scroll-scrubbed camera. You produce, in order: N approved scene
**stills** -> N-1 still-to-still **camera legs** (Kling 3.0) -> **encoded** GOP-8 clips ->
**frame-matched** seams -> **posters** -> a **720p mobile tier**. Legs are independent (both
endpoints pinned to stills), so everything after step 1 fans out in parallel.

Reference build: World Cup 2026 "The Final Four", 5 scenes (`france england spain argentina
finale`), 4 legs, live at https://fanacrack-demo-sites.vercel.app/worldcup/ .

Conventions used below: `N` scenes -> stills `still_1 .. still_N`, legs `leg_1 .. leg_{N-1}`
where leg `i` flies from `still_i` to `still_{i+1}`. `ffmpeg`/`ffprobe` assumed on PATH (ref
machine: `C:/Users/ediso/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe`). All video is
16:9 1920x1080, 24 fps.

---

## 1. Scene stills - anchor-gated GPT Image 2

Generate the first still as the **anchor** and get it approved before batching the rest. Every
later still passes the anchor as `--image` so palette, lighting, grade, and world style stay
locked across scenes. This is what makes the still-to-still legs coherent - the stills are
already a matched set.

The CLI has no `-o` flag: it prints the result URL. Run with `--wait --json`, then `curl` the
URL down. A tiny helper (reused throughout this doc):

```bash
# geturl: pull the result URL out of a `--wait --json` response so you can curl it
geturl() { python -c "import json,sys;print(json.load(open(sys.argv[1]))[0]['result_url'])" "$1"; }
```

Anchor (scene 1), then STOP and approve:

```bash
higgsfield generate create gpt_image_2 \
  --prompt "isometric diorama stadium exterior, dusk, teal+gold grade, volumetric haze, <scene 1 desc>" \
  --aspect_ratio 16:9 --resolution 2k --quality high --wait --json > still_1.json
curl -sL "$(geturl still_1.json)" -o still_1.png
```

Once `still_1.png` is signed off, batch scenes `2..N`, each anchored to it:

```bash
for i in 2 3 4 5; do
  ( higgsfield generate create gpt_image_2 \
      --prompt "$(cat prompts/still_${i}.txt)" \
      --image still_1.png \
      --aspect_ratio 16:9 --resolution 2k --quality high --wait --json > still_${i}.json
    curl -sL "$(geturl still_${i}.json)" -o still_${i}.png ) &
done
wait
```

Notes:
- `--image anchor.png` is the style/consistency reference, not a hard composition lock - keep each scene's prompt describing its own subject and camera framing.
- 2k + `--quality high` because these are re-used as the pinned Kling endpoints AND as poster fallbacks; do not downscale here.
- Reject and regen any still whose grade drifts from the anchor before spending Kling credits on it - a bad still poisons two legs (the one landing on it and the one leaving it).

---

## 2. Still-to-still camera legs - Kling 3.0, in PARALLEL

Each leg is pinned start+end to two approved stills, so the ball/subject-POV camera leaves
scene `i` exactly as `still_i` and **lands frame-perfect** on `still_{i+1}`. Because both
endpoints are fixed, legs share no state - render all of them at once (detached / `&`), no
chaining. This is the core upgrade over prompt-only chaining (no Eiffel-tower ghosting / drift).

Leg prompt files (`leg_1.txt ..`) describe the MOTION between the two pinned stills: the subject
acts in scene `i`, the camera whips into a tight subject-POV chase through the connective space,
and the subject lands exactly on `still_{i+1}`. The stills fix the endpoints; the prompt drives
the flight between them. See [prompts.md](prompts.md) for the exact template.

```bash
for i in 1 2 3 4; do
  j=$((i+1))
  ( higgsfield generate create kling3_0 \
      --prompt "$(cat leg_${i}.txt)" \
      --start-image still_${i}.png --end-image still_${j}.png \
      --mode pro --sound off --aspect_ratio 16:9 --duration 10 \
      --wait --wait-timeout 25m --json > leg_${i}.json
    curl -sL "$(geturl leg_${i}.json)" -o leg_${i}.mp4 ) &
done
wait
```

Finale leg: **start image only, no `--end-image`** (nothing to land on - let it fly out/hold):

```bash
higgsfield generate create kling3_0 \
  --prompt "$(cat leg_finale.txt)" \
  --start-image still_N.png \
  --mode pro --sound off --aspect_ratio 16:9 --duration 10 \
  --wait --wait-timeout 25m --json > leg_finale.json
curl -sL "$(geturl leg_finale.json)" -o leg_finale.mp4
```

Cost / timing: `--mode pro` 10s leg is **~22 credits/leg**. `--wait-timeout 25m` because pro
queues deep under load. Capture the `--json` so you keep the generation id for re-reveal
(`higgsfield ... show_generations`) if a `--wait` drops.

---

## 3. Encode each leg - GOP-8 scrub master

Scroll-scrubbing seeks to arbitrary frames, so the master needs a **tiny keyframe interval**
(`-g 8 -keyint_min 8 -sc_threshold 0`) or scrubbing stutters as the decoder walks long GOPs.
`-t TRIM` is filled in by step 4 (leave it off for a first pass / the finale). `unsharp` claws
back Kling's slight softness; `+faststart` moves the moov atom so playback starts before full
download.

```bash
ffmpeg -y -i leg_i.mp4 [-t TRIM] -an \
  -vf "scale=1920:1080,unsharp=5:5:0.8:5:5:0.0" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart \
  vid/<name>.mp4
```

- `scale=1920:1080` is mandatory - Kling returns 1912/1916px widths (see gotchas); this normalizes every leg to exact 1080p so seams and posters line up.
- `-an` - audio was never rendered (`--sound off`); strip any empty track.
- `crf 20 / preset slow` is the desktop-tier quality/size sweet spot for these grades.

---

## 4. Frame-match tail-trim - land each clip on the next clip's frame 0

Even with pinned endpoints, Kling's decoded tail can overshoot or hold a few frames past the
exact landing frame. To make leg `i` END on the SAME image that leg `i+1` STARTS with, search
the tail of leg `i` for the frame most similar to `first_{i+1}.png` (leg `i+1`'s frame 0), then
re-encode leg `i` trimmed just past that frame. That trim value is the `-t TRIM` from step 3.

Search (per adjacent pair), mirroring `frame_match_trim.py`:

1. Dump leg `i+1` frame 0 once: `ffmpeg -y -ss 0 -i leg_{i+1}.mp4 -frames:v 1 -q:v 2 first_{i+1}.png`
2. Dump the last `SEARCH_S = 0.7s` of leg `i` as frames at 24 fps, starting at `t0 = duration - 0.7`:
   ```bash
   ffmpeg -y -ss <t0> -i leg_i.mp4 -vf "fps=24" tail_%03d.png
   ```
3. SSIM each `tail_k.png` against `first_{i+1}.png`; keep the best `k`.
4. Frame `k` (1-indexed) is shown at `t0 + (k-1)/24`. Trim **half a frame past** it so it is the
   last included frame: `trim_t = t0 + (k-1)/24 + 0.5/24`. That is the `-t` for step 3's encode
   of leg `i`.

SSIM of two frames (parse the `All:` token from stderr):

```bash
ffmpeg -i a.png -i b.png -lavfi "scale2ref[x][y];[x][y]ssim" -f null -
```

`scale2ref` guarantees identical dimensions before SSIM (defends against the 1912/1916 width
drift). The finale leg has no successor - leave it untrimmed.

### Seam gate

After re-encoding, verify each boundary by SSIM of leg `i`'s **last** frame vs leg `i+1`'s
**first** frame:

```bash
ffmpeg -y -sseof -0.05 -i vid/<i>.mp4 -frames:v 1 _sa.png   # last frame of i
ffmpeg -y -ss 0     -i vid/<i+1>.mp4 -frames:v 1 _sb.png    # first frame of i+1
ffmpeg -i _sa.png -i _sb.png -lavfi "scale2ref[x][y];[x][y]ssim" -f null -
```

| SSIM        | verdict                                             |
|-------------|-----------------------------------------------------|
| `>= 0.90`   | pass - seam is frame-tight                          |
| `0.75-0.90` | eyeball it; usually fine, occasionally re-trim by +-1 frame |
| `< 0.75`    | fail - wrong tail frame or a bad still; fix upstream |

A **0.08s crossfade** between adjacent clips in the player hides residual metric noise from
moving clouds / drifting confetti (which legitimately differ frame-to-frame and drag SSIM down
a few points even on a perfect landing). The gate measures intent; the crossfade covers texture.

---

## 5. Posters - first frame of the ENCODED clip

Poster = the exact frame the clip opens on, so the `<video>` poster and the first painted frame
are pixel-identical (no flash on load). Pull it from the **encoded** master, not the raw Kling
leg or the still (the still may differ by a frame after trimming upstream legs).

```bash
ffmpeg -y -ss 0 -i vid/<name>.mp4 -frames:v 1 -c:v libwebp -quality 82 img/<name>-poster.webp
```

---

## 6. 720p mobile tier

Ship a smaller clip + poster for mobile (~40-55% smaller than the 1080p master). Same GOP
discipline, tighter keyint (`-g 4`) because phones seek harder relative to their decode budget;
`crf 23` and 1280x720 do the size work.

```bash
ffmpeg -y -i vid/<name>.mp4 -an \
  -vf "scale=1280:720" \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
  -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart \
  vid/<name>-m.mp4

ffmpeg -y -ss 0 -i vid/<name>-m.mp4 -frames:v 1 -c:v libwebp -quality 82 img/<name>-poster-m.webp
```

Wire both tiers into the scene manifest as `clip`/`poster` (desktop) and `clipMobile`/
`posterMobile` (mobile); the engine loads the mobile tier ONLY on save-data / slow networks -
every device gets the full-res master by default. Encode the mobile tier FROM the
already-trimmed 1080p master so the seams carry over for free.

---

## Gotchas

- **Kling widths drift (1912/1916px).** Every leg MUST pass through `scale=1920:1080` (encode)
  and SSIM must use `scale2ref` - otherwise seams and posters are off by a few px and SSIM lies.
- **`--sound off` is required** on Kling legs, then `-an` on encode - a stray silent audio track
  breaks some mobile autoplay and bloats the file.
- **No `--resolution` on Kling.** That flag is a GPT-Image-2 param; Kling rejects it. Kling
  resolution follows `--aspect_ratio` + the input still. Set size at the encode step instead.
- **Run legs detached / in parallel.** Endpoints are pinned so legs are independent - fan them
  out with `&` + `wait` (or separate detached jobs). Do not serialize and do not prompt-chain.
- **Anchor before batch.** Approve `still_1` before generating `2..N`; a drifted still poisons
  the two legs touching it and wastes ~44 credits.
- **Trim leg `i` against leg `i+1`'s frame 0**, never against `still_{i+1}` - the decoded first
  frame can differ slightly from the source still.
- **Finale has no `--end-image` and no trim** - it is the only open-ended leg.