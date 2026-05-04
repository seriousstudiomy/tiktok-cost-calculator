// ============================================================
// TikTok Cost Calculator — Main Application Logic
// ============================================================

let allProducts  = [];
let compareList  = [];   // array of sellerSku strings
let pieChart     = null;
let cmpChart     = null;
let editingProduct = null;

const COST_LABELS = ["水果成本","人力成本","纸箱成本","耗材成本",
                     "TikTok手续费","网红佣金","广告费","退货成本"];
const CHART_COLORS = ["#4CAF50","#2196F3","#FF9800","#9C27B0",
                      "#F44336","#00BCD4","#FF5722","#607D8B"];

// ── Helpers ──────────────────────────────────────────────────
function displayName(p) {
  return [p.productName, p.variation].filter(Boolean).join(" · ");
}

function calcCost(p, priceOverride, fruitOverride) {
  const price      = priceOverride  ?? p.price;
  const fruitPerKg = fruitOverride  ?? p.fruitPerKg;
  const fruit      = p.weight * fruitPerKg;
  const labor      = p.output > 0 ? (p.staff * p.wage) / p.output : 0;
  const carton     = p.carton;
  const consumables= p.consumables;
  const tiktok     = price * p.tiktokFee;
  const influencer = price * p.influencer;
  const ad         = price * p.adFee;
  const returnCost = price * p.returnRate;
  const total      = fruit + labor + carton + consumables + tiktok + influencer + ad + returnCost;
  const profit     = price - total;
  const margin     = price > 0 ? profit / price : 0;

  // Break-even: fixed costs / (1 - sum of % fees)  [only for base call]
  const fixedCosts = fruit + labor + carton + consumables;
  const pctFees    = p.tiktokFee + p.influencer + p.adFee + p.returnRate;
  const breakEven  = pctFees < 1 ? fixedCosts / (1 - pctFees) : null;
  const priceRoom  = breakEven !== null ? p.price - breakEven : null;

  // Sensitivity — only computed on the base call (no overrides) to avoid recursion
  const isBaseCall = priceOverride == null && fruitOverride == null;
  const profitIfPriceDrop10 = isBaseCall ? calcCost(p, p.price * 0.9, undefined).profit : null;
  const profitIfFruitUp10   = isBaseCall ? calcCost(p, undefined, p.fruitPerKg * 1.1).profit : null;

  return {
    fruit, labor, carton, consumables, tiktok, influencer, ad, returnCost,
    total, profit, margin, fixedCosts, pctFees, breakEven, priceRoom,
    profitIfPriceDrop10, profitIfFruitUp10
  };
}

function costArray(c) {
  return [c.fruit, c.labor, c.carton, c.consumables, c.tiktok, c.influencer, c.ad, c.returnCost];
}

