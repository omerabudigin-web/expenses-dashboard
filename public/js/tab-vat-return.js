/* إقرار القيمة المضافة — VAT Return tab  v4.1
   أبعاد: شهري | وسام: ربع سنوي — كل شركة مستقلة */
'use strict';

const VR_VERSION     = 'v4.1';
const VR_REFRESH_SEC = 120;

// ── per-company state ─────────────────────────────────────────────────────────
const VR = {
  abaad:  { data: null, from: '', to: '', loading: false,
            adj: { r5_base:0, r5_vat:0, r8_base:0, r8_vat:0, r10_base:0, r10_vat:0, r14_vat:0 } },
  wissam: { data: null, from: '', to: '', loading: false,
            adj: { r5_base:0, r5_vat:0, r8_base:0, r8_vat:0, r10_base:0, r10_vat:0, r14_vat:0 } },
};
let _vrTimer    = null;
let _vrRendered = false;

// ── date helpers ──────────────────────────────────────────────────────────────
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function _vrPad(n) { return String(n).padStart(2, '0'); }
function _vrMonthEnd(y, m) { return new Date(y, m, 0).getDate(); }

function _vrMonthRange(y, m) {
  return { from: `${y}-${_vrPad(m)}-01`, to: `${y}-${_vrPad(m)}-${_vrPad(_vrMonthEnd(y, m))}` };
}
function _vrQRange(y, q) {
  const s = ['01-01','04-01','07-01','10-01'];
  const e = ['03-31','06-30','09-30','12-31'];
  return { from: `${y}-${s[q-1]}`, to: `${y}-${e[q-1]}` };
}

function _vrGenMonths(start) {
  const out = [], d = new Date(start), now = new Date();
  d.setDate(1);
  while (d <= now) { out.push({ y: d.getFullYear(), m: d.getMonth()+1 }); d.setMonth(d.getMonth()+1); }
  return out.reverse();
}
function _vrGenQuarters(start) {
  const out = [], now = new Date();
  let y = new Date(start).getFullYear(), q = Math.ceil((new Date(start).getMonth()+1)/3);
  while (true) {
    out.push({ y, q });
    q++; if (q > 4) { q = 1; y++; }
    if (new Date(_vrQRange(y, q).from) > now) break;
  }
  return out.reverse();
}

