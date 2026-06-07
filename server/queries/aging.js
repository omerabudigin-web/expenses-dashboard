'use strict';
const sql = require('mssql');
const { getPool } = require('../db');

/* ── FIFO aging with optional AP netting ── */
function ageBucket(days) {
  if (days <=   7) return 'b1_7';
  if (days <=  14) return 'b8_14';
  if (days <=  30) return 'b15_30';
  if (days <=  60) return 'b31_60';
  if (days <=  90) return 'b61_90';
  if (days <= 120) return 'b91_120';
  return 'bOver120';
}
function daysBetween(d, asOf) {
  return Math.max(0, Math.floor(
    (new Date(asOf + 'T00:00:00') - new Date(d + 'T00:00:00')) / 86400000
  ));
}

function computeFIFO(arMovements, apCredit, asOf) {
  const open = [];
  let creditPool = 0;

  for (const [, date, dr, cr] of arMovements) {
    if (dr > 0.001) {
      let nd = dr;
      if (creditPool > 0.001) {
        if (creditPool >= nd - 0.001) { creditPool -= nd; nd = 0; }
        else { nd -= creditPool; creditPool = 0; }
      }
      if (nd > 0.001) open.push({ date, rem: nd });
    }
    if (cr > 0.001) {
      let rem = cr, i = 0;
      while (rem > 0.001 && i < open.length) {
        if (open[i].rem <= rem + 0.001) { rem -= open[i].rem; open[i].rem = 0; }
        else { open[i].rem -= rem; rem = 0; }
        i++;
      }
      if (rem > 0.001) creditPool += rem;
    }
  }

  const effectiveAP = Math.max(0, (apCredit || 0) - creditPool);
  if (effectiveAP > 0.001) {
    let rem = effectiveAP;
    for (const d of open) {
      if (rem <= 0.001) break;
      if (d.rem <= rem + 0.001) { rem -= d.rem; d.rem = 0; }
      else { d.rem -= rem; rem = 0; }
    }
  }

  const aged = { b1_7:0, b8_14:0, b15_30:0, b31_60:0, b61_90:0, b91_120:0, bOver120:0 };
  let balance = 0;
  for (const d of open) {
    if (d.rem < 0.001) continue;
    aged[ageBucket(daysBetween(d.date, asOf))] += d.rem;
    balance += d.rem;
  }
  balance -= creditPool;
  return { balance, ...aged };
}

function r2(n) { return Math.round(n * 100) / 100; }

