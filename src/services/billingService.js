const UsageLog = require('../models/UsageLog');
const config = require('../config');
const logger = require('../utils/logger');

const BillingService = {
  /**
   * Get billing summary for a client
   */
  async getSummary(clientId, tier) {
    const currentUsage = await UsageLog.getCurrentUsage(clientId);
    const history = await UsageLog.getHistory(clientId, 12);
    const tierConfig = config.tiers[tier] || config.tiers.free;

    const totalCalls = history.reduce((sum, h) => sum + h.call_count, 0);
    const avgMonthly = history.length > 0 ? Math.round(totalCalls / history.length) : 0;

    // Recommend tier based on usage
    const recommendation = this.getRecommendedTier(avgMonthly, tier);

    return {
      currentPlan: {
        tier,
        name: tierConfig.name,
        priceInr: tierConfig.priceInr,
        monthlyLimit: tierConfig.monthlyLimit,
      },
      currentMonth: {
        callCount: currentUsage.call_count,
        remaining: Math.max(0, tierConfig.monthlyLimit - currentUsage.call_count),
        usagePercent: Math.round((currentUsage.call_count / tierConfig.monthlyLimit) * 100),
      },
      historicalAvg: avgMonthly,
      recommendation,
    };
  },

  getRecommendedTier(avgMonthly, currentTier) {
    const tiers = Object.entries(config.tiers);

    for (const [key, tier] of tiers) {
      if (avgMonthly <= tier.monthlyLimit * 0.8) {
        if (key !== currentTier) {
          return {
            suggestedTier: key,
            reason: avgMonthly < config.tiers[currentTier]?.monthlyLimit * 0.3
              ? 'Your usage is well below your current plan. Consider downgrading to save costs.'
              : `The ${tier.name} plan fits your average usage of ${avgMonthly} calls/month.`,
          };
        }
        return { suggestedTier: currentTier, reason: 'Current plan is optimal for your usage.' };
      }
    }

    return {
      suggestedTier: 'growth',
      reason: 'Your usage exceeds all standard plans. Contact us for enterprise pricing.',
    };
  },
};

module.exports = BillingService;
