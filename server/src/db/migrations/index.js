/* 迁移清单（up/seed 共用的单一数据源） */
module.exports = [
  require('./001_init'),
  require('./002_trips'),
  require('./003_sales_records'),
  require('./004_add_missing_tables'),
  require('./005_seed_business_data'),
  require('./006_align_reference_org'),
  require('./007_reference_schema'),
  require('./008_reference_business_data'),
];
