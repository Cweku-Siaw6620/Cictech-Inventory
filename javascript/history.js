/* ============================================================
   FILE 3: Finance/history.js
   CICTech Electronics — Finance Module
   History page behavior (vanilla JS)
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Constants ---------- */
  const API_BASE = "http://localhost:3000";
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
  const pageBranchEl = $("pageBranch");

  const datePicker = $("datePicker");
  const dateReadable = $("dateReadable");
  const prevDayBtn = $("prevDayBtn");
  const nextDayBtn = $("nextDayBtn");

  const emptyHistory = $("emptyHistory");
  const historyContent = $("historyContent");

  /* Account summary */
  const accountStatusEl = $("accountStatus");
  const accountStatusText = accountStatusEl
    ? accountStatusEl.querySelector(".fin-status-text")
    : null;

  const metaDate = $("metaDate");
  const metaBranch = $("metaBranch");

  /* Opening */
  const opCash = $("opCash");
  const opMomo = $("opMomo");
  const opBank = $("opBank");
  const opTotal = $("opTotal");

  /* Sales summary */
  const saCash = $("saCash");
  const saMomo = $("saMomo");
  const saBank = $("saBank");
  const saTotal = $("saTotal");

  /* Expenses summary */
  const exCash = $("exCash");
  const exMomo = $("exMomo");
  const exBank = $("exBank");
  const exTotal = $("exTotal");

  /* Available */
  const avCash = $("avCash");
  const avMomo = $("avMomo");
  const avBank = $("avBank");
  const avTotal = $("avTotal");

  /* Tables */
  const salesListWrap = $("salesListWrap");
  const expensesListWrap = $("expensesListWrap");

  /* Toast */
  const toastContainer = $("toastContainer");

  /* ---------- Local state ---------- */
  const state = {
    user: null,
    pin: null,
    selectedDate: null,   /* "YYYY-MM-DD" */
    account: null,
    balances: null,
    sales: [],
    expenses: [],
  };

  /* ---------- Date helpers ---------- */

  /**
   * Return today's date in Africa/Accra as "YYYY-MM-DD".
   * Uses en-CA formatting (which is YYYY-MM-DD) with the Accra time zone,
   * matching the backend's getFinanceDateKey() helper.
   */
  function getTodayKeyAccra() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Accra",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function isValidDateKey(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(key);
  }

  function shiftDateKey(dateKey, deltaDays) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return dt.toISOString().slice(0, 10);
  }

  function formatReadableDate(dateKey) {
    if (!isValidDateKey(dateKey)) return "—";
    const [y, m, d] = dateKey.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  /* ---------- Currency / number helpers ---------- */

  function formatCurrencyCedi(value) {
    if (value === null || value === undefined || isNaN(value)) return "GH₵ 0.00";
    const num = Number(value);
    return (
      "GH₵ " +
      num.toLocaleString("en-GH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function num(value) {
    if (value === null || value === undefined) return 0;
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

  /* ---------- API ---------- */

  async function financeFetch(endpoint, options = {}) {
    const pin = localStorage.getItem("pin");
    return fetch(API_BASE + endpoint, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "pin": pin,
      },
    });
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
    pageBranchEl.textContent = "Branch: " + (state.user.branch || "—");
  }

  /* ---------- Date controls ---------- */

  function syncDateControls() {
    if (!state.selectedDate) return;

    datePicker.value = state.selectedDate;
    dateReadable.textContent = formatReadableDate(state.selectedDate);

    const todayKey = getTodayKeyAccra();
    nextDayBtn.disabled = state.selectedDate >= todayKey;

    /* Cap the picker at today — no future dates */
    datePicker.max = todayKey;
  }

  function setSelectedDate(dateKey) {
    if (!isValidDateKey(dateKey)) return;
    const todayKey = getTodayKeyAccra();
    /* Never go into the future */
    state.selectedDate = dateKey > todayKey ? todayKey : dateKey;
    syncDateControls();
  }

  /* ---------- Rendering ---------- */

  function renderAccountStatus(account) {
    const closed =
      account &&
      (account.closed === true ||
        account.isClosed === true ||
        String(account.status || "").toLowerCase() === "closed");

    if (closed) {
      accountStatusEl.classList.remove("fin-status-open");
      accountStatusEl.classList.add("fin-status-closed");
      if (accountStatusText) accountStatusText.textContent = "CLOSED";
    } else {
      accountStatusEl.classList.add("fin-status-open");
      accountStatusEl.classList.remove("fin-status-closed");
      if (accountStatusText) accountStatusText.textContent = "OPEN";
    }
  }

  function renderSummary() {
    const b = state.balances || {};
    const opening = b.opening || (state.account && state.account.opening) || {};
    const sales = b.sales || {};
    const expenses = b.expenses || {};
    const available = b.available || {};

    /* Opening */
    const opC = num(opening.cash);
    const opM = num(opening.momo);
    const opB = num(opening.bank);

    opCash.textContent = formatCurrencyCedi(opC);
    opMomo.textContent = formatCurrencyCedi(opM);
    opBank.textContent = formatCurrencyCedi(opB);
    opTotal.textContent = formatCurrencyCedi(opC + opM + opB);

    /* Sales */
    const saC = num(sales.cash);
    const saM = num(sales.momo);
    const saB = num(sales.bank);
    const saT = b.totalSales != null ? num(b.totalSales) : saC + saM + saB;

    saCash.textContent = formatCurrencyCedi(saC);
    saMomo.textContent = formatCurrencyCedi(saM);
    saBank.textContent = formatCurrencyCedi(saB);
    saTotal.textContent = formatCurrencyCedi(saT);

    /* Expenses */
    const exC = num(expenses.cash);
    const exM = num(expenses.momo);
    const exB = num(expenses.bank);
    const exT = b.totalExpenses != null ? num(b.totalExpenses) : exC + exM + exB;

    exCash.textContent = formatCurrencyCedi(exC);
    exMomo.textContent = formatCurrencyCedi(exM);
    exBank.textContent = formatCurrencyCedi(exB);
    exTotal.textContent = formatCurrencyCedi(exT);

    /* Available */
    const avC = num(available.cash);
    const avM = num(available.momo);
    const avB = num(available.bank);
    const avT = b.totalAvailable != null ? num(b.totalAvailable) : avC + avM + avB;

    avCash.textContent = formatCurrencyCedi(avC);
    avMomo.textContent = formatCurrencyCedi(avM);
    avBank.textContent = formatCurrencyCedi(avB);
    avTotal.textContent = formatCurrencyCedi(avT);
  }

  function saleSourceBadge(sale) {
    const source = String(sale.source || "").toLowerCase();
    if (source === "inventory") {
      return '<span class="fin-badge fin-badge-inventory">Inventory</span>';
    }
    if (source === "manual") {
      return '<span class="fin-badge fin-badge-manual">Manual</span>';
    }
    return '<span class="fin-badge fin-badge-manual">Sale</span>';
  }

  function paymentMethodBadge(method) {
    const m = String(method || "").toLowerCase();
    if (m === "cash") return '<span class="fin-badge fin-badge-cash">Cash</span>';
    if (m === "momo") return '<span class="fin-badge fin-badge-momo">MoMo</span>';
    if (m === "bank" || m === "bank/pos" || m === "bankpos" || m === "pos") {
      return '<span class="fin-badge fin-badge-bank">Bank/POS</span>';
    }
    return '<span class="fin-badge fin-badge-bank">' + escapeHtml(method || "—") + "</span>";
  }

  function renderSalesTable() {
    salesListWrap.innerHTML = "";
    const sales = state.sales || [];

    if (!sales.length) {
      const empty = document.createElement("div");
      empty.className = "fin-empty";
      empty.innerHTML =
        '<div class="fin-empty-icon">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
            '<path d="M3 10h18"/>' +
          "</svg>" +
        "</div>" +
        '<p class="fin-empty-title">No sales recorded</p>' +
        '<p class="fin-empty-text">No sales were recorded for this day.</p>';
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

      const productName =
        (sale.product && sale.product.name) ||
        (sale.productName) ||
        "—";

      const price = num(sale.totalAmount);
      const cash  = num(sale.payment && sale.payment.cash);
      const momo  = num(sale.payment && sale.payment.momo);
      const bank  = num(sale.payment && sale.payment.bank);
      const total = cash + momo + bank;

      tr.innerHTML =
        '<td class="fin-td-time">' + escapeHtml(time) + "</td>" +
        '<td class="fin-td-strong">' + escapeHtml(productName) + "</td>" +
        "<td>" + saleSourceBadge(sale) + "</td>" +
        '<td class="fin-td-right">' + formatCurrencyCedi(price) + "</td>" +
        '<td class="fin-td-right">' + formatCurrencyCedi(cash) + "</td>" +
        '<td class="fin-td-right">' + formatCurrencyCedi(momo) + "</td>" +
        '<td class="fin-td-right">' + formatCurrencyCedi(bank) + "</td>" +
        '<td class="fin-td-right fin-td-strong">' + formatCurrencyCedi(total) + "</td>";

      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    salesListWrap.appendChild(wrap);
  }

  function renderExpensesTable() {
    expensesListWrap.innerHTML = "";
    const expenses = state.expenses || [];

    if (!expenses.length) {
      const empty = document.createElement("div");
      empty.className = "fin-empty";
      empty.innerHTML =
        '<div class="fin-empty-icon">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M4 4h16v16H4z"/>' +
            '<path d="M8 9h8"/>' +
            '<path d="M8 13h5"/>' +
          "</svg>" +
        "</div>" +
        '<p class="fin-empty-title">No expenses recorded</p>' +
        '<p class="fin-empty-text">No expenses were recorded for this day.</p>';
      expensesListWrap.appendChild(empty);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "fin-table-wrap";

    const table = document.createElement("table");
    table.className = "fin-table";
    table.style.minWidth = "520px";
    table.innerHTML =
      "<thead>" +
        "<tr>" +
          "<th>Time</th>" +
          "<th>Description</th>" +
          "<th>Payment Method</th>" +
          '<th class="fin-td-right">Amount</th>' +
        "</tr>" +
      "</thead>" +
      "<tbody></tbody>";

    const tbody = table.querySelector("tbody");

    expenses.forEach((exp) => {
      const tr = document.createElement("tr");
      const time = formatTime(exp.date || exp.createdAt);
      const description = exp.description || "—";
      const method = exp.paymentMethod || "—";
      const amount = num(exp.amount);

      tr.innerHTML =
        '<td class="fin-td-time">' + escapeHtml(time) + "</td>" +
        '<td class="fin-td-strong">' + escapeHtml(description) + "</td>" +
        "<td>" + paymentMethodBadge(method) + "</td>" +
        '<td class="fin-td-right fin-td-strong">' + formatCurrencyCedi(amount) + "</td>";

      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    expensesListWrap.appendChild(wrap);
  }

  function renderEmptyHistory() {
    emptyHistory.classList.remove("hidden");
    historyContent.classList.add("hidden");
  }

  function renderLoadedHistory() {
    emptyHistory.classList.add("hidden");
    historyContent.classList.remove("hidden");
  }

  /* ---------- Data loading ---------- */

  async function loadAccountForDate(dateKey) {
    /* GET /finance/account/:date — historical account for the staff's branch */
    const res = await financeFetch("/finance/account/" + dateKey);
    if (res.status === 401 || res.status === 403) {
      const e = new Error("UNAUTHORIZED"); e.status = res.status; throw e;
    }
    if (res.status === 404) {
      const e = new Error("NOT_FOUND"); e.status = 404; throw e;
    }
    if (!res.ok) {
      const e = new Error("HTTP_" + res.status); e.status = res.status; throw e;
    }
    return res.json();
  }

  async function loadHistoryDetail(dateKey) {
    /* GET /finance/history/:date — full detail with sales, expenses, balances */
    const res = await financeFetch("/finance/history/" + dateKey);
    if (res.status === 401 || res.status === 403) {
      const e = new Error("UNAUTHORIZED"); e.status = res.status; throw e;
    }
    if (res.status === 404) {
      const e = new Error("NOT_FOUND"); e.status = 404; throw e;
    }
    if (!res.ok) {
      const e = new Error("HTTP_" + res.status); e.status = res.status; throw e;
    }
    return res.json();
  }

  async function loadHistoryForDate(dateKey) {
    /* Reset current view */
    state.account = null;
    state.balances = null;
    state.sales = [];
    state.expenses = [];

    try {
      /* Primary detail endpoint — returns { account, balances, sales, expenses } */
      const detail = await loadHistoryDetail(dateKey);

      state.account = detail.account || null;
      state.balances = detail.balances || null;
      state.sales = Array.isArray(detail.sales) ? detail.sales : [];
      state.expenses = Array.isArray(detail.expenses) ? detail.expenses : [];

      if (!state.account) {
        renderEmptyHistory();
        return;
      }

      metaDate.textContent = formatReadableDate(
        state.account.dateKey || dateKey
      );
      metaBranch.textContent = state.account.branch || "—";

      renderAccountStatus(state.account);
      renderSummary();
      renderSalesTable();
      renderExpensesTable();
      renderLoadedHistory();
    } catch (err) {
      if (err && err.status === 404) {
        /* Fall back to /finance/account/:date to distinguish account missing */
        try {
          const account = await loadAccountForDate(dateKey);
          state.account = account;
          state.balances = null;
          state.sales = [];
          state.expenses = [];

          metaDate.textContent = formatReadableDate(
            account.dateKey || dateKey
          );
          metaBranch.textContent = account.branch || "—";
          renderAccountStatus(account);
          renderSummary();
          renderSalesTable();
          renderExpensesTable();
          renderLoadedHistory();
          return;
        } catch (inner) {
          if (inner && inner.status === 404) {
            renderEmptyHistory();
            return;
          }
          throw inner;
        }
      }
      throw err;
    }
  }

  /* ---------- Navigation ---------- */

  function goToPreviousDay() {
    const prev = shiftDateKey(state.selectedDate, -1);
    setSelectedDate(prev);
    loadAndRender();
  }

  function goToNextDay() {
    const todayKey = getTodayKeyAccra();
    if (state.selectedDate >= todayKey) return;
    const next = shiftDateKey(state.selectedDate, 1);
    setSelectedDate(next);
    loadAndRender();
  }

  function onDatePickerChange() {
    const val = datePicker.value;
    if (!isValidDateKey(val)) return;
    setSelectedDate(val);
    loadAndRender();
  }

  /* ---------- Load & render ---------- */

  async function loadAndRender() {
    showLoading();
    try {
      await loadHistoryForDate(state.selectedDate);
      showContent();
    } catch (err) {
      handleLoadError(err);
    }
  }

  function handleLoadError(err) {
    console.error("[History] load error:", err);
    if (err && err.message === "UNAUTHORIZED") {
      showToast("Your session has expired. Please log in again.", "error", 4000);
      localStorage.removeItem("pin");
      localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      return;
    }
    if (err && String(err.message).startsWith("HTTP_")) {
      showError("Unable to load the finance history. The server returned an error.");
    } else {
      showError("Unable to load the finance history. Please try again.");
    }
  }

  /* ---------- Event wiring ---------- */

  function wireEvents() {
    prevDayBtn.addEventListener("click", goToPreviousDay);
    nextDayBtn.addEventListener("click", goToNextDay);
    datePicker.addEventListener("change", onDatePickerChange);

    retryBtn.addEventListener("click", () => {
      loadAndRender();
    });
  }

  /* ---------- Init ---------- */

  function init() {
    const auth = ensureAuth();
    if (!auth) return;

    renderHeader();
    wireEvents();

    /* Default to today (Accra business date) */
    state.selectedDate = getTodayKeyAccra();
    syncDateControls();
    loadAndRender();
  }

  document.addEventListener("DOMContentLoaded", init);
})();