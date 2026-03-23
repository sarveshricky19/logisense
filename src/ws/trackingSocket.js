const WebSocket = require('ws');
const logger = require('../utils/logger');
const Client = require('../models/Client');

/**
 * WebSocket server for real-time delivery tracking.
 * Clients authenticate with API key and subscribe to delivery updates.
 */
function createTrackingSocket(server, config) {
  const wss = new WebSocket.Server({ noServer: true });

  // Map of clientId -> Set of WebSocket connections
  const clientConnections = new Map();
  // Map of ws -> { clientId, subscriptions: Set<deliveryId> }
  const connectionState = new Map();

  // Handle upgrade
  server.on('upgrade', async (request, socket, head) => {
    if (request.url !== '/ws/tracking') {
      socket.destroy();
      return;
    }

    // Extract API key from query string
    const url = new URL(request.url, `http://${request.headers.host}`);
    const apiKey = url.searchParams.get('apiKey');

    if (!apiKey) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const client = await Client.findByApiKey(apiKey);
      if (!client) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.clientData = client;
        wss.emit('connection', ws, request);
      });
    } catch (error) {
      logger.error('WebSocket upgrade error', { error: error.message });
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    const clientId = ws.clientData.id;
    logger.info('WebSocket client connected', { clientId });

    // Track connection
    if (!clientConnections.has(clientId)) {
      clientConnections.set(clientId, new Set());
    }
    clientConnections.get(clientId).add(ws);
    connectionState.set(ws, { clientId, subscriptions: new Set() });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to LogiSense real-time tracking',
      clientId,
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      logger.info('WebSocket client disconnected', { clientId });
      const conns = clientConnections.get(clientId);
      if (conns) {
        conns.delete(ws);
        if (conns.size === 0) clientConnections.delete(clientId);
      }
      connectionState.delete(ws);
    });

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  // Heartbeat interval
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        logger.debug('Terminating dead WebSocket connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, config.wsHeartbeatInterval || 30000);

  wss.on('close', () => clearInterval(heartbeat));

  // Handle subscription messages
  function handleMessage(ws, msg) {
    const state = connectionState.get(ws);
    if (!state) return;

    switch (msg.type) {
      case 'subscribe':
        if (msg.deliveryId) {
          state.subscriptions.add(msg.deliveryId);
          ws.send(JSON.stringify({
            type: 'subscribed',
            deliveryId: msg.deliveryId,
          }));
        }
        break;

      case 'unsubscribe':
        if (msg.deliveryId) {
          state.subscriptions.delete(msg.deliveryId);
          ws.send(JSON.stringify({
            type: 'unsubscribed',
            deliveryId: msg.deliveryId,
          }));
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  }

  // Emit function for use by REST routes
  function emit(clientId, deliveryId, data) {
    const conns = clientConnections.get(clientId);
    if (!conns) return;

    const message = JSON.stringify(data);

    conns.forEach((ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      const state = connectionState.get(ws);
      // Send to all connections or those subscribed to this delivery
      if (!state || state.subscriptions.size === 0 || state.subscriptions.has(deliveryId)) {
        ws.send(message);
      }
    });
  }

  return { wss, emit };
}

module.exports = createTrackingSocket;
