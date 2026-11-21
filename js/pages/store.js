/* NewMart — Public storefront page */
(function () {
  'use strict';
  const { data, ui } = window.NM;
  const { getStores, getStoreBySlug, getProductsByStore, getStoreRating, getProductById, addToCart, formatNaira } = data;
  const { initSharedUI, renderProductGrid, showToast, openCartDrawer, openCheckoutModal, openModal, closeModal, icon } = ui;

  let currentStore = null;
  let currentFilter = 'all';

  function init() {
    initSharedUI();
    loadStore();
  }

  function loadStore() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('id') || 'adaeze-styles';
    const productId = params.get('product');

    const store = getStoreBySlug(slug) || getStores()[0];
    currentStore = store;

    if (store.status === 'suspended') {
      document.querySelector('main').innerHTML = `
        <section class="section"><div class="container empty-state">
          <h2>Store temporarily unavailable</h2>
          <p>This store has been suspended by NewMart. Please browse other stores.</p>
          <a href="index.html" class="btn btn-primary" style="margin-top:16px;">Back to marketplace</a>
        </div></section>`;
      initSharedUI();
      return;
    }

    document.getElementById('store-name').textContent = store.name;
    document.getElementById('store-location').textContent = store.location;
    document.getElementById('store-cover').src = store.cover;
    document.getElementById('store-logo').src = store.logo;
    document.getElementById('store-logo').alt = `${store.name} logo`;
    document.getElementById('store-about').textContent = `${store.description} Orders within Port Harcourt ship same or next day; the delivery fee is shown at checkout before you pay. Questions? Call ${store.phone}.`;
    document.getElementById('store-phone').textContent = store.phone;
    document.getElementById('about-image').src = store.logo;
    document.getElementById('about-image').alt = `Products at ${store.name}`;

    const r = getStoreRating(store.id);
    document.getElementById('store-rating').innerHTML = `${icon('star')} ${r.rating.toFixed(1)} <span style="color:var(--muted);font-weight:400;">(${r.count} delivered)</span>`;
    document.title = `${store.name} — NewMart`;

    renderChips(store);
    renderStoreProducts();

    document.getElementById('btn-follow')?.addEventListener('click', () => showToast(`You are now following ${store.name}`));
    document.getElementById('btn-chat')?.addEventListener('click', () => showToast(`Chat request sent to ${store.name}. They will reply shortly.`));
    document.getElementById('store-checkout')?.addEventListener('click', () => {
      if (!getProductsByStore(store.id).some(p => p.stock > 0)) { showToast('This store has no items in stock right now.'); return; }
      openCartDrawer();
    });

    if (productId) openProductModal(productId);
  }

  function renderChips(store) {
    const products = getProductsByStore(store.id);
    const categories = ['all', ...new Set(products.map(p => p.category))];
    const container = document.getElementById('store-chips');
    container.innerHTML = categories.map(c => `<button class="chip ${c === 'all' ? 'active' : ''}" data-filter="${c}">${c === 'all' ? 'All products' : c}</button>`).join('');
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderStoreProducts();
    });
  }

  function renderStoreProducts() {
    let products = getProductsByStore(currentStore.id).filter(p => p.status !== 'archived');
    if (currentFilter !== 'all') products = products.filter(p => p.category === currentFilter);
    renderProductGrid(document.getElementById('store-products'), products);
  }

  function openProductModal(productId) {
    const product = getProductById(productId);
    if (!product || product.storeId !== currentStore.id) return;
    openModal(product.name, `
      <img src="${product.image}" alt="${product.name}" style="width:100%;border-radius:var(--radius-card);margin-bottom:16px;">
      <p class="card-price" style="font-size:1.5rem;margin-bottom:12px;">${formatNaira(product.price)}</p>
      <p class="text-muted" style="margin-bottom:16px;">${product.description}</p>
      <p class="${product.stock <= 0 ? 'stock-out' : product.stock <= 5 ? 'stock-low' : 'stock-ok'}" style="margin-bottom:16px;">
        ${product.stock <= 0 ? 'Out of stock' : product.stock <= 5 ? `Only ${product.stock} left` : `${product.stock} in stock`}
      </p>
      <button class="btn btn-primary btn-block" id="modal-add-cart" ${product.stock <= 0 ? 'disabled' : ''}>${product.stock <= 0 ? 'Out of stock' : 'Add to basket'}</button>
    `);
    setTimeout(() => {
      document.getElementById('modal-add-cart')?.addEventListener('click', () => {
        if (product.stock > 0) {
          addToCart(product, 1);
          ui.updateCartCount();
          showToast(`${product.name} added to cart`);
          closeModal();
        }
      });
    }, 0);
  }

  init();
})();
