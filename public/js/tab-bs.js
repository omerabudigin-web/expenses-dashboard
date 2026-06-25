// ── BALANCE SHEET tab ─────────────────────────────────────────────────────────

let _bsTimer     = null;
let _bsCountdown = 0;
const BS_REFRESH_SEC = 60;
function _bsIsActive() { return !!document.querySelector('.tab.active[data-tab="bs"]'); }
function _bsStopTimer() { if (_bsTimer) { clearInterval(_bsTimer); _bsTimer = null; } }
function _bsStartCountdown(months, totalAssets, asOf) {
  _bsStopTimer();
  _bsCountdown = BS_REFRESH_SEC;
  const el = document.getElementById('bs-status');
  const fmM = v => ((+v||0)/1e6).toFixed(2) + ' م';
  const tick = () => {
    if (!el) return;
    if (_bsCountdown > 0) {
      el.textContent = `✅ ${months} شهر | كما في ${asOf} | أصول: ${fmM(totalAssets)} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_bsCountdown}ث`;
      el.style.color = '#1a7a3c';
    }
  };
  tick();
  _bsTimer = setInterval(() => {
    if (!_bsIsActive()) { _bsStopTimer(); return; }
    _bsCountdown = Math.max(0, _bsCountdown - 1);
    tick();
  }, 1000);
}

// Build monthly totals for chart + table.
// retained = 30102 balance + cumulative net income (changes with P&L every month).
// monthlyNI = change in retained month-over-month = that month's P&L net income.
function bsMonthlyTotals(bsRows) {
  const monthSet = [...new Set(bsRows.map(r => r.month))].sort();
  const result = monthSet.map(mo => {
    const rows     = bsRows.filter(r => r.month === mo);
    const label    = (rows[0] && rows[0].label) || mo;
    const assets   = rows.filter(r => r.code3[0]==='1').reduce((s,r)=>s+r.balance,0);
    const fixedA   = rows.filter(r => r.code3[0]==='1' && r.code3!=='103').reduce((s,r)=>s+r.balance,0);
    const currA    = rows.filter(r => r.code3==='103').reduce((s,r)=>s+r.balance,0);
    const liabs    = rows.filter(r => r.code3[0]==='2').reduce((s,r)=>s-r.balance,0);
    const currL    = rows.filter(r => r.code3==='201').reduce((s,r)=>s-r.balance,0);
    const capRow   = rows.find(r => r.grpCode==='30101');
    const capital  = capRow ? -capRow.balance : 0;
    const ret3     = rows.filter(r => r.code3[0]==='3' && r.grpCode!=='30101').reduce((s,r)=>s-r.balance,0);
    const cumNI    = assets - liabs - capital - ret3;
    const retained = ret3 + cumNI;
    const totalEquity   = capital + retained;
    const workingCapital = currA - currL;
    const currentRatio   = currL > 0 ? currA / currL : null;
    const debtRatio      = assets > 0 ? liabs / assets * 100 : null;
    return { month: mo, label, assets, fixedAssets: fixedA, currentAssets: currA, liabs, currL, capital, retained, totalEquity, workingCapital, currentRatio, debtRatio };
  });
  result.forEach((m, i) => {
    m.monthlyNI = i === 0 ? m.retained : m.retained - result[i - 1].retained;
  });
  return result;
}

// Group an array of { grpCode, grpName, balance, code3 } by code3
function bsBySection(rows) {
  const map = {};
  rows.forEach(r => {
    if (!map[r.code3]) map[r.code3] = [];
    map[r.code3].push(r);
  });
  return map;
}

function buildBSPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('bs-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const yMs = months.filter(m => m.startsWith(y));
    const oy  = document.createElement('option'); oy.value = yMs[yMs.length - 1]; oy.textContent = `من بداية ${y} إلى الآن`; sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      const qMs = yMs.filter(m => qOf(m) === q);
      if (qMs.length) {
        const oq = document.createElement('option'); oq.value = qMs[qMs.length - 1]; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o   = document.createElement('option'); o.value = mo; o.textContent = row ? row.label : mo; sel.appendChild(o);
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || '';
}

let _bsfFormalMode = false;

function renderBS() {
  const bs = State.get('bs');
  const empty = id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات…</td></tr>';
  };

  if (!bs || !bs.length) {
    ['bs-assets-body','bs-le-body'].forEach(empty);
    ['bs-kpis','bs-monthly-tbody'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=''; });
    return;
  }

  initBSFormal();
  buildBSPeriodOptions();

  const selMo  = (document.getElementById('bs-period-sel') || {}).value || '';
  const months = [...new Set(bs.map(r => r.month))].sort();
  const asOf   = selMo || months[months.length - 1] || '';
  const rows   = bs.filter(r => r.month === asOf);
  const label  = (rows[0] && rows[0].label) || asOf;

  // ── Totals for selected month ──
  const assets     = rows.filter(r => r.code3[0]==='1');
  const liabs      = rows.filter(r => r.code3[0]==='2');
  const equity     = rows.filter(r => r.code3[0]==='3');
  const totalA      = assets.reduce((s,r)=>s+r.balance,0);
  const totalL      = liabs.reduce((s,r)=>s-r.balance,0);
  const equity3     = equity.reduce((s,r)=>s-r.balance,0);
  const netIncome   = totalA - totalL - equity3;
  const totalE      = equity3 + netIncome;   // always = totalA - totalL

  // ── Compute capital / retained / monthlyNI using same logic as bsMonthlyTotals ──
  const capRow2   = equity.find(r => r.grpCode === '30101');
  const capital   = capRow2 ? -capRow2.balance : 0;
  const ret3      = equity.filter(r => r.grpCode !== '30101').reduce((s,r) => s - r.balance, 0);
  const cumNI     = totalA - totalL - capital - ret3;
  const retained  = ret3 + cumNI;                    // أرباح مبقاة آخر الشهر

  // Previous month retained (for monthly P&L)
  const prevMo    = months[months.indexOf(asOf) - 1];
  const prevRows  = prevMo ? bs.filter(r => r.month === prevMo) : [];
  const prevCapR  = prevRows.find(r => r.grpCode === '30101');
  const prevCap   = prevCapR ? -prevCapR.balance : 0;
  const prevRet3  = prevRows.filter(r => r.code3[0]==='3' && r.grpCode!=='30101').reduce((s,r)=>s-r.balance,0);
  const prevA     = prevRows.filter(r=>r.code3[0]==='1').reduce((s,r)=>s+r.balance,0);
  const prevL     = prevRows.filter(r=>r.code3[0]==='2').reduce((s,r)=>s-r.balance,0);
  const prevCumNI = prevRows.length ? prevA - prevL - prevCap - prevRet3 : 0;
  const prevRetained = prevRet3 + prevCumNI;
  const monthlyNI = prevRows.length ? retained - prevRetained : retained;

  // ── Current ratio + equity ratio for KPIs ──
  const currA = rows.filter(r => r.code3 === '103').reduce((s,r) => s + r.balance, 0);
  const currL = rows.filter(r => r.code3 === '201').reduce((s,r) => s - r.balance, 0);
  const currentRatioBs = currL > 0 ? currA / currL : null;
  const equityRatioBs  = totalA > 0 ? totalE / totalA * 100 : null;

  // ── Delta helpers for comparison column ──
  const prevBalMap = {};
  prevRows.forEach(r => { prevBalMap[r.grpCode] = r.balance; });
  const fmtΔ = (displayCurr, displayPrev) => {
    if (!prevRows.length || displayPrev === undefined) return '';
    const d = displayCurr - displayPrev;
    if (Math.abs(d) < 1) return '';
    const col = d > 0 ? '#4ada8e' : '#da4a4a';
    const pct = displayPrev !== 0 ? ` (${d > 0 ? '+' : ''}${(d / Math.abs(displayPrev) * 100).toFixed(1)}%)` : '';
    return `<br><span style="font-size:.70rem;color:${col}">${d > 0 ? '+' : ''}${fmt(d)}${pct}</span>`;
  };

  // ── AsOf header ──
  const asOfEl = document.getElementById('bs-asof');
  if (asOfEl) asOfEl.textContent = 'كما في نهاية: ' + label;

  // ── Extra ratios for KPIs ──
  const workingCapital = currA - currL;
  const debtRatio      = totalA > 0 ? totalL / totalA * 100 : null;
  const prevCurrA      = prevRows.filter(r => r.code3 === '103').reduce((s,r) => s + r.balance, 0);
  const prevCurrL      = prevRows.filter(r => r.code3 === '201').reduce((s,r) => s - r.balance, 0);
  const prevWC         = prevRows.length ? prevCurrA - prevCurrL : null;
  const wcΔ = prevWC !== null ? (() => { const d = workingCapital - prevWC; const col = d >= 0 ? '#4ada8e' : '#da4a4a'; return `<br><span style="font-size:.70rem;color:${col}">${d >= 0 ? '+' : ''}${fmt(d)}</span>`; })() : '';

  // ── KPIs ──
  document.getElementById('bs-kpis').innerHTML = [
    { lbl:'إجمالي الأصول',         val:fmt(totalA)        +' ر.س', accent:'#5baef0' },
    { lbl:'إجمالي الخصوم',         val:fmt(totalL)        +' ر.س', accent:'#da4a4a' },
    { lbl:'حقوق الملكية',          val:fmtPlNum(totalE)   +' ر.س', accent:totalE>=0?'#4ada8e':'#da4a4a' },
    { lbl:'ربح / خسارة الشهر',     val:fmtPlNum(monthlyNI)+' ر.س', accent:monthlyNI>=0?'#4ada8e':'#da4a4a' },
    { lbl:'النسبة الجارية',        val:currentRatioBs !== null ? currentRatioBs.toFixed(2)+'×' : '—',
      accent:currentRatioBs===null?'#5a7a9a':currentRatioBs>=1.5?'#4ada8e':currentRatioBs>=1?'#da9a4a':'#da4a4a' },
    { lbl:'نسبة الملكية / الأصول', val:equityRatioBs  !== null ? equityRatioBs.toFixed(1)+'%'  : '—',
      accent:equityRatioBs===null ?'#5a7a9a':equityRatioBs>=50 ?'#4ada8e':equityRatioBs>=30 ?'#da9a4a':'#da4a4a' },
    { lbl:'رأس المال العامل',      val:fmtPlNum(workingCapital)+' ر.س'+wcΔ,
      accent:workingCapital>=0?'#4a9eda':'#da4a4a' },
    { lbl:'نسبة الاستدانة',        val:debtRatio !== null ? debtRatio.toFixed(1)+'%' : '—',
      accent:debtRatio===null?'#5a7a9a':debtRatio<=60?'#4ada8e':debtRatio<=80?'#da9a4a':'#da4a4a' },
  ].map(k=>`<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join('');

  // ── Balance always closes — no banner needed ──
  const bcEl = document.getElementById('bs-balance-check');
  if (bcEl) bcEl.innerHTML = '<div class="bs-balance-ok">الميزانية متوازنة — الأصول = الخصوم + حقوق الملكية</div>';

  // ── Structure analysis ──
  renderBSStructure(rows, totalA, totalL, currA, currL, asOf);

  // ── Assets table ──
  (function() {
    const trows = [];
    const secs  = bsBySection(assets);
    Object.keys(secs).sort().forEach(sec => {
      const lbl   = BS_SECTION[sec] || sec;
      const items = secs[sec];
      const tot   = items.reduce((s,r)=>s+r.balance,0);
      trows.push(`<tr class="bs-section-hdr"><td colspan="2">${lbl}</td></tr>`);
      items.forEach(r => {
        trows.push(`<tr><td class="bs-item-name">${esc(r.grpName)}</td><td class="bs-num">${fmt(r.balance)}${fmtΔ(r.balance, prevBalMap[r.grpCode])}</td></tr>`);
      });
      const prevTot = items.reduce((s, r) => s + (prevBalMap[r.grpCode] !== undefined ? prevBalMap[r.grpCode] : r.balance), 0);
      trows.push(`<tr class="bs-subtotal"><td>إجمالي ${lbl}</td><td class="bs-num">${fmt(tot)}${fmtΔ(tot, prevRows.length ? prevTot : undefined)}</td></tr>`);
    });
    trows.push(`<tr class="bs-total"><td><strong>إجمالي الأصول</strong></td><td class="bs-num"><strong>${fmt(totalA)}</strong>${fmtΔ(totalA, prevRows.length ? prevA : undefined)}</td></tr>`);
    document.getElementById('bs-assets-body').innerHTML = trows.join('');
  })();

  // ── Liabilities + Equity table ──
  (function() {
    const trows = [];
    trows.push(`<tr class="bs-section-hdr"><td colspan="2">الخصوم</td></tr>`);
    const liabSecs = bsBySection(liabs);
    Object.keys(liabSecs).sort().forEach(sec => {
      const lbl   = BS_SECTION[sec] || sec;
      const items = liabSecs[sec];
      const tot   = items.reduce((s,r)=>s-r.balance,0);
      trows.push(`<tr class="bs-subsection-hdr"><td colspan="2">${lbl}</td></tr>`);
      items.forEach(r => {
        const prevB = prevBalMap[r.grpCode];
        trows.push(`<tr><td class="bs-item-name">${esc(r.grpName)}</td><td class="bs-num">${fmt(-r.balance)}${fmtΔ(-r.balance, prevB !== undefined ? -prevB : undefined)}</td></tr>`);
      });
      const prevTot = items.reduce((s, r) => s + (prevBalMap[r.grpCode] !== undefined ? -prevBalMap[r.grpCode] : -r.balance), 0);
      trows.push(`<tr class="bs-subtotal"><td>إجمالي ${lbl}</td><td class="bs-num">${fmt(tot)}${fmtΔ(tot, prevRows.length ? prevTot : undefined)}</td></tr>`);
    });
    trows.push(`<tr class="bs-subtotal" style="font-size:.88rem"><td><strong>إجمالي الخصوم</strong></td><td class="bs-num"><strong>${fmt(totalL)}</strong>${fmtΔ(totalL, prevRows.length ? prevL : undefined)}</td></tr>`);

    trows.push(`<tr class="bs-section-hdr"><td colspan="2">حقوق الملكية</td></tr>`);
    const capitalRow = equity.find(r => r.grpCode === '30101');
    const capital    = capitalRow ? -capitalRow.balance : 0;
    const retained   = equity.filter(r => r.grpCode !== '30101').reduce((s,r) => s - r.balance, 0) + netIncome;
    const retStyle   = retained >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    trows.push(`<tr><td class="bs-item-name">رأس المال</td><td class="bs-num">${fmt(capital)}</td></tr>`);
    trows.push(`<tr><td class="bs-item-name" style="${retStyle}">الأرباح المبقاة</td><td class="bs-num" style="${retStyle}">${fmtPlNum(retained)}</td></tr>`);
    const prevTotE = prevRows.length ? (prevA - prevL) : undefined;
    trows.push(`<tr class="bs-subtotal" style="font-size:.88rem"><td><strong>إجمالي حقوق الملكية</strong></td><td class="bs-num"><strong>${fmtPlNum(totalE)}</strong>${fmtΔ(totalE, prevTotE)}</td></tr>`);
    trows.push(`<tr class="bs-total"><td><strong>إجمالي الخصوم وحقوق الملكية</strong></td><td class="bs-num"><strong>${fmt(totalA)}</strong>${fmtΔ(totalA, prevRows.length ? prevA : undefined)}</td></tr>`);
    document.getElementById('bs-le-body').innerHTML = trows.join('');
  })();

  // ── Monthly trend chart + table ──
  const mo = bsMonthlyTotals(bs);
  renderBSTrend(mo);
  document.getElementById('bs-monthly-tbody').innerHTML = mo.map(m => {
    const retCls = m.retained  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const niCls  = m.monthlyNI >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const wcCls  = m.workingCapital >= 0 ? 'color:#4a9eda' : 'color:#da4a4a';
    const crCol  = m.currentRatio === null ? '' : m.currentRatio >= 1.5 ? 'color:#4ada8e' : m.currentRatio >= 1 ? 'color:#da9a4a' : 'color:#da4a4a';
    const drCol  = m.debtRatio === null ? '' : m.debtRatio <= 60 ? 'color:#4ada8e' : m.debtRatio <= 80 ? 'color:#da9a4a' : 'color:#da4a4a';
    return `<tr class="${m.month===asOf?'bs-mo-active':''}">
      <td>${m.label}</td>
      <td class="num">${fmt(m.assets)}</td>
      <td class="num">${fmt(m.fixedAssets)}</td>
      <td class="num">${fmt(m.currentAssets)}</td>
      <td class="num">${fmt(m.liabs)}</td>
      <td class="num" style="${wcCls}">${fmtPlNum(m.workingCapital)}</td>
      <td class="num" style="${crCol}">${m.currentRatio !== null ? m.currentRatio.toFixed(2)+'×' : '—'}</td>
      <td class="num" style="${drCol}">${m.debtRatio !== null ? m.debtRatio.toFixed(1)+'%' : '—'}</td>
      <td class="num" style="${retCls}">${fmtPlNum(m.retained)}</td>
      <td class="num" style="${niCls}">${fmtPlNum(m.monthlyNI)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';

  // Re-render formal statement if it's currently visible
  if (_bsfFormalMode) renderBSFormal();

  _bsStartCountdown(months.length, totalA, label);
}

// ── BS Structure Analysis ─────────────────────────────────────────────────────
function renderBSStructure(rows, totalA, totalL, currA, currL, asOf) {
  const el = document.getElementById('bs-structure');
  if (!el) return;

  const nca  = totalA - currA;
  const ncl  = totalL - currL;
  const equity = totalA - totalL;

  const ncaPct = totalA > 0 ? (nca  / totalA * 100) : 0;
  const caPct  = totalA > 0 ? (currA / totalA * 100) : 0;
  const clPct  = totalA > 0 ? (currL / totalA * 100) : 0;
  const nclPct = totalA > 0 ? (ncl   / totalA * 100) : 0;
  const eqPct  = totalA > 0 ? (equity / totalA * 100) : 0;

  const wc        = currA - currL;
  const debtRatio = totalA > 0 ? (totalL / totalA * 100) : 0;
  const eqRatio   = totalA > 0 ? (equity / totalA * 100) : 0;
  const crRatio   = currL > 0 ? currA / currL : null;

  const bar = (segs) => {
    const total = segs.reduce((s, x) => s + Math.max(0, x.pct), 0);
    if (total <= 0) return '';
    return `<div style="display:flex;height:20px;border-radius:5px;overflow:hidden;margin:10px 0">
      ${segs.filter(x => x.pct > 0).map(s => `<div style="width:${(s.pct/total*100).toFixed(1)}%;background:${s.col};transition:width .3s" title="${s.lbl}: ${s.pct.toFixed(1)}%"></div>`).join('')}
    </div>`;
  };

  const legend = (col, lbl, val, pct) => `<span style="display:flex;align-items:center;gap:5px;font-size:.78rem">
    <span style="width:10px;height:10px;background:${col};border-radius:2px;flex-shrink:0"></span>
    <span style="color:#8aa0b8">${lbl}:</span>
    <strong style="color:#c8d8e8">${fmt(val)} ر.س</strong>
    <span style="color:#506070">(${pct.toFixed(1)}%)</span>
  </span>`;

  const metricRow = (lbl, val, col, target) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #0e2540">
      <span style="color:#8aa0b8;font-size:.79rem">${lbl}</span>
      <div style="text-align:left">
        <span style="color:${col};font-weight:700;font-size:.85rem">${val}</span>
        ${target ? `<span style="color:#506070;font-size:.69rem;margin-right:6px">${target}</span>` : ''}
      </div>
    </div>`;

  el.innerHTML = `<div class="grid2" style="margin-bottom:18px">
    <div class="card">
      <div class="card-title">🏗️ هيكل الأصول</div>
      ${bar([
        { pct: ncaPct, col: '#3a7abf', lbl: 'أصول ثابتة' },
        { pct: caPct,  col: '#4ada8e', lbl: 'أصول متداولة' },
      ])}
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        ${legend('#3a7abf','أصول ثابتة', nca, ncaPct)}
        ${legend('#4ada8e','أصول متداولة', currA, caPct)}
      </div>
      ${metricRow('رأس المال العامل الصافي (CA − CL)', fmtPlNum(wc)+' ر.س', wc>=0?'#4ada8e':'#da4a4a', '')}
      ${metricRow('النسبة الجارية', crRatio!==null?crRatio.toFixed(2)+'×':'—', crRatio===null?'#5a7a9a':crRatio>=1.5?'#4ada8e':crRatio>=1?'#da9a4a':'#da4a4a', 'الهدف ≥ 1.5×')}
      ${metricRow('نسبة الأصول الثابتة / الإجمالية', ncaPct.toFixed(1)+'%', '#5baef0', '')}
    </div>
    <div class="card">
      <div class="card-title">⚖️ هيكل التمويل</div>
      ${bar([
        { pct: clPct,              col: '#da4a4a', lbl: 'خصوم متداولة' },
        { pct: nclPct,             col: '#da9a4a', lbl: 'خصوم طويلة' },
        { pct: Math.max(0,eqPct),  col: equity>=0?'#4a9eda':'#888', lbl: 'حقوق الملكية' },
      ])}
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        ${legend('#da4a4a','خصوم متداولة', currL, clPct)}
        ${ncl > 0 ? legend('#da9a4a','خصوم طويلة', ncl, nclPct) : ''}
        ${legend(equity>=0?'#4a9eda':'#888', 'حقوق الملكية', equity, Math.max(0,eqPct))}
      </div>
      ${metricRow('نسبة الاستدانة (الخصوم / الأصول)', debtRatio.toFixed(1)+'%', debtRatio<=60?'#4ada8e':debtRatio<=80?'#da9a4a':'#da4a4a', 'الهدف ≤ 60%')}
      ${metricRow('نسبة الملكية / الأصول', eqRatio.toFixed(1)+'%', eqRatio>=30?'#4ada8e':eqRatio>=15?'#da9a4a':'#da4a4a', 'الهدف ≥ 30%')}
      ${metricRow('نسبة الخصوم المتداولة / الإجمالية', totalL>0?(currL/totalL*100).toFixed(1)+'%':'—', '#da9a4a', '')}
    </div>
  </div>`;
}

function printBSPDF() {
  const bs = State.get('bs');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  window.print();
}

// ── FORMAL BALANCE SHEET (قائمة المركز المالي - SOCPA SME) ──────────────────

/* Account-code → proper Saudi SME display label */
const BSF_LABELS = {
  '10101': 'سيارات ومركبات',
  '10102': 'أثاث وتجهيزات ومفروشات',
  '10103': 'أجهزة حاسب آلي وبرامج',
  '10104': 'أجهزة كهربائية وإلكترونية',
  '10105': 'مرافق وبنية تحتية',
  '10106': 'معدات ومكائن صناعية',
  '10107': 'تحسينات على أصول مستأجرة',
  '10108': 'أصول غير ملموسة',
  '10201': 'مشاريع تحت التنفيذ',
  '10301': 'النقدية وما يعادلها',
  '10302': 'المخزون (بضاعة)',
  '10303': 'العملاء والذمم المدينة التجارية',
  '10304': 'ذمم موظفين وسلف وعهد',
  '10305': 'أصول متداولة أخرى',
  '20101': 'الموردون والدائنون التجاريون',
  '20102': 'أرصدة دائنة أخرى',
  '20103': 'مصروفات مستحقة وما في حكمها',
  '20201': 'قروض وتسهيلات بنكية طويلة الأجل',
  '30101': 'رأس المال المدفوع',
  '30102': 'جاري الشركاء والاحتياطيات',
};

/* Order within current assets: cash last */
const BSF_CA_ORDER = ['10302','10303','10304','10305','10301'];

function initBSFormal() {
  const toggleBtn = document.getElementById('bsf-toggle-btn');
  const printBtn  = document.getElementById('bsf-print-btn');
  const cmpSel    = document.getElementById('bsf-cmp-sel');
  if (toggleBtn && !toggleBtn._bsfInit) {
    toggleBtn._bsfInit = true;
    toggleBtn.addEventListener('click', () => {
      _bsfFormalMode = !_bsfFormalMode;
      const stmtWrap   = document.getElementById('bsf-stmt-wrap');
      const twoCol     = document.getElementById('bs-twocol');
      const trendCard  = document.getElementById('bs-trend-card');
      const moCard     = document.getElementById('bs-monthly-card');
      if (stmtWrap)  stmtWrap.style.display  = _bsfFormalMode ? '' : 'none';
      if (twoCol)    twoCol.style.display     = _bsfFormalMode ? 'none' : '';
      if (trendCard) trendCard.style.display  = _bsfFormalMode ? 'none' : '';
      if (moCard)    moCard.style.display     = _bsfFormalMode ? 'none' : '';
      toggleBtn.style.background = _bsfFormalMode ? '#0d3a2a' : '#0d2a1a';
      toggleBtn.style.color      = _bsfFormalMode ? '#a0f0c0' : '#70e8a8';
      toggleBtn.style.border     = _bsfFormalMode ? '1px solid #3a9a6a' : '1px solid #2a7a5a';
      if (_bsfFormalMode) renderBSFormal();
    });
  }
  if (printBtn && !printBtn._bsfInit) {
    printBtn._bsfInit = true;
    printBtn.addEventListener('click', printBSPDF);
  }
  if (cmpSel && !cmpSel._bsfInit) {
    cmpSel._bsfInit = true;
    cmpSel.addEventListener('change', () => { if (_bsfFormalMode) renderBSFormal(); });
  }
  const excelBtn = document.getElementById('bsf-excel-btn');
  if (excelBtn && !excelBtn._bsfInit) {
    excelBtn._bsfInit = true;
    excelBtn.addEventListener('click', () => {
      excelBtn.disabled = true;
      excelBtn.textContent = '⏳ جاري التصدير…';
      exportBSFExcel()
        .catch(e => { console.error(e); alert('خطأ في التصدير'); })
        .finally(() => { excelBtn.disabled = false; excelBtn.textContent = '📊 Excel'; });
    });
  }
  const htmlBtn = document.getElementById('bsf-html-btn');
  if (htmlBtn && !htmlBtn._bsfInit) { htmlBtn._bsfInit = true; htmlBtn.addEventListener('click', exportBSFHTML); }
}

function renderBSFormal() {
  const bs = State.get('bs');
  if (!bs || !bs.length) return;

  const selMo  = (document.getElementById('bs-period-sel') || {}).value || '';
  const months = [...new Set(bs.map(r => r.month))].sort();
  const asOf   = selMo || months[months.length - 1] || '';
  const rows   = bs.filter(r => r.month === asOf);
  if (!rows.length) return;

  const cmpMode = (document.getElementById('bsf-cmp-sel') || {}).value || 'prev-month';
  let cmpMo = '';
  if (cmpMode === 'prev-month') {
    const idx = months.indexOf(asOf);
    cmpMo = idx > 0 ? months[idx - 1] : '';
  } else if (cmpMode === 'prev-year') {
    const [y, m] = asOf.split('-');
    const prevYM = `${+y - 1}-${m}`;
    cmpMo = months.includes(prevYM) ? prevYM : '';
  } else if (cmpMode === 'prev-quarter') {
    const [y, m] = asOf.split('-').map(Number);
    const curQ   = Math.ceil(m / 3);
    const prevQY = curQ === 1 ? y - 1 : y;
    const prevQEndM = (curQ === 1 ? 4 : curQ - 1) * 3;
    const prevQEnd  = `${prevQY}-${String(prevQEndM).padStart(2, '0')}`;
    const avail  = months.filter(mo => mo <= prevQEnd);
    cmpMo = avail.length ? avail[avail.length - 1] : '';
  } else if (cmpMode === 'fy-start') {
    const fyY    = asOf.slice(0, 4);
    const fyMos  = months.filter(mo => mo.startsWith(fyY));
    cmpMo = (fyMos.length ? fyMos[0] : months[0]) || '';
  } else if (cmpMode === 'opening') {
    cmpMo = months[0] || '';
  }
  const cmpRows = cmpMo ? bs.filter(r => r.month === cmpMo) : [];
  const hasCmp  = cmpMode !== 'none' && cmpRows.length > 0;
  const cols    = hasCmp ? 3 : 2;

  const byCode = r => r.grpCode;
  const bal  = (arr, code) => { const f = arr.find(r => byCode(r) === code); return f ? f.balance : 0; };
  const abal = (arr, code) => Math.abs(bal(arr, code));
  const lbal = (arr, code) => -bal(arr, code);

  // ── helpers ────────────────────────────────────────────────────────────────
  const fmtN = (n) => {
    if (n === null || n === undefined) return `<td class="bsf-num bsf-zero">—</td>`;
    const abs = Math.abs(n);
    const str = fmt(abs, 0);
    const col = n > 0 ? 'bsf-pos' : n < 0 ? 'bsf-neg' : 'bsf-zero';
    const prefix = n < 0 ? '(' : '';
    const suffix = n < 0 ? ')' : '';
    return `<td class="bsf-num ${col}">${prefix}${str}${suffix}</td>`;
  };
  const fmtNC = (cur, cmpVal) => fmtN(cur) + (hasCmp ? fmtN(cmpVal) : '');

  const secHdr = (label) => `<tr class="bsf-section-hdr"><td colspan="${cols}">${label}</td></tr>`;
  const subHdr = (label) => `<tr class="bsf-sub-hdr"><td colspan="${cols}">${label}</td></tr>`;
  const spacer = () => `<tr class="bsf-spacer"><td colspan="${cols}"></td></tr>`;

  const itemRow = (code, overrideLabel) => {
    const label = overrideLabel || BSF_LABELS[code] || code;
    const cur   = abal(rows, code);
    const cmp   = hasCmp ? abal(cmpRows, code) : null;
    if (cur === 0 && (cmp === null || cmp === 0)) return '';
    return `<tr class="bsf-item">
      <td class="bsf-label">${label}</td>
      ${fmtNC(cur || null, cmp || null)}
    </tr>`;
  };
  const liabRow = (code, overrideLabel) => {
    const label = overrideLabel || BSF_LABELS[code] || code;
    const cur   = lbal(rows, code);
    const cmp   = hasCmp ? lbal(cmpRows, code) : null;
    if (cur === 0 && (cmp === null || cmp === 0)) return '';
    return `<tr class="bsf-item">
      <td class="bsf-label">${label}</td>
      ${fmtNC(cur || null, cmp || null)}
    </tr>`;
  };
  const subtotalRow = (label, cur, cmp) => `<tr class="bsf-subtotal">
    <td>${label}</td>
    ${fmtNC(cur, hasCmp ? cmp : null)}
  </tr>`;
  const totalRow = (label, cur, cmp) => `<tr class="bsf-total">
    <td>${label}</td>
    ${fmtNC(cur, hasCmp ? cmp : null)}
  </tr>`;
  const grandRow = (label, cur, cmp) => `<tr class="bsf-grand">
    <td>${label}</td>
    ${fmtNC(cur, hasCmp ? cmp : null)}
  </tr>`;

  // ── Fixed assets (101xx) ───────────────────────────────────────────────────
  const FA_CODES = ['10101','10102','10103','10104','10105','10106','10107','10108'];
  const faSum  = (arr) => FA_CODES.reduce((s,c) => s + abal(arr, c), 0);
  const faRows = FA_CODES.map(c => itemRow(c)).join('');
  const wip    = itemRow('10201');
  const ncaSum  = faSum(rows) + abal(rows, '10201');
  const ncaSumC = hasCmp ? (faSum(cmpRows) + abal(cmpRows, '10201')) : null;

  // ── Current assets (103xx) — prescribed order ──────────────────────────────
  const caSum  = BSF_CA_ORDER.reduce((s,c) => s + abal(rows, c), 0);
  const caSumC = hasCmp ? BSF_CA_ORDER.reduce((s,c) => s + abal(cmpRows, c), 0) : null;
  const caRows = BSF_CA_ORDER.map(c => itemRow(c)).join('');

  // ── Totals — assets ────────────────────────────────────────────────────────
  const totalA  = rows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0);
  const totalAC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0) : null;

  // ── Current liabilities (201xx) ────────────────────────────────────────────
  const CL_CODES = ['20101','20102','20103'];
  const clSum  = CL_CODES.reduce((s,c) => s + lbal(rows, c), 0);
  const clSumC = hasCmp ? CL_CODES.reduce((s,c) => s + lbal(cmpRows, c), 0) : null;
  const clRows = CL_CODES.map(c => liabRow(c)).join('');

  // ── Non-current liabilities (202xx) ───────────────────────────────────────
  const NCL_CODES = ['20201'];
  const nclSum  = NCL_CODES.reduce((s,c) => s + lbal(rows, c), 0);
  const nclSumC = hasCmp ? NCL_CODES.reduce((s,c) => s + lbal(cmpRows, c), 0) : null;
  const nclRows = NCL_CODES.map(c => liabRow(c)).join('');

  const totalL  = rows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0);
  const totalLC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0) : null;

  // ── Equity ────────────────────────────────────────────────────────────────
  const cap   = lbal(rows, '30101');
  const capC  = hasCmp ? lbal(cmpRows, '30101') : null;
  const ret3  = lbal(rows, '30102');
  const ret3C = hasCmp ? lbal(cmpRows, '30102') : null;
  const eq3all   = rows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0);
  const eq3allC  = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0) : null;
  const netP     = totalA - totalL - eq3all;
  const netPC    = hasCmp ? (totalAC - totalLC - eq3allC) : null;
  const totalE   = eq3all + netP;
  const totalEC  = hasCmp ? (eq3allC + netPC) : null;
  const netPCol  = netP >= 0 ? 'bsf-pos' : 'bsf-neg';

  // ── Date/header labels ─────────────────────────────────────────────────────
  const asOfRow  = rows[0];
  const cmpLblEl = document.getElementById('bsf-prv-hdr');
  const curLblEl = document.getElementById('bsf-cur-hdr');
  const cmpLbl   = cmpMo ? (bs.find(r=>r.month===cmpMo)||{}).label || cmpMo : '';
  if (curLblEl) {
    curLblEl.textContent = (asOfRow && asOfRow.label) || asOf;
    curLblEl.colSpan = hasCmp ? 1 : 2;
  }
  if (cmpLblEl) {
    cmpLblEl.textContent = hasCmp ? cmpLbl : '';
    cmpLblEl.style.display = hasCmp ? '' : 'none';
  }

  const dateEl = document.getElementById('bsf-date');
  if (dateEl) dateEl.textContent = `كما في نهاية: ${(asOfRow && asOfRow.label) || asOf}`;

  const companyEl = document.getElementById('bsf-company');
  if (companyEl && companyEl.textContent === '—') {
    const dbName = State.get('activeDb') || '';
    companyEl.textContent = dbName === 'MekSoftDb1' ? 'أبعاد للحديد والصلب'
                          : dbName === 'MekSoftDb2' ? 'وسام للحديد والصلب'
                          : dbName;
  }

  const noDataNote = (cmpMode !== 'none' && !hasCmp)
    ? `<tr><td colspan="${cols}" style="text-align:center;padding:10px;color:#5a7090;font-size:.8rem">بيانات الفترة المقارنة غير متاحة</td></tr>`
    : '';

  // ── Build HTML ─────────────────────────────────────────────────────────────
  const html = [
    // ═══════ ASSETS ═══════
    secHdr('الأصول'),
    subHdr('أولاً: الأصول غير المتداولة'),
    faRows,
    wip,
    subtotalRow('إجمالي الأصول غير المتداولة', ncaSum || null, ncaSumC),
    spacer(),

    subHdr('ثانياً: الأصول المتداولة'),
    caRows,
    subtotalRow('إجمالي الأصول المتداولة', caSum || null, caSumC),
    spacer(),

    totalRow('إجمالي الأصول', totalA || null, totalAC),
    spacer(),

    // ═══════ LIABILITIES ═══════
    secHdr('الالتزامات وحقوق الملكية'),
    subHdr('أولاً: الالتزامات المتداولة'),
    clRows,
    subtotalRow('إجمالي الالتزامات المتداولة', clSum || null, clSumC),
    spacer(),

    nclSum > 0 || (nclSumC !== null && nclSumC > 0) ? [
      subHdr('ثانياً: الالتزامات غير المتداولة'),
      nclRows,
      subtotalRow('إجمالي الالتزامات غير المتداولة', nclSum || null, nclSumC),
      spacer(),
    ].join('') : '',

    totalRow('إجمالي الالتزامات', totalL || null, totalLC),
    spacer(),

    // ═══════ EQUITY ═══════
    subHdr('ثالثاً: حقوق الملكية'),
    `<tr class="bsf-item"><td class="bsf-label">${BSF_LABELS['30101']}</td>${fmtNC(cap||null, capC||null)}</tr>`,
    ret3 !== 0 || (ret3C !== null && ret3C !== 0) ?
      `<tr class="bsf-item"><td class="bsf-label">${BSF_LABELS['30102']}</td>${fmtNC(ret3||null, ret3C||null)}</tr>` : '',
    `<tr class="bsf-item">
      <td class="bsf-label" style="color:${netP>=0?'#4ada8e':'#da4a4a'}">${netP>=0?'صافي ربح الفترة الجارية':'صافي خسارة الفترة الجارية'}</td>
      <td class="bsf-num ${netPCol}">${netP>=0?fmt(netP,0):'('+fmt(-netP,0)+')'}</td>
      ${hasCmp ? `<td class="bsf-num ${netPC>=0?'bsf-pos':'bsf-neg'}">${netPC>=0?fmt(netPC,0):'('+fmt(-netPC,0)+')'}</td>` : ''}
    </tr>`,
    subtotalRow('إجمالي حقوق الملكية', totalE || null, totalEC),
    spacer(),

    grandRow('إجمالي الالتزامات وحقوق الملكية', totalA || null, totalAC),
    noDataNote,
  ].flat().join('');

  document.getElementById('bsf-body').innerHTML = html;

  // Balance check note
  const diff = Math.abs(totalA - totalL - totalE);
  const noteEl = document.getElementById('bsf-balance-note');
  if (noteEl) {
    noteEl.textContent = diff < 1
      ? `✓ الميزانية متوازنة — الأصول (${fmt(totalA,0)}) = الالتزامات (${fmt(totalL,0)}) + حقوق الملكية (${fmt(totalE,0)})`
      : `⚠ فرق ${fmt(diff,0)} ر.س — قد تحتاج إلى مراجعة قيود الافتتاح`;
    noteEl.style.color = diff < 1 ? '#3a9a6a' : '#da9a4a';
  }
}

// ── BSF export helpers ────────────────────────────────────────────────────────

function _bsfDerive() {
  const bs = State.get('bs');
  if (!bs || !bs.length) return null;

  const selMo  = (document.getElementById('bs-period-sel') || {}).value || '';
  const months = [...new Set(bs.map(r => r.month))].sort();
  const asOf   = selMo || months[months.length - 1] || '';
  const rows   = bs.filter(r => r.month === asOf);
  if (!rows.length) return null;

  const cmpMode = (document.getElementById('bsf-cmp-sel') || {}).value || 'prev-month';
  let cmpMo = '';
  if (cmpMode === 'prev-month') {
    const idx = months.indexOf(asOf); cmpMo = idx > 0 ? months[idx - 1] : '';
  } else if (cmpMode === 'prev-quarter') {
    const [y, m] = asOf.split('-').map(Number);
    const curQ = Math.ceil(m / 3);
    const prevQY = curQ === 1 ? y - 1 : y;
    const prevQEndM = (curQ === 1 ? 4 : curQ - 1) * 3;
    const prevQEnd = `${prevQY}-${String(prevQEndM).padStart(2, '0')}`;
    const avail = months.filter(mo => mo <= prevQEnd);
    cmpMo = avail.length ? avail[avail.length - 1] : '';
  } else if (cmpMode === 'prev-year') {
    const [y, m] = asOf.split('-');
    cmpMo = months.includes(`${+y-1}-${m}`) ? `${+y-1}-${m}` : '';
  } else if (cmpMode === 'fy-start') {
    const fyMos = months.filter(mo => mo.startsWith(asOf.slice(0,4)));
    cmpMo = (fyMos.length ? fyMos[0] : months[0]) || '';
  } else if (cmpMode === 'opening') {
    cmpMo = months[0] || '';
  }
  const cmpRows = cmpMo ? bs.filter(r => r.month === cmpMo) : [];
  const hasCmp  = cmpMode !== 'none' && cmpRows.length > 0;

  const bal  = (arr, code) => { const f = arr.find(r => r.grpCode === code); return f ? f.balance : 0; };
  const abal = (arr, code) => Math.abs(bal(arr, code));
  const lbal = (arr, code) => -bal(arr, code);

  const FA_CODES  = ['10101','10102','10103','10104','10105','10106','10107','10108'];
  const CL_CODES  = ['20101','20102','20103'];
  const NCL_CODES = ['20201'];

  const ncaSum  = FA_CODES.reduce((s,c)=>s+abal(rows,c),0) + abal(rows,'10201');
  const ncaSumC = hasCmp ? FA_CODES.reduce((s,c)=>s+abal(cmpRows,c),0) + abal(cmpRows,'10201') : null;
  const caSum   = BSF_CA_ORDER.reduce((s,c)=>s+abal(rows,c),0);
  const caSumC  = hasCmp ? BSF_CA_ORDER.reduce((s,c)=>s+abal(cmpRows,c),0) : null;
  const totalA  = rows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0);
  const totalAC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='1').reduce((s,r)=>s+r.balance,0) : null;
  const clSum   = CL_CODES.reduce((s,c)=>s+lbal(rows,c),0);
  const clSumC  = hasCmp ? CL_CODES.reduce((s,c)=>s+lbal(cmpRows,c),0) : null;
  const nclSum  = NCL_CODES.reduce((s,c)=>s+lbal(rows,c),0);
  const nclSumC = hasCmp ? NCL_CODES.reduce((s,c)=>s+lbal(cmpRows,c),0) : null;
  const totalL  = rows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0);
  const totalLC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='2').reduce((s,r)=>s-r.balance,0) : null;
  const eq3all  = rows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0);
  const eq3allC = hasCmp ? cmpRows.filter(r=>r.grpCode[0]==='3').reduce((s,r)=>s-r.balance,0) : null;
  const netP    = totalA - totalL - eq3all;
  const netPC   = hasCmp ? totalAC - totalLC - eq3allC : null;
  const totalE  = eq3all + netP;
  const totalEC = hasCmp ? eq3allC + netPC : null;

  const dbName  = State.get('activeDb') || '';
  const company = (() => {
    const el = document.getElementById('bsf-company');
    const t  = el ? el.textContent.trim() : '';
    return (t && t !== '—') ? t
      : dbName === 'MekSoftDb1' ? 'أبعاد للحديد والصلب'
      : dbName === 'MekSoftDb2' ? 'وسام للحديد والصلب' : dbName;
  })();
  const curLbl = (rows[0] && rows[0].label) || asOf;
  const cmpLbl = cmpMo ? (bs.find(r=>r.month===cmpMo)||{}).label || cmpMo : '';

  return { rows, cmpRows, hasCmp, asOf, curLbl, cmpLbl, company,
    FA_CODES, CL_CODES, NCL_CODES,
    ncaSum, ncaSumC, caSum, caSumC, totalA, totalAC,
    clSum, clSumC, nclSum, nclSumC, totalL, totalLC,
    netP, netPC, totalE, totalEC, abal, lbal };
}

async function exportBSFExcel() {
  const d = _bsfDerive();
  if (!d) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرب تحديث الصفحة'); return; }

  const { rows, cmpRows, hasCmp, asOf, curLbl, cmpLbl, company,
    FA_CODES, CL_CODES, NCL_CODES,
    ncaSum, ncaSumC, caSum, caSumC, totalA, totalAC,
    clSum, clSumC, nclSum, nclSumC, totalL, totalLC,
    netP, netPC, totalE, totalEC, abal, lbal } = d;

  const genDate = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  const NC = hasCmp ? 3 : 2;  // total columns (1-based for ExcelJS)

  try {
    // ── Workbook ──────────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'MekSoft ERP Dashboard';
    wb.created  = new Date();

    const ws = wb.addWorksheet('المركز المالي', {
      views: [{ rightToLeft: true }],
    });
    ws.pageSetup.paperSize    = 9;   // A4
    ws.pageSetup.orientation  = 'portrait';
    ws.pageSetup.fitToPage    = true;
    ws.pageSetup.fitToWidth   = 1;
    ws.pageSetup.margins = { left:0.6, right:0.5, top:0.75, bottom:0.75, header:0.3, footer:0.3 };

    ws.columns = [
      { width: 52 },
      { width: 20 },
      ...(hasCmp ? [{ width: 20 }] : []),
    ];

    // ── Color & font constants ─────────────────────────────────────────────────
    const FONT   = 'Calibri';
    const numFmt = '#,##0;[Red](#,##0);"-"';

    const CLR = {
      navyDark : 'FF0A2040',
      navy     : 'FF1A3A6A',
      blueLight: 'FFE8EEF8',
      bluePale : 'FFF4F7FB',
      blueXPale: 'FFDDE6F4',
      white    : 'FFFFFFFF',
      textDark : 'FF111111',
      textNavy : 'FF0A2040',
      textBlue : 'FF1A3A6A',
      textLight: 'FF6A8AAA',
      textGray : 'FF888888',
      greenBg  : 'FFF4FFF8',
      greenBdr : 'FF90C890',
      greenText: 'FF1A6A2A',
    };

    const solid = (argb) => ({ type:'pattern', pattern:'solid', fgColor:{ argb } });
    const border = (style, argb) => ({ style, color:{ argb } });

    // ── Row helpers ───────────────────────────────────────────────────────────
    function spanRow(row) {
      ws.mergeCells(row.number, 1, row.number, NC);
    }

    function styledRow(values, height, styleFn) {
      const row = ws.addRow(values);
      row.height = height;
      styleFn(row);
      return row;
    }

    function addTitleRow(text, sz, fc, bg) {
      return styledRow([text], sz > 12 ? 32 : 22, row => {
        spanRow(row);
        const c = row.getCell(1);
        c.font      = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
        c.fill      = solid(bg);
        c.alignment = { horizontal:'center', vertical:'middle' };
      });
    }

    function addSpacer(h = 6) {
      const row = ws.addRow(['']);
      row.height = h;
      spanRow(row);
      row.getCell(1).fill = solid(CLR.white);
    }

    function addColHdr() {
      const vals = ['البيان', curLbl, ...(hasCmp ? [cmpLbl] : [])];
      return styledRow(vals, 22, row => {
        row.eachCell({ includeEmpty:true }, (c, ci) => {
          c.font      = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
          c.fill      = solid(CLR.navy);
          c.alignment = { horizontal: ci === 1 ? 'right' : 'center', vertical:'middle' };
          c.border    = { bottom: border('medium', CLR.navyDark) };
        });
      });
    }

    function addSecHdr(text) {
      return styledRow([text], 20, row => {
        spanRow(row);
        const c = row.getCell(1);
        c.font      = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
        c.fill      = solid(CLR.navy);
        c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
      });
    }

    function addSubHdr(text) {
      return styledRow([text], 18, row => {
        spanRow(row);
        const c = row.getCell(1);
        c.font      = { name:FONT, size:9.5, bold:true, italic:true, color:{ argb:CLR.textBlue } };
        c.fill      = solid(CLR.blueLight);
        c.alignment = { horizontal:'right', vertical:'middle', indent:1 };
        c.border    = { top: border('thin','FFC0CFE8'), bottom: border('hair','FFD0D8E8') };
      });
    }

    function setNumCell(cell, v, fc, bold) {
      cell.value     = (v !== null && v !== undefined) ? +v.toFixed(0) : null;
      cell.numFmt    = numFmt;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      cell.font      = { name:FONT, size:9.5, color:{ argb: fc || CLR.textNavy }, bold: bold || false };
    }

    function addItem(label, cur, cmp, indent=1) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 17, row => {
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:9.5, color:{ argb:CLR.textDark } };
        c1.alignment = { horizontal:'right', vertical:'middle', indent };
        c1.border    = { bottom: border('hair','FFE8ECF0') };
        setNumCell(row.getCell(2), cur, CLR.textNavy, false);
        row.getCell(2).border = { bottom: border('hair','FFE8ECF0') };
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textGray, false);
          row.getCell(3).border = { bottom: border('hair','FFE8ECF0') };
          row.getCell(3).fill  = solid('FFF8FAFE');
        }
      });
    }

    function addSubTot(label, cur, cmp) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 18, row => {
        const topBot = { top: border('thin','FFC0CFE8'), bottom: border('thin','FFB0C4DC') };
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.textNavy } };
        c1.fill      = solid(CLR.bluePale);
        c1.alignment = { horizontal:'right', vertical:'middle' };
        c1.border    = topBot;
        setNumCell(row.getCell(2), cur, CLR.textNavy, true);
        Object.assign(row.getCell(2), { fill: solid(CLR.bluePale), border: topBot });
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textGray, false);
          Object.assign(row.getCell(3), { fill: solid('FFF0F4FA'), border: topBot });
        }
      });
    }

    function addTotal(label, cur, cmp) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 20, row => {
        const bord = { top: border('medium', CLR.navy), bottom: border('thin', CLR.navy) };
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:10, bold:true, color:{ argb:CLR.navyDark } };
        c1.fill      = solid(CLR.blueLight);
        c1.alignment = { horizontal:'right', vertical:'middle' };
        c1.border    = bord;
        setNumCell(row.getCell(2), cur, CLR.navyDark, true);
        Object.assign(row.getCell(2), { fill: solid(CLR.blueLight), border: bord });
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textBlue, true);
          Object.assign(row.getCell(3), { fill: solid('FFE0E8F4'), border: bord });
        }
      });
    }

    function addGrand(label, cur, cmp) {
      const vals = [label, null, ...(hasCmp?[null]:[])];
      return styledRow(vals, 22, row => {
        const bord = { top: border('double', CLR.navyDark), bottom: border('medium', CLR.navyDark) };
        const c1 = row.getCell(1);
        c1.font      = { name:FONT, size:10.5, bold:true, color:{ argb:CLR.navyDark } };
        c1.fill      = solid(CLR.blueXPale);
        c1.alignment = { horizontal:'right', vertical:'middle' };
        c1.border    = bord;
        setNumCell(row.getCell(2), cur, CLR.navyDark, true);
        Object.assign(row.getCell(2), { fill: solid(CLR.blueXPale), border: bord });
        if (hasCmp) {
          setNumCell(row.getCell(3), cmp, CLR.textBlue, true);
          Object.assign(row.getCell(3), { fill: solid('FFD5E0F0'), border: bord });
        }
        row.getCell(2).font = { name:FONT, size:10.5, bold:true, color:{ argb:CLR.navyDark } };
      });
    }

    function addBalanceNote(text) {
      const row = ws.addRow([text]);
      row.height = 20;
      spanRow(row);
      const c = row.getCell(1);
      c.font      = { name:FONT, size:9, bold:true, color:{ argb:CLR.greenText } };
      c.fill      = solid(CLR.greenBg);
      c.alignment = { horizontal:'center', vertical:'middle' };
      c.border    = {
        top:    border('thin', CLR.greenBdr),
        bottom: border('thin', CLR.greenBdr),
        left:   border('thin', CLR.greenBdr),
        right:  border('thin', CLR.greenBdr),
      };
    }

    // ── Title block ───────────────────────────────────────────────────────────
    addTitleRow(company, 14, CLR.white, CLR.navyDark);
    addTitleRow('قائمة المركز المالي', 12, CLR.white, CLR.navy);
    addTitleRow(`كما في نهاية: ${curLbl}${hasCmp ? `  |  مقارنة بـ: ${cmpLbl}` : ''}`, 9.5, 'FFAACCE8', CLR.navyDark);
    addTitleRow(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
    addSpacer(4);
    addColHdr();

    // ── ASSETS ───────────────────────────────────────────────────────────────
    addSpacer(4);
    addSecHdr('الأصول');
    addSubHdr('أولاً: الأصول غير المتداولة');
    FA_CODES.forEach(c => {
      const v = abal(rows,c), vc = hasCmp ? abal(cmpRows,c) : null;
      if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
    });
    { const v=abal(rows,'10201'), vc=hasCmp?abal(cmpRows,'10201'):null;
      if (v||vc) addItem(BSF_LABELS['10201'], v||null, vc||null); }
    addSubTot('إجمالي الأصول غير المتداولة', ncaSum||null, ncaSumC);
    addSpacer();

    addSubHdr('ثانياً: الأصول المتداولة');
    BSF_CA_ORDER.forEach(c => {
      const v = abal(rows,c), vc = hasCmp ? abal(cmpRows,c) : null;
      if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
    });
    addSubTot('إجمالي الأصول المتداولة', caSum||null, caSumC);
    addSpacer();
    addTotal('إجمالي الأصول', totalA||null, totalAC);

    // ── LIABILITIES ──────────────────────────────────────────────────────────
    addSpacer();
    addSecHdr('الالتزامات وحقوق الملكية');
    addSubHdr('أولاً: الالتزامات المتداولة');
    CL_CODES.forEach(c => {
      const v = lbal(rows,c), vc = hasCmp ? lbal(cmpRows,c) : null;
      if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
    });
    addSubTot('إجمالي الالتزامات المتداولة', clSum||null, clSumC);
    addSpacer();

    if (nclSum>0||(hasCmp&&nclSumC>0)) {
      addSubHdr('ثانياً: الالتزامات غير المتداولة');
      NCL_CODES.forEach(c => {
        const v = lbal(rows,c), vc = hasCmp ? lbal(cmpRows,c) : null;
        if (v||vc) addItem(BSF_LABELS[c]||c, v||null, vc||null);
      });
      addSubTot('إجمالي الالتزامات غير المتداولة', nclSum||null, nclSumC);
      addSpacer();
    }

    addTotal('إجمالي الالتزامات', totalL||null, totalLC);

    // ── EQUITY ───────────────────────────────────────────────────────────────
    addSpacer();
    addSubHdr('ثالثاً: حقوق الملكية');
    addItem(BSF_LABELS['30101'], lbal(rows,'30101')||null, hasCmp?lbal(cmpRows,'30101')||null:null);
    { const v=lbal(rows,'30102'), vc=hasCmp?lbal(cmpRows,'30102'):null;
      if (v||vc) addItem(BSF_LABELS['30102'], v||null, vc||null); }
    // Net profit — colour the label
    { const isProfit = netP >= 0;
      const nl = isProfit ? 'صافي ربح الفترة الجارية' : 'صافي خسارة الفترة الجارية';
      const row = addItem(nl, netP||null, netPC||null);
      row.getCell(1).font = { name:FONT, size:9.5, bold:true,
        color:{ argb: isProfit ? CLR.greenText : 'FF8A2A00' } }; }
    addSubTot('إجمالي حقوق الملكية', totalE||null, totalEC);
    addSpacer();
    addGrand('إجمالي الالتزامات وحقوق الملكية', totalA||null, totalAC);
    addSpacer();
    addBalanceNote(
      `✓ الميزانية متوازنة — الأصول (${Math.round(totalA).toLocaleString('ar-SA')}) = الالتزامات (${Math.round(totalL).toLocaleString('ar-SA')}) + حقوق الملكية (${Math.round(totalE).toLocaleString('ar-SA')})`
    );

    // ── Download ──────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `قائمة_المركز_المالي_${asOf}.xlsx`; a.click();
    URL.revokeObjectURL(url);

  } catch(err) {
    console.error('BSF Excel export error:', err);
    alert('خطأ في التصدير إلى Excel: ' + err.message);
  }
}

function exportBSFHTML() {
  const d = _bsfDerive();
  if (!d) return;

  const { rows, cmpRows, hasCmp, asOf, curLbl, cmpLbl, company,
    FA_CODES, CL_CODES, NCL_CODES,
    ncaSum, ncaSumC, caSum, caSumC, totalA, totalAC,
    clSum, clSumC, nclSum, nclSumC, totalL, totalLC,
    netP, netPC, totalE, totalEC, abal, lbal } = d;

  const genDate = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  const NC = hasCmp ? 3 : 2;

  const fmtN = (v) => {
    if (!v) return '<td class="num zero">—</td>';
    const abs = Math.abs(v).toLocaleString('ar-SA', {minimumFractionDigits:0, maximumFractionDigits:0});
    return v < 0 ? `<td class="num neg">(${abs})</td>` : `<td class="num pos">${abs}</td>`;
  };
  const fmtR  = (cur, cmp) => fmtN(cur) + (hasCmp ? fmtN(cmp) : '');
  const secH  = (l) => `<tr class="sec-hdr"><td colspan="${NC}">${l}</td></tr>`;
  const subH  = (l) => `<tr class="sub-hdr"><td colspan="${NC}">${l}</td></tr>`;
  const itm   = (l, cur, cmp) => `<tr class="item"><td class="ind">${l}</td>${fmtR(cur,cmp)}</tr>`;
  const subT  = (l, cur, cmp) => `<tr class="subtotal"><td>${l}</td>${fmtR(cur,cmp)}</tr>`;
  const totR  = (l, cur, cmp) => `<tr class="total"><td><b>${l}</b></td>${fmtR(cur,cmp)}</tr>`;
  const grnd  = (l, cur, cmp) => `<tr class="grand"><td><b>${l}</b></td>${fmtR(cur,cmp)}</tr>`;
  const sp    = () => `<tr class="spacer"><td colspan="${NC}"></td></tr>`;

  let tb = '';
  tb += secH('الأصول');
  tb += subH('أولاً: الأصول غير المتداولة');
  FA_CODES.forEach(c => { const v=abal(rows,c),vc=hasCmp?abal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
  { const v=abal(rows,'10201'),vc=hasCmp?abal(cmpRows,'10201'):null; if(v||vc) tb+=itm(BSF_LABELS['10201'],v||null,vc||null); }
  tb += subT('إجمالي الأصول غير المتداولة', ncaSum||null, ncaSumC); tb += sp();
  tb += subH('ثانياً: الأصول المتداولة');
  BSF_CA_ORDER.forEach(c => { const v=abal(rows,c),vc=hasCmp?abal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
  tb += subT('إجمالي الأصول المتداولة', caSum||null, caSumC); tb += sp();
  tb += totR('إجمالي الأصول', totalA||null, totalAC); tb += sp();

  tb += secH('الالتزامات وحقوق الملكية');
  tb += subH('أولاً: الالتزامات المتداولة');
  CL_CODES.forEach(c => { const v=lbal(rows,c),vc=hasCmp?lbal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
  tb += subT('إجمالي الالتزامات المتداولة', clSum||null, clSumC); tb += sp();
  if (nclSum>0||(hasCmp&&nclSumC>0)) {
    tb += subH('ثانياً: الالتزامات غير المتداولة');
    NCL_CODES.forEach(c => { const v=lbal(rows,c),vc=hasCmp?lbal(cmpRows,c):null; if(v||vc) tb+=itm(BSF_LABELS[c]||c,v||null,vc||null); });
    tb += subT('إجمالي الالتزامات غير المتداولة', nclSum||null, nclSumC); tb += sp();
  }
  tb += totR('إجمالي الالتزامات', totalL||null, totalLC); tb += sp();

  tb += subH('ثالثاً: حقوق الملكية');
  tb += itm(BSF_LABELS['30101'], lbal(rows,'30101')||null, hasCmp?lbal(cmpRows,'30101')||null:null);
  { const v=lbal(rows,'30102'),vc=hasCmp?lbal(cmpRows,'30102'):null; if(v||vc) tb+=itm(BSF_LABELS['30102'],v||null,vc||null); }
  { const nl=netP>=0?'صافي ربح الفترة الجارية':'صافي خسارة الفترة الجارية';
    const sty=netP>=0?' style="color:#1a6a2a"':' style="color:#8a2a00"';
    tb+=`<tr class="item"><td class="ind"${sty}>${nl}</td>${fmtN(netP||null)}${hasCmp?fmtN(netPC||null):''}</tr>`; }
  tb += subT('إجمالي حقوق الملكية', totalE||null, totalEC); tb += sp();
  tb += grnd('إجمالي الالتزامات وحقوق الملكية', totalA||null, totalAC);

  const cmpTh = hasCmp ? `<th class="num">${cmpLbl}</th>` : '';
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>قائمة المركز المالي — ${esc(company)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;font-size:11pt;color:#111;background:#fff}
.page{max-width:800px;margin:0 auto;padding:28px 32px}
.co-name{font-size:17pt;font-weight:700;text-align:center;color:#0a2040;margin-bottom:4px}
.rpt-title{font-size:14pt;font-weight:600;text-align:center;color:#1a4a7a;margin-bottom:2px}
.meta{text-align:center;font-size:9pt;color:#555;margin-bottom:4px;line-height:1.8}
.currency{text-align:center;font-size:8.5pt;color:#999;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
th{padding:7px 10px;font-weight:700;border-bottom:2px solid #0a2040;text-align:right}
th.num{text-align:left;min-width:130px}
td{padding:5px 10px;border-bottom:1px solid #e8ecf0;vertical-align:middle}
td.num{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:130px}
td.pos{color:#0a3060}
td.neg{color:#8a1010}
td.zero{color:#bbb}
td.ind{padding-right:32px}
tr.sec-hdr td{background:#1a3a6a;color:#fff;font-weight:700;font-size:9pt;
  padding:6px 10px;border-top:2px solid #0a2040}
tr.sub-hdr td{background:#e8eef8;color:#1a3a6a;font-weight:600;font-size:8.5pt;
  padding:5px 10px;border-top:1px solid #c0cfe8}
tr.subtotal td{border-top:1px solid #c0cfe8;font-weight:600;background:#f4f7fb}
tr.total td{border-top:2px solid #0a2040;font-weight:700;background:#e8eef8}
tr.grand td{border-top:3px double #0a2040;font-weight:700;font-size:10pt;background:#dde6f4}
tr.spacer td{padding:3px;border:none;background:none}
.balance-ok{text-align:center;color:#1a6a2a;font-size:9pt;font-weight:600;
  margin-top:14px;padding:5px 10px;border:1px solid #b0d8b0;border-radius:4px;background:#f4fff8}
.footer{margin-top:14px;font-size:8pt;color:#999;text-align:center;border-top:1px solid #e0e0e0;padding-top:8px}
@media print{tr.sec-hdr td,tr.sub-hdr td,tr.subtotal td,tr.total td,tr.grand td,
  .balance-ok{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body><div class="page">
  <div class="co-name">${esc(company)}</div>
  <div class="rpt-title">قائمة المركز المالي</div>
  <div class="meta">كما في نهاية: ${curLbl}${hasCmp?` &nbsp;|&nbsp; مقارنة بـ: ${cmpLbl}`:''}<br>تاريخ الإنشاء: ${genDate}</div>
  <div class="currency">المبالغ بالريال السعودي</div>
  <table>
    <thead><tr><th>البيان</th><th class="num">${curLbl}</th>${cmpTh}</tr></thead>
    <tbody>${tb}</tbody>
  </table>
  <div class="balance-ok">✓ الميزانية متوازنة — الأصول (${Math.round(totalA).toLocaleString('ar-SA')}) = الالتزامات (${Math.round(totalL).toLocaleString('ar-SA')}) + حقوق الملكية (${Math.round(totalE).toLocaleString('ar-SA')})</div>
  <div class="footer">تم إنشاؤه من نظام MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div></body>
</html>`;

  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `قائمة_المركز_المالي_${asOf}.html`; a.click();
  URL.revokeObjectURL(url);
}
