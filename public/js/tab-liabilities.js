// ── تركيبة الالتزامات الحقيقية — Real Liabilities Composition Tab ─────────────

let _liabDb       = null;
let _liabData     = null;
let _liabTimer    = null;
let _liabRendered = false;
let _liabCountdown = 0;
const LIAB_REFRESH_SEC = 600;

const _liabFmt  = v => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(Math.round(+v || 0));
const _liabPct  = (v, total) => total ? ((+v || 0) / total * 100).toFixed(1) + '%' : '—';

function _liabIsActive() { return !!document.querySelector('.tab.active[data-tab="liabilities"]'); }
function _liabStopTimer() { if (_liabTimer) { clearInterval(_liabTimer); _liabTimer = null; } }

/* ── Entry point ─────────────────────────────────────────────────────────────── */
function renderLiabilitiesTab() {
  const wrap = document.getElementById('tab-liabilities');
  if (!wrap) return;

  if (!_liabRendered) {
    _liabRendered = true;
    _liabDb = (document.getElementById('db-select')?.value) || 'MekSoftDb1';
    wrap.innerHTML = _liabBuildShell();
    _liabInjectCSS();
    _liabWireControls(wrap);
    _liabStartTimer();
  }
  _liabLoad();
}

/* ── CSS ─────────────────────────────────────────────────────────────────────── */
function _liabInjectCSS() {
  if (document.getElementById('liab-css')) return;
  const s = document.createElement('style');
  s.id = 'liab-css';
  s.textContent = `
  .liab-header { display:flex; justify-content:space-between; align-items:flex-start;
    padding:18px 20px 10px; background:#0D1F3C; border-bottom:1px solid #1e3a5f; }
  .liab-title  { font-size:1.25em; font-weight:700; color:#C9A84C; }
  .liab-sub    { font-size:.82em; color:#8ca8c8; margin-top:3px; }
  .liab-status { font-size:.78em; color:#8ca8c8; text-align:left; min-width:200px; }

  .liab-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    padding:10px 20px; background:#0a172b; border-bottom:1px solid #1e3a5f; }
  .liab-lbl  { color:#8ca8c8; font-size:.82em; }
  .liab-inp  { background:#0f2540; color:#e0e8f0; border:1px solid #2a4a6a;
    border-radius:5px; padding:4px 8px; font-size:.85em; }
  .liab-btn  { background:#C9A84C; color:#0a172b; border:none; border-radius:5px;
    padding:5px 14px; cursor:pointer; font-size:.85em; font-weight:700; }
  .liab-btn:hover { background:#e0bb66; }
  .liab-db-btn { background:#1a3456; color:#8ca8c8; border:1px solid #2a4a6a;
    border-radius:5px; padding:4px 12px; cursor:pointer; font-size:.82em; }
  .liab-db-btn.active { background:#C9A84C; color:#0a172b; font-weight:700; border-color:#C9A84C; }

  .liab-kpis   { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
    gap:12px; padding:16px 20px; }
  .liab-kpi    { background:#0f2540; border-radius:8px; padding:14px 16px; border:1px solid #1e3a5f; }
  .liab-kpi-label { font-size:.78em; color:#8ca8c8; margin-bottom:4px; }
  .liab-kpi-val   { font-size:1.4em; font-weight:700; color:#e0e8f0; }
  .liab-kpi-sub   { font-size:.75em; color:#8ca8c8; margin-top:2px; }
  .liab-kpi-warn  { color:#e08050; }
  .liab-kpi-gold  { color:#C9A84C; }
  .liab-kpi-blue  { color:#4a9eda; }
  .liab-kpi-green { color:#4ada8e; }

  .liab-compose  { padding:0 20px 14px; }
  .liab-compose-bar { height:26px; border-radius:6px; display:flex; overflow:hidden; margin-bottom:6px; }
  .liab-compose-seg { height:100%; transition:width .5s; }
  .liab-compose-legend { display:flex; flex-wrap:wrap; gap:10px; font-size:.78em; color:#8ca8c8; }
  .liab-compose-dot { display:inline-block; width:10px; height:10px; border-radius:2px;
    margin-left:5px; vertical-align:middle; }

  .liab-section { margin:0 20px 18px; }
  .liab-sec-title { font-size:.9em; font-weight:700; color:#C9A84C; margin-bottom:8px;
    padding-bottom:5px; border-bottom:1px solid #1e3a5f; }

  .liab-tbl { width:100%; border-collapse:collapse; font-size:.83em; }
  .liab-tbl th { background:#0a172b; color:#8ca8c8; padding:7px 10px; text-align:right;
    border-bottom:1px solid #1e3a5f; font-weight:600; }
  .liab-tbl td { padding:7px 10px; border-bottom:1px solid #1a3050; color:#c0d0e0; }
  .liab-tbl tr:hover td { background:#0f2030; }
  .liab-tbl .num   { text-align:left; font-variant-numeric:tabular-nums; }
  .liab-tbl .total { font-weight:700; background:#0a172b!important; color:#e0e8f0; }
  .liab-tbl .sub   { color:#8ca8c8; font-size:.9em; }

  .liab-badge { display:inline-block; border-radius:4px; padding:1px 7px; font-size:.75em; font-weight:700; }
  .liab-badge-loan   { background:#1a3456; color:#4a9eda; }
  .liab-badge-def    { background:#1a2e1a; color:#4ada8e; }
  .liab-badge-acc    { background:#2a2010; color:#C9A84C; }
  .liab-badge-per    { background:#2a1a2a; color:#b08ad8; }

  .liab-ias24 { background:#0a172b; border-radius:8px; overflow:hidden;
    border:1px solid #1e3a5f; margin:0 20px 18px; }
  .liab-ias24-head { background:#0D1F3C; padding:10px 14px; display:flex;
    justify-content:space-between; align-items:center; }
  .liab-ias24-title { color:#C9A84C; font-weight:700; font-size:.9em; }
  .liab-ias24-gap   { font-size:.82em; }
  .liab-ias24 table { width:100%; border-collapse:collapse; font-size:.83em; }
  .liab-ias24 th { padding:7px 12px; text-align:right; color:#8ca8c8; font-weight:600;
    border-bottom:1px solid #1e3a5f; }
  .liab-ias24 td { padding:7px 12px; border-bottom:1px solid #1a3050; color:#c0d0e0; }
  .liab-ias24 .num { text-align:left; font-variant-numeric:tabular-nums; }
  .liab-ias24 .highlight { color:#C9A84C; font-weight:700; }
  .liab-ias24-gap-row { background:#0f2030; }
  .liab-ias24-gap-row td { color:#e08050; font-weight:700; }

  .liab-insights { padding:10px 14px; background:#0a172b; border-radius:8px;
    margin:0 20px 18px; border:1px solid #1e3a5f; }
  .liab-insight-row { display:flex; gap:10px; align-items:flex-start; margin-bottom:8px; font-size:.83em; }
  .liab-insight-row:last-child { margin-bottom:0; }
  .liab-insight-icon { font-size:1.1em; flex-shrink:0; padding-top:1px; }
  .liab-insight-text { color:#c0d0e0; line-height:1.5; }
  .liab-insight-text strong { color:#e0e8f0; }
  .liab-insight-warn strong { color:#e08050; }

  .liab-method { background:#0a172b; border-radius:8px; margin:0 20px 18px;
    padding:12px 16px; border:1px solid #1e3a5f; font-size:.8em; color:#8ca8c8;
    line-height:1.7; }
  .liab-method li { margin-bottom:2px; }

  .liab-footer { text-align:center; padding:10px; color:#3a5070; font-size:.78em; }
  .liab-loading { text-align:center; color:#8ca8c8; padding:30px; }
  .liab-err     { text-align:center; color:#e05a5a; padding:30px; font-size:1em; }
  `;
  document.head.appendChild(s);
}

