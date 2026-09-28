/* ============================================================
   adminDashboard.js
   CICTech Electronics — Finance Admin Dashboard
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Constants ---------- */
  const API_BASE = "https://cictech-inventory-2se4.vercel.app";
  const LOGIN_REDIRECT = "../index.html";
  const STAFF_REDIRECT = "staffDashboard.html";

  const FINANCE_BRANCHES = ["Central", "Amanfrom", "East-Legon"];

  /* ---------- DOM helpers ---------- */
  const $ = (id) => document.getElementById(id);

  /* Top-level state */
  const loadingState = $("loadingState");
  const errorState = $("errorState");
  const errorMessage = $("errorMessage");
  const retryBtn = $("retryBtn");

  const viewDashboard = $("viewDashboard");
  const viewBranch = $("viewBranch");

  const userRoleEl = $("userRole");
  const userBranchEl = $("userBranch");

  /* Dashboard */
  const dashboardSubtitle = $("dashboardSubtitle");
  const grandDate = $("grandDate");
  const gtSales = $("gtSales");
  const gtExpenses = $("gtExpenses");
  const gtAvailable = $("gtAvailable");
  const gtMomo = $("gtMomo");
  const gtBank = $("gtBank");
  const branchCards = $("branchCards");

  /* Branch view */
  const branchTitle = $("branchTitle");
  const branchSubtitle = $("branchSubtitle");
  const branchActions = $("branchActions");

  const subtabToday = $("subtabToday");
  const subtabHistory = $("subtabHistory");
  const subToday = $("subToday");
  const subHistory = $("subHistory");

  /* History range filter */
  const histStart = $("histStart");
  const histEnd = $("histEnd");
  const histDate = $("histDate");
  const histApplyBtn = $("histApplyBtn");
  const histClearBtn = $("histClearBtn");
  const historyListWrap = $("historyListWrap");
  const historyDetailWrap = $("historyDetailWrap");

  const toastContainer = $("toastContainer");

  /* ---------- State ---------- */
  const state = {
    user: null,
    pin: null,
    view: {
      section: "dashboard",   // "dashboard" | "branch"
      branch: null,           // "Central" | "Amanfrom" | "East-Legon"
      tab: "today",           // "today" | "history"
      selectedDate: null,     // for history drill-down
    },
    /* Cached data */
    allHistory: [],           // from GET /finance/admin/history
    branchTodayData: null,    // from GET /finance/admin/history/:branch/:date (today)
    branchHistory: [],        // filtered list for current branch
    currentDetail: null,      // from GET /finance/admin/history/:branch/:date
  };

  /* ---------- Date utilities ---------- */

  function todayKeyAccra() {
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

  function formatReadableDate(key) {
    if (!isValidDateKey(key)) return "—";
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
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

  /* ---------- Currency / number helpers ---------- */

  function formatCedi(value) {
    if (value === null || value === undefined || isNaN(value)) return "GH₵ 0.00";
    const n = Number(value);
    return "GH₵ " + n.toLocaleString("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function num(v) {
    if (v === null || v === undefined) return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
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
    const t = document.createElement("div");
    t.className = "adm-toast adm-toast-" + type;
    const icon = { success: "✓", error: "✕", info: "ℹ" }[type] || "ℹ";
    t.innerHTML =
      '<span class="adm-toast-icon">' + icon + "</span>" +
      '<span class="adm-toast-msg">' + escapeHtml(message) + "</span>";
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(-6px)";
      t.style.transition = "opacity 0.2s, transform 0.2s";
      setTimeout(() => t.remove(), 220);
    }, duration);
  }

  /* ---------- UI state ---------- */

  function showLoading() {
    loadingState.classList.remove("hidden");
    errorState.classList.add("hidden");
    viewDashboard.classList.add("hidden");
    viewBranch.classList.add("hidden");
  }

  function showError(msg) {
    loadingState.classList.add("hidden");
    errorMessage.textContent = msg;
    errorState.classList.remove("hidden");
    viewDashboard.classList.add("hidden");
    viewBranch.classList.add("hidden");
  }

  function showDashboardView() {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
    viewBranch.classList.add("hidden");
    viewDashboard.classList.remove("hidden");
  }

  function showBranchView() {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
    viewDashboard.classList.add("hidden");
    viewBranch.classList.remove("hidden");
  }

  /* ---------- Auth ---------- */

  function getStoredAuth() {
    const pin = localStorage.getItem("pin");
    const raw = localStorage.getItem("user");
    if (!pin || !raw) return null;
    try {
      const user = JSON.parse(raw);
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
    if (auth.user.role === "staff") {
      window.location.href = STAFF_REDIRECT;
      return null;
    }
    if (auth.user.role !== "admin") {
      window.location.href = LOGIN_REDIRECT;
      return null;
    }
    state.user = auth.user;
    state.pin = auth.pin;
    return auth;
  }

  function renderHeader() {
    if (!state.user) return;
    userRoleEl.textContent = state.user.role || "admin";
    userBranchEl.textContent = state.user.branch || "Admin";
  }

  /* ---------- API helper ---------- */

  async function financeFetch(endpoint, options = {}) {
    const pin = localStorage.getItem("pin");
    return fetch(API_BASE + endpoint, {
      ...options,
      headers: {
        ...(options.headers || {}),
        pin: pin,
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

  /* ---------- Derived helpers ---------- */

  function extractDateKeyFromAccount(account) {
    return (
      (account && account.dateKey) ||
      (account && account.date) ||
      null
    );
  }

  function statusOfAccount(account) {
    if (!account) return "none";
    if (String(account.status || "").toLowerCase() === "closed") {
      return account.approvedBy ? "approved" : "closed";
    }
    return "open";
  }

  function statusPill(kind) {
    const map = {
      open:     { text: "OPEN",     cls: "adm-status-open" },
      closed:   { text: "CLOSED",   cls: "adm-status-closed" },
      approved: { text: "APPROVED", cls: "adm-status-approved" },
      none:     { text: "NO ACCOUNT", cls: "adm-status-none" },
    };
    const m = map[kind] || map.none;
    return (
      '<span class="adm-status ' + m.cls + '">' +
        '<span class="adm-status-dot"></span>' +
        '<span>' + m.text + "</span>" +
      "</span>"
    );
  }

  function pickBalances(payload) {
    return (payload && payload.balances) || {};
  }

  /* ---------- Sidebar wiring ---------- */

  function setActiveSidebar(section, branch) {
    document.querySelectorAll(".adm-side-item").forEach((btn) => {
      const btnSection = btn.dataset.section;
      const btnBranch = btn.dataset.branch || "";
      if (btnSection === section && btnBranch === (branch || "")) {
        btn.classList.add("adm-side-active");
      } else {
        btn.classList.remove("adm-side-active");
      }
    });
  }

  function wireSidebar() {
    document.querySelectorAll(".adm-side-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.dataset.section;
        const branch = btn.dataset.branch || null;
        if (section === "dashboard") {
          state.view.section = "dashboard";
          state.view.branch = null;
          state.view.tab = "today";
          setActiveSidebar("dashboard", "");
          renderDashboard();
        } else if (section === "branch" && branch) {
          state.view.section = "branch";
          state.view.branch = branch;
          state.view.tab = "today";
          state.view.selectedDate = null;
          setActiveSidebar("branch", branch);
          renderBranch();
        }
      });
    });
  }

  /* ---------- Data loaders ---------- */

  async function loadAllHistory(filters = {}) {
    const qp = new URLSearchParams();
    if (filters.branch) qp.set("branch", filters.branch);
    if (filters.startDate) qp.set("startDate", filters.startDate);
    if (filters.endDate) qp.set("endDate", filters.endDate);
    const qs = qp.toString();
    const payload = await financeJson("/finance/admin/history" + (qs ? "?" + qs : ""));
    return Array.isArray(payload.history) ? payload.history : [];
  }

  async function loadBranchDateDetail(branch, dateKey) {
    return financeJson("/finance/admin/history/" + encodeURIComponent(branch) + "/" + dateKey);
  }

  async function loadBranchToday(branch) {
    const today = todayKeyAccra();
    try {
      return await loadBranchDateDetail(branch, today);
    } catch (err) {
      if (err && err.status === 404) return null;
      throw err;
    }
  }

  /* ---------- Dashboard ---------- */

  async function renderDashboard() {
    showLoading();
    try {
      const history = await loadAllHistory();
      state.allHistory = history;

      const today = todayKeyAccra();

      /* Aggregate totals for today across all branches */
      const totals = {
        sales: 0, expenses: 0, available: 0,
        momo: 0, bank: 0,
      };
      const perBranch = {}; // branchName -> { totals, status, account }

      FINANCE_BRANCHES.forEach((b) => {
        perBranch[b] = {
          status: "none",
          totals: { sales: 0, expenses: 0, available: 0 },
          account: null,
        };
      });

      history.forEach((entry) => {
        const acc = entry.account || {};
        if (acc.dateKey !== today) return;
        const b = acc.branch;
        if (!FINANCE_BRANCHES.includes(b)) return;

        const t = entry.totals || {};
        const s = num(t.sales);
        const e = num(t.expenses);
        const a = num(t.available);

        totals.sales += s;
        totals.expenses += e;
        totals.available += a;

        perBranch[b].status = statusOfAccount(acc);
        perBranch[b].totals = { sales: s, expenses: e, available: a };
        perBranch[b].account = acc;
      });

      /* Available balance method split is not returned by /finance/admin/history.
         We display the combined available only; per-method totals are omitted
         unless the backend provides them, which it currently does not for the
         admin list endpoint. */
      gtSales.textContent = formatCedi(totals.sales);
      gtExpenses.textContent = formatCedi(totals.expenses);
      gtAvailable.textContent = formatCedi(totals.available);

      /* Per-method split is not available from this endpoint — show dashes */
      gtMomo.textContent = "—";
      gtBank.textContent = "—";

      grandDate.textContent = formatReadableDate(today);
      dashboardSubtitle.textContent = "Business date · " + formatReadableDate(today);

      /* Branch cards */
      branchCards.innerHTML = "";
      FINANCE_BRANCHES.forEach((b) => {
        const info = perBranch[b];
        const card = document.createElement("div");
        card.className = "adm-branch-card";

        const statusKind = info.status;

        card.innerHTML =
          '<div class="adm-branch-card-head">' +
            '<span class="adm-branch-card-name">' + escapeHtml(b) + "</span>" +
            statusPill(statusKind) +
          "</div>" +
          '<div class="adm-branch-card-body">' +
            '<div class="adm-branch-card-row">' +
              '<span class="adm-branch-card-label">Sales</span>' +
              '<span class="adm-branch-card-value">' + formatCedi(info.totals.sales) + "</span>" +
            "</div>" +
            '<div class="adm-branch-card-row">' +
              '<span class="adm-branch-card-label">Expenses</span>' +
              '<span class="adm-branch-card-value">' + formatCedi(info.totals.expenses) + "</span>" +
            "</div>" +
            '<div class="adm-branch-card-row">' +
              '<span class="adm-branch-card-label">Available</span>' +
              '<span class="adm-branch-card-value accent">' + formatCedi(info.totals.available) + "</span>" +
            "</div>" +
          "</div>" +
          '<div class="adm-branch-card-footer">' +
            '<button type="button" class="adm-btn adm-btn-secondary" data-open-branch="' +
              escapeHtml(b) +
            '">View Branch →</button>' +
          "</div>";

        branchCards.appendChild(card);
      });

      /* Wire card buttons */
      branchCards.querySelectorAll("[data-open-branch]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const b = btn.dataset.openBranch;
          state.view.section = "branch";
          state.view.branch = b;
          state.view.tab = "today";
          state.view.selectedDate = null;
          setActiveSidebar("branch", b);
          renderBranch();
        });
      });

      showDashboardView();
    } catch (err) {
      handleLoadError(err, "Unable to load the finance dashboard.");
    }
  }

  /* ---------- Branch view ---------- */

  function setBranchTab(tab) {
    state.view.tab = tab;
    if (tab === "today") {
      subtabToday.classList.add("adm-subtab-active");
      subtabHistory.classList.remove("adm-subtab-active");
      subToday.classList.remove("hidden");
      subHistory.classList.add("hidden");
    } else {
      subtabHistory.classList.add("adm-subtab-active");
      subtabToday.classList.remove("adm-subtab-active");
      subHistory.classList.remove("hidden");
      subToday.classList.add("hidden");
    }
  }

  function wireBranchSubtabs() {
    subtabToday.addEventListener("click", () => {
      setBranchTab("today");
      renderBranch();
    });
    subtabHistory.addEventListener("click", () => {
      setBranchTab("history");
      renderHistoryList();
    });
  }

  async function renderBranch() {
    if (!state.view.branch) {
      state.view.section = "dashboard";
      setActiveSidebar("dashboard", "");
      renderDashboard();
      return;
    }

    const branch = state.view.branch;
    branchTitle.textContent = branch;
    branchSubtitle.textContent = "Today · " + formatReadableDate(todayKeyAccra());

    /* Refresh today's data for this branch */
    showLoading();
    try {
      const today = todayKeyAccra();
      const detail = await loadBranchDateDetail(branch, today);
      state.branchTodayData = detail;
    } catch (err) {
      if (err && err.status === 404) {
        state.branchTodayData = null;
      } else {
        handleLoadError(err, "Unable to load this branch.");
        return;
      }
    }

    setBranchTab(state.view.tab || "today");
    renderBranchActions();
    renderTodayContent();
    if (state.view.tab === "history") {
      renderHistoryList();
    }
    showBranchView();
  }

  function renderBranchActions() {
    branchActions.innerHTML = "";
    const account = state.branchTodayData && state.branchTodayData.account;
    const kind = statusOfAccount(account);
    const branch = state.view.branch;
    const today = todayKeyAccra();

    if (kind === "none") return;

    if (kind === "open") {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "adm-btn adm-btn-danger";
      closeBtn.textContent = "Close Today's Account";
      closeBtn.addEventListener("click", () => closeAccount(branch, today));
      branchActions.appendChild(closeBtn);
      return;
    }

    if (kind === "closed") {
      const approveBtn = document.createElement("button");
      approveBtn.type = "button";
      approveBtn.className = "adm-btn adm-btn-success";
      approveBtn.textContent = "Approve Account";
      approveBtn.addEventListener("click", () => approveAccount(branch, today));
      branchActions.appendChild(approveBtn);
    }

    if (kind === "closed" || kind === "approved") {
      const reopenBtn = document.createElement("button");
      reopenBtn.type = "button";
      reopenBtn.className = "adm-btn adm-btn-secondary";
      reopenBtn.textContent = "Reopen Account";
      reopenBtn.addEventListener("click", () => reopenAccount(branch, today));
      branchActions.appendChild(reopenBtn);
    }
  }

  function renderTodayContent() {
    subToday.innerHTML = "";
    const branch = state.view.branch;
    const today = todayKeyAccra();
    const detail = state.branchTodayData;

    if (!detail || !detail.account) {
      subToday.innerHTML =
        '<div class="adm-card adm-empty">' +
          '<div class="adm-empty-icon">' +
            '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
              '<path d="M3 10h18"/>' +
            "</svg>" +
          "</div>" +
          '<p class="adm-empty-title">No account opened today</p>' +
          '<p class="adm-empty-text">' +
            escapeHtml(branch) +
            " has not opened a financial account for " +
            escapeHtml(formatReadableDate(today)) +
            " yet." +
          "</p>" +
        "</div>";
      return;
    }

    const account = detail.account;
    const balances = pickBalances(detail);
    const statusKind = statusOfAccount(account);

    /* Summary card */
    const summary = document.createElement("div");
    summary.className = "adm-card";
    summary.innerHTML =
      '<div class="adm-grand-total-head" style="margin-bottom:18px">' +
        '<h2 class="adm-card-title">Daily Account Summary</h2>' +
        statusPill(statusKind) +
      "</div>" +

      /* Opening */
      '<div class="adm-summary-block">' +
        '<h3 class="adm-summary-block-title">Opening Balance</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.opening && balances.opening.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.opening && balances.opening.bank)) + "</span></div>" +
          '<div class="adm-summary-cell adm-summary-cell-total"><span class="adm-summary-cell-label">Total Opening</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(
              num(balances.opening && balances.opening.momo) +
              num(balances.opening && balances.opening.bank)
            ) + "</span></div>" +
        "</div>" +
      "</div>" +

      /* Sales */
      '<div class="adm-summary-block">' +
        '<h3 class="adm-summary-block-title">Sales</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.sales && balances.sales.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.sales && balances.sales.bank)) + "</span></div>" +
          '<div class="adm-summary-cell adm-summary-cell-total"><span class="adm-summary-cell-label">Total Sales</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.totalSales)) + "</span></div>" +
        "</div>" +
      "</div>" +

      /* Expenses */
      '<div class="adm-summary-block">' +
        '<h3 class="adm-summary-block-title">Expenses</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.expenses && balances.expenses.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.expenses && balances.expenses.bank)) + "</span></div>" +
          '<div class="adm-summary-cell adm-summary-cell-total"><span class="adm-summary-cell-label">Total Expenses</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.totalExpenses)) + "</span></div>" +
        "</div>" +
      "</div>" +

      /* Available */
      '<div class="adm-summary-block adm-summary-block-available">' +
        '<h3 class="adm-summary-block-title">Available Balance</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.available && balances.available.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.available && balances.available.bank)) + "</span></div>" +
          '<div class="adm-summary-cell adm-summary-cell-total"><span class="adm-summary-cell-label">Total Available</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.totalAvailable)) + "</span></div>" +
        "</div>" +
      "</div>";

    subToday.appendChild(summary);

    /* Sales table */
    const salesCard = document.createElement("div");
    salesCard.className = "adm-card";
    salesCard.innerHTML =
      '<div class="adm-card-head" style="margin-bottom:14px">' +
        '<h2 class="adm-card-title">Sales</h2>' +
      "</div>" +
      '<div id="todaySalesTable"></div>';
    subToday.appendChild(salesCard);

    /* Expenses table */
    const expCard = document.createElement("div");
    expCard.className = "adm-card";
    expCard.innerHTML =
      '<div class="adm-card-head" style="margin-bottom:14px">' +
        '<h2 class="adm-card-title">Expenses</h2>' +
      "</div>" +
      '<div id="todayExpensesTable"></div>';
    subToday.appendChild(expCard);

    /* Render tables */
    renderSalesTableInto($("todaySalesTable"), detail.sales || []);
    renderExpensesTableInto($("todayExpensesTable"), detail.expenses || []);
  }

  /* ---------- History list ---------- */

  async function renderHistoryList() {
    const branch = state.view.branch;
    if (!branch) return;

    historyListWrap.innerHTML =
      '<div class="adm-state adm-state-loading"><div class="adm-spinner"></div><p>Loading history…</p></div>';
    historyDetailWrap.classList.add("hidden");
    historyDetailWrap.innerHTML = "";

    const filters = { branch };
    if (histDate.value) {
      filters.startDate = histDate.value;
      filters.endDate = histDate.value;
    } else {
      if (histStart.value) filters.startDate = histStart.value;
      if (histEnd.value) filters.endDate = histEnd.value;
    }

    try {
      const entries = await loadAllHistory(filters);
      state.branchHistory = entries;

      if (!entries.length) {
        historyListWrap.innerHTML =
          '<div class="adm-empty">' +
            '<div class="adm-empty-icon">' +
              '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
                '<path d="M3 10h18"/>' +
              "</svg>" +
            "</div>" +
            '<p class="adm-empty-title">No history</p>' +
            '<p class="adm-empty-text">No accounts found for the selected filters.</p>' +
          "</div>";
        return;
      }

      const wrap = document.createElement("div");
      wrap.className = "adm-table-wrap";
      const table = document.createElement("table");
      table.className = "adm-table";
      table.innerHTML =
        "<thead>" +
          "<tr>" +
            "<th>Date</th>" +
            "<th>Status</th>" +
            '<th class="adm-td-right">Sales</th>' +
            '<th class="adm-td-right">Expenses</th>' +
            '<th class="adm-td-right">Available</th>' +
            '<th class="adm-td-actions"></th>' +
          "</tr>" +
        "</thead>" +
        "<tbody></tbody>";
      const tbody = table.querySelector("tbody");

      entries.forEach((entry) => {
        const acc = entry.account || {};
        const t = entry.totals || {};
        const kind = statusOfAccount(acc);
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="adm-td-strong">' + escapeHtml(acc.dateKey || "—") + "</td>" +
          "<td>" + statusPill(kind) + "</td>" +
          '<td class="adm-td-right">' + formatCedi(num(t.sales)) + "</td>" +
          '<td class="adm-td-right">' + formatCedi(num(t.expenses)) + "</td>" +
          '<td class="adm-td-right adm-td-strong">' + formatCedi(num(t.available)) + "</td>" +
          '<td class="adm-td-actions">' +
            '<button type="button" class="adm-btn adm-btn-ghost" data-view-date="' +
              escapeHtml(acc.dateKey || "") + '">View</button>' +
          "</td>";
        tbody.appendChild(tr);
      });

      wrap.appendChild(table);
      historyListWrap.innerHTML = "";
      historyListWrap.appendChild(wrap);

      historyListWrap.querySelectorAll("[data-view-date]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const d = btn.dataset.viewDate;
          if (!isValidDateKey(d)) return;
          openHistoryDetail(branch, d);
        });
      });
    } catch (err) {
      handleLoadError(err, "Unable to load branch history.");
    }
  }

  async function openHistoryDetail(branch, dateKey) {
    historyDetailWrap.classList.remove("hidden");
    historyDetailWrap.innerHTML =
      '<div class="adm-card adm-state adm-state-loading"><div class="adm-spinner"></div><p>Loading day detail…</p></div>';

    try {
      const detail = await loadBranchDateDetail(branch, dateKey);
      state.currentDetail = detail;
      renderHistoryDetail(branch, dateKey, detail);
    } catch (err) {
      if (err && err.status === 404) {
        historyDetailWrap.innerHTML =
          '<div class="adm-card adm-empty">' +
            '<div class="adm-empty-icon">⚠</div>' +
            '<p class="adm-empty-title">No record</p>' +
            '<p class="adm-empty-text">No account found for ' +
              escapeHtml(formatReadableDate(dateKey)) +
            ".</p>" +
          "</div>";
        return;
      }
      handleLoadError(err, "Unable to load day detail.");
    }
  }

  function renderHistoryDetail(branch, dateKey, detail) {
    historyDetailWrap.innerHTML = "";
    const account = detail.account;
    const balances = pickBalances(detail);
    const kind = statusOfAccount(account);

    /* Head card with actions */
    const headCard = document.createElement("div");
    headCard.className = "adm-card";
    headCard.innerHTML =
      '<div class="adm-grand-total-head" style="margin-bottom:18px">' +
        '<div>' +
          '<h2 class="adm-card-title">' +
            escapeHtml(branch) + " · " + escapeHtml(dateKey) +
          "</h2>" +
          '<p class="adm-page-sub" style="margin-top:4px">' +
            escapeHtml(formatReadableDate(dateKey)) +
          "</p>" +
        "</div>" +
        '<div class="adm-action-group" id="histDetailActions"></div>' +
      "</div>" +

      '<div class="adm-summary-block">' +
        '<h3 class="adm-summary-block-title">Opening</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.opening && balances.opening.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.opening && balances.opening.bank)) + "</span></div>" +
          '<div class="adm-summary-cell adm-summary-cell-total"><span class="adm-summary-cell-label">Total</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(
              num(balances.opening && balances.opening.momo) +
              num(balances.opening && balances.opening.bank)
            ) + "</span></div>" +
        "</div>" +
      "</div>" +

      '<div class="adm-summary-block">' +
        '<h3 class="adm-summary-block-title">Sales</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Total Sales</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.totalSales)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.sales && balances.sales.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.sales && balances.sales.bank)) + "</span></div>" +
        "</div>" +
      "</div>" +

      '<div class="adm-summary-block">' +
        '<h3 class="adm-summary-block-title">Expenses</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Total Expenses</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.totalExpenses)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.expenses && balances.expenses.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.expenses && balances.expenses.bank)) + "</span></div>" +
        "</div>" +
      "</div>" +

      '<div class="adm-summary-block adm-summary-block-available">' +
        '<h3 class="adm-summary-block-title">Available</h3>' +
        '<div class="adm-summary-grid">' +
          '<div class="adm-summary-cell adm-summary-cell-total"><span class="adm-summary-cell-label">Total Available</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.totalAvailable)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">MoMo</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.available && balances.available.momo)) + "</span></div>" +
          '<div class="adm-summary-cell"><span class="adm-summary-cell-label">Bank/POS</span>' +
            '<span class="adm-summary-cell-value">' + formatCedi(num(balances.available && balances.available.bank)) + "</span></div>" +
        "</div>" +
      "</div>";

    historyDetailWrap.appendChild(headCard);

    /* Action buttons */
    const actionsEl = headCard.querySelector("#histDetailActions");
    if (kind === "open") {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "adm-btn adm-btn-danger";
      closeBtn.textContent = "Close Account";
      closeBtn.addEventListener("click", () => closeAccount(branch, dateKey));
      actionsEl.appendChild(closeBtn);
    }
    if (kind === "closed") {
      const approveBtn = document.createElement("button");
      approveBtn.type = "button";
      approveBtn.className = "adm-btn adm-btn-success";
      approveBtn.textContent = "Approve Account";
      approveBtn.addEventListener("click", () => approveAccount(branch, dateKey));
      actionsEl.appendChild(approveBtn);
    }
    if (kind === "closed" || kind === "approved") {
      const reopenBtn = document.createElement("button");
      reopenBtn.type = "button";
      reopenBtn.className = "adm-btn adm-btn-secondary";
      reopenBtn.textContent = "Reopen Account";
      reopenBtn.addEventListener("click", () => reopenAccount(branch, dateKey));
      actionsEl.appendChild(reopenBtn);
    }

    /* Sales */
    const salesCard = document.createElement("div");
    salesCard.className = "adm-card";
    salesCard.innerHTML =
      '<div style="margin-bottom:14px"><h2 class="adm-card-title">Sales</h2></div>' +
      '<div id="histSalesTable"></div>';
    historyDetailWrap.appendChild(salesCard);

    /* Expenses */
    const expCard = document.createElement("div");
    expCard.className = "adm-card";
    expCard.innerHTML =
      '<div style="margin-bottom:14px"><h2 class="adm-card-title">Expenses</h2></div>' +
      '<div id="histExpensesTable"></div>';
    historyDetailWrap.appendChild(expCard);

    renderSalesTableInto($("histSalesTable"), detail.sales || []);
    renderExpensesTableInto($("histExpensesTable"), detail.expenses || []);
  }

  /* ---------- Table renderers ---------- */

  function saleSourceBadge(sale) {
    const s = String(sale.source || "").toLowerCase();
    if (s === "inventory") return '<span class="adm-badge adm-badge-inventory">Inventory</span>';
    if (s === "manual")    return '<span class="adm-badge adm-badge-manual">Manual</span>';
    return '<span class="adm-badge adm-badge-manual">Sale</span>';
  }

  function methodBadge(m) {
    const k = String(m || "").toLowerCase();
    if (k === "momo") return '<span class="adm-badge adm-badge-momo">MoMo</span>';
    if (k === "bank" || k === "bank/pos" || k === "bankpos") {
      return '<span class="adm-badge adm-badge-bank">Bank/POS</span>';
    }
    return '<span class="adm-badge adm-badge-bank">' + escapeHtml(m || "—") + "</span>";
  }

