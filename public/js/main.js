function renderTab(name) {
  if      (name === 'summary')  renderSummary();
  else if (name === 'monthly')  renderMonthlyTab();
  else if (name === 'accounts') renderAccountsTab();
  else if (name === 'branches') renderBranchesTab();
  else if (name === 'assets')   renderAssetsTab();
  else if (name === 'details')  renderDetails();
  else if (name === 'compare')  renderCompareTab();
  else if (name === 'pl')       renderPLTab();
  else if (name === 'bs')       renderBS();
  else if (name === 'cf')       renderCF();
  else if (name === 'ratios')   renderRatiosTab();
  else if (name === 'notes')        renderNotesTab();
  else if (name === 'cfo')          renderCFODashboard();
  else if (name === 'consolidated') renderConsolidatedTab();
  else if (name === 'cons-cf')     renderConsCF();
  else if (name === 'pl-comp')     renderPLComparison();
  else if (name === 'trial')       renderTrialBalance();
  else if (name === 'is')          renderIncomeStatement();
  else if (name === 'safety')      renderSafetyInventory();
  else if (name === 'aging')       renderAgingTab();
  else if (name === 'finmodel')    renderFinancialModel();
  else if (name === 'inventory')     renderInventoryAnalysis();
  else if (name === 'manufacturing') renderManufacturing();
  else if (name === 'coils') {
    const fr = document.getElementById('coils-iframe');
    if (fr && !fr.src.includes('coils-analysis-2026')) fr.src = '/coils-analysis-2026.html';
  }
}

// ── Connection status indicator ───────────────────────────────────────────────
function updateConnectionUI(connected, db) {
  const dot    = document.getElementById('db-status');
  const banner = document.getElementById('conn-banner');
  if (dot)    dot.style.background    = connected ? '#4ada8e' : '#da4a4a';
  if (banner) banner.style.display    = connected ? 'none' : 'block';
  const dbSel = document.getElementById('db-select');
  if (dbSel && db && dbSel.value !== db) dbSel.value = db;
}

// ── Reactive rendering on data changes ───────────────────────────────────────
State.on('monthly', () => {
  const active = document.querySelector('.tab.active');
  if (active) renderTab(active.dataset.tab);
  buildPeriodOptions('period-sel', true);
  buildPeriodOptions('det-period', false);
  buildPeriodOptions('pl-period-sel', true);
});

State.on('pl', () => {
  const active = document.querySelector('.tab.active');
  if (!active) return;
  if      (active.dataset.tab === 'pl')     renderPLTab();
  else if (active.dataset.tab === 'cf')     renderCF();
  else if (active.dataset.tab === 'ratios') renderRatiosTab();
  else if (active.dataset.tab === 'notes')  renderNotesTab();
  else if (active.dataset.tab === 'cfo')    renderCFODashboard();
});

State.on('bs', () => {
  const active = document.querySelector('.tab.active');
  if (!active) return;
  if      (active.dataset.tab === 'bs')     renderBS();
  else if (active.dataset.tab === 'cf')     renderCF();
  else if (active.dataset.tab === 'ratios') renderRatiosTab();
  else if (active.dataset.tab === 'notes')  renderNotesTab();
  else if (active.dataset.tab === 'cfo')    renderCFODashboard();
});

State.on('detailRows', () => {
  const active = document.querySelector('.tab.active');
  if (active && active.dataset.tab === 'details') renderDetails();
});

State.on('connected', val => {
  updateConnectionUI(val, State.get('activeDb'));
});

