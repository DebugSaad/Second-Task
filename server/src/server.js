const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Env load sabse pehle
const buildApp = require('./app');

const start = async () => {
    const fastify = buildApp(); // App create karein

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