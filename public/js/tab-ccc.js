// ── دورة التحويل النقدي CCC — Tab ────────────────────────────────────────────
// يعرض DSO/DIO/DPO/CCC لأبعاد ووسام جنباً إلى جنب — تحديث كل 5 دقائق

let _cccData     = null;
let _cccTimer    = null;
let _cccRendered = false;
let _cccCountdown = 0;
const CCC_REFRESH_SEC = 300; // 5 min — period metric, no need for 1-min cycle

function _cccIsActive() { return !!document.querySelector('.tab.active[data-tab="ccc"]'); }
function _cccStopTimer() { if (_cccTimer) { clearInterval(_cccTimer); _cccTimer = null; } }

const CCC_FMT = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const CCC_FMT0 = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 });
const cccFmtN  = v => (v == null || !isFinite(v)) ? '—' : CCC_FMT.format(v);
const cccFmtSAR = v => CCC_FMT0.format(Math.round(+v || 0));

/* ── Entry point — يُستدعى عند كل ضغطة على التاب ── */
function renderCCCTab() {
  const wrap = document.getElementById('tab-ccc');
  if (!wrap) return;

  if (!_cccRendered) {
    _cccRendered = true;
    wrap.innerHTML = _cccBuildShell();
    _cccWireControls(wrap);
    _cccStartTimer();
  }

  _cccLoad();
}

