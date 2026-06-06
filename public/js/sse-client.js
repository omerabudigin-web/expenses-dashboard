'use strict';
const SSEClient = (() => {
  let es             = null;
  let currentDb      = null;
  let reconnectDelay = 1000;
  let intentional    = false;
  const MAX_DELAY    = 32000;

  const snapshotCbs = [];
  const statusCbs   = [];

  function emit(list, payload) {
    list.forEach(fn => { try { fn(payload); } catch(e) { console.error(e); } });
  }

  function connect(dbName) {
    if (es) { intentional = true; es.close(); es = null; }
    currentDb = dbName;

    es = new EventSource(`/api/sse?db=${encodeURIComponent(dbName)}`);

    es.addEventListener('snapshot', e => {
      reconnectDelay = 1000;
      const data = JSON.parse(e.data);
      if (data.branchNames) Object.assign(BRANCH_LABEL, data.branchNames);
      State.patch({
        monthly:        data.monthly,
        branches:       data.branches,
        accounts:       data.accounts,
        assets:         data.assets,
        pl:             data.pl             || [],
        bs:             data.bs             || null,
        bankFacilities: data.bankFacilities || [],
        companyName:    data.companyName    || '',
        connected:      true,
        activeDb:       data.db,
        timestamp:      data.timestamp,
      });
      emit(snapshotCbs, data);
    });

    es.addEventListener('heartbeat', () => {
      reconnectDelay = 1000;
      State.set('connected', true);
      emit(statusCbs, { connected: true, db: currentDb });
    });

    es.addEventListener('status', e => {
      const data = JSON.parse(e.data);
      State.set('connected', data.connected);
      emit(statusCbs, data);
    });

    es.onerror = () => {
      if (intentional) { intentional = false; return; }
      es.close(); es = null;
      State.set('connected', false);
      emit(statusCbs, { connected: false, db: currentDb });
      setTimeout(() => connect(currentDb), reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    };
  }

  function switchDb(newDb) {
    reconnectDelay = 1000;
    connect(newDb);
    State.patch({
      activeDb:    newDb,
      connected:   false,
      companyName: '',
      monthly:     [],
      branches:    [],
      accounts:    [],
      assets:      [],
      pl:             [],
      bs:             null,
      bankFacilities: [],
      detailRows:   [],
      detailTotal:  0,
      detailPage:   1,
      detSearch:  '',
      detCat:     '',
      detBr:      '',
      detPeriod:  '',
    });
  }

  return {
    start:      db => connect(db),
    switchDb,
    onSnapshot: fn => snapshotCbs.push(fn),
    onStatus:   fn => statusCbs.push(fn),
    getCurrentDb: () => currentDb,
  };
})();
