const Client = require('../models/Client');
const logger = require('../utils/logger');

async function auth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Provide your API key in the X-API-Key header',
    });
  }

  try {
    const client = await Client.findByApiKey(apiKey);

    if (!client) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid or has been deactivated',
      });
    }

    req.client = client;
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message });
    next(error);
  }
}

module.exports = auth;
