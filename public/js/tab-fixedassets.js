// ── FIXED ASSETS TAB ─────────────────────────────────────────────────────────
'use strict';

/* ── Asset type tree (keyword-based grouping) ── */
const FA_TYPES = [
  { key:'vehicles',   icon:'🚗', label:'المركبات',                  re:/سيارة|دينة|قلاب|هيلكس|نترا|هيونداي|اكسنت|توسان/i },
  { key:'cranes',     icon:'🏗️', label:'الرافعات والمعدات الثقيلة', re:/رافعه|كرين|شوكية|مكينة|سحب|كانات|مصنع الالومنيوم/i },
  { key:'machinery',  icon:'⚙️', label:'الآلات والمعدات الأخرى',    re:/مرصات|لحام|مشحمة|كمبريسور|ماطور|وحدة تبريد|مكينة قص/i },
  { key:'cabins',     icon:'🏠', label:'الكرفانات والحاويات',        re:/كرفان/i },
  { key:'tech',       icon:'💻', label:'الأجهزة والتقنية',           re:/جهاز|طابعه|كاميرا|بصمة|جوال|شاشة|رسيفر/i },
  { key:'appliances', icon:'❄️', label:'الأجهزة الكهربائية',        re:/مكيف|ثلاجة|غساله|سخان|خزان ماء|ماطور هواء/i },
  { key:'furniture',  icon:'🪑', label:'الأثاث والمفروشات',          re:/مكتب|كرسي|اثاث|دولاب|كنبه|خزنة|طاولة|موكيت|كنب|شنط|عربة/i },
  { key:'infra',      icon:'🏗️', label:'التجهيزات والإنشاءات',      re:/تجهيز|تحسين|تقبيل|ارض|سور|سكن|غسالتين|مكيفات سكن/i },
  { key:'other',      icon:'📦', label:'أصول أخرى',                  re:null },  // catch-all
];

function faTypeOf(name) {
  for (const t of FA_TYPES) {
    if (t.re && t.re.test(name)) return t.key;
  }
  return 'other';
}

const FA_FMT = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
const FA_ESC = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

let _faData     = null;   // raw API rows
let _faFilter   = 0;      // branch id, 0 = all
let _faExpanded = new Set(); // expanded type keys
let _faSearch   = '';

/* ── Entry point ── */
async function renderFixedAssetsTab() {
  const wrap = document.getElementById('tab-fixedassets');
  if (!wrap) return;
  if (!wrap.innerHTML.trim()) _faBuildShell(wrap);

  const db = State.get('db');
  _faSetStatus('⏳ جارٍ تحميل بيانات الأصول الثابتة…', '#a87d00');

  try {
    const data = await fetch(`/api/fixed-assets?db=${encodeURIComponent(db)}`).then(r => r.json());
    if (data.error) throw new Error(data.error);
    _faData = data;
    _faExpanded = new Set(FA_TYPES.map(t => t.key));  // expand all by default
    _faRender();
    _faSetStatus(`✅ ${[...new Set(data.map(r=>r.id))].length} أصل | ${new Date().toLocaleTimeString('ar-SA')}`, '#1a7a3c');
  } catch (err) {
    _faSetStatus('❌ ' + err.message, '#c0392b');
    wrap.querySelector('#fa-body').innerHTML =
      `<div style="padding:30px;color:#e74c3c;text-align:center">⚠️ ${FA_ESC(err.message)}</div>`;
  }
}

