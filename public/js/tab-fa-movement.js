// ── FIXED ASSETS MOVEMENT (COST) NOTE — تقرير حركة الأصول الثابتة ──────────────
'use strict';

// نفس تصنيف تاب "الأصول الثابتة" حرفياً — لضمان تطابق الإجماليات بين التابين.
const FAM_TYPES = [
  { key:'vehicles',   icon:'🚗', label:'المركبات',                  re:/سيارة|دينة|قلاب|هيلكس|نترا|هيونداي|اكسنت|توسان/i },
  { key:'cranes',     icon:'🏗️', label:'الرافعات والمعدات الثقيلة', re:/رافعه|كرين|شوكية|مكينة|سحب|كانات|مصنع الالومنيوم/i },
  { key:'machinery',  icon:'⚙️', label:'الآلات والمعدات الأخرى',    re:/مرصات|لحام|مشحمة|كمبريسور|ماطور|موتور|وحدة تبريد|مكينة قص/i },
  { key:'cabins',     icon:'🏠', label:'الكرفانات والحاويات',        re:/كرفان/i },
  { key:'tech',       icon:'💻', label:'الأجهزة والتقنية',           re:/جهاز|حاسوب|طابعه|كاميرا|بصمة|جوال|شاشة|رسيفر/i },
  { key:'appliances', icon:'❄️', label:'الأجهزة الكهربائية',        re:/مكيف|ثلاجة|ثلاجات|غساله|غسالة|سخان|خزان ماء|ماطور هواء|سكوتر/i },
  { key:'furniture',  icon:'🪑', label:'الأثاث والمفروشات',          re:/مكتب|كرسي|اثاث|دولاب|كنبه|خزنة|طاولة|موكيت|كنب|شنط|عربة/i },
  { key:'infra',      icon:'🏗️', label:'التجهيزات والإنشاءات',      re:/تجهيز|تحسين|تقبيل|ارض|سور|سكن|غسالتين|مكيفات سكن/i },
  { key:'other',      icon:'📦', label:'أصول أخرى',                  re:null },
];
function famTypeOf(name) {
  for (const t of FAM_TYPES) { if (t.re && t.re.test(name)) return t.key; }
  return 'other';
}

const FAM_FMT = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
const FAM_ESC = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const FAM_BRANCHES = [
  { id:0, name:'كل الفروع' },
  { id:1, name:'الفرع الرئيسي' },
  { id:2, name:'مصنع حوراء' },
  { id:3, name:'شقق داماس الرياض' },
  { id:4, name:'شقق داماس خميس مشيط' },
  { id:5, name:'فندق واحة جدة' },
];

let _famRows     = null;
let _famPeriod   = null; // { periodStart, asOf }
let _famExpanded = new Set();
let _famFilter   = 0; // branch id, 0 = كل الفروع

async function renderFaMovementTab() {
  const wrap = document.getElementById('tab-fa-movement');
  if (!wrap) return;
  if (!wrap.innerHTML.trim()) _famBuildShell(wrap);
  await _famLoad();
}

