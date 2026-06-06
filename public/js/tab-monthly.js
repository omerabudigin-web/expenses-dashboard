// ── MONTHLY tab ───────────────────────────────────────────────────────────────
function renderMonthlyTab() {
  buildPeriodOptions('mo-period-sel', true);
  const period    = (document.getElementById('mo-period-sel') || {}).value || 'all';
  const monthly   = filterMonthly(period);
  const catFilter = (document.getElementById('mo-cat-sel') || {}).value || 'all';
  renderMonthlyChart(monthly, catFilter);
  const grandT = {}; CAT_ORDER.forEach(c => { grandT[c] = 0; });
  monthly.forEach(m => CAT_ORDER.forEach(c => { grandT[c] += (m[c]||0); }));
  const grand = CAT_ORDER.reduce((s, c) => s + grandT[c], 0);
  document.getElementById('mo-tbody').innerHTML =
    monthly.map(m => {
      const t = monthTotal(m);
      return `<tr><td>${m.label}</td>${CAT_ORDER.map(c => `<td class="num">${m[c] ? fmt(m[c]) : ''}</td>`).join('')}<td class="num"><strong>${fmt(t)}</strong></td></tr>`;
    }).join('') +
    `<tr style="border-top:2px solid #3a5a7a;font-weight:600"><td>الإجمالي</td>${CAT_ORDER.map(c => `<td class="num">${fmt(grandT[c])}</td>`).join('')}<td class="num">${fmt(grand)}</td></tr>`;
}
