'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/*
 * Returns monthly data for the Perpetual vs Periodic income-comparison tab.
 *
 * Per month we return:
 *   revenue         — net sales (Credit−Debit on account 5%, captures return reversals)
 *   cogs_perp       — perpetual COGS: full 4010101xxx (sales COGS + customer discounts + write-downs)
 *   write_down_cogs — sub-component of cogs_perp: inventory write-downs via DecreaseStock JVs
 *   purchases       — gross purchases from PurchaseInvoiceDetail.AmountBVat excl. VAT (for reference)
 *   purch_returns   — purchase returns from PurchaseReturnDetail.AmountBVat excl. VAT (for reference)
 *   inv_balance     — month-end book inventory (running sum of 10302% accounts)
 *   sal/rent/maint/sell/dist/adm/fin/char/oth — operating expenses
 *
 * No start-date filter: fetches full history so JS handles all period filtering.
 * Periodic COGS is computed on the client using PI document values:
 *   periodic_cogs = BI_periodic + (purchases_av − disc_earned − returns_av + inv_adj) − EI_periodic
 *   where EI_periodic = Σ(max(0, cum_qty) × avg_unit_cost) via InventoryTransactionOnlyIncludedView
 * Periodic COGS differs from perpetual COGS due to landed costs and AVCO vs ERP cost divergence.
 */