/* ── Build static shell ── */
function _faBuildShell(wrap) {
  wrap.innerHTML = `
<style>
/* ── FA tab styles ── */
.fa-toolbar{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#162032;border-bottom:1px solid #1e3a5f;flex-wrap:wrap}
.fa-brand{font-size:1rem;font-weight:800;color:#d4a017;flex:1;min-width:140px}
.fa-status{font-size:.8rem;color:#1a7a3c}

.fa-filters{display:flex;align-items:center;gap:10px;padding:10px 18px;background:#111e2d;border-bottom:1px solid #1a2d42;flex-wrap:wrap}
.fa-filters label{font-size:.82rem;color:#8a9bb5}
.fa-chip-group{display:flex;gap:6px;flex-wrap:wrap}
.fa-chip{
  padding:4px 13px;border-radius:20px;font-size:.8rem;cursor:pointer;
  border:1px solid #1e3a5f;background:#162032;color:#8a9bb5;transition:.15s;
}
.fa-chip:hover{border-color:#d4a017;color:#d4a017}
.fa-chip.active{background:#d4a017;color:#000;border-color:#d4a017;font-weight:700}
.fa-search{
  background:#162032;border:1px solid #1e3a5f;border-radius:20px;
  padding:4px 14px;color:#e8edf5;font-family:Tajawal,sans-serif;font-size:.85rem;width:200px;
  outline:none;
}
.fa-search:focus{border-color:#d4a017}

.fa-kpis{display:flex;gap:12px;padding:14px 18px;flex-wrap:wrap}
.fa-kpi{
  background:#162032;border:1px solid #1e3a5f;border-radius:10px;
  padding:12px 20px;min-width:170px;text-align:center;position:relative;overflow:hidden;
}
.fa-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:#d4a017}
.fa-kpi.green::before{background:#27ae60}
.fa-kpi label{display:block;font-size:.75rem;color:#8a9bb5;margin-bottom:4px}
.fa-kpi .fa-val{font-size:1.25rem;font-weight:800;color:#d4a017;font-family:'Cairo',sans-serif}
.fa-kpi.green .fa-val{color:#27ae60}

.fa-body{padding:0 18px 30px}
.fa-group{margin-bottom:8px;border:1px solid #1e3a5f;border-radius:8px;overflow:hidden}
.fa-group-hdr{
  display:flex;align-items:center;gap:10px;
  padding:9px 14px;background:#1a2d4a;cursor:pointer;user-select:none;
  font-weight:700;font-size:.88rem;color:#cdd8e8;
}
.fa-group-hdr:hover{background:#1f3560}
.fa-group-hdr .fa-chevron{transition:.2s;display:inline-block;font-size:.75rem;color:#8a9bb5;margin-left:auto}
.fa-group-hdr .fa-g-total{font-size:.82rem;color:#d4a017;margin-left:auto;font-family:'Cairo',sans-serif}
.fa-group-hdr .fa-g-count{font-size:.75rem;color:#8a9bb5;background:#0d1b2a;padding:2px 8px;border-radius:10px}
.fa-group-rows{display:none}
.fa-group-rows.open{display:block}

table.fa-tbl{border-collapse:collapse;width:100%;font-size:.8rem}
table.fa-tbl th{
  background:#111e2d;color:#8a9bb5;font-size:.72rem;
  padding:6px 10px;text-align:center;border-bottom:1px solid #1a2d42;
  white-space:nowrap;
}
table.fa-tbl th.col-lbl{text-align:right}
table.fa-tbl td{
  padding:6px 10px;border-bottom:1px solid #0f1e2d;text-align:center;
  white-space:nowrap;
}
table.fa-tbl td.col-lbl{text-align:right;max-width:300px;white-space:normal}
table.fa-tbl tr:hover td{background:rgba(212,160,23,.05)}
table.fa-tbl td.num{font-family:'Cairo',sans-serif;color:#c5d3e0}
table.fa-tbl td.num.hi{color:#d4a017;font-weight:700}
table.fa-tbl .branch-badge{
  display:inline-block;font-size:.7rem;padding:2px 8px;border-radius:10px;
  background:rgba(30,58,95,.6);color:#7ab4e0;border:1px solid #1e3a5f;
}
.fa-group-total td{background:#111e2d;font-weight:700;color:#d4a017;border-top:2px solid #1e3a5f}
.fa-empty{padding:40px;text-align:center;color:#5a7a9a}
</style>

<div class="fa-toolbar">
  <div class="fa-brand">🏭 الأصول الثابتة<br><small style="font-size:.7rem;font-weight:400;color:#8a9bb5">تفاصيل حسب الفرع والتصنيف</small></div>
  <span class="fa-status" id="fa-status"></span>
</div>

<div class="fa-filters">
  <label>الفرع:</label>
  <div class="fa-chip-group" id="fa-branch-chips"></div>
  <label style="margin-right:12px">التصنيف:</label>
  <div class="fa-chip-group" id="fa-type-chips"></div>
  <input class="fa-search" id="fa-search" placeholder="بحث…" type="text">
  <button onclick="_faExpandAll(true)"  style="margin-right:auto;background:transparent;border:1px solid #1e3a5f;color:#8a9bb5;border-radius:6px;padding:4px 12px;font-family:Tajawal,sans-serif;font-size:.8rem;cursor:pointer">توسيع الكل</button>
  <button onclick="_faExpandAll(false)" style="background:transparent;border:1px solid #1e3a5f;color:#8a9bb5;border-radius:6px;padding:4px 12px;font-family:Tajawal,sans-serif;font-size:.8rem;cursor:pointer">طي الكل</button>
</div>

<div class="fa-kpis" id="fa-kpis"></div>
<div class="fa-body" id="fa-body"></div>
`;

  // Branch chips (static branches known from data)
  const BRANCHES = [
    { id:0, name:'كل الفروع' },
    { id:1, name:'الفرع الرئيسي' },
    { id:2, name:'مصنع حوراء' },
    { id:3, name:'شقق داماس الرياض' },
    { id:4, name:'شقق داماس خميس مشيط' },
    { id:5, name:'فندق واحة جدة' },
  ];
  const chipGroup = wrap.querySelector('#fa-branch-chips');
  BRANCHES.forEach(b => {
    const chip = document.createElement('div');
    chip.className = 'fa-chip' + (b.id === 0 ? ' active' : '');
    chip.textContent = b.name;
    chip.dataset.branch = b.id;
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('#fa-branch-chips .fa-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _faFilter = b.id;
      _faRender();
    });
    chipGroup.appendChild(chip);
  });

  // Type chips
  const typeGroup = wrap.querySelector('#fa-type-chips');
  const allTypeChip = document.createElement('div');
  allTypeChip.className = 'fa-chip active';
  allTypeChip.textContent = 'الكل';
  allTypeChip.dataset.type = 'all';
  typeGroup.appendChild(allTypeChip);
  FA_TYPES.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'fa-chip';
    chip.textContent = t.icon + ' ' + t.label;
    chip.dataset.type = t.key;
    typeGroup.appendChild(chip);
  });
  typeGroup.addEventListener('click', e => {
    const chip = e.target.closest('.fa-chip');
    if (!chip) return;
    typeGroup.querySelectorAll('.fa-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    _faRender();
  });

  // Search
  wrap.querySelector('#fa-search').addEventListener('input', e => {
    _faSearch = e.target.value.trim();
    _faRender();
  });
}

