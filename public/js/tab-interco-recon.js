'use strict';
/* ── Tab: التسوية البينية أبعاد ↔ وسام ──────────────────────────── */

const IC_CSS = `
<style id="ic-style">
#tab-interco-recon{font-family:'Cairo','Tajawal',sans-serif;direction:rtl;padding:18px;color:#e8e0cc}
.ic-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.ic-title{font-size:1.25rem;font-weight:700;color:#C9A84C;letter-spacing:.3px}
.ic-meta{font-size:.78rem;color:#7a8fa6}
.ic-refresh{background:#13284a;border:1px solid #C9A84C44;color:#C9A84C;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:.8rem}
.ic-refresh:hover{background:#1d3a5c}

/* Status banner */
.ic-status{border-radius:10px;padding:14px 22px;display:flex;align-items:center;gap:14px;margin-bottom:16px;font-size:1rem;font-weight:600}
.ic-status.matched{background:#0d2b1a;border:1.5px solid #3ab36a}
.ic-status.gap   {background:#2b0d0d;border:1.5px solid #da4a4a}
.ic-status-icon {font-size:2rem;line-height:1}
.ic-status-txt  {display:flex;flex-direction:column;gap:2px}
.ic-status-lbl  {font-size:1.05rem}
.ic-status-sub  {font-size:.82rem;color:#a0bcd0;font-weight:400}

/* Balance grid */
.ic-bal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.ic-bal-card{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:14px 18px}
.ic-bal-card-title{font-size:.82rem;color:#C9A84C;font-weight:700;margin-bottom:10px;border-bottom:1px solid #1e3a5a;padding-bottom:6px}
.ic-bal-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:.85rem}
.ic-bal-row+.ic-bal-row{border-top:1px solid #1a3050}
.ic-bal-row.net{font-weight:700;font-size:.95rem;color:#C9A84C;border-top:2px solid #C9A84C44;margin-top:4px;padding-top:6px}
.ic-bal-lbl{color:#9ab0c4}
.ic-bal-val{font-variant-numeric:tabular-nums}
.ic-val-pos{color:#4ada8e}
.ic-val-neg{color:#ff7a7a}
.ic-val-neu{color:#e8e0cc}

/* Reconciliation table */
.ic-rec-wrap{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:16px 20px;margin-bottom:14px}
.ic-rec-title{font-size:.88rem;font-weight:700;color:#C9A84C;margin-bottom:10px}
.ic-rec-row{display:flex;justify-content:space-between;align-items:center;padding:5px 8px;font-size:.85rem;border-radius:5px}
.ic-rec-row:nth-child(odd){background:#0d1c30}
.ic-rec-row.total{font-weight:700;background:#0d2035;border:1px solid #C9A84C44;color:#C9A84C;margin-top:4px}
.ic-rec-row.gap-row{font-weight:700;margin-top:6px;border-top:2px solid #2a4060;padding-top:8px}
.ic-rec-row.gap-row.ok{color:#4ada8e}
.ic-rec-row.gap-row.bad{color:#ff7a7a}
.ic-rec-indent{padding-right:16px;color:#7a9ab0;font-size:.82rem}

/* VAT cross-check */
.ic-vat-wrap{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:12px 18px;margin-bottom:14px}
.ic-vat-title{font-size:.82rem;font-weight:700;color:#C9A84C;margin-bottom:8px}
.ic-vat-row{display:flex;gap:18px;align-items:center;flex-wrap:wrap;font-size:.82rem;padding:4px 0}
.ic-vat-row+.ic-vat-row{border-top:1px solid #1a3050}
.ic-vat-seg{display:flex;align-items:center;gap:6px}
.ic-vat-seg span{color:#9ab0c4}
.ic-vat-ok {color:#4ada8e}
.ic-vat-warn{color:#e0b030}

/* Cash flow section */
.ic-cf-wrap{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.ic-cf-card{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:14px 18px}
.ic-cf-title{font-size:.82rem;color:#C9A84C;font-weight:700;margin-bottom:8px}
.ic-cf-row{display:flex;justify-content:space-between;font-size:.83rem;padding:3px 0;border-top:1px solid #1a3050}
.ic-cf-row:first-of-type{border-top:none}

/* Direction tabs */
.ic-dir-tabs{display:flex;gap:8px;margin-bottom:10px}
.ic-dir-tab{padding:5px 18px;border-radius:20px;border:1px solid #2a4060;background:#0d1c30;color:#9ab0c4;cursor:pointer;font-size:.82rem}
.ic-dir-tab.active{background:#1d3a5c;border-color:#C9A84C;color:#C9A84C;font-weight:700}

/* Transaction table */
.ic-tx-wrap{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;margin-bottom:14px;overflow:hidden}
.ic-tx-title{font-size:.82rem;font-weight:700;color:#C9A84C;padding:10px 16px;border-bottom:1px solid #1e3a5a;display:flex;justify-content:space-between;align-items:center}
.ic-tx-summary{font-size:.78rem;color:#7a9ab0;font-weight:400}
.ic-tx-table{width:100%;border-collapse:collapse;font-size:.8rem}
.ic-tx-table th{background:#0d1c30;padding:7px 10px;text-align:right;color:#9ab0c4;font-weight:600;border-bottom:1px solid #1e3a5a;position:sticky;top:0}
.ic-tx-table td{padding:6px 10px;border-bottom:1px solid #12243a;vertical-align:middle}
.ic-tx-table tr:last-child td{border-bottom:none}
.ic-tx-table tr.ic-matched{background:#0d2418}
.ic-tx-table tr.ic-aonly  {background:#1c1008}
.ic-tx-table tr.ic-bonly  {background:#080e1c}
.ic-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.72rem;font-weight:700}
.ic-badge-matched{background:#0d4a2a;color:#4ada8e;border:1px solid #3ab36a44}
.ic-badge-aonly  {background:#3a1a08;color:#e08030;border:1px solid #e0803044}
.ic-badge-bonly  {background:#080e24;color:#6090e0;border:1px solid #6090e044}
.ic-diff-pos{color:#ff7a7a}
.ic-diff-neg{color:#6090e0}
.ic-diff-zero{color:#4ada8e}

/* Methodology card */
.ic-meth{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;margin-bottom:14px}
.ic-meth-hdr{padding:10px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;color:#C9A84C;font-size:.85rem;font-weight:700}
.ic-meth-body{padding:0 16px 14px;font-size:.8rem;color:#9ab0c4;line-height:1.7;display:none}
.ic-meth-body.open{display:block}
.ic-meth-body p{margin:6px 0}
.ic-meth-body strong{color:#C9A84C}

/* Responsive */
@media(max-width:640px){
  .ic-bal-grid,.ic-cf-wrap{grid-template-columns:1fr}
}
</style>
`;

