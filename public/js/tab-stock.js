// ── STOCK TAB — رصيد المخزون ─────────────────────────────────────────────────
'use strict';

const SK_FMT  = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
const SK_FMTQ = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:3, maximumFractionDigits:3 });
const SK_ESC  = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

let _skData      = null;
let _skGlBalance = null;
let _skCat       = 'all';
let _skSearch    = '';
let _skSort      = { col:'value', dir:'desc' };
let _skChart     = null;
let _skAutoTimer = null;
let _skCountdown = 0;
const SK_REFRESH_SEC = 60;

// ── warehouse/branch filter state ───────────────────────────────────────────
let _skWarehouses = [];    // [{id, name, branch}] — من /api/inventory/warehouses
let _skWhSel      = [];    // معرّفات المستودعات المختارة؛ [] = الكل
let _skAsOf       = '';    // YYYY-MM-DD؛ فارغ = اليوم
let _skNegOnly    = false;

function _skTodayStr() { return new Date().toISOString().slice(0, 10); }

function _skIsActive() {
  return !!document.querySelector('.tab.active[data-tab="stock"]');
}
function _skStopAuto() {
  if (_skAutoTimer) { clearInterval(_skAutoTimer); _skAutoTimer = null; }
}
function _skQueryString(db) {
  const p = new URLSearchParams();
  p.set('db', db);
  if (_skWhSel.length) p.set('warehouse', _skWhSel.join(','));
  if (_skAsOf) p.set('asOf', _skAsOf);
  if (_skNegOnly) p.set('negativeOnly', '1');
  return p.toString();
}
async function _skFetchData() {
  const db = State.get('db');
  const data = await fetch(`/api/stock?${_skQueryString(db)}`).then(r => r.json());
  if (data.error) throw new Error(data.error);
  _skData      = data.items;
  _skGlBalance = data.glBalance;
}
function _skStartAuto() {
  _skStopAuto();
  _skCountdown = SK_REFRESH_SEC;
  _skAutoTimer = setInterval(async () => {
    if (!_skIsActive()) { _skStopAuto(); return; }
    _skCountdown--;
    if (_skCountdown > 0) {
      const el = document.getElementById('sk-status');
      if (el && _skData) {
        el.textContent = `✅ ${_skData.length} صنف | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_skCountdown}ث`;
        el.style.color = '#1a7a3c';
      }
    } else {
      _skCountdown = SK_REFRESH_SEC;
      _skSetStatus('🔄 جارٍ التحديث…', '#a87d00');
      try {
        await _skFetchData();
        _skRender();
        _skSetStatus(`✅ ${_skData.length} صنف | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${SK_REFRESH_SEC}ث`, '#1a7a3c');
      } catch(err) {
        _skSetStatus('⚠️ فشل التحديث: ' + err.message, '#c0392b');
      }
    }
  }, 1000);
}

/* ── Entry point ── */
async function renderStockTab() {
  const wrap = document.getElementById('tab-stock');
  if (!wrap) return;
  if (!wrap.innerHTML.trim()) _skBuildShell(wrap);

  _skSetStatus('⏳ جارٍ تحميل بيانات المخزون…', '#a87d00');

  try {
    if (!_skWarehouses.length) {
      const db = State.get('db');
      _skWarehouses = await fetch(`/api/inventory/warehouses?db=${encodeURIComponent(db)}`).then(r => r.json());
      _skBuildWhChips(wrap);
    }
    await _skFetchData();
    _skBuildCatChips(wrap);
    _skRender();
    _skSetStatus(`✅ ${_skData.length} صنف | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${SK_REFRESH_SEC}ث`, '#1a7a3c');
    _skStartAuto();
  } catch(err) {
    _skSetStatus('❌ ' + err.message, '#c0392b');
    const body = wrap.querySelector('#sk-body');
    if (body) body.innerHTML = `<div style="padding:40px;color:#e74c3c;text-align:center">⚠️ ${SK_ESC(err.message)}</div>`;
  }
}

/* ── Filter change → refetch from server (warehouse/asOf/negativeOnly are server-side) ── */
async function _skRefetch() {
  _skSetStatus('🔄 جارٍ التحديث…', '#a87d00');
  try {
    await _skFetchData();
    _skRender();
    _skSetStatus(`✅ ${_skData.length} صنف | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${SK_REFRESH_SEC}ث`, '#1a7a3c');
  } catch(err) {
    _skSetStatus('⚠️ فشل التحديث: ' + err.message, '#c0392b');
  }
}

