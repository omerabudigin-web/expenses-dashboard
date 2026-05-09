'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, d) { return (+n||0).toLocaleString('ar-SA', { minimumFractionDigits: d||0, maximumFractionDigits: d||0 }); }
function fmtPct(n) { return fmt(n, 1) + '%'; }
function esc(s)    { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function monthTotal(m) { return CAT_ORDER.reduce((s, c) => s + (m[c]||0), 0); }

// ── Tab routing ───────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(x => x.classList.add('hidden'));
  t.classList.add('active');
  document.getElementById('tab-' + t.dataset.tab).classList.remove('hidden');
  renderTab(t.dataset.tab);
}));

// ── Period helpers ────────────────────────────────────────────────────────────
function buildPeriodOptions(selId, includeAll) {
  const sel     = document.getElementById(selId);
  if (!sel) return;
  const monthly = State.get('monthly');
  const curVal  = sel.value;
  sel.innerHTML = includeAll ? '<option value="all">كل الفترة</option>' : '<option value="">كل الفترة</option>';
  [...new Set(monthly.map(m => m.month.slice(0,4)))].forEach(y => {
    const o = document.createElement('option'); o.value = 'year-' + y; o.textContent = 'سنة ' + y; sel.appendChild(o);
  });
  monthly.forEach(m => {
    const o = document.createElement('option'); o.value = m.month; o.textContent = m.label; sel.appendChild(o);
  });
  if (curVal && [...sel.options].some(o => o.value === curVal)) sel.value = curVal;
}

