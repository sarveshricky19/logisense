const logger = require('../utils/logger');

/**
 * Statistical anomaly detection on delivery patterns.
 * Analyzes route deviations, timing anomalies, and status transition irregularities.
 */
const AnomalyDetector = {
  /**
   * Detect anomalies in a delivery's event timeline
   */
  analyze(delivery, events) {
    const anomalies = [];

    // Check status transition anomalies
    const statusAnomalies = this.checkStatusTransitions(events);
    anomalies.push(...statusAnomalies);

    // Check timing anomalies
    const timingAnomalies = this.checkTimingPatterns(delivery, events);
    anomalies.push(...timingAnomalies);

    // Check location anomalies
    const locationAnomalies = this.checkLocationPatterns(events);
    anomalies.push(...locationAnomalies);

    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
      severity: this.calculateSeverity(anomalies),
    };
  },

  checkStatusTransitions(events) {
    const anomalies = [];
    const validTransitions = {
      picked_up: ['in_transit', 'failed', 'returned'],
      in_transit: ['out_for_delivery', 'delayed', 'failed', 'returned'],
      out_for_delivery: ['delivered', 'failed', 'delayed', 'returned'],
      delayed: ['in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'],
      delivered: [],
      failed: ['picked_up', 'returned'],
      returned: [],
    };

    for (let i = 1; i < events.length; i++) {
      const prevStatus = events[i - 1].status;
      const currStatus = events[i].status;
      const valid = validTransitions[prevStatus] || [];

      if (!valid.includes(currStatus)) {
        anomalies.push({
          type: 'invalid_transition',
          severity: 'high',
          message: `Invalid status transition: ${prevStatus} → ${currStatus}`,
          timestamp: events[i].recorded_at,
        });
      }
    }

    // Check for repeated status
    for (let i = 1; i < events.length; i++) {
      if (events[i].status === events[i - 1].status) {
        anomalies.push({
          type: 'duplicate_status',
          severity: 'low',
          message: `Duplicate status update: ${events[i].status}`,
          timestamp: events[i].recorded_at,
        });
      }
    }

    return anomalies;
  },

  checkTimingPatterns(delivery, events) {
    const anomalies = [];

    if (events.length >= 2) {
      // Check for suspiciously fast transitions
      for (let i = 1; i < events.length; i++) {
        const timeDiff = new Date(events[i].recorded_at) - new Date(events[i - 1].recorded_at);
        const seconds = timeDiff / 1000;

        if (seconds < 10) {
          anomalies.push({
            type: 'rapid_transition',
            severity: 'medium',
            message: `Suspiciously fast status change (${seconds}s): ${events[i - 1].status} → ${events[i].status}`,
            timestamp: events[i].recorded_at,
          });
        }
      }

      // Check total delivery time
      const totalTime = new Date(events[events.length - 1].recorded_at) - new Date(events[0].recorded_at);
      const hours = totalTime / (1000 * 60 * 60);

      if (hours > 48) {
        anomalies.push({
          type: 'extended_delivery',
          severity: 'high',
          message: `Delivery has been in transit for ${Math.round(hours)} hours`,
          timestamp: events[events.length - 1].recorded_at,
        });
      }
    }

    // Check ETA deviation
    if (delivery.estimated_delivery_time && delivery.actual_delivery_time) {
      const etaDiff = new Date(delivery.actual_delivery_time) - new Date(delivery.estimated_delivery_time);
      const minutesDiff = etaDiff / (1000 * 60);

      if (minutesDiff > 120) {
        anomalies.push({
          type: 'eta_deviation',
          severity: 'high',
          message: `Delivery was ${Math.round(minutesDiff)} minutes late`,
        });
      }
    }

    return anomalies;
  },

  checkLocationPatterns(events) {
    const anomalies = [];
    const eventsWithLocation = events.filter(e => e.latitude && e.longitude);

    if (eventsWithLocation.length >= 2) {
      for (let i = 1; i < eventsWithLocation.length; i++) {
        const dist = haversineDistance(
          eventsWithLocation[i - 1].latitude, eventsWithLocation[i - 1].longitude,
          eventsWithLocation[i].latitude, eventsWithLocation[i].longitude
        );

        const timeDiff = (new Date(eventsWithLocation[i].recorded_at) - new Date(eventsWithLocation[i - 1].recorded_at)) / (1000 * 3600);

        if (timeDiff > 0) {
          const speedKmh = dist / timeDiff;
          if (speedKmh > 200) {
            anomalies.push({
              type: 'impossible_speed',
              severity: 'high',
              message: `Impossible speed detected: ${Math.round(speedKmh)} km/h between updates`,
              timestamp: eventsWithLocation[i].recorded_at,
            });
          }
        }
      }
    }

    return anomalies;
  },

  calculateSeverity(anomalies) {
    if (anomalies.some(a => a.severity === 'high')) return 'high';
    if (anomalies.some(a => a.severity === 'medium')) return 'medium';
    if (anomalies.length > 0) return 'low';
    return 'none';
  },
};

// Haversine distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

module.exports = AnomalyDetector;
