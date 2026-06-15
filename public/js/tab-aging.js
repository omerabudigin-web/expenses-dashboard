// ── إعمار أرصدة العملاء — Tab ────────────────────────────────────────────────
// يعرض إعمار الأرصدة لأبعاد ووسام مع تصفية حسب البائع — تحديث كل 60 ثانية

let _agDb        = 'MekSoftDb1';
let _agData      = null;
let _agTimer     = null;
let _agRendered  = false;
let _agView      = 'flat';  // 'flat' | 'grouped'

const AG_FMT  = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const agFmt   = v => AG_FMT.format(+v || 0);
const agEsc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ── Entry point — يُستدعى عند كل ضغطة على التاب ── */
function renderAgingTab() {
  const wrap = document.getElementById('tab-aging');
  if (!wrap) return;

  if (!_agRendered) {
    // أول مرة: بناء الهيكل وربط الأحداث
    _agRendered = true;
    _injectAgingCSS();
    wrap.innerHTML = _agBuildShell();
    _agWireControls(wrap);
    _agStartTimer();
  }

  // في كل مرة: تحديث البيانات فوراً
  _agLoad();
}

/* ── HTML shell ── */
function _agBuildShell() {
  return `
  <!-- ترويسة -->
  <div class="ag-header">
    <div>
      <div class="ag-title">📋 إعمار أرصدة العملاء</div>
      <div class="ag-sub">FIFO · مقاصة عميل/مورد · تحديث تلقائي كل دقيقة</div>
    </div>
    <div id="ag-status" class="ag-status">جارٍ التحميل…</div>
  </div>

  <!-- شريط التحكم -->
  <div class="ag-bar">
    <div class="ag-db-group">
      <button class="ag-db-btn active" data-agdb="MekSoftDb1">أبعاد الحديد</button>
      <button class="ag-db-btn"        data-agdb="MekSoftDb2">وسام الفولاذ</button>
    </div>
    <label class="ag-lbl">البائع:</label>
    <select id="ag-seller" class="ag-sel">
      <option value="">كل البائعين</option>
    </select>
    <label class="ag-lbl">حتى:</label>
    <input  id="ag-asof"   type="date"   class="ag-inp">
    <input  id="ag-search" type="text"   class="ag-inp" placeholder="🔍 اسم / رقم…" style="min-width:150px">
    <label  class="ag-chk"><input type="checkbox" id="ag-zero"> صفري</label>
    <button id="ag-refresh" class="ag-btn ag-btn-blue">↺ تحديث</button>
    <div style="margin-right:auto;display:flex;gap:6px">
      <button id="ag-btn-flat"    class="ag-view-btn active">مسطّح</button>
      <button id="ag-btn-grouped" class="ag-view-btn">حسب البائع</button>
    </div>
  </div>

  <!-- بطاقات البائعين -->
  <div id="ag-cards" class="ag-cards-wrap"></div>

  <!-- صندوق تحليل المقاصة -->
  <div id="ag-netting-box" class="ag-netting-box" style="display:none"></div>

  <!-- الجدول -->
  <div class="ag-tbl-wrap" id="ag-tbl-wrap">
    <div class="ag-loading">⏳ جارٍ حساب الإعمار…</div>
  </div>
  `;
}

/* ── Wire controls ── */
function _agWireControls(wrap) {
  // DB buttons
  wrap.querySelectorAll('.ag-db-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.agdb === _agDb) return;
      _agDb = btn.dataset.agdb;
      wrap.querySelectorAll('.ag-db-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _agLoad();
    });
  });

  // Filters
  const applyF = () => _agRender(_agData);
  ['ag-seller','ag-zero'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', applyF);
  });
  const search = document.getElementById('ag-search');
  if (search) search.addEventListener('input', applyF);

  // Date
  const asof = document.getElementById('ag-asof');
  if (asof) asof.addEventListener('change', _agLoad);

  // Refresh
  document.getElementById('ag-refresh')?.addEventListener('click', _agLoad);

  // View toggle
  document.getElementById('ag-btn-flat')?.addEventListener('click',    () => _agSetView('flat'));
  document.getElementById('ag-btn-grouped')?.addEventListener('click', () => _agSetView('grouped'));
}

