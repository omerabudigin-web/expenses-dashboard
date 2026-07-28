'use strict';
const { getPool } = require('../db');

const DB1 = process.env.DB1_NAME || 'MekSoftDb1';
const DB2 = process.env.DB2_NAME || 'MekSoftDb2';

function dbFor(company) { return company === 'wissam' ? DB2 : DB1; }
function round2(n) { return Math.round((n || 0) * 100) / 100; }

async function getVatReturn(company, from, to) {
  const db   = dbFor(company);
  const pool = await getPool(db);

  /*
   * Three layers of VAT data:
   *  1. SalesInvoice / SalesReturn  → output VAT (ح.88 credits/debits via invoice JVs)
   *  2. PurchaseInvoice / PurchaseReturn → input VAT (ح.64 debits/credits via invoice JVs)
   *  3. ManualJV debits to ح.64 → input VAT on small purchases entered directly as JVs
   *     (transport fees, customs, rent, maintenance, fuel …)
   *     These are NOT linked to any PurchaseInvoice/PurchaseReturn so they were missing.
   *
   * What we intentionally EXCLUDE from JV-based calculations:
   *  - ManualJV debits to ح.88:  monthly ZATCA payment entries ("تسوية القيمة المضافة")
   *  - ManualJV credits to ح.64: the matching clearing entries on the same ZATCA payment JV
   *  Both are accounting settlement entries for tax already remitted — not return line items.
   *
   * vat_accts CTE resolves ح.88 and ح.64 IDs by code (safe for both DBs).
   */
  const sql = `
    WITH
    vat_accts AS (
      SELECT
        MAX(CASE WHEN Code = '2010203001' THEN ID END) AS id88,
        MAX(CASE WHEN Code = '1030503001' THEN ID END) AS id64
      FROM AccountChart
      WHERE Code IN ('2010203001','1030503001')
    ),
    SI AS (
      SELECT
        ISNULL(SUM(CASE WHEN d.VatRate > 0                       THEN d.AmountBVat END), 0) AS r1_base,
        ISNULL(SUM(CASE WHEN d.VatRate > 0                       THEN d.VatValue   END), 0) AS r1_vat,
        ISNULL(SUM(CASE WHEN d.VatRate = 0 AND d.TaxCategory = 3 THEN d.AmountBVat END), 0) AS r3_base,
        ISNULL(SUM(CASE WHEN d.VatRate = 0 AND d.TaxCategory = 1 THEN d.AmountBVat END), 0) AS r4_base,
        ISNULL(SUM(d.AmountBVat), 0) AS total_base,
        ISNULL(SUM(d.VatValue),   0) AS total_vat
      FROM SalesInvoiceDetail d
      JOIN SalesInvoiceHeader h ON h.ID = d.HeaderID
      WHERE h.TransactionDate >= @from
        AND h.TransactionDate <  DATEADD(day, 1, CAST(@to AS date))
    ),
    SR AS (
      SELECT
        ISNULL(SUM(CASE WHEN d.VatRate > 0                       THEN d.AmountBVat END), 0) AS r1_base,
        ISNULL(SUM(CASE WHEN d.VatRate > 0                       THEN d.VatValue   END), 0) AS r1_vat,
        ISNULL(SUM(CASE WHEN d.VatRate = 0 AND d.TaxCategory = 3 THEN d.AmountBVat END), 0) AS r3_base,
        ISNULL(SUM(CASE WHEN d.VatRate = 0 AND d.TaxCategory = 1 THEN d.AmountBVat END), 0) AS r4_base,
        ISNULL(SUM(d.AmountBVat), 0) AS total_base,
        ISNULL(SUM(d.VatValue),   0) AS total_vat
      FROM SalesReturnDetail d
      JOIN SalesReturnHeader h ON h.ID = d.HeaderID
      WHERE h.TransactionDate >= @from
        AND h.TransactionDate <  DATEADD(day, 1, CAST(@to AS date))
    ),
    PI AS (
      SELECT
        ISNULL(SUM(CASE WHEN d.VatRate > 0 THEN d.AmountBVat END), 0) AS r7_base,
        ISNULL(SUM(CASE WHEN d.VatRate > 0 THEN d.VatValue   END), 0) AS r7_vat,
        ISNULL(SUM(CASE WHEN d.VatRate = 0 THEN d.AmountBVat END), 0) AS r9_base,
        ISNULL(SUM(d.AmountBVat), 0) AS total_base,
        ISNULL(SUM(d.VatValue),   0) AS total_vat
      FROM PurchaseInvoiceDetail d
      JOIN PurchaseInvoiceHeader h ON h.ID = d.HeaderID
      WHERE h.TransactionDate >= @from
        AND h.TransactionDate <  DATEADD(day, 1, CAST(@to AS date))
    ),
    PR AS (
      SELECT
        ISNULL(SUM(CASE WHEN d.VatRate > 0 THEN d.AmountBVat END), 0) AS r7_base,
        ISNULL(SUM(CASE WHEN d.VatRate > 0 THEN d.VatValue   END), 0) AS r7_vat,
        ISNULL(SUM(CASE WHEN d.VatRate = 0 THEN d.AmountBVat END), 0) AS r9_base,
        ISNULL(SUM(d.AmountBVat), 0) AS total_base,
        ISNULL(SUM(d.VatValue),   0) AS total_vat
      FROM PurchaseReturnDetail d
      JOIN PurchaseReturnHeader h ON h.ID = d.HeaderID
      WHERE h.TransactionDate >= @from
        AND h.TransactionDate <  DATEADD(day, 1, CAST(@to AS date))
    ),
    MJ_64 AS (
      /*
       * Manual JV debits to ح.64 = input VAT on small purchases that bypass
       * the PurchaseInvoice module (transport, customs, rent, maintenance …).
       * We take ONLY debits not linked to any purchase/sales document JV.
       */
      SELECT
        ISNULL(SUM(jd.Debit), 0) AS jv_vat
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      CROSS JOIN vat_accts va
      WHERE jd.AccountChart = va.id64
        AND jd.Debit > 0
        AND jh.TransactionDate >= @from
        AND jh.TransactionDate <  DATEADD(day, 1, CAST(@to AS date))
        AND NOT EXISTS (SELECT 1 FROM PurchaseInvoice_JournalVoucherHeader  x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM PurchaseReturn_JournalVoucherHeader   x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM PurchaseCreditNote_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM PurchaseDebitNote_JournalVoucherHeader  x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM SalesInvoice_JournalVoucherHeader     x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM SalesReturn_JournalVoucherHeader      x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
    ),
    MJ_64_CR AS (
      /*
       * Manual JV CREDITS to ح.64 = genuine input-VAT-reducing adjustments
       * (supplier discount/price-correction notices — "إشعار خصم" — posted
       * directly against ح.64, not linked to any PurchaseInvoice/Return).
       * These are real and must be subtracted from input VAT.
       *
       * Distinguished from true ZATCA settlement clearing entries ("تسوية
       * القيمة المضافة"): every such settlement JV found live always pairs
       * a ح.64 credit with a ح.88 debit *in the same voucher* (plus a credit
       * to the payable account 2010204001) — verified across 8 monthly
       * entries. A credit to ح.64 with NO same-header ح.88 debit is not a
       * clearing entry and must be included here.
       */
      SELECT
        ISNULL(SUM(jd.Credit), 0) AS jv_vat_credit
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      CROSS JOIN vat_accts va
      WHERE jd.AccountChart = va.id64
        AND jd.Credit > 0
        AND jh.TransactionDate >= @from
        AND jh.TransactionDate <  DATEADD(day, 1, CAST(@to AS date))
        AND NOT EXISTS (SELECT 1 FROM PurchaseInvoice_JournalVoucherHeader  x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM PurchaseReturn_JournalVoucherHeader   x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM PurchaseCreditNote_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM PurchaseDebitNote_JournalVoucherHeader  x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM SalesInvoice_JournalVoucherHeader     x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM SalesReturn_JournalVoucherHeader      x WHERE x.JournalVoucherHeaderID = jd.HeaderID)
        AND NOT EXISTS (SELECT 1 FROM JournalVoucherDetail zc WHERE zc.HeaderID = jd.HeaderID AND zc.AccountChart = va.id88 AND zc.Debit > 0)
    )
    SELECT
      -- OUTPUT (sales net of returns, all from invoice flow)
      SI.r1_base - SR.r1_base       AS r1_base,
      SI.r1_vat  - SR.r1_vat        AS r1_vat,
      SI.r3_base - SR.r3_base       AS r3_base,
      SI.r4_base - SR.r4_base       AS r4_base,
      SI.total_base - SR.total_base AS r6_base,
      -- INPUT (purchases net of returns, invoices only)
      PI.r7_base - PR.r7_base       AS r7_inv_base,
      PI.r7_vat  - PR.r7_vat        AS r7_inv_vat,
      -- INPUT (additional from manual JVs)
      MJ_64.jv_vat / 0.15           AS r7_jv_base,
      MJ_64.jv_vat                  AS r7_jv_vat,
      MJ_64_CR.jv_vat_credit / 0.15 AS r7_jv_credit_base,
      MJ_64_CR.jv_vat_credit        AS r7_jv_credit_vat,
      -- COMBINED INPUT
      (PI.r7_base - PR.r7_base) + MJ_64.jv_vat / 0.15 - MJ_64_CR.jv_vat_credit / 0.15  AS r7_base,
      (PI.r7_vat  - PR.r7_vat)  + MJ_64.jv_vat        - MJ_64_CR.jv_vat_credit          AS r7_vat,
      PI.r9_base - PR.r9_base       AS r9_base,
      (PI.total_base - PR.total_base) + MJ_64.jv_vat / 0.15 - MJ_64_CR.jv_vat_credit / 0.15 AS r11_base,
      -- REFERENCE (for audit reconciliation)
      SI.total_base AS ref_gross_sales_base,
      SI.total_vat  AS ref_gross_sales_vat,
      SR.total_base AS ref_returns_base,
      SR.total_vat  AS ref_returns_vat,
      PI.total_base AS ref_gross_purch_base,
      PI.total_vat  AS ref_gross_purch_vat,
      PR.total_base AS ref_purch_ret_base,
      PR.total_vat  AS ref_purch_ret_vat,
      MJ_64.jv_vat  AS ref_jv_input_vat,
      MJ_64_CR.jv_vat_credit AS ref_jv_credit_vat
    FROM SI, SR, PI, PR, MJ_64, MJ_64_CR`;

  const result = await pool.request()
    .input('from', from)
    .input('to',   to)
    .query(sql);

  const d = result.recordset[0];

  const r1_base  = round2(d.r1_base);
  const r1_vat   = round2(d.r1_vat);
  const r3_base  = round2(d.r3_base);
  const r4_base  = round2(d.r4_base);
  const r6_base  = round2(d.r6_base);
  const r7_base  = round2(d.r7_base);
  const r7_vat   = round2(d.r7_vat);
  const r9_base  = round2(d.r9_base);
  const r11_base = round2(d.r11_base);

  return {
    company,
    from,
    to,
    asOf: new Date().toISOString(),
    rows: {
      r1:  { base: r1_base,  rate: 15,  vat: r1_vat  },
      r2:  { base: 0,        rate: 0,   vat: 0        },
      r3:  { base: r3_base,  rate: 0,   vat: 0        },
      r4:  { base: r4_base,  rate: 0,   vat: 0        },
      r6:  { base: r6_base },
      r7:  { base: r7_base,  rate: 15,  vat: r7_vat  },
      r8:  { base: 0,        rate: 15,  vat: 0        },
      r9:  { base: r9_base,  rate: 0,   vat: 0        },
      r11: { base: r11_base },
      r12: { vat: r1_vat  },
      r13: { vat: r7_vat  },
    },
    ref: {
      grossSalesBase:   round2(d.ref_gross_sales_base),
      grossSalesVAT:    round2(d.ref_gross_sales_vat),
      returnsBase:      round2(d.ref_returns_base),
      returnsVAT:       round2(d.ref_returns_vat),
      grossPurchBase:   round2(d.ref_gross_purch_base),
      grossPurchVAT:    round2(d.ref_gross_purch_vat),
      purchReturnsBase: round2(d.ref_purch_ret_base),
      purchReturnsVAT:  round2(d.ref_purch_ret_vat),
      jvInvBase:        round2(d.r7_inv_base),
      jvInvVAT:         round2(d.r7_inv_vat),
      jvManualBase:     round2(d.r7_jv_base),
      jvManualVAT:      round2(d.ref_jv_input_vat),
      jvManualCreditBase: round2(d.r7_jv_credit_base),
      jvManualCreditVAT:  round2(d.ref_jv_credit_vat),
    },
  };
}

module.exports = { getVatReturn };
