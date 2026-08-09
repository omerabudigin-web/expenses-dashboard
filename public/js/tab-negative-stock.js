'use strict';

// ── NEGATIVE-STOCK COSTING AUDIT TAB ──────────────────────────────────────────
// Reports the ERP's negative-inventory weighted-average-cost defect: when an
// item's running stock goes negative at the moment of a sale, the system's
// costing engine produces a corrupted COGS figure (wildly inflated or negative)
// instead of the item's true purchase cost. This tab lists every affected
// invoice and compares reported vs. corrected monthly profit.

let _nsaData   = null;
let _nsaInited = false;
let _nsaChart  = null;

function _nsaMount() {
  const el = document.getElementById('tab-negstock');
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = '1';
  el.innerHTML = `
    <div class="filters">
      <label>من:</label><input type="date" id="nsa-from">
      <label>إلى:</label><input type="date" id="nsa-to">
      <button id="nsa-run" class="verify-btn">🔍 تشغيل التدقيق</button>
      <button id="nsa-export-excel" class="verify-btn">📊 تصدير Excel</button>
      <span id="nsa-status" style="margin-right:auto;font-size:.82rem;color:#7a9ac0"></span>
    </div>

    <div id="nsa-note" style="background:#0f2035;border:1px solid #2a4a7a;border-radius:8px;
      padding:14px 18px;margin:12px 0;font-size:.85rem;line-height:1.9;color:#c8d8e8">
      <strong style="color:#f0a050">⚠ عيب نظامي مؤكَّد:</strong> عند بيع صنف ورصيده المخزني سالب لحظة البيع،
      محرك حساب التكلفة المرجّحة في النظام ينتج تكلفة بضاعة مباعة (COGS) مشوَّهة — إما رقم ضخم غير منطقي
      أو رقم سالب — بدل التكلفة الفعلية. <strong>تأكَّد هذا بفحص كل فاتورة متأثرة: كان رصيد الصنف سالباً
      وقت البيع في 100% من الحالات.</strong> منهجية التصحيح: استبدال تكلفة كل فاتورة متأثرة بمتوسط تكلفة
      الشراء الفعلي للصنف (من فواتير الشراء) — تقدير مبني على بيانات شراء حقيقية، وليس محاكاة كاملة لمحرك
      التكلفة في النظام. <strong style="color:#4ada8e">الفواتير اللي اتصححت بالفعل عن طريق مردود مبيعات
      فعلي (العميل رجّع البضاعة) مُستبعدة تلقائياً من كل الحسابات أدناه</strong> — تحديدها عن طريق الربط
      الرسمي <code>SalesReturnHeader.SalesInvoiceId</code>، مش تخمين بتطابق المبلغ (لأن فاتورتين مختلفتين
      ممكن يتصادف تطابق نفس مبلغ التشويه بالصدفة مع مردود لواحدة منهم بس). <strong style="color:#6ab0f0">
      وكمان الفواتير البينية اللي هي فعلياً نقل عهدة بين أبعاد ووسام (نفس البضاعة، نفس السعر، بيع مقابل
      شراء بنفس القيمة) مُستبعدة كمان</strong> — دي مش صفقة ربح/خسارة حقيقية، مؤكَّد من صاحب الشركتين.
    </div>

    <div id="nsa-resolved-wrap" style="display:none;background:#0a2818;border:1px solid #1e5a3a;border-radius:8px;
      padding:14px 18px;margin:12px 0;font-size:.82rem;color:#a0d8b8">
      <div id="nsa-resolved-summary" style="font-weight:600;margin-bottom:8px"></div>
      <div style="overflow-x:auto">
        <table class="tb-tbl" id="nsa-resolved-table">
          <thead><tr>
            <th>تاريخ الفاتورة</th><th>رقم الفاتورة</th><th>JV</th>
            <th class="num">الإيراد</th><th class="num">التكلفة المسجَّلة وقتها</th>
            <th>تاريخ المردود</th><th>رقم المردود</th>
          </tr></thead>
          <tbody id="nsa-resolved-tbody"></tbody>
        </table>
      </div>
    </div>

    <div id="nsa-custody-wrap" style="display:none;background:#0a1e30;border:1px solid #1e4a7a;border-radius:8px;
      padding:14px 18px;margin:12px 0;font-size:.82rem;color:#a0c8e8">
      <div id="nsa-custody-summary" style="font-weight:600;margin-bottom:8px"></div>
      <div style="overflow-x:auto">
        <table class="tb-tbl" id="nsa-custody-table">
          <thead><tr>
            <th>تاريخ الفاتورة</th><th>رقم الفاتورة</th><th>JV</th>
            <th class="num">الإيراد</th><th class="num">التكلفة المسجَّلة وقتها</th>
            <th>تاريخ فاتورة الشراء المقابلة</th><th>رقم فاتورة الشراء</th><th class="num">قيمتها</th>
          </tr></thead>
          <tbody id="nsa-custody-tbody"></tbody>
        </table>
      </div>
    </div>

    <div id="nsa-kpis" class="kpis"></div>

    <div id="nsa-chart-wrap" style="background:#0f2035;border:1px solid #1e3a5f;border-radius:8px;
      padding:16px;margin:16px 0;height:320px">
      <canvas id="chart-nsa"></canvas>
    </div>

    <div class="sec-title">المقارنة الشهرية — كما هو مُعلن مقابل بعد تصحيح عيب المخزون السالب</div>
    <div style="overflow-x:auto">
      <table class="tb-tbl" id="nsa-monthly-table">
        <thead><tr>
          <th>الشهر</th><th class="num">الإيراد</th>
          <th class="num">التكلفة المُعلنة</th><th class="num">الربح المُعلن</th><th class="num">الهامش المُعلن</th>
          <th class="num">التكلفة المصحَّحة</th><th class="num">الربح المصحَّح</th><th class="num">الهامش المصحَّح</th>
          <th class="num">فرق الربح</th><th class="num">فواتير متأثرة</th>
        </tr></thead>
        <tbody id="nsa-monthly-tbody"></tbody>
        <tfoot id="nsa-monthly-tfoot"></tfoot>
      </table>
    </div>

    <div class="sec-title" style="margin-top:22px">🔄 ملخص خاص — وسام الفولاذ مقصوص (طرف ذو علاقة)</div>
    <div id="nsa-wissam-wrap" style="background:#0f2035;border:1px solid #3a5a8a;border-radius:8px;padding:16px 18px;margin:10px 0 22px">
      <div id="nsa-wissam-kpis" class="kpis"></div>
      <div style="overflow-x:auto;margin-top:14px">
        <table class="tb-tbl" id="nsa-wissam-table">
          <thead><tr>
            <th>التاريخ</th><th>رقم الفاتورة</th><th>JV</th><th>المندوب</th>
            <th class="num">الإيراد</th><th class="num">التكلفة المُعلنة</th>
            <th class="num">التكلفة المصحَّحة</th><th class="num">التشويه</th>
          </tr></thead>
          <tbody id="nsa-wissam-tbody"></tbody>
        </table>
      </div>
      <button id="nsa-wissam-export" class="verify-btn" style="margin-top:12px">📊 تصدير Excel — وسام فقط</button>
    </div>

    <div class="sec-title" style="margin-top:22px">قائمة الفواتير المتأثرة بالكامل</div>
    <input type="text" id="nsa-search" placeholder="🔍 بحث بالعميل أو المندوب..."
      style="margin:8px 0;padding:7px 12px;background:#0f2035;border:1px solid #1e3a5f;
      border-radius:6px;color:#c8d8e8;width:280px">
    <div style="overflow-x:auto">
      <table class="tb-tbl" id="nsa-inv-table">
        <thead><tr>
          <th>التاريخ</th><th>رقم الفاتورة</th><th>JV</th><th>العميل</th><th>المندوب</th>
          <th class="num">الإيراد</th><th class="num">التكلفة المُعلنة</th>
          <th class="num">التكلفة المصحَّحة</th><th class="num">التشويه</th><th>ملاحظة</th>
        </tr></thead>
        <tbody id="nsa-inv-tbody"></tbody>
      </table>
    </div>
  `;
}

