// ── Safety Inventory Tab — مستلزمات السلامة ──────────────────────────────────
'use strict';

const SA_FMT  = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
const SA_FMTN = n => (+n||0).toLocaleString('ar-SA', { maximumFractionDigits:0 });
const SA_ESC  = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

let _saData      = null;
let _saMonths    = [];
let _saAutoTimer = null;
let _saCountdown = 0;
let _saCharts    = [];
const SA_REFRESH_SEC = 60;

// ── Status colours ────────────────────────────────────────────────────────────
const SA_SC = { critical:'#ff4444', red:'#f08080', yellow:'#f5c842', green:'#4ada8e', dead:'#b06bd4' };
const SA_PALETTE = ['#4a9eda','#f5a623','#4ada8e','#a78bfa','#f472b6','#34d399','#fb923c','#60a5fa','#e879f9','#a3e635','#fbbf24','#38bdf8'];

// ── Auto-refresh helpers ──────────────────────────────────────────────────────
function _saIsActive() {
  return !!document.querySelector('.tab.active[data-tab="safety"]');
}
function _saStopAuto() {
  if (_saAutoTimer) { clearInterval(_saAutoTimer); _saAutoTimer = null; }
}
function _saSetStatus(text, color) {
  const el = document.getElementById('sa-status');
  if (el) { el.textContent = text; el.style.color = color || '#7090b0'; }
}
function _saStartAuto() {
  _saStopAuto();
  _saCountdown = SA_REFRESH_SEC;
  _saAutoTimer = setInterval(async () => {
    if (!_saIsActive()) { _saStopAuto(); return; }
    _saCountdown--;
    if (_saCountdown > 0) {
      const el = document.getElementById('sa-status');
      if (el && _saData) {
        el.textContent = `✅ ${_saData.length} صنف | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_saCountdown}ث`;
        el.style.color = '#1a7a3c';
      }
    } else {
      _saCountdown = SA_REFRESH_SEC;
      _saSetStatus('🔄 جارٍ التحديث…', '#a87d00');
      const db = State.get('db');
      try {
        const data = await fetch(`/api/safety?db=${encodeURIComponent(db)}`).then(r => r.json());
        if (data.error) throw new Error(data.error);
        _saData   = data.items;
        _saMonths = data.months;
        _saDestroyCharts();
        _saPopulate();
        _saSetStatus(`✅ ${_saData.length} صنف | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${SA_REFRESH_SEC}ث`, '#1a7a3c');
      } catch(err) {
        _saSetStatus('⚠️ فشل التحديث: ' + err.message, '#c0392b');
      }
    }
  }, 1000);
}
function _saDestroyCharts() {
  _saCharts.forEach(c => { try { c.destroy(); } catch(_){} });
  _saCharts = [];
}

// ── Month label (Arabic) ──────────────────────────────────────────────────────
function _saMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return MONTHS[+m-1] + ' ' + y.slice(2);
}