function filterMonthly(period) {
  const monthly = State.get('monthly');
  if (period === 'all' || !period) return monthly;
  if (period.startsWith('year-')) { const y = period.slice(5); return monthly.filter(m => m.month.startsWith(y)); }
  return monthly.filter(m => m.month === period);
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs(months) {
  const totals = {}; CAT_ORDER.forEach(c => { totals[c] = 0; });
  months.forEach(m => CAT_ORDER.forEach(c => { totals[c] += (m[c]||0); }));
  const grand  = CAT_ORDER.reduce((s, c) => s + totals[c], 0);
  const n      = months.length || 1;
  const topCat = CAT_ORDER.reduce((a, b) => totals[a] >= totals[b] ? a : b);
  const topMo  = months.reduce((a, b) => monthTotal(a) >= monthTotal(b) ? a : b, months[0] || {});
  const items  = [
    { lbl:'إجمالي المصروفات',   val: fmt(grand) + ' ر.س',         sub: 'الفترة المختارة',                                    accent:'#5baef0' },
    { lbl:'متوسط شهري',         val: fmt(grand/n) + ' ر.س',        sub: 'على ' + n + ' أشهر',                                accent:'#4ada8e' },
    { lbl:'أعلى شهر',           val: topMo.label || '—',           sub: fmt(monthTotal(topMo)) + ' ر.س',                     accent:'#da9a4a' },
    { lbl:'أعلى فئة',           val: CAT_LABEL[topCat] || '—',     sub: fmtPct(grand ? totals[topCat]/grand*100 : 0) + ' من الإجمالي', accent:'#da4ada' },
    { lbl:'رواتب وأجور',        val: fmt(totals.sal)  + ' ر.س',    sub: fmtPct(grand ? totals.sal/grand*100  : 0),           accent:'#4a9eda' },
    { lbl:'إيجار',              val: fmt(totals.rent) + ' ر.س',    sub: fmtPct(grand ? totals.rent/grand*100 : 0),           accent:'#4ada8e' },
    { lbl:'صيانة وتشغيل',      val: fmt(totals.maint)+ ' ر.س',    sub: fmtPct(grand ? totals.maint/grand*100: 0),           accent:'#da9a4a' },
    { lbl:'مصروفات إدارية',    val: fmt(totals.adm)  + ' ر.س',    sub: fmtPct(grand ? totals.adm/grand*100  : 0),           accent:'#4a7ada' },
  ];
  document.getElementById('kpi-area').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

// ── Analysis bullets ──────────────────────────────────────────────────────────
function renderAnalysis(months) {
  const totals = {}; CAT_ORDER.forEach(c => { totals[c] = 0; });
  months.forEach(m => CAT_ORDER.forEach(c => { totals[c] += (m[c]||0); }));
  const grand  = CAT_ORDER.reduce((s, c) => s + totals[c], 0);
  const sorted = [...months].sort((a, b) => monthTotal(b) - monthTotal(a));
  const topMo  = sorted[0]; const botMo = sorted[sorted.length - 1];
  const topCat = CAT_ORDER.reduce((a, b) => totals[a] >= totals[b] ? a : b);
  let growth = '—';
  if (months.length >= 2) {
    const last = monthTotal(months[months.length - 1]);
    const prev = monthTotal(months[months.length - 2]);
    const pct  = prev ? ((last - prev) / prev * 100).toFixed(1) : '—';
    growth = (last > prev ? 'ارتفعت' : 'انخفضت') + ' بنسبة ' + Math.abs(pct) + '% مقارنةً بـ ' + months[months.length - 2].label;
  }
  const lines = [
    'إجمالي المصروفات للفترة المختارة: <strong>' + fmt(grand) + ' ر.س</strong>',
    'أعلى شهر إنفاقاً: <strong>' + (topMo && topMo.label || '—') + '</strong> بإجمالي <strong>' + fmt(monthTotal(topMo||{})) + ' ر.س</strong>',
    'أدنى شهر إنفاقاً: <strong>' + (botMo && botMo.label || '—') + '</strong> بإجمالي <strong>' + fmt(monthTotal(botMo||{})) + ' ر.س</strong>',
    'أكبر فئة مصروفات: <strong>' + CAT_LABEL[topCat] + '</strong> بإجمالي <strong>' + fmt(totals[topCat]) + ' ر.س</strong> (' + fmtPct(grand ? totals[topCat]/grand*100 : 0) + ')',
    'آخر شهر في البيانات: <strong>' + (months[months.length - 1] && months[months.length - 1].label || '—') + '</strong> — ' + growth,
    'عدد الأشهر: <strong>' + months.length + '</strong> | متوسط شهري: <strong>' + fmt(grand / (months.length || 1)) + ' ر.س</strong>',
  ];
  document.getElementById('analysis-list').innerHTML = lines.map(l => `<li>${l}</li>`).join('');
}

// ── SUMMARY tab ───────────────────────────────────────────────────────────────
function initSummary() {
  document.getElementById('period-sel').addEventListener('change', function(e) { State.set('period', e.target.value); renderSummary(); });
  document.getElementById('cat-sel').addEventListener('change',   function(e) { State.set('cat',    e.target.value); renderSummary(); });
}

function renderSummary() {
  buildPeriodOptions('period-sel', true);
  let months = filterMonthly(State.get('period'));
  const cat  = State.get('cat');
  if (cat !== 'all') {
    months = months.map(m => {
      const n = Object.assign({}, m);
      CAT_ORDER.forEach(c => { if (c !== cat) n[c] = 0; });
      return n;
    });
  }
  renderKPIs(months);
  renderStackedBar(months);
  renderPie('chart-pie', 'pie', months);
  renderAnalysis(months);
}

// ── MONTHLY tab ───────────────────────────────────────────────────────────────
function renderMonthlyTab() {
  const monthly    = State.get('monthly');
  const catFilter  = (document.getElementById('mo-cat-sel') || {}).value || 'all';
  renderMonthlyChart(monthly, catFilter);
  const grandT = {}; CAT_ORDER.forEach(c => { grandT[c] = 0; });
  monthly.forEach(m => CAT_ORDER.forEach(c => { grandT[c] += (m[c]||0); }));
  const grand = CAT_ORDER.reduce((s, c) => s + grandT[c], 0);
  document.getElementById('mo-tbody').innerHTML =
    monthly.map(m => {
      const t = monthTotal(m);
      return `<tr><td>${m.label}</td>${CAT_ORDER.map(c => `<td class="num">${m[c] ? fmt(m[c]) : ''}</td>`).join('')}<td class="num"><strong>${fmt(t)}</strong></td></tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;font-weight:600"><td>الإجمالي</td>${CAT_ORDER.map(c => `<td class="num">${fmt(grandT[c])}</td>`).join('')}<td class="num">${fmt(grand)}</td></tr>`;
}

// ── ACCOUNTS tab ──────────────────────────────────────────────────────────────
function renderAccountsTab() {
  const accounts = State.get('accounts');
  const grand    = accounts.reduce((s, a) => s + a.total, 0);
  renderAccPie(accounts);
  const top8 = [...accounts].sort((a, b) => b.total - a.total).slice(0, 8);
  const maxV = top8[0] && top8[0].total || 1;
  document.getElementById('acc-bars').innerHTML = top8.map(a =>
    `<div class="prog-row"><div class="prog-label">${esc(a.name).slice(0,18)}</div>`
    + `<div class="prog-bar"><div class="prog-fill" style="width:${(a.total/maxV*100).toFixed(1)}%;background:${CAT_COLORS[a.cat]}"></div></div>`
    + `<div class="prog-val">${fmt(a.total)}</div></div>`
  ).join('');
  document.getElementById('acc-tbody').innerHTML = accounts.map(a =>
    `<tr><td style="font-family:monospace;font-size:.78rem">${esc(a.code)}</td><td>${esc(a.name)}</td>`
    + `<td><span class="badge b-${a.cat}">${CAT_LABEL[a.cat]}</span></td>`
    + `<td class="num">${fmt(a.total,2)}</td>`
    + `<td class="num">${fmtPct(grand ? a.total/grand*100 : 0)}</td></tr>`
  ).join('');
}

// ── BRANCHES tab ──────────────────────────────────────────────────────────────
function renderBranchesTab() {
  const monthly  = State.get('monthly');
  const branches = State.get('branches');
  const brData   = renderBranchBar(monthly, branches);
  renderBranchPie(brData);
  if (!brData) return;
  const { brs, hasData, brTotals, pivot, months } = brData;
  const grandTotal = hasData.reduce((s, b) => s + brTotals[b], 0);

  // Update month column headers dynamically
  const brTheadRow = document.querySelector('#tab-branches .tbl-wrap table thead tr');
  if (brTheadRow) {
    brTheadRow.innerHTML = '<th>الفرع</th>'
      + months.map(mo => { const m = monthly.find(x => x.month === mo); return `<th class="num">${m ? m.label : mo}</th>`; }).join('')
      + '<th class="num">الإجمالي</th>';
  }

  document.getElementById('br-tbody').innerHTML =
    hasData.map(b =>
      `<tr><td>${BRANCH_LABEL[b]}</td>${months.map(mo => `<td class="num">${pivot[b][mo] ? fmt(pivot[b][mo]) : ''}</td>`).join('')}<td class="num"><strong>${fmt(brTotals[b])}</strong></td></tr>`
    ).join('') +
    `<tr style="border-top:2px solid #3a5a7a;font-weight:600"><td>الإجمالي</td>${months.map(mo => `<td class="num">${fmt(brs.reduce((s,b) => s+pivot[b][mo], 0))}</td>`).join('')}<td class="num">${fmt(grandTotal)}</td></tr>`;
}

// ── ASSETS tab ────────────────────────────────────────────────────────────────
function renderAssetsTab() {
  const assets = State.get('assets') || [];
  document.getElementById('asset-tbody').innerHTML = assets.map(r =>
    `<tr><td>${r.name}</td>`
    + `<td class="num">${r.maint ? fmt(r.maint,2) : ''}</td>`
    + `<td class="num">${r.fuel  ? fmt(r.fuel,2)  : ''}</td>`
    + `<td class="num">${r.other ? fmt(r.other,2) : ''}</td>`
    + `<td class="num"><strong>${fmt(r.total,2)}</strong></td>`
    + `<td class="num">${r.count}</td></tr>`
  ).join('') || '<tr><td colspan="6" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات أصول</td></tr>';
}

// ── DETAILS tab ───────────────────────────────────────────────────────────────
function initDetails() {
  document.getElementById('det-search').addEventListener('input',  function(e) { State.set('detSearch', e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-cat').addEventListener('change',    function(e) { State.set('detCat',    e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-br').addEventListener('change',     function(e) { State.set('detBr',     e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-period').addEventListener('change', function(e) { State.set('detPeriod', e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-csv').addEventListener('click', exportCSV);
  document.querySelectorAll('#tab-details th[data-col]').forEach(th => {
    th.addEventListener('click', function() {
      const col  = +th.dataset.col;
      const sort = State.get('detSort');
      State.set('detSort', { col, dir: sort.col === col ? (sort.dir === 'asc' ? 'desc' : 'asc') : 'desc' });
      State.set('detPage', 1);
      API.fetchDetails();
    });
  });
}

function renderDetails() {
  buildPeriodOptions('det-period', false);
  const rows     = State.get('detailRows');
  const total    = State.get('detailTotal');
  const page     = State.get('detailPage');
  const pageSize = State.get('detPageSize');
  const pages    = Math.ceil(total / pageSize) || 1;

  document.getElementById('det-tbody').innerHTML = rows.map(d =>
    `<tr><td>${d[0]}</td>`
    + `<td><span class="badge b-${d[1]}">${CAT_LABEL[d[1]] || d[1]}</span></td>`
    + `<td style="font-family:monospace;font-size:.75rem">${esc(d[6])}</td>`
    + `<td>${esc(d[7])}</td>`
    + `<td>${BRANCH_LABEL[d[3]] || esc(d[3])}</td>`
    + `<td>${esc(d[4] || '')}</td>`
    + `<td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(d[5])}">${esc(d[5])}</td>`
    + `<td class="num">${fmt(d[2],2)}</td></tr>`
  ).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد نتائج</td></tr>';

  const pDiv = document.getElementById('det-pages');
  const btns = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) {
      btns.push(`<button class="page-btn${p === page ? ' active' : ''}" onclick="goPage(${p})">${p}</button>`);
    } else if (btns[btns.length - 1] !== '…') {
      btns.push('…');
    }
  }
  pDiv.innerHTML = btns.join('');
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to   = Math.min(page * pageSize, total);
  document.getElementById('det-count').textContent = `عرض ${from}–${to} من ${total.toLocaleString('ar-SA')} قيد`;
}

window.goPage = function(p) { State.set('detPage', p); API.fetchDetails(); };

async function exportCSV() {
  const total = State.get('detailTotal') || 0;
  const sort  = State.get('detSort');
  const qs    = new URLSearchParams({
    db:      State.get('activeDb') || '',
    page:    1,
    pageSize: Math.min(total, 10000),
    cat:     State.get('detCat'),
    branch:  State.get('detBr'),
    period:  State.get('detPeriod'),
    search:  State.get('detSearch'),
    sortCol: sort.col,
    sortDir: sort.dir,
  });
  let rows = State.get('detailRows');
  if (total > rows.length) {
    try {
      const res  = await fetch(`/api/details?${qs}`);
      const data = await res.json();
      rows = data.rows;
    } catch (e) { console.error('[csv] fetch error:', e); }
  }
  const hdr   = ['التاريخ','الفئة','المبلغ','الفرع','الأصل','الوصف','كود الحساب','اسم الحساب'];
  const lines = [hdr.join(',')].concat(rows.map(d => [
    d[0], CAT_LABEL[d[1]] || d[1], d[2], BRANCH_LABEL[d[3]] || d[3],
    `"${(d[4]||'').replace(/"/g,'""')}"`,
    `"${(d[5]||'').replace(/"/g,'""')}"`,
    d[6], `"${(d[7]||'').replace(/"/g,'""')}"`
  ].join(',')));
  const blob  = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = 'expenses_details.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── P&L tab ────────────────────────────────────────────────────────────────────

// Derive all computed P&L fields from a raw array of monthly objects
function aggregatePL(months) {
  const agg = { revenue: 0, cogs: 0, otherCost: 0, sal: 0, rent: 0, maint: 0, sell: 0, dist: 0, adm: 0, fin: 0, char: 0, oth: 0 };
  months.forEach(m => {
    agg.revenue   += m.revenue   || 0;
    agg.cogs      += m.cogs      || 0;
    agg.otherCost += m.otherCost || 0;
    agg.sal       += m.sal       || 0;
    agg.rent      += m.rent      || 0;
    agg.maint     += m.maint     || 0;
    agg.sell      += m.sell      || 0;
    agg.dist      += m.dist      || 0;
    agg.adm       += m.adm       || 0;
    agg.fin       += m.fin       || 0;
    agg.char      += m.char      || 0;
    agg.oth       += m.oth       || 0;
  });
  const totalCost       = agg.cogs + agg.otherCost;
  const grossProfit     = agg.revenue - totalCost;
  const totalOpex       = agg.sal + agg.rent + agg.maint + agg.sell + agg.dist + agg.adm + agg.fin + agg.char + agg.oth;
  const operatingProfit = grossProfit - totalOpex;
  const netProfit       = operatingProfit;
  const grossMargin     = agg.revenue ? grossProfit / agg.revenue * 100 : 0;
  const operatingMargin = agg.revenue ? operatingProfit / agg.revenue * 100 : 0;
  const netMargin       = agg.revenue ? netProfit / agg.revenue * 100 : 0;
  return { ...agg, totalCost, grossProfit, totalOpex, operatingProfit, netProfit, grossMargin, operatingMargin, netMargin };
}

function fmtPlNum(n) {
  if (n < 0) return '(' + fmt(Math.abs(n)) + ')';
  return fmt(n);
}

function marginBadge(pct) {
  const cls = pct >= 0 ? 'pl-margin-pos' : 'pl-margin-neg';
  return `<span class="pl-margin-badge ${cls}">${fmtPct(pct)}</span>`;
}

function renderPLKPIs(c) {
  const items = [
    { lbl: PL_LABELS.revenue,     val: fmt(c.revenue)     + ' ر.س', sub: c.revenue ? 'صافي المردودات'       : '—',                           accent: PL_COLORS.revenue },
    { lbl: PL_LABELS.grossProfit, val: fmtPlNum(c.grossProfit) + ' ر.س', sub: 'هامش ' + fmtPct(c.grossMargin),                                  accent: c.grossProfit >= 0 ? PL_COLORS.grossProfit : PL_COLORS.netLoss },
    { lbl: PL_LABELS.netProfit,   val: fmtPlNum(c.netProfit) + ' ر.س', sub: 'هامش ' + fmtPct(c.netMargin),                                   accent: c.netProfit >= 0 ? PL_COLORS.netProfit : PL_COLORS.netLoss },
  ];
  document.getElementById('pl-kpis').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

function renderPLStatement(c) {
  const profitClass = c.netProfit >= 0 ? 'pl-profit' : 'pl-loss';
  const gpClass     = c.grossProfit >= 0 ? 'pl-profit' : 'pl-loss';
  const rows = [
    // Revenue section
    `<tr class="pl-revenue"><td><strong>${PL_LABELS.revenue}</strong></td><td class="pl-num">${fmt(c.revenue)} ر.س</td><td class="pl-pct"></td></tr>`,
    `<tr class="pl-cogs"><td class="pl-indent">(-) ${PL_LABELS.cogs}</td><td class="pl-num">(${fmt(c.totalCost)}) ر.س</td><td class="pl-pct"></td></tr>`,
    `<tr class="pl-subtotal ${gpClass}"><td><strong>${PL_LABELS.grossProfit}</strong></td><td class="pl-num"><strong>${fmtPlNum(c.grossProfit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.grossMargin)}</td></tr>`,
    // OpEx section header
    `<tr><td colspan="3" class="pl-section">${PL_LABELS.opex}</td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.sal}</td>  <td class="pl-num">${c.sal  ? fmt(c.sal)  + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.rent}</td> <td class="pl-num">${c.rent ? fmt(c.rent) + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.maint}</td><td class="pl-num">${c.maint? fmt(c.maint)+ ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.sell}</td> <td class="pl-num">${c.sell ? fmt(c.sell) + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.dist}</td> <td class="pl-num">${c.dist ? fmt(c.dist) + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.adm}</td>  <td class="pl-num">${c.adm  ? fmt(c.adm)  + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.fin}</td>  <td class="pl-num">${c.fin  ? fmt(c.fin)  + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.char}</td> <td class="pl-num">${c.char ? fmt(c.char) + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr><td class="pl-indent">${CAT_LABEL.oth}</td>  <td class="pl-num">${c.oth  ? fmt(c.oth)  + ' ر.س' : '—'}</td><td></td></tr>`,
    `<tr class="pl-subtotal"><td><strong>${PL_LABELS.totalOpex}</strong></td><td class="pl-num"><strong>(${fmt(c.totalOpex)}) ر.س</strong></td><td></td></tr>`,
    // Operating income = Net profit (no non-operating items)
    `<tr class="pl-total ${profitClass}"><td><strong>${c.netProfit >= 0 ? PL_LABELS.netProfit : 'صافي الخسارة'}</strong></td><td class="pl-num"><strong>${fmtPlNum(c.netProfit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.netMargin)}</td></tr>`,
  ];
  document.getElementById('pl-statement').innerHTML = `<tbody>${rows.join('')}</tbody>`;
}

function renderPLMonthlyTable(plMonths) {
  document.getElementById('pl-monthly-tbody').innerHTML = plMonths.map(m => {
    const totalCost   = (m.cogs || 0) + (m.otherCost || 0);
    const grossProfit = m.revenue - totalCost;
    const totalOpex   = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    const netProfit   = grossProfit - totalOpex;
    const gm          = m.revenue ? grossProfit / m.revenue * 100 : 0;
    const nm          = m.revenue ? netProfit   / m.revenue * 100 : 0;
    const npClass     = netProfit >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    return `<tr>
      <td>${m.label}</td>
      <td class="num">${fmt(m.revenue)}</td>
      <td class="num">${fmt(totalCost)}</td>
      <td class="num" style="${grossProfit >= 0 ? 'color:#4ada8e' : 'color:#da4a4a'}">${fmtPlNum(grossProfit)}</td>
      <td class="num">${marginBadge(gm)}</td>
      <td class="num">${fmt(totalOpex)}</td>
      <td class="num" style="${npClass}">${fmtPlNum(netProfit)}</td>
      <td class="num">${marginBadge(nm)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';
}

function filterPL(period) {
  const pl = State.get('pl');
  if (period === 'all' || !period) return pl;
  if (period.startsWith('year-')) { const y = period.slice(5); return pl.filter(m => m.month.startsWith(y)); }
  return pl.filter(m => m.month === period);
}

function renderPLTab() {
  buildPeriodOptions('pl-period-sel', true);
  const period   = (document.getElementById('pl-period-sel') || {}).value || 'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) {
    document.getElementById('pl-kpis').innerHTML      = '';
    document.getElementById('pl-statement').innerHTML = '';
    document.getElementById('pl-monthly-tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات — في انتظار تحديث البيانات…</td></tr>';
    return;
  }
  const computed = aggregatePL(plMonths);
  renderPLKPIs(computed);
  renderPLWaterfall(computed);
  renderPLTrend(plMonths);
  renderPLStatement(computed);
  renderPLMonthlyTable(plMonths);
}

// ── COMPARE tab ───────────────────────────────────────────────────────────────
function renderCompareTab() {
  const monthly = State.get('monthly');
  renderCompareChart(monthly);
  document.getElementById('growth-tbody').innerHTML = monthly.map((m, i) => {
    const t    = monthTotal(m);
    const prev = i > 0 ? monthTotal(monthly[i-1]) : null;
    const diff = prev !== null ? t - prev : null;
    const pct  = prev ? (diff / prev * 100) : null;
    const arrow = diff === null ? '' : diff >= 0 ? '<span style="color:#4ada8e">▲</span>' : '<span style="color:#da4a4a">▼</span>';
    return `<tr><td>${m.label}</td><td class="num">${fmt(t)}</td><td class="num">${diff !== null ? arrow + ' ' + fmt(Math.abs(diff)) : '—'}</td><td class="num">${pct !== null ? fmtPct(Math.abs(pct)) : '—'}</td></tr>`;
  }).join('');
  document.getElementById('top-cat-tbody').innerHTML = monthly.map(m => {
    const t   = monthTotal(m);
    const top = CAT_ORDER.reduce((a, b) => (m[a]||0) >= (m[b]||0) ? a : b);
    return `<tr><td>${m.label}</td><td><span class="badge b-${top}">${CAT_LABEL[top]}</span></td><td class="num">${fmt(m[top]||0)}</td><td class="num">${fmtPct(t ? (m[top]||0)/t*100 : 0)}</td></tr>`;
  }).join('');
}

// ── Tab dispatcher ────────────────────────────────────────────────────────────
function renderTab(name) {
  if      (name === 'summary')  renderSummary();
  else if (name === 'monthly')  renderMonthlyTab();
  else if (name === 'accounts') renderAccountsTab();
  else if (name === 'branches') renderBranchesTab();
  else if (name === 'assets')   renderAssetsTab();
  else if (name === 'details')  renderDetails();
  else if (name === 'compare')  renderCompareTab();
  else if (name === 'pl')       renderPLTab();
}

// ── Connection status indicator ───────────────────────────────────────────────
function updateConnectionUI(connected, db) {
  const dot    = document.getElementById('db-status');
  const banner = document.getElementById('conn-banner');
  if (dot)    dot.style.background    = connected ? '#4ada8e' : '#da4a4a';
  if (banner) banner.style.display    = connected ? 'none' : 'block';
  const dbSel = document.getElementById('db-select');
  if (dbSel && db && dbSel.value !== db) dbSel.value = db;
}

// ── Reactive rendering on data changes ───────────────────────────────────────
State.on('monthly', () => {
  const active = document.querySelector('.tab.active');
  if (active) renderTab(active.dataset.tab);
  buildPeriodOptions('period-sel', true);
  buildPeriodOptions('det-period', false);
  buildPeriodOptions('pl-period-sel', true);
});

State.on('pl', () => {
  const active = document.querySelector('.tab.active');
  if (active && active.dataset.tab === 'pl') renderPLTab();
});

State.on('detailRows', () => {
  const active = document.querySelector('.tab.active');
  if (active && active.dataset.tab === 'details') renderDetails();
});

State.on('connected', val => {
  updateConnectionUI(val, State.get('activeDb'));
});

State.on('companyName', val => {
  const el = document.getElementById('company-name');
  if (el) el.textContent = val || '';
  if (val) document.title = 'تحليل المصروفات التشغيلية — ' + val;
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const config = await API.fetchConfig();

  // Populate DB dropdown
  const dbSel = document.getElementById('db-select');
  if (dbSel) {
    config.databases.forEach(name => {
      const o = document.createElement('option');
      o.value = name; o.textContent = name; dbSel.appendChild(o);
    });
    dbSel.value = config.defaultDb;
    dbSel.addEventListener('change', function(e) {
      SSEClient.switchDb(e.target.value);
    });
  }

  // Update header meta with start date
  const startEl = document.getElementById('data-start');
  if (startEl) startEl.textContent = config.dataStartDate;

  // Wire monthly tab category filter
  const moCatSel = document.getElementById('mo-cat-sel');
  if (moCatSel) moCatSel.addEventListener('change', renderMonthlyTab);

  initSummary();
  initDetails();

  // P&L period filter
  const plPeriodSel = document.getElementById('pl-period-sel');
  if (plPeriodSel) plPeriodSel.addEventListener('change', renderPLTab);

  // Subscribe to SSE events
  SSEClient.onSnapshot(() => {
    API.fetchDetails();
  });
  SSEClient.onStatus(({ connected, db }) => {
    updateConnectionUI(connected, db);
  });

  State.patch({ activeDb: config.defaultDb });
  SSEClient.start(config.defaultDb);
}

init();
