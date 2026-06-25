// ── Perpetual vs Periodic Inventory Comparison tab ───────────────────────────
let _plCompCache  = {};
let _plCompChart  = null;
let _plCompInited = false;

let _plcTimer     = null;
let _plcCountdown = 0;
const PLC_REFRESH_SEC = 60;
function _plcIsActive() { return !!document.querySelector('.tab.active[data-tab="pl-comp"]'); }
function _plcStopTimer() { if (_plcTimer) { clearInterval(_plcTimer); _plcTimer = null; } }
function _plcStartCountdown(periodLabel, revenue) {
  _plcStopTimer();
  _plcCountdown = PLC_REFRESH_SEC;
  const el = document.getElementById('plc-status');
  const fmM = v => ((+v||0)/1e6).toFixed(2) + ' م';
  const tick = () => {
    if (!el) return;
    const revTxt = revenue != null ? ` | إيرادات: ${fmM(revenue)}` : '';
    if (_plcCountdown > 0) {
      el.textContent = `✅ ${periodLabel}${revTxt} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_plcCountdown}ث`;
      el.style.color = '#1a7a3c';
    } else {
      el.textContent = `⏳ جارٍ إعادة التحميل...`;
      el.style.color = '#8a7a3c';
    }
  };
  tick();
  _plcTimer = setInterval(() => {
    if (!_plcIsActive()) { _plcStopTimer(); return; }
    _plcCountdown = Math.max(0, _plcCountdown - 1);
    tick();
    if (_plcCountdown === 0) { _plcStopTimer(); renderPLComparison(); }
  }, 1000);
}

const PLCOMP_OPENING = {
  MekSoftDb1: { month: '2025-09', inv_balance: 4061406.11, ei_periodic: 3637611.23 },
  MekSoftDb2: { month: '2025-08', inv_balance: 0,          ei_periodic: 0           },
};
function plcOpeningFor(db) { return PLCOMP_OPENING[db] || PLCOMP_OPENING.MekSoftDb1; }
const _PLC_AR_MO = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function plcKey(yr, mo) { return `${yr}-${String(mo).padStart(2,'0')}`; }
function plcPrevMo(moStr) {
  let [y, m] = moStr.split('-').map(Number);
  if (--m < 1) { m = 12; y--; }
  return plcKey(y, m);
}
function plcMonthLabel(moStr) {
  const [y, m] = moStr.split('-').map(Number);
  return _PLC_AR_MO[m] + ' ' + y;
}

function plcShowMode(mode) {
  const vis = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };
  vis('plc-year-sel',  mode !== 'custom' && mode !== 'month' && mode !== 'all');
  vis('plc-q-sel',     mode === 'quarter');
  vis('plc-h-sel',     mode === 'half');
  vis('plc-month-sel', mode === 'month');
  vis('plc-from-lbl',  mode === 'custom');
  vis('plc-from-sel',  mode === 'custom');
  vis('plc-to-lbl',    mode === 'custom');
  vis('plc-to-sel',    mode === 'custom');
}

function plcGetPeriod() {
  const mode = document.getElementById('plc-mode-sel')?.value || 'all';
  const yr   = document.getElementById('plc-year-sel')?.value  || '';
  const q    = document.getElementById('plc-q-sel')?.value     || '';
  const h    = document.getElementById('plc-h-sel')?.value     || '';
  const mo   = document.getElementById('plc-month-sel')?.value || '';
  const from = document.getElementById('plc-from-sel')?.value  || '';
  const to   = document.getElementById('plc-to-sel')?.value    || '';
  const QL   = ['','الربع الأول','الربع الثاني','الربع الثالث','الربع الرابع'];

  if (mode === 'all') {
    const frSel = document.getElementById('plc-from-sel');
    const toSel = document.getElementById('plc-to-sel');
    const allMonths = frSel ? [...frSel.options].map(o => o.value).filter(Boolean) : [];
    if (!allMonths.length) return null;
    const f = allMonths[0], t = allMonths[allMonths.length - 1];
    return { from: f, to: t, label: 'كل الفترة (' + plcMonthLabel(f) + ' — ' + plcMonthLabel(t) + ')' };
  }
  if (mode === 'year' && yr)
    return { from: plcKey(yr, 1), to: plcKey(yr, 12), label: 'سنة ' + yr };
  if (mode === 'quarter' && yr && q) {
    const mf = (+q - 1) * 3 + 1;
    return { from: plcKey(yr, mf), to: plcKey(yr, mf + 2), label: QL[+q] + ' ' + yr };
  }
  if (mode === 'half' && yr && h)
    return h === '1'
      ? { from: plcKey(yr, 1),  to: plcKey(yr, 6),  label: 'النصف الأول ' + yr }
      : { from: plcKey(yr, 7),  to: plcKey(yr, 12), label: 'النصف الثاني ' + yr };
  if (mode === 'month' && mo)
    return { from: mo, to: mo, label: plcMonthLabel(mo) };
  if (mode === 'custom' && from && to && from <= to)
    return { from, to, label: plcMonthLabel(from) + ' — ' + plcMonthLabel(to) };
  return null;
}

function plcPopulateFilters(data) {
  const years  = [...new Set(data.map(r => r.month.slice(0,4)))].sort();
  const months = data.map(r => ({ v: r.month, t: r.label }));

  const ySel  = document.getElementById('plc-year-sel');
  const moSel = document.getElementById('plc-month-sel');
  const frSel = document.getElementById('plc-from-sel');
  const toSel = document.getElementById('plc-to-sel');

  if (ySel) {
    const sv = ySel.value;
    ySel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (sv && years.includes(sv)) ySel.value = sv;
    else ySel.value = years[years.length - 1] || '';
  }
  [{ el: moSel, def: months[months.length-1]?.v },
   { el: frSel, def: months[0]?.v },
   { el: toSel, def: months[months.length-1]?.v }].forEach(({ el, def }) => {
    if (!el) return;
    const sv = el.value;
    el.innerHTML = months.map(m => `<option value="${m.v}">${m.t}</option>`).join('');
    if (sv && months.some(m => m.v === sv)) el.value = sv;
    else el.value = def || '';
  });
}

async function plcFetch(db, force) {
  if (!force && _plCompCache[db]) return _plCompCache[db];
  const r = await fetch(`/api/pl-comparison?db=${encodeURIComponent(db)}`);
  if (!r.ok) throw new Error(await r.text());
  return (_plCompCache[db] = await r.json());
}

