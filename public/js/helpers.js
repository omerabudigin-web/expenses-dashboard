'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, d) { return (+n||0).toLocaleString('ar-SA', { minimumFractionDigits: d||0, maximumFractionDigits: d||0 }); }
function fmtPct(n) { return fmt(n, 1) + '%'; }
function esc(s)    { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function monthTotal(m) { return CAT_ORDER.reduce((s, c) => s + (m[c]||0), 0); }

// ── Tab routing ───────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(x => x.classList.add('hidden'));
  t.classList.add('active');
  document.getElementById('tab-' + t.dataset.tab).classList.remove('hidden');
  renderTab(t.dataset.tab);
}));

// ── Period helpers ────────────────────────────────────────────────────────────
const Q_LABELS = ['الربع الأول','الربع الثاني','الربع الثالث','الربع الرابع'];
const qOf    = moStr => Math.ceil(+moStr.slice(5, 7) / 3);  // '2025-03' → 1
const CUR_Y  = () => new Date().getFullYear().toString();    // dynamic current year

function _addYtdOpt(sel, hasData) {
  if (!hasData) return;
  const o = document.createElement('option');
  o.value = 'ytd'; o.textContent = `من بداية ${CUR_Y()} إلى الآن`; sel.appendChild(o);
}

function buildPeriodOptions(selId, includeAll) {
  const sel     = document.getElementById(selId);
  if (!sel) return;
  const monthly = State.get('monthly');
  const curVal  = sel.value;
  sel.innerHTML = includeAll ? '<option value="all">كل الفترة</option>' : '<option value="">كل الفترة</option>';
  [...new Set(monthly.map(m => m.month.slice(0, 4)))].sort().forEach(y => {
    const isCur = y === CUR_Y();
    const oy = document.createElement('option');
    oy.value = isCur ? 'ytd' : 'year-' + y;
    oy.textContent = `من بداية ${y} إلى الآن`;
    sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      if (monthly.some(m => m.month.startsWith(y) && qOf(m.month) === q)) {
        const oq = document.createElement('option'); oq.value = `quarter-${y}-${q}`; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  monthly.forEach(m => {
    const o = document.createElement('option'); o.value = m.month; o.textContent = m.label; sel.appendChild(o);
  });
  if (curVal && [...sel.options].some(o => o.value === curVal)) sel.value = curVal;
}

function filterMonthly(period) {
  const monthly = State.get('monthly');
  if (period === 'all' || !period) return monthly;
  if (period === 'ytd')              return monthly.filter(m => m.month.startsWith(CUR_Y()));
  if (period.startsWith('year-'))    { const y = period.slice(5); return monthly.filter(m => m.month.startsWith(y)); }
  if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); return monthly.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
  return monthly.filter(m => m.month === period);
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs(months) {
  const totals = {}; CAT_ORDER.forEach(c => { totals[c] = 0; });
  months.forEach(m => CAT_ORDER.forEach(c => { totals[c] += (m[c]||0); }));
  const grand  = CAT_ORDER.reduce((s, c) => s + totals[c], 0);
  const n      = months.length || 1;
  const topCat = CAT_ORDER.reduce((a, b) => totals[a] >= totals[b] ? a : b);
  const topMo  = months.reduce((a, b) => monthTotal(a) >= monthTotal(b) ? a : b, months[0] || {});
  const items  = [
    { lbl:'إجمالي المصروفات',   val: fmt(grand) + ' ر.س',         sub: 'الفترة المختارة',                                    accent:'#5baef0' },
    { lbl:'متوسط شهري',         val: fmt(grand/n) + ' ر.س',        sub: 'على ' + n + ' أشهر',                                accent:'#4ada8e' },
    { lbl:'أعلى شهر',           val: topMo.label || '—',           sub: fmt(monthTotal(topMo)) + ' ر.س',                     accent:'#da9a4a' },
    { lbl:'أعلى فئة',           val: CAT_LABEL[topCat] || '—',     sub: fmt(totals[topCat]) + ' ر.س · ' + fmtPct(grand ? totals[topCat]/grand*100 : 0) + ' من الإجمالي', accent:'#da4ada' },
    { lbl:'رواتب وأجور',        val: fmt(totals.sal)  + ' ر.س',    sub: fmtPct(grand ? totals.sal/grand*100  : 0),           accent:'#4a9eda' },
    { lbl:'إيجار',              val: fmt(totals.rent) + ' ر.س',    sub: fmtPct(grand ? totals.rent/grand*100 : 0),           accent:'#4ada8e' },
    { lbl:'صيانة وتشغيل',      val: fmt(totals.maint)+ ' ر.س',    sub: fmtPct(grand ? totals.maint/grand*100: 0),           accent:'#da9a4a' },
    { lbl:'مصروفات إدارية',    val: fmt(totals.adm)  + ' ر.س',    sub: fmtPct(grand ? totals.adm/grand*100  : 0),           accent:'#4a7ada' },
  ];
  document.getElementById('kpi-area').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

// ── Analysis bullets ──────────────────────────────────────────────────────────
function renderAnalysis(months) {
  const totals = {}; CAT_ORDER.forEach(c => { totals[c] = 0; });
  months.forEach(m => CAT_ORDER.forEach(c => { totals[c] += (m[c]||0); }));
  const grand  = CAT_ORDER.reduce((s, c) => s + totals[c], 0);
  const sorted = [...months].sort((a, b) => monthTotal(b) - monthTotal(a));
  const topMo  = sorted[0]; const botMo = sorted[sorted.length - 1];
  const topCat = CAT_ORDER.reduce((a, b) => totals[a] >= totals[b] ? a : b);
  let growth = '—';
  if (months.length >= 2) {
    const last = monthTotal(months[months.length - 1]);
    const prev = monthTotal(months[months.length - 2]);
    const pct  = prev ? ((last - prev) / prev * 100).toFixed(1) : '—';
    growth = (last > prev ? 'ارتفعت' : 'انخفضت') + ' بنسبة ' + Math.abs(pct) + '% مقارنةً بـ ' + months[months.length - 2].label;
  }
  const lines = [
    'إجمالي المصروفات للفترة المختارة: <strong>' + fmt(grand) + ' ر.س</strong>',
    'أعلى شهر إنفاقاً: <strong>' + (topMo && topMo.label || '—') + '</strong> بإجمالي <strong>' + fmt(monthTotal(topMo||{})) + ' ر.س</strong>',
    'أدنى شهر إنفاقاً: <strong>' + (botMo && botMo.label || '—') + '</strong> بإجمالي <strong>' + fmt(monthTotal(botMo||{})) + ' ر.س</strong>',
    'أكبر فئة مصروفات: <strong>' + CAT_LABEL[topCat] + '</strong> بإجمالي <strong>' + fmt(totals[topCat]) + ' ر.س</strong> (' + fmtPct(grand ? totals[topCat]/grand*100 : 0) + ')',
    'آخر شهر في البيانات: <strong>' + (months[months.length - 1] && months[months.length - 1].label || '—') + '</strong> — ' + growth,
    'عدد الأشهر: <strong>' + months.length + '</strong> | متوسط شهري: <strong>' + fmt(grand / (months.length || 1)) + ' ر.س</strong>',
  ];
  document.getElementById('analysis-list').innerHTML = lines.map(l => `<li>${l}</li>`).join('');
}