function initNegativeStockAudit() {
  if (_nsaInited) return;
  _nsaInited = true;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('nsa-from').value = '2025-10-01';
  document.getElementById('nsa-to').value   = today;

  document.getElementById('nsa-run').addEventListener('click', fetchNegativeStockAudit);
  document.getElementById('nsa-export-excel').addEventListener('click', () => {
    const btn = document.getElementById('nsa-export-excel');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportNSAExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 تصدير Excel'; });
  });
  document.getElementById('nsa-search').addEventListener('input', _renderNSAInvoiceTable);
  document.getElementById('nsa-wissam-export').addEventListener('click', () => {
    const btn = document.getElementById('nsa-wissam-export');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportNSAWissamExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 تصدير Excel — وسام فقط'; });
  });
}

function _nsaWissamInvoices() {
  return (_nsaData?.invoices || []).filter(r => r.customer.includes('وسام'));
}

async function fetchNegativeStockAudit() {
  const db     = State.get('activeDb') || 'MekSoftDb1';
  const from   = document.getElementById('nsa-from').value;
  const to     = document.getElementById('nsa-to').value;
  const status = document.getElementById('nsa-status');
  if (!from || !to) { alert('الرجاء اختيار الفترة الزمنية'); return; }

  status.textContent = 'جارٍ التحميل…';
  try {
    const params = new URLSearchParams({ db, from, to });
    const res = await fetch(`/api/negative-stock-audit?${params}`);
    if (!res.ok) throw new Error((await res.json()).error || 'فشل التحميل');
    _nsaData = await res.json();
    _renderNSA();
    status.textContent = `✅ ${_nsaData.invoices.length} فاتورة متأثرة | ${new Date().toLocaleTimeString('ar-SA')}`;
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
}

function renderNegativeStockAudit() {
  _nsaMount();
  initNegativeStockAudit();
  const activeDb = State.get('activeDb');
  if (_nsaData && _nsaData.db === activeDb) _renderNSA(); else fetchNegativeStockAudit();
}

function _renderNSA() {
  if (!_nsaData) return;
  _renderNSAKPIs();
  _renderNSAChart();
  _renderNSAMonthlyTable();
  _renderNSAResolved();
  _renderNSACustody();
  _renderNSAWissam();
  _renderNSAInvoiceTable();
}

function _renderNSAResolved() {
  const wrap = document.getElementById('nsa-resolved-wrap');
  const rows = _nsaData.resolvedByReturn || [];
  if (!wrap) return;
  if (!rows.length) { wrap.style.display = 'none'; return; }

  wrap.style.display = 'block';
  const revSum = rows.reduce((s, r) => s + r.revenue, 0);
  document.getElementById('nsa-resolved-summary').textContent =
    `✅ ${rows.length} فاتورة كانت مؤهلة للتنبيه لكن اتصححت بالفعل عبر مردود مبيعات فعلي — مُستبعدة من كل الأرقام أعلاه (إجمالي إيرادها ${fmt(revSum, 2)} ر.س)`;

  document.getElementById('nsa-resolved-tbody').innerHTML = rows.map(r => `
    <tr class="tb-row">
      <td style="white-space:nowrap">${esc(r.date)}</td>
      <td>${r.invId}</td>
      <td>${r.jvId}</td>
      <td class="num">${fmt(r.revenue, 2)}</td>
      <td class="num">${fmt(r.reportedCogs, 2)}</td>
      <td style="white-space:nowrap">${esc(r.returnDate)}</td>
      <td>${r.returnId}</td>
    </tr>`).join('');
}

function _renderNSACustody() {
  const wrap = document.getElementById('nsa-custody-wrap');
  const rows = _nsaData.resolvedByCustodyTransfer || [];
  if (!wrap) return;
  if (!rows.length) { wrap.style.display = 'none'; return; }

  wrap.style.display = 'block';
  const revSum = rows.reduce((s, r) => s + r.revenue, 0);
  document.getElementById('nsa-custody-summary').textContent =
    `🔄 ${rows.length} فاتورة كانت مؤهلة للتنبيه لكن هي فعلياً نقل عهدة بيني (بيع مقابل شراء بنفس القيمة) — لا ربح ولا خسارة حقيقية، مُستبعدة من كل الأرقام أعلاه (إجمالي إيرادها ${fmt(revSum, 2)} ر.س)`;

  document.getElementById('nsa-custody-tbody').innerHTML = rows.map(r => `
    <tr class="tb-row">
      <td style="white-space:nowrap">${esc(r.date)}</td>
      <td>${r.invId}</td>
      <td>${r.jvId}</td>
      <td class="num">${fmt(r.revenue, 2)}</td>
      <td class="num">${fmt(r.reportedCogs, 2)}</td>
      <td style="white-space:nowrap">${esc(r.purDate)}</td>
      <td>${r.purId}</td>
      <td class="num">${fmt(r.purNet, 2)}</td>
    </tr>`).join('');
}

function _renderNSAWissam() {
  const wrap = document.getElementById('nsa-wissam-wrap');
  const rows = _nsaWissamInvoices();
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:20px;color:#3a5a7a">لا توجد فواتير متأثرة لوسام في هذه الفترة</div>`;
    return;
  }

  const revenue      = rows.reduce((s, r) => s + r.revenue, 0);
  const reportedCogs = rows.reduce((s, r) => s + r.reportedCogs, 0);
  const correctedCogs = rows.reduce((s, r) => s + r.correctedCogs, 0);
  const reportedProfit  = revenue - reportedCogs;
  const correctedProfit = revenue - correctedCogs;
  const distortion       = reportedProfit - correctedProfit;

  const items = [
    { lbl: 'عدد الفواتير المتأثرة لوسام', val: fmt(rows.length, 0), sub: `من ${rows.length ? rows[0].date : ''} إلى ${rows.length ? rows[rows.length-1].date : ''}`, accent: '#5baef0' },
    { lbl: 'الربح كما هو مُعلن', val: fmt(reportedProfit, 2) + ' ر.س', sub: reportedProfit >= 0 ? 'يبدو رابحاً' : 'يبدو خاسراً', accent: '#5baef0' },
    { lbl: 'الربح بعد التصحيح', val: fmt(correctedProfit, 2) + ' ر.س', sub: correctedProfit >= 0 ? 'رابح فعلياً' : 'خاسر فعلياً', accent: correctedProfit >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'مقدار المبالغة الوهمية في الربح', val: fmt(distortion, 2) + ' ر.س', sub: 'الفرق بين المُعلن والمصحَّح', accent: '#f0a050' },
  ];
  document.getElementById('nsa-wissam-kpis').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  document.getElementById('nsa-wissam-tbody').innerHTML = rows.map(r => {
    const distColor = r.distortion >= 0 ? '#da4a4a' : '#4ada8e';
    return `<tr class="tb-row">
      <td style="white-space:nowrap">${esc(r.date)}</td>
      <td>${r.invId}</td>
      <td>${r.jvId}</td>
      <td>${esc(r.salesMan)}</td>
      <td class="num">${fmt(r.revenue, 2)}</td>
      <td class="num" style="color:${r.reportedCogs < 0 ? '#da4a4a' : ''}">${fmt(r.reportedCogs, 2)}</td>
      <td class="num">${fmt(r.correctedCogs, 2)}</td>
      <td class="num" style="color:${distColor};font-weight:600">${r.distortion >= 0 ? '+' : ''}${fmt(r.distortion, 2)}</td>
    </tr>`;
  }).join('');
}

