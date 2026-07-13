# Leg Prompts (still-to-still, subject-POV camera)

The prompt shape for ONE camera leg in a scroll-cinema flight. Every leg is pinned at both ends to approved stills (`--start-image still_i`, `--end-image still_{i+1}`), so a leg is a self-contained "get the camera from still i to still i+1" instruction. Because both endpoints are fixed, legs render in PARALLEL and seams are frame-perfect by construction. The prompt only has to describe the MOTION between the two pinned frames, not invent either endpoint.

The camera is the moving object's POV (a "ball-cam" / subject-cam). One continuous shot, no cuts.

## The three-move template

Every chase leg is the same three moves, in order:

```
Single continuous cinematic shot, no cuts.
[MOVE 1 - LAUNCH]  <subject_i in scene i> <does an action and STRIKES / SENDS the moving object away>.
[MOVE 2 - CHASE]   The camera immediately whips into a fast <object>-POV chase, staying tight
                   behind the flying <object> as it <travels through the shared connective
                   sky/space: the recurring world elements that tie all scenes together>.
[MOVE 3 - LAND]    The <object> then arcs down and <drops/dives> through <the entry into scene
                   i+1> toward <subject_{i+1} in scene i+1> who <receives it>, the camera
                   settling exactly as <subject_{i+1}> <receives / meets the object>.
<STYLE TAIL>
```

Rules that make the seams work:

- MOVE 1 must restate scene i's look precisely (kit, number, colours, setting, lighting) so frame 1 matches `still_i`.
- MOVE 3 must restate scene i+1's look precisely (kit, number, colours, arena, entry point) so the LAST frame matches `still_{i+1}`. "camera settling exactly as ..." is the cue that the leg ends on the receive pose.
- MOVE 2 is the ONLY freely-invented part. Keep the connective space IDENTICAL across every leg (same floating rock islands, waterfalls, hot-air balloons, dusk sky) so the flight reads as one continuous world.
- "The copy leads the ball": MOVE 2 is where scroll time is spent, so keep it long enough to give the GSAP copy layer room to land its words before MOVE 3.

## The shared style tail (verbatim, identical on every leg)

```
Ultra-photorealistic epic World Cup fantasy commercial, dramatic rim lighting, volumetric haze,
rich commercial color grade. Smooth graceful motion, subtle parallax. No text, no captions.
```

Swap the genre words ("World Cup fantasy commercial") per brand, but keep `dramatic rim lighting, volumetric haze, rich commercial color grade` + `Smooth graceful motion, subtle parallax` + `No text, no captions` on EVERY leg. The tail is what keeps colour grade and motion feel consistent so parallel-rendered legs cut together invisibly. `No text, no captions` is mandatory: the GSAP copy layer owns all typography.

## Slot map

| Slot | France->England leg |
|---|---|
| `subject_i` | Kylian Mbappe, royal blue France kit number 10 |
| `action` | dribbles once on park grass, strikes the ball high |
| `object` | glowing football |
| `connective space` | past the Eiffel Tower, floating rock islands, waterfalls, glowing hot-air balloons, clouds streaking |
| `scene i+1 entry` | open roof of a grand London night stadium, giant illuminated white arch |
| `subject_{i+1}` | Harry Kane, white England kit number 9, red/white smoke |
| `receive` | looks up to receive the dropping ball |

## Real examples

Leg 1 - France -> England (`--start-image still_france --end-image still_england`):

```
Single continuous cinematic shot, no cuts. Kylian Mbappe in the royal blue France kit number 10
dribbles once on the park grass in front of the illuminated Eiffel Tower at dusk, then strikes the
glowing football high into the sky. The camera immediately whips into a fast ball-POV chase, staying
tight behind the flying football as it soars up past the Eiffel Tower and through the golden-blue dusk
sky, weaving between giant floating rock islands with cascading waterfalls and glowing hot-air balloons,
clouds streaking past. The ball then arcs down and dives through the open roof of a grand London night
stadium with a giant illuminated white arch, falling toward Harry Kane in the white England kit number 9
who waits on the pitch with red and white smoke drifting, the camera settling exactly as Kane looks up
to receive the dropping ball. Ultra-photorealistic epic World Cup fantasy commercial, dramatic rim
lighting, volumetric haze, rich commercial color grade. Smooth graceful motion, subtle parallax. No
text, no captions.
```

