const AnomalyDetector = require('../src/services/anomalyDetector');
const ETAPredictor = require('../src/services/etaPredictor');

describe('AnomalyDetector', () => {
  const baseDelivery = {
    id: 'test-id',
    external_id: 'DEL-001',
    current_status: 'in_transit',
    estimated_delivery_time: null,
    actual_delivery_time: null,
  };

  describe('checkStatusTransitions', () => {
    it('should detect invalid transitions', () => {
      const events = [
        { status: 'delivered', recorded_at: '2025-01-01T10:00:00Z' },
        { status: 'picked_up', recorded_at: '2025-01-01T11:00:00Z' },
      ];
      const result = AnomalyDetector.analyze(baseDelivery, events);
      expect(result.hasAnomalies).toBe(true);
      expect(result.anomalies.some(a => a.type === 'invalid_transition')).toBe(true);
    });

    it('should detect duplicate statuses', () => {
      const events = [
        { status: 'in_transit', recorded_at: '2025-01-01T10:00:00Z' },
        { status: 'in_transit', recorded_at: '2025-01-01T11:00:00Z' },
      ];
      const result = AnomalyDetector.analyze(baseDelivery, events);
      expect(result.anomalies.some(a => a.type === 'duplicate_status')).toBe(true);
    });

    it('should pass valid transitions', () => {
      const events = [
        { status: 'picked_up', recorded_at: '2025-01-01T10:00:00Z' },
        { status: 'in_transit', recorded_at: '2025-01-01T11:00:00Z' },
        { status: 'out_for_delivery', recorded_at: '2025-01-01T13:00:00Z' },
        { status: 'delivered', recorded_at: '2025-01-01T14:00:00Z' },
      ];
      const result = AnomalyDetector.analyze(baseDelivery, events);
      const transitionAnomalies = result.anomalies.filter(a => a.type === 'invalid_transition');
      expect(transitionAnomalies.length).toBe(0);
    });
  });

  describe('checkTimingPatterns', () => {
    it('should detect rapid transitions', () => {
      const events = [
        { status: 'picked_up', recorded_at: '2025-01-01T10:00:00.000Z' },
        { status: 'in_transit', recorded_at: '2025-01-01T10:00:05.000Z' },
      ];
      const result = AnomalyDetector.analyze(baseDelivery, events);
      expect(result.anomalies.some(a => a.type === 'rapid_transition')).toBe(true);
    });

    it('should detect extended deliveries', () => {
      const events = [
        { status: 'picked_up', recorded_at: '2025-01-01T10:00:00Z' },
        { status: 'in_transit', recorded_at: '2025-01-04T10:00:00Z' }, // 3 days later
      ];
      const result = AnomalyDetector.analyze(baseDelivery, events);
      expect(result.anomalies.some(a => a.type === 'extended_delivery')).toBe(true);
    });
  });

  describe('checkLocationPatterns', () => {
    it('should detect impossible speed', () => {
      const events = [
        { status: 'picked_up', latitude: 19.076, longitude: 72.877, recorded_at: '2025-01-01T10:00:00Z' },
        { status: 'in_transit', latitude: 28.613, longitude: 77.209, recorded_at: '2025-01-01T10:01:00Z' }, // Mumbai to Delhi in 1 min
      ];
      const result = AnomalyDetector.analyze(baseDelivery, events);
      expect(result.anomalies.some(a => a.type === 'impossible_speed')).toBe(true);
    });
  });

  describe('calculateSeverity', () => {
    it('should return none when no anomalies', () => {
      const result = AnomalyDetector.analyze(baseDelivery, []);
      expect(result.severity).toBe('none');
    });
  });
});

describe('ETAPredictor', () => {
  const baseDelivery = {
    current_status: 'in_transit',
    estimated_delivery_time: null,
    actual_delivery_time: null,
  };

  it('should return 0 for delivered status', () => {
    const result = ETAPredictor.predict({ ...baseDelivery, current_status: 'delivered' }, []);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.method).toBe('terminal_status');
  });

  it('should use baseline for no history', () => {
    const result = ETAPredictor.predict(baseDelivery, []);
    expect(result.estimatedMinutes).toBeGreaterThan(0);
    expect(result.method).toBe('baseline');
  });

  it('should adjust with historical data', () => {
    const events = [
      { status: 'picked_up', recorded_at: '2025-01-01T10:00:00Z' },
      { status: 'in_transit', recorded_at: '2025-01-01T13:00:00Z' }, // 3 hours
    ];
    const result = ETAPredictor.predict(baseDelivery, events);
    expect(result.method).toBe('historical_adjusted');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('should calculate correction from original ETA', () => {
    const delivery = {
      ...baseDelivery,
      estimated_delivery_time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    };
    const result = ETAPredictor.predict(delivery, []);
    expect(result.correctionMinutes).toBeGreaterThan(0); // should be delayed
  });
});
