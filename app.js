/* =============================================
   SYMMET DEMO — JavaScript Application
   Full SPA: Home, Shop, Store Grid, Product,
   Studio, About, Checkout pages + Cart Drawer
============================================= */

/* ---- DATA ---- */

const ASSURANCES = [
  { title: 'White-glove delivery',  body: 'Every order is delivered and placed by our team, at no extra cost.' },
  { title: 'Lifetime warranty',     body: 'Every piece is guaranteed against defect for as long as you own it.' },
  { title: 'FSC-certified timber',  body: 'All wood is sourced from responsibly managed forests.' },
  { title: 'Carbon-neutral orders', body: 'We offset the delivery footprint of every shipment, always.' },
];

const STEPS = [
  { n: '01', title: 'Scan your room',    body: 'Upload a photo or sketch the floor plan — takes two minutes.',  cap: 'Step 01', line: 'Upload a photo of your room — or sketch the floor plan in two minutes.' },
  { n: '02', title: 'Place the pieces',  body: 'Drag Symmet furniture into the model. Resize it to true scale.', cap: 'Step 02', line: 'Drag Symmet pieces into the scene. Scale them to your exact dimensions.' },
  { n: '03', title: 'Walk the room',     body: 'Move through the 3D view to feel the balance before you decide.',cap: 'Step 03', line: 'Move through the 3D view at eye level — and feel the harmony before committing.' },
  { n: '04', title: 'Add to cart',       body: 'When it feels right, add the pieces you love directly to cart.',  cap: 'Step 04', line: 'When everything belongs, add your chosen pieces straight to cart.' },
];

const CATEGORIES = [
  { tag: 'SEATING',   name: 'Chairs',  count: 14, blurb: 'From sculptural dining chairs to low loungers built for the long sit.' },
  { tag: 'SURFACES',  name: 'Tables',  count: 11, blurb: 'Dining tables, coffee tables, and side tables in travertine and oak.' },
  { tag: 'SEATING',   name: 'Sofas',   count: 33, blurb: 'Deep, low-slung sofas and café seating built for long, unhurried evenings.',
    img: 'https://gqgfttnmnnhglbdaydny.supabase.co/storage/v1/object/public/shops-images/SMKAP_CS_001.png' },
];

/* ---- NEW SOFA (showcase group: no prices, 3D models from R2 sofa-3d) ---- */
const NEW_SOFA_CARD = { tag: 'NEW', name: 'New Sofa', count: 10, group: 'new-sofa',
  img: 'https://pub-c653cd87442949f8b7fe6e8eb0db85ef.r2.dev/ANDY.webp',
  blurb: 'Fresh from the studio — ten new sofa designs you can spin around in 3D.' };

const NEW_SOFA = [
  { key: 'ANDY',          name: 'Andy',          colours: 'Red seat with dark grey body',                          s1: [745, 725, 700], s2: [1325, 725, 700], s3: [1925, 725, 700] },
  { key: 'ARGO',          name: 'Argo',          colours: 'Teal / petrol blue',                                    s1: [680, 750, 750], s2: [1280, 750, 750], s3: [1880, 750, 750] },
  { key: 'BANK',          name: 'Bank',          colours: 'Cream / ivory with caramel leather side',               s1: [890, 770, 750], s2: [1495, 770, 750], s3: [2085, 770, 750] },
  { key: 'BUREAU',        name: 'Bureau',        colours: 'Lime green / chartreuse',                               s1: [750, 750, 775], other: '1 Seater only' },
  { key: 'COZA',          name: 'Coza',          colours: 'Beige with mustard/amber accent panel, solid orange',   s1: [775, 700, 725], other: '2.5 Seater: L 158 × W 70 × H 72.5 cm' },
  { key: 'CRUZE',         name: 'Cruze',         colours: 'Tangerine orange',                                      s1: [860, 720, 750], s2: [1350, 720, 750], s3: [1950, 720, 750] },
  { key: 'DE',            name: 'De',            colours: 'Dark charcoal / black',                                 s1: [790, 790, 720], s2: [1570, 790, 720], s3: [1960, 790, 720],
    other: 'Single Arm 1S: L 79 × W 79 × H 72 cm · Single Arm 2S: L 119 × W 79 × H 72 cm' },
  { key: 'DION',          name: 'Dion',          colours: 'Warm grey / taupe',                                     s1: [750, 700, 700], s2: [1350, 700, 700], s3: [1950, 700, 700] },
  { key: 'DYLAN LEATHER', name: 'Dylan Leather', colours: 'Forest green / dark green leather',                     s1: [750, 750, 800], s2: [1350, 750, 800], s3: [1950, 750, 800] },
  { key: 'ELDA ARM',      name: 'Elda Arm',      colours: 'Cream / off-white',                                     s1: [750, 800, 770], s2: [1500, 800, 770], s3: [2080, 800, 770],
    other: 'Arm H: 58 cm · Seat H: 42 cm · Seat D: 53 cm' },
];