State.on('companyName', val => {
  const el = document.getElementById('company-name');
  if (el) el.textContent = val || '';
  if (val) document.title = 'تحليل المصروفات التشغيلية — ' + val;
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const config = await API.fetchConfig();

  // Populate DB dropdown
  const dbSel = document.getElementById('db-select');
  if (dbSel) {
    config.databases.forEach(name => {
      const o = document.createElement('option');
      o.value = name; o.textContent = name; dbSel.appendChild(o);
    });
    dbSel.value = config.defaultDb;
    // Sync plc-db-sel to initial default DB
    const plcDbInit = document.getElementById('plc-db-sel');
    if (plcDbInit && plcDbInit.querySelector(`option[value="${config.defaultDb}"]`))
      plcDbInit.value = config.defaultDb;
    dbSel.addEventListener('change', function(e) {
      SSEClient.switchDb(e.target.value);
      // Sync pl-comp DB selector and re-render if that tab is active
      const plcDb = document.getElementById('plc-db-sel');
      if (plcDb && plcDb.querySelector(`option[value="${e.target.value}"]`)) {
        plcDb.value = e.target.value;
        if (document.querySelector('.tab.active[data-tab="pl-comp"]')) renderPLComparison();
      }
    });
  }

  // Update header meta with start date
  const startEl = document.getElementById('data-start');
  if (startEl) startEl.textContent = config.dataStartDate;

  // Monthly tab filters
  const moPeriodSel = document.getElementById('mo-period-sel');
  if (moPeriodSel) moPeriodSel.addEventListener('change', renderMonthlyTab);
  const moCatSel = document.getElementById('mo-cat-sel');
  if (moCatSel) moCatSel.addEventListener('change', renderMonthlyTab);

  // Accounts tab period filter
  const accPeriodSel = document.getElementById('acc-period-sel');
  if (accPeriodSel) accPeriodSel.addEventListener('change', renderAccountsTab);

  // Compare tab period filter
  const cmpPeriodSel = document.getElementById('cmp-period-sel');
  if (cmpPeriodSel) cmpPeriodSel.addEventListener('change', renderCompareTab);

  initSummary();
  initDetails();

  // P&L period filter + exports
  const plPeriodSel = document.getElementById('pl-period-sel');
  if (plPeriodSel) plPeriodSel.addEventListener('change', renderPLTab);
  const plExcelBtn = document.getElementById('pl-excel-btn');
  if (plExcelBtn)  plExcelBtn.addEventListener('click', exportPLExcel);
  const plHtmlBtn  = document.getElementById('pl-html-btn');
  if (plHtmlBtn)   plHtmlBtn.addEventListener('click', exportPLHTML);
  const plPdfBtn   = document.getElementById('pl-pdf-btn');
  if (plPdfBtn)    plPdfBtn.addEventListener('click', printPLPDF);

  // BS period filter
  const bsPeriodSel = document.getElementById('bs-period-sel');
  if (bsPeriodSel) bsPeriodSel.addEventListener('change', renderBS);

  // CF period + comparison filters + Excel export
  const cfPeriodSel = document.getElementById('cf-period-sel');
  if (cfPeriodSel) cfPeriodSel.addEventListener('change', renderCF);
  const cfCmpSel = document.getElementById('cf-cmp-sel');
  if (cfCmpSel) cfCmpSel.addEventListener('change', renderCF);
  const cfExcelBtn = document.getElementById('cf-excel-btn');
  if (cfExcelBtn) cfExcelBtn.addEventListener('click', exportCFExcel);

  // Branches tab period filter
  const brPeriodSel = document.getElementById('br-period-sel');
  if (brPeriodSel) brPeriodSel.addEventListener('change', renderBranchesTab);

  // Assets tab period filter
  const assetPeriodSel = document.getElementById('asset-period-sel');
  if (assetPeriodSel) assetPeriodSel.addEventListener('change', renderAssetsTab);

  // Ratios tab
  const ratiosPeriodSel = document.getElementById('ratios-period-sel');
  if (ratiosPeriodSel) ratiosPeriodSel.addEventListener('change', renderRatiosTab);
  const ratiosPlMode  = document.getElementById('ratios-pl-mode');
  if (ratiosPlMode)   ratiosPlMode.addEventListener('change', renderRatiosTab);
  const ratiosExcelBtn = document.getElementById('ratios-excel-btn');
  if (ratiosExcelBtn) ratiosExcelBtn.addEventListener('click', exportRatiosExcel);
  const ratiosHtmlBtn  = document.getElementById('ratios-html-btn');
  if (ratiosHtmlBtn)  ratiosHtmlBtn.addEventListener('click', exportRatiosHTML);
  const ratiosPdfBtn   = document.getElementById('ratios-pdf-btn');
  if (ratiosPdfBtn)   ratiosPdfBtn.addEventListener('click', printRatiosPDF);

  // Notes tab period filter and export buttons
  const notesPeriodSel = document.getElementById('notes-period-sel');
  if (notesPeriodSel) notesPeriodSel.addEventListener('change', renderNotesTab);
  const notesPlMode   = document.getElementById('notes-pl-mode');
  if (notesPlMode)    notesPlMode.addEventListener('change', renderNotesTab);
  const notesExcelBtn = document.getElementById('notes-excel-btn');
  if (notesExcelBtn)  notesExcelBtn.addEventListener('click', exportNotesExcel);
  const notesHtmlBtn  = document.getElementById('notes-html-btn');
  if (notesHtmlBtn)   notesHtmlBtn.addEventListener('click', exportNotesHTML);
  const notesPdfBtn   = document.getElementById('notes-pdf-btn');
  if (notesPdfBtn)    notesPdfBtn.addEventListener('click', printNotesPDF);

  const cfoQuickSel  = document.getElementById('cfo-quick-sel');
  if (cfoQuickSel)   cfoQuickSel.addEventListener('change', renderCFODashboard);
  const cfoExcelBtn  = document.getElementById('cfo-excel-btn');
  if (cfoExcelBtn)   cfoExcelBtn.addEventListener('click', exportCFOExcel);
  const cfoHtmlBtn   = document.getElementById('cfo-html-btn');
  if (cfoHtmlBtn)    cfoHtmlBtn.addEventListener('click', exportCFOHTML);
  const cfoPdfBtn    = document.getElementById('cfo-pdf-btn');
  if (cfoPdfBtn)     cfoPdfBtn.addEventListener('click', printCFOPDF);

  // Subscribe to SSE events
  SSEClient.onSnapshot(() => {
    API.fetchDetails();
    setTimeout(runVerify, 2000); // auto-verify 2s after each snapshot
  });
  SSEClient.onStatus(({ connected, db }) => {
    updateConnectionUI(connected, db);
  });

  // Verify button & modal
  const vBtn = document.getElementById('verify-btn');
  const vOverlay = document.getElementById('verify-overlay');
  if (vBtn) vBtn.addEventListener('click', () => {
    vOverlay.classList.add('open');
    if (vBtn.classList.contains('vchk')) runVerify();
  });
  const vClose = document.getElementById('verify-close');
  if (vClose) vClose.addEventListener('click', () => vOverlay.classList.remove('open'));
  if (vOverlay) vOverlay.addEventListener('click', e => { if (e.target === vOverlay) vOverlay.classList.remove('open'); });

  // Consolidated CF tab — period selectors and refresh
  const consCfFrom    = document.getElementById('cons-cf-from');
  const consCfTo      = document.getElementById('cons-cf-to');
  const consCfRefresh = document.getElementById('cons-cf-refresh-btn');
  if (consCfFrom) consCfFrom.addEventListener('change', e => { State.set('consCfFrom', e.target.value); renderConsCF(); });
  if (consCfTo)   consCfTo.addEventListener('change',   e => { State.set('consCfTo',   e.target.value); renderConsCF(); });
  const consCfCmpSel  = document.getElementById('cons-cf-cmp-sel');
  const consCfExcelBtn = document.getElementById('cons-cf-excel-btn');
  if (consCfCmpSel)  consCfCmpSel.addEventListener('change', renderConsCF);
  if (consCfExcelBtn) consCfExcelBtn.addEventListener('click', exportConsCFExcel);
  const consExcelBtn = document.getElementById('cons-excel-btn');
  if (consExcelBtn) consExcelBtn.addEventListener('click', exportConsExcel);
  const consHtmlBtn = document.getElementById('cons-html-btn');
  if (consHtmlBtn) consHtmlBtn.addEventListener('click', exportConsHTML);
  const consPdfBtn  = document.getElementById('cons-pdf-btn');
  if (consPdfBtn)  consPdfBtn.addEventListener('click', printConsPDF);
  if (consCfRefresh) consCfRefresh.addEventListener('click', () => {
    State.set('consolidated', null);
    State.set('consCfFrom', null);
    State.set('consCfTo',   null);
    renderConsCF();
  });
  document.querySelectorAll('.tab[data-tab="cons-cf"]').forEach(t => {
    t.addEventListener('click', () => { if (!State.get('consolidated')) renderConsCF(); });
  });

  // Consolidated tab refresh button
  const consRefreshBtn = document.getElementById('cons-refresh-btn');
  if (consRefreshBtn) consRefreshBtn.addEventListener('click', () => {
    State.set('consolidated', null);
    State.set('consFrom', null);
    State.set('consTo', null);
    renderConsolidatedTab();
  });

  // Unified consolidated period filter
  const consFromSel = document.getElementById('cons-period-from');
  const consToSel   = document.getElementById('cons-period-to');
  if (consFromSel) consFromSel.addEventListener('change', e => {
    State.set('consFrom', e.target.value);
    renderConsolidatedTab();
  });
  if (consToSel) consToSel.addEventListener('change', e => {
    State.set('consTo', e.target.value);
    renderConsolidatedTab();
  });

  // Tab switching — show/hide consolidated tab content
  document.querySelectorAll('.tab[data-tab="consolidated"]').forEach(t => {
    t.addEventListener('click', () => {
      if (!State.get('consolidated')) renderConsolidatedTab();
    });
  });

  // P&L comparison tab listeners
  const _plcMode    = document.getElementById('plc-mode-sel');
  const _plcRefresh = document.getElementById('plc-refresh-btn');
  const _plcCopy    = document.getElementById('plc-copy-btn');
  const _plcNotes   = document.getElementById('plc-notes');
  if (_plcMode) _plcMode.addEventListener('change', () => { plcShowMode(_plcMode.value); renderPLComparison(); });
  ['plc-year-sel','plc-q-sel','plc-h-sel','plc-month-sel','plc-from-sel','plc-to-sel','plc-db-sel']
    .forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => renderPLComparison()); });
  if (_plcRefresh) _plcRefresh.addEventListener('click', () => {
    const db = document.getElementById('plc-db-sel')?.value || 'MekSoftDb1';
    delete _plCompCache[db];
    Object.keys(_plAdjCache).forEach(k => { if (k.startsWith(db + '|')) delete _plAdjCache[k]; });
    renderPLComparison();
  });
  if (_plcCopy) _plcCopy.addEventListener('click', () => {
    const db  = document.getElementById('plc-db-sel')?.value || 'MekSoftDb1';
    const per = plcGetPeriod();
    const a   = per ? plcAggregate(_plCompCache[db] || [], per.from, per.to, db) : null;
    if (!a) return;
    const txt = [
      `تقرير الأرباح والخسائر — ${per.label}`,
      `الإيرادات: ${fmt(a.net_revenue)} ر.س`,
      `تكلفة المبيعات (جرد دائم): ${fmt(a.pure_cogs)} ر.س`,
      `إجمالي الربح: ${fmt(a.gp_perp)} ر.س`,
      `المصروفات التشغيلية: ${fmt(a.total_opex)} ر.س`,
      `صافي الربح: ${fmt(a.ni_perp)} ر.س`,
      `— تحليل: المخزون الدفتري مضخَّم بـ ${fmt(a.inv_overstatement)} ر.س (FallbackCostInBase)`,
    ].join('\n');
    navigator.clipboard.writeText(txt).catch(() => {});
  });
  if (_plcNotes) _plcNotes.addEventListener('input', () => {
    const per = plcGetPeriod();
    if (per) localStorage.setItem('plc-notes-' + per.label, _plcNotes.value);
  });

  // Trial balance + Income statement tabs
  initTrialBalance();
  initIncomeStatement();

  State.patch({ activeDb: config.defaultDb });
  SSEClient.start(config.defaultDb);
}

init();
