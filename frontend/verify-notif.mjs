import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

// 1. Login
await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'admin@floreria.com');
await page.fill('input[type="password"]', 'floreria123');
await page.screenshot({ path: `${OUT}/01-login.png` });
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);
console.log('URL after login:', page.url());
await page.screenshot({ path: `${OUT}/02-dashboard.png` });

// 2. Find bell button
await page.waitForTimeout(1000);
const headerButtons = await page.$$('header button');
console.log(`Header buttons: ${headerButtons.length}`);

let bellButton = null;
for (const btn of headerButtons) {
  const html = await btn.innerHTML();
  if (html.includes('bell') || html.includes('Bell')) {
    bellButton = btn;
    const bbox = await btn.boundingBox();
    console.log('Bell button found, bbox:', JSON.stringify(bbox));
    break;
  }
}

// If not found by SVG content, try the second button from right
if (!bellButton && headerButtons.length >= 1) {
  bellButton = headerButtons[0]; // first non-hamburger btn is likely bell
  for (const btn of headerButtons) {
    const bbox = await btn.boundingBox();
    console.log('Button bbox:', JSON.stringify(bbox));
  }
}

// 3. Screenshot BEFORE clicking bell
await page.screenshot({ path: `${OUT}/03-before-bell.png` });

// 4. Click bell
if (bellButton) {
  await bellButton.click();
  console.log('Clicked bell button');
} else {
  // Try clicking by aria or role
  await page.click('header button:nth-child(1)', { timeout: 3000 }).catch(() => {});
}

await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/04-after-bell-click.png` });

// 5. Check if dropdown appeared
const dropdown = await page.$('.rounded-2xl.shadow-2xl, [class*="shadow-2xl"]');
if (dropdown) {
  const bbox = await dropdown.boundingBox();
  console.log('\n=== DROPDOWN ===');
  console.log('Bounding box:', JSON.stringify(bbox));
  console.log('Visible:', await dropdown.isVisible());

  // Check if bottom is cut off (clipped)
  const viewportHeight = 800;
  if (bbox && bbox.y + bbox.height > viewportHeight) {
    console.log(`⚠️  CLIPPED: dropdown bottom at ${bbox.y + bbox.height} exceeds viewport ${viewportHeight}`);
  }

  // Check right edge
  if (bbox && bbox.x < 0) {
    console.log(`⚠️  CLIPPED LEFT: dropdown starts at x=${bbox.x}`);
  }
  if (bbox && bbox.x + bbox.width > 1280) {
    console.log(`⚠️  CLIPPED RIGHT: dropdown ends at x=${bbox.x + bbox.width}`);
  }

  // Get text content of dropdown
  const text = await dropdown.textContent();
  console.log('Dropdown content preview:', text.substring(0, 200));
} else {
  console.log('⚠️  Dropdown NOT found in DOM');
}

// 6. Check for any visible notifications
const notifItems = await page.$$('button[class*="w-full"][class*="p-4"]');
console.log(`Notification items: ${notifItems.length}`);

// Take a clipped screenshot of just the dropdown area (top-right)
await page.screenshot({
  path: `${OUT}/05-dropdown-area.png`,
  clip: { x: 900, y: 0, width: 380, height: 600 }
});

// 7. Full page scroll behavior check
await page.screenshot({ path: `${OUT}/06-full-dropdown.png`, fullPage: true });

// 8. Check z-index issues by examining if dropdown appears behind main content
const mainContent = await page.$('main');
if (mainContent) {
  const mainBbox = await mainContent.boundingBox();
  const dropdownEl = await page.$('.rounded-2xl.shadow-2xl');
  const dropBbox = dropdownEl ? await dropdownEl.boundingBox() : null;
  console.log('\nMain content bbox:', JSON.stringify(mainBbox));
  console.log('Dropdown bbox:', JSON.stringify(dropBbox));
}

// 9. Check computed styles on dropdown
const dropdownEl = await page.$('.rounded-2xl.shadow-2xl');
if (dropdownEl) {
  const styles = await page.evaluate(el => {
    const s = window.getComputedStyle(el);
    return {
      position: s.position,
      zIndex: s.zIndex,
      overflow: s.overflow,
      top: s.top,
      right: s.right,
      width: s.width,
      height: s.height,
      display: s.display,
      visibility: s.visibility,
      opacity: s.opacity,
    };
  }, dropdownEl);
  console.log('\nDropdown computed styles:', JSON.stringify(styles, null, 2));
}

// Check parent overflow
const parentOverflow = await page.evaluate(() => {
  const dropdown = document.querySelector('.rounded-2xl.shadow-2xl');
  if (!dropdown) return 'dropdown not found';
  let el = dropdown.parentElement;
  const overflows = [];
  while (el && el !== document.body) {
    const s = window.getComputedStyle(el);
    if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible') {
      overflows.push({
        tag: el.tagName,
        classes: el.className.substring(0, 80),
        overflow: s.overflow,
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        rect: el.getBoundingClientRect()
      });
    }
    el = el.parentElement;
  }
  return overflows;
});
console.log('\nParent overflow ancestors:', JSON.stringify(parentOverflow, null, 2));

console.log('\nConsole errors:', errors.length ? errors : 'none');
console.log('Screenshots in:', OUT);

await browser.close();
