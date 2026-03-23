const Joi = require('joi');

const deliveryEventSchema = Joi.object({
  externalId: Joi.string().required().max(255),
  status: Joi.string()
    .valid('picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'delayed')
    .required(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  address: Joi.string().max(500).optional(),
  recipientName: Joi.string().max(255).optional(),
  recipientPhone: Joi.string().max(20).optional(),
  driverName: Joi.string().max(255).optional(),
  driverId: Joi.string().max(255).optional(),
  estimatedDeliveryTime: Joi.date().iso().optional(),
  actualDeliveryTime: Joi.date().iso().optional(),
  weight: Joi.number().positive().optional(),
  notes: Joi.string().max(1000).optional(),
  metadata: Joi.object().optional(),
});

const batchDeliverySchema = Joi.object({
  events: Joi.array().items(deliveryEventSchema).min(1).max(100).required(),
});

const insightQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

const clientRegistrationSchema = Joi.object({
  name: Joi.string().required().min(2).max(255),
  email: Joi.string().email().required(),
  company: Joi.string().max(255).optional(),
  tier: Joi.string().valid('free', 'starter', 'growth').default('free'),
});

module.exports = {
  deliveryEventSchema,
  batchDeliverySchema,
  insightQuerySchema,
  clientRegistrationSchema,
};
