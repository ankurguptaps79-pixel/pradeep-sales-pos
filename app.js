/* PRADEEP SALES POS — vanilla JS + IndexedDB. No external libraries. */
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round((+n || 0) * 100) / 100;
const num = n => { n = r2(n); return n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); };
const inr = n => '₹' + num(n);
const pad = (n, l = 2) => String(n).padStart(l, '0');
const ymd = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = d => { d = new Date(d); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtTime = d => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDT = d => fmtDate(d) + ' ' + fmtTime(d);
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const signed = n => (n > 0 ? '+' : '') + num(n);

let toastTimer;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 2600);
}

/* Spare-part line graphics (own drawings) used in the app header and the receipt header */
const GFX = [
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6" stroke-width="3.2" stroke-dasharray="3.4 3.35"/><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="2.2"/></svg>',                       // gear
  '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="7.5" rx="1"/><path d="M6 5h12M6 7.2h12M10.3 10l-.9 5.2M13.7 10l.9 5.2"/><circle cx="12" cy="18" r="3.2"/></svg>',                         // piston
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.3"/><circle cx="12" cy="12" r="3"/><path d="M12 5.6v.1M18.1 10v.1M15.8 17.2v.1M8.2 17.2v.1M5.9 10v.1" stroke-width="2.6"/></svg>',                  // brake disc
  '<svg viewBox="0 0 24 24"><path d="M10 2h4v3h-4zM8.5 5h7v4h-7zM9.5 9h5l-.6 7h-3.8zM12 16v3.5M12 21.5h3.5v-2"/></svg>',                                                                                       // spark plug
  '<svg viewBox="0 0 24 24"><path d="M12 1.5v3M8 4.5h8M8 4.5l8 3-8 3 8 3-8 3 8 3M8 19.5h8M12 19.5v3"/></svg>',                                                                                                 // shock absorber spring
  '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="3.2"/><circle cx="18" cy="6" r="3.2"/><path d="M8.3 15.7l7.4-7.4" stroke-width="3"/></svg>'                                                              // ring spanner
];