const _plAdjCache = {};
async function plcFetchAdjDetail(db, from, to) {
  const k = `${db}|${from}|${to}`;
  if (_plAdjCache[k]) return _plAdjCache[k];
  const r = await fetch(`/api/pl-adj-detail?db=${encodeURIComponent(db)}&from=${from}&to=${to}`);
  if (!r.ok) throw new Error(await r.text());
  return (_plAdjCache[k] = await r.json());
}

function plcAggregate(data, from, to, db) {
  const rows = data.filter(r => r.month >= from && r.month <= to);
  if (!rows.length) return null;

  const opening = plcOpeningFor(db);
  const biMo  = plcPrevMo(from);
  const biRow = data.find(r => r.month === biMo)
             || (biMo <= opening.month ? opening : null);

  // Perpetual BI/EI — primary (period-accurate: cost matched to delivery date via JV)
  const bi        = +(biRow?.inv_balance || 0);
  const ei        = +(rows[rows.length-1].inv_balance || 0);
  // Periodic BI/EI — supplementary (qty × avg PI cost; for inventory valuation analysis only)
  const bi_periodic = +(biRow?.ei_periodic ?? biRow?.inv_balance ?? 0);
  const ei_periodic = +(rows[rows.length-1].ei_periodic ?? 0);
  // Alias for backward-compat in render functions
  const bi_ledger = bi;
  const ei_ledger = ei;

  const sum = f => rows.reduce((s, r) => s + (+r[f] || 0), 0);
  const revenue       = sum('revenue');
  const sales_rev     = sum('sales_rev');
  const sales_ret     = sum('sales_ret');
  const other_rev     = sum('other_rev');
  const disc_earned   = sum('disc_earned');
  const unclass_rev   = sum('unclass_rev');
  const cogs_perp       = sum('cogs_perp');
  // write_down_cogs: sub-component of cogs_perp — inventory write-downs via DecreaseStock JVs only
  const write_down_cogs = sum('write_down_cogs');
  // sales_cogs: perpetual COGS from sales (excludes one-time write-downs)
  const sales_cogs      = cogs_perp - write_down_cogs;
  const other_cost      = sum('other_cost');

  // PI/PR — from document AmountBVat (excl. VAT, matches PI/PR reports)
  const purchases_av  = sum('purchases');
  const returns_av    = sum('purch_returns');
  // Inventory adjustments (CostAllocation JVs)
  const mfg_av        = sum('inv_adj');
  // Reclassify: disc_sales (4010101002+007) → revenue deduction (not COGS)
  //             disc_earned (5010201005+006, name خصم only) → purchase deduction (not revenue)
  const disc_sales    = sum('disc_sales');
  const net_revenue   = revenue - disc_earned - disc_sales;
  const pure_cogs     = cogs_perp - disc_sales;
  // Sales COGS net of customer discounts (excludes write-downs — for trend analysis)
  const sales_pure_cogs = sales_cogs - disc_sales;
  // Net purchases for display: deduct earned supplier discounts from gross PI purchases
  const net_purchases_av = purchases_av - disc_earned - returns_av + mfg_av;
  // Periodic COGS — supplementary (for COGS analysis box, not main P&L)
  const periodic_cogs = bi_periodic + net_purchases_av - ei_periodic;
  // Inventory adjustment breakdown by document type (for COGS box detail display)
  const adj_breakdown_map = {};
  rows.forEach(r => {
    (r.inv_adj_detail || []).forEach(d => {
      adj_breakdown_map[d.doc_type] = (adj_breakdown_map[d.doc_type] || 0) + d.amount;
    });
  });
  const ADJ_ORDER = ['مخزون أول المدة','زيادة مخزون','نقص مخزون','إيصال بضاعة تامة',
                     'إصدار مواد خام','تحويل وارد','تحويل صادر','توزيع تكاليف','تسليم بضاعة','قيد يدوي'];
  const adj_breakdown = Object.entries(adj_breakdown_map)
    .filter(([, v]) => Math.abs(v) > 0)
    .sort(([a], [b]) => {
      const ia = ADJ_ORDER.indexOf(a), ib = ADJ_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const inv_overstatement = ei_ledger - ei_periodic;

  const opex = {
    // 401 - مصروفات تشغيلية المخازن (transport/dist fully in OpEx, matches ERP)
    sell: sum('sell'), dist: sum('dist'),
    // 402 - مصروفات إدارية وعمومية (fees includes customs+clearance, matches ERP)
    sal: sum('sal'), rent: sum('rent'), fees: sum('fees'), consult: sum('consult'),
    gen: sum('gen'), maint: sum('maint'), office: sum('office'),
    char: sum('char'), oth: sum('oth'), fin: sum('fin'),
  };
  const total_opex    = Object.values(opex).reduce((s, v) => s + v, 0);
  const gp_perp       = net_revenue - pure_cogs - other_cost;
  const ni_perp       = gp_perp - total_opex;
  const gp_periodic   = net_revenue - periodic_cogs - other_cost;
  const ni_periodic   = gp_periodic - total_opex;

  // Landed costs absorbed into 10302% via PI JVs (transport + transit + clearance reversals)
  const abs_transport = sum('abs_transport');
  const abs_transit   = sum('abs_transit');
  const abs_clearance = sum('abs_clearance');
  const landed_costs  = abs_transport + abs_transit + abs_clearance;
  const pi_jv_total   = purchases_av + landed_costs; // approx 10302% PI JV debit

  return { from, to, rows, bi, ei, bi_periodic, ei_periodic, bi_ledger, ei_ledger,
           purchases_av, returns_av, mfg_av, disc_sales, disc_earned,
           net_purchases_av, adj_breakdown, periodic_cogs, revenue, net_revenue, pure_cogs,
           sales_rev, sales_ret, other_rev, unclass_rev,
           cogs_perp, write_down_cogs, sales_cogs, sales_pure_cogs, other_cost, inv_overstatement,
           abs_transport, abs_transit, abs_clearance, landed_costs, pi_jv_total,
           ...opex, total_opex, gp_perp, gp_periodic, ni_perp, ni_periodic };
}

function plcRenderKPIs(a) {
  const el = document.getElementById('plc-kpis');
  if (!el) return;
  const gm = a.net_revenue ? a.gp_perp / a.net_revenue * 100 : 0;
  const nm = a.net_revenue ? a.ni_perp / a.net_revenue * 100 : 0;
  el.innerHTML = [
    { lbl: 'الإيرادات',              val: fmt(a.net_revenue),   accent: '#4ada8e' },
    { lbl: 'تكلفة المبيعات',         val: fmt(a.pure_cogs),     accent: '#da9a4a' },
    { lbl: 'إجمالي الربح',           val: fmt(a.gp_perp),       accent: a.gp_perp >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'هامش الربح الإجمالي',   val: fmtPct(gm),            accent: gm >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'المصروفات التشغيلية',    val: fmt(a.total_opex),    accent: '#5baef0' },
    { lbl: 'صافي الربح',             val: fmt(a.ni_perp),       accent: a.ni_perp >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'هامش صافي',             val: fmtPct(nm),            accent: nm >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl: 'فرق تقييم المخزون',      val: fmt(a.inv_overstatement), accent: Math.abs(a.inv_overstatement) > 100000 ? '#da9a4a' : '#607080' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join('');
}

function plcRenderStatement(a) {
  const el = document.getElementById('plc-statement');
  if (!el) return;
  const R = (lbl, val, st='') => `<tr><td>${lbl}</td><td class="pl-num"${st?` style="${st}"`:''}>${fmt(val)}</td></tr>`;
  const S = lbl => `<tr class="pl-section"><td colspan="2" style="color:#5baef0;padding-top:14px;font-size:.78rem;letter-spacing:.04em">${lbl}</td></tr>`;
  const T = (lbl, val, st='') => `<tr class="pl-subtotal"><td><strong>${lbl}</strong></td>
    <td class="pl-num"${st?` style="${st}"`:''}><strong>${fmt(val)}</strong></td></tr>`;
  const G = lbl => `<tr><td colspan="2" style="color:#6080a0;padding:8px 14px 2px;font-size:.73rem;font-style:italic">— ${lbl} —</td></tr>`;

  const gpColor = a.gp_perp >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
  const niColor = a.ni_perp >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';

  const opexRows = [
    G('مصروفات تشغيلية المخازن (401)'),
    a.sell       ? R('مصروفات بيعية (عمولات ودعاية)', a.sell) : '',
    a.dist       ? R('مصروفات نقل وتوزيع (4010301)', a.dist)  : '',
    G('مصروفات إدارية وعمومية (402)'),
    a.sal        ? R('رواتب وأجور ومزايا', a.sal)     : '',
    a.rent       ? R('إيجارات', a.rent)               : '',
    a.fees       ? R('رسوم وجمارك وتخليص (4020106)', a.fees)  : '',
    a.consult    ? R('استشارات وخبراء', a.consult)     : '',
    a.gen        ? R('مصروفات عمومية', a.gen)          : '',
    a.maint      ? R('صيانة ومحروقات وسيارات', a.maint): '',
    a.office     ? R('قرطاسية ومستلزمات مكتبية', a.office) : '',
    a.char       ? R('صدقات وبر', a.char)             : '',
    a.oth        ? R('أخرى ومتنوعة', a.oth)           : '',
    a.fin        ? R('مالية ومصرفية', a.fin)          : '',
  ].join('');

  el.innerHTML = `<table class="pl-stmt" style="width:100%">
    <thead><tr style="color:#5090b0;font-size:.75rem">
      <th style="text-align:right;padding:6px 14px">البند</th>
      <th class="pl-num" style="padding:6px 14px">المبلغ (ر.س)</th>
    </tr></thead>
    <tbody>
      ${S('الإيرادات')}
      ${R('صافي الإيرادات', a.net_revenue, 'color:#4ada8e')}
      ${S('تكلفة البضاعة المباعة')}
      ${R('تكلفة مبيعات البضاعة (جرد دائم)', a.sales_pure_cogs)}
      ${a.write_down_cogs ? R('خسائر هبوط المخزون (DecreaseStock)', a.write_down_cogs, 'color:#da4a4a') : ''}
      ${a.other_cost ? R('تكاليف مباشرة أخرى', a.other_cost) : ''}
      ${T('إجمالي تكلفة البضاعة المباعة', a.pure_cogs)}
      ${T('إجمالي الربح', a.gp_perp, gpColor)}
      ${S('المصروفات التشغيلية')}
      ${opexRows}
      ${T('إجمالي المصروفات التشغيلية', a.total_opex)}
      ${S('صافي الربح')}
      <tr class="pl-total"><td><strong>صافي الربح / الخسارة</strong></td>
        <td class="pl-num" style="${niColor}"><strong>${fmt(a.ni_perp)}</strong></td>
      </tr>
    </tbody></table>`;
}

function plcRenderRevenueBox(a) {
  const el = document.getElementById('plc-rev-box');
  if (!el) return;
  const R = (lbl, val, st='') => `<tr><td style="color:#8ab0cc">${lbl}</td><td class="pl-num"${st?` style="${st}"`:''}>${fmt(val)}</td></tr>`;
  const grossRev = a.revenue - a.disc_earned;
  el.innerHTML = `
    <div class="card-title">بناء إجمالي الإيرادات</div>
    <table class="pl-stmt" style="width:100%"><tbody>
      ${R('+ فواتير المبيعات (بدون ضريبة)', a.sales_rev, 'color:#4ada8e')}
      ${a.sales_ret    ? R('− مردودات المبيعات', -a.sales_ret, 'color:#5baef0') : ''}
      ${a.other_rev    ? R('+ إيرادات خدمات أخرى', a.other_rev, 'color:#4ada8e') : ''}
      ${Math.abs(a.unclass_rev) > 100 ? R('± إيرادات أخرى', a.unclass_rev, 'color:#f0c050') : ''}
      <tr class="pl-subtotal"><td>= إجمالي المبيعات (قبل خصم العملاء)</td>
        <td class="pl-num">${fmt(grossRev)}</td></tr>
      ${a.disc_sales   ? R('− خصم مسموح وخصم مبيعات للعملاء (4010101002+007)', -a.disc_sales, 'color:#5baef0') : ''}
      <tr class="pl-subtotal"><td><strong>= صافي الإيرادات</strong></td>
        <td class="pl-num"><strong>${fmt(a.net_revenue)}</strong></td></tr>
    </tbody></table>`;
}

function plcRenderCogsBox(a) {
  const el = document.getElementById('plc-cogs-box');
  if (!el) return;
  const R = (lbl, val, st='') => `<tr><td style="color:#8ab0cc">${lbl}</td><td class="pl-num"${st?` style="${st}"`:''}>${fmt(val)}</td></tr>`;

  // inv_overstatement = ei_ledger − ei_periodic
  // Positive → ledger higher than periodic estimate (FallbackCostInBase or landed costs)
  // Negative → periodic estimate higher than ledger (AVCO divergence from ERP actual costs)
  const absOver    = Math.abs(a.inv_overstatement);
  const overColor  = absOver > 100000 ? '#da9a4a' : '#607080';
  const overLabel  = a.inv_overstatement >= 0
    ? 'الدفتري أعلى من التقدير بالكميات ▲'
    : 'التقدير بالكميات أعلى من الدفتري ▼';
  const overNote   = a.inv_overstatement >= 0
    ? `المخزون الدفتري (10302%) أعلى من التقدير بالكميات بفارق ${fmt(absOver)} ر.س —
       الأسباب المحتملة: (أ) فواتير شراء قُيِّدت في 10302% لبضاعة سبق بيعها بسعر FallbackCostInBase،
       (ب) تكاليف لوجستية (نقل/تخليص) مُدمجة في 10302% غير مُضمَّنة في متوسط سعر الشراء.`
    : `التقدير بالكميات (كميات × متوسط PI) أعلى من المخزون الدفتري بفارق ${fmt(absOver)} ر.س —
       الأسباب المحتملة: (أ) فجوة بين متوسط سعر الشراء التاريخي المستخدم في التقدير وأسعار التكلفة
       الفعلية في دفاتر ERP، (ب) خفض قيمة مخزون مُسجَّل في 10302% دون كميات مقابلة.`;

  el.innerHTML = `
    <div class="card-title">تحليل تكلفة البضاعة المباعة والمخزون</div>

    <div style="font-size:.78rem;color:#5baef0;margin-bottom:8px;font-weight:600">بناء تكلفة المبيعات — مرجعي (يُقارب الجرد الدائم)</div>
    <table class="pl-stmt" style="width:100%"><tbody>
      ${R('رصيد المخزون أول المدة (10302%)', a.bi)}
      ${R('+ مشتريات الموردين (بدون ضريبة)', a.purchases_av, 'color:#da9a4a')}
      ${a.disc_earned ? R('− خصم مكتسب وخصم مشتريات من الموردين (5010201005+006 خصم)', -a.disc_earned, 'color:#4ada8e') : ''}
      ${(a.adj_breakdown || []).map(([type, amt]) =>
          R((amt >= 0 ? '+ ' : '− ') + type, amt, amt >= 0 ? 'color:#da9a4a' : 'color:#5baef0')
        ).join('')}
      ${a.returns_av ? R('− مردودات الشراء (بدون ضريبة)', a.returns_av, 'color:#5baef0') : ''}
      ${R('− مخزون آخر المدة (10302%)', a.ei, 'color:#da4a4a')}
    </tbody></table>

    <div style="margin-top:10px;border-top:1px solid #1e3040;padding-top:10px">
      <div style="font-size:.78rem;color:#5baef0;margin-bottom:6px;font-weight:600">المعتمد في قائمة الدخل (جرد دائم — 4010101%)</div>
      <table class="pl-stmt" style="width:100%"><tbody>
        ${R('تكلفة مبيعات البضاعة', a.sales_pure_cogs)}
        ${a.write_down_cogs ? R('+ خسائر هبوط المخزون (DecreaseStock)', a.write_down_cogs, 'color:#da4a4a') : ''}
        <tr class="pl-subtotal"><td><strong>= إجمالي تكلفة البضاعة المباعة</strong></td>
          <td class="pl-num"><strong>${fmt(a.pure_cogs)}</strong></td></tr>
      </tbody></table>
    </div>

    <div style="margin-top:14px;border-top:1px solid #1e3040;padding-top:12px">
      <div style="font-size:.78rem;color:#da9a4a;margin-bottom:8px;font-weight:600">تحليل فجوة تقييم المخزون</div>
      <table class="pl-stmt" style="width:100%"><tbody>
        <tr><td style="color:#607080;font-size:.78rem">مخزون آخر المدة الدفتري (10302%)</td>
            <td class="pl-num" style="color:#607080;font-size:.78rem">${fmt(a.ei_ledger)}</td></tr>
        <tr><td style="color:#8ab0cc;font-size:.78rem">تقدير المخزون بالكميات (كميات × متوسط PI)</td>
            <td class="pl-num" style="color:#8ab0cc;font-size:.78rem">${fmt(a.ei_periodic)}</td></tr>
        <tr><td style="color:${overColor};font-size:.78rem;font-weight:600">فرق التقييم (دفتري − تقدير) — ${overLabel}</td>
            <td class="pl-num" style="color:${overColor};font-size:.78rem;font-weight:600">${fmt(a.inv_overstatement)}</td></tr>
      </tbody></table>
      <div style="margin-top:8px;font-size:.74rem;color:#456070;line-height:1.9;background:#06141e;padding:7px 10px;border-radius:5px;border:1px solid #1a3040">
        ${overNote}
      </div>
    </div>
    <div style="margin-top:8px;font-size:.77rem;color:#506070;line-height:1.8">
      <span style="color:#8090a0">أول المدة:</span> ${plcMonthLabel(plcPrevMo(a.from))}&ensp;
      <span style="color:#8090a0">آخر المدة:</span> ${plcMonthLabel(a.to)}
    </div>`;
}

function plcRenderTransactionTable(a) {
  const el = document.getElementById('plc-txn-table');
  if (!el) return;

  // ────────────────────────────────────────────────────────────────────────
  // ACCOUNTING PROOF:
  // When both systems use IDENTICAL inputs (same JV-based BI, same PI JV
  // amounts including landed costs, same PR amounts, same adjustments), the
  // COGS difference = EI valuation gap ONLY:
  //
  //   GAFS (identical) = bi_ledger + pi_jv_total − returns_av + mfg_av
  //   Perpetual COGS   = GAFS − EI_ledger   (10302% closing balance)
  //   Periodic COGS    = GAFS − EI_AVCO     (physical qty × all-time avg PI cost)
  //   Difference       = EI_ledger − EI_AVCO = inv_overstatement
  //
  // Verified numerically: GAFS(83.3M) − ei_ledger(15.6M) = 67.7M ≈ pure_cogs ✓
  // ────────────────────────────────────────────────────────────────────────

  const MAT = 50_000;

  // Same-basis: both columns use perp_avail (identical JV-based GAFS)
  const perp_avail     = a.bi + a.pi_jv_total - a.returns_av + a.mfg_av;
  const samebasis_cogs = perp_avail - a.ei_periodic;    // periodic with JV inputs
  // Verify: samebasis_cogs − a.pure_cogs = a.inv_overstatement (EI gap)

  // Reconciliation from samebasis → current periodic formula
  // Current periodic uses: AVCO BI, PI doc amounts (no landed), deducts disc_earned
  const rec_bi     = a.bi - a.bi_periodic;     // ledger BI − AVCO BI
  const rec_landed = a.landed_costs;            // pi_jv_total − purchases_av
  const rec_disc   = a.disc_earned;             // deducted in current, not in same-basis
  // samebasis_cogs − periodic_cogs = rec_bi + rec_landed + rec_disc ✓

  // sign: '+' adds to COGS (amber), '-' deducts from COGS (blue), 'na' = not applicable (—)
  // abs_val is always the absolute magnitude; sign controls prefix and color.
  function amtCell(abs_val, sign, trt) {
    if (sign === 'na') {
      return `<td class="pl-num"><span style="color:#3a5060;font-style:italic">—</span>`
           + `<span class="txn-trt">${trt}</span></td>`;
    }
    const zero  = Math.abs(+abs_val) < 0.5;
    const color = zero ? '#3a5060' : sign === '+' ? '#da9a4a' : '#5baef0';
    const pfx   = sign === '+' ? '+' : '−';
    return `<td class="pl-num"><span style="color:${color}">${zero ? '—' : pfx + fmt(+abs_val)}</span>`
         + `<span class="txn-trt">${trt}</span></td>`;
  }

  // diff = perpetual_component − periodic_component (null = explanatory sub-row, no diff shown)
  function diffCell(d) {
    if (d === null) return `<td class="pl-num"><span style="color:#3a5060">—</span></td>`;
    if (Math.abs(d) < 0.5) return `<td class="pl-num"><span style="color:#3a5060;font-style:italic">=</span></td>`;
    const c = d > 0 ? '#da9a4a' : '#4ada8e';
    return `<td class="pl-num" style="color:${c};font-weight:500">${d > 0 ? '+' : ''}${fmt(d)}</td>`;
  }

  function grpRow(lbl) {
    return `<tr class="txn-grp"><td colspan="4" style="color:#4a7090">${lbl}</td></tr>`;
  }

  function dataRow(lbl, periC, perpC, diff, opt = {}) {
    let cls = '';
    if (opt.sub) cls += ' txn-sub';
    if (opt.hl)  cls += ' txn-hlrow';
    if (opt.dim) cls += ' txn-dimrow';
    return `<tr class="${cls.trim()}"><td>${lbl}</td>${periC}${perpC}${diffCell(diff)}</tr>`;
  }

  function subtotRow(lbl, peri, perp) {
    const d  = perp - peri;
    const dc = Math.abs(d) < 0.5 ? '#3a5060' : d > 0 ? '#da9a4a' : '#4ada8e';
    const ds = Math.abs(d) < 0.5 ? '=' : (d > 0 ? '+' : '') + fmt(d);
    return `<tr class="txn-subtot">
      <td>${lbl}</td>
      <td class="pl-num" style="color:#da9a4a">${fmt(peri)}</td>
      <td class="pl-num" style="color:#da9a4a">${fmt(perp)}</td>
      <td class="pl-num" style="color:${dc}">${ds}</td>
    </tr>`;
  }

  function totalRow(lbl, peri, perp) {
    const d  = perp - peri;
    const dc = Math.abs(d) < 0.5 ? '#3a5060' : d > 0 ? '#da9a4a' : '#4ada8e';
    const ds = Math.abs(d) < 0.5 ? '=' : (d > 0 ? '+' : '') + fmt(d);
    return `<tr class="txn-total">
      <td>${lbl}</td>
      <td class="pl-num" style="color:#da4a4a;font-size:.85rem">${fmt(peri)}</td>
      <td class="pl-num" style="color:#da4a4a;font-size:.85rem">${fmt(perp)}</td>
      <td class="pl-num" style="color:${dc};font-size:.85rem">${ds}</td>
    </tr>`;
  }

  // ── Build rows (both columns use identical JV-based inputs; only EI differs) ──
  const R = [];

  R.push(grpRow('مدخلات المعادلة — متطابقة في كلا النظامين'));

  R.push(dataRow('رصيد أول المدة',
    amtCell(a.bi, '+', 'رصيد حساب 10302% في بداية الفترة'),
    amtCell(a.bi, '+', 'رصيد حساب 10302% في بداية الفترة'),
    0, { dim: true }
  ));

  R.push(dataRow('مشتريات الموردين + تكاليف لوجستية',
    amtCell(a.pi_jv_total, '+', `Dr 10302% قيود PI = وثائق (${fmt(a.purchases_av)}) + لوجستي (${fmt(a.landed_costs)})`),
    amtCell(a.pi_jv_total, '+', `Dr 10302% قيود PI = وثائق (${fmt(a.purchases_av)}) + لوجستي (${fmt(a.landed_costs)})`),
    0, { dim: true }
  ));

  R.push(dataRow('مردودات المشتريات',
    amtCell(a.returns_av, '-', 'Cr 10302% في قيود مردودات الشراء'),
    amtCell(a.returns_av, '-', 'Cr 10302% في قيود مردودات الشراء'),
    0, { dim: true }
  ));

  if (a.mfg_av > 0.5) {
    R.push(dataRow('تسويات مخزون (توزيع تكاليف)',
      amtCell(a.mfg_av, '+', 'Dr 10302% (CostAllocation)'),
      amtCell(a.mfg_av, '+', 'Dr 10302% (CostAllocation)'),
      0, { dim: true }
    ));
  }

  R.push(subtotRow('البضاعة المتاحة للبيع', perp_avail, perp_avail));

  // ── THE ONLY DIFFERENCE ──────────────────────────────────────────────────
  R.push(grpRow('مخزون آخر المدة — الفرق الوحيد بين النظامين'));

  // diff = perp − samebasis = (perp_avail − ei) − (perp_avail − ei_periodic) = ei_periodic − ei = −inv_overstatement
  const ei_diff = a.ei_periodic - a.ei;
  R.push(dataRow('تقييم مخزون آخر المدة',
    amtCell(a.ei_periodic, '-', 'الكميات الفعلية × متوسط تكلفة PI جميع الفترات (AVCO)'),
    amtCell(a.ei,          '-', 'رصيد حساب 10302% الدفتري (بعد جميع قيود البيع والتسويات)'),
    ei_diff,
    { hl: Math.abs(a.inv_overstatement) > MAT }
  ));

  // ── COGS totals ───────────────────────────────────────────────────────────
  R.push(totalRow('تكلفة البضاعة المباعة', samebasis_cogs, a.pure_cogs));

  // ── Below-table section ───────────────────────────────────────────────────
  const cogs_diff   = a.pure_cogs - samebasis_cogs;   // = −inv_overstatement
  const diffColor   = Math.abs(cogs_diff) < 0.5 ? '#3a5060' : cogs_diff > 0 ? '#da9a4a' : '#4ada8e';
  const diffDir     = cogs_diff > 0 ? 'الجرد الدائم أعلى' : cogs_diff < 0 ? 'الجرد الدوري أعلى' : 'متطابقان';

  // Reconciliation: samebasis → current periodic_cogs
  // current formula uses AVCO BI, PI doc amounts (no landed), deducts disc_earned
  // samebasis_cogs − periodic_cogs = rec_bi + rec_landed + rec_disc
  const rec_total = rec_bi + rec_landed + rec_disc;
  function recLine(lbl, val, note) {
    const c = Math.abs(val) < 0.5 ? '#3a5060' : val > 0 ? '#da9a4a' : '#4ada8e';
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #0a1e2e">
      <div><span style="font-size:.73rem;color:#8ab0cc">${lbl}</span>
           <span style="font-size:.64rem;color:#3a5060;margin-right:6px">${note}</span></div>
      <span style="font-size:.75rem;font-weight:600;color:${c}">${val>0.5?'+':''}${fmt(val)}</span>
    </div>`;
  }

  const belowTable = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px;border-top:1px solid #1a3040;padding-top:12px">

      <!-- Card A: proof summary -->
      <div style="flex:1.2;min-width:240px;background:#06141e;border:1px solid #1a3040;border-radius:6px;padding:12px 14px">
        <div style="font-size:.73rem;color:#5090b0;font-weight:600;margin-bottom:8px">إثبات: الفرق = فجوة تقييم EI فقط</div>
        ${recLine('متاح للبيع (مدخلات متطابقة)', perp_avail, '= BI + PI − PR + تسويات')}
        ${recLine('(−) EI دوري (AVCO)',   a.ei_periodic, `الكميات الفعلية × متوسط التكلفة`)}
        ${recLine('= COGS دوري (نفس الأساس)', samebasis_cogs, '')}
        ${recLine('(−) EI دائم (دفتري)', a.ei, `رصيد 10302% نهاية الفترة`)}
        ${recLine('= COGS دائم', a.pure_cogs, '')}
        <div style="display:flex;justify-content:space-between;padding:8px 0 0">
          <span style="font-size:.73rem;color:#8ab0cc;font-weight:600">فرق EI = فرق COGS</span>
          <span style="font-size:.85rem;font-weight:700;color:${diffColor}">${cogs_diff>0?'+':''}${fmt(cogs_diff)}</span>
        </div>
        <div style="font-size:.64rem;color:${diffColor};margin-top:2px">${diffDir}</div>
      </div>

      <!-- Card B: reconciliation with current periodic formula -->
      <div style="flex:1;min-width:240px;background:#06141e;border:1px solid #1a3040;border-radius:6px;padding:12px 14px">
        <div style="font-size:.73rem;color:#5090b0;font-weight:600;margin-bottom:8px">تسوية مع صيغة الجرد الدوري الحالية</div>
        <div style="font-size:.65rem;color:#2e4050;margin-bottom:8px">الصيغة الحالية تستخدم مدخلات مختلفة عن قيود JV</div>
        ${recLine('COGS دوري — بنفس الأساس', samebasis_cogs, 'من الجدول أعلاه')}
        ${recLine('فرق BI (AVCO مقابل دفتري)', -(rec_bi),
            `AVCO ${fmt(a.bi_periodic)} مقابل دفتري ${fmt(a.bi)}`)}
        ${recLine('تكاليف لوجستية محذوفة', -(rec_landed),
            `وثيقة PI لا تشمل النقل والتخليص`)}
        ${a.disc_earned > 0.5 ? recLine('خصم مكتسب مخصوم من المشتريات', -(rec_disc),
            'الصيغة الحالية تخصمه — يُخفّض COGS') : ''}
        <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:1px solid #1a3040;margin-top:4px">
          <span style="font-size:.73rem;color:#8ab0cc;font-weight:600">COGS دوري (الصيغة الحالية)</span>
          <span style="font-size:.85rem;font-weight:700;color:#da4a4a">${fmt(a.periodic_cogs)}</span>
        </div>
      </div>

    </div>`;

  el.innerHTML = `
    <div class="card-title">إثبات تطابق COGS — الجرد الدوري والدائم بنفس الأساس المحاسبي</div>
    <div style="margin-bottom:10px;font-size:.72rem;color:#3a6070;line-height:1.7">
      باستخدام <strong style="color:#8ab0c0">نفس مدخلات حساب 10302%</strong> لكلا النظامين
      (رصيد أول المدة الدفتري + قيود PI + تسويات − قيود مردودات)،
      الفرق الوحيد هو <strong style="color:#e09060">كيفية تقييم مخزون آخر المدة</strong>:
      الدوري يستخدم <span style="color:#7ac8f0">الكميات الفعلية × AVCO</span>،
      والدائم يستخدم <span style="color:#da9a4a">الرصيد الدفتري لحساب 10302%</span>.
    </div>
    <div style="overflow-x:auto">
      <table class="plc-txn-tbl">
        <thead>
          <tr>
            <th style="width:36%">بند المعادلة</th>
            <th class="pl-num" style="color:#7ac8f0;width:22%">◌ الجرد الدوري<br>
              <span style="font-size:.64rem;font-weight:400;color:#3a6070">نفس مدخلات JV + EI بـ AVCO</span></th>
            <th class="pl-num" style="color:#da9a4a;width:22%">● الجرد الدائم<br>
              <span style="font-size:.64rem;font-weight:400;color:#60481a">نفس مدخلات JV + EI دفتري</span></th>
            <th class="pl-num" style="width:12%">الفرق</th>
          </tr>
        </thead>
        <tbody>${R.join('')}</tbody>
      </table>
    </div>
    ${belowTable}`;
}

function plcRenderAdjDetail(data, adjAndOther) {
  const card = document.getElementById('plc-adj-card');
  const box  = document.getElementById('plc-adj-box');
  if (!card || !box) return;
  if (!data || !data.summary || !data.summary.length) { card.style.display = 'none'; return; }

  card.style.display = '';
  const { summary, increases } = data;

  const typeColor = {
    'زيادة مخزون': '#da9a4a', 'نقص مخزون': '#5baef0',
    'توزيع تكاليف': '#da9a4a', 'مخزون أول المدة': '#7ac8f0',
    'قيد يدوي': '#f0c050',
    'إيصال بضاعة تامة': '#8090a0', 'إصدار مواد خام': '#8090a0',
    'تحويل وارد': '#8090a0', 'تحويل صادر': '#8090a0', 'تسليم بضاعة': '#8090a0',
  };
  // Rows with zero net are internal movements (transfers, raw materials, delivery) — shown dimmed
  const sumRows = summary.map(r => {
    const isZero = Math.abs(r.net_amount) < 1;
    const c   = isZero ? '#404858' : (typeColor[r.doc_type] || '#8ab0cc');
    const tc  = isZero ? '#404858' : '#8ab0cc';
    const sgn = r.net_amount >= 0 ? '+' : '';
    const amtTxt = isZero ? '<span style="color:#354048">صفر (حركة داخلية)</span>' : `<span style="color:${c}">${sgn}${fmt(r.net_amount)}</span>`;
    return `<tr>
      <td style="color:${tc}">${esc(r.doc_type)}</td>
      <td class="pl-num" style="color:#404858;font-size:.78rem">${r.jv_count} قيد</td>
      <td class="pl-num">${amtTxt}</td>
    </tr>`;
  }).join('');

  let incHtml = '';
  if (increases && increases.length) {
    const rows = increases.map(r => `<tr>
      <td style="color:#607080;font-size:.75rem">${esc(r.date)}</td>
      <td style="color:#8ab0cc;font-size:.78rem">${esc(r.description)}</td>
      <td class="pl-num" style="color:#da9a4a;font-size:.78rem">+${fmt(r.amount)}</td>
    </tr>`).join('');
    incHtml = `
      <div style="margin-top:14px;border-top:1px solid #1a3040;padding-top:12px">
        <div style="color:#7ac8f0;font-size:.8rem;margin-bottom:8px;font-weight:600">تفصيل تسويات الجرد بالزيادة</div>
        <table class="pl-stmt" style="width:100%">
          <thead><tr>
            <th style="color:#506070;font-size:.75rem;text-align:right">التاريخ</th>
            <th style="color:#506070;font-size:.75rem;text-align:right">البيان</th>
            <th style="color:#506070;font-size:.75rem;text-align:left">المبلغ</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  box.innerHTML = `
    <table class="pl-stmt" style="width:100%;margin-bottom:4px">
      <thead><tr>
        <th style="color:#506070;font-size:.78rem;text-align:right">النوع</th>
        <th style="color:#506070;font-size:.78rem;text-align:left">عدد</th>
        <th style="color:#506070;font-size:.78rem;text-align:left">صافي الحركة (10302%)</th>
      </tr></thead>
      <tbody>${sumRows}</tbody>
    </table>
    <div style="margin-top:10px;padding:8px 10px;background:#0a1c2c;border-radius:6px;font-size:.75rem;color:#506070;border:1px solid #1a3040;line-height:1.8">
      هذه الحركات تُعدّل حساب المخزون الدائم <strong style="color:#7090a0">(10302%)</strong>
      وتُضمَّن في تكلفة المخزون بالجرد الدوري.
      فرق التقييم الكلي (دفتري − تقدير بالكميات):
      <strong style="color:#da9a4a">${fmt(adjAndOther)} ر.س</strong>
      ${adjAndOther >= 0
        ? '— المخزون الدفتري أعلى (FallbackCostInBase أو تكاليف لوجستية مدمجة).'
        : '— التقدير بالكميات أعلى (فجوة متوسط سعر الشراء عن التكلفة الفعلية في ERP).'}
    </div>
    ${incHtml}`;
}

function plcRenderChart(data, from, to, db) {
  if (_plCompChart) { _plCompChart.destroy(); _plCompChart = null; }
  const ctx = document.getElementById('plc-chart');
  if (!ctx) return;
  const rows = data.filter(r => r.month >= from && r.month <= to);
  if (!rows.length) return;

  const opening = plcOpeningFor(db);
  let runBi = (() => {
    const bMo = plcPrevMo(from);
    const br  = data.find(r => r.month === bMo) || (bMo <= opening.month ? opening : null);
    return +(br?.inv_balance || 0);
  })();

  const labels = [], perpArr = [], periArr = [];
  rows.forEach(r => {
    const peri = runBi
      + (+r.purchases||0) + (+r.abs_transport||0) + (+r.abs_transit||0)
      + (+r.abs_clearance||0) + (+r.inv_adj||0)
      - (+r.purch_returns||0) - (+r.inv_balance||0);
    periArr.push(peri);
    perpArr.push(+r.cogs_perp||0);
    labels.push(r.label);
    runBi = +r.inv_balance||0;
  });

  _plCompChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label:'الجرد الدائم',          data:perpArr, backgroundColor:'rgba(91,174,240,.65)',  borderColor:'#5baef0', borderWidth:1, borderRadius:3 },
      { label:'الجرد الدوري (تقريبي)', data:periArr, backgroundColor:'rgba(218,100,74,.65)', borderColor:'#da644a', borderWidth:1, borderRadius:3 },
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:'#9ab', font:{ family:'Tajawal', size:12 } } },
        tooltip:{ callbacks:{ label: c => `${c.dataset.label}: ${fmt(c.raw)} ر.س` } }
      },
      scales:{
        x:{ ticks:{ color:'#8090a0', font:{ family:'Tajawal' } }, grid:{ color:'#1e3040' } },
        y:{ ticks:{ color:'#8090a0', font:{ family:'Tajawal' }, callback: v => fmt(v) }, grid:{ color:'#1e3040' } }
      }
    }
  });
}

function plcRenderMonthly(data, from, to, db) {
  const el = document.getElementById('plc-monthly-tbl');
  if (!el) return;
  const rows = data.filter(r => r.month >= from && r.month <= to);
  if (!rows.length) { el.innerHTML = '<p style="color:#607080;text-align:center;padding:20px">لا توجد بيانات</p>'; return; }

  const opening = plcOpeningFor(db);
  let runBi = (() => {
    const bMo = plcPrevMo(from);
    const br  = data.find(r => r.month === bMo) || (bMo <= opening.month ? opening : null);
    return +(br?.inv_balance || 0);
  })();

  el.innerHTML = `<table class="pl-stmt" style="width:100%">
    <thead><tr style="color:#5090b0;font-size:.75rem">
      <th style="text-align:right;padding:6px 14px">الشهر</th>
      <th class="pl-num">الإيرادات</th>
      <th class="pl-num">ت. دائم</th>
      <th class="pl-num">ت. دوري *</th>
      <th class="pl-num">الفرق</th>
      <th class="pl-num">مخزون دفتري</th>
    </tr></thead>
    <tbody>${rows.map(r => {
      const peri = runBi
        + (+r.purchases||0) + (+r.abs_transport||0) + (+r.abs_transit||0)
        + (+r.abs_clearance||0) + (+r.inv_adj||0)
        - (+r.purch_returns||0) - (+r.inv_balance||0);
      const diff = (+r.cogs_perp||0) - peri;
      const dcls = diff > 500 ? 'color:#da4a4a' : diff < -500 ? 'color:#4ada8e' : 'color:#607080';
      runBi = +r.inv_balance||0;
      return `<tr>
        <td style="color:#9ab">${r.label}</td>
        <td class="pl-num">${fmt(r.revenue)}</td>
        <td class="pl-num">${fmt(r.cogs_perp)}</td>
        <td class="pl-num">${fmt(peri)}</td>
        <td class="pl-num" style="${dcls}">${diff>=0?'+':''}${fmt(diff)}</td>
        <td class="pl-num">${fmt(r.inv_balance)}</td>
      </tr>`;
    }).join('')}</tbody></table>
    <div style="padding:8px 14px;font-size:.73rem;color:#456070">
      * التكلفة الدورية الشهرية تقريبية (مخزون دفتري). التكلفة الدورية الحقيقية ظاهرة في الملخص أعلاه.
    </div>`;
}

function plcRenderObs(a) {
  const el = document.getElementById('plc-obs');
  if (!el) return;
  const obs = [];
  const gm = a.net_revenue ? a.gp_perp / a.net_revenue : 0;
  if (Math.abs(a.inv_overstatement) > 500000)
    obs.push(`⚠ فرق تقييم المخزون: ${fmt(Math.abs(a.inv_overstatement))} ر.س — ${
      a.inv_overstatement > 0
        ? 'المخزون الدفتري أعلى من التقدير بالكميات (FallbackCostInBase أو تكاليف لوجستية مدمجة)'
        : 'التقدير بالكميات أعلى من المخزون الدفتري (فجوة متوسط سعر الشراء عن تكلفة ERP الفعلية)'
    }`);
  if (a.write_down_cogs > 500000)
    obs.push(`⚠ خسائر هبوط مخزون: ${fmt(a.write_down_cogs)} ر.س — مُسجَّلة ضمن تكلفة البضاعة المباعة (DecreaseStock)`);
  if (gm < 0.05 && a.revenue > 0)
    obs.push(`⚠ هامش الربح الإجمالي منخفض (${fmtPct(gm*100)}) — راجع تسعير المبيعات وتكاليف الشراء`);
  if (a.returns_av > 0 && a.purchases_av > 0 && a.returns_av > a.purchases_av * 0.05)
    obs.push(`⚠ مردودات المشتريات مرتفعة: ${fmtPct(a.returns_av/a.purchases_av*100)} من فواتير الشراء (${fmt(a.returns_av)} ر.س)`);
  if (a.ni_perp < 0)
    obs.push(`⚠ خسارة صافية: ${fmt(Math.abs(a.ni_perp))} ر.س`);
  if (!obs.length || obs.every(o => o.startsWith('⚠ فرق تقييم') || o.startsWith('⚠ خسائر هبوط')))
    obs.push(`◈ الجرد الدائم يُظهر ربحاً منطقياً — فارق التقييم في تحليل المخزون أدناه`);
  if (!obs.length)
    obs.push('✓ لا توجد ملاحظات جوهرية للفترة المحددة');
  el.innerHTML = obs.map(o =>
    `<div class="v-ok" style="text-align:right;padding:9px 14px;margin-bottom:6px;border-radius:6px;background:#0a1c2c;border:1px solid #1e3040">${o}</div>`
  ).join('');
}

async function renderPLComparison() {
  const db  = document.getElementById('plc-db-sel')?.value || 'MekSoftDb1';
  const kpi = document.getElementById('plc-kpis');

  if (!_plCompInited) {
    _plCompInited = true;
    plcShowMode(document.getElementById('plc-mode-sel')?.value || 'all');
  }

  if (kpi) kpi.innerHTML = '<div style="color:#607080;padding:20px;grid-column:1/-1;text-align:center">جارٍ تحميل البيانات…</div>';

  let data;
  try { data = await plcFetch(db); }
  catch (e) {
    if (kpi) kpi.innerHTML = `<div style="color:#da4a4a;padding:20px;grid-column:1/-1;text-align:center">خطأ: ${esc(e.message)}</div>`;
    return;
  }

  plcPopulateFilters(data);
  const period = plcGetPeriod();
  if (!period) {
    if (kpi) kpi.innerHTML = '<div style="color:#607080;padding:20px;grid-column:1/-1;text-align:center">حدد الفترة للعرض</div>';
    return;
  }

  const labelEl = document.getElementById('plc-period-label');
  if (labelEl) labelEl.textContent = period.label;

  const a = plcAggregate(data, period.from, period.to, db);
  if (!a) {
    if (kpi) kpi.innerHTML = '<div style="color:#607080;padding:20px;grid-column:1/-1;text-align:center">لا توجد بيانات للفترة المحددة</div>';
    return;
  }

  renderOpenMonthBanner('plc-open-month-banner', State.get('pl') || []);
  plcRenderKPIs(a);
  plcRenderStatement(a);
  plcRenderRevenueBox(a);
  plcRenderCogsBox(a);
  plcRenderTransactionTable(a);
  plcRenderChart(data, period.from, period.to, db);
  plcRenderMonthly(data, period.from, period.to, db);
  plcRenderObs(a);

  // Fetch and render adj detail asynchronously (non-blocking)
  const adjCard = document.getElementById('plc-adj-card');
  if (adjCard) adjCard.style.display = 'none';
  plcFetchAdjDetail(db, period.from, period.to)
    .then(adjData => plcRenderAdjDetail(adjData, a.inv_overstatement))
    .catch(() => { if (adjCard) adjCard.style.display = 'none'; });

  const notesEl = document.getElementById('plc-notes');
  if (notesEl) {
    const saved = localStorage.getItem('plc-notes-' + period.label);
    notesEl.value = saved != null ? saved : '';
  }

  _plcStartCountdown(period.label, a?.net_revenue);
}