/* ── Expand / collapse all ── */
function _faExpandAll(open) {
  if (!_faData) return;
  if (open) FA_TYPES.forEach(t => _faExpanded.add(t.key));
  else _faExpanded.clear();
  _faRender();
}

/* ── Render ── */
function _faRender() {
  if (!_faData) return;
  const wrap = document.getElementById('tab-fixedassets');
  if (!wrap) return;

  const activeTypeChip = wrap.querySelector('#fa-type-chips .fa-chip.active');
  const typeFilter = activeTypeChip ? activeTypeChip.dataset.type : 'all';

  // Filter rows
  let rows = _faData.filter(r => r.bookValue > 0 || r.jvLines > 0);
  if (_faFilter) rows = rows.filter(r => r.branch === _faFilter);
  if (_faSearch) {
    const q = _faSearch.toLowerCase();
    rows = rows.filter(r => (r.nameAr||'').toLowerCase().includes(q));
  }

  // Group by asset id first (merge same asset across branches if filter=all)
  const byId = new Map();
  rows.forEach(r => {
    if (!byId.has(r.id)) byId.set(r.id, { ...r, branches: [] });
    const e = byId.get(r.id);
    e.branches.push({ branch: r.branch, branchName: r.branchName, bookValue: r.bookValue, accumDepr: r.accumDepr, netBookValue: r.netBookValue });
    // aggregate when multiple branches
    if (e.branches.length > 1) {
      e.bookValue    = e.branches.reduce((s,b)=>s+b.bookValue,0);
      e.accumDepr    = e.branches.reduce((s,b)=>s+b.accumDepr,0);
      e.netBookValue = e.branches.reduce((s,b)=>s+b.netBookValue,0);
    }
  });
  const assets = [...byId.values()];

  // Group by type
  const grouped = new Map();
  FA_TYPES.forEach(t => grouped.set(t.key, []));
  assets.forEach(a => {
    const k = faTypeOf(a.nameAr);
    grouped.get(k).push(a);
  });

  // KPIs
  const totAssets   = assets.length;
  const totValue    = assets.reduce((s,a)=>s+a.bookValue,0);
  const totDepr     = assets.reduce((s,a)=>s+a.accumDepr,0);
  const totNet      = assets.reduce((s,a)=>s+a.netBookValue,0);
  wrap.querySelector('#fa-kpis').innerHTML = `
    <div class="fa-kpi"><label>عدد الأصول</label><div class="fa-val">${totAssets}</div></div>
    <div class="fa-kpi"><label>إجمالي التكلفة (ر.س)</label><div class="fa-val">${FA_FMT(totValue)}</div></div>
    <div class="fa-kpi"><label>إجمالي الإهلاك المتراكم (ر.س)</label><div class="fa-val">${FA_FMT(totDepr)}</div></div>
    <div class="fa-kpi green"><label>صافي القيمة الدفترية (ر.س)</label><div class="fa-val">${FA_FMT(totNet)}</div></div>
  `;

  // Build groups HTML
  let html = '';
  FA_TYPES.forEach(t => {
    if (typeFilter !== 'all' && typeFilter !== t.key) return;
    const list = grouped.get(t.key) || [];
    if (!list.length) return;

    const gTotal = list.reduce((s,a)=>s+a.bookValue,0);
    const gNet   = list.reduce((s,a)=>s+a.netBookValue,0);
    const isOpen = _faExpanded.has(t.key);

    html += `
<div class="fa-group">
  <div class="fa-group-hdr" onclick="_faToggleGroup('${t.key}')">
    <span>${t.icon}</span>
    <span>${FA_ESC(t.label)}</span>
    <span class="fa-g-count">${list.length} أصل</span>
    <span class="fa-g-total">${FA_FMT(gTotal)} ر.س</span>
    <span class="fa-chevron">${isOpen ? '▲' : '▼'}</span>
  </div>
  <div class="fa-group-rows ${isOpen ? 'open' : ''}" id="fa-grp-${t.key}">
    <table class="fa-tbl">
      <thead>
        <tr>
          <th class="col-lbl">اسم الأصل</th>
          <th>تاريخ الاقتناء</th>
          <th>الفرع</th>
          <th>التكلفة</th>
          <th>إهلاك متراكم</th>
          <th>صافي الدفتري</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(a => {
          const branchBadges = _faFilter
            ? (a.branchName ? `<span class="branch-badge">${FA_ESC(a.branchName)}</span>` : '—')
            : a.branches.map(b => b.branchName
                ? `<span class="branch-badge">${FA_ESC(b.branchName)}</span>`
                : '').join(' ') || '—';

          return `<tr>
            <td class="col-lbl">${FA_ESC(a.nameAr)}</td>
            <td>${a.acquisitionDate || '—'}</td>
            <td>${branchBadges}</td>
            <td class="num hi">${FA_FMT(a.bookValue)}</td>
            <td class="num">${a.accumDepr ? FA_FMT(a.accumDepr) : '—'}</td>
            <td class="num">${FA_FMT(a.netBookValue)}</td>
          </tr>`;
        }).join('')}
        <tr class="fa-group-total">
          <td class="col-lbl" colspan="3">إجمالي ${FA_ESC(t.label)}</td>
          <td class="num">${FA_FMT(gTotal)}</td>
          <td class="num">—</td>
          <td class="num">${FA_FMT(gNet)}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`;
  });

  if (!html) html = `<div class="fa-empty">لا توجد أصول تطابق الفلتر المحدد</div>`;
  wrap.querySelector('#fa-body').innerHTML = html;
}

/* ── Toggle group ── */
function _faToggleGroup(key) {
  if (_faExpanded.has(key)) _faExpanded.delete(key);
  else _faExpanded.add(key);

  const rows = document.getElementById('fa-grp-' + key);
  const hdr  = rows?.previousElementSibling;
  if (!rows) return;
  rows.classList.toggle('open', _faExpanded.has(key));
  const chev = hdr?.querySelector('.fa-chevron');
  if (chev) chev.textContent = _faExpanded.has(key) ? '▲' : '▼';
}

/* ── Status ── */
function _faSetStatus(msg, color) {
  const el = document.getElementById('fa-status');
  if (el) { el.textContent = msg; el.style.color = color; }
}
