const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function generateApiKey() {
  return `ls_${crypto.randomBytes(32).toString('hex')}`;
}

const Client = {
  async create({ name, email, company, tier = 'free' }) {
    const apiKey = generateApiKey();
    const result = await query(
      `INSERT INTO clients (id, api_key, name, email, company, tier)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [uuidv4(), apiKey, name, email, company, tier]
    );
    return result.rows[0];
  },

  async findByApiKey(apiKey) {
    const result = await query(
      'SELECT * FROM clients WHERE api_key = $1 AND is_active = true',
      [apiKey]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await query('SELECT * FROM clients WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async findByEmail(email) {
    const result = await query('SELECT * FROM clients WHERE email = $1', [email]);
    return result.rows[0] || null;
  },

  async updateTier(id, tier) {
    const result = await query(
      `UPDATE clients SET tier = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [tier, id]
    );
    return result.rows[0] || null;
  },

  async deactivate(id) {
    const result = await query(
      `UPDATE clients SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  async list({ limit = 20, offset = 0 } = {}) {
    const result = await query(
      'SELECT id, name, email, company, tier, is_active, created_at FROM clients ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  },
};

module.exports = Client;