/* ── Shell ── */
function _skBuildShell(wrap) {
  wrap.innerHTML = `
<style>
.sk-toolbar{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#162032;border-bottom:1px solid #1e3a5f;flex-wrap:wrap}
.sk-brand{font-size:1rem;font-weight:800;color:#27ae60;flex:1;min-width:140px}
.sk-status{font-size:.8rem}
.sk-export-btns{display:flex;gap:6px}
.sk-btn{padding:5px 14px;border-radius:6px;font-family:Tajawal,sans-serif;font-size:.82rem;cursor:pointer;border:1px solid #1e3a5f;background:transparent;color:#8a9bb5;transition:.15s}
.sk-btn:hover{border-color:#27ae60;color:#27ae60}
.sk-btn.excel{border-color:#27ae60;color:#27ae60}.sk-btn.excel:hover{background:#0d2a1a}
.sk-btn.pdf{border-color:#c0392b;color:#e74c3c}.sk-btn.pdf:hover{background:#2a0d0d}

.sk-filters{display:flex;align-items:center;gap:10px;padding:10px 18px;background:#111e2d;border-bottom:1px solid #1a2d42;flex-wrap:wrap}
.sk-filters label{font-size:.82rem;color:#8a9bb5}
.sk-chip-grp{display:flex;gap:6px;flex-wrap:wrap}
.sk-chip{padding:3px 12px;border-radius:20px;font-size:.78rem;cursor:pointer;border:1px solid #1e3a5f;background:#162032;color:#8a9bb5;transition:.15s;white-space:nowrap}
.sk-chip:hover{border-color:#27ae60;color:#27ae60}
.sk-chip.active{background:#27ae60;color:#000;border-color:#27ae60;font-weight:700}
.sk-search{background:#162032;border:1px solid #1e3a5f;border-radius:20px;padding:4px 14px;color:#e8edf5;font-family:Tajawal,sans-serif;font-size:.85rem;width:200px;outline:none}
.sk-search:focus{border-color:#27ae60}

.sk-wh-filters{display:flex;align-items:center;gap:12px;padding:10px 18px;background:#0e1a29;border-bottom:1px solid #1a2d42;flex-wrap:wrap}
.sk-wh-chip.active{background:#3a7bd5;color:#fff;border-color:#3a7bd5}
.sk-wh-chip:hover{border-color:#3a7bd5;color:#3a7bd5}
.sk-asof{background:#162032;border:1px solid #1e3a5f;border-radius:6px;padding:4px 10px;color:#e8edf5;font-family:Tajawal,sans-serif;font-size:.8rem;outline:none}
.sk-asof:focus{border-color:#27ae60}
.sk-neg-toggle{display:flex;align-items:center;gap:6px;font-size:.82rem;color:#8a9bb5;cursor:pointer;user-select:none}
.sk-neg-toggle input{accent-color:#e74c3c;cursor:pointer}
.sk-neg-count{font-size:.8rem;font-weight:700;padding:3px 12px;border-radius:20px;background:#2a0d0d;color:#e74c3c;border:1px solid #5a1010}
.sk-neg-count.zero{background:#0d2a1a;color:#27ae60;border-color:#1a5e2a}

.sk-kpis{display:flex;gap:12px;padding:14px 18px;flex-wrap:wrap}
.sk-kpi{background:#162032;border:1px solid #1e3a5f;border-radius:10px;padding:12px 20px;min-width:160px;text-align:center;position:relative;overflow:hidden}
.sk-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--kpi-color,#27ae60)}
.sk-kpi label{display:block;font-size:.75rem;color:#8a9bb5;margin-bottom:4px}
.sk-kpi .sk-val{font-size:1.2rem;font-weight:800;color:#27ae60;font-family:'Cairo',sans-serif}

.sk-main{display:flex;gap:0;padding:0 18px 30px;min-width:0}
.sk-chart-card{background:#162032;border:1px solid #1e3a5f;border-radius:10px;padding:16px;min-width:260px;max-width:280px;margin-top:16px;align-self:flex-start}
.sk-chart-card h4{margin:0 0 12px;font-size:.85rem;color:#8a9bb5;text-align:center}
.sk-table-wrap{flex:1;min-width:0;margin-top:16px;overflow-x:auto}

table.sk-tbl{border-collapse:collapse;width:100%;font-size:.8rem}
table.sk-tbl th{background:#111e2d;color:#8a9bb5;font-size:.72rem;padding:7px 10px;text-align:center;border-bottom:1px solid #1a2d42;white-space:nowrap;cursor:pointer;user-select:none}
table.sk-tbl th:hover{color:#27ae60}
table.sk-tbl th.sorted{color:#27ae60}
table.sk-tbl th.col-lbl{text-align:right}
table.sk-tbl th.nosort{cursor:default}
table.sk-tbl th.nosort:hover{color:#8a9bb5}
table.sk-tbl td{padding:6px 10px;border-bottom:1px solid #0f1e2d;text-align:center;white-space:nowrap}
table.sk-tbl td.col-lbl{text-align:right;max-width:320px;white-space:normal}
table.sk-tbl tr:hover td{background:rgba(39,174,96,.05)}
table.sk-tbl td.num{font-family:'Cairo',sans-serif;color:#c5d3e0}
table.sk-tbl td.num.hi{color:#27ae60;font-weight:700}
table.sk-tbl td.num.neg{color:#ff6b6b;font-weight:700;background:rgba(231,76,60,.12)}
table.sk-tbl td.cat{font-size:.72rem;color:#7ab4e0;background:rgba(30,58,95,.4);border-radius:8px;padding:2px 8px;display:inline-block}
.sk-sort-arrow{font-size:.65rem;margin-right:3px}
.sk-no-data{padding:40px;text-align:center;color:#5a7a9a}
.sk-tbl-footer{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:.78rem;color:#8a9bb5}
.sk-val-bar{display:inline-block;height:6px;background:#27ae60;border-radius:3px;vertical-align:middle;margin-right:6px;opacity:.6}

@media print{
  body{background:#fff!important;color:#000!important}
  .tab-bar,.conn-bar,.sk-toolbar,.sk-filters,.sk-wh-filters,.sk-export-btns,.sk-chart-card,
  .sk-btn,#sk-status{display:none!important}
  .sk-kpis{flex-wrap:wrap}
  .sk-kpi{border:1px solid #ccc!important;background:#f9f9f9!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sk-kpi .sk-val{color:#1a6a3c!important}
  .sk-main{padding:0!important}
  .sk-table-wrap{overflow:visible!important}
  table.sk-tbl th{background:#dde6f4!important;color:#111!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:8pt!important}
  table.sk-tbl td{font-size:8pt!important;color:#111!important;border-bottom:1px solid #ddd!important}
  table.sk-tbl td.num.neg{color:#c0392b!important;background:#fbeaea!important}
  .sk-print-header{display:block!important}
}
.sk-print-header{display:none;text-align:center;margin-bottom:16px;font-family:Tajawal,sans-serif}
.sk-print-header h2{font-size:16pt;margin:0 0 4px}
.sk-print-header p{font-size:9pt;color:#555;margin:2px 0}
</style>

<div class="sk-print-header" id="sk-print-header">
  <h2>📦 رصيد المخزون</h2>
  <p id="sk-ph-company"></p><p id="sk-ph-filter"></p><p id="sk-ph-date"></p>
</div>

<div class="sk-toolbar">
  <div class="sk-brand">📦 رصيد المخزون<br><small style="font-size:.7rem;font-weight:400;color:#8a9bb5">الكميات والقيم الحالية</small></div>
  <span class="sk-status" id="sk-status"></span>
  <div class="sk-export-btns">
    <button class="sk-btn excel" id="sk-btn-excel">📊 Excel</button>
    <button class="sk-btn pdf"   id="sk-btn-pdf">📄 PDF</button>
    <button class="sk-btn"       id="sk-btn-print">🖨 طباعة</button>
  </div>
</div>

<div class="sk-wh-filters">
  <label style="font-size:.82rem;color:#8a9bb5">المستودع/الفرع:</label>
  <div class="sk-chip-grp" id="sk-wh-chips"></div>
  <label style="font-size:.82rem;color:#8a9bb5">تاريخ القطع:</label>
  <input type="date" class="sk-asof" id="sk-asof">
  <label class="sk-neg-toggle" for="sk-neg-only">
    <input type="checkbox" id="sk-neg-only">
    السالب فقط
  </label>
  <span class="sk-neg-count" id="sk-neg-count">عدد الأصناف السالبة: 0</span>
</div>

<div class="sk-filters">
  <label>الفئة:</label>
  <div class="sk-chip-grp" id="sk-cat-chips"></div>
  <input class="sk-search" id="sk-search" placeholder="بحث عن صنف…" type="text">
</div>

<div class="sk-kpis" id="sk-kpis"></div>

<div class="sk-main">
  <div style="flex:1;min-width:0">
    <div class="sk-table-wrap">
      <div id="sk-body"></div>
      <div class="sk-tbl-footer" id="sk-footer"></div>
    </div>
  </div>
  <div class="sk-chart-card" style="margin-right:16px">
    <h4>توزيع القيمة حسب الفئة</h4>
    <canvas id="sk-chart" width="240" height="240"></canvas>
    <div id="sk-legend" style="margin-top:10px;font-size:.72rem;color:#8a9bb5"></div>
  </div>
</div>
`;

  // Search
  wrap.querySelector('#sk-search').addEventListener('input', e => {
    _skSearch = e.target.value.trim();
    _skRender();
  });

  // asOf date — default to today
  const asOfInp = wrap.querySelector('#sk-asof');
  asOfInp.value = _skTodayStr();
  asOfInp.addEventListener('change', () => {
    _skAsOf = asOfInp.value || '';
    _skRefetch();
  });

  // negative-only toggle
  wrap.querySelector('#sk-neg-only').addEventListener('change', e => {
    _skNegOnly = e.target.checked;
    _skRefetch();
  });

  // Export buttons
  wrap.querySelector('#sk-btn-excel').addEventListener('click', () => _skExportExcel());
  wrap.querySelector('#sk-btn-pdf').addEventListener('click',   () => _skPrint('pdf'));
  wrap.querySelector('#sk-btn-print').addEventListener('click', () => _skPrint('print'));
}

