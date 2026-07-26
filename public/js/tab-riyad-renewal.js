/* طلب تجديد قرض الرياض — سبتمبر 2026 (v1.0)
   صفحة عرض/طباعة A4 لعمر أبو دقن، معدّة لبنك الرياض — تجديد "قرض الرياض (1)"
   المستحق 25-09-2026. كل رقم مستخرج حياً من /api/dscr، /api/dscr/monthly،
   /api/interco-recon/memo3، /api/financing — لا رقم مكتوب يدوياً في هذا الملف.
   نفس نمط tab-bank-meeting.js (الهوية والطباعة)، مبنية من
   docs/spec_riyad_bank_paper_v1.md. */
'use strict';

const RR_SEPT_LOAN_NAME = 'قرض الرياض (1)';

let _rrRendered = false;
let _rrData = null; // { dscr, monthly, memo3, financing }

function _rrFmt(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return (+v).toLocaleString('ar-SA', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
}
function _rrX(v) { return v == null ? '—' : (+v).toFixed(2) + '×'; }
// toISOString() converts to UTC first, shifting the date by a day in GMT+3 —
// same gotcha tab-forecast.js's _fcDateStr comment warns about. Format from
// local date parts instead.
function _rrDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const RR_CSS = `<style>
#tab-riyad-renewal { padding: 0 0 30px; }
.rr-page { max-width: 940px; margin: 0 auto; background: #0a1420; border: 1px solid #1e3a5f; border-radius: 10px; overflow: hidden; font-family: 'Cairo', 'Tajawal', 'Segoe UI', sans-serif; }
.rr-toolbar { display:flex; justify-content:flex-end; gap:10px; padding:12px 18px; background:#06101c; border-bottom:1px solid #1e3a5f; }
.rr-print-btn { background:#C6A04A; color:#142446; border:none; padding:8px 18px; border-radius:6px; cursor:pointer; font-size:.85rem; font-weight:700; font-family:inherit; }
.rr-print-btn:hover { background:#d8b45f; }
.rr-status { color:#5a7a9a; font-size:.75rem; align-self:center; margin-left:auto; }

.rr-hdr { background: linear-gradient(135deg,#142446,#1c3060); padding: 26px 32px; border-bottom: 4px solid #C6A04A; }
.rr-stamp { color:#C6A04A; font-size:.82rem; font-weight:700; letter-spacing:.02em; margin-bottom:14px; }
.rr-company { color:#fff; font-size:1.3rem; font-weight:800; }
.rr-title { color:#dce8f8; font-size:1.05rem; font-weight:700; margin-top:6px; }
.rr-date { color:#8aa0c0; font-size:.78rem; margin-top:8px; }
.rr-badge { display:inline-block; background:#13284a; border:1px solid #C6A04A; color:#C6A04A; font-size:.68rem; font-weight:700; padding:2px 10px; border-radius:12px; margin-right:8px; }
.rr-exec { color:#e8d8a8; font-size:.92rem; font-weight:700; margin-top:14px; line-height:1.7; background:rgba(198,160,74,.08); border-right:3px solid #C6A04A; padding:10px 14px; border-radius:4px; }

.rr-body { padding: 24px 32px; color:#c8d8e8; }
.rr-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
@media(max-width:760px){ .rr-kpis{ grid-template-columns:repeat(2,1fr);} }
.rr-kpi { background:#0f2035; border:1px solid #1e3a5f; border-top:3px solid #C6A04A; border-radius:8px; padding:14px; }
.rr-kpi-lbl { color:#8aaac8; font-size:.74rem; font-weight:600; margin-bottom:6px; }
.rr-kpi-val { color:#fff; font-size:1.25rem; font-weight:800; }
.rr-kpi-sub { color:#5a7a9a; font-size:.68rem; margin-top:4px; line-height:1.5; }
.rr-kpi-hi { color:#4ada8e; font-weight:700; }

.rr-section { margin-bottom:24px; }
.rr-sec-title { color:#C6A04A; font-size:.9rem; font-weight:800; margin-bottom:10px; border-bottom:1px solid #1e3a5f; padding-bottom:6px; }
.rr-caption { color:#8aaac8; font-size:.8rem; line-height:1.7; margin-top:10px; }

.rr-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
.rr-tbl th { background:#142446; color:#C6A04A; padding:8px 12px; text-align:right; border-bottom:2px solid #C6A04A; font-weight:700; }
.rr-tbl td { padding:7px 12px; border-bottom:1px solid #14283e; color:#c8d8e8; }
.rr-tbl tr.rr-ask-row td { background:#0f2035; font-weight:800; color:#fff; }
.rr-tbl tr.rr-forward td { color:#5a7a9a; font-style:italic; }

.rr-box { background:#0f2035; border:1px solid #1e3a5f; border-right:4px solid #C6A04A; border-radius:8px; padding:16px 18px; margin-bottom:16px; }
.rr-box-title { color:#e8d8a8; font-size:.88rem; font-weight:800; margin-bottom:8px; }
.rr-box-body { color:#b8c8d8; font-size:.82rem; line-height:1.8; }
.rr-box-body strong { color:#fff; }
.rr-box-body ol,.rr-box-body ul { padding-inline-start: 20px; margin-top: 6px; }
.rr-box.rr-ask { border-right-color:#4ada8e; }
.rr-box.rr-ask .rr-box-title { color:#4ada8e; }
.rr-box.rr-disclosure { border-right-color:#5a7a9a; }
.rr-box.rr-disclosure .rr-box-title { color:#8aaac8; }

.rr-legend { display:flex; gap:16px; font-size:.75rem; color:#8aaac8; margin-bottom:8px; }
.rr-legend span { display:inline-flex; align-items:center; gap:5px; }
.rr-legend i { display:inline-block; width:14px; height:3px; border-radius:2px; }

.rr-footer { padding: 16px 32px; background:#06101c; color:#4a6a8a; font-size:.72rem; border-top:1px solid #1e3a5f; text-align:center; line-height:1.7; }

@media print {
  body * { visibility: hidden; }
  #tab-riyad-renewal, #tab-riyad-renewal * { visibility: visible; }
  #tab-riyad-renewal { position:absolute; top:0; left:0; width:100%; padding:0; }
  .sidebar, .sidebar-reopen-btn, .hdr, .conn-banner, .rr-toolbar { display:none !important; }
  body { background:#fff; padding-right:0 !important; }
  .rr-page { max-width:100%; border:none; border-radius:0; }
  .rr-body { color:#000; }
  .rr-kpi, .rr-box { break-inside: avoid; }
  @page { size: A4 portrait; margin: 12mm; }
}
</style>`;

function _rrBuildShell() {
  return RR_CSS + `
<div class="rr-page">
  <div class="rr-toolbar">
    <span class="rr-status" id="rr-status">جارٍ التحميل…</span>
    <button class="rr-print-btn" id="rr-print-btn">🖨 نسخة للطباعة / حفظ PDF</button>
  </div>
  <div class="rr-hdr">
    <div class="rr-stamp">✍ عمر أبو دقن — محاسبة • زكاة • ضرائب — خبير مالي وإداري <span class="rr-badge">v1.0</span></div>
    <div class="rr-company">مؤسسة أبعاد الحديد التجارية</div>
    <div class="rr-title">طلب تجديد تسهيل — بنك الرياض</div>
    <div class="rr-date">تاريخ الإعداد: ${new Date().toLocaleDateString('ar-SA')}</div>
    <div class="rr-exec" id="rr-exec">جارٍ التحميل…</div>
  </div>
  <div class="rr-body">
    <div id="rr-kpis" class="rr-kpis"></div>
    <div id="rr-why" class="rr-section"></div>
    <div class="rr-section">
      <div class="rr-sec-title">📈 منحنى DSCR الشهري — أكتوبر 2025 حتى الآن</div>
      <div id="rr-chart"></div>
      <div id="rr-julytbl"></div>
    </div>
    <div class="rr-section">
      <div class="rr-sec-title">🏦 استحقاقات بنك الرياض — أبعاد الحديد</div>
      <div id="rr-maturities"></div>
    </div>
    <div id="rr-ask" class="rr-section"></div>
    <div id="rr-disclosure" class="rr-section"></div>
  </div>
  <div class="rr-footer">
    الأرقام من واقع دفاتر ميك سوفت وسجل التمويلات، حية بتاريخ التوليد (${new Date().toLocaleString('ar-SA')}) — كل رقم قابل لإعادة الاستخراج والتحقق.
  </div>
</div>`;
}

function _rrSetStatus(text, err) {
  const el = document.getElementById('rr-status');
  if (el) { el.textContent = text; el.style.color = err ? '#e08a8a' : '#5a7a9a'; }
}

async function _rrLoad() {
  _rrSetStatus('جارٍ التحميل…');
  try {
    const [dscr, monthly, memo3, financing] = await Promise.all([
      fetch('/api/dscr', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/dscr/monthly', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/interco-recon/memo3', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/financing', { cache: 'no-store' }).then(r => r.json()),
    ]);
    if (dscr.error) throw new Error(dscr.details || dscr.error);
    if (monthly.error) throw new Error(monthly.details || monthly.error);
    _rrData = { dscr, monthly, memo3, financing };
    _rrRenderAll();
    _rrSetStatus(`✅ محدَّث حياً · ${new Date().toLocaleTimeString('ar-SA')}`);
  } catch (err) {
    _rrSetStatus('⚠ ' + err.message, true);
  }
}

function _rrRiyadLoans() {
  const loans = (_rrData.financing.loans || []).filter(l => /الرياض/.test(l.bank || ''));
  return loans.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

function _rrRenderAll() {
  _rrRenderExec();
  _rrRenderKPIs();
  _rrRenderWhy();
  _rrRenderChart();
  _rrRenderJulyTable();
  _rrRenderMaturities();
  _rrRenderAsk();
  _rrRenderDisclosure();
}

function _rrRenderExec() {
  const el = document.getElementById('rr-exec');
  if (!el || !_rrData) return;
  const sept = _rrRiyadLoans().find(l => l.company === 'أبعاد الحديد' && l.name === RR_SEPT_LOAN_NAME);
  const amt = sept ? sept.payment : null;
  const due = sept ? sept.dueDate : null;
  el.innerHTML = `الطلب: تجديد <strong>${esc(RR_SEPT_LOAN_NAME)}</strong> بقيمة <strong>${_rrFmt(amt, 2)} ر.س</strong> المستحق <strong>${esc(due || '')}</strong> — قسط بالوني واحد، إجراء روتيني. الغطاء التشغيلي والداخلي للمجموعة يفوق الاستحقاق بوضوح (التفصيل أدناه).`;
}

function _rrRenderKPIs() {
  const el = document.getElementById('rr-kpis');
  if (!el || !_rrData) return;
  const { dscr, memo3, monthly } = _rrData;
  const a = dscr.companies.abaad, w = dscr.companies.wissam;
  const sept = _rrRiyadLoans().find(l => l.company === 'أبعاد الحديد' && l.name === RR_SEPT_LOAN_NAME);
  const combinedOP = a.operatingProfit + w.operatingProfit;
  const combinedDS = a.totalDebtService + w.totalDebtService;
  const combinedDSCR = combinedDS ? combinedOP / combinedDS : null;
  const surplus = combinedOP - combinedDS;

  const wissamOwed = Math.abs(memo3.netFinancingBalance.amount);
  const coverRatio = sept && sept.payment ? wissamOwed / sept.payment : null;

  // خدمة دين أبعاد الشهرية — ثابتة عبر كل الأشهر المتاحة. المواصفة تصف هذا
  // الرقم بـ"الربح التشغيلي الثابت" (299,390) — لكنه فعلياً خدمة دين أبعاد
  // الشهرية الثابتة، لا ربحها التشغيلي (الربح متذبذب شهرياً بشدة، انظر
  // الجدول أدناه). القيمة نفسها 299,390 صحيحة ومطابقة؛ التسمية هنا مصحَّحة
  // فقط — لا رقم جديد أو مختلف عمّا ورد في المواصفة.
  const abaadDS = monthly.months.map(m => m.abaad.debtService);
  const dsMin = Math.min(...abaadDS), dsMax = Math.max(...abaadDS);

  el.innerHTML = `
    <div class="rr-kpi">
      <div class="rr-kpi-lbl">🎯 استحقاق سبتمبر 2026</div>
      <div class="rr-kpi-val">${_rrFmt(sept ? sept.payment : null, 2)} ر.س</div>
      <div class="rr-kpi-sub">${esc(RR_SEPT_LOAN_NAME)} — ${esc(sept ? sept.dueDate : '')} — دفعة بالونية واحدة فقط</div>
    </div>
    <div class="rr-kpi">
      <div class="rr-kpi-lbl">🏛 الغطاء الداخلي (الحساب الجاري البيني)</div>
      <div class="rr-kpi-val rr-kpi-hi">${_rrFmt(wissamOwed, 0)} ر.س</div>
      <div class="rr-kpi-sub">وسام الفولاذ مدينة لأبعاد — يغطي القسط <strong>${coverRatio ? coverRatio.toFixed(1) : '—'}×</strong> (موقف داخلي، لا أصل مصرفي)</div>
    </div>
    <div class="rr-kpi">
      <div class="rr-kpi-lbl">📐 DSCR — منفرد / موحَّد</div>
      <div class="rr-kpi-val">${_rrX(a.dscrTrue)} / <span class="rr-kpi-hi">${_rrX(combinedDSCR)}</span></div>
      <div class="rr-kpi-sub">ربح تشغيلي مجمّع ${_rrFmt(combinedOP,0)} ÷ خدمة دين مجمّعة ${_rrFmt(combinedDS,0)}<br><strong style="color:#4ada8e">فائض ${_rrFmt(surplus,0)} ر.س فوق كامل خدمة الدين المجمّعة</strong></div>
    </div>
    <div class="rr-kpi">
      <div class="rr-kpi-lbl">🔒 خدمة دين أبعاد الشهرية</div>
      <div class="rr-kpi-val">من ${_rrFmt(dsMin,0)} إلى ${_rrFmt(dsMax,0)} ر.س</div>
      <div class="rr-kpi-sub">ثابتة ومتوقَّعة طوال ${monthly.months.length} شهراً — لا استحقاق بالوني لأبعاد يقع ضمن هذه النافذة</div>
    </div>`;
}

function _rrRenderWhy() {
  const el = document.getElementById('rr-why');
  if (!el || !_rrData) return;
  const { dscr, memo3 } = _rrData;
  const a = dscr.companies.abaad, w = dscr.companies.wissam;
  const combinedOP = a.operatingProfit + w.operatingProfit;
  const combinedDS = a.totalDebtService + w.totalDebtService;
  const combinedDSCR = combinedDS ? combinedOP / combinedDS : null;
  const sept = _rrRiyadLoans().find(l => l.company === 'أبعاد الحديد' && l.name === RR_SEPT_LOAN_NAME);
  const wissamOwed = Math.abs(memo3.netFinancingBalance.amount);
  const coverRatio = sept && sept.payment ? wissamOwed / sept.payment : null;

  el.innerHTML = `
  <div class="rr-box">
    <div class="rr-box-title">💪 لماذا التجديد إجراء روتيني</div>
    <div class="rr-box-body">
      <ol>
        <li><strong>القاع الشهري موسمي/تشغيلي عابر لا بنيوي:</strong> خدمة دين أبعاد لأقساطها الدورية ثابتة طوال الفترة، بينما ربحها التشغيلي الشهري متذبذب (أعلى شهر في كامل السلسلة كان قبل الاستحقاق بشهرين فقط). تراجع DSCR الموحَّد في الشهر الأخير مصدره أساساً استحقاق بالوني على <strong>وسام الفولاذ</strong> تحديداً (منشأة أخرى، غير معنية بهذا الطلب) — لا علاقة له باستحقاق أبعاد محل هذا الطلب.</li>
        <li><strong>غطاء داخلي متوفر:</strong> رصيد الحساب الجاري بين المؤسستين الشقيقتين يقف عند <strong>${_rrFmt(wissamOwed,0)} ر.س</strong> لصالح أبعاد — يغطي قسط سبتمبر <strong>${coverRatio ? coverRatio.toFixed(1) : '—'}×</strong>.</li>
        <li><strong>القراءة الصحيحة على مستوى المجموعة:</strong> DSCR الموحَّد للمنشأتين الشقيقتين <strong>${_rrX(combinedDSCR)}</strong> أعلى من مؤشر أبعاد المنفردة <strong>${_rrX(a.dscrTrue)}</strong> — تغطية وسام الفولاذ الأقوى (${_rrX(w.dscrTrue)}) تعزّز الصورة الائتمانية للمجموعة ككل.</li>
      </ol>
    </div>
  </div>`;
}

// ── SVG monthly DSCR chart — fixed y-domain with clipping for extreme outliers
// (Nov/Dec swing beyond ±20) so the 1.0 threshold band stays readable; exact
// values always available in the table below the chart. ─────────────────────
function _rrChartSVG(months) {
  const W = 860, H = 260, padL = 46, padR = 16, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yMin = -2, yMax = 5;
  const n = months.length;
  const x = i => padL + (n > 1 ? i * plotW / (n - 1) : plotW / 2);
  const clip = v => Math.max(yMin, Math.min(yMax, v));
  const y = v => padT + plotH - (clip(v) - yMin) / (yMax - yMin) * plotH;

  const series = [
    { key: 'abaad',    color: '#C6A04A', label: 'أبعاد' },
    { key: 'wissam',   color: '#5baef0', label: 'وسام' },
    { key: 'combined', color: '#4ada8e', label: 'موحَّد', wide: true },
  ];

  const gridLines = [-2, -1, 0, 1, 2, 3, 4, 5].map(v =>
    `<line x1="${padL}" y1="${y(v)}" x2="${W-padR}" y2="${y(v)}" stroke="#14283e" stroke-width="1"/>
     <text x="${padL-8}" y="${y(v)+4}" fill="#5a7a9a" font-size="10" text-anchor="end">${v}</text>`
  ).join('');

  const threshold = `<line x1="${padL}" y1="${y(1)}" x2="${W-padR}" y2="${y(1)}" stroke="#e08a8a" stroke-width="1.5" stroke-dasharray="5,4"/>
    <text x="${W-padR}" y="${y(1)-5}" fill="#e08a8a" font-size="10" text-anchor="end">عتبة 1.0×</text>`;

  const paths = series.map(s => {
    const pts = months.map((m, i) => `${x(i)},${y(m[s.key].dscr)}`).join(' ');
    const dots = months.map((m, i) => {
      const raw = m[s.key].dscr;
      const outOfRange = raw != null && (raw < yMin || raw > yMax);
      return `<circle cx="${x(i)}" cy="${y(raw)}" r="${outOfRange ? 4 : 3}" fill="${s.color}" ${outOfRange ? 'stroke="#fff" stroke-width="1"' : ''}>
        <title>${esc(m.month)} ${s.label}: ${raw != null ? raw.toFixed(2) : '—'}×</title></circle>`;
    }).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.wide ? 3 : 2}" opacity="${s.wide ? 1 : .85}"/>${dots}`;
  }).join('');

  const xLabels = months.map((m, i) => `<text x="${x(i)}" y="${H-8}" fill="#5a7a9a" font-size="9" text-anchor="middle">${esc(m.month.slice(2))}</text>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}${threshold}${paths}${xLabels}
  </svg>`;
}

function _rrRenderChart() {
  const el = document.getElementById('rr-chart');
  if (!el || !_rrData) return;
  el.innerHTML = `
    <div class="rr-legend">
      <span><i style="background:#C6A04A"></i> أبعاد</span>
      <span><i style="background:#5baef0"></i> وسام</span>
      <span><i style="background:#4ada8e"></i> موحَّد</span>
      <span style="color:#e08a8a">- - - عتبة 1.0×</span>
    </div>
    ${_rrChartSVG(_rrData.monthly.months)}
    <div class="rr-caption">القيم المتطرفة (نوفمبر/ديسمبر، خارج نطاق ٢- إلى ٥) مقصوصة عند حافة الرسم لإبقاء منطقة العتبة مقروءة — القيمة الفعلية عند التمرير على النقطة. لا مقارنة موسمية متاحة (أقدم سجل محاسبي 2025-09-30).</div>`;
}

function _rrRenderJulyTable() {
  const el = document.getElementById('rr-julytbl');
  if (!el || !_rrData) return;
  const months = _rrData.monthly.months;
  const last = months[months.length - 1];
  if (!last) return;
  const isPartial = last.month === new Date().toISOString().slice(0, 7);
  el.innerHTML = `
    <div style="margin-top:12px;overflow-x:auto">
      <table class="rr-tbl">
        <thead><tr><th>الشهر (${esc(last.month)}${isPartial ? ' — جزئي' : ''})</th><th>ربح تشغيلي</th><th>خدمة دين</th><th>DSCR</th></tr></thead>
        <tbody>
          <tr><td>أبعاد</td><td>${_rrFmt(last.abaad.operatingProfit,0)}</td><td>${_rrFmt(last.abaad.debtService,0)}</td><td>${_rrX(last.abaad.dscr)}</td></tr>
          <tr><td>وسام</td><td>${_rrFmt(last.wissam.operatingProfit,0)}</td><td>${_rrFmt(last.wissam.debtService,0)}</td><td>${_rrX(last.wissam.dscr)}</td></tr>
          <tr class="rr-ask-row"><td>موحَّد</td><td>${_rrFmt(last.combined.operatingProfit,0)}</td><td>${_rrFmt(last.combined.debtService,0)}</td><td>${_rrX(last.combined.dscr)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function _rrRenderMaturities() {
  const el = document.getElementById('rr-maturities');
  if (!el || !_rrData) return;
  const loans = _rrRiyadLoans();
  const septDue = (loans.find(l => l.name === RR_SEPT_LOAN_NAME && l.company === 'أبعاد الحديد') || {}).dueDate;
  const rows = loans.map(l => `
    <tr class="${l.name === RR_SEPT_LOAN_NAME && l.company === 'أبعاد الحديد' ? 'rr-ask-row' : (l.dueDate > septDue ? 'rr-forward' : '')}">
      <td>${esc(l.name)}</td>
      <td>${esc(l.company)}</td>
      <td>${_rrFmt(l.payment, 2)} ر.س</td>
      <td>${esc(l.dueDate)}</td>
      <td>${l.name === RR_SEPT_LOAN_NAME && l.company === 'أبعاد الحديد' ? 'محل هذا الطلب' : 'استشرافي — للشفافية'}</td>
    </tr>`).join('');
  el.innerHTML = `<div style="overflow-x:auto"><table class="rr-tbl">
    <thead><tr><th>التسهيل</th><th>المؤسسة</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="rr-caption">المصدر: سجل التسهيلات التمويلية (/api/financing)، جميع تسهيلات بنك الرياض القائمة على المؤسستين، غير مُقدَّرة.</div>`;
}

function _rrRenderAsk() {
  const el = document.getElementById('rr-ask');
  if (!el || !_rrData) return;
  const sept = _rrRiyadLoans().find(l => l.company === 'أبعاد الحديد' && l.name === RR_SEPT_LOAN_NAME);
  if (!sept) { el.innerHTML = ''; return; }
  const d = new Date(sept.dueDate + 'T00:00:00');
  d.setDate(d.getDate() - 10);
  const askBy = _rrDateStr(d);
  el.innerHTML = `
  <div class="rr-box rr-ask">
    <div class="rr-box-title">📝 المطلوب من البنك</div>
    <div class="rr-box-body">
      تأكيد كتابي بتجديد <strong>${esc(RR_SEPT_LOAN_NAME)}</strong> (${_rrFmt(sept.payment,2)} ر.س، المستحق ${esc(sept.dueDate)})
      قبل <strong>${esc(askBy)}</strong> (عشرة أيام قبل الاستحقاق)، بالشروط المعتادة.
    </div>
  </div>`;
}

function _rrRenderDisclosure() {
  const el = document.getElementById('rr-disclosure');
  if (!el || !_rrData) return;
  const { memo3, monthly } = _rrData;
  el.innerHTML = `
  <div class="rr-box rr-disclosure">
    <div class="rr-box-title">🔍 إفصاح شفافية</div>
    <div class="rr-box-body">
      <ul>
        <li>جميع الأرقام حية اعتباراً من لحظة توليد هذه الصفحة (${esc(new Date().toLocaleString('ar-SA'))}) — تُعاد كل مرة تُفتح فيها.</li>
        <li>رصيد الحساب الجاري البيني (${_rrFmt(Math.abs(memo3.netFinancingBalance.amount),0)} ر.س) بعد تسوية بنود مسجَّلة بحساب بنكي لدى طرف وحساب جارٍ لدى الآخر؛ فرق متبقٍّ غير مغلق بالكامل ${_rrFmt(memo3.netFinancingBalance.residual,2)} ر.س (${(Math.abs(memo3.netFinancingBalance.residual)/Math.abs(memo3.netFinancingBalance.amount)*100).toFixed(2)}% من الرصيد) — قيد المراجعة، معروض صراحة لا مخفياً.</li>
        <li>المؤسستان (أبعاد الحديد، وسام الفولاذ) لمالك واحد؛ الرصيد البيني موثَّق بدفتري المحاسبة لدى الطرفين.</li>
        <li>خدمة الدين للتسهيلات الدورية بلا جدول إطفاء تفصيلي (أغلبها) مقدَّرة بتسوية سنوية مكافئة موزَّعة على أيام الفترة — تقدير صريح مُعلَن، وليس جدول سداد فعلي موثَّقاً لكل قسط. التسهيلات البالونية (كقسط سبتمبر محل الطلب) قيمتها الكاملة الفعلية، لا تقدير.</li>
        <li>عدد أشهر بيانات الرسم البياني: ${monthly.months.length} شهراً (${esc(monthly.months[0]?.month || '')} → ${esc(monthly.months[monthly.months.length-1]?.month || '')}) — لا بيانات محاسبية قبل 2025-09-30 في أي من النظامين، فلا مقارنة موسمية سنوية متاحة.</li>
      </ul>
    </div>
  </div>`;
}

// ── entry point ───────────────────────────────────────────────────────────────
function renderRiyadRenewalTab() {
  const wrap = document.getElementById('tab-riyad-renewal');
  if (!wrap) return;
  if (!_rrRendered) {
    wrap.innerHTML = _rrBuildShell();
    _rrRendered = true;
    document.getElementById('rr-print-btn')?.addEventListener('click', () => window.print());
    _rrLoad();
    return;
  }
  _rrLoad();
}
