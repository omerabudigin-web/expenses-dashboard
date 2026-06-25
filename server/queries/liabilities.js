'use strict';
const { getPool } = require('../db');

const r2 = v => Math.round((+v || 0) * 100) / 100;

/* ── Query one DB ─────────────────────────────────────────────────────────────── */
async function _queryDb(dbName, asOf) {
  const pool = await getPool(dbName);

  const [apRes, relRes, loanRes] = await Promise.all([

    /* 1. ح.77+78 — break by trade / related / advances */
    pool.request().query(`
      WITH SupBal AS (
        SELECT s.Id, s.NameAr, UPPER(ISNULL(s.VatNo,'')) AS VatNo,
          SUM(jd.Credit - jd.Debit) AS apBal
        FROM JournalVoucherHeader jh
        JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
        JOIN Supplier s ON s.Id = jd.Supplier
        WHERE jd.AccountChart IN (77,78) AND jd.Supplier IS NOT NULL
          AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
        GROUP BY s.Id, s.NameAr, s.VatNo
      ),
      CustVat AS (
        SELECT DISTINCT UPPER(VatNo) AS VatNo FROM Customer WHERE NULLIF(VatNo,'') IS NOT NULL
      )
      SELECT
        ISNULL(SUM(CASE WHEN cv.VatNo IS NULL  AND sb.apBal > 0 THEN sb.apBal ELSE 0 END),0) AS tradeCredit,
        ISNULL(SUM(CASE WHEN cv.VatNo IS NOT NULL AND sb.apBal > 0 THEN sb.apBal ELSE 0 END),0) AS relatedCredit,
        ISNULL(SUM(CASE WHEN sb.apBal < 0 THEN ABS(sb.apBal) ELSE 0 END),0)  AS advances,
        ISNULL(SUM(sb.apBal),0) AS totalNet
      FROM SupBal sb LEFT JOIN CustVat cv ON cv.VatNo = sb.VatNo
    `.replace('${asOf}', asOf)),

    /* 2. Related-party detail — AP gross + AR gross per entity */
    pool.request().query(`
      WITH SupBal AS (
        SELECT s.Id, s.NameAr, UPPER(ISNULL(s.VatNo,'')) AS VatNo,
          SUM(jd.Credit - jd.Debit) AS apBal
        FROM JournalVoucherHeader jh
        JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
        JOIN Supplier s ON s.Id = jd.Supplier
        WHERE jd.AccountChart IN (77,78) AND jd.Supplier IS NOT NULL
          AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
        GROUP BY s.Id, s.NameAr, s.VatNo
      ),
      CustAR AS (
        SELECT UPPER(c.VatNo) AS VatNo, SUM(jd.Debit - jd.Credit) AS arBal
        FROM JournalVoucherHeader jh JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
        JOIN Customer c ON c.Id = jd.Customer
        WHERE jd.AccountChart IN (47,48) AND jd.Customer IS NOT NULL
          AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
          AND NULLIF(c.VatNo,'') IS NOT NULL
        GROUP BY c.VatNo
      )
      SELECT sb.NameAr, sb.apBal AS apGross,
             ISNULL(ca.arBal,0) AS arGross,
             sb.apBal - ISNULL(ca.arBal,0) AS netExposure
      FROM SupBal sb
      JOIN Customer c2 ON UPPER(c2.VatNo) = sb.VatNo AND NULLIF(sb.VatNo,'') IS NOT NULL
      LEFT JOIN CustAR ca ON ca.VatNo = sb.VatNo
      GROUP BY sb.NameAr, sb.apBal, ca.arBal
      ORDER BY ABS(sb.apBal) DESC
    `.replaceAll('${asOf}', asOf)),

    /* 3. External financing — all loan / accrued-financing accounts outside ح.77+78 */
    pool.request().query(`
      SELECT ac.ID, ac.Code, ac.NameAr,
             SUM(jd.Credit - jd.Debit) AS bal
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      JOIN AccountChart ac ON ac.ID = jd.AccountChart
      WHERE (   ac.Code LIKE '20102%'
             OR ac.Code LIKE '20103%'
             OR ac.Code LIKE '20105%'
             OR ac.Code LIKE '2020101%')
        AND ac.ID NOT IN (77,78,81,88,90)
        AND LEN(ac.Code) >= 10
        AND ac.HasChild = 0
        AND CAST(jh.TransactionDate AS DATE) <= '${asOf}'
      GROUP BY ac.ID, ac.Code, ac.NameAr
      HAVING SUM(jd.Credit - jd.Debit) > 0
      ORDER BY SUM(jd.Credit - jd.Debit) DESC
    `.replace('${asOf}', asOf)),
  ]);

  const ap = apRes.recordset[0] || {};
  const tradeCredit   = r2(ap.tradeCredit)   || 0;
  const relatedCredit = r2(ap.relatedCredit) || 0;
  const advances      = r2(ap.advances)      || 0;
  const totalNet      = r2(ap.totalNet)      || 0;

  const relatedParties = relRes.recordset.map(row => ({
    name:        row.NameAr,
    apGross:     r2(row.apGross),
    arGross:     r2(row.arGross),
    netExposure: r2(row.netExposure),
  }));

  // Primary related = largest absolute AP position
  const primary = relatedParties[0] || null;
  const relatedNet     = primary ? primary.netExposure : 0;
  const otherRelatedAP = relatedParties.slice(1)
    .reduce((s, r) => s + (r.apGross > 0 ? r.apGross : 0), 0);

  const financing = loanRes.recordset.map(row => {
    let category = 'other';
    if (row.Code.startsWith('2020101'))        category = 'deferred';
    else if (row.Code.startsWith('20102'))     category = 'loan';
    else if (row.Code.startsWith('20103'))     category = 'accrued';
    else if (row.Code.startsWith('20105'))     category = 'personal';
    return { id: row.ID, code: row.Code, name: row.NameAr, balance: r2(row.bal), category };
  });

  const financingTotal = r2(financing.reduce((s, f) => s + f.balance, 0));

  return {
    db: dbName,
    ap: { total: totalNet, tradeCredit, relatedCredit, advances,
          otherRelatedAP: r2(otherRelatedAP) },
    relatedParties,
    financing,
    totals: {
      tradeNet:       r2(tradeCredit),
      relatedNet:     r2(relatedNet > 0 ? relatedNet : 0),
      financingTotal,
      grandTotal:     r2(tradeCredit + (relatedNet > 0 ? relatedNet : 0) + financingTotal),
    },
  };
}

