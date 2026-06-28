// ── خطة تحصيل المدينين — Tab ─────────────────────────────────────────────────
// أرصدة GL موثوقة · إعمار نسبي · مقاصّة بينية (IAS 32) · تكلفة تمويل سوق فقط

let _arcDb       = 'MekSoftDb1';
let _arcData     = null;
let _arcTimer    = null;
let _arcRendered = false;
let _arcSort     = { col: 'balance', asc: false };
let _arcSearch   = '';
let _arcAction   = '';
const ARC_REFRESH_SEC = 120;

function _arcIsActive() { return !!document.querySelector('.tab.active[data-tab="ar-collection"]'); }
function _arcStopTimer() { if (_arcTimer) { clearInterval(_arcTimer); _arcTimer = null; } }

const _arcFmt  = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const arcFmt   = v => _arcFmt.format(Math.round(+v || 0));
const arcFmt2  = v => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+v || 0);
const arcEsc   = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ARC_BUCKETS = [
  { key: 'bCurrent', label: 'جارية',    color: '#4ada8e' },
  { key: 'b1_30',    label: '1-30 ي',   color: '#C9A84C' },
  { key: 'b31_60',   label: '31-60 ي',  color: '#e08c5a' },
  { key: 'b61_90',   label: '61-90 ي',  color: '#e05a5a' },
  { key: 'b91_120',  label: '91-120 ي', color: '#c03030' },
  { key: 'bPlus120', label: '+120 ي',   color: '#800020' },
];

const ARC_ACTION_COLOR = {
  'عاجل':          '#c03030',
  'متابعة':        '#e08c5a',
  'تنبيه':         '#C9A84C',
  'عادي':          '#4ada8e',
  'تسوية مجموعة': '#7a7aaa',
};

/* ── Entry point ── */
function renderARCollection() {
  const wrap = document.getElementById('tab-ar-collection');
  if (!wrap) return;

  if (!_arcRendered) {
    _arcRendered = true;
    _arcInjectCSS();
    wrap.innerHTML = _arcBuildShell();
    _arcWireControls(wrap);
    _arcStartTimer();
  }
  _arcLoad();
}

