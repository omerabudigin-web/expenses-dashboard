'use strict';

/* ── state ───────────────────────────────────────────────────────────────── */
let _iaDb      = null;
let _iaData    = null;
let _iaSortCol = 'ageDays';
let _iaSortAsc = false;
let _iaBranch  = 'all';
let _iaRendered = false;
let _iaTimer   = null;
let _iaCountdown = 0;
const IA_REFRESH_SEC = 600;

const IA_BUCKETS = ['0-30', '31-90', '91-180', '181-365', '>365'];
const IA_BUCKET_LABELS = {
  '0-30':   'أقل من شهر',
  '31-90':  '١-٣ أشهر',
  '91-180': '٣-٦ أشهر',
  '181-365':'٦-١٢ شهر',
  '>365':   'أكثر من سنة',
};
const IA_BUCKET_COLORS = {
  '0-30':    '#4ada8e',
  '31-90':   '#C9A84C',
  '91-180':  '#e08c5a',
  '181-365': '#e05a5a',
  '>365':    '#a03030',
};

/* ── CSS ─────────────────────────────────────────────────────────────────── */
function _iaInjectCSS() {
  if (document.getElementById('ia-style')) return;
  const s = document.createElement('style');
  s.id = 'ia-style';
  s.textContent = `
#ia-wrap { direction:rtl; font-family:inherit; color:#d0d8e8; padding:0 4px 40px; }
#ia-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
.ia-status { font-size:.82em; color:#8a9bb8; margin-right:auto; }
.ia-btn { background:#1e2d45; border:1px solid #2a3f5f; color:#C9A84C;
  padding:5px 14px; border-radius:5px; cursor:pointer; font-size:.88em; }
.ia-btn:hover { background:#243554; }
#ia-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:18px; }
.ia-kpi { background:#111d2e; border:1px solid #1e3050; border-radius:8px; padding:12px 14px; text-align:center; }
.ia-kpi-val { font-size:1.35em; font-weight:700; color:#C9A84C; white-space:nowrap; }
.ia-kpi-lbl { font-size:.8em; color:#8a9bb8; margin-top:3px; }
.ia-section { background:#111d2e; border:1px solid #1e3050; border-radius:8px; padding:14px 16px; margin-bottom:14px; }
.ia-section-title { font-size:.92em; font-weight:600; color:#C9A84C; margin-bottom:10px; letter-spacing:.03em; }
.ia-bucket-row { display:flex; align-items:center; gap:10px; margin-bottom:7px; }
.ia-bucket-label { width:90px; font-size:.84em; color:#b0bcd0; text-align:right; flex-shrink:0; }
.ia-bar-wrap { flex:1; background:#0d1620; border-radius:3px; height:20px; position:relative; overflow:hidden; }
.ia-bar { height:100%; border-radius:3px; transition:width .3s; }
.ia-bucket-nums { width:160px; font-size:.82em; color:#8a9bb8; text-align:left; flex-shrink:0; white-space:nowrap; }
.ia-chart-wrap { height:220px; position:relative; margin-bottom:4px; }
#ia-table-wrap { overflow-x:auto; }
#ia-table { width:100%; border-collapse:collapse; font-size:.84em; }
#ia-table th { background:#0d1828; color:#C9A84C; padding:8px 6px; text-align:right;
  cursor:pointer; border-bottom:1px solid #1e3050; white-space:nowrap; user-select:none; }
#ia-table th:hover { background:#152035; }
#ia-table td { padding:7px 6px; border-bottom:1px solid #152030; color:#c8d4e0; vertical-align:middle; }
#ia-table tr:hover td { background:#131f30; }
.ia-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:.78em; font-weight:600; }
.ia-age-0   { color:#4ada8e; }
.ia-age-31  { color:#C9A84C; }
.ia-age-91  { color:#e08c5a; }
.ia-age-181 { color:#e05a5a; }
.ia-age-365 { color:#a03030; }
.ia-insight { background:#0d1620; border-right:3px solid #C9A84C; padding:10px 14px;
  border-radius:0 6px 6px 0; margin-bottom:8px; font-size:.86em; line-height:1.6; }
.ia-insight.ia-warn { border-color:#e05a5a; }
.ia-insight .ia-val { color:#C9A84C; font-weight:600; }
.ia-insight.ia-warn .ia-val { color:#e05a5a; }
.ia-explain { background:#0a1520; border:1px solid #1e3050; border-radius:8px; overflow:hidden; margin-top:8px; }
.ia-explain-hdr { display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px; cursor:pointer; font-size:.86em; color:#8a9bb8; }
.ia-explain-hdr:hover { background:#111d2e; }
.ia-explain-body { padding:12px 14px; font-size:.82em; color:#8a9bb8; line-height:1.7; display:none; }
.ia-explain-body.open { display:block; }
.ia-no-data { text-align:center; color:#8a9bb8; padding:40px 20px; font-size:.95em; }
select.ia-sel { background:#1a2840; border:1px solid #2a3f5f; color:#c8d4e0;
  padding:5px 10px; border-radius:5px; font-size:.88em; cursor:pointer; }
`;
  document.head.appendChild(s);
}

