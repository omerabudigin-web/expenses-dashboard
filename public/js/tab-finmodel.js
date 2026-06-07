// ── FINANCIAL MODEL TAB — Live ERP Data ─────────────────────────────────
// Fetches from /api/budget (P&L historical + forecast) and /api/cashflow (BS)
// No hardcoded arrays — all data live from MekSoftDb1

const FM_SCENARIOS = {
  cons:{ factor:0.80, label:'تحفظي (−20%)', color:'#f5a623' },
  base:{ factor:1.00, label:'قاعدي',         color:'#4a9eda' },
  opt: { factor:1.15, label:'متفائل (+15%)', color:'#4ada8e' },
};

const FM_CAT_LABELS = {
  sal:'رواتب وأجور', rent:'إيجارات', maint:'صيانة وتشغيل',
  sell:'مبيعات وتسويق', dist:'توزيع ونقل', adm:'مصروفات إدارية',
  char:'تبرعات وزكاة', fin:'تكاليف مالية', oth:'أخرى',
};
const FM_CAT_COLORS = {
  sal:'#4a9eda', rent:'#f5a623', maint:'#34d399', sell:'#f472b6',
  dist:'#a78bfa', adm:'#e0c060', char:'#60a5fa', fin:'#da4a4a', oth:'#9ca3af',
};
const FM_OPEX_CATS = ['sal','rent','maint','sell','dist','adm','char','fin','oth'];

const FM_CHARTS = {};
let _fmRendered  = false;
let _fmScenario  = 'base';
let _fmDb        = 'MekSoftDb1';
let _fmDbNames   = {};
let _fmHist      = [];   // confirmed historical months from API
let _fmPartial   = null; // partial (current) month or null
let _fmFcast     = [];   // 6-month forecast from API
let _fmMeta      = {};   // combined meta

/* ── Entry point (called from main.js on tab switch) ── */
async function renderFinancialModel() {
  if (_fmRendered) return;
  _fmRendered = true;

  const wrap = document.getElementById('tab-finmodel');
  if (!wrap) return;
  wrap.innerHTML = `<div style="text-align:center;padding:80px 20px;color:#7090b0;
    font-family:Tajawal,sans-serif;font-size:1rem">⏳ جارٍ تحميل النموذج المالي من ERP…</div>`;

  try {
    await _fmFetch();
    _fmInjectCSS();
    _fmBuildPage(wrap);
  } catch (err) {
    wrap.innerHTML = `<div style="color:#da4a4a;padding:30px;font-family:Tajawal,sans-serif">
      ❌ خطأ في التحميل: ${err.message}</div>`;
    _fmRendered = false;
  }
}

/* ── Fetch live data from APIs ── */
async function _fmFetch() {
  // Load company names once
  if (!Object.keys(_fmDbNames).length) {
    const cfg = await fetch('/api/config').then(r => r.json());
    await Promise.all((cfg.databases || []).map(async db => {
      try { _fmDbNames[db] = (await fetch(`/api/company-name?db=${db}`).then(r => r.json())).name || db; }
      catch { _fmDbNames[db] = db; }
    }));
  }

  const dbParam = `db=${_fmDb}`;
  const [bgt, cf] = await Promise.all([
    fetch(`/api/budget?${dbParam}&scenario=conservative`).then(r => r.json()),
    fetch(`/api/cashflow?${dbParam}&scenario=conservative`).then(r => r.json()),
  ]);
  if (bgt.error) throw new Error(bgt.error);
  if (cf.error)  throw new Error(cf.error);

  _fmHist    = (bgt.historical || []).filter(m => !m.isPartial);
  _fmPartial = (bgt.historical || []).find(m => m.isPartial) || null;
  _fmFcast   = bgt.forecast || [];
  _fmMeta    = {
    ...(bgt.meta  || {}),
    currentAR:        cf.meta?.currentAR        || 0,
    currentAP:        cf.meta?.currentAP        || 0,
    currentCash:      cf.meta?.currentCash      || 0,
    currentInventory: cf.meta?.currentInventory || 0,
    avgDso:           cf.meta?.avgDso           || 0,
    avgDpo:           cf.meta?.avgDpo           || 0,
    cashRunwayMonths: cf.meta?.cashRunwayMonths || 0,
    cumFinancing:     cf.meta?.cumFinancing     || 0,
  };
}

