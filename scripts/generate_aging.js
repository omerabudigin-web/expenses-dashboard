'use strict';
/**
 * generate_aging.js  —  إعمار أرصدة العملاء مع مقاصة عميل/مورد
 *
 * المنهجية:
 *   1. AR FIFO لكل عميل من قيود اليومية (AccountChart IN 47,48)
 *   2. مقاصة: للجهات في CustomerSupplierLink، يُطبَّق رصيد المورد (AP)
 *      كدائن إضافي على أقدم المديونيات (FIFO) — مطابقاً لمتغيّر «رابط المورد»
 *   3. الصافي السالب/الصفري يُستبعد
 *
 * الاستخدام: node scripts/generate_aging.js [YYYY-MM-DD]
 */

const path = require('path');
const fs   = require('fs');
const sql  = require('mssql');
const { getPool, connectAll } = require('../server/db');

const asOfDate = process.argv[2] || new Date().toISOString().slice(0, 10);
console.log(`[aging] as-of: ${asOfDate}`);

const OUTPUT = path.join(__dirname, '..', 'public', 'Customer_Aging_BySalesperson.html');

/* ── Age buckets ── */
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

/* ── FIFO with optional AP netting ──
   arMovements : [[cid, date, dr, cr], ...]
   apCredit    : net AP balance to apply after AR FIFO (≥ 0)
*/
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

  /* Apply AP netting credit (oldest first) */
  const effectiveAP = Math.max(0, (apCredit || 0) - creditPool);
  if (effectiveAP > 0.001) {
    let rem = effectiveAP;
    for (const d of open) {
      if (rem <= 0.001) break;
      if (d.rem <= rem + 0.001) { rem -= d.rem; d.rem = 0; }
      else { d.rem -= rem; rem = 0; }
    }
  }

  /* Age remaining open debits */
  const aged = { b1_7:0, b8_14:0, b15_30:0, b31_60:0, b61_90:0, b91_120:0, bOver120:0 };
  let balance = 0;
  for (const d of open) {
    if (d.rem < 0.001) continue;
    aged[ageBucket(daysBetween(d.date, asOf))] += d.rem;
    balance += d.rem;
  }
  balance -= creditPool; // deduct excess AR credits
  return { balance, ...aged };
}

function r2(n) { return Math.round(n * 100) / 100; }

/* ── Fetch all data ── */
async function fetchAll(pool) {
  const [smRes, custRes, arMovRes, linkRes] = await Promise.all([
    pool.request().query(
      `SELECT Id AS SellerId, NameAr AS SellerName FROM dbo.SalesMan ORDER BY Id`
    ),
    pool.request().query(`
      SELECT c.Id AS CustomerId, c.NameAr AS CustomerName,
             ISNULL(c.SalesMan,0) AS SellerId,
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
      SELECT csl.Customer, csl.Supplier, csl.ShowAsSupplier,
             c.NameAr AS CustomerName, s.NameAr AS SupplierName
      FROM CustomerSupplierLink csl
      LEFT JOIN Customer c ON c.Id = csl.Customer
      LEFT JOIN Supplier s ON s.Id = csl.Supplier
    `),
  ]);

  // Fetch AP movements for each linked supplier
  const apMovMap = new Map(); // supplierId → [[sid, date, dr, cr], ...]
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

  return {
    sellers:     smRes.recordset,
    customers:   custRes.recordset,
    arMovements: arMovRes.recordset,
    links:       linkRes.recordset,
    apMovMap,
  };
}

