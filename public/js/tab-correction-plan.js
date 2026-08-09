'use strict';

// ── NEGATIVE-STOCK CORRECTION PLAN TAB ────────────────────────────────────────
// Same data source as tab-negative-stock.js, re-organized for handoff to the
// accountant: which item is most responsible for each flagged invoice's
// corrupted COGS, grouped by item so the few dominant SKUs can be prioritized
// instead of chasing invoices one by one.

let _cpData    = null;
let _cpInited  = false;
let _cpActiveItem = null; // null = show all

function _cpMount() {
  const el = document.getElementById('tab-correction-plan');
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = '1';
  el.innerHTML = `
    <div class="filters">
      <label>من:</label><input type="date" id="cp-from">
      <label>إلى:</label><input type="date" id="cp-to">
      <button id="cp-run" class="verify-btn">🔍 تشغيل</button>
      <button id="cp-export-excel" class="verify-btn">📊 تصدير Excel احترافي</button>
      <span id="cp-status" style="margin-right:auto;font-size:.82rem;color:#7a9ac0"></span>
    </div>

    <div id="cp-note" style="background:#0f2035;border:1px solid #2a4a7a;border-radius:8px;
      padding:14px 18px;margin:12px 0;font-size:.85rem;line-height:1.9;color:#c8d8e8">
      خطة تصحيح للفواتير المتأثرة بعيب تكلفة المخزون السالب (بعد استبعاد ما اتصحح فعلياً بمردود، وفواتير نقل
      العهدة البينية) — مُجمَّعة حسب <strong style="color:#f0a050">الصنف الأكثر مسؤولية</strong> عن التشويه في كل
      فاتورة (السطر صاحب أكبر انحراف داخل الفاتورة)، مع التكلفة المرجعية النظيفة لكل صنف من تاريخ شرائه الفعلي.
      <strong style="color:#4ada8e">الأرقام تقديرية للمراجعة — الترحيل النهائي يتم من داخل MekSoft بمعرفة المحاسب.</strong>
    </div>

    <div id="cp-kpis" class="kpis"></div>

    <div class="sec-title">أولوية التصحيح — مُجمَّعة حسب الصنف</div>
    <div style="overflow-x:auto">
      <table class="tb-tbl" id="cp-item-table">
        <thead><tr>
          <th>الصنف</th><th class="num">عدد الفواتير</th><th class="num">التكلفة المرجعية للوحدة</th>
          <th class="num">إجمالي حجم التشويه</th><th></th>
        </tr></thead>
        <tbody id="cp-item-tbody"></tbody>
      </table>
    </div>

    <div class="sec-title" style="margin-top:22px">
      <span id="cp-detail-title">تفاصيل الفواتير</span>
      <button id="cp-clear-filter" class="verify-btn" style="display:none;font-size:.75rem;padding:3px 10px;margin-right:10px">✕ عرض الكل</button>
    </div>
    <input type="text" id="cp-search" placeholder="🔍 بحث بالعميل أو المندوب..."
      style="margin:8px 0;padding:7px 12px;background:#0f2035;border:1px solid #1e3a5f;
      border-radius:6px;color:#c8d8e8;width:280px">
    <div style="overflow-x:auto">
      <table class="tb-tbl" id="cp-inv-table">
        <thead><tr>
          <th>التاريخ</th><th>فاتورة</th><th>JV</th><th>العميل</th><th>المندوب</th>
          <th>الصنف المسبب</th><th class="num">الكمية</th>
          <th class="num">التكلفة المسجَّلة</th><th class="num">التكلفة المصحَّحة المقترحة</th>
        </tr></thead>
        <tbody id="cp-inv-tbody"></tbody>
      </table>
    </div>
  `;
}

function initCorrectionPlan() {
  if (_cpInited) return;
  _cpInited = true;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('cp-from').value = '2025-10-01';
  document.getElementById('cp-to').value   = today;

  document.getElementById('cp-run').addEventListener('click', fetchCorrectionPlan);
  document.getElementById('cp-search').addEventListener('input', _renderCPInvoiceTable);
  document.getElementById('cp-clear-filter').addEventListener('click', () => {
    _cpActiveItem = null;
    _renderCP();
  });
  document.getElementById('cp-export-excel').addEventListener('click', () => {
    const btn = document.getElementById('cp-export-excel');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportCPExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 تصدير Excel احترافي'; });
  });
}

