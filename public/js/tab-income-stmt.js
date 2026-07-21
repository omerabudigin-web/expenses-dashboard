// ── INCOME STATEMENT TAB (قائمة الدخل الشامل — Saudi IFRS/SOCPA) ─────────────

let _isTimer     = null;
let _isCountdown = 0;
let _isChart     = null;
const IS_REFRESH_SEC = 60;

function _isIsActive() { return !!document.querySelector('.tab.active[data-tab="is"]'); }
function _isStopTimer() { if (_isTimer) { clearInterval(_isTimer); _isTimer = null; } }
function _isStartCountdown(rowCount) {
  _isStopTimer();
  _isCountdown = IS_REFRESH_SEC;
  const el = document.getElementById('is-status');
  const tick = () => {
    if (!el) return;
    if (_isCountdown > 0) {
      el.textContent = `✅ ${rowCount} حساب | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_isCountdown}ث`;
      el.style.color = '#1a7a3c';
    } else {
      el.textContent = `⏳ جارٍ إعادة التحميل...`;
      el.style.color = '#8a7a3c';
    }
  };
  tick();
  _isTimer = setInterval(() => {
    if (!_isIsActive()) { _isStopTimer(); return; }
    _isCountdown = Math.max(0, _isCountdown - 1);
    tick();
    if (_isCountdown === 0) {
      _isStopTimer();
      fetchIncomeStatement();
    }
  }, 1000);
}

let _isData       = null;
let _isCmpData    = null;   // comparison period (same period, previous year)
let _isSummary    = null;   // whole-statement Revenue/COGS/Gross Profit/Net Profit
let _isCmpSummary = null;
let _isInited     = false;
let _isRootFilter = null;
let _isTreeData      = null;
let _isTreeCollapsed = new Set();
let _isTreeMode      = false;

function _isLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

// ── مقارنة الفترات: نفس الفترة العام السابق، أو الفترة السابقة مباشرة ─────────
// (شهر واحد → الشهر السابق له · ثلاثة أشهر (ربع) → الربع السابق · وهكذا)
function _isShiftYM(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function _isMonthsBetween(fromYM, toYM) {
  const [fy, fm] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}
function _isCmpRange(fromYM, toYM, mode) {
  if (!fromYM || !toYM) return { prevFromYM: '', prevToYM: '' };
  if (mode === 'prevperiod') {
    const len       = _isMonthsBetween(fromYM, toYM);
    const prevToYM  = _isShiftYM(fromYM, -1);
    const prevFromYM = _isShiftYM(prevToYM, -(len - 1));
    return { prevFromYM, prevToYM };
  }
  // الوضع الافتراضي: نفس الأشهر، العام السابق
  return { prevFromYM: _isShiftYM(fromYM, -12), prevToYM: _isShiftYM(toYM, -12) };
}
function _isCmpModeLabel(mode) {
  return mode === 'prevperiod' ? 'الفترة السابقة مباشرة' : 'نفس الفترة — العام السابق';
}

function initIncomeStatement() {
  if (_isInited) return;
  _isInited = true;

  const DATA_START_YM = '2025-10';
  const now  = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  function _isApplyQuick(val) {
    const from = document.getElementById('is-from');
    const to   = document.getElementById('is-to');
    if (val === '2025')     { from.value = DATA_START_YM; to.value = '2025-12'; }
    else if (val === '2026-ytd') { from.value = '2026-01'; to.value = curYM; }
    else if (val === 'all') { from.value = DATA_START_YM; to.value = curYM; }
  }

  const quickSel = document.getElementById('is-quick');
  if (quickSel) {
    quickSel.addEventListener('change', () => _isApplyQuick(quickSel.value));
    _isApplyQuick(quickSel.value);
    ['is-from', 'is-to'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => { quickSel.value = ''; });
    });
  }

  document.getElementById('is-run').addEventListener('click', () => {
    _isRootFilter = null; _isUpdateBreadcrumb();
    if (_isTreeMode) fetchIncomeStatementTree(); else fetchIncomeStatement();
  });
  document.getElementById('is-export-excel').addEventListener('click', () => {
    const btn = document.getElementById('is-export-excel');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportISExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 Excel'; });
  });
  document.getElementById('is-export-html').addEventListener('click',  exportISHTML);
  document.getElementById('is-print').addEventListener('click', _isPrintFormal);
  document.getElementById('is-search').addEventListener('input', _renderISRows);
  document.getElementById('is-level').addEventListener('change', _isResetData);
  const cmpSel = document.getElementById('is-cmp-mode');
  if (cmpSel) cmpSel.addEventListener('change', () => { _isCmpData = null; if (_isData) fetchIncomeStatement(); });
  const bcBack = document.getElementById('is-bc-back');
  if (bcBack) bcBack.addEventListener('click', () => { _isRootFilter = null; _isUpdateBreadcrumb(); fetchIncomeStatement(); });

  // Tree mode toggle
  const treeBtn   = document.getElementById('is-tree-btn');
  const levelWrap = document.getElementById('is-level-wrap');
  if (treeBtn) {
    treeBtn.addEventListener('click', () => {
      _isTreeMode = !_isTreeMode;
      _isTreeData = null; _isData = null; _isCmpData = null;
      _isSummary = null; _isCmpSummary = null; _renderISKPIs();
      treeBtn.style.background = _isTreeMode ? '#0d3a4a' : '#0d2a3a';
      treeBtn.style.color      = _isTreeMode ? '#a0e8f8' : '#70c8e8';
      treeBtn.style.border     = _isTreeMode ? '1px solid #3a8aaa' : '1px solid #2a5a7a';
      if (levelWrap) levelWrap.style.display = _isTreeMode ? 'none' : '';
      const bc = document.getElementById('is-breadcrumb');
      if (bc) { if (_isTreeMode) bc.classList.add('hidden'); }
      document.getElementById('is-tbody').innerHTML = `<tr><td colspan="5"
        style="text-align:center;padding:52px;color:#3a5a7a">
        اضغط <strong style="color:#5baef0">عرض القائمة</strong> لتحميل العرض الشجري</td></tr>`;
      document.getElementById('is-tfoot').innerHTML = '';
      const badge = document.getElementById('is-net-badge');
      if (badge) badge.style.display = 'none';
    });
  }
}

async function _isPopulateBranches() {
  const db    = State.get('activeDb');
  const brSel = document.getElementById('is-branch');
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
    if ([...brSel.options].some(o => o.value === prev)) brSel.value = prev; else brSel.value = 'ALL';
  } catch (_) {}
}

function _isResetData() {
  _isData = null; _isCmpData = null; _isSummary = null; _isCmpSummary = null;
  _isRootFilter = null; _isUpdateBreadcrumb(); _renderISRows();
}

function _isUpdateBreadcrumb() {
  const el = document.getElementById('is-breadcrumb');
  const pathEl = document.getElementById('is-bc-path');
  if (!el || !pathEl) return;
  if (_isRootFilter) {
    pathEl.innerHTML = `<span style="color:#6a9aca;font-family:monospace;font-size:.78rem">${esc(_isRootFilter.code)}</span> — ${esc(_isRootFilter.name)}`;
    el.classList.remove('hidden'); el.style.display = 'flex';
  } else {
    el.classList.add('hidden'); el.style.display = 'none';
  }
}