/* ── Build aging data ── */
function buildAging(raw) {
  /* Index AR movements per customer */
  const arMap = new Map();
  for (const m of raw.arMovements) {
    const cid = m.CustomerId;
    if (!arMap.has(cid)) arMap.set(cid, []);
    arMap.get(cid).push([cid, m.TxDate, +m.Debit||0, +m.Credit||0]);
  }

  /* Index linked suppliers: customerId → supplierId */
  const custToSupp = new Map(raw.links.map(r => [r.Customer, r.Supplier]));
  const linkedInfo = new Map(raw.links.map(r => [r.Customer, {
    supplierId:   r.Supplier,
    supplierName: r.SupplierName,
  }]));

  /* Compute AP balance per supplier (net credit = they delivered goods, we owe) */
  const apBalanceMap = new Map();
  for (const [sid, movs] of raw.apMovMap) {
    const netAP = movs.reduce((s, m) => s + (m[3] || 0) - (m[2] || 0), 0);
    apBalanceMap.set(sid, Math.max(0, netAP));
  }

  /* Collect AP movements per supplier (compact: [suppId, date, dr, cr]) */
  const apMovementsAll = [];
  for (const [, movs] of raw.apMovMap) apMovementsAll.push(...movs);

  /* Build per-customer aged records */
  const customers = [];
  let   totalBalance = 0;
  const totalBuckets = { b1_7:0, b8_14:0, b15_30:0, b31_60:0, b61_90:0, b91_120:0, bOver120:0 };
  let   nettedCount = 0, nettedAR = 0, nettedAP = 0, nettedExcluded = 0;
  let   validationErrors = 0;

  for (const c of raw.customers) {
    const cid     = c.CustomerId;
    const arMovs  = arMap.get(cid) || [];
    if (!arMovs.length) continue;

    const suppId   = custToSupp.get(cid);
    const apCredit = suppId != null ? (apBalanceMap.get(suppId) || 0) : 0;
    const isNetted = suppId != null;

    /* Raw AR balance (for diagnostics) */
    const rawARBal = arMovs.reduce((s, m) => s + (m[2]||0) - (m[3]||0), 0);

    if (isNetted) {
      nettedCount++;
      nettedAR += Math.max(0, rawARBal);
      nettedAP += apCredit;
    }

    const aged    = computeFIFO(arMovs, apCredit, asOfDate);

    if (aged.balance < 0.01) {
      if (isNetted) nettedExcluded++;
      continue;
    }

    /* Validation: bucket sum == balance */
    const bucketSum = Object.values(aged).slice(1).reduce((s, v) => s + v, 0);
    if (Math.abs(bucketSum - aged.balance) > 0.05) {
      console.warn(`⚠ FIFO mismatch cust ${cid}: bal=${aged.balance.toFixed(2)} buckets=${bucketSum.toFixed(2)}`);
      validationErrors++;
    }

    totalBalance += aged.balance;
    for (const k of Object.keys(totalBuckets)) totalBuckets[k] += aged[k];

    customers.push({
      code:        cid,
      name:        c.CustomerName,
      sellerId:    c.SellerId || 0,
      creditDays:  c.CreditDays  || 0,
      creditLimit: +c.CreditLimit || 0,
      balance:     r2(aged.balance),
      b1_7:        r2(aged.b1_7),
      b8_14:       r2(aged.b8_14),
      b15_30:      r2(aged.b15_30),
      b31_60:      r2(aged.b31_60),
      b61_90:      r2(aged.b61_90),
      b91_120:     r2(aged.b91_120),
      bOver120:    r2(aged.bOver120),
      /* Netting info (for badge/tooltip in UI) */
      isNetted:    isNetted || undefined,
      arBalance:   isNetted ? r2(rawARBal) : undefined,
      apBalance:   isNetted ? r2(apCredit) : undefined,
      supplierId:  isNetted ? suppId       : undefined,
      supplierName: isNetted ? linkedInfo.get(cid)?.supplierName : undefined,
    });
  }

  customers.sort((a, b) => b.balance - a.balance);

  /* Console report */
  const grandBucketSum = Object.values(totalBuckets).reduce((s, v) => s + v, 0);
  console.log(`\n[aging] ✅  Customers with balance: ${customers.length}`);
  console.log(`[aging] 💰  Total balance:           ${totalBalance.toFixed(2)}`);
  console.log(`[aging] 📊  Bucket sum:              ${grandBucketSum.toFixed(2)}`);
  console.log(`[aging]    > 120 days:               ${totalBuckets.bOver120.toFixed(2)}`);
  if (Math.abs(grandBucketSum - totalBalance) > 0.10)
    console.warn(`[aging] ⚠  GRAND TOTAL MISMATCH: ${Math.abs(grandBucketSum - totalBalance).toFixed(2)}`);
  else
    console.log(`[aging] ✅  Grand total validation: PASSED`);
  if (validationErrors) console.warn(`[aging] ⚠  ${validationErrors} customer-level mismatches`);

  /* Netting table */
  console.log(`\n[aging] ══ مقاصة (CustomerSupplierLink) ══`);
  console.log(`  جهات مرتبطة:            ${nettedCount}`);
  console.log(`  إجمالي AR قبل المقاصة:  ${nettedAR.toFixed(2)}`);
  console.log(`  إجمالي AP مُقاصة:       ${nettedAP.toFixed(2)}`);
  console.log(`  مُستبعَد بعد المقاصة:    ${nettedExcluded} جهة (صافٍ ≤ 0)`);
  console.log(`  الفرق (مقارنة بـ قبل):  -${(nettedAR - customers.filter(c=>c.isNetted).reduce((s,c)=>s+c.balance,0)).toFixed(2)}`);

  /* Compact AR movements [cid, date, dr, cr] */
  const rawMovements = raw.arMovements.map(m => [
    m.CustomerId, m.TxDate, +m.Debit||0, +m.Credit||0
  ]);

  /* Link map: { customerId: supplierId } */
  const links = Object.fromEntries(raw.links.map(r => [r.Customer, r.Supplier]));

  return {
    asOfDate,
    generatedAt: new Date().toISOString(),
    company: {
      name: 'مؤسسة أبعاد الحديد التجارية',
      city: 'الرياض، المملكة العربية السعودية',
      cr:   '1010762033',
      vat:  '311128368400003',
    },
    sellers:      raw.sellers.map(s => ({ id: s.SellerId, name: s.SellerName })),
    customers,
    links,                  // { customerId → supplierId }
    rawMovements,           // AR movements [cid, date, dr, cr]
    apMovements: apMovementsAll, // AP movements [sid, date, dr, cr]
    totals: {
      balance:  r2(totalBalance),
      b1_7:     r2(totalBuckets.b1_7),
      b8_14:    r2(totalBuckets.b8_14),
      b15_30:   r2(totalBuckets.b15_30),
      b31_60:   r2(totalBuckets.b31_60),
      b61_90:   r2(totalBuckets.b61_90),
      b91_120:  r2(totalBuckets.b91_120),
      bOver120: r2(totalBuckets.bOver120),
    },
    nettingSummary: {
      linkedPairs:     nettedCount,
      totalARBefore:   r2(nettedAR),
      totalAPOffset:   r2(nettedAP),
      excludedAfterNet: nettedExcluded,
    },
  };
}