/* ── Helper formatters ── */
const _fmF  = n => (+n || 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
const _fmFM = n => (Math.abs(n) >= 1e6
  ? (n / 1e6).toFixed(2) + ' م'
  : (n / 1e3).toFixed(1) + ' ك') + ' ر.س';
const _fmFP = n => (isFinite(n) ? (+n).toFixed(1) : '—') + '%';
const _cg   = v => v >= 0 ? '#4ada8e' : '#da4a4a';
const _pc   = v => v >= 20 ? '#4ada8e' : v >= 10 ? '#f5a623' : '#da4a4a';

function _fmDeriveRow(m) {
  const net      = m.revenue;               // API revenue is already net of returns
  const gp       = net - m.cogs;
  const gpPct    = net > 0 ? gp / net * 100 : 0;
  const eb       = gp - m.opex;
  const ebPct    = net > 0 ? eb / net * 100 : 0;
  return { ...m, net, gp, gpPct, eb, ebPct };
}

function _fmAvg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function _fmMedian(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ── Build full page HTML ── */
function _fmBuildPage(wrap) {
  const rows   = _fmHist.map(_fmDeriveRow);
  const n      = rows.length;
  const totN   = rows.reduce((s, r) => s + r.net,  0);
  const totC   = rows.reduce((s, r) => s + r.cogs, 0);
  const totGP  = totN - totC;
  const totOp  = rows.reduce((s, r) => s + r.opex, 0);
  const totEB  = totGP - totOp;
  const avgOpex = totOp / (n || 1);

  const nLabel = n + ' أشهر';
  const partialNote = _fmPartial
    ? `<div class="fm-notice">⚠️ الشهر الجاري <strong>${_fmPartial.label}</strong> جزئي — محذوف من الأرقام الإجمالية والمؤشرات. يظهر أدناه للاستئناس فقط.</div>`
    : '';

  // P&L rows
  const plRowsHtml = [...rows, ...(_fmPartial ? [_fmDeriveRow(_fmPartial)] : [])].map((r, i) => {
    const isP = r.isPartial;
    const style = isP ? 'opacity:.65;font-style:italic' : '';
    return `<tr style="${style}">
      <td>${r.label}${isP ? ' 🔶' : ''}</td>
      <td class="num" style="color:#7090b0">—</td>
      <td class="num" style="color:#7090b0">—</td>
      <td class="num" style="color:#4ada8e">${_fmF(r.net)}</td>
      <td class="num" style="color:#e08080">(${_fmF(r.cogs)})</td>
      <td class="num" style="color:${_cg(r.gp)}">${r.gp < 0 ? '(' + _fmF(-r.gp) + ')' : _fmF(r.gp)}</td>
      <td style="color:${_pc(r.gpPct)}">${_fmFP(r.gpPct)}</td>
      <td class="num" style="color:#e08080">(${_fmF(r.opex)})</td>
      <td class="num" style="color:${_cg(r.eb)}">${r.eb < 0 ? '(' + _fmF(-r.eb) + ')' : _fmF(r.eb)}</td>
      <td style="color:${_pc(r.ebPct)}">${_fmFP(r.ebPct)}</td>
    </tr>`;
  }).join('');

  // OpEx cat rows
  const opexCatRows = FM_OPEX_CATS.map(k => {
    const vals  = _fmHist.map(m => m[k] || 0);
    const total = vals.reduce((s, v) => s + v, 0);
    const avg   = total / (n || 1);
    const pct   = avgOpex > 0 ? avg / avgOpex * 100 : 0;
    const col   = FM_CAT_COLORS[k];
    const dot   = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${col};margin-left:5px;vertical-align:middle"></span>`;
    const fv    = v => v < 0
      ? `<span style="color:#f5a623">(${_fmF(-v)})</span>`
      : `<span>${_fmF(v)}</span>`;
    return `<tr>
      <td style="white-space:nowrap">${dot}${FM_CAT_LABELS[k]}</td>
      ${vals.map(v => `<td class="num">${fv(v)}</td>`).join('')}
      <td class="num" style="color:${col};font-weight:600">${_fmF(avg)}</td>
      <td style="color:${pct > 25 ? '#da4a4a' : pct > 15 ? '#f5a623' : '#4ada8e'};font-weight:600">${_fmFP(pct)}</td>
    </tr>`;
  }).join('');

  const opexMonthTotals = _fmHist.map(m => m.opex);

  // Balance sheet from live CF meta
  const ar   = _fmMeta.currentAR;
  const ap   = _fmMeta.currentAP;
  const inv  = _fmMeta.currentInventory;
  const cash = _fmMeta.currentCash;
  const wc   = cash + ar + inv - ap;
  const dso  = _fmMeta.avgDso;
  const fin  = Math.abs(_fmMeta.cumFinancing || 0);
  const avgFin = _fmHist.filter(m => (m.fin || 0) > 0).map(m => m.fin || 0);
  const monthlyFin = avgFin.length ? _fmAvg(avgFin) : 0;

  // Company selector HTML
  const dbBtns = Object.entries(_fmDbNames).map(([db, name]) =>
    `<button class="fm-db-btn${db === _fmDb ? ' active' : ''}" data-db="${db}">${name}</button>`
  ).join('');

  wrap.innerHTML = `

  <!-- Company selector -->
  <div class="fm-db-bar">
    <span class="fm-db-label">الشركة:</span>
    <div class="fm-db-group">${dbBtns}</div>
    <span class="fm-db-name">${_fmDbNames[_fmDb] || _fmDb}</span>
  </div>

  <!-- KPIs -->
  <div class="fm-kpis">
    <div class="fm-kpi" style="--fma:#5baef0"><div class="lbl">إجمالي الإيراد الصافي (${nLabel})</div><div class="val">${_fmFM(totN)}</div><div class="sub">معدل شهري: ${_fmFM(totN / (n || 1))}</div></div>
    <div class="fm-kpi" style="--fma:#4ada8e"><div class="lbl">مجمل الربح</div><div class="val">${_fmFM(totGP)}</div><div class="sub">هامش: ${_fmFP(totGP / totN * 100)}</div></div>
    <div class="fm-kpi" style="--fma:#da4a4a"><div class="lbl">إجمالي المصروفات</div><div class="val">${_fmFM(totOp)}</div><div class="sub">متوسط شهري: ${_fmFM(avgOpex)}</div></div>
    <div class="fm-kpi" style="--fma:${_cg(totEB)}"><div class="lbl">EBIT (${nLabel})</div><div class="val" style="color:${_cg(totEB)}">${_fmFM(totEB)}</div><div class="sub">هامش: ${_fmFP(totEB / totN * 100)}</div></div>
    <div class="fm-kpi" style="--fma:#5baef0"><div class="lbl">💰 الرصيد النقدي</div><div class="val">${_fmFM(cash)}</div><div class="sub">تغطية: ${_fmMeta.cashRunwayMonths > 50 ? '∞' : (_fmMeta.cashRunwayMonths || 0).toFixed(1)} شهر</div></div>
    <div class="fm-kpi" style="--fma:#a78bfa"><div class="lbl">📥 ذمم مدينة (AR)</div><div class="val">${_fmFM(ar)}</div><div class="sub">DSO: ~${Math.round(dso)} يوم ${dso > 45 ? '⚠️' : '✅'}</div></div>
    <div class="fm-kpi" style="--fma:#f5a623"><div class="lbl">📦 المخزون (بالتكلفة)</div><div class="val">${_fmFM(inv)}</div><div class="sub">رأس مال مُوظَّف في البضاعة</div></div>
    <div class="fm-kpi" style="--fma:#da4a4a"><div class="lbl">📤 ذمم دائنة (AP)</div><div class="val">${_fmFM(ap)}</div><div class="sub">DPO: ~${Math.round(_fmMeta.avgDpo || 0)} يوم</div></div>
  </div>

  ${partialNote}

  <div class="fm-notice">
    ℹ️ <strong>مصدر البيانات:</strong> ERP MekSoftDb1 — الإيراد = حـ/5xx (صافي دائن) · تكلفة المبيعات = حـ/4010101% · المصروفات = حـ/4xx − تكلفة · الأرصدة من الميزانية العمومية الفعلية. الأرقام بالريال السعودي خالية من الضريبة.
  </div>

  <!-- P&L Table -->
  <div class="fm-section">
    <div class="fm-title">📋 قائمة الدخل — ${_fmHist[0]?.label || ''} : ${_fmHist[n - 1]?.label || ''}</div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th>الشهر</th><th class="num">إيراد إجمالي</th><th class="num">مردودات</th>
        <th class="num">صافي الإيراد</th><th class="num">تكلفة مبيعات</th>
        <th class="num">مجمل الربح</th><th>هامش %</th>
        <th class="num">مصروفات أخرى</th><th class="num">صافي الربح</th><th>هامش %</th>
      </tr></thead>
      <tbody>${plRowsHtml}</tbody>
      <tfoot><tr style="font-weight:700;background:#0a1828;border-top:2px solid #3a7abf">
        <td>الإجمالي (${nLabel})</td>
        <td class="num" style="color:#7090b0">—</td>
        <td class="num" style="color:#7090b0">—</td>
        <td class="num" style="color:#4ada8e">${_fmF(totN)}</td>
        <td class="num" style="color:#e08080">(${_fmF(totC)})</td>
        <td class="num" style="color:${_cg(totGP)}">${totGP < 0 ? '(' + _fmF(-totGP) + ')' : _fmF(totGP)}</td>
        <td style="color:${_pc(totGP / totN * 100)}">${_fmFP(totGP / totN * 100)}</td>
        <td class="num" style="color:#e08080">(${_fmF(totOp)})</td>
        <td class="num" style="color:${_cg(totEB)}">${totEB < 0 ? '(' + _fmF(-totEB) + ')' : _fmF(totEB)}</td>
        <td style="color:${_pc(totEB / totN * 100)}">${_fmFP(totEB / totN * 100)}</td>
      </tr></tfoot>
    </table></div>
  </div>

  <!-- Charts Row 1 -->
  <div class="fm-charts-row full">
    <div class="fm-chart-box">
      <div class="fm-title">📈 الإيراد الصافي و EBIT شهرياً (ر.س)</div>
      <div class="fm-chart-wrap tall"><canvas id="fm-chart-rev"></canvas></div>
    </div>
  </div>

  <!-- Charts Row 2 -->
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
    <div class="fm-notice" style="margin-bottom:10px">الأرقام من ERP مباشرة — القيم بين قوسين = قيود عكسية أو تسويات.</div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th>الفئة</th>
        ${_fmHist.map(m => `<th class="num">${m.label}</th>`).join('')}
        <th class="num">متوسط شهري</th><th>% من OpEx</th>
      </tr></thead>
      <tbody>${opexCatRows}</tbody>
      <tfoot><tr style="font-weight:700;background:#0a1828;border-top:2px solid #3a7abf">
        <td>الإجمالي</td>
        ${opexMonthTotals.map(v => `<td class="num" style="color:#e08080">(${_fmF(v)})</td>`).join('')}
        <td class="num" style="color:#e08080">(${_fmF(avgOpex)})</td>
        <td>100%</td>
      </tr></tfoot>
    </table></div>
  </div>

  <!-- Balance Sheet -->
  <div class="fm-section">
    <div class="fm-title">🏦 المركز المالي — ${_fmPartial?.label || _fmHist[n - 1]?.label || 'آخر شهر'}</div>
    <div class="fm-ratio-grid" style="margin-bottom:14px">
      <div class="fm-ratio"><div class="name">ذمم مدينة (AR)</div><div class="value" style="color:#5baef0">${_fmFM(ar)}</div><div class="bench">مستحق من العملاء</div></div>
      <div class="fm-ratio"><div class="name">المخزون (بالتكلفة)</div><div class="value" style="color:#f5a623">${_fmFM(inv)}</div><div class="bench">حـ/10302 · رصيد فعلي</div></div>
      <div class="fm-ratio"><div class="name">ذمم دائنة (AP)</div><div class="value" style="color:#da4a4a">${_fmFM(ap)}</div><div class="bench">مستحق للموردين</div></div>
      <div class="fm-ratio"><div class="name">رأس المال العامل</div><div class="value" style="color:${_cg(wc)}">${_fmFM(wc)}</div><div class="bench">نقدية + AR + مخزون − AP</div></div>
      <div class="fm-ratio"><div class="name">أيام التحصيل (DSO)</div><div class="value" style="color:${dso > 45 ? '#f5a623' : '#4ada8e'}">~${Math.round(dso)} يوم</div><div class="bench">المعيار: 30–45 ${dso > 45 ? '⚠️' : '✅'}</div></div>
      <div class="fm-ratio"><div class="name">تكلفة التمويل الشهرية</div><div class="value" style="color:#da4a4a">${_fmFM(monthlyFin)}</div><div class="bench">متوسط حـ/fin الفعلي</div></div>
    </div>
  </div>

  <!-- Budget Scenarios -->
  <div class="fm-section">
    <div class="fm-title">🎯 الموازنة التقديرية — الأشهر الـ 6 القادمة</div>
    <div class="fm-notice">
      💡 الأساس: صافي ربح الموازنة المحافظة من ERP. السيناريوهات تُعدّل الإيراد بنسبة ثابتة مع تعديل نسبة الهامش.
    </div>
    <div class="fm-sc-wrap">
      <button class="fm-sc-btn cons" data-sc="cons">تحفظي (−20%)</button>
      <button class="fm-sc-btn base active base" data-sc="base">قاعدي</button>
      <button class="fm-sc-btn opt"  data-sc="opt">متفائل (+15%)</button>
    </div>
    <div class="tbl-wrap"><table id="fm-tbl-budget">
      <thead><tr>
        <th>الشهر</th><th class="num">الإيراد المتوقع</th>
        <th class="num">تكلفة مبيعات</th><th class="num">مجمل الربح</th><th>هامش %</th>
        <th class="num">مصروفات</th><th class="num">EBIT</th><th>EBIT %</th>
      </tr></thead>
      <tbody id="fm-tbody-budget"></tbody>
      <tfoot id="fm-tfoot-budget"></tfoot>
    </table></div>
  </div>

  <!-- Full Year Chart -->
  <div class="fm-charts-row full">
    <div class="fm-chart-box">
      <div class="fm-title">📅 المسار الكامل — فعلي + موازنة</div>
      <div class="fm-chart-wrap tall"><canvas id="fm-chart-fullyear"></canvas></div>
    </div>
  </div>

  <!-- Scenarios Chart -->
  <div class="fm-charts-row full">
    <div class="fm-chart-box">
      <div class="fm-title">📊 مقارنة سيناريوهات الموازنة — الإيراد والـ EBIT</div>
      <div class="fm-chart-wrap tall"><canvas id="fm-chart-scenarios"></canvas></div>
    </div>
  </div>

  <!-- Recommendations -->
  <div class="fm-section">
    <div class="fm-title">💡 التوصيات الاستراتيجية</div>
    <div id="fm-recs-live"></div>
  </div>

  <!-- Action Plan -->
  <div class="fm-section">
    <div class="fm-title">🗓️ خطة العمل التنفيذية</div>
    <table>
      <thead><tr><th>#</th><th>الإجراء</th><th>المسؤول</th><th>الموعد</th><th>الأثر المتوقع</th><th>الأولوية</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>مراجعة شروط القروض مع البنوك لإعادة الجدولة</td><td>المدير المالي</td><td>يوليو 2026</td><td style="color:#8aa8cc">توفير 60-80 ألف/شهر</td><td>🔴</td></tr>
        <tr><td>2</td><td>تسقيف ائتماني للعملاء بناءً على السجل</td><td>مدير المبيعات</td><td>يونيو 2026</td><td style="color:#8aa8cc">خفض DSO إلى 40 يوم</td><td>🔴</td></tr>
        <tr><td>3</td><td>نظام مراجعة جودة قبل الشحن</td><td>مدير العمليات</td><td>يوليو 2026</td><td style="color:#8aa8cc">خفض المردودات إلى ≤ 1.5%</td><td>🟠</td></tr>
        <tr><td>4</td><td>توزيع خطة المشتريات على أسابيع الفصل</td><td>مدير المشتريات</td><td>يوليو 2026</td><td style="color:#8aa8cc">تحسين التدفق النقدي</td><td>🟠</td></tr>
        <tr><td>5</td><td>مراجعة جدول الأسعار وسياسة الخصومات</td><td>مدير المبيعات</td><td>أغسطس 2026</td><td style="color:#8aa8cc">الحفاظ على هامش 20%+</td><td>🟡</td></tr>
        <tr><td>6</td><td>تقليص DSO بحوافز الدفع المبكر (1.5% خصم)</td><td>المدير المالي</td><td>يونيو 2026</td><td style="color:#8aa8cc">تحرير ${_fmFM(ar * 0.25)} سيولة</td><td>🔴</td></tr>
        <tr><td>7</td><td>تقييم موردين احتياطيين للأصناف الرئيسية</td><td>مدير المشتريات</td><td>أكتوبر 2026</td><td style="color:#8aa8cc">خفض مخاطر سلسلة التوريد</td><td>🟢</td></tr>
      </tbody>
    </table>
  </div>

  <div style="text-align:left;padding:8px 4px">
    <button onclick="_fmRefresh()" class="btn sm" style="background:#0a2040;color:#5090c0;font-family:Tajawal,sans-serif">↺ تحديث من ERP</button>
    <span id="fm-last-updated" style="font-size:.72rem;color:#5a7a9a;margin-right:10px"></span>
  </div>`;

  // Wire DB selector buttons
  wrap.querySelectorAll('.fm-db-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.db === _fmDb) return;
      _fmDb = btn.dataset.db;
      _fmRefresh();
    });
  });

  // Wire scenario buttons
  wrap.querySelectorAll('.fm-sc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _fmScenario = btn.dataset.sc;
      wrap.querySelectorAll('.fm-sc-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active', btn.dataset.sc);
      _fmBuildBudgetTable();
      if (FM_CHARTS.scenarios) { FM_CHARTS.scenarios.destroy(); delete FM_CHARTS.scenarios; }
      if (FM_CHARTS.fullyear)  { FM_CHARTS.fullyear.destroy();  delete FM_CHARTS.fullyear;  }
      _fmBuildScenariosChart();
      _fmBuildFullYearChart();
    });
  });

  // Build dynamic recommendations
  _fmBuildRecs(wrap, totN, totGP, totOp, totEB, n);

  // Build all charts + budget table
  _fmBuildBudgetTable();
  setTimeout(() => {
    _fmBuildRevenueChart();
    _fmBuildOpexChart();
    _fmBuildMarginChart();
    _fmBuildScenariosChart();
    _fmBuildFullYearChart();
  }, 60);

  const el = document.getElementById('fm-last-updated');
  if (el) el.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-SA');
}

