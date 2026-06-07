'use strict';
const sql         = require('mssql');
const { getPool } = require('../db');

async function getCashSales(dbName, { from, to }) {
  const pool = await getPool(dbName);

  const [summaryRes, detailRes] = await Promise.all([
    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        SELECT
          c.Id                                         AS customerCode,
          c.NameAr                                     AS customerName,
          COUNT(DISTINCT h.ID)                         AS invoiceCount,
          SUM(jd.Debit)                                AS totalWithVat,
          SUM(jd.Debit) / 1.15                         AS totalBeforeVat,
          SUM(jd.Debit) - SUM(jd.Debit) / 1.15        AS totalVat
        FROM dbo.SalesInvoiceHeader h
        JOIN dbo.Customer c ON c.Id = h.Customer
        JOIN dbo.SalesInvoice_JournalVoucherHeader sjv ON sjv.SalesInvoiceHeaderID = h.ID
        JOIN dbo.JournalVoucherDetail jd               ON jd.HeaderID = sjv.JournalVoucherHeaderID
        JOIN dbo.AccountChart ac                       ON ac.ID = jd.AccountChart
        WHERE h.PaymentType = 1
          AND CAST(h.TransactionDate AS DATE) BETWEEN @from AND @to
          AND ac.Code LIKE '1030101%'
        GROUP BY c.Id, c.NameAr
        ORDER BY SUM(jd.Debit) DESC
      `),

    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        SELECT
          c.NameAr                                     AS customerName,
          h.ID                                         AS invoiceId,
          CAST(h.TransactionDate AS DATE)              AS invoiceDate,
          jd.Debit                                     AS totalWithVat,
          jd.Debit / 1.15                              AS totalBeforeVat,
          jd.Debit - jd.Debit / 1.15                  AS totalVat
        FROM dbo.SalesInvoiceHeader h
        JOIN dbo.Customer c ON c.Id = h.Customer
        JOIN dbo.SalesInvoice_JournalVoucherHeader sjv ON sjv.SalesInvoiceHeaderID = h.ID
        JOIN dbo.JournalVoucherDetail jd               ON jd.HeaderID = sjv.JournalVoucherHeaderID
        JOIN dbo.AccountChart ac                       ON ac.ID = jd.AccountChart
        WHERE h.PaymentType = 1
          AND CAST(h.TransactionDate AS DATE) BETWEEN @from AND @to
          AND ac.Code LIKE '1030101%'
        ORDER BY c.NameAr, h.TransactionDate
      `),
  ]);

  const summary = summaryRes.recordset;
  const detail  = detailRes.recordset;

  const totals = summary.reduce(
    (acc, r) => {
      acc.invoiceCount  += r.invoiceCount;
      acc.totalWithVat  += r.totalWithVat;
      acc.totalBeforeVat += r.totalBeforeVat;
      acc.totalVat      += r.totalVat;
      return acc;
    },
    { invoiceCount: 0, totalWithVat: 0, totalBeforeVat: 0, totalVat: 0 }
  );

  return { summary, detail, totals };
}

module.exports = { getCashSales };