function renderSalesTableInto(container, sales) {
  container.innerHTML = "";
  if (!sales.length) {
    container.innerHTML =
      '<div class="adm-empty">' +
        '<div class="adm-empty-icon">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
            '<path d="M3 10h18"/>' +
          "</svg>" +
        "</div>" +
        '<p class="adm-empty-title">No sales recorded</p>' +
        '<p class="adm-empty-text">Sales you record today will appear here.</p>' +
      "</div>";
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "adm-table-wrap";
  const table = document.createElement("table");
  table.className = "adm-table";

  table.innerHTML =
    "<thead>" +
      "<tr>" +
        "<th>Time</th>" +
        "<th>Product</th>" +
        "<th>Type</th>" +
        '<th class="adm-td-right">Price</th>' +
        '<th class="adm-td-right">MoMo</th>' +
        '<th class="adm-td-right">Bank/POS</th>' +
        '<th class="adm-td-right">Total</th>' +
      "</tr>" +
    "</thead>" +
    "<tbody></tbody>";

  const tbody = table.querySelector("tbody");

  sales.forEach((sale) => {
    const tr = document.createElement("tr");
    const time = formatTime(sale.date || sale.createdAt);
    const name = (sale.product && sale.product.name) || "—";
    const price = num(sale.totalAmount);
    const momo  = num(sale.payment && sale.payment.momo);
    const bank  = num(sale.payment && sale.payment.bank);
    const total = momo + bank;

    tr.innerHTML =
      '<td class="adm-td-time">' + escapeHtml(time) + "</td>" +
      '<td class="adm-td-strong">' + escapeHtml(name) + "</td>" +
      "<td>" + saleSourceBadge(sale) + "</td>" +
      '<td class="adm-td-right">' + formatCedi(price) + "</td>" +
      '<td class="adm-td-right">' + formatCedi(momo) + "</td>" +
      '<td class="adm-td-right">' + formatCedi(bank) + "</td>" +
      '<td class="adm-td-right adm-td-strong">' + formatCedi(total) + "</td>";

    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
  container.appendChild(wrap);

}

  function renderExpensesTableInto(container, expenses, opts) {
    container.innerHTML = "";
    if (!expenses.length) {
      container.innerHTML =
        '<div class="adm-empty">' +
          '<div class="adm-empty-icon">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M4 4h16v16H4z"/>' +
              '<path d="M8 9h8"/>' +
              '<path d="M8 13h5"/>' +
            "</svg>" +
          "</div>" +
          '<p class="adm-empty-title">No expenses</p>' +
          '<p class="adm-empty-text">No expenses recorded.</p>' +
        "</div>";
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "adm-table-wrap";
    const table = document.createElement("table");
    table.className = "adm-table";
    table.style.minWidth = "560px";

    table.innerHTML =
      "<thead>" +
        "<tr>" +
          "<th>Time</th>" +
          "<th>Description</th>" +
          "<th>Payment Method</th>" +
          '<th class="adm-td-right">Amount</th>' +
        "</tr>" +
      "</thead>" +
      "<tbody></tbody>";

    const tbody = table.querySelector("tbody");

    expenses.forEach((e) => {
      const tr = document.createElement("tr");
      const time = formatTime(e.date || e.createdAt);
      const amount = num(e.amount);

      tr.innerHTML =
        '<td class="adm-td-time">' + escapeHtml(time) + "</td>" +
        '<td class="adm-td-strong">' + escapeHtml(e.description || "—") + "</td>" +
        "<td>" + methodBadge(e.paymentMethod || "—") + "</td>" +
        '<td class="adm-td-right adm-td-strong">' + formatCedi(amount) + "</td>";

      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    container.appendChild(wrap);

  }

  /* ---------- Actions: close / reopen / approve ---------- */

  async function closeAccount(branch, dateKey) {
    if (!confirm("Close " + branch + " for " + dateKey + "? No further sales or expenses will be recorded for this day.")) return;
    try {
      await financeJson("/finance/admin/close/" + encodeURIComponent(branch) + "/" + dateKey, {
        method: "POST",
      });
      showToast("Account closed successfully.", "success");
      await refreshCurrentView();
    } catch (err) {
      handleActionError(err, "Unable to close account.");
    }
  }

  async function reopenAccount(branch, dateKey) {
    if (!confirm("Reopen " + branch + " for " + dateKey + "? Staff will be able to add sales and expenses again.")) return;
    try {
      await financeJson("/finance/admin/reopen/" + encodeURIComponent(branch) + "/" + dateKey, {
        method: "POST",
      });
      showToast("Account reopened successfully.", "success");
      await refreshCurrentView();
    } catch (err) {
      handleActionError(err, "Unable to reopen account.");
    }
  }

  async function approveAccount(branch, dateKey) {
    if (!confirm("Approve " + branch + " for " + dateKey + "? This will mark the day as final.")) return;
    try {
      await financeJson("/finance/admin/approve/" + encodeURIComponent(branch) + "/" + dateKey, {
        method: "POST",
      });
      showToast("Account approved successfully.", "success");
      await refreshCurrentView();
    } catch (err) {
      handleActionError(err, "Unable to approve account.");
    }
  }

  async function refreshCurrentView() {
    if (state.view.section === "dashboard") {
      await renderDashboard();
    } else if (state.view.section === "branch") {
      await renderBranch();
      if (state.view.tab === "history") {
        /* Refresh list; keep detail closed for simplicity */
        await renderHistoryList();
      }
    }
  }

  /* ---------- Global error handlers ---------- */

  function handleLoadError(err, fallback) {
    console.error("[AdminDashboard] load error:", err);
    if (err && err.message === "UNAUTHORIZED") {
      showToast("Your session has expired. Please log in again.", "error", 4000);
      localStorage.removeItem("pin");
      localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      return;
    }
    showError(fallback || "Unable to load data.");
  }

  function handleActionError(err, fallback) {
    console.error("[AdminDashboard] action error:", err);
    if (err && err.message === "UNAUTHORIZED") {
      showToast("Your session has expired. Please log in again.", "error", 4000);
      localStorage.removeItem("pin");
      localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      return;
    }
    const msg =
      (err && err.payload && (err.payload.message || err.payload.error)) ||
      fallback ||
      "Something went wrong.";
    showToast(msg, "error");
  }

  /* ---------- History range filter ---------- */

  function wireHistoryFilter() {
    histApplyBtn.addEventListener("click", () => {
      if (state.view.section === "branch" && state.view.tab === "history") {
        renderHistoryList();
      }
    });
    histClearBtn.addEventListener("click", () => {
      histStart.value = "";
      histEnd.value = "";
      histDate.value = "";
      if (state.view.section === "branch" && state.view.tab === "history") {
        renderHistoryList();
      }
    });

    const today = todayKeyAccra();
    histStart.max = today;
    histEnd.max = today;
    histDate.max = today;
  }

  /* ---------- Init ---------- */

  function init() {
    const auth = ensureAuth();
    if (!auth) return;

    renderHeader();
    wireSidebar();
    wireBranchSubtabs();
    wireHistoryFilter();

    retryBtn.addEventListener("click", () => {
      if (state.view.section === "dashboard") renderDashboard();
      else if (state.view.section === "branch") renderBranch();
    });

    /* Start on Dashboard */
    state.view.section = "dashboard";
    state.view.branch = null;
    setActiveSidebar("dashboard", "");
    renderDashboard();
  }

  document.addEventListener("DOMContentLoaded", init);
})();