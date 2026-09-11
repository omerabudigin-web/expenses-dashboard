// ── تاب تحليل المصروفات — شجري بالمستويات + الفروع + التاريخ ───────────────────
// يعيد استخدام GET /api/trial-balance?rootCode=4 (نفس استعلام ميزان المراجعة،
// مُصفّى على فرع "المصروفات والتكاليف" فقط) + State.monthly/branches الجاهزة
// أصلاً لقاعدة البيانات النشطة — بدون أي طلب خلفي جديد.

let _eaData      = null;   // نتيجة الفترة الحالية (rootCode=4)، بعد استبعاد تكلفة البضاعة المباعة وفصل التكاليف التمويلية
let _eaCmpData   = null;   // نتيجة فترة المقارنة، بعد نفس الاستبعاد/الفصل
let _eaCogsNode  = null;   // مجموعة تكلفة البضاعة المباعة (4010101%) — منفصلة عن المصروفات
let _eaCogsCmpNode = null; // نفس المجموعة لفترة المقارنة
let _eaFinNode   = null;   // تكاليف تمويلية (حساب 4020118003 فقط) — فصل عرض لا فصل شجرة حسابات
let _eaFinCmpNode = null;  // نفس المجموعة لفترة المقارنة
let _eaInited    = false;
let _eaExpanded  = new Set();
let _eaAutoTimer = null;
let _eaCountdown = 0;
const EA_REFRESH_SEC = 60;
const EA_CHARTS = {}; // canvas-id → Chart instance

// ── الموازنة (فرع → حساب) — data/budgets.json عبر /api/expense-budgets ─────────
// نظام منفصل تماماً عن tab-budget-actual.js (ذاك بالفئات التسع على مستوى الشركة
// ككل)؛ هنا الموازنة بمستوى فرع×حساب لتغذية جدول الفعلي/الموازنة في هذا التاب فقط.
const EA_FIN_CODE = '4020118003'; // مصروفات فوائد بنكية — الحساب الوحيد المطابق لـ"تمويلي" في الدليلين
let _eaBudgets   = null;   // { source, generatedAt, branches: { [branchId]: { [code]: {name, amount} } } }
let _eaDeriving  = false;

function _eaIsActive() { return !!document.querySelector('.tab.active[data-tab="expense-analysis"]'); }
function _eaStopAuto()  { if (_eaAutoTimer) { clearInterval(_eaAutoTimer); _eaAutoTimer = null; } }
function _eaStartAuto() {
  _eaStopAuto();
  _eaCountdown = EA_REFRESH_SEC;
  _eaAutoTimer = setInterval(() => {
    if (!_eaIsActive()) { _eaStopAuto(); return; }
    _eaCountdown--;
    const el = document.getElementById('ea-status');
    if (_eaCountdown > 0) {
      if (el && _eaData) {
        el.textContent = `✅ ${_eaData.length} حساب | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_eaCountdown}ث`;
        el.style.color = '#1a7a3c';
      }
    } else {
      _eaCountdown = EA_REFRESH_SEC;
      fetchExpenseAnalysis();
    }
  }, 1000);
}

