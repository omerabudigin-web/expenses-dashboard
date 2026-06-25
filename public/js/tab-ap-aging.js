// ── إعمار أرصدة الموردين — AP Aging Tab ─────────────────────────────────────
// يطابق تقرير "Supplier Balances Aging" في ميك سوفت — FIFO + مقاصة موردين/عملاء
// تحديث تلقائي كل 10 دقائق — مبدّل شركة مستقل

'use strict';

let _aapDb        = 'MekSoftDb1';
let _aapData      = null;
let _aapTimer     = null;
let _aapRendered  = false;
let _aapCountdown = 0;
let _aapChart     = null;
let _aapSort      = { col: 'balance', dir: -1 };  // -1=desc
const AAP_REFRESH_SEC = 600;   // 10 min

function _aapIsActive() { return !!document.querySelector('.tab.active[data-tab="ap-aging"]'); }
function _aapStopTimer() { if (_aapTimer) { clearInterval(_aapTimer); _aapTimer = null; } }

const _AAP_FMT0 = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 });
const _AAP_FMT1 = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const aapFmt  = v => _AAP_FMT0.format(Math.round(+v || 0));
const aapFmt1 = v => _AAP_FMT1.format(+v || 0);
const aapEsc  = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Entry point ─────────────────────────────────────────────────────────────── */
function renderAPAgingTab() {
  const wrap = document.getElementById('tab-ap-aging');
  if (!wrap) return;

  if (!_aapRendered) {
    _aapRendered = true;
    _aapInjectCSS();
    wrap.innerHTML = _aapBuildShell();
    _aapWireControls(wrap);
    _aapStartTimer();
  }
  _aapLoad();
}

