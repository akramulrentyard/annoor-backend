const { createClient } = require('redis');

// ============================================
// Redis Client (URL-based)
// ============================================
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`Connecting to Redis: ${redisUrl.replace(/:[^:@]+@/, ':***@')}`);

const client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis: too many reconnection attempts');
        return new Error('Too many retries');
      }
      return Math.min(retries * 100, 3000);
    },
    connectTimeout: 10000
  }
});

// ============================================
// Event Listeners
// ============================================
client.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
});

client.on('connect', () => {
  console.log('Redis connecting...');
});

client.on('ready', () => {
  console.log('Redis connected successfully');
});

client.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

client.on('end', () => {
  console.log('Redis connection closed');
});

// ============================================
// Connect on Startup
// ============================================
(async () => {
  try {
    await client.connect();
  } catch (err) {
    console.error('Failed to connect to Redis:', err.message);
    console.error('Server will continue running without cache/OTP features.');
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  try {
    await client.quit();
    console.log('Redis connection closed gracefully');
  } catch (err) {
    console.error('Error closing Redis:', err.message);
  }
});

module.exports = client;