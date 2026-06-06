// ── Inventory Analysis Tab ────────────────────────────────────────────────────
const INV_MONTHS_S = ['أكت-25','نوف-25','ديس-25','ين-26','فب-26','مر-26','أب-26','مي-26'];
const INV_CATS_DEF = [
  {key:'tas', name:'تسليح (حديد)', unit:'طن',   color:'#4a9eda', colorA:'rgba(74,158,218,0.15)'},
  {key:'tao', name:'تسليح اخرى',   unit:'قطعة', color:'#f5a623', colorA:'rgba(245,166,35,0.15)'},
  {key:'sal', name:'مستلزمات السلامة', unit:'حبة', color:'#4ada8e', colorA:'rgba(74,218,142,0.15)'},
  {key:'taj', name:'حديد تجاري',   unit:'قطعة', color:'#a78bfa', colorA:'rgba(167,139,250,0.15)'},
];
const INV_OPEN_QTY = {tas:1121.2, tao:18930, sal:5876, taj:58};
// Net stock change per month (from InventoryTransactionOnlyIncludedView, all 7 types)
const INV_NET_QTY = {
  tas: [-133.9,  587.8, 1232.6, 1124.8, 1217.5,  266.3,  570.8,-1416.3],
  tao: [-1825.4, 247.6, 1302.5,  -78.9,-1107.2,-1792.4,-1694.7,  208.2],
  sal: [ 39555, 29266,  -6203,  -5269,  -6773,  -2149,  -3600,  -2508],
  taj: [ -284.3, 544.4,  199.4,  -19.3,  -36.4,   -5.8,  -96.3,   -8.5],
};
// COGS qty (DeliverGoods GroupQuantity, physical units leaving stock)
const INV_COGS_QTY = {
  tas: [4490.9,4373.7,4522.6,4959.1,3320.9,3076.3,3179.1,2852.3],
  tao: [2025.1,2723.4,3359.1,3070.8,4213.6,2898.5,3280.5,3310.8],
  sal: [337,6020,6209,5452,6864,2755,4074,5049],
  taj: [574.3,385.9,120.9,46.3,54.4,5.6,96.3,8.5],
};
// COGS value (DeliverGoods Amount)
const INV_COGS_VAL = {
  tas: [8926857,9184281,9462822,10679320,7266800,6525894,8100547,7684818],
  tao: [891377,781093,3842040,3304864,2385197,1191320,1143152,934953],
  sal: [0,859999,788739,640529,699226,289432,522551,819236],
  taj: [38010,24585,8190,2410,12486,495,11375,2185],
};
// Purchase qty (ReceiptGoods GroupQuantity) for FIFO aging
const INV_PURCH_QTY_ARR = {
  tas: [4345.3,4920.4,5778.2,6083.9,4538.4,3342.6,3754.6,1433.3],
  tao: [199.8,2518.9,4626.4,2991.9,3106.4,1106.1,1627.4,3512.5],
  sal: [39892,35286,6,183,91,606,474,2545],
  taj: [574,584,330,39,0,0,0,0],
};
// Purchase value (PurchaseInvoiceDetail Net)
const INV_PURCH_VAL = {
  tas: [9105565,10031960,11069141,12365149,9486001,6951606,8415208,3185218],
  tao: [3306,8692041,1928292,480974,270351,124200,213440,715623],
  sal: [3411404,1840891,0,75638,41741,129792,349345,52879],
  taj: [34798,14467,12432,2601,0,0,0,0],
};
// Sales value (SalesInvoiceDetail Net)
const INV_SALES_VAL_ARR = {
  tas: [10622159,10508905,10439249,12084524,8410305,6868564,8320715,8465293],
  tao: [660236,739201,3232884,2949306,1848696,620199,712316,768252],
  sal: [91713,988999,907050,739253,804110,332847,600934,1036788],
  taj: [43850,28272,9419,2772,14359,2726,13081,2513],
};
// Implied cost per unit (book value: Opening + Purchases - COGS, divided by closing qty)
// تسليح: opening at 1,835/ton (old cost); اخرى: opening at 64/pc (old cost); سلامة: bulk Oct-Nov at 53-85/pc
const INV_UNIT_COST = {tas:1094, tao:577, sal:42, taj:51};
// Account 41 (Finished Goods Stock) actual monthly closing balance — SOURCE OF TRUTH
const INV_ACCT41 = [8097456, 18623677, 18714029, 18003005, 18157834, 17743333, 18632355, 15057940];
const INV_ACCT41_OPEN = 4061406; // Sep-25 opening balance
// Account 124 (COGS) net monthly — P&L basis (after sales returns & adjustments)
// Gross debits = 84.1M; Credits (returns+adj) = 13.9M; Net = 70.2M
const INV_COGS_PL = [7620084, 9729111, 11900850, 11805336, 8675439, 6094847, 7160100, 7235469];
const INV_COGS_PL_TOTAL = 70221236;