/* ── CSS ─────────────────────────────────────────────────────────────────────── */
function _aapInjectCSS() {
  if (document.getElementById('aap-css')) return;
  const s = document.createElement('style');
  s.id = 'aap-css';
  s.textContent = `
    .aap-header{display:flex;justify-content:space-between;align-items:flex-start;
      background:#0D1F3C;padding:14px 18px;border-radius:10px;margin-bottom:12px}
    .aap-title{font-size:1.15rem;font-weight:700;color:#C9A84C}
    .aap-sub{font-size:.78rem;color:#8aa0bb;margin-top:3px}
    .aap-status{font-size:.78rem;color:#8aa0bb;text-align:left;min-width:180px}
    .aap-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;
      background:#111e30;padding:10px 14px;border-radius:8px}
    .aap-db-btn{background:#1a2d4a;border:1px solid #2a4060;color:#8aa0bb;
      border-radius:6px;padding:5px 14px;cursor:pointer;font-size:.83rem;font-family:inherit}
    .aap-db-btn.active{background:#C9A84C;color:#0D1F3C;border-color:#C9A84C;font-weight:700}
    .aap-lbl{font-size:.8rem;color:#8aa0bb}
    .aap-inp{background:#1a2d4a;border:1px solid #2a4060;color:#c0d0e0;border-radius:5px;
      padding:4px 8px;font-size:.82rem;font-family:inherit}
    .aap-btn{background:#1a2d4a;border:1px solid #C9A84C;color:#C9A84C;border-radius:6px;
      padding:5px 14px;cursor:pointer;font-size:.82rem;font-family:inherit}
    .aap-btn:hover{background:#C9A84C;color:#0D1F3C}

    .aap-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));
      gap:10px;margin-bottom:14px}
    .aap-card{background:#111e30;border-radius:9px;padding:14px 16px;
      border-left:3px solid #C9A84C}
    .aap-card-label{font-size:.73rem;color:#8aa0bb;margin-bottom:5px}
    .aap-card-val{font-size:1.3rem;font-weight:700;color:#C9A84C}
    .aap-card-sub{font-size:.72rem;color:#6080a0;margin-top:3px}
    .aap-card.danger{border-color:#e05a5a}
    .aap-card.danger .aap-card-val{color:#e05a5a}
    .aap-card.warn{border-color:#e09a3a}
    .aap-card.warn .aap-card-val{color:#e09a3a}

    .aap-section{background:#111e30;border-radius:9px;padding:14px 16px;margin-bottom:12px}
    .aap-sec-title{font-size:.88rem;font-weight:700;color:#C9A84C;margin-bottom:10px}
    .aap-chart-wrap{height:220px;position:relative}

    .aap-tbl-wrap{overflow-x:auto}
    .aap-tbl{width:100%;border-collapse:collapse;font-size:.78rem}
    .aap-tbl th{background:#0D1F3C;color:#C9A84C;padding:7px 9px;text-align:right;
      cursor:pointer;white-space:nowrap;user-select:none;position:sticky;top:0}
    .aap-tbl th:hover{background:#162840;color:#e0b85a}
    .aap-tbl th.sorted-asc::after{content:' ▲';font-size:.65rem}
    .aap-tbl th.sorted-desc::after{content:' ▼';font-size:.65rem}
    .aap-tbl td{padding:6px 9px;border-bottom:1px solid #1a2d4a;color:#c0d0e0;white-space:nowrap}
    .aap-tbl tr:hover td{background:#162840}
    .aap-tbl .num{text-align:left;font-variant-numeric:tabular-nums}
    .aap-tbl .aged{color:#e05a5a;font-weight:600}
    .aap-badge-rel{background:#2a1a40;color:#c090e0;border:1px solid #5a3a80;
      border-radius:3px;font-size:.67rem;padding:1px 5px;margin-right:4px;white-space:nowrap}
    .aap-total-row td{font-weight:700;color:#C9A84C;background:#0D1F3C!important;
      border-top:2px solid #C9A84C}

    .aap-insights{background:#0d2010;border:1px solid #1a4020;border-radius:9px;
      padding:14px 16px;margin-bottom:12px}
    .aap-insight-item{display:flex;align-items:flex-start;gap:10px;padding:7px 0;
      border-bottom:1px solid #1a3020;font-size:.82rem;color:#a0c0a0}
    .aap-insight-item:last-child{border-bottom:none}
    .aap-insight-item.warn{color:#e09a3a}
    .aap-insight-item.danger{color:#e05a5a}
    .aap-insight-item.info{color:#6ab0d0}
    .aap-insight-icon{font-size:1rem;flex-shrink:0;margin-top:1px}

    .aap-attention{background:#111e30;border-radius:9px;padding:14px 16px;margin-bottom:12px}
    .aap-attn-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .aap-attn-box{background:#0D1F3C;border-radius:7px;padding:10px 13px}
    .aap-attn-title{font-size:.77rem;color:#8aa0bb;margin-bottom:5px}
    .aap-attn-val{font-size:1.1rem;font-weight:700;color:#C9A84C}
    .aap-attn-desc{font-size:.72rem;color:#506070;margin-top:3px}

    .aap-explain{border:1px solid #2a4060;border-radius:9px;margin-bottom:12px;overflow:hidden}
    .aap-explain summary{background:#0D1F3C;color:#C9A84C;padding:11px 16px;
      cursor:pointer;font-size:.85rem;font-weight:700;list-style:none}
    .aap-explain summary::-webkit-details-marker{display:none}
    .aap-explain-body{background:#111e30;padding:14px 18px;font-size:.8rem;
      color:#8aa0bb;line-height:1.7}
    .aap-explain-body p{margin:0 0 8px}
    .aap-explain-body strong{color:#C9A84C}
    .aap-recon{margin-top:10px;font-size:.75rem;background:#0D1F3C;border-radius:6px;
      padding:9px 12px;color:#6080a0}
    .aap-recon table{width:100%;border-collapse:collapse}
    .aap-recon td{padding:3px 6px;border-bottom:1px solid #1a2d4a}
    .aap-recon td:last-child{text-align:left;color:#a0b8c0}
    .aap-loading{text-align:center;padding:60px;color:#8aa0bb;font-size:.9rem}
    .aap-threshold-wrap{display:flex;align-items:center;gap:6px}
    .aap-threshold-sel{background:#1a2d4a;border:1px solid #2a4060;color:#c0d0e0;
      border-radius:5px;padding:3px 7px;font-size:.78rem;font-family:inherit}
  `;
  document.head.appendChild(s);
}

