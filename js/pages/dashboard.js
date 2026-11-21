/* NewMart — Seller / buyer dashboard page */
(function () {
  'use strict';
  const { data, auth, ui } = window.NM;
  const { getStoreById, getProductsByStore, getOrdersByStore, getOrdersByBuyer, getOrderById, updateOrderStatus, getInvoices, getTeam, inviteTeamMember, removeTeamMember, createProduct, updateProduct, deleteProduct, withdraw, formatNaira, getProductById, createOrder: _unused1, createDispute, resolveDispute: _unused2 } = data;
  const { canManageProducts, canManageOrders, canManageTeam, canWithdraw, requireStoreStaff, isLoggedIn, getCurrentUser, logout } = auth;
  const { initSharedUI, showToast, openModal, closeModal, openLoginModal, icon } = ui;

  let currentUser = null;
  let currentStore = null;
  let activeTab = 'overview';

  function init() {
    initSharedUI();
    currentUser = getCurrentUser();
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');

    if (!isLoggedIn()) {
      document.getElementById('dashboard-content').style.display = 'none';
      document.getElementById('guest-message').style.display = 'block';
      openLoginModal();
      window.onLogin = () => location.reload();
      return;
    }

    if (currentUser.role === 'admin') { window.location.href = 'admin.html'; return; }

    if (currentUser.role === 'buyer' || view === 'buyer') { renderBuyerDashboard(); return; }

    const staffCheck = requireStoreStaff();
    if (!staffCheck.ok) {
      document.getElementById('dashboard-content').style.display = 'none';
      document.getElementById('guest-message').style.display = 'block';
      document.getElementById('guest-message').innerHTML = `
        <div class="empty-state"><h1 class="section-title">No store linked to this account</h1><p>Open a store to access the seller dashboard.</p><a href="sell.html" class="btn btn-primary" style="margin-top:16px;">Open your store</a></div>`;
      return;
    }

    currentStore = staffCheck.store;
    document.getElementById('dashboard-content').style.display = 'grid';
    document.getElementById('sidebar-store').textContent = currentStore.name;
    setupTabs();
    setupQuickActions();
    renderOverview();
    renderProducts();
    renderOrders();
    renderWallet();
    renderTeam();

    if (!canManageProducts(currentUser)) {
      document.querySelector('a[data-tab="products"]')?.parentElement.classList.add('hidden');
      document.getElementById('btn-add-product')?.classList.add('hidden');
    }
    if (!canManageTeam(currentUser)) document.getElementById('nav-team')?.classList.add('hidden');
  }

  function setupTabs() {
    const nav = document.getElementById('dashboard-nav');
    nav?.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-tab]');
      if (!link) return;
      e.preventDefault();
      const tab = link.dataset.tab;
      if (tab === 'products' && !canManageProducts(currentUser)) return;
      if (tab === 'team' && !canManageTeam(currentUser)) return;
      setTab(tab);
    });
  }

  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('#dashboard-nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tab}`));
    if (tab === 'orders') renderOrders();
    if (tab === 'wallet') renderWallet();
    if (tab === 'products') renderProducts();
    if (tab === 'team') renderTeam();
  }

  function setupQuickActions() {
    document.getElementById('qa-add-product')?.addEventListener('click', () => {
      if (!canManageProducts(currentUser)) return showToast('Only Owners and Managers can add products.');
      setTab('products'); openProductForm();
    });
    document.getElementById('qa-view-orders')?.addEventListener('click', () => setTab('orders'));
    document.getElementById('qa-withdraw')?.addEventListener('click', () => {
      if (!canWithdraw(currentUser)) return showToast('Only Owners can withdraw.');
      setTab('wallet');
    });
    document.getElementById('btn-add-product')?.addEventListener('click', () => {
      if (!canManageProducts(currentUser)) return showToast('Only Owners and Managers can add products.');
      openProductForm();
    });
    document.getElementById('withdraw-form')?.addEventListener('submit', handleWithdraw);
    document.getElementById('invite-form')?.addEventListener('submit', handleInvite);
  }

  function renderOverview() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('dash-greeting').textContent = `${greeting}, ${currentStore.name}`;
    document.getElementById('dash-role').textContent = `You are logged in as ${currentUser.role}.`;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const orders = getOrdersByStore(currentStore.id);
    const salesToday = orders.filter(o => o.createdAt >= todayIso).reduce((s, o) => s + o.total, 0);
    const toPrepare = orders.filter(o => o.status === 'paid' || o.status === 'preparing').length;
    const held = orders.filter(o => o.paymentMethod === 'online' && !['released', 'refunded'].includes(o.status)).reduce((s, o) => s + o.total, 0);

    document.getElementById('overview-stats').innerHTML = `
      <div class="stat-card"><h4>Sales today</h4><div class="stat-value" data-count-to="${salesToday}" data-count-prefix="₦">${formatNaira(salesToday)}</div></div>
      <div class="stat-card"><h4>Orders to prepare</h4><div class="stat-value">${toPrepare}</div></div>
      <div class="stat-card"><h4>Wallet balance</h4><div class="stat-value" data-count-to="${currentStore.walletBalance || 0}" data-count-prefix="₦">${formatNaira(currentStore.walletBalance || 0)}</div></div>
      <div class="stat-card"><h4>Held in escrow</h4><div class="stat-value" data-count-to="${held}" data-count-prefix="₦">${formatNaira(held)}</div></div>
    `;

    const alerts = [];
    const unpaidInvoices = getInvoices().filter(i => i.storeId === currentStore.id && i.status === 'unpaid');
    if (unpaidInvoices.length) alerts.push(`<span class="badge badge-unpaid" style="margin-right:8px;">Unpaid POD invoice</span> You have ${unpaidInvoices.length} unpaid pay-on-delivery commission invoice(s).`);
    const openDisputes = orders.filter(o => o.disputeId).length;
    if (openDisputes) alerts.push(`<span class="badge badge-dispute" style="margin-right:8px;">Dispute</span> ${openDisputes} open dispute(s) require attention.`);
    document.getElementById('overview-alerts').innerHTML = alerts.length
      ? `<div class="panel"><h3>Alerts</h3>${alerts.map(a => `<p style="margin-bottom:10px;">${a}</p>`).join('')}</div>`
      : '';
  }

  function renderProducts() {
    const products = getProductsByStore(currentStore.id);
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = products.map(p => `
      <tr>
        <td><strong>${p.name}</strong><br><span class="text-muted" style="font-size:0.85rem;">${p.category}</span></td>
        <td>${formatNaira(p.price)}</td>
        <td>${p.stock}</td>
        <td>${p.stock <= 0 ? '<span class="badge badge-suspended">Out of stock</span>' : '<span class="badge badge-active">Active</span>'}</td>
        <td>${canManageProducts(currentUser) ? `<button class="btn btn-sm btn-secondary" data-edit="${p.id}">Edit</button> <button class="btn btn-sm btn-ghost" data-delete="${p.id}">Delete</button>` : '<span class="text-muted">View only</span>'}</td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-edit]').forEach(btn => btn.addEventListener('click', () => openProductForm(btn.dataset.edit)));
    tbody.querySelectorAll('button[data-delete]').forEach(btn => btn.addEventListener('click', () => {
      openModal('Delete product?', `
        <p>Are you sure you want to delete this product? This cannot be undone.</p>
        <div class="flex gap-2" style="margin-top:16px;"><button class="btn btn-primary" id="confirm-delete">Yes, delete</button><button class="btn btn-secondary" id="cancel-delete">Cancel</button></div>
      `);
      document.getElementById('confirm-delete')?.addEventListener('click', () => {
        deleteProduct(btn.dataset.delete); closeModal(); renderProducts(); showToast('Product deleted');
      });
      document.getElementById('cancel-delete')?.addEventListener('click', closeModal);
    }));

    const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5);
    document.getElementById('low-stock-list').innerHTML = lowStock.length
      ? `<ul style="padding-left:18px;margin:0;">${lowStock.map(p => `<li><strong>${p.name}</strong> — ${p.stock} left</li>`).join('')}</ul>`
      : '<p class="text-muted">No low-stock items. You are all set.</p>';
  }

  function openProductForm(productId) {
    if (!canManageProducts(currentUser)) return;
    const product = productId ? getProductById(productId) : null;
    openModal(product ? 'Edit product' : 'Add product', `
      <form id="product-form">
        <div class="form-group"><label for="p-name">Product name</label><input type="text" id="p-name" required value="${product ? product.name : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label for="p-price">Price (₦)</label><input type="number" id="p-price" required min="0" value="${product ? product.price : ''}"></div>
          <div class="form-group"><label for="p-stock">Stock count</label><input type="number" id="p-stock" required min="0" value="${product ? product.stock : ''}"></div>
        </div>
        <div class="form-group">
          <label for="p-category">Category</label>
          <select id="p-category" required>
            <option value="Fashion & Tailoring">Fashion & Tailoring</option>
            <option value="Groceries & Foodstuff">Groceries & Foodstuff</option>
            <option value="Electronics & Gadgets">Electronics & Gadgets</option>
            <option value="Phones & Accessories">Phones & Accessories</option>
            <option value="Beauty & Personal Care">Beauty & Personal Care</option>
            <option value="Home & Living">Home & Living</option>
          </select>
        </div>
        <div class="form-group"><label for="p-image">Image URL</label><input type="text" id="p-image" value="${product ? product.image : 'assets/store-fashion.jpg'}"></div>
        <div class="form-group"><label for="p-desc">Description</label><textarea id="p-desc" rows="3">${product ? product.description : ''}</textarea></div>
        <button type="submit" class="btn btn-primary btn-block">${product ? 'Save changes' : 'Add product'}</button>
      </form>
    `);
    if (product) document.getElementById('p-category').value = product.category;
    document.getElementById('product-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const dataUpdate = {
        name: document.getElementById('p-name').value.trim(),
        price: Number(document.getElementById('p-price').value),
        stock: Number(document.getElementById('p-stock').value),
        category: document.getElementById('p-category').value,
        image: document.getElementById('p-image').value.trim() || 'assets/store-fashion.jpg',
        description: document.getElementById('p-desc').value.trim(),
        storeId: currentStore.id, colors: [],
      };
      if (product) { updateProduct(product.id, dataUpdate); showToast('Product updated'); }
      else { createProduct(dataUpdate); showToast('Product added'); }
      closeModal(); renderProducts();
    });
  }

  function renderOrders() {
    const orders = getOrdersByStore(currentStore.id);
    const canUpdate = canManageOrders(currentUser);
    const board = document.getElementById('orders-board');
    const columns = [
      { key: 'paid', label: 'Paid' }, { key: 'preparing', label: 'Preparing' },
      { key: 'shipped', label: 'Shipped' }, { key: 'delivered', label: 'Delivered' },
      { key: 'released', label: 'Released / Collected' },
    ];
    board.innerHTML = `<div class="order-board">${columns.map(col => `
      <div class="order-column">
        <h4>${col.label} <span class="text-muted">(${orders.filter(o => (o.status === col.key || (col.key === 'released' && ['released', 'cash_collected', 'refunded'].includes(o.status)))).length})</span></h4>
        ${orders.filter(o => {
          if (col.key === 'released') return ['released', 'cash_collected', 'refunded'].includes(o.status);
          return o.status === col.key;
        }).map(o => renderOrderCard(o, canUpdate)).join('')}
      </div>
    `).join('')}</div>`;

    board.querySelectorAll('button[data-next]').forEach(btn => {
      btn.addEventListener('click', () => {
        updateOrderStatus(btn.dataset.id, btn.dataset.next, currentUser.id);
        renderOrders(); renderOverview(); renderWallet();
        showToast(`Order moved to ${btn.dataset.next.replace('_', ' ')}`);
      });
    });

    board.querySelectorAll('button[data-dispute]').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        openModal('Raise dispute', `
          <form id="dispute-form"><div class="form-group"><label for="dispute-reason">What went wrong?</label><textarea id="dispute-reason" rows="3" required></textarea></div><button type="submit" class="btn btn-primary btn-block">Submit dispute</button></form>
        `);
        document.getElementById('dispute-form').addEventListener('submit', (e) => {
          e.preventDefault();
          createDispute({ orderId, buyerId: currentUser.id, storeId: currentStore.id, reason: document.getElementById('dispute-reason').value.trim() });
          closeModal(); renderOrders(); renderOverview();
          showToast('Dispute submitted to NewMart');
        });
      });
    });
  }

  function renderOrderCard(order, canUpdate) {
    const nextStatus = getNextStatus(order);
    const itemsText = order.items.map(i => `${i.qty}× ${i.name}`).join(', ');
    return `
      <div class="order-card">
        <h5>Order #${order.id.slice(-6).toUpperCase()}</h5>
        <p>${itemsText}</p>
        <p><strong>${formatNaira(order.total)}</strong> · ${order.paymentMethod === 'online' ? 'Online' : 'POD'}</p>
        <p class="text-muted" style="font-size:0.8rem;">${order.deliveryAddress}</p>
        <span class="badge badge-${order.status}">${order.status.replace('_', ' ')}</span>
        ${order.disputeId ? ' <span class="badge badge-dispute">Dispute open</span>' : ''}
        ${canUpdate && nextStatus ? `<div style="margin-top:10px;"><button class="btn btn-sm btn-primary" data-id="${order.id}" data-next="${nextStatus}">Move to ${nextStatus.replace('_', ' ')}</button></div>` : ''}
        ${order.status === 'delivered' && order.paymentMethod === 'online' && order.buyerId === currentUser.id ? `
          <div style="margin-top:10px;">
            <button class="btn btn-sm btn-primary" data-id="${order.id}" data-next="released">Confirm delivery</button>
            <button class="btn btn-sm btn-ghost" data-id="${order.id}" data-dispute="1">Raise dispute</button>
          </div>` : ''}
      </div>`;
  }

  function getNextStatus(order) {
    const onlineFlow = ['paid', 'preparing', 'shipped', 'delivered', 'released'];
    const podFlow = ['preparing', 'shipped', 'delivered', 'cash_collected'];
    const flow = order.paymentMethod === 'online' ? onlineFlow : podFlow;
    const idx = flow.indexOf(order.status);
    if (idx === -1 || idx === flow.length - 1) return null;
    return flow[idx + 1];
  }

  function renderWallet() {
    const held = getOrdersByStore(currentStore.id).filter(o => o.paymentMethod === 'online' && !['released', 'refunded'].includes(o.status)).reduce((s, o) => s + o.total, 0);
    const owed = getInvoices().filter(i => i.storeId === currentStore.id && i.status === 'unpaid').reduce((s, i) => s + i.amount, 0);
    document.getElementById('wallet-stats').innerHTML = `
      <div class="stat-card"><h4>Available balance</h4><div class="stat-value" data-count-to="${currentStore.walletBalance || 0}" data-count-prefix="₦">${formatNaira(currentStore.walletBalance || 0)}</div></div>
      <div class="stat-card"><h4>Held in escrow</h4><div class="stat-value" data-count-to="${held}" data-count-prefix="₦">${formatNaira(held)}</div></div>
      <div class="stat-card"><h4>Commission owed</h4><div class="stat-value" data-count-to="${owed}" data-count-prefix="₦">${formatNaira(owed)}</div></div>
    `;
    const invoices = getInvoices().filter(i => i.storeId === currentStore.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const tbody = document.querySelector('#invoices-table tbody');
    tbody.innerHTML = invoices.length
      ? invoices.map(i => `<tr><td>${i.period}</td><td>${formatNaira(i.amount)}</td><td>${new Date(i.dueDate).toLocaleDateString('en-NG')}</td><td><span class="badge badge-${i.status}">${i.status}</span></td></tr>`).join('')
      : '<tr><td colspan="4" class="text-muted">No invoices yet.</td></tr>';
  }

  function handleWithdraw(e) {
    e.preventDefault();
    if (!canWithdraw(currentUser)) return showToast('Only Owners can withdraw.');
    const amount = Number(document.getElementById('withdraw-amount').value);
    const account = document.getElementById('withdraw-account').value.trim();
    if (!amount || amount < 1000) return showToast('Minimum withdrawal is ₦1,000.');
    if ((currentStore.walletBalance || 0) < amount) return showToast('Insufficient wallet balance.');
    const result = withdraw(currentStore.id, amount, currentUser.id);
    if (result) {
      currentStore = getStoreById(currentStore.id);
      renderWallet(); renderOverview();
      showToast(`Withdrawal of ${formatNaira(amount)} initiated to ${account}`);
      e.target.reset();
    }
  }

  function renderTeam() {
    const team = getTeam(currentStore.id);
    const tbody = document.querySelector('#team-table tbody');
    tbody.innerHTML = team.length
      ? team.map(m => `<tr><td>${m.name}</td><td>${m.email}</td><td><span class="badge badge-active" style="text-transform:capitalize;">${m.role}</span></td><td><button class="btn btn-sm btn-ghost" data-remove="${m.id}">Remove</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="text-muted">No team members yet.</td></tr>';

    tbody.querySelectorAll('button[data-remove]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.remove;
      openModal('Remove team member?', `
        <p>Are you sure you want to remove this team member? They will lose dashboard access.</p>
        <div class="flex gap-2" style="margin-top:16px;"><button class="btn btn-primary" id="confirm-remove">Yes, remove</button><button class="btn btn-secondary" id="cancel-remove">Cancel</button></div>
      `);
      document.getElementById('confirm-remove')?.addEventListener('click', () => {
        removeTeamMember(id); closeModal(); renderTeam(); showToast('Team member removed');
      });
      document.getElementById('cancel-remove')?.addEventListener('click', closeModal);
    }));
  }

  function handleInvite(e) {
    e.preventDefault();
    if (!canManageTeam(currentUser)) return showToast('Only Owners can invite team members.');
    const name = document.getElementById('invite-name').value.trim();
    const email = document.getElementById('invite-email').value.trim();
    const role = document.getElementById('invite-role').value;
    const password = document.getElementById('invite-password').value;
    try { inviteTeamMember({ storeId: currentStore.id, email, name, role, password }); renderTeam(); e.target.reset(); showToast(`Invited ${name} as ${role}`); }
    catch (err) { showToast(err.message); }
  }

  function renderBuyerDashboard() {
    document.getElementById('dashboard-content').style.display = 'grid';
    document.querySelector('.dashboard-sidebar').innerHTML = `
      <h3 style="margin-bottom:12px;font-size:1.1rem;">My account</h3>
      <nav><a href="#orders" class="active" data-tab="orders">My orders</a></nav>
    `;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('tab-orders').classList.remove('hidden');
    document.getElementById('tab-orders').innerHTML = `
      <h1 class="section-title">My orders</h1>
      <p class="section-lead">Track your orders and confirm delivery to release payment.</p>
      <div id="buyer-orders-board" data-motion="fade-up" data-motion-stagger="80"></div>
    `;

    const orders = getOrdersByBuyer(currentUser.id);
    const board = document.getElementById('buyer-orders-board');
    if (!orders.length) {
      board.innerHTML = `<div class="empty-state"><p>You have not placed any orders yet.</p><a href="index.html#picks" class="btn btn-primary" style="margin-top:16px;">Start shopping</a></div>`;
      return;
    }

    board.innerHTML = orders.map(o => {
      const store = getStoreById(o.storeId);
      return `
        <div class="panel" style="margin-bottom:16px;">
          <div class="flex justify-between items-center flex-wrap gap-2" style="margin-bottom:10px;">
            <h4 style="margin:0;">Order #${o.id.slice(-6).toUpperCase()} · ${store?.name || 'Unknown store'}</h4>
            <span class="badge badge-${o.status}">${o.status.replace('_', ' ')}</span>
          </div>
          <p class="text-muted">${o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</p>
          <p><strong>${formatNaira(o.total)}</strong> · ${o.paymentMethod === 'online' ? 'Paid online (escrow)' : 'Pay on delivery'}</p>
          <p class="text-muted" style="font-size:0.9rem;">${o.deliveryAddress}</p>
          ${o.status === 'delivered' && o.paymentMethod === 'online' ? `
            <div class="flex gap-2" style="margin-top:12px;">
              <button class="btn btn-sm btn-primary" data-id="${o.id}" data-next="released">Confirm delivery</button>
              <button class="btn btn-sm btn-ghost" data-id="${o.id}" data-dispute="1">Raise dispute</button>
            </div>` : ''}
          ${o.disputeId ? ' <span class="badge badge-dispute">Dispute open</span>' : ''}
        </div>`;
    }).join('');

    board.querySelectorAll('button[data-next]').forEach(btn => btn.addEventListener('click', () => {
      updateOrderStatus(btn.dataset.id, btn.dataset.next, currentUser.id);
      renderBuyerDashboard();
      showToast('Delivery confirmed. Payment released to seller.');
    }));

    board.querySelectorAll('button[data-dispute]').forEach(btn => btn.addEventListener('click', () => {
      const orderId = btn.dataset.id;
      openModal('Raise dispute', `
        <form id="buyer-dispute-form"><div class="form-group"><label for="buyer-dispute-reason">What went wrong?</label><textarea id="buyer-dispute-reason" rows="3" required></textarea></div><button type="submit" class="btn btn-primary btn-block">Submit dispute</button></form>
      `);
      document.getElementById('buyer-dispute-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const order = getOrderById(orderId);
        createDispute({ orderId, buyerId: currentUser.id, storeId: order.storeId, reason: document.getElementById('buyer-dispute-reason').value.trim() });
        closeModal(); renderBuyerDashboard();
        showToast('Dispute submitted to NewMart');
      });
    }));
  }

  init();
})();
