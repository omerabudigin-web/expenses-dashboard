// ── Manufacturing P&L Analysis Tab ────────────────────────────────────────────

const MFG_MONTHS = ['أكت-25','نوف-25','ديس-25','ين-26','فب-26','مر-26','أب-26','مي-26','يو-26'];

// ─ PRODUCTION (FinishedGoodsReceipt) ─────────────────────────────────────────
const MFG_PQ75 = [  79.7,   12.0,  561.8,  163.3,  290.9,  219.5,  204.6,   50.5,    0];
const MFG_PQ45 = [ 142.1,  207.5,   38.7,  276.5,  207.0,  202.4,  132.7,  166.5,    0];
const MFG_PQSH = [     0,      0,   34.0,      0,      0,      0,      0,   32.5,  32.6];
const MFG_PC75 = [116298,  17814, 873276, 254328, 447467, 335838, 312327,  84536,    0];
const MFG_PC45 = [207286, 342469,  61747, 420833, 317897, 318004, 206413, 249173,    0];
const MFG_PCSH = [     0,      0,  70891,      0,      0,      0,      0,  94808, 95070];
const MFG_A75  = [1458, 1483, 1554, 1557, 1538, 1530, 1527, 1675, null];
const MFG_A45  = [1458, 1650, 1595, 1522, 1536, 1571, 1555, 1497, null];
const MFG_ASH  = [null, null, 2083, null, null, null, null, 2914, 2914];

// ─ SALES (SalesInvoice ex-VAT) ────────────────────────────────────────────────
const MFG_SQ75 = [414.5, 280.7, 349.9, 290.3, 224.2,  92.1, 167.4, 203.1,  14.5];
const MFG_SQ45 = [209.1, 167.8, 122.2, 174.4, 182.1,  74.3, 108.3, 156.2,  13.9];
const MFG_SQSH = [191.2,  53.1,  34.0,     0,   9.1,     0,     0,  31.7,  32.5];
const MFG_R75  = [945001, 730540, 905964, 710939, 530900, 238930, 490045, 506114, 45914];
const MFG_R45  = [487892, 418485, 286122, 402201, 401728, 181188, 307178, 449380, 43141];
const MFG_RSH  = [490384, 141917,  87270,      0,  23886,      0,      0,  91253, 116005];
const MFG_P75  = [2280, 2602, 2589, 2449, 2368, 2594, 2928, 2492, 3166];
const MFG_P45  = [2333, 2493, 2341, 2307, 2206, 2438, 2837, 2876, 3104];
const MFG_PSH  = [2565, 2674, 2565, null, 2622, null, null, 2875, 3565];

// ─ INPUT COIL COST ────────────────────────────────────────────────────────────
const MFG_COIL10 = [2130, 2130, 2179, 2169, 2154, 2154, 2154, 2530, 2914];
const MFG_COIL8  = [2130, 2288, null, 2145, 2166, 2166, 2166, 2182, null];
const MFG_INP    = [328020, 484256, 1658021, 969463, 1047878, 1196038, 1611422, 856413, 131738];
const MFG_BCT    = [5, 13, 34, 22, 22, 14, 25, 33, 6];

// ─ MONTHLY MATERIAL MARGIN % = (SellPrice − AllocCost) / SellPrice × 100 ────
const MFG_MGPCT_75 = [36.1, 43.0, 40.0, 36.4, 35.1, 41.0, 47.8, 32.8, null];
const MFG_MGPCT_45 = [37.5, 33.8, 31.9, 34.0, 30.4, 35.6, 45.2, 47.9, null];
const MFG_MGPCT_SH = [null, null, 18.8, null, null, null, null, -1.4, 18.3];

const MFG_CHARTS = {};
let _mfgRendered = false;