async function getPLComparisonData(dbName) {
  const pool = await getPool(dbName);

  // ── 1. Revenue + COGS perpetual + OpEx from JournalVoucherDetail ──────────
  const jvRes = await pool.request().query(`
    SELECT
      YEAR(h.TransactionDate)  AS Yr,
      MONTH(h.TransactionDate) AS Mo,

      /* Revenue: net of returns — total for formula */
      SUM(CASE WHEN ac.Code LIKE '5%'
               THEN jd.Credit - jd.Debit ELSE 0 END)            AS revenue,

      /* Revenue components — for transparent build-up display */
      SUM(CASE WHEN ac.Code IN ('5010101001','5010102001')
               THEN jd.Credit - jd.Debit ELSE 0 END)            AS sales_rev,
      SUM(CASE WHEN ac.Code IN ('5010101002','5010102002')
               THEN jd.Credit - jd.Debit ELSE 0 END)            AS sales_ret,
      SUM(CASE WHEN ac.Code = '5010201001'
               THEN jd.Credit - jd.Debit ELSE 0 END)            AS other_rev,
      /* Supplier discounts only — accounts named خصم under 501020100x.
         Excludes accounts sharing the same code whose NameAr does not contain خصم
         (e.g. rental income ID=364 "ايرادات شقق داماس الرياض" shares code 5010201006
         with purchase discount ID=360 "خصم مشتريات"; name filter separates them). */
      SUM(CASE WHEN ac.Code IN ('5010201005','5010201006')
                    AND ac.NameAr LIKE N'%خصم%'
               THEN jd.Credit - jd.Debit ELSE 0 END)            AS disc_earned,
      /* Unclassified revenue: any 5% account not captured in a named bucket.
         Intentionally includes rental income (5010201006/ايرادات شقق) and any
         future miscellaneous income accounts. */
      SUM(CASE WHEN ac.Code LIKE '5%'
               AND ac.Code NOT IN ('5010101001','5010101002','5010102001','5010102002','5010201001')
               AND NOT (ac.Code IN ('5010201005','5010201006') AND ac.NameAr LIKE N'%خصم%')
               THEN jd.Credit - jd.Debit ELSE 0 END)            AS unclass_rev,

      /* Perpetual COGS — full 4010101xxx: sales COGS + customer discounts + write-downs */
      SUM(CASE WHEN ac.Code LIKE '4010101%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS cogs_base,

      /* Inventory write-downs via DecreaseStock JVs — sub-component of cogs_base.
         Separated so the UI can distinguish one-time write-downs from recurring sales COGS.
         LEFT JOIN to link table (DISTINCT guards against multi-row edge cases). */
      SUM(CASE WHEN ac.Code LIKE '4010101%' AND ds.JournalVoucherHeaderID IS NOT NULL
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS write_down_cogs,

      /* Sales discounts sub-component (reclassified as revenue deduction, not COGS) */
      SUM(CASE WHEN ac.Code IN ('4010101002','4010101007')
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS disc_sales,

      /* Other direct cost bucket */
      SUM(CASE WHEN ac.Code LIKE '40101020%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS other_cost,

      /* ── OpEx per COA — 401 مصروفات تشغيلية المخازن ── */
      SUM(CASE WHEN ac.Code LIKE '4010201%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS sell,
      /* 4010301 full — transport, freight, distribution (matches ERP OpEx) */
      SUM(CASE WHEN ac.Code LIKE '4010301%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS dist,

      /* ── OpEx per COA — 402 مصروفات إدارية وعمومية ── */
      SUM(CASE WHEN ac.Code LIKE '4020101%' OR ac.Code LIKE '4020102%'
                        OR ac.Code LIKE '4020104%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS sal,
      SUM(CASE WHEN ac.Code LIKE '4020105%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS rent,
      /* 4020106 full — fees, fines, customs, clearance (matches ERP OpEx) */
      SUM(CASE WHEN ac.Code LIKE '4020106%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS fees,
      SUM(CASE WHEN ac.Code LIKE '4020107%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS consult,
      SUM(CASE WHEN ac.Code LIKE '4020108%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS gen,
      SUM(CASE WHEN ac.Code LIKE '4020109%' OR ac.Code LIKE '4020110%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS maint,
      SUM(CASE WHEN ac.Code LIKE '4020111%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS office,
      SUM(CASE WHEN ac.Code LIKE '4020115%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS char_,
      SUM(CASE WHEN ac.Code LIKE '4020117%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS oth,
      SUM(CASE WHEN ac.Code LIKE '4020118%'
               THEN jd.Debit - jd.Credit ELSE 0 END)            AS fin
    FROM JournalVoucherHeader h
    JOIN JournalVoucherDetail  jd ON jd.HeaderID = h.ID
    JOIN AccountChart          ac ON ac.ID       = jd.AccountChart
    LEFT JOIN (SELECT DISTINCT JournalVoucherHeaderID FROM DecreaseStock_JournalVoucherHeader) ds
           ON ds.JournalVoucherHeaderID = h.ID
    WHERE ac.Code LIKE '5%' OR ac.Code LIKE '4%'
    GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
    ORDER BY Yr, Mo
  `);

  // ── 2. Purchases — from PI document lines (AmountBVat = excl. VAT, matches PI reports) ──
  const purRes = await pool.request().query(`
    SELECT YEAR(h.TransactionDate) Yr, MONTH(h.TransactionDate) Mo,
           SUM(d.AmountBVat) AS purchases
    FROM PurchaseInvoiceDetail  d
    JOIN PurchaseInvoiceHeader  h ON h.ID = d.HeaderID
    GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
  `);

  // ── 3. Purchase returns — from PR document lines (AmountBVat excl. VAT) ──────────────
  const pretRes = await pool.request().query(`
    SELECT YEAR(h.TransactionDate) Yr, MONTH(h.TransactionDate) Mo,
           SUM(d.AmountBVat) AS purch_returns
    FROM PurchaseReturnDetail  d
    JOIN PurchaseReturnHeader  h ON h.ID = d.HeaderID
    GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
  `);

  // ── 4. Landed costs absorbed into inventory via PI JVs ────────────────────────────────
  //     PI JVs credit these accounts (clearing pre-paid costs into 10302%),
  //     so standalone net in jvRes understates gross cost. Add absorbed portion here.
  const absRes = await pool.request().query(`
    SELECT YEAR(jh.TransactionDate) Yr, MONTH(jh.TransactionDate) Mo,
      SUM(CASE WHEN ac.Code = '4010301001' AND jd.Credit > jd.Debit THEN jd.Credit - jd.Debit ELSE 0 END) AS abs_transport,
      SUM(CASE WHEN ac.Code = '1030501001' AND jd.Credit > jd.Debit THEN jd.Credit - jd.Debit ELSE 0 END) AS abs_transit,
      SUM(CASE WHEN ac.Code = '4020106010' AND jd.Credit > jd.Debit THEN jd.Credit - jd.Debit ELSE 0 END) AS abs_clearance
    FROM JournalVoucherDetail jd
    JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
    JOIN AccountChart ac ON ac.ID = jd.AccountChart
    JOIN PurchaseInvoice_JournalVoucherHeader pijvh ON pijvh.JournalVoucherHeaderID = jh.ID
    WHERE ac.Code IN ('4010301001','1030501001','4020106010')
    GROUP BY YEAR(jh.TransactionDate), MONTH(jh.TransactionDate)
  `);

  // ── 5. Inventory balance (running sum of 10302% accounts) ─────────────────
  const invRes = await pool.request().query(`
    WITH monthly_activity AS (
      SELECT YEAR(h.TransactionDate) Yr, MONTH(h.TransactionDate) Mo,
             SUM(jd.Debit - jd.Credit) monthly_net
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader h ON h.ID = jd.HeaderID
      JOIN AccountChart         ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '10302%'
      GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
    ),
    all_months AS (SELECT DISTINCT Yr, Mo FROM monthly_activity),
    running AS (
      SELECT am.Yr, am.Mo,
        CAST(SUM(ISNULL(ma.monthly_net,0)) OVER (
          ORDER BY am.Yr, am.Mo ROWS UNBOUNDED PRECEDING
        ) AS DECIMAL(18,2)) balance
      FROM all_months am
      LEFT JOIN monthly_activity ma ON ma.Yr=am.Yr AND ma.Mo=am.Mo
    )
    SELECT Yr, Mo, balance FROM running ORDER BY Yr, Mo
  `);

  // ── 6. Non-PI non-SI non-SR inventory additions — classified by document type ─
  //     Excludes PI, PR, SI, SR-linked JVs; internal 10302↔10302 transfers;
  //     and any JV that credits COGS (4010101%) — those are already in cogs_perp
  //     as negatives and in EI as positives; including them here double-counts.
  //     Returns one row per (Yr, Mo, doc_type) for per-source breakdown display.
  const invAdjRes = await pool.request().query(`
    WITH inv_with_credits AS (
      SELECT DISTINCT jd.HeaderID
      FROM JournalVoucherDetail jd
      JOIN AccountChart ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '10302%' AND jd.Credit > jd.Debit
    ),
    cogs_credit_jvs AS (
      SELECT DISTINCT jd.HeaderID
      FROM JournalVoucherDetail jd
      JOIN AccountChart ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '4010101%' AND jd.Credit > jd.Debit
    ),
    classified AS (
      SELECT YEAR(h.TransactionDate) AS Yr, MONTH(h.TransactionDate) AS Mo,
             jd.Debit - jd.Credit AS net,
             CASE
               WHEN EXISTS (SELECT 1 FROM IncreaseStock_JournalVoucherHeader        x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'زيادة مخزون'
               -- DecreaseStock always credits 10302%; excluded by inv_with_credits before reaching this CASE
               -- TransferIssued always credits 10302%; excluded by inv_with_credits before reaching this CASE
               WHEN EXISTS (SELECT 1 FROM FinishedGoodsReceipt_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'إيصال بضاعة تامة'
               WHEN EXISTS (SELECT 1 FROM RawMaterialIssue_JournalVoucherHeader    x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'إصدار مواد خام'
               WHEN EXISTS (SELECT 1 FROM TransferReceiving_JournalVoucherHeader   x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'تحويل وارد'
               WHEN EXISTS (SELECT 1 FROM CostAllocation_JournalVoucherHeader      x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'توزيع تكاليف'
               WHEN EXISTS (SELECT 1 FROM DeliverGoods_JournalVoucherHeader        x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'تسليم بضاعة'
               WHEN ISNULL(h.Description,N'') LIKE N'%افتتاح%'
                    OR ISNULL(h.Description,N'') LIKE N'%رصيد%افتتاح%'
                 THEN N'مخزون أول المدة'
               ELSE N'قيد يدوي'
             END AS doc_type
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader h  ON h.ID  = jd.HeaderID
      JOIN AccountChart         ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '10302%'
        AND jd.Debit > jd.Credit
        AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM PurchaseInvoice_JournalVoucherHeader)
        AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM PurchaseReturn_JournalVoucherHeader)
        AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM SalesInvoice_JournalVoucherHeader)
        AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM SalesReturn_JournalVoucherHeader)
        AND jd.HeaderID NOT IN (SELECT HeaderID FROM inv_with_credits)
        AND jd.HeaderID NOT IN (SELECT HeaderID FROM cogs_credit_jvs)
        /* Exclude opening-balance JVs — already captured in bi (PLCOMP_OPENING / invRes) */
        AND NOT (ISNULL(h.Description,N'') LIKE N'%افتتاح%'
              OR ISNULL(h.Description,N'') LIKE N'%رصيد%افتتاح%')
    )
    SELECT Yr, Mo, doc_type, SUM(net) AS inv_adj
    FROM classified
    GROUP BY Yr, Mo, doc_type
    ORDER BY Yr, Mo, doc_type
  `);

  // ── 7. Periodic EI — per-item running qty × all-time avg PI cost ──────────
  //     Quantities from InventoryTransactionOnlyIncludedView — the 7 screens that
  //     physically move stock (DeliverGoods/ReceiptGoods/Transfer*/Increase/DecreaseStock/
  //     OpeningStock). InventoryTransactionView also includes document-level screens
  //     (PurchaseInvoice, SalesInvoice, PurchaseOrder, Quotation, PurchaseReturn,
  //     SalesReturn) whose quantities duplicate or are unrelated to the physical
  //     movement already counted via ReceiptGoods/DeliverGoods — using it here inflated
  //     cum_qty by roughly the entire document-side volume (verified live: DB1 all-time
  //     SUM(GroupQuantity) is -256,939 on InventoryTransactionView vs +46,406 on
  //     InventoryTransactionOnlyIncludedView). Items with negative balance are excluded (= 0 EI).
  const eiPerRes = await pool.request().query(`
    WITH
    avg_cost AS (
      SELECT d.Item,
        SUM(d.AmountBVat) * 1.0 / NULLIF(SUM(d.GroupQuantity), 0) avg_unit_cost
      FROM PurchaseInvoiceDetail d
      JOIN PurchaseInvoiceHeader h ON h.ID = d.HeaderID
      WHERE d.GroupQuantity > 0
      GROUP BY d.Item
    ),
    itv_mo AS (
      SELECT YEAR(TransactionDate) Yr, MONTH(TransactionDate) Mo, Item,
             SUM(GroupQuantity) monthly_qty
      FROM InventoryTransactionOnlyIncludedView
      GROUP BY YEAR(TransactionDate), MONTH(TransactionDate), Item
    ),
    itv_run AS (
      SELECT Yr, Mo, Item,
        SUM(monthly_qty) OVER (PARTITION BY Item ORDER BY Yr, Mo ROWS UNBOUNDED PRECEDING) cum_qty
      FROM itv_mo
    )
    SELECT Yr, Mo,
      ROUND(SUM(CASE WHEN cum_qty > 0 THEN cum_qty * ISNULL(ac.avg_unit_cost,0) ELSE 0 END), 2) ei_periodic
    FROM itv_run ir
    LEFT JOIN avg_cost ac ON ac.Item = ir.Item
    GROUP BY Yr, Mo
    ORDER BY Yr, Mo
  `);

  // ── Merge into a single map keyed by 'YYYY-MM' ────────────────────────────
  const map = {};
  const key  = (yr, mo) => `${yr}-${String(mo).padStart(2,'0')}`;
  const get  = (yr, mo) => { const k=key(yr,mo); if (!map[k]) map[k]={yr,mo,month:k,label:AR_MONTHS[mo]+' '+String(yr).slice(2)}; return map[k]; };

  jvRes.recordset.forEach(r => {
    const m = get(r.Yr, r.Mo);
    m.revenue       = +r.revenue       || 0;
    m.sales_rev     = +r.sales_rev     || 0;
    m.sales_ret     = +r.sales_ret     || 0;
    m.other_rev     = +r.other_rev     || 0;
    m.disc_earned   = +r.disc_earned   || 0;
    m.unclass_rev   = +r.unclass_rev   || 0;
    // cogs_perp = 4010101xxx (sales COGS + customer discounts + write-downs)
    m.cogs_perp       = +r.cogs_base       || 0;
    m.write_down_cogs = +r.write_down_cogs || 0;  // sub-component: DecreaseStock write-downs
    m.disc_sales      = +r.disc_sales      || 0;  // sub-component: customer discounts (for display)
    m.other_cost = +r.other_cost || 0;
    // 401 - مصروفات تشغيلية المخازن (transport + distribution fully in OpEx per ERP)
    m.sell       = +r.sell       || 0;
    m.dist       = +r.dist       || 0;
    // 402 - مصروفات إدارية وعمومية
    m.sal        = +r.sal        || 0;
    m.rent       = +r.rent       || 0;
    m.fees       = +r.fees       || 0;
    m.consult    = +r.consult    || 0;
    m.gen        = +r.gen        || 0;
    m.maint      = +r.maint      || 0;
    m.office     = +r.office     || 0;
    m.char       = +r.char_      || 0;
    m.oth        = +r.oth        || 0;
    m.fin        = +r.fin        || 0;
  });

  purRes.recordset.forEach(r    => { get(r.Yr, r.Mo).purchases     = +r.purchases     || 0; });
  pretRes.recordset.forEach(r   => { get(r.Yr, r.Mo).purch_returns = +r.purch_returns  || 0; });
  invRes.recordset.forEach(r    => { get(r.Yr, r.Mo).inv_balance   = +r.balance        || 0; });
  invAdjRes.recordset.forEach(r => {
    const m = get(r.Yr, r.Mo);
    if (!m.inv_adj_detail) m.inv_adj_detail = [];
    const amt = +r.inv_adj || 0;
    m.inv_adj_detail.push({ doc_type: r.doc_type, amount: amt });
    m.inv_adj = (m.inv_adj || 0) + amt;
  });
  eiPerRes.recordset.forEach(r  => { get(r.Yr, r.Mo).ei_periodic   = +r.ei_periodic     || 0; });
  absRes.recordset.forEach(r    => {
    const m = get(r.Yr, r.Mo);
    m.abs_transport = +r.abs_transport || 0;
    m.abs_transit   = +r.abs_transit   || 0;
    m.abs_clearance = +r.abs_clearance || 0;
  });

  // Fill missing fields
  Object.values(map).forEach(m => {
    ['revenue','sales_rev','sales_ret','other_rev','disc_earned','unclass_rev',
     'cogs_perp','write_down_cogs','disc_sales','other_cost','purchases','purch_returns','inv_adj',
     'inv_balance','ei_periodic',
     'sell','dist','sal','rent','fees','consult','gen','maint','office','char','oth','fin'].forEach(f => {
      if (m[f] === undefined) m[f] = 0;
    });
    if (!m.inv_adj_detail) m.inv_adj_detail = [];
    m.net_purchases = m.purchases - m.purch_returns + m.inv_adj;
  });

  return Object.values(map).sort((a,b) => a.month.localeCompare(b.month));
}