/* ── HTML shell ─────────────────────────────────────────────────────────────── */
function _cccBuildShell() {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="ccc-header">
    <div>
      <div class="ccc-title">🔄 دورة التحويل النقدي (CCC)</div>
      <div class="ccc-sub">DSO · DIO · DPO · CCC — مقارنة أبعاد الحديد ووسام الفولاذ · تحديث تلقائي كل 5 دقائق</div>
    </div>
    <div id="ccc-status" class="ccc-status">جارٍ التحميل…</div>
  </div>

  <div class="ccc-bar">
    <label class="ccc-lbl">من:</label>
    <input id="ccc-from" type="date" class="ccc-inp" value="2025-10-01">
    <label class="ccc-lbl">إلى:</label>
    <input id="ccc-to"   type="date" class="ccc-inp" value="${today}">
    <button id="ccc-refresh" class="ccc-btn">↺ تحديث</button>
  </div>

  <!-- KPI cards — both companies side by side -->
  <div id="ccc-kpis" class="ccc-kpis-grid"></div>

  <!-- Dynamic insights & recommendations — re-computed on every refresh -->
  <div id="ccc-insights" class="ccc-section"></div>

  <!-- Summary comparison table -->
  <div id="ccc-compare" class="ccc-section"></div>

  <!-- Components table -->
  <div id="ccc-components" class="ccc-section"></div>

  <!-- Section 1: Explain indicators (static, collapsible) -->
  <div class="ccc-section">
    <details class="ccc-explain">
      <summary class="ccc-sec-title ccc-explain-summary">▶ ما معنى هذه المؤشرات؟</summary>
      <div class="ccc-explain-body">
        <div class="ccc-explain-row">
          <div class="ccc-explain-badge" style="color:#da9a4a">⏱ DSO</div>
          <div>
            <div class="ccc-explain-term">أيام التحصيل — Days Sales Outstanding</div>
            <div class="ccc-explain-def">متوسط الأيام التي يستغرقها العميل ليدفع فاتورته. <strong>الأقل أفضل.</strong></div>
            <div class="ccc-explain-formula">= متوسط المدينين ÷ صافي المبيعات × أيام الفترة</div>
          </div>
        </div>
        <div class="ccc-explain-row">
          <div class="ccc-explain-badge" style="color:#4a9eda">📦 DIO</div>
          <div>
            <div class="ccc-explain-term">أيام المخزون — Days Inventory Outstanding</div>
            <div class="ccc-explain-def">متوسط بقاء البضاعة في المستودع قبل بيعها. <strong>الأقل أفضل</strong> — غير أن الانخفاض الحاد قد يشير إلى نفاد مخزون.</div>
            <div class="ccc-explain-formula">= متوسط المخزون ÷ تكلفة المبيعات × أيام الفترة</div>
          </div>
        </div>
        <div class="ccc-explain-row">
          <div class="ccc-explain-badge" style="color:#4ada8e">💳 DPO</div>
          <div>
            <div class="ccc-explain-term">أيام السداد — Days Payable Outstanding</div>
            <div class="ccc-explain-def">متوسط الأيام حتى تسدّد للموردين. <strong>الأعلى أفضل</strong> — تمويل مجاني من الموردين، ما لم يضرّ بالعلاقة.</div>
            <div class="ccc-explain-formula">= متوسط الدائنين ÷ صافي المشتريات × أيام الفترة</div>
          </div>
        </div>
        <div class="ccc-explain-row">
          <div class="ccc-explain-badge" style="color:#c8a040">🔄 CCC</div>
          <div>
            <div class="ccc-explain-term">دورة التحويل النقدي — Cash Conversion Cycle</div>
            <div class="ccc-explain-def">المدة التي يبقى فيها كل ريال <em>محبوساً</em> في العمليات قبل أن يعود سائلاً. <strong>الأقصر أفضل وأقلّ حاجةً للتمويل الخارجي.</strong></div>
            <div class="ccc-explain-formula">= DSO + DIO − DPO</div>
          </div>
        </div>
      </div>
    </details>
  </div>

  <!-- Section 2: Methodology notes (static) -->
  <div class="ccc-section">
    <div class="ccc-sec-title">📋 إيضاحات المنهجية</div>
    <ul class="ccc-method-list">
      <li>المتوسطات = (رصيد افتتاحي الفترة + رصيد ختامي) ÷ 2.</li>
      <li>المدينون <strong>صافٍ</strong> بعد مقاصّة الكيانات المزدوجة (مورّد وعميل بنفس الرقم الضريبي).</li>
      <li><strong>DPO الرسمي</strong> يستخدم موردي السوق التجاريين فقط (أرصدة دائنة فقط، مستبعد: كيانات بينية + دفعات مقدمة). DPO الثانوي يضيف الكيانات البينية/المزدوجة — للشفافية فقط.</li>
      <li>المشتريات <strong>شاملة الضريبة</strong> لتجانس الأساس مع رصيد الدائنين الذي يشمل الضريبة هو الآخر.</li>
      <li>المقاصّة بين حسابي العميل/المورّد للكيان نفسه مطبّقة على المدينين وعلى تصنيف الدائنين معاً. التمويلات البنكية خارج ح.77/78 أصلاً.</li>
      <li>الفترة ممتدة حتى تاريخ اليوم (محدّثة حياً)؛ كلّما طالت قلّت دقة متوسط (افتتاحي+ختامي)÷2.</li>
      <li>جميع الأرقام مُطابَقة مع ميزان المراجعة (A037) — انظر قسم التسوية أدناه.</li>
    </ul>
  </div>

  <!-- لماذا رقمان لـ DPO؟ -->
  <div id="ccc-dpo-explain" class="ccc-section"></div>

  <!-- Reconciliation -->
  <div id="ccc-recon" class="ccc-section"></div>

  <div class="ccc-footer">إعداد وتقديم: عمر أبو دقن — خبير مالي وإداري</div>
  `;
}

/* ── Wire controls ───────────────────────────────────────────────────────────── */
function _cccWireControls(wrap) {
  wrap.querySelector('#ccc-refresh')?.addEventListener('click', _cccLoad);
  ['ccc-from', 'ccc-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _cccLoad);
  });
}

/* ── Timer (own-API countdown, like aging tab) ───────────────────────────────── */
function _cccStartTimer() {
  _cccStopTimer();
  _cccCountdown = CCC_REFRESH_SEC;
  _cccTimer = setInterval(() => {
    if (!_cccIsActive()) { _cccStopTimer(); return; }
    _cccCountdown--;
    if (_cccCountdown > 0) {
      _cccUpdateStatus();
    } else {
      _cccCountdown = CCC_REFRESH_SEC;
      _cccLoad();
    }
  }, 1000);
}

function _cccUpdateStatus(loading) {
  const el = document.getElementById('ccc-status');
  if (!el) return;
  if (loading) {
    el.textContent = '⏳ جارٍ الحساب…';
    el.style.color = '#a87d00';
    return;
  }
  if (!_cccData) return;
  const from = document.getElementById('ccc-from')?.value || '';
  const to   = document.getElementById('ccc-to')?.value   || '';
  el.textContent = `✅ ${from} ← ${to} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_cccCountdown}ث`;
  el.style.color = '#1a7a3c';
}

/* ── Fetch & render ─────────────────────────────────────────────────────────── */
async function _cccLoad() {
  _cccUpdateStatus(true);
  const from = document.getElementById('ccc-from')?.value || '2025-10-01';
  const to   = document.getElementById('ccc-to')?.value   || new Date().toISOString().slice(0, 10);

  try {
    const url  = `/api/ccc?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const data = await fetch(url).then(r => r.json());
    if (data.error) throw new Error(data.error);
    _cccData = data;
    _cccCountdown = CCC_REFRESH_SEC; // reset after successful load
    _cccRender(data);
    _cccUpdateStatus(false);
  } catch (err) {
    const el = document.getElementById('ccc-status');
    if (el) { el.textContent = '❌ خطأ: ' + err.message; el.style.color = '#da4a4a'; }
  }
}

/* ── Color helpers ───────────────────────────────────────────────────────────── */
function _cccDsoColor(v) {
  if (v == null) return '#5a7a9a';
  return v < 30 ? '#4ada8e' : v < 60 ? '#da9a4a' : '#da4a4a';
}
function _cccDioColor(v) {
  if (v == null) return '#5a7a9a';
  return v < 30 ? '#4ada8e' : v < 60 ? '#da9a4a' : '#da4a4a';
}
function _cccDpoColor(v) {
  if (v == null) return '#5a7a9a';
  // Higher DPO = better (more time to pay)
  return v > 30 ? '#4ada8e' : v > 15 ? '#da9a4a' : '#da4a4a';
}
function _cccCccColor(v) {
  if (v == null) return '#5a7a9a';
  return v < 30 ? '#4ada8e' : v < 60 ? '#da9a4a' : '#da4a4a';
}

