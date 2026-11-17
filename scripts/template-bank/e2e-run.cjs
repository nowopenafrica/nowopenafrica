const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const WEB = `http://localhost:${process.env.WEB_PORT}`;
const db = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT, '-U', 'postgres', '-d', 'postgres', '-qAt', '-c', q], { encoding: 'utf8' }).trim();

let pass = 0; let fail = 0;
const check = (label, ok, detail = '') => { if (ok) { pass += 1; console.log(`  pass  ${label}`); } else { fail += 1; console.log(`  FAIL  ${label} ${detail}`); } };
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `${name}.png`) }); };

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: process.env.SHOTS ? 2 : 1 });
  const admin = await context.newPage();
  const openAdmin = async () => {
    await admin.goto(`${WEB}/admin?preview&tab=template-bank`, { waitUntil: 'domcontentloaded' });
    await admin.waitForSelector('text=Upload package', { timeout: 60000 });
  };
  const bank = admin.locator('section[aria-label="Bank contents"]');
  const staged = admin.locator('section[aria-label="Package check"]');
  const card = (name) => bank.locator('li', { has: admin.locator(`p:text-is("${name}")`) });

  await openAdmin();
  await admin.waitForSelector('text=The bank is empty');
  check('an empty bank says so', true);

  await admin.setInputFiles('input[type=file]', process.env.ZIP);
  await staged.waitFor();
  const summary = await staged.locator('p.text-xs').first().innerText();
  const total = Number(/(\d+) new/.exec(summary)[1]);
  check('the package validates in the browser', total > 0 && summary.includes('0 rejected'), summary);
  check('every template is previewed before import', (await staged.locator('ul.grid > li').count()) === total);
  await shot(admin, '1-package-check');

  await admin.click(`button:has-text("Import ${total} as pending")`);
  await bank.locator('ul.grid > li').first().waitFor();
  check('import writes every template', db('select count(*) from design_templates') === String(total));
  check('all of them pending, none live', db("select count(*) from design_templates where review_status='pending' and not published") === String(total));
  check('nothing can be published yet', await bank.locator('button:has-text("Publish 0 approved")').isDisabled());

  const fill = async (name, values) => {
    const c = card(name);
    await c.locator('button:text-is("Review")').click();
    const inputs = c.locator('input[type=number]');
    for (let i = 0; i < values.length; i += 1) await inputs.nth(i).fill(String(values[i]));
    return c;
  };

  let c = await fill('Timetable', [10, 10, 10, 10, 5, 5, 5, 3, 3]);
  check('a score under 80 cannot be approved', await c.locator('button:text-is("Approve")').isDisabled());
  await c.locator('button:text-is("Reject")').click();
  await card('Timetable').locator('text=rejected').waitFor();
  check('a rejection is recorded with its score', db("select review_status||' '||review_score from design_templates where key='bank-timetable'") === 'rejected 61');

  c = await fill('Rail', [13, 13, 13, 13, 9, 9, 8, 4, 4]);
  await shot(admin, '2-review-form');
  await c.locator('button:text-is("Approve")').click();
  await card('Rail').locator('text=approved').waitFor();
  check('a score of 80 or more is approved', db("select review_status||' '||review_score||' '||published from design_templates where key='bank-rail'") === 'approved 86 false');

  await bank.locator('button:has-text("Publish 1 approved")').click();
  await card('Rail').locator('text=live').waitFor();
  check('publishing sends only the approved template live', db('select string_agg(key, \',\') from design_templates where published') === 'bank-rail');
  await shot(admin, '3-published');

  const gallery = await context.newPage();
  const openGallery = async () => {
    await gallery.goto(`${WEB}${process.env.GALLERY_PATH || '/media'}`, { waitUntil: 'domcontentloaded' });
    await gallery.waitForSelector('#create-designs', { timeout: 60000 });
    await gallery.locator('#create-designs input[placeholder^="menu"]').fill('Rail');
    await gallery.waitForTimeout(1500);
  };
  await openGallery();
  check('the published template appears in the public Create gallery', (await gallery.locator('#create-designs button[aria-label="Edit Rail"]').count()) === 1);
  check('an unpublished template does not', (await gallery.locator('#create-designs button[aria-label="Edit Sunrise"]').count()) === 0);
  await shot(gallery, '4-public-gallery');

  await card('Rail').locator('button:text-is("Unpublish")').click();
  await bank.locator('button:has-text("Publish 1 approved")').waitFor();
  await openGallery();
  check('unpublishing removes it from the gallery', (await gallery.locator('#create-designs button[aria-label="Edit Rail"]').count()) === 0);

  await admin.setInputFiles('input[type=file]', process.env.ZIP);
  await staged.waitFor();
  const again = await staged.locator('p.text-xs').first().innerText();
  check('uploading the same package again finds nothing new', again.startsWith('0 new') && again.includes(`${total} already in the bank`), again);
  check('and offers nothing to import', await staged.locator('button:has-text("Import 0 as pending")').isDisabled());

  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error('ERROR', err.message.split('\n')[0]); process.exit(1); });