/* ── HTML Shell ──────────────────────────────────────────────────────────────── */
function _liabBuildShell() {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="liab-header">
    <div>
      <div class="liab-title">🏦 تركيبة الالتزامات الحقيقية</div>
      <div class="liab-sub">تفكيك ح.77+78 · التمويلات البنكية · الأطراف ذات العلاقة · مقارنة ثنائية IAS 24</div>
    </div>
    <div id="liab-status" class="liab-status">جارٍ التحميل…</div>
  </div>

  <div class="liab-bar">
    <button class="liab-db-btn active" data-db="MekSoftDb1">أبعاد الحديد</button>
    <button class="liab-db-btn" data-db="MekSoftDb2">وسام الفولاذ</button>
    <label class="liab-lbl">بتاريخ:</label>
    <input id="liab-asof" type="date" class="liab-inp" value="${today}">
    <button id="liab-refresh" class="liab-btn">↺ تحديث</button>
  </div>

  <!-- KPI cards -->
  <div id="liab-kpis" class="liab-kpis"><div class="liab-loading">جارٍ التحميل…</div></div>

  <!-- Composition bar -->
  <div class="liab-compose" id="liab-compose"></div>

  <!-- AP 77+78 breakdown table -->
  <div class="liab-section" id="liab-ap-section">
    <div class="liab-sec-title">📊 تفكيك رصيد ح.77+78 (الدائنون)</div>
    <table class="liab-tbl">
      <thead><tr>
        <th>البند</th><th class="num">القيمة (ر.س)</th><th class="num">% من الرصيد</th><th>ملاحظة</th>
      </tr></thead>
      <tbody id="liab-ap-tbody"><tr><td colspan="4" class="liab-loading">جارٍ التحميل…</td></tr></tbody>
    </table>
  </div>

  <!-- IAS 24 bilateral panel -->
  <div class="liab-ias24" id="liab-ias24">
    <div class="liab-ias24-head">
      <div class="liab-ias24-title">⚖️ لوحة الأطراف ذات العلاقة — IAS 24 (مقارنة ثنائية أبعاد ↔ وسام)</div>
      <div id="liab-gap-badge" class="liab-ias24-gap"></div>
    </div>
    <table>
      <thead><tr>
        <th>الكتاب / الجهة</th><th class="num">AP (دائن للطرف الآخر)</th>
        <th class="num">AR (مدين على الطرف الآخر)</th><th class="num">صافٍ</th><th>الوضع</th>
      </tr></thead>
      <tbody id="liab-ias24-tbody"><tr><td colspan="5" class="liab-loading">جارٍ التحميل…</td></tr></tbody>
    </table>
  </div>

  <!-- Financing detail table -->
  <div class="liab-section" id="liab-fin-section">
    <div class="liab-sec-title">🏛️ التمويلات البنكية والالتزامات المالية خارج ح.77+78</div>
    <table class="liab-tbl">
      <thead><tr>
        <th>ح.</th><th>الحساب</th><th>النوع</th><th class="num">الرصيد (ر.س)</th><th class="num">% من التمويل</th>
      </tr></thead>
      <tbody id="liab-fin-tbody"><tr><td colspan="5" class="liab-loading">جارٍ التحميل…</td></tr></tbody>
    </table>
  </div>

  <!-- Analysis -->
  <div class="liab-section">
    <div class="liab-sec-title">💡 قراءة تحليلية</div>
    <div class="liab-insights" id="liab-insights"><div class="liab-loading">جارٍ التحميل…</div></div>
  </div>

  <!-- Methodology -->
  <div class="liab-section">
    <div class="liab-sec-title">📋 منهجية التصنيف</div>
    <ul class="liab-method">
      <li><strong>موردون تجاريون:</strong> موردو السوق الخارجي — رقمهم الضريبي لا يتطابق مع أي عميل مسجّل في نفس الشركة. الرصيد الدائن مباشرةً = الالتزام الحقيقي (لا مقاصّة مطلوبة).</li>
      <li><strong>الطرف ذو علاقة (related):</strong> المورّد الذي يتطابق رقمه الضريبي مع عميل — مؤسسة وسام الفولاذ (في دفاتر أبعاد) ومؤسسة أبعاد الحديد (في دفاتر وسام). يُعرَض صافٍ: AP الدائن − AR المدين = صافي التعرّض الفعلي.</li>
      <li><strong>موردون مزدوجون آخرون:</strong> كيانات مزدوجة (مورّد وعميل) غير الطرف الرئيسي — أرصدتها الدائنة موضّحة قبل المقاصّة.</li>
      <li><strong>دفعات مقدمة:</strong> أرصدة مدينة في ح.77+78 (دفعات تتجاوز الفواتير المستلمة) — هي أصل لا التزام، مستبعدة من الإجمالي الصافي.</li>
      <li><strong>التمويلات البنكية:</strong> جميع حسابات القروض (20102xxx، 2020101xxx) والفوائد المستحقة (20103xxx) والقروض الشخصية (20105xxx) ذات الأرصدة الدائنة.</li>
      <li><strong>IAS 24 — الفجوة البينية:</strong> فرق الأرصدة كما تُسجّلها كل شركة في دفاترها — يُستخدم في المطالبة بالتسوية أو في التحضير للقوائم المجمّعة.</li>
      <li>جميع الأرقام تراكمية حتى تاريخ الفلتر (≤ asOf). الأرصدة حيّة ومحدَّثة كل ${Math.floor(LIAB_REFRESH_SEC / 60)} دقيقة.</li>
    </ul>
  </div>

  <div class="liab-footer">تركيبة الالتزامات الحقيقية — إعداد: عمر أبو دقن</div>
  `;
}

/* ── Wire controls ───────────────────────────────────────────────────────────── */
function _liabWireControls(wrap) {
  wrap.querySelectorAll('.liab-db-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _liabDb = btn.dataset.db;
      wrap.querySelectorAll('.liab-db-btn').forEach(b => b.classList.toggle('active', b === btn));
      _liabLoad();
    });
  });
  document.getElementById('liab-refresh')?.addEventListener('click', _liabLoad);
  document.getElementById('liab-asof')?.addEventListener('change', _liabLoad);
}

/* ── Timer ───────────────────────────────────────────────────────────────────── */
function _liabStartTimer() {
  _liabStopTimer();
  _liabCountdown = LIAB_REFRESH_SEC;
  _liabTimer = setInterval(() => {
    if (!_liabIsActive()) { _liabStopTimer(); return; }
    _liabCountdown--;
    if (_liabCountdown > 0) _liabUpdateStatus();
    else { _liabCountdown = LIAB_REFRESH_SEC; _liabLoad(); }
  }, 1000);
}

function _liabUpdateStatus(msg) {
  const el = document.getElementById('liab-status');
  if (!el) return;
  if (msg) { el.textContent = msg; return; }
  const mm = Math.floor(_liabCountdown / 60), ss = _liabCountdown % 60;
  el.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${mm}:${String(ss).padStart(2,'0')}`;
}

