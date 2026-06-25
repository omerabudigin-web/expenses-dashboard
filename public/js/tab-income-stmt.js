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
let _isInited     = false;
let _isRootFilter = null;
let _isTreeData      = null;
let _isTreeCollapsed = new Set();
let _isTreeMode      = false;

function _isLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
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
  document.getElementById('is-print').addEventListener('click', () => window.print());
  document.getElementById('is-search').addEventListener('input', _renderISRows);
  document.getElementById('is-level').addEventListener('change', _isResetData);
  const cmpCb = document.getElementById('is-compare');
  if (cmpCb) cmpCb.addEventListener('change', () => { _isCmpData = null; if (_isData) fetchIncomeStatement(); });
  const bcBack = document.getElementById('is-bc-back');
  if (bcBack) bcBack.addEventListener('click', () => { _isRootFilter = null; _isUpdateBreadcrumb(); fetchIncomeStatement(); });

  // Tree mode toggle
  const treeBtn   = document.getElementById('is-tree-btn');
  const levelWrap = document.getElementById('is-level-wrap');
  if (treeBtn) {
    treeBtn.addEventListener('click', () => {
      _isTreeMode = !_isTreeMode;
      _isTreeData = null; _isData = null; _isCmpData = null;
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

function _isResetData() { _isData = null; _isCmpData = null; _isRootFilter = null; _isUpdateBreadcrumb(); _renderISRows(); }

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

  // Comparison period: same month range, previous year
  const prevFromYM = `${+fromYM.substring(0, 4) - 1}${fromYM.substring(4)}`;
  const prevToYM   = `${+toYM.substring(0, 4)   - 1}${toYM.substring(4)}`;
  const prevFrom   = prevFromYM + '-01';
  const prevTo     = _isLastDay(prevToYM);
  const cmpParams  = new URLSearchParams({ db, from: prevFrom, to: prevTo, level, branch });
  if (_isRootFilter) cmpParams.set('rootCode', _isRootFilter.code);
  const wantCmp = !!(document.getElementById('is-compare')?.checked);

  const loadEl   = document.getElementById('is-loading');
  const statusEl = document.getElementById('is-status');
  const tbodyEl  = document.getElementById('is-tbody');
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';

  const labelEl = document.getElementById('is-period-label');
  if (labelEl) labelEl.textContent = wantCmp
    ? `${fromYM} — ${toYM}  |  مقارنة: ${prevFromYM} — ${prevToYM}`
    : `${fromYM} — ${toYM}`;

  try {
    const fetches = [
      fetch(`/api/income-statement?${params}`).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); })),
      wantCmp
        ? fetch(`/api/income-statement?${cmpParams}`).then(r => r.ok ? r.json() : Promise.resolve([]))
        : Promise.resolve(null),
    ];
    const [rows, cmpRows] = await Promise.all(fetches);
    _isData    = rows;
    _isCmpData = cmpRows;
    _renderISRows();
    _isStartCountdown(rows.length);
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

