// ── BRANCHES tab ──────────────────────────────────────────────────────────────
function renderBranchesTab() {
  buildPeriodOptions('br-period-sel', true);
  const period   = (document.getElementById('br-period-sel') || {}).value || 'all';
  const monthly  = filterMonthly(period);
  const branches = State.get('branches');
  const brData   = renderBranchBar(monthly, branches);
  renderBranchPie(brData);
  if (!brData) return;
  const { brs, hasData, brTotals, pivot, months } = brData;
  const grandTotal = hasData.reduce((s, b) => s + brTotals[b], 0);

  // Update month column headers dynamically
  const brTheadRow = document.querySelector('#br-tbody')?.closest('table')?.querySelector('thead tr');
  if (brTheadRow) {
    brTheadRow.innerHTML = '<th>الفرع</th>'
      + months.map(mo => { const m = monthly.find(x => x.month === mo); return `<th class="num">${m ? m.label : mo}</th>`; }).join('')
      + '<th class="num">الإجمالي</th>';
  }

  document.getElementById('br-tbody').innerHTML =
    hasData.map(b =>
      `<tr><td>${BRANCH_LABEL[b]}</td>${months.map(mo => `<td class="num">${pivot[b][mo] ? fmt(pivot[b][mo]) : ''}</td>`).join('')}<td class="num"><strong>${fmt(brTotals[b])}</strong></td></tr>`
    ).join('') +
    `<tr style="border-top:2px solid #3a5a7a;font-weight:600"><td>الإجمالي</td>${months.map(mo => `<td class="num">${fmt(brs.reduce((s,b) => s+pivot[b][mo], 0))}</td>`).join('')}<td class="num">${fmt(grandTotal)}</td></tr>`;

  // ── Category breakdown pivot: rows=branches, cols=categories ──
  const CATS = CAT_ORDER; // ['sal','rent','maint','sell','dist','adm','fin','char','oth']

  // Aggregate branches data filtered to selected period months
  const filtMonths = new Set(monthly.map(m => m.month));
  const brCat = {}; // brCat[br][cat] = total
  (branches || []).forEach(r => {
    if (!filtMonths.has(r.month)) return;
    if (!brCat[r.br]) brCat[r.br] = {};
    CATS.forEach(cat => {
      brCat[r.br][cat] = (brCat[r.br][cat] || 0) + (r[cat] || 0);
    });
  });

  // Only show branches that have data
  const activeBrs = hasData.filter(b => brCat[b]);

  // Column totals across all branches
  const catTotals = {};
  CATS.forEach(cat => {
    catTotals[cat] = activeBrs.reduce((s, b) => s + (brCat[b]?.[cat] || 0), 0);
  });
  const catGrand = CATS.reduce((s, cat) => s + catTotals[cat], 0);

  // Build pivot table
  const thead = document.getElementById('br-cat-thead');
  const tbody = document.getElementById('br-cat-tbody');
  if (thead && tbody) {
    thead.innerHTML = `<tr>
      <th style="min-width:120px">الفرع</th>
      ${CATS.map(cat => `<th class="num" style="font-size:.74rem;white-space:nowrap">${CAT_LABEL[cat]}</th>`).join('')}
      <th class="num" style="font-weight:700">الإجمالي</th>
    </tr>`;

    const brTotal = b => CATS.reduce((s, cat) => s + (brCat[b]?.[cat] || 0), 0);

    tbody.innerHTML = activeBrs.map(b => {
      const tot = brTotal(b);
      return `<tr>
        <td style="font-weight:600;white-space:nowrap">${BRANCH_LABEL[b]}</td>
        ${CATS.map(cat => {
          const v = brCat[b]?.[cat] || 0;
          const pct = tot > 0 ? v / tot * 100 : 0;
          const barW = Math.min(100, pct).toFixed(1);
          return `<td class="num" style="position:relative;padding:6px 10px" title="${CAT_LABEL[cat]}: ${fmt(v)} ر.س (${pct.toFixed(1)}%)">
            ${v > 0 ? `<div style="position:absolute;bottom:0;right:0;height:3px;width:${barW}%;background:${CAT_COLORS[cat]};opacity:.5;border-radius:2px"></div>` : ''}
            <span style="color:${v > 0 ? CAT_COLORS[cat] : '#3a5a7a'}">${v > 0 ? fmt(v) : '—'}</span>
          </td>`;
        }).join('')}
        <td class="num" style="font-weight:700">${fmt(tot)}</td>
      </tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;background:#081828">
      <td style="font-weight:700">الإجمالي</td>
      ${CATS.map(cat => {
        const v = catTotals[cat];
        return `<td class="num" style="font-weight:600;color:${v > 0 ? '#c8e0f0' : '#3a5a7a'}">${v > 0 ? fmt(v) : '—'}</td>`;
      }).join('')}
      <td class="num" style="font-weight:700">${fmt(catGrand)}</td>
    </tr>`;
  }

  // ── Per-branch category mini-bar charts ──
  const chartsEl = document.getElementById('br-cat-charts');
  if (chartsEl) {
    chartsEl.innerHTML = activeBrs.map(b => {
      const tot = CATS.reduce((s, cat) => s + (brCat[b]?.[cat] || 0), 0);
      const bars = CATS
        .map(cat => ({ cat, v: brCat[b]?.[cat] || 0 }))
        .filter(x => x.v > 0)
        .sort((a, c) => c.v - a.v);
      return `<div style="background:#0a1e34;border-radius:10px;padding:14px 16px;border:1px solid #1e3a5f">
        <div style="font-weight:600;color:#c8e0f8;margin-bottom:10px;font-size:.84rem">${BRANCH_LABEL[b]}</div>
        <div style="font-size:.76rem;color:#5a7a9a;margin-bottom:8px">إجمالي: <strong style="color:#7ac8f0">${fmt(tot)} ر.س</strong></div>
        ${bars.map(x => {
          const pct = tot > 0 ? x.v / tot * 100 : 0;
          return `<div style="margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:.73rem">
              <span style="color:#8ab0cc">${CAT_LABEL[x.cat]}</span>
              <span style="color:${CAT_COLORS[x.cat]};font-variant-numeric:tabular-nums">${fmt(x.v)}</span>
            </div>
            <div style="background:#0e2540;border-radius:3px;height:5px">
              <div style="background:${CAT_COLORS[x.cat]};height:5px;border-radius:3px;width:${pct.toFixed(1)}%"></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  }
}
