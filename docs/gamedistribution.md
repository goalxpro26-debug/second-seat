# Second Seat — GameDistribution (HTML5) notes

## Status
- SDK: gd-defold (https://github.com/GameDistribution/gd-defold, main
  branch), vendored locally under `gamedistribution/` (upstream folder,
  verbatim, copied from the bloom-bubbles GD extension backup) with
  `[library] include_dirs = gamedistribution` in `game.project`. The URL
  dependency line was removed: bob cannot fetch the zip through the
  egress proxy.
- `[gamedistribution] game_id = "PLACEHOLDER"` — the parent fills the
  real HEX Game ID from the portal Upload tab before upload. The
  bundle's index.html already carries `GD_OPTIONS` (verified present in
  `dist/html5/Second Seat/`).
- Game: original town adventure on one shared scooter, Defold 1.14.0.
  **12 districts** with missions (deliveries, score target, no-stall
  streaks), 1-3 stars per level by score, progress saved; plus an
  endless courier mode (deliveries keep coming, traffic thickens,
  3 crashes end the run, best score saved). Swap seats: front steers,
  back works the throttle; the partner on throttle tires out (fatigue)
  and stalls the scooter at 100 until you swap them up front to rest.
  Controls: keyboard (W/S or Up/Down lanes, A/D throttle, Space swap,
  P pause, M mute), touch/mouse (on-screen LANE, THROTTLE and SWAP
  buttons). Hidden verification aids: press **A** (quick tap) to toggle
  an auto-play bot (sets throttle, dodges by lane, swaps to rest the
  partner before fatigue 90, slows for delivery stops); press **U** on
  the title screen to unlock all levels (QA aid, not a player feature).
- Audio: 10 synthesized SFX + 2 music loops + engine loop, all
  generated locally by `tools/synth_audio.py` (numpy, no AI audio, no
  downloads). Art: all sprites drawn in code by `tools/make_art.py`
  (PIL, no AI images, no copied assets).

## Ads
- `main/gd_ads.lua` wraps `gdsdk` with pcall guards (copied structure
  from PocketEscape's gd_ads.lua, plus AD_SDK_CANCELED), so the game
  runs fine with no SDK / no network. Listener registered in
  `game.script` init() via `gd_ads.init(pause_cb, resume_cb)`.
- Pre-roll interstitial on the **first Play tap only** (`ui_play`,
  gated by the saved `played_once` flag, persisted so it fires once
  ever). Never on load, never on a timer.
- Interstitial when the player taps **Next** on a level-complete screen
  (`ui_next` -> `show_interstitial`).
- `SDK_GAME_PAUSE` sets `ad_paused`, mutes audio and posts `ad_pause`
  to the GUI, which sets `paused = true` and blocks gameplay input.
  `SDK_GAME_START` / `CONTENT_RESUME_REQUESTED` clears the ad pause,
  restores the player's own mute preference and posts `ad_resume`,
  which restores `paused` to the user's own pause state
  (`user_paused or false`). `SDK_ERROR` / `AD_ERROR` /
  `AD_SDK_CANCELED` also resume if ad-paused (ad-error resume fix:
  with a PLACEHOLDER id every ad errors instantly, and a failed
  interstitial must not freeze the game).
- `show_play` resets `user_paused` (stale-pause-flag fix: after
  pause -> quit-to-title -> new game, the next gd_resume would
  otherwise re-pause the game). `show_title` also resets it.

## Animations
- `main/gui.gui_script` — scooter bounce while moving, lane-glide
  tween, rider swap slide (scale squash + sprite flip front/back),
  pickup pop, crash shake, stall smoke puffs, win confetti, button
  squash, mission banner slide-in. All tweens are callback-free where
  nodes can be deleted mid-tween.

## Lessons applied from the start
- Forward-declared EVERY local function referenced in an earlier
  closure (One Pan serve_slot lesson).
- Mission banner: deleted DIRECTLY on timer expiry even when paused
  (banner-stuck-behind-ads bug).
- Overlay panels gate play-screen input with the `overlay_up` panel
  flag only (Second Glance input-overlay fix — never gate on
  screen ~= "play" alone).

## Verification (verify/verify.js, headless Chromium)
- **38/38 checks passed** on the shipped build (verify/results.json,
  Nov 24 ~19:20 PST, 5.2 min run): title loads, canvas non-blank,
  SDK presence 4/4 (window.gdsdk object, GD_OPTIONS gameId PLACEHOLDER,
  GD_DEFOLD.onEvent, SDK_READY v1.43.63), L1 starts, throttle changes
  speed, lane change works, swap changes seat + partner rests (fatigue
  falls), fatigue rises with partner on throttle, stall triggers at
  fatigue 100 and clears after swap, pickup scores, crash registers,
  delivery stop completes a delivery, P pauses + resumes, mute toggles,
  autoplay bot WINS level 1 (score 700, deliveries 2, crashes 0),
  NEXT LEVEL starts level 2, MENU returns to title, U unlock
  spot-checks levels 5 and 12, pause/resume in endless, endless scores
  and a crash registers, no page/console errors (excluding GD SDK
  network noise + favicon 404s).
- HUD fix (run 3 screenshots): the top HUD text sat on the light sky /
  rooftops and was unreadable. All HUD text now lives on a dark strip
  (y 540..640, 3 rows), the mission banner moved to (900,500), and
  gameplay popups moved right of the scooter (x 600, y 470).
- HARNESS lessons (verify.js, not the game): Chrome's direct TLS is
  intercepted by the sandbox (ERR_SSL_PROTOCOL_ERROR on the GD SDK
  script) — the harness now routes external traffic through the
  egress forwarder (`--proxy-server=http://127.0.0.1:3129`,
  `--proxy-bypass-list=localhost,127.0.0.1`); without it the SDK
  checks fail even though curl reaches the SDK fine.
- BUGS FOUND + FIXED DURING VERIFY (all in the shipped build):
  1. Quoted game_id (`game_id = "PLACEHOLDER"`) was HTML-escaped into
     GD_OPTIONS as `&quot;PLACEHOLDER&quot;` — the template substitutes
     the raw value. Fixed: unquoted `game_id = PLACEHOLDER` (same as
     Pocket Escape's unquoted HEX id).
  2. Collision tunneling at low headless FPS: one frame moves an entity
     100+ px, jumping clean over the 140 px hit window — crashes and
     deliveries were missed. Fixed with swept collision in
     `scooter.lua` (an entity counts if its path crossed the scooter's
     x during the step).
  3. Bot missed every delivery stop: it reacted at x<700, but at full
     speed a stop crosses 700->300 in under a second while the bot
     ticks every 0.6s of game time. Fixed: react at x<1000, slow to
     30/25/12 by distance, bot tick 0.35s.
  4. Stall-wait harness flaw: the D hold left order 95, so the scooter
     crashed 3x and lost the level before fatigue hit 100. Fixed in
     the harness (hold A to crawl first) + lose-screen recovery via
     TRY AGAIN.
- Known headless gap (same as all factory games): real mouse/touch
  click-through does not reach Lua in this VM's Chrome — button clicks
  in the harness are best-effort; keyboard + autoplay bot drive the
  gameplay checks. Real-browser click-through is still owed before
  calling the game fully verified.

## Rebuild
Use the exact command from the project README.md (extender reverse
proxy on 127.0.0.1:8080 + egress truststore + run-bob.sh wasm-web
build+bundle). Under a COOP/COEP server the GD SDK script is blocked
by COEP — verify SDK presence over a PLAIN http server, not the COOP one.
