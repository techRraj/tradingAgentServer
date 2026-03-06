require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const StrategyStore = require('./store/strategyStore');
const MarketService = require('./services/marketService');

const app = express();
const server = http.createServer(app);

// Socket.io Setup with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Global variables
let isRealData = false;
let scannerInterval = null;

// Initialize Market Service
async function initializeApp() {
  try {
    isRealData = await MarketService.initialize();
    
    if (isRealData) {
      // Setup WebSocket for real-time ticks
      MarketService.setupRealtimeStreaming(io);
      // Start scanner with 10s interval (real data)
      startScanner(10);
    } else {
      // Fallback to mock scanner with 5s interval
      startScanner(5);
    }

    console.log(`\n📊 DATA MODE: ${isRealData ? '✅ REAL (Fyers)' : '🎭 MOCK'}\n`);
    
  } catch (error) {
    console.error('❌ Initialization error:', error.message);
    // Start with mock data on error
    startScanner(5);
  }
}

// --- API ROUTES ---

// Create new strategy
app.post('/api/strategy', (req, res) => {
  try {
    const { whatsappNumber, symbol, indicator, operator, value } = req.body;
    
    if (!symbol || !indicator || !operator || !value) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const strategy = StrategyStore.add({
      whatsappNumber: whatsappNumber || 'none',
      symbol: symbol.toUpperCase(),
      indicator,
      operator,
      value: Number(value),
      active: true,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, strategy });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all strategies
app.get('/api/strategies', (req, res) => {
  try {
    const strategies = StrategyStore.getAll();
    res.json({ success: true,  strategies, count: strategies.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete strategy
app.delete('/api/strategy/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = StrategyStore.delete(id);
    
    if (deleted) {
      res.json({ success: true, message: 'Strategy deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Strategy not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get market data for symbol
app.get('/api/market/:symbol', async (req, res) => {
  try {
    const data = await MarketService.getSymbolData(req.params.symbol);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get watchlist
app.get('/api/watchlist', (req, res) => {
  try {
    const watchlist = MarketService.getWatchlist();
    res.json({ success: true, watchlist });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get server status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: {
      isRealData,
      strategiesCount: StrategyStore.getCount(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

// --- SCANNER LOGIC ---

function startScanner(intervalSeconds) {
  // Clear existing scanner
  if (scannerInterval) {
    cron.validate(scannerInterval);
    scannerInterval.stop();
  }

  // Schedule new scanner
  scannerInterval = cron.schedule(`*/${intervalSeconds} * * * * *`, async () => {
    await runScanner();
  });

  console.log(`🔍 SCANNER: Running every ${intervalSeconds} seconds`);
}

async function runScanner() {
  const activeStrategies = StrategyStore.getActive();
  
  if (activeStrategies.length === 0) {
    return; // No strategies to scan
  }

  // Get unique symbols from active strategies
  const symbols = [...new Set(activeStrategies.map(s => s.symbol))];
  
  try {
    const marketData = await MarketService.getLiveData(symbols);
    let alertsTriggered = 0;

    for (const strategy of activeStrategies) {
      const stock = marketData.find(s => s.symbol === strategy.symbol);
      
      if (!stock) {
        continue;
      }

      let triggered = false;
      let currentValue = null;

      // Evaluate strategy conditions
      if (strategy.indicator === 'PRICE') {
        currentValue = stock.price;
        if (strategy.operator === '>' && stock.price > strategy.value) triggered = true;
        if (strategy.operator === '<' && stock.price < strategy.value) triggered = true;
      } 
      else if (strategy.indicator === 'RSI' && stock.rsi !== null) {
        currentValue = stock.rsi;
        if (strategy.operator === '>' && stock.rsi > strategy.value) triggered = true;
        if (strategy.operator === '<' && stock.rsi < strategy.value) triggered = true;
      }
      else if (strategy.indicator === 'VOLUME') {
        currentValue = stock.volume;
        if (strategy.operator === '>' && stock.volume > strategy.value) triggered = true;
      }

      if (triggered) {
        alertsTriggered++;
        
        const alertData = {
          id: Date.now() + Math.random(),
          symbol: stock.symbol,
          price: stock.price,
          rsi: stock.rsi,
          volume: stock.volume,
          change: stock.change,
          changePercent: stock.changePercent,
          condition: `${strategy.indicator} ${strategy.operator} ${strategy.value}`,
          currentValue: currentValue,
          timestamp: new Date().toLocaleTimeString('en-IN'),
          message: `🚨 ${stock.symbol}: ₹${stock.price} | ${strategy.indicator} ${strategy.operator} ${strategy.value} (Current: ${currentValue})`,
          isReal: isRealData,
          source: stock.source
        };

        // Emit alert to all connected frontend clients
        io.emit('new_alert', alertData);
        
        console.log(`⚡ ALERT #${alertsTriggered}: ${alertData.message}`);
      }
    }

    if (alertsTriggered > 0) {
      console.log(`📊 Scan complete: ${alertsTriggered} alerts triggered`);
    }

  } catch (error) {
    console.error('❌ SCANNER: Error -', error.message);
  }
}

// --- Socket.io Connection Handler ---

io.on('connection', (socket) => {
  console.log('✅ CLIENT CONNECTED:', socket.id);

  // Send initial data
  socket.emit('connection_status', {
    connected: true,
    isRealData,
    timestamp: new Date().toISOString()
  });

  // Send current strategies
  socket.emit('initial_strategies', StrategyStore.getAll());

  // Send current market data
  MarketService.getLiveData().then(data => {
    socket.emit('initial_market_data', data);
  });

  // Handle symbol subscription
  socket.on('subscribe_symbols', (symbols) => {
    if (isRealData && MarketService.fyers.isConnected) {
      MarketService.fyers.subscribe(symbols);
      socket.emit('subscribed', { symbols });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('❌ CLIENT DISCONNECTED:', socket.id);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('❌ SOCKET ERROR:', error);
  });
});

// --- Server Startup ---

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   🇮🇳  STOCK AGENT - INDIAN MARKET SCANNER     ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║   🚀 Server: http://localhost:${PORT}              ║`);
  console.log(`║   📡 Socket: ws://localhost:${PORT}                ║`);
  console.log(`║   📊 Data: ${isRealData ? 'REAL (Fyers)' : 'MOCK'}                          ║`);
  console.log('╚════════════════════════════════════════════════╝');
});

// Initialize app
initializeApp();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  MarketService.fyers.disconnect();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});