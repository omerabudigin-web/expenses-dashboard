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
