/**
 * finance.js
 * CICTech Electronics — Finance Staff Dashboard
 * 
 * Reads existing login state from localStorage (pin & user).
 * Fetches today's financial account from local backend.
 * No hardcoded financial data — API is source of truth.
 */

(function () {
  "use strict";

  // ---------- Configuration ----------
  const API_BASE = "https://cictech-inventory-2se4.vercel.app";
  const INVENTORY_FALLBACK = "/"; // existing inventory app home

  // ---------- DOM refs ----------
  const loadingState = document.getElementById("loadingState");
  const errorState = document.getElementById("errorState");
  const dashboardContent = document.getElementById("dashboardContent");

  const branchDisplay = document.getElementById("branchDisplay");
  const branchNameHeader = document.getElementById("branchNameHeader");
  const todayDateEl = document.getElementById("todayDate");
  const accountStatusEl = document.getElementById("accountStatus");
  const backToInventoryBtn = document.getElementById("backToInventoryBtn");

  // Opening
  const openingMomo = document.getElementById("openingMomo");
  const openingBank = document.getElementById("openingBank");
  const openingTotal = document.getElementById("openingTotal");

  // Sales
  const salesTotal = document.getElementById("salesTotal");
  const salesMomo = document.getElementById("salesMomo");
  const salesBank = document.getElementById("salesBank");

  // Expenses
  const expensesTotal = document.getElementById("expensesTotal");
  const expensesMomo = document.getElementById("expensesMomo");
  const expensesBank = document.getElementById("expensesBank");

  // Available
  const availableTotal = document.getElementById("availableTotal");
  const availableMomo = document.getElementById("availableMomo");
  const availableBank = document.getElementById("availableBank");

  // Equation
  const eqOpening = document.getElementById("eqOpening");
  const eqSales = document.getElementById("eqSales");
  const eqExpenses = document.getElementById("eqExpenses");
  const eqAvailable = document.getElementById("eqAvailable");

  // ---------- Helpers ----------
  function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return "—";
    const num = Number(amount);
    return "GHS " + num.toLocaleString("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Reusable API fetch with PIN header.
   */
  async function financeFetch(endpoint, options = {}) {
    const pin = localStorage.getItem("pin");
    if (!pin) {
      throw new Error("NO_PIN");
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "pin": pin,
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("UNAUTHORIZED");
      }
      throw new Error(`HTTP_${response.status}`);
    }

    return response.json();
  }

  // ---------- Show state helpers ----------
  function showLoading() {
    loadingState.classList.remove("hidden");
    errorState.classList.add("hidden");
    dashboardContent.classList.add("hidden");
  }

  function showError(message) {
    loadingState.classList.add("hidden");
    dashboardContent.classList.add("hidden");
    errorState.textContent = message;
    errorState.classList.remove("hidden");
  }

  function showDashboard() {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
    dashboardContent.classList.remove("hidden");
  }

  // ---------- Authentication check ----------
  function getAuth() {
    const pin = localStorage.getItem("pin");
    const userRaw = localStorage.getItem("user");

    if (!pin || !userRaw) {
      return null;
    }

    try {
      const user = JSON.parse(userRaw);
      return { pin, user };
    } catch {
      return null;
    }
  }

  function redirectToLogin() {
    // Existing inventory login — adjust path if needed
    window.location.href = INVENTORY_FALLBACK;
  }

  // ---------- Populate header ----------
  function populateHeader(user) {
    const branch = user.branch || "—";
    branchDisplay.textContent = branch;
    branchNameHeader.textContent = branch;

    // user badge shows role · branch
    // already in HTML: staff · <branch>
  }

function renderDashboard(account, summary) {
  /* -------- Date & status -------- */
  const businessDate =
    (account && (account.businessDate || account.date || account.dateKey)) ||
    (summary && summary.account && summary.account.dateKey) ||
    null;

  if (businessDate) {
    /* dateKey is "YYYY-MM-DD" — turn it into a readable date */
    const parts = String(businessDate).split("-").map(Number);
    const d = parts.length === 3
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date(businessDate);

    todayDateEl.textContent = d.toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } else {
    todayDateEl.textContent = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const statusRaw =
    (account && account.status) ||
    (summary && summary.account && summary.account.status) ||
    "open";

  const isClosed = String(statusRaw).toLowerCase() === "closed";

  if (isClosed) {
    accountStatusEl.textContent = "CLOSED";
    accountStatusEl.classList.add("closed");
  } else {
    accountStatusEl.textContent = "OPEN";
    accountStatusEl.classList.remove("closed");
  }

  /* -------- Balances block (single source of truth) -------- */
  const b = (summary && summary.balances) || {};

  const opening   = b.opening   || (account && account.opening) || {};
  const sales     = b.sales     || {};
  const expenses  = b.expenses  || {};
  const available = b.available || {};

  /* -------- Opening -------- */
  const opMomo = Number(opening.momo || 0);
  const opBank = Number(opening.bank || 0);
  const opTotal = opMomo + opBank;

  openingMomo.textContent = formatCurrency(opMomo);
  openingBank.textContent = formatCurrency(opBank);
  openingTotal.textContent = formatCurrency(opTotal);

  /* -------- Today's Sales -------- */
  const saMomo = Number(sales.momo || 0);
  const saBank = Number(sales.bank || 0);
  const saTotal = Number(
    b.totalSales != null ? b.totalSales : saMomo + saBank
  );

  salesTotal.textContent = formatCurrency(saTotal);
  salesMomo.textContent = formatCurrency(saMomo);
  salesBank.textContent = formatCurrency(saBank);

  /* -------- Today's Expenses -------- */
  const exMomo = Number(expenses.momo || 0);
  const exBank = Number(expenses.bank || 0);
  const exTotal = Number(
    b.totalExpenses != null ? b.totalExpenses : exMomo + exBank
  );

  expensesTotal.textContent = formatCurrency(exTotal);
  expensesMomo.textContent = formatCurrency(exMomo);
  expensesBank.textContent = formatCurrency(exBank);

  /* -------- Available -------- */
  const avMomo = Number(available.momo || 0);
  const avBank = Number(available.bank || 0);
  const avTotal = Number(
    b.totalAvailable != null
      ? b.totalAvailable
        : avMomo + avBank
  );

  availableTotal.textContent = formatCurrency(avTotal);
  availableMomo.textContent = formatCurrency(avMomo);
  availableBank.textContent = formatCurrency(avBank);

  /* -------- Equation summary -------- */
  eqOpening.textContent = formatCurrency(opTotal);
  eqSales.textContent = formatCurrency(saTotal);
  eqExpenses.textContent = formatCurrency(exTotal);
  eqAvailable.textContent = formatCurrency(avTotal);
}

  // ---------- Main load ----------
  async function loadDashboard() {
    showLoading();

    const auth = getAuth();
    if (!auth) {
      redirectToLogin();
      return;
    }

    const { user } = auth;

    // Admin should NOT see staff dashboard
    if (user.role === "admin") {
      redirectToLogin(); // later will go to admin dashboard
      return;
    }

    // Must be staff
    if (user.role !== "staff") {
      showError("Access denied. Staff credentials required.");
      return;
    }

    populateHeader(user);

    try {
      // Fetch both endpoints in parallel
      const [account, summary] = await Promise.all([
        financeFetch("/finance/account/today"),
        financeFetch("/finance/account/today/summary"),
      ]);

      // Check for missing daily account
      if (!account || !summary) {
        showError("Today's financial account is not available. Please contact an administrator.");
        return;
      }

      renderDashboard(account, summary);
      showDashboard();
    } catch (err) {
      console.error("Finance dashboard error:", err);

      if (err.message === "NO_PIN") {
        redirectToLogin();
      } else if (err.message === "UNAUTHORIZED") {
        // Clear stale session and redirect to login
        localStorage.removeItem("pin");
        localStorage.removeItem("user");
        redirectToLogin();
      } else if (err.message && err.message.startsWith("HTTP_")) {
        const status = err.message.replace("HTTP_", "");
        showError(`Server error (${status}). Please try again later.`);
      } else {
        showError("Unable to load financial data. Please check your connection and try again.");
      }
    }
  }

  // ---------- Back to Inventory ----------
  backToInventoryBtn.addEventListener("click", function (e) {
    e.preventDefault();
    window.location.href = INVENTORY_FALLBACK;
  });

  // ---------- Init on page load ----------
  document.addEventListener("DOMContentLoaded", loadDashboard);
})();