/* ── HTML Shell ──────────────────────────────────────────────────────────────── */
function _aapBuildShell() {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="aap-header">
    <div>
      <div class="aap-title">📋 إعمار أرصدة الموردين</div>
      <div class="aap-sub">FIFO · مقاصة عميل/مورد · أرقام صافية تطابق تقرير ميك سوفت · تحديث كل 10 دقائق</div>
    </div>
    <div id="aap-status" class="aap-status">جارٍ التحميل…</div>
  </div>

  <div class="aap-bar">
    <div style="display:flex;gap:6px">
      <button class="aap-db-btn active" data-aapdb="MekSoftDb1">أبعاد الحديد</button>
      <button class="aap-db-btn"        data-aapdb="MekSoftDb2">وسام الفولاذ</button>
    </div>
    <label class="aap-lbl">حتى تاريخ:</label>
    <input  id="aap-asof" type="date" class="aap-inp" value="${today}">
    <div class="aap-threshold-wrap">
      <label class="aap-lbl">عتبة التأخر:</label>
      <select id="aap-threshold" class="aap-threshold-sel">
        <option value="30">30 يوم+</option>
        <option value="60" selected>60 يوم+</option>
        <option value="90">90 يوم+</option>
      </select>
    </div>
    <button id="aap-refresh" class="aap-btn">↺ تحديث</button>
  </div>

  <div id="aap-cards"    class="aap-cards"></div>
  <div id="aap-insights" class="aap-insights" style="display:none"></div>
  <div id="aap-attention" class="aap-attention" style="display:none"></div>

  <div class="aap-section">
    <div class="aap-sec-title">📊 توزيع الأعمار</div>
    <div class="aap-chart-wrap"><canvas id="aap-chart"></canvas></div>
  </div>

  <div class="aap-section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="aap-sec-title" style="margin:0">🏢 تفصيل الموردين</div>
      <div style="font-size:.72rem;color:#6080a0">انقر على رأس العمود للترتيب</div>
    </div>
    <div class="aap-tbl-wrap">
      <table class="aap-tbl" id="aap-tbl">
        <thead><tr>
          <th data-col="name">المورّد</th>
          <th data-col="b1_7"     class="num">7-1 يوم</th>
          <th data-col="b8_14"    class="num">14-8 يوم</th>
          <th data-col="b15_30"   class="num">30-15 يوم</th>
          <th data-col="b31_60"   class="num">60-31 يوم</th>
          <th data-col="b61_90"   class="num">90-61 يوم</th>
          <th data-col="b91_120"  class="num">120-91 يوم</th>
          <th data-col="bOver120" class="num">&gt;120 يوم</th>
          <th data-col="balance"  class="num sorted-desc">الإجمالي</th>
          <th data-col="pct"      class="num">%</th>
        </tr></thead>
        <tbody id="aap-tbody"><tr><td colspan="10" class="aap-loading">جارٍ التحميل…</td></tr></tbody>
        <tfoot id="aap-tfoot"></tfoot>
      </table>
    </div>
  </div>

  <details class="aap-explain" id="aap-explain">
    <summary>▶ ما هذا التقرير؟ — إيضاح وتوجيهات</summary>
    <div class="aap-explain-body" id="aap-explain-body">
      <p>يوزّع <strong>إعمار الموردين</strong> ما تدين به الشركة لموردّيها حسب عمر الالتزام.
         يربط مباشرةً بالتدفق النقدي التنبؤي (متى تستحق الدفعات) وبالتفاوض مع الموردين (آجال أطول ترفع DPO وتحسّن دورة التحويل النقدي).</p>
      <p><strong>الأرقام صافية:</strong> طُبّقت المقاصة بين حساب المورّد وحساب العميل لنفس الكيان (رابط العميل/المورّد في ميك سوفت) — وهو نفس منطق تقرير «Supplier Balances Aging» المدمج.</p>
      <p><strong>الأرصدة المدينة</strong> (دفعات مقدمة تتجاوز الفواتير) هي أصل لا التزام — مستبعدة من الأعمار وظاهرة في لوحة «تستحق الانتباه».</p>
      <p><strong>الإجمالي هنا أصغر من رصيد ح.77+78 الكامل</strong> لأن الأخير يضمّ تمويلات مصرفية وأطرافاً مرتبطة ودفعات مقدمة —
         <a href="#" onclick="event.preventDefault();document.querySelector('.tab[data-tab=liabilities]')?.click()"
            style="color:#C9A84C;text-decoration:underline">انظر تاب تركيبة الالتزامات للصورة الكاملة</a>.</p>
      <p><strong>طرف ذو علاقة (Related):</strong> موردون يتطابق رقمهم الضريبي مع أحد العملاء في نفس الشركة — يشمل وسام الفولاذ في دفاتر أبعاد. الحصة التجارية الفعلية (Standalone) = الإجمالي − رصيد الطرف ذي العلاقة.</p>
      <div class="aap-recon" id="aap-recon-box"></div>
    </div>
  </details>
  `;
}

/* ── Wire Controls ───────────────────────────────────────────────────────────── */
function _aapWireControls(wrap) {
  wrap.querySelectorAll('.aap-db-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.aap-db-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _aapDb = btn.dataset.aapdb;
      _aapLoad();
    });
  });
  document.getElementById('aap-refresh')?.addEventListener('click', _aapLoad);
  document.getElementById('aap-asof')?.addEventListener('change', _aapLoad);
  document.getElementById('aap-threshold')?.addEventListener('change', () => {
    if (_aapData) _aapRenderAll(_aapData);
  });
  // Sort headers
  document.getElementById('aap-tbl')?.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_aapSort.col === col) _aapSort.dir *= -1;
      else { _aapSort.col = col; _aapSort.dir = -1; }
      if (_aapData) _aapRenderTable(_aapData);
    });
  });
}

/* ── Timer ───────────────────────────────────────────────────────────────────── */
function _aapStartTimer() {
  _aapStopTimer();
  _aapCountdown = AAP_REFRESH_SEC;
  _aapTimer = setInterval(() => {
    _aapCountdown--;
    _aapUpdateStatus();
    if (_aapCountdown <= 0 && _aapIsActive()) {
      _aapCountdown = AAP_REFRESH_SEC;
      _aapLoad();
    }
  }, 1000);
}

function _aapUpdateStatus(msg) {
  const el = document.getElementById('aap-status');
  if (!el) return;
  if (msg) { el.textContent = msg; return; }
  const mm = Math.floor(_aapCountdown / 60), ss = _aapCountdown % 60;
  el.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${mm}:${String(ss).padStart(2,'0')}`;
}