function _vrFmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const VR_CSS = `<style>
.vr-wrap{font-family:'Cairo','Tajawal',sans-serif;direction:rtl;color:#e8eaf0;background:#0b1627;min-height:100vh;padding:0 0 60px}
.vr-hdr{background:#142446;padding:14px 22px 10px;border-bottom:2px solid #C6A04A;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px}
.vr-hdr-title{font-size:1.15rem;font-weight:700;color:#C6A04A}
.vr-hdr-sub{font-size:.72rem;color:#8892a8;margin-top:2px}
.vr-status{font-size:.72rem;color:#7a9cc9;margin-top:3px}
.vr-hdr-btns{display:flex;gap:8px;align-items:center}
.vr-btn{background:#1e3060;color:#C6A04A;border:1px solid #C6A04A;border-radius:5px;padding:5px 13px;font-size:.78rem;cursor:pointer;font-family:inherit;transition:.15s;white-space:nowrap}
.vr-btn:hover{background:#C6A04A;color:#0b1627}
.vr-btn-sm{padding:4px 10px;font-size:.72rem}
.vr-btn-print{background:#1a2e50}
.vr-btn-excel{background:#1a3a1a;border-color:#4caf50;color:#4caf50}
.vr-btn-excel:hover{background:#4caf50;color:#0b1627}
.vr-panels{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid #1e3060}
@media(max-width:1080px){.vr-panels{grid-template-columns:1fr}}
.vr-panel{padding:16px 18px 20px;border-left:1px solid #1e3060}
.vr-panel:last-child{border-left:none}
.vr-panel-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #C6A04A44}
.vr-panel-title{font-size:.98rem;font-weight:700;color:#C6A04A}
.vr-panel-period{font-size:.7rem;color:#7a9cc9;margin-top:2px}
.vr-panel-btns{display:flex;gap:6px}
.vr-period-bar{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px;align-items:center}
.vr-psel{background:#1a2e50;color:#e8eaf0;border:1px solid #2a4070;border-radius:5px;padding:5px 9px;font-size:.78rem;font-family:inherit;outline:none;direction:ltr;max-width:200px}
.vr-psel:focus{border-color:#C6A04A}
.vr-date-inp{background:#1a2e50;color:#e8eaf0;border:1px solid #2a4070;border-radius:5px;padding:5px 8px;font-size:.75rem;font-family:inherit;direction:ltr;outline:none;width:120px}
.vr-date-inp:focus{border-color:#C6A04A}
.vr-lbl-s{font-size:.7rem;color:#7a9cc9;align-self:center}
.vr-sec{font-size:.72rem;font-weight:700;color:#8892a8;margin:12px 0 4px;letter-spacing:.3px}
.vr-tbl{width:100%;border-collapse:collapse;font-size:.78rem}
.vr-tbl th{background:#142446;color:#C6A04A;padding:6px 9px;text-align:right;font-weight:600;border:1px solid #1e3060;font-size:.7rem}
.vr-tbl td{padding:6px 9px;border:1px solid #1a2e50}
.vr-tbl tr:nth-child(even) td{background:#0d1d36}
.vr-tbl tr:nth-child(odd)  td{background:#0b1627}
.cn{text-align:left;font-variant-numeric:tabular-nums;direction:ltr;white-space:nowrap}
.cr{text-align:center;color:#8892a8;font-size:.7rem}
.rn{color:#C6A04A33;font-size:.68rem;width:20px}
.vr-adj{background:transparent;color:#e8eaf0;border:1px solid #C6A04A55;border-radius:3px;padding:2px 5px;font-size:.74rem;font-family:inherit;direction:ltr;text-align:left;outline:none}
.vr-adj:focus{border-color:#C6A04A;background:#1a2e50}
.rs td{background:#142446!important;font-weight:600;color:#e8eaf0}
.r12 td{background:#1a2e50!important;color:#b0c4e8;font-weight:600}
.r13 td{background:#152040!important;color:#b0c4e8;font-weight:600}
.rnet td{background:#C6A04A!important;color:#0b1627!important;font-weight:800}
.rstat td{background:#0f1e3a!important}
.pay{color:#ff7043;font-weight:700}.ref_{color:#66bb6a;font-weight:700}
.vr-ref{background:#0a1830;border:1px solid #1e3060;border-radius:5px;padding:10px 13px;margin-top:12px;font-size:.72rem}
.vr-ref-ttl{color:#C6A04A;font-weight:700;margin-bottom:7px}
.vr-ref-g{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}
.vr-ref-r{display:flex;justify-content:space-between;gap:6px}
.vr-ref-lbl{color:#4a6080}
.vr-ref-val{color:#b0c4e8;font-variant-numeric:tabular-nums;direction:ltr;text-align:left}
.vr-ref-hi{color:#C6A04A;font-weight:700}
.vr-summary{background:#142446;border-top:2px solid #C6A04A44;padding:12px 22px;display:flex;gap:20px;flex-wrap:wrap}
.vr-sum-lbl{font-size:.68rem;color:#7a9cc9}
.vr-sum-val{font-size:.9rem;font-weight:700;color:#e8eaf0;direction:ltr;display:block}
.vr-sum-val.pay{color:#ff7043}.vr-sum-val.ref_{color:#66bb6a}
.vr-loading{text-align:center;padding:40px;color:#7a9cc9;font-size:.85rem}
.vr-footer{text-align:center;margin-top:22px;color:#4a6080;font-size:.7rem}
@media print{
  .vr-hdr-btns,.vr-period-bar,.vr-panel-btns,.vr-summary,.vr-footer{display:none!important}
  .vr-panels{grid-template-columns:1fr!important}
  .vr-print-hide{display:none!important}
  .vr-panel{border:none!important;padding:8px 0!important}
  .vr-wrap{background:#fff!important;color:#000!important}
  .vr-hdr{background:#fff!important;border-bottom:2px solid #C6A04A}
  .vr-hdr-title{color:#000!important}
  .vr-tbl th{background:#f0f0f0!important;color:#000!important}
  .vr-tbl td{background:#fff!important;color:#000!important;border-color:#ccc!important}
  .rnet td{background:#C6A04A!important;color:#000!important}
  .vr-ref{background:#f9f9f9!important;border-color:#ccc!important}
}
</style>`;

// ── shell HTML (no inline handlers) ───────────────────────────────────────────
function _vrBuildShell(startDate) {
  const months   = _vrGenMonths(startDate);
  const quarters = _vrGenQuarters(startDate);

  const mOpts = months.map(({ y, m }) => {
    const r = _vrMonthRange(y, m);
    return `<option value="${r.from}|${r.to}">${AR_MONTHS[m-1]} ${y}</option>`;
  }).join('');

  const qOpts = quarters.map(({ y, q }) => {
    const r = _vrQRange(y, q);
    return `<option value="${r.from}|${r.to}">الربع ${q} / ${y}</option>`;
  }).join('');

  return VR_CSS + `
<div class="vr-wrap">
<div class="vr-hdr">
  <div>
    <div class="vr-hdr-title">إقرار ضريبة القيمة المضافة</div>
    <div class="vr-hdr-sub">أبعاد الحديد — شهري &nbsp;|&nbsp; وسام الفولاذ — ربع سنوي</div>
    <div id="vr-status" class="vr-status">جارٍ التحميل… · ${VR_VERSION}</div>
  </div>
  <div class="vr-hdr-btns">
    <button class="vr-btn" id="vr-btn-refresh">⟳ تحديث الكل</button>
  </div>
</div>

<div id="vr-summary-bar" class="vr-summary" style="display:none"></div>

<div class="vr-panels">
  <!-- أبعاد الحديد -->
  <div class="vr-panel" id="vr-panel-abaad">
    <div class="vr-panel-hdr">
      <div>
        <div class="vr-panel-title">🏗 أبعاد الحديد — شهري</div>
        <div class="vr-panel-period" id="vr-period-lbl-abaad">—</div>
      </div>
      <div class="vr-panel-btns">
        <button class="vr-btn vr-btn-sm vr-btn-excel" id="vr-btn-excel-abaad">📊 Excel</button>
        <button class="vr-btn vr-btn-sm vr-btn-print" id="vr-btn-print-abaad">🖨 طباعة</button>
      </div>
    </div>
    <div class="vr-period-bar">
      <select class="vr-psel" id="vr-sel-abaad">${mOpts}</select>
      <span class="vr-lbl-s">أو</span>
      <input type="date" class="vr-date-inp" id="vr-from-abaad">
      <span class="vr-lbl-s">→</span>
      <input type="date" class="vr-date-inp" id="vr-to-abaad">
    </div>
    <div id="vr-body-abaad"><div class="vr-loading">⏳ جارٍ التحميل…</div></div>
  </div>

  <!-- وسام الفولاذ -->
  <div class="vr-panel" id="vr-panel-wissam">
    <div class="vr-panel-hdr">
      <div>
        <div class="vr-panel-title">⚙ وسام الفولاذ — ربع سنوي</div>
        <div class="vr-panel-period" id="vr-period-lbl-wissam">—</div>
      </div>
      <div class="vr-panel-btns">
        <button class="vr-btn vr-btn-sm vr-btn-excel" id="vr-btn-excel-wissam">📊 Excel</button>
        <button class="vr-btn vr-btn-sm vr-btn-print" id="vr-btn-print-wissam">🖨 طباعة</button>
      </div>
    </div>
    <div class="vr-period-bar">
      <select class="vr-psel" id="vr-sel-wissam">${qOpts}</select>
      <span class="vr-lbl-s">أو</span>
      <input type="date" class="vr-date-inp" id="vr-from-wissam">
      <span class="vr-lbl-s">→</span>
      <input type="date" class="vr-date-inp" id="vr-to-wissam">
    </div>
    <div id="vr-body-wissam"><div class="vr-loading">⏳ جارٍ التحميل…</div></div>
  </div>
</div>

<div class="vr-footer" id="vr-footer" style="display:none">
  إعداد وتقديم: عمر أبو دقن — خبير مالي وإداري &nbsp;|&nbsp; ${VR_VERSION}
</div>
</div>`;
}

