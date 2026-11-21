/* NewMart — Platform admin dashboard */
(function () {
  'use strict';
  const { data, auth, ui } = window.NM;
  const { getStores, getStoreById, updateStore, getOrders, getDisputes, getInvoices, resolveDispute, payInvoice, getStoreRating, getUserById, formatNaira, logActivity } = data;
  const { getCurrentUser, isLoggedIn } = auth;
  const { initSharedUI, showToast, openModal, closeModal, openLoginModal } = ui;

  function init() {
    initSharedUI();
    const user = getCurrentUser();

    if (!isLoggedIn()) {
      document.getElementById('admin-content').style.display = 'none';
      document.getElementById('guest-message').style.display = 'block';
      openLoginModal();
      window.onLogin = () => location.reload();
      return;
    }

    if (user.role !== 'admin') {
      document.getElementById('admin-content').style.display = 'none';
      document.getElementById('guest-message').style.display = 'block';
      document.getElementById('guest-message').innerHTML = `
        <div class="empty-state"><h1 class="section-title">Admin access only</h1><p>This dashboard is reserved for New Technologies platform administrators.</p><a href="dashboard.html" class="btn btn-secondary" style="margin-top:16px;">Go to seller dashboard</a></div>`;
      return;
    }

    document.getElementById('admin-content').style.display = 'block';
    renderStats();
    renderStores(user);
    renderDisputes(user);
    renderInvoices();
  }

  function renderStats() {
    const orders = getOrders();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const gmvToday = orders.filter(o => o.createdAt >= today.toISOString()).reduce((s, o) => s + o.total, 0);
    const gmvAllTime = orders.reduce((s, o) => s + o.total, 0);
    const held = getStores().reduce((s, st) => s + (st.heldInEscrow || 0), 0);
    const openDisputes = getDisputes().filter(d => d.status === 'open').length;
    let stats = {};
    try { stats = JSON.parse(localStorage.getItem('nm_platform_stats') || '{}'); } catch {}

    document.getElementById('platform-stats').innerHTML = `
      <div class="stat-card"><h4>GMV today</h4><div class="stat-value" data-count-to="${gmvToday}" data-count-prefix="₦">${formatNaira(gmvToday)}</div></div>
      <div class="stat-card"><h4>GMV all time</h4><div class="stat-value" data-count-to="${gmvAllTime}" data-count-prefix="₦">${formatNaira(gmvAllTime)}</div></div>
      <div class="stat-card"><h4>Commission earned</h4><div class="stat-value" data-count-to="${stats.commissionEarned || 0}" data-count-prefix="₦">${formatNaira(stats.commissionEarned || 0)}</div></div>
      <div class="stat-card"><h4>Funds held in escrow</h4><div class="stat-value" data-count-to="${held}" data-count-prefix="₦">${formatNaira(held)}</div></div>
      <div class="stat-card"><h4>Open disputes</h4><div class="stat-value">${openDisputes}</div></div>
    `;
  }

  function renderStores(admin) {
    const stores = getStores();
    const orders = getOrders();
    const tbody = document.querySelector('#stores-table tbody');
    tbody.innerHTML = stores.map(s => {
      const owner = getUserById(s.ownerId);
      const storeOrders = orders.filter(o => o.storeId === s.id);
      const gmv = storeOrders.reduce((sum, o) => sum + o.total, 0);
      const disputes = storeOrders.filter(o => o.disputeId).length;
      const disputeRate = storeOrders.length ? ((disputes / storeOrders.length) * 100).toFixed(1) : '0.0';
      const r = getStoreRating(s.id);
      return `
        <tr>
          <td><strong>${s.name}</strong><br><span class="text-muted" style="font-size:0.85rem;">${s.location}</span></td>
          <td>${owner?.email || s.ownerEmail}</td>
          <td><span class="badge badge-${s.status}">${s.status}</span></td>
          <td>${formatNaira(gmv)}</td>
          <td>${disputeRate}% (${disputes})</td>
          <td>${s.status === 'active' ? `<button class="btn btn-sm btn-ghost" data-suspend="${s.id}">Suspend</button>` : `<button class="btn btn-sm btn-primary" data-reinstate="${s.id}">Reinstate</button>`} <a href="store.html?id=${s.slug}" class="btn btn-sm btn-secondary">View</a></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-suspend]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.suspend;
      const store = getStoreById(id);
      openModal('Suspend store?', `
        <p>Are you sure you want to suspend <strong>${store.name}</strong>? Its storefront and payouts will be frozen.</p>
        <div class="flex gap-2" style="margin-top:16px;"><button class="btn btn-primary" id="confirm-suspend">Yes, suspend</button><button class="btn btn-secondary" id="cancel-suspend">Cancel</button></div>
      `);
      document.getElementById('confirm-suspend')?.addEventListener('click', () => {
        updateStore(id, { status: 'suspended' });
        logActivity({ storeId: id, userId: admin.id, action: 'store_suspended', details: 'Suspended by admin' });
        closeModal(); renderStores(admin);
        showToast(`${store.name} suspended`);
      });
      document.getElementById('cancel-suspend')?.addEventListener('click', closeModal);
    }));

    tbody.querySelectorAll('button[data-reinstate]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.reinstate;
      updateStore(id, { status: 'active' });
      logActivity({ storeId: id, userId: admin.id, action: 'store_reinstated', details: 'Reinstated by admin' });
      renderStores(admin);
      showToast('Store reinstated');
    }));
  }

  function renderDisputes(admin) {
    const disputes = getDisputes();
    const container = document.getElementById('disputes-list');
    if (!disputes.length) { container.innerHTML = '<p class="text-muted">No disputes yet.</p>'; return; }
    container.innerHTML = disputes.map(d => {
      const order = getOrders().find(o => o.id === d.orderId);
      const buyer = getUserById(d.buyerId);
      const store = getStoreById(d.storeId);
      return `
        <div class="panel" style="margin-bottom:16px;">
          <div class="flex justify-between items-center flex-wrap gap-2" style="margin-bottom:10px;">
            <h4 style="margin:0;">Dispute #${d.id.slice(-6).toUpperCase()} · ${store?.name}</h4>
            <span class="badge badge-${d.status === 'open' ? 'dispute' : 'active'}">${d.status}</span>
          </div>
          <p><strong>Buyer:</strong> ${buyer?.name || 'Unknown'} · <strong>Order:</strong> #${order?.id.slice(-6).toUpperCase()}</p>
          <p><strong>Reason:</strong> ${d.reason}</p>
          <p class="text-muted">Order status: <span class="badge badge-${order?.status}">${order?.status.replace('_', ' ')}</span></p>
          ${d.status === 'open' ? `
            <div class="flex gap-2" style="margin-top:12px;">
              <button class="btn btn-sm btn-primary" data-refund="${d.id}">Refund buyer from escrow</button>
              <button class="btn btn-sm btn-secondary" data-release="${d.id}">Release to seller</button>
            </div>` : `<p class="text-muted" style="margin-top:10px;">Resolved: ${new Date(d.resolvedAt).toLocaleString('en-NG')}</p>`}
        </div>`;
    }).join('');

    container.querySelectorAll('button[data-refund]').forEach(btn => btn.addEventListener('click', () => {
      resolveDispute(btn.dataset.refund, 'refunded', admin.id);
      renderDisputes(admin); renderStats();
      showToast('Buyer refunded from escrow');
    }));

    container.querySelectorAll('button[data-release]').forEach(btn => btn.addEventListener('click', () => {
      resolveDispute(btn.dataset.release, 'released', admin.id);
      renderDisputes(admin); renderStats();
      showToast('Funds released to seller');
    }));
  }

  function renderInvoices() {
    const invoices = getInvoices();
    const tbody = document.querySelector('#admin-invoices-table tbody');
    tbody.innerHTML = invoices.length
      ? invoices.map(i => {
          const store = getStoreById(i.storeId);
          return `<tr><td>${store?.name || 'Unknown'}</td><td>${i.type === 'pod_commission' ? 'POD commission' : i.type}</td><td>${formatNaira(i.amount)}</td><td>${new Date(i.dueDate).toLocaleDateString('en-NG')}</td><td><span class="badge badge-${i.status}">${i.status}</span></td><td>${i.status === 'unpaid' ? `<button class="btn btn-sm btn-primary" data-pay="${i.id}">Mark paid</button>` : '<span class="text-muted">Paid</span>'}</td></tr>`;
        }).join('')
      : '<tr><td colspan="6" class="text-muted">No invoices yet.</td></tr>';

    tbody.querySelectorAll('button[data-pay]').forEach(btn => btn.addEventListener('click', () => {
      payInvoice(btn.dataset.pay);
      renderInvoices();
      showToast('Invoice marked as paid');
    }));
  }

  init();
})();
