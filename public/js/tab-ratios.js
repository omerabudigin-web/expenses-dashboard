// ── RATIOS tab ─────────────────────────────────────────────────────────────────

const RATIO_DEFS = [
  { key:'currentRatio',  lbl:'النسبة الجارية',          dec:2, sfx:'×',    lo:1,   hi:1.5, hb:true,  group:'💧 السيولة',       hint:'> 1.5 جيد · > 2 ممتاز' },
  { key:'quickRatio',    lbl:'النسبة السريعة',           dec:2, sfx:'×',    lo:0.7, hi:1,   hb:true,  group:'💧 السيولة',       hint:'> 1.0 جيد' },
  { key:'cashRatio',     lbl:'نسبة النقدية',             dec:2, sfx:'×',    lo:0.2, hi:0.5, hb:true,  group:'💧 السيولة',       hint:'> 0.5 جيد' },
  { key:'grossMargin',   lbl:'هامش الربح الإجمالي',     dec:1, sfx:'%',    lo:10,  hi:20,  hb:true,  group:'📈 الربحية',        hint:'> 20% ممتاز' },
  { key:'netMargin',     lbl:'هامش الربح الصافي',       dec:1, sfx:'%',    lo:3,   hi:8,   hb:true,  group:'📈 الربحية',        hint:'> 8% جيد' },
  { key:'roa',           lbl:'العائد على الأصول',        dec:1, sfx:'%',    lo:5,   hi:10,  hb:true,  group:'📈 الربحية',        hint:'> 10% ممتاز' },
  { key:'roe',           lbl:'العائد على الملكية',       dec:1, sfx:'%',    lo:8,   hi:15,  hb:true,  group:'📈 الربحية',        hint:'> 15% ممتاز' },
  { key:'debtRatio',     lbl:'الديون من الأصول',         dec:1, sfx:'%',    lo:50,  hi:70,  hb:false, group:'⚖️ الرفع المالي',   hint:'< 50% مريح' },
  { key:'debtEquity',    lbl:'الدين / الملكية',          dec:2, sfx:'×',    lo:1,   hi:2,   hb:false, group:'⚖️ الرفع المالي',   hint:'< 1× مريح' },
  { key:'intCoverage',   lbl:'تغطية الفوائد',            dec:1, sfx:'×',    lo:1.5, hi:3,   hb:true,  group:'⚖️ الرفع المالي',   hint:'> 3× ممتاز' },
  { key:'assetTurnover', lbl:'دوران الأصول',             dec:2, sfx:'×',    lo:0.5, hi:1,   hb:true,  group:'⚙️ الكفاءة',        hint:'> 1× جيد' },
  { key:'arDays',        lbl:'أيام تحصيل المدينين',      dec:0, sfx:' يوم', lo:60,  hi:90,  hb:false, group:'⚙️ الكفاءة',        hint:'< 60 يوم ممتاز' },
  { key:'invDays',       lbl:'أيام دوران المخزون',       dec:0, sfx:' يوم', lo:60,  hi:90,  hb:false, group:'⚙️ الكفاءة',        hint:'< 60 يوم جيد' },
];

function getRatiosPlFrom(asOf, mode) {
  if (!asOf || mode === 'cumul') return null;
  if (mode === 'ytd')     return asOf.slice(0, 4) + '-01';
  if (mode === 'quarter') { const mo = parseInt(asOf.slice(5, 7)); return asOf.slice(0, 4) + '-' + String(Math.floor((mo - 1) / 3) * 3 + 1).padStart(2, '0'); }
  if (mode === 'month')   return asOf;
  return null;
}