// ── wire up all event listeners ───────────────────────────────────────────────
function _vrBindEvents() {
  // Refresh all
  document.getElementById('vr-btn-refresh').addEventListener('click', _vrLoadBoth);

  ['abaad', 'wissam'].forEach(co => {
    // Period selector
    document.getElementById(`vr-sel-${co}`).addEventListener('change', () => {
      const val = document.getElementById(`vr-sel-${co}`).value;
      const [f, t] = val.split('|');
      if (!f || !t) return;
      document.getElementById(`vr-from-${co}`).value = f;
      document.getElementById(`vr-to-${co}`).value   = t;
      VR[co].from = f; VR[co].to = t;
      _vrLoad(co);
    });

    // Custom date from
    document.getElementById(`vr-from-${co}`).addEventListener('change', () => {
      const f = document.getElementById(`vr-from-${co}`).value;
      const t = document.getElementById(`vr-to-${co}`).value;
      if (f && t && f <= t) { VR[co].from = f; VR[co].to = t; _vrLoad(co); }
    });

    // Custom date to
    document.getElementById(`vr-to-${co}`).addEventListener('change', () => {
      const f = document.getElementById(`vr-from-${co}`).value;
      const t = document.getElementById(`vr-to-${co}`).value;
      if (f && t && f <= t) { VR[co].from = f; VR[co].to = t; _vrLoad(co); }
    });

    // Print button
    document.getElementById(`vr-btn-print-${co}`).addEventListener('click', () => _vrPrint(co));

    // Excel button
    document.getElementById(`vr-btn-excel-${co}`).addEventListener('click', () => _vrExcel(co));

    // Adjustment inputs — event delegation on the stable panel div
    document.getElementById(`vr-panel-${co}`).addEventListener('input', e => {
      const inp = e.target.closest('[data-adj]');
      if (!inp) return;
      VR[co].adj[inp.dataset.adj] = parseFloat(inp.value) || 0;
      _vrRefresh(co);
    });
  });
}

// ── totals ────────────────────────────────────────────────────────────────────
function _vrCalc(co) {
  const s = VR[co]; if (!s.data) return null;
  const r = s.data.rows, a = s.adj;
  const r12 = r.r12.vat + (a.r5_vat  || 0);
  const r13 = r.r13.vat + (a.r8_vat  || 0) + (a.r10_vat || 0);
  const r14 = a.r14_vat || 0;
  return {
    r6:  r.r6.base  + (a.r5_base  || 0),
    r11: r.r11.base + (a.r8_base  || 0) + (a.r10_base || 0),
    r12, r13, r14,
    r15: r12 - r13 + r14,
  };
}

