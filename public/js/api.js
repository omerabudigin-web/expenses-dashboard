'use strict';
const API = (() => {

  async function fetchDetails() {
    const sort = State.get('detSort');
    const qs   = new URLSearchParams({
      db:       State.get('activeDb') || '',
      page:     State.get('detPage'),
      pageSize: State.get('detPageSize'),
      cat:      State.get('detCat'),
      branch:   State.get('detBr'),
      period:   State.get('detPeriod'),
      search:   State.get('detSearch'),
      sortCol:  sort.col,
      sortDir:  sort.dir,
    });
    try {
      const res  = await fetch(`/api/details?${qs}`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      State.patch({
        detailRows:  data.rows,
        detailTotal: data.total,
        detailPage:  data.page,
      });
    } catch (err) {
      console.error('[api] fetchDetails:', err);
    }
  }

  async function fetchConfig() {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
    return res.json();
  }

  async function fetchConsolidated(dbs) {
    try {
      const res = await fetch(`/api/consolidated?dbs=${encodeURIComponent(dbs.join(','))}`);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    } catch (err) {
      console.error('[api] fetchConsolidated:', err);
      return null;
    }
  }

  return { fetchDetails, fetchConfig, fetchConsolidated };
})();
