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
                    CREATE TABLE IF NOT EXISTS chat_logs (
                        id SERIAL PRIMARY KEY,
                        bot_username VARCHAR(255),
                        sender VARCHAR(255),
                        message TEXT,
                        type VARCHAR(50),
                        timestamp TIMESTAMP DEFAULT NOW()
                    )
                `);
                dbClient = pgClient;
                console.log('\x1b[32m✓ Connected to PostgreSQL\x1b[0m');
                return { success: true, type: 'postgres' };

            case 'mysql':
                const mysql = await import('mysql2/promise');
                const mysqlClient = await mysql.createPool({ connectionString, ...options });
                await mysqlClient.query(`
                    CREATE TABLE IF NOT EXISTS chat_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        bot_username VARCHAR(255),
                        sender VARCHAR(255),
                        message TEXT,
                        type VARCHAR(50),
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                dbClient = mysqlClient;
                console.log('\x1b[32m✓ Connected to MySQL\x1b[0m');
                return { success: true, type: 'mysql' };

            default:
                return { success: false, error: `Unknown database type: ${type}` };
        }
    } catch (err) {
        console.log('\x1b[31m✗ Database connection failed:', err.message, '\x1b[0m');
        return { success: false, error: err.message };
    }
}

export async function saveChatMessage(botUsername, sender, message, type) {
    if (!dbClient) return false;

    try {
        switch (dbType) {
            case 'mongodb':
                await dbClient.db().collection('chat_logs').insertOne({
                    bot_username: botUsername,
                    sender,
                    message,
                    type,
                    timestamp: new Date()
                });
                return true;

            case 'postgres':
                await dbClient.query(
                    'INSERT INTO chat_logs (bot_username, sender, message, type) VALUES ($1, $2, $3, $4)',
                    [botUsername, sender, message, type]
                );
                return true;

            case 'mysql':
                await dbClient.query(
                    'INSERT INTO chat_logs (bot_username, sender, message, type) VALUES (?, ?, ?, ?)',
                    [botUsername, sender, message, type]
                );
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
                return await dbClient.db().collection('chat_logs')
                    .find({ bot_username: botUsername })
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .toArray();

            case 'postgres':
                const pgResult = await dbClient.query(
                    'SELECT sender, message, type, timestamp FROM chat_logs WHERE bot_username = $1 ORDER BY timestamp DESC LIMIT $2',
                    [botUsername, limit]
                );
                return pgResult.rows;

            case 'mysql':
                const [mysqlRows] = await dbClient.query(
                    'SELECT sender, message, type, timestamp FROM chat_logs WHERE bot_username = ? ORDER BY timestamp DESC LIMIT ?',
                    [botUsername, limit]
                );
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

export async function closeDatabase() {
    if (!dbClient) return;
    try {
        if (dbType === 'postgres') await dbClient.end();
        else if (dbType === 'mysql') await dbClient.end();
        else if (dbType === 'mongodb') await dbClient.close();
        dbClient = null;
        console.log('\x1b[32m✓ Database connection closed\x1b[0m');
    } catch (err) {
        console.log('\x1b[31m✗ Error closing database:', err.message, '\x1b[0m');
    }
}
