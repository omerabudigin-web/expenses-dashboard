// ── CASH FLOW tab ─────────────────────────────────────────────────────────────

// Indirect method: derives monthly CF from BS balance changes + P&L net income.
// Signs follow Saudi SME / IFRS for SMEs Section 7:
//   Asset accounts (debit-normal): balance increase = cash outflow → negate Δ
//   Liability accounts (credit-normal): stored negative; becoming more negative = grew = cash inflow → negate Δ
function cfMonthly(bsRows, plRows, bfRows) {
  const months = [...new Set(bsRows.map(r => r.month))].sort();
  const byMonth = {};
  months.forEach(mo => {
    byMonth[mo] = {};
    bsRows.filter(r => r.month === mo).forEach(r => { byMonth[mo][r.grpCode] = r.balance; });
  });
  const plByMonth = {};
  (plRows || []).forEach(m => {
    const g = (m.revenue||0) - (m.cogs||0) - (m.otherCost||0);
    const x = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    plByMonth[m.month] = g - x;
  });
  // Bank-facilities balance by month (account 2010202%) — carry-forward so quiet months don't corrupt deltas
  const bfByMonth = {};
  (bfRows || []).forEach(r => { bfByMonth[r.month] = r.balance; });
  const bfCarried = {};
  let _lastBF = 0;
  months.forEach(mo => {
    if (bfByMonth[mo] !== undefined) _lastBF = bfByMonth[mo];
    bfCarried[mo] = _lastBF;
  });

  return months.map((mo, i) => {
    const cur  = byMonth[mo];
    const prev = i > 0 ? byMonth[months[i - 1]] : {};
    const label = (bsRows.find(r => r.month === mo) || {}).label || mo;
    const b = c => cur[c]  || 0;
    const p = c => prev[c] || 0;
    const Δ = c => b(c) - p(c);

    const openingCash = p('10301');
    const closingCash = b('10301');
    const netIncome   = plByMonth[mo] !== undefined ? plByMonth[mo] : 0;

    const prevMo          = i > 0 ? months[i - 1] : null;
    const bf_cur          = bfCarried[mo];
    const bf_prev         = prevMo ? bfCarried[prevMo] : 0;
    const Δ_bf            = bf_cur - bf_prev;
    const δBankFacilities = -Δ_bf;

    const δInventory = -Δ('10302');
    const δAR        = -Δ('10303');
    const δEmpRec    = -Δ('10304');
    const δOtherCA   = -Δ('10305');
    const δAP        = -Δ('20101');
    const δOtherPay  = -(Δ('20102') - Δ_bf);
    const δAccrued   = -Δ('20103');
    const wcAdjust   = δInventory + δAR + δEmpRec + δOtherCA + δAP + δOtherPay + δAccrued;
    const operatingCF = netIncome + wcAdjust;

    const FIXED        = ['10101','10102','10103','10104','10105','10106','10107','10108'];
    const δFixedAssets = -FIXED.reduce((s, c) => s + Δ(c), 0);
    const δProjects    = -Δ('10201');
    const investingCF  = δFixedAssets + δProjects;

    const δLTLoans    = -Δ('20201');
    const δCapital    = -Δ('30101');
    const δPartners   = -Δ('30102');
    const financingCF = δLTLoans + δBankFacilities + δCapital + δPartners;

    return {
      month: mo, label,
      openingCash, closingCash, netCashChange: closingCash - openingCash,
      netIncome, δInventory, δAR, δEmpRec, δOtherCA, δAP, δOtherPay, δAccrued,
      wcAdjust, operatingCF, δFixedAssets, δProjects, investingCF,
      δLTLoans, δBankFacilities, δCapital, δPartners, financingCF,
    };
  });
}