/* ── shell ───────────────────────────────────────────────────────────────── */
function _iaBuildShell(wrap) {
  wrap.innerHTML = `
<div id="ia-wrap">
  <div id="ia-toolbar">
    <span style="font-size:1.05em;font-weight:600;color:#C9A84C">أعمار المخزون 📦</span>
    <select class="ia-sel" id="ia-branch-sel">
      <option value="all">جميع الفروع</option>
      <option value="1">الفرع الرئيسي</option>
      <option value="2">مصنع حوراء</option>
    </select>
    <button class="ia-btn" id="ia-refresh-btn">↻ تحديث</button>
    <span class="ia-status" id="ia-status">جارٍ التحميل…</span>
  </div>
  <div id="ia-kpis"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px" id="ia-grid">
    <div class="ia-section">
      <div class="ia-section-title">توزيع الأعمار بالقيمة</div>
      <div id="ia-bucket-bars"></div>
    </div>
    <div class="ia-section">
      <div class="ia-section-title">تركيبة الأعمار (رسم بياني)</div>
      <div class="ia-chart-wrap"><canvas id="ia-chart"></canvas></div>
    </div>
  </div>
  <div class="ia-section" id="ia-insights-sec" style="margin-bottom:14px">
    <div class="ia-section-title">تنبيهات المخزون الراكد</div>
    <div id="ia-insights"></div>
  </div>
  <div class="ia-section">
    <div class="ia-section-title">
      تفاصيل الأصناف
      <span id="ia-count" style="font-size:.82em;color:#8a9bb8;margin-right:8px"></span>
    </div>
    <div id="ia-table-wrap">
      <table id="ia-table">
        <thead><tr id="ia-thead"></tr></thead>
        <tbody id="ia-tbody"><tr><td colspan="9" class="ia-no-data">جارٍ التحميل…</td></tr></tbody>
      </table>
    </div>
  </div>
  <div class="ia-explain" id="ia-explain">
    <div class="ia-explain-hdr" id="ia-explain-hdr">
      <span>📘 طريقة الحساب والمصطلحات</span>
      <span id="ia-explain-arrow">▼</span>
    </div>
    <div class="ia-explain-body" id="ia-explain-body">
      <b>التكلفة:</b> متوسط تكلفة مرجّح (WAC) — مجموع قيمة جميع حركات الوارد والصادر لكل صنف منذ الافتتاح.<br>
      <b>العمر:</b> عدد الأيام منذ آخر إصدار بضاعة (DeliverGoods). إذا لم يُبَع الصنف قط: الأيام منذ آخر وارد.<br>
      <b>الفئات:</b> <span style="color:#4ada8e">0-30 ✓</span> متحرك · <span style="color:#C9A84C">31-90 ⚠</span> متباطئ · <span style="color:#e08c5a">91-180 ⚡</span> راكد · <span style="color:#e05a5a">181-365 🔴</span> خطر · <span style="color:#a03030">&gt;365 ☠</span> ميت<br>
      <b>فلتر الفرع:</b> «الفرع الرئيسي» يعرض الأصناف التي فيها رصيد بالفرع الرئيسي، والقيمة هي القيمة الإجمالية للشركة (مطابق لتقرير I004). «مصنع حوراء» يعرض القيمة الفعلية للمصنع فقط.<br>
      <b>رأس المال المجمَّد:</b> قيمة المخزون &gt;90 يوم × تكلفة التمويل السنوية (7%) = خسارة ضمنية بسبب القروض بفائدة.<br>
      <b>الصلة بالـ CCC:</b> DIO في تاب دورة رأس المال يعكس متوسط أعمار المخزون — كلما ارتفع، زادت الحاجة للتمويل.
    </div>
  </div>
</div>`;
}

