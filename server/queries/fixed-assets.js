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
      -- إهلاك متراكم حقيقي: فقط ما رُحِّل على حساب الإهلاك المخصص لهذا الأصل
      -- (FixedAsset.DepreciationAccount). أي رصيد دائن آخر على حساب أصل (1%)
      -- — كمرتجع مشتريات أو تصحيح تكلفة — ليس إهلاكاً ويُصنَّف منفصلاً.
      SUM(CASE WHEN jd.AccountChart = fa.DepreciationAccount THEN ISNULL(jd.Credit, 0) ELSE 0 END) AS DeprCredit,
      SUM(CASE WHEN jd.AccountChart <> fa.DepreciationAccount OR fa.DepreciationAccount IS NULL THEN ISNULL(jd.Credit, 0) ELSE 0 END) AS AdjCredit,
      COUNT(jd.ID)              AS JVLines
    FROM FixedAsset fa
    LEFT JOIN FixedAssetCategory fac ON fac.ID = fa.Category
    LEFT JOIN JournalVoucherDetail jd ON jd.FixedAsset = fa.Id
    LEFT JOIN AccountChart ac ON ac.ID = jd.AccountChart
    LEFT JOIN Branch b ON b.Id = jd.Branch
    -- فقط حسابات الأصول (كود يبدأ بـ 1) — يستثني المصروفات والإهلاك كمصروف
    WHERE jd.ID IS NULL OR ac.Code LIKE '1%'
    GROUP BY
      fa.Id, fa.NameAr, fa.Category, fac.NameAr,
      fa.AcquisitionDate, jd.Branch, b.NameAr, fa.DepreciationAccount
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
    accumDepr:       +(r.DeprCredit  || 0),
    adjustments:     +(r.AdjCredit   || 0),
    netBookValue:    +((r.TotalDebit || 0) - (r.DeprCredit || 0) - (r.AdjCredit || 0)),
    jvLines:         r.JVLines || 0,
  }));
}

module.exports = { getFixedAssets };
