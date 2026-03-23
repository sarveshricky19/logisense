const express = require('express');
const router = express.Router();
const { healthCheck } = require('../models/db');

router.get('/', async (req, res) => {
  const dbHealth = await healthCheck();
  const status = dbHealth.status === 'healthy' ? 200 : 503;

  res.status(status).json({
    service: 'LogiSense API',
    version: '1.0.0',
    status: dbHealth.status === 'healthy' ? 'operational' : 'degraded',
    uptime: process.uptime(),
    database: dbHealth,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
