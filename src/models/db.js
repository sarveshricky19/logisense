const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

// Query helper
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { text: text.substring(0, 80), duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query failed', { text: text.substring(0, 80), error: error.message });
    throw error;
  }
}

// Transaction helper
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Run migrations
async function migrate() {
  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    logger.info(`Running migration: ${file}`);
    await pool.query(sql);
    logger.info(`Migration complete: ${file}`);
  }
}

// Health check
async function healthCheck() {
  try {
    const result = await pool.query('SELECT NOW()');
    return { status: 'healthy', timestamp: result.rows[0].now };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function close() {
  await pool.end();
}

// Run migrations if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      logger.info('All migrations applied successfully');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { query, transaction, healthCheck, close, pool };
