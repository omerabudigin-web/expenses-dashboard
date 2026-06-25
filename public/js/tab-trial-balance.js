// ── TRIAL BALANCE tab ─────────────────────────────────────────────────────────

let _tbData       = null;
let _tbCmpData    = null;
let _tbInited     = false;
let _tbExpanded   = new Set();
let _tbAutoTimer  = null;
let _tbCountdown  = 0;
let _tbChartInst  = null;
const TB_REFRESH_SEC = 60;

function _tbIsActive() { return !!document.querySelector('.tab.active[data-tab="trial"]'); }
function _tbStopAuto()  { if (_tbAutoTimer) { clearInterval(_tbAutoTimer); _tbAutoTimer = null; } }
function _tbStartAuto() {
  _tbStopAuto();
  _tbCountdown = TB_REFRESH_SEC;
  _tbAutoTimer = setInterval(() => {
    if (!_tbIsActive()) { _tbStopAuto(); return; }
    _tbCountdown--;
    const el = document.getElementById('tb-status');
    if (_tbCountdown > 0) {
      if (el && _tbData) {
        el.textContent = `✅ ${_tbData.length} حساب | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_tbCountdown}ث`;
        el.style.color = '#1a7a3c';
      }
    } else {
      _tbCountdown = TB_REFRESH_SEC;
      fetchTrialBalance();
    }
  }, 1000);
}

