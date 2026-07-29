/* Test: shop category filter matching logic (app.js getFilteredProducts)
   Runs against LIVE shop API data. Node 18+ (global fetch). */
const fs = require('fs');
const path = require('path');

const API = 'https://symmet-shop-api.iidaworkzz.workers.dev';

// Load app.js in an isolated scope with browser stubs; expose internals.
global.document = { addEventListener: () => {} };
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const load = new Function(
  'document', 'window', 'fetch',
  src + '\nreturn { getFilteredProducts, CATEGORIES, NEW_SOFA_PRODUCTS, _set: (f, p) => { activeFilters = f; PRODUCTS = p; } };'
);

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
  ok ? passed++ : failed++;
}

(async () => {
  const rows = await (await fetch(`${API}/api/products`)).json();
  // mirror loadProducts(): all rows kept (unpriced render as "Price on request")
  const products = rows.map(r => ({ id: r.product_code, category: r.category }));
  const { getFilteredProducts, CATEGORIES, NEW_SOFA_PRODUCTS, _set } = load(global.document, {}, fetch);

  check('New Sofa group -> 10 showcase pieces', (() => { _set({ group: 'new-sofa' }, products); return getFilteredProducts().length; })(), 10);
  check('New Sofa pieces have model keys + images', (() => { NEW_SOFA_PRODUCTS.every(p => p.modelKey && p.image && p.dimsHTML); return NEW_SOFA_PRODUCTS.every(p => p.modelKey && p.image && p.noPrice); })(), true);
  check('Andy dims include 3-seater width 192.5', NEW_SOFA_PRODUCTS[0].dimsHTML.includes('192.5'), true);
  check('Andy image/glb URL pattern matches R2 buckets', NEW_SOFA_PRODUCTS[0].image.endsWith('/ANDY.webp'), true);

  check('category cards: Chairs + Tables + Sofas', CATEGORIES.map(c => c.name).join(','), 'Chairs,Tables,Sofas');
  check('no filter shows everything (incl. 4 unpriced)', (() => { _set({}, products); return getFilteredProducts().length; })(), 249);
  check('Chairs card -> chair products only', (() => { _set({ category: ['Chairs'] }, products); return getFilteredProducts().length; })(), 25);   // 19 WOODEN CHAIR + 6 METAL CHAIR
  check('Tables card -> table products only', (() => { _set({ category: ['Tables'] }, products); return getFilteredProducts().length; })(), 118);  // 114 + 4 unpriced kept
  check('Sofas card -> sofa products only', (() => { _set({ category: ['Sofas'] }, products); return getFilteredProducts().length; })(), 33);   // 27 SOFA + 6 CAFÉ SOFA
  check('chip BAR STOOL -> 11', (() => { _set({ category: ['BAR STOOL'] }, products); return getFilteredProducts().length; })(), 11);
  check('chip COFFEE Table -> 66', (() => { _set({ category: ['COFFEE Table'] }, products); return getFilteredProducts().length; })(), 66);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0; // natural exit: avoids libuv assert on open fetch sockets (Windows)
})();
