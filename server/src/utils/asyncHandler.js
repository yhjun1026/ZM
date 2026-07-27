/**
 * 包装异步路由处理函数，把 Promise 抛出的错误转给 Express 错误中间件。
 * 用法：router.get('/x', asyncHandler(ctrl.x))
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
