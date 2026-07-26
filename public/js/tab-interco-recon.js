'use strict';
/* ── Tab: التسوية البينية أبعاد ↔ وسام (v2.2 — تصنيف خماسي + مذكرات 2/3 عبر أربعة حسابات) ── */

const IC_VERSION = 'v2.2';
const IC_REFRESH_SEC = 120;

let _icData     = null;
let _icMemo2    = null;
let _icMemo3    = null;
// Default to dirB — it carries 82% document-reference coverage live (dirA
// carries 3.8%); opening on the low-coverage direction showed the user a
// near-solid-red screen on first load. NOTE: dirB's label in the data is
// 'وسام → أبعاد' (Wissam sells to Abaad), not 'أبعاد تبيع' — flagged back to
// the user rather than silently relabeling which direction is which.
let _icDir      = 'B';
let _icTimer    = null;
let _icLoading  = false;
let _icRendered = false;

function _icIsActive() { return !!document.querySelector('.tab.active[data-tab="interco-recon"]'); }
function _icStopTimer() { if (_icTimer) { clearInterval(_icTimer); _icTimer = null; } }

/* ── Formatters ──────────────────────────────────────────────────────── */
function _fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return Math.abs(n).toLocaleString('ar-SA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function _fmtSigned(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return (n < 0 ? '-' : '+') + _fmt(n, decimals);
}
function _cls(n) { return n > 0 ? 'ic-val-pos' : n < 0 ? 'ic-val-neg' : 'ic-val-neu'; }
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ── Account naming — single source of truth, no raw variable-name keys
   (db1Cust/db1Supp/db2Cust/db2Supp) may ever reach the DOM or a CSV. ────── */
const IC_ACCOUNT_LABELS = {
  db1Cust: 'أبعاد — عملاء',
  db1Supp: 'أبعاد — موردون',
  db2Cust: 'وسام — عملاء',
  db2Supp: 'وسام — موردون',
};
function _icAccLabel(key) { return IC_ACCOUNT_LABELS[key] || key; }

/* ── Reference cleanup — 'افتراضي' and '1' are the ERP's placeholder values for
   "no real document number entered", not real references; never show them
   to a user. Fall back to the internal document ID when one is available. ── */
/* ── Category-5 display split (v2.2) — purely presentational: rows matching
   these patterns are already proven matched by Memo 3's live reconciliation,
   so they no longer read as an unexplained third-party/error. cat.count and
   cat.total below are left untouched (still the true closure-control total)
   — only the row grouping in the UI changes. ─────────────────────────────── */
const IC_BANK_FIN_RX = /قرض|تمويل|الرياض|راجحي/;
const IC_ASN_RX = /ASN|اماراتي|الامارات/i;
const IC_BEIT_ALI_RX = /بيت علي/;
function _icRowKey(r) { return `${r.txDate}|${r.amount}|${r.account}|${r.lineDesc||''}|${r.hdrDesc||''}`; }

const IC_PLACEHOLDER_REFS = new Set(['افتراضي', '1']);
function _icCleanRefPlain(ref, docId) {
  if (ref && !IC_PLACEHOLDER_REFS.has(ref)) return ref;
  return docId != null ? `#${docId}` : '—';
}
function _icCleanRef(ref, docId) { return _esc(_icCleanRefPlain(ref, docId)); }

/* ── CSS ─────────────────────────────────────────────────────────────── */
const IC_CSS = `
<style id="ic-style">
#tab-interco-recon{font-family:'Cairo','Tajawal',sans-serif;direction:rtl;padding:18px;color:#e8e0cc}
.ic-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.ic-title-row{display:flex;align-items:center;gap:10px}
.ic-title{font-size:1.25rem;font-weight:700;color:#C9A84C;letter-spacing:.3px}
.ic-version-badge{background:#13284a;border:1px solid #C9A84C;color:#C9A84C;font-size:.7rem;font-weight:700;padding:2px 10px;border-radius:12px}
.ic-status-bar{font-size:.75rem;color:#506070;margin-top:2px;white-space:nowrap}
.ic-refresh{background:#13284a;border:1px solid #C9A84C44;color:#C9A84C;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:.8rem}
.ic-refresh:hover{background:#1d3a5c}
.ic-banner{border-radius:10px;padding:14px 22px;display:flex;align-items:center;gap:14px;margin-bottom:16px;font-size:1rem;font-weight:700}
.ic-banner.bad{background:#2b0d0d;border:1.5px solid #da4a4a;color:#ff9a9a}
.ic-banner.ok{background:#0d2b1a;border:1.5px solid #3ab36a;color:#7adca0}
.ic-banner.warn{background:#2b220d;border:1.5px solid #d0a53a;color:#e0c070}
.ic-banner-icon{font-size:1.6rem;line-height:1}
.ic-banner-sub{font-size:.82rem;font-weight:400;color:#c0a0a0}
.ic-bal-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.ic-bal-card{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:12px 14px}
.ic-bal-card-title{font-size:.78rem;color:#C9A84C;font-weight:700;margin-bottom:8px;border-bottom:1px solid #1e3a5a;padding-bottom:6px}
.ic-bal-row{display:flex;justify-content:space-between;padding:3px 0;font-size:.8rem}
.ic-bal-lbl{color:#9ab0c4}
.ic-val-pos{color:#4ada8e}
.ic-val-neg{color:#ff7a7a}
.ic-val-neu{color:#e8e0cc}
.ic-cat-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
.ic-cat-card{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:12px 14px;cursor:pointer}
.ic-cat-card.active{border-color:#C9A84C}
.ic-cat-card .n{font-size:.72rem;color:#C9A84C;font-weight:700;margin-bottom:6px}
.ic-cat-card .amt{font-size:1rem;font-weight:700;color:#e8e0cc}
.ic-cat-card .cnt{font-size:.72rem;color:#7a9ab0;margin-top:2px}
.ic-cat-card.match .amt{color:#4ada8e}
.ic-cat-card.flag .amt{color:#e08030}
.ic-section{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:16px 20px;margin-bottom:14px}
.ic-section-title{font-size:.88rem;font-weight:700;color:#C9A84C;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.ic-dir-tabs{display:flex;gap:8px;margin-bottom:10px}
.ic-dir-tab{padding:5px 18px;border-radius:20px;border:1px solid #2a4060;background:#0d1c30;color:#9ab0c4;cursor:pointer;font-size:.82rem}
.ic-dir-tab.active{background:#1d3a5c;border-color:#C9A84C;color:#C9A84C;font-weight:700}
.ic-coverage-note{font-size:.76rem;color:#e0b030;background:#1c1608;border:1px solid #4a3a10;border-radius:6px;padding:6px 10px;margin-bottom:8px}
.ic-tbl{width:100%;border-collapse:collapse;font-size:.8rem}
.ic-tbl th{background:#0d1c30;padding:7px 10px;text-align:right;color:#9ab0c4;font-weight:600;border-bottom:1px solid #1e3a5a}
.ic-tbl td{padding:6px 10px;border-bottom:1px solid #12243a;vertical-align:middle}
.ic-tbl tr.confirmed{background:#0d2418}
.ic-tbl tr.probable{background:#1c1c08}
.ic-tbl tr.unmatched{background:#1c1008}
.ic-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700}
.ic-badge-confirmed{background:#0d4a2a;color:#4ada8e;border:1px solid #3ab36a44}
.ic-badge-probable{background:#3a3608;color:#e0d030;border:1px solid #e0d03044}
.ic-badge-unmatched{background:#3a1a08;color:#e08030;border:1px solid #e0803044}
.ic-csv-btn{background:#13284a;border:1px solid #C9A84C44;color:#C9A84C;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:.72rem}
.ic-meth{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;margin-bottom:14px}
.ic-meth-hdr{padding:10px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;color:#C9A84C;font-size:.85rem;font-weight:700}
.ic-meth-body{padding:0 16px 14px;font-size:.8rem;color:#9ab0c4;line-height:1.7;display:none}
.ic-meth-body.open{display:block}
.ic-meth-body p{margin:6px 0}
.ic-meth-body strong{color:#C9A84C}
.ic-empty{color:#5a7090;padding:10px;font-size:.82rem}
.ic-memo{background:#0f2038;border:1.5px solid #C9A84C55;border-radius:10px;padding:16px 22px;margin-bottom:16px}
.ic-memo-hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:6px}
.ic-memo-title{font-size:1.02rem;font-weight:700;color:#C9A84C}
.ic-memo-asof{font-size:.74rem;color:#7a9ab0}
.ic-memo-bridge{font-family:'Consolas','Courier New',monospace;font-size:.86rem;background:#0a1729;border:1px solid #1e3a5a;border-radius:8px;padding:12px 16px;margin-bottom:10px}
.ic-memo-row{display:flex;justify-content:space-between;padding:3px 0}
.ic-memo-row .lbl{color:#9ab0c4}
.ic-memo-row .val{font-weight:700}
.ic-memo-row.sub .lbl{color:#7a9ab0;padding-right:14px}
.ic-memo-row.rule{border-top:1px solid #2a4060;margin-top:4px;padding-top:6px}
.ic-memo-row.total .lbl,.ic-memo-row.total .val{color:#C9A84C;font-weight:700}
.ic-memo-row.residual .val{color:#e0b030}
.ic-memo-line{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid #1e3a5a;border-radius:6px;margin-bottom:6px;cursor:pointer}
.ic-memo-line:hover{background:#132a45}
.ic-memo-line .lbl{font-size:.82rem;color:#e8e0cc}
.ic-memo-line .meta{font-size:.72rem;color:#7a9ab0}
.ic-memo-diag{background:#1c1608;border:1px solid #4a3a10;border-radius:8px;padding:10px 14px;margin:8px 0;font-size:.8rem;color:#e0c070}
.ic-memo-diag .amt{font-weight:700;color:#e0b030}
.ic-memo-docs{display:none;overflow-x:auto;max-height:340px;overflow-y:auto;margin-top:6px}
.ic-memo-docs.open{display:block}
.ic-memo-headline{background:#0a1729;border:1.5px solid #4ada8e88;border-radius:8px;padding:14px 18px;margin-top:10px}
.ic-memo-headline .amt{font-size:1.3rem;font-weight:700;color:#4ada8e}
.ic-memo-headline .sub{font-size:.76rem;color:#7a9ab0;margin-top:6px;line-height:1.6}
@media(max-width:900px){.ic-bal-grid,.ic-cat-grid{grid-template-columns:1fr 1fr}}
</style>`;

