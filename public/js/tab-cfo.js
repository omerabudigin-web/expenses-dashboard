// ── CFO Executive Dashboard ───────────────────────────────────────────────────

let _cfoTrendChart = null;

function _cfoGetPlFrom(quick, lastMo, allMths) {
  if (!lastMo || quick === 'all') return null;
  if (quick === 'ytd') return lastMo.slice(0, 4) + '-01';
  if (quick === 'q') { const mo = parseInt(lastMo.slice(5, 7)); return lastMo.slice(0, 4) + '-' + String(Math.floor((mo - 1) / 3) * 3 + 1).padStart(2, '0'); }
  if (quick === 'h6') { const i = allMths.indexOf(lastMo); return i >= 5 ? allMths[i - 5] : allMths[0]; }
  if (quick === 'h3') { const i = allMths.indexOf(lastMo); return i >= 2 ? allMths[i - 2] : allMths[0]; }
  return null;
}

function _cfoPriorRange(plFrom, lastMo, allMths) {
  if (!plFrom) return null;
  const fi = allMths.indexOf(plFrom), ti = allMths.indexOf(lastMo);
  if (fi < 0 || ti < 0) return null;
  const span = ti - fi + 1;
  const pfi  = fi - span;
  if (pfi < 0) return null;
  return { from: allMths[pfi], to: allMths[fi - 1] };
}

function _cfoHealthScore(r) {
  if (!r) return { score: 0, items: [] };
  const items = [];
  let total = 0;

  const nm = r.netMargin;
  const nmScore = nm === null ? 0 : nm >= 8 ? 25 : nm >= 5 ? 18 : nm >= 2 ? 10 : nm >= 0 ? 4 : 0;
  items.push({ lbl:'هامش الربح الصافي',       score:nmScore, max:25, val:nm!==null?nm.toFixed(2)+'%':'—',  target:'≥ 8%',   col:nmScore>=18?'#4ada8e':nmScore>=10?'#da9a4a':'#da4a4a' });
  total += nmScore;

  const gm = r.grossMargin;
  const gmScore = gm === null ? 0 : gm >= 20 ? 15 : gm >= 15 ? 11 : gm >= 10 ? 7 : gm >= 5 ? 3 : 0;
  items.push({ lbl:'هامش الربح الإجمالي',     score:gmScore, max:15, val:gm!==null?gm.toFixed(1)+'%':'—',  target:'≥ 20%',  col:gmScore>=11?'#4ada8e':gmScore>=7?'#da9a4a':'#da4a4a' });
  total += gmScore;

  const cr = r.currentRatio;
  const crScore = cr === null ? 0 : cr >= 2 ? 20 : cr >= 1.5 ? 15 : cr >= 1 ? 7 : 0;
  items.push({ lbl:'النسبة الجارية (السيولة)',score:crScore, max:20, val:cr!==null?cr.toFixed(2)+'×':'—',  target:'≥ 1.5×', col:crScore>=15?'#4ada8e':crScore>=7?'#da9a4a':'#da4a4a' });
  total += crScore;

  const ic = r.intCoverage;
  const icScore = ic === null ? 0 : ic >= 5 ? 15 : ic >= 3 ? 12 : ic >= 1.5 ? 6 : ic >= 1 ? 2 : 0;
  items.push({ lbl:'تغطية الفوائد البنكية',   score:icScore, max:15, val:ic!==null?ic.toFixed(2)+'×':'—',  target:'≥ 3×',   col:icScore>=12?'#4ada8e':icScore>=6?'#da9a4a':'#da4a4a' });
  total += icScore;

  const de = r.debtEquity;
  const deScore = de === null ? 0 : de <= 1 ? 15 : de <= 2 ? 12 : de <= 4 ? 7 : de <= 8 ? 2 : 0;
  items.push({ lbl:'نسبة الدين إلى الملكية',  score:deScore, max:15, val:de!==null?de.toFixed(1)+'×':'—',  target:'≤ 2×',   col:deScore>=12?'#4ada8e':deScore>=7?'#da9a4a':'#da4a4a' });
  total += deScore;

  const roe = r.roe;
  const roeScore = roe === null ? 0 : roe >= 15 ? 10 : roe >= 8 ? 7 : roe >= 3 ? 4 : roe >= 0 ? 1 : 0;
  items.push({ lbl:'العائد على حقوق الملكية', score:roeScore, max:10, val:roe!==null?roe.toFixed(1)+'%':'—', target:'≥ 15%',  col:roeScore>=7?'#4ada8e':roeScore>=4?'#da9a4a':'#da4a4a' });
  total += roeScore;

  return { score: total, items };
}