function _renderISRows() {
  const tbody   = document.getElementById('is-tbody');
  const tfoot   = document.getElementById('is-tfoot');
  const thead   = document.querySelector('#is-table thead');
  const countEl = document.getElementById('is-count');
  const badgeEl = document.getElementById('is-net-badge');
  if (!tbody) return;

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
  const cmp    = !!(document.getElementById('is-compare')?.checked && _isCmpData);
  const cmpMap = cmp ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;
  const C      = cmp ? 7 : 5;   // total column count

  // Comparison period label for thead
  const fromYM    = document.getElementById('is-from').value || '';
  const toYM      = document.getElementById('is-to').value   || '';
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';

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
            المقارنة<br><small style="font-weight:400;font-size:.7rem;color:#4a7aaa">${esc(prevFromYM)}–${esc(prevToYM)}</small>
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

async function exportISExcel() {
  if (!_isData || !_isData.length) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const fromYM     = document.getElementById('is-from').value || '';
  const toYM       = document.getElementById('is-to').value   || '';
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';
  const lvlTxt  = ([...document.getElementById('is-level').options].find(o=>o.selected)||{}).textContent || '';
  const brTxt   = ([...document.getElementById('is-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const company = State.get('companyName') || '';
  const withCmp = !!(document.getElementById('is-compare')?.checked && _isCmpData);
  const cmpMap  = withCmp ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;
  const genDate = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});

  const revRows      = _isData.filter(r => r.plType === 'rev');
  const expRows      = _isData.filter(r => r.plType === 'exp');
  const totalRevNet  = revRows.reduce((s,r) => s + r.net, 0);
  const totalExpNet  = expRows.reduce((s,r) => s + r.net, 0);
  const netProfit    = totalRevNet - totalExpNet;
  const cmpRevNet    = withCmp ? revRows.reduce((s,r) => s + (cmpMap.get(r.code)??0), 0) : null;
  const cmpExpNet    = withCmp ? expRows.reduce((s,r) => s + (cmpMap.get(r.code)??0), 0) : null;
  const netCmpProfit = withCmp ? cmpRevNet - cmpExpNet : null;

  try {
    const NC      = withCmp ? 7 : 5;
    const FONT    = 'Calibri';
    const numFmt  = '#,##0;[Red](#,##0);"-"';
    const numFmt0 = '#,##0;#,##0;"-"';
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
    const ws = wb.addWorksheet('قائمة الدخل الشامل', { views:[{ rightToLeft:true }] });
    ws.pageSetup.paperSize   = 9;
    ws.pageSetup.orientation = 'portrait';
    ws.pageSetup.fitToPage   = true;
    ws.pageSetup.fitToWidth  = 1;
    ws.pageSetup.margins = { left:0.6, right:0.5, top:0.75, bottom:0.75, header:0.3, footer:0.3 };

    ws.columns = withCmp
      ? [{width:14},{width:52},{width:16},{width:16},{width:20},{width:20},{width:12}]
      : [{width:14},{width:52},{width:16},{width:16},{width:20}];

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

    function addSubGrpHdr(text) {
      const row = ws.addRow([text]); row.height = 18; spanAll(row);
      const c = row.getCell(1);
      c.font = { name:FONT, size:9.5, bold:true, italic:true, color:{ argb:CLR.textBlue } };
      c.fill = solid(CLR.blueLight);
      c.alignment = { horizontal:'right', vertical:'middle', indent:2 };
      c.border = { top:bdr('thin','FFC0CFE8'), bottom:bdr('hair','FFD0D8E8') };
    }

    function setNum(cell, v, fmt, fc, bold) {
      cell.value = (v !== null && v !== undefined) ? +v.toFixed(0) : null;
      cell.numFmt = fmt || numFmt;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      cell.font = { name:FONT, size:9.5, color:{ argb: fc || CLR.textNavy }, bold: bold || false };
    }

    function addItem(r, cmpV) {
      const row = ws.addRow([r.code, r.name, r.pDebit||null, r.pCredit||null, r.net||null,
        ...(withCmp ? [cmpV??null, null] : [])]);
      row.height = 17;
      const hairBdr = { bottom: bdr('hair','FFE8ECF0') };

      row.getCell(1).font = { name:FONT, size:8.5, color:{ argb:CLR.textGray } };
      row.getCell(1).alignment = { horizontal:'left', vertical:'middle' };
      row.getCell(1).border = hairBdr;

      row.getCell(2).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } };
      row.getCell(2).alignment = { horizontal:'right', vertical:'middle', indent:2 };
      row.getCell(2).border = hairBdr;

      setNum(row.getCell(3), r.pDebit,  numFmt0, CLR.textNavy, false);
      setNum(row.getCell(4), r.pCredit, numFmt0, CLR.textNavy, false);
      setNum(row.getCell(5), r.net,     numFmt,  CLR.textNavy, false);
      for (let ci=3;ci<=5;ci++) row.getCell(ci).border = hairBdr;

      if (withCmp) {
        setNum(row.getCell(6), cmpV??null, numFmt, CLR.textGray, false);
        row.getCell(6).border = hairBdr; row.getCell(6).fill = solid('FFF8FAFE');
        const pct = (cmpV !== null && cmpV !== undefined && Math.abs(cmpV) > 0.01)
          ? +((r.net - cmpV) / Math.abs(cmpV) * 100).toFixed(1) : null;
        if (pct !== null) {
          row.getCell(7).value  = pct;
          row.getCell(7).numFmt = '0.0"%"';
          row.getCell(7).font   = { name:FONT, size:9, color:{ argb: pct >= 0 ? CLR.greenText : 'FFCC4444' } };
        }
        row.getCell(7).alignment = { horizontal:'center', vertical:'middle' };
        row.getCell(7).border = hairBdr; row.getCell(7).fill = solid('FFF8FAFE');
      }
    }

    function addSubTot(label, dr, cr, net, cmpNet) {
      const row = ws.addRow([label,'',dr||null,cr||null,net||null,
        ...(withCmp?[cmpNet??null,null]:[])]);
      row.height = 18;
      const topBot = { top:bdr('thin','FFC0CFE8'), bottom:bdr('thin','FFB0C4DC') };
      row.eachCell({ includeEmpty:true }, c => { c.fill = solid(CLR.bluePale); c.border = topBot; });
      row.getCell(1).font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.textNavy } };
      row.getCell(1).alignment = { horizontal:'right', vertical:'middle' };
      row.getCell(2).font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.textNavy } };
      setNum(row.getCell(3), dr,  numFmt0, CLR.textNavy, true);
      setNum(row.getCell(4), cr,  numFmt0, CLR.textNavy, true);
      setNum(row.getCell(5), net, numFmt,  CLR.textNavy, true);
      if (withCmp) {
        setNum(row.getCell(6), cmpNet??null, numFmt, CLR.textGray, false);
        row.getCell(6).fill = solid('FFF0F4FA');
        if (cmpNet !== null && Math.abs(cmpNet) > 0.01) {
          row.getCell(7).value  = +((net - cmpNet) / Math.abs(cmpNet) * 100).toFixed(1);
          row.getCell(7).numFmt = '0.0"%"';
          row.getCell(7).font   = { name:FONT, size:9, bold:true, color:{ argb:CLR.textGray } };
        }
        row.getCell(7).alignment = { horizontal:'center', vertical:'middle' };
        row.getCell(7).fill = solid('FFF0F4FA');
      }
    }

    // ── Title block ──────────────────────────────────────────────────────────
    addTitle(company || 'قائمة الدخل الشامل', 14, CLR.white, CLR.navyDark);
    addTitle('قائمة الدخل الشامل', 12, CLR.white, CLR.navy);
    addTitle(`الفترة: ${fromYM} إلى ${toYM}${withCmp?`  |  مقارنة: ${prevFromYM} إلى ${prevToYM}`:''} | ${lvlTxt} | الفرع: ${brTxt}`, 9.5, 'FFAACCE8', CLR.navyDark);
    addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
    addSpacer(4);

    // ── Column header ────────────────────────────────────────────────────────
    {
      const hdr = ['كود الحساب','البيان','مدين الفترة','دائن الفترة','الصافي (ر.س)'];
      if (withCmp) hdr.push(`صافي المقارنة (${prevFromYM}–${prevToYM})`, 'التغيير %');
      const row = ws.addRow(hdr); row.height = 22;
      row.eachCell({ includeEmpty:true }, (c,ci) => {
        c.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
        c.fill = solid(CLR.navy);
        c.alignment = { horizontal: ci<=2 ? 'right' : 'center', vertical:'middle' };
        c.border = { bottom: bdr('medium',CLR.navyDark) };
      });
    }

    // ── Revenue section ──────────────────────────────────────────────────────
    if (revRows.length > 0) {
      addSpacer(4);
      addSecHdr('الإيرادات');
      revRows.forEach(r => addItem(r, withCmp ? (cmpMap.get(r.code)??null) : null));
      const rDr = revRows.reduce((s,r)=>s+r.pDebit,0);
      const rCr = revRows.reduce((s,r)=>s+r.pCredit,0);
      addSubTot('إجمالي الإيرادات', rDr, rCr, totalRevNet, cmpRevNet);
    }

    // ── Expenses section ─────────────────────────────────────────────────────
    if (expRows.length > 0) {
      addSpacer(4);
      addSecHdr('المصروفات والتكاليف');
      const expGroups = new Map();
      expRows.forEach(r => {
        const k = r.parentCode || r.code.substring(0,2);
        if (!expGroups.has(k)) expGroups.set(k, { label: r.parentName||k, rows:[] });
        expGroups.get(k).rows.push(r);
      });
      const multi = expGroups.size > 1;
      [...expGroups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([,grp]) => {
        if (multi) addSubGrpHdr(grp.label);
        grp.rows.forEach(r => addItem(r, withCmp ? (cmpMap.get(r.code)??null) : null));
        if (multi) {
          const gDr  = grp.rows.reduce((s,r)=>s+r.pDebit,0);
          const gCr  = grp.rows.reduce((s,r)=>s+r.pCredit,0);
          const gNet = grp.rows.reduce((s,r)=>s+r.net,0);
          const gCmp = withCmp ? grp.rows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
          addSubTot(`إجمالي ${grp.label}`, gDr, gCr, gNet, gCmp);
        }
      });
      const eDr = expRows.reduce((s,r)=>s+r.pDebit,0);
      const eCr = expRows.reduce((s,r)=>s+r.pCredit,0);
      addSubTot('إجمالي المصروفات', eDr, eCr, totalExpNet, cmpExpNet);
    }

    // ── Net profit grand row ─────────────────────────────────────────────────
    addSpacer();
    {
      const isProfit = netProfit >= 0;
      const netLabel = isProfit ? 'صافي الربح للفترة' : 'صافي الخسارة للفترة';
      const netColor = isProfit ? CLR.greenText : 'FF8A2A00';
      const netBg    = isProfit ? CLR.greenBg   : 'FFFFF4F4';
      const row = ws.addRow([netLabel,'','','',netProfit||null,
        ...(withCmp?[netCmpProfit??null,null]:[])]);
      row.height = 24;
      const bord = { top:bdr('double',CLR.navyDark), bottom:bdr('medium',CLR.navyDark) };
      row.eachCell({ includeEmpty:true }, c => { c.fill = solid(netBg); c.border = bord; });
      row.getCell(1).font = { name:FONT, size:11, bold:true, color:{ argb:netColor } };
      row.getCell(1).alignment = { horizontal:'right', vertical:'middle' };
      setNum(row.getCell(5), netProfit, numFmt, netColor, true);
      row.getCell(5).font = { name:FONT, size:11, bold:true, color:{ argb:netColor } };
      if (withCmp) {
        setNum(row.getCell(6), netCmpProfit??null, numFmt, CLR.textBlue, true);
        row.getCell(6).font = { name:FONT, size:11, bold:true, color:{ argb:CLR.textBlue } };
        row.getCell(6).fill = solid('FFF0F4FA');
        if (netCmpProfit !== null && Math.abs(netCmpProfit) > 0.01) {
          row.getCell(7).value  = +((netProfit - netCmpProfit) / Math.abs(netCmpProfit) * 100).toFixed(1);
          row.getCell(7).numFmt = '0.0"%"';
          row.getCell(7).font   = { name:FONT, size:10, bold:true, color:{ argb:netColor } };
        }
        row.getCell(7).alignment = { horizontal:'center', vertical:'middle' };
        row.getCell(7).fill = solid('FFF0F4FA');
      }
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

function exportISHTML() {
  if (!_isData || !_isData.length) return;

  const fromYM = document.getElementById('is-from').value || '';
  const toYM   = document.getElementById('is-to').value   || '';
  const lvlTxt = ([...document.getElementById('is-level').options].find(o=>o.selected)||{}).textContent || '';
  const brTxt  = ([...document.getElementById('is-branch').options].find(o=>o.selected)||{}).textContent || 'جميع الفروع';
  const db     = State.get('activeDb') || '';

  const withCmp    = !!(document.getElementById('is-compare')?.checked && _isCmpData);
  const cmpMap     = withCmp ? new Map(_isCmpData.map(r => [r.code, r.net])) : null;
  const prevFromYM = fromYM ? `${+fromYM.substring(0,4)-1}${fromYM.substring(4)}` : '';
  const prevToYM   = toYM   ? `${+toYM.substring(0,4)-1}${toYM.substring(4)}`     : '';

  const revRows     = _isData.filter(r => r.plType === 'rev');
  const expRows     = _isData.filter(r => r.plType === 'exp');
  const totalRevNet = revRows.reduce((s,r)=>s+r.net,0);
  const totalExpNet = expRows.reduce((s,r)=>s+r.net,0);
  const netProfit   = totalRevNet - totalExpNet;
  const isProfit    = netProfit >= 0;
  const cmpRevNet   = withCmp ? revRows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
  const cmpExpNet   = withCmp ? expRows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
  const netCmpProfit = withCmp ? cmpRevNet - cmpExpNet : null;

  const expGroups = new Map();
  expRows.forEach(r => {
    const k = r.parentCode || r.code.substring(0,2);
    if (!expGroups.has(k)) expGroups.set(k, { label: r.parentName || k, rows: [] });
    expGroups.get(k).rows.push(r);
  });
  const sortedGrps = [...expGroups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));

  function fmtN(n) { return (+n||0).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function fmtNet(n,isRev) {
    if (isRev) return n >= 0 ? `<span style="color:#1a8a3a">${fmtN(n)}</span>` : `<span style="color:#cc3333">(${fmtN(-n)})</span>`;
    return fmtN(n);
  }
  function pctHtml(cur, cmpV) {
    if (!withCmp) return '';
    if (cmpV === null || cmpV === undefined) return '<td class="num" style="color:#aaa">—</td>';
    if (Math.abs(cmpV) < 0.01) return `<td class="num" style="color:#6a9ab0">${cur===0?'—':'جديد'}</td>`;
    const p = (cur - cmpV) / Math.abs(cmpV) * 100;
    return `<td class="num" style="color:${p>=0?'#1a7a3a':'#cc3333'}">${p>=0?'▲':'▼'}&nbsp;${Math.abs(p).toFixed(1)}%</td>`;
  }
  const C = withCmp ? 7 : 5;

  function rowsHtml(arr, indent, isRev) {
    return arr.map(r => {
      const cmpV = withCmp ? (cmpMap.get(r.code) ?? null) : null;
      const cmpCell = withCmp ? `<td class="num" style="color:${cmpV!==null?(cmpV>=0?'#1a7a3a':'#cc3333'):'#aaa'}">${cmpV!==null?fmtN(cmpV):'—'}</td>${pctHtml(r.net,cmpV)}` : '';
      return `<tr>
        <td style="font-family:monospace;color:#555;font-size:.78rem;padding-right:${indent}px">${r.code}</td>
        <td>${r.name}</td>
        <td class="num">${r.pDebit ? fmtN(r.pDebit) : '—'}</td>
        <td class="num">${r.pCredit ? fmtN(r.pCredit) : '—'}</td>
        <td class="num">${fmtNet(r.net, isRev)}</td>
        ${cmpCell}
      </tr>`;
    }).join('');
  }

  let bodyHtml = '';
  if (revRows.length > 0) {
    const rDr = revRows.reduce((s,r)=>s+r.pDebit,0);
    const rCr = revRows.reduce((s,r)=>s+r.pCredit,0);
    const cmpSubtotalCells = withCmp
      ? `<td class="num" style="color:${cmpRevNet>=0?'#1a7a3a':'#cc3333'}">${fmtN(cmpRevNet)}</td>${pctHtml(totalRevNet,cmpRevNet)}`
      : '';
    bodyHtml += `
      <tr class="sec-hdr rev"><td colspan="${C}">الإيرادات</td></tr>
      ${rowsHtml(revRows, 20, true)}
      <tr class="subtotal">
        <td colspan="2" class="lbl">إجمالي الإيرادات</td>
        <td class="num">${fmtN(rDr)}</td><td class="num">${fmtN(rCr)}</td>
        <td class="num" style="color:${totalRevNet>=0?'#1a8a3a':'#cc3333'}">${totalRevNet>=0?fmtN(totalRevNet):'('+fmtN(-totalRevNet)+')'}</td>
        ${cmpSubtotalCells}
      </tr>`;
  }
  if (expRows.length > 0) {
    bodyHtml += `<tr class="sec-hdr exp"><td colspan="${C}">المصروفات</td></tr>`;
    const multi = sortedGrps.length > 1;
    sortedGrps.forEach(([,grp]) => {
      const gDr  = grp.rows.reduce((s,r)=>s+r.pDebit,0);
      const gCr  = grp.rows.reduce((s,r)=>s+r.pCredit,0);
      const gNet = grp.rows.reduce((s,r)=>s+r.net,0);
      const gCmp = withCmp ? grp.rows.reduce((s,r)=>s+(cmpMap.get(r.code)??0),0) : null;
      if (multi) bodyHtml += `<tr class="grp-hdr"><td colspan="${C}">${grp.label}</td></tr>`;
      bodyHtml += rowsHtml(grp.rows, multi ? 32 : 20, false);
      if (multi) {
        const cmpGrpCells = withCmp ? `<td class="num" style="color:#666">${fmtN(gCmp)}</td>${pctHtml(gNet,gCmp)}` : '';
        bodyHtml += `<tr class="grp-subtotal"><td colspan="2" class="lbl">إجمالي ${grp.label}</td><td class="num">${fmtN(gDr)}</td><td class="num">${fmtN(gCr)}</td><td class="num">${fmtN(gNet)}</td>${cmpGrpCells}</tr>`;
      }
    });
    const eDr = expRows.reduce((s,r)=>s+r.pDebit,0);
    const eCr = expRows.reduce((s,r)=>s+r.pCredit,0);
    const cmpExpCells = withCmp ? `<td class="num" style="color:#666">${fmtN(cmpExpNet)}</td>${pctHtml(totalExpNet,cmpExpNet)}` : '';
    bodyHtml += `<tr class="subtotal"><td colspan="2" class="lbl">إجمالي المصروفات</td><td class="num">${fmtN(eDr)}</td><td class="num">${fmtN(eCr)}</td><td class="num">${fmtN(totalExpNet)}</td>${cmpExpCells}</tr>`;
  }

  const grandDr = revRows.reduce((s,r)=>s+r.pDebit,0)+expRows.reduce((s,r)=>s+r.pDebit,0);
  const grandCr = revRows.reduce((s,r)=>s+r.pCredit,0)+expRows.reduce((s,r)=>s+r.pCredit,0);
  const cmpFootCells = withCmp
    ? `<td class="num" style="background:#f0f4ff;font-weight:800;font-size:1rem;color:${netCmpProfit>=0?'#1a5a2a':'#7a1a1a'}">${netCmpProfit>=0?fmtN(netCmpProfit):'('+fmtN(-netCmpProfit)+')'}</td>${pctHtml(netProfit,netCmpProfit)}`
    : '';
  const cmpColsHdr = withCmp ? `<th class="num" style="background:#2a4a7a;min-width:120px">صافي المقارنة<br><small style="font-weight:400;font-size:.72rem">${prevFromYM}–${prevToYM}</small></th><th class="num" style="background:#2a4a7a;min-width:80px">التغيير%</th>` : '';

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<title>قائمة الدخل الشامل — ${db}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:13px;color:#1a2a3a;direction:rtl;background:#f8f9fa;padding:20px}
.cover{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:20px 28px;margin-bottom:18px}
.cover h1{font-size:1.2rem;color:#1a3a5a;margin-bottom:4px}
.cover .meta{font-size:.82rem;color:#555;line-height:1.9}
.cover .meta strong{color:#1a3a5a}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dee2e6;border-radius:6px;overflow:hidden}
th{background:#1a3a5a;color:#fff;padding:9px 12px;text-align:right;font-weight:600;font-size:.82rem}
td{padding:7px 12px;border-bottom:1px solid #f0f2f4;font-size:.82rem;color:#2a3a4a}
.num{text-align:left;font-variant-numeric:tabular-nums;font-family:monospace}
.sec-hdr td{font-weight:800;font-size:.86rem;padding:8px 12px;letter-spacing:.3px}
.sec-hdr.rev td{background:#e6f9ee;color:#1a5a2a;border-right:4px solid #2ab070}
.sec-hdr.exp td{background:#fdf0e8;color:#7a2a10;border-right:4px solid #c05020}
.grp-hdr td{background:#faf5f0;color:#7a4a20;font-weight:600;font-size:.8rem;padding:5px 12px 5px 12px;padding-right:24px;border-right:3px solid #d08050}
.subtotal td{background:#f0f5ff;font-weight:700;border-top:1px solid #bcd;border-bottom:2px solid #bcd}
.grp-subtotal td{background:#fdf5ee;font-weight:600;border-top:1px dashed #dca}
.subtotal .lbl{text-align:right}
.net-banner{margin-top:16px;padding:12px 18px;border-radius:6px;font-weight:700;font-size:1rem;text-align:center}
.net-profit{background:#e6f9ee;border:1px solid #2ab070;color:#1a5a2a}
.net-loss{background:#fde8e8;border:1px solid #b04040;color:#7a1a1a}
.foot{margin-top:14px;font-size:.73rem;color:#888;text-align:center}
@media print{body{padding:10px;background:#fff}.cover{border:none;padding:10px 0}.foot{display:none}}
</style></head>
<body>
<div class="cover">
  <h1>قائمة الدخل الشامل${withCmp?' — مع فترة المقارنة':''}</h1>
  <div class="meta">
    <strong>الشركة:</strong> ${esc(db)}<br>
    <strong>الفترة الحالية:</strong> من ${fromYM} إلى ${toYM}<br>
    ${withCmp ? `<strong>فترة المقارنة:</strong> من ${prevFromYM} إلى ${prevToYM}<br>` : ''}
    <strong>مستوى التفصيل:</strong> ${esc(lvlTxt)}<br>
    <strong>الفرع:</strong> ${esc(brTxt)}<br>
    <strong>تاريخ الإصدار:</strong> ${new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'})}
  </div>
</div>
<table>
<thead>
  <tr>
    <th style="min-width:110px">كود الحساب</th>
    <th style="min-width:200px">البيان</th>
    <th class="num" style="min-width:110px">مدين الفترة</th>
    <th class="num" style="min-width:110px">دائن الفترة</th>
    <th class="num" style="min-width:120px">الصافي (ر.س)</th>
    ${cmpColsHdr}
  </tr>
</thead>
<tbody>
${bodyHtml}
</tbody>
<tfoot>
  <tr style="border-top:2px solid #1a3a5a">
    <td colspan="2" style="font-weight:900;font-size:.98rem;text-align:right;padding:10px 12px;background:#f0f4ff;color:${isProfit?'#1a5a2a':'#7a1a1a'}">${isProfit?'صافي الربح للفترة':'صافي الخسارة للفترة'}</td>
    <td class="num" style="background:#f0f4ff;font-weight:700">${fmtN(grandDr)}</td>
    <td class="num" style="background:#f0f4ff;font-weight:700">${fmtN(grandCr)}</td>
    <td class="num" style="background:#f0f4ff;font-weight:900;font-size:1.02rem;color:${isProfit?'#1a5a2a':'#7a1a1a'}">${isProfit?fmtN(netProfit):'('+fmtN(-netProfit)+')'}</td>
    ${cmpFootCells}
  </tr>
</tfoot>
</table>
<div class="net-banner ${isProfit?'net-profit':'net-loss'}">
  الفترة الحالية — ${isProfit?'صافي الربح':'صافي الخسارة'}: ${isProfit?fmtN(netProfit):'('+fmtN(-netProfit)+')'} ر.س
  ${withCmp && netCmpProfit!==null ? `&nbsp;&nbsp;|&nbsp;&nbsp; فترة المقارنة: ${netCmpProfit>=0?fmtN(netCmpProfit):'('+fmtN(-netCmpProfit)+')'} ر.س` : ''}
</div>
<div class="foot">تم إنشاء هذا التقرير وفق معايير المحاسبة السعودية للشركات الصغيرة والمتوسطة (IFRS for SMEs — SOCPA) — ${new Date().toLocaleString('ar-SA')}</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `قائمة_الدخل_${fromYM}_${toYM}${withCmp?'_مقارنة':''}.html`;
  a.click(); URL.revokeObjectURL(url);
}