// ── API ──────────────────────────────────────────────────────
async function apiGet(params = {}) {
  const url = new URL(CONFIG.API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return (await fetch(url.toString())).json();
}

async function apiPost(body) {
  return (await fetch(CONFIG.API_URL, { method:"POST", body:JSON.stringify(body) })).json();
}

// ── Load ─────────────────────────────────────────────────────
async function loadProducts() {
  showLoading(true);
  try {
    const res = await apiGet({ action:"list" });
    if (res.ok) {
      allProducts = res.data;
      renderOverview();
      updateCompareBar();
    } else {
      showError("无法加载产品数据：" + (res.error || "未知错误"));
    }
  } catch {
    showError("连接失败，请检查 API URL 配置。");
  }
  showLoading(false);
}

// ── Overview ─────────────────────────────────────────────────
function renderOverview() {
  const tbody = document.getElementById("overview-body");
  tbody.innerHTML = "";

  if (!allProducts.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-msg">暂无产品，点击"新增产品"开始添加</td></tr>`;
    return;
  }

  allProducts.forEach(p => {
    const c   = calcCost(p);
    const pct = (c.margin * 100).toFixed(1);
    const sku = (p.sellerSku || "").replace(/'/g,"\\'");
    const inCmp = compareList.includes(p.sellerSku);
    const profitClass  = c.profit >= 0 ? "profit-pos" : "profit-neg";
    const marginClass  = c.margin >= 0.1 ? "badge-green" : c.margin >= 0 ? "badge-yellow" : "badge-red";
    const cmpBtnClass  = inCmp ? "btn-cmp-on" : "btn-cmp";
    const cmpBtnLabel  = inCmp ? "✓ 比较中" : "＋ 比较";

    const tr = document.createElement("tr");
    if (inCmp) tr.classList.add("row-in-compare");
    tr.innerHTML = `
      <td class="sku-cell">${p.sellerSku||"—"}</td>
      <td class="product-name">${p.productName||"—"}</td>
      <td>${p.variation||"—"}</td>
      <td class="num">RM ${Number(p.price).toFixed(2)}</td>
      <td class="num">RM ${c.total.toFixed(3)}</td>
      <td class="num ${profitClass}">RM ${c.profit.toFixed(3)}</td>
      <td class="num"><span class="badge ${marginClass}">${pct}%</span></td>
      <td class="actions">
        <button class="${cmpBtnClass}" onclick="toggleCompare('${sku}')">${cmpBtnLabel}</button>
        <button class="btn-edit" onclick="openEditForm('${sku}')">编辑</button>
        <button class="btn-del"  onclick="confirmDelete('${sku}')">删除</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ── Compare Logic ────────────────────────────────────────────
function toggleCompare(sku) {
  if (compareList.includes(sku)) {
    compareList = compareList.filter(s => s !== sku);
  } else {
    if (compareList.length >= 4) {
      showError("最多同时比较 4 个产品");
      return;
    }
    compareList.push(sku);
  }
  renderOverview();
  updateCompareBar();
  if (compareList.length > 0) renderComparison();
}

function updateCompareBar() {
  const bar = document.getElementById("compare-bar");
  const chips = document.getElementById("compare-chips");
  const navBtn = document.getElementById("nav-detail-btn");

  if (!compareList.length) {
    bar.style.display = "none";
    navBtn.textContent = "🔍 产品详情";
    return;
  }

  bar.style.display = "flex";
  navBtn.textContent = `🔍 产品对比 (${compareList.length})`;

  chips.innerHTML = compareList.map(sku => {
    const p = allProducts.find(x => x.sellerSku === sku);
    const label = p ? displayName(p) : sku;
    return `<span class="cmp-chip">${label}
      <button onclick="toggleCompare('${sku.replace(/'/g,"\\'")}')" title="移除">✕</button>
    </span>`;
  }).join("");
}

function clearCompare() {
  compareList = [];
  renderOverview();
  updateCompareBar();
}

// ── Comparison View ──────────────────────────────────────────
function renderComparison() {
  const products = compareList.map(sku => allProducts.find(p => p.sellerSku === sku)).filter(Boolean);
  if (!products.length) return;

  // If only 1 product → show single detail
  if (products.length === 1) {
    showSingleDetail(products[0]);
    return;
  }

  // Multi-product comparison
  const container = document.getElementById("detail-container");
  container.innerHTML = "";

  // ── Summary comparison table ──
  const costs = products.map(calcCost);

  const rows = [
    ["售价 (RM)",       p => Number(p.price).toFixed(2), false],
    ["总成本 (RM)",     (_, i) => costs[i].total.toFixed(3), false],
    ["净利润 (RM)",     (_, i) => costs[i].profit.toFixed(3), true],
    ["净利润率",        (_, i) => (costs[i].margin*100).toFixed(1)+"%", true],
    ["── 关键决策指标 ──", null, false],
    ["保本价 (RM)",     (_, i) => costs[i].breakEven != null ? costs[i].breakEven.toFixed(3) : "—", false, "lowest"],
    ["降价空间 (RM)",   (_, i) => costs[i].priceRoom != null ? costs[i].priceRoom.toFixed(3) : "—", true],
    ["成本占售价",      (_, i) => costs[i].total > 0 && products[i].price > 0 ? (costs[i].total/products[i].price*100).toFixed(1)+"%" : "—", false, "lowest_num"],
    ["── 敏感度分析 ──", null, false],
    ["若售价降10%利润",  (_, i) => costs[i].profitIfPriceDrop10 != null ? costs[i].profitIfPriceDrop10.toFixed(3) : "—", true],
    ["若水果涨价10%利润",(_, i) => costs[i].profitIfFruitUp10  != null ? costs[i].profitIfFruitUp10.toFixed(3)  : "—", true],
    ["── 成本明细 ──", null, false],
    ["水果成本",        (_, i) => costs[i].fruit.toFixed(3), false],
    ["人力成本",        (_, i) => costs[i].labor.toFixed(3), false],
    ["纸箱成本",        (_, i) => costs[i].carton.toFixed(3), false],
    ["耗材成本",        (_, i) => costs[i].consumables.toFixed(3), false],
    ["TikTok手续费",    (_, i) => costs[i].tiktok.toFixed(3), false],
    ["网红佣金",        (_, i) => costs[i].influencer.toFixed(3), false],
    ["广告费",          (_, i) => costs[i].ad.toFixed(3), false],
    ["退货成本",        (_, i) => costs[i].returnCost.toFixed(3), false],
  ];

  const colWidth = `${Math.floor(70 / products.length)}%`;

  let tableHTML = `
    <div style="overflow-x:auto;margin-bottom:20px">
    <table class="cmp-table">
      <thead><tr>
        <th style="width:30%">项目</th>
        ${products.map(p => `<th style="width:${colWidth}">
          <div class="cmp-th-name">${displayName(p)}</div>
          <div class="cmp-th-sku">${p.sellerSku||""}</div>
        </th>`).join("")}
      </tr></thead>
      <tbody>`;

  rows.forEach(([label, fn, highlight, mode]) => {
    if (!fn) {
      tableHTML += `<tr class="cmp-section-row"><td colspan="${products.length+1}">${label}</td></tr>`;
      return;
    }
    const vals = products.map((p,i) => parseFloat(fn(p,i)));
    const validVals = vals.filter(v => !isNaN(v));
    const maxIdx = validVals.length ? vals.indexOf(Math.max(...validVals)) : -1;
    const minIdx = validVals.length ? vals.indexOf(Math.min(...validVals)) : -1;

    const needsRM = label.includes("(RM)") || label.includes("利润");
    const needsPct= label.includes("占售价");

    tableHTML += `<tr>
      <td class="cmp-label">${label}</td>
      ${products.map((p,i) => {
        const raw    = fn(p,i);
        const numVal = parseFloat(raw);
        let cls = "";
        if (!isNaN(numVal)) {
          if (highlight) {
            // Higher is better
            if (numVal >= 0) cls = i === maxIdx ? "cmp-best" : "";
            else cls = "cmp-worst";
          } else if (mode === "lowest") {
            // Lower is better (e.g. break-even price)
            cls = i === minIdx ? "cmp-best" : "";
          } else if (mode === "lowest_num") {
            cls = i === minIdx ? "cmp-best" : "";
          } else if (label.includes("总成本")) {
            cls = i === minIdx ? "cmp-best" : "";
          }
        }
        let display = raw;
        if (!isNaN(numVal)) {
          if (needsPct) display = raw;
          else if (needsRM) display = "RM " + raw;
          else if (!label.includes("%")) display = raw;
        }
        return `<td class="num ${cls}">${display}</td>`;
      }).join("")}
    </tr>`;
  });

  tableHTML += `</tbody></table></div>`;
  container.innerHTML = tableHTML;

  // ── Grouped bar chart ──
  const chartWrap = document.createElement("div");
  chartWrap.className = "card";
  chartWrap.style.marginBottom = "20px";
  chartWrap.innerHTML = `
    <div class="card-header blue">📊 成本结构对比 (RM 金额)</div>
    <div class="card-body"><canvas id="cmp-chart" style="max-height:340px"></canvas></div>`;
  container.appendChild(chartWrap);

  // ── Stacked % chart ──
  const pctWrap = document.createElement("div");
  pctWrap.className = "card";
  pctWrap.style.marginBottom = "20px";
  pctWrap.innerHTML = `
    <div class="card-header green">📐 成本结构占售价比例 (%)</div>
    <div class="card-body" style="font-size:.8rem;color:#666;margin-bottom:6px">
      每条柱子 = 100% 售价。各色块 = 各成本占售价的%，柱子剩余部分 = 净利润。
    </div>
    <div class="card-body"><canvas id="cmp-pct-chart" style="max-height:340px"></canvas></div>`;
  container.appendChild(pctWrap);

  // ── Sensitivity card ──
  const sensWrap = document.createElement("div");
  sensWrap.className = "card";
  sensWrap.style.marginBottom = "20px";
  sensWrap.innerHTML = `
    <div class="card-header orange">⚠️ 敏感度：若售价降10% 或 水果涨价10%</div>
    <div class="card-body"><canvas id="cmp-sens-chart" style="max-height:280px"></canvas></div>`;
  container.appendChild(sensWrap);

  renderCompareChart(products, costs);
  renderComparePctChart(products, costs);
  renderCompareSensChart(products, costs);
}

function renderCompareChart(products, costs) {
  const ctx = document.getElementById("cmp-chart").getContext("2d");
  if (cmpChart) cmpChart.destroy();

  cmpChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: COST_LABELS,
      datasets: products.map((p, i) => ({
        label: displayName(p),
        data: costArray(costs[i]).map(v => +v.toFixed(3)),
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "CC",
        borderColor:     CHART_COLORS[i % CHART_COLORS.length],
        borderWidth: 1,
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position:"top" },
        title:  { display:true, text:"各成本项目对比 (RM)" }
      },
      scales: { y: { ticks: { callback: v => "RM "+v } } }
    }
  });
}

let cmpPctChart  = null;
let cmpSensChart = null;

function renderComparePctChart(products, costs) {
  const ctx = document.getElementById("cmp-pct-chart").getContext("2d");
  if (cmpPctChart) cmpPctChart.destroy();

  // Each dataset = one cost category; value = pct of selling price
  const labels = products.map(p => displayName(p));
  const costKeys = ["fruit","labor","carton","consumables","tiktok","influencer","ad","returnCost"];

  const datasets = costKeys.map((key, ki) => ({
    label: COST_LABELS[ki],
    data: products.map((p, pi) => {
      const v = costs[pi][key];
      return p.price > 0 ? +( v / p.price * 100 ).toFixed(2) : 0;
    }),
    backgroundColor: CHART_COLORS[ki % CHART_COLORS.length] + "CC",
    borderColor:     CHART_COLORS[ki % CHART_COLORS.length],
    borderWidth: 1,
  }));

  // Add profit as the top segment
  datasets.push({
    label: "净利润",
    data: products.map((p, pi) => {
      const m = costs[pi].margin * 100;
      return +Math.max(0, m).toFixed(2);
    }),
    backgroundColor: "#80CBC480",
    borderColor: "#009688",
    borderWidth: 1,
  });

  cmpPctChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "right" },
        title:  { display: true, text: "各产品成本结构（占售价%）" },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + ": " + ctx.parsed.y + "%" } }
      },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          max: 100,
          ticks: { callback: v => v + "%" }
        }
      }
    }
  });
}

function renderCompareSensChart(products, costs) {
  const ctx = document.getElementById("cmp-sens-chart").getContext("2d");
  if (cmpSensChart) cmpSensChart.destroy();

  const labels = products.map(p => displayName(p));

  cmpSensChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "当前净利润",
          data: products.map((p, i) => +costs[i].profit.toFixed(3)),
          backgroundColor: "#4CAF50CC",
          borderColor: "#4CAF50",
          borderWidth: 1,
        },
        {
          label: "售价降10%后",
          data: products.map((p, i) => +costs[i].profitIfPriceDrop10.toFixed(3)),
          backgroundColor: "#FF9800CC",
          borderColor: "#FF9800",
          borderWidth: 1,
        },
        {
          label: "水果涨价10%后",
          data: products.map((p, i) => +costs[i].profitIfFruitUp10.toFixed(3)),
          backgroundColor: "#F44336CC",
          borderColor: "#F44336",
          borderWidth: 1,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top" },
        title:  { display: true, text: "敏感度分析：各场景净利润对比 (RM/件)" }
      },
      scales: {
        y: { ticks: { callback: v => "RM " + v } }
      }
    }
  });
}

// ── Single Detail ────────────────────────────────────────────
function showSingleDetail(p) {
  const c = calcCost(p);
  const container = document.getElementById("detail-container");

  const items = [
    ["水果成本",     c.fruit,       `${p.weight}kg × RM${p.fruitPerKg}`],
    ["人力成本",     c.labor,       `${p.staff}人 × RM${p.wage}/hr ÷ ${p.output}件/hr`],
    ["纸箱成本",     c.carton,      "直接成本"],
    ["耗材成本",     c.consumables, "直接成本"],
    ["TikTok手续费", c.tiktok,      `RM${p.price} × ${(p.tiktokFee*100).toFixed(1)}%`],
    ["网红佣金",     c.influencer,  `RM${p.price} × ${(p.influencer*100).toFixed(1)}%`],
    ["广告费",       c.ad,          `RM${p.price} × ${(p.adFee*100).toFixed(1)}%`],
    ["退货成本",     c.returnCost,  `RM${p.price} × ${(p.returnRate*100).toFixed(1)}%`],
  ];

  const marginCls = c.margin >= 0.1 ? "profit-pos" : c.margin >= 0 ? "profit-warn" : "profit-neg";

  container.innerHTML = `
    <div class="card">
      <div class="card-header orange">
        🔍 ${displayName(p)}
        <span style="font-size:.8rem;opacity:.8;font-weight:400">SKU: ${p.sellerSku||"—"}</span>
      </div>
      <div class="card-body">
        <div class="stats-row" style="margin-bottom:20px">
          <div class="stat-card"><div class="label">售价</div>
            <div class="big-num">RM ${Number(p.price).toFixed(2)}</div></div>
          <div class="stat-card"><div class="label">总成本</div>
            <div class="big-num">RM ${c.total.toFixed(3)}</div></div>
          <div class="stat-card"><div class="label">净利润</div>
            <div class="big-num ${c.profit>=0?'profit-pos':'profit-neg'}">RM ${c.profit.toFixed(3)}</div></div>
          <div class="stat-card"><div class="label">净利润率</div>
            <div class="big-num ${marginCls}">${(c.margin*100).toFixed(1)}%</div></div>
        </div>
        <div class="stats-row" style="margin-bottom:20px;grid-template-columns:repeat(3,1fr)">
          <div class="stat-card"><div class="label">保本价</div>
            <div class="big-num" style="font-size:1.1rem">${c.breakEven!=null?"RM "+c.breakEven.toFixed(2):"—"}</div></div>
          <div class="stat-card"><div class="label">降价空间</div>
            <div class="big-num ${c.priceRoom!=null&&c.priceRoom>0?'profit-pos':'profit-neg'}" style="font-size:1.1rem">
              ${c.priceRoom!=null?"RM "+c.priceRoom.toFixed(2):"—"}</div></div>
          <div class="stat-card"><div class="label">售价降10% → 利润</div>
            <div class="big-num ${c.profitIfPriceDrop10!=null&&c.profitIfPriceDrop10>=0?'profit-pos':'profit-neg'}" style="font-size:1.1rem">
              ${c.profitIfPriceDrop10!=null?"RM "+c.profitIfPriceDrop10.toFixed(3):"—"}</div></div>
        </div>
        <div class="detail-grid">
          <div>
            <div class="card-header blue" style="border-radius:8px 8px 0 0;font-size:.9rem">💰 成本明细</div>
            <table class="breakdown-table">
              <thead><tr>
                <th>项目</th><th style="text-align:right">金额</th>
                <th>说明</th><th style="text-align:right">占比</th>
              </tr></thead>
              <tbody>
                ${items.map(([label,val,note]) => `<tr>
                  <td>${label}</td>
                  <td class="num">RM ${val.toFixed(3)}</td>
                  <td class="note">${note}</td>
                  <td class="num pct">${c.total>0?(val/c.total*100).toFixed(1):0}%</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
          <div class="card" style="margin:0">
            <div class="chart-wrap"><canvas id="pie-chart"></canvas></div>
          </div>
        </div>
      </div>
    </div>`;

  // render pie after DOM update
  requestAnimationFrame(() => {
    const ctx = document.getElementById("pie-chart").getContext("2d");
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: items.map(i=>i[0]),
        datasets: [{ data: items.map(i=>Math.max(0,i[1])), backgroundColor: CHART_COLORS }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position:"right" },
          title:  { display:true, text:`${displayName(p)} — 成本构成` }
        }
      }
    });
  });
}

function showDetail(sku) {
  if (!compareList.includes(sku)) {
    compareList = [sku];
    renderOverview();
    updateCompareBar();
  }
  renderComparison();
}

// ── Bar Chart (all products overview) ────────────────────────
function renderBarChart() {
  const ctx = document.getElementById("bar-chart").getContext("2d");
  if (window._barChart) window._barChart.destroy();

  const sorted = [...allProducts]
    .map(p => ({ label: displayName(p), margin: calcCost(p).margin }))
    .sort((a,b) => b.margin - a.margin);

  window._barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(p => p.label),
      datasets: [{
        label: "净利润率",
        data: sorted.map(p => +(p.margin*100).toFixed(2)),
        backgroundColor: sorted.map(p => p.margin>=0.1?"#4CAF50":p.margin>=0?"#FFC107":"#F44336")
      }]
    },
    options: {
      responsive: true,
      plugins: { legend:{display:false}, title:{display:true,text:"所有产品利润率对比"} },
      scales:  { y: { ticks:{ callback: v=>v+"%" } } }
    }
  });
}