function _cfoActions(r, c, plLen, mFilt) {
  const _mo = mFilt || State.get('monthly') || [];
  const _mDist = _mo.reduce((s, m) => s + (m.dist||0), 0);
  const _mAdm  = _mo.reduce((s, m) => s + (m.adm ||0), 0);
  const totalOpex = c.sal + c.rent + c.maint + c.sell + _mDist + _mAdm + c.fin + c.char + c.oth;
  const actions   = [];
  const add = (priority, title, body, impact) => actions.push({ priority, title, body, impact: impact || '' });

  if (r.currentRatio !== null && r.currentRatio < 1)
    add(1, 'معالجة أزمة السيولة — النسبة الجارية أقل من 1×',
      `النسبة الجارية <strong>${r.currentRatio.toFixed(2)}×</strong>: الالتزامات قصيرة الأجل (${fmt(r.currL)} ر.س) تتجاوز الأصول المتداولة (${fmt(r.currA)} ر.س). الإجراءات الفورية: (1) تسريع تحصيل المدينين (${fmt(r.ar)} ر.س) بتحفيزات الدفع المبكر، (2) التفاوض مع الموردين لتمديد مهل السداد 60-90 يوماً، (3) إعادة هيكلة جزء من الديون قصيرة الأجل.`,
      `رفع النسبة إلى > 1.2× خلال الربع القادم`);

  if (r.intCoverage !== null && r.intCoverage < 1.5)
    add(1, 'أزمة الفوائد البنكية — تلتهم الأرباح بالكامل',
      `الفوائد البنكية <strong>${fmt(c.fin)} ر.س</strong> (${c.revenue > 0 ? (c.fin/c.revenue*100).toFixed(2) + '% من الإيراد' : '—'}) مقابل صافي ربح <strong>${fmtPlNum(c.netProfit)} ر.س</strong> فقط. الإجراءات: (1) طلب إعادة تسعير التسهيلات البنكية فوراً، (2) سداد جزء من التسهيلات من تحصيلات المدينين، (3) مقارنة عروض بنوك أخرى، (4) تخفيض حجم التسهيلات غير المستخدمة.`,
      `كل تخفيض 1% في معدل الفائدة يوفر ${fmt(c.fin * 0.1)} ر.س سنوياً`);

  if (r.arDays !== null && r.arDays > 90)
    add(1, 'بطء التحصيل — المدينون يعطّلون السيولة',
      `متوسط تحصيل <strong>${r.arDays.toFixed(0)} يوم</strong> ورصيد <strong>${fmt(r.ar)} ر.س</strong>. الإجراءات: (1) حصر أكبر 10 مدينين وتعيين مسؤول تحصيل متفرغ، (2) سياسة ائتمان: لا توريد جديد لمن تجاوزت مديونيته 60 يوماً، (3) خصم 1.5% عند السداد خلال 15 يوماً، (4) نظام تذكير آلي عند اقتراب الاستحقاق.`,
      `تحرير ${fmt(r.ar * 0.3)} ر.س بتخفيض أيام التحصيل 30%`);

  if (r.netMargin !== null && r.netMargin < 1 && r.netMargin >= 0)
    add(1, 'هامش صافٍ حرج جداً — أقل من 1%',
      `هامش <strong>${r.netMargin.toFixed(2)}%</strong> يضع الشركة على حافة الخسارة. أي ارتفاع مفاجئ في التكاليف يحوّل النتيجة لخسارة. الإجراءات: (1) رفع الأسعار 2-3% على المنتجات الأساسية، (2) تجميد المصروفات التقديرية لـ 90 يوماً، (3) تحديد نقطة التعادل الشهرية ومتابعتها أسبوعياً.`,
      `رفع الهامش إلى 3% = ربح ${fmt(c.revenue * 0.03)} ر.س مقابل ${fmt(c.netProfit)} ر.س حالياً`);

  if (r.grossMargin !== null && r.grossMargin < 12)
    add(2, 'تحسين هامش الربح الإجمالي من ' + r.grossMargin.toFixed(1) + '%',
      `هامش إجمالي <strong>${r.grossMargin.toFixed(1)}%</strong> منخفض (معيار القطاع 15-20%). الإجراءات: (1) مفاوضة الموردين الكبار على خصومات 3-5%، (2) تسعير قائم على التكلفة الكاملة + هامش مستهدف لكل منتج، (3) التركيز على المنتجات ذات هامش أعلى وتقليص المنتجات الهامشية.`,
      `كل 1% زيادة في الهامش الإجمالي = ${fmt(c.revenue * 0.01)} ر.س ربح إضافي`);

  if (r.invDays !== null && r.invDays > 90)
    add(2, 'تحسين دوران المخزون — ' + r.invDays.toFixed(0) + ' يوم',
      `مخزون <strong>${fmt(r.inventory)} ر.س</strong> بمعدل دوران <strong>${r.invDays.toFixed(0)} يوم</strong>. الإجراءات: (1) تصنيف ABC: الأصناف حسب قيمة المبيعات وتركيز الجهد على A، (2) تصفية المخزون الراكد > 180 يوم بخصومات تصفية، (3) تحديد حدود أقصى/أدنى للمخزون حسب سرعة الدوران.`,
      `تحرير ${fmt(r.inventory * 0.25)} ر.س بتخفيض المخزون 25%`);

  if (r.debtEquity !== null && r.debtEquity > 5)
    add(2, 'خفض الرفع المالي — نسبة الدين/الملكية ' + r.debtEquity.toFixed(1) + '× (خطر)',
      `ديون <strong>${fmt(r.totalL)} ر.س</strong> مقابل ملكية <strong>${fmt(r.totalE)} ر.س</strong> = هشاشة مالية عالية جداً. الإجراءات: (1) خطة لسداد 20% من الديون قصيرة الأجل سنوياً، (2) احتجاز الأرباح المستقبلية لتقوية رأس المال عوض توزيعها، (3) استكشاف إمكانية ضخ رأس مال إضافي من الشركاء.`,
      `خفض النسبة من ${r.debtEquity.toFixed(1)}× إلى < 5× خلال 3 سنوات`);

  add(3, 'بناء احتياطي نقدي استراتيجي',
    `الرصيد النقدي الحالي <strong>${fmt(r.cash)} ر.س</strong>. الهدف: احتياطي يعادل 2-3 أشهر من التكاليف الثابتة = <strong>${fmt((c.sal + c.rent) / (plLen || 1) * 3)} ر.س</strong> تقريباً. خطة التنفيذ: تحويل 5% من كل تحصيل إلى حساب احتياطي منفصل.`,
    `مرونة مالية تحمي من الصدمات التشغيلية`);

  add(3, 'نظام تقارير مالية شهرية منتظمة',
    `اعتماد لوحة مؤشرات شهرية تشمل: (1) مقارنة الإيراد الفعلي مع الهدف الشهري، (2) تتبع أيام التحصيل والمخزون أسبوعياً، (3) اجتماع مالي شهري لمراجعة KPIs الرئيسية، (4) تقرير التدفق النقدي الشهري قبل اتخاذ أي قرار استثماري.`,
    `تحسين القرار المالي وتقليل المفاجآت إلى الحد الأدنى`);

  actions.sort((a, b) => a.priority - b.priority);
  return actions;
}