function sofaDimsHTML(m) {
  const cm = (v) => v / 10;
  const row = (label, d) => `${label} — L ${cm(d[0])} × W ${cm(d[1])} × H ${cm(d[2])} cm`;
  const lines = [];
  if (m.s1) lines.push(row('1 Seater', m.s1));
  if (m.s2) lines.push(row('2 Seater', m.s2));
  if (m.s3) lines.push(row('3 Seater', m.s3));
  if (m.other) lines.push(m.other);
  return lines.join('<br>');
}

const NEW_SOFA_PRODUCTS = NEW_SOFA.map(m => ({
  id: `new-sofa-${m.key}`,
  name: m.name,
  price: null,
  noPrice: true,
  category: 'NEW SOFA',
  image: `https://pub-c653cd87442949f8b7fe6e8eb0db85ef.r2.dev/${m.key.replace(/ /g, '_')}.webp`,
  desc: `${m.colours.charAt(0).toUpperCase()}${m.colours.slice(1)}.`,
  modelKey: m.key.replace(/ /g, '_'),
  dimsHTML: sofaDimsHTML(m),
}));

const SHOP_API_BASE = 'https://symmet-shop-api.iidaworkzz.workers.dev';
// R2 bucket "sofa-3d" — public dev URL. GLB keys are expected to be named
// like the product images: product code with underscores (e.g. SMKAP_CS_001.glb).
const MODEL_BASE = 'https://pub-cdfdd6db8e374af085a2724000f8977c.r2.dev';

let PRODUCTS = [];

function prettyCategory(category) {
  return category
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function prettyName(category, s_no) {
  return `${prettyCategory(category)} No. ${s_no}`;
}

async function loadProducts() {
  try {
    const res = await fetch(`${SHOP_API_BASE}/api/products`);
    const rows = await res.json();
    // note: a few rows have no price at all (min_price null) — keep them,
    // they render as "Price on request" (see priceLabel)
    PRODUCTS = rows.map(r => ({
      id: r.product_code,
      name: prettyName(r.category, r.s_no),
      price: r.min_price,
      maxPrice: r.max_price ?? r.min_price,
      category: r.category,
      image: r.image_url,
      desc: '',
    }));
  } catch (err) {
    console.error('Failed to load products from shop API', err);
    PRODUCTS = [];
  }
}

async function loadProductDetail(code) {
  const res = await fetch(`${SHOP_API_BASE}/api/products/${encodeURIComponent(code)}`);
  if (!res.ok) return null;
  return res.json();
}

const SPECS = [
  { label: 'Dimensions', body: 'W 82 × D 76 × H 70 cm. Seat height: 38 cm. Weight: 14 kg.' },
  { label: 'Materials',  body: 'Frame in solid European oak, hand-finished with natural oil. Upholstery in undyed bouclé from a small Portuguese mill. All fixings are stainless steel.' },
  { label: 'Delivery',   body: 'White-glove delivery included. Our team delivers and places the piece in your home, removing all packaging. Lead time: 3-4 weeks from order.' },
  { label: 'Warranty',   body: 'Lifetime guarantee against manufacturing defect. Covers the frame and joinery; natural wear to upholstery and wood is not a defect — it\'s character.' },
];

/* ---- STATE ---- */
let cart = [];
let currentProduct = null;
let pdpQty = 1;
let pdpVariants = [];
let selectedVariant = 0;
let activeStep = 0;
let activeFilters = {};
let specsOpen = {};
let currentPage = 'home';

/* ---- HELPERS ---- */
const fmt = (p) => `₹${(p ?? 0).toLocaleString()}`;
const priceLabel = (p) => p.price != null ? fmt(p.price) : 'Price on request';
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
}

/* ---- ROUTING ---- */
function navigate(page, opts = {}) {
  if (page === currentPage && !opts.force) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (!el) return;
  el.classList.add('active');
  currentPage = page;
  window.scrollTo(0, 0);

  // update nav visibility
  const marketingPages = ['home','studio','about'];
  const mainNav = document.getElementById('main-nav');
  mainNav.style.display = '';

  // re-render page content
  if (page === 'shop')     renderShop();
  if (page === 'store')    renderStore();
  if (page === 'product')  renderProduct(opts.product);
  if (page === 'checkout') renderCheckout();
  if (page === 'about')    initReveal();

  if (page !== 'home') initReveal();
  if (page === 'home') {
    initReveal();
    renderHomeAssurances();
    renderSteps();
  }

  // scroll to contact
  if (opts.scroll === 'contact') {
    setTimeout(() => scrollToEl(document.getElementById('contact')), 100);
  }
}

function scrollToEl(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth' });
}

