// Screenshot a localhost URL with Puppeteer.
// Usage: node screenshot.mjs http://localhost:3000 [label]
// Saves to ./temporary screenshots/screenshot-N[-label].png (auto-incremented).
import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = join(ROOT, 'temporary screenshots');

const url = process.argv[2];
const label = process.argv[3];
const viewport = process.argv[4]; // optional "WxH", e.g. 375x812

if (!url) {
  console.error('Usage: node screenshot.mjs <url> [label]');
  process.exit(1);
}
if (url.startsWith('file:')) {
  console.error('Refusing to screenshot a file:// URL - serve on localhost first (node serve.mjs).');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const nums = existsSync(OUT_DIR)
  ? readdirSync(OUT_DIR)
      .map((f) => f.match(/^screenshot-(\d+)/))
      .filter(Boolean)
      .map((m) => Number(m[1]))
  : [];
const next = nums.length ? Math.max(...nums) + 1 : 1;
const safeLabel = label ? '-' + label.replace(/[^a-zA-Z0-9_-]+/g, '-') : '';
const outPath = join(OUT_DIR, `screenshot-${next}${safeLabel}.png`);

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  const [vw, vh] = (viewport || '1440x900').split('x').map(Number);
  await page.setViewport({ width: vw || 1440, height: vh || 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // Let fonts/animations settle
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`Saved: ${outPath}`);
} finally {
  await browser.close();
}