/* ── Shell ───────────────────────────────────────────────────────────── */
function _icBuildShell() {
  return IC_CSS + `
  <div class="ic-hdr">
    <div>
      <div class="ic-title-row">
        <div class="ic-title">التسوية البينية — أبعاد ↔ وسام</div>
        <span class="ic-version-badge">${IC_VERSION}</span>
      </div>
      <div id="ic-status" class="ic-status-bar">جارٍ التحميل…</div>
    </div>
    <button class="ic-refresh" onclick="_icLoad()">🔄 تحديث النسخة</button>
  </div>
  <div id="ic-memo2-section"></div>
  <div id="ic-memo3-section"></div>
  <div id="ic-content"></div>`;
}

/* ── Content ─────────────────────────────────────────────────────────── */
function _icRenderContent(d) {
  const el = document.getElementById('ic-content');
  if (!el) return;
  el.innerHTML = _icClosureBanner(d) + (d.closure.ok ? _icBody(d) : '') + _icMeth(d);
  if (d.closure.ok) _icRenderTxSection();
}

function _icClosureBanner(d) {
  const c = d.closure;
  if (c.ok) return '';
  return `
  <div class="ic-banner bad">
    <div class="ic-banner-icon">⛔</div>
    <div>
      <div>المصنّف لا يغطي كل الحركات — لا تعتمد النتيجة</div>
      <div class="ic-banner-sub">صفوف غير مصنَّفة: ${_fmt(c.unclassifiedCount, 0)} · فرق المبلغ: ${_fmtSigned(c.unclassifiedAmount, 2)} ر.س
        (الإجمالي ${_fmt(c.totalTurnoverAmount, 0)} ر.س مقابل المصنَّف ${_fmt(c.classifiedAmount, 0)} ر.س)</div>
    </div>
  </div>`;
}

function _icBody(d) {
  return _icCashFlowGuard(d) + _icBalGrid(d) + _icVatCheck(d) + _icCategoryGrid(d)
    + _icTradeSection(d) + _icCashSection(d) + _icListSection('sharedCost', d.categories.sharedCost, 'تكاليف مشتركة')
    + _icOwnerDrawsSection(d) + _icThirdPartySection(d) + _icMonthlySection(d);
}

function _icCashFlowGuard(d) {
  const cf = d.cashFlowCheck;
  if (cf.ok) return '';
  return `
  <div class="ic-banner warn">
    <div class="ic-banner-icon">⚠️</div>
    <div>
      <div>حارس التدفقات النقدية: الأرصدة لا تتطابق مرآتياً</div>
      <div class="ic-banner-sub">
        صافي تدفق أبعاد ${_fmtSigned(cf.diffs.db1NetOutflow,0)} ر.س · صافي تدفق وسام ${_fmtSigned(cf.diffs.db2NetInflow,0)} ر.س · الفارق ${_fmtSigned(cf.diffs.sum,0)} ر.س<br>
        الأسباب المرجَّحة، بحسب الوزن الفعلي: ${cf.probableCauses.map((c,i)=>`${i+1}) ${c}`).join(' · ')}
      </div>
    </div>
  </div>`;
}

function _icBalGrid(d) {
  const cards = Object.entries(d.accounts).map(([key, a]) => `
    <div class="ic-bal-card">
      <div class="ic-bal-card-title">${_icAccLabel(key)}</div>
      <div class="ic-bal-row"><span class="ic-bal-lbl">افتتاحي</span><span>${_fmtSigned(a.opening,0)}</span></div>
      <div class="ic-bal-row"><span class="ic-bal-lbl">حركة الفترة (مدين/دائن)</span><span>${_fmt(a.periodDebit,0)} / ${_fmt(a.periodCredit,0)}</span></div>
      <div class="ic-bal-row"><span class="ic-bal-lbl">ختامي</span><span class="${_cls(a.closing)}">${_fmtSigned(a.closing,0)}</span></div>
    </div>`).join('');
  return `<div class="ic-bal-grid">${cards}</div>`;
}