const INV_CHARTS_OBJ = {};
let _invRendered = false;
let _invActiveCat = 'tas';

function _invCalcClosing(key) {
  const arr = []; let v = INV_OPEN_QTY[key];
  for (let i = 0; i < 8; i++) { v += INV_NET_QTY[key][i]; arr.push(v); }
  return arr;
}

function _invCalcDOH(key, closingArr) {
  const cq = INV_COGS_QTY[key];
  const avg3 = (cq[5]+cq[6]+cq[7]) / 3;
  const daily = avg3 / 30;
  return closingArr.map(q => daily < 0.01 ? 9999 : Math.round(q / daily));
}

function _invFifoAge(key, closingQty) {
  // Backwards-accumulate from May-26 purchases; month mid-point days ago from June 3, 2026
  const monthAge = [231,200,170,139,108,80,49,19];
  const buckets  = [0,0,0,0,0]; // <30, 30-60, 60-90, 90-180, >180
  let rem = closingQty;
  for (let i = 7; i >= 0 && rem > 0; i--) {
    const take = Math.min(INV_PURCH_QTY_ARR[key][i], rem);
    rem -= take;
    const a = monthAge[i];
    const b = a < 30 ? 0 : a < 60 ? 1 : a < 90 ? 2 : a < 180 ? 3 : 4;
    buckets[b] += take;
  }
  if (rem > 0) buckets[4] += rem;
  const tot = buckets.reduce((s,b)=>s+b,0);
  return tot > 0 ? buckets.map(b => b/tot*100) : [0,0,0,0,0];
}

