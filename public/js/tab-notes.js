// ── NOTES tab ─────────────────────────────────────────────────────────────────

let _notesTimer     = null;
let _notesCountdown = 0;
const NOTES_REFRESH_SEC = 60;
function _notesIsActive() { return !!document.querySelector('.tab.active[data-tab="notes"]'); }
function _notesStopTimer() { if (_notesTimer) { clearInterval(_notesTimer); _notesTimer = null; } }
function _notesStartCountdown(asOf, netProfit) {
  _notesStopTimer();
  _notesCountdown = NOTES_REFRESH_SEC;
  const el = document.getElementById('notes-status');
  const fmM = v => ((+v||0)/1e6).toFixed(2) + ' م';
  const tick = () => {
    if (!el) return;
    const npTxt = netProfit != null ? ` | صافي ربح: ${fmM(netProfit)}` : '';
    if (_notesCountdown > 0) {
      el.textContent = `✅ كما في ${asOf}${npTxt} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_notesCountdown}ث`;
      el.style.color = '#1a7a3c';
    }
  };
  tick();
  _notesTimer = setInterval(() => {
    if (!_notesIsActive()) { _notesStopTimer(); return; }
    _notesCountdown = Math.max(0, _notesCountdown - 1);
    tick();
  }, 1000);
}

