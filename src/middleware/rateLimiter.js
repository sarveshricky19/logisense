const UsageLog = require('../models/UsageLog');
const config = require('../config');
const logger = require('../utils/logger');

async function rateLimiter(req, res, next) {
  if (!req.client) {
    return next();
  }

  try {
    const usage = await UsageLog.getCurrentUsage(req.client.id);
    const tierConfig = config.tiers[req.client.tier] || config.tiers.free;
    const remaining = tierConfig.monthlyLimit - usage.call_count;

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': tierConfig.monthlyLimit.toString(),
      'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
      'X-RateLimit-Tier': req.client.tier,
    });

    if (remaining <= 0) {
      logger.warn('Rate limit exceeded', {
        clientId: req.client.id,
        tier: req.client.tier,
        usage: usage.call_count,
      });

      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `You have exceeded your ${tierConfig.name} tier limit of ${tierConfig.monthlyLimit} calls/month. Upgrade your plan to continue.`,
        currentUsage: usage.call_count,
        limit: tierConfig.monthlyLimit,
        tier: req.client.tier,
        upgradeOptions: getUpgradeOptions(req.client.tier),
      });
    }

    // Increment usage
    await UsageLog.increment(req.client.id);
    next();
  } catch (error) {
    logger.error('Rate limiter error', { error: error.message });
    next(error);
  }
}

function getUpgradeOptions(currentTier) {
  const options = [];
  const tiers = Object.entries(config.tiers);
  let foundCurrent = false;

  for (const [key, tier] of tiers) {
    if (key === currentTier) {
      foundCurrent = true;
      continue;
    }
    if (foundCurrent) {
      options.push({
        tier: key,
        name: tier.name,
        monthlyLimit: tier.monthlyLimit,
        priceInr: tier.priceInr,
      });
    }
  }

  return options;
}

module.exports = rateLimiter;
