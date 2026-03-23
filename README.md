# LogiSense — Last-Mile Delivery Intelligence API

AI-powered logistics intelligence API that provides anomaly detection, risk scoring, and dynamic ETA prediction for last-mile delivery operations.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (or Docker)

### Using Docker (recommended)
```bash
docker-compose up -d
```
The API will be available at `http://localhost:3000`

### Manual Setup
```bash
# Install dependencies
npm install

# Copy env config
cp .env.example .env
# Edit .env with your database credentials and API keys

# Run migrations
npm run migrate

# Start development server
npm run dev
```

## 📡 API Reference

### Authentication
All authenticated endpoints require an `X-API-Key` header.

### Register a Client
```bash
curl -X POST http://localhost:3000/api/v1/clients/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Company", "email": "test@example.com", "tier": "free"}'
```

### Ingest Delivery Events
```bash
curl -X POST http://localhost:3000/api/v1/deliveries \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "DEL-001",
    "status": "in_transit",
    "latitude": 19.076,
    "longitude": 72.877,
    "driverName": "Rahul Kumar",
    "estimatedDeliveryTime": "2025-01-15T14:00:00Z"
  }'
```

### Get AI Insights
```bash
curl http://localhost:3000/api/v1/insights/DELIVERY_ID \
  -H "X-API-Key: YOUR_API_KEY"
```

### Check Usage
```bash
curl http://localhost:3000/api/v1/usage \
  -H "X-API-Key: YOUR_API_KEY"
```

### WebSocket Real-time Tracking
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/tracking?apiKey=YOUR_API_KEY');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
ws.send(JSON.stringify({ type: 'subscribe', deliveryId: 'DELIVERY_ID' }));
```

## 💰 Pricing Tiers

| Tier | Monthly Calls | Price |
|------|--------------|-------|
| Free | 500 | ₹0 |
| Starter | 10,000 | ₹999/mo |
| Growth | 100,000 | ₹3,999/mo |

## 🏗 Architecture

```
src/
├── server.js           # Express + WebSocket entry
├── config/             # Environment config
├── middleware/          # Auth, rate limiting, error handling
├── routes/             # REST API endpoints
├── models/             # PostgreSQL data layer
├── services/           # AI, anomaly detection, ETA prediction
├── ws/                 # WebSocket real-time tracking
└── utils/              # Logger, validators
```

## 📦 Tech Stack
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL
- **AI**: Anthropic Claude API
- **Real-time**: WebSocket
- **Containerization**: Docker + docker-compose

## License
MIT
