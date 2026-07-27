const Joi = require('joi');
const { fail } = require('../utils/response');

/**
 * 请求参数校验中间件。
 * @param {Joi.Schema} schema
 * @param {'body'|'query'|'params'} source
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      stripUnknown: true,
      abortEarly: true,
    });
    if (error) {
      return res.status(400).json(fail('参数校验失败: ' + error.details[0].message));
    }
    req[source] = value;
    next();
  };
}

module.exports = { validate, Joi };