function renderCFOTrendChart(plMonths, plFrom, lastMo) {
  const canvas = document.getElementById('chart-cfo-trend');
  if (!canvas) return;
  const last    = plMonths.slice(-12);
  const labels  = last.map(m => m.label);
  const revData = last.map(m => +(m.revenue || 0));
  const gpData  = last.map(m => (m.revenue||0) - (m.cogs||0) - (m.otherCost||0));
  const npData  = last.map(m => {
    const gp = (m.revenue||0) - (m.cogs||0) - (m.otherCost||0);
    const op = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    return gp - op;
  });
  const bgColors = last.map(m => {
    const inRange = m.month <= (lastMo||'') && (!plFrom || m.month >= plFrom);
    return inRange ? '#3a7abf88' : '#3a7abf22';
  });
  if (_cfoTrendChart) { _cfoTrendChart.destroy(); _cfoTrendChart = null; }
  _cfoTrendChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'الإيراد',    data:revData, backgroundColor:bgColors, borderColor:'#5baef0', borderWidth:1.5, yAxisID:'y' },
        { label:'مجمل الربح', data:gpData,  type:'line', borderColor:'#4ada8e', backgroundColor:'transparent', borderWidth:2, pointRadius:3, tension:0.3, yAxisID:'y' },
        { label:'صافي الربح', data:npData,  type:'line', borderColor:'#da9a4a', backgroundColor:'transparent', borderWidth:2, pointRadius:4, borderDash:[5,3], tension:0.3, yAxisID:'y' },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#a0c4e8', font:{size:11} } } },
      scales:{
        x:{ ticks:{color:'#7090b0'}, grid:{color:'#0a1e30'} },
        y:{ ticks:{ color:'#7090b0', callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k' }, grid:{color:'#0a1e30'} },
      }
    }
  });
}