// ── render company body ───────────────────────────────────────────────────────
function _vrRenderBody(co) {
  const s = VR[co]; if (!s.data) return;
  const r = s.data.rows, t = _vrCalc(co), a = s.adj, ref = s.data.ref;

  const mi = (field, w) =>
    `<input type="number" step="0.01" class="vr-adj" data-adj="${field}"
      value="${a[field] || ''}" placeholder="0.00" style="width:${w||85}px">`;

  const row = (num, cls, desc, base, rate, vat) =>
    `<tr class="${cls}"><td class="rn">${num}</td><td>${desc}</td>
     <td class="cn">${base == null ? '' : base}</td>
     <td class="cr">${rate == null ? '' : rate}</td>
     <td class="cn">${vat  == null ? '' : vat}</td></tr>`;

  const sts = t.r15 > .005
    ? `<span class="pay">ضريبة مستحقة: ${_vrFmt(t.r15)} ر.س</span>`
    : t.r15 < -.005
      ? `<span class="ref_">مبلغ مسترد: ${_vrFmt(Math.abs(t.r15))} ر.س</span>`
      : `<span style="color:#8892a8">متوازن</span>`;

  const html = `
  <div class="vr-sec">أ — المخرجات</div>
  <table class="vr-tbl">
    <thead><tr><th style="width:20px">#</th><th>البيان</th>
      <th style="width:125px">الوعاء (ر.س)</th><th style="width:50px">%</th>
      <th style="width:125px">الضريبة (ر.س)</th></tr></thead>
    <tbody>
      ${row(1, '', 'مبيعات خاضعة 15%', _vrFmt(r.r1.base), '15%', _vrFmt(r.r1.vat))}
      ${row(2, '', 'مبيعات مواطنين معفاة', _vrFmt(0), '—', _vrFmt(0))}
      ${row(3, '', 'مبيعات نسبة صفر (صادرات)', _vrFmt(r.r3.base), '0%', _vrFmt(0))}
      ${row(4, '', 'مبيعات معفاة', _vrFmt(r.r4.base), 'معفى', _vrFmt(0))}
      <tr class="rm"><td class="rn">5</td><td>تسويات فترات سابقة (مبيعات)</td>
        <td class="cn">${mi('r5_base', 95)}</td><td class="cr">—</td><td class="cn">${mi('r5_vat', 85)}</td></tr>
      <tr class="rs"><td class="rn">6</td><td>إجمالي المبيعات</td>
        <td class="cn" id="vr-${co}-r6">${_vrFmt(t.r6)}</td><td class="cr">—</td><td class="cn">—</td></tr>
    </tbody>
  </table>
  <div class="vr-sec">ب — المدخلات</div>
  <table class="vr-tbl">
    <thead><tr><th style="width:20px">#</th><th>البيان</th>
      <th style="width:125px">الوعاء (ر.س)</th><th style="width:50px">%</th>
      <th style="width:125px">الضريبة (ر.س)</th></tr></thead>
    <tbody>
      ${row(7, '', 'مشتريات خاضعة 15%', _vrFmt(r.r7.base), '15%', _vrFmt(r.r7.vat))}
      <tr class="rm"><td class="rn">8</td><td>واردات جمارك / احتساب عكسي</td>
        <td class="cn">${mi('r8_base', 95)}</td><td class="cr">15%</td><td class="cn">${mi('r8_vat', 85)}</td></tr>
      ${row(9, '', 'مشتريات صفر / معفاة', _vrFmt(r.r9.base), '0%/معفى', _vrFmt(0))}
      <tr class="rm"><td class="rn">10</td><td>تسويات فترات سابقة (مشتريات)</td>
        <td class="cn">${mi('r10_base', 95)}</td><td class="cr">—</td><td class="cn">${mi('r10_vat', 85)}</td></tr>
      <tr class="rs"><td class="rn">11</td><td>إجمالي المشتريات</td>
        <td class="cn" id="vr-${co}-r11">${_vrFmt(t.r11)}</td><td class="cr">—</td><td class="cn">—</td></tr>
    </tbody>
  </table>
  <div class="vr-sec">ج — التسوية</div>
  <table class="vr-tbl">
    <thead><tr><th style="width:20px">#</th><th>البيان</th>
      <th colspan="2"></th><th style="width:125px">الضريبة (ر.س)</th></tr></thead>
    <tbody>
      <tr class="r12"><td class="rn">12</td><td>إجمالي ضريبة المخرجات</td>
        <td colspan="2"></td><td class="cn" id="vr-${co}-r12">${_vrFmt(t.r12)}</td></tr>
      <tr class="r13"><td class="rn">13</td><td>إجمالي ضريبة المدخلات</td>
        <td colspan="2"></td><td class="cn" id="vr-${co}-r13">${_vrFmt(t.r13)}</td></tr>
      <tr class="rm"><td class="rn">14</td>
        <td>تسوية فترات سابقة <small style="color:#4a6080">(±5,000 ر.س)</small></td>
        <td colspan="2"></td><td class="cn">${mi('r14_vat', 85)}</td></tr>
      <tr class="rnet"><td class="rn" style="color:#0b1627">15</td><td>صافي الضريبة المستحقة</td>
        <td colspan="2"></td><td class="cn" id="vr-${co}-r15">${_vrFmt(Math.abs(t.r15))}</td></tr>
      <tr class="rstat"><td class="rn">16</td><td colspan="3">الحالة</td>
        <td class="cn" id="vr-${co}-r16">${sts}</td></tr>
    </tbody>
  </table>
  <div class="vr-ref">
    <div class="vr-ref-ttl">مرجع المطابقة مع MekSoft</div>
    <div class="vr-ref-g">
      <div class="vr-ref-r"><span class="vr-ref-lbl">إجمالي فواتير مبيعات:</span><span class="vr-ref-val">${_vrFmt(ref.grossSalesBase)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">ضريبة مبيعات إجمالية:</span><span class="vr-ref-val">${_vrFmt(ref.grossSalesVAT)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">مردودات مبيعات:</span><span class="vr-ref-val">${_vrFmt(ref.returnsBase)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">ضريبة مردودات مبيعات:</span><span class="vr-ref-val">${_vrFmt(ref.returnsVAT)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">فواتير مشتريات:</span><span class="vr-ref-val">${_vrFmt(ref.grossPurchBase)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">ضريبة مشتريات (فواتير):</span><span class="vr-ref-val">${_vrFmt(ref.jvInvVAT)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">مردودات مشتريات:</span><span class="vr-ref-val">${_vrFmt(ref.purchReturnsBase)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">ضريبة مردودات مشتريات:</span><span class="vr-ref-val">${_vrFmt(ref.purchReturnsVAT)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">ضريبة قيود يدوية (ح.64):</span><span class="vr-ref-val vr-ref-hi">${_vrFmt(ref.jvManualVAT)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">خصم يدوي على ضريبة مدخلات (إشعارات خصم غير مرتبطة بتسوية):</span><span class="vr-ref-val vr-ref-hi">${_vrFmt(ref.jvManualCreditVAT)}</span></div>
      <div class="vr-ref-r"><span class="vr-ref-lbl">إجمالي مدخلات (خانة 7):</span><span class="vr-ref-val vr-ref-hi">${_vrFmt(r.r7.vat)}</span></div>
    </div>
    <div style="font-size:.65rem;color:#4a6080;margin-top:6px">
      ⚠ خانة 7 = فواتير مشتريات + قيود يدوية ح.64. طابق مع MekSoft قبل التقديم.
    </div>
  </div>`;

  const el = document.getElementById(`vr-body-${co}`);
  if (el) el.innerHTML = html;

  const lbl = document.getElementById(`vr-period-lbl-${co}`);
  if (lbl) lbl.textContent = `${s.data.from} → ${s.data.to}`;
}