function renderManufacturing() {
  if (_mfgRendered) return;
  _mfgRendered = true;
  const wrap = document.getElementById('tab-manufacturing');

  // ── Period totals ──────────────────────────────────────────────────────────
  const T_INP   = MFG_INP.reduce((s,v)=>s+v, 0);
  const T_R75   = MFG_R75.reduce((s,v)=>s+v, 0);
  const T_R45   = MFG_R45.reduce((s,v)=>s+v, 0);
  const T_RSH   = MFG_RSH.reduce((s,v)=>s+v, 0);
  const T_REV   = T_R75 + T_R45 + T_RSH;
  const T_Q75   = MFG_SQ75.reduce((s,v)=>s+v, 0);
  const T_Q45   = MFG_SQ45.reduce((s,v)=>s+v, 0);
  const T_BATS  = MFG_BCT.reduce((s,v)=>s+v, 0);
  const T_PQ75  = MFG_PQ75.reduce((s,v)=>s+v, 0);
  const T_PQ45  = MFG_PQ45.reduce((s,v)=>s+v, 0);
  const T_PC75  = MFG_PC75.reduce((s,v)=>s+v, 0);
  const T_PC45  = MFG_PC45.reduce((s,v)=>s+v, 0);
  const T_PQSH  = MFG_PQSH.reduce((s,v)=>s+v, 0);
  const T_PCSH  = MFG_PCSH.reduce((s,v)=>s+v, 0);
  const T_QSH   = MFG_SQSH.reduce((s,v)=>s+v, 0);
  const AVG_P75 = Math.round(T_R75/T_Q75);
  const AVG_P45 = Math.round(T_R45/T_Q45);
  const AVG_A75 = Math.round(T_PC75/T_PQ75);
  const AVG_A45 = Math.round(T_PC45/T_PQ45);
  const AVG_ASH = Math.round(T_PCSH/T_PQSH);
  const AVG_PSH = Math.round(T_RSH/T_QSH);
  const MRG_75  = AVG_P75 - AVG_A75;
  const MRG_45  = AVG_P45 - AVG_A45;
  const MRG_SH  = AVG_PSH - AVG_ASH;
  const MRG_PCT_75 = (MRG_75/AVG_P75*100).toFixed(1);
  const MRG_PCT_45 = (MRG_45/AVG_P45*100).toFixed(1);
  const T_ALLOC = T_PC75 + T_PC45 + T_PCSH;
  const T_TOT_PROD_Q = T_PQ75 + T_PQ45 + T_PQSH;
  const AVG_BATCH_VAL = Math.round(T_INP / T_BATS);

  const fN  = v => Math.round(v).toLocaleString('ar-SA');
  const fM  = v => (v/1e6).toFixed(2)+' م';
  const fK  = v => (v/1e3).toFixed(0)+' ك';
  const ROW_BG = i => i%2===0 ? 'background:#0a1928' : 'background:#0d2035';

  // ── Sensitivity analysis ───────────────────────────────────────────────────
  const AVG_COIL_INP = 4905584 / 2241; // متوسط تكلفة الكويل المُدخَل/طن على الفترة
  const F75 = AVG_A75 / AVG_COIL_INP;  // معامل تخصيص MD75
  const F45 = AVG_A45 / AVG_COIL_INP;  // معامل تخصيص MD45
  const BEP_75 = Math.round(AVG_P75 / F75); // سعر كويل التعادل لـ MD75
  const BEP_45 = Math.round(AVG_P45 / F45); // سعر كويل التعادل لـ MD45
  const SENS = [1860,2193,2400,2600,2914,3200,BEP_75,3421].sort((a,b)=>a-b).map(c => {
    const a75 = Math.round(c*F75), a45 = Math.round(c*F45);
    const m75 = AVG_P75-a75, m45 = AVG_P45-a45;
    const p75 = (m75/AVG_P75*100).toFixed(1), p45 = (m45/AVG_P45*100).toFixed(1);
    const gc = v => v<0?'#da4a4a':v<200?'#e0c060':v<500?'#b0d080':'#4ada8e';
    return {c,a75,a45,m75,m45,p75,p45,gc75:gc(m75),gc45:gc(m45)};
  });
  const sensRows = SENS.map(s => {
    const isCur = s.c===2193, isBep75 = s.c===BEP_75;
    const rowStyle = isCur?'background:#0d2040;outline:1px solid #2a5a9a':
                     isBep75?'background:#200a0a;outline:1px solid #7a2a2a':'';
    const tag = s.c===1860?'أدنى مستورد':s.c===2193?'⭐ متوسط الفترة':
                s.c===2914?'🚨 يو-26':s.c===BEP_75?'🔴 تعادل MD75':
                s.c===3421?'أعلى فعلي':'';
    return `<tr style="${rowStyle}">
      <td style="font-weight:700;color:#c8d8e8;text-align:right">${fN(s.c)} ر.س/طن</td>
      <td style="text-align:right"><span style="font-size:.72rem;color:#708090">${tag}</span></td>
      <td class="num" style="color:#4a9eda">${fN(s.a75)}</td>
      <td class="num" style="color:${s.gc75};font-weight:700">${s.m75>=0?'+':''}${fN(s.m75)}</td>
      <td class="num" style="color:${s.gc75};font-weight:700">${s.p75}%</td>
      <td class="num" style="color:#f5a623">${fN(s.a45)}</td>
      <td class="num" style="color:${s.gc45};font-weight:700">${s.m45>=0?'+':''}${fN(s.m45)}</td>
      <td class="num" style="color:${s.gc45};font-weight:700">${s.p45}%</td>
    </tr>`;
  }).join('');

  // ── Monthly batch cost & gap ───────────────────────────────────────────────
  const MFG_COST_PER_BATCH = MFG_BCT.map((b,i) => b>0 ? Math.round(MFG_INP[i]/b) : null);
  const GAP_75 = MFG_MONTHS.map((_,i) => +(MFG_SQ75[i]-MFG_PQ75[i]).toFixed(1));
  const GAP_45 = MFG_MONTHS.map((_,i) => +(MFG_SQ45[i]-MFG_PQ45[i]).toFixed(1));

  // Best month MD75/MD45
  const bestIdx75 = MFG_MGPCT_75.reduce((bi,v,i)=>v!==null&&v>MFG_MGPCT_75[bi]?i:bi, 0);
  const bestIdx45 = MFG_MGPCT_45.reduce((bi,v,i)=>v!==null&&v>MFG_MGPCT_45[bi]?i:bi, 0);

  // ── Production table rows ──────────────────────────────────────────────────
  const prodRows = MFG_MONTHS.map((m,i) => `<tr style="${ROW_BG(i)}">
    <td style="font-weight:600;color:#c8d8e8;white-space:nowrap">${m}</td>
    <td class="num" style="color:#5a7a9a">${MFG_BCT[i]}</td>
    <td class="num" style="color:#7090b0">${fK(MFG_INP[i])} ك</td>
    <td class="num" style="color:#4a9eda">${MFG_PQ75[i]>0?MFG_PQ75[i].toFixed(1):'—'}</td>
    <td class="num" style="color:#3a7aaa;border-right:1px solid #1e3a5f">${MFG_PC75[i]>0?(MFG_PC75[i]/1e3).toFixed(0)+' ك':'—'}</td>
    <td class="num" style="color:#f5a623">${MFG_PQ45[i]>0?MFG_PQ45[i].toFixed(1):'—'}</td>
    <td class="num" style="color:#c08020;border-right:1px solid #1e3a5f">${MFG_PC45[i]>0?(MFG_PC45[i]/1e3).toFixed(0)+' ك':'—'}</td>
    <td class="num" style="color:#4ada8e">${MFG_PQSH[i]>0?MFG_PQSH[i].toFixed(1):'—'}</td>
    <td class="num" style="color:#30a870">${MFG_PCSH[i]>0?(MFG_PCSH[i]/1e3).toFixed(0)+' ك':'—'}</td>
    <td class="num" style="color:${MFG_PQSH[i]>0?(MFG_PCSH[i]/MFG_PQSH[i]>2500?'#f08080':'#4ada8e'):'#5a7a9a'};font-weight:600">${MFG_PQSH[i]>0?fN(Math.round(MFG_PCSH[i]/MFG_PQSH[i])):'—'}</td>
  </tr>`).join('');

  // ── Sales + margin table rows ──────────────────────────────────────────────
  const salesRows = MFG_MONTHS.map((m,i) => {
    const rev  = MFG_R75[i]+MFG_R45[i]+MFG_RSH[i];
    const mg75 = MFG_A75[i] ? MFG_P75[i]-MFG_A75[i] : null;
    const mg45 = MFG_A45[i] ? MFG_P45[i]-MFG_A45[i] : null;
    const mgsh = (MFG_PSH[i]&&MFG_ASH[i]) ? MFG_PSH[i]-MFG_ASH[i] : null;
    const gc   = v => v===null?'#5a7a9a':v<0?'#da4a4a':v>900?'#4ada8e':'#b0d080';
    const flag = mgsh!==null&&mgsh<0?' 🚨':'';
    // Margin % badge for MD75
    const mpct75 = MFG_MGPCT_75[i];
    const mpct45 = MFG_MGPCT_45[i];
    const badgeStyle = pct => pct===null?'color:#5a7a9a':
      `color:${pct<30?'#da4a4a':pct>=40?'#4ada8e':'#e0c060'};font-size:.72rem`;
    return `<tr style="${ROW_BG(i)}">
      <td style="font-weight:600;color:#c8d8e8;white-space:nowrap">${m}</td>
      <td class="num">${MFG_SQ75[i]>0?MFG_SQ75[i].toFixed(1):'—'}</td>
      <td class="num" style="color:#4a9eda">${fN(MFG_P75[i])}</td>
      <td class="num" style="color:${gc(mg75)};font-weight:600">${mg75!==null?'+'+fN(mg75):'—'}</td>
      <td class="num" style="${badgeStyle(mpct75)}">${mpct75!==null?mpct75+'%':'—'}</td>
      <td class="num" style="border-right:1px solid #1e3a5f"></td>
      <td class="num">${MFG_SQ45[i]>0?MFG_SQ45[i].toFixed(1):'—'}</td>
      <td class="num" style="color:#f5a623">${fN(MFG_P45[i])}</td>
      <td class="num" style="color:${gc(mg45)};font-weight:600">${mg45!==null?'+'+fN(mg45):'—'}</td>
      <td class="num" style="${badgeStyle(mpct45)}">${mpct45!==null?mpct45+'%':'—'}</td>
      <td class="num" style="border-right:1px solid #1e3a5f"></td>
      <td class="num" style="color:#4ada8e">${MFG_SQSH[i]>0?MFG_SQSH[i].toFixed(1):'—'}</td>
      <td class="num" style="color:#4ada8e">${MFG_PSH[i]?fN(MFG_PSH[i]):'—'}</td>
      <td class="num" style="color:${gc(mgsh)};font-weight:600;border-right:1px solid #1e3a5f">${mgsh!==null?(mgsh>=0?'+':'')+fN(mgsh)+flag:'—'}</td>
      <td class="num" style="font-weight:700;color:#a0c4e8">${rev>0?fN(rev)+' ر.س':'—'}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
  <style>
    #tab-manufacturing .insight-card{background:#0c1e30;border-radius:9px;padding:14px 16px;border-right:4px solid #3a7abf;position:relative;overflow:hidden}
    #tab-manufacturing .insight-card::after{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,rgba(255,255,255,.02),transparent);pointer-events:none}
    #tab-manufacturing .mfg-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:.72rem;font-weight:700;vertical-align:middle}
    #tab-manufacturing .section-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#3a6a8a;margin-bottom:8px;font-weight:600}
    #tab-manufacturing tbody tr td{transition:background .12s ease}
    #tab-manufacturing tbody tr{transition:box-shadow .12s ease}
    #tab-manufacturing tbody tr:hover td{background:#162840!important;cursor:default}
    #tab-manufacturing tbody tr:hover td:first-child{box-shadow:inset 3px 0 0 #4a9eda!important}
  </style>

  <!-- ═══ HEADER ═══════════════════════════════════════════════════════════ -->
  <div style="background:linear-gradient(135deg,#060f1e,#0d1e38,#060f1e);border:1px solid #1e3a5f;
    border-top:3px solid #4a9eda;border-radius:10px;padding:18px 24px;margin-bottom:20px;
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="font-size:2.4rem;filter:drop-shadow(0 0 8px rgba(74,158,218,0.4))">🏭</div>
      <div>
        <div style="font-size:1.05rem;font-weight:700;color:#e8f4ff;letter-spacing:.01em">
          تحليل P&L التصنيع — حركة التكاليف من المواد الخام إلى البيع
        </div>
        <div style="font-size:.75rem;color:#5a8aaa;margin-top:4px">
          أكتوبر 2025 – يونيو 2026 · ${T_BATS} دفعة · مصنع حوراء · هامش مواد فقط (بدون رواتب واستهلاك)
        </div>
      </div>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">إيراد إجمالي</div>
        <div style="font-size:1.1rem;font-weight:700;color:#4ada8e">${fM(T_REV)} ر.س</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">تكلفة مدخلات</div>
        <div style="font-size:1.1rem;font-weight:700;color:#a0c4e8">${fM(T_INP)} ر.س</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">متوسط الدفعة</div>
        <div style="font-size:1.1rem;font-weight:700;color:#e0c060">${fK(AVG_BATCH_VAL)} ك ر.س</div>
      </div>
    </div>
  </div>

  <!-- ═══ KPIs ══════════════════════════════════════════════════════════════ -->
  <div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(185px,1fr));margin-bottom:20px">
    <div class="kpi" style="--accent:#4a9eda;background:linear-gradient(135deg,#0a1e35,#0f2035)">
      <div class="lbl">MD75 — هامش المادة</div>
      <div class="val" style="color:#4a9eda">+${fN(MRG_75)} ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#0d2a40;color:#4a9eda">${MRG_PCT_75}%</span>
        <span style="font-size:.7rem;color:#4a7a9a;margin-right:6px">· متوسط سعر ${fN(AVG_P75)}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#f5a623;background:linear-gradient(135deg,#1a1008,#1e1208)">
      <div class="lbl">MD45 — هامش المادة</div>
      <div class="val" style="color:#f5a623">+${fN(MRG_45)} ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#2a1a08;color:#f5a623">${MRG_PCT_45}%</span>
        <span style="font-size:.7rem;color:#8a6a30;margin-right:6px">· متوسط سعر ${fN(AVG_P45)}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#4ada8e;background:linear-gradient(135deg,#081a10,#0a1e12)">
      <div class="lbl">أفضل شهر للهامش</div>
      <div class="val" style="color:#4ada8e">${MFG_MONTHS[bestIdx75]}</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#0d2a18;color:#4ada8e">MD75 ${MFG_MGPCT_75[bestIdx75]}%</span>
        <span class="mfg-badge" style="background:#2a1a08;color:#f5a623;margin-right:4px">MD45 ${MFG_MGPCT_45[bestIdx75]}%</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#a78bfa;background:linear-gradient(135deg,#10081e,#120a20)">
      <div class="lbl">إجمالي كمية الإنتاج</div>
      <div class="val" style="color:#c8a8ff">${fN(Math.round(T_TOT_PROD_Q))} طن</div>
      <div style="margin-top:6px;font-size:.72rem;color:#6a5a9a">
        MD75 ${(T_PQ75/T_TOT_PROD_Q*100).toFixed(0)}% ·
        MD45 ${(T_PQ45/T_TOT_PROD_Q*100).toFixed(0)}% ·
        مشرشر ${(T_PQSH/T_TOT_PROD_Q*100).toFixed(0)}%
      </div>
    </div>
    <div class="kpi" style="--accent:#ff6b6b;background:linear-gradient(135deg,#1e0808,#200a0a)">
      <div class="lbl">🚨 سعر كويل 10مم — يونيو</div>
      <div class="val" style="color:#ff8080">2,914 ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#3a1010;color:#ff6b6b">+37% عن أكتوبر</span>
        <span style="font-size:.7rem;color:#8a4a4a;margin-right:6px">كان 2,130</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#e0c060;background:linear-gradient(135deg,#1a1400,#1e1800)">
      <div class="lbl">متوسط تكلفة الدفعة</div>
      <div class="val" style="color:#e0c060">${fK(AVG_BATCH_VAL)} ك ر.س</div>
      <div style="font-size:.72rem;color:#8a7830;margin-top:6px">${T_BATS} دفعة · إجمالي ${fM(T_INP)} ر.س</div>
    </div>
  </div>

  <!-- ═══ KEY INSIGHTS ══════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="section-label">رؤى مالية رئيسية</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="insight-card" style="border-color:#4ada8e">
        <div style="font-size:.82rem;font-weight:700;color:#4ada8e;margin-bottom:6px">
          🏆 MD45 أعلى ربحية بالقيمة المطلقة
        </div>
        <div style="font-size:.78rem;color:#8ab0a0;line-height:1.7">
          هامش MD45 <strong style="color:#f5a623">${MRG_PCT_45}%</strong> يتجاوز MD75
          <strong style="color:#4a9eda">${MRG_PCT_75}%</strong> على أساس الفترة الكاملة.
          في مايو 2026 وصل MD45 إلى <strong style="color:#4ada8e">47.9%</strong> — أعلى هامش مسجل.
        </div>
      </div>
      <div class="insight-card" style="border-color:#4a9eda">
        <div style="font-size:.82rem;font-weight:700;color:#4a9eda;margin-bottom:6px">
          📈 أبريل 2026 — أفضل شهر مزدوج
        </div>
        <div style="font-size:.78rem;color:#8090a8;line-height:1.7">
          تصاعد هامش المنتجين معاً:
          MD75 <strong style="color:#4a9eda">47.8%</strong> و MD45 <strong style="color:#f5a623">45.2%</strong>.
          السبب: استقرار تكلفة الكويل (2,154 ر.س) مع ارتفاع سعر البيع (MD75: 2,928 · MD45: 2,837).
        </div>
      </div>
      <div class="insight-card" style="border-color:#ff6b6b">
        <div style="font-size:.82rem;font-weight:700;color:#ff8080;margin-bottom:6px">
          ⚠️ خطر: ضغط الهامش في النصف الثاني
        </div>
        <div style="font-size:.78rem;color:#a08080;line-height:1.7">
          كويل 10مم قفز من <strong style="color:#a0c4e8">2,154</strong> ر.س/طن (فب-أب) إلى
          <strong style="color:#ff6b6b">2,914</strong> ر.س/طن (يو-26).
          إذا ثبتت أسعار البيع — هامش MD75 سينخفض من 32% إلى <strong style="color:#ff6b6b">~18%</strong>.
        </div>
      </div>
      <div class="insight-card" style="border-color:#e0c060">
        <div style="font-size:.82rem;font-weight:700;color:#e0c060;margin-bottom:6px">
          🚨 مشرشر مايو 2026 — بيع بأقل من التكلفة
        </div>
        <div style="font-size:.78rem;color:#a09040;line-height:1.7">
          تكلفة الإنتاج <strong style="color:#ff8080">2,914 ر.س/طن</strong> تجاوزت سعر البيع
          <strong style="color:#e0c060">2,875 ر.س/طن</strong> → خسارة
          <strong style="color:#ff6b6b">−39 ر.س/طن</strong>.
          يوليو-2026: مراجعة عقد البيع ضرورية.
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ MARGIN % CHART (full width — أهم مخطط) ═══════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">📉 هامش المواد الشهري % — MD75 · MD45 · مشرشر
      <span style="font-size:.75rem;color:#5a8aaa;font-weight:400;margin-right:12px">
        (سعر البيع − التكلفة المخصصة) ÷ سعر البيع
      </span>
    </div>
    <div class="chart-wrap-lg" style="height:300px"><canvas id="mfg-c-margin"></canvas></div>
    <div style="display:flex;gap:20px;margin-top:10px;font-size:.73rem;color:#4a6a8a;flex-wrap:wrap">
      <span style="color:#4ada8e">━━ منطقة ممتازة ≥40%</span>
      <span style="color:#e0c060">━━ منطقة مقبولة 30-40%</span>
      <span style="color:#da4a4a">━━ تحت الحد الأدنى &lt;30%</span>
    </div>
  </div>

  <!-- ═══ CHARTS ROW ════════════════════════════════════════════════════════ -->
  <div class="grid2" style="margin-bottom:18px">
    <div class="card">
      <div class="card-title">📊 الإيراد الشهري من المنتجات المصنّعة</div>
      <div class="chart-wrap" style="height:250px"><canvas id="mfg-c-rev"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">💰 سعر البيع مقابل التكلفة المخصصة / طن</div>
      <div class="chart-wrap" style="height:250px"><canvas id="mfg-c-price"></canvas></div>
    </div>
  </div>

  <!-- ═══ SENSITIVITY ANALYSIS ═══════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">🎯 تحليل الحساسية — تأثير سعر الكويل على هامش المادة
      <span style="font-size:.75rem;color:#5a8aaa;font-weight:400;margin-right:12px">(بثبات أسعار البيع: MD75=${fN(AVG_P75)} · MD45=${fN(AVG_P45)} ر.س/طن)</span>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th style="text-align:right">سعر الكويل</th>
            <th style="text-align:right">الحالة</th>
            <th class="num" colspan="3" style="color:#4a9eda;background:#060f1a;border-right:1px solid #1e3a5f">MD75 — M12</th>
            <th class="num" colspan="3" style="color:#f5a623;background:#12100a">MD45 — M6</th>
          </tr>
          <tr>
            <th></th><th></th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem">تكلفة/طن</th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem">هامش/طن</th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem;border-right:1px solid #1e3a5f">هامش%</th>
            <th class="num" style="color:#a07020;font-size:.75rem">تكلفة/طن</th>
            <th class="num" style="color:#a07020;font-size:.75rem">هامش/طن</th>
            <th class="num" style="color:#a07020;font-size:.75rem">هامش%</th>
          </tr>
        </thead>
        <tbody>${sensRows}</tbody>
      </table>
    </div>
    <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">
      <div style="background:#0a1e30;border:1px solid #1e3a5f;border-right:3px solid #ff6b6b;border-radius:7px;padding:10px 16px">
        <div style="font-size:.72rem;color:#8090a0;margin-bottom:3px">🔴 سعر تعادل MD75</div>
        <div style="font-size:1.05rem;font-weight:700;color:#ff8080">${fN(BEP_75)} ر.س/طن</div>
        <div style="font-size:.7rem;color:#606070;margin-top:2px">فجوة عن يو-26: +${fN(BEP_75-2914)} ر.س/طن</div>
      </div>
      <div style="background:#0a1e30;border:1px solid #1e3a5f;border-right:3px solid #f5a623;border-radius:7px;padding:10px 16px">
        <div style="font-size:.72rem;color:#8090a0;margin-bottom:3px">🟠 سعر تعادل MD45</div>
        <div style="font-size:1.05rem;font-weight:700;color:#f5a623">${fN(BEP_45)} ر.س/طن</div>
        <div style="font-size:.7rem;color:#606070;margin-top:2px">فجوة عن يو-26: +${fN(BEP_45-2914)} ر.س/طن</div>
      </div>
      <div style="background:#0a1e30;border:1px solid #1e3a5f;border-right:3px solid #4a9eda;border-radius:7px;padding:10px 16px;flex:1;min-width:220px">
        <div style="font-size:.72rem;color:#8090a0;margin-bottom:4px">المعامل المنهجي (allocation factor)</div>
        <div style="font-size:.8rem;color:#a0c4e8;line-height:1.8">
          MD75: سعر كويل × ${F75.toFixed(3)} = تكلفة/طن مُنتَج<br>
          MD45: سعر كويل × ${F45.toFixed(3)} = تكلفة/طن مُنتَج<br>
          <span style="color:#5a7a9a">كل طن كويل يُنتج ${(1/F75).toFixed(2)} طن MD75 أو ${(1/F45).toFixed(2)} طن MD45</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ PRODUCTION vs SALES GAP ═════════════════════════════════════════════ -->
  <div class="grid2" style="margin-bottom:18px">
    <div class="card">
      <div class="card-title">📦 MD75 — إنتاج vs مبيعات شهرياً (طن)</div>
      <div class="chart-wrap" style="height:240px"><canvas id="mfg-c-gap75"></canvas></div>
      <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">
        خط الفجوة: موجب = مخزون يُستنزف · سالب = مخزون يتراكم
      </div>
    </div>
    <div class="card">
      <div class="card-title">📦 MD45 — إنتاج vs مبيعات شهرياً (طن)</div>
      <div class="chart-wrap" style="height:240px"><canvas id="mfg-c-gap45"></canvas></div>
      <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">
        الفجوة الإيجابية في أكت-نوف من مخزون ما قبل الفترة
      </div>
    </div>
  </div>

  <!-- ═══ BATCH EFFICIENCY ══════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">⚡ كفاءة الدفعات — متوسط تكلفة الدفعة الواحدة شهرياً (ر.س/دفعة)</div>
    <div class="chart-wrap" style="height:210px"><canvas id="mfg-c-batch"></canvas></div>
    <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">
      الدفعات الكبيرة (مر-أب) ذات تكلفة مرتفعة/دفعة لاحتوائها مواد غير كويلية (حديد مجدول وأخرى).
      مي-26 أصغر دفعة متوسطة — قد يعكس تحولاً للتوريد الخارجي.
    </div>
  </div>

  <!-- ═══ COST CHAIN TABLE ══════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">⛓️ سلسلة التكلفة — من شراء الكويل إلى البيع (متوسط الفترة · ر.س/طن)</div>
    <div style="overflow-x:auto;padding-bottom:8px">
      <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:.82rem">
        <thead>
          <tr style="background:#0a1e30">
            <th style="padding:10px 14px;text-align:right;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">المرحلة</th>
            <th style="padding:10px 14px;text-align:right;color:#5a8aaa;border-bottom:2px solid #1e3a5f">الوصف</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap;background:#0d2030">الكمية (طن)</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">أدنى سعر</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">متوسط</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f;white-space:nowrap">أعلى سعر</th>
            <th class="num" style="padding:10px 14px;color:#5a8aaa;border-bottom:2px solid #1e3a5f">Δ / الهامش</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#0f2035">
            <td style="padding:10px 14px;color:#a0c4e8;font-weight:600;border-bottom:1px solid #1e3a5f">🛒 شراء الكويل</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">PurchaseInvoice · Net</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700;background:#0d2030">5,572</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">1,860</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700">2,193</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">3,421</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">—</td>
          </tr>
          <tr style="background:#0a1e30">
            <td style="padding:10px 14px;color:#a0c4e8;font-weight:600;border-bottom:1px solid #1e3a5f">⚙️ إدخال التصنيع</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">RawMaterialIssue — كويل فقط</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700;background:#0d2030">2,241</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,061</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700">2,193</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">2,914</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">−3,331 بيع مباشر / مخزون</td>
          </tr>
          <tr style="background:#06121e">
            <td style="padding:10px 14px;color:#4a9eda;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج MD75 (M12)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt · تكلفة مخصصة/طن مُنتَج</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700;background:#0d2030">${Math.round(T_PQ75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">1,458</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700">${fN(AVG_A75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">1,675</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">−${fN(2193-AVG_A75)} (تحويل الوحدات)</td>
          </tr>
          <tr style="background:#0a1808">
            <td style="padding:10px 14px;color:#f5a623;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج MD45 (M6)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt · تكلفة مخصصة/طن مُنتَج</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700;background:#0d2030">${Math.round(T_PQ45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">1,458</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700">${fN(AVG_A45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">1,650</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">−${fN(2193-AVG_A45)} (تحويل الوحدات)</td>
          </tr>
          <tr style="background:#061808">
            <td style="padding:10px 14px;color:#4ada8e;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج مشرشر</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt — كويل إملس → مشرشر (3 دفعات)</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700;background:#0d2030">${Math.round(T_PQSH)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,083</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">${fN(AVG_ASH)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">2,914</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">≈ سعر الكويل (لا تحويل وحدات)</td>
          </tr>
          <tr style="background:#061220">
            <td style="padding:10px 14px;color:#4a9eda;font-weight:600;border-bottom:1px solid #1e3a5f">💰 بيع MD75 (M12)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">SalesInvoice · Net · إيراد ${fN(Math.round(T_R75/1e3))} ك ر.س</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700;background:#0d2030">${Math.round(T_Q75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,280</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700">${fN(AVG_P75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">3,166</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">+${fN(MRG_75)} هامش/طن · <span style="background:#0d2a18;padding:1px 7px;border-radius:8px">${MRG_PCT_75}%</span></td>
          </tr>
          <tr style="background:#12100a">
            <td style="padding:10px 14px;color:#f5a623;font-weight:600;border-bottom:1px solid #1e3a5f">💰 بيع MD45 (M6)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">SalesInvoice · Net · إيراد ${fN(Math.round(T_R45/1e3))} ك ر.س</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700;background:#0d2030">${Math.round(T_Q45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">2,206</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700">${fN(AVG_P45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">3,104</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">+${fN(MRG_45)} هامش/طن · <span style="background:#2a1a08;padding:1px 7px;border-radius:8px">${MRG_PCT_45}%</span></td>
          </tr>
          <tr style="background:#0a1a10">
            <td style="padding:10px 14px;color:#4ada8e;font-weight:600">💰 بيع مشرشر</td>
            <td style="padding:10px 14px;color:#7090b0">SalesInvoice · Net · إيراد ${fN(Math.round(T_RSH/1e3))} ك ر.س · ★ يشمل مخزون ما قبل الفترة</td>
            <td class="num" style="color:#4ada8e;font-weight:700;background:#0d2030">${Math.round(T_QSH)}</td>
            <td class="num" style="color:#4ada8e">2,565</td>
            <td class="num" style="color:#4ada8e;font-weight:700">${fN(AVG_PSH)}</td>
            <td class="num" style="color:#e0c060">3,565</td>
            <td class="num" style="color:${MRG_SH>=0?'#4ada8e':'#da4a4a'};font-weight:700">${MRG_SH>=0?'+':''}${fN(MRG_SH)} هامش/طن · 🚨 مي-26: −39</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ═══ PRODUCTION TABLE ══════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">🏭 جانب الإنتاج — الكميات والتكاليف المخصصة شهرياً <span style="font-size:.75rem;color:#5a8aaa;font-weight:400">(FinishedGoodsReceipt)</span></div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="text-align:right">الشهر</th>
            <th rowspan="2" class="num">دفعات</th>
            <th rowspan="2" class="num" style="color:#7090b0">تكلفة الإدخال الكلية</th>
            <th colspan="2" style="color:#4a9eda;background:#060f1a;border-right:1px solid #1e3a5f">MD75 — M12</th>
            <th colspan="2" style="color:#f5a623;background:#12100a;border-right:1px solid #1e3a5f">MD45 — M6</th>
            <th colspan="3" style="color:#4ada8e;background:#060f0a">مشرشر</th>
          </tr>
          <tr>
            <th class="num" style="color:#3a7aaa;font-size:.75rem">طن مُنتَج</th>
            <th class="num" style="color:#3a7aaa;font-size:.75rem;border-right:1px solid #1e3a5f">تكلفة مخصصة</th>
            <th class="num" style="color:#a07020;font-size:.75rem">طن مُنتَج</th>
            <th class="num" style="color:#a07020;font-size:.75rem;border-right:1px solid #1e3a5f">تكلفة مخصصة</th>
            <th class="num" style="color:#30a070;font-size:.75rem">طن مُنتَج</th>
            <th class="num" style="color:#30a070;font-size:.75rem">تكلفة مخصصة</th>
            <th class="num" style="color:#30a070;font-size:.75rem">ر.س/طن</th>
          </tr>
        </thead>
        <tbody>${prodRows}</tbody>
        <tfoot>
          <tr style="font-weight:700;background:#0a1828;color:#c0d8f0">
            <td style="text-align:right">الإجمالي</td>
            <td class="num" style="color:#6a8aaa">${T_BATS}</td>
            <td class="num" style="color:#9090b0">${fK(T_INP)} ك ر.س</td>
            <td class="num" style="color:#4a9eda">${Math.round(T_PQ75)} طن <span style="color:#3a6a9a;font-size:.75rem">(${(T_PQ75/T_TOT_PROD_Q*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#4a9eda;border-right:1px solid #1e3a5f">${(T_PC75/1e3).toFixed(0)} ك <span style="color:#3a6a9a;font-size:.75rem">(${(T_PC75/T_ALLOC*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#f5a623">${Math.round(T_PQ45)} طن <span style="color:#a07020;font-size:.75rem">(${(T_PQ45/T_TOT_PROD_Q*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#f5a623;border-right:1px solid #1e3a5f">${(T_PC45/1e3).toFixed(0)} ك <span style="color:#a07020;font-size:.75rem">(${(T_PC45/T_ALLOC*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#4ada8e">${Math.round(T_PQSH)} طن <span style="color:#30a870;font-size:.75rem">(${(T_PQSH/T_TOT_PROD_Q*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#4ada8e">${(T_PCSH/1e3).toFixed(0)} ك <span style="color:#30a870;font-size:.75rem">(${(T_PCSH/T_ALLOC*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#f5a623;font-weight:700">${fN(AVG_ASH)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <!-- ═══ SALES TABLE ═══════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">💰 جانب المبيعات — الكميات والأسعار والهامش المادي <span style="font-size:.75rem;color:#5a8aaa;font-weight:400">(SalesInvoice · بدون ضريبة)</span></div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="text-align:right">الشهر</th>
            <th colspan="5" style="color:#4a9eda;background:#060f1a;border-right:1px solid #1e3a5f">MD75 — M12</th>
            <th colspan="5" style="color:#f5a623;background:#12100a;border-right:1px solid #1e3a5f">MD45 — M6</th>
            <th colspan="3" style="color:#4ada8e;background:#060f0a;border-right:1px solid #1e3a5f">مشرشر</th>
            <th class="num" rowspan="2">إيراد إجمالي</th>
          </tr>
          <tr>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">طن</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">ر.س/طن</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">هامش/طن</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa">هامش%</th>
            <th class="num" style="font-size:.72rem;color:#3a7aaa;border-right:1px solid #1e3a5f"></th>
            <th class="num" style="font-size:.72rem;color:#a07020">طن</th>
            <th class="num" style="font-size:.72rem;color:#a07020">ر.س/طن</th>
            <th class="num" style="font-size:.72rem;color:#a07020">هامش/طن</th>
            <th class="num" style="font-size:.72rem;color:#a07020">هامش%</th>
            <th class="num" style="font-size:.72rem;color:#a07020;border-right:1px solid #1e3a5f"></th>
            <th class="num" style="font-size:.72rem;color:#30a070">طن</th>
            <th class="num" style="font-size:.72rem;color:#30a070">ر.س/طن</th>
            <th class="num" style="font-size:.72rem;color:#30a070;border-right:1px solid #1e3a5f">هامش/طن</th>
          </tr>
        </thead>
        <tbody>${salesRows}</tbody>
        <tfoot>
          <tr style="font-weight:700;background:#0a1828;color:#c0d8f0;border-top:2px solid #2a4a6a">
            <td style="text-align:right;color:#7090b0;font-weight:400;font-size:.75rem">الكمية · متوسط السعر · الهامش</td>
            <td class="num" style="color:#4a9eda">${Math.round(T_Q75)} طن</td>
            <td class="num" style="color:#4a9eda">${fN(AVG_P75)}</td>
            <td class="num" style="color:#4ada8e">+${fN(MRG_75)}</td>
            <td class="num" style="color:#4ada8e">${MRG_PCT_75}%</td>
            <td class="num" style="border-right:1px solid #1e3a5f"></td>
            <td class="num" style="color:#f5a623">${Math.round(T_Q45)} طن</td>
            <td class="num" style="color:#f5a623">${fN(AVG_P45)}</td>
            <td class="num" style="color:#4ada8e">+${fN(MRG_45)}</td>
            <td class="num" style="color:#4ada8e">${MRG_PCT_45}%</td>
            <td class="num" style="border-right:1px solid #1e3a5f"></td>
            <td class="num" style="color:#4ada8e">${Math.round(T_QSH)} طن</td>
            <td class="num" style="color:#4ada8e">${fN(AVG_PSH)}</td>
            <td class="num" style="color:${MRG_SH>=0?'#4ada8e':'#da4a4a'};border-right:1px solid #1e3a5f">${MRG_SH>=0?'+':''}${fN(MRG_SH)}</td>
            <td class="num" style="color:#7090b0">—</td>
          </tr>
          <tr style="font-weight:700;background:#081420;border-top:1px solid #1e3a5f">
            <td style="text-align:right;color:#e0ecff">الإيراد الإجمالي</td>
            <td class="num" colspan="5" style="color:#4a9eda;font-size:.9rem;border-right:1px solid #1e3a5f">${fN(T_R75)} ر.س <span style="color:#3a6a9a;font-size:.75rem">(${(T_R75/T_REV*100).toFixed(1)}%)</span></td>
            <td class="num" colspan="5" style="color:#f5a623;font-size:.9rem;border-right:1px solid #1e3a5f">${fN(T_R45)} ر.س <span style="color:#a07020;font-size:.75rem">(${(T_R45/T_REV*100).toFixed(1)}%)</span></td>
            <td class="num" colspan="3" style="color:#4ada8e;font-size:.9rem;border-right:1px solid #1e3a5f">${fN(T_RSH)} ر.س <span style="color:#30a870;font-size:.75rem">(${(T_RSH/T_REV*100).toFixed(1)}%)</span></td>
            <td class="num" style="color:#e0ecff;font-size:.95rem;font-weight:800">${fN(T_REV)} ر.س <span style="color:#7090b0;font-size:.75rem">(100%)</span></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="font-size:.71rem;color:#3a5a7a;margin-top:8px;line-height:1.7">
      هامش/طن = سعر البيع − التكلفة المخصصة (material margin · لا يشمل: رواتب المصنع، استهلاك الآلات، الكهرباء، الإيجار).
      هامش% = هامش/طن ÷ سعر البيع × 100. مبيعات مشرشر أكت-نوف-25 من مخزون ما قبل الفترة.
    </div>
  </div>

  <div style="font-size:.72rem;color:#3a5070;text-align:left">
    المصادر: RawMaterialIssue · FinishedGoodsReceipt · SalesInvoice · PurchaseInvoice — MekSoftDb1 · جميع القيم بدون VAT.
  </div>`;

  _mfgBuildCharts();
}

function _mfgBuildCharts() {
  const CO = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{color:'#a0b8c8',font:{size:10},boxWidth:11}}},
    scales:{
      x:{ticks:{color:'#708090',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},
      y:{ticks:{color:'#708090',font:{size:10}},grid:{color:'rgba(255,255,255,.06)'}},
    }
  };

  // ── Chart 1: Monthly Margin % ──────────────────────────────────────────────
  const mCtx = document.getElementById('mfg-c-margin');
  if (mCtx) {
    // Reference band datasets (40% target, 30% min)
    const ref40 = Array(9).fill(40);
    const ref30 = Array(9).fill(30);
    MFG_CHARTS.margin = new Chart(mCtx, {
      type:'line',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          // Reference lines (drawn first, behind)
          {label:'هدف ≥40%', data:ref40, borderColor:'rgba(74,218,142,0.3)',
           borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, order:10},
          {label:'حد أدنى 30%', data:ref30, borderColor:'rgba(218,74,74,0.3)',
           borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, order:11},
          // Main lines
          {label:'MD75 هامش%', data:MFG_MGPCT_75,
           borderColor:'#4a9eda', backgroundColor:'rgba(74,158,218,0.10)',
           borderWidth:3, tension:0.4, pointRadius:6, fill:true, spanGaps:false,
           pointBackgroundColor: MFG_MGPCT_75.map(v=>
             v===null?'transparent': v>=40?'#4ada8e': v>=30?'#e0c060': '#da4a4a'
           ),
           pointBorderColor:'#0d1b2a', pointBorderWidth:2},
          {label:'MD45 هامش%', data:MFG_MGPCT_45,
           borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,0.08)',
           borderWidth:3, tension:0.4, pointRadius:6, fill:true, spanGaps:false,
           pointBackgroundColor: MFG_MGPCT_45.map(v=>
             v===null?'transparent': v>=40?'#4ada8e': v>=30?'#e0c060': '#da4a4a'
           ),
           pointBorderColor:'#0d1b2a', pointBorderWidth:2},
          {label:'مشرشر هامش%', data:MFG_MGPCT_SH,
           borderColor:'#4ada8e', backgroundColor:'transparent',
           borderWidth:2, borderDash:[5,3], tension:0.3, pointRadius:7, fill:false, spanGaps:false,
           pointBackgroundColor: MFG_MGPCT_SH.map(v=>
             v===null?'transparent': v<0?'#da4a4a':'#4ada8e'
           ),
           pointBorderColor:'#0d1b2a', pointBorderWidth:2,
           pointStyle: MFG_MGPCT_SH.map(v=> v!==null&&v<0?'rectRot':'circle')},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{
            label: i => i.raw!==null ? `${i.dataset.label}: ${i.raw}%` : '',
          }}
        },
        scales:{...CO.scales,
          y:{...CO.scales.y,
            min:-10, max:55,
            ticks:{...CO.scales.y.ticks, callback:v=>v+'%'},
            grid:{color:(ctx)=>{
              const v = ctx.tick.value;
              if(v===40) return 'rgba(74,218,142,0.25)';
              if(v===30) return 'rgba(218,74,74,0.25)';
              if(v===0)  return 'rgba(218,74,74,0.5)';
              return 'rgba(255,255,255,0.04)';
            }}
          }
        }
      }
    });
  }

  // ── Chart 2: Monthly Revenue stacked + cost line ───────────────────────────
  const rCtx = document.getElementById('mfg-c-rev');
  if (rCtx) {
    MFG_CHARTS.rev = new Chart(rCtx, {
      type:'bar',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'إيراد MD75', data:MFG_R75, backgroundColor:'rgba(74,158,218,0.8)', stack:'r'},
          {label:'إيراد MD45', data:MFG_R45, backgroundColor:'rgba(245,166,35,0.8)',  stack:'r'},
          {label:'إيراد مشرشر', data:MFG_RSH, backgroundColor:'rgba(74,218,142,0.7)', stack:'r'},
          {label:'تكلفة الإنتاج', data:MFG_INP,
           type:'line', borderColor:'#ff6b6b', backgroundColor:'transparent',
           borderWidth:2, borderDash:[6,3], pointRadius:4, tension:0.3, order:0},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${(i.raw/1e3).toFixed(0)} ك ر.س`}}
        },
        scales:{...CO.scales,
          x:{...CO.scales.x, stacked:true},
          y:{...CO.scales.y, stacked:false,
            ticks:{...CO.scales.y.ticks, callback:v=>(v/1e6).toFixed(1)+'م'}
          }
        }
      }
    });
  }

  // ── Chart 3: Price vs allocated cost per ton ───────────────────────────────
  const pCtx = document.getElementById('mfg-c-price');
  if (pCtx) {
    MFG_CHARTS.price = new Chart(pCtx, {
      type:'line',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'سعر بيع MD75', data:MFG_P75,
           borderColor:'#4a9eda', backgroundColor:'rgba(74,158,218,0.06)',
           borderWidth:2.5, tension:0.3, pointRadius:4, fill:false, spanGaps:true},
          {label:'سعر بيع MD45', data:MFG_P45,
           borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,0.06)',
           borderWidth:2.5, tension:0.3, pointRadius:4, fill:false, spanGaps:true},
          {label:'تكلفة MD75/طن', data:MFG_A75,
           borderColor:'#4a9eda', backgroundColor:'transparent',
           borderWidth:1.5, borderDash:[5,4], tension:0.3, pointRadius:3,
           pointStyle:'triangle', spanGaps:false},
          {label:'تكلفة MD45/طن', data:MFG_A45,
           borderColor:'#f5a623', backgroundColor:'transparent',
           borderWidth:1.5, borderDash:[5,4], tension:0.3, pointRadius:3,
           pointStyle:'triangle', spanGaps:false},
          {label:'كويل 10مم (مدخل)', data:MFG_COIL10,
           borderColor:'rgba(167,139,250,0.7)', backgroundColor:'transparent',
           borderWidth:1.5, borderDash:[3,5], tension:0.3, pointRadius:3, spanGaps:true},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>i.raw?`${i.dataset.label}: ${i.raw.toLocaleString('ar-SA')} ر.س/طن`:''}}
        },
        scales:{...CO.scales,
          y:{...CO.scales.y, suggestedMin:1300,
            ticks:{...CO.scales.y.ticks, callback:v=>v.toLocaleString('ar-SA')}
          }
        }
      }
    });
  }

  // ── Chart 4 & 5: Production vs Sales gap (MD75 + MD45) ───────────────────
  ['75','45'].forEach(prd => {
    const ctx = document.getElementById(`mfg-c-gap${prd}`);
    if (!ctx) return;
    const pq  = prd==='75' ? MFG_PQ75 : MFG_PQ45;
    const sq  = prd==='75' ? MFG_SQ75 : MFG_SQ45;
    const gap = MFG_MONTHS.map((_,i) => +(sq[i]-pq[i]).toFixed(1));
    const col = prd==='75' ? '#4a9eda' : '#f5a623';
    const colA= prd==='75' ? 'rgba(74,158,218,0.7)' : 'rgba(245,166,35,0.7)';
    MFG_CHARTS['gap'+prd] = new Chart(ctx, {
      type:'bar',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'مُنتَج (طن)',  data:pq, backgroundColor:'rgba(74,218,142,0.55)', stack:'s'},
          {label:'مُباع (طن)',   data:sq.map(v=>-v), backgroundColor:colA, stack:'s'},
          {label:'الفجوة (مُباع−مُنتَج)', data:gap, type:'line',
           borderColor:'#ff6b6b', backgroundColor:'transparent',
           borderWidth:2, pointRadius:5, tension:0.3, order:0,
           pointBackgroundColor:gap.map(v=>v>0?'#4ada8e':'#da4a4a')},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${Math.abs(i.raw).toFixed(1)} طن`}}
        },
        scales:{...CO.scales,
          x:{...CO.scales.x, stacked:true},
          y:{...CO.scales.y, stacked:true,
            ticks:{...CO.scales.y.ticks, callback:v=>Math.abs(v)+''}
          }
        }
      }
    });
  });

  // ── Chart 6: Batch cost efficiency ───────────────────────────────────────
  const bCtx = document.getElementById('mfg-c-batch');
  if (bCtx) {
    const _batchCost = MFG_BCT.map((b,i) => b>0 ? Math.round(MFG_INP[i]/b) : null);
    MFG_CHARTS.batch = new Chart(bCtx, {
      type:'bar',
      data:{
        labels: MFG_MONTHS,
        datasets:[
          {label:'تكلفة/دفعة (ر.س)', data:_batchCost,
           backgroundColor: _batchCost.map(v=>
             !v?'transparent': v>80000?'rgba(218,74,74,0.8)': v>50000?'rgba(245,166,35,0.8)':'rgba(74,158,218,0.75)'
           ),
           borderRadius:4},
          {label:'عدد الدفعات', data:MFG_BCT, type:'line',
           borderColor:'rgba(74,218,142,0.7)', backgroundColor:'transparent',
           borderWidth:2, pointRadius:4, tension:0.3, yAxisID:'y2'},
        ]
      },
      options:{...CO,
        plugins:{...CO.plugins,
          tooltip:{callbacks:{label:i=>
            i.dataset.yAxisID==='y2'
              ? `${i.dataset.label}: ${i.raw} دفعة`
              : `${i.dataset.label}: ${i.raw?i.raw.toLocaleString('ar-SA'):'—'} ر.س`
          }}
        },
        scales:{...CO.scales,
          y:{...CO.scales.y, ticks:{...CO.scales.y.ticks,callback:v=>(v/1e3).toFixed(0)+'ك'}},
          y2:{position:'left', ticks:{color:'#4ada8e',font:{size:9},callback:v=>v+''},
              grid:{display:false}}
        }
      }
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════

init();