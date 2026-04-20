import axios from 'axios';

let dbClient = null;
let dbType = null;
let dbConfig = null;

export async function initDatabase(config) {
    const { type, connectionString, ...options } = config;
    dbType = type;
    dbConfig = config;

    try {
        switch (type) {
            case 'mongodb':
                const { MongoClient } = await import('mongodb');
                const client = new MongoClient(connectionString);
                await client.connect();
                dbClient = client;
                console.log('\x1b[32m✓ Connected to MongoDB\x1b[0m');
                return { success: true, type: 'mongodb' };

            case 'postgres':
                const { default: pg } = await import('pg');
                const pgClient = new pg.Client({ connectionString, ...options });
                await pgClient.connect();
                await pgClient.query(`
                    CREATE TABLE IF NOT EXISTS imperials_config (
                        key VARCHAR(100) PRIMARY KEY,
                        data JSONB NOT NULL,
                        updated_at TIMESTAMP DEFAULT NOW()
                    );
                    CREATE TABLE IF NOT EXISTS chat_logs (
                        id SERIAL PRIMARY KEY,
                        bot_username VARCHAR(255),
                        sender VARCHAR(255),
                        message TEXT,
                        type VARCHAR(50),
                        timestamp TIMESTAMP DEFAULT NOW()
                    );
                `);
                dbClient = pgClient;
                console.log('\x1b[32m✓ Connected to PostgreSQL\x1b[0m');
                return { success: true, type: 'postgres' };

            case 'mysql':
                const mysql = await import('mysql2/promise');
                const mysqlClient = await mysql.createPool({ connectionString, ...options });
                await mysqlClient.query(`
                    CREATE TABLE IF NOT EXISTS imperials_config (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        config_key VARCHAR(100) UNIQUE NOT NULL,
                        config_data JSON NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS chat_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        bot_username VARCHAR(255),
                        sender VARCHAR(255),
                        message TEXT,
                        type VARCHAR(50),
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                `);
                dbClient = mysqlClient;
                console.log('\x1b[32m✓ Connected to MySQL\x1b[0m');
                return { success: true, type: 'mysql' };

            case 'redis':
                const redis = await import('redis');
                const redisClient = redis.createClient({ url: connectionString, ...options });
                await redisClient.connect();
                dbClient = redisClient;
                console.log('\x1b[32m✓ Connected to Redis\x1b[0m');
                return { success: true, type: 'redis' };

            default:
                return { success: false, error: `Unknown database type: ${type}` };
        }
    } catch (err) {
        console.log('\x1b[31m✗ Database connection failed:', err.message, '\x1b[0m');
        return { success: false, error: err.message };
    }
}

export async function loadBotsFromDB() {
    if (!dbClient) return null;
    try {
        switch (dbType) {
            case 'mongodb':
                const mongoConfig = await dbClient.db().collection('config').findOne({ type: 'bots' });
                return mongoConfig?.data || null;
            case 'postgres':
                const pgResult = await dbClient.query('SELECT data FROM imperials_config WHERE key = $1', ['bots']);
                return pgResult.rows[0]?.data || null;
            case 'mysql':
                const [mysqlRows] = await dbClient.query('SELECT config_data FROM imperials_config WHERE config_key = ?', ['bots']);
                return mysqlRows[0]?.config_data || null;
            case 'redis':
                const redisBots = await dbClient.get('imperials:bots');
                return redisBots ? JSON.parse(redisBots) : null;
        }
    } catch (err) {
        console.log('\x1b[31m✗ Failed to load bots from database:', err.message, '\x1b[0m');
        return null;
    }
}

export async function saveBotsToDB(bots) {
    if (!dbClient) return false;
    try {
        switch (dbType) {
            case 'mongodb':
                await dbClient.db().collection('config').updateOne({ type: 'bots' }, { $set: { data: bots, updatedAt: new Date() } }, { upsert: true });
                return true;
            case 'postgres':
                await dbClient.query('INSERT INTO imperials_config (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()', ['bots', JSON.stringify(bots)]);
                return true;
            case 'mysql':
                await dbClient.query('INSERT INTO imperials_config (config_key, config_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_data = ?', ['bots', JSON.stringify(bots), JSON.stringify(bots)]);
                return true;
            case 'redis':
                await dbClient.set('imperials:bots', JSON.stringify(bots));
                return true;
        }
    } catch (err) {
        console.log('\x1b[31m✗ Failed to save bots to database:', err.message, '\x1b[0m');
        return false;
    }
}

