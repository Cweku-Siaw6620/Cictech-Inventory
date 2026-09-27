/* ============================================================
   FILE 3: Finance/daily-sales.js
   CICTech Electronics — Finance Module
   Daily Sales page behavior (vanilla JS)
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Constants ---------- */
  const API_BASE = "https://cictech-inventory-2se4.vercel.app";
  const LOGIN_REDIRECT = "../index.html";
  const ADMIN_REDIRECT = "admin-dashboard.html";

  /* ---------- DOM refs ---------- */
  const $ = (id) => document.getElementById(id);

  const loadingState = $("loadingState");
  const errorState = $("errorState");
  const errorMessage = $("errorMessage");
  const retryBtn = $("retryBtn");
  const pageContent = $("pageContent");

  const userRoleEl = $("userRole");
  const userBranchEl = $("userBranch");
  const backToDashboard = $("backToDashboard");

  const pageDateEl = $("pageDate");
  const accountStatusEl = $("accountStatus");
  const accountStatusText = accountStatusEl ? accountStatusEl.querySelector(".fin-status-text") : null;

  const closedNotice = $("closedNotice");
  const recordCard = $("recordCard");

  /* Summary cards */
  const sumTotal = $("sumTotal");
  const sumCash = $("sumCash");
  const sumMomo = $("sumMomo");
  const sumBank = $("sumBank");

  /* Tabs */
  const tabInventory = $("tabInventory");
  const tabManual = $("tabManual");

  /* Forms */
  const inventoryForm = $("inventoryForm");
  const manualForm = $("manualForm");

  /* Inventory form */
  const invSerial = $("invSerial");
  const invSerialLookupBtn = $("invSerialLookupBtn");
  const invSerialHint = $("invSerialHint");
  const invProductPreview = $("invProductPreview");
  const pvBrand = $("pvBrand");
  const pvModel = $("pvModel");
  const pvSerial = $("pvSerial");
  const pvProcessor = $("pvProcessor");
  const pvRam = $("pvRam");
  const pvStorage = $("pvStorage");
  const pvPrice = $("pvPrice");
  const invPrice = $("invPrice");
  const invCash = $("invCash");
  const invMomo = $("invMomo");
  const invBank = $("invBank");
  const invTotalPaid = $("invTotalPaid");
  const invHint = $("invHint");
  const invSubmitBtn = $("invSubmitBtn");

  /* Manual form */
  const categoryBtns = document.querySelectorAll(".fin-cat-btn");
  const manName = $("manName");
  const manSerial = $("manSerial");
  const manDetail = $("manDetail");
  const manSerialRow = $("manSerialRow");
  const manDetailRow = $("manDetailRow");
  const manPrice = $("manPrice");
  const manCash = $("manCash");
  const manMomo = $("manMomo");
  const manBank = $("manBank");
  const manTotalPaid = $("manTotalPaid");
  const manHint = $("manHint");
  const manSubmitBtn = $("manSubmitBtn");

  /* Sales list */
  const salesListWrap = $("salesListWrap");

  /* Toast */
  const toastContainer = $("toastContainer");

  /* ---------- Local state ---------- */
  const state = {
    user: null,
    pin: null,
    account: null,
    summary: null,
    sales: [],
    selectedProduct: null,
    isClosed: false,
    saleCategory: "device",
    currentTab: "inventory",
    serialLookupToken: 0,
  };

  /* ---------- Utilities ---------- */

  function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return "GHS 0.00";
    const num = Number(value);
    return "GHS " + num.toLocaleString("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatNumber(value) {
    if (value === null || value === undefined || isNaN(value)) return 0;
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  function formatTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return "—";
    }
  }

  function formatLongDate(dateInput) {
    try {
      const d = dateInput ? new Date(dateInput) : new Date();
      if (isNaN(d.getTime())) throw new Error("invalid");
      return d.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- Toast ---------- */

  function showToast(message, type = "info", duration = 3500) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "fin-toast fin-toast-" + type;
    const iconMap = { success: "✓", error: "✕", info: "ℹ" };
    toast.innerHTML =
      '<span class="fin-toast-icon">' + (iconMap[type] || "ℹ") + "</span>" +
      '<span class="fin-toast-msg">' + escapeHtml(message) + "</span>";
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      toast.style.transition = "opacity 0.2s, transform 0.2s";
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  /* ---------- UI state helpers ---------- */

  function showLoading() {
    loadingState.classList.remove("hidden");
    errorState.classList.add("hidden");
    pageContent.classList.add("hidden");
  }

  function showError(msg) {
    loadingState.classList.add("hidden");
    pageContent.classList.add("hidden");
    errorMessage.textContent = msg;
    errorState.classList.remove("hidden");
  }

  function showContent() {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
    pageContent.classList.remove("hidden");
  }

  /* ---------- Auth ---------- */

  function getStoredAuth() {
    const pin = localStorage.getItem("pin");
    const userRaw = localStorage.getItem("user");
    if (!pin || !userRaw) return null;
    try {
      const user = JSON.parse(userRaw);
      if (!user || typeof user !== "object") return null;
      return { pin, user };
    } catch {
      return null;
    }
  }

  function ensureAuth() {
    const auth = getStoredAuth();
    if (!auth) {
      window.location.href = LOGIN_REDIRECT;
      return null;
    }
    if (auth.user.role === "admin") {
      window.location.href = ADMIN_REDIRECT;
      return null;
    }
    if (auth.user.role !== "staff") {
      window.location.href = LOGIN_REDIRECT;
      return null;
    }
    state.user = auth.user;
    state.pin = auth.pin;
    return auth;
  }

  /* ---------- API helper ---------- */

  async function financeFetch(endpoint, options = {}) {
    const pin = localStorage.getItem("pin");
    const res = await fetch(API_BASE + endpoint, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "pin": pin,
      },
    });
    return res;
  }

  async function financeJson(endpoint, options = {}) {
    const res = await financeFetch(endpoint, options);
    if (res.status === 401 || res.status === 403) {
      const err = new Error("UNAUTHORIZED");
      err.status = res.status;
      throw err;
    }
    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch { /* ignore */ }
      const err = new Error("HTTP_" + res.status);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return res.json();
  }

  /* ---------- Header ---------- */

  function renderHeader() {
    if (!state.user) return;
    userRoleEl.textContent = state.user.role || "staff";
    userBranchEl.textContent = state.user.branch || "—";
  }

  /* ---------- Page date & status ---------- */

  function renderPageDate() {
    const dateSource =
      (state.account && (state.account.businessDate || state.account.date)) ||
      (state.summary && (state.summary.businessDate || state.summary.date)) ||
      null;
    pageDateEl.textContent = formatLongDate(dateSource);
  }

  function renderAccountStatus() {
    const closed =
      state.account &&
      (state.account.closed === true ||
        state.account.isClosed === true ||
        String(state.account.status || "").toLowerCase() === "closed");

    state.isClosed = !!closed;

    if (closed) {
      accountStatusEl.classList.remove("fin-status-open");
      accountStatusEl.classList.add("fin-status-closed");
      accountStatusText.textContent = "CLOSED";
      closedNotice.classList.remove("hidden");
      recordCard.classList.add("fin-disabled");
    } else {
      accountStatusEl.classList.add("fin-status-open");
      accountStatusEl.classList.remove("fin-status-closed");
      accountStatusText.textContent = "OPEN";
      closedNotice.classList.add("hidden");
      recordCard.classList.remove("fin-disabled");
    }

    /* Disable forms if closed */
    const disabled = closed;
    const allInputs = recordCard.querySelectorAll("input, select, button");
    allInputs.forEach((el) => {
      /* Do not disable the tab switcher buttons — but pointer-events prevents interaction */
      el.disabled = disabled;
    });
  }

  /* ---------- Summary cards ---------- */

 function pickSummaryNumbers() {
  const s = state.summary || {};
  const b = s.balances || {};

  const cash = formatNumber(b.sales && b.sales.cash);
  const momo = formatNumber(b.sales && b.sales.momo);
  const bank = formatNumber(b.sales && b.sales.bank);
  const total = formatNumber(
    b.totalSales != null ? b.totalSales : cash + momo + bank
  );

  return { cash, momo, bank, total };
}

  function renderSummaryCards() {
    const { cash, momo, bank, total } = pickSummaryNumbers();
    sumTotal.textContent = formatCurrency(total);
    sumCash.textContent = formatCurrency(cash);
    sumMomo.textContent = formatCurrency(momo);
    sumBank.textContent = formatCurrency(bank);
  }

  /* ---------- Products (inventory) ---------- */

    function renderProductPreview(product) {
    if (!product) {
        invProductPreview.classList.add("hidden");
        invPrice.value = "GHS 0.00";
        updateInventoryTotals();
        return;
    }

    pvBrand.textContent     = product.brand     || "—";
    pvModel.textContent     = product.model || product.name || "—";
    pvSerial.textContent    = product.serial || product.serialNumber || "—";
    pvProcessor.textContent = product.processor || "—";
    pvRam.textContent       = product.ram       || "—";
    pvStorage.textContent   = product.storage   || "—";

    const price = formatNumber(product.price);
    pvPrice.textContent  = formatCurrency(price);
    invPrice.value       = formatCurrency(price);

    invProductPreview.classList.remove("hidden");
    updateInventoryTotals();
    }

  /* ---------- Payment totals ---------- */

  function readInventoryPayments() {
    return {
      cash: formatNumber(invCash.value),
      momo: formatNumber(invMomo.value),
      bank: formatNumber(invBank.value),
    };
  }

  function readManualPayments() {
    return {
      cash: formatNumber(manCash.value),
      momo: formatNumber(manMomo.value),
      bank: formatNumber(manBank.value),
    };
  }

