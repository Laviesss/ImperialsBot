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
                    )
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
                    )
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
                await dbClient.db().collection('config').updateOne(
                    { type: 'bots' },
                    { $set: { data: bots, updatedAt: new Date() } },
                    { upsert: true }
                );
                return true;

            case 'postgres':
                await dbClient.query(
                    'INSERT INTO imperials_config (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()',
                    ['bots', JSON.stringify(bots)]
                );
                return true;

            case 'mysql':
                await dbClient.query(
                    'INSERT INTO imperials_config (config_key, config_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_data = ?',
                    ['bots', JSON.stringify(bots), JSON.stringify(bots)]
                );
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
                await dbClient.db().collection('config').updateOne(
                    { type: 'settings' },
                    { $set: { data: settings, updatedAt: new Date() } },
                    { upsert: true }
                );
                return true;

            case 'postgres':
                await dbClient.query(
                    'INSERT INTO imperials_config (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()',
                    ['settings', JSON.stringify(settings)]
                );
                return true;

            case 'mysql':
                await dbClient.query(
                    'INSERT INTO imperials_config (config_key, config_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_data = ?',
                    ['settings', JSON.stringify(settings), JSON.stringify(settings)]
                );
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

export function isDatabaseConnected() {
    return dbClient !== null;
}

export function getDatabaseType() {
    return dbType;
}

export async function closeDatabase() {
    if (!dbClient) return;
    
    try {
        switch (dbType) {
            case 'mongodb':
                await dbClient.close();
                break;
            case 'postgres':
                await dbClient.end();
                break;
            case 'mysql':
                await dbClient.end();
                break;
            case 'redis':
                await dbClient.quit();
                break;
        }
        dbClient = null;
        dbType = null;
        console.log('\x1b[32m✓ Database connection closed\x1b[0m');
    } catch (err) {
        console.log('\x1b[31m✗ Error closing database:', err.message, '\x1b[0m');
    }
}