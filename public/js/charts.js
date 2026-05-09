'use strict';
const charts = {};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
};

const AXIS_STYLE = {
  ticks: { color: '#7090b0', font: { size: 10 } },
  grid:  { color: '#1e2e40' },
};

function tooltipLabel(ctx) { return ' ' + fmt(ctx.raw) + ' ر.س'; }

// ── Stacked bar: monthly distribution by category ─────────────────────────────
function renderStackedBar(months) {
  destroyChart('stacked');
  const ctx = document.getElementById('chart-stacked');
  if (!ctx || !months.length) return;
  charts['stacked'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   months.map(m => m.label),
      datasets: CAT_ORDER.map(c => ({
        label:           CAT_LABEL[c],
        data:            months.map(m => m[c] || 0),
        backgroundColor: CAT_COLORS[c] + 'cc',
        borderColor:     CAT_COLORS[c],
        borderWidth:     1,
      })),
    },
    options: {
      ...CHART_OPTS,
      plugins: {
        legend:  { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: tooltipLabel } },
      },
      scales: {
        x: { stacked: true, ...AXIS_STYLE },
        y: { stacked: true, ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
      },
    },
  });
}

// ── Doughnut: by category ─────────────────────────────────────────────────────
function renderPie(canvasId, chartKey, months) {
  destroyChart(chartKey);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !months.length) return;
  const totals = {};
  CAT_ORDER.forEach(c => { totals[c] = 0; });
  months.forEach(m => CAT_ORDER.forEach(c => { totals[c] += (m[c] || 0); }));
  charts[chartKey] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels:   CAT_ORDER.map(c => CAT_LABEL[c]),
      datasets: [{ data: CAT_ORDER.map(c => totals[c]), backgroundColor: CAT_ORDER.map(c => CAT_COLORS[c]), borderWidth: 1, borderColor: '#0d1b2a' }],
    },
    options: {
      ...CHART_OPTS,
      plugins: {
        legend:  { position: 'right', labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: tooltipLabel } },
      },
    },
  });
}

// ── Bar: monthly totals (filtered by category) ────────────────────────────────
function renderMonthlyChart(monthly, catFilter) {
  destroyChart('monthly');
  const ctx = document.getElementById('chart-monthly');
  if (!ctx || !monthly.length) return;
  const datasets = catFilter === 'all'
    ? CAT_ORDER.map(c => ({ label: CAT_LABEL[c], data: monthly.map(m => m[c]||0), backgroundColor: CAT_COLORS[c]+'cc', borderColor: CAT_COLORS[c], borderWidth: 1 }))
    : [{ label: CAT_LABEL[catFilter], data: monthly.map(m => m[catFilter]||0), backgroundColor: CAT_COLORS[catFilter]+'cc', borderColor: CAT_COLORS[catFilter], borderWidth: 1 }];
  charts['monthly'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: monthly.map(m => m.label), datasets },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
      scales: {
        x: { stacked: catFilter === 'all', ...AXIS_STYLE },
        y: { stacked: catFilter === 'all', ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
      },
    },
  });
}

// ── Doughnut: accounts (top 12) ───────────────────────────────────────────────
function renderAccPie(accounts) {
  destroyChart('acc-pie');
  const ctx = document.getElementById('chart-acc-pie');
  if (!ctx || !accounts.length) return;
  const top12 = [...accounts].sort((a,b) => b.total - a.total).slice(0, 12);
  charts['acc-pie'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels:   top12.map(a => a.name.slice(0, 20)),
      datasets: [{ data: top12.map(a => a.total), backgroundColor: top12.map((_, i) => `hsl(${i*30},55%,45%)`), borderWidth: 1, borderColor: '#0d1b2a' }],
    },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { position: 'right', labels: { color: '#8ba0b8', font: { size: 9 }, boxWidth: 10 } }, tooltip: { callbacks: { label: tooltipLabel } } },
    },
  });
}

// ── Stacked bar: branch expenses by month ────────────────────────────────────
function renderBranchBar(monthly, branches) {
  destroyChart('br-bar');
  const ctx1 = document.getElementById('chart-br-bar');
  if (!ctx1 || !monthly.length) return;
  const months  = monthly.map(m => m.month);
  const brs     = [0, 1, 2, 3, 4, 5];
  const pivot   = {};
  brs.forEach(b => { pivot[b] = {}; months.forEach(mo => { pivot[b][mo] = 0; }); });
  branches.forEach(r => { if (pivot[r.br] && months.includes(r.month)) pivot[r.br][r.month] += r.total; });
  const brTotals = brs.map(b => months.reduce((s, mo) => s + pivot[b][mo], 0));
  const hasData  = brs.filter((_, i) => brTotals[i] > 0);
  const colors   = ['#7a8a9a','#4a9eda','#4ada8e','#da9a4a','#da4ada','#9ada4a'];
  charts['br-bar'] = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels:   monthly.map(m => m.label),
      datasets: hasData.map(b => ({ label: BRANCH_LABEL[b], data: months.map(mo => pivot[b][mo]), backgroundColor: colors[b]+'cc', borderColor: colors[b], borderWidth: 1 })),
    },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
      scales: {
        x: { stacked: true, ...AXIS_STYLE },
        y: { stacked: true, ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
      },
    },
  });
  return { brs, hasData, brTotals, pivot, months, colors };
}