/* ── HTML shell ── */
function _arcBuildShell() {
  return `
  <div class="arc-header">
    <div>
      <div class="arc-title">💰 خطة تحصيل المدينين</div>
      <div class="arc-sub">أرصدة GL موثوقة · إعمار نسبي · مقاصّة بينية · تكلفة تمويل السوق 7%</div>
    </div>
    <div id="arc-status" class="arc-status">جارٍ التحميل…</div>
  </div>

  <div class="arc-bar">
    <div class="arc-db-group">
      <button class="arc-db-btn active" data-arcdb="MekSoftDb1">أبعاد الحديد</button>
      <button class="arc-db-btn"        data-arcdb="MekSoftDb2">وسام الفولاذ</button>
    </div>
    <input id="arc-search" type="text" class="arc-inp" placeholder="🔍 اسم العميل…" style="min-width:160px">
    <select id="arc-action-filter" class="arc-sel">
      <option value="">كل الإجراءات</option>
      <option value="عاجل">عاجل</option>
      <option value="متابعة">متابعة</option>
      <option value="تنبيه">تنبيه</option>
      <option value="عادي">عادي</option>
      <option value="تسوية مجموعة">بيني (تسوية مجموعة)</option>
    </select>
    <button id="arc-refresh" class="arc-btn arc-btn-blue">↺ تحديث</button>
    <button id="arc-btn-excel" class="arc-btn arc-btn-excel">📊 Excel</button>
  </div>

  <!-- بطاقات KPI -->
  <div id="arc-kpis"></div>

  <!-- شريط الإعمار المرئي -->
  <div id="arc-aging-bar-wrap" class="arc-aging-bar-wrap" style="display:none">
    <div class="arc-aging-bar-title">توزيع المدينين حسب العمر (الإجمالي شامل البيني)</div>
    <div class="arc-aging-bar" id="arc-aging-bar"></div>
    <div class="arc-aging-legend" id="arc-aging-legend"></div>
  </div>

  <!-- مصفوفة الإجراءات -->
  <div id="arc-matrix" class="arc-matrix-wrap" style="display:none"></div>

  <!-- الجدول -->
  <div class="arc-tbl-wrap" id="arc-tbl-wrap">
    <div class="arc-loading">⏳ جارٍ تحميل بيانات المدينين…</div>
  </div>

  <!-- بطاقة منهجية -->
  <details class="arc-note-card" style="margin-top:12px">
    <summary class="arc-note-summary">ℹ️ منهجية الحساب</summary>
    <div class="arc-note-body">
      <strong>الرصيد:</strong> رصيد GL للحساب 47 (عملاء الشركة) مقسَّم لكل عميل — مصدر موثوق ومطابق لميزان المراجعة.<br>
      <strong>الإعمار:</strong> نسبي — يُوزَّع رصيد GL على خانات العمر بناءً على مبالغ الفواتير الآجلة المرتبطة بقيود اليومية. إذا دفع العميل مبالغ قبل الفترة، يُفترض أن المدفوعات توزّعت بالتناسب على الفواتير (لا FIFO).<br>
      <strong>المقاصّة البينية:</strong> يُكشف الطرف البيني بمطابقة رقم السجل الضريبي (VatNo) بين جدولَي Customer وSupplier. يُحسب AP صافياً من حسابات الموردين (77/78). يُستثنى من خطة التحصيل وتكلفة التمويل.<br>
      <strong>تكلفة التمويل:</strong> مدينو السوق فقط × 7% سنوياً (لا تشمل الأطراف البينية).<br>
      <strong>الإجراء:</strong> عاجل (متوسط تأخر &gt; 90 ي) · متابعة (31-90 ي) · تنبيه (1-30 ي) · عادي (جاري).<br>
      <strong>DSO:</strong> رصيد السوق ÷ متوسط المبيعات اليومي منذ بداية الفترة.<br>
      <strong class="arc-ias32">⚠️ IAS 32/9:</strong> <span class="arc-ias32-txt">المقاصة بين الذمة المدينة والدائنة تستلزم توافر حقّ قانوني نافذ للمقاصّة ونيّة تسوية الرصيد الصافي أو تحصيل الأصل وتسوية الالتزام في آنٍ واحد. المبالغ المعروضة هنا استرشادية ولا تُعدّ مقاصّة محاسبية رسمية بمعنى المعيار.</span>
    </div>
  </details>
  `;
}

/* ── Wire controls ── */
function _arcWireControls(wrap) {
  wrap.querySelectorAll('.arc-db-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.arcdb === _arcDb) return;
      _arcDb = btn.dataset.arcdb;
      wrap.querySelectorAll('.arc-db-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _arcLoad();
    });
  });

  const searchEl = document.getElementById('arc-search');
  if (searchEl) searchEl.addEventListener('input', () => {
    _arcSearch = searchEl.value.trim().toLowerCase();
    _arcRender(_arcData);
  });

  const actionEl = document.getElementById('arc-action-filter');
  if (actionEl) actionEl.addEventListener('change', () => {
    _arcAction = actionEl.value;
    _arcRender(_arcData);
  });

  document.getElementById('arc-refresh')?.addEventListener('click', _arcLoad);
  document.getElementById('arc-btn-excel')?.addEventListener('click', _arcExcel);
}

/* ── Timer ── */
function _arcStartTimer() {
  _arcStopTimer();
  let cd = ARC_REFRESH_SEC;
  _arcTimer = setInterval(() => {
    cd--;
    const el = document.getElementById('arc-status');
    if (el && _arcData) el.textContent = `تحديث تلقائي خلال ${cd}ث`;
    if (cd <= 0) { cd = ARC_REFRESH_SEC; _arcLoad(); }
  }, 1000);
}

/* ── Load ── */
async function _arcLoad() {
  const el = document.getElementById('arc-status');
  if (el) el.textContent = 'جارٍ التحميل…';

  const startDate = (typeof START_DATE !== 'undefined') ? START_DATE : '2025-10-01';
  try {
    const r = await fetch(`/api/ar-collection?db=${encodeURIComponent(_arcDb)}&from=${startDate}`);
    if (!r.ok) throw new Error(await r.text());
    _arcData = await r.json();
    _arcRender(_arcData);
    if (el) el.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')}`;
  } catch (e) {
    const tbl = document.getElementById('arc-tbl-wrap');
    if (tbl) tbl.innerHTML = `<div class="arc-error">خطأ: ${arcEsc(e.message)}</div>`;
    if (el) el.textContent = 'فشل التحميل';
  }
}