function renderInventoryAnalysis() {
  if (_invRendered) return;
  _invRendered = true;

  const wrap = document.getElementById('tab-inventory');
  if (!wrap) return;

  if (!document.getElementById('inv-style')) {
    const s = document.createElement('style'); s.id = 'inv-style';
    s.textContent = `
      .inv-kpi-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
      .inv-kpi{flex:1;min-width:190px;background:#0d1f2d;border-radius:8px;padding:14px 16px;border:1px solid #1a3040;border-top:3px solid var(--inv-c,#4a9eda)}
      .inv-kpi .lbl{font-size:.72rem;color:#708090;margin-bottom:3px}
      .inv-kpi .val{font-size:1.45rem;font-weight:700;color:#e0ecf8;line-height:1.1}
      .inv-kpi .sub{font-size:.71rem;color:#a0b8c8;margin-top:3px}
      .inv-kpi .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.71rem;font-weight:600;margin-top:5px}
      .inv-sec{font-size:.8rem;font-weight:600;color:#4a9eda;letter-spacing:.04em;padding:14px 0 6px;border-bottom:1px solid #1a3040;margin-bottom:10px}
      .inv-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
      .inv-tab-btn{padding:5px 12px;border-radius:4px;cursor:pointer;font-size:.77rem;border:1px solid #1a3040;background:#0a1825;color:#a0b8c8;transition:.15s}
      .inv-tab-btn.on{color:#0a1825;font-weight:600}
      .inv-tbl{width:100%;border-collapse:collapse;font-size:.77rem}
      .inv-tbl th{background:#0a1825;padding:6px 9px;text-align:right;font-weight:600;color:#4a9eda;border-bottom:1px solid #1a3040;white-space:nowrap}
      .inv-tbl td{padding:5px 9px;border-bottom:1px solid #111e2a;color:#c0d0e0;white-space:nowrap}
      .inv-tbl td.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}
      .inv-tbl tr:hover td{background:#0e2030}
      .inv-tbl tr.tot td{font-weight:600;color:#e0ecf8;background:#0d1f2d}
      .inv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
      .inv-card{background:#0a1825;border-radius:8px;padding:14px;border:1px solid #1a3040}
      .inv-cht{height:210px;position:relative}
      .inv-age-bar{display:flex;height:26px;border-radius:4px;overflow:hidden;margin-bottom:5px;gap:2px}
      .inv-age-seg{display:flex;align-items:center;justify-content:center;font-size:.64rem;font-weight:700;overflow:hidden;white-space:nowrap;color:#0a1825;transition:.3s}
      .inv-rec{list-style:none;padding:0;margin:0}
      .inv-rec li{padding:8px 12px;border-radius:5px;margin-bottom:6px;font-size:.78rem;line-height:1.65;border-left:4px solid transparent}
      .inv-buy{background:#021408;border-color:#4ada8e;border-left-color:#4ada8e}
      .inv-warn{background:#1a1100;border-color:#f5c842;border-left-color:#f5c842}
      .inv-sell{background:#140202;border-color:#da4a4a;border-left-color:#da4a4a}
      @media(max-width:680px){.inv-grid2{grid-template-columns:1fr}.inv-kpi{min-width:140px}}
    `;
    document.head.appendChild(s);
  }

  const fN = v => Math.round(+v||0).toLocaleString('ar-SA');
  const fN1 = v => (+v||0).toLocaleString('ar-SA',{maximumFractionDigits:1});
  const fM = v => ((+v||0)/1e6).toFixed(2)+' م';
  const fK = v => Math.abs(+v||0) >= 1000 ? ((+v||0)/1000).toFixed(1)+'K' : Math.round(+v||0).toString();

  const closing = {}; INV_CATS_DEF.forEach(c => { closing[c.key] = _invCalcClosing(c.key); });
  const dohAll  = {}; INV_CATS_DEF.forEach(c => { dohAll[c.key]  = _invCalcDOH(c.key, closing[c.key]); });

  function dohSt(d) {
    if (d < 45)  return {lbl:'ممتاز',  c:'#4ada8e', bg:'rgba(74,218,142,.14)'};
    if (d < 90)  return {lbl:'طبيعي',  c:'#a0d080', bg:'rgba(160,208,128,.12)'};
    if (d < 150) return {lbl:'مراقبة', c:'#f5c842', bg:'rgba(245,200,66,.14)'};
    if (d < 270) return {lbl:'مرتفع',  c:'#f5a623', bg:'rgba(245,166,35,.14)'};
    return              {lbl:'مفرط',   c:'#da4a4a', bg:'rgba(218,74,74,.14)'};
  }

  // P&L COGS from Account 124 net (after returns & adjustments) — 70.2M
  const totCogsAll  = INV_COGS_PL_TOTAL;
  // Use Account 41 for accurate inventory values
  const totInvVal   = INV_ACCT41[7]; // 15,057,940 — actual Account 41 closing balance
  const avgInvVal   = INV_ACCT41.reduce((a,b)=>a+b,0) / 8; // monthly avg from Account 41
  const annTurnover = totCogsAll > 0 && avgInvVal > 0 ? (totCogsAll/(8/12))/avgInvVal : 0;
  const dsi = annTurnover > 0 ? Math.round(365/annTurnover) : 0;

  // ── KPI Cards ──
  let kpiHtml = `<div class="inv-kpi-row">`;
  INV_CATS_DEF.forEach(c => {
    const cl = closing[c.key][7];
    const doh = dohAll[c.key][7];
    const st = dohSt(doh > 9000 ? 9999 : doh);
    const invV = cl * INV_UNIT_COST[c.key];
    kpiHtml += `<div class="inv-kpi" style="--inv-c:${c.color}">
      <div class="lbl">${c.name}</div>
      <div class="val">${fN1(cl)} <span style="font-size:.75rem;color:#708090">${c.unit}</span></div>
      <div class="sub">قيمة دفترية تقريبية: ${fM(invV)} ر.س</div>
      <div class="badge" style="background:${st.bg};color:${st.c}">DOH: ${doh>999?'∞':doh+' يوم'} — ${st.lbl}</div>
    </div>`;
  });
  kpiHtml += `</div>`;

  // ── Summary row ──
  const sumHtml = `<div class="inv-kpi-row">
    <div class="inv-kpi" style="--inv-c:#e0c060">
      <div class="lbl">قيمة المخزون — نهاية مايو 2026</div>
      <div class="val">${fM(totInvVal)} ر.س</div>
      <div class="sub">من حساب البضاعة (حـ/41) · مُراجَع من ERP</div>
    </div>
    <div class="inv-kpi" style="--inv-c:#4ada8e">
      <div class="lbl">تكلفة المبيعات الصافية (8 أشهر)</div>
      <div class="val">${fM(totCogsAll)} ر.س</div>
      <div class="sub">حـ/124 صافي · بعد المردودات والتسويات</div>
    </div>
    <div class="inv-kpi" style="--inv-c:#4a9eda">
      <div class="lbl">معدل دوران المخزون (سنوي مُعدَّل)</div>
      <div class="val">${annTurnover.toFixed(1)}×</div>
      <div class="sub">DSI ≈ ${dsi} يوم · متوسط مخزون ${fM(avgInvVal)} ر.س</div>
    </div>
  </div>`;

  // ── Movement Table ──
  function buildMovTable(key) {
    const c   = INV_CATS_DEF.find(x=>x.key===key);
    const cl  = closing[key];
    const doh = dohAll[key];
    let h = `<div style="overflow-x:auto"><table class="inv-tbl"><thead><tr>
      <th>الشهر</th>
      <th class="n">فتح (${c.unit})</th>
      <th class="n">مشتريات (${c.unit})</th>
      <th class="n">خروج COGS (${c.unit})</th>
      <th class="n">مبيعات (ر.س)</th>
      <th class="n">إغلاق (${c.unit})</th>
      <th class="n">قيمة الإغلاق</th>
      <th class="n">DOH</th>
      <th class="n">هامش %</th>
    </tr></thead><tbody>`;
    let open = INV_OPEN_QTY[key];
    for (let i = 0; i < 8; i++) {
      const pq  = INV_PURCH_QTY_ARR[key][i];
      const cq  = INV_COGS_QTY[key][i];
      const cv  = INV_COGS_VAL[key][i];
      const sv  = INV_SALES_VAL_ARR[key][i];
      const gm  = sv > 0 ? (sv-cv)/sv*100 : null;
      const clI = cl[i];
      const d   = doh[i]; const st = dohSt(d>9000?9999:d);
      const invV = clI * INV_UNIT_COST[key];
      h += `<tr>
        <td style="color:#a0c0e0">${INV_MONTHS_S[i]}</td>
        <td class="n">${fN1(open)}</td>
        <td class="n" style="color:#90c8f0">${fN1(pq)}</td>
        <td class="n" style="color:#f09090">${fN1(cq)}</td>
        <td class="n">${fK(sv)}</td>
        <td class="n" style="font-weight:600;color:#e0ecf8">${fN1(clI)}</td>
        <td class="n">${fM(invV)}</td>
        <td class="n" style="color:${st.c};font-weight:600">${d>999?'∞':d}</td>
        <td class="n" style="color:${gm===null?'#708090':gm>18?'#4ada8e':gm>5?'#f5c842':'#da4a4a'}">${gm===null?'—':gm.toFixed(1)+'%'}</td>
      </tr>`;
      open = clI;
    }
    const tPQ  = INV_PURCH_QTY_ARR[key].reduce((a,b)=>a+b,0);
    const tCQ  = INV_COGS_QTY[key].reduce((a,b)=>a+b,0);
    const tCV  = INV_COGS_VAL[key].reduce((a,b)=>a+b,0);
    const tSV  = INV_SALES_VAL_ARR[key].reduce((a,b)=>a+b,0);
    const tGM  = tSV > 0 ? (tSV-tCV)/tSV*100 : null;
    h += `<tr class="tot">
      <td>الإجمالي / الإغلاق</td><td class="n"></td>
      <td class="n">${fN1(tPQ)}</td><td class="n">${fN1(tCQ)}</td>
      <td class="n">${fM(tSV)}</td>
      <td class="n">${fN1(cl[7])}</td>
      <td class="n">${fM(cl[7]*INV_UNIT_COST[key])}</td>
      <td class="n">—</td>
      <td class="n" style="color:${tGM&&tGM>5?'#4ada8e':'#f5a623'}">${tGM!==null?tGM.toFixed(1)+'%':'—'}</td>
    </tr>`;
    h += `</tbody></table></div>`;
    return h;
  }

  // ── Aging Section ──
  const AGE_LABELS = ['< 30 يوم','30–60','60–90','90–180','> 180 يوم'];
  const AGE_COLORS = ['#4ada8e','#a0d080','#f5c842','#f5a623','#da4a4a'];
  let agingHtml = `<div class="inv-sec">تحليل عمر المخزون (FIFO تقريبي — نهاية مايو 2026)</div>
  <div style="font-size:.71rem;color:#708090;margin-bottom:12px">الشرائح ممثَّلة بالأيام منذ استلام البضاعة · يُحسب بطريقة FIFO (الأقدم يخرج أولاً)</div>`;
  INV_CATS_DEF.forEach(c => {
    const cl = closing[c.key][7];
    const pct = _invFifoAge(c.key, cl);
    agingHtml += `<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.77rem;margin-bottom:5px">
        <span style="color:${c.color};font-weight:600">${c.name}</span>
        <span style="color:#708090">${fN1(cl)} ${c.unit}</span>
      </div>
      <div class="inv-age-bar">
        ${pct.map((p,i)=>p<0.8?'':
          `<div class="inv-age-seg" style="width:${p.toFixed(1)}%;background:${AGE_COLORS[i]}">${p>8?Math.round(p)+'%':''}</div>`
        ).join('')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:3px">
        ${pct.map((p,i)=>p<1?'':
          `<span style="font-size:.68rem;color:${AGE_COLORS[i]}">● ${AGE_LABELS[i]}: ${p.toFixed(0)}%</span>`
        ).join('')}
      </div>
    </div>`;
  });

  // ── Recommendations ──
  const dT = dohAll.tas[7], dTa = dohAll.tao[7], dS = dohAll.sal[7];
  const recHtml = `<div class="inv-sec">التوصيات بناءً على التحليل</div>
  <ul class="inv-rec">
    <li class="inv-buy">
      <strong>✓ تسليح (حديد) — مخزون سليم:</strong> DOH ${dT} يوم · مخزون ختامي ${Math.round(closing.tas[7]).toLocaleString('ar-SA')} طن. الشراء تراجع في مايو (${Math.round(INV_PURCH_QTY_ARR.tas[7]).toLocaleString('ar-SA')} طن مقابل ${Math.round(INV_PURCH_QTY_ARR.tas[6]).toLocaleString('ar-SA')} في أبريل). راقب حركة يونيو — إن تجاوزت المبيعات 2,500 طن/شهر أعد الطلب.
    </li>
    <li class="inv-warn">
      <strong>⚠ تسليح اخرى — مرتفع:</strong> DOH ${dTa} يوم · 9% من المخزون (≈1,260 قطعة) من نوفمبر 2025 (7+ أشهر). COGS ديسمبر-يناير تجاوزت المبيعات — راجع التسعير. التوصية: لا شراء حتى ينخفض المخزون إلى 8,000 قطعة، ثم أوامر صغيرة متكررة بدلاً من دفعات كبيرة.
    </li>
    <li class="inv-sell">
      <strong>✗ مستلزمات السلامة — مفرط:</strong> DOH ${dS > 999 ? '>999' : dS} يوم · 92% من المخزون مشتراة أكتوبر-نوفمبر 2025 (7-8 أشهر). الشراء في أكتوبر (39,892 حبة) ونوفمبر (35,286 حبة) كان ضخماً جداً. القيمة المُجمَّدة ${fM(closing.sal[7]*INV_UNIT_COST.sal)} ر.س. توقف فوري عن الشراء — راجع تفصيل المنتج في تبويب السلامة.
    </li>
    <li class="inv-warn">
      <strong>⚠ حديد تجاري — بلا حركة:</strong> لا مشتريات منذ يناير 2026 (5+ أشهر). القيمة ضئيلة. الوضع مستقر لكن راقب الطلبات — إن عادت المبيعات إلى 300+ قطعة/شهر أعد التقييم.
    </li>
  </ul>`;

  // ── Assemble ──
  wrap.innerHTML = `<div style="padding:16px 0;direction:rtl">
    <div style="font-size:.79rem;color:#708090;margin-bottom:16px">
      الفترة: أكتوبر 2025 – مايو 2026 · 8 أشهر · المصدر: ERP MekSoftDb1 (DeliverGoods / ReceiptGoods / SalesInvoice / PurchaseInvoice)
    </div>
    <div class="inv-sec">ملخص المخزون الكلي</div>
    ${sumHtml}
    <div class="inv-sec">المخزون الختامي حسب المجموعة (نهاية مايو 2026)</div>
    ${kpiHtml}
    <div class="inv-sec">الحركة الشهرية</div>
    <div class="inv-tabs" id="inv-tabs">
      ${INV_CATS_DEF.map(c=>`<button class="inv-tab-btn${c.key===_invActiveCat?' on':''}"
        style="${c.key===_invActiveCat?`background:${c.color}`:''}"
        data-key="${c.key}">${c.name}</button>`).join('')}
    </div>
    <div id="inv-mov-tbl">${buildMovTable(_invActiveCat)}</div>
    <div class="inv-grid2" style="margin-top:18px">
      <div class="inv-card">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">📉 DOH الشهرية (أيام الاحتياط)</div>
        <div class="inv-cht"><canvas id="inv-c-doh"></canvas></div>
      </div>
      <div class="inv-card">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">📦 المخزون الختامي الشهري</div>
        <div class="inv-cht"><canvas id="inv-c-stock"></canvas></div>
      </div>
    </div>
    <div class="inv-grid2">
      <div class="inv-card" style="margin-bottom:18px">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">💰 تكلفة المبيعات الشهرية (COGS) حسب المجموعة</div>
        <div class="inv-cht" style="height:190px"><canvas id="inv-c-cogs"></canvas></div>
      </div>
      <div class="inv-card" style="margin-bottom:18px">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">🏦 قيمة المخزون الشهرية — حساب 41 (ر.س)</div>
        <div class="inv-cht" style="height:190px"><canvas id="inv-c-acct41"></canvas></div>
      </div>
    </div>
    ${agingHtml}
    ${recHtml}
  </div>`;

  // Tab switching
  document.querySelectorAll('#inv-tabs .inv-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _invActiveCat = btn.dataset.key;
      document.querySelectorAll('#inv-tabs .inv-tab-btn').forEach(b => {
        b.classList.remove('on'); b.style.background = '';
      });
      btn.classList.add('on');
      btn.style.background = INV_CATS_DEF.find(c=>c.key===_invActiveCat).color;
      document.getElementById('inv-mov-tbl').innerHTML = buildMovTable(_invActiveCat);
    });
  });

  _invBuildCharts(closing, dohAll);
}

