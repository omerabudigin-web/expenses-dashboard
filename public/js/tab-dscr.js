'use strict';
/* ── Tab: تغطية خدمة الدين (DSCR) ─────────────────────────────────── */

const DSCR_REFRESH_SEC = 120;

let _dscrTimer    = null;
let _dscrLoading  = false;
let _dscrRendered = false;   // shell built flag

function _dscrIsActive() { return !!document.querySelector('.tab.active[data-tab="dscr"]'); }
function _dscrStopTimer() { if (_dscrTimer) { clearInterval(_dscrTimer); _dscrTimer = null; } }

function _dscrFmt(n) {
  return (n === null || n === undefined || isNaN(+n))
    ? '—' : Math.round(+n).toLocaleString('ar-SA');
}

function _dscrColorSet(dscr) {
  if (dscr === null) return { c: '#9ab0c4', bg: '#0d1c30' };
  if (dscr >= 1.5)  return { c: '#4ada8e', bg: '#0d2b1a' };
  if (dscr >= 1.0)  return { c: '#e0b030', bg: '#2b230d' };
  return              { c: '#ff7a7a', bg: '#2b0d0d' };
}

/* ── CSS (injected once into shell) ─────────────────────────────────── */
const DSCR_CSS = `
<style id="dscr-style">
#tab-dscr{font-family:'Cairo','Tajawal',sans-serif;direction:rtl;padding:18px;color:#e8e0cc}
.dscr-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.dscr-title{font-size:1.25rem;font-weight:700;color:#C9A84C;letter-spacing:.3px}
.dscr-status-bar{font-size:.75rem;color:#7a9ab0;margin-top:2px}
.dscr-refresh{background:#13284a;border:1px solid #C9A84C44;color:#C9A84C;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:.8rem}
.dscr-refresh:hover{background:#1d3a5c}
.dscr-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:760px){.dscr-grid{grid-template-columns:1fr}}
.dscr-card{background:#0f2038;border:1px solid #1e3a5a;border-radius:12px;padding:20px 22px}
.dscr-card-title{font-size:.95rem;font-weight:700;color:#C9A84C;margin-bottom:14px}
.dscr-err{color:#ff7a7a;font-size:.85rem;text-align:center;padding:20px}
.dscr-block{text-align:center;margin-bottom:6px}
.dscr-label-text{font-size:.68rem;font-weight:700;letter-spacing:.04em;color:#7a9ab0;margin-bottom:4px}
.dscr-primary{font-weight:800;font-size:2.4rem;line-height:1;margin:0}
.dscr-tag{font-weight:700;font-size:.75rem;padding:4px 14px;border-radius:20px;display:inline-block;margin-top:8px}
.dscr-secondary-wrap{display:flex;align-items:center;justify-content:center;gap:10px;margin:16px 0 2px;padding:10px 14px;background:#0d1c30;border:1px dashed #2a4060;border-radius:10px}
.dscr-secondary-label{font-size:.72rem;color:#7a9ab0;font-weight:600;flex:1}
.dscr-secondary-value{font-weight:800;font-size:1.35rem}
.dscr-secondary-tag{font-weight:700;font-size:.65rem;padding:3px 10px;border-radius:14px;white-space:nowrap}
.dscr-divider{border:none;border-top:1px solid #1e3a5a;margin:16px 0 10px}
.dscr-row{display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px dashed #1a3050;font-size:.82rem}
.dscr-row:last-child{border-bottom:none}
.dscr-row .k{color:#7a9ab0;font-weight:600}
.dscr-row .v{font-weight:700;color:#e8e0cc;font-variant-numeric:tabular-nums}
.dscr-row .v.gap{color:#e0b030}
.dscr-gap-note{margin-top:14px;padding:10px 13px;background:#1c1608;border:1px solid #4a3a1a;border-radius:8px;font-size:.72rem;color:#c9ac6a;line-height:1.75}
.dscr-full-note{background:#0f2038;border:1px solid #1e3a5a;border-radius:10px;padding:14px 18px;font-size:.78rem;color:#9ab0c4;line-height:1.85}
.dscr-full-note b{color:#C9A84C}
.dscr-loading{text-align:center;padding:60px;color:#7a9ab0;font-weight:700}
</style>`;

/* ── Shell — built ONCE, never replaced ────────────────────────────── */
function _dscrBuildShell() {
  return DSCR_CSS + `
  <div class="dscr-hdr">
    <div>
      <div class="dscr-title">تغطية خدمة الدين (DSCR) 🏦</div>
      <div id="dscr-status" class="dscr-status-bar">جارٍ التحميل…</div>
    </div>
    <button class="dscr-refresh" onclick="_dscrLoad()">⟳ تحديث</button>
  </div>
  <div id="dscr-content"><div class="dscr-loading">⏳ جارٍ سحب البيانات من MekSoft…</div></div>`;
}