let _icData   = null;
let _icDir    = 'A';  // 'A' or 'B'
let _icRefCnt = 0;
let _icLoading = false;

function _fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return Math.abs(n).toLocaleString('ar-SA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function _fmtSigned(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  const s = n < 0 ? '-' : '+';
  return s + _fmt(n, decimals);
}
function _cls(n)  { return n > 0 ? 'ic-val-pos' : n < 0 ? 'ic-val-neg' : 'ic-val-neu'; }

function _renderKPIs(d) {
  const gap    = d.gap;
  const isOk   = d.status === 'matched';
  const gapLbl = isOk
    ? `الفجوة ${_fmt(d.gapAbs, 2)} ر.س — أقل من الحد المقبول 5,000 ر.س`
    : `الفجوة ${_fmt(d.gapAbs, 0)} ر.س — تحتاج مراجعة`;

  return `
  <div class="ic-status ${d.status}">
    <div class="ic-status-icon">${isOk ? '✅' : '🔴'}</div>
    <div class="ic-status-txt">
      <div class="ic-status-lbl">${isOk ? 'الأرصدة متطابقة' : 'توجد فجوة تستلزم تسوية'}</div>
      <div class="ic-status-sub">${gapLbl} · بيانات حتى ${d.asOf}</div>
    </div>
  </div>

  <div class="ic-bal-grid">
    ${_balCard(d.db1)}
    ${_balCard(d.db2)}
  </div>

  ${_recTable(d)}
  ${_vatCheck(d)}
  ${_cfGrid(d)}
  `;
}

function _balCard(db) {
  const netCls = _cls(db.net);
  return `
  <div class="ic-bal-card">
    <div class="ic-bal-card-title">${db.name}</div>
    <div class="ic-bal-row">
      <span class="ic-bal-lbl">ذمم مدينة — ح.47</span>
      <span class="ic-bal-val ic-val-pos">${_fmt(db.ar, 0)} ر.س</span>
    </div>
    <div class="ic-bal-row">
      <span class="ic-bal-lbl">ذمم دائنة — ح.77/78</span>
      <span class="ic-bal-val ic-val-neg">(${_fmt(db.ap, 0)}) ر.س</span>
    </div>
    <div class="ic-bal-row net">
      <span class="ic-bal-lbl">الصافي</span>
      <span class="ic-bal-val ${netCls}">${_fmtSigned(db.net, 0)} ر.س</span>
    </div>
  </div>`;
}