Leg 2 - England -> Spain (`--start-image still_england --end-image still_spain`). Note the launch move restates the SAME England arch/smoke that ended leg 1, so leg 1's end-frame and leg 2's start-frame both match `still_england`:

```
Single continuous cinematic shot, no cuts. Harry Kane in the white England kit number 9 watches the
football drop from the sky inside the grand London night stadium with the giant illuminated white arch,
red and white smoke drifting, then meets it first time with a powerful volley that sends the ball
rocketing up over the stadium rim. The camera immediately whips into a fast ball-POV chase, staying
tight behind the flying football as it tears through the warm dusk sky between giant floating rock
islands with waterfalls and glowing hot-air balloons. The ball then arcs down and drops through the open
roof of a sunlit historic Spanish bullring arena with ornate arched grandstands full of fans, falling
toward a young winger in the red Spain kit number 19 sprinting across the golden sand with a massive
black bull behind him, the camera settling exactly as the ball reaches his feet. Ultra-photorealistic
epic World Cup fantasy commercial, dramatic rim lighting, volumetric haze, rich commercial color grade.
Smooth graceful motion, subtle parallax. No text, no captions.
```

## Terminal scene / finale variant (no chase)

The last leg has no next subject to send the object to, so it drops the three-move launch/chase/land structure and becomes a single slow ceremonial camera move that resolves the whole flight. Keep the same style tail (with `slow motion`):

```
Single continuous cinematic shot, no cuts. A very slow, majestic forward push from low behind four
football players standing side by side on the center circle of a colossal packed night stadium - blue
France kit, white England kit, red Spain kit, sky-blue striped Argentina kit - a football resting on the
grass between them, their nations' giant flags rising behind the stands. The camera drifts slowly forward
past the players toward the enormous glowing golden trophy towering at the far end of the stadium, its
golden light flaring through the haze, golden sparks and confetti drifting, the crowd shimmering with
phone lights, floating rock islands visible through the open roof. Slow, steady, ceremonial forward drift
the entire shot. Ultra-photorealistic epic World Cup fantasy commercial, dramatic rim lighting,
volumetric haze, rich commercial color grade. Smooth graceful slow motion, subtle parallax. No text,
no captions.
```

The finale still pins both ends (`--start-image still_group --end-image still_trophy`) - the "object" is just the camera itself pushing in, not a struck ball.

## Where the prompt slots into the render

The leg prompt is the text body; the pinned stills are the endpoints. One invocation per leg, all fired in parallel:

```bash
# leg i (0-indexed): still_i -> still_{i+1}
kling-render \
  --model kling-3.0 \
  --start-image stills/still_${i}.png \
  --end-image   stills/still_$((i+1)).png \
  --prompt "$(cat legs/leg_${i}.txt)" \
  --duration 5 --out legs/leg_${i}.mp4
```

Concat is trivial and seamless because leg_i ends on `still_{i+1}` and leg_{i+1} starts on `still_{i+1}`:

```bash
printf "file '%s'\n" legs/leg_*.mp4 > legs/list.txt
ffmpeg -f concat -safe 0 -i legs/list.txt -c copy flight.mp4
```

## Likeness and NSFW

Higgsfield enforces likeness/NSFW at the OUTPUT level: it inspects the generated frames, not just the prompt text. Real named public figures are hit-or-miss - some pass, some are blocked even when the prompt is clean.

Work WITH the filter, never around it:

- Prefer generic descriptors over real names. "a young winger in the red Spain kit number 19" passed where a named player did not. Describe by kit, number, build, and role, not identity.
- If you genuinely need a specific likeness, supply a user-provided image through the platform's own upload path and let the platform's filter arbitrate. The platform decides; you accept its verdict.
- Back-shots and wide shots pass far more often than tight front-on faces. The subject-POV camera already helps here: MOVE 2 is behind the object, and MOVE 1/MOVE 3 favour receiving/kicking poses over face close-ups. Lean into that - frame subjects from behind or at distance.
- If a leg is blocked, re-roll toward MORE generic (drop the name, widen the shot, turn the subject away), not toward evasion.

Hard line, no exceptions: never bypass or circumvent likeness or NSFW protections. No face-swap onto a rendered clip, no prompt tricks to defeat the filter, no post-hoc compositing of a real face into generated footage, no filter-evasion phrasing. If the platform blocks an output, that output does not ship.