/* ── Main render ── */
function _arcRender(data) {
  if (!data) return;
  const { totals, customers } = data;

  _arcRenderKPIs(totals, data);
  _arcRenderAgingBar(totals);
  _arcRenderMatrix(customers);
  _arcRenderTable(customers);
}

/* ── KPI cards ── */
function _arcRenderKPIs(t, data) {
  const el = document.getElementById('arc-kpis');
  if (!el) return;

  // Market overdue (from customer list, excludes interco)
  const mkt = (data.customers || []).filter(c => !c.isInterco);
  const mktOverdue = mkt.reduce((s, c) =>
    s + (c.b1_30||0) + (c.b31_60||0) + (c.b61_90||0) + (c.b91_120||0) + (c.bPlus120||0), 0);
  const mktOverduePct = t.marketBalance > 0 ? (mktOverdue / t.marketBalance * 100) : 0;

  const hasInterco = (t.intercoCount || 0) > 0;
  const intercoNetNeg = hasInterco && t.intercoNet < 0;

  el.innerHTML = `
    <!-- ── الإجمالي + البيني ── -->
    <div class="arc-kpi-section-hdr">ملخص المديونية الإجمالية</div>
    <div class="arc-kpis">
      <div class="arc-kpi">
        <div class="arc-kpi-lbl">إجمالي ح.47</div>
        <div class="arc-kpi-val">${arcFmt2(t.balance)}</div>
        <div class="arc-kpi-sub">${t.customerCount} عميل · ر.س</div>
      </div>
      ${hasInterco ? `
      <div class="arc-kpi arc-kpi-interco">
        <div class="arc-kpi-lbl">ذمة وسام البينية (AR ح.47)</div>
        <div class="arc-kpi-val" style="color:#e08c5a">${arcFmt2(t.intercoBalance)}</div>
        <div class="arc-kpi-sub">AP ح.77: ${arcFmt2(t.intercoAP)} · ${t.intercoCount} طرف</div>
      </div>
      <div class="arc-kpi arc-kpi-interco">
        <div class="arc-kpi-lbl">صافي التعرّض البيني</div>
        <div class="arc-kpi-val" style="color:${intercoNetNeg ? '#c03030' : '#4ada8e'}">${arcFmt2(t.intercoNet)}</div>
        <div class="arc-kpi-sub">${intercoNetNeg ? 'أبعاد مدينة صافياً لوسام' : 'أبعاد دائنة صافياً'}</div>
      </div>
      ` : ''}
    </div>

    <!-- ── مدينو السوق ── -->
    <div class="arc-kpi-section-hdr arc-kpi-section-market">مدينو السوق الفعليون</div>
    <div class="arc-kpis">
      <div class="arc-kpi arc-kpi-market">
        <div class="arc-kpi-lbl">رصيد السوق</div>
        <div class="arc-kpi-val" style="color:#4ada8e">${arcFmt2(t.marketBalance)}</div>
        <div class="arc-kpi-sub">${t.marketCount} عميل · ر.س</div>
      </div>
      <div class="arc-kpi arc-kpi-market">
        <div class="arc-kpi-lbl">متأخرات السوق</div>
        <div class="arc-kpi-val" style="color:#e08c5a">${arcFmt2(mktOverdue)}</div>
        <div class="arc-kpi-sub">${mktOverduePct.toFixed(1)}% من رصيد السوق</div>
      </div>
      <div class="arc-kpi arc-kpi-market">
        <div class="arc-kpi-lbl">DSO السوق</div>
        <div class="arc-kpi-val">${t.marketDso?.toFixed(1) ?? '—'}</div>
        <div class="arc-kpi-sub">يوم · متوسط تأخر: ${t.marketAvgDays?.toFixed(1) ?? '—'} ي</div>
      </div>
      <div class="arc-kpi arc-kpi-market">
        <div class="arc-kpi-lbl">تكلفة تمويل السوق</div>
        <div class="arc-kpi-val" style="color:#e08c5a">${arcFmt2(t.marketFinCostTotal)}</div>
        <div class="arc-kpi-sub">7% × رصيد السوق · ر.س</div>
      </div>
    </div>
  `;
}