/* ── Fetch & render ── */
async function _agLoad() {
  const wrap = document.getElementById('tab-aging');
  if (!wrap || !wrap.classList.contains('active') && document.getElementById('tab-aging')?.parentElement) {
    // Tab might not be active — still load silently for next open
  }

  const asof = document.getElementById('ag-asof')?.value || new Date().toISOString().slice(0,10);
  const status = document.getElementById('ag-status');
  if (status) { status.textContent = '⏳ جارٍ التحميل…'; status.style.color = '#a87d00'; }

  try {
    const url  = `/api/aging?db=${encodeURIComponent(_agDb)}&asOf=${asof}`;
    const data = await fetch(url).then(r => r.json());
    if (data.error) throw new Error(data.error);

    _agData = data;

    // Populate sellers dropdown (once per DB change)
    _agPopulateSellers(data.sellers);

    // Set date
    const asofEl = document.getElementById('ag-asof');
    if (asofEl && !asofEl.value) asofEl.value = data.asOfDate;

    _agRender(data);

    if (status) {
      status.textContent = `✅ ${data.totals.count} عميل | ${agFmt(data.totals.balance)} ر.س | ${new Date().toLocaleTimeString('ar-SA')}`;
      status.style.color = '#1a7a3c';
    }
  } catch (err) {
    if (status) { status.textContent = '❌ ' + err.message; status.style.color = '#c0392b'; }
    console.error('[tab-aging]', err);
  }
}

function _agPopulateSellers(sellers) {
  const sel = document.getElementById('ag-seller');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">كل البائعين</option>';
  (sellers || []).forEach(s => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.name;
    sel.appendChild(o);
  });
  // Restore previous selection if valid
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

/* ── Apply filters ── */
function _agFiltered(data) {
  if (!data?.customers) return [];
  const seller   = document.getElementById('ag-seller')?.value   || '';
  const showZero = document.getElementById('ag-zero')?.checked   || false;
  const search   = (document.getElementById('ag-search')?.value  || '').trim().toLowerCase();
  return data.customers.filter(c => {
    if (!showZero && c.balance < 0.01) return false;
    if (seller && String(c.sellerId) !== seller) return false;
    if (search && !c.name.toLowerCase().includes(search) && !String(c.code).includes(search)) return false;
    return true;
  });
}

/* ── Set view mode ── */
function _agSetView(mode) {
  _agView = mode;
  document.getElementById('ag-btn-flat')?.classList.toggle('active',    mode === 'flat');
  document.getElementById('ag-btn-grouped')?.classList.toggle('active', mode === 'grouped');
  if (_agData) _agRender(_agData);
}

/* ── Render ── */
function _agRender(data) {
  if (!data) return;
  const custs   = _agFiltered(data);
  const selMap  = new Map((data.sellers || []).map(s => [s.id, s.name]));

  _agRenderCards(custs, selMap);
  _agRenderNetBar(data);
  _agRenderTable(custs, selMap);
  _agRenderTally(custs);
}

