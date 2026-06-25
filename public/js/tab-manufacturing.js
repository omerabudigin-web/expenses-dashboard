'use strict';

// ── Module state ──────────────────────────────────────────────────────────────
let _mfgData      = null;
let _mfgAutoTimer = null;
let _mfgCountdown = 0;
let _mfgCharts    = {};
const MFG_REFRESH_SEC = 60;

function _mfgIsActive()   { return !!document.querySelector('.tab.active[data-tab="manufacturing"]'); }
function _mfgStopAuto()   { if (_mfgAutoTimer) { clearInterval(_mfgAutoTimer); _mfgAutoTimer = null; } }
function _mfgDestroyCharts() {
  Object.values(_mfgCharts).forEach(c => { try { c.destroy(); } catch(_){} });
  _mfgCharts = {};
}
function _mfgStartAuto() {
  _mfgStopAuto();
  _mfgCountdown = MFG_REFRESH_SEC;
  _mfgAutoTimer = setInterval(() => {
    if (!_mfgIsActive()) { _mfgStopAuto(); return; }
    _mfgCountdown--;
    const el = document.getElementById('mfg-status');
    if (el) el.textContent = `تحديث تلقائي خلال ${_mfgCountdown}ث`;
    if (_mfgCountdown <= 0) { _mfgCountdown = MFG_REFRESH_SEC; renderManufacturing(); }
  }, 1000);
}

const _mN  = v => (v != null && !isNaN(+v)) ? Math.round(+v).toLocaleString('ar-SA') : '—';
const _mM  = v => (v / 1e6).toFixed(2) + ' م';
const _mK  = v => (v / 1e3).toFixed(0) + ' ك';
const _mRB = i  => i % 2 === 0 ? 'background:#0a1928' : 'background:#0d2035';
const _mGC = v  => v === null ? '#5a7a9a' : v < 0 ? '#da4a4a' : v > 900 ? '#4ada8e' : '#b0d080';
const _mPC = v  => v === null ? 'color:#5a7a9a' : `color:${v < 30 ? '#da4a4a' : v >= 40 ? '#4ada8e' : '#e0c060'};font-size:.72rem`;

