# Second Seat

An original town adventure on one shared scooter for GameDistribution
(HTML5), built with Defold 1.14.0. Game 9 of the GD factory queue.
Landscape 1136x640. Category: Adventure.

## The game

A sun-faded repair-shop town, crossed on ONE scooter with your partner.
You never fully control it: the FRONT seat steers, the BACK seat works
the throttle — and you SWAP seats with one button.

- **Swap seats**: Space or the on-screen SWAP button. In FRONT you steer
  (W/S or Up/Down lanes); your partner holds your last throttle order
  (A/D sets it) and tires out — fatigue rises ~3.5/s and their throttle
  wobbles as they tire. In BACK you set speed directly (A/D, accurate,
  instant); your partner steers by AI (drifts to the centre lane, dodges
  late, sometimes misses a pickup) and RESTS, fatigue falling ~8/s.
- **Fatigue 100 = STALL**: speed drops to 0 for 3s. Only swapping (partner
  up front, resting) drains fatigue and clears a stall.
- **Traffic**: cars, trucks and potholes spawn ahead in the three lanes.
  A crash costs 50 points and slows you down; 3 crashes fail the route.
- **Pickups**: parcels in lanes (+100). **Delivery stops**: marked stops
  along the route — arrive in the stop's lane under 20 km/h to deliver
  (+300).
- **12 districts** with missions (deliver N / score target / no-stall
  streaks) and stars by score; progress saved. Difficulty ramps gently;
  level 1 is easily winnable.
- **Endless courier mode**: deliveries keep coming, traffic thickens over
  time, 3 crashes end the run, best score saved.
- **Controls**: keyboard (W/S or Up/Down lanes, A/D throttle, Space swap,
  P pause, M mute), mouse / touch (on-screen LANE up/down, THROTTLE +/-
  and SWAP buttons). Hidden verification aid: quick-tap **A** to toggle
  an auto-play bot (sets throttle, dodges by lane, swaps to rest the
  partner before fatigue 90, slows for delivery stops), and **U** on the
  title screen to unlock all levels.
- **Audio**: 10 synthesized SFX + 2 music loops + engine loop, all
  generated locally by `tools/synth_audio.py` (numpy, no AI audio, no
  downloads).
- **Art**: all sprites drawn in code by `tools/make_art.py` (PIL, no AI
  images, no copied assets). Rooftop town background, scooter + two
  riders in both seat orders, traffic, pothole, parcel, delivery stop.
- **Animations**: scooter bounce, lane glide, rider swap slide, pickup
  pop, crash shake, stall smoke puff, win confetti, button squash,
  mission banner slide-in.

## GameDistribution SDK

- Extension vendored locally under `gamedistribution/` (bob cannot fetch
  the zip through the egress proxy) + `[library] include_dirs =
  gamedistribution` in `game.project`.
- `game.project` has `[gamedistribution] game_id = PLACEHOLDER` — the
  parent fills the real HEX Game ID from the portal Upload tab before
  upload.
- Ads only on user input: pre-roll interstitial on the first Play tap,
  interstitial when the player taps Next on a level-complete screen.
- `SDK_GAME_PAUSE` pauses the game + mutes audio; `SDK_GAME_START` /
  `CONTENT_RESUME_REQUESTED` resumes + unmutes; `SDK_ERROR` / `AD_ERROR`
  / `AD_SDK_CANCELED` also resume if ad-paused (ad-error resume fix).
  `show_play` resets `user_paused` (stale-pause fix). All `gdsdk` calls
  are guarded (`if gdsdk then pcall(...) end`) so the game runs fine
  with no SDK / no network.

## Building (this VM)

```bash
# extender reverse proxy (127.0.0.1:8080) + egress forwarder (127.0.0.1:3129)
# must both be listening; restart per this README if dead:
setsid nohup python3 ~/workspace/tools/extender-reverse-proxy.py \
  >/tmp/extender-rproxy.log 2>&1 &
setsid nohup python3 ~/workspace/tools/egress-proxy-forward.py \
  >/tmp/egress-proxy.log 2>&1 &
cd ~/workspace/defold/projects/second-seat
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true \
  -Djavax.net.ssl.trustStore=$HOME/workspace/tools/egress-truststore.jks \
  -Djavax.net.ssl.trustStorePassword=changeit"
~/workspace/defold/run-bob.sh --build-server http://127.0.0.1:8080 \
  --platform wasm-web --variant release --archive \
  --bundle-output dist/html5 resolve build bundle
# -> dist/html5/Second Seat/  (~8 MB)
```

HTML5 platform is `wasm-web` (not `js-web`). Engine artifacts are
pre-seeded in `~/workspace/defold/bob-root/wasm_pthread-web/`. The
egress-proxy CA rotates: rebuild `egress-truststore.jks` from
`/run/hatch/egress-tls/ca-bundle.pem` (last cert only) if extender builds
start failing with PKIX errors.

## Verifying

The game reports live state in `document.title`
(`SECONDSEAT|screen=...|level=...|score=...|speed=...|fatigue=...|
lane=...|seat=...|deliveries=...|stalled=...|paused=...|muted=...|
mission=...|time=...|auto=...|crashes=...|pickups=...|stalls=...|
distance=...|order=...`) which the verify script polls. Screenshots land
in `verify/`.

```bash
# serve the bundle on port 8908 (PLAIN http server, not COOP/COEP,
# or the GD SDK script is blocked), then:
cd dist/html5/"Second Seat" && python3 -m http.server 8908 &
node verify/verify.js \
  "file:///home/hatch/workspace/defold/projects/second-seat/verify/redirect.html"
# (redirect.html navigates to http://localhost:8908/index.html)
```

**Headless-verification gotchas (carry over from the other games):**
1. Defold HTML5 input is **polled once per engine frame**; headless
   SwiftShader runs at a few FPS, so quick clicks fall between frames.
   Use **held inputs** (down, hold ~800 ms, up).
2. Input action x/y are in **GUI space (origin bottom-left, y up)**,
   but Playwright clicks in **page space (origin top-left, y down)**.
   A GUI point (x, y) in this 1136x640 game must be clicked at page
   (x, 640 - y).
3. Canvas blankness: decode the screenshot PNG and count distinct
   colors (drawImage returns blank without preserveDrawingBuffer).
4. `bob` without a command only **builds**; the bundle is written only
   when the `bundle` command is passed.
5. A is both throttle-down and the autoplay toggle: a quick tap
   (<0.35s held) toggles the bot; holding it throttles down.

## Files

- `main/` — `game.script` (controller/save/GD/music), `gui.gui_script`
  (all screens, road, scooter, input, animations),
  `scooter.lua` (pure driving model: speed/fatigue/traffic/spawns),
  `levels.lua` (12 district defs + endless), `audio.lua`, `gd_ads.lua`
- `art/` — PIL-drawn PNGs + `atlas.atlas`
- `audio/` — synthesized WAVs + `.sound` files + `audio.go`
- `tools/` — `make_art.py`, `synth_audio.py`
- `input/game.input_binding` — mouse + touch + keyboard
- `verify/` — Playwright verification script + screenshots