function _eaLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${ym}-${String(d.getDate()).padStart(2, '0')}`;
}
function _eaDestroyChart(id) { if (EA_CHARTS[id]) { EA_CHARTS[id].destroy(); delete EA_CHARTS[id]; } }

// ── Init ──────────────────────────────────────────────────────────────────────
function initExpenseAnalysis() {
  if (_eaInited) return;
  _eaInited = true;
  _eaInjectCSS();

  const DATA_START_YM = '2025-10';
  const now   = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  function _eaApplyQuick(val) {
    const from = document.getElementById('ea-from');
    const to   = document.getElementById('ea-to');
    if (val === '2025')      { from.value = DATA_START_YM; to.value = '2025-12'; }
    else if (val === '2026-ytd') { from.value = '2026-01'; to.value = curYM; }
    else if (val === 'all')  { from.value = DATA_START_YM; to.value = curYM; }
  }

  const quickSel = document.getElementById('ea-quick');
  if (quickSel) {
    quickSel.addEventListener('change', () => _eaApplyQuick(quickSel.value));
    _eaApplyQuick(quickSel.value);
    ['ea-from', 'ea-to'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => { quickSel.value = ''; });
    });
  }

  document.getElementById('ea-run').addEventListener('click', fetchExpenseAnalysis);
  document.getElementById('ea-tbody').addEventListener('click', e => {
    const row = e.target.closest('tr[data-toggle-id]');
    if (!row) return;
    const id = +row.dataset.toggleId;
    if (_eaExpanded.has(id)) _eaExpanded.delete(id);
    else _eaExpanded.add(id);
    _eaRenderTree();
  });
  document.getElementById('ea-level').addEventListener('change', () => {
    if (_eaData) { _eaExpanded = _eaDefaultExpand(_eaData); _eaRenderTree(); }
  });
  document.getElementById('ea-search').addEventListener('input', _eaRenderTree);
  const cmpCb = document.getElementById('ea-compare');
  if (cmpCb) cmpCb.addEventListener('change', () => { _eaCmpData = null; if (_eaData) fetchExpenseAnalysis(); });

  document.getElementById('ea-export-excel').addEventListener('click', () => {
    const btn = document.getElementById('ea-export-excel');
    btn.disabled = true; btn.textContent = '⏳ جاري التصدير…';
    exportEAExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { btn.disabled = false; btn.textContent = '📊 Excel'; });
  });
  document.getElementById('ea-export-html').addEventListener('click', exportEAHTML);
  document.getElementById('ea-export-csv').addEventListener('click',  exportEACSV);
  document.getElementById('ea-print').addEventListener('click', () => window.print());
  document.getElementById('ea-derive-budget').addEventListener('click', deriveEABudget);
  const cmpCb2 = document.getElementById('ea-compare');
  if (cmpCb2) cmpCb2.addEventListener('change', _eaRenderYtdNote);
  ['ea-from', 'ea-to'].forEach(id => document.getElementById(id).addEventListener('change', _eaRenderYtdNote));

  // تبديل قاعدة البيانات من المحدد العلوي — إعادة تحميل تلقائية للفترة الحالية
  State.on('activeDb', () => {
    _eaPopulateBranches();
    _eaLoadBudgets();
    if (_eaData) fetchExpenseAnalysis();
  });
  _eaLoadBudgets();
}

// ── الموازنة: تحميل/اشتقاق ──────────────────────────────────────────────────────
async function _eaLoadBudgets() {
  const db = State.get('activeDb');
  if (!db) { _eaBudgets = null; return; }
  try {
    _eaBudgets = await fetch(`/api/expense-budgets?db=${encodeURIComponent(db)}`).then(r => r.json());
  } catch (e) {
    _eaBudgets = { source: null, generatedAt: null, branches: {} };
  }
  if (_eaData) _eaRenderBudgetTable();
}

// آخر 6 أشهر مكتملة فعلياً (تستبعد الشهر الجاري غير المنتهي) — تُحسب من تاريخ اليوم
// الفعلي وقت الضغط على الزر، وليست مثبّتة على أي تاريخ.
function _eaLastNCompleteMonths(n) {
  const now = new Date();
  const endY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const endM = now.getMonth() === 0 ? 12 : now.getMonth(); // الشهر الماضي (1-12)، الشهر الجاري غير مكتمل
  const startTotal = endY * 12 + (endM - 1) - (n - 1);
  const startY = Math.floor(startTotal / 12);
  const startM = (startTotal % 12) + 1;
  const from = `${startY}-${String(startM).padStart(2,'0')}-01`;
  const to   = _eaLastDay(`${endY}-${String(endM).padStart(2,'0')}`);
  return { from, to, months: n };
}

async function deriveEABudget() {
  if (_eaDeriving) return;
  _eaDeriving = true;
  const db  = State.get('activeDb');
  const btn = document.getElementById('ea-derive-budget');
  const statusEl = document.getElementById('ea-budget-status');
  btn.disabled = true; btn.textContent = '⏳ جارٍ الاشتقاق…';
  const MIN_MONTHS = 3;
  try {
    const { from, to, months: windowMonths } = _eaLastNCompleteMonths(6);
    const rows = await fetch(`/api/trial-balance?db=${encodeURIComponent(db)}&mode=ledger&from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); }));

    // القسمة على عدد الأشهر التي تحتوي بيانات فعلية داخل نافذة الـ6 أشهر —
    // وليس على 6 ثابتة — لأن قاعدة حديثة (عمرها أقل من 6 أشهر) تُنتج متوسطاً
    // مضلِّلاً لو قُسِّم على أشهر لم تكن موجودة أصلاً فيها.
    const monthsWithData = new Set(rows.map(r => r.ym)).size;

    if (monthsWithData < MIN_MONTHS) {
      statusEl.textContent = `⚠️ تاريخ غير كافٍ لاشتقاق موازنة — ${monthsWithData} شهر متاح فقط (الحد الأدنى ${MIN_MONTHS} أشهر). لم تُحفَظ أي موازنة تلقائية.`;
      statusEl.style.color = '#e0b030';
      return;
    }

    const branches = {};
    rows.forEach(r => {
      const br = String(r.branch || 0);
      if (!branches[br]) branches[br] = {};
      if (!branches[br][r.code]) branches[br][r.code] = { name: r.name, amount: 0 };
      branches[br][r.code].amount += r.net;
    });
    Object.values(branches).forEach(accs => {
      Object.values(accs).forEach(a => { a.amount = Math.max(0, +(a.amount / monthsWithData).toFixed(2)); });
    });

    const generatedAt = new Date().toISOString();
    const saved = await fetch(`/api/expense-budgets?db=${encodeURIComponent(db)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'auto_avg_6m', generatedAt, branches }),
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); }));

    _eaBudgets = saved;
    statusEl.textContent = monthsWithData < windowMonths
      ? `✅ اشتُقّت الموازنة من متوسط ${from} إلى ${to} (${monthsWithData} من ${windowMonths} أشهر النافذة تحتوي بيانات فعلية) — ${new Date(generatedAt).toLocaleString('ar-SA')}`
      : `✅ اشتُقّت الموازنة من متوسط ${from} إلى ${to} (${monthsWithData} أشهر مكتملة) — ${new Date(generatedAt).toLocaleString('ar-SA')}`;
    statusEl.style.color = '#4ada8e';
    if (_eaData) _eaRenderBudgetTable();
  } catch (e) {
    statusEl.textContent = `فشل الاشتقاق: ${e.message}`;
    statusEl.style.color = '#da6a6a';
  } finally {
    _eaDeriving = false;
    btn.disabled = false; btn.textContent = '🔄 إعادة اشتقاق من المتوسط';
  }
}

function _eaRenderYtdNote() {
  const el = document.getElementById('ea-ytd-note');
  if (!el) return;
  const to = document.getElementById('ea-to').value;
  const cmp = document.getElementById('ea-compare')?.checked;
  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (cmp && to === curYM) {
    el.textContent = `⚠️ الشهر الحالي (${to}) غير مكتمل بعد — مقارنته بنفس الشهر من العام الماضي (المكتمل بالكامل) قد تُظهر انحرافاً مضلِّلاً لصالح "توفير" وهمي. المقارنة تُجري نفس الأشهر تماماً في السنتين (${to.replace(to.slice(0,4), String(+to.slice(0,4)-1))} إلى ${to}) وليست YTD بأشهر مختلفة العدد.`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function _eaPopulateBranches() {
  const db = State.get('activeDb');
  const sel = document.getElementById('ea-branch');
  if (!sel || !db) return;
  const prev = sel.value;
  try {
    const list = await fetch(`/api/branches?db=${encodeURIComponent(db)}`).then(r => r.json());
    while (sel.options.length > 0) sel.remove(0);
    const all = document.createElement('option'); all.value = 'ALL'; all.textContent = 'جميع الفروع'; sel.appendChild(all);
    list.filter(b => b.id !== 0).forEach(b => {
      const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; sel.appendChild(o);
    });
    const unassigned = document.createElement('option'); unassigned.value = '0'; unassigned.textContent = 'غير محدد / بدون فرع'; sel.appendChild(unassigned);
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    else sel.value = 'ALL';
  } catch (e) { /* keep existing options */ }
}

// ── Tree helpers (جذر واحد فقط: قسم المصروفات) ─────────────────────────────────
function _eaDefaultExpand(data) {
  const lvl = parseInt((document.getElementById('ea-level') || {}).value, 10) || 2;
  const set = new Set();
  data.forEach(r => { if (r.levelNo < lvl) set.add(r.id); });
  return set;
}
function _eaRootNode(data) {
  if (!data || !data.length) return null;
  const ids = new Set(data.map(r => r.id));
  return data.find(r => !r.parentID || !ids.has(r.parentID)) || null;
}
function _eaBuildChildIndex(data) {
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

// ── فصل تكلفة البضاعة المباعة عن المصروفات ──────────────────────────────────────
// نفس قاعدة 4010101% المعتمدة في server/queries/pl.js (مطبَّقة هناك مباشرة على
// الترحيلات، لا على تسلسل الشجرة). مهم: التسلسل الهرمي في دليل الحسابات يضع
// "المصروفات البيعية والتسويقية" (40102) و"مصروفات المشتريات" (40103) — وهي
// مصروفات تشغيلية حقيقية — كأبناء هيكليين لنفس مجموعة "4010101"! لذلك لا يصح
// استبعاد الشجرة الفرعية بأكملها بدلالة الأب/الابن؛ الصحيح هو استبعاد الأوراق
// (بدون أبناء) التي **كودها هي نفسها** تبدأ بـ 4010101 فقط (مطابقة pl.js تمامًا)،
// ثم طرح مجموعها من كل الأسلاف الفعليين لتلك الأوراق تحديدًا — مع الإبقاء على
// 40102/40103 وأبنائهما كمصروفات كاملة في الشجرة.
function _eaSplitCogs(data) {
  if (!data || !data.length) return { treeData: data, cogsNode: null };
  const childrenOf = _eaBuildChildIndex(data);
  const hasKids = id => (childrenOf.get(id) || []).length > 0;

  const cogsLeaves = data.filter(r => r.code.startsWith('4010101') && !hasKids(r.id));
  if (!cogsLeaves.length) return { treeData: data, cogsNode: null };

  const cogsIds = new Set(cogsLeaves.map(r => r.id));
  const sum = key => cogsLeaves.reduce((s, r) => s + (r[key] || 0), 0);
  const cogsAgg = { openBal: sum('openBal'), pDebit: sum('pDebit'), pCredit: sum('pCredit'), closeBal: sum('closeBal') };

  const byId = new Map(data.map(r => [r.id, r]));
  const ancestorIds = new Set();
  cogsLeaves.forEach(leaf => {
    let cur = leaf;
    while (cur && cur.parentID && byId.has(cur.parentID)) {
      ancestorIds.add(cur.parentID);
      cur = byId.get(cur.parentID);
    }
  });

  const treeData = data
    .filter(r => !cogsIds.has(r.id))
    .map(r => !ancestorIds.has(r.id) ? r : {
      ...r,
      openBal:  r.openBal  - cogsAgg.openBal,
      pDebit:   r.pDebit   - cogsAgg.pDebit,
      pCredit:  r.pCredit  - cogsAgg.pCredit,
      closeBal: r.closeBal - cogsAgg.closeBal,
    });

  const cogsNode = { id: -1, code: '4010101', name: 'تكلفة البضاعة المباعة', ...cogsAgg };
  return { treeData, cogsNode };
}

// ── فصل التكاليف التمويلية عن الإدارية والعمومية (عرض فقط) ──────────────────────
// حساب "مصروفات فوائد بنكية" (4020118003) مصنَّف في دليل الحسابات نفسه تحت
// "فوائد و رسوم بنكية" ضمن الإدارية والعمومية — وهذا صحيح محاسبياً في الدليل ولا
// نغيّره هناك إطلاقاً. هذا الفصل طبقة عرض بحتة في هذا التاب فقط: نُخرج هذا الحساب
// تحديداً (وليس كل مجموعة "فوائد ورسوم بنكية" — رسوم الضمانات والحوالات ونقاط
// البيع تبقى إدارية) ونطرحه من أسلافه الفعليين، ليظهر كبند "تكاليف تمويلية"
// منفصل في الملخص. لا يوجد حساب آخر بنفس الطابع التمويلي في الدليلين (تحقّقنا
// بالبحث عن "تمويل/قرض" ضمن حسابات 4% — لا نتائج غير هذا الحساب).
// يطابق الحساب المعروف (4020118003) أو أي حساب آخر تحت بادئة 402 اسمه يحوي
// كلمات تمويل واضحة (فوائد/تمويل/مرابحة/تورق) — تحقّقنا عبر MCP أنه في MekSoftDb1
// وMekSoftDb2 كليهما لا يوجد اليوم إلا هذا الحساب الواحد، لكن الفحص بالاسم يبقيه
// صحيحاً تلقائياً لو أُضيف حساب تمويل جديد للدليل لاحقاً.
const EA_FIN_NAME_RE = /فوائد|تمويل|مرابحة|تورق/;
function _eaSplitFinance(data) {
  if (!data || !data.length) return { treeData: data, finNode: null };
  const childrenOf = _eaBuildChildIndex(data);
  const hasKids = id => (childrenOf.get(id) || []).length > 0;

  const finLeaves = data.filter(r => !hasKids(r.id) && r.code.startsWith('402') &&
    (r.code === EA_FIN_CODE || EA_FIN_NAME_RE.test(r.name)));
  if (!finLeaves.length) return { treeData: data, finNode: null };

  const finIds = new Set(finLeaves.map(r => r.id));
  const sum = key => finLeaves.reduce((s, r) => s + (r[key] || 0), 0);
  const finAgg = { openBal: sum('openBal'), pDebit: sum('pDebit'), pCredit: sum('pCredit'), closeBal: sum('closeBal') };

  const byId = new Map(data.map(r => [r.id, r]));
  const ancestorIds = new Set();
  finLeaves.forEach(leaf => {
    let cur = leaf;
    while (cur && cur.parentID && byId.has(cur.parentID)) {
      ancestorIds.add(cur.parentID);
      cur = byId.get(cur.parentID);
    }
  });

  const treeData = data
    .filter(r => !finIds.has(r.id))
    .map(r => !ancestorIds.has(r.id) ? r : {
      ...r,
      openBal:  r.openBal  - finAgg.openBal,
      pDebit:   r.pDebit   - finAgg.pDebit,
      pCredit:  r.pCredit  - finAgg.pCredit,
      closeBal: r.closeBal - finAgg.closeBal,
    });

  const finNode = {
    id: -2, code: EA_FIN_CODE,
    name: 'تكاليف تمويلية' + (finLeaves.length > 1 ? ` (${finLeaves.length} حسابات)` : ' (فوائد بنكية)'),
    ...finAgg,
  };
  return { treeData, finNode };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchExpenseAnalysis() {
  const from  = document.getElementById('ea-from').value;
  const to    = document.getElementById('ea-to').value;
  const brVal = document.getElementById('ea-branch').value;
  const branch = brVal === 'ALL' ? 0 : (+brVal || 0);

  if (!from || !to) {
    document.getElementById('ea-status').textContent = 'حدد الفترة أولاً';
    return;
  }

  const fromDate = `${from}-01`;
  const toDate   = _eaLastDay(to);
  const db       = State.get('activeDb') || '';
  const qs       = new URLSearchParams({ db, from: fromDate, to: toDate, branch, rootCode: '4' });

  const prevFrom = `${+from.substring(0,4)-1}${from.substring(4)}-01`;
  const prevToYM = `${+to.substring(0,4)-1}${to.substring(4)}`;
  const prevTo   = _eaLastDay(prevToYM);
  const cmpQs    = new URLSearchParams({ db, from: prevFrom, to: prevTo, branch, rootCode: '4' });
  const wantCmp  = !!(document.getElementById('ea-compare')?.checked);

  const loadEl   = document.getElementById('ea-loading');
  const statusEl = document.getElementById('ea-status');
  loadEl.classList.remove('hidden');
  statusEl.textContent = 'جارٍ التحميل…';
  document.getElementById('ea-tbody').innerHTML = '';

  try {
    const [resp, cmpRows] = await Promise.all([
      fetch(`/api/trial-balance?${qs}`).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); })),
      wantCmp
        ? fetch(`/api/trial-balance?${cmpQs}`).then(r => r.ok ? r.json() : Promise.resolve(null))
        : Promise.resolve(null),
    ]);
    const cogsSplit    = _eaSplitCogs(resp);
    const cogsCmpSplit = cmpRows ? _eaSplitCogs(cmpRows) : { treeData: null, cogsNode: null };
    const finSplit      = _eaSplitFinance(cogsSplit.treeData);
    const finCmpSplit   = cogsCmpSplit.treeData ? _eaSplitFinance(cogsCmpSplit.treeData) : { treeData: null, finNode: null };
    _eaData        = finSplit.treeData;
    _eaCogsNode    = cogsSplit.cogsNode;
    _eaFinNode     = finSplit.finNode;
    _eaCmpData     = finCmpSplit.treeData;
    _eaCogsCmpNode = cogsCmpSplit.cogsNode;
    _eaFinCmpNode  = finCmpSplit.finNode;
    _eaExpanded = _eaDefaultExpand(_eaData);
    statusEl.textContent = `${_eaData.length} حساب${cmpRows ? ' + مقارنة' : ''} (تكلفة البضاعة المباعة والتكاليف التمويلية منفصلة)`;
    _eaRenderAll();
    _eaRenderYtdNote();
    _eaStartAuto();
  } catch (e) {
    _eaData = null;
    document.getElementById('ea-tbody').innerHTML =
      `<tr><td colspan="5" style="text-align:center;padding:32px;color:#da4a4a">خطأ: ${esc(e.message)}</td></tr>`;
    statusEl.textContent = 'فشل التحميل';
  } finally {
    loadEl.classList.add('hidden');
  }
}

function _eaRenderAll() {
  _eaRenderKPIs();
  _eaRenderTree();
  _eaRenderCharts();
  _eaRenderBudgetTable();
}

// ── Entry point ───────────────────────────────────────────────────────────────
function renderExpenseAnalysisTab() {
  initExpenseAnalysis();
  _eaPopulateBranches();
  if (_eaData) {
    _eaRenderAll();
    _eaStartAuto();
  } else {
    fetchExpenseAnalysis();
  }
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function _eaMonthCount(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

function _eaRenderKPIs() {
  const el = document.getElementById('ea-kpis');
  if (!el || !_eaData || !_eaData.length) return;

  const root      = _eaRootNode(_eaData);
  const childOf   = _eaBuildChildIndex(_eaData);
  const from      = document.getElementById('ea-from').value;
  const to        = document.getElementById('ea-to').value;
  const nMonths   = _eaMonthCount(from, to);

  // تشغيلية/إدارية−تمويل — من بادئة الكود (401=تشغيلية، 402=إدارية وعمومية)،
  // وليس عمود Category (تحقّقنا مباشرة على MekSoftDb1/2: القيمة 102 "تشغيلية"
  // شبه غير مأهولة على الحسابات الفعلية). تحقّقنا كذلك أن كل حسابات المصروفات
  // في الدليلين تقع حصراً تحت بادئة 401 أو 402 (لا بادئة ثالثة) فالتقسيم MECE.
  // كل قيمة = صافي حركة الفترة المختارة فقط (pDebit-pCredit)، وليس closeBal —
  // closeBal يضم الرصيد الافتتاحي قبل "من" فيُظهر أرقاماً أكبر بكثير مما جرى
  // فعلاً ضمن الفترة المعروضة. لهذا السبب "إجمالي المصروفات" و"المتوسط الشهري"
  // أدناه أصبحا أيضاً صافي حركة الفترة (وليس closeBal التراكمي كما كانا)، وكذلك
  // "أكبر بند رئيسي" و"التغير عن الفترة السابقة" اللذان يعتمدان على نفس القيمة
  // — تغييرهما ضروري تجنّباً لخلط قاعدتين مختلفتين (تراكمي مقابل صافي فترة) في
  // نفس شريط المؤشرات. عمود "رصيد آخر الفترة" في جدول الشجرة أسفله لم يُمَس —
  // ذاك عرض "ميزان مراجعة" تقليدي حيث closeBal التراكمي هو المعنى الصحيح فعلاً.
  const leaves = _eaData.filter(r => !(childOf.get(r.id) || []).length);
  const periodNet = r => r.pDebit - r.pCredit;
  const periodTotalOf = data => {
    const co = _eaBuildChildIndex(data);
    return data.filter(r => !(co.get(r.id) || []).length).reduce((s, r) => s + periodNet(r), 0);
  };
  const finVal  = _eaFinNode ? (_eaFinNode.pDebit - _eaFinNode.pCredit) : 0;
  const opVal   = leaves.filter(r => r.code.startsWith('401')).reduce((s, r) => s + periodNet(r), 0);
  const admVal  = leaves.filter(r => r.code.startsWith('402')).reduce((s, r) => s + periodNet(r), 0);
  const periodTotal = opVal + admVal + finVal; // شامل التمويل — مرجع بطاقات التقسيم الثلاث
  const pctOf = v => periodTotal > 0.004 ? fmt(v / periodTotal * 100, 1) + '%' : '—';

  const total    = opVal + admVal; // = "إجمالي المصروفات" — صافي الفترة، بدون COGS (مُستبعد أصلاً من _eaData) وبدون التمويل
  const avgMonth = total / nMonths;

  const level1 = root ? (childOf.get(root.id) || []) : [];
  const topCat = level1.slice().sort((a, b) => Math.abs(periodNet(b)) - Math.abs(periodNet(a)))[0] || null;
  const topPct = topCat && total > 0 ? Math.abs(periodNet(topCat)) / total * 100 : 0;

  let changeHtml = `<span style="color:#3a5a7a">فعّل "مقارنة" لعرضه</span>`;
  if (_eaCmpData && _eaCmpData.length) {
    const cmpTotal = periodTotalOf(_eaCmpData);
    if (Math.abs(cmpTotal) > 0.004) {
      const pct = (total - cmpTotal) / cmpTotal * 100;
      const col = pct > 0 ? '#da6a6a' : pct < 0 ? '#4ada8e' : '#7090b0';
      changeHtml = `<span style="color:${col}">${pct > 0 ? '▲' : '▼'} ${fmt(Math.abs(pct), 1)}%</span>`;
    } else {
      changeHtml = `<span style="color:#3a5a7a">لا بيانات مقارنة</span>`;
    }
  }

  const cogsVal = _eaCogsNode ? Math.abs(_eaCogsNode.closeBal) : 0;
  let cogsChangeHtml = '';
  if (_eaCogsCmpNode) {
    const cogsCmpVal = Math.abs(_eaCogsCmpNode.closeBal);
    if (cogsCmpVal > 0.004) {
      const pct = (cogsVal - cogsCmpVal) / cogsCmpVal * 100;
      const col = pct > 0 ? '#da6a6a' : pct < 0 ? '#4ada8e' : '#7090b0';
      cogsChangeHtml = ` (<span style="color:${col}">${pct > 0 ? '▲' : '▼'} ${fmt(Math.abs(pct), 1)}%</span>)`;
    }
  }

  const cards = [
    { lbl: 'إجمالي المصروفات', val: fmt(total, 0) + ' ر.س', sub: `عن ${nMonths} شهر — صافي حركة الفترة، بدون تكلفة البضاعة المباعة والتكاليف التمويلية` },
    { lbl: 'تكلفة البضاعة المباعة (COGS)', val: fmt(cogsVal, 0) + ' ر.س' + cogsChangeHtml, sub: 'منفصلة عن المصروفات — تكلفة مبيعات لا مصروف تشغيلي (لا يزال closeBal تراكمي — لم يُطلب تصحيحها)', isHtml: true },
    { lbl: 'المتوسط الشهري', val: fmt(avgMonth, 0) + ' ر.س', sub: 'إجمالي المصروفات ÷ عدد الأشهر' },
    { lbl: 'أكبر بند رئيسي', val: topCat ? esc(topCat.name) : '—', sub: topCat ? `${fmt(topPct, 1)}% من إجمالي المصروفات` : '' },
    { lbl: 'التغير عن الفترة السابقة', val: changeHtml, sub: 'نفس الأشهر، العام السابق — صافي فترة مقابل صافي فترة', isHtml: true },
    { lbl: 'عدد الحسابات النشطة', val: _eaData.length.toLocaleString('ar-SA'), sub: 'حساب له حركة في الفترة (بدون COGS)' },
    { lbl: 'مصروفات تشغيلية', val: fmt(opVal, 0) + ' ر.س', sub: `${pctOf(opVal)} من إجمالي الفترة (صافي حركة الفترة فقط) — كود 401%` },
    { lbl: 'مصروفات إدارية وعمومية (−تمويل)', val: fmt(admVal, 0) + ' ر.س', sub: `${pctOf(admVal)} من إجمالي الفترة — كود 402% بعد استبعاد التمويل` },
    { lbl: 'تكاليف تمويلية', val: fmt(finVal, 0) + ' ر.س', sub: `${pctOf(finVal)} من إجمالي الفترة — فصل عرض فقط، لم تُعدَّل شجرة الحسابات` },
    { lbl: 'إجمالي الفترة شامل التمويل', val: fmt(periodTotal, 0) + ' ر.س', sub: '= إجمالي المصروفات أعلاه + تكاليف تمويلية — مرجع نِسب البطاقات الثلاث فوق' },
  ];

  el.innerHTML = cards.map(c => `
    <div class="ea-kpi-card">
      <div class="ea-kpi-lbl">${c.lbl}</div>
      <div class="ea-kpi-val">${c.isHtml ? c.val : esc(String(c.val))}</div>
      <div class="ea-kpi-sub">${esc(c.sub)}</div>
    </div>`).join('');
}

// ── Tree render ───────────────────────────────────────────────────────────────
function _eaRenderTree() {
  if (!_eaData) return;
  const search = (document.getElementById('ea-search').value || '').trim().toLowerCase();
  const cmp     = !!(document.getElementById('ea-compare')?.checked && _eaCmpData);
  const cmpMap  = cmp ? new Map(_eaCmpData.map(r => [r.id, r.closeBal])) : null;
  const C       = cmp ? 8 : 5;

  const thead = document.querySelector('#ea-table thead');
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th style="min-width:110px">كود الحساب</th>
        <th style="min-width:220px">اسم الحساب</th>
        <th class="num" style="min-width:130px">رصيد آخر الفترة</th>
        <th class="num" style="min-width:90px">% من الإجمالي</th>
        ${cmp ? `<th class="num" style="min-width:130px;background:#08192e;color:#5a8aaa">فترة المقارنة</th>
                 <th class="num" style="min-width:80px;background:#08192e;color:#5a8aaa">التغيّر%</th>` : ''}
        <th class="num" style="min-width:110px">حركة مدينة</th>
      </tr>`;
  }

  const root       = _eaRootNode(_eaData);
  const total      = root ? Math.abs(root.closeBal) : 0;
  const byId       = new Map(_eaData.map(r => [r.id, r]));
  const childrenOf = _eaBuildChildIndex(_eaData);

  let visible = null, forceExpand = null, matchCount = _eaData.length;
  if (search) {
    const matches = _eaData.filter(r =>
      r.code.toLowerCase().includes(search) || (r.name || '').toLowerCase().includes(search));
    matchCount = matches.length;
    visible = new Set(); forceExpand = new Set();
    matches.forEach(m => {
      visible.add(m.id);
      let cur = m;
      while (cur && cur.parentID && byId.has(cur.parentID)) {
        visible.add(cur.parentID); forceExpand.add(cur.parentID);
        cur = byId.get(cur.parentID);
      }
    });
  }

  const html = [];
  function renderNode(r, depth) {
    if (visible && !visible.has(r.id)) return;
    const pct   = total > 0 ? Math.abs(r.closeBal) / total * 100 : 0;
    const kids  = childrenOf.get(r.id) || [];
    const hasKids = kids.length > 0;
    const isExpanded = hasKids && (_eaExpanded.has(r.id) || (forceExpand && forceExpand.has(r.id)));
    const indent = 8 + depth * 22;

    let cmpCells = '';
    if (cmp) {
      const prevCl = cmpMap.has(r.id) ? (cmpMap.get(r.id) || 0) : null;
      const curNet = r.closeBal || 0;
      let pctCell = `<span style="color:#3a5a7a">—</span>`;
      if (prevCl !== null && Math.abs(prevCl) > 0.004) {
        const chg = (curNet - prevCl) / Math.abs(prevCl) * 100;
        const col = chg > 0 ? '#da6a6a' : chg < 0 ? '#4ada8e' : '#7090b0';
        pctCell = `<span style="color:${col}">${chg > 0 ? '▲' : '▼'} ${fmt(Math.abs(chg), 1)}%</span>`;
      } else if (prevCl === null) {
        pctCell = `<span style="color:#3a5a7a">جديد</span>`;
      }
      cmpCells = `
        <td class="num" style="background:#06111e">${prevCl !== null ? fmt(Math.abs(prevCl), 2) : '<span style="color:#2a4060">—</span>'}</td>
        <td class="num" style="background:#06111e">${pctCell}</td>`;
    }

    const arrow = hasKids
      ? `<span class="ea-tree-arrow">${isExpanded ? '▼' : '◀'}</span>`
      : `<span class="ea-tree-arrow"></span>`;

    html.push(`<tr class="ea-row${hasKids ? ' ea-row-parent' : ''}" style="cursor:${hasKids?'pointer':'default'}" ${hasKids ? `data-toggle-id="${r.id}"` : ''}>
      <td style="font-family:monospace;font-size:.77rem;padding-right:${indent}px">
        ${arrow}<span style="color:#6a9aca">${esc(r.code)}</span>
      </td>
      <td style="${hasKids?'color:#c8e8ff;font-weight:600':''}">${esc(r.name)}</td>
      <td class="num">${fmt(Math.abs(r.closeBal), 2)}</td>
      <td class="num">${fmt(pct, 1)}%</td>
      ${cmpCells}
      <td class="num" style="color:#7a9ab0">${r.pDebit > 0.004 ? fmt(r.pDebit, 2) : '<span class="ea-zero">—</span>'}</td>
    </tr>`);

    if (hasKids && isExpanded) kids.forEach(k => renderNode(k, depth + 1));
  }
  if (root) renderNode(root, 0);

  document.getElementById('ea-tbody').innerHTML =
    html.join('') || `<tr><td colspan="${C}" style="text-align:center;padding:32px;color:#3a5a7a">لا توجد حسابات تطابق البحث</td></tr>`;
  document.getElementById('ea-count').textContent =
    `${matchCount.toLocaleString('ar-SA')} حساب${search ? ` (من أصل ${_eaData.length.toLocaleString('ar-SA')})` : ''}`;
}

