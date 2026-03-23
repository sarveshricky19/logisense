const express = require('express');
const router = express.Router();
const { query } = require('../models/db');
const Delivery = require('../models/Delivery');
const { generateDeliveryInsight, generateBatchSummary } = require('../services/aiService');
const AnomalyDetector = require('../services/anomalyDetector');
const ETAPredictor = require('../services/etaPredictor');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// GET /api/v1/insights/:deliveryId - AI insight for a single delivery
router.get('/:deliveryId', async (req, res, next) => {
  try {
    const delivery = await Delivery.findById(req.client.id, req.params.deliveryId);

    if (!delivery) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Delivery not found',
      });
    }

    const events = await Delivery.getEvents(delivery.id);

    // Run all analysis in parallel
    const [aiInsight, anomalyResult, etaPrediction] = await Promise.all([
      generateDeliveryInsight(delivery, events),
      Promise.resolve(AnomalyDetector.analyze(delivery, events)),
      Promise.resolve(ETAPredictor.predict(delivery, events)),
    ]);

    // Cache the insight
    await query(
      `INSERT INTO insights (id, delivery_id, client_id, risk_score, anomaly_flags, eta_correction_minutes, ai_summary, raw_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuidv4(), delivery.id, req.client.id, aiInsight.riskScore,
       JSON.stringify(aiInsight.anomalyFlags), aiInsight.etaCorrectionMinutes,
       aiInsight.summary, JSON.stringify(aiInsight.rawResponse)]
    );

    // Update delivery risk score
    await Delivery.updateRiskScore(delivery.id, aiInsight.riskScore, aiInsight.anomalyFlags);

    res.json({
      success: true,
      data: {
        deliveryId: delivery.id,
        externalId: delivery.external_id,
        currentStatus: delivery.current_status,
        aiAnalysis: {
          riskScore: aiInsight.riskScore,
          riskLevel: getRiskLevel(aiInsight.riskScore),
          anomalyFlags: aiInsight.anomalyFlags,
          summary: aiInsight.summary,
        },
        anomalyDetection: {
          hasAnomalies: anomalyResult.hasAnomalies,
          severity: anomalyResult.severity,
          anomalies: anomalyResult.anomalies,
        },
        etaPrediction: {
          estimatedMinutes: etaPrediction.estimatedMinutes,
          predictedDeliveryTime: etaPrediction.predictedDeliveryTime,
          confidence: etaPrediction.confidence,
          correctionMinutes: etaPrediction.correctionMinutes,
          method: etaPrediction.method,
        },
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/insights/summary/batch - Batch summary for a date range
router.get('/summary/batch', async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 50 } = req.query;
    const deliveries = await Delivery.list(req.client.id, {
      startDate,
      endDate,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });

    if (deliveries.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'No deliveries found for the specified period',
          totalDeliveries: 0,
        },
      });
    }

    const batchSummary = await generateBatchSummary(deliveries, {
      start: startDate,
      end: endDate,
    });

    res.json({
      success: true,
      data: {
        ...batchSummary,
        period: { startDate, endDate },
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

function getRiskLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'minimal';
}

module.exports = router;
