const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const logger = require('../utils/logger');

let anthropic = null;

function getClient() {
  if (!anthropic && config.anthropicApiKey) {
    anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropic;
}

async function generateDeliveryInsight(delivery, events) {
  const client = getClient();

  if (!client) {
    logger.warn('Anthropic API key not configured, returning mock insight');
    return generateMockInsight(delivery, events);
  }

  try {
    const prompt = buildInsightPrompt(delivery, events);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      system: `You are a logistics intelligence AI that analyzes delivery data. Respond with a JSON object containing:
- riskScore: number 0-100 (probability of delivery failure)
- anomalyFlags: array of strings describing anomalies
- etaCorrectionMinutes: integer (positive = delayed, negative = early)
- summary: a concise natural-language assessment of the delivery (2-3 sentences)

Respond ONLY with valid JSON, no markdown formatting.`,
    });

    const text = response.content[0].text;
    const parsed = JSON.parse(text);

    return {
      riskScore: Math.min(100, Math.max(0, parsed.riskScore || 0)),
      anomalyFlags: parsed.anomalyFlags || [],
      etaCorrectionMinutes: parsed.etaCorrectionMinutes || 0,
      summary: parsed.summary || 'No summary available.',
      rawResponse: parsed,
    };
  } catch (error) {
    logger.error('AI insight generation failed', { error: error.message });
    return generateMockInsight(delivery, events);
  }
}

async function generateBatchSummary(deliveries, dateRange) {
  const client = getClient();

  if (!client) {
    return generateMockBatchSummary(deliveries);
  }

  try {
    const prompt = buildBatchPrompt(deliveries, dateRange);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
      system: `You are a logistics intelligence AI. Analyze the batch delivery data and provide a JSON response with:
- overallRiskScore: average risk across all deliveries (0-100)
- totalDeliveries: count
- anomalySummary: array of key anomalies across the batch
- recommendations: array of actionable suggestions
- narrativeSummary: a 3-5 sentence executive summary

Respond ONLY with valid JSON, no markdown formatting.`,
    });

    return JSON.parse(response.content[0].text);
  } catch (error) {
    logger.error('Batch summary generation failed', { error: error.message });
    return generateMockBatchSummary(deliveries);
  }
}

function buildInsightPrompt(delivery, events) {
  const eventTimeline = events.map(e =>
    `[${e.recorded_at}] Status: ${e.status} | Lat: ${e.latitude || 'N/A'}, Lng: ${e.longitude || 'N/A'}`
  ).join('\n');

  return `Analyze this delivery for risk and anomalies:

Delivery ID: ${delivery.external_id}
Current Status: ${delivery.current_status}
Estimated Delivery: ${delivery.estimated_delivery_time || 'Not set'}
Actual Delivery: ${delivery.actual_delivery_time || 'Pending'}
Address: ${delivery.address || 'Not specified'}
Driver: ${delivery.driver_name || 'Unknown'}

Event Timeline:
${eventTimeline || 'No events recorded'}

Assess the delivery risk, check for anomalies (unusual status transitions, timing patterns, route deviations), and provide an updated ETA correction.`;
}

function buildBatchPrompt(deliveries, dateRange) {
  const summary = deliveries.map(d =>
    `- ${d.external_id}: Status=${d.current_status}, Risk=${d.risk_score || 'N/A'}, Created=${d.created_at}`
  ).join('\n');

  return `Analyze this batch of ${deliveries.length} deliveries from ${dateRange.start || 'start'} to ${dateRange.end || 'now'}:

${summary}

Status breakdown:
${getStatusBreakdown(deliveries)}

Provide an overall risk assessment, identify patterns, and suggest improvements.`;
}

function getStatusBreakdown(deliveries) {
  const counts = {};
  deliveries.forEach(d => {
    counts[d.current_status] = (counts[d.current_status] || 0) + 1;
  });
  return Object.entries(counts).map(([s, c]) => `  ${s}: ${c}`).join('\n');
}

// Mock functions for when API key is not available
function generateMockInsight(delivery, events) {
  const statusRisk = {
    picked_up: 15, in_transit: 25, out_for_delivery: 20,
    delivered: 0, failed: 90, returned: 85, delayed: 70,
  };

  const riskScore = statusRisk[delivery.current_status] || 30;
  const anomalyFlags = [];

  if (events.length > 5) anomalyFlags.push('Unusually high number of status changes');
  if (delivery.current_status === 'delayed') anomalyFlags.push('Delivery is delayed past estimated time');
  if (!delivery.latitude) anomalyFlags.push('Missing GPS coordinates');

  const etaCorrection = delivery.current_status === 'delayed' ? 45 : 
                         delivery.current_status === 'in_transit' ? 15 : 0;

  return {
    riskScore,
    anomalyFlags,
    etaCorrectionMinutes: etaCorrection,
    summary: `Delivery ${delivery.external_id} is currently ${delivery.current_status} with a ${riskScore}% failure risk. ${anomalyFlags.length > 0 ? `Anomalies detected: ${anomalyFlags.join(', ')}.` : 'No anomalies detected.'}`,
    rawResponse: { source: 'mock' },
  };
}

function generateMockBatchSummary(deliveries) {
  const total = deliveries.length;
  const failed = deliveries.filter(d => d.current_status === 'failed').length;
  const delivered = deliveries.filter(d => d.current_status === 'delivered').length;

  return {
    overallRiskScore: total > 0 ? Math.round((failed / total) * 100) : 0,
    totalDeliveries: total,
    anomalySummary: failed > 0 ? [`${failed} deliveries have failed status`] : [],
    recommendations: [
      'Monitor delayed deliveries for potential failures',
      'Review driver routes for optimization opportunities',
    ],
    narrativeSummary: `Batch contains ${total} deliveries: ${delivered} delivered, ${failed} failed. Overall delivery success rate is ${total > 0 ? Math.round((delivered / total) * 100) : 0}%.`,
  };
}

module.exports = { generateDeliveryInsight, generateBatchSummary };
