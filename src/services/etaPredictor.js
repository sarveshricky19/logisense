const logger = require('../utils/logger');

/**
 * Dynamic ETA prediction using historical patterns and current delivery state.
 */
const ETAPredictor = {
  // Average transit times by status (in minutes) — baseline estimates
  baselineMinutes: {
    picked_up: 180,       // 3 hours to in_transit
    in_transit: 120,      // 2 hours to out_for_delivery
    out_for_delivery: 60, // 1 hour to delivered
    delayed: 90,          // 1.5 hours (uncertain)
  },

  /**
   * Predict ETA for a delivery based on current status and history
   */
  predict(delivery, events) {
    const now = new Date();
    const currentStatus = delivery.current_status;

    // If already delivered or terminal, no prediction needed
    if (['delivered', 'failed', 'returned'].includes(currentStatus)) {
      return {
        estimatedMinutes: 0,
        predictedDeliveryTime: delivery.actual_delivery_time || null,
        confidence: 1.0,
        correctionMinutes: 0,
        method: 'terminal_status',
      };
    }

    // Calculate base ETA
    const remainingSteps = this.getRemainingSteps(currentStatus);
    let baseMinutes = remainingSteps.reduce((sum, step) => sum + (this.baselineMinutes[step] || 60), 0);

    // Adjust based on historical transit times from events
    const historicalAdjustment = this.calculateHistoricalAdjustment(events);
    baseMinutes = Math.round(baseMinutes * historicalAdjustment.factor);

    // Adjust for time of day (deliveries take longer at night)
    const hourAdjustment = this.getTimeOfDayAdjustment(now.getHours());
    baseMinutes = Math.round(baseMinutes * hourAdjustment);

    const predictedTime = new Date(now.getTime() + baseMinutes * 60 * 1000);

    // Calculate correction from original estimate
    let correctionMinutes = 0;
    if (delivery.estimated_delivery_time) {
      const originalEta = new Date(delivery.estimated_delivery_time);
      correctionMinutes = Math.round((predictedTime - originalEta) / (1000 * 60));
    }

    return {
      estimatedMinutes: baseMinutes,
      predictedDeliveryTime: predictedTime.toISOString(),
      confidence: historicalAdjustment.confidence,
      correctionMinutes,
      method: historicalAdjustment.dataPoints > 0 ? 'historical_adjusted' : 'baseline',
    };
  },

  getRemainingSteps(currentStatus) {
    const fullPipeline = ['picked_up', 'in_transit', 'out_for_delivery'];
    const currentIdx = fullPipeline.indexOf(currentStatus);
    if (currentIdx === -1) return ['delayed'];
    return fullPipeline.slice(currentIdx);
  },

  calculateHistoricalAdjustment(events) {
    if (events.length < 2) {
      return { factor: 1.0, confidence: 0.3, dataPoints: 0 };
    }

    const transitions = [];
    for (let i = 1; i < events.length; i++) {
      const diff = (new Date(events[i].recorded_at) - new Date(events[i - 1].recorded_at)) / (1000 * 60);
      const expected = this.baselineMinutes[events[i - 1].status] || 60;
      transitions.push(diff / expected);
    }

    const avgFactor = transitions.reduce((a, b) => a + b, 0) / transitions.length;
    const confidence = Math.min(0.9, 0.3 + transitions.length * 0.1);

    return {
      factor: Math.max(0.3, Math.min(3.0, avgFactor)),
      confidence,
      dataPoints: transitions.length,
    };
  },

  getTimeOfDayAdjustment(hour) {
    if (hour >= 22 || hour < 6) return 1.5;  // Night
    if (hour >= 7 && hour < 10) return 1.3;   // Morning rush
    if (hour >= 17 && hour < 20) return 1.3;  // Evening rush
    return 1.0;
  },
};

module.exports = ETAPredictor;
