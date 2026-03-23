const config = require('../config');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = config.nodeEnv === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug;

function formatMessage(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
}

const logger = {
  error(message, meta) {
    if (currentLevel >= LOG_LEVELS.error) console.error(formatMessage('error', message, meta));
  },
  warn(message, meta) {
    if (currentLevel >= LOG_LEVELS.warn) console.warn(formatMessage('warn', message, meta));
  },
  info(message, meta) {
    if (currentLevel >= LOG_LEVELS.info) console.log(formatMessage('info', message, meta));
  },
  debug(message, meta) {
    if (currentLevel >= LOG_LEVELS.debug) console.log(formatMessage('debug', message, meta));
  },
};

module.exports = logger;
