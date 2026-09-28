/* ============================================================
   FILE 3: Finance/expenses.js
   CICTech Electronics — Finance Module
   Expenses page behavior (vanilla JS)
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

  const pageDateEl = $("pageDate");
  const accountStatusEl = $("accountStatus");
  const accountStatusText = accountStatusEl
    ? accountStatusEl.querySelector(".fin-status-text")
    : null;

  const closedNotice = $("closedNotice");
  const recordCard = $("recordCard");

  /* Summary cards */
  const sumTotal = $("sumTotal");
  const sumCash = $("sumCash");
  const sumMomo = $("sumMomo");
  const sumBank = $("sumBank");

  /* Form */
  const expenseForm = $("expenseForm");
  const expDescription = $("expDescription");
  const expAmount = $("expAmount");
  const expPaymentMethod = $("expPaymentMethod");
  const expSubmitBtn = $("expSubmitBtn");

  const descHint = $("descHint");
  const amountHint = $("amountHint");
  const methodHint = $("methodHint");

  /* List */
  const expensesListWrap = $("expensesListWrap");

  /* Toast */
  const toastContainer = $("toastContainer");
  

  /* ---------- Local state ---------- */
  const state = {
    user: null,
    pin: null,
    account: null,
    summary: null,
    expenses: [],
    isClosed: false,
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

  function formatCurrencyCedi(value) {
    if (value === null || value === undefined || isNaN(value)) return "GH₵ 0.00";
    const num = Number(value);
    return "GH₵ " + num.toLocaleString("en-GH", {
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
      if (accountStatusText) accountStatusText.textContent = "CLOSED";
      closedNotice.classList.remove("hidden");
      recordCard.classList.add("fin-disabled");
      expSubmitBtn.disabled = true;
      expDescription.disabled = true;
      expAmount.disabled = true;
      expPaymentMethod.disabled = true;
    } else {
      accountStatusEl.classList.add("fin-status-open");
      accountStatusEl.classList.remove("fin-status-closed");
      if (accountStatusText) accountStatusText.textContent = "OPEN";
      closedNotice.classList.add("hidden");
      recordCard.classList.remove("fin-disabled");
      expDescription.disabled = false;
      expAmount.disabled = false;
      expPaymentMethod.disabled = false;
      updateSubmitState();
    }
  }

  /* ---------- Summary cards ---------- */

function pickExpenseNumbers() {
  const s = state.summary || {};
  const b = s.balances || {};
  const e = b.expenses || {};

  const cash = formatNumber(e.cash);
  const momo = formatNumber(e.momo);
  const bank = formatNumber(e.bank);
  const total = formatNumber(
    b.totalExpenses != null ? b.totalExpenses : cash + momo + bank
  );

  return { cash, momo, bank, total };
}

  function renderSummaryCards() {
    const { cash, momo, bank, total } = pickExpenseNumbers();
    sumTotal.textContent = formatCurrency(total);
    sumCash.textContent = formatCurrency(cash);
    sumMomo.textContent = formatCurrency(momo);
    sumBank.textContent = formatCurrency(bank);
  }


/* ---------- Delete confirmation modal (shared) ---------- */

let _deleteAction = null;

function openDeleteConfirm(title, message, action) {
  _deleteAction = action;
  document.getElementById("deleteConfirmTitle").textContent = title;
  document.getElementById("deleteConfirmMessage").textContent = message;
  document.getElementById("deleteConfirmModal").classList.remove("hidden");
}

function closeDeleteConfirm() {
  document.getElementById("deleteConfirmModal").classList.add("hidden");
  _deleteAction = null;
}

async function runDeleteConfirm() {
  const action = _deleteAction;
  if (!action) return;
  const okBtn = document.getElementById("deleteConfirmOk");
  okBtn.disabled = true;
  okBtn.textContent = "Deleting…";
  try {
    await action();
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = "Delete";
    closeDeleteConfirm();
  }
}

async function deleteExpense(expenseId) {
  try {
    const res = await financeFetch("/finance/expenses/" + expenseId, {
      method: "DELETE",
    });
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    if (!res.ok) {
      let msg = "Unable to delete expense.";
      try { const d = await res.json(); if (d.message) msg = d.message; } catch {}
      throw new Error(msg);
    }
    showToast("Expense voided successfully.", "success");
    await refreshAll();
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      showToast("Your session has expired.", "error");
      localStorage.removeItem("pin"); localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      return;
    }
    showToast(err.message || "Unable to delete expense.", "error");
  }
}

/* ---------- Wire the new modals ---------- */
function wireEditAndDeleteModals() {
  document.getElementById("deleteConfirmClose").addEventListener("click", closeDeleteConfirm);
  document.getElementById("deleteConfirmCancel").addEventListener("click", closeDeleteConfirm);
  document.getElementById("deleteConfirmOk").addEventListener("click", runDeleteConfirm);
  document.getElementById("deleteConfirmModal").addEventListener("click", (e) => {
    if (e.target.id === "deleteConfirmModal") closeDeleteConfirm();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!document.getElementById("deleteConfirmModal").classList.contains("hidden")) {
        closeDeleteConfirm();
      }
    }
  });
}

  /* ---------- Expense list ---------- */

  function paymentMethodBadge(method) {
    const m = String(method || "").toLowerCase();
    if (m === "cash") {
      return '<span class="fin-badge fin-badge-cash">Cash</span>';
    }
    if (m === "momo") {
      return '<span class="fin-badge fin-badge-momo">MoMo</span>';
    }
    if (m === "bank" || m === "bank/pos" || m === "bankpos" || m === "pos") {
      return '<span class="fin-badge fin-badge-bank">Bank/POS</span>';
    }
    return '<span class="fin-badge fin-badge-bank">' + escapeHtml(method || "—") + "</span>";
  }

  

