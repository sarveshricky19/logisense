-- LogiSense Initial Schema
-- Tables: clients, deliveries, delivery_events, usage_logs, insights

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clients / Tenants
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  company VARCHAR(255),
  tier VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'growth')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deliveries (one per unique external delivery)
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  current_status VARCHAR(50) NOT NULL DEFAULT 'picked_up',
  recipient_name VARCHAR(255),
  recipient_phone VARCHAR(20),
  driver_name VARCHAR(255),
  driver_id VARCHAR(255),
  address VARCHAR(500),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  estimated_delivery_time TIMESTAMPTZ,
  actual_delivery_time TIMESTAMPTZ,
  weight DOUBLE PRECISION,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  risk_score DOUBLE PRECISION,
  anomaly_flags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, external_id)
);

-- Delivery event history (append-only timeline)
CREATE TABLE IF NOT EXISTS delivery_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking per client per month
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL, -- YYYY-MM
  call_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, month)
);

-- Cached AI insights
CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  risk_score DOUBLE PRECISION,
  anomaly_flags JSONB DEFAULT '[]',
  eta_correction_minutes INTEGER,
  ai_summary TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deliveries_client ON deliveries(client_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(current_status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery ON delivery_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_recorded ON delivery_events(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_client_month ON usage_logs(client_id, month);
CREATE INDEX IF NOT EXISTS idx_insights_delivery ON insights(delivery_id);
CREATE INDEX IF NOT EXISTS idx_clients_api_key ON clients(api_key);