// ── Excel export ──────────────────────────────────────────────────────────────
async function mfgExportExcel() {
  if (!_mfgData || !window.ExcelJS) return;
  const d = _mfgData;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Expenses Dashboard';

  const ws1 = wb.addWorksheet('الإنتاج الشهري');
  ws1.addRow(['الشهر','دفعات','تكلفة الإدخال (ر.س)','MD75 طن','MD75 تكلفة','MD45 طن','MD45 تكلفة','مشرشر طن','مشرشر تكلفة']);
  d.monthly.forEach(m => ws1.addRow([
    m.label, m.batches, m.rmiCost,
    m.md75.prodQty, m.md75.prodCost,
    m.md45.prodQty, m.md45.prodCost,
    m.sh.prodQty,   m.sh.prodCost,
  ]));

  const ws2 = wb.addWorksheet('المبيعات والهوامش');
  ws2.addRow(['الشهر',
    'MD75 طن','MD75 إيراد','MD75 سعر/طن','MD75 هامش%',
    'MD45 طن','MD45 إيراد','MD45 سعر/طن','MD45 هامش%',
    'مشرشر طن','مشرشر إيراد','مشرشر سعر/طن','مشرشر هامش%',
  ]);
  d.monthly.forEach(m => ws2.addRow([
    m.label,
    m.md75.saleQty, m.md75.revenue, m.md75.avgPrice ?? '', m.md75.marginPct ?? '',
    m.md45.saleQty, m.md45.revenue, m.md45.avgPrice ?? '', m.md45.marginPct ?? '',
    m.sh.saleQty,   m.sh.revenue,   m.sh.avgPrice   ?? '', m.sh.marginPct   ?? '',
  ]));

  const ws3 = wb.addWorksheet('ملخص الفترة');
  ws3.addRow(['المؤشر','MD75','MD45','مشرشر']);
  ws3.addRow(['كمية الإنتاج (طن)',         d.md75.totalProdQty,    d.md45.totalProdQty,    d.sh.totalProdQty]);
  ws3.addRow(['متوسط تكلفة الإنتاج (ر.س/طن)', d.md75.avgCostPerTon, d.md45.avgCostPerTon, d.sh.avgCostPerTon]);
  ws3.addRow(['متوسط سعر البيع (ر.س/طن)',   d.md75.avgPricePerTon,  d.md45.avgPricePerTon,  d.sh.avgPricePerTon]);
  ws3.addRow(['هامش المادة %',               d.md75.marginPct,       d.md45.marginPct,       d.sh.marginPct]);
  ws3.addRow([]);
  const s = d.summary;
  [
    ['إجمالي الدفعات',                   s.totalBatches],
    ['إجمالي مدخلات التصنيع (طن)',        s.totalRmiQty],
    ['متوسط سعر الكويل الفترة (ر.س/طن)', s.avgCoilPrice],
    ['سعر كويل 10مم الأحدث (ر.س/طن)',   s.latestCoil10],
    ['معامل التخصيص F75',                s.f75],
    ['معامل التخصيص F45',                s.f45],
    ['سعر تعادل MD75 (ر.س/طن كويل)',    s.bep75],
    ['سعر تعادل MD45 (ر.س/طن كويل)',    s.bep45],
  ].forEach(r => ws3.addRow(r));

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `mfg-analysis-${s.dataAsOf}.xlsx`;
  a.click();
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function renderManufacturing() {
  const wrap = document.getElementById('tab-manufacturing');
  if (!wrap) return;

  const prev = document.getElementById('mfg-status');
  if (prev) prev.textContent = 'جاري التحميل...';
  _mfgDestroyCharts();

  try {
    const res  = await fetch('/api/manufacturing');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    _mfgData   = data;
    _mfgBuildAll(data, wrap);
    _mfgStartAuto();
  } catch (err) {
    wrap.innerHTML = `<div style="color:#da4a4a;padding:20px">خطأ في تحميل البيانات: ${err.message}</div>`;
    console.error('[renderManufacturing]', err);
  }
}

// ── Core render ───────────────────────────────────────────────────────────────
function _mfgBuildAll(d, wrap) {
  const { monthly, md75, md45, sh, summary } = d;

  // ── Derived totals ────────────────────────────────────────────────────────
  const T_BATS      = summary.totalBatches;
  const T_INP       = summary.totalRmiCost;
  const T_REV       = md75.totalRevenue + md45.totalRevenue + sh.totalRevenue;
  const T_PROD      = md75.totalProdQty  + md45.totalProdQty  + sh.totalProdQty;
  const T_ALLOC     = md75.totalProdCost + md45.totalProdCost + sh.totalProdCost;
  const AVG_BATCH_V = T_BATS > 0 ? T_INP / T_BATS : 0;

  const AVG_P75 = md75.avgPricePerTon;  const AVG_A75 = md75.avgCostPerTon;
  const AVG_P45 = md45.avgPricePerTon;  const AVG_A45 = md45.avgCostPerTon;
  const AVG_PSH = sh.avgPricePerTon;    const AVG_ASH = sh.avgCostPerTon;
  const MRG_75  = md75.marginPerTon;    const MRG_45  = md45.marginPerTon;
  const MRG_SH  = sh.marginPerTon;

  const F75 = summary.f75;   const BEP_75 = summary.bep75;
  const F45 = summary.f45;   const BEP_45 = summary.bep45;
  const AVG_COIL    = summary.avgCoilPrice;
  const LATEST_C10  = summary.latestCoil10;

  // ── Monthly arrays for charts ─────────────────────────────────────────────
  const labels       = monthly.map(m => m.shortLbl);
  const m75_prodQty  = monthly.map(m => m.md75.prodQty);
  const m45_prodQty  = monthly.map(m => m.md45.prodQty);
  const mSH_prodQty  = monthly.map(m => m.sh.prodQty);
  const m75_avgCost  = monthly.map(m => m.md75.avgCost);
  const m45_avgCost  = monthly.map(m => m.md45.avgCost);
  const m75_saleQty  = monthly.map(m => m.md75.saleQty);
  const m45_saleQty  = monthly.map(m => m.md45.saleQty);
  const m75_revenue  = monthly.map(m => m.md75.revenue);
  const m45_revenue  = monthly.map(m => m.md45.revenue);
  const mSH_revenue  = monthly.map(m => m.sh.revenue);
  const m75_avgPrice = monthly.map(m => m.md75.avgPrice);
  const m45_avgPrice = monthly.map(m => m.md45.avgPrice);
  const m75_mgPct    = monthly.map(m => m.md75.marginPct);
  const m45_mgPct    = monthly.map(m => m.md45.marginPct);
  const mSH_mgPct    = monthly.map(m => m.sh.marginPct);
  const coil10       = monthly.map(m => m.coil10);
  const rmiCost      = monthly.map(m => m.rmiCost);
  const batches      = monthly.map(m => m.batches);

  // ── Min/max for cost chain ────────────────────────────────────────────────
  const _minOf = arr => { const v = arr.filter(x => x != null); return v.length ? Math.min(...v) : null; };
  const _maxOf = arr => { const v = arr.filter(x => x != null); return v.length ? Math.max(...v) : null; };
  const minC10 = _minOf(coil10);  const maxC10 = _maxOf(coil10);
  const min75C = _minOf(m75_avgCost);  const max75C = _maxOf(m75_avgCost);
  const min45C = _minOf(m45_avgCost);  const max45C = _maxOf(m45_avgCost);
  const minShC = _minOf(monthly.map(m => m.sh.avgCost));
  const min75P = _minOf(m75_avgPrice); const max75P = _maxOf(m75_avgPrice);
  const min45P = _minOf(m45_avgPrice); const max45P = _maxOf(m45_avgPrice);
  const minShP = _minOf(monthly.map(m => m.sh.avgPrice));
  const maxShP = _maxOf(monthly.map(m => m.sh.avgPrice));

  // ── Best month (highest combined md75+md45 margin%) ───────────────────────
  const bestIdx = monthly.reduce((bi, m, i) => {
    const v75 = m.md75.marginPct, v45 = m.md45.marginPct;
    if (v75 == null || v45 == null) return bi;
    const sum = v75 + v45;
    const bs  = monthly[bi].md75.marginPct;
    const bs2 = monthly[bi].md45.marginPct;
    return (bs == null || bs2 == null || sum > bs + bs2) ? i : bi;
  }, 0);
  const bestMo = monthly[bestIdx];

  // ── Insight: مشرشر below-cost months ─────────────────────────────────────
  const shBelowCost = monthly.filter(m => m.sh.marginPct !== null && m.sh.marginPct < 0);

  // ── Coil price surge detection ────────────────────────────────────────────
  const coilSurge = LATEST_C10 > 0 && AVG_COIL > 0 ? ((LATEST_C10 - AVG_COIL) / AVG_COIL * 100) : 0;

  // ── Sensitivity analysis ──────────────────────────────────────────────────
  const sensPts = [...new Set([
    minC10 ? Math.round(minC10 / 50) * 50 : null,
    Math.round(AVG_COIL / 50) * 50,
    Math.round((AVG_COIL + LATEST_C10) / 2 / 50) * 50,
    LATEST_C10,
    BEP_75,
    Math.round(LATEST_C10 * 1.12 / 50) * 50,
  ].filter(Boolean))].sort((a, b) => a - b);

  const sensRows = sensPts.map(c => {
    const a75 = Math.round(c * F75), a45 = Math.round(c * F45);
    const m75  = AVG_P75 - a75, m45 = AVG_P45 - a45;
    const p75  = (m75 / AVG_P75 * 100).toFixed(1), p45 = (m45 / AVG_P45 * 100).toFixed(1);
    const gc   = v => v < 0 ? '#da4a4a' : v < 200 ? '#e0c060' : v < 500 ? '#b0d080' : '#4ada8e';
    const isCur = c === Math.round(AVG_COIL / 50) * 50;
    const isLat = c === LATEST_C10;
    const isBep = c === BEP_75;
    const rowStyle = isCur ? 'background:#0d2040;outline:1px solid #2a5a9a' :
                     isBep ? 'background:#200a0a;outline:1px solid #7a2a2a' : '';
    const tag = isCur ? '⭐ متوسط الفترة' : isLat ? '⚠️ أحدث سعر' : isBep ? '🔴 تعادل MD75' :
                (minC10 && c === Math.round(minC10 / 50) * 50) ? 'أدنى فعلي' : '';
    return `<tr style="${rowStyle}">
      <td style="font-weight:700;color:#c8d8e8;text-align:right">${_mN(c)} ر.س/طن</td>
      <td style="text-align:right"><span style="font-size:.72rem;color:#708090">${tag}</span></td>
      <td class="num" style="color:#4a9eda">${_mN(a75)}</td>
      <td class="num" style="color:${gc(m75)};font-weight:700">${m75 >= 0 ? '+' : ''}${_mN(m75)}</td>
      <td class="num" style="color:${gc(m75)};font-weight:700">${p75}%</td>
      <td class="num" style="color:#f5a623">${_mN(a45)}</td>
      <td class="num" style="color:${gc(m45)};font-weight:700">${m45 >= 0 ? '+' : ''}${_mN(m45)}</td>
      <td class="num" style="color:${gc(m45)};font-weight:700">${p45}%</td>
    </tr>`;
  }).join('');

  // ── Production table rows ─────────────────────────────────────────────────
  const prodRows = monthly.map((m, i) => `<tr style="${_mRB(i)}">
    <td style="font-weight:600;color:#c8d8e8;white-space:nowrap">${m.shortLbl}${m.partial ? ' *' : ''}</td>
    <td class="num" style="color:#5a7a9a">${m.batches}</td>
    <td class="num" style="color:#7090b0">${m.rmiCost > 0 ? _mK(m.rmiCost) + ' ك' : '—'}</td>
    <td class="num" style="color:#4a9eda">${m.md75.prodQty > 0 ? m.md75.prodQty.toFixed(1) : '—'}</td>
    <td class="num" style="color:#3a7aaa;border-right:1px solid #1e3a5f">${m.md75.prodCost > 0 ? (m.md75.prodCost / 1e3).toFixed(0) + ' ك' : '—'}</td>
    <td class="num" style="color:#f5a623">${m.md45.prodQty > 0 ? m.md45.prodQty.toFixed(1) : '—'}</td>
    <td class="num" style="color:#c08020;border-right:1px solid #1e3a5f">${m.md45.prodCost > 0 ? (m.md45.prodCost / 1e3).toFixed(0) + ' ك' : '—'}</td>
    <td class="num" style="color:#4ada8e">${m.sh.prodQty > 0 ? m.sh.prodQty.toFixed(1) : '—'}</td>
    <td class="num" style="color:#30a870">${m.sh.prodCost > 0 ? (m.sh.prodCost / 1e3).toFixed(0) + ' ك' : '—'}</td>
    <td class="num" style="color:${m.sh.avgCost != null ? (m.sh.avgCost > 2500 ? '#f08080' : '#4ada8e') : '#5a7a9a'};font-weight:600">${m.sh.avgCost != null ? _mN(m.sh.avgCost) : '—'}</td>
  </tr>`).join('');

  // ── Sales table rows ──────────────────────────────────────────────────────
  const salesRows = monthly.map((m, i) => {
    const rev  = m.md75.revenue + m.md45.revenue + m.sh.revenue;
    const flag = (m.sh.marginPct !== null && m.sh.marginPct < 0) ? ' 🚨' : '';
    return `<tr style="${_mRB(i)}">
      <td style="font-weight:600;color:#c8d8e8;white-space:nowrap">${m.shortLbl}${m.partial ? ' *' : ''}</td>
      <td class="num">${m.md75.saleQty > 0 ? m.md75.saleQty.toFixed(1) : '—'}</td>
      <td class="num" style="color:#4a9eda">${m.md75.avgPrice != null ? _mN(m.md75.avgPrice) : '—'}</td>
      <td class="num" style="color:${_mGC(m.md75.marginAmt)};font-weight:600">${m.md75.marginAmt != null ? (m.md75.marginAmt >= 0 ? '+' : '') + _mN(m.md75.marginAmt) : '—'}</td>
      <td class="num" style="${_mPC(m.md75.marginPct)}">${m.md75.marginPct != null ? m.md75.marginPct + '%' : '—'}</td>
      <td class="num" style="border-right:1px solid #1e3a5f"></td>
      <td class="num">${m.md45.saleQty > 0 ? m.md45.saleQty.toFixed(1) : '—'}</td>
      <td class="num" style="color:#f5a623">${m.md45.avgPrice != null ? _mN(m.md45.avgPrice) : '—'}</td>
      <td class="num" style="color:${_mGC(m.md45.marginAmt)};font-weight:600">${m.md45.marginAmt != null ? (m.md45.marginAmt >= 0 ? '+' : '') + _mN(m.md45.marginAmt) : '—'}</td>
      <td class="num" style="${_mPC(m.md45.marginPct)}">${m.md45.marginPct != null ? m.md45.marginPct + '%' : '—'}</td>
      <td class="num" style="border-right:1px solid #1e3a5f"></td>
      <td class="num" style="color:#4ada8e">${m.sh.saleQty > 0 ? m.sh.saleQty.toFixed(1) : '—'}</td>
      <td class="num" style="color:#4ada8e">${m.sh.avgPrice != null ? _mN(m.sh.avgPrice) : '—'}</td>
      <td class="num" style="color:${_mGC(m.sh.marginAmt)};font-weight:600;border-right:1px solid #1e3a5f">${m.sh.marginAmt != null ? (m.sh.marginAmt >= 0 ? '+' : '') + _mN(m.sh.marginAmt) + flag : '—'}</td>
      <td class="num" style="font-weight:700;color:#a0c4e8">${rev > 0 ? _mN(rev) + ' ر.س' : '—'}</td>
    </tr>`;
  }).join('');

  // ── Dynamic insight cards ─────────────────────────────────────────────────
  const higherMrgGrp   = md75.marginPct >= md45.marginPct ? 'MD75' : 'MD45';
  const lowerMrgGrp    = higherMrgGrp === 'MD75' ? 'MD45' : 'MD75';
  const higherMrgPct   = Math.max(md75.marginPct, md45.marginPct).toFixed(1);
  const lowerMrgPct    = Math.min(md75.marginPct, md45.marginPct).toFixed(1);
  const higherMrgColor = higherMrgGrp === 'MD75' ? '#4a9eda' : '#f5a623';
  const lowerMrgColor  = lowerMrgGrp  === 'MD75' ? '#4a9eda' : '#f5a623';

  const bestMo75 = bestMo ? bestMo.md75.marginPct : null;
  const bestMo45 = bestMo ? bestMo.md45.marginPct : null;
  const bestMo75C = monthly[bestIdx]?.md75.avgCost ?? null;
  const bestMoC10 = monthly[bestIdx]?.coil10 ?? null;

  const insightCard3Border = coilSurge > 15 ? '#ff6b6b' : '#e0c060';
  const insightCard3Color  = coilSurge > 15 ? '#ff8080' : '#e0c060';
  const insightCard3Title  = coilSurge > 15 ? `⚠️ ضغط: الكويل 10مم ارتفع ${coilSurge.toFixed(0)}% عن المتوسط` : `📊 سعر الكويل 10مم الحالي`;
  const projMrg75 = AVG_P75 > 0 ? ((AVG_P75 - LATEST_C10 * F75) / AVG_P75 * 100).toFixed(1) : null;

  const insightCard4 = shBelowCost.length > 0 ? `
    <div class="insight-card" style="border-color:#e0c060">
      <div style="font-size:.82rem;font-weight:700;color:#e0c060;margin-bottom:6px">
        🚨 مشرشر — بيع بأقل من التكلفة
      </div>
      <div style="font-size:.78rem;color:#a09040;line-height:1.7">
        ${shBelowCost.map(m =>
          `${m.shortLbl}: تكلفة <strong style="color:#ff8080">${_mN(m.sh.avgCost)} ر.س/طن</strong>
          مقابل بيع <strong style="color:#e0c060">${_mN(m.sh.avgPrice)} ر.س/طن</strong>
          → خسارة <strong style="color:#ff6b6b">${_mN(m.sh.marginAmt)} ر.س/طن</strong>.`
        ).join('<br>')}
        مراجعة عقد البيع ضرورية.
      </div>
    </div>` : `
    <div class="insight-card" style="border-color:#e0c060">
      <div style="font-size:.82rem;font-weight:700;color:#e0c060;margin-bottom:6px">
        ⚡ متوسط تكلفة الدفعة
      </div>
      <div style="font-size:.78rem;color:#a09040;line-height:1.7">
        ${T_BATS} دفعة بمتوسط <strong style="color:#e0c060">${_mK(AVG_BATCH_V)} ك ر.س/دفعة</strong>.
        إجمالي مدخلات التصنيع <strong style="color:#a0c4e8">${_mM(T_INP)} ر.س</strong>.
      </div>
    </div>`;

  // ── Full HTML ─────────────────────────────────────────────────────────────
  wrap.innerHTML = `
  <style>
    #tab-manufacturing .insight-card{background:#0c1e30;border-radius:9px;padding:14px 16px;border-right:4px solid #3a7abf;position:relative;overflow:hidden}
    #tab-manufacturing .insight-card::after{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,rgba(255,255,255,.02),transparent);pointer-events:none}
    #tab-manufacturing .mfg-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:.72rem;font-weight:700;vertical-align:middle}
    #tab-manufacturing .section-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#3a6a8a;margin-bottom:8px;font-weight:600}
    #tab-manufacturing tbody tr:hover td{background:#162840!important}
    #tab-manufacturing tbody tr:hover td:first-child{box-shadow:inset 3px 0 0 #4a9eda!important}
  </style>

  <!-- ═══ HEADER ═══════════════════════════════════════════════════════════ -->
  <div style="background:linear-gradient(135deg,#060f1e,#0d1e38,#060f1e);border:1px solid #1e3a5f;
    border-top:3px solid #4a9eda;border-radius:10px;padding:18px 24px;margin-bottom:20px;
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="font-size:2.4rem;filter:drop-shadow(0 0 8px rgba(74,158,218,0.4))">🏭</div>
      <div>
        <div style="font-size:1.05rem;font-weight:700;color:#e8f4ff">
          تحليل P&L التصنيع — حركة التكاليف من المواد الخام إلى البيع
        </div>
        <div style="font-size:.75rem;color:#5a8aaa;margin-top:4px">
          ${summary.startDate} → ${summary.dataAsOf} · ${T_BATS} دفعة · مصنع حوراء · هامش مواد فقط (بدون رواتب واستهلاك)
        </div>
      </div>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">إيراد إجمالي</div>
        <div style="font-size:1.1rem;font-weight:700;color:#4ada8e">${_mM(T_REV)} ر.س</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">تكلفة مدخلات</div>
        <div style="font-size:1.1rem;font-weight:700;color:#a0c4e8">${_mM(T_INP)} ر.س</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:.7rem;color:#4a7aaa">متوسط الدفعة</div>
        <div style="font-size:1.1rem;font-weight:700;color:#e0c060">${_mK(AVG_BATCH_V)} ك ر.س</div>
      </div>
      <div style="display:flex;gap:8px">
        <span id="mfg-status" style="font-size:.73rem;color:#5a7a9a;align-self:center"></span>
        <button onclick="renderManufacturing()" style="padding:5px 10px;background:#1a2d40;border:1px solid #2a4060;color:#8aa8cc;border-radius:5px;cursor:pointer;font-size:.76rem">↻ تحديث</button>
        <button onclick="mfgExportExcel()" style="padding:5px 10px;background:#1a2d40;border:1px solid #2a4060;color:#8aa8cc;border-radius:5px;cursor:pointer;font-size:.76rem">📊 Excel</button>
      </div>
    </div>
  </div>

  <!-- ═══ KPIs ══════════════════════════════════════════════════════════════ -->
  <div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(185px,1fr));margin-bottom:20px">
    <div class="kpi" style="--accent:#4a9eda;background:linear-gradient(135deg,#0a1e35,#0f2035)">
      <div class="lbl">MD75 — هامش المادة</div>
      <div class="val" style="color:#4a9eda">+${_mN(MRG_75)} ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#0d2a40;color:#4a9eda">${md75.marginPct.toFixed(1)}%</span>
        <span style="font-size:.7rem;color:#4a7a9a;margin-right:6px">· متوسط سعر ${_mN(AVG_P75)}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#f5a623;background:linear-gradient(135deg,#1a1008,#1e1208)">
      <div class="lbl">MD45 — هامش المادة</div>
      <div class="val" style="color:#f5a623">+${_mN(MRG_45)} ر.س/طن</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#2a1a08;color:#f5a623">${md45.marginPct.toFixed(1)}%</span>
        <span style="font-size:.7rem;color:#8a6a30;margin-right:6px">· متوسط سعر ${_mN(AVG_P45)}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#4ada8e;background:linear-gradient(135deg,#081a10,#0a1e12)">
      <div class="lbl">أفضل شهر للهامش المزدوج</div>
      <div class="val" style="color:#4ada8e">${bestMo ? bestMo.shortLbl : '—'}</div>
      <div style="margin-top:6px">
        <span class="mfg-badge" style="background:#0d2a18;color:#4ada8e">MD75 ${bestMo75 != null ? bestMo75 + '%' : '—'}</span>
        <span class="mfg-badge" style="background:#2a1a08;color:#f5a623;margin-right:4px">MD45 ${bestMo45 != null ? bestMo45 + '%' : '—'}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#a78bfa;background:linear-gradient(135deg,#10081e,#120a20)">
      <div class="lbl">إجمالي كمية الإنتاج</div>
      <div class="val" style="color:#c8a8ff">${_mN(Math.round(T_PROD))} طن</div>
      <div style="margin-top:6px;font-size:.72rem;color:#6a5a9a">
        MD75 ${T_PROD > 0 ? (md75.totalProdQty / T_PROD * 100).toFixed(0) : 0}% ·
        MD45 ${T_PROD > 0 ? (md45.totalProdQty / T_PROD * 100).toFixed(0) : 0}% ·
        مشرشر ${T_PROD > 0 ? (sh.totalProdQty / T_PROD * 100).toFixed(0) : 0}%
      </div>
    </div>
    <div class="kpi" style="--accent:${coilSurge > 15 ? '#ff6b6b' : '#e0c060'};background:linear-gradient(135deg,${coilSurge > 15 ? '#1e0808,#200a0a' : '#1a1400,#1e1800'})">
      <div class="lbl">كويل 10مم — آخر سعر</div>
      <div class="val" style="color:${coilSurge > 15 ? '#ff8080' : '#e0c060'}">${_mN(LATEST_C10)} ر.س/طن</div>
      <div style="margin-top:6px">
        ${coilSurge > 5 ? `<span class="mfg-badge" style="background:${coilSurge > 15 ? '#3a1010' : '#2a2000'};color:${coilSurge > 15 ? '#ff6b6b' : '#e0c060'}">+${coilSurge.toFixed(0)}% عن المتوسط</span>` : ''}
        <span style="font-size:.7rem;color:#8a7830;margin-right:6px">متوسط الفترة ${_mN(AVG_COIL)}</span>
      </div>
    </div>
    <div class="kpi" style="--accent:#e0c060;background:linear-gradient(135deg,#1a1400,#1e1800)">
      <div class="lbl">متوسط تكلفة الدفعة</div>
      <div class="val" style="color:#e0c060">${_mK(AVG_BATCH_V)} ك ر.س</div>
      <div style="font-size:.72rem;color:#8a7830;margin-top:6px">${T_BATS} دفعة · إجمالي ${_mM(T_INP)} ر.س</div>
    </div>
  </div>

  <!-- ═══ KEY INSIGHTS ══════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="section-label">رؤى مالية رئيسية</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="insight-card" style="border-color:${higherMrgColor}">
        <div style="font-size:.82rem;font-weight:700;color:${higherMrgColor};margin-bottom:6px">
          🏆 ${higherMrgGrp} أعلى ربحية على الفترة الكاملة
        </div>
        <div style="font-size:.78rem;color:#8ab0a0;line-height:1.7">
          هامش ${higherMrgGrp} <strong style="color:${higherMrgColor}">${higherMrgPct}%</strong>
          يتجاوز ${lowerMrgGrp} <strong style="color:${lowerMrgColor}">${lowerMrgPct}%</strong>.
          الفارق ${(parseFloat(higherMrgPct) - parseFloat(lowerMrgPct)).toFixed(1)} نقطة مئوية.
        </div>
      </div>
      <div class="insight-card" style="border-color:#4a9eda">
        <div style="font-size:.82rem;font-weight:700;color:#4a9eda;margin-bottom:6px">
          📈 ${bestMo ? bestMo.label : '—'} — أفضل شهر مزدوج
        </div>
        <div style="font-size:.78rem;color:#8090a8;line-height:1.7">
          تصاعد هامش المنتجين معاً:
          MD75 <strong style="color:#4a9eda">${bestMo75 != null ? bestMo75 + '%' : '—'}</strong> و
          MD45 <strong style="color:#f5a623">${bestMo45 != null ? bestMo45 + '%' : '—'}</strong>.
          ${bestMoC10 ? `سعر كويل ${_mN(bestMoC10)} ر.س/طن · تكلفة MD75 ${_mN(bestMo75C)}.` : ''}
        </div>
      </div>
      <div class="insight-card" style="border-color:${insightCard3Border}">
        <div style="font-size:.82rem;font-weight:700;color:${insightCard3Color};margin-bottom:6px">
          ${insightCard3Title}
        </div>
        <div style="font-size:.78rem;color:#a09040;line-height:1.7">
          كويل 10مم الآن <strong style="color:${insightCard3Color}">${_mN(LATEST_C10)} ر.س/طن</strong>
          مقابل متوسط الفترة <strong style="color:#a0c4e8">${_mN(AVG_COIL)} ر.س/طن</strong>.
          ${projMrg75 ? `إذا ثبتت أسعار البيع — هامش MD75 المتوقع <strong style="color:${parseFloat(projMrg75) < 30 ? '#da4a4a' : '#4ada8e'}">${projMrg75}%</strong>.` : ''}
        </div>
      </div>
      ${insightCard4}
    </div>
  </div>

  <!-- ═══ MARGIN % CHART ════════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">📉 هامش المواد الشهري % — MD75 · MD45 · مشرشر
      <span style="font-size:.75rem;color:#5a8aaa;font-weight:400;margin-right:12px">(سعر البيع − التكلفة المخصصة) ÷ سعر البيع</span>
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

  <!-- ═══ SENSITIVITY ANALYSIS ═════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">🎯 تحليل الحساسية — تأثير سعر الكويل على هامش المادة
      <span style="font-size:.75rem;color:#5a8aaa;font-weight:400;margin-right:12px">(بثبات أسعار البيع: MD75=${_mN(AVG_P75)} · MD45=${_mN(AVG_P45)} ر.س/طن)</span>
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
        <div style="font-size:1.05rem;font-weight:700;color:#ff8080">${_mN(BEP_75)} ر.س/طن</div>
        <div style="font-size:.7rem;color:#606070;margin-top:2px">فجوة عن أحدث سعر: +${_mN(BEP_75 - LATEST_C10)} ر.س/طن</div>
      </div>
      <div style="background:#0a1e30;border:1px solid #1e3a5f;border-right:3px solid #f5a623;border-radius:7px;padding:10px 16px">
        <div style="font-size:.72rem;color:#8090a0;margin-bottom:3px">🟠 سعر تعادل MD45</div>
        <div style="font-size:1.05rem;font-weight:700;color:#f5a623">${_mN(BEP_45)} ر.س/طن</div>
        <div style="font-size:.7rem;color:#606070;margin-top:2px">فجوة عن أحدث سعر: +${_mN(BEP_45 - LATEST_C10)} ر.س/طن</div>
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

  <!-- ═══ PRODUCTION vs SALES GAP ══════════════════════════════════════════ -->
  <div class="grid2" style="margin-bottom:18px">
    <div class="card">
      <div class="card-title">📦 MD75 — إنتاج vs مبيعات شهرياً (طن)</div>
      <div class="chart-wrap" style="height:240px"><canvas id="mfg-c-gap75"></canvas></div>
      <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">خط الفجوة: موجب = مخزون يُستنزف · سالب = مخزون يتراكم</div>
    </div>
    <div class="card">
      <div class="card-title">📦 MD45 — إنتاج vs مبيعات شهرياً (طن)</div>
      <div class="chart-wrap" style="height:240px"><canvas id="mfg-c-gap45"></canvas></div>
      <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">الفجوة الإيجابية = مبيعات تتجاوز الإنتاج (استنزاف مخزون)</div>
    </div>
  </div>

  <!-- ═══ BATCH EFFICIENCY ══════════════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">⚡ كفاءة الدفعات — متوسط تكلفة الدفعة الواحدة شهرياً (ر.س/دفعة)</div>
    <div class="chart-wrap" style="height:210px"><canvas id="mfg-c-batch"></canvas></div>
    <div style="font-size:.72rem;color:#4a6a8a;margin-top:6px">
      الأشهر ذات الدفعات الكبيرة القيمة قد تعكس تحميل مواد خام إضافية.
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
          <tr style="background:#0a1e30">
            <td style="padding:10px 14px;color:#a0c4e8;font-weight:600;border-bottom:1px solid #1e3a5f">⚙️ إدخال التصنيع</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">RawMaterialIssue — كويل فقط</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700;background:#0d2030">${_mN(Math.round(summary.totalRmiQty))}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">${minC10 ? _mN(minC10) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0ecff;font-weight:700">${_mN(AVG_COIL)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">${maxC10 ? _mN(maxC10) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">—</td>
          </tr>
          <tr style="background:#06121e">
            <td style="padding:10px 14px;color:#4a9eda;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج MD75 (M12)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt · تكلفة مخصصة/طن مُنتَج</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700;background:#0d2030">${_mN(Math.round(md75.totalProdQty))}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">${min75C ? _mN(min75C) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700">${_mN(AVG_A75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">${max75C ? _mN(max75C) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">−${_mN(AVG_COIL - AVG_A75)} (تحويل الوحدات)</td>
          </tr>
          <tr style="background:#0a1808">
            <td style="padding:10px 14px;color:#f5a623;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج MD45 (M6)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt · تكلفة مخصصة/طن مُنتَج</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700;background:#0d2030">${_mN(Math.round(md45.totalProdQty))}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">${min45C ? _mN(min45C) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700">${_mN(AVG_A45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">${max45C ? _mN(max45C) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">−${_mN(AVG_COIL - AVG_A45)} (تحويل الوحدات)</td>
          </tr>
          <tr style="background:#061808">
            <td style="padding:10px 14px;color:#4ada8e;font-weight:600;border-bottom:1px solid #1e3a5f">📦 إنتاج مشرشر</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">FinishedGoodsReceipt — كويل أملس → مشرشر</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700;background:#0d2030">${_mN(Math.round(sh.totalProdQty))}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">${minShC ? _mN(minShC) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">${_mN(AVG_ASH)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">${maxC10 ? _mN(maxC10) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#7090b0">≈ سعر الكويل (لا تحويل وحدات)</td>
          </tr>
          <tr style="background:#061220">
            <td style="padding:10px 14px;color:#4a9eda;font-weight:600;border-bottom:1px solid #1e3a5f">💰 بيع MD75 (M12)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">SalesInvoice · Net · إيراد ${_mN(Math.round(md75.totalRevenue / 1e3))} ك ر.س</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700;background:#0d2030">${_mN(Math.round(md75.totalSaleQty))}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">${min75P ? _mN(min75P) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4a9eda;font-weight:700">${_mN(AVG_P75)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">${max75P ? _mN(max75P) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">+${_mN(MRG_75)} هامش/طن · <span style="background:#0d2a18;padding:1px 7px;border-radius:8px">${md75.marginPct.toFixed(1)}%</span></td>
          </tr>
          <tr style="background:#12100a">
            <td style="padding:10px 14px;color:#f5a623;font-weight:600;border-bottom:1px solid #1e3a5f">💰 بيع MD45 (M6)</td>
            <td style="padding:10px 14px;color:#7090b0;border-bottom:1px solid #1e3a5f">SalesInvoice · Net · إيراد ${_mN(Math.round(md45.totalRevenue / 1e3))} ك ر.س</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700;background:#0d2030">${_mN(Math.round(md45.totalSaleQty))}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e">${min45P ? _mN(min45P) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#f5a623;font-weight:700">${_mN(AVG_P45)}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#e0c060">${max45P ? _mN(max45P) : '—'}</td>
            <td class="num" style="border-bottom:1px solid #1e3a5f;color:#4ada8e;font-weight:700">+${_mN(MRG_45)} هامش/طن · <span style="background:#2a1a08;padding:1px 7px;border-radius:8px">${md45.marginPct.toFixed(1)}%</span></td>
          </tr>
          <tr style="background:#0a1a10">
            <td style="padding:10px 14px;color:#4ada8e;font-weight:600">💰 بيع مشرشر</td>
            <td style="padding:10px 14px;color:#7090b0">SalesInvoice · Net · إيراد ${_mN(Math.round(sh.totalRevenue / 1e3))} ك ر.س</td>
            <td class="num" style="color:#4ada8e;font-weight:700;background:#0d2030">${_mN(Math.round(sh.totalSaleQty))}</td>
            <td class="num" style="color:#4ada8e">${minShP ? _mN(minShP) : '—'}</td>
            <td class="num" style="color:#4ada8e;font-weight:700">${_mN(AVG_PSH)}</td>
            <td class="num" style="color:#e0c060">${maxShP ? _mN(maxShP) : '—'}</td>
            <td class="num" style="color:${MRG_SH >= 0 ? '#4ada8e' : '#da4a4a'};font-weight:700">${MRG_SH >= 0 ? '+' : ''}${_mN(MRG_SH)} هامش/طن</td>
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
            <td class="num" style="color:#9090b0">${_mK(T_INP)} ك ر.س</td>
            <td class="num" style="color:#4a9eda">${_mN(Math.round(md75.totalProdQty))} طن <span style="color:#3a6a9a;font-size:.75rem">(${T_PROD > 0 ? (md75.totalProdQty / T_PROD * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" style="color:#4a9eda;border-right:1px solid #1e3a5f">${_mK(md75.totalProdCost)} ك <span style="color:#3a6a9a;font-size:.75rem">(${T_ALLOC > 0 ? (md75.totalProdCost / T_ALLOC * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" style="color:#f5a623">${_mN(Math.round(md45.totalProdQty))} طن <span style="color:#a07020;font-size:.75rem">(${T_PROD > 0 ? (md45.totalProdQty / T_PROD * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" style="color:#f5a623;border-right:1px solid #1e3a5f">${_mK(md45.totalProdCost)} ك <span style="color:#a07020;font-size:.75rem">(${T_ALLOC > 0 ? (md45.totalProdCost / T_ALLOC * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" style="color:#4ada8e">${_mN(Math.round(sh.totalProdQty))} طن <span style="color:#30a870;font-size:.75rem">(${T_PROD > 0 ? (sh.totalProdQty / T_PROD * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" style="color:#4ada8e">${_mK(sh.totalProdCost)} ك <span style="color:#30a870;font-size:.75rem">(${T_ALLOC > 0 ? (sh.totalProdCost / T_ALLOC * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" style="color:#f5a623;font-weight:700">${_mN(AVG_ASH)}</td>
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
            <td class="num" style="color:#4a9eda">${_mN(Math.round(md75.totalSaleQty))} طن</td>
            <td class="num" style="color:#4a9eda">${_mN(AVG_P75)}</td>
            <td class="num" style="color:#4ada8e">+${_mN(MRG_75)}</td>
            <td class="num" style="color:#4ada8e">${md75.marginPct.toFixed(1)}%</td>
            <td class="num" style="border-right:1px solid #1e3a5f"></td>
            <td class="num" style="color:#f5a623">${_mN(Math.round(md45.totalSaleQty))} طن</td>
            <td class="num" style="color:#f5a623">${_mN(AVG_P45)}</td>
            <td class="num" style="color:#4ada8e">+${_mN(MRG_45)}</td>
            <td class="num" style="color:#4ada8e">${md45.marginPct.toFixed(1)}%</td>
            <td class="num" style="border-right:1px solid #1e3a5f"></td>
            <td class="num" style="color:#4ada8e">${_mN(Math.round(sh.totalSaleQty))} طن</td>
            <td class="num" style="color:#4ada8e">${_mN(AVG_PSH)}</td>
            <td class="num" style="color:${MRG_SH >= 0 ? '#4ada8e' : '#da4a4a'};border-right:1px solid #1e3a5f">${MRG_SH >= 0 ? '+' : ''}${_mN(MRG_SH)}</td>
            <td class="num" style="color:#7090b0">—</td>
          </tr>
          <tr style="font-weight:700;background:#081420;border-top:1px solid #1e3a5f">
            <td style="text-align:right;color:#e0ecff">الإيراد الإجمالي</td>
            <td class="num" colspan="5" style="color:#4a9eda;font-size:.9rem;border-right:1px solid #1e3a5f">${_mN(md75.totalRevenue)} ر.س <span style="color:#3a6a9a;font-size:.75rem">(${T_REV > 0 ? (md75.totalRevenue / T_REV * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" colspan="5" style="color:#f5a623;font-size:.9rem;border-right:1px solid #1e3a5f">${_mN(md45.totalRevenue)} ر.س <span style="color:#a07020;font-size:.75rem">(${T_REV > 0 ? (md45.totalRevenue / T_REV * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" colspan="3" style="color:#4ada8e;font-size:.9rem;border-right:1px solid #1e3a5f">${_mN(sh.totalRevenue)} ر.س <span style="color:#30a870;font-size:.75rem">(${T_REV > 0 ? (sh.totalRevenue / T_REV * 100).toFixed(1) : 0}%)</span></td>
            <td class="num" style="color:#e0ecff;font-size:.95rem;font-weight:800">${_mN(T_REV)} ر.س</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="font-size:.71rem;color:#3a5a7a;margin-top:8px;line-height:1.7">
      هامش/طن = سعر البيع − التكلفة المخصصة (material margin · لا يشمل: رواتب المصنع، استهلاك الآلات، الكهرباء، الإيجار).
    </div>
  </div>

  <div style="font-size:.72rem;color:#3a5070;text-align:left">
    المصادر: RawMaterialIssue · FinishedGoodsReceipt · SalesInvoice — ${summary.dataAsOf} · جميع القيم بدون VAT.
  </div>`;

  // ── Build charts ─────────────────────────────────────────────────────────
  const CO = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position:'top', labels: { color:'#a0b8c8', font:{size:10}, boxWidth:11 } } },
    scales: {
      x: { ticks:{color:'#708090',font:{size:9}},  grid:{color:'rgba(255,255,255,.04)'} },
      y: { ticks:{color:'#708090',font:{size:10}}, grid:{color:'rgba(255,255,255,.06)'} },
    },
  };

  // Chart 1: Monthly Margin %
  const mCtx = document.getElementById('mfg-c-margin');
  if (mCtx) {
    const n = labels.length;
    _mfgCharts.margin = new Chart(mCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'هدف ≥40%',   data:Array(n).fill(40), borderColor:'rgba(74,218,142,0.3)', borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, order:10 },
          { label:'حد أدنى 30%', data:Array(n).fill(30), borderColor:'rgba(218,74,74,0.3)', borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, order:11 },
          { label:'MD75 هامش%', data:m75_mgPct,
            borderColor:'#4a9eda', backgroundColor:'rgba(74,158,218,0.10)',
            borderWidth:3, tension:0.4, pointRadius:6, fill:true, spanGaps:false,
            pointBackgroundColor: m75_mgPct.map(v => v===null?'transparent':v>=40?'#4ada8e':v>=30?'#e0c060':'#da4a4a'),
            pointBorderColor:'#0d1b2a', pointBorderWidth:2 },
          { label:'MD45 هامش%', data:m45_mgPct,
            borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,0.08)',
            borderWidth:3, tension:0.4, pointRadius:6, fill:true, spanGaps:false,
            pointBackgroundColor: m45_mgPct.map(v => v===null?'transparent':v>=40?'#4ada8e':v>=30?'#e0c060':'#da4a4a'),
            pointBorderColor:'#0d1b2a', pointBorderWidth:2 },
          { label:'مشرشر هامش%', data:mSH_mgPct,
            borderColor:'#4ada8e', backgroundColor:'transparent',
            borderWidth:2, borderDash:[5,3], tension:0.3, pointRadius:7, fill:false, spanGaps:false,
            pointBackgroundColor: mSH_mgPct.map(v => v===null?'transparent':v<0?'#da4a4a':'#4ada8e'),
            pointBorderColor:'#0d1b2a', pointBorderWidth:2,
            pointStyle: mSH_mgPct.map(v => v!==null&&v<0?'rectRot':'circle') },
        ],
      },
      options: { ...CO,
        plugins: { ...CO.plugins, tooltip: { callbacks: { label: i => i.raw!==null?`${i.dataset.label}: ${i.raw}%`:'' } } },
        scales: { ...CO.scales,
          y: { ...CO.scales.y, min:-10, max:55,
            ticks: { ...CO.scales.y.ticks, callback: v => v+'%' },
            grid: { color: ctx => { const v=ctx.tick.value; return v===40?'rgba(74,218,142,0.25)':v===30?'rgba(218,74,74,0.25)':v===0?'rgba(218,74,74,0.5)':'rgba(255,255,255,0.04)'; } },
          },
        },
      },
    });
  }

  // Chart 2: Monthly Revenue stacked + cost line
  const rCtx = document.getElementById('mfg-c-rev');
  if (rCtx) {
    _mfgCharts.rev = new Chart(rCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'إيراد MD75',    data:m75_revenue, backgroundColor:'rgba(74,158,218,0.8)', stack:'r' },
          { label:'إيراد MD45',    data:m45_revenue, backgroundColor:'rgba(245,166,35,0.8)',  stack:'r' },
          { label:'إيراد مشرشر',   data:mSH_revenue, backgroundColor:'rgba(74,218,142,0.7)', stack:'r' },
          { label:'تكلفة الإنتاج', data:rmiCost, type:'line', borderColor:'#ff6b6b', backgroundColor:'transparent', borderWidth:2, borderDash:[6,3], pointRadius:4, tension:0.3, order:0 },
        ],
      },
      options: { ...CO,
        plugins: { ...CO.plugins, tooltip: { callbacks: { label: i => `${i.dataset.label}: ${(i.raw/1e3).toFixed(0)} ك ر.س` } } },
        scales: { ...CO.scales,
          x: { ...CO.scales.x, stacked:true },
          y: { ...CO.scales.y, stacked:false, ticks: { ...CO.scales.y.ticks, callback: v => (v/1e6).toFixed(1)+'م' } },
        },
      },
    });
  }

  // Chart 3: Price vs allocated cost per ton
  const pCtx = document.getElementById('mfg-c-price');
  if (pCtx) {
    _mfgCharts.price = new Chart(pCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'سعر بيع MD75',   data:m75_avgPrice, borderColor:'#4a9eda', backgroundColor:'rgba(74,158,218,0.06)', borderWidth:2.5, tension:0.3, pointRadius:4, fill:false, spanGaps:true },
          { label:'سعر بيع MD45',   data:m45_avgPrice, borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,0.06)',  borderWidth:2.5, tension:0.3, pointRadius:4, fill:false, spanGaps:true },
          { label:'تكلفة MD75/طن',  data:m75_avgCost,  borderColor:'#4a9eda', backgroundColor:'transparent', borderWidth:1.5, borderDash:[5,4], tension:0.3, pointRadius:3, pointStyle:'triangle', spanGaps:false },
          { label:'تكلفة MD45/طن',  data:m45_avgCost,  borderColor:'#f5a623', backgroundColor:'transparent', borderWidth:1.5, borderDash:[5,4], tension:0.3, pointRadius:3, pointStyle:'triangle', spanGaps:false },
          { label:'كويل 10مم (مدخل)', data:coil10,     borderColor:'rgba(167,139,250,0.7)', backgroundColor:'transparent', borderWidth:1.5, borderDash:[3,5], tension:0.3, pointRadius:3, spanGaps:true },
        ],
      },
      options: { ...CO,
        plugins: { ...CO.plugins, tooltip: { callbacks: { label: i => i.raw?`${i.dataset.label}: ${i.raw.toLocaleString('ar-SA')} ر.س/طن`:'' } } },
        scales: { ...CO.scales, y: { ...CO.scales.y, suggestedMin:1300, ticks: { ...CO.scales.y.ticks, callback: v => v.toLocaleString('ar-SA') } } },
      },
    });
  }

  // Charts 4 & 5: Production vs Sales gap
  [['75', '#4a9eda', m75_prodQty, m75_saleQty], ['45', '#f5a623', m45_prodQty, m45_saleQty]].forEach(([k, col, pq, sq]) => {
    const ctx = document.getElementById(`mfg-c-gap${k}`);
    if (!ctx) return;
    const gap = pq.map((v, i) => +(sq[i] - v).toFixed(1));
    _mfgCharts['gap'+k] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'مُنتَج (طن)',            data:pq,               backgroundColor:'rgba(74,218,142,0.55)', stack:'s' },
          { label:'مُباع (طن)',             data:sq.map(v => -v),  backgroundColor:col+'cc',               stack:'s' },
          { label:'الفجوة (مُباع−مُنتَج)', data:gap, type:'line', borderColor:'#ff6b6b', backgroundColor:'transparent', borderWidth:2, pointRadius:5, tension:0.3, order:0, pointBackgroundColor:gap.map(v=>v>0?'#4ada8e':'#da4a4a') },
        ],
      },
      options: { ...CO,
        plugins: { ...CO.plugins, tooltip: { callbacks: { label: i => `${i.dataset.label}: ${Math.abs(i.raw).toFixed(1)} طن` } } },
        scales: { ...CO.scales,
          x: { ...CO.scales.x, stacked:true },
          y: { ...CO.scales.y, stacked:true, ticks: { ...CO.scales.y.ticks, callback: v => Math.abs(v)+'' } },
        },
      },
    });
  });

  // Chart 6: Batch cost efficiency
  const bCtx = document.getElementById('mfg-c-batch');
  if (bCtx) {
    const batchCost = batches.map((b, i) => b > 0 ? Math.round(rmiCost[i] / b) : null);
    _mfgCharts.batch = new Chart(bCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'تكلفة/دفعة (ر.س)', data:batchCost,
            backgroundColor: batchCost.map(v => !v?'transparent':v>80000?'rgba(218,74,74,0.8)':v>50000?'rgba(245,166,35,0.8)':'rgba(74,158,218,0.75)'),
            borderRadius:4 },
          { label:'عدد الدفعات', data:batches, type:'line',
            borderColor:'rgba(74,218,142,0.7)', backgroundColor:'transparent',
            borderWidth:2, pointRadius:4, tension:0.3, yAxisID:'y2' },
        ],
      },
      options: { ...CO,
        plugins: { ...CO.plugins, tooltip: { callbacks: { label: i => i.dataset.yAxisID==='y2'?`${i.dataset.label}: ${i.raw} دفعة`:`${i.dataset.label}: ${i.raw?i.raw.toLocaleString('ar-SA'):'—'} ر.س` } } },
        scales: { ...CO.scales,
          y:  { ...CO.scales.y,  ticks: { ...CO.scales.y.ticks,  callback: v => (v/1e3).toFixed(0)+'ك' } },
          y2: { position:'left', ticks: { color:'#4ada8e', font:{size:9}, callback: v => v+'' }, grid: {display:false} },
        },
      },
    });
  }
}
