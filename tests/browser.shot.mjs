// Captures gameplay screenshots for manual visual verification.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'tests/shot-menu.png' });
await page.click('#btn-new');
await page.waitForTimeout(1200);
// Look downward to see ground/structures.
await page.mouse.move(640, 360);
await page.mouse.move(640, 360 + 200);
await page.waitForTimeout(200);
await page.screenshot({ path: 'tests/shot-game.png' });
// Look around / move a bit.
await page.mouse.move(640, 360);
await page.mouse.move(640, 360);
await page.mouse.move(640, 360 - 60);
await page.waitForTimeout(200);
await page.screenshot({ path: 'tests/shot-lookdown.png' });
await page.keyboard.down('KeyW');
await page.waitForTimeout(800);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
await page.screenshot({ path: 'tests/shot-moved.png' });
console.log('errors:', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
