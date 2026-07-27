const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');
const { advanceFlow } = require('../services/approval.service');

function toTrip(r) {
  return {
    id: r.id,
    applicant: r.applicant,
    fromCity: r.from_city,
    toCity: r.to_city,
    startDate: r.start_date,
    endDate: r.end_date,
    days: r.days,
    purpose: r.purpose,
    budget: { transport: r.budget_transport, hotel: r.budget_hotel, meal: r.budget_meal, other: r.budget_other, total: r.budget_total },
    actualSpent: r.actual_spent,
    status: r.status,
    approver: r.approver,
    flow: parseJSON(r.flow) || [],
  };
}

function computeStats(trips) {
  return {
    totalTrips: trips.length,
    pending: trips.filter((t) => t.status === '待审批').length,
    completed: trips.filter((t) => t.status === '已完成').length,
    rejected: trips.filter((t) => t.status === '已驳回').length,
    thisMonthTrips: trips.filter((t) => t.startDate && t.startDate.startsWith(new Date().toISOString().slice(0, 7))).length,
    avgDays: trips.length > 0 ? (trips.reduce((s, t) => s + (t.days || 0), 0) / trips.length).toFixed(1) : 0,
    totalBudget: trips.reduce((s, t) => s + (t.budget?.total || 0), 0),
    totalActual: trips.filter((t) => t.actualSpent).reduce((s, t) => s + t.actualSpent, 0),
  };
}

function list(req, res) {
  const rows = db.prepare('SELECT * FROM business_trips ORDER BY id DESC').all();
  const trips = rows.map(toTrip);
  return res.json(success({ trips, stats: computeStats(trips) }));
}

function create(req, res) {
  const { id, applicant, fromCity, toCity, startDate, endDate, days, purpose, budget, approver } = req.body;
  const b = budget || { transport: 0, hotel: 0, meal: 0, other: 0, total: 0 };
  try {
    const flow = JSON.stringify([
      { step: '提交申请', user: applicant, time: new Date().toISOString().slice(0, 10), done: true },
      { step: '部门审批', user: approver || '-', time: '-', done: false },
      { step: '总经理审批', user: '-', time: '-', done: false },
      { step: '出行', user: '-', time: '-', done: false },
    ]);
    const info = db.prepare('INSERT INTO business_trips (id,applicant,from_city,to_city,start_date,end_date,days,purpose,budget_transport,budget_hotel,budget_meal,budget_other,budget_total,status,approver,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id || ('BT-' + Date.now()), applicant, fromCity, toCity, startDate, endDate, days, purpose, b.transport || 0, b.hotel || 0, b.meal || 0, b.other || 0, b.total || 0, '待审批', approver || '-', flow);
    auditLog('ADD_TRIP', req.userId, String(id || ''), applicant);
    return res.json(success({ id: info.lastInsertRowid }, '出差申请已提交'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

function approve(req, res) {
  const { status, approver, actualSpent } = req.body;
  try {
    const newFlow = advanceFlow(db, 'business_trips', req.params.id, approver);
    if (newFlow !== null) {
      if (actualSpent !== undefined) {
        db.prepare('UPDATE business_trips SET status=?, flow=?, actual_spent=? WHERE id=?').run(status, newFlow, actualSpent, req.params.id);
      } else {
        db.prepare('UPDATE business_trips SET status=?, flow=? WHERE id=?').run(status, newFlow, req.params.id);
      }
    }
    auditLog('APPROVE_TRIP', req.userId, req.params.id, status);
    return res.json(success({}, '出差审批已更新'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_TRIP', req.userId, req.params.id, null);
    db.prepare('DELETE FROM business_trips WHERE id=?').run(req.params.id);
    return res.json(success({}, '出差申请已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

module.exports = { list, create, approve, remove, toTrip, computeStats };