// ── refresh computed cells only (after adj input) ─────────────────────────────
function _vrRefresh(co) {
  if (!VR[co].data) return;
  const t = _vrCalc(co);
  const upd = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = _vrFmt(v); };
  upd(`vr-${co}-r6`,  t.r6);
  upd(`vr-${co}-r11`, t.r11);
  upd(`vr-${co}-r12`, t.r12);
  upd(`vr-${co}-r13`, t.r13);
  upd(`vr-${co}-r15`, Math.abs(t.r15));
  const el16 = document.getElementById(`vr-${co}-r16`);
  if (el16) {
    el16.innerHTML = t.r15 > .005
      ? `<span class="pay">ضريبة مستحقة: ${_vrFmt(t.r15)} ر.س</span>`
      : t.r15 < -.005
        ? `<span class="ref_">مبلغ مسترد: ${_vrFmt(Math.abs(t.r15))} ر.س</span>`
        : `<span style="color:#8892a8">متوازن</span>`;
  }
  _vrRenderSummary();
}

// ── summary bar ───────────────────────────────────────────────────────────────
function _vrRenderSummary() {
  const bar = document.getElementById('vr-summary-bar'); if (!bar) return;
  const tA = _vrCalc('abaad'), tW = _vrCalc('wissam');
  if (!tA && !tW) { bar.style.display = 'none'; return; }
  const netA = tA ? tA.r15 : 0, netW = tW ? tW.r15 : 0, total = netA + netW;
  const cls  = v => v > .005 ? 'pay' : v < -.005 ? 'ref_' : '';
  bar.style.display = '';
  bar.innerHTML = `
    ${tA ? `<div><div class="vr-sum-lbl">صافي أبعاد (${VR.abaad.data.from.slice(0,7)})</div>
      <div class="vr-sum-val ${cls(netA)}">${_vrFmt(netA)} ر.س</div></div>` : ''}
    ${tW ? `<div><div class="vr-sum-lbl">صافي وسام (${VR.wissam.data.from.slice(0,7)}→${VR.wissam.data.to.slice(0,7)})</div>
      <div class="vr-sum-val ${cls(netW)}">${_vrFmt(netW)} ر.س</div></div>` : ''}
    <div style="border-right:1px solid #C6A04A44;padding-right:20px;margin-right:10px">
      <div class="vr-sum-lbl">مجموع المجموعة</div>
      <div class="vr-sum-val ${cls(total)}" style="font-size:1rem">${_vrFmt(Math.abs(total))} ر.س</div>
    </div>
    ${tA ? `<div><div class="vr-sum-lbl">مخرجات أبعاد</div>
      <div class="vr-sum-val">${_vrFmt(tA.r12)} ر.س</div></div>` : ''}
    ${tW ? `<div><div class="vr-sum-lbl">مخرجات وسام</div>
      <div class="vr-sum-val">${_vrFmt(tW.r12)} ر.س</div></div>` : ''}`;
}