function updateInventoryTotals() {
  const p = readInventoryPayments();
  const totalPaid = p.cash + p.momo + p.bank;
  invTotalPaid.textContent = formatCurrency(totalPaid);

  const product = state.selectedProduct;
  const productPrice = product ? formatNumber(product.price) : 0;

  let hintText = "";
  let hintClass = "";
  let canSubmit = false;

  if (!product) {
    hintText = "Enter a serial number and search to load the product.";
  } else if (totalPaid === 0) {
    hintText =
      "Enter payment amounts. Cash + MoMo + Bank/POS must equal " +
      formatCurrency(productPrice) + ".";
  } else if (Math.abs(totalPaid - productPrice) < 0.005) {
    hintText = "Payment matches product price. Ready to record.";
    hintClass = "fin-hint-success";
    canSubmit = true;
  } else {
    hintText =
      "Payment total (" + formatCurrency(totalPaid) + ") must equal product price " +
      formatCurrency(productPrice) + ".";
    hintClass = "fin-hint-error";
  }

  invHint.textContent = hintText;
  invHint.className = "fin-pay-hint" + (hintClass ? " " + hintClass : "");
  invSubmitBtn.disabled = !canSubmit || state.isClosed;
}

  function updateManualTotals() {
    const p = readManualPayments();
    const totalPaid = p.cash + p.momo + p.bank;
    manTotalPaid.textContent = formatCurrency(totalPaid);

    const price = formatNumber(manPrice.value);
    const name = (manName.value || "").trim();

    let hintText = "";
    let hintClass = "";
    let canSubmit = false;

    if (!name) {
      hintText = "Enter a product name.";
    } else if (!price || price <= 0) {
      hintText = "Enter a price greater than zero.";
    } else if (totalPaid === 0) {
      hintText = "Enter payment amounts. Cash + MoMo + Bank/POS must equal " + formatCurrency(price) + ".";
    } else if (Math.abs(totalPaid - price) < 0.005) {
      hintText = "Payment matches price. Ready to record.";
      hintClass = "fin-hint-success";
      canSubmit = true;
    } else {
      hintText =
        "Payment total (" + formatCurrency(totalPaid) + ") must equal price " +
        formatCurrency(price) + ".";
      hintClass = "fin-hint-error";
    }

    manHint.textContent = hintText;
    manHint.className = "fin-pay-hint" + (hintClass ? " " + hintClass : "");
    manSubmitBtn.disabled = !canSubmit || state.isClosed;
  }

  /* ---------- Serial lookup ---------- */