// ── Charts (معرّفات canvas خاصة بالتاب — لا تعارض مع أي تاب آخر) ────────────────
function _eaRenderCharts() {
  if (!_eaData || !_eaData.length) return;
  const from = document.getElementById('ea-from').value;
  const to   = document.getElementById('ea-to').value;

  _eaRenderTrendChart(from, to);
  _eaRenderLevel1Pie();
  _eaRenderTop10Bar();
  _eaRenderBranchCharts(from, to);
  _eaRenderParetoChart();
}

// 1) الاتجاه الشهري بالفئات التسع — من State.monthly الجاهزة
function _eaRenderTrendChart(from, to) {
  _eaDestroyChart('ea-trend');
  const ctx = document.getElementById('ea-chart-trend');
  const monthly = (State.get('monthly') || []).filter(m => m.month >= from && m.month <= to);
  if (!ctx || !monthly.length) return;
  EA_CHARTS['ea-trend'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthly.map(m => m.label),
      datasets: CAT_ORDER.map(c => ({
        label: CAT_LABEL[c], data: monthly.map(m => m[c] || 0),
        backgroundColor: CAT_COLORS[c] + 'cc', borderColor: CAT_COLORS[c], borderWidth: 1,
      })),
    },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
      scales: {
        x: { stacked: true, ...AXIS_STYLE },
        y: { stacked: true, ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
      },
    },
  });
}