/* ── Build warehouse chips (multi-select + "الكل") ── */
function _skBuildWhChips(wrap) {
  const grp = wrap.querySelector('#sk-wh-chips');
  if (!grp) return;
  grp.innerHTML = '';
  const all = document.createElement('div');
  all.className = 'sk-chip sk-wh-chip active'; all.textContent = 'الكل'; all.dataset.wh = 'all';
  grp.appendChild(all);
  _skWarehouses.forEach(w => {
    const chip = document.createElement('div');
    chip.className = 'sk-chip sk-wh-chip'; chip.textContent = w.name; chip.dataset.wh = w.id;
    grp.appendChild(chip);
  });
  grp.addEventListener('click', e => {
    const chip = e.target.closest('.sk-wh-chip');
    if (!chip) return;
    if (chip.dataset.wh === 'all') {
      _skWhSel = [];
    } else {
      const id = +chip.dataset.wh;
      const idx = _skWhSel.indexOf(id);
      if (idx === -1) _skWhSel.push(id); else _skWhSel.splice(idx, 1);
    }
    grp.querySelectorAll('.sk-wh-chip').forEach(c => {
      c.classList.toggle('active',
        c.dataset.wh === 'all' ? _skWhSel.length === 0 : _skWhSel.includes(+c.dataset.wh));
    });
    _skRefetch();
  });
}