/* ── Refresh ── */
function _fmRefresh() {
  _fmRendered = false;
  Object.values(FM_CHARTS).forEach(c => { try { c.destroy(); } catch (_) {} });
  Object.keys(FM_CHARTS).forEach(k => delete FM_CHARTS[k]);
  renderFinancialModel();
}

/* ── Budget table ── */
function _fmBuildBudgetTable() {
  const tbody = document.getElementById('fm-tbody-budget');
  const tfoot = document.getElementById('fm-tfoot-budget');
  if (!tbody || !_fmFcast.length) return;

  const sc = FM_SCENARIOS[_fmScenario];
  // Derive gross margin from historical average
  const histRows = _fmHist.map(_fmDeriveRow);
  const avgGM = histRows.length
    ? histRows.reduce((s, r) => s + r.gpPct, 0) / histRows.length / 100
    : 0.20;
  const adjGM = avgGM * (sc === FM_SCENARIOS.cons ? 0.85 : sc === FM_SCENARIOS.opt ? 1.15 : 1.0);

  let tN = 0, tC = 0, tGP = 0, tOp = 0, tEB = 0;

  tbody.innerHTML = _fmFcast.map(f => {
    const net  = f.revenue * sc.factor;
    const cogs = net * (1 - adjGM);
    const gp   = net * adjGM;
    const opex = f.opex;
    const eb   = gp - opex;
    tN += net; tC += cogs; tGP += gp; tOp += opex; tEB += eb;
    return `<tr>
      <td>${f.label}</td>
      <td class="num" style="color:${sc.color}">${_fmF(net)}</td>
      <td class="num" style="color:#e08080">(${_fmF(cogs)})</td>
      <td class="num" style="color:#4ada8e">${_fmF(gp)}</td>
      <td style="color:#4ada8e">${_fmFP(adjGM * 100)}</td>
      <td class="num" style="color:#e08080">(${_fmF(opex)})</td>
      <td class="num" style="color:${_cg(eb)}">${eb < 0 ? '(' + _fmF(-eb) + ')' : _fmF(eb)}</td>
      <td style="color:${_pc(net > 0 ? eb / net * 100 : 0)}">${_fmFP(net > 0 ? eb / net * 100 : 0)}</td>
    </tr>`;
  }).join('');

  tfoot.innerHTML = `<tr style="font-weight:700;background:#0a1828;border-top:2px solid ${sc.color}">
    <td>الإجمالي (${_fmFcast.length} أشهر)</td>
    <td class="num" style="color:${sc.color}">${_fmF(tN)}</td>
    <td class="num" style="color:#e08080">(${_fmF(tC)})</td>
    <td class="num" style="color:#4ada8e">${_fmF(tGP)}</td>
    <td style="color:#4ada8e">${_fmFP(adjGM * 100)}</td>
    <td class="num" style="color:#e08080">(${_fmF(tOp)})</td>
    <td class="num" style="color:${_cg(tEB)}">${tEB < 0 ? '(' + _fmF(-tEB) + ')' : _fmF(tEB)}</td>
    <td style="color:${_pc(tN > 0 ? tEB / tN * 100 : 0)}">${_fmFP(tN > 0 ? tEB / tN * 100 : 0)}</td>
  </tr>`;
}

