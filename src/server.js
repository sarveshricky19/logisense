const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const createTrackingSocket = require('./ws/trackingSocket');

// Routes
const healthRoutes = require('./routes/health');
const deliveryRoutes = require('./routes/deliveries');
const insightRoutes = require('./routes/insights');
const usageRoutes = require('./routes/usage');

// Client registration route (no auth needed)
const Client = require('./models/Client');
const { clientRegistrationSchema } = require('./utils/validators');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Static files (landing page)
app.use(express.static(path.join(__dirname, '../public')));

// Public routes
app.use('/health', healthRoutes);

// Client registration (public)
app.post('/api/v1/clients/register', async (req, res, next) => {
  try {
    const { error, value } = clientRegistrationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details.map(d => d.message).join(', '),
      });
    }

    // Check if email already registered
    const existing = await Client.findByEmail(value.email);
    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email already exists',
      });
    }

    const client = await Client.create(value);

    logger.info('New client registered', { clientId: client.id, tier: client.tier });

    res.status(201).json({
      success: true,
      data: {
        id: client.id,
        apiKey: client.api_key,
        name: client.name,
        email: client.email,
        tier: client.tier,
        message: 'Store your API key securely. Use it in the X-API-Key header for all authenticated requests.',
      },
    });
  } catch (err) {
    next(err);
  }
});

// Authenticated routes
app.use('/api/v1/deliveries', auth, rateLimiter, deliveryRoutes);
app.use('/api/v1/insights', auth, rateLimiter, insightRoutes);
app.use('/api/v1/usage', auth, usageRoutes);

// Error handler
app.use(errorHandler);

// WebSocket setup
const { emit: wsEmit } = createTrackingSocket(server, config);
app.locals.wsEmit = wsEmit;

// Graceful shutdown
function gracefulShutdown(signal) {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  server.close(async () => {
    const { close } = require('./models/db');
    await close();
    logger.info('Server shut down gracefully');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
if (require.main === module) {
  server.listen(config.port, () => {
    logger.info(`LogiSense API running on port ${config.port}`, {
      environment: config.nodeEnv,
      port: config.port,
    });
  });
}

module.exports = { app, server };
