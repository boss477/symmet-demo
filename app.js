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

const PRODUCTS = [
  { id:1,  name: 'Brøm Lounge Chair',    price: 3200,  category: 'Chairs',   material: 'Oak & Bouclé',     room: 'Living',  desc: 'A low-slung lounge chair with curved oak legs and undyed bouclé upholstery. Wide enough to sink into; light enough to move easily.' },
  { id:2,  name: 'Kaland Side Table',    price: 980,   category: 'Tables',   material: 'Honed Travertine', room: 'Living',  desc: 'A solid travertine side table with a deliberately thick top and tapered legs. The natural vein pattern means no two are the same.' },
  { id:3,  name: 'Orm Shelving Unit',    price: 2400,  category: 'Shelving', material: 'Solid Oak',        room: 'Study',   desc: 'A modular open shelving system in solid oak with adjustable shelves and concealed fixings. Designed to age with your collection.' },
  { id:4,  name: 'Halv Pendant Light',   price: 640,   category: 'Lighting', material: 'Spun Aluminium',   room: 'Dining',  desc: 'A hand-spun aluminium pendant with a linen cord and dimmable warm-white bulb included. Casts a soft pool of light over a table.' },
  { id:5,  name: 'Flong Dining Chair',   price: 1100,  category: 'Chairs',   material: 'Oak & Leather',    room: 'Dining',  desc: 'A dining chair with a slender oak frame and hand-stitched natural leather seat. Comfortable enough for a long dinner, considered enough for every day.' },
  { id:6,  name: 'Strid Coffee Table',   price: 1800,  category: 'Tables',   material: 'Smoked Oak',       room: 'Living',  desc: 'A coffee table in smoked solid oak with a gently bowed top surface. Low, grounded, and quiet at the centre of a room.' },
  { id:7,  name: 'Grøv Floor Lamp',      price: 760,   category: 'Lighting', material: 'Blackened Steel',  room: 'Living',  desc: 'A floor lamp in blackened steel with a pivoting arm and linen shade. Directional but soft — designed to light a corner, not fill a room.' },
  { id:8,  name: 'Lund Dining Table',    price: 4200,  category: 'Tables',   material: 'Solid Oak',        room: 'Dining',  desc: 'A large dining table in solid European oak with a hand-planed top and hand-cut mortice-and-tenon joinery. Seats six to eight comfortably.' },
  { id:9,  name: 'Moss Reading Chair',   price: 2100,  category: 'Chairs',   material: 'Oak & Linen',      room: 'Study',   desc: 'A high-backed reading chair with solid oak legs and a linen upholstered seat and back. Quiet and enveloping; made for long afternoons.' },
  { id:10, name: 'Veir Shelving System', price: 3100,  category: 'Shelving', material: 'Oiled Oak',        room: 'Living',  desc: 'A floor-to-ceiling shelving system with oiled oak uprights and adjustable shelves. Designed to hold books, ceramics, and negative space.' },
  { id:11, name: 'Kalk Pendant Set',     price: 1280,  category: 'Lighting', material: 'Spun Ceramic',     room: 'Dining',  desc: 'A set of three hand-spun ceramic pendants on linen cords, designed to cluster over a dining table. Each shade is slightly different.' },
  { id:12, name: 'Tjorn Side Chair',     price: 890,   category: 'Chairs',   material: 'Beech & Rattan',   room: 'Dining',  desc: 'A light dining chair with a beech frame and rattan seat. Stackable, easy to move, and quiet enough to disappear into a room.' },
];

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
    setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }
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
    if (currentPage !== 'home') { navigate('home'); setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 400); }
    else document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  }
});

/* ---- SPLASH ---- */
function initSplash() {
  const splash = document.getElementById('splash');
  const video = document.getElementById('splash-video');
  const fallback = document.getElementById('splash-fallback');

  function endSplash() {
    splash.classList.add('hidden');
    setTimeout(() => { splash.style.display = 'none'; }, 700);
  }

  document.getElementById('skip-btn').addEventListener('click', endSplash);

  video.addEventListener('error', () => {
    video.style.display = 'none';
    fallback.style.display = 'flex';
  });

  // Auto-end after video ends or after 5s
  video.addEventListener('ended', endSplash);
  setTimeout(endSplash, 5200);
}