// ── Shell builder ─────────────────────────────────────────────────────────────
function _saBuildShell(wrap) {
  wrap.innerHTML = `
<style>
.sa-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;
  background:linear-gradient(135deg,#0a2818 0%,#0f3a28 100%);border-radius:10px;padding:18px 22px;margin-bottom:16px}
.sa-header h3{margin:0;font-size:1.1rem;color:#b0e8c8}
.sa-header .sub{font-size:.78rem;color:#5a9a7a;margin-top:4px}
.sa-alert{border-radius:8px;padding:10px 16px;margin-bottom:10px;border-right:4px solid}
.sa-alert.crit{background:#1a0505;border-color:#ff4444}
.sa-alert.warn{background:#1a1205;border-color:#f5c842}
.sa-alert-title{font-weight:700;margin-bottom:4px;font-size:.88rem}
.sa-tl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:10px}
.sa-tl-card{border-radius:8px;padding:12px 14px;background:#060f1a;border:1.5px solid #1e3a5f;position:relative}
.sa-tl-card.critical{border-color:#ff4444;background:#120505}
.sa-tl-card.red{border-color:#f08080;background:#100a0a}
.sa-tl-card.yellow{border-color:#f5c842;background:#100e02}
.sa-tl-card.green{border-color:#4ada8e;background:#02100a}
.sa-tl-card.dead{border-color:#b06bd4;background:#0e0518}
.sa-tl-dot{width:10px;height:10px;border-radius:50%;position:absolute;top:10px;left:10px}
.sa-tl-card.critical .sa-tl-dot{background:#ff4444}
.sa-tl-card.red       .sa-tl-dot{background:#f08080}
.sa-tl-card.yellow    .sa-tl-dot{background:#f5c842}
.sa-tl-card.green     .sa-tl-dot{background:#4ada8e}
.sa-tl-card.dead      .sa-tl-dot{background:#b06bd4}
.sa-tl-status{font-weight:700;font-size:.8rem;margin-bottom:2px}
.sa-tl-size{font-size:1.1rem;font-weight:800;color:#c8e8f8;margin-bottom:4px}
.sa-tl-doh{font-size:.78rem;color:#7090b0}
.sa-tl-sub{font-size:.72rem;color:#4a6a8a;margin-top:2px}
.sa-tl-val{font-size:.76rem;color:#8aa8cc;margin-top:4px;border-top:1px solid #1e3a5f;padding-top:4px}
.sa-sbadge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:600}
.sa-sbadge.critical{background:#2a0808;color:#ff8888;border:1px solid #ff4444}
.sa-sbadge.red      {background:#200808;color:#f08080;border:1px solid #f08080}
.sa-sbadge.yellow   {background:#201a00;color:#f5c842;border:1px solid #f5c842}
.sa-sbadge.green    {background:#002010;color:#4ada8e;border:1px solid #4ada8e}
.sa-sbadge.dead     {background:#180528;color:#b06bd4;border:1px solid #b06bd4}
.sa-rec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:8px}
.sa-rec-card{border-radius:8px;padding:14px 16px;background:#060f1a;border:1.5px solid}
.sa-rec-card.buy{border-color:#4ada8e;background:#021008}
.sa-rec-card.liquidate{border-color:#f08080;background:#100505}
.sa-rec-card.hold{border-color:#4a9eda;background:#02081a}
.sa-rec-action{font-weight:800;font-size:.88rem;margin-bottom:6px}
.sa-rec-item{font-size:.95rem;font-weight:700;color:#c0d8f0;margin-bottom:6px}
.sa-rec-why{font-size:.78rem;color:#7090b0;line-height:1.5;margin-bottom:6px}
.sa-rec-num{font-size:.8rem;color:#a0c4e8;font-weight:600}
.sa-hm-cell{display:block;border-radius:3px;padding:3px 5px;font-size:.75rem;text-align:center;min-width:46px}
.sa-fn{font-size:.72rem;color:#3a5a7a;margin-top:8px;padding-top:6px;border-top:1px solid #0f2030;line-height:1.5}
</style>

<div class="sa-header">
  <div>
    <h3>تحليل مستلزمات أنظمة السلامة — عمر المخزون ومعدل الدوران</h3>
    <div class="sub" id="sa-sub">ماسورة أسود عماني الجزيرة ضغط 40 · بيانات حية من ERP · آخر 90 يوم كأساس للتحليل</div>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <span id="sa-status" style="font-size:.78rem;color:#7090b0">⏳ جارٍ التحميل…</span>
    <button class="btn" onclick="saExportExcel()" style="background:#0a3a1a;color:#80e0a0;font-size:.8rem">📥 Excel</button>
  </div>
</div>

<div id="sa-alerts"></div>
<div class="kpis" id="sa-kpis"></div>

<div class="card">
  <div class="card-title">🚦 لوحة المخاطر التنفيذية — حالة كل صنف</div>
  <div class="sa-tl-grid" id="sa-tl-grid"></div>
  <div class="sa-fn">🟢 سليم = DOH أقل من 90 يوم | 🟡 مراقبة = 90–180 يوم | 🔴 مفرط = أكثر من 180 يوم | 🟣 راكد = لا مبيعات 30+ يوم | 🔴⚡ حرج = نفاد وشيك (DOH &lt; 30)</div>
</div>

<div class="grid2">
  <div class="card">
    <div class="card-title">💰 قيمة المخزون (ر.س) مقابل أيام الإمداد</div>
    <div class="chart-wrap"><canvas id="sa-chart-bubble"></canvas></div>
  </div>
  <div class="card">
    <div class="card-title">🔄 معدل الدوران السنوي المتوقع (×/سنة)</div>
    <div class="chart-wrap"><canvas id="sa-chart-turnover"></canvas></div>
  </div>
</div>

<div class="card">
  <div class="card-title">🌡️ خريطة حرارة — المبيعات الشهرية (آخر 9 أشهر)</div>
  <div class="tbl-wrap"><table id="sa-heatmap"></table></div>
  <div class="sa-fn">اللون الأعمق = أعلى مبيعات · الخلايا الرمادية = صفر مبيعات</div>
</div>

<div class="card">
  <div class="card-title">⏳ تفصيل عمر المخزون ومعدل الدوران</div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>الصنف</th>
        <th class="num">المخزون</th>
        <th class="num">قيمة (ر.س)</th>
        <th>أقدم استلام</th>
        <th class="num">DOH (90 يوم)</th>
        <th class="num">دوران/سنة</th>
        <th class="num">سرعة/يوم</th>
        <th>توقع النفاد</th>
        <th>الحالة</th>
      </tr></thead>
      <tbody id="sa-tbody-aging"></tbody>
      <tfoot id="sa-tfoot-aging"></tfoot>
    </table>
  </div>
  <div class="sa-fn">DOH = أيام الإمداد بالسرعة الحالية (آخر 90 يوم). دوران/سنة = سرعة الـ90 يوم × 365 ÷ متوسط المخزون.</div>
</div>

<div class="card">
  <div class="card-title">📅 توقعات نفاد المخزون</div>
  <div class="chart-wrap" style="height:240px;margin-bottom:16px"><canvas id="sa-chart-stockout"></canvas></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>الصنف</th>
        <th class="num">المخزون</th>
        <th class="num">معدل/يوم</th>
        <th class="num">أيام للنفاد</th>
        <th>تاريخ النفاد</th>
        <th>آخر بيع</th>
        <th class="num">هامش أمان</th>
        <th>قرار</th>
      </tr></thead>
      <tbody id="sa-tbody-proj"></tbody>
    </table>
  </div>
  <div class="sa-fn">* مبني على متوسط 90 يوم. الهامش المقترح لإعادة الطلب: شهران من وقت الاستلام.</div>
</div>

<div class="grid2">
  <div class="card">
    <div class="card-title">📈 اتجاه مبيعات الأصناف النشطة</div>
    <div class="chart-wrap"><canvas id="sa-chart-velocity"></canvas></div>
  </div>
  <div class="card">
    <div class="card-title">🏷️ سعر الشراء (MAC) مقابل سعر البيع (ر.س/وحدة)</div>
    <div class="chart-wrap"><canvas id="sa-chart-margin"></canvas></div>
  </div>
</div>

<div class="card">
  <div class="card-title">💡 توصيات المحلل المالي</div>
  <div class="sa-rec-grid" id="sa-rec-grid"></div>
</div>

<div class="card">
  <div class="card-title">💵 ملخص المخاطر المالية والكفاءة</div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>الصنف</th>
        <th class="num">تكلفة المشتريات (ر.س)</th>
        <th class="num">إيرادات إجمالية (ر.س)</th>
        <th class="num">مردودات (ر.س)</th>
        <th class="num">صافي الإيرادات (ر.س)</th>
        <th class="num">هامش الربح</th>
        <th class="num">قيمة المخزون المتبقي</th>
        <th>نسبة التحصيل</th>
        <th>رأس مال مجمّد</th>
      </tr></thead>
      <tbody id="sa-tbody-fin"></tbody>
      <tfoot id="sa-tfoot-fin"></tfoot>
    </table>
  </div>
  <div class="sa-fn">صافي الإيرادات = إيرادات البيع − مردودات البيع. هامش الربح = (صافي الإيرادات − تكلفة المبيع) ÷ صافي الإيرادات. رأس المال المجمّد = قيمة الأصناف ذات الدوران أقل من 2× سنوياً.</div>
</div>
`;
}

