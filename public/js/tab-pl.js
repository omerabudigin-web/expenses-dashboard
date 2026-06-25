// ── P&L tab ────────────────────────────────────────────────────────────────────

let _plTimer     = null;
let _plCountdown = 0;
const PL_REFRESH_SEC = 60;
function _plIsActive() { return !!document.querySelector('.tab.active[data-tab="pl"]'); }
function _plStopTimer() { if (_plTimer) { clearInterval(_plTimer); _plTimer = null; } }
function _plStartCountdown(months, revenue) {
  _plStopTimer();
  _plCountdown = PL_REFRESH_SEC;
  const el = document.getElementById('pl-status');
  const fmM = v => ((+v||0)/1e6).toFixed(2) + ' م';
  const tick = () => {
    if (!el) return;
    const revTxt = revenue != null ? ` | إيرادات: ${fmM(revenue)}` : '';
    if (_plCountdown > 0) {
      el.textContent = `✅ ${months} شهر${revTxt} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_plCountdown}ث`;
      el.style.color = '#1a7a3c';
    }
  };
  tick();
  _plTimer = setInterval(() => {
    if (!_plIsActive()) { _plStopTimer(); return; }
    _plCountdown = Math.max(0, _plCountdown - 1);
    tick();
  }, 1000);
}

// Returns info about the last month if its OpEx looks suspiciously low
// (< 60 % of the prior-months average) — signals an open / not-yet-closed month.
function detectOpenMonth(plMonths) {
  if (plMonths.length < 2) return null;
  const last  = plMonths[plMonths.length - 1];
  const prior = plMonths.slice(0, -1);

  const totalOpex = m => m.sal + m.rent + m.dist + m.adm + m.maint + m.sell + m.fin + m.char + m.oth;
  const avgOpex   = prior.reduce((s, m) => s + totalOpex(m), 0) / prior.length;
  const lastOpex  = totalOpex(last);
  if (lastOpex >= avgOpex * 0.6) return null;   // looks normal

  const avgSal  = prior.reduce((s, m) => s + m.sal,  0) / prior.length;
  const avgRent = prior.reduce((s, m) => s + m.rent, 0) / prior.length;
  const missing = [];
  if (last.sal  < avgSal  * 0.6) missing.push(`رواتب (متوسط ${fmt(avgSal)} ر.س، مُسجَّل ${fmt(last.sal)} ر.س)`);
  if (last.rent < avgRent * 0.3) missing.push(`إيجار (متوسط ${fmt(avgRent)} ر.س، مُسجَّل ${fmt(last.rent)} ر.س)`);

  return {
    label:       last.label,
    lastOpex,
    avgOpex,
    estMissing:  avgOpex - lastOpex,
    missing,
  };
}

function renderOpenMonthBanner(bannerId, plMonths) {
  const el = document.getElementById(bannerId);
  if (!el) return;
  const info = detectOpenMonth(plMonths);
  if (!info) { el.innerHTML = ''; return; }

  const missingList = info.missing.length
    ? `<ul style="margin:6px 0 0 0;padding:0 18px 0 0;font-size:13px">${info.missing.map(t => `<li>${t}</li>`).join('')}</ul>`
    : '';

  el.innerHTML = `
    <div style="
      display:flex;align-items:flex-start;gap:12px;
      background:rgba(218,154,74,0.12);border:1px solid rgba(218,154,74,0.45);
      border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#e8c07a;
      font-size:14px;line-height:1.6;
    ">
      <span style="font-size:20px;flex-shrink:0">⚠️</span>
      <div>
        <strong>شهر مفتوح — بيانات ${info.label} غير مكتملة</strong><br>
        <span style="color:#b0c4d8;font-size:13px">
          مصروفات ${info.label} البالغة ${fmt(info.lastOpex)} ر.س أقل بكثير من متوسط الأشهر السابقة
          (${fmt(info.avgOpex)} ر.س). الفرق المتوقع ≈ ${fmt(info.estMissing)} ر.س —
          القيود لم تُسجَّل بعد في النظام المحاسبي.
        </span>
        ${missingList}
        <span style="color:#7a9aba;font-size:12px;display:block;margin-top:4px">
          صافي الربح المعروض قد يكون مُبالَغاً فيه حتى يُقفَل الشهر.
        </span>
      </div>
    </div>`;
}

