'use strict';
const sql = require('mssql');
const { getPool } = require('../db');

const PAY_LABEL = { 1: 'نقدي', 2: 'آجل', 3: 'شبكة', 4: 'بنك', 5: 'أخرى' };

async function getSalesInvoices(dbName, { from, to }) {
  const pool = await getPool(dbName);

  const [hRes, dRes] = await Promise.all([
    // ── Headers ─────────────────────────────────────────────────────────────────
    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        SELECT
          sih.ID,
          CAST(sih.CategorySerial AS nvarchar(20)) AS manualId,
          sih.CategorySerial                      AS serial,
          sih.CategoryID                          AS categoryId,
          CONVERT(nvarchar(10), sih.TransactionDate, 23)   AS txDate,
          ISNULL(c.NameAr,  N'عميل نقدي') AS customerName,
          ISNULL(c.Id, 0)                  AS customerId,
          ISNULL(sm.NameAr, N'—')          AS salesManName,
          ISNULL(sih.PaymentType, 2)        AS paymentType,
          SUM(ISNULL(sid.AmountBDis,   0)) AS grossAmt,
          SUM(ISNULL(sid.DiscountValue,0)) AS discAmt,
          SUM(ISNULL(sid.Net,          0)) AS netAmt,
          SUM(ISNULL(sid.VatValue,     0)) AS vatAmt,
          SUM(ISNULL(sid.Net, 0) + ISNULL(sid.VatValue, 0)) AS totalAmt,
          COUNT(sid.ID)                    AS lineCount
        FROM SalesInvoiceHeader sih WITH (NOLOCK)
        JOIN SalesInvoiceDetail  sid WITH (NOLOCK) ON sid.HeaderID = sih.ID
        LEFT JOIN Customer   c  WITH (NOLOCK) ON c.Id  = sih.Customer
        LEFT JOIN SalesMan  sm  WITH (NOLOCK) ON sm.Id = sih.SalesMan
        WHERE sih.TransactionDate >= @from
          AND sih.TransactionDate <  DATEADD(day, 1, @to)
        GROUP BY
          sih.ID, sih.CategorySerial, sih.CategoryID, sih.TransactionDate,
          c.NameAr, c.Id, sm.NameAr, sih.PaymentType
        ORDER BY sih.TransactionDate DESC, sih.ID DESC
      `),

    // ── Line items ───────────────────────────────────────────────────────────────
    pool.request()
      .input('from2', sql.Date, from)
      .input('to2',   sql.Date, to)
      .query(`
        SELECT
          sid.HeaderID,
          ISNULL(i.NameAr, N'صنف غير محدد')  AS itemName,
          ISNULL(i.Code,   N'')               AS itemCode,
          sid.Quantity,
          ISNULL(u.Name, N'—')               AS unitName,
          ISNULL(sid.SalesPrice,    0)        AS unitPrice,
          ISNULL(sid.DiscountRate,  0)        AS discRate,
          ISNULL(sid.DiscountValue, 0)        AS discValue,
          ISNULL(sid.AmountBDis,    0)        AS grossLine,
          ISNULL(sid.Net,           0)        AS net,
          ISNULL(sid.VatValue,      0)        AS vatValue,
          ISNULL(sid.Net, 0) + ISNULL(sid.VatValue, 0) AS lineTotal,
          ISNULL(b.NameAr, N'—')             AS branchName
        FROM SalesInvoiceHeader sih WITH (NOLOCK)
        JOIN SalesInvoiceDetail  sid WITH (NOLOCK) ON sid.HeaderID = sih.ID
        LEFT JOIN Item           i   WITH (NOLOCK) ON i.Id   = sid.Item
        LEFT JOIN UnitGroupDetail ugd WITH (NOLOCK) ON ugd.RecordId = sid.ItemUnit
        LEFT JOIN Unit           u   WITH (NOLOCK) ON u.RecordId   = ugd.Unit
        LEFT JOIN Branch         b   WITH (NOLOCK) ON b.Id   = sid.Branch
        WHERE sih.TransactionDate >= @from2
          AND sih.TransactionDate <  DATEADD(day, 1, @to2)
        ORDER BY sid.HeaderID, sid.ID
      `),
  ]);

  // Group details by HeaderID
  const detMap = new Map();
  for (const d of dRes.recordset) {
    if (!detMap.has(d.HeaderID)) detMap.set(d.HeaderID, []);
    detMap.get(d.HeaderID).push({
      itemName:  d.itemName,
      itemCode:  d.itemCode,
      qty:       +(d.Quantity  || 0),
      unit:      d.unitName,
      unitPrice: +(d.unitPrice || 0),
      discRate:  +(d.discRate  || 0),
      discValue: +(d.discValue || 0),
      grossLine: +(d.grossLine || 0),
      net:       +(d.net       || 0),
      vatValue:  +(d.vatValue  || 0),
      lineTotal: +(d.lineTotal || 0),
      branch:    d.branchName,
    });
  }

  const invoices = hRes.recordset.map(h => ({
    id:         h.ID,
    manualId:   h.manualId,
    serial:     h.serial,
    categoryId: h.categoryId,
    date:       h.txDate,
    customer:   h.customerName,
    customerId: h.customerId,
    salesman:   h.salesManName,
    payType:    h.paymentType,
    payLabel:   PAY_LABEL[h.paymentType] || 'أخرى',
    gross:      +(h.grossAmt || 0),
    disc:       +(h.discAmt  || 0),
    net:        +(h.netAmt   || 0),
    vat:        +(h.vatAmt   || 0),
    total:      +(h.totalAmt || 0),
    lineCount:  h.lineCount  || 0,
    details:    detMap.get(h.ID) || [],
  }));

  const count = invoices.length;
  const totals = {
    count,
    gross:  invoices.reduce((s, i) => s + i.gross, 0),
    disc:   invoices.reduce((s, i) => s + i.disc,  0),
    net:    invoices.reduce((s, i) => s + i.net,   0),
    vat:    invoices.reduce((s, i) => s + i.vat,   0),
    total:  invoices.reduce((s, i) => s + i.total, 0),
    avgNet: 0,
    maxNet: 0,
  };
  totals.avgNet = count > 0 ? totals.net / count : 0;
  totals.maxNet = count > 0 ? Math.max(...invoices.map(i => i.net)) : 0;

  // By salesman
  const smMap = new Map();
  for (const inv of invoices) {
    if (!smMap.has(inv.salesman))
      smMap.set(inv.salesman, { name: inv.salesman, count: 0, net: 0, total: 0 });
    const e = smMap.get(inv.salesman);
    e.count++; e.net += inv.net; e.total += inv.total;
  }
  const bySalesman = [...smMap.values()].sort((a, b) => b.net - a.net);

  // By payment type
  const ptMap = new Map();
  for (const inv of invoices) {
    if (!ptMap.has(inv.payLabel))
      ptMap.set(inv.payLabel, { label: inv.payLabel, count: 0, net: 0 });
    const e = ptMap.get(inv.payLabel);
    e.count++; e.net += inv.net;
  }
  const byPayment = [...ptMap.values()].sort((a, b) => b.net - a.net);

  // Daily trend
  const dtMap = new Map();
  for (const inv of invoices) {
    if (!dtMap.has(inv.date))
      dtMap.set(inv.date, { date: inv.date, count: 0, net: 0 });
    const e = dtMap.get(inv.date);
    e.count++; e.net += inv.net;
  }
  const byDate = [...dtMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Top customers (top 10)
  const custMap = new Map();
  for (const inv of invoices) {
    if (!custMap.has(inv.customer))
      custMap.set(inv.customer, { name: inv.customer, count: 0, net: 0, total: 0 });
    const e = custMap.get(inv.customer);
    e.count++; e.net += inv.net; e.total += inv.total;
  }
  const topCustomers = [...custMap.values()].sort((a, b) => b.net - a.net).slice(0, 10);

  return { from, to, invoices, totals, bySalesman, byPayment, byDate, topCustomers };
}

module.exports = { getSalesInvoices };