function _famBuildShell(wrap) {
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= thisYear - 3; y--) years.push(y);

  wrap.innerHTML = `
<style>
.fam-toolbar{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#162032;border-bottom:1px solid #1e3a5f;flex-wrap:wrap}
.fam-brand{font-size:1rem;font-weight:800;color:#d4a017;flex:1;min-width:200px}
.fam-status{font-size:.8rem;color:#1a7a3c}
.fam-year-sel{background:#0d1b2a;border:1px solid #1e3a5f;border-radius:6px;color:#e8edf5;font-family:Tajawal,sans-serif;font-size:.85rem;padding:4px 10px}
.fam-export-btn{padding:5px 14px;border-radius:6px;font-family:Tajawal,sans-serif;font-size:.82rem;cursor:pointer;border:1px solid #27ae60;color:#27ae60;background:transparent}
.fam-export-btn:hover{background:#0d2a1a}

.fam-filters{display:flex;align-items:center;gap:10px;padding:10px 18px;background:#111e2d;border-bottom:1px solid #1a2d42;flex-wrap:wrap}
.fam-filters label{font-size:.82rem;color:#8a9bb5}
.fam-chip-group{display:flex;gap:6px;flex-wrap:wrap}
.fam-chip{padding:4px 13px;border-radius:20px;font-size:.8rem;cursor:pointer;border:1px solid #1e3a5f;background:#162032;color:#8a9bb5;transition:.15s}
.fam-chip:hover{border-color:#d4a017;color:#d4a017}
.fam-chip.active{background:#d4a017;color:#000;border-color:#d4a017;font-weight:700}
.fam-branch-badge{display:inline-block;font-size:.7rem;padding:2px 8px;border-radius:10px;background:rgba(30,58,95,.6);color:#7ab4e0;border:1px solid #1e3a5f;margin:1px}

.fam-kpis{display:flex;gap:12px;padding:14px 18px;flex-wrap:wrap}
.fam-kpi{background:#162032;border:1px solid #1e3a5f;border-radius:10px;padding:12px 20px;min-width:180px;text-align:center;position:relative;overflow:hidden}
.fam-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:#8a9bb5}
.fam-kpi.add::before{background:#27ae60}
.fam-kpi.disp::before{background:#c0392b}
.fam-kpi.close::before{background:#d4a017}
.fam-kpi label{display:block;font-size:.75rem;color:#8a9bb5;margin-bottom:4px}
.fam-kpi .fam-val{font-size:1.25rem;font-weight:800;color:#c5d3e0;font-family:'Cairo',sans-serif}
.fam-kpi.add .fam-val{color:#27ae60}
.fam-kpi.disp .fam-val{color:#e74c3c}
.fam-kpi.close .fam-val{color:#d4a017}

.fam-note{padding:0 18px 6px;font-size:.78rem;color:#7a8ba5}
.fam-body{padding:0 18px 30px}

table.fam-tbl{border-collapse:collapse;width:100%;font-size:.82rem;background:#101c2c;border:1px solid #1e3a5f;border-radius:8px;overflow:hidden}
table.fam-tbl th{background:#111e2d;color:#8a9bb5;font-size:.75rem;padding:8px 10px;text-align:center;border-bottom:1px solid #1a2d42;white-space:nowrap}
table.fam-tbl th.col-lbl{text-align:right}
table.fam-tbl td{padding:7px 10px;border-bottom:1px solid #16283c;text-align:center;white-space:nowrap}
table.fam-tbl td.col-lbl{text-align:right;cursor:pointer}
table.fam-tbl tr.fam-cat-row:hover td{background:rgba(212,160,23,.05)}
table.fam-tbl td.num{font-family:'Cairo',sans-serif;color:#c5d3e0}
table.fam-tbl td.num.add{color:#27ae60}
table.fam-tbl td.num.disp{color:#e74c3c}
table.fam-tbl td.num.close{color:#d4a017;font-weight:700}
table.fam-tbl tr.fam-grand td{background:#111e2d;font-weight:800;border-top:2px solid #1e3a5f}
.fam-chevron{font-size:.7rem;color:#8a9bb5;margin-left:6px}

.fam-detail-row{display:none}
.fam-detail-row.open{display:table-row}
.fam-detail-row td{background:#0c1622;font-size:.76rem;color:#9ab0c8}
.fam-empty{padding:40px;text-align:center;color:#5a7a9a}

@media print{
  body{background:#fff!important;color:#000!important}
  .tab-bar,.conn-bar,.sidebar,.fam-toolbar,.fam-export-btn,#fam-status{display:none!important}
  .wrap,.fam-body{padding:0!important;background:#fff!important}
  table.fam-tbl th{background:#dde6f4!important;color:#111!important;-webkit-print-color-adjust:exact}
  table.fam-tbl td{color:#111!important}
}
</style>

<div class="fam-toolbar">
  <div class="fam-brand">📑 حركة الأصول الثابتة (تكلفة)<br><small style="font-size:.7rem;font-weight:400;color:#8a9bb5">إيضاح رصيد أول المدة، الإضافات، الاستبعادات، ورصيد آخر المدة</small></div>
  <span class="fam-status" id="fam-status"></span>
  <label style="font-size:.8rem;color:#8a9bb5">السنة:</label>
  <select class="fam-year-sel" id="fam-year-sel">
    ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
  </select>
  <button class="fam-export-btn" id="fam-btn-excel">📊 Excel</button>
</div>

<div class="fam-filters">
  <label>الفرع:</label>
  <div class="fam-chip-group" id="fam-branch-chips"></div>
</div>

<div class="fam-kpis" id="fam-kpis"></div>
<div class="fam-note" id="fam-note"></div>
<div class="fam-body" id="fam-body"></div>
`;

  wrap.querySelector('#fam-year-sel').addEventListener('change', () => _famLoad());
  wrap.querySelector('#fam-btn-excel').addEventListener('click', () => _famExportExcel());

  // Branch chips
  const chipGroup = wrap.querySelector('#fam-branch-chips');
  FAM_BRANCHES.forEach(b => {
    const chip = document.createElement('div');
    chip.className = 'fam-chip' + (b.id === 0 ? ' active' : '');
    chip.textContent = b.name;
    chip.dataset.branch = b.id;
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('#fam-branch-chips .fam-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _famFilter = b.id;
      _famRender();
    });
    chipGroup.appendChild(chip);
  });

  // إعادة تحميل تلقائية عند تبديل قاعدة البيانات من المحدد العلوي
  State.on('activeDb', () => { if (_famRows) _famLoad(); });
}

