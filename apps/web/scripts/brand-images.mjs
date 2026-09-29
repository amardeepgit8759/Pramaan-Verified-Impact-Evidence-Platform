// Renders the social preview image (og.png, 1200×630) and the Apple touch icon (180×180)
// into public/ from HTML, with the brand fonts and logo. Run after changing the brand:
//   node scripts/brand-images.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const mark = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <rect width="32" height="32" rx="9" fill="#1b1d33"/>
  <path d="M16 6.5l8 3v6.2c0 4.9-3.3 8.6-8 9.8-4.7-1.2-8-4.9-8-9.8V9.5l8-3z" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M12.4 16.2l2.6 2.6 4.8-5.2" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const fonts = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Instrument+Serif&display=block">`;

const og = `<!doctype html><html><head>${fonts}<style>
  body { margin: 0; width: 1200px; height: 630px; background: #14152a; color: #f4f5fb;
    font-family: Geist, sans-serif; display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px 80px; box-sizing: border-box;
    background-image: radial-gradient(circle at 85% 20%, rgba(52, 211, 153, 0.18), transparent 45%); }
  .brand { display: flex; align-items: center; gap: 20px; font-size: 40px; font-weight: 600; letter-spacing: -0.5px; }
  h1 { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 118px; line-height: 1; margin: 0; letter-spacing: -2px; }
  p { font-size: 34px; color: #b9bdd6; margin: 24px 0 0; max-width: 900px; line-height: 1.35; }
  .chips { display: flex; gap: 14px; font-size: 24px; font-weight: 500; }
  .chip { display: flex; align-items: center; gap: 10px; border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 10px 20px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
</style></head><body>
  <div class="brand">${mark(64)}Pramaan</div>
  <div><h1>Proof, not promises.</h1>
    <p>Verified impact evidence for NGOs, CSR teams and funders. Every claim links back to a photo.</p></div>
  <div class="chips">
    <span class="chip"><span class="dot" style="background:#34d399"></span>Trust Score on every photo</span>
    <span class="chip"><span class="dot" style="background:#f9b73f"></span>Duplicates caught</span>
    <span class="chip"><span class="dot" style="background:#7c83ff"></span>Cited SDG reports</span>
  </div>
</body></html>`;

const icon = `<!doctype html><html><body style="margin:0;background:#1b1d33">${mark(180).replace('rx="9"', 'rx="0"')}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og, { waitUntil: 'networkidle' });
// Runs in the page, where `document` exists.
// eslint-disable-next-line no-undef
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(publicDir, 'og.png') });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(icon);
await page.screenshot({ path: path.join(publicDir, 'apple-touch-icon.png') });
await browser.close();
console.log('Wrote public/og.png and public/apple-touch-icon.png');