/* ── Inject into HTML ── */
function injectHTML(data) {
  const json = JSON.stringify(data);
  if (!fs.existsSync(OUTPUT)) {
    console.log('[aging] HTML template not found — saving JSON only');
    fs.writeFileSync(OUTPUT.replace('.html', '_data.json'), JSON.stringify(data, null, 2));
    return;
  }
  let html = fs.readFileSync(OUTPUT, 'utf-8');
  // Replace data-store content
  const start = html.indexOf('<script type="application/json" id="data-store">');
  const end   = html.indexOf('</script>', start);
  if (start === -1 || end === -1) { console.warn('[aging] ⚠ data-store tag not found'); return; }
  const tagEnd = html.indexOf('>', start) + 1;
  html = html.slice(0, tagEnd) + json + html.slice(end);
  fs.writeFileSync(OUTPUT, html, 'utf-8');
  console.log(`[aging] ✅  HTML updated: ${OUTPUT} (${Math.round(html.length/1024)}KB)`);
}

async function main() {
  await connectAll();
  const pool = await getPool('MekSoftDb1');
  console.log('[aging] Fetching…');
  const raw  = await fetchAll(pool);
  console.log(`[aging] AR movements: ${raw.arMovements.length} | Links: ${raw.links.length}`);
  const data = buildAging(raw);
  fs.writeFileSync(
    path.join(__dirname, '..', 'public', 'aging_data.json'),
    JSON.stringify(data, null, 2)
  );
  injectHTML(data);
  process.exit(0);
}

main().catch(e => { console.error('[aging] FATAL:', e.message); process.exit(1); });