/* ---- GLOBAL CLICK DELEGATION ---- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-page]');
  if (el) {
    e.preventDefault();
    const page = el.getAttribute('data-page');
    navigate(page);
  }
  // contact nav link
  if (e.target.closest('#nav-contact-link')) {
    e.preventDefault();
    if (currentPage !== 'home') { navigate('home'); setTimeout(() => scrollToEl(document.getElementById('contact')), 400); }
    else scrollToEl(document.getElementById('contact'));
  }
});

/* ---- SPLASH ---- */
function initSplash() {
  const splash = document.getElementById('splash');
  const video = document.getElementById('splash-video');

  function endSplash() {
    splash.classList.add('hidden');
    setTimeout(() => { splash.style.display = 'none'; }, 700);
  }

  document.getElementById('skip-btn').addEventListener('click', endSplash);

  // If the video can't play at all, don't leave the visitor stuck.
  video.addEventListener('error', endSplash);

  // Let the full video play, then end. Safety timeout in case 'ended' never fires.
  video.addEventListener('ended', endSplash);
  setTimeout(endSplash, 9000);
}

/* ---- NAV SCROLL + PROGRESS ---- */
function initNavScroll() {
  const pill = document.querySelector('.nav-pill');
  const fill = document.getElementById('nav-progress-fill');

  function onScroll() {
    const y = window.scrollY;
    if (y > 30) pill.classList.add('scrolled');
    else pill.classList.remove('scrolled');

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (y / max) * 100)) : 0;
    if (fill) fill.style.width = `${pct}%`;
  }

  window.addEventListener('scroll', onScroll);
  onScroll();
}

/* ---- PARALLAX ---- */
function initParallax() {
  function update() {
    document.querySelectorAll('.parallax-img').forEach(el => {
      const parent = el.parentElement;
      const rect = parent.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const offset = rect.top * 0.15;
      el.style.transform = `translateY(${offset}px) scale(1.15)`;
    });
  }
  window.addEventListener('scroll', update);
  update();
}

/* ---- MAGNETIC BUTTONS ---- */
function initMagnetic() {
  const SELECTOR = '.btn-primary, .btn-outline, .btn-bone, .btn-bone-sm';
  const STRENGTH = 0.25;

  document.addEventListener('mousemove', (e) => {
    const btn = e.target.closest(SELECTOR);
    document.querySelectorAll(SELECTOR).forEach(el => {
      if (el !== btn) el.style.transform = '';
    });
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * STRENGTH;
    const y = (e.clientY - rect.top - rect.height / 2) * STRENGTH;
    btn.style.transform = `translate(${x}px, ${y}px)`;
  });
}

/* ---- REVEAL ON SCROLL ---- */
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });

  // stagger siblings that reveal together (grids, cards)
  const groups = new Map();
  document.querySelectorAll('.reveal').forEach(el => {
    el.classList.remove('visible');
    const parent = el.parentElement;
    const i = groups.get(parent) ?? 0;
    el.style.setProperty('--stagger', Math.min(i, 5));
    groups.set(parent, i + 1);
    observer.observe(el);
  });
}

/* ---- CART ---- */
function cartTotal() { return cart.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0); }
function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const count = cartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function addToCart(product, qty = 1) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) existing.qty += qty;
  else cart.push({ ...product, qty });
  updateCartBadge();
  updateCartFooter();
  showToast(`"${product.name}" added to cart`);
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCartBadge();
  renderCartItems();
  updateCartFooter();
}

function renderCartItems() {
  const list = document.getElementById('cart-items-list');
  const empty = document.getElementById('cart-empty');
  if (cart.length === 0) {
    empty.style.display = 'flex';
    list.innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-thumb">
        <img src="${item.image}" alt="" onerror="this.onerror=null;this.src='assets/mark_slate.png';">
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-meta">×${item.qty}</div>
      </div>
      <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
      <button class="cart-item-remove" data-remove="${item.id}" aria-label="Remove">&times;</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.remove));
  });
}

function updateCartFooter() {
  const footer = document.getElementById('cart-footer');
  const totalLabel = document.getElementById('cart-total-label');
  if (cart.length > 0) {
    footer.style.display = 'block';
    totalLabel.textContent = fmt(cartTotal());
  } else {
    footer.style.display = 'none';
  }
  renderCartItems();
}

function openCart() {
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('scrim').classList.add('open');
  renderCartItems();
  updateCartFooter();
}

function closeCart() {
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('scrim').classList.remove('open');
}

function initCart() {
  document.getElementById('cart-btn').addEventListener('click', openCart);
  document.getElementById('cart-close').addEventListener('click', closeCart);
  document.getElementById('scrim').addEventListener('click', closeCart);
  document.getElementById('cart-shop-btn').addEventListener('click', () => { closeCart(); navigate('shop'); });
  document.getElementById('checkout-btn').addEventListener('click', () => { closeCart(); navigate('checkout'); });
}