export async function loadSettingsFromDB() {
    if (!dbClient) return null;
    try {
        switch (dbType) {
            case 'mongodb':
                const mongoConfig = await dbClient.db().collection('config').findOne({ type: 'settings' });
                return mongoConfig?.data || null;
            case 'postgres':
                const pgResult = await dbClient.query('SELECT data FROM imperials_config WHERE key = $1', ['settings']);
                return pgResult.rows[0]?.data || null;
            case 'mysql':
                const [mysqlRows] = await dbClient.query('SELECT config_data FROM imperials_config WHERE config_key = ?', ['settings']);
                return mysqlRows[0]?.config_data || null;
            case 'redis':
                const redisSettings = await dbClient.get('imperials:settings');
                return redisSettings ? JSON.parse(redisSettings) : null;
        }
    } catch (err) {
        console.log('\x1b[31m✗ Failed to load settings from database:', err.message, '\x1b[0m');
        return null;
    }
}

export async function saveSettingsToDB(settings) {
    if (!dbClient) return false;
    try {
        switch (dbType) {
            case 'mongodb':
                await dbClient.db().collection('config').updateOne({ type: 'settings' }, { $set: { data: settings, updatedAt: new Date() } }, { upsert: true });
                return true;
            case 'postgres':
                await dbClient.query('INSERT INTO imperials_config (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()', ['settings', JSON.stringify(settings)]);
                return true;
            case 'mysql':
                await dbClient.query('INSERT INTO imperials_config (config_key, config_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_data = ?', ['settings', JSON.stringify(settings), JSON.stringify(settings)]);
                return true;
            case 'redis':
                await dbClient.set('imperials:settings', JSON.stringify(settings));
                return true;
        }
    } catch (err) {
        console.log('\x1b[31m✗ Failed to save settings to database:', err.message, '\x1b[0m');
        return false;
    }
}

export async function saveChatMessage(botUsername, sender, message, type) {
    if (!dbClient) return false;
    try {
        switch (dbType) {
            case 'mongodb':
                await dbClient.db().collection('chat_logs').insertOne({ bot_username: botUsername, sender, message, type, timestamp: new Date() });
                return true;
            case 'postgres':
                await dbClient.query('INSERT INTO chat_logs (bot_username, sender, message, type) VALUES ($1, $2, $3, $4)', [botUsername, sender, message, type]);
                return true;
            case 'mysql':
                await dbClient.query('INSERT INTO chat_logs (bot_username, sender, message, type) VALUES (?, ?, ?, ?)', [botUsername, sender, message, type]);
                return true;
        }
    } catch (err) {
        console.log('\x1b[31m✗ Failed to save chat message:', err.message, '\x1b[0m');
        return false;
    }
}

export async function loadChatHistory(botUsername, limit = 100) {
    if (!dbClient) return null;
    try {
        switch (dbType) {
            case 'mongodb':
                return await dbClient.db().collection('chat_logs').find({ bot_username: botUsername }).sort({ timestamp: -1 }).limit(limit).toArray();
            case 'postgres':
                const pgResult = await dbClient.query('SELECT sender, message, type, timestamp FROM chat_logs WHERE bot_username = $1 ORDER BY timestamp DESC LIMIT $2', [botUsername, limit]);
                return pgResult.rows;
            case 'mysql':
                const [mysqlRows] = await dbClient.query('SELECT sender, message, type, timestamp FROM chat_logs WHERE bot_username = ? ORDER BY timestamp DESC LIMIT ?', [botUsername, limit]);
                return mysqlRows;
        }
    } catch (err) {
        console.log('\x1b[31m✗ Failed to load chat history:', err.message, '\x1b[0m');
        return null;
    }
}

export function isDatabaseConnected() {
    return dbClient !== null;
}

export function getDatabaseType() {
    return dbType;
}

export async function closeDatabase() {
    if (!dbClient) return;
    try {
        if (dbType === 'postgres') await dbClient.end();
        else if (dbType === 'mysql') await dbClient.end();
        else if (dbType === 'mongodb') await dbClient.close();
        else if (dbType === 'redis') await dbClient.quit();
        dbClient = null;
        dbType = null;
        console.log('\x1b[32m✓ Database connection closed\x1b[0m');
    } catch (err) {
        console.log('\x1b[31m✗ Error closing database:', err.message, '\x1b[0m');
    }
}