/* ── Data load ───────────────────────────────────────────────────────────────── */
async function _liabLoad() {
  _liabUpdateStatus('⏳ جارٍ التحميل…');
  const asOf = document.getElementById('liab-asof')?.value || new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch(`/api/liabilities?db=${_liabDb}&asOf=${asOf}`);
    if (!r.ok) throw new Error(await r.text());
    _liabData = await r.json();
    _liabRenderAll(_liabData);
    _liabCountdown = LIAB_REFRESH_SEC;
    _liabUpdateStatus();
  } catch (e) {
    _liabUpdateStatus('⚠ خطأ: ' + e.message);
    const errHtml = `<tr><td colspan="9" class="liab-err">⚠ فشل التحميل: ${e.message}</td></tr>`;
    ['liab-ap-tbody','liab-ias24-tbody','liab-fin-tbody'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = errHtml.replace('9','4');
    });
    const ins = document.getElementById('liab-insights');
    if (ins) ins.innerHTML = `<div class="liab-err">⚠ ${e.message}</div>`;
  }
}

/* ── Render All ──────────────────────────────────────────────────────────────── */
function _liabRenderAll(d) {
  _liabRenderKPIs(d);
  _liabRenderCompose(d);
  _liabRenderAPTable(d);
  _liabRenderIAS24(d);
  _liabRenderFinancing(d);
  _liabRenderInsights(d);
}

