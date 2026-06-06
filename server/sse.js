'use strict';
const { getMonthly, getBranches, getAccounts, getAssets, getCompanyName, getBranchNames } = require('./queries/expenses');
const { getPLMonthly }    = require('./queries/pl');
const { getBSMonthly, getBankFacilitiesMonthly } = require('./queries/bs');

// Map<dbName, Set<res>>  — clients grouped by their selected DB
const clientsByDb = new Map();
// Map<dbName, string>    — last content hash per DB for dedup
const hashByDb    = new Map();
let   pollTimer   = null;

// ── Client management ──────────────────────────────────────────────────────────

function addClient(res, dbName) {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');

  if (!clientsByDb.has(dbName)) clientsByDb.set(dbName, new Set());
  clientsByDb.get(dbName).add(res);

  return () => {
    const set = clientsByDb.get(dbName);
    if (set) {
      set.delete(res);
      if (set.size === 0) clientsByDb.delete(dbName);
    }
  };
}

// ── Send helpers ───────────────────────────────────────────────────────────────

function send(res, set, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    set.delete(res);
  }
}

function broadcast(dbName, event, data) {
  const set = clientsByDb.get(dbName);
  if (!set) return;
  for (const c of set) send(c, set, event, data);
}

// ── Snapshot builder ───────────────────────────────────────────────────────────

async function fetchSnapshot(dbName, startDate) {
  const [monthly, branches, accounts, assets, companyName, branchNames, pl, bs, bankFacilities] = await Promise.all([
    getMonthly(dbName, startDate),
    getBranches(dbName, startDate),
    getAccounts(dbName, startDate),
    getAssets(dbName, startDate),
    getCompanyName(dbName),
    getBranchNames(dbName),
    getPLMonthly(dbName, startDate),
    getBSMonthly(dbName),
    getBankFacilitiesMonthly(dbName),
  ]);
  return { monthly, branches, accounts, assets, companyName, branchNames, pl, bs, bankFacilities };
}

// ── Push current data to a single newly-connected client ──────────────────────

async function pushToClient(res, dbName, startDate) {
  const set = clientsByDb.get(dbName) || new Set();
  try {
    const snap = await fetchSnapshot(dbName, startDate);
    send(res, set, 'snapshot', { ...snap, db: dbName, timestamp: new Date().toISOString(), connected: true });
  } catch (err) {
    console.error(`[sse] pushToClient error for ${dbName}:`, err.message);
    send(res, set, 'status', { connected: false, db: dbName, error: err.message });
  }
}

// ── Polling — runs only for DBs that have active clients ──────────────────────

async function poll(startDate) {
  for (const dbName of [...clientsByDb.keys()]) {
    try {
      const snap = await fetchSnapshot(dbName, startDate);
      const last = snap.monthly[snap.monthly.length - 1];
      const hash = `${snap.monthly.length}:${snap.branches.length}:${snap.accounts.length}:${snap.pl.length}:${
        last ? Object.values(last).filter(v => typeof v === 'number').reduce((s,v) => s+v, 0).toFixed(0) : '0'
      }`;

      if (hash !== hashByDb.get(dbName)) {
        hashByDb.set(dbName, hash);
        broadcast(dbName, 'snapshot', { ...snap, db: dbName, timestamp: new Date().toISOString(), connected: true });
      } else {
        broadcast(dbName, 'heartbeat', { ts: Date.now(), db: dbName });
      }
    } catch (err) {
      console.error(`[sse] poll error for ${dbName}:`, err.message);
      broadcast(dbName, 'status', { connected: false, db: dbName, error: err.message });
    }
  }
}

function startPolling(startDate, intervalMs) {
  const tick = async () => {
    try {
      await poll(startDate);
    } catch (err) {
      console.error('[sse] poll error:', err.message);
    } finally {
      pollTimer = setTimeout(tick, intervalMs);
    }
  };
  tick().catch(err => console.error('[sse] initial poll error:', err.message));
}

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

module.exports = { addClient, pushToClient, startPolling, stopPolling };
