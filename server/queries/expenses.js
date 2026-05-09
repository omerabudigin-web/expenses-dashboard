'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// Shared WHERE — excludes revenue/contra accounts, only debit entries since @startDate
const BASE_WHERE = `
  ac.Code LIKE '4%'
  AND ac.Code NOT LIKE '40101010%'
  AND ac.Code NOT LIKE '40101020%'
  AND jd.Debit > 0
  AND h.TransactionDate >= @startDate
`;

// Maps AccountChart.Code prefix → category key
function catFromCode(code) {
  if (!code) return 'oth';
  const c = String(code).trim();
  if (c.startsWith('4010201')) return 'sell';
  if (c.startsWith('4010301')) return 'dist';
  if (c.startsWith('4020101') || c.startsWith('4020102') || c.startsWith('4020104')) return 'sal';
  if (c.startsWith('4020105')) return 'rent';
  if (c.startsWith('4020106') || c.startsWith('4020107') ||
      c.startsWith('4020108') || c.startsWith('4020111')) return 'adm';
  if (c.startsWith('4020109') || c.startsWith('4020110')) return 'maint';
  if (c.startsWith('4020115')) return 'char';
  if (c.startsWith('4020118')) return 'fin';
  return 'oth';
}

// Reverse map: category → SQL fragment for WHERE filtering
function catToSqlClause(cat) {
  const map = {
    sal:  `(ac.Code LIKE '4020101%' OR ac.Code LIKE '4020102%' OR ac.Code LIKE '4020104%')`,
    rent: `ac.Code LIKE '4020105%'`,
    maint:`(ac.Code LIKE '4020109%' OR ac.Code LIKE '4020110%')`,
    sell: `ac.Code LIKE '4010201%'`,
    dist: `ac.Code LIKE '4010301%'`,
    adm:  `(ac.Code LIKE '4020106%' OR ac.Code LIKE '4020107%' OR ac.Code LIKE '4020108%' OR ac.Code LIKE '4020111%')`,
    char: `ac.Code LIKE '4020115%'`,
    fin:  `ac.Code LIKE '4020118%'`,
    oth:  `ac.Code LIKE '4020117%'`,
  };
  return map[cat] || null;
}

// Company name from companyInformation table
async function getCompanyName(dbName) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .query(`SELECT TOP 1 NameAr FROM companyInformation ORDER BY Id`);
  return (res.recordset[0] && (res.recordset[0].NameAr || '').trim()) || '';
}

// Monthly totals by category — ported from generate_report.js lines 49-73
async function getMonthly(dbName, startDate) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .input('startDate', sql.Date, startDate)
    .query(`
      SELECT
        YEAR(h.TransactionDate)  AS Yr,
        MONTH(h.TransactionDate) AS Mo,
        SUM(CASE WHEN ac.Code LIKE '4020101%' OR ac.Code LIKE '4020102%'
                      OR ac.Code LIKE '4020104%' THEN jd.Debit ELSE 0 END) AS sal,
        SUM(CASE WHEN ac.Code LIKE '4020105%'   THEN jd.Debit ELSE 0 END) AS rent,
        SUM(CASE WHEN ac.Code LIKE '4020109%'
                      OR ac.Code LIKE '4020110%' THEN jd.Debit ELSE 0 END) AS maint,
        SUM(CASE WHEN ac.Code LIKE '4010201%'   THEN jd.Debit ELSE 0 END) AS sell,
        SUM(CASE WHEN ac.Code LIKE '4010301%'   THEN jd.Debit ELSE 0 END) AS dist,
        SUM(CASE WHEN ac.Code LIKE '4020106%' OR ac.Code LIKE '4020107%'
                      OR ac.Code LIKE '4020108%'
                      OR ac.Code LIKE '4020111%' THEN jd.Debit ELSE 0 END) AS adm,
        SUM(CASE WHEN ac.Code LIKE '4020115%'   THEN jd.Debit ELSE 0 END) AS char_,
        SUM(CASE WHEN ac.Code LIKE '4020118%'   THEN jd.Debit ELSE 0 END) AS fin,
        SUM(CASE WHEN ac.Code LIKE '4020117%'   THEN jd.Debit ELSE 0 END) AS oth
      FROM JournalVoucherHeader h
      JOIN JournalVoucherDetail jd ON jd.HeaderID = h.ID
      JOIN AccountChart         ac ON ac.ID = jd.AccountChart
      WHERE ${BASE_WHERE}
      GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
      ORDER BY Yr, Mo
    `);

  return res.recordset.map(r => ({
    month: `${r.Yr}-${String(r.Mo).padStart(2,'0')}`,
    label: AR_MONTHS[r.Mo] + ' ' + String(r.Yr).slice(2),
    sal:  +r.sal   || 0, rent: +r.rent  || 0, maint: +r.maint || 0,
    sell: +r.sell  || 0, dist: +r.dist  || 0, adm:   +r.adm   || 0,
    fin:  +r.fin   || 0, char: +r.char_ || 0, oth:   +r.oth   || 0,
  }));
}

