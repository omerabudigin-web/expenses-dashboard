'use strict';
require('dotenv').config();
const sql = require('mssql');

const DB_NAMES = [
  process.env.DB1_NAME,
  process.env.DB2_NAME,
  process.env.DB3_NAME,
].filter(Boolean);

const BASE_CONFIG = {
  server:   process.env.DB_SERVER   || 'MekSoftServer',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT, 10) || 1433,
  options: {
    encrypt:                process.env.DB_ENCRYPT    === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    connectTimeout:  20000,
    requestTimeout:  120000,
  },
  pool: { max: 3, min: 0, idleTimeoutMillis: 60000 },
};

// Map<dbName, sql.ConnectionPool>
const pools          = new Map();
const reconnectTimers = new Map();

async function _createPool(dbName) {
  const pool = new sql.ConnectionPool({ ...BASE_CONFIG, database: dbName });
  await pool.connect();
  pool.on('error', err => {
    console.error(`[db] pool error on ${dbName}:`, err.message);
    pools.delete(dbName);
    pool.close().catch(() => {});
    if (!reconnectTimers.has(dbName)) {
      const t = setTimeout(() => { reconnectTimers.delete(dbName); _reconnect(dbName); }, 10000);
      reconnectTimers.set(dbName, t);
    }
  });
  return pool;
}

async function _reconnect(dbName) {
  try {
    const pool = await _createPool(dbName);
    pools.set(dbName, pool);
    console.log(`[db] reconnected → ${dbName}`);
  } catch (err) {
    console.error(`[db] reconnect failed for ${dbName}:`, err.message);
    setTimeout(() => _reconnect(dbName), 15000);
  }
}

async function connectAll() {
  const results = await Promise.allSettled(
    DB_NAMES.map(async name => {
      const pool = await _createPool(name);
      pools.set(name, pool);
      console.log(`[db] connected → ${name}`);
    })
  );
  const ok = results.filter(r => r.status === 'fulfilled').length;
  if (ok === 0) console.error('[db] no databases reachable — server will retry on demand');
}

async function getPool(dbName) {
  if (!DB_NAMES.includes(dbName)) throw new Error(`Database "${dbName}" not in allowed list`);
  const existing = pools.get(dbName);
  if (existing && existing.connected) return existing;
  const pool = await _createPool(dbName);
  pools.set(dbName, pool);
  return pool;
}

function isConnected(dbName)  { const p = pools.get(dbName); return !!(p && p.connected); }
function getAvailableDbs()    { return DB_NAMES.map(name => ({ name, connected: isConnected(name) })); }
function getDefaultDb()       { return DB_NAMES[0] || null; }

async function closeAll() {
  await Promise.all([...pools.values()].map(p => p.close().catch(() => {})));
  pools.clear();
}

module.exports = { connectAll, getPool, isConnected, getAvailableDbs, getDefaultDb, DB_NAMES, closeAll };
