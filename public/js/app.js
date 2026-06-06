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
const Q_LABELS = ['الربع الأول','الربع الثاني','الربع الثالث','الربع الرابع'];
const qOf    = moStr => Math.ceil(+moStr.slice(5, 7) / 3);  // '2025-03' → 1
const CUR_Y  = () => new Date().getFullYear().toString();    // dynamic current year

function _addYtdOpt(sel, hasData) {
  if (!hasData) return;
  const o = document.createElement('option');
  o.value = 'ytd'; o.textContent = `من بداية ${CUR_Y()} إلى الآن`; sel.appendChild(o);
}

function buildPeriodOptions(selId, includeAll) {
  const sel     = document.getElementById(selId);
  if (!sel) return;
  const monthly = State.get('monthly');
  const curVal  = sel.value;
  sel.innerHTML = includeAll ? '<option value="all">كل الفترة</option>' : '<option value="">كل الفترة</option>';
  [...new Set(monthly.map(m => m.month.slice(0, 4)))].sort().forEach(y => {
    const isCur = y === CUR_Y();
    const oy = document.createElement('option');
    oy.value = isCur ? 'ytd' : 'year-' + y;
    oy.textContent = `من بداية ${y} إلى الآن`;
    sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      if (monthly.some(m => m.month.startsWith(y) && qOf(m.month) === q)) {
        const oq = document.createElement('option'); oq.value = `quarter-${y}-${q}`; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  monthly.forEach(m => {
    const o = document.createElement('option'); o.value = m.month; o.textContent = m.label; sel.appendChild(o);
  });
  if (curVal && [...sel.options].some(o => o.value === curVal)) sel.value = curVal;
}

function filterMonthly(period) {
  const monthly = State.get('monthly');
  if (period === 'all' || !period) return monthly;
  if (period === 'ytd')              return monthly.filter(m => m.month.startsWith(CUR_Y()));
  if (period.startsWith('year-'))    { const y = period.slice(5); return monthly.filter(m => m.month.startsWith(y)); }
  if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); return monthly.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
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
    { lbl:'أعلى فئة',           val: CAT_LABEL[topCat] || '—',     sub: fmt(totals[topCat]) + ' ر.س · ' + fmtPct(grand ? totals[topCat]/grand*100 : 0) + ' من الإجمالي', accent:'#da4ada' },
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

// Convert a period selector value to { start, end } ISO-date strings for API calls
function periodToDateRange(period) {
  const y0 = CUR_Y();
  if (period === 'all' || !period) return { start: null, end: null };
  if (period === 'ytd')            return { start: `${y0}-01-01`, end: null };
  if (period.startsWith('year-')) {
    const y = period.slice(5);
    return { start: `${y}-01-01`, end: `${+y + 1}-01-01` };
  }
  if (period.startsWith('quarter-')) {
    const [, y, q] = period.split('-');
    const sm = (+q - 1) * 3 + 1;
    const em = sm + 3;
    return {
      start: `${y}-${String(sm).padStart(2,'0')}-01`,
      end:   em > 12 ? `${+y + 1}-01-01` : `${y}-${String(em).padStart(2,'0')}-01`,
    };
  }
  // single month 'YYYY-MM'
  const [y, m] = period.split('-');
  const em = +m + 1;
  return {
    start: `${y}-${m}-01`,
    end:   em > 12 ? `${+y + 1}-01-01` : `${y}-${String(em).padStart(2,'0')}-01`,
  };
}

// ── MONTHLY tab ───────────────────────────────────────────────────────────────
function renderMonthlyTab() {
  buildPeriodOptions('mo-period-sel', true);
  const period    = (document.getElementById('mo-period-sel') || {}).value || 'all';
  const monthly   = filterMonthly(period);
  const catFilter = (document.getElementById('mo-cat-sel') || {}).value || 'all';
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
function _renderAccountsData(accounts) {
  const grand = accounts.reduce((s, a) => s + a.total, 0);
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

async function renderAccountsTab() {
  buildPeriodOptions('acc-period-sel', true);
  const period = (document.getElementById('acc-period-sel') || {}).value || 'all';
  if (period === 'all') {
    _renderAccountsData(State.get('accounts') || []);
    return;
  }
  const { start, end } = periodToDateRange(period);
  const db = State.get('activeDb') || '';
  const qs = new URLSearchParams({ db, start: start || '' });
  if (end) qs.set('end', end);
  try {
    const resp = await fetch(`/api/accounts?${qs}`);
    _renderAccountsData(await resp.json());
  } catch {
    _renderAccountsData(State.get('accounts') || []);
  }
}

// ── BRANCHES tab ──────────────────────────────────────────────────────────────
function renderBranchesTab() {
  buildPeriodOptions('br-period-sel', true);
  const period   = (document.getElementById('br-period-sel') || {}).value || 'all';
  const monthly  = filterMonthly(period);
  const branches = State.get('branches');
  const brData   = renderBranchBar(monthly, branches);
  renderBranchPie(brData);
  if (!brData) return;
  const { brs, hasData, brTotals, pivot, months } = brData;
  const grandTotal = hasData.reduce((s, b) => s + brTotals[b], 0);

  // Update month column headers dynamically
  const brTheadRow = document.querySelector('#br-tbody')?.closest('table')?.querySelector('thead tr');
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

  // ── Category breakdown pivot: rows=branches, cols=categories ──
  const CATS = CAT_ORDER; // ['sal','rent','maint','sell','dist','adm','fin','char','oth']

  // Aggregate branches data filtered to selected period months
  const filtMonths = new Set(monthly.map(m => m.month));
  const brCat = {}; // brCat[br][cat] = total
  (branches || []).forEach(r => {
    if (!filtMonths.has(r.month)) return;
    if (!brCat[r.br]) brCat[r.br] = {};
    CATS.forEach(cat => {
      brCat[r.br][cat] = (brCat[r.br][cat] || 0) + (r[cat] || 0);
    });
  });

  // Only show branches that have data
  const activeBrs = hasData.filter(b => brCat[b]);

  // Column totals across all branches
  const catTotals = {};
  CATS.forEach(cat => {
    catTotals[cat] = activeBrs.reduce((s, b) => s + (brCat[b]?.[cat] || 0), 0);
  });
  const catGrand = CATS.reduce((s, cat) => s + catTotals[cat], 0);

  // Build pivot table
  const thead = document.getElementById('br-cat-thead');
  const tbody = document.getElementById('br-cat-tbody');
  if (thead && tbody) {
    thead.innerHTML = `<tr>
      <th style="min-width:120px">الفرع</th>
      ${CATS.map(cat => `<th class="num" style="font-size:.74rem;white-space:nowrap">${CAT_LABEL[cat]}</th>`).join('')}
      <th class="num" style="font-weight:700">الإجمالي</th>
    </tr>`;

    const brTotal = b => CATS.reduce((s, cat) => s + (brCat[b]?.[cat] || 0), 0);

    tbody.innerHTML = activeBrs.map(b => {
      const tot = brTotal(b);
      return `<tr>
        <td style="font-weight:600;white-space:nowrap">${BRANCH_LABEL[b]}</td>
        ${CATS.map(cat => {
          const v = brCat[b]?.[cat] || 0;
          const pct = tot > 0 ? v / tot * 100 : 0;
          const barW = Math.min(100, pct).toFixed(1);
          return `<td class="num" style="position:relative;padding:6px 10px" title="${CAT_LABEL[cat]}: ${fmt(v)} ر.س (${pct.toFixed(1)}%)">
            ${v > 0 ? `<div style="position:absolute;bottom:0;right:0;height:3px;width:${barW}%;background:${CAT_COLORS[cat]};opacity:.5;border-radius:2px"></div>` : ''}
            <span style="color:${v > 0 ? CAT_COLORS[cat] : '#3a5a7a'}">${v > 0 ? fmt(v) : '—'}</span>
          </td>`;
        }).join('')}
        <td class="num" style="font-weight:700">${fmt(tot)}</td>
      </tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;background:#081828">
      <td style="font-weight:700">الإجمالي</td>
      ${CATS.map(cat => {
        const v = catTotals[cat];
        return `<td class="num" style="font-weight:600;color:${v > 0 ? '#c8e0f0' : '#3a5a7a'}">${v > 0 ? fmt(v) : '—'}</td>`;
      }).join('')}
      <td class="num" style="font-weight:700">${fmt(catGrand)}</td>
    </tr>`;
  }

  // ── Per-branch category mini-bar charts ──
  const chartsEl = document.getElementById('br-cat-charts');
  if (chartsEl) {
    chartsEl.innerHTML = activeBrs.map(b => {
      const tot = CATS.reduce((s, cat) => s + (brCat[b]?.[cat] || 0), 0);
      const bars = CATS
        .map(cat => ({ cat, v: brCat[b]?.[cat] || 0 }))
        .filter(x => x.v > 0)
        .sort((a, c) => c.v - a.v);
      return `<div style="background:#0a1e34;border-radius:10px;padding:14px 16px;border:1px solid #1e3a5f">
        <div style="font-weight:600;color:#c8e0f8;margin-bottom:10px;font-size:.84rem">${BRANCH_LABEL[b]}</div>
        <div style="font-size:.76rem;color:#5a7a9a;margin-bottom:8px">إجمالي: <strong style="color:#7ac8f0">${fmt(tot)} ر.س</strong></div>
        ${bars.map(x => {
          const pct = tot > 0 ? x.v / tot * 100 : 0;
          return `<div style="margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:.73rem">
              <span style="color:#8ab0cc">${CAT_LABEL[x.cat]}</span>
              <span style="color:${CAT_COLORS[x.cat]};font-variant-numeric:tabular-nums">${fmt(x.v)}</span>
            </div>
            <div style="background:#0e2540;border-radius:3px;height:5px">
              <div style="background:${CAT_COLORS[x.cat]};height:5px;border-radius:3px;width:${pct.toFixed(1)}%"></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  }
}

// ── ASSETS tab ────────────────────────────────────────────────────────────────
async function renderAssetsTab() {
  buildPeriodOptions('asset-period-sel', true);
  const period = (document.getElementById('asset-period-sel') || {}).value || 'all';
  let assets;
  if (period === 'all') {
    assets = State.get('assets') || [];
  } else {
    const db = State.get('db');
    const { start, end } = periodToDateRange(period);
    try {
      const url = `/api/assets?db=${encodeURIComponent(db)}`
        + (start ? `&start=${start}` : '')
        + (end   ? `&end=${end}`     : '');
      const resp = await fetch(url);
      assets = resp.ok ? await resp.json() : [];
    } catch { assets = []; }
  }
  const totMaint = assets.reduce((s, r) => s + (r.maint || 0), 0);
  const totFuel  = assets.reduce((s, r) => s + (r.fuel  || 0), 0);
  const totOther = assets.reduce((s, r) => s + (r.other || 0), 0);
  const totTotal = assets.reduce((s, r) => s + (r.total || 0), 0);
  const totCount = assets.reduce((s, r) => s + (r.count || 0), 0);

  const rows = assets.map(r =>
    `<tr><td>${r.name}</td>`
    + `<td class="num">${r.maint ? fmt(r.maint,2) : ''}</td>`
    + `<td class="num">${r.fuel  ? fmt(r.fuel,2)  : ''}</td>`
    + `<td class="num">${r.other ? fmt(r.other,2) : ''}</td>`
    + `<td class="num"><strong>${fmt(r.total,2)}</strong></td>`
    + `<td class="num">${r.count}</td></tr>`
  ).join('');

  const totalRow = assets.length
    ? `<tr style="border-top:2px solid #3a5a7a;background:#081828;font-weight:700">`
      + `<td>الإجمالي</td>`
      + `<td class="num">${totMaint ? fmt(totMaint,2) : ''}</td>`
      + `<td class="num">${totFuel  ? fmt(totFuel,2)  : ''}</td>`
      + `<td class="num">${totOther ? fmt(totOther,2) : ''}</td>`
      + `<td class="num">${fmt(totTotal,2)}</td>`
      + `<td class="num">${totCount}</td></tr>`
    : '';

  document.getElementById('asset-tbody').innerHTML =
    rows
      ? rows + totalRow
      : '<tr><td colspan="6" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات أصول</td></tr>';
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

// Returns info about the last month if its OpEx looks suspiciously low
// (< 60 % of the prior-months average) — signals an open / not-yet-closed month.
function detectOpenMonth(plMonths) {
  if (plMonths.length < 2) return null;
  const last  = plMonths[plMonths.length - 1];
  const prior = plMonths.slice(0, -1);

  const totalOpex = m => m.sal + m.rent + m.dist + m.adm + m.maint + m.sell + m.fin + m.char + m.oth;
  const avgOpex   = prior.reduce((s, m) => s + totalOpex(m), 0) / prior.length;
  const lastOpex  = totalOpex(last);
  if (lastOpex >= avgOpex * 0.6) return null;   // looks normal

  const avgSal  = prior.reduce((s, m) => s + m.sal,  0) / prior.length;
  const avgRent = prior.reduce((s, m) => s + m.rent, 0) / prior.length;
  const missing = [];
  if (last.sal  < avgSal  * 0.6) missing.push(`رواتب (متوسط ${fmt(avgSal)} ر.س، مُسجَّل ${fmt(last.sal)} ر.س)`);
  if (last.rent < avgRent * 0.3) missing.push(`إيجار (متوسط ${fmt(avgRent)} ر.س، مُسجَّل ${fmt(last.rent)} ر.س)`);

  return {
    label:       last.label,
    lastOpex,
    avgOpex,
    estMissing:  avgOpex - lastOpex,
    missing,
  };
}

function renderOpenMonthBanner(bannerId, plMonths) {
  const el = document.getElementById(bannerId);
  if (!el) return;
  const info = detectOpenMonth(plMonths);
  if (!info) { el.innerHTML = ''; return; }

  const missingList = info.missing.length
    ? `<ul style="margin:6px 0 0 0;padding:0 18px 0 0;font-size:13px">${info.missing.map(t => `<li>${t}</li>`).join('')}</ul>`
    : '';

  el.innerHTML = `
    <div style="
      display:flex;align-items:flex-start;gap:12px;
      background:rgba(218,154,74,0.12);border:1px solid rgba(218,154,74,0.45);
      border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#e8c07a;
      font-size:14px;line-height:1.6;
    ">
      <span style="font-size:20px;flex-shrink:0">⚠️</span>
      <div>
        <strong>شهر مفتوح — بيانات ${info.label} غير مكتملة</strong><br>
        <span style="color:#b0c4d8;font-size:13px">
          مصروفات ${info.label} البالغة ${fmt(info.lastOpex)} ر.س أقل بكثير من متوسط الأشهر السابقة
          (${fmt(info.avgOpex)} ر.س). الفرق المتوقع ≈ ${fmt(info.estMissing)} ر.س —
          القيود لم تُسجَّل بعد في النظام المحاسبي.
        </span>
        ${missingList}
        <span style="color:#7a9aba;font-size:12px;display:block;margin-top:4px">
          صافي الربح المعروض قد يكون مُبالَغاً فيه حتى يُقفَل الشهر.
        </span>
      </div>
    </div>`;
}

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
  const coreOpex        = agg.sal + agg.rent + agg.maint + agg.sell + agg.dist + agg.adm + agg.char + agg.oth;
  const ebit            = grossProfit - coreOpex;   // ربح تشغيلي قبل الفوائد
  const totalOpex       = coreOpex + agg.fin;
  const operatingProfit = grossProfit - totalOpex;
  const netProfit       = operatingProfit;
  const grossMargin     = agg.revenue ? grossProfit / agg.revenue * 100 : 0;
  const ebitMargin      = agg.revenue ? ebit       / agg.revenue * 100 : 0;
  const operatingMargin = agg.revenue ? operatingProfit / agg.revenue * 100 : 0;
  const netMargin       = agg.revenue ? netProfit / agg.revenue * 100 : 0;
  return { ...agg, totalCost, grossProfit, coreOpex, ebit, totalOpex, operatingProfit, netProfit, grossMargin, ebitMargin, operatingMargin, netMargin };
}

function fmtPlNum(n) {
  if (n < 0) return '(' + fmt(Math.abs(n)) + ')';
  return fmt(n);
}

function marginBadge(pct) {
  const cls = pct >= 0 ? 'pl-margin-pos' : 'pl-margin-neg';
  return `<span class="pl-margin-badge ${cls}">${fmtPct(pct)}</span>`;
}

function renderPLKPIs(c, cp) {
  const dBadge = (cur, prev) => {
    if (!cp || prev == null || Math.abs(prev) < 1) return '';
    const d = cur - prev; const pct = d / Math.abs(prev) * 100;
    const col = d >= 0 ? '#4ada8e' : '#da4a4a'; const arrow = d >= 0 ? '▲' : '▼';
    return `<span style="font-size:.68rem;color:${col};margin-right:5px">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  };
  const items = [
    { lbl: PL_LABELS.revenue,     val: fmt(c.revenue)+' ر.س',           sub: dBadge(c.revenue, cp?.revenue)+'100% من الإيراد',                                             accent: PL_COLORS.revenue },
    { lbl: PL_LABELS.grossProfit, val: fmtPlNum(c.grossProfit)+' ر.س',  sub: dBadge(c.grossProfit, cp?.grossProfit)+'هامش '+fmtPct(c.grossMargin),                        accent: c.grossProfit>=0?PL_COLORS.grossProfit:PL_COLORS.netLoss },
    { lbl: 'ربح التشغيل (EBIT)',  val: fmtPlNum(c.ebit)+' ر.س',         sub: dBadge(c.ebit, cp?.ebit)+'هامش '+fmtPct(c.ebitMargin),                                      accent: c.ebit>=0?'#4a9eda':'#da4a4a' },
    { lbl: PL_LABELS.netProfit,   val: fmtPlNum(c.netProfit)+' ر.س',    sub: dBadge(c.netProfit, cp?.netProfit)+'هامش '+fmtPct(c.netMargin),                             accent: c.netProfit>=0?PL_COLORS.netProfit:PL_COLORS.netLoss },
    { lbl: 'إجمالي المصروفات',    val: fmt(c.totalOpex)+' ر.س',         sub: dBadge(-c.totalOpex, cp?-cp.totalOpex:null)+(c.revenue>0?(c.totalOpex/c.revenue*100).toFixed(1)+'% من الإيراد':'—'), accent: '#da9a4a' },
    { lbl: 'فوائد بنكية',         val: fmt(c.fin)+' ر.س',               sub: c.revenue>0?(c.fin/c.revenue*100).toFixed(2)+'% من الإيراد':'—',                            accent: c.fin>c.revenue*0.02?'#da4a4a':'#da9a4a' },
  ];
  document.getElementById('pl-kpis').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

function renderPLStatement(c, cp) {
  const profitClass = c.netProfit >= 0 ? 'pl-profit' : 'pl-loss';
  const gpClass     = c.grossProfit >= 0 ? 'pl-profit' : 'pl-loss';
  const ebitClass   = c.ebit >= 0 ? 'pl-profit' : 'pl-loss';

  const pct = v => c.revenue > 0 ? (v / c.revenue * 100).toFixed(1) + '%' : '';
  const cmpCell = (cur, prev) => {
    if (!cp || prev == null) return '<td class="pl-pct"></td>';
    const d = cur - prev;
    if (Math.abs(d) < 1) return `<td class="pl-pct" style="color:#506070">—</td>`;
    const col = d >= 0 ? '#4ada8e' : '#da4a4a';
    return `<td class="pl-pct" style="color:${col};font-size:.75rem">${d > 0 ? '+' : ''}${fmt(d)}</td>`;
  };
  const miniBar = (v, col, maxV) => {
    if (!v || !maxV) return '';
    const w = Math.min(100, v / maxV * 100).toFixed(0);
    return `<div style="height:3px;border-radius:2px;background:#0a1e30;overflow:hidden;margin-top:3px"><div style="height:100%;border-radius:2px;background:${col};width:${w}%"></div></div>`;
  };
  const maxOpex = Math.max(c.sal, c.rent, c.maint, c.sell, c.dist, c.adm, c.fin, c.char, c.oth);

  const opexRow = (key, col) => {
    const v = c[key] || 0; if (!v) return '';
    return `<tr>
      <td class="pl-indent">${CAT_LABEL[key]}${miniBar(v, col, maxOpex)}</td>
      <td class="pl-num">${fmt(v)} ر.س</td>
      <td class="pl-pct">${pct(v)}</td>
      ${cmpCell(-v, cp ? -(cp[key]||0) : null)}
    </tr>`;
  };

  const hasComp = !!cp;
  const cmpHdr = hasComp ? '<th class="pl-pct" style="color:#506070;font-size:.75rem">Δ مقارنة</th>' : '';

  const rows = [
    `<thead><tr><th style="width:50%">البيان</th><th class="pl-num">المبلغ</th><th class="pl-pct">% إيراد</th>${cmpHdr}</tr></thead><tbody>`,
    `<tr class="pl-revenue"><td><strong>${PL_LABELS.revenue}</strong></td><td class="pl-num">${fmt(c.revenue)} ر.س</td><td class="pl-pct">${c.revenue?'100%':''}</td>${cmpCell(c.revenue, cp?.revenue)}</tr>`,
    `<tr class="pl-cogs"><td class="pl-indent">(-) ${PL_LABELS.cogs}</td><td class="pl-num">(${fmt(c.totalCost)}) ر.س</td><td class="pl-pct">${pct(c.totalCost)}</td>${cmpCell(-c.totalCost, cp?-cp.totalCost:null)}</tr>`,
    `<tr class="pl-subtotal ${gpClass}"><td><strong>${PL_LABELS.grossProfit}</strong></td><td class="pl-num"><strong>${fmtPlNum(c.grossProfit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.grossMargin)}</td>${cmpCell(c.grossProfit, cp?.grossProfit)}</tr>`,
    `<tr><td colspan="4" class="pl-section">المصروفات التشغيلية (قبل الفوائد)</td></tr>`,
    opexRow('sal',  '#5baef0'),
    opexRow('rent', '#4a9eda'),
    opexRow('maint','#6ab0d0'),
    opexRow('sell', '#4ada8e'),
    opexRow('dist', '#80d0a0'),
    opexRow('adm',  '#a0b0c0'),
    opexRow('char', '#8090a0'),
    opexRow('oth',  '#7080a0'),
    `<tr class="pl-subtotal"><td><strong>إجمالي المصروفات التشغيلية</strong></td><td class="pl-num"><strong>(${fmt(c.coreOpex)}) ر.س</strong></td><td class="pl-pct">${pct(c.coreOpex)}</td>${cmpCell(-c.coreOpex, cp?-cp.coreOpex:null)}</tr>`,
    `<tr class="pl-subtotal ${ebitClass}"><td><strong>ربح التشغيل قبل الفوائد (EBIT)</strong></td><td class="pl-num"><strong>${fmtPlNum(c.ebit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.ebitMargin)}</td>${cmpCell(c.ebit, cp?.ebit)}</tr>`,
    `<tr><td colspan="4" class="pl-section">تكاليف التمويل</td></tr>`,
    opexRow('fin',  '#da4a4a'),
    `<tr class="pl-subtotal"><td><strong>إجمالي تكاليف التمويل</strong></td><td class="pl-num"><strong>(${fmt(c.fin)}) ر.س</strong></td><td class="pl-pct">${pct(c.fin)}</td>${cmpCell(-c.fin, cp?-cp.fin:null)}</tr>`,
    `<tr class="pl-total ${profitClass}"><td><strong>${c.netProfit>=0?PL_LABELS.netProfit:'صافي الخسارة'}</strong></td><td class="pl-num"><strong>${fmtPlNum(c.netProfit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.netMargin)}</td>${cmpCell(c.netProfit, cp?.netProfit)}</tr>`,
    '</tbody>',
  ];
  document.getElementById('pl-statement').innerHTML = rows.join('');
}

function renderPLMonthlyTable(plMonths) {
  let prevNP = null;
  document.getElementById('pl-monthly-tbody').innerHTML = plMonths.map(m => {
    const totalCost   = (m.cogs||0) + (m.otherCost||0);
    const grossProfit = m.revenue - totalCost;
    const coreOpex    = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.char||0)+(m.oth||0);
    const ebit        = grossProfit - coreOpex;
    const fin         = m.fin || 0;
    const netProfit   = ebit - fin;
    const gm          = m.revenue ? grossProfit / m.revenue * 100 : 0;
    const em          = m.revenue ? ebit        / m.revenue * 100 : 0;
    const nm          = m.revenue ? netProfit   / m.revenue * 100 : 0;
    const npClass     = netProfit >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const ebitClass   = ebit >= 0 ? 'color:#4a9eda' : 'color:#da4a4a';
    let momCell = '<td class="num">—</td>';
    if (prevNP !== null && Math.abs(prevNP) > 1) {
      const d = netProfit - prevNP; const pct = d / Math.abs(prevNP) * 100;
      const col = d >= 0 ? '#4ada8e' : '#da4a4a';
      momCell = `<td class="num" style="color:${col};font-size:.75rem">${d>=0?'+':''}${pct.toFixed(1)}%</td>`;
    }
    prevNP = netProfit;
    return `<tr>
      <td>${m.label}</td>
      <td class="num">${fmt(m.revenue)}</td>
      <td class="num">${fmt(totalCost)}</td>
      <td class="num" style="${grossProfit>=0?'color:#4ada8e':'color:#da4a4a'}">${fmtPlNum(grossProfit)}</td>
      <td class="num">${marginBadge(gm)}</td>
      <td class="num">${fmt(coreOpex)}</td>
      <td class="num" style="${ebitClass}">${fmtPlNum(ebit)}</td>
      <td class="num" style="color:#da9a4a">${fin?fmt(fin):'—'}</td>
      <td class="num" style="${npClass}">${fmtPlNum(netProfit)}</td>
      <td class="num">${marginBadge(nm)}</td>
      ${momCell}
    </tr>`;
  }).join('') || '<tr><td colspan="11" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';
}

function filterPL(period) {
  const pl = State.get('pl');
  if (period === 'all' || !period) return pl;
  if (period === 'ytd')              return pl.filter(m => m.month.startsWith(CUR_Y()));
  if (period.startsWith('year-'))    { const y = period.slice(5); return pl.filter(m => m.month.startsWith(y)); }
  if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); return pl.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
  return pl.filter(m => m.month === period);
}

function getPriorPeriodPL(period) {
  const pl = State.get('pl');
  if (!pl || !period || period === 'all') return null;
  if (period === 'ytd') {
    const prevY = String(+CUR_Y() - 1);
    const rows = pl.filter(m => m.month.startsWith(prevY));
    return rows.length ? rows : null;
  }
  if (period.startsWith('year-')) {
    const rows = pl.filter(m => m.month.startsWith(String(+period.slice(5) - 1)));
    return rows.length ? rows : null;
  }
  if (period.startsWith('quarter-')) {
    const [, y, q] = period.split('-');
    const prevY = +q === 1 ? +y - 1 : +y;
    const prevQ = +q === 1 ? 4 : +q - 1;
    const rows = pl.filter(m => m.month.startsWith(String(prevY)) && qOf(m.month) === prevQ);
    return rows.length ? rows : null;
  }
  // single month → same month prior year
  const [y, mo] = period.split('-');
  const rows = pl.filter(m => m.month === `${+y - 1}-${mo}`);
  return rows.length ? rows : null;
}

function renderPLTab() {
  buildPeriodOptions('pl-period-sel', true);
  const period   = (document.getElementById('pl-period-sel') || {}).value || 'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) {
    document.getElementById('pl-kpis').innerHTML      = '';
    document.getElementById('pl-statement').innerHTML = '';
    document.getElementById('pl-monthly-tbody').innerHTML = '<tr><td colspan="11" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات — في انتظار تحديث البيانات…</td></tr>';
    return;
  }
  const computed  = aggregatePL(plMonths);
  const priorRows = getPriorPeriodPL(period);
  const priorComp = priorRows ? aggregatePL(priorRows) : null;

  // Prior period label for period label span
  const lblEl = document.getElementById('pl-period-label');
  if (lblEl) lblEl.textContent = priorComp ? `مقارنة بنفس الفترة السابقة` : '';

  renderOpenMonthBanner('pl-open-month-banner', plMonths);
  renderPLKPIs(computed, priorComp);
  renderPLWaterfall(computed);
  renderPLTrend(plMonths);
  renderPLStatement(computed, priorComp);
  renderPLMonthlyTable(plMonths);
}

// ── P&L exports ───────────────────────────────────────────────────────────────
function buildPLHTMLReport(c, cp, plMonths, period) {
  const periodLabel = period === 'all' ? 'كل الفترة' : period === 'ytd' ? `السنة الجارية ${CUR_Y()}` : period;
  const pct = (v, base) => base > 0 ? (v / base * 100).toFixed(1) + '%' : '—';
  const fmtD = (cur, prev) => {
    if (!cp || prev == null || Math.abs(prev) < 1) return '';
    const d = cur - prev; const p = d / Math.abs(prev) * 100;
    return `<span style="color:${d>=0?'#1a7a4a':'#8a1010'};font-size:.75rem"> (${d>=0?'+':''}${p.toFixed(1)}%)</span>`;
  };
  const opexItems = [
    { lbl: CAT_LABEL.sal,  v: c.sal  }, { lbl: CAT_LABEL.rent, v: c.rent },
    { lbl: CAT_LABEL.maint,v: c.maint}, { lbl: CAT_LABEL.sell, v: c.sell },
    { lbl: CAT_LABEL.dist, v: c.dist }, { lbl: CAT_LABEL.adm,  v: c.adm  },
    { lbl: CAT_LABEL.char, v: c.char }, { lbl: CAT_LABEL.oth,  v: c.oth  },
  ].filter(x => x.v > 0);

  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>قائمة الدخل — ${periodLabel}</title>
<style>
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:0;padding:20px;background:#fff;color:#222;direction:rtl}
  h1{font-size:1.4rem;border-bottom:3px solid #1a4a8a;padding-bottom:10px;color:#1a4a8a;margin-bottom:6px}
  .meta{font-size:.78rem;color:#666;margin-bottom:20px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px}
  .kpi{background:#f0f4fa;border-radius:8px;padding:12px 16px;border-right:4px solid #1a4a8a}
  .kpi .lbl{font-size:.74rem;color:#557;margin-bottom:4px}
  .kpi .val{font-size:1.1rem;font-weight:700;color:#1a4a8a}
  .kpi .sub{font-size:.72rem;color:#779;margin-top:3px}
  table{width:100%;border-collapse:collapse;font-size:.82rem}
  th{background:#1a4a8a;color:#fff;padding:8px 10px;text-align:right;font-weight:600}
  td{padding:7px 10px;border-bottom:1px solid #e0e8f0}
  .section td{background:#e8f0fb;font-weight:700;color:#1a4a8a;font-size:.85rem;padding:8px 10px}
  .subtotal td{background:#f5f8ff;font-weight:600;border-top:2px solid #cde}
  .total td{background:#1a4a8a;color:#fff;font-weight:700;font-size:.95rem}
  .indent{padding-right:24px !important}
  .num{text-align:left}
  .pos{color:#1a7a4a}.neg{color:#8a1010}
  .bar-bg{height:4px;background:#e0e8f0;border-radius:2px;overflow:hidden;margin-top:3px}
  .bar-fill{height:100%;border-radius:2px}
  @media print{body{padding:10px}}
</style></head><body>
<h1>📋 قائمة الدخل</h1>
<div class="meta">الفترة: ${periodLabel} &nbsp;|&nbsp; ${plMonths.length} شهر &nbsp;|&nbsp; تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
<div class="kpis">
  ${[
    { lbl:'إجمالي الإيرادات', val:fmt(c.revenue)+' ر.س', sub:'100% من الإيراد' },
    { lbl:'مجمل الربح',      val:fmtPlNum(c.grossProfit)+' ر.س', sub:'هامش '+fmtPct(c.grossMargin) },
    { lbl:'ربح التشغيل (EBIT)', val:fmtPlNum(c.ebit)+' ر.س', sub:'هامش '+fmtPct(c.ebitMargin) },
    { lbl:'صافي الربح / الخسارة', val:fmtPlNum(c.netProfit)+' ر.س', sub:'هامش '+fmtPct(c.netMargin) },
    { lbl:'إجمالي المصروفات', val:fmt(c.totalOpex)+' ر.س', sub:pct(c.totalOpex,c.revenue)+' من الإيراد' },
    { lbl:'الفوائد البنكية',   val:fmt(c.fin)+' ر.س', sub:pct(c.fin,c.revenue)+' من الإيراد' },
  ].map(k=>`<div class="kpi"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('')}
</div>
<table>
  <thead><tr><th style="width:50%">البيان</th><th class="num">المبلغ (ر.س)</th><th class="num">% إيراد</th>${cp?'<th class="num">Δ مقارنة</th>':''}</tr></thead>
  <tbody>
    <tr><td><strong>الإيرادات</strong></td><td class="num">${fmt(c.revenue)}</td><td class="num">100%</td>${cp?`<td class="num">${fmtD(c.revenue,cp.revenue)}</td>`:''}</tr>
    <tr><td class="indent">(-) تكلفة المبيعات</td><td class="num">(${fmt(c.totalCost)})</td><td class="num">${pct(c.totalCost,c.revenue)}</td>${cp?`<td class="num">${fmtD(-c.totalCost,-cp.totalCost)}</td>`:''}</tr>
    <tr class="subtotal"><td><strong>مجمل الربح</strong></td><td class="num ${c.grossProfit>=0?'pos':'neg'}">${fmtPlNum(c.grossProfit)}</td><td class="num">${fmtPct(c.grossMargin)}</td>${cp?`<td class="num">${fmtD(c.grossProfit,cp.grossProfit)}</td>`:''}</tr>
    <tr class="section"><td colspan="${cp?4:3}">المصروفات التشغيلية (قبل الفوائد)</td></tr>
    ${opexItems.map(x=>`<tr><td class="indent">${x.lbl}</td><td class="num">${fmt(x.v)}</td><td class="num">${pct(x.v,c.revenue)}</td>${cp?`<td class="num">${fmtD(-x.v,-(cp[opexItems.indexOf(x)]?.v||x.v))}</td>`:''}</tr>`).join('')}
    <tr class="subtotal"><td><strong>إجمالي المصروفات التشغيلية</strong></td><td class="num">(${fmt(c.coreOpex)})</td><td class="num">${pct(c.coreOpex,c.revenue)}</td>${cp?`<td class="num">${fmtD(-c.coreOpex,-cp.coreOpex)}</td>`:''}</tr>
    <tr class="subtotal"><td><strong>ربح التشغيل قبل الفوائد (EBIT)</strong></td><td class="num ${c.ebit>=0?'pos':'neg'}">${fmtPlNum(c.ebit)}</td><td class="num">${fmtPct(c.ebitMargin)}</td>${cp?`<td class="num">${fmtD(c.ebit,cp.ebit)}</td>`:''}</tr>
    <tr class="section"><td colspan="${cp?4:3}">تكاليف التمويل</td></tr>
    <tr><td class="indent">(-) فوائد بنكية ومصرفية</td><td class="num">(${fmt(c.fin)})</td><td class="num">${pct(c.fin,c.revenue)}</td>${cp?`<td class="num">${fmtD(-c.fin,-cp.fin)}</td>`:''}</tr>
    <tr class="total"><td><strong>${c.netProfit>=0?'صافي الربح':'صافي الخسارة'}</strong></td><td class="num">${fmtPlNum(c.netProfit)}</td><td class="num">${fmtPct(c.netMargin)}</td>${cp?`<td class="num">${fmtD(c.netProfit,cp.netProfit)}</td>`:''}</tr>
  </tbody>
</table>
<div style="margin-top:28px">
  <table>
    <thead><tr><th>الشهر</th><th class="num">الإيراد</th><th class="num">مجمل الربح</th><th class="num">ه.إجمالي</th><th class="num">EBIT</th><th class="num">الفوائد</th><th class="num">صافي الربح</th><th class="num">ه.صافي</th></tr></thead>
    <tbody>
      ${plMonths.map(m=>{
        const tc=((m.cogs||0)+(m.otherCost||0));const gp=m.revenue-tc;
        const co=(m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.char||0)+(m.oth||0);
        const ebit=gp-co;const np=ebit-(m.fin||0);
        const gm=m.revenue?gp/m.revenue*100:0;const nm=m.revenue?np/m.revenue*100:0;
        return `<tr><td>${m.label||m.month}</td><td class="num">${fmt(m.revenue)}</td><td class="num ${gp>=0?'pos':'neg'}">${fmtPlNum(gp)}</td><td class="num">${gm.toFixed(1)}%</td><td class="num ${ebit>=0?'pos':'neg'}">${fmtPlNum(ebit)}</td><td class="num">${m.fin?fmt(m.fin):'—'}</td><td class="num ${np>=0?'pos':'neg'}">${fmtPlNum(np)}</td><td class="num">${nm.toFixed(1)}%</td></tr>`;
      }).join('')}
    </tbody>
  </table>
</div>
</body></html>`;
}

function exportPLHTML() {
  const period = (document.getElementById('pl-period-sel')||{}).value||'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) { alert('لا توجد بيانات'); return; }
  const c = aggregatePL(plMonths);
  const cp = getPriorPeriodPL(period) ? aggregatePL(getPriorPeriodPL(period)) : null;
  const html = buildPLHTMLReport(c, cp, plMonths, period);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type:'text/html;charset=utf-8' }));
  const lbl = period === 'all' ? 'all' : period;
  a.download = `pl-${lbl}.html`;
  a.click();
}

function printPLPDF() {
  const period = (document.getElementById('pl-period-sel')||{}).value||'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) { alert('لا توجد بيانات'); return; }
  const c = aggregatePL(plMonths);
  const cp = getPriorPeriodPL(period) ? aggregatePL(getPriorPeriodPL(period)) : null;
  const html = buildPLHTMLReport(c, cp, plMonths, period);
  const w = window.open('', '_blank', 'width=1000,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportPLExcel() {
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }
  const period = (document.getElementById('pl-period-sel')||{}).value||'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) { alert('لا توجد بيانات'); return; }
  const c  = aggregatePL(plMonths);
  const cp = getPriorPeriodPL(period) ? aggregatePL(getPriorPeriodPL(period)) : null;
  const periodLabel = period === 'all' ? 'كل الفترة' : period === 'ytd' ? `السنة ${CUR_Y()}` : period;

  const wb = new ExcelJS.Workbook(); wb.creator = 'MekSoft Expenses Dashboard';

  const hdr = (ws, cols) => {
    const row = ws.addRow(cols.map(c => c.h));
    row.eachCell(cell => { cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1A4A8A'}}; cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10}; cell.alignment={horizontal:'center'}; });
    cols.forEach((c, i) => { ws.getColumn(i+1).width = c.w||16; });
  };

  // Sheet 1: قائمة الدخل
  const ws1 = wb.addWorksheet('قائمة الدخل'); ws1.views=[{rightToLeft:true}];
  ws1.addRow([`قائمة الدخل — ${periodLabel}`]).getCell(1).font={bold:true,size:13,color:{argb:'FF1A4A8A'}};
  ws1.addRow([]);
  const s1Cols = cp
    ? [{h:'البيان',w:35},{h:'الفترة الحالية',w:18},{h:'% إيراد',w:12},{h:'الفترة السابقة',w:18},{h:'Δ المبلغ',w:18},{h:'Δ %',w:12}]
    : [{h:'البيان',w:35},{h:'المبلغ',w:18},{h:'% إيراد',w:12}];
  hdr(ws1, s1Cols);
  const addStmt = (lbl, cur, prev, isNeg) => {
    const v = isNeg ? -cur : cur; const pv = prev != null ? (isNeg ? -prev : prev) : null;
    const pct = c.revenue > 0 ? (Math.abs(cur)/c.revenue*100).toFixed(1)+'%' : '—';
    const row = cp
      ? ws1.addRow([lbl, v, pct, pv != null ? pv : '—', pv != null ? v - pv : '—', pv && Math.abs(pv)>1 ? ((v-pv)/Math.abs(pv)*100).toFixed(1)+'%' : '—'])
      : ws1.addRow([lbl, v, pct]);
    return row;
  };
  addStmt('الإيرادات',               c.revenue,    cp?.revenue);
  addStmt('(-) تكلفة المبيعات',      c.totalCost,  cp?.totalCost, true);
  addStmt('مجمل الربح',             c.grossProfit, cp?.grossProfit).font={bold:true};
  ws1.addRow(['المصروفات التشغيلية']).getCell(1).font={bold:true,color:{argb:'FF1A4A8A'}};
  [['sal',CAT_LABEL.sal],['rent',CAT_LABEL.rent],['maint',CAT_LABEL.maint],['sell',CAT_LABEL.sell],['dist',CAT_LABEL.dist],['adm',CAT_LABEL.adm],['char',CAT_LABEL.char],['oth',CAT_LABEL.oth]]
    .filter(([k])=>c[k]>0).forEach(([k,lbl]) => addStmt(lbl, c[k], cp?.[k], true));
  addStmt('إجمالي المصروفات التشغيلية', c.coreOpex, cp?.coreOpex, true).font={bold:true};
  addStmt('ربح التشغيل قبل الفوائد (EBIT)', c.ebit, cp?.ebit).font={bold:true};
  ws1.addRow(['تكاليف التمويل']).getCell(1).font={bold:true,color:{argb:'FF8A1010'}};
  addStmt('(-) فوائد بنكية', c.fin, cp?.fin, true);
  addStmt(c.netProfit>=0?'صافي الربح':'صافي الخسارة', c.netProfit, cp?.netProfit).font={bold:true,size:11};

  // Sheet 2: التفصيل الشهري
  const ws2 = wb.addWorksheet('التفصيل الشهري'); ws2.views=[{rightToLeft:true}];
  ws2.addRow([`الأداء الشهري — ${periodLabel}`]).getCell(1).font={bold:true,size:13,color:{argb:'FF1A4A8A'}};
  ws2.addRow([]);
  hdr(ws2,[{h:'الشهر',w:14},{h:'الإيرادات',w:16},{h:'ت.المبيعات',w:16},{h:'مجمل الربح',w:16},{h:'ه.إجمالي%',w:13},{h:'م.تشغيلية',w:16},{h:'EBIT',w:16},{h:'فوائد',w:14},{h:'صافي الربح',w:16},{h:'ه.صافي%',w:13}]);
  plMonths.forEach(m => {
    const tc=(m.cogs||0)+(m.otherCost||0); const gp=m.revenue-tc;
    const co=(m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.char||0)+(m.oth||0);
    const ebit=gp-co; const np=ebit-(m.fin||0);
    ws2.addRow([m.label||m.month, m.revenue, tc, gp, m.revenue?(gp/m.revenue*100).toFixed(1)+'%':'—', co, ebit, m.fin||0, np, m.revenue?(np/m.revenue*100).toFixed(1)+'%':'—']);
  });

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download=`pl-${period}.xlsx`; a.click();
}

// ── BALANCE SHEET tab ─────────────────────────────────────────────────────────

// Build monthly totals for chart + table.
// retained = 30102 balance + cumulative net income (changes with P&L every month).
// monthlyNI = change in retained month-over-month = that month's P&L net income.
function bsMonthlyTotals(bsRows) {
  const monthSet = [...new Set(bsRows.map(r => r.month))].sort();
  const result = monthSet.map(mo => {
    const rows     = bsRows.filter(r => r.month === mo);
    const label    = (rows[0] && rows[0].label) || mo;
    const assets   = rows.filter(r => r.code3[0]==='1').reduce((s,r)=>s+r.balance,0);
    const fixedA   = rows.filter(r => r.code3[0]==='1' && r.code3!=='103').reduce((s,r)=>s+r.balance,0);
    const currA    = rows.filter(r => r.code3==='103').reduce((s,r)=>s+r.balance,0);
    const liabs    = rows.filter(r => r.code3[0]==='2').reduce((s,r)=>s-r.balance,0);
    const currL    = rows.filter(r => r.code3==='201').reduce((s,r)=>s-r.balance,0);
    const capRow   = rows.find(r => r.grpCode==='30101');
    const capital  = capRow ? -capRow.balance : 0;
    const ret3     = rows.filter(r => r.code3[0]==='3' && r.grpCode!=='30101').reduce((s,r)=>s-r.balance,0);
    const cumNI    = assets - liabs - capital - ret3;
    const retained = ret3 + cumNI;
    const totalEquity   = capital + retained;
    const workingCapital = currA - currL;
    const currentRatio   = currL > 0 ? currA / currL : null;
    const debtRatio      = assets > 0 ? liabs / assets * 100 : null;
    return { month: mo, label, assets, fixedAssets: fixedA, currentAssets: currA, liabs, currL, capital, retained, totalEquity, workingCapital, currentRatio, debtRatio };
  });
  result.forEach((m, i) => {
    m.monthlyNI = i === 0 ? m.retained : m.retained - result[i - 1].retained;
  });
  return result;
}

// Group an array of { grpCode, grpName, balance, code3 } by code3
function bsBySection(rows) {
  const map = {};
  rows.forEach(r => {
    if (!map[r.code3]) map[r.code3] = [];
    map[r.code3].push(r);
  });
  return map;
}

function buildBSPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('bs-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const yMs = months.filter(m => m.startsWith(y));
    const oy  = document.createElement('option'); oy.value = yMs[yMs.length - 1]; oy.textContent = `من بداية ${y} إلى الآن`; sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      const qMs = yMs.filter(m => qOf(m) === q);
      if (qMs.length) {
        const oq = document.createElement('option'); oq.value = qMs[qMs.length - 1]; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o   = document.createElement('option'); o.value = mo; o.textContent = row ? row.label : mo; sel.appendChild(o);
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || '';
}

let _bsfFormalMode = false;

function renderBS() {
  const bs = State.get('bs');
  const empty = id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات…</td></tr>';
  };

  if (!bs || !bs.length) {
    ['bs-assets-body','bs-le-body'].forEach(empty);
    ['bs-kpis','bs-monthly-tbody'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=''; });
    return;
  }

  initBSFormal();
  buildBSPeriodOptions();

  const selMo  = (document.getElementById('bs-period-sel') || {}).value || '';
  const months = [...new Set(bs.map(r => r.month))].sort();
  const asOf   = selMo || months[months.length - 1] || '';
  const rows   = bs.filter(r => r.month === asOf);
  const label  = (rows[0] && rows[0].label) || asOf;

  // ── Totals for selected month ──
  const assets     = rows.filter(r => r.code3[0]==='1');
  const liabs      = rows.filter(r => r.code3[0]==='2');
  const equity     = rows.filter(r => r.code3[0]==='3');
  const totalA      = assets.reduce((s,r)=>s+r.balance,0);
  const totalL      = liabs.reduce((s,r)=>s-r.balance,0);
  const equity3     = equity.reduce((s,r)=>s-r.balance,0);
  const netIncome   = totalA - totalL - equity3;
  const totalE      = equity3 + netIncome;   // always = totalA - totalL

  // ── Compute capital / retained / monthlyNI using same logic as bsMonthlyTotals ──
  const capRow2   = equity.find(r => r.grpCode === '30101');
  const capital   = capRow2 ? -capRow2.balance : 0;
  const ret3      = equity.filter(r => r.grpCode !== '30101').reduce((s,r) => s - r.balance, 0);
  const cumNI     = totalA - totalL - capital - ret3;
  const retained  = ret3 + cumNI;                    // أرباح مبقاة آخر الشهر

  // Previous month retained (for monthly P&L)
  const prevMo    = months[months.indexOf(asOf) - 1];
  const prevRows  = prevMo ? bs.filter(r => r.month === prevMo) : [];
  const prevCapR  = prevRows.find(r => r.grpCode === '30101');
  const prevCap   = prevCapR ? -prevCapR.balance : 0;
  const prevRet3  = prevRows.filter(r => r.code3[0]==='3' && r.grpCode!=='30101').reduce((s,r)=>s-r.balance,0);
  const prevA     = prevRows.filter(r=>r.code3[0]==='1').reduce((s,r)=>s+r.balance,0);
  const prevL     = prevRows.filter(r=>r.code3[0]==='2').reduce((s,r)=>s-r.balance,0);
  const prevCumNI = prevRows.length ? prevA - prevL - prevCap - prevRet3 : 0;
  const prevRetained = prevRet3 + prevCumNI;
  const monthlyNI = prevRows.length ? retained - prevRetained : retained;

  // ── Current ratio + equity ratio for KPIs ──
  const currA = rows.filter(r => r.code3 === '103').reduce((s,r) => s + r.balance, 0);
  const currL = rows.filter(r => r.code3 === '201').reduce((s,r) => s - r.balance, 0);
  const currentRatioBs = currL > 0 ? currA / currL : null;
  const equityRatioBs  = totalA > 0 ? totalE / totalA * 100 : null;

  // ── Delta helpers for comparison column ──
  const prevBalMap = {};
  prevRows.forEach(r => { prevBalMap[r.grpCode] = r.balance; });
  const fmtΔ = (displayCurr, displayPrev) => {
    if (!prevRows.length || displayPrev === undefined) return '';
    const d = displayCurr - displayPrev;
    if (Math.abs(d) < 1) return '';
    const col = d > 0 ? '#4ada8e' : '#da4a4a';
    const pct = displayPrev !== 0 ? ` (${d > 0 ? '+' : ''}${(d / Math.abs(displayPrev) * 100).toFixed(1)}%)` : '';
    return `<br><span style="font-size:.70rem;color:${col}">${d > 0 ? '+' : ''}${fmt(d)}${pct}</span>`;
  };

  // ── AsOf header ──
  const asOfEl = document.getElementById('bs-asof');
  if (asOfEl) asOfEl.textContent = 'كما في نهاية: ' + label;

  // ── Extra ratios for KPIs ──
  const workingCapital = currA - currL;
  const debtRatio      = totalA > 0 ? totalL / totalA * 100 : null;
  const prevCurrA      = prevRows.filter(r => r.code3 === '103').reduce((s,r) => s + r.balance, 0);
  const prevCurrL      = prevRows.filter(r => r.code3 === '201').reduce((s,r) => s - r.balance, 0);
  const prevWC         = prevRows.length ? prevCurrA - prevCurrL : null;
  const wcΔ = prevWC !== null ? (() => { const d = workingCapital - prevWC; const col = d >= 0 ? '#4ada8e' : '#da4a4a'; return `<br><span style="font-size:.70rem;color:${col}">${d >= 0 ? '+' : ''}${fmt(d)}</span>`; })() : '';

  // ── KPIs ──
  document.getElementById('bs-kpis').innerHTML = [
    { lbl:'إجمالي الأصول',         val:fmt(totalA)        +' ر.س', accent:'#5baef0' },
    { lbl:'إجمالي الخصوم',         val:fmt(totalL)        +' ر.س', accent:'#da4a4a' },
    { lbl:'حقوق الملكية',          val:fmtPlNum(totalE)   +' ر.س', accent:totalE>=0?'#4ada8e':'#da4a4a' },
    { lbl:'ربح / خسارة الشهر',     val:fmtPlNum(monthlyNI)+' ر.س', accent:monthlyNI>=0?'#4ada8e':'#da4a4a' },
    { lbl:'النسبة الجارية',        val:currentRatioBs !== null ? currentRatioBs.toFixed(2)+'×' : '—',
      accent:currentRatioBs===null?'#5a7a9a':currentRatioBs>=1.5?'#4ada8e':currentRatioBs>=1?'#da9a4a':'#da4a4a' },
    { lbl:'نسبة الملكية / الأصول', val:equityRatioBs  !== null ? equityRatioBs.toFixed(1)+'%'  : '—',
      accent:equityRatioBs===null ?'#5a7a9a':equityRatioBs>=50 ?'#4ada8e':equityRatioBs>=30 ?'#da9a4a':'#da4a4a' },
    { lbl:'رأس المال العامل',      val:fmtPlNum(workingCapital)+' ر.س'+wcΔ,
      accent:workingCapital>=0?'#4a9eda':'#da4a4a' },
    { lbl:'نسبة الاستدانة',        val:debtRatio !== null ? debtRatio.toFixed(1)+'%' : '—',
      accent:debtRatio===null?'#5a7a9a':debtRatio<=60?'#4ada8e':debtRatio<=80?'#da9a4a':'#da4a4a' },
  ].map(k=>`<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join('');

  // ── Balance always closes — no banner needed ──
  const bcEl = document.getElementById('bs-balance-check');
  if (bcEl) bcEl.innerHTML = '<div class="bs-balance-ok">الميزانية متوازنة — الأصول = الخصوم + حقوق الملكية</div>';

  // ── Structure analysis ──
  renderBSStructure(rows, totalA, totalL, currA, currL, asOf);

  // ── Assets table ──
  (function() {
    const trows = [];
    const secs  = bsBySection(assets);
    Object.keys(secs).sort().forEach(sec => {
      const lbl   = BS_SECTION[sec] || sec;
      const items = secs[sec];
      const tot   = items.reduce((s,r)=>s+r.balance,0);
      trows.push(`<tr class="bs-section-hdr"><td colspan="2">${lbl}</td></tr>`);
      items.forEach(r => {
        trows.push(`<tr><td class="bs-item-name">${esc(r.grpName)}</td><td class="bs-num">${fmt(r.balance)}${fmtΔ(r.balance, prevBalMap[r.grpCode])}</td></tr>`);
      });
      const prevTot = items.reduce((s, r) => s + (prevBalMap[r.grpCode] !== undefined ? prevBalMap[r.grpCode] : r.balance), 0);
      trows.push(`<tr class="bs-subtotal"><td>إجمالي ${lbl}</td><td class="bs-num">${fmt(tot)}${fmtΔ(tot, prevRows.length ? prevTot : undefined)}</td></tr>`);
    });
    trows.push(`<tr class="bs-total"><td><strong>إجمالي الأصول</strong></td><td class="bs-num"><strong>${fmt(totalA)}</strong>${fmtΔ(totalA, prevRows.length ? prevA : undefined)}</td></tr>`);
    document.getElementById('bs-assets-body').innerHTML = trows.join('');
  })();

  // ── Liabilities + Equity table ──
  (function() {
    const trows = [];
    trows.push(`<tr class="bs-section-hdr"><td colspan="2">الخصوم</td></tr>`);
    const liabSecs = bsBySection(liabs);
    Object.keys(liabSecs).sort().forEach(sec => {
      const lbl   = BS_SECTION[sec] || sec;
      const items = liabSecs[sec];
      const tot   = items.reduce((s,r)=>s-r.balance,0);
      trows.push(`<tr class="bs-subsection-hdr"><td colspan="2">${lbl}</td></tr>`);
      items.forEach(r => {
        const prevB = prevBalMap[r.grpCode];
        trows.push(`<tr><td class="bs-item-name">${esc(r.grpName)}</td><td class="bs-num">${fmt(-r.balance)}${fmtΔ(-r.balance, prevB !== undefined ? -prevB : undefined)}</td></tr>`);
      });
      const prevTot = items.reduce((s, r) => s + (prevBalMap[r.grpCode] !== undefined ? -prevBalMap[r.grpCode] : -r.balance), 0);
      trows.push(`<tr class="bs-subtotal"><td>إجمالي ${lbl}</td><td class="bs-num">${fmt(tot)}${fmtΔ(tot, prevRows.length ? prevTot : undefined)}</td></tr>`);
    });
    trows.push(`<tr class="bs-subtotal" style="font-size:.88rem"><td><strong>إجمالي الخصوم</strong></td><td class="bs-num"><strong>${fmt(totalL)}</strong>${fmtΔ(totalL, prevRows.length ? prevL : undefined)}</td></tr>`);

    trows.push(`<tr class="bs-section-hdr"><td colspan="2">حقوق الملكية</td></tr>`);
    const capitalRow = equity.find(r => r.grpCode === '30101');
    const capital    = capitalRow ? -capitalRow.balance : 0;
    const retained   = equity.filter(r => r.grpCode !== '30101').reduce((s,r) => s - r.balance, 0) + netIncome;
    const retStyle   = retained >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    trows.push(`<tr><td class="bs-item-name">رأس المال</td><td class="bs-num">${fmt(capital)}</td></tr>`);
    trows.push(`<tr><td class="bs-item-name" style="${retStyle}">الأرباح المبقاة</td><td class="bs-num" style="${retStyle}">${fmtPlNum(retained)}</td></tr>`);
    const prevTotE = prevRows.length ? (prevA - prevL) : undefined;
    trows.push(`<tr class="bs-subtotal" style="font-size:.88rem"><td><strong>إجمالي حقوق الملكية</strong></td><td class="bs-num"><strong>${fmtPlNum(totalE)}</strong>${fmtΔ(totalE, prevTotE)}</td></tr>`);
    trows.push(`<tr class="bs-total"><td><strong>إجمالي الخصوم وحقوق الملكية</strong></td><td class="bs-num"><strong>${fmt(totalA)}</strong>${fmtΔ(totalA, prevRows.length ? prevA : undefined)}</td></tr>`);
    document.getElementById('bs-le-body').innerHTML = trows.join('');
  })();

  // ── Monthly trend chart + table ──
  const mo = bsMonthlyTotals(bs);
  renderBSTrend(mo);
  document.getElementById('bs-monthly-tbody').innerHTML = mo.map(m => {
    const retCls = m.retained  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const niCls  = m.monthlyNI >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const wcCls  = m.workingCapital >= 0 ? 'color:#4a9eda' : 'color:#da4a4a';
    const crCol  = m.currentRatio === null ? '' : m.currentRatio >= 1.5 ? 'color:#4ada8e' : m.currentRatio >= 1 ? 'color:#da9a4a' : 'color:#da4a4a';
    const drCol  = m.debtRatio === null ? '' : m.debtRatio <= 60 ? 'color:#4ada8e' : m.debtRatio <= 80 ? 'color:#da9a4a' : 'color:#da4a4a';
    return `<tr class="${m.month===asOf?'bs-mo-active':''}">
      <td>${m.label}</td>
      <td class="num">${fmt(m.assets)}</td>
      <td class="num">${fmt(m.fixedAssets)}</td>
      <td class="num">${fmt(m.currentAssets)}</td>
      <td class="num">${fmt(m.liabs)}</td>
      <td class="num" style="${wcCls}">${fmtPlNum(m.workingCapital)}</td>
      <td class="num" style="${crCol}">${m.currentRatio !== null ? m.currentRatio.toFixed(2)+'×' : '—'}</td>
      <td class="num" style="${drCol}">${m.debtRatio !== null ? m.debtRatio.toFixed(1)+'%' : '—'}</td>
      <td class="num" style="${retCls}">${fmtPlNum(m.retained)}</td>
      <td class="num" style="${niCls}">${fmtPlNum(m.monthlyNI)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';

  // Re-render formal statement if it's currently visible
  if (_bsfFormalMode) renderBSFormal();
}

// ── BS Structure Analysis ─────────────────────────────────────────────────────
function renderBSStructure(rows, totalA, totalL, currA, currL, asOf) {
  const el = document.getElementById('bs-structure');
  if (!el) return;

  const nca  = totalA - currA;
  const ncl  = totalL - currL;
  const equity = totalA - totalL;

  const ncaPct = totalA > 0 ? (nca  / totalA * 100) : 0;
  const caPct  = totalA > 0 ? (currA / totalA * 100) : 0;
  const clPct  = totalA > 0 ? (currL / totalA * 100) : 0;
  const nclPct = totalA > 0 ? (ncl   / totalA * 100) : 0;
  const eqPct  = totalA > 0 ? (equity / totalA * 100) : 0;

  const wc        = currA - currL;
  const debtRatio = totalA > 0 ? (totalL / totalA * 100) : 0;
  const eqRatio   = totalA > 0 ? (equity / totalA * 100) : 0;
  const crRatio   = currL > 0 ? currA / currL : null;

  const bar = (segs) => {
    const total = segs.reduce((s, x) => s + Math.max(0, x.pct), 0);
    if (total <= 0) return '';
    return `<div style="display:flex;height:20px;border-radius:5px;overflow:hidden;margin:10px 0">
      ${segs.filter(x => x.pct > 0).map(s => `<div style="width:${(s.pct/total*100).toFixed(1)}%;background:${s.col};transition:width .3s" title="${s.lbl}: ${s.pct.toFixed(1)}%"></div>`).join('')}
    </div>`;
  };

  const legend = (col, lbl, val, pct) => `<span style="display:flex;align-items:center;gap:5px;font-size:.78rem">
    <span style="width:10px;height:10px;background:${col};border-radius:2px;flex-shrink:0"></span>
    <span style="color:#8aa0b8">${lbl}:</span>
    <strong style="color:#c8d8e8">${fmt(val)} ر.س</strong>
    <span style="color:#506070">(${pct.toFixed(1)}%)</span>
  </span>`;

  const metricRow = (lbl, val, col, target) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #0e2540">
      <span style="color:#8aa0b8;font-size:.79rem">${lbl}</span>
      <div style="text-align:left">
        <span style="color:${col};font-weight:700;font-size:.85rem">${val}</span>
        ${target ? `<span style="color:#506070;font-size:.69rem;margin-right:6px">${target}</span>` : ''}
      </div>
    </div>`;

  el.innerHTML = `<div class="grid2" style="margin-bottom:18px">
    <div class="card">
      <div class="card-title">🏗️ هيكل الأصول</div>
      ${bar([
        { pct: ncaPct, col: '#3a7abf', lbl: 'أصول ثابتة' },
        { pct: caPct,  col: '#4ada8e', lbl: 'أصول متداولة' },
      ])}
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        ${legend('#3a7abf','أصول ثابتة', nca, ncaPct)}
        ${legend('#4ada8e','أصول متداولة', currA, caPct)}
      </div>
      ${metricRow('رأس المال العامل الصافي (CA − CL)', fmtPlNum(wc)+' ر.س', wc>=0?'#4ada8e':'#da4a4a', '')}
      ${metricRow('النسبة الجارية', crRatio!==null?crRatio.toFixed(2)+'×':'—', crRatio===null?'#5a7a9a':crRatio>=1.5?'#4ada8e':crRatio>=1?'#da9a4a':'#da4a4a', 'الهدف ≥ 1.5×')}
      ${metricRow('نسبة الأصول الثابتة / الإجمالية', ncaPct.toFixed(1)+'%', '#5baef0', '')}
    </div>
    <div class="card">
      <div class="card-title">⚖️ هيكل التمويل</div>
      ${bar([
        { pct: clPct,              col: '#da4a4a', lbl: 'خصوم متداولة' },
        { pct: nclPct,             col: '#da9a4a', lbl: 'خصوم طويلة' },
        { pct: Math.max(0,eqPct),  col: equity>=0?'#4a9eda':'#888', lbl: 'حقوق الملكية' },
      ])}
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        ${legend('#da4a4a','خصوم متداولة', currL, clPct)}
        ${ncl > 0 ? legend('#da9a4a','خصوم طويلة', ncl, nclPct) : ''}
        ${legend(equity>=0?'#4a9eda':'#888', 'حقوق الملكية', equity, Math.max(0,eqPct))}
      </div>
      ${metricRow('نسبة الاستدانة (الخصوم / الأصول)', debtRatio.toFixed(1)+'%', debtRatio<=60?'#4ada8e':debtRatio<=80?'#da9a4a':'#da4a4a', 'الهدف ≤ 60%')}
      ${metricRow('نسبة الملكية / الأصول', eqRatio.toFixed(1)+'%', eqRatio>=30?'#4ada8e':eqRatio>=15?'#da9a4a':'#da4a4a', 'الهدف ≥ 30%')}
      ${metricRow('نسبة الخصوم المتداولة / الإجمالية', totalL>0?(currL/totalL*100).toFixed(1)+'%':'—', '#da9a4a', '')}
    </div>
  </div>`;
}

function printBSPDF() {
  const bs = State.get('bs');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  window.print();
}

// ── FORMAL BALANCE SHEET (قائمة المركز المالي - SOCPA SME) ──────────────────

/* Account-code → proper Saudi SME display label */
const BSF_LABELS = {
  '10101': 'سيارات ومركبات',
  '10102': 'أثاث وتجهيزات ومفروشات',
  '10103': 'أجهزة حاسب آلي وبرامج',
  '10104': 'أجهزة كهربائية وإلكترونية',
  '10105': 'مرافق وبنية تحتية',
  '10106': 'معدات ومكائن صناعية',
  '10107': 'تحسينات على أصول مستأجرة',
  '10108': 'أصول غير ملموسة',
  '10201': 'مشاريع تحت التنفيذ',
  '10301': 'النقدية وما يعادلها',
  '10302': 'المخزون (بضاعة)',
  '10303': 'العملاء والذمم المدينة التجارية',
  '10304': 'ذمم موظفين وسلف وعهد',
  '10305': 'أصول متداولة أخرى',
  '20101': 'الموردون والدائنون التجاريون',
  '20102': 'أرصدة دائنة أخرى',
  '20103': 'مصروفات مستحقة وما في حكمها',
  '20201': 'قروض وتسهيلات بنكية طويلة الأجل',
  '30101': 'رأس المال المدفوع',
  '30102': 'جاري الشركاء والاحتياطيات',
};

/* Order within current assets: cash last */
const BSF_CA_ORDER = ['10302','10303','10304','10305','10301'];

function initBSFormal() {
  const toggleBtn = document.getElementById('bsf-toggle-btn');
  const printBtn  = document.getElementById('bsf-print-btn');
  const cmpSel    = document.getElementById('bsf-cmp-sel');
  if (toggleBtn && !toggleBtn._bsfInit) {
    toggleBtn._bsfInit = true;
    toggleBtn.addEventListener('click', () => {
      _bsfFormalMode = !_bsfFormalMode;
      const stmtWrap   = document.getElementById('bsf-stmt-wrap');
      const twoCol     = document.getElementById('bs-twocol');
      const trendCard  = document.getElementById('bs-trend-card');
      const moCard     = document.getElementById('bs-monthly-card');
      if (stmtWrap)  stmtWrap.style.display  = _bsfFormalMode ? '' : 'none';
      if (twoCol)    twoCol.style.display     = _bsfFormalMode ? 'none' : '';
      if (trendCard) trendCard.style.display  = _bsfFormalMode ? 'none' : '';
      if (moCard)    moCard.style.display     = _bsfFormalMode ? 'none' : '';
      toggleBtn.style.background = _bsfFormalMode ? '#0d3a2a' : '#0d2a1a';
      toggleBtn.style.color      = _bsfFormalMode ? '#a0f0c0' : '#70e8a8';
      toggleBtn.style.border     = _bsfFormalMode ? '1px solid #3a9a6a' : '1px solid #2a7a5a';
      if (_bsfFormalMode) renderBSFormal();
    });
  }
  if (printBtn && !printBtn._bsfInit) {
    printBtn._bsfInit = true;
    printBtn.addEventListener('click', printBSPDF);
  }
  if (cmpSel && !cmpSel._bsfInit) {
    cmpSel._bsfInit = true;
    cmpSel.addEventListener('change', () => { if (_bsfFormalMode) renderBSFormal(); });
  }
  const excelBtn = document.getElementById('bsf-excel-btn');
  if (excelBtn && !excelBtn._bsfInit) {
    excelBtn._bsfInit = true;
    excelBtn.addEventListener('click', () => {
      excelBtn.disabled = true;
      excelBtn.textContent = '⏳ جاري التصدير…';
      exportBSFExcel()
        .catch(e => { console.error(e); alert('خطأ في التصدير'); })
        .finally(() => { excelBtn.disabled = false; excelBtn.textContent = '📊 Excel'; });
    });
  }
  const htmlBtn = document.getElementById('bsf-html-btn');
  if (htmlBtn && !htmlBtn._bsfInit) { htmlBtn._bsfInit = true; htmlBtn.addEventListener('click', exportBSFHTML); }
}

function renderBSFormal() {
  const bs = State.get('bs');
  if (!bs || !bs.length) return;

  const selMo  = (document.getElementById('bs-period-sel') || {}).value || '';
  const months = [...new Set(bs.map(r => r.month))].sort();
  const asOf   = selMo || months[months.length - 1] || '';
  const rows   = bs.filter(r => r.month === asOf);
  if (!rows.length) return;

  const cmpMode = (document.getElementById('bsf-cmp-sel') || {}).value || 'prev-month';
  let cmpMo = '';
  if (cmpMode === 'prev-month') {
    const idx = months.indexOf(asOf);
    cmpMo = idx > 0 ? months[idx - 1] : '';
  } else if (cmpMode === 'prev-year') {
    const [y, m] = asOf.split('-');
    const prevYM = `${+y - 1}-${m}`;
    cmpMo = months.includes(prevYM) ? prevYM : '';
  } else if (cmpMode === 'prev-quarter') {
    const [y, m] = asOf.split('-').map(Number);
    const curQ   = Math.ceil(m / 3);
    const prevQY = curQ === 1 ? y - 1 : y;
    const prevQEndM = (curQ === 1 ? 4 : curQ - 1) * 3;
    const prevQEnd  = `${prevQY}-${String(prevQEndM).padStart(2, '0')}`;
    const avail  = months.filter(mo => mo <= prevQEnd);
    cmpMo = avail.length ? avail[avail.length - 1] : '';
  } else if (cmpMode === 'fy-start') {
    const fyY    = asOf.slice(0, 4);
    const fyMos  = months.filter(mo => mo.startsWith(fyY));
    cmpMo = (fyMos.length ? fyMos[0] : months[0]) || '';
  } else if (cmpMode === 'opening') {
    cmpMo = months[0] || '';
  }
  const cmpRows = cmpMo ? bs.filter(r => r.month === cmpMo) : [];
  const hasCmp  = cmpMode !== 'none' && cmpRows.length > 0;
  const cols    = hasCmp ? 3 : 2;

  const byCode = r => r.grpCode;
  const bal  = (arr, code) => { const f = arr.find(r => byCode(r) === code); return f ? f.balance : 0; };
  const abal = (arr, code) => Math.abs(bal(arr, code));
  const lbal = (arr, code) => -bal(arr, code);

  // ── helpers ────────────────────────────────────────────────────────────────
  const fmtN = (n) => {
    if (n === null || n === undefined) return `<td class="bsf-num bsf-zero">—</td>`;
    const abs = Math.abs(n);
    const str = fmt(abs, 0);
    const col = n > 0 ? 'bsf-pos' : n < 0 ? 'bsf-neg' : 'bsf-zero';
    const prefix = n < 0 ? '(' : '';
    const suffix = n < 0 ? ')' : '';
    return `<td class="bsf-num ${col}">${prefix}${str}${suffix}</td>`;
  };
  const fmtNC = (cur, cmpVal) => fmtN(cur) + (hasCmp ? fmtN(cmpVal) : '');

  const secHdr = (label) => `<tr class="bsf-section-hdr"><td colspan="${cols}">${label}</td></tr>`;
  const subHdr = (label) => `<tr class="bsf-sub-hdr"><td colspan="${cols}">${label}</td></tr>`;
  const spacer = () => `<tr class="bsf-spacer"><td colspan="${cols}"></td></tr>`;

  const itemRow = (code, overrideLabel) => {
    const label = overrideLabel || BSF_LABELS[code] || code;
    const cur   = abal(rows, code);
    const cmp   = hasCmp ? abal(cmpRows, code) : null;
    if (cur === 0 && (cmp === null || cmp === 0)) return '';
    return `<tr class="bsf-item">
      <td class="bsf-label">${label}</td>
      ${fmtNC(cur || null, cmp || null)}
    </tr>`;
  };
  const liabRow = (code, overrideLabel) => {
    const label = overrideLabel || BSF_LABELS[code] || code;
    const cur   = lbal(rows, code);
    const cmp   = hasCmp ? lbal(cmpRows, code) : null;
    if (cur === 0 && (cmp === null || cmp === 0)) return '';
    return `<tr class="bsf-item">
      <td class="bsf-label">${label}</td>
      ${fmtNC(cur || null, cmp || null)}
    </tr>`;
  };
  const subtotalRow = (label, cur, cmp) => `<tr class="bsf-subtotal">
    <td>${label}</td>
    ${fmtNC(cur, hasCmp ? cmp : null)}
  </tr>`;
  const totalRow = (label, cur, cmp) => `<tr class="bsf-total">
    <td>${label}</td>
    ${fmtNC(cur, hasCmp ? cmp : null)}
  </tr>`;
  const grandRow = (label, cur, cmp) => `<tr class="bsf-grand">
    <td>${label}</td>
    ${fmtNC(cur, hasCmp ? cmp : null)}
  </tr>`;

  // ── Fixed assets (101xx) ───────────────────────────────────────────────────
  const FA_CODES = ['10101','10102','10103','10104','10105','10106','10107','10108'];
  const faSum  = (arr) => FA_CODES.reduce((s,c) => s + abal(arr, c), 0);
  const faRows = FA_CODES.map(c => itemRow(c)).join('');
  const wip    = itemRow('10201');
  const ncaSum  = faSum(rows) + abal(rows, '10201');
  const ncaSumC = hasCmp ? (faSum(cmpRows) + abal(cmpRows, '10201')) : null;

  // ── Current assets (103xx) — prescribed order ──────────────────────────────
  const caSum  = BSF_CA_ORDER.reduce((s,c) => s + abal(rows, c), 0);
  const caSumC = hasCmp ? BSF_CA_ORDER.reduce((s,c) => s + abal(cmpRows, c), 0) : null;
  const caRows = BSF_CA_ORDER.map(c => itemRow(c)).join('');

  // ── Totals — assets ────────────────────────────────────────────────────────
  const totalA  = rows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0);
  const totalAC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0) : null;

  // ── Current liabilities (201xx) ────────────────────────────────────────────
  const CL_CODES = ['20101','20102','20103'];
  const clSum  = CL_CODES.reduce((s,c) => s + lbal(rows, c), 0);
  const clSumC = hasCmp ? CL_CODES.reduce((s,c) => s + lbal(cmpRows, c), 0) : null;
  const clRows = CL_CODES.map(c => liabRow(c)).join('');

  // ── Non-current liabilities (202xx) ───────────────────────────────────────
  const NCL_CODES = ['20201'];
  const nclSum  = NCL_CODES.reduce((s,c) => s + lbal(rows, c), 0);
  const nclSumC = hasCmp ? NCL_CODES.reduce((s,c) => s + lbal(cmpRows, c), 0) : null;
  const nclRows = NCL_CODES.map(c => liabRow(c)).join('');

  const totalL  = rows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0);
  const totalLC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0) : null;

  // ── Equity ────────────────────────────────────────────────────────────────
  const cap   = lbal(rows, '30101');
  const capC  = hasCmp ? lbal(cmpRows, '30101') : null;
  const ret3  = lbal(rows, '30102');
  const ret3C = hasCmp ? lbal(cmpRows, '30102') : null;
  const eq3all   = rows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0);
  const eq3allC  = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0) : null;
  const netP     = totalA - totalL - eq3all;
  const netPC    = hasCmp ? (totalAC - totalLC - eq3allC) : null;
  const totalE   = eq3all + netP;
  const totalEC  = hasCmp ? (eq3allC + netPC) : null;
  const netPCol  = netP >= 0 ? 'bsf-pos' : 'bsf-neg';

  // ── Date/header labels ─────────────────────────────────────────────────────
  const asOfRow  = rows[0];
  const cmpLblEl = document.getElementById('bsf-prv-hdr');
  const curLblEl = document.getElementById('bsf-cur-hdr');
  const cmpLbl   = cmpMo ? (bs.find(r=>r.month===cmpMo)||{}).label || cmpMo : '';
  if (curLblEl) {
    curLblEl.textContent = (asOfRow && asOfRow.label) || asOf;
    curLblEl.colSpan = hasCmp ? 1 : 2;
  }
  if (cmpLblEl) {
    cmpLblEl.textContent = hasCmp ? cmpLbl : '';
    cmpLblEl.style.display = hasCmp ? '' : 'none';
  }

  const dateEl = document.getElementById('bsf-date');
  if (dateEl) dateEl.textContent = `كما في نهاية: ${(asOfRow && asOfRow.label) || asOf}`;

  const companyEl = document.getElementById('bsf-company');
  if (companyEl && companyEl.textContent === '—') {
    const dbName = State.get('activeDb') || '';
    companyEl.textContent = dbName === 'MekSoftDb1' ? 'أبعاد للحديد والصلب'
                          : dbName === 'MekSoftDb2' ? 'وسام للحديد والصلب'
                          : dbName;
  }

  const noDataNote = (cmpMode !== 'none' && !hasCmp)
    ? `<tr><td colspan="${cols}" style="text-align:center;padding:10px;color:#5a7090;font-size:.8rem">بيانات الفترة المقارنة غير متاحة</td></tr>`
    : '';

  // ── Build HTML ─────────────────────────────────────────────────────────────
  const html = [
    // ═══════ ASSETS ═══════
    secHdr('الأصول'),
    subHdr('أولاً: الأصول غير المتداولة'),
    faRows,
    wip,
    subtotalRow('إجمالي الأصول غير المتداولة', ncaSum || null, ncaSumC),
    spacer(),

    subHdr('ثانياً: الأصول المتداولة'),
    caRows,
    subtotalRow('إجمالي الأصول المتداولة', caSum || null, caSumC),
    spacer(),

    totalRow('إجمالي الأصول', totalA || null, totalAC),
    spacer(),

    // ═══════ LIABILITIES ═══════
    secHdr('الالتزامات وحقوق الملكية'),
    subHdr('أولاً: الالتزامات المتداولة'),
    clRows,
    subtotalRow('إجمالي الالتزامات المتداولة', clSum || null, clSumC),
    spacer(),

    nclSum > 0 || (nclSumC !== null && nclSumC > 0) ? [
      subHdr('ثانياً: الالتزامات غير المتداولة'),
      nclRows,
      subtotalRow('إجمالي الالتزامات غير المتداولة', nclSum || null, nclSumC),
      spacer(),
    ].join('') : '',

    totalRow('إجمالي الالتزامات', totalL || null, totalLC),
    spacer(),

    // ═══════ EQUITY ═══════
    subHdr('ثالثاً: حقوق الملكية'),
    `<tr class="bsf-item"><td class="bsf-label">${BSF_LABELS['30101']}</td>${fmtNC(cap||null, capC||null)}</tr>`,
    ret3 !== 0 || (ret3C !== null && ret3C !== 0) ?
      `<tr class="bsf-item"><td class="bsf-label">${BSF_LABELS['30102']}</td>${fmtNC(ret3||null, ret3C||null)}</tr>` : '',
    `<tr class="bsf-item">
      <td class="bsf-label" style="color:${netP>=0?'#4ada8e':'#da4a4a'}">${netP>=0?'صافي ربح الفترة الجارية':'صافي خسارة الفترة الجارية'}</td>
      <td class="bsf-num ${netPCol}">${netP>=0?fmt(netP,0):'('+fmt(-netP,0)+')'}</td>
      ${hasCmp ? `<td class="bsf-num ${netPC>=0?'bsf-pos':'bsf-neg'}">${netPC>=0?fmt(netPC,0):'('+fmt(-netPC,0)+')'}</td>` : ''}
    </tr>`,
    subtotalRow('إجمالي حقوق الملكية', totalE || null, totalEC),
    spacer(),

    grandRow('إجمالي الالتزامات وحقوق الملكية', totalA || null, totalAC),
    noDataNote,
  ].flat().join('');

  document.getElementById('bsf-body').innerHTML = html;

  // Balance check note
  const diff = Math.abs(totalA - totalL - totalE);
  const noteEl = document.getElementById('bsf-balance-note');
  if (noteEl) {
    noteEl.textContent = diff < 1
      ? `✓ الميزانية متوازنة — الأصول (${fmt(totalA,0)}) = الالتزامات (${fmt(totalL,0)}) + حقوق الملكية (${fmt(totalE,0)})`
      : `⚠ فرق ${fmt(diff,0)} ر.س — قد تحتاج إلى مراجعة قيود الافتتاح`;
    noteEl.style.color = diff < 1 ? '#3a9a6a' : '#da9a4a';
  }
}

// ── BSF export helpers ────────────────────────────────────────────────────────

function _bsfDerive() {
  const bs = State.get('bs');
  if (!bs || !bs.length) return null;

  const selMo  = (document.getElementById('bs-period-sel') || {}).value || '';
  const months = [...new Set(bs.map(r => r.month))].sort();
  const asOf   = selMo || months[months.length - 1] || '';
  const rows   = bs.filter(r => r.month === asOf);
  if (!rows.length) return null;

  const cmpMode = (document.getElementById('bsf-cmp-sel') || {}).value || 'prev-month';
  let cmpMo = '';
  if (cmpMode === 'prev-month') {
    const idx = months.indexOf(asOf); cmpMo = idx > 0 ? months[idx - 1] : '';
  } else if (cmpMode === 'prev-quarter') {
    const [y, m] = asOf.split('-').map(Number);
    const curQ = Math.ceil(m / 3);
    const prevQY = curQ === 1 ? y - 1 : y;
    const prevQEndM = (curQ === 1 ? 4 : curQ - 1) * 3;
    const prevQEnd = `${prevQY}-${String(prevQEndM).padStart(2, '0')}`;
    const avail = months.filter(mo => mo <= prevQEnd);
    cmpMo = avail.length ? avail[avail.length - 1] : '';
  } else if (cmpMode === 'prev-year') {
    const [y, m] = asOf.split('-');
    cmpMo = months.includes(`${+y-1}-${m}`) ? `${+y-1}-${m}` : '';
  } else if (cmpMode === 'fy-start') {
    const fyMos = months.filter(mo => mo.startsWith(asOf.slice(0,4)));
    cmpMo = (fyMos.length ? fyMos[0] : months[0]) || '';
  } else if (cmpMode === 'opening') {
    cmpMo = months[0] || '';
  }
  const cmpRows = cmpMo ? bs.filter(r => r.month === cmpMo) : [];
  const hasCmp  = cmpMode !== 'none' && cmpRows.length > 0;

  const bal  = (arr, code) => { const f = arr.find(r => r.grpCode === code); return f ? f.balance : 0; };
  const abal = (arr, code) => Math.abs(bal(arr, code));
  const lbal = (arr, code) => -bal(arr, code);

  const FA_CODES  = ['10101','10102','10103','10104','10105','10106','10107','10108'];
  const CL_CODES  = ['20101','20102','20103'];
  const NCL_CODES = ['20201'];

  const ncaSum  = FA_CODES.reduce((s,c)=>s+abal(rows,c),0) + abal(rows,'10201');
  const ncaSumC = hasCmp ? FA_CODES.reduce((s,c)=>s+abal(cmpRows,c),0) + abal(cmpRows,'10201') : null;
  const caSum   = BSF_CA_ORDER.reduce((s,c)=>s+abal(rows,c),0);
  const caSumC  = hasCmp ? BSF_CA_ORDER.reduce((s,c)=>s+abal(cmpRows,c),0) : null;
  const totalA  = rows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0);
  const totalAC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0) : null;
  const clSum   = CL_CODES.reduce((s,c)=>s+lbal(rows,c),0);
  const clSumC  = hasCmp ? CL_CODES.reduce((s,c)=>s+lbal(cmpRows,c),0) : null;
  const nclSum  = NCL_CODES.reduce((s,c)=>s+lbal(rows,c),0);
  const nclSumC = hasCmp ? NCL_CODES.reduce((s,c)=>s+lbal(cmpRows,c),0) : null;
  const totalL  = rows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0);
  const totalLC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0) : null;
  const eq3all  = rows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0);
  const eq3allC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0) : null;
  const netP    = totalA - totalL - eq3all;
  const netPC   = hasCmp ? totalAC - totalLC - eq3allC : null;
  const totalE  = eq3all + netP;
  const totalEC = hasCmp ? eq3allC + netPC : null;

  const dbName  = State.get('activeDb') || '';
  const company = (() => {
    const el = document.getElementById('bsf-company');
    const t  = el ? el.textContent.trim() : '';
    return (t && t !== '—') ? t
      : dbName === 'MekSoftDb1' ? 'أبعاد للحديد والصلب'
      : dbName === 'MekSoftDb2' ? 'وسام للحديد والصلب' : dbName;
  })();
  const curLbl = (rows[0] && rows[0].label) || asOf;
  const cmpLbl = cmpMo ? (bs.find(r=>r.month===cmpMo)||{}).label || cmpMo : '';

  return { rows, cmpRows, hasCmp, asOf, curLbl, cmpLbl, company,
    FA_CODES, CL_CODES, NCL_CODES,
    ncaSum, ncaSumC, caSum, caSumC, totalA, totalAC,
    clSum, clSumC, nclSum, nclSumC, totalL, totalLC,
    netP, netPC, totalE, totalEC, abal, lbal };
}

async function exportBSFExcel() {
  const d = _bsfDerive();
  if (!d) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const { rows, cmpRows, hasCmp, asOf, curLbl, cmpLbl, company,
    FA_CODES, CL_CODES, NCL_CODES,
    ncaSum, ncaSumC, caSum, caSumC, totalA, totalAC,
    clSum, clSumC, nclSum, nclSumC, totalL, totalLC,
    netP, netPC, totalE, totalEC, abal, lbal } = d;

  const genDate = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  const NC = hasCmp ? 3 : 2;  // total columns (1-based for ExcelJS)

  try {
    // ── Workbook ──────────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'MekSoft ERP Dashboard';
    wb.created  = new Date();

    const ws = wb.addWorksheet('المركز المالي', {
      views: [{ rightToLeft: true }],
    });
    ws.pageSetup.paperSize    = 9;   // A4
    ws.pageSetup.orientation  = 'portrait';
    ws.pageSetup.fitToPage    = true;
    ws.pageSetup.fitToWidth   = 1;
    ws.pageSetup.margins = { left:0.6, right:0.5, top:0.75, bottom:0.75, header:0.3, footer:0.3 };

    ws.columns = [
      { width: 52 },
      { width: 20 },
      ...(hasCmp ? [{ width: 20 }] : []),
    ];

    // ── Color & font constants ─────────────────────────────────────────────────
    const FONT   = 'Calibri';
    const numFmt = '#,##0;[Red](#,##0);"-"';

    const CLR = {
      navyDark : 'FF0A2040',
      navy     : 'FF1A3A6A',
      blueLight: 'FFE8EEF8',
      bluePale : 'FFF4F7FB',
      blueXPale: 'FFDDE6F4',
      white    : 'FFFFFFFF',
      textDark : 'FF111111',
      textNavy : 'FF0A2040',
      textBlue : 'FF1A3A6A',
      textLight: 'FF6A8AAA',
      textGray : 'FF888888',
      greenBg  : 'FFF4FFF8',
      greenBdr : 'FF90C890',
      greenText: 'FF1A6A2A',
    };

    const solid = (argb) => ({ type:'pattern', pattern:'solid', fgColor:{ argb } });
    const border = (style, argb) => ({ style, color:{ argb } });

    // ── Row helpers ───────────────────────────────────────────────────────────
    function spanRow(row) {
      ws.mergeCells(row.number, 1, row.number, NC);
    }

    function styledRow(values, height, styleFn) {
      const row = ws.addRow(values);
      row.height = height;
      styleFn(row);
      return row;
    }

    function addTitleRow(text, sz, fc, bg) {
      return styledRow([text], sz > 12 ? 32 : 22, row => {
        spanRow(row);
        const c = row.getCell(1);
        c.font      = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
        c.fill      = solid(bg);
        c.alignment = { horizontal:'center', vertical:'middle' };
      });
    }

    function addSpacer(h = 6) {
      const row = ws.addRow(['']);
      row.height = h;
      spanRow(row);
      row.getCell(1).fill = solid(CLR.white);
    }

    function addColHdr() {
      const vals = ['البيان', curLbl, ...(hasCmp ? [cmpLbl] : [])];
      return styledRow(vals, 22, row => {
        row.eachCell({ includeEmpty:true }, (c, ci) => {
          c.font      = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
          c.fill      = solid(CLR.navy);
          c.alignment = { horizontal: ci === 1 ? 'right' : 'center', vertical:'middle' };
          c.border    = { bottom: border('medium', CLR.navyDark) };
        });
      });
    }

    function addSecHdr(text) {
      return styledRow([text], 20, row => {
        spanRow(row);
        const c = row.getCell(1);
        c.font      = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
        c.fill      = solid(CLR.navy);
        c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
      });
    }

    function addSubHdr(text) {
      return styledRow([text], 18, row => {
        spanRow(row);
        const c = row.getCell(1);
        c.font      = { name:FONT, size:9.5, bold:true, italic:true, color:{ argb:CLR.textBlue } };
        c.fill      = solid(CLR.blueLight);
        c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
        c.border    = { top: border('thin','FFC0CFE8'), bottom: border('hair','FFD0D8E8') };
      });
    }

    function setNumCell(cell, v, fc, bold) {
      cell.value     = (v !== null && v !== undefined) ? +v.toFixed(0) : null;
      cell.numFmt    = numFmt;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      cell.font      = { name:FONT, size:9.5, color:{ argb: fc || CLR.textNavy }, bold: bold || false };
    }

    function addItem(label, cur, cmp, indent=1) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 17, row => {
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:9.5, color:{ argb:CLR.textDark } };
        c1.alignment = { horizontal:'right', vertical:'middle', indent };
        c1.border    = { bottom: border('hair','FFE8ECF0') };
        setNumCell(row.getCell(2), cur, CLR.textNavy, false);
        row.getCell(2).border = { bottom: border('hair','FFE8ECF0') };
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textGray, false);
          row.getCell(3).border = { bottom: border('hair','FFE8ECF0') };
          row.getCell(3).fill  = solid('FFF8FAFE');
        }
      });
    }

    function addSubTot(label, cur, cmp) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 18, row => {
        const topBot = { top: border('thin','FFC0CFE8'), bottom: border('thin','FFB0C4DC') };
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.textNavy } };
        c1.fill      = solid(CLR.bluePale);
        c1.alignment = { horizontal:'right', vertical:'middle' };
        c1.border    = topBot;
        setNumCell(row.getCell(2), cur, CLR.textNavy, true);
        Object.assign(row.getCell(2), { fill: solid(CLR.bluePale), border: topBot });
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textGray, false);
          Object.assign(row.getCell(3), { fill: solid('FFF0F4FA'), border: topBot });
        }
      });
    }

    function addTotal(label, cur, cmp) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 20, row => {
        const bord = { top: border('medium', CLR.navy), bottom: border('thin', CLR.navy) };
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
        c1.fill      = solid(CLR.blueLight);
        c1.alignment = { horizontal:'right', vertical:'middle' };
        c1.border    = bord;
        setNumCell(row.getCell(2), cur, CLR.navyDark, true);
        Object.assign(row.getCell(2), { fill: solid(CLR.blueLight), border: bord });
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textBlue, true);
          Object.assign(row.getCell(3), { fill: solid('FFE0E8F4'), border: bord });
        }
      });
    }

    function addGrand(label, cur, cmp) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 22, row => {
        const bord = { top: border('double', CLR.navyDark), bottom: border('medium', CLR.navyDark) };
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:10.5, bold:true, color:{ argb:CLR.navyDark } };
        c1.fill      = solid(CLR.blueXPale);
        c1.alignment = { horizontal:'right', vertical:'middle' };
        c1.border    = bord;
        setNumCell(row.getCell(2), cur, CLR.navyDark, true);
        Object.assign(row.getCell(2), { fill: solid(CLR.blueXPale), border: bord });
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textBlue, true);
          Object.assign(row.getCell(3), { fill: solid('FFD5E0F0'), border: bord });
        }
        row.getCell(2).font = { name:FONT, size:10.5, bold:true, color:{ argb:CLR.navyDark } };
      });
    }

    function addBalanceNote(text) {
      const row = ws.addRow([text]);
      row.height = 20;
      spanRow(row);
      const c = row.getCell(1);
      c.font      = { name:FONT, size:9, bold:true, color:{ argb:CLR.greenText } };
      c.fill      = solid(CLR.greenBg);
      c.alignment = { horizontal:'center', vertical:'middle' };
      c.border    = {
        top:    border('thin', CLR.greenBdr),
        bottom: border('thin', CLR.greenBdr),
        left:   border('thin', CLR.greenBdr),
        right:  border('thin', CLR.greenBdr),
      };
    }

    // ── Title block ───────────────────────────────────────────────────────────
    addTitleRow(company, 14, CLR.white, CLR.navyDark);
    addTitleRow('قائمة المركز المالي', 12, CLR.white, CLR.navy);
    addTitleRow(`كما في نهاية: ${curLbl}${hasCmp ? `  |  مقارنة بـ: ${cmpLbl}` : ''}`, 9.5, 'FFAACCE8', CLR.navyDark);
    addTitleRow(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
    addSpacer(4);
    addColHdr();

    // ── ASSETS ───────────────────────────────────────────────────────────────
    addSpacer(4);
    addSecHdr('الأصول');
    addSubHdr('أولاً: الأصول غير المتداولة');
    FA_CODES.forEach(c => {
      const v = abal(rows,c), vc = hasCmp ? abal(cmpRows,c) : null;
      if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
    });
    { const v=abal(rows,'10201'), vc=hasCmp?abal(cmpRows,'10201'):null;
      if (v||vc) addItem(BSF_LABELS['10201'], v||null, vc||null); }
    addSubTot('إجمالي الأصول غير المتداولة', ncaSum||null, ncaSumC);
    addSpacer();

    addSubHdr('ثانياً: الأصول المتداولة');
    BSF_CA_ORDER.forEach(c => {
      const v = abal(rows,c), vc = hasCmp ? abal(cmpRows,c) : null;
      if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
    });
    addSubTot('إجمالي الأصول المتداولة', caSum||null, caSumC);
    addSpacer();
    addTotal('إجمالي الأصول', totalA||null, totalAC);

    // ── LIABILITIES ──────────────────────────────────────────────────────────
    addSpacer();
    addSecHdr('الالتزامات وحقوق الملكية');
    addSubHdr('أولاً: الالتزامات المتداولة');
    CL_CODES.forEach(c => {
      const v = lbal(rows,c), vc = hasCmp ? lbal(cmpRows,c) : null;
      if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
    });
    addSubTot('إجمالي الالتزامات المتداولة', clSum||null, clSumC);
    addSpacer();

    if (nclSum>0||(hasCmp&&nclSumC>0)) {
      addSubHdr('ثانياً: الالتزامات غير المتداولة');
      NCL_CODES.forEach(c => {
        const v = lbal(rows,c), vc = hasCmp ? lbal(cmpRows,c) : null;
        if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
      });
      addSubTot('إجمالي الالتزامات غير المتداولة', nclSum||null, nclSumC);
      addSpacer();
    }

    addTotal('إجمالي الالتزامات', totalL||null, totalLC);

    // ── EQUITY ───────────────────────────────────────────────────────────────
    addSpacer();
    addSubHdr('ثالثاً: حقوق الملكية');
    addItem(BSF_LABELS['30101'], lbal(rows,'30101')||null, hasCmp?lbal(cmpRows,'30101')||null:null);
    { const v=lbal(rows,'30102'), vc=hasCmp?lbal(cmpRows,'30102'):null;
      if (v||vc) addItem(BSF_LABELS['30102'], v||null, vc||null); }
    // Net profit — colour the label
    { const isProfit = netP >= 0;
      const nl = isProfit ? 'صافي ربح الفترة الجارية' : 'صافي خسارة الفترة الجارية';
      const row = addItem(nl, netP||null, netPC||null);
      row.getCell(1).font = { name:FONT, size:9.5, bold:true,
        color:{ argb: isProfit ? CLR.greenText : 'FF8A2A00' } }; }
    addSubTot('إجمالي حقوق الملكية', totalE||null, totalEC);
    addSpacer();
    addGrand('إجمالي الالتزامات وحقوق الملكية', totalA||null, totalAC);
    addSpacer();
    addBalanceNote(
      `✓ الميزانية متوازنة — الأصول (${Math.round(totalA).toLocaleString('ar-SA')}) = الالتزامات (${Math.round(totalL).toLocaleString('ar-SA')}) + حقوق الملكية (${Math.round(totalE).toLocaleString('ar-SA')})`
    );

    // ── Download ──────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `قائمة_المركز_المالي_${asOf}.xlsx`; a.click();
    URL.revokeObjectURL(url);

  } catch(err) {
    console.error('BSF Excel export error:', err);
    alert('خطأ في التصدير إلى Excel: ' + err.message);
  }
}

function exportBSFHTML() {
  const d = _bsfDerive();
  if (!d) return;

  const { rows, cmpRows, hasCmp, asOf, curLbl, cmpLbl, company,
    FA_CODES, CL_CODES, NCL_CODES,
    ncaSum, ncaSumC, caSum, caSumC, totalA, totalAC,
    clSum, clSumC, nclSum, nclSumC, totalL, totalLC,
    netP, netPC, totalE, totalEC, abal, lbal } = d;

  const genDate = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  const NC = hasCmp ? 3 : 2;

  const fmtN = (v) => {
    if (!v) return '<td class="num zero">—</td>';
    const abs = Math.abs(v).toLocaleString('ar-SA', {minimumFractionDigits:0, maximumFractionDigits:0});
    return v < 0 ? `<td class="num neg">(${abs})</td>` : `<td class="num pos">${abs}</td>`;
  };
  const fmtR  = (cur, cmp) => fmtN(cur) + (hasCmp ? fmtN(cmp) : '');
  const secH  = (l) => `<tr class="sec-hdr"><td colspan="${NC}">${l}</td></tr>`;
  const subH  = (l) => `<tr class="sub-hdr"><td colspan="${NC}">${l}</td></tr>`;
  const itm   = (l, cur, cmp) => `<tr class="item"><td class="ind">${l}</td>${fmtR(cur,cmp)}</tr>`;
  const subT  = (l, cur, cmp) => `<tr class="subtotal"><td>${l}</td>${fmtR(cur,cmp)}</tr>`;
  const totR  = (l, cur, cmp) => `<tr class="total"><td><b>${l}</b></td>${fmtR(cur,cmp)}</tr>`;
  const grnd  = (l, cur, cmp) => `<tr class="grand"><td><b>${l}</b></td>${fmtR(cur,cmp)}</tr>`;
  const sp    = () => `<tr class="spacer"><td colspan="${NC}"></td></tr>`;

  let tb = '';
  tb += secH('الأصول');
  tb += subH('أولاً: الأصول غير المتداولة');
  FA_CODES.forEach(c => { const v=abal(rows,c),vc=hasCmp?abal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
  { const v=abal(rows,'10201'),vc=hasCmp?abal(cmpRows,'10201'):null; if(v||vc) tb+=itm(BSF_LABELS['10201'],v||null,vc||null); }
  tb += subT('إجمالي الأصول غير المتداولة', ncaSum||null, ncaSumC); tb += sp();
  tb += subH('ثانياً: الأصول المتداولة');
  BSF_CA_ORDER.forEach(c => { const v=abal(rows,c),vc=hasCmp?abal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
  tb += subT('إجمالي الأصول المتداولة', caSum||null, caSumC); tb += sp();
  tb += totR('إجمالي الأصول', totalA||null, totalAC); tb += sp();

  tb += secH('الالتزامات وحقوق الملكية');
  tb += subH('أولاً: الالتزامات المتداولة');
  CL_CODES.forEach(c => { const v=lbal(rows,c),vc=hasCmp?lbal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
  tb += subT('إجمالي الالتزامات المتداولة', clSum||null, clSumC); tb += sp();
  if (nclSum>0||(hasCmp&&nclSumC>0)) {
    tb += subH('ثانياً: الالتزامات غير المتداولة');
    NCL_CODES.forEach(c => { const v=lbal(rows,c),vc=hasCmp?lbal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
    tb += subT('إجمالي الالتزامات غير المتداولة', nclSum||null, nclSumC); tb += sp();
  }
  tb += totR('إجمالي الالتزامات', totalL||null, totalLC); tb += sp();

  tb += subH('ثالثاً: حقوق الملكية');
  tb += itm(BSF_LABELS['30101'], lbal(rows,'30101')||null, hasCmp?lbal(cmpRows,'30101')||null:null);
  { const v=lbal(rows,'30102'),vc=hasCmp?lbal(cmpRows,'30102'):null; if(v||vc) tb+=itm(BSF_LABELS['30102'],v||null,vc||null); }
  { const nl=netP>=0?'صافي ربح الفترة الجارية':'صافي خسارة الفترة الجارية';
    const sty=netP>=0?' style="color:#1a6a2a"':' style="color:#8a2a00"';
    tb+=`<tr class="item"><td class="ind"${sty}>${nl}</td>${fmtN(netP||null)}${hasCmp?fmtN(netPC||null):''}</tr>`; }
  tb += subT('إجمالي حقوق الملكية', totalE||null, totalEC); tb += sp();
  tb += grnd('إجمالي الالتزامات وحقوق الملكية', totalA||null, totalAC);

  const cmpTh = hasCmp ? `<th class="num">${cmpLbl}</th>` : '';
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>قائمة المركز المالي — ${esc(company)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;font-size:11pt;color:#111;background:#fff}
.page{max-width:800px;margin:0 auto;padding:28px 32px}
.co-name{font-size:17pt;font-weight:700;text-align:center;color:#0a2040;margin-bottom:4px}
.rpt-title{font-size:14pt;font-weight:600;text-align:center;color:#1a4a7a;margin-bottom:2px}
.meta{text-align:center;font-size:9pt;color:#555;margin-bottom:4px;line-height:1.8}
.currency{text-align:center;font-size:8.5pt;color:#999;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
th{padding:7px 10px;font-weight:700;border-bottom:2px solid #0a2040;text-align:right}
th.num{text-align:left;min-width:130px}
td{padding:5px 10px;border-bottom:1px solid #e8ecf0;vertical-align:middle}
td.num{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:130px}
td.pos{color:#0a3060}
td.neg{color:#8a1010}
td.zero{color:#bbb}
td.ind{padding-right:32px}
tr.sec-hdr td{background:#1a3a6a;color:#fff;font-weight:700;font-size:9pt;
  padding:6px 10px;border-top:2px solid #0a2040}
tr.sub-hdr td{background:#e8eef8;color:#1a3a6a;font-weight:600;font-size:8.5pt;
  padding:5px 10px;border-top:1px solid #c0cfe8}
tr.subtotal td{border-top:1px solid #c0cfe8;font-weight:600;background:#f4f7fb}
tr.total td{border-top:2px solid #0a2040;font-weight:700;background:#e8eef8}
tr.grand td{border-top:3px double #0a2040;font-weight:700;font-size:10pt;background:#dde6f4}
tr.spacer td{padding:3px;border:none;background:none}
.balance-ok{text-align:center;color:#1a6a2a;font-size:9pt;font-weight:600;
  margin-top:14px;padding:5px 10px;border:1px solid #b0d8b0;border-radius:4px;background:#f4fff8}
.footer{margin-top:14px;font-size:8pt;color:#999;text-align:center;border-top:1px solid #e0e0e0;padding-top:8px}
@media print{tr.sec-hdr td,tr.sub-hdr td,tr.subtotal td,tr.total td,tr.grand td,
  .balance-ok{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body><div class="page">
  <div class="co-name">${esc(company)}</div>
  <div class="rpt-title">قائمة المركز المالي</div>
  <div class="meta">كما في نهاية: ${curLbl}${hasCmp?` &nbsp;|&nbsp; مقارنة بـ: ${cmpLbl}`:''}<br>تاريخ الإنشاء: ${genDate}</div>
  <div class="currency">المبالغ بالريال السعودي</div>
  <table>
    <thead><tr><th>البيان</th><th class="num">${curLbl}</th>${cmpTh}</tr></thead>
    <tbody>${tb}</tbody>
  </table>
  <div class="balance-ok">✓ الميزانية متوازنة — الأصول (${Math.round(totalA).toLocaleString('ar-SA')}) = الالتزامات (${Math.round(totalL).toLocaleString('ar-SA')}) + حقوق الملكية (${Math.round(totalE).toLocaleString('ar-SA')})</div>
  <div class="footer">تم إنشاؤه من نظام MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div></body>
</html>`;

  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `قائمة_المركز_المالي_${asOf}.html`; a.click();
  URL.revokeObjectURL(url);
}

// ── CASH FLOW tab ─────────────────────────────────────────────────────────────

// Indirect method: derives monthly CF from BS balance changes + P&L net income.
// Signs follow Saudi SME / IFRS for SMEs Section 7:
//   Asset accounts (debit-normal): balance increase = cash outflow → negate Δ
//   Liability accounts (credit-normal): stored negative; becoming more negative = grew = cash inflow → negate Δ
function cfMonthly(bsRows, plRows, bfRows) {
  const months = [...new Set(bsRows.map(r => r.month))].sort();
  const byMonth = {};
  months.forEach(mo => {
    byMonth[mo] = {};
    bsRows.filter(r => r.month === mo).forEach(r => { byMonth[mo][r.grpCode] = r.balance; });
  });
  const plByMonth = {};
  (plRows || []).forEach(m => {
    const g = (m.revenue||0) - (m.cogs||0) - (m.otherCost||0);
    const x = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    plByMonth[m.month] = g - x;
  });
  // Bank-facilities balance by month (account 2010202%) — carry-forward so quiet months don't corrupt deltas
  const bfByMonth = {};
  (bfRows || []).forEach(r => { bfByMonth[r.month] = r.balance; });
  const bfCarried = {};
  let _lastBF = 0;
  months.forEach(mo => {
    if (bfByMonth[mo] !== undefined) _lastBF = bfByMonth[mo];
    bfCarried[mo] = _lastBF;
  });

  return months.map((mo, i) => {
    const cur  = byMonth[mo];
    const prev = i > 0 ? byMonth[months[i - 1]] : {};
    const label = (bsRows.find(r => r.month === mo) || {}).label || mo;
    const b = c => cur[c]  || 0;
    const p = c => prev[c] || 0;
    const Δ = c => b(c) - p(c);

    const openingCash = p('10301');
    const closingCash = b('10301');
    const netIncome   = plByMonth[mo] !== undefined ? plByMonth[mo] : 0;

    const prevMo          = i > 0 ? months[i - 1] : null;
    const bf_cur          = bfCarried[mo];
    const bf_prev         = prevMo ? bfCarried[prevMo] : 0;
    const Δ_bf            = bf_cur - bf_prev;
    const δBankFacilities = -Δ_bf;

    const δInventory = -Δ('10302');
    const δAR        = -Δ('10303');
    const δEmpRec    = -Δ('10304');
    const δOtherCA   = -Δ('10305');
    const δAP        = -Δ('20101');
    const δOtherPay  = -(Δ('20102') - Δ_bf);
    const δAccrued   = -Δ('20103');
    const wcAdjust   = δInventory + δAR + δEmpRec + δOtherCA + δAP + δOtherPay + δAccrued;
    const operatingCF = netIncome + wcAdjust;

    const FIXED        = ['10101','10102','10103','10104','10105','10106','10107','10108'];
    const δFixedAssets = -FIXED.reduce((s, c) => s + Δ(c), 0);
    const δProjects    = -Δ('10201');
    const investingCF  = δFixedAssets + δProjects;

    const δLTLoans    = -Δ('20201');
    const δCapital    = -Δ('30101');
    const δPartners   = -Δ('30102');
    const financingCF = δLTLoans + δBankFacilities + δCapital + δPartners;

    return {
      month: mo, label,
      openingCash, closingCash, netCashChange: closingCash - openingCash,
      netIncome, δInventory, δAR, δEmpRec, δOtherCA, δAP, δOtherPay, δAccrued,
      wcAdjust, operatingCF, δFixedAssets, δProjects, investingCF,
      δLTLoans, δBankFacilities, δCapital, δPartners, financingCF,
    };
  });
}

function aggregateCF(rows) {
  if (!rows.length) return null;
  const keys = ['netIncome','δInventory','δAR','δEmpRec','δOtherCA','δAP','δOtherPay','δAccrued',
                 'wcAdjust','operatingCF','δFixedAssets','δProjects','investingCF',
                 'δLTLoans','δBankFacilities','δCapital','δPartners','financingCF'];
  const agg = {}; keys.forEach(k => { agg[k] = 0; });
  rows.forEach(m => { keys.forEach(k => { agg[k] += (m[k] || 0); }); });
  agg.openingCash   = rows[0].openingCash;
  agg.closingCash   = rows[rows.length - 1].closingCash;
  agg.netCashChange = agg.closingCash - agg.openingCash;
  return agg;
}

// Returns the previous comparable period's CF rows for a given period value
function getCFComparablePrev(period, allCF) {
  if (!period || period === 'all' || period === 'ytd') return [];
  if (period.startsWith('year-')) {
    const y = period.slice(5), pY = String(+y - 1);
    return allCF.filter(m => m.month.startsWith(pY));
  }
  if (period.startsWith('quarter-')) {
    const [, y, q] = period.split('-');
    let pY = +y, pQ = +q - 1;
    if (pQ === 0) { pQ = 4; pY -= 1; }
    return allCF.filter(m => m.month.startsWith(String(pY)) && qOf(m.month) === pQ);
  }
  // Single month → previous month
  const months = allCF.map(m => m.month).sort();
  const idx = months.indexOf(period);
  if (idx <= 0) return [];
  return allCF.filter(m => m.month === months[idx - 1]);
}

// Returns the human-readable label for a period value
function _cfPeriodLabel(period, allCF) {
  if (period === 'all') return 'كل الفترة المتاحة';
  if (period === 'ytd') return `${CUR_Y()} حتى الآن`;
  if (period.startsWith('year-')) return `سنة ${period.slice(5)}`;
  if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); return `${y} — ${Q_LABELS[+q-1]}`; }
  const row = allCF.find(m => m.month === period);
  return row ? row.label : period;
}

function buildCFPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('cf-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="all">كل الفترة المتاحة</option>';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const isCur = y === CUR_Y();
    const oy = document.createElement('option');
    oy.value = isCur ? 'ytd' : 'year-' + y;
    oy.textContent = isCur ? `السنة الجارية ${y} (حتى الآن)` : `السنة ${y} كاملاً`;
    sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      if (months.some(m => m.startsWith(y) && qOf(m) === q)) {
        const oq = document.createElement('option');
        oq.value = `quarter-${y}-${q}`;
        oq.textContent = `${y} — ${Q_LABELS[q-1]}`;
        sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o   = document.createElement('option');
    o.value = mo;
    o.textContent = row ? row.label : mo;
    sel.appendChild(o);
  });
  // Restore selection or default to latest month
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || 'all';
}

function renderCFStatement(c, cPrev, hasCmp, periodLabel, cmpLabel) {
  const NC  = hasCmp ? 3 : 2;
  const fv  = v => fmtPlNum(v) + ' ر.س';
  const cv  = v => `<td class="pl-num" style="${v < 0 ? 'color:#da4a4a' : v > 0 ? 'color:#c0d8f0' : 'color:#5a7a9a'}">${fv(v)}</td>`;
  const pv  = v => hasCmp ? `<td class="pl-num" style="color:#4a6a8a;font-size:.81rem">${(cPrev && v !== undefined) ? fv(v) : '—'}</td>` : '';
  const row = (indent, lbl, cur, cmp) =>
    `<tr><td class="${indent ? 'pl-indent' : ''}" style="${indent ? '' : 'color:#c0d8f0'}">${lbl}</td>${cv(cur)}${pv(cmp)}</tr>`;
  const sh  = t =>
    `<tr><td colspan="${NC}" style="font-size:.72rem;color:#4a6a8a;font-style:italic;padding:8px 14px 3px;background:transparent;border:none">${t}</td></tr>`;
  const sec = t => `<tr><td colspan="${NC}" class="pl-section">${t}</td></tr>`;
  const sub = (lbl, cur, cmp) => {
    const col = cur < 0 ? 'color:#da4a4a' : 'color:#4ada8e';
    return `<tr class="pl-subtotal">
      <td><strong>${lbl}</strong></td>
      <td class="pl-num" style="${col}"><strong>${fv(cur)}</strong></td>
      ${hasCmp ? `<td class="pl-num" style="color:#4a6a8a;font-size:.81rem"><strong>${cPrev ? fv(cmp) : '—'}</strong></td>` : ''}
    </tr>`;
  };
  const tot = (lbl, cur, cmp, col) => {
    const fc = col || (cur >= 0 ? '#5baef0' : '#da4a4a');
    return `<tr class="pl-total">
      <td><strong>${lbl}</strong></td>
      <td class="pl-num" style="color:${fc}"><strong>${fv(cur)}</strong></td>
      ${hasCmp ? `<td class="pl-num" style="color:#4a6a8a"><strong>${cPrev ? fv(cmp) : '—'}</strong></td>` : ''}
    </tr>`;
  };

  const hdr = hasCmp
    ? `<tr style="background:#071828;border-bottom:1px solid #1a3a5a">
        <td style="padding:7px 14px;color:#5a7a9a;font-size:.78rem"></td>
        <td class="pl-num" style="color:#7090b0;font-size:.78rem;font-weight:600;padding:7px 14px">${periodLabel}</td>
        <td class="pl-num" style="color:#4a6a8a;font-size:.78rem;font-weight:500;padding:7px 14px">${cmpLabel}</td>
      </tr>` : '';

  const check   = c.openingCash + c.netCashChange;
  const diff    = Math.abs(check - c.closingCash);
  const checkOK = diff < 1;

  return [
    hdr,
    sec('أولاً: التدفقات النقدية من الأنشطة التشغيلية'),
    row(false, 'صافي الربح (الخسارة) للفترة', c.netIncome, cPrev?.netIncome),
    sh('تعديلات في رأس المال العامل:'),
    row(true, '(الزيادة)/نقص في المخزون',                 c.δInventory,     cPrev?.δInventory),
    row(true, '(الزيادة)/نقص في الذمم المدينة التجارية',  c.δAR,            cPrev?.δAR),
    row(true, '(الزيادة)/نقص في ذمم الموظفين والسلف',     c.δEmpRec,        cPrev?.δEmpRec),
    row(true, '(الزيادة)/نقص في أرصدة مدينة أخرى',         c.δOtherCA,       cPrev?.δOtherCA),
    row(true, 'زيادة/(نقص) في الذمم الدائنة التجارية',     c.δAP,            cPrev?.δAP),
    row(true, 'زيادة/(نقص) في أرصدة دائنة أخرى',           c.δOtherPay,      cPrev?.δOtherPay),
    row(true, 'زيادة/(نقص) في المصروفات المستحقة',          c.δAccrued,       cPrev?.δAccrued),
    sub('صافي التدفقات النقدية من الأنشطة التشغيلية', c.operatingCF, cPrev?.operatingCF),

    sec('ثانياً: التدفقات النقدية من أنشطة الاستثمار'),
    row(true, '(الزيادة)/النقص في الأصول الثابتة (صافي)',  c.δFixedAssets,   cPrev?.δFixedAssets),
    row(true, '(الزيادة)/النقص في المشاريع قيد التنفيذ',    c.δProjects,      cPrev?.δProjects),
    sub('صافي التدفقات النقدية من أنشطة الاستثمار', c.investingCF, cPrev?.investingCF),

    sec('ثالثاً: التدفقات النقدية من أنشطة التمويل'),
    row(true, 'زيادة/(نقص) في التسهيلات البنكية',           c.δBankFacilities,cPrev?.δBankFacilities),
    row(true, 'زيادة/(نقص) في القروض طويلة الأجل',          c.δLTLoans,       cPrev?.δLTLoans),
    row(true, 'زيادة/(نقص) في رأس المال المدفوع',           c.δCapital,       cPrev?.δCapital),
    row(true, 'زيادة/(نقص) في حساب الشركاء',                c.δPartners,      cPrev?.δPartners),
    sub('صافي التدفقات النقدية من أنشطة التمويل', c.financingCF, cPrev?.financingCF),

    `<tr><td colspan="${NC}" style="padding:5px 0"></td></tr>`,
    tot('صافي الزيادة (النقص) في النقدية وما يعادلها', c.netCashChange, cPrev?.netCashChange),
    row(true, 'رصيد النقدية وما يعادلها في بداية الفترة', c.openingCash, cPrev?.openingCash),
    tot('رصيد النقدية وما يعادلها في نهاية الفترة', c.closingCash, cPrev?.closingCash, '#c0d8f0'),

    `<tr><td colspan="${NC}" style="font-size:.71rem;padding:6px 14px;background:${checkOK ? '#061410' : '#1a0808'};color:${checkOK ? '#3a7a4a' : '#aa4444'};border-top:1px solid ${checkOK ? '#1a4a2a' : '#6a2222'}">
      ${checkOK ? '✓' : '⚠'} مراجعة: ${fmt(c.openingCash)} + ${fmtPlNum(c.netCashChange)} = ${fmt(c.closingCash)}
      ${checkOK ? '' : ` — فرق: ${fmtPlNum(check - c.closingCash)}`}
    </td></tr>`,
  ].join('\n');
}

function renderCF() {
  const bs = State.get('bs');
  const pl = State.get('pl');

  if (!bs || !bs.length) {
    ['cf-kpis','cf-statement-body','cf-monthly-tbody'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    return;
  }

  buildCFPeriodOptions();
  const allCF   = cfMonthly(bs, pl, State.get('bankFacilities') || []);
  const period  = (document.getElementById('cf-period-sel') || {}).value || 'all';
  const cmpMode = (document.getElementById('cf-cmp-sel')    || {}).value || 'prev';

  let filtered;
  if (period === 'all')                   filtered = allCF;
  else if (period === 'ytd')              filtered = allCF.filter(m => m.month.startsWith(CUR_Y()));
  else if (period.startsWith('year-'))    { const y = period.slice(5); filtered = allCF.filter(m => m.month.startsWith(y)); }
  else if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); filtered = allCF.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
  else                                    filtered = allCF.filter(m => m.month === period);
  if (!filtered.length) filtered = allCF;

  const filteredCmp = cmpMode === 'prev' ? getCFComparablePrev(period, allCF) : [];
  const c     = aggregateCF(filtered);
  const cPrev = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;
  if (!c) return;

  const periodLabel = _cfPeriodLabel(period, allCF);
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';

  // ── KPIs ──
  const kpiDelta = (cur, prev) => {
    if (!hasCmp || !prev || Math.abs(prev) < 1) return '';
    const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
    const col = +pct >= 0 ? '#4ada8e' : '#da4a4a';
    const arr = +pct >= 0 ? '▲' : '▼';
    return `<div style="font-size:.7rem;color:${col};margin-top:2px">${arr} ${Math.abs(+pct)}%</div>
            <div style="font-size:.7rem;color:#3a5a7a;margin-top:1px">مقابل: ${fmtPlNum(prev)}</div>`;
  };
  document.getElementById('cf-kpis').innerHTML = [
    { lbl:'التدفقات التشغيلية',      cur:c.operatingCF,   prev:cPrev?.operatingCF,   accent:c.operatingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'التدفقات الاستثمارية',    cur:c.investingCF,   prev:cPrev?.investingCF,   accent:c.investingCF  >=0?'#4ada8e':'#da9a4a' },
    { lbl:'التدفقات التمويلية',      cur:c.financingCF,   prev:cPrev?.financingCF,   accent:c.financingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'صافي التغيير في النقدية', cur:c.netCashChange, prev:cPrev?.netCashChange, accent:c.netCashChange>=0?'#5baef0':'#da4a4a' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}">
    <div class="lbl">${k.lbl}</div>
    <div class="val">${fmtPlNum(k.cur)} ر.س</div>
    ${kpiDelta(k.cur, k.prev)}
  </div>`).join('');

  // ── Flow bars ──
  const cfFlowEl = document.getElementById('cf-flow-bars');
  if (cfFlowEl) {
    const vals  = [c.operatingCF, c.investingCF, c.financingCF, c.netCashChange];
    const pvals = hasCmp ? [cPrev.operatingCF, cPrev.investingCF, cPrev.financingCF, cPrev.netCashChange] : [];
    const maxAbs = Math.max(...vals.map(Math.abs), ...pvals.map(Math.abs), 1);
    const flowBar = (lbl, val, col, prevVal) => {
      const w  = Math.min(100, Math.abs(val)    / maxAbs * 100).toFixed(1);
      const wp = hasCmp ? Math.min(100, Math.abs(prevVal) / maxAbs * 100).toFixed(1) : 0;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:#c0d0e0;font-size:.82rem">${lbl}</span>
          <span style="color:${col};font-size:.82rem;font-weight:600">${fmtPlNum(val)} ر.س${hasCmp ? `<span style="color:#3a5a7a;font-size:.72rem;margin-right:8px"> / ${fmtPlNum(prevVal)}</span>` : ''}</span>
        </div>
        <div style="height:9px;border-radius:5px;background:#061420;position:relative;overflow:hidden">
          ${hasCmp ? `<div style="position:absolute;top:0;height:100%;border-radius:5px;width:${wp}%;background:${col}33;border-left:1px solid ${col}55"></div>` : ''}
          <div style="position:absolute;top:0;height:100%;border-radius:5px;width:${w}%;background:${col}99;transition:width .4s"></div>
        </div>
      </div>`;
    };
    cfFlowEl.innerHTML =
      flowBar('التدفقات التشغيلية',      c.operatingCF,  c.operatingCF >=0?'#4ada8e':'#da4a4a', cPrev?.operatingCF)  +
      flowBar('التدفقات الاستثمارية',    c.investingCF,  c.investingCF >=0?'#4ada8e':'#da9a4a', cPrev?.investingCF)  +
      flowBar('التدفقات التمويلية',      c.financingCF,  c.financingCF >=0?'#4ada8e':'#da4a4a', cPrev?.financingCF)  +
      flowBar('صافي التغيير في النقدية', c.netCashChange,c.netCashChange>=0?'#5baef0':'#da4a4a', cPrev?.netCashChange);
  }

  // ── Statement ──
  document.getElementById('cf-statement-body').innerHTML =
    renderCFStatement(c, cPrev, hasCmp, periodLabel, cmpLabel);

  // ── Trend chart ──
  renderCFTrend(allCF);

  // ── Monthly table — all months, highlight those in selected period ──
  const inRange = new Set(filtered.map(m => m.month));
  document.getElementById('cf-monthly-tbody').innerHTML = allCF.map(m => {
    const opCls  = m.operatingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const invCls = m.investingCF  >= 0 ? 'color:#4ada8e' : 'color:#da9a4a';
    const finCls = m.financingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const netCls = m.netCashChange >= 0 ? 'color:#5baef0' : 'color:#da4a4a';
    const active = inRange.has(m.month) && period !== 'all';
    return `<tr class="${active ? 'cf-mo-active' : ''}">
      <td>${m.label}</td>
      <td class="num" style="${opCls}">${fmtPlNum(m.operatingCF)}</td>
      <td class="num" style="${invCls}">${fmtPlNum(m.investingCF)}</td>
      <td class="num" style="${finCls}">${fmtPlNum(m.financingCF)}</td>
      <td class="num" style="${netCls}">${fmtPlNum(m.netCashChange)}</td>
      <td class="num" style="color:#5a7a9a">${fmt(m.openingCash)}</td>
      <td class="num">${fmt(m.closingCash)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';
}

async function exportCFExcel() {
  const bs = State.get('bs');
  const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات لتصديرها'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const allCF   = cfMonthly(bs, pl, State.get('bankFacilities') || []);
  const period  = (document.getElementById('cf-period-sel') || {}).value || 'all';
  const cmpMode = (document.getElementById('cf-cmp-sel')    || {}).value || 'prev';

  let filtered;
  if (period === 'all')                   filtered = allCF;
  else if (period === 'ytd')              filtered = allCF.filter(m => m.month.startsWith(CUR_Y()));
  else if (period.startsWith('year-'))    { const y = period.slice(5); filtered = allCF.filter(m => m.month.startsWith(y)); }
  else if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); filtered = allCF.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
  else                                    filtered = allCF.filter(m => m.month === period);
  if (!filtered.length) filtered = allCF;

  const filteredCmp = cmpMode === 'prev' ? getCFComparablePrev(period, allCF) : [];
  const c     = aggregateCF(filtered);
  const cPrev = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;
  if (!c) return;

  const periodLabel = _cfPeriodLabel(period, allCF);
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';

  const FONT   = 'Calibri';
  const NC     = hasCmp ? 3 : 2;
  const numFmt = '#,##0;[Red](#,##0);"-"';
  const CLR = {
    navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
    bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
    textLight:'FF6A8AAA', textGray:'FF888888',
    greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
  };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: Statement ────────────────────────────────────────────────────
  const ws = wb.addWorksheet('التدفقات النقدية', { views:[{ rightToLeft:true }] });
  ws.pageSetup.paperSize=9; ws.pageSetup.orientation='portrait';
  ws.pageSetup.fitToPage=true; ws.pageSetup.fitToWidth=1;
  ws.pageSetup.margins={left:0.6,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws.columns=[{width:50},{width:20},...(hasCmp?[{width:20}]:[])];

  const spanRow = row => ws.mergeCells(row.number,1,row.number,NC);
  const addTitle = (text,sz,fc,bg) => {
    const row=ws.addRow([text]); row.height=sz>12?32:22; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'};
  };
  const addSpacer = (h=5) => {
    const row=ws.addRow(['']); row.height=h; spanRow(row);
    row.getCell(1).fill=solid(CLR.white);
  };
  const setNum = (cell,v,fc,bold) => {
    cell.value=(v!==null&&v!==undefined)?+v.toFixed(0):null;
    cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
    cell.font={name:FONT,size:9.5,color:{argb:fc||CLR.textNavy},bold:bold||false};
  };
  const addSecRow = text => {
    const row=ws.addRow([text]); row.height=20; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
    c.fill=solid(CLR.navy); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addSubHdrRow = text => {
    const row=ws.addRow([text]); row.height=15; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:8.5,italic:true,color:{argb:CLR.textLight}};
    c.fill=solid('FFF4F7FB'); c.alignment={horizontal:'right',vertical:'middle',indent:2};
  };
  const addItemRow = (label,cur,cmp,indent=true) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=17;
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,color:{argb:CLR.textDark}};
    c1.alignment={horizontal:'right',vertical:'middle',indent:indent?2:1};
    c1.border={bottom:bdr('hair','FFE8ECF0')};
    setNum(row.getCell(2),cur,CLR.textNavy,false);
    row.getCell(2).border={bottom:bdr('hair','FFE8ECF0')};
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      row.getCell(3).border={bottom:bdr('hair','FFE8ECF0')};
      row.getCell(3).fill=solid('FFF8FAFE');
    }
  };
  const addSubTotRow = (label,cur,cmp) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=18;
    const tb={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.textNavy}};
    c1.fill=solid(CLR.bluePale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=tb;
    setNum(row.getCell(2),cur,CLR.textNavy,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.bluePale),border:tb});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      Object.assign(row.getCell(3),{fill:solid('FFF0F4FA'),border:tb});
    }
  };
  const addTotalRow = (label,cur,cmp,fc) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=20;
    const bord={top:bdr('medium',CLR.navy),bottom:bdr('medium',CLR.navy)};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.navyDark}};
    c1.fill=solid(CLR.blueXPale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=bord;
    setNum(row.getCell(2),cur,fc||CLR.navyDark,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.blueXPale),border:bord});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textBlue,true);
      Object.assign(row.getCell(3),{fill:solid('FFD5E0F0'),border:bord});
    }
  };

  const dbName  = State.get('activeDb') || '';
  const company = dbName === 'MekSoftDb1' ? 'أبعاد للحديد والصلب'
    : dbName === 'MekSoftDb2' ? 'وسام للحديد والصلب' : dbName || 'المنشأة';
  const genDate = new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'});

  addTitle(company,14,CLR.white,CLR.navyDark);
  addTitle('قائمة التدفقات النقدية (الطريقة غير المباشرة)',12,CLR.white,CLR.navy);
  addTitle(`الفترة: ${periodLabel}${hasCmp?`  |  للمقارنة: ${cmpLabel}`:''}`,9.5,'FFAACCE8',CLR.navyDark);
  addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`,8.5,CLR.textLight,CLR.navyDark);
  addSpacer(4);
  {
    const row=ws.addRow(['البيان',periodLabel,...(hasCmp?[cmpLabel]:[])]);
    row.height=22;
    row.eachCell({includeEmpty:true},(cell,ci)=>{
      cell.font={name:FONT,size:10,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
  }
  addSpacer(3);
  addSecRow('أولاً: التدفقات النقدية من الأنشطة التشغيلية');
  addItemRow('صافي الربح (الخسارة) للفترة',             c.netIncome,      cPrev?.netIncome,      false);
  addSubHdrRow('تعديلات في رأس المال العامل:');
  addItemRow('(الزيادة)/نقص في المخزون',                c.δInventory,     cPrev?.δInventory);
  addItemRow('(الزيادة)/نقص في الذمم المدينة التجارية', c.δAR,            cPrev?.δAR);
  addItemRow('(الزيادة)/نقص في ذمم الموظفين والسلف',    c.δEmpRec,        cPrev?.δEmpRec);
  addItemRow('(الزيادة)/نقص في أرصدة مدينة أخرى',        c.δOtherCA,       cPrev?.δOtherCA);
  addItemRow('زيادة/(نقص) في الذمم الدائنة التجارية',    c.δAP,            cPrev?.δAP);
  addItemRow('زيادة/(نقص) في أرصدة دائنة أخرى',          c.δOtherPay,      cPrev?.δOtherPay);
  addItemRow('زيادة/(نقص) في المصروفات المستحقة',         c.δAccrued,       cPrev?.δAccrued);
  addSubTotRow('صافي التدفقات النقدية من الأنشطة التشغيلية', c.operatingCF, cPrev?.operatingCF);

  addSpacer(3);
  addSecRow('ثانياً: التدفقات النقدية من أنشطة الاستثمار');
  addItemRow('(الزيادة)/النقص في الأصول الثابتة (صافي)',  c.δFixedAssets,   cPrev?.δFixedAssets);
  addItemRow('(الزيادة)/النقص في المشاريع قيد التنفيذ',    c.δProjects,      cPrev?.δProjects);
  addSubTotRow('صافي التدفقات النقدية من أنشطة الاستثمار', c.investingCF, cPrev?.investingCF);

  addSpacer(3);
  addSecRow('ثالثاً: التدفقات النقدية من أنشطة التمويل');
  addItemRow('زيادة/(نقص) في التسهيلات البنكية',          c.δBankFacilities,cPrev?.δBankFacilities);
  addItemRow('زيادة/(نقص) في القروض طويلة الأجل',         c.δLTLoans,       cPrev?.δLTLoans);
  addItemRow('زيادة/(نقص) في رأس المال المدفوع',          c.δCapital,       cPrev?.δCapital);
  addItemRow('زيادة/(نقص) في حساب الشركاء',               c.δPartners,      cPrev?.δPartners);
  addSubTotRow('صافي التدفقات النقدية من أنشطة التمويل', c.financingCF, cPrev?.financingCF);

  addSpacer(3);
  addTotalRow('صافي الزيادة (النقص) في النقدية وما يعادلها', c.netCashChange, cPrev?.netCashChange, 'FF1A5A9A');
  addItemRow('رصيد النقدية وما يعادلها في بداية الفترة', c.openingCash, cPrev?.openingCash, false);
  addTotalRow('رصيد النقدية وما يعادلها في نهاية الفترة', c.closingCash, cPrev?.closingCash, 'FF0A2040');
  addSpacer(3);
  {
    const balanced = Math.abs(c.openingCash + c.netCashChange - c.closingCash) < 1;
    const note = balanced
      ? `✓ الميزانية متوازنة: ${Math.round(c.openingCash).toLocaleString('ar-SA')} + ${Math.round(c.netCashChange).toLocaleString('ar-SA')} = ${Math.round(c.closingCash).toLocaleString('ar-SA')}`
      : `⚠ فرق في التسوية: ${(c.openingCash + c.netCashChange - c.closingCash).toFixed(2)}`;
    const row=ws.addRow([note]); row.height=17; spanRow(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:8.5,bold:balanced,color:{argb:balanced?CLR.greenText:'FFCC4444'}};
    cell.fill=solid(balanced?CLR.greenBg:'FFFFF4F4');
    cell.alignment={horizontal:'center',vertical:'middle'};
    cell.border={top:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),bottom:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),
                 left:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),right:bdr('thin',balanced?CLR.greenBdr:'FFCC8888')};
  }

  // ── Sheet 2: Monthly breakdown ────────────────────────────────────────────
  const ws2 = wb.addWorksheet('التطور الشهري', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='landscape';
  ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.columns=[{width:16},{width:17},{width:17},{width:17},{width:17},{width:17},{width:17}];
  {
    const hr=ws2.addRow(['الشهر','تشغيلية','استثمارية','تمويلية','صافي التغيير','رصيد الافتتاح','رصيد الاختتام']);
    hr.height=20;
    hr.eachCell((cell,ci)=>{
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
    const inRange = new Set(filtered.map(m => m.month));
    allCF.forEach(m => {
      const isActive = inRange.has(m.month) && period !== 'all';
      const row=ws2.addRow([m.label,m.operatingCF,m.investingCF,m.financingCF,m.netCashChange,m.openingCash,m.closingCash]);
      row.height=16;
      row.getCell(1).font={name:FONT,size:9,color:{argb:isActive?'FFC8E8FF':CLR.textGray}};
      row.getCell(1).alignment={horizontal:'right',vertical:'middle'};
      if(isActive) row.getCell(1).fill=solid('FF07182A');
      for(let ci=2;ci<=7;ci++){
        const cell=row.getCell(ci);
        const v=cell.value||0;
        cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
        cell.font={name:FONT,size:9,color:{argb:
          ci>=6 ? CLR.textNavy : v<0 ? 'FFDA4A4A' : ci===5 ? 'FF5BAEF0' : 'FF4ADA8E'}};
        if(isActive) cell.fill=solid('FF07182A');
        cell.border={bottom:bdr('hair','FF0E2540')};
      }
    });
    // Totals row for selected period
    const tr=ws2.addRow(['إجمالي الفترة المحددة',c.operatingCF,c.investingCF,c.financingCF,c.netCashChange,c.openingCash,c.closingCash]);
    tr.height=20;
    const totBrd={top:bdr('double',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)};
    tr.eachCell({includeEmpty:true},cell=>{cell.fill=solid(CLR.blueXPale);cell.border=totBrd;});
    tr.getCell(1).font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    tr.getCell(1).alignment={horizontal:'right',vertical:'middle'};
    for(let ci=2;ci<=7;ci++){
      const cell=tr.getCell(ci);
      cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `قائمة_التدفقات_النقدية_${period === 'all' ? 'كل_الفترة' : period}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── RATIOS tab ─────────────────────────────────────────────────────────────────

const RATIO_DEFS = [
  { key:'currentRatio',  lbl:'النسبة الجارية',          dec:2, sfx:'×',    lo:1,   hi:1.5, hb:true,  group:'💧 السيولة',       hint:'> 1.5 جيد · > 2 ممتاز' },
  { key:'quickRatio',    lbl:'النسبة السريعة',           dec:2, sfx:'×',    lo:0.7, hi:1,   hb:true,  group:'💧 السيولة',       hint:'> 1.0 جيد' },
  { key:'cashRatio',     lbl:'نسبة النقدية',             dec:2, sfx:'×',    lo:0.2, hi:0.5, hb:true,  group:'💧 السيولة',       hint:'> 0.5 جيد' },
  { key:'grossMargin',   lbl:'هامش الربح الإجمالي',     dec:1, sfx:'%',    lo:10,  hi:20,  hb:true,  group:'📈 الربحية',        hint:'> 20% ممتاز' },
  { key:'netMargin',     lbl:'هامش الربح الصافي',       dec:1, sfx:'%',    lo:3,   hi:8,   hb:true,  group:'📈 الربحية',        hint:'> 8% جيد' },
  { key:'roa',           lbl:'العائد على الأصول',        dec:1, sfx:'%',    lo:5,   hi:10,  hb:true,  group:'📈 الربحية',        hint:'> 10% ممتاز' },
  { key:'roe',           lbl:'العائد على الملكية',       dec:1, sfx:'%',    lo:8,   hi:15,  hb:true,  group:'📈 الربحية',        hint:'> 15% ممتاز' },
  { key:'debtRatio',     lbl:'الديون من الأصول',         dec:1, sfx:'%',    lo:50,  hi:70,  hb:false, group:'⚖️ الرفع المالي',   hint:'< 50% مريح' },
  { key:'debtEquity',    lbl:'الدين / الملكية',          dec:2, sfx:'×',    lo:1,   hi:2,   hb:false, group:'⚖️ الرفع المالي',   hint:'< 1× مريح' },
  { key:'intCoverage',   lbl:'تغطية الفوائد',            dec:1, sfx:'×',    lo:1.5, hi:3,   hb:true,  group:'⚖️ الرفع المالي',   hint:'> 3× ممتاز' },
  { key:'assetTurnover', lbl:'دوران الأصول',             dec:2, sfx:'×',    lo:0.5, hi:1,   hb:true,  group:'⚙️ الكفاءة',        hint:'> 1× جيد' },
  { key:'arDays',        lbl:'أيام تحصيل المدينين',      dec:0, sfx:' يوم', lo:60,  hi:90,  hb:false, group:'⚙️ الكفاءة',        hint:'< 60 يوم ممتاز' },
  { key:'invDays',       lbl:'أيام دوران المخزون',       dec:0, sfx:' يوم', lo:60,  hi:90,  hb:false, group:'⚙️ الكفاءة',        hint:'< 60 يوم جيد' },
];

function getRatiosPlFrom(asOf, mode) {
  if (!asOf || mode === 'cumul') return null;
  if (mode === 'ytd')     return asOf.slice(0, 4) + '-01';
  if (mode === 'quarter') { const mo = parseInt(asOf.slice(5, 7)); return asOf.slice(0, 4) + '-' + String(Math.floor((mo - 1) / 3) * 3 + 1).padStart(2, '0'); }
  if (mode === 'month')   return asOf;
  return null;
}

function computeRatios(bs, pl, asOf, plFrom = null) {
  const rows = bs.filter(r => r.month === asOf);
  if (!rows.length) return null;
  const label = (rows[0] && rows[0].label) || asOf;

  // BS balances at month-end
  const c3x    = r => r.code3 || (r.grpCode && r.grpCode.slice(0, 3)) || '';
  const totalA    = rows.filter(r => c3x(r)[0] === '1').reduce((s,r) => s + r.balance, 0);
  const currA     = rows.filter(r => c3x(r) === '103').reduce((s,r) => s + r.balance, 0);
  const cash      = rows.filter(r => r.grpCode === '10301').reduce((s,r) => s + r.balance, 0);
  const inventory = rows.filter(r => r.grpCode === '10302').reduce((s,r) => s + r.balance, 0);
  const ar        = rows.filter(r => r.grpCode === '10303').reduce((s,r) => s + r.balance, 0);
  const totalL    = rows.filter(r => c3x(r)[0] === '2').reduce((s,r) => s - r.balance, 0);
  const currL     = rows.filter(r => c3x(r) === '201').reduce((s,r) => s - r.balance, 0);
  const totalE    = totalA - totalL;

  // P&L for the selected window (plFrom → asOf, or cumulative if plFrom null)
  const plToDate = (pl || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const c        = aggregatePL(plToDate);
  const nMonths  = Math.max(plToDate.length, 1);
  const ann      = v => v * (12 / nMonths);
  const annNI       = ann(c.netProfit);
  const annRev      = ann(c.revenue);
  const annCogs     = ann(c.cogs + (c.otherCost || 0));
  const annFin      = ann(c.fin);
  const annOpProfit = ann(c.operatingProfit);

  const safe = (num, den) => (den && den !== 0 && isFinite(num / den)) ? num / den : null;

  return {
    asOf, label, nMonths, totalA, currA, cash, inventory, ar, totalL, currL, totalE,
    annRev, annNI,
    // Liquidity
    currentRatio: safe(currA, currL),
    quickRatio:   safe(currA - inventory, currL),
    cashRatio:    safe(cash, currL),
    // Profitability
    grossMargin: safe(c.grossProfit * 100, c.revenue),
    netMargin:   safe(c.netProfit   * 100, c.revenue),
    roa:         safe(annNI * 100, totalA),
    roe:         totalE > 0 ? safe(annNI * 100, totalE) : null,
    // Leverage
    debtRatio:   safe(totalL * 100, totalA),
    debtEquity:  totalE > 0 ? safe(totalL, totalE) : null,
    intCoverage: annFin > 0 ? safe(annOpProfit, annFin) : null,
    // Efficiency
    assetTurnover: safe(annRev, totalA),
    arDays:        annRev > 0 ? safe(ar  * 365, annRev)  : null,
    invDays:       annCogs > 0 ? safe(inventory * 365, annCogs) : null,
  };
}

function buildRatiosPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('ratios-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const yMs = months.filter(m => m.startsWith(y));
    const oy  = document.createElement('option');
    oy.value = yMs[yMs.length - 1]; oy.textContent = `من بداية ${y} إلى الآن`; sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      const qMs = yMs.filter(m => qOf(m) === q);
      if (qMs.length) {
        const oq = document.createElement('option');
        oq.value = qMs[qMs.length - 1]; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o = document.createElement('option');
    o.value = mo; o.textContent = row ? row.label : mo; sel.appendChild(o);
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || '';
}

function renderRatiosTab() {
  const bs = State.get('bs');
  const pl = State.get('pl');
  if (!bs || !bs.length) return;

  buildRatiosPeriodOptions();
  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode') || {}).value || 'ytd';
  if (!asOf) return;

  const plFrom  = getRatiosPlFrom(asOf, plMode);
  const months  = [...new Set(bs.map(x => x.month))].sort();
  const asOfIdx = months.indexOf(asOf);
  const prevMo  = asOfIdx > 0 ? months[asOfIdx - 1] : null;
  const r       = computeRatios(bs, pl, asOf, plFrom);
  const rPrev   = prevMo ? computeRatios(bs, pl, prevMo, getRatiosPlFrom(prevMo, plMode)) : null;
  if (!r) return;

  // Update hint text
  const modeHints = { ytd:'الربحية تراكمية من بداية السنة حتى الشهر المحدد', cumul:'الربحية تراكمية من بداية البيانات', quarter:'الربحية للربع الحالي فقط (مُحوَّلة سنوياً)', month:'الربحية للشهر المحدد فقط (مُحوَّلة سنوياً)' };
  const hintEl = document.getElementById('ratios-mode-hint');
  if (hintEl) hintEl.textContent = modeHints[plMode] || '';

  // ── Helpers ──
  function clr(val, lo, hi, hb = true) {
    if (val === null || !isFinite(val)) return '#5a7a9a';
    return hb ? (val >= hi ? '#4ada8e' : val >= lo ? '#da9a4a' : '#da4a4a')
              : (val <= lo ? '#4ada8e' : val <= hi ? '#da9a4a' : '#da4a4a');
  }
  function fmtR(val, dec, sfx) {
    return (val === null || !isFinite(val)) ? '—' : val.toFixed(dec) + sfx;
  }
  function arw(cur, prev, hb = true) {
    if (cur === null || prev === null || !isFinite(cur) || !isFinite(prev)) return '';
    const d = cur - prev;
    const pct = Math.abs(prev) > 0.0001 ? Math.abs(d / prev) * 100 : 0;
    if (pct < 0.5) return `<span style="color:#5a7a9a;font-size:.75rem"> →</span>`;
    const good = hb ? d > 0 : d < 0;
    return `<span style="color:${good ? '#4ada8e' : '#da4a4a'};font-size:.75rem"> ${d > 0 ? '▲' : '▼'}${pct.toFixed(1)}%</span>`;
  }
  function rRow(lbl, val, fmtd, col, hint, arrow) {
    const v = (val === null || !isFinite(val))
      ? `<span style="color:#5a7a9a">—</span>`
      : `<span style="color:${col};font-weight:600">${fmtd}</span>${arrow || ''}`;
    return `<tr>
      <td style="padding:8px 4px;color:#c0d0e0;font-size:.85rem">${lbl}</td>
      <td class="num" style="padding:8px 4px">${v}</td>
      <td style="padding:8px 4px;color:#5a7a9a;font-size:.73rem">${hint}</td>
    </tr>`;
  }

  // ── KPIs ──
  document.getElementById('ratios-kpis').innerHTML = [
    { lbl:'النسبة الجارية',     fmt:fmtR(r.currentRatio,2,'×'), col:clr(r.currentRatio,1,1.5) },
    { lbl:'هامش الربح الصافي',  fmt:fmtR(r.netMargin,1,'%'),    col:clr(r.netMargin,3,8) },
    { lbl:'العائد على الملكية', fmt:fmtR(r.roe,1,'%'),          col:clr(r.roe,8,15) },
    { lbl:'الدين / الملكية',    fmt:fmtR(r.debtEquity,2,'×'),   col:clr(r.debtEquity,1,2,false) },
  ].map(k => `<div class="kpi" style="--accent:${k.col}"><div class="lbl">${k.lbl}</div><div class="val">${k.fmt}</div></div>`).join('');

  // ── Early Warning ──
  const checks = RATIO_DEFS.filter(d => !['grossMargin','assetTurnover','invDays'].includes(d.key));
  const redItems   = checks.filter(ch => clr(r[ch.key], ch.lo, ch.hi, ch.hb) === '#da4a4a');
  const amberItems = checks.filter(ch => clr(r[ch.key], ch.lo, ch.hi, ch.hb) === '#da9a4a');
  const warnGroup  = (icon, col, items, title) => !items.length ? '' :
    `<div style="flex:1;min-width:220px;background:#0d1b2a;border:1px solid ${col}55;border-radius:8px;padding:12px">
      <div style="color:${col};font-size:.8rem;font-weight:700;margin-bottom:8px">${icon} ${title}</div>
      ${items.map(ch => {
        const p = rPrev ? rPrev[ch.key] : null;
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1e2e40">
          <span style="color:#c0d0e0;font-size:.82rem">${ch.lbl}</span>
          <span style="color:${col};font-weight:600;font-size:.82rem">${fmtR(r[ch.key],ch.dec,ch.sfx)}${arw(r[ch.key],p,ch.hb)}</span>
        </div>`;
      }).join('')}
    </div>`;
  document.getElementById('ratios-warnings').innerHTML =
    (redItems.length === 0 && amberItems.length === 0)
      ? `<div style="padding:12px 16px;color:#4ada8e;background:#0a1a0a;border:1px solid #4ada8e33;border-radius:8px;font-size:.88rem">✓ جميع النسب المراقبة ضمن النطاق المقبول</div>`
      : `<div style="display:flex;flex-wrap:wrap;gap:12px">
           ${warnGroup('❌','#da4a4a', redItems,   'تحتاج مراجعة عاجلة')}
           ${warnGroup('⚠','#da9a4a', amberItems, 'تحتاج متابعة')}
         </div>`;

  // ── Ratio groups (driven by RATIO_DEFS) ──
  const grpRows = g => RATIO_DEFS.filter(d => d.group === g)
    .map(d => rRow(d.lbl, r[d.key], fmtR(r[d.key], d.dec, d.sfx), clr(r[d.key], d.lo, d.hi, d.hb), d.hint, arw(r[d.key], rPrev?.[d.key], d.hb)))
    .join('');
  document.getElementById('ratios-liquidity').innerHTML      = `<table style="width:100%"><tbody>${grpRows('💧 السيولة')}</tbody></table>`;
  document.getElementById('ratios-profitability').innerHTML  = `<table style="width:100%"><tbody>${grpRows('📈 الربحية')}</tbody></table>`;
  document.getElementById('ratios-leverage').innerHTML       = `<table style="width:100%"><tbody>${grpRows('⚖️ الرفع المالي')}</tbody></table>`;
  document.getElementById('ratios-efficiency').innerHTML     = `<table style="width:100%"><tbody>${grpRows('⚙️ الكفاءة')}</tbody></table>`;

  // ── Cost Structure ──
  const plToDate  = (pl || []).filter(m => m.month <= asOf);
  const cAgg      = aggregatePL(plToDate);
  // Use monthly-state for dist/adm so they match Summary/Monthly/Accounts tabs
  const _moToDateCS = (State.get('monthly') || []).filter(m => m.month <= asOf);
  const _csDistMo   = _moToDateCS.reduce((s, m) => s + (m.dist||0), 0);
  const _csAdmMo    = _moToDateCS.reduce((s, m) => s + (m.adm ||0), 0);
  const costEl   = document.getElementById('ratios-cost-struct');
  if (costEl) {
    if (cAgg.revenue > 0) {
      const items = [
        { lbl:'تكلفة البضاعة المباعة', val: cAgg.cogs + (cAgg.otherCost || 0) },
        { lbl: CAT_LABEL.sal,  val: cAgg.sal   },
        { lbl: CAT_LABEL.dist, val: _csDistMo  },
        { lbl: CAT_LABEL.adm,  val: _csAdmMo   },
        { lbl: CAT_LABEL.fin,  val: cAgg.fin   },
        { lbl: CAT_LABEL.rent, val: cAgg.rent  },
        { lbl: CAT_LABEL.maint,val: cAgg.maint },
        { lbl: CAT_LABEL.sell, val: cAgg.sell  },
        { lbl: CAT_LABEL.char, val: cAgg.char  },
        { lbl: CAT_LABEL.oth,  val: cAgg.oth   },
      ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);
      const profitRow = { lbl:'صافي الربح / الخسارة', val: cAgg.netProfit, isProfit: true };
      costEl.innerHTML = [...items, profitRow].map(x => {
        const pct = x.val / cAgg.revenue * 100;
        const bar = Math.min(100, Math.max(0, Math.abs(pct)));
        const col = x.isProfit
          ? (x.val >= 0 ? '#4ada8e' : '#da4a4a')
          : (pct > 30 ? '#da4a4a' : pct > 15 ? '#da9a4a' : '#4a9eda');
        const sign = x.val < 0 ? '(' : '';
        const esign = x.val < 0 ? ')' : '';
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="color:#c0d0e0;font-size:.82rem">${x.lbl}</span>
            <span style="color:${col};font-size:.82rem;font-weight:600">${sign}${Math.abs(pct).toFixed(1)}%${esign} — ${sign}${fmt(Math.abs(x.val))} ر.س${esign}</span>
          </div>
          <div style="height:7px;border-radius:4px;background:#0d1b2a">
            <div style="height:100%;border-radius:4px;width:${bar}%;background:${col}99"></div>
          </div>
        </div>`;
      }).join('') +
        `<div style="margin-top:10px;padding:7px 10px;background:#06121e;border-radius:4px;font-size:.70rem;color:#4a6a8a;line-height:1.6">
          * التوزيع والنقل والمصروفات الإدارية من مصدر المصروفات التشغيلية (يشمل كامل ح. 4010301). في قائمة الدخل، ح. نقل المشتريات (4010301001) مُدرج ضمن تكلفة البضاعة المباعة كتكاليف إيصال.
        </div>`;
    } else {
      costEl.innerHTML = '<div style="color:#5a7a9a;padding:10px;text-align:center">لا توجد بيانات إيراد لهذه الفترة</div>';
    }
  }

  // ── Trend chart + monthly comparison table ──
  const allRatios = months.map(mo => computeRatios(bs, pl || [], mo, getRatiosPlFrom(mo, plMode))).filter(Boolean);
  renderRatiosTrend(allRatios);
  renderRatiosMonthlyTable(allRatios, asOf);
}

// ── Monthly comparison table ──────────────────────────────────────────────────
function renderRatiosMonthlyTable(allRatios, selectedMo) {
  const el = document.getElementById('ratios-monthly-table');
  if (!el || !allRatios.length) return;

  const clr = (val, lo, hi, hb = true) => {
    if (val === null || !isFinite(val)) return '#5a7a9a';
    return hb ? (val >= hi ? '#4ada8e' : val >= lo ? '#da9a4a' : '#da4a4a')
              : (val <= lo ? '#4ada8e' : val <= hi ? '#da9a4a' : '#da4a4a');
  };
  const fmtV = (v, dec, sfx) => (v === null || !isFinite(v)) ? '—' : v.toFixed(dec) + sfx;

  // Group separator rows
  const groups = [...new Set(RATIO_DEFS.map(d => d.group))];
  let rows = '';
  groups.forEach(g => {
    const defs = RATIO_DEFS.filter(d => d.group === g);
    rows += `<tr><td colspan="${allRatios.length + 2}" style="background:#112233;color:#4a8aaa;font-size:.75rem;font-weight:700;padding:7px 10px;border-top:1px solid #1e3a5f">${g}</td></tr>`;
    defs.forEach(d => {
      const cells = allRatios.map(rv => {
        const v   = rv[d.key];
        const col = clr(v, d.lo, d.hi, d.hb);
        const isSel = rv.asOf === selectedMo;
        const bg  = isSel ? '#0d2a4a' : '';
        const fw  = isSel ? 'bold' : 'normal';
        return `<td style="text-align:center;padding:5px 8px;${bg?'background:'+bg+';':''}color:${col};font-weight:${fw};white-space:nowrap;font-size:.8rem">${fmtV(v, d.dec, d.sfx)}</td>`;
      }).join('');
      rows += `<tr style="border-bottom:1px solid #0d1e2e">
        <td style="padding:5px 10px;color:#c0d0e0;font-size:.82rem;white-space:nowrap">${d.lbl}</td>
        ${cells}
        <td style="padding:5px 8px;color:#4a6a8a;font-size:.72rem;white-space:nowrap">${d.hint}</td>
      </tr>`;
    });
  });

  const hdrs = allRatios.map(rv => {
    const isSel = rv.asOf === selectedMo;
    return `<th style="background:${isSel?'#1e4a7a':'#112233'};color:${isSel?'#fff':'#8aaac8'};padding:7px 10px;text-align:center;white-space:nowrap;font-size:.78rem;border-bottom:2px solid ${isSel?'#4a9eda':'#1e3a5f'}">${rv.label||rv.asOf}</th>`;
  }).join('');

  el.innerHTML = `<table style="width:100%;border-collapse:collapse;direction:rtl">
    <thead><tr>
      <th style="background:#112233;color:#8aaac8;padding:7px 10px;text-align:right;font-size:.78rem;border-bottom:2px solid #1e3a5f">النسبة</th>
      ${hdrs}
      <th style="background:#112233;color:#8aaac8;padding:7px 10px;text-align:right;font-size:.72rem;border-bottom:2px solid #1e3a5f">المعيار</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Ratios HTML report builder ────────────────────────────────────────────────
function buildRatiosHTMLReport(bs, pl, asOf, plFrom, plMode) {
  const r      = computeRatios(bs, pl, asOf, plFrom);
  if (!r) return '<p>لا توجد بيانات</p>';
  const months = [...new Set(bs.map(x => x.month))].sort();
  const allRatios = months.map(mo => computeRatios(bs, pl, mo, getRatiosPlFrom(mo, plMode))).filter(Boolean);
  const dbName = (State.get('config')?.dbs?.[0]) || '';
  const genDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const plLabel = r.nMonths === 1 ? 'شهر واحد' : `${r.nMonths} أشهر`;
  const modeLabel = { ytd:'تراكمي - السنة الجارية', cumul:'تراكمي - من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || plMode;

  const clrHex = (v, lo, hi, hb=true) => {
    if (v===null || !isFinite(v)) return '#888';
    return hb ? (v>=hi?'#1a6a2a':v>=lo?'#7a5a00':'#8a1a1a') : (v<=lo?'#1a6a2a':v<=hi?'#7a5a00':'#8a1a1a');
  };
  const clrBg = (v, lo, hi, hb=true) => {
    if (v===null||!isFinite(v)) return '#f0f0f0';
    return hb?(v>=hi?'#e8fff0':v>=lo?'#fffbe0':'#fff0f0'):(v<=lo?'#e8fff0':v<=hi?'#fffbe0':'#fff0f0');
  };
  const fV = (v, dec, sfx) => (v===null||!isFinite(v)) ? '—' : v.toFixed(dec)+sfx;

  // KPI cards
  const kpis = [
    { lbl:'النسبة الجارية',     d:RATIO_DEFS.find(x=>x.key==='currentRatio') },
    { lbl:'هامش الربح الصافي',  d:RATIO_DEFS.find(x=>x.key==='netMargin') },
    { lbl:'العائد على الملكية', d:RATIO_DEFS.find(x=>x.key==='roe') },
    { lbl:'الدين / الملكية',    d:RATIO_DEFS.find(x=>x.key==='debtEquity') },
  ].map(k => {
    const v = r[k.d.key]; const col = clrHex(v, k.d.lo, k.d.hi, k.d.hb);
    return `<div style="flex:1;min-width:130px;background:#f8f9fb;border:1px solid #dde;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:11px;color:#666;margin-bottom:6px">${k.d.lbl}</div>
      <div style="font-size:22px;font-weight:bold;color:${col}">${fV(v,k.d.dec,k.d.sfx)}</div>
      <div style="font-size:10px;color:#999;margin-top:4px">${k.d.hint}</div>
    </div>`;
  }).join('');

  // Ratio group tables
  const groups = [...new Set(RATIO_DEFS.map(d => d.group))];
  let groupTablesHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">';
  groups.forEach(g => {
    const defs = RATIO_DEFS.filter(d => d.group === g);
    const rows = defs.map(d => {
      const v = r[d.key]; const col = clrHex(v, d.lo, d.hi, d.hb); const bg = clrBg(v, d.lo, d.hi, d.hb);
      return `<tr style="background:${bg}">
        <td style="padding:7px 10px;font-size:12px">${d.lbl}</td>
        <td style="padding:7px 10px;font-weight:bold;color:${col};text-align:left;white-space:nowrap">${fV(v,d.dec,d.sfx)}</td>
        <td style="padding:7px 10px;font-size:10px;color:#777;text-align:left">${d.hint}</td>
      </tr>`;
    }).join('');
    groupTablesHtml += `<div><div style="background:#1A3A6A;color:#fff;padding:8px 12px;font-weight:bold;font-size:12px;border-radius:4px 4px 0 0">${g}</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
  });
  groupTablesHtml += '</div>';

  // Monthly table
  const moHdrs = allRatios.map(rv => `<th style="background:${rv.asOf===asOf?'#1A3A6A':'#2a3a4a'};color:#fff;padding:6px 8px;white-space:nowrap;font-size:10px">${rv.label||rv.asOf}</th>`).join('');
  let moRows = '';
  groups.forEach(g => {
    moRows += `<tr><td colspan="${allRatios.length+2}" style="background:#e8eef8;color:#1A3A6A;font-weight:bold;font-size:11px;padding:6px 10px">${g}</td></tr>`;
    RATIO_DEFS.filter(d=>d.group===g).forEach(d => {
      const cells = allRatios.map(rv => {
        const v = rv[d.key]; const col = clrHex(v, d.lo, d.hi, d.hb); const bg = clrBg(v, d.lo, d.hi, d.hb);
        const isSel = rv.asOf===asOf;
        return `<td style="text-align:center;padding:5px 8px;background:${isSel?'#dde8f8':bg};color:${col};font-weight:${isSel?'bold':'normal'};white-space:nowrap;font-size:11px">${fV(v,d.dec,d.sfx)}</td>`;
      }).join('');
      moRows += `<tr><td style="padding:5px 10px;font-size:11px">${d.lbl}</td>${cells}<td style="padding:5px 8px;font-size:10px;color:#888">${d.hint}</td></tr>`;
    });
  });

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>النسب المالية — ${asOf}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;text-align:right;background:#fff;color:#111;font-size:13px}
.page{max-width:1100px;margin:0 auto;padding:24px}
.hdr{background:#0A2040;color:#fff;padding:16px 20px;border-radius:6px;text-align:center;margin-bottom:16px}
.hdr h1{font-size:17px;margin-bottom:3px}.hdr h2{font-size:12px;color:#AACCE8;font-weight:normal}
.hdr .meta{font-size:10px;color:#6A8AAA;margin-top:3px}
.sec{background:#1A3A6A;color:#fff;padding:7px 12px;font-weight:bold;font-size:12px;border-radius:4px;margin:18px 0 8px}
table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8ecf0}
.mo-table th{text-align:center}.mo-table td:first-child{text-align:right}
.footer{margin-top:20px;border-top:1px solid #e8ecf0;padding-top:8px;font-size:10px;color:#999;text-align:center}
@media print{body{font-size:10px}.page{padding:8px;max-width:100%}.page-break{page-break-before:always}}
</style></head>
<body><div class="page">
  <div class="hdr">
    <h1>تحليل النسب المالية${dbName?' — '+dbName:''}</h1>
    <h2>كما في ${r.label||asOf} &nbsp;|&nbsp; احتساب الربحية: ${modeLabel} (${plLabel})</h2>
    <div class="meta">أُنشئ: ${genDate}</div>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">${kpis}</div>

  <div class="sec">مجموعات النسب — كما في ${r.label||asOf}</div>
  ${groupTablesHtml}

  <div class="page-break"></div>
  <div class="sec">📅 المقارنة الشهرية — جميع النسب</div>
  <div style="overflow-x:auto">
    <table class="mo-table" style="font-size:11px">
      <thead><tr>
        <th style="background:#2a3a4a;color:#fff;padding:6px 10px;text-align:right">النسبة</th>
        ${moHdrs}
        <th style="background:#2a3a4a;color:#fff;padding:6px 8px;text-align:right;font-size:10px">المعيار</th>
      </tr></thead>
      <tbody>${moRows}</tbody>
    </table>
  </div>

  <div class="footer">أُنشئ بواسطة MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div></body></html>`;
}

function exportRatiosHTML() {
  const bs = State.get('bs'); const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html = buildRatiosHTMLReport(bs, pl, asOf, plFrom, plMode);
  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `النسب_المالية_${asOf}.html`; a.click();
  URL.revokeObjectURL(url);
}

function printRatiosPDF() {
  const bs = State.get('bs'); const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html = buildRatiosHTMLReport(bs, pl, asOf, plFrom, plMode);
  const w = window.open('', '_blank', 'width=1100,height=750');
  w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportRatiosExcel() {
  const bs = State.get('bs'); const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }

  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const r      = computeRatios(bs, pl, asOf, plFrom);
  if (!r) { alert('لا توجد بيانات للفترة المحددة'); return; }
  const months    = [...new Set(bs.map(x => x.month))].sort();
  const allRatios = months.map(mo => computeRatios(bs, pl, mo, getRatiosPlFrom(mo, plMode))).filter(Boolean);
  const modeLabel = { ytd:'تراكمي - السنة الجارية', cumul:'تراكمي - من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || plMode;
  const genDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });

  const FONT = 'Calibri';
  const CLR = { navyDark:'FF0A2040', navy:'FF1A3A6A', bluePale:'FFF4F7FB', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textLight:'FF6A8AAA',
    green:'FF4ada8e', greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
    amber:'FFda9a4a', amberBg:'FFFFFBE8', red:'FFda4a4a', redBg:'FFFFF0F0' };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });
  const ratioClr = (v, lo, hi, hb=true) => {
    if (v===null||!isFinite(v)) return { txt:CLR.textLight, bg:CLR.white };
    const g=hb?(v>=hi):(v<=lo), a=hb?(v>=lo&&v<hi):(v>lo&&v<=hi);
    return g ? {txt:CLR.greenText,bg:'FFF4FFF8'} : a ? {txt:'FF7A5A00',bg:'FFFFFBE8'} : {txt:'FF8A1A1A',bg:'FFFFF0F0'};
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: Detail by group ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet('النسب المالية', { views:[{ rightToLeft:true }] });
  ws1.pageSetup.paperSize=9; ws1.pageSetup.orientation='portrait'; ws1.pageSetup.fitToPage=true;
  ws1.columns=[{width:36},{width:18},{width:24},{width:30}];

  const span1 = row => ws1.mergeCells(row.number,1,row.number,4);
  const addH1 = (t,sz,fc,bg) => { const row=ws1.addRow([t]); row.height=sz>12?30:20; span1(row); const c=row.getCell(1); c.font={name:FONT,size:sz,bold:true,color:{argb:fc}}; c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'}; };
  const addS1 = (h=4) => { const row=ws1.addRow(['']); row.height=h; span1(row); row.getCell(1).fill=solid(CLR.white); };

  addH1(`تحليل النسب المالية${(State.get('config')?.dbs?.[0]||'') ? ' — '+(State.get('config')?.dbs?.[0]||'') : ''}`, 14, CLR.white, CLR.navyDark);
  addH1(`كما في ${r.label||asOf}  |  احتساب الربحية: ${modeLabel}`, 11, 'FFAACCE8', CLR.navyDark);
  addH1(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  addS1(4);

  const groups = [...new Set(RATIO_DEFS.map(d => d.group))];
  groups.forEach(g => {
    // Group header
    const gRow = ws1.addRow([g]); gRow.height=18; span1(gRow);
    gRow.getCell(1).font={name:FONT,size:10,bold:true,color:{argb:CLR.white}}; gRow.getCell(1).fill=solid(CLR.navy);
    gRow.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1};
    // Column headers
    const hRow = ws1.addRow(['النسبة','القيمة','التقييم','المعيار']); hRow.height=16;
    hRow.eachCell({includeEmpty:true},(cell,ci) => {
      cell.font={name:FONT,size:9,bold:true,color:{argb:CLR.textNavy}};
      cell.fill=solid(CLR.bluePale); cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('thin','FFCCDDEE')};
    });
    // Ratio rows
    RATIO_DEFS.filter(d=>d.group===g).forEach(d => {
      const v = r[d.key];
      const vc = ratioClr(v, d.lo, d.hi, d.hb);
      const fmtd = (v===null||!isFinite(v)) ? '—' : v.toFixed(d.dec)+d.sfx;
      const rating = (v===null||!isFinite(v)) ? 'غير متاح' : (vc.txt===CLR.greenText?'ممتاز / جيد':vc.txt==='FF7A5A00'?'متوسط':'ضعيف / تحتاج مراجعة');
      const row = ws1.addRow([d.lbl, fmtd, rating, d.hint]); row.height=16;
      row.getCell(1).font={name:FONT,size:9.5,color:{argb:CLR.textDark}}; row.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:2}; row.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
      [2,3].forEach(ci => { const c=row.getCell(ci); c.font={name:FONT,size:9.5,bold:true,color:{argb:vc.txt}}; c.fill=solid(vc.bg); c.alignment={horizontal:'center',vertical:'middle'}; c.border={bottom:bdr('hair','FFE8ECF0')}; });
      row.getCell(4).font={name:FONT,size:8.5,color:{argb:CLR.textLight}}; row.getCell(4).alignment={horizontal:'right',vertical:'middle'}; row.getCell(4).border={bottom:bdr('hair','FFE8ECF0')};
    });
    addS1(3);
  });

  // ── Sheet 2: Monthly comparison matrix ────────────────────────────────────
  const ws2 = wb.addWorksheet('المقارنة الشهرية', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='landscape'; ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.columns=[{width:32},...allRatios.map(()=>({width:14})),{width:24}];

  const NC2 = allRatios.length + 2;
  const span2 = row => ws2.mergeCells(row.number,1,row.number,NC2);
  const addH2 = (t,sz,fc,bg) => { const row=ws2.addRow([t]); row.height=sz>12?28:18; span2(row); const c=row.getCell(1); c.font={name:FONT,size:sz,bold:true,color:{argb:fc}}; c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'}; };
  addH2(`المقارنة الشهرية للنسب المالية — احتساب الربحية: ${modeLabel}`, 12, CLR.white, CLR.navyDark);
  addH2(`أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  { const row=ws2.addRow(['']); row.height=4; span2(row); row.getCell(1).fill=solid(CLR.white); }

  // Header row (months)
  const hdrRow2 = ws2.addRow(['النسبة', ...allRatios.map(rv=>rv.label||rv.asOf), 'المعيار']); hdrRow2.height=18;
  hdrRow2.eachCell({includeEmpty:true},(cell,ci) => {
    const isSel = ci > 1 && ci < NC2 && allRatios[ci-2]?.asOf === asOf;
    cell.font={name:FONT,size:9,bold:true,color:{argb:CLR.white}};
    cell.fill=solid(isSel?CLR.navy:'FF1a2a3a'); cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
    cell.border={bottom:bdr(isSel?'medium':'thin', isSel?'FF4a9eda':'FF1e3a5f')};
  });

  groups.forEach(g => {
    const gRow2 = ws2.addRow([g]); gRow2.height=14; span2(gRow2);
    gRow2.getCell(1).font={name:FONT,size:8.5,bold:true,color:{argb:'FF4a8aaa'}}; gRow2.getCell(1).fill=solid('FF0a1a2a'); gRow2.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1};
    RATIO_DEFS.filter(d=>d.group===g).forEach(d => {
      const vals = allRatios.map(rv => rv[d.key]);
      const row2 = ws2.addRow([d.lbl, ...vals.map(()=>null), d.hint]); row2.height=15;
      row2.getCell(1).font={name:FONT,size:9,color:{argb:CLR.textDark}}; row2.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:2}; row2.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
      vals.forEach((v,vi) => {
        const cell = row2.getCell(vi+2);
        const vc = ratioClr(v, d.lo, d.hi, d.hb);
        const isSel = allRatios[vi]?.asOf === asOf;
        cell.value = (v!==null&&isFinite(v)) ? parseFloat(v.toFixed(d.dec)) : null;
        cell.numFmt = d.sfx==='%' ? '0.0"%"' : d.sfx==='×' ? '0.00"×"' : '0" يوم"';
        cell.font={name:FONT,size:9,bold:isSel,color:{argb:vc.txt}};
        cell.fill=solid(isSel?'FFd8e8f8':vc.bg); cell.alignment={horizontal:'center',vertical:'middle'}; cell.border={bottom:bdr('hair','FFE8ECF0')};
      });
      row2.getCell(NC2).font={name:FONT,size:8,color:{argb:CLR.textLight}}; row2.getCell(NC2).alignment={horizontal:'right',vertical:'middle'}; row2.getCell(NC2).border={bottom:bdr('hair','FFE8ECF0')};
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `النسب_المالية_${asOf}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── NOTES tab ─────────────────────────────────────────────────────────────────

function buildNotesPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('notes-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const yMs = months.filter(m => m.startsWith(y));
    const oy  = document.createElement('option');
    oy.value = yMs[yMs.length - 1]; oy.textContent = `من بداية ${y} إلى الآن`; sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      const qMs = yMs.filter(m => qOf(m) === q);
      if (qMs.length) {
        const oq = document.createElement('option');
        oq.value = qMs[qMs.length - 1]; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o = document.createElement('option');
    o.value = mo; o.textContent = row ? row.label : mo; sel.appendChild(o);
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || '';
}

function renderNotesTab() {
  const bs = State.get('bs');
  const pl = State.get('pl');
  if (!bs || !bs.length) {
    const nb = document.getElementById('notes-body');
    if (nb) nb.innerHTML = '<div style="color:#5a7a9a;padding:20px;text-align:center">لا توجد بيانات كافية</div>';
    return;
  }

  buildNotesPeriodOptions();
  const asOf = (document.getElementById('notes-period-sel') || {}).value || '';
  if (!asOf) return;

  const plMode  = (document.getElementById('notes-pl-mode') || {}).value || 'ytd';
  const plFrom  = getRatiosPlFrom(asOf, plMode);

  const modeHintEl = document.getElementById('notes-mode-hint');
  if (modeHintEl) modeHintEl.textContent = { ytd:'من بداية السنة', cumul:'تراكمي من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || '';

  const r = computeRatios(bs, pl, asOf, plFrom);
  if (!r) return;

  const months  = [...new Set(bs.map(x => x.month))].sort();
  const asOfIdx = months.indexOf(asOf);
  const prevMo  = asOfIdx > 0 ? months[asOfIdx - 1] : null;
  const rPrev   = prevMo ? computeRatios(bs, pl, prevMo, getRatiosPlFrom(prevMo, plMode)) : null;

  // Filter P&L according to selected mode
  const plToDate  = (pl || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const c         = aggregatePL(plToDate);
  const nMonths   = Math.max(plToDate.length, 1);
  const totalCost = c.cogs + (c.otherCost || 0);

  // Use monthly expense state for opex breakdown — same mode filter
  const moToDate = State.get('monthly').filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const mSal   = moToDate.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent  = moToDate.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint = moToDate.reduce((s, m) => s + (m.maint||0), 0);
  const mSell  = moToDate.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist  = moToDate.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm   = moToDate.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin   = moToDate.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar  = moToDate.reduce((s, m) => s + (m.char ||0), 0);
  const mOth   = moToDate.reduce((s, m) => s + (m.oth  ||0), 0);
  const totalOpex = mSal + mRent + mMaint + mSell + mDist + mAdm + mFin + mChar + mOth;
  const netProfitDisplay = c.grossProfit - totalOpex;  // consistent with monthly opex source

  // Build opex breakdown early so recommendations can reference it
  const opexItemsArr = [
    { lbl:'الرواتب والأجور',    val: mSal   },
    { lbl:'الإيجار',            val: mRent  },
    { lbl:'الصيانة والتشغيل',  val: mMaint },
    { lbl:'المصروفات البيعية',  val: mSell  },
    { lbl:'التوزيع والنقل',     val: mDist  },
    { lbl:'المصروفات الإدارية',val: mAdm   },
    { lbl:'التكاليف المالية',   val: mFin   },
    { lbl:'المصروفات الخيرية', val: mChar  },
    { lbl:'مصروفات أخرى',      val: mOth   },
  ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);

  const periodLabel = r.label || asOf;
  const companyName = State.get('companyName') || 'الشركة';

  const bfRows     = State.get('bankFacilities') || [];
  const bfRow      = bfRows.filter(b => b.month <= asOf).slice(-1)[0];
  const bfBalance  = bfRow ? Math.abs(bfRow.balance) : 0;

  // ── KPIs ──
  document.getElementById('notes-kpis').innerHTML = [
    { lbl:'الفترة',               val: `${nMonths} ${nMonths === 1 ? 'شهر' : 'أشهر'} حتى ${periodLabel}`,   col:'#5baef0' },
    { lbl:'إيراد الفترة',          val: fmt(c.revenue) + ' ر.س',                                              col:'#4ada8e' },
    { lbl:'صافي الربح / الخسارة', val: fmt(c.netProfit) + ' ر.س',                                            col: c.netProfit >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl:'هامش الربح الصافي',   val: r.netMargin !== null ? r.netMargin.toFixed(1) + '%' : '—',             col: r.netMargin >= 5 ? '#4ada8e' : r.netMargin >= 2 ? '#da9a4a' : '#da4a4a' },
    { lbl:'إجمالي الأصول',       val: fmt(r.totalA) + ' ر.س',                                               col:'#4a9eda' },
    { lbl:'حقوق الملكية',        val: fmt(r.totalE) + ' ر.س',                                               col: r.totalE >= 0 ? '#4a9eda' : '#da4a4a' },
  ].map(k => `<div class="kpi" style="--accent:${k.col}"><div class="lbl">${k.lbl}</div><div class="val" style="font-size:.95rem">${k.val}</div></div>`).join('');

  // ── Rule-based Recommendations ──
  const recs = [];
  const addRec = (priority, icon, title, body) => recs.push({ priority, icon, title, body });
  const priCol   = { 1:'#da4a4a', 2:'#da9a4a', 3:'#4a9eda' };
  const priLabel = { 1:'عاجل', 2:'متابعة', 3:'ملاحظة' };

  if (r.currentRatio !== null && r.currentRatio < 1)
    addRec(1,'🚨','ضعف السيولة الحرجة',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستوى الأمن. الأصول المتداولة (${fmt(r.currA)} ر.س) لا تغطي الالتزامات المتداولة (${fmt(r.currL)} ر.س). يُوصى بمراجعة جدول التحصيل وإعادة هيكلة الالتزامات قصيرة الأجل.`);
  else if (r.currentRatio !== null && r.currentRatio < 1.5)
    addRec(2,'⚠️','السيولة بحاجة إلى تحسين',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستهدف (1.5×). يُنصح بمتابعة التدفق النقدي الشهري والحد من التزامات جديدة قصيرة الأجل.`);

  if (r.quickRatio !== null && r.quickRatio < 0.7)
    addRec(1,'🚨','نسبة سريعة حرجة',`النسبة السريعة ${r.quickRatio.toFixed(2)}× تشير إلى اعتماد مفرط على المخزون (${fmt(r.inventory)} ر.س) لتغطية الالتزامات. يُوصى بتسريع تحويل المخزون إلى نقد.`);

  if (r.netMargin !== null && r.netMargin < 0)
    addRec(1,'📉','الشركة تعمل بخسارة',`صافي الربح سالب (${r.netMargin.toFixed(1)}%). التكاليف تتجاوز الإيراد بـ ${fmt(Math.abs(c.netProfit))} ر.س. يستلزم مراجعة عاجلة لهيكل التكاليف وتحليل نقطة التعادل.`);
  else if (r.netMargin !== null && r.netMargin < 3)
    addRec(2,'⚠️','هامش الربح الصافي منخفض',`هامش ${r.netMargin.toFixed(1)}% أقل من الحد الأدنى المقبول (3%). يُنصح بمراجعة التسعير وضبط عناصر التكلفة الرئيسية.`);

  if (r.grossMargin !== null && r.grossMargin < 10)
    addRec(2,'⚠️','هامش الربح الإجمالي ضعيف',`هامش الربح الإجمالي ${r.grossMargin.toFixed(1)}% يشير إلى ضغط على تكلفة البضاعة. يُنصح بمراجعة أسعار الشراء والتفاوض مع الموردين.`);

  if (r.roe !== null && r.roe < 8) {
    const msg = r.roe < 0 ? `سالب (${r.roe.toFixed(1)}%)، مما يعني أن الملاك يتكبدون خسارة على استثماراتهم.` : `${r.roe.toFixed(1)}% أقل من الحد الأدنى المقبول (8%).`;
    addRec(r.roe < 0 ? 1 : 2,'💰','العائد على الملكية ضعيف',`العائد على حقوق الملكية ${msg} يُوصى بتحسين كفاءة توظيف رأس المال.`);
  }

  if (r.debtEquity !== null && r.debtEquity > 2)
    addRec(2,'⚖️','ارتفاع الرفع المالي',`نسبة الدين إلى الملكية ${r.debtEquity.toFixed(2)}× تتجاوز الحد المريح. الالتزامات (${fmt(r.totalL)} ر.س) أكبر بكثير من الملكية (${fmt(r.totalE)} ر.س). يُنصح بتسريع سداد الديون أو تقوية رأس المال.`);

  if (r.intCoverage !== null && r.intCoverage < 1.5)
    addRec(1,'🏦','ضعف تغطية الفوائد',`تغطية الفوائد ${r.intCoverage.toFixed(1)}× — الأرباح التشغيلية لا تغطي أعباء التمويل بهامش كافٍ. يُوصى بمراجعة جدول الديون ومحاولة تخفيض معدلات الفائدة.`);

  if (r.arDays !== null && r.arDays > 90)
    addRec(2,'📅','بطء تحصيل المديونيات',`متوسط أيام التحصيل ${r.arDays.toFixed(0)} يوماً يتجاوز الحد المقبول (90). رصيد المدينين (${fmt(r.ar)} ر.س) مرتفع. يُنصح بتفعيل سياسة التحصيل ومتابعة كبار العملاء.`);

  if (r.invDays !== null && r.invDays > 90)
    addRec(2,'📦','بطء دوران المخزون',`متوسط أيام دوران المخزون ${r.invDays.toFixed(0)} يوماً يشير إلى وجود مخزون راكد. يُوصى بتقييم حركة الأصناف وتخفيض المخزون الزائد.`);

  if (bfBalance > 0 && r.totalE > 0 && bfBalance > r.totalE * 0.5)
    addRec(2,'🏦','حجم التسهيلات البنكية مرتفع',`التسهيلات البنكية (${fmt(bfBalance)} ر.س) تمثّل نسبة مرتفعة من حقوق الملكية (${(bfBalance/r.totalE*100).toFixed(1)}%). يُنصح بوضع خطة لتخفيض الاعتماد على التمويل البنكي.`);

  if (rPrev && r.netMargin !== null && rPrev.netMargin !== null && r.netMargin < rPrev.netMargin - 2)
    addRec(2,'📉','تراجع ملحوظ في هامش الربح',`هامش الربح تراجع من ${rPrev.netMargin.toFixed(1)}% إلى ${r.netMargin.toFixed(1)}% مقارنة بالفترة السابقة. يُنصح بتحليل أسباب ارتفاع التكاليف أو انخفاض الإيراد.`);

  // Opex concentration & ratio checks
  if (opexItemsArr.length > 0 && totalOpex > 0) {
    const top = opexItemsArr[0];
    if (top.val / totalOpex > 0.5)
      addRec(3,'📊',`تركّز المصروفات في: ${top.lbl}`,
        `${top.lbl} تمثّل ${(top.val/totalOpex*100).toFixed(1)}% من إجمالي المصروفات التشغيلية (${fmt(top.val)} ر.س). تركّز البند الواحد فوق 50% يُشير إلى خطر تشغيلي عند أي ارتفاع مفاجئ في هذا النوع من التكاليف.`);
  }
  if (c.revenue > 0 && totalOpex / c.revenue > 0.25)
    addRec(2,'⚙️','ارتفاع نسبة المصروفات التشغيلية إلى الإيراد',
      `المصروفات التشغيلية تمثّل ${(totalOpex/c.revenue*100).toFixed(1)}% من الإيراد (${fmt(totalOpex)} من ${fmt(c.revenue)} ر.س). يُنصح بوضع هدف لخفض هذه النسبة إلى ما دون 20% عبر ضبط التكاليف أو رفع الإيراد.`);

  recs.sort((a, b) => a.priority - b.priority);
  const recEl = document.getElementById('notes-recommendations');
  recEl.innerHTML = !recs.length
    ? `<div style="padding:14px;color:#4ada8e;background:#0a1a0a;border:1px solid #4ada8e33;border-radius:8px;font-size:.85rem">✓ لا توجد توجيهات عاجلة — الوضع المالي ضمن النطاق المقبول</div>`
    : recs.map(rec => `
      <div style="margin-bottom:10px;padding:12px;border-radius:8px;background:#0d1b2a;border-right:3px solid ${priCol[rec.priority]}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span>${rec.icon}</span>
          <span style="color:${priCol[rec.priority]};font-weight:600;font-size:.82rem">${rec.title}</span>
          <span style="margin-right:auto;font-size:.68rem;padding:1px 6px;border-radius:8px;background:${priCol[rec.priority]}22;color:${priCol[rec.priority]}">${priLabel[rec.priority]}</span>
        </div>
        <div style="color:#9ab0c8;font-size:.80rem;line-height:1.6">${rec.body}</div>
      </div>`).join('');

  // ── Strengths ──
  const strs = [];
  const addStr = (icon, title, body) => strs.push({ icon, title, body });

  if (r.currentRatio !== null && r.currentRatio >= 1.5)
    addStr('💧','سيولة جيدة',`النسبة الجارية ${r.currentRatio.toFixed(2)}× تشير إلى قدرة جيدة على تغطية الالتزامات قصيرة الأجل.`);
  if (r.netMargin !== null && r.netMargin >= 8)
    addStr('📈','هامش ربح صافٍ مرتفع',`هامش ${r.netMargin.toFixed(1)}% يعكس كفاءة عالية في إدارة التكاليف.`);
  if (r.roe !== null && r.roe >= 15)
    addStr('💰','عائد ممتاز على الملكية',`العائد على الملكية ${r.roe.toFixed(1)}% يفوق المعدل المستهدف (15%)، ويعكس توظيفاً كفوءاً لرأس المال.`);
  if (r.debtEquity !== null && r.debtEquity < 1)
    addStr('⚖️','هيكل مالي محافظ',`نسبة الدين إلى الملكية ${r.debtEquity.toFixed(2)}× تشير إلى هيكل مالي مستقر ومنخفض المخاطر.`);
  if (r.arDays !== null && r.arDays < 60)
    addStr('📅','تحصيل سريع',`متوسط أيام التحصيل ${r.arDays.toFixed(0)} يوماً يعكس كفاءة في إدارة المديونيات.`);
  if (r.assetTurnover !== null && r.assetTurnover >= 1)
    addStr('⚙️','توظيف جيد للأصول',`معدل دوران الأصول ${r.assetTurnover.toFixed(2)}× يشير إلى كفاءة في توليد الإيراد.`);
  if (r.grossMargin !== null && r.grossMargin >= 20)
    addStr('📊','هامش إجمالي قوي',`هامش الربح الإجمالي ${r.grossMargin.toFixed(1)}% يعكس قوة تنافسية في التسعير.`);
  if (r.intCoverage !== null && r.intCoverage >= 3)
    addStr('🏦','تغطية فوائد مريحة',`تغطية الفوائد ${r.intCoverage.toFixed(1)}× تُظهر قدرة الشركة على تغطية أعباء التمويل بارتياح.`);

  const strEl = document.getElementById('notes-strengths');
  strEl.innerHTML = !strs.length
    ? `<div style="padding:14px;color:#5a7a9a;background:#0d1b2a;border-radius:8px;font-size:.85rem">ستظهر نقاط القوة عند بلوغ النسب المستويات الممتازة في الفترة المختارة.</div>`
    : strs.map(s => `
      <div style="margin-bottom:10px;padding:12px;border-radius:8px;background:#0d1b2a;border-right:3px solid #4ada8e">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span>${s.icon}</span>
          <span style="color:#4ada8e;font-weight:600;font-size:.82rem">${s.title}</span>
        </div>
        <div style="color:#9ab0c8;font-size:.80rem;line-height:1.6">${s.body}</div>
      </div>`).join('');

  // ── Executive summary narrative ──
  const urgentCnt  = recs.filter(x => x.priority === 1).length;
  const warningCnt = recs.filter(x => x.priority === 2).length;
  const execSummary = (() => {
    let s = `بناءً على البيانات المالية لـ <strong>${esc(companyName)}</strong> للفترة المنتهية في <strong>${esc(periodLabel)}</strong> (${nMonths} ${nMonths === 1 ? 'شهر' : 'أشهر'}): `;
    if (c.revenue > 0) {
      s += `حُقِّق إيراد تراكمي بلغ <strong>${fmt(c.revenue)} ر.س</strong> بتكلفة بضاعة <strong>${fmt(totalCost)} ر.س</strong> (هامش إجمالي ${r.grossMargin !== null ? r.grossMargin.toFixed(1) + '%' : '—'}). `;
      s += netProfitDisplay >= 0
        ? `بعد خصم المصروفات التشغيلية البالغة <strong>${fmt(totalOpex)} ر.س</strong>، يبلغ صافي الربح <strong>${fmt(netProfitDisplay)} ر.س</strong> (هامش صافٍ ${c.revenue > 0 ? (netProfitDisplay/c.revenue*100).toFixed(1) + '%' : '—'}). `
        : `غير أن المصروفات التشغيلية البالغة <strong>${fmt(totalOpex)} ر.س</strong> أفضت إلى صافي خسارة قدرها <strong>${fmt(Math.abs(netProfitDisplay))} ر.س</strong>. `;
    } else {
      s += 'لا توجد بيانات إيراد كافية لهذه الفترة. ';
    }
    s += `على صعيد المركز المالي، يبلغ إجمالي الأصول <strong>${fmt(r.totalA)} ر.س</strong> وحقوق الملكية <strong>${fmt(r.totalE)} ر.س</strong>. `;
    if (urgentCnt > 0)
      s += `<span style="color:#da4a4a;font-weight:600">يُرصد ${urgentCnt} ${urgentCnt === 1 ? 'بند حرج يستدعي' : 'بنود حرجة تستدعي'} تدخلاً عاجلاً.</span>`;
    else if (warningCnt > 0)
      s += `<span style="color:#da9a4a">يُرصد ${warningCnt} ${warningCnt === 1 ? 'بند يستدعي' : 'بنود تستدعي'} المتابعة.</span>`;
    else
      s += '<span style="color:#4ada8e">لا توجد مخاطر حرجة — الوضع المالي ضمن النطاق المقبول.</span>';
    return s;
  })();

  // ── Formal Supplementary Notes (إيضاحات) ──
  const bfPrevRow    = bfRows.filter(b => b.month < asOf).slice(-1)[0];
  const bfPrevBal    = bfPrevRow ? Math.abs(bfPrevRow.balance) : 0;
  const bfChg        = bfBalance - bfPrevBal;

  const netMarginDisplay = c.revenue > 0 ? netProfitDisplay / c.revenue * 100 : null;

  const notes = [
    {
      num:'1', title:'أساس الإعداد',
      body:`أُعدّت هذه القوائم المالية وفقاً للمعايير المحاسبية للمنشآت الصغيرة والمتوسطة الصادرة عن الهيئة السعودية للمحاسبين القانونيين (SOCPA)، وعلى أساس الاستحقاق المحاسبي. تُعبّر القوائم عن المركز المالي والأداء التشغيلي لـ <strong>${esc(companyName)}</strong> للفترة المنتهية في <strong>${esc(periodLabel)}</strong> (${nMonths} ${nMonths === 1 ? 'شهر' : 'أشهر'}).`
    },
    {
      num:'2', title:'السياسات المحاسبية الجوهرية',
      body:`<ul style="margin:0;padding-right:18px;line-height:2.1">
        <li><strong>الإيراد:</strong> يُثبَّت عند نقل السيطرة على السلعة أو الخدمة إلى العميل.</li>
        <li><strong>المخزون:</strong> يُقيَّم بالتكلفة أو صافي القيمة القابلة للتحقق أيهما أقل، وفق طريقة المتوسط المرجح.</li>
        <li><strong>الأصول الثابتة:</strong> تُستهلك بالطريقة الثابتة على مدى عمرها الإنتاجي المقدر.</li>
        <li><strong>ضريبة القيمة المضافة:</strong> تُطبَّق بالمعدل القياسي 15% وفق نظام ضريبة القيمة المضافة السعودي.</li>
        <li><strong>العملة الوظيفية:</strong> الريال السعودي (ر.س). المعاملات بالعملات الأجنبية تُحوَّل بسعر الصرف السائد.</li>
      </ul>`
    },
    {
      num:'3', title:'الأصول المتداولة',
      body:`يبلغ إجمالي الأصول المتداولة <strong>${fmt(r.currA)} ر.س</strong> في نهاية الفترة:
      <table style="width:100%;margin:8px 0;border-collapse:collapse;font-size:.82rem">
        <tr style="border-bottom:1px solid #1e3a5f">
          <td style="padding:6px 4px;color:#a0c4e8">النقد وما في حكمه</td>
          <td class="num" style="padding:6px 4px">${fmt(r.cash)} ر.س</td>
          <td class="num" style="padding:6px 4px;color:#7090b0">${r.currA > 0 ? (r.cash/r.currA*100).toFixed(1) + '% من المتداولة' : '—'}</td>
          <td style="padding:6px 4px"><div style="height:5px;border-radius:3px;background:#0d1b2a"><div style="height:100%;border-radius:3px;width:${r.currA>0?Math.min(100,r.cash/r.currA*100).toFixed(1):0}%;background:#4ada8e"></div></div></td>
        </tr>
        <tr style="border-bottom:1px solid #1e3a5f">
          <td style="padding:6px 4px;color:#a0c4e8">المدينون التجاريون</td>
          <td class="num" style="padding:6px 4px">${fmt(r.ar)} ر.س</td>
          <td class="num" style="padding:6px 4px;color:${r.arDays!==null&&r.arDays>90?'#da9a4a':'#7090b0'}">تحصيل ${r.arDays !== null ? r.arDays.toFixed(0) + ' يوم' : '—'}</td>
          <td style="padding:6px 4px"><div style="height:5px;border-radius:3px;background:#0d1b2a"><div style="height:100%;border-radius:3px;width:${r.currA>0?Math.min(100,r.ar/r.currA*100).toFixed(1):0}%;background:#5baef0"></div></div></td>
        </tr>
        <tr>
          <td style="padding:6px 4px;color:#a0c4e8">المخزون</td>
          <td class="num" style="padding:6px 4px">${fmt(r.inventory)} ر.س</td>
          <td class="num" style="padding:6px 4px;color:${r.invDays!==null&&r.invDays>90?'#da9a4a':'#7090b0'}">دوران ${r.invDays !== null ? r.invDays.toFixed(0) + ' يوم' : '—'}</td>
          <td style="padding:6px 4px"><div style="height:5px;border-radius:3px;background:#0d1b2a"><div style="height:100%;border-radius:3px;width:${r.currA>0?Math.min(100,r.inventory/r.currA*100).toFixed(1):0}%;background:#da9a4a"></div></div></td>
        </tr>
      </table>
      ${r.arDays !== null && r.arDays > 90 ? `<em style="color:#da9a4a;font-size:.78rem">⚠ ارتفاع أيام التحصيل — يُنصح بمراجعة مديونيات العملاء.</em>` : ''}`
    },
    {
      num:'4', title:'الالتزامات والتسهيلات البنكية',
      body:`إجمالي الالتزامات <strong>${fmt(r.totalL)} ر.س</strong> مقابل حقوق ملكية <strong>${fmt(r.totalE)} ر.س</strong>:
      <table style="width:100%;margin:8px 0;border-collapse:collapse;font-size:.82rem">
        <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">الالتزامات المتداولة</td><td class="num" style="padding:6px 4px">${fmt(r.currL)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${r.totalL>0?(r.currL/r.totalL*100).toFixed(1)+'% من الالتزامات':''}</td></tr>
        <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">التسهيلات الائتمانية البنكية (ح. 2010202)</td><td class="num" style="padding:6px 4px">${fmt(bfBalance)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${r.totalL>0?(bfBalance/r.totalL*100).toFixed(1)+'% من الالتزامات':''}</td></tr>
        <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">الالتزامات طويلة الأجل (الأخرى)</td><td class="num" style="padding:6px 4px">${fmt(Math.max(0, r.totalL - r.currL - bfBalance))} ر.س</td><td></td></tr>
        <tr><td style="padding:6px 4px;color:#a0c4e8;font-weight:600">حقوق الملكية</td><td class="num" style="padding:6px 4px;font-weight:600;color:${r.totalE>=0?'#4ada8e':'#da4a4a'}">${fmt(r.totalE)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">نسبة الدين ${r.debtEquity!==null?r.debtEquity.toFixed(2)+'×':'—'}</td></tr>
      </table>
      تُصنَّف التسهيلات البنكية ضمن <strong>أنشطة التمويل</strong> وفق المعايير السعودية للمنشآت الصغيرة والمتوسطة.
      ${bfChg !== 0 ? `<br><em style="font-size:.78rem;color:#7090b0">تغيّر التسهيلات خلال الفترة: ${bfChg>0?'+':''}${fmt(bfChg)} ر.س (${bfChg>0?'استخدام إضافي':'سداد جزئي'}).</em>` : ''}`
    },
    {
      num:'5', title:'نتائج الأعمال — قائمة الدخل',
      body: (() => {
        const grossPct  = c.revenue > 0 ? (c.grossProfit / c.revenue * 100).toFixed(1) : '—';
        const netPct    = c.revenue > 0 ? (netProfitDisplay / c.revenue * 100).toFixed(1) : '—';
        const opexPct   = c.revenue > 0 ? (totalOpex / c.revenue * 100).toFixed(1) : '—';
        return `للفترة المنتهية في <strong>${esc(periodLabel)}</strong>:
        <table style="width:100%;margin:8px 0;border-collapse:collapse;font-size:.82rem">
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">الإيراد</td><td class="num" style="padding:6px 4px">${fmt(c.revenue)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">100%</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">تكلفة البضاعة المباعة</td><td class="num" style="padding:6px 4px">(${fmt(totalCost)}) ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${c.revenue>0?(totalCost/c.revenue*100).toFixed(1)+'%':''}</td></tr>
          <tr style="border-bottom:2px solid #2a4a6f"><td style="padding:6px 4px;color:#c8e0f8;font-weight:600">مجمل الربح</td><td class="num" style="padding:6px 4px;color:${c.grossProfit>=0?'#4ada8e':'#da4a4a'};font-weight:600">${fmt(c.grossProfit)} ر.س</td><td class="num" style="padding:6px 4px;color:${c.grossProfit>=0?'#4ada8e':'#da4a4a'}">${grossPct}%</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">إجمالي المصروفات التشغيلية</td><td class="num" style="padding:6px 4px">(${fmt(totalOpex)}) ر.س</td><td class="num" style="padding:6px 4px;color:${+opexPct>25?'#da9a4a':'#7090b0'}">${opexPct}%</td></tr>
          <tr style="border-top:2px solid #3a7abf"><td style="padding:6px 4px;color:#e0f0ff;font-weight:700">صافي الربح / الخسارة</td><td class="num" style="padding:6px 4px;font-weight:700;color:${netProfitDisplay>=0?'#4ada8e':'#da4a4a'}">${fmt(netProfitDisplay)} ر.س</td><td class="num" style="padding:6px 4px;font-weight:600;color:${netProfitDisplay>=0?'#4ada8e':'#da4a4a'}">${netPct}%</td></tr>
        </table>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:.77rem;color:#7090b0">
          <span>هامش إجمالي: <strong style="color:#c8e0f8">${grossPct}%</strong></span>
          <span>هامش صافٍ: <strong style="color:${netProfitDisplay>=0?'#4ada8e':'#da4a4a'}">${netPct}%</strong></span>
          <span>عائد على الأصول: <strong style="color:#c8e0f8">${r.roa!==null?r.roa.toFixed(1)+'%':'—'}</strong></span>
          <span>عائد على الملكية: <strong style="color:#c8e0f8">${r.roe!==null?r.roe.toFixed(1)+'%':'—'}</strong></span>
          <span>متوسط شهري: <strong style="color:#c8e0f8">${fmt(netProfitDisplay/nMonths)} ر.س</strong></span>
        </div>`;
      })()
    },
    {
      num:'6', title:'هيكل المصروفات التشغيلية',
      body: opexItemsArr.length === 0
        ? '<div style="color:#5a7a9a">لا توجد مصروفات مسجلة لهذه الفترة.</div>'
        : (() => {
            const tot = totalOpex || 1;
            const barColor = pct => pct > 40 ? '#da4a4a' : pct > 20 ? '#da9a4a' : '#4a9eda';
            return opexItemsArr.map(x => {
              const pct = x.val / tot * 100;
              const revPct = c.revenue > 0 ? x.val / c.revenue * 100 : 0;
              return `<div style="margin-bottom:11px">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                  <span style="color:#c0d0e0;font-size:.82rem">${x.lbl}</span>
                  <span style="color:${barColor(pct)};font-size:.82rem;font-weight:600">${fmt(x.val)} ر.س
                    <span style="color:#7090b0;font-weight:400;font-size:.77rem">(${pct.toFixed(1)}%${c.revenue>0?' · '+revPct.toFixed(1)+'% إيراد':''})</span>
                  </span>
                </div>
                <div style="height:7px;border-radius:4px;background:#0d1b2a">
                  <div style="height:100%;border-radius:4px;width:${Math.min(100,pct).toFixed(1)}%;background:${barColor(pct)}99;transition:width .4s"></div>
                </div>
              </div>`;
            }).join('') +
            `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #1e3a5f;display:flex;justify-content:space-between;font-size:.83rem">
               <span style="color:#e0f0ff;font-weight:600">الإجمالي</span>
               <span style="color:#e0f0ff;font-weight:700">${fmt(tot)} ر.س${c.revenue>0?' <span style="color:#7090b0;font-weight:400;font-size:.77rem">('+(tot/c.revenue*100).toFixed(1)+'% من الإيراد)</span>':''}</span>
             </div>`;
          })()
    },
    {
      num:'7', title:'ملاحظات حول التدفق النقدي والسيولة',
      body: (() => {
        const cashPct   = r.currA > 0 ? (r.cash / r.currA * 100).toFixed(1) : '—';
        const bfAssetPct = r.totalA > 0 ? (bfBalance / r.totalA * 100).toFixed(1) : '—';
        let txt = `<table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:10px">
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">رصيد النقد</td><td class="num" style="padding:6px 4px">${fmt(r.cash)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${cashPct}% من المتداولة</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">النسبة الجارية</td><td class="num" style="padding:6px 4px;color:${r.currentRatio!==null&&r.currentRatio>=1.5?'#4ada8e':r.currentRatio!==null&&r.currentRatio>=1?'#da9a4a':'#da4a4a'}">${r.currentRatio !== null ? r.currentRatio.toFixed(2) + '×' : '—'}</td><td class="num" style="padding:6px 4px;color:#7090b0">المستهدف > 1.5×</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">نسبة النقدية</td><td class="num" style="padding:6px 4px;color:${r.cashRatio!==null&&r.cashRatio>=0.5?'#4ada8e':r.cashRatio!==null&&r.cashRatio>=0.2?'#da9a4a':'#da4a4a'}">${r.cashRatio !== null ? r.cashRatio.toFixed(2) + '×' : '—'}</td><td class="num" style="padding:6px 4px;color:#7090b0">المستهدف > 0.5×</td></tr>
          ${bfBalance > 0 ? `<tr><td style="padding:6px 4px;color:#a0c4e8">التسهيلات البنكية</td><td class="num" style="padding:6px 4px">${fmt(bfBalance)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${bfAssetPct}% من الأصول</td></tr>` : ''}
        </table>`;
        if (bfBalance > 0) {
          txt += `التسهيلات البنكية (${fmt(bfBalance)} ر.س) مُصنَّفة ضمن <strong>أنشطة التمويل</strong>. `;
          if (bfChg !== 0) txt += `خلال الفترة ${bfChg > 0 ? 'استُخدمت تسهيلات إضافية' : 'سُدِّد جزء من التسهيلات'} بمقدار ${fmt(Math.abs(bfChg))} ر.س. `;
        } else {
          txt += 'لا توجد تسهيلات بنكية مسجّلة في هذه الفترة. ';
        }
        txt += netProfitDisplay > 0 ? `التدفق النقدي التشغيلي المقدّر إيجابي — الشركة تولّد نقداً من عملياتها.` : `صافي الربح سالب يُشير إلى ضغط محتمل على التدفق النقدي التشغيلي.`;
        return txt;
      })()
    },
    {
      num:'8', title:'الأداء الشهري التفصيلي',
      body: (() => {
        if (moToDate.length === 0) return '<div style="color:#5a7a9a">لا توجد بيانات شهرية.</div>';
        const rows = moToDate.map(mo => {
          const plMo   = (pl || []).find(p => p.month === mo.month && (!plFrom || p.month >= plFrom));
          const rev    = plMo ? (plMo.revenue || 0) : 0;
          const cogs   = plMo ? ((plMo.cogs || 0) + (plMo.otherCost || 0)) : 0;
          const gross  = rev - cogs;
          const opex   = (mo.sal||0)+(mo.rent||0)+(mo.maint||0)+(mo.sell||0)+(mo.dist||0)+(mo.adm||0)+(mo.fin||0)+(mo.char||0)+(mo.oth||0);
          const net    = gross - opex;
          const margin = rev > 0 ? (net / rev * 100) : null;
          const col    = net >= 0 ? '#4ada8e' : '#da4a4a';
          return { label: mo.label || mo.month, rev, gross, opex, net, margin, col };
        });
        const totRev   = rows.reduce((s, x) => s + x.rev,   0);
        const totGross = rows.reduce((s, x) => s + x.gross, 0);
        const totOpex  = rows.reduce((s, x) => s + x.opex,  0);
        const totNet   = rows.reduce((s, x) => s + x.net,   0);
        const totMargin = totRev > 0 ? (totNet / totRev * 100) : null;
        return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.81rem;white-space:nowrap">
          <thead><tr style="background:#0a1e30">
            <th style="padding:7px 6px;text-align:right;color:#7090b0;font-weight:500">الشهر</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">الإيراد</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">مجمل الربح</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">المصروفات</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">صافي الربح</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">الهامش</th>
          </tr></thead>
          <tbody>
          ${rows.map(x => `<tr style="border-bottom:1px solid #0e2540">
            <td style="padding:6px 6px;color:#c0d0e0">${x.label}</td>
            <td class="num" style="padding:6px 6px">${x.rev > 0 ? fmt(x.rev) : '—'}</td>
            <td class="num" style="padding:6px 6px;color:${x.gross>=0?'#a0c8a0':'#da4a4a'}">${x.rev>0?fmt(x.gross):'—'}</td>
            <td class="num" style="padding:6px 6px;color:#c0a060">${x.opex > 0 ? fmt(x.opex) : '—'}</td>
            <td class="num" style="padding:6px 6px;color:${x.col};font-weight:600">${x.rev>0?fmt(x.net):'—'}</td>
            <td class="num" style="padding:6px 6px;color:${x.col}">${x.margin!==null?x.margin.toFixed(1)+'%':'—'}</td>
          </tr>`).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid #3a7abf;background:#0a1e30">
            <td style="padding:7px 6px;color:#e0f0ff;font-weight:600">الإجمالي</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:#e0f0ff">${fmt(totRev)}</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:${totGross>=0?'#4ada8e':'#da4a4a'}">${fmt(totGross)}</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:#c0a060">${fmt(totOpex)}</td>
            <td class="num" style="padding:7px 6px;font-weight:700;color:${totNet>=0?'#4ada8e':'#da4a4a'}">${fmt(totNet)}</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:${totNet>=0?'#4ada8e':'#da4a4a'}">${totMargin!==null?totMargin.toFixed(1)+'%':'—'}</td>
          </tr></tfoot>
        </table></div>`;
      })()
    }
  ];

  const noteHtml = n => `
    <div style="margin-bottom:18px;padding:16px;background:#0d1b2a;border-radius:8px;border:1px solid #1e3a5f">
      <div style="color:#5baef0;font-weight:700;font-size:.88rem;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #1e3a5f">
        إيضاح رقم ${n.num}: ${n.title}
      </div>
      <div style="color:#b0c8e0;font-size:.83rem;line-height:1.9">${n.body}</div>
    </div>`;

  const execHtml = `
    <div style="margin-bottom:20px;padding:16px;background:linear-gradient(135deg,#0a2540,#0d1b2a);border-radius:8px;border:1px solid #2a5080">
      <div style="color:#a0c4e8;font-weight:700;font-size:.88rem;margin-bottom:8px">الملخص التنفيذي</div>
      <div style="color:#b8cce0;font-size:.84rem;line-height:2">${execSummary}</div>
    </div>`;

  document.getElementById('notes-body').innerHTML = execHtml + notes.map(noteHtml).join('');
}

// ── NOTES export helpers ───────────────────────────────────────────────────────

function _buildNotesData(bs, pl, monthly, asOf, plFrom, plMode) {
  const r = computeRatios(bs, pl, asOf, plFrom);
  if (!r) return null;
  const plToDate   = (pl || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const moToDate   = (monthly || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const c          = aggregatePL(plToDate);
  const nMonths    = Math.max(plToDate.length, 1);
  const totalCost  = c.cogs + (c.otherCost || 0);
  const mSal   = moToDate.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent  = moToDate.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint = moToDate.reduce((s, m) => s + (m.maint||0), 0);
  const mSell  = moToDate.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist  = moToDate.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm   = moToDate.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin   = moToDate.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar  = moToDate.reduce((s, m) => s + (m.char ||0), 0);
  const mOth   = moToDate.reduce((s, m) => s + (m.oth  ||0), 0);
  const totalOpex  = mSal + mRent + mMaint + mSell + mDist + mAdm + mFin + mChar + mOth;
  const netProfit  = c.grossProfit - totalOpex;
  const opexItems  = [
    { lbl:'الرواتب والأجور',    val: mSal   },
    { lbl:'الإيجار',            val: mRent  },
    { lbl:'الصيانة والتشغيل',  val: mMaint },
    { lbl:'المصروفات البيعية',  val: mSell  },
    { lbl:'التوزيع والنقل',     val: mDist  },
    { lbl:'المصروفات الإدارية',val: mAdm   },
    { lbl:'التكاليف المالية',   val: mFin   },
    { lbl:'المصروفات الخيرية', val: mChar  },
    { lbl:'مصروفات أخرى',      val: mOth   },
  ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);
  const monthRows  = moToDate.map(mo => {
    const plMo  = (pl || []).find(p => p.month === mo.month && (!plFrom || p.month >= plFrom));
    const rev   = plMo ? (plMo.revenue || 0) : 0;
    const cogs  = plMo ? ((plMo.cogs || 0) + (plMo.otherCost || 0)) : 0;
    const gross = rev - cogs;
    const opex  = (mo.sal||0)+(mo.rent||0)+(mo.maint||0)+(mo.sell||0)+(mo.dist||0)+(mo.adm||0)+(mo.fin||0)+(mo.char||0)+(mo.oth||0);
    const net   = gross - opex;
    const margin = rev > 0 ? (net / rev * 100) : null;
    return { label: mo.label || mo.month, rev, cogs, gross, opex, net, margin };
  });
  const modeLabel = { ytd:'من بداية السنة الجارية', cumul:'تراكمي من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || plMode;
  return { r, c, nMonths, totalCost, totalOpex, netProfit, opexItems, monthRows, modeLabel };
}

function buildNotesHTMLReport(bs, pl, monthly, asOf, plFrom, plMode) {
  const d = _buildNotesData(bs, pl, monthly, asOf, plFrom, plMode);
  if (!d) return '<html><body>لا توجد بيانات</body></html>';
  const { r, c, nMonths, totalCost, totalOpex, netProfit, opexItems, monthRows, modeLabel } = d;
  const companyName = State.get('companyName') || 'الشركة';
  const periodLabel = r.label || asOf;
  const genDate     = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const fN  = v => Math.round(Math.abs(v)).toLocaleString('ar-SA');
  const fSg = v => v < 0 ? `(${fN(v)})` : fN(v);
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const bfRows   = State.get('bankFacilities') || [];
  const bfRow    = bfRows.filter(b => b.month <= asOf).slice(-1)[0];
  const bfBalance = bfRow ? Math.abs(bfRow.balance) : 0;

  // Recs (plain text)
  const recs = [];
  const addRec = (pri, icon, title, body) => recs.push({ pri, icon, title, body });
  if (r.currentRatio !== null && r.currentRatio < 1)
    addRec(1,'🚨','ضعف السيولة الحرجة',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستوى الأمن.`);
  else if (r.currentRatio !== null && r.currentRatio < 1.5)
    addRec(2,'⚠️','السيولة بحاجة إلى تحسين',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستهدف (1.5×).`);
  if (r.quickRatio !== null && r.quickRatio < 0.7)
    addRec(1,'🚨','نسبة سريعة حرجة',`النسبة السريعة ${r.quickRatio.toFixed(2)}× اعتماد مفرط على المخزون.`);
  if (r.netMargin !== null && r.netMargin < 0)
    addRec(1,'📉','الشركة تعمل بخسارة',`صافي الربح سالب (${r.netMargin.toFixed(1)}%).`);
  else if (r.netMargin !== null && r.netMargin < 3)
    addRec(2,'⚠️','هامش الربح الصافي منخفض',`هامش ${r.netMargin.toFixed(1)}% أقل من الحد الأدنى (3%).`);
  if (r.grossMargin !== null && r.grossMargin < 10)
    addRec(2,'⚠️','هامش الربح الإجمالي ضعيف',`هامش ${r.grossMargin.toFixed(1)}%.`);
  if (r.roe !== null && r.roe < 8)
    addRec(r.roe < 0 ? 1 : 2,'💰','العائد على الملكية ضعيف',`العائد ${r.roe.toFixed(1)}%.`);
  if (r.debtEquity !== null && r.debtEquity > 2)
    addRec(2,'⚖️','ارتفاع الرفع المالي',`نسبة الدين / الملكية ${r.debtEquity.toFixed(2)}×.`);
  if (r.intCoverage !== null && r.intCoverage < 1.5)
    addRec(1,'🏦','ضعف تغطية الفوائد',`تغطية الفوائد ${r.intCoverage.toFixed(1)}×.`);
  if (r.arDays !== null && r.arDays > 90)
    addRec(2,'📅','بطء تحصيل المديونيات',`متوسط أيام التحصيل ${r.arDays.toFixed(0)}.`);
  if (r.invDays !== null && r.invDays > 90)
    addRec(2,'📦','بطء دوران المخزون',`متوسط أيام الدوران ${r.invDays.toFixed(0)}.`);
  recs.sort((a, b) => a.pri - b.pri);

  // Strengths
  const strs = [];
  if (r.currentRatio !== null && r.currentRatio >= 1.5) strs.push({ icon:'💧', title:'سيولة جيدة', body:`النسبة الجارية ${r.currentRatio.toFixed(2)}×.` });
  if (r.netMargin !== null && r.netMargin >= 8)          strs.push({ icon:'📈', title:'هامش ربح مرتفع', body:`هامش ${r.netMargin.toFixed(1)}%.` });
  if (r.roe !== null && r.roe >= 15)                     strs.push({ icon:'💰', title:'عائد ممتاز على الملكية', body:`${r.roe.toFixed(1)}%.` });
  if (r.debtEquity !== null && r.debtEquity < 1)         strs.push({ icon:'⚖️', title:'هيكل مالي محافظ', body:`نسبة الدين ${r.debtEquity.toFixed(2)}×.` });
  if (r.arDays !== null && r.arDays < 60)                strs.push({ icon:'📅', title:'تحصيل سريع', body:`${r.arDays.toFixed(0)} يوم.` });
  if (r.grossMargin !== null && r.grossMargin >= 20)     strs.push({ icon:'📊', title:'هامش إجمالي قوي', body:`${r.grossMargin.toFixed(1)}%.` });

  const priColor = { 1:'#c0392b', 2:'#d68910', 3:'#1a5276' };
  const priLabel = { 1:'عاجل', 2:'متابعة', 3:'ملاحظة' };
  const grossPct = c.revenue > 0 ? (c.grossProfit / c.revenue * 100).toFixed(1) : '—';
  const netPct   = c.revenue > 0 ? (netProfit / c.revenue * 100).toFixed(1) : '—';

  // monthly totals
  const totRev   = monthRows.reduce((s,x) => s + x.rev,   0);
  const totCogs  = monthRows.reduce((s,x) => s + x.cogs,  0);
  const totGross = monthRows.reduce((s,x) => s + x.gross, 0);
  const totOpex2 = monthRows.reduce((s,x) => s + x.opex,  0);
  const totNet   = monthRows.reduce((s,x) => s + x.net,   0);
  const totMrg   = totRev > 0 ? (totNet / totRev * 100).toFixed(1) : '—';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>الإيضاحات المالية — ${esc(companyName)} — ${esc(asOf)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:10pt;color:#1a1a2e;background:#fff;direction:rtl;padding:20px}
  h1{font-size:16pt;color:#0a2040;margin-bottom:4px}
  h2{font-size:11pt;color:#1a3a6a;margin:18px 0 8px;border-bottom:2px solid #1a3a6a;padding-bottom:4px}
  h3{font-size:10pt;color:#1a3a6a;margin:12px 0 6px}
  .cover{text-align:center;padding:24px;background:#0a2040;color:#fff;border-radius:8px;margin-bottom:24px}
  .cover h1{color:#fff;font-size:18pt}
  .cover .sub{color:#a0c4e8;font-size:10pt;margin-top:6px}
  .kpi-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
  .kpi{flex:1;min-width:130px;padding:12px;border:1px solid #c8d8e8;border-radius:6px;text-align:center}
  .kpi .lbl{font-size:8.5pt;color:#4a6a8a;margin-bottom:4px}
  .kpi .val{font-size:11pt;font-weight:700;color:#0a2040}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9pt}
  th{background:#1a3a6a;color:#fff;padding:7px 8px;text-align:right;font-weight:600}
  td{padding:6px 8px;border-bottom:1px solid #e0e8f0}
  tr:nth-child(even) td{background:#f4f7fb}
  .num{text-align:left;font-variant-numeric:tabular-nums}
  .subtotal td{background:#e8f0f8;font-weight:600}
  .total td{background:#1a3a6a;color:#fff;font-weight:700}
  .rec{padding:10px 12px;border-radius:6px;margin-bottom:8px;border-right:3px solid #c0392b}
  .rec.p1{border-color:#c0392b;background:#fdf2f2}
  .rec.p2{border-color:#d68910;background:#fdf8e8}
  .rec.p3{border-color:#1a5276;background:#eaf4fb}
  .rec .title{font-weight:700;font-size:9.5pt;margin-bottom:3px}
  .rec .body{font-size:8.5pt;color:#444;line-height:1.6}
  .rec .badge{font-size:7.5pt;padding:1px 6px;border-radius:8px;float:left;margin-top:1px}
  .str{padding:8px 12px;border-radius:6px;margin-bottom:6px;background:#f0fff4;border-right:3px solid #27ae60}
  .str .title{font-weight:700;color:#1a6a2a;font-size:9pt}
  .str .body{font-size:8.5pt;color:#2d6a3a;line-height:1.5}
  .note-block{margin-bottom:16px;padding:14px;border:1px solid #c8d8e8;border-radius:6px}
  .note-hdr{font-size:10pt;font-weight:700;color:#1a3a6a;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #c8d8e8}
  .exec-box{padding:14px;background:#eef4fb;border:1px solid #a0c0e0;border-radius:6px;margin-bottom:16px;font-size:9.5pt;line-height:1.8;color:#1a2a3a}
  .bar-wrap{height:6px;background:#e0e8f0;border-radius:3px;margin-top:3px}
  .bar{height:100%;border-radius:3px}
  .footer{margin-top:24px;padding-top:8px;border-top:1px solid #c8d8e8;font-size:8pt;color:#6a8aaa;text-align:center}
  @media print{body{padding:10px}.cover{page-break-after:always}}
</style>
</head>
<body>
<div class="cover">
  <h1>${esc(companyName)}</h1>
  <div class="sub">الإيضاحات المتممة للقوائم المالية</div>
  <div class="sub">الفترة: ${esc(modeLabel)} — حتى ${esc(periodLabel)} (${nMonths} ${nMonths===1?'شهر':'أشهر'})</div>
  <div class="sub">تاريخ الإعداد: ${genDate}</div>
</div>

<h2>المؤشرات الرئيسية</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="lbl">الفترة</div><div class="val">${nMonths} ${nMonths===1?'شهر':'أشهر'}</div></div>
  <div class="kpi"><div class="lbl">إيراد الفترة</div><div class="val">${fN(c.revenue)} ر.س</div></div>
  <div class="kpi"><div class="lbl">صافي الربح / الخسارة</div><div class="val" style="color:${netProfit>=0?'#1a6a2a':'#c0392b'}">${fSg(netProfit)} ر.س</div></div>
  <div class="kpi"><div class="lbl">هامش الربح الصافي</div><div class="val" style="color:${r.netMargin!==null&&r.netMargin>=5?'#1a6a2a':r.netMargin!==null&&r.netMargin>=2?'#d68910':'#c0392b'}">${r.netMargin !== null ? r.netMargin.toFixed(1)+'%' : '—'}</div></div>
  <div class="kpi"><div class="lbl">إجمالي الأصول</div><div class="val">${fN(r.totalA)} ر.س</div></div>
  <div class="kpi"><div class="lbl">حقوق الملكية</div><div class="val" style="color:${r.totalE>=0?'#1a6a2a':'#c0392b'}">${fSg(r.totalE)} ر.س</div></div>
</div>

<div class="exec-box"><strong>الملخص التنفيذي:</strong> بناءً على البيانات المالية لـ ${esc(companyName)} للفترة المنتهية في ${esc(periodLabel)} (${nMonths} ${nMonths===1?'شهر':'أشهر'}): ${c.revenue > 0 ? `حُقِّق إيراد بلغ ${fN(c.revenue)} ر.س بتكلفة بضاعة ${fN(totalCost)} ر.س (هامش إجمالي ${grossPct}%). بعد خصم المصروفات التشغيلية ${fN(totalOpex)} ر.س: صافي ${netProfit >= 0 ? 'ربح' : 'خسارة'} ${fSg(netProfit)} ر.س (هامش ${netPct}%).` : 'لا توجد بيانات إيراد كافية.'} إجمالي الأصول ${fN(r.totalA)} ر.س وحقوق الملكية ${fSg(r.totalE)} ر.س. ${recs.filter(x=>x.pri===1).length > 0 ? `يُرصد ${recs.filter(x=>x.pri===1).length} بند حرج يستدعي تدخلاً عاجلاً.` : recs.filter(x=>x.pri===2).length > 0 ? `يُرصد ${recs.filter(x=>x.pri===2).length} بند يستدعي المتابعة.` : 'لا توجد مخاطر حرجة.'}</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px">
<div>
<h2>التوجيهات المالية ذات الأولوية</h2>
${recs.length === 0
  ? '<div class="rec p3"><div class="body">لا توجد توجيهات عاجلة — الوضع المالي ضمن النطاق المقبول.</div></div>'
  : recs.map(rec => `<div class="rec p${rec.pri}"><div class="title">${rec.icon} ${esc(rec.title)} <span class="badge" style="background:${priColor[rec.pri]}22;color:${priColor[rec.pri]}">${priLabel[rec.pri]}</span></div><div class="body">${esc(rec.body)}</div></div>`).join('')}
</div>
<div>
<h2>نقاط القوة المالية</h2>
${strs.length === 0
  ? '<div class="str"><div class="body">ستظهر نقاط القوة عند بلوغ النسب المستويات الممتازة.</div></div>'
  : strs.map(s => `<div class="str"><div class="title">${s.icon} ${esc(s.title)}</div><div class="body">${esc(s.body)}</div></div>`).join('')}
</div>
</div>

<h2>الإيضاحات المتممة للقوائم المالية</h2>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 1: أساس الإعداد</div>
أُعدّت هذه القوائم المالية وفقاً للمعايير المحاسبية للمنشآت الصغيرة والمتوسطة الصادرة عن SOCPA، وعلى أساس الاستحقاق المحاسبي. تُعبّر القوائم عن المركز المالي والأداء التشغيلي لـ ${esc(companyName)} للفترة المنتهية في ${esc(periodLabel)} (${nMonths} ${nMonths===1?'شهر':'أشهر'}) — فترة الاحتساب: ${esc(modeLabel)}.
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 2: السياسات المحاسبية الجوهرية</div>
<ul style="padding-right:18px;line-height:2">
  <li><strong>الإيراد:</strong> يُثبَّت عند نقل السيطرة على السلعة أو الخدمة إلى العميل.</li>
  <li><strong>المخزون:</strong> يُقيَّم بالتكلفة أو صافي القيمة القابلة للتحقق أيهما أقل.</li>
  <li><strong>الأصول الثابتة:</strong> تُستهلك بالطريقة الثابتة على مدى عمرها الإنتاجي المقدر.</li>
  <li><strong>ضريبة القيمة المضافة:</strong> تُطبَّق بالمعدل القياسي 15%.</li>
  <li><strong>العملة الوظيفية:</strong> الريال السعودي (ر.س).</li>
</ul>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 3: الأصول المتداولة</div>
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">النسبة</th></tr>
  <tr><td>النقد وما في حكمه</td><td class="num">${fN(r.cash)}</td><td class="num">${r.currA>0?(r.cash/r.currA*100).toFixed(1)+'%':'—'}</td></tr>
  <tr><td>المدينون التجاريون</td><td class="num">${fN(r.ar)}</td><td class="num">${r.arDays!==null?r.arDays.toFixed(0)+' يوم تحصيل':'—'}</td></tr>
  <tr><td>المخزون</td><td class="num">${fN(r.inventory)}</td><td class="num">${r.invDays!==null?r.invDays.toFixed(0)+' يوم دوران':'—'}</td></tr>
  <tr class="subtotal"><td>إجمالي الأصول المتداولة</td><td class="num">${fN(r.currA)}</td><td></td></tr>
</table>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 4: الالتزامات والتسهيلات البنكية</div>
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">ملاحظة</th></tr>
  <tr><td>الالتزامات المتداولة</td><td class="num">${fN(r.currL)}</td><td class="num">${r.totalL>0?(r.currL/r.totalL*100).toFixed(1)+'% من الالتزامات':''}</td></tr>
  <tr><td>التسهيلات الائتمانية البنكية</td><td class="num">${fN(bfBalance)}</td><td></td></tr>
  <tr class="subtotal"><td>إجمالي الالتزامات</td><td class="num">${fN(r.totalL)}</td><td class="num">نسبة الدين: ${r.debtEquity!==null?r.debtEquity.toFixed(2)+'×':'—'}</td></tr>
  <tr class="total"><td>حقوق الملكية</td><td class="num">${fSg(r.totalE)}</td><td></td></tr>
</table>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 5: نتائج الأعمال — قائمة الدخل</div>
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">%</th></tr>
  <tr><td>الإيراد</td><td class="num">${fN(c.revenue)}</td><td class="num">100%</td></tr>
  <tr><td>تكلفة البضاعة المباعة</td><td class="num">(${fN(totalCost)})</td><td class="num">${c.revenue>0?(totalCost/c.revenue*100).toFixed(1)+'%':''}</td></tr>
  <tr class="subtotal"><td>مجمل الربح</td><td class="num">${fSg(c.grossProfit)}</td><td class="num">${grossPct}%</td></tr>
  <tr><td>إجمالي المصروفات التشغيلية</td><td class="num">(${fN(totalOpex)})</td><td class="num">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':''}</td></tr>
  <tr class="total"><td>صافي الربح / الخسارة</td><td class="num">${fSg(netProfit)}</td><td class="num">${netPct}%</td></tr>
</table>
<div style="font-size:8.5pt;color:#4a6a8a;margin-top:8px">هامش إجمالي: ${grossPct}% | هامش صافٍ: ${netPct}% | عائد على الأصول: ${r.roa!==null?r.roa.toFixed(1)+'%':'—'} | عائد على الملكية: ${r.roe!==null?r.roe.toFixed(1)+'%':'—'}</div>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 6: هيكل المصروفات التشغيلية</div>
${opexItems.length === 0 ? '<p>لا توجد مصروفات مسجلة.</p>' : `
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">% من المصروفات</th><th class="num">% من الإيراد</th></tr>
  ${opexItems.map(x => `<tr><td>${esc(x.lbl)}</td><td class="num">${fN(x.val)}</td><td class="num">${totalOpex>0?(x.val/totalOpex*100).toFixed(1)+'%':'—'}</td><td class="num">${c.revenue>0?(x.val/c.revenue*100).toFixed(1)+'%':'—'}</td></tr>`).join('')}
  <tr class="subtotal"><td>الإجمالي</td><td class="num">${fN(totalOpex)}</td><td class="num">100%</td><td class="num">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':'—'}</td></tr>
</table>`}
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 7: ملاحظات حول التدفق النقدي والسيولة</div>
<table>
  <tr><th>المؤشر</th><th class="num">القيمة</th><th class="num">المستهدف</th></tr>
  <tr><td>رصيد النقد</td><td class="num">${fN(r.cash)} ر.س</td><td></td></tr>
  <tr><td>النسبة الجارية</td><td class="num">${r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—'}</td><td class="num">&gt; 1.5×</td></tr>
  <tr><td>النسبة السريعة</td><td class="num">${r.quickRatio!==null?r.quickRatio.toFixed(2)+'×':'—'}</td><td class="num">&gt; 1×</td></tr>
  <tr><td>نسبة النقدية</td><td class="num">${r.cashRatio!==null?r.cashRatio.toFixed(2)+'×':'—'}</td><td class="num">&gt; 0.5×</td></tr>
  ${bfBalance>0?`<tr><td>التسهيلات البنكية</td><td class="num">${fN(bfBalance)} ر.س</td><td></td></tr>`:''}
</table>
${netProfit > 0 ? 'التدفق النقدي التشغيلي المقدّر إيجابي.' : 'صافي الربح سالب — ضغط محتمل على التدفق النقدي.'}
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 8: الأداء الشهري التفصيلي</div>
${monthRows.length === 0 ? '<p>لا توجد بيانات شهرية.</p>' : `
<table>
  <tr><th>الشهر</th><th class="num">الإيراد</th><th class="num">ت. البضاعة</th><th class="num">مجمل الربح</th><th class="num">المصروفات</th><th class="num">صافي الربح</th><th class="num">الهامش</th></tr>
  ${monthRows.map(x => `<tr><td>${esc(x.label)}</td><td class="num">${x.rev>0?fN(x.rev):'—'}</td><td class="num">${x.rev>0?fN(x.cogs):'—'}</td><td class="num">${x.rev>0?fSg(x.gross):'—'}</td><td class="num">${x.opex>0?fN(x.opex):'—'}</td><td class="num" style="color:${x.net>=0?'#1a6a2a':'#c0392b'}">${x.rev>0?fSg(x.net):'—'}</td><td class="num">${x.margin!==null?x.margin.toFixed(1)+'%':'—'}</td></tr>`).join('')}
  <tr class="subtotal"><td>الإجمالي</td><td class="num">${fN(totRev)}</td><td class="num">${fN(totCogs)}</td><td class="num">${fSg(totGross)}</td><td class="num">${fN(totOpex2)}</td><td class="num" style="color:${totNet>=0?'#1a6a2a':'#c0392b'}">${fSg(totNet)}</td><td class="num">${totMrg}%</td></tr>
</table>`}
</div>

<div class="footer">أُنشئ بواسطة MekSoft ERP Dashboard — ${genDate}</div>
</body>
</html>`;
}

function exportNotesHTML() {
  const bs      = State.get('bs');
  const pl      = State.get('pl');
  const monthly = State.get('monthly');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('notes-period-sel') || {}).value || '';
  const plMode = (document.getElementById('notes-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html   = buildNotesHTMLReport(bs, pl, monthly, asOf, plFrom, plMode);
  const blob   = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `الإيضاحات_المالية_${asOf}.html`; a.click();
  URL.revokeObjectURL(url);
}

function printNotesPDF() {
  const bs      = State.get('bs');
  const pl      = State.get('pl');
  const monthly = State.get('monthly');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('notes-period-sel') || {}).value || '';
  const plMode = (document.getElementById('notes-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html   = buildNotesHTMLReport(bs, pl, monthly, asOf, plFrom, plMode);
  const w      = window.open('', '_blank', 'width=960,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportNotesExcel() {
  const bs      = State.get('bs');
  const pl      = State.get('pl');
  const monthly = State.get('monthly');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }
  const asOf   = (document.getElementById('notes-period-sel') || {}).value || '';
  const plMode = (document.getElementById('notes-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const nd     = _buildNotesData(bs, pl, monthly, asOf, plFrom, plMode);
  if (!nd) { alert('لا توجد بيانات للفترة المحددة'); return; }
  const { r, c, nMonths, totalCost, totalOpex, netProfit, opexItems, monthRows, modeLabel } = nd;
  const companyName = State.get('companyName') || 'الشركة';
  const periodLabel = r.label || asOf;
  const genDate     = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });

  const FONT = 'Calibri';
  const CLR  = { navyDark:'FF0A2040', navy:'FF1A3A6A', bluePale:'FFF4F7FB', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textLight:'FF6A8AAA',
    green:'FF1a6a2a', greenBg:'FFF4FFF8', greenText:'FF1A6A2A',
    red:'FFc0392b', redBg:'FFFFF0F0', amber:'FFd68910', amberBg:'FFFFFBE8' };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: المؤشرات المالية ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet('المؤشرات المالية', { views:[{ rightToLeft:true }] });
  ws1.pageSetup.paperSize = 9; ws1.pageSetup.orientation = 'portrait'; ws1.pageSetup.fitToPage = true;
  ws1.columns = [{ width:36 }, { width:22 }, { width:22 }, { width:28 }];

  const spanA = row => ws1.mergeCells(row.number, 1, row.number, 4);
  const addHA = (t, sz, fc, bg) => {
    const row = ws1.addRow([t]); row.height = sz > 12 ? 30 : 20; spanA(row);
    const cell = row.getCell(1); cell.font = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
    cell.fill = solid(bg); cell.alignment = { horizontal:'center', vertical:'middle' };
  };
  const addSA = (h=4) => { const row = ws1.addRow(['']); row.height = h; spanA(row); row.getCell(1).fill = solid(CLR.white); };

  addHA(`الإيضاحات المالية — ${companyName}`, 14, CLR.white, CLR.navyDark);
  addHA(`${modeLabel} — حتى ${periodLabel}`, 11, 'FFAACCE8', CLR.navyDark);
  addHA(`المبالغ بالريال السعودي — أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  addSA(4);

  // Section: المؤشرات الرئيسية
  const secHdr1 = ws1.addRow(['المؤشرات الرئيسية']); secHdr1.height = 18; spanA(secHdr1);
  secHdr1.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
  secHdr1.getCell(1).fill = solid(CLR.navy);
  secHdr1.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };

  const kpiHdr = ws1.addRow(['البند', 'القيمة', '', '']); kpiHdr.height = 16;
  ws1.mergeCells(kpiHdr.number, 3, kpiHdr.number, 4);
  kpiHdr.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9, bold:true, color:{ argb:CLR.textNavy } };
    cell.fill = solid(CLR.bluePale); cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('thin','FFCCDDEE') };
  });

  const kpiRows = [
    ['الفترة',             `${nMonths} ${nMonths===1?'شهر':'أشهر'} حتى ${periodLabel}`],
    ['الإيراد',            c.revenue],
    ['تكلفة البضاعة',     totalCost],
    ['مجمل الربح',         c.grossProfit],
    ['المصروفات التشغيلية',totalOpex],
    ['صافي الربح / الخسارة', netProfit],
  ];
  kpiRows.forEach(([lbl, val]) => {
    const isProfit = lbl.includes('صافي') || lbl.includes('مجمل');
    const row = ws1.addRow([lbl, typeof val === 'number' ? val : val, '', '']); row.height = 15;
    ws1.mergeCells(row.number, 3, row.number, 4);
    row.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:2 }; row.getCell(1).border = { bottom:bdr('hair','FFE8ECF0') };
    const c2 = row.getCell(2);
    if (typeof val === 'number') {
      c2.value = val; c2.numFmt = '#,##0;(#,##0)';
      const isLoss = isProfit && val < 0;
      c2.font = { name:FONT, size:9.5, bold:isProfit, color:{ argb: isProfit ? (val>=0?CLR.greenText:CLR.red) : CLR.textDark } };
    } else {
      c2.value = val; c2.font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } };
    }
    c2.alignment = { horizontal:'center', vertical:'middle' }; c2.border = { bottom:bdr('hair','FFE8ECF0') };
  });
  addSA(4);

  // Section: النسب المالية
  const secHdr2 = ws1.addRow(['النسب المالية']); secHdr2.height = 18; spanA(secHdr2);
  secHdr2.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
  secHdr2.getCell(1).fill = solid(CLR.navy);
  secHdr2.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };

  const ratioHdr = ws1.addRow(['النسبة', 'القيمة', 'التقييم', 'المعيار']); ratioHdr.height = 16;
  ratioHdr.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9, bold:true, color:{ argb:CLR.textNavy } };
    cell.fill = solid(CLR.bluePale); cell.alignment = { horizontal:ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('thin','FFCCDDEE') };
  });

  const ratioClr = (v, lo, hi, hb=true) => {
    if (v===null || !isFinite(v)) return { txt:CLR.textLight, bg:CLR.white };
    const g = hb ? (v>=hi) : (v<=lo), am = hb ? (v>=lo && v<hi) : (v>lo && v<=hi);
    return g ? { txt:CLR.greenText, bg:'FFF4FFF8' } : am ? { txt:'FF7A5A00', bg:'FFFFFBE8' } : { txt:'FF8A1A1A', bg:'FFFFF0F0' };
  };

  const groups1 = [...new Set(RATIO_DEFS.map(d => d.group))];
  groups1.forEach(g => {
    const gRow = ws1.addRow([g]); gRow.height = 16; spanA(gRow);
    gRow.getCell(1).font = { name:FONT, size:9, bold:true, color:{ argb:'FF4a8aaa' } };
    gRow.getCell(1).fill = solid('FF0a1e30'); gRow.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };
    RATIO_DEFS.filter(d => d.group === g).forEach(d => {
      const v   = r[d.key];
      const vc  = ratioClr(v, d.lo, d.hi, d.hb);
      const fmtd = (v===null || !isFinite(v)) ? '—' : v.toFixed(d.dec) + d.sfx;
      const rating = (v===null || !isFinite(v)) ? 'غير متاح' : (vc.txt===CLR.greenText ? 'ممتاز / جيد' : vc.txt==='FF7A5A00' ? 'متوسط' : 'ضعيف');
      const row2 = ws1.addRow([d.lbl, fmtd, rating, d.hint]); row2.height = 15;
      row2.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row2.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:2 }; row2.getCell(1).border = { bottom:bdr('hair','FFE8ECF0') };
      [2, 3].forEach(ci => { const cell = row2.getCell(ci); cell.font = { name:FONT, size:9.5, bold:true, color:{ argb:vc.txt } }; cell.fill = solid(vc.bg); cell.alignment = { horizontal:'center', vertical:'middle' }; cell.border = { bottom:bdr('hair','FFE8ECF0') }; });
      row2.getCell(4).font = { name:FONT, size:8.5, color:{ argb:CLR.textLight } }; row2.getCell(4).alignment = { horizontal:'right', vertical:'middle' }; row2.getCell(4).border = { bottom:bdr('hair','FFE8ECF0') };
    });
  });
  addSA(4);

  // Section: هيكل المصروفات
  const secHdr3 = ws1.addRow(['هيكل المصروفات التشغيلية']); secHdr3.height = 18; spanA(secHdr3);
  secHdr3.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
  secHdr3.getCell(1).fill = solid(CLR.navy);
  secHdr3.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };

  const opexHdr = ws1.addRow(['البند', 'المبلغ (ر.س)', '% من المصروفات', '% من الإيراد']); opexHdr.height = 16;
  opexHdr.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9, bold:true, color:{ argb:CLR.textNavy } };
    cell.fill = solid(CLR.bluePale); cell.alignment = { horizontal:ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('thin','FFCCDDEE') };
  });
  opexItems.forEach(x => {
    const opPct = totalOpex > 0 ? x.val / totalOpex : 0;
    const revPct = c.revenue > 0 ? x.val / c.revenue : 0;
    const row3 = ws1.addRow([x.lbl, x.val, opPct, revPct]); row3.height = 15;
    row3.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row3.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:2 }; row3.getCell(1).border = { bottom:bdr('hair','FFE8ECF0') };
    row3.getCell(2).numFmt = '#,##0'; row3.getCell(2).alignment = { horizontal:'center', vertical:'middle' }; row3.getCell(2).border = { bottom:bdr('hair','FFE8ECF0') };
    row3.getCell(3).numFmt = '0.0%'; row3.getCell(3).alignment = { horizontal:'center', vertical:'middle' }; row3.getCell(3).border = { bottom:bdr('hair','FFE8ECF0') };
    row3.getCell(4).numFmt = '0.0%'; row3.getCell(4).alignment = { horizontal:'center', vertical:'middle' }; row3.getCell(4).border = { bottom:bdr('hair','FFE8ECF0') };
  });
  // Totals row opex
  const opexTotRow = ws1.addRow(['الإجمالي', totalOpex, 1, c.revenue>0?totalOpex/c.revenue:0]); opexTotRow.height = 16;
  opexTotRow.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } }; cell.fill = solid(CLR.navy);
    cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    if (ci === 2) cell.numFmt = '#,##0';
    if (ci === 3) cell.numFmt = '0.0%';
    if (ci === 4) cell.numFmt = '0.0%';
  });

  // ── Sheet 2: الأداء الشهري ────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('الأداء الشهري', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize = 9; ws2.pageSetup.orientation = 'landscape'; ws2.pageSetup.fitToPage = true;
  ws2.columns = [{ width:18 }, { width:18 }, { width:18 }, { width:18 }, { width:22 }, { width:18 }, { width:14 }];

  const NC2  = 7;
  const span2 = row => ws2.mergeCells(row.number, 1, row.number, NC2);
  const addH2 = (t, sz, fc, bg) => {
    const row = ws2.addRow([t]); row.height = sz > 12 ? 30 : 20; span2(row);
    const cell = row.getCell(1); cell.font = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
    cell.fill = solid(bg); cell.alignment = { horizontal:'center', vertical:'middle' };
  };

  addH2(`الأداء الشهري — ${companyName}`, 14, CLR.white, CLR.navyDark);
  addH2(`${modeLabel} — حتى ${periodLabel}`, 11, 'FFAACCE8', CLR.navyDark);
  addH2(`المبالغ بالريال السعودي — أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  { const row = ws2.addRow(['']); row.height = 4; span2(row); row.getCell(1).fill = solid(CLR.white); }

  const colHdr2 = ws2.addRow(['الشهر', 'الإيراد', 'تكلفة البضاعة', 'مجمل الربح', 'المصروفات التشغيلية', 'صافي الربح', 'الهامش']); colHdr2.height = 18;
  colHdr2.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } }; cell.fill = solid(CLR.navy);
    cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('medium','FF3a7abf') };
  });

  monthRows.forEach((x, idx) => {
    const row2 = ws2.addRow([x.label, x.rev||null, x.cogs||null, x.gross||null, x.opex||null, x.net||null, x.margin!==null?x.margin/100:null]); row2.height = 15;
    row2.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row2.getCell(1).alignment = { horizontal:'right', vertical:'middle' }; row2.getCell(1).fill = solid(idx%2===0?CLR.white:CLR.bluePale);
    [2, 3, 4, 5].forEach(ci => { const cell = row2.getCell(ci); cell.numFmt = '#,##0'; cell.alignment = { horizontal:'center', vertical:'middle' }; cell.fill = solid(idx%2===0?CLR.white:CLR.bluePale); cell.border = { bottom:bdr('hair','FFE8ECF0') }; });
    const c6 = row2.getCell(6); c6.numFmt = '#,##0'; c6.alignment = { horizontal:'center', vertical:'middle' }; c6.font = { name:FONT, bold:true, color:{ argb:x.net>=0?CLR.greenText:CLR.red } }; c6.fill = solid(x.net>=0?CLR.greenBg:CLR.redBg); c6.border = { bottom:bdr('hair','FFE8ECF0') };
    const c7 = row2.getCell(7); c7.numFmt = '0.0%'; c7.alignment = { horizontal:'center', vertical:'middle' }; c7.font = { name:FONT, size:9, color:{ argb:x.net>=0?CLR.greenText:CLR.red } }; c7.border = { bottom:bdr('hair','FFE8ECF0') };
  });

  // Totals
  const totRev2  = monthRows.reduce((s,x) => s+x.rev, 0);
  const totCogs2 = monthRows.reduce((s,x) => s+x.cogs, 0);
  const totGrp2  = monthRows.reduce((s,x) => s+x.gross, 0);
  const totOp2   = monthRows.reduce((s,x) => s+x.opex, 0);
  const totNet2  = monthRows.reduce((s,x) => s+x.net, 0);
  const totMrg2  = totRev2 > 0 ? totNet2/totRev2 : null;
  const totRow2  = ws2.addRow(['الإجمالي', totRev2||null, totCogs2||null, totGrp2||null, totOp2||null, totNet2||null, totMrg2]); totRow2.height = 18;
  totRow2.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } }; cell.fill = solid(CLR.navy);
    cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    if (ci===2||ci===3||ci===4||ci===5||ci===6) cell.numFmt = '#,##0';
    if (ci===7) cell.numFmt = '0.0%';
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `الإيضاحات_المالية_${asOf}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── COMPARE tab ───────────────────────────────────────────────────────────────
const MONTH_NUMS   = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const MONTH_LABELS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function renderCompareTab() {
  buildPeriodOptions('cmp-period-sel', true);
  const period  = (document.getElementById('cmp-period-sel') || {}).value || 'all';
  const monthly = filterMonthly(period);
  renderCompareChart(monthly);

  // ── Month-over-month growth ──
  document.getElementById('growth-tbody').innerHTML = monthly.map((m, i) => {
    const t    = monthTotal(m);
    const prev = i > 0 ? monthTotal(monthly[i-1]) : null;
    const diff = prev !== null ? t - prev : null;
    const pct  = prev ? (diff / prev * 100) : null;
    const arrow = diff === null ? '' : diff >= 0 ? '<span style="color:#4ada8e">▲</span>' : '<span style="color:#da4a4a">▼</span>';
    return `<tr><td>${m.label}</td><td class="num">${fmt(t)}</td><td class="num">${diff !== null ? arrow + ' ' + fmt(Math.abs(diff)) : '—'}</td><td class="num">${pct !== null ? fmtPct(Math.abs(pct)) : '—'}</td></tr>`;
  }).join('');

  // ── Top category per month ──
  document.getElementById('top-cat-tbody').innerHTML = monthly.map(m => {
    const t   = monthTotal(m);
    const top = CAT_ORDER.reduce((a, b) => (m[a]||0) >= (m[b]||0) ? a : b);
    return `<tr><td>${m.label}</td><td><span class="badge b-${top}">${CAT_LABEL[top]}</span></td><td class="num">${fmt(m[top]||0)}</td><td class="num">${fmtPct(t ? (m[top]||0)/t*100 : 0)}</td></tr>`;
  }).join('');

  // ── Year-over-Year tables (always use full dataset) ──
  const allMonthly = State.get('monthly');
  const years = [...new Set(allMonthly.map(m => m.month.slice(0, 4)))].sort();
  if (years.length < 1) return;

  // Build matrix: year → monthNum → total
  const matrix = {};
  years.forEach(y => { matrix[y] = {}; });
  allMonthly.forEach(m => {
    const y  = m.month.slice(0, 4);
    const mo = m.month.slice(5, 7);
    matrix[y][mo] = monthTotal(m);
  });

  const yearTotals = {};
  years.forEach(y => { yearTotals[y] = MONTH_NUMS.reduce((s, mo) => s + (matrix[y][mo] || 0), 0); });

  const usedMonths = MONTH_NUMS.filter(mo => years.some(y => matrix[y][mo] !== undefined));

  // delta badge helper
  const yoyChg = (val, prevVal) => {
    if (prevVal === undefined || prevVal === null) return '';
    const d = val - prevVal;
    if (Math.abs(d) < 1 || prevVal === 0) return '';
    const pct = d / prevVal * 100;
    const col = d > 0 ? '#da9a4a' : '#4ada8e';
    return `<br><span style="font-size:.72rem;color:${col}">${d>0?'▲':'▼'}${Math.abs(pct).toFixed(1)}%</span>`;
  };

  const thStyle = 'padding:7px 8px;color:#7090b0;font-weight:500;font-size:.8rem';
  const hdrRow  = `<tr style="background:#0a1e30"><th style="${thStyle};text-align:right">الشهر</th>${years.map(y => `<th class="num" style="${thStyle}">${y}</th>`).join('')}</tr>`;

  // Monthly YoY table
  const yoyHead = document.getElementById('yoy-thead');
  const yoyBody = document.getElementById('yoy-tbody');
  if (yoyHead && yoyBody) {
    yoyHead.innerHTML = hdrRow;
    yoyBody.innerHTML = usedMonths.map(mo => {
      const moIdx = MONTH_NUMS.indexOf(mo);
      const cells = years.map((y, i) => {
        const val   = matrix[y][mo];
        if (val === undefined) return `<td class="num" style="padding:6px 8px;color:#3a5a7a">—</td>`;
        const prev  = i > 0 ? matrix[years[i-1]][mo] : null;
        return `<td class="num" style="padding:6px 8px">${fmt(val)}${yoyChg(val, prev)}</td>`;
      }).join('');
      return `<tr style="border-bottom:1px solid #0e2540"><td style="padding:6px 8px;color:#c0d0e0">${MONTH_LABELS[moIdx]}</td>${cells}</tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;background:#0a1e30;font-weight:600">
       <td style="padding:7px 8px;color:#e0f0ff">الإجمالي</td>
       ${years.map((y, i) => {
         const tot  = yearTotals[y];
         const prev = i > 0 ? yearTotals[years[i-1]] : null;
         return `<td class="num" style="padding:7px 8px;color:#e0f0ff">${fmt(tot)}${yoyChg(tot, prev)}</td>`;
       }).join('')}
     </tr>`;
  }

  // Category YoY table
  const catTotals = {};
  CAT_ORDER.forEach(cat => {
    catTotals[cat] = {};
    years.forEach(y => { catTotals[cat][y] = 0; });
  });
  allMonthly.forEach(m => {
    const y = m.month.slice(0, 4);
    CAT_ORDER.forEach(cat => { catTotals[cat][y] += (m[cat] || 0); });
  });

  const catHead = document.getElementById('yoy-cat-thead');
  const catBody = document.getElementById('yoy-cat-tbody');
  if (catHead && catBody) {
    catHead.innerHTML = hdrRow;
    const activeCats = CAT_ORDER.filter(cat => years.some(y => catTotals[cat][y] > 0));
    catBody.innerHTML = activeCats.map(cat => {
      const cells = years.map((y, i) => {
        const val  = catTotals[cat][y];
        const prev = i > 0 ? catTotals[cat][years[i-1]] : null;
        return `<td class="num" style="padding:6px 8px">${val > 0 ? fmt(val) + yoyChg(val, prev) : '—'}</td>`;
      }).join('');
      return `<tr style="border-bottom:1px solid #0e2540"><td style="padding:6px 8px"><span class="badge b-${cat}">${CAT_LABEL[cat]}</span></td>${cells}</tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;background:#0a1e30;font-weight:600">
       <td style="padding:7px 8px;color:#e0f0ff">الإجمالي</td>
       ${years.map((y, i) => {
         const tot  = yearTotals[y];
         const prev = i > 0 ? yearTotals[years[i-1]] : null;
         return `<td class="num" style="padding:7px 8px;color:#e0f0ff">${fmt(tot)}${yoyChg(tot, prev)}</td>`;
       }).join('')}
     </tr>`;
  }
}

// ── CFO Executive Dashboard ───────────────────────────────────────────────────

let _cfoTrendChart = null;

function _cfoGetPlFrom(quick, lastMo, allMths) {
  if (!lastMo || quick === 'all') return null;
  if (quick === 'ytd') return lastMo.slice(0, 4) + '-01';
  if (quick === 'q') { const mo = parseInt(lastMo.slice(5, 7)); return lastMo.slice(0, 4) + '-' + String(Math.floor((mo - 1) / 3) * 3 + 1).padStart(2, '0'); }
  if (quick === 'h6') { const i = allMths.indexOf(lastMo); return i >= 5 ? allMths[i - 5] : allMths[0]; }
  if (quick === 'h3') { const i = allMths.indexOf(lastMo); return i >= 2 ? allMths[i - 2] : allMths[0]; }
  return null;
}

function _cfoPriorRange(plFrom, lastMo, allMths) {
  if (!plFrom) return null;
  const fi = allMths.indexOf(plFrom), ti = allMths.indexOf(lastMo);
  if (fi < 0 || ti < 0) return null;
  const span = ti - fi + 1;
  const pfi  = fi - span;
  if (pfi < 0) return null;
  return { from: allMths[pfi], to: allMths[fi - 1] };
}

function _cfoHealthScore(r) {
  if (!r) return { score: 0, items: [] };
  const items = [];
  let total = 0;

  const nm = r.netMargin;
  const nmScore = nm === null ? 0 : nm >= 8 ? 25 : nm >= 5 ? 18 : nm >= 2 ? 10 : nm >= 0 ? 4 : 0;
  items.push({ lbl:'هامش الربح الصافي',       score:nmScore, max:25, val:nm!==null?nm.toFixed(2)+'%':'—',  target:'≥ 8%',   col:nmScore>=18?'#4ada8e':nmScore>=10?'#da9a4a':'#da4a4a' });
  total += nmScore;

  const gm = r.grossMargin;
  const gmScore = gm === null ? 0 : gm >= 20 ? 15 : gm >= 15 ? 11 : gm >= 10 ? 7 : gm >= 5 ? 3 : 0;
  items.push({ lbl:'هامش الربح الإجمالي',     score:gmScore, max:15, val:gm!==null?gm.toFixed(1)+'%':'—',  target:'≥ 20%',  col:gmScore>=11?'#4ada8e':gmScore>=7?'#da9a4a':'#da4a4a' });
  total += gmScore;

  const cr = r.currentRatio;
  const crScore = cr === null ? 0 : cr >= 2 ? 20 : cr >= 1.5 ? 15 : cr >= 1 ? 7 : 0;
  items.push({ lbl:'النسبة الجارية (السيولة)',score:crScore, max:20, val:cr!==null?cr.toFixed(2)+'×':'—',  target:'≥ 1.5×', col:crScore>=15?'#4ada8e':crScore>=7?'#da9a4a':'#da4a4a' });
  total += crScore;

  const ic = r.intCoverage;
  const icScore = ic === null ? 0 : ic >= 5 ? 15 : ic >= 3 ? 12 : ic >= 1.5 ? 6 : ic >= 1 ? 2 : 0;
  items.push({ lbl:'تغطية الفوائد البنكية',   score:icScore, max:15, val:ic!==null?ic.toFixed(2)+'×':'—',  target:'≥ 3×',   col:icScore>=12?'#4ada8e':icScore>=6?'#da9a4a':'#da4a4a' });
  total += icScore;

  const de = r.debtEquity;
  const deScore = de === null ? 0 : de <= 1 ? 15 : de <= 2 ? 12 : de <= 4 ? 7 : de <= 8 ? 2 : 0;
  items.push({ lbl:'نسبة الدين إلى الملكية',  score:deScore, max:15, val:de!==null?de.toFixed(1)+'×':'—',  target:'≤ 2×',   col:deScore>=12?'#4ada8e':deScore>=7?'#da9a4a':'#da4a4a' });
  total += deScore;

  const roe = r.roe;
  const roeScore = roe === null ? 0 : roe >= 15 ? 10 : roe >= 8 ? 7 : roe >= 3 ? 4 : roe >= 0 ? 1 : 0;
  items.push({ lbl:'العائد على حقوق الملكية', score:roeScore, max:10, val:roe!==null?roe.toFixed(1)+'%':'—', target:'≥ 15%',  col:roeScore>=7?'#4ada8e':roeScore>=4?'#da9a4a':'#da4a4a' });
  total += roeScore;

  return { score: total, items };
}

function _cfoActions(r, c, plLen, mFilt) {
  const _mo = mFilt || State.get('monthly') || [];
  const _mDist = _mo.reduce((s, m) => s + (m.dist||0), 0);
  const _mAdm  = _mo.reduce((s, m) => s + (m.adm ||0), 0);
  const totalOpex = c.sal + c.rent + c.maint + c.sell + _mDist + _mAdm + c.fin + c.char + c.oth;
  const actions   = [];
  const add = (priority, title, body, impact) => actions.push({ priority, title, body, impact: impact || '' });

  if (r.currentRatio !== null && r.currentRatio < 1)
    add(1, 'معالجة أزمة السيولة — النسبة الجارية أقل من 1×',
      `النسبة الجارية <strong>${r.currentRatio.toFixed(2)}×</strong>: الالتزامات قصيرة الأجل (${fmt(r.currL)} ر.س) تتجاوز الأصول المتداولة (${fmt(r.currA)} ر.س). الإجراءات الفورية: (1) تسريع تحصيل المدينين (${fmt(r.ar)} ر.س) بتحفيزات الدفع المبكر، (2) التفاوض مع الموردين لتمديد مهل السداد 60-90 يوماً، (3) إعادة هيكلة جزء من الديون قصيرة الأجل.`,
      `رفع النسبة إلى > 1.2× خلال الربع القادم`);

  if (r.intCoverage !== null && r.intCoverage < 1.5)
    add(1, 'أزمة الفوائد البنكية — تلتهم الأرباح بالكامل',
      `الفوائد البنكية <strong>${fmt(c.fin)} ر.س</strong> (${c.revenue > 0 ? (c.fin/c.revenue*100).toFixed(2) + '% من الإيراد' : '—'}) مقابل صافي ربح <strong>${fmtPlNum(c.netProfit)} ر.س</strong> فقط. الإجراءات: (1) طلب إعادة تسعير التسهيلات البنكية فوراً، (2) سداد جزء من التسهيلات من تحصيلات المدينين، (3) مقارنة عروض بنوك أخرى، (4) تخفيض حجم التسهيلات غير المستخدمة.`,
      `كل تخفيض 1% في معدل الفائدة يوفر ${fmt(c.fin * 0.1)} ر.س سنوياً`);

  if (r.arDays !== null && r.arDays > 90)
    add(1, 'بطء التحصيل — المدينون يعطّلون السيولة',
      `متوسط تحصيل <strong>${r.arDays.toFixed(0)} يوم</strong> ورصيد <strong>${fmt(r.ar)} ر.س</strong>. الإجراءات: (1) حصر أكبر 10 مدينين وتعيين مسؤول تحصيل متفرغ، (2) سياسة ائتمان: لا توريد جديد لمن تجاوزت مديونيته 60 يوماً، (3) خصم 1.5% عند السداد خلال 15 يوماً، (4) نظام تذكير آلي عند اقتراب الاستحقاق.`,
      `تحرير ${fmt(r.ar * 0.3)} ر.س بتخفيض أيام التحصيل 30%`);

  if (r.netMargin !== null && r.netMargin < 1 && r.netMargin >= 0)
    add(1, 'هامش صافٍ حرج جداً — أقل من 1%',
      `هامش <strong>${r.netMargin.toFixed(2)}%</strong> يضع الشركة على حافة الخسارة. أي ارتفاع مفاجئ في التكاليف يحوّل النتيجة لخسارة. الإجراءات: (1) رفع الأسعار 2-3% على المنتجات الأساسية، (2) تجميد المصروفات التقديرية لـ 90 يوماً، (3) تحديد نقطة التعادل الشهرية ومتابعتها أسبوعياً.`,
      `رفع الهامش إلى 3% = ربح ${fmt(c.revenue * 0.03)} ر.س مقابل ${fmt(c.netProfit)} ر.س حالياً`);

  if (r.grossMargin !== null && r.grossMargin < 12)
    add(2, 'تحسين هامش الربح الإجمالي من ' + r.grossMargin.toFixed(1) + '%',
      `هامش إجمالي <strong>${r.grossMargin.toFixed(1)}%</strong> منخفض (معيار القطاع 15-20%). الإجراءات: (1) مفاوضة الموردين الكبار على خصومات 3-5%، (2) تسعير قائم على التكلفة الكاملة + هامش مستهدف لكل منتج، (3) التركيز على المنتجات ذات هامش أعلى وتقليص المنتجات الهامشية.`,
      `كل 1% زيادة في الهامش الإجمالي = ${fmt(c.revenue * 0.01)} ر.س ربح إضافي`);

  if (r.invDays !== null && r.invDays > 90)
    add(2, 'تحسين دوران المخزون — ' + r.invDays.toFixed(0) + ' يوم',
      `مخزون <strong>${fmt(r.inventory)} ر.س</strong> بمعدل دوران <strong>${r.invDays.toFixed(0)} يوم</strong>. الإجراءات: (1) تصنيف ABC: الأصناف حسب قيمة المبيعات وتركيز الجهد على A، (2) تصفية المخزون الراكد > 180 يوم بخصومات تصفية، (3) تحديد حدود أقصى/أدنى للمخزون حسب سرعة الدوران.`,
      `تحرير ${fmt(r.inventory * 0.25)} ر.س بتخفيض المخزون 25%`);

  if (r.debtEquity !== null && r.debtEquity > 5)
    add(2, 'خفض الرفع المالي — نسبة الدين/الملكية ' + r.debtEquity.toFixed(1) + '× (خطر)',
      `ديون <strong>${fmt(r.totalL)} ر.س</strong> مقابل ملكية <strong>${fmt(r.totalE)} ر.س</strong> = هشاشة مالية عالية جداً. الإجراءات: (1) خطة لسداد 20% من الديون قصيرة الأجل سنوياً، (2) احتجاز الأرباح المستقبلية لتقوية رأس المال عوض توزيعها، (3) استكشاف إمكانية ضخ رأس مال إضافي من الشركاء.`,
      `خفض النسبة من ${r.debtEquity.toFixed(1)}× إلى < 5× خلال 3 سنوات`);

  add(3, 'بناء احتياطي نقدي استراتيجي',
    `الرصيد النقدي الحالي <strong>${fmt(r.cash)} ر.س</strong>. الهدف: احتياطي يعادل 2-3 أشهر من التكاليف الثابتة = <strong>${fmt((c.sal + c.rent) / (plLen || 1) * 3)} ر.س</strong> تقريباً. خطة التنفيذ: تحويل 5% من كل تحصيل إلى حساب احتياطي منفصل.`,
    `مرونة مالية تحمي من الصدمات التشغيلية`);

  add(3, 'نظام تقارير مالية شهرية منتظمة',
    `اعتماد لوحة مؤشرات شهرية تشمل: (1) مقارنة الإيراد الفعلي مع الهدف الشهري، (2) تتبع أيام التحصيل والمخزون أسبوعياً، (3) اجتماع مالي شهري لمراجعة KPIs الرئيسية، (4) تقرير التدفق النقدي الشهري قبل اتخاذ أي قرار استثماري.`,
    `تحسين القرار المالي وتقليل المفاجآت إلى الحد الأدنى`);

  actions.sort((a, b) => a.priority - b.priority);
  return actions;
}

function renderCFOTrendChart(plMonths, plFrom, lastMo) {
  const canvas = document.getElementById('chart-cfo-trend');
  if (!canvas) return;
  const last    = plMonths.slice(-12);
  const labels  = last.map(m => m.label);
  const revData = last.map(m => +(m.revenue || 0));
  const gpData  = last.map(m => (m.revenue||0) - (m.cogs||0) - (m.otherCost||0));
  const npData  = last.map(m => {
    const gp = (m.revenue||0) - (m.cogs||0) - (m.otherCost||0);
    const op = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    return gp - op;
  });
  const bgColors = last.map(m => {
    const inRange = m.month <= (lastMo||'') && (!plFrom || m.month >= plFrom);
    return inRange ? '#3a7abf88' : '#3a7abf22';
  });
  if (_cfoTrendChart) { _cfoTrendChart.destroy(); _cfoTrendChart = null; }
  _cfoTrendChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'الإيراد',    data:revData, backgroundColor:bgColors, borderColor:'#5baef0', borderWidth:1.5, yAxisID:'y' },
        { label:'مجمل الربح', data:gpData,  type:'line', borderColor:'#4ada8e', backgroundColor:'transparent', borderWidth:2, pointRadius:3, tension:0.3, yAxisID:'y' },
        { label:'صافي الربح', data:npData,  type:'line', borderColor:'#da9a4a', backgroundColor:'transparent', borderWidth:2, pointRadius:4, borderDash:[5,3], tension:0.3, yAxisID:'y' },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#a0c4e8', font:{size:11} } } },
      scales:{
        x:{ ticks:{color:'#7090b0'}, grid:{color:'#0a1e30'} },
        y:{ ticks:{ color:'#7090b0', callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k' }, grid:{color:'#0a1e30'} },
      }
    }
  });
}

function renderCFODashboard() {
  const bs  = State.get('bs') || [];
  const pl  = State.get('pl') || [];

  const heroEl = document.getElementById('cfo-hero');
  if (!bs.length || !pl.length) {
    if (heroEl) heroEl.innerHTML = '<div style="color:#5a7a9a;padding:30px;text-align:center;grid-column:1/-1">في انتظار البيانات من ERP…</div>';
    return;
  }

  const allMths = [...new Set(pl.map(r => r.month))].sort();
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const lastMo  = bsMths[bsMths.length - 1];

  const quick  = (document.getElementById('cfo-quick-sel') || {}).value || 'ytd';
  const plFrom = _cfoGetPlFrom(quick, lastMo, allMths);

  // Period label
  const periodLblEl = document.getElementById('cfo-period-label');
  if (periodLblEl) {
    if (!plFrom) periodLblEl.textContent = 'كل الفترات';
    else if (quick === 'ytd')  periodLblEl.textContent = `${plFrom} → ${lastMo}`;
    else if (quick === 'q')    periodLblEl.textContent = `الربع الحالي: ${plFrom} → ${lastMo}`;
    else if (quick === 'h6')   periodLblEl.textContent = `آخر 6 أشهر: ${plFrom} → ${lastMo}`;
    else if (quick === 'h3')   periodLblEl.textContent = `آخر 3 أشهر: ${plFrom} → ${lastMo}`;
    else periodLblEl.textContent = `${plFrom} → ${lastMo}`;
  }

  const plFilt = pl.filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const mFilt  = (State.get('monthly') || []).filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));

  const r = computeRatios(bs, pl, lastMo, plFrom);
  if (!r) return;

  const c = aggregatePL(plFilt);

  // Prior period for Δ% comparison
  const prior   = _cfoPriorRange(plFrom, lastMo, allMths);
  const prPlFilt = prior ? pl.filter(m => m.month >= prior.from && m.month <= prior.to) : null;
  const prMFilt  = prior ? (State.get('monthly') || []).filter(m => m.month >= prior.from && m.month <= prior.to) : null;
  const cp       = prPlFilt ? aggregatePL(prPlFilt) : null;
  const rp       = prior    ? computeRatios(bs, pl, prior.to, prior.from) : null;

  const delta = (cur, prev) => {
    if (prev == null || !isFinite(prev) || prev === 0 || cur == null) return '';
    const d = cur - prev;
    const pct = (d / Math.abs(prev)) * 100;
    const col = d >= 0 ? '#4ada8e' : '#da4a4a';
    const arrow = d >= 0 ? '▲' : '▼';
    return `<span style="font-size:.68rem;color:${col};margin-right:4px">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  };

  const mSal  = mFilt.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent = mFilt.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint= mFilt.reduce((s, m) => s + (m.maint||0), 0);
  const mSell = mFilt.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist = mFilt.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm  = mFilt.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin  = mFilt.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar = mFilt.reduce((s, m) => s + (m.char ||0), 0);
  const mOth  = mFilt.reduce((s, m) => s + (m.oth  ||0), 0);
  const mTotalOpex = mSal+mRent+mMaint+mSell+mDist+mAdm+mFin+mChar+mOth;

  const totalOpex = mTotalOpex;
  const finPct    = c.revenue > 0 ? mFin / c.revenue * 100 : 0;
  const crCol     = r.currentRatio !== null ? (r.currentRatio >= 1.5 ? '#4ada8e' : r.currentRatio >= 1 ? '#da9a4a' : '#da4a4a') : '#5a7a9a';
  const nmCol     = r.netMargin    !== null ? (r.netMargin    >= 5    ? '#4ada8e' : r.netMargin    >= 1 ? '#da9a4a' : '#da4a4a') : '#5a7a9a';
  const finCol    = finPct < 1 ? '#4ada8e' : finPct < 2 ? '#da9a4a' : '#da4a4a';

  // ── Hero KPIs ──
  const nMoLabel = plFilt.length + ' شهر';
  if (heroEl) heroEl.innerHTML = [
    { lbl:'إجمالي الإيراد',           val:fmt(c.revenue)+' ر.س',                                               sub:(cp?delta(c.revenue,cp.revenue):'')+nMoLabel,                                           accent:'#5baef0' },
    { lbl:'هامش الربح الإجمالي',       val:r.grossMargin!==null?r.grossMargin.toFixed(1)+'%':'—',               sub:(rp?delta(r.grossMargin,rp.grossMargin):'')+fmt(c.grossProfit)+' ر.س',                     accent:r.grossMargin>=15?'#4ada8e':'#da9a4a' },
    { lbl:'هامش الربح الصافي',         val:r.netMargin!==null?r.netMargin.toFixed(2)+'%':'—',                   sub:(rp?delta(r.netMargin,rp.netMargin):'')+fmtPlNum(c.netProfit)+' ر.س',                       accent:nmCol },
    { lbl:'النقدية والبنوك',           val:fmt(r.cash)+' ر.س',                                                  sub:r.currA>0?(r.cash/r.currA*100).toFixed(0)+'% من المتداولة':'—',                            accent:r.cash>1000000?'#4ada8e':'#da9a4a' },
    { lbl:'النسبة الجارية',            val:r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—',             sub:(rp?delta(r.currentRatio,rp.currentRatio):'')+'المستهدف: ≥ 1.5×',                           accent:crCol },
    { lbl:'الفوائد البنكية / الإيراد', val:finPct.toFixed(2)+'%',                                               sub:(cp?delta(-(mFin/Math.max(cp.revenue,1)*100),-(mFilt.reduce((s,m)=>s+(m.fin||0),0)/Math.max(cp.revenue,1)*100)):'')+fmt(c.fin)+' ر.س', accent:finCol },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Health Score ──
  const hs       = _cfoHealthScore(r);
  const scoreCol = hs.score >= 70 ? '#4ada8e' : hs.score >= 40 ? '#da9a4a' : '#da4a4a';
  const scoreLbl = hs.score >= 70 ? 'جيد' : hs.score >= 50 ? 'متوسط' : hs.score >= 30 ? 'ضعيف' : 'حرج';
  const healthEl = document.getElementById('cfo-health');
  if (healthEl) healthEl.innerHTML = `
    <div style="text-align:center;padding:10px 0 18px">
      <div style="font-size:3rem;font-weight:700;color:${scoreCol};line-height:1">${hs.score}</div>
      <div style="font-size:.78rem;color:#7090b0;margin-top:3px">/ 100 نقطة — <strong style="color:${scoreCol}">${scoreLbl}</strong></div>
    </div>
    ${hs.items.map(it => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:#c0d0e0;font-size:.79rem">${it.lbl}</span>
          <span style="color:${it.col};font-size:.79rem;font-weight:600">${it.val}
            <span style="color:#506070;font-weight:400;font-size:.71rem">(${it.score}/${it.max})</span>
          </span>
        </div>
        <div style="height:7px;border-radius:4px;background:#06121e;overflow:hidden">
          <div style="height:100%;border-radius:4px;background:${it.col}aa;width:${it.max ? (it.score/it.max*100).toFixed(0) : 0}%"></div>
        </div>
        <div style="font-size:.68rem;color:#506070;margin-top:2px">المستهدف: ${it.target}</div>
      </div>`).join('')}`;

  // ── Trend chart ──
  renderCFOTrendChart(pl, plFrom, lastMo);

  // ── Expense Analysis ──
  // Uses monthly-state totals so dist matches Summary/Monthly/Accounts.
  // Note: in the P&L statement dist is lower because 4010301001 (نقل المشتريات)
  // is reclassified as a landed cost inside COGS.
  const expItems = [
    { lbl:'رواتب وأجور',              key:'sal',  val:mSal   },
    { lbl:'إيجار',                    key:'rent', val:mRent  },
    { lbl:'صيانة وتشغيل',            key:'maint',val:mMaint },
    { lbl:'مبيعات وتسويق',           key:'sell', val:mSell  },
    { lbl:'توزيع ونقل',              key:'dist', val:mDist  },
    { lbl:'مصروفات إدارية',          key:'adm',  val:mAdm   },
    { lbl:'فوائد بنكية ومصرفية',     key:'fin',  val:mFin   },
    { lbl:'مصروفات خيرية',           key:'char', val:mChar  },
    { lbl:'مصروفات أخرى',            key:'oth',  val:mOth   },
  ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);

  const maxExp = expItems[0] ? expItems[0].val : 1;
  const expRate = (key, revPct) => {
    if (key === 'fin')  return revPct > 2 ? {lbl:'خطر',col:'#da4a4a'} : revPct > 1 ? {lbl:'تحذير',col:'#da9a4a'} : {lbl:'مقبول',col:'#4ada8e'};
    if (key === 'sal')  return revPct > 15 ? {lbl:'مرتفع',col:'#da9a4a'} : {lbl:'طبيعي',col:'#4ada8e'};
    return revPct > 10 ? {lbl:'متابعة',col:'#da9a4a'} : {lbl:'طبيعي',col:'#4ada8e'};
  };

  const expEl = document.getElementById('cfo-expenses');
  if (expEl) expEl.innerHTML = `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.80rem">
      <thead><tr style="background:#081828">
        <th style="padding:7px 10px;text-align:right;color:#7090b0;font-weight:500">البند</th>
        <th style="padding:7px 8px;text-align:left;color:#7090b0;font-weight:500">المبلغ (ر.س)</th>
        <th style="padding:7px 8px;text-align:left;color:#7090b0;font-weight:500">% إيراد</th>
        <th style="padding:7px 8px;text-align:left;color:#7090b0;font-weight:500">% مصروفات</th>
        <th style="padding:7px 8px;color:#7090b0;font-weight:500;min-width:60px">شريط</th>
        <th style="padding:7px 8px;text-align:center;color:#7090b0;font-weight:500">تقييم</th>
      </tr></thead>
      <tbody>
        ${expItems.map(x => {
          const rp  = c.revenue > 0 ? x.val / c.revenue * 100 : 0;
          const op  = totalOpex > 0 ? x.val / totalOpex * 100 : 0;
          const w   = (x.val / maxExp * 100).toFixed(0);
          const bc  = x.key === 'fin' ? '#da4a4a' : x.key === 'sal' ? '#5baef0' : '#4a9eda';
          const rat = expRate(x.key, rp);
          const isFin = x.key === 'fin';
          return `<tr style="border-bottom:1px solid #0e2540${isFin ? ';background:#0e0808' : ''}">
            <td style="padding:7px 10px;color:${isFin?'#e08080':'#c0d0e0'}">${x.lbl}${isFin?' ⚠':''}</td>
            <td style="padding:7px 8px;text-align:left;font-variant-numeric:tabular-nums">${fmt(x.val)}</td>
            <td style="padding:7px 8px;text-align:left;color:${isFin&&rp>2?'#da4a4a':isFin&&rp>1?'#da9a4a':'#b0c8e0'}">${rp.toFixed(2)}%</td>
            <td style="padding:7px 8px;text-align:left">${op.toFixed(1)}%</td>
            <td style="padding:7px 8px">
              <div style="height:6px;border-radius:3px;background:#06121e;overflow:hidden">
                <div style="height:100%;border-radius:3px;background:${bc}aa;width:${w}%"></div>
              </div>
            </td>
            <td style="padding:7px 8px;text-align:center">
              <span style="font-size:.71rem;padding:2px 7px;border-radius:8px;background:${rat.col}22;color:${rat.col};font-weight:600">${rat.lbl}</span>
            </td>
          </tr>`;
        }).join('')}
        <tr style="border-top:2px solid #2a4a7a;background:#0a1e30">
          <td style="padding:7px 10px;color:#e0f0ff;font-weight:600">إجمالي المصروفات</td>
          <td style="padding:7px 8px;text-align:left;font-variant-numeric:tabular-nums;font-weight:600;color:#e0f0ff">${fmt(totalOpex)}</td>
          <td style="padding:7px 8px;text-align:left;font-weight:600;color:${c.revenue>0&&totalOpex/c.revenue>0.2?'#da9a4a':'#c0d0e0'}">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':'—'}</td>
          <td style="padding:7px 8px;text-align:left;color:#c0d0e0">100%</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:8px;padding:8px 12px;background:#06121e;border-radius:5px;border-right:3px solid #2a4a6a;font-size:.72rem;color:#506070;line-height:1.7">
      * المبالغ أعلاه من مصدر المصروفات التشغيلية (يتوافق مع تبويب الملخص والحسابات). في <strong style="color:#7090a0">قائمة الدخل</strong> تظهر بند التوزيع والنقل أقل بمقدار ~${fmt(mDist - c.dist)} ر.س لأن ح. <em>نقل المشتريات (4010301001)</em> يُعاد تصنيفه ضمن تكلفة البضاعة المباعة كتكاليف إيصال.
    </div></div>`;

  // ── Efficiency / Working Capital ──
  const cashRunwayMo = (totalOpex / Math.max(plFilt.length, 1));
  const cashRunway   = cashRunwayMo > 0 ? (r.cash / cashRunwayMo).toFixed(1) : null;
  const effEl = document.getElementById('cfo-efficiency');
  if (effEl) {
    const efRows = [
      { lbl:'أيام تحصيل المدينين',  val:r.arDays!==null?r.arDays.toFixed(0)+' يوم':'—',       col:r.arDays!==null?(r.arDays<60?'#4ada8e':r.arDays<90?'#da9a4a':'#da4a4a'):'#5a7a9a',     target:'< 60 يوم' },
      { lbl:'أيام دوران المخزون',   val:r.invDays!==null?r.invDays.toFixed(0)+' يوم':'—',      col:r.invDays!==null?(r.invDays<60?'#4ada8e':r.invDays<90?'#da9a4a':'#da4a4a'):'#5a7a9a',   target:'< 60 يوم' },
      { lbl:'النسبة السريعة',       val:r.quickRatio!==null?r.quickRatio.toFixed(2)+'×':'—',   col:r.quickRatio!==null?(r.quickRatio>=1?'#4ada8e':r.quickRatio>=0.7?'#da9a4a':'#da4a4a'):'#5a7a9a', target:'> 1.0×' },
      { lbl:'تغطية الفوائد',        val:r.intCoverage!==null?r.intCoverage.toFixed(2)+'×':'—', col:r.intCoverage!==null?(r.intCoverage>=3?'#4ada8e':r.intCoverage>=1.5?'#da9a4a':'#da4a4a'):'#5a7a9a', target:'> 3.0×' },
      { lbl:'العائد على الأصول',    val:r.roa!==null?r.roa.toFixed(1)+'%':'—',                 col:r.roa!==null?(r.roa>=5?'#4ada8e':r.roa>=2?'#da9a4a':'#da4a4a'):'#5a7a9a',              target:'> 5%' },
      { lbl:'العائد على الملكية',   val:r.roe!==null?r.roe.toFixed(1)+'%':'—',                 col:r.roe!==null?(r.roe>=15?'#4ada8e':r.roe>=5?'#da9a4a':'#da4a4a'):'#5a7a9a',             target:'> 15%' },
      { lbl:'مدى النقدية (أشهر)',   val:cashRunway!==null?cashRunway+' شهر':'—',              col:cashRunway!==null?(+cashRunway>=3?'#4ada8e':+cashRunway>=1?'#da9a4a':'#da4a4a'):'#5a7a9a', target:'> 3 أشهر' },
      { lbl:'رصيد المدينين',        val:fmt(r.ar)+' ر.س',                                      col:'#5baef0',                                                                             target:'' },
      { lbl:'قيمة المخزون',         val:fmt(r.inventory)+' ر.س',                               col:'#da9a4a',                                                                             target:'' },
      { lbl:'حقوق الملكية',         val:fmtPlNum(r.totalE)+' ر.س',                             col:r.totalE>=0?'#4a9eda':'#da4a4a',                                                       target:'' },
    ];
    effEl.innerHTML = efRows.map(it => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;margin-bottom:6px;background:#06121e;border-radius:6px;border-right:3px solid ${it.col}">
        <span style="color:#b0c8e0;font-size:.82rem">${it.lbl}</span>
        <div style="text-align:left">
          <div style="color:${it.col};font-weight:700;font-size:.88rem">${it.val}</div>
          ${it.target ? `<div style="color:#506070;font-size:.70rem">${it.target}</div>` : ''}
        </div>
      </div>`).join('');
  }

  // ── Action Plan ──
  const actions  = _cfoActions(r, c, plFilt.length, mFilt);
  const priColor = { 1:'#da4a4a', 2:'#da9a4a', 3:'#4a9eda' };
  const priTag   = { 1:'P1 — عاجل جداً', 2:'P2 — متابعة', 3:'P3 — تحسين' };
  const actEl    = document.getElementById('cfo-actions');
  if (actEl) actEl.innerHTML = !actions.length
    ? '<div style="padding:24px;color:#4ada8e;text-align:center">✓ لا توجد توجيهات عاجلة — الوضع المالي مقبول</div>'
    : actions.map((a, i) => `
      <div style="display:flex;gap:14px;padding:16px;border-bottom:1px solid #0e2540">
        <div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:${priColor[a.priority]}22;border:2px solid ${priColor[a.priority]};display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:${priColor[a.priority]}">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
            <strong style="color:${priColor[a.priority]};font-size:.85rem">${a.title}</strong>
            <span style="font-size:.68rem;padding:2px 8px;border-radius:8px;background:${priColor[a.priority]}22;color:${priColor[a.priority]};white-space:nowrap">${priTag[a.priority]}</span>
          </div>
          <div style="color:#9ab0c8;font-size:.81rem;line-height:1.75">${a.body}</div>
          ${a.impact ? `<div style="margin-top:7px;font-size:.75rem;color:#506070">🎯 الأثر المتوقع: <span style="color:#a0c4e8">${a.impact}</span></div>` : ''}
        </div>
      </div>`).join('');
}

// ── CFO Dashboard exports ─────────────────────────────────────────────────────
function buildCFOHTMLReport() {
  const bs  = State.get('bs') || [];
  const pl  = State.get('pl') || [];
  if (!bs.length || !pl.length) return '<p>لا توجد بيانات</p>';

  const allMths = [...new Set(pl.map(r => r.month))].sort();
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const lastMo  = bsMths[bsMths.length - 1];
  const quick   = (document.getElementById('cfo-quick-sel') || {}).value || 'ytd';
  const plFrom  = _cfoGetPlFrom(quick, lastMo, allMths);

  const plFilt = pl.filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const mFilt  = (State.get('monthly') || []).filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const c      = aggregatePL(plFilt);
  const r      = computeRatios(bs, pl, lastMo, plFrom);
  if (!r) return '<p>لا توجد بيانات كافية</p>';

  const hs = _cfoHealthScore(r);
  const scoreCol = hs.score >= 70 ? '#1a7a4a' : hs.score >= 40 ? '#a06010' : '#8a1010';
  const scoreLbl = hs.score >= 70 ? 'جيد' : hs.score >= 50 ? 'متوسط' : hs.score >= 30 ? 'ضعيف' : 'حرج';

  const periodLabel = !plFrom ? 'كل الفترات' : `${plFrom} إلى ${lastMo}`;
  const actions = _cfoActions(r, c, plFilt.length, mFilt);
  const priColor = { 1:'#c02020', 2:'#b06010', 3:'#1060a0' };
  const priTag   = { 1:'P1 — عاجل جداً', 2:'P2 — متابعة', 3:'P3 — تحسين' };

  const mSal  = mFilt.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent = mFilt.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint= mFilt.reduce((s, m) => s + (m.maint||0), 0);
  const mSell = mFilt.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist = mFilt.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm  = mFilt.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin  = mFilt.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar = mFilt.reduce((s, m) => s + (m.char ||0), 0);
  const mOth  = mFilt.reduce((s, m) => s + (m.oth  ||0), 0);
  const totalOpex = mSal+mRent+mMaint+mSell+mDist+mAdm+mFin+mChar+mOth;
  const finPct = c.revenue > 0 ? mFin / c.revenue * 100 : 0;

  const kpis = [
    { lbl:'إجمالي الإيراد',           val:fmt(c.revenue)+' ر.س' },
    { lbl:'هامش الربح الإجمالي',       val:r.grossMargin!==null?r.grossMargin.toFixed(1)+'%':'—' },
    { lbl:'هامش الربح الصافي',         val:r.netMargin!==null?r.netMargin.toFixed(2)+'%':'—' },
    { lbl:'النقدية والبنوك',           val:fmt(r.cash)+' ر.س' },
    { lbl:'النسبة الجارية',            val:r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—' },
    { lbl:'الفوائد / الإيراد',         val:finPct.toFixed(2)+'%' },
  ];

  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>لوحة المدير المالي — ${periodLabel}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin:0; padding:20px; background:#fff; color:#222; direction:rtl; }
  h1 { font-size:1.4rem; border-bottom:3px solid #1a4a8a; padding-bottom:10px; color:#1a4a8a; margin-bottom:6px; }
  .meta { font-size:.78rem; color:#666; margin-bottom:22px; }
  .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:22px; }
  .kpi { background:#f0f4fa; border-radius:8px; padding:12px 16px; border-right:4px solid #1a4a8a; }
  .kpi .lbl { font-size:.74rem; color:#557; margin-bottom:4px; }
  .kpi .val { font-size:1.15rem; font-weight:700; color:#1a4a8a; }
  .section { margin-bottom:22px; }
  .section h2 { font-size:1rem; color:#2a5a9a; border-bottom:1px solid #cde; padding-bottom:5px; margin-bottom:10px; }
  .health-score { text-align:center; font-size:2.2rem; font-weight:700; color:${scoreCol}; padding:10px 0; }
  .health-sub { text-align:center; font-size:.82rem; color:#557; margin-bottom:14px; }
  .health-bar-row { margin-bottom:9px; }
  .health-bar-label { display:flex; justify-content:space-between; font-size:.78rem; margin-bottom:3px; }
  .bar-bg { height:8px; border-radius:4px; background:#e0e8f0; overflow:hidden; }
  .bar-fill { height:100%; border-radius:4px; }
  table { width:100%; border-collapse:collapse; font-size:.80rem; }
  th { background:#1a4a8a; color:#fff; padding:8px 10px; text-align:right; }
  td { padding:7px 10px; border-bottom:1px solid #dde; }
  tr:hover td { background:#f5f8ff; }
  .action { display:flex; gap:12px; padding:12px; border-bottom:1px solid #dde; }
  .action .num { flex-shrink:0; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.78rem; }
  .action .body { flex:1; }
  .action .title { font-weight:700; font-size:.85rem; margin-bottom:5px; }
  .action .detail { font-size:.80rem; color:#445; line-height:1.7; }
  .action .impact { font-size:.74rem; color:#778; margin-top:5px; }
  @media print { body { padding:10px; } }
</style></head><body>
<h1>🏆 لوحة المدير المالي التنفيذية</h1>
<div class="meta">الفترة: ${periodLabel} &nbsp;|&nbsp; تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>

<div class="kpis">${kpis.map(k=>`<div class="kpi"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join('')}</div>

<div class="section">
  <h2>🏥 درجة الصحة المالية</h2>
  <div class="health-score">${hs.score} / 100</div>
  <div class="health-sub">${scoreLbl}</div>
  ${hs.items.map(it=>`<div class="health-bar-row">
    <div class="health-bar-label"><span>${it.lbl}</span><span style="color:${it.col}">${it.val} (${it.score}/${it.max}) — المستهدف: ${it.target}</span></div>
    <div class="bar-bg"><div class="bar-fill" style="width:${it.max?(it.score/it.max*100).toFixed(0):0}%;background:${it.col}"></div></div>
  </div>`).join('')}
</div>

<div class="section">
  <h2>📊 هيكل المصروفات</h2>
  <table>
    <thead><tr><th>البند</th><th style="text-align:left">المبلغ (ر.س)</th><th style="text-align:left">% الإيراد</th><th style="text-align:left">% المصروفات</th></tr></thead>
    <tbody>
      ${[{lbl:'رواتب وأجور',val:mSal},{lbl:'إيجار',val:mRent},{lbl:'صيانة وتشغيل',val:mMaint},{lbl:'مبيعات وتسويق',val:mSell},{lbl:'توزيع ونقل',val:mDist},{lbl:'مصروفات إدارية',val:mAdm},{lbl:'فوائد بنكية',val:mFin},{lbl:'مصروفات خيرية',val:mChar},{lbl:'مصروفات أخرى',val:mOth}].filter(x=>x.val>0).sort((a,b)=>b.val-a.val).map(x=>`<tr><td>${x.lbl}</td><td style="text-align:left">${fmt(x.val)}</td><td style="text-align:left">${c.revenue>0?(x.val/c.revenue*100).toFixed(2)+'%':'—'}</td><td style="text-align:left">${totalOpex>0?(x.val/totalOpex*100).toFixed(1)+'%':'—'}</td></tr>`).join('')}
      <tr style="font-weight:700;background:#e8eef8"><td>الإجمالي</td><td style="text-align:left">${fmt(totalOpex)}</td><td style="text-align:left">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':'—'}</td><td style="text-align:left">100%</td></tr>
    </tbody>
  </table>
</div>

<div class="section">
  <h2>🎯 خطة العمل التنفيذية</h2>
  ${!actions.length?'<p style="color:#2a7a4a">✓ لا توجد توجيهات عاجلة — الوضع المالي مقبول</p>':actions.map((a,i)=>`<div class="action">
    <div class="num" style="background:${priColor[a.priority]}22;color:${priColor[a.priority]};border:2px solid ${priColor[a.priority]}">${i+1}</div>
    <div class="body">
      <div class="title" style="color:${priColor[a.priority]}">${a.title} <span style="font-size:.72rem;padding:2px 7px;border-radius:8px;background:${priColor[a.priority]}22">${priTag[a.priority]}</span></div>
      <div class="detail">${a.body}</div>
      ${a.impact?`<div class="impact">🎯 الأثر المتوقع: ${a.impact}</div>`:''}
    </div>
  </div>`).join('')}
</div>
</body></html>`;
}

function exportCFOHTML() {
  const bs = State.get('bs') || [];
  if (!bs.length) { alert('لا توجد بيانات'); return; }
  const html = buildCFOHTMLReport();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const lastMo = [...new Set(bs.map(r => r.month))].sort().pop() || 'report';
  a.download = `cfo-dashboard-${lastMo}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function printCFOPDF() {
  const bs = State.get('bs') || [];
  if (!bs.length) { alert('لا توجد بيانات'); return; }
  const html = buildCFOHTMLReport();
  const w = window.open('', '_blank', 'width=1000,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportCFOExcel() {
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }
  const bs  = State.get('bs') || [];
  const pl  = State.get('pl') || [];
  if (!bs.length || !pl.length) { alert('لا توجد بيانات'); return; }

  const allMths = [...new Set(pl.map(r => r.month))].sort();
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const lastMo  = bsMths[bsMths.length - 1];
  const quick   = (document.getElementById('cfo-quick-sel') || {}).value || 'ytd';
  const plFrom  = _cfoGetPlFrom(quick, lastMo, allMths);
  const plFilt  = pl.filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const mFilt   = (State.get('monthly') || []).filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const c       = aggregatePL(plFilt);
  const r       = computeRatios(bs, pl, lastMo, plFrom);
  if (!r) { alert('لا توجد بيانات كافية'); return; }

  const hs = _cfoHealthScore(r);
  const actions = _cfoActions(r, c, plFilt.length, mFilt);
  const periodLabel = !plFrom ? 'كل الفترات' : `${plFrom} — ${lastMo}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft Expenses Dashboard';

  const hdr = (ws, cols) => {
    const row = ws.addRow(cols.map(c => c.header));
    row.eachCell(cell => {
      cell.fill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A4A8A' } };
      cell.font   = { bold:true, color:{ argb:'FFFFFFFF' }, size:10 };
      cell.border = { bottom:{ style:'thin', color:{ argb:'FF9BB8E0' } } };
      cell.alignment = { horizontal:'center' };
    });
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 18; });
  };

  // Sheet 1: لوحة CFO
  const ws1 = wb.addWorksheet('لوحة CFO');
  ws1.views = [{ rightToLeft: true }];
  ws1.addRow([`لوحة المدير المالي — ${periodLabel}`]).getCell(1).font = { bold:true, size:13, color:{ argb:'FF1A4A8A' } };
  ws1.addRow([]);
  ws1.addRow(['مؤشرات الأداء الرئيسية']).getCell(1).font = { bold:true, size:11 };
  hdr(ws1, [{ header:'المؤشر', width:30 }, { header:'القيمة', width:20 }]);
  const kpiRows = [
    ['إجمالي الإيراد', fmt(c.revenue)+' ر.س'],
    ['مجمل الربح', fmt(c.grossProfit)+' ر.س'],
    ['صافي الربح', fmtPlNum(c.netProfit)+' ر.س'],
    ['هامش الربح الإجمالي', r.grossMargin!==null?r.grossMargin.toFixed(1)+'%':'—'],
    ['هامش الربح الصافي', r.netMargin!==null?r.netMargin.toFixed(2)+'%':'—'],
    ['النسبة الجارية', r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—'],
    ['النسبة السريعة', r.quickRatio!==null?r.quickRatio.toFixed(2)+'×':'—'],
    ['تغطية الفوائد', r.intCoverage!==null?r.intCoverage.toFixed(2)+'×':'—'],
    ['نسبة الدين/الملكية', r.debtEquity!==null?r.debtEquity.toFixed(1)+'×':'—'],
    ['العائد على الأصول', r.roa!==null?r.roa.toFixed(1)+'%':'—'],
    ['العائد على الملكية', r.roe!==null?r.roe.toFixed(1)+'%':'—'],
    ['النقدية والبنوك', fmt(r.cash)+' ر.س'],
    ['رصيد المدينين', fmt(r.ar)+' ر.س'],
    ['أيام التحصيل', r.arDays!==null?r.arDays.toFixed(0)+' يوم':'—'],
    ['قيمة المخزون', fmt(r.inventory)+' ر.س'],
    ['أيام دوران المخزون', r.invDays!==null?r.invDays.toFixed(0)+' يوم':'—'],
  ];
  kpiRows.forEach(row => ws1.addRow(row));
  ws1.addRow([]);
  ws1.addRow(['درجة الصحة المالية', hs.score + ' / 100']).getCell(1).font = { bold:true };
  hs.items.forEach(it => ws1.addRow([it.lbl, `${it.val} (${it.score}/${it.max}) — المستهدف: ${it.target}`]));

  // Sheet 2: خطة العمل
  const ws2 = wb.addWorksheet('خطة العمل');
  ws2.views = [{ rightToLeft: true }];
  ws2.addRow([`خطة العمل التنفيذية — ${periodLabel}`]).getCell(1).font = { bold:true, size:13, color:{ argb:'FF1A4A8A' } };
  ws2.addRow([]);
  hdr(ws2, [{ header:'#', width:5 }, { header:'الأولوية', width:18 }, { header:'العنوان', width:40 }, { header:'الإجراءات', width:60 }, { header:'الأثر المتوقع', width:40 }]);
  const priTag = { 1:'P1 — عاجل جداً', 2:'P2 — متابعة', 3:'P3 — تحسين' };
  actions.forEach((a, i) => {
    const row = ws2.addRow([i+1, priTag[a.priority], a.title, a.body.replace(/<[^>]*>/g,''), a.impact]);
    row.getCell(4).alignment = { wrapText:true };
    row.getCell(5).alignment = { wrapText:true };
  });

  // Sheet 3: الاتجاه الشهري
  const ws3 = wb.addWorksheet('الاتجاه الشهري');
  ws3.views = [{ rightToLeft: true }];
  ws3.addRow([`الأداء الشهري — ${periodLabel}`]).getCell(1).font = { bold:true, size:13, color:{ argb:'FF1A4A8A' } };
  ws3.addRow([]);
  hdr(ws3, [
    { header:'الشهر', width:14 }, { header:'الإيراد', width:16 }, { header:'مجمل الربح', width:16 },
    { header:'ه. إجمالي%', width:13 }, { header:'صافي الربح', width:16 }, { header:'ه. صافي%', width:13 },
    { header:'إجمالي المصروفات', width:20 },
  ]);
  plFilt.forEach(m => {
    const gp = (m.revenue||0) - (m.cogs||0) - (m.otherCost||0);
    const op = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    const np = gp - op;
    const gmPct = m.revenue > 0 ? (gp / m.revenue * 100).toFixed(1) : '—';
    const nmPct = m.revenue > 0 ? (np / m.revenue * 100).toFixed(2) : '—';
    ws3.addRow([m.label||m.month, +m.revenue||0, gp, gmPct, np, nmPct, op]);
  });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cfo-dashboard-${lastMo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Consolidated Dashboard (أبعاد + وسام) ────────────────────────────────────
const CONS_DBS = ['MekSoftDb1', 'MekSoftDb2'];

function _bsTotals(bsRows, month) {
  const latest  = month ? bsRows.filter(r => r.month === month) : [];
  const c3      = r => r.code3 || r.grpCode.slice(0, 3);
  const A       = latest.filter(r => r.grpCode.startsWith('1')).reduce((s, r) => s + r.balance, 0);
  const CA      = latest.filter(r => c3(r) === '103').reduce((s, r) => s + r.balance, 0);
  const NCA     = A - CA;
  const Inv     = latest.filter(r => r.grpCode === '10302').reduce((s, r) => s + r.balance, 0);
  const L       = latest.filter(r => r.grpCode.startsWith('2')).reduce((s, r) => s - r.balance, 0);
  const CL      = latest.filter(r => c3(r) === '201').reduce((s, r) => s - r.balance, 0);
  const NCL     = L - CL;
  const E_hist  = latest.filter(r => r.grpCode.startsWith('3')).reduce((s, r) => s - r.balance, 0);
  return { A, CA, NCA, Inv, L, CL, NCL, E: A - L, E_hist };
}

function renderConsolidatedTab() {
  const heroEl   = document.getElementById('cons-hero');
  const badgesEl = document.getElementById('cons-badges');
  const data     = State.get('consolidated');

  if (!data) {
    if (heroEl) heroEl.innerHTML = '<div style="color:#5a7a9a;padding:36px;text-align:center;grid-column:1/-1">جارٍ تحميل البيانات المجمعة…</div>';
    API.fetchConsolidated(CONS_DBS).then(result => {
      if (result) {
        State.set('consolidated', result);
        const active = document.querySelector('.tab.active');
        if (active && active.dataset.tab === 'consolidated') renderConsolidatedTab();
      } else {
        if (heroEl) heroEl.innerHTML = '<div style="color:#da4a4a;padding:36px;text-align:center;grid-column:1/-1">فشل تحميل البيانات — تحقق من الاتصال</div>';
      }
    });
    return;
  }

  const { companies, pl, bs, byDb } = data;

  // ── Unified period filter ─────────────────────────────────────────────────
  const allMths = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel = document.getElementById('cons-period-from');
  const toSel   = document.getElementById('cons-period-to');
  if (fromSel && allMths.length) {
    const cur  = State.get('consFrom');
    const keep = (cur && allMths.includes(cur)) ? cur : allMths[0];
    fromSel.innerHTML = allMths.map(m => `<option value="${m}"${m===keep?' selected':''}>${m}</option>`).join('');
  }
  if (toSel && allMths.length) {
    const cur  = State.get('consTo');
    const keep = (cur && allMths.includes(cur)) ? cur : allMths[allMths.length-1];
    toSel.innerHTML = allMths.map(m => `<option value="${m}"${m===keep?' selected':''}>${m}</option>`).join('');
  }
  const selFrom = (fromSel?.value && allMths.includes(fromSel.value)) ? fromSel.value : (allMths[0] || null);
  const selTo   = (toSel?.value   && allMths.includes(toSel.value))   ? toSel.value   : (allMths[allMths.length-1] || null);
  const inRange = m => (!selFrom || m >= selFrom) && (!selTo || m <= selTo);

  // Update P&L range label
  const plRangeLabel = document.getElementById('cons-pl-range-label');
  if (plRangeLabel && selFrom && selTo) plRangeLabel.textContent = `${selFrom} — ${selTo}`;

  // Company badges
  const elim = data.elimination || { applied: false };

  if (badgesEl) {
    const elimBadge = elim.applied
      ? `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:.75rem;font-weight:600;background:#0d2a10;border:1px solid #1a5a20;color:#4ada8e;margin-left:8px">✓ تم استبعاد المعاملات البينية</span>`
      : `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:.75rem;font-weight:600;background:#2a1a0a;border:1px solid #5a3a10;color:#da9a4a;margin-left:8px">⚠ بدون استبعاد بيني</span>`;
    badgesEl.innerHTML =
      companies.map(c => `<span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:.78rem;font-weight:600;background:#0a2848;border:1px solid #1e5080;color:#7ac8f0;margin-left:8px">${c.name || c.db}</span>`).join('') +
      elimBadge +
      `<span style="color:#5a7a9a;font-size:.73rem;margin-right:4px">— منذ ${pl[0]?.month || ''}</span>`;
  }

  // Aggregates — filtered by selected P&L period
  const plFilt = pl.filter(r => inRange(r.month));
  const c      = aggregatePL(plFilt);
  const perDb  = byDb.map(d => ({ ...d, agg: aggregatePL(d.pl.filter(r => inRange(r.month))) }));


  // BS period: use the "to" month from the unified filter
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const selBsMo = (selTo && bsMths.includes(selTo)) ? selTo : (bsMths[bsMths.length-1] || null);
  const bsAsofLabel = document.getElementById('cons-bs-asof-label');
  if (bsAsofLabel) bsAsofLabel.textContent = selBsMo ? `كما في ${selBsMo}` : '';
  const { A: totalA, CA: totalCA, NCA: totalNCA, Inv: totalInv,
          L: totalL, CL: totalCL, NCL: totalNCL,
          E: totalE, E_hist: totalE_hist } = _bsTotals(bs, selBsMo);

  const grossMargin = c.revenue > 0 ? c.grossProfit / c.revenue * 100 : null;
  const netMargin   = c.revenue > 0 ? c.netProfit   / c.revenue * 100 : null;
  const nmCol       = netMargin === null ? '#5a7a9a' : netMargin >= 5 ? '#4ada8e' : netMargin >= 1 ? '#da9a4a' : '#da4a4a';
  const gmCol       = grossMargin === null ? '#5a7a9a' : grossMargin >= 15 ? '#4ada8e' : '#da9a4a';

  // ── Hero KPIs ──
  if (heroEl) heroEl.innerHTML = [
    { lbl:'إجمالي الإيراد (مجمع)',      val:fmt(c.revenue)+' ر.س',                                          sub:(selFrom&&selTo&&selFrom!==selTo)?selFrom+' — '+selTo:selFrom||selTo||'',accent:'#5baef0' },
    { lbl:'هامش الربح الإجمالي',        val:grossMargin!==null?grossMargin.toFixed(1)+'%':'—',              sub:fmtPlNum(c.grossProfit)+' ر.س',                           accent:gmCol },
    { lbl:'صافي الربح',                 val:netMargin!==null?netMargin.toFixed(2)+'%':'—',                  sub:fmtPlNum(c.netProfit)+' ر.س',                             accent:nmCol },
    { lbl:'إجمالي الأصول (مجمع)',       val:fmt(totalA)+' ر.س',                                             sub:'كما في '+selBsMo,                                       accent:'#4a9eda' },
    { lbl:'إجمالي الالتزامات',          val:fmt(totalL)+' ر.س',                                             sub:totalA>0?(totalL/totalA*100).toFixed(1)+'% من الأصول':'—',accent:'#da9a4a' },
    { lbl:'حقوق الملكية (مجمع)',        val:fmtPlNum(totalE)+' ر.س',                                        sub:'',                                                        accent:totalE>=0?'#4ada8e':'#da4a4a' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Elimination Disclosure Card ──
  const elimEl = document.getElementById('cons-elim');
  if (elimEl) {
    if (elim.applied) {
      elimEl.innerHTML = `
        <div style="background:#061a08;border:1px solid #1a4a20;border-radius:10px;padding:16px 20px;margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
            <span style="color:#4ada8e;font-size:.88rem;font-weight:600">✓ استبعاد المعاملات البينية — الأرقام أعلاه بعد الاستبعاد</span>
            <span style="color:#3a7a40;font-size:.73rem">( وفق معايير التوحيد المحاسبي )</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
            ${[
              { lbl:'إيرادات بينية مُستبعَدة',   val:fmt(elim.totalRevenue)+' ر.س', note:'من الإيراد المجمع',   col:'#da9a4a' },
              { lbl:'تكلفة بينية مُستبعَدة',      val:fmt(elim.totalCOGS)+' ر.س',   note:'من COGS المجمع',      col:'#da9a4a' },
              { lbl:'ربح بيني غير محقق',          val:fmt(elim.grossProfit)+' ر.س', note:'صافي الاستبعاد',      col:elim.grossProfit>0?'#da4a4a':'#4ada8e' },
              { lbl:'ذمم بينية مُستبعَدة (AR)',    val:fmt(elim.latestARElim)+' ر.س',note:'مدينون بيني من الأصول',col:'#da9a4a' },
              { lbl:'ذمم بينية مُستبعَدة (AP)',    val:fmt(elim.latestAPElim)+' ر.س',note:'دائنون بيني من الخصوم',col:'#da9a4a' },
              { lbl:'فارق التسوية البيني الصافي', val:fmt(elim.netGap||0)+' ر.س',  note:'صافي AR − AP بين الشركتين', col:(elim.netGap||0)<1000?'#4ada8e':'#da9a4a' },
            ].map(x => `
              <div style="background:#081e0a;border-radius:6px;padding:10px 14px;border-right:3px solid ${x.col}">
                <div style="font-size:.72rem;color:#6a9a70;margin-bottom:3px">${x.lbl}</div>
                <div style="font-size:.92rem;font-weight:700;color:${x.col};font-variant-numeric:tabular-nums">${x.val}</div>
                <div style="font-size:.68rem;color:#3a6040;margin-top:2px">${x.note}</div>
              </div>`).join('')}
          </div>
          <div style="margin-top:10px;font-size:.70rem;color:#3a6040;line-height:1.7">
            * المعاملات البينية: مبيعات أبعاد لوسام + مبيعات وسام لأبعاد — تم استبعادها من الإيراد وتكلفة البضاعة.
            أرصدة الذمم البينية (عميل + مورد لكل طرف) استُبعدت من المركز المالي. فارق التسوية الصافي = الفرق بين صافي مركز كل شركة تجاه الأخرى.
          </div>
        </div>`;
    } else {
      elimEl.innerHTML = `<div style="background:#1a0e04;border:1px solid #4a3010;border-radius:8px;padding:12px 16px;margin-bottom:18px;color:#da9a4a;font-size:.80rem">
        ⚠ لم يتم استبعاد المعاملات البينية — الأرقام تشمل مبيعات/مشتريات بين الشركتين
      </div>`;
    }
  }

  // ── P&L Comparison ──
  const plEl = document.getElementById('cons-pl');
  if (plEl) {
    const shortName = s => (s || '').replace('مؤسسة ','').replace('مصنع ','');
    const PL_ROWS = [
      { lbl:'الإيراد',                       key:'revenue',    type:'rev' },
      { lbl:'(-) تكلفة البضاعة المباعة',    key:'cogs',       type:'cost' },
      { lbl:'مجمل الربح',                    key:'grossProfit',type:'subtotal' },
      { lbl:null },
      { lbl:'رواتب وأجور',                   key:'sal',        type:'opex', indent:true },
      { lbl:'إيجار',                         key:'rent',       type:'opex', indent:true },
      { lbl:'صيانة وتشغيل',                 key:'maint',      type:'opex', indent:true },
      { lbl:'مبيعات وتسويق',                key:'sell',       type:'opex', indent:true },
      { lbl:'توزيع ونقل',                   key:'dist',       type:'opex', indent:true },
      { lbl:'مصروفات إدارية',               key:'adm',        type:'opex', indent:true },
      { lbl:'فوائد بنكية',                  key:'fin',        type:'opex', indent:true },
      { lbl:'مصروفات خيرية',               key:'char',       type:'opex', indent:true },
      { lbl:'مصروفات أخرى',                key:'oth',        type:'opex', indent:true },
      { lbl:'(-) إجمالي المصروفات التشغيلية', key:'totalOpex', type:'subtotal' },
      { lbl:'صافي الربح',                   key:'netProfit',  type:'total' },
    ];
    const gv = (agg, key) => {
      if (!key) return 0;
      if (key === 'cogs') return agg.totalCost;
      if (key in agg) return agg[key];
      return 0;
    };
    const fv = (v, type) => {
      if (v === 0) return '<span style="color:#3a5a7a">—</span>';
      if (type === 'cost' || type === 'opex') return `(${fmt(v)})`;
      if (type === 'subtotal' || type === 'total') return `<strong>${fmtPlNum(v)}</strong>`;
      return fmt(v);
    };
    const colOf = (v, type) => type === 'total' ? (v >= 0 ? '#4ada8e' : '#da4a4a') : type === 'subtotal' ? '#c8e0f0' : '#b0c8e0';
    const cols  = perDb.length + 1;

    plEl.innerHTML = `<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr>
        <th style="text-align:right;padding:8px 10px;color:#7090b0;font-weight:500;border-bottom:1px solid #1e3a5f;background:#081828">البند</th>
        ${perDb.map(d => `<th style="text-align:left;padding:8px 10px;color:#7ac8f0;font-variant-numeric:tabular-nums;border-bottom:1px solid #1e3a5f;background:#081828;white-space:nowrap">${shortName(d.name)}</th>`).join('')}
        <th style="text-align:left;padding:8px 10px;color:#5baef0;font-weight:700;border-bottom:1px solid #1e3a5f;background:#081828;white-space:nowrap">المجمع</th>
      </tr></thead>
      <tbody>
        ${PL_ROWS.map(row => {
          if (!row.lbl) return `<tr><td colspan="${cols+1}" style="padding:3px 10px;color:#3a5a7a;font-size:.68rem;border-bottom:1px solid #0e2540">المصروفات التشغيلية</td></tr>`;
          const conVal  = gv(c, row.key);
          const rowBg   = row.type === 'subtotal' ? 'background:#081828' : row.type === 'total' ? 'background:#0a1e34;border-top:2px solid #2a5080' : '';
          const tdStyle = `padding:7px 10px;border-bottom:1px solid #0e2540;${rowBg}`;
          return `<tr>
            <td style="${tdStyle};color:#8ab0cc;${row.indent?'padding-right:22px':''}">${row.lbl}</td>
            ${perDb.map(d => {
              const v = gv(d.agg, row.key);
              return `<td style="${tdStyle};text-align:left;font-variant-numeric:tabular-nums;color:${colOf(v,row.type)}">${fv(v, row.type)}</td>`;
            }).join('')}
            <td style="${tdStyle};text-align:left;font-variant-numeric:tabular-nums;color:${colOf(conVal,row.type)}">${fv(conVal, row.type)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  // ── P&L NP from monitoring-start up to selBsMo (for BS equity reconciliation) ──
  // getBSMonthly has NO date filter (cumulative from inception), while getPLMonthly starts
  // from DATA_START_DATE. We split derivedNP into "prior period" + "current monitoring NP"
  // so the BS equity section shows a figure that matches the P&L.
  const plUpToSelBsMo  = pl.filter(r => !selBsMo || r.month <= selBsMo);
  const cUpTo          = aggregatePL(plUpToSelBsMo);
  const monitoringNP   = cUpTo.netProfit;
  const firstPLMonth   = plUpToSelBsMo.length ? plUpToSelBsMo[0].month : null;

  // ── Consolidated Balance Sheet ──
  const bsEl = document.getElementById('cons-bs');
  if (bsEl) {
    if (!selBsMo) {
      bsEl.innerHTML = '<div style="color:#5a7a9a;padding:20px;text-align:center">لا توجد بيانات مركز مالي</div>';
    } else {
      const bsLatest = bs.filter(r => r.month === selBsMo);
      const c3 = r => r.code3 || r.grpCode.slice(0, 3);
      const srt = arr => arr.sort((a, b) => a.grpCode.localeCompare(b.grpCode));

      // Classify assets
      const curAssets    = srt(bsLatest.filter(r => c3(r) === '103' && r.balance !== 0));
      const nonCurAssets = srt(bsLatest.filter(r => r.grpCode.startsWith('1') && c3(r) !== '103' && r.balance !== 0));
      // Classify liabilities
      const curLiab      = srt(bsLatest.filter(r => c3(r) === '201' && r.balance !== 0));
      const nonCurLiab   = srt(bsLatest.filter(r => r.grpCode.startsWith('2') && c3(r) !== '201' && r.balance !== 0));
      // Equity
      const equity       = srt(bsLatest.filter(r => r.grpCode.startsWith('3') && r.balance !== 0));

      const derivedNP = totalE - totalE_hist;
      const priorNP   = derivedNP - monitoringNP;
      const npCol     = monitoringNP >= 0 ? '#4ada8e' : '#da4a4a';
      const wcCol     = (totalCA - totalCL) >= 0 ? '#4ada8e' : '#da4a4a';
      const crVal     = totalCL > 0 ? totalCA / totalCL : null;
      const qrVal     = totalCL > 0 ? (totalCA - totalInv) / totalCL : null;
      const icNetGap  = elim.applied ? (elim.netGap || 0) : 0;
      const showICGap = elim.applied && icNetGap > 100;

      // ── helper renderers ──
      const bsRow  = (r, sign) => `
        <tr>
          <td style="padding:5px 10px 5px 26px;color:#8ab0cc;font-size:.77rem;border-bottom:1px solid #081e34">${r.grpName||r.grpCode}</td>
          <td style="text-align:left;font-variant-numeric:tabular-nums;font-size:.77rem;padding:5px 10px;border-bottom:1px solid #081e34;color:#b0c8e0">${fmt(Math.abs(r.balance * sign))} ر.س</td>
        </tr>`;
      const catHdr = lbl => `
        <tr style="background:#071420">
          <td colspan="2" style="padding:8px 12px 4px;color:#4a8ab0;font-size:.72rem;font-weight:700;letter-spacing:.03em;border-bottom:1px solid #0e2540">▸ ${lbl}</td>
        </tr>`;
      const secHdr = lbl => `
        <tr style="background:#040e1a">
          <td colspan="2" style="padding:10px 12px 5px;color:#7ac8f0;font-size:.74rem;font-weight:700;border-top:2px solid #1e3a5f;border-bottom:1px solid #1e3a5f;text-transform:uppercase;letter-spacing:.05em">${lbl}</td>
        </tr>`;
      const subTot = (lbl, v, col = '#c8e0f0', indent = true) => `
        <tr style="background:#081828">
          <td style="padding:7px 10px${indent?' 7px 20px':''};font-weight:600;color:${col};border-top:1px solid #1a3a5a;font-size:.78rem">${lbl}</td>
          <td style="text-align:left;font-variant-numeric:tabular-nums;font-weight:600;color:${col};padding:7px 10px;border-top:1px solid #1a3a5a;font-size:.78rem">${fmtPlNum(v)} ر.س</td>
        </tr>`;
      const grandTot = (lbl, v) => `
        <tr style="background:#0a1e34;border-top:2px solid #3a6a9a">
          <td style="padding:9px 12px;font-weight:700;color:#e0f0ff;font-size:.82rem">${lbl}</td>
          <td style="text-align:left;font-variant-numeric:tabular-nums;font-weight:700;color:#e0f0ff;padding:9px 12px;font-size:.82rem">${fmt(v)} ر.س</td>
        </tr>`;

      // ── KPI strip: liquidity ──
      const kpiStrip = [
        { lbl:'رأس المال العامل', val: fmtPlNum(totalCA - totalCL) + ' ر.س', col: wcCol },
        { lbl:'نسبة التداول',     val: crVal !== null ? crVal.toFixed(2) + '×' : '—',
          col: crVal === null ? '#5a7a9a' : crVal >= 2 ? '#4ada8e' : crVal >= 1 ? '#da9a4a' : '#da4a4a' },
        { lbl:'النسبة السريعة',   val: qrVal !== null ? qrVal.toFixed(2) + '×' : '—',
          col: qrVal === null ? '#5a7a9a' : qrVal >= 1 ? '#4ada8e' : qrVal >= 0.7 ? '#da9a4a' : '#da4a4a' },
        { lbl:'الأصول المتداولة', val: fmt(totalCA)  + ' ر.س', col: '#5baef0' },
        { lbl:'الخصوم المتداولة', val: fmt(totalCL)  + ' ر.س', col: '#da9a4a' },
        { lbl:'أصول ثابتة',      val: fmt(totalNCA) + ' ر.س', col: '#7090b0' },
      ].map(k => `
        <div style="background:#071420;border-radius:7px;padding:9px 12px;border-right:3px solid ${k.col};flex:1;min-width:130px">
          <div style="font-size:.68rem;color:#5a7a9a;margin-bottom:3px">${k.lbl}</div>
          <div style="font-size:.88rem;font-weight:700;color:${k.col};font-variant-numeric:tabular-nums">${k.val}</div>
        </div>`).join('');

      const _bsDiff   = Math.abs(totalA - (totalL + totalE));
      const _bsBalanced = _bsDiff < 1;
      const _icGapPct = elim.applied && totalA > 0 ? (elim.netGap || 0) / totalA * 100 : 0;
      const _icGapNote = elim.applied ? ` &nbsp;|&nbsp; فارق التسوية البيني: ${fmt(elim.netGap||0)} ر.س (${_icGapPct.toFixed(2)}%)` : '';
      const bsFooterNote = '<div style="margin-top:6px;font-size:.68rem;color:' + (_bsBalanced ? '#3a5a7a' : '#7a2a2a') + ';line-height:1.6">'
        + (_bsBalanced ? '✓ المعادلة المحاسبية متوازنة (إجمالي الأصول = إجمالي الخصوم + حقوق الملكية)' : ('⚠ فرق في الميزانية: ' + fmtPlNum(totalA - totalL - totalE) + ' ر.س'))
        + ' &nbsp;|&nbsp; نسبة التداول المستهدفة ≥ 2× &nbsp;|&nbsp; النسبة السريعة المستهدفة ≥ 1×'
        + _icGapNote + '</div>';

      bsEl.innerHTML = `
        <div style="font-size:.72rem;color:#5a7a9a;margin-bottom:10px">كما في ${selBsMo} — وفق المعايير السعودية للمنشآت الصغيرة والمتوسطة</div>
        ${showICGap ? `<div style="background:#1e1004;border:1px solid #5a3010;border-radius:7px;padding:9px 14px;margin-bottom:10px;font-size:.75rem;color:#da9a4a">
          ⚠ فارق تسوية بيني: <strong>${fmt(icNetGap)} ر.س</strong> — فروق توقيت تسجيل بين الشركتين تتطلب تسوية.
        </div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${kpiStrip}</div>
        <div class="tbl-wrap"><table style="width:100%;border-collapse:collapse">
          <tbody>

            ${secHdr('الأصول — Assets')}

            ${catHdr('الأصول المتداولة')}
            ${curAssets.map(r => bsRow(r, 1)).join('')}
            ${subTot('إجمالي الأصول المتداولة', totalCA, '#5baef0')}

            ${catHdr('الأصول غير المتداولة (الأصول الثابتة)')}
            ${nonCurAssets.map(r => bsRow(r, 1)).join('')}
            ${subTot('إجمالي الأصول غير المتداولة', totalNCA, '#7090b0')}

            ${grandTot('إجمالي الأصول', totalA)}

            ${secHdr('الخصوم وحقوق الملكية — Liabilities & Equity')}

            ${catHdr('الخصوم المتداولة')}
            ${curLiab.map(r => bsRow(r, -1)).join('')}
            ${subTot('إجمالي الخصوم المتداولة', totalCL, '#da9a4a')}

            ${nonCurLiab.length ? catHdr('الخصوم غير المتداولة') : ''}
            ${nonCurLiab.map(r => bsRow(r, -1)).join('')}
            ${nonCurLiab.length ? subTot('إجمالي الخصوم غير المتداولة', totalNCL, '#da7a4a') : ''}

            ${subTot('إجمالي الخصوم', totalL, '#c8d8e0', false)}

            ${catHdr('حقوق الملكية')}
            ${equity.map(r => bsRow(r, -1)).join('')}
            ${Math.abs(priorNP) > 100 ? `<tr><td style="padding:5px 10px 5px 26px;color:${priorNP>=0?'#7ac8a0':'#da8a8a'};font-size:.77rem;border-bottom:1px solid #081e34">أرباح مرحلة من فترات سابقة</td><td style="text-align:left;font-variant-numeric:tabular-nums;font-size:.77rem;padding:5px 10px;border-bottom:1px solid #081e34;color:${priorNP>=0?'#7ac8a0':'#da8a8a'}">${fmtPlNum(priorNP)} ر.س</td></tr>` : ''}
            <tr><td style="padding:5px 10px 5px 26px;color:${npCol};font-size:.77rem;border-bottom:1px solid #081e34">صافي ربح الفترة الجارية${firstPLMonth ? ` (${firstPLMonth} — ${selBsMo})` : ''}</td><td style="text-align:left;font-variant-numeric:tabular-nums;font-size:.77rem;padding:5px 10px;border-bottom:1px solid #081e34;color:${npCol}">${fmtPlNum(monitoringNP)} ر.س</td></tr>
            ${subTot('إجمالي حقوق الملكية', totalE, totalE >= 0 ? '#4ada8e' : '#da4a4a', false)}

            ${grandTot('إجمالي الخصوم وحقوق الملكية', totalA)}

          </tbody>
        </table></div>
        ${bsFooterNote}`;
    }
  }

  // ── Per-company ratios comparison ──
  const ratiosEl = document.getElementById('cons-ratios');
  if (ratiosEl) {
    const perDbBS = byDb.map(d => _bsTotals(d.bs, selBsMo));
    const METRICS = [
      { lbl:'إجمالي الإيراد',              fn:(a,_) => fmt(a.revenue)+' ر.س',                             fmtC:(a,b)=>fmt(a.revenue)+' ر.س' },
      { lbl:'هامش الربح الإجمالي',         fn:(a,_) => a.revenue?(a.grossProfit/a.revenue*100).toFixed(1)+'%':'—', col:(a,_)=>a.revenue>0?( a.grossProfit/a.revenue>=0.15?'#4ada8e':'#da9a4a'):'#7090b0' },
      { lbl:'هامش الربح الصافي',           fn:(a,_) => a.revenue?(a.netProfit/a.revenue*100).toFixed(2)+'%':'—', col:(a,_)=>a.revenue>0?(a.netProfit/a.revenue>=0.05?'#4ada8e':a.netProfit>=0?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'نسبة تكلفة البضاعة/الإيراد',  fn:(a,_) => a.revenue?(a.totalCost/a.revenue*100).toFixed(1)+'%':'—' },
      { lbl:'إجمالي المصروفات التشغيلية',  fn:(a,_) => fmt(a.totalOpex)+' ر.س' },
      { lbl:'نسبة المصروفات/الإيراد',      fn:(a,_) => a.revenue?(a.totalOpex/a.revenue*100).toFixed(1)+'%':'—', col:(a,_)=>a.revenue>0?(a.totalOpex/a.revenue<0.2?'#4ada8e':a.totalOpex/a.revenue<0.3?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'إجمالي الأصول',               fn:(_,b) => fmt(b.A)+' ر.س' },
      { lbl:'أصول متداولة',                fn:(_,b) => fmt(b.CA)+' ر.س', col:(_,b)=>'#5baef0' },
      { lbl:'أصول ثابتة',                  fn:(_,b) => fmt(b.NCA)+' ر.س', col:(_,b)=>'#7090b0' },
      { lbl:'إجمالي الالتزامات',           fn:(_,b) => fmt(b.L)+' ر.س' },
      { lbl:'خصوم متداولة',                fn:(_,b) => fmt(b.CL)+' ر.س', col:(_,b)=>'#da9a4a' },
      { lbl:'خصوم غير متداولة',            fn:(_,b) => fmt(b.NCL)+' ر.س', col:(_,b)=>'#da7a4a' },
      { lbl:'حقوق الملكية',                fn:(_,b) => fmtPlNum(b.E)+' ر.س', col:(_,b)=>b.E>=0?'#4ada8e':'#da4a4a' },
      { lbl:'رأس المال العامل',            fn:(_,b) => fmtPlNum(b.CA-b.CL)+' ر.س', col:(_,b)=>(b.CA-b.CL)>=0?'#4ada8e':'#da4a4a' },
      { lbl:'نسبة التداول',                fn:(_,b) => b.CL>0?(b.CA/b.CL).toFixed(2)+'×':'—', col:(_,b)=>b.CL>0?(b.CA/b.CL>=2?'#4ada8e':b.CA/b.CL>=1?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'النسبة السريعة',              fn:(_,b) => b.CL>0?((b.CA-b.Inv)/b.CL).toFixed(2)+'×':'—', col:(_,b)=>b.CL>0?((b.CA-b.Inv)/b.CL>=1?'#4ada8e':(b.CA-b.Inv)/b.CL>=0.7?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'نسبة الدين/الأصول',           fn:(_,b) => b.A>0?(b.L/b.A*100).toFixed(1)+'%':'—', col:(_,b)=>b.A>0?(b.L/b.A<0.5?'#4ada8e':b.L/b.A<0.7?'#da9a4a':'#da4a4a'):'#7090b0' },
    ];
    const consBs = { A:totalA, L:totalL, E:totalE };
    ratiosEl.innerHTML = `<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:.81rem">
      <thead><tr>
        <th style="text-align:right;padding:9px 12px;color:#7090b0;font-weight:500;border-bottom:1px solid #1e3a5f;background:#081828">المؤشر</th>
        ${perDb.map(d => `<th style="text-align:left;padding:9px 12px;color:#7ac8f0;font-variant-numeric:tabular-nums;border-bottom:1px solid #1e3a5f;background:#081828;white-space:nowrap">${(d.name||d.db).replace('مؤسسة ','').replace('مصنع ','')}</th>`).join('')}
        <th style="text-align:left;padding:9px 12px;color:#5baef0;font-weight:700;border-bottom:1px solid #1e3a5f;background:#081828">المجمع</th>
      </tr></thead>
      <tbody>
        ${METRICS.map(m => {
          const tdBase = 'padding:8px 12px;border-bottom:1px solid #0e2540;font-variant-numeric:tabular-nums';
          return `<tr>
            <td style="${tdBase};color:#8ab0cc">${m.lbl}</td>
            ${perDb.map((d,i) => {
              const col = m.col ? m.col(d.agg, perDbBS[i], i) : '#b0c8e0';
              return `<td style="${tdBase};text-align:left;color:${col}">${m.fn(d.agg, perDbBS[i], i)}</td>`;
            }).join('')}
            <td style="${tdBase};text-align:left;font-weight:600;color:${m.col?m.col(c,consBs,undefined):'#c8e0f0'}">${m.fn(c, consBs, undefined)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }
}

// ── Consolidated Cash Flow tab ────────────────────────────────────────────────

// Returns previous comparable period rows: same number of months shifted back
function getConsCFComparablePrev(selFrom, selTo, allCF) {
  if (!selFrom || !selTo) return [];
  const months = allCF.map(m => m.month).sort();
  const fromIdx = months.indexOf(selFrom);
  const toIdx   = months.indexOf(selTo);
  if (fromIdx < 0 || toIdx < 0 || fromIdx > toIdx) return [];
  const span       = toIdx - fromIdx + 1;
  const cmpFromIdx = fromIdx - span;
  const cmpToIdx   = fromIdx - 1;
  if (cmpFromIdx < 0) return [];
  const cmpFrom = months[cmpFromIdx];
  const cmpTo   = months[cmpToIdx];
  return allCF.filter(m => m.month >= cmpFrom && m.month <= cmpTo);
}

function renderConsCF() {
  const heroEl = document.getElementById('cons-cf-hero');
  const data   = State.get('consolidated');

  if (!data) {
    if (heroEl) heroEl.innerHTML = '<div style="color:#5a7a9a;padding:36px;text-align:center;grid-column:1/-1">جارٍ تحميل البيانات المجمعة…</div>';
    API.fetchConsolidated(CONS_DBS).then(result => {
      if (result) {
        State.set('consolidated', result);
        const active = document.querySelector('.tab.active');
        if (active && active.dataset.tab === 'cons-cf') renderConsCF();
      } else {
        if (heroEl) heroEl.innerHTML = '<div style="color:#da4a4a;padding:36px;text-align:center;grid-column:1/-1">فشل تحميل البيانات — تحقق من الاتصال</div>';
      }
    });
    return;
  }

  const { pl, bs, bankFacilities = [], companies = [] } = data;

  // ── Company badges ──
  const badgesEl = document.getElementById('cons-cf-badges');
  if (badgesEl) {
    badgesEl.innerHTML = companies
      .map(c => `<span style="background:#0a2848;border:1px solid #1e5080;border-radius:20px;padding:3px 12px;font-size:.76rem;color:#7ac8f0">${(c.name||c.db).replace('مؤسسة ','').replace('مصنع ','')}</span>`)
      .join('');
  }

  // ── Period selectors (from/to by month) ──
  const bsMonths  = [...new Set(bs.map(r => r.month))].sort();
  const fromSel   = document.getElementById('cons-cf-from');
  const toSel     = document.getElementById('cons-cf-to');

  if (fromSel && bsMonths.length) {
    const saved = State.get('consCfFrom');
    const cur   = (saved && bsMonths.includes(saved)) ? saved : bsMonths[0];
    fromSel.innerHTML = bsMonths.map(m => `<option value="${m}"${m===cur?' selected':''}>${m}</option>`).join('');
    if (!saved) State.set('consCfFrom', cur);
  }
  if (toSel && bsMonths.length) {
    const saved = State.get('consCfTo');
    const cur   = (saved && bsMonths.includes(saved)) ? saved : bsMonths[bsMonths.length - 1];
    toSel.innerHTML = bsMonths.map(m => `<option value="${m}"${m===cur?' selected':''}>${m}</option>`).join('');
    if (!saved) State.set('consCfTo', cur);
  }

  const selFrom  = (fromSel && fromSel.value) || bsMonths[0] || '';
  const selTo    = (toSel   && toSel.value)   || bsMonths[bsMonths.length - 1] || '';
  const cmpMode  = (document.getElementById('cons-cf-cmp-sel') || {}).value || 'prev';

  // ── Compute CF ──
  const allCF    = cfMonthly(bs, pl, bankFacilities);
  const filtered = allCF.filter(m => m.month >= selFrom && m.month <= selTo);
  if (!filtered.length) return;
  const c = aggregateCF(filtered);
  if (!c) return;

  const filteredCmp = cmpMode === 'prev' ? getConsCFComparablePrev(selFrom, selTo, allCF) : [];
  const cPrev  = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;

  const periodLabel = selFrom === selTo
    ? (allCF.find(m => m.month === selFrom) || {}).label || selFrom
    : `${selFrom} — ${selTo}`;
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';

  // ── KPIs ──
  const kpiDelta = (cur, prev) => {
    if (!hasCmp || !prev || Math.abs(prev) < 1) return '';
    const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
    const col = +pct >= 0 ? '#4ada8e' : '#da4a4a';
    const arr = +pct >= 0 ? '▲' : '▼';
    return `<div style="font-size:.7rem;color:${col};margin-top:2px">${arr} ${Math.abs(+pct)}%</div>
            <div style="font-size:.7rem;color:#3a5a7a;margin-top:1px">مقابل: ${fmtPlNum(prev)}</div>`;
  };
  if (heroEl) heroEl.innerHTML = [
    { lbl:'التدفقات التشغيلية',       cur:c.operatingCF,   prev:cPrev?.operatingCF,   accent:c.operatingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'التدفقات الاستثمارية',     cur:c.investingCF,   prev:cPrev?.investingCF,   accent:c.investingCF  >=0?'#4ada8e':'#da9a4a' },
    { lbl:'التدفقات التمويلية',       cur:c.financingCF,   prev:cPrev?.financingCF,   accent:c.financingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'صافي التغيير في النقدية',  cur:c.netCashChange, prev:cPrev?.netCashChange, accent:c.netCashChange>=0?'#5baef0':'#da4a4a' },
    { lbl:'رصيد النقدية الافتتاحي',   cur:c.openingCash,   prev:null,                 accent:'#7090b0' },
    { lbl:'رصيد النقدية الختامي',     cur:c.closingCash,   prev:cPrev?.closingCash,   accent:'#5baef0' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}">
    <div class="lbl">${k.lbl}</div>
    <div class="val">${fmtPlNum(k.cur)} ر.س</div>
    ${kpiDelta(k.cur, k.prev)}
  </div>`).join('');

  // ── Flow bars ──
  const cfFlowEl = document.getElementById('cons-cf-flow-bars');
  if (cfFlowEl) {
    const vals  = [c.operatingCF, c.investingCF, c.financingCF, c.netCashChange];
    const pvals = hasCmp ? [cPrev.operatingCF, cPrev.investingCF, cPrev.financingCF, cPrev.netCashChange] : [];
    const maxAbs = Math.max(...vals.map(Math.abs), ...pvals.map(Math.abs), 1);
    const flowBar = (lbl, val, col, prevVal) => {
      const w  = Math.min(100, Math.abs(val)    / maxAbs * 100).toFixed(1);
      const wp = hasCmp ? Math.min(100, Math.abs(prevVal) / maxAbs * 100).toFixed(1) : 0;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:#c0d0e0;font-size:.82rem">${lbl}</span>
          <span style="color:${col};font-size:.82rem;font-weight:600">${fmtPlNum(val)} ر.س${hasCmp ? `<span style="color:#3a5a7a;font-size:.72rem;margin-right:8px"> / ${fmtPlNum(prevVal)}</span>` : ''}</span>
        </div>
        <div style="height:9px;border-radius:5px;background:#061420;position:relative;overflow:hidden">
          ${hasCmp ? `<div style="position:absolute;top:0;height:100%;border-radius:5px;width:${wp}%;background:${col}33;border-left:1px solid ${col}55"></div>` : ''}
          <div style="position:absolute;top:0;height:100%;border-radius:5px;width:${w}%;background:${col}99;transition:width .4s"></div>
        </div>
      </div>`;
    };
    cfFlowEl.innerHTML =
      flowBar('التدفقات التشغيلية',      c.operatingCF,  c.operatingCF >=0?'#4ada8e':'#da4a4a', cPrev?.operatingCF)  +
      flowBar('التدفقات الاستثمارية',    c.investingCF,  c.investingCF >=0?'#4ada8e':'#da9a4a', cPrev?.investingCF)  +
      flowBar('التدفقات التمويلية',      c.financingCF,  c.financingCF >=0?'#4ada8e':'#da4a4a', cPrev?.financingCF)  +
      flowBar('صافي التغيير في النقدية', c.netCashChange,c.netCashChange>=0?'#5baef0':'#da4a4a', cPrev?.netCashChange);
  }

  // ── CF Statement (SOCPA/IFRS for SMEs Section 7 format) ──
  const stmtEl = document.getElementById('cons-cf-stmt');
  if (stmtEl) stmtEl.innerHTML = renderCFStatement(c, cPrev, hasCmp, periodLabel, cmpLabel);

  // ── Trend chart ──
  destroyChart('cons-cf');
  const ctx = document.getElementById('chart-cons-cf');
  if (ctx && allCF.length) {
    charts['cons-cf'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: allCF.map(m => m.label),
        datasets: [
          { label:'تشغيلية',   data: allCF.map(m => m.operatingCF),  backgroundColor:'#4ada8e99', borderColor:'#4ada8e', borderWidth:1 },
          { label:'استثمارية', data: allCF.map(m => m.investingCF),  backgroundColor:'#da9a4a99', borderColor:'#da9a4a', borderWidth:1 },
          { label:'تمويلية',   data: allCF.map(m => m.financingCF),  backgroundColor:'#5baef099', borderColor:'#5baef0', borderWidth:1 },
        ],
      },
      options: {
        ...CHART_OPTS,
        plugins: {
          legend: { labels: { color:'#8ba0b8', font:{ size:10 }, boxWidth:12 } },
          tooltip: { callbacks: { label: tooltipLabel } },
        },
        scales: {
          x: { ...AXIS_STYLE },
          y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
        },
      },
    });
  }

  // ── Monthly breakdown table (7 columns) ──
  const moEl = document.getElementById('cons-cf-monthly');
  if (moEl) moEl.innerHTML = allCF.map(m => {
    const opCls  = m.operatingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const invCls = m.investingCF  >= 0 ? 'color:#4ada8e' : 'color:#da9a4a';
    const finCls = m.financingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const netCls = m.netCashChange >= 0 ? 'color:#5baef0' : 'color:#da4a4a';
    const inRange = m.month >= selFrom && m.month <= selTo;
    return `<tr class="${inRange ? 'cf-mo-active' : ''}">
      <td${inRange ? ' style="color:#7ac8f0;font-weight:600"' : ''}>${m.label}</td>
      <td class="num" style="${opCls}">${fmtPlNum(m.operatingCF)}</td>
      <td class="num" style="${invCls}">${fmtPlNum(m.investingCF)}</td>
      <td class="num" style="${finCls}">${fmtPlNum(m.financingCF)}</td>
      <td class="num" style="${netCls}">${fmtPlNum(m.netCashChange)}</td>
      <td class="num" style="color:#5a7a9a">${fmt(m.openingCash)}</td>
      <td class="num">${fmt(m.closingCash)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';

  // ── Expert financial analysis ──
  _renderConsCFAnalysis(c, filtered, allCF);
}

async function exportConsCFExcel() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const { pl, bs, bankFacilities = [], companies = [] } = data;
  const bsMonths = [...new Set(bs.map(r => r.month))].sort();
  const fromSel  = document.getElementById('cons-cf-from');
  const toSel    = document.getElementById('cons-cf-to');
  const cmpMode  = (document.getElementById('cons-cf-cmp-sel') || {}).value || 'prev';
  const selFrom  = (fromSel && fromSel.value) || bsMonths[0] || '';
  const selTo    = (toSel   && toSel.value)   || bsMonths[bsMonths.length - 1] || '';

  const allCF    = cfMonthly(bs, pl, bankFacilities);
  const filtered = allCF.filter(m => m.month >= selFrom && m.month <= selTo);
  if (!filtered.length) { alert('لا توجد بيانات للفترة المحددة'); return; }
  const c = aggregateCF(filtered);
  if (!c) return;

  const filteredCmp = cmpMode === 'prev' ? getConsCFComparablePrev(selFrom, selTo, allCF) : [];
  const cPrev  = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;

  const periodLabel = selFrom === selTo
    ? (allCF.find(m => m.month === selFrom) || {}).label || selFrom
    : `${selFrom} — ${selTo}`;
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';
  const companyName = companies.map(c => (c.name||c.db).replace('مؤسسة ','').replace('مصنع ','')).join(' + ') || 'المجموعة المجمعة';

  const FONT   = 'Calibri';
  const NC     = hasCmp ? 3 : 2;
  const numFmt = '#,##0;[Red](#,##0);"-"';
  const CLR = {
    navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
    bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
    textLight:'FF6A8AAA', textGray:'FF888888',
    greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
  };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: Statement ────────────────────────────────────────────────────
  const ws = wb.addWorksheet('التدفقات النقدية المجمعة', { views:[{ rightToLeft:true }] });
  ws.pageSetup.paperSize=9; ws.pageSetup.orientation='portrait';
  ws.pageSetup.fitToPage=true; ws.pageSetup.fitToWidth=1;
  ws.pageSetup.margins={left:0.6,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws.columns=[{width:50},{width:20},...(hasCmp?[{width:20}]:[])];

  const spanRow = row => ws.mergeCells(row.number,1,row.number,NC);
  const addTitle = (text,sz,fc,bg) => {
    const row=ws.addRow([text]); row.height=sz>12?32:22; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'};
  };
  const addSpacer = (h=5) => {
    const row=ws.addRow(['']); row.height=h; spanRow(row);
    row.getCell(1).fill=solid(CLR.white);
  };
  const setNum = (cell,v,fc,bold) => {
    cell.value=(v!==null&&v!==undefined)?+v.toFixed(0):null;
    cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
    cell.font={name:FONT,size:9.5,color:{argb:fc||CLR.textNavy},bold:bold||false};
  };
  const addSecRow = text => {
    const row=ws.addRow([text]); row.height=20; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
    c.fill=solid(CLR.navy); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addSubHdrRow = text => {
    const row=ws.addRow([text]); row.height=15; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:8.5,italic:true,color:{argb:CLR.textLight}};
    c.fill=solid('FFF4F7FB'); c.alignment={horizontal:'right',vertical:'middle',indent:2};
  };
  const addItemRow = (label,cur,cmp,indent=true) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=17;
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,color:{argb:CLR.textDark}};
    c1.alignment={horizontal:'right',vertical:'middle',indent:indent?2:1};
    c1.border={bottom:bdr('hair','FFE8ECF0')};
    setNum(row.getCell(2),cur,CLR.textNavy,false);
    row.getCell(2).border={bottom:bdr('hair','FFE8ECF0')};
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      row.getCell(3).border={bottom:bdr('hair','FFE8ECF0')};
      row.getCell(3).fill=solid('FFF8FAFE');
    }
  };
  const addSubTotRow = (label,cur,cmp) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=18;
    const tb={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.textNavy}};
    c1.fill=solid(CLR.bluePale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=tb;
    setNum(row.getCell(2),cur,CLR.textNavy,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.bluePale),border:tb});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      Object.assign(row.getCell(3),{fill:solid('FFF0F4FA'),border:tb});
    }
  };
  const addTotalRow = (label,cur,cmp,fc) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=20;
    const bord={top:bdr('medium',CLR.navy),bottom:bdr('medium',CLR.navy)};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.navyDark}};
    c1.fill=solid(CLR.blueXPale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=bord;
    setNum(row.getCell(2),cur,fc||CLR.navyDark,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.blueXPale),border:bord});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textBlue,true);
      Object.assign(row.getCell(3),{fill:solid('FFD5E0F0'),border:bord});
    }
  };

  const genDate = new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'});
  addTitle('المجموعة المجمعة — ' + companyName, 14, CLR.white, CLR.navyDark);
  addTitle('قائمة التدفقات النقدية المجمعة (الطريقة غير المباشرة)', 12, CLR.white, CLR.navy);
  addTitle(`الفترة: ${periodLabel}${hasCmp ? `  |  للمقارنة: ${cmpLabel}` : ''}  |  بعد الاستبعاد البيني`, 9.5, 'FFAACCE8', CLR.navyDark);
  addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
  addSpacer(4);
  {
    const row=ws.addRow(['البيان',periodLabel,...(hasCmp?[cmpLabel]:[])]);
    row.height=22;
    row.eachCell({includeEmpty:true},(cell,ci)=>{
      cell.font={name:FONT,size:10,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
  }
  addSpacer(3);
  addSecRow('أولاً: التدفقات النقدية من الأنشطة التشغيلية');
  addItemRow('صافي الربح (الخسارة) للفترة',             c.netIncome,      cPrev?.netIncome,      false);
  addSubHdrRow('تعديلات في رأس المال العامل:');
  addItemRow('(الزيادة)/نقص في المخزون',                c.δInventory,     cPrev?.δInventory);
  addItemRow('(الزيادة)/نقص في الذمم المدينة التجارية', c.δAR,            cPrev?.δAR);
  addItemRow('(الزيادة)/نقص في ذمم الموظفين والسلف',    c.δEmpRec,        cPrev?.δEmpRec);
  addItemRow('(الزيادة)/نقص في أرصدة مدينة أخرى',        c.δOtherCA,       cPrev?.δOtherCA);
  addItemRow('زيادة/(نقص) في الذمم الدائنة التجارية',    c.δAP,            cPrev?.δAP);
  addItemRow('زيادة/(نقص) في أرصدة دائنة أخرى',          c.δOtherPay,      cPrev?.δOtherPay);
  addItemRow('زيادة/(نقص) في المصروفات المستحقة',         c.δAccrued,       cPrev?.δAccrued);
  addSubTotRow('صافي التدفقات النقدية من الأنشطة التشغيلية', c.operatingCF, cPrev?.operatingCF);

  addSpacer(3);
  addSecRow('ثانياً: التدفقات النقدية من أنشطة الاستثمار');
  addItemRow('(الزيادة)/النقص في الأصول الثابتة (صافي)',  c.δFixedAssets,   cPrev?.δFixedAssets);
  addItemRow('(الزيادة)/النقص في المشاريع قيد التنفيذ',    c.δProjects,      cPrev?.δProjects);
  addSubTotRow('صافي التدفقات النقدية من أنشطة الاستثمار', c.investingCF, cPrev?.investingCF);

  addSpacer(3);
  addSecRow('ثالثاً: التدفقات النقدية من أنشطة التمويل');
  addItemRow('زيادة/(نقص) في التسهيلات البنكية',          c.δBankFacilities,cPrev?.δBankFacilities);
  addItemRow('زيادة/(نقص) في القروض طويلة الأجل',         c.δLTLoans,       cPrev?.δLTLoans);
  addItemRow('زيادة/(نقص) في رأس المال المدفوع',          c.δCapital,       cPrev?.δCapital);
  addItemRow('زيادة/(نقص) في حساب الشركاء',               c.δPartners,      cPrev?.δPartners);
  addSubTotRow('صافي التدفقات النقدية من أنشطة التمويل', c.financingCF, cPrev?.financingCF);

  addSpacer(3);
  addTotalRow('صافي الزيادة (النقص) في النقدية وما يعادلها', c.netCashChange, cPrev?.netCashChange, 'FF1A5A9A');
  addItemRow('رصيد النقدية وما يعادلها في بداية الفترة', c.openingCash, cPrev?.openingCash, false);
  addTotalRow('رصيد النقدية وما يعادلها في نهاية الفترة', c.closingCash, cPrev?.closingCash, 'FF0A2040');
  addSpacer(3);
  {
    const balanced = Math.abs(c.openingCash + c.netCashChange - c.closingCash) < 1;
    const note = balanced
      ? `✓ الميزانية متوازنة: ${Math.round(c.openingCash).toLocaleString('ar-SA')} + ${Math.round(c.netCashChange).toLocaleString('ar-SA')} = ${Math.round(c.closingCash).toLocaleString('ar-SA')}`
      : `⚠ فرق في التسوية: ${(c.openingCash + c.netCashChange - c.closingCash).toFixed(2)}`;
    const row=ws.addRow([note]); row.height=17; spanRow(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:8.5,bold:balanced,color:{argb:balanced?CLR.greenText:'FFCC4444'}};
    cell.fill=solid(balanced?CLR.greenBg:'FFFFF4F4');
    cell.alignment={horizontal:'center',vertical:'middle'};
    cell.border={top:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),bottom:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),
                 left:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),right:bdr('thin',balanced?CLR.greenBdr:'FFCC8888')};
  }

  // ── Sheet 2: Monthly breakdown ────────────────────────────────────────────
  const ws2 = wb.addWorksheet('التطور الشهري المجمع', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='landscape';
  ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.columns=[{width:16},{width:17},{width:17},{width:17},{width:17},{width:17},{width:17}];
  {
    const hr=ws2.addRow(['الشهر','تشغيلية','استثمارية','تمويلية','صافي التغيير','رصيد الافتتاح','رصيد الاختتام']);
    hr.height=20;
    hr.eachCell((cell,ci)=>{
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
    const inRange = new Set(filtered.map(m => m.month));
    allCF.forEach(m => {
      const isActive = inRange.has(m.month);
      const row=ws2.addRow([m.label,m.operatingCF,m.investingCF,m.financingCF,m.netCashChange,m.openingCash,m.closingCash]);
      row.height=16;
      row.getCell(1).font={name:FONT,size:9,color:{argb:isActive?'FFC8E8FF':CLR.textGray}};
      row.getCell(1).alignment={horizontal:'right',vertical:'middle'};
      if(isActive) row.getCell(1).fill=solid('FF07182A');
      for(let ci=2;ci<=7;ci++){
        const cell=row.getCell(ci);
        const v=cell.value||0;
        cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
        cell.font={name:FONT,size:9,color:{argb:
          ci>=6 ? CLR.textNavy : v<0 ? 'FFDA4A4A' : ci===5 ? 'FF5BAEF0' : 'FF4ADA8E'}};
        if(isActive) cell.fill=solid('FF07182A');
        cell.border={bottom:bdr('hair','FF0E2540')};
      }
    });
    const tr=ws2.addRow(['إجمالي الفترة المحددة',c.operatingCF,c.investingCF,c.financingCF,c.netCashChange,c.openingCash,c.closingCash]);
    tr.height=20;
    const totBrd={top:bdr('double',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)};
    tr.eachCell({includeEmpty:true},cell=>{cell.fill=solid(CLR.blueXPale);cell.border=totBrd;});
    tr.getCell(1).font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    tr.getCell(1).alignment={horizontal:'right',vertical:'middle'};
    for(let ci=2;ci<=7;ci++){
      const cell=tr.getCell(ci);
      cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `تدفقات_نقدية_مجمعة_${selFrom}_${selTo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function _renderConsCFAnalysis(c, filtered, allCF) {
  const el = document.getElementById('cons-cf-analysis');
  if (!el) return;

  const nMonths        = filtered.length;
  const positiveMonths = filtered.filter(m => m.operatingCF > 0).length;
  const negativeMonths = nMonths - positiveMonths;
  const eqRatio        = (c.netIncome !== 0) ? c.operatingCF / c.netIncome : null;

  // ── Earnings quality ──
  let eqLabel, eqColor, eqText;
  if (eqRatio === null) {
    eqLabel = 'غير محدد'; eqColor = '#7090b0';
    eqText  = 'لا يمكن حساب نسبة جودة الأرباح عند غياب صافي الربح أو الخسارة الصافية.';
  } else if (eqRatio >= 1.5) {
    eqLabel = 'ممتاز ★'; eqColor = '#4ada8e';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× تعكس أن التدفق النقدي التشغيلي يتجاوز الأرباح المحاسبية — علامة على أرباح نقدية حقيقية وتحصيل قوي من العملاء.`;
  } else if (eqRatio >= 1.0) {
    eqLabel = 'جيد'; eqColor = '#4ada8e';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× تدل على تحصيل صحي للإيرادات وتدفقات تشغيلية موثوقة.`;
  } else if (eqRatio >= 0) {
    eqLabel = 'مقبول'; eqColor = '#da9a4a';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× تعني أن جزءاً من الأرباح لم يتحول بعد إلى نقدية. يُوصى بمتابعة دورة التحصيل.`;
  } else {
    eqLabel = 'ضعيف ⚠'; eqColor = '#da4a4a';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× سالبة — التدفق التشغيلي سالب رغم ${c.netIncome >= 0 ? 'الربحية المحاسبية' : 'الخسارة'}. يستوجب مراجعة عاجلة لرأس المال العامل وسياسة التحصيل.`;
  }

  // ── Consistency ──
  const consistencyColor = negativeMonths === 0 ? '#4ada8e' : positiveMonths > negativeMonths ? '#da9a4a' : '#da4a4a';
  const consistencyText  = negativeMonths === 0
    ? `جميع الأشهر الـ${nMonths} سجّلت تدفقات تشغيلية موجبة — استقرار تشغيلي واضح.`
    : positiveMonths > negativeMonths
      ? `${positiveMonths} من ${nMonths} أشهر موجبة. الأشهر الـ${negativeMonths} السالبة تستحق المراجعة.`
      : `تحذير: ${negativeMonths} من ${nMonths} أشهر سجّلت تدفقاً تشغيلياً سالباً — يستوجب مراجعة عاجلة للعمليات.`;

  // ── Investing ──
  const investText = c.investingCF < 0
    ? `سالبة بـ ${fmt(Math.abs(c.investingCF))} ر.س — المجموعة تستثمر في توسعة أصولها. مؤشر إيجابي للنمو إذا تمت تغطيته من التدفق التشغيلي.`
    : c.investingCF > 0
      ? `موجبة بـ ${fmt(c.investingCF)} ر.س — تشير إلى استرداد أصول أو تقليص استثمارات. يُوصى بالتحقق من أسباب البيع.`
      : 'معدومة — لا حركة في الأصول الثابتة خلال الفترة.';

  // ── Financing ──
  const finText = c.financingCF > 0
    ? `موجبة بـ ${fmt(c.financingCF)} ر.س — المجموعة تعتمد على التمويل الخارجي (تسهيلات، قروض، ضخ رأس مال). ينبغي موازنة تكلفة التمويل مع العائد على الأصول.`
    : c.financingCF < 0
      ? `سالبة بـ ${fmt(Math.abs(c.financingCF))} ر.س — المجموعة تسدد ديونها وتعزز استقلاليتها المالية. مؤشر إيجابي للاستدامة طويلة الأجل.`
      : 'لا توجد أنشطة تمويلية خلال الفترة.';

  // ── Cash position ──
  const cashChange = c.closingCash - c.openingCash;
  const cashText   = cashChange > 0
    ? `تحسّن الرصيد النقدي بـ ${fmt(cashChange)} ر.س ليصل إلى ${fmt(c.closingCash)} ر.س.`
    : cashChange < 0
      ? `انخفض الرصيد النقدي بـ ${fmt(Math.abs(cashChange))} ر.س إلى ${fmt(c.closingCash)} ر.س — يستوجب مراقبة السيولة.`
      : `استقر الرصيد النقدي عند ${fmt(c.closingCash)} ر.س.`;

  // ── Recommendations ──
  const recs = [];
  if (c.operatingCF < 0)                                          recs.push('⚠️ مراجعة دورة التحصيل من العملاء وتسريع قبض الذمم المدينة.');
  if (c.δInventory < -50000)                                      recs.push('📦 مراجعة مستويات المخزون — تراكمه يستنزف النقدية التشغيلية.');
  if (c.δAR < -50000)                                             recs.push('📋 تفعيل متابعة الذمم المدينة — الزيادة فيها تضغط على التدفق النقدي.');
  if (c.financingCF > 0 && c.financingCF > c.operatingCF)        recs.push('🏦 الاعتماد على التمويل الخارجي يفوق التوليد الداخلي — تحسين الكفاءة التشغيلية أولوية.');
  if (c.investingCF < 0 && c.operatingCF < 0)                    recs.push('🔍 استثمار في الأصول مع تدفق تشغيلي سالب — مراجعة جدولة المشتريات الرأسمالية.');
  if (c.closingCash < c.openingCash * 0.5 && c.openingCash > 0)  recs.push('🚨 تراجع كبير في النقدية — وضع خطة لإعادة بناء الاحتياطي النقدي.');
  if (recs.length === 0) recs.push('✅ الوضع النقدي المجمع سليم — استمر في مراقبة نسبة جودة الأرباح والحفاظ على رصيد نقدي صحي.');
  if (nMonths >= 3 && eqRatio !== null && eqRatio >= 1.0 && c.operatingCF > 0)
    recs.push('💡 التدفق التشغيلي الموجب يمنحك فرصة لتسريع سداد الديون أو توزيع أرباح إذا سمح الوضع التشغيلي.');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:14px">
        <div style="color:#7090b0;font-size:.73rem;font-weight:600;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px">جودة الأرباح — OCF / NI</div>
        <div style="font-size:1.5rem;font-weight:700;color:${eqColor};margin-bottom:5px">
          ${eqRatio !== null ? eqRatio.toFixed(2)+'×' : '—'}
          <span style="font-size:.82rem;font-weight:500;margin-right:6px;color:${eqColor}">${eqLabel}</span>
        </div>
        <div style="color:#8aa0b8;font-size:.78rem;line-height:1.7">${eqText}</div>
      </div>
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:14px">
        <div style="color:#7090b0;font-size:.73rem;font-weight:600;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px">استقرار التدفق التشغيلي</div>
        <div style="font-size:1.5rem;font-weight:700;color:${consistencyColor};margin-bottom:5px">
          ${positiveMonths}<span style="font-size:.9rem;color:#7090b0"> / ${nMonths} شهراً</span>
        </div>
        <div style="color:#8aa0b8;font-size:.78rem;line-height:1.7">${consistencyText}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:12px">
        <div style="color:#da9a4a;font-size:.72rem;font-weight:600;margin-bottom:6px">📈 الأنشطة الاستثمارية</div>
        <div style="color:#8aa0b8;font-size:.77rem;line-height:1.7">${investText}</div>
      </div>
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:12px">
        <div style="color:#7ac8f0;font-size:.72rem;font-weight:600;margin-bottom:6px">🏦 الأنشطة التمويلية</div>
        <div style="color:#8aa0b8;font-size:.77rem;line-height:1.7">${finText}</div>
      </div>
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:12px">
        <div style="color:#5baef0;font-size:.72rem;font-weight:600;margin-bottom:6px">💧 الوضع النقدي</div>
        <div style="color:#8aa0b8;font-size:.77rem;line-height:1.7">${cashText}</div>
      </div>
    </div>
    <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:14px">
      <div style="color:#7090b0;font-size:.73rem;font-weight:600;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">🎯 التوجيهات والتوصيات</div>
      <ul style="margin:0;padding-right:20px;color:#8aa0b8;font-size:.79rem;line-height:2.1">
        ${recs.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>`;
}

async function exportConsExcel() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const { companies = [], pl, bs, byDb, elimination } = data;
  const allMths  = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel  = document.getElementById('cons-period-from');
  const toSel    = document.getElementById('cons-period-to');
  const selFrom  = (fromSel && fromSel.value && allMths.includes(fromSel.value)) ? fromSel.value : allMths[0];
  const selTo    = (toSel   && toSel.value   && allMths.includes(toSel.value))   ? toSel.value   : allMths[allMths.length-1];
  const inRange  = m => m >= selFrom && m <= selTo;

  const plFilt   = pl.filter(r => inRange(r.month));
  const c        = aggregatePL(plFilt);
  const bsMths   = [...new Set(bs.map(r => r.month))].sort();
  const selBsMo  = (selTo && bsMths.includes(selTo)) ? selTo : bsMths[bsMths.length-1];
  const { A: totalA, CA: totalCA, NCA: totalNCA, Inv: totalInv,
          L: totalL, CL: totalCL, NCL: totalNCL, E: totalE, E_hist: totalE_hist } = _bsTotals(bs, selBsMo);

  const plUpTo   = pl.filter(r => r.month <= selBsMo);
  const monNP    = aggregatePL(plUpTo).netProfit;
  const derivNP  = totalE - totalE_hist;
  const priorNP  = derivNP - monNP;

  const perDb    = (byDb || []).map(d => ({ ...d, agg: aggregatePL(d.pl.filter(r => inRange(r.month))), bs: _bsTotals(d.bs, selBsMo) }));
  const companyName = companies.map(cx => (cx.name||cx.db).replace('مؤسسة ','').replace('مصنع ','')).join(' + ') || 'المجموعة المجمعة';
  const elim = elimination || { applied: false };

  const FONT   = 'Calibri';
  const numFmt = '#,##0;[Red](#,##0);"-"';
  const numFmt0= '#,##0;#,##0;"-"';
  const CLR = {
    navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
    bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
    textLight:'FF6A8AAA', textGray:'FF888888',
    greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
  };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
  const genDate = new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'});

  // ── Sheet 1: Consolidated P&L ────────────────────────────────────────────
  const NC_PL = perDb.length + 2; // company cols + consolidated col + label col
  const ws1 = wb.addWorksheet('قائمة الدخل المجمعة', { views:[{ rightToLeft:true }] });
  ws1.pageSetup.paperSize=9; ws1.pageSetup.orientation='landscape';
  ws1.pageSetup.fitToPage=true; ws1.pageSetup.fitToWidth=1;
  ws1.pageSetup.margins={left:0.5,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws1.columns=[{width:38},...perDb.map(()=>({width:20})),{width:22}];

  const span1 = row => ws1.mergeCells(row.number,1,row.number,NC_PL);
  const addT1 = (t,sz,fc,bg) => {
    const row=ws1.addRow([t]); row.height=sz>12?32:22; span1(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    cell.fill=solid(bg); cell.alignment={horizontal:'center',vertical:'middle'};
  };
  const addS1 = (h=5) => { const row=ws1.addRow(['']); row.height=h; span1(row); row.getCell(1).fill=solid(CLR.white); };

  addT1('المجموعة المجمعة — '+companyName,14,CLR.white,CLR.navyDark);
  addT1('قائمة الدخل الشامل المجمعة',12,CLR.white,CLR.navy);
  addT1(`الفترة: ${selFrom} — ${selTo}${elim.applied?' | بعد الاستبعاد البيني':''}`,9.5,'FFAACCE8',CLR.navyDark);
  addT1(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`,8.5,CLR.textLight,CLR.navyDark);
  addS1(4);

  // Header row
  {
    const hdrRow=ws1.addRow(['البند',...perDb.map(d=>(d.name||d.db).replace('مؤسسة ','').replace('مصنع ','')),'المجمع']);
    hdrRow.height=22;
    hdrRow.eachCell({includeEmpty:true},(cell,ci)=>{
      cell.font={name:FONT,size:10,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
  }

  const PL_ROWS = [
    { lbl:'الإيراد',                         key:'revenue',    bold:false, indent:false },
    { lbl:'(-) تكلفة البضاعة المباعة',        key:'cogs',       bold:false, indent:true,  negate:true },
    { lbl:'مجمل الربح',                       key:'grossProfit',bold:true,  indent:false, subtotal:true },
    { lbl:null },
    { lbl:'رواتب وأجور',                      key:'sal',        bold:false, indent:true,  negate:true },
    { lbl:'إيجار',                            key:'rent',       bold:false, indent:true,  negate:true },
    { lbl:'صيانة وتشغيل',                    key:'maint',      bold:false, indent:true,  negate:true },
    { lbl:'مبيعات وتسويق',                   key:'sell',       bold:false, indent:true,  negate:true },
    { lbl:'توزيع ونقل',                      key:'dist',       bold:false, indent:true,  negate:true },
    { lbl:'مصروفات إدارية',                  key:'adm',        bold:false, indent:true,  negate:true },
    { lbl:'فوائد بنكية',                     key:'fin',        bold:false, indent:true,  negate:true },
    { lbl:'مصروفات خيرية',                  key:'char',       bold:false, indent:true,  negate:true },
    { lbl:'مصروفات أخرى',                   key:'oth',        bold:false, indent:true,  negate:true },
    { lbl:'(-) إجمالي المصروفات التشغيلية',  key:'totalOpex',  bold:true,  indent:false, subtotal:true, negate:true },
    { lbl:'صافي الربح',                      key:'netProfit',  bold:true,  indent:false, total:true },
  ];
  const gvPL = (agg, key) => {
    if (!key) return 0;
    if (key === 'cogs') return agg.totalCost;
    return (key in agg) ? agg[key] : 0;
  };

  PL_ROWS.forEach(row => {
    if (!row.lbl) {
      const srow=ws1.addRow(['مصروفات تشغيلية']); srow.height=14;
      srow.getCell(1).font={name:FONT,size:8.5,italic:true,color:{argb:CLR.textLight}};
      srow.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1};
      return;
    }
    const isTotal = row.total, isSub = row.subtotal;
    const vals = [...perDb.map(d => gvPL(d.agg, row.key)), gvPL(c, row.key)];
    const xlRow = ws1.addRow([row.lbl, ...vals.map(() => null)]);
    xlRow.height = isSub || isTotal ? 18 : 16;
    xlRow.getCell(1).font={name:FONT,size:9.5,bold:row.bold,color:{argb:isTotal?CLR.white:CLR.textDark}};
    xlRow.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:row.indent?2:0};
    if(isTotal) { xlRow.getCell(1).fill=solid(CLR.navy); xlRow.getCell(1).border={top:bdr('medium',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)}; }
    else if(isSub) { xlRow.getCell(1).fill=solid(CLR.bluePale); xlRow.getCell(1).border={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')}; }
    else xlRow.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
    vals.forEach((v, ci) => {
      const cell = xlRow.getCell(ci + 2);
      const display = row.negate ? -v : v;
      cell.value = +display.toFixed(0);
      cell.numFmt = (isSub || isTotal) ? numFmt : numFmt0;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      const isConsCol = ci === vals.length - 1;
      cell.font = { name:FONT, size:9.5, bold:row.bold,
        color:{ argb: isTotal ? (v>=0?CLR.greenText:'FFCC4444') : isConsCol ? 'FF1A3A6A' : CLR.textNavy } };
      if(isTotal)  { cell.fill=solid(CLR.navy); cell.border={top:bdr('medium',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)}; }
      else if(isSub) { cell.fill=solid(isConsCol?'FFF0F4FA':CLR.bluePale); cell.border={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')}; }
      else cell.border={bottom:bdr('hair','FFE8ECF0')};
    });
  });

  if (elim.applied) {
    addS1(3);
    const noteRow=ws1.addRow([`* استُبعد بينياً: إيراد ${Math.round(elim.totalRevenue).toLocaleString('ar-SA')} ر.س | تكلفة ${Math.round(elim.totalCOGS).toLocaleString('ar-SA')} ر.س | ذمم AR/AP ${Math.round(elim.latestARElim).toLocaleString('ar-SA')} / ${Math.round(elim.latestAPElim).toLocaleString('ar-SA')} ر.س`]);
    noteRow.height=14; span1(noteRow);
    noteRow.getCell(1).font={name:FONT,size:8,color:{argb:CLR.textLight}};
    noteRow.getCell(1).alignment={horizontal:'right',vertical:'middle'};
  }

  // ── Sheet 2: Consolidated Balance Sheet ──────────────────────────────────
  const ws2 = wb.addWorksheet('المركز المالي المجمع', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='portrait';
  ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.pageSetup.margins={left:0.6,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws2.columns=[{width:46},{width:22}];

  const span2 = row => ws2.mergeCells(row.number,1,row.number,2);
  const addT2 = (t,sz,fc,bg) => {
    const row=ws2.addRow([t]); row.height=sz>12?32:22; span2(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    cell.fill=solid(bg); cell.alignment={horizontal:'center',vertical:'middle'};
  };
  const addS2 = (h=5) => { const row=ws2.addRow(['']); row.height=h; span2(row); row.getCell(1).fill=solid(CLR.white); };
  const addHdr2 = lbl => {
    const row=ws2.addRow([lbl]); row.height=18; span2(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
    c.fill=solid(CLR.navy); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addCatHdr2 = lbl => {
    const row=ws2.addRow([lbl]); row.height=16; span2(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:8.5,bold:true,color:{argb:CLR.textBlue}};
    c.fill=solid(CLR.blueLight); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addBsItem = (lbl, val) => {
    const row=ws2.addRow([lbl,null]); row.height=16;
    row.getCell(1).font={name:FONT,size:9.5,color:{argb:CLR.textDark}};
    row.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:3};
    row.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
    const c2=row.getCell(2);
    c2.value=val!==null?+val.toFixed(0):null; c2.numFmt=numFmt0;
    c2.font={name:FONT,size:9.5,color:{argb:CLR.textNavy}};
    c2.alignment={horizontal:'left',vertical:'middle'}; c2.border={bottom:bdr('hair','FFE8ECF0')};
  };
  const addSubTot2 = (lbl, val, fc) => {
    const row=ws2.addRow([lbl,null]); row.height=17;
    const tb={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')};
    row.getCell(1).font={name:FONT,size:9.5,bold:true,color:{argb:fc||CLR.textNavy}};
    row.getCell(1).fill=solid(CLR.bluePale); row.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1}; row.getCell(1).border=tb;
    const c2=row.getCell(2);
    c2.value=+val.toFixed(0); c2.numFmt=numFmt; c2.font={name:FONT,size:9.5,bold:true,color:{argb:fc||CLR.textNavy}};
    c2.fill=solid(CLR.bluePale); c2.alignment={horizontal:'left',vertical:'middle'}; c2.border=tb;
  };
  const addGrandTot2 = (lbl, val, fc) => {
    const row=ws2.addRow([lbl,null]); row.height=20;
    const bord={top:bdr('double',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)};
    row.getCell(1).font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.white}};
    row.getCell(1).fill=solid(CLR.navyDark); row.getCell(1).alignment={horizontal:'right',vertical:'middle'}; row.getCell(1).border=bord;
    const c2=row.getCell(2);
    c2.value=+val.toFixed(0); c2.numFmt=numFmt; c2.font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.white}};
    c2.fill=solid(CLR.navyDark); c2.alignment={horizontal:'left',vertical:'middle'}; c2.border=bord;
  };

  addT2('المجموعة المجمعة — '+companyName,14,CLR.white,CLR.navyDark);
  addT2('قائمة المركز المالي المجمع',12,CLR.white,CLR.navy);
  addT2(`كما في ${selBsMo}${elim.applied?' | بعد الاستبعاد البيني':''}`,9.5,'FFAACCE8',CLR.navyDark);
  addT2(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`,8.5,CLR.textLight,CLR.navyDark);
  addS2(4);

  // Assets
  const bsLatest = bs.filter(r => r.month === selBsMo);
  const c3r = r => r.code3 || r.grpCode.slice(0,3);
  const srt = arr => arr.sort((a,b) => a.grpCode.localeCompare(b.grpCode));
  const curAssets    = srt(bsLatest.filter(r => c3r(r)==='103' && r.balance!==0));
  const nonCurAssets = srt(bsLatest.filter(r => r.grpCode.startsWith('1') && c3r(r)!=='103' && r.balance!==0));
  const curLiab      = srt(bsLatest.filter(r => c3r(r)==='201' && r.balance!==0));
  const nonCurLiab   = srt(bsLatest.filter(r => r.grpCode.startsWith('2') && c3r(r)!=='201' && r.balance!==0));
  const equity       = srt(bsLatest.filter(r => r.grpCode.startsWith('3') && r.balance!==0));

  addHdr2('الأصول');
  addCatHdr2('الأصول المتداولة');
  curAssets.forEach(r => addBsItem(r.grpName||r.grpCode, Math.abs(r.balance)));
  addSubTot2('إجمالي الأصول المتداولة', totalCA, 'FF1A5A9A');
  addCatHdr2('الأصول غير المتداولة');
  nonCurAssets.forEach(r => addBsItem(r.grpName||r.grpCode, Math.abs(r.balance)));
  addSubTot2('إجمالي الأصول غير المتداولة', totalNCA, 'FF4A7A9A');
  addGrandTot2('إجمالي الأصول', totalA);

  addS2(4);
  addHdr2('الخصوم وحقوق الملكية');
  addCatHdr2('الخصوم المتداولة');
  curLiab.forEach(r => addBsItem(r.grpName||r.grpCode, -r.balance));
  addSubTot2('إجمالي الخصوم المتداولة', totalCL, 'FFDA7A2A');
  if (nonCurLiab.length) {
    addCatHdr2('الخصوم غير المتداولة');
    nonCurLiab.forEach(r => addBsItem(r.grpName||r.grpCode, -r.balance));
    addSubTot2('إجمالي الخصوم غير المتداولة', totalNCL, 'FFDA6A2A');
  }
  addSubTot2('إجمالي الخصوم', totalL, 'FFAA7070');
  addS2(3);
  addCatHdr2('حقوق الملكية');
  equity.forEach(r => addBsItem(r.grpName||r.grpCode, -r.balance));
  if (Math.abs(priorNP) > 100) addBsItem('أرباح مرحلة من فترات سابقة', priorNP);
  addBsItem(`صافي ربح الفترة الجارية (${plUpTo[0]?.month||''} — ${selBsMo})`, monNP);
  addSubTot2('إجمالي حقوق الملكية', totalE, totalE>=0?CLR.greenText:'FFCC4444');
  addGrandTot2('إجمالي الخصوم وحقوق الملكية', totalA);

  addS2(4);
  {
    const balanced = Math.abs(totalA - (totalL + totalE)) < 1;
    const noteRow=ws2.addRow([`${balanced?'✓':'⚠'} المعادلة المحاسبية: إجمالي الأصول ${Math.round(totalA).toLocaleString('ar-SA')} = خصوم ${Math.round(totalL).toLocaleString('ar-SA')} + ملكية ${Math.round(totalE).toLocaleString('ar-SA')} ر.س`]);
    noteRow.height=16; span2(noteRow);
    noteRow.getCell(1).font={name:FONT,size:8.5,bold:balanced,color:{argb:balanced?CLR.greenText:'FFCC4444'}};
    noteRow.getCell(1).fill=solid(balanced?CLR.greenBg:'FFFFF4F4');
    noteRow.getCell(1).alignment={horizontal:'center',vertical:'middle'};
    noteRow.getCell(1).border={top:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),bottom:bdr('thin',balanced?CLR.greenBdr:'FFCC8888')};
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `القوائم_المالية_المجمعة_${selFrom}_${selTo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Consolidated HTML report builder (shared by export + print) ──────────────
function buildConsHTMLReport(data, selFrom, selTo) {
  const { companies = [], pl, bs, byDb, elimination } = data;
  const elim = elimination || { applied: false };

  const inRange  = m => m >= selFrom && m <= selTo;
  const plFilt   = pl.filter(r => inRange(r.month));
  const c        = aggregatePL(plFilt);
  const bsMths   = [...new Set(bs.map(r => r.month))].sort();
  const selBsMo  = (selTo && bsMths.includes(selTo)) ? selTo : bsMths[bsMths.length - 1];
  const { A: totalA, CA: totalCA, NCA: totalNCA,
          L: totalL, CL: totalCL, NCL: totalNCL, E: totalE, E_hist: totalE_hist } = _bsTotals(bs, selBsMo);

  const plUpTo  = pl.filter(r => r.month <= selBsMo);
  const monNP   = aggregatePL(plUpTo).netProfit;
  const priorNP = (totalE - totalE_hist) - monNP;

  const perDb = (byDb || []).map(d => ({
    ...d,
    agg: aggregatePL(d.pl.filter(r => inRange(r.month))),
    bs:  _bsTotals(d.bs, selBsMo),
  }));
  const companyName = companies.map(cx => (cx.name||cx.db).replace('مؤسسة ','').replace('مصنع ','')).join(' + ') || 'المجموعة المجمعة';
  const genDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const fN  = v => Math.round(Math.abs(v)).toLocaleString('ar-SA');
  const fSg = v => v < 0 ? `(${fN(v)})` : fN(v);
  const gvPL = (agg, key) => { if (!key) return 0; if (key==='cogs') return agg.totalCost; return (key in agg) ? agg[key] : 0; };

  const PL_ROWS = [
    { lbl:'الإيراد',                        key:'revenue',    type:'normal' },
    { lbl:'(-) تكلفة البضاعة المباعة',       key:'cogs',       type:'normal',   negate:true },
    { lbl:'مجمل الربح',                      key:'grossProfit',type:'subtotal' },
    null,
    { lbl:'رواتب وأجور',                     key:'sal',        type:'indent',   negate:true },
    { lbl:'إيجار',                           key:'rent',       type:'indent',   negate:true },
    { lbl:'صيانة وتشغيل',                   key:'maint',      type:'indent',   negate:true },
    { lbl:'مبيعات وتسويق',                  key:'sell',       type:'indent',   negate:true },
    { lbl:'توزيع ونقل',                     key:'dist',       type:'indent',   negate:true },
    { lbl:'مصروفات إدارية',                 key:'adm',        type:'indent',   negate:true },
    { lbl:'فوائد بنكية',                    key:'fin',        type:'indent',   negate:true },
    { lbl:'مصروفات خيرية',                 key:'char',       type:'indent',   negate:true },
    { lbl:'مصروفات أخرى',                  key:'oth',        type:'indent',   negate:true },
    { lbl:'(-) إجمالي المصروفات التشغيلية', key:'totalOpex',  type:'subtotal', negate:true },
    { lbl:'صافي الربح',                     key:'netProfit',  type:'total' },
  ];

  const dbHdrs = perDb.map(d => `<th>${(d.name||d.db).replace('مؤسسة ','').replace('مصنع ','')}</th>`).join('');
  let plHtml = '';
  PL_ROWS.forEach(row => {
    if (!row) { plHtml += `<tr class="section-lbl"><td colspan="${perDb.length+2}">مصروفات تشغيلية</td></tr>`; return; }
    const vals = [...perDb.map(d => gvPL(d.agg, row.key)), gvPL(c, row.key)];
    plHtml += `<tr class="${row.type}">
      <td class="lbl">${row.lbl}</td>
      ${vals.map((v,i) => { const d = row.negate ? -v : v; return `<td class="num${i===vals.length-1?' cons':''}">${d!==0?fSg(d):'—'}</td>`; }).join('')}
    </tr>`;
  });

  const bsLatest     = bs.filter(r => r.month === selBsMo);
  const c3r          = r => r.code3 || r.grpCode.slice(0,3);
  const srt          = arr => [...arr].sort((a,b) => a.grpCode.localeCompare(b.grpCode));
  const curAssets    = srt(bsLatest.filter(r => c3r(r)==='103'  && r.balance!==0));
  const nonCurAssets = srt(bsLatest.filter(r => r.grpCode.startsWith('1') && c3r(r)!=='103' && r.balance!==0));
  const curLiab      = srt(bsLatest.filter(r => c3r(r)==='201'  && r.balance!==0));
  const nonCurLiab   = srt(bsLatest.filter(r => r.grpCode.startsWith('2') && c3r(r)!=='201' && r.balance!==0));
  const equity       = srt(bsLatest.filter(r => r.grpCode.startsWith('3') && r.balance!==0));

  const bi   = (l,v) => `<tr class="bs-item"><td>${l}</td><td class="num">${fN(v)}</td></tr>`;
  const bsub = (l,v) => `<tr class="subtotal"><td>${l}</td><td class="num">${fN(v)}</td></tr>`;
  const bgrd = (l,v) => `<tr class="grand"><td>${l}</td><td class="num">${fN(v)}</td></tr>`;
  const bsec = l     => `<tr class="sec-hdr"><td colspan="2">${l}</td></tr>`;
  const bcat = l     => `<tr class="cat-hdr"><td colspan="2">${l}</td></tr>`;
  const bsep = ()    => `<tr class="spacer"><td colspan="2"></td></tr>`;

  let bsHtml = '';
  bsHtml += bsec('الأصول');
  bsHtml += bcat('الأصول المتداولة');
  curAssets.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, Math.abs(r.balance)); });
  bsHtml += bsub('إجمالي الأصول المتداولة', totalCA);
  bsHtml += bcat('الأصول غير المتداولة');
  nonCurAssets.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, Math.abs(r.balance)); });
  bsHtml += bsub('إجمالي الأصول غير المتداولة', totalNCA);
  bsHtml += bgrd('إجمالي الأصول', totalA);
  bsHtml += bsep();
  bsHtml += bsec('الخصوم وحقوق الملكية');
  bsHtml += bcat('الخصوم المتداولة');
  curLiab.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, -r.balance); });
  bsHtml += bsub('إجمالي الخصوم المتداولة', totalCL);
  if (nonCurLiab.length) {
    bsHtml += bcat('الخصوم غير المتداولة');
    nonCurLiab.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, -r.balance); });
    bsHtml += bsub('إجمالي الخصوم غير المتداولة', totalNCL);
  }
  bsHtml += bsub('إجمالي الخصوم', totalL);
  bsHtml += bsep();
  bsHtml += bcat('حقوق الملكية');
  equity.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, -r.balance); });
  if (Math.abs(priorNP) > 100) bsHtml += bi('أرباح مرحلة من فترات سابقة', priorNP);
  bsHtml += bi(`صافي ربح الفترة الجارية (${plUpTo[0]?.month||''} — ${selBsMo})`, monNP);
  bsHtml += bsub('إجمالي حقوق الملكية', totalE);
  bsHtml += bgrd('إجمالي الخصوم وحقوق الملكية', totalA);

  const balanced = Math.abs(totalA - (totalL + totalE)) < 1;
  const elimNote = elim.applied
    ? `<p class="elim-note">* استُبعد بينياً: إيراد ${fN(elim.totalRevenue)} ر.س | تكلفة ${fN(elim.totalCOGS)} ر.س | ذمم AR/AP ${fN(elim.latestARElim)} / ${fN(elim.latestAPElim)} ر.س</p>` : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>القوائم المالية المجمعة — ${selFrom} إلى ${selTo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,'Arabic Typesetting',sans-serif;direction:rtl;text-align:right;background:#fff;color:#111;font-size:13px;line-height:1.6}
.page{max-width:920px;margin:0 auto;padding:28px 24px}
.hdr{background:#0A2040;color:#fff;padding:18px 24px;border-radius:6px 6px 0 0;text-align:center}
.hdr h1{font-size:18px;margin-bottom:4px}
.hdr h2{font-size:13px;font-weight:normal;color:#AACCE8}
.hdr .meta{font-size:11px;color:#6A8AAA;margin-top:4px}
.sec-title{background:#1A3A6A;color:#fff;padding:8px 14px;font-size:13px;font-weight:bold;margin-top:20px;border-radius:4px}
table{width:100%;border-collapse:collapse;margin-top:0}
td,th{padding:6px 10px;border-bottom:1px solid #E8ECF0}
th{background:#1A3A6A;color:#fff;font-size:11px;text-align:center;padding:8px 10px}
th:first-child{text-align:right}
.num{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}
.cons{color:#1A3A6A;font-weight:bold}
.lbl{}
.indent td.lbl{padding-right:28px;color:#444;font-size:12px}
.subtotal{background:#F4F7FB;font-weight:bold}
.subtotal td{border-top:1px solid #C0CFE8;border-bottom:1px solid #B0C4DC}
.grand{background:#0A2040;color:#fff;font-weight:bold;font-size:13.5px}
.grand td{color:#fff;border-bottom:2px solid #0A2040}
.section-lbl td{font-size:11px;color:#6A8AAA;font-style:italic;padding:10px 10px 3px;border-bottom:none}
.sec-hdr td{background:#1A3A6A;color:#fff;font-weight:bold;padding:8px 12px;font-size:12.5px}
.cat-hdr td{background:#E8EEF8;color:#1A3A6A;font-weight:bold;padding:6px 12px;font-size:11.5px}
.bs-item td{padding:5px 10px}
.bs-item td:first-child{padding-right:32px;color:#333;font-size:12px}
.spacer td{height:8px;border-bottom:none}
.bal-note{margin-top:10px;padding:8px 14px;border-radius:4px;font-size:11.5px;font-weight:bold;text-align:center}
.bal-ok{background:#F4FFF8;color:#1A6A2A;border:1px solid #90C890}
.bal-err{background:#FFF4F4;color:#CC4444;border:1px solid #CC8888}
.elim-note{font-size:11px;color:#6A8AAA;margin-top:8px;padding:6px 10px;border-top:1px solid #E8ECF0}
.footer{margin-top:28px;padding-top:10px;border-top:1px solid #E8ECF0;font-size:10px;color:#9AB;text-align:center}
.page-break{page-break-before:always;height:1px}
@media print{
  body{font-size:11px}
  .page{padding:8px;max-width:100%}
  .sec-title{margin-top:10px}
}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <h1>المجموعة المجمعة — ${companyName}</h1>
    <h2>القوائم المالية المجمعة${elim.applied?' | بعد الاستبعاد البيني':''}</h2>
    <div class="meta">المبالغ بالريال السعودي &nbsp;|&nbsp; أُنشئ: ${genDate}</div>
  </div>

  <div class="sec-title">قائمة الدخل الشامل المجمعة &nbsp;—&nbsp; الفترة: ${selFrom} إلى ${selTo}</div>
  <table>
    <thead><tr><th>البند</th>${dbHdrs}<th>المجمع</th></tr></thead>
    <tbody>${plHtml}</tbody>
  </table>
  ${elimNote}

  <div class="page-break"></div>
  <div class="sec-title">قائمة المركز المالي المجمع &nbsp;—&nbsp; كما في ${selBsMo}</div>
  <table><tbody>${bsHtml}</tbody></table>
  <div class="bal-note ${balanced?'bal-ok':'bal-err'}">
    ${balanced?'✓':'⚠'} المعادلة المحاسبية: إجمالي الأصول ${fN(totalA)} = خصوم ${fN(totalL)} + ملكية ${fN(totalE)} ر.س
  </div>

  <div class="footer">أُنشئ بواسطة MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div>
</body>
</html>`;
}

function exportConsHTML() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  const { pl, bs } = data;
  const allMths = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel = document.getElementById('cons-period-from');
  const toSel   = document.getElementById('cons-period-to');
  const selFrom = (fromSel && fromSel.value && allMths.includes(fromSel.value)) ? fromSel.value : allMths[0];
  const selTo   = (toSel   && toSel.value   && allMths.includes(toSel.value))   ? toSel.value   : allMths[allMths.length - 1];
  const html = buildConsHTMLReport(data, selFrom, selTo);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `القوائم_المالية_المجمعة_${selFrom}_${selTo}.html`; a.click();
  URL.revokeObjectURL(url);
}

function printConsPDF() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  const { pl, bs } = data;
  const allMths = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel = document.getElementById('cons-period-from');
  const toSel   = document.getElementById('cons-period-to');
  const selFrom = (fromSel && fromSel.value && allMths.includes(fromSel.value)) ? fromSel.value : allMths[0];
  const selTo   = (toSel   && toSel.value   && allMths.includes(toSel.value))   ? toSel.value   : allMths[allMths.length - 1];
  const html = buildConsHTMLReport(data, selFrom, selTo);
  const w = window.open('', '_blank', 'width=960,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

// ── Tab dispatcher ────────────────────────────────────────────────────────────
// ── TRIAL BALANCE tab ─────────────────────────────────────────────────────────

let _tbData       = null;   // last fetched rows
let _tbCmpData    = null;   // comparison period (same months, previous year)
let _tbInited     = false;
let _tbRootFilter = null;   // { code, name, level } — current drill-down root

function _tbLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${ym}-${String(d.getDate()).padStart(2, '0')}`;
}

function initTrialBalance() {
  if (_tbInited) return;
  _tbInited = true;

  // Quick period selector → sets from/to month inputs
  const DATA_START_YM = '2025-10';  // data begins October 2025
  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  function _tbApplyQuick(val) {
    const from = document.getElementById('tb-from');
    const to   = document.getElementById('tb-to');
    if (val === '2025')      { from.value = DATA_START_YM; to.value = '2025-12'; }
    else if (val === '2026-ytd') { from.value = '2026-01'; to.value = curYM; }
    else if (val === 'all')  { from.value = DATA_START_YM; to.value = curYM; }
    // 'مخصص' → leave as-is
  }

  const quickSel = document.getElementById('tb-quick');
  if (quickSel) {
    quickSel.addEventListener('change', () => _tbApplyQuick(quickSel.value));
    // apply the default selection on init
    _tbApplyQuick(quickSel.value);
    // mark as custom when user edits the month pickers directly
    ['tb-from', 'tb-to'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => { quickSel.value = ''; });
    });
  }

  document.getElementById('tb-run').addEventListener('click', () => { _tbRootFilter = null; _tbUpdateBreadcrumb(); fetchTrialBalance(); });
  document.getElementById('tb-export-excel').addEventListener('click', () => {
    const btn = document.getElementById('tb-export-excel');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportTBExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 Excel'; });
  });
  document.getElementById('tb-export-html').addEventListener('click',  exportTBHTML);
  document.getElementById('tb-export-csv').addEventListener('click',   exportTBCSV);
  document.getElementById('tb-print').addEventListener('click', () => window.print());
  document.getElementById('tb-search').addEventListener('input', _renderTBRows);
  document.getElementById('tb-level').addEventListener('change', _tbResetData);
  const tbCmpCb = document.getElementById('tb-compare');
  if (tbCmpCb) tbCmpCb.addEventListener('change', () => { _tbCmpData = null; if (_tbData) fetchTrialBalance(); });
  const bcBack = document.getElementById('tb-bc-back');
  if (bcBack) bcBack.addEventListener('click', () => { _tbRootFilter = null; _tbUpdateBreadcrumb(); fetchTrialBalance(); });
}

async function _tbPopulateBranches() {
  const db   = State.get('activeDb');
  const brSel = document.getElementById('tb-branch');
  if (!brSel || !db) return;
  const prev = brSel.value;
  try {
    const list = await fetch(`/api/branches?db=${encodeURIComponent(db)}`).then(r => r.json());
    while (brSel.options.length > 0) brSel.remove(0);
    const all = document.createElement('option'); all.value = 'ALL'; all.textContent = 'جميع الفروع'; brSel.appendChild(all);
    list.filter(b => b.id !== 0).forEach(b => {
      const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; brSel.appendChild(o);
    });
    const unassigned = document.createElement('option'); unassigned.value = '0'; unassigned.textContent = 'غير محدد / بدون فرع'; brSel.appendChild(unassigned);
    // Restore previous selection if still valid
    if ([...brSel.options].some(o => o.value === prev)) brSel.value = prev;
    else brSel.value = 'ALL';
  } catch (e) {
    // leave existing options as-is on failure
  }
}

function _tbResetData() { _tbData = null; _tbCmpData = null; _tbRootFilter = null; _tbUpdateBreadcrumb(); _renderTBRows(); }

function _tbUpdateBreadcrumb() {
  const el = document.getElementById('tb-breadcrumb');
  const pathEl = document.getElementById('tb-bc-path');
  if (!el || !pathEl) return;
  if (_tbRootFilter) {
    const levelName = (document.getElementById('tb-level') || {}).options;
    const lvlTxt = levelName ? [...levelName].find(o => o.selected)?.textContent || '' : '';
    pathEl.innerHTML = `<span style="color:#6a9aca;font-family:monospace;font-size:.78rem">${esc(_tbRootFilter.code)}</span> — ${esc(_tbRootFilter.name)}`;
    el.classList.remove('hidden');
    el.style.display = 'flex';
  } else {
    el.classList.add('hidden');
    el.style.display = 'none';
  }
}

async function fetchTrialBalance() {
  const from   = document.getElementById('tb-from').value;
  const to     = document.getElementById('tb-to').value;
  const level  = document.getElementById('tb-level').value;
  const brVal  = document.getElementById('tb-branch').value;
  const branch = brVal === 'ALL' ? 0 : (+brVal || 0);

  if (!from || !to) {
    document.getElementById('tb-status').textContent = 'حدد الفترة أولاً';
    return;
  }

  const fromDate = `${from}-01`;
  const toDate   = _tbLastDay(to);
  const db       = State.get('activeDb') || '';
  const rootCode = _tbRootFilter ? _tbRootFilter.code : '';
  const qs       = new URLSearchParams({ db, from: fromDate, to: toDate, level, branch, rootCode });

  // Comparison period: same months, previous year
  const prevFrom   = `${+from.substring(0,4)-1}${from.substring(4)}-01`;
  const prevToYM   = `${+to.substring(0,4)-1}${to.substring(4)}`;
  const prevTo     = _tbLastDay(prevToYM);
  const cmpQs      = new URLSearchParams({ db, from: prevFrom, to: prevTo, level, branch, rootCode });
  const wantCmp    = !!(document.getElementById('tb-compare')?.checked);

  const loadEl   = document.getElementById('tb-loading');
  const statusEl = document.getElementById('tb-status');
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';
  document.getElementById('tb-tbody').innerHTML = '';
  document.getElementById('tb-tfoot').innerHTML = '';
  document.getElementById('tb-balance-check').innerHTML = '';
  document.getElementById('tb-count').textContent = '';

  try {
    const [resp, cmpRows] = await Promise.all([
      fetch(`/api/trial-balance?${qs}`).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); })),
      wantCmp
        ? fetch(`/api/trial-balance?${cmpQs}`).then(r => r.ok ? r.json() : Promise.resolve([]))
        : Promise.resolve(null),
    ]);
    _tbData    = resp;
    _tbCmpData = cmpRows;
    statusEl.textContent = cmpRows ? `${resp.length} حساب + مقارنة` : '';
    _renderTBRows();
  } catch (e) {
    _tbData = null;
    const C = document.getElementById('tb-compare')?.checked ? 11 : 8;
    document.getElementById('tb-tbody').innerHTML =
      `<tr><td colspan="${C}" style="text-align:center;padding:32px;color:#da4a4a">خطأ: ${esc(e.message)}</td></tr>`;
    statusEl.textContent = 'فشل التحميل';
  } finally {
    loadEl.classList.add('hidden');
  }
}

function renderTrialBalance() {
  initTrialBalance();
  _tbPopulateBranches();
  _tbUpdateBreadcrumb();
  if (_tbData) _renderTBRows();
}

// Called when user clicks a row to drill into its sub-accounts
window._tbDrillIn = function(code, name) {
  _tbRootFilter = { code, name };
  // Advance level by 1 automatically (max 5)
  const levelEl = document.getElementById('tb-level');
  if (levelEl) {
    const cur = parseInt(levelEl.value) || 3;
    if (cur < 5) levelEl.value = String(cur + 1);
  }
  _tbUpdateBreadcrumb();
  fetchTrialBalance();
};

function _renderTBRows() {
  if (!_tbData) return;

  const search = (document.getElementById('tb-search').value || '').trim().toLowerCase();

  const SEC_LABEL = {
    '1': 'الأصول',
    '2': 'الخصوم',
    '3': 'حقوق الملكية',
    '4': 'المصروفات والتكاليف',
    '5': 'الإيرادات',
  };

  // Comparison state
  const cmp    = !!(document.getElementById('tb-compare')?.checked && _tbCmpData);
  const cmpMap = cmp ? new Map(_tbCmpData.map(r => [r.code, r.closeBal])) : null;
  const C      = cmp ? 11 : 8;

  // Period labels for thead
  const fromYM    = document.getElementById('tb-from').value || '';
  const toYM      = document.getElementById('tb-to').value   || '';
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';

  // Rebuild thead dynamically to reflect column count
  const thead = document.querySelector('#tb-table thead');
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="min-width:110px">كود الحساب</th>
        <th rowspan="2" style="min-width:200px">اسم الحساب</th>
        <th colspan="2" class="tb-col-grp-hdr">رصيد أول الفترة</th>
        <th colspan="2" class="tb-col-grp-hdr">حركة الفترة</th>
        <th colspan="2" class="tb-col-grp-hdr">رصيد آخر الفترة (${esc(fromYM)}–${esc(toYM)})</th>
        ${cmp ? `<th colspan="2" class="tb-col-grp-hdr" style="background:#08192e;color:#5a8aaa">رصيد المقارنة (${esc(prevFromYM)}–${esc(prevToYM)})</th>
                 <th rowspan="2" class="num" style="min-width:80px;background:#08192e;color:#5a8aaa">التغيير&nbsp;%</th>` : ''}
      </tr>
      <tr>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
        ${cmp ? `<th class="num" style="min-width:100px;background:#08192e;color:#4a7aaa">مدين</th>
                 <th class="num" style="min-width:100px;background:#08192e;color:#9a5a5a">دائن</th>` : ''}
      </tr>`;
  }

  const rows = _tbData.filter(r =>
    !search ||
    r.code.toLowerCase().includes(search) ||
    (r.name || '').toLowerCase().includes(search)
  );

  let totOpenDr = 0, totOpenCr = 0;
  let totPDr    = 0, totPCr    = 0;
  let totClDr   = 0, totClCr   = 0;
  let totCmpDr  = 0, totCmpCr  = 0;

  let lastSec = null;
  const html  = [];

  const fmtDr = v => v > 0.004 ? `<span class="tb-dr">${fmt(v, 2)}</span>` : `<span class="tb-zero">—</span>`;
  const fmtCr = v => v > 0.004 ? `<span class="tb-cr">${fmt(v, 2)}</span>` : `<span class="tb-zero">—</span>`;

  rows.forEach(r => {
    const sec = r.code ? r.code[0] : '';
    if (sec !== lastSec && SEC_LABEL[sec]) {
      html.push(`<tr class="tb-grp-hdr"><td colspan="${C}">${SEC_LABEL[sec]}</td></tr>`);
      lastSec = sec;
    }

    const openDr = r.openBal  > 0 ? r.openBal  : 0;
    const openCr = r.openBal  < 0 ? -r.openBal : 0;
    const clDr   = r.closeBal > 0 ? r.closeBal : 0;
    const clCr   = r.closeBal < 0 ? -r.closeBal : 0;

    totOpenDr += openDr; totOpenCr += openCr;
    totPDr    += r.pDebit; totPCr  += r.pCredit;
    totClDr   += clDr;    totClCr  += clCr;

    // Comparison cells
    let cmpCells = '';
    if (cmp) {
      const prevCl  = cmpMap.has(r.code) ? (cmpMap.get(r.code) || 0) : null;
      const pDr     = prevCl !== null && prevCl > 0 ? prevCl  : 0;
      const pCr     = prevCl !== null && prevCl < 0 ? -prevCl : 0;
      totCmpDr += pDr; totCmpCr += pCr;
      const curNet  = r.closeBal || 0;
      const prevNet = prevCl !== null ? prevCl : null;
      let pctCell   = `<span style="color:#3a5a7a">—</span>`;
      if (prevNet !== null && Math.abs(prevNet) > 0.004) {
        const pct = (curNet - prevNet) / Math.abs(prevNet) * 100;
        const col = pct > 0 ? '#4ada8e' : pct < 0 ? '#da6a6a' : '#7090b0';
        pctCell = `<span style="color:${col}">${pct > 0 ? '▲' : '▼'} ${fmt(Math.abs(pct), 1)}%</span>`;
      } else if (prevNet === null) {
        pctCell = `<span style="color:#3a5a7a">جديد</span>`;
      }
      cmpCells = `
        <td class="num" style="background:#06111e">${prevCl !== null ? fmtDr(pDr) : '<span style="color:#2a4060">—</span>'}</td>
        <td class="num" style="background:#06111e">${prevCl !== null ? fmtCr(pCr) : '<span style="color:#2a4060">—</span>'}</td>
        <td class="num" style="background:#06111e">${pctCell}</td>`;
    }

    const canDrill = (parseInt((document.getElementById('tb-level')||{}).value)||3) < 5;
    const codeEsc  = esc(r.code);
    const nameEsc  = esc(r.name).replace(/'/g, '&#39;');

    html.push(`<tr class="tb-row" style="cursor:${canDrill?'pointer':'default'}" ${canDrill?`onclick="_tbDrillIn('${r.code}','${nameEsc}')"`:''} title="${canDrill?'اضغط لعرض التفاصيل':''}" >
      <td style="font-family:monospace;font-size:.77rem">
        <span style="color:#6a9aca">${codeEsc}</span>
        ${canDrill ? `<span style="color:#3a6a9a;font-size:.7rem;margin-right:4px">▶</span>` : ''}
      </td>
      <td style="${canDrill?'color:#c8e8ff':''}">${esc(r.name)}</td>
      <td class="num">${fmtDr(openDr)}</td>
      <td class="num">${fmtCr(openCr)}</td>
      <td class="num">${r.pDebit  > 0.004 ? fmtDr(r.pDebit)  : '<span class="tb-zero">—</span>'}</td>
      <td class="num">${r.pCredit > 0.004 ? fmtCr(r.pCredit) : '<span class="tb-zero">—</span>'}</td>
      <td class="num">${fmtDr(clDr)}</td>
      <td class="num">${fmtCr(clCr)}</td>
      ${cmpCells}
    </tr>`);
  });

  document.getElementById('tb-tbody').innerHTML =
    html.join('') ||
    `<tr><td colspan="${C}" style="text-align:center;padding:32px;color:#3a5a7a">لا توجد حسابات تطابق البحث</td></tr>`;

  // Totals footer
  document.getElementById('tb-tfoot').innerHTML = `
    <tr>
      <td colspan="2" style="text-align:center;font-weight:700;color:#c8e8ff;background:#060f18">الإجمالي</td>
      <td class="num"><span class="tb-dr">${fmt(totOpenDr, 2)}</span></td>
      <td class="num"><span class="tb-cr">${fmt(totOpenCr, 2)}</span></td>
      <td class="num"><span class="tb-dr">${fmt(totPDr, 2)}</span></td>
      <td class="num"><span class="tb-cr">${fmt(totPCr, 2)}</span></td>
      <td class="num"><span class="tb-dr">${fmt(totClDr, 2)}</span></td>
      <td class="num"><span class="tb-cr">${fmt(totClCr, 2)}</span></td>
      ${cmp ? `
        <td class="num" style="background:#06111e"><span class="tb-dr">${fmt(totCmpDr, 2)}</span></td>
        <td class="num" style="background:#06111e"><span class="tb-cr">${fmt(totCmpCr, 2)}</span></td>
        <td class="num" style="background:#06111e"></td>` : ''}
    </tr>`;

  // Balance check
  const openDiff  = Math.abs(totOpenDr - totOpenCr);
  const closeDiff = Math.abs(totClDr   - totClCr);
  const balanced  = openDiff < 1 && closeDiff < 1;
  const checkEl   = document.getElementById('tb-balance-check');
  checkEl.className = balanced ? 'tb-balance-ok' : 'tb-balance-fail';
  checkEl.textContent = balanced
    ? `✓ الميزان متوازن — مجموع المدين = مجموع الدائن لأول وآخر الفترة`
    : `⚠ تفاوت في الميزان — أول الفترة: ${fmt(openDiff, 2)} | آخر الفترة: ${fmt(closeDiff, 2)}`;

  document.getElementById('tb-count').textContent =
    `${rows.length.toLocaleString('ar-SA')} حساب`;
}

// ── Excel export (ExcelJS) ────────────────────────────────────────────────────
async function exportTBExcel() {
  if (!_tbData || !_tbData.length) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const from      = document.getElementById('tb-from').value;
  const to        = document.getElementById('tb-to').value;
  const company   = State.get('companyName') || '';
  const levelLbl  = ([...document.getElementById('tb-level').options].find(o=>o.selected)||{}).textContent || '';
  const branchLbl = ([...document.getElementById('tb-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const cmp       = !!(document.getElementById('tb-compare')?.checked && _tbCmpData);
  const cmpMap    = cmp ? new Map(_tbCmpData.map(r => [r.code, r.closeBal])) : null;
  const prevFrom  = from ? `${+from.substring(0,4)-1}${from.substring(4)}` : '';
  const prevTo    = to   ? `${+to.substring(0,4)-1}${to.substring(4)}`     : '';
  const genDate   = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});

  try {
    const NC   = cmp ? 11 : 8;
    const FONT = 'Calibri';
    const numFmt = '#,##0;#,##0;"-"';
    const CLR = {
      navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
      bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
      textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
      textLight:'FF6A8AAA', textGray:'FF888888',
      greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
    };
    const solid = (a) => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
    const bdr   = (s,a) => ({ style:s, color:{ argb:a } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
    const ws = wb.addWorksheet('ميزان المراجعة', { views:[{ rightToLeft:true }] });
    ws.pageSetup.paperSize   = 9;
    ws.pageSetup.orientation = 'landscape';
    ws.pageSetup.fitToPage   = true;
    ws.pageSetup.fitToWidth  = 1;
    ws.pageSetup.margins = { left:0.5, right:0.5, top:0.75, bottom:0.75, header:0.3, footer:0.3 };

    ws.columns = cmp
      ? [{width:16},{width:42},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14},{width:10}]
      : [{width:16},{width:42},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14}];

    const spanAll = (row) => ws.mergeCells(row.number, 1, row.number, NC);

    function addTitle(text, sz, fc, bg) {
      const row = ws.addRow([text]); row.height = sz > 12 ? 32 : 24; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
      c.fill = solid(bg); c.alignment = { horizontal:'center', vertical:'middle' };
    }

    function addSpacer(h=5) {
      const row = ws.addRow(['']); row.height = h; spanAll(row);
      row.getCell(1).fill = solid(CLR.white);
    }

    function addSecHdr(text) {
      const row = ws.addRow([text]); row.height = 20; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
      c.fill = solid(CLR.navy);
      c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
    }

    function setNum(cell, v, fc, bold) {
      cell.value = (v !== null && v !== undefined) ? +v.toFixed(0) : null;
      cell.numFmt = numFmt;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      cell.font = { name:FONT, size:9.5, color:{ argb: fc || CLR.textNavy }, bold: bold || false };
    }

    // ── Title block ──────────────────────────────────────────────────────────
    addTitle(company || 'ميزان المراجعة', 14, CLR.white, CLR.navyDark);
    addTitle('ميزان المراجعة', 12, CLR.white, CLR.navy);
    addTitle(`الفترة: ${from} إلى ${to}  |  ${levelLbl}  |  الفرع: ${branchLbl}${cmp?`  |  مقارنة: ${prevFrom} إلى ${prevTo}`:''}`, 9.5, 'FFAACCE8', CLR.navyDark);
    addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
    addSpacer(4);

    // ── Column header (2 rows) ───────────────────────────────────────────────
    {
      const h1 = ['كود الحساب','اسم الحساب','رصيد أول الفترة','','حركة الفترة','','رصيد آخر الفترة',''];
      if (cmp) h1.push(`مقارنة (${prevFrom}–${prevTo})`,'','%');
      const r1 = ws.addRow(h1); r1.height = 20;
      ws.mergeCells(r1.number,3,r1.number,4);
      ws.mergeCells(r1.number,5,r1.number,6);
      ws.mergeCells(r1.number,7,r1.number,8);
      if (cmp) ws.mergeCells(r1.number,9,r1.number,10);
      r1.eachCell({ includeEmpty:true }, (c,ci) => {
        c.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } };
        c.fill = solid(CLR.navyDark);
        c.alignment = { horizontal: ci<=2 ? 'right' : 'center', vertical:'middle' };
        c.border = { bottom: bdr('thin',CLR.navy) };
      });
    }
    {
      const h2 = ['','','مدين','دائن','مدين','دائن','مدين','دائن'];
      if (cmp) h2.push('مدين','دائن','%');
      const r2 = ws.addRow(h2); r2.height = 18;
      r2.eachCell({ includeEmpty:true }, (c,ci) => {
        c.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } };
        c.fill = solid(CLR.navy);
        c.alignment = { horizontal: ci<=2 ? 'right' : 'center', vertical:'middle' };
        c.border = { bottom: bdr('medium',CLR.navyDark) };
      });
    }

    // ── Data rows ─────────────────────────────────────────────────────────────
    const SEC_LABEL = {'1':'الأصول','2':'الخصوم','3':'حقوق الملكية','4':'المصروفات والتكاليف','5':'الإيرادات'};
    let totODr=0,totOCr=0,totPDr=0,totPCr=0,totCDr=0,totCCr=0,totCmpDr=0,totCmpCr=0;
    let lastSec = null;

    _tbData.forEach(r => {
      const sec = r.code ? r.code[0] : '';
      if (sec !== lastSec && SEC_LABEL[sec]) { addSecHdr(SEC_LABEL[sec]); lastSec = sec; }

      const oDr = r.openBal  > 0 ? r.openBal  : 0;
      const oCr = r.openBal  < 0 ? -r.openBal : 0;
      const cDr = r.closeBal > 0 ? r.closeBal : 0;
      const cCr = r.closeBal < 0 ? -r.closeBal: 0;
      totODr+=oDr; totOCr+=oCr; totPDr+=r.pDebit; totPCr+=r.pCredit; totCDr+=cDr; totCCr+=cCr;

      let pDr=0, pCr=0, pct=null;
      if (cmp) {
        const prevCl = cmpMap.has(r.code) ? (cmpMap.get(r.code)||0) : null;
        pDr = prevCl !== null && prevCl > 0 ? prevCl  : 0;
        pCr = prevCl !== null && prevCl < 0 ? -prevCl : 0;
        totCmpDr += pDr; totCmpCr += pCr;
        const prevNet = prevCl;
        pct = prevNet !== null && Math.abs(prevNet) > 0.004
          ? +((r.closeBal - prevNet) / Math.abs(prevNet) * 100).toFixed(1) : null;
      }

      const row = ws.addRow([r.code, r.name, oDr||null, oCr||null, r.pDebit||null, r.pCredit||null, cDr||null, cCr||null,
        ...(cmp ? [pDr||null, pCr||null, pct] : [])]);
      row.height = 16;
      const hairBdr = { bottom: bdr('hair','FFE8ECF0') };

      row.getCell(1).font = { name:FONT, size:8.5, color:{ argb:CLR.textGray } };
      row.getCell(1).alignment = { horizontal:'left', vertical:'middle' };
      row.getCell(1).border = hairBdr;

      row.getCell(2).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } };
      row.getCell(2).alignment = { horizontal:'right', vertical:'middle', indent:1 };
      row.getCell(2).border = hairBdr;

      for (let ci = 3; ci <= 8; ci++) {
        setNum(row.getCell(ci), row.getCell(ci).value, CLR.textNavy, false);
        row.getCell(ci).border = hairBdr;
      }
      if (cmp) {
        for (let ci = 9; ci <= 10; ci++) {
          setNum(row.getCell(ci), row.getCell(ci).value, CLR.textGray, false);
          row.getCell(ci).border = hairBdr;
          row.getCell(ci).fill  = solid('FFF8FAFE');
        }
        const pctCell = row.getCell(11);
        if (pct !== null) {
          pctCell.value  = pct;
          pctCell.numFmt = '0.0"%"';
          pctCell.font   = { name:FONT, size:9, color:{ argb: pct >= 0 ? CLR.greenText : 'FFCC4444' } };
        }
        pctCell.alignment = { horizontal:'center', vertical:'middle' };
        pctCell.border = hairBdr;
        pctCell.fill   = solid('FFF8FAFE');
      }
    });

    // ── Totals row ────────────────────────────────────────────────────────────
    addSpacer(3);
    {
      const tv = [totODr,totOCr,totPDr,totPCr,totCDr,totCCr];
      const totRow = ws.addRow(['الإجمالي','', ...tv.map(v=>v||null), ...(cmp?[totCmpDr||null,totCmpCr||null,null]:[])]);
      totRow.height = 22;
      const bord = { top:bdr('double',CLR.navyDark), bottom:bdr('medium',CLR.navyDark) };
      totRow.eachCell({ includeEmpty:true }, c => { c.fill = solid(CLR.blueXPale); c.border = bord; });
      totRow.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
      totRow.getCell(1).alignment = { horizontal:'right', vertical:'middle' };
      totRow.getCell(2).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
      for (let ci = 3; ci <= 8; ci++) {
        const cell = totRow.getCell(ci);
        if (cell.value !== null) cell.value = +cell.value.toFixed(0);
        cell.numFmt = numFmt;
        cell.alignment = { horizontal:'left', vertical:'middle' };
        cell.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
      }
      if (cmp) {
        for (let ci = 9; ci <= 10; ci++) {
          const cell = totRow.getCell(ci);
          if (cell.value !== null) cell.value = +cell.value.toFixed(0);
          cell.numFmt = numFmt;
          cell.alignment = { horizontal:'left', vertical:'middle' };
          cell.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.textBlue } };
        }
      }
    }

    // ── Download ──────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ميزان_المراجعة_${from}_${to}.xlsx`; a.click();
    URL.revokeObjectURL(url);

  } catch(err) {
    console.error('TB Excel export error:', err);
    alert('خطأ في التصدير إلى Excel: ' + err.message);
  }
}

// ── HTML export ───────────────────────────────────────────────────────────────
function exportTBHTML() {
  if (!_tbData || !_tbData.length) return;

  const from      = document.getElementById('tb-from').value;
  const to        = document.getElementById('tb-to').value;
  const company   = State.get('companyName') || 'ميزان المراجعة';
  const levelLbl  = ([...document.getElementById('tb-level').options].find(o=>o.selected)||{}).textContent || '';
  const branchLbl = ([...document.getElementById('tb-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const genDate   = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  const rootInfo  = _tbRootFilter ? ` — ${_tbRootFilter.name} (${_tbRootFilter.code})` : '';
  const cmp       = !!(document.getElementById('tb-compare')?.checked && _tbCmpData);
  const cmpMap    = cmp ? new Map(_tbCmpData.map(r => [r.code, r.closeBal])) : null;
  const prevFrom  = from ? `${+from.substring(0,4)-1}${from.substring(4)}` : '';
  const prevTo    = to   ? `${+to.substring(0,4)-1}${to.substring(4)}`     : '';
  const C         = cmp ? 11 : 8;

  const SEC_LABEL = {'1':'الأصول','2':'الخصوم','3':'حقوق الملكية','4':'المصروفات والتكاليف','5':'الإيرادات'};

  let totODr=0,totOCr=0,totPDr=0,totPCr=0,totCDr=0,totCCr=0,totCmpDr=0,totCmpCr=0;
  let lastSec = null;
  let tbRows = '';

  const N  = v => v > 0.004 ? v.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
  const Nf = v => v.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2});

  _tbData.forEach(r => {
    const sec = r.code ? r.code[0] : '';
    if (sec !== lastSec && SEC_LABEL[sec]) {
      tbRows += `<tr class="sec-hdr"><td colspan="${C}">${SEC_LABEL[sec]}</td></tr>`;
      lastSec = sec;
    }
    const oDr = r.openBal  > 0 ? r.openBal  : 0;
    const oCr = r.openBal  < 0 ? -r.openBal : 0;
    const cDr = r.closeBal > 0 ? r.closeBal : 0;
    const cCr = r.closeBal < 0 ? -r.closeBal : 0;
    totODr+=oDr; totOCr+=oCr; totPDr+=r.pDebit; totPCr+=r.pCredit; totCDr+=cDr; totCCr+=cCr;

    let cmpCells = '';
    if (cmp) {
      const prevCl = cmpMap.has(r.code) ? (cmpMap.get(r.code) || 0) : null;
      const pDr    = prevCl !== null && prevCl > 0 ? prevCl  : 0;
      const pCr    = prevCl !== null && prevCl < 0 ? -prevCl : 0;
      totCmpDr += pDr; totCmpCr += pCr;
      const curNet  = r.closeBal || 0;
      const prevNet = prevCl !== null ? prevCl : null;
      let pctHtml   = '';
      if (prevNet !== null && Math.abs(prevNet) > 0.004) {
        const pct = (curNet - prevNet) / Math.abs(prevNet) * 100;
        pctHtml = `<span style="color:${pct > 0 ? '#1a6a2a' : '#8a1a1a'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`;
      } else if (prevNet === null) {
        pctHtml = '<span style="color:#555">جديد</span>';
      }
      cmpCells = `<td class="cmp-dr">${N(pDr)}</td><td class="cmp-cr">${N(pCr)}</td><td class="pct">${pctHtml}</td>`;
    }

    tbRows += `<tr>
      <td class="code">${esc(r.code)}</td>
      <td class="name">${esc(r.name)}</td>
      <td class="dr">${N(oDr)}</td><td class="cr">${N(oCr)}</td>
      <td class="dr">${N(r.pDebit)}</td><td class="cr">${N(r.pCredit)}</td>
      <td class="dr">${N(cDr)}</td><td class="cr">${N(cCr)}</td>
      ${cmpCells}
    </tr>`;
  });

  const balanced = Math.abs(totCDr - totCCr) < 1;
  const cmpTheadExtra = cmp ? `
    <th colspan="2" class="cmp-hdr">رصيد المقارنة<br><small style="font-weight:400">${esc(prevFrom)}–${esc(prevTo)}</small></th>
    <th class="cmp-hdr">التغيير&nbsp;%</th>` : '';
  const cmpTfootExtra = cmp
    ? `<td class="cmp-dr">${Nf(totCmpDr)}</td><td class="cmp-cr">${Nf(totCmpCr)}</td><td class="pct"></td>`
    : '';

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>ميزان المراجعة — ${esc(company)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;font-size:11pt;color:#111;background:#fff}
.page{max-width:${cmp?'1350px':'1100px'};margin:0 auto;padding:20px 24px}
.co-name{font-size:18pt;font-weight:700;text-align:center;color:#0a2040;margin-bottom:4px}
.title{font-size:14pt;font-weight:600;text-align:center;color:#1a4a7a;margin-bottom:2px}
.meta{text-align:center;font-size:9pt;color:#555;margin-bottom:14px;line-height:1.8}
.balance-ok{text-align:center;color:#1a6a2a;font-size:9pt;font-weight:600;margin-bottom:10px;
  padding:4px;border:1px solid #b0d8b0;border-radius:4px;background:#f0fff4}
.balance-fail{text-align:center;color:#8a2a00;font-size:9pt;font-weight:600;margin-bottom:10px;
  padding:4px;border:1px solid #e0b090;border-radius:4px;background:#fff8f0}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
th{background:#0a2040;color:#fff;padding:6px 8px;font-weight:600;white-space:nowrap}
th.num,th.cmp-hdr{text-align:left}
td{padding:5px 8px;border-bottom:1px solid #dde4ec;vertical-align:middle}
td.code{font-family:monospace;font-size:8.5pt;color:#1a4a7a;white-space:nowrap}
td.name{color:#222}
td.dr,td.cmp-dr{text-align:left;color:#0a3060;font-variant-numeric:tabular-nums;white-space:nowrap}
td.cr,td.cmp-cr{text-align:left;color:#7a1010;font-variant-numeric:tabular-nums;white-space:nowrap}
td.pct{text-align:left;white-space:nowrap;font-size:8.5pt}
td.cmp-dr,td.cmp-cr,td.pct{background:#f0f4fa}
tr:nth-child(even) td{background:#f7f9fc}
tr:nth-child(even) td.cmp-dr,tr:nth-child(even) td.cmp-cr,tr:nth-child(even) td.pct{background:#eaeff8}
tr:hover td{background:#eef4ff}
.sec-hdr td{background:#e8eef8;color:#1a3a6a;font-size:8.5pt;font-weight:700;
  letter-spacing:.04em;padding:4px 8px;border-top:2px solid #aabbd0}
.grp-hdr th{background:#1a3a6a;text-align:center;font-size:9pt}
.grp-hdr th.cmp-hdr{background:#243f68}
.sub-hdr th{background:#2a5080;font-size:8.5pt}
.sub-hdr th.cmp-hdr{background:#344e6e}
tfoot td{background:#e8eef8;font-weight:700;border-top:2px solid #0a2040;padding:7px 8px}
tfoot td.dr,tfoot td.cmp-dr{color:#0a3060}
tfoot td.cr,tfoot td.cmp-cr{color:#7a1010}
tfoot td.cmp-dr,tfoot td.cmp-cr,tfoot td.pct{background:#dce4f0}
.footer{margin-top:12px;font-size:8pt;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px}
@media print{body{font-size:9pt}.page{padding:10px}th{background:#0a2040!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="page">
  <div class="co-name">${esc(company)}</div>
  <div class="title">ميزان المراجعة${esc(rootInfo)}</div>
  <div class="meta">
    الفترة: ${from} إلى ${to} &nbsp;|&nbsp; ${esc(levelLbl)} &nbsp;|&nbsp; الفرع: ${esc(branchLbl)}
    ${cmp ? `<br>مقارنة بالفترة: ${esc(prevFrom)} إلى ${esc(prevTo)}` : ''}<br>
    تاريخ الإنشاء: ${genDate}
  </div>
  <div class="${balanced ? 'balance-ok' : 'balance-fail'}">
    ${balanced ? '✓ الميزان متوازن — مجموع المدين = مجموع الدائن' : `⚠ فرق في الميزان: ${Nf(Math.abs(totCDr - totCCr))}`}
  </div>
  <table>
    <thead>
      <tr class="grp-hdr">
        <th rowspan="2" style="min-width:110px">كود الحساب</th>
        <th rowspan="2" style="min-width:200px;text-align:right">اسم الحساب</th>
        <th colspan="2">رصيد أول الفترة</th>
        <th colspan="2">حركة الفترة</th>
        <th colspan="2">رصيد آخر الفترة</th>
        ${cmpTheadExtra}
      </tr>
      <tr class="sub-hdr">
        <th class="num" style="min-width:110px">مدين</th>
        <th class="num" style="min-width:110px">دائن</th>
        <th class="num" style="min-width:110px">مدين</th>
        <th class="num" style="min-width:110px">دائن</th>
        <th class="num" style="min-width:110px">مدين</th>
        <th class="num" style="min-width:110px">دائن</th>
        ${cmp ? `<th class="cmp-hdr" style="min-width:100px">مدين</th><th class="cmp-hdr" style="min-width:100px">دائن</th>` : ''}
      </tr>
    </thead>
    <tbody>${tbRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="text-align:center;font-weight:700">الإجمالي</td>
        <td class="dr">${Nf(totODr)}</td><td class="cr">${Nf(totOCr)}</td>
        <td class="dr">${Nf(totPDr)}</td><td class="cr">${Nf(totPCr)}</td>
        <td class="dr">${Nf(totCDr)}</td><td class="cr">${Nf(totCCr)}</td>
        ${cmpTfootExtra}
      </tr>
    </tfoot>
  </table>
  <div class="footer">تم إنشاؤه من نظام MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `ميزان_المراجعة_${from}_${to}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTBCSV() {
  if (!_tbData) return;
  const hdr = [
    'كود الحساب','اسم الحساب',
    'أول الفترة مدين','أول الفترة دائن',
    'حركة مدين','حركة دائن',
    'آخر الفترة مدين','آخر الفترة دائن',
  ];
  const lines = [hdr.join(',')].concat(_tbData.map(r => [
    r.code,
    `"${(r.name || '').replace(/"/g, '""')}"`,
    r.openBal  > 0 ? r.openBal.toFixed(2)  : '',
    r.openBal  < 0 ? (-r.openBal).toFixed(2) : '',
    r.pDebit   > 0 ? r.pDebit.toFixed(2)   : '',
    r.pCredit  > 0 ? r.pCredit.toFixed(2)  : '',
    r.closeBal > 0 ? r.closeBal.toFixed(2) : '',
    r.closeBal < 0 ? (-r.closeBal).toFixed(2) : '',
  ].join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `trial_balance_${document.getElementById('tb-from').value}_${document.getElementById('tb-to').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── INCOME STATEMENT TAB (قائمة الدخل الشامل — Saudi IFRS/SOCPA) ─────────────

let _isData       = null;
let _isCmpData    = null;   // comparison period (same period, previous year)
let _isInited     = false;
let _isRootFilter = null;
let _isTreeData      = null;
let _isTreeCollapsed = new Set();
let _isTreeMode      = false;

function _isLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function initIncomeStatement() {
  if (_isInited) return;
  _isInited = true;

  const DATA_START_YM = '2025-10';
  const now  = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  function _isApplyQuick(val) {
    const from = document.getElementById('is-from');
    const to   = document.getElementById('is-to');
    if (val === '2025')     { from.value = DATA_START_YM; to.value = '2025-12'; }
    else if (val === '2026-ytd') { from.value = '2026-01'; to.value = curYM; }
    else if (val === 'all') { from.value = DATA_START_YM; to.value = curYM; }
  }

  const quickSel = document.getElementById('is-quick');
  if (quickSel) {
    quickSel.addEventListener('change', () => _isApplyQuick(quickSel.value));
    _isApplyQuick(quickSel.value);
    ['is-from', 'is-to'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => { quickSel.value = ''; });
    });
  }

  document.getElementById('is-run').addEventListener('click', () => {
    _isRootFilter = null; _isUpdateBreadcrumb();
    if (_isTreeMode) fetchIncomeStatementTree(); else fetchIncomeStatement();
  });
  document.getElementById('is-export-excel').addEventListener('click', () => {
    const btn = document.getElementById('is-export-excel');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportISExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 Excel'; });
  });
  document.getElementById('is-export-html').addEventListener('click',  exportISHTML);
  document.getElementById('is-print').addEventListener('click', () => window.print());
  document.getElementById('is-search').addEventListener('input', _renderISRows);
  document.getElementById('is-level').addEventListener('change', _isResetData);
  const cmpCb = document.getElementById('is-compare');
  if (cmpCb) cmpCb.addEventListener('change', () => { _isCmpData = null; if (_isData) fetchIncomeStatement(); });
  const bcBack = document.getElementById('is-bc-back');
  if (bcBack) bcBack.addEventListener('click', () => { _isRootFilter = null; _isUpdateBreadcrumb(); fetchIncomeStatement(); });

  // Tree mode toggle
  const treeBtn   = document.getElementById('is-tree-btn');
  const levelWrap = document.getElementById('is-level-wrap');
  if (treeBtn) {
    treeBtn.addEventListener('click', () => {
      _isTreeMode = !_isTreeMode;
      _isTreeData = null; _isData = null; _isCmpData = null;
      treeBtn.style.background = _isTreeMode ? '#0d3a4a' : '#0d2a3a';
      treeBtn.style.color      = _isTreeMode ? '#a0e8f8' : '#70c8e8';
      treeBtn.style.border     = _isTreeMode ? '1px solid #3a8aaa' : '1px solid #2a5a7a';
      if (levelWrap) levelWrap.style.display = _isTreeMode ? 'none' : '';
      const bc = document.getElementById('is-breadcrumb');
      if (bc) { if (_isTreeMode) bc.classList.add('hidden'); }
      document.getElementById('is-tbody').innerHTML = `<tr><td colspan="5"
        style="text-align:center;padding:52px;color:#3a5a7a">
        اضغط <strong style="color:#5baef0">عرض القائمة</strong> لتحميل العرض الشجري</td></tr>`;
      document.getElementById('is-tfoot').innerHTML = '';
      const badge = document.getElementById('is-net-badge');
      if (badge) badge.style.display = 'none';
    });
  }
}

async function _isPopulateBranches() {
  const db    = State.get('activeDb');
  const brSel = document.getElementById('is-branch');
  if (!brSel || !db) return;
  const prev = brSel.value;
  try {
    const list = await fetch(`/api/branches?db=${encodeURIComponent(db)}`).then(r => r.json());
    while (brSel.options.length > 0) brSel.remove(0);
    const all = document.createElement('option'); all.value = 'ALL'; all.textContent = 'جميع الفروع'; brSel.appendChild(all);
    list.filter(b => b.id !== 0).forEach(b => {
      const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; brSel.appendChild(o);
    });
    const unassigned = document.createElement('option'); unassigned.value = '0'; unassigned.textContent = 'غير محدد / بدون فرع'; brSel.appendChild(unassigned);
    if ([...brSel.options].some(o => o.value === prev)) brSel.value = prev; else brSel.value = 'ALL';
  } catch (_) {}
}

function _isResetData() { _isData = null; _isCmpData = null; _isRootFilter = null; _isUpdateBreadcrumb(); _renderISRows(); }

function _isUpdateBreadcrumb() {
  const el = document.getElementById('is-breadcrumb');
  const pathEl = document.getElementById('is-bc-path');
  if (!el || !pathEl) return;
  if (_isRootFilter) {
    pathEl.innerHTML = `<span style="color:#6a9aca;font-family:monospace;font-size:.78rem">${esc(_isRootFilter.code)}</span> — ${esc(_isRootFilter.name)}`;
    el.classList.remove('hidden'); el.style.display = 'flex';
  } else {
    el.classList.add('hidden'); el.style.display = 'none';
  }
}

async function fetchIncomeStatement() {
  const fromYM = document.getElementById('is-from').value;
  const toYM   = document.getElementById('is-to').value;
  if (!fromYM || !toYM) { alert('الرجاء اختيار الفترة الزمنية'); return; }

  const from   = fromYM + '-01';
  const to     = _isLastDay(toYM);
  const level  = document.getElementById('is-level').value  || '3';
  const brVal  = document.getElementById('is-branch').value;
  const branch = (brVal === 'ALL') ? '0' : (brVal || '0');
  const db     = State.get('activeDb') || 'MekSoftDb1';

  const params = new URLSearchParams({ db, from, to, level, branch });
  if (_isRootFilter) params.set('rootCode', _isRootFilter.code);

  // Comparison period: same month range, previous year
  const prevFromYM = `${+fromYM.substring(0, 4) - 1}${fromYM.substring(4)}`;
  const prevToYM   = `${+toYM.substring(0, 4)   - 1}${toYM.substring(4)}`;
  const prevFrom   = prevFromYM + '-01';
  const prevTo     = _isLastDay(prevToYM);
  const cmpParams  = new URLSearchParams({ db, from: prevFrom, to: prevTo, level, branch });
  if (_isRootFilter) cmpParams.set('rootCode', _isRootFilter.code);
  const wantCmp = !!(document.getElementById('is-compare')?.checked);

  const loadEl   = document.getElementById('is-loading');
  const statusEl = document.getElementById('is-status');
  const tbodyEl  = document.getElementById('is-tbody');
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';

  const labelEl = document.getElementById('is-period-label');
  if (labelEl) labelEl.textContent = wantCmp
    ? `${fromYM} — ${toYM}  |  مقارنة: ${prevFromYM} — ${prevToYM}`
    : `${fromYM} — ${toYM}`;

  try {
    const fetches = [
      fetch(`/api/income-statement?${params}`).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); })),
      wantCmp
        ? fetch(`/api/income-statement?${cmpParams}`).then(r => r.ok ? r.json() : Promise.resolve([]))
        : Promise.resolve(null),
    ];
    const [rows, cmpRows] = await Promise.all(fetches);
    _isData    = rows;
    _isCmpData = cmpRows;
    _renderISRows();
    statusEl.textContent = `${rows.length} حساب${cmpRows ? ' + مقارنة' : ''}`;
  } catch (e) {
    tbodyEl.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#da4a4a">خطأ: ${esc(e.message)}</td></tr>`;
    statusEl.textContent = 'فشل التحميل';
  } finally {
    loadEl.classList.add('hidden');
  }
}

async function fetchIncomeStatementTree() {
  const fromYM = document.getElementById('is-from').value;
  const toYM   = document.getElementById('is-to').value;
  if (!fromYM || !toYM) { alert('الرجاء اختيار الفترة الزمنية'); return; }

  const from   = fromYM + '-01';
  const to     = _isLastDay(toYM);
  const brVal  = document.getElementById('is-branch').value;
  const branch = (brVal === 'ALL') ? '0' : (brVal || '0');
  const db     = State.get('activeDb') || 'MekSoftDb1';
  const params = new URLSearchParams({ db, from, to, branch });

  const loadEl   = document.getElementById('is-loading');
  const statusEl = document.getElementById('is-status');
  const labelEl  = document.getElementById('is-period-label');
  if (labelEl) labelEl.textContent = `${fromYM} — ${toYM}`;
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';

  try {
    const rows = await fetch(`/api/income-statement-tree?${params}`)
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); }));
    _isTreeData = rows;
    // Default: collapse levels >= 4 so the initial view shows 3 levels
    _isTreeCollapsed = new Set(rows.filter(r => r.levelNo >= 4).map(r => r.id));
    _renderISTree();
    statusEl.textContent = `${rows.length} حساب (شجري)`;
  } catch (e) {
    document.getElementById('is-tbody').innerHTML =
      `<tr><td colspan="5" style="text-align:center;padding:32px;color:#da4a4a">خطأ: ${esc(e.message)}</td></tr>`;
    statusEl.textContent = 'فشل التحميل';
  } finally {
    loadEl.classList.add('hidden');
  }
}

function _renderISTree() {
  const tbody   = document.getElementById('is-tbody');
  const tfoot   = document.getElementById('is-tfoot');
  const badgeEl = document.getElementById('is-net-badge');
  const countEl = document.getElementById('is-count');
  if (!tbody || !_isTreeData) return;

  // Build lookup maps
  const nodeMap = new Map(_isTreeData.map(r => [r.id, r]));
  const childMap = new Map();
  _isTreeData.forEach(r => {
    if (r.parentId && nodeMap.has(r.parentId)) {
      if (!childMap.has(r.parentId)) childMap.set(r.parentId, []);
      childMap.get(r.parentId).push(r);
    }
  });
  childMap.forEach(ch => ch.sort((a, b) => a.code.localeCompare(b.code)));

  // Roots: nodes whose parentId is null or not in nodeMap (outside P&L scope)
  const roots = _isTreeData.filter(r => !r.parentId || !nodeMap.has(r.parentId));
  roots.sort((a, b) => a.code.localeCompare(b.code));

  const revRoots = roots.filter(r => r.plType === 'rev');
  const expRoots = roots.filter(r => r.plType === 'exp');

  let totalRevNet = 0, totalRevDr = 0, totalRevCr = 0;
  let totalExpNet = 0, totalExpDr = 0, totalExpCr = 0;
  revRoots.forEach(r => { totalRevNet += r.net; totalRevDr += r.pDebit; totalRevCr += r.pCredit; });
  expRoots.forEach(r => { totalExpNet += r.net; totalExpDr += r.pDebit; totalExpCr += r.pCredit; });

  let html = '';

  function renderNode(node, depth) {
    const children   = childMap.get(node.id) || [];
    const hasKids    = node.hasChildren && children.length > 0;
    const collapsed  = _isTreeCollapsed.has(node.id);
    const isRev      = node.plType === 'rev';
    const indent     = depth * 20;

    const toggleBtn = hasKids
      ? `<span class="is-tree-tog" data-nid="${node.id}"
           style="cursor:pointer;color:${isRev?'#3a8a5a':'#8a4a2a'};margin-left:6px;
                  font-size:.8rem;display:inline-block;min-width:14px;padding:0 3px;
                  user-select:none" title="${collapsed?'توسيع':'طي'}">${collapsed ? '▶' : '▼'}</span>`
      : `<span style="display:inline-block;min-width:14px;margin-left:6px"></span>`;

    const nameColor  = depth === 0 ? (isRev ? '#4ada8e' : '#e0906a')
                     : depth === 1 ? (isRev ? '#3ab870' : '#c07850')
                     : depth === 2 ? '#b8cee0'
                     : '#8090a0';
    const rowBg      = depth === 0 ? (isRev ? 'background:#071510;' : 'background:#120a08;')
                     : depth === 1 ? (isRev ? 'background:#061210;' : 'background:#0e0808;')
                     : '';
    const fw         = depth <= 1 ? 'font-weight:700;' : depth === 2 ? 'font-weight:600;' : '';
    const netColor   = isRev ? (node.net >= 0 ? '#4ada8e' : '#da4a4a') : '#e0a070';
    const netStr     = isRev
      ? (node.net >= 0 ? fmt(node.net, 2) : `<span style="color:#da4a4a">(${fmt(-node.net,2)})</span>`)
      : fmt(node.net, 2);

    html += `<tr class="tb-row" style="${rowBg}">
      <td style="font-family:monospace;color:#506070;font-size:.77rem;white-space:nowrap;
                 padding-right:${4 + indent}px">${esc(node.code)}</td>
      <td style="color:${nameColor};${fw}padding-right:${indent}px">
        ${toggleBtn}${esc(node.name)}
      </td>
      <td class="num ${node.pDebit  ? 'tb-dr' : 'tb-zero'}" style="font-size:.81rem">
        ${node.pDebit  ? fmt(node.pDebit,  2) : '—'}</td>
      <td class="num ${node.pCredit ? 'tb-cr' : 'tb-zero'}" style="font-size:.81rem">
        ${node.pCredit ? fmt(node.pCredit, 2) : '—'}</td>
      <td class="num" style="color:${netColor};${fw}">${netStr}</td>
    </tr>`;

    if (!collapsed) children.forEach(ch => renderNode(ch, depth + 1));
  }

  // Revenue section
  if (revRoots.length) {
    html += `<tr><td colspan="5" style="padding:0">
      <div style="background:linear-gradient(90deg,#061f10,#0a2a15);color:#4ada8e;font-weight:700;
        padding:9px 16px;border-right:4px solid #2ab070;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #1a4a2a;margin-top:4px">◈ الإيرادات</div></td></tr>`;
    revRoots.forEach(r => renderNode(r, 0));
    html += `<tr style="border-top:1px solid #1e4a2a">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px;background:#061a0e;color:#6adc8e">إجمالي الإيرادات</td>
      <td class="num tb-dr" style="background:#061a0e;font-weight:700">${fmt(totalRevDr,2)}</td>
      <td class="num tb-cr" style="background:#061a0e;font-weight:700">${fmt(totalRevCr,2)}</td>
      <td class="num" style="background:#061a0e;font-weight:800;font-size:.94rem;color:#4ada8e">${fmt(totalRevNet,2)}</td>
    </tr>`;
  }

  // Expense section
  if (expRoots.length) {
    html += `<tr><td colspan="5" style="padding:0">
      <div style="background:linear-gradient(90deg,#1f0808,#2a1208);color:#e0906a;font-weight:700;
        padding:9px 16px;border-right:4px solid #b04020;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #4a1a0a;margin-top:6px">◈ المصروفات</div></td></tr>`;
    expRoots.forEach(r => renderNode(r, 0));
    html += `<tr style="border-top:1px solid #4a1a08">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px;background:#120808;color:#e08060">إجمالي المصروفات</td>
      <td class="num tb-dr" style="background:#120808;font-weight:700">${fmt(totalExpDr,2)}</td>
      <td class="num tb-cr" style="background:#120808;font-weight:700">${fmt(totalExpCr,2)}</td>
      <td class="num" style="background:#120808;font-weight:800;font-size:.94rem;color:#e08060">${fmt(totalExpNet,2)}</td>
    </tr>`;
  }

  tbody.innerHTML = html;

  // Delegated click handler for tree expand/collapse toggles
  tbody.onclick = function(e) {
    const tog = e.target.closest('.is-tree-tog');
    if (!tog) return;
    const id = parseInt(tog.dataset.nid, 10);
    if (_isTreeCollapsed.has(id)) _isTreeCollapsed.delete(id);
    else _isTreeCollapsed.add(id);
    _renderISTree();
  };

  // Net profit row
  const netProfit  = totalRevNet - totalExpNet;
  const isProfit   = netProfit >= 0;
  const netColor   = isProfit ? '#4ada8e' : '#da4a4a';
  const netLabel   = isProfit ? 'صافي الربح للفترة' : 'صافي الخسارة للفترة';
  const netDisplay = isProfit ? fmt(netProfit, 2) : '(' + fmt(-netProfit, 2) + ')';

  tfoot.innerHTML = `
    <tr style="border-top:2px solid #2a4a7a">
      <td colspan="2" style="text-align:right;font-weight:800;padding:11px 16px;
        background:#071830;font-size:.96rem;color:${netColor}">${netLabel}</td>
      <td class="num tb-dr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(totalRevDr+totalExpDr,2)}</td>
      <td class="num tb-cr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(totalRevCr+totalExpCr,2)}</td>
      <td class="num" style="background:#071830;font-weight:900;font-size:1.08rem;color:${netColor}">${netDisplay}</td>
    </tr>`;

  if (badgeEl) {
    badgeEl.style.display    = 'block';
    badgeEl.style.background = isProfit ? '#0a3a1a' : '#3a0a0a';
    badgeEl.style.border     = `1px solid ${isProfit ? '#2ab070' : '#b04040'}`;
    badgeEl.style.color      = netColor;
    badgeEl.textContent      = `${netLabel}: ${netDisplay} ر.س`;
  }
  if (countEl) countEl.textContent = `${_isTreeData.length} حساب`;
}

function renderIncomeStatement() {
  initIncomeStatement();
  _isPopulateBranches();
  _isUpdateBreadcrumb();
  if (_isTreeMode) { if (_isTreeData) _renderISTree(); }
  else              { if (_isData)     _renderISRows(); }
}

window._isDrillIn = function(code, name) {
  _isRootFilter = { code, name };
  const levelEl = document.getElementById('is-level');
  if (levelEl) {
    const cur = parseInt(levelEl.value) || 3;
    if (cur < 5) levelEl.value = String(cur + 1);
  }
  _isUpdateBreadcrumb();
  fetchIncomeStatement();
};

function _renderISRows() {
  const tbody   = document.getElementById('is-tbody');
  const tfoot   = document.getElementById('is-tfoot');
  const thead   = document.querySelector('#is-table thead');
  const countEl = document.getElementById('is-count');
  const badgeEl = document.getElementById('is-net-badge');
  if (!tbody) return;

  if (!_isData) {
    tfoot.innerHTML = '';
    if (badgeEl) badgeEl.style.display = 'none';
    return;
  }

  const search = (document.getElementById('is-search').value || '').trim().toLowerCase();
  const rows   = _isData.filter(r =>
    !search || r.code.toLowerCase().includes(search) || r.name.toLowerCase().includes(search)
  );
  if (countEl) countEl.textContent = `${rows.length} حساب`;

  // Comparison state
  const cmp    = !!(document.getElementById('is-compare')?.checked && _isCmpData);
  const cmpMap = cmp ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;
  const C      = cmp ? 7 : 5;   // total column count

  // Comparison period label for thead
  const fromYM    = document.getElementById('is-from').value || '';
  const toYM      = document.getElementById('is-to').value   || '';
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';

  // Rebuild thead to reflect comparison column count
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="min-width:120px">كود الحساب</th>
        <th rowspan="2" style="min-width:220px">البيان</th>
        <th colspan="2" class="tb-col-grp-hdr">نشاط الفترة (${esc(fromYM)}–${esc(toYM)})</th>
        <th rowspan="2" class="num" style="min-width:120px">الصافي</th>
        ${cmp ? `
          <th rowspan="2" class="num" style="min-width:120px;background:#0b1f3a;color:#6a9acb">
            المقارنة<br><small style="font-weight:400;font-size:.7rem;color:#4a7aaa">${esc(prevFromYM)}–${esc(prevToYM)}</small>
          </th>
          <th rowspan="2" class="num" style="min-width:80px;background:#0b1f3a;color:#6a9acb">التغيير&nbsp;%</th>
        ` : ''}
      </tr>
      <tr>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
      </tr>`;
  }

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${C}" style="text-align:center;padding:40px;color:#3a5a7a">لا توجد حسابات تطابق البحث</td></tr>`;
    tfoot.innerHTML = ''; if (badgeEl) badgeEl.style.display = 'none';
    return;
  }

  const canDrill = parseInt(document.getElementById('is-level').value || '3') < 5;
  const revRows  = rows.filter(r => r.plType === 'rev');
  const expRows  = rows.filter(r => r.plType === 'exp');

  // Inline helpers
  const fmtNet = (n, col) => n >= 0 ? `<span style="color:${col}">${fmt(n, 2)}</span>`
                                     : `<span style="color:#da4a4a">(${fmt(-n, 2)})</span>`;
  const cmpCell = (code, isRev) => {
    if (!cmp) return '';
    const v = cmpMap.get(code);
    if (v === undefined) return `<td class="num" style="color:#3a5a7a">—</td><td class="num" style="color:#3a5a7a">—</td>`;
    const col = isRev ? (v >= 0 ? '#3ab870' : '#da4a4a') : '#9090a0';
    const disp = v >= 0 ? fmt(v, 2) : `(${fmt(-v, 2)})`;
    return `<td class="num" style="color:${col}">${disp}</td><td></td>`;
  };
  const cmpNetCell = (cmpV) => {
    if (!cmp) return '';
    if (cmpV === null) return `<td class="num" style="color:#3a5a7a">—</td><td></td>`;
    const col = cmpV >= 0 ? '#3ab870' : '#da4a4a';
    return `<td class="num" style="color:${col}">${cmpV >= 0 ? fmt(cmpV,2) : '('+fmt(-cmpV,2)+')'}</td><td></td>`;
  };
  const changePctCell = (cur, cmpV, bg) => {
    if (!cmp) return '';
    if (cmpV === null || cmpV === undefined) return `<td class="num"${bg ? ` style="background:${bg}"` : ''}><span style="color:#3a5a7a">—</span></td>`;
    if (Math.abs(cmpV) < 0.01) return `<td class="num"${bg ? ` style="background:${bg}"` : ''}><span style="color:#8ab0d0">${cur === 0 ? '—' : 'جديد'}</span></td>`;
    const pct = (cur - cmpV) / Math.abs(cmpV) * 100;
    const col = pct >= 0 ? '#4ada8e' : '#da4a4a';
    return `<td class="num"${bg ? ` style="background:${bg}"` : ''}><span style="color:${col}">${pct >= 0 ? '▲' : '▼'}&nbsp;${Math.abs(pct).toFixed(1)}%</span></td>`;
  };

  let html = '';
  let totalRevNet = 0, totalRevCmpNet = 0;
  let totalExpNet = 0, totalExpCmpNet = 0;
  let totalRevDr  = 0, totalRevCr    = 0;
  let totalExpDr  = 0, totalExpCr    = 0;

  // ── الإيرادات ─────────────────────────────────────────────────────────────
  if (revRows.length > 0) {
    html += `<tr><td colspan="${C}" style="padding:0">
      <div style="background:linear-gradient(90deg,#061f10,#0a2a15);color:#4ada8e;font-weight:700;
        padding:9px 16px;border-right:4px solid #2ab070;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #1a4a2a;margin-top:4px">◈ الإيرادات</div></td></tr>`;

    revRows.forEach(r => {
      totalRevDr  += r.pDebit; totalRevCr  += r.pCredit; totalRevNet += r.net;
      if (cmp) totalRevCmpNet += cmpMap.get(r.code) ?? 0;
      const drA  = canDrill ? `onclick="_isDrillIn('${r.code.replace(/'/g,"\\'")}','${r.name.replace(/'/g,"\\'")}') "` : '';
      const arr  = canDrill ? ` <span style="color:#4ada8e;font-size:.65rem;opacity:.7">▶</span>` : '';
      const cmpV = cmp ? (cmpMap.get(r.code) ?? null) : null;
      html += `<tr class="tb-row" ${drA} style="${canDrill ? 'cursor:pointer' : ''}">
        <td style="font-family:monospace;color:#7090b0;padding-right:28px;font-size:.79rem">${esc(r.code)}</td>
        <td style="color:#c8d8e8">${esc(r.name)}${arr}</td>
        <td class="num ${r.pDebit  ? 'tb-dr' : 'tb-zero'}">${r.pDebit  ? fmt(r.pDebit,  2) : '—'}</td>
        <td class="num ${r.pCredit ? 'tb-cr' : 'tb-zero'}">${r.pCredit ? fmt(r.pCredit, 2) : '—'}</td>
        <td class="num" style="font-weight:600">${fmtNet(r.net, '#4ada8e')}</td>
        ${cmp ? `<td class="num">${cmpV !== null ? fmtNet(cmpV, '#3ab870') : '—'}</td>${changePctCell(r.net, cmpV)}` : ''}
      </tr>`;
    });

    const revCmpTotal = cmp ? totalRevCmpNet : null;
    html += `<tr style="border-top:1px solid #1e4a2a">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px 7px 4px;background:#061a0e;color:#6adc8e">إجمالي الإيرادات</td>
      <td class="num tb-dr" style="background:#061a0e;font-weight:700">${fmt(totalRevDr,2)}</td>
      <td class="num tb-cr" style="background:#061a0e;font-weight:700">${fmt(totalRevCr,2)}</td>
      <td class="num" style="background:#061a0e;font-weight:800;font-size:.94rem">${fmtNet(totalRevNet,'#4ada8e')}</td>
      ${cmp ? `<td class="num" style="background:#061a0e;font-weight:700">${fmtNet(revCmpTotal,'#3ab870')}</td>${changePctCell(totalRevNet, revCmpTotal,'#061a0e')}` : ''}
    </tr>`;
  }

  // ── المصروفات ─────────────────────────────────────────────────────────────
  if (expRows.length > 0) {
    html += `<tr><td colspan="${C}" style="padding:0">
      <div style="background:linear-gradient(90deg,#1f0808,#2a1208);color:#e0906a;font-weight:700;
        padding:9px 16px;border-right:4px solid #b04020;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #4a1a0a;margin-top:6px">◈ المصروفات</div></td></tr>`;

    // Group by parent
    const expGroups = new Map();
    expRows.forEach(r => {
      const key = r.parentCode || r.code.substring(0, 2);
      if (!expGroups.has(key)) expGroups.set(key, { label: r.parentName || key, rows: [] });
      expGroups.get(key).rows.push(r);
    });
    const sortedGrps = [...expGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const multi      = sortedGrps.length > 1;

    sortedGrps.forEach(([, grp]) => {
      let grpDr = 0, grpCr = 0, grpNet = 0, grpCmpNet = 0;

      if (multi) {
        html += `<tr><td colspan="${C}" style="padding:5px 16px 3px 4px;background:#150808;
          color:#c09070;font-size:.81rem;font-weight:600;border-right:3px solid #5a2a10;
          border-top:1px solid #2a1208">${esc(grp.label)}</td></tr>`;
      }

      grp.rows.forEach(r => {
        grpDr += r.pDebit; grpCr += r.pCredit; grpNet += r.net;
        const cmpV = cmp ? (cmpMap.get(r.code) ?? null) : null;
        if (cmp && cmpV !== null) grpCmpNet += cmpV;
        const drA = canDrill ? `onclick="_isDrillIn('${r.code.replace(/'/g,"\\'")}','${r.name.replace(/'/g,"\\'")}') "` : '';
        const arr = canDrill ? ` <span style="color:#da8a5a;font-size:.65rem;opacity:.7">▶</span>` : '';
        html += `<tr class="tb-row" ${drA} style="${canDrill ? 'cursor:pointer' : ''}">
          <td style="font-family:monospace;color:#7090b0;padding-right:${multi?38:28}px;font-size:.79rem">${esc(r.code)}</td>
          <td style="color:#c8d8e8">${esc(r.name)}${arr}</td>
          <td class="num ${r.pDebit  ? 'tb-dr' : 'tb-zero'}">${r.pDebit  ? fmt(r.pDebit,  2) : '—'}</td>
          <td class="num ${r.pCredit ? 'tb-cr' : 'tb-zero'}">${r.pCredit ? fmt(r.pCredit, 2) : '—'}</td>
          <td class="num" style="font-weight:600;color:#e0a070">${fmt(r.net, 2)}</td>
          ${cmp ? `<td class="num" style="color:#9090a0">${cmpV !== null ? fmt(cmpV,2) : '—'}</td>${changePctCell(r.net, cmpV)}` : ''}
        </tr>`;
      });

      totalExpDr += grpDr; totalExpCr += grpCr; totalExpNet += grpNet;
      if (cmp) totalExpCmpNet += grpCmpNet;

      if (multi) {
        html += `<tr>
          <td colspan="2" style="text-align:right;font-weight:600;padding:5px 16px 5px 4px;
            background:#100606;border-top:1px dashed #3a1a08;color:#c09070;font-size:.8rem">إجمالي ${esc(grp.label)}</td>
          <td class="num tb-dr" style="background:#100606;border-top:1px dashed #3a1a08;font-size:.8rem;font-weight:600">${fmt(grpDr,2)}</td>
          <td class="num tb-cr" style="background:#100606;border-top:1px dashed #3a1a08;font-size:.8rem;font-weight:600">${fmt(grpCr,2)}</td>
          <td class="num" style="background:#100606;border-top:1px dashed #3a1a08;font-weight:700;color:#e0a070;font-size:.8rem">${fmt(grpNet,2)}</td>
          ${cmp ? `<td class="num" style="background:#100606;border-top:1px dashed #3a1a08;color:#9090a0;font-size:.8rem">${fmt(grpCmpNet,2)}</td>${changePctCell(grpNet,grpCmpNet,'#100606')}` : ''}
        </tr>`;
      }
    });

    html += `<tr style="border-top:1px solid #4a1a08">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px 7px 4px;background:#120808;color:#e08060">إجمالي المصروفات</td>
      <td class="num tb-dr" style="background:#120808;font-weight:700">${fmt(totalExpDr,2)}</td>
      <td class="num tb-cr" style="background:#120808;font-weight:700">${fmt(totalExpCr,2)}</td>
      <td class="num" style="background:#120808;font-weight:800;font-size:.94rem;color:#e08060">${fmt(totalExpNet,2)}</td>
      ${cmp ? `<td class="num" style="background:#120808;font-weight:700;color:#9090a0">${fmt(totalExpCmpNet,2)}</td>${changePctCell(totalExpNet,totalExpCmpNet,'#120808')}` : ''}
    </tr>`;
  }

  tbody.innerHTML = html;

  // ── صافي الربح / الخسارة ─────────────────────────────────────────────────
  const netProfit    = totalRevNet  - totalExpNet;
  const netCmpProfit = cmp ? (totalRevCmpNet - totalExpCmpNet) : null;
  const isProfit     = netProfit >= 0;
  const netColor     = isProfit ? '#4ada8e' : '#da4a4a';
  const netLabel     = isProfit ? 'صافي الربح للفترة' : 'صافي الخسارة للفترة';
  const netDisplay   = isProfit ? fmt(netProfit, 2) : '(' + fmt(-netProfit, 2) + ')';
  const grandDr      = totalRevDr + totalExpDr;
  const grandCr      = totalRevCr + totalExpCr;

  tfoot.innerHTML = `
    <tr style="border-top:2px solid #2a4a7a">
      <td colspan="2" style="text-align:right;font-weight:800;padding:11px 16px;background:#071830;font-size:.96rem;color:${netColor}">${netLabel}</td>
      <td class="num tb-dr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(grandDr,2)}</td>
      <td class="num tb-cr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(grandCr,2)}</td>
      <td class="num" style="background:#071830;font-weight:900;font-size:1.08rem;color:${netColor}">${netDisplay}</td>
      ${cmp ? (() => {
        const cmpIsProfit = netCmpProfit >= 0;
        const cmpCol      = cmpIsProfit ? '#3ab870' : '#da4a4a';
        const cmpDisp     = cmpIsProfit ? fmt(netCmpProfit,2) : '('+fmt(-netCmpProfit,2)+')';
        return `<td class="num" style="background:#071830;font-weight:800;font-size:1rem;color:${cmpCol}">${cmpDisp}</td>${changePctCell(netProfit, netCmpProfit,'#071830')}`;
      })() : ''}
    </tr>`;

  if (badgeEl) {
    badgeEl.style.display    = 'block';
    badgeEl.style.background = isProfit ? '#0a3a1a' : '#3a0a0a';
    badgeEl.style.border     = `1px solid ${isProfit ? '#2ab070' : '#b04040'}`;
    badgeEl.style.color      = netColor;
    badgeEl.textContent      = `${netLabel}: ${netDisplay} ر.س${
      cmp && netCmpProfit !== null
        ? `  |  مقارنة: ${netCmpProfit >= 0 ? fmt(netCmpProfit,2) : '('+fmt(-netCmpProfit,2)+')'} ر.س`
        : ''}`;
  }
}

async function exportISExcel() {
  if (!_isData || !_isData.length) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const fromYM     = document.getElementById('is-from').value || '';
  const toYM       = document.getElementById('is-to').value   || '';
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';
  const lvlTxt  = ([...document.getElementById('is-level').options].find(o=>o.selected)||{}).textContent || '';
  const brTxt   = ([...document.getElementById('is-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const company = State.get('companyName') || '';
  const withCmp = !!(document.getElementById('is-compare')?.checked && _isCmpData);
  const cmpMap  = withCmp ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;
  const genDate = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});

  const revRows      = _isData.filter(r => r.plType === 'rev');
  const expRows      = _isData.filter(r => r.plType === 'exp');
  const totalRevNet  = revRows.reduce((s,r) => s + r.net, 0);
  const totalExpNet  = expRows.reduce((s,r) => s + r.net, 0);
  const netProfit    = totalRevNet - totalExpNet;
  const cmpRevNet    = withCmp ? revRows.reduce((s,r) => s + (cmpMap.get(r.code)??0), 0) : null;
  const cmpExpNet    = withCmp ? expRows.reduce((s,r) => s + (cmpMap.get(r.code)??0), 0) : null;
  const netCmpProfit = withCmp ? cmpRevNet - cmpExpNet : null;

  try {
    const NC      = withCmp ? 7 : 5;
    const FONT    = 'Calibri';
    const numFmt  = '#,##0;[Red](#,##0);"-"';
    const numFmt0 = '#,##0;#,##0;"-"';
    const CLR = {
      navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
      bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
      textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
      textLight:'FF6A8AAA', textGray:'FF888888',
      greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
    };
    const solid = (a) => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
    const bdr   = (s,a) => ({ style:s, color:{ argb:a } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
    const ws = wb.addWorksheet('قائمة الدخل الشامل', { views:[{ rightToLeft:true }] });
    ws.pageSetup.paperSize   = 9;
    ws.pageSetup.orientation = 'portrait';
    ws.pageSetup.fitToPage   = true;
    ws.pageSetup.fitToWidth  = 1;
    ws.pageSetup.margins = { left:0.6, right:0.5, top:0.75, bottom:0.75, header:0.3, footer:0.3 };

    ws.columns = withCmp
      ? [{width:14},{width:52},{width:16},{width:16},{width:20},{width:20},{width:12}]
      : [{width:14},{width:52},{width:16},{width:16},{width:20}];

    const spanAll = (row) => ws.mergeCells(row.number, 1, row.number, NC);

    function addTitle(text, sz, fc, bg) {
      const row = ws.addRow([text]); row.height = sz > 12 ? 32 : 24; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
      c.fill = solid(bg); c.alignment = { horizontal:'center', vertical:'middle' };
    }

    function addSpacer(h=5) {
      const row = ws.addRow(['']); row.height = h; spanAll(row);
      row.getCell(1).fill = solid(CLR.white);
    }

    function addSecHdr(text) {
      const row = ws.addRow([text]); row.height = 20; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
      c.fill = solid(CLR.navy);
      c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
    }

    function addSubGrpHdr(text) {
      const row = ws.addRow([text]); row.height = 18; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:9.5, bold:true, italic:true, color:{ argb:CLR.textBlue } };
      c.fill = solid(CLR.blueLight);
      c.alignment = { horizontal:'right', vertical:'middle', indent:2 };
      c.border = { top:bdr('thin','FFC0CFE8'), bottom:bdr('hair','FFD0D8E8') };
    }

    function setNum(cell, v, fmt, fc, bold) {
      cell.value = (v !== null && v !== undefined) ? +v.toFixed(0) : null;
      cell.numFmt = fmt || numFmt;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      cell.font = { name:FONT, size:9.5, color:{ argb: fc || CLR.textNavy }, bold: bold || false };
    }

    function addItem(r, cmpV) {
      const row = ws.addRow([r.code, r.name, r.pDebit||null, r.pCredit||null, r.net||null,
        ...(withCmp ? [cmpV??null, null] : [])]);
      row.height = 17;
      const hairBdr = { bottom: bdr('hair','FFE8ECF0') };

      row.getCell(1).font = { name:FONT, size:8.5, color:{ argb:CLR.textGray } };
      row.getCell(1).alignment = { horizontal:'left', vertical:'middle' };
      row.getCell(1).border = hairBdr;

      row.getCell(2).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } };
      row.getCell(2).alignment = { horizontal:'right', vertical:'middle', indent:2 };
      row.getCell(2).border = hairBdr;

      setNum(row.getCell(3), r.pDebit,  numFmt0, CLR.textNavy, false);
      setNum(row.getCell(4), r.pCredit, numFmt0, CLR.textNavy, false);
      setNum(row.getCell(5), r.net,     numFmt,  CLR.textNavy, false);
      for (let ci=3;ci<=5;ci++) row.getCell(ci).border = hairBdr;

      if (withCmp) {
        setNum(row.getCell(6), cmpV??null, numFmt, CLR.textGray, false);
        row.getCell(6).border = hairBdr; row.getCell(6).fill = solid('FFF8FAFE');
        const pct = (cmpV !== null && cmpV !== undefined && Math.abs(cmpV) > 0.01)
          ? +((r.net - cmpV) / Math.abs(cmpV) * 100).toFixed(1) : null;
        if (pct !== null) {
          row.getCell(7).value  = pct;
          row.getCell(7).numFmt = '0.0"%"';
          row.getCell(7).font   = { name:FONT, size:9, color:{ argb: pct >= 0 ? CLR.greenText : 'FFCC4444' } };
        }
        row.getCell(7).alignment = { horizontal:'center', vertical:'middle' };
        row.getCell(7).border = hairBdr; row.getCell(7).fill = solid('FFF8FAFE');
      }
    }

    function addSubTot(label, dr, cr, net, cmpNet) {
      const row = ws.addRow([label,'',dr||null,cr||null,net||null,
        ...(withCmp?[cmpNet??null,null]:[])]);
      row.height = 18;
      const topBot = { top:bdr('thin','FFC0CFE8'), bottom:bdr('thin','FFB0C4DC') };
      row.eachCell({ includeEmpty:true }, c => { c.fill = solid(CLR.bluePale); c.border = topBot; });
      row.getCell(1).font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.textNavy } };
      row.getCell(1).alignment = { horizontal:'right', vertical:'middle' };
      row.getCell(2).font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.textNavy } };
      setNum(row.getCell(3), dr,  numFmt0, CLR.textNavy, true);
      setNum(row.getCell(4), cr,  numFmt0, CLR.textNavy, true);
      setNum(row.getCell(5), net, numFmt,  CLR.textNavy, true);
      if (withCmp) {
        setNum(row.getCell(6), cmpNet??null, numFmt, CLR.textGray, false);
        row.getCell(6).fill = solid('FFF0F4FA');
        if (cmpNet !== null && Math.abs(cmpNet) > 0.01) {
          row.getCell(7).value  = +((net - cmpNet) / Math.abs(cmpNet) * 100).toFixed(1);
          row.getCell(7).numFmt = '0.0"%"';
          row.getCell(7).font   = { name:FONT, size:9, bold:true, color:{ argb:CLR.textGray } };
        }
        row.getCell(7).alignment = { horizontal:'center', vertical:'middle' };
        row.getCell(7).fill = solid('FFF0F4FA');
      }
    }

    // ── Title block ──────────────────────────────────────────────────────────
    addTitle(company || 'قائمة الدخل الشامل', 14, CLR.white, CLR.navyDark);
    addTitle('قائمة الدخل الشامل', 12, CLR.white, CLR.navy);
    addTitle(`الفترة: ${fromYM} إلى ${toYM}${withCmp?`  |  مقارنة: ${prevFromYM} إلى ${prevToYM}`:''} | ${lvlTxt} | الفرع: ${brTxt}`, 9.5, 'FFAACCE8', CLR.navyDark);
    addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
    addSpacer(4);

    // ── Column header ────────────────────────────────────────────────────────
    {
      const hdr = ['كود الحساب','البيان','مدين الفترة','دائن الفترة','الصافي (ر.س)'];
      if (withCmp) hdr.push(`صافي المقارنة (${prevFromYM}–${prevToYM})`, 'التغيير %');
      const row = ws.addRow(hdr); row.height = 22;
      row.eachCell({ includeEmpty:true }, (c,ci) => {
        c.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
        c.fill = solid(CLR.navy);
        c.alignment = { horizontal: ci<=2 ? 'right' : 'center', vertical:'middle' };
        c.border = { bottom: bdr('medium',CLR.navyDark) };
      });
    }

    // ── Revenue section ──────────────────────────────────────────────────────
    if (revRows.length > 0) {
      addSpacer(4);
      addSecHdr('الإيرادات');
      revRows.forEach(r => addItem(r, withCmp ? (cmpMap.get(r.code)??null) : null));
      const rDr = revRows.reduce((s,r)=>s+r.pDebit,0);
      const rCr = revRows.reduce((s,r)=>s+r.pCredit,0);
      addSubTot('إجمالي الإيرادات', rDr, rCr, totalRevNet, cmpRevNet);
    }

    // ── Expenses section ─────────────────────────────────────────────────────
    if (expRows.length > 0) {
      addSpacer(4);
      addSecHdr('المصروفات والتكاليف');
      const expGroups = new Map();
      expRows.forEach(r => {
        const k = r.parentCode || r.code.substring(0,2);
        if (!expGroups.has(k)) expGroups.set(k, { label: r.parentName||k, rows:[] });
        expGroups.get(k).rows.push(r);
      });
      const multi = expGroups.size > 1;
      [...expGroups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([,grp]) => {
        if (multi) addSubGrpHdr(grp.label);
        grp.rows.forEach(r => addItem(r, withCmp ? (cmpMap.get(r.code)??null) : null));
        if (multi) {
          const gDr  = grp.rows.reduce((s,r)=>s+r.pDebit,0);
          const gCr  = grp.rows.reduce((s,r)=>s+r.pCredit,0);
          const gNet = grp.rows.reduce((s,r)=>s+r.net,0);
          const gCmp = withCmp ? grp.rows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
          addSubTot(`إجمالي ${grp.label}`, gDr, gCr, gNet, gCmp);
        }
      });
      const eDr = expRows.reduce((s,r)=>s+r.pDebit,0);
      const eCr = expRows.reduce((s,r)=>s+r.pCredit,0);
      addSubTot('إجمالي المصروفات', eDr, eCr, totalExpNet, cmpExpNet);
    }

    // ── Net profit grand row ─────────────────────────────────────────────────
    addSpacer();
    {
      const isProfit = netProfit >= 0;
      const netLabel = isProfit ? 'صافي الربح للفترة' : 'صافي الخسارة للفترة';
      const netColor = isProfit ? CLR.greenText : 'FF8A2A00';
      const netBg    = isProfit ? CLR.greenBg   : 'FFFFF4F4';
      const row = ws.addRow([netLabel,'','','',netProfit||null,
        ...(withCmp?[netCmpProfit??null,null]:[])]);
      row.height = 24;
      const bord = { top:bdr('double',CLR.navyDark), bottom:bdr('medium',CLR.navyDark) };
      row.eachCell({ includeEmpty:true }, c => { c.fill = solid(netBg); c.border = bord; });
      row.getCell(1).font = { name:FONT, size:11, bold:true, color:{ argb:netColor } };
      row.getCell(1).alignment = { horizontal:'right', vertical:'middle' };
      setNum(row.getCell(5), netProfit, numFmt, netColor, true);
      row.getCell(5).font = { name:FONT, size:11, bold:true, color:{ argb:netColor } };
      if (withCmp) {
        setNum(row.getCell(6), netCmpProfit??null, numFmt, CLR.textBlue, true);
        row.getCell(6).font = { name:FONT, size:11, bold:true, color:{ argb:CLR.textBlue } };
        row.getCell(6).fill = solid('FFF0F4FA');
        if (netCmpProfit !== null && Math.abs(netCmpProfit) > 0.01) {
          row.getCell(7).value  = +((netProfit - netCmpProfit) / Math.abs(netCmpProfit) * 100).toFixed(1);
          row.getCell(7).numFmt = '0.0"%"';
          row.getCell(7).font   = { name:FONT, size:10, bold:true, color:{ argb:netColor } };
        }
        row.getCell(7).alignment = { horizontal:'center', vertical:'middle' };
        row.getCell(7).fill = solid('FFF0F4FA');
      }
    }

    // ── Download ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `قائمة_الدخل_${fromYM}_${toYM}.xlsx`; a.click();
    URL.revokeObjectURL(url);

  } catch(err) {
    console.error('IS Excel export error:', err);
    alert('خطأ في التصدير إلى Excel: ' + err.message);
  }
}

function exportISHTML() {
  if (!_isData || !_isData.length) return;

  const fromYM = document.getElementById('is-from').value || '';
  const toYM   = document.getElementById('is-to').value   || '';
  const lvlTxt = ([...document.getElementById('is-level').options].find(o=>o.selected)||{}).textContent || '';
  const brTxt  = ([...document.getElementById('is-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const db     = State.get('activeDb') || '';

  const withCmp    = !!(document.getElementById('is-compare')?.checked && _isCmpData);
  const cmpMap     = withCmp ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';

  const revRows     = _isData.filter(r => r.plType === 'rev');
  const expRows     = _isData.filter(r => r.plType === 'exp');
  const totalRevNet = revRows.reduce((s,r)=>s+r.net,0);
  const totalExpNet = expRows.reduce((s,r)=>s+r.net,0);
  const netProfit   = totalRevNet - totalExpNet;
  const isProfit    = netProfit >= 0;
  const cmpRevNet   = withCmp ? revRows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
  const cmpExpNet   = withCmp ? expRows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
  const netCmpProfit = withCmp ? cmpRevNet - cmpExpNet : null;

  const expGroups = new Map();
  expRows.forEach(r => {
    const k = r.parentCode || r.code.substring(0,2);
    if (!expGroups.has(k)) expGroups.set(k, { label: r.parentName || k, rows: [] });
    expGroups.get(k).rows.push(r);
  });
  const sortedGrps = [...expGroups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));

  function fmtN(n) { return (+n||0).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function fmtNet(n,isRev) {
    if (isRev) return n >= 0 ? `<span style="color:#1a8a3a">${fmtN(n)}</span>` : `<span style="color:#cc3333">(${fmtN(-n)})</span>`;
    return fmtN(n);
  }
  function pctHtml(cur, cmpV) {
    if (!withCmp) return '';
    if (cmpV === null || cmpV === undefined) return '<td class="num" style="color:#aaa">—</td>';
    if (Math.abs(cmpV) < 0.01) return `<td class="num" style="color:#6a9ab0">${cur===0?'—':'جديد'}</td>`;
    const p = (cur - cmpV) / Math.abs(cmpV) * 100;
    return `<td class="num" style="color:${p>=0?'#1a7a3a':'#cc3333'}">${p>=0?'▲':'▼'}&nbsp;${Math.abs(p).toFixed(1)}%</td>`;
  }
  const C = withCmp ? 7 : 5;

  function rowsHtml(arr, indent, isRev) {
    return arr.map(r => {
      const cmpV = withCmp ? (cmpMap.get(r.code) ?? null) : null;
      const cmpCell = withCmp ? `<td class="num" style="color:${cmpV!==null?(cmpV>=0?'#1a7a3a':'#cc3333'):'#aaa'}">${cmpV!==null?fmtN(cmpV):'—'}</td>${pctHtml(r.net,cmpV)}` : '';
      return `<tr>
        <td style="font-family:monospace;color:#555;font-size:.78rem;padding-right:${indent}px">${r.code}</td>
        <td>${r.name}</td>
        <td class="num">${r.pDebit ? fmtN(r.pDebit) : '—'}</td>
        <td class="num">${r.pCredit ? fmtN(r.pCredit) : '—'}</td>
        <td class="num">${fmtNet(r.net, isRev)}</td>
        ${cmpCell}
      </tr>`;
    }).join('');
  }

  let bodyHtml = '';
  if (revRows.length > 0) {
    const rDr = revRows.reduce((s,r)=>s+r.pDebit,0);
    const rCr = revRows.reduce((s,r)=>s+r.pCredit,0);
    const cmpSubtotalCells = withCmp
      ? `<td class="num" style="color:${cmpRevNet>=0?'#1a7a3a':'#cc3333'}">${fmtN(cmpRevNet)}</td>${pctHtml(totalRevNet,cmpRevNet)}`
      : '';
    bodyHtml += `
      <tr class="sec-hdr rev"><td colspan="${C}">الإيرادات</td></tr>
      ${rowsHtml(revRows, 20, true)}
      <tr class="subtotal">
        <td colspan="2" class="lbl">إجمالي الإيرادات</td>
        <td class="num">${fmtN(rDr)}</td><td class="num">${fmtN(rCr)}</td>
        <td class="num" style="color:${totalRevNet>=0?'#1a8a3a':'#cc3333'}">${totalRevNet>=0?fmtN(totalRevNet):'('+fmtN(-totalRevNet)+')'}</td>
        ${cmpSubtotalCells}
      </tr>`;
  }
  if (expRows.length > 0) {
    bodyHtml += `<tr class="sec-hdr exp"><td colspan="${C}">المصروفات</td></tr>`;
    const multi = sortedGrps.length > 1;
    sortedGrps.forEach(([,grp]) => {
      const gDr  = grp.rows.reduce((s,r)=>s+r.pDebit,0);
      const gCr  = grp.rows.reduce((s,r)=>s+r.pCredit,0);
      const gNet = grp.rows.reduce((s,r)=>s+r.net,0);
      const gCmp = withCmp ? grp.rows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
      if (multi) bodyHtml += `<tr class="grp-hdr"><td colspan="${C}">${grp.label}</td></tr>`;
      bodyHtml += rowsHtml(grp.rows, multi ? 32 : 20, false);
      if (multi) {
        const cmpGrpCells = withCmp ? `<td class="num" style="color:#666">${fmtN(gCmp)}</td>${pctHtml(gNet,gCmp)}` : '';
        bodyHtml += `<tr class="grp-subtotal"><td colspan="2" class="lbl">إجمالي ${grp.label}</td><td class="num">${fmtN(gDr)}</td><td class="num">${fmtN(gCr)}</td><td class="num">${fmtN(gNet)}</td>${cmpGrpCells}</tr>`;
      }
    });
    const eDr = expRows.reduce((s,r)=>s+r.pDebit,0);
    const eCr = expRows.reduce((s,r)=>s+r.pCredit,0);
    const cmpExpCells = withCmp ? `<td class="num" style="color:#666">${fmtN(cmpExpNet)}</td>${pctHtml(totalExpNet,cmpExpNet)}` : '';
    bodyHtml += `<tr class="subtotal"><td colspan="2" class="lbl">إجمالي المصروفات</td><td class="num">${fmtN(eDr)}</td><td class="num">${fmtN(eCr)}</td><td class="num">${fmtN(totalExpNet)}</td>${cmpExpCells}</tr>`;
  }

  const grandDr = revRows.reduce((s,r)=>s+r.pDebit,0)+expRows.reduce((s,r)=>s+r.pDebit,0);
  const grandCr = revRows.reduce((s,r)=>s+r.pCredit,0)+expRows.reduce((s,r)=>s+r.pCredit,0);
  const cmpFootCells = withCmp
    ? `<td class="num" style="background:#f0f4ff;font-weight:800;font-size:1rem;color:${netCmpProfit>=0?'#1a5a2a':'#7a1a1a'}">${netCmpProfit>=0?fmtN(netCmpProfit):'('+fmtN(-netCmpProfit)+')'}</td>${pctHtml(netProfit,netCmpProfit)}`
    : '';
  const cmpColsHdr = withCmp ? `<th class="num" style="background:#2a4a7a;min-width:120px">صافي المقارنة<br><small style="font-weight:400;font-size:.72rem">${prevFromYM}–${prevToYM}</small></th><th class="num" style="background:#2a4a7a;min-width:80px">التغيير%</th>` : '';

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<title>قائمة الدخل الشامل — ${db}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:13px;color:#1a2a3a;direction:rtl;background:#f8f9fa;padding:20px}
.cover{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:20px 28px;margin-bottom:18px}
.cover h1{font-size:1.2rem;color:#1a3a5a;margin-bottom:4px}
.cover .meta{font-size:.82rem;color:#555;line-height:1.9}
.cover .meta strong{color:#1a3a5a}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dee2e6;border-radius:6px;overflow:hidden}
th{background:#1a3a5a;color:#fff;padding:9px 12px;text-align:right;font-weight:600;font-size:.82rem}
td{padding:7px 12px;border-bottom:1px solid #f0f2f4;font-size:.82rem;color:#2a3a4a}
.num{text-align:left;font-variant-numeric:tabular-nums;font-family:monospace}
.sec-hdr td{font-weight:800;font-size:.86rem;padding:8px 12px;letter-spacing:.3px}
.sec-hdr.rev td{background:#e6f9ee;color:#1a5a2a;border-right:4px solid #2ab070}
.sec-hdr.exp td{background:#fdf0e8;color:#7a2a10;border-right:4px solid #c05020}
.grp-hdr td{background:#faf5f0;color:#7a4a20;font-weight:600;font-size:.8rem;padding:5px 12px 5px 12px;padding-right:24px;border-right:3px solid #d08050}
.subtotal td{background:#f0f5ff;font-weight:700;border-top:1px solid #bcd;border-bottom:2px solid #bcd}
.grp-subtotal td{background:#fdf5ee;font-weight:600;border-top:1px dashed #dca}
.subtotal .lbl{text-align:right}
.net-banner{margin-top:16px;padding:12px 18px;border-radius:6px;font-weight:700;font-size:1rem;text-align:center}
.net-profit{background:#e6f9ee;border:1px solid #2ab070;color:#1a5a2a}
.net-loss{background:#fde8e8;border:1px solid #b04040;color:#7a1a1a}
.foot{margin-top:14px;font-size:.73rem;color:#888;text-align:center}
@media print{body{padding:10px;background:#fff}.cover{border:none;padding:10px 0}.foot{display:none}}
</style></head>
<body>
<div class="cover">
  <h1>قائمة الدخل الشامل${withCmp?' — مع فترة المقارنة':''}</h1>
  <div class="meta">
    <strong>الشركة:</strong> ${esc(db)}<br>
    <strong>الفترة الحالية:</strong> من ${fromYM} إلى ${toYM}<br>
    ${withCmp ? `<strong>فترة المقارنة:</strong> من ${prevFromYM} إلى ${prevToYM}<br>` : ''}
    <strong>مستوى التفصيل:</strong> ${esc(lvlTxt)}<br>
    <strong>الفرع:</strong> ${esc(brTxt)}<br>
    <strong>تاريخ الإصدار:</strong> ${new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'})}
  </div>
</div>
<table>
<thead>
  <tr>
    <th style="min-width:110px">كود الحساب</th>
    <th style="min-width:200px">البيان</th>
    <th class="num" style="min-width:110px">مدين الفترة</th>
    <th class="num" style="min-width:110px">دائن الفترة</th>
    <th class="num" style="min-width:120px">الصافي (ر.س)</th>
    ${cmpColsHdr}
  </tr>
</thead>
<tbody>
${bodyHtml}
</tbody>
<tfoot>
  <tr style="border-top:2px solid #1a3a5a">
    <td colspan="2" style="font-weight:900;font-size:.98rem;text-align:right;padding:10px 12px;background:#f0f4ff;color:${isProfit?'#1a5a2a':'#7a1a1a'}">${isProfit?'صافي الربح للفترة':'صافي الخسارة للفترة'}</td>
    <td class="num" style="background:#f0f4ff;font-weight:700">${fmtN(grandDr)}</td>
    <td class="num" style="background:#f0f4ff;font-weight:700">${fmtN(grandCr)}</td>
    <td class="num" style="background:#f0f4ff;font-weight:900;font-size:1.02rem;color:${isProfit?'#1a5a2a':'#7a1a1a'}">${isProfit?fmtN(netProfit):'('+fmtN(-netProfit)+')'}</td>
    ${cmpFootCells}
  </tr>
</tfoot>
</table>
<div class="net-banner ${isProfit?'net-profit':'net-loss'}">
  الفترة الحالية — ${isProfit?'صافي الربح':'صافي الخسارة'}: ${isProfit?fmtN(netProfit):'('+fmtN(-netProfit)+')'} ر.س
  ${withCmp && netCmpProfit!==null ? `&nbsp;&nbsp;|&nbsp;&nbsp; فترة المقارنة: ${netCmpProfit>=0?fmtN(netCmpProfit):'('+fmtN(-netCmpProfit)+')'} ر.س` : ''}
</div>
<div class="foot">تم إنشاء هذا التقرير وفق معايير المحاسبة السعودية للشركات الصغيرة والمتوسطة (IFRS for SMEs — SOCPA) — ${new Date().toLocaleString('ar-SA')}</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `قائمة_الدخل_${fromYM}_${toYM}${withCmp?'_مقارنة':''}.html`;
  a.click(); URL.revokeObjectURL(url);
}

function renderTab(name) {
  if      (name === 'summary')  renderSummary();
  else if (name === 'monthly')  renderMonthlyTab();
  else if (name === 'accounts') renderAccountsTab();
  else if (name === 'branches') renderBranchesTab();
  else if (name === 'assets')   renderAssetsTab();
  else if (name === 'details')  renderDetails();
  else if (name === 'compare')  renderCompareTab();
  else if (name === 'pl')       renderPLTab();
  else if (name === 'bs')       renderBS();
  else if (name === 'cf')       renderCF();
  else if (name === 'ratios')   renderRatiosTab();
  else if (name === 'notes')        renderNotesTab();
  else if (name === 'cfo')          renderCFODashboard();
  else if (name === 'consolidated') renderConsolidatedTab();
  else if (name === 'cons-cf')     renderConsCF();
  else if (name === 'pl-comp')     renderPLComparison();
  else if (name === 'trial')       renderTrialBalance();
  else if (name === 'is')          renderIncomeStatement();
  else if (name === 'safety')      renderSafetyInventory();
  else if (name === 'finmodel')    renderFinancialModel();
  else if (name === 'inventory')     renderInventoryAnalysis();
  else if (name === 'manufacturing') renderManufacturing();
  else if (name === 'coils') {
    const fr = document.getElementById('coils-iframe');
    if (fr && !fr.src.includes('coils-analysis-2026')) fr.src = '/coils-analysis-2026.html';
  }
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
  if (!active) return;
  if      (active.dataset.tab === 'pl')     renderPLTab();
  else if (active.dataset.tab === 'cf')     renderCF();
  else if (active.dataset.tab === 'ratios') renderRatiosTab();
  else if (active.dataset.tab === 'notes')  renderNotesTab();
  else if (active.dataset.tab === 'cfo')    renderCFODashboard();
});

State.on('bs', () => {
  const active = document.querySelector('.tab.active');
  if (!active) return;
  if      (active.dataset.tab === 'bs')     renderBS();
  else if (active.dataset.tab === 'cf')     renderCF();
  else if (active.dataset.tab === 'ratios') renderRatiosTab();
  else if (active.dataset.tab === 'notes')  renderNotesTab();
  else if (active.dataset.tab === 'cfo')    renderCFODashboard();
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
    // Sync plc-db-sel to initial default DB
    const plcDbInit = document.getElementById('plc-db-sel');
    if (plcDbInit && plcDbInit.querySelector(`option[value="${config.defaultDb}"]`))
      plcDbInit.value = config.defaultDb;
    dbSel.addEventListener('change', function(e) {
      SSEClient.switchDb(e.target.value);
      // Sync pl-comp DB selector and re-render if that tab is active
      const plcDb = document.getElementById('plc-db-sel');
      if (plcDb && plcDb.querySelector(`option[value="${e.target.value}"]`)) {
        plcDb.value = e.target.value;
        if (document.querySelector('.tab.active[data-tab="pl-comp"]')) renderPLComparison();
      }
    });
  }

  // Update header meta with start date
  const startEl = document.getElementById('data-start');
  if (startEl) startEl.textContent = config.dataStartDate;

  // Monthly tab filters
  const moPeriodSel = document.getElementById('mo-period-sel');
  if (moPeriodSel) moPeriodSel.addEventListener('change', renderMonthlyTab);
  const moCatSel = document.getElementById('mo-cat-sel');
  if (moCatSel) moCatSel.addEventListener('change', renderMonthlyTab);

  // Accounts tab period filter
  const accPeriodSel = document.getElementById('acc-period-sel');
  if (accPeriodSel) accPeriodSel.addEventListener('change', renderAccountsTab);

  // Compare tab period filter
  const cmpPeriodSel = document.getElementById('cmp-period-sel');
  if (cmpPeriodSel) cmpPeriodSel.addEventListener('change', renderCompareTab);

  initSummary();
  initDetails();

  // P&L period filter + exports
  const plPeriodSel = document.getElementById('pl-period-sel');
  if (plPeriodSel) plPeriodSel.addEventListener('change', renderPLTab);
  const plExcelBtn = document.getElementById('pl-excel-btn');
  if (plExcelBtn)  plExcelBtn.addEventListener('click', exportPLExcel);
  const plHtmlBtn  = document.getElementById('pl-html-btn');
  if (plHtmlBtn)   plHtmlBtn.addEventListener('click', exportPLHTML);
  const plPdfBtn   = document.getElementById('pl-pdf-btn');
  if (plPdfBtn)    plPdfBtn.addEventListener('click', printPLPDF);

  // BS period filter
  const bsPeriodSel = document.getElementById('bs-period-sel');
  if (bsPeriodSel) bsPeriodSel.addEventListener('change', renderBS);

  // CF period + comparison filters + Excel export
  const cfPeriodSel = document.getElementById('cf-period-sel');
  if (cfPeriodSel) cfPeriodSel.addEventListener('change', renderCF);
  const cfCmpSel = document.getElementById('cf-cmp-sel');
  if (cfCmpSel) cfCmpSel.addEventListener('change', renderCF);
  const cfExcelBtn = document.getElementById('cf-excel-btn');
  if (cfExcelBtn) cfExcelBtn.addEventListener('click', exportCFExcel);

  // Branches tab period filter
  const brPeriodSel = document.getElementById('br-period-sel');
  if (brPeriodSel) brPeriodSel.addEventListener('change', renderBranchesTab);

  // Assets tab period filter
  const assetPeriodSel = document.getElementById('asset-period-sel');
  if (assetPeriodSel) assetPeriodSel.addEventListener('change', renderAssetsTab);

  // Ratios tab
  const ratiosPeriodSel = document.getElementById('ratios-period-sel');
  if (ratiosPeriodSel) ratiosPeriodSel.addEventListener('change', renderRatiosTab);
  const ratiosPlMode  = document.getElementById('ratios-pl-mode');
  if (ratiosPlMode)   ratiosPlMode.addEventListener('change', renderRatiosTab);
  const ratiosExcelBtn = document.getElementById('ratios-excel-btn');
  if (ratiosExcelBtn) ratiosExcelBtn.addEventListener('click', exportRatiosExcel);
  const ratiosHtmlBtn  = document.getElementById('ratios-html-btn');
  if (ratiosHtmlBtn)  ratiosHtmlBtn.addEventListener('click', exportRatiosHTML);
  const ratiosPdfBtn   = document.getElementById('ratios-pdf-btn');
  if (ratiosPdfBtn)   ratiosPdfBtn.addEventListener('click', printRatiosPDF);

  // Notes tab period filter and export buttons
  const notesPeriodSel = document.getElementById('notes-period-sel');
  if (notesPeriodSel) notesPeriodSel.addEventListener('change', renderNotesTab);
  const notesPlMode   = document.getElementById('notes-pl-mode');
  if (notesPlMode)    notesPlMode.addEventListener('change', renderNotesTab);
  const notesExcelBtn = document.getElementById('notes-excel-btn');
  if (notesExcelBtn)  notesExcelBtn.addEventListener('click', exportNotesExcel);
  const notesHtmlBtn  = document.getElementById('notes-html-btn');
  if (notesHtmlBtn)   notesHtmlBtn.addEventListener('click', exportNotesHTML);
  const notesPdfBtn   = document.getElementById('notes-pdf-btn');
  if (notesPdfBtn)    notesPdfBtn.addEventListener('click', printNotesPDF);

  const cfoQuickSel  = document.getElementById('cfo-quick-sel');
  if (cfoQuickSel)   cfoQuickSel.addEventListener('change', renderCFODashboard);
  const cfoExcelBtn  = document.getElementById('cfo-excel-btn');
  if (cfoExcelBtn)   cfoExcelBtn.addEventListener('click', exportCFOExcel);
  const cfoHtmlBtn   = document.getElementById('cfo-html-btn');
  if (cfoHtmlBtn)    cfoHtmlBtn.addEventListener('click', exportCFOHTML);
  const cfoPdfBtn    = document.getElementById('cfo-pdf-btn');
  if (cfoPdfBtn)     cfoPdfBtn.addEventListener('click', printCFOPDF);

  // Subscribe to SSE events
  SSEClient.onSnapshot(() => {
    API.fetchDetails();
    setTimeout(runVerify, 2000); // auto-verify 2s after each snapshot
  });
  SSEClient.onStatus(({ connected, db }) => {
    updateConnectionUI(connected, db);
  });

  // Verify button & modal
  const vBtn = document.getElementById('verify-btn');
  const vOverlay = document.getElementById('verify-overlay');
  if (vBtn) vBtn.addEventListener('click', () => {
    vOverlay.classList.add('open');
    if (vBtn.classList.contains('vchk')) runVerify();
  });
  const vClose = document.getElementById('verify-close');
  if (vClose) vClose.addEventListener('click', () => vOverlay.classList.remove('open'));
  if (vOverlay) vOverlay.addEventListener('click', e => { if (e.target === vOverlay) vOverlay.classList.remove('open'); });

  // Consolidated CF tab — period selectors and refresh
  const consCfFrom    = document.getElementById('cons-cf-from');
  const consCfTo      = document.getElementById('cons-cf-to');
  const consCfRefresh = document.getElementById('cons-cf-refresh-btn');
  if (consCfFrom) consCfFrom.addEventListener('change', e => { State.set('consCfFrom', e.target.value); renderConsCF(); });
  if (consCfTo)   consCfTo.addEventListener('change',   e => { State.set('consCfTo',   e.target.value); renderConsCF(); });
  const consCfCmpSel  = document.getElementById('cons-cf-cmp-sel');
  const consCfExcelBtn = document.getElementById('cons-cf-excel-btn');
  if (consCfCmpSel)  consCfCmpSel.addEventListener('change', renderConsCF);
  if (consCfExcelBtn) consCfExcelBtn.addEventListener('click', exportConsCFExcel);
  const consExcelBtn = document.getElementById('cons-excel-btn');
  if (consExcelBtn) consExcelBtn.addEventListener('click', exportConsExcel);
  const consHtmlBtn = document.getElementById('cons-html-btn');
  if (consHtmlBtn) consHtmlBtn.addEventListener('click', exportConsHTML);
  const consPdfBtn  = document.getElementById('cons-pdf-btn');
  if (consPdfBtn)  consPdfBtn.addEventListener('click', printConsPDF);
  if (consCfRefresh) consCfRefresh.addEventListener('click', () => {
    State.set('consolidated', null);
    State.set('consCfFrom', null);
    State.set('consCfTo',   null);
    renderConsCF();
  });
  document.querySelectorAll('.tab[data-tab="cons-cf"]').forEach(t => {
    t.addEventListener('click', () => { if (!State.get('consolidated')) renderConsCF(); });
  });

  // Consolidated tab refresh button
  const consRefreshBtn = document.getElementById('cons-refresh-btn');
  if (consRefreshBtn) consRefreshBtn.addEventListener('click', () => {
    State.set('consolidated', null);
    State.set('consFrom', null);
    State.set('consTo', null);
    renderConsolidatedTab();
  });

  // Unified consolidated period filter
  const consFromSel = document.getElementById('cons-period-from');
  const consToSel   = document.getElementById('cons-period-to');
  if (consFromSel) consFromSel.addEventListener('change', e => {
    State.set('consFrom', e.target.value);
    renderConsolidatedTab();
  });
  if (consToSel) consToSel.addEventListener('change', e => {
    State.set('consTo', e.target.value);
    renderConsolidatedTab();
  });

  // Tab switching — show/hide consolidated tab content
  document.querySelectorAll('.tab[data-tab="consolidated"]').forEach(t => {
    t.addEventListener('click', () => {
      if (!State.get('consolidated')) renderConsolidatedTab();
    });
  });

  // P&L comparison tab listeners
  const _plcMode    = document.getElementById('plc-mode-sel');
  const _plcRefresh = document.getElementById('plc-refresh-btn');
  const _plcCopy    = document.getElementById('plc-copy-btn');
  const _plcNotes   = document.getElementById('plc-notes');
  if (_plcMode) _plcMode.addEventListener('change', () => { plcShowMode(_plcMode.value); renderPLComparison(); });
  ['plc-year-sel','plc-q-sel','plc-h-sel','plc-month-sel','plc-from-sel','plc-to-sel','plc-db-sel']
    .forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => renderPLComparison()); });
  if (_plcRefresh) _plcRefresh.addEventListener('click', () => {
    const db = document.getElementById('plc-db-sel')?.value || 'MekSoftDb1';
    delete _plCompCache[db];
    Object.keys(_plAdjCache).forEach(k => { if (k.startsWith(db + '|')) delete _plAdjCache[k]; });
    renderPLComparison();
  });
  if (_plcCopy) _plcCopy.addEventListener('click', () => {
    const db  = document.getElementById('plc-db-sel')?.value || 'MekSoftDb1';
    const per = plcGetPeriod();
    const a   = per ? plcAggregate(_plCompCache[db] || [], per.from, per.to, db) : null;
    if (!a) return;
    const txt = [
      `تقرير الأرباح والخسائر — ${per.label}`,
      `الإيرادات: ${fmt(a.net_revenue)} ر.س`,
      `تكلفة المبيعات (جرد دائم): ${fmt(a.pure_cogs)} ر.س`,
      `إجمالي الربح: ${fmt(a.gp_perp)} ر.س`,
      `المصروفات التشغيلية: ${fmt(a.total_opex)} ر.س`,
      `صافي الربح: ${fmt(a.ni_perp)} ر.س`,
      `— تحليل: المخزون الدفتري مضخَّم بـ ${fmt(a.inv_overstatement)} ر.س (FallbackCostInBase)`,
    ].join('\n');
    navigator.clipboard.writeText(txt).catch(() => {});
  });
  if (_plcNotes) _plcNotes.addEventListener('input', () => {
    const per = plcGetPeriod();
    if (per) localStorage.setItem('plc-notes-' + per.label, _plcNotes.value);
  });

  // Trial balance + Income statement tabs
  initTrialBalance();
  initIncomeStatement();

  State.patch({ activeDb: config.defaultDb });
  SSEClient.start(config.defaultDb);
}

// ── Perpetual vs Periodic Inventory Comparison tab ───────────────────────────
let _plCompCache  = {};
let _plCompChart  = null;
let _plCompInited = false;

const PLCOMP_OPENING = {
  MekSoftDb1: { month: '2025-09', inv_balance: 4061406.11, ei_periodic: 3637611.23 },
  MekSoftDb2: { month: '2025-08', inv_balance: 0,          ei_periodic: 0           },
};
function plcOpeningFor(db) { return PLCOMP_OPENING[db] || PLCOMP_OPENING.MekSoftDb1; }
const _PLC_AR_MO = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function plcKey(yr, mo) { return `${yr}-${String(mo).padStart(2,'0')}`; }
function plcPrevMo(moStr) {
  let [y, m] = moStr.split('-').map(Number);
  if (--m < 1) { m = 12; y--; }
  return plcKey(y, m);
}
function plcMonthLabel(moStr) {
  const [y, m] = moStr.split('-').map(Number);
  return _PLC_AR_MO[m] + ' ' + y;
}

function plcShowMode(mode) {
  const vis = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };
  vis('plc-year-sel',  mode !== 'custom' && mode !== 'month' && mode !== 'all');
  vis('plc-q-sel',     mode === 'quarter');
  vis('plc-h-sel',     mode === 'half');
  vis('plc-month-sel', mode === 'month');
  vis('plc-from-lbl',  mode === 'custom');
  vis('plc-from-sel',  mode === 'custom');
  vis('plc-to-lbl',    mode === 'custom');
  vis('plc-to-sel',    mode === 'custom');
}

function plcGetPeriod() {
  const mode = document.getElementById('plc-mode-sel')?.value || 'all';
  const yr   = document.getElementById('plc-year-sel')?.value  || '';
  const q    = document.getElementById('plc-q-sel')?.value     || '';
  const h    = document.getElementById('plc-h-sel')?.value     || '';
  const mo   = document.getElementById('plc-month-sel')?.value || '';
  const from = document.getElementById('plc-from-sel')?.value  || '';
  const to   = document.getElementById('plc-to-sel')?.value    || '';
  const QL   = ['','الربع الأول','الربع الثاني','الربع الثالث','الربع الرابع'];

  if (mode === 'all') {
    const frSel = document.getElementById('plc-from-sel');
    const toSel = document.getElementById('plc-to-sel');
    const allMonths = frSel ? [...frSel.options].map(o => o.value).filter(Boolean) : [];
    if (!allMonths.length) return null;
    const f = allMonths[0], t = allMonths[allMonths.length - 1];
    return { from: f, to: t, label: 'كل الفترة (' + plcMonthLabel(f) + ' — ' + plcMonthLabel(t) + ')' };
  }
  if (mode === 'year' && yr)
    return { from: plcKey(yr, 1), to: plcKey(yr, 12), label: 'سنة ' + yr };
  if (mode === 'quarter' && yr && q) {
    const mf = (+q - 1) * 3 + 1;
    return { from: plcKey(yr, mf), to: plcKey(yr, mf + 2), label: QL[+q] + ' ' + yr };
  }
  if (mode === 'half' && yr && h)
    return h === '1'
      ? { from: plcKey(yr, 1),  to: plcKey(yr, 6),  label: 'النصف الأول ' + yr }
      : { from: plcKey(yr, 7),  to: plcKey(yr, 12), label: 'النصف الثاني ' + yr };
  if (mode === 'month' && mo)
    return { from: mo, to: mo, label: plcMonthLabel(mo) };
  if (mode === 'custom' && from && to && from <= to)
    return { from, to, label: plcMonthLabel(from) + ' — ' + plcMonthLabel(to) };
  return null;
}

function plcPopulateFilters(data) {
  const years  = [...new Set(data.map(r => r.month.slice(0,4)))].sort();
  const months = data.map(r => ({ v: r.month, t: r.label }));

  const ySel  = document.getElementById('plc-year-sel');
  const moSel = document.getElementById('plc-month-sel');
  const frSel = document.getElementById('plc-from-sel');
  const toSel = document.getElementById('plc-to-sel');

  if (ySel) {
    const sv = ySel.value;
    ySel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (sv && years.includes(sv)) ySel.value = sv;
    else ySel.value = years[years.length - 1] || '';
  }
  [{ el: moSel, def: months[months.length-1]?.v },
   { el: frSel, def: months[0]?.v },
   { el: toSel, def: months[months.length-1]?.v }].forEach(({ el, def }) => {
    if (!el) return;
    const sv = el.value;
    el.innerHTML = months.map(m => `<option value="${m.v}">${m.t}</option>`).join('');
    if (sv && months.some(m => m.v === sv)) el.value = sv;
    else el.value = def || '';
  });
}

async function plcFetch(db, force) {
  if (!force && _plCompCache[db]) return _plCompCache[db];
  const r = await fetch(`/api/pl-comparison?db=${encodeURIComponent(db)}`);
  if (!r.ok) throw new Error(await r.text());
  return (_plCompCache[db] = await r.json());
}

const _plAdjCache = {};
async function plcFetchAdjDetail(db, from, to) {
  const k = `${db}|${from}|${to}`;
  if (_plAdjCache[k]) return _plAdjCache[k];
  const r = await fetch(`/api/pl-adj-detail?db=${encodeURIComponent(db)}&from=${from}&to=${to}`);
  if (!r.ok) throw new Error(await r.text());
  return (_plAdjCache[k] = await r.json());
}

function plcAggregate(data, from, to, db) {
  const rows = data.filter(r => r.month >= from && r.month <= to);
  if (!rows.length) return null;

  const opening = plcOpeningFor(db);
  const biMo  = plcPrevMo(from);
  const biRow = data.find(r => r.month === biMo)
             || (biMo <= opening.month ? opening : null);

  // Perpetual BI/EI — primary (period-accurate: cost matched to delivery date via JV)
  const bi        = +(biRow?.inv_balance || 0);
  const ei        = +(rows[rows.length-1].inv_balance || 0);
  // Periodic BI/EI — supplementary (qty × avg PI cost; for inventory valuation analysis only)
  const bi_periodic = +(biRow?.ei_periodic ?? biRow?.inv_balance ?? 0);
  const ei_periodic = +(rows[rows.length-1].ei_periodic ?? 0);
  // Alias for backward-compat in render functions
  const bi_ledger = bi;
  const ei_ledger = ei;

  const sum = f => rows.reduce((s, r) => s + (+r[f] || 0), 0);
  const revenue       = sum('revenue');
  const sales_rev     = sum('sales_rev');
  const sales_ret     = sum('sales_ret');
  const other_rev     = sum('other_rev');
  const disc_earned   = sum('disc_earned');
  const unclass_rev   = sum('unclass_rev');
  const cogs_perp       = sum('cogs_perp');
  // write_down_cogs: sub-component of cogs_perp — inventory write-downs via DecreaseStock JVs only
  const write_down_cogs = sum('write_down_cogs');
  // sales_cogs: perpetual COGS from sales (excludes one-time write-downs)
  const sales_cogs      = cogs_perp - write_down_cogs;
  const other_cost      = sum('other_cost');

  // PI/PR — from document AmountBVat (excl. VAT, matches PI/PR reports)
  const purchases_av  = sum('purchases');
  const returns_av    = sum('purch_returns');
  // Inventory adjustments (CostAllocation JVs)
  const mfg_av        = sum('inv_adj');
  // Reclassify: disc_sales (4010101002+007) → revenue deduction (not COGS)
  //             disc_earned (5010201005+006, name خصم only) → purchase deduction (not revenue)
  const disc_sales    = sum('disc_sales');
  const net_revenue   = revenue - disc_earned - disc_sales;
  const pure_cogs     = cogs_perp - disc_sales;
  // Sales COGS net of customer discounts (excludes write-downs — for trend analysis)
  const sales_pure_cogs = sales_cogs - disc_sales;
  // Net purchases for display: deduct earned supplier discounts from gross PI purchases
  const net_purchases_av = purchases_av - disc_earned - returns_av + mfg_av;
  // Periodic COGS — supplementary (for COGS analysis box, not main P&L)
  const periodic_cogs = bi_periodic + net_purchases_av - ei_periodic;
  // Inventory adjustment breakdown by document type (for COGS box detail display)
  const adj_breakdown_map = {};
  rows.forEach(r => {
    (r.inv_adj_detail || []).forEach(d => {
      adj_breakdown_map[d.doc_type] = (adj_breakdown_map[d.doc_type] || 0) + d.amount;
    });
  });
  const ADJ_ORDER = ['مخزون أول المدة','زيادة مخزون','نقص مخزون','إيصال بضاعة تامة',
                     'إصدار مواد خام','تحويل وارد','تحويل صادر','توزيع تكاليف','تسليم بضاعة','قيد يدوي'];
  const adj_breakdown = Object.entries(adj_breakdown_map)
    .filter(([, v]) => Math.abs(v) > 0)
    .sort(([a], [b]) => {
      const ia = ADJ_ORDER.indexOf(a), ib = ADJ_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const inv_overstatement = ei_ledger - ei_periodic;

  const opex = {
    // 401 - مصروفات تشغيلية المخازن (transport/dist fully in OpEx, matches ERP)
    sell: sum('sell'), dist: sum('dist'),
    // 402 - مصروفات إدارية وعمومية (fees includes customs+clearance, matches ERP)
    sal: sum('sal'), rent: sum('rent'), fees: sum('fees'), consult: sum('consult'),
    gen: sum('gen'), maint: sum('maint'), office: sum('office'),
    char: sum('char'), oth: sum('oth'), fin: sum('fin'),
  };
  const total_opex    = Object.values(opex).reduce((s, v) => s + v, 0);
  const gp_perp       = net_revenue - pure_cogs - other_cost;
  const ni_perp       = gp_perp - total_opex;
  const gp_periodic   = net_revenue - periodic_cogs - other_cost;
  const ni_periodic   = gp_periodic - total_opex;

  // Landed costs absorbed into 10302% via PI JVs (transport + transit + clearance reversals)
  const abs_transport = sum('abs_transport');
  const abs_transit   = sum('abs_transit');
  const abs_clearance = sum('abs_clearance');
  const landed_costs  = abs_transport + abs_transit + abs_clearance;
  const pi_jv_total   = purchases_av + landed_costs; // approx 10302% PI JV debit

  return { from, to, rows, bi, ei, bi_periodic, ei_periodic, bi_ledger, ei_ledger,
           purchases_av, returns_av, mfg_av, disc_sales, disc_earned,
           net_purchases_av, adj_breakdown, periodic_cogs, revenue, net_revenue, pure_cogs,
           sales_rev, sales_ret, other_rev, unclass_rev,
           cogs_perp, write_down_cogs, sales_cogs, sales_pure_cogs, other_cost, inv_overstatement,
           abs_transport, abs_transit, abs_clearance, landed_costs, pi_jv_total,
           ...opex, total_opex, gp_perp, gp_periodic, ni_perp, ni_periodic };
}

function plcRenderKPIs(a) {
  const el = document.getElementById('plc-kpis');
  if (!el) return;
  const gm = a.net_revenue ? a.gp_perp / a.net_revenue * 100 : 0;
  const nm = a.net_revenue ? a.ni_perp / a.net_revenue * 100 : 0;
  el.innerHTML = [
    { lbl: 'الإيرادات',              val: fmt(a.net_revenue),   accent: '#4ada8e' },
    { lbl: 'تكلفة المبيعات',         val: fmt(a.pure_cogs),     accent: '#da9a4a' },
    { lbl: 'إجمالي الربح',           val: fmt(a.gp_perp),       accent: a.gp_perp >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'هامش الربح الإجمالي',   val: fmtPct(gm),            accent: gm >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'المصروفات التشغيلية',    val: fmt(a.total_opex),    accent: '#5baef0' },
    { lbl: 'صافي الربح',             val: fmt(a.ni_perp),       accent: a.ni_perp >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'هامش صافي',             val: fmtPct(nm),            accent: nm >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'فرق تقييم المخزون',      val: fmt(a.inv_overstatement), accent: Math.abs(a.inv_overstatement) > 100000 ? '#da9a4a' : '#607080' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join('');
}

function plcRenderStatement(a) {
  const el = document.getElementById('plc-statement');
  if (!el) return;
  const R = (lbl, val, st='') => `<tr><td>${lbl}</td><td class="pl-num"${st?` style="${st}"`:''}>${fmt(val)}</td></tr>`;
  const S = lbl => `<tr class="pl-section"><td colspan="2" style="color:#5baef0;padding-top:14px;font-size:.78rem;letter-spacing:.04em">${lbl}</td></tr>`;
  const T = (lbl, val, st='') => `<tr class="pl-subtotal"><td><strong>${lbl}</strong></td>
    <td class="pl-num"${st?` style="${st}"`:''}><strong>${fmt(val)}</strong></td></tr>`;
  const G = lbl => `<tr><td colspan="2" style="color:#6080a0;padding:8px 14px 2px;font-size:.73rem;font-style:italic">— ${lbl} —</td></tr>`;

  const gpColor = a.gp_perp >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
  const niColor = a.ni_perp >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';

  const opexRows = [
    G('مصروفات تشغيلية المخازن (401)'),
    a.sell       ? R('مصروفات بيعية (عمولات ودعاية)', a.sell) : '',
    a.dist       ? R('مصروفات نقل وتوزيع (4010301)', a.dist)  : '',
    G('مصروفات إدارية وعمومية (402)'),
    a.sal        ? R('رواتب وأجور ومزايا', a.sal)     : '',
    a.rent       ? R('إيجارات', a.rent)               : '',
    a.fees       ? R('رسوم وجمارك وتخليص (4020106)', a.fees)  : '',
    a.consult    ? R('استشارات وخبراء', a.consult)     : '',
    a.gen        ? R('مصروفات عمومية', a.gen)          : '',
    a.maint      ? R('صيانة ومحروقات وسيارات', a.maint): '',
    a.office     ? R('قرطاسية ومستلزمات مكتبية', a.office) : '',
    a.char       ? R('صدقات وبر', a.char)             : '',
    a.oth        ? R('أخرى ومتنوعة', a.oth)           : '',
    a.fin        ? R('مالية ومصرفية', a.fin)          : '',
  ].join('');

  el.innerHTML = `<table class="pl-stmt" style="width:100%">
    <thead><tr style="color:#5090b0;font-size:.75rem">
      <th style="text-align:right;padding:6px 14px">البند</th>
      <th class="pl-num" style="padding:6px 14px">المبلغ (ر.س)</th>
    </tr></thead>
    <tbody>
      ${S('الإيرادات')}
      ${R('صافي الإيرادات', a.net_revenue, 'color:#4ada8e')}
      ${S('تكلفة البضاعة المباعة')}
      ${R('تكلفة مبيعات البضاعة (جرد دائم)', a.sales_pure_cogs)}
      ${a.write_down_cogs ? R('خسائر هبوط المخزون (DecreaseStock)', a.write_down_cogs, 'color:#da4a4a') : ''}
      ${a.other_cost ? R('تكاليف مباشرة أخرى', a.other_cost) : ''}
      ${T('إجمالي تكلفة البضاعة المباعة', a.pure_cogs)}
      ${T('إجمالي الربح', a.gp_perp, gpColor)}
      ${S('المصروفات التشغيلية')}
      ${opexRows}
      ${T('إجمالي المصروفات التشغيلية', a.total_opex)}
      ${S('صافي الربح')}
      <tr class="pl-total"><td><strong>صافي الربح / الخسارة</strong></td>
        <td class="pl-num" style="${niColor}"><strong>${fmt(a.ni_perp)}</strong></td>
      </tr>
    </tbody></table>`;
}

function plcRenderRevenueBox(a) {
  const el = document.getElementById('plc-rev-box');
  if (!el) return;
  const R = (lbl, val, st='') => `<tr><td style="color:#8ab0cc">${lbl}</td><td class="pl-num"${st?` style="${st}"`:''}>${fmt(val)}</td></tr>`;
  const grossRev = a.revenue - a.disc_earned;
  el.innerHTML = `
    <div class="card-title">بناء إجمالي الإيرادات</div>
    <table class="pl-stmt" style="width:100%"><tbody>
      ${R('+ فواتير المبيعات (بدون ضريبة)', a.sales_rev, 'color:#4ada8e')}
      ${a.sales_ret    ? R('− مردودات المبيعات', -a.sales_ret, 'color:#5baef0') : ''}
      ${a.other_rev    ? R('+ إيرادات خدمات أخرى', a.other_rev, 'color:#4ada8e') : ''}
      ${Math.abs(a.unclass_rev) > 100 ? R('± إيرادات أخرى', a.unclass_rev, 'color:#f0c050') : ''}
      <tr class="pl-subtotal"><td>= إجمالي المبيعات (قبل خصم العملاء)</td>
        <td class="pl-num">${fmt(grossRev)}</td></tr>
      ${a.disc_sales   ? R('− خصم مسموح وخصم مبيعات للعملاء (4010101002+007)', -a.disc_sales, 'color:#5baef0') : ''}
      <tr class="pl-subtotal"><td><strong>= صافي الإيرادات</strong></td>
        <td class="pl-num"><strong>${fmt(a.net_revenue)}</strong></td></tr>
    </tbody></table>`;
}

function plcRenderCogsBox(a) {
  const el = document.getElementById('plc-cogs-box');
  if (!el) return;
  const R = (lbl, val, st='') => `<tr><td style="color:#8ab0cc">${lbl}</td><td class="pl-num"${st?` style="${st}"`:''}>${fmt(val)}</td></tr>`;

  // inv_overstatement = ei_ledger − ei_periodic
  // Positive → ledger higher than periodic estimate (FallbackCostInBase or landed costs)
  // Negative → periodic estimate higher than ledger (AVCO divergence from ERP actual costs)
  const absOver    = Math.abs(a.inv_overstatement);
  const overColor  = absOver > 100000 ? '#da9a4a' : '#607080';
  const overLabel  = a.inv_overstatement >= 0
    ? 'الدفتري أعلى من التقدير بالكميات ▲'
    : 'التقدير بالكميات أعلى من الدفتري ▼';
  const overNote   = a.inv_overstatement >= 0
    ? `المخزون الدفتري (10302%) أعلى من التقدير بالكميات بفارق ${fmt(absOver)} ر.س —
       الأسباب المحتملة: (أ) فواتير شراء قُيِّدت في 10302% لبضاعة سبق بيعها بسعر FallbackCostInBase،
       (ب) تكاليف لوجستية (نقل/تخليص) مُدمجة في 10302% غير مُضمَّنة في متوسط سعر الشراء.`
    : `التقدير بالكميات (كميات × متوسط PI) أعلى من المخزون الدفتري بفارق ${fmt(absOver)} ر.س —
       الأسباب المحتملة: (أ) فجوة بين متوسط سعر الشراء التاريخي المستخدم في التقدير وأسعار التكلفة
       الفعلية في دفاتر ERP، (ب) خفض قيمة مخزون مُسجَّل في 10302% دون كميات مقابلة.`;

  el.innerHTML = `
    <div class="card-title">تحليل تكلفة البضاعة المباعة والمخزون</div>

    <div style="font-size:.78rem;color:#5baef0;margin-bottom:8px;font-weight:600">بناء تكلفة المبيعات — مرجعي (يُقارب الجرد الدائم)</div>
    <table class="pl-stmt" style="width:100%"><tbody>
      ${R('رصيد المخزون أول المدة (10302%)', a.bi)}
      ${R('+ مشتريات الموردين (بدون ضريبة)', a.purchases_av, 'color:#da9a4a')}
      ${a.disc_earned ? R('− خصم مكتسب وخصم مشتريات من الموردين (5010201005+006 خصم)', -a.disc_earned, 'color:#4ada8e') : ''}
      ${(a.adj_breakdown || []).map(([type, amt]) =>
          R((amt >= 0 ? '+ ' : '− ') + type, amt, amt >= 0 ? 'color:#da9a4a' : 'color:#5baef0')
        ).join('')}
      ${a.returns_av ? R('− مردودات الشراء (بدون ضريبة)', a.returns_av, 'color:#5baef0') : ''}
      ${R('− مخزون آخر المدة (10302%)', a.ei, 'color:#da4a4a')}
    </tbody></table>

    <div style="margin-top:10px;border-top:1px solid #1e3040;padding-top:10px">
      <div style="font-size:.78rem;color:#5baef0;margin-bottom:6px;font-weight:600">المعتمد في قائمة الدخل (جرد دائم — 4010101%)</div>
      <table class="pl-stmt" style="width:100%"><tbody>
        ${R('تكلفة مبيعات البضاعة', a.sales_pure_cogs)}
        ${a.write_down_cogs ? R('+ خسائر هبوط المخزون (DecreaseStock)', a.write_down_cogs, 'color:#da4a4a') : ''}
        <tr class="pl-subtotal"><td><strong>= إجمالي تكلفة البضاعة المباعة</strong></td>
          <td class="pl-num"><strong>${fmt(a.pure_cogs)}</strong></td></tr>
      </tbody></table>
    </div>

    <div style="margin-top:14px;border-top:1px solid #1e3040;padding-top:12px">
      <div style="font-size:.78rem;color:#da9a4a;margin-bottom:8px;font-weight:600">تحليل فجوة تقييم المخزون</div>
      <table class="pl-stmt" style="width:100%"><tbody>
        <tr><td style="color:#607080;font-size:.78rem">مخزون آخر المدة الدفتري (10302%)</td>
            <td class="pl-num" style="color:#607080;font-size:.78rem">${fmt(a.ei_ledger)}</td></tr>
        <tr><td style="color:#8ab0cc;font-size:.78rem">تقدير المخزون بالكميات (كميات × متوسط PI)</td>
            <td class="pl-num" style="color:#8ab0cc;font-size:.78rem">${fmt(a.ei_periodic)}</td></tr>
        <tr><td style="color:${overColor};font-size:.78rem;font-weight:600">فرق التقييم (دفتري − تقدير) — ${overLabel}</td>
            <td class="pl-num" style="color:${overColor};font-size:.78rem;font-weight:600">${fmt(a.inv_overstatement)}</td></tr>
      </tbody></table>
      <div style="margin-top:8px;font-size:.74rem;color:#456070;line-height:1.9;background:#06141e;padding:7px 10px;border-radius:5px;border:1px solid #1a3040">
        ${overNote}
      </div>
    </div>
    <div style="margin-top:8px;font-size:.77rem;color:#506070;line-height:1.8">
      <span style="color:#8090a0">أول المدة:</span> ${plcMonthLabel(plcPrevMo(a.from))}&ensp;
      <span style="color:#8090a0">آخر المدة:</span> ${plcMonthLabel(a.to)}
    </div>`;
}

function plcRenderTransactionTable(a) {
  const el = document.getElementById('plc-txn-table');
  if (!el) return;

  // ────────────────────────────────────────────────────────────────────────
  // ACCOUNTING PROOF:
  // When both systems use IDENTICAL inputs (same JV-based BI, same PI JV
  // amounts including landed costs, same PR amounts, same adjustments), the
  // COGS difference = EI valuation gap ONLY:
  //
  //   GAFS (identical) = bi_ledger + pi_jv_total − returns_av + mfg_av
  //   Perpetual COGS   = GAFS − EI_ledger   (10302% closing balance)
  //   Periodic COGS    = GAFS − EI_AVCO     (physical qty × all-time avg PI cost)
  //   Difference       = EI_ledger − EI_AVCO = inv_overstatement
  //
  // Verified numerically: GAFS(83.3M) − ei_ledger(15.6M) = 67.7M ≈ pure_cogs ✓
  // ────────────────────────────────────────────────────────────────────────

  const MAT = 50_000;

  // Same-basis: both columns use perp_avail (identical JV-based GAFS)
  const perp_avail     = a.bi + a.pi_jv_total - a.returns_av + a.mfg_av;
  const samebasis_cogs = perp_avail - a.ei_periodic;    // periodic with JV inputs
  // Verify: samebasis_cogs − a.pure_cogs = a.inv_overstatement (EI gap)

  // Reconciliation from samebasis → current periodic formula
  // Current periodic uses: AVCO BI, PI doc amounts (no landed), deducts disc_earned
  const rec_bi     = a.bi - a.bi_periodic;     // ledger BI − AVCO BI
  const rec_landed = a.landed_costs;            // pi_jv_total − purchases_av
  const rec_disc   = a.disc_earned;             // deducted in current, not in same-basis
  // samebasis_cogs − periodic_cogs = rec_bi + rec_landed + rec_disc ✓

  // sign: '+' adds to COGS (amber), '-' deducts from COGS (blue), 'na' = not applicable (—)
  // abs_val is always the absolute magnitude; sign controls prefix and color.
  function amtCell(abs_val, sign, trt) {
    if (sign === 'na') {
      return `<td class="pl-num"><span style="color:#3a5060;font-style:italic">—</span>`
           + `<span class="txn-trt">${trt}</span></td>`;
    }
    const zero  = Math.abs(+abs_val) < 0.5;
    const color = zero ? '#3a5060' : sign === '+' ? '#da9a4a' : '#5baef0';
    const pfx   = sign === '+' ? '+' : '−';
    return `<td class="pl-num"><span style="color:${color}">${zero ? '—' : pfx + fmt(+abs_val)}</span>`
         + `<span class="txn-trt">${trt}</span></td>`;
  }

  // diff = perpetual_component − periodic_component (null = explanatory sub-row, no diff shown)
  function diffCell(d) {
    if (d === null) return `<td class="pl-num"><span style="color:#3a5060">—</span></td>`;
    if (Math.abs(d) < 0.5) return `<td class="pl-num"><span style="color:#3a5060;font-style:italic">=</span></td>`;
    const c = d > 0 ? '#da9a4a' : '#4ada8e';
    return `<td class="pl-num" style="color:${c};font-weight:500">${d > 0 ? '+' : ''}${fmt(d)}</td>`;
  }

  function grpRow(lbl) {
    return `<tr class="txn-grp"><td colspan="4" style="color:#4a7090">${lbl}</td></tr>`;
  }

  function dataRow(lbl, periC, perpC, diff, opt = {}) {
    let cls = '';
    if (opt.sub) cls += ' txn-sub';
    if (opt.hl)  cls += ' txn-hlrow';
    if (opt.dim) cls += ' txn-dimrow';
    return `<tr class="${cls.trim()}"><td>${lbl}</td>${periC}${perpC}${diffCell(diff)}</tr>`;
  }

  function subtotRow(lbl, peri, perp) {
    const d  = perp - peri;
    const dc = Math.abs(d) < 0.5 ? '#3a5060' : d > 0 ? '#da9a4a' : '#4ada8e';
    const ds = Math.abs(d) < 0.5 ? '=' : (d > 0 ? '+' : '') + fmt(d);
    return `<tr class="txn-subtot">
      <td>${lbl}</td>
      <td class="pl-num" style="color:#da9a4a">${fmt(peri)}</td>
      <td class="pl-num" style="color:#da9a4a">${fmt(perp)}</td>
      <td class="pl-num" style="color:${dc}">${ds}</td>
    </tr>`;
  }

  function totalRow(lbl, peri, perp) {
    const d  = perp - peri;
    const dc = Math.abs(d) < 0.5 ? '#3a5060' : d > 0 ? '#da9a4a' : '#4ada8e';
    const ds = Math.abs(d) < 0.5 ? '=' : (d > 0 ? '+' : '') + fmt(d);
    return `<tr class="txn-total">
      <td>${lbl}</td>
      <td class="pl-num" style="color:#da4a4a;font-size:.85rem">${fmt(peri)}</td>
      <td class="pl-num" style="color:#da4a4a;font-size:.85rem">${fmt(perp)}</td>
      <td class="pl-num" style="color:${dc};font-size:.85rem">${ds}</td>
    </tr>`;
  }

  // ── Build rows (both columns use identical JV-based inputs; only EI differs) ──
  const R = [];

  R.push(grpRow('مدخلات المعادلة — متطابقة في كلا النظامين'));

  R.push(dataRow('رصيد أول المدة',
    amtCell(a.bi, '+', 'رصيد حساب 10302% في بداية الفترة'),
    amtCell(a.bi, '+', 'رصيد حساب 10302% في بداية الفترة'),
    0, { dim: true }
  ));

  R.push(dataRow('مشتريات الموردين + تكاليف لوجستية',
    amtCell(a.pi_jv_total, '+', `Dr 10302% قيود PI = وثائق (${fmt(a.purchases_av)}) + لوجستي (${fmt(a.landed_costs)})`),
    amtCell(a.pi_jv_total, '+', `Dr 10302% قيود PI = وثائق (${fmt(a.purchases_av)}) + لوجستي (${fmt(a.landed_costs)})`),
    0, { dim: true }
  ));

  R.push(dataRow('مردودات المشتريات',
    amtCell(a.returns_av, '-', 'Cr 10302% في قيود مردودات الشراء'),
    amtCell(a.returns_av, '-', 'Cr 10302% في قيود مردودات الشراء'),
    0, { dim: true }
  ));

  if (a.mfg_av > 0.5) {
    R.push(dataRow('تسويات مخزون (توزيع تكاليف)',
      amtCell(a.mfg_av, '+', 'Dr 10302% (CostAllocation)'),
      amtCell(a.mfg_av, '+', 'Dr 10302% (CostAllocation)'),
      0, { dim: true }
    ));
  }

  R.push(subtotRow('البضاعة المتاحة للبيع', perp_avail, perp_avail));

  // ── THE ONLY DIFFERENCE ──────────────────────────────────────────────────
  R.push(grpRow('مخزون آخر المدة — الفرق الوحيد بين النظامين'));

  // diff = perp − samebasis = (perp_avail − ei) − (perp_avail − ei_periodic) = ei_periodic − ei = −inv_overstatement
  const ei_diff = a.ei_periodic - a.ei;
  R.push(dataRow('تقييم مخزون آخر المدة',
    amtCell(a.ei_periodic, '-', 'الكميات الفعلية × متوسط تكلفة PI جميع الفترات (AVCO)'),
    amtCell(a.ei,          '-', 'رصيد حساب 10302% الدفتري (بعد جميع قيود البيع والتسويات)'),
    ei_diff,
    { hl: Math.abs(a.inv_overstatement) > MAT }
  ));

  // ── COGS totals ───────────────────────────────────────────────────────────
  R.push(totalRow('تكلفة البضاعة المباعة', samebasis_cogs, a.pure_cogs));

  // ── Below-table section ───────────────────────────────────────────────────
  const cogs_diff   = a.pure_cogs - samebasis_cogs;   // = −inv_overstatement
  const diffColor   = Math.abs(cogs_diff) < 0.5 ? '#3a5060' : cogs_diff > 0 ? '#da9a4a' : '#4ada8e';
  const diffDir     = cogs_diff > 0 ? 'الجرد الدائم أعلى' : cogs_diff < 0 ? 'الجرد الدوري أعلى' : 'متطابقان';

  // Reconciliation: samebasis → current periodic_cogs
  // current formula uses AVCO BI, PI doc amounts (no landed), deducts disc_earned
  // samebasis_cogs − periodic_cogs = rec_bi + rec_landed + rec_disc
  const rec_total = rec_bi + rec_landed + rec_disc;
  function recLine(lbl, val, note) {
    const c = Math.abs(val) < 0.5 ? '#3a5060' : val > 0 ? '#da9a4a' : '#4ada8e';
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #0a1e2e">
      <div><span style="font-size:.73rem;color:#8ab0cc">${lbl}</span>
           <span style="font-size:.64rem;color:#3a5060;margin-right:6px">${note}</span></div>
      <span style="font-size:.75rem;font-weight:600;color:${c}">${val>0.5?'+':''}${fmt(val)}</span>
    </div>`;
  }

  const belowTable = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px;border-top:1px solid #1a3040;padding-top:12px">

      <!-- Card A: proof summary -->
      <div style="flex:1.2;min-width:240px;background:#06141e;border:1px solid #1a3040;border-radius:6px;padding:12px 14px">
        <div style="font-size:.73rem;color:#5090b0;font-weight:600;margin-bottom:8px">إثبات: الفرق = فجوة تقييم EI فقط</div>
        ${recLine('متاح للبيع (مدخلات متطابقة)', perp_avail, '= BI + PI − PR + تسويات')}
        ${recLine('(−) EI دوري (AVCO)',   a.ei_periodic, `الكميات الفعلية × متوسط التكلفة`)}
        ${recLine('= COGS دوري (نفس الأساس)', samebasis_cogs, '')}
        ${recLine('(−) EI دائم (دفتري)', a.ei, `رصيد 10302% نهاية الفترة`)}
        ${recLine('= COGS دائم', a.pure_cogs, '')}
        <div style="display:flex;justify-content:space-between;padding:8px 0 0">
          <span style="font-size:.73rem;color:#8ab0cc;font-weight:600">فرق EI = فرق COGS</span>
          <span style="font-size:.85rem;font-weight:700;color:${diffColor}">${cogs_diff>0?'+':''}${fmt(cogs_diff)}</span>
        </div>
        <div style="font-size:.64rem;color:${diffColor};margin-top:2px">${diffDir}</div>
      </div>

      <!-- Card B: reconciliation with current periodic formula -->
      <div style="flex:1;min-width:240px;background:#06141e;border:1px solid #1a3040;border-radius:6px;padding:12px 14px">
        <div style="font-size:.73rem;color:#5090b0;font-weight:600;margin-bottom:8px">تسوية مع صيغة الجرد الدوري الحالية</div>
        <div style="font-size:.65rem;color:#2e4050;margin-bottom:8px">الصيغة الحالية تستخدم مدخلات مختلفة عن قيود JV</div>
        ${recLine('COGS دوري — بنفس الأساس', samebasis_cogs, 'من الجدول أعلاه')}
        ${recLine('فرق BI (AVCO مقابل دفتري)', -(rec_bi),
            `AVCO ${fmt(a.bi_periodic)} مقابل دفتري ${fmt(a.bi)}`)}
        ${recLine('تكاليف لوجستية محذوفة', -(rec_landed),
            `وثيقة PI لا تشمل النقل والتخليص`)}
        ${a.disc_earned > 0.5 ? recLine('خصم مكتسب مخصوم من المشتريات', -(rec_disc),
            'الصيغة الحالية تخصمه — يُخفّض COGS') : ''}
        <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:1px solid #1a3040;margin-top:4px">
          <span style="font-size:.73rem;color:#8ab0cc;font-weight:600">COGS دوري (الصيغة الحالية)</span>
          <span style="font-size:.85rem;font-weight:700;color:#da4a4a">${fmt(a.periodic_cogs)}</span>
        </div>
      </div>

    </div>`;

  el.innerHTML = `
    <div class="card-title">إثبات تطابق COGS — الجرد الدوري والدائم بنفس الأساس المحاسبي</div>
    <div style="margin-bottom:10px;font-size:.72rem;color:#3a6070;line-height:1.7">
      باستخدام <strong style="color:#8ab0c0">نفس مدخلات حساب 10302%</strong> لكلا النظامين
      (رصيد أول المدة الدفتري + قيود PI + تسويات − قيود مردودات)،
      الفرق الوحيد هو <strong style="color:#e09060">كيفية تقييم مخزون آخر المدة</strong>:
      الدوري يستخدم <span style="color:#7ac8f0">الكميات الفعلية × AVCO</span>،
      والدائم يستخدم <span style="color:#da9a4a">الرصيد الدفتري لحساب 10302%</span>.
    </div>
    <div style="overflow-x:auto">
      <table class="plc-txn-tbl">
        <thead>
          <tr>
            <th style="width:36%">بند المعادلة</th>
            <th class="pl-num" style="color:#7ac8f0;width:22%">◌ الجرد الدوري<br>
              <span style="font-size:.64rem;font-weight:400;color:#3a6070">نفس مدخلات JV + EI بـ AVCO</span></th>
            <th class="pl-num" style="color:#da9a4a;width:22%">● الجرد الدائم<br>
              <span style="font-size:.64rem;font-weight:400;color:#60481a">نفس مدخلات JV + EI دفتري</span></th>
            <th class="pl-num" style="width:12%">الفرق</th>
          </tr>
        </thead>
        <tbody>${R.join('')}</tbody>
      </table>
    </div>
    ${belowTable}`;
}

function plcRenderAdjDetail(data, adjAndOther) {
  const card = document.getElementById('plc-adj-card');
  const box  = document.getElementById('plc-adj-box');
  if (!card || !box) return;
  if (!data || !data.summary || !data.summary.length) { card.style.display = 'none'; return; }

  card.style.display = '';
  const { summary, increases } = data;

  const typeColor = {
    'زيادة مخزون': '#da9a4a', 'نقص مخزون': '#5baef0',
    'توزيع تكاليف': '#da9a4a', 'مخزون أول المدة': '#7ac8f0',
    'قيد يدوي': '#f0c050',
    'إيصال بضاعة تامة': '#8090a0', 'إصدار مواد خام': '#8090a0',
    'تحويل وارد': '#8090a0', 'تحويل صادر': '#8090a0', 'تسليم بضاعة': '#8090a0',
  };
  // Rows with zero net are internal movements (transfers, raw materials, delivery) — shown dimmed
  const sumRows = summary.map(r => {
    const isZero = Math.abs(r.net_amount) < 1;
    const c   = isZero ? '#404858' : (typeColor[r.doc_type] || '#8ab0cc');
    const tc  = isZero ? '#404858' : '#8ab0cc';
    const sgn = r.net_amount >= 0 ? '+' : '';
    const amtTxt = isZero ? '<span style="color:#354048">صفر (حركة داخلية)</span>' : `<span style="color:${c}">${sgn}${fmt(r.net_amount)}</span>`;
    return `<tr>
      <td style="color:${tc}">${esc(r.doc_type)}</td>
      <td class="pl-num" style="color:#404858;font-size:.78rem">${r.jv_count} قيد</td>
      <td class="pl-num">${amtTxt}</td>
    </tr>`;
  }).join('');

  let incHtml = '';
  if (increases && increases.length) {
    const rows = increases.map(r => `<tr>
      <td style="color:#607080;font-size:.75rem">${esc(r.date)}</td>
      <td style="color:#8ab0cc;font-size:.78rem">${esc(r.description)}</td>
      <td class="pl-num" style="color:#da9a4a;font-size:.78rem">+${fmt(r.amount)}</td>
    </tr>`).join('');
    incHtml = `
      <div style="margin-top:14px;border-top:1px solid #1a3040;padding-top:12px">
        <div style="color:#7ac8f0;font-size:.8rem;margin-bottom:8px;font-weight:600">تفصيل تسويات الجرد بالزيادة</div>
        <table class="pl-stmt" style="width:100%">
          <thead><tr>
            <th style="color:#506070;font-size:.75rem;text-align:right">التاريخ</th>
            <th style="color:#506070;font-size:.75rem;text-align:right">البيان</th>
            <th style="color:#506070;font-size:.75rem;text-align:left">المبلغ</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  box.innerHTML = `
    <table class="pl-stmt" style="width:100%;margin-bottom:4px">
      <thead><tr>
        <th style="color:#506070;font-size:.78rem;text-align:right">النوع</th>
        <th style="color:#506070;font-size:.78rem;text-align:left">عدد</th>
        <th style="color:#506070;font-size:.78rem;text-align:left">صافي الحركة (10302%)</th>
      </tr></thead>
      <tbody>${sumRows}</tbody>
    </table>
    <div style="margin-top:10px;padding:8px 10px;background:#0a1c2c;border-radius:6px;font-size:.75rem;color:#506070;border:1px solid #1a3040;line-height:1.8">
      هذه الحركات تُعدّل حساب المخزون الدائم <strong style="color:#7090a0">(10302%)</strong>
      وتُضمَّن في تكلفة المخزون بالجرد الدوري.
      فرق التقييم الكلي (دفتري − تقدير بالكميات):
      <strong style="color:#da9a4a">${fmt(adjAndOther)} ر.س</strong>
      ${adjAndOther >= 0
        ? '— المخزون الدفتري أعلى (FallbackCostInBase أو تكاليف لوجستية مدمجة).'
        : '— التقدير بالكميات أعلى (فجوة متوسط سعر الشراء عن التكلفة الفعلية في ERP).'}
    </div>
    ${incHtml}`;
}

function plcRenderChart(data, from, to, db) {
  if (_plCompChart) { _plCompChart.destroy(); _plCompChart = null; }
  const ctx = document.getElementById('plc-chart');
  if (!ctx) return;
  const rows = data.filter(r => r.month >= from && r.month <= to);
  if (!rows.length) return;

  const opening = plcOpeningFor(db);
  let runBi = (() => {
    const bMo = plcPrevMo(from);
    const br  = data.find(r => r.month === bMo) || (bMo <= opening.month ? opening : null);
    return +(br?.inv_balance || 0);
  })();

  const labels = [], perpArr = [], periArr = [];
  rows.forEach(r => {
    const peri = runBi
      + (+r.purchases||0) + (+r.abs_transport||0) + (+r.abs_transit||0)
      + (+r.abs_clearance||0) + (+r.inv_adj||0)
      - (+r.purch_returns||0) - (+r.inv_balance||0);
    periArr.push(peri);
    perpArr.push(+r.cogs_perp||0);
    labels.push(r.label);
    runBi = +r.inv_balance||0;
  });

  _plCompChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label:'الجرد الدائم',          data:perpArr, backgroundColor:'rgba(91,174,240,.65)',  borderColor:'#5baef0', borderWidth:1, borderRadius:3 },
      { label:'الجرد الدوري (تقريبي)', data:periArr, backgroundColor:'rgba(218,100,74,.65)', borderColor:'#da644a', borderWidth:1, borderRadius:3 },
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:'#9ab', font:{ family:'Tajawal', size:12 } } },
        tooltip:{ callbacks:{ label: c => `${c.dataset.label}: ${fmt(c.raw)} ر.س` } }
      },
      scales:{
        x:{ ticks:{ color:'#8090a0', font:{ family:'Tajawal' } }, grid:{ color:'#1e3040' } },
        y:{ ticks:{ color:'#8090a0', font:{ family:'Tajawal' }, callback: v => fmt(v) }, grid:{ color:'#1e3040' } }
      }
    }
  });
}

function plcRenderMonthly(data, from, to, db) {
  const el = document.getElementById('plc-monthly-tbl');
  if (!el) return;
  const rows = data.filter(r => r.month >= from && r.month <= to);
  if (!rows.length) { el.innerHTML = '<p style="color:#607080;text-align:center;padding:20px">لا توجد بيانات</p>'; return; }

  const opening = plcOpeningFor(db);
  let runBi = (() => {
    const bMo = plcPrevMo(from);
    const br  = data.find(r => r.month === bMo) || (bMo <= opening.month ? opening : null);
    return +(br?.inv_balance || 0);
  })();

  el.innerHTML = `<table class="pl-stmt" style="width:100%">
    <thead><tr style="color:#5090b0;font-size:.75rem">
      <th style="text-align:right;padding:6px 14px">الشهر</th>
      <th class="pl-num">الإيرادات</th>
      <th class="pl-num">ت. دائم</th>
      <th class="pl-num">ت. دوري *</th>
      <th class="pl-num">الفرق</th>
      <th class="pl-num">مخزون دفتري</th>
    </tr></thead>
    <tbody>${rows.map(r => {
      const peri = runBi
        + (+r.purchases||0) + (+r.abs_transport||0) + (+r.abs_transit||0)
        + (+r.abs_clearance||0) + (+r.inv_adj||0)
        - (+r.purch_returns||0) - (+r.inv_balance||0);
      const diff = (+r.cogs_perp||0) - peri;
      const dcls = diff > 500 ? 'color:#da4a4a' : diff < -500 ? 'color:#4ada8e' : 'color:#607080';
      runBi = +r.inv_balance||0;
      return `<tr>
        <td style="color:#9ab">${r.label}</td>
        <td class="pl-num">${fmt(r.revenue)}</td>
        <td class="pl-num">${fmt(r.cogs_perp)}</td>
        <td class="pl-num">${fmt(peri)}</td>
        <td class="pl-num" style="${dcls}">${diff>=0?'+':''}${fmt(diff)}</td>
        <td class="pl-num">${fmt(r.inv_balance)}</td>
      </tr>`;
    }).join('')}</tbody></table>
    <div style="padding:8px 14px;font-size:.73rem;color:#456070">
      * التكلفة الدورية الشهرية تقريبية (مخزون دفتري). التكلفة الدورية الحقيقية ظاهرة في الملخص أعلاه.
    </div>`;
}

function plcRenderObs(a) {
  const el = document.getElementById('plc-obs');
  if (!el) return;
  const obs = [];
  const gm = a.net_revenue ? a.gp_perp / a.net_revenue : 0;
  if (Math.abs(a.inv_overstatement) > 500000)
    obs.push(`⚠ فرق تقييم المخزون: ${fmt(Math.abs(a.inv_overstatement))} ر.س — ${
      a.inv_overstatement > 0
        ? 'المخزون الدفتري أعلى من التقدير بالكميات (FallbackCostInBase أو تكاليف لوجستية مدمجة)'
        : 'التقدير بالكميات أعلى من المخزون الدفتري (فجوة متوسط سعر الشراء عن تكلفة ERP الفعلية)'
    }`);
  if (a.write_down_cogs > 500000)
    obs.push(`⚠ خسائر هبوط مخزون: ${fmt(a.write_down_cogs)} ر.س — مُسجَّلة ضمن تكلفة البضاعة المباعة (DecreaseStock)`);
  if (gm < 0.05 && a.revenue > 0)
    obs.push(`⚠ هامش الربح الإجمالي منخفض (${fmtPct(gm*100)}) — راجع تسعير المبيعات وتكاليف الشراء`);
  if (a.returns_av > 0 && a.purchases_av > 0 && a.returns_av > a.purchases_av * 0.05)
    obs.push(`⚠ مردودات المشتريات مرتفعة: ${fmtPct(a.returns_av/a.purchases_av*100)} من فواتير الشراء (${fmt(a.returns_av)} ر.س)`);
  if (a.ni_perp < 0)
    obs.push(`⚠ خسارة صافية: ${fmt(Math.abs(a.ni_perp))} ر.س`);
  if (!obs.length || obs.every(o => o.startsWith('⚠ فرق تقييم') || o.startsWith('⚠ خسائر هبوط')))
    obs.push(`◈ الجرد الدائم يُظهر ربحاً منطقياً — فارق التقييم في تحليل المخزون أدناه`);
  if (!obs.length)
    obs.push('✓ لا توجد ملاحظات جوهرية للفترة المحددة');
  el.innerHTML = obs.map(o =>
    `<div class="v-ok" style="text-align:right;padding:9px 14px;margin-bottom:6px;border-radius:6px;background:#0a1c2c;border:1px solid #1e3040">${o}</div>`
  ).join('');
}

async function renderPLComparison() {
  const db  = document.getElementById('plc-db-sel')?.value || 'MekSoftDb1';
  const kpi = document.getElementById('plc-kpis');

  if (!_plCompInited) {
    _plCompInited = true;
    plcShowMode(document.getElementById('plc-mode-sel')?.value || 'all');
  }

  if (kpi) kpi.innerHTML = '<div style="color:#607080;padding:20px;grid-column:1/-1;text-align:center">جارٍ تحميل البيانات…</div>';

  let data;
  try { data = await plcFetch(db); }
  catch (e) {
    if (kpi) kpi.innerHTML = `<div style="color:#da4a4a;padding:20px;grid-column:1/-1;text-align:center">خطأ: ${esc(e.message)}</div>`;
    return;
  }

  plcPopulateFilters(data);
  const period = plcGetPeriod();
  if (!period) {
    if (kpi) kpi.innerHTML = '<div style="color:#607080;padding:20px;grid-column:1/-1;text-align:center">حدد الفترة للعرض</div>';
    return;
  }

  const labelEl = document.getElementById('plc-period-label');
  if (labelEl) labelEl.textContent = period.label;

  const a = plcAggregate(data, period.from, period.to, db);
  if (!a) {
    if (kpi) kpi.innerHTML = '<div style="color:#607080;padding:20px;grid-column:1/-1;text-align:center">لا توجد بيانات للفترة المحددة</div>';
    return;
  }

  renderOpenMonthBanner('plc-open-month-banner', State.get('pl') || []);
  plcRenderKPIs(a);
  plcRenderStatement(a);
  plcRenderRevenueBox(a);
  plcRenderCogsBox(a);
  plcRenderTransactionTable(a);
  plcRenderChart(data, period.from, period.to, db);
  plcRenderMonthly(data, period.from, period.to, db);
  plcRenderObs(a);

  // Fetch and render adj detail asynchronously (non-blocking)
  const adjCard = document.getElementById('plc-adj-card');
  if (adjCard) adjCard.style.display = 'none';
  plcFetchAdjDetail(db, period.from, period.to)
    .then(adjData => plcRenderAdjDetail(adjData, a.inv_overstatement))
    .catch(() => { if (adjCard) adjCard.style.display = 'none'; });

  const notesEl = document.getElementById('plc-notes');
  if (notesEl) {
    const saved = localStorage.getItem('plc-notes-' + period.label);
    notesEl.value = saved != null ? saved : '';
  }
}

// ── VERIFY — ERP sync check + financial health ─────────────────────────────────
const VERIFY_EPS = 1;
const CAT_NAMES_V = { sal:'رواتب وأجور', rent:'إيجار', maint:'صيانة وتشغيل', sell:'مبيعات وتسويق',
                      dist:'نقل وتوزيع', adm:'مصروفات إدارية', fin:'مصروفات مالية',
                      char:'مصروفات خيرية', oth:'مصروفات أخرى' };

async function runVerify() {
  const dbName = State.get('activeDb');
  if (!dbName) return;
  const btn = document.getElementById('verify-btn');
  if (btn) { btn.textContent = '⟳ جارٍ الفحص…'; btn.className = 'verify-btn vchk'; }
  try {
    const fresh = await fetch(`/api/verify?db=${encodeURIComponent(dbName)}`).then(r => r.json());
    if (fresh.error) throw new Error(fresh.error);

    const diffs  = _buildDiffs(fresh);
    const health = _buildHealth(fresh);
    const allOk  = diffs.length === 0 && health.every(h => h.pass);
    const ts     = new Date(fresh.timestamp).toLocaleTimeString('ar-SA');

    if (btn) {
      const failCount = diffs.length + health.filter(h => !h.pass).length;
      btn.textContent = failCount === 0 ? '✓ متطابق مع ERP' : `⚠ ${failCount} تنبيه`;
      btn.className   = failCount === 0 ? 'verify-btn vok' : 'verify-btn vwarn';
    }
    const meta = document.getElementById('verify-meta');
    if (meta) meta.textContent = `آخر فحص: ${ts} · ${fresh.accounts.count} حساب · ${fresh.bs.items.length} مجموعة · ${fresh.pl.months} شهر`;
    const body = document.getElementById('verify-body');
    if (body) body.innerHTML = _renderVerifyBody(diffs, health, fresh);
  } catch (e) {
    if (btn) { btn.textContent = '⚠ خطأ في الفحص'; btn.className = 'verify-btn verr'; }
    console.error('[verify]', e);
  }
}

function _buildDiffs(fresh) {
  const diffs = [];
  const add = (sec, name, dash, erp) => {
    const d = dash - erp;
    if (Math.abs(d) > VERIFY_EPS) diffs.push({ sec, name, dash, erp, d });
  };

  // ── قائمة الدخل ──
  const pa = aggregatePL(State.get('pl') || []);
  add('قائمة الدخل', 'الإيرادات',       pa.revenue,     fresh.pl.revenue);
  add('قائمة الدخل', 'تكلفة المبيعات',  pa.cogs,        fresh.pl.cogs);
  add('قائمة الدخل', 'مجمل الربح',      pa.grossProfit, fresh.pl.grossProfit);
  add('قائمة الدخل', 'رواتب وأجور',     pa.sal,         fresh.pl.sal);
  add('قائمة الدخل', 'إيجار',           pa.rent,        fresh.pl.rent);
  add('قائمة الدخل', 'صيانة وتشغيل',   pa.maint,       fresh.pl.maint);
  add('قائمة الدخل', 'مبيعات وتسويق',  pa.sell,        fresh.pl.sell);
  add('قائمة الدخل', 'نقل وتوزيع',     pa.dist,        fresh.pl.dist);
  add('قائمة الدخل', 'مصروفات إدارية', pa.adm,         fresh.pl.adm);
  add('قائمة الدخل', 'مصروفات مالية',  pa.fin,         fresh.pl.fin);
  add('قائمة الدخل', 'صافي الربح',      pa.netProfit,   fresh.pl.netProfit);

  // ── حسابات المصروفات — match by code+name (handles duplicate codes in ERP) ──
  const sa    = State.get('accounts') || [];
  const saKey = a => a.code + '|' + a.name;
  const saMap = new Map(sa.map(a => [saKey(a), a]));
  fresh.accounts.items.forEach(f => {
    const s = saMap.get(saKey(f));
    add('حسابات المصروفات', f.name, s ? s.total : 0, f.total);
  });
  const freshKeys = new Set(fresh.accounts.items.map(saKey));
  sa.forEach(s => {
    if (!freshKeys.has(saKey(s)) && s.total > VERIFY_EPS)
      diffs.push({ sec:'حسابات المصروفات', name:s.name, dash:s.total, erp:0, d:s.total });
  });

  // ── المركز المالي — match by grpCode (codes are unique at level-3) ──
  const sb    = State.get('bs') || [];
  const lastMo = [...new Set(sb.map(r => r.month))].sort().pop();
  if (lastMo && fresh.bs.items.length) {
    const slat   = sb.filter(r => r.month === lastMo);
    const slatMap = new Map(slat.map(r => [r.grpCode, r]));
    fresh.bs.items.forEach(f => {
      const s = slatMap.get(f.grpCode);
      add('المركز المالي', f.grpName, s ? s.balance : 0, f.balance);
    });
  }

  // ── الإيضاحات — بيانات الشهري حسب الفئة ──
  if (fresh.monthly) {
    const sm = State.get('monthly') || [];
    Object.keys(CAT_NAMES_V).forEach(k => {
      const dashVal = sm.reduce((s, m) => s + (m[k] || 0), 0);
      add('الإيضاحات (الشهري حسب الفئة)', CAT_NAMES_V[k], dashVal, fresh.monthly[k] || 0);
    });
  }

  return diffs;
}

function _buildHealth(fresh) {
  // Backend health checks
  const hcs = [...(fresh.healthChecks || [])];

  // ── Frontend: CF internal consistency ──
  const bsState  = State.get('bs')             || [];
  const plState  = State.get('pl')             || [];
  const bfState  = State.get('bankFacilities') || [];
  const cfAll    = cfMonthly(bsState, plState, bfState);
  const cfAgg    = aggregateCF(cfAll);
  if (cfAgg) {
    const cfSum   = cfAgg.operatingCF + cfAgg.investingCF + cfAgg.financingCF;
    const diff1   = Math.abs(cfSum - cfAgg.netCashChange);
    hcs.push({
      id: 'cf_reconcile',
      name: 'تسوية التدفقات النقدية (تشغيلي + استثماري + تمويلي = صافي التغيير)',
      pass: diff1 < 1,
      detail: `تشغيلي: ${fmtPlNum(cfAgg.operatingCF)} + استثماري: ${fmtPlNum(cfAgg.investingCF)} + تمويلي: ${fmtPlNum(cfAgg.financingCF)} = ${fmtPlNum(cfSum)} | صافي التغيير: ${fmtPlNum(cfAgg.netCashChange)} | الفرق: ${diff1.toFixed(2)}`
    });
    const diff2 = Math.abs(cfAgg.openingCash + cfAgg.netCashChange - cfAgg.closingCash);
    hcs.push({
      id: 'cf_cash_check',
      name: 'رصيد النقدية (أول الفترة + صافي التغيير = آخر الفترة)',
      pass: diff2 < 1,
      detail: `أول الفترة: ${fmt(cfAgg.openingCash)} + صافي: ${fmtPlNum(cfAgg.netCashChange)} = ${fmt(cfAgg.openingCash + cfAgg.netCashChange)} | آخر الفترة: ${fmt(cfAgg.closingCash)} | الفرق: ${diff2.toFixed(2)}`
    });
  }

  // ── Frontend: Ratios derived-data check ──
  const bsMths = [...new Set(bsState.map(r => r.month))].sort();
  const lastBsMo = bsMths[bsMths.length - 1];
  if (lastBsMo) {
    const r = computeRatios(bsState, plState, lastBsMo);
    if (r) {
      hcs.push({
        id: 'ratios_data_ok',
        name: 'بيانات النسب المالية مكتملة (BS + P&L متوفران)',
        pass: r.totalA > 0 && r.annRev > 0,
        detail: `إجمالي الأصول: ${fmt(r.totalA)} | الإيراد السنوي المُعدَّل: ${fmt(r.annRev)}`
      });
    }
  }

  return hcs;
}

function _renderVerifyBody(diffs, health, fresh) {
  const failHc  = health.filter(h => !h.pass);
  const passHc  = health.filter(h =>  h.pass);
  const hasDiff = diffs.length > 0;
  const hasFailHc = failHc.length > 0;

  let html = '';

  // ── Health check section ──────────────────────────────────────────────────
  html += `<div class="v-section">صحة القوائم المالية</div>`;
  html += `<table class="v-tbl" style="margin-bottom:18px">
    <thead><tr><th>الفحص</th><th style="width:70px;text-align:center">النتيجة</th><th>التفاصيل</th></tr></thead>
    <tbody>`;
  health.forEach(h => {
    const badge = h.pass
      ? `<span style="color:#4ada8e;font-weight:600">✓ ناجح</span>`
      : `<span style="color:#da4a4a;font-weight:600;animation:vpulse 1.5s infinite">✗ فشل</span>`;
    html += `<tr style="${h.pass ? '' : 'background:#120808'}">
      <td>${esc(h.name)}</td>
      <td style="text-align:center">${badge}</td>
      <td style="font-size:.74rem;color:#708090;font-family:monospace;direction:ltr;text-align:left">${esc(h.detail || '')}</td>
    </tr>`;
  });
  html += `</tbody></table>`;

  // ── Derived tabs notice ───────────────────────────────────────────────────
  html += `<div class="v-section">التبويبات المشتقة (تلقائياً من البيانات المُحقَّقة)</div>
  <div style="font-size:.79rem;padding:10px 12px;background:#06121e;border-radius:6px;margin-bottom:16px;line-height:2">
    <span style="color:#4ada8e">✓</span> <strong style="color:#a0c0e0">التدفقات النقدية</strong> — مشتقة من المركز المالي وقائمة الدخل<br>
    <span style="color:#4ada8e">✓</span> <strong style="color:#a0c0e0">النسب المالية</strong> — مشتقة من المركز المالي وقائمة الدخل<br>
    <span style="color:#4ada8e">✓</span> <strong style="color:#a0c0e0">الإيضاحات والتوجيهات</strong> — مشتقة من الشهري والمركز المالي والنسب
  </div>`;

  // ── ERP diff section ──────────────────────────────────────────────────────
  if (!hasDiff) {
    html += `<div class="v-ok" style="padding:20px 0">✓ جميع البيانات المباشرة متطابقة مع ERP</div>`;
  } else {
    const secs = {};
    diffs.forEach(d => { (secs[d.sec] = secs[d.sec] || []).push(d); });
    html += `<div class="v-section">فروق مقابل ERP</div>`;
    html += `<div style="padding:9px 12px;background:#1a0808;border-radius:6px;font-size:.78rem;color:#da7070;margin-bottom:12px">
      ⚠ يوجد ${diffs.length} فرق — قد يكون سببه تغيير قيود في ERP بعد آخر تحديث. اضغط الزر مجدداً للتحقق.
    </div>`;
    Object.entries(secs).forEach(([sec, rows]) => {
      html += `<div style="color:#7090b0;font-size:.73rem;font-weight:600;padding:6px 0 3px">${esc(sec)}</div>
      <table class="v-tbl">
        <thead><tr><th>البند</th><th class="num">الداشبورد</th><th class="num">ERP</th><th class="num">الفرق</th></tr></thead>
        <tbody>${rows.map(d => {
          const col  = Math.abs(d.d) > 10000 ? 'v-diff-hi' : 'v-diff-lo';
          const sign = d.d > 0 ? '+' : '';
          return `<tr><td>${esc(d.name)}</td>
            <td class="num">${fmt(d.dash)}</td>
            <td class="num">${fmt(d.erp)}</td>
            <td class="num ${col}">${sign}${fmt(d.d)}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
    });
  }

  return html;
}

// ── Safety Inventory Tab ───────────────────────────────────────────────────────
const SI_DATA = {
  today: '2026-06-01', period_days: 243,
  months: ['أكت 25','نوف 25','ديس 25','يناير 26','فبراير 26','مارس 26','أبريل 26','مايو 26'],
  items: [
    {id:4115,size:'0.5"',label:'0.5 بوصه',closing:386,avg_buy:26.21,avg_sell:27.39,doh_90d:1930,daily_90d:0.20,last_sale:'2026-03-28',days_since_sale:64,oldest_fifo_days:191,inv_value:10117,total_sold:94,turnover:0.49,dsi:496,monthly_sold:[0,0,22,25,29,18,0,0],status:'dead',status_ar:'بضاعة راكدة',recommendation:'liquidate',rec_ar:'تصفية — لا حركة منذ 64 يوماً'},
    {id:4125,size:'0.75"',label:'0.75 بوصه',closing:3635,avg_buy:25.53,avg_sell:35.75,doh_90d:7418,daily_90d:0.49,last_sale:'2026-03-25',days_since_sale:67,oldest_fifo_days:232,inv_value:92801,total_sold:733,turnover:0.40,dsi:608,monthly_sold:[0,42,9,8,629,45,0,0],status:'dead',status_ar:'بضاعة راكدة',recommendation:'liquidate',rec_ar:'تصفية — توقف الطلب كلياً منذ أبريل 2026'},
    {id:4117,size:'1"',label:'1 بوصه',closing:26328,avg_buy:37.78,avg_sell:53.30,doh_90d:680,daily_90d:38.68,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:208,inv_value:994441,total_sold:11316,turnover:0.86,dsi:282,monthly_sold:[0,483,1719,2214,3341,837,1205,1517],status:'red',status_ar:'تخزين مفرط',recommendation:'hold',rec_ar:'مراقبة — مخزون 22 شهر · لا شراء جديد'},
    {id:4108,size:'1.25"',label:'1.25 بوصه',closing:7403,avg_buy:51.05,avg_sell:72.95,doh_90d:622,daily_90d:11.89,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:243,inv_value:377923,total_sold:2572,turnover:0.49,dsi:496,monthly_sold:[0,208,421,336,513,182,533,379],status:'red',status_ar:'تخزين مفرط',recommendation:'hold',rec_ar:'توقف شراء — مخزون 20+ شهر · أقدم وحدة 8+ أشهر'},
    {id:4118,size:'1.5"',label:'1.5 بوصه',closing:2849,avg_buy:61.26,avg_sell:87.19,doh_90d:134,daily_90d:21.29,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:203,inv_value:174529,total_sold:5605,turnover:3.93,dsi:62,monthly_sold:[60,1625,576,663,722,472,923,564],status:'yellow',status_ar:'مراقبة',recommendation:'hold',rec_ar:'مراقبة — 4.5 شهر · طلب متذبذب'},
    {id:4119,size:'2"',label:'2 بوصه',closing:1860,avg_buy:82.53,avg_sell:117.23,doh_90d:71,daily_90d:26.32,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:22,inv_value:153506,total_sold:7475,turnover:8.04,dsi:30,monthly_sold:[135,1138,2372,1027,381,801,406,1215],status:'green',status_ar:'سليم',recommendation:'buy',rec_ar:'شراء قريباً — 71 يوماً فقط · مخزون حديث (22 يوم)'},
    {id:4120,size:'2.5"',label:'2.5 بوصه',closing:1427,avg_buy:129.88,avg_sell:186.79,doh_90d:129,daily_90d:11.07,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:186,inv_value:185348,total_sold:3866,turnover:5.40,dsi:45,monthly_sold:[16,1876,185,426,345,69,244,705],status:'yellow',status_ar:'مراقبة',recommendation:'hold',rec_ar:'مراقبة — مايو ارتفع قوياً (695 حبة) · أعد التقييم يونيو'},
    {id:4109,size:'3"',label:'3 بوصه',closing:1911,avg_buy:169.48,avg_sell:240.13,doh_90d:516,daily_90d:3.70,last_sale:'2026-05-25',days_since_sale:7,oldest_fifo_days:243,inv_value:323932,total_sold:1031,turnover:0.59,dsi:413,monthly_sold:[27,107,113,180,265,87,172,80],status:'red',status_ar:'تخزين مفرط',recommendation:'hold',rec_ar:'توقف شراء — 17 شهر · أقدم وحدة قبل أكتوبر 2025'},
    {id:4110,size:'4"',label:'4 بوصه',closing:2131,avg_buy:240.94,avg_sell:349.33,doh_90d:161,daily_90d:13.23,last_sale:'2026-05-25',days_since_sale:7,oldest_fifo_days:239,inv_value:513463,total_sold:2148,turnover:1.29,dsi:188,monthly_sold:[0,159,342,181,249,165,359,693],status:'yellow',status_ar:'مراقبة',recommendation:'buy',rec_ar:'نظر في طلب صغير — مايو قفز لـ 693 حبة · مخزون 5 أشهر فقط'},
    {id:4121,size:'5"',label:'5 بوصه',closing:6,avg_buy:458.86,avg_sell:472.65,doh_90d:9999,daily_90d:0,last_sale:'2026-02-17',days_since_sale:103,oldest_fifo_days:123,inv_value:2753,total_sold:50,turnover:16.7,dsi:15,monthly_sold:[0,0,0,0,50,0,0,0],status:'dead',status_ar:'متوقف',recommendation:'hold',rec_ar:'انتظر — 6 حبات متبقية فقط · بيعة واحدة في فبراير'},
    {id:4122,size:'6"',label:'6 بوصه',closing:41,avg_buy:440.75,avg_sell:610.11,doh_90d:5,daily_90d:8.35,last_sale:'2026-05-25',days_since_sale:7,oldest_fifo_days:54,inv_value:18071,total_sold:2285,turnover:108.8,dsi:2.2,monthly_sold:[99,363,410,383,262,73,205,490],status:'critical',status_ar:'🚨 نفاد وشيك',recommendation:'buy',rec_ar:'🚨 أمر شراء عاجل — أعلى منتج إيراداً · متوقع النفاد خلال 5 أيام'},
    {id:4123,size:'8"',label:'8 بوصه',closing:123,avg_buy:638.10,avg_sell:919.25,doh_90d:212,daily_90d:0.58,last_sale:'2026-05-07',days_since_sale:25,oldest_fifo_days:211,inv_value:78486,total_sold:199,turnover:3.22,dsi:75,monthly_sold:[0,19,40,9,78,6,27,20],status:'yellow',status_ar:'مراقبة',recommendation:'hold',rec_ar:'مراقبة — طلب متقطع وغير منتظم · 7 أشهر مخزون'}
  ]
};
const SI_PURCH = {
  4115:{net:12580.08,qty:480},4125:{net:111495.59,qty:4368},4117:{net:1414348.70,qty:37440},
  4108:{net:347342.98,qty:6804},4118:{net:507210.72,qty:8280},4119:{net:733808.04,qty:8892},
  4120:{net:593545.96,qty:4570},4109:{net:225406.94,qty:1330},4110:{net:710785.47,qty:2950},
  4121:{net:25695.60,qty:56},4122:{net:1021658.63,qty:2318},4123:{net:197810.69,qty:310}
};
// صافي الإيرادات بعد خصم مردودات البيع (من SalesReturnDetail)
const SI_SALES = {
  4115:{net:2574.85},    4125:{net:26202.75},   4117:{net:598065.48},
  4108:{net:186429.71},  4118:{net:472996.20},  4119:{net:833161.25},
  4120:{net:606329.63},  4109:{net:247079.37},  4110:{net:750354.51},
  4121:{net:23632.50},   4122:{net:1388116.00}, 4123:{net:170742.80}
};
// مردودات البيع (للعرض في الجدول المالي)
const SI_RETURNS = {
  4120:{net:112993.25,qty:604}, 4119:{net:43065.20,qty:368},
  4118:{net:15683.01,qty:181},  4123:{net:12088.80,qty:12},
  4122:{net:5430.30,qty:8},     4117:{net:5129.00,qty:95},
  4108:{net:1121.25,qty:15},    4109:{net:499.10,qty:2}
};
const SI_RECS = [
  {type:'buy',item:'6 بوصه (6")',why:'أعلى منتج مبيعاً (25.3% من الإيرادات). متبقٍ 41 حبة فقط بمعدل 8.3 حبة/يوم. النفاد خلال 5 أيام.',num:'أوصي بطلب فوري لا يقل عن 500–600 حبة'},
  {type:'buy',item:'2 بوصه (2")',why:'المخزون الحالي 1,860 حبة بمعدل 26.3 حبة/يوم = 71 يوم فقط. طلب مايو كان 1,215 حبة (ارتفاع). المخزون الحالي حديث (22 يوم).',num:'أوصي بطلب خلال 30 يوماً — كمية 2,000–2,500 حبة'},
  {type:'buy',item:'4 بوصه (4")',why:'مايو شهد قفزة استثنائية (693 حبة = 2.2× المتوسط). الاتجاه تصاعدي. آخر شراء كان أكتوبر 2025 (241 يوماً).',num:'ترقّب يونيو. إن استمر الاتجاه — اطلب 300–500 حبة'},
  {type:'liquidate',item:'0.75 بوصه (0.75")',why:'3,635 حبة متوقفة منذ 67 يوماً. قيمة 92,801 ر.س مجمّدة. خطر تقادم.',num:'خفِّض السعر 10-15% أو عرض على موزعين — استرداد 79,000+ ر.س'},
  {type:'liquidate',item:'0.5 بوصه (0.5")',why:'386 حبة بلا حركة منذ 64 يوماً. قيمة 10,117 ر.س مجمّدة.',num:'تصفية مع 0.75" في حزمة واحدة أو بيع للمنافسين'},
  {type:'hold',item:'1 بوصه (1")',why:'مخزون ضخم 26,328 حبة بقيمة 994,441 ر.س. مبيعات نشطة لكن 22 شهراً للتصفية. لا تشترِ قطعة واحدة إضافية.',num:'رأس مال مجمّد 994,441 ر.س — الأولوية للتحصيل لا الشراء'},
  {type:'hold',item:'1.25 بوصه (1.25")',why:'7,403 حبة وبعضها قبل أكتوبر 2025 (8+ أشهر). مبيعات متوسطة (12/يوم). DOH 622 يوم.',num:'توقف شراء — راجع بعد 6 أشهر'},
  {type:'hold',item:'3 بوصه (3")',why:'1,911 حبة بمنها وحدات من قبل أكتوبر 2025. معدل بيع منخفض (3.7/يوم). DOH 516 يوم.',num:'مراقبة — لا شراء حتى ينزل تحت 600 حبة'}
];

let _siRendered = false;

function renderSafetyInventory() {
  if (_siRendered) return;
  _siRendered = true;

  const D = SI_DATA;
  const fmtN  = v => (+v||0).toLocaleString('ar-SA', {maximumFractionDigits:0});
  const fmtD1 = v => (+v||0).toLocaleString('ar-SA', {maximumFractionDigits:1});
  const TODAY = new Date('2026-06-01');
  const SC = {critical:'#ff4444',red:'#f08080',yellow:'#f5c842',green:'#4ada8e',dead:'#b06bd4'};
  const PALETTE = ['#4a9eda','#f5a623','#4ada8e','#a78bfa','#f472b6','#34d399','#fb923c','#60a5fa','#e879f9','#a3e635','#fbbf24','#38bdf8'];

  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmtDate = d => d.toISOString().slice(0, 10);

  const ageClass = days => {
    if (days <= 30)  return {cls:'green', txt:'طازج (≤30 يوم)'};
    if (days <= 60)  return {cls:'green', txt:'حديث (31-60 يوم)'};
    if (days <= 90)  return {cls:'yellow',txt:'مقبول (61-90 يوم)'};
    if (days <= 180) return {cls:'yellow',txt:'يراقَب (91-180 يوم)'};
    if (days <= 240) return {cls:'red',   txt:'قديم (181-240 يوم)'};
    return {cls:'red', txt:'متقادم (240+ يوم)'};
  };

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalInv = D.items.reduce((s, it) => s + it.inv_value, 0);
  const riskInv  = D.items.filter(it => it.doh_90d > 180 || it.status === 'dead').reduce((s, it) => s + it.inv_value, 0);
  const avgDoh   = D.items.reduce((s, it) => s + (it.doh_90d > 2000 ? 2000 : it.doh_90d), 0) / D.items.length;
  const wdoh     = D.items.reduce((s, it) => { const d = it.doh_90d > 999 ? 999 : it.doh_90d; return s + (it.inv_value / totalInv) * d; }, 0);

  document.getElementById('si-kpis').innerHTML = [
    {lbl:'قيمة المخزون الإجمالية (تكلفة)',    val:'ر.س ' + fmtN(totalInv),       sub:'محسوبة بمتوسط أسعار الشراء',              accent:'#ff4444'},
    {lbl:'مخزون في خطر (>180 يوم أو راكد)',   val:'ر.س ' + fmtN(riskInv) + ' (' + ((riskInv/totalInv)*100).toFixed(0)+'%)', sub:'نسبة رأس المال المجمّد', accent:'#f5a623'},
    {lbl:'متوسط DOH المرجح للمحفظة',          val:fmtN(avgDoh) + ' يوم',          sub:'أيام إمداد بالسرعة الحالية',              accent:'#4ada8e'},
    {lbl:'DOH المرجح بالقيمة',                val:fmtN(wdoh) + ' يوم مرجّح',      sub:'مرجح بقيمة تكلفة كل صنف',               accent:'#60a5fa'},
    {lbl:'أبطأ دوران',                        val:'0.75" — 0.40×',                sub:'608 يوم لبيع المخزون كاملاً',             accent:'#a78bfa'},
    {lbl:'أسرع دوران',                        val:'6" — 108×',                    sub:'2.2 يوم متوسط للبيع (نفد تقريباً)',       accent:'#34d399'}
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Traffic Light ──────────────────────────────────────────────────────────
  document.getElementById('si-tl-grid').innerHTML = D.items.map(it => {
    const dohTxt = it.doh_90d > 2000 ? 'لانهائي' : it.doh_90d > 999 ? '+999 يوم' : fmtN(it.doh_90d) + ' يوم';
    const lastTxt = it.days_since_sale === 0 ? 'اليوم' : it.days_since_sale + ' يوم مضت';
    return `<div class="si-tl-card ${it.status}">
      <div class="si-tl-dot"></div>
      <div class="si-tl-status">${it.status_ar}</div>
      <div class="si-tl-size">${it.size}</div>
      <div class="si-tl-doh">إمداد: ${dohTxt}</div>
      <div class="si-tl-sub">آخر بيع: ${lastTxt} · عمر أقدم وحدة: ${it.oldest_fifo_days} يوم</div>
      <div class="si-tl-val">مخزون: ${fmtN(it.closing)} حبة · قيمة: ر.س ${fmtN(it.inv_value)}</div>
    </div>`;
  }).join('');

  // ── Heatmap ────────────────────────────────────────────────────────────────
  const maxPerItem = D.items.map(it => Math.max(...it.monthly_sold, 1));
  let hmHtml = `<thead><tr><th style="text-align:right">الصنف</th>`;
  D.months.forEach(m => hmHtml += `<th>${m}</th>`);
  hmHtml += '<th>الإجمالي</th></tr></thead><tbody>';
  D.items.forEach((it, i) => {
    hmHtml += `<tr><td style="color:#a0c4e8;white-space:nowrap">${it.size}</td>`;
    let tot = 0;
    it.monthly_sold.forEach(v => {
      tot += v;
      const intens = v / maxPerItem[i];
      const bg = v === 0 ? '#080f18' : intens < .2 ? '#0d3020' : intens < .4 ? '#1a5040' : intens < .6 ? '#2a7060' : intens < .8 ? '#3a9080' : '#4ada8e';
      const col = intens > .5 ? '#e2e8f0' : '#6a9a8a';
      hmHtml += `<td style="padding:3px 4px"><span class="si-hm-cell" style="background:${bg};color:${col}">${v > 0 ? fmtN(v) : '—'}</span></td>`;
    });
    hmHtml += `<td style="color:#c0d8f0;font-weight:700">${fmtN(tot)}</td></tr>`;
  });
  hmHtml += '</tbody>';
  document.getElementById('si-heatmap').innerHTML = hmHtml;

  // ── Aging Table ────────────────────────────────────────────────────────────
  let totInv2 = 0;
  document.getElementById('si-tbody-aging').innerHTML = D.items.map(it => {
    const ac = ageClass(it.oldest_fifo_days);
    const dohTxt = it.doh_90d > 2000 ? '∞ راكد' : it.doh_90d > 999 ? '+999' : fmtN(it.doh_90d);
    const dsiTxt = it.dsi > 999 ? '+999' : fmtN(it.dsi);
    const projDate = it.daily_90d > 0 ? fmtDate(addDays(TODAY, Math.round(it.closing / it.daily_90d))) : 'لا حركة';
    totInv2 += it.inv_value;
    const dohColor = it.doh_90d > 180 ? '#f08080' : it.doh_90d > 90 ? '#f5c842' : '#4ada8e';
    const projColor = it.doh_90d < 60 ? '#ff4444' : it.doh_90d < 120 ? '#f5c842' : '#6a8aaa';
    return `<tr>
      <td><strong>${esc(it.label)}</strong></td>
      <td class="num">${fmtN(it.closing)}</td>
      <td class="num" style="color:#f5a623">${fmtN(it.inv_value)}</td>
      <td><span class="si-sbadge ${ac.cls}">${ac.txt}</span><br><small style="color:#5a7a9a">${it.oldest_fifo_days} يوم</small></td>
      <td class="num" style="color:${dohColor}">${dohTxt}</td>
      <td class="num">${fmtD1(it.turnover)}×</td>
      <td class="num">${dsiTxt} يوم</td>
      <td class="num">${it.daily_90d > 0 ? fmtD1(it.daily_90d) : '—'}</td>
      <td style="font-size:.72rem;color:${projColor}">${projDate}</td>
      <td><span class="si-sbadge ${it.status}">${it.status_ar}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('si-tfoot-aging').innerHTML = `<tr style="font-weight:700;background:#0a1e30;border-top:2px solid #1e3a5f">
    <td>الإجمالي</td>
    <td class="num">${fmtN(D.items.reduce((s, it) => s + it.closing, 0))}</td>
    <td class="num" style="color:#f5a623">${fmtN(totInv2)}</td>
    <td colspan="8"></td>
  </tr>`;

  // ── Stockout Projection ────────────────────────────────────────────────────
  document.getElementById('si-tbody-proj').innerHTML = D.items.map(it => {
    if (it.daily_90d === 0) {
      return `<tr>
        <td><strong>${esc(it.label)}</strong></td><td class="num">${fmtN(it.closing)}</td><td class="num">—</td>
        <td class="num" style="color:#b06bd4">لا حركة</td><td style="color:#b06bd4">غير محدد</td>
        <td style="font-size:.72rem">${it.last_sale||'—'}</td><td class="num">—</td>
        <td><span class="si-sbadge dead">مراجعة</span></td>
      </tr>`;
    }
    const doh = Math.round(it.closing / it.daily_90d);
    const stockoutDate = fmtDate(addDays(TODAY, doh));
    const safetyMonths = (doh / 30).toFixed(1);
    const urg = doh < 30 ? 'critical' : doh < 60 ? 'red' : doh < 120 ? 'yellow' : 'green';
    const dec = doh < 30 ? '🚨 عاجل' : doh < 60 ? 'طلب قريب' : doh < 120 ? 'مراقبة' : 'كافٍ';
    const urgColor = urg === 'critical' ? '#ff4444' : urg === 'red' ? '#f08080' : urg === 'yellow' ? '#f5c842' : '#4ada8e';
    return `<tr>
      <td><strong>${esc(it.label)}</strong></td>
      <td class="num">${fmtN(it.closing)}</td>
      <td class="num">${fmtD1(it.daily_90d)}</td>
      <td class="num" style="color:${urgColor};font-weight:700">${doh > 999 ? '+999' : fmtN(doh)} يوم</td>
      <td style="font-size:.75rem;color:${urg==='critical'?'#ff4444':'#8aa8cc'}">${doh > 999 ? '—' : stockoutDate}</td>
      <td style="font-size:.72rem">${it.last_sale||'—'}</td>
      <td class="num" style="color:${urg==='critical'?'#ff4444':urg==='red'?'#f08080':'#6a8aaa'}">${doh > 999 ? '+33' : safetyMonths} شهر</td>
      <td><span class="si-sbadge ${urg}">${dec}</span></td>
    </tr>`;
  }).join('');

  // ── Recommendations ────────────────────────────────────────────────────────
  document.getElementById('si-rec-grid').innerHTML = SI_RECS.map(r => `
    <div class="si-rec-card ${r.type}">
      <div class="si-rec-action">${r.type==='buy'?'🟢 شراء':r.type==='liquidate'?'🔴 تصفية':'🔵 انتظار'}</div>
      <div class="si-rec-item">${esc(r.item)}</div>
      <div class="si-rec-why">${esc(r.why)}</div>
      <div class="si-rec-num">${esc(r.num)}</div>
    </div>`).join('');

  // ── Financial Summary ──────────────────────────────────────────────────────
  let totBuy = 0, totGross = 0, totRet = 0, totNetSell = 0, totRemVal = 0, totLocked = 0;
  document.getElementById('si-tbody-fin').innerHTML = D.items.map(it => {
    const pb  = SI_PURCH[it.id]   || {net:0,qty:1};
    const sb  = SI_SALES[it.id]   || {net:0};     // صافي الإيرادات (بعد المردودات)
    const ret = SI_RETURNS[it.id] || {net:0,qty:0};
    const grossSales = sb.net + ret.net;           // الإيرادات الإجمالية
    const gp = sb.net - pb.net * (it.total_sold / pb.qty);
    const margin = sb.net > 0 ? gp / sb.net * 100 : 0;
    const soldPct = it.total_sold / (it.total_sold + it.closing) * 100;
    const isLocked = it.turnover < 2;
    totBuy += pb.net; totGross += grossSales; totRet += ret.net;
    totNetSell += sb.net; totRemVal += it.inv_value;
    if (isLocked) totLocked += it.inv_value;
    const mColor = margin > 15 ? '#4ada8e' : margin > 5 ? '#f5c842' : '#f08080';
    const retCell = ret.net > 0
      ? `<span class="num" style="color:#f08080">−${fmtN(ret.net)}</span><br><small style="color:#5a6a7a">${fmtN(ret.qty)} حبة</small>`
      : `<span style="color:#3a5a4a">—</span>`;
    return `<tr>
      <td><strong>${esc(it.label)}</strong></td>
      <td class="num" style="color:#f5a623">${fmtN(pb.net)}</td>
      <td class="num" style="color:#6a9aba">${fmtN(grossSales)}</td>
      <td class="num">${retCell}</td>
      <td class="num" style="color:#4a9eda;font-weight:600">${fmtN(sb.net)}</td>
      <td class="num" style="color:${mColor};font-weight:700">${fmtD1(margin)}%</td>
      <td class="num" style="color:${it.inv_value>300000?'#f08080':'#8aa8cc'}">${fmtN(it.inv_value)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:56px;background:#0a1e30;border-radius:3px;height:5px">
            <div style="width:${Math.min(soldPct,100)}%;height:5px;border-radius:3px;background:${soldPct>70?'#4ada8e':soldPct>40?'#f5c842':'#f08080'}"></div>
          </div>
          <span style="font-size:.78rem">${fmtD1(soldPct)}%</span>
        </div>
      </td>
      <td>${isLocked ? `<span class="num" style="color:#f08080">${fmtN(it.inv_value)} ر.س</span>` : '<span style="color:#4ada8e">✓ دوران سليم</span>'}</td>
    </tr>`;
  }).join('');
  const totMargin = totNetSell > 0 ? (totNetSell - totBuy) / totNetSell * 100 : 0;
  document.getElementById('si-tfoot-fin').innerHTML = `<tr style="font-weight:700;background:#0a1e30;border-top:2px solid #1e3a5f">
    <td>الإجمالي</td>
    <td class="num" style="color:#f5a623">${fmtN(totBuy)}</td>
    <td class="num" style="color:#6a9aba">${fmtN(totGross)}</td>
    <td class="num" style="color:#f08080">−${fmtN(totRet)}</td>
    <td class="num" style="color:#4a9eda;font-weight:700">${fmtN(totNetSell)}</td>
    <td class="num" style="color:${totMargin>0?'#4ada8e':'#f08080'};font-weight:700">${fmtD1(totMargin)}%</td>
    <td class="num" style="color:#f5a623">${fmtN(totRemVal)}</td>
    <td></td>
    <td class="num" style="color:#f08080">${fmtN(totLocked)} ر.س مجمّد</td>
  </tr>`;

  // ── Charts ─────────────────────────────────────────────────────────────────
  new Chart(document.getElementById('si-chart-bubble'), {
    type: 'bubble',
    data: { datasets: D.items.map((it, i) => ({
      label: it.size,
      data: [{x: Math.min(it.doh_90d, 999), y: it.inv_value, r: Math.max(Math.sqrt(it.inv_value / 5000) * 3, 5)}],
      backgroundColor: SC[it.status] + '88', borderColor: SC[it.status], borderWidth: 2
    }))},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {labels:{color:'#6a8aaa',font:{size:10},boxWidth:10}},
        tooltip: {callbacks:{label: ctx => `${ctx.dataset.label}: DOH=${ctx.raw.x} يوم | قيمة=ر.س ${fmtN(ctx.raw.y)}`}}
      },
      scales: {
        x: {title:{display:true,text:'أيام الإمداد (DOH)',color:'#6a8aaa'},ticks:{color:'#6a8aaa'},grid:{color:'#1a2233'},min:0,max:700},
        y: {title:{display:true,text:'قيمة المخزون (ر.س)',color:'#6a8aaa'},ticks:{color:'#6a8aaa',callback:v=>'ر.س '+fmtN(v)},grid:{color:'#1a2233'}}
      }
    }
  });

  new Chart(document.getElementById('si-chart-turnover'), {
    type: 'bar',
    data: {
      labels: D.items.map(it => it.size),
      datasets: [{
        label: 'معدل الدوران السنوي (×)',
        data: D.items.map(it => Math.min(it.turnover * (365 / 243), 50)),
        backgroundColor: D.items.map(it => SC[it.status] + '88'),
        borderColor: D.items.map(it => SC[it.status]), borderWidth: 2, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {legend:{display:false}, tooltip:{callbacks:{label:ctx=>'معدل الدوران: '+ctx.raw.toFixed(1)+'× سنوياً'}}},
      scales: {
        x: {ticks:{color:'#6a8aaa'},grid:{color:'#1a2233'},title:{display:true,text:'دورة/سنة — الصحي: ≥4×',color:'#6a8aaa'}},
        y: {ticks:{color:'#cdd2dd'},grid:{display:false}}
      }
    }
  });

  new Chart(document.getElementById('si-chart-stockout'), {
    type: 'bar',
    data: {
      labels: D.items.map(it => it.size),
      datasets: [{
        label: 'أيام الإمداد المتبقية',
        data: D.items.map(it => it.daily_90d > 0 ? Math.min(Math.round(it.closing / it.daily_90d), 999) : 999),
        backgroundColor: D.items.map(it => {
          if (it.status === 'dead') return '#9b59b688';
          const d = it.daily_90d > 0 ? it.closing / it.daily_90d : 999;
          return d < 30 ? '#ff4444aa' : d < 90 ? '#f08080aa' : d < 180 ? '#f5c84288' : '#4ada8e44';
        }),
        borderColor: D.items.map(it => SC[it.status]), borderWidth: 2, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {legend:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.raw>=999?'راكد / بلا حركة':'متبقٍ '+ctx.raw+' يوم'}}},
      scales: {
        x: {ticks:{color:'#cdd2dd'},grid:{display:false}},
        y: {ticks:{color:'#6a8aaa',callback:v=>v>=999?'∞':v+' يوم'},grid:{color:'#1a2233'},title:{display:true,text:'الأيام المتبقية',color:'#6a8aaa'}}
      }
    }
  });

  const activeItems = D.items.filter(it => it.daily_90d > 5).sort((a, b) => b.daily_90d - a.daily_90d);
  new Chart(document.getElementById('si-chart-velocity'), {
    type: 'line',
    data: {
      labels: D.months,
      datasets: activeItems.map((it, i) => ({
        label: it.size, data: it.monthly_sold,
        borderColor: PALETTE[i], backgroundColor: 'transparent',
        borderWidth: 2, pointRadius: 3, tension: .3
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {legend:{labels:{color:'#8aa8cc',font:{size:10},boxWidth:10}}},
      scales: {
        x: {ticks:{color:'#6a8aaa'},grid:{color:'#1a2233'}},
        y: {ticks:{color:'#6a8aaa',callback:v=>v+' ح'},grid:{color:'#1a2233'}}
      }
    }
  });

  new Chart(document.getElementById('si-chart-margin'), {
    type: 'bar',
    data: {
      labels: D.items.map(it => it.size),
      datasets: [
        {label:'سعر الشراء (ر.س/حبة)',data:D.items.map(it=>it.avg_buy),backgroundColor:'#f5a62388',borderColor:'#f5a623',borderWidth:1,borderRadius:3},
        {label:'سعر البيع (ر.س/حبة)', data:D.items.map(it=>it.avg_sell),backgroundColor:'#4a9eda88',borderColor:'#4a9eda',borderWidth:1,borderRadius:3}
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {legend:{labels:{color:'#8aa8cc',font:{size:10}}}},
      scales: {
        x: {ticks:{color:'#cdd2dd',font:{size:9}},grid:{display:false}},
        y: {ticks:{color:'#6a8aaa',callback:v=>'ر.س '+v},grid:{color:'#1a2233'}}
      }
    }
  });
}

// ── Safety Excel Export ────────────────────────────────────────────────────────
window.siExportExcel = async function() {
  const D = SI_DATA;
  const TODAY = new Date('2026-06-01');
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmtDate = d => d.toISOString().slice(0, 10);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Safety Inventory Analysis'; wb.created = new Date();
  const rtl = [{rightToLeft: true}];

  const ws1 = wb.addWorksheet('تحليل الدوران والعمر'); ws1.views = rtl;
  ws1.addRow(['الصنف','المخزون (حبة)','قيمة التكلفة (ر.س)','أقدم وحدة (يوم)','DOH (يوم)','معدل الدوران','DSI (يوم)','سرعة 90 يوم','توقع النفاد','الحالة'])
    .eachCell(c => c.style = {font:{bold:true,color:{argb:'FF7AABCC'}}});
  D.items.forEach(it => {
    const projDate = it.daily_90d > 0 ? fmtDate(addDays(TODAY, Math.round(it.closing / it.daily_90d))) : 'لا حركة';
    ws1.addRow([it.label, it.closing, it.inv_value, it.oldest_fifo_days,
      it.doh_90d > 999 ? '>999' : Math.round(it.doh_90d),
      it.turnover.toFixed(2) + '×', it.dsi > 999 ? '>999' : it.dsi,
      it.daily_90d > 0 ? it.daily_90d.toFixed(1) : '0', projDate, it.status_ar]);
  });

  const ws2 = wb.addWorksheet('المخاطر المالية'); ws2.views = rtl;
  ws2.addRow(['الصنف','قيمة الشراء','إيرادات إجمالية','مردودات','صافي الإيرادات','هامش الربح %','قيمة المخزون المتبقي','نسبة التحصيل %','رأس مال مجمّد'])
    .eachCell(c => c.style = {font:{bold:true}});
  D.items.forEach(it => {
    const pb  = SI_PURCH[it.id]   || {net:0,qty:1};
    const sb  = SI_SALES[it.id]   || {net:0};
    const ret = SI_RETURNS[it.id] || {net:0,qty:0};
    const gross = sb.net + ret.net;
    const gp = sb.net - pb.net * (it.total_sold / pb.qty);
    const margin = sb.net > 0 ? gp / sb.net * 100 : 0;
    const soldPct = it.total_sold / (it.total_sold + it.closing) * 100;
    ws2.addRow([it.label, pb.net.toFixed(0), gross.toFixed(0),
      ret.net > 0 ? '-' + ret.net.toFixed(0) : '—', sb.net.toFixed(0),
      margin.toFixed(1) + '%', it.inv_value.toFixed(0),
      soldPct.toFixed(1) + '%', it.turnover < 2 ? it.inv_value.toFixed(0) : '—']);
  });

  const ws3 = wb.addWorksheet('التوصيات'); ws3.views = rtl;
  ws3.addRow(['الصنف','القرار','السبب','الإجراء المقترح']).eachCell(c => c.style = {font:{bold:true}});
  SI_RECS.forEach(r => ws3.addRow([r.item, r.type==='buy'?'شراء':r.type==='liquidate'?'تصفية':'انتظار', r.why, r.num]));

  const ws4 = wb.addWorksheet('مبيعات شهرية'); ws4.views = rtl;
  ws4.addRow(['الصنف', ...D.months, 'الإجمالي']).eachCell(c => c.style = {font:{bold:true}});
  D.items.forEach(it => ws4.addRow([it.label, ...it.monthly_sold, it.monthly_sold.reduce((s,v)=>s+v,0)]));

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download = 'safety-inventory-' + D.today + '.xlsx';
  a.click();
};

// ═══════════════════════════════════════════════════════════════════════
// ── FINANCIAL MODEL TAB ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// المصدر: ERP MekSoftDb1 — إيراد = إجمالي حـ/5xx (صافي دائن) + إعادة المردودات | مردودات = حـ/203
// cogs = حـ/124 صافي (مدين−دائن) | opex = إجمالي حـ/4xx − COGS | النتيجة = صافي ربح فعلي من ERP
const FM_HIST = [
  {m:'أكتوبر 2025', s:'أكت-25', gross:10074227, returns:336993,  cogs:7620084,  inv_adj:0, opex:768465,  purch:12555074},
  {m:'نوفمبر 2025', s:'نوف-25', gross:10672976, returns:260543,  cogs:9729111,  inv_adj:0, opex:1022912, purch:20579359},
  {m:'ديسمبر 2025', s:'ديس-25', gross:13040385, returns:111138,  cogs:11900850, inv_adj:0, opex:423051,  purch:13011935},
  {m:'يناير 2026',  s:'ين-26',  gross:13886208, returns:1052545, cogs:11805336, inv_adj:0, opex:867634,  purch:12924362},
  {m:'فبراير 2026', s:'فب-26',  gross:9776851,  returns:309589,  cogs:8675439,  inv_adj:0, opex:912828,  purch:9798093},
  {m:'مارس 2026',   s:'مر-26',  gross:6979260,  returns:238724,  cogs:6094847,  inv_adj:0, opex:1019327, purch:7205597},
  {m:'أبريل 2026',  s:'أب-26',  gross:8412962,  returns:92058,   cogs:7160100,  inv_adj:0, opex:854262,  purch:8977993},
  {m:'مايو 2026',   s:'مي-26',  gross:8966588,  returns:153401,  cogs:7235469,  inv_adj:0, opex:792333,  purch:3954870},
];

// FM_OPEX_CAT — مستخرج من ERP حساب 402xxx فعلياً (أكت-25 → مي-26)
const FM_OPEX_CAT = {
  sal:      [227560, 237976, 240010, 212154, 242825, 236794, 197164, 177700],
  hr:       [39712,  35342,  73511,  43086,  58481,  65632,  112198, 90104],
  rent:     [161621, 161621, -36692, 135808, 135808, 135808, 135808, 135808],
  transport:[31507,  56812,  51042,  40363,  28790,  42727,  40113,  26964],
  sales:    [20000,  0,      0,      0,      31500,  56792,  14792,  9092],
  finance:  [166737, 161749, 160628, 278484, 278922, 258812, 263880, 264101],
  govt:     [36555,  328291, -148622,32502,  44918,  13230,  40126,  28996],
  oth:      [84773,  41121,  83174,  125237, 91584,  209532, 50181,  59568],
};

const FM_BUDGET_GROSS  = [6200000,9000000,8500000,10500000,13000000,13500000,14500000];
const FM_BUDGET_MONTHS = ['يونيو 2026','يوليو 2026','أغسطس 2026','سبتمبر 2026','أكتوبر 2026','نوفمبر 2026','ديسمبر 2026'];
const FM_BUDGET_SHORT  = ['يون-26','يول-26','أغس-26','سب-26','أكت-26','نوف-26','ديس-26'];
const FM_FIXED_OPEX    = 850000;
const FM_VAR_PCT       = 0.038;
const FM_SCENARIOS     = {
  cons:{factor:0.80,gm:0.18,label:'تحفظي (−20%)',color:'#f5a623'},
  base:{factor:1.00,gm:0.22,label:'قاعدي',       color:'#4a9eda'},
  opt: {factor:1.15,gm:0.26,label:'متفائل (+15%)',color:'#4ada8e'},
};

const FM_CHARTS = {};
let _fmRendered = false;
let _fmScenario = 'base';

function renderFinancialModel() {
  if (_fmRendered) return;
  _fmRendered = true;

  const f  = n => (+n||0).toLocaleString('ar-SA', {maximumFractionDigits:0});
  const fM = n => (n/1e6).toFixed(2) + ' م';
  const fP = n => (isFinite(n) ? (+n).toFixed(1) : '—') + '%';
  const cg = v => v >= 0 ? '#4ada8e' : '#da4a4a';
  const pColor = v => v >= 20 ? '#4ada8e' : v >= 10 ? '#f5a623' : '#da4a4a';

  function derive(d) {
    const net = d.gross - d.returns;
    const adjCogs = d.cogs;
    const gp = net - adjCogs;
    const gpPct = net > 0 ? gp / net * 100 : 0;
    const eb = gp - d.opex;
    const ebPct = net > 0 ? eb / net * 100 : 0;
    return {...d, net, adjCogs, gp, gpPct, eb, ebPct};
  }

  function budgetRow(bg, sc) {
    const gross = bg * sc.factor;
    const returns = gross * 0.03;
    const net = gross - returns;
    const cogs = net * (1 - sc.gm);
    const gp = net * sc.gm;
    const opex = FM_FIXED_OPEX + net * FM_VAR_PCT;
    const eb = gp - opex;
    return {gross, returns, net, cogs, gp, opex, eb, gpPct:sc.gm*100, ebPct:net>0?eb/net*100:0};
  }

  const rows = FM_HIST.map(derive);
  const totG = rows.reduce((s,r)=>s+r.gross,0);
  const totR = rows.reduce((s,r)=>s+r.returns,0);
  const totN = rows.reduce((s,r)=>s+r.net,0);
  const totC = rows.reduce((s,r)=>s+r.adjCogs,0);
  const totGP = totN - totC;
  const totOpEx = rows.reduce((s,r)=>s+r.opex,0);
  const totEB = totGP - totOpEx;

  // ── inject CSS ──────────────────────────────────────────────────────
  if (!document.getElementById('fm-css')) {
    const s = document.createElement('style'); s.id='fm-css';
    s.textContent = `
      .fm-section{background:#0f2035;border:1px solid #1e3a5f;border-radius:10px;padding:18px 22px;margin-bottom:18px}
      .fm-title{font-size:.9rem;color:#a0c4e8;font-weight:600;margin-bottom:14px}
      .fm-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
      @media(max-width:900px){.fm-kpis{grid-template-columns:repeat(2,1fr)}}
      .fm-kpi{background:#0a1e30;border:1px solid #1e3a5f;border-radius:9px;padding:12px 14px;position:relative;overflow:hidden}
      .fm-kpi::before{content:'';position:absolute;top:0;right:0;width:3px;height:100%;background:var(--fma,#3a7abf)}
      .fm-kpi .lbl{font-size:.72rem;color:#7090b0;margin-bottom:3px}
      .fm-kpi .val{font-size:1.15rem;font-weight:700;color:#e0f0ff}
      .fm-kpi .sub{font-size:.7rem;color:#5a7a9a;margin-top:2px}
      .fm-charts-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
      .fm-charts-row.full{grid-template-columns:1fr}
      @media(max-width:900px){.fm-charts-row{grid-template-columns:1fr}}
      .fm-chart-box{background:#0f2035;border:1px solid #1e3a5f;border-radius:10px;padding:14px 16px}
      .fm-chart-wrap{position:relative;height:240px}
      .fm-chart-wrap.tall{height:300px}
      .fm-notice{background:#1a2a0a;border:1px solid #3a5a1a;border-radius:7px;padding:9px 14px;font-size:.78rem;color:#a0c060;margin-bottom:14px}
      .fm-notice.warn{background:#2a1a0a;border-color:#5a3a1a;color:#e0a060}
      .fm-sc-wrap{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
      .fm-sc-btn{padding:6px 16px;border-radius:6px;border:1px solid #1e3a5f;cursor:pointer;font-size:.8rem;color:#7090b0;background:#0a1e30;transition:all .2s}
      .fm-sc-btn.active.cons{border-color:#f5a623;color:#f5a623;background:#2a1a0a}
      .fm-sc-btn.active.base{border-color:#4a9eda;color:#4a9eda;background:#0a1a2a}
      .fm-sc-btn.active.opt {border-color:#4ada8e;color:#4ada8e;background:#0a2a1a}
      .fm-ratio-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      @media(max-width:900px){.fm-ratio-grid{grid-template-columns:repeat(2,1fr)}}
      .fm-ratio{background:#0a1e30;border:1px solid #1e3a5f;border-radius:8px;padding:10px 12px}
      .fm-ratio .name{font-size:.7rem;color:#7090b0;margin-bottom:2px}
      .fm-ratio .value{font-size:1.05rem;font-weight:700}
      .fm-ratio .bench{font-size:.68rem;color:#5a7a9a;margin-top:2px}
      .fm-rec-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media(max-width:900px){.fm-rec-grid{grid-template-columns:1fr}}
      .fm-rec{background:#0a1e30;border-right:3px solid var(--fmrc,#3a7abf);border-radius:7px;padding:10px 12px}
      .fm-rec .pri{font-size:.7rem;font-weight:700;margin-bottom:3px}
      .fm-rec .ttl{font-size:.83rem;font-weight:600;color:#c8d8e8;margin-bottom:4px}
      .fm-rec .bdy{font-size:.76rem;color:#7090b0;line-height:1.55}
      .fm-anomaly{background:#2a1500;border:1px solid #5a3000}
    `;
    document.head.appendChild(s);
  }

  // ── P&L table rows ──────────────────────────────────────────────────
  const plRows = rows.map((r,i) => {
    return `<tr>
      <td>${r.m}</td>
      <td class="num">${f(r.gross)}</td>
      <td class="num" style="color:#da9a4a">(${f(r.returns)})</td>
      <td class="num" style="color:#4ada8e">${f(r.net)}</td>
      <td class="num" style="color:#e08080">(${f(r.adjCogs)})</td>
      <td class="num" style="color:${cg(r.gp)}">${r.gp<0?'('+f(-r.gp)+')':f(r.gp)}</td>
      <td style="color:${pColor(r.gpPct)}">${fP(r.gpPct)}</td>
      <td class="num" style="color:#e08080">(${f(r.opex)})</td>
      <td class="num" style="color:${cg(r.eb)}">${r.eb<0?'('+f(-r.eb)+')':f(r.eb)}</td>
      <td style="color:${pColor(r.ebPct)}">${fP(r.ebPct)}</td>
    </tr>`;
  }).join('');

  // ── OpEx cat table ──────────────────────────────────────────────────
  const catLabels = {sal:'رواتب (أساسي)',hr:'مزايا وبدلات وتأمينات',rent:'إيجارات',
    transport:'نقل وتوزيع',sales:'عمولات وتسويق',finance:'تكاليف تمويلية',
    govt:'جمارك ورسوم حكومية',oth:'صيانة ومتنوعات وإدارية'};
  const catColors = {sal:'#4a9eda',hr:'#a78bfa',rent:'#f5a623',transport:'#34d399',
    sales:'#f472b6',finance:'#da4a4a',govt:'#60a5fa',oth:'#e0c060'};
  const opexCatRows = Object.entries(FM_OPEX_CAT).map(([k,vals])=>{
    const total = vals.reduce((s,v)=>s+v,0);
    const avg   = total / 8;
    const pct   = totOpEx/8 > 0 ? avg/(totOpEx/8)*100 : 0;
    const col   = catColors[k] || '#a0c4e8';
    const dot   = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${col};margin-left:6px;vertical-align:middle;flex-shrink:0"></span>`;
    const fv    = v => v < 0
      ? `<span style="color:#f5a623">(${f(-v)})</span>`
      : `<span>${f(v)}</span>`;
    return `<tr>
      <td style="white-space:nowrap">${dot}${catLabels[k]}</td>
      ${vals.map(v=>`<td class="num">${fv(v)}</td>`).join('')}
      <td class="num" style="color:${col};font-weight:600">${f(avg)}</td>
      <td style="color:${pct>25?'#da4a4a':pct>15?'#f5a623':'#4ada8e'};font-weight:600">${fP(pct)}</td>
    </tr>`;
  }).join('');

  // opex per month from FM_HIST (= ERP total 4xxx − COGS); FM_OPEX_CAT body is a category estimate
  const opexTotals = FM_HIST.map(d=>d.opex);
  const opexAvg = totOpEx/8;

  // ── Inject HTML ─────────────────────────────────────────────────────
  document.getElementById('tab-finmodel').innerHTML = `

  <!-- Summary KPIs -->
  <div class="fm-kpis">
    <div class="fm-kpi" style="--fma:#5baef0"><div class="lbl">إجمالي الإيراد الصافي (8 أشهر)</div><div class="val">${fM(totN)} ر.س</div><div class="sub">مردودات: ${fM(totR)} (${fP(totR/totG*100)})</div></div>
    <div class="fm-kpi" style="--fma:#4ada8e"><div class="lbl">مجمل الربح (معدّل)</div><div class="val">${fM(totGP)} ر.س</div><div class="sub">هامش: ${fP(totGP/totN*100)}</div></div>
    <div class="fm-kpi" style="--fma:#da4a4a"><div class="lbl">إجمالي المصروفات</div><div class="val">${fM(totOpEx)} ر.س</div><div class="sub">متوسط شهري: ${fM(totOpEx/8)} ر.س</div></div>
    <div class="fm-kpi" style="--fma:${cg(totEB)}"><div class="lbl">EBITDA (معدّل)</div><div class="val" style="color:${cg(totEB)}">${fM(totEB)} ر.س</div><div class="sub">هامش: ${fP(totEB/totN*100)}</div></div>
    <div class="fm-kpi" style="--fma:#f5a623"><div class="lbl">إجمالي المشتريات</div><div class="val">${fM(FM_HIST.reduce((s,d)=>s+d.purch,0))} ر.س</div><div class="sub">8 أشهر · 25+ مورد</div></div>
    <div class="fm-kpi" style="--fma:#a78bfa"><div class="lbl">ذمم مدينة (AR)</div><div class="val">20.7 م.ر</div><div class="sub">~55 يوم تحصيل ⚠️</div></div>
    <div class="fm-kpi" style="--fma:#f472b6"><div class="lbl">المخزون (بالتكلفة)</div><div class="val">15.1 م.ر</div><div class="sub">دوران ~6.3x سنوياً (حـ/41)</div></div>
    <div class="fm-kpi" style="--fma:#da4a4a"><div class="lbl">ذمم دائنة (AP)</div><div class="val">21.3 م.ر</div><div class="sub">~55 يوم دفع</div></div>
  </div>

  <div class="fm-notice">
    ℹ️ <strong>مصادر البيانات:</strong> الإيراد = حـ/202 و203 (دفتر الأستاذ، خالٍ من ضريبة القيمة المضافة) · تكلفة المبيعات = حـ/124 صافي (مدين − دائن، بعد المردودات) · المصروفات = قيود اليومية 402xxx/401xxx. تكلفة نوفمبر 2025 تضمّنت قيد تصحيح (JV #2803 — 9.6م) يعكس مردودات سابقة — لهذا ظهر صافي COGS منخفضاً قياساً بحجم المبيعات.
  </div>

  <!-- P&L Table -->
  <div class="fm-section">
    <div class="fm-title">📋 قائمة الدخل — أكتوبر 2025 : مايو 2026</div>
    <div style="font-size:.72rem;color:#7090b0;margin-bottom:8px">الأرقام من دفتر الأستاذ ERP مباشرة · الإيراد = إجمالي حـ/5xx · المصروفات = إجمالي حـ/4xx · صافي الربح مُتحقَّق منه</div>
    <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>الشهر</th><th class="num">إيراد إجمالي</th><th class="num">مردودات</th>
        <th class="num">صافي الإيراد</th><th class="num">تكلفة مبيعات</th>
        <th class="num">مجمل الربح</th><th>هامش %</th>
        <th class="num">مصروفات أخرى</th><th class="num">صافي الربح</th><th>هامش %</th>
      </tr></thead>
      <tbody>${plRows}</tbody>
      <tfoot><tr style="font-weight:700;background:#0a1828;border-top:2px solid #3a7abf">
        <td>الإجمالي (8 أشهر)</td>
        <td class="num">${f(totG)}</td>
        <td class="num" style="color:#da9a4a">(${f(totR)})</td>
        <td class="num" style="color:#4ada8e">${f(totN)}</td>
        <td class="num" style="color:#e08080">(${f(totC)})</td>
        <td class="num" style="color:${cg(totGP)}">${f(totGP)}</td>
        <td style="color:${pColor(totGP/totN*100)}">${fP(totGP/totN*100)}</td>
        <td class="num" style="color:#e08080">(${f(totOpEx)})</td>
        <td class="num" style="color:${cg(totEB)}">${totEB<0?'('+f(-totEB)+')':f(totEB)}</td>
        <td style="color:${pColor(totEB/totN*100)}">${fP(totEB/totN*100)}</td>
      </tr></tfoot>
    </table>
    </div>
  </div>

  <!-- Charts Row 1: Revenue -->
  <div class="fm-charts-row full">
    <div class="fm-chart-box">
      <div class="fm-title">📈 الإيراد الصافي والمشتريات شهرياً (ر.س)</div>
      <div class="fm-chart-wrap tall"><canvas id="fm-chart-rev"></canvas></div>
    </div>
  </div>

  <!-- Charts Row 2: OpEx + Margins -->
  <div class="fm-charts-row">
    <div class="fm-chart-box">
      <div class="fm-title">🧩 هيكل المصروفات التشغيلية</div>
      <div class="fm-chart-wrap"><canvas id="fm-chart-opex"></canvas></div>
    </div>
    <div class="fm-chart-box">
      <div class="fm-title">📉 الهوامش الشهرية (%)</div>
      <div class="fm-chart-wrap"><canvas id="fm-chart-margin"></canvas></div>
    </div>
  </div>

  <!-- OpEx Detail Table -->
  <div class="fm-section">
    <div class="fm-title">🔍 تفصيل المصروفات التشغيلية بالفئة (ر.س)</div>
    <div class="fm-notice" style="margin-bottom:10px">✅ الأرقام من ERP مباشرة — حسابات 402xxx · القيم بين قوسين (برتقالي) = قيود عكسية/تسويات. الإجمالي الشهري يطابق إجمالي OpEx في P&L أعلاه.</div>
    <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>الفئة</th>
        ${FM_HIST.map(d=>`<th class="num">${d.s}</th>`).join('')}
        <th class="num">متوسط شهري</th><th>% من OpEx</th>
      </tr></thead>
      <tbody>${opexCatRows}</tbody>
      <tfoot><tr style="font-weight:700;background:#0a1828;border-top:2px solid #3a7abf">
        <td>الإجمالي</td>
        ${opexTotals.map(v=>`<td class="num" style="color:#e08080">(${f(v)})</td>`).join('')}
        <td class="num" style="color:#e08080">(${f(opexAvg)})</td>
        <td>100%</td>
      </tr></tfoot>
    </table>
    </div>
  </div>

  <!-- Balance Sheet -->
  <div class="fm-section">
    <div class="fm-title">🏦 المركز المالي — حتى مايو 2026</div>
    <div class="fm-ratio-grid" style="margin-bottom:14px">
      <div class="fm-ratio"><div class="name">ذمم مدينة (AR)</div><div class="value" style="color:#5baef0">20.7 م.ر</div><div class="bench">مستحق من العملاء</div></div>
      <div class="fm-ratio"><div class="name">المخزون (بالتكلفة)</div><div class="value" style="color:#f5a623">15.1 م.ر</div><div class="bench">حـ/41 · رصيد مايو 2026</div></div>
      <div class="fm-ratio"><div class="name">ذمم دائنة (AP)</div><div class="value" style="color:#da4a4a">21.3 م.ر</div><div class="bench">مستحق للموردين</div></div>
      <div class="fm-ratio"><div class="name">رأس المال العامل</div><div class="value" style="color:#4ada8e">14.5 م.ر</div><div class="bench">AR + مخزون − AP</div></div>
      <div class="fm-ratio"><div class="name">أيام التحصيل (DSO)</div><div class="value" style="color:#f5a623">~55 يوم</div><div class="bench">المعيار: 30-45 ⚠️ مرتفع</div></div>
      <div class="fm-ratio"><div class="name">تكلفة التمويل السنوية</div><div class="value" style="color:#da4a4a">~3.2 م.ر</div><div class="bench">265 ألف/شهر — عبء ثقيل</div></div>
    </div>
  </div>

  <!-- Budget Scenarios -->
  <div class="fm-section">
    <div class="fm-title">🎯 الموازنة التقديرية — يونيو : ديسمبر 2026</div>
    <div class="fm-notice">
      💡 أساس التقدير: متوسط الأداء الفعلي مع موسمية القطاع (ذروة أكت–ديس). هامش 22% قاعدي استناداً لتحسّن أبريل–مايو.
    </div>
    <div class="fm-sc-wrap">
      <button class="fm-sc-btn cons" data-sc="cons">تحفظي (−20%)</button>
      <button class="fm-sc-btn base active base" data-sc="base">قاعدي</button>
      <button class="fm-sc-btn opt"  data-sc="opt">متفائل (+15%)</button>
    </div>
    <div class="tbl-wrap">
    <table id="fm-tbl-budget">
      <thead><tr>
        <th>الشهر</th><th class="num">الإيراد المتوقع</th><th class="num">مردودات (3%)</th>
        <th class="num">صافي الإيراد</th><th class="num">تكلفة مبيعات</th>
        <th class="num">مجمل الربح</th><th>هامش %</th>
        <th class="num">مصروفات</th><th class="num">EBITDA</th><th>EBITDA %</th>
      </tr></thead>
      <tbody id="fm-tbody-budget"></tbody>
      <tfoot id="fm-tfoot-budget"></tfoot>
    </table>
    </div>
  </div>

  <!-- Full Year Chart -->
  <div class="fm-charts-row full">
    <div class="fm-chart-box">
      <div class="fm-title">📅 المسار الكامل — فعلي + مقدر (أكت 2025 – ديس 2026)</div>
      <div class="fm-chart-wrap tall"><canvas id="fm-chart-fullyear"></canvas></div>
    </div>
  </div>

  <!-- Scenarios Chart -->
  <div class="fm-charts-row full">
    <div class="fm-chart-box">
      <div class="fm-title">📊 مقارنة سيناريوهات الموازنة — الإيراد والـ EBITDA</div>
      <div class="fm-chart-wrap tall"><canvas id="fm-chart-scenarios"></canvas></div>
    </div>
  </div>

  <!-- Recommendations -->
  <div class="fm-section">
    <div class="fm-title">💡 التوصيات الاستراتيجية</div>
    <div class="fm-rec-grid">
      <div class="fm-rec" style="--fmrc:#da4a4a"><div class="pri" style="color:#da4a4a">● عاجل</div><div class="ttl">تخفيض تكلفة التمويل</div><div class="bdy">الفوائد البنكية 265 ألف/شهر (3.2م سنوياً). إعادة هيكلة القروض وتمديد الآجال تُضيف ~650 ألف ر.س سنوياً للربح.</div></div>
      <div class="fm-rec" style="--fmrc:#da4a4a"><div class="pri" style="color:#da4a4a">● عاجل</div><div class="ttl">ضبط معدل المردودات</div><div class="bdy">يناير 2026: 7.8% مردودات — أعلى من المعيار (1-2%). مراجعة ما قبل الشحن وضبط الائتمان يوفر ~600 ألف سنوياً.</div></div>
      <div class="fm-rec" style="--fmrc:#f5a623"><div class="pri" style="color:#f5a623">● مهم</div><div class="ttl">تقليص DSO إلى 40 يوماً</div><div class="bdy">55 يوم تحصيل مقابل 55 يوم دفع = عجز نقدي. حوافز الدفع المبكر وتشديد حدود الائتمان تُحسّن التدفق النقدي.</div></div>
      <div class="fm-rec" style="--fmrc:#f5a623"><div class="pri" style="color:#f5a623">● مهم</div><div class="ttl">تحقيق تسوية نوفمبر 2025</div><div class="bdy">خسارة 9.6م في تسوية مخزون واحدة. تحقيق في الأسباب وإجراءات وقائية (جرد دوري، كاميرات، صلاحيات) أولوية.</div></div>
      <div class="fm-rec" style="--fmrc:#4ada8e"><div class="pri" style="color:#4ada8e">● استراتيجي</div><div class="ttl">توزيع المشتريات الموسمية</div><div class="bdy">تركيز 20.6م مشتريات في نوفمبر واحد ضغط التدفق النقدي. التوزيع الأسبوعي بدلاً من الشهري يُحسّن إدارة رأس المال.</div></div>
      <div class="fm-rec" style="--fmrc:#4ada8e"><div class="pri" style="color:#4ada8e">● استراتيجي</div><div class="ttl">الحفاظ على تحسّن هامش أبريل–مايو</div><div class="bdy">الهامش المجمل تحسّن من 5% (ديسمبر) إلى 17% (مايو) — اتجاه إيجابي. ضبط الأسعار وتجنب الخصومات غير المدروسة لتثبيت هذا المستوى ورفعه نحو 20%+.</div></div>
    </div>
  </div>

  <!-- Action Plan -->
  <div class="fm-section">
    <div class="fm-title">🗓️ خطة العمل التنفيذية</div>
    <table>
      <thead><tr><th>#</th><th>الإجراء</th><th>المسؤول</th><th>الموعد</th><th>الأثر المتوقع</th><th>الأولوية</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>مراجعة شروط القروض مع البنوك لإعادة الجدولة</td><td>المدير المالي</td><td>يوليو 2026</td><td style="color:#8aa8cc">توفير 60-80 ألف/شهر</td><td>🔴</td></tr>
        <tr><td>2</td><td>تسقيف ائتماني للعملاء بناءً على السجل</td><td>مدير المبيعات + المالي</td><td>يونيو 2026</td><td style="color:#8aa8cc">خفض DSO إلى 40 يوم</td><td>🔴</td></tr>
        <tr><td>3</td><td>تحقيق في تسوية المخزون وإجراءات وقائية</td><td>مدير المخازن + المراجع</td><td>يونيو 2026</td><td style="color:#8aa8cc">منع تكرار خسائر المخزون</td><td>🔴</td></tr>
        <tr><td>4</td><td>نظام مراجعة جودة قبل الشحن</td><td>مدير العمليات</td><td>يوليو 2026</td><td style="color:#8aa8cc">خفض المردودات من 3.3% → 1.5%</td><td>🟠</td></tr>
        <tr><td>5</td><td>توزيع خطة المشتريات على أسابيع الفصل</td><td>مدير المشتريات</td><td>يوليو 2026</td><td style="color:#8aa8cc">تحسين التدفق النقدي</td><td>🟠</td></tr>
        <tr><td>6</td><td>مراجعة جدول الأسعار وسياسة الخصومات</td><td>مدير المبيعات</td><td>أغسطس 2026</td><td style="color:#8aa8cc">الحفاظ على هامش 22%+</td><td>🟡</td></tr>
        <tr><td>7</td><td>تقييم موردين احتياطيين للأصناف الرئيسية</td><td>مدير المشتريات</td><td>أكتوبر 2026</td><td style="color:#8aa8cc">خفض مخاطر سلسلة التوريد</td><td>🟢</td></tr>
      </tbody>
    </table>
  </div>`;

  // ── Wire scenario buttons ────────────────────────────────────────────
  document.querySelectorAll('.fm-sc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _fmScenario = btn.dataset.sc;
      document.querySelectorAll('.fm-sc-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active', btn.dataset.sc);
      _fmBuildBudgetTable();
      if (FM_CHARTS.scenarios) { FM_CHARTS.scenarios.destroy(); delete FM_CHARTS.scenarios; }
      if (FM_CHARTS.fullyear)  { FM_CHARTS.fullyear.destroy();  delete FM_CHARTS.fullyear;  }
      _fmBuildScenariosChart();
      _fmBuildFullYearChart();
    });
  });

  // ── Build all charts + budget ─────────────────────────────────────
  _fmBuildBudgetTable();
  setTimeout(() => {
    _fmBuildRevenueChart();
    _fmBuildOpexChart();
    _fmBuildMarginChart();
    _fmBuildScenariosChart();
    _fmBuildFullYearChart();
  }, 60);
}

function _fmBuildBudgetTable() {
  const f  = n => (+n||0).toLocaleString('ar-SA', {maximumFractionDigits:0});
  const fP = n => (isFinite(n)?n.toFixed(1):'—')+'%';
  const sc = FM_SCENARIOS[_fmScenario];
  let tG=0,tR=0,tN=0,tC=0,tGP=0,tOp=0,tEB=0;
  const tbodyEl = document.getElementById('fm-tbody-budget');
  const tfootEl = document.getElementById('fm-tfoot-budget');
  if (!tbodyEl) return;
  tbodyEl.innerHTML = FM_BUDGET_GROSS.map((bg,i) => {
    const gross=bg*sc.factor, ret=gross*0.03, net=gross-ret;
    const cogs=net*(1-sc.gm), gp=net*sc.gm, opex=FM_FIXED_OPEX+net*FM_VAR_PCT, eb=gp-opex;
    tG+=gross;tR+=ret;tN+=net;tC+=cogs;tGP+=gp;tOp+=opex;tEB+=eb;
    return `<tr>
      <td>${FM_BUDGET_MONTHS[i]}</td>
      <td class="num" style="color:${sc.color}">${f(gross)}</td>
      <td class="num" style="color:#da9a4a">(${f(ret)})</td>
      <td class="num" style="color:#4ada8e">${f(net)}</td>
      <td class="num" style="color:#e08080">(${f(cogs)})</td>
      <td class="num" style="color:#4ada8e">${f(gp)}</td>
      <td style="color:#4ada8e">${fP(sc.gm*100)}</td>
      <td class="num" style="color:#e08080">(${f(opex)})</td>
      <td class="num" style="color:#4ada8e">${f(eb)}</td>
      <td style="color:#4ada8e">${fP(eb/net*100)}</td>
    </tr>`;
  }).join('');
  tfootEl.innerHTML = `<tr style="font-weight:700;background:#0a1828;border-top:2px solid ${sc.color}">
    <td>الإجمالي (7 أشهر)</td>
    <td class="num" style="color:${sc.color}">${f(tG)}</td>
    <td class="num" style="color:#da9a4a">(${f(tR)})</td>
    <td class="num" style="color:#4ada8e">${f(tN)}</td>
    <td class="num" style="color:#e08080">(${f(tC)})</td>
    <td class="num" style="color:#4ada8e">${f(tGP)}</td>
    <td style="color:#4ada8e">${fP(sc.gm*100)}</td>
    <td class="num" style="color:#e08080">(${f(tOp)})</td>
    <td class="num" style="color:#4ada8e">${f(tEB)}</td>
    <td style="color:#4ada8e">${fP(tEB/tN*100)}</td>
  </tr>`;
}

const _FM_CO = {plugins:{legend:{labels:{color:'#7090b0',font:{size:11}}}},scales:{x:{ticks:{color:'#7090b0'},grid:{color:'#1e3a5f'}},y:{ticks:{color:'#7090b0'},grid:{color:'#1e3a5f'}}}};

function _fmBuildRevenueChart() {
  const rows = FM_HIST.map(d=>({net:d.gross-d.returns, purch:d.purch}));
  FM_CHARTS.revenue = new Chart(document.getElementById('fm-chart-rev'), {
    type:'bar',
    data:{
      labels: FM_HIST.map(d=>d.s),
      datasets:[
        {label:'صافي الإيراد', data:rows.map(r=>r.net), backgroundColor:'rgba(74,158,218,0.55)', order:2},
        {label:'المشتريات',    data:rows.map(r=>r.purch),backgroundColor:'rgba(245,166,35,0.45)', order:2},
        {label:'EBITDA (معدّل)',data:FM_HIST.map((d,i)=>{const r=FM_HIST[i];const net=r.gross-r.returns,gp=net-(r.cogs-r.inv_adj);return gp-r.opex;}),
          type:'line',borderColor:'#4ada8e',borderWidth:2,pointRadius:4,fill:false,yAxisID:'y2',order:1},
      ]
    },
    options:{..._FM_CO, scales:{..._FM_CO.scales, y2:{position:'left',ticks:{color:'#4ada8e'},grid:{drawOnChartArea:false}}}}
  });
}

function _fmBuildOpexChart() {
  const labels = ['رواتب','مزايا وبدلات','إيجارات','نقل وتوزيع','عمولات/تسويق','تمويل','جمارك ورسوم','صيانة ومتنوعات'];
  const colors = ['#4a9eda','#a78bfa','#f5a623','#34d399','#f472b6','#da4a4a','#60a5fa','#e0c060'];
  const totals = Object.values(FM_OPEX_CAT).map(arr => Math.max(0, arr.reduce((s,v)=>s+v,0)));
  const grandTotal = totals.reduce((s,v)=>s+v,0);
  FM_CHARTS.opex = new Chart(document.getElementById('fm-chart-opex'), {
    type:'doughnut',
    data:{
      labels,
      datasets:[{
        data: totals,
        backgroundColor: colors,
        borderColor:'#0f2035',
        borderWidth:2,
        hoverOffset:6
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{position:'right', labels:{color:'#a0b8c8', font:{size:10}, boxWidth:12, padding:8}},
        tooltip:{callbacks:{
          label: i => {
            const pct = grandTotal > 0 ? (i.raw/grandTotal*100).toFixed(1) : 0;
            return `${i.label}: ${Math.round(i.raw).toLocaleString('ar-SA')} ر.س (${pct}%)`;
          }
        }}
      }
    }
  });
}

function _fmBuildMarginChart() {
  const rows = FM_HIST.map(d=>{const net=d.gross-d.returns,gp=net-(d.cogs-d.inv_adj),eb=gp-d.opex;return{gpPct:net>0?gp/net*100:0,ebPct:net>0?eb/net*100:0};});
  FM_CHARTS.margin = new Chart(document.getElementById('fm-chart-margin'), {
    type:'bar',
    data:{
      labels:FM_HIST.map(d=>d.s),
      datasets:[
        {label:'هامش مجمل %',  data:rows.map(r=>r.gpPct), backgroundColor:'rgba(74,218,142,0.55)'},
        {label:'هامش EBITDA %',data:rows.map(r=>r.ebPct), backgroundColor:'rgba(74,158,218,0.5)'},
      ]
    },
    options:_FM_CO
  });
}

function _fmBuildScenariosChart() {
  const datasets = [];
  Object.entries(FM_SCENARIOS).forEach(([key,sc])=>{
    const nets = FM_BUDGET_GROSS.map(bg=>(bg*sc.factor)*0.97);
    const ebits= FM_BUDGET_GROSS.map(bg=>{const net=(bg*sc.factor)*0.97;return net*sc.gm-(FM_FIXED_OPEX+net*FM_VAR_PCT);});
    datasets.push({label:'إيراد '+sc.label, data:nets, borderColor:sc.color, backgroundColor:sc.color+'25', type:'line', borderWidth:2, fill:true, tension:0.3});
    datasets.push({label:'EBITDA '+sc.label,data:ebits,borderColor:sc.color,borderDash:[5,3],type:'line',borderWidth:1.5,fill:false,tension:0.3});
  });
  FM_CHARTS.scenarios = new Chart(document.getElementById('fm-chart-scenarios'), {
    type:'bar', data:{labels:FM_BUDGET_SHORT, datasets}, options:_FM_CO
  });
}

function _fmBuildFullYearChart() {
  const sc = FM_SCENARIOS[_fmScenario];
  const histNets = FM_HIST.map(d=>d.gross-d.returns);
  const budgNets = FM_BUDGET_GROSS.map(bg=>(bg*sc.factor)*0.97);
  const allLabels = [...FM_HIST.map(d=>d.s), ...FM_BUDGET_SHORT];
  FM_CHARTS.fullyear = new Chart(document.getElementById('fm-chart-fullyear'), {
    type:'line',
    data:{labels:allLabels, datasets:[
      {label:'فعلي', data:[...histNets,...Array(7).fill(null)], borderColor:'#4a9eda', backgroundColor:'rgba(74,158,218,0.12)', fill:true, tension:0.3, borderWidth:2, pointRadius:5},
      {label:'مقدر ('+sc.label+')', data:[...Array(8).fill(null),...budgNets], borderColor:sc.color, borderDash:[6,4], fill:false, tension:0.3, borderWidth:2, pointRadius:4},
    ]},
    options:_FM_CO
  });
}

// ═══════════════════════════════════════════════════════════════════════

// ── Inventory Analysis Tab ────────────────────────────────────────────────────
const INV_MONTHS_S = ['أكت-25','نوف-25','ديس-25','ين-26','فب-26','مر-26','أب-26','مي-26'];
const INV_CATS_DEF = [
  {key:'tas', name:'تسليح (حديد)', unit:'طن',   color:'#4a9eda', colorA:'rgba(74,158,218,0.15)'},
  {key:'tao', name:'تسليح اخرى',   unit:'قطعة', color:'#f5a623', colorA:'rgba(245,166,35,0.15)'},
  {key:'sal', name:'مستلزمات السلامة', unit:'حبة', color:'#4ada8e', colorA:'rgba(74,218,142,0.15)'},
  {key:'taj', name:'حديد تجاري',   unit:'قطعة', color:'#a78bfa', colorA:'rgba(167,139,250,0.15)'},
];
const INV_OPEN_QTY = {tas:1121.2, tao:18930, sal:5876, taj:58};
// Net stock change per month (from InventoryTransactionOnlyIncludedView, all 7 types)
const INV_NET_QTY = {
  tas: [-133.9,  587.8, 1232.6, 1124.8, 1217.5,  266.3,  570.8,-1416.3],
  tao: [-1825.4, 247.6, 1302.5,  -78.9,-1107.2,-1792.4,-1694.7,  208.2],
  sal: [ 39555, 29266,  -6203,  -5269,  -6773,  -2149,  -3600,  -2508],
  taj: [ -284.3, 544.4,  199.4,  -19.3,  -36.4,   -5.8,  -96.3,   -8.5],
};
// COGS qty (DeliverGoods GroupQuantity, physical units leaving stock)
const INV_COGS_QTY = {
  tas: [4490.9,4373.7,4522.6,4959.1,3320.9,3076.3,3179.1,2852.3],
  tao: [2025.1,2723.4,3359.1,3070.8,4213.6,2898.5,3280.5,3310.8],
  sal: [337,6020,6209,5452,6864,2755,4074,5049],
  taj: [574.3,385.9,120.9,46.3,54.4,5.6,96.3,8.5],
};
// COGS value (DeliverGoods Amount)
const INV_COGS_VAL = {
  tas: [8926857,9184281,9462822,10679320,7266800,6525894,8100547,7684818],
  tao: [891377,781093,3842040,3304864,2385197,1191320,1143152,934953],
  sal: [0,859999,788739,640529,699226,289432,522551,819236],
  taj: [38010,24585,8190,2410,12486,495,11375,2185],
};
// Purchase qty (ReceiptGoods GroupQuantity) for FIFO aging
const INV_PURCH_QTY_ARR = {
  tas: [4345.3,4920.4,5778.2,6083.9,4538.4,3342.6,3754.6,1433.3],
  tao: [199.8,2518.9,4626.4,2991.9,3106.4,1106.1,1627.4,3512.5],
  sal: [39892,35286,6,183,91,606,474,2545],
  taj: [574,584,330,39,0,0,0,0],
};
// Purchase value (PurchaseInvoiceDetail Net)
const INV_PURCH_VAL = {
  tas: [9105565,10031960,11069141,12365149,9486001,6951606,8415208,3185218],
  tao: [3306,8692041,1928292,480974,270351,124200,213440,715623],
  sal: [3411404,1840891,0,75638,41741,129792,349345,52879],
  taj: [34798,14467,12432,2601,0,0,0,0],
};
// Sales value (SalesInvoiceDetail Net)
const INV_SALES_VAL_ARR = {
  tas: [10622159,10508905,10439249,12084524,8410305,6868564,8320715,8465293],
  tao: [660236,739201,3232884,2949306,1848696,620199,712316,768252],
  sal: [91713,988999,907050,739253,804110,332847,600934,1036788],
  taj: [43850,28272,9419,2772,14359,2726,13081,2513],
};
// Implied cost per unit (book value: Opening + Purchases - COGS, divided by closing qty)
// تسليح: opening at 1,835/ton (old cost); اخرى: opening at 64/pc (old cost); سلامة: bulk Oct-Nov at 53-85/pc
const INV_UNIT_COST = {tas:1094, tao:577, sal:42, taj:51};
// Account 41 (Finished Goods Stock) actual monthly closing balance — SOURCE OF TRUTH
const INV_ACCT41 = [8097456, 18623677, 18714029, 18003005, 18157834, 17743333, 18632355, 15057940];
const INV_ACCT41_OPEN = 4061406; // Sep-25 opening balance
// Account 124 (COGS) net monthly — P&L basis (after sales returns & adjustments)
// Gross debits = 84.1M; Credits (returns+adj) = 13.9M; Net = 70.2M
const INV_COGS_PL = [7620084, 9729111, 11900850, 11805336, 8675439, 6094847, 7160100, 7235469];
const INV_COGS_PL_TOTAL = 70221236;

const INV_CHARTS_OBJ = {};
let _invRendered = false;
let _invActiveCat = 'tas';

function _invCalcClosing(key) {
  const arr = []; let v = INV_OPEN_QTY[key];
  for (let i = 0; i < 8; i++) { v += INV_NET_QTY[key][i]; arr.push(v); }
  return arr;
}

function _invCalcDOH(key, closingArr) {
  const cq = INV_COGS_QTY[key];
  const avg3 = (cq[5]+cq[6]+cq[7]) / 3;
  const daily = avg3 / 30;
  return closingArr.map(q => daily < 0.01 ? 9999 : Math.round(q / daily));
}

function _invFifoAge(key, closingQty) {
  // Backwards-accumulate from May-26 purchases; month mid-point days ago from June 3, 2026
  const monthAge = [231,200,170,139,108,80,49,19];
  const buckets  = [0,0,0,0,0]; // <30, 30-60, 60-90, 90-180, >180
  let rem = closingQty;
  for (let i = 7; i >= 0 && rem > 0; i--) {
    const take = Math.min(INV_PURCH_QTY_ARR[key][i], rem);
    rem -= take;
    const a = monthAge[i];
    const b = a < 30 ? 0 : a < 60 ? 1 : a < 90 ? 2 : a < 180 ? 3 : 4;
    buckets[b] += take;
  }
  if (rem > 0) buckets[4] += rem;
  const tot = buckets.reduce((s,b)=>s+b,0);
  return tot > 0 ? buckets.map(b => b/tot*100) : [0,0,0,0,0];
}

function renderInventoryAnalysis() {
  if (_invRendered) return;
  _invRendered = true;

  const wrap = document.getElementById('tab-inventory');
  if (!wrap) return;

  if (!document.getElementById('inv-style')) {
    const s = document.createElement('style'); s.id = 'inv-style';
    s.textContent = `
      .inv-kpi-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
      .inv-kpi{flex:1;min-width:190px;background:#0d1f2d;border-radius:8px;padding:14px 16px;border:1px solid #1a3040;border-top:3px solid var(--inv-c,#4a9eda)}
      .inv-kpi .lbl{font-size:.72rem;color:#708090;margin-bottom:3px}
      .inv-kpi .val{font-size:1.45rem;font-weight:700;color:#e0ecf8;line-height:1.1}
      .inv-kpi .sub{font-size:.71rem;color:#a0b8c8;margin-top:3px}
      .inv-kpi .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.71rem;font-weight:600;margin-top:5px}
      .inv-sec{font-size:.8rem;font-weight:600;color:#4a9eda;letter-spacing:.04em;padding:14px 0 6px;border-bottom:1px solid #1a3040;margin-bottom:10px}
      .inv-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
      .inv-tab-btn{padding:5px 12px;border-radius:4px;cursor:pointer;font-size:.77rem;border:1px solid #1a3040;background:#0a1825;color:#a0b8c8;transition:.15s}
      .inv-tab-btn.on{color:#0a1825;font-weight:600}
      .inv-tbl{width:100%;border-collapse:collapse;font-size:.77rem}
      .inv-tbl th{background:#0a1825;padding:6px 9px;text-align:right;font-weight:600;color:#4a9eda;border-bottom:1px solid #1a3040;white-space:nowrap}
      .inv-tbl td{padding:5px 9px;border-bottom:1px solid #111e2a;color:#c0d0e0;white-space:nowrap}
      .inv-tbl td.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}
      .inv-tbl tr:hover td{background:#0e2030}
      .inv-tbl tr.tot td{font-weight:600;color:#e0ecf8;background:#0d1f2d}
      .inv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
      .inv-card{background:#0a1825;border-radius:8px;padding:14px;border:1px solid #1a3040}
      .inv-cht{height:210px;position:relative}
      .inv-age-bar{display:flex;height:26px;border-radius:4px;overflow:hidden;margin-bottom:5px;gap:2px}
      .inv-age-seg{display:flex;align-items:center;justify-content:center;font-size:.64rem;font-weight:700;overflow:hidden;white-space:nowrap;color:#0a1825;transition:.3s}
      .inv-rec{list-style:none;padding:0;margin:0}
      .inv-rec li{padding:8px 12px;border-radius:5px;margin-bottom:6px;font-size:.78rem;line-height:1.65;border-left:4px solid transparent}
      .inv-buy{background:#021408;border-color:#4ada8e;border-left-color:#4ada8e}
      .inv-warn{background:#1a1100;border-color:#f5c842;border-left-color:#f5c842}
      .inv-sell{background:#140202;border-color:#da4a4a;border-left-color:#da4a4a}
      @media(max-width:680px){.inv-grid2{grid-template-columns:1fr}.inv-kpi{min-width:140px}}
    `;
    document.head.appendChild(s);
  }

  const fN = v => Math.round(+v||0).toLocaleString('ar-SA');
  const fN1 = v => (+v||0).toLocaleString('ar-SA',{maximumFractionDigits:1});
  const fM = v => ((+v||0)/1e6).toFixed(2)+' م';
  const fK = v => Math.abs(+v||0) >= 1000 ? ((+v||0)/1000).toFixed(1)+'K' : Math.round(+v||0).toString();

  const closing = {}; INV_CATS_DEF.forEach(c => { closing[c.key] = _invCalcClosing(c.key); });
  const dohAll  = {}; INV_CATS_DEF.forEach(c => { dohAll[c.key]  = _invCalcDOH(c.key, closing[c.key]); });

  function dohSt(d) {
    if (d < 45)  return {lbl:'ممتاز',  c:'#4ada8e', bg:'rgba(74,218,142,.14)'};
    if (d < 90)  return {lbl:'طبيعي',  c:'#a0d080', bg:'rgba(160,208,128,.12)'};
    if (d < 150) return {lbl:'مراقبة', c:'#f5c842', bg:'rgba(245,200,66,.14)'};
    if (d < 270) return {lbl:'مرتفع',  c:'#f5a623', bg:'rgba(245,166,35,.14)'};
    return              {lbl:'مفرط',   c:'#da4a4a', bg:'rgba(218,74,74,.14)'};
  }

  // P&L COGS from Account 124 net (after returns & adjustments) — 70.2M
  const totCogsAll  = INV_COGS_PL_TOTAL;
  // Use Account 41 for accurate inventory values
  const totInvVal   = INV_ACCT41[7]; // 15,057,940 — actual Account 41 closing balance
  const avgInvVal   = INV_ACCT41.reduce((a,b)=>a+b,0) / 8; // monthly avg from Account 41
  const annTurnover = totCogsAll > 0 && avgInvVal > 0 ? (totCogsAll/(8/12))/avgInvVal : 0;
  const dsi = annTurnover > 0 ? Math.round(365/annTurnover) : 0;

  // ── KPI Cards ──
  let kpiHtml = `<div class="inv-kpi-row">`;
  INV_CATS_DEF.forEach(c => {
    const cl = closing[c.key][7];
    const doh = dohAll[c.key][7];
    const st = dohSt(doh > 9000 ? 9999 : doh);
    const invV = cl * INV_UNIT_COST[c.key];
    kpiHtml += `<div class="inv-kpi" style="--inv-c:${c.color}">
      <div class="lbl">${c.name}</div>
      <div class="val">${fN1(cl)} <span style="font-size:.75rem;color:#708090">${c.unit}</span></div>
      <div class="sub">قيمة دفترية تقريبية: ${fM(invV)} ر.س</div>
      <div class="badge" style="background:${st.bg};color:${st.c}">DOH: ${doh>999?'∞':doh+' يوم'} — ${st.lbl}</div>
    </div>`;
  });
  kpiHtml += `</div>`;

  // ── Summary row ──
  const sumHtml = `<div class="inv-kpi-row">
    <div class="inv-kpi" style="--inv-c:#e0c060">
      <div class="lbl">قيمة المخزون — نهاية مايو 2026</div>
      <div class="val">${fM(totInvVal)} ر.س</div>
      <div class="sub">من حساب البضاعة (حـ/41) · مُراجَع من ERP</div>
    </div>
    <div class="inv-kpi" style="--inv-c:#4ada8e">
      <div class="lbl">تكلفة المبيعات الصافية (8 أشهر)</div>
      <div class="val">${fM(totCogsAll)} ر.س</div>
      <div class="sub">حـ/124 صافي · بعد المردودات والتسويات</div>
    </div>
    <div class="inv-kpi" style="--inv-c:#4a9eda">
      <div class="lbl">معدل دوران المخزون (سنوي مُعدَّل)</div>
      <div class="val">${annTurnover.toFixed(1)}×</div>
      <div class="sub">DSI ≈ ${dsi} يوم · متوسط مخزون ${fM(avgInvVal)} ر.س</div>
    </div>
  </div>`;

  // ── Movement Table ──
  function buildMovTable(key) {
    const c   = INV_CATS_DEF.find(x=>x.key===key);
    const cl  = closing[key];
    const doh = dohAll[key];
    let h = `<div style="overflow-x:auto"><table class="inv-tbl"><thead><tr>
      <th>الشهر</th>
      <th class="n">فتح (${c.unit})</th>
      <th class="n">مشتريات (${c.unit})</th>
      <th class="n">خروج COGS (${c.unit})</th>
      <th class="n">مبيعات (ر.س)</th>
      <th class="n">إغلاق (${c.unit})</th>
      <th class="n">قيمة الإغلاق</th>
      <th class="n">DOH</th>
      <th class="n">هامش %</th>
    </tr></thead><tbody>`;
    let open = INV_OPEN_QTY[key];
    for (let i = 0; i < 8; i++) {
      const pq  = INV_PURCH_QTY_ARR[key][i];
      const cq  = INV_COGS_QTY[key][i];
      const cv  = INV_COGS_VAL[key][i];
      const sv  = INV_SALES_VAL_ARR[key][i];
      const gm  = sv > 0 ? (sv-cv)/sv*100 : null;
      const clI = cl[i];
      const d   = doh[i]; const st = dohSt(d>9000?9999:d);
      const invV = clI * INV_UNIT_COST[key];
      h += `<tr>
        <td style="color:#a0c0e0">${INV_MONTHS_S[i]}</td>
        <td class="n">${fN1(open)}</td>
        <td class="n" style="color:#90c8f0">${fN1(pq)}</td>
        <td class="n" style="color:#f09090">${fN1(cq)}</td>
        <td class="n">${fK(sv)}</td>
        <td class="n" style="font-weight:600;color:#e0ecf8">${fN1(clI)}</td>
        <td class="n">${fM(invV)}</td>
        <td class="n" style="color:${st.c};font-weight:600">${d>999?'∞':d}</td>
        <td class="n" style="color:${gm===null?'#708090':gm>18?'#4ada8e':gm>5?'#f5c842':'#da4a4a'}">${gm===null?'—':gm.toFixed(1)+'%'}</td>
      </tr>`;
      open = clI;
    }
    const tPQ  = INV_PURCH_QTY_ARR[key].reduce((a,b)=>a+b,0);
    const tCQ  = INV_COGS_QTY[key].reduce((a,b)=>a+b,0);
    const tCV  = INV_COGS_VAL[key].reduce((a,b)=>a+b,0);
    const tSV  = INV_SALES_VAL_ARR[key].reduce((a,b)=>a+b,0);
    const tGM  = tSV > 0 ? (tSV-tCV)/tSV*100 : null;
    h += `<tr class="tot">
      <td>الإجمالي / الإغلاق</td><td class="n"></td>
      <td class="n">${fN1(tPQ)}</td><td class="n">${fN1(tCQ)}</td>
      <td class="n">${fM(tSV)}</td>
      <td class="n">${fN1(cl[7])}</td>
      <td class="n">${fM(cl[7]*INV_UNIT_COST[key])}</td>
      <td class="n">—</td>
      <td class="n" style="color:${tGM&&tGM>5?'#4ada8e':'#f5a623'}">${tGM!==null?tGM.toFixed(1)+'%':'—'}</td>
    </tr>`;
    h += `</tbody></table></div>`;
    return h;
  }

  // ── Aging Section ──
  const AGE_LABELS = ['< 30 يوم','30–60','60–90','90–180','> 180 يوم'];
  const AGE_COLORS = ['#4ada8e','#a0d080','#f5c842','#f5a623','#da4a4a'];
  let agingHtml = `<div class="inv-sec">تحليل عمر المخزون (FIFO تقريبي — نهاية مايو 2026)</div>
  <div style="font-size:.71rem;color:#708090;margin-bottom:12px">الشرائح ممثَّلة بالأيام منذ استلام البضاعة · يُحسب بطريقة FIFO (الأقدم يخرج أولاً)</div>`;
  INV_CATS_DEF.forEach(c => {
    const cl = closing[c.key][7];
    const pct = _invFifoAge(c.key, cl);
    agingHtml += `<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.77rem;margin-bottom:5px">
        <span style="color:${c.color};font-weight:600">${c.name}</span>
        <span style="color:#708090">${fN1(cl)} ${c.unit}</span>
      </div>
      <div class="inv-age-bar">
        ${pct.map((p,i)=>p<0.8?'':
          `<div class="inv-age-seg" style="width:${p.toFixed(1)}%;background:${AGE_COLORS[i]}">${p>8?Math.round(p)+'%':''}</div>`
        ).join('')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:3px">
        ${pct.map((p,i)=>p<1?'':
          `<span style="font-size:.68rem;color:${AGE_COLORS[i]}">● ${AGE_LABELS[i]}: ${p.toFixed(0)}%</span>`
        ).join('')}
      </div>
    </div>`;
  });

  // ── Recommendations ──
  const dT = dohAll.tas[7], dTa = dohAll.tao[7], dS = dohAll.sal[7];
  const recHtml = `<div class="inv-sec">التوصيات بناءً على التحليل</div>
  <ul class="inv-rec">
    <li class="inv-buy">
      <strong>✓ تسليح (حديد) — مخزون سليم:</strong> DOH ${dT} يوم · مخزون ختامي ${Math.round(closing.tas[7]).toLocaleString('ar-SA')} طن. الشراء تراجع في مايو (${Math.round(INV_PURCH_QTY_ARR.tas[7]).toLocaleString('ar-SA')} طن مقابل ${Math.round(INV_PURCH_QTY_ARR.tas[6]).toLocaleString('ar-SA')} في أبريل). راقب حركة يونيو — إن تجاوزت المبيعات 2,500 طن/شهر أعد الطلب.
    </li>
    <li class="inv-warn">
      <strong>⚠ تسليح اخرى — مرتفع:</strong> DOH ${dTa} يوم · 9% من المخزون (≈1,260 قطعة) من نوفمبر 2025 (7+ أشهر). COGS ديسمبر-يناير تجاوزت المبيعات — راجع التسعير. التوصية: لا شراء حتى ينخفض المخزون إلى 8,000 قطعة، ثم أوامر صغيرة متكررة بدلاً من دفعات كبيرة.
    </li>
    <li class="inv-sell">
      <strong>✗ مستلزمات السلامة — مفرط:</strong> DOH ${dS > 999 ? '>999' : dS} يوم · 92% من المخزون مشتراة أكتوبر-نوفمبر 2025 (7-8 أشهر). الشراء في أكتوبر (39,892 حبة) ونوفمبر (35,286 حبة) كان ضخماً جداً. القيمة المُجمَّدة ${fM(closing.sal[7]*INV_UNIT_COST.sal)} ر.س. توقف فوري عن الشراء — راجع تفصيل المنتج في تبويب السلامة.
    </li>
    <li class="inv-warn">
      <strong>⚠ حديد تجاري — بلا حركة:</strong> لا مشتريات منذ يناير 2026 (5+ أشهر). القيمة ضئيلة. الوضع مستقر لكن راقب الطلبات — إن عادت المبيعات إلى 300+ قطعة/شهر أعد التقييم.
    </li>
  </ul>`;

  // ── Assemble ──
  wrap.innerHTML = `<div style="padding:16px 0;direction:rtl">
    <div style="font-size:.79rem;color:#708090;margin-bottom:16px">
      الفترة: أكتوبر 2025 – مايو 2026 · 8 أشهر · المصدر: ERP MekSoftDb1 (DeliverGoods / ReceiptGoods / SalesInvoice / PurchaseInvoice)
    </div>
    <div class="inv-sec">ملخص المخزون الكلي</div>
    ${sumHtml}
    <div class="inv-sec">المخزون الختامي حسب المجموعة (نهاية مايو 2026)</div>
    ${kpiHtml}
    <div class="inv-sec">الحركة الشهرية</div>
    <div class="inv-tabs" id="inv-tabs">
      ${INV_CATS_DEF.map(c=>`<button class="inv-tab-btn${c.key===_invActiveCat?' on':''}"
        style="${c.key===_invActiveCat?`background:${c.color}`:''}"
        data-key="${c.key}">${c.name}</button>`).join('')}
    </div>
    <div id="inv-mov-tbl">${buildMovTable(_invActiveCat)}</div>
    <div class="inv-grid2" style="margin-top:18px">
      <div class="inv-card">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">📉 DOH الشهرية (أيام الاحتياط)</div>
        <div class="inv-cht"><canvas id="inv-c-doh"></canvas></div>
      </div>
      <div class="inv-card">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">📦 المخزون الختامي الشهري</div>
        <div class="inv-cht"><canvas id="inv-c-stock"></canvas></div>
      </div>
    </div>
    <div class="inv-grid2">
      <div class="inv-card" style="margin-bottom:18px">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">💰 تكلفة المبيعات الشهرية (COGS) حسب المجموعة</div>
        <div class="inv-cht" style="height:190px"><canvas id="inv-c-cogs"></canvas></div>
      </div>
      <div class="inv-card" style="margin-bottom:18px">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">🏦 قيمة المخزون الشهرية — حساب 41 (ر.س)</div>
        <div class="inv-cht" style="height:190px"><canvas id="inv-c-acct41"></canvas></div>
      </div>
    </div>
    ${agingHtml}
    ${recHtml}
  </div>`;

  // Tab switching
  document.querySelectorAll('#inv-tabs .inv-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _invActiveCat = btn.dataset.key;
      document.querySelectorAll('#inv-tabs .inv-tab-btn').forEach(b => {
        b.classList.remove('on'); b.style.background = '';
      });
      btn.classList.add('on');
      btn.style.background = INV_CATS_DEF.find(c=>c.key===_invActiveCat).color;
      document.getElementById('inv-mov-tbl').innerHTML = buildMovTable(_invActiveCat);
    });
  });

  _invBuildCharts(closing, dohAll);
}

function _invBuildCharts(closing, dohAll) {
  const CO_BASE = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{color:'#a0b8c8',font:{size:10},boxWidth:12}}},
    scales:{
      x:{ticks:{color:'#708090',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}},
      y:{ticks:{color:'#708090',font:{size:10}},grid:{color:'rgba(255,255,255,.06)'}},
    }
  };

  // DOH chart — cap at 400
  const dohCtx = document.getElementById('inv-c-doh');
  if (dohCtx) {
    INV_CHARTS_OBJ.doh = new Chart(dohCtx, {
      type:'line',
      data:{
        labels: INV_MONTHS_S,
        datasets: INV_CATS_DEF.map(c=>({
          label: c.name,
          data: dohAll[c.key].map(d=>Math.min(d,400)),
          borderColor: c.color, backgroundColor: c.colorA,
          borderWidth:2, tension:0.3, fill:false, pointRadius:4,
        }))
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          annotation:{drawTime:'beforeDraw'},
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${i.raw >= 400 ? '>400' : i.raw} يوم`}}
        },
        scales:{...CO_BASE.scales, y:{...CO_BASE.scales.y,
          max:420,
          ticks:{...CO_BASE.scales.y.ticks, callback:v=>v>=400?'+400':v},
          title:{display:true,text:'أيام',color:'#708090',font:{size:10}}
        }}
      }
    });
  }

  // Closing stock chart (dual concept: تسليح in tons on left, others scaled)
  const stCtx = document.getElementById('inv-c-stock');
  if (stCtx) {
    INV_CHARTS_OBJ.stock = new Chart(stCtx, {
      type:'bar',
      data:{
        labels: INV_MONTHS_S,
        datasets:[
          {label:'تسليح (طن)', data:closing.tas, backgroundColor:'rgba(74,158,218,0.75)', yAxisID:'y'},
          {label:'تسليح اخرى ÷10', data:closing.tao.map(v=>v/10), backgroundColor:'rgba(245,166,35,0.55)', yAxisID:'y'},
          {label:'السلامة ÷100', data:closing.sal.map(v=>v/100), backgroundColor:'rgba(74,218,142,0.5)', yAxisID:'y'},
        ]
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          tooltip:{callbacks:{label:i=>{
            const raw = i.raw;
            const scale = i.dataset.label.includes('÷10') ? 10 : i.dataset.label.includes('÷100') ? 100 : 1;
            return `${i.dataset.label}: ${Math.round(raw*scale).toLocaleString('ar-SA')}`;
          }}}
        }
      }
    });
  }

  // COGS chart — stacked bars (gross by category) + net P&L line
  const cogsCtx = document.getElementById('inv-c-cogs');
  if (cogsCtx) {
    INV_CHARTS_OBJ.cogs = new Chart(cogsCtx, {
      type:'bar',
      data:{
        labels: INV_MONTHS_S,
        datasets:[
          {label:'تسليح (إجمالي)', data:INV_COGS_VAL.tas, backgroundColor:'rgba(74,158,218,0.75)', stack:'gross'},
          {label:'تسليح اخرى', data:INV_COGS_VAL.tao, backgroundColor:'rgba(245,166,35,0.75)', stack:'gross'},
          {label:'مستلزمات السلامة', data:INV_COGS_VAL.sal, backgroundColor:'rgba(74,218,142,0.65)', stack:'gross'},
          {label:'تجاري', data:INV_COGS_VAL.taj, backgroundColor:'rgba(167,139,250,0.65)', stack:'gross'},
          {label:'صافي التكلفة (حـ/124)', data:INV_COGS_PL, type:'line',
           borderColor:'#ff6b6b', backgroundColor:'transparent',
           borderWidth:2.5, borderDash:[5,3], pointRadius:4, tension:0.3, order:0},
        ]
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${(i.raw/1e6).toFixed(2)} م ر.س`}}
        },
        scales:{...CO_BASE.scales,
          x:{...CO_BASE.scales.x, stacked:true},
          y:{...CO_BASE.scales.y, stacked:false, ticks:{...CO_BASE.scales.y.ticks,callback:v=>(v/1e6).toFixed(0)+'م'}}
        }
      }
    });
  }

  // Account 41 monthly balance chart
  const a41Ctx = document.getElementById('inv-c-acct41');
  if (a41Ctx) {
    const allVals = [INV_ACCT41_OPEN, ...INV_ACCT41];
    const allLabels = ['سبت-25', ...INV_MONTHS_S];
    INV_CHARTS_OBJ.acct41 = new Chart(a41Ctx, {
      type:'line',
      data:{
        labels: allLabels,
        datasets:[{
          label:'قيمة المخزون (حـ/41)',
          data: allVals,
          borderColor:'#e0c060', backgroundColor:'rgba(224,192,96,0.12)',
          borderWidth:2.5, tension:0.3, fill:true, pointRadius:5,
          pointBackgroundColor: allVals.map(v=>v>15000000?'#da4a4a':'#e0c060'),
        }]
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          tooltip:{callbacks:{label:i=>`${(i.raw/1e6).toFixed(2)} م ر.س`}}
        },
        scales:{...CO_BASE.scales,
          y:{...CO_BASE.scales.y, ticks:{...CO_BASE.scales.y.ticks, callback:v=>(v/1e6).toFixed(1)+'م'}}
        }
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════

// ── Manufacturing P&L Analysis Tab ────────────────────────────────────────────

const MFG_MONTHS = ['أكت-25','نوف-25','ديس-25','ين-26','فب-26','مر-26','أب-26','مي-26','يو-26'];

// ─ PRODUCTION (FinishedGoodsReceipt) ─────────────────────────────────────────
const MFG_PQ75 = [  79.7,   12.0,  561.8,  163.3,  290.9,  219.5,  204.6,   50.5,    0];
const MFG_PQ45 = [ 142.1,  207.5,   38.7,  276.5,  207.0,  202.4,  132.7,  166.5,    0];
const MFG_PQSH = [     0,      0,   34.0,      0,      0,      0,      0,   32.5,  32.6];
const MFG_PC75 = [116298,  17814, 873276, 254328, 447467, 335838, 312327,  84536,    0];
const MFG_PC45 = [207286, 342469,  61747, 420833, 317897, 318004, 206413, 249173,    0];
const MFG_PCSH = [     0,      0,  70891,      0,      0,      0,      0,  94808, 95070];
const MFG_A75  = [1458, 1483, 1554, 1557, 1538, 1530, 1527, 1675, null];
const MFG_A45  = [1458, 1650, 1595, 1522, 1536, 1571, 1555, 1497, null];
const MFG_ASH  = [null, null, 2083, null, null, null, null, 2914, 2914];

// ─ SALES (SalesInvoice ex-VAT) ────────────────────────────────────────────────
const MFG_SQ75 = [414.5, 280.7, 349.9, 290.3, 224.2,  92.1, 167.4, 203.1,  14.5];
const MFG_SQ45 = [209.1, 167.8, 122.2, 174.4, 182.1,  74.3, 108.3, 156.2,  13.9];
const MFG_SQSH = [191.2,  53.1,  34.0,     0,   9.1,     0,     0,  31.7,  32.5];
const MFG_R75  = [945001, 730540, 905964, 710939, 530900, 238930, 490045, 506114, 45914];
const MFG_R45  = [487892, 418485, 286122, 402201, 401728, 181188, 307178, 449380, 43141];
const MFG_RSH  = [490384, 141917,  87270,      0,  23886,      0,      0,  91253, 116005];
const MFG_P75  = [2280, 2602, 2589, 2449, 2368, 2594, 2928, 2492, 3166];
const MFG_P45  = [2333, 2493, 2341, 2307, 2206, 2438, 2837, 2876, 3104];
const MFG_PSH  = [2565, 2674, 2565, null, 2622, null, null, 2875, 3565];

// ─ INPUT COIL COST ────────────────────────────────────────────────────────────
const MFG_COIL10 = [2130, 2130, 2179, 2169, 2154, 2154, 2154, 2530, 2914];
const MFG_COIL8  = [2130, 2288, null, 2145, 2166, 2166, 2166, 2182, null];
const MFG_INP    = [328020, 484256, 1658021, 969463, 1047878, 1196038, 1611422, 856413, 131738];
const MFG_BCT    = [5, 13, 34, 22, 22, 14, 25, 33, 6];

// ─ MONTHLY MATERIAL MARGIN % = (SellPrice − AllocCost) / SellPrice × 100 ────
const MFG_MGPCT_75 = [36.1, 43.0, 40.0, 36.4, 35.1, 41.0, 47.8, 32.8, null];
const MFG_MGPCT_45 = [37.5, 33.8, 31.9, 34.0, 30.4, 35.6, 45.2, 47.9, null];
const MFG_MGPCT_SH = [null, null, 18.8, null, null, null, null, -1.4, 18.3];

const MFG_CHARTS = {};
let _mfgRendered = false;

function renderManufacturing() {
  if (_mfgRendered) return;
  _mfgRendered = true;
  const wrap = document.getElementById('tab-manufacturing');

  // ── Period totals ──────────────────────────────────────────────────────────
  const T_INP   = MFG_INP.reduce((s,v)=>s+v, 0);
  const T_R75   = MFG_R75.reduce((s,v)=>s+v, 0);
  const T_R45   = MFG_R45.reduce((s,v)=>s+v, 0);
  const T_RSH   = MFG_RSH.reduce((s,v)=>s+v, 0);
  const T_REV   = T_R75 + T_R45 + T_RSH;
  const T_Q75   = MFG_SQ75.reduce((s,v)=>s+v, 0);
  const T_Q45   = MFG_SQ45.reduce((s,v)=>s+v, 0);
  const T_BATS  = MFG_BCT.reduce((s,v)=>s+v, 0);
  const T_PQ75  = MFG_PQ75.reduce((s,v)=>s+v, 0);
  const T_PQ45  = MFG_PQ45.reduce((s,v)=>s+v, 0);
  const T_PC75  = MFG_PC75.reduce((s,v)=>s+v, 0);
  const T_PC45  = MFG_PC45.reduce((s,v)=>s+v, 0);
  const T_PQSH  = MFG_PQSH.reduce((s,v)=>s+v, 0);
  const T_PCSH  = MFG_PCSH.reduce((s,v)=>s+v, 0);
  const T_QSH   = MFG_SQSH.reduce((s,v)=>s+v, 0);
  const AVG_P75 = Math.round(T_R75/T_Q75);
  const AVG_P45 = Math.round(T_R45/T_Q45);
  const AVG_A75 = Math.round(T_PC75/T_PQ75);
  const AVG_A45 = Math.round(T_PC45/T_PQ45);
  const AVG_ASH = Math.round(T_PCSH/T_PQSH);
  const AVG_PSH = Math.round(T_RSH/T_QSH);
  const MRG_75  = AVG_P75 - AVG_A75;
  const MRG_45  = AVG_P45 - AVG_A45;
  const MRG_SH  = AVG_PSH - AVG_ASH;
  const MRG_PCT_75 = (MRG_75/AVG_P75*100).toFixed(1);
  const MRG_PCT_45 = (MRG_45/AVG_P45*100).toFixed(1);
  const T_ALLOC = T_PC75 + T_PC45 + T_PCSH;
  const T_TOT_PROD_Q = T_PQ75 + T_PQ45 + T_PQSH;
  const AVG_BATCH_VAL = Math.round(T_INP / T_BATS);

  const fN  = v => Math.round(v).toLocaleString('ar-SA');
  const fM  = v => (v/1e6).toFixed(2)+' م';
  const fK  = v => (v/1e3).toFixed(0)+' ك';
  const ROW_BG = i => i%2===0 ? 'background:#0a1928' : 'background:#0d2035';

  // ── Sensitivity analysis ───────────────────────────────────────────────────
  const AVG_COIL_INP = 4905584 / 2241; // متوسط تكلفة الكويل المُدخَل/طن على الفترة
  const F75 = AVG_A75 / AVG_COIL_INP;  // معامل تخصيص MD75
  const F45 = AVG_A45 / AVG_COIL_INP;  // معامل تخصيص MD45
  const BEP_75 = Math.round(AVG_P75 / F75); // سعر كويل التعادل لـ MD75
  const BEP_45 = Math.round(AVG_P45 / F45); // سعر كويل التعادل لـ MD45
  const SENS = [1860,2193,2400,2600,2914,3200,BEP_75,3421].sort((a,b)=>a-b).map(c => {
    const a75 = Math.round(c*F75), a45 = Math.round(c*F45);
    const m75 = AVG_P75-a75, m45 = AVG_P45-a45;
    const p75 = (m75/AVG_P75*100).toFixed(1), p45 = (m45/AVG_P45*100).toFixed(1);
    const gc = v => v<0?'#da4a4a':v<200?'#e0c060':v<500?'#b0d080':'#4ada8e';
    return {c,a75,a45,m75,m45,p75,p45,gc75:gc(m75),gc45:gc(m45)};
  });
  const sensRows = SENS.map(s => {
    const isCur = s.c===2193, isBep75 = s.c===BEP_75;
    const rowStyle = isCur?'background:#0d2040;outline:1px solid #2a5a9a':
                     isBep75?'background:#200a0a;outline:1px solid #7a2a2a':'';
    const tag = s.c===1860?'أدنى مستورد':s.c===2193?'⭐ متوسط الفترة':
                s.c===2914?'🚨 يو-26':s.c===BEP_75?'🔴 تعادل MD75':
                s.c===3421?'أعلى فعلي':'';
    return `<tr style="${rowStyle}">
      <td style="font-weight:700;color:#c8d8e8;text-align:right">${fN(s.c)} ر.س/طن</td>
      <td style="text-align:right"><span style="font-size:.72rem;color:#708090">${tag}</span></td>
      <td class="num" style="color:#4a9eda">${fN(s.a75)}</td>
      <td class="num" style="color:${s.gc75};font-weight:700">${s.m75>=0?'+':''}${fN(s.m75)}</td>
      <td class="num" style="color:${s.gc75};font-weight:700">${s.p75}%</td>
      <td class="num" style="color:#f5a623">${fN(s.a45)}</td>
      <td class="num" style="color:${s.gc45};font-weight:700">${s.m45>=0?'+':''}${fN(s.m45)}</td>
      <td class="num" style="color:${s.gc45};font-weight:700">${s.p45}%</td>
    </tr>`;
  }).join('');

  // ── Monthly batch cost & gap ───────────────────────────────────────────────
  const MFG_COST_PER_BATCH = MFG_BCT.map((b,i) => b>0 ? Math.round(MFG_INP[i]/b) : null);
  const GAP_75 = MFG_MONTHS.map((_,i) => +(MFG_SQ75[i]-MFG_PQ75[i]).toFixed(1));
  const GAP_45 = MFG_MONTHS.map((_,i) => +(MFG_SQ45[i]-MFG_PQ45[i]).toFixed(1));

  // Best month MD75/MD45
  const bestIdx75 = MFG_MGPCT_75.reduce((bi,v,i)=>v!==null&&v>MFG_MGPCT_75[bi]?i:bi, 0);
  const bestIdx45 = MFG_MGPCT_45.reduce((bi,v,i)=>v!==null&&v>MFG_MGPCT_45[bi]?i:bi, 0);

  // ── Production table rows ──────────────────────────────────────────────────
  const prodRows = MFG_MONTHS.map((m,i) => `<tr style="${ROW_BG(i)}">
    <td style="font-weight:600;color:#c8d8e8;white-space:nowrap">${m}</td>
    <td class="num" style="color:#5a7a9a">${MFG_BCT[i]}</td>
    <td class="num" style="color:#7090b0">${fK(MFG_INP[i])} ك</td>
    <td class="num" style="color:#4a9eda">${MFG_PQ75[i]>0?MFG_PQ75[i].toFixed(1):'—'}</td>
    <td class="num" style="color:#3a7aaa;border-right:1px solid #1e3a5f">${MFG_PC75[i]>0?(MFG_PC75[i]/1e3).toFixed(0)+' ك':'—'}</td>
    <td class="num" style="color:#f5a623">${MFG_PQ45[i]>0?MFG_PQ45[i].toFixed(1):'—'}</td>
    <td class="num" style="color:#c08020;border-right:1px solid #1e3a5f">${MFG_PC45[i]>0?(MFG_PC45[i]/1e3).toFixed(0)+' ك':'—'}</td>
    <td class="num" style="color:#4ada8e">${MFG_PQSH[i]>0?MFG_PQSH[i].toFixed(1):'—'}</td>
    <td class="num" style="color:#30a870">${MFG_PCSH[i]>0?(MFG_PCSH[i]/1e3).toFixed(0)+' ك':'—'}</td>
    <td class="num" style="color:${MFG_PQSH[i]>0?(MFG_PCSH[i]/MFG_PQSH[i]>2500?'#f08080':'#4ada8e'):'#5a7a9a'};font-weight:600">${MFG_PQSH[i]>0?fN(Math.round(MFG_PCSH[i]/MFG_PQSH[i])):'—'}</td>
  </tr>`).join('');

  // ── Sales + margin table rows ──────────────────────────────────────────────
  const salesRows = MFG_MONTHS.map((m,i) => {
    const rev  = MFG_R75[i]+MFG_R45[i]+MFG_RSH[i];
    const mg75 = MFG_A75[i] ? MFG_P75[i]-MFG_A75[i] : null;
    const mg45 = MFG_A45[i] ? MFG_P45[i]-MFG_A45[i] : null;
    const mgsh = (MFG_PSH[i]&&MFG_ASH[i]) ? MFG_PSH[i]-MFG_ASH[i] : null;
    const gc   = v => v===null?'#5a7a9a':v<0?'#da4a4a':v>900?'#4ada8e':'#b0d080';
    const flag = mgsh!==null&&mgsh<0?' 🚨':'';
    // Margin % badge for MD75
    const mpct75 = MFG_MGPCT_75[i];
    const mpct45 = MFG_MGPCT_45[i];
    const badgeStyle = pct => pct===null?'color:#5a7a9a':
      `color:${pct<30?'#da4a4a':pct>=40?'#4ada8e':'#e0c060'};font-size:.72rem`;
    return `<tr style="${ROW_BG(i)}">
      <td style="font-weight:600;color:#c8d8e8;white-space:nowrap">${m}</td>
      <td class="num">${MFG_SQ75[i]>0?MFG_SQ75[i].toFixed(1):'—'}</td>
      <td class="num" style="color:#4a9eda">${fN(MFG_P75[i])}</td>
      <td class="num" style="color:${gc(mg75)};font-weight:600">${mg75!==null?'+'+fN(mg75):'—'}</td>
      <td class="num" style="${badgeStyle(mpct75)}">${mpct75!==null?mpct75+'%':'—'}</td>
      <td class="num" style="border-right:1px solid #1e3a5f"></td>
      <td class="num">${MFG_SQ45[i]>0?MFG_SQ45[i].toFixed(1):'—'}</td>
      <td class="num" style="color:#f5a623">${fN(MFG_P45[i])}</td>
      <td class="num" style="color:${gc(mg45)};font-weight:600">${mg45!==null?'+'+fN(mg45):'—'}</td>
      <td class="num" style="${badgeStyle(mpct45)}">${mpct45!==null?mpct45+'%':'—'}</td>
      <td class="num" style="border-right:1px solid #1e3a5f"></td>
      <td class="num" style="color:#4ada8e">${MFG_SQSH[i]>0?MFG_SQSH[i].toFixed(1):'—'}</td>
      <td class="num" style="color:#4ada8e">${MFG_PSH[i]?fN(MFG_PSH[i]):'—'}</td>
      <td class="num" style="color:${gc(mgsh)};font-weight:600;border-right:1px solid #1e3a5f">${mgsh!==null?(mgsh>=0?'+':'')+fN(mgsh)+flag:'—'}</td>
      <td class="num" style="font-weight:700;color:#a0c4e8">${rev>0?fN(rev)+' ر.س':'—'}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
  <style>
    #tab-manufacturing .insight-card{background:#0c1e30;border-radius:9px;padding:14px 16px;border-right:4px solid #3a7abf;position:relative;overflow:hidden}
    #tab-manufacturing .insight-card::after{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,rgba(255,255,255,.02),transparent);pointer-events:none}
    #tab-manufacturing .mfg-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:.72rem;font-weight:700;vertical-align:middle}
    #tab-manufacturing .section-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#3a6a8a;margin-bottom:8px;font-weight:600}
    #tab-manufacturing tbody tr td{transition:background .12s ease}
    #tab-manufacturing tbody tr{transition:box-shadow .12s ease}
    #tab-manufacturing tbody tr:hover td{background:#162840!important;cursor:default}
    #tab-manufacturing tbody tr:hover td:first-child{box-shadow:inset 3px 0 0 #4a9eda!important}
  </style>

  <!-- ═══ HEADER ═══════════════════════════════════════════════════════════ -->
  <div style="background:linear-gradient(135deg,#060f1e,#0d1e38,#060f1e);border:1px solid #1e3a5f;
    border-top:3px solid #4a9eda;border-radius:10px;padding:18px 24px;margin-bottom:20px;
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="font-size:2.4rem;filter:drop-shadow(0 0 8px rgba(74,158,218,0.4))">🏭</div>
      <div>
        <div style="font-size:1.05rem;font-weight:700;color:#e8f4ff;letter-spacing:.01em">
          تحليل P&L التصنيع — حركة التكاليف من المواد الخام إلى البيع
        </div>
        <div style="font-size:.75rem;color:#5a8aaa;margin-top:4px">
          أكتوبر 2025 – يونيو 2026 · ${T_BATS} دفعة · مصنع حوراء · هامش مواد فقط (بدون رواتب واستهلاك)
        </div>
      </div>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">إيراد إجمالي</div>
        <div style="font-size:1.1rem;font-weight:700;color:#4ada8e">${fM(T_REV)} ر.س</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">تكلفة مدخلات</div>
        <div style="font-size:1.1rem;font-weight:700;color:#a0c4e8">${fM(T_INP)} ر.س</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">متوسط الدفعة</div>
        <div style="font-size:1.1rem;font-weight:700;color:#e0c060">${fK(AVG_BATCH_VAL)} ك ر.س</div>
      </div>
    </div>
  </div>

  <!-- ═══ KPIs ══════════════════════════════════════════════════════════════ -->
  <div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(185px,1fr));margin-bottom:20px">
    <div class="kpi" style="--accent:#4a9eda;background:linear-gradient(135deg,#0a1e35,#0f2035)">
      <div class="lbl">MD75 — هامش المادة</div>
      <div class="val" style="color:#4a9eda">+${fN(MRG_75)} ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#0d2a40;color:#4a9eda">${MRG_PCT_75}%</span>
        <span style="font-size:.7rem;color:#4a7a9a;margin-right:6px">· متوسط سعر ${fN(AVG_P75)}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#f5a623;background:linear-gradient(135deg,#1a1008,#1e1208)">
      <div class="lbl">MD45 — هامش المادة</div>
      <div class="val" style="color:#f5a623">+${fN(MRG_45)} ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#2a1a08;color:#f5a623">${MRG_PCT_45}%</span>
        <span style="font-size:.7rem;color:#8a6a30;margin-right:6px">· متوسط سعر ${fN(AVG_P45)}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#4ada8e;background:linear-gradient(135deg,#081a10,#0a1e12)">
      <div class="lbl">أفضل شهر للهامش</div>
      <div class="val" style="color:#4ada8e">${MFG_MONTHS[bestIdx75]}</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#0d2a18;color:#4ada8e">MD75 ${MFG_MGPCT_75[bestIdx75]}%</span>
        <span class="mfg-badge" style="background:#2a1a08;color:#f5a623;margin-right:4px">MD45 ${MFG_MGPCT_45[bestIdx75]}%</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#a78bfa;background:linear-gradient(135deg,#10081e,#120a20)">
      <div class="lbl">إجمالي كمية الإنتاج</div>
      <div class="val" style="color:#c8a8ff">${fN(Math.round(T_TOT_PROD_Q))} طن</div>
      <div style="margin-top:6px;font-size:.72rem;color:#6a5a9a">
        MD75 ${(T_PQ75/T_TOT_PROD_Q*100).toFixed(0)}% ·
        MD45 ${(T_PQ45/T_TOT_PROD_Q*100).toFixed(0)}% ·
        مشرشر ${(T_PQSH/T_TOT_PROD_Q*100).toFixed(0)}%
      </div>
    </div>
    <div class="kpi" style="--accent:#ff6b6b;background:linear-gradient(135deg,#1e0808,#200a0a)">
      <div class="lbl">🚨 سعر كويل 10مم — يونيو</div>
      <div class="val" style="color:#ff8080">2,914 ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#3a1010;color:#ff6b6b">+37% عن أكتوبر</span>
        <span style="font-size:.7rem;color:#8a4a4a;margin-right:6px">كان 2,130</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#e0c060;background:linear-gradient(135deg,#1a1400,#1e1800)">
      <div class="lbl">متوسط تكلفة الدفعة</div>
      <div class="val" style="color:#e0c060">${fK(AVG_BATCH_VAL)} ك ر.س</div>
      <div style="font-size:.72rem;color:#8a7830;margin-top:6px">${T_BATS} دفعة · إجمالي ${fM(T_INP)} ر.س</div>
    </div>
  </div>

  <!-- ═══ KEY INSIGHTS ══════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="section-label">رؤى مالية رئيسية</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="insight-card" style="border-color:#4ada8e">
        <div style="font-size:.82rem;font-weight:700;color:#4ada8e;margin-bottom:6px">
          🏆 MD45 أعلى ربحية بالقيمة المطلقة
        </div>
        <div style="font-size:.78rem;color:#8ab0a0;line-height:1.7">
          هامش MD45 <strong style="color:#f5a623">${MRG_PCT_45}%</strong> يتجاوز MD75
          <strong style="color:#4a9eda">${MRG_PCT_75}%</strong> على أساس الفترة الكاملة.
          في مايو 2026 وصل MD45 إلى <strong style="color:#4ada8e">47.9%</strong> — أعلى هامش مسجل.
        </div>
      </div>
      <div class="insight-card" style="border-color:#4a9eda">
        <div style="font-size:.82rem;font-weight:700;color:#4a9eda;margin-bottom:6px">
          📈 أبريل 2026 — أفضل شهر مزدوج
        </div>
        <div style="font-size:.78rem;color:#8090a8;line-height:1.7">
          تصاعد هامش المنتجين معاً:
          MD75 <strong style="color:#4a9eda">47.8%</strong> و MD45 <strong style="color:#f5a623">45.2%</strong>.
          السبب: استقرار تكلفة الكويل (2,154 ر.س) مع ارتفاع سعر البيع (MD75: 2,928 · MD45: 2,837).
        </div>
      </div>
      <div class="insight-card" style="border-color:#ff6b6b">
        <div style="font-size:.82rem;font-weight:700;color:#ff8080;margin-bottom:6px">
          ⚠️ خطر: ضغط الهامش في النصف الثاني
        </div>
        <div style="font-size:.78rem;color:#a08080;line-height:1.7">
          كويل 10مم قفز من <strong style="color:#a0c4e8">2,154</strong> ر.س/طن (فب-أب) إلى
          <strong style="color:#ff6b6b">2,914</strong> ر.س/طن (يو-26).
          إذا ثبتت أسعار البيع — هامش MD75 سينخفض من 32% إلى <strong style="color:#ff6b6b">~18%</strong>.
        </div>
      </div>
      <div class="insight-card" style="border-color:#e0c060">
        <div style="font-size:.82rem;font-weight:700;color:#e0c060;margin-bottom:6px">
          🚨 مشرشر مايو 2026 — بيع بأقل من التكلفة
        </div>
        <div style="font-size:.78rem;color:#a09040;line-height:1.7">
          تكلفة الإنتاج <strong style="color:#ff8080">2,914 ر.س/طن</strong> تجاوزت سعر البيع
          <strong style="color:#e0c060">2,875 ر.س/طن</strong> → خسارة
          <strong style="color:#ff6b6b">−39 ر.س/طن</strong>.
          يوليو-2026: مراجعة عقد البيع ضرورية.
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ MARGIN % CHART (full width — أهم مخطط) ═══════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">📉 هامش المواد الشهري % — MD75 · MD45 · مشرشر
      <span style="font-size:.75rem;color:#5a8aaa;font-weight:400;margin-right:12px">
        (سعر البيع − التكلفة المخصصة) ÷ سعر البيع
      </span>
    </div>
    <div class="chart-wrap-lg" style="height:300px"><canvas id="mfg-c-margin"></canvas></div>
    <div style="display:flex;gap:20px;margin-top:10px;font-size:.73rem;color:#4a6a8a;flex-wrap:wrap">
      <span style="color:#4ada8e">━━ منطقة ممتازة ≥40%</span>
      <span style="color:#e0c060">━━ منطقة مقبولة 30-40%</span>
      <span style="color:#da4a4a">━━ تحت الحد الأدنى &lt;30%</span>
    </div>
  </div>

  <!-- ═══ CHARTS ROW ════════════════════════════════════════════════════════ -->
  <div class="grid2" style="margin-bottom:18px">
    <div class="card">
      <div class="card-title">📊 الإيراد الشهري من المنتجات المصنّعة</div>
      <div class="chart-wrap" style="height:250px"><canvas id="mfg-c-rev"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">💰 سعر البيع مقابل التكلفة المخصصة / طن</div>
      <div class="chart-wrap" style="height:250px"><canvas id="mfg-c-price"></canvas></div>
    </div>
  </div>

  <!-- ═══ SENSITIVITY ANALYSIS ═══════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">🎯 تحليل الحساسية — تأثير سعر الكويل على هامش المادة
      <span style="font-size:.75rem;color:#5a8aaa;font-weight:400;margin-right:12px">(بثبات أسعار البيع: MD75=${fN(AVG_P75)} · MD45=${fN(AVG_P45)} ر.س/طن)</span>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th style="text-align:right">سعر الكويل</th>
            <th style="text-align:right">الحالة</th>
            <th class="num" colspan="3" style="color:#4a9eda;background:#060f1a;border-right:1px solid #1e3a5f">MD75 — M12</th>
            <th class="num" colspan="3" style="color:#f5a623;background:#12100a">MD45 — M6</th>
          </tr>
          <tr>
            <th></th><th></th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem">تكلفة/طن</th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem">هامش/طن</th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem;border-right:1px solid #1e3a5f">هامش%</th>
            <th class="num" style="color:#a07020;font-size:.75rem">تكلفة/طن</th>
            <th class="num" style="color:#a07020;font-size:.75rem">هامش/طن</th>
            <th class="num" style="color:#a07020;font-size:.75rem">هامش%</th>
          </tr>
        </thead>
        <tbody>${sensRows}</tbody>
      </table>
    </div>
    <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">
      <div style="background:#0a1e30;border:1px solid #1e3a5f;border-right:3px solid #ff6b6b;border-radius:7px;padding:10px 16px">
        <div style="font-size:.72rem;color:#8090a0;margin-bottom:3px">🔴 سعر تعادل MD75</div>
        <div style="font-size:1.05rem;font-weight:700;color:#ff8080">${fN(BEP_75)} ر.س/طن</div>
        <div style="font-size:.7rem;color:#606070;margin-top:2px">فجوة عن يو-26: +${fN(BEP_75-2914)} ر.س/طن</div>
      </div>
      <div style="background:#0a1e30;border:1px solid #1e3a5f;border-right:3px solid #f5a623;border-radius:7px;padding:10px 16px">
        <div style="font-size:.72rem;color:#8090a0;margin-bottom:3px">🟠 سعر تعادل MD45</div>
        <div style="font-size:1.05rem;font-weight:700;color:#f5a623">${fN(BEP_45)} ر.س/طن</div>
        <div style="font-size:.7rem;color:#606070;margin-top:2px">فجوة عن يو-26: +${fN(BEP_45-2914)} ر.س/طن</div>
      </div>
      <div style="background:#0a1e30;border:1px solid #1e3a5f;border-right:3px solid #4a9eda;border-radius:7px;padding:10px 16px;flex:1;min-width:220px">
        <div style="font-size:.72rem;color:#8090a0;margin-bottom:4px">المعامل المنهجي (allocation factor)</div>
        <div style="font-size:.8rem;color:#a0c4e8;line-height:1.8">
          MD75: سعر كويل × ${F75.toFixed(3)} = تكلفة/طن مُنتَج<br>
          MD45: سعر كويل × ${F45.toFixed(3)} = تكلفة/طن مُنتَج<br>
          <span style="color:#5a7a9a">كل طن كويل يُنتج ${(1/F75).toFixed(2)} طن MD75 أو ${(1/F45).toFixed(2)} طن MD45</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ PRODUCTION vs SALES GAP ═════════════════════════════════════════════ -->
  <div class="grid2" style="margin-bottom:18px">
    <div class="card">
      <div class="card-title">📦 MD75 — إنتاج vs مبيعات شهرياً (طن)</div>
      <div class="chart-wrap" style="height:240px"><canvas id="mfg-c-gap75"></canvas></div>
      <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">
        خط الفجوة: موجب = مخزون يُستنزف · سالب = مخزون يتراكم
      </div>
    </div>
    <div class="card">
      <div class="card-title">📦 MD45 — إنتاج vs مبيعات شهرياً (طن)</div>
      <div class="chart-wrap" style="height:240px"><canvas id="mfg-c-gap45"></canvas></div>
      <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">
        الفجوة الإيجابية في أكت-نوف من مخزون ما قبل الفترة
      </div>
    </div>
  </div>

  <!-- ═══ BATCH EFFICIENCY ══════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">⚡ كفاءة الدفعات — متوسط تكلفة الدفعة الواحدة شهرياً (ر.س/دفعة)</div>
    <div class="chart-wrap" style="height:210px"><canvas id="mfg-c-batch"></canvas></div>
    <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">
      الدفعات الكبيرة (مر-أب) ذات تكلفة مرتفعة/دفعة لاحتوائها مواد غير كويلية (حديد مجدول وأخرى).
      مي-26 أصغر دفعة متوسطة — قد يعكس تحولاً للتوريد الخارجي.
    </div>
  </div>

  <!-- ═══ COST CHAIN TABLE ══════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">⛓️ سلسلة التكلفة — من شراء الكويل إلى البيع (متوسط الفترة · ر.س/طن)</div>
    <div style="overflow-x:auto;padding-bottom:8px">
      <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:.82rem">
        <thead>
          <tr style="background:#0a1e30">
            <th style="padding:10px 14px;text-align:right;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">المرحلة</th>
            <th style="padding:10px 14px;text-align:right;color:#5a8aaa;border-bottom:2px solid #1e3a5f">الوصف</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap;background:#0d2030">الكمية (طن)</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">أدنى سعر</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">متوسط</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">أعلى سعر</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f">Δ / الهامش</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#0f2035">
            <td style="padding:10px 14px;color:#a0c4e8;font-weight:600;border-bottom:1px solid #1e3a5f">🛒 شراء الكويل</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">PurchaseInvoice · Net</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700;background:#0d2030">5,572</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">1,860</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700">2,193</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">3,421</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">—</td>
          </tr>
          <tr style="background:#0a1e30">
            <td style="padding:10px 14px;color:#a0c4e8;font-weight:600;border-bottom:1px solid #1e3a5f">⚙️ إدخال التصنيع</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">RawMaterialIssue — كويل فقط</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700;background:#0d2030">2,241</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,061</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700">2,193</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">2,914</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">−3,331 بيع مباشر / مخزون</td>
          </tr>
          <tr style="background:#06121e">
            <td style="padding:10px 14px;color:#4a9eda;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج MD75 (M12)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt · تكلفة مخصصة/طن مُنتَج</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700;background:#0d2030">${Math.round(T_PQ75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">1,458</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700">${fN(AVG_A75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">1,675</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">−${fN(2193-AVG_A75)} (تحويل الوحدات)</td>
          </tr>
          <tr style="background:#0a1808">
            <td style="padding:10px 14px;color:#f5a623;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج MD45 (M6)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt · تكلفة مخصصة/طن مُنتَج</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700;background:#0d2030">${Math.round(T_PQ45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">1,458</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700">${fN(AVG_A45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">1,650</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">−${fN(2193-AVG_A45)} (تحويل الوحدات)</td>
          </tr>
          <tr style="background:#061808">
            <td style="padding:10px 14px;color:#4ada8e;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج مشرشر</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt — كويل إملس → مشرشر (3 دفعات)</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700;background:#0d2030">${Math.round(T_PQSH)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,083</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">${fN(AVG_ASH)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">2,914</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">≈ سعر الكويل (لا تحويل وحدات)</td>
          </tr>
          <tr style="background:#061220">
            <td style="padding:10px 14px;color:#4a9eda;font-weight:600;border-bottom:1px solid #1e3a5f">💰 بيع MD75 (M12)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">SalesInvoice · Net · إيراد ${fN(Math.round(T_R75/1e3))} ك ر.س</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700;background:#0d2030">${Math.round(T_Q75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,280</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700">${fN(AVG_P75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">3,166</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">+${fN(MRG_75)} هامش/طن · <span style="background:#0d2a18;padding:1px 7px;border-radius:8px">${MRG_PCT_75}%</span></td>
          </tr>
          <tr style="background:#12100a">
            <td style="padding:10px 14px;color:#f5a623;font-weight:600;border-bottom:1px solid #1e3a5f">💰 بيع MD45 (M6)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">SalesInvoice · Net · إيراد ${fN(Math.round(T_R45/1e3))} ك ر.س</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700;background:#0d2030">${Math.round(T_Q45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,206</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700">${fN(AVG_P45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">3,104</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">+${fN(MRG_45)} هامش/طن · <span style="background:#2a1a08;padding:1px 7px;border-radius:8px">${MRG_PCT_45}%</span></td>
          </tr>
          <tr style="background:#0a1a10">
            <td style="padding:10px 14px;color:#4ada8e;font-weight:600">💰 بيع مشرشر</td>
            <td style="padding:10px 14px;color:#7090b0">SalesInvoice · Net · إيراد ${fN(Math.round(T_RSH/1e3))} ك ر.س · ★ يشمل مخزون ما قبل الفترة</td>
            <td class="num" style="color:#4ada8e;font-weight:700;background:#0d2030">${Math.round(T_QSH)}</td>
            <td class="num" style="color:#4ada8e">2,565</td>
            <td class="num" style="color:#4ada8e;font-weight:700">${fN(AVG_PSH)}</td>
            <td class="num" style="color:#e0c060">3,565</td>
            <td class="num" style="color:${MRG_SH>=0?'#4ada8e':'#da4a4a'};font-weight:700">${MRG_SH>=0?'+':''}${fN(MRG_SH)} هامش/طن · 🚨 مي-26: −39</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ═══ PRODUCTION TABLE ══════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">🏭 جانب الإنتاج — الكميات والتكاليف المخصصة شهرياً <span style="font-size:.75rem;color:#5a8aaa;font-weight:400">(FinishedGoodsReceipt)</span></div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="text-align:right">الشهر</th>
            <th rowspan="2" class="num">دفعات</th>
            <th rowspan="2" class="num" style="color:#7090b0">تكلفة الإدخال الكلية</th>
            <th colspan="2" style="color:#4a9eda;background:#060f1a;border-right:1px solid #1e3a5f">MD75 — M12</th>
            <th colspan="2" style="color:#f5a623;background:#12100a;border-right:1px solid #1e3a5f">MD45 — M6</th>
            <th colspan="3" style="color:#4ada8e;background:#060f0a">مشرشر</th>
          </tr>
          <tr>
            <th class="num" style="color:#3a7aaa;font-size:.75rem">طن مُنتَج</th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem;border-right:1px solid #1e3a5f">تكلفة مخصصة</th>
            <th class="num" style="color:#a07020;font-size:.75rem">طن مُنتَج</th>
            <th class="num" style="color:#a07020;font-size:.75rem;border-right:1px solid #1e3a5f">تكلفة مخصصة</th>
            <th class="num" style="color:#30a070;font-size:.75rem">طن مُنتَج</th>
            <th class="num" style="color:#30a070;font-size:.75rem">تكلفة مخصصة</th>
            <th class="num" style="color:#30a070;font-size:.75rem">ر.س/طن</th>
          </tr>
        </thead>
        <tbody>${prodRows}</tbody>
        <tfoot>
          <tr style="font-weight:700;background:#0a1828;color:#c0d8f0">
            <td style="text-align:right">الإجمالي</td>
            <td class="num" style="color:#6a8aaa">${T_BATS}</td>
            <td class="num" style="color:#9090b0">${fK(T_INP)} ك ر.س</td>
            <td class="num" style="color:#4a9eda">${Math.round(T_PQ75)} طن <span style="color:#3a6a9a;font-size:.75rem">(${(T_PQ75/T_TOT_PROD_Q*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#4a9eda;border-right:1px solid #1e3a5f">${(T_PC75/1e3).toFixed(0)} ك <span style="color:#3a6a9a;font-size:.75rem">(${(T_PC75/T_ALLOC*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#f5a623">${Math.round(T_PQ45)} طن <span style="color:#a07020;font-size:.75rem">(${(T_PQ45/T_TOT_PROD_Q*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#f5a623;border-right:1px solid #1e3a5f">${(T_PC45/1e3).toFixed(0)} ك <span style="color:#a07020;font-size:.75rem">(${(T_PC45/T_ALLOC*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#4ada8e">${Math.round(T_PQSH)} طن <span style="color:#30a870;font-size:.75rem">(${(T_PQSH/T_TOT_PROD_Q*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#4ada8e">${(T_PCSH/1e3).toFixed(0)} ك <span style="color:#30a870;font-size:.75rem">(${(T_PCSH/T_ALLOC*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#f5a623;font-weight:700">${fN(AVG_ASH)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <!-- ═══ SALES TABLE ═══════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">💰 جانب المبيعات — الكميات والأسعار والهامش المادي <span style="font-size:.75rem;color:#5a8aaa;font-weight:400">(SalesInvoice · بدون ضريبة)</span></div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="text-align:right">الشهر</th>
            <th colspan="5" style="color:#4a9eda;background:#060f1a;border-right:1px solid #1e3a5f">MD75 — M12</th>
            <th colspan="5" style="color:#f5a623;background:#12100a;border-right:1px solid #1e3a5f">MD45 — M6</th>
            <th colspan="3" style="color:#4ada8e;background:#060f0a;border-right:1px solid #1e3a5f">مشرشر</th>
            <th class="num" rowspan="2">إيراد إجمالي</th>
          </tr>
          <tr>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">طن</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">ر.س/طن</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">هامش/طن</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">هامش%</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa;border-right:1px solid #1e3a5f"></th>
            <th class="num" style="font-size:.72rem;color:#a07020">طن</th>
            <th class="num" style="font-size:.72rem;color:#a07020">ر.س/طن</th>
            <th class="num" style="font-size:.72rem;color:#a07020">هامش/طن</th>
            <th class="num" style="font-size:.72rem;color:#a07020">هامش%</th>
            <th class="num" style="font-size:.72rem;color:#a07020;border-right:1px solid #1e3a5f"></th>
            <th class="num" style="font-size:.72rem;color:#30a070">طن</th>
            <th class="num" style="font-size:.72rem;color:#30a070">ر.س/طن</th>
            <th class="num" style="font-size:.72rem;color:#30a070;border-right:1px solid #1e3a5f">هامش/طن</th>
          </tr>
        </thead>
        <tbody>${salesRows}</tbody>
        <tfoot>
          <tr style="font-weight:700;background:#0a1828;color:#c0d8f0;border-top:2px solid #2a4a6a">
            <td style="text-align:right;color:#7090b0;font-weight:400;font-size:.75rem">الكمية · متوسط السعر · الهامش</td>
            <td class="num" style="color:#4a9eda">${Math.round(T_Q75)} طن</td>
            <td class="num" style="color:#4a9eda">${fN(AVG_P75)}</td>
            <td class="num" style="color:#4ada8e">+${fN(MRG_75)}</td>
            <td class="num" style="color:#4ada8e">${MRG_PCT_75}%</td>
            <td class="num" style="border-right:1px solid #1e3a5f"></td>
            <td class="num" style="color:#f5a623">${Math.round(T_Q45)} طن</td>
            <td class="num" style="color:#f5a623">${fN(AVG_P45)}</td>
            <td class="num" style="color:#4ada8e">+${fN(MRG_45)}</td>
            <td class="num" style="color:#4ada8e">${MRG_PCT_45}%</td>
            <td class="num" style="border-right:1px solid #1e3a5f"></td>
            <td class="num" style="color:#4ada8e">${Math.round(T_QSH)} طن</td>
            <td class="num" style="color:#4ada8e">${fN(AVG_PSH)}</td>
            <td class="num" style="color:${MRG_SH>=0?'#4ada8e':'#da4a4a'};border-right:1px solid #1e3a5f">${MRG_SH>=0?'+':''}${fN(MRG_SH)}</td>
            <td class="num" style="color:#7090b0">—</td>
          </tr>
          <tr style="font-weight:700;background:#081420;border-top:1px solid #1e3a5f">
            <td style="text-align:right;color:#e0ecff">الإيراد الإجمالي</td>
            <td class="num" colspan="5" style="color:#4a9eda;font-size:.9rem;border-right:1px solid #1e3a5f">${fN(T_R75)} ر.س <span style="color:#3a6a9a;font-size:.75rem">(${(T_R75/T_REV*100).toFixed(1)}%)</span></td>
            <td class="num" colspan="5" style="color:#f5a623;font-size:.9rem;border-right:1px solid #1e3a5f">${fN(T_R45)} ر.س <span style="color:#a07020;font-size:.75rem">(${(T_R45/T_REV*100).toFixed(1)}%)</span></td>
            <td class="num" colspan="3" style="color:#4ada8e;font-size:.9rem;border-right:1px solid #1e3a5f">${fN(T_RSH)} ر.س <span style="color:#30a870;font-size:.75rem">(${(T_RSH/T_REV*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#e0ecff;font-size:.95rem;font-weight:800">${fN(T_REV)} ر.س <span style="color:#7090b0;font-size:.75rem">(100%)</span></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="font-size:.71rem;color:#3a5a7a;margin-top:8px;line-height:1.7">
      هامش/طن = سعر البيع − التكلفة المخصصة (material margin · لا يشمل: رواتب المصنع، استهلاك الآلات، الكهرباء، الإيجار).
      هامش% = هامش/طن ÷ سعر البيع × 100. مبيعات مشرشر أكت-نوف-25 من مخزون ما قبل الفترة.
    </div>
  </div>

  <div style="font-size:.72rem;color:#3a5070;text-align:left">
    المصادر: RawMaterialIssue · FinishedGoodsReceipt · SalesInvoice · PurchaseInvoice — MekSoftDb1 · جميع القيم بدون VAT.
  </div>`;

  _mfgBuildCharts();
}

function _mfgBuildCharts() {
  const CO = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{color:'#a0b8c8',font:{size:10},boxWidth:11}}},
    scales:{
      x:{ticks:{color:'#708090',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},
      y:{ticks:{color:'#708090',font:{size:10}},grid:{color:'rgba(255,255,255,.06)'}},
    }
  };

  // ── Chart 1: Monthly Margin % ──────────────────────────────────────────────
  const mCtx = document.getElementById('mfg-c-margin');
  if (mCtx) {
    // Reference band datasets (40% target, 30% min)
    const ref40 = Array(9).fill(40);
    const ref30 = Array(9).fill(30);
    MFG_CHARTS.margin = new Chart(mCtx, {
      type:'line',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          // Reference lines (drawn first, behind)
          {label:'هدف ≥40%', data:ref40, borderColor:'rgba(74,218,142,0.3)',
           borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, order:10},
          {label:'حد أدنى 30%', data:ref30, borderColor:'rgba(218,74,74,0.3)',
           borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, order:11},
          // Main lines
          {label:'MD75 هامش%', data:MFG_MGPCT_75,
           borderColor:'#4a9eda', backgroundColor:'rgba(74,158,218,0.10)',
           borderWidth:3, tension:0.4, pointRadius:6, fill:true, spanGaps:false,
           pointBackgroundColor: MFG_MGPCT_75.map(v=>
             v===null?'transparent': v>=40?'#4ada8e': v>=30?'#e0c060': '#da4a4a'
           ),
           pointBorderColor:'#0d1b2a', pointBorderWidth:2},
          {label:'MD45 هامش%', data:MFG_MGPCT_45,
           borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,0.08)',
           borderWidth:3, tension:0.4, pointRadius:6, fill:true, spanGaps:false,
           pointBackgroundColor: MFG_MGPCT_45.map(v=>
             v===null?'transparent': v>=40?'#4ada8e': v>=30?'#e0c060': '#da4a4a'
           ),
           pointBorderColor:'#0d1b2a', pointBorderWidth:2},
          {label:'مشرشر هامش%', data:MFG_MGPCT_SH,
           borderColor:'#4ada8e', backgroundColor:'transparent',
           borderWidth:2, borderDash:[5,3], tension:0.3, pointRadius:7, fill:false, spanGaps:false,
           pointBackgroundColor: MFG_MGPCT_SH.map(v=>
             v===null?'transparent': v<0?'#da4a4a':'#4ada8e'
           ),
           pointBorderColor:'#0d1b2a', pointBorderWidth:2,
           pointStyle: MFG_MGPCT_SH.map(v=> v!==null&&v<0?'rectRot':'circle')},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{
            label: i => i.raw!==null ? `${i.dataset.label}: ${i.raw}%` : '',
          }}
        },
        scales:{...CO.scales,
          y:{...CO.scales.y,
            min:-10, max:55,
            ticks:{...CO.scales.y.ticks, callback:v=>v+'%'},
            grid:{color:(ctx)=>{
              const v = ctx.tick.value;
              if(v===40) return 'rgba(74,218,142,0.25)';
              if(v===30) return 'rgba(218,74,74,0.25)';
              if(v===0)  return 'rgba(218,74,74,0.5)';
              return 'rgba(255,255,255,0.04)';
            }}
          }
        }
      }
    });
  }

  // ── Chart 2: Monthly Revenue stacked + cost line ───────────────────────────
  const rCtx = document.getElementById('mfg-c-rev');
  if (rCtx) {
    MFG_CHARTS.rev = new Chart(rCtx, {
      type:'bar',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'إيراد MD75', data:MFG_R75, backgroundColor:'rgba(74,158,218,0.8)', stack:'r'},
          {label:'إيراد MD45', data:MFG_R45, backgroundColor:'rgba(245,166,35,0.8)',  stack:'r'},
          {label:'إيراد مشرشر', data:MFG_RSH, backgroundColor:'rgba(74,218,142,0.7)', stack:'r'},
          {label:'تكلفة الإنتاج', data:MFG_INP,
           type:'line', borderColor:'#ff6b6b', backgroundColor:'transparent',
           borderWidth:2, borderDash:[6,3], pointRadius:4, tension:0.3, order:0},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${(i.raw/1e3).toFixed(0)} ك ر.س`}}
        },
        scales:{...CO.scales,
          x:{...CO.scales.x, stacked:true},
          y:{...CO.scales.y, stacked:false,
            ticks:{...CO.scales.y.ticks, callback:v=>(v/1e6).toFixed(1)+'م'}
          }
        }
      }
    });
  }

  // ── Chart 3: Price vs allocated cost per ton ───────────────────────────────
  const pCtx = document.getElementById('mfg-c-price');
  if (pCtx) {
    MFG_CHARTS.price = new Chart(pCtx, {
      type:'line',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'سعر بيع MD75', data:MFG_P75,
           borderColor:'#4a9eda', backgroundColor:'rgba(74,158,218,0.06)',
           borderWidth:2.5, tension:0.3, pointRadius:4, fill:false, spanGaps:true},
          {label:'سعر بيع MD45', data:MFG_P45,
           borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,0.06)',
           borderWidth:2.5, tension:0.3, pointRadius:4, fill:false, spanGaps:true},
          {label:'تكلفة MD75/طن', data:MFG_A75,
           borderColor:'#4a9eda', backgroundColor:'transparent',
           borderWidth:1.5, borderDash:[5,4], tension:0.3, pointRadius:3,
           pointStyle:'triangle', spanGaps:false},
          {label:'تكلفة MD45/طن', data:MFG_A45,
           borderColor:'#f5a623', backgroundColor:'transparent',
           borderWidth:1.5, borderDash:[5,4], tension:0.3, pointRadius:3,
           pointStyle:'triangle', spanGaps:false},
          {label:'كويل 10مم (مدخل)', data:MFG_COIL10,
           borderColor:'rgba(167,139,250,0.7)', backgroundColor:'transparent',
           borderWidth:1.5, borderDash:[3,5], tension:0.3, pointRadius:3, spanGaps:true},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>i.raw?`${i.dataset.label}: ${i.raw.toLocaleString('ar-SA')} ر.س/طن`:''}}
        },
        scales:{...CO.scales,
          y:{...CO.scales.y, suggestedMin:1300,
            ticks:{...CO.scales.y.ticks, callback:v=>v.toLocaleString('ar-SA')}
          }
        }
      }
    });
  }

  // ── Chart 4 & 5: Production vs Sales gap (MD75 + MD45) ───────────────────
  ['75','45'].forEach(prd => {
    const ctx = document.getElementById(`mfg-c-gap${prd}`);
    if (!ctx) return;
    const pq  = prd==='75' ? MFG_PQ75 : MFG_PQ45;
    const sq  = prd==='75' ? MFG_SQ75 : MFG_SQ45;
    const gap = MFG_MONTHS.map((_,i) => +(sq[i]-pq[i]).toFixed(1));
    const col = prd==='75' ? '#4a9eda' : '#f5a623';
    const colA= prd==='75' ? 'rgba(74,158,218,0.7)' : 'rgba(245,166,35,0.7)';
    MFG_CHARTS['gap'+prd] = new Chart(ctx, {
      type:'bar',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'مُنتَج (طن)',  data:pq, backgroundColor:'rgba(74,218,142,0.55)', stack:'s'},
          {label:'مُباع (طن)',   data:sq.map(v=>-v), backgroundColor:colA, stack:'s'},
          {label:'الفجوة (مُباع−مُنتَج)', data:gap, type:'line',
           borderColor:'#ff6b6b', backgroundColor:'transparent',
           borderWidth:2, pointRadius:5, tension:0.3, order:0,
           pointBackgroundColor:gap.map(v=>v>0?'#4ada8e':'#da4a4a')},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${Math.abs(i.raw).toFixed(1)} طن`}}
        },
        scales:{...CO.scales,
          x:{...CO.scales.x, stacked:true},
          y:{...CO.scales.y, stacked:true,
            ticks:{...CO.scales.y.ticks, callback:v=>Math.abs(v)+''}
          }
        }
      }
    });
  });

  // ── Chart 6: Batch cost efficiency ───────────────────────────────────────
  const bCtx = document.getElementById('mfg-c-batch');
  if (bCtx) {
    const _batchCost = MFG_BCT.map((b,i) => b>0 ? Math.round(MFG_INP[i]/b) : null);
    MFG_CHARTS.batch = new Chart(bCtx, {
      type:'bar',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'تكلفة/دفعة (ر.س)', data:_batchCost,
           backgroundColor: _batchCost.map(v=>
             !v?'transparent': v>80000?'rgba(218,74,74,0.8)': v>50000?'rgba(245,166,35,0.8)':'rgba(74,158,218,0.75)'
           ),
           borderRadius:4},
          {label:'عدد الدفعات', data:MFG_BCT, type:'line',
           borderColor:'rgba(74,218,142,0.7)', backgroundColor:'transparent',
           borderWidth:2, pointRadius:4, tension:0.3, yAxisID:'y2'},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>
            i.dataset.yAxisID==='y2'
              ? `${i.dataset.label}: ${i.raw} دفعة`
              : `${i.dataset.label}: ${i.raw?i.raw.toLocaleString('ar-SA'):'—'} ر.س`
          }}
        },
        scales:{...CO.scales,
          y:{...CO.scales.y, ticks:{...CO.scales.y.ticks,callback:v=>(v/1e3).toFixed(0)+'ك'}},
          y2:{position:'left', ticks:{color:'#4ada8e',font:{size:9},callback:v=>v+''},
              grid:{display:false}}
        }
      }
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════

init();