// Branch totals by month — ported from generate_report.js lines 77-89
async function getBranches(dbName, startDate) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .input('startDate', sql.Date, startDate)
    .query(`
      SELECT
        ISNULL(jd.Branch, 0)     AS Br,
        YEAR(h.TransactionDate)  AS Yr,
        MONTH(h.TransactionDate) AS Mo,
        SUM(jd.Debit)            AS Total
      FROM JournalVoucherHeader h
      JOIN JournalVoucherDetail jd ON jd.HeaderID = h.ID
      JOIN AccountChart         ac ON ac.ID = jd.AccountChart
      WHERE ${BASE_WHERE}
      GROUP BY ISNULL(jd.Branch,0), YEAR(h.TransactionDate), MONTH(h.TransactionDate)
      ORDER BY Yr, Mo, Br
    `);

  return res.recordset.map(r => ({
    br:    r.Br,
    month: `${r.Yr}-${String(r.Mo).padStart(2,'0')}`,
    total: +r.Total || 0,
  }));
}

// Account totals — ported from generate_report.js lines 92-103
async function getAccounts(dbName, startDate) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .input('startDate', sql.Date, startDate)
    .query(`
      SELECT ac.Code, ac.NameAr, SUM(jd.Debit) AS Total
      FROM JournalVoucherHeader h
      JOIN JournalVoucherDetail jd ON jd.HeaderID = h.ID
      JOIN AccountChart         ac ON ac.ID = jd.AccountChart
      WHERE ${BASE_WHERE}
      GROUP BY ac.Code, ac.NameAr
      ORDER BY Total DESC
    `);

  return res.recordset.map(r => ({
    code:  r.Code,
    name:  (r.NameAr || '').trim(),
    cat:   catFromCode(r.Code),
    total: +r.Total || 0,
  }));
}

// Asset/vehicle totals — new server-side aggregation (was client-side in static HTML)
async function getAssets(dbName, startDate) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .input('startDate', sql.Date, startDate)
    .query(`
      SELECT
        ISNULL(LTRIM(RTRIM(fa.NameAr)), N'غير مرتبط')                      AS AssetName,
        SUM(CASE WHEN ac.Code LIKE '4020110002%' THEN jd.Debit ELSE 0 END) AS MaintAmt,
        SUM(CASE WHEN ac.Code LIKE '4020110001%' THEN jd.Debit ELSE 0 END) AS FuelAmt,
        SUM(CASE
          WHEN ac.Code NOT LIKE '4020110001%' AND ac.Code NOT LIKE '4020110002%'
          THEN jd.Debit ELSE 0 END)                                         AS OtherAmt,
        COUNT(*)                                                             AS EntryCount
      FROM JournalVoucherHeader h
      JOIN JournalVoucherDetail jd ON jd.HeaderID = h.ID
      JOIN AccountChart         ac ON ac.ID = jd.AccountChart
      LEFT JOIN FixedAsset      fa ON fa.Id  = jd.FixedAsset
      WHERE ${BASE_WHERE}
        AND jd.FixedAsset IS NOT NULL
      GROUP BY ISNULL(LTRIM(RTRIM(fa.NameAr)), N'غير مرتبط')
      ORDER BY SUM(jd.Debit) DESC
    `);

  return res.recordset.map(r => ({
    name:  r.AssetName,
    maint: +r.MaintAmt || 0,
    fuel:  +r.FuelAmt  || 0,
    other: +r.OtherAmt || 0,
    total: (+r.MaintAmt||0) + (+r.FuelAmt||0) + (+r.OtherAmt||0),
    count: r.EntryCount,
  }));
}

