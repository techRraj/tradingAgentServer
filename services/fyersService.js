const FyersAPI = require('fyers-api-v3');

class FyersService {
  constructor() {
    this.appId = process.env.FYERS_APP_ID;
    this.appSecret = process.env.FYERS_APP_SECRET;
    this.accessToken = process.env.FYERS_ACCESS_TOKEN;
    this.fyers = null;
    this.isConnected = false;
    this.ws = null;
    this.subscribedSymbols = new Set();
  }

  // Initialize Fyers API connection
  async initialize() {
    if (!this.appId || !this.accessToken) {
      console.log('⚠️  FYERS: Credentials not found - Using MOCK DATA');
      return false;
    }

    try {
      this.fyers = new FyersAPI({
        appId: this.appId,
        redirectUri: 'http://localhost',
        accessToken: this.accessToken,
        responseType: 'code',
        logLevel: 'error'
      });

      // Test connection by getting profile
      const profile = await this.fyers.getProfile();
      
      if (profile.s === 'ok') {
        this.isConnected = true;
        console.log('✅ FYERS: Connected successfully');
        console.log(`👤 User: ${profile.data.name}`);
        return true;
      } else {
        console.error('❌ FYERS: Connection failed -', profile.msg);
        return false;
      }
    } catch (error) {
      console.error('❌ FYERS: Initialization error -', error.message);
      return false;
    }
  }

  // Convert symbol to Fyers format: RELIANCE → NSE:RELIANCE-EQ
  formatSymbol(symbol) {
    const sym = symbol.toUpperCase().trim();
    return `NSE:${sym}-EQ`;
  }

  // Get real-time quote for a symbol
  async getQuote(symbol) {
    if (!this.isConnected) {
      return this.getMockQuote(symbol);
    }

    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const response = await this.fyers.quotes({ symbols: formattedSymbol });
      
      if (response.s === 'ok' && response.data?.[formattedSymbol]) {
        const data = response.data[formattedSymbol];
        return {
          symbol: symbol.toUpperCase(),
          price: parseFloat(data.lp || data.close || 0),
          change: parseFloat(data.ch || 0),
          changePercent: parseFloat(data.pc || 0),
          volume: data.volume || 0,
          high: parseFloat(data.high || 0),
          low: parseFloat(data.low || 0),
          open: parseFloat(data.open || 0),
          prevClose: parseFloat(data.close || 0),
          timestamp: Date.now(),
          isMock: false,
          source: 'fyers'
        };
      }
    } catch (error) {
      console.error(`❌ FYERS: Quote error for ${symbol} -`, error.message);
    }