function _renderNSAKPIs() {
  const t = _nsaData.totals;
  const sign = t.netDistortion >= 0 ? '+' : '';
  const items = [
    { lbl: 'عدد الفواتير المتأثرة', val: fmt(t.invoiceCount, 0), sub: `من ${_nsaData.from} إلى ${_nsaData.to}`, accent: '#da4a4a' },
    { lbl: 'إجمالي حجم التشويه (مطلق)', val: fmt(t.absDistortion, 2) + ' ر.س', sub: 'مجموع |التشويه| لكل فاتورة على حدة', accent: '#e0906a' },
    { lbl: 'صافي التشويه على الربح', val: sign + fmt(t.netDistortion, 2) + ' ر.س', sub: t.netDistortion >= 0 ? 'الربح المُعلن مبالغ فيه بهذا القدر' : 'الربح المُعلن مبخوس بهذا القدر', accent: '#f0a050' },
    { lbl: 'الهامش المُعلن', val: fmt(t.asReportedMargin, 2) + '%', sub: fmt(t.asReportedProfit, 2) + ' ر.س ربح', accent: '#5baef0' },
    { lbl: 'الهامش المصحَّح', val: fmt(t.correctedMargin, 2) + '%', sub: fmt(t.correctedProfit, 2) + ' ر.س ربح', accent: '#4ada8e' },
  ];
  document.getElementById('nsa-kpis').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

function _renderNSAChart() {
  const canvas = document.getElementById('chart-nsa');
  if (!canvas || typeof Chart === 'undefined') return;
  const m = _nsaData.monthly;
  if (_nsaChart) { _nsaChart.destroy(); _nsaChart = null; }
  _nsaChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: m.map(x => x.label),
      datasets: [
        { label: 'الربح كما هو مُعلن', data: m.map(x => x.asReportedProfit), backgroundColor: '#5baef099', borderRadius: 4 },
        { label: 'الربح بعد التصحيح',  data: m.map(x => x.correctedProfit),  backgroundColor: '#4ada8e99', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#8ba0b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw, 0)} ر.س` } },
      },
      scales: {
        x: { ticks: { color: '#8ba0b8', font: { size: 10 } }, grid: { color: '#1a2a3a22' } },
        y: { ticks: { color: '#5a7a9a', font: { size: 9 }, callback: v => fmt(v, 0) }, grid: { color: '#1a2a3a' } },
      },
    },
  });
}