/* ---- NAV SCROLL ---- */
function initNavScroll() {
  const pill = document.querySelector('.nav-pill');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) pill.classList.add('scrolled');
    else pill.classList.remove('scrolled');
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

  document.querySelectorAll('.reveal').forEach(el => {
    el.classList.remove('visible');
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
        <img src="assets/mark_slate.png" alt="">
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-meta">${item.material} &middot; ×${item.qty}</div>
      </div>
      <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
      <button class="cart-item-remove" data-remove="${item.id}" aria-label="Remove">&times;</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.remove)));
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
  grid.innerHTML = ASSURANCES.map(a => `
    <div class="assurance-item reveal">
      <div class="assurance-title">${a.title}</div>
      <p class="assurance-body">${a.body}</p>
    </div>
  `).join('');
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
  grid.innerHTML = ASSURANCES.map(a => `
    <div class="assurance-item">
      <div class="assurance-title">${a.title}</div>
      <p class="assurance-body">${a.body}</p>
    </div>
  `).join('');
}

/* ---- STORE GRID ---- */
function renderStore() {
  renderFilterBar();
  renderStoreGrid();
}

function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (activeFilters.category && activeFilters.category.length > 0 && !activeFilters.category.includes(p.category)) return false;
    if (activeFilters.room && activeFilters.room.length > 0 && !activeFilters.room.includes(p.room)) return false;
    return true;
  });
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const categories = [...new Set(PRODUCTS.map(p => p.category))];
  const rooms = [...new Set(PRODUCTS.map(p => p.room))];

  const groups = [
    { label: 'Category', key: 'category', options: categories },
    { label: 'Room',     key: 'room',     options: rooms },
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
        <img src="assets/mark_slate.png" alt="${p.name}">
        <span class="product-cat-label">${p.category}</span>
        <button class="quick-add" data-product-id="${p.id}" aria-label="Quick add">+</button>
      </div>
      <div class="product-card-meta">
        <span class="product-card-name">${p.name}</span>
        <span class="product-card-price">${fmt(p.price)}</span>
      </div>
      <div class="product-card-sub">${p.material} &middot; ${p.room}</div>
    </div>
  `;
}

function attachProductCardEvents(container) {
  container.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.quick-add')) return;
      const id = Number(card.dataset.productId);
      const product = PRODUCTS.find(p => p.id === id);
      navigate('product', { product });
    });
  });
  container.querySelectorAll('.quick-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.productId);
      const product = PRODUCTS.find(p => p.id === id);
      if (product) addToCart(product, 1);
    });
  });
}

/* ---- PRODUCT DETAIL ---- */
function renderProduct(product) {
  if (!product) return;
  currentProduct = product;
  pdpQty = 1;

  document.getElementById('pdp-cat').textContent = product.category;
  document.getElementById('pdp-name').textContent = product.name;
  document.getElementById('pdp-price').textContent = fmt(product.price);
  document.getElementById('pdp-desc').textContent = product.desc;
  document.getElementById('qty-val').textContent = pdpQty;

  // thumbs
  const thumbs = document.getElementById('product-thumbs');
  thumbs.innerHTML = [1,2,3].map((_, i) => `<span class="product-thumb${i===0?' active':''}"></span>`).join('');

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

  document.getElementById('place-order-btn').onclick = () => {
    const orderNo = `SYM-${Math.floor(Math.random() * 90000 + 10000)}`;
    document.getElementById('order-no').textContent = orderNo;
    document.getElementById('order-success').style.display = 'flex';
    document.getElementById('checkout-form-wrap').style.display = 'none';
    cart = [];
    updateCartBadge();
    updateCartFooter();
  };
}

/* ---- INIT ---- */
function init() {
  initSplash();
  initNavScroll();
  initCart();
  initStudio();
  initFooterForm();

  // Initial page
  navigate('home', { force: true });
  setTimeout(initReveal, 600);
}

document.addEventListener('DOMContentLoaded', init);