// Derive all computed P&L fields from a raw array of monthly objects
function aggregatePL(months) {
  const agg = { revenue: 0, cogs: 0, otherCost: 0, sal: 0, rent: 0, maint: 0, sell: 0, dist: 0, adm: 0, fin: 0, char: 0, oth: 0 };
  months.forEach(m => {
    agg.revenue   += m.revenue   || 0;
    agg.cogs      += m.cogs      || 0;
    agg.otherCost += m.otherCost || 0;
    agg.sal       += m.sal       || 0;
    agg.rent      += m.rent      || 0;
    agg.maint     += m.maint     || 0;
    agg.sell      += m.sell      || 0;
    agg.dist      += m.dist      || 0;
    agg.adm       += m.adm       || 0;
    agg.fin       += m.fin       || 0;
    agg.char      += m.char      || 0;
    agg.oth       += m.oth       || 0;
  });
  const totalCost       = agg.cogs + agg.otherCost;
  const grossProfit     = agg.revenue - totalCost;
  const coreOpex        = agg.sal + agg.rent + agg.maint + agg.sell + agg.dist + agg.adm + agg.char + agg.oth;
  const ebit            = grossProfit - coreOpex;   // ربح تشغيلي قبل الفوائد
  const totalOpex       = coreOpex + agg.fin;
  const operatingProfit = grossProfit - totalOpex;
  const netProfit       = operatingProfit;
  const grossMargin     = agg.revenue ? grossProfit / agg.revenue * 100 : 0;
  const ebitMargin      = agg.revenue ? ebit       / agg.revenue * 100 : 0;
  const operatingMargin = agg.revenue ? operatingProfit / agg.revenue * 100 : 0;
  const netMargin       = agg.revenue ? netProfit / agg.revenue * 100 : 0;
  return { ...agg, totalCost, grossProfit, coreOpex, ebit, totalOpex, operatingProfit, netProfit, grossMargin, ebitMargin, operatingMargin, netMargin };
}

function fmtPlNum(n) {
  if (n < 0) return '(' + fmt(Math.abs(n)) + ')';
  return fmt(n);
}

function marginBadge(pct) {
  const cls = pct >= 0 ? 'pl-margin-pos' : 'pl-margin-neg';
  return `<span class="pl-margin-badge ${cls}">${fmtPct(pct)}</span>`;
}