function renderExpensesTableInto(container, expenses, opts) {
  container.innerHTML = "";
  if (!expenses.length) {
    container.innerHTML =
      '<div class="fin-empty">' +
        '<div class="fin-empty-icon">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M4 4h16v16H4z"/>' +
            '<path d="M8 9h8"/>' +
            '<path d="M8 13h5"/>' +
          "</svg>" +
        "</div>" +
        '<p class="fin-empty-title">No expenses recorded</p>' +
        '<p class="fin-empty-text">Expenses recorded during the day will appear here.</p>' +
      "</div>";
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "fin-table-wrap";
  const table = document.createElement("table");
  table.className = "fin-table";
  table.style.minWidth = "560px";

  const editable = !!(opts && opts.editable);
  const actionHeader = editable ? '<th class="fin-td-actions">Actions</th>' : "";

  table.innerHTML =
    "<thead>" +
      "<tr>" +
        "<th>Time</th>" +
        "<th>Description</th>" +
        "<th>Payment Method</th>" +
        '<th class="fin-td-right">Amount</th>' +
        actionHeader +
      "</tr>" +
    "</thead>" +
    "<tbody></tbody>";

  const tbody = table.querySelector("tbody");

  expenses.forEach((exp) => {
    const tr = document.createElement("tr");
    const time = formatTime(exp.date || exp.createdAt);
    const amount = formatNumber(exp.amount);

    let actionCell = "";
    if (editable) {
      const expenseId = escapeHtml(exp._id || "");
      actionCell =
        '<td class="fin-td-actions">' +
          '<button type="button" class="fin-btn fin-btn-danger" data-delete-expense="' +
            expenseId + '">Delete</button>' +
        "</td>";
    }

    tr.innerHTML =
      '<td class="fin-td-time">' + escapeHtml(time) + "</td>" +
      '<td class="fin-td-strong">' + escapeHtml(exp.description || "—") + "</td>" +
      "<td>" + paymentMethodBadge(exp.paymentMethod || "—") + "</td>" +
      '<td class="fin-td-right fin-td-strong">' + formatCurrencyCedi(amount) + "</td>" +
      actionCell;

    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
  container.appendChild(wrap);

  if (editable) {
    container.querySelectorAll("[data-delete-expense]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const exp = expenses.find((item) => (item._id || "") === btn.dataset.deleteExpense);
        if (exp) {
          openDeleteConfirm(
            "Delete this expense?",
            "The expense will be marked as voided and removed from today's totals.",
            () => deleteExpense(exp._id)
          );
        }
      });
    });
  }
}