function aggregateCF(rows) {
  if (!rows.length) return null;
  const keys = ['netIncome','δInventory','δAR','δEmpRec','δOtherCA','δAP','δOtherPay','δAccrued',
                 'wcAdjust','operatingCF','δFixedAssets','δProjects','investingCF',
                 'δLTLoans','δBankFacilities','δCapital','δPartners','financingCF'];
  const agg = {}; keys.forEach(k => { agg[k] = 0; });
  rows.forEach(m => { keys.forEach(k => { agg[k] += (m[k] || 0); }); });
  agg.openingCash   = rows[0].openingCash;
  agg.closingCash   = rows[rows.length - 1].closingCash;
  agg.netCashChange = agg.closingCash - agg.openingCash;
  return agg;
}

// Returns the previous comparable period's CF rows for a given period value
function getCFComparablePrev(period, allCF) {
  if (!period || period === 'all' || period === 'ytd') return [];
  if (period.startsWith('year-')) {
    const y = period.slice(5), pY = String(+y - 1);
    return allCF.filter(m => m.month.startsWith(pY));
  }
  if (period.startsWith('quarter-')) {
    const [, y, q] = period.split('-');
    let pY = +y, pQ = +q - 1;
    if (pQ === 0) { pQ = 4; pY -= 1; }
    return allCF.filter(m => m.month.startsWith(String(pY)) && qOf(m.month) === pQ);
  }
  // Single month → previous month
  const months = allCF.map(m => m.month).sort();
  const idx = months.indexOf(period);
  if (idx <= 0) return [];
  return allCF.filter(m => m.month === months[idx - 1]);
}

// Returns the human-readable label for a period value
function _cfPeriodLabel(period, allCF) {
  if (period === 'all') return 'كل الفترة المتاحة';
  if (period === 'ytd') return `${CUR_Y()} حتى الآن`;
  if (period.startsWith('year-')) return `سنة ${period.slice(5)}`;
  if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); return `${y} — ${Q_LABELS[+q-1]}`; }
  const row = allCF.find(m => m.month === period);
  return row ? row.label : period;
}

function buildCFPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('cf-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="all">كل الفترة المتاحة</option>';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const isCur = y === CUR_Y();
    const oy = document.createElement('option');
    oy.value = isCur ? 'ytd' : 'year-' + y;
    oy.textContent = isCur ? `السنة الجارية ${y} (حتى الآن)` : `السنة ${y} كاملاً`;
    sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      if (months.some(m => m.startsWith(y) && qOf(m) === q)) {
        const oq = document.createElement('option');
        oq.value = `quarter-${y}-${q}`;
        oq.textContent = `${y} — ${Q_LABELS[q-1]}`;
        sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o   = document.createElement('option');
    o.value = mo;
    o.textContent = row ? row.label : mo;
    sel.appendChild(o);
  });
  // Restore selection or default to latest month
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || 'all';
}