/* ── Aging visual bar ── */
function _arcRenderAgingBar(t) {
  const barWrap = document.getElementById('arc-aging-bar-wrap');
  const bar     = document.getElementById('arc-aging-bar');
  const legend  = document.getElementById('arc-aging-legend');
  if (!barWrap || !bar || !legend || !t.balance) return;
  barWrap.style.display = '';

  bar.innerHTML = ARC_BUCKETS.map(b => {
    const amt = t[b.key] || 0;
    const pct = t.balance > 0 ? (amt / t.balance * 100) : 0;
    if (pct < 0.5) return '';
    return `<div class="arc-bar-seg" style="width:${pct.toFixed(2)}%;background:${b.color}"
              title="${b.label}: ${arcFmt2(amt)} (${pct.toFixed(1)}%)"></div>`;
  }).join('');

  legend.innerHTML = ARC_BUCKETS.map(b => {
    const amt = t[b.key] || 0;
    const pct = t.balance > 0 ? (amt / t.balance * 100) : 0;
    return `<span class="arc-legend-item">
      <span class="arc-legend-dot" style="background:${b.color}"></span>
      <span>${b.label}: ${arcFmt2(amt)} (${pct.toFixed(1)}%)</span>
    </span>`;
  }).join('');
}

/* ── Action matrix ── */
function _arcRenderMatrix(customers) {
  const el = document.getElementById('arc-matrix');
  if (!el) return;

  const marketActions = ['عاجل', 'متابعة', 'تنبيه', 'عادي'];
  const groups = {};
  [...marketActions, 'تسوية مجموعة'].forEach(a => { groups[a] = { count: 0, balance: 0 }; });
  customers.forEach(c => {
    if (groups[c.action]) { groups[c.action].count++; groups[c.action].balance += c.balance; }
  });

  const marketTotal = marketActions.reduce((s, a) => s + groups[a].balance, 0);
  const totAll      = customers.reduce((s, c) => s + c.balance, 0);

  el.style.display = '';
  el.innerHTML = `
    <div class="arc-matrix-title">مصفوفة الإجراءات</div>
    <div class="arc-matrix-grid">
      ${marketActions.map(a => {
        const g   = groups[a];
        const pct = marketTotal > 0 ? (g.balance / marketTotal * 100).toFixed(1) : '0.0';
        return `<div class="arc-matrix-cell" style="border-right:4px solid ${ARC_ACTION_COLOR[a]}">
          <div class="arc-matrix-action" style="color:${ARC_ACTION_COLOR[a]}">${a}</div>
          <div class="arc-matrix-count">${g.count} عميل</div>
          <div class="arc-matrix-bal">${arcFmt2(g.balance)} ر.س</div>
          <div class="arc-matrix-pct">${pct}%</div>
        </div>`;
      }).join('')}
    </div>
    ${groups['تسوية مجموعة'].count > 0 ? `
    <div class="arc-matrix-interco-row">
      <span class="arc-interco-badge">بيني — تسوية مجموعة</span>
      <span style="color:#8899aa">${groups['تسوية مجموعة'].count} طرف ·
        AR: ${arcFmt2(groups['تسوية مجموعة'].balance)} ر.س ·
        ${(groups['تسوية مجموعة'].balance / totAll * 100).toFixed(1)}% من الإجمالي ·
        مستثنى من التحصيل
      </span>
    </div>
    ` : ''}
  `;
}