async function _famLoad() {
  const wrap = document.getElementById('tab-fa-movement');
  if (!wrap) return;
  const db = State.get('activeDb');
  const year = +wrap.querySelector('#fam-year-sel').value;
  const thisYear = new Date().getFullYear();
  const periodStart = `${year}-01-01`;
  const asOf = year === thisYear ? new Date().toISOString().slice(0, 10) : `${year}-12-31`;

  _famSetStatus('⏳ جارٍ التحميل…', '#a87d00');
  try {
    const data = await fetch(`/api/fixed-assets-movement?db=${encodeURIComponent(db)}&periodStart=${periodStart}&asOf=${asOf}`).then(r => r.json());
    if (data.error) throw new Error(data.error);
    _famRows = data.rows;
    _famPeriod = { periodStart: data.periodStart, asOf: data.asOf };
    _famRender();
    _famSetStatus(`✅ محدَّث | ${new Date().toLocaleTimeString('ar-SA')}`, '#1a7a3c');
  } catch (err) {
    _famSetStatus('❌ ' + err.message, '#c0392b');
    wrap.querySelector('#fam-body').innerHTML = `<div style="padding:30px;color:#e74c3c;text-align:center">⚠️ ${FAM_ESC(err.message)}</div>`;
  }
}

// يفلتر حسب الفرع المختار، ويدمج الأصل الواحد عبر أكثر من فرع عند اختيار "كل الفروع"
function _famFilteredRows() {
  let rows = (_famRows || []).filter(r => r.jvLines > 0 || r.opening || r.additions || r.disposals || r.closing);
  if (_famFilter) rows = rows.filter(r => r.branch === _famFilter);

  const byId = new Map();
  rows.forEach(r => {
    if (!byId.has(r.id)) byId.set(r.id, { ...r, branches: [] });
    const e = byId.get(r.id);
    e.branches.push({ branch: r.branch, branchName: r.branchName, opening: r.opening, additions: r.additions, disposals: r.disposals, closing: r.closing });
    if (e.branches.length > 1) {
      e.opening   = e.branches.reduce((s,b)=>s+b.opening,0);
      e.additions = e.branches.reduce((s,b)=>s+b.additions,0);
      e.disposals = e.branches.reduce((s,b)=>s+b.disposals,0);
      e.closing   = e.branches.reduce((s,b)=>s+b.closing,0);
    }
  });
  return [...byId.values()];
}

