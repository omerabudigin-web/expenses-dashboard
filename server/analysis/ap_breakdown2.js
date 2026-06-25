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
  console.log(`  ${dbName} — تحليل عمق`);
  console.log('═'.repeat(70));

  // ── A. طبيعة الحركات لكل مورّد رئيسي ──────────────────────────────────────
  // هل حركات ح.77+78 لوسام/أبعاد من فواتير شراء أم قيود يدوية؟
  // ننظر في جدول التسمية لمعرفة نوع القيد: ScreenID في JVH قد يكشف المصدر
  console.log('\n[A] تصنيف حركات ح.77+78 حسب نوع القيد (مصدر السكرين):');
  const movType = await q(pool, `
    SELECT TOP 5
      jh.ID   AS jvId,
      CAST(jh.TransactionDate AS DATE) AS dt,
      jh.Description,
      jd.Supplier,
      s.NameAr AS suppName,
      jd.Credit - jd.Debit AS netCredit
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN Supplier s ON s.Id = jd.Supplier
    WHERE jd.AccountChart IN (77,78)
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      AND jd.Credit - jd.Debit > 0
    ORDER BY jd.Credit - jd.Debit DESC
  `);
  movType.forEach(r => {
    console.log(`  JV${r.jvId} ${r.dt} | ${(r.suppName||'').slice(0,30)} | ${Math.round(r.netCredit).toLocaleString()} | ${(r.Description||'').slice(0,50)}`);
  });

  // ── B. هل هناك جدول PurchaseInvoice_JournalVoucherHeader؟ ─────────────────
  // يربط القيود اليومية بفواتير الشراء الأصلية
  console.log('\n[B] قيود ح.77+78 المرتبطة بفواتير شراء (عبر PurchaseInvoice_JournalVoucherHeader):');
  const fromPI = await q(pool, `
    SELECT
      COUNT(DISTINCT pi.PurchaseInvoiceHeaderID) AS invoiceCount,
      SUM(jd.Credit - jd.Debit)                 AS linkedBalance
    FROM PurchaseInvoice_JournalVoucherHeader pi
    JOIN JournalVoucherDetail jd ON jd.HeaderID = pi.JournalVoucherHeaderID
    WHERE jd.AccountChart IN (77,78)
      AND EXISTS(SELECT 1 FROM JournalVoucherHeader jh WHERE jh.ID = jd.HeaderID
                   AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}')
  `);
  fromPI.forEach(r => {
    console.log(`  من فواتير شراء: ${r.invoiceCount} فاتورة | رصيد = ${Math.round(r.linkedBalance).toLocaleString()}`);
  });

  // ── C. قيود ح.77+78 بدون رابط فاتورة شراء ─────────────────────────────────
  console.log('\n[C] قيود ح.77+78 غير مرتبطة بفواتير شراء (يدوية/تسويات):');
  const manualJV = await q(pool, `
    SELECT
      s.NameAr AS suppName,
      COUNT(DISTINCT jh.ID) AS jvCount,
      SUM(jd.Credit - jd.Debit) AS balance,
      MIN(CAST(jh.TransactionDate AS DATE)) AS firstDt,
      MAX(CAST(jh.TransactionDate AS DATE)) AS lastDt
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    LEFT JOIN Supplier s ON s.Id = jd.Supplier
    WHERE jd.AccountChart IN (77,78)
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      AND jh.ID NOT IN (
        SELECT JournalVoucherHeaderID FROM PurchaseInvoice_JournalVoucherHeader
      )
    GROUP BY s.NameAr
    HAVING SUM(jd.Credit - jd.Debit) > 1000 OR SUM(jd.Credit - jd.Debit) < -1000
    ORDER BY SUM(jd.Credit - jd.Debit) DESC
  `);
  manualJV.forEach(r => {
    console.log(`  ${(r.suppName||'بدون مورّد').padEnd(35,' ')} | ${Math.round(r.balance).toLocaleString().padStart(15)} | ${r.jvCount} قيد | ${r.firstDt}→${r.lastDt}`);
  });

  // ── D. أعمار الموردين من نظام الفواتير مباشرة ────────────────────────────
  // نحسب رصيد الفاتورة المفتوح من PurchaseInvoiceHeader
  // الدفعات تمر عبر ح.77 أيضاً (فيدفع رصيد الدائن)
  // رصيد الفاتورة المفتوح = SUM credit fواتير مرتبطة - SUM debit دفعات مرتبطة
  console.log('\n[D] رصيد الفاتورة المفتوح من نظام الفواتير (PurchaseInvoice system):');
  const piAging = await q(pool, `
    SELECT
      s.NameAr AS suppName,
      COUNT(DISTINCT pi.ID) AS invoiceCount,
      SUM(pi.Net) AS netAmount,
      SUM(pi.VatValue) AS vatAmount,
      SUM(pi.Net + pi.VatValue) AS totalGross
    FROM PurchaseInvoiceHeader pi
    JOIN Supplier s ON s.Id = pi.Supplier
    WHERE CAST(pi.TransactionDate AS DATE) <= '${AS_OF}'
    GROUP BY s.Id, s.NameAr
    HAVING SUM(pi.Net + pi.VatValue) > 0
    ORDER BY SUM(pi.Net + pi.VatValue) DESC
  `);
  console.log('  (إجمالي فواتير الشراء بلا حسم للدفعات — للمقارنة):');
  let totalPI = 0;
  piAging.slice(0,20).forEach(r => {
    totalPI += r.totalGross;
    console.log(`  ${(r.suppName||'').padEnd(35,' ')} | ${r.invoiceCount} فاتورة | صافٍ:${Math.round(r.netAmount).toLocaleString().padStart(13)} | VAT:${Math.round(r.vatAmount).toLocaleString().padStart(10)} | إجمالي:${Math.round(r.totalGross).toLocaleString().padStart(13)}`);
  });

  // ── E. مجموع دفعات الموردين ─────────────────────────────────────────────────
  console.log('\n[E] إجمالي مدفوعات الموردين (سندات صرف + مقاصة):');
  const payments = await q(pool, `
    SELECT
      s.NameAr AS suppName,
      SUM(jd.Debit - jd.Credit) AS totalPaid
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN Supplier s ON s.Id = jd.Supplier
    WHERE jd.AccountChart IN (77,78)
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
      AND jd.Debit > jd.Credit
    GROUP BY s.Id, s.NameAr
    HAVING SUM(jd.Debit - jd.Credit) > 100000
    ORDER BY SUM(jd.Debit - jd.Credit) DESC
  `);
  payments.slice(0,20).forEach(r => {
    console.log(`  ${(r.suppName||'').padEnd(35,' ')} | دفع: ${Math.round(r.totalPaid).toLocaleString()}`);
  });

  // ── F. تفصيل المبالغ المرتبطة بفواتير الشراء لأكبر المورّدين (وسام/أبعاد) ──
  // ماذا جاء من فواتير vs ماذا جاء يدوياً؟
  console.log('\n[F] تفصيل مصدر رصيد أكبر مورّد (طرف علاقة) — فاتورة vs يدوي:');
  // أولاً نحدد من هو أكبر مورّد
  const topSupp = await q(pool, `
    SELECT TOP 1 jd.Supplier, s.NameAr, SUM(jd.Credit-jd.Debit) AS bal
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN Supplier s ON s.Id = jd.Supplier
    WHERE jd.AccountChart IN (77,78) AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
    GROUP BY jd.Supplier, s.NameAr
    ORDER BY SUM(jd.Credit-jd.Debit) DESC
  `);
  if (topSupp.length > 0) {
    const ts = topSupp[0];
    console.log(`  أكبر مورّد: [S${ts.Supplier}] ${ts.NameAr} — إجمالي رصيد: ${Math.round(ts.bal).toLocaleString()}`);

    // من فواتير
    const fromInv = await q(pool, `
      SELECT SUM(jd.Credit - jd.Debit) AS balFromInv, COUNT(DISTINCT pi.PurchaseInvoiceHeaderID) AS cnt
      FROM PurchaseInvoice_JournalVoucherHeader pi
      JOIN JournalVoucherDetail jd ON jd.HeaderID = pi.JournalVoucherHeaderID
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      WHERE jd.AccountChart IN (77,78)
        AND jd.Supplier = ${ts.Supplier}
        AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
    `);
    const balInv = fromInv[0]?.balFromInv || 0;
    const cntInv = fromInv[0]?.cnt || 0;

    // يدوي (بدون رابط فاتورة)
    const fromMan = await q(pool, `
      SELECT SUM(jd.Credit - jd.Debit) AS balManual, COUNT(DISTINCT jh.ID) AS cnt
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      WHERE jd.AccountChart IN (77,78)
        AND jd.Supplier = ${ts.Supplier}
        AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
        AND jh.ID NOT IN (SELECT JournalVoucherHeaderID FROM PurchaseInvoice_JournalVoucherHeader)
    `);
    const balMan = fromMan[0]?.balManual || 0;
    const cntMan = fromMan[0]?.cnt || 0;

    console.log(`    من فواتير شراء: ${Math.round(balInv).toLocaleString()} (${cntInv} فاتورة)`);
    console.log(`    يدوي/تسوية:     ${Math.round(balMan).toLocaleString()} (${cntMan} قيد)`);
    console.log(`    مجموع:          ${Math.round(balInv + balMan).toLocaleString()}`);

    // عيّنة من القيود اليدوية الكبيرة
    if (balMan !== 0) {
      console.log('\n    عيّنة القيود اليدوية لهذا المورّد:');
      const manSample = await q(pool, `
        SELECT TOP 10
          jh.ID, CAST(jh.TransactionDate AS DATE) AS dt,
          jh.Description, jd.Credit - jd.Debit AS netCr
        FROM JournalVoucherHeader jh
        JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
        WHERE jd.AccountChart IN (77,78)
          AND jd.Supplier = ${ts.Supplier}
          AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
          AND jh.ID NOT IN (SELECT JournalVoucherHeaderID FROM PurchaseInvoice_JournalVoucherHeader)
        ORDER BY jd.Credit - jd.Debit DESC
      `);
      manSample.forEach(r => {
        console.log(`      JV${r.ID} ${r.dt} | ${Math.round(r.netCr).toLocaleString().padStart(13)} | ${(r.Description||'').slice(0,60)}`);
      });
    }
  }

  // ── G. الدائنون إجمالاً وتصنيف موسّع ─────────────────────────────────────
  console.log('\n[G] ملخص تصنيف الدائنين (ح.77+78) حسب مجموعة الحسابات:');
  const total7778 = await q(pool, `
    SELECT
      ac.ID, ac.NameAr,
      SUM(jd.Credit - jd.Debit) AS balance
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN AccountChart ac ON ac.ID = jd.AccountChart
    WHERE jd.AccountChart IN (77,78)
      AND CAST(jh.TransactionDate AS DATE) <= '${AS_OF}'
    GROUP BY ac.ID, ac.NameAr
  `);
  let tot = 0;
  total7778.forEach(r => {
    tot += r.balance;
    console.log(`  ح.${r.ID} (${r.NameAr}): ${Math.round(r.balance).toLocaleString()}`);
  });
  console.log(`  TOTAL ح.77+78 = ${Math.round(tot).toLocaleString()}`);

  await pool.close();
}

(async () => {
  try {
    await analyzeDB('MekSoftDb1');
    await analyzeDB('MekSoftDb2');
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
  }
})();