function _tbLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${ym}-${String(d.getDate()).padStart(2, '0')}`;
}

function initTrialBalance() {
  if (_tbInited) return;
  _tbInited = true;

  // Quick period selector → sets from/to month inputs
  const DATA_START_YM = '2025-10';  // data begins October 2025
  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  function _tbApplyQuick(val) {
    const from = document.getElementById('tb-from');
    const to   = document.getElementById('tb-to');
    if (val === '2025')      { from.value = DATA_START_YM; to.value = '2025-12'; }
    else if (val === '2026-ytd') { from.value = '2026-01'; to.value = curYM; }
    else if (val === 'all')  { from.value = DATA_START_YM; to.value = curYM; }
    // 'مخصص' → leave as-is
  }

  const quickSel = document.getElementById('tb-quick');
  if (quickSel) {
    quickSel.addEventListener('change', () => _tbApplyQuick(quickSel.value));
    // apply the default selection on init
    _tbApplyQuick(quickSel.value);
    // mark as custom when user edits the month pickers directly
    ['tb-from', 'tb-to'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => { quickSel.value = ''; });
    });
  }

  document.getElementById('tb-run').addEventListener('click', fetchTrialBalance);
  // Delegated click to expand/collapse tree nodes (CSP blocks inline onclick attributes)
  document.getElementById('tb-tbody').addEventListener('click', e => {
    const row = e.target.closest('tr[data-toggle-id]');
    if (!row) return;
    const id = +row.dataset.toggleId;
    if (_tbExpanded.has(id)) _tbExpanded.delete(id);
    else _tbExpanded.add(id);
    _renderTBRows();
  });
  document.getElementById('tb-export-excel').addEventListener('click', () => {
    const btn = document.getElementById('tb-export-excel');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportTBExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 Excel'; });
  });
  document.getElementById('tb-export-html').addEventListener('click',  exportTBHTML);
  document.getElementById('tb-export-csv').addEventListener('click',   exportTBCSV);
  document.getElementById('tb-print').addEventListener('click', () => window.print());
  document.getElementById('tb-search').addEventListener('input', _renderTBRows);
  // Level selector now controls the *default expand depth* of the tree —
  // the data already contains the full hierarchy, so just recompute & redraw.
  document.getElementById('tb-level').addEventListener('change', () => {
    if (_tbData) {
      _tbExpanded = _tbDefaultExpand(_tbData);
      _renderTBRows();
    }
  });
  const tbCmpCb = document.getElementById('tb-compare');
  if (tbCmpCb) tbCmpCb.addEventListener('change', () => { _tbCmpData = null; if (_tbData) fetchTrialBalance(); });

  // Switching the active database must drop any previously fetched balance —
  // otherwise the tree keeps showing the OLD company's accounts/totals under
  // the newly selected company (looked like "missing data" for that company).
  State.on('activeDb', () => {
    if (_tbData) {
      _tbData = null; _tbCmpData = null; _tbExpanded = new Set();
      document.getElementById('tb-tbody').innerHTML = '';
      document.getElementById('tb-tfoot').innerHTML = '';
      document.getElementById('tb-balance-check').innerHTML = '';
      document.getElementById('tb-count').textContent = '';
      document.getElementById('tb-status').textContent = 'تم تغيير الشركة — اضغط "تشغيل التقرير" لعرض ميزان المراجعة';
    }
    _tbPopulateBranches();
  });
}

// Expand every node whose level is below the selected default depth
// (so its children become visible at first render).
function _tbDefaultExpand(data) {
  const lvl = parseInt((document.getElementById('tb-level') || {}).value, 10) || 3;
  const set = new Set();
  data.forEach(r => { if (r.levelNo < lvl) set.add(r.id); });
  return set;
}

// Root nodes of a hierarchical dataset — those whose parent isn't itself in the set
function _tbRootNodes(data) {
  if (!data || !data.length) return [];
  const ids = new Set(data.map(r => r.id));
  return data.filter(r => !r.parentID || !ids.has(r.parentID));
}

// Build parent → children index (sorted by code) for tree rendering
function _tbBuildChildIndex(data) {
  const ids = new Set(data.map(r => r.id));
  const childrenOf = new Map();
  data.forEach(r => {
    if (r.parentID && ids.has(r.parentID)) {
      if (!childrenOf.has(r.parentID)) childrenOf.set(r.parentID, []);
      childrenOf.get(r.parentID).push(r);
    }
  });
  childrenOf.forEach(list => list.sort((a, b) => a.code.localeCompare(b.code)));
  return childrenOf;
}

async function _tbPopulateBranches() {
  const db   = State.get('activeDb');
  const brSel = document.getElementById('tb-branch');
  if (!brSel || !db) return;
  const prev = brSel.value;
  try {
    const list = await fetch(`/api/branches?db=${encodeURIComponent(db)}`).then(r => r.json());
    while (brSel.options.length > 0) brSel.remove(0);
    const all = document.createElement('option'); all.value = 'ALL'; all.textContent = 'جميع الفروع'; brSel.appendChild(all);
    list.filter(b => b.id !== 0).forEach(b => {
      const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; brSel.appendChild(o);
    });
    const unassigned = document.createElement('option'); unassigned.value = '0'; unassigned.textContent = 'غير محدد / بدون فرع'; brSel.appendChild(unassigned);
    // Restore previous selection if still valid
    if ([...brSel.options].some(o => o.value === prev)) brSel.value = prev;
    else brSel.value = 'ALL';
  } catch (e) {
    // leave existing options as-is on failure
  }
}

async function fetchTrialBalance() {
  const from   = document.getElementById('tb-from').value;
  const to     = document.getElementById('tb-to').value;
  const brVal  = document.getElementById('tb-branch').value;
  const branch = brVal === 'ALL' ? 0 : (+brVal || 0);

  if (!from || !to) {
    document.getElementById('tb-status').textContent = 'حدد الفترة أولاً';
    return;
  }

  const fromDate = `${from}-01`;
  const toDate   = _tbLastDay(to);
  const db       = State.get('activeDb') || '';
  const qs       = new URLSearchParams({ db, from: fromDate, to: toDate, branch });

  // Comparison period: same months, previous year
  const prevFrom   = `${+from.substring(0,4)-1}${from.substring(4)}-01`;
  const prevToYM   = `${+to.substring(0,4)-1}${to.substring(4)}`;
  const prevTo     = _tbLastDay(prevToYM);
  const cmpQs      = new URLSearchParams({ db, from: prevFrom, to: prevTo, branch });
  const wantCmp    = !!(document.getElementById('tb-compare')?.checked);

  const loadEl   = document.getElementById('tb-loading');
  const statusEl = document.getElementById('tb-status');
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';
  document.getElementById('tb-tbody').innerHTML = '';
  document.getElementById('tb-tfoot').innerHTML = '';
  document.getElementById('tb-balance-check').innerHTML = '';
  document.getElementById('tb-count').textContent = '';

  try {
    const [resp, cmpRows] = await Promise.all([
      fetch(`/api/trial-balance?${qs}`).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); })),
      wantCmp
        ? fetch(`/api/trial-balance?${cmpQs}`).then(r => r.ok ? r.json() : Promise.resolve([]))
        : Promise.resolve(null),
    ]);
    _tbData    = resp;
    _tbCmpData = cmpRows;
    _tbExpanded = _tbDefaultExpand(_tbData);
    statusEl.textContent = cmpRows ? `${resp.length} حساب + مقارنة` : '';
    _renderTBRows();
    _tbRenderKPIs();
    _tbStartAuto();
  } catch (e) {
    _tbData = null;
    const C = document.getElementById('tb-compare')?.checked ? 11 : 8;
    document.getElementById('tb-tbody').innerHTML =
      `<tr><td colspan="${C}" style="text-align:center;padding:32px;color:#da4a4a">خطأ: ${esc(e.message)}</td></tr>`;
    statusEl.textContent = 'فشل التحميل';
  } finally {
    loadEl.classList.add('hidden');
  }
}

function renderTrialBalance() {
  initTrialBalance();
  _tbPopulateBranches();
  _tbInjectKPIArea();
  if (_tbData) {
    _renderTBRows();
    _tbRenderKPIs();
    _tbStartAuto();
  } else {
    fetchTrialBalance();
  }
}

function _renderTBRows() {
  if (!_tbData) return;

  const search = (document.getElementById('tb-search').value || '').trim().toLowerCase();

  const SEC_LABEL = {
    '1': 'الأصول',
    '2': 'الخصوم',
    '3': 'حقوق الملكية',
    '4': 'المصروفات والتكاليف',
    '5': 'الإيرادات',
  };

  // Comparison state
  const cmp    = !!(document.getElementById('tb-compare')?.checked && _tbCmpData);
  const cmpMap = cmp ? new Map(_tbCmpData.map(r => [r.code, r.closeBal])) : null;
  const C      = cmp ? 11 : 8;

  // Period labels for thead
  const fromYM    = document.getElementById('tb-from').value || '';
  const toYM      = document.getElementById('tb-to').value   || '';
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';

  // Rebuild thead dynamically to reflect column count
  const thead = document.querySelector('#tb-table thead');
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="min-width:110px">كود الحساب</th>
        <th rowspan="2" style="min-width:200px">اسم الحساب</th>
        <th colspan="2" class="tb-col-grp-hdr">رصيد أول الفترة</th>
        <th colspan="2" class="tb-col-grp-hdr">حركة الفترة</th>
        <th colspan="2" class="tb-col-grp-hdr">رصيد آخر الفترة (${esc(fromYM)}–${esc(toYM)})</th>
        ${cmp ? `<th colspan="2" class="tb-col-grp-hdr" style="background:#08192e;color:#5a8aaa">رصيد المقارنة (${esc(prevFromYM)}–${esc(prevToYM)})</th>
                 <th rowspan="2" class="num" style="min-width:80px;background:#08192e;color:#5a8aaa">التغيير&nbsp;%</th>` : ''}
      </tr>
      <tr>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
        ${cmp ? `<th class="num" style="min-width:100px;background:#08192e;color:#4a7aaa">مدين</th>
                 <th class="num" style="min-width:100px;background:#08192e;color:#9a5a5a">دائن</th>` : ''}
      </tr>`;
  }

  // ── Tree structures ─────────────────────────────────────────────────────────
  const byId       = new Map(_tbData.map(r => [r.id, r]));
  const childrenOf = _tbBuildChildIndex(_tbData);
  const roots      = _tbRootNodes(_tbData).slice().sort((a, b) => a.code.localeCompare(b.code));

  // ── Search: limit to matches + their ancestor chain (for context), and
  // force-expand those ancestors so the matches are visible ───────────────────
  let visible     = null;   // null = show everything
  let forceExpand = null;
  let matchCount  = _tbData.length;
  if (search) {
    const matches = _tbData.filter(r =>
      r.code.toLowerCase().includes(search) || (r.name || '').toLowerCase().includes(search)
    );
    matchCount  = matches.length;
    visible     = new Set();
    forceExpand = new Set();
    matches.forEach(m => {
      visible.add(m.id);
      let cur = m;
      while (cur && cur.parentID && byId.has(cur.parentID)) {
        visible.add(cur.parentID);
        forceExpand.add(cur.parentID);
        cur = byId.get(cur.parentID);
      }
    });
  }

  let lastSec = null;
  const html  = [];

  const fmtDr = v => v > 0.004 ? `<span class="tb-dr">${fmt(v, 2)}</span>` : `<span class="tb-zero">—</span>`;
  const fmtCr = v => v > 0.004 ? `<span class="tb-cr">${fmt(v, 2)}</span>` : `<span class="tb-zero">—</span>`;

  function renderNode(r, depth) {
    if (visible && !visible.has(r.id)) return;

    if (depth === 0) {
      const sec = r.code ? r.code[0] : '';
      if (sec !== lastSec && SEC_LABEL[sec]) {
        html.push(`<tr class="tb-grp-hdr"><td colspan="${C}">${SEC_LABEL[sec]}</td></tr>`);
        lastSec = sec;
      }
    }

    const openDr = r.openBal  > 0 ? r.openBal  : 0;
    const openCr = r.openBal  < 0 ? -r.openBal : 0;
    const clDr   = r.closeBal > 0 ? r.closeBal : 0;
    const clCr   = r.closeBal < 0 ? -r.closeBal : 0;

    // Comparison cells
    let cmpCells = '';
    if (cmp) {
      const prevCl  = cmpMap.has(r.code) ? (cmpMap.get(r.code) || 0) : null;
      const pDr     = prevCl !== null && prevCl > 0 ? prevCl  : 0;
      const pCr     = prevCl !== null && prevCl < 0 ? -prevCl : 0;
      const curNet  = r.closeBal || 0;
      const prevNet = prevCl !== null ? prevCl : null;
      let pctCell   = `<span style="color:#3a5a7a">—</span>`;
      if (prevNet !== null && Math.abs(prevNet) > 0.004) {
        const pct = (curNet - prevNet) / Math.abs(prevNet) * 100;
        const col = pct > 0 ? '#4ada8e' : pct < 0 ? '#da6a6a' : '#7090b0';
        pctCell = `<span style="color:${col}">${pct > 0 ? '▲' : '▼'} ${fmt(Math.abs(pct), 1)}%</span>`;
      } else if (prevNet === null) {
        pctCell = `<span style="color:#3a5a7a">جديد</span>`;
      }
      cmpCells = `
        <td class="num" style="background:#06111e">${prevCl !== null ? fmtDr(pDr) : '<span style="color:#2a4060">—</span>'}</td>
        <td class="num" style="background:#06111e">${prevCl !== null ? fmtCr(pCr) : '<span style="color:#2a4060">—</span>'}</td>
        <td class="num" style="background:#06111e">${pctCell}</td>`;
    }

    const kids       = childrenOf.get(r.id) || [];
    const hasKids    = kids.length > 0;
    const isExpanded = hasKids && (_tbExpanded.has(r.id) || (forceExpand && forceExpand.has(r.id)));
    const codeEsc    = esc(r.code);
    const indent     = 8 + depth * 22;

    const toggleAttrs = hasKids ? `data-toggle-id="${r.id}"` : '';
    const arrow = hasKids
      ? `<span class="tb-tree-arrow" style="display:inline-block;width:14px;color:#6a9aca">${isExpanded ? '▼' : '◀'}</span>`
      : `<span class="tb-tree-arrow" style="display:inline-block;width:14px"></span>`;

    html.push(`<tr class="tb-row${hasKids ? ' tb-row-parent' : ''}" style="cursor:${hasKids?'pointer':'default'}" ${toggleAttrs} title="${hasKids?'اضغط للطي/التوسيع':''}">
      <td style="font-family:monospace;font-size:.77rem;padding-right:${indent}px">
        ${arrow}<span class="tb-code" style="color:#6a9aca">${codeEsc}</span>
      </td>
      <td style="${hasKids?'color:#c8e8ff;font-weight:600':''}">${esc(r.name)}</td>
      <td class="num">${fmtDr(openDr)}</td>
      <td class="num">${fmtCr(openCr)}</td>
      <td class="num">${r.pDebit  > 0.004 ? fmtDr(r.pDebit)  : '<span class="tb-zero">—</span>'}</td>
      <td class="num">${r.pCredit > 0.004 ? fmtCr(r.pCredit) : '<span class="tb-zero">—</span>'}</td>
      <td class="num">${fmtDr(clDr)}</td>
      <td class="num">${fmtCr(clCr)}</td>
      ${cmpCells}
    </tr>`);

    if (hasKids && isExpanded) kids.forEach(k => renderNode(k, depth + 1));
  }

  roots.forEach(r => renderNode(r, 0));

  document.getElementById('tb-tbody').innerHTML =
    html.join('') ||
    `<tr><td colspan="${C}" style="text-align:center;padding:32px;color:#3a5a7a">لا توجد حسابات تطابق البحث</td></tr>`;

  // ── Grand totals — summed from ROOT nodes only. Each root's rolled-up
  // totals already include all of its descendants, so summing every rendered
  // row would double- (or triple-) count amounts up the chain. ────────────────
  let totOpenDr = 0, totOpenCr = 0;
  let totPDr    = 0, totPCr    = 0;
  let totClDr   = 0, totClCr   = 0;
  let totCmpDr  = 0, totCmpCr  = 0;
  roots.forEach(r => {
    totOpenDr += r.openBal  > 0 ? r.openBal  : 0;
    totOpenCr += r.openBal  < 0 ? -r.openBal : 0;
    totPDr    += r.pDebit;
    totPCr    += r.pCredit;
    totClDr   += r.closeBal > 0 ? r.closeBal : 0;
    totClCr   += r.closeBal < 0 ? -r.closeBal : 0;
    if (cmp) {
      const prevCl = cmpMap.has(r.code) ? (cmpMap.get(r.code) || 0) : null;
      if (prevCl !== null) {
        totCmpDr += prevCl > 0 ? prevCl  : 0;
        totCmpCr += prevCl < 0 ? -prevCl : 0;
      }
    }
  });

  // Totals footer
  document.getElementById('tb-tfoot').innerHTML = `
    <tr>
      <td colspan="2" style="text-align:center;font-weight:700;color:#c8e8ff;background:#060f18">الإجمالي</td>
      <td class="num"><span class="tb-dr">${fmt(totOpenDr, 2)}</span></td>
      <td class="num"><span class="tb-cr">${fmt(totOpenCr, 2)}</span></td>
      <td class="num"><span class="tb-dr">${fmt(totPDr, 2)}</span></td>
      <td class="num"><span class="tb-cr">${fmt(totPCr, 2)}</span></td>
      <td class="num"><span class="tb-dr">${fmt(totClDr, 2)}</span></td>
      <td class="num"><span class="tb-cr">${fmt(totClCr, 2)}</span></td>
      ${cmp ? `
        <td class="num" style="background:#06111e"><span class="tb-dr">${fmt(totCmpDr, 2)}</span></td>
        <td class="num" style="background:#06111e"><span class="tb-cr">${fmt(totCmpCr, 2)}</span></td>
        <td class="num" style="background:#06111e"></td>` : ''}
    </tr>`;

  // Balance check
  const openDiff  = Math.abs(totOpenDr - totOpenCr);
  const closeDiff = Math.abs(totClDr   - totClCr);
  const balanced  = openDiff < 1 && closeDiff < 1;
  const checkEl   = document.getElementById('tb-balance-check');
  checkEl.className = balanced ? 'tb-balance-ok' : 'tb-balance-fail';
  checkEl.textContent = balanced
    ? `✓ الميزان متوازن — مجموع المدين = مجموع الدائن لأول وآخر الفترة`
    : `⚠ تفاوت في الميزان — أول الفترة: ${fmt(openDiff, 2)} | آخر الفترة: ${fmt(closeDiff, 2)}`;

  document.getElementById('tb-count').textContent =
    `${matchCount.toLocaleString('ar-SA')} حساب${search ? ` (من أصل ${_tbData.length.toLocaleString('ar-SA')})` : ''}`;
}