function computeRatios(bs, pl, asOf, plFrom = null) {
  const rows = bs.filter(r => r.month === asOf);
  if (!rows.length) return null;
  const label = (rows[0] && rows[0].label) || asOf;

  // BS balances at month-end
  const c3x    = r => r.code3 || (r.grpCode && r.grpCode.slice(0, 3)) || '';
  const totalA    = rows.filter(r => c3x(r)[0] === '1').reduce((s,r) => s + r.balance, 0);
  const currA     = rows.filter(r => c3x(r) === '103').reduce((s,r) => s + r.balance, 0);
  const cash      = rows.filter(r => r.grpCode === '10301').reduce((s,r) => s + r.balance, 0);
  const inventory = rows.filter(r => r.grpCode === '10302').reduce((s,r) => s + r.balance, 0);
  const ar        = rows.filter(r => r.grpCode === '10303').reduce((s,r) => s + r.balance, 0);
  const totalL    = rows.filter(r => c3x(r)[0] === '2').reduce((s,r) => s - r.balance, 0);
  const currL     = rows.filter(r => c3x(r) === '201').reduce((s,r) => s - r.balance, 0);
  const totalE    = totalA - totalL;

  // P&L for the selected window (plFrom → asOf, or cumulative if plFrom null)
  const plToDate = (pl || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const c        = aggregatePL(plToDate);
  const nMonths  = Math.max(plToDate.length, 1);
  const ann      = v => v * (12 / nMonths);
  const annNI       = ann(c.netProfit);
  const annRev      = ann(c.revenue);
  const annCogs     = ann(c.cogs + (c.otherCost || 0));
  const annFin      = ann(c.fin);
  const annOpProfit = ann(c.operatingProfit);

  const safe = (num, den) => (den && den !== 0 && isFinite(num / den)) ? num / den : null;

  return {
    asOf, label, nMonths, totalA, currA, cash, inventory, ar, totalL, currL, totalE,
    annRev, annNI,
    // Liquidity
    currentRatio: safe(currA, currL),
    quickRatio:   safe(currA - inventory, currL),
    cashRatio:    safe(cash, currL),
    // Profitability
    grossMargin: safe(c.grossProfit * 100, c.revenue),
    netMargin:   safe(c.netProfit   * 100, c.revenue),
    roa:         safe(annNI * 100, totalA),
    roe:         totalE > 0 ? safe(annNI * 100, totalE) : null,
    // Leverage
    debtRatio:   safe(totalL * 100, totalA),
    debtEquity:  totalE > 0 ? safe(totalL, totalE) : null,
    intCoverage: annFin > 0 ? safe(annOpProfit, annFin) : null,
    // Efficiency
    assetTurnover: safe(annRev, totalA),
    arDays:        annRev > 0 ? safe(ar  * 365, annRev)  : null,
    invDays:       annCogs > 0 ? safe(inventory * 365, annCogs) : null,
  };
}

function buildRatiosPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('ratios-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const yMs = months.filter(m => m.startsWith(y));
    const oy  = document.createElement('option');
    oy.value = yMs[yMs.length - 1]; oy.textContent = `من بداية ${y} إلى الآن`; sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      const qMs = yMs.filter(m => qOf(m) === q);
      if (qMs.length) {
        const oq = document.createElement('option');
        oq.value = qMs[qMs.length - 1]; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o = document.createElement('option');
    o.value = mo; o.textContent = row ? row.label : mo; sel.appendChild(o);
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || '';
}

function renderRatiosTab() {
  const bs = State.get('bs');
  const pl = State.get('pl');
  if (!bs || !bs.length) return;

  buildRatiosPeriodOptions();
  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode') || {}).value || 'ytd';
  if (!asOf) return;

  const plFrom  = getRatiosPlFrom(asOf, plMode);
  const months  = [...new Set(bs.map(x => x.month))].sort();
  const asOfIdx = months.indexOf(asOf);
  const prevMo  = asOfIdx > 0 ? months[asOfIdx - 1] : null;
  const r       = computeRatios(bs, pl, asOf, plFrom);
  const rPrev   = prevMo ? computeRatios(bs, pl, prevMo, getRatiosPlFrom(prevMo, plMode)) : null;
  if (!r) return;

  // Update hint text
  const modeHints = { ytd:'الربحية تراكمية من بداية السنة حتى الشهر المحدد', cumul:'الربحية تراكمية من بداية البيانات', quarter:'الربحية للربع الحالي فقط (مُحوَّلة سنوياً)', month:'الربحية للشهر المحدد فقط (مُحوَّلة سنوياً)' };
  const hintEl = document.getElementById('ratios-mode-hint');
  if (hintEl) hintEl.textContent = modeHints[plMode] || '';

  // ── Helpers ──
  function clr(val, lo, hi, hb = true) {
    if (val === null || !isFinite(val)) return '#5a7a9a';
    return hb ? (val >= hi ? '#4ada8e' : val >= lo ? '#da9a4a' : '#da4a4a')
              : (val <= lo ? '#4ada8e' : val <= hi ? '#da9a4a' : '#da4a4a');
  }
  function fmtR(val, dec, sfx) {
    return (val === null || !isFinite(val)) ? '—' : val.toFixed(dec) + sfx;
  }
  function arw(cur, prev, hb = true) {
    if (cur === null || prev === null || !isFinite(cur) || !isFinite(prev)) return '';
    const d = cur - prev;
    const pct = Math.abs(prev) > 0.0001 ? Math.abs(d / prev) * 100 : 0;
    if (pct < 0.5) return `<span style="color:#5a7a9a;font-size:.75rem"> →</span>`;
    const good = hb ? d > 0 : d < 0;
    return `<span style="color:${good ? '#4ada8e' : '#da4a4a'};font-size:.75rem"> ${d > 0 ? '▲' : '▼'}${pct.toFixed(1)}%</span>`;
  }
  function rRow(lbl, val, fmtd, col, hint, arrow) {
    const v = (val === null || !isFinite(val))
      ? `<span style="color:#5a7a9a">—</span>`
      : `<span style="color:${col};font-weight:600">${fmtd}</span>${arrow || ''}`;
    return `<tr>
      <td style="padding:8px 4px;color:#c0d0e0;font-size:.85rem">${lbl}</td>
      <td class="num" style="padding:8px 4px">${v}</td>
      <td style="padding:8px 4px;color:#5a7a9a;font-size:.73rem">${hint}</td>
    </tr>`;
  }

  // ── KPIs ──
  document.getElementById('ratios-kpis').innerHTML = [
    { lbl:'النسبة الجارية',     fmt:fmtR(r.currentRatio,2,'×'), col:clr(r.currentRatio,1,1.5) },
    { lbl:'هامش الربح الصافي',  fmt:fmtR(r.netMargin,1,'%'),    col:clr(r.netMargin,3,8) },
    { lbl:'العائد على الملكية', fmt:fmtR(r.roe,1,'%'),          col:clr(r.roe,8,15) },
    { lbl:'الدين / الملكية',    fmt:fmtR(r.debtEquity,2,'×'),   col:clr(r.debtEquity,1,2,false) },
  ].map(k => `<div class="kpi" style="--accent:${k.col}"><div class="lbl">${k.lbl}</div><div class="val">${k.fmt}</div></div>`).join('');

  // ── Early Warning ──
  const checks = RATIO_DEFS.filter(d => !['grossMargin','assetTurnover','invDays'].includes(d.key));
  const redItems   = checks.filter(ch => clr(r[ch.key], ch.lo, ch.hi, ch.hb) === '#da4a4a');
  const amberItems = checks.filter(ch => clr(r[ch.key], ch.lo, ch.hi, ch.hb) === '#da9a4a');
  const warnGroup  = (icon, col, items, title) => !items.length ? '' :
    `<div style="flex:1;min-width:220px;background:#0d1b2a;border:1px solid ${col}55;border-radius:8px;padding:12px">
      <div style="color:${col};font-size:.8rem;font-weight:700;margin-bottom:8px">${icon} ${title}</div>
      ${items.map(ch => {
        const p = rPrev ? rPrev[ch.key] : null;
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1e2e40">
          <span style="color:#c0d0e0;font-size:.82rem">${ch.lbl}</span>
          <span style="color:${col};font-weight:600;font-size:.82rem">${fmtR(r[ch.key],ch.dec,ch.sfx)}${arw(r[ch.key],p,ch.hb)}</span>
        </div>`;
      }).join('')}
    </div>`;
  document.getElementById('ratios-warnings').innerHTML =
    (redItems.length === 0 && amberItems.length === 0)
      ? `<div style="padding:12px 16px;color:#4ada8e;background:#0a1a0a;border:1px solid #4ada8e33;border-radius:8px;font-size:.88rem">✓ جميع النسب المراقبة ضمن النطاق المقبول</div>`
      : `<div style="display:flex;flex-wrap:wrap;gap:12px">
           ${warnGroup('❌','#da4a4a', redItems,   'تحتاج مراجعة عاجلة')}
           ${warnGroup('⚠','#da9a4a', amberItems, 'تحتاج متابعة')}
         </div>`;

  // ── Ratio groups (driven by RATIO_DEFS) ──
  const grpRows = g => RATIO_DEFS.filter(d => d.group === g)
    .map(d => rRow(d.lbl, r[d.key], fmtR(r[d.key], d.dec, d.sfx), clr(r[d.key], d.lo, d.hi, d.hb), d.hint, arw(r[d.key], rPrev?.[d.key], d.hb)))
    .join('');
  document.getElementById('ratios-liquidity').innerHTML      = `<table style="width:100%"><tbody>${grpRows('💧 السيولة')}</tbody></table>`;
  document.getElementById('ratios-profitability').innerHTML  = `<table style="width:100%"><tbody>${grpRows('📈 الربحية')}</tbody></table>`;
  document.getElementById('ratios-leverage').innerHTML       = `<table style="width:100%"><tbody>${grpRows('⚖️ الرفع المالي')}</tbody></table>`;
  document.getElementById('ratios-efficiency').innerHTML     = `<table style="width:100%"><tbody>${grpRows('⚙️ الكفاءة')}</tbody></table>`;

  // ── Cost Structure ──
  const plToDate  = (pl || []).filter(m => m.month <= asOf);
  const cAgg      = aggregatePL(plToDate);
  // Use monthly-state for dist/adm so they match Summary/Monthly/Accounts tabs
  const _moToDateCS = (State.get('monthly') || []).filter(m => m.month <= asOf);
  const _csDistMo   = _moToDateCS.reduce((s, m) => s + (m.dist||0), 0);
  const _csAdmMo    = _moToDateCS.reduce((s, m) => s + (m.adm ||0), 0);
  const costEl   = document.getElementById('ratios-cost-struct');
  if (costEl) {
    if (cAgg.revenue > 0) {
      const items = [
        { lbl:'تكلفة البضاعة المباعة', val: cAgg.cogs + (cAgg.otherCost || 0) },
        { lbl: CAT_LABEL.sal,  val: cAgg.sal   },
        { lbl: CAT_LABEL.dist, val: _csDistMo  },
        { lbl: CAT_LABEL.adm,  val: _csAdmMo   },
        { lbl: CAT_LABEL.fin,  val: cAgg.fin   },
        { lbl: CAT_LABEL.rent, val: cAgg.rent  },
        { lbl: CAT_LABEL.maint,val: cAgg.maint },
        { lbl: CAT_LABEL.sell, val: cAgg.sell  },
        { lbl: CAT_LABEL.char, val: cAgg.char  },
        { lbl: CAT_LABEL.oth,  val: cAgg.oth   },
      ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);
      const profitRow = { lbl:'صافي الربح / الخسارة', val: cAgg.netProfit, isProfit: true };
      costEl.innerHTML = [...items, profitRow].map(x => {
        const pct = x.val / cAgg.revenue * 100;
        const bar = Math.min(100, Math.max(0, Math.abs(pct)));
        const col = x.isProfit
          ? (x.val >= 0 ? '#4ada8e' : '#da4a4a')
          : (pct > 30 ? '#da4a4a' : pct > 15 ? '#da9a4a' : '#4a9eda');
        const sign = x.val < 0 ? '(' : '';
        const esign = x.val < 0 ? ')' : '';
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="color:#c0d0e0;font-size:.82rem">${x.lbl}</span>
            <span style="color:${col};font-size:.82rem;font-weight:600">${sign}${Math.abs(pct).toFixed(1)}%${esign} — ${sign}${fmt(Math.abs(x.val))} ر.س${esign}</span>
          </div>
          <div style="height:7px;border-radius:4px;background:#0d1b2a">
            <div style="height:100%;border-radius:4px;width:${bar}%;background:${col}99"></div>
          </div>
        </div>`;
      }).join('') +
        `<div style="margin-top:10px;padding:7px 10px;background:#06121e;border-radius:4px;font-size:.70rem;color:#4a6a8a;line-height:1.6">
          * التوزيع والنقل والمصروفات الإدارية من مصدر المصروفات التشغيلية (يشمل كامل ح. 4010301). في قائمة الدخل، ح. نقل المشتريات (4010301001) مُدرج ضمن تكلفة البضاعة المباعة كتكاليف إيصال.
        </div>`;
    } else {
      costEl.innerHTML = '<div style="color:#5a7a9a;padding:10px;text-align:center">لا توجد بيانات إيراد لهذه الفترة</div>';
    }
  }

  // ── Trend chart + monthly comparison table ──
  const allRatios = months.map(mo => computeRatios(bs, pl || [], mo, getRatiosPlFrom(mo, plMode))).filter(Boolean);
  renderRatiosTrend(allRatios);
  renderRatiosMonthlyTable(allRatios, asOf);
}