function renderCFStatement(c, cPrev, hasCmp, periodLabel, cmpLabel) {
  const NC  = hasCmp ? 3 : 2;
  const fv  = v => fmtPlNum(v) + ' ر.س';
  const cv  = v => `<td class="pl-num" style="${v < 0 ? 'color:#da4a4a' : v > 0 ? 'color:#c0d8f0' : 'color:#5a7a9a'}">${fv(v)}</td>`;
  const pv  = v => hasCmp ? `<td class="pl-num" style="color:#4a6a8a;font-size:.81rem">${(cPrev && v !== undefined) ? fv(v) : '—'}</td>` : '';
  const row = (indent, lbl, cur, cmp) =>
    `<tr><td class="${indent ? 'pl-indent' : ''}" style="${indent ? '' : 'color:#c0d8f0'}">${lbl}</td>${cv(cur)}${pv(cmp)}</tr>`;
  const sh  = t =>
    `<tr><td colspan="${NC}" style="font-size:.72rem;color:#4a6a8a;font-style:italic;padding:8px 14px 3px;background:transparent;border:none">${t}</td></tr>`;
  const sec = t => `<tr><td colspan="${NC}" class="pl-section">${t}</td></tr>`;
  const sub = (lbl, cur, cmp) => {
    const col = cur < 0 ? 'color:#da4a4a' : 'color:#4ada8e';
    return `<tr class="pl-subtotal">
      <td><strong>${lbl}</strong></td>
      <td class="pl-num" style="${col}"><strong>${fv(cur)}</strong></td>
      ${hasCmp ? `<td class="pl-num" style="color:#4a6a8a;font-size:.81rem"><strong>${cPrev ? fv(cmp) : '—'}</strong></td>` : ''}
    </tr>`;
  };
  const tot = (lbl, cur, cmp, col) => {
    const fc = col || (cur >= 0 ? '#5baef0' : '#da4a4a');
    return `<tr class="pl-total">
      <td><strong>${lbl}</strong></td>
      <td class="pl-num" style="color:${fc}"><strong>${fv(cur)}</strong></td>
      ${hasCmp ? `<td class="pl-num" style="color:#4a6a8a"><strong>${cPrev ? fv(cmp) : '—'}</strong></td>` : ''}
    </tr>`;
  };

  const hdr = hasCmp
    ? `<tr style="background:#071828;border-bottom:1px solid #1a3a5a">
        <td style="padding:7px 14px;color:#5a7a9a;font-size:.78rem"></td>
        <td class="pl-num" style="color:#7090b0;font-size:.78rem;font-weight:600;padding:7px 14px">${periodLabel}</td>
        <td class="pl-num" style="color:#4a6a8a;font-size:.78rem;font-weight:500;padding:7px 14px">${cmpLabel}</td>
      </tr>` : '';

  const check   = c.openingCash + c.netCashChange;
  const diff    = Math.abs(check - c.closingCash);
  const checkOK = diff < 1;

  return [
    hdr,
    sec('أولاً: التدفقات النقدية من الأنشطة التشغيلية'),
    row(false, 'صافي الربح (الخسارة) للفترة', c.netIncome, cPrev?.netIncome),
    sh('تعديلات في رأس المال العامل:'),
    row(true, '(الزيادة)/نقص في المخزون',                 c.δInventory,     cPrev?.δInventory),
    row(true, '(الزيادة)/نقص في الذمم المدينة التجارية',  c.δAR,            cPrev?.δAR),
    row(true, '(الزيادة)/نقص في ذمم الموظفين والسلف',     c.δEmpRec,        cPrev?.δEmpRec),
    row(true, '(الزيادة)/نقص في أرصدة مدينة أخرى',         c.δOtherCA,       cPrev?.δOtherCA),
    row(true, 'زيادة/(نقص) في الذمم الدائنة التجارية',     c.δAP,            cPrev?.δAP),
    row(true, 'زيادة/(نقص) في أرصدة دائنة أخرى',           c.δOtherPay,      cPrev?.δOtherPay),
    row(true, 'زيادة/(نقص) في المصروفات المستحقة',          c.δAccrued,       cPrev?.δAccrued),
    sub('صافي التدفقات النقدية من الأنشطة التشغيلية', c.operatingCF, cPrev?.operatingCF),

    sec('ثانياً: التدفقات النقدية من أنشطة الاستثمار'),
    row(true, '(الزيادة)/النقص في الأصول الثابتة (صافي)',  c.δFixedAssets,   cPrev?.δFixedAssets),
    row(true, '(الزيادة)/النقص في المشاريع قيد التنفيذ',    c.δProjects,      cPrev?.δProjects),
    sub('صافي التدفقات النقدية من أنشطة الاستثمار', c.investingCF, cPrev?.investingCF),

    sec('ثالثاً: التدفقات النقدية من أنشطة التمويل'),
    row(true, 'زيادة/(نقص) في التسهيلات البنكية',           c.δBankFacilities,cPrev?.δBankFacilities),
    row(true, 'زيادة/(نقص) في القروض طويلة الأجل',          c.δLTLoans,       cPrev?.δLTLoans),
    row(true, 'زيادة/(نقص) في رأس المال المدفوع',           c.δCapital,       cPrev?.δCapital),
    row(true, 'زيادة/(نقص) في حساب الشركاء',                c.δPartners,      cPrev?.δPartners),
    sub('صافي التدفقات النقدية من أنشطة التمويل', c.financingCF, cPrev?.financingCF),

    `<tr><td colspan="${NC}" style="padding:5px 0"></td></tr>`,
    tot('صافي الزيادة (النقص) في النقدية وما يعادلها', c.netCashChange, cPrev?.netCashChange),
    row(true, 'رصيد النقدية وما يعادلها في بداية الفترة', c.openingCash, cPrev?.openingCash),
    tot('رصيد النقدية وما يعادلها في نهاية الفترة', c.closingCash, cPrev?.closingCash, '#c0d8f0'),

    `<tr><td colspan="${NC}" style="font-size:.71rem;padding:6px 14px;background:${checkOK ? '#061410' : '#1a0808'};color:${checkOK ? '#3a7a4a' : '#aa4444'};border-top:1px solid ${checkOK ? '#1a4a2a' : '#6a2222'}">
      ${checkOK ? '✓' : '⚠'} مراجعة: ${fmt(c.openingCash)} + ${fmtPlNum(c.netCashChange)} = ${fmt(c.closingCash)}
      ${checkOK ? '' : ` — فرق: ${fmtPlNum(check - c.closingCash)}`}
    </td></tr>`,
  ].join('\n');
}