// 2) توزيع أقسام المصروفات (المستوى 1 الفعلي من الشجرة) — أدق من نظام الفئات التسع
function _eaRenderLevel1Pie() {
  _eaDestroyChart('ea-l1pie');
  const ctx = document.getElementById('ea-chart-l1pie');
  if (!ctx) return;
  const root = _eaRootNode(_eaData);
  const childOf = _eaBuildChildIndex(_eaData);
  const level1 = root ? (childOf.get(root.id) || []) : [];
  if (!level1.length) return;

  const sorted = level1.slice().sort((a, b) => Math.abs(b.closeBal) - Math.abs(a.closeBal));
  const TOP_N = 7;
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  const restSum = rest.reduce((s, r) => s + Math.abs(r.closeBal), 0);
  const labels = top.map(r => r.name);
  const values = top.map(r => Math.abs(r.closeBal));
  if (restSum > 0.004) { labels.push('أخرى'); values.push(restSum); }
  const colors = labels.map((_, i) => `hsl(${i * 32},55%,45%)`);

  EA_CHARTS['ea-l1pie'] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: '#0d1b2a' }] },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { position: 'right', labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
    },
  });
}

// 3) أكبر 10 حسابات تفصيلية (أوراق الشجرة فقط)
function _eaRenderTop10Bar() {
  _eaDestroyChart('ea-top10');
  const ctx = document.getElementById('ea-chart-top10');
  if (!ctx) return;
  const childOf = _eaBuildChildIndex(_eaData);
  const leaves = _eaData.filter(r => !(childOf.get(r.id) || []).length);
  const top10 = leaves.slice().sort((a, b) => Math.abs(b.closeBal) - Math.abs(a.closeBal)).slice(0, 10);
  if (!top10.length) return;

  EA_CHARTS['ea-top10'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(r => r.name.length > 28 ? r.name.slice(0, 28) + '…' : r.name),
      datasets: [{
        data: top10.map(r => Math.abs(r.closeBal)),
        backgroundColor: top10.map((_, i) => `hsl(${i * 32},55%,45%)cc`),
        borderColor: top10.map((_, i) => `hsl(${i * 32},55%,45%)`),
        borderWidth: 1,
      }],
    },
    options: {
      ...CHART_OPTS, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: tooltipLabel } } },
      scales: {
        x: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
        y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, font: { size: 9 } } },
      },
    },
  });
}