// ── Add / Edit Form ──────────────────────────────────────────
function openAddForm() {
  editingProduct = null;
  document.getElementById("form-title").textContent = "新增产品";
  document.getElementById("product-form").reset();
  document.getElementById("f-sellerSku").removeAttribute("readonly");
  switchTab("tab-form");
}

function openEditForm(sku) {
  const p = allProducts.find(x => x.sellerSku === sku);
  if (!p) return;
  editingProduct = sku;
  document.getElementById("form-title").textContent = "编辑产品";
  CONFIG.COLUMNS.forEach(key => {
    const el = document.getElementById("f-"+key);
    if (!el) return;
    el.value = CONFIG.PCT_FIELDS.includes(key) ? +(p[key]*100).toFixed(4) : (p[key]??"");
  });
  document.getElementById("f-sellerSku").setAttribute("readonly", true);
  switchTab("tab-form");
}

async function submitForm(e) {
  e.preventDefault();
  const TEXT = ["sellerSku","productName","variation"];
  const data = {};
  CONFIG.COLUMNS.forEach(key => {
    const el = document.getElementById("f-"+key);
    if (!el) return;
    if (TEXT.includes(key)) {
      data[key] = el.value.trim();
    } else {
      const v = parseFloat(el.value);
      data[key] = CONFIG.PCT_FIELDS.includes(key) ? v/100 : v;
    }
  });
  if (!data.sellerSku)   return alert("请输入 Seller SKU");
  if (!data.productName) return alert("请输入产品名");

  showLoading(true);
  try {
    const res = await apiPost({ action: editingProduct?"update":"create", data });
    if (res.ok) { await loadProducts(); switchTab("tab-overview"); }
    else alert("保存失败：" + (res.error||"未知错误"));
  } catch { alert("网络错误，请重试"); }
  showLoading(false);
}

async function confirmDelete(sku) {
  const p = allProducts.find(x => x.sellerSku === sku);
  if (!confirm(`确定删除「${p?displayName(p):sku}」？`)) return;
  showLoading(true);
  try {
    const res = await apiPost({ action:"delete", name:sku });
    if (res.ok) {
      compareList = compareList.filter(s => s !== sku);
      await loadProducts();
    } else alert("删除失败：" + (res.error||"未知错误"));
  } catch { alert("网络错误，请重试"); }
  showLoading(false);
}

// ── UI Helpers ───────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  document.querySelector(`[data-tab="${tabId}"]`).classList.add("active");
  if (tabId === "tab-detail") renderComparison();
  if (tabId === "tab-charts") renderBarChart();
}

function showLoading(on) {
  document.getElementById("loading").style.display = on?"flex":"none";
}
function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg; el.style.display = "block";
  setTimeout(()=> el.style.display="none", 5000);
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (CONFIG.API_URL === "YOUR_APPS_SCRIPT_URL_HERE") {
    showError("请先在 config.js 中填入 Apps Script 部署 URL"); return;
  }
  document.getElementById("product-form").addEventListener("submit", submitForm);
  loadProducts();
});