/* ── Seller summary cards ── */
function _agRenderCards(custs, selMap) {
  const container = document.getElementById('ag-cards');
  if (!container) return;
  const seller = document.getElementById('ag-seller')?.value || '';

  const agg = new Map();
  for (const c of custs) {
    const sid = c.sellerId || 0;
    if (!agg.has(sid)) agg.set(sid, { bal:0, cnt:0, over30:0, over120:0, top:[] });
    const a = agg.get(sid);
    a.bal     += c.balance;
    a.cnt++;
    a.over30  += c.b31_60 + c.b61_90 + c.b91_120 + c.bOver120;
    a.over120 += c.bOver120;
    a.top.push({ name: c.name, bal: c.balance });
  }
  for (const v of agg.values()) v.top.sort((a,b) => b.bal - a.bal);

  const shown = seller
    ? [[+seller, agg.get(+seller)]]
    : [...agg.entries()].sort((a,b) => b[1].bal - a[1].bal).slice(0, 8);

  container.innerHTML = shown.map(([sid, a]) => {
    if (!a) return '';
    const name  = selMap.get(sid) || (sid === 0 ? 'بلا بائع' : `بائع ${sid}`);
    const pOver = a.bal > 0 ? a.over30  / a.bal * 100 : 0;
    const pRisk = a.bal > 0 ? a.over120 / a.bal * 100 : 0;
    const rCls  = pOver < 20 ? 'ag-risk-g' : pOver < 50 ? 'ag-risk-y' : 'ag-risk-r';
    const rLbl  = pOver < 20 ? '✅ منخفضة' : pOver < 50 ? '⚠️ متوسطة' : '🔴 مرتفعة';
    const top3  = a.top.slice(0,3).map(t =>
      `<div class="ag-card-top">${agEsc(t.name.slice(0,20))}: ${agFmt(t.bal)}</div>`
    ).join('');
    return `<div class="ag-card ${rCls}">
      <div class="ag-card-name" title="${agEsc(name)}">${agEsc(name)}</div>
      <div class="ag-card-bal">${agFmt(a.bal)}</div>
      <div class="ag-card-risk">${rLbl} | >30: ${pOver.toFixed(0)}% | >120: ${pRisk.toFixed(0)}%</div>
      <div class="ag-card-cnt">${a.cnt} عميل</div>
      ${top3}
    </div>`;
  }).join('');
}

