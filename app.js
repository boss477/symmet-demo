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
  { tag: 'SEATING',    name: 'Chairs',        count: 14, blurb: 'From sculptural dining chairs to low loungers built for the long sit.' },
  { tag: 'STORAGE',   name: 'Shelving',       count: 8,  blurb: 'Open oak systems that hold books, objects, and breathing room alike.' },
  { tag: 'SURFACES',  name: 'Tables',         count: 11, blurb: 'Dining tables, coffee tables, and side tables in travertine and oak.' },
  { tag: 'LIGHTING',  name: 'Lighting',       count: 6,  blurb: 'Quiet pendants and floor lamps that cast warm, directional light.' },
];

const SHOP_API_BASE = 'https://symmet-shop-api.iidaworkzz.workers.dev';

let PRODUCTS = [];

function prettyName(code, category) {
  const suffix = code.replace(/^SMKAP[\s-]*/i, '').trim();
  return `${category} ${suffix}`;
}

async function loadProducts() {
  try {
    const res = await fetch(`${SHOP_API_BASE}/api/products`);
    const rows = await res.json();
    PRODUCTS = rows.map(r => ({
      id: r.product_code,
      name: prettyName(r.product_code, r.category),
      price: r.min_price,
      maxPrice: r.max_price,
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
  { label: 'Delivery',   body: 'White-glove delivery included. Our team delivers and places the piece in your home, removing all packaging. Lead time: 6–10 weeks from order.' },
  { label: 'Warranty',   body: 'Lifetime guarantee against manufacturing defect. Covers the frame and joinery; natural wear to upholstery and wood is not a defect — it\'s character.' },
];

/* ---- STATE ---- */
let cart = [];
let currentProduct = null;
let pdpQty = 1;
let activeStep = 0;
let activeFilters = {};
let specsOpen = {};
let currentPage = 'home';

/* ---- HELPERS ---- */
const fmt = (p) => `£${p.toLocaleString()}`;
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
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
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

function renderCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  grid.innerHTML = CATEGORIES.map(c => `
    <div class="category-card reveal" data-cat="${c.name}">
      <img src="assets/mark_slate.png" alt="" class="category-card-bg">
      <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-start">
        <span class="category-tag">${c.tag}</span>
        <span class="category-count">${c.count} pieces</span>
      </div>
      <div style="flex:1"></div>
      <div style="position:relative">
        <h3 class="category-name">${c.name}</h3>
        <p class="category-blurb">${c.blurb}</p>
        <span class="category-cta">Shop ${c.name} <span style="font-size:16px">&rarr;</span></span>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.dataset.cat;
      activeFilters = { category: [cat] };
      navigate('store');
    });
  });
  initReveal();
}

function renderFeatured() {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;
  const featured = PRODUCTS.slice(0, 4);
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

function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (activeFilters.category && activeFilters.category.length > 0 && !activeFilters.category.includes(p.category)) return false;
    return true;
  });
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const categories = [...new Set(PRODUCTS.map(p => p.category))];

  const groups = [
    { label: 'Category', key: 'category', options: categories },
  ];

  bar.innerHTML = groups.map(g => `
    <div class="filter-group">
      <span class="filter-label">${g.label}</span>
      <div class="filter-options">
        ${g.options.map(o => `
          <button class="filter-chip${activeFilters[g.key]?.includes(o) ? ' active' : ''}" data-group="${g.key}" data-val="${o}">${o}</button>
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
    vals.forEach(v => chips.push({ g, v }));
  });
  if (chips.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = chips.map(c => `<button class="active-chip" data-group="${c.g}" data-val="${c.v}">${c.v} <span style="font-size:15px;opacity:.8">&times;</span></button>`).join('') +
    `<button class="clear-all-btn">Clear all</button>`;
  el.querySelectorAll('.active-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.group;
      const v = btn.dataset.val;
      activeFilters[g] = activeFilters[g].filter(x => x !== v);
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
        <span class="product-cat-label">${p.category}</span>
        <button class="quick-add" data-product-id="${p.id}" aria-label="Quick add">+</button>
      </div>
      <div class="product-card-meta">
        <span class="product-card-name">${p.name}</span>
        <span class="product-card-price">${fmt(p.price)}${p.maxPrice > p.price ? '+' : ''}</span>
      </div>
    </div>
  `;
}

function attachProductCardEvents(container) {
  container.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.quick-add')) return;
      const id = card.dataset.productId;
      const product = PRODUCTS.find(p => p.id === id);
      navigate('product', { product });
    });
  });
  container.querySelectorAll('.quick-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.productId;
      const product = PRODUCTS.find(p => p.id === id);
      if (product) addToCart(product, 1);
    });
  });
}

/* ---- PRODUCT DETAIL ---- */
async function renderProduct(product) {
  if (!product) return;
  currentProduct = product;
  pdpQty = 1;

  document.getElementById('pdp-cat').textContent = product.category;
  document.getElementById('pdp-name').textContent = product.name;
  document.getElementById('pdp-price').textContent = fmt(product.price);
  document.getElementById('pdp-desc').textContent = product.desc;
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

  const detail = await loadProductDetail(product.id);
  if (detail && currentProduct === product) {
    const desc = detail.variants?.[0]?.description || '';
    document.getElementById('pdp-desc').textContent = desc;
    currentProduct.desc = desc;
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

  // qty
  document.getElementById('qty-dec').onclick = () => { if (pdpQty > 1) { pdpQty--; document.getElementById('qty-val').textContent = pdpQty; } };
  document.getElementById('qty-inc').onclick = () => { pdpQty++; document.getElementById('qty-val').textContent = pdpQty; };
  document.getElementById('add-to-cart-btn').onclick = () => addToCart(currentProduct, pdpQty);
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

  // Initial page
  navigate('home', { force: true });
  setTimeout(initReveal, 600);

  await loadProducts();
  renderFeatured();
  if (currentPage === 'store') renderStore();
}

document.addEventListener('DOMContentLoaded', init);