function _recTable(d) {
  const db1 = d.db1, db2 = d.db2;
  // reconciliation: db1.net + db2.net = gap
  // Show: DB1 net → adjustments conceptual → expected = -db1.net → actual db2.net → residual
  const expected   = -db1.net;
  const residual   = parseFloat((db2.net - expected).toFixed(2));
  const resCls     = Math.abs(residual) < 5000 ? 'ok' : 'bad';

  return `
  <div class="ic-rec-wrap">
    <div class="ic-rec-title">جدول التسوية — نمط كشف بنكي</div>
    <div class="ic-rec-row"><span>صافي أبعاد (AR وسام − AP وسام)</span>
      <span class="${_cls(db1.net)}">${_fmtSigned(db1.net, 2)} ر.س</span></div>
    <div class="ic-rec-row ic-rec-indent"><span>الاتجاه أ: مبيعات غير مقابَلة (أبعاد فقط)</span>
      <span class="ic-val-neg">−${_fmt(_sumStatus(d.dirA,'aonly'), 0)} ر.س</span></div>
    <div class="ic-rec-row ic-rec-indent"><span>الاتجاه أ: مشتريات غير مقابَلة (وسام فقط)</span>
      <span class="ic-val-pos">+${_fmt(_sumStatus(d.dirA,'bonly'), 0)} ر.س</span></div>
    <div class="ic-rec-row ic-rec-indent"><span>الاتجاه ب: مشتريات غير مقابَلة (أبعاد فقط)</span>
      <span class="ic-val-pos">+${_fmt(_sumStatus(d.dirB,'bonly'), 0)} ر.س</span></div>
    <div class="ic-rec-row ic-rec-indent"><span>الاتجاه ب: مبيعات غير مقابَلة (وسام فقط)</span>
      <span class="ic-val-neg">−${_fmt(_sumStatus(d.dirB,'aonly'), 0)} ر.س</span></div>
    <div class="ic-rec-row total"><span>صافي وسام المتوقَّع (= −صافي أبعاد)</span>
      <span>${_fmtSigned(expected, 2)} ر.س</span></div>
    <div class="ic-rec-row"><span>صافي وسام الفعلي (AR أبعاد − AP أبعاد)</span>
      <span class="${_cls(db2.net)}">${_fmtSigned(db2.net, 2)} ر.س</span></div>
    <div class="ic-rec-row gap-row ${resCls}">
      <span>الفجوة المتبقية</span>
      <span>${_fmtSigned(d.gap, 2)} ر.س ${Math.abs(d.gap) < 5000 ? '✅' : '⚠️'}</span>
    </div>
  </div>`;
}

function _sumStatus(dir, status) {
  return dir.transactions
    .filter(r => r.status === status)
    .reduce((s, r) => s + Math.abs(r.amtA || r.amtB || 0), 0);
}

function _vatCheck(d) {
  const gapA = parseFloat((d.db1.vat88 - d.db2.vat64).toFixed(2));
  const gapB = parseFloat((d.db2.vat88 - d.db1.vat64).toFixed(2));
  const clsA = Math.abs(gapA) < 5 ? 'ic-vat-ok' : 'ic-vat-warn';
  const clsB = Math.abs(gapB) < 5 ? 'ic-vat-ok' : 'ic-vat-warn';

  return `
  <div class="ic-vat-wrap">
    <div class="ic-vat-title">فحص ضريبة القيمة المضافة</div>
    <div class="ic-vat-row">
      <div class="ic-vat-seg"><span>أبعاد ح.88 مبيعات:</span> <b>${_fmt(d.db1.vat88, 2)}</b></div>
      <div class="ic-vat-seg"><span>وسام ح.64 مشتريات:</span> <b>${_fmt(d.db2.vat64, 2)}</b></div>
      <div class="ic-vat-seg">فرق: <span class="${clsA}">${_fmtSigned(gapA, 2)} ر.س</span></div>
    </div>
    <div class="ic-vat-row">
      <div class="ic-vat-seg"><span>وسام ح.88 مبيعات:</span> <b>${_fmt(d.db2.vat88, 2)}</b></div>
      <div class="ic-vat-seg"><span>أبعاد ح.64 مشتريات:</span> <b>${_fmt(d.db1.vat64, 2)}</b></div>
      <div class="ic-vat-seg">فرق: <span class="${clsB}">${_fmtSigned(gapB, 2)} ر.س</span></div>
    </div>
  </div>`;
}

