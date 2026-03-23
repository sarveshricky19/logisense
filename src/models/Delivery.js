const { query, transaction } = require('./db');
const { v4: uuidv4 } = require('uuid');

const Delivery = {
  async upsert(clientId, eventData) {
    const {
      externalId, status, latitude, longitude, address,
      recipientName, recipientPhone, driverName, driverId,
      estimatedDeliveryTime, actualDeliveryTime, weight, notes, metadata,
    } = eventData;

    const deliveryId = uuidv4();
    const eventId = uuidv4();

    return transaction(async (client) => {
      // Upsert delivery
      const deliveryResult = await client.query(
        `INSERT INTO deliveries (id, client_id, external_id, current_status, recipient_name, recipient_phone, driver_name, driver_id, address, latitude, longitude, estimated_delivery_time, actual_delivery_time, weight, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (client_id, external_id) DO UPDATE SET
           current_status = EXCLUDED.current_status,
           latitude = COALESCE(EXCLUDED.latitude, deliveries.latitude),
           longitude = COALESCE(EXCLUDED.longitude, deliveries.longitude),
           address = COALESCE(EXCLUDED.address, deliveries.address),
           recipient_name = COALESCE(EXCLUDED.recipient_name, deliveries.recipient_name),
           recipient_phone = COALESCE(EXCLUDED.recipient_phone, deliveries.recipient_phone),
           driver_name = COALESCE(EXCLUDED.driver_name, deliveries.driver_name),
           driver_id = COALESCE(EXCLUDED.driver_id, deliveries.driver_id),
           estimated_delivery_time = COALESCE(EXCLUDED.estimated_delivery_time, deliveries.estimated_delivery_time),
           actual_delivery_time = COALESCE(EXCLUDED.actual_delivery_time, deliveries.actual_delivery_time),
           weight = COALESCE(EXCLUDED.weight, deliveries.weight),
           notes = COALESCE(EXCLUDED.notes, deliveries.notes),
           metadata = COALESCE(EXCLUDED.metadata, deliveries.metadata),
           updated_at = NOW()
         RETURNING *`,
        [deliveryId, clientId, externalId, status, recipientName, recipientPhone,
         driverName, driverId, address, latitude, longitude,
         estimatedDeliveryTime, actualDeliveryTime, weight, notes,
         metadata ? JSON.stringify(metadata) : '{}']
      );

      const delivery = deliveryResult.rows[0];

      // Record event in timeline
      await client.query(
        `INSERT INTO delivery_events (id, delivery_id, client_id, status, latitude, longitude, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [eventId, delivery.id, clientId, status, latitude, longitude,
         metadata ? JSON.stringify(metadata) : '{}']
      );

      return delivery;
    });
  },

  async findById(clientId, deliveryId) {
    const result = await query(
      'SELECT * FROM deliveries WHERE id = $1 AND client_id = $2',
      [deliveryId, clientId]
    );
    return result.rows[0] || null;
  },

  async findByExternalId(clientId, externalId) {
    const result = await query(
      'SELECT * FROM deliveries WHERE external_id = $1 AND client_id = $2',
      [externalId, clientId]
    );
    return result.rows[0] || null;
  },

  async list(clientId, { status, limit = 20, offset = 0, startDate, endDate } = {}) {
    let sql = 'SELECT * FROM deliveries WHERE client_id = $1';
    const params = [clientId];
    let paramIdx = 2;

    if (status) {
      sql += ` AND current_status = $${paramIdx++}`;
      params.push(status);
    }
    if (startDate) {
      sql += ` AND created_at >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND created_at <= $${paramIdx++}`;
      params.push(endDate);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  },

  async getEvents(deliveryId) {
    const result = await query(
      'SELECT * FROM delivery_events WHERE delivery_id = $1 ORDER BY recorded_at ASC',
      [deliveryId]
    );
    return result.rows;
  },

  async getStats(clientId, { startDate, endDate } = {}) {
    let sql = `
      SELECT 
        current_status,
        COUNT(*)::int as count
      FROM deliveries 
      WHERE client_id = $1
    `;
    const params = [clientId];
    let paramIdx = 2;

    if (startDate) {
      sql += ` AND created_at >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND created_at <= $${paramIdx++}`;
      params.push(endDate);
    }

    sql += ' GROUP BY current_status';

    const result = await query(sql, params);
    return result.rows;
  },

  async updateRiskScore(deliveryId, riskScore, anomalyFlags) {
    const result = await query(
      `UPDATE deliveries SET risk_score = $1, anomaly_flags = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [riskScore, JSON.stringify(anomalyFlags), deliveryId]
    );
    return result.rows[0] || null;
  },
};

module.exports = Delivery;