// ── load ──────────────────────────────────────────────────────────────────────
async function _vrLoad(co) {
  const s = VR[co];
  if (s.loading || !s.from || !s.to) return;
  s.loading = true;
  const body = document.getElementById(`vr-body-${co}`);
  if (body) body.innerHTML = '<div class="vr-loading">⏳ جارٍ التحميل…</div>';
  try {
    const resp = await fetch(`/api/vat-return?company=${co}&from=${s.from}&to=${s.to}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    s.data = await resp.json();
    _vrRenderBody(co);
    _vrRenderSummary();
    const footer = document.getElementById('vr-footer');
    if (footer) footer.style.display = '';
  } catch (e) {
    if (body) body.innerHTML = `<div style="color:#ff6b6b;padding:24px;text-align:center">⚠ ${e.message}</div>`;
  } finally {
    s.loading = false;
  }
}

function _vrLoadBoth() {
  _vrLoad('abaad');
  _vrLoad('wissam');
  const st = document.getElementById('vr-status');
  if (st) st.textContent = `تحديث ${new Date().toLocaleTimeString('ar-SA')} · ${VR_VERSION}`;
}

// ── timer ─────────────────────────────────────────────────────────────────────
function _vrIsActive() {
  return !!document.querySelector('.tab.active[data-tab="vat-return"]');
}
function _vrStopTimer() { if (_vrTimer) { clearInterval(_vrTimer); _vrTimer = null; } }
function _vrStartTimer() {
  _vrStopTimer();
  let cd = VR_REFRESH_SEC;
  _vrTimer = setInterval(() => {
    if (!_vrIsActive()) { _vrStopTimer(); return; }
    cd--;
    const el = document.getElementById('vr-status');
    if (el) el.textContent = `تحديث تلقائي خلال ${cd}ث · ${VR_VERSION}`;
    if (cd <= 0) { cd = VR_REFRESH_SEC; _vrLoadBoth(); }
  }, 1000);
}

// ── print (hides other panel via CSS class) ───────────────────────────────────
function _vrPrint(co) {
  const other = co === 'abaad' ? 'wissam' : 'abaad';
  const panel = document.getElementById(`vr-panel-${other}`);
  if (panel) panel.classList.add('vr-print-hide');
  window.print();
  if (panel) panel.classList.remove('vr-print-hide');
}

// ── Excel export (ExcelJS — professional styling) ─────────────────────────────
async function _vrExcel(co) {
  const s = VR[co];
  if (!s.data) { alert('لا توجد بيانات — يرجى تحميل الفترة أولاً'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS غير محملة — أعد تحميل الصفحة'); return; }
  try {
    await _vrExcelBuild(co);
  } catch (err) {
    console.error('[_vrExcel]', err);
    alert('خطأ في التصدير:\n' + err.message);
  }
}

async function _vrExcelBuild(co) {
  const s = VR[co];
  const r = s.data.rows, t = _vrCalc(co), ref = s.data.ref, a = s.adj;
  const coName = co === 'abaad' ? 'أبعاد الحديد' : 'وسام الفولاذ';
  const period = s.data.from + '  →  ' + s.data.to;
  const today  = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const netLbl = t.r15 > .005 ? 'ضريبة مستحقة الدفع' : t.r15 < -.005 ? 'مبلغ مسترد' : 'متوازن';
  const netClr = t.r15 > .005 ? 'FFFF7043'            : t.r15 < -.005 ? 'FF66BB6A'   : 'FF8892A8';

  // ── palette (ARGB) ──
  const GOLD='FFC6A04A', WHITE='FFFFFFFF', DARK='FF0B1627';
  const BDK='FF142446',  BMD='FF1A2E50',  BLT='FF0D1D36';
  const SEC='FF1E3060',  GRAY='FF8892A8';
  const R1='FF0F1E38',   R2='FF0D1D36';
  const NF = '#,##0.00';

  const BRD_THIN = {
    top:{style:'thin',color:{argb:'FF2A4070'}}, bottom:{style:'thin',color:{argb:'FF2A4070'}},
    left:{style:'thin',color:{argb:'FF2A4070'}}, right:{style:'thin',color:{argb:'FF2A4070'}},
  };
  const BRD_GOLD = {
    top:{style:'medium',color:{argb:GOLD}}, bottom:{style:'medium',color:{argb:GOLD}},
    left:{style:'medium',color:{argb:GOLD}}, right:{style:'medium',color:{argb:GOLD}},
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'عمر أبو دقن'; wb.created = new Date();

  const ws = wb.addWorksheet('إقرار ضريبة القيمة المضافة', {
    views: [{ rightToLeft: true }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { width: 5  },  // A: #
    { width: 40 },  // B: البيان
    { width: 20 },  // C: الوعاء
    { width: 8  },  // D: %
    { width: 20 },  // E: الضريبة
  ];

  // ── style helper ──
  function S(c, bg, fg, bold, sz, align_h, numFmt, italic) {
    c.fill      = { type:'pattern', pattern:'solid', fgColor:{ argb: bg } };
    c.font      = { name:'Calibri', bold:!!bold, size:sz||10, italic:!!italic, color:{ argb: fg||WHITE } };
    c.alignment = { horizontal: align_h||'right', vertical:'middle', readingOrder:'rightToLeft' };
    c.border    = BRD_THIN;
    if (numFmt) c.numFmt = numFmt;
  }

  // ── full-width header (cols A:E merged) ──
  function addHdr(text, bg, fg, bold, sz, height, goldBorder) {
    const row = ws.addRow(['','','','','']);
    row.height = height || 20;
    ws.mergeCells(row.number, 1, row.number, 5);
    const c = ws.getCell(row.number, 1);
    c.value  = text;
    S(c, bg, fg, bold, sz, 'center');
    if (goldBorder) c.border = BRD_GOLD;
  }

  // ── spacer ──
  function addSpacer(h) {
    const row = ws.addRow(['','','','','']);
    row.height = h || 5;
    ws.mergeCells(row.number, 1, row.number, 5);
    ws.getCell(row.number, 1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb: DARK } };
  }

  // ── section label (A:E merged) ──
  function addSection(text) {
    const row = ws.addRow(['','','','','']);
    row.height = 18;
    ws.mergeCells(row.number, 1, row.number, 5);
    const c = ws.getCell(row.number, 1);
    c.value = text;
    S(c, SEC, GOLD, true, 10, 'right');
  }

  // ── column headers ──
  function addColHdr() {
    const row = ws.addRow(['#','البيان','الوعاء (ر.س)','%','الضريبة (ر.س)']);
    row.height = 18;
    [1,2,3,4,5].forEach(col => {
      const c = ws.getCell(row.number, col);
      S(c, BDK, GOLD, true, 9, col===1||col===4 ? 'center' : 'right');
      c.border = BRD_GOLD;
    });
  }

  // ── standard data row [#, desc, base, rate, vat] ──
  let _dr = 0;
  function addDataRow(num, desc, base, rate, vat, bg) {
    _dr++;
    const bg_ = bg || (_dr % 2 === 0 ? R2 : R1);
    const row = ws.addRow(['','','','','']);
    row.height = 17;
    const rn = row.number;

    const cA = ws.getCell(rn,1); cA.value = num;  S(cA, bg_, WHITE, false, 10, 'center');
    const cB = ws.getCell(rn,2); cB.value = desc; S(cB, bg_, WHITE, false, 10);

    const cC = ws.getCell(rn,3);
    if (typeof base === 'number') { cC.value = base; S(cC, bg_, WHITE, false, 10, 'right', NF); }
    else { cC.value = base||''; S(cC, bg_, GRAY, false, 9, 'center'); }

    const cD = ws.getCell(rn,4); cD.value = rate||''; S(cD, bg_, GRAY, false, 9, 'center');

    const cE = ws.getCell(rn,5);
    if (typeof vat === 'number') { cE.value = vat; S(cE, bg_, WHITE, false, 10, 'right', NF); }
    else { cE.value = vat||''; S(cE, bg_, GRAY, false, 9, 'center'); }
  }

  // ── totals row: value in base col C (R6, R11) ──
  function addTotBaseRow(num, desc, val) {
    _dr++;
    const row = ws.addRow(['','','','','']);
    row.height = 19;
    const rn = row.number;
    ws.mergeCells(rn, 4, rn, 5);
    [1,2,3,4].forEach(col => {
      const c = ws.getCell(rn, col);
      S(c, BDK, WHITE, true, 10, col===1?'center':'right');
      c.border = BRD_GOLD;
    });
    ws.getCell(rn,1).value = num;
    ws.getCell(rn,2).value = desc;
    const c3 = ws.getCell(rn,3); c3.value = val; c3.numFmt = NF; c3.border = BRD_GOLD;
  }

  // ── totals row: value in vat col E (R12-R15) ──
  function addTotVatRow(num, desc, val, bg, isNet, statusText) {
    _dr++;
    const row = ws.addRow(['','','','','']);
    row.height = isNet ? 22 : 18;
    const rn = row.number;
    ws.mergeCells(rn, 3, rn, 4);
    const fg_ = isNet ? DARK : WHITE;
    const brd_ = isNet ? BRD_GOLD : BRD_THIN;
    [1,2,3,5].forEach(col => {
      const c = ws.getCell(rn, col);
      S(c, bg||BDK, fg_, true, isNet?11:10, col===1?'center':'right');
      c.border = brd_;
    });
    ws.getCell(rn,1).value = num;
    ws.getCell(rn,2).value = desc;
    ws.getCell(rn,3).value = '';
    const cE = ws.getCell(rn,5);
    if (statusText != null) {
      cE.value = statusText;
      cE.font  = { name:'Calibri', bold:true, size:10, color:{ argb: netClr } };
    } else if (typeof val === 'number') {
      cE.value  = val;
      cE.numFmt = NF;
    }
  }

  // ════════════════════════════════════════════
  // HEADER BLOCK
  // ════════════════════════════════════════════
  addHdr('إقرار ضريبة القيمة المضافة',                                          GOLD, DARK, true,  15, 34, true);
  addHdr(coName,                                                                  BDK,  GOLD, true,  13, 24, true);
  addHdr('الفترة الضريبية:  ' + period,                                          BMD,  WHITE, true, 11, 20, false);
  addHdr('إعداد: عمر أبو دقن — خبير مالي وإداري   |   ' + today,               BLT,  GRAY, false,  9, 16, false);
  addSpacer(8);

  // ════════════════════════════════════════════
  // SECTION A — المخرجات
  // ════════════════════════════════════════════
  addSection('أ  —  المخرجات');
  addColHdr();
  addDataRow(1,  'مبيعات خاضعة (15%)',           r.r1.base,    '15%',  r.r1.vat);
  addDataRow(2,  'مبيعات مواطنين معفاة',           0,            '0%',   0);
  addDataRow(3,  'مبيعات نسبة صفر — صادرات',       r.r3.base,   '0%',   '—');
  addDataRow(4,  'مبيعات معفاة',                   r.r4.base,   'معفى', '—');
  addDataRow(5,  'تسويات فترات سابقة (مبيعات)',    a.r5_base||0, '—',   a.r5_vat||0);
  addTotBaseRow(6, 'إجمالي المبيعات (الوعاء)',     t.r6);
  addSpacer();

  // ════════════════════════════════════════════
  // SECTION B — المدخلات
  // ════════════════════════════════════════════
  addSection('ب  —  المدخلات');
  addColHdr();
  addDataRow(7,  'مشتريات خاضعة (15%)',            r.r7.base,     '15%', r.r7.vat);
  addDataRow(8,  'واردات جمارك / احتساب عكسي',    a.r8_base||0,  '15%', a.r8_vat||0);
  addDataRow(9,  'مشتريات صفر / معفاة',            r.r9.base,     '0%',  '—');
  addDataRow(10, 'تسويات فترات سابقة (مشتريات)',  a.r10_base||0, '—',   a.r10_vat||0);
  addTotBaseRow(11, 'إجمالي المشتريات (الوعاء)',   t.r11);
  addSpacer();

  // ════════════════════════════════════════════
  // SECTION C — التسوية
  // ════════════════════════════════════════════
  addSection('ج  —  التسوية');
  addTotVatRow(12, 'إجمالي ضريبة المخرجات',              t.r12);
  addTotVatRow(13, 'إجمالي ضريبة المدخلات',              t.r13);
  addTotVatRow(14, 'تسوية فترات سابقة (± 5,000 ر.س)',    a.r14_vat||0);
  addTotVatRow(15, 'صافي الضريبة المستحقة',              Math.abs(t.r15), GOLD, true, null);
  addTotVatRow(16, 'الحالة',                              null,            BMD,  false, netLbl);
  addSpacer(8);

  // ════════════════════════════════════════════
  // REFERENCE
  // ════════════════════════════════════════════
  addSection('مرجع المطابقة مع MekSoft');
  [
    ['إجمالي فواتير مبيعات (وعاء)',    ref.grossSalesBase, false],
    ['ضريبة مبيعات إجمالية',           ref.grossSalesVAT,  false],
    ['مردودات مبيعات (وعاء)',           ref.returnsBase,    false],
    ['ضريبة مردودات مبيعات',           ref.returnsVAT,     false],
    ['فواتير مشتريات (وعاء)',           ref.grossPurchBase, false],
    ['ضريبة مشتريات (فواتير فقط)',      ref.jvInvVAT,       false],
    ['مردودات مشتريات (وعاء)',          ref.purchReturnsBase, false],
    ['ضريبة مردودات مشتريات',           ref.purchReturnsVAT,  false],
    ['ضريبة قيود يدوية ح.64',          ref.jvManualVAT,    true ],
    ['خصم يدوي على ضريبة مدخلات (ح.64)', ref.jvManualCreditVAT, true ],
    ['إجمالي ضريبة مدخلات — خانة 7',  r.r7.vat,           true ],
  ].forEach(([lbl, val, hl], i) => {
    const bg_ = i % 2 === 0 ? R1 : R2;
    const row = ws.addRow(['','','','','']);
    row.height = 16;
    const rn = row.number;
    ws.mergeCells(rn, 1, rn, 4);
    const cL = ws.getCell(rn, 1);
    cL.value = lbl; S(cL, bg_, hl ? GOLD : GRAY, hl, 9);
    const cV = ws.getCell(rn, 5);
    cV.value = val; S(cV, bg_, hl ? GOLD : WHITE, hl, 9, 'right', NF);
  });

  // ── footer + download ──
  addSpacer(5);
  addHdr('إعداد وتقديم: عمر أبو دقن — خبير مالي وإداري  |  ' + today + '  |  ' + VR_VERSION,
         BLT, GRAY, false, 8, 16, false);

  const buf    = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dlUrl  = URL.createObjectURL(blob);
  const dlLink = document.createElement('a');
  dlLink.href     = dlUrl;
  dlLink.download = 'VAT_' + coName + '_' + s.data.from + '_' + s.data.to + '.xlsx';
  document.body.appendChild(dlLink);
  dlLink.click();
  document.body.removeChild(dlLink);
  URL.revokeObjectURL(dlUrl);
}

// ── entry point ───────────────────────────────────────────────────────────────
function renderVatReturn() {
  const wrap = document.getElementById('tab-vat-return');
  if (!wrap) return;

  if (!_vrRendered) {
    const startDate = (window._appConfig && window._appConfig.startDate) || '2025-10-01';
    wrap.innerHTML = _vrBuildShell(startDate);
    _vrRendered = true;

    // Set default dates and sync dropdowns to first (current) option
    const now = new Date();

    // أبعاد → current month
    const mR = _vrMonthRange(now.getFullYear(), now.getMonth() + 1);
    document.getElementById('vr-from-abaad').value = mR.from;
    document.getElementById('vr-to-abaad').value   = mR.to;
    VR.abaad.from = mR.from; VR.abaad.to = mR.to;

    // وسام → current quarter
    const q  = Math.ceil((now.getMonth() + 1) / 3);
    const qR = _vrQRange(now.getFullYear(), q);
    document.getElementById('vr-from-wissam').value = qR.from;
    document.getElementById('vr-to-wissam').value   = qR.to;
    VR.wissam.from = qR.from; VR.wissam.to = qR.to;

    _vrBindEvents();
    _vrStartTimer();
  }

  _vrLoadBoth();
}
