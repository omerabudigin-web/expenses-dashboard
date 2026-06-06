'use strict';
const State = (() => {
  const _data = {
    // Aggregate data — populated by SSE snapshot
    monthly:     [],
    branches:    [],
    accounts:    [],
    assets:      [],
    pl:              [],
    bs:              null,
    bankFacilities:  [],
    companyName: '',
    // Details tab — populated by REST /api/details
    detailRows:   [],
    detailTotal:  0,
    detailPage:   1,
    // Connection status
    connected: false,
    activeDb:  null,
    timestamp: null,
    // Summary/Monthly filter state
    period: 'all',
    cat:    'all',
    // Details filter state
    detSearch:  '',
    detCat:     '',
    detBr:      '',
    detPeriod:  '',
    detPage:    1,
    detPageSize: 50,
    detSort:    { col: 0, dir: 'desc' },
  };

  const _subs = {};

  function set(key, value) {
    _data[key] = value;
    if (_subs[key]) _subs[key].forEach(fn => { try { fn(value); } catch(e) { console.error(e); } });
  }

  function get(key) { return _data[key]; }

  function patch(obj) { Object.entries(obj).forEach(([k, v]) => set(k, v)); }

  function on(key, fn) {
    if (!_subs[key]) _subs[key] = [];
    _subs[key].push(fn);
  }

  return { set, get, patch, on };
})();