function buildNotesPeriodOptions() {
  const bs  = State.get('bs');
  const sel = document.getElementById('notes-period-sel');
  if (!sel || !bs || !bs.length) return;
  const months = [...new Set(bs.map(r => r.month))].sort();
  const cur = sel.value;
  sel.innerHTML = '';
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();
  years.forEach(y => {
    const yMs = months.filter(m => m.startsWith(y));
    const oy  = document.createElement('option');
    oy.value = yMs[yMs.length - 1]; oy.textContent = `من بداية ${y} إلى الآن`; sel.appendChild(oy);
    [1, 2, 3, 4].forEach(q => {
      const qMs = yMs.filter(m => qOf(m) === q);
      if (qMs.length) {
        const oq = document.createElement('option');
        oq.value = qMs[qMs.length - 1]; oq.textContent = `${y} — ${Q_LABELS[q-1]}`; sel.appendChild(oq);
      }
    });
  });
  months.forEach(mo => {
    const row = bs.find(r => r.month === mo);
    const o = document.createElement('option');
    o.value = mo; o.textContent = row ? row.label : mo; sel.appendChild(o);
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || '';
}

function renderNotesTab() {
  const bs = State.get('bs');
  const pl = State.get('pl');
  if (!bs || !bs.length) {
    const nb = document.getElementById('notes-body');
    if (nb) nb.innerHTML = '<div style="color:#5a7a9a;padding:20px;text-align:center">لا توجد بيانات كافية</div>';
    return;
  }

  buildNotesPeriodOptions();
  const asOf = (document.getElementById('notes-period-sel') || {}).value || '';
  if (!asOf) return;

  const plMode  = (document.getElementById('notes-pl-mode') || {}).value || 'ytd';
  const plFrom  = getRatiosPlFrom(asOf, plMode);

  const modeHintEl = document.getElementById('notes-mode-hint');
  if (modeHintEl) modeHintEl.textContent = { ytd:'من بداية السنة', cumul:'تراكمي من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || '';

  const r = computeRatios(bs, pl, asOf, plFrom);
  if (!r) return;

  const months  = [...new Set(bs.map(x => x.month))].sort();
  const asOfIdx = months.indexOf(asOf);
  const prevMo  = asOfIdx > 0 ? months[asOfIdx - 1] : null;
  const rPrev   = prevMo ? computeRatios(bs, pl, prevMo, getRatiosPlFrom(prevMo, plMode)) : null;

  // Filter P&L according to selected mode
  const plToDate  = (pl || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const c         = aggregatePL(plToDate);
  const nMonths   = Math.max(plToDate.length, 1);
  const totalCost = c.cogs + (c.otherCost || 0);

  // Use monthly expense state for opex breakdown — same mode filter
  const moToDate = State.get('monthly').filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const mSal   = moToDate.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent  = moToDate.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint = moToDate.reduce((s, m) => s + (m.maint||0), 0);
  const mSell  = moToDate.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist  = moToDate.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm   = moToDate.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin   = moToDate.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar  = moToDate.reduce((s, m) => s + (m.char ||0), 0);
  const mOth   = moToDate.reduce((s, m) => s + (m.oth  ||0), 0);
  const totalOpex = mSal + mRent + mMaint + mSell + mDist + mAdm + mFin + mChar + mOth;
  const netProfitDisplay = c.grossProfit - totalOpex;  // consistent with monthly opex source

  // Build opex breakdown early so recommendations can reference it
  const opexItemsArr = [
    { lbl:'الرواتب والأجور',    val: mSal   },
    { lbl:'الإيجار',            val: mRent  },
    { lbl:'الصيانة والتشغيل',  val: mMaint },
    { lbl:'المصروفات البيعية',  val: mSell  },
    { lbl:'التوزيع والنقل',     val: mDist  },
    { lbl:'المصروفات الإدارية',val: mAdm   },
    { lbl:'التكاليف المالية',   val: mFin   },
    { lbl:'المصروفات الخيرية', val: mChar  },
    { lbl:'مصروفات أخرى',      val: mOth   },
  ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);

  const periodLabel = r.label || asOf;
  const companyName = State.get('companyName') || 'الشركة';

  const bfRows     = State.get('bankFacilities') || [];
  const bfRow      = bfRows.filter(b => b.month <= asOf).slice(-1)[0];
  const bfBalance  = bfRow ? Math.abs(bfRow.balance) : 0;

  // ── KPIs ──
  document.getElementById('notes-kpis').innerHTML = [
    { lbl:'الفترة',               val: `${nMonths} ${nMonths === 1 ? 'شهر' : 'أشهر'} حتى ${periodLabel}`,   col:'#5baef0' },
    { lbl:'إيراد الفترة',          val: fmt(c.revenue) + ' ر.س',                                              col:'#4ada8e' },
    { lbl:'صافي الربح / الخسارة', val: fmt(c.netProfit) + ' ر.س',                                            col: c.netProfit >= 0 ? '#4ada8e' : '#da4a4a' },
    { lbl:'هامش الربح الصافي',   val: r.netMargin !== null ? r.netMargin.toFixed(1) + '%' : '—',             col: r.netMargin >= 5 ? '#4ada8e' : r.netMargin >= 2 ? '#da9a4a' : '#da4a4a' },
    { lbl:'إجمالي الأصول',       val: fmt(r.totalA) + ' ر.س',                                               col:'#4a9eda' },
    { lbl:'حقوق الملكية',        val: fmt(r.totalE) + ' ر.س',                                               col: r.totalE >= 0 ? '#4a9eda' : '#da4a4a' },
  ].map(k => `<div class="kpi" style="--accent:${k.col}"><div class="lbl">${k.lbl}</div><div class="val" style="font-size:.95rem">${k.val}</div></div>`).join('');

  // ── Rule-based Recommendations ──
  const recs = [];
  const addRec = (priority, icon, title, body) => recs.push({ priority, icon, title, body });
  const priCol   = { 1:'#da4a4a', 2:'#da9a4a', 3:'#4a9eda' };
  const priLabel = { 1:'عاجل', 2:'متابعة', 3:'ملاحظة' };

  if (r.currentRatio !== null && r.currentRatio < 1)
    addRec(1,'🚨','ضعف السيولة الحرجة',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستوى الأمن. الأصول المتداولة (${fmt(r.currA)} ر.س) لا تغطي الالتزامات المتداولة (${fmt(r.currL)} ر.س). يُوصى بمراجعة جدول التحصيل وإعادة هيكلة الالتزامات قصيرة الأجل.`);
  else if (r.currentRatio !== null && r.currentRatio < 1.5)
    addRec(2,'⚠️','السيولة بحاجة إلى تحسين',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستهدف (1.5×). يُنصح بمتابعة التدفق النقدي الشهري والحد من التزامات جديدة قصيرة الأجل.`);

  if (r.quickRatio !== null && r.quickRatio < 0.7)
    addRec(1,'🚨','نسبة سريعة حرجة',`النسبة السريعة ${r.quickRatio.toFixed(2)}× تشير إلى اعتماد مفرط على المخزون (${fmt(r.inventory)} ر.س) لتغطية الالتزامات. يُوصى بتسريع تحويل المخزون إلى نقد.`);

  if (r.netMargin !== null && r.netMargin < 0)
    addRec(1,'📉','الشركة تعمل بخسارة',`صافي الربح سالب (${r.netMargin.toFixed(1)}%). التكاليف تتجاوز الإيراد بـ ${fmt(Math.abs(c.netProfit))} ر.س. يستلزم مراجعة عاجلة لهيكل التكاليف وتحليل نقطة التعادل.`);
  else if (r.netMargin !== null && r.netMargin < 3)
    addRec(2,'⚠️','هامش الربح الصافي منخفض',`هامش ${r.netMargin.toFixed(1)}% أقل من الحد الأدنى المقبول (3%). يُنصح بمراجعة التسعير وضبط عناصر التكلفة الرئيسية.`);

  if (r.grossMargin !== null && r.grossMargin < 10)
    addRec(2,'⚠️','هامش الربح الإجمالي ضعيف',`هامش الربح الإجمالي ${r.grossMargin.toFixed(1)}% يشير إلى ضغط على تكلفة البضاعة. يُنصح بمراجعة أسعار الشراء والتفاوض مع الموردين.`);

  if (r.roe !== null && r.roe < 8) {
    const msg = r.roe < 0 ? `سالب (${r.roe.toFixed(1)}%)، مما يعني أن الملاك يتكبدون خسارة على استثماراتهم.` : `${r.roe.toFixed(1)}% أقل من الحد الأدنى المقبول (8%).`;
    addRec(r.roe < 0 ? 1 : 2,'💰','العائد على الملكية ضعيف',`العائد على حقوق الملكية ${msg} يُوصى بتحسين كفاءة توظيف رأس المال.`);
  }

  if (r.debtEquity !== null && r.debtEquity > 2)
    addRec(2,'⚖️','ارتفاع الرفع المالي',`نسبة الدين إلى الملكية ${r.debtEquity.toFixed(2)}× تتجاوز الحد المريح. الالتزامات (${fmt(r.totalL)} ر.س) أكبر بكثير من الملكية (${fmt(r.totalE)} ر.س). يُنصح بتسريع سداد الديون أو تقوية رأس المال.`);

  if (r.intCoverage !== null && r.intCoverage < 1.5)
    addRec(1,'🏦','ضعف تغطية الفوائد',`تغطية الفوائد ${r.intCoverage.toFixed(1)}× — الأرباح التشغيلية لا تغطي أعباء التمويل بهامش كافٍ. يُوصى بمراجعة جدول الديون ومحاولة تخفيض معدلات الفائدة.`);

  if (r.arDays !== null && r.arDays > 90)
    addRec(2,'📅','بطء تحصيل المديونيات',`متوسط أيام التحصيل ${r.arDays.toFixed(0)} يوماً يتجاوز الحد المقبول (90). رصيد المدينين (${fmt(r.ar)} ر.س) مرتفع. يُنصح بتفعيل سياسة التحصيل ومتابعة كبار العملاء.`);

  if (r.invDays !== null && r.invDays > 90)
    addRec(2,'📦','بطء دوران المخزون',`متوسط أيام دوران المخزون ${r.invDays.toFixed(0)} يوماً يشير إلى وجود مخزون راكد. يُوصى بتقييم حركة الأصناف وتخفيض المخزون الزائد.`);

  if (bfBalance > 0 && r.totalE > 0 && bfBalance > r.totalE * 0.5)
    addRec(2,'🏦','حجم التسهيلات البنكية مرتفع',`التسهيلات البنكية (${fmt(bfBalance)} ر.س) تمثّل نسبة مرتفعة من حقوق الملكية (${(bfBalance/r.totalE*100).toFixed(1)}%). يُنصح بوضع خطة لتخفيض الاعتماد على التمويل البنكي.`);

  if (rPrev && r.netMargin !== null && rPrev.netMargin !== null && r.netMargin < rPrev.netMargin - 2)
    addRec(2,'📉','تراجع ملحوظ في هامش الربح',`هامش الربح تراجع من ${rPrev.netMargin.toFixed(1)}% إلى ${r.netMargin.toFixed(1)}% مقارنة بالفترة السابقة. يُنصح بتحليل أسباب ارتفاع التكاليف أو انخفاض الإيراد.`);

  // Opex concentration & ratio checks
  if (opexItemsArr.length > 0 && totalOpex > 0) {
    const top = opexItemsArr[0];
    if (top.val / totalOpex > 0.5)
      addRec(3,'📊',`تركّز المصروفات في: ${top.lbl}`,
        `${top.lbl} تمثّل ${(top.val/totalOpex*100).toFixed(1)}% من إجمالي المصروفات التشغيلية (${fmt(top.val)} ر.س). تركّز البند الواحد فوق 50% يُشير إلى خطر تشغيلي عند أي ارتفاع مفاجئ في هذا النوع من التكاليف.`);
  }
  if (c.revenue > 0 && totalOpex / c.revenue > 0.25)
    addRec(2,'⚙️','ارتفاع نسبة المصروفات التشغيلية إلى الإيراد',
      `المصروفات التشغيلية تمثّل ${(totalOpex/c.revenue*100).toFixed(1)}% من الإيراد (${fmt(totalOpex)} من ${fmt(c.revenue)} ر.س). يُنصح بوضع هدف لخفض هذه النسبة إلى ما دون 20% عبر ضبط التكاليف أو رفع الإيراد.`);

  recs.sort((a, b) => a.priority - b.priority);
  const recEl = document.getElementById('notes-recommendations');
  recEl.innerHTML = !recs.length
    ? `<div style="padding:14px;color:#4ada8e;background:#0a1a0a;border:1px solid #4ada8e33;border-radius:8px;font-size:.85rem">✓ لا توجد توجيهات عاجلة — الوضع المالي ضمن النطاق المقبول</div>`
    : recs.map(rec => `
      <div style="margin-bottom:10px;padding:12px;border-radius:8px;background:#0d1b2a;border-right:3px solid ${priCol[rec.priority]}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span>${rec.icon}</span>
          <span style="color:${priCol[rec.priority]};font-weight:600;font-size:.82rem">${rec.title}</span>
          <span style="margin-right:auto;font-size:.68rem;padding:1px 6px;border-radius:8px;background:${priCol[rec.priority]}22;color:${priCol[rec.priority]}">${priLabel[rec.priority]}</span>
        </div>
        <div style="color:#9ab0c8;font-size:.80rem;line-height:1.6">${rec.body}</div>
      </div>`).join('');

  // ── Strengths ──
  const strs = [];
  const addStr = (icon, title, body) => strs.push({ icon, title, body });

  if (r.currentRatio !== null && r.currentRatio >= 1.5)
    addStr('💧','سيولة جيدة',`النسبة الجارية ${r.currentRatio.toFixed(2)}× تشير إلى قدرة جيدة على تغطية الالتزامات قصيرة الأجل.`);
  if (r.netMargin !== null && r.netMargin >= 8)
    addStr('📈','هامش ربح صافٍ مرتفع',`هامش ${r.netMargin.toFixed(1)}% يعكس كفاءة عالية في إدارة التكاليف.`);
  if (r.roe !== null && r.roe >= 15)
    addStr('💰','عائد ممتاز على الملكية',`العائد على الملكية ${r.roe.toFixed(1)}% يفوق المعدل المستهدف (15%)، ويعكس توظيفاً كفوءاً لرأس المال.`);
  if (r.debtEquity !== null && r.debtEquity < 1)
    addStr('⚖️','هيكل مالي محافظ',`نسبة الدين إلى الملكية ${r.debtEquity.toFixed(2)}× تشير إلى هيكل مالي مستقر ومنخفض المخاطر.`);
  if (r.arDays !== null && r.arDays < 60)
    addStr('📅','تحصيل سريع',`متوسط أيام التحصيل ${r.arDays.toFixed(0)} يوماً يعكس كفاءة في إدارة المديونيات.`);
  if (r.assetTurnover !== null && r.assetTurnover >= 1)
    addStr('⚙️','توظيف جيد للأصول',`معدل دوران الأصول ${r.assetTurnover.toFixed(2)}× يشير إلى كفاءة في توليد الإيراد.`);
  if (r.grossMargin !== null && r.grossMargin >= 20)
    addStr('📊','هامش إجمالي قوي',`هامش الربح الإجمالي ${r.grossMargin.toFixed(1)}% يعكس قوة تنافسية في التسعير.`);
  if (r.intCoverage !== null && r.intCoverage >= 3)
    addStr('🏦','تغطية فوائد مريحة',`تغطية الفوائد ${r.intCoverage.toFixed(1)}× تُظهر قدرة الشركة على تغطية أعباء التمويل بارتياح.`);

  const strEl = document.getElementById('notes-strengths');
  strEl.innerHTML = !strs.length
    ? `<div style="padding:14px;color:#5a7a9a;background:#0d1b2a;border-radius:8px;font-size:.85rem">ستظهر نقاط القوة عند بلوغ النسب المستويات الممتازة في الفترة المختارة.</div>`
    : strs.map(s => `
      <div style="margin-bottom:10px;padding:12px;border-radius:8px;background:#0d1b2a;border-right:3px solid #4ada8e">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span>${s.icon}</span>
          <span style="color:#4ada8e;font-weight:600;font-size:.82rem">${s.title}</span>
        </div>
        <div style="color:#9ab0c8;font-size:.80rem;line-height:1.6">${s.body}</div>
      </div>`).join('');

  // ── Executive summary narrative ──
  const urgentCnt  = recs.filter(x => x.priority === 1).length;
  const warningCnt = recs.filter(x => x.priority === 2).length;
  const execSummary = (() => {
    let s = `بناءً على البيانات المالية لـ <strong>${esc(companyName)}</strong> للفترة المنتهية في <strong>${esc(periodLabel)}</strong> (${nMonths} ${nMonths === 1 ? 'شهر' : 'أشهر'}): `;
    if (c.revenue > 0) {
      s += `حُقِّق إيراد تراكمي بلغ <strong>${fmt(c.revenue)} ر.س</strong> بتكلفة بضاعة <strong>${fmt(totalCost)} ر.س</strong> (هامش إجمالي ${r.grossMargin !== null ? r.grossMargin.toFixed(1) + '%' : '—'}). `;
      s += netProfitDisplay >= 0
        ? `بعد خصم المصروفات التشغيلية البالغة <strong>${fmt(totalOpex)} ر.س</strong>، يبلغ صافي الربح <strong>${fmt(netProfitDisplay)} ر.س</strong> (هامش صافٍ ${c.revenue > 0 ? (netProfitDisplay/c.revenue*100).toFixed(1) + '%' : '—'}). `
        : `غير أن المصروفات التشغيلية البالغة <strong>${fmt(totalOpex)} ر.س</strong> أفضت إلى صافي خسارة قدرها <strong>${fmt(Math.abs(netProfitDisplay))} ر.س</strong>. `;
    } else {
      s += 'لا توجد بيانات إيراد كافية لهذه الفترة. ';
    }
    s += `على صعيد المركز المالي، يبلغ إجمالي الأصول <strong>${fmt(r.totalA)} ر.س</strong> وحقوق الملكية <strong>${fmt(r.totalE)} ر.س</strong>. `;
    if (urgentCnt > 0)
      s += `<span style="color:#da4a4a;font-weight:600">يُرصد ${urgentCnt} ${urgentCnt === 1 ? 'بند حرج يستدعي' : 'بنود حرجة تستدعي'} تدخلاً عاجلاً.</span>`;
    else if (warningCnt > 0)
      s += `<span style="color:#da9a4a">يُرصد ${warningCnt} ${warningCnt === 1 ? 'بند يستدعي' : 'بنود تستدعي'} المتابعة.</span>`;
    else
      s += '<span style="color:#4ada8e">لا توجد مخاطر حرجة — الوضع المالي ضمن النطاق المقبول.</span>';
    return s;
  })();

  // ── Formal Supplementary Notes (إيضاحات) ──
  const bfPrevRow    = bfRows.filter(b => b.month < asOf).slice(-1)[0];
  const bfPrevBal    = bfPrevRow ? Math.abs(bfPrevRow.balance) : 0;
  const bfChg        = bfBalance - bfPrevBal;

  const netMarginDisplay = c.revenue > 0 ? netProfitDisplay / c.revenue * 100 : null;

  const notes = [
    {
      num:'1', title:'أساس الإعداد',
      body:`أُعدّت هذه القوائم المالية وفقاً للمعايير المحاسبية للمنشآت الصغيرة والمتوسطة الصادرة عن الهيئة السعودية للمحاسبين القانونيين (SOCPA)، وعلى أساس الاستحقاق المحاسبي. تُعبّر القوائم عن المركز المالي والأداء التشغيلي لـ <strong>${esc(companyName)}</strong> للفترة المنتهية في <strong>${esc(periodLabel)}</strong> (${nMonths} ${nMonths === 1 ? 'شهر' : 'أشهر'}).`
    },
    {
      num:'2', title:'السياسات المحاسبية الجوهرية',
      body:`<ul style="margin:0;padding-right:18px;line-height:2.1">
        <li><strong>الإيراد:</strong> يُثبَّت عند نقل السيطرة على السلعة أو الخدمة إلى العميل.</li>
        <li><strong>المخزون:</strong> يُقيَّم بالتكلفة أو صافي القيمة القابلة للتحقق أيهما أقل، وفق طريقة المتوسط المرجح.</li>
        <li><strong>الأصول الثابتة:</strong> تُستهلك بالطريقة الثابتة على مدى عمرها الإنتاجي المقدر.</li>
        <li><strong>ضريبة القيمة المضافة:</strong> تُطبَّق بالمعدل القياسي 15% وفق نظام ضريبة القيمة المضافة السعودي.</li>
        <li><strong>العملة الوظيفية:</strong> الريال السعودي (ر.س). المعاملات بالعملات الأجنبية تُحوَّل بسعر الصرف السائد.</li>
      </ul>`
    },
    {
      num:'3', title:'الأصول المتداولة',
      body:`يبلغ إجمالي الأصول المتداولة <strong>${fmt(r.currA)} ر.س</strong> في نهاية الفترة:
      <table style="width:100%;margin:8px 0;border-collapse:collapse;font-size:.82rem">
        <tr style="border-bottom:1px solid #1e3a5f">
          <td style="padding:6px 4px;color:#a0c4e8">النقد وما في حكمه</td>
          <td class="num" style="padding:6px 4px">${fmt(r.cash)} ر.س</td>
          <td class="num" style="padding:6px 4px;color:#7090b0">${r.currA > 0 ? (r.cash/r.currA*100).toFixed(1) + '% من المتداولة' : '—'}</td>
          <td style="padding:6px 4px"><div style="height:5px;border-radius:3px;background:#0d1b2a"><div style="height:100%;border-radius:3px;width:${r.currA>0?Math.min(100,r.cash/r.currA*100).toFixed(1):0}%;background:#4ada8e"></div></div></td>
        </tr>
        <tr style="border-bottom:1px solid #1e3a5f">
          <td style="padding:6px 4px;color:#a0c4e8">المدينون التجاريون</td>
          <td class="num" style="padding:6px 4px">${fmt(r.ar)} ر.س</td>
          <td class="num" style="padding:6px 4px;color:${r.arDays!==null&&r.arDays>90?'#da9a4a':'#7090b0'}">تحصيل ${r.arDays !== null ? r.arDays.toFixed(0) + ' يوم' : '—'}</td>
          <td style="padding:6px 4px"><div style="height:5px;border-radius:3px;background:#0d1b2a"><div style="height:100%;border-radius:3px;width:${r.currA>0?Math.min(100,r.ar/r.currA*100).toFixed(1):0}%;background:#5baef0"></div></div></td>
        </tr>
        <tr>
          <td style="padding:6px 4px;color:#a0c4e8">المخزون</td>
          <td class="num" style="padding:6px 4px">${fmt(r.inventory)} ر.س</td>
          <td class="num" style="padding:6px 4px;color:${r.invDays!==null&&r.invDays>90?'#da9a4a':'#7090b0'}">دوران ${r.invDays !== null ? r.invDays.toFixed(0) + ' يوم' : '—'}</td>
          <td style="padding:6px 4px"><div style="height:5px;border-radius:3px;background:#0d1b2a"><div style="height:100%;border-radius:3px;width:${r.currA>0?Math.min(100,r.inventory/r.currA*100).toFixed(1):0}%;background:#da9a4a"></div></div></td>
        </tr>
      </table>
      ${r.arDays !== null && r.arDays > 90 ? `<em style="color:#da9a4a;font-size:.78rem">⚠ ارتفاع أيام التحصيل — يُنصح بمراجعة مديونيات العملاء.</em>` : ''}`
    },
    {
      num:'4', title:'الالتزامات والتسهيلات البنكية',
      body:`إجمالي الالتزامات <strong>${fmt(r.totalL)} ر.س</strong> مقابل حقوق ملكية <strong>${fmt(r.totalE)} ر.س</strong>:
      <table style="width:100%;margin:8px 0;border-collapse:collapse;font-size:.82rem">
        <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">الالتزامات المتداولة</td><td class="num" style="padding:6px 4px">${fmt(r.currL)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${r.totalL>0?(r.currL/r.totalL*100).toFixed(1)+'% من الالتزامات':''}</td></tr>
        <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">التسهيلات الائتمانية البنكية (ح. 2010202)</td><td class="num" style="padding:6px 4px">${fmt(bfBalance)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${r.totalL>0?(bfBalance/r.totalL*100).toFixed(1)+'% من الالتزامات':''}</td></tr>
        <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">الالتزامات طويلة الأجل (الأخرى)</td><td class="num" style="padding:6px 4px">${fmt(Math.max(0, r.totalL - r.currL - bfBalance))} ر.س</td><td></td></tr>
        <tr><td style="padding:6px 4px;color:#a0c4e8;font-weight:600">حقوق الملكية</td><td class="num" style="padding:6px 4px;font-weight:600;color:${r.totalE>=0?'#4ada8e':'#da4a4a'}">${fmt(r.totalE)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">نسبة الدين ${r.debtEquity!==null?r.debtEquity.toFixed(2)+'×':'—'}</td></tr>
      </table>
      تُصنَّف التسهيلات البنكية ضمن <strong>أنشطة التمويل</strong> وفق المعايير السعودية للمنشآت الصغيرة والمتوسطة.
      ${bfChg !== 0 ? `<br><em style="font-size:.78rem;color:#7090b0">تغيّر التسهيلات خلال الفترة: ${bfChg>0?'+':''}${fmt(bfChg)} ر.س (${bfChg>0?'استخدام إضافي':'سداد جزئي'}).</em>` : ''}`
    },
    {
      num:'5', title:'نتائج الأعمال — قائمة الدخل',
      body: (() => {
        const grossPct  = c.revenue > 0 ? (c.grossProfit / c.revenue * 100).toFixed(1) : '—';
        const netPct    = c.revenue > 0 ? (netProfitDisplay / c.revenue * 100).toFixed(1) : '—';
        const opexPct   = c.revenue > 0 ? (totalOpex / c.revenue * 100).toFixed(1) : '—';
        return `للفترة المنتهية في <strong>${esc(periodLabel)}</strong>:
        <table style="width:100%;margin:8px 0;border-collapse:collapse;font-size:.82rem">
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">الإيراد</td><td class="num" style="padding:6px 4px">${fmt(c.revenue)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">100%</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">تكلفة البضاعة المباعة</td><td class="num" style="padding:6px 4px">(${fmt(totalCost)}) ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${c.revenue>0?(totalCost/c.revenue*100).toFixed(1)+'%':''}</td></tr>
          <tr style="border-bottom:2px solid #2a4a6f"><td style="padding:6px 4px;color:#c8e0f8;font-weight:600">مجمل الربح</td><td class="num" style="padding:6px 4px;color:${c.grossProfit>=0?'#4ada8e':'#da4a4a'};font-weight:600">${fmt(c.grossProfit)} ر.س</td><td class="num" style="padding:6px 4px;color:${c.grossProfit>=0?'#4ada8e':'#da4a4a'}">${grossPct}%</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">إجمالي المصروفات التشغيلية</td><td class="num" style="padding:6px 4px">(${fmt(totalOpex)}) ر.س</td><td class="num" style="padding:6px 4px;color:${+opexPct>25?'#da9a4a':'#7090b0'}">${opexPct}%</td></tr>
          <tr style="border-top:2px solid #3a7abf"><td style="padding:6px 4px;color:#e0f0ff;font-weight:700">صافي الربح / الخسارة</td><td class="num" style="padding:6px 4px;font-weight:700;color:${netProfitDisplay>=0?'#4ada8e':'#da4a4a'}">${fmt(netProfitDisplay)} ر.س</td><td class="num" style="padding:6px 4px;font-weight:600;color:${netProfitDisplay>=0?'#4ada8e':'#da4a4a'}">${netPct}%</td></tr>
        </table>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:.77rem;color:#7090b0">
          <span>هامش إجمالي: <strong style="color:#c8e0f8">${grossPct}%</strong></span>
          <span>هامش صافٍ: <strong style="color:${netProfitDisplay>=0?'#4ada8e':'#da4a4a'}">${netPct}%</strong></span>
          <span>عائد على الأصول: <strong style="color:#c8e0f8">${r.roa!==null?r.roa.toFixed(1)+'%':'—'}</strong></span>
          <span>عائد على الملكية: <strong style="color:#c8e0f8">${r.roe!==null?r.roe.toFixed(1)+'%':'—'}</strong></span>
          <span>متوسط شهري: <strong style="color:#c8e0f8">${fmt(netProfitDisplay/nMonths)} ر.س</strong></span>
        </div>`;
      })()
    },
    {
      num:'6', title:'هيكل المصروفات التشغيلية',
      body: opexItemsArr.length === 0
        ? '<div style="color:#5a7a9a">لا توجد مصروفات مسجلة لهذه الفترة.</div>'
        : (() => {
            const tot = totalOpex || 1;
            const barColor = pct => pct > 40 ? '#da4a4a' : pct > 20 ? '#da9a4a' : '#4a9eda';
            return opexItemsArr.map(x => {
              const pct = x.val / tot * 100;
              const revPct = c.revenue > 0 ? x.val / c.revenue * 100 : 0;
              return `<div style="margin-bottom:11px">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                  <span style="color:#c0d0e0;font-size:.82rem">${x.lbl}</span>
                  <span style="color:${barColor(pct)};font-size:.82rem;font-weight:600">${fmt(x.val)} ر.س
                    <span style="color:#7090b0;font-weight:400;font-size:.77rem">(${pct.toFixed(1)}%${c.revenue>0?' · '+revPct.toFixed(1)+'% إيراد':''})</span>
                  </span>
                </div>
                <div style="height:7px;border-radius:4px;background:#0d1b2a">
                  <div style="height:100%;border-radius:4px;width:${Math.min(100,pct).toFixed(1)}%;background:${barColor(pct)}99;transition:width .4s"></div>
                </div>
              </div>`;
            }).join('') +
            `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #1e3a5f;display:flex;justify-content:space-between;font-size:.83rem">
               <span style="color:#e0f0ff;font-weight:600">الإجمالي</span>
               <span style="color:#e0f0ff;font-weight:700">${fmt(tot)} ر.س${c.revenue>0?' <span style="color:#7090b0;font-weight:400;font-size:.77rem">('+(tot/c.revenue*100).toFixed(1)+'% من الإيراد)</span>':''}</span>
             </div>`;
          })()
    },
    {
      num:'7', title:'ملاحظات حول التدفق النقدي والسيولة',
      body: (() => {
        const cashPct   = r.currA > 0 ? (r.cash / r.currA * 100).toFixed(1) : '—';
        const bfAssetPct = r.totalA > 0 ? (bfBalance / r.totalA * 100).toFixed(1) : '—';
        let txt = `<table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:10px">
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">رصيد النقد</td><td class="num" style="padding:6px 4px">${fmt(r.cash)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${cashPct}% من المتداولة</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">النسبة الجارية</td><td class="num" style="padding:6px 4px;color:${r.currentRatio!==null&&r.currentRatio>=1.5?'#4ada8e':r.currentRatio!==null&&r.currentRatio>=1?'#da9a4a':'#da4a4a'}">${r.currentRatio !== null ? r.currentRatio.toFixed(2) + '×' : '—'}</td><td class="num" style="padding:6px 4px;color:#7090b0">المستهدف > 1.5×</td></tr>
          <tr style="border-bottom:1px solid #1e3a5f"><td style="padding:6px 4px;color:#a0c4e8">نسبة النقدية</td><td class="num" style="padding:6px 4px;color:${r.cashRatio!==null&&r.cashRatio>=0.5?'#4ada8e':r.cashRatio!==null&&r.cashRatio>=0.2?'#da9a4a':'#da4a4a'}">${r.cashRatio !== null ? r.cashRatio.toFixed(2) + '×' : '—'}</td><td class="num" style="padding:6px 4px;color:#7090b0">المستهدف > 0.5×</td></tr>
          ${bfBalance > 0 ? `<tr><td style="padding:6px 4px;color:#a0c4e8">التسهيلات البنكية</td><td class="num" style="padding:6px 4px">${fmt(bfBalance)} ر.س</td><td class="num" style="padding:6px 4px;color:#7090b0">${bfAssetPct}% من الأصول</td></tr>` : ''}
        </table>`;
        if (bfBalance > 0) {
          txt += `التسهيلات البنكية (${fmt(bfBalance)} ر.س) مُصنَّفة ضمن <strong>أنشطة التمويل</strong>. `;
          if (bfChg !== 0) txt += `خلال الفترة ${bfChg > 0 ? 'استُخدمت تسهيلات إضافية' : 'سُدِّد جزء من التسهيلات'} بمقدار ${fmt(Math.abs(bfChg))} ر.س. `;
        } else {
          txt += 'لا توجد تسهيلات بنكية مسجّلة في هذه الفترة. ';
        }
        txt += netProfitDisplay > 0 ? `التدفق النقدي التشغيلي المقدّر إيجابي — الشركة تولّد نقداً من عملياتها.` : `صافي الربح سالب يُشير إلى ضغط محتمل على التدفق النقدي التشغيلي.`;
        return txt;
      })()
    },
    {
      num:'8', title:'الأداء الشهري التفصيلي',
      body: (() => {
        if (moToDate.length === 0) return '<div style="color:#5a7a9a">لا توجد بيانات شهرية.</div>';
        const rows = moToDate.map(mo => {
          const plMo   = (pl || []).find(p => p.month === mo.month && (!plFrom || p.month >= plFrom));
          const rev    = plMo ? (plMo.revenue || 0) : 0;
          const cogs   = plMo ? ((plMo.cogs || 0) + (plMo.otherCost || 0)) : 0;
          const gross  = rev - cogs;
          const opex   = (mo.sal||0)+(mo.rent||0)+(mo.maint||0)+(mo.sell||0)+(mo.dist||0)+(mo.adm||0)+(mo.fin||0)+(mo.char||0)+(mo.oth||0);
          const net    = gross - opex;
          const margin = rev > 0 ? (net / rev * 100) : null;
          const col    = net >= 0 ? '#4ada8e' : '#da4a4a';
          return { label: mo.label || mo.month, rev, gross, opex, net, margin, col };
        });
        const totRev   = rows.reduce((s, x) => s + x.rev,   0);
        const totGross = rows.reduce((s, x) => s + x.gross, 0);
        const totOpex  = rows.reduce((s, x) => s + x.opex,  0);
        const totNet   = rows.reduce((s, x) => s + x.net,   0);
        const totMargin = totRev > 0 ? (totNet / totRev * 100) : null;
        return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.81rem;white-space:nowrap">
          <thead><tr style="background:#0a1e30">
            <th style="padding:7px 6px;text-align:right;color:#7090b0;font-weight:500">الشهر</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">الإيراد</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">مجمل الربح</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">المصروفات</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">صافي الربح</th>
            <th class="num" style="padding:7px 6px;color:#7090b0;font-weight:500">الهامش</th>
          </tr></thead>
          <tbody>
          ${rows.map(x => `<tr style="border-bottom:1px solid #0e2540">
            <td style="padding:6px 6px;color:#c0d0e0">${x.label}</td>
            <td class="num" style="padding:6px 6px">${x.rev > 0 ? fmt(x.rev) : '—'}</td>
            <td class="num" style="padding:6px 6px;color:${x.gross>=0?'#a0c8a0':'#da4a4a'}">${x.rev>0?fmt(x.gross):'—'}</td>
            <td class="num" style="padding:6px 6px;color:#c0a060">${x.opex > 0 ? fmt(x.opex) : '—'}</td>
            <td class="num" style="padding:6px 6px;color:${x.col};font-weight:600">${x.rev>0?fmt(x.net):'—'}</td>
            <td class="num" style="padding:6px 6px;color:${x.col}">${x.margin!==null?x.margin.toFixed(1)+'%':'—'}</td>
          </tr>`).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid #3a7abf;background:#0a1e30">
            <td style="padding:7px 6px;color:#e0f0ff;font-weight:600">الإجمالي</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:#e0f0ff">${fmt(totRev)}</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:${totGross>=0?'#4ada8e':'#da4a4a'}">${fmt(totGross)}</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:#c0a060">${fmt(totOpex)}</td>
            <td class="num" style="padding:7px 6px;font-weight:700;color:${totNet>=0?'#4ada8e':'#da4a4a'}">${fmt(totNet)}</td>
            <td class="num" style="padding:7px 6px;font-weight:600;color:${totNet>=0?'#4ada8e':'#da4a4a'}">${totMargin!==null?totMargin.toFixed(1)+'%':'—'}</td>
          </tr></tfoot>
        </table></div>`;
      })()
    }
  ];

  const noteHtml = n => `
    <div style="margin-bottom:18px;padding:16px;background:#0d1b2a;border-radius:8px;border:1px solid #1e3a5f">
      <div style="color:#5baef0;font-weight:700;font-size:.88rem;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #1e3a5f">
        إيضاح رقم ${n.num}: ${n.title}
      </div>
      <div style="color:#b0c8e0;font-size:.83rem;line-height:1.9">${n.body}</div>
    </div>`;

  const execHtml = `
    <div style="margin-bottom:20px;padding:16px;background:linear-gradient(135deg,#0a2540,#0d1b2a);border-radius:8px;border:1px solid #2a5080">
      <div style="color:#a0c4e8;font-weight:700;font-size:.88rem;margin-bottom:8px">الملخص التنفيذي</div>
      <div style="color:#b8cce0;font-size:.84rem;line-height:2">${execSummary}</div>
    </div>`;

  document.getElementById('notes-body').innerHTML = execHtml + notes.map(noteHtml).join('');
  _notesStartCountdown(asOf, netProfitDisplay);
}

// ── NOTES export helpers ───────────────────────────────────────────────────────

function _buildNotesData(bs, pl, monthly, asOf, plFrom, plMode) {
  const r = computeRatios(bs, pl, asOf, plFrom);
  if (!r) return null;
  const plToDate   = (pl || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const moToDate   = (monthly || []).filter(m => m.month <= asOf && (!plFrom || m.month >= plFrom));
  const c          = aggregatePL(plToDate);
  const nMonths    = Math.max(plToDate.length, 1);
  const totalCost  = c.cogs + (c.otherCost || 0);
  const mSal   = moToDate.reduce((s, m) => s + (m.sal  ||0), 0);
  const mRent  = moToDate.reduce((s, m) => s + (m.rent ||0), 0);
  const mMaint = moToDate.reduce((s, m) => s + (m.maint||0), 0);
  const mSell  = moToDate.reduce((s, m) => s + (m.sell ||0), 0);
  const mDist  = moToDate.reduce((s, m) => s + (m.dist ||0), 0);
  const mAdm   = moToDate.reduce((s, m) => s + (m.adm  ||0), 0);
  const mFin   = moToDate.reduce((s, m) => s + (m.fin  ||0), 0);
  const mChar  = moToDate.reduce((s, m) => s + (m.char ||0), 0);
  const mOth   = moToDate.reduce((s, m) => s + (m.oth  ||0), 0);
  const totalOpex  = mSal + mRent + mMaint + mSell + mDist + mAdm + mFin + mChar + mOth;
  const netProfit  = c.grossProfit - totalOpex;
  const opexItems  = [
    { lbl:'الرواتب والأجور',    val: mSal   },
    { lbl:'الإيجار',            val: mRent  },
    { lbl:'الصيانة والتشغيل',  val: mMaint },
    { lbl:'المصروفات البيعية',  val: mSell  },
    { lbl:'التوزيع والنقل',     val: mDist  },
    { lbl:'المصروفات الإدارية',val: mAdm   },
    { lbl:'التكاليف المالية',   val: mFin   },
    { lbl:'المصروفات الخيرية', val: mChar  },
    { lbl:'مصروفات أخرى',      val: mOth   },
  ].filter(x => x.val > 0).sort((a, b) => b.val - a.val);
  const monthRows  = moToDate.map(mo => {
    const plMo  = (pl || []).find(p => p.month === mo.month && (!plFrom || p.month >= plFrom));
    const rev   = plMo ? (plMo.revenue || 0) : 0;
    const cogs  = plMo ? ((plMo.cogs || 0) + (plMo.otherCost || 0)) : 0;
    const gross = rev - cogs;
    const opex  = (mo.sal||0)+(mo.rent||0)+(mo.maint||0)+(mo.sell||0)+(mo.dist||0)+(mo.adm||0)+(mo.fin||0)+(mo.char||0)+(mo.oth||0);
    const net   = gross - opex;
    const margin = rev > 0 ? (net / rev * 100) : null;
    return { label: mo.label || mo.month, rev, cogs, gross, opex, net, margin };
  });
  const modeLabel = { ytd:'من بداية السنة الجارية', cumul:'تراكمي من بداية البيانات', quarter:'الربع الحالي', month:'الشهر فقط' }[plMode] || plMode;
  return { r, c, nMonths, totalCost, totalOpex, netProfit, opexItems, monthRows, modeLabel };
}

function buildNotesHTMLReport(bs, pl, monthly, asOf, plFrom, plMode) {
  const d = _buildNotesData(bs, pl, monthly, asOf, plFrom, plMode);
  if (!d) return '<html><body>لا توجد بيانات</body></html>';
  const { r, c, nMonths, totalCost, totalOpex, netProfit, opexItems, monthRows, modeLabel } = d;
  const companyName = State.get('companyName') || 'الشركة';
  const periodLabel = r.label || asOf;
  const genDate     = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const fN  = v => Math.round(Math.abs(v)).toLocaleString('ar-SA');
  const fSg = v => v < 0 ? `(${fN(v)})` : fN(v);
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const bfRows   = State.get('bankFacilities') || [];
  const bfRow    = bfRows.filter(b => b.month <= asOf).slice(-1)[0];
  const bfBalance = bfRow ? Math.abs(bfRow.balance) : 0;

  // Recs (plain text)
  const recs = [];
  const addRec = (pri, icon, title, body) => recs.push({ pri, icon, title, body });
  if (r.currentRatio !== null && r.currentRatio < 1)
    addRec(1,'🚨','ضعف السيولة الحرجة',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستوى الأمن.`);
  else if (r.currentRatio !== null && r.currentRatio < 1.5)
    addRec(2,'⚠️','السيولة بحاجة إلى تحسين',`النسبة الجارية ${r.currentRatio.toFixed(2)}× دون المستهدف (1.5×).`);
  if (r.quickRatio !== null && r.quickRatio < 0.7)
    addRec(1,'🚨','نسبة سريعة حرجة',`النسبة السريعة ${r.quickRatio.toFixed(2)}× اعتماد مفرط على المخزون.`);
  if (r.netMargin !== null && r.netMargin < 0)
    addRec(1,'📉','الشركة تعمل بخسارة',`صافي الربح سالب (${r.netMargin.toFixed(1)}%).`);
  else if (r.netMargin !== null && r.netMargin < 3)
    addRec(2,'⚠️','هامش الربح الصافي منخفض',`هامش ${r.netMargin.toFixed(1)}% أقل من الحد الأدنى (3%).`);
  if (r.grossMargin !== null && r.grossMargin < 10)
    addRec(2,'⚠️','هامش الربح الإجمالي ضعيف',`هامش ${r.grossMargin.toFixed(1)}%.`);
  if (r.roe !== null && r.roe < 8)
    addRec(r.roe < 0 ? 1 : 2,'💰','العائد على الملكية ضعيف',`العائد ${r.roe.toFixed(1)}%.`);
  if (r.debtEquity !== null && r.debtEquity > 2)
    addRec(2,'⚖️','ارتفاع الرفع المالي',`نسبة الدين / الملكية ${r.debtEquity.toFixed(2)}×.`);
  if (r.intCoverage !== null && r.intCoverage < 1.5)
    addRec(1,'🏦','ضعف تغطية الفوائد',`تغطية الفوائد ${r.intCoverage.toFixed(1)}×.`);
  if (r.arDays !== null && r.arDays > 90)
    addRec(2,'📅','بطء تحصيل المديونيات',`متوسط أيام التحصيل ${r.arDays.toFixed(0)}.`);
  if (r.invDays !== null && r.invDays > 90)
    addRec(2,'📦','بطء دوران المخزون',`متوسط أيام الدوران ${r.invDays.toFixed(0)}.`);
  recs.sort((a, b) => a.pri - b.pri);

  // Strengths
  const strs = [];
  if (r.currentRatio !== null && r.currentRatio >= 1.5) strs.push({ icon:'💧', title:'سيولة جيدة', body:`النسبة الجارية ${r.currentRatio.toFixed(2)}×.` });
  if (r.netMargin !== null && r.netMargin >= 8)          strs.push({ icon:'📈', title:'هامش ربح مرتفع', body:`هامش ${r.netMargin.toFixed(1)}%.` });
  if (r.roe !== null && r.roe >= 15)                     strs.push({ icon:'💰', title:'عائد ممتاز على الملكية', body:`${r.roe.toFixed(1)}%.` });
  if (r.debtEquity !== null && r.debtEquity < 1)         strs.push({ icon:'⚖️', title:'هيكل مالي محافظ', body:`نسبة الدين ${r.debtEquity.toFixed(2)}×.` });
  if (r.arDays !== null && r.arDays < 60)                strs.push({ icon:'📅', title:'تحصيل سريع', body:`${r.arDays.toFixed(0)} يوم.` });
  if (r.grossMargin !== null && r.grossMargin >= 20)     strs.push({ icon:'📊', title:'هامش إجمالي قوي', body:`${r.grossMargin.toFixed(1)}%.` });

  const priColor = { 1:'#c0392b', 2:'#d68910', 3:'#1a5276' };
  const priLabel = { 1:'عاجل', 2:'متابعة', 3:'ملاحظة' };
  const grossPct = c.revenue > 0 ? (c.grossProfit / c.revenue * 100).toFixed(1) : '—';
  const netPct   = c.revenue > 0 ? (netProfit / c.revenue * 100).toFixed(1) : '—';

  // monthly totals
  const totRev   = monthRows.reduce((s,x) => s + x.rev,   0);
  const totCogs  = monthRows.reduce((s,x) => s + x.cogs,  0);
  const totGross = monthRows.reduce((s,x) => s + x.gross, 0);
  const totOpex2 = monthRows.reduce((s,x) => s + x.opex,  0);
  const totNet   = monthRows.reduce((s,x) => s + x.net,   0);
  const totMrg   = totRev > 0 ? (totNet / totRev * 100).toFixed(1) : '—';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>الإيضاحات المالية — ${esc(companyName)} — ${esc(asOf)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:10pt;color:#1a1a2e;background:#fff;direction:rtl;padding:20px}
  h1{font-size:16pt;color:#0a2040;margin-bottom:4px}
  h2{font-size:11pt;color:#1a3a6a;margin:18px 0 8px;border-bottom:2px solid #1a3a6a;padding-bottom:4px}
  h3{font-size:10pt;color:#1a3a6a;margin:12px 0 6px}
  .cover{text-align:center;padding:24px;background:#0a2040;color:#fff;border-radius:8px;margin-bottom:24px}
  .cover h1{color:#fff;font-size:18pt}
  .cover .sub{color:#a0c4e8;font-size:10pt;margin-top:6px}
  .kpi-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
  .kpi{flex:1;min-width:130px;padding:12px;border:1px solid #c8d8e8;border-radius:6px;text-align:center}
  .kpi .lbl{font-size:8.5pt;color:#4a6a8a;margin-bottom:4px}
  .kpi .val{font-size:11pt;font-weight:700;color:#0a2040}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9pt}
  th{background:#1a3a6a;color:#fff;padding:7px 8px;text-align:right;font-weight:600}
  td{padding:6px 8px;border-bottom:1px solid #e0e8f0}
  tr:nth-child(even) td{background:#f4f7fb}
  .num{text-align:left;font-variant-numeric:tabular-nums}
  .subtotal td{background:#e8f0f8;font-weight:600}
  .total td{background:#1a3a6a;color:#fff;font-weight:700}
  .rec{padding:10px 12px;border-radius:6px;margin-bottom:8px;border-right:3px solid #c0392b}
  .rec.p1{border-color:#c0392b;background:#fdf2f2}
  .rec.p2{border-color:#d68910;background:#fdf8e8}
  .rec.p3{border-color:#1a5276;background:#eaf4fb}
  .rec .title{font-weight:700;font-size:9.5pt;margin-bottom:3px}
  .rec .body{font-size:8.5pt;color:#444;line-height:1.6}
  .rec .badge{font-size:7.5pt;padding:1px 6px;border-radius:8px;float:left;margin-top:1px}
  .str{padding:8px 12px;border-radius:6px;margin-bottom:6px;background:#f0fff4;border-right:3px solid #27ae60}
  .str .title{font-weight:700;color:#1a6a2a;font-size:9pt}
  .str .body{font-size:8.5pt;color:#2d6a3a;line-height:1.5}
  .note-block{margin-bottom:16px;padding:14px;border:1px solid #c8d8e8;border-radius:6px}
  .note-hdr{font-size:10pt;font-weight:700;color:#1a3a6a;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #c8d8e8}
  .exec-box{padding:14px;background:#eef4fb;border:1px solid #a0c0e0;border-radius:6px;margin-bottom:16px;font-size:9.5pt;line-height:1.8;color:#1a2a3a}
  .bar-wrap{height:6px;background:#e0e8f0;border-radius:3px;margin-top:3px}
  .bar{height:100%;border-radius:3px}
  .footer{margin-top:24px;padding-top:8px;border-top:1px solid #c8d8e8;font-size:8pt;color:#6a8aaa;text-align:center}
  @media print{body{padding:10px}.cover{page-break-after:always}}
</style>
</head>
<body>
<div class="cover">
  <h1>${esc(companyName)}</h1>
  <div class="sub">الإيضاحات المتممة للقوائم المالية</div>
  <div class="sub">الفترة: ${esc(modeLabel)} — حتى ${esc(periodLabel)} (${nMonths} ${nMonths===1?'شهر':'أشهر'})</div>
  <div class="sub">تاريخ الإعداد: ${genDate}</div>
</div>

<h2>المؤشرات الرئيسية</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="lbl">الفترة</div><div class="val">${nMonths} ${nMonths===1?'شهر':'أشهر'}</div></div>
  <div class="kpi"><div class="lbl">إيراد الفترة</div><div class="val">${fN(c.revenue)} ر.س</div></div>
  <div class="kpi"><div class="lbl">صافي الربح / الخسارة</div><div class="val" style="color:${netProfit>=0?'#1a6a2a':'#c0392b'}">${fSg(netProfit)} ر.س</div></div>
  <div class="kpi"><div class="lbl">هامش الربح الصافي</div><div class="val" style="color:${r.netMargin!==null&&r.netMargin>=5?'#1a6a2a':r.netMargin!==null&&r.netMargin>=2?'#d68910':'#c0392b'}">${r.netMargin !== null ? r.netMargin.toFixed(1)+'%' : '—'}</div></div>
  <div class="kpi"><div class="lbl">إجمالي الأصول</div><div class="val">${fN(r.totalA)} ر.س</div></div>
  <div class="kpi"><div class="lbl">حقوق الملكية</div><div class="val" style="color:${r.totalE>=0?'#1a6a2a':'#c0392b'}">${fSg(r.totalE)} ر.س</div></div>
</div>

<div class="exec-box"><strong>الملخص التنفيذي:</strong> بناءً على البيانات المالية لـ ${esc(companyName)} للفترة المنتهية في ${esc(periodLabel)} (${nMonths} ${nMonths===1?'شهر':'أشهر'}): ${c.revenue > 0 ? `حُقِّق إيراد بلغ ${fN(c.revenue)} ر.س بتكلفة بضاعة ${fN(totalCost)} ر.س (هامش إجمالي ${grossPct}%). بعد خصم المصروفات التشغيلية ${fN(totalOpex)} ر.س: صافي ${netProfit >= 0 ? 'ربح' : 'خسارة'} ${fSg(netProfit)} ر.س (هامش ${netPct}%).` : 'لا توجد بيانات إيراد كافية.'} إجمالي الأصول ${fN(r.totalA)} ر.س وحقوق الملكية ${fSg(r.totalE)} ر.س. ${recs.filter(x=>x.pri===1).length > 0 ? `يُرصد ${recs.filter(x=>x.pri===1).length} بند حرج يستدعي تدخلاً عاجلاً.` : recs.filter(x=>x.pri===2).length > 0 ? `يُرصد ${recs.filter(x=>x.pri===2).length} بند يستدعي المتابعة.` : 'لا توجد مخاطر حرجة.'}</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px">
<div>
<h2>التوجيهات المالية ذات الأولوية</h2>
${recs.length === 0
  ? '<div class="rec p3"><div class="body">لا توجد توجيهات عاجلة — الوضع المالي ضمن النطاق المقبول.</div></div>'
  : recs.map(rec => `<div class="rec p${rec.pri}"><div class="title">${rec.icon} ${esc(rec.title)} <span class="badge" style="background:${priColor[rec.pri]}22;color:${priColor[rec.pri]}">${priLabel[rec.pri]}</span></div><div class="body">${esc(rec.body)}</div></div>`).join('')}
</div>
<div>
<h2>نقاط القوة المالية</h2>
${strs.length === 0
  ? '<div class="str"><div class="body">ستظهر نقاط القوة عند بلوغ النسب المستويات الممتازة.</div></div>'
  : strs.map(s => `<div class="str"><div class="title">${s.icon} ${esc(s.title)}</div><div class="body">${esc(s.body)}</div></div>`).join('')}
</div>
</div>

<h2>الإيضاحات المتممة للقوائم المالية</h2>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 1: أساس الإعداد</div>
أُعدّت هذه القوائم المالية وفقاً للمعايير المحاسبية للمنشآت الصغيرة والمتوسطة الصادرة عن SOCPA، وعلى أساس الاستحقاق المحاسبي. تُعبّر القوائم عن المركز المالي والأداء التشغيلي لـ ${esc(companyName)} للفترة المنتهية في ${esc(periodLabel)} (${nMonths} ${nMonths===1?'شهر':'أشهر'}) — فترة الاحتساب: ${esc(modeLabel)}.
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 2: السياسات المحاسبية الجوهرية</div>
<ul style="padding-right:18px;line-height:2">
  <li><strong>الإيراد:</strong> يُثبَّت عند نقل السيطرة على السلعة أو الخدمة إلى العميل.</li>
  <li><strong>المخزون:</strong> يُقيَّم بالتكلفة أو صافي القيمة القابلة للتحقق أيهما أقل.</li>
  <li><strong>الأصول الثابتة:</strong> تُستهلك بالطريقة الثابتة على مدى عمرها الإنتاجي المقدر.</li>
  <li><strong>ضريبة القيمة المضافة:</strong> تُطبَّق بالمعدل القياسي 15%.</li>
  <li><strong>العملة الوظيفية:</strong> الريال السعودي (ر.س).</li>
</ul>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 3: الأصول المتداولة</div>
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">النسبة</th></tr>
  <tr><td>النقد وما في حكمه</td><td class="num">${fN(r.cash)}</td><td class="num">${r.currA>0?(r.cash/r.currA*100).toFixed(1)+'%':'—'}</td></tr>
  <tr><td>المدينون التجاريون</td><td class="num">${fN(r.ar)}</td><td class="num">${r.arDays!==null?r.arDays.toFixed(0)+' يوم تحصيل':'—'}</td></tr>
  <tr><td>المخزون</td><td class="num">${fN(r.inventory)}</td><td class="num">${r.invDays!==null?r.invDays.toFixed(0)+' يوم دوران':'—'}</td></tr>
  <tr class="subtotal"><td>إجمالي الأصول المتداولة</td><td class="num">${fN(r.currA)}</td><td></td></tr>
</table>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 4: الالتزامات والتسهيلات البنكية</div>
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">ملاحظة</th></tr>
  <tr><td>الالتزامات المتداولة</td><td class="num">${fN(r.currL)}</td><td class="num">${r.totalL>0?(r.currL/r.totalL*100).toFixed(1)+'% من الالتزامات':''}</td></tr>
  <tr><td>التسهيلات الائتمانية البنكية</td><td class="num">${fN(bfBalance)}</td><td></td></tr>
  <tr class="subtotal"><td>إجمالي الالتزامات</td><td class="num">${fN(r.totalL)}</td><td class="num">نسبة الدين: ${r.debtEquity!==null?r.debtEquity.toFixed(2)+'×':'—'}</td></tr>
  <tr class="total"><td>حقوق الملكية</td><td class="num">${fSg(r.totalE)}</td><td></td></tr>
</table>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 5: نتائج الأعمال — قائمة الدخل</div>
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">%</th></tr>
  <tr><td>الإيراد</td><td class="num">${fN(c.revenue)}</td><td class="num">100%</td></tr>
  <tr><td>تكلفة البضاعة المباعة</td><td class="num">(${fN(totalCost)})</td><td class="num">${c.revenue>0?(totalCost/c.revenue*100).toFixed(1)+'%':''}</td></tr>
  <tr class="subtotal"><td>مجمل الربح</td><td class="num">${fSg(c.grossProfit)}</td><td class="num">${grossPct}%</td></tr>
  <tr><td>إجمالي المصروفات التشغيلية</td><td class="num">(${fN(totalOpex)})</td><td class="num">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':''}</td></tr>
  <tr class="total"><td>صافي الربح / الخسارة</td><td class="num">${fSg(netProfit)}</td><td class="num">${netPct}%</td></tr>
</table>
<div style="font-size:8.5pt;color:#4a6a8a;margin-top:8px">هامش إجمالي: ${grossPct}% | هامش صافٍ: ${netPct}% | عائد على الأصول: ${r.roa!==null?r.roa.toFixed(1)+'%':'—'} | عائد على الملكية: ${r.roe!==null?r.roe.toFixed(1)+'%':'—'}</div>
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 6: هيكل المصروفات التشغيلية</div>
${opexItems.length === 0 ? '<p>لا توجد مصروفات مسجلة.</p>' : `
<table>
  <tr><th>البند</th><th class="num">المبلغ (ر.س)</th><th class="num">% من المصروفات</th><th class="num">% من الإيراد</th></tr>
  ${opexItems.map(x => `<tr><td>${esc(x.lbl)}</td><td class="num">${fN(x.val)}</td><td class="num">${totalOpex>0?(x.val/totalOpex*100).toFixed(1)+'%':'—'}</td><td class="num">${c.revenue>0?(x.val/c.revenue*100).toFixed(1)+'%':'—'}</td></tr>`).join('')}
  <tr class="subtotal"><td>الإجمالي</td><td class="num">${fN(totalOpex)}</td><td class="num">100%</td><td class="num">${c.revenue>0?(totalOpex/c.revenue*100).toFixed(1)+'%':'—'}</td></tr>
</table>`}
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 7: ملاحظات حول التدفق النقدي والسيولة</div>
<table>
  <tr><th>المؤشر</th><th class="num">القيمة</th><th class="num">المستهدف</th></tr>
  <tr><td>رصيد النقد</td><td class="num">${fN(r.cash)} ر.س</td><td></td></tr>
  <tr><td>النسبة الجارية</td><td class="num">${r.currentRatio!==null?r.currentRatio.toFixed(2)+'×':'—'}</td><td class="num">&gt; 1.5×</td></tr>
  <tr><td>النسبة السريعة</td><td class="num">${r.quickRatio!==null?r.quickRatio.toFixed(2)+'×':'—'}</td><td class="num">&gt; 1×</td></tr>
  <tr><td>نسبة النقدية</td><td class="num">${r.cashRatio!==null?r.cashRatio.toFixed(2)+'×':'—'}</td><td class="num">&gt; 0.5×</td></tr>
  ${bfBalance>0?`<tr><td>التسهيلات البنكية</td><td class="num">${fN(bfBalance)} ر.س</td><td></td></tr>`:''}
</table>
${netProfit > 0 ? 'التدفق النقدي التشغيلي المقدّر إيجابي.' : 'صافي الربح سالب — ضغط محتمل على التدفق النقدي.'}
</div>

<div class="note-block">
<div class="note-hdr">إيضاح رقم 8: الأداء الشهري التفصيلي</div>
${monthRows.length === 0 ? '<p>لا توجد بيانات شهرية.</p>' : `
<table>
  <tr><th>الشهر</th><th class="num">الإيراد</th><th class="num">ت. البضاعة</th><th class="num">مجمل الربح</th><th class="num">المصروفات</th><th class="num">صافي الربح</th><th class="num">الهامش</th></tr>
  ${monthRows.map(x => `<tr><td>${esc(x.label)}</td><td class="num">${x.rev>0?fN(x.rev):'—'}</td><td class="num">${x.rev>0?fN(x.cogs):'—'}</td><td class="num">${x.rev>0?fSg(x.gross):'—'}</td><td class="num">${x.opex>0?fN(x.opex):'—'}</td><td class="num" style="color:${x.net>=0?'#1a6a2a':'#c0392b'}">${x.rev>0?fSg(x.net):'—'}</td><td class="num">${x.margin!==null?x.margin.toFixed(1)+'%':'—'}</td></tr>`).join('')}
  <tr class="subtotal"><td>الإجمالي</td><td class="num">${fN(totRev)}</td><td class="num">${fN(totCogs)}</td><td class="num">${fSg(totGross)}</td><td class="num">${fN(totOpex2)}</td><td class="num" style="color:${totNet>=0?'#1a6a2a':'#c0392b'}">${fSg(totNet)}</td><td class="num">${totMrg}%</td></tr>
</table>`}
</div>

<div class="footer">أُنشئ بواسطة MekSoft ERP Dashboard — ${genDate}</div>
</body>
</html>`;
}

function exportNotesHTML() {
  const bs      = State.get('bs');
  const pl      = State.get('pl');
  const monthly = State.get('monthly');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('notes-period-sel') || {}).value || '';
  const plMode = (document.getElementById('notes-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html   = buildNotesHTMLReport(bs, pl, monthly, asOf, plFrom, plMode);
  const blob   = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `الإيضاحات_المالية_${asOf}.html`; a.click();
  URL.revokeObjectURL(url);
}

function printNotesPDF() {
  const bs      = State.get('bs');
  const pl      = State.get('pl');
  const monthly = State.get('monthly');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  const asOf   = (document.getElementById('notes-period-sel') || {}).value || '';
  const plMode = (document.getElementById('notes-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const html   = buildNotesHTMLReport(bs, pl, monthly, asOf, plFrom, plMode);
  const w      = window.open('', '_blank', 'width=960,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

async function exportNotesExcel() {
  const bs      = State.get('bs');
  const pl      = State.get('pl');
  const monthly = State.get('monthly');
  if (!bs || !bs.length) { alert('لا توجد بيانات'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد'); return; }
  const asOf   = (document.getElementById('notes-period-sel') || {}).value || '';
  const plMode = (document.getElementById('notes-pl-mode')    || {}).value || 'ytd';
  const plFrom = getRatiosPlFrom(asOf, plMode);
  const nd     = _buildNotesData(bs, pl, monthly, asOf, plFrom, plMode);
  if (!nd) { alert('لا توجد بيانات للفترة المحددة'); return; }
  const { r, c, nMonths, totalCost, totalOpex, netProfit, opexItems, monthRows, modeLabel } = nd;
  const companyName = State.get('companyName') || 'الشركة';
  const periodLabel = r.label || asOf;
  const genDate     = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });

  const FONT = 'Calibri';
  const CLR  = { navyDark:'FF0A2040', navy:'FF1A3A6A', bluePale:'FFF4F7FB', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textLight:'FF6A8AAA',
    green:'FF1a6a2a', greenBg:'FFF4FFF8', greenText:'FF1A6A2A',
    red:'FFc0392b', redBg:'FFFFF0F0', amber:'FFd68910', amberBg:'FFFFFBE8' };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: المؤشرات المالية ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet('المؤشرات المالية', { views:[{ rightToLeft:true }] });
  ws1.pageSetup.paperSize = 9; ws1.pageSetup.orientation = 'portrait'; ws1.pageSetup.fitToPage = true;
  ws1.columns = [{ width:36 }, { width:22 }, { width:22 }, { width:28 }];

  const spanA = row => ws1.mergeCells(row.number, 1, row.number, 4);
  const addHA = (t, sz, fc, bg) => {
    const row = ws1.addRow([t]); row.height = sz > 12 ? 30 : 20; spanA(row);
    const cell = row.getCell(1); cell.font = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
    cell.fill = solid(bg); cell.alignment = { horizontal:'center', vertical:'middle' };
  };
  const addSA = (h=4) => { const row = ws1.addRow(['']); row.height = h; spanA(row); row.getCell(1).fill = solid(CLR.white); };

  addHA(`الإيضاحات المالية — ${companyName}`, 14, CLR.white, CLR.navyDark);
  addHA(`${modeLabel} — حتى ${periodLabel}`, 11, 'FFAACCE8', CLR.navyDark);
  addHA(`المبالغ بالريال السعودي — أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  addSA(4);

  // Section: المؤشرات الرئيسية
  const secHdr1 = ws1.addRow(['المؤشرات الرئيسية']); secHdr1.height = 18; spanA(secHdr1);
  secHdr1.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
  secHdr1.getCell(1).fill = solid(CLR.navy);
  secHdr1.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };

  const kpiHdr = ws1.addRow(['البند', 'القيمة', '', '']); kpiHdr.height = 16;
  ws1.mergeCells(kpiHdr.number, 3, kpiHdr.number, 4);
  kpiHdr.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9, bold:true, color:{ argb:CLR.textNavy } };
    cell.fill = solid(CLR.bluePale); cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('thin','FFCCDDEE') };
  });

  const kpiRows = [
    ['الفترة',             `${nMonths} ${nMonths===1?'شهر':'أشهر'} حتى ${periodLabel}`],
    ['الإيراد',            c.revenue],
    ['تكلفة البضاعة',     totalCost],
    ['مجمل الربح',         c.grossProfit],
    ['المصروفات التشغيلية',totalOpex],
    ['صافي الربح / الخسارة', netProfit],
  ];
  kpiRows.forEach(([lbl, val]) => {
    const isProfit = lbl.includes('صافي') || lbl.includes('مجمل');
    const row = ws1.addRow([lbl, typeof val === 'number' ? val : val, '', '']); row.height = 15;
    ws1.mergeCells(row.number, 3, row.number, 4);
    row.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:2 }; row.getCell(1).border = { bottom:bdr('hair','FFE8ECF0') };
    const c2 = row.getCell(2);
    if (typeof val === 'number') {
      c2.value = val; c2.numFmt = '#,##0;(#,##0)';
      const isLoss = isProfit && val < 0;
      c2.font = { name:FONT, size:9.5, bold:isProfit, color:{ argb: isProfit ? (val>=0?CLR.greenText:CLR.red) : CLR.textDark } };
    } else {
      c2.value = val; c2.font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } };
    }
    c2.alignment = { horizontal:'center', vertical:'middle' }; c2.border = { bottom:bdr('hair','FFE8ECF0') };
  });
  addSA(4);

  // Section: النسب المالية
  const secHdr2 = ws1.addRow(['النسب المالية']); secHdr2.height = 18; spanA(secHdr2);
  secHdr2.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
  secHdr2.getCell(1).fill = solid(CLR.navy);
  secHdr2.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };

  const ratioHdr = ws1.addRow(['النسبة', 'القيمة', 'التقييم', 'المعيار']); ratioHdr.height = 16;
  ratioHdr.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9, bold:true, color:{ argb:CLR.textNavy } };
    cell.fill = solid(CLR.bluePale); cell.alignment = { horizontal:ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('thin','FFCCDDEE') };
  });

  const ratioClr = (v, lo, hi, hb=true) => {
    if (v===null || !isFinite(v)) return { txt:CLR.textLight, bg:CLR.white };
    const g = hb ? (v>=hi) : (v<=lo), am = hb ? (v>=lo && v<hi) : (v>lo && v<=hi);
    return g ? { txt:CLR.greenText, bg:'FFF4FFF8' } : am ? { txt:'FF7A5A00', bg:'FFFFFBE8' } : { txt:'FF8A1A1A', bg:'FFFFF0F0' };
  };

  const groups1 = [...new Set(RATIO_DEFS.map(d => d.group))];
  groups1.forEach(g => {
    const gRow = ws1.addRow([g]); gRow.height = 16; spanA(gRow);
    gRow.getCell(1).font = { name:FONT, size:9, bold:true, color:{ argb:'FF4a8aaa' } };
    gRow.getCell(1).fill = solid('FF0a1e30'); gRow.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };
    RATIO_DEFS.filter(d => d.group === g).forEach(d => {
      const v   = r[d.key];
      const vc  = ratioClr(v, d.lo, d.hi, d.hb);
      const fmtd = (v===null || !isFinite(v)) ? '—' : v.toFixed(d.dec) + d.sfx;
      const rating = (v===null || !isFinite(v)) ? 'غير متاح' : (vc.txt===CLR.greenText ? 'ممتاز / جيد' : vc.txt==='FF7A5A00' ? 'متوسط' : 'ضعيف');
      const row2 = ws1.addRow([d.lbl, fmtd, rating, d.hint]); row2.height = 15;
      row2.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row2.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:2 }; row2.getCell(1).border = { bottom:bdr('hair','FFE8ECF0') };
      [2, 3].forEach(ci => { const cell = row2.getCell(ci); cell.font = { name:FONT, size:9.5, bold:true, color:{ argb:vc.txt } }; cell.fill = solid(vc.bg); cell.alignment = { horizontal:'center', vertical:'middle' }; cell.border = { bottom:bdr('hair','FFE8ECF0') }; });
      row2.getCell(4).font = { name:FONT, size:8.5, color:{ argb:CLR.textLight } }; row2.getCell(4).alignment = { horizontal:'right', vertical:'middle' }; row2.getCell(4).border = { bottom:bdr('hair','FFE8ECF0') };
    });
  });
  addSA(4);

  // Section: هيكل المصروفات
  const secHdr3 = ws1.addRow(['هيكل المصروفات التشغيلية']); secHdr3.height = 18; spanA(secHdr3);
  secHdr3.getCell(1).font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } };
  secHdr3.getCell(1).fill = solid(CLR.navy);
  secHdr3.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:1 };

  const opexHdr = ws1.addRow(['البند', 'المبلغ (ر.س)', '% من المصروفات', '% من الإيراد']); opexHdr.height = 16;
  opexHdr.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9, bold:true, color:{ argb:CLR.textNavy } };
    cell.fill = solid(CLR.bluePale); cell.alignment = { horizontal:ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('thin','FFCCDDEE') };
  });
  opexItems.forEach(x => {
    const opPct = totalOpex > 0 ? x.val / totalOpex : 0;
    const revPct = c.revenue > 0 ? x.val / c.revenue : 0;
    const row3 = ws1.addRow([x.lbl, x.val, opPct, revPct]); row3.height = 15;
    row3.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row3.getCell(1).alignment = { horizontal:'right', vertical:'middle', indent:2 }; row3.getCell(1).border = { bottom:bdr('hair','FFE8ECF0') };
    row3.getCell(2).numFmt = '#,##0'; row3.getCell(2).alignment = { horizontal:'center', vertical:'middle' }; row3.getCell(2).border = { bottom:bdr('hair','FFE8ECF0') };
    row3.getCell(3).numFmt = '0.0%'; row3.getCell(3).alignment = { horizontal:'center', vertical:'middle' }; row3.getCell(3).border = { bottom:bdr('hair','FFE8ECF0') };
    row3.getCell(4).numFmt = '0.0%'; row3.getCell(4).alignment = { horizontal:'center', vertical:'middle' }; row3.getCell(4).border = { bottom:bdr('hair','FFE8ECF0') };
  });
  // Totals row opex
  const opexTotRow = ws1.addRow(['الإجمالي', totalOpex, 1, c.revenue>0?totalOpex/c.revenue:0]); opexTotRow.height = 16;
  opexTotRow.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } }; cell.fill = solid(CLR.navy);
    cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    if (ci === 2) cell.numFmt = '#,##0';
    if (ci === 3) cell.numFmt = '0.0%';
    if (ci === 4) cell.numFmt = '0.0%';
  });

  // ── Sheet 2: الأداء الشهري ────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('الأداء الشهري', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize = 9; ws2.pageSetup.orientation = 'landscape'; ws2.pageSetup.fitToPage = true;
  ws2.columns = [{ width:18 }, { width:18 }, { width:18 }, { width:18 }, { width:22 }, { width:18 }, { width:14 }];

  const NC2  = 7;
  const span2 = row => ws2.mergeCells(row.number, 1, row.number, NC2);
  const addH2 = (t, sz, fc, bg) => {
    const row = ws2.addRow([t]); row.height = sz > 12 ? 30 : 20; span2(row);
    const cell = row.getCell(1); cell.font = { name:FONT, size:sz, bold:true, color:{ argb:fc } };
    cell.fill = solid(bg); cell.alignment = { horizontal:'center', vertical:'middle' };
  };

  addH2(`الأداء الشهري — ${companyName}`, 14, CLR.white, CLR.navyDark);
  addH2(`${modeLabel} — حتى ${periodLabel}`, 11, 'FFAACCE8', CLR.navyDark);
  addH2(`المبالغ بالريال السعودي — أُنشئ: ${genDate}`, 9, CLR.textLight, CLR.navyDark);
  { const row = ws2.addRow(['']); row.height = 4; span2(row); row.getCell(1).fill = solid(CLR.white); }

  const colHdr2 = ws2.addRow(['الشهر', 'الإيراد', 'تكلفة البضاعة', 'مجمل الربح', 'المصروفات التشغيلية', 'صافي الربح', 'الهامش']); colHdr2.height = 18;
  colHdr2.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:9.5, bold:true, color:{ argb:CLR.white } }; cell.fill = solid(CLR.navy);
    cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    cell.border = { bottom:bdr('medium','FF3a7abf') };
  });

  monthRows.forEach((x, idx) => {
    const row2 = ws2.addRow([x.label, x.rev||null, x.cogs||null, x.gross||null, x.opex||null, x.net||null, x.margin!==null?x.margin/100:null]); row2.height = 15;
    row2.getCell(1).font = { name:FONT, size:9.5, color:{ argb:CLR.textDark } }; row2.getCell(1).alignment = { horizontal:'right', vertical:'middle' }; row2.getCell(1).fill = solid(idx%2===0?CLR.white:CLR.bluePale);
    [2, 3, 4, 5].forEach(ci => { const cell = row2.getCell(ci); cell.numFmt = '#,##0'; cell.alignment = { horizontal:'center', vertical:'middle' }; cell.fill = solid(idx%2===0?CLR.white:CLR.bluePale); cell.border = { bottom:bdr('hair','FFE8ECF0') }; });
    const c6 = row2.getCell(6); c6.numFmt = '#,##0'; c6.alignment = { horizontal:'center', vertical:'middle' }; c6.font = { name:FONT, bold:true, color:{ argb:x.net>=0?CLR.greenText:CLR.red } }; c6.fill = solid(x.net>=0?CLR.greenBg:CLR.redBg); c6.border = { bottom:bdr('hair','FFE8ECF0') };
    const c7 = row2.getCell(7); c7.numFmt = '0.0%'; c7.alignment = { horizontal:'center', vertical:'middle' }; c7.font = { name:FONT, size:9, color:{ argb:x.net>=0?CLR.greenText:CLR.red } }; c7.border = { bottom:bdr('hair','FFE8ECF0') };
  });

  // Totals
  const totRev2  = monthRows.reduce((s,x) => s+x.rev, 0);
  const totCogs2 = monthRows.reduce((s,x) => s+x.cogs, 0);
  const totGrp2  = monthRows.reduce((s,x) => s+x.gross, 0);
  const totOp2   = monthRows.reduce((s,x) => s+x.opex, 0);
  const totNet2  = monthRows.reduce((s,x) => s+x.net, 0);
  const totMrg2  = totRev2 > 0 ? totNet2/totRev2 : null;
  const totRow2  = ws2.addRow(['الإجمالي', totRev2||null, totCogs2||null, totGrp2||null, totOp2||null, totNet2||null, totMrg2]); totRow2.height = 18;
  totRow2.eachCell({ includeEmpty:true }, (cell, ci) => {
    cell.font = { name:FONT, size:10, bold:true, color:{ argb:CLR.white } }; cell.fill = solid(CLR.navy);
    cell.alignment = { horizontal: ci===1?'right':'center', vertical:'middle' };
    if (ci===2||ci===3||ci===4||ci===5||ci===6) cell.numFmt = '#,##0';
    if (ci===7) cell.numFmt = '0.0%';
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `الإيضاحات_المالية_${asOf}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