function renderPLKPIs(c, cp) {
  const dBadge = (cur, prev) => {
    if (!cp || prev == null || Math.abs(prev) < 1) return '';
    const d = cur - prev; const pct = d / Math.abs(prev) * 100;
    const col = d >= 0 ? '#4ada8e' : '#da4a4a'; const arrow = d >= 0 ? '▲' : '▼';
    return `<span style="font-size:.68rem;color:${col};margin-right:5px">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  };
  const items = [
    { lbl: PL_LABELS.revenue,     val: fmt(c.revenue)+' ر.س',           sub: dBadge(c.revenue, cp?.revenue)+'100% من الإيراد',                                             accent: PL_COLORS.revenue },
    { lbl: PL_LABELS.grossProfit, val: fmtPlNum(c.grossProfit)+' ر.س',  sub: dBadge(c.grossProfit, cp?.grossProfit)+'هامش '+fmtPct(c.grossMargin),                        accent: c.grossProfit>=0?PL_COLORS.grossProfit:PL_COLORS.netLoss },
    { lbl: 'ربح التشغيل (EBIT)',  val: fmtPlNum(c.ebit)+' ر.س',         sub: dBadge(c.ebit, cp?.ebit)+'هامش '+fmtPct(c.ebitMargin),                                      accent: c.ebit>=0?'#4a9eda':'#da4a4a' },
    { lbl: PL_LABELS.netProfit,   val: fmtPlNum(c.netProfit)+' ر.س',    sub: dBadge(c.netProfit, cp?.netProfit)+'هامش '+fmtPct(c.netMargin),                             accent: c.netProfit>=0?PL_COLORS.netProfit:PL_COLORS.netLoss },
    { lbl: 'إجمالي المصروفات',    val: fmt(c.totalOpex)+' ر.س',         sub: dBadge(-c.totalOpex, cp?-cp.totalOpex:null)+(c.revenue>0?(c.totalOpex/c.revenue*100).toFixed(1)+'% من الإيراد':'—'), accent: '#da9a4a' },
    { lbl: 'فوائد بنكية',         val: fmt(c.fin)+' ر.س',               sub: c.revenue>0?(c.fin/c.revenue*100).toFixed(2)+'% من الإيراد':'—',                            accent: c.fin>c.revenue*0.02?'#da4a4a':'#da9a4a' },
  ];
  document.getElementById('pl-kpis').innerHTML = items.map(k =>
    `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

function renderPLStatement(c, cp) {
  const profitClass = c.netProfit >= 0 ? 'pl-profit' : 'pl-loss';
  const gpClass     = c.grossProfit >= 0 ? 'pl-profit' : 'pl-loss';
  const ebitClass   = c.ebit >= 0 ? 'pl-profit' : 'pl-loss';

  const pct = v => c.revenue > 0 ? (v / c.revenue * 100).toFixed(1) + '%' : '';
  const cmpCell = (cur, prev) => {
    if (!cp || prev == null) return '<td class="pl-pct"></td>';
    const d = cur - prev;
    if (Math.abs(d) < 1) return `<td class="pl-pct" style="color:#506070">—</td>`;
    const col = d >= 0 ? '#4ada8e' : '#da4a4a';
    return `<td class="pl-pct" style="color:${col};font-size:.75rem">${d > 0 ? '+' : ''}${fmt(d)}</td>`;
  };
  const miniBar = (v, col, maxV) => {
    if (!v || !maxV) return '';
    const w = Math.min(100, v / maxV * 100).toFixed(0);
    return `<div style="height:3px;border-radius:2px;background:#0a1e30;overflow:hidden;margin-top:3px"><div style="height:100%;border-radius:2px;background:${col};width:${w}%"></div></div>`;
  };
  const maxOpex = Math.max(c.sal, c.rent, c.maint, c.sell, c.dist, c.adm, c.fin, c.char, c.oth);

  const opexRow = (key, col) => {
    const v = c[key] || 0; if (!v) return '';
    return `<tr>
      <td class="pl-indent">${CAT_LABEL[key]}${miniBar(v, col, maxOpex)}</td>
      <td class="pl-num">${fmt(v)} ر.س</td>
      <td class="pl-pct">${pct(v)}</td>
      ${cmpCell(-v, cp ? -(cp[key]||0) : null)}
    </tr>`;
  };

  const hasComp = !!cp;
  const cmpHdr = hasComp ? '<th class="pl-pct" style="color:#506070;font-size:.75rem">Δ مقارنة</th>' : '';

  const rows = [
    `<thead><tr><th style="width:50%">البيان</th><th class="pl-num">المبلغ</th><th class="pl-pct">% إيراد</th>${cmpHdr}</tr></thead><tbody>`,
    `<tr class="pl-revenue"><td><strong>${PL_LABELS.revenue}</strong></td><td class="pl-num">${fmt(c.revenue)} ر.س</td><td class="pl-pct">${c.revenue?'100%':''}</td>${cmpCell(c.revenue, cp?.revenue)}</tr>`,
    `<tr class="pl-cogs"><td class="pl-indent">(-) ${PL_LABELS.cogs}</td><td class="pl-num">(${fmt(c.totalCost)}) ر.س</td><td class="pl-pct">${pct(c.totalCost)}</td>${cmpCell(-c.totalCost, cp?-cp.totalCost:null)}</tr>`,
    `<tr class="pl-subtotal ${gpClass}"><td><strong>${PL_LABELS.grossProfit}</strong></td><td class="pl-num"><strong>${fmtPlNum(c.grossProfit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.grossMargin)}</td>${cmpCell(c.grossProfit, cp?.grossProfit)}</tr>`,
    `<tr><td colspan="4" class="pl-section">المصروفات التشغيلية (قبل الفوائد)</td></tr>`,
    opexRow('sal',  '#5baef0'),
    opexRow('rent', '#4a9eda'),
    opexRow('maint','#6ab0d0'),
    opexRow('sell', '#4ada8e'),
    opexRow('dist', '#80d0a0'),
    opexRow('adm',  '#a0b0c0'),
    opexRow('char', '#8090a0'),
    opexRow('oth',  '#7080a0'),
    `<tr class="pl-subtotal"><td><strong>إجمالي المصروفات التشغيلية</strong></td><td class="pl-num"><strong>(${fmt(c.coreOpex)}) ر.س</strong></td><td class="pl-pct">${pct(c.coreOpex)}</td>${cmpCell(-c.coreOpex, cp?-cp.coreOpex:null)}</tr>`,
    `<tr class="pl-subtotal ${ebitClass}"><td><strong>ربح التشغيل قبل الفوائد (EBIT)</strong></td><td class="pl-num"><strong>${fmtPlNum(c.ebit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.ebitMargin)}</td>${cmpCell(c.ebit, cp?.ebit)}</tr>`,
    `<tr><td colspan="4" class="pl-section">تكاليف التمويل</td></tr>`,
    opexRow('fin',  '#da4a4a'),
    `<tr class="pl-subtotal"><td><strong>إجمالي تكاليف التمويل</strong></td><td class="pl-num"><strong>(${fmt(c.fin)}) ر.س</strong></td><td class="pl-pct">${pct(c.fin)}</td>${cmpCell(-c.fin, cp?-cp.fin:null)}</tr>`,
    `<tr class="pl-total ${profitClass}"><td><strong>${c.netProfit>=0?PL_LABELS.netProfit:'صافي الخسارة'}</strong></td><td class="pl-num"><strong>${fmtPlNum(c.netProfit)} ر.س</strong></td><td class="pl-pct">${marginBadge(c.netMargin)}</td>${cmpCell(c.netProfit, cp?.netProfit)}</tr>`,
    '</tbody>',
  ];
  document.getElementById('pl-statement').innerHTML = rows.join('');
}

function renderPLMonthlyTable(plMonths) {
  let prevNP = null;
  document.getElementById('pl-monthly-tbody').innerHTML = plMonths.map(m => {
    const totalCost   = (m.cogs||0) + (m.otherCost||0);
    const grossProfit = m.revenue - totalCost;
    const coreOpex    = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.char||0)+(m.oth||0);
    const ebit        = grossProfit - coreOpex;
    const fin         = m.fin || 0;
    const netProfit   = ebit - fin;
    const gm          = m.revenue ? grossProfit / m.revenue * 100 : 0;
    const em          = m.revenue ? ebit        / m.revenue * 100 : 0;
    const nm          = m.revenue ? netProfit   / m.revenue * 100 : 0;
    const npClass     = netProfit >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const ebitClass   = ebit >= 0 ? 'color:#4a9eda' : 'color:#da4a4a';
    let momCell = '<td class="num">—</td>';
    if (prevNP !== null && Math.abs(prevNP) > 1) {
      const d = netProfit - prevNP; const pct = d / Math.abs(prevNP) * 100;
      const col = d >= 0 ? '#4ada8e' : '#da4a4a';
      momCell = `<td class="num" style="color:${col};font-size:.75rem">${d>=0?'+':''}${pct.toFixed(1)}%</td>`;
    }
    prevNP = netProfit;
    return `<tr>
      <td>${m.label}</td>
      <td class="num">${fmt(m.revenue)}</td>
      <td class="num">${fmt(totalCost)}</td>
      <td class="num" style="${grossProfit>=0?'color:#4ada8e':'color:#da4a4a'}">${fmtPlNum(grossProfit)}</td>
      <td class="num">${marginBadge(gm)}</td>
      <td class="num">${fmt(coreOpex)}</td>
      <td class="num" style="${ebitClass}">${fmtPlNum(ebit)}</td>
      <td class="num" style="color:#da9a4a">${fin?fmt(fin):'—'}</td>
      <td class="num" style="${npClass}">${fmtPlNum(netProfit)}</td>
      <td class="num">${marginBadge(nm)}</td>
      ${momCell}
    </tr>`;
  }).join('') || '<tr><td colspan="11" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';
}

function filterPL(period) {
  const pl = State.get('pl');
  if (period === 'all' || !period) return pl;
  if (period === 'ytd')              return pl.filter(m => m.month.startsWith(CUR_Y()));
  if (period.startsWith('year-'))    { const y = period.slice(5); return pl.filter(m => m.month.startsWith(y)); }
  if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); return pl.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
  return pl.filter(m => m.month === period);
}