/* ---- HOME ---- */
function renderHomeAssurances() {
  const grid = document.getElementById('assurance-grid-home');
  if (!grid) return;
  const items = ASSURANCES.map(a => `
    <div class="assurance-item">
      <div class="assurance-title">${a.title}</div>
      <p class="assurance-body">${a.body}</p>
    </div>
  `).join('');
  grid.innerHTML = items + items;
  initReveal();
}

function renderSteps() {
  const list = document.getElementById('steps-list');
  const bars = document.getElementById('steps-bars');
  if (!list) return;

  function renderStepBtns() {
    list.innerHTML = STEPS.map((s, i) => `
      <button class="step-btn${i === activeStep ? ' active' : ''}" data-step="${i}">
        <span class="step-num">${s.n}</span>
        <span class="step-info">
          <span class="step-title">${s.title}</span>
          <span class="step-body">${s.body}</span>
        </span>
      </button>
    `).join('');
    list.querySelectorAll('.step-btn').forEach(btn => {
      btn.addEventListener('click', () => { activeStep = Number(btn.dataset.step); renderStepBtns(); updateStepPreview(); });
    });
  }

  function updateStepPreview() {
    const s = STEPS[activeStep];
    document.getElementById('steps-cap').textContent = s.cap;
    document.getElementById('steps-line').textContent = s.line;
    if (bars) {
      bars.innerHTML = STEPS.map((_, i) => `<span class="step-bar${i === activeStep ? ' active' : ''}"></span>`).join('');
    }
  }

  renderStepBtns();
  updateStepPreview();
  initStepsScrollSync();
}