function renderCF() {
  const bs = State.get('bs');
  const pl = State.get('pl');

  if (!bs || !bs.length) {
    ['cf-kpis','cf-statement-body','cf-monthly-tbody'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    return;
  }

  buildCFPeriodOptions();
  const allCF   = cfMonthly(bs, pl, State.get('bankFacilities') || []);
  const period  = (document.getElementById('cf-period-sel') || {}).value || 'all';
  const cmpMode = (document.getElementById('cf-cmp-sel')    || {}).value || 'prev';

  let filtered;
  if (period === 'all')                   filtered = allCF;
  else if (period === 'ytd')              filtered = allCF.filter(m => m.month.startsWith(CUR_Y()));
  else if (period.startsWith('year-'))    { const y = period.slice(5); filtered = allCF.filter(m => m.month.startsWith(y)); }
  else if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); filtered = allCF.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
  else                                    filtered = allCF.filter(m => m.month === period);
  if (!filtered.length) filtered = allCF;

  const filteredCmp = cmpMode === 'prev' ? getCFComparablePrev(period, allCF) : [];
  const c     = aggregateCF(filtered);
  const cPrev = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;
  if (!c) return;

  const periodLabel = _cfPeriodLabel(period, allCF);
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';

  // ── KPIs ──
  const kpiDelta = (cur, prev) => {
    if (!hasCmp || !prev || Math.abs(prev) < 1) return '';
    const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
    const col = +pct >= 0 ? '#4ada8e' : '#da4a4a';
    const arr = +pct >= 0 ? '▲' : '▼';
    return `<div style="font-size:.7rem;color:${col};margin-top:2px">${arr} ${Math.abs(+pct)}%</div>
            <div style="font-size:.7rem;color:#3a5a7a;margin-top:1px">مقابل: ${fmtPlNum(prev)}</div>`;
  };
  document.getElementById('cf-kpis').innerHTML = [
    { lbl:'التدفقات التشغيلية',      cur:c.operatingCF,   prev:cPrev?.operatingCF,   accent:c.operatingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'التدفقات الاستثمارية',    cur:c.investingCF,   prev:cPrev?.investingCF,   accent:c.investingCF  >=0?'#4ada8e':'#da9a4a' },
    { lbl:'التدفقات التمويلية',      cur:c.financingCF,   prev:cPrev?.financingCF,   accent:c.financingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'صافي التغيير في النقدية', cur:c.netCashChange, prev:cPrev?.netCashChange, accent:c.netCashChange>=0?'#5baef0':'#da4a4a' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}">
    <div class="lbl">${k.lbl}</div>
    <div class="val">${fmtPlNum(k.cur)} ر.س</div>
    ${kpiDelta(k.cur, k.prev)}
  </div>`).join('');

  // ── Flow bars ──
  const cfFlowEl = document.getElementById('cf-flow-bars');
  if (cfFlowEl) {
    const vals  = [c.operatingCF, c.investingCF, c.financingCF, c.netCashChange];
    const pvals = hasCmp ? [cPrev.operatingCF, cPrev.investingCF, cPrev.financingCF, cPrev.netCashChange] : [];
    const maxAbs = Math.max(...vals.map(Math.abs), ...pvals.map(Math.abs), 1);
    const flowBar = (lbl, val, col, prevVal) => {
      const w  = Math.min(100, Math.abs(val)    / maxAbs * 100).toFixed(1);
      const wp = hasCmp ? Math.min(100, Math.abs(prevVal) / maxAbs * 100).toFixed(1) : 0;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:#c0d0e0;font-size:.82rem">${lbl}</span>
          <span style="color:${col};font-size:.82rem;font-weight:600">${fmtPlNum(val)} ر.س${hasCmp ? `<span style="color:#3a5a7a;font-size:.72rem;margin-right:8px"> / ${fmtPlNum(prevVal)}</span>` : ''}</span>
        </div>
        <div style="height:9px;border-radius:5px;background:#061420;position:relative;overflow:hidden">
          ${hasCmp ? `<div style="position:absolute;top:0;height:100%;border-radius:5px;width:${wp}%;background:${col}33;border-left:1px solid ${col}55"></div>` : ''}
          <div style="position:absolute;top:0;height:100%;border-radius:5px;width:${w}%;background:${col}99;transition:width .4s"></div>
        </div>
      </div>`;
    };
    cfFlowEl.innerHTML =
      flowBar('التدفقات التشغيلية',      c.operatingCF,  c.operatingCF >=0?'#4ada8e':'#da4a4a', cPrev?.operatingCF)  +
      flowBar('التدفقات الاستثمارية',    c.investingCF,  c.investingCF >=0?'#4ada8e':'#da9a4a', cPrev?.investingCF)  +
      flowBar('التدفقات التمويلية',      c.financingCF,  c.financingCF >=0?'#4ada8e':'#da4a4a', cPrev?.financingCF)  +
      flowBar('صافي التغيير في النقدية', c.netCashChange,c.netCashChange>=0?'#5baef0':'#da4a4a', cPrev?.netCashChange);
  }

  // ── Statement ──
  document.getElementById('cf-statement-body').innerHTML =
    renderCFStatement(c, cPrev, hasCmp, periodLabel, cmpLabel);

  // ── Trend chart ──
  renderCFTrend(allCF);

  // ── Monthly table — all months, highlight those in selected period ──
  const inRange = new Set(filtered.map(m => m.month));
  document.getElementById('cf-monthly-tbody').innerHTML = allCF.map(m => {
    const opCls  = m.operatingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const invCls = m.investingCF  >= 0 ? 'color:#4ada8e' : 'color:#da9a4a';
    const finCls = m.financingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const netCls = m.netCashChange >= 0 ? 'color:#5baef0' : 'color:#da4a4a';
    const active = inRange.has(m.month) && period !== 'all';
    return `<tr class="${active ? 'cf-mo-active' : ''}">
      <td>${m.label}</td>
      <td class="num" style="${opCls}">${fmtPlNum(m.operatingCF)}</td>
      <td class="num" style="${invCls}">${fmtPlNum(m.investingCF)}</td>
      <td class="num" style="${finCls}">${fmtPlNum(m.financingCF)}</td>
      <td class="num" style="${netCls}">${fmtPlNum(m.netCashChange)}</td>
      <td class="num" style="color:#5a7a9a">${fmt(m.openingCash)}</td>
      <td class="num">${fmt(m.closingCash)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';
}

async function exportCFExcel() {
  const bs = State.get('bs');
  const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات لتصديرها'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const allCF   = cfMonthly(bs, pl, State.get('bankFacilities') || []);
  const period  = (document.getElementById('cf-period-sel') || {}).value || 'all';
  const cmpMode = (document.getElementById('cf-cmp-sel')    || {}).value || 'prev';

  let filtered;
  if (period === 'all')                   filtered = allCF;
  else if (period === 'ytd')              filtered = allCF.filter(m => m.month.startsWith(CUR_Y()));
  else if (period.startsWith('year-'))    { const y = period.slice(5); filtered = allCF.filter(m => m.month.startsWith(y)); }
  else if (period.startsWith('quarter-')) { const [,y,q] = period.split('-'); filtered = allCF.filter(m => m.month.startsWith(y) && qOf(m.month) === +q); }
  else                                    filtered = allCF.filter(m => m.month === period);
  if (!filtered.length) filtered = allCF;

  const filteredCmp = cmpMode === 'prev' ? getCFComparablePrev(period, allCF) : [];
  const c     = aggregateCF(filtered);
  const cPrev = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;
  if (!c) return;

  const periodLabel = _cfPeriodLabel(period, allCF);
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';

  const FONT   = 'Calibri';
  const NC     = hasCmp ? 3 : 2;
  const numFmt = '#,##0;[Red](#,##0);"-"';
  const CLR = {
    navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
    bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
    textLight:'FF6A8AAA', textGray:'FF888888',
    greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
  };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: Statement ────────────────────────────────────────────────────
  const ws = wb.addWorksheet('التدفقات النقدية', { views:[{ rightToLeft:true }] });
  ws.pageSetup.paperSize=9; ws.pageSetup.orientation='portrait';
  ws.pageSetup.fitToPage=true; ws.pageSetup.fitToWidth=1;
  ws.pageSetup.margins={left:0.6,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws.columns=[{width:50},{width:20},...(hasCmp?[{width:20}]:[])];

  const spanRow = row => ws.mergeCells(row.number,1,row.number,NC);
  const addTitle = (text,sz,fc,bg) => {
    const row=ws.addRow([text]); row.height=sz>12?32:22; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'};
  };
  const addSpacer = (h=5) => {
    const row=ws.addRow(['']); row.height=h; spanRow(row);
    row.getCell(1).fill=solid(CLR.white);
  };
  const setNum = (cell,v,fc,bold) => {
    cell.value=(v!==null&&v!==undefined)?+v.toFixed(0):null;
    cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
    cell.font={name:FONT,size:9.5,color:{argb:fc||CLR.textNavy},bold:bold||false};
  };
  const addSecRow = text => {
    const row=ws.addRow([text]); row.height=20; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
    c.fill=solid(CLR.navy); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addSubHdrRow = text => {
    const row=ws.addRow([text]); row.height=15; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:8.5,italic:true,color:{argb:CLR.textLight}};
    c.fill=solid('FFF4F7FB'); c.alignment={horizontal:'right',vertical:'middle',indent:2};
  };
  const addItemRow = (label,cur,cmp,indent=true) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=17;
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,color:{argb:CLR.textDark}};
    c1.alignment={horizontal:'right',vertical:'middle',indent:indent?2:1};
    c1.border={bottom:bdr('hair','FFE8ECF0')};
    setNum(row.getCell(2),cur,CLR.textNavy,false);
    row.getCell(2).border={bottom:bdr('hair','FFE8ECF0')};
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      row.getCell(3).border={bottom:bdr('hair','FFE8ECF0')};
      row.getCell(3).fill=solid('FFF8FAFE');
    }
  };
  const addSubTotRow = (label,cur,cmp) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=18;
    const tb={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.textNavy}};
    c1.fill=solid(CLR.bluePale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=tb;
    setNum(row.getCell(2),cur,CLR.textNavy,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.bluePale),border:tb});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      Object.assign(row.getCell(3),{fill:solid('FFF0F4FA'),border:tb});
    }
  };
  const addTotalRow = (label,cur,cmp,fc) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=20;
    const bord={top:bdr('medium',CLR.navy),bottom:bdr('medium',CLR.navy)};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.navyDark}};
    c1.fill=solid(CLR.blueXPale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=bord;
    setNum(row.getCell(2),cur,fc||CLR.navyDark,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.blueXPale),border:bord});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textBlue,true);
      Object.assign(row.getCell(3),{fill:solid('FFD5E0F0'),border:bord});
    }
  };

  const dbName  = State.get('activeDb') || '';
  const company = dbName === 'MekSoftDb1' ? 'أبعاد للحديد والصلب'
    : dbName === 'MekSoftDb2' ? 'وسام للحديد والصلب' : dbName || 'المنشأة';
  const genDate = new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'});

  addTitle(company,14,CLR.white,CLR.navyDark);
  addTitle('قائمة التدفقات النقدية (الطريقة غير المباشرة)',12,CLR.white,CLR.navy);
  addTitle(`الفترة: ${periodLabel}${hasCmp?`  |  للمقارنة: ${cmpLabel}`:''}`,9.5,'FFAACCE8',CLR.navyDark);
  addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`,8.5,CLR.textLight,CLR.navyDark);
  addSpacer(4);
  {
    const row=ws.addRow(['البيان',periodLabel,...(hasCmp?[cmpLabel]:[])]);
    row.height=22;
    row.eachCell({includeEmpty:true},(cell,ci)=>{
      cell.font={name:FONT,size:10,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
  }
  addSpacer(3);
  addSecRow('أولاً: التدفقات النقدية من الأنشطة التشغيلية');
  addItemRow('صافي الربح (الخسارة) للفترة',             c.netIncome,      cPrev?.netIncome,      false);
  addSubHdrRow('تعديلات في رأس المال العامل:');
  addItemRow('(الزيادة)/نقص في المخزون',                c.δInventory,     cPrev?.δInventory);
  addItemRow('(الزيادة)/نقص في الذمم المدينة التجارية', c.δAR,            cPrev?.δAR);
  addItemRow('(الزيادة)/نقص في ذمم الموظفين والسلف',    c.δEmpRec,        cPrev?.δEmpRec);
  addItemRow('(الزيادة)/نقص في أرصدة مدينة أخرى',        c.δOtherCA,       cPrev?.δOtherCA);
  addItemRow('زيادة/(نقص) في الذمم الدائنة التجارية',    c.δAP,            cPrev?.δAP);
  addItemRow('زيادة/(نقص) في أرصدة دائنة أخرى',          c.δOtherPay,      cPrev?.δOtherPay);
  addItemRow('زيادة/(نقص) في المصروفات المستحقة',         c.δAccrued,       cPrev?.δAccrued);
  addSubTotRow('صافي التدفقات النقدية من الأنشطة التشغيلية', c.operatingCF, cPrev?.operatingCF);

  addSpacer(3);
  addSecRow('ثانياً: التدفقات النقدية من أنشطة الاستثمار');
  addItemRow('(الزيادة)/النقص في الأصول الثابتة (صافي)',  c.δFixedAssets,   cPrev?.δFixedAssets);
  addItemRow('(الزيادة)/النقص في المشاريع قيد التنفيذ',    c.δProjects,      cPrev?.δProjects);
  addSubTotRow('صافي التدفقات النقدية من أنشطة الاستثمار', c.investingCF, cPrev?.investingCF);

  addSpacer(3);
  addSecRow('ثالثاً: التدفقات النقدية من أنشطة التمويل');
  addItemRow('زيادة/(نقص) في التسهيلات البنكية',          c.δBankFacilities,cPrev?.δBankFacilities);
  addItemRow('زيادة/(نقص) في القروض طويلة الأجل',         c.δLTLoans,       cPrev?.δLTLoans);
  addItemRow('زيادة/(نقص) في رأس المال المدفوع',          c.δCapital,       cPrev?.δCapital);
  addItemRow('زيادة/(نقص) في حساب الشركاء',               c.δPartners,      cPrev?.δPartners);
  addSubTotRow('صافي التدفقات النقدية من أنشطة التمويل', c.financingCF, cPrev?.financingCF);

  addSpacer(3);
  addTotalRow('صافي الزيادة (النقص) في النقدية وما يعادلها', c.netCashChange, cPrev?.netCashChange, 'FF1A5A9A');
  addItemRow('رصيد النقدية وما يعادلها في بداية الفترة', c.openingCash, cPrev?.openingCash, false);
  addTotalRow('رصيد النقدية وما يعادلها في نهاية الفترة', c.closingCash, cPrev?.closingCash, 'FF0A2040');
  addSpacer(3);
  {
    const balanced = Math.abs(c.openingCash + c.netCashChange - c.closingCash) < 1;
    const note = balanced
      ? `✓ الميزانية متوازنة: ${Math.round(c.openingCash).toLocaleString('ar-SA')} + ${Math.round(c.netCashChange).toLocaleString('ar-SA')} = ${Math.round(c.closingCash).toLocaleString('ar-SA')}`
      : `⚠ فرق في التسوية: ${(c.openingCash + c.netCashChange - c.closingCash).toFixed(2)}`;
    const row=ws.addRow([note]); row.height=17; spanRow(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:8.5,bold:balanced,color:{argb:balanced?CLR.greenText:'FFCC4444'}};
    cell.fill=solid(balanced?CLR.greenBg:'FFFFF4F4');
    cell.alignment={horizontal:'center',vertical:'middle'};
    cell.border={top:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),bottom:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),
                 left:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),right:bdr('thin',balanced?CLR.greenBdr:'FFCC8888')};
  }

  // ── Sheet 2: Monthly breakdown ────────────────────────────────────────────
  const ws2 = wb.addWorksheet('التطور الشهري', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='landscape';
  ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.columns=[{width:16},{width:17},{width:17},{width:17},{width:17},{width:17},{width:17}];
  {
    const hr=ws2.addRow(['الشهر','تشغيلية','استثمارية','تمويلية','صافي التغيير','رصيد الافتتاح','رصيد الاختتام']);
    hr.height=20;
    hr.eachCell((cell,ci)=>{
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
    const inRange = new Set(filtered.map(m => m.month));
    allCF.forEach(m => {
      const isActive = inRange.has(m.month) && period !== 'all';
      const row=ws2.addRow([m.label,m.operatingCF,m.investingCF,m.financingCF,m.netCashChange,m.openingCash,m.closingCash]);
      row.height=16;
      row.getCell(1).font={name:FONT,size:9,color:{argb:isActive?'FFC8E8FF':CLR.textGray}};
      row.getCell(1).alignment={horizontal:'right',vertical:'middle'};
      if(isActive) row.getCell(1).fill=solid('FF07182A');
      for(let ci=2;ci<=7;ci++){
        const cell=row.getCell(ci);
        const v=cell.value||0;
        cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
        cell.font={name:FONT,size:9,color:{argb:
          ci>=6 ? CLR.textNavy : v<0 ? 'FFDA4A4A' : ci===5 ? 'FF5BAEF0' : 'FF4ADA8E'}};
        if(isActive) cell.fill=solid('FF07182A');
        cell.border={bottom:bdr('hair','FF0E2540')};
      }
    });
    // Totals row for selected period
    const tr=ws2.addRow(['إجمالي الفترة المحددة',c.operatingCF,c.investingCF,c.financingCF,c.netCashChange,c.openingCash,c.closingCash]);
    tr.height=20;
    const totBrd={top:bdr('double',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)};
    tr.eachCell({includeEmpty:true},cell=>{cell.fill=solid(CLR.blueXPale);cell.border=totBrd;});
    tr.getCell(1).font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    tr.getCell(1).alignment={horizontal:'right',vertical:'middle'};
    for(let ci=2;ci<=7;ci++){
      const cell=tr.getCell(ci);
      cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `قائمة_التدفقات_النقدية_${period === 'all' ? 'كل_الفترة' : period}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