function renderExpensesList() {
  const editable = !state.isClosed;
  renderExpensesTableInto(expensesListWrap, state.expenses || [], {
    editable: editable,
  });
}

  /* ---------- Form validation ---------- */

  function clearHints() {
    [descHint, amountHint, methodHint].forEach((el) => {
      if (el) {
        el.textContent = "";
        el.className = "fin-field-hint";
      }
    });
  }

  function setHint(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "fin-field-hint" + (kind ? " fin-hint-" + kind : "");
  }

  function validateDescription() {
    const v = (expDescription.value || "").trim();
    if (!v) {
      setHint(descHint, "Please enter an expense description.", "error");
      return false;
    }
    if (v.length < 2) {
      setHint(descHint, "Description is too short.", "error");
      return false;
    }
    setHint(descHint, "", "");
    return true;
  }

  function validateAmount() {
    const v = expAmount.value;
    if (v === "" || v === null || v === undefined) {
      setHint(amountHint, "Please enter an amount.", "error");
      return false;
    }
    const num = Number(v);
    if (isNaN(num)) {
      setHint(amountHint, "Amount must be a number.", "error");
      return false;
    }
    if (num <= 0) {
      setHint(amountHint, "Amount must be greater than zero.", "error");
      return false;
    }
    setHint(amountHint, "", "");
    return true;
  }

  function validateMethod() {
    const v = expPaymentMethod.value;
    if (!v) {
      setHint(methodHint, "Please select a payment method.", "error");
      return false;
    }
    const allowed = ["Cash", "MoMo", "Bank/POS"];
    if (!allowed.includes(v)) {
      setHint(methodHint, "Invalid payment method.", "error");
      return false;
    }
    setHint(methodHint, "", "");
    return true;
  }

  function isFormValid() {
    return (
      validateDescription() &&
      validateAmount() &&
      validateMethod()
    );
  }

  function updateSubmitState() {
    /* Submit is enabled only when all three fields are non-empty and valid-ish.
       Full validation still runs on submit. */
    const descOk = (expDescription.value || "").trim().length >= 2;
    const amountOk = Number(expAmount.value) > 0;
    const methodOk = !!expPaymentMethod.value;

    expSubmitBtn.disabled = state.isClosed || !(descOk && amountOk && methodOk);
  }

  /* ---------- Reset form ---------- */

  function resetForm() {
    expenseForm.reset();
    clearHints();
    updateSubmitState();
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

async function loadExpensesFromExistingPayload() {
  try {
    const dateKey =
      (state.account && state.account.dateKey) ||
      (state.summary &&
        state.summary.account &&
        state.summary.account.dateKey);

    if (!dateKey) {
      state.expenses = [];
      return;
    }

    const res = await financeFetch("/finance/history/" + dateKey);

    if (res.status === 401 || res.status === 403) {
      throw new Error("UNAUTHORIZED");
    }

    if (!res.ok) {
      /* 404 means no account for that date — treat as empty, don't crash */
      state.expenses = [];
      return;
    }

    const payload = await res.json();
    state.expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
  } catch (err) {
    console.error("[Expenses] expenses fetch error:", err);
    if (err && err.message === "UNAUTHORIZED") throw err;
    state.expenses = [];
  }
}

  /* ---------- Full refresh ---------- */

  async function refreshAll() {
    try {
      await Promise.all([loadAccount(), loadSummary()]);
      await loadExpensesFromExistingPayload();

      renderPageDate();
      renderAccountStatus();
      renderSummaryCards();
      renderExpensesList();
      updateSubmitState();

      showContent();
    } catch (err) {
      handleLoadError(err);
    }
  }

  function handleLoadError(err) {
    console.error("[Expenses] load error:", err);
    if (err && err.message === "UNAUTHORIZED") {
      showToast("Your session has expired. Please log in again.", "error", 4000);
      localStorage.removeItem("pin");
      localStorage.removeItem("user");
      setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      return;
    }
    if (err && String(err.message).startsWith("HTTP_")) {
      showError("Unable to load today's expenses. The server returned an error.");
    } else {
      showError("Unable to load today's expenses. Please check your connection and try again.");
    }
  }

  /* ---------- Submit ---------- */

  async function submitExpense(e) {
    e.preventDefault();

    if (state.isClosed) {
      showToast("Today's account is closed. Expenses can no longer be recorded.", "error");
      return;
    }

    clearHints();

    if (!validateDescription()) {
      expDescription.focus();
      return;
    }
    if (!validateAmount()) {
      expAmount.focus();
      return;
    }
    if (!validateMethod()) {
      expPaymentMethod.focus();
      return;
    }

    const description = (expDescription.value || "").trim();
    const amount = Number(expAmount.value);
    const paymentMethod = expPaymentMethod.value;

    const payload = {
      description: description,
      amount: amount,
      paymentMethod: paymentMethod,
    };

    expSubmitBtn.disabled = true;
    expSubmitBtn.textContent = "Recording…";

    try {
      const res = await financeFetch("/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("UNAUTHORIZED");
      }
      if (!res.ok) {
        let msg = "Unable to record expense.";
        try {
          const data = await res.json();
          if (data && (data.message || data.error)) {
            msg = data.message || data.error;
          }
        } catch { /* ignore */ }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }

      showToast("Expense recorded successfully.", "success");
      resetForm();
      await refreshAll();
    } catch (err) {
      console.error("[Expenses] submit error:", err);
      if (err.message === "UNAUTHORIZED") {
        showToast("Your session has expired. Please log in again.", "error");
        localStorage.removeItem("pin");
        localStorage.removeItem("user");
        setTimeout(() => (window.location.href = LOGIN_REDIRECT), 900);
      } else if (err.status === 400) {
        showToast(err.message || "Invalid expense data.", "error");
      } else if (err.status === 404) {
        showToast("Today's financial account could not be found.", "error");
      } else if (err.status >= 500) {
        showToast("Server error. Please try again later.", "error");
      } else {
        showToast(err.message || "Unable to record expense.", "error");
      }
    } finally {
      expSubmitBtn.textContent = "Record Expense";
      updateSubmitState();
    }
  }

  /* ---------- Event wiring ---------- */

  function wireEvents() {
    wireEditAndDeleteModals();

    /* Live validation hints */
    expDescription.addEventListener("blur", validateDescription);
    expAmount.addEventListener("blur", validateAmount);
    expPaymentMethod.addEventListener("change", () => {
      validateMethod();
      updateSubmitState();
    });

    /* Live enable/disable of submit button */
    expDescription.addEventListener("input", updateSubmitState);
    expAmount.addEventListener("input", updateSubmitState);

    /* Form submit */
    expenseForm.addEventListener("submit", submitExpense);

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