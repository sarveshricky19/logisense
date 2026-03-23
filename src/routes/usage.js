const express = require('express');
const router = express.Router();
const UsageLog = require('../models/UsageLog');
const config = require('../config');

// GET /api/v1/usage - Current usage stats
router.get('/', async (req, res, next) => {
  try {
    const currentUsage = await UsageLog.getCurrentUsage(req.client.id);
    const history = await UsageLog.getHistory(req.client.id, 6);
    const tierConfig = config.tiers[req.client.tier] || config.tiers.free;

    res.json({
      success: true,
      data: {
        client: {
          id: req.client.id,
          name: req.client.name,
          tier: req.client.tier,
        },
        currentMonth: {
          month: currentUsage.month,
          callCount: currentUsage.call_count,
          limit: tierConfig.monthlyLimit,
          remaining: Math.max(0, tierConfig.monthlyLimit - currentUsage.call_count),
          usagePercent: Math.round((currentUsage.call_count / tierConfig.monthlyLimit) * 100),
        },
        billing: {
          plan: tierConfig.name,
          priceInr: tierConfig.priceInr,
          monthlyLimit: tierConfig.monthlyLimit,
        },
        history: history.map(h => ({
          month: h.month,
          callCount: h.call_count,
        })),
        availablePlans: Object.entries(config.tiers).map(([key, tier]) => ({
          tier: key,
          name: tier.name,
          monthlyLimit: tier.monthlyLimit,
          priceInr: tier.priceInr,
          isCurrent: key === req.client.tier,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
