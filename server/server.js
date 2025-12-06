require('dotenv').config();
const Fastify = require('fastify');
const crypto = require('crypto');
const EventEmitter = require('events');

const fastify = Fastify({ logger: true, pluginTimeout: 20000 });

const tokenEvents = new EventEmitter();
tokenEvents.on('token.issued', (data) => console.log('EVENT: Token Issued', data));
tokenEvents.on('token.revoked', (data) => console.log('EVENT: Token Revoked', data));

fastify.register(require('@fastify/swagger'), {
  swagger: {
    info: { title: 'Auth API', version: '1.0.0' },
    tags: [{ name: 'Token', description: 'Token management endpoints' }],
  }
});
fastify.register(require('@fastify/swagger-ui'), {
  routePrefix: '/documentation',
});

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET
});

fastify.register(require('@fastify/redis'), { 
  host: '127.0.0.1', 
  port: 6379 
}).after((err) => {
  if(err){
    console.error("Redis Connection Failed.");
    console.error(err);
  } else {
    console.log("Redis Connected Successfully.");
  }
});

fastify.register(require('@fastify/postgres'), {
  connectionString: process.env.DATABASE_URL 
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const getMetadata = (decoded) => ({
  userId: decoded.userId,
  deviceId: decoded.deviceId || 'unknown_device'
});

fastify.after(() => {

  fastify.post('/login', {
    schema: {
      tags: ['Token'],
      summary: 'Login to get initial tokens',
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          deviceId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const reqBody = request.body || {};
    const userId = reqBody.userId || 'user_123';
    const deviceId = reqBody.deviceId || 'device_01'; 

    const { redis } = fastify;

    const accessToken = fastify.jwt.sign({ userId, deviceId }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ userId, deviceId }, { expiresIn: '7d' });

    const refreshHash = hashToken(refreshToken);
    const redisKey = `refresh_token:${userId}:${deviceId}`;
    
    console.log(`[LOGIN] Saving Key: ${redisKey}`);
    await redis.set(redisKey, refreshHash, 'EX', 7 * 24 * 60 * 60);

    return { accessToken, refreshToken };
  });

  fastify.post('/token/refresh', {
    schema: {
      tags: ['Token'],
      summary: 'Rotate Refresh Token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } }
      }
    }
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    const { redis, pg } = fastify;

    console.log("REFRESH REQUEST STARTED");

    try {
      const decoded = fastify.jwt.verify(refreshToken);
      const { userId, deviceId } = getMetadata(decoded);
      
      const incomingTokenHash = hashToken(refreshToken);
      const redisKey = `refresh_token:${userId}:${deviceId}`;
      
      console.log(`Checking Redis Key: ${redisKey}`);
      const storedHash = await redis.get(redisKey);

      if (!storedHash) {
        console.log("Error: Token Not Found / Expired");
        return reply.code(403).send({ error: 'Refresh token invalid or expired' });
      }

      if (storedHash !== incomingTokenHash) {
        console.log("SECURITY ALERT: Reuse Detected!");
        await redis.del(redisKey);
        tokenEvents.emit('token.revoked', { userId, reason: 'Reuse Detected' });
        return reply.code(403).send({ error: 'Token reuse detected' });
      }

      console.log("Rotating Tokens...");
      const newAccessToken = fastify.jwt.sign({ userId, deviceId }, { expiresIn: '15m' });
      const newRefreshToken = fastify.jwt.sign({ userId, deviceId }, { expiresIn: '7d' });
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
        console.log("DB Audit Failed (Non-critical):", dbErr.message);
      }

      tokenEvents.emit('token.issued', { userId, deviceId });
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };

    } catch (err) {
      console.error("CRITICAL ERROR:", err);
      if (err.code === 'FAST_JWT_EXPIRED') {
         return reply.code(401).send({ error: 'Refresh token expired', code: 'TOKEN_EXPIRED' });
      }
      return reply.code(401).send({ error: 'Invalid Token Request', details: err.message });
    }
  });

  fastify.post('/token/revoke', {
    schema: {
      tags: ['Token'],
      summary: 'Revoke Refresh Token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } }
      }
    }
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    const { redis, pg } = fastify;

    console.log("REVOCATION REQUEST STARTED");

    try {
      const decoded = fastify.jwt.decode(refreshToken);
      if (!decoded) {
        return reply.code(400).send({ error: 'Malformed token' });
      }

      const { userId, deviceId } = getMetadata(decoded);
      const redisKey = `refresh_token:${userId}:${deviceId}`;
      
      console.log(`Revoking Key: ${redisKey}`);
      await redis.del(redisKey);

      try {
        const tokenHash = hashToken(refreshToken);
        const client = await pg.connect();
        await client.query(
          'INSERT INTO token_audits (user_id, action_type, token_hash) VALUES ($1, $2, $3)',
          [userId, 'REVOKED', tokenHash]
        );
        client.release();
        console.log("DB Audit Success");
      } catch (dbErr) {
        console.error("DB WARNING:", dbErr.message);
      }

      tokenEvents.emit('token.revoked', { userId, deviceId });
      return { message: 'Token revoked successfully' };

    } catch (err) {
      console.error("CRITICAL ERROR IN REVOKE:", err);
      return reply.code(500).send({ error: 'Revocation failed', details: err.message });
    }
  });

}); 

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log(`Server running at http://localhost:3000`);
    console.log(`Swagger docs at http://localhost:3000/documentation`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();