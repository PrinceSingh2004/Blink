const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisConfig = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
        // exponentially backoff to prevent flooding terminal
        const delay = Math.min(times * 1000, 10000); // Max 10s wait
        return delay;
    }
};

const redisClient = new Redis(REDIS_URL, redisConfig);
const redisSubscriber = new Redis(REDIS_URL, redisConfig);

// Keep flags so we only print "offline" once to not flood the terminal
let clientErrorLogged = false;
redisClient.on('error', (err) => {
    if (!clientErrorLogged) {
        console.warn('⚠️ [Redis Client] Connection failed (Is Redis running on your machine?) Muting further warnings...');
        clientErrorLogged = true;
    }
});
redisClient.on('connect', () => {
    clientErrorLogged = false;
    console.log('✅ Redis Client Connected');
});

let subErrorLogged = false;
redisSubscriber.on('error', (err) => {
    if (!subErrorLogged) {
        console.warn('⚠️ [Redis Subscriber] Connection failed. Muting further warnings...');
        subErrorLogged = true;
    }
});
redisSubscriber.on('connect', () => {
    subErrorLogged = false;
    console.log('✅ Redis Subscriber Connected');
});

module.exports = {
    redisClient,
    redisSubscriber
};