// ── Doughnut: branch share ────────────────────────────────────────────────────
function renderBranchPie(brData) {
  destroyChart('br-pie');
  const ctx2 = document.getElementById('chart-br-pie');
  if (!ctx2 || !brData) return;
  const { hasData, brTotals, colors } = brData;
  charts['br-pie'] = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels:   hasData.map(b => BRANCH_LABEL[b]),
      datasets: [{ data: hasData.map(b => brTotals[b]), backgroundColor: hasData.map(b => colors[b]), borderWidth: 1, borderColor: '#0d1b2a' }],
    },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { position: 'right', labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
    },
  });
}

// ── P&L Waterfall (bridge) chart ─────────────────────────────────────────────
// Uses Chart.js floating bars [min, max] to build a waterfall:
//   Revenue bar → COGS drop → Gross Profit landing → OpEx drop → Net Profit
function renderPLWaterfall(computed) {
  destroyChart('pl-waterfall');
  const ctx = document.getElementById('chart-pl-waterfall');
  if (!ctx) return;

  const { revenue, cogs, otherCost, totalOpex, grossProfit, netProfit } = computed;
  const totalCost = cogs + otherCost;

  // Each bar is [bottom, top]; connectors sit between segments
  const labels = [
    PL_LABELS.revenue,
    'تكلفة المبيعات',
    PL_LABELS.grossProfit,
    'مصروفات تشغيلية',
    netProfit >= 0 ? PL_LABELS.netProfit : 'خسارة صافية',
  ];

  const data = [
    { y: [0, revenue] },          // Revenue: from 0 up to revenue
    { y: [grossProfit, revenue] }, // COGS: from gross profit up to revenue (drop)
    { y: [0, grossProfit] },       // Gross Profit: total bar from 0
    { y: [netProfit, grossProfit] },// OpEx: from net profit up to gross (drop)
    { y: [0, netProfit] },          // Net Profit: total bar from 0
  ];

  const colors = [
    PL_COLORS.revenue,    // Revenue — blue
    PL_COLORS.cogs,       // COGS drop — red
    PL_COLORS.grossProfit,// Gross profit — green
    PL_COLORS.opex,       // OpEx drop — amber
    netProfit >= 0 ? PL_COLORS.netProfit : PL_COLORS.netLoss,
  ];

  charts['pl-waterfall'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data:            data.map(d => d.y),
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor:     colors,
        borderWidth:     1,
        borderSkipped:   false,
      }],
    },
    options: {
      ...CHART_OPTS,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const [lo, hi] = ctx.raw;
              return ' ' + fmt(Math.abs(hi - lo)) + ' ر.س';
            },
          },
        },
      },
      scales: {
        x: { ...AXIS_STYLE },
        y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
      },
    },
  });
}

// ── P&L Trend: Revenue, Gross Profit, Net Profit monthly lines ───────────────
function renderPLTrend(plMonths) {
  destroyChart('pl-trend');
  const ctx = document.getElementById('chart-pl-trend');
  if (!ctx || !plMonths.length) return;

  const computed = plMonths.map(m => {
    const totalCost    = (m.cogs || 0) + (m.otherCost || 0);
    const grossProfit  = (m.revenue || 0) - totalCost;
    const totalOpex    = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    const netProfit    = grossProfit - totalOpex;
    return { label: m.label, revenue: m.revenue, grossProfit, netProfit };
  });

  charts['pl-trend'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: computed.map(m => m.label),
      datasets: [
        {
          label:           PL_LABELS.revenue,
          data:            computed.map(m => m.revenue),
          borderColor:     PL_COLORS.revenue,
          backgroundColor: PL_COLORS.revenue + '22',
          tension:         0.3,
          borderWidth:     2,
          pointRadius:     3,
          fill:            false,
        },
        {
          label:           PL_LABELS.grossProfit,
          data:            computed.map(m => m.grossProfit),
          borderColor:     PL_COLORS.grossProfit,
          backgroundColor: 'transparent',
          tension:         0.3,
          borderWidth:     2,
          pointRadius:     3,
          fill:            false,
        },
        {
          label:           PL_LABELS.netProfit,
          data:            computed.map(m => m.netProfit),
          borderColor:     PL_COLORS.netProfit,
          backgroundColor: 'transparent',
          tension:         0.3,
          borderWidth:     2,
          borderDash:      [5, 3],
          pointRadius:     3,
          fill:            false,
        },
      ],
    },
    options: {
      ...CHART_OPTS,
      plugins: {
        legend: { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: tooltipLabel } },
      },
      scales: {
        x: { ...AXIS_STYLE },
        y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
      },
    },
  });
}

// ── Line: category comparison over months ────────────────────────────────────
function renderCompareChart(monthly) {
  destroyChart('compare');
  const ctx = document.getElementById('chart-compare');
  if (!ctx || !monthly.length) return;
  charts['compare'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels:   monthly.map(m => m.label),
      datasets: CAT_ORDER.map(c => ({
        label:           CAT_LABEL[c],
        data:            monthly.map(m => m[c] || 0),
        borderColor:     CAT_COLORS[c],
        backgroundColor: 'transparent',
        tension:         0.3,
        borderWidth:     2,
        pointRadius:     3,
      })),
    },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
      scales: {
        x: { ...AXIS_STYLE },
        y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
      },
    },
  });
}
