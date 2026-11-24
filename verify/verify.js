// Second Seat — headless verification with Playwright.
// Usage: node verify.js <game-url>  (e.g. file://.../verify/redirect.html)
// The game reports live state in document.title:
// SECONDSEAT|screen=...|level=...|score=...|speed=...|fatigue=...|lane=...|
// seat=...|deliveries=...|stalled=...|paused=...|muted=...|mission=...|
// time=...|auto=...|crashes=...|pickups=...|stalls=...|distance=...|order=...
//
// INPUT NOTE (verified on the other games): Defold HTML5 input is POLLED
// once per engine frame, and headless SwiftShader runs at only a few FPS.
// Quick clicks fall between frames and are never seen. Mouse interactions
// use HELD clicks (down, hold ~800ms, up). Keys are event-driven, so a
// SHORT 150ms tap is reliable; a long hold risks OS key-repeat toggling
// P/A back to where they started.
// COORDINATES: input action x/y are GUI space (origin bottom-left, y up),
// Playwright clicks are page space (origin top-left, y down). A GUI point
// (x, y) in this 1136x640 game must be clicked at page (x, 640 - y).
// A key is BOTH throttle-down and the autoplay toggle: a quick tap
// (<0.35s held) toggles the bot, holding it throttles down.
const { chromium } = require('/home/hatch/workspace/tools/pw-shot/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = __dirname;
const url = process.argv[2];
if (!url) { console.error('usage: node verify.js <game-url>'); process.exit(2); }

const W = 1136, H = 640;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
}

async function heldClick(page, x, y, holdMs) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await sleep(holdMs || 800);
  await page.mouse.up();
  await sleep(400);
}

async function guiClick(page, x, y, holdMs) {
  await heldClick(page, x, H - y, holdMs);
}

async function heldKey(page, key, holdMs) {
  await page.keyboard.down(key);
  await sleep(holdMs || 150);
  await page.keyboard.up(key);
  await sleep(300);
}

async function state(page) {
  const title = await page.title();
  const m = {};
  title.split('|').forEach((part) => {
    const kv = part.split('=');
    if (kv.length === 2) m[kv[0]] = kv[1];
  });
  return m;
}

async function tapKeyExpect(page, key, pred, timeoutMs, label, quiet) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await heldKey(page, key, 250);
    const s = await waitState(page, pred, timeoutMs, label, true);
    if (pred(s)) return s;
  }
  return await state(page);
}

async function waitState(page, pred, timeoutMs, label, quiet) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await state(page);
    if (pred(s)) return s;
    await sleep(100);
  }
  const s = await state(page);
  if (!quiet) check(label, false, 'last state: ' + JSON.stringify(s));
  return s;
}

function pngDistinctColors(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return -1;
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString('ascii');
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return -1;
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const colors = new Set();
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const v = raw[rowStart + 1 + i];
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      row[i] = (v + pred) & 0xff;
    }
    prev = row;
    if (y % 4 !== 0) continue;
    for (let x = 0; x < width; x += 4) {
      const i = x * bpp;
      colors.add(row[i] + ',' + row[i + 1] + ',' + row[i + 2]);
      if (colors.size > 500) return colors.size;
    }
  }
  return colors.size;
}