function getPriorPeriodPL(period) {
  const pl = State.get('pl');
  if (!pl || !period || period === 'all') return null;
  if (period === 'ytd') {
    const prevY = String(+CUR_Y() - 1);
    const rows = pl.filter(m => m.month.startsWith(prevY));
    return rows.length ? rows : null;
  }
  if (period.startsWith('year-')) {
    const rows = pl.filter(m => m.month.startsWith(String(+period.slice(5) - 1)));
    return rows.length ? rows : null;
  }
  if (period.startsWith('quarter-')) {
    const [, y, q] = period.split('-');
    const prevY = +q === 1 ? +y - 1 : +y;
    const prevQ = +q === 1 ? 4 : +q - 1;
    const rows = pl.filter(m => m.month.startsWith(String(prevY)) && qOf(m.month) === prevQ);
    return rows.length ? rows : null;
  }
  // single month → same month prior year
  const [y, mo] = period.split('-');
  const rows = pl.filter(m => m.month === `${+y - 1}-${mo}`);
  return rows.length ? rows : null;
}

function renderPLTab() {
  buildPeriodOptions('pl-period-sel', true);
  const period   = (document.getElementById('pl-period-sel') || {}).value || 'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) {
    document.getElementById('pl-kpis').innerHTML      = '';
    document.getElementById('pl-statement').innerHTML = '';
    document.getElementById('pl-monthly-tbody').innerHTML = '<tr><td colspan="11" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات — في انتظار تحديث البيانات…</td></tr>';
    return;
  }
  const computed  = aggregatePL(plMonths);
  const priorRows = getPriorPeriodPL(period);
  const priorComp = priorRows ? aggregatePL(priorRows) : null;

  // Prior period label for period label span
  const lblEl = document.getElementById('pl-period-label');
  if (lblEl) lblEl.textContent = priorComp ? `مقارنة بنفس الفترة السابقة` : '';

  renderOpenMonthBanner('pl-open-month-banner', plMonths);
  renderPLKPIs(computed, priorComp);
  renderPLWaterfall(computed);
  renderPLTrend(plMonths);
  renderPLStatement(computed, priorComp);
  renderPLMonthlyTable(plMonths);
  _plStartCountdown(plMonths.length, computed?.revenue);
}