function renderCFODashboard() {
  const bs  = State.get('bs') || [];
  const pl  = State.get('pl') || [];

  const heroEl = document.getElementById('cfo-hero');
  if (!bs.length || !pl.length) {
    if (heroEl) heroEl.innerHTML = '<div style="color:#5a7a9a;padding:30px;text-align:center;grid-column:1/-1">في انتظار البيانات من ERP…</div>';
    return;
  }

  const allMths = [...new Set(pl.map(r => r.month))].sort();
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const lastMo  = bsMths[bsMths.length - 1];

  const quick  = (document.getElementById('cfo-quick-sel') || {}).value || 'ytd';
  const plFrom = _cfoGetPlFrom(quick, lastMo, allMths);

  // Period label
  const periodLblEl = document.getElementById('cfo-period-label');
  if (periodLblEl) {
    if (!plFrom) periodLblEl.textContent = 'كل الفترات';
    else if (quick === 'ytd')  periodLblEl.textContent = `${plFrom} → ${lastMo}`;
    else if (quick === 'q')    periodLblEl.textContent = `الربع الحالي: ${plFrom} → ${lastMo}`;
    else if (quick === 'h6')   periodLblEl.textContent = `آخر 6 أشهر: ${plFrom} → ${lastMo}`;
    else if (quick === 'h3')   periodLblEl.textContent = `آخر 3 أشهر: ${plFrom} → ${lastMo}`;
    else periodLblEl.textContent = `${plFrom} → ${lastMo}`;
  }

  const plFilt = pl.filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const mFilt  = (State.get('monthly') || []).filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));

  const r = computeRatios(bs, pl, lastMo, plFrom);
  if (!r) return;

  const c = aggregatePL(plFilt);

  // Prior period for Δ% comparison
  const prior   = _cfoPriorRange(plFrom, lastMo, allMths);
  const prPlFilt = prior ? pl.filter(m => m.month >= prior.from && m.month <= prior.to) : null;
  const prMFilt  = prior ? (State.get('monthly') || []).filter(m => m.month >= prior.from && m.month <= prior.to) : null;
  const cp       = prPlFilt ? aggregatePL(prPlFilt) : null;
  const rp       = prior    ? computeRatios(bs, pl, prior.to, prior.from) : null;

  const delta = (cur, prev) => {
    if (prev == null || !isFinite(prev) || prev === 0 || cur == null) return '';
    const d = cur - prev;
    const pct = (d / Math.abs(prev)) * 100;
    const col = d >= 0 ? '#4ada8e' : '#da4a4a';
    const arrow = d >= 0 ? '▲' : '▼';
    return `<span style="font-size:.68rem;color:${col};margin-right:4px">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  };

  const mSal  = mFilt.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent = mFilt.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint= mFilt.reduce((s, m) => s + (m.maint||0), 0);
  const mSell = mFilt.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist = mFilt.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm  = mFilt.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin  = mFilt.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar = mFilt.reduce((s, m) => s + (m.char ||0), 0);
  const mOth  = mFilt.reduce((s, m) => s + (m.oth  ||0), 0);
  const mTotalOpex = mSal+mRent+mMaint+mSell+mDist+mAdm+mFin+mChar+mOth;

  const totalOpex = mTotalOpex;
  const finPct    = c.revenue > 0 ? mFin / c.revenue * 100 : 0;
  const crCol     = r.currentRatio !== null ? (r.currentRatio >= 1.5 ? '#4ada8e' : r.currentRatio >= 1 ? '#da9a4a' : '#da4a4a') : '#5a7a9a';
  const nmCol     = r.netMargin    !== null ? (r.netMargin    >= 5    ? '#4ada8e' : r.netMargin    >= 1 ? '#da9a4a' : '#da4a4a') : '#5a7a9a';
  const finCol    = finPct < 1 ? '#4ada8e' : finPct < 2 ? '#da9a4a' : '#da4a4a';

  // ── Hero KPIs ──
  const nMoLabel = plFilt.length + ' شهر';
  if (heroEl) heroEl.innerHTML = [
    { lbl:'إجمالي الإيراد',           val:fmt(c.revenue)+' ر.س',                                               sub:(cp?delta(c.revenue,cp.revenue):'')+nMoLabel,                                           accent:'#5baef0' },
    { lbl:'هامش الربح الإجمالي',       val:r.grossMargin!==null?r.grossMargin.toFixed(1)+'%':'—',               sub:(rp?delta(r.grossMargin,rp.grossMargin):'')+fmt(c.grossProfit)+' ر.س',                     accent:r.grossMargin>=15?'#4ada8e':'#da9a4a' },
    { lbl:'هامش الربح الصافي',         val:r.netMargin!==null?r.netMargin.toFixed(2)+'%':'—',                   sub:(rp?delta(r.netMargin,rp.netMargin):'')+fmtPlNum(c.netProfit)+' ر.س',                       accent:nmCol },
    { lbl:'النقدية والبنوك',           val:fmt(r.cash)+' ر.س',                                                  sub:r.currA>0?(r.cash/r.currA*100).toFixed(0)+'% من المتداولة':'—',                            accent:r.cash>1000000?'#4ada8e':'#da9a4a' },
    { lbl:'النسبة الجارية',            val:r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—',             sub:(rp?delta(r.currentRatio,rp.currentRatio):'')+'المستهدف: ≥ 1.5×',                           accent:crCol },
    { lbl:'الفوائد البنكية / الإيراد', val:finPct.toFixed(2)+'%',                                               sub:(cp?delta(-(mFin/Math.max(cp.revenue,1)*100),-(mFilt.reduce((s,m)=>s+(m.fin||0),0)/Math.max(cp.revenue,1)*100)):'')+fmt(c.fin)+' ر.س', accent:finCol },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Health Score ──
  const hs       = _cfoHealthScore(r);
  const scoreCol = hs.score >= 70 ? '#4ada8e' : hs.score >= 40 ? '#da9a4a' : '#da4a4a';
  const scoreLbl = hs.score >= 70 ? 'جيد' : hs.score >= 50 ? 'متوسط' : hs.score >= 30 ? 'ضعيف' : 'حرج';
  const healthEl = document.getElementById('cfo-health');
  if (healthEl) healthEl.innerHTML = `
    <div style="text-align:center;padding:10px 0 18px">
      <div style="font-size:3rem;font-weight:700;color:${scoreCol};line-height:1">${hs.score}</div>
      <div style="font-size:.78rem;color:#7090b0;margin-top:3px">/ 100 نقطة — <strong style="color:${scoreCol}">${scoreLbl}</strong></div>
    </div>
    ${hs.items.map(it => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:#c0d0e0;font-size:.79rem">${it.lbl}</span>
          <span style="color:${it.col};font-size:.79rem;font-weight:600">${it.val}
            <span style="color:#506070;font-weight:400;font-size:.71rem">(${it.score}/${it.max})</span>
          </span>
        </div>
        <div style="height:7px;border-radius:4px;background:#06121e;overflow:hidden">
          <div style="height:100%;border-radius:4px;background:${it.col}aa;width:${it.max ? (it.score/it.max*100).toFixed(0) : 0}%"></div>
        </div>
        <div style="font-size:.68rem;color:#506070;margin-top:2px">المستهدف: ${it.target}</div>
      </div>`).join('')}`;

  // ── Trend chart ──
  renderCFOTrendChart(pl, plFrom, lastMo);

  // ── Expense Analysis ──
  // Uses monthly-state totals so dist matches Summary/Monthly/Accounts.
  // Note: in the P&L statement dist is lower because 4010301001 (نقل المشتريات)
  // is reclassified as a landed cost inside COGS.
  const expItems = [
    { lbl:'رواتب وأجور',              key:'sal',  val:mSal   },
    { lbl:'إيجار',                    key:'rent', val:mRent  },
    { lbl:'صيانة وتشغيل',            key:'maint',val:mMaint },
    { lbl:'مبيعات وتسويق',           key:'sell', val:mSell  },
    { lbl:'توزيع ونقل',              key:'dist', val:mDist  },
    { lbl:'مصروفات إدارية',          key:'adm',  val:mAdm   },
    { lbl:'فوائد بنكية ومصرفية',     key:'fin',  val:mFin   },
    { lbl:'مصروفات خيرية',           key:'char', val:mChar  },
    { lbl:'مصروفات أخرى',            key:'oth',  val:mOth   },
  ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);

  const maxExp = expItems[0] ? expItems[0].val : 1;
  const expRate = (key, revPct) => {
    if (key === 'fin')  return revPct > 2 ? {lbl:'خطر',col:'#da4a4a'} : revPct > 1 ? {lbl:'تحذير',col:'#da9a4a'} : {lbl:'مقبول',col:'#4ada8e'};
    if (key === 'sal')  return revPct > 15 ? {lbl:'مرتفع',col:'#da9a4a'} : {lbl:'طبيعي',col:'#4ada8e'};
    return revPct > 10 ? {lbl:'متابعة',col:'#da9a4a'} : {lbl:'طبيعي',col:'#4ada8e'};
  };

  const expEl = document.getElementById('cfo-expenses');
  if (expEl) expEl.innerHTML = `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.80rem">
      <thead><tr style="background:#081828">
        <th style="padding:7px 10px;text-align:right;color:#7090b0;font-weight:500">البند</th>
        <th style="padding:7px 8px;text-align:left;color:#7090b0;font-weight:500">المبلغ (ر.س)</th>
        <th style="padding:7px 8px;text-align:left;color:#7090b0;font-weight:500">% إيراد</th>
        <th style="padding:7px 8px;text-align:left;color:#7090b0;font-weight:500">% مصروفات</th>
        <th style="padding:7px 8px;color:#7090b0;font-weight:500;min-width:60px">شريط</th>
        <th style="padding:7px 8px;text-align:center;color:#7090b0;font-weight:500">تقييم</th>
      </tr></thead>
      <tbody>
        ${expItems.map(x => {
          const rp  = c.revenue > 0 ? x.val / c.revenue * 100 : 0;
          const op  = totalOpex > 0 ? x.val / totalOpex * 100 : 0;
          const w   = (x.val / maxExp * 100).toFixed(0);
          const bc  = x.key === 'fin' ? '#da4a4a' : x.key === 'sal' ? '#5baef0' : '#4a9eda';
          const rat = expRate(x.key, rp);
          const isFin = x.key === 'fin';
          return `<tr style="border-bottom:1px solid #0e2540${isFin ? ';background:#0e0808' : ''}">
            <td style="padding:7px 10px;color:${isFin?'#e08080':'#c0d0e0'}">${x.lbl}${isFin?' ⚠':''}</td>
            <td style="padding:7px 8px;text-align:left;font-variant-numeric:tabular-nums">${fmt(x.val)}</td>
            <td style="padding:7px 8px;text-align:left;color:${isFin&&rp>2?'#da4a4a':isFin&&rp>1?'#da9a4a':'#b0c8e0'}">${rp.toFixed(2)}%</td>
            <td style="padding:7px 8px;text-align:left">${op.toFixed(1)}%</td>
            <td style="padding:7px 8px">
              <div style="height:6px;border-radius:3px;background:#06121e;overflow:hidden">
                <div style="height:100%;border-radius:3px;background:${bc}aa;width:${w}%"></div>
              </div>
            </td>
            <td style="padding:7px 8px;text-align:center">
              <span style="font-size:.71rem;padding:2px 7px;border-radius:8px;background:${rat.col}22;color:${rat.col};font-weight:600">${rat.lbl}</span>
            </td>
          </tr>`;
        }).join('')}
        <tr style="border-top:2px solid #2a4a7a;background:#0a1e30">
          <td style="padding:7px 10px;color:#e0f0ff;font-weight:600">إجمالي المصروفات</td>
          <td style="padding:7px 8px;text-align:left;font-variant-numeric:tabular-nums;font-weight:600;color:#e0f0ff">${fmt(totalOpex)}</td>
          <td style="padding:7px 8px;text-align:left;font-weight:600;color:${c.revenue>0&&totalOpex/c.revenue>0.2?'#da9a4a':'#c0d0e0'}">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':'—'}</td>
          <td style="padding:7px 8px;text-align:left;color:#c0d0e0">100%</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:8px;padding:8px 12px;background:#06121e;border-radius:5px;border-right:3px solid #2a4a6a;font-size:.72rem;color:#506070;line-height:1.7">
      * المبالغ أعلاه من مصدر المصروفات التشغيلية (يتوافق مع تبويب الملخص والحسابات). في <strong style="color:#7090a0">قائمة الدخل</strong> تظهر بند التوزيع والنقل أقل بمقدار ~${fmt(mDist - c.dist)} ر.س لأن ح. <em>نقل المشتريات (4010301001)</em> يُعاد تصنيفه ضمن تكلفة البضاعة المباعة كتكاليف إيصال.
    </div></div>`;

  // ── Efficiency / Working Capital ──
  const cashRunwayMo = (totalOpex / Math.max(plFilt.length, 1));
  const cashRunway   = cashRunwayMo > 0 ? (r.cash / cashRunwayMo).toFixed(1) : null;
  const effEl = document.getElementById('cfo-efficiency');
  if (effEl) {
    const efRows = [
      { lbl:'أيام تحصيل المدينين',  val:r.arDays!==null?r.arDays.toFixed(0)+' يوم':'—',       col:r.arDays!==null?(r.arDays<60?'#4ada8e':r.arDays<90?'#da9a4a':'#da4a4a'):'#5a7a9a',     target:'< 60 يوم' },
      { lbl:'أيام دوران المخزون',   val:r.invDays!==null?r.invDays.toFixed(0)+' يوم':'—',      col:r.invDays!==null?(r.invDays<60?'#4ada8e':r.invDays<90?'#da9a4a':'#da4a4a'):'#5a7a9a',   target:'< 60 يوم' },
      { lbl:'النسبة السريعة',       val:r.quickRatio!==null?r.quickRatio.toFixed(2)+'×':'—',   col:r.quickRatio!==null?(r.quickRatio>=1?'#4ada8e':r.quickRatio>=0.7?'#da9a4a':'#da4a4a'):'#5a7a9a', target:'> 1.0×' },
      { lbl:'تغطية الفوائد',        val:r.intCoverage!==null?r.intCoverage.toFixed(2)+'×':'—', col:r.intCoverage!==null?(r.intCoverage>=3?'#4ada8e':r.intCoverage>=1.5?'#da9a4a':'#da4a4a'):'#5a7a9a', target:'> 3.0×' },
      { lbl:'العائد على الأصول',    val:r.roa!==null?r.roa.toFixed(1)+'%':'—',                 col:r.roa!==null?(r.roa>=5?'#4ada8e':r.roa>=2?'#da9a4a':'#da4a4a'):'#5a7a9a',              target:'> 5%' },
      { lbl:'العائد على الملكية',   val:r.roe!==null?r.roe.toFixed(1)+'%':'—',                 col:r.roe!==null?(r.roe>=15?'#4ada8e':r.roe>=5?'#da9a4a':'#da4a4a'):'#5a7a9a',             target:'> 15%' },
      { lbl:'مدى النقدية (أشهر)',   val:cashRunway!==null?cashRunway+' شهر':'—',              col:cashRunway!==null?(+cashRunway>=3?'#4ada8e':+cashRunway>=1?'#da9a4a':'#da4a4a'):'#5a7a9a', target:'> 3 أشهر' },
      { lbl:'رصيد المدينين',        val:fmt(r.ar)+' ر.س',                                      col:'#5baef0',                                                                             target:'' },
      { lbl:'قيمة المخزون',         val:fmt(r.inventory)+' ر.س',                               col:'#da9a4a',                                                                             target:'' },
      { lbl:'حقوق الملكية',         val:fmtPlNum(r.totalE)+' ر.س',                             col:r.totalE>=0?'#4a9eda':'#da4a4a',                                                       target:'' },
    ];
    effEl.innerHTML = efRows.map(it => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;margin-bottom:6px;background:#06121e;border-radius:6px;border-right:3px solid ${it.col}">
        <span style="color:#b0c8e0;font-size:.82rem">${it.lbl}</span>
        <div style="text-align:left">
          <div style="color:${it.col};font-weight:700;font-size:.88rem">${it.val}</div>
          ${it.target ? `<div style="color:#506070;font-size:.70rem">${it.target}</div>` : ''}
        </div>
      </div>`).join('');
  }

  // ── Action Plan ──
  const actions  = _cfoActions(r, c, plFilt.length, mFilt);
  const priColor = { 1:'#da4a4a', 2:'#da9a4a', 3:'#4a9eda' };
  const priTag   = { 1:'P1 — عاجل جداً', 2:'P2 — متابعة', 3:'P3 — تحسين' };
  const actEl    = document.getElementById('cfo-actions');
  if (actEl) actEl.innerHTML = !actions.length
    ? '<div style="padding:24px;color:#4ada8e;text-align:center">✓ لا توجد توجيهات عاجلة — الوضع المالي مقبول</div>'
    : actions.map((a, i) => `
      <div style="display:flex;gap:14px;padding:16px;border-bottom:1px solid #0e2540">
        <div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:${priColor[a.priority]}22;border:2px solid ${priColor[a.priority]};display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:${priColor[a.priority]}">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
            <strong style="color:${priColor[a.priority]};font-size:.85rem">${a.title}</strong>
            <span style="font-size:.68rem;padding:2px 8px;border-radius:8px;background:${priColor[a.priority]}22;color:${priColor[a.priority]};white-space:nowrap">${priTag[a.priority]}</span>
          </div>
          <div style="color:#9ab0c8;font-size:.81rem;line-height:1.75">${a.body}</div>
          ${a.impact ? `<div style="margin-top:7px;font-size:.75rem;color:#506070">🎯 الأثر المتوقع: <span style="color:#a0c4e8">${a.impact}</span></div>` : ''}
        </div>
      </div>`).join('');
}

// ── CFO Dashboard exports ─────────────────────────────────────────────────────
function buildCFOHTMLReport() {
  const bs  = State.get('bs') || [];
  const pl  = State.get('pl') || [];
  if (!bs.length || !pl.length) return '<p>لا توجد بيانات</p>';

  const allMths = [...new Set(pl.map(r => r.month))].sort();
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const lastMo  = bsMths[bsMths.length - 1];
  const quick   = (document.getElementById('cfo-quick-sel') || {}).value || 'ytd';
  const plFrom  = _cfoGetPlFrom(quick, lastMo, allMths);

  const plFilt = pl.filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const mFilt  = (State.get('monthly') || []).filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const c      = aggregatePL(plFilt);
  const r      = computeRatios(bs, pl, lastMo, plFrom);
  if (!r) return '<p>لا توجد بيانات كافية</p>';

  const hs = _cfoHealthScore(r);
  const scoreCol = hs.score >= 70 ? '#1a7a4a' : hs.score >= 40 ? '#a06010' : '#8a1010';
  const scoreLbl = hs.score >= 70 ? 'جيد' : hs.score >= 50 ? 'متوسط' : hs.score >= 30 ? 'ضعيف' : 'حرج';

  const periodLabel = !plFrom ? 'كل الفترات' : `${plFrom} إلى ${lastMo}`;
  const actions = _cfoActions(r, c, plFilt.length, mFilt);
  const priColor = { 1:'#c02020', 2:'#b06010', 3:'#1060a0' };
  const priTag   = { 1:'P1 — عاجل جداً', 2:'P2 — متابعة', 3:'P3 — تحسين' };

  const mSal  = mFilt.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent = mFilt.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint= mFilt.reduce((s, m) => s + (m.maint||0), 0);
  const mSell = mFilt.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist = mFilt.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm  = mFilt.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin  = mFilt.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar = mFilt.reduce((s, m) => s + (m.char ||0), 0);
  const mOth  = mFilt.reduce((s, m) => s + (m.oth  ||0), 0);
  const totalOpex = mSal+mRent+mMaint+mSell+mDist+mAdm+mFin+mChar+mOth;
  const finPct = c.revenue > 0 ? mFin / c.revenue * 100 : 0;

  const kpis = [
    { lbl:'إجمالي الإيراد',           val:fmt(c.revenue)+' ر.س' },
    { lbl:'هامش الربح الإجمالي',       val:r.grossMargin!==null?r.grossMargin.toFixed(1)+'%':'—' },
    { lbl:'هامش الربح الصافي',         val:r.netMargin!==null?r.netMargin.toFixed(2)+'%':'—' },
    { lbl:'النقدية والبنوك',           val:fmt(r.cash)+' ر.س' },
    { lbl:'النسبة الجارية',            val:r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—' },
    { lbl:'الفوائد / الإيراد',         val:finPct.toFixed(2)+'%' },
  ];

  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>لوحة المدير المالي — ${periodLabel}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin:0; padding:20px; background:#fff; color:#222; direction:rtl; }
  h1 { font-size:1.4rem; border-bottom:3px solid #1a4a8a; padding-bottom:10px; color:#1a4a8a; margin-bottom:6px; }
  .meta { font-size:.78rem; color:#666; margin-bottom:22px; }
  .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:22px; }
  .kpi { background:#f0f4fa; border-radius:8px; padding:12px 16px; border-right:4px solid #1a4a8a; }
  .kpi .lbl { font-size:.74rem; color:#557; margin-bottom:4px; }
  .kpi .val { font-size:1.15rem; font-weight:700; color:#1a4a8a; }
  .section { margin-bottom:22px; }
  .section h2 { font-size:1rem; color:#2a5a9a; border-bottom:1px solid #cde; padding-bottom:5px; margin-bottom:10px; }
  .health-score { text-align:center; font-size:2.2rem; font-weight:700; color:${scoreCol}; padding:10px 0; }
  .health-sub { text-align:center; font-size:.82rem; color:#557; margin-bottom:14px; }
  .health-bar-row { margin-bottom:9px; }
  .health-bar-label { display:flex; justify-content:space-between; font-size:.78rem; margin-bottom:3px; }
  .bar-bg { height:8px; border-radius:4px; background:#e0e8f0; overflow:hidden; }
  .bar-fill { height:100%; border-radius:4px; }
  table { width:100%; border-collapse:collapse; font-size:.80rem; }
  th { background:#1a4a8a; color:#fff; padding:8px 10px; text-align:right; }
  td { padding:7px 10px; border-bottom:1px solid #dde; }
  tr:hover td { background:#f5f8ff; }
  .action { display:flex; gap:12px; padding:12px; border-bottom:1px solid #dde; }
  .action .num { flex-shrink:0; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.78rem; }
  .action .body { flex:1; }
  .action .title { font-weight:700; font-size:.85rem; margin-bottom:5px; }
  .action .detail { font-size:.80rem; color:#445; line-height:1.7; }
  .action .impact { font-size:.74rem; color:#778; margin-top:5px; }
  @media print { body { padding:10px; } }
</style></head><body>
<h1>🏆 لوحة المدير المالي التنفيذية</h1>
<div class="meta">الفترة: ${periodLabel} &nbsp;|&nbsp; تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>

<div class="kpis">${kpis.map(k=>`<div class="kpi"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join('')}</div>

<div class="section">
  <h2>🏥 درجة الصحة المالية</h2>
  <div class="health-score">${hs.score} / 100</div>
  <div class="health-sub">${scoreLbl}</div>
  ${hs.items.map(it=>`<div class="health-bar-row">
    <div class="health-bar-label"><span>${it.lbl}</span><span style="color:${it.col}">${it.val} (${it.score}/${it.max}) — المستهدف: ${it.target}</span></div>
    <div class="bar-bg"><div class="bar-fill" style="width:${it.max?(it.score/it.max*100).toFixed(0):0}%;background:${it.col}"></div></div>
  </div>`).join('')}
</div>

<div class="section">
  <h2>📊 هيكل المصروفات</h2>
  <table>
    <thead><tr><th>البند</th><th style="text-align:left">المبلغ (ر.س)</th><th style="text-align:left">% الإيراد</th><th style="text-align:left">% المصروفات</th></tr></thead>
    <tbody>
      ${[{lbl:'رواتب وأجور',val:mSal},{lbl:'إيجار',val:mRent},{lbl:'صيانة وتشغيل',val:mMaint},{lbl:'مبيعات وتسويق',val:mSell},{lbl:'توزيع ونقل',val:mDist},{lbl:'مصروفات إدارية',val:mAdm},{lbl:'فوائد بنكية',val:mFin},{lbl:'مصروفات خيرية',val:mChar},{lbl:'مصروفات أخرى',val:mOth}].filter(x=>x.val>0).sort((a,b)=>b.val-a.val).map(x=>`<tr><td>${x.lbl}</td><td style="text-align:left">${fmt(x.val)}</td><td style="text-align:left">${c.revenue>0?(x.val/c.revenue*100).toFixed(2)+'%':'—'}</td><td style="text-align:left">${totalOpex>0?(x.val/totalOpex*100).toFixed(1)+'%':'—'}</td></tr>`).join('')}
      <tr style="font-weight:700;background:#e8eef8"><td>الإجمالي</td><td style="text-align:left">${fmt(totalOpex)}</td><td style="text-align:left">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':'—'}</td><td style="text-align:left">100%</td></tr>
    </tbody>
  </table>
</div>

<div class="section">
  <h2>🎯 خطة العمل التنفيذية</h2>
  ${!actions.length?'<p style="color:#2a7a4a">✓ لا توجد توجيهات عاجلة — الوضع المالي مقبول</p>':actions.map((a,i)=>`<div class="action">
    <div class="num" style="background:${priColor[a.priority]}22;color:${priColor[a.priority]};border:2px solid ${priColor[a.priority]}">${i+1}</div>
    <div class="body">
      <div class="title" style="color:${priColor[a.priority]}">${a.title} <span style="font-size:.72rem;padding:2px 7px;border-radius:8px;background:${priColor[a.priority]}22">${priTag[a.priority]}</span></div>
      <div class="detail">${a.body}</div>
      ${a.impact?`<div class="impact">🎯 الأثر المتوقع: ${a.impact}</div>`:''}
    </div>
  </div>`).join('')}
</div>
</body></html>`;
}

function exportCFOHTML() {
  const bs = State.get('bs') || [];
  if (!bs.length) { alert('لا توجد بيانات'); return; }
  const html = buildCFOHTMLReport();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const lastMo = [...new Set(bs.map(r => r.month))].sort().pop() || 'report';
  a.download = `cfo-dashboard-${lastMo}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function printCFOPDF() {
  const bs = State.get('bs') || [];
  if (!bs.length) { alert('لا توجد بيانات'); return; }
  const html = buildCFOHTMLReport();
  const w = window.open('', '_blank', 'width=1000,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportCFOExcel() {
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }
  const bs  = State.get('bs') || [];
  const pl  = State.get('pl') || [];
  if (!bs.length || !pl.length) { alert('لا توجد بيانات'); return; }

  const allMths = [...new Set(pl.map(r => r.month))].sort();
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const lastMo  = bsMths[bsMths.length - 1];
  const quick   = (document.getElementById('cfo-quick-sel') || {}).value || 'ytd';
  const plFrom  = _cfoGetPlFrom(quick, lastMo, allMths);
  const plFilt  = pl.filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const mFilt   = (State.get('monthly') || []).filter(m => m.month <= lastMo && (!plFrom || m.month >= plFrom));
  const c       = aggregatePL(plFilt);
  const r       = computeRatios(bs, pl, lastMo, plFrom);
  if (!r) { alert('لا توجد بيانات كافية'); return; }

  const hs = _cfoHealthScore(r);
  const actions = _cfoActions(r, c, plFilt.length, mFilt);
  const periodLabel = !plFrom ? 'كل الفترات' : `${plFrom} — ${lastMo}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft Expenses Dashboard';

  const hdr = (ws, cols) => {
    const row = ws.addRow(cols.map(c => c.header));
    row.eachCell(cell => {
      cell.fill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A4A8A' } };
      cell.font   = { bold:true, color:{ argb:'FFFFFFFF' }, size:10 };
      cell.border = { bottom:{ style:'thin', color:{ argb:'FF9BB8E0' } } };
      cell.alignment = { horizontal:'center' };
    });
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 18; });
  };

  // Sheet 1: لوحة CFO
  const ws1 = wb.addWorksheet('لوحة CFO');
  ws1.views = [{ rightToLeft: true }];
  ws1.addRow([`لوحة المدير المالي — ${periodLabel}`]).getCell(1).font = { bold:true, size:13, color:{ argb:'FF1A4A8A' } };
  ws1.addRow([]);
  ws1.addRow(['مؤشرات الأداء الرئيسية']).getCell(1).font = { bold:true, size:11 };
  hdr(ws1, [{ header:'المؤشر', width:30 }, { header:'القيمة', width:20 }]);
  const kpiRows = [
    ['إجمالي الإيراد', fmt(c.revenue)+' ر.س'],
    ['مجمل الربح', fmt(c.grossProfit)+' ر.س'],
    ['صافي الربح', fmtPlNum(c.netProfit)+' ر.س'],
    ['هامش الربح الإجمالي', r.grossMargin!==null?r.grossMargin.toFixed(1)+'%':'—'],
    ['هامش الربح الصافي', r.netMargin!==null?r.netMargin.toFixed(2)+'%':'—'],
    ['النسبة الجارية', r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—'],
    ['النسبة السريعة', r.quickRatio!==null?r.quickRatio.toFixed(2)+'×':'—'],
    ['تغطية الفوائد', r.intCoverage!==null?r.intCoverage.toFixed(2)+'×':'—'],
    ['نسبة الدين/الملكية', r.debtEquity!==null?r.debtEquity.toFixed(1)+'×':'—'],
    ['العائد على الأصول', r.roa!==null?r.roa.toFixed(1)+'%':'—'],
    ['العائد على الملكية', r.roe!==null?r.roe.toFixed(1)+'%':'—'],
    ['النقدية والبنوك', fmt(r.cash)+' ر.س'],
    ['رصيد المدينين', fmt(r.ar)+' ر.س'],
    ['أيام التحصيل', r.arDays!==null?r.arDays.toFixed(0)+' يوم':'—'],
    ['قيمة المخزون', fmt(r.inventory)+' ر.س'],
    ['أيام دوران المخزون', r.invDays!==null?r.invDays.toFixed(0)+' يوم':'—'],
  ];
  kpiRows.forEach(row => ws1.addRow(row));
  ws1.addRow([]);
  ws1.addRow(['درجة الصحة المالية', hs.score + ' / 100']).getCell(1).font = { bold:true };
  hs.items.forEach(it => ws1.addRow([it.lbl, `${it.val} (${it.score}/${it.max}) — المستهدف: ${it.target}`]));

  // Sheet 2: خطة العمل
  const ws2 = wb.addWorksheet('خطة العمل');
  ws2.views = [{ rightToLeft: true }];
  ws2.addRow([`خطة العمل التنفيذية — ${periodLabel}`]).getCell(1).font = { bold:true, size:13, color:{ argb:'FF1A4A8A' } };
  ws2.addRow([]);
  hdr(ws2, [{ header:'#', width:5 }, { header:'الأولوية', width:18 }, { header:'العنوان', width:40 }, { header:'الإجراءات', width:60 }, { header:'الأثر المتوقع', width:40 }]);
  const priTag = { 1:'P1 — عاجل جداً', 2:'P2 — متابعة', 3:'P3 — تحسين' };
  actions.forEach((a, i) => {
    const row = ws2.addRow([i+1, priTag[a.priority], a.title, a.body.replace(/<[^>]*>/g,''), a.impact]);
    row.getCell(4).alignment = { wrapText:true };
    row.getCell(5).alignment = { wrapText:true };
  });

  // Sheet 3: الاتجاه الشهري
  const ws3 = wb.addWorksheet('الاتجاه الشهري');
  ws3.views = [{ rightToLeft: true }];
  ws3.addRow([`الأداء الشهري — ${periodLabel}`]).getCell(1).font = { bold:true, size:13, color:{ argb:'FF1A4A8A' } };
  ws3.addRow([]);
  hdr(ws3, [
    { header:'الشهر', width:14 }, { header:'الإيراد', width:16 }, { header:'مجمل الربح', width:16 },
    { header:'ه. إجمالي%', width:13 }, { header:'صافي الربح', width:16 }, { header:'ه. صافي%', width:13 },
    { header:'إجمالي المصروفات', width:20 },
  ]);
  plFilt.forEach(m => {
    const gp = (m.revenue||0) - (m.cogs||0) - (m.otherCost||0);
    const op = (m.sal||0)+(m.rent||0)+(m.maint||0)+(m.sell||0)+(m.dist||0)+(m.adm||0)+(m.fin||0)+(m.char||0)+(m.oth||0);
    const np = gp - op;
    const gmPct = m.revenue > 0 ? (gp / m.revenue * 100).toFixed(1) : '—';
    const nmPct = m.revenue > 0 ? (np / m.revenue * 100).toFixed(2) : '—';
    ws3.addRow([m.label||m.month, +m.revenue||0, gp, gmPct, np, nmPct, op]);
  });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cfo-dashboard-${lastMo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