function initStepsScrollSync() {
  const list = document.getElementById('steps-list');
  if (!list) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const idx = Number(entry.target.dataset.step);
      if (idx === activeStep) return;
      activeStep = idx;
      list.querySelectorAll('.step-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.step) === idx));
      const s = STEPS[activeStep];
      document.getElementById('steps-cap').textContent = s.cap;
      document.getElementById('steps-line').textContent = s.line;
      const bars = document.getElementById('steps-bars');
      if (bars) bars.innerHTML = STEPS.map((_, i) => `<span class="step-bar${i === activeStep ? ' active' : ''}"></span>`).join('');
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  list.querySelectorAll('.step-btn').forEach(btn => observer.observe(btn));
}

function initFooterForm() {
  document.getElementById('footer-submit')?.addEventListener('click', () => {
    const email = document.getElementById('footer-email').value.trim();
    if (!email) return;
    showToast('Thanks! We\'ll be in touch.');
    document.getElementById('footer-email').value = '';
  });
}

/* ---- SHOP PAGE ---- */
function renderShop() {
  renderCategories();
  renderFeatured();
  renderAssurances('assurance-grid-shop');
  document.getElementById('browse-all-btn')?.addEventListener('click', () => navigate('store'));
  document.getElementById('view-all-link')?.addEventListener('click', (e) => { e.preventDefault(); navigate('store'); });
}

const CATEGORY_CARD_IMAGES = {
  Chairs: 'https://gqgfttnmnnhglbdaydny.supabase.co/storage/v1/object/public/shops-images/SMKAP_WC_014.png',
  Tables: 'https://gqgfttnmnnhglbdaydny.supabase.co/storage/v1/object/public/shops-images/SMKAP_CT_030.png',
  Sofas: 'https://gqgfttnmnnhglbdaydny.supabase.co/storage/v1/object/public/shops-images/SMKAP_S_001.png',
  'New Sofa': 'https://pub-c653cd87442949f8b7fe6e8eb0db85ef.r2.dev/ANDY.webp',
};

function renderCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  const cards = [...CATEGORIES, NEW_SOFA_CARD];
  grid.innerHTML = cards.map(c => `
      <div class="category-card reveal" ${c.group ? `data-group="${c.group}"` : `data-cat="${c.name}"`}>
      <img src="${CATEGORY_CARD_IMAGES[c.name] || c.img || 'assets/mark_slate.png'}" alt="${c.name}" class="category-card-bg is-photo">
      <div style="flex:1"></div>
      <div style="position:relative">
        <h3 class="category-name">${c.name}</h3>
        <span class="category-cta">Shop ${c.name} <span style="font-size:16px">&rarr;</span></span>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.group) {
        activeFilters = { group: card.dataset.group };
      } else {
        activeFilters = { category: [card.dataset.cat] };
      }
      navigate('store');
    });
  });
  initReveal();
}

/* Quietly popular — curated picks by display name: Lounge Seating No. 47, 48, 33, 9, 6
   (s_no -> code: 47->LS033, 48->LS034, 33->LS028, 9->LS009, 6->LS006) */
const FEATURED_CODES = ['SMKAP LS 033', 'SMKAP LS 034', 'SMKAP LS 009', 'SMKAP LS 006'];

function renderFeatured() {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;
  const featured = FEATURED_CODES.map(code => PRODUCTS.find(p => p.id === code)).filter(Boolean);
  grid.innerHTML = featured.map(p => productCardHTML(p)).join('');
  attachProductCardEvents(grid);
  initReveal();
}

function renderAssurances(id) {
  const grid = document.getElementById(id);
  if (!grid) return;
  const items = ASSURANCES.map(a => `
    <div class="assurance-item">
      <div class="assurance-title">${a.title}</div>
      <p class="assurance-body">${a.body}</p>
    </div>
  `).join('');
  grid.innerHTML = items + items;
}

/* ---- STORE GRID ---- */
function renderStore() {
  renderFilterBar();
  renderStoreGrid();
}

/* Category cards use display labels ('Chairs', 'Tables', ...) while the DB
   stores granular values ('WOODEN  CHAIR', 'COFFEE Table', ...). Map labels
   to keywords and compare normalized (case/whitespace-insensitive). */
const CATEGORY_KEYWORDS = {
  Chairs: ['chair'],
  Tables: ['table'],
  Sofas:  ['sofa'],
};

function normCategory(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesCategory(productCategory, filterValue) {
  const keywords = CATEGORY_KEYWORDS[filterValue];
  const prod = normCategory(productCategory);
  if (keywords) return keywords.some(k => prod.includes(k));
  return prod === normCategory(filterValue);
}

function getFilteredProducts() {
  if (activeFilters.group === 'new-sofa') return NEW_SOFA_PRODUCTS;
  return PRODUCTS.filter(p => {
    if (activeFilters.category && activeFilters.category.length > 0
        && !activeFilters.category.some(f => matchesCategory(p.category, f))) return false;
    return true;
  });
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  // showcase groups (New Sofa) have no DB categories to chip-filter on
  if (activeFilters.group) { bar.innerHTML = ''; return; }
  const categories = [...new Set(PRODUCTS.map(p => p.category))];

  const groups = [
    { label: 'Category', key: 'category', options: categories },
  ];

  bar.innerHTML = groups.map(g => `
    <div class="filter-group">
      <span class="filter-label">${g.label}</span>
      <div class="filter-options">
        ${g.options.map(o => `
          <button class="filter-chip${activeFilters[g.key]?.includes(o) ? ' active' : ''}" data-group="${g.key}" data-val="${o}">${prettyCategory(o)}</button>
        `).join('')}
      </div>
    </div>
  `).join('');

  bar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const g = chip.dataset.group;
      const v = chip.dataset.val;
      if (!activeFilters[g]) activeFilters[g] = [];
      const idx = activeFilters[g].indexOf(v);
      if (idx === -1) activeFilters[g].push(v);
      else activeFilters[g].splice(idx, 1);
      renderFilterBar();
      renderStoreGrid();
      renderActiveFilters();
    });
  });
}

function renderActiveFilters() {
  const el = document.getElementById('active-filters');
  if (!el) return;
  const chips = [];
  Object.entries(activeFilters).forEach(([g, vals]) => {
    if (g === 'group') { if (vals) chips.push({ g, v: vals }); return; }
    vals.forEach(v => chips.push({ g, v }));
  });
  if (chips.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const chipLabel = (c) => c.g === 'group' ? (c.v === 'new-sofa' ? 'New Sofa' : c.v) : prettyCategory(c.v);
  el.innerHTML = chips.map(c => `<button class="active-chip" data-group="${c.g}" data-val="${c.v}">${chipLabel(c)} <span style="font-size:15px;opacity:.8">&times;</span></button>`).join('') +
    `<button class="clear-all-btn">Clear all</button>`;
  el.querySelectorAll('.active-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.group;
      const v = btn.dataset.val;
      if (g === 'group') delete activeFilters.group;
      else activeFilters[g] = activeFilters[g].filter(x => x !== v);
      renderFilterBar();
      renderStoreGrid();
      renderActiveFilters();
    });
  });
  el.querySelector('.clear-all-btn')?.addEventListener('click', () => {
    activeFilters = {};
    renderFilterBar();
    renderStoreGrid();
    renderActiveFilters();
  });
}

function renderStoreGrid() {
  const grid = document.getElementById('store-grid');
  const empty = document.getElementById('store-empty');
  const count = document.getElementById('result-count');
  if (!grid) return;

  const products = getFilteredProducts();
  count.textContent = `${products.length} piece${products.length !== 1 ? 's' : ''}`;

  if (products.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'flex';
    document.getElementById('clear-filters-empty')?.addEventListener('click', () => {
      activeFilters = {};
      renderFilterBar();
      renderStoreGrid();
      renderActiveFilters();
    });
    return;
  }

  grid.style.display = 'grid';
  empty.style.display = 'none';
  grid.innerHTML = products.map(p => productCardHTML(p)).join('');
  attachProductCardEvents(grid);
  renderActiveFilters();
  initReveal();
}

function productCardHTML(p) {
  return `
    <div class="product-card reveal" data-product-id="${p.id}">
      <div class="product-card-img">
        <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='assets/mark_slate.png';">
        <span class="product-cat-label">${prettyCategory(p.category)}</span>
        ${p.noPrice ? '' : `<button class="quick-add" data-product-id="${p.id}" aria-label="Quick add">+</button>`}
      </div>
      <div class="product-card-meta">
        <span class="product-card-name">${p.name}</span>
        <span class="product-card-price">${p.noPrice ? '' : priceLabel(p)}</span>
      </div>
    </div>
  `;
}

function findProductById(id) {
  return PRODUCTS.find(p => p.id === id) || NEW_SOFA_PRODUCTS.find(p => p.id === id);
}

function attachProductCardEvents(container) {
  container.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.quick-add')) return;
      const id = card.dataset.productId;
      const product = findProductById(id);
      navigate('product', { product });
    });
  });
  container.querySelectorAll('.quick-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.productId;
      const product = findProductById(id);
      if (product) addToCart(product, 1);
    });
  });
}

/* ---- 3D MODEL VIEWER ---- */
const modelCheckCache = new Map();

function modelUrlFor(product) {
  const key = product.modelKey || String(product.id).trim().replace(/\s+/g, '_');
  return `${MODEL_BASE}/${key}.glb`;
}

async function findModelUrl(product) {
  if (modelCheckCache.has(product.id)) return modelCheckCache.get(product.id);
  const url = modelUrlFor(product);
  let found = null;
  try { if ((await fetch(url, { method: 'HEAD' })).ok) found = url; } catch { /* offline/blocked */ }
  modelCheckCache.set(product.id, found);
  return found;
}

function openModel(url) {
  document.getElementById('model-viewer').src = url;
  document.getElementById('model-modal').style.display = 'flex';
}

function closeModel() {
  document.getElementById('model-modal').style.display = 'none';
  document.getElementById('model-viewer').src = '';
}

/* ---- PRODUCT DETAIL ---- */
function variantTopOptions(v) {
  return [['Laminate', v.top_details_laminate], ['Veneer', v.top_details_veneer],
          ['PU', v.top_details_pu], ['Glass', v.top_details_glass], ['Other', v.top_details_other]]
    .filter(([, p]) => p != null);
}

function variantPriceHTML(v) {
  const final = v.display_price ?? v.final_price ?? v.price;
  // tables price per top finish (laminate/veneer/PU/glass) — show the full breakdown
  const tops = variantTopOptions(v);
  if (tops.length > 1) {
    const minP = Math.min(...tops.map(([, p]) => p));
    return `${fmt(final ?? minP)} <div style="font-size:14px;font-weight:400;margin-top:8px;color:rgba(27,37,56,.65)">` +
      tops.map(([n, p]) => `${n} ${fmt(p)}`).join(' &middot; ') + '</div>';
  }
  if (final == null) return tops.length === 1 ? fmt(tops[0][1]) : 'Price on request';
  const pct = v.discount ? Math.round(v.discount * 100) : 0;
  let html = fmt(final);
  if (v.price != null && pct > 0 && v.price > final) {
    html += `&nbsp; <span style="opacity:.45;text-decoration:line-through;font-size:.62em">${fmt(v.price)}</span>` +
      `&nbsp; <span style="font-size:.5em;letter-spacing:.12em;color:#405B72;font-weight:600">${pct}% OFF</span>`;
  }
  return html;
}

function renderVariantPicker() {
  const row = document.getElementById('pdp-variants');
  const opts = document.getElementById('pdp-variant-options');
  if (!row || !opts) return;
  if (pdpVariants.length < 2) { row.style.display = 'none'; opts.innerHTML = ''; return; }
  row.style.display = 'flex';
  const lbl = document.getElementById('pdp-variants-label');
  if (lbl) lbl.textContent = pdpVariants.some(v => v.seater) ? 'Seater' : 'Size';
  opts.innerHTML = pdpVariants.map((v, i) => {
    const label = v.seater || (v.size ? v.size.replace(/\s*[Xx]\s*/g, '×') : `Option ${i + 1}`);
    return `<button class="filter-chip${i === selectedVariant ? ' active' : ''}" data-vi="${i}">${label}</button>`;
  }).join('');
  opts.querySelectorAll('[data-vi]').forEach(btn =>
    btn.addEventListener('click', () => applyVariant(Number(btn.dataset.vi))));
}

function applyVariant(i) {
  const v = pdpVariants[i];
  if (!v) return;
  selectedVariant = i;
  document.querySelectorAll('#pdp-variant-options .filter-chip')
    .forEach(b => b.classList.toggle('active', Number(b.dataset.vi) === i));
  document.getElementById('pdp-price').innerHTML = variantPriceHTML(v);
  if (v.description) document.getElementById('pdp-desc').textContent = v.description;
  const dimsBody = document.getElementById('spec-body-0');
  if (dimsBody && v.length_mm) {
    const cm = (mm) => mm / 10;
    let dims = v.is_diameter
      ? `Ø ${cm(v.width_or_diameter_mm)} × H ${cm(v.height_mm)} cm.`
      : `W ${cm(v.length_mm)} × D ${cm(v.width_or_diameter_mm)} × H ${cm(v.height_mm)} cm.`;
    if (v.seater) dims += ` ${v.seater}.`;
    dimsBody.textContent = dims;
  }
  // base material (mostly tables: "ASH WOOD with polish")
  const matBody = document.getElementById('spec-body-1');
  if (matBody && v.base) matBody.textContent = `${v.base.trim()}.`;
}

async function renderProduct(product) {
  if (!product) return;
  currentProduct = product;
  pdpQty = 1;
  pdpVariants = [];
  selectedVariant = 0;

  document.getElementById('pdp-cat').textContent = prettyCategory(product.category);
  document.getElementById('pdp-name').textContent = product.name;
  const priceEl = document.getElementById('pdp-price');
  priceEl.textContent = priceLabel(product);
  priceEl.style.display = product.noPrice ? 'none' : '';
  // showcase pieces (New Sofa): no purchase controls
  const qtyRow = document.querySelector('.qty-row');
  if (qtyRow) qtyRow.style.display = product.noPrice ? 'none' : '';
  document.getElementById('pdp-desc').textContent = product.desc || '';
  document.getElementById('qty-val').textContent = pdpQty;

  const img = document.getElementById('pdp-image');
  const shotLabel = document.getElementById('pdp-shot-label');
  if (product.image) {
    img.src = product.image;
    img.onerror = () => { img.src = 'assets/mark_slate.png'; shotLabel.style.display = ''; };
    shotLabel.style.display = 'none';
  }

  // thumbs
  const thumbs = document.getElementById('product-thumbs');
  thumbs.innerHTML = [1,2,3].map((_, i) => `<span class="product-thumb${i===0?' active':''}"></span>`).join('');

  document.getElementById('pdp-variants') && (document.getElementById('pdp-variants').style.display = 'none');

  const detail = await loadProductDetail(product.id);
  if (detail && currentProduct === product) {
    pdpVariants = detail.variants || [];
    selectedVariant = 0;
    renderVariantPicker();
    if (pdpVariants[0]) {
      applyVariant(0);
      currentProduct.desc = pdpVariants[0].description || '';
    }
  }

  // specs accordion
  specsOpen = {};
  const acc = document.getElementById('specs-accordion');
  acc.innerHTML = SPECS.map((s, i) => `
    <div>
      <button class="spec-btn" data-spec="${i}">
        ${s.label} <span class="spec-sign">+</span>
      </button>
      <p class="spec-body" id="spec-body-${i}" style="display:none">${s.body}</p>
    </div>
  `).join('');

  acc.querySelectorAll('.spec-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.spec;
      specsOpen[idx] = !specsOpen[idx];
      const body = document.getElementById(`spec-body-${idx}`);
      body.style.display = specsOpen[idx] ? 'block' : 'none';
      btn.querySelector('.spec-sign').textContent = specsOpen[idx] ? '−' : '+';
    });
  });

  // accordion now exists — re-apply selected variant so dimensions land
  if (pdpVariants.length) applyVariant(selectedVariant);

  // showcase pieces carry their own static dimensions (from the catalogue)
  if (product.dimsHTML) {
    const dimsBody = document.getElementById('spec-body-0');
    if (dimsBody) dimsBody.innerHTML = product.dimsHTML;
  }

  // 3D view — only shown when a GLB actually exists for this product
  const btn3d = document.getElementById('view-3d-btn');
  btn3d.style.display = 'none';
  findModelUrl(product).then(url => {
    if (url && currentProduct === product) {
      btn3d.style.display = 'block';
      btn3d.onclick = () => openModel(url);
    }
  });

  // qty
  document.getElementById('qty-dec').onclick = () => { if (pdpQty > 1) { pdpQty--; document.getElementById('qty-val').textContent = pdpQty; } };
  document.getElementById('qty-inc').onclick = () => { pdpQty++; document.getElementById('qty-val').textContent = pdpQty; };
  document.getElementById('add-to-cart-btn').onclick = () => {
    const v = pdpVariants[selectedVariant];
    const final = v ? (v.display_price ?? v.final_price ?? v.price) : null;
    const item = (v && final != null)
      ? {
          ...currentProduct,
          id: v.seater ? `${currentProduct.id} · ${v.seater}` : currentProduct.id,
          name: v.seater ? `${currentProduct.name} · ${v.seater}` : currentProduct.name,
          price: final,
        }
      : currentProduct;
    addToCart(item, pdpQty);
  };
  document.getElementById('product-back').onclick = (e) => { e.preventDefault(); navigate('store'); };

  // related
  const related = PRODUCTS.filter(p => p.id !== product.id).sort(() => Math.random() - .5).slice(0, 3);
  const relGrid = document.getElementById('related-grid');
  relGrid.innerHTML = related.map(p => productCardHTML(p)).join('');
  attachProductCardEvents(relGrid);
  initReveal();
}

/* ---- STUDIO PAGE ---- */
function initStudio() {
  document.getElementById('studio-join')?.addEventListener('click', () => {
    const email = document.getElementById('studio-email').value.trim();
    if (!email) return;
    document.getElementById('studio-form').style.display = 'none';
    document.getElementById('studio-joined').style.display = 'block';
    showToast('You\'re on the waitlist!');
  });
}

/* ---- CHECKOUT PAGE ---- */
function renderCheckout() {
  const items = document.getElementById('summary-items');
  const total = document.getElementById('summary-total');
  if (!items) return;

  items.innerHTML = cart.map(c => `
    <div class="summary-item">
      <span>${c.name} ×${c.qty}</span>
      <span>${fmt(c.price * c.qty)}</span>
    </div>
  `).join('');

  total.textContent = fmt(cartTotal());

  document.getElementById('order-success').style.display = 'none';
  document.getElementById('checkout-form-wrap').style.display = 'block';

  document.getElementById('place-order-btn').onclick = async () => {
    window.location.href = 'tel:+919818381951';
    return;

    const field = (id) => document.getElementById(id).value.trim();
    const order = {
      firstName: field('co-first'),
      lastName: field('co-last'),
      email: field('co-email'),
      address: field('co-address'),
      city: field('co-city'),
      postcode: field('co-postcode'),
      items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
      total: cartTotal(),
    };
    if (!order.firstName || !order.lastName || !order.email || !order.address || !order.city || !order.postcode) {
      showToast('Fill in all shipping fields to place your order.');
      return;
    }

    const btn = document.getElementById('place-order-btn');
    btn.disabled = true;
    btn.textContent = 'Placing order...';
    try {
      const res = await fetch(`${SHOP_API_BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      if (!res.ok) throw new Error('checkout failed');
      const { orderNo } = await res.json();
      document.getElementById('order-no').textContent = orderNo;
      document.getElementById('order-success').style.display = 'flex';
      document.getElementById('checkout-form-wrap').style.display = 'none';
      cart = [];
      updateCartBadge();
      updateCartFooter();
    } catch (err) {
      console.error('Failed to place order', err);
      showToast('Could not place your order — please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Place order';
    }
  };
}

/* ---- SHOP PREVIEW CAROUSEL ---- */
function initShopCarousel() {
  const carousel = document.getElementById('shop-carousel');
  if (!carousel) return;
  const items = Array.from(carousel.querySelectorAll('.shop-carousel-item'));
  const dots = Array.from(document.querySelectorAll('#shop-carousel-dots .shop-carousel-dot'));
  const n = items.length;
  let active = 0;
  let timer = null;

  function render() {
    items.forEach((item, i) => {
      const offset = (i - active + n) % n;
      item.dataset.pos = offset === 0 ? 'active' : (offset === 1 ? 'right' : 'left');
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === active));
  }

  function advance() {
    active = (active + 1) % n;
    render();
  }

  function startAutoplay() {
    stopAutoplay();
    timer = setInterval(advance, 1000);
  }
  function stopAutoplay() {
    if (timer) clearInterval(timer);
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      active = Number(dot.dataset.index);
      render();
      startAutoplay();
    });
  });

  carousel.addEventListener('mouseenter', stopAutoplay);
  carousel.addEventListener('mouseleave', startAutoplay);

  render();
  startAutoplay();
}

/* ---- INIT ---- */
async function init() {
  initSplash();
  initNavScroll();
  initParallax();
  initMagnetic();
  initCart();
  initStudio();
  initFooterForm();
  initShopCarousel();

  // 3D modal close handlers
  document.getElementById('model-close')?.addEventListener('click', closeModel);
  document.getElementById('model-modal')?.addEventListener('click', (e) => { if (e.target.id === 'model-modal') closeModel(); });

  // Initial page
  navigate('home', { force: true });
  setTimeout(initReveal, 600);

  await loadProducts();
  renderFeatured();
  if (currentPage === 'store') renderStore();
}

document.addEventListener('DOMContentLoaded', init);
