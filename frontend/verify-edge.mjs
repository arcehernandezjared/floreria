import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// 1. Login
await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'admin@floreria.com');
await page.fill('input[type="password"]', 'floreria123');
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/01-dashboard.png` });
console.log('URL after login:', page.url());

// 2. Click bell button - find it by iterating header buttons
const headerBtns = await page.$$('header button');
console.log('Header buttons count:', headerBtns.length);

let bellClicked = false;
for (const btn of headerBtns) {
  const innerHTML = await btn.innerHTML();
  if (innerHTML.toLowerCase().includes('bell')) {
    const box = await btn.boundingBox();
    console.log('Bell bbox:', JSON.stringify(box));
    await btn.click();
    bellClicked = true;
    break;
  }
}

if (!bellClicked) {
  // Try clicking by position (bell is usually second-to-last in topbar right area)
  console.log('Bell not found by innerHTML, trying by position');
  for (const btn of headerBtns) {
    const box = await btn.boundingBox();
    if (box && box.x > 1100) {
      console.log('Clicking button at x:', box.x, 'y:', box.y);
      await btn.click();
      bellClicked = true;
      break;
    }
  }
}

await page.waitForTimeout(600);

// 3. Screenshot with dropdown open
await page.screenshot({ path: `${OUT}/02-bell-open.png` });

// 4. Check DOM for notification dropdown
const allAbsolute = await page.$$('[class*="absolute"]');
console.log('\nAbsolute positioned elements:', allAbsolute.length);

for (const el of allAbsolute) {
  const box = await el.boundingBox();
  const classes = await el.evaluate(e => e.className.substring(0, 100));
  if (box && box.width > 100 && box.height > 50) {
    console.log('  Large absolute element:', classes.substring(0, 60), '| box:', JSON.stringify(box));
  }
}

// 5. Inspect the dropdown specifically
const dropdown = await page.$('div[class*="rounded-2xl"][class*="z-50"]');
if (dropdown) {
  const box = await dropdown.boundingBox();
  const text = await dropdown.textContent();
  console.log('\nDropdown found!');
  console.log('  Box:', JSON.stringify(box));
  console.log('  Text preview:', text.substring(0, 150));

  // Check if the dropdown is clipped by any ancestor
  const clipInfo = await page.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    // Walk up and find overflow:hidden ancestors
    let ancestor = el.parentElement;
    const clippers = [];
    while (ancestor && ancestor !== document.body) {
      const s = window.getComputedStyle(ancestor);
      if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const ar = ancestor.getBoundingClientRect();
        clippers.push({
          tag: ancestor.tagName,
          cls: ancestor.className.substring(0, 80),
          overflow: `${s.overflow} / ${s.overflowX} / ${s.overflowY}`,
          rect: { x: Math.round(ar.x), y: Math.round(ar.y), w: Math.round(ar.width), h: Math.round(ar.height) }
        });
      }
      ancestor = ancestor.parentElement;
    }
    return {
      dropdownRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      clippers,
      style: { overflow: style.overflow, zIndex: style.zIndex, position: style.position }
    };
  }, dropdown);

  console.log('\nClip analysis:', JSON.stringify(clipInfo, null, 2));
} else {
  console.log('\nDropdown NOT FOUND in DOM');

  // Log all visible elements
  const bodyText = await page.textContent('body');
  console.log('Page has "Notificaciones":', bodyText.includes('Notificaciones'));
  console.log('Page has "alert":', bodyText.toLowerCase().includes('alerta'));
}

// 6. Focused screenshot of top-right area
await page.screenshot({ path: `${OUT}/03-topright.png`, clip: { x: 900, y: 0, width: 380, height: 600 } });
// 7. Full page
await page.screenshot({ path: `${OUT}/04-fullpage.png`, fullPage: true });

console.log('\nErrors:', errors.length ? errors : 'none');
console.log('Screenshots saved to:', OUT);

await browser.close();