function _cfGrid(d) {
  const { db1, db2 } = d;
  return `
  <div class="ic-cf-wrap">
    <div class="ic-cf-card">
      <div class="ic-cf-title">التدفقات النقدية — أبعاد ↔ وسام</div>
      <div class="ic-cf-row"><span class="ic-bal-lbl">تحصيل من وسام</span><span class="ic-val-pos">${_fmt(db1.receipts, 0)} ر.س</span></div>
      <div class="ic-cf-row"><span class="ic-bal-lbl">مدفوعات لوسام</span><span class="ic-val-neg">(${_fmt(db1.payments, 0)}) ر.س</span></div>
      <div class="ic-cf-row" style="font-weight:700;color:#C9A84C;border-top:1px solid #C9A84C44;margin-top:4px;padding-top:4px">
        <span>الصافي النقدي (أبعاد)</span>
        <span class="${_cls(db1.receipts - db1.payments)}">${_fmtSigned(db1.receipts - db1.payments, 0)} ر.س</span>
      </div>
    </div>
    <div class="ic-cf-card">
      <div class="ic-cf-title">التدفقات النقدية — وسام ↔ أبعاد</div>
      <div class="ic-cf-row"><span class="ic-bal-lbl">تحصيل من أبعاد</span><span class="ic-val-pos">${_fmt(db2.receipts, 0)} ر.س</span></div>
      <div class="ic-cf-row"><span class="ic-bal-lbl">مدفوعات لأبعاد</span><span class="ic-val-neg">(${_fmt(db2.payments, 0)}) ر.س</span></div>
      <div class="ic-cf-row" style="font-weight:700;color:#C9A84C;border-top:1px solid #C9A84C44;margin-top:4px;padding-top:4px">
        <span>الصافي النقدي (وسام)</span>
        <span class="${_cls(db2.receipts - db2.payments)}">${_fmtSigned(db2.receipts - db2.payments, 0)} ر.س</span>
      </div>
    </div>
  </div>`;
}

function _renderDirTabs() {
  return `
  <div class="ic-dir-tabs">
    <button class="ic-dir-tab ${_icDir === 'A' ? 'active' : ''}" onclick="icSetDir('A')">
      الاتجاه أ — أبعاد → وسام (مبيعات/مشتريات)
    </button>
    <button class="ic-dir-tab ${_icDir === 'B' ? 'active' : ''}" onclick="icSetDir('B')">
      الاتجاه ب — وسام → أبعاد (مبيعات/مشتريات)
    </button>
  </div>`;
}