function _renderNSAMonthlyTable() {
  const tbody = document.getElementById('nsa-monthly-tbody');
  const tfoot = document.getElementById('nsa-monthly-tfoot');
  const rows  = _nsaData.monthly;

  tbody.innerHTML = rows.map(m => {
    const distColor = m.distortion >= 0 ? '#da4a4a' : '#4ada8e';
    return `<tr class="tb-row">
      <td>${esc(m.label)}</td>
      <td class="num">${fmt(m.revenue, 2)}</td>
      <td class="num">${fmt(m.asReportedCogs, 2)}</td>
      <td class="num">${fmt(m.asReportedProfit, 2)}</td>
      <td class="num">${fmt(m.asReportedMargin, 2)}%</td>
      <td class="num">${fmt(m.correctedCogs, 2)}</td>
      <td class="num" style="font-weight:700;color:#4ada8e">${fmt(m.correctedProfit, 2)}</td>
      <td class="num">${fmt(m.correctedMargin, 2)}%</td>
      <td class="num" style="color:${distColor};font-weight:600">${m.distortion >= 0 ? '+' : ''}${fmt(m.distortion, 2)}</td>
      <td class="num">${m.flaggedCount || '—'}</td>
    </tr>`;
  }).join('');

  const t = _nsaData.totals;
  tfoot.innerHTML = `<tr style="border-top:2px solid #2a4a7a;font-weight:800">
    <td>الإجمالي</td>
    <td class="num">${fmt(t.revenue, 2)}</td>
    <td class="num">${fmt(t.asReportedCogs, 2)}</td>
    <td class="num">${fmt(t.asReportedProfit, 2)}</td>
    <td class="num">${fmt(t.asReportedMargin, 2)}%</td>
    <td class="num">${fmt(t.correctedCogs, 2)}</td>
    <td class="num" style="color:#4ada8e">${fmt(t.correctedProfit, 2)}</td>
    <td class="num">${fmt(t.correctedMargin, 2)}%</td>
    <td class="num">${t.netDistortion >= 0 ? '+' : ''}${fmt(t.netDistortion, 2)}</td>
    <td class="num">${t.invoiceCount}</td>
  </tr>`;
}