/* ================= IndexedDB ================= */
const DB_NAME = 'pradeep_sales_pos', DB_VER = 2;
const STORES = ['products', 'customers', 'sales', 'invoiceItems', 'settings', 'loyalty'];
let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result, has = n => d.objectStoreNames.contains(n);
      if (!has('products')) d.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
      if (!has('customers')) d.createObjectStore('customers', { keyPath: 'id', autoIncrement: true }).createIndex('mobile', 'mobile', { unique: true });
      if (!has('sales')) {
        const s = d.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
        s.createIndex('invoiceNo', 'invoiceNo', { unique: true });
        s.createIndex('date', 'date');
      }
      if (!has('invoiceItems')) d.createObjectStore('invoiceItems', { keyPath: 'id', autoIncrement: true }).createIndex('saleId', 'saleId');
      if (!has('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      if (!has('loyalty')) {                                       // points ledger: every earn / redeem / adjustment
        const l = d.createObjectStore('loyalty', { keyPath: 'id', autoIncrement: true });
        l.createIndex('customerId', 'customerId'); l.createIndex('saleId', 'saleId');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted')); });
const dbAll = s => rq(db.transaction(s).objectStore(s).getAll());
const dbGet = (s, k) => rq(db.transaction(s).objectStore(s).get(k));
const byIndex = (s, i, k) => rq(db.transaction(s).objectStore(s).index(i).getAll(k));
async function dbPut(s, v) { const t = db.transaction(s, 'readwrite'), done = txDone(t); const id = await rq(t.objectStore(s).put(v)); await done; return id; }
async function dbDel(s, k) { const t = db.transaction(s, 'readwrite'), done = txDone(t); t.objectStore(s).delete(k); await done; }
const itemsOf = async saleId => (await byIndex('invoiceItems', 'saleId', saleId)).sort((a, b) => a.sno - b.sno);

/* ================= state ================= */
const DEF = {
  shopName: 'PRADEEP SALES', address: '', phone: '', footer: 'THANK YOU!', prefix: 'PS', logo: '', seq: 0,
  copies: 'ask', gfx: true,
  loyaltyOn: false, lyItem: true, lyBillPts: 1, lyBillPer: 100, lyRedeem: true, lyValue: 1, lyMin: 0
};
const NUM_KEYS = ['lyBillPts', 'lyBillPer', 'lyValue', 'lyMin'];
const COPY = { customer: ['CUSTOMER COPY'], sales: ['SALES COPY'], both: ['CUSTOMER COPY', 'SALES COPY'], none: [] };
let S = { ...DEF };
let products = [], customers = [], cart = [], bal = new Map();
let view = 'sale', formPhoto = '', histCache = [], ana = {}, saving = false;

async function loadSettings() { S = { ...DEF }; (await dbAll('settings')).forEach(r => S[r.key] = r.value); }
async function setSetting(k, v) { S[k] = v; await dbPut('settings', { key: k, value: v }); }
async function loadProducts() { products = (await dbAll('products')).sort((a, b) => a.name.localeCompare(b.name)); }
async function loadCustomers() { customers = (await dbAll('customers')).sort((a, b) => a.name.localeCompare(b.name)); }
async function loadLoyalty() { bal = new Map(); (await dbAll('loyalty')).forEach(l => bal.set(l.customerId, (bal.get(l.customerId) || 0) + l.points)); }
const balance = id => r2(bal.get(id) || 0);

function applyBranding() {
  $('#brand-name').textContent = S.shopName || DEF.shopName;
  $('#brand-logo').src = S.logo || 'logo.png';
  document.body.classList.toggle('ly-on', !!S.loyaltyOn);
}

/* ================= images ================= */
function fileToDataURL(file, max, type = 'image/jpeg', q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d');
      if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL(type, q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
    img.src = url;
  });
}
const thumb = (p, cls) => p.photo ? `<img class="${cls || ''}" loading="lazy" src="${p.photo}" alt="">` : `<span class="ph ${cls || ''}">${esc(initials(p.name))}</span>`;

/* ================= modal / confirm ================= */
function openModal(html, wide) { $('#modal-root').innerHTML = `<div class="overlay" data-act="overlay"><div class="modal${wide ? ' wide' : ''}">${html}</div></div>`; }
function closeModal() { $('#modal-root').innerHTML = ''; }
let confirmRes;
function confirmBox(msg, okText = 'Yes') {
  return new Promise(res => {
    confirmRes = res;
    $('#confirm-root').innerHTML = `<div class="overlay"><div class="modal"><h2>Please confirm</h2><p>${esc(msg)}</p>
      <div class="modal-btns"><button class="btn ghost" data-act="confirm-no">Cancel</button><button class="btn primary" data-act="confirm-yes">${esc(okText)}</button></div></div></div>`;
  });
}
function endConfirm(v) { $('#confirm-root').innerHTML = ''; if (confirmRes) { confirmRes(v); confirmRes = null; } }

/* ================= navigation ================= */
const TITLES = { sale: 'New Sale', products: 'Products', customers: 'Customers', history: 'Sales History', analytics: 'Analytics', settings: 'Settings' };
async function show(v) {
  view = v;
  $$('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#view-title').textContent = TITLES[v];
  if (v === 'sale') { renderTiles(); renderCart(); }
  if (v === 'products') renderProducts();
  if (v === 'customers') await renderCustomers();
  if (v === 'history') await renderHistory();
  if (v === 'analytics') await renderAnalytics();
  if (v === 'settings') await renderSettings();
}

/* ================= NEW SALE ================= */
function matchProducts(q) {
  q = q.trim().toLowerCase();
  if (!q) return products;
  const words = q.split(/\s+/);
  return products.filter(p => { const h = (p.name + ' ' + (p.brand || '')).toLowerCase(); return words.every(w => h.includes(w)); });
}
function renderTiles() {
  const list = matchProducts($('#p-search').value), shown = list.slice(0, 150);
  $('#p-grid').innerHTML = shown.length
    ? shown.map(p => `<button class="tile" data-act="add-item" data-id="${p.id}">${thumb(p)}<span class="t-name">${esc(p.name)}</span><span class="t-brand">${esc(p.brand || '')}</span><span class="t-price">${inr(p.price)}${S.loyaltyOn && S.lyItem && +p.points > 0 ? `<span class="t-pts">★ ${num(p.points)}</span>` : ''}</span></button>`).join('')
      + (list.length > shown.length ? `<div class="empty">Showing 150 of ${list.length}. Type to search.</div>` : '')
    : `<div class="empty">${products.length ? 'No product matches your search.' : 'No products yet. Tap “+ Product” to add your first item.'}</div>`;
}
function renderCart() {
  $('#cart-body').innerHTML = cart.map((it, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td class="nm">${esc(it.name)}<small>${esc(it.brand || '')}</small></td>
    <td><div class="stepper"><button data-act="qty-dec" data-i="${i}">−</button><input class="qty-in" data-i="${i}" inputmode="decimal" value="${it.qty}"><button data-act="qty-inc" data-i="${i}">+</button></div></td>
    <td class="r"><input class="rate-in" data-i="${i}" inputmode="decimal" value="${it.rate}"></td>
    <td class="r amt">${num(it.qty * it.rate)}</td>
    <td><button class="icon-btn" data-act="item-del" data-i="${i}" title="Remove">×</button></td></tr>`).join('');
  $('#cart-empty').hidden = cart.length > 0;
  updateTotals();
}
const cartTotal = () => r2(sum(cart, it => r2(it.qty * it.rate)));

/* Works out the bill: sub-total, loyalty redemption, net payable and points earned. */
function calc() {
  const sub = cartTotal(), m = $('#c-mobile').value.trim(), valid = /^\d{10}$/.test(m);
  const cust = valid ? customers.find(c => c.mobile === m) : null;
  const r = { sub, net: sub, on: false, earn: 0, redeem: 0, value: 0, balance: 0, maxRedeem: 0, cust, mult: 1 };
  if (!S.loyaltyOn || !valid || (cust && cust.loyalty === false)) return r;
  r.on = true;
  r.balance = cust ? balance(cust.id) : 0;
  r.mult = cust && +cust.mult > 0 ? +cust.mult : 1;
  const v = +S.lyValue || 0;
  if (S.lyRedeem && v > 0 && r.balance > 0 && r.balance >= (+S.lyMin || 0)) r.maxRedeem = Math.max(0, Math.min(Math.floor(r.balance), Math.floor(sub / v)));
  r.redeem = Math.max(0, Math.min(Math.floor(+$('#ly-redeem').value || 0), r.maxRedeem));
  r.value = r2(r.redeem * v); r.net = r2(sub - r.value);
  const itemPts = S.lyItem ? sum(cart, it => (+it.qty || 0) * (+it.points || 0)) : 0;
  const billPts = +S.lyBillPer > 0 ? Math.floor(r.net / +S.lyBillPer) * (+S.lyBillPts || 0) : 0;
  r.earn = Math.round((itemPts + billPts) * r.mult);
  return r;
}
function updateTotals() {
  const r = calc();
  $('#ly-strip').hidden = !r.on;
  if (!r.on) $('#ly-redeem').value = '';
  else {
    $('#ly-bal').innerHTML = `Points: <b>${num(r.balance)}</b>` + (S.lyRedeem ? ` (worth ${inr(r.balance * (+S.lyValue || 0))})` : '') + (r.mult !== 1 ? ` · ${num(r.mult)}×` : '');
    $('#ly-redeem').disabled = !r.maxRedeem; $('#ly-redeem').closest('label').hidden = !S.lyRedeem;
    $('[data-act=ly-max]').hidden = !S.lyRedeem || !r.maxRedeem;
    $('#ly-earn').textContent = `This bill earns +${num(r.earn)}`;
  }
  $('#cart-total').textContent = inr(r.net);
  $('#cart-meta').textContent = cart.length ? `${cart.length} item${cart.length > 1 ? 's' : ''} · Qty ${num(sum(cart, it => +it.qty || 0))}` : '';
  $('#cart-sub').textContent = r.redeem ? `Sub-total ${inr(r.sub)} − ${num(r.redeem)} points (${inr(r.value)})` : '';
  saveDraft();
}
let draftTimer;
function saveDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(writeDraft, 120); }
function writeDraft() {
  clearTimeout(draftTimer);
  if (db) dbPut('settings', { key: 'draft', value: { cart, mobile: $('#c-mobile').value, name: $('#c-name').value, redeem: $('#ly-redeem').value } }).catch(() => { });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) writeDraft(); });
window.addEventListener('pagehide', writeDraft);

function addItem(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const ex = cart.find(x => x.productId === id);
  if (ex) ex.qty = r2((+ex.qty || 0) + 1);
  else cart.push({ productId: p.id, name: p.name, brand: p.brand || '', qty: 1, rate: r2(p.price), points: +p.points || 0 });
  renderCart();
  if (!ex) { const sc = $('#bill-scroll'); sc.scrollTop = sc.scrollHeight; }
}
function custSuggest(active) {
  const m = $('#c-mobile').value.trim(), n = $('#c-name').value.trim().toLowerCase(), box = $('#c-suggest');
  let list = [];
  if (active === 'c-mobile' && m) {
    const exact = customers.find(c => c.mobile === m);
    if (exact) { $('#c-name').value = exact.name; box.hidden = true; return; }
    list = customers.filter(c => c.mobile.includes(m));
  } else if (active === 'c-name' && n) list = customers.filter(c => c.name.toLowerCase().includes(n));
  list = list.slice(0, 6);
  box.hidden = !list.length;
  box.innerHTML = list.map(c => `<button data-act="cust-pick" data-id="${c.id}"><b>${esc(c.name)}</b><span>${esc(c.mobile)}${S.loyaltyOn ? ' · ★ ' + num(balance(c.id)) : ''}</span></button>`).join('');
}

function validateSale() {
  if (!cart.length) return toast('Add at least one item to the bill', 'err'), false;
  const mobile = $('#c-mobile').value.trim();
  if (mobile && !/^\d{10}$/.test(mobile)) return toast('Mobile number must be 10 digits', 'err'), false;
  for (const it of cart) {
    if (!(+it.qty > 0)) return toast(`Check quantity for “${it.name}”`, 'err'), false;
    if (!(+it.rate >= 0) || it.rate === '') return toast(`Check rate for “${it.name}”`, 'err'), false;
  }
  return true;
}
/* Asks which copy to print. act = action fired by the buttons. */
function copyChooser(title, act, id, withNone) {
  const b = (c, t, s) => `<button class="btn" data-act="${act}" data-c="${c}" data-id="${id || ''}"><b>${t}</b><small>${s}</small></button>`;
  openModal(`<h2>${esc(title)}</h2><p class="hint">Which copy do you want to print?</p>
    <div class="choice">${b('customer', 'Customer Copy', 'For the customer')}${b('sales', 'Sales Copy', 'For shop record')}${b('both', 'Both Copies', 'Customer + Sales')}</div>
    <div class="modal-btns">${withNone ? `<button class="btn ghost" data-act="${act}" data-c="none">Save Without Printing</button>` : ''}<button class="btn ghost" data-act="modal-close">Cancel</button></div>`);
}

async function doSave(copy) {
  if (saving || !validateSale()) return;
  saving = true; $('#save-print').disabled = true;
  try {
    const mobile = $('#c-mobile').value.trim(), name = $('#c-name').value.trim();
    const L = calc(), now = new Date().toISOString();
    const t = db.transaction(['sales', 'invoiceItems', 'customers', 'settings', 'loyalty'], 'readwrite'), done = txDone(t);
    const st = t.objectStore('settings');
    const seqRec = await rq(st.get('seq'));
    const seq = ((seqRec && seqRec.value) || 0) + 1;
    st.put({ key: 'seq', value: seq });

    let cust = null;
    if (mobile) {
      const cs = t.objectStore('customers');
      cust = await rq(cs.index('mobile').get(mobile));
      if (cust) { if (name && name !== cust.name) { cust.name = name; cs.put(cust); } }
      else { cust = { name: name || 'Customer', mobile, createdAt: now, loyalty: true, mult: 1 }; cust.id = await rq(cs.add(cust)); }
    }
    const lines = cart.map(it => ({
      productId: it.productId, name: it.name, brand: it.brand, qty: r2(it.qty), rate: r2(it.rate), amount: r2(it.qty * it.rate),
      points: L.on && S.lyItem ? r2((+it.qty || 0) * (+it.points || 0)) : 0
    }));
    const sale = {
      invoiceNo: `${S.prefix || 'PS'}-${pad(seq, 5)}`, date: now,
      customerId: cust ? cust.id : null, customerName: cust ? cust.name : name, customerMobile: mobile,
      subTotal: L.sub, pointsRedeemed: L.redeem, redeemValue: L.value, total: L.net,
      pointsEarned: L.earn, pointsBalance: L.on ? r2(L.balance - L.redeem + L.earn) : null,
      itemCount: lines.length, qtyTotal: r2(sum(lines, l => l.qty))
    };
    sale.id = await rq(t.objectStore('sales').add(sale));
    const is = t.objectStore('invoiceItems');
    lines.forEach((l, i) => is.add({ ...l, sno: i + 1, saleId: sale.id, invoiceNo: sale.invoiceNo, date: now, customerId: sale.customerId, customerName: sale.customerName, customerMobile: mobile }));
    if (cust && L.on) {                                   // points ledger, linked to party + transaction
      const ls = t.objectStore('loyalty'), base = { customerId: cust.id, saleId: sale.id, invoiceNo: sale.invoiceNo, date: now };
      if (L.redeem) ls.add({ ...base, type: 'redeem', points: -L.redeem, note: `Redeemed for ${inr(L.value)}` });
      if (L.earn) ls.add({ ...base, type: 'earn', points: L.earn, note: 'Earned on bill' });
    }
    st.delete('draft');
    await done;                                           // invoice is permanently stored here

    S.seq = seq; cart = [];
    $('#c-mobile').value = ''; $('#c-name').value = ''; $('#ly-redeem').value = ''; $('#c-suggest').hidden = true; $('#p-search').value = '';
    await Promise.all([loadCustomers(), loadLoyalty()]); renderTiles(); renderCart();
    toast(`Saved ${sale.invoiceNo} · ${inr(sale.total)}`);
    if (mobile) savedModal(sale, lines);                  // offer WhatsApp / SMS when a mobile number was entered
    await printReceipt(sale, lines, COPY[copy] || COPY.customer);
  } finally { saving = false; $('#save-print').disabled = false; }
}

/* ================= RECEIPT (58mm) ================= */
function receiptHTML(sale, items, label) {
  const rows = items.map((it, i) => `<tr><td class="n">${i + 1}</td><td class="i">${esc(it.name)}</td><td class="q">${num(it.qty)}</td><td class="p">${num(it.rate)}</td><td class="a">${num(it.amount)}</td></tr>`).join('');
  const g = S.gfx ? GFX : null, logo = `<img class="rc-logo${S.logo ? ' custom' : ''}" src="${S.logo || 'logo-print.png'}" alt="">`;
  const pts = S.loyaltyOn && sale.pointsBalance != null;
  return `<div class="rc">
    ${label ? `<div class="rc-copy">${label}</div>` : ''}
    <div class="rc-name">${esc(S.shopName || DEF.shopName)}</div>
    <div class="rc-head">${g ? g.slice(0, 3).join('') : ''}${logo}${g ? g.slice(3).join('') : ''}</div>
    ${S.address ? `<div class="rc-sub">${esc(S.address)}</div>` : ''}
    ${S.phone ? `<div class="rc-sub">Ph: ${esc(S.phone)}</div>` : ''}
    <div class="rc-line"></div>
    <div class="rc-meta"><span>Inv: ${esc(sale.invoiceNo)}</span><span>${fmtDT(sale.date)}</span></div>
    <div>Customer: ${esc(sale.customerName || 'Walk-in')}</div>
    ${sale.customerMobile ? `<div>Mobile: ${esc(sale.customerMobile)}</div>` : ''}
    <div class="rc-line"></div>
    <table><thead><tr><th class="n">#</th><th class="i">Item</th><th class="q">Qty</th><th class="p">Rate</th><th class="a">Amt</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rc-line"></div>
    ${sale.pointsRedeemed ? `<div class="rc-row"><span>Sub-total</span><span>${num(sale.subTotal)}</span></div><div class="rc-row"><span>Points redeemed (${num(sale.pointsRedeemed)})</span><span>-${num(sale.redeemValue)}</span></div>` : ''}
    <div class="rc-total"><span>TOTAL AMOUNT:</span><span>₹${num(sale.total)}</span></div>
    <div class="rc-count">Items: ${items.length} &nbsp; Qty: ${num(sum(items, i => i.qty))}</div>
    ${pts ? `<div class="rc-pts"><div class="rc-row"><span>Points earned</span><span>+${num(sale.pointsEarned || 0)}</span></div><div class="rc-row"><span>Points balance</span><span>${num(sale.pointsBalance)}</span></div></div>` : ''}
    ${label === 'SALES COPY' ? '<div class="rc-sign">Customer Signature</div>' : ''}
    <div class="rc-thanks">${esc(S.footer || 'THANK YOU!')}</div>
  </div>`;
}
let pageStyle;
async function printReceipt(sale, items, labels) {
  if (!labels || !labels.length) return;
  const el = $('#print-area');
  el.innerHTML = labels.map(l => receiptHTML(sale, items, l)).join('');
  await Promise.all($$('img', el).map(i => i.decode().catch(() => { })));
  // Size the page to the receipt so roll printers do not cut early or feed blank paper.
  const h = Math.max(...$$('.rc', el).map(r => r.getBoundingClientRect().height));
  const mm = Math.ceil(h * 25.4 / 96) + 6;
  if (!pageStyle) { pageStyle = document.createElement('style'); document.head.appendChild(pageStyle); }
  pageStyle.textContent = `@page{size:58mm ${Math.max(mm, 50)}mm;margin:0}`;
  await new Promise(r => setTimeout(r, 60));
  window.print();
}
async function reprint(id, copy) {
  const sale = await dbGet('sales', id); if (!sale) return toast('Invoice not found', 'err');
  await printReceipt(sale, await itemsOf(id), COPY[copy] || COPY.customer);
}

/* ================= SEND INVOICE BY MESSAGE ================= */
function invoiceText(sale, items) {
  const L = [`*${S.shopName || DEF.shopName}*`];
  if (S.address) L.push(S.address);
  if (S.phone) L.push('Ph: ' + S.phone);
  L.push('', `Invoice: ${sale.invoiceNo}`, `Date: ${fmtDT(sale.date)}`);
  if (sale.customerName) L.push(`Customer: ${sale.customerName}`);
  L.push('');
  items.forEach((it, i) => L.push(`${i + 1}. ${it.name}`, `   ${num(it.qty)} x ${num(it.rate)} = ${num(it.amount)}`));
  L.push('');
  if (sale.pointsRedeemed) L.push(`Sub-total: ₹${num(sale.subTotal)}`, `Points redeemed (${num(sale.pointsRedeemed)}): -₹${num(sale.redeemValue)}`);
  L.push(`*TOTAL AMOUNT: ₹${num(sale.total)}*`);
  if (S.loyaltyOn && sale.pointsBalance != null) L.push('', `Points earned: +${num(sale.pointsEarned || 0)}`, `Points balance: ${num(sale.pointsBalance)}`);
  L.push('', S.footer || 'THANK YOU!');
  return L.join('\n');
}
function sendButtons(sale, items) {
  const txt = encodeURIComponent(invoiceText(sale, items)), m = /^\d{10}$/.test(sale.customerMobile || '') ? '91' + sale.customerMobile : '';
  return `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${m}?text=${txt}">WhatsApp</a>
    <a class="btn" href="sms:${m ? '+' + m : ''}?body=${txt}">SMS</a>`;
}
function savedModal(sale, items) {
  openModal(`<h2>${esc(sale.invoiceNo)} saved · ${inr(sale.total)}</h2>
    <p class="hint">Send this invoice to ${esc(sale.customerName || 'the customer')}${sale.customerMobile ? ' on ' + esc(sale.customerMobile) : ''}?</p>
    <div class="modal-btns">${sendButtons(sale, items)}<button class="btn ghost" data-act="inv-print" data-id="${sale.id}">Reprint</button><button class="btn primary" data-act="modal-close">Done</button></div>`);
}

/* ================= PRODUCTS ================= */
function renderProducts() {
  const list = matchProducts($('#pm-search').value), shown = list.slice(0, 300);
  $('#pm-note').textContent = `${products.length} product${products.length === 1 ? '' : 's'}` + (list.length > shown.length ? ` · showing first 300 of ${list.length}, search to narrow` : '');
  $('#pm-body').innerHTML = shown.length ? shown.map(p => `<tr>
    <td>${thumb(p, 'thumb')}</td><td class="strong">${esc(p.name)}</td><td>${esc(p.brand || '')}</td><td class="r strong">${inr(p.price)}</td><td class="r ly-cell">${num(p.points || 0)}</td>
    <td class="r"><button class="btn sm" data-act="product-edit" data-id="${p.id}">Edit</button><button class="btn sm danger" data-act="product-del" data-id="${p.id}">Delete</button></td></tr>`).join('')
    : `<tr><td colspan="6" class="empty">No products found.</td></tr>`;
}
function photoPrev() { const el = $('#f-photo-prev'); if (el) el.innerHTML = formPhoto ? `<img src="${formPhoto}" alt="">` : 'No photo'; }
function productForm(p) {
  p = p || { name: '', brand: '', price: '', photo: '', points: '' };
  formPhoto = p.photo || '';
  const brands = [...new Set(products.map(x => x.brand).filter(Boolean))].sort();
  openModal(`<h2>${p.id ? 'Edit Product' : 'Add Product'}</h2>
    <div class="form">
      <label>Item Name<input id="f-name" value="${esc(p.name)}" maxlength="80" autocomplete="off"></label>
      <label>Brand<input id="f-brand" value="${esc(p.brand || '')}" list="brand-list" maxlength="40" autocomplete="off"></label>
      <datalist id="brand-list">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
      <label>Selling Price (₹)<input id="f-price" value="${esc(p.price)}" inputmode="decimal" autocomplete="off"></label>
      <label class="ly-block">Loyalty points per unit sold<input id="f-points" value="${esc(p.points || '')}" inputmode="decimal" placeholder="0" autocomplete="off"></label>
    </div>
    <div class="photo-row"><div id="f-photo-prev" class="photo-prev"></div>
      <div><label class="btn">Choose / Take Photo<input type="file" id="f-photo" accept="image/*" hidden></label>
      <button class="btn ghost" data-act="photo-remove">Remove</button>
      <p class="hint">Photo is only for identifying the item inside the app. It is never printed.</p></div></div>
    <div class="modal-btns"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="product-save" data-id="${p.id || ''}">Save Product</button></div>`);
  photoPrev();
  if (!p.id) $('#f-name').focus();
}
async function productSave(b) {
  const name = $('#f-name').value.trim(), brand = $('#f-brand').value.trim(), price = parseFloat($('#f-price').value);
  if (!name) return toast('Enter the item name', 'err');
  if (!(price >= 0)) return toast('Enter a valid selling price', 'err');
  const rec = { name, brand, price: r2(price), photo: formPhoto, points: Math.max(0, r2(parseFloat($('#f-points').value) || 0)) };
  if (b.dataset.id) rec.id = +b.dataset.id;
  await dbPut('products', rec);
  await loadProducts(); closeModal(); toast('Product saved');
  renderTiles(); if (view === 'products') renderProducts();
}
async function importProducts(file) {
  const rows = parseCSV(await file.text());
  if (!rows.length) return toast('That file is empty', 'err');
  let ci = { name: 0, brand: 1, price: 2, points: 3 }, start = 0;
  const head = rows[0].map(h => h.trim().toLowerCase());
  if (head.some(h => /name|item/.test(h))) {
    start = 1;
    ci = { name: head.findIndex(h => /name|item/.test(h)), brand: head.findIndex(h => /brand|make|company/.test(h)), price: head.findIndex(h => /price|rate|mrp/.test(h)), points: head.findIndex(h => /point/.test(h)) };
  }
  const key = p => (p.name + '|' + (p.brand || '')).toLowerCase(), n = (r, i) => r2(parseFloat(String(i >= 0 ? r[i] ?? '' : '').replace(/[^\d.]/g, '')) || 0);
  const existing = new Map(products.map(p => [key(p), p]));
  const t = db.transaction('products', 'readwrite'), done = txDone(t), st = t.objectStore('products');
  let added = 0, updated = 0;
  for (const r of rows.slice(start)) {
    const name = (r[ci.name] || '').trim(); if (!name) continue;
    const brand = ci.brand >= 0 ? (r[ci.brand] || '').trim() : '', price = n(r, ci.price), points = n(r, ci.points);
    const ex = existing.get(key({ name, brand }));
    if (ex) { ex.price = price; if (ci.points >= 0 && r[ci.points] != null) ex.points = points; st.put(ex); updated++; }
    else { const rec = { name, brand, price, points, photo: '' }; existing.set(key(rec), rec); st.put(rec); added++; }
  }
  await done; await loadProducts(); renderProducts(); renderTiles();
  toast(`Imported: ${added} added, ${updated} updated`);
}

/* ================= CUSTOMERS ================= */
async function renderCustomers() {
  const sales = await dbAll('sales'), stat = new Map();
  for (const s of sales) {
    if (s.customerId == null) continue;
    const x = stat.get(s.customerId) || { bills: 0, total: 0, last: '' };
    x.bills++; x.total += s.total; if (s.date > x.last) x.last = s.date; stat.set(s.customerId, x);
  }
  const q = $('#cm-search').value.trim().toLowerCase();
  const list = customers.filter(c => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q));
  $('#cm-note').textContent = `${customers.length} customer${customers.length === 1 ? '' : 's'}`;
  $('#cm-body').innerHTML = list.length ? list.slice(0, 400).map(c => {
    const x = stat.get(c.id) || { bills: 0, total: 0, last: '' };
    return `<tr><td class="strong">${esc(c.name)}</td><td>${esc(c.mobile)}</td><td class="r">${x.bills}</td><td class="r strong">${inr(x.total)}</td><td>${x.last ? fmtDate(x.last) : '—'}</td>
    <td class="r ly-cell strong">${c.loyalty === false ? '<small>Not enrolled</small>' : '★ ' + num(balance(c.id))}</td>
    <td class="r"><span class="ly-cell"><button class="btn sm" data-act="cust-points" data-id="${c.id}">Points</button></span><button class="btn sm" data-act="cust-history" data-mobile="${esc(c.mobile)}" data-name="${esc(c.name)}">History</button><button class="btn sm" data-act="customer-edit" data-id="${c.id}">Edit</button><button class="btn sm danger" data-act="customer-del" data-id="${c.id}">Delete</button></td></tr>`;
  }).join('') : `<tr><td colspan="7" class="empty">No customers found. Customers are saved automatically when you bill with a mobile number.</td></tr>`;
}
function customerForm(c) {
  c = c || { name: '', mobile: '' };
  openModal(`<h2>${c.id ? 'Edit Customer' : 'Add Customer'}</h2>
    <div class="form">
      <label>Party Name<input id="f-cname" value="${esc(c.name)}" maxlength="60" autocomplete="off"></label>
      <label>Mobile Number<input id="f-cmobile" value="${esc(c.mobile)}" inputmode="numeric" maxlength="10" autocomplete="off"></label>
      <label class="chk ly-block"><input type="checkbox" id="f-cloyal" ${c.loyalty === false ? '' : 'checked'}> Enrolled in loyalty points</label>
      <label class="ly-block">Points multiplier for this party (1 = normal, 2 = double points)<input id="f-cmult" value="${esc(c.mult || 1)}" inputmode="decimal" autocomplete="off"></label>
    </div>
    <div class="modal-btns"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="customer-save" data-id="${c.id || ''}">Save Customer</button></div>`);
}
async function customerSave(b) {
  const name = $('#f-cname').value.trim(), mobile = $('#f-cmobile').value.trim(), id = b.dataset.id ? +b.dataset.id : null;
  if (!name) return toast('Enter the customer name', 'err');
  if (!/^\d{10}$/.test(mobile)) return toast('Mobile number must be 10 digits', 'err');
  const dup = customers.find(c => c.mobile === mobile && c.id !== id);
  if (dup) return toast(`This mobile is already saved for ${dup.name}`, 'err');
  const old = id ? customers.find(c => c.id === id) : null;
  const mult = parseFloat($('#f-cmult').value);
  const rec = { ...(old || { createdAt: new Date().toISOString() }), name, mobile, loyalty: $('#f-cloyal').checked, mult: mult > 0 ? r2(mult) : 1 };
  await dbPut('customers', rec);
  await loadCustomers(); closeModal(); toast('Customer saved'); if (view === 'customers') renderCustomers(); updateTotals();
}
async function custHistory(mobile, name) {
  const sales = (await dbAll('sales')).filter(s => mobile ? s.customerMobile === mobile : (!s.customerMobile && (s.customerName || '') === (name || ''))).sort((a, b) => b.date.localeCompare(a.date));
  openModal(`<h2>${esc(name || 'Walk-in customers')}${mobile ? ' · ' + esc(mobile) : ''}</h2>
    <div class="kv"><div><span>Bills</span><b>${sales.length}</b></div><div><span>Total purchase</span><b>${inr(sum(sales, s => s.total))}</b></div>
      <div><span>Last purchase</span><b>${sales[0] ? fmtDate(sales[0].date) : '—'}</b></div><div><span>Average bill</span><b>${inr(sales.length ? sum(sales, s => s.total) / sales.length : 0)}</b></div></div>
    <div class="table-wrap short"><table class="grid compact"><thead><tr><th>Invoice</th><th>Date</th><th class="r">Items</th><th class="r ly-cell">Points</th><th class="r">Amount</th><th></th></tr></thead><tbody>
    ${sales.map(s => `<tr><td class="strong">${esc(s.invoiceNo)}</td><td>${fmtDT(s.date)}</td><td class="r">${s.itemCount}</td><td class="r ly-cell">${ptsCell(s)}</td><td class="r strong">${inr(s.total)}</td><td class="r"><button class="btn sm" data-act="inv-view" data-id="${s.id}">View</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No purchases yet.</td></tr>'}
    </tbody></table></div>
    <div class="modal-btns"><button class="btn primary" data-act="modal-close">Close</button></div>`, true);
}
const ptsCell = s => [s.pointsEarned ? `<span class="pos">+${num(s.pointsEarned)}</span>` : '', s.pointsRedeemed ? `<span class="neg">−${num(s.pointsRedeemed)}</span>` : ''].filter(Boolean).join(' ') || '—';

/* ----- loyalty: party points ledger ----- */
async function pointsModal(id) {
  const c = customers.find(x => x.id === id); if (!c) return;
  const led = (await byIndex('loyalty', 'customerId', id)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const b = balance(id), T = { earn: 'Earned', redeem: 'Redeemed', adjust: 'Adjustment' };
  openModal(`<h2>★ Loyalty Points · ${esc(c.name)}</h2>
    <div class="kv"><div><span>Points balance</span><b style="font-size:22px">${num(b)}</b></div><div><span>Worth</span><b style="font-size:22px">${inr(b * (+S.lyValue || 0))}</b></div>
      <div><span>Status</span><b>${c.loyalty === false ? 'Not enrolled' : 'Enrolled'}</b></div><div><span>Multiplier</span><b>${num(c.mult || 1)}×</b></div></div>
    <div class="table-wrap short"><table class="grid compact"><thead><tr><th>Date</th><th>Invoice</th><th>Type</th><th>Note</th><th class="r">Points</th></tr></thead><tbody>
    ${led.map(l => `<tr><td>${fmtDT(l.date)}</td><td>${l.saleId ? `<button class="btn sm" data-act="inv-view" data-id="${l.saleId}">${esc(l.invoiceNo)}</button>` : '—'}</td><td>${T[l.type] || l.type}</td><td>${esc(l.note || '')}</td><td class="r ${l.points < 0 ? 'neg' : 'pos'}">${signed(l.points)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No points activity yet.</td></tr>'}
    </tbody></table></div>
    <div class="adj"><input id="f-adj" inputmode="text" placeholder="Add / deduct, e.g. 50 or -20" autocomplete="off"><input id="f-adjnote" placeholder="Reason (optional)" autocomplete="off"><button class="btn" data-act="points-adjust" data-id="${id}">Apply</button></div>
    <div class="modal-btns"><button class="btn primary" data-act="modal-close">Close</button></div>`, true);
}
async function pointsAdjust(id) {
  const p = Math.round(parseFloat($('#f-adj').value));
  if (!p) return toast('Enter points to add (50) or deduct (-20)', 'err');
  if (balance(id) + p < 0) return toast('Cannot deduct more than the balance', 'err');
  await dbPut('loyalty', { customerId: id, saleId: null, invoiceNo: '', date: new Date().toISOString(), type: 'adjust', points: p, note: $('#f-adjnote').value.trim() || 'Manual adjustment' });
  await loadLoyalty(); toast('Points updated'); await pointsModal(id); if (view === 'customers') renderCustomers(); updateTotals();
}

/* ================= SALES HISTORY ================= */
const inRange = (iso, from, to) => { const k = ymd(iso); return (!from || k >= from) && (!to || k <= to); };
async function renderHistory() {
  const q = $('#h-q').value.trim().toLowerCase(), from = $('#h-from').value, to = $('#h-to').value;
  histCache = (await dbAll('sales')).filter(s => inRange(s.date, from, to) &&
    (!q || s.invoiceNo.toLowerCase().includes(q) || (s.customerName || '').toLowerCase().includes(q) || (s.customerMobile || '').includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('#h-note').textContent = `${histCache.length} invoice${histCache.length === 1 ? '' : 's'} · ${inr(sum(histCache, s => s.total))}` + (histCache.length > 300 ? ' · showing latest 300' : '');
  $('#h-body').innerHTML = histCache.length ? histCache.slice(0, 300).map(s => `<tr class="tap" data-act="inv-view" data-id="${s.id}">
    <td class="strong">${esc(s.invoiceNo)}</td><td>${fmtDT(s.date)}</td><td>${esc(s.customerName || 'Walk-in')}</td><td>${esc(s.customerMobile || '—')}</td><td class="r ly-cell">${ptsCell(s)}</td><td class="r strong">${inr(s.total)}</td>
    <td class="r"><button class="btn sm" data-act="inv-view" data-id="${s.id}">View</button><button class="btn sm" data-act="inv-print" data-id="${s.id}">Reprint</button></td></tr>`).join('')
    : `<tr><td colspan="7" class="empty">No invoices found.</td></tr>`;
}
async function invoiceView(id) {
  const s = await dbGet('sales', id); if (!s) return toast('Invoice not found', 'err');
  const items = await itemsOf(id);
  openModal(`<h2>Invoice ${esc(s.invoiceNo)}</h2>
    <div class="kv"><div><span>Date</span><b>${fmtDT(s.date)}</b></div><div><span>Party</span><b>${esc(s.customerName || 'Walk-in')}</b></div>
      <div><span>Mobile</span><b>${esc(s.customerMobile || '—')}</b></div><div><span>Items / Qty</span><b>${items.length} / ${num(sum(items, i => i.qty))}</b></div></div>
    <div class="table-wrap short"><table class="grid compact"><thead><tr><th>S.No.</th><th>Item Name</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th><th class="r ly-cell">Points</th></tr></thead><tbody>
    ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.name)}${it.brand ? ` <small style="color:var(--muted)">${esc(it.brand)}</small>` : ''}</td><td class="r">${num(it.qty)}</td><td class="r">${num(it.rate)}</td><td class="r strong">${num(it.amount)}</td><td class="r ly-cell">${num(it.points || 0)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="inv-sum">
      ${s.pointsRedeemed ? `<div><span>Sub-total</span><span>${inr(s.subTotal)}</span></div><div><span>Points redeemed (${num(s.pointsRedeemed)})</span><span class="neg">−${inr(s.redeemValue)}</span></div>` : ''}
      <div class="tot"><span>TOTAL AMOUNT</span><span>${inr(s.total)}</span></div>
      ${s.pointsBalance != null ? `<div class="ly-block"><div><span>Points earned on this bill</span><span class="pos">+${num(s.pointsEarned || 0)}</span></div><div><span>Points balance after bill</span><span>${num(s.pointsBalance)}</span></div></div>` : ''}
    </div>
    <div class="modal-btns"><button class="btn danger" data-act="inv-del" data-id="${s.id}">Delete</button>${sendButtons(s, items)}<button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="inv-print" data-id="${s.id}">Reprint</button></div>`, true);
}
async function invoiceDelete(id) {
  const s = await dbGet('sales', id); if (!s) return;
  if (!await confirmBox(`Delete invoice ${s.invoiceNo} (${inr(s.total)}) permanently? It is removed from analytics and its loyalty points are reversed.`, 'Delete')) return;
  const [items, led] = await Promise.all([itemsOf(id), byIndex('loyalty', 'saleId', id)]);
  const t = db.transaction(['sales', 'invoiceItems', 'loyalty'], 'readwrite'), done = txDone(t);
  t.objectStore('sales').delete(id);
  items.forEach(i => t.objectStore('invoiceItems').delete(i.id)); led.forEach(l => t.objectStore('loyalty').delete(l.id));
  await done; await loadLoyalty(); closeModal(); toast('Invoice deleted'); show(view);
}

/* ================= ANALYTICS ================= */
function setPreset(p) {
  const now = new Date(), today = ymd(now); let from = '', to = '';
  if (p === 'today') from = to = today;
  if (p === '7') { const d = new Date(now); d.setDate(d.getDate() - 6); from = ymd(d); to = today; }
  if (p === 'month') { from = today.slice(0, 8) + '01'; to = today; }
  $('#a-from').value = from; $('#a-to').value = to;
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
}
async function renderAnalytics() {
  const [sales, items] = await Promise.all([dbAll('sales'), dbAll('invoiceItems')]);
  const today = ymd(new Date()), month = today.slice(0, 7);
  const tS = sales.filter(s => ymd(s.date) === today), mS = sales.filter(s => ymd(s.date).startsWith(month));
  $('#a-fixed').innerHTML = `
    <div class="card dark"><div class="k">Today's Sales</div><div class="v">${inr(sum(tS, s => s.total))}</div><div class="s">${tS.length} bill${tS.length === 1 ? '' : 's'}</div></div>
    <div class="card dark"><div class="k">Monthly Sales</div><div class="v">${inr(sum(mS, s => s.total))}</div><div class="s">${mS.length} bill${mS.length === 1 ? '' : 's'} this month</div></div>`;

  const from = $('#a-from').value, to = $('#a-to').value;
  const fs = sales.filter(s => inRange(s.date, from, to)), fi = items.filter(i => inRange(i.date, from, to));
  const total = sum(fs, s => s.total), out = sum([...bal.values()], v => v);
  $('#a-cards').innerHTML = `
    <div class="card"><div class="k">Sales (selected period)</div><div class="v">${inr(total)}</div></div>
    <div class="card"><div class="k">Total Bills</div><div class="v">${fs.length}</div></div>
    <div class="card"><div class="k">Average Bill Value</div><div class="v">${inr(fs.length ? total / fs.length : 0)}</div></div>
    <div class="card"><div class="k">Quantity Sold</div><div class="v">${num(sum(fi, i => i.qty))}</div></div>
    <div class="card gold ly-block"><div class="k">★ Points Given</div><div class="v">${num(sum(fs, s => s.pointsEarned || 0))}</div><div class="s">in selected period</div></div>
    <div class="card gold ly-block"><div class="k">★ Points Redeemed</div><div class="v">${num(sum(fs, s => s.pointsRedeemed || 0))}</div><div class="s">worth ${inr(sum(fs, s => s.redeemValue || 0))}</div></div>
    <div class="card gold ly-block"><div class="k">★ Points Outstanding</div><div class="v">${num(out)}</div><div class="s">liability ${inr(out * (+S.lyValue || 0))} (all parties)</div></div>`;

  // daily
  const dm = new Map(); fs.forEach(s => { const k = ymd(s.date); dm.set(k, (dm.get(k) || 0) + s.total); });
  const days = [...dm.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-31), dmax = Math.max(1, ...days.map(d => d[1]));
  $('#a-daily').innerHTML = days.length ? days.map(([k, v]) => `<div class="d"><em>${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v)}</em><i style="height:${Math.max(2, v / dmax * 100)}%"></i><small>${k.slice(8)}/${k.slice(5, 7)}</small></div>`).join('') : '<div class="empty" style="width:100%">No sales in this period.</div>';

  // products & brands
  const pm = new Map(), bm = new Map();
  for (const i of fi) {
    const k = i.name + '|' + (i.brand || ''), p = pm.get(k) || { name: i.name, brand: i.brand || '', qty: 0, revenue: 0 };
    p.qty += i.qty; p.revenue += i.amount; pm.set(k, p);
    const bk = i.brand || 'No brand', b = bm.get(bk) || { brand: bk, qty: 0, revenue: 0 };
    b.qty += i.qty; b.revenue += i.amount; bm.set(bk, b);
  }
  const prod = [...pm.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  const brand = [...bm.values()].sort((a, b) => b.revenue - a.revenue), bmax = Math.max(1, ...brand.map(b => b.revenue));
  $('#a-products').innerHTML = prod.slice(0, 50).map(p => `<tr><td class="strong">${esc(p.name)}</td><td>${esc(p.brand)}</td><td class="r">${num(p.qty)}</td><td class="r strong">${inr(p.revenue)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No data.</td></tr>';
  $('#a-brands').innerHTML = brand.map(b => `<div class="bar-row"><div class="top"><span>${esc(b.brand)} <small style="color:var(--muted)">· Qty ${num(b.qty)}</small></span><b>${inr(b.revenue)}</b></div><div class="bar"><span style="width:${b.revenue / bmax * 100}%"></span></div></div>`).join('') || '<div class="empty">No data.</div>';

  // customers
  const cm = new Map();
  for (const s of fs) {
    const k = s.customerMobile || ('n:' + (s.customerName || '')), c = cm.get(k) || { name: s.customerName || 'Walk-in', mobile: s.customerMobile || '', rawName: s.customerName || '', bills: 0, total: 0, last: '' };
    c.bills++; c.total += s.total; if (s.date > c.last) { c.last = s.date; if (s.customerName) c.name = s.customerName; } cm.set(k, c);
  }
  const cust = [...cm.values()].sort((a, b) => b.total - a.total);
  $('#a-customers').innerHTML = cust.slice(0, 50).map(c => `<tr><td class="strong">${esc(c.name)}</td><td>${esc(c.mobile || '—')}</td><td class="r">${c.bills}</td><td class="r strong">${inr(c.total)}</td><td>${fmtDate(c.last)}</td>
    <td class="r"><button class="btn sm" data-act="cust-history" data-mobile="${esc(c.mobile)}" data-name="${esc(c.mobile ? c.name : c.rawName)}">History</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No data.</td></tr>';

  ana = { prod, brand, cust, items: fi.sort((a, b) => b.date.localeCompare(a.date) || a.sno - b.sno) };
  renderReport();
}
function reportRows() {
  const q = $('#a-q').value.trim().toLowerCase();
  return (ana.items || []).filter(i => !q || (i.name + ' ' + (i.brand || '') + ' ' + (i.customerName || '') + ' ' + (i.customerMobile || '') + ' ' + i.invoiceNo).toLowerCase().includes(q));
}
function renderReport() {
  const rows = reportRows();
  $('#a-report-note').textContent = `${rows.length} line${rows.length === 1 ? '' : 's'} · Qty ${num(sum(rows, i => i.qty))} · ${inr(sum(rows, i => i.amount))}` + (rows.length > 500 ? ' · showing first 500 (CSV export includes all)' : '');
  $('#a-report').innerHTML = rows.slice(0, 500).map(i => `<tr><td>${fmtDate(i.date)}</td><td>${esc(i.invoiceNo)}</td><td>${esc(i.customerName || 'Walk-in')}</td><td>${esc(i.customerMobile || '—')}</td><td class="strong">${esc(i.name)}</td><td>${esc(i.brand || '')}</td><td class="r">${num(i.qty)}</td><td class="r">${num(i.rate)}</td><td class="r strong">${num(i.amount)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No sales in this period.</td></tr>';
}

/* ================= CSV / backup ================= */
function toCSV(rows) { return '﻿' + rows.map(r => r.map(v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); }
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cur = '', q = false;
  const end = () => { row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; end(); }
    else cur += c;
  }
  end(); return rows;
}
function download(name, text, mime) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const stamp = () => ymd(new Date());
const itemRow = i => [fmtDate(i.date), fmtTime(i.date), i.invoiceNo, i.customerName || 'Walk-in', i.customerMobile || '', i.name, i.brand || '', i.qty, i.rate, i.amount, i.points || 0];
const ITEM_HEAD = ['Date', 'Time', 'Invoice No', 'Customer', 'Mobile', 'Item Name', 'Brand', 'Qty', 'Rate', 'Amount', 'Item Points'];
const saleRow = s => [s.invoiceNo, fmtDate(s.date), fmtTime(s.date), s.customerName || 'Walk-in', s.customerMobile || '', s.itemCount, s.qtyTotal, s.subTotal ?? s.total, s.pointsRedeemed || 0, s.redeemValue || 0, s.total, s.pointsEarned || 0];
const SALE_HEAD = ['Invoice No', 'Date', 'Time', 'Customer', 'Mobile', 'Items', 'Total Qty', 'Sub Total', 'Points Redeemed', 'Redeem Value', 'Total Amount', 'Points Earned'];

async function exportStore(k) {
  let rows;
  if (k === 'products') rows = [['Item Name', 'Brand', 'Selling Price', 'Points Per Unit'], ...products.map(p => [p.name, p.brand || '', p.price, p.points || 0])];
  if (k === 'customers') rows = [['Customer Name', 'Mobile', 'Added On', 'Loyalty Enrolled', 'Multiplier', 'Points Balance'], ...customers.map(c => [c.name, c.mobile, c.createdAt ? fmtDate(c.createdAt) : '', c.loyalty === false ? 'No' : 'Yes', c.mult || 1, balance(c.id)])];
  if (k === 'sales') rows = [SALE_HEAD, ...(await dbAll('sales')).sort((a, b) => a.date.localeCompare(b.date)).map(saleRow)];
  if (k === 'invoiceItems') rows = [ITEM_HEAD, ...(await dbAll('invoiceItems')).sort((a, b) => a.date.localeCompare(b.date)).map(itemRow)];
  if (k === 'loyalty') {
    const cm = new Map(customers.map(c => [c.id, c]));
    rows = [['Date', 'Time', 'Customer', 'Mobile', 'Invoice No', 'Type', 'Points', 'Note'], ...(await dbAll('loyalty')).sort((a, b) => a.date.localeCompare(b.date)).map(l => { const c = cm.get(l.customerId) || {}; return [fmtDate(l.date), fmtTime(l.date), c.name || '', c.mobile || '', l.invoiceNo || '', l.type, l.points, l.note || '']; })];
  }
  download(`pradeep-sales-${k}-${stamp()}.csv`, toCSV(rows), 'text/csv');
  toast('CSV downloaded');
}
function exportAnalytics(k) {
  let rows;
  if (k === 'report') rows = [ITEM_HEAD, ...reportRows().map(itemRow)];
  if (k === 'prod') rows = [['Product', 'Brand', 'Qty Sold', 'Revenue'], ...ana.prod.map(p => [p.name, p.brand, r2(p.qty), r2(p.revenue)])];
  if (k === 'brand') rows = [['Brand', 'Qty Sold', 'Revenue'], ...ana.brand.map(b => [b.brand, r2(b.qty), r2(b.revenue)])];
  if (k === 'cust') rows = [['Customer', 'Mobile', 'Bills', 'Total Sales', 'Last Purchase'], ...ana.cust.map(c => [c.name, c.mobile, c.bills, r2(c.total), fmtDate(c.last)])];
  download(`pradeep-sales-${k}-${stamp()}.csv`, toCSV(rows), 'text/csv'); toast('CSV downloaded');
}
async function backup() {
  const data = {}; for (const s of STORES) data[s] = await dbAll(s);
  download(`pradeep-sales-backup-${stamp()}.json`, JSON.stringify({ app: 'pradeep-sales-pos', version: 2, exportedAt: new Date().toISOString(), data }), 'application/json');
  await setSetting('lastBackup', new Date().toISOString()); toast('Backup downloaded'); if (view === 'settings') renderSettings();
}
async function restore(file) {
  let j; try { j = JSON.parse(await file.text()); } catch (e) { return toast('That is not a valid backup file', 'err'); }
  if (!j || j.app !== 'pradeep-sales-pos' || !j.data) return toast('That is not a Pradeep Sales POS backup', 'err');
  const d = j.data;
  if (!await confirmBox(`Restore backup from ${fmtDT(j.exportedAt)}? It has ${(d.sales || []).length} invoices, ${(d.products || []).length} products and ${(d.customers || []).length} customers. ALL current data on this tablet will be replaced.`, 'Replace & Restore')) return;
  const t = db.transaction(STORES, 'readwrite'), done = txDone(t);
  for (const s of STORES) { const st = t.objectStore(s); st.clear(); (d[s] || []).forEach(r => st.put(r)); }
  await done; toast('Backup restored'); setTimeout(() => location.reload(), 700);
}

/* ================= SETTINGS ================= */
async function renderSettings() {
  $$('[data-set]').forEach(i => { if (i.type === 'checkbox') i.checked = !!S[i.dataset.set]; else i.value = S[i.dataset.set] ?? ''; });
  $('#ly-config').classList.toggle('off', !S.loyaltyOn);
  $('#s-logo-prev').innerHTML = `<img src="${S.logo || 'logo.png'}" alt="">`;
  const cnt = s => rq(db.transaction(s).objectStore(s).count());
  const [ns, ni] = await Promise.all([cnt('sales'), cnt('invoiceItems')]);
  let persisted = false; try { persisted = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch (e) { }
  $('#s-db').innerHTML = `Products: <b>${products.length}</b> · Customers: <b>${customers.length}</b> · Invoices: <b>${ns}</b> · Invoice lines: <b>${ni}</b><br>
    Next invoice number: <b>${esc(S.prefix || 'PS')}-${pad((S.seq || 0) + 1, 5)}</b><br>
    Protected storage: <b>${persisted ? 'On' : 'Not confirmed by the browser. Install the app to the home screen and keep backups.'}</b><br>
    Last backup: <b>${S.lastBackup ? fmtDT(S.lastBackup) : 'never'}</b>`;
}
async function setLogo(file) {
  const url = await fileToDataURL(file, 320, 'image/png');
  await setSetting('logo', url); applyBranding(); if (view === 'settings') renderSettings(); toast('Logo updated');
}

/* ================= actions ================= */
const ACT = {
  nav: b => show(b.dataset.view),
  overlay: (b, e) => { if (e.target === b) closeModal(); },
  'modal-close': closeModal,
  'confirm-yes': () => endConfirm(true),
  'confirm-no': () => endConfirm(false),

  'add-item': b => { addItem(+b.dataset.id); b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 140); },
  'qty-inc': b => { const it = cart[+b.dataset.i]; it.qty = r2((+it.qty || 0) + 1); renderCart(); },
  'qty-dec': b => { const it = cart[+b.dataset.i]; it.qty = Math.max(1, r2((+it.qty || 0) - 1)); renderCart(); },
  'item-del': b => { cart.splice(+b.dataset.i, 1); renderCart(); },
  'cart-clear': async () => { if (!cart.length) return; if (await confirmBox('Clear the current bill?', 'Clear')) { cart = []; $('#ly-redeem').value = ''; renderCart(); } },
  'cust-clear': () => { $('#c-mobile').value = ''; $('#c-name').value = ''; $('#c-suggest').hidden = true; updateTotals(); },
  'cust-pick': b => { const c = customers.find(x => x.id === +b.dataset.id); if (c) { $('#c-mobile').value = c.mobile; $('#c-name').value = c.name; } $('#c-suggest').hidden = true; updateTotals(); },
  'ly-max': () => { $('#ly-redeem').value = calc().maxRedeem || ''; updateTotals(); },
  'save-print': () => { if (!validateSale()) return; return S.copies === 'ask' ? copyChooser('Save & Print', 'do-save', '', true) : doSave(S.copies); },
  'do-save': b => { closeModal(); return doSave(b.dataset.c); },
  'do-print': b => { closeModal(); return reprint(+b.dataset.id, b.dataset.c); },

  'product-new': () => productForm(),
  'product-edit': b => productForm(products.find(p => p.id === +b.dataset.id)),
  'product-save': productSave,
  'product-del': async b => {
    const p = products.find(x => x.id === +b.dataset.id); if (!p) return;
    if (!await confirmBox(`Delete “${p.name}”? Past invoices keep their record of it.`, 'Delete')) return;
    await dbDel('products', p.id); cart = cart.filter(c => c.productId !== p.id);
    await loadProducts(); renderProducts(); renderTiles(); renderCart(); toast('Product deleted');
  },
  'photo-remove': () => { formPhoto = ''; photoPrev(); },

  'customer-new': () => customerForm(),
  'customer-edit': b => customerForm(customers.find(c => c.id === +b.dataset.id)),
  'customer-save': customerSave,
  'customer-del': async b => {
    const c = customers.find(x => x.id === +b.dataset.id); if (!c) return;
    if (!await confirmBox(`Delete customer ${c.name}? Their past invoices stay in Sales History, but their loyalty points are removed.`, 'Delete')) return;
    const led = await byIndex('loyalty', 'customerId', c.id);
    const t = db.transaction(['customers', 'loyalty'], 'readwrite'), done = txDone(t);
    t.objectStore('customers').delete(c.id); led.forEach(l => t.objectStore('loyalty').delete(l.id));
    await done; await Promise.all([loadCustomers(), loadLoyalty()]); renderCustomers(); toast('Customer deleted');
  },
  'cust-history': b => custHistory(b.dataset.mobile, b.dataset.name),
  'cust-points': b => pointsModal(+b.dataset.id),
  'points-adjust': b => pointsAdjust(+b.dataset.id),

  'inv-view': b => invoiceView(+b.dataset.id),
  'inv-print': b => S.copies === 'ask' ? copyChooser('Reprint Invoice', 'do-print', b.dataset.id) : reprint(+b.dataset.id, S.copies),
  'inv-del': b => invoiceDelete(+b.dataset.id),
  'h-reset': () => { $('#h-q').value = $('#h-from').value = $('#h-to').value = ''; renderHistory(); },
  'h-export': () => { download(`pradeep-sales-history-${stamp()}.csv`, toCSV([SALE_HEAD, ...histCache.map(saleRow)]), 'text/csv'); toast('CSV downloaded'); },

  'a-preset': b => { setPreset(b.dataset.p); renderAnalytics(); },
  'a-export': b => exportAnalytics(b.dataset.k),

  'logo-remove': async () => { await setSetting('logo', ''); applyBranding(); renderSettings(); toast('Using the built-in logo'); },
  'test-print': () => printReceipt({ invoiceNo: (S.prefix || 'PS') + '-TEST', date: new Date().toISOString(), customerName: 'Test Customer', customerMobile: '9999999999', subTotal: 1385, total: 1385, pointsEarned: 13, pointsBalance: S.loyaltyOn ? 113 : null },
    [{ name: 'Clutch Plate Set RE Compact 4S', qty: 2, rate: 420, amount: 840 }, { name: 'Brake Shoe', qty: 1, rate: 185, amount: 185 }, { name: 'Engine Oil 20W40 1L', qty: 1, rate: 360, amount: 360 }], COPY.customer),
  backup, csv: b => exportStore(b.dataset.k),
};
const fail = err => { console.error(err); toast((err && err.message) || 'Something went wrong', 'err'); };

document.addEventListener('click', e => {
  if (!e.target.closest('.cust')) $('#c-suggest').hidden = true;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const f = ACT[b.dataset.act];
  if (f) { try { Promise.resolve(f(b, e)).catch(fail); } catch (err) { fail(err); } }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('.qty-in,.rate-in')) {
    const it = cart[+t.dataset.i]; if (!it) return;
    const v = parseFloat(t.value);
    it[t.classList.contains('qty-in') ? 'qty' : 'rate'] = isNaN(v) || v < 0 ? 0 : v;
    $('.amt', t.closest('tr')).textContent = num(it.qty * it.rate);
    updateTotals(); return;
  }
  switch (t.id) {
    case 'p-search': renderTiles(); break;
    case 'pm-search': renderProducts(); break;
    case 'cm-search': renderCustomers().catch(fail); break;
    case 'h-q': renderHistory().catch(fail); break;
    case 'a-q': renderReport(); break;
    case 'c-mobile': t.value = t.value.replace(/\D/g, ''); custSuggest('c-mobile'); updateTotals(); break;
    case 'c-name': custSuggest('c-name'); saveDraft(); break;
    case 'ly-redeem': t.value = t.value.replace(/\D/g, ''); updateTotals(); break;
    case 'f-cmobile': t.value = t.value.replace(/\D/g, ''); break;
  }
});

document.addEventListener('change', e => {
  const t = e.target, file = t.files && t.files[0];
  const run = p => Promise.resolve(p).catch(fail);
  if (t.matches('.qty-in,.rate-in')) { const it = cart[+t.dataset.i]; if (it && !(+it.qty > 0)) it.qty = 1; renderCart(); return; }
  if (t.id === 'ly-redeem') { const r = calc(); t.value = r.redeem || ''; updateTotals(); return; }
  if (t.dataset.set) {
    const k = t.dataset.set; let v;
    if (t.type === 'checkbox') v = t.checked;
    else {
      v = t.value.trim();
      if (NUM_KEYS.includes(k)) v = Math.max(0, r2(parseFloat(v) || 0));
      if (k === 'prefix') v = v.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PS';
      if (k === 'shopName' && !v) v = DEF.shopName;
      if (k === 'footer' && !v) v = DEF.footer;
      t.value = v;
    }
    run(setSetting(k, v).then(() => { applyBranding(); return renderSettings(); })); return;
  }
  if (t.id === 'h-from' || t.id === 'h-to') return run(renderHistory());
  if (t.id === 'a-from' || t.id === 'a-to') { $$('.seg button').forEach(b => b.classList.remove('on')); return run(renderAnalytics()); }
  if (!file) return;
  if (t.id === 'logo-file') run(setLogo(file));
  if (t.id === 'f-photo') run(fileToDataURL(file, 260).then(u => { formPhoto = u; photoPrev(); }));
  if (t.id === 'restore-file') run(restore(file));
  if (t.id === 'import-file') run(importProducts(file));
  t.value = '';
});

document.addEventListener('focusin', e => { if (e.target.matches('.qty-in,.rate-in,#ly-redeem')) e.target.select(); });

/* ================= boot ================= */
function tick() { const d = new Date(); $('#clock').innerHTML = `${d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}<br>${fmtTime(d)}`; }

(async function init() {
  try {
    $('#top-gfx').innerHTML = GFX.join('');
    db = await openDB();
    await Promise.all([loadSettings(), loadProducts(), loadCustomers(), loadLoyalty()]);
    const d = S.draft;                                   // restore an unfinished bill after refresh
    if (d && Array.isArray(d.cart)) { cart = d.cart; $('#c-mobile').value = d.mobile || ''; $('#c-name').value = d.name || ''; $('#ly-redeem').value = d.redeem || ''; }
    applyBranding(); setPreset('month'); tick(); setInterval(tick, 20000);
    await show('sale');
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<div style="padding:32px;font:16px system-ui">Could not open the database on this browser (${esc(err && err.message)}).<br>Please use Google Chrome, not in Incognito mode.</div>`;
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('service-worker.js').catch(() => { });
})();
