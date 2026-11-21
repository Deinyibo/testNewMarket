/* NewMart — Sell on NewMart page */
(function () {
  'use strict';
  const { auth, ui } = window.NM;
  const { registerStore, login } = auth;
  const { initSharedUI, showToast, openLoginModal } = ui;

  function init() {
    initSharedUI();
    renderDemoAccounts();
    bindSignup();
    document.getElementById('btn-login')?.addEventListener('click', openLoginModal);
  }

  function renderDemoAccounts() {
    const accounts = [
      { role: 'Buyer', email: 'buyer@newmart.ng', desc: 'Shop, checkout and track orders.' },
      { role: 'Store owner', email: 'owner@adaezestyles.ng', desc: 'Full control: products, staff, payouts.' },
      { role: 'Manager', email: 'manager@adaezestyles.ng', desc: 'Products and orders.' },
      { role: 'Sales rep', email: 'sales@adaezestyles.ng', desc: 'Orders only.' },
      { role: 'Platform admin', email: 'admin@newmart.ng', desc: 'Oversee stores, disputes and commissions.' },
    ];
    const grid = document.getElementById('demo-accounts');
    grid.innerHTML = accounts.map(a => `
      <article class="card" data-motion="fade-up">
        <div class="card-body">
          <h4 class="card-title">${a.role}</h4>
          <p class="card-meta">${a.email}</p>
          <p class="text-muted" style="font-size:0.95rem;">${a.desc}</p>
          <button class="btn btn-secondary btn-sm btn-block" data-demo="${a.email}">Log in as ${a.role.split(' ')[0]}</button>
        </div>
      </article>`).join('');

    grid.querySelectorAll('button[data-demo]').forEach(btn => btn.addEventListener('click', () => {
      const email = btn.dataset.demo;
      const result = login(email, 'Demo1234!');
      if (result.success) {
        showToast(`Logged in as ${result.user.name}`);
        if (result.user.role === 'admin') window.location.href = 'admin.html';
        else if (result.user.role === 'buyer') window.location.href = 'dashboard.html?view=buyer';
        else window.location.href = 'dashboard.html';
      } else {
        showToast(result.message);
      }
    }));
  }

  function bindSignup() {
    document.getElementById('signup-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('biz-name').value.trim();
      const email = document.getElementById('biz-email').value.trim();
      const password = document.getElementById('biz-password').value;
      const phone = document.getElementById('biz-phone').value.trim();
      const city = document.getElementById('biz-city').value.trim();
      const errorEl = document.getElementById('signup-error');
      const result = registerStore({ businessName: name, email, password, phone, city });
      if (result.success) {
        errorEl.style.display = 'none';
        showToast('Your store is live!');
        window.location.href = 'dashboard.html';
      } else {
        errorEl.textContent = result.message;
        errorEl.style.display = 'block';
      }
    });
  }

  init();
})();
