'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
let _coData      = null;
let _coAutoTimer = null;
let _coCountdown = 0;
let _coCharts    = [];
let _coScenario  = 'base';
const CO_REFRESH_SEC = 60;
const CO_MFG_EFF     = 0.97;
const CO_MFG_CONV    = 350;

// Seasonal demand multipliers by month (1–12) — applied to 3MA in the seasonal forecast scenario
const CO_SEASONAL_MULTS = {
  '01':0.85,'02':0.90,'03':1.05,'04':1.15,'05':1.10,'06':0.90,
  '07':1.10,'08':1.20,'09':1.00,'10':1.05,'11':1.10,'12':1.25,
};

const _MONTH_AR_CO = {
  '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو',
  '07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر',
};
const _MONTH_SH_CO = {
  '01':'ين','02':'فب','03':'مر','04':'أب','05':'ما','06':'يون',
  '07':'يول','08':'أغ','09':'سب','10':'أكت','11':'نوف','12':'ديس',
};

// Returns next N months starting from (today + 1 month) as [{ym, label, short}]
function _coNextMonths(n) {
  const today = new Date();
  const res = [];
  let d = new Date(today.getFullYear(), today.getMonth() + 1, 1); // start next month
  for (let i = 0; i < n; i++) {
    const yr = String(d.getFullYear());
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    res.push({ ym:`${yr}-${mo}`, label:`${_MONTH_AR_CO[mo]} ${yr}`, short:`${_MONTH_SH_CO[mo]}-${yr.slice(2)}` });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return res;
}

// Returns the last N calendar quarters ending with the current quarter (oldest first)
// Example on Jun-2026: n=3 → [Q4-2025, Q1-2026, Q2-2026]
function _coLastQuarters(n) {
  const today   = new Date();
  const Q_COLORS = ['#a78bfa','#4a9eda','#f5a623','#4ada8e','#f472b6','#64b5f6'];
  // current quarter index (0-based): 0=Q1, 1=Q2, 2=Q3, 3=Q4
  const curQIdx = Math.floor(today.getMonth() / 3); // 0..3
  const curYear = today.getFullYear();
  const res = [];
  for (let i = n - 1; i >= 0; i--) {
    // i quarters before the current
    let qIdx = curQIdx - i;
    let yr   = curYear;
    while (qIdx < 0) { qIdx += 4; yr--; }
    const qStart = new Date(yr, qIdx * 3, 1);
    const qEnd   = new Date(yr, qIdx * 3 + 3, 0); // last day of last month in quarter
    const min    = `${yr}-${String(qIdx * 3 + 1).padStart(2,'0')}`;
    const maxYr  = qEnd.getFullYear();
    const max    = `${maxYr}-${String(qEnd.getMonth() + 1).padStart(2,'0')}`;
    res.push({ label:`Q${qIdx + 1} ${yr}`, color: Q_COLORS[i % Q_COLORS.length], min, max });
  }
  return res;
}

function _coIsActive()  { return !!document.querySelector('.tab.active[data-tab="coils"]'); }
function _coStopAuto()  { if (_coAutoTimer) { clearInterval(_coAutoTimer); _coAutoTimer = null; } }
function _coDestroyCharts() {
  _coCharts.forEach(c => { try { c.destroy(); } catch(_){} });
  _coCharts = [];
}
function _coStartAuto() {
  _coStopAuto();
  _coCountdown = CO_REFRESH_SEC;
  _coAutoTimer = setInterval(() => {
    if (!_coIsActive()) { _coStopAuto(); return; }
    _coCountdown--;
    const el = document.getElementById('co-status');
    if (el) el.textContent = `تحديث تلقائي خلال ${_coCountdown}ث`;
    if (_coCountdown <= 0) { _coCountdown = CO_REFRESH_SEC; renderCoilsTab(); }
  }, 1000);
}

function _coN(n)   { return (n != null && !isNaN(+n)) ? fmt(Math.round(+n)) : '—'; }
function _coT(n)   { return n != null ? (+n).toFixed(2) : '—'; }
function _coC(m)   { return m > 25 ? 'pos' : m > 15 ? 'warn' : 'neg'; }

// ── Shell ──────────────────────────────────────────────────────────────────────
function _coBuildShell(wrap) {
  wrap.innerHTML = `
<style>
#co-root{color:#c0d8f0;direction:rtl;font-family:inherit;padding:0 4px}
#co-root .co-hdr{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1e2d42;margin-bottom:14px;flex-wrap:wrap}
#co-root .co-hdr h1{font-size:1.05rem;color:#4a9eda;margin:0;flex:1}
#co-root .co-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:18px}
#co-root .co-kpi{background:#0d1a2a;border-radius:8px;padding:12px 14px;border:1px solid #1e2d42}
#co-root .co-kpi[data-a="green"]  {border-top:2px solid #4ada8e}
#co-root .co-kpi[data-a="red"]    {border-top:2px solid #da4a4a}
#co-root .co-kpi[data-a="accent"] {border-top:2px solid #4a9eda}
#co-root .co-kpi[data-a="orange"] {border-top:2px solid #f5a623}
#co-root .co-kpi[data-a="purple"] {border-top:2px solid #a78bfa}
#co-root .co-kpi .lbl{font-size:.7rem;color:#6a7d9a;margin-bottom:3px}
#co-root .co-kpi .val{font-size:1.15rem;font-weight:700;color:#e0e8f0}
#co-root .co-kpi .sub{font-size:.66rem;color:#4a6a8a;margin-top:2px}
#co-root section{margin-bottom:22px}
#co-root h2{font-size:.88rem;color:#8aa8cc;border-bottom:1px solid #1e2d42;padding-bottom:5px;margin-bottom:10px;margin-top:0}
#co-root table{width:100%;border-collapse:collapse;font-size:.77rem}
#co-root th{background:#0d1a2a;color:#8aa8cc;padding:6px 7px;text-align:center;position:sticky;top:0;z-index:1}
#co-root td{padding:5px 7px;border-bottom:1px solid #1a2736;text-align:center;vertical-align:middle}
#co-root .lft{text-align:right}
#co-root .pos{color:#4ada8e}
#co-root .neg{color:#da4a4a}
#co-root .warn{color:#f5a623}
#co-root .accent{color:#4a9eda}
#co-root .muted{color:#6a7d9a}
#co-root .num{font-family:monospace}
#co-root .cr{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:18px}
#co-root .cb{background:#0d1a2a;border-radius:8px;padding:12px;border:1px solid #1e2d42}
#co-root .cb h3{font-size:.73rem;color:#6a7d9a;margin:0 0 8px;text-align:center}
#co-root .pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:14px}
#co-root .pc{background:#0d1a2a;border-radius:8px;padding:12px;border:1px solid #1e2d42}
#co-root .pc h3{font-size:.83rem;margin:0 0 9px}
#co-root .pc .row{display:flex;justify-content:space-between;font-size:.73rem;padding:2px 0}
#co-root .pc .k{color:#6a7d9a}
#co-root .pc .v{font-weight:600}
#co-root .sctabs{display:flex;gap:6px;margin-bottom:10px}
#co-root .sct{padding:4px 12px;border-radius:4px;background:#0d1a2a;border:1px solid #2a3f56;color:#8aa8cc;cursor:pointer;font-size:.76rem}
#co-root .sct.active{background:#1a3050;color:#4a9eda;border-color:#4a9eda}
#co-root .btn{padding:5px 12px;border-radius:5px;background:#1a2d40;border:1px solid #2a4060;color:#8aa8cc;cursor:pointer;font-size:.76rem}
#co-root .btn:hover{background:#243d55;color:#c0d8f0}
#co-root .mkpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px}
#co-root .mk{background:#0d1a2a;border-radius:6px;padding:8px 10px;border:1px solid #1e2d42}
#co-root .mk .lbl{font-size:.67rem;color:#6a7d9a}
#co-root .mk .val{font-size:.98rem;font-weight:700}
#co-root .mk .sub{font-size:.63rem;color:#4a6a8a}
#co-root .bar{display:inline-block;height:6px;border-radius:3px;vertical-align:middle}
</style>
<div id="co-root">
<div class="co-hdr">
  <h1>🔩 تحليل الكويلات — كويلات حديد تسليح</h1>
  <span id="co-status" style="font-size:.73rem;color:#6a7d9a"></span>
  <button class="btn" onclick="renderCoilsTab()">↻ تحديث</button>
  <button class="btn" onclick="coExportExcel()">📊 Excel</button>
</div>

<!-- KPIs -->
<div id="co-kpis" class="co-kpis"></div>

<!-- Monthly Ledger -->
<section><h2>دفتر حركة المخزون الشهرية (طن)</h2>
<div style="overflow-x:auto"><table>
<thead><tr>
  <th class="lft">الشهر</th><th>الافتتاح</th><th class="pos">المشتريات</th>
  <th class="neg">التسليم الكلي</th>
  <th class="warn">التسويات</th><th>الإغلاق</th><th>متوسط المخزون</th>
  <th style="color:#a78bfa">للمصنع (معلوماتي)</th><th>DOI (يوم)</th>
</tr></thead>
<tbody id="co-ledger-body"></tbody>
<tfoot id="co-ledger-foot"></tfoot>
</table></div></section>

<!-- Charts Row 1 -->
<div class="cr">
  <div class="cb"><h3>مسار رصيد المخزون</h3><canvas id="co-c-stock"></canvas></div>
  <div class="cb"><h3>مشتريات مقابل مبيعات</h3><canvas id="co-c-flow"></canvas></div>
  <div class="cb"><h3>فترة التخزين DOI (يوم)</h3><canvas id="co-c-doi"></canvas></div>
</div>

<!-- Revenue & Margin -->
<section><h2>تحليل الإيراد والهامش الإجمالي</h2>
<div style="overflow-x:auto"><table>
<thead><tr>
  <th class="lft">الشهر</th><th class="pos">الإيراد (ر.س)</th><th>الكمية (طن)</th>
  <th style="color:#f472b6">سعر البيع (ر.س/ط)</th><th class="neg">تكلفة المبيعات</th>
  <th class="pos">الربح الإجمالي</th><th>هامش %</th><th>ربح/طن</th>
</tr></thead>
<tbody id="co-rev-body"></tbody>
<tfoot id="co-rev-foot"></tfoot>
</table></div></section>

<!-- Charts Row 2 -->
<div class="cr">
  <div class="cb" style="grid-column:span 2"><h3>الإيراد وسعر البيع الشهري</h3><canvas id="co-c-rev"></canvas></div>
  <div class="cb"><h3>التحويلات الصادرة (للتصنيع)</h3><canvas id="co-c-tr"></canvas></div>
</div>

<!-- Period Comparison -->
<section><h2>مقارنة الأرباع</h2>
<div id="co-pg" class="pg"></div>
<div style="overflow-x:auto"><table>
<thead><tr id="co-periods-head">
  <th class="lft">المؤشر</th>
  <th>—</th><th>—</th><th>—</th>
  <th>الإجمالي</th>
</tr></thead>
<tbody id="co-periods-body"></tbody>
</table></div></section>

<!-- Item Breakdown -->
<section><h2>تحليل الحركة حسب الصنف (منذ بداية الفترة)</h2>
<div style="overflow-x:auto"><table>
<thead><tr>
  <th class="lft">الصنف</th><th>افتتاح الفترة</th><th class="pos">الاستلام</th>
  <th class="neg">التسليم</th><th style="color:#a78bfa">التحويلات</th>
  <th class="warn">تسويات</th><th>المخزون الحالي</th>
  <th>MAC (ر.س/ط)</th><th>قيمة المخزون</th>
</tr></thead>
<tbody id="co-items-body"></tbody>
<tfoot id="co-items-foot"></tfoot>
</table></div></section>

<!-- Items Charts -->
<div class="cr">
  <div class="cb"><h3>توزيع المخزون الحالي حسب الصنف</h3><canvas id="co-c-pie"></canvas></div>
  <div class="cb"><h3>إجمالي التسليم حسب الصنف (طن)</h3><canvas id="co-c-items"></canvas></div>
</div>

<!-- Manufacturing -->
<section><h2>تحليل التصنيع — مصنع حوراء (كفاءة 97%)</h2>
<div id="co-mfg-kpis" class="mkpis"></div>
<div style="overflow-x:auto"><table>
<thead><tr>
  <th class="lft">الشهر</th><th class="accent">مدخلات (طن)</th>
  <th class="pos">إنتاج متوقع</th><th class="neg">هدر (طن)</th>
  <th class="neg">تكلفة المواد</th><th class="warn">تكلفة التحويل</th>
  <th>إجمالي التكلفة</th><th>معدل يومي (ط/يوم)</th>
</tr></thead>
<tbody id="co-mfg-body"></tbody>
<tfoot id="co-mfg-foot"></tfoot>
</table></div></section>

<!-- Mfg Charts -->
<div class="cr">
  <div class="cb" style="grid-column:span 2"><h3>حجم التصنيع الشهري (طن)</h3><canvas id="co-c-mfg"></canvas></div>
  <div class="cb"><h3>توزيع التحويلات حسب الصنف</h3><canvas id="co-c-mfg-items"></canvas></div>
</div>

<!-- Forecast -->
<section><h2 id="co-fore-title">التوقعات — 6 أشهر قادمة</h2>
<div class="sctabs">
  <button class="sct active" onclick="coSetScenario('base',this)">قاعدي (3MA)</button>
  <button class="sct" onclick="coSetScenario('cons',this)">تحفظي (×0.8)</button>
  <button class="sct" onclick="coSetScenario('opt',this)">موسمي</button>
</div>
<div id="co-fore-kpis" class="mkpis"></div>
<div style="overflow-x:auto"><table>
<thead><tr>
  <th class="lft">الشهر</th><th class="accent">الطلب المتوقع (طن)</th>
  <th class="warn">احتياج الشراء</th><th class="neg">تكلفة تقديرية</th>
  <th class="pos">إيراد متوقع</th><th>هامش تقديري</th>
</tr></thead>
<tbody id="co-fore-body"></tbody>
<tfoot id="co-fore-foot"></tfoot>
</table></div>
<div class="cb" style="margin-top:14px"><h3>منحنى الطلب (فعلي + توقعات)</h3><canvas id="co-c-forecast"></canvas></div>
</section>
</div>`;
}

// ── Populate all sections ──────────────────────────────────────────────────────
function _coPopulate(d) {
  const { monthly, revenue, items, summary } = d;
  const avgMac = summary.weightedMac > 0 ? summary.weightedMac : 2000;

  // ── KPIs ──
  const last = monthly[monthly.length - 1];
  document.getElementById('co-kpis').innerHTML = [
    { lbl:'المخزون الحالي',       val:`${summary.currentTons.toFixed(1)} طن`,      sub:`قيمة: ${_coN(summary.totalCostVal)} ر.س`,      a:'accent' },
    { lbl:'إجمالي المشتريات',     val:`${summary.totalRcp.toFixed(0)} طن`,          sub:`منذ ${summary.startDate}`,                      a:'green' },
    { lbl:'إجمالي التسليم',       val:`${summary.totalDel.toFixed(0)} طن`,          sub:'مبيعات للعملاء',                                a:'red' },
    { lbl:'إجمالي التحويلات',     val:`${summary.totalTri.toFixed(0)} طن`,          sub:'تحويلات للمصنع',                                a:'purple' },
    { lbl:'إجمالي الإيراد',       val:`${(summary.totalRev/1e6).toFixed(2)} م ر.س`, sub:'من فواتير البيع',                               a:'green' },
    { lbl:'متوسط MAC/طن',         val:`${_coN(summary.weightedMac)} ر.س`,           sub:'متوسط مرجح بالمخزون الحالي',                    a:'orange' },
    { lbl:'3MA المبيعات',         val:`${summary.ma3.toFixed(1)} ط/شهر`,            sub:'آخر 3 أشهر كاملة',                              a:'accent' },
    { lbl:'إغلاق آخر شهر',        val:`${last ? last.closeQty.toFixed(1) : '—'} طن`,sub: last ? last.label : '',                         a:'orange' },
  ].map(k => `<div class="co-kpi" data-a="${k.a}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Monthly ledger ──
  let tRcp=0, tDel=0, tTri=0, tAdj=0;
  document.getElementById('co-ledger-body').innerHTML = monthly.map(m => {
    tRcp+=m.receipts; tDel+=m.delivers; tTri+=m.trIssued; tAdj+=m.netAdj;
    const doiCls = m.doi == null ? 'muted' : m.doi < 15 ? 'pos' : m.doi < 45 ? 'warn' : 'neg';
    const star = m.partial ? ' <span style="font-size:.62rem;color:#6a7d9a">*</span>' : '';
    const closeCls = m.closeQty < 30 ? '#da4a4a' : m.closeQty < 100 ? '#f5a623' : '#4ada8e';
    return `<tr>
      <td class="lft"><strong>${m.label}</strong>${star}</td>
      <td class="num">${_coT(m.openQty)}</td>
      <td class="num pos">${m.receipts>0?'+'+_coT(m.receipts):'—'}</td>
      <td class="num neg">${m.delivers>0?'('+_coT(m.delivers)+')':'—'}</td>
      <td class="num warn">${m.netAdj!==0?_coT(m.netAdj):'—'}</td>
      <td class="num" style="color:${closeCls}">${_coT(m.closeQty)}</td>
      <td class="num">${_coT(m.avgInv)}</td>
      <td class="num" style="color:#a78bfa">${m.trIssued>0?_coT(m.trIssued):'—'}</td>
      <td class="num ${doiCls}">${m.doi!=null?m.doi:'—'}</td>
    </tr>`;
  }).join('');
  const fOpen  = monthly[0]?.openQty   || 0;
  const fClose = monthly[monthly.length-1]?.closeQty || 0;
  document.getElementById('co-ledger-foot').innerHTML = `
    <tr style="font-weight:700;background:#0d1a2a;border-top:2px solid #4a9eda">
      <td class="lft">الإجمالي / الحالي</td>
      <td class="num">${_coT(fOpen)}</td>
      <td class="num pos">+${_coT(tRcp)}</td>
      <td class="num neg">(${_coT(tDel)})</td>
      <td class="num warn">${_coT(tAdj)}</td>
      <td class="num accent">${_coT(fClose)}</td>
      <td></td>
      <td class="num" style="color:#a78bfa">${_coT(tTri)}</td>
      <td></td>
    </tr>`;

  // ── Revenue & margin ──
  let tRev=0, tQty=0, tCogs=0, tGP=0;
  document.getElementById('co-rev-body').innerHTML = revenue.map(r => {
    const moLabel = monthly.find(m=>m.ym===r.ym)?.label || r.ym;
    const cogs    = r.qty * avgMac;
    const gp      = r.revenue - cogs;
    const margin  = r.revenue > 0 ? gp / r.revenue * 100 : 0;
    const gpPerTon = r.qty > 0 ? gp / r.qty : 0;
    tRev+=r.revenue; tQty+=r.qty; tCogs+=cogs; tGP+=gp;
    const mc = r.revenue > 0 ? _coC(margin) : 'muted';
    return `<tr>
      <td class="lft"><strong>${moLabel}</strong></td>
      <td class="num pos">${r.revenue>0?_coN(r.revenue):'—'}</td>
      <td class="num">${r.qty>0?_coT(r.qty):'—'}</td>
      <td class="num" style="color:#f472b6">${r.avgPrice>0?_coN(r.avgPrice):'—'}</td>
      <td class="num neg">${cogs>0?_coN(cogs):'—'}</td>
      <td class="num ${gp>0?'pos':'neg'}">${r.revenue>0?_coN(gp):'—'}</td>
      <td class="num ${mc}">${r.revenue>0?margin.toFixed(1)+'%':'—'}</td>
      <td class="num ${mc}">${r.qty>0&&r.revenue>0?_coN(gpPerTon):'—'}</td>
    </tr>`;
  }).join('');
  const tMargin  = tRev>0 ? tGP/tRev*100 : 0;
  const tGpPerTon = tQty>0 ? tGP/tQty : 0;
  document.getElementById('co-rev-foot').innerHTML = `
    <tr style="font-weight:700;background:#0d1a2a;border-top:2px solid #4a9eda">
      <td class="lft">الإجمالي</td>
      <td class="num pos">${_coN(tRev)}</td>
      <td class="num">${tQty.toFixed(0)} طن</td>
      <td></td>
      <td class="num neg">${_coN(tCogs)}</td>
      <td class="num pos">${_coN(tGP)}</td>
      <td class="num ${_coC(tMargin)}">${tMargin.toFixed(1)}%</td>
      <td class="num pos">${_coN(tGpPerTon)} ر.س/طن</td>
    </tr>`;

  // ── Period comparison ──
  _coPeriods(monthly, revenue, avgMac);

  // ── Item breakdown ──
  const totCurQty = items.reduce((s,i)=>s+Math.max(0,i.currentQty),0);
  let tiRcp=0, tiDel=0, tiTri=0, tiCur=0, tiVal=0;
  document.getElementById('co-items-body').innerHTML = items.map(item => {
    const cur = Math.max(0, item.currentQty);
    const val = cur * (item.mac || 0);
    const pct = totCurQty > 0 ? cur / totCurQty * 100 : 0;
    tiRcp+=item.periodRcp; tiDel+=item.periodDel; tiTri+=item.periodTri; tiCur+=cur; tiVal+=val;
    return `<tr>
      <td class="lft"><span style="color:${item.color}">●</span> <strong>${item.nameAr}</strong></td>
      <td class="num">${_coT(item.openPeriod)}</td>
      <td class="num pos">${item.periodRcp>0?'+'+_coT(item.periodRcp):'—'}</td>
      <td class="num neg">${item.periodDel>0?'('+_coT(item.periodDel)+')':'—'}</td>
      <td class="num" style="color:#a78bfa">${item.periodTri>0?'↔'+_coT(item.periodTri):'—'}</td>
      <td class="num warn">${item.periodAdj!==0?_coT(item.periodAdj):'—'}</td>
      <td>
        <span class="num" style="color:${cur<0.1?'#da4a4a':'#4ada8e'}">${_coT(cur)}</span>
        <span class="bar" style="width:${Math.round(pct*1.4)}px;background:${item.color};opacity:.5;margin-right:4px"></span>
        <span style="font-size:.65rem;color:#6a7d9a">${pct.toFixed(0)}%</span>
      </td>
      <td class="num warn">${item.mac>0?_coN(item.mac):'—'}</td>
      <td class="num accent">${val>0?_coN(val):'—'}</td>
    </tr>`;
  }).join('');
  document.getElementById('co-items-foot').innerHTML = `
    <tr style="font-weight:700;background:#0d1a2a;border-top:2px solid #4a9eda">
      <td class="lft">الإجمالي</td><td></td>
      <td class="num pos">+${_coT(tiRcp)}</td>
      <td class="num neg">(${_coT(tiDel)})</td>
      <td class="num" style="color:#a78bfa">↔${_coT(tiTri)}</td>
      <td></td>
      <td class="num accent">${_coT(tiCur)} طن</td>
      <td></td>
      <td class="num accent">${_coN(tiVal)} ر.س</td>
    </tr>`;

  // ── Manufacturing ──
  const tIn=monthly.reduce((s,m)=>s+m.mfgInput,0);
  const tOut=monthly.reduce((s,m)=>s+m.mfgOut,0);
  const tWaste=monthly.reduce((s,m)=>s+m.mfgWaste,0);
  const tMat=monthly.reduce((s,m)=>s+m.mfgMat,0);
  const tConv=monthly.reduce((s,m)=>s+m.mfgConv,0);
  const tTotMfg=monthly.reduce((s,m)=>s+m.mfgTotal,0);
  const peakMfg = [...monthly].sort((a,b)=>b.mfgInput-a.mfgInput)[0];
  const fullDays = monthly.filter(m=>!m.partial).reduce((s,m)=>s+m.days,0);
  const avgDailyMfg = fullDays>0 ? tIn/fullDays : 0;

  document.getElementById('co-mfg-kpis').innerHTML = [
    { lbl:'إجمالي المدخلات',       val:`${tIn.toFixed(0)} طن`,                     sub:'كويلات محوَّلة للمصنع',           a:'#4a9eda' },
    { lbl:'إجمالي الإنتاج المتوقع',val:`${tOut.toFixed(0)} طن`,                    sub:`هدر: ${tWaste.toFixed(0)} طن`,     a:'#4ada8e' },
    { lbl:'تكلفة المواد الخام',     val:`${(tMat/1e6).toFixed(2)} م ر.س`,           sub:'بالتكلفة الفعلية',                 a:'#da4a4a' },
    { lbl:'تكلفة التحويل التقديرية',val:`${(tConv/1e6).toFixed(2)} م ر.س`,          sub:`${CO_MFG_CONV} ر.س/طن`,           a:'#f5a623' },
    { lbl:'إجمالي تكلفة الإنتاج',  val:`${(tTotMfg/1e6).toFixed(2)} م ر.س`,        sub:'مواد + تحويل',                     a:'#f5a623' },
    { lbl:'متوسط يومي',            val:`${avgDailyMfg.toFixed(1)} ط/يوم`,           sub:'متوسط أشهر كاملة',                 a:'#4ada8e' },
    { lbl:'ذروة التصنيع',          val:peakMfg?.shortLbl||'—',                     sub:`${(peakMfg?.mfgInput||0).toFixed(0)} طن`, a:'#a78bfa' },
    { lbl:'تكلفة الإنتاج/طن',      val:`${_coN(tTotMfg/(tOut||1))} ر.س`,           sub:'مواد + تحويل ÷ إنتاج',             a:'#f5a623' },
  ].map(k=>`<div class="mk" style="border-top:2px solid ${k.a}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  let mIn=0, mOut=0, mWaste=0, mMat=0, mConv=0, mTot=0;
  document.getElementById('co-mfg-body').innerHTML = monthly.map(m => {
    mIn+=m.mfgInput; mOut+=m.mfgOut; mWaste+=m.mfgWaste;
    mMat+=m.mfgMat; mConv+=m.mfgConv; mTot+=m.mfgTotal;
    const vc = m.mfgInput>350?'#4ada8e':m.mfgInput>150?'#f5a623':'#6a7d9a';
    const rc = m.dailyRate>12?'pos':m.dailyRate>6?'warn':'neg';
    const star = m.partial?' <span style="font-size:.62rem;color:#6a7d9a">*</span>':'';
    return `<tr>
      <td class="lft"><strong>${m.label}</strong>${star}</td>
      <td><span class="num" style="color:${vc}">${m.mfgInput>0?m.mfgInput.toFixed(1):'—'}</span></td>
      <td class="num pos">${m.mfgOut>0?m.mfgOut.toFixed(1):'—'}</td>
      <td class="num neg">${m.mfgWaste>0?m.mfgWaste.toFixed(1):'—'}</td>
      <td class="num neg">${m.mfgMat>0?_coN(m.mfgMat):'—'}</td>
      <td class="num warn">${m.mfgConv>0?_coN(m.mfgConv):'—'}</td>
      <td class="num" style="color:#e0a060">${m.mfgTotal>0?_coN(m.mfgTotal):'—'}</td>
      <td class="num ${rc}">${m.dailyRate>0?m.dailyRate.toFixed(1):'—'}</td>
    </tr>`;
  }).join('');
  document.getElementById('co-mfg-foot').innerHTML = `
    <tr style="font-weight:700;background:#0d1a2a;border-top:2px solid #4a9eda">
      <td class="lft">الإجمالي</td>
      <td class="num accent">${mIn.toFixed(1)} طن</td>
      <td class="num pos">${mOut.toFixed(1)} طن</td>
      <td class="num neg">${mWaste.toFixed(1)} طن</td>
      <td class="num neg">${_coN(mMat)}</td>
      <td class="num warn">${_coN(mConv)}</td>
      <td class="num" style="color:#e0a060">${_coN(mTot)}</td>
      <td></td>
    </tr>`;

  // ── Forecast ──
  _coForecastRender(d);

  // ── Status (countdown filled by _coStartAuto) ──
  const el = document.getElementById('co-status');
  if (el) el.textContent = `تحديث تلقائي خلال ${CO_REFRESH_SEC}ث`;

  // ── Charts (defer for DOM) ──
  setTimeout(() => _coChartsBuild(d), 80);
}

// ── Period comparison — dynamic quarters ──────────────────────────────────────
function _coPeriods(monthly, revenue, avgMac) {
  const PERS = _coLastQuarters(3);
  function calc(rows) {
    if (!rows.length) return null;
    const td  = rows.reduce((s,m)=>s+m.days,0);
    const tr  = rows.reduce((s,m)=>s+m.receipts,0);
    const tDel= rows.reduce((s,m)=>s+m.delivers,0);
    const tti = rows.reduce((s,m)=>s+m.trIssued,0);
    const avg = rows.reduce((s,m)=>s+m.avgInv,0)/rows.length;
    const turn= avg>0?tDel/avg:0;
    const doi = tDel>0?(avg/tDel)*td:0;
    const ann = td>0?turn*(365/td):0;
    const revR= revenue.filter(r=>rows.some(m=>m.ym===r.ym));
    const tR  = revR.reduce((s,r)=>s+r.revenue,0);
    const tRQ = revR.reduce((s,r)=>s+r.qty,0);
    const cogs= tRQ*avgMac, gp=tR-cogs;
    const mg  = tR>0?gp/tR*100:0;
    return {tr,tDel,tti,avg,turn,doi,ann,tR,cogs,gp,mg,td};
  }
  const pData = PERS.map(p=>({ ...p, ...calc(monthly.filter(m=>m.ym>=p.min&&m.ym<=p.max)) })).filter(p=>p.td);
  const totP  = calc(monthly);

  // Update table header dynamically
  const head = document.getElementById('co-periods-head');
  if (head) {
    head.innerHTML = `<th class="lft">المؤشر</th>` +
      pData.map(p=>`<th style="color:${p.color}">${p.label}</th>`).join('') +
      `<th>الإجمالي</th>`;
  }

  document.getElementById('co-pg').innerHTML = pData.map(p=>`
    <div class="pc" style="border-top:3px solid ${p.color}">
      <h3 style="color:${p.color}">${p.label}</h3>
      <div class="row"><span class="k">المشتريات (طن)</span><span class="v pos">+${p.tr.toFixed(0)}</span></div>
      <div class="row"><span class="k">المبيعات (طن)</span><span class="v neg">(${p.tDel.toFixed(0)})</span></div>
      <div class="row"><span class="k">التحويلات (طن)</span><span class="v" style="color:${p.color}">↔${p.tti.toFixed(0)}</span></div>
      <div class="row"><span class="k">متوسط المخزون</span><span class="v warn">${p.avg.toFixed(0)} طن</span></div>
      <div class="row"><span class="k">معدل الدوران</span><span class="v ${p.turn>1.2?'pos':p.turn>0.6?'warn':'neg'}">${p.turn.toFixed(2)}×</span></div>
      <div class="row"><span class="k">معدل سنوي مُقدَّر</span><span class="v ${p.ann>5?'pos':p.ann>3?'warn':'neg'}">${p.ann.toFixed(1)}×</span></div>
      <div class="row"><span class="k">DOI متوسط</span><span class="v ${p.doi<15?'pos':p.doi<45?'warn':'neg'}">${p.doi.toFixed(0)} يوم</span></div>
      <div class="row"><span class="k">الإيراد</span><span class="v pos">${(p.tR/1e6).toFixed(2)} م ر.س</span></div>
      <div class="row"><span class="k">هامش الربح</span><span class="v ${_coC(p.mg)}">${p.mg.toFixed(1)}%</span></div>
    </div>`).join('');

  const M = [
    { lbl:'المشتريات (طن)',     fn:p=>'+'+p.tr.toFixed(0),       cls:'pos' },
    { lbl:'المبيعات (طن)',      fn:p=>'('+p.tDel.toFixed(0)+')', cls:'neg' },
    { lbl:'التحويلات (طن)',     fn:p=>'↔'+p.tti.toFixed(0),      cls:'accent' },
    { lbl:'متوسط المخزون (طن)', fn:p=>p.avg.toFixed(0),           cls:'warn' },
    { lbl:'معدل الدوران',       fn:p=>p.turn.toFixed(2)+'×',      cls:p=>p.turn>1.2?'pos':p.turn>0.6?'warn':'neg' },
    { lbl:'معدل سنوي مُقدَّر',  fn:p=>p.ann.toFixed(1)+'×',       cls:p=>p.ann>5?'pos':p.ann>3?'warn':'neg' },
    { lbl:'DOI متوسط (يوم)',    fn:p=>p.doi.toFixed(0),           cls:p=>p.doi<15?'pos':p.doi<45?'warn':'neg' },
    { lbl:'الإيراد (ر.س)',      fn:p=>_coN(p.tR),                 cls:'pos' },
    { lbl:'الربح الإجمالي',     fn:p=>_coN(p.gp),                 cls:p=>p.gp>0?'pos':'neg' },
    { lbl:'هامش الربح',         fn:p=>p.mg.toFixed(1)+'%',        cls:p=>_coC(p.mg) },
  ];
  const AP = [...pData, totP].filter(Boolean);
  document.getElementById('co-periods-body').innerHTML = M.map(m=>{
    const cells=AP.map(p=>{const c=typeof m.cls==='function'?m.cls(p):m.cls;return`<td><span class="num ${c}">${m.fn(p)}</span></td>`;}).join('');
    return `<tr><td class="lft">${m.lbl}</td>${cells}</tr>`;
  }).join('');
}

// ── Forecast render — dynamic months ──────────────────────────────────────────
function _coForecastRender(d) {
  const { monthly, revenue, summary } = d;
  const ma3    = summary.ma3;
  const sc     = _coScenario;
  const facs   = { cons:0.80, base:1.00, opt:null };
  const colMap = { cons:'#f5a623', base:'#4a9eda', opt:'#4ada8e' };
  const col    = colMap[sc];
  const avgMac = summary.weightedMac || 2000;
  const revPrices = revenue.filter(r=>r.avgPrice>0);
  const sellPrice = revPrices.length ? revPrices.reduce((s,r)=>s+r.avgPrice,0)/revPrices.length : 2900;

  const foreMos = _coNextMonths(6);

  // Update section title
  const titleEl = document.getElementById('co-fore-title');
  if (titleEl && foreMos.length) {
    titleEl.textContent = `التوقعات — ${foreMos[0].label} حتى ${foreMos[foreMos.length-1].label}`;
  }

  let cumStock = summary.currentTons;
  let tDem=0, tPurch=0, tCost=0, tRev=0, tMarg=0;
  const rows = foreMos.map(fm => {
    const mo  = fm.ym.slice(5, 7);
    const sea = CO_SEASONAL_MULTS[mo] || 1.0;
    const fac = sc === 'opt' ? sea : (facs[sc] || 1) * sea;
    const dem = parseFloat((ma3 * fac).toFixed(1));
    const need= Math.max(0, dem - cumStock);
    const cost= need * avgMac, rev = dem * sellPrice, marg = rev - dem * avgMac;
    const margPct = rev > 0 ? marg / rev * 100 : 0;
    tDem+=dem; tPurch+=need; tCost+=cost; tRev+=rev; tMarg+=marg;
    cumStock = cumStock + need - dem;
    return { mo:fm.label, dem, need, cost, rev, marg, margPct };
  });

  const periodLbl = foreMos.length ? `${foreMos[0].short}–${foreMos[foreMos.length-1].short}` : '6 أشهر';

  document.getElementById('co-fore-kpis').innerHTML=[
    {lbl:'إجمالي الطلب المتوقع', val:`${tDem.toFixed(0)} طن`,          sub:periodLbl,                       a:'#4a9eda'},
    {lbl:'احتياج الشراء',        val:`${tPurch.toFixed(0)} طن`,         sub:'بعد استهلاك المخزون الحالي',   a:'#f5a623'},
    {lbl:'إيراد متوقع',          val:`${(tRev/1e6).toFixed(2)} م ر.س`,  sub:`بسعر ${_coN(sellPrice)} ر.س/ط`,a:'#4ada8e'},
    {lbl:'هامش تقديري',          val:`${tRev>0?(tMarg/tRev*100).toFixed(1):'—'}%`, sub:`${_coN(Math.round(tMarg))} ر.س`, a:'#4ada8e'},
  ].map(k=>`<div class="mk" style="border-top:2px solid ${k.a}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  document.getElementById('co-fore-body').innerHTML=rows.map(r=>{
    const mc=r.margPct>20?'pos':r.margPct>10?'warn':'neg';
    return`<tr>
      <td class="lft"><strong>${r.mo}</strong></td>
      <td class="num" style="color:${col}">${r.dem.toFixed(0)}</td>
      <td class="num ${r.need>200?'warn':r.need>0?'':'pos'}">${r.need>0?'+'+r.need.toFixed(0):'✓ مكتفٍ'}</td>
      <td class="num neg">${r.need>0?_coN(Math.round(r.cost)):'—'}</td>
      <td class="num pos">${_coN(Math.round(r.rev))}</td>
      <td class="num ${mc}">${_coN(Math.round(r.marg))} (${r.margPct.toFixed(1)}%)</td>
    </tr>`;
  }).join('');
  document.getElementById('co-fore-foot').innerHTML=`
    <tr style="font-weight:700;background:#0d1a2a;border-top:2px solid ${col}">
      <td class="lft">إجمالي ${periodLbl}</td>
      <td class="num" style="color:${col}">${tDem.toFixed(0)} طن</td>
      <td class="num warn">+${tPurch.toFixed(0)} طن</td>
      <td class="num neg">${_coN(Math.round(tCost))}</td>
      <td class="num pos">${_coN(Math.round(tRev))}</td>
      <td class="num ${tRev>0&&tMarg/tRev*100>15?'pos':'warn'}">${_coN(Math.round(tMarg))} (${tRev>0?(tMarg/tRev*100).toFixed(1):'—'}%)</td>
    </tr>`;

  _coForecastChart(monthly, rows, col, sc);
}

// ── Charts ─────────────────────────────────────────────────────────────────────
const _CCD = {
  responsive:true,
  plugins:{
    legend:{labels:{color:'#8aa8cc',font:{size:11}}},
    tooltip:{backgroundColor:'#1a2332',titleColor:'#8aa8cc',bodyColor:'#c0d8f0'},
  },
  scales:{
    x:{ticks:{color:'#6a7d9a',maxRotation:45},grid:{color:'rgba(255,255,255,0.05)'}},
    y:{ticks:{color:'#6a7d9a'},grid:{color:'rgba(255,255,255,0.08)'}},
  },
};
function _coOpts(yTitle) {
  return { ...JSON.parse(JSON.stringify(_CCD)), scales:{ ..._CCD.scales, y:{..._CCD.scales.y,title:{display:true,text:yTitle,color:'#6a7d9a'}} } };
}
function _coMkChart(id, cfg) {
  const c = document.getElementById(id);
  if (!c) return;
  const ch = new Chart(c, cfg);
  _coCharts.push(ch);
}

function _coChartsBuild(d) {
  const { monthly, revenue, items } = d;
  const labels   = monthly.map(m=>m.shortLbl);
  const closes   = monthly.map(m=>m.closeQty);
  const receipts = monthly.map(m=>m.receipts);
  const delivers = monthly.map(m=>m.delivers);
  const trIss    = monthly.map(m=>m.trIssued);
  const doiRows  = monthly.filter(m=>m.doi!=null);

  _coMkChart('co-c-stock',{type:'bar',data:{labels,datasets:[
    {label:'الإغلاق (طن)',data:closes,backgroundColor:'rgba(74,158,218,0.5)',borderColor:'#4a9eda',borderWidth:1,order:2},
    {label:'مشتريات',    data:receipts,backgroundColor:'rgba(74,218,142,0.4)',borderColor:'#4ada8e',borderWidth:1,order:2},
    {label:'مسار الرصيد',data:closes,type:'line',borderColor:'#f5a623',borderWidth:2.5,pointRadius:4,fill:false,order:1},
  ]},options:_coOpts('طن')});

  _coMkChart('co-c-flow',{type:'bar',data:{labels,datasets:[
    {label:'مشتريات',data:receipts,backgroundColor:'rgba(74,218,142,0.6)',borderColor:'#4ada8e',borderWidth:1},
    {label:'مبيعات',  data:delivers,backgroundColor:'rgba(218,74,74,0.5)', borderColor:'#da4a4a',borderWidth:1},
  ]},options:_coOpts('طن')});

  _coMkChart('co-c-doi',{type:'bar',data:{
    labels:doiRows.map(m=>m.shortLbl),
    datasets:[{label:'فترة التخزين (يوم)',data:doiRows.map(m=>m.doi),
      backgroundColor:doiRows.map(m=>m.doi<15?'rgba(74,218,142,0.7)':m.doi<45?'rgba(245,166,35,0.7)':'rgba(218,74,74,0.7)'),
      borderColor:doiRows.map(m=>m.doi<15?'#4ada8e':m.doi<45?'#f5a623':'#da4a4a'),borderWidth:1}]
  },options:_coOpts('يوم')});

  const revVals  = revenue.map(r=>r.revenue);
  const pricVals = revenue.map(r=>r.avgPrice);
  _coMkChart('co-c-rev',{type:'bar',data:{labels,datasets:[
    {label:'الإيراد (ر.س)',      data:revVals, backgroundColor:'rgba(74,218,142,0.5)',borderColor:'#4ada8e',borderWidth:1,order:2},
    {label:'سعر البيع (ر.س/ط)', data:pricVals,type:'line',borderColor:'#f472b6',borderWidth:2,pointRadius:4,fill:false,yAxisID:'y2',order:1},
  ]},options:{...JSON.parse(JSON.stringify(_CCD)),scales:{x:_CCD.scales.x,
    y:{..._CCD.scales.y,title:{display:true,text:'الإيراد (ر.س)',color:'#6a7d9a'}},
    y2:{position:'left',ticks:{color:'#f472b6'},grid:{drawOnChartArea:false},title:{display:true,text:'ر.س/طن',color:'#f472b6'}},
  }}});

  _coMkChart('co-c-tr',{type:'bar',data:{labels,datasets:[
    {label:'تحويلات للمصنع (طن)',data:trIss,backgroundColor:'rgba(167,139,250,0.6)',borderColor:'#a78bfa',borderWidth:1}
  ]},options:_coOpts('طن')});

  const active = items.filter(i=>i.currentQty>0.01);
  _coMkChart('co-c-pie',{type:'doughnut',data:{
    labels:active.map(i=>i.nameAr),
    datasets:[{data:active.map(i=>parseFloat(i.currentQty.toFixed(2))),
      backgroundColor:active.map(i=>i.color+'cc'),borderColor:active.map(i=>i.color),borderWidth:1}]
  },options:{responsive:true,plugins:{legend:{labels:{color:'#8aa8cc',font:{size:10}}},
    tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.parsed.toFixed(1)} طن`}}}}});

  const shortNames = items.map(i=>i.nameAr.replace('كويل ','').replace(' أملس','أ').replace(' مشرشر','م'));
  _coMkChart('co-c-items',{type:'bar',data:{
    labels:shortNames,
    datasets:[{label:'إجمالي التسليم (طن)',data:items.map(i=>i.periodDel),
      backgroundColor:items.map(i=>i.color+'99'),borderColor:items.map(i=>i.color),borderWidth:1}]
  },options:{...JSON.parse(JSON.stringify(_CCD)),indexAxis:'y',scales:{
    y:{ticks:{color:'#8aa8cc'},grid:{color:'rgba(255,255,255,0.05)'}},
    x:{..._CCD.scales.x,title:{display:true,text:'طن',color:'#6a7d9a'}},
  }}});

  _coMkChart('co-c-mfg',{type:'bar',data:{labels,datasets:[
    {label:'مدخلات (كويلات)',   data:monthly.map(m=>m.mfgInput), backgroundColor:'rgba(74,158,218,0.55)',borderColor:'#4a9eda',borderWidth:1},
    {label:'إنتاج (حديد تسليح)',data:monthly.map(m=>m.mfgOut),   backgroundColor:'rgba(74,218,142,0.50)',borderColor:'#4ada8e',borderWidth:1},
    {label:'هدر تصنيع',         data:monthly.map(m=>m.mfgWaste), backgroundColor:'rgba(218,74,74,0.45)', borderColor:'#da4a4a',borderWidth:1},
  ]},options:_coOpts('طن')});

  _coMkChart('co-c-mfg-items',{type:'doughnut',data:{
    labels:items.map(i=>i.nameAr),
    datasets:[{data:items.map(i=>parseFloat(i.periodTri.toFixed(1))),
      backgroundColor:items.map(i=>i.color+'cc'),borderColor:items.map(i=>i.color),borderWidth:1}]
  },options:{responsive:true,plugins:{legend:{labels:{color:'#8aa8cc',font:{size:10}}},
    tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.parsed.toFixed(1)} طن`}}}}});
}

function _coForecastChart(monthly, foreRows, col, sc) {
  const scLabel = {cons:'تحفظي', base:'قاعدي', opt:'موسمي'}[sc];
  const foreShort = _coNextMonths(foreRows.length).map(m=>m.short);
  const all = [...monthly.map(m=>m.shortLbl), ...foreShort];
  const idx = _coCharts.findIndex(c=>c.canvas?.id==='co-c-forecast');
  if (idx!==-1){try{_coCharts[idx].destroy();}catch(_){} _coCharts.splice(idx,1);}
  _coMkChart('co-c-forecast',{type:'line',data:{labels:all,datasets:[
    {label:'فعلي (تسليم)',data:[...monthly.map(m=>m.delivers),...Array(foreRows.length).fill(null)],
     borderColor:'#4a9eda',backgroundColor:'rgba(74,158,218,0.15)',fill:true,tension:0.3,borderWidth:2,pointRadius:4},
    {label:`توقع (${scLabel})`,data:[...Array(monthly.length).fill(null),...foreRows.map(r=>r.dem)],
     borderColor:col,borderDash:[6,4],fill:false,tension:0.3,borderWidth:2,pointRadius:4},
  ]},options:{...JSON.parse(JSON.stringify(_CCD)),scales:{..._CCD.scales,y:{..._CCD.scales.y,title:{display:true,text:'طن/شهر',color:'#6a7d9a'}}}}});
}

// ── Scenario toggle ────────────────────────────────────────────────────────────
function coSetScenario(sc, el) {
  _coScenario = sc;
  document.querySelectorAll('#co-root .sct').forEach(t=>t.classList.remove('active'));
  if (el) el.classList.add('active');
  if (_coData) _coForecastRender(_coData);
}

// ── Excel export ───────────────────────────────────────────────────────────────
async function coExportExcel() {
  if (!_coData || !window.ExcelJS) return;
  const { monthly, revenue, items, summary } = _coData;
  const avgMac = summary.weightedMac || 2000;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Expenses Dashboard';

  const ws1 = wb.addWorksheet('حركة المخزون');
  ws1.addRow(['الشهر','الافتتاح (طن)','المشتريات (طن)','المبيعات (طن)','التحويلات (طن)','التسويات','الإغلاق (طن)','متوسط المخزون (طن)','DOI (يوم)','مدخلات التصنيع (طن)','إنتاج متوقع (طن)','هدر (طن)','تكلفة إنتاج (ر.س)']);
  monthly.forEach(m=>ws1.addRow([m.label,m.openQty,m.receipts,m.delivers,m.trIssued,m.netAdj,m.closeQty,m.avgInv,m.doi??'',m.mfgInput,m.mfgOut,m.mfgWaste,m.mfgTotal]));

  const ws2 = wb.addWorksheet('الإيراد والهامش');
  ws2.addRow(['الشهر','الإيراد (ر.س)','الكمية (طن)','سعر البيع (ر.س/طن)','تكلفة المبيعات','الربح الإجمالي','هامش %']);
  revenue.forEach(r=>{
    const moLabel=monthly.find(m=>m.ym===r.ym)?.label||r.ym;
    const cogs=r.qty*avgMac,gp=r.revenue-cogs;
    ws2.addRow([moLabel,r.revenue,r.qty,r.avgPrice,cogs,gp,r.revenue>0?+(gp/r.revenue*100).toFixed(1):'']);
  });

  const ws3 = wb.addWorksheet('الأصناف');
  ws3.addRow(['الصنف','افتتاح الفترة (طن)','الاستلام (طن)','التسليم (طن)','التحويلات (طن)','تسويات','المخزون الحالي (طن)','MAC (ر.س/طن)','قيمة المخزون (ر.س)']);
  items.forEach(i=>ws3.addRow([i.nameAr,i.openPeriod,i.periodRcp,i.periodDel,i.periodTri,i.periodAdj,i.currentQty,i.mac,i.currentQty*i.mac]));

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `coils-analysis-${summary.dataAsOf}.xlsx`;
  a.click();
}

// ── Entry point ────────────────────────────────────────────────────────────────
async function renderCoilsTab() {
  const wrap = document.getElementById('tab-coils');
  if (!wrap) return;

  if (!wrap.querySelector('#co-root')) _coBuildShell(wrap);

  const statusEl = document.getElementById('co-status');
  if (statusEl) statusEl.textContent = 'جارٍ التحميل…';
  _coDestroyCharts();

  const db  = (typeof getSelectedDb === 'function') ? getSelectedDb() : '';
  const url = '/api/coils' + (db ? `?db=${encodeURIComponent(db)}` : '');

  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    _coData = data;
    _coPopulate(data);
    _coStartAuto();
  } catch (err) {
    if (statusEl) statusEl.textContent = `خطأ: ${err.message}`;
    if (!_coData) console.error('[renderCoilsTab]', err);
  }
}
