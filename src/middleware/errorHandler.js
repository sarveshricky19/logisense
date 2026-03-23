const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.isJoi) {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.details.map(d => d.message).join(', '),
      details: err.details,
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A resource with this identifier already exists',
    });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : err.message,
    message: status === 500
      ? 'An unexpected error occurred. Please try again later.'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
