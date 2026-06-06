// ── ASSETS tab ────────────────────────────────────────────────────────────────
async function renderAssetsTab() {
  buildPeriodOptions('asset-period-sel', true);
  const period = (document.getElementById('asset-period-sel') || {}).value || 'all';
  let assets;
  if (period === 'all') {
    assets = State.get('assets') || [];
  } else {
    const db = State.get('db');
    const { start, end } = periodToDateRange(period);
    try {
      const url = `/api/assets?db=${encodeURIComponent(db)}`
        + (start ? `&start=${start}` : '')
        + (end   ? `&end=${end}`     : '');
      const resp = await fetch(url);
      assets = resp.ok ? await resp.json() : [];
    } catch { assets = []; }
  }
  const totMaint = assets.reduce((s, r) => s + (r.maint || 0), 0);
  const totFuel  = assets.reduce((s, r) => s + (r.fuel  || 0), 0);
  const totOther = assets.reduce((s, r) => s + (r.other || 0), 0);
  const totTotal = assets.reduce((s, r) => s + (r.total || 0), 0);
  const totCount = assets.reduce((s, r) => s + (r.count || 0), 0);

  const rows = assets.map(r =>
    `<tr><td>${r.name}</td>`
    + `<td class="num">${r.maint ? fmt(r.maint,2) : ''}</td>`
    + `<td class="num">${r.fuel  ? fmt(r.fuel,2)  : ''}</td>`
    + `<td class="num">${r.other ? fmt(r.other,2) : ''}</td>`
    + `<td class="num"><strong>${fmt(r.total,2)}</strong></td>`
    + `<td class="num">${r.count}</td></tr>`
  ).join('');

  const totalRow = assets.length
    ? `<tr style="border-top:2px solid #3a5a7a;background:#081828;font-weight:700">`
      + `<td>الإجمالي</td>`
      + `<td class="num">${totMaint ? fmt(totMaint,2) : ''}</td>`
      + `<td class="num">${totFuel  ? fmt(totFuel,2)  : ''}</td>`
      + `<td class="num">${totOther ? fmt(totOther,2) : ''}</td>`
      + `<td class="num">${fmt(totTotal,2)}</td>`
      + `<td class="num">${totCount}</td></tr>`
    : '';

  document.getElementById('asset-tbody').innerHTML =
    rows
      ? rows + totalRow
      : '<tr><td colspan="6" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات أصول</td></tr>';
}