// ── Monthly comparison table ──────────────────────────────────────────────────
function renderRatiosMonthlyTable(allRatios, selectedMo) {
  const el = document.getElementById('ratios-monthly-table');
  if (!el || !allRatios.length) return;

  const clr = (val, lo, hi, hb = true) => {
    if (val === null || !isFinite(val)) return '#5a7a9a';
    return hb ? (val >= hi ? '#4ada8e' : val >= lo ? '#da9a4a' : '#da4a4a')
              : (val <= lo ? '#4ada8e' : val <= hi ? '#da9a4a' : '#da4a4a');
  };
  const fmtV = (v, dec, sfx) => (v === null || !isFinite(v)) ? '—' : v.toFixed(dec) + sfx;

  // Group separator rows
  const groups = [...new Set(RATIO_DEFS.map(d => d.group))];
  let rows = '';
  groups.forEach(g => {
    const defs = RATIO_DEFS.filter(d => d.group === g);
    rows += `<tr><td colspan="${allRatios.length + 2}" style="background:#112233;color:#4a8aaa;font-size:.75rem;font-weight:700;padding:7px 10px;border-top:1px solid #1e3a5f">${g}</td></tr>`;
    defs.forEach(d => {
      const cells = allRatios.map(rv => {
        const v   = rv[d.key];
        const col = clr(v, d.lo, d.hi, d.hb);
        const isSel = rv.asOf === selectedMo;
        const bg  = isSel ? '#0d2a4a' : '';
        const fw  = isSel ? 'bold' : 'normal';
        return `<td style="text-align:center;padding:5px 8px;${bg?'background:'+bg+';':''}color:${col};font-weight:${fw};white-space:nowrap;font-size:.8rem">${fmtV(v, d.dec, d.sfx)}</td>`;
      }).join('');
      rows += `<tr style="border-bottom:1px solid #0d1e2e">
        <td style="padding:5px 10px;color:#c0d0e0;font-size:.82rem;white-space:nowrap">${d.lbl}</td>
        ${cells}
        <td style="padding:5px 8px;color:#4a6a8a;font-size:.72rem;white-space:nowrap">${d.hint}</td>
      </tr>`;
    });
  });

  const hdrs = allRatios.map(rv => {
    const isSel = rv.asOf === selectedMo;
    return `<th style="background:${isSel?'#1e4a7a':'#112233'};color:${isSel?'#fff':'#8aaac8'};padding:7px 10px;text-align:center;white-space:nowrap;font-size:.78rem;border-bottom:2px solid ${isSel?'#4a9eda':'#1e3a5f'}">${rv.label||rv.asOf}</th>`;
  }).join('');

  el.innerHTML = `<table style="width:100%;border-collapse:collapse;direction:rtl">
    <thead><tr>
      <th style="background:#112233;color:#8aaac8;padding:7px 10px;text-align:right;font-size:.78rem;border-bottom:2px solid #1e3a5f">النسبة</th>
      ${hdrs}
      <th style="background:#112233;color:#8aaac8;padding:7px 10px;text-align:right;font-size:.72rem;border-bottom:2px solid #1e3a5f">المعيار</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Ratios HTML report builder ────────────────────────────────────────────────
function buildRatiosHTMLReport(bs, pl, asOf, plFrom, plMode) {
  const r      = computeRatios(bs, pl, asOf, plFrom);
  if (!r) return '<p>لا توجد بيانات</p>';
  const months = [...new Set(bs.map(x => x.month))].sort();
  const allRatios = months.map(mo => computeRatios(bs, pl, mo, getRatiosPlFrom(mo, plMode))).filter(Boolean);
  const dbName = (State.get('config')?.dbs?.[0]) || '';
  const genDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const plLabel = r.nMonths === 1 ? 'شهر واحد' : `${r.nMonths} أشهر`;
  const modeLabel = { ytd:'تراكمي - السنة الجارية', cumul:'تراكمي - من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || plMode;

  const clrHex = (v, lo, hi, hb=true) => {
    if (v===null || !isFinite(v)) return '#888';
    return hb ? (v>=hi?'#1a6a2a':v>=lo?'#7a5a00':'#8a1a1a') : (v<=lo?'#1a6a2a':v<=hi?'#7a5a00':'#8a1a1a');
  };
  const clrBg = (v, lo, hi, hb=true) => {
    if (v===null||!isFinite(v)) return '#f0f0f0';
    return hb?(v>=hi?'#e8fff0':v>=lo?'#fffbe0':'#fff0f0'):(v<=lo?'#e8fff0':v<=hi?'#fffbe0':'#fff0f0');
  };
  const fV = (v, dec, sfx) => (v===null||!isFinite(v)) ? '—' : v.toFixed(dec)+sfx;

  // KPI cards
  const kpis = [
    { lbl:'النسبة الجارية',     d:RATIO_DEFS.find(x=>x.key==='currentRatio') },
    { lbl:'هامش الربح الصافي',  d:RATIO_DEFS.find(x=>x.key==='netMargin') },
    { lbl:'العائد على الملكية', d:RATIO_DEFS.find(x=>x.key==='roe') },
    { lbl:'الدين / الملكية',    d:RATIO_DEFS.find(x=>x.key==='debtEquity') },
  ].map(k => {
    const v = r[k.d.key]; const col = clrHex(v, k.d.lo, k.d.hi, k.d.hb);
    return `<div style="flex:1;min-width:130px;background:#f8f9fb;border:1px solid #dde;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:11px;color:#666;margin-bottom:6px">${k.d.lbl}</div>
      <div style="font-size:22px;font-weight:bold;color:${col}">${fV(v,k.d.dec,k.d.sfx)}</div>
      <div style="font-size:10px;color:#999;margin-top:4px">${k.d.hint}</div>
    </div>`;
  }).join('');

  // Ratio group tables
  const groups = [...new Set(RATIO_DEFS.map(d => d.group))];
  let groupTablesHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">';
  groups.forEach(g => {
    const defs = RATIO_DEFS.filter(d => d.group === g);
    const rows = defs.map(d => {
      const v = r[d.key]; const col = clrHex(v, d.lo, d.hi, d.hb); const bg = clrBg(v, d.lo, d.hi, d.hb);
      return `<tr style="background:${bg}">
        <td style="padding:7px 10px;font-size:12px">${d.lbl}</td>
        <td style="padding:7px 10px;font-weight:bold;color:${col};text-align:left;white-space:nowrap">${fV(v,d.dec,d.sfx)}</td>
        <td style="padding:7px 10px;font-size:10px;color:#777;text-align:left">${d.hint}</td>
      </tr>`;
    }).join('');
    groupTablesHtml += `<div><div style="background:#1A3A6A;color:#fff;padding:8px 12px;font-weight:bold;font-size:12px;border-radius:4px 4px 0 0">${g}</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
  });
  groupTablesHtml += '</div>';

  // Monthly table
  const moHdrs = allRatios.map(rv => `<th style="background:${rv.asOf===asOf?'#1A3A6A':'#2a3a4a'};color:#fff;padding:6px 8px;white-space:nowrap;font-size:10px">${rv.label||rv.asOf}</th>`).join('');
  let moRows = '';
  groups.forEach(g => {
    moRows += `<tr><td colspan="${allRatios.length+2}" style="background:#e8eef8;color:#1A3A6A;font-weight:bold;font-size:11px;padding:6px 10px">${g}</td></tr>`;
    RATIO_DEFS.filter(d=>d.group===g).forEach(d => {
      const cells = allRatios.map(rv => {
        const v = rv[d.key]; const col = clrHex(v, d.lo, d.hi, d.hb); const bg = clrBg(v, d.lo, d.hi, d.hb);
        const isSel = rv.asOf===asOf;
        return `<td style="text-align:center;padding:5px 8px;background:${isSel?'#dde8f8':bg};color:${col};font-weight:${isSel?'bold':'normal'};white-space:nowrap;font-size:11px">${fV(v,d.dec,d.sfx)}</td>`;
      }).join('');
      moRows += `<tr><td style="padding:5px 10px;font-size:11px">${d.lbl}</td>${cells}<td style="padding:5px 8px;font-size:10px;color:#888">${d.hint}</td></tr>`;
    });
  });

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>النسب المالية — ${asOf}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;text-align:right;background:#fff;color:#111;font-size:13px}
.page{max-width:1100px;margin:0 auto;padding:24px}
.hdr{background:#0A2040;color:#fff;padding:16px 20px;border-radius:6px;text-align:center;margin-bottom:16px}
.hdr h1{font-size:17px;margin-bottom:3px}.hdr h2{font-size:12px;color:#AACCE8;font-weight:normal}
.hdr .meta{font-size:10px;color:#6A8AAA;margin-top:3px}
.sec{background:#1A3A6A;color:#fff;padding:7px 12px;font-weight:bold;font-size:12px;border-radius:4px;margin:18px 0 8px}
table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8ecf0}
.mo-table th{text-align:center}.mo-table td:first-child{text-align:right}
.footer{margin-top:20px;border-top:1px solid #e8ecf0;padding-top:8px;font-size:10px;color:#999;text-align:center}
@media print{body{font-size:10px}.page{padding:8px;max-width:100%}.page-break{page-break-before:always}}
</style></head>
<body><div class="page">
  <div class="hdr">
    <h1>تحليل النسب المالية${dbName?' — '+dbName:''}</h1>
    <h2>كما في ${r.label||asOf} &nbsp;|&nbsp; احتساب الربحية: ${modeLabel} (${plLabel})</h2>
    <div class="meta">أُنشئ: ${genDate}</div>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">${kpis}</div>

  <div class="sec">مجموعات النسب — كما في ${r.label||asOf}</div>
  ${groupTablesHtml}

  <div class="page-break"></div>
  <div class="sec">📅 المقارنة الشهرية — جميع النسب</div>
  <div style="overflow-x:auto">
    <table class="mo-table" style="font-size:11px">
      <thead><tr>
        <th style="background:#2a3a4a;color:#fff;padding:6px 10px;text-align:right">النسبة</th>
        ${moHdrs}
        <th style="background:#2a3a4a;color:#fff;padding:6px 8px;text-align:right;font-size:10px">المعيار</th>
      </tr></thead>
      <tbody>${moRows}</tbody>
    </table>
  </div>

  <div class="footer">أُنشئ بواسطة MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div></body></html>`;
}

function exportRatiosHTML() {
  const bs = State.get('bs'); const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html = buildRatiosHTMLReport(bs, pl, asOf, plFrom, plMode);
  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `النسب_المالية_${asOf}.html`; a.click();
  URL.revokeObjectURL(url);
}

function printRatiosPDF() {
  const bs = State.get('bs'); const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html = buildRatiosHTMLReport(bs, pl, asOf, plFrom, plMode);
  const w = window.open('', '_blank', 'width=1100,height=750');
  w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportRatiosExcel() {
  const bs = State.get('bs'); const pl = State.get('pl');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }

  const asOf   = (document.getElementById('ratios-period-sel') || {}).value || '';
  const plMode = (document.getElementById('ratios-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const r      = computeRatios(bs, pl, asOf, plFrom);
  if (!r) { alert('لا توجد بيانات للفترة المحددة'); return; }
  const months    = [...new Set(bs.map(x => x.month))].sort();
  const allRatios = months.map(mo => computeRatios(bs, pl, mo, getRatiosPlFrom(mo, plMode))).filter(Boolean);
  const modeLabel = { ytd:'تراكمي - السنة الجارية', cumul:'تراكمي - من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || plMode;
  const genDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });

  const FONT = 'Calibri';
  const CLR = { navyDark:'FF0A2040', navy:'FF1A3A6A', bluePale:'FFF4F7FB', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textLight:'FF6A8AAA',
    green:'FF4ada8e', greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
    amber:'FFda9a4a', amberBg:'FFFFFBE8', red:'FFda4a4a', redBg:'FFFFF0F0' };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });
  const ratioClr = (v, lo, hi, hb=true) => {
    if (v===null||!isFinite(v)) return { txt:CLR.textLight, bg:CLR.white };
    const g=hb?(v>=hi):(v<=lo), a=hb?(v>=lo&&v<hi):(v>lo&&v<=hi);
    return g ? {txt:CLR.greenText,bg:'FFF4FFF8'} : a ? {txt:'FF7A5A00',bg:'FFFFFBE8'} : {txt:'FF8A1A1A',bg:'FFFFF0F0'};
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: Detail by group ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet('النسب المالية', { views:[{ rightToLeft:true }] });
  ws1.pageSetup.paperSize=9; ws1.pageSetup.orientation='portrait'; ws1.pageSetup.fitToPage=true;
  ws1.columns=[{width:36},{width:18},{width:24},{width:30}];

  const span1 = row => ws1.mergeCells(row.number,1,row.number,4);
  const addH1 = (t,sz,fc,bg) => { const row=ws1.addRow([t]); row.height=sz>12?30:20; span1(row); const c=row.getCell(1); c.font={name:FONT,size:sz,bold:true,color:{argb:fc}}; c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'}; };
  const addS1 = (h=4) => { const row=ws1.addRow(['']); row.height=h; span1(row); row.getCell(1).fill=solid(CLR.white); };

  addH1(`تحليل النسب المالية${(State.get('config')?.dbs?.[0]||'') ? ' — '+(State.get('config')?.dbs?.[0]||'') : ''}`, 14, CLR.white, CLR.navyDark);
  addH1(`كما في ${r.label||asOf}  |  احتساب الربحية: ${modeLabel}`, 11, 'FFAACCE8', CLR.navyDark);
  addH1(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  addS1(4);

  const groups = [...new Set(RATIO_DEFS.map(d => d.group))];
  groups.forEach(g => {
    // Group header
    const gRow = ws1.addRow([g]); gRow.height=18; span1(gRow);
    gRow.getCell(1).font={name:FONT,size:10,bold:true,color:{argb:CLR.white}}; gRow.getCell(1).fill=solid(CLR.navy);
    gRow.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1};
    // Column headers
    const hRow = ws1.addRow(['النسبة','القيمة','التقييم','المعيار']); hRow.height=16;
    hRow.eachCell({includeEmpty:true},(cell,ci) => {
      cell.font={name:FONT,size:9,bold:true,color:{argb:CLR.textNavy}};
      cell.fill=solid(CLR.bluePale); cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('thin','FFCCDDEE')};
    });
    // Ratio rows
    RATIO_DEFS.filter(d=>d.group===g).forEach(d => {
      const v = r[d.key];
      const vc = ratioClr(v, d.lo, d.hi, d.hb);
      const fmtd = (v===null||!isFinite(v)) ? '—' : v.toFixed(d.dec)+d.sfx;
      const rating = (v===null||!isFinite(v)) ? 'غير متاح' : (vc.txt===CLR.greenText?'ممتاز / جيد':vc.txt==='FF7A5A00'?'متوسط':'ضعيف / تحتاج مراجعة');
      const row = ws1.addRow([d.lbl, fmtd, rating, d.hint]); row.height=16;
      row.getCell(1).font={name:FONT,size:9.5,color:{argb:CLR.textDark}}; row.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:2}; row.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
      [2,3].forEach(ci => { const c=row.getCell(ci); c.font={name:FONT,size:9.5,bold:true,color:{argb:vc.txt}}; c.fill=solid(vc.bg); c.alignment={horizontal:'center',vertical:'middle'}; c.border={bottom:bdr('hair','FFE8ECF0')}; });
      row.getCell(4).font={name:FONT,size:8.5,color:{argb:CLR.textLight}}; row.getCell(4).alignment={horizontal:'right',vertical:'middle'}; row.getCell(4).border={bottom:bdr('hair','FFE8ECF0')};
    });
    addS1(3);
  });

  // ── Sheet 2: Monthly comparison matrix ────────────────────────────────────
  const ws2 = wb.addWorksheet('المقارنة الشهرية', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='landscape'; ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.columns=[{width:32},...allRatios.map(()=>({width:14})),{width:24}];

  const NC2 = allRatios.length + 2;
  const span2 = row => ws2.mergeCells(row.number,1,row.number,NC2);
  const addH2 = (t,sz,fc,bg) => { const row=ws2.addRow([t]); row.height=sz>12?28:18; span2(row); const c=row.getCell(1); c.font={name:FONT,size:sz,bold:true,color:{argb:fc}}; c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'}; };
  addH2(`المقارنة الشهرية للنسب المالية — احتساب الربحية: ${modeLabel}`, 12, CLR.white, CLR.navyDark);
  addH2(`أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  { const row=ws2.addRow(['']); row.height=4; span2(row); row.getCell(1).fill=solid(CLR.white); }

  // Header row (months)
  const hdrRow2 = ws2.addRow(['النسبة', ...allRatios.map(rv=>rv.label||rv.asOf), 'المعيار']); hdrRow2.height=18;
  hdrRow2.eachCell({includeEmpty:true},(cell,ci) => {
    const isSel = ci > 1 && ci < NC2 && allRatios[ci-2]?.asOf === asOf;
    cell.font={name:FONT,size:9,bold:true,color:{argb:CLR.white}};
    cell.fill=solid(isSel?CLR.navy:'FF1a2a3a'); cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
    cell.border={bottom:bdr(isSel?'medium':'thin', isSel?'FF4a9eda':'FF1e3a5f')};
  });

  groups.forEach(g => {
    const gRow2 = ws2.addRow([g]); gRow2.height=14; span2(gRow2);
    gRow2.getCell(1).font={name:FONT,size:8.5,bold:true,color:{argb:'FF4a8aaa'}}; gRow2.getCell(1).fill=solid('FF0a1a2a'); gRow2.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1};
    RATIO_DEFS.filter(d=>d.group===g).forEach(d => {
      const vals = allRatios.map(rv => rv[d.key]);
      const row2 = ws2.addRow([d.lbl, ...vals.map(()=>null), d.hint]); row2.height=15;
      row2.getCell(1).font={name:FONT,size:9,color:{argb:CLR.textDark}}; row2.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:2}; row2.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
      vals.forEach((v,vi) => {
        const cell = row2.getCell(vi+2);
        const vc = ratioClr(v, d.lo, d.hi, d.hb);
        const isSel = allRatios[vi]?.asOf === asOf;
        cell.value = (v!==null&&isFinite(v)) ? parseFloat(v.toFixed(d.dec)) : null;
        cell.numFmt = d.sfx==='%' ? '0.0"%"' : d.sfx==='×' ? '0.00"×"' : '0" يوم"';
        cell.font={name:FONT,size:9,bold:isSel,color:{argb:vc.txt}};
        cell.fill=solid(isSel?'FFd8e8f8':vc.bg); cell.alignment={horizontal:'center',vertical:'middle'}; cell.border={bottom:bdr('hair','FFE8ECF0')};
      });
      row2.getCell(NC2).font={name:FONT,size:8,color:{argb:CLR.textLight}}; row2.getCell(NC2).alignment={horizontal:'right',vertical:'middle'}; row2.getCell(NC2).border={bottom:bdr('hair','FFE8ECF0')};
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `النسب_المالية_${asOf}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