function setSerialHint(text, kind) {
  invSerialHint.textContent = text || "";
  invSerialHint.className = "fin-serial-hint" + (kind ? " fin-hint-" + kind : "");
}

function clearSelectedProduct() {
  state.selectedProduct = null;
  renderProductPreview(null);
}

async function lookupProductBySerial(serial) {
  const trimmed = (serial || "").trim();
  if (!trimmed) {
    setSerialHint("Please enter a serial number.", "error");
    clearSelectedProduct();
    return;
  }

  const token = ++state.serialLookupToken;
  setSerialHint("Searching…", "loading");

  try {
    /* Adjust the query param name if your backend expects a different one.
       Common patterns: ?serial=, ?serialNumber=, ?q=  */
    const res = await financeFetch(
      "/products/serial/" + encodeURIComponent(trimmed)
    );

    /* If 404 → product not found / not available */
    if (res.status === 404) {
      if (token !== state.serialLookupToken) return;
      setSerialHint("No available product found with that serial number.", "error");
      clearSelectedProduct();
      return;
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error("UNAUTHORIZED");
    }

    if (!res.ok) {
      if (token !== state.serialLookupToken) return;
      setSerialHint("Unable to look up product. Please try again.", "error");
      clearSelectedProduct();
      return;
    }

    const data = await res.json();

    /* Out-of-order guard */
    if (token !== state.serialLookupToken) return;

    /* Accept either a single product or { product: {...} } */
    const product = data && data.product ? data.product : data;

    if (!product || (!product._id && !product.id)) {
      setSerialHint("No available product found with that serial number.", "error");
      clearSelectedProduct();
      return;
    }

    /* Reject if backend says it's already sold/out */
    const status = String(product.status || "").toLowerCase();
    if (status === "sold" || status === "out" || product.available === false) {
      setSerialHint("This product is no longer available.", "error");
      clearSelectedProduct();
      return;
    }

    state.selectedProduct = product;
    setSerialHint(
      "Matched: " + (product.name || product.model || "product"),
      "success"
    );
    renderProductPreview(product);
  } catch (err) {
    if (token !== state.serialLookupToken) return;
    if (err && err.message === "UNAUTHORIZED") {
      showToast("Your session has expired. Please log in again.", "error");
      localStorage.removeItem("pin");
      localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      return;
    }
    console.error("[Daily Sales] serial lookup error:", err);
    setSerialHint("Unable to look up product. Please try again.", "error");
    clearSelectedProduct();
  }
}

  /* ---------- Sales list ---------- */

  function pickSalesArray(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.sales)) return payload.sales;
    if (Array.isArray(payload.financialSales)) return payload.financialSales;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function deriveSalesFromAccount() {
    /* The backend may already provide today's sales inside the account object.
       We only use what exists; otherwise we return [] (empty state). */
    if (!state.account) return [];
    return (
      pickSalesArray(state.account.sales) ||
      pickSalesArray(state.account.financialSales) ||
      pickSalesArray(state.account.transactions) ||
      []
    );
  }