// ── Main populate ─────────────────────────────────────────────────────────────
function _saPopulate() {
  const D       = _saData;
  const months  = _saMonths;
  const mLabels = months.map(_saMonthLabel);
  const TODAY   = new Date();

  const addDays  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmtDate  = d => d instanceof Date ? d.toISOString().slice(0,10) : '—';
  const fmtQty   = n => (+n||0).toLocaleString('ar-SA', { maximumFractionDigits: 3 });

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const critical = D.filter(it => it.status === 'critical');
  const dead     = D.filter(it => it.status === 'dead');
  const excess   = D.filter(it => it.status === 'red');
  let alertsHtml = '';
  critical.forEach(it => {
    alertsHtml += `<div class="sa-alert crit">
      <div class="sa-alert-title">🚨 تنبيه عاجل — ${SA_ESC(it.nameAr)}: نفاد المخزون خلال ${it.doh90} يوم</div>
      متبقٍ ${SA_FMTN(it.qty)} وحدة · معدل البيع ${it.daily90} وحدة/يوم · <strong>أصدر طلب شراء فوري</strong>
    </div>`;
  });
  if (excess.length > 0) {
    const excessVal = excess.reduce((s,it) => s + it.invValue, 0);
    const names = excess.map(it => `${SA_ESC(it.nameAr)} (${it.doh90} يوم)`).join(' · ');
    alertsHtml += `<div class="sa-alert warn">
      <div class="sa-alert-title">⚠️ تحذير — مخزون مفرط: رأس مال مجمّد ${SA_FMTN(excessVal)} ر.س</div>
      ${names}
    </div>`;
  }
  if (dead.length > 0) {
    const deadVal  = dead.reduce((s,it) => s + it.invValue, 0);
    const names    = dead.map(it => `${SA_ESC(it.nameAr)} (${it.daysSinceLastSale} يوم بلا بيع)`).join(' · ');
    alertsHtml += `<div class="sa-alert warn">
      <div class="sa-alert-title">⚠️ بضاعة راكدة — ${dead.length} صنف: لا مبيعات منذ 30+ يوم</div>
      ${names} · قيمة مجمّدة: ${SA_FMTN(deadVal)} ر.س
    </div>`;
  }
  document.getElementById('sa-alerts').innerHTML = alertsHtml;

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalInv = D.reduce((s,it) => s + it.invValue, 0);
  const riskInv  = D.filter(it => it.doh90 > 180 || it.status === 'dead').reduce((s,it) => s + it.invValue, 0);
  const avgDoh   = D.reduce((s,it) => s + Math.min(it.doh90, 2000), 0) / (D.length || 1);
  const wdoh     = D.reduce((s,it) => s + (it.invValue / (totalInv || 1)) * Math.min(it.doh90, 999), 0);
  const fastItem = D.reduce((a,b) => a.turnover > b.turnover ? a : b, D[0] || {});
  const slowItem = D.reduce((a,b) => a.doh90   < b.doh90   ? b : a, D[0] || {});

  document.getElementById('sa-kpis').innerHTML = [
    { lbl:'قيمة المخزون الإجمالية (تكلفة)',    val:'ر.س ' + SA_FMTN(totalInv),     sub:'محسوبة بمتوسط التكلفة المتحرك (MAC)', accent:'#f5a623' },
    { lbl:'مخزون في خطر (>180 يوم أو راكد)',   val:'ر.س ' + SA_FMTN(riskInv) + ' (' + (totalInv ? (riskInv/totalInv*100).toFixed(0) : 0)+'%)', sub:'نسبة رأس المال المجمّد', accent:'#f08080' },
    { lbl:'متوسط DOH',                         val:SA_FMTN(avgDoh) + ' يوم',        sub:'أيام إمداد بالسرعة الحالية (آخر 90 يوم)', accent:'#4ada8e' },
    { lbl:'DOH المرجح بالقيمة',               val:SA_FMTN(wdoh) + ' يوم',          sub:'مرجح بقيمة كل صنف',                accent:'#60a5fa' },
    { lbl:'أسرع دوران',                        val:(fastItem.nameAr||'—').slice(0,20) + ' — ' + (fastItem.turnover||0).toFixed(1)+'×', sub:'أعلى معدل دوران سنوي', accent:'#34d399' },
    { lbl:'أبطأ دوران',                        val:(slowItem.nameAr||'—').slice(0,20) + ' — ' + (slowItem.doh90||0) + ' يوم', sub:'أعلى مخاطرة تجميد رأس مال', accent:'#a78bfa' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Traffic Light ──────────────────────────────────────────────────────────
  document.getElementById('sa-tl-grid').innerHTML = D.map(it => {
    const dohTxt  = it.doh90 > 2000 ? 'لانهائي' : it.doh90 > 999 ? '+999 يوم' : SA_FMTN(it.doh90) + ' يوم';
    const lastTxt = it.daysSinceLastSale === 0 ? 'اليوم' : it.daysSinceLastSale >= 9999 ? 'لا بيع' : it.daysSinceLastSale + ' يوم مضت';
    return `<div class="sa-tl-card ${it.status}">
      <div class="sa-tl-dot"></div>
      <div class="sa-tl-status">${it.statusAr}</div>
      <div class="sa-tl-size">${SA_ESC(it.nameAr)}</div>
      <div class="sa-tl-doh">إمداد: ${dohTxt}</div>
      <div class="sa-tl-sub">آخر بيع: ${lastTxt} · أقدم استلام: ${it.oldestFifoDays} يوم</div>
      <div class="sa-tl-val">مخزون: ${fmtQty(it.qty)} ${SA_ESC(it.unitName)} · قيمة: ر.س ${SA_FMTN(it.invValue)}</div>
    </div>`;
  }).join('');

  // ── Heatmap ────────────────────────────────────────────────────────────────
  const maxPerItem = D.map(it => Math.max(...it.monthSales, 1));
  let hmHtml = `<thead><tr><th style="text-align:right">الصنف</th>`;
  mLabels.forEach(m => hmHtml += `<th>${m}</th>`);
  hmHtml += '<th>الإجمالي</th></tr></thead><tbody>';
  D.forEach((it, i) => {
    hmHtml += `<tr><td style="color:#a0c4e8;white-space:nowrap;font-size:.78rem">${SA_ESC(it.nameAr)}</td>`;
    let tot = 0;
    it.monthSales.forEach(v => {
      tot += v;
      const intens = v / maxPerItem[i];
      const bg = v === 0 ? '#080f18' : intens < .2 ? '#0d3020' : intens < .4 ? '#1a5040' : intens < .6 ? '#2a7060' : intens < .8 ? '#3a9080' : '#4ada8e';
      const col = intens > .5 ? '#e2e8f0' : '#6a9a8a';
      hmHtml += `<td style="padding:2px 3px"><span class="sa-hm-cell" style="background:${bg};color:${col}">${v > 0 ? SA_FMTN(v) : '—'}</span></td>`;
    });
    hmHtml += `<td style="color:#c0d8f0;font-weight:700;padding:4px 8px">${SA_FMTN(tot)}</td></tr>`;
  });
  hmHtml += '</tbody>';
  document.getElementById('sa-heatmap').innerHTML = hmHtml;

  // ── Aging Table ────────────────────────────────────────────────────────────
  let totInv = 0;
  document.getElementById('sa-tbody-aging').innerHTML = D.map(it => {
    const dohTxt  = it.doh90 > 2000 ? '∞ راكد' : it.doh90 > 999 ? '+999' : SA_FMTN(it.doh90);
    const dohColor = it.doh90 > 180 ? '#f08080' : it.doh90 > 90 ? '#f5c842' : '#4ada8e';
    const projDays = it.daily90 > 0 ? Math.round(it.qty / it.daily90) : null;
    const projDate = projDays != null ? fmtDate(addDays(TODAY, projDays)) : 'لا حركة';
    const projColor = projDays != null && projDays < 60 ? '#ff4444' : projDays != null && projDays < 120 ? '#f5c842' : '#6a8aaa';
    totInv += it.invValue;
    return `<tr>
      <td style="font-size:.82rem"><strong>${SA_ESC(it.nameAr)}</strong><br><small style="color:#3a5a7a">${SA_ESC(it.itemCode)}</small></td>
      <td class="num">${fmtQty(it.qty)}</td>
      <td class="num" style="color:#f5a623">${SA_FMT(it.invValue)}</td>
      <td style="font-size:.78rem;color:#6a8aaa">${it.oldestFifoDays} يوم مضى</td>
      <td class="num" style="color:${dohColor};font-weight:700">${dohTxt}</td>
      <td class="num">${it.turnover.toFixed(2)}×</td>
      <td class="num">${it.daily90 > 0 ? it.daily90.toFixed(1) : '—'}</td>
      <td style="font-size:.75rem;color:${projColor}">${projDate}</td>
      <td><span class="sa-sbadge ${it.status}">${it.statusAr}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('sa-tfoot-aging').innerHTML = `<tr style="font-weight:700;background:#0a1e30;border-top:2px solid #1e3a5f">
    <td>الإجمالي</td>
    <td class="num">${fmtQty(D.reduce((s,it)=>s+it.qty,0))}</td>
    <td class="num" style="color:#f5a623">${SA_FMT(totInv)}</td>
    <td colspan="7"></td>
  </tr>`;

  // ── Stockout Projection table ──────────────────────────────────────────────
  document.getElementById('sa-tbody-proj').innerHTML = D.map(it => {
    if (it.daily90 === 0) return `<tr>
      <td><strong>${SA_ESC(it.nameAr)}</strong></td><td class="num">${fmtQty(it.qty)}</td>
      <td class="num">—</td><td class="num" style="color:#b06bd4">لا حركة</td>
      <td style="color:#b06bd4">غير محدد</td>
      <td style="font-size:.72rem">${it.lastSaleDate || '—'}</td>
      <td class="num">—</td><td><span class="sa-sbadge dead">مراجعة</span></td>
    </tr>`;
    const doh = Math.round(it.qty / it.daily90);
    const stockoutDate = fmtDate(addDays(TODAY, doh));
    const safetyMonths = (doh / 30).toFixed(1);
    const urg = doh < 30 ? 'critical' : doh < 60 ? 'red' : doh < 120 ? 'yellow' : 'green';
    const dec = doh < 30 ? '🚨 عاجل' : doh < 60 ? 'طلب قريب' : doh < 120 ? 'مراقبة' : 'كافٍ';
    const urgColor = urg === 'critical' ? '#ff4444' : urg === 'red' ? '#f08080' : urg === 'yellow' ? '#f5c842' : '#4ada8e';
    return `<tr>
      <td><strong>${SA_ESC(it.nameAr)}</strong></td>
      <td class="num">${fmtQty(it.qty)}</td>
      <td class="num">${it.daily90.toFixed(1)}</td>
      <td class="num" style="color:${urgColor};font-weight:700">${doh > 999 ? '+999' : SA_FMTN(doh)} يوم</td>
      <td style="font-size:.75rem;color:${urg==='critical'?'#ff4444':'#8aa8cc'}">${doh > 999 ? '—' : stockoutDate}</td>
      <td style="font-size:.72rem">${it.lastSaleDate || '—'}</td>
      <td class="num" style="color:${urg==='critical'?'#ff4444':urg==='red'?'#f08080':'#6a8aaa'}">${doh > 999 ? '+33' : safetyMonths} شهر</td>
      <td><span class="sa-sbadge ${urg}">${dec}</span></td>
    </tr>`;
  }).join('');

  // ── Auto Recommendations ───────────────────────────────────────────────────
  const recs = [];
  D.filter(it => it.status === 'critical').forEach(it => {
    recs.push({ type:'buy', item:it.nameAr, why:`أعلى أولوية — متبقٍ ${SA_FMTN(it.qty)} وحدة بمعدل ${it.daily90.toFixed(1)} وحدة/يوم. النفاد خلال ${it.doh90} يوم.`, num:`أوصي بطلب شراء فوري` });
  });
  D.filter(it => it.status === 'green' && it.doh90 < 60).forEach(it => {
    recs.push({ type:'buy', item:it.nameAr, why:`DOH ${it.doh90} يوم فقط · دوران ${it.turnover.toFixed(1)}× سنوياً · مخزون حديث.`, num:`طلب خلال 30 يوماً` });
  });
  D.filter(it => it.status === 'dead' && it.invValue > 50000).forEach(it => {
    recs.push({ type:'liquidate', item:it.nameAr, why:`${it.daysSinceLastSale} يوم بلا مبيعات. قيمة مجمّدة ${SA_FMTN(it.invValue)} ر.س. خطر تقادم.`, num:`خفِّض السعر 10-15% أو اعرضه على موزعين` });
  });
  D.filter(it => it.status === 'red').forEach(it => {
    recs.push({ type:'hold', item:it.nameAr, why:`DOH ${it.doh90} يوم — مخزون مفرط. قيمة ${SA_FMTN(it.invValue)} ر.س مجمّدة.`, num:`توقف شراء — راجع بعد 90 يوماً` });
  });
  document.getElementById('sa-rec-grid').innerHTML = recs.length
    ? recs.map(r => `<div class="sa-rec-card ${r.type}">
        <div class="sa-rec-action">${r.type==='buy'?'🟢 شراء':r.type==='liquidate'?'🔴 تصفية':'🔵 انتظار'}</div>
        <div class="sa-rec-item">${SA_ESC(r.item)}</div>
        <div class="sa-rec-why">${SA_ESC(r.why)}</div>
        <div class="sa-rec-num">${SA_ESC(r.num)}</div>
      </div>`).join('')
    : '<div style="color:#4ada8e;padding:12px">✅ لا توصيات عاجلة — الوضع طبيعي</div>';

  // ── Financial Summary ──────────────────────────────────────────────────────
  let totBuy=0, totGross=0, totRet=0, totNetSell=0, totRemVal=0, totLocked=0;
  document.getElementById('sa-tbody-fin').innerHTML = D.map(it => {
    const grossSales = it.salesNet + it.retNet;
    const avgBuy     = it.purchQty > 0 ? it.purchCost / it.purchQty : it.mac;
    const soldCost   = it.soldQty * avgBuy;
    const gp         = it.salesNet - soldCost;
    const margin     = it.salesNet > 0 ? gp / it.salesNet * 100 : 0;
    const soldPct    = it.soldQty + it.qty > 0 ? it.soldQty / (it.soldQty + it.qty) * 100 : 0;
    const isLocked   = it.turnover < 2;
    totBuy += it.purchCost; totGross += grossSales;
    totRet += it.retNet; totNetSell += it.salesNet;
    totRemVal += it.invValue;
    if (isLocked) totLocked += it.invValue;
    const mColor = margin > 15 ? '#4ada8e' : margin > 5 ? '#f5c842' : '#f08080';
    const retCell = it.retNet > 0
      ? `<span class="num" style="color:#f08080">−${SA_FMT(it.retNet)}</span><br><small style="color:#5a6a7a">${SA_FMTN(it.retQty)} وحدة</small>`
      : `<span style="color:#3a5a4a">—</span>`;
    return `<tr>
      <td style="font-size:.82rem"><strong>${SA_ESC(it.nameAr)}</strong></td>
      <td class="num" style="color:#f5a623">${SA_FMT(it.purchCost)}</td>
      <td class="num" style="color:#6a9aba">${SA_FMT(grossSales)}</td>
      <td class="num">${retCell}</td>
      <td class="num" style="color:#4a9eda;font-weight:600">${SA_FMT(it.salesNet)}</td>
      <td class="num" style="color:${mColor};font-weight:700">${margin.toFixed(1)}%</td>
      <td class="num" style="color:${it.invValue>300000?'#f08080':'#8aa8cc'}">${SA_FMT(it.invValue)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:56px;background:#0a1e30;border-radius:3px;height:5px">
            <div style="width:${Math.min(soldPct,100)}%;height:5px;border-radius:3px;background:${soldPct>70?'#4ada8e':soldPct>40?'#f5c842':'#f08080'}"></div>
          </div>
          <span style="font-size:.78rem">${soldPct.toFixed(1)}%</span>
        </div>
      </td>
      <td>${isLocked?`<span class="num" style="color:#f08080">${SA_FMT(it.invValue)} ر.س</span>`:'<span style="color:#4ada8e">✓ دوران سليم</span>'}</td>
    </tr>`;
  }).join('');
  const totMargin = totNetSell > 0 ? (totNetSell - totBuy) / totNetSell * 100 : 0;
  document.getElementById('sa-tfoot-fin').innerHTML = `<tr style="font-weight:700;background:#0a1e30;border-top:2px solid #1e3a5f">
    <td>الإجمالي</td>
    <td class="num" style="color:#f5a623">${SA_FMT(totBuy)}</td>
    <td class="num" style="color:#6a9aba">${SA_FMT(totGross)}</td>
    <td class="num" style="color:#f08080">−${SA_FMT(totRet)}</td>
    <td class="num" style="color:#4a9eda;font-weight:700">${SA_FMT(totNetSell)}</td>
    <td class="num" style="color:${totMargin>0?'#4ada8e':'#f08080'};font-weight:700">${totMargin.toFixed(1)}%</td>
    <td class="num" style="color:#f5a623">${SA_FMT(totRemVal)}</td>
    <td></td>
    <td class="num" style="color:#f08080">${SA_FMT(totLocked)} ر.س مجمّد</td>
  </tr>`;

  // ── Charts ─────────────────────────────────────────────────────────────────
  // 1. Bubble: value vs DOH
  const cBubble = new Chart(document.getElementById('sa-chart-bubble'), {
    type: 'bubble',
    data: { datasets: D.map((it, i) => ({
      label: it.nameAr,
      data: [{ x: Math.min(it.doh90, 999), y: it.invValue, r: Math.max(Math.sqrt(it.invValue / 5000) * 3, 5) }],
      backgroundColor: SA_SC[it.status] + '88', borderColor: SA_SC[it.status], borderWidth: 2,
    }))},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels:{ color:'#6a8aaa', font:{ size:10 }, boxWidth:10 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: DOH=${ctx.raw.x}ي | ${SA_FMT(ctx.raw.y)} ر.س` } }
      },
      scales: {
        x: { title:{ display:true, text:'أيام الإمداد (DOH)', color:'#6a8aaa' }, ticks:{ color:'#6a8aaa' }, grid:{ color:'#1a2233' }, min:0 },
        y: { title:{ display:true, text:'قيمة المخزون (ر.س)', color:'#6a8aaa' }, ticks:{ color:'#6a8aaa', callback: v => SA_FMTN(v) }, grid:{ color:'#1a2233' } }
      }
    }
  });
  _saCharts.push(cBubble);

  // 2. Turnover bar
  const cTurn = new Chart(document.getElementById('sa-chart-turnover'), {
    type: 'bar',
    data: {
      labels: D.map(it => it.nameAr),
      datasets: [{ label:'معدل الدوران السنوي (×)', data: D.map(it => Math.min(it.turnover, 50)),
        backgroundColor: D.map(it => SA_SC[it.status] + '88'),
        borderColor: D.map(it => SA_SC[it.status]), borderWidth: 2, borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => 'دوران: '+ctx.raw.toFixed(1)+'× سنوياً' } } },
      scales: {
        x: { ticks:{ color:'#6a8aaa' }, grid:{ color:'#1a2233' }, title:{ display:true, text:'دورة/سنة — الصحي: ≥4×', color:'#6a8aaa' } },
        y: { ticks:{ color:'#cdd2dd', font:{ size:10 } }, grid:{ display:false } }
      }
    }
  });
  _saCharts.push(cTurn);

  // 3. Stockout bar
  const cStock = new Chart(document.getElementById('sa-chart-stockout'), {
    type: 'bar',
    data: {
      labels: D.map(it => it.nameAr),
      datasets: [{ label:'أيام الإمداد المتبقية',
        data: D.map(it => it.daily90 > 0 ? Math.min(Math.round(it.qty / it.daily90), 999) : 999),
        backgroundColor: D.map(it => {
          if (it.status === 'dead') return '#9b59b688';
          const d = it.daily90 > 0 ? it.qty / it.daily90 : 999;
          return d < 30 ? '#ff4444aa' : d < 90 ? '#f08080aa' : d < 180 ? '#f5c84288' : '#4ada8e44';
        }),
        borderColor: D.map(it => SA_SC[it.status]), borderWidth: 2, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => ctx.raw>=999?'راكد / بلا حركة':'متبقٍ '+ctx.raw+' يوم' } } },
      scales: {
        x: { ticks:{ color:'#cdd2dd', font:{ size:10 } }, grid:{ display:false } },
        y: { ticks:{ color:'#6a8aaa', callback: v => v>=999?'∞':v+' يوم' }, grid:{ color:'#1a2233' }, title:{ display:true, text:'الأيام المتبقية', color:'#6a8aaa' } }
      }
    }
  });
  _saCharts.push(cStock);

  // 4. Velocity line (active items only)
  const active = D.filter(it => it.daily90 > 2).sort((a,b) => b.daily90 - a.daily90).slice(0, 8);
  const cVel = new Chart(document.getElementById('sa-chart-velocity'), {
    type: 'line',
    data: {
      labels: mLabels,
      datasets: active.map((it, i) => ({
        label: it.nameAr, data: it.monthSales,
        borderColor: SA_PALETTE[i], backgroundColor: 'transparent',
        borderWidth: 2, pointRadius: 3, tension: .3,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{ labels:{ color:'#8aa8cc', font:{ size:10 }, boxWidth:10 } } },
      scales: {
        x: { ticks:{ color:'#6a8aaa' }, grid:{ color:'#1a2233' } },
        y: { ticks:{ color:'#6a8aaa', callback: v => v+' و' }, grid:{ color:'#1a2233' } }
      }
    }
  });
  _saCharts.push(cVel);

  // 5. MAC vs AvgSell comparison
  const cMargin = new Chart(document.getElementById('sa-chart-margin'), {
    type: 'bar',
    data: {
      labels: D.map(it => it.nameAr),
      datasets: [
        { label:'MAC (تكلفة متحركة ر.س/و)', data: D.map(it => +it.mac.toFixed(2)), backgroundColor:'#f5a62388', borderColor:'#f5a623', borderWidth:1, borderRadius:3 },
        { label:'متوسط سعر البيع (ر.س/و)',  data: D.map(it => +it.avgSell.toFixed(2)), backgroundColor:'#4a9eda88', borderColor:'#4a9eda', borderWidth:1, borderRadius:3 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{ labels:{ color:'#8aa8cc', font:{ size:10 } } } },
      scales: {
        x: { ticks:{ color:'#cdd2dd', font:{ size:9 } }, grid:{ display:false } },
        y: { ticks:{ color:'#6a8aaa', callback: v => 'ر.س '+v }, grid:{ color:'#1a2233' } }
      }
    }
  });
  _saCharts.push(cMargin);
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function renderSafetyInventory() {
  const wrap = document.getElementById('tab-safety');
  if (!wrap) return;
  if (!wrap.innerHTML.trim()) _saBuildShell(wrap);

  const db = State.get('db');
  _saSetStatus('⏳ جارٍ تحميل بيانات مستلزمات السلامة…', '#a87d00');

  try {
    const data = await fetch(`/api/safety?db=${encodeURIComponent(db)}`).then(r => r.json());
    if (data.error) throw new Error(data.error);
    _saData   = data.items;
    _saMonths = data.months;
    if (!_saData || _saData.length === 0) {
      _saSetStatus('⚠️ لا توجد أصناف سلامة بمخزون حالي', '#f5c842');
      return;
    }
    _saDestroyCharts();
    _saPopulate();
    _saSetStatus(`✅ ${_saData.length} صنف | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${SA_REFRESH_SEC}ث`, '#1a7a3c');
    _saStartAuto();
  } catch(err) {
    _saSetStatus('❌ ' + err.message, '#c0392b');
    const body = wrap.querySelector('#sa-kpis');
    if (body) body.innerHTML = `<div style="padding:40px;color:#e74c3c">⚠️ ${SA_ESC(err.message)}</div>`;
  }
}

// ── Excel Export ──────────────────────────────────────────────────────────────
window.saExportExcel = async function() {
  if (!_saData || !_saData.length) return;
  const D = _saData;
  const mLabels = _saMonths.map(_saMonthLabel);
  const TODAY = new Date();
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmtDate = d => d instanceof Date ? d.toISOString().slice(0,10) : '—';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Safety Inventory Analysis'; wb.created = new Date();
  const rtl = [{ rightToLeft: true }];

  // Sheet 1: Aging analysis
  const ws1 = wb.addWorksheet('تحليل الدوران والعمر'); ws1.views = rtl;
  ws1.addRow(['الصنف','الكمية','قيمة التكلفة (ر.س)','MAC','أقدم استلام (يوم)','DOH (90 يوم)','دوران/سنة','سرعة/يوم','توقع النفاد','الحالة'])
    .eachCell(c => { c.style = { font:{ bold:true, color:{ argb:'FF7AABCC' } } }; });
  D.forEach(it => {
    const doh = it.daily90 > 0 ? Math.round(it.qty / it.daily90) : null;
    ws1.addRow([it.nameAr, it.qty, it.invValue, it.mac, it.oldestFifoDays,
      it.doh90 > 999 ? '>999' : it.doh90, it.turnover.toFixed(2)+'×',
      it.daily90 > 0 ? it.daily90.toFixed(1) : 0,
      doh ? fmtDate(addDays(TODAY, doh)) : 'لا حركة', it.statusAr]);
  });

  // Sheet 2: Financial risk
  const ws2 = wb.addWorksheet('المخاطر المالية'); ws2.views = rtl;
  ws2.addRow(['الصنف','تكلفة المشتريات','إيرادات إجمالية','مردودات','صافي الإيرادات','هامش الربح %','قيمة المخزون','نسبة التحصيل %','رأس مال مجمّد'])
    .eachCell(c => { c.style = { font:{ bold:true } }; });
  D.forEach(it => {
    const grossSales = it.salesNet + it.retNet;
    const avgBuy = it.purchQty > 0 ? it.purchCost / it.purchQty : it.mac;
    const soldCost = it.soldQty * avgBuy;
    const gp = it.salesNet - soldCost;
    const margin = it.salesNet > 0 ? gp / it.salesNet * 100 : 0;
    const soldPct = it.soldQty + it.qty > 0 ? it.soldQty / (it.soldQty + it.qty) * 100 : 0;
    ws2.addRow([it.nameAr, it.purchCost.toFixed(0), grossSales.toFixed(0),
      it.retNet > 0 ? '-'+it.retNet.toFixed(0) : '—', it.salesNet.toFixed(0),
      margin.toFixed(1)+'%', it.invValue.toFixed(0),
      soldPct.toFixed(1)+'%', it.turnover < 2 ? it.invValue.toFixed(0) : '—']);
  });

  // Sheet 3: Monthly sales
  const ws3 = wb.addWorksheet('مبيعات شهرية'); ws3.views = rtl;
  ws3.addRow(['الصنف', ...mLabels, 'الإجمالي']).eachCell(c => { c.style = { font:{ bold:true } }; });
  D.forEach(it => ws3.addRow([it.nameAr, ...it.monthSales, it.monthSales.reduce((s,v)=>s+v,0)]));

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `safety-inventory-${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
};
