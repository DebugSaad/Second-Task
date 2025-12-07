const { hashToken, getMetadata } = require('../../shared/utils/crypto.utils');

async function loginHandler(request, reply) {
    const { redis, jwt } = request.server; 
    
    const reqBody = request.body || {};
    const userId = reqBody.userId || 'user_123';
    const deviceId = reqBody.deviceId || 'device_01'; 

    const accessToken = jwt.sign({ userId, deviceId }, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId, deviceId }, { expiresIn: '7d' });

    const refreshHash = hashToken(refreshToken);
    const redisKey = `refresh_token:${userId}:${deviceId}`;
    
    console.log(`[LOGIN] Saving Key: ${redisKey}`);
    await redis.set(redisKey, refreshHash, 'EX', 7 * 24 * 60 * 60);

    return { accessToken, refreshToken };
}

async function refreshHandler(request, reply) {
    const { refreshToken } = request.body;
    const { redis, pg, jwt, tokenEvents } = request.server; 
    console.log("REFRESH REQUEST STARTED");

    try {
      const decoded = jwt.verify(refreshToken);
      const { userId, deviceId } = getMetadata(decoded);
      
      const incomingTokenHash = hashToken(refreshToken);
      const redisKey = `refresh_token:${userId}:${deviceId}`;
      
      const storedHash = await redis.get(redisKey);

      if (!storedHash) {
        return reply.code(403).send({ error: 'Refresh token invalid or expired' });
      }

      if (storedHash !== incomingTokenHash) {
        await redis.del(redisKey);
        tokenEvents.emit('token.revoked', { userId, reason: 'Reuse Detected' });
        return reply.code(403).send({ error: 'Token reuse detected' });
      }


      const newAccessToken = jwt.sign({ userId, deviceId }, { expiresIn: '15m' });
      const newRefreshToken = jwt.sign({ userId, deviceId }, { expiresIn: '7d' });
      const newRefreshHash = hashToken(newRefreshToken);

      await redis.set(redisKey, newRefreshHash, 'EX', 7 * 24 * 60 * 60);


      try {
        const client = await pg.connect();
        await client.query(
          'INSERT INTO token_audits (user_id, action_type, token_hash) VALUES ($1, $2, $3)',
          [userId, 'ISSUED', newRefreshHash]
        );
        client.release();
      } catch (dbErr) {
        console.log("DB Audit Failed:", dbErr.message);
      }

      tokenEvents.emit('token.issued', { userId, deviceId });
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };

    } catch (err) {
      if (err.code === 'FAST_JWT_EXPIRED') {
         return reply.code(401).send({ error: 'Refresh token expired', code: 'TOKEN_EXPIRED' });
      }
      return reply.code(401).send({ error: 'Invalid Token Request', details: err.message });
    }
}


async function revokeHandler(request, reply) {
    const { refreshToken } = request.body;
    const { redis, pg, jwt, tokenEvents } = request.server;

    try {
      const decoded = jwt.decode(refreshToken);
      if (!decoded) return reply.code(400).send({ error: 'Malformed token' });

      const { userId, deviceId } = getMetadata(decoded);
      const redisKey = `refresh_token:${userId}:${deviceId}`;
      
      await redis.del(redisKey);

      try {
        const tokenHash = hashToken(refreshToken);
        const client = await pg.connect();
        await client.query(
          'INSERT INTO token_audits (user_id, action_type, token_hash) VALUES ($1, $2, $3)',
          [userId, 'REVOKED', tokenHash]
        );
        client.release();
      } catch (dbErr) {
        console.error("DB WARNING:", dbErr.message);
      }

      tokenEvents.emit('token.revoked', { userId, deviceId });
      return { message: 'Token revoked successfully' };

    } catch (err) {
      return reply.code(500).send({ error: 'Revocation failed', details: err.message });
    }
}

module.exports = { loginHandler, refreshHandler, revokeHandler };