// ── KPI cards + chart ────────────────────────────────────────────────────────

function _tbInjectCSS() {
  if (document.getElementById('tb-kpi-css')) return;
  const s = document.createElement('style'); s.id = 'tb-kpi-css';
  s.textContent = `
    #tb-kpi-wrap { padding: 0 0 4px 0; }
    .tb-kpi-row  { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
    .tb-kpi-card { background:#0a1828; border:1px solid #1e3a5f; border-radius:8px;
      padding:12px 16px; min-width:155px; flex:1; font-family:Tajawal,sans-serif; }
    .tb-kpi-lbl  { font-size:.72rem; color:#5a80a0; }
    .tb-kpi-val  { font-size:1.2rem; font-weight:700; color:#c8e8ff; margin-top:3px; }
    .tb-kpi-sub  { font-size:.68rem; color:#3a6080; margin-top:2px; }
    #tb-chart-wrap { background:#0a1828; border:1px solid #1e3a5f; border-radius:8px;
      padding:14px 16px; margin-bottom:10px; position:relative; height:160px; }
  `;
  document.head.appendChild(s);
}

function _tbInjectKPIArea() {
  if (document.getElementById('tb-kpi-wrap')) return;
  _tbInjectCSS();
  const wrap = document.createElement('div'); wrap.id = 'tb-kpi-wrap';
  wrap.innerHTML = `<div class="tb-kpi-row" id="tb-kpi-row"></div>
    <div id="tb-chart-wrap"><canvas id="chart-tb-sections"></canvas></div>`;
  const searchRow = document.querySelector('#tab-trial .search-row');
  if (searchRow) searchRow.parentNode.insertBefore(wrap, searchRow);
}

