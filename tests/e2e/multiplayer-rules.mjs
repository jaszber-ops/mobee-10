// Run: serve the repo on :8766 (python3 -m http.server 8766), run `npx partykit dev --port 1999` with ASSET_ORIGIN pointed at :8766, then `node tests/e2e/multiplayer-rules.mjs` (needs playwright + chromium).
// Two simulated iPhones against the local branch (client :8766, PartyKit :1999).
// Checks: wired buttons, server-chosen host, miss keeps the round alive, reconnect grace.
import { chromium, devices } from 'playwright';
import crypto from 'crypto';
const APP = 'http://localhost:8766/'; const PK = 'pk=127.0.0.1:1999';
const OUT = (process.env.SHOT_DIR || '.') + '/fix-';
const results = []; const check = (name, ok, extra = '') => { results.push([ok ? 'PASS' : 'FAIL', name, extra]); console.log(ok ? 'PASS' : 'FAIL', name, extra); };

async function tap(ctx) { // record every server message per context
  const msgs = [];
  await ctx.routeWebSocket(/^ws/, route => { const s = route.connectToServer(); s.onMessage(m => { try { msgs.push(JSON.parse(m)); } catch {} route.send(m); }); route.onMessage(m => s.send(m)); });
  return msgs;
}
const last = (m, t) => { for (let i = m.length - 1; i >= 0; i--) if (m[i].type === t) return m[i]; };
const count = (m, t) => m.filter(x => x.type === t).length;
async function answerToken(page) {
  const toks = await page.$$eval('#game-board [data-token]', els => els.map(e => [e.dataset.token, e.src, [...document.querySelectorAll('#game-board .card')].indexOf(e.closest('.card'))]));
  const h = {};
  for (const [t, src, ci] of toks) {
    const buf = Buffer.from(await (await page.request.get(src)).body());
    let p = 8, keep = [];
    while (p < buf.length) { const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8); if (type !== 'tEXt') keep.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len; }
    (h[crypto.createHash('md5').update(Buffer.concat(keep)).digest('hex')] ||= []).push([t, ci]);
  }
  const hit = Object.values(h).find(v => new Set(v.map(x => x[1])).size === 3);
  return { answer: hit?.[0]?.[0], wrong: toks.map(x => x[0]).find(t => !hit?.some(x => x[0] === t)) };
}
const tapToken = async (page, t) => { const b = await page.locator(`#game-board [data-token="${t}"]`).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const mk = async (av, pid) => { const c = await browser.newContext({ ...devices['iPhone 15'] }); const m = await tap(c); await c.addInitScript(([a, p]) => { localStorage.setItem('mobee_avatar', a); localStorage.setItem('mobee_player_id', p); }, [av, pid]); return [c, m, await c.newPage()]; };
const [ca, ma, A] = await mk('2,4', 'AAAA');
let [cb, mb, B] = await mk('6,9', 'BBBB');
const shot = async (p, n) => { await p.evaluate(() => scrollTo(0, 0)).catch(() => {}); await p.screenshot({ path: OUT + n + '.png' }); };

// 1. real clicks on the lobby cards
await A.goto(APP + '?lobby&' + PK); await A.waitForTimeout(2000);
await A.locator('#play-friends-card').click();
await A.waitForTimeout(800);
check('Play with Friends card opens the friends lobby', await A.locator('#friends-section').isVisible());
const code = await A.locator('#lobby-room-code').inputValue(); console.log('room', code);
await B.goto(APP + '?room=' + code + '&' + PK);
for (let i = 0; i < 40 && Object.keys(last(ma, 'UPDATE_SCORES')?.scores || {}).length < 2; i++) await A.waitForTimeout(250);
await A.waitForTimeout(800);
check('Creator keeps Start Game after a friend joins', await A.locator('#lobby-start-btn').isVisible() && !(await B.locator('#lobby-start-btn').isVisible()), 'hostId=' + last(ma, 'UPDATE_SCORES')?.hostId);
await shot(A, '01-host'); await shot(B, '02-guest');

// 2. guest cannot start; host can, via real click
await B.evaluate(() => window.handleLobbyStart()); await B.waitForTimeout(1200);
check('Guest START_GAME is ignored by the server', !last(ma, 'GAME_STARTING'));
await A.locator('#lobby-start-btn').click();
await A.locator('#game-board .card').first().waitFor({ timeout: 15000 }); await A.waitForTimeout(1200);
check('Host Start Game button click starts the game', !!last(ma, 'NEW_ROUND'));
await shot(A, '03-game');

// 3. a miss keeps the round alive
const rounds0 = count(ma, 'NEW_ROUND');
const { answer, wrong } = await answerToken(A); console.log('answer', answer, 'wrong', wrong);
await tapToken(A, wrong); await A.waitForTimeout(400); await shot(A, '04-miss-A'); await shot(B, '05-miss-seen-by-B');
await A.waitForTimeout(2500);
const wg = last(ma, 'WRONG_GUESS');
check('Wrong tap broadcasts WRONG_GUESS with lockout, no new deal', !!wg && wg.lockoutMs === 1000 && count(ma, 'NEW_ROUND') === rounds0, JSON.stringify(wg?.scores));
check('Miss overlay is gone, table still shows cards', !(await A.locator('#message').isVisible()) && (await A.locator('#game-board .card').count()) === 3);
await tapToken(B, answer); await A.waitForTimeout(800);
const win = last(mb, 'WINNER');
check('Other player wins the same round after the miss', win?.winnerId === 'BBBB' && win.scores.BBBB === 1, JSON.stringify(win?.scores));
await shot(B, '06-B-wins-same-round');
await A.waitForTimeout(4500); // next deal
await A.locator('#game-board .card').first().waitFor();
// 3b. lockout: two quick wrong taps only cost one point
const r2 = await answerToken(B); const before = last(mb, 'NEW_ROUND').scores.BBBB;
await tapToken(B, r2.wrong); await B.waitForTimeout(250); await tapToken(B, r2.wrong); await B.waitForTimeout(800);
const misses = mb.filter(m => m.type === 'WRONG_GUESS' && m.guesserId === 'BBBB').length;
check('Second tap inside the lockout is ignored', misses === 1 && last(mb, 'WRONG_GUESS').scores.BBBB === before - 1, `misses=${misses} score ${before}->${last(mb, 'WRONG_GUESS').scores.BBBB}`);

// 4. reconnect grace: B drops and comes back within 20 s with the same score
const scoreB = last(ma, 'WRONG_GUESS').scores.BBBB;
await cb.close(); await A.waitForTimeout(1500);
const awayMsg = last(ma, 'UPDATE_SCORES');
check('Dropped player is marked away, score kept', awayMsg?.away?.includes('BBBB') && awayMsg.scores.BBBB === scoreB, JSON.stringify({ away: awayMsg?.away, scores: awayMsg?.scores }));
await shot(A, '07-B-away');
[cb, mb, B] = await mk('6,9', 'BBBB');
await B.goto(APP + '?room=' + code + '&' + PK); await B.waitForTimeout(2500);
const back = last(ma, 'UPDATE_SCORES');
check('Returning player keeps seat and score', back?.away?.length === 0 && back.scores.BBBB === scoreB && Object.keys(back.scores).length === 2, JSON.stringify({ away: back?.away, scores: back?.scores }));
const rb = await answerToken(B); check('Returning player gets the current round as playable tokens', count(mb, 'NEW_ROUND') >= 1 && !!rb.answer, 'answer=' + rb.answer);
await shot(B, '08-B-back');

// 5. game over still arrives
for (let i = 0; i < 160 && !last(ma, 'GAME_OVER'); i++) await A.waitForTimeout(500);
check('GAME_OVER arrives', !!last(ma, 'GAME_OVER'), JSON.stringify(last(ma, 'GAME_OVER')?.scores));
await shot(A, '09-over');
await browser.close();
console.log('\n' + results.map(r => r.join('  ')).join('\n'));
if (results.some(r => r[0] === 'FAIL')) process.exit(1);
