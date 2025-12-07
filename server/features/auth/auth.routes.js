const handlers = require('./auth.handlers');
const schemas = require('./auth.schema');

async function authRoutes(fastify, options) {
    
    fastify.post('/login', { schema: schemas.loginSchema }, handlers.loginHandler);
    
    fastify.post('/token/refresh', { schema: schemas.refreshSchema }, handlers.refreshHandler);
    
    fastify.post('/token/revoke', { schema: schemas.revokeSchema }, handlers.revokeHandler);

}

module.exports = authRoutes;