async function fetchIncomeStatement() {
  const fromYM = document.getElementById('is-from').value;
  const toYM   = document.getElementById('is-to').value;
  if (!fromYM || !toYM) { alert('الرجاء اختيار الفترة الزمنية'); return; }

  const from   = fromYM + '-01';
  const to     = _isLastDay(toYM);
  const level  = document.getElementById('is-level').value  || '3';
  const brVal  = document.getElementById('is-branch').value;
  const branch = (brVal === 'ALL') ? '0' : (brVal || '0');
  const db     = State.get('activeDb') || 'MekSoftDb1';

  const params = new URLSearchParams({ db, from, to, level, branch });
  if (_isRootFilter) params.set('rootCode', _isRootFilter.code);

  // Comparison period — حسب الوضع المختار (نفس فترة العام السابق / الفترة السابقة مباشرة)
  const cmpMode = document.getElementById('is-cmp-mode')?.value || '';
  const wantCmp = !!cmpMode;
  const { prevFromYM, prevToYM } = _isCmpRange(fromYM, toYM, cmpMode);
  const prevFrom   = prevFromYM + '-01';
  const prevTo     = _isLastDay(prevToYM);
  const cmpParams  = new URLSearchParams({ db, from: prevFrom, to: prevTo, level, branch });
  if (_isRootFilter) cmpParams.set('rootCode', _isRootFilter.code);

  const loadEl   = document.getElementById('is-loading');
  const statusEl = document.getElementById('is-status');
  const tbodyEl  = document.getElementById('is-tbody');
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';

  const labelEl = document.getElementById('is-period-label');
  if (labelEl) labelEl.textContent = wantCmp
    ? `${fromYM} — ${toYM}  |  مقارنة (${_isCmpModeLabel(cmpMode)}): ${prevFromYM} — ${prevToYM}`
    : `${fromYM} — ${toYM}`;

  try {
    const fetches = [
      fetch(`/api/income-statement?${params}`).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); })),
      wantCmp
        ? fetch(`/api/income-statement?${cmpParams}`).then(r => r.ok ? r.json() : Promise.resolve(null))
        : Promise.resolve(null),
    ];
    const [result, cmpResult] = await Promise.all(fetches);
    _isData       = result.rows;
    _isSummary    = result.summary;
    _isCmpData    = cmpResult ? cmpResult.rows    : null;
    _isCmpSummary = cmpResult ? cmpResult.summary : null;
    _renderISRows();
    _isStartCountdown(_isData.length);
  } catch (e) {
    tbodyEl.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#da4a4a">خطأ: ${esc(e.message)}</td></tr>`;
    statusEl.textContent = 'فشل التحميل';
  } finally {
    loadEl.classList.add('hidden');
  }
}

async function fetchIncomeStatementTree() {
  const fromYM = document.getElementById('is-from').value;
  const toYM   = document.getElementById('is-to').value;
  if (!fromYM || !toYM) { alert('الرجاء اختيار الفترة الزمنية'); return; }

  const from   = fromYM + '-01';
  const to     = _isLastDay(toYM);
  const brVal  = document.getElementById('is-branch').value;
  const branch = (brVal === 'ALL') ? '0' : (brVal || '0');
  const db     = State.get('activeDb') || 'MekSoftDb1';
  const params = new URLSearchParams({ db, from, to, branch });

  const loadEl   = document.getElementById('is-loading');
  const statusEl = document.getElementById('is-status');
  const labelEl  = document.getElementById('is-period-label');
  if (labelEl) labelEl.textContent = `${fromYM} — ${toYM}`;
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';

  try {
    const rows = await fetch(`/api/income-statement-tree?${params}`)
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); }));
    _isTreeData = rows;
    // Default: collapse levels >= 4 so the initial view shows 3 levels
    _isTreeCollapsed = new Set(rows.filter(r => r.levelNo >= 4).map(r => r.id));
    _renderISTree();
    statusEl.textContent = `${rows.length} حساب (شجري)`;
  } catch (e) {
    document.getElementById('is-tbody').innerHTML =
      `<tr><td colspan="5" style="text-align:center;padding:32px;color:#da4a4a">خطأ: ${esc(e.message)}</td></tr>`;
    statusEl.textContent = 'فشل التحميل';
  } finally {
    loadEl.classList.add('hidden');
  }
}

function _renderISTree() {
  const tbody   = document.getElementById('is-tbody');
  const tfoot   = document.getElementById('is-tfoot');
  const badgeEl = document.getElementById('is-net-badge');
  const countEl = document.getElementById('is-count');
  if (!tbody || !_isTreeData) return;

  // Build lookup maps
  const nodeMap = new Map(_isTreeData.map(r => [r.id, r]));
  const childMap = new Map();
  _isTreeData.forEach(r => {
    if (r.parentId && nodeMap.has(r.parentId)) {
      if (!childMap.has(r.parentId)) childMap.set(r.parentId, []);
      childMap.get(r.parentId).push(r);
    }
  });
  childMap.forEach(ch => ch.sort((a, b) => a.code.localeCompare(b.code)));

  // Roots: nodes whose parentId is null or not in nodeMap (outside P&L scope)
  const roots = _isTreeData.filter(r => !r.parentId || !nodeMap.has(r.parentId));
  roots.sort((a, b) => a.code.localeCompare(b.code));

  const revRoots = roots.filter(r => r.plType === 'rev');
  const expRoots = roots.filter(r => r.plType === 'exp');

  let totalRevNet = 0, totalRevDr = 0, totalRevCr = 0;
  let totalExpNet = 0, totalExpDr = 0, totalExpCr = 0;
  revRoots.forEach(r => { totalRevNet += r.net; totalRevDr += r.pDebit; totalRevCr += r.pCredit; });
  expRoots.forEach(r => { totalExpNet += r.net; totalExpDr += r.pDebit; totalExpCr += r.pCredit; });

  let html = '';

  function renderNode(node, depth) {
    const children   = childMap.get(node.id) || [];
    const hasKids    = node.hasChildren && children.length > 0;
    const collapsed  = _isTreeCollapsed.has(node.id);
    const isRev      = node.plType === 'rev';
    const indent     = depth * 20;

    const toggleBtn = hasKids
      ? `<span class="is-tree-tog" data-nid="${node.id}"
           style="cursor:pointer;color:${isRev?'#3a8a5a':'#8a4a2a'};margin-left:6px;
                  font-size:.8rem;display:inline-block;min-width:14px;padding:0 3px;
                  user-select:none" title="${collapsed?'توسيع':'طي'}">${collapsed ? '▶' : '▼'}</span>`
      : `<span style="display:inline-block;min-width:14px;margin-left:6px"></span>`;

    const nameColor  = depth === 0 ? (isRev ? '#4ada8e' : '#e0906a')
                     : depth === 1 ? (isRev ? '#3ab870' : '#c07850')
                     : depth === 2 ? '#b8cee0'
                     : '#8090a0';
    const rowBg      = depth === 0 ? (isRev ? 'background:#071510;' : 'background:#120a08;')
                     : depth === 1 ? (isRev ? 'background:#061210;' : 'background:#0e0808;')
                     : '';
    const fw         = depth <= 1 ? 'font-weight:700;' : depth === 2 ? 'font-weight:600;' : '';
    const netColor   = isRev ? (node.net >= 0 ? '#4ada8e' : '#da4a4a') : '#e0a070';
    const netStr     = isRev
      ? (node.net >= 0 ? fmt(node.net, 2) : `<span style="color:#da4a4a">(${fmt(-node.net,2)})</span>`)
      : fmt(node.net, 2);

    html += `<tr class="tb-row" style="${rowBg}">
      <td style="font-family:monospace;color:#506070;font-size:.77rem;white-space:nowrap;
                 padding-right:${4 + indent}px">${esc(node.code)}</td>
      <td style="color:${nameColor};${fw}padding-right:${indent}px">
        ${toggleBtn}${esc(node.name)}
      </td>
      <td class="num ${node.pDebit  ? 'tb-dr' : 'tb-zero'}" style="font-size:.81rem">
        ${node.pDebit  ? fmt(node.pDebit,  2) : '—'}</td>
      <td class="num ${node.pCredit ? 'tb-cr' : 'tb-zero'}" style="font-size:.81rem">
        ${node.pCredit ? fmt(node.pCredit, 2) : '—'}</td>
      <td class="num" style="color:${netColor};${fw}">${netStr}</td>
    </tr>`;

    if (!collapsed) children.forEach(ch => renderNode(ch, depth + 1));
  }

  // Revenue section
  if (revRoots.length) {
    html += `<tr><td colspan="5" style="padding:0">
      <div style="background:linear-gradient(90deg,#061f10,#0a2a15);color:#4ada8e;font-weight:700;
        padding:9px 16px;border-right:4px solid #2ab070;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #1a4a2a;margin-top:4px">◈ الإيرادات</div></td></tr>`;
    revRoots.forEach(r => renderNode(r, 0));
    html += `<tr style="border-top:1px solid #1e4a2a">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px;background:#061a0e;color:#6adc8e">إجمالي الإيرادات</td>
      <td class="num tb-dr" style="background:#061a0e;font-weight:700">${fmt(totalRevDr,2)}</td>
      <td class="num tb-cr" style="background:#061a0e;font-weight:700">${fmt(totalRevCr,2)}</td>
      <td class="num" style="background:#061a0e;font-weight:800;font-size:.94rem;color:#4ada8e">${fmt(totalRevNet,2)}</td>
    </tr>`;
  }

  // Expense section
  if (expRoots.length) {
    html += `<tr><td colspan="5" style="padding:0">
      <div style="background:linear-gradient(90deg,#1f0808,#2a1208);color:#e0906a;font-weight:700;
        padding:9px 16px;border-right:4px solid #b04020;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #4a1a0a;margin-top:6px">◈ المصروفات</div></td></tr>`;
    expRoots.forEach(r => renderNode(r, 0));
    html += `<tr style="border-top:1px solid #4a1a08">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px;background:#120808;color:#e08060">إجمالي المصروفات</td>
      <td class="num tb-dr" style="background:#120808;font-weight:700">${fmt(totalExpDr,2)}</td>
      <td class="num tb-cr" style="background:#120808;font-weight:700">${fmt(totalExpCr,2)}</td>
      <td class="num" style="background:#120808;font-weight:800;font-size:.94rem;color:#e08060">${fmt(totalExpNet,2)}</td>
    </tr>`;
  }

  tbody.innerHTML = html;

  // Delegated click handler for tree expand/collapse toggles
  tbody.onclick = function(e) {
    const tog = e.target.closest('.is-tree-tog');
    if (!tog) return;
    const id = parseInt(tog.dataset.nid, 10);
    if (_isTreeCollapsed.has(id)) _isTreeCollapsed.delete(id);
    else _isTreeCollapsed.add(id);
    _renderISTree();
  };

  // Net profit row
  const netProfit  = totalRevNet - totalExpNet;
  const isProfit   = netProfit >= 0;
  const netColor   = isProfit ? '#4ada8e' : '#da4a4a';
  const netLabel   = isProfit ? 'صافي الربح للفترة' : 'صافي الخسارة للفترة';
  const netDisplay = isProfit ? fmt(netProfit, 2) : '(' + fmt(-netProfit, 2) + ')';

  tfoot.innerHTML = `
    <tr style="border-top:2px solid #2a4a7a">
      <td colspan="2" style="text-align:right;font-weight:800;padding:11px 16px;
        background:#071830;font-size:.96rem;color:${netColor}">${netLabel}</td>
      <td class="num tb-dr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(totalRevDr+totalExpDr,2)}</td>
      <td class="num tb-cr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(totalRevCr+totalExpCr,2)}</td>
      <td class="num" style="background:#071830;font-weight:900;font-size:1.08rem;color:${netColor}">${netDisplay}</td>
    </tr>`;

  if (badgeEl) {
    badgeEl.style.display    = 'block';
    badgeEl.style.background = isProfit ? '#0a3a1a' : '#3a0a0a';
    badgeEl.style.border     = `1px solid ${isProfit ? '#2ab070' : '#b04040'}`;
    badgeEl.style.color      = netColor;
    badgeEl.textContent      = `${netLabel}: ${netDisplay} ر.س`;
  }
  if (countEl) countEl.textContent = `${_isTreeData.length} حساب`;
}

