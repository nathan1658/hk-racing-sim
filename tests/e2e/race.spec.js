import { test, expect } from '@playwright/test';

const money = async (page) => Number(await page.getByTestId('balance').getAttribute('data-value'));

// Average brightness + colour variety of the WebGL canvas: proves the 3D scene actually drew.
const canvasStats = (page) =>
  page.evaluate(() => {
    const src = document.querySelector('#stage canvas');
    const c = document.createElement('canvas');
    c.width = 160; c.height = 90;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    let sum = 0; const buckets = new Set();
    for (let i = 0; i < d.length; i += 4) {
      sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      buckets.add(`${d[i] >> 5}-${d[i + 1] >> 5}-${d[i + 2] >> 5}`);
    }
    return { mean: sum / (d.length / 4), colours: buckets.size };
  });

test('full meeting flow: card → bets → 3D race → results → payouts → next race', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/?seed=11&speed=6');
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.__hkrs.phase)).toBe('idle');

  // Scene renders (floodlit night course, not a black or flat canvas).
  await page.getByRole('button', { name: '睇馬場' }).click();
  await page.waitForTimeout(800);
  const idle = await canvasStats(page);
  expect(idle.mean).toBeGreaterThan(20);
  expect(idle.colours).toBeGreaterThan(40);
  await page.getByRole('button', { name: '返回投注' }).click();

  // Race card in Chinese with 12 runners and live odds.
  await expect(page.locator('#meeting')).toContainText('第 1 場');
  await expect(page.locator('#meeting')).toContainText('米');
  const rows = page.locator('#raceCard tbody tr');
  await expect(rows).toHaveCount(12);
  for (const t of await page.locator('[data-odds]').allTextContents()) expect(Number(t)).toBeGreaterThanOrEqual(1);

  const start = await money(page);
  expect(start).toBe(10000);

  // 獨贏 #1 $100
  await rows.nth(0).click();
  await page.locator('#quick button[data-v="100"]').click();
  await expect(page.locator('#comboInfo')).toHaveText('1 注');
  await page.getByRole('button', { name: '落注' }).click();
  await expect(page.locator('#toast')).toContainText('已落注');
  await expect.poll(() => money(page)).toBe(start - 100);

  // 位置 on #2 and #3 at $50 each (two bets)
  await page.getByRole('tab', { name: '位置', exact: true }).click();
  await rows.nth(1).click();
  await rows.nth(2).click();
  await page.locator('#quick button[data-v="50"]').click();
  await expect(page.locator('#comboInfo')).toHaveText('2 注');
  await page.getByRole('button', { name: '落注' }).click();

  // 連贏 複式 on #1 #2 #3 → 3 combos × $10
  await page.getByRole('tab', { name: '連贏' }).click();
  for (const i of [0, 1, 2]) await rows.nth(i).click();
  await page.locator('#quick button[data-v="10"]').click();
  await expect(page.locator('#comboInfo')).toHaveText('3 注');
  await page.getByRole('button', { name: '落注' }).click();

  // 三重彩 needs exactly three in order
  await page.getByRole('tab', { name: '三重彩' }).click();
  await rows.nth(3).click();
  await expect(page.getByRole('button', { name: '落注' })).toBeDisabled();
  await rows.nth(0).click();
  await rows.nth(4).click();
  await expect(page.locator('#selection .chip em').first()).toHaveText('頭馬');
  await page.getByRole('button', { name: '落注' }).click();

  const staked = 100 + 2 * 50 + 3 * 10 + 10;
  await expect.poll(() => money(page)).toBe(start - staked);
  await expect(page.locator('#betList li')).toHaveCount(7);

  // Can't overspend.
  await page.getByRole('tab', { name: '獨贏' }).click();
  await rows.nth(5).click();
  await page.fill('#stake', '999990');
  await expect(page.getByRole('button', { name: '落注' })).toBeDisabled();
  await expect(page.locator('#estDiv')).toHaveText('結餘不足');
  await rows.nth(5).click();

  // Off they go.
  await page.getByRole('button', { name: /開始比賽/ }).click();
  await expect(page.locator('#live')).toBeVisible();
  await expect(page.locator('#cardPanel')).toHaveClass(/away-left/);
  await expect.poll(() => page.evaluate(() => window.__hkrs.phase), { timeout: 20_000 }).toBe('running');
  await expect(page.locator('#order .pos')).toHaveCount(12);
  // Live race calls in Cantonese keep coming (lines are replaced quickly at 6× speed).
  await expect(page.locator('#commentary')).toContainText('號「', { timeout: 10_000 });
  const firstCall = await page.locator('#commentary').textContent();
  await expect(page.locator('#commentary')).not.toHaveText(firstCall, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.__hkrs.simT), { timeout: 20_000 }).toBeGreaterThan(8);

  // Mid-race the 3D view is alive: frames keep rendering at a usable rate and change.
  const a = await canvasStats(page);
  await page.waitForTimeout(500);
  const b = await canvasStats(page);
  expect(a.mean).toBeGreaterThan(15);
  expect(Math.abs(a.mean - b.mean) + Math.abs(a.colours - b.colours)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__hkrs.fps)).toBeGreaterThan(20);

  // Camera switching works during the race.
  await page.locator('button[data-shot="follow"]').click();
  await expect(page.locator('button[data-shot="follow"]')).toHaveClass(/on/);
  await page.locator('button[data-shot="auto"]').click();

  // Results.
  await expect(page.locator('#results')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#resTable tbody tr')).toHaveCount(12);
  await expect(page.locator('#resTable tbody tr').first().locator('td').first()).toHaveText('1');
  const divRows = await page.locator('#divTable tbody tr').count();
  expect(divRows).toBe(9); // 1 WIN + 3 PLA + 3 QPL + 1 QIN + 1 TCE

  // Books balance: new balance = start − stakes + Σ stake/10 × dividend for each winning bet.
  const r = await page.evaluate(() => window.__hkrs.lastResult);
  const [w1, w2, w3] = r.order;
  const key = (b) => (b.pool === 'QIN' || b.pool === 'QPL' ? [...b.sel].sort((x, y) => x - y).join('-') : b.sel.join('-'));
  let expected = start - staked;
  for (const bet of r.bets) {
    const hit =
      (bet.pool === 'WIN' && bet.sel[0] === w1) ||
      (bet.pool === 'PLA' && [w1, w2, w3].includes(bet.sel[0])) ||
      (bet.pool === 'QIN' && [w1, w2].every((n) => bet.sel.includes(n))) ||
      (bet.pool === 'TCE' && bet.sel.join() === [w1, w2, w3].join());
    const div = r.divs[bet.pool][key(bet)];
    if (hit) { expect(div).toBeGreaterThanOrEqual(10); expected += (bet.stake / 10) * div; }
    else expect(div).toBeUndefined();
  }
  expect(await money(page)).toBeCloseTo(expected, 1);
  expect(r.balance).toBeCloseTo(expected, 1);
  const net = expected - (start - staked) - staked;
  await expect(page.locator('#resNet')).toContainText(net >= 0 ? '贏' : '輸');

  // Next race keeps the balance and deals a fresh card.
  const bal = await money(page);
  await page.getByRole('button', { name: /下一場/ }).click();
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#meeting')).toContainText('第 2 場');
  await expect(page.locator('#betList li')).toHaveText('未有注項');
  expect(await money(page)).toBeCloseTo(bal, 1);

  expect(errors).toEqual([]);
});

test('balance persists across reloads (per-browser)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 30_000 });
  expect(await money(page)).toBe(10000);
  await page.locator('#raceCard tbody tr').first().click();
  await page.getByRole('button', { name: '落注' }).click();
  await expect.poll(() => money(page)).toBe(9990);
  await page.reload();
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 30_000 });
  expect(await money(page)).toBe(9990);
});

test('phone layout: no horizontal scroll, panels usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=3');
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 30_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#raceCard tbody tr')).toHaveCount(12);
  await expect(page.getByRole('button', { name: /開始比賽/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/phone.png' });
});
