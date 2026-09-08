const router = require('express').Router();
const ctrl = require('../controllers/collab.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举/统计类路由必须在 /:id 之前
router.get('/options', asyncHandler(ctrl.options));
router.get('/stats', asyncHandler(ctrl.stats));

// 会议室台账
router.get('/rooms', asyncHandler(ctrl.listRooms));
router.post('/rooms', asyncHandler(ctrl.createRoom));
router.put('/rooms/:id', asyncHandler(ctrl.updateRoom));

// 会议室预订（含时间冲突检测）
router.get('/reservations', asyncHandler(ctrl.listReservations));
router.post('/reservations', asyncHandler(ctrl.createReservation));
router.put('/reservations/:id/cancel', asyncHandler(ctrl.cancelReservation));

// 会议纪要（决议 → 任务）
router.get('/notes', asyncHandler(ctrl.listNotes));
router.post('/notes', asyncHandler(ctrl.createNote));

// 日程
router.get('/schedules', asyncHandler(ctrl.listSchedules));
router.post('/schedules', asyncHandler(ctrl.createSchedule));
router.post('/schedules/check-reminders', asyncHandler(ctrl.checkReminders));
router.put('/schedules/:id', asyncHandler(ctrl.updateSchedule));
router.delete('/schedules/:id', asyncHandler(ctrl.removeSchedule));

// 任务
router.get('/tasks', asyncHandler(ctrl.listTasks));
router.post('/tasks', asyncHandler(ctrl.createTask));
router.put('/tasks/:id/progress', asyncHandler(ctrl.updateTaskProgress));

// 个人待办
router.get('/todos/stats', asyncHandler(ctrl.todoStats));
router.get('/todos', asyncHandler(ctrl.listTodos));
router.post('/todos', asyncHandler(ctrl.createTodo));
router.put('/todos/:id', asyncHandler(ctrl.updateTodo));
router.delete('/todos/:id', asyncHandler(ctrl.removeTodo));

// 委托
router.get('/delegations', asyncHandler(ctrl.listDelegations));
router.post('/delegations', asyncHandler(ctrl.createDelegation));
router.put('/delegations/:id', asyncHandler(ctrl.updateDelegation));

// 补卡申请
router.get('/cardfix', asyncHandler(ctrl.listCardfix));
router.post('/cardfix', asyncHandler(ctrl.createCardfix));
router.put('/cardfix/:id', asyncHandler(ctrl.updateCardfix));

// 加班申请
router.get('/overtime', asyncHandler(ctrl.listOvertime));
router.post('/overtime', asyncHandler(ctrl.createOvertime));
router.put('/overtime/:id', asyncHandler(ctrl.updateOvertime));

module.exports = router;