/* ── Card renderer ─────────────────────────────────────────────────── */
function _dscrRenderCard(co) {
  if (co.error) {
    return `<div class="dscr-card">
      <div class="dscr-card-title">${co.label}</div>
      <div class="dscr-err">تعذّر الاتصال بـ MekSoft: ${co.error}</div>
    </div>`;
  }

  const eco  = _dscrColorSet(co.dscrEconomic);
  const acc  = _dscrColorSet(co.dscrAccounting);
  const eVal = co.dscrEconomic  !== null ? co.dscrEconomic.toFixed(2)  + '×' : '—';
  const aVal = co.dscrAccounting !== null ? co.dscrAccounting.toFixed(2) + '×' : '—';

  return `
  <div class="dscr-card">
    <div class="dscr-card-title">${co.label}</div>

    <div class="dscr-block">
      <div class="dscr-label-text">DSCR المستحق اقتصادياً</div>
      <div class="dscr-primary" style="color:${eco.c}">${eVal}</div>
      <div class="dscr-tag" style="color:${eco.c};background:${eco.bg}">${co.dscrEconomicLabel}</div>
    </div>

    <div class="dscr-secondary-wrap">
      <span class="dscr-secondary-label">DSCR المسجَّل محاسبياً (MekSoft)</span>
      <span class="dscr-secondary-value" style="color:${acc.c}">${aVal}</span>
      <span class="dscr-secondary-tag" style="color:${acc.c};background:${acc.bg}">${co.dscrAccountingLabel}</span>
    </div>

    <hr class="dscr-divider">

    <div class="dscr-row"><span class="k">الفترة</span><span class="v">${co.period}</span></div>
    <div class="dscr-row"><span class="k">الإيرادات</span><span class="v">${_dscrFmt(co.revenue)} ر.س</span></div>
    <div class="dscr-row"><span class="k">الربح التشغيلي (قبل التمويل)</span><span class="v">${_dscrFmt(co.operatingProfit)} ر.س</span></div>
    <div class="dscr-row"><span class="k">تكلفة التمويل — مستحق اقتصادياً</span><span class="v">${_dscrFmt(co.economicFinancingCost)} ر.س</span></div>
    <div class="dscr-row"><span class="k">تكلفة التمويل — مسجَّل في MekSoft</span><span class="v" style="color:#7a9ab0">${_dscrFmt(co.accountingFinancingCost)} ر.س</span></div>
    <div class="dscr-row"><span class="k">فوائد غير مقيَّدة بعد</span><span class="v gap">${_dscrFmt(co.unrecordedGap)} ر.س</span></div>
    <div class="dscr-row"><span class="k">الفائدة المتبقية (عمر التسهيلات)</span><span class="v" style="color:#7a9ab0">${_dscrFmt(co.lifetimeRemainingInterest)} ر.س</span></div>
    <div class="dscr-row"><span class="k">عدد التسهيلات النشطة</span><span class="v">${co.loansCount}</span></div>

    <div class="dscr-gap-note">
      <b>الفرق بين المؤشرَين</b> = فوائد مستحقة اقتصادياً على تسهيلات نصف سنوية/ربع سنوية
      لم يحن موعد قيدها المحاسبي بعد. راجع <b>"الفائدة المتبقية على عمر التسهيلات"</b>
      في سجل التمويلات لتفاصيل كل تسهيل.
    </div>
  </div>`;
}

/* ── Load ──────────────────────────────────────────────────────────── */
async function _dscrLoad() {
  if (_dscrLoading) return;
  _dscrLoading = true;
  const el = document.getElementById('dscr-content');
  const st = document.getElementById('dscr-status');
  try {
    const res  = await fetch('/api/dscr');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (st) st.textContent = 'آخر تحديث: ' + new Date(data.generatedAt).toLocaleString('ar-SA');

    const cards = Object.values(data.companies).map(_dscrRenderCard).join('');
    const note = `
      <div class="dscr-full-note">
        <b>كيف نقرأ هذين المؤشرَين؟</b><br>
        • <b>DSCR المستحق اقتصادياً</b>: يُحسب على أساس تكلفة التمويل الفعلية لكل التسهيلات وفق جداول إطفائها
          (شهري + نصف سنوي + ربع سنوي) — هذا هو الأصح لأي قرار استراتيجي.<br>
        • <b>DSCR المسجَّل محاسبياً</b>: يعكس ما دُفع وقُيِّد فعلاً في MekSoft حتى الآن — مفيد للمطابقة مع
          القوائم المالية الرسمية وسيرتفع تلقائياً عند تسجيل دفعات التسهيلات النصف سنوية.<br>
        • DSCR ≥ 1.5 = تغطية قوية &nbsp;|&nbsp; 1.0–1.5 = كافية لكن ضيقة &nbsp;|&nbsp;
          &lt; 1.0 = خطر — التمويل يلتهم الربح التشغيلي أو أكثر.
      </div>`;

    if (el) el.innerHTML = `<div class="dscr-grid">${cards}</div>${note}`;
  } catch (e) {
    if (el) el.innerHTML = `<div class="dscr-err">تعذّر تحميل البيانات: ${e.message}</div>`;
  } finally {
    _dscrLoading = false;
  }
}

/* ── timer ─────────────────────────────────────────────────────────── */
function _dscrStartTimer() {
  _dscrStopTimer();
  let cd = DSCR_REFRESH_SEC;
  _dscrTimer = setInterval(() => {
    if (!_dscrIsActive()) { _dscrStopTimer(); return; }
    cd--;
    const el = document.getElementById('dscr-status');
    if (el && !_dscrLoading) el.textContent = `تحديث تلقائي خلال ${cd}ث`;
    if (cd <= 0) { cd = DSCR_REFRESH_SEC; _dscrLoad(); }
  }, 1000);
}

/* ── entry point ───────────────────────────────────────────────────── */
function renderDscrTab() {
  const wrap = document.getElementById('tab-dscr');
  if (!wrap) return;

  if (!_dscrRendered) {
    wrap.innerHTML = _dscrBuildShell();
    _dscrRendered = true;
    _dscrStartTimer();
  }

  _dscrLoad();
}
