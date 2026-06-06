// ── Safety Inventory Tab ───────────────────────────────────────────────────────
const SI_DATA = {
  today: '2026-06-01', period_days: 243,
  months: ['أكت 25','نوف 25','ديس 25','يناير 26','فبراير 26','مارس 26','أبريل 26','مايو 26'],
  items: [
    {id:4115,size:'0.5"',label:'0.5 بوصه',closing:386,avg_buy:26.21,avg_sell:27.39,doh_90d:1930,daily_90d:0.20,last_sale:'2026-03-28',days_since_sale:64,oldest_fifo_days:191,inv_value:10117,total_sold:94,turnover:0.49,dsi:496,monthly_sold:[0,0,22,25,29,18,0,0],status:'dead',status_ar:'بضاعة راكدة',recommendation:'liquidate',rec_ar:'تصفية — لا حركة منذ 64 يوماً'},
    {id:4125,size:'0.75"',label:'0.75 بوصه',closing:3635,avg_buy:25.53,avg_sell:35.75,doh_90d:7418,daily_90d:0.49,last_sale:'2026-03-25',days_since_sale:67,oldest_fifo_days:232,inv_value:92801,total_sold:733,turnover:0.40,dsi:608,monthly_sold:[0,42,9,8,629,45,0,0],status:'dead',status_ar:'بضاعة راكدة',recommendation:'liquidate',rec_ar:'تصفية — توقف الطلب كلياً منذ أبريل 2026'},
    {id:4117,size:'1"',label:'1 بوصه',closing:26328,avg_buy:37.78,avg_sell:53.30,doh_90d:680,daily_90d:38.68,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:208,inv_value:994441,total_sold:11316,turnover:0.86,dsi:282,monthly_sold:[0,483,1719,2214,3341,837,1205,1517],status:'red',status_ar:'تخزين مفرط',recommendation:'hold',rec_ar:'مراقبة — مخزون 22 شهر · لا شراء جديد'},
    {id:4108,size:'1.25"',label:'1.25 بوصه',closing:7403,avg_buy:51.05,avg_sell:72.95,doh_90d:622,daily_90d:11.89,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:243,inv_value:377923,total_sold:2572,turnover:0.49,dsi:496,monthly_sold:[0,208,421,336,513,182,533,379],status:'red',status_ar:'تخزين مفرط',recommendation:'hold',rec_ar:'توقف شراء — مخزون 20+ شهر · أقدم وحدة 8+ أشهر'},
    {id:4118,size:'1.5"',label:'1.5 بوصه',closing:2849,avg_buy:61.26,avg_sell:87.19,doh_90d:134,daily_90d:21.29,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:203,inv_value:174529,total_sold:5605,turnover:3.93,dsi:62,monthly_sold:[60,1625,576,663,722,472,923,564],status:'yellow',status_ar:'مراقبة',recommendation:'hold',rec_ar:'مراقبة — 4.5 شهر · طلب متذبذب'},
    {id:4119,size:'2"',label:'2 بوصه',closing:1860,avg_buy:82.53,avg_sell:117.23,doh_90d:71,daily_90d:26.32,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:22,inv_value:153506,total_sold:7475,turnover:8.04,dsi:30,monthly_sold:[135,1138,2372,1027,381,801,406,1215],status:'green',status_ar:'سليم',recommendation:'buy',rec_ar:'شراء قريباً — 71 يوماً فقط · مخزون حديث (22 يوم)'},
    {id:4120,size:'2.5"',label:'2.5 بوصه',closing:1427,avg_buy:129.88,avg_sell:186.79,doh_90d:129,daily_90d:11.07,last_sale:'2026-06-01',days_since_sale:0,oldest_fifo_days:186,inv_value:185348,total_sold:3866,turnover:5.40,dsi:45,monthly_sold:[16,1876,185,426,345,69,244,705],status:'yellow',status_ar:'مراقبة',recommendation:'hold',rec_ar:'مراقبة — مايو ارتفع قوياً (695 حبة) · أعد التقييم يونيو'},
    {id:4109,size:'3"',label:'3 بوصه',closing:1911,avg_buy:169.48,avg_sell:240.13,doh_90d:516,daily_90d:3.70,last_sale:'2026-05-25',days_since_sale:7,oldest_fifo_days:243,inv_value:323932,total_sold:1031,turnover:0.59,dsi:413,monthly_sold:[27,107,113,180,265,87,172,80],status:'red',status_ar:'تخزين مفرط',recommendation:'hold',rec_ar:'توقف شراء — 17 شهر · أقدم وحدة قبل أكتوبر 2025'},
    {id:4110,size:'4"',label:'4 بوصه',closing:2131,avg_buy:240.94,avg_sell:349.33,doh_90d:161,daily_90d:13.23,last_sale:'2026-05-25',days_since_sale:7,oldest_fifo_days:239,inv_value:513463,total_sold:2148,turnover:1.29,dsi:188,monthly_sold:[0,159,342,181,249,165,359,693],status:'yellow',status_ar:'مراقبة',recommendation:'buy',rec_ar:'نظر في طلب صغير — مايو قفز لـ 693 حبة · مخزون 5 أشهر فقط'},
    {id:4121,size:'5"',label:'5 بوصه',closing:6,avg_buy:458.86,avg_sell:472.65,doh_90d:9999,daily_90d:0,last_sale:'2026-02-17',days_since_sale:103,oldest_fifo_days:123,inv_value:2753,total_sold:50,turnover:16.7,dsi:15,monthly_sold:[0,0,0,0,50,0,0,0],status:'dead',status_ar:'متوقف',recommendation:'hold',rec_ar:'انتظر — 6 حبات متبقية فقط · بيعة واحدة في فبراير'},
    {id:4122,size:'6"',label:'6 بوصه',closing:41,avg_buy:440.75,avg_sell:610.11,doh_90d:5,daily_90d:8.35,last_sale:'2026-05-25',days_since_sale:7,oldest_fifo_days:54,inv_value:18071,total_sold:2285,turnover:108.8,dsi:2.2,monthly_sold:[99,363,410,383,262,73,205,490],status:'critical',status_ar:'🚨 نفاد وشيك',recommendation:'buy',rec_ar:'🚨 أمر شراء عاجل — أعلى منتج إيراداً · متوقع النفاد خلال 5 أيام'},
    {id:4123,size:'8"',label:'8 بوصه',closing:123,avg_buy:638.10,avg_sell:919.25,doh_90d:212,daily_90d:0.58,last_sale:'2026-05-07',days_since_sale:25,oldest_fifo_days:211,inv_value:78486,total_sold:199,turnover:3.22,dsi:75,monthly_sold:[0,19,40,9,78,6,27,20],status:'yellow',status_ar:'مراقبة',recommendation:'hold',rec_ar:'مراقبة — طلب متقطع وغير منتظم · 7 أشهر مخزون'}
  ]
};
const SI_PURCH = {
  4115:{net:12580.08,qty:480},4125:{net:111495.59,qty:4368},4117:{net:1414348.70,qty:37440},
  4108:{net:347342.98,qty:6804},4118:{net:507210.72,qty:8280},4119:{net:733808.04,qty:8892},
  4120:{net:593545.96,qty:4570},4109:{net:225406.94,qty:1330},4110:{net:710785.47,qty:2950},
  4121:{net:25695.60,qty:56},4122:{net:1021658.63,qty:2318},4123:{net:197810.69,qty:310}
};
// صافي الإيرادات بعد خصم مردودات البيع (من SalesReturnDetail)
const SI_SALES = {
  4115:{net:2574.85},    4125:{net:26202.75},   4117:{net:598065.48},
  4108:{net:186429.71},  4118:{net:472996.20},  4119:{net:833161.25},
  4120:{net:606329.63},  4109:{net:247079.37},  4110:{net:750354.51},
  4121:{net:23632.50},   4122:{net:1388116.00}, 4123:{net:170742.80}
};
// مردودات البيع (للعرض في الجدول المالي)
const SI_RETURNS = {
  4120:{net:112993.25,qty:604}, 4119:{net:43065.20,qty:368},
  4118:{net:15683.01,qty:181},  4123:{net:12088.80,qty:12},
  4122:{net:5430.30,qty:8},     4117:{net:5129.00,qty:95},
  4108:{net:1121.25,qty:15},    4109:{net:499.10,qty:2}
};
const SI_RECS = [
  {type:'buy',item:'6 بوصه (6")',why:'أعلى منتج مبيعاً (25.3% من الإيرادات). متبقٍ 41 حبة فقط بمعدل 8.3 حبة/يوم. النفاد خلال 5 أيام.',num:'أوصي بطلب فوري لا يقل عن 500–600 حبة'},
  {type:'buy',item:'2 بوصه (2")',why:'المخزون الحالي 1,860 حبة بمعدل 26.3 حبة/يوم = 71 يوم فقط. طلب مايو كان 1,215 حبة (ارتفاع). المخزون الحالي حديث (22 يوم).',num:'أوصي بطلب خلال 30 يوماً — كمية 2,000–2,500 حبة'},
  {type:'buy',item:'4 بوصه (4")',why:'مايو شهد قفزة استثنائية (693 حبة = 2.2× المتوسط). الاتجاه تصاعدي. آخر شراء كان أكتوبر 2025 (241 يوماً).',num:'ترقّب يونيو. إن استمر الاتجاه — اطلب 300–500 حبة'},
  {type:'liquidate',item:'0.75 بوصه (0.75")',why:'3,635 حبة متوقفة منذ 67 يوماً. قيمة 92,801 ر.س مجمّدة. خطر تقادم.',num:'خفِّض السعر 10-15% أو عرض على موزعين — استرداد 79,000+ ر.س'},
  {type:'liquidate',item:'0.5 بوصه (0.5")',why:'386 حبة بلا حركة منذ 64 يوماً. قيمة 10,117 ر.س مجمّدة.',num:'تصفية مع 0.75" في حزمة واحدة أو بيع للمنافسين'},
  {type:'hold',item:'1 بوصه (1")',why:'مخزون ضخم 26,328 حبة بقيمة 994,441 ر.س. مبيعات نشطة لكن 22 شهراً للتصفية. لا تشترِ قطعة واحدة إضافية.',num:'رأس مال مجمّد 994,441 ر.س — الأولوية للتحصيل لا الشراء'},
  {type:'hold',item:'1.25 بوصه (1.25")',why:'7,403 حبة وبعضها قبل أكتوبر 2025 (8+ أشهر). مبيعات متوسطة (12/يوم). DOH 622 يوم.',num:'توقف شراء — راجع بعد 6 أشهر'},
  {type:'hold',item:'3 بوصه (3")',why:'1,911 حبة بمنها وحدات من قبل أكتوبر 2025. معدل بيع منخفض (3.7/يوم). DOH 516 يوم.',num:'مراقبة — لا شراء حتى ينزل تحت 600 حبة'}
];