/* ── Data Load ───────────────────────────────────────────────────────────────── */
async function _aapLoad() {
  _aapUpdateStatus('جارٍ التحميل…');
  const asOf = document.getElementById('aap-asof')?.value || new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch(`/api/ap-aging?db=${_aapDb}&asOf=${asOf}`);
    if (!r.ok) throw new Error(await r.text());
    _aapData = await r.json();
    _aapRenderAll(_aapData);
    _aapCountdown = AAP_REFRESH_SEC;
    _aapUpdateStatus();
  } catch (e) {
    _aapUpdateStatus('⚠ خطأ: ' + e.message);
    const tbody = document.getElementById('aap-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#e05a5a;padding:30px;font-size:1.05em">⚠ فشل التحميل: ${e.message}</td></tr>`;
    const cards = document.getElementById('aap-cards');
    if (cards) cards.innerHTML = '';
    const insights = document.getElementById('aap-insights');
    if (insights) insights.innerHTML = '';
    const attention = document.getElementById('aap-attention');
    if (attention) attention.innerHTML = '';
  }
}

/* ── Render All ──────────────────────────────────────────────────────────────── */
function _aapRenderAll(d) {
  _aapRenderCards(d);
  _aapRenderInsights(d);
  _aapRenderAttention(d);
  _aapRenderChart(d);
  _aapRenderTable(d);
  _aapRenderExplain(d);
}

