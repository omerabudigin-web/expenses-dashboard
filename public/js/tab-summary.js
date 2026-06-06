// ── SUMMARY tab ───────────────────────────────────────────────────────────────
function initSummary() {
  document.getElementById('period-sel').addEventListener('change', function(e) { State.set('period', e.target.value); renderSummary(); });
  document.getElementById('cat-sel').addEventListener('change',   function(e) { State.set('cat',    e.target.value); renderSummary(); });
}

function renderSummary() {
  buildPeriodOptions('period-sel', true);
  let months = filterMonthly(State.get('period'));
  const cat  = State.get('cat');
  if (cat !== 'all') {
    months = months.map(m => {
      const n = Object.assign({}, m);
      CAT_ORDER.forEach(c => { if (c !== cat) n[c] = 0; });
      return n;
    });
  }
  renderKPIs(months);
  renderStackedBar(months);
  renderPie('chart-pie', 'pie', months);
  renderAnalysis(months);
}

// Convert a period selector value to { start, end } ISO-date strings for API calls
function periodToDateRange(period) {
  const y0 = CUR_Y();
  if (period === 'all' || !period) return { start: null, end: null };
  if (period === 'ytd')            return { start: `${y0}-01-01`, end: null };
  if (period.startsWith('year-')) {
    const y = period.slice(5);
    return { start: `${y}-01-01`, end: `${+y + 1}-01-01` };
  }
  if (period.startsWith('quarter-')) {
    const [, y, q] = period.split('-');
    const sm = (+q - 1) * 3 + 1;
    const em = sm + 3;
    return {
      start: `${y}-${String(sm).padStart(2,'0')}-01`,
      end:   em > 12 ? `${+y + 1}-01-01` : `${y}-${String(em).padStart(2,'0')}-01`,
    };
  }
  // single month 'YYYY-MM'
  const [y, m] = period.split('-');
  const em = +m + 1;
  return {
    start: `${y}-${m}-01`,
    end:   em > 12 ? `${+y + 1}-01-01` : `${y}-${String(em).padStart(2,'0')}-01`,
  };
}