// 4) توزيع حسب الفرع — من State.branches الجاهزة (نفس منطق pivot في charts.js)
function _eaRenderBranchCharts(from, to) {
  _eaDestroyChart('ea-brbar'); _eaDestroyChart('ea-brpie');
  const ctxBar = document.getElementById('ea-chart-brbar');
  const ctxPie = document.getElementById('ea-chart-brpie');
  const monthly  = (State.get('monthly')  || []).filter(m => m.month >= from && m.month <= to);
  const branches = (State.get('branches') || []).filter(r => r.month >= from && r.month <= to);
  if (!ctxBar || !monthly.length) return;

  const months = monthly.map(m => m.month);
  const brs    = [0, 1, 2, 3, 4, 5];
  const pivot  = {};
  brs.forEach(b => { pivot[b] = {}; months.forEach(mo => { pivot[b][mo] = 0; }); });
  branches.forEach(r => { if (pivot[r.br] && months.includes(r.month)) pivot[r.br][r.month] += r.total; });
  const brTotals = brs.map(b => months.reduce((s, mo) => s + pivot[b][mo], 0));
  const hasData  = brs.filter((_, i) => brTotals[i] > 0);
  const colors   = ['#7a8a9a', '#4a9eda', '#4ada8e', '#da9a4a', '#da4ada', '#9ada4a'];

  EA_CHARTS['ea-brbar'] = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: monthly.map(m => m.label),
      datasets: hasData.map(b => ({ label: BRANCH_LABEL[b], data: months.map(mo => pivot[b][mo]), backgroundColor: colors[b] + 'cc', borderColor: colors[b], borderWidth: 1 })),
    },
    options: {
      ...CHART_OPTS,
      plugins: { legend: { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
      scales: { x: { stacked: true, ...AXIS_STYLE }, y: { stacked: true, ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } } },
    },
  });

  if (ctxPie) {
    EA_CHARTS['ea-brpie'] = new Chart(ctxPie, {
      type: 'doughnut',
      data: {
        labels: hasData.map(b => BRANCH_LABEL[b]),
        datasets: [{ data: hasData.map(b => brTotals[b]), backgroundColor: hasData.map(b => colors[b]), borderWidth: 1, borderColor: '#0d1b2a' }],
      },
      options: {
        ...CHART_OPTS,
        plugins: { legend: { position: 'right', labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipLabel } } },
      },
    });
  }
}