function _renderTxTable(dir, labelA, labelB) {
  const txs = dir.transactions;
  if (!txs.length) return `<div style="color:#5a7090;padding:10px">لا توجد حركات في هذا الاتجاه للفترة المحددة</div>`;

  const matched  = txs.filter(r => r.status === 'matched').length;
  const unmatched = txs.length - matched;

  const rows = txs.map(r => {
    const trCls = r.status === 'matched' ? 'ic-matched' : r.status === 'aonly' ? 'ic-aonly' : 'ic-bonly';
    const badge = r.status === 'matched'
      ? `<span class="ic-badge ic-badge-matched">✅ متطابقة</span>`
      : r.status === 'aonly'
        ? `<span class="ic-badge ic-badge-aonly">🔴 ${labelA} فقط</span>`
        : `<span class="ic-badge ic-badge-bonly">🔵 ${labelB} فقط</span>`;
    const diffCls = r.diff > 0.01 ? 'ic-diff-pos' : r.diff < -0.01 ? 'ic-diff-neg' : 'ic-diff-zero';
    return `<tr class="${trCls}">
      <td>${r.txDateA || '—'}</td>
      <td>${r.refA   || '—'}</td>
      <td style="text-align:left">${r.amtA != null ? _fmt(r.amtA, 2) : '—'}</td>
      <td>${r.txDateB || '—'}</td>
      <td>${r.refB   || '—'}</td>
      <td style="text-align:left">${r.amtB != null ? _fmt(r.amtB, 2) : '—'}</td>
      <td style="text-align:left" class="${diffCls}">${r.diff !== 0 ? _fmtSigned(r.diff, 2) : '✓'}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  return `
  <div class="ic-tx-wrap">
    <div class="ic-tx-title">
      <span>جدول المطابقة — ${dir.label}</span>
      <span class="ic-tx-summary">${matched} متطابقة · ${unmatched} غير متطابقة · إجمالي ${txs.length} حركة</span>
    </div>
    <div style="overflow-x:auto">
    <table class="ic-tx-table">
      <thead><tr>
        <th>تاريخ أبعاد</th><th>مرجع أبعاد</th><th>مبلغ أبعاد</th>
        <th>تاريخ وسام</th><th>مرجع وسام</th><th>مبلغ وسام</th>
        <th>الفرق</th><th>الحالة</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}

function _renderMeth() {
  return `
  <div class="ic-meth">
    <div class="ic-meth-hdr" onclick="icToggleMeth(this)">
      <span>📖 منهجية التسوية البينية</span><span>▼</span>
    </div>
    <div class="ic-meth-body">
      <p><strong>الهدف:</strong> التحقق من تطابق أرصدة المعاملات البينية بين أبعاد الحديد (DB1) ووسام الفولاذ (DB2).</p>
      <p><strong>قاعدة الهوية:</strong> صافي أبعاد (AR وسام − AP وسام) + صافي وسام (AR أبعاد − AP أبعاد) = 0 في حالة التطابق التام.</p>
      <p><strong>مطابقة الحركات:</strong> تتم مطابقة فواتير البيع (DB1) مع فواتير الشراء (DB2) بالمبلغ (تسامح ±0.5 ر.س) والتاريخ (±30 يوماً). DB1 يستخدم «افتراضي» كرقم مرجعي لفواتير البيع، لذا تعتمد المطابقة على المبلغ والتاريخ فقط.</p>
      <p><strong>تصنيف الحركات:</strong> ✅ متطابقة — مسجَّلة في كلا الدفترين بنفس المبلغ تقريباً. 🔴 في أبعاد فقط — قد تكون توقيتاً أو فاتورة لم تُسجَّل بعد في وسام. 🔵 في وسام فقط — فاتورة في وسام لم تُقابَل في أبعاد.</p>
      <p><strong>فحص الضريبة:</strong> ح.88 (ضريبة المبيعات) في أبعاد يجب أن يساوي ح.64 (ضريبة المشتريات) في وسام والعكس. فرق أقل من 5 ر.س مقبول (تقريب).</p>
      <p><strong>فجوة 620K السابقة:</strong> كانت ناتجة عن فواتير شراء جديدة في DB1 (AP أبعاد → وسام) أُضيفت لاحقاً فرفعت رصيد الذمم الدائنة من 20.34M إلى 20.96M، ليتقلص الفرق إلى 1,156 ر.س.</p>
    </div>
  </div>`;
}

function _renderIntercoReconContent(d) {
  return `
  ${IC_CSS}
  <div class="ic-hdr">
    <div class="ic-title">التسوية البينية — أبعاد ↔ وسام</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="ic-meta">آخر تحديث: ${d.asOf} · عداد التحديث: ${_icRefCnt}</span>
      <button class="ic-refresh" onclick="renderIntercoRecon()">⟳ تحديث</button>
    </div>
  </div>
  ${_renderKPIs(d)}
  ${_renderDirTabs()}
  ${_icDir === 'A'
    ? _renderTxTable(d.dirA, 'أبعاد', 'وسام')
    : _renderTxTable(d.dirB, 'وسام', 'أبعاد')}
  ${_renderMeth()}
  `;
}

function icSetDir(dir) {
  _icDir = dir;
  if (_icData) {
    document.getElementById('tab-interco-recon').innerHTML = _renderIntercoReconContent(_icData);
  }
}

function icToggleMeth(hdr) {
  const body = hdr.nextElementSibling;
  body.classList.toggle('open');
  hdr.querySelector('span:last-child').textContent = body.classList.contains('open') ? '▲' : '▼';
}

async function renderIntercoRecon() {
  if (_icLoading) return;
  _icLoading = true;
  const wrap = document.getElementById('tab-interco-recon');
  if (!wrap) { _icLoading = false; return; }

  if (!_icData) {
    wrap.innerHTML = IC_CSS + `<div style="color:#9ab0c4;padding:20px;text-align:center">⏳ جارٍ تحميل بيانات التسوية...</div>`;
  }

  try {
    const r = await fetch('/api/interco-recon');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _icData = await r.json();
    _icRefCnt++;
    wrap.innerHTML = _renderIntercoReconContent(_icData);
  } catch (e) {
    console.error('[interco-recon]', e);
    wrap.innerHTML = IC_CSS + `<div style="color:#ff7a7a;padding:20px">خطأ في تحميل البيانات: ${e.message}</div>`;
  } finally {
    _icLoading = false;
  }
}
