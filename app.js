// ============================================================
// TikTok Cost Calculator — Main Application Logic
// ============================================================

let allProducts = [];
let pieChart = null;
let barChart = null;
let editingProduct = null;

// ── Cost Calculation ─────────────────────────────────────────
function calcCost(p) {
  const fruit      = p.weight * p.fruitPerKg;
  const labor      = p.output > 0 ? (p.staff * p.wage) / p.output : 0;
  const carton     = p.carton;
  const consumables= p.consumables;
  const tiktok     = p.price * p.tiktokFee;
  const influencer = p.price * p.influencer;
  const ad         = p.price * p.adFee;
  const returnCost = p.price * p.returnRate;
  const total      = fruit + labor + carton + consumables + tiktok + influencer + ad + returnCost;
  const profit     = p.price - total;
  const margin     = p.price > 0 ? profit / p.price : 0;
  return { fruit, labor, carton, consumables, tiktok, influencer, ad, returnCost, total, profit, margin };
}

// ── API Calls ────────────────────────────────────────────────
async function apiGet(params = {}) {
  const url = new URL(CONFIG.API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(CONFIG.API_URL, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return res.json();
}

// ── Load & Render Overview ───────────────────────────────────
async function loadProducts() {
  showLoading(true);
  try {
    const res = await apiGet({ action: "list" });
    if (res.ok) {
      allProducts = res.data;
      renderOverview();
      renderBarChart();
    } else {
      showError("无法加载产品数据：" + (res.error || "未知错误"));
    }
  } catch (e) {
    showError("连接失败，请检查 API URL 配置。");
  }
  showLoading(false);
}

function renderOverview() {
  const tbody = document.getElementById("overview-body");
  tbody.innerHTML = "";

  if (allProducts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-msg">暂无产品，点击"新增产品"开始添加</td></tr>`;
    return;
  }

  allProducts.forEach(p => {
    const c = calcCost(p);
    const pct = (c.margin * 100).toFixed(1);
    const profitClass = c.profit >= 0 ? "profit-pos" : "profit-neg";
    const marginClass = c.margin >= 0.1 ? "badge-green" : c.margin >= 0 ? "badge-yellow" : "badge-red";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="product-name">${p.name}</td>
      <td class="num">RM ${p.price.toFixed(2)}</td>
      <td class="num">RM ${c.total.toFixed(3)}</td>
      <td class="num ${profitClass}">RM ${c.profit.toFixed(3)}</td>
      <td class="num"><span class="badge ${marginClass}">${pct}%</span></td>
      <td class="actions">
        <button class="btn-detail" onclick="showDetail('${p.name}')">详情</button>
        <button class="btn-edit"   onclick="openEditForm('${p.name}')">编辑</button>
        <button class="btn-del"    onclick="confirmDelete('${p.name}')">删除</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ── Detail View ──────────────────────────────────────────────
function showDetail(name) {
  const p = allProducts.find(x => x.name === name);
  if (!p) return;
  const c = calcCost(p);

  document.getElementById("detail-title").textContent = p.name;
  document.getElementById("detail-price").textContent  = `RM ${p.price.toFixed(2)}`;
  document.getElementById("detail-cost").textContent   = `RM ${c.total.toFixed(3)}`;

  const profitEl = document.getElementById("detail-profit");
  profitEl.textContent = `RM ${c.profit.toFixed(3)}`;
  profitEl.className = "big-num " + (c.profit >= 0 ? "profit-pos" : "profit-neg");

  const marginEl = document.getElementById("detail-margin");
  marginEl.textContent = (c.margin * 100).toFixed(1) + "%";
  marginEl.className = "big-num " + (c.margin >= 0.1 ? "profit-pos" : c.margin >= 0 ? "profit-warn" : "profit-neg");

  // Cost breakdown table
  const items = [
    ["水果成本",   c.fruit,       `${p.weight}kg × RM${p.fruitPerKg}`],
    ["人力成本",   c.labor,       `${p.staff}人 × RM${p.wage}/hr ÷ ${p.output}件/hr`],
    ["纸箱成本",   c.carton,      "直接成本"],
    ["耗材成本",   c.consumables, "直接成本"],
    ["TikTok手续费", c.tiktok,    `RM${p.price} × ${(p.tiktokFee*100).toFixed(1)}%`],
    ["网红佣金",   c.influencer,  `RM${p.price} × ${(p.influencer*100).toFixed(1)}%`],
    ["广告费",     c.ad,          `RM${p.price} × ${(p.adFee*100).toFixed(1)}%`],
    ["退货成本",   c.returnCost,  `RM${p.price} × ${(p.returnRate*100).toFixed(1)}%`],
  ];

  const breakdown = document.getElementById("breakdown-body");
  breakdown.innerHTML = items.map(([label, val, note]) => `
    <tr>
      <td>${label}</td>
      <td class="num">RM ${val.toFixed(3)}</td>
      <td class="note">${note}</td>
      <td class="num pct">${c.total > 0 ? (val/c.total*100).toFixed(1) : 0}%</td>
    </tr>`).join("");

  renderPieChart(p.name, items);

  // Switch tab
  switchTab("tab-detail");
}

// ── Charts ───────────────────────────────────────────────────
function renderPieChart(name, items) {
  const ctx = document.getElementById("pie-chart").getContext("2d");
  if (pieChart) pieChart.destroy();

  const COLORS = ["#4CAF50","#2196F3","#FF9800","#9C27B0",
                  "#F44336","#00BCD4","#FF5722","#607D8B"];

  pieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: items.map(i => i[0]),
      datasets: [{ data: items.map(i => Math.max(0, i[1])), backgroundColor: COLORS }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "right" },
        title:  { display: true, text: `${name} — 成本构成` }
      }
    }
  });
}

function renderBarChart() {
  const ctx = document.getElementById("bar-chart").getContext("2d");
  if (barChart) barChart.destroy();

  const sorted = [...allProducts]
    .map(p => ({ name: p.name, margin: calcCost(p).margin }))
    .sort((a, b) => b.margin - a.margin);

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(p => p.name),
      datasets: [{
        label: "净利润率",
        data: sorted.map(p => +(p.margin * 100).toFixed(2)),
        backgroundColor: sorted.map(p => p.margin >= 0.1 ? "#4CAF50" : p.margin >= 0 ? "#FFC107" : "#F44336")
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: "所有产品利润率对比" }
      },
      scales: {
        y: { ticks: { callback: v => v + "%" } }
      }
    }
  });
}