// Paginated detail rows — adapted from generate_report.js lines 108-136
// Returns {rows: tuple[][], total, page, pageSize}
// Tuple format: [date, cat, amount, branch, asset, note, accCode, accName]  (indices 0-7)
async function getDetails(dbName, opts) {
  const {
    startDate,
    page      = 1,
    pageSize  = 50,
    cat       = '',
    branch    = '',
    period    = '',
    search    = '',
    sortCol   = '0',
    sortDir   = 'desc',
  } = opts;

  const offset = (Math.max(1, page) - 1) * pageSize;

  // Build dynamic WHERE additions
  const extras = [];
  const countReq = (await getPool(dbName)).request().input('startDate', sql.Date, startDate);
  const dataReq  = (await getPool(dbName)).request().input('startDate', sql.Date, startDate)
                                                     .input('offset',   sql.Int,  offset)
                                                     .input('pageSize', sql.Int,  pageSize);

  if (cat) {
    const clause = catToSqlClause(cat);
    if (clause) extras.push(clause);
  }
  if (branch !== '') {
    const brNum = parseInt(branch, 10);
    if (!isNaN(brNum)) {
      countReq.input('branch', sql.Int, brNum);
      dataReq.input('branch',  sql.Int, brNum);
      extras.push('ISNULL(jd.Branch,0) = @branch');
    }
  }
  if (period) {
    if (period.startsWith('year-')) {
      const yr = parseInt(period.slice(5), 10);
      countReq.input('periodYear', sql.Int, yr);
      dataReq.input('periodYear',  sql.Int, yr);
      extras.push('YEAR(h.TransactionDate) = @periodYear');
    } else {
      const parts = period.split('-');
      if (parts.length === 2) {
        countReq.input('periodYear', sql.Int, parseInt(parts[0], 10));
        countReq.input('periodMonth', sql.Int, parseInt(parts[1], 10));
        dataReq.input('periodYear',  sql.Int, parseInt(parts[0], 10));
        dataReq.input('periodMonth', sql.Int, parseInt(parts[1], 10));
        extras.push('YEAR(h.TransactionDate) = @periodYear AND MONTH(h.TransactionDate) = @periodMonth');
      }
    }
  }
  if (search) {
    const pattern = `%${search.slice(0, 100)}%`;
    countReq.input('search', sql.NVarChar(200), pattern);
    dataReq.input('search',  sql.NVarChar(200), pattern);
    extras.push(`(jd.Description LIKE @search OR h.Description LIKE @search OR ac.NameAr LIKE @search OR ISNULL(fa.NameAr,'') LIKE @search)`);
  }

  const extraWhere = extras.length ? 'AND ' + extras.join(' AND ') : '';

  // col 0=date, col 2=amount, col 6=accCode, col 7=accName
  const ORDER_MAP = { '0': 'h.TransactionDate', '2': 'jd.Debit', '6': 'ac.Code', '7': 'ac.NameAr' };
  const orderCol  = ORDER_MAP[String(sortCol)] || 'h.TransactionDate';
  const orderDir  = sortDir === 'asc' ? 'ASC' : 'DESC';

  const baseFrom = `
    FROM JournalVoucherHeader h
    JOIN JournalVoucherDetail jd ON jd.HeaderID = h.ID
    JOIN AccountChart         ac ON ac.ID = jd.AccountChart
    LEFT JOIN FixedAsset      fa ON fa.Id  = jd.FixedAsset
    WHERE ${BASE_WHERE} ${extraWhere}
  `;

  const [countRes, dataRes] = await Promise.all([
    countReq.query(`SELECT COUNT(*) AS Total ${baseFrom}`),
    dataReq.query(`
      SELECT
        CAST(h.TransactionDate AS DATE)     AS TxDate,
        ac.Code                             AS AccCode,
        ac.NameAr                           AS AccName,
        jd.Debit                            AS Amount,
        ISNULL(jd.Branch, 0)                AS Br,
        ISNULL(LTRIM(RTRIM(fa.NameAr)), '') AS Asset,
        CASE
          WHEN jd.Description IS NOT NULL AND LTRIM(RTRIM(jd.Description)) <> N''
            THEN LTRIM(RTRIM(jd.Description))
          WHEN h.Description IS NOT NULL AND LTRIM(RTRIM(h.Description)) <> N''
            THEN LTRIM(RTRIM(h.Description))
          WHEN h.ManualID IS NOT NULL AND h.ManualID NOT LIKE N'%افتراضي%'
            THEN N'سند ' + h.ManualID
          ELSE N'—'
        END AS Note
      ${baseFrom}
      ORDER BY ${orderCol} ${orderDir}, h.ID
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `),
  ]);

  const total = countRes.recordset[0].Total;
  const rows  = dataRes.recordset.map(r => [
    (r.TxDate instanceof Date ? r.TxDate : new Date(r.TxDate)).toISOString().slice(0,10),
    catFromCode(r.AccCode),
    +r.Amount || 0,
    r.Br || 0,
    (r.Asset  || '').trim(),
    (r.Note   || '—').trim(),
    r.AccCode || '',
    (r.AccName|| '').trim(),
  ]);

  return { rows, total, page, pageSize };
}

module.exports = { getMonthly, getBranches, getAccounts, getAssets, getDetails, getCompanyName };
