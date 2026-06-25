'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sql = require('mssql');

const CFG = {
  server:   'MekSoftServer',
  user:     'MCP_ReadOnly',
  password: 'S@123654',
  port:     1433,
  options:  { encrypt: true, trustServerCertificate: true, requestTimeout: 60000 },
};
const AS_OF = '2026-06-23';

async function q(pool, query) {
  const r = await pool.request().query(query);
  return r.recordset;
}

async function analyzeDB(dbName) {
  const pool = new sql.ConnectionPool({ ...CFG, database: dbName });
  await pool.connect();
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${dbName}`);
  console.log('═'.repeat(70));

  // ── 0. كل الحسابات ذات رصيد دائن في مجموعة الدائنين ──────────────────────
  // أولاً: عرف ما هي الحسابات الفرعية تحت مجموعة الالتزامات (مستوى 2)
  // ثم جد كل الحسابات التي لها رصيد دائن وتبدو التزامات (رقم يبدأ بـ 2)
  console.log('\n[0] مكوّنات رصيد الدائنين المُعتمد (Credit-Debit لكل حساب مع رصيد دائن):');
  const apAccounts = await q(pool, `
    SELECT
      ac.ID,
      ac.Code,
      ac.NameAr,
      SUM(jd.Credit - jd.Debit) AS balance
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN AccountChart ac ON ac.ID = jd.AccountChart AND ac.HasChild = 0
    WHERE CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      AND ac.Code LIKE '201%'
    GROUP BY ac.ID, ac.Code, ac.NameAr
    HAVING SUM(jd.Credit - jd.Debit) <> 0
    ORDER BY balance DESC
  `);
  apAccounts.forEach(r => {
    console.log(`  [${r.ID}] ${r.Code} — ${r.NameAr}: ${Math.round(r.balance).toLocaleString()}`);
  });

  // ── 1. الحسابات 77+78 (الدائنين الرسمية) تفصيل ───────────────────────────
  const AP_ACCS = '77,78';
  const rawAP = await q(pool, `
    SELECT SUM(jd.Credit - jd.Debit) AS total
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${AP_ACCS})
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
  `);
  console.log(`\n[1] ح.77+78 الإجمالي = ${Math.round(rawAP[0].total).toLocaleString()}`);

  // ── 2. تصنيف حركات ح.77+78 حسب وجود مورّد أم لا ─────────────────────────
  console.log('\n[2] تفصيل ح.77+78 حسب نوع الطرف المقابل:');
  const partyBreak = await q(pool, `
    SELECT
      CASE
        WHEN jd.Supplier IS NOT NULL THEN 'مورّد'
        WHEN jd.Customer IS NOT NULL THEN 'عميل'
        WHEN jd.Employee IS NOT NULL THEN 'موظف'
        ELSE 'بدون طرف (يدوي/تسوية)'
      END AS partyType,
      COUNT(DISTINCT jh.ID) AS jvCount,
      SUM(jd.Credit - jd.Debit) AS balance
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${AP_ACCS})
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
    GROUP BY
      CASE
        WHEN jd.Supplier IS NOT NULL THEN 'مورّد'
        WHEN jd.Customer IS NOT NULL THEN 'عميل'
        WHEN jd.Employee IS NOT NULL THEN 'موظف'
        ELSE 'بدون طرف (يدوي/تسوية)'
      END
    ORDER BY balance DESC
  `);
  partyBreak.forEach(r => {
    console.log(`  ${r.partyType}: ${Math.round(r.balance).toLocaleString()} (${r.jvCount} قيد)`);
  });

  // ── 3. قيود بدون مورّد — عيّنة من أكبر 15 ──────────────────────────────────
  console.log('\n[3] أكبر 15 قيد في ح.77+78 بدون مورّد (لتحديد الطبيعة):');
  const noSupplier = await q(pool, `
    SELECT TOP 15
      jh.ID          AS jvId,
      CAST(jh.TransactionDate AS DATE) AS dt,
      jh.Description,
      jd.AccountChart AS acc,
      jd.Credit - jd.Debit AS netCredit,
      jd.Customer,
      jd.Employee
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${AP_ACCS})
      AND jd.Supplier IS NULL
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      AND (jd.Credit - jd.Debit) > 0
    ORDER BY (jd.Credit - jd.Debit) DESC
  `);
  noSupplier.forEach(r => {
    console.log(`  JV${r.jvId} ${r.dt} | ${Math.round(r.netCredit).toLocaleString()} | ${(r.Description||'').slice(0,60)}`);
  });

  // ── 4. مجموع الموردين مع رصيد لكل مورّد (كبار 30) ────────────────────────
  console.log('\n[4] أكبر 30 مورّد رصيداً في ح.77+78:');
  const supplierBal = await q(pool, `
    SELECT TOP 30
      s.Id,
      s.NameAr,
      s.VatNo,
      SUM(jd.Credit - jd.Debit) AS apBal
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN Supplier s ON s.Id = jd.Supplier
    WHERE jd.AccountChart IN (${AP_ACCS})
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
    GROUP BY s.Id, s.NameAr, s.VatNo
    HAVING SUM(jd.Credit - jd.Debit) <> 0
    ORDER BY SUM(jd.Credit - jd.Debit) DESC
  `);
  supplierBal.forEach(r => {
    console.log(`  [S${r.Id}] ${(r.NameAr||'').padEnd(35,' ')} VAT:${r.VatNo||'—'} | ${Math.round(r.apBal).toLocaleString()}`);
  });

  // ── 5. تطبيق منطق مقاصّة الكيان المزدوج (نفس CCC) ─────────────────────────
  console.log('\n[5] تطبيق مقاصّة الكيانات المزدوجة (مورّد+عميل بنفس الرقم الضريبي):');
  const netRows = await q(pool, `
    WITH CustomerAR AS (
      SELECT jd.Customer,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
                 THEN jd.Debit - jd.Credit ELSE 0 END) AS arClose
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      WHERE jd.AccountChart IN (47,48) AND jd.Customer IS NOT NULL
      GROUP BY jd.Customer
    ),
    SupplierAP AS (
      SELECT jd.Supplier,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
                 THEN jd.Credit - jd.Debit ELSE 0 END) AS apClose
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      WHERE jd.AccountChart IN (77,78) AND jd.Supplier IS NOT NULL
      GROUP BY jd.Supplier
    ),
    Matched AS (
      SELECT
        c.Id   AS custId,   c.NameAr AS custName,   c.VatNo,
        s.Id   AS suppId,   s.NameAr AS suppName,
        ISNULL(ca.arClose,0) AS arClose,
        ISNULL(sa.apClose,0) AS apClose,
        ISNULL(sa.apClose,0) - ISNULL(ca.arClose,0) AS netAP
      FROM Customer c
      JOIN Supplier s ON s.VatNo = c.VatNo AND NULLIF(s.VatNo,'') IS NOT NULL
      LEFT JOIN CustomerAR ca ON ca.Customer = c.Id
      LEFT JOIN SupplierAP sa ON sa.Supplier = s.Id
    )
    SELECT
      custName, suppName, VatNo,
      arClose, apClose, netAP
    FROM Matched
    WHERE apClose <> 0 OR arClose <> 0
    ORDER BY apClose DESC
  `);
  let grossMatchedAP = 0, netMatchedAP = 0;
  netRows.forEach(r => {
    grossMatchedAP += r.apClose;
    netMatchedAP   += Math.max(r.netAP, 0);
    const flag = r.netAP < r.apClose ? ' ← مُقاصّ جزئياً' : '';
    console.log(`  ${(r.suppName||'').padEnd(30,' ')} AP:${Math.round(r.apClose).toLocaleString().padStart(12)} AR:${Math.round(r.arClose).toLocaleString().padStart(12)} صافٍ:${Math.round(r.netAP).toLocaleString().padStart(12)}${flag}`);
  });
  console.log(`  ─ مجموع الموردين المزدوجين — إجمالي AP: ${Math.round(grossMatchedAP).toLocaleString()} | صافٍ: ${Math.round(netMatchedAP).toLocaleString()}`);

  // ── 6. توزيع الموردين: مزدوج vs غير مزدوج ─────────────────────────────────
  console.log('\n[6] موردون في ح.77+78 مصنّفون (مزدوج / غير مزدوج):');
  const supplierClass = await q(pool, `
    WITH MatchedSuppliers AS (
      SELECT DISTINCT s.Id
      FROM Customer c
      JOIN Supplier s ON s.VatNo = c.VatNo AND NULLIF(s.VatNo,'') IS NOT NULL
    ),
    SupplierBal AS (
      SELECT
        jd.Supplier,
        s.NameAr,
        s.VatNo,
        SUM(jd.Credit - jd.Debit) AS apBal
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      JOIN Supplier s ON s.Id = jd.Supplier
      WHERE jd.AccountChart IN (77,78)
        AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      GROUP BY jd.Supplier, s.NameAr, s.VatNo
      HAVING SUM(jd.Credit - jd.Debit) <> 0
    )
    SELECT
      CASE WHEN ms.Id IS NOT NULL THEN 'كيان مزدوج' ELSE 'مورّد تجاري بحت' END AS cat,
      COUNT(*) AS cnt,
      SUM(apBal) AS total
    FROM SupplierBal sb
    LEFT JOIN MatchedSuppliers ms ON ms.Id = sb.Supplier
    GROUP BY CASE WHEN ms.Id IS NOT NULL THEN 'كيان مزدوج' ELSE 'مورّد تجاري بحت' END
  `);
  supplierClass.forEach(r => {
    console.log(`  ${r.cat}: ${r.cnt} مورّد = ${Math.round(r.total).toLocaleString()}`);
  });

  // ── 7. قيود بدون مورّد — تجميع حسب الوصف لتحديد طبيعتها ─────────────────
  console.log('\n[7] تجميع قيود ح.77+78 بدون مورّد حسب كلمة الوصف (لتحديد التسهيلات/أخرى):');
  const noSuppAgg = await q(pool, `
    SELECT
      LEFT(ISNULL(jh.Description,'—'), 40) AS descSnippet,
      COUNT(DISTINCT jh.ID) AS cnt,
      SUM(jd.Credit - jd.Debit) AS balance
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${AP_ACCS})
      AND jd.Supplier IS NULL
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
    GROUP BY LEFT(ISNULL(jh.Description,'—'), 40)
    HAVING SUM(jd.Credit - jd.Debit) > 100
    ORDER BY SUM(jd.Credit - jd.Debit) DESC
  `);
  noSuppAgg.forEach(r => {
    console.log(`  ${Math.round(r.balance).toLocaleString().padStart(15)} | ${r.cnt} قيد | ${r.descSnippet}`);
  });

  // ── 8. تحقق من حسابات AP في الحسابات الأخرى (غير 77/78) ─────────────────
  // مثل حسابات الدائنين الأخرى، تسهيلات، أطراف علاقة
  console.log('\n[8] حسابات أخرى تحت مجموعة 201 (بخلاف 77/78) مع رصيد دائن:');
  const other201 = await q(pool, `
    SELECT
      ac.ID, ac.Code, ac.NameAr,
      SUM(jd.Credit - jd.Debit) AS balance
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN AccountChart ac ON ac.ID = jd.AccountChart AND ac.HasChild = 0
    WHERE CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      AND ac.Code LIKE '201%'
      AND ac.ID NOT IN (77,78)
    GROUP BY ac.ID, ac.Code, ac.NameAr
    HAVING SUM(jd.Credit - jd.Debit) > 0
    ORDER BY balance DESC
  `);
  if (other201.length === 0) {
    console.log('  — لا توجد حسابات أخرى تحت 201 بخلاف 77/78');
  } else {
    other201.forEach(r => console.log(`  [${r.ID}] ${r.Code} — ${r.NameAr}: ${Math.round(r.balance).toLocaleString()}`));
  }

  // ── 9. فحص واسع: كل الحسابات في ميزان المراجعة رصيد دائن مجموعة 2 (التزامات) ──
  console.log('\n[9] كل حسابات مجموعة 2 (الالتزامات) برصيد دائن > 500,000:');
  const liab = await q(pool, `
    SELECT
      ac.ID, ac.Code, ac.NameAr,
      SUM(jd.Credit - jd.Debit) AS balance
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN AccountChart ac ON ac.ID = jd.AccountChart AND ac.HasChild = 0
    WHERE CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      AND ac.Code LIKE '2%'
    GROUP BY ac.ID, ac.Code, ac.NameAr
    HAVING SUM(jd.Credit - jd.Debit) > 500000
    ORDER BY balance DESC
  `);
  liab.forEach(r => {
    console.log(`  [${r.ID}] ${r.Code} — ${r.NameAr}: ${Math.round(r.balance).toLocaleString()}`);
  });

  await pool.close();
}

(async () => {
  try {
    await analyzeDB('MekSoftDb1');
    await analyzeDB('MekSoftDb2');
  } catch (e) {
    console.error('ERROR:', e.message);
  }
})();
