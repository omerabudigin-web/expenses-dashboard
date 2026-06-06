'use strict';
const { getPool } = require('../db');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/*
 * Returns cumulative (as-of month-end) balances for every 1/2/3xxx level-3
 * group across all months in the database.
 *
 * Key design: a CROSS JOIN of all_groups × all_months creates a complete grid
 * so that groups with no activity in a month still carry their prior balance
 * forward (ISNULL(activity, 0) in the running SUM window).
 */
async function getBSMonthly(dbName) {
  const pool = await getPool(dbName);
  const res  = await pool.request().query(`
    WITH leaf_monthly AS (
      SELECT
        YEAR(h.TransactionDate)   AS Yr,
        MONTH(h.TransactionDate)  AS Mo,
        jd.AccountChart           AS acID,
        SUM(jd.Debit - jd.Credit) AS monthly_net
      FROM JournalVoucherDetail  jd
      JOIN JournalVoucherHeader   h  ON h.ID = jd.HeaderID
      JOIN AccountChart           ac ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '[123]%'
      GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate), jd.AccountChart
    ),
    with_anc AS (
      SELECT
        lm.Yr, lm.Mo, lm.monthly_net,
        CASE
          WHEN ac.LevelNo = 3 THEN ac.ID
          WHEN p1.LevelNo = 3 THEN p1.ID
          WHEN p2.LevelNo = 3 THEN p2.ID
          WHEN p3.LevelNo = 3 THEN p3.ID
          ELSE ISNULL(p3.ID, ISNULL(p2.ID, ISNULL(p1.ID, ac.ID)))
        END  AS grpID
      FROM leaf_monthly lm
      JOIN AccountChart  ac ON ac.ID = lm.acID
      LEFT JOIN AccountChart p1 ON p1.ID = ac.ParentID
      LEFT JOIN AccountChart p2 ON p2.ID = p1.ParentID
      LEFT JOIN AccountChart p3 ON p3.ID = p2.ParentID
    ),
    group_activity AS (
      SELECT wa.Yr, wa.Mo, wa.grpID, SUM(wa.monthly_net) AS monthly_net
      FROM with_anc wa
      GROUP BY wa.Yr, wa.Mo, wa.grpID
    ),
    all_months AS (SELECT DISTINCT Yr, Mo FROM group_activity),
    all_groups AS (SELECT DISTINCT grpID  FROM group_activity),
    /* Complete grid: every group in every month */
    grid AS (
      SELECT ag.grpID, am.Yr, am.Mo
      FROM all_groups ag CROSS JOIN all_months am
    ),
    running AS (
      SELECT
        g.grpID, g.Yr, g.Mo,
        CAST(
          SUM(ISNULL(ga.monthly_net, 0)) OVER (
            PARTITION BY g.grpID
            ORDER BY g.Yr, g.Mo
            ROWS UNBOUNDED PRECEDING
          ) AS DECIMAL(18, 2)
        ) AS balance
      FROM grid g
      LEFT JOIN group_activity ga
             ON ga.grpID = g.grpID AND ga.Yr = g.Yr AND ga.Mo = g.Mo
    )
    SELECT
      r.Yr, r.Mo,
      ac.Code    AS grpCode,
      ac.NameAr  AS grpName,
      LEFT(ac.Code, 3) AS code3,
      r.balance
    FROM running r
    JOIN AccountChart ac ON ac.ID = r.grpID
    ORDER BY ac.Code, r.Yr, r.Mo
  `);

  return res.recordset.map(r => ({
    month:   `${r.Yr}-${String(r.Mo).padStart(2, '0')}`,
    label:   AR_MONTHS[r.Mo] + ' ' + String(r.Yr).slice(2),
    grpCode: r.grpCode,
    grpName: r.grpName,
    balance: +r.balance || 0,
    code3:   r.code3,
  }));
}

// Monthly cumulative balance for bank-facilities accounts (2010202%)
// Used by the CF statement to classify these as financing, not operating.
async function getBankFacilitiesMonthly(dbName) {
  const pool = await getPool(dbName);
  const res  = await pool.request().query(`
    WITH monthly_bf AS (
      SELECT
        YEAR(h.TransactionDate)  AS Yr,
        MONTH(h.TransactionDate) AS Mo,
        SUM(jd.Debit - jd.Credit) AS monthly_net
      FROM JournalVoucherDetail  jd
      JOIN JournalVoucherHeader   h  ON h.ID = jd.HeaderID
      JOIN AccountChart          ac  ON ac.ID = jd.AccountChart
      WHERE ac.Code LIKE '2010202%'
      GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
    ),
    all_months AS (SELECT DISTINCT Yr, Mo FROM monthly_bf),
    running AS (
      SELECT am.Yr, am.Mo,
        CAST(SUM(ISNULL(mbf.monthly_net, 0)) OVER (
          ORDER BY am.Yr, am.Mo ROWS UNBOUNDED PRECEDING
        ) AS DECIMAL(18,2)) AS balance
      FROM all_months am
      LEFT JOIN monthly_bf mbf ON mbf.Yr = am.Yr AND mbf.Mo = am.Mo
    )
    SELECT Yr, Mo, balance FROM running ORDER BY Yr, Mo
  `);

  return res.recordset.map(r => ({
    month:   `${r.Yr}-${String(r.Mo).padStart(2,'0')}`,
    balance: +r.balance || 0,
  }));
}

module.exports = { getBSMonthly, getBankFacilitiesMonthly };
