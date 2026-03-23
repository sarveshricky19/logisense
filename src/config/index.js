require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://logisense:logisense_pass@localhost:5432/logisense',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  wsHeartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 30000,

  // Billing tiers
  tiers: {
    free: {
      name: 'Free',
      monthlyLimit: parseInt(process.env.FREE_TIER_LIMIT, 10) || 500,
      priceInr: 0,
    },
    starter: {
      name: 'Starter',
      monthlyLimit: parseInt(process.env.STARTER_TIER_LIMIT, 10) || 10000,
      priceInr: 999,
    },
    growth: {
      name: 'Growth',
      monthlyLimit: parseInt(process.env.GROWTH_TIER_LIMIT, 10) || 100000,
      priceInr: 3999,
    },
  },
};