// ── P&L exports ───────────────────────────────────────────────────────────────
function buildPLHTMLReport(c, cp, plMonths, period) {
  const periodLabel = period === 'all' ? 'كل الفترة' : period === 'ytd' ? `السنة الجارية ${CUR_Y()}` : period;
  const pct = (v, base) => base > 0 ? (v / base * 100).toFixed(1) + '%' : '—';
  const fmtD = (cur, prev) => {
    if (!cp || prev == null || Math.abs(prev) < 1) return '';
    const d = cur - prev; const p = d / Math.abs(prev) * 100;
    return `<span style="color:${d>=0?'#1a7a4a':'#8a1010'};font-size:.75rem"> (${d>=0?'+':''}${p.toFixed(1)}%)</span>`;
  };
  const opexItems = [
    { lbl: CAT_LABEL.sal,  v: c.sal  }, { lbl: CAT_LABEL.rent, v: c.rent },
    { lbl: CAT_LABEL.maint,v: c.maint}, { lbl: CAT_LABEL.sell, v: c.sell },
    { lbl: CAT_LABEL.dist, v: c.dist }, { lbl: CAT_LABEL.adm,  v: c.adm  },
    { lbl: CAT_LABEL.char, v: c.char }, { lbl: CAT_LABEL.oth,  v: c.oth  },
  ].filter(x => x.v > 0);

  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>قائمة الدخل — ${periodLabel}</title>
<style>
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:0;padding:20px;background:#fff;color:#222;direction:rtl}
  h1{font-size:1.4rem;border-bottom:3px solid #1a4a8a;padding-bottom:10px;color:#1a4a8a;margin-bottom:6px}
  .meta{font-size:.78rem;color:#666;margin-bottom:20px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px}
  .kpi{background:#f0f4fa;border-radius:8px;padding:12px 16px;border-right:4px solid #1a4a8a}
  .kpi .lbl{font-size:.74rem;color:#557;margin-bottom:4px}
  .kpi .val{font-size:1.1rem;font-weight:700;color:#1a4a8a}
  .kpi .sub{font-size:.72rem;color:#779;margin-top:3px}
  table{width:100%;border-collapse:collapse;font-size:.82rem}
  th{background:#1a4a8a;color:#fff;padding:8px 10px;text-align:right;font-weight:600}
  td{padding:7px 10px;border-bottom:1px solid #e0e8f0}
  .section td{background:#e8f0fb;font-weight:700;color:#1a4a8a;font-size:.85rem;padding:8px 10px}
  .subtotal td{background:#f5f8ff;font-weight:600;border-top:2px solid #cde}
  .total td{background:#1a4a8a;color:#fff;font-weight:700;font-size:.95rem}
  .indent{padding-right:24px !important}
  .num{text-align:left}
  .pos{color:#1a7a4a}.neg{color:#8a1010}
  .bar-bg{height:4px;background:#e0e8f0;border-radius:2px;overflow:hidden;margin-top:3px}
  .bar-fill{height:100%;border-radius:2px}
  @media print{body{padding:10px}}
</style></head><body>
<h1>📋 قائمة الدخل</h1>
<div class="meta">الفترة: ${periodLabel} &nbsp;|&nbsp; ${plMonths.length} شهر &nbsp;|&nbsp; تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
<div class="kpis">
  ${[
    { lbl:'إجمالي الإيرادات', val:fmt(c.revenue)+' ر.س', sub:'100% من الإيراد' },
    { lbl:'مجمل الربح',      val:fmtPlNum(c.grossProfit)+' ر.س', sub:'هامش '+fmtPct(c.grossMargin) },
    { lbl:'ربح التشغيل (EBIT)', val:fmtPlNum(c.ebit)+' ر.س', sub:'هامش '+fmtPct(c.ebitMargin) },
    { lbl:'صافي الربح / الخسارة', val:fmtPlNum(c.netProfit)+' ر.س', sub:'هامش '+fmtPct(c.netMargin) },
    { lbl:'إجمالي المصروفات', val:fmt(c.totalOpex)+' ر.س', sub:pct(c.totalOpex,c.revenue)+' من الإيراد' },
    { lbl:'الفوائد البنكية',   val:fmt(c.fin)+' ر.س', sub:pct(c.fin,c.revenue)+' من الإيراد' },
  ].map(k=>`<div class="kpi"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('')}
</div>
<table>
  <thead><tr><th style="width:50%">البيان</th><th class="num">المبلغ (ر.س)</th><th class="num">% إيراد</th>${cp?'<th class="num">Δ مقارنة</th>':''}</tr></thead>
  <tbody>
    <tr><td><strong>الإيرادات</strong></td><td class="num">${fmt(c.revenue)}</td><td class="num">100%</td>${cp?`<td class="num">${fmtD(c.revenue,cp.revenue)}</td>`:''}</tr>
    <tr><td class="indent">(-) تكلفة المبيعات</td><td class="num">(${fmt(c.totalCost)})</td><td class="num">${pct(c.totalCost,c.revenue)}</td>${cp?`<td class="num">${fmtD(-c.totalCost,-cp.totalCost)}</td>`:''}</tr>
    <tr class="subtotal"><td><strong>مجمل الربح</strong></td><td class="num ${c.grossProfit>=0?'pos':'neg'}">${fmtPlNum(c.grossProfit)}</td><td class="num">${fmtPct(c.grossMargin)}</td>${cp?`<td class="num">${fmtD(c.grossProfit,cp.grossProfit)}</td>`:''}</tr>
    <tr class="section"><td colspan="${cp?4:3}">المصروفات التشغيلية (قبل الفوائد)</td></tr>
    ${opexItems.map(x=>`<tr><td class="indent">${x.lbl}</td><td class="num">${fmt(x.v)}</td><td class="num">${pct(x.v,c.revenue)}</td>${cp?`<td class="num">${fmtD(-x.v,-(cp[opexItems.indexOf(x)]?.v||x.v))}</td>`:''}</tr>`).join('')}
    <tr class="subtotal"><td><strong>إجمالي المصروفات التشغيلية</strong></td><td class="num">(${fmt(c.coreOpex)})</td><td class="num">${pct(c.coreOpex,c.revenue)}</td>${cp?`<td class="num">${fmtD(-c.coreOpex,-cp.coreOpex)}</td>`:''}</tr>
    <tr class="subtotal"><td><strong>ربح التشغيل قبل الفوائد (EBIT)</strong></td><td class="num ${c.ebit>=0?'pos':'neg'}">${fmtPlNum(c.ebit)}</td><td class="num">${fmtPct(c.ebitMargin)}</td>${cp?`<td class="num">${fmtD(c.ebit,cp.ebit)}</td>`:''}</tr>
    <tr class="section"><td colspan="${cp?4:3}">تكاليف التمويل</td></tr>
    <tr><td class="indent">(-) فوائد بنكية ومصرفية</td><td class="num">(${fmt(c.fin)})</td><td class="num">${pct(c.fin,c.revenue)}</td>${cp?`<td class="num">${fmtD(-c.fin,-cp.fin)}</td>`:''}</tr>
    <tr class="total"><td><strong>${c.netProfit>=0?'صافي الربح':'صافي الخسارة'}</strong></td><td class="num">${fmtPlNum(c.netProfit)}</td><td class="num">${fmtPct(c.netMargin)}</td>${cp?`<td class="num">${fmtD(c.netProfit,cp.netProfit)}</td>`:''}</tr>
  </tbody>
</table>
<div style="margin-top:28px">
  <table>
    <thead><tr><th>الشهر</th><th class="num">الإيراد</th><th class="num">مجمل الربح</th><th class="num">ه.إجمالي</th><th class="num">EBIT</th><th class="num">الفوائد</th><th class="num">صافي الربح</th><th class="num">ه.صافي</th></tr></thead>
    <tbody>
      ${plMonths.map(m=>{
        const tc=((m.cogs||0)+(m.otherCost||0));const gp=m.revenue-tc;
        const co=(m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.char||0)+(m.oth||0);
        const ebit=gp-co;const np=ebit-(m.fin||0);
        const gm=m.revenue?gp/m.revenue*100:0;const nm=m.revenue?np/m.revenue*100:0;
        return `<tr><td>${m.label||m.month}</td><td class="num">${fmt(m.revenue)}</td><td class="num ${gp>=0?'pos':'neg'}">${fmtPlNum(gp)}</td><td class="num">${gm.toFixed(1)}%</td><td class="num ${ebit>=0?'pos':'neg'}">${fmtPlNum(ebit)}</td><td class="num">${m.fin?fmt(m.fin):'—'}</td><td class="num ${np>=0?'pos':'neg'}">${fmtPlNum(np)}</td><td class="num">${nm.toFixed(1)}%</td></tr>`;
      }).join('')}
    </tbody>
  </table>
</div>
</body></html>`;
}

function exportPLHTML() {
  const period = (document.getElementById('pl-period-sel')||{}).value||'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) { alert('لا توجد بيانات'); return; }
  const c = aggregatePL(plMonths);
  const cp = getPriorPeriodPL(period) ? aggregatePL(getPriorPeriodPL(period)) : null;
  const html = buildPLHTMLReport(c, cp, plMonths, period);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type:'text/html;charset=utf-8' }));
  const lbl = period === 'all' ? 'all' : period;
  a.download = `pl-${lbl}.html`;
  a.click();
}

function printPLPDF() {
  const period = (document.getElementById('pl-period-sel')||{}).value||'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) { alert('لا توجد بيانات'); return; }
  const c = aggregatePL(plMonths);
  const cp = getPriorPeriodPL(period) ? aggregatePL(getPriorPeriodPL(period)) : null;
  const html = buildPLHTMLReport(c, cp, plMonths, period);
  const w = window.open('', '_blank', 'width=1000,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportPLExcel() {
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }
  const period = (document.getElementById('pl-period-sel')||{}).value||'all';
  const plMonths = filterPL(period);
  if (!plMonths.length) { alert('لا توجد بيانات'); return; }
  const c  = aggregatePL(plMonths);
  const cp = getPriorPeriodPL(period) ? aggregatePL(getPriorPeriodPL(period)) : null;
  const periodLabel = period === 'all' ? 'كل الفترة' : period === 'ytd' ? `السنة ${CUR_Y()}` : period;

  const wb = new ExcelJS.Workbook(); wb.creator = 'MekSoft Expenses Dashboard';

  const hdr = (ws, cols) => {
    const row = ws.addRow(cols.map(c => c.h));
    row.eachCell(cell => { cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1A4A8A'}}; cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10}; cell.alignment={horizontal:'center'}; });
    cols.forEach((c, i) => { ws.getColumn(i+1).width = c.w||16; });
  };

  // Sheet 1: قائمة الدخل
  const ws1 = wb.addWorksheet('قائمة الدخل'); ws1.views=[{rightToLeft:true}];
  ws1.addRow([`قائمة الدخل — ${periodLabel}`]).getCell(1).font={bold:true,size:13,color:{argb:'FF1A4A8A'}};
  ws1.addRow([]);
  const s1Cols = cp
    ? [{h:'البيان',w:35},{h:'الفترة الحالية',w:18},{h:'% إيراد',w:12},{h:'الفترة السابقة',w:18},{h:'Δ المبلغ',w:18},{h:'Δ %',w:12}]
    : [{h:'البيان',w:35},{h:'المبلغ',w:18},{h:'% إيراد',w:12}];
  hdr(ws1, s1Cols);
  const addStmt = (lbl, cur, prev, isNeg) => {
    const v = isNeg ? -cur : cur; const pv = prev != null ? (isNeg ? -prev : prev) : null;
    const pct = c.revenue > 0 ? (Math.abs(cur)/c.revenue*100).toFixed(1)+'%' : '—';
    const row = cp
      ? ws1.addRow([lbl, v, pct, pv != null ? pv : '—', pv != null ? v - pv : '—', pv && Math.abs(pv)>1 ? ((v-pv)/Math.abs(pv)*100).toFixed(1)+'%' : '—'])
      : ws1.addRow([lbl, v, pct]);
    return row;
  };
  addStmt('الإيرادات',               c.revenue,    cp?.revenue);
  addStmt('(-) تكلفة المبيعات',      c.totalCost,  cp?.totalCost, true);
  addStmt('مجمل الربح',             c.grossProfit, cp?.grossProfit).font={bold:true};
  ws1.addRow(['المصروفات التشغيلية']).getCell(1).font={bold:true,color:{argb:'FF1A4A8A'}};
  [['sal',CAT_LABEL.sal],['rent',CAT_LABEL.rent],['maint',CAT_LABEL.maint],['sell',CAT_LABEL.sell],['dist',CAT_LABEL.dist],['adm',CAT_LABEL.adm],['char',CAT_LABEL.char],['oth',CAT_LABEL.oth]]
    .filter(([k])=>c[k]>0).forEach(([k,lbl]) => addStmt(lbl, c[k], cp?.[k], true));
  addStmt('إجمالي المصروفات التشغيلية', c.coreOpex, cp?.coreOpex, true).font={bold:true};
  addStmt('ربح التشغيل قبل الفوائد (EBIT)', c.ebit, cp?.ebit).font={bold:true};
  ws1.addRow(['تكاليف التمويل']).getCell(1).font={bold:true,color:{argb:'FF8A1010'}};
  addStmt('(-) فوائد بنكية', c.fin, cp?.fin, true);
  addStmt(c.netProfit>=0?'صافي الربح':'صافي الخسارة', c.netProfit, cp?.netProfit).font={bold:true,size:11};

  // Sheet 2: التفصيل الشهري
  const ws2 = wb.addWorksheet('التفصيل الشهري'); ws2.views=[{rightToLeft:true}];
  ws2.addRow([`الأداء الشهري — ${periodLabel}`]).getCell(1).font={bold:true,size:13,color:{argb:'FF1A4A8A'}};
  ws2.addRow([]);
  hdr(ws2,[{h:'الشهر',w:14},{h:'الإيرادات',w:16},{h:'ت.المبيعات',w:16},{h:'مجمل الربح',w:16},{h:'ه.إجمالي%',w:13},{h:'م.تشغيلية',w:16},{h:'EBIT',w:16},{h:'فوائد',w:14},{h:'صافي الربح',w:16},{h:'ه.صافي%',w:13}]);
  plMonths.forEach(m => {
    const tc=(m.cogs||0)+(m.otherCost||0); const gp=m.revenue-tc;
    const co=(m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.char||0)+(m.oth||0);
    const ebit=gp-co; const np=ebit-(m.fin||0);
    ws2.addRow([m.label||m.month, m.revenue, tc, gp, m.revenue?(gp/m.revenue*100).toFixed(1)+'%':'—', co, ebit, m.fin||0, np, m.revenue?(np/m.revenue*100).toFixed(1)+'%':'—']);
  });

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download=`pl-${period}.xlsx`; a.click();
}