/* ── Cards ───────────────────────────────────────────────────────────────────── */
function _aapRenderCards(d) {
  const t = d.totals;
  const threshold = parseInt(document.getElementById('aap-threshold')?.value || '60', 10);

  // Weighted average age (bucket midpoints)
  const MID = { b1_7:4, b8_14:11, b15_30:22.5, b31_60:45.5, b61_90:75.5, b91_120:105.5, bOver120:150 };
  let weightedSum = 0;
  Object.keys(MID).forEach(k => { weightedSum += (t[k] || 0) * MID[k]; });
  const avgAge = t.balance > 0 ? weightedSum / t.balance : 0;

  // Late amount (beyond threshold days)
  let lateAmt = 0;
  if (threshold <= 30)  lateAmt = (t.b31_60||0) + (t.b61_90||0) + (t.b91_120||0) + (t.bOver120||0);
  else if (threshold <= 60) lateAmt = (t.b61_90||0) + (t.b91_120||0) + (t.bOver120||0);
  else lateAmt = (t.b91_120||0) + (t.bOver120||0);
  const latePct = t.balance > 0 ? (lateAmt / t.balance) * 100 : 0;

  // Largest supplier concentration
  const top = d.suppliers[0];
  const topPct = top && t.balance > 0 ? (top.balance / t.balance) * 100 : 0;

  // Related vs trade
  const relatedTotal = d.suppliers.filter(s => s.type === 'related').reduce((s, x) => s + x.balance, 0);
  const tradeTotal = t.balance - relatedTotal;

  const cards = [
    {
      label: 'إجمالي الأعمار (صافٍ)',
      val: aapFmt(t.balance),
      sub: `${t.count} مورّد · بعد المقاصة`,
      cls: '',
    },
    {
      label: `المتأخر (${threshold} يوم+)`,
      val: aapFmt(lateAmt),
      sub: `${aapFmt1(latePct)}% من الإجمالي`,
      cls: latePct > 50 ? 'danger' : latePct > 25 ? 'warn' : '',
    },
    {
      label: 'متوسط العمر المرجّح',
      val: aapFmt1(avgAge) + ' يوم',
      sub: 'مرجّح بالرصيد لكل شريحة',
      cls: avgAge > 60 ? 'danger' : avgAge > 30 ? 'warn' : '',
    },
    {
      label: 'أكبر تركّز',
      val: `${aapFmt1(topPct)}%`,
      sub: top ? top.name.slice(0, 22) : '—',
      cls: topPct > 50 ? 'danger' : topPct > 40 ? 'warn' : '',
    },
    {
      label: 'تجاري صافٍ (بدون أطراف)',
      val: aapFmt(tradeTotal),
      sub: relatedTotal > 0 ? `طرف علاقة: ${aapFmt(relatedTotal)}` : 'لا أطراف مرتبطة',
      cls: '',
    },
  ];

  document.getElementById('aap-cards').innerHTML = cards.map(c => `
    <div class="aap-card ${c.cls}">
      <div class="aap-card-label">${c.label}</div>
      <div class="aap-card-val">${c.val}</div>
      <div class="aap-card-sub">${c.sub}</div>
    </div>
  `).join('');
}

/* ── Insights ─────────────────────────────────────────────────────────────────── */
function _aapRenderInsights(d) {
  const el = document.getElementById('aap-insights');
  if (!el) return;
  const t = d.totals;
  const top = d.suppliers[0];
  const topPct = top && t.balance > 0 ? (top.balance / t.balance) * 100 : 0;
  const over90 = (t.b91_120 || 0) + (t.bOver120 || 0);
  const over90pct = t.balance > 0 ? (over90 / t.balance) * 100 : 0;
  const current = (t.b1_7 || 0) + (t.b8_14 || 0) + (t.b15_30 || 0);
  const currentPct = t.balance > 0 ? (current / t.balance) * 100 : 0;
  const relatedTotal = d.suppliers.filter(s => s.type === 'related').reduce((s, x) => s + x.balance, 0);

  const items = [];

  if (topPct > 40) {
    items.push({
      icon: '⚠',
      cls: 'danger',
      text: `تركّز مرتفع: ${top.name.slice(0, 25)} يمثّل ${aapFmt1(topPct)}% من إجمالي الأعمار (${aapFmt(top.balance)} ر.س). تنويع قاعدة الموردين يقلّل المخاطر.`,
    });
  }

  if (over90pct > 20) {
    items.push({
      icon: '🔴',
      cls: 'danger',
      text: `${aapFmt1(over90pct)}% من الأعمار (${aapFmt(over90)} ر.س) متقادمة فوق 90 يوماً — تحتاج إلى متابعة دفع فورية أو إعادة جدولة.`,
    });
  }

  if (currentPct > 60) {
    items.push({
      icon: '💡',
      cls: 'info',
      text: `${aapFmt1(currentPct)}% من الأعمار جارية (0-30 يوم). فرصة تفاوض على آجال أطول مع الموردين لرفع DPO وتحسين التدفق النقدي.`,
    });
  }

  if (relatedTotal > 0) {
    const relPct = t.balance > 0 ? (relatedTotal / t.balance) * 100 : 0;
    items.push({
      icon: '🔗',
      cls: relPct > 50 ? 'warn' : 'info',
      text: `${aapFmt1(relPct)}% من الأعمار (${aapFmt(relatedTotal)} ر.س) لصالح طرف ذي علاقة — يطابق رصيد الدائنين في تاب CCC. الموردون التجاريون المستقلون: ${aapFmt(t.balance - relatedTotal)} ر.س.`,
    });
  }

  if (t.debitCount > 0) {
    items.push({
      icon: '💰',
      cls: 'info',
      text: `${t.debitCount} مورّد بدفعات مقدمة (${aapFmt(t.debitTotal)} ر.س) — هذه أصول يحق للشركة استرداد بضائعها أو خصمها من فواتير مستقبلية.`,
    });
  }

  if (!items.length) {
    items.push({ icon: '✅', cls: '', text: 'الوضع ضمن النطاق الطبيعي — لا تنبيهات ضرورية.' });
  }

  el.style.display = '';
  el.innerHTML = `<div class="aap-sec-title">🔍 قراءة تحليلية</div>` +
    items.map(i => `
      <div class="aap-insight-item ${i.cls}">
        <span class="aap-insight-icon">${i.icon}</span>
        <span>${i.text}</span>
      </div>
    `).join('');
}