/* ── Public entry point ───────────────────────────────────────────────────────── */
async function getLiabilitiesData(db1Name, db2Name, selectedDb, asOf) {
  const [d1, d2] = await Promise.all([
    _queryDb(db1Name, asOf),
    _queryDb(db2Name, asOf),
  ]);

  // Bilateral: each DB's primary related maps to the other DB
  const p1 = d1.relatedParties[0]; // أبعاد's view of وسام
  const p2 = d2.relatedParties[0]; // وسام's view of أبعاد

  // From أبعاد: net owed to وسام (positive = AP creditor)
  const net1 = p1 ? p1.netExposure : 0; // e.g. 4,256,455
  // From وسام: AP to أبعاد minus AR from أبعاد — what وسام says it owes أبعاد (AP creditor)
  const net2ap = p2 ? p2.apGross : 0;   // وسام's AP to أبعاد
  const net2ar = p2 ? p2.arGross : 0;   // وسام's AR from أبعاد (= what أبعاد owes وسام)
  // Reconciled: أبعاد owes وسام (from both perspectives)
  // net1     = أبعاد's recorded net liability to وسام
  // net2ar - net2ap = وسام's recorded net receivable from أبعاد

  const gap = r2(Math.abs(net1 - (net2ar - net2ap)));

  const bilateral = {
    db1: {
      name:        db1Name,
      apToOther:   p1 ? r2(p1.apGross) : 0,
      arFromOther: p1 ? r2(p1.arGross) : 0,
      netAP:       r2(net1),
    },
    db2: {
      name:        db2Name,
      apToOther:   r2(net2ap),
      arFromOther: r2(net2ar),
      netAR:       r2(net2ar - net2ap),
    },
    gap,
  };

  const selected = selectedDb === db2Name ? d2 : d1;
  return {
    asOfDate: asOf,
    db:       selectedDb,
    ...selected,
    bilateral,
    db1: d1,
    db2: d2,
  };
}

module.exports = { getLiabilitiesData };