/* ── صندوق تحليل المقاصة ── */
function _agRenderNetBar(data) {
  const box = document.getElementById('ag-netting-box');
  if (!box) return;
  const details = data.nettingDetails || [];
  if (!details.length) { box.style.display = 'none'; return; }

  const totAR      = details.reduce((s,d) => s + Math.max(0, d.arBalance), 0);
  const totAP      = details.reduce((s,d) => s + d.apBalance, 0);
  const totNet     = details.reduce((s,d) => s + d.netBalance, 0);
  const included   = details.filter(d => d.included);
  const excluded   = details.filter(d => !d.included);

  /* كروت كل جهة */
  const cards = details.map(d => {
    const net      = d.netBalance;
    const posNet   = net > 0;
    const maxVal   = Math.max(d.arBalance, d.apBalance, 1);
    const arPct    = Math.min(100, d.arBalance / maxVal * 100);
    const apPct    = Math.min(100, d.apBalance / maxVal * 100);
    const statusCls = d.included ? 'ag-ns-included' : 'ag-ns-excluded';
    const statusLbl = d.included ? '✅ ظاهر في التقرير' : '🚫 مستبعَد (صافٍ ≤ 0)';
    const netColor  = posNet ? '#27ae60' : '#e74c3c';
    return `
    <div class="ag-ncard ${statusCls}">
      <div class="ag-ncard-names">
        <span class="ag-ncard-cust" title="${agEsc(d.customerName)}">👤 ${agEsc(d.customerName)}</span>
        <span class="ag-ncard-supp" title="${agEsc(d.supplierName)}">🏭 ${agEsc(d.supplierName)}</span>
      </div>
      <div class="ag-ncard-rows">
        <div class="ag-ncard-row">
          <span class="ag-ncard-lbl">ذمم مدينة (AR)</span>
          <span class="ag-ncard-val ag-ar-val">${agFmt(d.arBalance)}</span>
          <div class="ag-nbar-wrap"><div class="ag-nbar-fill ag-nbar-ar" style="width:${arPct.toFixed(0)}%"></div></div>
        </div>
        <div class="ag-ncard-row">
          <span class="ag-ncard-lbl">ذمم دائنة (AP)</span>
          <span class="ag-ncard-val ag-ap-val">${agFmt(d.apBalance)}</span>
          <div class="ag-nbar-wrap"><div class="ag-nbar-fill ag-nbar-ap" style="width:${apPct.toFixed(0)}%"></div></div>
        </div>
        <div class="ag-ncard-net" style="color:${netColor}">
          الصافي: <strong>${net > 0 ? '+' : ''}${agFmt(net)}</strong> ر.س
        </div>
      </div>
      <div class="ag-ncard-status ${statusCls}-txt">${statusLbl}</div>
    </div>`;
  }).join('');

  box.style.display = 'block';
  box.innerHTML = `
    <div class="ag-nbox-header">
      <span class="ag-nbox-title">⚖️ تحليل المقاصة — الجهات التي هي عميل ومورد في آنٍ واحد</span>
      <button class="ag-nbox-toggle" id="ag-nbox-toggle">▲ طي</button>
    </div>
    <div id="ag-nbox-body">
      <div class="ag-nbox-summary">
        <div class="ag-ns-kpi">
          <div class="ag-ns-kpi-lbl">إجمالي جهات مرتبطة</div>
          <div class="ag-ns-kpi-val">${details.length}</div>
        </div>
        <div class="ag-ns-kpi ag-ns-kpi-ar">
          <div class="ag-ns-kpi-lbl">إجمالي AR (قبل المقاصة)</div>
          <div class="ag-ns-kpi-val">${agFmt(totAR)}</div>
        </div>
        <div class="ag-ns-kpi ag-ns-kpi-ap">
          <div class="ag-ns-kpi-lbl">إجمالي AP (مُقاصة)</div>
          <div class="ag-ns-kpi-val">${agFmt(totAP)}</div>
        </div>
        <div class="ag-ns-kpi ${totNet>0?'ag-ns-kpi-pos':'ag-ns-kpi-neg'}">
          <div class="ag-ns-kpi-lbl">الصافي بعد المقاصة</div>
          <div class="ag-ns-kpi-val">${totNet>0?'+':''}${agFmt(totNet)}</div>
        </div>
        <div class="ag-ns-kpi">
          <div class="ag-ns-kpi-lbl">ظاهر في التقرير</div>
          <div class="ag-ns-kpi-val ag-green">${included.length} جهة</div>
        </div>
        <div class="ag-ns-kpi">
          <div class="ag-ns-kpi-lbl">مُستبعَد (صافٍ ≤ 0)</div>
          <div class="ag-ns-kpi-val ag-red">${excluded.length} جهة</div>
        </div>
      </div>
      <div class="ag-ncards-grid">${cards}</div>
    </div>
  `;

  // Toggle collapse
  document.getElementById('ag-nbox-toggle')?.addEventListener('click', function() {
    const body = document.getElementById('ag-nbox-body');
    if (!body) return;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    this.textContent  = collapsed ? '▲ طي' : '▼ توسيع';
  });
}