    return this.getMockQuote(symbol);
  }

  // Get historical candle data for indicators
  async getHistoricalData(symbol, timeframe = '1', from = null, to = null) {
    if (!this.isConnected) {
      return this.getMockHistoricalData(symbol);
    }

    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const now = Math.floor(Date.now() / 1000);
      
      // Default: last 200 candles
      if (!from) {
        const minutes = timeframe === '1' ? 200 : timeframe === '5' ? 1000 : 2000;
        from = now - (minutes * 60);
        to = now;
      }

      const response = await this.fyers.history({
        symbol: formattedSymbol,
        resolution: timeframe,
        date_format: 1,
        range_from: from,
        range_to: to,
        cont_flag: 1
      });

      if (response.s === 'ok' && response.candles?.length > 0) {
        // Fyers format: [timestamp, open, high, low, close, volume]
        return response.candles.map(candle => ({
          timestamp: candle[0] * 1000,
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5]
        }));
      }
    } catch (error) {
      console.error(`❌ FYERS: History error for ${symbol} -`, error.message);
    }

    return this.getMockHistoricalData(symbol);
  }

  // Setup WebSocket for real-time ticks
  setupWebSocket(onTickCallback) {
    if (!this.isConnected) {
      console.log('⚠️  FYERS: Cannot setup WebSocket - Not connected');
      return null;
    }

    try {
      this.ws = this.fyers.websocket({
        mode: 'quote',
        connect: () => {
          console.log('🔌 FYERS: WebSocket Connected');
        },
        message: (data) => {
          if (data?.type === 'quote' && data?.data) {
            const tick = data.data;
            const symbolParts = tick.tk?.split(':');
            const symbol = symbolParts?.[1]?.split('-')?.[0];
            
            if (symbol && onTickCallback) {
              onTickCallback({
                symbol: symbol.toUpperCase(),
                price: parseFloat(tick.lp || tick.c || 0),
                volume: tick.v || 0,
                timestamp: Date.now()
              });
            }
          }
        },
        close: () => {
          console.log('🔌 FYERS: WebSocket Closed');
          this.isConnected = false;
        },
        error: (err) => {
          console.error('❌ FYERS: WebSocket Error -', err);
        }
      });

      return this.ws;
    } catch (error) {
      console.error('❌ FYERS: WebSocket setup error -', error.message);
      return null;
    }
  }

  // Subscribe to symbols for real-time updates
  subscribe(symbols) {
    if (!this.ws || !this.isConnected) {
      console.log('⚠️  FYERS: Cannot subscribe - WebSocket not ready');
      return;
    }

    const formattedSymbols = symbols.map(s => this.formatSymbol(s));
    const newSymbols = formattedSymbols.filter(s => !this.subscribedSymbols.has(s));
    
    if (newSymbols.length > 0) {
      this.ws.subscription({ mode: 'quote', symbols: newSymbols });
      newSymbols.forEach(s => this.subscribedSymbols.add(s));
      console.log(`📡 FYERS: Subscribed to ${newSymbols.length} symbols`);
    }
  }

  // Unsubscribe from symbols
  unsubscribe(symbols) {
    if (!this.ws || !this.isConnected) return;

    const formattedSymbols = symbols.map(s => this.formatSymbol(s));
    this.ws.subscription({ mode: 'quote', symbols: formattedSymbols });
    formattedSymbols.forEach(s => this.subscribedSymbols.delete(s));
  }

  // Close WebSocket connection
  disconnect() {
    if (this.ws) {
      this.ws.disconnect();
      this.ws = null;
      this.isConnected = false;
      this.subscribedSymbols.clear();
      console.log('🔌 FYERS: Disconnected');
    }
  }

  // ===== MOCK DATA FALLBACKS =====

  getMockQuote(symbol) {
    const basePrices = {
      'RELIANCE': 2450, 'TCS': 3650, 'HDFCBANK': 1620,
      'INFY': 1480, 'ICICIBANK': 980, 'SBIN': 620,
      'BHARTIARTL': 1150, 'ITC': 450, 'KOTAKBANK': 1780,
      'AXISBANK': 1050, 'TATASTEEL': 125, 'HINDUNILVR': 2580
    };

    const base = basePrices[symbol.toUpperCase()] || (1000 + Math.random() * 2000);
    const variance = (Math.random() - 0.5) * 15;
    const price = parseFloat((base + variance).toFixed(2));

    return {
      symbol: symbol.toUpperCase(),
      price,
      change: parseFloat((Math.random() * 4 - 2).toFixed(2)),
      changePercent: parseFloat(((Math.random() * 2 - 1)).toFixed(2)),
      volume: Math.floor(Math.random() * 500000),
      high: parseFloat((price + Math.random() * 10).toFixed(2)),
      low: parseFloat((price - Math.random() * 10).toFixed(2)),
      open: parseFloat(base.toFixed(2)),
      prevClose: parseFloat(base.toFixed(2)),
      timestamp: Date.now(),
      isMock: true,
      source: 'mock'
    };
  }

  getMockHistoricalData(symbol) {
    const candles = [];
    let price = this.getMockQuote(symbol).price;

    for (let i = 200; i >= 0; i--) {
      const change = (Math.random() - 0.5) * 5;
      price = Math.max(100, price + change);

      candles.push({
        timestamp: Date.now() - (i * 60 * 1000),
        open: parseFloat(price.toFixed(2)),
        high: parseFloat((price + Math.random() * 3).toFixed(2)),
        low: parseFloat((price - Math.random() * 3).toFixed(2)),
        close: parseFloat(price.toFixed(2)),
        volume: Math.floor(Math.random() * 10000)
      });
    }

    return candles;
  }
}

module.exports = new FyersService();