/* ── Table ── */
function _arcRenderTable(customers) {
  const el = document.getElementById('arc-tbl-wrap');
  if (!el) return;

  let rows = customers.slice();
  if (_arcSearch) rows = rows.filter(r => (r.custName || '').toLowerCase().includes(_arcSearch));
  if (_arcAction) rows = rows.filter(r => r.action === _arcAction);

  const { col, asc } = _arcSort;
  rows.sort((a, b) => {
    const va = a[col] ?? 0, vb = b[col] ?? 0;
    return asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const thCls = c => `class="arc-th arc-sortable${_arcSort.col === c ? ' arc-sorted' : ''}"
    data-col="${c}" style="cursor:pointer"`;

  const totRow = {};
  ARC_BUCKETS.forEach(b => { totRow[b.key] = rows.reduce((s, r) => s + (r[b.key] || 0), 0); });
  totRow.balance       = rows.reduce((s, r) => s + r.balance, 0);
  totRow.apBalance     = rows.reduce((s, r) => s + r.apBalance, 0);
  totRow.netExposure   = rows.reduce((s, r) => s + (r.isInterco ? r.netExposure : r.balance), 0);
  totRow.financingCost = rows.reduce((s, r) => s + r.financingCost, 0);

  el.innerHTML = `
  <table class="arc-tbl">
    <thead>
      <tr>
        <th class="arc-th" style="min-width:180px">العميل</th>
        <th ${thCls('balance')}>الرصيد ↕</th>
        <th class="arc-th arc-th-interco">AP ح.77</th>
        <th class="arc-th arc-th-interco">صافي التعرّض</th>
        ${ARC_BUCKETS.map(b => `<th class="arc-th" style="background:${b.color}22;color:${b.color}">${b.label}</th>`).join('')}
        <th ${thCls('avgDaysOverdue')}>متوسط تأخر ↕</th>
        <th ${thCls('financingCost')}>تكلفة تمويل ↕</th>
        <th class="arc-th">الإجراء</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length === 0
        ? `<tr><td colspan="13" style="text-align:center;padding:20px;color:#8899aa">لا توجد بيانات</td></tr>`
        : rows.map(r => {
            const isExcluded = r.action === 'تسوية مجموعة';
            const rowCls = isExcluded ? 'arc-tr arc-tr-interco' : 'arc-tr';
            const netStr = r.isInterco
              ? `<span style="color:${r.netExposure < 0 ? '#c03030' : '#4ada8e'}">${arcFmt2(r.netExposure)}</span>`
              : '—';
            return `
            <tr class="${rowCls}">
              <td class="arc-td arc-name" title="${arcEsc(r.custName)}">
                ${arcEsc((r.custName || '').substring(0, 35))}
                ${isExcluded ? '<span class="arc-interco-tag">بيني</span>' : (r.isInterco ? '<span class="arc-interco-tag arc-dual-tag">مزدوج</span>' : '')}
              </td>
              <td class="arc-td arc-num">${arcFmt2(r.balance)}</td>
              <td class="arc-td arc-num">${r.isInterco ? arcFmt2(r.apBalance) : '—'}</td>
              <td class="arc-td arc-num">${netStr}</td>
              ${ARC_BUCKETS.map(b => {
                const v = r[b.key] || 0;
                const style = v > 0 ? `style="color:${b.color}"` : '';
                return `<td class="arc-td arc-num" ${style}>${v > 0 ? arcFmt2(v) : '—'}</td>`;
              }).join('')}
              <td class="arc-td arc-num">${r.avgDaysOverdue > 0 ? r.avgDaysOverdue.toFixed(1) : '—'}</td>
              <td class="arc-td arc-num" style="color:${r.financingCost > 0 ? '#e08c5a' : '#506070'}">
                ${r.financingCost > 0 ? arcFmt2(r.financingCost) : '—'}
              </td>
              <td class="arc-td arc-action" style="color:${ARC_ACTION_COLOR[r.action] || '#8899aa'}">${r.action}</td>
            </tr>`;
          }).join('')}
    </tbody>
    <tfoot>
      <tr class="arc-foot">
        <td class="arc-td" style="font-weight:700">الإجمالي (${rows.length} عميل)</td>
        <td class="arc-td arc-num" style="font-weight:700">${arcFmt2(totRow.balance)}</td>
        <td class="arc-td arc-num">${totRow.apBalance > 0 ? arcFmt2(totRow.apBalance) : '—'}</td>
        <td class="arc-td arc-num">${arcFmt2(totRow.netExposure)}</td>
        ${ARC_BUCKETS.map(b => `<td class="arc-td arc-num">${arcFmt2(totRow[b.key])}</td>`).join('')}
        <td class="arc-td"></td>
        <td class="arc-td arc-num">${arcFmt2(totRow.financingCost)}</td>
        <td class="arc-td"></td>
      </tr>
    </tfoot>
  </table>`;

  el.querySelectorAll('[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const c = th.dataset.col;
      _arcSort = { col: c, asc: _arcSort.col === c ? !_arcSort.asc : false };
      _arcRender(_arcData);
    });
  });
}