// 5) Pareto 80/20 — كل الأوراق تنازلياً + خط تراكمي، مع إبراز بنود الـ80%
function _eaRenderParetoChart() {
  _eaDestroyChart('ea-pareto');
  const ctx = document.getElementById('ea-chart-pareto');
  if (!ctx || !_eaData) return;
  const childOf = _eaBuildChildIndex(_eaData);
  const leaves  = _eaData.filter(r => !(childOf.get(r.id) || []).length);
  const sorted  = leaves.slice().sort((a, b) => Math.abs(b.closeBal) - Math.abs(a.closeBal));
  if (!sorted.length) return;

  const grand = sorted.reduce((s, r) => s + Math.abs(r.closeBal), 0);
  let running = 0;
  const cutoffIdx = sorted.findIndex(r => { running += Math.abs(r.closeBal); return grand > 0 && running / grand >= 0.8; });
  const n80 = cutoffIdx === -1 ? sorted.length : cutoffIdx + 1;

  running = 0;
  const cum = sorted.map(r => { running += Math.abs(r.closeBal); return grand > 0 ? running / grand * 100 : 0; });

  const el = document.getElementById('ea-pareto-note');
  if (el) el.textContent = grand > 0
    ? `${n80.toLocaleString('ar-SA')} بند من أصل ${sorted.length.toLocaleString('ar-SA')} (${fmt(n80 / sorted.length * 100, 0)}%) تُكوّن 80% من إجمالي المصروفات — مظلَّلة أدناه.`
    : '';

  EA_CHARTS['ea-pareto'] = new Chart(ctx, {
    data: {
      labels: sorted.map(r => r.name.length > 24 ? r.name.slice(0, 24) + '…' : r.name),
      datasets: [
        {
          type: 'bar', label: 'المبلغ',
          data: sorted.map(r => Math.abs(r.closeBal)),
          backgroundColor: sorted.map((_, i) => i < n80 ? '#C9A84Ccc' : '#3a5a7a88'),
          borderColor: sorted.map((_, i) => i < n80 ? '#C9A84C' : '#3a5a7a'),
          borderWidth: 1, order: 2, yAxisID: 'y',
        },
        {
          type: 'line', label: 'النسبة التراكمية %',
          data: cum, borderColor: '#5baef0', backgroundColor: '#5baef0',
          borderWidth: 2, pointRadius: 2, tension: 0.15, order: 1, yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...CHART_OPTS,
      plugins: {
        legend: { labels: { color: '#8ba0b8', font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => c.dataset.type === 'line' ? `تراكمي: ${fmt(c.raw, 1)}%` : tooltipLabel(c) } },
      },
      scales: {
        x: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, font: { size: 8 }, maxRotation: 60, minRotation: 60 } },
        y:  { ...AXIS_STYLE, position: 'left',  ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
        y1: { position: 'right', min: 0, max: 100, grid: { display: false },
              ticks: { color: '#8ba0b8', font: { size: 9 }, callback: v => v + '%' } },
      },
    },
  });
}

// ── الفعلي مقابل الموازنة ─────────────────────────────────────────────────────
// يستخدم _eaData (بعد فصل COGS والتمويل) المُصفّى مسبقاً بالفرع المختار في
// ea-branch (الفلترة تمت في الخادم عبر ?branch=). المبلغ الفعلي هنا هو صافي
// حركة الفترة فقط (pDebit-pCredit) وليس closeBal التراكمي — لمطابقة طبيعة
// الموازنة الشهرية المُشتقة. الموازنة تُقارَن مضروبة في عدد أشهر الفترة المختارة.
function _eaBudgetForCurrentSelection(code) {
  if (!_eaBudgets || !_eaBudgets.branches) return 0;
  const brVal = document.getElementById('ea-branch').value;
  if (brVal === 'ALL') {
    return Object.values(_eaBudgets.branches).reduce((s, accs) => s + ((accs[code] && accs[code].amount) || 0), 0);
  }
  const accs = _eaBudgets.branches[brVal];
  return (accs && accs[code] && accs[code].amount) || 0;
}

function _eaRenderBudgetTable() {
  const wrap = document.getElementById('ea-budget-wrap');
  if (!wrap) return;
  if (!_eaData || !_eaData.length) { wrap.innerHTML = ''; return; }

  const srcEl = document.getElementById('ea-budget-status');
  if (srcEl && !_eaDeriving) {
    srcEl.textContent = _eaBudgets && _eaBudgets.generatedAt
      ? `مصدر الموازنة الحالية: ${_eaBudgets.source === 'auto_avg_6m' ? 'متوسط آخر 6 أشهر مكتملة (تلقائي)' : 'إدخال يدوي'} — آخر تحديث ${new Date(_eaBudgets.generatedAt).toLocaleString('ar-SA')}`
      : 'لا توجد موازنة محفوظة بعد — اضغط «إعادة اشتقاق من المتوسط» لتوليد موازنة أولية من متوسط آخر 6 أشهر مكتملة.';
    srcEl.style.color = _eaBudgets && _eaBudgets.generatedAt ? '#7090b0' : '#e0a050';
  }

  const from = document.getElementById('ea-from').value;
  const to   = document.getElementById('ea-to').value;
  const nMonths = _eaMonthCount(from, to);
  const childOf = _eaBuildChildIndex(_eaData);
  const leaves = _eaData.filter(r => !(childOf.get(r.id) || []).length);

  let sumActual = 0, sumBudget = 0;
  const rows = leaves.map(r => {
    const actual = r.pDebit - r.pCredit;
    const monthlyBudget = _eaBudgetForCurrentSelection(r.code);
    const budget = monthlyBudget * nMonths;
    const hasBudget = monthlyBudget > 0;
    const variance = hasBudget ? actual - budget : 0;
    const variancePct = hasBudget && budget > 0.004 ? variance / budget * 100 : 0;
    sumActual += actual;
    if (hasBudget) sumBudget += budget;
    return { ...r, actual, budget, hasBudget, variance, variancePct };
  }).filter(r => Math.abs(r.actual) > 0.004 || r.hasBudget)
    .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual));

  const totalVariance = sumBudget > 0.004 ? (sumActual - sumBudget) / sumBudget * 100 : null;
  const totalCol = totalVariance === null ? '#7090b0' : totalVariance > 0 ? '#da6a6a' : '#4ada8e';

  const summaryHtml = `
    <div class="ea-budget-summary">
      <div><span class="ea-bs-lbl">إجمالي الفعلي</span><span class="ea-bs-val">${fmt(sumActual, 0)} ر.س</span></div>
      <div><span class="ea-bs-lbl">إجمالي الموازنة</span><span class="ea-bs-val">${sumBudget > 0.004 ? fmt(sumBudget, 0) + ' ر.س' : '—'}</span></div>
      <div><span class="ea-bs-lbl">الانحراف الكلي</span><span class="ea-bs-val" style="color:${totalCol}">${totalVariance === null ? '—' : (totalVariance > 0 ? '▲ تجاوز ' : '▼ توفير ') + fmt(Math.abs(totalVariance), 1) + '%'}</span></div>
    </div>`;

  const rowsHtml = rows.map(r => {
    const col = !r.hasBudget ? '#3a5a7a' : r.variance > 0 ? '#da6a6a' : r.variance < 0 ? '#4ada8e' : '#7090b0';
    return `<tr>
      <td style="text-align:right">${esc(r.name)}</td>
      <td class="num">${fmt(r.actual, 0)}</td>
      <td class="num">${r.hasBudget ? fmt(r.budget, 0) : '<span class="ea-nobudget">بلا موازنة</span>'}</td>
      <td class="num" style="color:${col}">${r.hasBudget ? (r.variance > 0 ? '▲' : r.variance < 0 ? '▼' : '') + ' ' + fmt(Math.abs(r.variance), 0) : '0'}</td>
      <td class="num" style="color:${col}">${r.hasBudget ? fmt(Math.abs(r.variancePct), 1) + '%' : '0%'}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    ${summaryHtml}
    <div class="ea-table-wrap">
      <table class="ea-budget-tbl">
        <thead><tr><th>البند</th><th class="num">الفعلي</th><th class="num">الموازنة</th><th class="num">الانحراف</th><th class="num">الانحراف %</th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="5" style="text-align:center;padding:20px;color:#3a5a7a">لا بيانات</td></tr>`}</tbody>
      </table>
    </div>
    <div class="ea-footnote">أخضر = توفير (فعلي أقل من الموازنة) · أحمر = تجاوز · بند بلا موازنة محفوظة يُعرض بانحراف صفري حتى تُشتق له موازنة.</div>`;
}

// ── Excel export ───────────────────────────────────────────────────────────────
async function exportEAExcel() {
  if (!_eaData || !_eaData.length) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const from    = document.getElementById('ea-from').value;
  const to      = document.getElementById('ea-to').value;
  const company = State.get('companyName') || '';
  const branchLbl = ([...document.getElementById('ea-branch').options].find(o => o.selected) || {}).textContent || 'جميع الفروع';
  const genDate = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  const root    = _eaRootNode(_eaData);
  const total   = root ? Math.abs(root.closeBal) : 0;

  const CLR = { navyDark: 'FF0A2040', navy: 'FF1A3A6A', blueXPale: 'FFDDE6F4', white: 'FFFFFFFF', textNavy: 'FF0A2040', textLight: 'FF6A8AAA' };
  const solid = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
  const ws = wb.addWorksheet('تحليل المصروفات', { views: [{ rightToLeft: true }] });
  ws.pageSetup.paperSize = 9; ws.pageSetup.orientation = 'landscape'; ws.pageSetup.fitToPage = true; ws.pageSetup.fitToWidth = 1;
  ws.columns = [{ width: 16 }, { width: 42 }, { width: 16 }, { width: 12 }, { width: 14 }];

  const spanAll = row => ws.mergeCells(row.number, 1, row.number, 5);
  function addTitle(text, sz, fc, bg) {
    const row = ws.addRow([text]); row.height = sz > 12 ? 32 : 24; spanAll(row);
    const c = row.getCell(1);
    c.font = { name: 'Calibri', size: sz, bold: true, color: { argb: fc } };
    c.fill = solid(bg); c.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  addTitle(company || 'تحليل المصروفات', 14, CLR.white, CLR.navyDark);
  addTitle('تحليل المصروفات — عرض شجري', 12, CLR.white, CLR.navy);
  addTitle(`الفترة: ${from} إلى ${to}  |  الفرع: ${branchLbl}  |  الإجمالي: ${total.toFixed(0)} ر.س`, 9.5, 'FFAACCE8', CLR.navyDark);
  addTitle(`أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
  const spacer = ws.addRow(['']); spacer.height = 5; spanAll(spacer); spacer.getCell(1).fill = solid(CLR.white);

  const hdr = ws.addRow(['كود الحساب', 'اسم الحساب', 'رصيد آخر الفترة', '% من الإجمالي', 'حركة مدينة']);
  hdr.height = 20;
  hdr.eachCell(c => { c.font = { bold: true, color: { argb: CLR.white }, size: 9.5 }; c.fill = solid(CLR.navyDark); c.alignment = { horizontal: 'center', vertical: 'middle' }; });

  const childrenOf = _eaBuildChildIndex(_eaData);
  function walk(r, depth) {
    const pct = total > 0 ? Math.abs(r.closeBal) / total * 100 : 0;
    const row = ws.addRow([r.code, r.name, +Math.abs(r.closeBal).toFixed(0), +pct.toFixed(1), +(r.pDebit || 0).toFixed(0)]);
    row.getCell(1).font = { size: 8.5, color: { argb: 'FF888888' } };
    row.getCell(2).font = { size: 9.5, bold: depth === 0, color: { argb: CLR.textNavy } };
    row.getCell(2).alignment = { horizontal: 'right', indent: 1 + depth };
    for (let ci = 3; ci <= 5; ci++) { row.getCell(ci).numFmt = '#,##0'; row.getCell(ci).alignment = { horizontal: 'left' }; }
    (childrenOf.get(r.id) || []).forEach(k => walk(k, depth + 1));
  }
  if (root) walk(root, 0);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `تحليل_المصروفات_${from}_${to}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── HTML export ───────────────────────────────────────────────────────────────
function exportEAHTML() {
  if (!_eaData || !_eaData.length) return;
  const from = document.getElementById('ea-from').value;
  const to   = document.getElementById('ea-to').value;
  const company = State.get('companyName') || 'تحليل المصروفات';
  const genDate  = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  const root  = _eaRootNode(_eaData);
  const total = root ? Math.abs(root.closeBal) : 0;
  const childrenOf = _eaBuildChildIndex(_eaData);
  let rows = '';
  function walk(r, depth) {
    const pct = total > 0 ? Math.abs(r.closeBal) / total * 100 : 0;
    rows += `<tr><td class="code" style="padding-right:${8+depth*18}px">${esc(r.code)}</td><td style="${depth===0?'font-weight:700':''}">${esc(r.name)}</td><td class="num">${fmt(Math.abs(r.closeBal),2)}</td><td class="num">${fmt(pct,1)}%</td></tr>`;
    (childrenOf.get(r.id) || []).forEach(k => walk(k, depth + 1));
  }
  if (root) walk(root, 0);

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تحليل المصروفات — ${esc(company)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Tahoma,Arial,sans-serif;direction:rtl;font-size:11pt;color:#111;background:#fff}
.page{max-width:900px;margin:0 auto;padding:20px 24px}.co-name{font-size:18pt;font-weight:700;text-align:center;color:#0a2040;margin-bottom:4px}
.title{font-size:14pt;font-weight:600;text-align:center;color:#1a4a7a}.meta{text-align:center;font-size:9pt;color:#555;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:9.5pt}th{background:#0a2040;color:#fff;padding:6px 8px}
td{padding:5px 8px;border-bottom:1px solid #dde4ec}td.code{font-family:monospace;font-size:8.5pt;color:#1a4a7a}
td.num{text-align:left;font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:#f7f9fc}
</style></head><body><div class="page">
<div class="co-name">${esc(company)}</div><div class="title">تحليل المصروفات — عرض شجري</div>
<div class="meta">الفترة: ${from} إلى ${to} | الإجمالي: ${fmt(total,2)} ر.س | أُنشئ: ${genDate}</div>
<table><thead><tr><th>الكود</th><th>الحساب</th><th>الرصيد</th><th>%</th></tr></thead><tbody>${rows}</tbody></table>
</div></body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `تحليل_المصروفات_${from}_${to}.html`; a.click();
  URL.revokeObjectURL(url);
}

// ── CSV export ───────────────────────────────────────────────────────────────
function exportEACSV() {
  if (!_eaData) return;
  const root  = _eaRootNode(_eaData);
  const total = root ? Math.abs(root.closeBal) : 0;
  const childrenOf = _eaBuildChildIndex(_eaData);
  const lines = [['المستوى', 'كود الحساب', 'اسم الحساب', 'رصيد آخر الفترة', '% من الإجمالي', 'حركة مدينة'].join(',')];
  function walk(r, depth) {
    const pct = total > 0 ? Math.abs(r.closeBal) / total * 100 : 0;
    lines.push([depth + 1, r.code, `"${'— '.repeat(depth) + (r.name || '').replace(/"/g, '""')}"`,
      Math.abs(r.closeBal).toFixed(2), pct.toFixed(1), (r.pDebit || 0).toFixed(2)].join(','));
    (childrenOf.get(r.id) || []).forEach(k => walk(k, depth + 1));
  }
  if (root) walk(root, 0);
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `تحليل_المصروفات_${document.getElementById('ea-from').value}_${document.getElementById('ea-to').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function _eaInjectCSS() {
  if (document.getElementById('ea-style')) return;
  const s = document.createElement('style'); s.id = 'ea-style';
  s.textContent = `