function _tbRenderKPIs() {
  const kpiRow = document.getElementById('tb-kpi-row');
  if (!kpiRow || !_tbData || !_tbData.length) return;

  // Use level-1 sections (direct children of root) — they carry rolled-up balances
  const sections = _tbData.filter(r => r.levelNo === 1);

  let totAssets = 0, totLiab = 0, totEquity = 0, totExp = 0, totRev = 0;
  sections.forEach(r => {
    const sec = r.code ? r.code[0] : '';
    const bal = r.closeBal || 0;
    if (sec === '1') totAssets +=  bal;
    if (sec === '2') totLiab   += -bal;
    if (sec === '3') totEquity += -bal;
    if (sec === '4') totExp    +=  bal;
    if (sec === '5') totRev    += -bal;
  });

  const fM  = n => ((+n||0)/1e6).toFixed(2) + ' م';
  // توازن ميزان المراجعة: مجموع المدين = مجموع الدائن (مجموع صافي الأرصدة → صفر)
  const netAllSections = sections.reduce((s, r) => s + (r.closeBal || 0), 0);
  const balanced = Math.abs(netAllSections) < 1;
  const netIncome = totRev - totExp;
  const margin = totRev > 0.01 ? (netIncome / totRev * 100).toFixed(1) : '—';

  kpiRow.innerHTML = `
    <div class="tb-kpi-card">
      <div class="tb-kpi-lbl">إجمالي الأصول</div>
      <div class="tb-kpi-val">${fM(totAssets)}</div>
      <div class="tb-kpi-sub">رصيد آخر الفترة</div>
    </div>
    <div class="tb-kpi-card">
      <div class="tb-kpi-lbl">الخصوم + حقوق الملكية</div>
      <div class="tb-kpi-val">${fM(totLiab + totEquity)}</div>
      <div class="tb-kpi-sub">${fM(totLiab)} خصوم · ${fM(totEquity)} ملكية</div>
    </div>
    <div class="tb-kpi-card">
      <div class="tb-kpi-lbl">صافي الدخل</div>
      <div class="tb-kpi-val" style="color:${netIncome>=0?'#4ada8e':'#da6a6a'}">${fM(netIncome)}</div>
      <div class="tb-kpi-sub">إيرادات ${fM(totRev)} · هامش ${margin}%</div>
    </div>
    <div class="tb-kpi-card" style="border-color:${balanced?'#2a5a3a':'#6a2020'}">
      <div class="tb-kpi-lbl">حالة ميزان المراجعة</div>
      <div class="tb-kpi-val" style="font-size:1rem;color:${balanced?'#4ada8e':'#da4a4a'}">${balanced?'✓ متوازن':'⚠ فارق ' + fM(Math.abs(netAllSections))}</div>
      <div class="tb-kpi-sub">${_tbData.length} حساب نشط</div>
    </div>`;

  _tbRenderChart({ totAssets, totLiab, totEquity, totExp, totRev });
}

