'use strict';
const CAT_ORDER = ['sal','rent','maint','sell','dist','adm','fin','char','oth'];

const CAT_LABEL = {
  sal:  'رواتب وأجور',
  rent: 'إيجار',
  maint:'صيانة وتشغيل',
  sell: 'مبيعات وتسويق',
  dist: 'توزيع ونقل',
  adm:  'مصروفات إدارية',
  fin:  'مالية ومصرفية',
  char: 'تبرعات وزكاة',
  oth:  'أخرى',
};

const BRANCH_LABEL = {
  0: 'غير محدد',
  1: 'الفرع الرئيسي',
  2: 'الفرع الثاني',
  3: 'الفرع الثالث',
  4: 'الفرع الرابع',
  5: 'الفرع الخامس',
};

// P&L statement line labels (Arabic)
const PL_LABELS = {
  revenue:         'إيرادات المبيعات',
  cogs:            'تكلفة البضاعة المباعة',
  grossProfit:     'مجمل الربح',
  opex:            'المصروفات التشغيلية',
  totalOpex:       'إجمالي المصروفات التشغيلية',
  operatingProfit: 'الربح التشغيلي',
  netProfit:       'صافي الربح / (الخسارة)',
  grossMargin:     'هامش الربح الإجمالي',
  netMargin:       'هامش الربح الصافي',
};

// Colors for P&L waterfall and trend charts
const PL_COLORS = {
  revenue:         '#5baef0',
  cogs:            '#da4a4a',
  grossProfit:     '#4ada8e',
  opex:            '#da9a4a',
  netProfit:       '#4ada8e',
  netLoss:         '#da4a4a',
  connector:       '#3a5a7a',
  subtotal:        '#5a7a9a',
};

const CAT_COLORS = {
  sal:  '#4a9eda',
  rent: '#4ada8e',
  maint:'#da9a4a',
  sell: '#da4ada',
  dist: '#9ada4a',
  adm:  '#4a7ada',
  fin:  '#dada4a',
  char: '#9a4ada',
  oth:  '#7a8a9a',
};