/* ── wiring ──────────────────────────────────────────────────────────────── */
function _iaWireControls() {
  document.getElementById('ia-refresh-btn').addEventListener('click', () => {
    _iaStopTimer();
    _iaData = null;
    _iaLoad();
  });
  document.getElementById('ia-branch-sel').addEventListener('change', e => {
    _iaBranch = e.target.value;
    _iaData = null;
    _iaLoad();
  });
  document.getElementById('ia-explain-hdr').addEventListener('click', () => {
    const body  = document.getElementById('ia-explain-body');
    const arrow = document.getElementById('ia-explain-arrow');
    const open  = body.classList.toggle('open');
    arrow.textContent = open ? '▲' : '▼';
  });
  _iaBuildTableHeader();
}

function _iaBuildTableHeader() {
  const cols = [
    { key:'code',         label:'الكود' },
    { key:'name',         label:'الصنف' },
    { key:'category',     label:'الفئة' },
    { key:'qty',          label:'الكمية (طن)' },
    { key:'mac',          label:'م.التكلفة (ر.س)' },
    { key:'value',        label:'القيمة (ر.س)' },
    { key:'lastSaleDate', label:'آخر بيع' },
    { key:'ageDays',      label:'العمر (يوم)' },
    { key:'bucket',       label:'الفئة العمرية' },
  ];
  const tr = document.getElementById('ia-thead');
  tr.innerHTML = cols.map(c => {
    const arrow = c.key === _iaSortCol ? (_iaSortAsc ? ' ▲' : ' ▼') : '';
    return `<th data-col="${c.key}">${c.label}${arrow}</th>`;
  }).join('');
  tr.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_iaSortCol === col) _iaSortAsc = !_iaSortAsc;
      else { _iaSortCol = col; _iaSortAsc = col === 'code' || col === 'name'; }
      _iaBuildTableHeader();
      if (_iaData) _iaRenderTable(_iaData.items);
    });
  });
}

/* ── timer ───────────────────────────────────────────────────────────────── */
function _iaStartTimer() {
  _iaStopTimer();
  _iaCountdown = IA_REFRESH_SEC;
  _iaTimer = setInterval(() => {
    _iaCountdown--;
    _iaUpdateStatus(`آخر تحديث ${new Date().toLocaleTimeString('ar-EG')} — تحديث تلقائي خلال ${_iaCountdown}s`);
    if (_iaCountdown <= 0) { _iaStopTimer(); _iaData = null; _iaLoad(); }
  }, 1000);
}
function _iaStopTimer() {
  if (_iaTimer) { clearInterval(_iaTimer); _iaTimer = null; }
}
function _iaUpdateStatus(msg) {
  const el = document.getElementById('ia-status');
  if (el) el.textContent = msg;
}