function _tbRenderChart({ totAssets, totLiab, totEquity, totExp, totRev }) {
  const canvas = document.getElementById('chart-tb-sections');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_tbChartInst) { _tbChartInst.destroy(); _tbChartInst = null; }
  const fM = n => ((+n||0)/1e6).toFixed(1) + 'م';
  _tbChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['الأصول','الخصوم','حقوق الملكية','المصروفات','الإيرادات'],
      datasets: [{
        data: [totAssets, totLiab, totEquity, totExp, totRev],
        backgroundColor: ['#4a9eda','#da6a6a','#a78bfa','#f5a623','#4ada8e'],
        borderRadius: 4, borderWidth: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => '  ' + fM(ctx.raw) + ' ر.س' } }
      },
      scales: {
        x: { ticks: { color:'#5a80a0', callback: v => fM(v) }, grid: { color:'#0f2035' } },
        y: { ticks: { color:'#a0b8d0', font:{ family:'Tajawal,sans-serif', size:11 } }, grid: { display:false } }
      }
    }
  });
}

// ── Excel export (ExcelJS) ────────────────────────────────────────────────────
async function exportTBExcel() {
  if (!_tbData || !_tbData.length) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const from      = document.getElementById('tb-from').value;
  const to        = document.getElementById('tb-to').value;
  const company   = State.get('companyName') || '';
  const levelLbl  = ([...document.getElementById('tb-level').options].find(o=>o.selected)||{}).textContent || '';
  const branchLbl = ([...document.getElementById('tb-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const cmp       = !!(document.getElementById('tb-compare')?.checked && _tbCmpData);
  const cmpMap    = cmp ? new Map(_tbCmpData.map(r => [r.code, r.closeBal])) : null;
  const prevFrom  = from ? `${+from.substring(0,4)-1}${from.substring(4)}` : '';
  const prevTo    = to   ? `${+to.substring(0,4)-1}${to.substring(4)}`     : '';
  const genDate   = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});

  try {
    const NC   = cmp ? 11 : 8;
    const FONT = 'Calibri';
    const numFmt = '#,##0;#,##0;"-"';
    const CLR = {
      navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
      bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
      textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
      textLight:'FF6A8AAA', textGray:'FF888888',
      greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
    };
    const solid = (a) => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
    const bdr   = (s,a) => ({ style:s, color:{ argb:a } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
    const ws = wb.addWorksheet('ميزان المراجعة', { views:[{ rightToLeft:true }] });
    ws.pageSetup.paperSize   = 9;
    ws.pageSetup.orientation = 'landscape';
    ws.pageSetup.fitToPage   = true;
    ws.pageSetup.fitToWidth  = 1;
    ws.pageSetup.margins = { left:0.5, right:0.5, top:0.75, bottom:0.75, header:0.3, footer:0.3 };

    ws.columns = cmp
      ? [{width:16},{width:42},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14},{width:10}]
      : [{width:16},{width:42},{width:14},{width:14},{width:14},{width:14},{width:14},{width:14}];

    const spanAll = (row) => ws.mergeCells(row.number, 1, row.number, NC);

    function addTitle(text, sz, fc, bg) {
      const row = ws.addRow([text]); row.height = sz > 12 ? 32 : 24; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
      c.fill = solid(bg); c.alignment = { horizontal:'center', vertical:'middle' };
    }

    function addSpacer(h=5) {
      const row = ws.addRow(['']); row.height = h; spanAll(row);
      row.getCell(1).fill = solid(CLR.white);
    }

    function addSecHdr(text) {
      const row = ws.addRow([text]); row.height = 20; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
      c.fill = solid(CLR.navy);
      c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
    }

    function setNum(cell, v, fc, bold) {
      cell.value = (v !== null && v !== undefined) ? +v.toFixed(0) : null;
      cell.numFmt = numFmt;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      cell.font = { name:FONT, size:9.5, color:{ argb: fc || CLR.textNavy }, bold: bold || false };
    }

    // ── Title block ──────────────────────────────────────────────────────────
    addTitle(company || 'ميزان المراجعة', 14, CLR.white, CLR.navyDark);
    addTitle('ميزان المراجعة', 12, CLR.white, CLR.navy);
    addTitle(`الفترة: ${from} إلى ${to}  |  ${levelLbl}  |  الفرع: ${branchLbl}${cmp?`  |  مقارنة: ${prevFrom} إلى ${prevTo}`:''}`, 9.5, 'FFAACCE8', CLR.navyDark);
    addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
    addSpacer(4);

    // ── Column header (2 rows) ───────────────────────────────────────────────
    {
      const h1 = ['كود الحساب','اسم الحساب','رصيد أول الفترة','','حركة الفترة','','رصيد آخر الفترة',''];
      if (cmp) h1.push(`مقارنة (${prevFrom}–${prevTo})`,'','%');
      const r1 = ws.addRow(h1); r1.height = 20;
      ws.mergeCells(r1.number,3,r1.number,4);
      ws.mergeCells(r1.number,5,r1.number,6);
      ws.mergeCells(r1.number,7,r1.number,8);
      if (cmp) ws.mergeCells(r1.number,9,r1.number,10);
      r1.eachCell({ includeEmpty:true }, (c,ci) => {
        c.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } };
        c.fill = solid(CLR.navyDark);
        c.alignment = { horizontal: ci<=2 ? 'right' : 'center', vertical:'middle' };
        c.border = { bottom: bdr('thin',CLR.navy) };
      });
    }
    {
      const h2 = ['','','مدين','دائن','مدين','دائن','مدين','دائن'];
      if (cmp) h2.push('مدين','دائن','%');
      const r2 = ws.addRow(h2); r2.height = 18;
      r2.eachCell({ includeEmpty:true }, (c,ci) => {
        c.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } };
        c.fill = solid(CLR.navy);
        c.alignment = { horizontal: ci<=2 ? 'right' : 'center', vertical:'middle' };
        c.border = { bottom: bdr('medium',CLR.navyDark) };
      });
    }

    // ── Data rows — walk the hierarchy (not the flat list) so each account
    // appears once, indented by depth; sums are taken at root level only to
    // avoid double-counting rolled-up parent totals. ─────────────────────────
    const SEC_LABEL = {'1':'الأصول','2':'الخصوم','3':'حقوق الملكية','4':'المصروفات والتكاليف','5':'الإيرادات'};
    let totODr=0,totOCr=0,totPDr=0,totPCr=0,totCDr=0,totCCr=0,totCmpDr=0,totCmpCr=0;
    let lastSec = null;

    const childrenOf = _tbBuildChildIndex(_tbData);
    const roots      = _tbRootNodes(_tbData).slice().sort((a, b) => a.code.localeCompare(b.code));

    function walk(r, depth) {
      if (depth === 0) {
        const sec = r.code ? r.code[0] : '';
        if (sec !== lastSec && SEC_LABEL[sec]) { addSecHdr(SEC_LABEL[sec]); lastSec = sec; }
      }

      const oDr = r.openBal  > 0 ? r.openBal  : 0;
      const oCr = r.openBal  < 0 ? -r.openBal : 0;
      const cDr = r.closeBal > 0 ? r.closeBal : 0;
      const cCr = r.closeBal < 0 ? -r.closeBal: 0;

      let pDr=0, pCr=0, pct=null, prevCl=null;
      if (cmp) {
        prevCl = cmpMap.has(r.code) ? (cmpMap.get(r.code)||0) : null;
        pDr = prevCl !== null && prevCl > 0 ? prevCl  : 0;
        pCr = prevCl !== null && prevCl < 0 ? -prevCl : 0;
        pct = prevCl !== null && Math.abs(prevCl) > 0.004
          ? +((r.closeBal - prevCl) / Math.abs(prevCl) * 100).toFixed(1) : null;
      }

      if (depth === 0) {
        totODr+=oDr; totOCr+=oCr; totPDr+=r.pDebit; totPCr+=r.pCredit; totCDr+=cDr; totCCr+=cCr;
        if (cmp && prevCl !== null) { totCmpDr += pDr; totCmpCr += pCr; }
      }

      const row = ws.addRow([r.code, r.name, oDr||null, oCr||null, r.pDebit||null, r.pCredit||null, cDr||null, cCr||null,
        ...(cmp ? [pDr||null, pCr||null, pct] : [])]);
      row.height = 16;
      const hairBdr = { bottom: bdr('hair','FFE8ECF0') };
      const isRoot  = depth === 0;

      row.getCell(1).font = { name:FONT, size:8.5, color:{ argb:CLR.textGray } };
      row.getCell(1).alignment = { horizontal:'left', vertical:'middle' };
      row.getCell(1).border = hairBdr;

      row.getCell(2).font = { name:FONT, size:9.5, bold: isRoot, color:{ argb: isRoot ? CLR.textNavy : CLR.textDark } };
      row.getCell(2).alignment = { horizontal:'right', vertical:'middle', indent: 1 + depth };
      row.getCell(2).border = hairBdr;

      for (let ci = 3; ci <= 8; ci++) {
        setNum(row.getCell(ci), row.getCell(ci).value, CLR.textNavy, isRoot);
        row.getCell(ci).border = hairBdr;
      }
      if (cmp) {
        for (let ci = 9; ci <= 10; ci++) {
          setNum(row.getCell(ci), row.getCell(ci).value, CLR.textGray, false);
          row.getCell(ci).border = hairBdr;
          row.getCell(ci).fill  = solid('FFF8FAFE');
        }
        const pctCell = row.getCell(11);
        if (pct !== null) {
          pctCell.value  = pct;
          pctCell.numFmt = '0.0"%"';
          pctCell.font   = { name:FONT, size:9, color:{ argb: pct >= 0 ? CLR.greenText : 'FFCC4444' } };
        }
        pctCell.alignment = { horizontal:'center', vertical:'middle' };
        pctCell.border = hairBdr;
        pctCell.fill   = solid('FFF8FAFE');
      }

      (childrenOf.get(r.id) || []).forEach(k => walk(k, depth + 1));
    }
    roots.forEach(r => walk(r, 0));

    // ── Totals row ────────────────────────────────────────────────────────────
    addSpacer(3);
    {
      const tv = [totODr,totOCr,totPDr,totPCr,totCDr,totCCr];
      const totRow = ws.addRow(['الإجمالي','', ...tv.map(v=>v||null), ...(cmp?[totCmpDr||null,totCmpCr||null,null]:[])]);
      totRow.height = 22;
      const bord = { top:bdr('double',CLR.navyDark), bottom:bdr('medium',CLR.navyDark) };
      totRow.eachCell({ includeEmpty:true }, c => { c.fill = solid(CLR.blueXPale); c.border = bord; });
      totRow.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
      totRow.getCell(1).alignment = { horizontal:'right', vertical:'middle' };
      totRow.getCell(2).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
      for (let ci = 3; ci <= 8; ci++) {
        const cell = totRow.getCell(ci);
        if (cell.value !== null) cell.value = +cell.value.toFixed(0);
        cell.numFmt = numFmt;
        cell.alignment = { horizontal:'left', vertical:'middle' };
        cell.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
      }
      if (cmp) {
        for (let ci = 9; ci <= 10; ci++) {
          const cell = totRow.getCell(ci);
          if (cell.value !== null) cell.value = +cell.value.toFixed(0);
          cell.numFmt = numFmt;
          cell.alignment = { horizontal:'left', vertical:'middle' };
          cell.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.textBlue } };
        }
      }
    }

    // ── Download ──────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ميزان_المراجعة_${from}_${to}.xlsx`; a.click();
    URL.revokeObjectURL(url);

  } catch(err) {
    console.error('TB Excel export error:', err);
    alert('خطأ في التصدير إلى Excel: ' + err.message);
  }
}