/* ── Main aging table ── */
function _agRenderTable(custs, selMap) {
  const wrap = document.getElementById('ag-tbl-wrap');
  if (!wrap) return;

  if (!custs.length) {
    wrap.innerHTML = '<div class="ag-empty">لا توجد بيانات للعرض</div>';
    return;
  }

  const showSeller = (_agView === 'flat');
  const hdr = `<thead><tr>
    <th class="ag-th-lbl">رقم</th>
    <th class="ag-th-lbl" style="min-width:180px">اسم العميل</th>
    ${showSeller ? '<th class="ag-th-lbl">البائع</th>' : ''}
    <th class="ag-th-num">أيام التأجيل</th>
    <th class="ag-th-num">الحد الائتماني</th>
    <th class="ag-th-num ag-th-bal">الرصيد</th>
    <th class="ag-th-num">1-7</th>
    <th class="ag-th-num">8-14</th>
    <th class="ag-th-num">15-30</th>
    <th class="ag-th-num ag-th-warn">31-60</th>
    <th class="ag-th-num ag-th-warn">61-90</th>
    <th class="ag-th-num ag-th-warn">91-120</th>
    <th class="ag-th-num ag-th-danger">أكثر من 120</th>
  </tr></thead>`;

  const buildRow = (c, selName) => {
    const cls = c.bOver120 > 0 ? 'ag-row-120' : (c.b31_60+c.b61_90+c.b91_120+c.bOver120) > 0 ? 'ag-row-30' : '';
    const badge = c.isNetted
      ? `<span class="ag-net-badge" title="AR: ${agFmt(c.arBalance)}\nAP: ${agFmt(c.apBalance)}\nصافي: ${agFmt(c.balance)}">⚖</span>`
      : '';
    const n = v => (!v || v < 0.01) ? '<span class="ag-zero">—</span>' : agFmt(v);
    return `<tr class="${cls}">
      <td class="ag-td-lbl ag-code">${c.code}</td>
      <td class="ag-td-lbl">${badge}${agEsc(c.name)}</td>
      ${showSeller ? `<td class="ag-td-lbl ag-muted">${agEsc(selName)}</td>` : ''}
      <td class="ag-td-num">${c.creditDays||'—'}</td>
      <td class="ag-td-num">${c.creditLimit > 0 ? agFmt(c.creditLimit) : '—'}</td>
      <td class="ag-td-num ag-bold">${agFmt(c.balance)}</td>
      <td class="ag-td-num">${n(c.b1_7)}</td>
      <td class="ag-td-num">${n(c.b8_14)}</td>
      <td class="ag-td-num">${n(c.b15_30)}</td>
      <td class="ag-td-num ag-warn-cell">${n(c.b31_60)}</td>
      <td class="ag-td-num ag-warn-cell">${n(c.b61_90)}</td>
      <td class="ag-td-num ag-warn-cell">${n(c.b91_120)}</td>
      <td class="ag-td-num ag-danger-cell">${n(c.bOver120)}</td>
    </tr>`;
  };

  const buildTotal = (list, label, cls = 'ag-row-total') => {
    const t = { balance:0,b1_7:0,b8_14:0,b15_30:0,b31_60:0,b61_90:0,b91_120:0,bOver120:0 };
    list.forEach(c => Object.keys(t).forEach(k => { t[k] += c[k]||0; }));
    return `<tr class="${cls}">
      <td class="ag-td-lbl" colspan="${showSeller?3:2}">${label}</td>
      <td colspan="3" class="ag-td-num ag-bold">${agFmt(t.balance)}</td>
      <td class="ag-td-num">${agFmt(t.b1_7)}</td>
      <td class="ag-td-num">${agFmt(t.b8_14)}</td>
      <td class="ag-td-num">${agFmt(t.b15_30)}</td>
      <td class="ag-td-num">${agFmt(t.b31_60)}</td>
      <td class="ag-td-num">${agFmt(t.b61_90)}</td>
      <td class="ag-td-num">${agFmt(t.b91_120)}</td>
      <td class="ag-td-num">${agFmt(t.bOver120)}</td>
    </tr>`;
  };

  let body = '<tbody>';

  if (_agView === 'flat') {
    custs.forEach(c => { body += buildRow(c, selMap.get(c.sellerId) || '—'); });
    body += buildTotal(custs, `الإجمالي — ${custs.length} عميل`);
  } else {
    // Grouped by seller
    const groups = new Map();
    custs.forEach(c => {
      const sid = c.sellerId || 0;
      if (!groups.has(sid)) groups.set(sid, []);
      groups.get(sid).push(c);
    });
    [...groups.entries()]
      .sort((a,b) => b[1].reduce((s,c)=>s+c.balance,0) - a[1].reduce((s,c)=>s+c.balance,0))
      .forEach(([sid, sc]) => {
        const sName = selMap.get(sid) || (sid===0 ? 'بلا بائع' : `بائع ${sid}`);
        const sTot  = sc.reduce((s,c) => s+c.balance, 0);
        const nCols = 13 + (showSeller ? 0 : -1);
        body += `<tr class="ag-seller-hdr"><td colspan="${nCols}">
          👤 ${agEsc(sName)} — ${sc.length} عميل — ${agFmt(sTot)} ر.س
        </td></tr>`;
        sc.forEach(c => { body += buildRow(c, sName); });
        body += buildTotal(sc, `مجموع ${agEsc(sName)}`, 'ag-seller-total');
      });
    body += buildTotal(custs, `الإجمالي العام — ${custs.length} عميل`);
  }

  body += '</tbody>';
  wrap.innerHTML = `<table class="ag-tbl">${hdr}${body}</table>`;
}