function _icVatCheck(d) {
  const v = d.vatCheck;
  const pct = a => a.gap === 0 ? 100 : Math.min(100, Math.abs(a.implied) > 0 ? 100 : 0);
  const dirCard = (label, gap, implied) => {
    const explainedPct = implied !== 0 ? Math.min(100, Math.abs(gap) / Math.abs(implied) * 100) : 100;
    const tone = Math.abs(gap) < 5 ? 'ok' : 'warn';
    return `<div class="ic-bal-row"><span class="ic-bal-lbl">${label}</span>
      <span>فرق ضريبي ${_fmtSigned(gap,2)} ← فواتير مقدَّرة ${_fmtSigned(implied,2)} ر.س
      <span class="ic-badge ${tone==='ok'?'ic-badge-confirmed':'ic-badge-probable'}">${tone==='ok'?'مطابق':'يحتاج مراجعة'}</span></span></div>`;
  };
  return `
  <div class="ic-section">
    <div class="ic-section-title">فحص ضريبة القيمة المضافة ← ترجمة لقيمة فواتير</div>
    ${dirCard('أبعاد ح.88 مبيعات ↔ وسام ح.64 مشتريات', v.gapA, v.impliedInvoiceValueA)}
    ${dirCard('وسام ح.88 مبيعات ↔ أبعاد ح.64 مشتريات', v.gapB, v.impliedInvoiceValueB)}
  </div>`;
}

function _icCategoryGrid(d) {
  const c = d.categories;
  const card = (key, label, count, total, cls) => `
    <div class="ic-cat-card ${cls}"><div class="n">${label}</div><div class="amt">${_fmt(total,0)} ر.س</div><div class="cnt">${_fmt(count,0)} حركة</div></div>`;
  // Only categories 1+2 have real cross-book matching logic — category 3 is
  // classified by keyword, not paired, so it can't honestly count toward a
  // "matched" percentage. Shown separately in its own card instead.
  const matchEligible = c.trade.total + c.cash.count;
  const matchFound     = c.trade.matched * 2 + c.cash.matchedCount * 2;
  const matchRate = matchEligible ? Math.min(100, matchFound / matchEligible * 100) : 0;
  return `
  <div class="ic-section">
    <div class="ic-section-title">
      <span>التصنيف الخماسي — عبر الحسابات الأربعة مجتمعة</span>
      <span style="font-size:.78rem;color:#7a9ab0;font-weight:400">مؤشر المطابقة (فئتا 1 و2 فقط — الفئة 3 مصنَّفة بالوصف لا مطابَقة زوجياً): ${matchRate.toFixed(1)}%</span>
    </div>
    <div class="ic-cat-grid">
      ${card(1, 'تجاري بيني (فواتير)', c.trade.total, c.trade.amount, 'match')}
      ${card(2, 'نقد بيني (سندات)', c.cash.count, c.cash.total, 'match')}
      ${card(3, 'تكاليف مشتركة', c.sharedCost.count, c.sharedCost.total, 'match')}
      ${card(4, 'مسحوبات مالك', c.ownerDraws.count, c.ownerDraws.total, 'flag')}
      ${card(5, 'أطراف ثالثة وأخطاء ترحيل', c.thirdPartyErrors.count, c.thirdPartyErrors.total, 'flag')}
    </div>
  </div>`;
}

function _icDirCounter(dir) {
  const matched = dir.transactions.filter(r => r.status === 'matched').length;
  const unmatched = dir.transactions.length - matched;
  return `<div style="font-size:.8rem;margin-bottom:8px">
    <span class="ic-badge ic-badge-confirmed">✅ مطابقة: ${_fmt(matched,0)}</span>
    <span class="ic-badge ic-badge-unmatched" style="margin-right:6px">🔴 غير مطابقة: ${_fmt(unmatched,0)}</span>
  </div>`;
}

function _icTradeSection(d) {
  const t = d.categories.trade;
  const cov = t.coverage;
  const activeDir = _icDir === 'A' ? t.dirA : t.dirB;
  const activeCov = _icDir === 'A' ? cov.dirA : cov.dirB;
  return `
  <div class="ic-section">
    <div class="ic-section-title">
      <span>فئة 1 — تجاري بيني (فواتير)</span>
      <button class="ic-csv-btn" onclick="icExportCsv('trade')">⬇ CSV</button>
    </div>
    <div class="ic-dir-tabs">
      <button class="ic-dir-tab ${_icDir==='A'?'active':''}" onclick="icSetDir('A')">${t.dirA.label} — تغطية مرجعية ${cov.dirA.pct}%</button>
      <button class="ic-dir-tab ${_icDir==='B'?'active':''}" onclick="icSetDir('B')">${t.dirB.label} — تغطية مرجعية ${cov.dirB.pct}%</button>
    </div>
    ${_icDirCounter(activeDir)}
    ${activeCov.pct < 10 ? `<div class="ic-coverage-note">هذا الاتجاه — مطابقة بالمبلغ والتاريخ فقط — ثقة أدنى (لا يوجد مرجع مستند موثوق لدى معظم الحركات)</div>` : ''}
    <div id="ic-tx-section"></div>
    ${_icCancelledNoMirror(t.cancelledNoMirror, d.categories.thirdPartyErrors)}
  </div>`;
}

function _icCancelledNoMirror(list, thirdParty) {
  if (!list.length) return '';
  const vatMap = new Map((thirdParty.cancelledInvoiceVat||[]).map(v => [v.salesInvoiceId, v]));
  const rows = list.map(c => {
    const vat = vatMap.get(c.salesInvoiceId);
    return `<tr><td>${c.salesInvoiceId}</td><td>${_fmt(c.amount,2)}</td><td>${c.returnDate}</td>
      <td>${c.matchedDb2PurchaseInvoiceDate || '—'}</td>
      <td>${vat && vat.inputVat != null ? _fmt(vat.inputVat,2) : '—'}</td>
      <td>${vat && vat.note ? vat.note : (vat ? '' : '—')}</td></tr>`;
  }).join('');
  return `
  <div style="margin-top:14px">
    <div class="ic-section-title">
      <span>فواتير أبعاد المُلغاة بالكامل بلا مرتجع مقابل لدى وسام (${list.length}) — تحتاج تصحيح لدى وسام، ليست فجوة مطابقة</span>
      <button class="ic-csv-btn" onclick="icExportCsv('tradeCancelled')">⬇ CSV</button>
    </div>
    <div style="overflow-x:auto"><table class="ic-tbl">
      <thead><tr><th>رقم فاتورة أبعاد</th><th>المبلغ (شامل الضريبة)</th><th>تاريخ الإلغاء</th><th>فاتورة شراء وسام المطابقة</th><th>ضريبة مدخلات وسام على هذه الفاتورة</th><th>ملاحظة</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="font-size:.76rem;color:#7a9ab0;margin-top:6px">ضريبة مدخلات على فواتير ملغاة — أثر على الإقرار. الإجمالي: ${_fmt(thirdParty.cancelledInvoiceVatTotal,2)} ر.س. المبالغ أعلاه مأخوذة من حساب الذمم (47) وهي شاملة الضريبة؛ ضريبة المدخلات المعروضة مسحوبة مباشرة من حساب 64 وليست مشتقة من الإجمالي.</div>
  </div>`;
}

const IC_TX_ROW_CAP = 200;