/*
 * Returns a breakdown of non-PI/PR 10302% movements for a given period.
 * Used by the "تفصيل التسويات" card in the P&L comparison tab.
 *
 * Summary groups by document type: SR / IncreaseStock / DecreaseStock / other
 * Detail lists each IncreaseStock JV individually.
 */
async function getAdjDetail(dbName, from, to) {
  const pool = await getPool(dbName);

  // Convert 'YYYY-MM' strings to date boundaries
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const fromDate  = `${fy}-${String(fm).padStart(2,'0')}-01`;
  const toNext    = tm === 12
    ? `${ty + 1}-01-01`
    : `${ty}-${String(tm + 1).padStart(2,'0')}-01`;

  const dateFilter = `h.TransactionDate >= '${fromDate}' AND h.TransactionDate < '${toNext}'`;
  const piprFilter = `
    AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM PurchaseInvoice_JournalVoucherHeader)
    AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM PurchaseReturn_JournalVoucherHeader)
    AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM SalesInvoice_JournalVoucherHeader)
    AND h.ID NOT IN (SELECT JournalVoucherHeaderID FROM SalesReturn_JournalVoucherHeader)`;

  // Applies the same exclusion logic as invAdjRes in getPLComparisonData so that
  // the detail breakdown matches the inv_adj aggregate shown in the COGS box.
  const sumRes = await pool.request().query(`
    WITH inv_with_credits AS (
      SELECT DISTINCT jd.HeaderID
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader h ON h.ID = jd.HeaderID
      JOIN AccountChart ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '10302%' AND jd.Credit > jd.Debit
        AND ${dateFilter} ${piprFilter}
    ),
    cogs_credit_jvs AS (
      SELECT DISTINCT jd.HeaderID
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader h ON h.ID = jd.HeaderID
      JOIN AccountChart ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '4010101%' AND jd.Credit > jd.Debit
        AND ${dateFilter} ${piprFilter}
    ),
    classified AS (
      SELECT h.ID,
             jd.Debit - jd.Credit AS net,
             CASE
               WHEN EXISTS (SELECT 1 FROM IncreaseStock_JournalVoucherHeader        x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'زيادة مخزون'
               WHEN EXISTS (SELECT 1 FROM CostAllocation_JournalVoucherHeader       x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'توزيع تكاليف'
               WHEN EXISTS (SELECT 1 FROM FinishedGoodsReceipt_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'إيصال بضاعة تامة'
               WHEN EXISTS (SELECT 1 FROM RawMaterialIssue_JournalVoucherHeader     x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'إصدار مواد خام'
               WHEN EXISTS (SELECT 1 FROM TransferReceiving_JournalVoucherHeader    x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'تحويل وارد'
               WHEN EXISTS (SELECT 1 FROM DeliverGoods_JournalVoucherHeader         x WHERE x.JournalVoucherHeaderID = h.ID) THEN N'تسليم بضاعة'
               ELSE N'قيد يدوي'
             END AS doc_type
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader h  ON h.ID  = jd.HeaderID
      JOIN AccountChart         ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '10302%'
        AND jd.Debit > jd.Credit
        AND ${dateFilter} ${piprFilter}
        AND jd.HeaderID NOT IN (SELECT HeaderID FROM inv_with_credits)
        AND jd.HeaderID NOT IN (SELECT HeaderID FROM cogs_credit_jvs)
        AND NOT (ISNULL(h.Description,N'') LIKE N'%افتتاح%'
              OR ISNULL(h.Description,N'') LIKE N'%رصيد%افتتاح%')
    )
    SELECT doc_type,
           COUNT(DISTINCT ID)  AS jv_count,
           SUM(net)            AS net_amount
    FROM classified
    GROUP BY doc_type
    ORDER BY ABS(SUM(net)) DESC
  `);

  const incRes = await pool.request().query(`
    SELECT h.ID   AS jv_id,
           CONVERT(VARCHAR(10), h.TransactionDate, 23) AS date,
           ISNULL(h.Description, N'') AS description,
           SUM(jd.Debit - jd.Credit)  AS amount
    FROM JournalVoucherDetail jd
    JOIN JournalVoucherHeader h  ON h.ID  = jd.HeaderID
    JOIN AccountChart         ac ON ac.ID = jd.AccountChart
    WHERE ac.Code LIKE '10302%' AND ${dateFilter}
      AND EXISTS (SELECT 1 FROM IncreaseStock_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID = h.ID)
    GROUP BY h.ID, h.TransactionDate, h.Description
    ORDER BY h.TransactionDate
  `);

  return {
    summary:   sumRes.recordset.map(r => ({ doc_type: r.doc_type, jv_count: +r.jv_count, net_amount: +r.net_amount || 0 })),
    increases: incRes.recordset.map(r => ({ jv_id: r.jv_id, date: r.date, description: r.description, amount: +r.amount || 0 })),
  };
}

module.exports = { getPLComparisonData, getAdjDetail };
