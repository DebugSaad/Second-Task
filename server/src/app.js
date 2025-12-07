const Fastify = require('fastify');
const EventEmitter = require('events');
const config = require('../config');


function buildApp() {
    const fastify = Fastify({ logger: true, pluginTimeout: 20000 });

    const tokenEvents = new EventEmitter();
    tokenEvents.on('token.issued', (data) => console.log('EVENT: Token Issued', data));
    tokenEvents.on('token.revoked', (data) => console.log('EVENT: Token Revoked', data));

    fastify.decorate('tokenEvents', tokenEvents);

    fastify.register(require('@fastify/swagger'), {
        swagger: {
            info: { title: 'Auth API', version: '1.0.0' },
            tags: [{ name: 'Token', description: 'Token management endpoints' }],
        }
    });
    fastify.register(require('@fastify/swagger-ui'), { routePrefix: '/documentation' });

    fastify.register(require('@fastify/jwt'), { secret: config.jwt.secret });

    fastify.register(require('@fastify/redis'), { 
        host: config.redis.host, 
        port: config.redis.port
    }).after((err) => {
        if(err) console.error("Redis Connection Failed:", err);
        else console.log("Redis Connected Successfully.");
    });

    fastify.register(require('@fastify/postgres'), {
        connectionString: config.db.connectionString
    });

    fastify.register(require('../features/auth/auth.routes'));

    return fastify;
}

module.exports = buildApp;