// Level-select grid: 4 cols x 3 rows, centres x 218+col*240, y 460-row*150.
function levelXY(n) {
  const col = (n - 1) % 4, row = Math.floor((n - 1) / 4);
  return [218 + col * 240, 460 - row * 150];
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/meta-chromium/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hatch-webgl-allowed-domains-file=' + path.join(OUT, 'webgl-policy-all.txt'),
      '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,local-network-access-check',
      // The sandbox intercepts Chrome's direct TLS (ERR_SSL_PROTOCOL_ERROR
      // on the GD SDK script). Route external traffic through the VM's
      // egress forwarder (127.0.0.1:3129, adds Proxy-Authorization) and
      // bypass it for localhost. Same fix as the Java/Gradle proxy setup.
      '--proxy-server=http://127.0.0.1:3129',
      '--proxy-bypass-list=localhost,127.0.0.1',
      '--ignore-certificate-errors'],
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  const logs = [];
  page.on('pageerror', (e) => {
    if (e.message.includes('browsingTopics')) { logs.push('IGNORED: ' + e.message); return; }
    errors.push('PAGEERROR: ' + e.message);
  });
  page.on('console', (m) => {
    const t = m.text();
    logs.push(m.type() + ': ' + t.slice(0, 300));
    if (t.includes('HeaderLift service response error')) return;
    if (t.includes('Cross-Origin-Opener-Policy header has been ignored')) return;
    if (t.includes('browsingTopics')) return;
    if (m.type() === 'error') errors.push('CONSOLE: ' + t.slice(0, 300));
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!/localhost|127\.0\.0\.1/.test(u)) {
      logs.push('IGNORED-REQFAIL(ad): ' + u.slice(0, 160));
      return;
    }
    errors.push('REQFAIL: ' + u.slice(0, 160) + ' ' + (r.failure() || {}).errorText);
  });

  await page.goto(url, { waitUntil: 'load' });
  if (url.startsWith('file://')) {
    await sleep(2000);
    await page.evaluate(() => {
      if (location.protocol !== 'file:') return;
      const w = document.getElementById('running-from-file-warning');
      if (w) w.style.display = 'none';
      EngineLoader.load('canvas', 'SecondSeat');
    });
  } else {
    const m = url.match(/localhost:(\d+)/);
    const waitRe = m ? new RegExp('localhost:' + m[1]) : /localhost/;
    await page.waitForURL(waitRe, { timeout: 15000 }).catch(() => {});
  }
  await sleep(9000); // wasm engine boot
  const titleShot = await page.screenshot({ path: path.join(OUT, '01-title.png') });
  let s = await state(page);
  check('page loads, title state reported', s.screen === 'title', JSON.stringify(s));
  const distinct = pngDistinctColors(titleShot);
  check('canvas non-blank (title screenshot, distinct colors)',
    distinct > 50, 'distinct=' + distinct);

  // GD SDK presence (plain http server, not the COOP/COEP one).
  const sdk = await page.evaluate(() => ({
    gdsdk: typeof window.gdsdk,
    gdOptions: typeof window.GD_OPTIONS,
    gameId: window.GD_OPTIONS ? window.GD_OPTIONS.gameId : null,
    gdDefold: typeof window.GD_DEFOLD,
    gdDefoldOnEvent: window.GD_DEFOLD ? typeof window.GD_DEFOLD.onEvent : null,
  }));
  check('GD SDK present (window.gdsdk object)', sdk.gdsdk === 'object',
    JSON.stringify(sdk));
  check('GD_OPTIONS gameId is PLACEHOLDER', sdk.gameId === 'PLACEHOLDER',
    'gameId=' + sdk.gameId);
  check('GD_DEFOLD.onEvent present', sdk.gdDefoldOnEvent === 'function',
    JSON.stringify(sdk));
  const sdkReady = logs.some((l) => /SDK_READY/i.test(l));
  check('SDK_READY in console logs', sdkReady,
    'logs=' + logs.filter((l) => /SDK|GD_/i.test(l)).slice(0, 3).join(' | '));

  // ---- L1 mechanics run (no bot): throttle, lanes, fatigue, swap, stall.
  await guiClick(page, 568, 312); // PLAY
  s = await waitState(page, (x) => x.screen === 'play', 15000, 'PLAY starts level 1');
  check('PLAY starts level 1', s.screen === 'play' && parseInt(s.level || '0') === 1,
    JSON.stringify(s));
  check('level 1 mission is deliveries', (s.mission || '').includes('Deliver'),
    'mission=' + s.mission);
  await page.screenshot({ path: path.join(OUT, '02-play.png') });

  // Throttle up with held D: speed should rise.
  await page.keyboard.down('d');
  await sleep(2000);
  await page.keyboard.up('d');
  s = await waitState(page, (x) => parseInt(x.speed || '0') > 5, 15000, 'throttle raises speed');
  check('throttle (D) raises speed', parseInt(s.speed || '0') > 5,
    'speed=' + s.speed + ' order=' + s.order);
  await page.screenshot({ path: path.join(OUT, '03-driving.png') });

  // Lane change with W (2 -> 1) then S (1 -> 2).
  s = await tapKeyExpect(page, 'w', (x) => x.lane === '1', 30000, 'lane up');
  check('lane change up works (W)', s.lane === '1', 'lane=' + s.lane);
  s = await tapKeyExpect(page, 's', (x) => x.lane === '2', 30000, 'lane down');
  check('lane change down works (S)', s.lane === '2', 'lane=' + s.lane);

  // Fatigue rises while the partner works the throttle (seat front).
  const f0 = parseInt(s.fatigue || '0');
  await sleep(8000);
  s = await state(page);
  const f1 = parseInt(s.fatigue || '0');
  check('fatigue rises with partner on throttle', f1 > f0,
    'fatigue ' + f0 + ' -> ' + f1);

  // SWAP (Space): seat flips to back, partner rests, fatigue falls.
  s = await tapKeyExpect(page, ' ', (x) => x.seat === 'back', 30000, 'swap to back seat');
  check('swap changes seat to back', s.seat === 'back', 'seat=' + s.seat);
  const f2 = parseInt(s.fatigue || '0');
  await sleep(6000);
  s = await state(page);
  const f3 = parseInt(s.fatigue || '0');
  check('partner rests in back seat (fatigue falls)', f3 < f2,
    'fatigue ' + f2 + ' -> ' + f3);
  await page.screenshot({ path: path.join(OUT, '04-back-seat.png') });

  // Swap back to front, slow right down first (hold A >0.35s: throttles
  // down without toggling the bot), then wait for a stall (fatigue 100).
  // At crawl speed oncoming cars pull away, so the scooter survives the
  // ~30s wait; at the 95 order left by the D hold it would crash 3x
  // and lose the level before fatigue ever hit 100 (run 1).
  s = await tapKeyExpect(page, ' ', (x) => x.seat === 'front', 30000, 'swap to front seat');
  check('swap back to front seat', s.seat === 'front', 'seat=' + s.seat);
  await page.keyboard.down('a');
  await sleep(3000);
  await page.keyboard.up('a');
  await sleep(500);
  s = await state(page);
  check('throttle down slows the scooter (A hold)', parseInt(s.order || '99') <= 45,
    'speed=' + s.speed + ' order=' + s.order);
  s = await waitState(page, (x) => x.stalled === '1', 240000, 'stall at fatigue 100', true);
  check('stall triggers at fatigue 100', s.stalled === '1',
    'fatigue=' + s.fatigue + ' stalled=' + s.stalled + ' speed=' + s.speed);
  await page.screenshot({ path: path.join(OUT, '05-stalled.png') });
  if (s.stalled === '1') {
    // Swap clears the stall (partner goes up front to rest).
    s = await tapKeyExpect(page, ' ', (x) => x.stalled === '0', 30000, 'swap clears stall');
    check('swap clears the stall', s.stalled === '0', 'stalled=' + s.stalled);
  }

  // Back to a fresh L1 for the autoplay win run. If the stall wait ended
  // on the lose screen (crashed out), TRY AGAIN restarts L1 directly;
  // otherwise quit to title and PLAY again.
  s = await state(page);
  if (s.screen === 'lose') {
    await guiClick(page, 568, 250); // TRY AGAIN
    s = await waitState(page, (x) => x.screen === 'play', 15000, 'TRY AGAIN restarts level 1');
    check('TRY AGAIN restarts level 1', s.screen === 'play', JSON.stringify(s));
  } else {
    await guiClick(page, 1080, 612); // MENU
    s = await waitState(page, (x) => x.screen === 'title', 15000, 'MENU returns to title');
    check('MENU returns to title', s.screen === 'title', JSON.stringify(s));
    await guiClick(page, 568, 312); // PLAY again
    s = await waitState(page, (x) => x.screen === 'play', 15000, 'PLAY starts level 1 again');
    check('PLAY starts level 1 again', s.screen === 'play', JSON.stringify(s));
  }
  s = await tapKeyExpect(page, 'a', (x) => x.auto === '1', 30000, 'autoplay turns on');
  check('autoplay turns on', s.auto === '1', JSON.stringify(s));

  // Pickup / delivery scoring while the bot drives.
  s = await waitState(page, (x) => parseInt(x.pickups || '0') >= 1,
    150000, 'pickup collected', true);
  check('pickup scores (pickups >= 1)', parseInt(s.pickups || '0') >= 1,
    'pickups=' + s.pickups + ' score=' + s.score);
  s = await waitState(page, (x) => parseInt(x.deliveries || '0') >= 1,
    240000, 'delivery completed', true);
  check('delivery stop completes a delivery', parseInt(s.deliveries || '0') >= 1,
    'deliveries=' + s.deliveries + ' score=' + s.score);

  // Pause / resume mid-run.
  s = await tapKeyExpect(page, 'p', (x) => x.paused === '1', 30000, 'pause key pauses');
  const pauseEngaged = s.paused === '1';
  check('pause key pauses', pauseEngaged, JSON.stringify(s));
  await page.screenshot({ path: path.join(OUT, '06-paused.png') });
  if (pauseEngaged) {
    s = await tapKeyExpect(page, 'p', (x) => x.paused === '0', 30000, 'pause key resumes');
    check('pause key resumes', s.paused === '0', JSON.stringify(s));
  } else {
    check('pause key resumes', false, 'pause never engaged, cannot test resume');
  }

  // Autoplay wins level 1 (up to 300s at headless FPS).
  s = await waitState(page, (x) => x.screen === 'win' || x.screen === 'lose',
    300000, 'autoplay finishes level 1');
  await page.screenshot({ path: path.join(OUT, '07-end-level1.png') });
  check('level 1 won by autoplay', s.screen === 'win',
    'score=' + s.score + ' deliveries=' + s.deliveries + ' crashes=' + s.crashes);
  const score1 = parseInt(s.score || '0');
  check('score increased during play', score1 > 0, 'score=' + score1);

  if (s.screen === 'win') {
    await guiClick(page, 568, 238); // NEXT LEVEL
    s = await waitState(page, (x) => x.screen === 'play' && parseInt(x.level || '0') === 2,
      15000, 'NEXT LEVEL starts level 2');
    check('NEXT LEVEL starts level 2', parseInt(s.level || '0') === 2,
      'level=' + s.level);
    await page.screenshot({ path: path.join(OUT, '08-level2.png') });
    await guiClick(page, 1080, 612); // MENU
    s = await waitState(page, (x) => x.screen === 'title', 15000, 'MENU returns to title');
    check('MENU returns to title (from level 2)', s.screen === 'title', JSON.stringify(s));
  } else {
    check('NEXT LEVEL starts level 2', false, 'level 1 was lost, not won');
    check('MENU returns to title (from level 2)', false, 'level 1 was lost, not won');
    await heldKey(page, 'a'); // autoplay off
    s = await state(page);
    if (s.screen === 'lose') {
      await guiClick(page, 568, 160); // LEVELS
      await waitState(page, (x) => x.screen === 'levels', 10000, 'lose -> levels');
      await guiClick(page, 568, 70); // BACK
      await waitState(page, (x) => x.screen === 'title', 10000, 'levels -> title');
    } else if (s.screen === 'play') {
      await guiClick(page, 1080, 612); // MENU
      await waitState(page, (x) => x.screen === 'title', 10000, 'quit to title');
    }
  }

  // U unlock: spot-check levels 5 and 12 load and play.
  s = await tapKeyExpect(page, 'u', (x) => x.screen === 'title', 5000, 'U on title', true);
  await guiClick(page, 400, 210); // LEVELS
  s = await waitState(page, (x) => x.screen === 'levels', 15000, 'levels screen opens');
  const xy5 = levelXY(5);
  await guiClick(page, xy5[0], xy5[1]);
  s = await waitState(page, (x) => x.screen === 'play' && parseInt(x.level || '0') === 5,
    15000, 'level 5 starts');
  check('U unlock: level 5 loads and plays', parseInt(s.level || '0') === 5,
    'level=' + s.level + ' mission=' + s.mission);
  await page.screenshot({ path: path.join(OUT, '09-level5.png') });
  await guiClick(page, 1080, 612); // MENU
  await waitState(page, (x) => x.screen === 'title', 15000, 'back to title');
  await guiClick(page, 400, 210); // LEVELS
  await waitState(page, (x) => x.screen === 'levels', 15000, 'levels screen opens');
  const xy12 = levelXY(12);
  await guiClick(page, xy12[0], xy12[1]);
  s = await waitState(page, (x) => x.screen === 'play' && parseInt(x.level || '0') === 12,
    15000, 'level 12 starts');
  check('U unlock: level 12 loads and plays', parseInt(s.level || '0') === 12,
    'level=' + s.level + ' mission=' + s.mission);
  await page.screenshot({ path: path.join(OUT, '10-level12.png') });
  await guiClick(page, 1080, 612); // MENU
  await waitState(page, (x) => x.screen === 'title', 15000, 'back to title');

  // Endless: pause/resume, scoring, crash.
  await guiClick(page, 736, 210); // ENDLESS
  s = await waitState(page, (x) => x.screen === 'play' && x.endless === '1',
    10000, 'ENDLESS starts endless mode');
  check('endless mode starts', s.endless === '1', JSON.stringify(s));
  s = await tapKeyExpect(page, 'p', (x) => x.paused === '1', 30000, 'pause in endless');
  check('pause in endless works', s.paused === '1', JSON.stringify(s));
  if (s.paused === '1') {
    s = await tapKeyExpect(page, 'p', (x) => x.paused === '0', 30000, 'resume in endless');
    check('resume in endless works', s.paused === '0', JSON.stringify(s));
  } else {
    check('resume in endless works', false, 'pause never engaged');
  }
  // Autoplay is still on: wait for endless to score.
  s = await waitState(page, (x) => parseInt(x.score || '0') > 0,
    150000, 'endless scores', true);
  check('endless scores', parseInt(s.score || '0') > 0,
    'score=' + s.score + ' deliveries=' + s.deliveries);
  await page.screenshot({ path: path.join(OUT, '11-endless.png') });
  // Crash: bot off, throttle up, sit in lane 2 and wait for traffic.
  s = await tapKeyExpect(page, 'a', (x) => x.auto === '0', 30000, 'autoplay off', true);
  await page.keyboard.down('d');
  await sleep(1500);
  await page.keyboard.up('d');
  s = await waitState(page, (x) => parseInt(x.crashes || '0') >= 1,
    150000, 'crash registers in endless', true);
  check('endless crash registers', parseInt(s.crashes || '0') >= 1,
    'crashes=' + s.crashes + ' screen=' + s.screen);
  await heldKey(page, 'a'); // make sure autoplay is off before mute check

  // Back to title, mute toggle.
  s = await state(page);
  if (s.screen === 'play') {
    await guiClick(page, 1080, 612); // MENU
    await waitState(page, (x) => x.screen === 'title', 15000, 'back to title');
  } else if (s.screen === 'lose') {
    await guiClick(page, 568, 160); // LEVELS
    await waitState(page, (x) => x.screen === 'levels', 10000, 'lose -> levels');
    await guiClick(page, 568, 70); // BACK
    await waitState(page, (x) => x.screen === 'title', 10000, 'levels -> title');
  }
  s = await state(page);
  const muteBefore = s.muted;
  await guiClick(page, 1030, 600); // SOUND ON/OFF
  s = await waitState(page, (x) => x.muted !== muteBefore, 10000, 'mute toggles', true);
  check('mute toggle flips muted state', s.muted !== muteBefore,
    'muted ' + muteBefore + ' -> ' + s.muted);
  await page.screenshot({ path: path.join(OUT, '12-title-muted.png') });

  const realErrors = errors.filter((e) =>
    !/gamedistribution|GD_|gdsdk/i.test(e) &&
    !/^CONSOLE: Failed to load resource/.test(e));
  check('no page/console errors (excluding GD SDK network noise)',
    realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  if (errors.length) console.log('ALL console/page errors:\n' + errors.slice(0, 8).join('\n'));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  fs.writeFileSync(path.join(OUT, 'results.json'),
    JSON.stringify(results, null, 2));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('VERIFY CRASH:', e); process.exit(2); });
