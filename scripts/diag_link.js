'use strict';
const { connectAll, getPool } = require('../server/db');

(async () => {
  await connectAll();
  const pool = await getPool('MekSoftDb1');
  const asOf = '2026-06-07';

  // 1) Link table content
  const links = await pool.request().query(`
    SELECT csl.Customer, csl.Supplier, csl.ShowAsSupplier,
           c.NameAr AS CustomerName, s.NameAr AS SupplierName,
           c.Account AS CustAccId,   s.Account AS SuppAccId,
           cac.Code  AS CustAccCode, sac.Code  AS SuppAccCode
    FROM CustomerSupplierLink csl
    LEFT JOIN Customer     c   ON c.Id  = csl.Customer
    LEFT JOIN Supplier     s   ON s.Id  = csl.Supplier
    LEFT JOIN AccountChart cac ON cac.ID = c.Account
    LEFT JOIN AccountChart sac ON sac.ID = s.Account
  `);
  console.log('=== CustomerSupplierLink ===');
  links.recordset.forEach(r => console.log(JSON.stringify(r)));

  // 2) Per-pair net positions  — use jd.Supplier field to isolate each supplier's movements
  console.log('\n=== Net Position per Linked Pair (حساب الصافي) ===');
  let totalLinkedAR = 0, totalLinkedAP = 0, totalLinkedNet = 0;

  for (const row of links.recordset) {
    // AR — filter by customer + AR account codes 47/48
    const arRes = await pool.request().query(`
      SELECT SUM(jd.Debit - jd.Credit) AS arBal
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      WHERE jd.Customer     = ${row.Customer}
        AND jd.AccountChart IN (47, 48)
        AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
    `);
    const arBal = +arRes.recordset[0]?.arBal || 0;

    // AP — filter by jd.Supplier field (NOT by AccountChart alone)
    const apRes = await pool.request().query(`
      SELECT SUM(jd.Credit - jd.Debit) AS apBal
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      JOIN AccountChart ac ON ac.ID = jd.AccountChart
      WHERE jd.Supplier = ${row.Supplier}
        AND ac.Code LIKE '20101%'
        AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
    `);
    const apBal = +apRes.recordset[0]?.apBal || 0;
    const net   = arBal - apBal;

    totalLinkedAR  += arBal;
    totalLinkedAP  += apBal;
    totalLinkedNet += net;

    console.log(`Cust ${row.Customer} (${row.CustomerName.slice(0,25)}):`);
    console.log(`  AR=${arBal.toFixed(2)}  AP=${apBal.toFixed(2)}  NET=${net.toFixed(2)}`);
  }

  // 3) Grand total BEFORE netting
  const totRes = await pool.request().query(`
    SELECT SUM(t.bal) AS grandTotal, COUNT(*) AS custCount FROM (
      SELECT jd.Customer, SUM(jd.Debit - jd.Credit) AS bal
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      WHERE jd.AccountChart IN (47,48)
        AND jd.Customer IS NOT NULL AND jd.Customer > 0
        AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
      GROUP BY jd.Customer HAVING SUM(jd.Debit - jd.Credit) > 0.01
    ) t
  `);
  const grandTotal = +totRes.recordset[0]?.grandTotal || 0;

  // 4) Compute estimate after netting
  // For each linked pair: if net > 0, include net; if net <= 0, exclude entirely
  // Net reduction = sum of AR that gets replaced by (AR - AP) or zero
  let netReduction = 0;
  for (const row of links.recordset) {
    const arRes = await pool.request().query(`
      SELECT SUM(jd.Debit - jd.Credit) AS arBal FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      WHERE jd.Customer=  ${row.Customer} AND jd.AccountChart IN (47,48)
        AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
    `);
    const apRes = await pool.request().query(`
      SELECT SUM(jd.Credit - jd.Debit) AS apBal FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      JOIN AccountChart ac ON ac.ID = jd.AccountChart
      WHERE jd.Supplier = ${row.Supplier} AND ac.Code LIKE '20101%'
        AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
    `);
    const ar = +arRes.recordset[0]?.arBal || 0;
    const ap = +apRes.recordset[0]?.apBal || 0;
    const net = ar - ap;
    // reduction = original AR inclusion - net inclusion
    const origIncluded = Math.max(0, ar);
    const netIncluded  = Math.max(0, net);
    netReduction += origIncluded - netIncluded;
  }

  const estimated = grandTotal - netReduction;

  console.log('\n=== DIAGNOSTIC SUMMARY ===');
  console.log(`Linked pairs:                  ${links.recordset.length}`);
  console.log(`Grand total BEFORE netting:    ${grandTotal.toFixed(2)}`);
  console.log(`Total linked AR:               ${totalLinkedAR.toFixed(2)}`);
  console.log(`Total linked AP:               ${totalLinkedAP.toFixed(2)}`);
  console.log(`Net AR reduction (netting):    ${netReduction.toFixed(2)}`);
  console.log(`Estimated AFTER netting:       ${estimated.toFixed(2)}`);
  console.log(`Reference target:              5,349,984.99`);
  console.log(`Diff vs reference:             ${(estimated - 5349984.99).toFixed(2)}`);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