function renderIncomeStatement() {
  initIncomeStatement();
  _isPopulateBranches();
  _isUpdateBreadcrumb();
  if (_isTreeMode) {
    if (_isTreeData) _renderISTree();
    else fetchIncomeStatementTree();
  } else {
    if (_isData) { _renderISRows(); _isStartCountdown(_isData.length); }
    else fetchIncomeStatement();
  }
}

window._isDrillIn = function(code, name) {
  _isRootFilter = { code, name };
  const levelEl = document.getElementById('is-level');
  if (levelEl) {
    const cur = parseInt(levelEl.value) || 3;
    if (cur < 5) levelEl.value = String(cur + 1);
  }
  _isUpdateBreadcrumb();
  fetchIncomeStatement();
};

// Professional-statement KPI strip: Revenue → COGS → Gross Profit → OpEx → Net Profit.
// Always reflects the whole entity (ignores drill-down/rootCode filter) — a "gross profit"
// figure isn't meaningful once you've filtered to one branch of the account tree.
function _renderISKPIs() {
  const wrap = document.getElementById('is-kpis');
  if (!wrap) return;
  if (!_isSummary) { wrap.innerHTML = ''; return; }

  const s  = _isSummary;
  const cs = _isCmpSummary;
  const fmtSg = n => n >= 0 ? fmt(n, 2) : `(${fmt(-n, 2)})`;
  const dBadge = (cur, prev) => {
    if (prev == null || Math.abs(prev) < 1) return '';
    const d = cur - prev; const pct = d / Math.abs(prev) * 100;
    const col = d >= 0 ? '#4ada8e' : '#da4a4a'; const arrow = d >= 0 ? '▲' : '▼';
    return `<span style="color:${col};margin-left:5px">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  };
  const items = [
    { lbl: 'إجمالي الإيرادات',      val: fmtSg(s.revenueTotal), sub: `${dBadge(s.revenueTotal, cs?.revenueTotal)}100% من الإيراد`,                    accent: '#4ada8e' },
    { lbl: 'تكلفة المبيعات',        val: `(${fmt(s.costOfSales, 2)})`, sub: s.revenueTotal ? (s.costOfSales/s.revenueTotal*100).toFixed(1)+'% من الإيراد' : '—', accent: '#e0906a' },
    { lbl: 'مجمل الربح',            val: fmtSg(s.grossProfit),  sub: `${dBadge(s.grossProfit, cs?.grossProfit)}هامش ${s.grossMargin.toFixed(1)}%`,     accent: s.grossProfit>=0 ? '#5baef0' : '#da4a4a' },
    { lbl: 'المصروفات التشغيلية',   val: `(${fmt(s.opexTotal, 2)})`, sub: s.revenueTotal ? (s.opexTotal/s.revenueTotal*100).toFixed(1)+'% من الإيراد' : '—', accent: '#da9a4a' },
    { lbl: s.netProfit>=0 ? 'صافي الربح' : 'صافي الخسارة', val: fmtSg(s.netProfit), sub: `${dBadge(s.netProfit, cs?.netProfit)}هامش ${s.revenueTotal ? (s.netProfit/s.revenueTotal*100).toFixed(1) : '0'}%`, accent: s.netProfit>=0 ? '#4ada8e' : '#da4a4a' },
  ];
  wrap.innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val} ر.س</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

function _renderISRows() {
  const tbody   = document.getElementById('is-tbody');
  const tfoot   = document.getElementById('is-tfoot');
  const thead   = document.querySelector('#is-table thead');
  const countEl = document.getElementById('is-count');
  const badgeEl = document.getElementById('is-net-badge');
  if (!tbody) return;

  _renderISKPIs();

  if (!_isData) {
    tfoot.innerHTML = '';
    if (badgeEl) badgeEl.style.display = 'none';
    return;
  }

  const search = (document.getElementById('is-search').value || '').trim().toLowerCase();
  const rows   = _isData.filter(r =>
    !search || r.code.toLowerCase().includes(search) || r.name.toLowerCase().includes(search)
  );
  if (countEl) countEl.textContent = `${rows.length} حساب`;

  // Comparison state
  const cmpMode = document.getElementById('is-cmp-mode')?.value || '';
  const cmp     = !!(cmpMode && _isCmpData);
  const cmpMap  = cmp ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;
  const C       = cmp ? 7 : 5;   // total column count

  // Comparison period label for thead
  const fromYM    = document.getElementById('is-from').value || '';
  const toYM      = document.getElementById('is-to').value   || '';
  const { prevFromYM, prevToYM } = _isCmpRange(fromYM, toYM, cmpMode);

  // Rebuild thead to reflect comparison column count
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="min-width:120px">كود الحساب</th>
        <th rowspan="2" style="min-width:220px">البيان</th>
        <th colspan="2" class="tb-col-grp-hdr">نشاط الفترة (${esc(fromYM)}–${esc(toYM)})</th>
        <th rowspan="2" class="num" style="min-width:120px">الصافي</th>
        ${cmp ? `
          <th rowspan="2" class="num" style="min-width:120px;background:#0b1f3a;color:#6a9acb">
            ${esc(_isCmpModeLabel(cmpMode))}<br><small style="font-weight:400;font-size:.7rem;color:#4a7aaa">${esc(prevFromYM)}–${esc(prevToYM)}</small>
          </th>
          <th rowspan="2" class="num" style="min-width:80px;background:#0b1f3a;color:#6a9acb">التغيير&nbsp;%</th>
        ` : ''}
      </tr>
      <tr>
        <th class="num tb-dr" style="min-width:110px">مدين</th>
        <th class="num tb-cr" style="min-width:110px">دائن</th>
      </tr>`;
  }

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${C}" style="text-align:center;padding:40px;color:#3a5a7a">لا توجد حسابات تطابق البحث</td></tr>`;
    tfoot.innerHTML = ''; if (badgeEl) badgeEl.style.display = 'none';
    return;
  }

  const canDrill = parseInt(document.getElementById('is-level').value || '3') < 5;
  const revRows  = rows.filter(r => r.plType === 'rev');
  const expRows  = rows.filter(r => r.plType === 'exp');

  // Inline helpers
  const fmtNet = (n, col) => n >= 0 ? `<span style="color:${col}">${fmt(n, 2)}</span>`
                                     : `<span style="color:#da4a4a">(${fmt(-n, 2)})</span>`;
  const cmpCell = (code, isRev) => {
    if (!cmp) return '';
    const v = cmpMap.get(code);
    if (v === undefined) return `<td class="num" style="color:#3a5a7a">—</td><td class="num" style="color:#3a5a7a">—</td>`;
    const col = isRev ? (v >= 0 ? '#3ab870' : '#da4a4a') : '#9090a0';
    const disp = v >= 0 ? fmt(v, 2) : `(${fmt(-v, 2)})`;
    return `<td class="num" style="color:${col}">${disp}</td><td></td>`;
  };
  const cmpNetCell = (cmpV) => {
    if (!cmp) return '';
    if (cmpV === null) return `<td class="num" style="color:#3a5a7a">—</td><td></td>`;
    const col = cmpV >= 0 ? '#3ab870' : '#da4a4a';
    return `<td class="num" style="color:${col}">${cmpV >= 0 ? fmt(cmpV,2) : '('+fmt(-cmpV,2)+')'}</td><td></td>`;
  };
  const changePctCell = (cur, cmpV, bg) => {
    if (!cmp) return '';
    if (cmpV === null || cmpV === undefined) return `<td class="num"${bg ? ` style="background:${bg}"` : ''}><span style="color:#3a5a7a">—</span></td>`;
    if (Math.abs(cmpV) < 0.01) return `<td class="num"${bg ? ` style="background:${bg}"` : ''}><span style="color:#8ab0d0">${cur === 0 ? '—' : 'جديد'}</span></td>`;
    const pct = (cur - cmpV) / Math.abs(cmpV) * 100;
    const col = pct >= 0 ? '#4ada8e' : '#da4a4a';
    return `<td class="num"${bg ? ` style="background:${bg}"` : ''}><span style="color:${col}">${pct >= 0 ? '▲' : '▼'}&nbsp;${Math.abs(pct).toFixed(1)}%</span></td>`;
  };

  let html = '';
  let totalRevNet = 0, totalRevCmpNet = 0;
  let totalExpNet = 0, totalExpCmpNet = 0;
  let totalRevDr  = 0, totalRevCr    = 0;
  let totalExpDr  = 0, totalExpCr    = 0;

  // ── الإيرادات ─────────────────────────────────────────────────────────────
  if (revRows.length > 0) {
    html += `<tr><td colspan="${C}" style="padding:0">
      <div style="background:linear-gradient(90deg,#061f10,#0a2a15);color:#4ada8e;font-weight:700;
        padding:9px 16px;border-right:4px solid #2ab070;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #1a4a2a;margin-top:4px">◈ الإيرادات</div></td></tr>`;

    revRows.forEach(r => {
      totalRevDr  += r.pDebit; totalRevCr  += r.pCredit; totalRevNet += r.net;
      if (cmp) totalRevCmpNet += cmpMap.get(r.code) ?? 0;
      const drA  = canDrill ? `onclick="_isDrillIn('${r.code.replace(/'/g,"\\'")}','${r.name.replace(/'/g,"\\'")}') "` : '';
      const arr  = canDrill ? ` <span style="color:#4ada8e;font-size:.65rem;opacity:.7">▶</span>` : '';
      const cmpV = cmp ? (cmpMap.get(r.code) ?? null) : null;
      html += `<tr class="tb-row" ${drA} style="${canDrill ? 'cursor:pointer' : ''}">
        <td style="font-family:monospace;color:#7090b0;padding-right:28px;font-size:.79rem">${esc(r.code)}</td>
        <td style="color:#c8d8e8">${esc(r.name)}${arr}</td>
        <td class="num ${r.pDebit  ? 'tb-dr' : 'tb-zero'}">${r.pDebit  ? fmt(r.pDebit,  2) : '—'}</td>
        <td class="num ${r.pCredit ? 'tb-cr' : 'tb-zero'}">${r.pCredit ? fmt(r.pCredit, 2) : '—'}</td>
        <td class="num" style="font-weight:600">${fmtNet(r.net, '#4ada8e')}</td>
        ${cmp ? `<td class="num">${cmpV !== null ? fmtNet(cmpV, '#3ab870') : '—'}</td>${changePctCell(r.net, cmpV)}` : ''}
      </tr>`;
    });

    const revCmpTotal = cmp ? totalRevCmpNet : null;
    html += `<tr style="border-top:1px solid #1e4a2a">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px 7px 4px;background:#061a0e;color:#6adc8e">إجمالي الإيرادات</td>
      <td class="num tb-dr" style="background:#061a0e;font-weight:700">${fmt(totalRevDr,2)}</td>
      <td class="num tb-cr" style="background:#061a0e;font-weight:700">${fmt(totalRevCr,2)}</td>
      <td class="num" style="background:#061a0e;font-weight:800;font-size:.94rem">${fmtNet(totalRevNet,'#4ada8e')}</td>
      ${cmp ? `<td class="num" style="background:#061a0e;font-weight:700">${fmtNet(revCmpTotal,'#3ab870')}</td>${changePctCell(totalRevNet, revCmpTotal,'#061a0e')}` : ''}
    </tr>`;
  }

  // ── المصروفات ─────────────────────────────────────────────────────────────
  if (expRows.length > 0) {
    html += `<tr><td colspan="${C}" style="padding:0">
      <div style="background:linear-gradient(90deg,#1f0808,#2a1208);color:#e0906a;font-weight:700;
        padding:9px 16px;border-right:4px solid #b04020;font-size:.86rem;letter-spacing:.4px;
        border-top:1px solid #4a1a0a;margin-top:6px">◈ المصروفات</div></td></tr>`;

    // Group by parent
    const expGroups = new Map();
    expRows.forEach(r => {
      const key = r.parentCode || r.code.substring(0, 2);
      if (!expGroups.has(key)) expGroups.set(key, { label: r.parentName || key, rows: [] });
      expGroups.get(key).rows.push(r);
    });
    const sortedGrps = [...expGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const multi      = sortedGrps.length > 1;

    sortedGrps.forEach(([, grp]) => {
      let grpDr = 0, grpCr = 0, grpNet = 0, grpCmpNet = 0;

      if (multi) {
        html += `<tr><td colspan="${C}" style="padding:5px 16px 3px 4px;background:#150808;
          color:#c09070;font-size:.81rem;font-weight:600;border-right:3px solid #5a2a10;
          border-top:1px solid #2a1208">${esc(grp.label)}</td></tr>`;
      }

      grp.rows.forEach(r => {
        grpDr += r.pDebit; grpCr += r.pCredit; grpNet += r.net;
        const cmpV = cmp ? (cmpMap.get(r.code) ?? null) : null;
        if (cmp && cmpV !== null) grpCmpNet += cmpV;
        const drA = canDrill ? `onclick="_isDrillIn('${r.code.replace(/'/g,"\\'")}','${r.name.replace(/'/g,"\\'")}') "` : '';
        const arr = canDrill ? ` <span style="color:#da8a5a;font-size:.65rem;opacity:.7">▶</span>` : '';
        html += `<tr class="tb-row" ${drA} style="${canDrill ? 'cursor:pointer' : ''}">
          <td style="font-family:monospace;color:#7090b0;padding-right:${multi?38:28}px;font-size:.79rem">${esc(r.code)}</td>
          <td style="color:#c8d8e8">${esc(r.name)}${arr}</td>
          <td class="num ${r.pDebit  ? 'tb-dr' : 'tb-zero'}">${r.pDebit  ? fmt(r.pDebit,  2) : '—'}</td>
          <td class="num ${r.pCredit ? 'tb-cr' : 'tb-zero'}">${r.pCredit ? fmt(r.pCredit, 2) : '—'}</td>
          <td class="num" style="font-weight:600;color:#e0a070">${fmt(r.net, 2)}</td>
          ${cmp ? `<td class="num" style="color:#9090a0">${cmpV !== null ? fmt(cmpV,2) : '—'}</td>${changePctCell(r.net, cmpV)}` : ''}
        </tr>`;
      });

      totalExpDr += grpDr; totalExpCr += grpCr; totalExpNet += grpNet;
      if (cmp) totalExpCmpNet += grpCmpNet;

      if (multi) {
        html += `<tr>
          <td colspan="2" style="text-align:right;font-weight:600;padding:5px 16px 5px 4px;
            background:#100606;border-top:1px dashed #3a1a08;color:#c09070;font-size:.8rem">إجمالي ${esc(grp.label)}</td>
          <td class="num tb-dr" style="background:#100606;border-top:1px dashed #3a1a08;font-size:.8rem;font-weight:600">${fmt(grpDr,2)}</td>
          <td class="num tb-cr" style="background:#100606;border-top:1px dashed #3a1a08;font-size:.8rem;font-weight:600">${fmt(grpCr,2)}</td>
          <td class="num" style="background:#100606;border-top:1px dashed #3a1a08;font-weight:700;color:#e0a070;font-size:.8rem">${fmt(grpNet,2)}</td>
          ${cmp ? `<td class="num" style="background:#100606;border-top:1px dashed #3a1a08;color:#9090a0;font-size:.8rem">${fmt(grpCmpNet,2)}</td>${changePctCell(grpNet,grpCmpNet,'#100606')}` : ''}
        </tr>`;
      }
    });

    html += `<tr style="border-top:1px solid #4a1a08">
      <td colspan="2" style="text-align:right;font-weight:700;padding:7px 16px 7px 4px;background:#120808;color:#e08060">إجمالي المصروفات</td>
      <td class="num tb-dr" style="background:#120808;font-weight:700">${fmt(totalExpDr,2)}</td>
      <td class="num tb-cr" style="background:#120808;font-weight:700">${fmt(totalExpCr,2)}</td>
      <td class="num" style="background:#120808;font-weight:800;font-size:.94rem;color:#e08060">${fmt(totalExpNet,2)}</td>
      ${cmp ? `<td class="num" style="background:#120808;font-weight:700;color:#9090a0">${fmt(totalExpCmpNet,2)}</td>${changePctCell(totalExpNet,totalExpCmpNet,'#120808')}` : ''}
    </tr>`;
  }

  tbody.innerHTML = html;

  // ── صافي الربح / الخسارة ─────────────────────────────────────────────────
  const netProfit    = totalRevNet  - totalExpNet;
  const netCmpProfit = cmp ? (totalRevCmpNet - totalExpCmpNet) : null;
  const isProfit     = netProfit >= 0;
  const netColor     = isProfit ? '#4ada8e' : '#da4a4a';
  const netLabel     = isProfit ? 'صافي الربح للفترة' : 'صافي الخسارة للفترة';
  const netDisplay   = isProfit ? fmt(netProfit, 2) : '(' + fmt(-netProfit, 2) + ')';
  const grandDr      = totalRevDr + totalExpDr;
  const grandCr      = totalRevCr + totalExpCr;

  tfoot.innerHTML = `
    <tr style="border-top:2px solid #2a4a7a">
      <td colspan="2" style="text-align:right;font-weight:800;padding:11px 16px;background:#071830;font-size:.96rem;color:${netColor}">${netLabel}</td>
      <td class="num tb-dr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(grandDr,2)}</td>
      <td class="num tb-cr" style="background:#071830;font-weight:700;font-size:.88rem">${fmt(grandCr,2)}</td>
      <td class="num" style="background:#071830;font-weight:900;font-size:1.08rem;color:${netColor}">${netDisplay}</td>
      ${cmp ? (() => {
        const cmpIsProfit = netCmpProfit >= 0;
        const cmpCol      = cmpIsProfit ? '#3ab870' : '#da4a4a';
        const cmpDisp     = cmpIsProfit ? fmt(netCmpProfit,2) : '('+fmt(-netCmpProfit,2)+')';
        return `<td class="num" style="background:#071830;font-weight:800;font-size:1rem;color:${cmpCol}">${cmpDisp}</td>${changePctCell(netProfit, netCmpProfit,'#071830')}`;
      })() : ''}
    </tr>`;

  if (badgeEl) {
    badgeEl.style.display    = 'block';
    badgeEl.style.background = isProfit ? '#0a3a1a' : '#3a0a0a';
    badgeEl.style.border     = `1px solid ${isProfit ? '#2ab070' : '#b04040'}`;
    badgeEl.style.color      = netColor;
    badgeEl.textContent      = `${netLabel}: ${netDisplay} ر.س${
      cmp && netCmpProfit !== null
        ? `  |  مقارنة: ${netCmpProfit >= 0 ? fmt(netCmpProfit,2) : '('+fmt(-netCmpProfit,2)+')'} ر.س`
        : ''}`;
  }

  _isRenderChart(revRows, expRows, totalRevNet, totalExpNet, netProfit);
}

