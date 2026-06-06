// ── COMPARE tab ───────────────────────────────────────────────────────────────
const MONTH_NUMS   = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const MONTH_LABELS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function renderCompareTab() {
  buildPeriodOptions('cmp-period-sel', true);
  const period  = (document.getElementById('cmp-period-sel') || {}).value || 'all';
  const monthly = filterMonthly(period);
  renderCompareChart(monthly);

  // ── Month-over-month growth ──
  document.getElementById('growth-tbody').innerHTML = monthly.map((m, i) => {
    const t    = monthTotal(m);
    const prev = i > 0 ? monthTotal(monthly[i-1]) : null;
    const diff = prev !== null ? t - prev : null;
    const pct  = prev ? (diff / prev * 100) : null;
    const arrow = diff === null ? '' : diff >= 0 ? '<span style="color:#4ada8e">▲</span>' : '<span style="color:#da4a4a">▼</span>';
    return `<tr><td>${m.label}</td><td class="num">${fmt(t)}</td><td class="num">${diff !== null ? arrow + ' ' + fmt(Math.abs(diff)) : '—'}</td><td class="num">${pct !== null ? fmtPct(Math.abs(pct)) : '—'}</td></tr>`;
  }).join('');

  // ── Top category per month ──
  document.getElementById('top-cat-tbody').innerHTML = monthly.map(m => {
    const t   = monthTotal(m);
    const top = CAT_ORDER.reduce((a, b) => (m[a]||0) >= (m[b]||0) ? a : b);
    return `<tr><td>${m.label}</td><td><span class="badge b-${top}">${CAT_LABEL[top]}</span></td><td class="num">${fmt(m[top]||0)}</td><td class="num">${fmtPct(t ? (m[top]||0)/t*100 : 0)}</td></tr>`;
  }).join('');

  // ── Year-over-Year tables (always use full dataset) ──
  const allMonthly = State.get('monthly');
  const years = [...new Set(allMonthly.map(m => m.month.slice(0, 4)))].sort();
  if (years.length < 1) return;

  // Build matrix: year → monthNum → total
  const matrix = {};
  years.forEach(y => { matrix[y] = {}; });
  allMonthly.forEach(m => {
    const y  = m.month.slice(0, 4);
    const mo = m.month.slice(5, 7);
    matrix[y][mo] = monthTotal(m);
  });

  const yearTotals = {};
  years.forEach(y => { yearTotals[y] = MONTH_NUMS.reduce((s, mo) => s + (matrix[y][mo] || 0), 0); });

  const usedMonths = MONTH_NUMS.filter(mo => years.some(y => matrix[y][mo] !== undefined));

  // delta badge helper
  const yoyChg = (val, prevVal) => {
    if (prevVal === undefined || prevVal === null) return '';
    const d = val - prevVal;
    if (Math.abs(d) < 1 || prevVal === 0) return '';
    const pct = d / prevVal * 100;
    const col = d > 0 ? '#da9a4a' : '#4ada8e';
    return `<br><span style="font-size:.72rem;color:${col}">${d>0?'▲':'▼'}${Math.abs(pct).toFixed(1)}%</span>`;
  };

  const thStyle = 'padding:7px 8px;color:#7090b0;font-weight:500;font-size:.8rem';
  const hdrRow  = `<tr style="background:#0a1e30"><th style="${thStyle};text-align:right">الشهر</th>${years.map(y => `<th class="num" style="${thStyle}">${y}</th>`).join('')}</tr>`;

  // Monthly YoY table
  const yoyHead = document.getElementById('yoy-thead');
  const yoyBody = document.getElementById('yoy-tbody');
  if (yoyHead && yoyBody) {
    yoyHead.innerHTML = hdrRow;
    yoyBody.innerHTML = usedMonths.map(mo => {
      const moIdx = MONTH_NUMS.indexOf(mo);
      const cells = years.map((y, i) => {
        const val   = matrix[y][mo];
        if (val === undefined) return `<td class="num" style="padding:6px 8px;color:#3a5a7a">—</td>`;
        const prev  = i > 0 ? matrix[years[i-1]][mo] : null;
        return `<td class="num" style="padding:6px 8px">${fmt(val)}${yoyChg(val, prev)}</td>`;
      }).join('');
      return `<tr style="border-bottom:1px solid #0e2540"><td style="padding:6px 8px;color:#c0d0e0">${MONTH_LABELS[moIdx]}</td>${cells}</tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;background:#0a1e30;font-weight:600">
       <td style="padding:7px 8px;color:#e0f0ff">الإجمالي</td>
       ${years.map((y, i) => {
         const tot  = yearTotals[y];
         const prev = i > 0 ? yearTotals[years[i-1]] : null;
         return `<td class="num" style="padding:7px 8px;color:#e0f0ff">${fmt(tot)}${yoyChg(tot, prev)}</td>`;
       }).join('')}
     </tr>`;
  }

  // Category YoY table
  const catTotals = {};
  CAT_ORDER.forEach(cat => {
    catTotals[cat] = {};
    years.forEach(y => { catTotals[cat][y] = 0; });
  });
  allMonthly.forEach(m => {
    const y = m.month.slice(0, 4);
    CAT_ORDER.forEach(cat => { catTotals[cat][y] += (m[cat] || 0); });
  });

  const catHead = document.getElementById('yoy-cat-thead');
  const catBody = document.getElementById('yoy-cat-tbody');
  if (catHead && catBody) {
    catHead.innerHTML = hdrRow;
    const activeCats = CAT_ORDER.filter(cat => years.some(y => catTotals[cat][y] > 0));
    catBody.innerHTML = activeCats.map(cat => {
      const cells = years.map((y, i) => {
        const val  = catTotals[cat][y];
        const prev = i > 0 ? catTotals[cat][years[i-1]] : null;
        return `<td class="num" style="padding:6px 8px">${val > 0 ? fmt(val) + yoyChg(val, prev) : '—'}</td>`;
      }).join('');
      return `<tr style="border-bottom:1px solid #0e2540"><td style="padding:6px 8px"><span class="badge b-${cat}">${CAT_LABEL[cat]}</span></td>${cells}</tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;background:#0a1e30;font-weight:600">
       <td style="padding:7px 8px;color:#e0f0ff">الإجمالي</td>
       ${years.map((y, i) => {
         const tot  = yearTotals[y];
         const prev = i > 0 ? yearTotals[years[i-1]] : null;
         return `<td class="num" style="padding:7px 8px;color:#e0f0ff">${fmt(tot)}${yoyChg(tot, prev)}</td>`;
       }).join('')}
     </tr>`;
  }
}
