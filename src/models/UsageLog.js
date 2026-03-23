const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const UsageLog = {
  async increment(clientId) {
    const month = getCurrentMonth();
    const result = await query(
      `INSERT INTO usage_logs (id, client_id, month, call_count, last_called_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (client_id, month) DO UPDATE SET
         call_count = usage_logs.call_count + 1,
         last_called_at = NOW()
       RETURNING *`,
      [uuidv4(), clientId, month]
    );
    return result.rows[0];
  },

  async getCurrentUsage(clientId) {
    const month = getCurrentMonth();
    const result = await query(
      'SELECT * FROM usage_logs WHERE client_id = $1 AND month = $2',
      [clientId, month]
    );
    return result.rows[0] || { client_id: clientId, month, call_count: 0 };
  },

  async getHistory(clientId, months = 6) {
    const result = await query(
      `SELECT * FROM usage_logs 
       WHERE client_id = $1 
       ORDER BY month DESC 
       LIMIT $2`,
      [clientId, months]
    );
    return result.rows;
  },
};

module.exports = UsageLog;