/* ── KPI Cards ───────────────────────────────────────────────────────────────── */
function _liabRenderKPIs(d) {
  const t = d.totals;
  const grand = t.grandTotal;
  const finPct = grand ? (t.financingTotal / grand * 100).toFixed(1) : '—';
  const tradePct = grand ? (t.tradeNet / grand * 100).toFixed(1) : '—';

  const cards = [
    { label:'إجمالي الالتزامات الحقيقية', val: _liabFmt(grand), sub:'تجاري + علاقة (صافٍ) + تمويل', cls:'liab-kpi-gold' },
    { label:'تمويلات بنكية ومالية', val: _liabFmt(t.financingTotal), sub: `${finPct}% من الإجمالي`, cls:'liab-kpi-warn' },
    { label:'موردون تجاريون صافٍ', val: _liabFmt(t.tradeNet), sub: `${tradePct}% من الإجمالي`, cls:'liab-kpi-blue' },
    { label:'صافي الطرف ذي العلاقة', val: _liabFmt(t.relatedNet),
      sub: t.relatedNet > 0 ? 'التزام دائن (مدينون لهم)' : 'وضع مدين (يدينون لنا)', cls:'liab-kpi-green' },
  ];

  document.getElementById('liab-kpis').innerHTML = cards.map(c => `
    <div class="liab-kpi">
      <div class="liab-kpi-label">${c.label}</div>
      <div class="liab-kpi-val ${c.cls}">${c.val}</div>
      <div class="liab-kpi-sub">${c.sub}</div>
    </div>
  `).join('');
}