/* ── Excel export ── */
function _arcExcel() {
  if (!_arcData?.customers?.length) return;
  const rows = _arcData.customers.map(r => ({
    'العميل':          r.custName,
    'نوع':             r.isInterco ? 'بيني' : 'سوق',
    'الرصيد (AR)':     r.balance,
    'AP ح.77':         r.apBalance || 0,
    'صافي التعرّض':   r.isInterco ? r.netExposure : r.balance,
    'جارية':           r.bCurrent,
    '1-30 يوم':        r.b1_30,
    '31-60 يوم':       r.b31_60,
    '61-90 يوم':       r.b61_90,
    '91-120 يوم':      r.b91_120,
    '+120 يوم':        r.bPlus120,
    'متوسط التأخر':    r.avgDaysOverdue,
    'تكلفة التمويل':   r.financingCost,
    'الإجراء':         r.action,
  }));
  if (typeof XLSX === 'undefined') { alert('مكتبة Excel غير محملة'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'خطة التحصيل');
  XLSX.writeFile(wb, `ar-collection-${_arcDb}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ── CSS ── */
function _arcInjectCSS() {
  if (document.getElementById('arc-style')) return;
  const s = document.createElement('style');
  s.id = 'arc-style';
  s.textContent = `
  .arc-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }
  .arc-title  { font-size:1.3rem; font-weight:700; color:#C9A84C; }
  .arc-sub    { font-size:.78rem; color:#8899aa; margin-top:3px; }
  .arc-status { font-size:.75rem; color:#506070; margin-top:4px; white-space:nowrap; }

  .arc-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
  .arc-db-group { display:flex; gap:4px; }
  .arc-db-btn { padding:4px 12px; border:1px solid #2a3f55; border-radius:4px;
    background:#0D1B3E; color:#8899aa; cursor:pointer; font-size:.82rem; transition:all .15s; }
  .arc-db-btn.active { background:#C9A84C; color:#0D1B3E; border-color:#C9A84C; font-weight:700; }
  .arc-inp { padding:4px 8px; border:1px solid #2a3f55; border-radius:4px;
    background:#112035; color:#cdd8e8; font-size:.82rem; }
  .arc-sel { padding:4px 8px; border:1px solid #2a3f55; border-radius:4px;
    background:#112035; color:#cdd8e8; font-size:.82rem; }
  .arc-btn { padding:4px 12px; border-radius:4px; border:none; cursor:pointer; font-size:.82rem; }
  .arc-btn-blue  { background:#1a6fa8; color:#fff; }
  .arc-btn-excel { background:#217346; color:#fff; }

  .arc-kpi-section-hdr { font-size:.75rem; color:#506070; font-weight:600; text-transform:uppercase;
    letter-spacing:.05em; margin:10px 0 6px; padding-right:4px; border-right:3px solid #2a3f55; }
  .arc-kpi-section-market { border-right-color:#4ada8e; color:#4ada8e; }

  .arc-kpis { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
  .arc-kpi  { background:#112035; border:1px solid #1e3045; border-radius:8px;
    padding:10px 16px; min-width:140px; flex:1; }
  .arc-kpi-interco { border-color:#e08c5a44; background:#1a1205; }
  .arc-kpi-market  { border-color:#4ada8e33; }
  .arc-kpi-lbl { font-size:.72rem; color:#8899aa; margin-bottom:4px; }
  .arc-kpi-val  { font-size:1.25rem; font-weight:700; color:#C9A84C; }
  .arc-kpi-sub  { font-size:.72rem; color:#506070; margin-top:3px; }

  .arc-aging-bar-wrap  { background:#112035; border-radius:8px; padding:12px 16px; margin-bottom:12px; }
  .arc-aging-bar-title { font-size:.82rem; color:#8899aa; margin-bottom:8px; }
  .arc-aging-bar       { display:flex; height:22px; border-radius:6px; overflow:hidden; gap:1px; }
  .arc-bar-seg         { height:100%; transition:width .3s; }
  .arc-aging-legend    { display:flex; flex-wrap:wrap; gap:12px; margin-top:8px; }
  .arc-legend-item     { display:flex; align-items:center; gap:5px; font-size:.75rem; color:#cdd8e8; }
  .arc-legend-dot      { width:10px; height:10px; border-radius:2px; flex-shrink:0; }

  .arc-matrix-wrap      { background:#112035; border-radius:8px; padding:12px 16px; margin-bottom:12px; }
  .arc-matrix-title     { font-size:.82rem; color:#8899aa; margin-bottom:10px; }
  .arc-matrix-grid      { display:flex; gap:10px; flex-wrap:wrap; }
  .arc-matrix-cell      { flex:1; min-width:110px; background:#0D1B3E; border-radius:6px; padding:10px 12px; }
  .arc-matrix-action    { font-size:.85rem; font-weight:700; margin-bottom:4px; }
  .arc-matrix-count     { font-size:.72rem; color:#8899aa; }
  .arc-matrix-bal       { font-size:.82rem; color:#cdd8e8; margin-top:3px; }
  .arc-matrix-pct       { font-size:.72rem; color:#506070; }
  .arc-matrix-interco-row { margin-top:10px; padding:8px 12px; background:#1a1205;
    border:1px solid #e08c5a44; border-radius:6px; font-size:.78rem; display:flex;
    align-items:center; gap:10px; flex-wrap:wrap; }
  .arc-interco-badge { background:#7a7aaa22; border:1px solid #7a7aaa66; color:#9999cc;
    padding:2px 8px; border-radius:4px; font-size:.75rem; font-weight:700; white-space:nowrap; }

  .arc-tbl-wrap { overflow-x:auto; }
  .arc-tbl      { width:100%; border-collapse:collapse; font-size:.80rem; direction:rtl; }
  .arc-th       { background:#112035; color:#8899aa; padding:7px 10px; text-align:right;
    position:sticky; top:0; z-index:1; border-bottom:1px solid #1e3045; font-weight:600;
    white-space:nowrap; }
  .arc-th.arc-sorted { color:#C9A84C; }
  .arc-th-interco    { color:#7a7aaa !important; background:#0e1a2a !important; }
  .arc-td       { padding:6px 10px; border-bottom:1px solid #0f1c2e; white-space:nowrap; color:#cdd8e8; }
  .arc-tr:hover .arc-td { background:#112035; }
  .arc-tr-interco .arc-td { background:#100d1a; }
  .arc-tr-interco:hover .arc-td { background:#16112a; }
  .arc-num      { text-align:left; font-variant-numeric:tabular-nums; }
  .arc-name     { max-width:220px; overflow:hidden; text-overflow:ellipsis; }
  .arc-action   { font-weight:700; text-align:center; }
  .arc-foot .arc-td { background:#0D1B3E; border-top:2px solid #1e3045; font-weight:600; }
  .arc-interco-tag  { display:inline-block; margin-right:6px; background:#7a7aaa22;
    border:1px solid #7a7aaa55; color:#9999cc; font-size:.65rem; padding:1px 5px;
    border-radius:3px; vertical-align:middle; }
  .arc-dual-tag     { background:#2a4a3a22; border-color:#4ada8e44; color:#4ada8e99; }

  .arc-note-card    { background:#112035; border:1px solid #1e3045; border-radius:8px;
    padding:10px 14px; margin-bottom:8px; }
  .arc-note-summary { font-size:.80rem; color:#8899aa; cursor:pointer; }
  .arc-note-body    { font-size:.75rem; color:#8899aa; margin-top:8px; line-height:1.8; }
  .arc-ias32        { color:#C9A84C; }
  .arc-ias32-txt    { color:#7a7890; }
  .arc-loading      { text-align:center; padding:40px; color:#8899aa; }
  .arc-error        { color:#e05a5a; padding:20px; }
  `;
  document.head.appendChild(s);
}