/* ── Attention Panel ─────────────────────────────────────────────────────────── */
function _aapRenderAttention(d) {
  const el = document.getElementById('aap-attention');
  if (!el) return;
  const t = d.totals;
  if (!t.debitCount && !t.nettingCount) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `
    <div class="aap-sec-title">👁 أرصدة تستحق الانتباه</div>
    <div class="aap-attn-grid">
      <div class="aap-attn-box">
        <div class="aap-attn-title">دفعات مقدمة (أرصدة مدينة)</div>
        <div class="aap-attn-val">${t.debitCount} مورّد · ${aapFmt(t.debitTotal)} ر.س</div>
        <div class="aap-attn-desc">دفعات تجاوزت الفواتير — أصل للشركة، مستبعد من الأعمار</div>
      </div>
      <div class="aap-attn-box">
        <div class="aap-attn-title">كيانات مزدوجة مُقاصَصة</div>
        <div class="aap-attn-val">${t.nettingCount} كيان</div>
        <div class="aap-attn-desc">موردون مرتبطون بعملاء — طُبّقت المقاصة لإظهار الصافي</div>
      </div>
    </div>
  `;
}

/* ── Chart ───────────────────────────────────────────────────────────────────── */
function _aapRenderChart(d) {
  const ctx = document.getElementById('aap-chart');
  if (!ctx) return;
  const t = d.totals;
  // 5-group chart for clarity
  const labels = ['0-30 يوم', '31-60 يوم', '61-90 يوم', '91-120 يوم', '>120 يوم'];
  const vals = [
    (t.b1_7 || 0) + (t.b8_14 || 0) + (t.b15_30 || 0),
    t.b31_60 || 0,
    t.b61_90 || 0,
    t.b91_120 || 0,
    t.bOver120 || 0,
  ];
  const colors = ['#4a9eda', '#C9A84C', '#e09a3a', '#e05a5a', '#b03030'];

  if (_aapChart) { _aapChart.destroy(); _aapChart = null; }
  if (typeof Chart === 'undefined') return;
  _aapChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'رصيد الموردين', data: vals, backgroundColor: colors }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => '  ' + aapFmt(ctx.parsed.y) + ' ر.س',
          },
        },
      },
      scales: {
        x: { ticks: { color: '#8aa0bb', font: { family: 'Cairo' } }, grid: { color: '#1a2d4a' } },
        y: { ticks: { color: '#8aa0bb', font: { family: 'Cairo' },
               callback: v => aapFmt(v) },
             grid: { color: '#1a2d4a' } },
      },
    },
  });
}

