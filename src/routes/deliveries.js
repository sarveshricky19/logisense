const express = require('express');
const router = express.Router();
const Delivery = require('../models/Delivery');
const { deliveryEventSchema, batchDeliverySchema } = require('../utils/validators');
const logger = require('../utils/logger');

// POST /api/v1/deliveries - Ingest single delivery event
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = deliveryEventSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details.map(d => d.message).join(', '),
      });
    }

    const delivery = await Delivery.upsert(req.client.id, value);

    // Emit via WebSocket if available
    if (req.app.locals.wsEmit) {
      req.app.locals.wsEmit(req.client.id, delivery.id, {
        type: 'delivery_update',
        deliveryId: delivery.id,
        externalId: delivery.external_id,
        status: delivery.current_status,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info('Delivery event ingested', {
      clientId: req.client.id,
      deliveryId: delivery.id,
      status: delivery.current_status,
    });

    res.status(201).json({
      success: true,
      data: formatDelivery(delivery),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/deliveries/batch - Ingest batch delivery events
router.post('/batch', async (req, res, next) => {
  try {
    const { error, value } = batchDeliverySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details.map(d => d.message).join(', '),
      });
    }

    const results = [];
    const errors = [];

    for (const event of value.events) {
      try {
        const delivery = await Delivery.upsert(req.client.id, event);
        results.push(formatDelivery(delivery));

        if (req.app.locals.wsEmit) {
          req.app.locals.wsEmit(req.client.id, delivery.id, {
            type: 'delivery_update',
            deliveryId: delivery.id,
            externalId: delivery.external_id,
            status: delivery.current_status,
          });
        }
      } catch (err) {
        errors.push({ externalId: event.externalId, error: err.message });
      }
    }

    logger.info('Batch delivery events ingested', {
      clientId: req.client.id,
      total: value.events.length,
      success: results.length,
      failed: errors.length,
    });

    res.status(201).json({
      success: true,
      data: {
        processed: results.length,
        failed: errors.length,
        deliveries: results,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/deliveries - List deliveries
router.get('/', async (req, res, next) => {
  try {
    const { status, limit = 20, offset = 0, startDate, endDate } = req.query;
    const deliveries = await Delivery.list(req.client.id, {
      status,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      offset: parseInt(offset, 10) || 0,
      startDate,
      endDate,
    });

    res.json({
      success: true,
      data: deliveries.map(formatDelivery),
      pagination: {
        limit: parseInt(limit, 10) || 20,
        offset: parseInt(offset, 10) || 0,
        count: deliveries.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/deliveries/:id - Get delivery detail
router.get('/:id', async (req, res, next) => {
  try {
    const delivery = await Delivery.findById(req.client.id, req.params.id);

    if (!delivery) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Delivery not found',
      });
    }

    const events = await Delivery.getEvents(delivery.id);

    res.json({
      success: true,
      data: {
        ...formatDelivery(delivery),
        timeline: events.map(e => ({
          status: e.status,
          latitude: e.latitude,
          longitude: e.longitude,
          recordedAt: e.recorded_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/deliveries/stats/summary - Get delivery stats
router.get('/stats/summary', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await Delivery.getStats(req.client.id, { startDate, endDate });

    const total = stats.reduce((sum, s) => sum + s.count, 0);

    res.json({
      success: true,
      data: {
        total,
        byStatus: stats.reduce((acc, s) => {
          acc[s.current_status] = s.count;
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

function formatDelivery(d) {
  return {
    id: d.id,
    externalId: d.external_id,
    status: d.current_status,
    recipientName: d.recipient_name,
    recipientPhone: d.recipient_phone,
    driverName: d.driver_name,
    driverId: d.driver_id,
    address: d.address,
    latitude: d.latitude,
    longitude: d.longitude,
    estimatedDeliveryTime: d.estimated_delivery_time,
    actualDeliveryTime: d.actual_delivery_time,
    weight: d.weight,
    notes: d.notes,
    metadata: d.metadata,
    riskScore: d.risk_score,
    anomalyFlags: d.anomaly_flags,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

module.exports = router;
