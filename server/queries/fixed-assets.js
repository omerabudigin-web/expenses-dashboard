'use strict';
const { getPool } = require('../db');

async function getFixedAssets(dbName) {
  const pool = await getPool(dbName);
  const result = await pool.request().query(`
    SELECT
      fa.Id,
      fa.NameAr,
      fa.Category,
      fac.NameAr       AS CategoryName,
      CONVERT(varchar(10), fa.AcquisitionDate, 23) AS AcquisitionDate,
      jd.Branch,
      b.NameAr         AS BranchName,
      SUM(ISNULL(jd.Debit,  0)) AS TotalDebit,
      SUM(ISNULL(jd.Credit, 0)) AS TotalCredit,
      COUNT(jd.ID)              AS JVLines
    FROM FixedAsset fa
    LEFT JOIN FixedAssetCategory fac ON fac.ID = fa.Category
    LEFT JOIN JournalVoucherDetail jd ON jd.FixedAsset = fa.Id
    LEFT JOIN AccountChart ac ON ac.ID = jd.AccountChart
    LEFT JOIN Branch b ON b.Id = jd.Branch
    -- فقط حسابات الأصول (كود يبدأ بـ 1) — يستثني المصروفات والإهلاك
    WHERE jd.ID IS NULL OR ac.Code LIKE '1%'
    GROUP BY
      fa.Id, fa.NameAr, fa.Category, fac.NameAr,
      fa.AcquisitionDate, jd.Branch, b.NameAr
    ORDER BY jd.Branch, fa.NameAr
  `);

  // Flatten: assets with no JV still appear (Branch=null)
  return result.recordset.map(r => ({
    id:              r.Id,
    nameAr:          (r.NameAr || '').trim(),
    category:        r.Category,
    categoryName:    (r.CategoryName || '').trim(),
    acquisitionDate: r.AcquisitionDate || null,
    branch:          r.Branch,
    branchName:      r.BranchName || null,
    bookValue:       +(r.TotalDebit  || 0),
    accumDepr:       +(r.TotalCredit || 0),
    netBookValue:    +((r.TotalDebit || 0) - (r.TotalCredit || 0)),
    jvLines:         r.JVLines || 0,
  }));
}

module.exports = { getFixedAssets };
