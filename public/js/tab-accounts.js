// ── ACCOUNTS tab ──────────────────────────────────────────────────────────────
function _renderAccountsData(accounts) {
  const grand = accounts.reduce((s, a) => s + a.total, 0);
  renderAccPie(accounts);
  const top8 = [...accounts].sort((a, b) => b.total - a.total).slice(0, 8);
  const maxV = top8[0] && top8[0].total || 1;
  document.getElementById('acc-bars').innerHTML = top8.map(a =>
    `<div class="prog-row"><div class="prog-label">${esc(a.name).slice(0,18)}</div>`
    + `<div class="prog-bar"><div class="prog-fill" style="width:${(a.total/maxV*100).toFixed(1)}%;background:${CAT_COLORS[a.cat]}"></div></div>`
    + `<div class="prog-val">${fmt(a.total)}</div></div>`
  ).join('');
  document.getElementById('acc-tbody').innerHTML = accounts.map(a =>
    `<tr><td style="font-family:monospace;font-size:.78rem">${esc(a.code)}</td><td>${esc(a.name)}</td>`
    + `<td><span class="badge b-${a.cat}">${CAT_LABEL[a.cat]}</span></td>`
    + `<td class="num">${fmt(a.total,2)}</td>`
    + `<td class="num">${fmtPct(grand ? a.total/grand*100 : 0)}</td></tr>`
  ).join('');
}

async function renderAccountsTab() {
  buildPeriodOptions('acc-period-sel', true);
  const period = (document.getElementById('acc-period-sel') || {}).value || 'all';
  if (period === 'all') {
    _renderAccountsData(State.get('accounts') || []);
    return;
  }
  const { start, end } = periodToDateRange(period);
  const db = State.get('activeDb') || '';
  const qs = new URLSearchParams({ db, start: start || '' });
  if (end) qs.set('end', end);
  try {
    const resp = await fetch(`/api/accounts?${qs}`);
    _renderAccountsData(await resp.json());
  } catch {
    _renderAccountsData(State.get('accounts') || []);
  }
}