// ── HTML export ───────────────────────────────────────────────────────────────
function exportTBHTML() {
  if (!_tbData || !_tbData.length) return;

  const from      = document.getElementById('tb-from').value;
  const to        = document.getElementById('tb-to').value;
  const company   = State.get('companyName') || 'ميزان المراجعة';
  const levelLbl  = ([...document.getElementById('tb-level').options].find(o=>o.selected)||{}).textContent || '';
  const branchLbl = ([...document.getElementById('tb-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const genDate   = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  const cmp       = !!(document.getElementById('tb-compare')?.checked && _tbCmpData);
  const cmpMap    = cmp ? new Map(_tbCmpData.map(r => [r.code, r.closeBal])) : null;
  const prevFrom  = from ? `${+from.substring(0,4)-1}${from.substring(4)}` : '';
  const prevTo    = to   ? `${+to.substring(0,4)-1}${to.substring(4)}`     : '';
  const C         = cmp ? 11 : 8;

  const SEC_LABEL = {'1':'الأصول','2':'الخصوم','3':'حقوق الملكية','4':'المصروفات والتكاليف','5':'الإيرادات'};

  let totODr=0,totOCr=0,totPDr=0,totPCr=0,totCDr=0,totCCr=0,totCmpDr=0,totCmpCr=0;
  let lastSec = null;
  let tbRows = '';

  const N  = v => v > 0.004 ? v.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
  const Nf = v => v.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Walk the hierarchy (not the flat list) so each row appears once, indented
  // by depth — this avoids double-counting rolled-up parent totals in the sum.
  const childrenOf = _tbBuildChildIndex(_tbData);
  const roots      = _tbRootNodes(_tbData).slice().sort((a, b) => a.code.localeCompare(b.code));

  function walk(r, depth) {
    if (depth === 0) {
      const sec = r.code ? r.code[0] : '';
      if (sec !== lastSec && SEC_LABEL[sec]) {
        tbRows += `<tr class="sec-hdr"><td colspan="${C}">${SEC_LABEL[sec]}</td></tr>`;
        lastSec = sec;
      }
    }
    const oDr = r.openBal  > 0 ? r.openBal  : 0;
    const oCr = r.openBal  < 0 ? -r.openBal : 0;
    const cDr = r.closeBal > 0 ? r.closeBal : 0;
    const cCr = r.closeBal < 0 ? -r.closeBal : 0;
    if (depth === 0) {
      totODr+=oDr; totOCr+=oCr; totPDr+=r.pDebit; totPCr+=r.pCredit; totCDr+=cDr; totCCr+=cCr;
    }

    let cmpCells = '';
    if (cmp) {
      const prevCl = cmpMap.has(r.code) ? (cmpMap.get(r.code) || 0) : null;
      const pDr    = prevCl !== null && prevCl > 0 ? prevCl  : 0;
      const pCr    = prevCl !== null && prevCl < 0 ? -prevCl : 0;
      if (depth === 0 && prevCl !== null) { totCmpDr += pDr; totCmpCr += pCr; }
      const curNet  = r.closeBal || 0;
      const prevNet = prevCl !== null ? prevCl : null;
      let pctHtml   = '';
      if (prevNet !== null && Math.abs(prevNet) > 0.004) {
        const pct = (curNet - prevNet) / Math.abs(prevNet) * 100;
        pctHtml = `<span style="color:${pct > 0 ? '#1a6a2a' : '#8a1a1a'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`;
      } else if (prevNet === null) {
        pctHtml = '<span style="color:#555">جديد</span>';
      }
      cmpCells = `<td class="cmp-dr">${N(pDr)}</td><td class="cmp-cr">${N(pCr)}</td><td class="pct">${pctHtml}</td>`;
    }

    const indent = depth * 18;
    tbRows += `<tr>
      <td class="code" style="padding-right:${8 + indent}px">${esc(r.code)}</td>
      <td class="name" style="${depth === 0 ? 'font-weight:700;color:#0a2040' : ''}">${esc(r.name)}</td>
      <td class="dr">${N(oDr)}</td><td class="cr">${N(oCr)}</td>
      <td class="dr">${N(r.pDebit)}</td><td class="cr">${N(r.pCredit)}</td>
      <td class="dr">${N(cDr)}</td><td class="cr">${N(cCr)}</td>
      ${cmpCells}
    </tr>`;

    (childrenOf.get(r.id) || []).forEach(k => walk(k, depth + 1));
  }
  roots.forEach(r => walk(r, 0));

  const balanced = Math.abs(totCDr - totCCr) < 1;
  const cmpTheadExtra = cmp ? `
    <th colspan="2" class="cmp-hdr">رصيد المقارنة<br><small style="font-weight:400">${esc(prevFrom)}–${esc(prevTo)}</small></th>
    <th class="cmp-hdr">التغيير&nbsp;%</th>` : '';
  const cmpTfootExtra = cmp
    ? `<td class="cmp-dr">${Nf(totCmpDr)}</td><td class="cmp-cr">${Nf(totCmpCr)}</td><td class="pct"></td>`
    : '';

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>ميزان المراجعة — ${esc(company)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;font-size:11pt;color:#111;background:#fff}
.page{max-width:${cmp?'1350px':'1100px'};margin:0 auto;padding:20px 24px}
.co-name{font-size:18pt;font-weight:700;text-align:center;color:#0a2040;margin-bottom:4px}
.title{font-size:14pt;font-weight:600;text-align:center;color:#1a4a7a;margin-bottom:2px}
.meta{text-align:center;font-size:9pt;color:#555;margin-bottom:14px;line-height:1.8}
.balance-ok{text-align:center;color:#1a6a2a;font-size:9pt;font-weight:600;margin-bottom:10px;
  padding:4px;border:1px solid #b0d8b0;border-radius:4px;background:#f0fff4}
.balance-fail{text-align:center;color:#8a2a00;font-size:9pt;font-weight:600;margin-bottom:10px;
  padding:4px;border:1px solid #e0b090;border-radius:4px;background:#fff8f0}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
th{background:#0a2040;color:#fff;padding:6px 8px;font-weight:600;white-space:nowrap}
th.num,th.cmp-hdr{text-align:left}
td{padding:5px 8px;border-bottom:1px solid #dde4ec;vertical-align:middle}
td.code{font-family:monospace;font-size:8.5pt;color:#1a4a7a;white-space:nowrap}
td.name{color:#222}
td.dr,td.cmp-dr{text-align:left;color:#0a3060;font-variant-numeric:tabular-nums;white-space:nowrap}
td.cr,td.cmp-cr{text-align:left;color:#7a1010;font-variant-numeric:tabular-nums;white-space:nowrap}
td.pct{text-align:left;white-space:nowrap;font-size:8.5pt}
td.cmp-dr,td.cmp-cr,td.pct{background:#f0f4fa}
tr:nth-child(even) td{background:#f7f9fc}
tr:nth-child(even) td.cmp-dr,tr:nth-child(even) td.cmp-cr,tr:nth-child(even) td.pct{background:#eaeff8}
tr:hover td{background:#eef4ff}
.sec-hdr td{background:#e8eef8;color:#1a3a6a;font-size:8.5pt;font-weight:700;
  letter-spacing:.04em;padding:4px 8px;border-top:2px solid #aabbd0}
.grp-hdr th{background:#1a3a6a;text-align:center;font-size:9pt}
.grp-hdr th.cmp-hdr{background:#243f68}
.sub-hdr th{background:#2a5080;font-size:8.5pt}
.sub-hdr th.cmp-hdr{background:#344e6e}
tfoot td{background:#e8eef8;font-weight:700;border-top:2px solid #0a2040;padding:7px 8px}
tfoot td.dr,tfoot td.cmp-dr{color:#0a3060}
tfoot td.cr,tfoot td.cmp-cr{color:#7a1010}
tfoot td.cmp-dr,tfoot td.cmp-cr,tfoot td.pct{background:#dce4f0}
.footer{margin-top:12px;font-size:8pt;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px}
@media print{body{font-size:9pt}.page{padding:10px}th{background:#0a2040!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="page">
  <div class="co-name">${esc(company)}</div>
  <div class="title">ميزان المراجعة</div>
  <div class="meta">
    الفترة: ${from} إلى ${to} &nbsp;|&nbsp; ${esc(levelLbl)} &nbsp;|&nbsp; الفرع: ${esc(branchLbl)}
    ${cmp ? `<br>مقارنة بالفترة: ${esc(prevFrom)} إلى ${esc(prevTo)}` : ''}<br>
    تاريخ الإنشاء: ${genDate}
  </div>
  <div class="${balanced ? 'balance-ok' : 'balance-fail'}">
    ${balanced ? '✓ الميزان متوازن — مجموع المدين = مجموع الدائن' : `⚠ فرق في الميزان: ${Nf(Math.abs(totCDr - totCCr))}`}
  </div>
  <table>
    <thead>
      <tr class="grp-hdr">
        <th rowspan="2" style="min-width:110px">كود الحساب</th>
        <th rowspan="2" style="min-width:200px;text-align:right">اسم الحساب</th>
        <th colspan="2">رصيد أول الفترة</th>
        <th colspan="2">حركة الفترة</th>
        <th colspan="2">رصيد آخر الفترة</th>
        ${cmpTheadExtra}
      </tr>
      <tr class="sub-hdr">
        <th class="num" style="min-width:110px">مدين</th>
        <th class="num" style="min-width:110px">دائن</th>
        <th class="num" style="min-width:110px">مدين</th>
        <th class="num" style="min-width:110px">دائن</th>
        <th class="num" style="min-width:110px">مدين</th>
        <th class="num" style="min-width:110px">دائن</th>
        ${cmp ? `<th class="cmp-hdr" style="min-width:100px">مدين</th><th class="cmp-hdr" style="min-width:100px">دائن</th>` : ''}
      </tr>
    </thead>
    <tbody>${tbRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="text-align:center;font-weight:700">الإجمالي</td>
        <td class="dr">${Nf(totODr)}</td><td class="cr">${Nf(totOCr)}</td>
        <td class="dr">${Nf(totPDr)}</td><td class="cr">${Nf(totPCr)}</td>
        <td class="dr">${Nf(totCDr)}</td><td class="cr">${Nf(totCCr)}</td>
        ${cmpTfootExtra}
      </tr>
    </tfoot>
  </table>
  <div class="footer">تم إنشاؤه من نظام MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `ميزان_المراجعة_${from}_${to}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTBCSV() {
  if (!_tbData) return;
  const hdr = [
    'المستوى','كود الحساب','اسم الحساب',
    'أول الفترة مدين','أول الفترة دائن',
    'حركة مدين','حركة دائن',
    'آخر الفترة مدين','آخر الفترة دائن',
  ];

  // Walk the hierarchy (parent → children, by code) so the CSV reflects the
  // tree order with an indented name + explicit level column — each account's
  // value is its own rolled-up balance (own postings + descendants).
  const childrenOf = _tbBuildChildIndex(_tbData);
  const roots      = _tbRootNodes(_tbData).slice().sort((a, b) => a.code.localeCompare(b.code));
  const lines = [hdr.join(',')];

  function walk(r, depth) {
    lines.push([
      depth + 1,
      r.code,
      `"${'— '.repeat(depth) + (r.name || '').replace(/"/g, '""')}"`,
      r.openBal  > 0 ? r.openBal.toFixed(2)  : '',
      r.openBal  < 0 ? (-r.openBal).toFixed(2) : '',
      r.pDebit   > 0 ? r.pDebit.toFixed(2)   : '',
      r.pCredit  > 0 ? r.pCredit.toFixed(2)  : '',
      r.closeBal > 0 ? r.closeBal.toFixed(2) : '',
      r.closeBal < 0 ? (-r.closeBal).toFixed(2) : '',
    ].join(','));
    (childrenOf.get(r.id) || []).forEach(k => walk(k, depth + 1));
  }
  roots.forEach(r => walk(r, 0));

  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `trial_balance_${document.getElementById('tb-from').value}_${document.getElementById('tb-to').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