/* ── Table ───────────────────────────────────────────────────────────────────── */
function _aapRenderTable(d) {
  const tbody = document.getElementById('aap-tbody');
  const tfoot = document.getElementById('aap-tfoot');
  const tbl   = document.getElementById('aap-tbl');
  if (!tbody) return;

  // Update sort header indicators
  tbl?.querySelectorAll('th[data-col]').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.col === _aapSort.col) {
      th.classList.add(_aapSort.dir === 1 ? 'sorted-asc' : 'sorted-desc');
    }
  });

  const sorted2 = [...d.suppliers].sort((a, b) => {
    let av = _aapSort.col === 'name' ? a.name : (a[_aapSort.col] ?? 0);
    let bv = _aapSort.col === 'name' ? b.name : (b[_aapSort.col] ?? 0);
    if (typeof av === 'string') {
      return _aapSort.dir === 1 ? av.localeCompare(bv, 'ar') : bv.localeCompare(av, 'ar');
    }
    return _aapSort.dir === 1 ? (+av - +bv) : (+bv - +av);
  });

  const t = d.totals;
  const totalRow = {
    b1_7: t.b1_7, b8_14: t.b8_14, b15_30: t.b15_30,
    b31_60: t.b31_60, b61_90: t.b61_90, b91_120: t.b91_120, bOver120: t.bOver120,
    balance: t.balance,
  };

  const cell = (v, cls = '') => {
    const n = +v || 0;
    return `<td class="num ${cls}">${n > 0.5 ? aapFmt(n) : '—'}</td>`;
  };

  tbody.innerHTML = sorted2.map(s => {
    const isRelated = s.type === 'related';
    const badge = isRelated ? `<span class="aap-badge-rel">طرف علاقة</span>` : '';
    const pct = t.balance > 0 ? (s.balance / t.balance * 100) : 0;
    const over91 = (s.b91_120 || 0) + (s.bOver120 || 0);
    return `<tr>
      <td>${badge}${aapEsc(s.name)}</td>
      ${cell(s.b1_7)}
      ${cell(s.b8_14)}
      ${cell(s.b15_30)}
      ${cell(s.b31_60)}
      ${cell(s.b61_90)}
      ${cell(s.b91_120, over91 > 0.5 ? 'aged' : '')}
      ${cell(s.bOver120, over91 > 0.5 ? 'aged' : '')}
      <td class="num" style="font-weight:600;color:#C9A84C">${aapFmt(s.balance)}</td>
      <td class="num">${aapFmt1(pct)}%</td>
    </tr>`;
  }).join('');

  tfoot.innerHTML = `<tr class="aap-total-row">
    <td>الإجمالي (${t.count} مورّد)</td>
    ${cell(totalRow.b1_7)}
    ${cell(totalRow.b8_14)}
    ${cell(totalRow.b15_30)}
    ${cell(totalRow.b31_60)}
    ${cell(totalRow.b61_90)}
    ${cell(totalRow.b91_120, 'aged')}
    ${cell(totalRow.bOver120, 'aged')}
    <td class="num" style="font-weight:700">${aapFmt(totalRow.balance)}</td>
    <td class="num">100%</td>
  </tr>`;
}

/* ── Explain / Reconciliation ─────────────────────────────────────────────────── */
function _aapRenderExplain(d) {
  const box = document.getElementById('aap-recon-box');
  if (!box) return;
  const t = d.totals;
  const relatedTotal = d.suppliers.filter(s => s.type === 'related').reduce((s, x) => s + x.balance, 0);
  const tradeTotal = t.balance - relatedTotal;

  box.innerHTML = `
    <div style="color:#C9A84C;margin-bottom:5px;font-weight:600">جدول التسوية</div>
    <table>
      <tr><td>إجمالي الأعمار الصافي</td><td>${aapFmt(t.balance)} ر.س</td></tr>
      <tr><td>— منه أطراف ذات علاقة</td><td>${aapFmt(relatedTotal)} ر.س</td></tr>
      <tr><td>— منه تجاري مستقل</td><td>${aapFmt(tradeTotal)} ر.س</td></tr>
      ${t.debitTotal > 0 ? `<tr><td>دفعات مقدمة (مستبعدة)</td><td>${aapFmt(t.debitTotal)} ر.س</td></tr>` : ''}
      ${t.nettingCount > 0 ? `<tr><td>كيانات طُبّقت عليها المقاصة</td><td>${t.nettingCount} كيان</td></tr>` : ''}
      <tr><td>ملاحظة: ح.77+78 الكامل يشمل تمويلات وأطرافاً لا تظهر هنا</td><td>—</td></tr>
    </table>
  `;
}
