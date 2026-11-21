/* NewMart — Marketplace home page */
(function () {
  'use strict';
  const { data, ui } = window.NM;
  const { getStores, getProducts, getStoreRating, formatNaira } = data;
  const { initSharedUI, renderProductGrid, icon } = ui;

  function init() {
    initSharedUI();
    renderCategories();
    renderStores();
    renderProducts('all');
    bindFilters();
    bindSearch();
  }

  function renderCategories() {
    const categories = [
      { name: 'Fashion & Tailoring', image: 'assets/store-fashion.jpg' },
      { name: 'Groceries & Foodstuff', image: 'assets/store-groceries.jpg' },
      { name: 'Electronics & Gadgets', image: 'assets/store-electronics.jpg' },
      { name: 'Phones & Accessories', image: 'assets/store-electronics.jpg' },
      { name: 'Beauty & Personal Care', image: 'assets/store-fashion.jpg' },
      { name: 'Home & Living', image: 'assets/store-groceries.jpg' },
    ];
    const grid = document.getElementById('category-grid');
    if (!grid) return;
    grid.innerHTML = categories.map(c => `
      <a href="store.html?category=${encodeURIComponent(c.name)}" class="category-tile">
        <img src="${c.image}" alt="${c.name}" width="400" height="400" loading="lazy">
        <span>${c.name}</span>
      </a>
    `).join('');
  }

  function renderStores() {
    const stores = getStores();
    const grid = document.getElementById('store-grid');
    if (!grid) return;
    grid.innerHTML = stores.map(s => {
      const r = getStoreRating(s.id);
      return `
        <article class="store-card" data-motion="fade-up">
          <img src="${s.logo}" alt="${s.name} logo" width="120" height="120" loading="lazy">
          <div>
            <h3><a href="store.html?id=${s.slug}">${s.name}</a></h3>
            <p class="card-meta">${s.category} · ${s.location}</p>
            <p class="text-muted" style="font-size:0.95rem;">${s.description.slice(0, 100)}…</p>
            <div class="rating">${icon('star')} ${r.rating.toFixed(1)} <span style="color:var(--muted);font-weight:400;">(${r.count} delivered)</span></div>
            <div style="margin-top:12px;"><a href="store.html?id=${s.slug}" class="btn btn-sm btn-primary">Shop store</a></div>
          </div>
        </article>`;
    }).join('');
  }

  function renderProducts(filter) {
    let products = getProducts().filter(p => p.status !== 'archived');
    if (filter !== 'all') products = products.filter(p => p.category === filter || p.storeId === filter);
    renderProductGrid(document.getElementById('product-grid'), products);
  }

  function bindFilters() {
    document.getElementById('filter-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderProducts(chip.dataset.filter);
    });
  }

  function bindSearch() {
    const input = document.getElementById('hero-search');
    const btn = document.getElementById('hero-search-btn');
    const doSearch = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { renderProducts('all'); return; }
      const stores = getStores();
      const filtered = getProducts().filter(p => {
        const store = stores.find(s => s.id === p.storeId);
        return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (store && store.name.toLowerCase().includes(q));
      });
      renderProductGrid(document.getElementById('product-grid'), filtered);
      document.getElementById('picks')?.scrollIntoView({ behavior: 'smooth' });
    };
    btn?.addEventListener('click', doSearch);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  }

  init();
})();