/* ── Composition bar ─────────────────────────────────────────────────────────── */
function _liabRenderCompose(d) {
  const t = d.totals;
  const grand = t.grandTotal || 1;
  const segs = [
    { label:'تمويلات',       val: t.financingTotal, color:'#e08050' },
    { label:'علاقة (صافٍ)', val: t.relatedNet,      color:'#C9A84C' },
    { label:'تجاري',         val: t.tradeNet,        color:'#4a9eda' },
  ];
  const bars = segs.map(s =>
    `<div class="liab-compose-seg" title="${s.label}: ${_liabFmt(s.val)} ر.س"
          style="width:${(s.val/grand*100).toFixed(1)}%;background:${s.color}"></div>`
  ).join('');
  const legend = segs.map(s =>
    `<span><span class="liab-compose-dot" style="background:${s.color}"></span>${s.label}: ${_liabFmt(s.val)}</span>`
  ).join('');
  document.getElementById('liab-compose').innerHTML = `
    <div class="liab-compose-bar">${bars}</div>
    <div class="liab-compose-legend">${legend}</div>`;
}

/* ── AP 77+78 Breakdown Table ────────────────────────────────────────────────── */
function _liabRenderAPTable(d) {
  const ap   = d.ap;
  const tot  = ap.total || 1;
  const rows = [];

  // Primary related (وسام/أبعاد)
  const primary = d.relatedParties[0];
  if (primary) {
    rows.push({ label: `طرف ذو علاقة — ${primary.name}`, val: primary.apGross,
      note: `AP إجمالي · صافٍ بعد AR = ${_liabFmt(primary.netExposure)}`, style:'' });
  }

  // Other related (if any)
  const otherRel = d.relatedParties.slice(1).filter(r => r.apGross > 0);
  if (otherRel.length) {
    const otherAP = otherRel.reduce((s, r) => s + r.apGross, 0);
    rows.push({ label: `موردون مزدوجون آخرون (${otherRel.length})`, val: otherAP,
      note: otherRel.map(r => r.name).join('، '), style:'sub' });
  }

  // Trade
  rows.push({ label:'موردون تجاريون صافٍ', val: ap.tradeCredit,
    note:'بلا طرف مقابل — الرصيد الدائن = الالتزام الحقيقي', style:'' });

  // Advances (subtracted)
  rows.push({ label:'(دفعات مقدمة — أرصدة مدينة)', val: -ap.advances,
    note:'أصل لا التزام — مستبعدة من الصافي', style:'sub' });

  const trs = rows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td class="num ${r.val < 0 ? 'liab-kpi-green' : ''}">${r.val < 0 ? '(' + _liabFmt(-r.val) + ')' : _liabFmt(r.val)}</td>
      <td class="num">${r.val !== 0 ? _liabPct(Math.abs(r.val), Math.abs(ap.total)) : '—'}</td>
      <td class="${r.style}">${r.note}</td>
    </tr>`).join('');

  const totalRow = `
    <tr class="total">
      <td>إجمالي ح.77+78 (صافٍ)</td>
      <td class="num">${_liabFmt(ap.total)}</td>
      <td class="num">100%</td>
      <td>= Credit − Debit على الحسابين 77/78</td>
    </tr>`;

  document.getElementById('liab-ap-tbody').innerHTML = trs + totalRow;
}

/* ── IAS 24 Bilateral Panel ──────────────────────────────────────────────────── */
function _liabRenderIAS24(d) {
  const b = d.bilateral;
  const gap = Math.round(b.gap || 0);

  document.getElementById('liab-gap-badge').innerHTML =
    gap < 10000
      ? `<span style="color:#4ada8e">✓ فجوة: ${_liabFmt(gap)} ر.س (مقبولة)</span>`
      : `<span style="color:#e08050">⚠ فجوة: ${_liabFmt(gap)} ر.س — تستحق التسوية</span>`;

  const db1Label = b.db1.name === 'MekSoftDb1' ? 'أبعاد الحديد' : b.db1.name;
  const db2Label = b.db2.name === 'MekSoftDb2' ? 'وسام الفولاذ' : b.db2.name;

  const r1net = b.db1.netAP;
  const r2net = b.db2.netAR;

  const rows = [
    {
      book: `📚 دفاتر ${db1Label}`,
      ap:   _liabFmt(b.db1.apToOther),
      ar:   _liabFmt(b.db1.arFromOther),
      net:  _liabFmt(r1net),
      status: r1net > 0
        ? `<span style="color:#e08050">مدين لـ${db2Label}</span>`
        : `<span style="color:#4ada8e">دائن على ${db2Label}</span>`,
    },
    {
      book: `📚 دفاتر ${db2Label}`,
      ap:   _liabFmt(b.db2.apToOther),
      ar:   _liabFmt(b.db2.arFromOther),
      net:  _liabFmt(r2net),
      status: r2net > 0
        ? `<span style="color:#4ada8e">يستحق من ${db1Label}</span>`
        : `<span style="color:#e08050">مدين لـ${db1Label}</span>`,
    },
  ];

  const trs = rows.map(r => `
    <tr>
      <td><strong>${r.book}</strong></td>
      <td class="num">${r.ap}</td>
      <td class="num">${r.ar}</td>
      <td class="num highlight">${r.net}</td>
      <td>${r.status}</td>
    </tr>`).join('');

  const gapRow = `
    <tr class="liab-ias24-gap-row">
      <td colspan="3"><strong>الفجوة البينية (تستوجب التسوية قبل التجميع)</strong></td>
      <td class="num">${_liabFmt(gap)}</td>
      <td>${gap < 10000 ? '✓ ضمن الحدود المقبولة' : '⚠ تراجع مع المحاسبة'}</td>
    </tr>`;

  document.getElementById('liab-ias24-tbody').innerHTML = trs + gapRow;
}

/* ── Financing Detail Table ──────────────────────────────────────────────────── */
function _liabRenderFinancing(d) {
  const fin  = d.financing;
  const tot  = d.totals.financingTotal || 1;

  const catLabel  = { loan:'قرض بنكي', deferred:'مؤجل/طويل', accrued:'مستحق', personal:'قرض شخصي', other:'أخرى' };
  const catBadge  = { loan:'loan', deferred:'def', accrued:'acc', personal:'per', other:'acc' };

  const trs = fin.map(f => `
    <tr>
      <td class="sub">${f.id}</td>
      <td>${f.name}</td>
      <td><span class="liab-badge liab-badge-${catBadge[f.category]||'acc'}">${catLabel[f.category]||f.category}</span></td>
      <td class="num">${_liabFmt(f.balance)}</td>
      <td class="num">${_liabPct(f.balance, tot)}</td>
    </tr>`).join('');

  const totalRow = `
    <tr class="total">
      <td colspan="3">إجمالي التمويلات</td>
      <td class="num">${_liabFmt(d.totals.financingTotal)}</td>
      <td class="num">100%</td>
    </tr>`;

  document.getElementById('liab-fin-tbody').innerHTML = trs + totalRow;
}

/* ── Insights ────────────────────────────────────────────────────────────────── */
function _liabRenderInsights(d) {
  const t   = d.totals;
  const ap  = d.ap;
  const fin = t.financingTotal;
  const grand = t.grandTotal;
  const finPct = grand ? fin / grand * 100 : 0;
  const tradePct = grand ? t.tradeNet / grand * 100 : 0;
  const gap = d.bilateral.gap;
  const dbLabel = _liabDb === 'MekSoftDb2' ? 'وسام الفولاذ' : 'أبعاد الحديد';

  const insights = [];

  if (finPct > 60)
    insights.push({ icon:'🚨', cls:'liab-insight-warn',
      text:`<strong>التمويل البنكي يمثّل ${finPct.toFixed(0)}% من الالتزامات الحقيقية</strong> — نسبة مرتفعة تزيد التعرّض لمخاطر سعر الفائدة وتضغط على التدفق النقدي الحر. يُوصى بمراجعة جدول الاستحقاقات والتنويع.` });
  else if (finPct > 40)
    insights.push({ icon:'⚠️', cls:'',
      text:`التمويل البنكي <strong>${finPct.toFixed(0)}%</strong> من الإجمالي — متوسط. راقب نسبة الدين للأصول وتواريخ إعادة التسعير.` });
  else
    insights.push({ icon:'✅', cls:'',
      text:`التمويل البنكي <strong>${finPct.toFixed(0)}%</strong> — نسبة معقولة. رصيد الدائنين التجاريين يموّل قدراً جيداً من التشغيل.` });

  if (tradePct > 30)
    insights.push({ icon:'💳', cls:'',
      text:`<strong>الموردون التجاريون ${tradePct.toFixed(0)}%</strong> من الإجمالي — مؤشر DPO مرتفع نسبياً. يشير إلى تمويل مجاني جيد، لكن تأخّر السداد فوق 90 يوماً يضرّ بالعلاقة التجارية.` });

  const adv = ap.advances;
  if (adv > 500000)
    insights.push({ icon:'💰', cls:'',
      text:`<strong>دفعات مقدمة ${_liabFmt(adv)} ر.س</strong> — مبالغ مدفوعة تتجاوز الفواتير المستلمة. تحقّق من توقيت الاستلام أو وجود نزاعات.` });

  if (d.relatedParties.length) {
    const rp = d.relatedParties[0];
    insights.push({ icon:'🔗', cls:'',
      text:`<strong>الطرف ذو العلاقة (${rp.name}):</strong> AP الإجمالي ${_liabFmt(rp.apGross)} ر.س، AR ${_liabFmt(rp.arGross)} ر.س → صافي التعرّض <strong>${_liabFmt(rp.netExposure)} ر.س</strong>. يُشكّل الجزء الأكبر من ح.77+78 ويتطلب إفصاحاً IAS 24 منفصلاً.` });
  }

  if (gap < 10000)
    insights.push({ icon:'✓', cls:'',
      text:`الفجوة البينية <strong>${_liabFmt(gap)} ر.س</strong> — ضمن الحدود المقبولة. الدفاتر متقاربة وجاهزة للتجميع دون تسويات جوهرية.` });
  else
    insights.push({ icon:'📋', cls:'liab-insight-warn',
      text:`<strong>فجوة بينية ${_liabFmt(gap)} ر.س</strong> بين دفتري أبعاد ووسام. يجب التسوية قبل إعداد القوائم المجمّعة (IFRS 10 / إلغاء داخلي).` });

  document.getElementById('liab-insights').innerHTML = insights.map(i => `
    <div class="liab-insight-row ${i.cls}">
      <div class="liab-insight-icon">${i.icon}</div>
      <div class="liab-insight-text">${i.text}</div>
    </div>`).join('');
}