async function getAgingData(dbName, asOfDate) {
  const pool = await getPool(dbName);

  /* Fetch all data in parallel */
  const [smRes, custRes, arMovRes, linkRes] = await Promise.all([
    pool.request().query(
      `SELECT Id AS SellerId, NameAr AS SellerName FROM dbo.SalesMan ORDER BY Id`
    ),
    pool.request().query(`
      SELECT c.Id AS CustomerId, c.NameAr AS CustomerName,
             ISNULL(c.SalesMan, 0) AS SellerId,
             c.LimitDays AS CreditDays, c.BalanceLimit AS CreditLimit
      FROM dbo.Customer c ORDER BY c.Id
    `),
    pool.request().input('asOf', sql.Date, asOfDate).query(`
      SELECT jd.Customer AS CustomerId,
             CONVERT(varchar(10), jvh.TransactionDate, 120) AS TxDate,
             jd.Debit, jd.Credit
      FROM dbo.JournalVoucherDetail  jd
      JOIN dbo.JournalVoucherHeader  jvh ON jvh.ID = jd.HeaderID
      WHERE jd.AccountChart IN (47, 48)
        AND jd.Customer IS NOT NULL AND jd.Customer > 0
        AND CAST(jvh.TransactionDate AS DATE) <= @asOf
      ORDER BY jd.Customer, jvh.TransactionDate ASC, jd.ID ASC
    `),
    pool.request().query(`
      SELECT csl.Customer, csl.Supplier,
             c.NameAr AS CustomerName, s.NameAr AS SupplierName
      FROM dbo.CustomerSupplierLink csl
      LEFT JOIN dbo.Customer c ON c.Id = csl.Customer
      LEFT JOIN dbo.Supplier s ON s.Id = csl.Supplier
    `),
  ]);

  /* AP movements for each linked supplier */
  const apMovMap = new Map();
  for (const row of linkRes.recordset) {
    const sup = row.Supplier;
    if (apMovMap.has(sup)) continue;
    const apRes = await pool.request()
      .input('supId', sql.SmallInt, sup)
      .input('asOf',  sql.Date,     asOfDate)
      .query(`
        SELECT CONVERT(varchar(10), jvh.TransactionDate, 120) AS TxDate,
               jd.Debit, jd.Credit
        FROM dbo.JournalVoucherDetail  jd
        JOIN dbo.JournalVoucherHeader  jvh ON jvh.ID = jd.HeaderID
        JOIN dbo.AccountChart          ac  ON ac.ID  = jd.AccountChart
        WHERE jd.Supplier = @supId
          AND ac.Code LIKE '20101%'
          AND CAST(jvh.TransactionDate AS DATE) <= @asOf
        ORDER BY jvh.TransactionDate ASC, jd.ID ASC
      `);
    apMovMap.set(sup, apRes.recordset.map(r => [sup, r.TxDate, +r.Debit||0, +r.Credit||0]));
  }

  /* Index data */
  const arMap       = new Map();
  for (const m of arMovRes.recordset) {
    const cid = m.CustomerId;
    if (!arMap.has(cid)) arMap.set(cid, []);
    arMap.get(cid).push([cid, m.TxDate, +m.Debit||0, +m.Credit||0]);
  }

  const custToSupp = new Map(linkRes.recordset.map(r => [r.Customer, r.Supplier]));
  const linkedInfo = new Map(linkRes.recordset.map(r => [r.Customer, r.SupplierName]));

  const apBalanceMap = new Map();
  for (const [sid, movs] of apMovMap) {
    const net = movs.reduce((s, m) => s + (m[3]||0) - (m[2]||0), 0);
    apBalanceMap.set(sid, Math.max(0, net));
  }

  /* Build aged customers + netting details (all linked, incl. excluded) */
  const customers    = [];
  const nettingDetails = [];
  const totalBuckets = { b1_7:0, b8_14:0, b15_30:0, b31_60:0, b61_90:0, b91_120:0, bOver120:0 };
  let   totalBalance = 0;

  // Build custName map for netting details
  const custNameMap = new Map(custRes.recordset.map(c => [c.CustomerId, c.CustomerName]));

  for (const c of custRes.recordset) {
    const cid    = c.CustomerId;
    const arMovs = arMap.get(cid) || [];
    if (!arMovs.length) continue;

    const suppId   = custToSupp.get(cid);
    const apCredit = suppId != null ? (apBalanceMap.get(suppId) || 0) : 0;
    const isNetted = suppId != null;
    const rawARBal = arMovs.reduce((s, m) => s + (m[2]||0) - (m[3]||0), 0);

    // Collect netting detail regardless of final balance
    if (isNetted) {
      const rawApBal = (apMovMap.get(suppId) || []).reduce((s,m) => s+(m[3]||0)-(m[2]||0), 0);
      nettingDetails.push({
        customerId:   cid,
        customerName: c.CustomerName,
        supplierId:   suppId,
        supplierName: linkedInfo.get(cid) || '',
        arBalance:    r2(rawARBal),
        apBalance:    r2(Math.max(0, rawApBal)),
        netBalance:   r2(rawARBal - Math.max(0, rawApBal)),
        included:     false,  // will set true if balance > 0 below
      });
    }

    const aged = computeFIFO(arMovs, apCredit, asOfDate);
    if (aged.balance < 0.01) continue;

    totalBalance += aged.balance;
    for (const k of Object.keys(totalBuckets)) totalBuckets[k] += aged[k];

    customers.push({
      code:         cid,
      name:         c.CustomerName,
      sellerId:     c.SellerId || 0,
      creditDays:   c.CreditDays  || 0,
      creditLimit:  +c.CreditLimit || 0,
      balance:      r2(aged.balance),
      b1_7:         r2(aged.b1_7),
      b8_14:        r2(aged.b8_14),
      b15_30:       r2(aged.b15_30),
      b31_60:       r2(aged.b31_60),
      b61_90:       r2(aged.b61_90),
      b91_120:      r2(aged.b91_120),
      bOver120:     r2(aged.bOver120),
      isNetted:     isNetted || undefined,
      arBalance:    isNetted ? r2(rawARBal) : undefined,
      apBalance:    isNetted ? r2(apCredit) : undefined,
      supplierName: isNetted ? linkedInfo.get(cid) : undefined,
    });

    // Mark as included in final report
    if (isNetted) {
      const nd = nettingDetails.find(d => d.customerId === cid);
      if (nd) nd.included = true;
    }
  }

  customers.sort((a, b) => b.balance - a.balance);

  return {
    asOfDate,
    db: dbName,
    sellers:        smRes.recordset.map(s => ({ id: s.SellerId, name: s.SellerName })),
    customers,
    nettingDetails, // كل الجهات المرتبطة شاملةً المستبعَدة
    totals: {
      count:    customers.length,
      balance:  r2(totalBalance),
      b1_7:     r2(totalBuckets.b1_7),
      b8_14:    r2(totalBuckets.b8_14),
      b15_30:   r2(totalBuckets.b15_30),
      b31_60:   r2(totalBuckets.b31_60),
      b61_90:   r2(totalBuckets.b61_90),
      b91_120:  r2(totalBuckets.b91_120),
      bOver120: r2(totalBuckets.bOver120),
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   SUPPLIER AGING — إعمار أرصدة الموردين
   FIFO for AP: Credits = invoices received (we owe), Debits = payments made
   Netting: linked customer AR balance reduces what we owe to the supplier
══════════════════════════════════════════════════════════════════════════ */
function computeSupplierFIFO(apMovements, arNetting, asOf) {
  const open = [];
  let payPool = 0; // prepayments with no invoice yet

  for (const [, date, dr, cr] of apMovements) {
    // cr = invoice received → we owe (like AR debit)
    if (cr > 0.001) {
      let nc = cr;
      if (payPool > 0.001) {
        if (payPool >= nc - 0.001) { payPool -= nc; nc = 0; }
        else { nc -= payPool; payPool = 0; }
      }
      if (nc > 0.001) open.push({ date, rem: nc });
    }
    // dr = payment made → reduces oldest invoice (like AR credit)
    if (dr > 0.001) {
      let rem = dr, i = 0;
      while (rem > 0.001 && i < open.length) {
        if (open[i].rem <= rem + 0.001) { rem -= open[i].rem; open[i].rem = 0; }
        else { open[i].rem -= rem; rem = 0; }
        i++;
      }
      if (rem > 0.001) payPool += rem;
    }
  }

  // Apply AR netting: linked customer's AR balance reduces oldest AP invoices
  const effectiveAR = Math.max(0, (arNetting || 0) - payPool);
  if (effectiveAR > 0.001) {
    let rem = effectiveAR;
    for (const d of open) {
      if (rem <= 0.001) break;
      if (d.rem <= rem + 0.001) { rem -= d.rem; d.rem = 0; }
      else { d.rem -= rem; rem = 0; }
    }
  }

  const aged = { b1_7:0, b8_14:0, b15_30:0, b31_60:0, b61_90:0, b91_120:0, bOver120:0 };
  let balance = 0;
  for (const d of open) {
    if (d.rem < 0.001) continue;
    aged[ageBucket(daysBetween(d.date, asOf))] += d.rem;
    balance += d.rem;
  }
  balance -= payPool;
  return { balance, ...aged };
}

async function getSupplierAgingData(dbName, asOfDate) {
  const pool = await getPool(dbName);

  const [suppRes, catRes, apMovRes, linkRes] = await Promise.all([
    pool.request().query(`
      SELECT s.Id AS SupplierId, s.NameAr AS SupplierName,
             ISNULL(s.Category, 0) AS CategoryId,
             ISNULL(cat.NameAr, '—') AS CategoryName,
             s.LimitDays AS CreditDays,
             s.BalanceLimit AS CreditLimit
      FROM dbo.Supplier s
      LEFT JOIN dbo.SupplierCategory cat ON cat.Id = s.Category
      ORDER BY s.Id
    `),
    pool.request().query(`
      SELECT Id AS CatId, NameAr AS CatName
      FROM dbo.SupplierCategory
      WHERE Id > 1
      ORDER BY Id
    `),
    pool.request().input('asOf', sql.Date, asOfDate).query(`
      SELECT jd.Supplier AS SupplierId,
             CONVERT(varchar(10), jvh.TransactionDate, 120) AS TxDate,
             jd.Debit, jd.Credit
      FROM dbo.JournalVoucherDetail  jd
      JOIN dbo.JournalVoucherHeader  jvh ON jvh.ID = jd.HeaderID
      JOIN dbo.AccountChart          ac  ON ac.ID  = jd.AccountChart
      WHERE ac.Code LIKE '20101%'
        AND jd.Supplier IS NOT NULL AND jd.Supplier > 0
        AND CAST(jvh.TransactionDate AS DATE) <= @asOf
      ORDER BY jd.Supplier, jvh.TransactionDate ASC, jd.ID ASC
    `),
    pool.request().query(`
      SELECT csl.Supplier, csl.Customer,
             c.NameAr AS CustomerName, s.NameAr AS SupplierName
      FROM dbo.CustomerSupplierLink csl
      LEFT JOIN dbo.Customer c ON c.Id  = csl.Customer
      LEFT JOIN dbo.Supplier s ON s.Id  = csl.Supplier
    `),
  ]);

  // AR movements for each linked customer (to apply netting against AP)
  const arBalMap = new Map(); // supplierId → AR net balance of linked customer
  const custNettingMap = new Map(); // supplierId → { customerName, arBalance }
  for (const row of linkRes.recordset) {
    const sid = row.Supplier, cid = row.Customer;
    const arRes = await pool.request()
      .input('cid',  sql.SmallInt, cid)
      .input('asOf', sql.Date,     asOfDate)
      .query(`
        SELECT SUM(jd.Debit - jd.Credit) AS arBal
        FROM dbo.JournalVoucherDetail  jd
        JOIN dbo.JournalVoucherHeader  jvh ON jvh.ID = jd.HeaderID
        WHERE jd.AccountChart IN (47, 48) AND jd.Customer = @cid
          AND CAST(jvh.TransactionDate AS DATE) <= @asOf
      `);
    const arBal = Math.max(0, +arRes.recordset[0]?.arBal || 0);
    arBalMap.set(sid, arBal);
    custNettingMap.set(sid, { customerName: row.CustomerName, arBalance: arBal });
  }

  // Index AP movements per supplier
  const apMap = new Map();
  for (const m of apMovRes.recordset) {
    const sid = m.SupplierId;
    if (!apMap.has(sid)) apMap.set(sid, []);
    apMap.get(sid).push([sid, m.TxDate, +m.Debit||0, +m.Credit||0]);
  }

  // Build aged suppliers
  const suppliers    = [];
  const nettingDetails = [];
  const totalBuckets = { b1_7:0, b8_14:0, b15_30:0, b31_60:0, b61_90:0, b91_120:0, bOver120:0 };
  let   totalBalance  = 0;

  for (const s of suppRes.recordset) {
    const sid    = s.SupplierId;
    const apMovs = apMap.get(sid) || [];
    if (!apMovs.length) continue;

    const isNetted  = arBalMap.has(sid);
    const arNetting = isNetted ? (arBalMap.get(sid) || 0) : 0;
    const rawAPBal  = apMovs.reduce((sum, m) => sum + (m[3]||0) - (m[2]||0), 0);

    if (isNetted) {
      nettingDetails.push({
        supplierId:   sid,
        supplierName: s.SupplierName,
        customerId:   linkRes.recordset.find(r => r.Supplier === sid)?.Customer,
        customerName: custNettingMap.get(sid)?.customerName || '',
        apBalance:    r2(Math.max(0, rawAPBal)),
        arBalance:    r2(arNetting),
        netBalance:   r2(Math.max(0, rawAPBal) - arNetting),
        included:     false,
      });
    }

    const aged = computeSupplierFIFO(apMovs, arNetting, asOfDate);
    if (aged.balance < 0.01) continue;

    totalBalance += aged.balance;
    for (const k of Object.keys(totalBuckets)) totalBuckets[k] += aged[k];

    if (isNetted) {
      const nd = nettingDetails.find(d => d.supplierId === sid);
      if (nd) nd.included = true;
    }

    suppliers.push({
      code:         sid,
      name:         s.SupplierName,
      categoryId:   s.CategoryId,
      categoryName: s.CategoryName,
      creditDays:   s.CreditDays  || 0,
      creditLimit:  +s.CreditLimit || 0,
      balance:      r2(aged.balance),
      b1_7:         r2(aged.b1_7),
      b8_14:        r2(aged.b8_14),
      b15_30:       r2(aged.b15_30),
      b31_60:       r2(aged.b31_60),
      b61_90:       r2(aged.b61_90),
      b91_120:      r2(aged.b91_120),
      bOver120:     r2(aged.bOver120),
      isNetted:     isNetted || undefined,
      apBalance:    isNetted ? r2(Math.max(0, rawAPBal)) : undefined,
      arBalance:    isNetted ? r2(arNetting) : undefined,
      customerName: isNetted ? custNettingMap.get(sid)?.customerName : undefined,
    });
  }

  suppliers.sort((a, b) => b.balance - a.balance);

  return {
    asOfDate,
    db: dbName,
    categories:     catRes.recordset.map(c => ({ id: c.CatId, name: c.CatName })),
    suppliers,
    nettingDetails,
    totals: {
      count:    suppliers.length,
      balance:  r2(totalBalance),
      b1_7:     r2(totalBuckets.b1_7),
      b8_14:    r2(totalBuckets.b8_14),
      b15_30:   r2(totalBuckets.b15_30),
      b31_60:   r2(totalBuckets.b31_60),
      b61_90:   r2(totalBuckets.b61_90),
      b91_120:  r2(totalBuckets.b91_120),
      bOver120: r2(totalBuckets.bOver120),
    },
  };
}

module.exports = { getAgingData, getSupplierAgingData };