/* ── Render all sections ─────────────────────────────────────────────────────── */
function _cccRender(data) {
  const [c1, c2] = data.companies;
  _cccRenderKPIs(c1, c2);
  _cccRenderInsights(c1, c2);
  _cccRenderCompare(c1, c2);
  _cccRenderComponents(c1, c2);
  _cccRenderDpoExplain(c1, c2);
  _cccRenderRecon(c1, c2);
}

/* ── KPI cards ───────────────────────────────────────────────────────────────── */
function _cccRenderKPIs(c1, c2) {
  const el = document.getElementById('ccc-kpis');
  if (!el) return;

  const label1 = _cccDbLabel(c1.db);
  const label2 = _cccDbLabel(c2.db);

  // Helper: build one side of a KPI card
  const side = (co, key, colorFn, secKey, secLabel) => {
    const v    = co.metrics[key];
    const col  = colorFn(v);
    const vSec = secKey ? co.metrics[secKey] : null;
    const secHtml = (secKey && vSec !== null && vSec !== undefined)
      ? `<div class="ccc-kpi-secondary">${secLabel}: ${cccFmtN(vSec)} ي</div>`
      : '';
    return `
      <div class="ccc-kpi-co-name">${_cccDbLabel(co.db)}</div>
      <div class="ccc-kpi-val" style="color:${col}">${cccFmtN(v)} <span class="ccc-kpi-unit">يوم</span></div>
      ${secHtml}`;
  };

  const kpis = [
    { key:'dso', label:'أيام التحصيل DSO', colorFn:_cccDsoColor, hint:'↓ أفضل' },
    { key:'dio', label:'أيام المخزون DIO',  colorFn:_cccDioColor, hint:'↓ أفضل' },
    {
      key:'dpo', label:'أيام السداد DPO', colorFn:_cccDpoColor, hint:'↑ أفضل — تجاري فقط',
      secKey:'dpoIncl', secLabel:'+ بيني',
    },
    {
      key:'ccc', label:'دورة التحويل CCC', colorFn:_cccCccColor, hint:'↓ أفضل — رسمية',
      secKey:'cccIncl', secLabel:'شامل بيني',
    },
  ];

  el.innerHTML = kpis.map(k => {
    const col1 = k.colorFn(c1.metrics[k.key]);
    return `
    <div class="ccc-kpi-card" style="--accent:${col1}">
      <div class="ccc-kpi-label">${k.label}</div>
      <div class="ccc-kpi-hint">${k.hint}</div>
      <div class="ccc-kpi-companies">
        <div class="ccc-kpi-company">${side(c1, k.key, k.colorFn, k.secKey, k.secLabel)}</div>
        <div class="ccc-kpi-divider"></div>
        <div class="ccc-kpi-company">${side(c2, k.key, k.colorFn, k.secKey, k.secLabel)}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── Comparison table ────────────────────────────────────────────────────────── */
function _cccRenderCompare(c1, c2) {
  const el = document.getElementById('ccc-compare');
  if (!el) return;
  const l1 = _cccDbLabel(c1.db), l2 = _cccDbLabel(c2.db);
  const m1 = c1.metrics, m2 = c2.metrics;
  const days = c1.days;

  const row = (label, v1, v2, colorFn, hint, higherBetter, bold, secondary) => {
    const col1 = colorFn(v1), col2 = colorFn(v2);
    let winner = '—';
    if (v1 != null && v2 != null) winner = higherBetter ? (v1 >= v2 ? l1 : l2) : (v1 <= v2 ? l1 : l2);
    const dimStyle = secondary ? 'opacity:.65;' : '';
    const fw = bold ? 'font-weight:700;' : '';
    const bt = bold ? '2px solid #1e3a5f' : secondary ? '1px dashed #0d2030' : '1px solid #0d1e2e';
    return `<tr style="${fw}${dimStyle}border-top:${bt}">
      <td style="color:${secondary?'#5a7a9a':'#c0d0e0'};font-size:${secondary?'.78rem':'.84rem'}">${label}</td>
      <td class="num" style="color:${col1}">${cccFmtN(v1)} يوم</td>
      <td class="num" style="color:${col2}">${cccFmtN(v2)} يوم</td>
      <td style="color:#4a9eda;font-size:.80rem;text-align:center">${winner}</td>
      <td style="color:#5a7a9a;font-size:.75rem">${hint}</td>
    </tr>`;
  };

  el.innerHTML = `
  <div class="ccc-sec-title">📊 مقارنة المؤشرات — ${days} يوماً</div>
  <div style="overflow-x:auto">
  <table class="ccc-tbl">
    <thead><tr>
      <th>المؤشر</th><th>${l1}</th><th>${l2}</th><th>الأفضل</th><th>التفسير</th>
    </tr></thead>
    <tbody>
    ${row('⏱ أيام التحصيل (DSO)',           m1.dso,     m2.dso,     _cccDsoColor, 'المدينون ÷ مبيعات/يوم',         false, false, false)}
    ${row('📦 أيام المخزون (DIO)',            m1.dio,     m2.dio,     _cccDioColor, 'المخزون ÷ تكلفة/يوم',            false, false, false)}
    ${row('💳 DPO الرسمي — تجاري فقط ★',     m1.dpo,     m2.dpo,     _cccDpoColor, 'موردو السوق الفعليون فقط',       true,  false, false)}
    ${row('💳 DPO شامل البيني (ثانوي)',        m1.dpoIncl, m2.dpoIncl, _cccDpoColor, 'يضاف صافي الكيانات المزدوجة',   true,  false, true)}
    ${row('🔄 CCC الرسمية — تجاري فقط ★',    m1.ccc,     m2.ccc,     _cccCccColor, 'DSO + DIO − DPO الرسمي',         false, true,  false)}
    ${row('🔄 CCC شامل البيني (ثانوية)',       m1.cccIncl, m2.cccIncl, _cccCccColor, 'DSO + DIO − DPO شامل البيني',   false, false, true)}
    </tbody>
  </table>
  </div>
  <div class="ccc-note" style="border-color:#1e3a5f55;color:#4a6a7a">
    ★ المؤشر الرسمي = موردو السوق التجاريون فقط (مستبعد: الكيانات البينية والدفعات المقدمة). المؤشر الثانوي للشفافية فقط.
  </div>`;
}

/* ── Components (raw numbers) ────────────────────────────────────────────────── */
function _cccRenderComponents(c1, c2) {
  const el = document.getElementById('ccc-components');
  if (!el) return;
  const l1 = _cccDbLabel(c1.db), l2 = _cccDbLabel(c2.db);
  const p1 = c1.components, p2 = c2.components;

  const r2 = (label, v1, v2, extra='', dim=false) => {
    const clr = dim ? 'color:#5a7a9a' : 'color:#a0c8e8';
    const lc  = dim ? 'color:#5a8a9a;font-size:.79rem' : 'color:#c0d0e0;font-size:.85rem';
    return `<tr>
      <td style="${lc}">${label}</td>
      <td class="num" style="${clr}">${cccFmtSAR(v1)} ر.س</td>
      <td class="num" style="${clr}">${cccFmtSAR(v2)} ر.س</td>
      ${extra ? `<td style="color:#5a7a9a;font-size:.75rem">${extra}</td>` : '<td></td>'}
    </tr>`;
  };
  const sep = () => `<tr style="background:#091520"><td colspan="4" style="height:1px"></td></tr>`;
  const hdr = (txt) => `<tr><td colspan="4" style="color:#3a6a8a;font-size:.74rem;padding:5px 12px 2px;font-style:italic">${txt}</td></tr>`;

  el.innerHTML = `
  <div class="ccc-sec-title">🔢 المكوّنات الخام — كل المبالغ بالريال السعودي</div>
  <div style="overflow-x:auto">
  <table class="ccc-tbl">
    <thead><tr><th>البند</th><th>${l1}</th><th>${l2}</th><th>ملاحظة</th></tr></thead>
    <tbody>
    ${r2('💰 صافي المبيعات (بدون ضريبة)',  p1.netSales,  p2.netSales,  'من قيود JV بدون ضريبة')}
    ${r2('📉 تكلفة المبيعات (COGS)',        p1.cogs,      p2.cogs,      'ح. COGS')}
    ${r2('🛒 صافي المشتريات (شامل ضريبة)', p1.purchases, p2.purchases, 'فواتير شراء − مردودات، شامل ضريبة')}
    ${sep()}
    ${r2('↕ رصيد المدينين الافتتاحي', p1.arOpen,  p2.arOpen,  '', true)}
    ${r2('↕ رصيد المدينين الختامي',   p1.arClose, p2.arClose, '', true)}
    ${r2('👤 متوسط المدينين (بعد المقاصة)', p1.avgAR, p2.avgAR, '(افتتاحي+ختامي)÷2، بعد مقاصة العملاء/الموردين')}
    ${sep()}
    ${r2('↕ رصيد المخزون الافتتاحي',  p1.invOpen,  p2.invOpen,  '', true)}
    ${r2('↕ رصيد المخزون الختامي',    p1.invClose, p2.invClose, '', true)}
    ${r2('📦 متوسط المخزون',           p1.avgInv,   p2.avgInv,   'ح. بضاعة + بضاعة في الطريق')}
    ${sep()}
    ${hdr('الدائنون — تفصيل الأرصدة')}
    ${r2('الدائنون الكامل — افتتاحي',    p1.apOpen,  p2.apOpen,  'ح.77+78 كامل', true)}
    ${r2('الدائنون الكامل — ختامي',      p1.apClose, p2.apClose, 'ح.77+78 كامل', true)}
    ${r2('  ↳ منه تجاري — افتتاحي',    p1.tradeOpen,  p2.tradeOpen,  'موردو سوق فقط، أرصدة دائنة', true)}
    ${r2('  ↳ منه تجاري — ختامي',      p1.tradeClose, p2.tradeClose, 'موردو سوق فقط، أرصدة دائنة', true)}
    ${r2('  ↳ منه بيني/مزدوج — افتتاحي', p1.dualOpen,  p2.dualOpen,  `${p1.dualCount}/${p2.dualCount} كيان`, true)}
    ${r2('  ↳ منه بيني/مزدوج — ختامي',   p1.dualClose, p2.dualClose, 'أرصدة دائنة فقط',             true)}
    ${r2('  ↳ دفعات مقدمة (مدينة)',       p1.advancesClose, p2.advancesClose, 'أرصدة سالبة = دفع مسبق',  true)}
    ${r2('🏢 متوسط تجاري فقط ★ (لـ DPO الرسمي)',  p1.avgAPTrade, p2.avgAPTrade, '(تجاري افتتاحي + ختامي)÷2')}
    ${r2('🏢 متوسط شامل البيني (لـ DPO الثانوي)', p1.avgAPIncl,  p2.avgAPIncl,  '(تجاري + بيني افتتاحي + ختامي)÷2')}
    </tbody>
  </table>
  </div>`;
}

/* ── لماذا رقمان لـ DPO؟ ─────────────────────────────────────────────────────── */
function _cccRenderDpoExplain(c1, c2) {
  const el = document.getElementById('ccc-dpo-explain');
  if (!el) return;
  const l1 = _cccDbLabel(c1.db);
  const p1 = c1.components, m1 = c1.metrics;
  el.innerHTML = `
  <details class="ccc-explain" open>
    <summary class="ccc-sec-title ccc-explain-summary">▶ لماذا رقمان لـ DPO؟</summary>
    <div class="ccc-explain-body" style="gap:10px">
      <p class="ccc-dpo-p">
        DPO يقيس متوسط مدة سدادك لموردي السوق. سابقاً كان يُحسب على رصيد الدائنين الكامل،
        لكنه يخلط بنوداً ليست ائتمان موردين:
      </p>
      <ul class="ccc-method-list" style="margin:0 0 6px">
        <li><strong>طرف ذو علاقة (كيانات بينية/مزدوجة):</strong> تمويل بيني مع شركة شقيقة أو عميل-مورد مزدوج، معظمه قيود يدوية لا فواتير تجارية — ليس ائتماناً من موردي السوق.</li>
        <li><strong>دفعات مقدمة وأرصدة مدينة:</strong> ليست التزام سداد للموردين — بل دفع مسبق أو رصيد لصالح الشركة.</li>
      </ul>
      <p class="ccc-dpo-p">
        خلط هذه البنود يضخّم DPO صناعياً ويُقصِّر دورة التحويل النقدي بشكل مضلِّل.
      </p>
      <div class="ccc-dpo-def-grid">
        <div class="ccc-dpo-def-card" style="border-color:#4ada8e55">
          <div class="ccc-dpo-def-title" style="color:#4ada8e">💳 DPO الرسمي (تجاري فقط) ★</div>
          <div class="ccc-dpo-def-body">يقيس انضباطك مع موردي السوق الحقيقيين — المؤشر الأنقى لكفاءة رأس المال العامل.</div>
        </div>
        <div class="ccc-dpo-def-card" style="border-color:#4a9eda55">
          <div class="ccc-dpo-def-title" style="color:#4a9eda">🔄 CCC شامل البيني (ثانوي)</div>
          <div class="ccc-dpo-def-body">يضيف صافي الكيانات المزدوجة/البينية، لمن يريد رؤية أثر التمويل البيني في الدورة.</div>
        </div>
      </div>
      <div class="ccc-dpo-result">
        <strong>النتيجة لـ ${l1}:</strong>
        DPO الحقيقي مع موردي السوق = <strong style="color:#da4a4a">${cccFmtN(m1.dpo)} يوماً</strong>
        (مقابل ${cccFmtN(m1.dpoIncl)} يوماً عند إضافة البيني)،
        وCCC الفعلية = <strong style="color:#da9a4a">${cccFmtN(m1.ccc)} يوماً</strong> —
        أي أن ${l1} لا تموّل نفسها بآجال الموردين (قصيرة)، بل بالبنوك والتمويل البيني.
        وهذا يؤكد أن المشكلة هيكلية/تمويلية لا في كفاءة رأس المال العامل.
      </div>
      <div class="ccc-dpo-method-note">
        📌 المقاصّة بين حسابي العميل/المورّد للكيان نفسه (نفس الرقم الضريبي) مطبّقة على DSO وAPTrade معاً.
        التمويلات البنكية خارج ح.77/78 أصلاً — لا تدخل في هذا الحساب (انظر لوحة تركيبة الالتزامات).
      </div>
    </div>
  </details>`;
}

/* ── Reconciliation ─────────────────────────────────────────────────────────── */
function _cccRenderRecon(c1, c2) {
  const el = document.getElementById('ccc-recon');
  if (!el) return;
  const l1 = _cccDbLabel(c1.db), l2 = _cccDbLabel(c2.db);
  const r1 = c1.reconciliation, r2 = c2.reconciliation;

  const row = (lbl, v1, v2, cls='') => `<tr class="${cls}">
    <td style="color:#c0d0e0;font-size:.82rem">${lbl}</td>
    <td class="num" style="color:#8aaac8;font-size:.82rem">${cccFmtSAR(v1)} ر.س</td>
    <td class="num" style="color:#8aaac8;font-size:.82rem">${cccFmtSAR(v2)} ر.س</td>
  </tr>`;

  const p1 = c1.components, p2 = c2.components;
  el.innerHTML = `
  <div class="ccc-sec-title">🔍 تسوية مع ميزان المراجعة (A037)</div>
  <div style="overflow-x:auto">
  <table class="ccc-tbl">
    <thead><tr><th>البند</th><th>${l1}</th><th>${l2}</th></tr></thead>
    <tbody>
    ${row('إيرادات المبيعات الإجمالية (JV)',    r1.grossSales,    r2.grossSales)}
    ${row('مردودات المبيعات (JV)',               r1.salesReturns,  r2.salesReturns)}
    ${row('صافي المبيعات المُعتمَد',             p1.netSales,      p2.netSales,      'ccc-recon-total')}
    <tr><td colspan="3" style="height:4px"></td></tr>
    ${row('فواتير الشراء — الإجمالي (PI)',       r1.purchasesGross, r2.purchasesGross)}
    ${row('مردودات المشتريات (PR)',              r1.purchaseReturns, r2.purchaseReturns)}
    ${row('صافي المشتريات المُعتمَد',            p1.purchases,     p2.purchases,     'ccc-recon-total')}
    <tr><td colspan="3" style="height:4px"></td></tr>
    ${row('رصيد المدينين الخام (ح.47+48)',       r1.arRaw,         r2.arRaw)}
    ${row(`خصم المقاصة (${r1.arNettingCount}/${r2.arNettingCount} كيان)`, r1.arNettingOffset, r2.arNettingOffset)}
    ${row('رصيد المدينين بعد المقاصة',           p1.arClose,       p2.arClose,       'ccc-recon-total')}
    <tr><td colspan="3" style="height:4px"></td></tr>
    ${row('رصيد المخزون (ح.بضاعة+عبور)',         r1.invRaw,        r2.invRaw,        'ccc-recon-total')}
    <tr><td colspan="3" style="height:4px"></td></tr>
    ${row('رصيد الدائنين الكامل (ح.77+78) — ختامي',  r1.apRaw,  r2.apRaw)}
    ${row('  ↳ منه تجاري صافٍ (أرصدة دائنة فقط)',     p1.tradeClose, p2.tradeClose)}
    ${row(`  ↳ منه بيني/مزدوج (${p1.dualCount}/${p2.dualCount} كيان)`, p1.dualClose,  p2.dualClose)}
    ${row('  ↳ دفعات مقدمة (أرصدة مدينة)',            p1.advancesClose, p2.advancesClose)}
    ${row('متوسط دائنين تجاري ★ (مقام DPO الرسمي)',   p1.avgAPTrade, p2.avgAPTrade,  'ccc-recon-total')}
    ${row('متوسط دائنين شامل البيني (مقام DPO الثانوي)', p1.avgAPIncl, p2.avgAPIncl, 'ccc-recon-total')}
    </tbody>
  </table>
  </div>`;
}

/* ── Insights & recommendations (dynamic, re-computed on each refresh) ────────── */
function _cccRenderInsights(c1, c2) {
  const el = document.getElementById('ccc-insights');
  if (!el) return;
  el.innerHTML = `
  <div class="ccc-sec-title">💡 قراءة وتوصيات — محدّثة مع كل تحديث</div>
  <div class="ccc-insights-grid">
    ${_cccInsightCard(c1, c2)}
    ${_cccInsightCard(c2, c1)}
  </div>`;
}

function _cccInsightCard(c, peer) {
  const { dso, dio, dpo, ccc } = c.metrics;
  const { netSales, cogs, purchases } = c.components;
  const days = c.days;
  const name = _cccDbLabel(c.db);

  // 1. CCC classification
  let cccClass, cccColor;
  if (ccc <= 45)       { cccClass = 'دورة قصيرة — صحة نقدية جيدة';             cccColor = '#4ada8e'; }
  else if (ccc <= 75)  { cccClass = 'دورة متوسطة — قابلة للتحسين';             cccColor = '#da9a4a'; }
  else                 { cccClass = 'دورة طويلة — ضغط على السيولة والتمويل';    cccColor = '#da4a4a'; }

  const bullets = [];

  // 2. Biggest driver (DSO vs DIO; DPO opportunity separate)
  if (dso != null && dio != null) {
    if (dso >= dio) bullets.push({ icon:'⚡', text:`أولويتك: تسريع التحصيل — DSO هو الأعلى أثراً (${cccFmtN(dso)} يوم)` });
    else            bullets.push({ icon:'⚡', text:`أولويتك: تسريع دوران المخزون — DIO هو الأعلى أثراً (${cccFmtN(dio)} يوم)` });
  }
  if (dpo != null && dpo < 10) {
    bullets.push({ icon:'🔑', text:`فرصة: تمديد آجال سداد الموردين — DPO حالياً ${cccFmtN(dpo)} يوم فقط` });
  }

  // 3. DSO > DPO → financing clients from own pocket
  if (dso != null && dpo != null && dso > dpo) {
    bullets.push({ icon:'⚠', text:`تموّل عملاءك من جيبك: تُحصّل بعد ${cccFmtN(dso)} يوم بينما تسدّد خلال ${cccFmtN(dpo)} يوم` });
  }

  // 4. DIO > 30 → slow inventory
  if (dio != null && dio > 30) {
    bullets.push({ icon:'📦', text:`المخزون يبقى ${cccFmtN(dio)} يوم — راجع الأصناف الراكدة (نقد محبوس + مخاطرة سعرية في الحديد)` });
  }

  // 5a. Quantified levers (always shown)
  if (days > 0) {
    const lDso = Math.round(netSales  / days);
    const lDio = Math.round(cogs      / days);
    const lDpo = Math.round(purchases / days);
    bullets.push({ icon:'💰',
      text:`رافعة يومية: تقليل DSO بيوم يُحرّر ≈ ${cccFmtSAR(lDso)} ر.س · تقليل DIO بيوم ≈ ${cccFmtSAR(lDio)} ر.س · تمديد DPO بيوم ≈ ${cccFmtSAR(lDpo)} ر.س`
    });

    // 5b. Scenario: reduce CCC to 45 days
    if (ccc != null && ccc > 45) {
      const freed = Math.round((ccc - 45) * (netSales / days));
      bullets.push({ icon:'🎯',
        text:`سيناريو: خفض CCC إلى 45 يوماً يُحرّر ≈ ${cccFmtSAR(freed)} ر.س من رأس المال العامل`
      });
    }
  }

  // 6. Structural note — only relevant when CCC is short (≤45 days)
  const structuralHtml = (ccc != null && ccc <= 45)
    ? `<div class="ccc-insight-structural">إن كانت دورتك قصيرة ومع ذلك تكلفة التمويل مرتفعة، فجذر المشكلة مديونية/هيكلي لا في رأس المال العامل — والعلاج في هيكلة الديون لا في تسريع الدورة.</div>`
    : '';

  return `
  <div class="ccc-insight-card">
    <div class="ccc-insight-name">${name}</div>
    <div class="ccc-insight-badge" style="background:${cccColor}1a;color:${cccColor};border-color:${cccColor}55">
      CCC ${cccFmtN(ccc)} يوم &mdash; ${cccClass}
    </div>
    <ul class="ccc-insight-list">
      ${bullets.map(b => `<li><span class="ccc-insight-icon">${b.icon}</span>${b.text}</li>`).join('')}
    </ul>
    ${structuralHtml}
  </div>`;
}

function _cccDbLabel(dbName) {
  if (dbName === 'MekSoftDb1') return 'أبعاد الحديد';
  if (dbName === 'MekSoftDb2') return 'وسام الفولاذ';
  return dbName;
}

/* ── Inject CSS ─────────────────────────────────────────────────────────────── */
(function _cccInjectCSS() {
  if (document.getElementById('ccc-style')) return;
  const s = document.createElement('style');
  s.id = 'ccc-style';
  s.textContent = `
  #tab-ccc { padding: 0 0 20px; }
  .ccc-header { display:flex; justify-content:space-between; align-items:flex-start;
    background:#0a1e30; padding:14px 18px; border-bottom:2px solid #1e3a5f; }
  .ccc-title  { color:#e0f0ff; font-size:1.1rem; font-weight:700; }
  .ccc-sub    { color:#5a8aaa; font-size:.78rem; margin-top:3px; }
  .ccc-status { color:#1a7a3c; font-size:.78rem; text-align:left; white-space:nowrap; padding-top:4px; }
  .ccc-bar { display:flex; align-items:center; gap:10px; padding:10px 18px;
    background:#06121e; border-bottom:1px solid #0d1e2e; flex-wrap:wrap; }
  .ccc-lbl { color:#8aaac8; font-size:.82rem; }
  .ccc-inp { background:#0d1e30; border:1px solid #1e3a5f; color:#c0d8f0;
    border-radius:4px; padding:5px 8px; font-size:.82rem; }
  .ccc-btn { background:#1e3a5f; color:#a0d0f8; border:1px solid #2a5a8a;
    border-radius:4px; padding:5px 14px; cursor:pointer; font-size:.82rem; }
  .ccc-btn:hover { background:#2a4a6a; }

  /* KPI grid */
  .ccc-kpis-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px;
    padding:14px 18px; }
  @media(max-width:900px) { .ccc-kpis-grid { grid-template-columns:repeat(2,1fr); } }
  .ccc-kpi-card { background:#0d1e30; border:1px solid #1e3a5f; border-top:3px solid var(--accent);
    border-radius:8px; padding:14px; }
  .ccc-kpi-label { color:#8aaac8; font-size:.82rem; font-weight:600; margin-bottom:2px; }
  .ccc-kpi-hint  { color:#3a5a7a; font-size:.72rem; margin-bottom:10px; }
  .ccc-kpi-companies { display:flex; align-items:center; gap:0; }
  .ccc-kpi-company { flex:1; text-align:center; }
  .ccc-kpi-divider { width:1px; background:#1e3a5f; height:40px; margin:0 8px; }
  .ccc-kpi-co-name { color:#5a7a9a; font-size:.72rem; margin-bottom:4px; }
  .ccc-kpi-val  { font-size:1.6rem; font-weight:700; }
  .ccc-kpi-unit { font-size:.7rem; color:#5a7a9a; }

  /* Sections */
  .ccc-section { margin:12px 18px; }
  .ccc-sec-title { color:#4a8aaa; font-size:.85rem; font-weight:700;
    padding:8px 12px; background:#0d1e30; border-radius:4px; margin-bottom:8px; }

  /* Table */
  .ccc-tbl { width:100%; border-collapse:collapse; direction:rtl; font-size:.84rem; }
  .ccc-tbl th { background:#112233; color:#8aaac8; padding:8px 12px; text-align:right;
    border-bottom:2px solid #1e3a5f; white-space:nowrap; }
  .ccc-tbl td { padding:7px 12px; border-bottom:1px solid #0d1e2e; }
  .ccc-tbl .num { text-align:left; direction:ltr; }
  .ccc-recon-total td { background:#091520; font-weight:600; border-top:1px solid #1e3a5f; }

  .ccc-note { margin-top:8px; padding:8px 12px; background:#1a1000; color:#da9a4a;
    border:1px solid #6a3a0033; border-radius:4px; font-size:.79rem; }
  .ccc-footer { padding:14px 18px; color:#3a5a7a; font-size:.75rem; border-top:1px solid #0d1e2e; margin-top:20px; }

  /* ── Insights cards ── */
  .ccc-insights-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:4px; }
  @media(max-width:800px) { .ccc-insights-grid { grid-template-columns:1fr; } }
  .ccc-insight-card { background:#0a1828; border:1px solid #1e3a5f; border-radius:8px; padding:16px; }
  .ccc-insight-name { color:#8aaac8; font-size:.8rem; font-weight:600; margin-bottom:8px;
    text-transform:uppercase; letter-spacing:.04em; }
  .ccc-insight-badge { display:inline-block; border:1px solid; border-radius:20px;
    padding:5px 14px; font-size:.83rem; font-weight:700; margin-bottom:12px; }
  .ccc-insight-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
  .ccc-insight-list li { display:flex; gap:8px; align-items:flex-start;
    color:#b0cce0; font-size:.82rem; line-height:1.5; }
  .ccc-insight-icon { flex-shrink:0; font-size:.9rem; }
  .ccc-insight-structural { margin-top:14px; padding:10px 12px; background:#06101a;
    border-right:3px solid #1e3a5f; color:#4a6a7a; font-size:.76rem; font-style:italic;
    line-height:1.55; border-radius:0 4px 4px 0; }

  /* ── Explain collapsible ── */
  .ccc-explain { border:1px solid #1e3a5f; border-radius:6px; background:#0a1828; }
  .ccc-explain-summary { border-radius:6px; margin-bottom:0; }
  .ccc-explain[open] .ccc-explain-summary { border-radius:6px 6px 0 0; }
  .ccc-explain-body { padding:14px 16px; display:flex; flex-direction:column; gap:14px; }
  .ccc-explain-row { display:flex; gap:14px; align-items:flex-start; }
  .ccc-explain-badge { font-size:1rem; font-weight:800; width:56px; flex-shrink:0;
    text-align:center; padding-top:2px; }
  .ccc-explain-term { color:#a0c0d8; font-size:.84rem; font-weight:600; margin-bottom:3px; }
  .ccc-explain-def  { color:#7a9ab8; font-size:.80rem; line-height:1.5; margin-bottom:4px; }
  .ccc-explain-def strong { color:#b0d0e8; }
  .ccc-explain-formula { color:#4a7a9a; font-size:.76rem; font-family:monospace;
    background:#06101a; padding:3px 8px; border-radius:3px; display:inline-block; }

  /* ── Methodology list ── */
  .ccc-method-list { margin:4px 0 0; padding-right:18px; display:flex; flex-direction:column;
    gap:6px; color:#6a8a9a; font-size:.80rem; line-height:1.6; }
  .ccc-method-list li { }
  .ccc-method-list strong { color:#9aaab8; }

  /* ── KPI secondary metric badge ── */
  .ccc-kpi-secondary { font-size:.68rem; color:#5a7a9a; margin-top:5px;
    padding:2px 7px; background:#06101a; border-radius:3px;
    border:1px solid #1e3a5f; white-space:nowrap; display:inline-block; }

  /* ── DPO explain section ── */
  .ccc-dpo-p { color:#7a9ab8; font-size:.81rem; line-height:1.6; margin:0; }
  .ccc-dpo-def-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:6px 0; }
  @media(max-width:700px){ .ccc-dpo-def-grid { grid-template-columns:1fr; } }
  .ccc-dpo-def-card { background:#06101a; border:1px solid; border-radius:6px; padding:10px 14px; }
  .ccc-dpo-def-title { font-size:.81rem; font-weight:700; margin-bottom:5px; }
  .ccc-dpo-def-body  { color:#6a8a9a; font-size:.78rem; line-height:1.55; }
  .ccc-dpo-result { background:#06101a; border-right:3px solid #da9a4a; padding:9px 12px;
    border-radius:0 4px 4px 0; color:#8aaac8; font-size:.80rem; line-height:1.6; }
  .ccc-dpo-method-note { color:#4a6a7a; font-size:.76rem; padding:6px 10px;
    background:#06101a; border:1px solid #0d2030; border-radius:4px; }
  `;
  document.head.appendChild(s);
})();
