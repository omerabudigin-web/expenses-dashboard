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

function _skIsActive() {
  return !!document.querySelector('.tab.active[data-tab="stock"]');
}
function _skStopAuto() {
  if (_skAutoTimer) { clearInterval(_skAutoTimer); _skAutoTimer = null; }
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
      const db = State.get('db');
      try {
        const data = await fetch(`/api/stock?db=${encodeURIComponent(db)}`).then(r => r.json());
        if (data.error) throw new Error(data.error);
        _skData      = data.items;
        _skGlBalance = data.glBalance;
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

  const db = State.get('db');
  _skSetStatus('⏳ جارٍ تحميل بيانات المخزون…', '#a87d00');

  try {
    const data = await fetch(`/api/stock?db=${encodeURIComponent(db)}`).then(r => r.json());
    if (data.error) throw new Error(data.error);
    _skData      = data.items;
    _skGlBalance = data.glBalance;
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

.sk-kpis{display:flex;gap:12px;padding:14px 18px;flex-wrap:wrap}
.sk-kpi{background:#162032;border:1px solid #1e3a5f;border-radius:10px;padding:12px 20px;min-width:160px;text-align:center;position:relative;overflow:hidden}
.sk-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--kpi-color,#27ae60)}
.sk-kpi label{display:block;font-size:.75rem;color:#8a9bb5;margin-bottom:4px}
.sk-kpi .sk-val{font-size:1.2rem;font-weight:800;color:#27ae60;font-family:'Cairo',sans-serif}

.sk-main{display:flex;gap:0;padding:0 18px 30px}
.sk-chart-card{background:#162032;border:1px solid #1e3a5f;border-radius:10px;padding:16px;min-width:260px;max-width:280px;margin-top:16px;align-self:flex-start}
.sk-chart-card h4{margin:0 0 12px;font-size:.85rem;color:#8a9bb5;text-align:center}
.sk-table-wrap{flex:1;margin-top:16px;overflow-x:auto}

table.sk-tbl{border-collapse:collapse;width:100%;font-size:.8rem}
table.sk-tbl th{background:#111e2d;color:#8a9bb5;font-size:.72rem;padding:7px 10px;text-align:center;border-bottom:1px solid #1a2d42;white-space:nowrap;cursor:pointer;user-select:none}
table.sk-tbl th:hover{color:#27ae60}
table.sk-tbl th.sorted{color:#27ae60}
table.sk-tbl th.col-lbl{text-align:right}
table.sk-tbl td{padding:6px 10px;border-bottom:1px solid #0f1e2d;text-align:center;white-space:nowrap}
table.sk-tbl td.col-lbl{text-align:right;max-width:320px;white-space:normal}
table.sk-tbl tr:hover td{background:rgba(39,174,96,.05)}
table.sk-tbl td.num{font-family:'Cairo',sans-serif;color:#c5d3e0}
table.sk-tbl td.num.hi{color:#27ae60;font-weight:700}
table.sk-tbl td.cat{font-size:.72rem;color:#7ab4e0;background:rgba(30,58,95,.4);border-radius:8px;padding:2px 8px;display:inline-block}
.sk-sort-arrow{font-size:.65rem;margin-right:3px}
.sk-no-data{padding:40px;text-align:center;color:#5a7a9a}
.sk-tbl-footer{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:.78rem;color:#8a9bb5}
.sk-val-bar{display:inline-block;height:6px;background:#27ae60;border-radius:3px;vertical-align:middle;margin-right:6px;opacity:.6}

@media print{
  body{background:#fff!important;color:#000!important}
  .tab-bar,.conn-bar,.sk-toolbar,.sk-filters,.sk-export-btns,.sk-chart-card,
  .sk-btn,#sk-status{display:none!important}
  .sk-kpis{flex-wrap:wrap}
  .sk-kpi{border:1px solid #ccc!important;background:#f9f9f9!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sk-kpi .sk-val{color:#1a6a3c!important}
  .sk-main{padding:0!important}
  .sk-table-wrap{overflow:visible!important}
  table.sk-tbl th{background:#dde6f4!important;color:#111!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:8pt!important}
  table.sk-tbl td{font-size:8pt!important;color:#111!important;border-bottom:1px solid #ddd!important}
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

<div class="sk-filters">
  <label>الفئة:</label>
  <div class="sk-chip-grp" id="sk-cat-chips"></div>
  <input class="sk-search" id="sk-search" placeholder="بحث عن صنف…" type="text">
</div>

<div class="sk-kpis" id="sk-kpis"></div>

<div class="sk-main">
  <div style="flex:1">
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

  // Export buttons
  wrap.querySelector('#sk-btn-excel').addEventListener('click', () => _skExportExcel());
  wrap.querySelector('#sk-btn-pdf').addEventListener('click',   () => _skPrint('pdf'));
  wrap.querySelector('#sk-btn-print').addEventListener('click', () => _skPrint('print'));
}

/* ── Build category chips dynamically from data ── */
function _skBuildCatChips(wrap) {
  if (!_skData) return;
  const cats = [...new Set(_skData.map(r => r.categoryName))].sort();
  const grp = wrap.querySelector('#sk-cat-chips');
  grp.innerHTML = '';
  const all = document.createElement('div');
  all.className = 'sk-chip active'; all.textContent = 'الكل'; all.dataset.cat = 'all';
  grp.appendChild(all);
  cats.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'sk-chip'; chip.textContent = c; chip.dataset.cat = c;
    grp.appendChild(chip);
  });
  grp.addEventListener('click', e => {
    const chip = e.target.closest('.sk-chip');
    if (!chip) return;
    grp.querySelectorAll('.sk-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    _skCat = chip.dataset.cat;
    _skRender();
  });
}

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

  // KPIs
  const totItems   = items.length;
  const totValue   = items.reduce((s,r) => s + (r.value||0), 0);
  const totQty     = items.reduce((s,r) => s + (r.qty||0), 0);
  const totReserved= items.reduce((s,r) => s + (r.reservedQty||0), 0);
  const showGl = _skGlBalance != null && _skCat === 'all' && !_skSearch;
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
    <div class="sk-kpi"><label>آخر تحديث</label><div class="sk-val" style="font-size:.9rem">${new Date().toLocaleDateString('ar-SA')}</div></div>
  `;

  // Chart
  _skUpdateChart(items);

  // Max value for bar
  const maxVal = items.reduce((m,r)=>Math.max(m,r.value),0) || 1;

  // Table
  const cols = [
    { key:'itemCode',     label:'الرمز',              cls:'' },
    { key:'nameAr',       label:'اسم الصنف',          cls:'col-lbl' },
    { key:'categoryName', label:'الفئة',               cls:'' },
    { key:'qty',          label:'الكمية',               cls:'' },
    { key:'reservedQty',  label:'محجوز',               cls:'' },
    { key:'unitName',     label:'الوحدة',               cls:'' },
    { key:'mac',          label:'MAC (ر.س)',            cls:'' },
    { key:'value',        label:'القيمة (ر.س)',         cls:'' },
  ];

  const arrow = k => k === _skSort.col ? `<span class="sk-sort-arrow">${_skSort.dir==='asc'?'▲':'▼'}</span>` : '';

  const NCOLS = cols.length;
  let html = `<table class="sk-tbl"><thead><tr>
    ${cols.map(c=>`<th class="${c.cls} ${c.key===_skSort.col?'sorted':''}" data-col="${c.key}">${arrow(c.key)}${c.label}</th>`).join('')}
  </tr></thead><tbody>`;

  if (!items.length) {
    html += `<tr><td colspan="${NCOLS}" class="sk-no-data">لا توجد أصناف تطابق الفلتر</td></tr>`;
  } else {
    items.forEach(r => {
      const barW = Math.round(((r.value||0) / maxVal) * 80);
      html += `<tr>
        <td style="color:#8a9bb5;font-size:.75rem">${SK_ESC(r.itemCode||'')}</td>
        <td class="col-lbl">${SK_ESC(r.nameAr)}</td>
        <td><span class="cat">${SK_ESC(r.categoryName)}</span></td>
        <td class="num">${SK_FMTQ(r.qty)}</td>
        <td class="num" style="color:${(r.reservedQty||0)>0?'#e67e22':'#5a7a9a'}">${SK_FMTQ(r.reservedQty||0)}</td>
        <td style="color:#8a9bb5;font-size:.75rem">${SK_ESC(r.unitName)}</td>
        <td class="num">${r.mac ? SK_FMT(r.mac) : '—'}</td>
        <td class="num hi"><span class="sk-val-bar" style="width:${barW}px"></span>${SK_FMT(r.value)}</td>
      </tr>`;
    });
    // total row
    html += `<tr style="background:#111e2d;font-weight:700">
      <td></td>
      <td class="col-lbl" style="color:#cdd8e8">الإجمالي</td>
      <td></td>
      <td class="num" style="color:#27ae60">${SK_FMTQ(totQty)}</td>
      <td class="num" style="color:#e67e22">${SK_FMTQ(totReserved)}</td>
      <td></td><td></td>
      <td class="num" style="color:#27ae60">${SK_FMT(totValue)}</td>
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
      if (!th) return;
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
  if (el('sk-ph-company')) el('sk-ph-company').textContent = company;
  if (el('sk-ph-filter'))  el('sk-ph-filter').textContent  = `الفئة: ${_skCat==='all'?'الكل':_skCat}`;
  if (el('sk-ph-date'))    el('sk-ph-date').textContent    = `تاريخ التقرير: ${dateStr}`;
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

  const CLR = { navy:'FF0A2040', navyMid:'FF1A3A6A', green:'FF27ae60', gold:'FFD4A017',
                pale:'FFE8F8EE', white:'FFFFFFFF', alt:'FFF4FBF6' };
  const FONT = 'Calibri';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
  const ws = wb.addWorksheet('رصيد المخزون', { views: [{ rightToLeft: true }] });
  ws.pageSetup.paperSize = 9; ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.fitToPage = true; ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.margins = { left:.5, right:.5, top:.75, bottom:.75, header:.3, footer:.3 };
  // 8 cols: رمز | اسم | فئة | كمية | محجوز | وحدة | MAC | قيمة
  ws.columns = [
    { width:12 }, { width:40 }, { width:20 }, { width:12 }, { width:10 }, { width:10 }, { width:14 }, { width:18 },
  ];

  const cen = { horizontal:'center', vertical:'middle' };
  const rtl = { horizontal:'right',  vertical:'middle', readingOrder:2 };
  const num = { horizontal:'right',  vertical:'middle' };

  // Title
  const r1 = ws.addRow(['رصيد المخزون الحالي','','','','','','','']);
  ws.mergeCells(`A${r1.number}:H${r1.number}`);
  r1.getCell('A').font = { name:FONT, bold:true, size:16, color:{ argb:CLR.navy } };
  r1.getCell('A').alignment = cen; r1.height = 28;

  const r2 = ws.addRow([company,'','','','','','','']);
  ws.mergeCells(`A${r2.number}:H${r2.number}`);
  r2.getCell('A').font = { name:FONT, size:11, color:{ argb:'FF334466' } };
  r2.getCell('A').alignment = cen;

  const r3 = ws.addRow([`الفئة: ${catLabel}  |  ${dateStr}`,'','','','','','','']);
  ws.mergeCells(`A${r3.number}:H${r3.number}`);
  r3.getCell('A').font = { name:FONT, size:10, color:{ argb:'FF667788' } };
  r3.getCell('A').alignment = cen; r3.height = 18;
  ws.addRow([]);

  // Header row: رمز | اسم | فئة | كمية | محجوز | وحدة | MAC | قيمة
  const hRow = ws.addRow(['رمز الصنف','اسم الصنف','الفئة','الكمية','محجوز','الوحدة','MAC (ر.س)','القيمة (ر.س)']);
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

  let grandVal = 0, grandQty = 0;

  catMap.forEach((list, cat) => {
    const catVal = list.reduce((s,r)=>s+r.value,0);
    const catQty = list.reduce((s,r)=>s+r.qty,0);
    grandVal += catVal; grandQty += catQty;

    const gRow = ws.addRow([`📦  ${cat}  (${list.length} صنف)`,'','','',''  ,'','',catVal]);
    ws.mergeCells(`A${gRow.number}:G${gRow.number}`);
    gRow.height = 20;
    gRow.eachCell((c,i) => { c.fill=grpFill; c.font=grpFont; c.alignment=i<=7?rtl:num; if(i===8)c.numFmt=valFmt; });

    list.forEach((r,idx) => {
      const dRow = ws.addRow([r.itemCode||'', r.nameAr, r.categoryName, r.qty, r.reservedQty||0, r.unitName||'', r.mac||0, r.value]);
      dRow.height = 17;
      const af = idx%2===1 ? altFill : null;
      [1,2,3,4,5,6,7,8].forEach(i => {
        const c = dRow.getCell(i);
        if (af) c.fill = af;
        c.font = { name:FONT, size:10 };
        c.alignment = i===2 ? rtl : cen;
        if (i>=4) c.numFmt = i>=7 ? valFmt : numFmt;
        if (i===8) c.font = { name:FONT, size:10, bold:true, color:{ argb:'FF1a6a3c' } };
      });
    });

    const sRow = ws.addRow([`إجمالي ${cat}`,'','','','','','',catVal]);
    ws.mergeCells(`A${sRow.number}:G${sRow.number}`);
    sRow.height = 18;
    sRow.eachCell((c,i)=>{ c.fill=totFill; c.font=totFont; c.alignment=i<=7?rtl:num; if(i===8)c.numFmt=valFmt; c.border={top:{style:'thin',color:{argb:CLR.navyMid}}}; });
    ws.addRow([]);
  });

  // Grand total
  const gt = ws.addRow(['الإجمالي الكلي','','','','','','',grandVal]);
  ws.mergeCells(`A${gt.number}:G${gt.number}`);
  gt.height = 24;
  gt.eachCell((c,i)=>{ c.fill=grandFill; c.font=grandFont; c.alignment=i<=7?rtl:num; if(i===8)c.numFmt=valFmt; c.border={top:{style:'medium',color:{argb:CLR.green}},bottom:{style:'medium',color:{argb:CLR.green}}}; });

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