async function fetchCorrectionPlan() {
  const db     = State.get('activeDb') || 'MekSoftDb1';
  const from   = document.getElementById('cp-from').value;
  const to     = document.getElementById('cp-to').value;
  const status = document.getElementById('cp-status');
  if (!from || !to) { alert('الرجاء اختيار الفترة الزمنية'); return; }

  status.textContent = 'جارٍ التحميل…';
  try {
    const params = new URLSearchParams({ db, from, to });
    const res = await fetch(`/api/negative-stock-audit?${params}`);
    if (!res.ok) throw new Error((await res.json()).error || 'فشل التحميل');
    _cpData = await res.json();
    _cpActiveItem = null;
    _renderCP();
    status.textContent = `✅ ${_cpData.invoices.length} فاتورة | ${_cpData.itemSummary.length} صنف | ${new Date().toLocaleTimeString('ar-SA')}`;
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
}

function renderCorrectionPlan() {
  _cpMount();
  initCorrectionPlan();
  if (_cpData) _renderCP(); else fetchCorrectionPlan();
}

function _renderCP() {
  if (!_cpData) return;
  _renderCPKPIs();
  _renderCPItemTable();
  _renderCPInvoiceTable();
}

function _renderCPKPIs() {
  const t = _cpData.totals;
  const items = [
    { lbl: 'عدد الفواتير المتأثرة', val: fmt(t.invoiceCount, 0), sub: `من ${_cpData.from} إلى ${_cpData.to}`, accent: '#da4a4a' },
    { lbl: 'عدد الأصناف المسؤولة', val: fmt(_cpData.itemSummary.length, 0), sub: 'صنف مختلف وراء كل الفواتير', accent: '#5baef0' },
    { lbl: 'إجمالي حجم التشويه', val: fmt(t.absDistortion, 2) + ' ر.س', sub: 'مجموع |التشويه| لكل فاتورة', accent: '#e0906a' },
    { lbl: 'أكبر صنف بالأثر', val: (_cpData.itemSummary[0]?.item || '—'), sub: _cpData.itemSummary[0] ? `${fmt(_cpData.itemSummary[0].invoiceCount,0)} فاتورة، ${fmt(_cpData.itemSummary[0].totalAbsDistortion,2)} ر.س` : '—', accent: '#f0a050' },
  ];
  document.getElementById('cp-kpis').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val" style="font-size:${k.lbl==='أكبر صنف بالأثر'?'0.95rem':'1.35rem'}">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

function _renderCPItemTable() {
  const tbody = document.getElementById('cp-item-tbody');
  tbody.innerHTML = _cpData.itemSummary.map(g => {
    const active = g.item === _cpActiveItem;
    return `<tr class="tb-row cp-item-row" data-item="${esc(g.item)}" style="cursor:pointer;${active ? 'background:rgba(91,174,240,.15)' : ''}">
      <td>${esc(g.item)}</td>
      <td class="num">${fmt(g.invoiceCount, 0)}</td>
      <td class="num">${g.refCostPerUnit != null ? fmt(g.refCostPerUnit, 2) : '—'}</td>
      <td class="num" style="color:#e0906a;font-weight:600">${fmt(g.totalAbsDistortion, 2)}</td>
      <td style="color:#5baef0;font-size:.78rem">${active ? '● مُختار' : 'عرض الفواتير ▶'}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.cp-item-row').forEach(row => {
    row.addEventListener('click', () => {
      _cpActiveItem = row.dataset.item;
      _renderCP();
      document.getElementById('cp-inv-table').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

function _renderCPInvoiceTable() {
  const tbody  = document.getElementById('cp-inv-tbody');
  const titleEl = document.getElementById('cp-detail-title');
  const clearBtn = document.getElementById('cp-clear-filter');
  if (!_cpData) return;

  clearBtn.style.display = _cpActiveItem ? 'inline-block' : 'none';
  titleEl.textContent = _cpActiveItem ? `تفاصيل الفواتير — ${_cpActiveItem}` : 'تفاصيل كل الفواتير';

  const search = (document.getElementById('cp-search')?.value || '').trim().toLowerCase();
  const rows = _cpData.invoices
    .filter(r => !_cpActiveItem || r.dominantItem === _cpActiveItem)
    .filter(r => !search || r.customer.toLowerCase().includes(search) || r.salesMan.toLowerCase().includes(search))
    .sort((a, b) => (a.dominantItem || '').localeCompare(b.dominantItem || '') || a.date.localeCompare(b.date));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:#3a5a7a">لا توجد نتائج</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const isWissam = r.customer.includes('وسام');
    return `<tr class="tb-row" style="${isWissam ? 'background:rgba(91,174,240,.06)' : ''}">
      <td style="white-space:nowrap">${esc(r.date)}</td>
      <td>${r.invId}</td>
      <td>${r.jvId}</td>
      <td>${esc(r.customer)}</td>
      <td>${esc(r.salesMan)}</td>
      <td>${esc(r.dominantItem || '—')}</td>
      <td class="num">${r.dominantItemQty != null ? fmt(r.dominantItemQty, 2) : '—'}</td>
      <td class="num" style="color:${r.reportedCogs < 0 ? '#da4a4a' : ''}">${fmt(r.reportedCogs, 2)}</td>
      <td class="num" style="color:#4ada8e;font-weight:600">${fmt(r.correctedCogs, 2)}</td>
    </tr>`;
  }).join('');
}

async function exportCPExcel() {
  if (!_cpData || !_cpData.invoices.length) { alert('لا توجد بيانات للتصدير — شغّل التقرير أولاً'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }

  const CLR = {
    navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8', bluePale:'FFF4F7FB',
    white:'FFFFFFFF', textDark:'FF111111', textLight:'FF6A8AAA',
    greenText:'FF1A6A2A', redText:'FF8A2A00', amberBg:'FFFFF8E8', amberText:'FF8A5A00',
  };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{argb:a} });
  const thin  = a => ({ style:'thin', color:{argb:a} });
  const numFmt = '#,##0.00;[Red](#,##0.00)';
  const genDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const company = State.get('companyName') || _cpData.db;

  function styleTitleRow(ws, rowNum, text, size, bg, fg, span) {
    const row = ws.getRow(rowNum);
    ws.mergeCells(rowNum, 1, rowNum, span);
    row.getCell(1).value = text;
    row.getCell(1).font = { size, bold:true, color:{argb:fg} };
    row.getCell(1).alignment = { horizontal:'center', vertical:'middle' };
    for (let c=1;c<=span;c++) row.getCell(c).fill = solid(bg);
    row.height = size + 14;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  const wsS = wb.addWorksheet('ملخص تنفيذي', { views:[{ rightToLeft:true, showGridLines:false }] });
  wsS.columns = [{width:4},{width:46},{width:22}];
  styleTitleRow(wsS, 1, 'خطة تصحيح — عيب تكلفة المخزون السالب', 15, CLR.navyDark, CLR.white, 3);
  styleTitleRow(wsS, 2, company, 11, CLR.navy, CLR.white, 3);
  styleTitleRow(wsS, 3, `الفترة: ${_cpData.from} — ${_cpData.to}  |  ${genDate}  —  سري للاستخدام الداخلي`, 9, CLR.bluePale, CLR.textLight, 3);
  wsS.addRow([]);
  const introRow = wsS.addRow(['','عند بيع صنف ورصيده المخزني سالب لحظة البيع، محرك حساب التكلفة المرجّحة في MekSoft ينتج تكلفة بضاعة مباعة مشوَّهة. هذه الخطة تجمّع الفواتير المتأثرة (بعد استبعاد ما اتصحح فعلياً بمردود، وفواتير نقل العهدة البينية) حسب الصنف الأكثر مسؤولية عن التشويه، مع تكلفة مرجعية نظيفة من تاريخ الشراء الفعلي. الأرقام تقديرية للمراجعة — الترحيل النهائي من داخل MekSoft.','']);
  wsS.mergeCells(introRow.number, 2, introRow.number, 3);
  introRow.getCell(2).alignment = { wrapText:true, horizontal:'right', vertical:'top' };
  introRow.getCell(2).font = { size:9.5, color:{argb:CLR.textDark} };
  wsS.getRow(introRow.number).height = 70;
  wsS.addRow([]);

  const t = _cpData.totals;
  const kpiRows = [
    ['عدد الفواتير المتأثرة', t.invoiceCount],
    ['عدد الأصناف المسؤولة', _cpData.itemSummary.length],
    ['إجمالي حجم التشويه', fmt2(t.absDistortion)],
    ['فواتير اتصححت بمردود (مُستبعدة)', t.resolvedByReturnCount],
    ['فواتير نقل عهدة بينية (مُستبعدة)', t.resolvedByCustodyTransferCount],
  ];
  const kh = wsS.addRow(['','البند','القيمة']);
  kh.eachCell(c => { c.font={bold:true,color:{argb:CLR.white}}; c.fill=solid(CLR.navy); c.alignment={horizontal:'center'}; });
  kpiRows.forEach((r,i) => {
    const row = wsS.addRow(['', r[0], r[1]]);
    row.getCell(3).alignment = { horizontal:'center' };
    row.getCell(3).font = { bold:true, color:{argb:CLR.navy} };
    if (i % 2 === 0) { row.getCell(2).fill = row.getCell(3).fill = solid(CLR.bluePale); }
  });
  wsS.addRow([]);

  const wsI = wb.addWorksheet('أولوية حسب الصنف', { views:[{ rightToLeft:true, showGridLines:false }] });
  wsI.columns = [{width:38},{width:16},{width:20},{width:20}];
  styleTitleRow(wsI, 1, 'أولوية التصحيح — مُجمَّعة حسب الصنف', 13, CLR.navyDark, CLR.white, 4);
  wsI.addRow([]);
  const ih = wsI.addRow(['الصنف', 'عدد الفواتير', 'التكلفة المرجعية للوحدة', 'إجمالي حجم التشويه']);
  ih.eachCell(c => { c.font={bold:true,color:{argb:CLR.white},size:9.5}; c.fill=solid(CLR.navy); c.alignment={horizontal:'center',wrapText:true}; });
  _cpData.itemSummary.forEach((g, idx) => {
    const row = wsI.addRow([g.item, g.invoiceCount, g.refCostPerUnit, g.totalAbsDistortion]);
    row.getCell(3).numFmt = numFmt; row.getCell(4).numFmt = numFmt;
    row.getCell(2).alignment = row.getCell(3).alignment = row.getCell(4).alignment = { horizontal:'center' };
    row.getCell(4).font = { bold:true, color:{argb:CLR.redText} };
    if (idx % 2 === 0) row.eachCell(c => c.fill = solid(CLR.bluePale));
  });

  const wsD = wb.addWorksheet('تفاصيل كل الفواتير', { views:[{ rightToLeft:true, showGridLines:false }] });
  wsD.columns = [{width:12},{width:9},{width:12},{width:36},{width:20},{width:30},{width:9},{width:16},{width:16}];
  styleTitleRow(wsD, 1, 'تفاصيل الفواتير المتأثرة كاملةً', 13, CLR.navyDark, CLR.white, 9);
  wsD.addRow([]);
  const dh = wsD.addRow(['التاريخ','فاتورة','JV','العميل','المندوب','الصنف المسبب','الكمية','التكلفة المسجَّلة','التكلفة المصحَّحة المقترحة']);
  dh.eachCell(c => { c.font={bold:true,color:{argb:CLR.white},size:9}; c.fill=solid(CLR.navy); c.alignment={horizontal:'center',wrapText:true}; });
  const sorted = [..._cpData.invoices].sort((a,b) => (a.dominantItem||'').localeCompare(b.dominantItem||'') || a.date.localeCompare(b.date));
  sorted.forEach((r, idx) => {
    const isWissam = r.customer.includes('وسام');
    const row = wsD.addRow([r.date, r.invId, r.jvId, r.customer, r.salesMan, r.dominantItem || '—', r.dominantItemQty, r.reportedCogs, r.correctedCogs]);
    row.getCell(7).numFmt = numFmt; row.getCell(8).numFmt = numFmt; row.getCell(9).numFmt = numFmt;
    row.eachCell(c => { c.font = { size:9 }; c.alignment = { horizontal:'right' }; c.border = { bottom:thin('FFDDE6F4') }; });
    row.getCell(1).alignment = row.getCell(2).alignment = row.getCell(3).alignment = { horizontal:'center' };
    row.getCell(8).font = { size:9, color:{argb: r.reportedCogs < 0 ? CLR.redText : CLR.textDark} };
    row.getCell(9).font = { size:9, bold:true, color:{argb:CLR.greenText} };
    if (isWissam) row.eachCell(c => c.fill = solid(CLR.blueLight));
    else if (idx % 2 === 0) row.eachCell(c => c.fill = solid(CLR.bluePale));
  });
  wsD.pageSetup.orientation = 'landscape';
  wsD.pageSetup.fitToPage = true; wsD.pageSetup.fitToWidth = 1; wsD.pageSetup.fitToHeight = 0;
  wsD.headerFooter.oddFooter = `&L&8 ${genDate}&C&8 خطة تصحيح — سري للاستخدام الداخلي&R&8 صفحة &P من &N`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `خطة_تصحيح_عيب_المخزون_${_cpData.db}_${_cpData.from}_${_cpData.to}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmt2(n) { return (+n || 0).toFixed(2); }