/* ── Build category chips dynamically from data ── */
function _skBuildCatChips(wrap) {
  if (!_skData) return;
  const cats = [...new Set(_skData.map(r => r.categoryName))].sort();
  const grp = wrap.querySelector('#sk-cat-chips');
  const prevActive = grp.querySelector('.sk-chip.active')?.dataset.cat || 'all';
  grp.innerHTML = '';
  const all = document.createElement('div');
  all.className = 'sk-chip active'; all.textContent = 'الكل'; all.dataset.cat = 'all';
  grp.appendChild(all);
  cats.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'sk-chip'; chip.textContent = c; chip.dataset.cat = c;
    grp.appendChild(chip);
  });
  _skCat = cats.includes(prevActive) || prevActive === 'all' ? prevActive : 'all';
  grp.querySelectorAll('.sk-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === _skCat));
  if (!grp._skDelegated) {
    grp._skDelegated = true;
    grp.addEventListener('click', e => {
      const chip = e.target.closest('.sk-chip');
      if (!chip) return;
      grp.querySelectorAll('.sk-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _skCat = chip.dataset.cat;
      _skRender();
    });
  }
}

/* ── Which warehouse columns to show, given current selection ── */
function _skActiveWarehouses() {
  if (!_skWhSel.length) return _skWarehouses;                       // "الكل"
  return _skWarehouses.filter(w => _skWhSel.includes(w.id));
}
function _skSingleMode() { return _skWhSel.length === 1; }

/* ── Filter & aggregate ── */
function _skFiltered() {
  if (!_skData) return [];
  let rows = _skData;
  if (_skCat !== 'all') rows = rows.filter(r => r.categoryName === _skCat);
  if (_skSearch) {
    const q = _skSearch.toLowerCase();
    rows = rows.filter(r =>
      (r.nameAr||'').toLowerCase().includes(q) ||
      (r.itemCode||'').toLowerCase().includes(q) ||
      (r.categoryName||'').toLowerCase().includes(q)
    );
  }
  return rows;
}

function _skItemHasNegative(r) {
  return Object.values(r.byWarehouse || {}).some(w => w.qty < 0);
}

/* ── Render ── */
function _skRender() {
  const wrap = document.getElementById('tab-stock');
  if (!wrap || !_skData) return;

  let items = _skFiltered();

  // Sort
  items = items.slice().sort((a,b) => {
    let va = a[_skSort.col], vb = b[_skSort.col];
    if (typeof va === 'string') { va = va||''; vb = vb||''; return _skSort.dir==='asc' ? va.localeCompare(vb,'ar') : vb.localeCompare(va,'ar'); }
    return _skSort.dir === 'asc' ? va - vb : vb - va;
  });

  // Negative counter — على مجموعة الأصناف المعروضة حالياً (بعد فلترة الفئة/البحث)
  const negCount = items.filter(_skItemHasNegative).length;
  const negEl = wrap.querySelector('#sk-neg-count');
  if (negEl) {
    negEl.textContent = `عدد الأصناف السالبة: ${negCount.toLocaleString('ar-SA')}`;
    negEl.classList.toggle('zero', negCount === 0);
  }

  // KPIs
  const totItems   = items.length;
  const totValue   = items.reduce((s,r) => s + (r.value||0), 0);
  const totQty     = items.reduce((s,r) => s + (r.qty||0), 0);
  const totReserved= items.reduce((s,r) => s + (r.reservedQty||0), 0);
  const showGl = _skGlBalance != null && _skCat === 'all' && !_skSearch && !_skWhSel.length;
  const mainValue = showGl ? _skGlBalance : totValue;
  const mainLabel = showGl ? 'رصيد المخزون (ر.س)' : 'إجمالي القيمة (ر.س)';
  const mainNote  = showGl ? '<div style="font-size:.67rem;color:#8a9bb5;margin-top:2px">رصيد حساب مخزون السلع الجاهزة — دفتر الأستاذ</div>' : '';
  const macCard   = showGl
    ? `<div class="sk-kpi" style="--kpi-color:#5a8fb5">
        <label>إجمالي MAC (ر.س)</label>
        <div class="sk-val" style="color:#5a8fb5;font-size:1rem">${SK_FMT(totValue)}</div>
        <div style="font-size:.67rem;color:#8a9bb5;margin-top:2px">متوسط مرجح متحرك × الكمية</div>
       </div>`
    : '';
  wrap.querySelector('#sk-kpis').innerHTML = `
    <div class="sk-kpi"><label>عدد الأصناف</label><div class="sk-val">${totItems}</div></div>
    <div class="sk-kpi" style="--kpi-color:#27ae60">
      <label>${mainLabel}</label>
      <div class="sk-val">${SK_FMT(mainValue)}</div>
      ${mainNote}
    </div>
    ${macCard}
    <div class="sk-kpi"><label>الكمية المحجوزة</label><div class="sk-val" style="color:#e67e22">${SK_FMTQ(totReserved)}</div></div>
    <div class="sk-kpi" style="--kpi-color:#e74c3c"><label>أصناف سالبة</label><div class="sk-val" style="color:#e74c3c">${negCount}</div></div>
  `;

  // Chart
  _skUpdateChart(items);

  // Max value for bar
  const maxVal = items.reduce((m,r)=>Math.max(m,r.value),0) || 1;

  // Columns: static + dynamic per-warehouse
  const activeWh   = _skActiveWarehouses();
  const singleMode = _skSingleMode();

  const staticCols = [
    { key:'itemCode',     label:'الرمز',              cls:'', sortable:true },
    { key:'nameAr',       label:'اسم الصنف',          cls:'col-lbl', sortable:true },
    { key:'categoryName', label:'الفئة',               cls:'', sortable:true },
    { key:'reservedQty',  label:'محجوز',               cls:'', sortable:true },
    { key:'unitName',     label:'الوحدة',               cls:'', sortable:false },
  ];

  const arrow = k => k === _skSort.col ? `<span class="sk-sort-arrow">${_skSort.dir==='asc'?'▲':'▼'}</span>` : '';
  const thHtml = c => `<th class="${c.cls} ${!c.sortable?'nosort':''} ${c.key===_skSort.col?'sorted':''}" data-col="${c.sortable?c.key:''}">${c.sortable?arrow(c.key):''}${c.label}</th>`;

  let qtyHeaders, valHeader;
  if (singleMode) {
    qtyHeaders = `<th class="nosort">الكمية — ${SK_ESC(activeWh[0].name)}</th>`;
    valHeader  = `<th data-col="value" class="${_skSort.col==='value'?'sorted':''}">${arrow('value')}القيمة (ر.س)</th>`;
  } else {
    qtyHeaders = activeWh.map(w => `<th class="nosort">كمية — ${SK_ESC(w.name)}</th>`).join('')
      + `<th data-col="qty" class="${_skSort.col==='qty'?'sorted':''}">${arrow('qty')}إجمالي الكمية</th>`;
    valHeader = `<th data-col="value" class="${_skSort.col==='value'?'sorted':''}">${arrow('value')}إجمالي القيمة (ر.س)</th>`;
  }

  const NCOLS = staticCols.length + (singleMode ? 2 : activeWh.length + 2) + 1; // +1 = MAC

  let html = `<table class="sk-tbl"><thead><tr>
    ${thHtml(staticCols[0])}${thHtml(staticCols[1])}${thHtml(staticCols[2])}
    ${qtyHeaders}
    ${thHtml(staticCols[3])}
    ${thHtml(staticCols[4])}
    <th data-col="mac" class="${_skSort.col==='mac'?'sorted':''}">${arrow('mac')}MAC (ر.س)</th>
    ${valHeader}
  </tr></thead><tbody>`;

  if (!items.length) {
    html += `<tr><td colspan="${NCOLS}" class="sk-no-data">لا توجد أصناف تطابق الفلتر</td></tr>`;
  } else {
    items.forEach(r => {
      const barW = Math.round(((r.value||0) / maxVal) * 80);
      let qtyCells;
      if (singleMode) {
        const w = r.byWarehouse[activeWh[0].id];
        const q = w ? w.qty : 0;
        qtyCells = `<td class="num ${q<0?'neg':''}">${SK_FMTQ(q)}</td>`;
      } else {
        qtyCells = activeWh.map(w => {
          const wd = r.byWarehouse[w.id];
          const q = wd ? wd.qty : 0;
          return `<td class="num ${q<0?'neg':''}">${wd ? SK_FMTQ(q) : '—'}</td>`;
        }).join('')
        + `<td class="num ${r.qty<0?'neg':''}">${SK_FMTQ(r.qty)}</td>`;
      }
      html += `<tr>
        <td style="color:#8a9bb5;font-size:.75rem">${SK_ESC(r.itemCode||'')}</td>
        <td class="col-lbl">${SK_ESC(r.nameAr)}</td>
        <td><span class="cat">${SK_ESC(r.categoryName)}</span></td>
        ${qtyCells}
        <td class="num" style="color:${(r.reservedQty||0)>0?'#e67e22':'#5a7a9a'}">${SK_FMTQ(r.reservedQty||0)}</td>
        <td style="color:#8a9bb5;font-size:.75rem">${SK_ESC(r.unitName)}</td>
        <td class="num">${r.mac ? SK_FMT(r.mac) : '—'}</td>
        <td class="num hi ${r.value<0?'neg':''}"><span class="sk-val-bar" style="width:${Math.max(barW,0)}px"></span>${SK_FMT(r.value)}</td>
      </tr>`;
    });
    // total row
    let totQtyCells;
    if (singleMode) {
      totQtyCells = `<td class="num ${totQty<0?'neg':''}" style="color:#27ae60">${SK_FMTQ(totQty)}</td>`;
    } else {
      const perWhTotals = activeWh.map(w => items.reduce((s,r) => s + ((r.byWarehouse[w.id]||{}).qty||0), 0));
      totQtyCells = perWhTotals.map(v => `<td class="num ${v<0?'neg':''}" style="color:#27ae60">${SK_FMTQ(v)}</td>`).join('')
        + `<td class="num ${totQty<0?'neg':''}" style="color:#27ae60">${SK_FMTQ(totQty)}</td>`;
    }
    html += `<tr style="background:#111e2d;font-weight:700">
      <td></td>
      <td class="col-lbl" style="color:#cdd8e8">الإجمالي</td>
      <td></td>
      ${totQtyCells}
      <td class="num" style="color:#e67e22">${SK_FMTQ(totReserved)}</td>
      <td></td><td></td>
      <td class="num ${totValue<0?'neg':''}" style="color:#27ae60">${SK_FMT(totValue)}</td>
    </tr>`;
  }
  html += '</tbody></table>';

  const body = wrap.querySelector('#sk-body');
  body.innerHTML = html;

  // Table header sort — event delegation
  if (!body._skDelegated) {
    body._skDelegated = true;
    body.addEventListener('click', e => {
      const th = e.target.closest('th[data-col]');
      if (!th || !th.dataset.col) return;
      const col = th.dataset.col;
      if (_skSort.col === col) _skSort.dir = _skSort.dir === 'asc' ? 'desc' : 'asc';
      else { _skSort.col = col; _skSort.dir = 'desc'; }
      _skRender();
    });
  }

  const footerTotal = showGl ? _skGlBalance : totValue;
  const footerLabel = showGl ? 'رصيد المخزون (دفتر الأستاذ)' : 'إجمالي MAC';
  wrap.querySelector('#sk-footer').innerHTML =
    `<span>${totItems} صنف معروض</span><span>${footerLabel}: <strong style="color:#27ae60">${SK_FMT(footerTotal)} ر.س</strong></span>`;
}

/* ── Donut chart ── */
const SK_COLORS = ['#27ae60','#2ecc71','#1a8a4a','#d4a017','#e67e22','#3498db','#9b59b6','#e74c3c','#1abc9c','#f39c12','#2980b9','#8e44ad'];

function _skUpdateChart(items) {
  const catMap = new Map();
  items.forEach(r => catMap.set(r.categoryName, (catMap.get(r.categoryName)||0)+r.value));
  const sorted = [...catMap.entries()].sort((a,b)=>b[1]-a[1]);
  // top 8, rest = أخرى
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8).reduce((s,e)=>s+e[1],0);
  if (rest > 0) top.push(['أخرى', rest]);

  const labels = top.map(e=>e[0]);
  const values = top.map(e=>e[1]);
  const colors = labels.map((_,i)=>SK_COLORS[i % SK_COLORS.length]);

  const canvas = document.getElementById('sk-chart');
  if (!canvas) return;
  if (_skChart) { _skChart.destroy(); _skChart = null; }

  _skChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: '#0d1b2a' }] },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${SK_FMT(ctx.parsed)} ر.س`,
            title: ctx => ctx[0].label,
          }
        }
      },
      cutout: '60%',
    }
  });

  const totVal = values.reduce((s,v)=>s+v,0) || 1;
  const legend = document.getElementById('sk-legend');
  if (legend) {
    legend.innerHTML = top.map((e,i)=>`
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${colors[i]};flex-shrink:0"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${SK_ESC(e[0])}">${SK_ESC(e[0])}</span>
        <span style="color:#27ae60;white-space:nowrap">${((e[1]/totVal)*100).toFixed(1)}%</span>
      </div>`).join('');
  }
}

/* ── Print / PDF ── */
function _skPrint(mode) {
  if (!_skData) { alert('لا توجد بيانات'); return; }
  const company = State.get('companyName') || '';
  const dateStr = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const el = id => document.getElementById(id);
  const whLabel = _skWhSel.length
    ? _skWarehouses.filter(w => _skWhSel.includes(w.id)).map(w => w.name).join('، ')
    : 'الكل';
  if (el('sk-ph-company')) el('sk-ph-company').textContent = company;
  if (el('sk-ph-filter'))  el('sk-ph-filter').textContent  = `الفئة: ${_skCat==='all'?'الكل':_skCat} — المستودع: ${whLabel}${_skNegOnly ? ' — السالب فقط' : ''}`;
  if (el('sk-ph-date'))    el('sk-ph-date').textContent    = `تاريخ التقرير: ${dateStr} — تاريخ القطع: ${_skAsOf || _skTodayStr()}`;
  if (mode === 'pdf') document.title = `رصيد المخزون — ${dateStr}`;
  window.print();
}

/* ── Excel ── */
async function _skExportExcel() {
  if (!_skData) { alert('لا توجد بيانات'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const items = _skFiltered().slice().sort((a,b) => b.value - a.value);
  const company = State.get('companyName') || 'مؤسسة أبعاد الحديد التجارية';
  const catLabel = _skCat === 'all' ? 'الكل' : _skCat;
  const dateStr = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const numFmt  = '#,##0.000';
  const valFmt  = '#,##0.00';

  const activeWh   = _skActiveWarehouses();
  const singleMode = _skSingleMode();
  const whCols     = singleMode ? [activeWh[0]] : activeWh;

  const CLR = { navy:'FF0A2040', navyMid:'FF1A3A6A', green:'FF27ae60', gold:'FFD4A017',
                pale:'FFE8F8EE', white:'FFFFFFFF', alt:'FFF4FBF6', neg:'FFC0392B' };
  const FONT = 'Calibri';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
  const ws = wb.addWorksheet('رصيد المخزون', { views: [{ rightToLeft: true }] });
  ws.pageSetup.paperSize = 9; ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.fitToPage = true; ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.margins = { left:.5, right:.5, top:.75, bottom:.75, header:.3, footer:.3 };

  // أعمدة: رمز | اسم | فئة | [كمية لكل مستودع] | [إجمالي كمية إن تعدد] | محجوز | وحدة | MAC | قيمة
  const qtyColCount = singleMode ? 1 : whCols.length + 1;
  ws.columns = [
    { width:12 }, { width:40 }, { width:20 },
    ...Array(qtyColCount).fill({ width:14 }),
    { width:10 }, { width:10 }, { width:14 }, { width:18 },
  ];
  const totalCols = 3 + qtyColCount + 4;

  const cen = { horizontal:'center', vertical:'middle' };
  const rtl = { horizontal:'right',  vertical:'middle', readingOrder:2 };
  const num = { horizontal:'right',  vertical:'middle' };

  // Title
  const r1 = ws.addRow(Array(totalCols).fill(''));
  r1.getCell(1).value = 'رصيد المخزون الحالي';
  ws.mergeCells(`A${r1.number}:${ws.getColumn(totalCols).letter}${r1.number}`);
  r1.getCell('A').font = { name:FONT, bold:true, size:16, color:{ argb:CLR.navy } };
  r1.getCell('A').alignment = cen; r1.height = 28;

  const r2 = ws.addRow(Array(totalCols).fill(''));
  r2.getCell(1).value = company;
  ws.mergeCells(`A${r2.number}:${ws.getColumn(totalCols).letter}${r2.number}`);
  r2.getCell('A').font = { name:FONT, size:11, color:{ argb:'FF334466' } };
  r2.getCell('A').alignment = cen;

  const whLabel = _skWhSel.length ? whCols.map(w=>w.name).join('، ') : 'الكل';
  const r3 = ws.addRow(Array(totalCols).fill(''));
  r3.getCell(1).value = `الفئة: ${catLabel}  |  المستودع: ${whLabel}  |  تاريخ القطع: ${_skAsOf || _skTodayStr()}  |  ${dateStr}`;
  ws.mergeCells(`A${r3.number}:${ws.getColumn(totalCols).letter}${r3.number}`);
  r3.getCell('A').font = { name:FONT, size:10, color:{ argb:'FF667788' } };
  r3.getCell('A').alignment = cen; r3.height = 18;
  ws.addRow([]);

  // Header row
  const headerLabels = ['رمز الصنف','اسم الصنف','الفئة',
    ...(singleMode ? [`الكمية — ${whCols[0].name}`] : [...whCols.map(w => `كمية — ${w.name}`), 'إجمالي الكمية']),
    'محجوز','الوحدة','MAC (ر.س)','القيمة (ر.س)'];
  const hRow = ws.addRow(headerLabels);
  hRow.height = 22;
  const hFill = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.navy } };
  const hFont = { name:FONT, bold:true, color:{ argb:CLR.white }, size:10 };
  hRow.eachCell(c => { c.fill=hFill; c.font=hFont; c.alignment=cen; c.border={bottom:{style:'thin',color:{argb:CLR.green}}}; });
  hRow.getCell(2).alignment = rtl;

  // Group by category
  const catMap = new Map();
  items.forEach(r => { if (!catMap.has(r.categoryName)) catMap.set(r.categoryName,[]); catMap.get(r.categoryName).push(r); });

  const grpFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.navyMid } };
  const grpFont  = { name:FONT, bold:true, color:{ argb:CLR.white }, size:10 };
  const totFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.pale } };
  const totFont  = { name:FONT, bold:true, color:{ argb:CLR.navy }, size:10 };
  const altFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.alt } };
  const grandFill= { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.navy } };
  const grandFont= { name:FONT, bold:true, color:{ argb:CLR.green }, size:11 };

  const valColIdx = totalCols; // آخر عمود = القيمة
  let grandVal = 0, grandQty = 0;

  catMap.forEach((list, cat) => {
    const catVal = list.reduce((s,r)=>s+r.value,0);
    const catQty = list.reduce((s,r)=>s+r.qty,0);
    grandVal += catVal; grandQty += catQty;

    const gRow = ws.addRow(Array(totalCols).fill(''));
    gRow.getCell(1).value = `📦  ${cat}  (${list.length} صنف)`;
    ws.mergeCells(`A${gRow.number}:${ws.getColumn(totalCols-1).letter}${gRow.number}`);
    gRow.getCell(valColIdx).value = catVal;
    gRow.height = 20;
    gRow.eachCell((c,i) => { c.fill=grpFill; c.font=grpFont; c.alignment=i<totalCols?rtl:num; if(i===valColIdx)c.numFmt=valFmt; });

    list.forEach((r,idx) => {
      const qtyVals = singleMode
        ? [ (r.byWarehouse[whCols[0].id]||{}).qty || 0 ]
        : [ ...whCols.map(w => (r.byWarehouse[w.id]||{}).qty || 0), r.qty ];
      const rowVals = [r.itemCode||'', r.nameAr, r.categoryName, ...qtyVals, r.reservedQty||0, r.unitName||'', r.mac||0, r.value];
      const dRow = ws.addRow(rowVals);
      dRow.height = 17;
      const af = idx%2===1 ? altFill : null;
      for (let i = 1; i <= totalCols; i++) {
        const c = dRow.getCell(i);
        const isQtyCol = i >= 4 && i <= 3 + qtyColCount;
        if (af) c.fill = af;
        const v = c.value;
        const isNeg = typeof v === 'number' && v < 0;
        c.font = { name:FONT, size:10, color: isNeg ? { argb: CLR.neg } : undefined, bold: isNeg || i === valColIdx };
        c.alignment = i===2 ? rtl : cen;
        if (isQtyCol) c.numFmt = numFmt;
        else if (i >= 3 + qtyColCount + 3) c.numFmt = valFmt; // MAC/قيمة
        if (i === valColIdx) c.font = { name:FONT, size:10, bold:true, color:{ argb: isNeg ? CLR.neg : 'FF1a6a3c' } };
      }
    });

    const sRow = ws.addRow(Array(totalCols).fill(''));
    sRow.getCell(1).value = `إجمالي ${cat}`;
    ws.mergeCells(`A${sRow.number}:${ws.getColumn(totalCols-1).letter}${sRow.number}`);
    sRow.getCell(valColIdx).value = catVal;
    sRow.height = 18;
    sRow.eachCell((c,i)=>{ c.fill=totFill; c.font=totFont; c.alignment=i<totalCols?rtl:num; if(i===valColIdx)c.numFmt=valFmt; c.border={top:{style:'thin',color:{argb:CLR.navyMid}}}; });
    ws.addRow([]);
  });

  // Grand total
  const gt = ws.addRow(Array(totalCols).fill(''));
  gt.getCell(1).value = 'الإجمالي الكلي';
  ws.mergeCells(`A${gt.number}:${ws.getColumn(totalCols-1).letter}${gt.number}`);
  gt.getCell(valColIdx).value = grandVal;
  gt.height = 24;
  gt.eachCell((c,i)=>{ c.fill=grandFill; c.font=grandFont; c.alignment=i<totalCols?rtl:num; if(i===valColIdx)c.numFmt=valFmt; c.border={top:{style:'medium',color:{argb:CLR.green}},bottom:{style:'medium',color:{argb:CLR.green}}}; });

  try {
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `رصيد_المخزون_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) { alert('خطأ في التصدير: ' + e.message); }
}

/* ── Status ── */
function _skSetStatus(msg, color) {
  const el = document.getElementById('sk-status');
  if (el) { el.textContent = msg; el.style.color = color; }
}