function _famGroups() {
  const rows = _famFilteredRows();
  const grouped = new Map();
  FAM_TYPES.forEach(t => grouped.set(t.key, []));
  rows.forEach(r => grouped.get(famTypeOf(r.nameAr)).push(r));
  return FAM_TYPES.map(t => ({ ...t, list: grouped.get(t.key) || [] })).filter(g => g.list.length > 0);
}

function _famRender() {
  const wrap = document.getElementById('tab-fa-movement');
  if (!wrap || !_famRows) return;
  const groups = _famGroups();

  const totOpen  = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.opening,0),0);
  const totAdd   = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.additions,0),0);
  const totDisp  = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.disposals,0),0);
  const totClose = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.closing,0),0);

  wrap.querySelector('#fam-kpis').innerHTML = `
    <div class="fam-kpi"><label>رصيد أول المدة (${_famPeriod.periodStart})</label><div class="fam-val">${FAM_FMT(totOpen)}</div></div>
    <div class="fam-kpi add"><label>الإضافات خلال الفترة</label><div class="fam-val">${FAM_FMT(totAdd)}</div></div>
    <div class="fam-kpi disp"><label>الاستبعادات خلال الفترة</label><div class="fam-val">${FAM_FMT(totDisp)}</div></div>
    <div class="fam-kpi close"><label>رصيد آخر المدة (${_famPeriod.asOf})</label><div class="fam-val">${FAM_FMT(totClose)}</div></div>
  `;
  wrap.querySelector('#fam-note').textContent =
    `تكلفة فقط (لا يشمل الإهلاك). الاستبعادات = مرتجعات/تصحيحات تكلفة على حسابات الأصول، لا تشمل قيود الإهلاك المرحّلة على حساب الإهلاك المخصص لكل أصل.`;

  if (!groups.length) {
    wrap.querySelector('#fam-body').innerHTML = `<div class="fam-empty">لا توجد حركة على الأصول الثابتة لهذه الفترة</div>`;
    return;
  }

  let html = `<table class="fam-tbl"><thead><tr>
    <th class="col-lbl">التصنيف</th><th>عدد الأصول</th>
    <th>رصيد أول المدة</th><th>إضافات</th><th>استبعادات</th><th>رصيد آخر المدة</th>
  </tr></thead><tbody>`;

  groups.forEach(g => {
    const gOpen  = g.list.reduce((s,r)=>s+r.opening,0);
    const gAdd   = g.list.reduce((s,r)=>s+r.additions,0);
    const gDisp  = g.list.reduce((s,r)=>s+r.disposals,0);
    const gClose = g.list.reduce((s,r)=>s+r.closing,0);
    const isOpen = _famExpanded.has(g.key);

    html += `<tr class="fam-cat-row" data-famkey="${g.key}">
      <td class="col-lbl">${g.icon} ${FAM_ESC(g.label)}<span class="fam-chevron">${isOpen ? '▲' : '▼'}</span></td>
      <td class="num">${g.list.length}</td>
      <td class="num">${FAM_FMT(gOpen)}</td>
      <td class="num add">${gAdd ? FAM_FMT(gAdd) : '—'}</td>
      <td class="num disp">${gDisp ? FAM_FMT(gDisp) : '—'}</td>
      <td class="num close">${FAM_FMT(gClose)}</td>
    </tr>`;

    html += `<tr class="fam-detail-row ${isOpen ? 'open' : ''}" id="fam-det-${g.key}"><td colspan="6" style="padding:0">
      <table class="fam-tbl" style="border:none;border-radius:0">
        <thead><tr><th class="col-lbl">اسم الأصل</th><th>تاريخ الاقتناء</th><th>الفرع</th><th>أول المدة</th><th>إضافات</th><th>استبعادات</th><th>آخر المدة</th></tr></thead>
        <tbody>
          ${g.list.map(r => {
            const branchBadges = _famFilter
              ? (r.branchName ? `<span class="fam-branch-badge">${FAM_ESC(r.branchName)}</span>` : '—')
              : r.branches.map(b => b.branchName ? `<span class="fam-branch-badge">${FAM_ESC(b.branchName)}</span>` : '').join(' ') || '—';
            return `<tr>
            <td class="col-lbl">${FAM_ESC(r.nameAr)}</td>
            <td>${r.acquisitionDate || '—'}</td>
            <td>${branchBadges}</td>
            <td class="num">${FAM_FMT(r.opening)}</td>
            <td class="num add">${r.additions ? FAM_FMT(r.additions) : '—'}</td>
            <td class="num disp">${r.disposals ? FAM_FMT(r.disposals) : '—'}</td>
            <td class="num close">${FAM_FMT(r.closing)}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </td></tr>`;
  });

  html += `<tr class="fam-grand">
    <td class="col-lbl">الإجمالي الكلي</td><td class="num">${groups.reduce((s,g)=>s+g.list.length,0)}</td>
    <td class="num">${FAM_FMT(totOpen)}</td><td class="num add">${FAM_FMT(totAdd)}</td>
    <td class="num disp">${FAM_FMT(totDisp)}</td><td class="num close">${FAM_FMT(totClose)}</td>
  </tr>`;
  html += `</tbody></table>`;

  const body = wrap.querySelector('#fam-body');
  body.innerHTML = html;
  if (!body._famDelegated) {
    body._famDelegated = true;
    body.addEventListener('click', e => {
      const row = e.target.closest('.fam-cat-row[data-famkey]');
      if (row) _famToggle(row.dataset.famkey);
    });
  }
}

function _famToggle(key) {
  if (_famExpanded.has(key)) _famExpanded.delete(key); else _famExpanded.add(key);
  _famRender();
}

function _famSetStatus(msg, color) {
  const el = document.getElementById('fam-status');
  if (el) { el.textContent = msg; el.style.color = color; }
}

async function _famExportExcel() {
  if (!_famRows) { alert('لا توجد بيانات'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const groups = _famGroups();
  const totOpen  = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.opening,0),0);
  const totAdd   = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.additions,0),0);
  const totDisp  = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.disposals,0),0);
  const totClose = groups.reduce((s,g)=>s+g.list.reduce((a,r)=>a+r.closing,0),0);

  const company = State.get('companyName') || '';
  const numFmt = '#,##0.00';
  const CLR = { navy:'FF0A2040', navyMid:'FF1A3A6A', bluePale:'FFF4F7FB', gold:'FFD4A017', white:'FFFFFFFF' };
  const FONT = 'Calibri';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard';
  wb.created = new Date();
  const ws = wb.addWorksheet('حركة الأصول الثابتة', { views: [{ rightToLeft: true }] });
  ws.pageSetup.paperSize = 9; ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.fitToPage = true; ws.pageSetup.fitToWidth = 1;

  ws.columns = [
    { width: 42 }, { width: 14 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  const cenAlign = { horizontal:'center', vertical:'middle' };
  const rtlAlign = { horizontal:'right', vertical:'middle', readingOrder:2 };
  const numAlign = { horizontal:'right', vertical:'middle' };

  const r1 = ws.addRow(['إيضاح حركة الأصول الثابتة (تكلفة)', '', '', '', '', '', '']);
  ws.mergeCells(`A${r1.number}:G${r1.number}`);
  r1.getCell('A').font = { name:FONT, bold:true, size:16, color:{ argb:CLR.navy } };
  r1.getCell('A').alignment = cenAlign; r1.height = 28;

  const r2 = ws.addRow([company, '', '', '', '', '', '']);
  ws.mergeCells(`A${r2.number}:G${r2.number}`);
  r2.getCell('A').font = { name:FONT, size:11, color:{ argb:'FF334466' } };
  r2.getCell('A').alignment = cenAlign;

  const branchLbl = (FAM_BRANCHES.find(b => b.id === _famFilter) || FAM_BRANCHES[0]).name;
  const r3 = ws.addRow([`من ${_famPeriod.periodStart} إلى ${_famPeriod.asOf}   |   الفرع: ${branchLbl}`, '', '', '', '', '', '']);
  ws.mergeCells(`A${r3.number}:G${r3.number}`);
  r3.getCell('A').font = { name:FONT, size:10, color:{ argb:'FF667788' } };
  r3.getCell('A').alignment = cenAlign; r3.height = 18;
  ws.addRow([]);

  const hRow = ws.addRow(['التصنيف / الأصل', 'تاريخ الاقتناء', 'الفرع', 'رصيد أول المدة (ر.س)', 'إضافات (ر.س)', 'استبعادات (ر.س)', 'رصيد آخر المدة (ر.س)']);
  hRow.height = 22;
  hRow.eachCell(c => {
    c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.navy } };
    c.font = { name:FONT, bold:true, color:{ argb:CLR.white }, size:10 };
    c.alignment = cenAlign;
  });
  hRow.getCell(1).alignment = rtlAlign;

  groups.forEach(g => {
    const gOpen  = g.list.reduce((s,r)=>s+r.opening,0);
    const gAdd   = g.list.reduce((s,r)=>s+r.additions,0);
    const gDisp  = g.list.reduce((s,r)=>s+r.disposals,0);
    const gClose = g.list.reduce((s,r)=>s+r.closing,0);

    const gRow = ws.addRow([`${g.icon} ${g.label} (${g.list.length} أصل)`, '', '', gOpen, gAdd, gDisp, gClose]);
    gRow.eachCell((c,i) => {
      c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.navyMid } };
      c.font = { name:FONT, bold:true, color:{ argb:CLR.white }, size:10 };
      c.alignment = i <= 3 ? rtlAlign : numAlign;
      if (i >= 4) c.numFmt = numFmt;
    });

    g.list.forEach((r, idx) => {
      const branchStr = r.branches.map(b=>b.branchName||'').filter(Boolean).join(' / ') || '—';
      const dRow = ws.addRow([r.nameAr, r.acquisitionDate||'—', branchStr, r.opening, r.additions, r.disposals, r.closing]);
      dRow.getCell(1).alignment = rtlAlign;
      dRow.getCell(2).alignment = cenAlign;
      dRow.getCell(3).alignment = rtlAlign;
      [4,5,6,7].forEach(i => { dRow.getCell(i).numFmt = numFmt; dRow.getCell(i).alignment = numAlign; });
      if (idx % 2 === 1) {
        const altFill = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.bluePale } };
        [1,2,3,4,5,6,7].forEach(i => { dRow.getCell(i).fill = altFill; });
      }
    });
  });

  const gtRow = ws.addRow(['الإجمالي الكلي', '', '', totOpen, totAdd, totDisp, totClose]);
  ws.mergeCells(`A${gtRow.number}:C${gtRow.number}`);
  gtRow.eachCell((c,i) => {
    c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:CLR.navy } };
    c.font = { name:FONT, bold:true, color:{ argb:CLR.gold }, size:11 };
    c.alignment = i <= 3 ? rtlAlign : numAlign;
    if (i >= 4) c.numFmt = numFmt;
  });

  try {
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `حركة_الأصول_الثابتة_${_famPeriod.periodStart}_${_famPeriod.asOf}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    alert('خطأ في التصدير: ' + e.message);
  }
}