#tab-expense-analysis { padding:0 18px 18px; }
.ea-controls-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:14px 0; }
.ea-controls-row label { color:#5a80a0; font-size:.82rem; }
.ea-controls-row select, .ea-controls-row input {
  background:#0f2035; border:1px solid #1e3a5f; color:#c8d8e8; padding:6px 10px; border-radius:6px; font-size:.82rem;
}
.ea-btn { background:#13284a; border:1px solid #C9A84C44; color:#C9A84C; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:.82rem; }
.ea-btn:hover { background:#1d3a5c; }
.ea-search-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding-bottom:10px; }
.ea-search-row input[type=text] { flex:1; min-width:200px; }

.ea-kpi-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
.ea-kpi-card { background:#0a1828; border:1px solid #1e3a5f; border-radius:8px; padding:12px 16px; min-width:170px; flex:1; }
.ea-kpi-lbl { font-size:.72rem; color:#5a80a0; }
.ea-kpi-val { font-size:1.15rem; font-weight:700; color:#c8e8ff; margin-top:3px; }
.ea-kpi-sub { font-size:.68rem; color:#3a6080; margin-top:2px; }

.ea-charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px; }
@media(max-width:900px) { .ea-charts-grid { grid-template-columns:1fr; } }
.ea-chart-card { background:#0a1828; border:1px solid #1e3a5f; border-radius:8px; padding:14px 16px; }
.ea-chart-title { color:#8aacca; font-size:.82rem; font-weight:600; margin-bottom:8px; }
.ea-chart-wrap { position:relative; height:230px; }

.ea-table-wrap { overflow-x:auto; background:#0a1828; border:1px solid #1e3a5f; border-radius:8px; }
#ea-table { width:100%; border-collapse:collapse; font-size:.82rem; }
#ea-table thead th { background:#0d1e30; color:#8aacca; padding:8px 10px; text-align:right; position:sticky; top:0; }
#ea-table th.num, #ea-table td.num { text-align:left; }
#ea-table tbody tr:hover { background:#0f2238; }
#ea-table td { padding:6px 10px; border-bottom:1px solid #12233a; color:#c8d8e8; }
.ea-tree-arrow { display:inline-block; width:14px; color:#6a9aca; }
.ea-zero { color:#3a5a7a; }
.ea-row-parent td:first-child, .ea-row-parent td:nth-child(2) { color:#c8e8ff; }

.ea-status-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; font-size:.8rem; color:#5a80a0; }

.ea-section-title { color:#8aacca; font-size:.86rem; font-weight:700; margin:18px 0 8px; }
.ea-budget-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
#ea-budget-status { font-size:.74rem; color:#7090b0; }
.ea-budget-summary { display:flex; gap:18px; flex-wrap:wrap; margin-bottom:10px; }
.ea-budget-summary > div { background:#0a1828; border:1px solid #1e3a5f; border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:150px; }
.ea-bs-lbl { font-size:.7rem; color:#5a80a0; }
.ea-bs-val { font-size:1rem; font-weight:700; color:#c8e8ff; }
.ea-budget-tbl { width:100%; border-collapse:collapse; font-size:.8rem; }
.ea-budget-tbl thead th { background:#0d1e30; color:#8aacca; padding:7px 10px; text-align:right; position:sticky; top:0; }
.ea-budget-tbl th.num, .ea-budget-tbl td.num { text-align:left; }
.ea-budget-tbl td { padding:5px 10px; border-bottom:1px solid #12233a; color:#c8d8e8; }
.ea-nobudget { color:#3a5a7a; font-size:.72rem; }
.ea-footnote { font-size:.68rem; color:#4a6a8a; padding:8px 2px; }
#ea-ytd-note { display:none; font-size:.72rem; color:#e0a050; background:#241a08; border:1px solid #4a3a10; border-radius:6px; padding:6px 10px; margin:6px 0; }
#ea-pareto-note { font-size:.7rem; color:#7090b0; margin-top:6px; }
`;
  document.head.appendChild(s);
}
