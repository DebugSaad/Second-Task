const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const getMetadata = (decoded) => ({
  userId: decoded.userId,
  deviceId: decoded.deviceId || 'unknown_device'
});

module.exports = { hashToken, getMetadata };