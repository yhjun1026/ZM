const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(userId, role) {
  return jwt.sign({ userId, role }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