/* ── Chart options base ── */
const _FM_CO = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#7090b0', font: { size: 11, family: 'Tajawal' } } } },
  scales: {
    x: { ticks: { color: '#7090b0', font: { family: 'Tajawal' } }, grid: { color: '#1e3a5f' } },
    y: { ticks: { color: '#7090b0', font: { family: 'Tajawal' } }, grid: { color: '#1e3a5f' } },
  },
};

/* ── Revenue + EBIT chart ── */
function _fmBuildRevenueChart() {
  const rows = _fmHist.map(_fmDeriveRow);
  FM_CHARTS.revenue = new Chart(document.getElementById('fm-chart-rev'), {
    type: 'bar',
    data: {
      labels: _fmHist.map(m => m.label),
      datasets: [
        { label: 'صافي الإيراد',  data: rows.map(r => r.net),  backgroundColor: 'rgba(74,158,218,0.55)', order: 2 },
        { label: 'EBIT', data: rows.map(r => r.eb),
          type: 'line', borderColor: '#4ada8e', borderWidth: 2, pointRadius: 4,
          fill: false, yAxisID: 'y2', order: 1 },
      ],
    },
    options: {
      ..._FM_CO,
      scales: {
        ..._FM_CO.scales,
        y2: { position: 'left', ticks: { color: '#4ada8e', font: { family: 'Tajawal' } }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

/* ── OpEx donut chart ── */
function _fmBuildOpexChart() {
  const totals = FM_OPEX_CATS.map(k =>
    Math.max(0, _fmHist.reduce((s, m) => s + (m[k] || 0), 0))
  );
  const grandTotal = totals.reduce((s, v) => s + v, 0);
  FM_CHARTS.opex = new Chart(document.getElementById('fm-chart-opex'), {
    type: 'doughnut',
    data: {
      labels: FM_OPEX_CATS.map(k => FM_CAT_LABELS[k]),
      datasets: [{
        data: totals,
        backgroundColor: FM_OPEX_CATS.map(k => FM_CAT_COLORS[k]),
        borderColor: '#0f2035', borderWidth: 2, hoverOffset: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#a0b8c8', font: { size: 10, family: 'Tajawal' }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: i => {
          const pct = grandTotal > 0 ? (i.raw / grandTotal * 100).toFixed(1) : 0;
          return `${i.label}: ${Math.round(i.raw).toLocaleString('ar-SA')} ر.س (${pct}%)`;
        } } },
      },
    },
  });
}

/* ── Margins chart ── */
function _fmBuildMarginChart() {
  const rows = _fmHist.map(_fmDeriveRow);
  FM_CHARTS.margin = new Chart(document.getElementById('fm-chart-margin'), {
    type: 'bar',
    data: {
      labels: _fmHist.map(m => m.label),
      datasets: [
        { label: 'هامش مجمل %', data: rows.map(r => r.gpPct), backgroundColor: 'rgba(74,218,142,0.55)' },
        { label: 'هامش EBIT %', data: rows.map(r => r.ebPct), backgroundColor: 'rgba(74,158,218,0.5)'  },
      ],
    },
    options: _FM_CO,
  });
}

/* ── Scenarios comparison chart ── */
function _fmBuildScenariosChart() {
  const datasets = [];
  Object.entries(FM_SCENARIOS).forEach(([key, sc]) => {
    const histRows = _fmHist.map(_fmDeriveRow);
    const avgGM = histRows.length
      ? histRows.reduce((s, r) => s + r.gpPct, 0) / histRows.length / 100 : 0.20;
    const adjGM = avgGM * (key === 'cons' ? 0.85 : key === 'opt' ? 1.15 : 1.0);

    const nets  = _fmFcast.map(f => f.revenue * sc.factor);
    const ebits = _fmFcast.map(f => {
      const net = f.revenue * sc.factor;
      return net * adjGM - f.opex;
    });
    datasets.push({ label: 'إيراد ' + sc.label, data: nets,  borderColor: sc.color, backgroundColor: sc.color + '25', type: 'line', borderWidth: 2, fill: true, tension: 0.3 });
    datasets.push({ label: 'EBIT '  + sc.label, data: ebits, borderColor: sc.color, borderDash: [5, 3], type: 'line', borderWidth: 1.5, fill: false, tension: 0.3 });
  });
  FM_CHARTS.scenarios = new Chart(document.getElementById('fm-chart-scenarios'), {
    type: 'bar', data: { labels: _fmFcast.map(m => m.label), datasets },
    options: _FM_CO,
  });
}

/* ── Full year chart (actual + forecast) ── */
function _fmBuildFullYearChart() {
  const sc = FM_SCENARIOS[_fmScenario];
  const histRows = _fmHist.map(_fmDeriveRow);
  const avgGM = histRows.length
    ? histRows.reduce((s, r) => s + r.gpPct, 0) / histRows.length / 100 : 0.20;
  const adjGM = avgGM * (sc === FM_SCENARIOS.cons ? 0.85 : sc === FM_SCENARIOS.opt ? 1.15 : 1.0);

  const histNets  = histRows.map(r => r.net);
  const fcastNets = _fmFcast.map(f => f.revenue * sc.factor);
  const allLabels = [..._fmHist.map(m => m.label), ..._fmFcast.map(m => m.label)];

  FM_CHARTS.fullyear = new Chart(document.getElementById('fm-chart-fullyear'), {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        { label: 'فعلي', data: [...histNets, ...Array(_fmFcast.length).fill(null)],
          borderColor: '#4a9eda', backgroundColor: 'rgba(74,158,218,0.12)',
          fill: true, tension: 0.3, borderWidth: 2, pointRadius: 5 },
        { label: 'مقدر (' + sc.label + ')', data: [...Array(_fmHist.length).fill(null), ...fcastNets],
          borderColor: sc.color, borderDash: [6, 4], fill: false, tension: 0.3, borderWidth: 2, pointRadius: 4 },
      ],
    },
    options: _FM_CO,
  });
}

/* ── Dynamic recommendations ── */
function _fmBuildRecs(wrap, totN, totGP, totOp, totEB, n) {
  const el = document.getElementById('fm-recs-live');
  if (!el) return;

  const gm = totN > 0 ? totGP / totN * 100 : 0;
  const em = totN > 0 ? totEB / totN * 100 : 0;
  const avgMon = totN / (n || 1);
  const ar  = _fmMeta.currentAR;
  const dso = _fmMeta.avgDso;
  const fin = _fmAvg(_fmHist.filter(m => (m.fin || 0) > 0).map(m => m.fin || 0));

  const recs = [
    fin > 150000 ? {
      cls: '#da4a4a', pri: '● عاجل',
      ttl: 'تخفيض تكلفة التمويل',
      bdy: `الفوائد البنكية ~${_fmF(fin)} ر.س/شهر (${_fmFM(fin * 12)} سنوياً). إعادة هيكلة القروض وتمديد الآجال تُضيف مباشرةً للربح.`,
    } : null,
    dso > 45 ? {
      cls: '#da4a4a', pri: '● عاجل',
      ttl: 'تقليص DSO إلى 40 يوماً',
      bdy: `${Math.round(dso)} يوم تحصيل مقابل المعيار 30–45. حوافز الدفع المبكر وتشديد حدود الائتمان تُحرّر ~${_fmFM(ar * 0.25)} سيولة.`,
    } : null,
    gm < 15 ? {
      cls: '#da4a4a', pri: '● عاجل',
      ttl: 'رفع هامش المجمل فوق 15%',
      bdy: `الهامش الحالي ${gm.toFixed(1)}% أقل من المعيار. مراجعة تسعير المنتجات وتجنب الخصومات غير المدروسة.`,
    } : {
      cls: '#4ada8e', pri: '● إيجابي',
      ttl: `الحفاظ على هامش المجمل ${gm.toFixed(1)}%`,
      bdy: `الهامش في نطاق جيد. ضبط الأسعار والتفاوض مع الموردين يمكن رفعه نحو 20%+ خصوصاً مع توقعات ارتفاع الأسعار.`,
    },
    em < 5 ? {
      cls: '#f5a623', pri: '● مهم',
      ttl: 'هامش EBIT منخفض',
      bdy: `EBIT ${em.toFixed(1)}% — يكشف أن المصروفات الثابتة ثقيلة نسبةً للإيراد. كل زيادة 1M في الإيراد تُضيف ~${_fmF(totGP / totN * 1e6)} ر.س للربح (leverage تشغيلي).`,
    } : null,
    {
      cls: '#4ada8e', pri: '● استراتيجي',
      ttl: 'استغلال المخزون المشترى بأسعار منخفضة',
      bdy: `المخزون ${_fmFM(_fmMeta.currentInventory)} مشترى بأسعار تنافسية. تسريع الدوران مع ارتفاع الأسعار المتوقع يحقق هوامش استثنائية.`,
    },
    {
      cls: '#f5a623', pri: '● مهم',
      ttl: 'توزيع المشتريات الموسمية',
      bdy: 'التركيز في شهر واحد يضغط التدفق النقدي. التوزيع الأسبوعي/الشهري يُحسّن إدارة رأس المال ويُقلل مخاطر الأسعار.',
    },
  ].filter(Boolean).slice(0, 6);

  el.innerHTML = `<div class="fm-rec-grid">
    ${recs.map(r => `<div class="fm-rec" style="--fmrc:${r.cls}">
      <div class="pri" style="color:${r.cls}">${r.pri}</div>
      <div class="ttl">${r.ttl}</div>
      <div class="bdy">${r.bdy}</div>
    </div>`).join('')}
  </div>`;
}

/* ── CSS injection ── */
function _fmInjectCSS() {
  if (document.getElementById('fm-css')) return;
  const s = document.createElement('style'); s.id = 'fm-css';
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
    .fm-sc-wrap{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
    .fm-sc-btn{padding:6px 16px;border-radius:6px;border:1px solid #1e3a5f;cursor:pointer;font-size:.8rem;color:#7090b0;background:#0a1e30;transition:all .2s;font-family:Tajawal,sans-serif}
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
    .fm-db-bar{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:10px 16px;background:#0a1e30;border:1px solid #1e3a5f;border-radius:8px;flex-wrap:wrap}
    .fm-db-label{color:#7090b0;font-size:.85rem;white-space:nowrap}
    .fm-db-group{display:flex;gap:3px}
    .fm-db-btn{padding:5px 16px;border-radius:6px;border:1px solid #1e3a5f;cursor:pointer;font-size:.84rem;color:#7090b0;background:#0f2035;transition:all .15s;font-family:Tajawal,sans-serif}
    .fm-db-btn.active{border-color:#d4a017;color:#d4a017;background:#2a1e05;font-weight:700}
    .fm-db-btn:hover:not(.active){color:#c8d8e8;border-color:#3a6a9f}
    .fm-db-name{color:#d4a017;font-size:.9rem;font-weight:700;margin-right:auto}
  `;
  document.head.appendChild(s);
}
// ═══════════════════════════════════════════════════════════════════════