function _isRenderChart(revRows, expRows, totalRevNet, totalExpNet, netProfit) {
  const wrap   = document.getElementById('is-chart-wrap');
  const canvas = document.getElementById('chart-is');
  if (!wrap || !canvas || typeof Chart === 'undefined') return;

  // Top 5 revenue + top 5 expense accounts by absolute net, plus totals bar
  const topRev = [...revRows].sort((a,b) => b.net - a.net).slice(0, 5);
  const topExp = [...expRows].sort((a,b) => b.net - a.net).slice(0, 5);

  if (!topRev.length && !topExp.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const labels = [
    ...topRev.map(r => r.name.length > 22 ? r.name.slice(0, 22) + '…' : r.name),
    ...topExp.map(r => r.name.length > 22 ? r.name.slice(0, 22) + '…' : r.name),
  ];
  const revData = [...topRev.map(r => r.net), ...topExp.map(() => 0)];
  const expData = [...topRev.map(() => 0),    ...topExp.map(r => r.net)];

  if (_isChart) { _isChart.destroy(); _isChart = null; }
  _isChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'إيرادات', data: revData, backgroundColor: '#27ae6099', borderWidth: 0, borderRadius: 4 },
        { label: 'مصروفات', data: expData, backgroundColor: '#c0392b88', borderWidth: 0, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw, 0)} ر.س` } },
      },
      scales: {
        x: { ticks: { color: '#5a7a9a', font: { size: 9 }, callback: v => fmt(v, 0) }, grid: { color: '#1a2a3a' } },
        y: { ticks: { color: '#8ba0b8', font: { size: 9 } }, grid: { color: '#1a2a3a22' } },
      },
    },
  });
}

// ── القائمة الرسمية (طباعة/تصدير) ────────────────────────────────────────────
// تمثيل بصيغة القائمة المالية الرسمية وفق المعايير السعودية: بدون أعمدة مدين/دائن،
// وبتفصيل الإيرادات وتكلفة المبيعات والمصروفات التشغيلية (مجمّعة حسب نفس تصنيف
// CAT_ORDER المعتمد في بقية الداشبورد)، مع فصل التكاليف التمويلية/الفوائد البنكية
// كي يظهر "الربح من العمليات" قبل الفوائد والزكاة والضريبة كبند مستقل.
// كل سطر: { t: sec|item|subtotal|grand|final, label, val, cmp, accent }
function _isFormalLines() {
  if (!_isSummary) return null;
  const sm = _isSummary, cm = _isCmpSummary;
  const catTotals = sm.catTotals || {};
  const cmpCat     = cm?.catTotals || {};
  const revRows    = (_isData || []).filter(r => r.plType === 'rev');
  const cmpMap     = _isCmpData ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;

  const lines = [];

  lines.push({ t:'sec', label:'الإيرادات' });
  revRows.forEach(r => lines.push({ t:'item', label:r.name,
    val:r.net, cmp: cmpMap ? (cmpMap.get(r.code) ?? null) : null }));
  lines.push({ t:'subtotal', label:'إجمالي الإيرادات', val:sm.revenueTotal, cmp: cm?.revenueTotal ?? null });

  lines.push({ t:'sec', label:'تكلفة المبيعات' });
  if (sm.cogsTotal)            lines.push({ t:'item', label:'تكلفة البضاعة المباعة', val:-sm.cogsTotal, cmp: cm ? -cm.cogsTotal : null });
  if (sm.otherDirectCostTotal) lines.push({ t:'item', label:'تكاليف مباشرة أخرى',     val:-sm.otherDirectCostTotal, cmp: cm ? -cm.otherDirectCostTotal : null });
  lines.push({ t:'subtotal', label:'إجمالي تكلفة المبيعات', val:-sm.costOfSales, cmp: cm ? -cm.costOfSales : null });

  lines.push({ t:'grand', label:'مجمل الربح', val:sm.grossProfit, cmp: cm?.grossProfit ?? null, accent:'green' });

  lines.push({ t:'sec', label:'المصروفات التشغيلية' });
  const opexCats = CAT_ORDER.filter(c => c !== 'fin');
  opexCats.forEach(c => {
    const v = catTotals[c] || 0;
    if (!v) return;
    lines.push({ t:'item', label:CAT_LABEL[c], val:-v, cmp: cm ? -(cmpCat[c] || 0) : null });
  });
  const opexExFin    = sm.opexTotal - (sm.financeCostTotal || 0);
  const cmpOpexExFin = cm ? (cm.opexTotal - (cm.financeCostTotal || 0)) : null;
  lines.push({ t:'subtotal', label:'إجمالي المصروفات التشغيلية', val:-opexExFin, cmp: cmpOpexExFin !== null ? -cmpOpexExFin : null });

  lines.push({ t:'grand', label:'الربح من العمليات (قبل الفوائد البنكية والزكاة والضريبة)',
    val:sm.operatingProfit, cmp: cm?.operatingProfit ?? null, accent:'blue' });

  if (sm.financeCostTotal) {
    lines.push({ t:'sec', label:'التكاليف التمويلية' });
    lines.push({ t:'item', label:CAT_LABEL.fin, val:-sm.financeCostTotal, cmp: cm ? -(cm.financeCostTotal || 0) : null });
    lines.push({ t:'subtotal', label:'إجمالي التكاليف التمويلية', val:-sm.financeCostTotal, cmp: cm ? -(cm.financeCostTotal || 0) : null });
  }

  const isProfit = sm.netProfit >= 0;
  lines.push({ t:'final',
    label: isProfit ? 'صافي الربح للفترة (قبل الزكاة والضريبة)' : 'صافي الخسارة للفترة (قبل الزكاة والضريبة)',
    val:sm.netProfit, cmp: cm?.netProfit ?? null, accent: isProfit ? 'green' : 'red' });

  return lines;
}

async function exportISExcel() {
  if (!_isData || !_isData.length || !_isSummary) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const fromYM  = document.getElementById('is-from').value || '';
  const toYM    = document.getElementById('is-to').value   || '';
  const cmpMode = document.getElementById('is-cmp-mode')?.value || '';
  const { prevFromYM, prevToYM } = _isCmpRange(fromYM, toYM, cmpMode);
  const lvlTxt  = ([...document.getElementById('is-level').options].find(o=>o.selected)||{}).textContent || '';
  const brTxt   = ([...document.getElementById('is-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const company = State.get('companyName') || '';
  const withCmp = !!(cmpMode && _isCmpSummary);
  const genDate = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  const lines   = _isFormalLines();

  try {
    const NC      = withCmp ? 4 : 2;
    const FONT    = 'Calibri';
    const numFmt  = '#,##0;[Red](#,##0);"-"';
    const CLR = {
      navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
      bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
      textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
      textLight:'FF6A8AAA', textGray:'FF888888',
      greenBg:'FFF4FFF8', greenText:'FF1A6A2A',
      redBg:'FFFFF4F4',   redText:'FF8A2A00',
    };
    const ACCENT_BG   = { green: CLR.greenBg, blue: CLR.blueXPale, red: CLR.redBg };
    const ACCENT_TEXT = { green: CLR.greenText, blue: CLR.textNavy, red: CLR.redText };
    const solid = (a) => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
    const bdr   = (s,a) => ({ style:s, color:{ argb:a } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
    const ws = wb.addWorksheet('قائمة الدخل', { views:[{ rightToLeft:true, showGridLines:false }] });
    ws.pageSetup.paperSize        = 9;
    ws.pageSetup.orientation      = 'portrait';
    ws.pageSetup.fitToPage        = true;
    ws.pageSetup.fitToWidth       = 1;
    ws.pageSetup.fitToHeight      = 0;   // بدون حد لعدد الصفحات رأسياً — يمنع انضغاط القائمة الطويلة في صفحة واحدة
    ws.pageSetup.horizontalCentered = true;
    ws.pageSetup.showGridLines    = false;
    ws.pageSetup.blackAndWhite    = false;
    ws.pageSetup.margins = { left:0.6, right:0.5, top:0.75, bottom:0.6, header:0.3, footer:0.3 };
    // ملاحظة: لازم مسافة بعد رمز حجم الخط (&8) قبل أي نص عربي — إن التصق رمز
    // الحجم مباشرة برقم عربي (٠-٩ الشرقية) يُحدث عطلاً في محرك إكسل يُظهر
    // الكلمة التالية بحجم ضخم يغطي الورقة عند الطباعة/التصدير لـ PDF.
    ws.headerFooter.oddFooter =
      `&L&8 ${genDate}&C&8 ${(company || 'قائمة الدخل').replace(/&/g,'&&')} — سري للاستخدام الداخلي&R&8 صفحة &P من &N`;

    ws.columns = withCmp
      ? [{width:58},{width:20},{width:20},{width:12}]
      : [{width:58},{width:22}];

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

    function setNum(cell, v, fc, bold) {
      cell.value = (v !== null && v !== undefined) ? +v.toFixed(0) : null;
      cell.numFmt = numFmt;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      cell.font = { name:FONT, size:9.5, color:{ argb: fc || CLR.textNavy }, bold: bold || false };
    }

    // ── سطر واحد من القائمة الرسمية (بند / مجموع فرعي / إجمالي) ────────────────
    function addFormalRow(line) {
      if (line.t === 'sec') {
        const row = ws.addRow([line.label]); row.height = 20; spanAll(row);
        const c = row.getCell(1);
        c.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
        c.fill = solid(CLR.navy);
        c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
        return;
      }

      const isItem  = line.t === 'item';
      const isBig   = line.t === 'grand' || line.t === 'final';
      const bg      = isBig ? (ACCENT_BG[line.accent] || CLR.white)
                    : line.t === 'subtotal' ? CLR.bluePale : CLR.white;
      const fc      = isItem ? CLR.textDark : (ACCENT_TEXT[line.accent] || CLR.textNavy);
      const valFc   = isItem ? CLR.textNavy : (ACCENT_TEXT[line.accent] || CLR.textNavy);

      const row = ws.addRow([line.label, line.val ?? null, ...(withCmp ? [line.cmp ?? null, null] : [])]);
      row.height = isItem ? 17 : line.t === 'subtotal' ? 18 : line.t === 'grand' ? 22 : 24;

      row.getCell(1).font = { name:FONT, size: line.t==='final' ? 11 : (isItem ? 9.5 : 10.5), bold: !isItem, color:{ argb:fc } };
      row.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent: isItem ? 2 : 0 };
      setNum(row.getCell(2), line.val, valFc, !isItem);
      row.getCell(2).font = { ...row.getCell(2).font, size: line.t==='final' ? 11 : (isItem ? 9.5 : 10.5) };

      row.eachCell({ includeEmpty:true }, c => { c.fill = solid(bg); });

      if (isBig) {
        const bord = { top:bdr('double',CLR.navyDark), bottom:bdr('medium',CLR.navyDark) };
        row.eachCell({ includeEmpty:true }, c => { c.border = bord; });
      } else if (line.t === 'subtotal') {
        const bord = { top:bdr('thin','FFC0CFE8'), bottom:bdr('thin','FFB0C4DC') };
        row.eachCell({ includeEmpty:true }, c => { c.border = bord; });
      } else {
        const hairBdr = { bottom: bdr('hair','FFE8ECF0') };
        row.getCell(1).border = hairBdr; row.getCell(2).border = hairBdr;
      }

      if (withCmp) {
        setNum(row.getCell(3), line.cmp ?? null, CLR.textGray, !isItem);
        if (line.cmp !== null && line.cmp !== undefined && Math.abs(line.cmp) > 0.01) {
          const pct = (line.val - line.cmp) / Math.abs(line.cmp) * 100;
          row.getCell(4).value  = +pct.toFixed(1);
          row.getCell(4).numFmt = '0.0"%"';
          row.getCell(4).font   = { name:FONT, size:9, bold: !isItem, color:{ argb: pct >= 0 ? CLR.greenText : 'FFCC4444' } };
        }
        row.getCell(4).alignment = { horizontal:'center', vertical:'middle' };
        if (isBig) {
          const bord = { top:bdr('double',CLR.navyDark), bottom:bdr('medium',CLR.navyDark) };
          row.getCell(3).border = bord; row.getCell(4).border = bord;
        } else if (line.t === 'subtotal') {
          const bord = { top:bdr('thin','FFC0CFE8'), bottom:bdr('thin','FFB0C4DC') };
          row.getCell(3).border = bord; row.getCell(4).border = bord;
        } else {
          const hairBdr = { bottom: bdr('hair','FFE8ECF0') };
          row.getCell(3).border = hairBdr; row.getCell(4).border = hairBdr;
        }
      }
    }

    // ── Title block ──────────────────────────────────────────────────────────
    addTitle(company || 'قائمة الدخل', 14, CLR.white, CLR.navyDark);
    addTitle('قائمة الدخل', 12, CLR.white, CLR.navy);
    addTitle(`الفترة: ${fromYM} إلى ${toYM}${withCmp?`  |  مقارنة (${_isCmpModeLabel(cmpMode)}): ${prevFromYM} إلى ${prevToYM}`:''} | ${lvlTxt} | الفرع: ${brTxt}`, 9.5, 'FFAACCE8', CLR.navyDark);
    addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
    addSpacer(4);

    // ── Column header — يظهر دائماً (وليس فقط عند تفعيل المقارنة) ──────────────
    const colHdrRow = ws.addRow(withCmp
      ? ['البيان', 'الفترة الحالية', 'فترة المقارنة', 'التغيير %']
      : ['البيان', 'المبلغ (ر.س)']);
    colHdrRow.height = 20;
    colHdrRow.eachCell({ includeEmpty:true }, (c,ci) => {
      c.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } };
      c.fill = solid(CLR.navy);
      c.alignment = { horizontal: ci===1 ? 'right' : 'center', vertical:'middle' };
      c.border = { bottom: bdr('medium', CLR.navyDark) };
    });
    const tableStartRow = colHdrRow.number;

    lines.forEach(addFormalRow);
    const tableEndRow = ws.rowCount;

    // ── إطار خارجي حول القائمة كاملة + خط فاصل رأسي بين البيان والمبالغ ────────
    for (let r = tableStartRow; r <= tableEndRow; r++) {
      const row = ws.getRow(r);
      const first = row.getCell(1), last = row.getCell(NC);
      first.border = { ...first.border, left:  bdr('medium', CLR.navyDark) };
      last.border  = { ...last.border,  right: bdr('medium', CLR.navyDark) };
      if (r === tableStartRow) { first.border = { ...first.border, top: bdr('medium', CLR.navyDark) }; last.border = { ...last.border, top: bdr('medium', CLR.navyDark) }; }
      if (r === tableEndRow)   { first.border = { ...first.border, bottom: bdr('medium', CLR.navyDark) }; last.border = { ...last.border, bottom: bdr('medium', CLR.navyDark) }; }
    }

    // تُطبع عناوين القائمة وصف رأس الأعمدة في أعلى كل صفحة عند تعدّد الصفحات
    ws.pageSetup.printTitlesRow = `1:${tableStartRow}`;
    // تجميد الصفوف العلوية عند الاستعراض على الشاشة قبل الطباعة
    ws.views = [{ rightToLeft:true, showGridLines:false, state:'frozen', ySplit: tableStartRow }];

    // ── تذييل داخل الورقة ────────────────────────────────────────────────────
    addSpacer(6);
    {
      const row = ws.addRow(['تم إنشاء هذا التقرير آلياً وفق معايير المحاسبة السعودية للشركات الصغيرة والمتوسطة (IFRS for SMEs — SOCPA)']);
      row.height = 16; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:8, italic:true, color:{ argb:CLR.textLight } };
      c.alignment = { horizontal:'center', vertical:'middle' };
    }

    // ── Download ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `قائمة_الدخل_${fromYM}_${toYM}.xlsx`; a.click();
    URL.revokeObjectURL(url);

  } catch(err) {
    console.error('IS Excel export error:', err);
    alert('خطأ في التصدير إلى Excel: ' + err.message);
  }
}

// يبني مستند HTML الكامل للقائمة الرسمية — تُستخدم مشتركةً بين تصدير HTML والطباعة،
// حتى لا يتكرر منطق التنسيق بين الحالتين.
function _isFormalHTMLDoc() {
  const fromYM = document.getElementById('is-from').value || '';
  const toYM   = document.getElementById('is-to').value   || '';
  const lvlTxt = ([...document.getElementById('is-level').options].find(o=>o.selected)||{}).textContent || '';
  const brTxt  = ([...document.getElementById('is-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const db     = State.get('activeDb') || '';
  const company = State.get('companyName') || '';

  const cmpMode = document.getElementById('is-cmp-mode')?.value || '';
  const withCmp = !!(cmpMode && _isCmpSummary);
  const { prevFromYM, prevToYM } = _isCmpRange(fromYM, toYM, cmpMode);
  const lines = _isFormalLines();

  function fmtN(n) { return (+n||0).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function fmtSg(n) { return n >= 0 ? fmtN(n) : `(${fmtN(-n)})`; }
  function pctHtml(cur, cmpV) {
    if (!withCmp) return '';
    if (cmpV === null || cmpV === undefined) return '<td class="num" style="color:#aaa">—</td>';
    if (Math.abs(cmpV) < 0.01) return `<td class="num" style="color:#6a9ab0">${cur===0?'—':'جديد'}</td>`;
    const p = (cur - cmpV) / Math.abs(cmpV) * 100;
    return `<td class="num" style="color:${p>=0?'#1a7a3a':'#cc3333'}">${p>=0?'▲':'▼'}&nbsp;${Math.abs(p).toFixed(1)}%</td>`;
  }
  const cmpValCell = (cmpV) => withCmp
    ? `<td class="num" style="color:#666">${cmpV!==null&&cmpV!==undefined?fmtSg(cmpV):'—'}</td>`
    : '';

  const rowClass = { sec:'sec-hdr', item:'', subtotal:'subtotal', grand:'grand', final:'final' };
  const bodyHtml = (lines || []).map(line => {
    if (line.t === 'sec') return `<tr class="sec-hdr"><td colspan="${withCmp?4:2}">${esc(line.label)}</td></tr>`;
    const cls = rowClass[line.t] || '';
    const accentCls = line.accent ? ` ${line.accent}` : '';
    const valCls = line.t === 'item' ? '' : (line.accent === 'red' ? 'style="color:#7a1a1a"' : line.accent === 'green' ? 'style="color:#1a5a2a"' : '');
    return `<tr class="${cls}${accentCls}">
      <td class="lbl">${esc(line.label)}</td>
      <td class="num" ${valCls}>${fmtSg(line.val)}</td>
      ${cmpValCell(line.cmp)}${pctHtml(line.val, line.cmp)}
    </tr>`;
  }).join('');

  const cmpColsHdr = withCmp ? `<th class="num" style="min-width:120px">فترة المقارنة</th><th class="num" style="min-width:80px">التغيير%</th>` : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<title>قائمة الدخل — ${esc(db)}</title>
<style>
@page{size:A4 portrait;margin:15mm 12mm}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:13px;color:#1a2a3a;direction:rtl;background:#f8f9fa;padding:20px}
.sheet{max-width:900px;margin:0 auto}
.cover{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:20px 28px;margin-bottom:18px}
.cover h1{font-size:1.2rem;color:#1a3a5a;margin-bottom:4px}
.cover .meta{font-size:.82rem;color:#555;line-height:1.9}
.cover .meta strong{color:#1a3a5a}
table{width:100%;border-collapse:collapse;background:#fff;border:2px solid #1a3a5a;border-radius:0}
th{background:#1a3a5a;color:#fff;padding:9px 12px;text-align:right;font-weight:600;font-size:.82rem;border-bottom:2px solid #0a2040}
th:not(:last-child),td:not(:last-child){border-left:1px solid #dce3ec}
td{padding:7px 12px;border-bottom:1px solid #f0f2f4;font-size:.86rem;color:#2a3a4a}
td.lbl{text-align:right}
.num{text-align:left;font-variant-numeric:tabular-nums;font-family:monospace}
thead{display:table-header-group}
tbody tr{break-inside:avoid;page-break-inside:avoid}
.sec-hdr{break-after:avoid;page-break-after:avoid}
.sec-hdr td{font-weight:700;font-size:.84rem;padding:8px 12px;letter-spacing:.3px;background:#1a3a5a;color:#fff}
.subtotal td{background:#f0f5ff;font-weight:700;border-top:1px solid #bcd;border-bottom:2px solid #bcd}
.grand td{font-weight:800;font-size:.98rem;border-top:3px double #1a3a5a;border-bottom:2px solid #1a3a5a}
.grand.green td{background:#e6f9ee;color:#1a5a2a}
.grand.blue td{background:#eaf0fb;color:#0a2040}
.final td{font-weight:900;font-size:1.05rem;border-top:3px double #1a3a5a;border-bottom:2px solid #1a3a5a}
.final.green td{background:#e6f9ee;color:#1a5a2a}
.final.red td{background:#fde8e8;color:#7a1a1a}
.foot{margin-top:14px;font-size:.73rem;color:#888;text-align:center;border-top:1px solid #e0e4e8;padding-top:8px}
@media print{
  body{padding:0;background:#fff}
  .sheet{max-width:none}
  .cover{border:none;padding:0 0 10px 0;break-after:avoid;page-break-after:avoid}
  table{border-radius:0}
  .foot{break-inside:avoid;page-break-inside:avoid}
}
</style></head>
<body>
<div class="sheet">
<div class="cover">
  <h1>${esc(company || 'قائمة الدخل')}</h1>
  <div class="meta">
    <strong>الفترة الحالية:</strong> من ${esc(fromYM)} إلى ${esc(toYM)}<br>
    ${withCmp ? `<strong>فترة المقارنة (${esc(_isCmpModeLabel(cmpMode))}):</strong> من ${esc(prevFromYM)} إلى ${esc(prevToYM)}<br>` : ''}
    <strong>الفرع:</strong> ${esc(brTxt)}<br>
    <strong>تاريخ الإصدار:</strong> ${new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'})}
  </div>
</div>
<table>
<thead>
  <tr>
    <th style="min-width:220px">البيان</th>
    <th class="num" style="min-width:130px">المبلغ (ر.س)</th>
    ${cmpColsHdr}
  </tr>
</thead>
<tbody>
${bodyHtml}
</tbody>
</table>
<div class="foot">تم إنشاء هذا التقرير وفق معايير المحاسبة السعودية للشركات الصغيرة والمتوسطة (IFRS for SMEs — SOCPA) — ${new Date().toLocaleString('ar-SA')}</div>
</div>
</body></html>`;
}

function exportISHTML() {
  if (!_isData || !_isData.length || !_isSummary) return;
  const fromYM = document.getElementById('is-from').value || '';
  const toYM   = document.getElementById('is-to').value   || '';
  const cmpMode = document.getElementById('is-cmp-mode')?.value || '';
  const withCmp = !!(cmpMode && _isCmpSummary);

  const html = _isFormalHTMLDoc();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `قائمة_الدخل_${fromYM}_${toYM}${withCmp?'_مقارنة':''}.html`;
  a.click(); URL.revokeObjectURL(url);
}

function _isPrintFormal() {
  if (!_isData || !_isData.length || !_isSummary) { alert('حمّل بيانات القائمة أولاً'); return; }
  const html = _isFormalHTMLDoc();
  const win = window.open('', '_blank');
  if (!win) { alert('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch(_) {} }, 300);
}