function _invBuildCharts(closing, dohAll) {
  const CO_BASE = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{color:'#a0b8c8',font:{size:10},boxWidth:12}}},
    scales:{
      x:{ticks:{color:'#708090',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}},
      y:{ticks:{color:'#708090',font:{size:10}},grid:{color:'rgba(255,255,255,.06)'}},
    }
  };

  // DOH chart — cap at 400
  const dohCtx = document.getElementById('inv-c-doh');
  if (dohCtx) {
    INV_CHARTS_OBJ.doh = new Chart(dohCtx, {
      type:'line',
      data:{
        labels: INV_MONTHS_S,
        datasets: INV_CATS_DEF.map(c=>({
          label: c.name,
          data: dohAll[c.key].map(d=>Math.min(d,400)),
          borderColor: c.color, backgroundColor: c.colorA,
          borderWidth:2, tension:0.3, fill:false, pointRadius:4,
        }))
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          annotation:{drawTime:'beforeDraw'},
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${i.raw >= 400 ? '>400' : i.raw} يوم`}}
        },
        scales:{...CO_BASE.scales, y:{...CO_BASE.scales.y,
          max:420,
          ticks:{...CO_BASE.scales.y.ticks, callback:v=>v>=400?'+400':v},
          title:{display:true,text:'أيام',color:'#708090',font:{size:10}}
        }}
      }
    });
  }

  // Closing stock chart (dual concept: تسليح in tons on left, others scaled)
  const stCtx = document.getElementById('inv-c-stock');
  if (stCtx) {
    INV_CHARTS_OBJ.stock = new Chart(stCtx, {
      type:'bar',
      data:{
        labels: INV_MONTHS_S,
        datasets:[
          {label:'تسليح (طن)', data:closing.tas, backgroundColor:'rgba(74,158,218,0.75)', yAxisID:'y'},
          {label:'تسليح اخرى ÷10', data:closing.tao.map(v=>v/10), backgroundColor:'rgba(245,166,35,0.55)', yAxisID:'y'},
          {label:'السلامة ÷100', data:closing.sal.map(v=>v/100), backgroundColor:'rgba(74,218,142,0.5)', yAxisID:'y'},
        ]
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          tooltip:{callbacks:{label:i=>{
            const raw = i.raw;
            const scale = i.dataset.label.includes('÷10') ? 10 : i.dataset.label.includes('÷100') ? 100 : 1;
            return `${i.dataset.label}: ${Math.round(raw*scale).toLocaleString('ar-SA')}`;
          }}}
        }
      }
    });
  }

  // COGS chart — stacked bars (gross by category) + net P&L line
  const cogsCtx = document.getElementById('inv-c-cogs');
  if (cogsCtx) {
    INV_CHARTS_OBJ.cogs = new Chart(cogsCtx, {
      type:'bar',
      data:{
        labels: INV_MONTHS_S,
        datasets:[
          {label:'تسليح (إجمالي)', data:INV_COGS_VAL.tas, backgroundColor:'rgba(74,158,218,0.75)', stack:'gross'},
          {label:'تسليح اخرى', data:INV_COGS_VAL.tao, backgroundColor:'rgba(245,166,35,0.75)', stack:'gross'},
          {label:'مستلزمات السلامة', data:INV_COGS_VAL.sal, backgroundColor:'rgba(74,218,142,0.65)', stack:'gross'},
          {label:'تجاري', data:INV_COGS_VAL.taj, backgroundColor:'rgba(167,139,250,0.65)', stack:'gross'},
          {label:'صافي التكلفة (حـ/124)', data:INV_COGS_PL, type:'line',
           borderColor:'#ff6b6b', backgroundColor:'transparent',
           borderWidth:2.5, borderDash:[5,3], pointRadius:4, tension:0.3, order:0},
        ]
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${(i.raw/1e6).toFixed(2)} م ر.س`}}
        },
        scales:{...CO_BASE.scales,
          x:{...CO_BASE.scales.x, stacked:true},
          y:{...CO_BASE.scales.y, stacked:false, ticks:{...CO_BASE.scales.y.ticks,callback:v=>(v/1e6).toFixed(0)+'م'}}
        }
      }
    });
  }

  // Account 41 monthly balance chart
  const a41Ctx = document.getElementById('inv-c-acct41');
  if (a41Ctx) {
    const allVals = [INV_ACCT41_OPEN, ...INV_ACCT41];
    const allLabels = ['سبت-25', ...INV_MONTHS_S];
    INV_CHARTS_OBJ.acct41 = new Chart(a41Ctx, {
      type:'line',
      data:{
        labels: allLabels,
        datasets:[{
          label:'قيمة المخزون (حـ/41)',
          data: allVals,
          borderColor:'#e0c060', backgroundColor:'rgba(224,192,96,0.12)',
          borderWidth:2.5, tension:0.3, fill:true, pointRadius:5,
          pointBackgroundColor: allVals.map(v=>v>15000000?'#da4a4a':'#e0c060'),
        }]
      },
      options:{...CO_BASE,
        plugins:{...CO_BASE.plugins,
          tooltip:{callbacks:{label:i=>`${(i.raw/1e6).toFixed(2)} م ر.س`}}
        },
        scales:{...CO_BASE.scales,
          y:{...CO_BASE.scales.y, ticks:{...CO_BASE.scales.y.ticks, callback:v=>(v/1e6).toFixed(1)+'م'}}
        }
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
