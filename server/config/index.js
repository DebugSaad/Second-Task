require('dotenv').config();

const config = {
  app: {
    port: process.env.PORT || 3000,
  },
  db: {
    connectionString: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d'
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379
  }
};

if (!config.jwt.secret) {
  throw new Error('FATAL ERROR: JWT_SECRET is missing in .env file!');
}

if (!config.db.connectionString) {
  console.warn('WARNING: DATABASE_URL is missing. Database might fail.');
}

module.exports = config;