/* ── Tally text ── */
function _agRenderTally(custs) {
  const tot = custs.reduce((s,c) => s+c.balance, 0);
  const statusEl = document.getElementById('ag-status');
  if (statusEl && _agData) {
    const asof = document.getElementById('ag-asof')?.value || _agData.asOfDate;
    statusEl.textContent = `✅ ${custs.length} عميل | ${agFmt(tot)} ر.س | حتى ${asof} | ${new Date().toLocaleTimeString('ar-SA')}`;
    statusEl.style.color = '#1a7a3c';
  }
}

/* ── Auto-refresh timer ── */
function _agStartTimer() {
  if (_agTimer) clearInterval(_agTimer);
  _agTimer = setInterval(() => {
    // فقط إذا كان التاب نشطاً
    const tabEl = document.getElementById('tab-aging');
    if (tabEl && !tabEl.classList.contains('hidden')) _agLoad();
  }, 60000);
}

/* ── CSS ── */
function _injectAgingCSS() {
  if (document.getElementById('ag-css')) return;
  const s = document.createElement('style'); s.id = 'ag-css';
  s.textContent = `
    #tab-aging{padding:0}
    .ag-header{background:linear-gradient(135deg,#0D1F3C,#152d56);color:#fff;
      padding:12px 20px;display:flex;align-items:center;justify-content:space-between;
      border-bottom:2px solid #C9A84C;flex-wrap:wrap;gap:8px}
    .ag-title{font-size:1rem;font-weight:800;color:#C9A84C}
    .ag-sub{font-size:.72rem;color:#a0b8d8;margin-top:2px}
    .ag-status{font-size:.78rem;color:#a0c4e8;white-space:nowrap}

    .ag-bar{background:#0f2035;border-bottom:1px solid #1e3a5f;
      padding:8px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .ag-lbl{font-size:.78rem;color:#7090b0;white-space:nowrap}
    .ag-sel,.ag-inp{background:#0a1828;border:1px solid #1e3a5f;color:#c8d8e8;
      border-radius:5px;padding:4px 8px;font-family:inherit;font-size:.8rem}
    .ag-sel:focus,.ag-inp:focus{outline:none;border-color:#3a7abf}
    .ag-chk{display:flex;align-items:center;gap:4px;font-size:.78rem;color:#9ab0c8;cursor:pointer;white-space:nowrap}
    .ag-chk input{accent-color:#5baef0}
    .ag-btn{padding:4px 12px;border-radius:5px;border:none;font-family:inherit;
      font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap}
    .ag-btn-blue{background:#2B388F;color:#fff}.ag-btn-blue:hover{background:#1f2d72}
    .ag-db-group{display:flex;gap:2px}
    .ag-db-btn{padding:4px 13px;border-radius:5px;border:1px solid #1e3a5f;
      background:#0a1828;color:#7090b0;font-family:inherit;font-size:.8rem;
      cursor:pointer;transition:all .15s;white-space:nowrap}
    .ag-db-btn.active{background:#C9A84C;color:#0D1F3C;font-weight:700;border-color:#C9A84C}
    .ag-db-btn:hover:not(.active){color:#c8d8e8}
    .ag-view-btn{padding:3px 11px;border-radius:4px;border:1px solid #1e3a5f;
      background:#0a1828;color:#7090b0;font-family:inherit;font-size:.78rem;cursor:pointer}
    .ag-view-btn.active{background:#1e3a5f;color:#c8d8e8}

    /* Cards */
    .ag-cards-wrap{display:flex;gap:10px;padding:10px 16px;flex-wrap:wrap;background:#0d1b2a;
      border-bottom:1px solid #1e3a5f;overflow-x:auto}
    .ag-card{min-width:160px;max-width:190px;background:#0f2035;border:1px solid #1e3a5f;
      border-radius:8px;padding:8px 10px;border-right:3px solid var(--ag-rc,#3a7abf);flex-shrink:0}
    .ag-risk-g{--ag-rc:#1a7a3c}.ag-risk-y{--ag-rc:#c9a800}.ag-risk-r{--ag-rc:#c0392b}
    .ag-card-name{font-size:.75rem;font-weight:700;color:#c8d8e8;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
    .ag-card-bal{font-size:.95rem;font-weight:800;color:#5baef0;direction:ltr;text-align:right}
    .ag-card-risk{font-size:.65rem;color:#8a9bb5;margin-top:3px}
    .ag-card-cnt{font-size:.65rem;color:#6a8aa0;margin-top:1px}
    .ag-card-top{font-size:.63rem;color:#5a7a9a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}

    /* Net bar */
    .ag-net-bar{background:#1a1a00;border-bottom:1px solid #5a5000;padding:5px 16px;
      font-size:.76rem;color:#c9a800;gap:12px;flex-wrap:wrap}

    /* Table */
    .ag-tbl-wrap{overflow-x:auto;padding:0 16px 20px;background:#0d1b2a}
    .ag-tbl{width:100%;border-collapse:collapse;font-size:.77rem;min-width:1000px}
    .ag-tbl thead{position:sticky;top:0;z-index:3}
    .ag-th-lbl,.ag-th-num{background:#0a1e38;color:#7090b0;padding:7px 8px;
      white-space:nowrap;border-bottom:1px solid #1e3a5f;font-weight:500}
    .ag-th-lbl{text-align:right}
    .ag-th-num{text-align:left;min-width:80px}
    .ag-th-bal{color:#5baef0!important}
    .ag-th-warn{color:#c9a800!important}
    .ag-th-danger{color:#e07070!important}
    .ag-td-lbl{text-align:right;padding:5px 8px;border-bottom:1px solid #0e2540;color:#b0c8e0}
    .ag-td-num{text-align:left;padding:5px 8px;border-bottom:1px solid #0e2540;
      color:#c0d8f0;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
    .ag-bold{font-weight:700;color:#e0f0ff!important}
    .ag-code{color:#6a8aa0;font-size:.72rem}
    .ag-muted{color:#6a8aa0;font-size:.75rem}
    .ag-zero{color:#3a5a7a}
    .ag-warn-cell{background:rgba(200,160,0,.04)}
    .ag-danger-cell{background:rgba(200,80,80,.05)}
    .ag-row-30  td{background:#1a1400}
    .ag-row-120 td{background:#1a0808}
    .ag-tbl tr:hover td{background:#0a2030!important}
    .ag-seller-hdr td{background:#0c2040;color:#C9A84C;font-weight:700;
      font-size:.78rem;padding:6px 10px;border-top:2px solid #1e3a5f}
    .ag-seller-total td{background:#0a1e30;font-weight:700;color:#5baef0;
      border-top:1px solid #1e3a5f}
    .ag-row-total td{background:#0D1F3C;font-weight:800;color:#fff;
      border-top:2px solid #C9A84C}
    .ag-net-badge{display:inline-block;padding:0 3px;border-radius:3px;
      font-size:.65rem;background:#2a2000;color:#C9A84C;border:1px solid #5a4000;
      cursor:help;margin-left:3px;vertical-align:middle}
    .ag-loading,.ag-empty{text-align:center;padding:50px;color:#5a7a9a;font-size:.88rem}

    /* ── صندوق المقاصة ── */
    .ag-netting-box{background:#0a1620;border-top:2px solid #C9A84C;border-bottom:1px solid #1e3a5f;margin-bottom:0}
    .ag-nbox-header{display:flex;align-items:center;justify-content:space-between;
      padding:8px 16px;background:#0d1e30;cursor:pointer}
    .ag-nbox-title{font-size:.84rem;font-weight:700;color:#C9A84C}
    .ag-nbox-toggle{background:transparent;border:1px solid #3a5a7a;color:#7090b0;
      border-radius:4px;padding:2px 8px;font-family:inherit;font-size:.75rem;cursor:pointer}
    .ag-nbox-toggle:hover{color:#c8d8e8}

    /* KPI summary strip */
    .ag-nbox-summary{display:flex;gap:0;border-bottom:1px solid #1e3a5f;flex-wrap:wrap}
    .ag-ns-kpi{flex:1;min-width:120px;padding:8px 14px;border-left:1px solid #1e3a5f;text-align:center}
    .ag-ns-kpi:last-child{border-left:none}
    .ag-ns-kpi-lbl{font-size:.68rem;color:#6a8aa0;margin-bottom:4px}
    .ag-ns-kpi-val{font-size:.95rem;font-weight:800;color:#c8d8e8;direction:ltr}
    .ag-ns-kpi-ar .ag-ns-kpi-val{color:#5baef0}
    .ag-ns-kpi-ap .ag-ns-kpi-val{color:#e07070}
    .ag-ns-kpi-pos .ag-ns-kpi-val{color:#27ae60}
    .ag-ns-kpi-neg .ag-ns-kpi-val{color:#e74c3c}
    .ag-green{color:#27ae60!important}
    .ag-red{color:#e74c3c!important}

    /* Cards grid */
    .ag-ncards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
      gap:12px;padding:14px 16px}
    .ag-ncard{background:#0f2035;border:1px solid #1e3a5f;border-radius:10px;padding:12px 14px;
      border-top:3px solid var(--ag-nc,#3a7abf)}
    .ag-ns-included{--ag-nc:#27ae60}
    .ag-ns-excluded{--ag-nc:#e74c3c;opacity:.75}
    .ag-ncard-names{margin-bottom:8px}
    .ag-ncard-cust{display:block;font-size:.82rem;font-weight:700;color:#c8d8e8;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ag-ncard-supp{display:block;font-size:.73rem;color:#6a8aa0;margin-top:2px;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ag-ncard-rows{display:flex;flex-direction:column;gap:5px;margin-bottom:8px}
    .ag-ncard-row{display:flex;align-items:center;gap:8px}
    .ag-ncard-lbl{font-size:.7rem;color:#6a8aa0;white-space:nowrap;width:100px;flex-shrink:0}
    .ag-ncard-val{font-size:.78rem;font-weight:700;direction:ltr;white-space:nowrap;width:110px;text-align:right;flex-shrink:0}
    .ag-ar-val{color:#5baef0}
    .ag-ap-val{color:#e07070}
    .ag-nbar-wrap{flex:1;height:5px;background:#1a2a3a;border-radius:3px;overflow:hidden}
    .ag-nbar-fill{height:100%;border-radius:3px;transition:width .3s}
    .ag-nbar-ar{background:#2B388F}
    .ag-nbar-ap{background:#8b1a1a}
    .ag-ncard-net{font-size:.82rem;color:#a0b8c8;margin-top:4px;border-top:1px solid #1e3a5f;padding-top:5px}
    .ag-ncard-net strong{font-size:.88rem}
    .ag-ncard-status{font-size:.7rem;margin-top:5px;font-weight:600}
    .ag-ns-included-txt{color:#27ae60}
    .ag-ns-excluded-txt{color:#e74c3c}
  `;
  document.head.appendChild(s);
}