function _renderNSAInvoiceTable() {
  const tbody  = document.getElementById('nsa-inv-tbody');
  const search = (document.getElementById('nsa-search')?.value || '').trim().toLowerCase();
  const rows   = _nsaData.invoices.filter(r =>
    !search || r.customer.toLowerCase().includes(search) || r.salesMan.toLowerCase().includes(search)
  );

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:#3a5a7a">لا توجد نتائج</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const distColor = r.distortion >= 0 ? '#da4a4a' : '#4ada8e';
    const note = r.unpriced ? '<span style="color:#f0a050">⚠ صنف بلا شراء مرجعي</span>' : '';
    return `<tr class="tb-row">
      <td style="white-space:nowrap">${esc(r.date)}</td>
      <td>${r.invId}</td>
      <td>${r.jvId}</td>
      <td>${esc(r.customer)}</td>
      <td>${esc(r.salesMan)}</td>
      <td class="num">${fmt(r.revenue, 2)}</td>
      <td class="num" style="color:${r.reportedCogs < 0 ? '#da4a4a' : ''}">${fmt(r.reportedCogs, 2)}</td>
      <td class="num">${fmt(r.correctedCogs, 2)}</td>
      <td class="num" style="color:${distColor};font-weight:600">${r.distortion >= 0 ? '+' : ''}${fmt(r.distortion, 2)}</td>
      <td>${note}</td>
    </tr>`;
  }).join('');
}

