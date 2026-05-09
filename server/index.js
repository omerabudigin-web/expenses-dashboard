'use strict';
require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const path    = require('path');

const { connectAll, getAvailableDbs, getDefaultDb, DB_NAMES, closeAll } = require('./db');
const { addClient, pushToClient, startPolling }               = require('./sse');
const { getDetails }                                          = require('./queries/expenses');

const app        = express();
const PORT       = parseInt(process.env.PORT, 10)             || 3001;
const POLL_MS    = parseInt(process.env.POLL_INTERVAL_MS, 10) || 60000;
const START_DATE = process.env.DATA_START_DATE                || '2025-10-01';

// ── Security headers ───────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc:     ["'self'", 'data:'],
        fontSrc:    ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.static(path.join(__dirname, '../public')));

// Validates and resolves the ?db= query param against the whitelist
function resolveDb(query) {
  const req = query.db;
  return (req && DB_NAMES.includes(req)) ? req : getDefaultDb();
}

// ── GET /api/config ────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    databases:      DB_NAMES,
    defaultDb:      getDefaultDb(),
    dataStartDate:  START_DATE,
    pollIntervalMs: POLL_MS,
  });
});

// ── GET /api/health ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ dbs: getAvailableDbs(), uptime: Math.floor(process.uptime()) });
});

// ── GET /api/sse?db= ───────────────────────────────────────────────────────────
app.get('/api/sse', (req, res) => {
  const dbName = resolveDb(req.query);
  const remove = addClient(res, dbName);
  pushToClient(res, dbName, START_DATE).catch(err =>
    console.error('[sse] pushToClient error:', err.message)
  );
  req.on('close', remove);
  res.on('error', remove);
});

// ── GET /api/details ──────────────────────────────────────────────────────────
app.get('/api/details', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const result = await getDetails(dbName, {
      startDate: START_DATE,
      page:      Math.max(1, parseInt(req.query.page, 10)     || 1),
      pageSize:  Math.min(10000, parseInt(req.query.pageSize,10)|| 50),
      cat:       req.query.cat    || '',
      branch:    req.query.branch || '',
      period:    req.query.period || '',
      search:    (req.query.search || '').slice(0, 100),
      sortCol:   req.query.sortCol || '0',
      sortDir:   req.query.sortDir === 'asc' ? 'asc' : 'desc',
    });
    res.json(result);
  } catch (err) {
    console.error('[api/details]', err.message);
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
async function start() {
  console.log('[app] connecting to databases …');
  await connectAll();

  app.listen(PORT, () => {
    console.log(`[app] expenses-dashboard → http://localhost:${PORT}`);
    console.log(`[app] polling every ${POLL_MS / 1000}s  |  data from ${START_DATE}`);
  });

  startPolling(START_DATE, POLL_MS);
}

function shutdown() {
  console.log('[app] shutting down…');
  closeAll().finally(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

start().catch(err => {
  console.error('[app] fatal startup error:', err.message);
  process.exit(1);
});
