/* 003_sales_records - 销售明细录入表 */
module.exports = {
  id: '003_sales_records',
  up(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS sales_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT,
    product TEXT,
    amount REAL,
    sale_date TEXT,
    salesperson TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);
  },
};