/* ── load ────────────────────────────────────────────────────────────────── */
async function _iaLoad() {
  _iaUpdateStatus('جارٍ التحميل…');
  const db     = _iaDb || (typeof State !== 'undefined' ? State.get('activeDb') : 'MekSoftDb1') || 'MekSoftDb1';
  const branch = _iaBranch;
  try {
    const r = await fetch(`/api/inv-aging?db=${encodeURIComponent(db)}&branch=${branch}`);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
    _iaData = await r.json();
    _iaRenderAll(_iaData);
    _iaUpdateStatus(`آخر تحديث ${new Date().toLocaleTimeString('ar-EG')} — تحديث تلقائي خلال ${IA_REFRESH_SEC}s`);
    _iaStartTimer();
  } catch (e) {
    _iaUpdateStatus('⚠ خطأ: ' + e.message);
    const tbody = document.getElementById('ia-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#e05a5a;padding:30px">⚠ فشل التحميل: ${e.message}</td></tr>`;
    const kpis = document.getElementById('ia-kpis');
    if (kpis) kpis.innerHTML = '';
  }
}

/* ── render all ──────────────────────────────────────────────────────────── */
function _iaRenderAll(data) {
  _iaRenderKPIs(data);
  _iaRenderBars(data);
  _iaRenderChart(data);
  _iaRenderInsights(data);
  _iaRenderTable(data.items);
  const cnt = document.getElementById('ia-count');
  if (cnt) cnt.textContent = `${data.totalItems} صنف`;
}

/* ── KPIs ────────────────────────────────────────────────────────────────── */
function _iaFmt(n) { return (n||0).toLocaleString('ar-EG', { maximumFractionDigits:0 }); }
function _iaFmt2(n) { return (n||0).toLocaleString('ar-EG', { maximumFractionDigits:2 }); }

function _iaRenderKPIs(data) {
  const el = document.getElementById('ia-kpis');
  if (!el) return;

  const slowVal = (data.byBucket['91-180']?.value||0) + (data.byBucket['181-365']?.value||0) + (data.byBucket['>365']?.value||0);
  const deadVal = data.byBucket['>365']?.value || 0;
  const slowPct = data.totalValue > 0 ? (slowVal / data.totalValue * 100) : 0;
  const financingCost = slowVal * 0.07;

  const items = [
    { val: _iaFmt(data.totalValue) + ' ر.س', lbl: 'إجمالي قيمة المخزون' },
    { val: data.totalItems.toString(), lbl: 'عدد الأصناف' },
    { val: _iaFmt(slowVal) + ' ر.س', lbl: 'مخزون راكد (>90 يوم)' },
    { val: slowPct.toFixed(1) + '%', lbl: 'نسبة الراكد من الإجمالي' },
    { val: _iaFmt(deadVal) + ' ر.س', lbl: 'مخزون ميت (>365 يوم)' },
    { val: _iaFmt(financingCost) + ' ر.س', lbl: 'تكلفة تمويل الراكد (7%/سنة)' },
  ];

  el.innerHTML = items.map(i =>
    `<div class="ia-kpi"><div class="ia-kpi-val">${i.val}</div><div class="ia-kpi-lbl">${i.lbl}</div></div>`
  ).join('');
}

/* ── bars ────────────────────────────────────────────────────────────────── */
function _iaRenderBars(data) {
  const el = document.getElementById('ia-bucket-bars');
  if (!el) return;
  const maxVal = Math.max(...IA_BUCKETS.map(b => data.byBucket[b]?.value || 0), 1);
  el.innerHTML = IA_BUCKETS.map(b => {
    const bData = data.byBucket[b] || { count: 0, value: 0 };
    const pct   = bData.value / maxVal * 100;
    const color = IA_BUCKET_COLORS[b];
    const pctOfTotal = data.totalValue > 0 ? (bData.value / data.totalValue * 100).toFixed(1) : '0.0';
    return `
      <div class="ia-bucket-row">
        <div class="ia-bucket-label">${IA_BUCKET_LABELS[b]}</div>
        <div class="ia-bar-wrap">
          <div class="ia-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="ia-bucket-nums">${_iaFmt(bData.value)} ر.س (${pctOfTotal}%・${bData.count} صنف)</div>
      </div>`;
  }).join('');
}

/* ── chart ───────────────────────────────────────────────────────────────── */
let _iaChart = null;
function _iaRenderChart(data) {
  const canvas = document.getElementById('ia-chart');
  if (!canvas) return;
  if (_iaChart) { _iaChart.destroy(); _iaChart = null; }
  if (typeof Chart === 'undefined') return;

  const labels = IA_BUCKETS.map(b => IA_BUCKET_LABELS[b]);
  const values = IA_BUCKETS.map(b => Math.round(data.byBucket[b]?.value || 0));
  const colors = IA_BUCKETS.map(b => IA_BUCKET_COLORS[b]);

  _iaChart = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#0d1620', borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#8a9bb8', font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw || 0;
              const pct = data.totalValue > 0 ? (v / data.totalValue * 100).toFixed(1) : '0';
              return ` ${v.toLocaleString('ar-EG')} ر.س (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/* ── insights ────────────────────────────────────────────────────────────── */
function _iaRenderInsights(data) {
  const el = document.getElementById('ia-insights');
  if (!el) return;
  const items = data.items || [];

  const slowItems = items.filter(i => i.ageDays > 90).sort((a,b) => b.value - a.value);
  const deadItems = items.filter(i => i.ageDays > 365);
  const neverSold = items.filter(i => !i.lastSaleDate);
  const slowVal   = slowItems.reduce((s, i) => s + i.value, 0);
  const financingCost = slowVal * 0.07;

  const insights = [];

  if (slowItems.length > 0) {
    const names = slowItems.slice(0,3).map(i => `${i.name} (${_iaFmt(i.value)} ر.س)`).join('، ');
    insights.push({ warn: true, text: `<b>${slowItems.length} صنف راكد (>90 يوم)</b> بقيمة <span class="ia-val">${_iaFmt(slowVal)} ر.س</span> — تكلفة تمويل ضمنية سنوية <span class="ia-val">${_iaFmt(financingCost)} ر.س</span> (بمعدل 7%). أبرزها: ${names}.` });
  }
  if (deadItems.length > 0) {
    const dVal = deadItems.reduce((s,i)=>s+i.value,0);
    const names = deadItems.slice(0,3).map(i => i.name).join('، ');
    insights.push({ warn: true, text: `<b>${deadItems.length} صنف ميت (>365 يوم)</b> بقيمة <span class="ia-val">${_iaFmt(dVal)} ر.س</span>. يُنصح بمراجعة التسعير أو تسييل هذه الكميات. أبرزها: ${names}.` });
  }
  if (neverSold.length > 0) {
    const nsVal = neverSold.reduce((s,i)=>s+i.value,0);
    insights.push({ warn: neverSold.length > 2, text: `<b>${neverSold.length} صنف لم يُبَع قط</b> منذ الافتتاح، بقيمة <span class="ia-val">${_iaFmt(nsVal)} ر.س</span>. يُحتسب العمر من تاريخ آخر وارد.` });
  }
  if (slowItems.length === 0 && deadItems.length === 0) {
    insights.push({ warn: false, text: 'المخزون يتحرك بصحة جيدة — لا أصناف راكدة تستوجب الاهتمام.' });
  }
  insights.push({ warn: false, text: `💡 ارتفاع المخزون الراكد يرفع مؤشر <b>DIO</b> في <a href="#" onclick="event.preventDefault();document.querySelector('.tab[data-tab=ccc]')?.click()" style="color:#C9A84C;text-decoration:underline">تاب دورة رأس المال (CCC)</a>، مما يعني حاجة أكبر للتمويل البنكي وتكاليف فائدة إضافية.` });

  el.innerHTML = insights.map(i =>
    `<div class="ia-insight${i.warn?' ia-warn':''}">${i.text}</div>`
  ).join('');
}

/* ── table ───────────────────────────────────────────────────────────────── */
function _iaAgeClass(ageDays) {
  if (ageDays === null || ageDays === undefined) return 'ia-age-365';
  if (ageDays <= 30)  return 'ia-age-0';
  if (ageDays <= 90)  return 'ia-age-31';
  if (ageDays <= 180) return 'ia-age-91';
  if (ageDays <= 365) return 'ia-age-181';
  return 'ia-age-365';
}

function _iaRenderTable(items) {
  const tbody = document.getElementById('ia-tbody');
  if (!tbody) return;

  const sorted = [...items].sort((a, b) => {
    let av = a[_iaSortCol], bv = b[_iaSortCol];
    if (av === null || av === undefined) av = _iaSortAsc ? Infinity : -Infinity;
    if (bv === null || bv === undefined) bv = _iaSortAsc ? Infinity : -Infinity;
    if (typeof av === 'string') return _iaSortAsc ? av.localeCompare(bv, 'ar') : bv.localeCompare(av, 'ar');
    return _iaSortAsc ? av - bv : bv - av;
  });

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="ia-no-data">لا توجد أصناف تطابق الفلتر المحدد</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(it => {
    const cls  = _iaAgeClass(it.ageDays);
    const age  = it.ageDays !== null ? it.ageDays.toLocaleString('ar-EG') : '—';
    const lbl  = IA_BUCKET_LABELS[it.bucket] || it.bucket;
    const bclr = IA_BUCKET_COLORS[it.bucket] || '#8a9bb8';
    const sold = it.lastSaleDate || '<span style="color:#e05a5a">لم يُبَع</span>';
    return `<tr>
      <td style="color:#8a9bb8;font-size:.8em">${it.code}</td>
      <td style="font-weight:500">${it.name}</td>
      <td style="font-size:.82em;color:#8a9bb8">${it.category}</td>
      <td style="text-align:left">${_iaFmt2(it.qty)}</td>
      <td style="text-align:left">${_iaFmt2(it.mac)}</td>
      <td style="text-align:left;font-weight:600;color:#C9A84C">${_iaFmt(it.value)}</td>
      <td style="text-align:center;font-size:.82em">${sold}</td>
      <td style="text-align:center" class="${cls}"><b>${age}</b></td>
      <td style="text-align:center">
        <span class="ia-badge" style="background:${bclr}22;color:${bclr};border:1px solid ${bclr}44">${lbl}</span>
      </td>
    </tr>`;
  }).join('');
}

/* ── public entry point ─────────────────────────────────────────────────── */
function renderInventoryAging() {
  const wrap = document.getElementById('tab-inv-aging');
  if (!wrap) return;

  const currentDb = typeof State !== 'undefined' ? State.get('activeDb') : 'MekSoftDb1';
  const dbChanged  = currentDb && currentDb !== _iaDb;

  if (!_iaRendered) {
    _iaInjectCSS();
    _iaBuildShell(wrap);
    _iaWireControls();
    _iaRendered = true;
  }

  if (dbChanged) {
    _iaDb   = currentDb;
    _iaData = null;
    _iaStopTimer();
  }

  if (!_iaDb) _iaDb = currentDb;

  if (!_iaData) _iaLoad();
}