async function exportNSAExcel() {
  if (!_nsaData || !_nsaData.invoices.length) { alert('لا توجد بيانات للتصدير — شغّل التدقيق أولاً'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  const wsM = wb.addWorksheet('المقارنة الشهرية', { views: [{ rightToLeft: true }] });
  wsM.columns = [
    { header: 'الشهر', key: 'label', width: 14 },
    { header: 'الإيراد', key: 'revenue', width: 16 },
    { header: 'التكلفة المُعلنة', key: 'asReportedCogs', width: 16 },
    { header: 'الربح المُعلن', key: 'asReportedProfit', width: 16 },
    { header: 'الهامش المُعلن %', key: 'asReportedMargin', width: 14 },
    { header: 'التكلفة المصحَّحة', key: 'correctedCogs', width: 16 },
    { header: 'الربح المصحَّح', key: 'correctedProfit', width: 16 },
    { header: 'الهامش المصحَّح %', key: 'correctedMargin', width: 14 },
    { header: 'فرق الربح', key: 'distortion', width: 14 },
    { header: 'فواتير متأثرة', key: 'flaggedCount', width: 12 },
  ];
  wsM.getRow(1).font = { bold: true };
  _nsaData.monthly.forEach(m => wsM.addRow(m));

  const wsI = wb.addWorksheet('الفواتير المتأثرة', { views: [{ rightToLeft: true }] });
  wsI.columns = [
    { header: 'التاريخ', key: 'date', width: 12 },
    { header: 'رقم الفاتورة', key: 'invId', width: 12 },
    { header: 'JV Header', key: 'jvId', width: 12 },
    { header: 'العميل', key: 'customer', width: 34 },
    { header: 'المندوب', key: 'salesMan', width: 20 },
    { header: 'الإيراد', key: 'revenue', width: 14 },
    { header: 'التكلفة المُعلنة', key: 'reportedCogs', width: 16 },
    { header: 'التكلفة المصحَّحة', key: 'correctedCogs', width: 16 },
    { header: 'التشويه', key: 'distortion', width: 14 },
    { header: 'صنف بلا شراء مرجعي', key: 'unpriced', width: 16 },
  ];
  wsI.getRow(1).font = { bold: true };
  _nsaData.invoices.forEach(r => wsI.addRow({ ...r, unpriced: r.unpriced ? 'نعم' : '' }));

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `تدقيق_عيب_المخزون_السالب_${_nsaData.from}_${_nsaData.to}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportNSAWissamExcel() {
  const rows = _nsaWissamInvoices();
  if (!rows.length) { alert('لا توجد فواتير وسام متأثرة للتصدير'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }

  const revenue        = rows.reduce((s, r) => s + r.revenue, 0);
  const reportedCogs   = rows.reduce((s, r) => s + r.reportedCogs, 0);
  const correctedCogs  = rows.reduce((s, r) => s + r.correctedCogs, 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
  const ws = wb.addWorksheet('وسام — فواتير متأثرة', { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: 'التاريخ', key: 'date', width: 12 },
    { header: 'رقم الفاتورة', key: 'invId', width: 12 },
    { header: 'JV Header', key: 'jvId', width: 12 },
    { header: 'المندوب', key: 'salesMan', width: 20 },
    { header: 'الإيراد', key: 'revenue', width: 14 },
    { header: 'التكلفة المُعلنة', key: 'reportedCogs', width: 16 },
    { header: 'التكلفة المصحَّحة', key: 'correctedCogs', width: 16 },
    { header: 'التشويه', key: 'distortion', width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach(r => ws.addRow(r));
  ws.addRow({});
  const totRow = ws.addRow({
    date: 'الإجمالي', revenue, reportedCogs, correctedCogs,
    distortion: (revenue - reportedCogs) - (revenue - correctedCogs),
  });
  totRow.font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `تدقيق_وسام_عيب_المخزون_${_nsaData.from}_${_nsaData.to}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