function saleTypeBadge(sale) {
  const source = String(sale.source || "").toLowerCase();
  if (source === "inventory") {
    return '<span class="fin-badge fin-badge-inventory">Inventory</span>';
  }
  if (source === "manual") {
    return '<span class="fin-badge fin-badge-manual">Manual</span>';
  }
  return '<span class="fin-badge fin-badge-manual">Sale</span>';
}

  function renderSalesList() {
    salesListWrap.innerHTML = "";

    const sales = state.sales || [];

    if (!sales.length) {
      const empty = document.createElement("div");
      empty.className = "fin-empty";
      empty.innerHTML =
        '<div class="fin-empty-icon">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
            '<path d="M3 10h18"/>' +
            '<path d="M8 15h4"/>' +
          "</svg>" +
        "</div>" +
        '<p class="fin-empty-title">No sales recorded today</p>' +
        '<p class="fin-empty-text">Sales recorded during the day will appear here.</p>';
      salesListWrap.appendChild(empty);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "fin-table-wrap";

    const table = document.createElement("table");
    table.className = "fin-table";

    table.innerHTML =
      "<thead>" +
        "<tr>" +
          "<th>Time</th>" +
          "<th>Product</th>" +
          "<th>Type</th>" +
          '<th class="fin-td-right">Price</th>' +
          '<th class="fin-td-right">Cash</th>' +
          '<th class="fin-td-right">MoMo</th>' +
          '<th class="fin-td-right">Bank/POS</th>' +
          '<th class="fin-td-right">Total</th>' +
        "</tr>" +
      "</thead>" +
      "<tbody></tbody>";

    const tbody = table.querySelector("tbody");

    sales.forEach((sale) => {
      const tr = document.createElement("tr");

      const time = formatTime(sale.date || sale.createdAt);

      const product =
        (sale.product && sale.product.name) ||
        "—";

      const price = formatNumber(sale.totalAmount);
      const cash  = formatNumber(sale.payment && sale.payment.cash);
      const momo  = formatNumber(sale.payment && sale.payment.momo);
      const bank  = formatNumber(sale.payment && sale.payment.bank);
      const total = cash + momo + bank;

      tr.innerHTML =
        '<td class="fin-td-time">' + escapeHtml(time) + "</td>" +
        '<td class="fin-td-strong">' + escapeHtml(product) + "</td>" +
        "<td>" + saleTypeBadge(sale) + "</td>" +
        '<td class="fin-td-right">' + formatCurrency(price) + "</td>" +
        '<td class="fin-td-right">' + formatCurrency(cash) + "</td>" +
        '<td class="fin-td-right">' + formatCurrency(momo) + "</td>" +
        '<td class="fin-td-right">' + formatCurrency(bank) + "</td>" +
        '<td class="fin-td-right fin-td-strong">' + formatCurrency(total) + "</td>";

      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    salesListWrap.appendChild(wrap);
  }

  /* ---------- Tab switch ---------- */

  function switchTab(tab) {
    state.currentTab = tab;
    if (tab === "inventory") {
      tabInventory.classList.add("fin-seg-active");
      tabInventory.setAttribute("aria-selected", "true");
      tabManual.classList.remove("fin-seg-active");
      tabManual.setAttribute("aria-selected", "false");
      inventoryForm.classList.remove("hidden");
      manualForm.classList.add("hidden");
    } else {
      tabManual.classList.add("fin-seg-active");
      tabManual.setAttribute("aria-selected", "true");
      tabInventory.classList.remove("fin-seg-active");
      tabInventory.setAttribute("aria-selected", "false");
      manualForm.classList.remove("hidden");
      inventoryForm.classList.add("hidden");
    }
  }

  /* ---------- Category toggle (manual) ---------- */

  function setCategory(cat) {
    state.saleCategory = cat;
    categoryBtns.forEach((btn) => {
      if (btn.dataset.category === cat) {
        btn.classList.add("fin-cat-active");
      } else {
        btn.classList.remove("fin-cat-active");
      }
    });

    /* Accessories hide serial + detail rows to reduce noise */
    if (cat === "accessory") {
      manSerialRow.classList.add("hidden");
      manDetailRow.classList.add("hidden");
    } else {
      manSerialRow.classList.remove("hidden");
      manDetailRow.classList.remove("hidden");
    }
  }

  /* ---------- Reset forms ---------- */

 function resetInventoryForm() {
  invSerial.value = "";
  invSerialHint.textContent = "";
  invSerialHint.className = "fin-serial-hint";
  clearSelectedProduct();
  invCash.value = "";
  invMomo.value = "";
  invBank.value = "";
  invHint.textContent = "";
  invHint.className = "fin-pay-hint";
  updateInventoryTotals();
}

  function resetManualForm() {
    manName.value = "";
    manSerial.value = "";
    manDetail.value = "";
    manPrice.value = "";
    manCash.value = "";
    manMomo.value = "";
    manBank.value = "";
    manHint.textContent = "";
    manHint.className = "fin-pay-hint";
    setCategory("device");
    updateManualTotals();
  }

  /* ---------- Loaders ---------- */

  async function loadAccount() {
    const data = await financeJson("/finance/account/today");
    state.account = data;
  }

  async function loadSummary() {
    const data = await financeJson("/finance/account/today/summary");
    state.summary = data;
  }


async function loadSalesFromExistingPayload() {
  try {
    /* We need today's dateKey — it's on the account object */
    const dateKey =
      (state.account && state.account.dateKey) ||
      (state.summary && state.summary.account && state.summary.account.dateKey);

    if (!dateKey) {
      state.sales = [];
      return;
    }

    const res = await financeFetch("/finance/history/" + dateKey);
    if (!res.ok) {
      /* Fall back to empty — do not break the page */
      state.sales = [];
      return;
    }

    const payload = await res.json();
    state.sales = Array.isArray(payload.sales) ? payload.sales : [];
  } catch (err) {
    console.error("[Daily Sales] sales fetch error:", err);
    state.sales = [];
  }
}

  /* ---------- Full refresh ---------- */
async function refreshAll() {
  try {
    await Promise.all([loadAccount(), loadSummary()]);
    await loadSalesFromExistingPayload();

    renderPageDate();
    renderAccountStatus();
    renderSummaryCards();
    renderSalesList();

    showContent();
  } catch (err) {
    handleLoadError(err);
  }
}

  function handleLoadError(err) {
    console.error("[Daily Sales] load error:", err);
    if (err && err.message === "UNAUTHORIZED") {
      showToast("Your session has expired. Please log in again.", "error", 4000);
      localStorage.removeItem("pin");
      localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      return;
    }
    if (err && String(err.message).startsWith("HTTP_")) {
      showError("Unable to load today's sales. The server returned an error.");
    } else {
      showError("Unable to load today's sales. Please check your connection and try again.");
    }
  }

  /* ---------- Submit handlers ---------- */

async function submitInventorySale(e) {
  e.preventDefault();
  if (state.isClosed) {
    showToast("Today's account is closed. Sales can no longer be recorded.", "error");
    return;
  }

  const product = state.selectedProduct;
  if (!product) {
    showToast("Please search and select an available product first.", "error");
    return;
  }

  const p = readInventoryPayments();
  const totalPaid = p.cash + p.momo + p.bank;
  const price = formatNumber(product.price);

  if (Math.abs(totalPaid - price) >= 0.005) {
    showToast("Payment amounts must equal the sale price.", "error");
    return;
  }

  const payload = {
    productId: product._id || product.id,
    cash: p.cash,
    momo: p.momo,
    bank: p.bank,
  };

  invSubmitBtn.disabled = true;
  invSubmitBtn.textContent = "Recording…";

  try {
    const res = await financeFetch("/finance/sales/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error("UNAUTHORIZED");
    }
    if (!res.ok) {
      let msg = "Unable to record sale.";
      try {
        const data = await res.json();
        if (data && (data.message || data.error)) msg = data.message || data.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    showToast("Sale successfully recorded.", "success");
    resetInventoryForm();
    await refreshAll();
  } catch (err) {
    console.error("[Daily Sales] inventory submit error:", err);
    if (err.message === "UNAUTHORIZED") {
      showToast("Your session has expired. Please log in again.", "error");
      localStorage.removeItem("pin");
      localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
    } else {
      showToast(err.message || "Unable to record sale.", "error");
    }
  } finally {
    invSubmitBtn.textContent = "Record Sale";
    updateInventoryTotals();
  }
}

  async function submitManualSale(e) {
    e.preventDefault();
    if (state.isClosed) {
      showToast("Today's account is closed. Sales can no longer be recorded.", "error");
      return;
    }
    const name = (manName.value || "").trim();
    const price = formatNumber(manPrice.value);
    if (!name) {
      showToast("Please enter a product name.", "error");
      return;
    }
    if (!price || price <= 0) {
      showToast("Please enter a valid price.", "error");
      return;
    }
    const p = readManualPayments();
    const totalPaid = p.cash + p.momo + p.bank;

    if (Math.abs(totalPaid - price) >= 0.005) {
      showToast("Payment amounts must equal the sale price.", "error");
      return;
    }

  const categoryMap = {
    device: "Device",
    accessory: "Accessory",
  };

  const payload = {
    category: categoryMap[state.saleCategory] || "Device",
    name: name,
    serial: (manSerial.value || "").trim(),
    detail: (manDetail.value || "").trim(),
    price: price,
    cash: p.cash,
    momo: p.momo,
    bank: p.bank,
  };

    manSubmitBtn.disabled = true;
    manSubmitBtn.textContent = "Recording…";

    try {
      const res = await financeFetch("/finance/sales/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("UNAUTHORIZED");
      }
      if (!res.ok) {
        let msg = "Unable to record sale.";
        try {
          const data = await res.json();
          if (data && (data.message || data.error)) msg = data.message || data.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      showToast("Sale successfully recorded.", "success");
      resetManualForm();
      await refreshAll();
    } catch (err) {
      console.error("[Daily Sales] manual submit error:", err);
      if (err.message === "UNAUTHORIZED") {
        showToast("Your session has expired. Please log in again.", "error");
        localStorage.removeItem("pin");
        localStorage.removeItem("user");
        setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      } else {
        showToast(err.message || "Unable to record sale.", "error");
      }
    } finally {
      manSubmitBtn.textContent = "Record Sale";
      updateManualTotals();
    }
  }

  /* ---------- Event wiring ---------- */

function wireEvents() {
  /* Tabs */
  tabInventory.addEventListener("click", () => switchTab("inventory"));
  tabManual.addEventListener("click", () => switchTab("manual"));

  /* Category toggles */
  categoryBtns.forEach((btn) => {
    btn.addEventListener("click", () => setCategory(btn.dataset.category));
  });

  /* Serial lookup — button click */
  invSerialLookupBtn.addEventListener("click", () => {
    if (state.isClosed) return;
    lookupProductBySerial(invSerial.value);
  });

  /* Serial lookup — Enter key */
  invSerial.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (state.isClosed) return;
      lookupProductBySerial(invSerial.value);
    }
  });

  /* Clear selected product if serial text changes */
  invSerial.addEventListener("input", () => {
    if (state.selectedProduct && invSerial.value.trim() !==
        (state.selectedProduct.serial || state.selectedProduct.serialNumber || "")) {
      clearSelectedProduct();
      setSerialHint("", "");
    }
  });

  /* Inventory payment inputs */
  [invCash, invMomo, invBank].forEach((el) => {
    el.addEventListener("input", updateInventoryTotals);
  });

  /* Manual payment + price inputs */
  [manCash, manMomo, manBank, manPrice, manName].forEach((el) => {
    el.addEventListener("input", updateManualTotals);
  });

  /* Form submits */
  inventoryForm.addEventListener("submit", submitInventorySale);
  manualForm.addEventListener("submit", submitManualSale);

  /* Retry */
  retryBtn.addEventListener("click", () => {
    showLoading();
    refreshAll();
  });
}

  /* ---------- Init ---------- */

  async function init() {
    const auth = ensureAuth();
    if (!auth) return;

    renderHeader();
    wireEvents();
    showLoading();
    await refreshAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();