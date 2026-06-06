// ── DETAILS tab ───────────────────────────────────────────────────────────────
function initDetails() {
  document.getElementById('det-search').addEventListener('input',  function(e) { State.set('detSearch', e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-cat').addEventListener('change',    function(e) { State.set('detCat',    e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-br').addEventListener('change',     function(e) { State.set('detBr',     e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-period').addEventListener('change', function(e) { State.set('detPeriod', e.target.value); State.set('detPage', 1); API.fetchDetails(); });
  document.getElementById('det-csv').addEventListener('click', exportCSV);
  document.querySelectorAll('#tab-details th[data-col]').forEach(th => {
    th.addEventListener('click', function() {
      const col  = +th.dataset.col;
      const sort = State.get('detSort');
      State.set('detSort', { col, dir: sort.col === col ? (sort.dir === 'asc' ? 'desc' : 'asc') : 'desc' });
      State.set('detPage', 1);
      API.fetchDetails();
    });
  });
}

function renderDetails() {
  buildPeriodOptions('det-period', false);
  const rows     = State.get('detailRows');
  const total    = State.get('detailTotal');
  const page     = State.get('detailPage');
  const pageSize = State.get('detPageSize');
  const pages    = Math.ceil(total / pageSize) || 1;

  document.getElementById('det-tbody').innerHTML = rows.map(d =>
    `<tr><td>${d[0]}</td>`
    + `<td><span class="badge b-${d[1]}">${CAT_LABEL[d[1]] || d[1]}</span></td>`
    + `<td style="font-family:monospace;font-size:.75rem">${esc(d[6])}</td>`
    + `<td>${esc(d[7])}</td>`
    + `<td>${BRANCH_LABEL[d[3]] || esc(d[3])}</td>`
    + `<td>${esc(d[4] || '')}</td>`
    + `<td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(d[5])}">${esc(d[5])}</td>`
    + `<td class="num">${fmt(d[2],2)}</td></tr>`
  ).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد نتائج</td></tr>';

  const pDiv = document.getElementById('det-pages');
  const btns = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) {
      btns.push(`<button class="page-btn${p === page ? ' active' : ''}" onclick="goPage(${p})">${p}</button>`);
    } else if (btns[btns.length - 1] !== '…') {
      btns.push('…');
    }
  }
  pDiv.innerHTML = btns.join('');
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to   = Math.min(page * pageSize, total);
  document.getElementById('det-count').textContent = `عرض ${from}–${to} من ${total.toLocaleString('ar-SA')} قيد`;
}

window.goPage = function(p) { State.set('detPage', p); API.fetchDetails(); };

async function exportCSV() {
  const total = State.get('detailTotal') || 0;
  const sort  = State.get('detSort');
  const qs    = new URLSearchParams({
    db:      State.get('activeDb') || '',
    page:    1,
    pageSize: Math.min(total, 10000),
    cat:     State.get('detCat'),
    branch:  State.get('detBr'),
    period:  State.get('detPeriod'),
    search:  State.get('detSearch'),
    sortCol: sort.col,
    sortDir: sort.dir,
  });
  let rows = State.get('detailRows');
  if (total > rows.length) {
    try {
      const res  = await fetch(`/api/details?${qs}`);
      const data = await res.json();
      rows = data.rows;
    } catch (e) { console.error('[csv] fetch error:', e); }
  }
  const hdr   = ['التاريخ','الفئة','المبلغ','الفرع','الأصل','الوصف','كود الحساب','اسم الحساب'];
  const lines = [hdr.join(',')].concat(rows.map(d => [
    d[0], CAT_LABEL[d[1]] || d[1], d[2], BRANCH_LABEL[d[3]] || d[3],
    `"${(d[4]||'').replace(/"/g,'""')}"`,
    `"${(d[5]||'').replace(/"/g,'""')}"`,
    d[6], `"${(d[7]||'').replace(/"/g,'""')}"`
  ].join(',')));
  const blob  = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = 'expenses_details.csv'; a.click();
  URL.revokeObjectURL(url);
}