function _icTxTable(dir) {
  const txs = dir.transactions;
  if (!txs.length) return `<div class="ic-empty">لا توجد حركات في هذا الاتجاه</div>`;
  // Unmatched rows first — they're what needs review; matched rows are the
  // ones most likely to get truncated by the cap, and that's the right
  // trade-off (nothing needing attention should ever be hidden by the cap).
  const sorted = [...txs].sort((a, b) => (a.status === 'matched') - (b.status === 'matched'));
  const rows = sorted.slice(0, IC_TX_ROW_CAP).map(r => {
    const trCls = r.status === 'matched' ? r.matchTier : 'unmatched';
    const badge = r.status === 'matched'
      ? (r.matchTier === 'confirmed' ? `<span class="ic-badge ic-badge-confirmed">✅ مؤكدة (مرجع)</span>` : `<span class="ic-badge ic-badge-probable">◐ مرجّحة (مبلغ+تاريخ)</span>`)
      : `<span class="ic-badge ic-badge-unmatched">🔴 غير مطابقة</span>`;
    return `<tr class="${trCls}">
      <td>${r.txDate}</td><td>${_icCleanRef(r.ref, r.docId)}</td><td style="text-align:left">${_fmtSigned(r.amount,2)}</td>
      <td>${r.matchedWith ? r.matchedWith.txDate : '—'}</td><td style="text-align:left">${r.matchedWith ? _fmtSigned(r.matchedWith.amount,2) : '—'}</td>
      <td>${badge}</td></tr>`;
  }).join('');
  return `<div style="overflow-x:auto;max-height:420px;overflow-y:auto"><table class="ic-tbl">
    <thead><tr><th>التاريخ</th><th>المرجع</th><th>المبلغ</th><th>تاريخ الطرف الآخر</th><th>مبلغ الطرف الآخر</th><th>الحالة</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${txs.length > IC_TX_ROW_CAP ? `<div class="ic-empty">+ ${txs.length - IC_TX_ROW_CAP} حركة أخرى (غير المطابقة معروضة أولاً) — استخدم التصدير</div>` : ''}`;
}

function _icRenderTxSection() {
  if (!_icData) return;
  const el = document.getElementById('ic-tx-section');
  if (!el) return;
  const t = _icData.categories.trade;
  el.innerHTML = _icTxTable(_icDir === 'A' ? t.dirA : t.dirB);
}

function _icCashSection(d) {
  const c = d.categories.cash;
  const sorted = [...c.transactions].sort((a, b) => (a.status === 'matched') - (b.status === 'matched'));
  const rows = sorted.slice(0, 200).map(r => {
    const cls = r.status === 'matched' ? 'confirmed' : 'unmatched';
    const badge = r.status === 'matched' ? `<span class="ic-badge ic-badge-confirmed">✅ متطابقة</span>` : `<span class="ic-badge ic-badge-unmatched">🔴 غير مطابقة</span>`;
    return `<tr class="${cls}"><td>${r.txDate}</td><td>${_esc(_icAccLabel(r.account))}</td><td style="text-align:left">${_fmtSigned(r.amount,2)}</td>
      <td>${_esc(r.lineDesc||r.hdrDesc||'')}</td><td>${badge}</td></tr>`;
  }).join('');
  return `
  <div class="ic-section">
    <div class="ic-section-title">
      <span>فئة 2 — نقد بيني (سندات) — مجمَّعة عبر الحسابات الأربعة، غير مقيَّدة بزوج واحد</span>
      <span style="font-size:.78rem;color:#7a9ab0">متطابقة ${c.matchedCount} · غير متطابقة ${c.unmatchedCount}</span>
      <button class="ic-csv-btn" onclick="icExportCsv('cash')">⬇ CSV</button>
    </div>
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto"><table class="ic-tbl">
      <thead><tr><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>البيان</th><th>الحالة</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${c.transactions.length > 200 ? `<div class="ic-empty">+ ${c.transactions.length-200} حركة أخرى (غير المطابقة معروضة أولاً) — استخدم التصدير</div>` : ''}
  </div>`;
}

function _icListSection(key, cat, title) {
  const rows = cat.transactions.slice(0, 100).map(r =>
    `<tr><td>${r.txDate}</td><td>${_esc(_icAccLabel(r.account))}</td><td style="text-align:left">${_fmtSigned(r.amount,2)}</td><td>${_esc(r.lineDesc||r.hdrDesc||'')}</td></tr>`
  ).join('');
  if (!cat.transactions.length) return '';
  return `
  <div class="ic-section">
    <div class="ic-section-title"><span>فئة 3 — ${title} (لا تُحتسب كفجوة — تُطابق تلقائياً بالوصف)</span>
      <span style="font-size:.78rem;color:#7a9ab0">${cat.count} حركة · ${_fmt(cat.total,0)} ر.س</span></div>
    <div style="overflow-x:auto;max-height:280px;overflow-y:auto"><table class="ic-tbl">
      <thead><tr><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>البيان</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${cat.transactions.length > 100 ? `<div class="ic-empty">+ ${cat.transactions.length-100} حركة أخرى</div>` : ''}
  </div>`;
}

