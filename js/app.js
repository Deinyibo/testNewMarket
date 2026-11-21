/* NewMart — Shared application code */
window.NM = window.NM || {};

(function () {
  'use strict';

  const STORAGE_KEYS = {
    users: 'nm_users',
    stores: 'nm_stores',
    products: 'nm_products',
    orders: 'nm_orders',
    cart: 'nm_cart',
    disputes: 'nm_disputes',
    invoices: 'nm_invoices',
    activityLog: 'nm_activity_log',
    session: 'nm_session',
    seeded: 'nm_seeded',
  };

  const COMMISSION_RATE = 0.05;
  const POD_NEW_BUYER_CAP = 50000;

  const storage = {
    _mem: {},
    get(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? undefined : JSON.parse(raw);
      } catch (e) {
        return this._mem[key];
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        this._mem[key] = value;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        delete this._mem[key];
      }
    },
  };

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function now() { return new Date().toISOString(); }
  function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
  function formatNaira(amount) { return '₦' + Math.round(amount).toLocaleString('en-NG'); }
  function normalizePhone(phone) {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '234' + p.slice(1);
    if (!p.startsWith('234')) p = '234' + p;
    return '+' + p;
  }

  function getCollection(key) { return storage.get(STORAGE_KEYS[key]) || []; }
  function setCollection(key, items) { storage.set(STORAGE_KEYS[key], items); }
  function addItem(key, item) { const items = getCollection(key); items.push(item); setCollection(key, items); return item; }
  function updateItem(key, id, updater) {
    const items = getCollection(key);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const updated = typeof updater === 'function' ? updater(items[idx]) : { ...items[idx], ...updater };
    items[idx] = updated;
    setCollection(key, items);
    return updated;
  }
  function deleteItem(key, id) { const items = getCollection(key).filter((i) => i.id !== id); setCollection(key, items); }
  function getById(key, id) { return getCollection(key).find((i) => i.id === id) || null; }

  const session = {
    get() { return storage.get(STORAGE_KEYS.session) || null; },
    set(user) {
      if (!user) { storage.remove(STORAGE_KEYS.session); return; }
      storage.set(STORAGE_KEYS.session, { id: user.id, email: user.email, role: user.role, storeId: user.storeId, name: user.name });
    },
    clear() { storage.remove(STORAGE_KEYS.session); },
  };

  function getUserByEmail(email) { return getCollection('users').find((u) => u.email.toLowerCase() === email.toLowerCase()) || null; }
  function getUserById(id) { return getById('users', id); }
  function createUser(user) {
    if (getUserByEmail(user.email)) throw new Error('Email already registered');
    const newUser = { id: uid(), createdAt: now(), successfulOrders: 0, ...user };
    addItem('users', newUser);
    return newUser;
  }
  function updateUser(id, data) { return updateItem('users', id, data); }

  function getStores() { return getCollection('stores'); }
  function getStoreById(id) { return getById('stores', id); }
  function getStoreBySlug(slug) { return getCollection('stores').find((s) => s.slug === slug) || null; }
  function slugify(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function createStore(store) {
    const newStore = {
      id: uid(), slug: slugify(store.name), status: 'active', rating: 0, walletBalance: 0,
      commissionOwed: 0, totalSales: 0, heldInEscrow: 0, createdAt: now(), ...store,
    };
    addItem('stores', newStore);
    return newStore;
  }
  function updateStore(id, data) { return updateItem('stores', id, data); }

  function getProducts() { return getCollection('products'); }
  function getProductsByStore(storeId) { return getProducts().filter((p) => p.storeId === storeId); }
  function getProductById(id) { return getById('products', id); }
  function createProduct(product) {
    const newProduct = { id: uid(), status: 'active', createdAt: now(), ...product };
    addItem('products', newProduct);
    return newProduct;
  }
  function updateProduct(id, data) { return updateItem('products', id, data); }
  function deleteProduct(id) { deleteItem('products', id); }

  function getCart() { return storage.get(STORAGE_KEYS.cart) || { items: [] }; }
  function saveCart(cart) { storage.set(STORAGE_KEYS.cart, cart); }
  function addToCart(product, qty) {
    const cart = getCart();
    const existing = cart.items.find((i) => i.productId === product.id);
    if (existing) existing.qty += qty;
    else cart.items.push({ productId: product.id, storeId: product.storeId, name: product.name, price: product.price, image: product.image, qty });
    saveCart(cart);
    return cart;
  }
  function removeFromCart(productId) {
    const cart = getCart();
    cart.items = cart.items.filter((i) => i.productId !== productId);
    saveCart(cart);
    return cart;
  }
  function updateCartQty(productId, qty) {
    const cart = getCart();
    const item = cart.items.find((i) => i.productId === productId);
    if (item) item.qty = Math.max(1, qty);
    saveCart(cart);
    return cart;
  }
  function cartTotal() { return getCart().items.reduce((sum, i) => sum + i.price * i.qty, 0); }
  function clearCart() { saveCart({ items: [] }); }

  function getOrders() { return getCollection('orders'); }
  function getOrdersByStore(storeId) { return getOrders().filter((o) => o.storeId === storeId); }
  function getOrdersByBuyer(buyerId) { return getOrders().filter((o) => o.buyerId === buyerId); }
  function getOrderById(id) { return getById('orders', id); }
  function createOrder({ buyerId, storeId, items, total, deliveryFee, paymentMethod, deliveryAddress, phone }) {
    const order = {
      id: uid(), buyerId, storeId, items, subtotal: total, deliveryFee,
      total: total + deliveryFee, paymentMethod,
      status: paymentMethod === 'online' ? 'paid' : 'preparing',
      deliveryAddress, phone, podVerified: paymentMethod === 'pod' ? false : undefined,
      disputeId: null, createdAt: now(), updatedAt: now(),
    };
    for (const item of items) {
      const product = getProductById(item.productId);
      if (product) updateProduct(product.id, { stock: Math.max(0, product.stock - item.qty) });
    }
    if (paymentMethod === 'online') {
      const store = getStoreById(storeId);
      if (store) updateStore(storeId, { heldInEscrow: (store.heldInEscrow || 0) + order.total });
    }
    addItem('orders', order);
    logActivity({ storeId, userId: buyerId, action: 'order_created', details: `Order ${order.id} via ${paymentMethod}` });
    return order;
  }

  function releaseEscrow(order) {
    const store = getStoreById(order.storeId);
    if (!store) return;
    const commission = Math.round(order.total * COMMISSION_RATE);
    const sellerAmount = order.total - commission;
    updateStore(order.storeId, {
      heldInEscrow: Math.max(0, (store.heldInEscrow || 0) - order.total),
      walletBalance: (store.walletBalance || 0) + sellerAmount,
      totalSales: (store.totalSales || 0) + order.total,
    });
    updatePlatformCommission(commission);
    const buyer = getUserById(order.buyerId);
    if (buyer) updateUser(buyer.id, { successfulOrders: (buyer.successfulOrders || 0) + 1 });
  }

  function billPodCommission(order) {
    const store = getStoreById(order.storeId);
    if (!store) return;
    const commission = Math.round(order.total * COMMISSION_RATE);
    updateStore(order.storeId, {
      commissionOwed: (store.commissionOwed || 0) + commission,
      totalSales: (store.totalSales || 0) + order.total,
    });
    updatePlatformCommission(commission);
    createInvoice({ storeId: order.storeId, amount: commission, type: 'pod_commission', period: 'Weekly', dueDate: addDays(now(), 7) });
    const buyer = getUserById(order.buyerId);
    if (buyer) updateUser(buyer.id, { successfulOrders: (buyer.successfulOrders || 0) + 1 });
  }

  function updateOrderStatus(orderId, newStatus, actorId) {
    const order = getOrderById(orderId);
    if (!order) return null;
    const oldStatus = order.status;
    order.status = newStatus;
    order.updatedAt = now();
    if (newStatus === 'released') releaseEscrow(order);
    else if (newStatus === 'cash_collected') billPodCommission(order);
    updateItem('orders', orderId, order);
    logActivity({ storeId: order.storeId, userId: actorId, action: 'status_updated', details: `${oldStatus} → ${newStatus}` });
    return order;
  }

  function updatePlatformCommission(amount) {
    const stats = storage.get('nm_platform_stats') || { commissionEarned: 0 };
    stats.commissionEarned = (stats.commissionEarned || 0) + amount;
    storage.set('nm_platform_stats', stats);
  }

  function addDays(iso, days) { const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString(); }

  function getDisputes() { return getCollection('disputes'); }
  function createDispute({ orderId, buyerId, storeId, reason }) {
    const order = getOrderById(orderId);
    if (!order) return null;
    const dispute = { id: uid(), orderId, buyerId, storeId, reason, status: 'open', messages: [], createdAt: now() };
    order.disputeId = dispute.id;
    updateItem('orders', orderId, order);
    addItem('disputes', dispute);
    logActivity({ storeId, userId: buyerId, action: 'dispute_opened', details: reason });
    return dispute;
  }
  function resolveDispute(disputeId, decision, adminId) {
    const dispute = getById('disputes', disputeId);
    if (!dispute) return null;
    dispute.status = decision;
    dispute.resolvedBy = adminId;
    dispute.resolvedAt = now();
    updateItem('disputes', disputeId, dispute);
    const order = getOrderById(dispute.orderId);
    if (!order) return dispute;
    if (decision === 'refunded') {
      const store = getStoreById(order.storeId);
      if (store && order.paymentMethod === 'online') updateStore(order.storeId, { heldInEscrow: Math.max(0, (store.heldInEscrow || 0) - order.total) });
      order.status = 'refunded';
    } else if (decision === 'released') {
      releaseEscrow(order);
      order.status = 'released';
    }
    order.updatedAt = now();
    updateItem('orders', order.id, order);
    logActivity({ storeId: order.storeId, userId: adminId, action: 'dispute_resolved', details: decision });
    return dispute;
  }

  function getInvoices() { return getCollection('invoices'); }
  function createInvoice({ storeId, amount, type, period, dueDate }) {
    const invoice = { id: uid(), storeId, amount, type, period, dueDate, status: 'unpaid', createdAt: now() };
    addItem('invoices', invoice);
    return invoice;
  }
  function payInvoice(invoiceId) { return updateItem('invoices', invoiceId, { status: 'paid', paidAt: now() }); }

  function withdraw(storeId, amount, actorId) {
    const store = getStoreById(storeId);
    if (!store || (store.walletBalance || 0) < amount) return null;
    updateStore(storeId, { walletBalance: store.walletBalance - amount });
    logActivity({ storeId, userId: actorId, action: 'withdrawal', details: formatNaira(amount) });
    return { storeId, amount, withdrawnAt: now() };
  }

  function getTeam(storeId) { return getCollection('users').filter((u) => u.storeId === storeId && u.role !== 'owner'); }
  function inviteTeamMember({ storeId, email, name, role, password }) { return createUser({ email, name, role, storeId, password, phone: '' }); }
  function removeTeamMember(userId) { deleteItem('users', userId); }

  function getActivityLog(storeId) {
    const logs = getCollection('activityLog');
    return storeId ? logs.filter((l) => l.storeId === storeId) : logs;
  }
  function logActivity({ storeId, userId, action, details }) {
    addItem('activityLog', { id: uid(), storeId, userId, action, details, createdAt: now() });
  }

  function getStoreRating(storeId) {
    const orders = getOrdersByStore(storeId).filter((o) => o.status === 'released' || o.status === 'cash_collected');
    if (!orders.length) return { rating: 0, count: 0 };
    const base = 4.2 + ((orders.length * 7) % 8) / 10;
    const rating = Math.min(5, Math.round(base * 10) / 10);
    return { rating, count: orders.length };
  }

  function getPlatformStats() {
    const orders = getOrders();
    const today = todayStart();
    const gmvToday = orders.filter((o) => o.createdAt >= today).reduce((s, o) => s + o.total, 0);
    const gmvAllTime = orders.reduce((s, o) => s + o.total, 0);
    const held = getStores().reduce((s, st) => s + (st.heldInEscrow || 0), 0);
    const openDisputes = getDisputes().filter((d) => d.status === 'open').length;
    const stats = storage.get('nm_platform_stats') || {};
    return { gmvToday, gmvAllTime, commissionEarned: stats.commissionEarned || 0, heldInEscrow: held, openDisputes, storeCount: getStores().length, buyerCount: getCollection('users').filter((u) => u.role === 'buyer').length };
  }

  function resetData() {
    for (const key of Object.values(STORAGE_KEYS)) storage.remove(key);
    seedData();
  }

  const demoPassword = 'Demo1234!';
  function seedData() {
    if (storage.get(STORAGE_KEYS.seeded)) return;

    const admin = createUser({ email: 'admin@newmart.ng', name: 'New Technologies Admin', role: 'admin', password: demoPassword, phone: '+234 900 000 0000' });
    const buyer = createUser({ email: 'buyer@newmart.ng', name: 'Demo Buyer', role: 'buyer', password: demoPassword, phone: '+234 801 111 1111' });

    const storeFashion = createStore({
      name: 'Adaeze Styles', category: 'Fashion & Tailoring', location: 'GRA Phase II, Port Harcourt',
      phone: '+234 801 234 5678', email: 'owner@adaezestyles.ng',
      description: 'Adaeze Styles is a Port Harcourt fashion house making ready-to-wear ankara and tailored senator suits.',
      logo: 'assets/store-fashion.jpg', cover: 'assets/home-hero.jpg', ownerEmail: 'owner@adaezestyles.ng',
    });
    const storeGroceries = createStore({
      name: 'Garden City Grocers', category: 'Groceries & Foodstuff', location: 'Trans-Amadi, Port Harcourt',
      phone: '+234 802 345 6789', email: 'hello@gardencitygroceries.ng',
      description: 'Fresh produce, grains and household staples with same-day delivery around Trans-Amadi.',
      logo: 'assets/store-groceries.jpg', cover: 'assets/home-hero.jpg', ownerEmail: 'owner@gardencitygroceries.ng',
    });
    const storeElectronics = createStore({
      name: 'CircuitPoint Electronics', category: 'Electronics & Gadgets', location: 'Choba, Port Harcourt',
      phone: '+234 803 456 7890', email: 'sales@circuitpoint.ng',
      description: 'Phones, audio, accessories and small appliances at student-friendly prices in Choba.',
      logo: 'assets/store-electronics.jpg', cover: 'assets/home-hero.jpg', ownerEmail: 'owner@circuitpoint.ng',
    });

    const ownerFashion = createUser({ email: 'owner@adaezestyles.ng', name: 'Adaeze Owner', role: 'owner', password: demoPassword, storeId: storeFashion.id, phone: '+234 801 234 5678' });
    const managerFashion = createUser({ email: 'manager@adaezestyles.ng', name: 'Adaeze Manager', role: 'manager', password: demoPassword, storeId: storeFashion.id, phone: '+234 801 234 5679' });
    const salesFashion = createUser({ email: 'sales@adaezestyles.ng', name: 'Adaeze Sales Rep', role: 'sales', password: demoPassword, storeId: storeFashion.id, phone: '+234 801 234 5680' });
    const ownerGroceries = createUser({ email: 'owner@gardencitygroceries.ng', name: 'Garden City Owner', role: 'owner', password: demoPassword, storeId: storeGroceries.id, phone: '+234 802 345 6789' });
    const ownerElectronics = createUser({ email: 'owner@circuitpoint.ng', name: 'CircuitPoint Owner', role: 'owner', password: demoPassword, storeId: storeElectronics.id, phone: '+234 803 456 7890' });

    updateStore(storeFashion.id, { ownerId: ownerFashion.id });
    updateStore(storeGroceries.id, { ownerId: ownerGroceries.id });
    updateStore(storeElectronics.id, { ownerId: ownerElectronics.id });

    const fashionProducts = [
      { name: 'Ankara two-piece set', price: 18500, stock: 8, image: 'assets/store-fashion.jpg', category: 'Fashion & Tailoring', description: 'Ready-to-wear ankara two-piece set. Vibrant print, comfortable fit.' },
      { name: 'Senator suit (tailored)', price: 35000, stock: 5, image: 'assets/store-fashion.jpg', category: 'Fashion & Tailoring', description: 'Tailored senator suit for occasions and office wear.' },
      { name: 'Ankara maxi dress', price: 22000, stock: 3, image: 'assets/store-fashion.jpg', category: 'Fashion & Tailoring', description: 'Flowing maxi dress in premium ankara fabric.' },
      { name: 'Traditional cap (filá)', price: 8500, stock: 12, image: 'assets/store-fashion.jpg', category: 'Fashion & Tailoring', description: 'Embroidered traditional cap to complete your native look.' },
    ];
    const groceryProducts = [
      { name: 'Mama Gold rice 10kg', price: 16200, stock: 20, image: 'assets/store-groceries.jpg', category: 'Groceries & Foodstuff', description: 'Stone-free long grain parboiled rice.' },
      { name: 'Fresh tomatoes basket', price: 4800, stock: 6, image: 'assets/store-groceries.jpg', category: 'Groceries & Foodstuff', description: 'Fresh basket of red tomatoes, sourced from local farms.' },
      { name: 'Garri Ijebu 5kg', price: 5500, stock: 15, image: 'assets/store-groceries.jpg', category: 'Groceries & Foodstuff', description: 'White crispy garri, perfect for eba.' },
      { name: 'Palm oil 5 litres', price: 9000, stock: 4, image: 'assets/store-groceries.jpg', category: 'Groceries & Foodstuff', description: 'Pure red palm oil in sealed 5-litre container.' },
    ];
    const electronicsProducts = [
      { name: 'Wireless Bluetooth speaker', price: 12999, stock: 10, image: 'assets/store-electronics.jpg', category: 'Electronics & Gadgets', description: 'Portable speaker with deep bass and 8-hour battery.' },
      { name: 'USB-C fast charger', price: 4500, stock: 2, image: 'assets/store-electronics.jpg', category: 'Phones & Accessories', description: '20W fast charger with braided USB-C cable.' },
      { name: 'Wireless earbuds', price: 18500, stock: 7, image: 'assets/store-electronics.jpg', category: 'Phones & Accessories', description: 'Noise-reducing earbuds with charging case.' },
      { name: 'Electric kettle 1.8L', price: 11500, stock: 0, image: 'assets/store-electronics.jpg', category: 'Home & Living', description: 'Stainless steel kettle with auto shut-off.' },
    ];

    const createdProducts = [];
    for (const p of fashionProducts) createdProducts.push(createProduct({ ...p, storeId: storeFashion.id, colors: [] }));
    for (const p of groceryProducts) createdProducts.push(createProduct({ ...p, storeId: storeGroceries.id, colors: [] }));
    for (const p of electronicsProducts) createdProducts.push(createProduct({ ...p, storeId: storeElectronics.id, colors: [] }));

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yestIso = yesterday.toISOString();

    createOrder({ buyerId: buyer.id, storeId: storeFashion.id, items: [{ productId: createdProducts[0].id, name: createdProducts[0].name, price: createdProducts[0].price, qty: 1 }], total: 18500, deliveryFee: 1500, paymentMethod: 'online', deliveryAddress: '12 Stadium Road, Port Harcourt', phone: buyer.phone });
    createOrder({ buyerId: buyer.id, storeId: storeGroceries.id, items: [{ productId: createdProducts[4].id, name: createdProducts[4].name, price: createdProducts[4].price, qty: 1 }], total: 16200, deliveryFee: 1000, paymentMethod: 'pod', deliveryAddress: '45 Trans-Amadi Industrial Layout, Port Harcourt', phone: buyer.phone });
    createOrder({ buyerId: buyer.id, storeId: storeElectronics.id, items: [{ productId: createdProducts[8].id, name: createdProducts[8].name, price: createdProducts[8].price, qty: 1 }], total: 12999, deliveryFee: 1000, paymentMethod: 'online', deliveryAddress: 'Choba, Port Harcourt', phone: buyer.phone });

    const orders = getOrders();
    updateOrderStatus(orders[0].id, 'shipped', ownerFashion.id);
    updateOrderStatus(orders[1].id, 'delivered', ownerGroceries.id);
    updateOrderStatus(orders[1].id, 'cash_collected', ownerGroceries.id);
    updateOrderStatus(orders[2].id, 'delivered', ownerElectronics.id);
    updateOrderStatus(orders[2].id, 'released', buyer.id);

    updateItem('orders', orders[0].id, { ...orders[0], createdAt: yestIso });
    updateItem('orders', orders[1].id, { ...orders[1], createdAt: yestIso });

    for (const store of getStores()) {
      const r = getStoreRating(store.id);
      updateStore(store.id, { rating: r.rating });
    }

    storage.set(STORAGE_KEYS.seeded, true);
  }

  seedData();

  /* Auth */
  const auth = {
    getCurrentUser() { const s = session.get(); return s ? getUserById(s.id) : null; },
    isLoggedIn() { return !!session.get(); },
    getSession() { return session.get(); },
    login(email, password) {
      const user = getUserByEmail(email);
      if (!user || user.password !== password) return { success: false, message: 'Incorrect email or password.' };
      session.set(user);
      return { success: true, user };
    },
    logout() { session.clear(); },
    registerBuyer({ name, email, password, phone }) {
      try { const user = createUser({ name, email, password, phone, role: 'buyer' }); session.set(user); return { success: true, user }; }
      catch (e) { return { success: false, message: e.message }; }
    },
    registerStore({ businessName, email, password, phone, city }) {
      try {
        const owner = createUser({ name: businessName, email, password, phone, role: 'owner' });
        const store = createStore({ name: businessName, category: 'Fashion & Tailoring', location: (city || 'Port Harcourt') + ', Nigeria', phone, email, ownerId: owner.id, ownerEmail: email });
        updateUser(owner.id, { storeId: store.id });
        updateStore(store.id, { ownerId: owner.id });
        session.set(owner);
        return { success: true, user: owner, store };
      } catch (e) { return { success: false, message: e.message }; }
    },
    canManageProducts(user) {
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (!user.storeId) return false;
      return user.role === 'owner' || user.role === 'manager';
    },
    canManageOrders(user) {
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (!user.storeId) return false;
      return ['owner', 'manager', 'sales'].includes(user.role);
    },
    canManageTeam(user) { return !!user && (user.role === 'owner' || user.role === 'admin'); },
    canWithdraw(user) { return !!user && (user.role === 'owner' || user.role === 'admin'); },
    isStoreStaff(user, storeId) { return !!user && !!user.storeId && user.storeId === storeId; },
    requireAuth(roles) {
      const user = this.getCurrentUser();
      if (!user) return { ok: false, redirect: 'login' };
      if (roles.length && !roles.includes(user.role)) return { ok: false, redirect: 'unauthorized' };
      return { ok: true, user };
    },
    requireStoreStaff() {
      const user = this.getCurrentUser();
      if (!user || (!user.storeId && user.role !== 'admin')) return { ok: false };
      return { ok: true, user, store: getStoreById(user.storeId) };
    },
  };

  /* UI */
  const SVG_ICONS = {
    cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  };
  function icon(name) { return SVG_ICONS[name] || ''; }

  function bindHeaderMenu() {
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.main-nav');
    if (toggle && nav) toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  function renderHeader() {
    const user = auth.getCurrentUser();
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const active = (name) => path === name ? 'active' : '';
    const authLinks = user
      ? `<a href="${user.role === 'admin' ? 'admin.html' : 'dashboard.html'}" class="btn btn-sm btn-secondary">${icon('user')} <span>${user.name.split(' ')[0]}</span></a>
         <button class="btn btn-sm btn-ghost" id="header-logout">${icon('logout')} <span>Log out</span></button>`
      : `<button class="btn btn-sm btn-secondary" id="header-login">Log in</button>
         <a href="sell.html" class="btn btn-sm btn-primary">Sell</a>`;

    const html = `
      <header class="site-header" data-header-scrolled>
        <div class="container">
          <a href="index.html" class="logo">
            <img src="assets/logo.svg" alt="New Technologies N mark" class="logo-mark" width="38" height="38">
            <span>NewMart</span>
          </a>
          <nav class="main-nav">
            <a href="index.html" class="${active('index.html')}">Marketplace</a>
            <a href="store.html" class="${active('store.html')}">Stores</a>
            <a href="sell.html" class="${active('sell.html')}">Sell</a>
            <a href="dashboard.html" class="${active('dashboard.html')}">Dashboard</a>
            <a href="admin.html" class="${active('admin.html')}">Admin</a>
          </nav>
          <div class="header-actions">
            <button class="cart-btn" id="cart-btn" aria-label="Open cart">
              ${icon('cart')}
              <span style="margin-left:6px;font-weight:600;">Cart</span>
              <span class="cart-count" id="cart-count">0</span>
            </button>
            ${authLinks}
            <button class="menu-toggle" aria-label="Open menu">${icon('menu')}</button>
          </div>
        </div>
      </header>`;

    const existing = document.querySelector('.site-header');
    if (existing) existing.outerHTML = html;
    else document.body.insertAdjacentHTML('afterbegin', html);

    document.getElementById('cart-btn')?.addEventListener('click', openCartDrawer);
    document.getElementById('header-login')?.addEventListener('click', openLoginModal);
    document.getElementById('header-logout')?.addEventListener('click', () => { auth.logout(); window.location.href = 'index.html'; });
    bindHeaderMenu();
  }

  function renderFooter() {
    const html = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-col">
              <a href="index.html" class="logo mb-2">
                <img src="assets/logo.svg" alt="New Technologies N mark" class="logo-mark" width="38" height="38">
                <span>NewMart</span>
              </a>
              <p class="text-muted">Every store in Port Harcourt, one cart. Shop trusted local businesses with escrow-protected payments or pay on delivery.</p>
            </div>
            <div class="footer-col"><h4>Shop</h4><a href="index.html#categories">Categories</a><a href="index.html#stores">Stores</a><a href="index.html#picks">Today's picks</a></div>
            <div class="footer-col"><h4>Sell</h4><a href="sell.html">Open a store</a><a href="dashboard.html">Seller dashboard</a><a href="sell.html#demo">Demo accounts</a></div>
            <div class="footer-col"><h4>Support</h4><a href="index.html#escrow">Escrow protection</a><a href="index.html#pod">Pay on delivery</a><a href="admin.html">Platform admin</a></div>
          </div>
          <div class="footer-bottom">
            <span>Built by New Technologies — Innovation &amp; Excellence</span>
            <span>&copy; ${new Date().getFullYear()} NewMart. All rights reserved.</span>
          </div>
        </div>
      </footer>`;
    const existing = document.querySelector('.site-footer');
    if (existing) existing.outerHTML = html;
    else document.body.insertAdjacentHTML('beforeend', html);
  }

  function renderCartDrawer() {
    if (document.getElementById('cart-overlay')) return;
    const html = `
      <div class="cart-overlay" id="cart-overlay"></div>
      <div class="cart-drawer" id="cart-drawer">
        <div class="cart-header"><h3>Your cart</h3><button class="modal-close" id="cart-close" aria-label="Close cart">${icon('close')}</button></div>
        <div class="cart-items" id="cart-items"></div>
        <div class="cart-footer">
          <div class="cart-total"><span>Total</span><span id="cart-total">${formatNaira(0)}</span></div>
          <button class="btn btn-primary btn-block" id="cart-checkout">Checkout</button>
          <button class="btn btn-ghost btn-block" id="cart-continue" style="margin-top:8px;">Continue shopping</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);
    document.getElementById('cart-close').addEventListener('click', closeCartDrawer);
    document.getElementById('cart-continue').addEventListener('click', closeCartDrawer);
    document.getElementById('cart-checkout').addEventListener('click', () => { closeCartDrawer(); openCheckoutModal(); });
  }

  function updateCartCount() {
    const count = getCart().items.reduce((s, i) => s + i.qty, 0);
    const el = document.getElementById('cart-count');
    if (el) { el.textContent = count; el.style.display = count ? 'grid' : 'none'; }
  }

  function renderCartItems() {
    const cart = getCart();
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    if (!container) return;
    if (!cart.items.length) {
      container.innerHTML = `<div class="empty-state">${icon('cart')}<p>Your cart is empty.</p><a href="index.html#picks" class="btn btn-primary btn-sm" style="margin-top:12px;">Start shopping</a></div>`;
    } else {
      container.innerHTML = cart.items.map(item => `
        <div class="cart-item">
          <img src="${item.image}" alt="${item.name}" width="64" height="64">
          <div class="cart-item-info"><h4>${item.name}</h4><p>${formatNaira(item.price)}</p>
            <div class="cart-item-qty">
              <button data-action="dec" data-id="${item.productId}">-</button><span>${item.qty}</span><button data-action="inc" data-id="${item.productId}">+
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="remove" data-id="${item.productId}">${icon('close')}</button>
        </div>`).join('');
      container.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const action = btn.dataset.action;
          if (action === 'remove') removeFromCart(id);
          else if (action === 'inc') updateCartQty(id, (getCart().items.find(i => i.productId === id)?.qty || 1) + 1);
          else if (action === 'dec') updateCartQty(id, (getCart().items.find(i => i.productId === id)?.qty || 1) - 1);
          renderCartItems();
          updateCartCount();
        });
      });
    }
    if (totalEl) totalEl.textContent = formatNaira(cartTotal());
  }

  function openCartDrawer() {
    renderCartItems();
    const overlay = document.getElementById('cart-overlay');
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.style.display = 'flex';
    if (overlay) overlay.classList.add('open');
    requestAnimationFrame(() => drawer?.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  function closeCartDrawer() {
    const overlay = document.getElementById('cart-overlay');
    const drawer = document.getElementById('cart-drawer');
    if (overlay) overlay.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { if (drawer && !drawer.classList.contains('open')) drawer.style.display = 'none'; }, 260);
  }

  function renderLoginModal() {
    if (document.getElementById('login-modal-overlay')) return;
    const html = `
      <div class="modal-overlay" id="login-modal-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <div class="modal-header"><h3 id="login-title">Log in to NewMart</h3><button class="modal-close" id="login-modal-close">${icon('close')}</button></div>
          <div class="modal-body">
            <form id="login-form">
              <div class="form-group"><label for="login-email">Email</label><input type="email" id="login-email" required placeholder="you@example.com"></div>
              <div class="form-group"><label for="login-password">Password</label><input type="password" id="login-password" required placeholder="••••••••"></div>
              <div id="login-error" class="text-accent mb-2" style="display:none;"></div>
              <button type="submit" class="btn btn-primary btn-block">Log in</button>
            </form>
            <hr style="border:none;border-top:1px solid rgba(18,41,107,0.08);margin:20px 0;">
            <p class="text-muted" style="font-size:0.95rem;">Demo password for all accounts: <strong>Demo1234!</strong></p>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('login-modal-close').addEventListener('click', closeLoginModal);
    document.getElementById('login-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'login-modal-overlay') closeLoginModal(); });
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const result = auth.login(email, password);
      const err = document.getElementById('login-error');
      if (result.success) {
        err.style.display = 'none';
        closeLoginModal();
        renderHeader();
        showToast(`Welcome back, ${result.user.name.split(' ')[0]}`);
        if (typeof window.onLogin === 'function') window.onLogin(result.user);
      } else {
        err.textContent = result.message;
        err.style.display = 'block';
      }
    });
  }

  function openLoginModal() { document.getElementById('login-modal-overlay')?.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeLoginModal() { document.getElementById('login-modal-overlay')?.classList.remove('open'); document.body.style.overflow = ''; }

  function renderCheckoutModal() {
    if (document.getElementById('checkout-modal-overlay')) return;
    const html = `
      <div class="modal-overlay" id="checkout-modal-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div class="modal-header"><h3 id="checkout-title">Checkout</h3><button class="modal-close" id="checkout-modal-close">${icon('close')}</button></div>
          <div class="modal-body">
            <form id="checkout-form">
              <div class="form-group"><label for="checkout-name">Full name</label><input type="text" id="checkout-name" required></div>
              <div class="form-row">
                <div class="form-group"><label for="checkout-phone">Phone (+234 …)</label><input type="tel" id="checkout-phone" required placeholder="801 234 5678"></div>
                <div class="form-group"><label for="checkout-city">City</label><input type="text" id="checkout-city" value="Port Harcourt" required></div>
              </div>
              <div class="form-group"><label for="checkout-address">Delivery address</label><textarea id="checkout-address" rows="2" required></textarea></div>
              <div class="form-group">
                <label>Payment method</label>
                <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;margin-bottom:8px;"><input type="radio" name="payment" value="online" checked> Pay online (card / transfer / USSD) — held in escrow</label>
                <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;"><input type="radio" name="payment" value="pod"> Pay on delivery — phone verification required</label>
              </div>
              <div class="checkout-summary mb-2" id="checkout-summary"></div>
              <div id="checkout-error" class="text-accent mb-2" style="display:none;"></div>
              <div id="checkout-pod-step" style="display:none;">
                <div class="form-group">
                  <label>Phone OTP verification</label>
                  <p class="help-text">We sent a demo code to your phone. Enter any 6 digits to continue.</p>
                  <input type="text" id="checkout-otp" maxlength="6" placeholder="123456">
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-block" id="checkout-submit">Pay with Paystack (TEST)</button>
            </form>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('checkout-modal-close').addEventListener('click', closeCheckoutModal);
    document.getElementById('checkout-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'checkout-modal-overlay') closeCheckoutModal(); });
    document.querySelectorAll('#checkout-form input[name="payment"]').forEach(r => r.addEventListener('change', () => {
      const podStep = document.getElementById('checkout-pod-step');
      const submit = document.getElementById('checkout-submit');
      if (r.checked && r.value === 'pod') { podStep.style.display = 'block'; submit.textContent = 'Verify phone & place order'; }
      else { podStep.style.display = 'none'; submit.textContent = 'Pay with Paystack (TEST)'; }
    }));
    document.getElementById('checkout-form').addEventListener('submit', (e) => { e.preventDefault(); handleCheckout(); });
  }

  function openCheckoutModal() {
    const cart = getCart();
    if (!cart.items.length) { showToast('Your cart is empty.'); return; }
    const storeIds = [...new Set(cart.items.map(i => i.storeId))];
    if (storeIds.length > 1) { showToast('Checkout one store at a time. Remove items from other stores to continue.'); return; }
    const subtotal = cartTotal();
    const delivery = 1500;
    const summary = document.getElementById('checkout-summary');
    if (summary) summary.innerHTML = `<div class="checkout-line"><span>Subtotal</span><span>${formatNaira(subtotal)}</span></div><div class="checkout-line"><span>Delivery</span><span>${formatNaira(delivery)}</span></div><div class="checkout-line total"><span>Total</span><span>${formatNaira(subtotal + delivery)}</span></div>`;
    document.getElementById('checkout-modal-overlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCheckoutModal() { document.getElementById('checkout-modal-overlay')?.classList.remove('open'); document.body.style.overflow = ''; }

  function handleCheckout() {
    const cart = getCart();
    const name = document.getElementById('checkout-name').value.trim();
    const phoneRaw = document.getElementById('checkout-phone').value.trim();
    const city = document.getElementById('checkout-city').value.trim();
    const address = document.getElementById('checkout-address').value.trim();
    const payment = document.querySelector('input[name="payment"]:checked')?.value;
    const errorEl = document.getElementById('checkout-error');
    const submit = document.getElementById('checkout-submit');
    errorEl.style.display = 'none';
    if (!name || !phoneRaw || !city || !address || !cart.items.length) { errorEl.textContent = 'Please fill in all fields.'; errorEl.style.display = 'block'; return; }
    const storeIds = [...new Set(cart.items.map(i => i.storeId))];
    if (storeIds.length > 1) { errorEl.textContent = 'Checkout one store at a time.'; errorEl.style.display = 'block'; return; }
    const storeId = storeIds[0];
    const subtotal = cartTotal();
    const deliveryFee = 1500;
    const total = subtotal + deliveryFee;

    let buyer = auth.getCurrentUser();
    if (!buyer) {
      const email = `guest_${Date.now()}@newmart.ng`;
      buyer = createUser({ name, email, password: 'guest', phone: normalizePhone(phoneRaw), role: 'buyer' });
      session.set(buyer);
      renderHeader();
    }

    if (payment === 'pod') {
      const otp = document.getElementById('checkout-otp').value.trim();
      if (otp.length !== 6 || !/^\d{6}$/.test(otp)) { errorEl.textContent = 'Enter the 6-digit code sent to your phone.'; errorEl.style.display = 'block'; return; }
      const successful = buyer.successfulOrders || 0;
      if (successful === 0 && total > POD_NEW_BUYER_CAP) { errorEl.textContent = `New buyers have a ₦${POD_NEW_BUYER_CAP.toLocaleString('en-NG')} pay-on-delivery cap. Pay online or reduce your cart.`; errorEl.style.display = 'block'; return; }
      submit.disabled = true;
      submit.textContent = 'Placing order…';
      setTimeout(() => {
        createOrder({ buyerId: buyer.id, storeId, items: cart.items.map(i => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty })), total: subtotal, deliveryFee, paymentMethod: 'pod', deliveryAddress: `${address}, ${city}`, phone: normalizePhone(phoneRaw) });
        clearCart();
        updateCartCount();
        closeCheckoutModal();
        submit.disabled = false;
        showToast('Order placed! Pay cash on delivery.');
        window.location.href = 'dashboard.html?view=buyer';
      }, 600);
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Redirecting to Paystack TEST…';
    setTimeout(() => {
      createOrder({ buyerId: buyer.id, storeId, items: cart.items.map(i => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty })), total: subtotal, deliveryFee, paymentMethod: 'online', deliveryAddress: `${address}, ${city}`, phone: normalizePhone(phoneRaw) });
      clearCart();
      updateCartCount();
      closeCheckoutModal();
      submit.disabled = false;
      showToast('Payment successful! Your money is held in escrow.');
      window.location.href = 'dashboard.html?view=buyer';
    }, 1200);
  }

  function showToast(message, duration) {
    duration = duration || 3000;
    let toast = document.getElementById('nm-toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'nm-toast'; toast.className = 'toast'; document.body.appendChild(toast); }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  function openModal(title, bodyHtml) {
    let overlay = document.getElementById('generic-modal-overlay');
    if (!overlay) {
      const html = `<div class="modal-overlay" id="generic-modal-overlay"><div class="modal" role="dialog" aria-modal="true"><div class="modal-header"><h3 id="generic-modal-title"></h3><button class="modal-close" id="generic-modal-close">${icon('close')}</button></div><div class="modal-body" id="generic-modal-body"></div></div></div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      document.getElementById('generic-modal-close').addEventListener('click', closeModal);
      document.getElementById('generic-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'generic-modal-overlay') closeModal(); });
      overlay = document.getElementById('generic-modal-overlay');
    }
    document.getElementById('generic-modal-title').textContent = title;
    document.getElementById('generic-modal-body').innerHTML = bodyHtml;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() { document.getElementById('generic-modal-overlay')?.classList.remove('open'); document.body.style.overflow = ''; }

  function productCard(product, store) {
    const isLow = product.stock > 0 && product.stock <= 5;
    const isOut = product.stock <= 0;
    return `
      <article class="card" data-motion="fade-up">
        <a href="store.html?id=${store?.slug || ''}&product=${product.id}" class="card-media"><img src="${product.image}" alt="${product.name}" width="400" height="400" loading="lazy"></a>
        <div class="card-body">
          <h4 class="card-title">${product.name}</h4>
          <p class="card-meta">${store?.name || 'NewMart seller'}</p>
          <div class="card-price">${formatNaira(product.price)}</div>
          <p class="${isOut ? 'stock-out' : isLow ? 'stock-low' : 'stock-ok'}">${isOut ? 'Out of stock' : isLow ? `Only ${product.stock} left` : 'In stock'}</p>
          <div class="card-actions">
            <button class="btn btn-primary btn-sm btn-block" onclick="NM.addToCartFromCard('${product.id}')" ${isOut ? 'disabled' : ''}>${isOut ? 'Out of stock' : 'Add to cart'}</button>
          </div>
        </div>
      </article>`;
  }

  function renderProductGrid(container, products) {
    if (!container) return;
    if (!products.length) { container.innerHTML = `<div class="empty-state"><p>No products found.</p></div>`; return; }
    const stores = getStores();
    container.innerHTML = products.map(p => productCard(p, stores.find(s => s.id === p.storeId))).join('');
  }

  function initSharedUI() {
    renderHeader();
    renderFooter();
    renderCartDrawer();
    renderLoginModal();
    renderCheckoutModal();
    updateCartCount();
  }

  window.NM.data = {
    getStores, getStoreById, getStoreBySlug, getProducts, getProductsByStore, getProductById,
    getOrders, getOrdersByStore, getOrdersByBuyer, getOrderById, getCart, getDisputes, getInvoices,
    getTeam, getStoreRating, getPlatformStats, getActivityLog, getUserById, getUserByEmail,
    createUser, createStore, createProduct, createOrder, createInvoice, createDispute,
    updateUser, updateStore, updateProduct, updateOrderStatus, updateCartQty,
    addToCart, removeFromCart, clearCart, saveCart, deleteProduct, deleteItem,
    payInvoice, withdraw, inviteTeamMember, removeTeamMember, resolveDispute, logActivity,
    formatNaira, normalizePhone, uid, now, todayStart, addDays,
    COMMISSION_RATE, POD_NEW_BUYER_CAP,
  };
  window.NM.auth = auth;
  window.NM.ui = { initSharedUI, renderHeader, renderFooter, renderProductGrid, showToast, openModal, closeModal, openCartDrawer, closeCartDrawer, openCheckoutModal, closeCheckoutModal, openLoginModal, closeLoginModal, updateCartCount, icon };
  window.NM.addToCartFromCard = function (productId) {
    const product = getProductById(productId);
    if (!product) return;
    if (product.stock <= 0) { showToast('This item is out of stock.'); return; }
    addToCart(product, 1);
    updateCartCount();
    showToast(`${product.name} added to cart`);
  };
})();