// ── Add / Edit Form ──────────────────────────────────────────
function openAddForm() {
  editingProduct = null;
  document.getElementById("form-title").textContent = "新增产品";
  document.getElementById("product-form").reset();
  switchTab("tab-form");
}

function openEditForm(name) {
  const p = allProducts.find(x => x.name === name);
  if (!p) return;
  editingProduct = name;
  document.getElementById("form-title").textContent = "编辑产品";

  CONFIG.COLUMNS.forEach(key => {
    const el = document.getElementById("f-" + key);
    if (!el) return;
    if (CONFIG.PCT_FIELDS.includes(key)) {
      el.value = +(p[key] * 100).toFixed(4);
    } else {
      el.value = p[key];
    }
  });

  switchTab("tab-form");
}

async function submitForm(e) {
  e.preventDefault();
  const data = {};
  CONFIG.COLUMNS.forEach(key => {
    const el = document.getElementById("f-" + key);
    if (!el) return;
    const val = key === "name" ? el.value.trim() : parseFloat(el.value);
    data[key] = CONFIG.PCT_FIELDS.includes(key) ? val / 100 : val;
  });

  if (!data.name) return alert("请输入产品名称");

  const action = editingProduct ? "update" : "create";
  showLoading(true);
  try {
    const res = await apiPost({ action, data });
    if (res.ok) {
      await loadProducts();
      switchTab("tab-overview");
    } else {
      alert("保存失败：" + (res.error || "未知错误"));
    }
  } catch (err) {
    alert("网络错误，请重试");
  }
  showLoading(false);
}

async function confirmDelete(name) {
  if (!confirm(`确定删除「${name}」？此操作不可撤销。`)) return;
  showLoading(true);
  try {
    const res = await apiPost({ action: "delete", name });
    if (res.ok) {
      await loadProducts();
    } else {
      alert("删除失败：" + (res.error || "未知错误"));
    }
  } catch (err) {
    alert("网络错误，请重试");
  }
  showLoading(false);
}

// ── UI Helpers ───────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  document.querySelector(`[data-tab="${tabId}"]`).classList.add("active");
}

function showLoading(on) {
  document.getElementById("loading").style.display = on ? "flex" : "none";
}

function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 5000);
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (CONFIG.API_URL === "YOUR_APPS_SCRIPT_URL_HERE") {
    showError("请先在 config.js 中填入 Apps Script 部署 URL");
    return;
  }
  document.getElementById("product-form").addEventListener("submit", submitForm);
  loadProducts();
});