function _icOwnerDrawsSection(d) {
  const cat = d.categories.ownerDraws;
  if (!cat.transactions.length) return '';
  const rows = cat.transactions.map(r => {
    const isBeitAli = IC_BEIT_ALI_RX.test(`${r.lineDesc||''} ${r.hdrDesc||''}`);
    const badge = isBeitAli ? ` <span class="ic-badge ic-badge-confirmed">مموَّل عبر الحساب الجاري — مطابَق، انظر المذكرة 3</span>` : '';
    return `<tr><td>${r.txDate}</td><td>${_esc(_icAccLabel(r.account))}</td><td style="text-align:left">${_fmtSigned(r.amount,2)}</td><td>${_esc(r.lineDesc||r.hdrDesc||'')}${badge}</td></tr>`;
  }).join('');
  return `
  <div class="ic-section">
    <div class="ic-section-title"><span>فئة 4 — مسحوبات مالك (لا تُطابَق — قائمة فقط)</span>
      <span style="font-size:.78rem;color:#7a9ab0">${cat.count} حركة · ${_fmt(cat.total,0)} ر.س</span></div>
    <div style="overflow-x:auto"><table class="ic-tbl">
      <thead><tr><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>البيان</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}

function _icThirdPartySection(d) {
  const cat = d.categories.thirdPartyErrors;
  const rowHtml = r => `<tr><td>${r.txDate}</td><td>${_esc(_icAccLabel(r.account))}</td><td style="text-align:left">${_fmtSigned(r.amount,2)}</td><td>${_esc(r.lineDesc||r.hdrDesc||'')}</td></tr>`;

  const asnKeys = new Set(cat.asnTable.map(_icRowKey));
  const bankFinRows = cat.transactions.filter(r => !asnKeys.has(_icRowKey(r)) && IC_BANK_FIN_RX.test(`${r.lineDesc||''} ${r.hdrDesc||''}`));
  const bankFinKeys = new Set(bankFinRows.map(_icRowKey));
  const restRows = cat.transactions.filter(r => !asnKeys.has(_icRowKey(r)) && !bankFinKeys.has(_icRowKey(r)));

  const rows = restRows.slice(0, 150).map(rowHtml).join('');
  const bankFinHtml = bankFinRows.map(rowHtml).join('');
  const asnRows = cat.asnTable.map(rowHtml).join('');
  return `
  <div class="ic-section">
    <div class="ic-section-title"><span>فئة 5 — أطراف ثالثة وأخطاء ترحيل (لا تُطابَق — قائمة للتصحيح)</span>
      <span style="font-size:.78rem;color:#7a9ab0">${cat.count} حركة · ${_fmt(cat.total,0)} ر.س — إجمالي الفئة كما في ضابط الإغلاق، لم يتغيّر</span>
      <button class="ic-csv-btn" onclick="icExportCsv('thirdParty')">⬇ CSV</button></div>
    ${bankFinRows.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:.8rem;font-weight:700;color:#4ada8e;margin-bottom:6px">تمويل بنكي مطابَق — ليس طرفاً ثالثاً ولا خطأ ترحيل (انظر المذكرة 3) — ${bankFinRows.length} بند · ${_fmt(bankFinRows.reduce((s,r)=>s+Math.abs(r.amount),0),0)} ر.س</div>
      <div style="overflow-x:auto"><table class="ic-tbl">
        <thead><tr><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>البيان</th></tr></thead>
        <tbody>${bankFinHtml}</tbody></table></div>
    </div>` : ''}
    ${cat.asnTable.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:.8rem;font-weight:700;color:#e08030;margin-bottom:6px">قيد التتبع — يستلزم مطابقة كشف بنكي (ASN / أطراف إماراتية) — بلا مقاصة</div>
      <div style="overflow-x:auto"><table class="ic-tbl">
        <thead><tr><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>البيان</th></tr></thead>
        <tbody>${asnRows}</tbody></table></div>
    </div>` : ''}
    <div style="overflow-x:auto;max-height:320px;overflow-y:auto"><table class="ic-tbl">
      <thead><tr><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>البيان</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${restRows.length > 150 ? `<div class="ic-empty">+ ${restRows.length-150} حركة أخرى — استخدم التصدير</div>` : ''}
  </div>`;
}

function _icDirectionLabel(amount) {
  return amount < 0 ? 'وسام مدينة لأبعاد' : 'أبعاد مدينة لوسام';
}

// The reconciled headline depends on Memo 3 (/api/interco-recon/memo3), fetched
// independently and possibly not resolved yet on first render — this renders a
// placeholder until _icLoadMemo3() calls _icRefreshMonthlyHeadline().
function _icMonthlyHeadlineHtml() {
  if (!_icMemo3) return `<div class="ic-empty">جارٍ التحقق من التسوية (المذكرة 3)…</div>`;
  const nf = _icMemo3.netFinancingBalance;
  const amt = _icMemo3.reconciled.db2Net; // the figure the user confirmed the direction label against
  return `
  <div class="ic-memo-headline">
    <div>رصيد التمويل البيني الصافي (بعد ضم الحسابات البنكية — المذكرة 3)</div>
    <div class="amt">${_fmt(Math.abs(amt),0)} ر.س — ${_icDirectionLabel(amt)}</div>
    <div class="sub">أساس دفتر أبعاد: ${_fmtSigned(nf.amount,2)} ر.س · تقاطع دفتر وسام: ${_fmtSigned(nf.crossCheckWissam,2)} ر.س · فرق متبقٍّ (غير مصفَّر قسراً): ${_fmtSigned(nf.residual,2)} ر.س</div>
  </div>`;
}

function _icRefreshMonthlyHeadline() {
  const el = document.getElementById('ic-monthly-headline');
  if (el) el.innerHTML = _icMonthlyHeadlineHtml();
}

function _icMonthlySection(d) {
  // Two books, shown explicitly — never blended into one balance in the RAW
  // table below. The cash-flow guard already found the raw mirror broken
  // (~9.2M SAR gap); the prominent headline above the table is the Memo-3
  // RECONCILED figure (after including the bank/financing counter-legs) —
  // the raw table + banner stay as supporting detail, not replaced, since
  // they remain true statements about the unreconciled receipt/payment-
  // voucher-only population. cf.db1NetOutflow/db2NetInflow are the same
  // full-period sums used by the cash-flow guard (not re-derived from the
  // monthly rows below, so this total can never silently diverge from a
  // truncated/partial column sum).
  const cf = d.cashFlowCheck.diffs;
  let cum1 = 0, cum2 = 0;
  const rows = d.monthlyCurrentAccount.map(m => {
    cum1 += m.db1Net; cum2 += m.db2Net;
    const gap = parseFloat((m.db1Net - m.db2Net).toFixed(2));
    return `<tr>
      <td>${m.month}</td>
      <td style="text-align:left" class="${_cls(m.db1Net)}">${_fmtSigned(m.db1Net,0)}</td>
      <td style="text-align:left" class="${_cls(cum1)}">${_fmtSigned(cum1,0)}</td>
      <td style="text-align:left" class="${_cls(m.db2Net)}">${_fmtSigned(m.db2Net,0)}</td>
      <td style="text-align:left" class="${_cls(cum2)}">${_fmtSigned(cum2,0)}</td>
      <td style="text-align:left" class="${_cls(gap)}">${_fmtSigned(gap,0)}</td>
    </tr>`;
  }).join('');
  const totalGap = parseFloat((cf.db1NetOutflow - cf.db2NetInflow).toFixed(2));
  return `
  <div class="ic-section">
    <div class="ic-section-title">حركة الحساب الجاري بين المؤسستين — شهرياً (دفترا الطرفين صراحةً، بلا اختيار طرف)</div>
    <div id="ic-monthly-headline">${_icMonthlyHeadlineHtml()}</div>
    <div style="font-size:.76rem;color:#7a9ab0;margin:10px 0 6px">الجدول والراية أدناه: الأرقام الخامة (سندات قبض/صرف فقط) قبل التسوية — التفصيل الكامل في المذكرة 3 أعلاه</div>
    <div style="overflow-x:auto"><table class="ic-tbl">
      <thead><tr><th>الشهر</th><th>صافي أبعاد الشهري</th><th>تراكمي أبعاد</th><th>صافي وسام الشهري</th><th>تراكمي وسام</th><th>فارق عدم الإغلاق الشهري (أبعاد − وسام)</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="ic-banner bad" style="margin-top:10px">
      <div class="ic-banner-icon">⛔</div>
      <div>
        <div>الدفتران الخامان لا يتطابقان (قبل التسوية)</div>
        <div class="ic-banner-sub">
          صافي دفتر أبعاد (حي، ${d.asOf}): ${_fmtSigned(cf.db1NetOutflow,2)} ر.س ·
          صافي دفتر وسام (حي): ${_fmtSigned(cf.db2NetInflow,2)} ر.س ·
          فارق عدم الإغلاق الخام: ${_fmtSigned(totalGap,2)} ر.س
        </div>
      </div>
    </div>
  </div>`;
}

function _icMeth(d) {
  const cov = d.categories ? d.categories.trade.coverage : { dirA: {pct:0}, dirB: {pct:0} };
  return `
  <div class="ic-meth">
    <div class="ic-meth-hdr" onclick="icToggleMeth(this)"><span>📖 منهجية التسوية البينية</span><span>▼</span></div>
    <div class="ic-meth-body">
      <p><strong>لماذا الحساب الجاري منفصل عن الذمم التجارية:</strong> خلط النقد البيني مع الفواتير يُفسد أعمار الذمم ويُخفي أخطاء الترحيل — هذا فصل تشخيصي، وليس مطلباً معيارياً.</p>
      <p><strong>البنية:</strong> أربعة حسابات لا حسابان — لكل مؤسسة حساب عميل وحساب مورد لدى الطرف الآخر. لا مقاصة بين حساب العميل وحساب المورد كمنهج مطابقة؛ المطابقة تتم عبر الحسابات الأربعة مجتمعة، بحسب نوع الحركة.</p>
      <p><strong>أسبقية التصنيف (ثابتة، لا تسجيل نقاط):</strong> فاتورة/مرتجع ← فئة 1، سند قبض/صرف ← فئة 2، وكل ما تبقى (قيود يدوية فقط) يُصنَّف بالبيان إلى 3 أو 4 أو 5. كل حركة في فئة واحدة لا غير.</p>
      <p><strong>ضابط الإغلاق:</strong> مجموع الفئات الخمس (عدداً ومبلغاً) يجب أن يساوي إجمالي دوران الحسابات الأربعة؛ إن لم يتطابق ±1 ر.س تُخفى كل النتائج ويُعرض شريط الإنذار فقط.</p>
      <p><strong>تغطية المطابقة بالمرجع — لا تُدمَج أبداً:</strong> اتجاه أبعاد→وسام: ${cov.dirA.pct}% من الحركات تحمل مرجع مستند موثوق. اتجاه وسام→أبعاد: ${cov.dirB.pct}%. الاتجاه ذو التغطية المنخفضة يُطابَق بالمبلغ والتاريخ فقط — ثقة أدنى، وليس عيباً في الأداة.</p>
      <p><strong>الأثر الضريبي:</strong> المعاملات بين المؤسستين خاضعة لرقمين ضريبيين منفصلين؛ أي خطأ ترحيل بينهما (مثل فاتورة ملغاة لدى طرف ومسجَّلة لدى الآخر) له أثر مباشر على إقرار ضريبة القيمة المضافة لكل منهما.</p>
      <p><strong>التحديث:</strong> كل ${IC_REFRESH_SEC} ثانية تلقائياً؛ زر «تحديث النسخة» يُبطل ذاكرة المتصفح (cache: no-store) ويعيد الجلب فوراً.</p>
    </div>
  </div>`;
}

/* ── Memo 2 — أبعاد تبيع لوسام (reconciliation-memo reference model, v2.1) ──
   Self-contained section fed by its own endpoint (/api/interco-recon/memo2) —
   deliberately not derived from the categories.trade blend above, since that
   mixes invoices and returns in one aonly/bonly list (see spec v2.1 for why
   that blend is unsafe to read the timing item off directly). ───────────── */
function _icMemoDocsTable(docs, cols) {
  if (!docs.length) return `<div class="ic-empty">لا توجد مستندات</div>`;
  const head = cols.map(c => `<th>${c.h}</th>`).join('');
  const rows = docs.map(d => `<tr>${cols.map(c => `<td${c.num ? ' style="text-align:left"' : ''}>${c.f(d)}</td>`).join('')}</tr>`).join('');
  return `<table class="ic-tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function _icMemo2Section(m) {
  if (!m) return '';
  const e = m.errorItem;
  return `
  <div class="ic-memo">
    <div class="ic-memo-hdr">
      <div class="ic-memo-title">📋 ${m.label}</div>
      <div class="ic-memo-asof">حي — كما في ${m.asOf} · من ${m.from}</div>
    </div>

    <div class="ic-memo-bridge">
      <div class="ic-memo-row"><span class="lbl">صافي أبعاد (فواتير ${_fmt(m.bridge.netAbaad.salesInvoices,2)} − مرتجعات ${_fmt(m.bridge.netAbaad.salesReturns,2)})</span><span class="val">${_fmtSigned(m.bridge.netAbaad.net,2)}</span></div>
      <div class="ic-memo-row"><span class="lbl">صافي وسام (فواتير ${_fmt(m.bridge.netWissam.purchaseInvoices,2)} − مرتجعات ${_fmt(m.bridge.netWissam.purchaseReturns,2)})</span><span class="val">${_fmtSigned(m.bridge.netWissam.net,2)}</span></div>
      <div class="ic-memo-row rule total"><span class="lbl">= الفجوة الكلية (من الإجمالي)</span><span class="val">${_fmtSigned(m.bridge.totalGap,2)}</span></div>
    </div>

    <div class="ic-memo-line" onclick="icToggleMemoDocs('ic-memo-timing')">
      <span class="lbl">↳ ${m.timingItem.label} (${m.timingItem.count} مستند)</span>
      <span class="meta">${_fmtSigned(m.timingItem.total,2)} ر.س · asOf ${m.timingItem.asOf}
        <button class="ic-csv-btn" onclick="event.stopPropagation();icExportCsv('memo2Timing')">⬇ CSV</button> ▾</span>
    </div>
    <div style="font-size:.74rem;color:#7a9ab0;margin:-2px 4px 8px">
      بند التوقيت الإجمالي يفوق الفجوة الصافية لأن معظمه فواتير حديثة ستُقابَل بتسجيل وسام خلال أيام —
      الفجوة الصافية بعد المقابلة المتوقعة ≈ ${_fmtSigned(m.invoiceOnlyNet,2)} ر.س (صافي بند التوقيت أدناه)
    </div>
    <div id="ic-memo-timing" class="ic-memo-docs">
      ${_icMemoDocsTable(m.timingItem.documents, [
        { h:'التاريخ', f:d=>d.txDate }, { h:'المرجع', f:d=>_icCleanRef(d.ref, d.docId) },
        { h:'المبلغ', num:true, f:d=>_fmt(d.amount,2) }, { h:'العمر (أيام)', num:true, f:d=>_fmt(d.ageDays,0) },
      ])}
    </div>

    <div class="ic-memo-line" onclick="icToggleMemoDocs('ic-memo-mirror')">
      <span class="lbl">↳ ${m.mirrorItem.label} (${m.mirrorItem.count} مستند)</span>
      <span class="meta">${_fmtSigned(-m.mirrorItem.total,2)} ر.س ▾</span>
    </div>
    <div id="ic-memo-mirror" class="ic-memo-docs">
      ${_icMemoDocsTable(m.mirrorItem.documents, [
        { h:'التاريخ', f:d=>d.txDate }, { h:'المرجع', f:d=>_icCleanRef(d.ref, d.docId) },
        { h:'المبلغ', num:true, f:d=>_fmt(d.amount,2) }, { h:'العمر (أيام)', num:true, f:d=>_fmt(d.ageDays,0) },
      ])}
    </div>
    <div class="ic-memo-row sub"><span class="lbl">= صافي بند التوقيت (لا يُصافى في الجداول أعلاه — صافٍ هنا فقط للربط بالجسر)</span><span class="val">${_fmtSigned(m.invoiceOnlyNet,2)}</span></div>

    <div class="ic-memo-line" onclick="icToggleMemoDocs('ic-memo-error')">
      <span class="lbl">↳ ${e.label} (${e.documents.length} مستند)</span>
      <span class="meta">${_fmtSigned(-e.total,2)} ر.س
        <button class="ic-csv-btn" onclick="event.stopPropagation();icExportCsv('memo2Error')">⬇ CSV</button> ▾</span>
    </div>
    <div id="ic-memo-error" class="ic-memo-docs">
      ${_icMemoDocsTable(e.documents, [
        { h:'فاتورة أبعاد', f:d=>d.salesInvoiceId }, { h:'تاريخ الإلغاء', f:d=>d.returnDate },
        { h:'المبلغ الأصلي', num:true, f:d=>_fmt(d.amount,2) }, { h:'العمر (أيام)', num:true, f:d=>_fmt(d.ageDays,0) },
      ])}
    </div>

    <div class="ic-memo-diag">
      <div>${e.diagnostic.label}: <span class="amt">${_fmtSigned(e.diagnostic.amount,2)} ر.س</span>
        (مجموع المستندات المفردة ${_fmt(e.documentsSum,2)} مقابل بند الخطأ من الإجمالي ${_fmt(e.total,2)})</div>
      ${e.diagnostic.orphanWissamReturns.length ? `
      <div style="margin-top:6px">مرتجعات شراء لدى وسام بلا أي مقابل لدى أبعاد (بأي مبلغ أو تاريخ):
        ${e.diagnostic.orphanWissamReturns.map(r=>`<div style="margin-top:3px">• ${r.txDate} — ${_fmt(r.amount,2)} ر.س — «${_esc(r.description||'')}» (عمر ${r.ageDays} يوماً)</div>`).join('')}
      </div>` : ''}
      ${e.diagnostic.otherOrphanReturns.length ? `
      <div style="margin-top:6px">مرتجعات أخرى غير مفسَّرة (ليست إلغاءً كاملاً لفاتورة معروفة):
        ${e.diagnostic.otherOrphanReturns.map(r=>`<div style="margin-top:3px">• ${r.returnDate} — ${_fmt(r.amount,2)} ر.س — ${r.note}</div>`).join('')}
      </div>` : ''}
    </div>

    <div class="ic-memo-row rule residual"><span class="lbl">${m.unexplainedResidual.label} (سطر مستقل — مسموح أن يكون غير صفري)</span><span class="val">${_fmtSigned(m.unexplainedResidual.amount,2)}</span></div>
  </div>`;
}

