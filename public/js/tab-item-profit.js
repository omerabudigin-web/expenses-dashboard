'use strict';
/* ── تاب ربحية الصنف ───────────────────────────────────────────────────── */

let _ipDb   = null;
let _ipData = null;
let _ipFrom = null;
let _ipTo   = null;
let _ipSortCol = 'profit';
let _ipSortAsc = false;
let _ipRendered = false;
let _ipChart = null;

const IP_FIN_COST_PCT = 7; // % تكلفة التمويل السنوية

function _ipFmt(n, dec = 0) {
  if (n == null) return '—';
  return n.toLocaleString('ar-SA', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function _ipFmtPct(n) {
  if (n == null) return '—';
  const cls = n < 0 ? 'color:#e05a5a' : n < IP_FIN_COST_PCT ? 'color:#e08c5a' : 'color:#4ada8e';
  return `<span style="${cls}">${n.toFixed(1)}%</span>`;
}

// ── CSS ──────────────────────────────────────────────────────────────────────
function _ipInjectCSS() {
  if (document.getElementById('ip-style')) return;
  const s = document.createElement('style');
  s.id = 'ip-style';
  s.textContent = `
#tab-item-profit { padding: 16px; font-family: inherit; color: #e0e0e0; }
.ip-controls { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:16px; }
.ip-controls label { font-size:.8rem; color:#aaa; }
.ip-controls input[type=date], .ip-controls select {
  background:#1a2744; color:#e0e0e0; border:1px solid #2d4a8a;
  border-radius:6px; padding:5px 10px; font-size:.82rem; }
.ip-controls button {
  background:#C9A84C; color:#0d1b3e; border:none; border-radius:6px;
  padding:6px 16px; font-weight:700; cursor:pointer; font-size:.82rem; }
.ip-controls button:hover { background:#d9b85c; }
.ip-kpis { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
.ip-kpi { background:#1a2744; border:1px solid #2d4a8a; border-radius:10px;
  padding:14px 18px; min-width:160px; flex:1; }
.ip-kpi .kpi-label { font-size:.72rem; color:#8899bb; text-transform:uppercase; letter-spacing:.04em; }
.ip-kpi .kpi-val { font-size:1.5rem; font-weight:700; color:#C9A84C; margin-top:4px; line-height:1.1; }
.ip-kpi .kpi-sub { font-size:.72rem; color:#6677aa; margin-top:2px; }
.ip-kpi.loss .kpi-val { color:#e05a5a; }
.ip-kpi.warn .kpi-val { color:#e08c5a; }
.ip-kpi.good .kpi-val { color:#4ada8e; }
.ip-charts-row { display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
.ip-chart-wrap { background:#1a2744; border:1px solid #2d4a8a; border-radius:10px;
  padding:16px; flex:1; min-width:320px; }
.ip-chart-wrap h3 { font-size:.82rem; color:#8899bb; margin:0 0 10px; }
.ip-chart-wrap canvas { max-height:300px; }
.ip-table-wrap { background:#1a2744; border:1px solid #2d4a8a; border-radius:10px;
  padding:16px; margin-bottom:16px; overflow-x:auto; }
.ip-table-wrap h3 { font-size:.85rem; color:#8899bb; margin:0 0 10px; }
.ip-table { width:100%; border-collapse:collapse; font-size:.8rem; }
.ip-table th { background:#0d1b3e; color:#8899bb; padding:7px 10px;
  text-align:right; cursor:pointer; white-space:nowrap; user-select:none; border-bottom:1px solid #2d4a8a; }
.ip-table th:hover { color:#C9A84C; }
.ip-table td { padding:7px 10px; border-bottom:1px solid #162040; color:#ccd; white-space:nowrap; }
.ip-table tr.loss td { color:#e05a5a !important; }
.ip-table tr.loss-row td:first-child { border-right:3px solid #e05a5a; }
.ip-table tr.warn-row td:last-child { }
.ip-table tr:hover td { background:#1f3060; }
.ip-sort-asc::after  { content:' ▲'; font-size:.65rem; }
.ip-sort-desc::after { content:' ▼'; font-size:.65rem; }
.ip-insights { background:#1a2744; border:1px solid #2d4a8a; border-radius:10px;
  padding:16px; margin-bottom:16px; }
.ip-insights h3 { font-size:.85rem; color:#C9A84C; margin:0 0 10px; }
.ip-insights ul { margin:0; padding:0 20px; line-height:1.8; font-size:.82rem; color:#b0bcd0; }
.ip-reconcile { background:#0d1b2e; border:1px solid #2d4a8a; border-radius:8px;
  padding:12px 16px; margin-bottom:16px; font-size:.78rem; color:#7799bb; }
.ip-reconcile table { border-collapse:collapse; width:100%; }
.ip-reconcile td { padding:3px 8px; }
.ip-reconcile td:first-child { color:#8899bb; }
.ip-reconcile td:last-child { text-align:left; color:#b0c0d8; font-variant-numeric:tabular-nums; }
.ip-note { background:#162040; border:1px solid #263a6a; border-radius:8px;
  padding:14px 16px; font-size:.78rem; color:#8899bb; line-height:1.7; }
.ip-note summary { cursor:pointer; color:#C9A84C; font-size:.82rem; font-weight:600; margin-bottom:8px; list-style:none; }
.ip-note summary::before { content:'▶ '; font-size:.7rem; }
details[open] .ip-note summary::before { content:'▼ '; }
.ip-status { color:#8899bb; font-size:.8rem; margin-bottom:12px; }
  `;
  document.head.appendChild(s);
}

// ── Shell ────────────────────────────────────────────────────────────────────
function _ipBuildShell(wrap) {
  const today = new Date().toISOString().slice(0, 10);
  const from  = _ipFrom || '2025-10-01';
  const to    = _ipTo   || today;

  wrap.innerHTML = `
<div id="ip-inner">
  <div class="ip-controls">
    <label>من <input type="date" id="ip-from" value="${from}" max="${today}"></label>
    <label>إلى <input type="date" id="ip-to" value="${to}" max="${today}"></label>
    <button id="ip-load-btn">تحديث</button>
    <span id="ip-status" class="ip-status"></span>
  </div>

  <div class="ip-kpis" id="ip-kpis"></div>

  <div class="ip-charts-row">
    <div class="ip-chart-wrap" style="max-width:560px">
      <h3>أعلى 10 أصناف ربحاً + الأصناف الخاسرة</h3>
      <canvas id="ip-chart"></canvas>
    </div>
  </div>

  <div class="ip-table-wrap">
    <h3>تفصيل الأصناف</h3>
    <table class="ip-table" id="ip-table">
      <thead id="ip-thead"></thead>
      <tbody id="ip-tbody"></tbody>
    </table>
  </div>

  <div class="ip-insights" id="ip-insights"></div>

  <div class="ip-reconcile" id="ip-reconcile"></div>

  <details>
    <summary class="ip-note" style="display:block">
      <span style="color:#C9A84C;font-weight:600;font-size:.82rem;cursor:pointer">ℹ منهجية الحساب</span>
    </summary>
    <div class="ip-note" style="margin-top:6px">
      <strong>الإيراد</strong>: صافي المبيعات الفعلية من فواتير المبيعات (مطروحاً منه المردودات)، بدون ضريبة.<br>
      <strong>التكلفة</strong>: تكلفة البضاعة المباعة من قيود اليومية (ح.124) مقسَّمة على الأصناف بنسبة الإيراد
      داخل كل فاتورة — تطابق الرصيد الدفتري في GL ضمن ~2% (الفارق: تسويات غير مرتبطة بأصناف كالمخزون الإضافي/الناقص).<br>
      <strong>الهامش</strong>: إجمالي (قبل المصروفات التشغيلية والتمويل).<br>
      <strong>الخط الأحمر ≥ 7%</strong>: تكلفة تمويل المخزون المفترضة — أي صنف هامشه أدنى من هذا الخط يخسر
      بعد احتساب تكلفة رأس المال، حتى لو كان هامشه موجباً. يُحوَّل للتحقق مع تاب أعمار المخزون.
    </div>
  </details>

  <details style="margin-top:8px">
    <summary class="ip-note" style="display:block">
      <span style="color:#e08c5a;font-weight:600;font-size:.82rem;cursor:pointer">⚠️ لماذا تظهر بعض الأصناف خاسرة؟ (تشوّه التفاصيل لا الإجماليات)</span>
    </summary>
    <div class="ip-note" style="margin-top:6px;direction:rtl;line-height:1.8">
      ربحية الصنف المنفرد في هذا التاب دقيقة على المستوى الإجمالي، لكنها قد تكون مضلّلة لأصناف بعينها
      — خصوصاً ما يخضع للتحويل بالتصنيع (كمجموعة الراجحي). إليك السبب بوضوح:<br><br>
      <strong>ثلاثة أسباب لتشوّه تكلفة الصنف:</strong>
      <ul style="margin:6px 0 10px;padding-right:20px">
        <li><strong>البيع بالسالب:</strong> بيع برصيد سالب → النظام ينسب تكلفة شبه صفرية → ربح وهمي ثم تصحيح لاحق.</li>
        <li><strong>البيع قبل إدخال المشتريات:</strong> التكلفة الحقيقية تدخل متأخرة → تصحيح الربحية بأثر رجعي.</li>
        <li><strong>التحويل بالتصنيع بين الأصناف (الأهم):</strong> عند شحّ صنف، تُحوَّل كمية من صنف أرخص إليه عبر التصنيع
          حتى لا يصبح رصيده سالباً.</li>
      </ul>
      <strong>كيف يشوّه التحويل المتوسط المرجّح (WAC):</strong><br>
      المتوسط المرجّح يفترض أن كل وحدة من الصنف لها نفس التكلفة. لكن التحويل يُدخل وحداتٍ بتكلفة صنف آخر
      (الأرخص) إلى وعاء الصنف الأغلى — فينخفض متوسط تكلفته صناعياً، أو ينفجر شذوذاً إن كان رصيده سالباً
      لحظة التحويل (قسمة قيمة على كمية سالبة = متوسط شاذ). النتيجة: تكلفة لا تمثّل أيّ صنف حقيقةً،
      فيظهر هامش سالب أو نِسب صادمة (−٥١٪، −١٣١٪) ليست خسارة بيع فعلية.<br><br>
      <strong style="color:#C9A84C">القاعدة الذهبية: التفاصيل مشوّهة، والإجماليات صحيحة.</strong><br>
      التحويل يُعيد توزيع التكلفة بين الأصناف، لا يخلقها ولا يفنيها — فالمجموع محفوظ (قائمة الدخل صحيحة)،
      لكن نسبتها للصنف الواحد غير دقيقة (ربحية الصنف مضلّلة).<br><br>
      <strong>ماذا يعني هذا لقراراتك:</strong>
      <ul style="margin:6px 0 10px;padding-right:20px">
        <li>لا تتخذ قرار إيقاف بيع صنف بناءً على خسارته الدفترية هنا إن كان يخضع للتحويل (مجموعة الراجحي).</li>
        <li>للقرار السليم: عامِل الصنفين المترابطين بالتحويل كمجموعة واحدة — هامش المجموعة هو الصادق.</li>
        <li>ربحيتك الإجمالية الحقيقية سليمة؛ التشوّه في التوزيع بين الأصناف فقط.</li>
      </ul>
      <strong style="color:#8899bb">الإصلاح التشغيلي المستقبلي (يجعل التفاصيل موثوقة كالإجماليات):</strong>
      <ol style="margin:6px 0 0;padding-right:20px">
        <li>سجّل التحويل كأمر تصنيع صحيح يحمّل تكلفة المصدر + كلفة التحويل على الوجهة بوضوح.</li>
        <li>أدخل فاتورة الشراء قبل/فور البيع.</li>
        <li>امنع البيع بالسالب.</li>
      </ol>
    </div>
  </details>
</div>
  `;
}

function _ipWireControls() {
  const btn  = document.getElementById('ip-load-btn');
  if (btn) btn.addEventListener('click', () => {
    _ipFrom = document.getElementById('ip-from')?.value;
    _ipTo   = document.getElementById('ip-to')?.value;
    _ipLoad();
  });
}

// ── Load ─────────────────────────────────────────────────────────────────────
async function _ipLoad() {
  _ipStatus('جارٍ تحميل البيانات…');
  try {
    const from = document.getElementById('ip-from')?.value || '2025-10-01';
    const to   = document.getElementById('ip-to')?.value   || new Date().toISOString().slice(0, 10);
    _ipFrom = from; _ipTo = to;
    const db  = _ipDb || 'MekSoftDb1';
    const url = `/api/item-profitability?db=${encodeURIComponent(db)}&from=${from}&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    _ipData = await res.json();
    _ipRenderAll(_ipData);
    _ipStatus(`${_ipData.asOf} · ${_ipData.totals.itemCount} صنف`);
  } catch (e) {
    _ipStatus('خطأ: ' + e.message, true);
  }
}

function _ipStatus(msg, err = false) {
  const el = document.getElementById('ip-status');
  if (el) { el.textContent = msg; el.style.color = err ? '#e05a5a' : '#8899bb'; }
}

// ── Render ───────────────────────────────────────────────────────────────────
function _ipRenderAll(d) {
  _ipRenderKPIs(d);
  _ipRenderChart(d);
  _ipRenderTable(d.items);
  _ipRenderInsights(d);
  _ipRenderReconcile(d);
}

function _ipRenderKPIs(d) {
  const t = d.totals;
  const rc = d.reconciliation;
  const topItem  = d.items.length ? d.items[0] : null;
  const botItem  = [...d.items].sort((a, b) => a.margin - b.margin)[0];

  const cards = [
    { label:'الإيراد الإجمالي', val: _ipFmt(t.revenue), sub:'ر.س (صافي مردودات)', cls:'' },
    { label:'الربح الإجمالي',   val: _ipFmt(t.profit),  sub:`${t.margin.toFixed(1)}% هامش`, cls: t.margin >= 7 ? 'good' : t.margin >= 0 ? 'warn' : 'loss' },
    { label:'هامش GL الدفتري',  val: rc.glMargin + '%', sub:'من حسابات اليومية', cls: rc.glMargin >= 7 ? 'good' : 'warn' },
    { label:'أصناف خاسرة',      val: t.lossCount,        sub:`إيراد ${_ipFmt(t.lossRevenue)} ر.س`, cls: t.lossCount > 0 ? 'loss' : 'good' },
    { label:'أعلى صنف ربحاً',  val: topItem ? topItem.margin.toFixed(1) + '%' : '—', sub: topItem ? topItem.name.slice(0,22) : '', cls:'good' },
    { label:'دون عتبة التمويل', val: t.lowMarginCount,   sub:`هامش 0-${IP_FIN_COST_PCT}% — يخسر بعد الفائدة`, cls: t.lowMarginCount > 0 ? 'warn' : 'good' },
  ];

  const el = document.getElementById('ip-kpis');
  if (!el) return;
  el.innerHTML = cards.map(c => `
    <div class="ip-kpi ${c.cls}">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-val">${c.val}</div>
      <div class="kpi-sub">${c.sub}</div>
    </div>`).join('');
}

function _ipRenderChart(d) {
  const canvas = document.getElementById('ip-chart');
  if (!canvas) return;
  if (_ipChart) { _ipChart.destroy(); _ipChart = null; }
  if (typeof Chart === 'undefined') return;

  const profitable = d.items.filter(it => it.profit >= 0).slice(0, 10);
  const losers     = d.items.filter(it => it.profit < 0).sort((a, b) => a.profit - b.profit);
  const shown      = [...profitable, ...losers];

  const labels  = shown.map(it => it.name.length > 18 ? it.name.slice(0, 18) + '…' : it.name);
  const profits = shown.map(it => it.profit);
  const colors  = shown.map(it => it.profit < 0 ? '#e05a5a' : it.margin < IP_FIN_COST_PCT ? '#e08c5a' : '#4ada8e');

  _ipChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: profits, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ' ' + ctx.raw.toLocaleString('ar-SA', { maximumFractionDigits: 0 }) + ' ر.س' }
      }},
      scales: {
        x: { ticks: { color: '#6677aa', font: { size: 10 } }, grid: { color: '#1f3060' } },
        y: { ticks: { color: '#c0d0e8', font: { size: 10 } } },
      },
    },
  });
}

function _ipBuildTableHeader() {
  const cols = [
    { key:'code',     label:'الكود' },
    { key:'name',     label:'الصنف' },
    { key:'category', label:'الفئة' },
    { key:'qtySold',  label:'الكمية المباعة' },
    { key:'revenue',  label:'الإيراد ر.س' },
    { key:'cost',     label:'التكلفة ر.س' },
    { key:'profit',   label:'الربح ر.س' },
    { key:'margin',   label:'الهامش %' },
  ];
  const thead = document.getElementById('ip-thead');
  if (!thead) return;
  thead.innerHTML = `<tr>${cols.map(c => {
    let cls = '';
    if (c.key === _ipSortCol) cls = _ipSortAsc ? 'ip-sort-asc' : 'ip-sort-desc';
    return `<th class="${cls}" data-col="${c.key}">${c.label}</th>`;
  }).join('')}</tr>`;
  thead.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_ipSortCol === col) _ipSortAsc = !_ipSortAsc;
      else { _ipSortCol = col; _ipSortAsc = col === 'code' || col === 'name'; }
      if (_ipData) _ipRenderTable(_ipData.items);
    });
  });
}

function _ipRenderTable(items) {
  _ipBuildTableHeader();
  const sorted = [...items].sort((a, b) => {
    const va = a[_ipSortCol] ?? '', vb = b[_ipSortCol] ?? '';
    const cmp = typeof va === 'string' ? va.localeCompare(vb, 'ar') : va - vb;
    return _ipSortAsc ? cmp : -cmp;
  });
  const tbody = document.getElementById('ip-tbody');
  if (!tbody) return;
  tbody.innerHTML = sorted.map(it => {
    const cls  = it.margin < 0 ? 'loss' : it.margin < IP_FIN_COST_PCT ? 'warn-row' : '';
    return `<tr class="${cls}">
      <td>${it.code}</td>
      <td>${it.name}</td>
      <td>${it.category}</td>
      <td>${_ipFmt(it.qtySold, 2)}</td>
      <td>${_ipFmt(it.revenue)}</td>
      <td>${_ipFmt(it.cost)}</td>
      <td>${_ipFmt(it.profit)}</td>
      <td>${_ipFmtPct(it.margin)}</td>
    </tr>`;
  }).join('');
}

function _ipRenderInsights(d) {
  const t = d.totals;
  const items = d.items;
  const el = document.getElementById('ip-insights');
  if (!el) return;

  const losers   = items.filter(it => it.margin < 0);
  const lossRev  = losers.reduce((s, it) => s + it.revenue, 0);
  const lossPft  = losers.reduce((s, it) => s + it.profit, 0);

  const lowMrg   = items.filter(it => it.margin >= 0 && it.margin < IP_FIN_COST_PCT);
  const lowRev   = lowMrg.reduce((s, it) => s + it.revenue, 0);

  // financing cost per item: margin < 7% means margin < financing cost
  const finCostTotal = items.reduce((s, it) => {
    const finCost = it.revenue * IP_FIN_COST_PCT / 100;
    return s + Math.max(0, finCost - it.profit);
  }, 0);

  const topProfit = items[0];
  const topRev    = items.slice().sort((a, b) => b.revenue - a.revenue)[0];

  const points = [];

  if (losers.length > 0) {
    points.push(`<strong style="color:#e05a5a">${losers.length} أصناف تُباع بخسارة</strong>:
      إيرادها ${_ipFmt(lossRev)} ر.س وخسارتها ${_ipFmt(Math.abs(lossPft))} ر.س.
      أبرزها: ${losers.slice(0,3).map(it => `<em>${it.name.slice(0,18)}</em> (${it.margin.toFixed(1)}%)`).join('، ')}.`);
    points.push(`<span style="color:#e08c5a">⚠️ ملاحظة: جزء من هذه الأصناف (خصوصاً مجموعة الراجحي) يخضع للتحويل بالتصنيع، فخسارته دفترية لا فعلية
      — راجع بطاقة <em>(لماذا تظهر بعض الأصناف خاسرة؟)</em> قبل أي قرار تسعير أو إيقاف.</span>`);
  }

  if (lowMrg.length > 0) {
    points.push(`<strong style="color:#e08c5a">${lowMrg.length} أصناف هامشها بين 0-${IP_FIN_COST_PCT}%</strong>
      (إيراد ${_ipFmt(lowRev)} ر.س) — تُحقق ربحاً دفترياً لكنها أدنى من تكلفة التمويل الافتراضية (${IP_FIN_COST_PCT}%).
      يُنصح بمراجعة تكلفة تمويل مخزونها في تاب أعمار المخزون.`);
  }

  if (topProfit) {
    points.push(`أعلى صنف ربحاً: <em>${topProfit.name.slice(0,25)}</em> بهامش ${topProfit.margin.toFixed(1)}%
      وربح ${_ipFmt(topProfit.profit)} ر.س.`);
  }

  if (topRev && topRev.itemId !== topProfit?.itemId) {
    points.push(`أعلى صنف إيراداً: <em>${topRev.name.slice(0,25)}</em> — إيراد ${_ipFmt(topRev.revenue)} ر.س
      بهامش ${topRev.margin.toFixed(1)}%.`);
  }

  if (finCostTotal > 0) {
    points.push(`تكلفة التمويل الضائعة التقديرية على الأصناف منخفضة الهامش: ~${_ipFmt(finCostTotal)} ر.س
      (افتراض: تكلفة تمويل ${IP_FIN_COST_PCT}% سنوياً).`);
  }

  el.innerHTML = `<h3>🔎 قراءة تحليلية</h3><ul>${points.map(p => `<li>${p}</li>`).join('')}</ul>`;
}

function _ipRenderReconcile(d) {
  const rc = d.reconciliation;
  const el = document.getElementById('ip-reconcile');
  if (!el) return;
  el.innerHTML = `
    <strong style="color:#8899bb;font-size:.8rem">جدول التسوية: التاب ↔ الدفاتر (GL)</strong>
    <table style="margin-top:8px">
      <tr><td>الإيراد (التاب)</td><td>${_ipFmt(rc.tabRevenue)} ر.س</td></tr>
      <tr><td>الإيراد (GL ح.199+202−200−203)</td><td>${_ipFmt(rc.glRevenue)} ر.س</td></tr>
      <tr><td>فرق الإيراد</td><td>${_ipFmt(rc.tabRevenue - rc.glRevenue)} ر.س (خدمات وأصناف غير نوع 1)</td></tr>
      <tr><td style="padding-top:6px">التكلفة (التاب — JV مقسَّم)</td><td style="padding-top:6px">${_ipFmt(rc.tabCost)} ر.س</td></tr>
      <tr><td>التكلفة (GL ح.124 صافي)</td><td>${_ipFmt(rc.glCogs)} ر.س</td></tr>
      <tr><td>فرق التكلفة</td><td>${_ipFmt(rc.tabCost - rc.glCogs)} ر.س — ${rc.note}</td></tr>
    </table>
  `;
}

// ── Public entry ──────────────────────────────────────────────────────────────
function renderItemProfit() {
  const wrap = document.getElementById('tab-item-profit');
  if (!wrap) return;

  const dbEl = document.getElementById('db-select');
  const db   = dbEl?.value || 'MekSoftDb1';

  if (!_ipRendered) {
    _ipInjectCSS();
    _ipBuildShell(wrap);
    _ipWireControls();
    _ipRendered = true;
  }

  if (db !== _ipDb) {
    _ipDb = db;
    _ipData = null;
  }

  if (!_ipData) _ipLoad();
  else _ipRenderAll(_ipData);
}