let _siRendered = false;

function renderSafetyInventory() {
  if (_siRendered) return;
  _siRendered = true;

  const D = SI_DATA;
  const fmtN  = v => (+v||0).toLocaleString('ar-SA', {maximumFractionDigits:0});
  const fmtD1 = v => (+v||0).toLocaleString('ar-SA', {maximumFractionDigits:1});
  const TODAY = new Date('2026-06-01');
  const SC = {critical:'#ff4444',red:'#f08080',yellow:'#f5c842',green:'#4ada8e',dead:'#b06bd4'};
  const PALETTE = ['#4a9eda','#f5a623','#4ada8e','#a78bfa','#f472b6','#34d399','#fb923c','#60a5fa','#e879f9','#a3e635','#fbbf24','#38bdf8'];

  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmtDate = d => d.toISOString().slice(0, 10);

  const ageClass = days => {
    if (days <= 30)  return {cls:'green', txt:'طازج (≤30 يوم)'};
    if (days <= 60)  return {cls:'green', txt:'حديث (31-60 يوم)'};
    if (days <= 90)  return {cls:'yellow',txt:'مقبول (61-90 يوم)'};
    if (days <= 180) return {cls:'yellow',txt:'يراقَب (91-180 يوم)'};
    if (days <= 240) return {cls:'red',   txt:'قديم (181-240 يوم)'};
    return {cls:'red', txt:'متقادم (240+ يوم)'};
  };

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalInv = D.items.reduce((s, it) => s + it.inv_value, 0);
  const riskInv  = D.items.filter(it => it.doh_90d > 180 || it.status === 'dead').reduce((s, it) => s + it.inv_value, 0);
  const avgDoh   = D.items.reduce((s, it) => s + (it.doh_90d > 2000 ? 2000 : it.doh_90d), 0) / D.items.length;
  const wdoh     = D.items.reduce((s, it) => { const d = it.doh_90d > 999 ? 999 : it.doh_90d; return s + (it.inv_value / totalInv) * d; }, 0);

  document.getElementById('si-kpis').innerHTML = [
    {lbl:'قيمة المخزون الإجمالية (تكلفة)',    val:'ر.س ' + fmtN(totalInv),       sub:'محسوبة بمتوسط أسعار الشراء',              accent:'#ff4444'},
    {lbl:'مخزون في خطر (>180 يوم أو راكد)',   val:'ر.س ' + fmtN(riskInv) + ' (' + ((riskInv/totalInv)*100).toFixed(0)+'%)', sub:'نسبة رأس المال المجمّد', accent:'#f5a623'},
    {lbl:'متوسط DOH المرجح للمحفظة',          val:fmtN(avgDoh) + ' يوم',          sub:'أيام إمداد بالسرعة الحالية',              accent:'#4ada8e'},
    {lbl:'DOH المرجح بالقيمة',                val:fmtN(wdoh) + ' يوم مرجّح',      sub:'مرجح بقيمة تكلفة كل صنف',               accent:'#60a5fa'},
    {lbl:'أبطأ دوران',                        val:'0.75" — 0.40×',                sub:'608 يوم لبيع المخزون كاملاً',             accent:'#a78bfa'},
    {lbl:'أسرع دوران',                        val:'6" — 108×',                    sub:'2.2 يوم متوسط للبيع (نفد تقريباً)',       accent:'#34d399'}
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Traffic Light ──────────────────────────────────────────────────────────
  document.getElementById('si-tl-grid').innerHTML = D.items.map(it => {
    const dohTxt = it.doh_90d > 2000 ? 'لانهائي' : it.doh_90d > 999 ? '+999 يوم' : fmtN(it.doh_90d) + ' يوم';
    const lastTxt = it.days_since_sale === 0 ? 'اليوم' : it.days_since_sale + ' يوم مضت';
    return `<div class="si-tl-card ${it.status}">
      <div class="si-tl-dot"></div>
      <div class="si-tl-status">${it.status_ar}</div>
      <div class="si-tl-size">${it.size}</div>
      <div class="si-tl-doh">إمداد: ${dohTxt}</div>
      <div class="si-tl-sub">آخر بيع: ${lastTxt} · عمر أقدم وحدة: ${it.oldest_fifo_days} يوم</div>
      <div class="si-tl-val">مخزون: ${fmtN(it.closing)} حبة · قيمة: ر.س ${fmtN(it.inv_value)}</div>
    </div>`;
  }).join('');

  // ── Heatmap ────────────────────────────────────────────────────────────────
  const maxPerItem = D.items.map(it => Math.max(...it.monthly_sold, 1));
  let hmHtml = `<thead><tr><th style="text-align:right">الصنف</th>`;
  D.months.forEach(m => hmHtml += `<th>${m}</th>`);
  hmHtml += '<th>الإجمالي</th></tr></thead><tbody>';
  D.items.forEach((it, i) => {
    hmHtml += `<tr><td style="color:#a0c4e8;white-space:nowrap">${it.size}</td>`;
    let tot = 0;
    it.monthly_sold.forEach(v => {
      tot += v;
      const intens = v / maxPerItem[i];
      const bg = v === 0 ? '#080f18' : intens < .2 ? '#0d3020' : intens < .4 ? '#1a5040' : intens < .6 ? '#2a7060' : intens < .8 ? '#3a9080' : '#4ada8e';
      const col = intens > .5 ? '#e2e8f0' : '#6a9a8a';
      hmHtml += `<td style="padding:3px 4px"><span class="si-hm-cell" style="background:${bg};color:${col}">${v > 0 ? fmtN(v) : '—'}</span></td>`;
    });
    hmHtml += `<td style="color:#c0d8f0;font-weight:700">${fmtN(tot)}</td></tr>`;
  });
  hmHtml += '</tbody>';
  document.getElementById('si-heatmap').innerHTML = hmHtml;

  // ── Aging Table ────────────────────────────────────────────────────────────
  let totInv2 = 0;
  document.getElementById('si-tbody-aging').innerHTML = D.items.map(it => {
    const ac = ageClass(it.oldest_fifo_days);
    const dohTxt = it.doh_90d > 2000 ? '∞ راكد' : it.doh_90d > 999 ? '+999' : fmtN(it.doh_90d);
    const dsiTxt = it.dsi > 999 ? '+999' : fmtN(it.dsi);
    const projDate = it.daily_90d > 0 ? fmtDate(addDays(TODAY, Math.round(it.closing / it.daily_90d))) : 'لا حركة';
    totInv2 += it.inv_value;
    const dohColor = it.doh_90d > 180 ? '#f08080' : it.doh_90d > 90 ? '#f5c842' : '#4ada8e';
    const projColor = it.doh_90d < 60 ? '#ff4444' : it.doh_90d < 120 ? '#f5c842' : '#6a8aaa';
    return `<tr>
      <td><strong>${esc(it.label)}</strong></td>
      <td class="num">${fmtN(it.closing)}</td>
      <td class="num" style="color:#f5a623">${fmtN(it.inv_value)}</td>
      <td><span class="si-sbadge ${ac.cls}">${ac.txt}</span><br><small style="color:#5a7a9a">${it.oldest_fifo_days} يوم</small></td>
      <td class="num" style="color:${dohColor}">${dohTxt}</td>
      <td class="num">${fmtD1(it.turnover)}×</td>
      <td class="num">${dsiTxt} يوم</td>
      <td class="num">${it.daily_90d > 0 ? fmtD1(it.daily_90d) : '—'}</td>
      <td style="font-size:.72rem;color:${projColor}">${projDate}</td>
      <td><span class="si-sbadge ${it.status}">${it.status_ar}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('si-tfoot-aging').innerHTML = `<tr style="font-weight:700;background:#0a1e30;border-top:2px solid #1e3a5f">
    <td>الإجمالي</td>
    <td class="num">${fmtN(D.items.reduce((s, it) => s + it.closing, 0))}</td>
    <td class="num" style="color:#f5a623">${fmtN(totInv2)}</td>
    <td colspan="8"></td>
  </tr>`;

  // ── Stockout Projection ────────────────────────────────────────────────────
  document.getElementById('si-tbody-proj').innerHTML = D.items.map(it => {
    if (it.daily_90d === 0) {
      return `<tr>
        <td><strong>${esc(it.label)}</strong></td><td class="num">${fmtN(it.closing)}</td><td class="num">—</td>
        <td class="num" style="color:#b06bd4">لا حركة</td><td style="color:#b06bd4">غير محدد</td>
        <td style="font-size:.72rem">${it.last_sale||'—'}</td><td class="num">—</td>
        <td><span class="si-sbadge dead">مراجعة</span></td>
      </tr>`;
    }
    const doh = Math.round(it.closing / it.daily_90d);
    const stockoutDate = fmtDate(addDays(TODAY, doh));
    const safetyMonths = (doh / 30).toFixed(1);
    const urg = doh < 30 ? 'critical' : doh < 60 ? 'red' : doh < 120 ? 'yellow' : 'green';
    const dec = doh < 30 ? '🚨 عاجل' : doh < 60 ? 'طلب قريب' : doh < 120 ? 'مراقبة' : 'كافٍ';
    const urgColor = urg === 'critical' ? '#ff4444' : urg === 'red' ? '#f08080' : urg === 'yellow' ? '#f5c842' : '#4ada8e';
    return `<tr>
      <td><strong>${esc(it.label)}</strong></td>
      <td class="num">${fmtN(it.closing)}</td>
      <td class="num">${fmtD1(it.daily_90d)}</td>
      <td class="num" style="color:${urgColor};font-weight:700">${doh > 999 ? '+999' : fmtN(doh)} يوم</td>
      <td style="font-size:.75rem;color:${urg==='critical'?'#ff4444':'#8aa8cc'}">${doh > 999 ? '—' : stockoutDate}</td>
      <td style="font-size:.72rem">${it.last_sale||'—'}</td>
      <td class="num" style="color:${urg==='critical'?'#ff4444':urg==='red'?'#f08080':'#6a8aaa'}">${doh > 999 ? '+33' : safetyMonths} شهر</td>
      <td><span class="si-sbadge ${urg}">${dec}</span></td>
    </tr>`;
  }).join('');

  // ── Recommendations ────────────────────────────────────────────────────────
  document.getElementById('si-rec-grid').innerHTML = SI_RECS.map(r => `
    <div class="si-rec-card ${r.type}">
      <div class="si-rec-action">${r.type==='buy'?'🟢 شراء':r.type==='liquidate'?'🔴 تصفية':'🔵 انتظار'}</div>
      <div class="si-rec-item">${esc(r.item)}</div>
      <div class="si-rec-why">${esc(r.why)}</div>
      <div class="si-rec-num">${esc(r.num)}</div>
    </div>`).join('');

  // ── Financial Summary ──────────────────────────────────────────────────────
  let totBuy = 0, totGross = 0, totRet = 0, totNetSell = 0, totRemVal = 0, totLocked = 0;
  document.getElementById('si-tbody-fin').innerHTML = D.items.map(it => {
    const pb  = SI_PURCH[it.id]   || {net:0,qty:1};
    const sb  = SI_SALES[it.id]   || {net:0};     // صافي الإيرادات (بعد المردودات)
    const ret = SI_RETURNS[it.id] || {net:0,qty:0};
    const grossSales = sb.net + ret.net;           // الإيرادات الإجمالية
    const gp = sb.net - pb.net * (it.total_sold / pb.qty);
    const margin = sb.net > 0 ? gp / sb.net * 100 : 0;
    const soldPct = it.total_sold / (it.total_sold + it.closing) * 100;
    const isLocked = it.turnover < 2;
    totBuy += pb.net; totGross += grossSales; totRet += ret.net;
    totNetSell += sb.net; totRemVal += it.inv_value;
    if (isLocked) totLocked += it.inv_value;
    const mColor = margin > 15 ? '#4ada8e' : margin > 5 ? '#f5c842' : '#f08080';
    const retCell = ret.net > 0
      ? `<span class="num" style="color:#f08080">−${fmtN(ret.net)}</span><br><small style="color:#5a6a7a">${fmtN(ret.qty)} حبة</small>`
      : `<span style="color:#3a5a4a">—</span>`;
    return `<tr>
      <td><strong>${esc(it.label)}</strong></td>
      <td class="num" style="color:#f5a623">${fmtN(pb.net)}</td>
      <td class="num" style="color:#6a9aba">${fmtN(grossSales)}</td>
      <td class="num">${retCell}</td>
      <td class="num" style="color:#4a9eda;font-weight:600">${fmtN(sb.net)}</td>
      <td class="num" style="color:${mColor};font-weight:700">${fmtD1(margin)}%</td>
      <td class="num" style="color:${it.inv_value>300000?'#f08080':'#8aa8cc'}">${fmtN(it.inv_value)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:56px;background:#0a1e30;border-radius:3px;height:5px">
            <div style="width:${Math.min(soldPct,100)}%;height:5px;border-radius:3px;background:${soldPct>70?'#4ada8e':soldPct>40?'#f5c842':'#f08080'}"></div>
          </div>
          <span style="font-size:.78rem">${fmtD1(soldPct)}%</span>
        </div>
      </td>
      <td>${isLocked ? `<span class="num" style="color:#f08080">${fmtN(it.inv_value)} ر.س</span>` : '<span style="color:#4ada8e">✓ دوران سليم</span>'}</td>
    </tr>`;
  }).join('');
  const totMargin = totNetSell > 0 ? (totNetSell - totBuy) / totNetSell * 100 : 0;
  document.getElementById('si-tfoot-fin').innerHTML = `<tr style="font-weight:700;background:#0a1e30;border-top:2px solid #1e3a5f">
    <td>الإجمالي</td>
    <td class="num" style="color:#f5a623">${fmtN(totBuy)}</td>
    <td class="num" style="color:#6a9aba">${fmtN(totGross)}</td>
    <td class="num" style="color:#f08080">−${fmtN(totRet)}</td>
    <td class="num" style="color:#4a9eda;font-weight:700">${fmtN(totNetSell)}</td>
    <td class="num" style="color:${totMargin>0?'#4ada8e':'#f08080'};font-weight:700">${fmtD1(totMargin)}%</td>
    <td class="num" style="color:#f5a623">${fmtN(totRemVal)}</td>
    <td></td>
    <td class="num" style="color:#f08080">${fmtN(totLocked)} ر.س مجمّد</td>
  </tr>`;

  // ── Charts ─────────────────────────────────────────────────────────────────
  new Chart(document.getElementById('si-chart-bubble'), {
    type: 'bubble',
    data: { datasets: D.items.map((it, i) => ({
      label: it.size,
      data: [{x: Math.min(it.doh_90d, 999), y: it.inv_value, r: Math.max(Math.sqrt(it.inv_value / 5000) * 3, 5)}],
      backgroundColor: SC[it.status] + '88', borderColor: SC[it.status], borderWidth: 2
    }))},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {labels:{color:'#6a8aaa',font:{size:10},boxWidth:10}},
        tooltip: {callbacks:{label: ctx => `${ctx.dataset.label}: DOH=${ctx.raw.x} يوم | قيمة=ر.س ${fmtN(ctx.raw.y)}`}}
      },
      scales: {
        x: {title:{display:true,text:'أيام الإمداد (DOH)',color:'#6a8aaa'},ticks:{color:'#6a8aaa'},grid:{color:'#1a2233'},min:0,max:700},
        y: {title:{display:true,text:'قيمة المخزون (ر.س)',color:'#6a8aaa'},ticks:{color:'#6a8aaa',callback:v=>'ر.س '+fmtN(v)},grid:{color:'#1a2233'}}
      }
    }
  });

  new Chart(document.getElementById('si-chart-turnover'), {
    type: 'bar',
    data: {
      labels: D.items.map(it => it.size),
      datasets: [{
        label: 'معدل الدوران السنوي (×)',
        data: D.items.map(it => Math.min(it.turnover * (365 / 243), 50)),
        backgroundColor: D.items.map(it => SC[it.status] + '88'),
        borderColor: D.items.map(it => SC[it.status]), borderWidth: 2, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {legend:{display:false}, tooltip:{callbacks:{label:ctx=>'معدل الدوران: '+ctx.raw.toFixed(1)+'× سنوياً'}}},
      scales: {
        x: {ticks:{color:'#6a8aaa'},grid:{color:'#1a2233'},title:{display:true,text:'دورة/سنة — الصحي: ≥4×',color:'#6a8aaa'}},
        y: {ticks:{color:'#cdd2dd'},grid:{display:false}}
      }
    }
  });

  new Chart(document.getElementById('si-chart-stockout'), {
    type: 'bar',
    data: {
      labels: D.items.map(it => it.size),
      datasets: [{
        label: 'أيام الإمداد المتبقية',
        data: D.items.map(it => it.daily_90d > 0 ? Math.min(Math.round(it.closing / it.daily_90d), 999) : 999),
        backgroundColor: D.items.map(it => {
          if (it.status === 'dead') return '#9b59b688';
          const d = it.daily_90d > 0 ? it.closing / it.daily_90d : 999;
          return d < 30 ? '#ff4444aa' : d < 90 ? '#f08080aa' : d < 180 ? '#f5c84288' : '#4ada8e44';
        }),
        borderColor: D.items.map(it => SC[it.status]), borderWidth: 2, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {legend:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.raw>=999?'راكد / بلا حركة':'متبقٍ '+ctx.raw+' يوم'}}},
      scales: {
        x: {ticks:{color:'#cdd2dd'},grid:{display:false}},
        y: {ticks:{color:'#6a8aaa',callback:v=>v>=999?'∞':v+' يوم'},grid:{color:'#1a2233'},title:{display:true,text:'الأيام المتبقية',color:'#6a8aaa'}}
      }
    }
  });

  const activeItems = D.items.filter(it => it.daily_90d > 5).sort((a, b) => b.daily_90d - a.daily_90d);
  new Chart(document.getElementById('si-chart-velocity'), {
    type: 'line',
    data: {
      labels: D.months,
      datasets: activeItems.map((it, i) => ({
        label: it.size, data: it.monthly_sold,
        borderColor: PALETTE[i], backgroundColor: 'transparent',
        borderWidth: 2, pointRadius: 3, tension: .3
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {legend:{labels:{color:'#8aa8cc',font:{size:10},boxWidth:10}}},
      scales: {
        x: {ticks:{color:'#6a8aaa'},grid:{color:'#1a2233'}},
        y: {ticks:{color:'#6a8aaa',callback:v=>v+' ح'},grid:{color:'#1a2233'}}
      }
    }
  });

  new Chart(document.getElementById('si-chart-margin'), {
    type: 'bar',
    data: {
      labels: D.items.map(it => it.size),
      datasets: [
        {label:'سعر الشراء (ر.س/حبة)',data:D.items.map(it=>it.avg_buy),backgroundColor:'#f5a62388',borderColor:'#f5a623',borderWidth:1,borderRadius:3},
        {label:'سعر البيع (ر.س/حبة)', data:D.items.map(it=>it.avg_sell),backgroundColor:'#4a9eda88',borderColor:'#4a9eda',borderWidth:1,borderRadius:3}
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {legend:{labels:{color:'#8aa8cc',font:{size:10}}}},
      scales: {
        x: {ticks:{color:'#cdd2dd',font:{size:9}},grid:{display:false}},
        y: {ticks:{color:'#6a8aaa',callback:v=>'ر.س '+v},grid:{color:'#1a2233'}}
      }
    }
  });
}

// ── Safety Excel Export ────────────────────────────────────────────────────────
window.siExportExcel = async function() {
  const D = SI_DATA;
  const TODAY = new Date('2026-06-01');
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmtDate = d => d.toISOString().slice(0, 10);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Safety Inventory Analysis'; wb.created = new Date();
  const rtl = [{rightToLeft: true}];

  const ws1 = wb.addWorksheet('تحليل الدوران والعمر'); ws1.views = rtl;
  ws1.addRow(['الصنف','المخزون (حبة)','قيمة التكلفة (ر.س)','أقدم وحدة (يوم)','DOH (يوم)','معدل الدوران','DSI (يوم)','سرعة 90 يوم','توقع النفاد','الحالة'])
    .eachCell(c => c.style = {font:{bold:true,color:{argb:'FF7AABCC'}}});
  D.items.forEach(it => {
    const projDate = it.daily_90d > 0 ? fmtDate(addDays(TODAY, Math.round(it.closing / it.daily_90d))) : 'لا حركة';
    ws1.addRow([it.label, it.closing, it.inv_value, it.oldest_fifo_days,
      it.doh_90d > 999 ? '>999' : Math.round(it.doh_90d),
      it.turnover.toFixed(2) + '×', it.dsi > 999 ? '>999' : it.dsi,
      it.daily_90d > 0 ? it.daily_90d.toFixed(1) : '0', projDate, it.status_ar]);
  });

  const ws2 = wb.addWorksheet('المخاطر المالية'); ws2.views = rtl;
  ws2.addRow(['الصنف','قيمة الشراء','إيرادات إجمالية','مردودات','صافي الإيرادات','هامش الربح %','قيمة المخزون المتبقي','نسبة التحصيل %','رأس مال مجمّد'])
    .eachCell(c => c.style = {font:{bold:true}});
  D.items.forEach(it => {
    const pb  = SI_PURCH[it.id]   || {net:0,qty:1};
    const sb  = SI_SALES[it.id]   || {net:0};
    const ret = SI_RETURNS[it.id] || {net:0,qty:0};
    const gross = sb.net + ret.net;
    const gp = sb.net - pb.net * (it.total_sold / pb.qty);
    const margin = sb.net > 0 ? gp / sb.net * 100 : 0;
    const soldPct = it.total_sold / (it.total_sold + it.closing) * 100;
    ws2.addRow([it.label, pb.net.toFixed(0), gross.toFixed(0),
      ret.net > 0 ? '-' + ret.net.toFixed(0) : '—', sb.net.toFixed(0),
      margin.toFixed(1) + '%', it.inv_value.toFixed(0),
      soldPct.toFixed(1) + '%', it.turnover < 2 ? it.inv_value.toFixed(0) : '—']);
  });

  const ws3 = wb.addWorksheet('التوصيات'); ws3.views = rtl;
  ws3.addRow(['الصنف','القرار','السبب','الإجراء المقترح']).eachCell(c => c.style = {font:{bold:true}});
  SI_RECS.forEach(r => ws3.addRow([r.item, r.type==='buy'?'شراء':r.type==='liquidate'?'تصفية':'انتظار', r.why, r.num]));

  const ws4 = wb.addWorksheet('مبيعات شهرية'); ws4.views = rtl;
  ws4.addRow(['الصنف', ...D.months, 'الإجمالي']).eachCell(c => c.style = {font:{bold:true}});
  D.items.forEach(it => ws4.addRow([it.label, ...it.monthly_sold, it.monthly_sold.reduce((s,v)=>s+v,0)]));

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download = 'safety-inventory-' + D.today + '.xlsx';
  a.click();
};

// ═══════════════════════════════════════════════════════════════════════