function icToggleMemoDocs(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

async function _icLoadMemo2() {
  const el = document.getElementById('ic-memo2-section');
  try {
    const r = await fetch('/api/interco-recon/memo2', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _icMemo2 = await r.json();
    if (el) el.innerHTML = _icMemo2Section(_icMemo2);
  } catch (e) {
    console.error('[interco-recon/memo2]', e);
    if (el) el.innerHTML = `<div class="ic-memo" style="color:#ff7a7a">تعذّر تحميل المذكرة 2: ${e.message}</div>`;
  }
}

/* ── Memo 3 — تسوية الحساب الجاري (نقد بيني) بعد ضم الأطراف البنكية/التمويلية ──
   Same rationale as Memo 2: self-contained endpoint, bridge from raw totals,
   explicit reconciling-item lines (never a bare "trust me" adjustment), and a
   residual line that's allowed to stay non-zero. See spec + project memory for
   the root-cause chain that motivated this (manual-JV vs receipt/payment-
   voucher tagging asymmetry across the two books). ─────────────────────────── */
function _icMemo3ReconTable(rows) {
  if (!rows.length) return `<div class="ic-empty">لا بنود</div>`;
  const head = ['الدفتر','التاريخ','المبلغ','البيان','تاريخ المقابل (فارق أيام)'];
  const body = rows.map(r => `<tr>
    <td>${r.book}</td><td>${r.txDate}</td><td style="text-align:left">${_fmt(r.amount,2)}</td>
    <td>${_esc(r.desc)}</td><td>${r.matchedWith ? `${r.matchedWith.txDate} (${r.matchDays}ي)` : '—'}</td>
  </tr>`).join('');
  return `<table class="ic-tbl"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function _icMemo3Section(m) {
  if (!m) return '';
  const bank = m.reconcilingItems.bankFinancing;
  const other = m.reconcilingItems.other;
  const bankRows = [...bank.db1.map(r=>({...r, book:'أبعاد'})), ...bank.db2.map(r=>({...r, book:'وسام'}))];
  const otherRows = [...other.db1.map(r=>({...r, book:'أبعاد'})), ...other.db2.map(r=>({...r, book:'وسام'}))];
  const nf = m.netFinancingBalance;
  return `
  <div class="ic-memo">
    <div class="ic-memo-hdr">
      <div class="ic-memo-title">📋 ${m.label}</div>
      <div class="ic-memo-asof">حي — كما في ${m.asOf} · من ${m.from}</div>
    </div>

    <div class="ic-memo-bridge">
      <div class="ic-memo-row"><span class="lbl">صافي أبعاد (نقد بيني خام — سندات قبض/صرف فقط)</span><span class="val">${_fmtSigned(m.raw.db1Net,2)}</span></div>
      <div class="ic-memo-row"><span class="lbl">صافي وسام (نقد بيني خام)</span><span class="val">${_fmtSigned(m.raw.db2Net,2)}</span></div>
      <div class="ic-memo-row rule total"><span class="lbl">= فجوة عدم الإغلاق الخامة</span><span class="val">${_fmtSigned(m.raw.gap,2)}</span></div>
    </div>

    <div class="ic-memo-line" onclick="icToggleMemoDocs('ic-memo3-bank')">
      <span class="lbl">↳ ${bank.label} (${bankRows.length} بند)</span>
      <span class="meta">${_fmtSigned(bank.total,2)} ر.س
        <button class="ic-csv-btn" onclick="event.stopPropagation();icExportCsv('memo3Bank')">⬇ CSV</button> ▾</span>
    </div>
    <div id="ic-memo3-bank" class="ic-memo-docs">${_icMemo3ReconTable(bankRows)}</div>

    <div class="ic-memo-line" onclick="icToggleMemoDocs('ic-memo3-other')">
      <span class="lbl">↳ ${other.label} (${otherRows.length} بند)</span>
      <span class="meta">${_fmtSigned(other.total,2)} ر.س
        <button class="ic-csv-btn" onclick="event.stopPropagation();icExportCsv('memo3Other')">⬇ CSV</button> ▾</span>
    </div>
    <div id="ic-memo3-other" class="ic-memo-docs">${_icMemo3ReconTable(otherRows)}</div>

    <div class="ic-memo-bridge" style="margin-top:10px">
      <div class="ic-memo-row"><span class="lbl">صافي أبعاد بعد التسوية</span><span class="val">${_fmtSigned(m.reconciled.db1Net,2)}</span></div>
      <div class="ic-memo-row"><span class="lbl">صافي وسام بعد التسوية</span><span class="val">${_fmtSigned(m.reconciled.db2Net,2)}</span></div>
      <div class="ic-memo-row rule residual"><span class="lbl">= فجوة متبقية بعد التسوية (سطر مستقل — مسموح أن يكون غير صفري)</span><span class="val">${_fmtSigned(m.reconciled.gap,2)}</span></div>
    </div>

    <div class="ic-memo-headline">
      <div>${nf.label}</div>
      <div class="amt">${_fmtSigned(nf.amount,2)} ر.س</div>
      <div class="sub">
        تقاطع مع دفتر وسام (بعد التسوية): ${_fmtSigned(nf.crossCheckWissam,2)} ر.س ·
        ${nf.residualNote}: ${_fmtSigned(nf.residual,2)} ر.س
      </div>
    </div>
  </div>`;
}

async function _icLoadMemo3() {
  const el = document.getElementById('ic-memo3-section');
  try {
    const r = await fetch('/api/interco-recon/memo3', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _icMemo3 = await r.json();
    if (el) el.innerHTML = _icMemo3Section(_icMemo3);
    _icRefreshMonthlyHeadline();
  } catch (e) {
    console.error('[interco-recon/memo3]', e);
    if (el) el.innerHTML = `<div class="ic-memo" style="color:#ff7a7a">تعذّر تحميل المذكرة 3: ${e.message}</div>`;
  }
}

/* ── Timer ───────────────────────────────────────────────────────────── */
function _icStartTimer() {
  _icStopTimer();
  let cd = IC_REFRESH_SEC;
  _icTimer = setInterval(() => {
    cd--;
    const el = document.getElementById('ic-status');
    if (el && _icData) el.textContent = `تحديث تلقائي خلال ${cd}ث · آخر تحديث: ${_icData.asOf}`;
    if (cd <= 0) { cd = IC_REFRESH_SEC; _icLoad(); }
  }, 1000);
}

/* ── Load ────────────────────────────────────────────────────────────── */
async function _icLoad() {
  if (_icLoading) return;
  _icLoading = true;
  _icLoadMemo2(); // independent endpoint — its failure must not block the main classifier view
  _icLoadMemo3(); // ditto
  const statusEl = document.getElementById('ic-status');
  if (statusEl) statusEl.textContent = 'جارٍ التحميل…';
  try {
    const r = await fetch('/api/interco-recon', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _icData = await r.json();
    _icRenderContent(_icData);
    if (statusEl) statusEl.textContent = `تحديث تلقائي خلال ${IC_REFRESH_SEC}ث · آخر تحديث: ${_icData.asOf}`;
  } catch (e) {
    console.error('[interco-recon]', e);
    const el = document.getElementById('ic-content');
    if (el) el.innerHTML = `<div style="color:#ff7a7a;padding:20px">خطأ في تحميل البيانات: ${e.message}</div>`;
    if (statusEl) statusEl.textContent = 'فشل التحميل';
  } finally {
    _icLoading = false;
  }
}

/* ── CSV export (pattern from tab-details.js) ───────────────────────── */
function icExportCsv(which) {
  if (which === 'memo2Timing' || which === 'memo2Error') {
    if (!_icMemo2) return;
    let hdr2, rows2;
    if (which === 'memo2Timing') {
      hdr2 = ['التاريخ','المرجع','المبلغ','العمر (أيام)'];
      rows2 = _icMemo2.timingItem.documents.map(d => [d.txDate, _icCleanRefPlain(d.ref, d.docId), d.amount, d.ageDays]);
    } else {
      hdr2 = ['فاتورة أبعاد','تاريخ الإلغاء','المبلغ الأصلي','العمر (أيام)'];
      rows2 = _icMemo2.errorItem.documents.map(d => [d.salesInvoiceId, d.returnDate, d.amount, d.ageDays]);
    }
    const lines2 = [hdr2.join(',')].concat(rows2.map(row => row.map(v => `"${String(v==null?'':v).replace(/"/g,'""')}"`).join(',')));
    const blob2 = new Blob(['﻿' + lines2.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url2 = URL.createObjectURL(blob2);
    const a2 = document.createElement('a');
    a2.href = url2; a2.download = `interco_${which}_${_icMemo2.asOf}.csv`; a2.click();
    URL.revokeObjectURL(url2);
    return;
  }
  if (which === 'memo3Bank' || which === 'memo3Other') {
    if (!_icMemo3) return;
    const cat = which === 'memo3Bank' ? _icMemo3.reconcilingItems.bankFinancing : _icMemo3.reconcilingItems.other;
    const rows3 = [...cat.db1.map(r=>({...r,book:'أبعاد'})), ...cat.db2.map(r=>({...r,book:'وسام'}))];
    const hdr3 = ['الدفتر','التاريخ','المبلغ','البيان','تاريخ المقابل','فارق الأيام'];
    const lines3 = [hdr3.join(',')].concat(rows3.map(r => [r.book, r.txDate, r.amount, r.desc, r.matchedWith?r.matchedWith.txDate:'', r.matchedWith?r.matchDays:''].map(v => `"${String(v==null?'':v).replace(/"/g,'""')}"`).join(',')));
    const blob3 = new Blob(['﻿' + lines3.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url3 = URL.createObjectURL(blob3);
    const a3 = document.createElement('a');
    a3.href = url3; a3.download = `interco_${which}_${_icMemo3.asOf}.csv`; a3.click();
    URL.revokeObjectURL(url3);
    return;
  }
  if (!_icData) return;
  let hdr, rows;
  if (which === 'trade') {
    hdr = ['الاتجاه','التاريخ','المرجع','المبلغ','تاريخ الطرف الآخر','مبلغ الطرف الآخر','درجة المطابقة'];
    const t = _icData.categories.trade;
    rows = [
      ...t.dirA.transactions.map(r => [t.dirA.label, r.txDate, _icCleanRefPlain(r.ref, r.docId), r.amount, r.matchedWith?r.matchedWith.txDate:'', r.matchedWith?r.matchedWith.amount:'', r.status==='matched'?r.matchTier:'unmatched']),
      ...t.dirB.transactions.map(r => [t.dirB.label, r.txDate, _icCleanRefPlain(r.ref, r.docId), r.amount, r.matchedWith?r.matchedWith.txDate:'', r.matchedWith?r.matchedWith.amount:'', r.status==='matched'?r.matchTier:'unmatched']),
    ];
  } else if (which === 'tradeCancelled') {
    hdr = ['رقم فاتورة أبعاد','المبلغ','تاريخ الإلغاء','فاتورة شراء وسام المطابقة','ضريبة مدخلات وسام','ملاحظة'];
    const vatMap = new Map((_icData.categories.thirdPartyErrors.cancelledInvoiceVat||[]).map(v => [v.salesInvoiceId, v]));
    rows = _icData.categories.trade.cancelledNoMirror.map(c => {
      const vat = vatMap.get(c.salesInvoiceId);
      return [c.salesInvoiceId, c.amount, c.returnDate, c.matchedDb2PurchaseInvoiceDate||'', vat&&vat.inputVat!=null?vat.inputVat:'', vat&&vat.note?vat.note:''];
    });
  } else if (which === 'cash') {
    hdr = ['التاريخ','الحساب','المبلغ','البيان','الحالة'];
    rows = _icData.categories.cash.transactions.map(r => [r.txDate, _icAccLabel(r.account), r.amount, r.lineDesc||r.hdrDesc||'', r.status]);
  } else {
    hdr = ['التاريخ','الحساب','المبلغ','البيان'];
    rows = _icData.categories.thirdPartyErrors.transactions.map(r => [r.txDate, _icAccLabel(r.account), r.amount, r.lineDesc||r.hdrDesc||'']);
  }
  const lines = [hdr.join(',')].concat(rows.map(row => row.map(v => `"${String(v==null?'':v).replace(/"/g,'""')}"`).join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `interco_${which}_${_icData.asOf}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ── Public API ──────────────────────────────────────────────────────── */
function icSetDir(dir) { _icDir = dir; _icRenderContent(_icData); }

function icToggleMeth(hdr) {
  const body = hdr.nextElementSibling;
  body.classList.toggle('open');
  hdr.querySelector('span:last-child').textContent = body.classList.contains('open') ? '▲' : '▼';
}

/* ── Entry point ─────────────────────────────────────────────────────── */
function renderIntercoRecon() {
  const wrap = document.getElementById('tab-interco-recon');
  if (!wrap) return;
  if (!_icRendered) {
    wrap.innerHTML = _icBuildShell();
    _icRendered = true;
    _icStartTimer();
  }
  _icLoad();
}
