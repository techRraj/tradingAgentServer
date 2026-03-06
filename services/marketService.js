const FyersService = require('./fyersService');
const IndicatorService = require('./indicatorService');

class MarketService {
  constructor() {
    this.fyers = FyersService;
    this.indicators = IndicatorService;
    this.isConnected = false;
    this.realtimeCache = {};
    
    // Default watchlist - Nifty 50 top stocks
    this.watchlist = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'AXISBANK',
      'L&T', 'HINDUNILVR', 'BAJFINANCE', 'MARUTI', 'TATASTEEL'
    ];
  }

  // Initialize market service with Fyers
  async initialize() {
    this.isConnected = await this.fyers.initialize();
    
    if (this.isConnected) {
      console.log('🚀 MARKET: Using REAL Fyers API data');
    } else {
      console.log('🎭 MARKET: Using MOCK data (add Fyers credentials for real data)');
    }
    
    return this.isConnected;
  }

  // Get live data for specific symbols or watchlist
  async getLiveData(symbols = null) {
    const targetSymbols = symbols || this.watchlist;
    const results = [];

    for (const symbol of targetSymbols) {
      try {
        // Get real-time quote
        const quote = await this.fyers.getQuote(symbol);
        
        // Get historical data for indicators
        const candles = await this.fyers.getHistoricalData(symbol, '1');
        const indicators = this.indicators.calculateAll(candles);

        // Combine data
        const enrichedData = {
          ...quote,
          rsi: indicators.rsi ? parseFloat(indicators.rsi.toFixed(2)) : null,
          sma: indicators.sma ? parseFloat(indicators.sma.toFixed(2)) : null,
          ema: indicators.ema ? parseFloat(indicators.ema.toFixed(2)) : null
        };

        results.push(enrichedData);
        this.realtimeCache[symbol.toUpperCase()] = enrichedData;

      } catch (error) {
        console.error(`❌ MARKET: Error processing ${symbol} -`, error.message);
        
        // Fallback to cache
        if (this.realtimeCache[symbol.toUpperCase()]) {
          results.push(this.realtimeCache[symbol.toUpperCase()]);
        }
      }
    }

    return results;
  }

  // Get single symbol data with full indicators
  async getSymbolData(symbol) {
    const quote = await this.fyers.getQuote(symbol);
    const candles = await this.fyers.getHistoricalData(symbol, '1');
    const indicators = this.indicators.calculateAll(candles);

    return {
      ...quote,
      rsi: indicators.rsi ? parseFloat(indicators.rsi.toFixed(2)) : null,
      sma: indicators.sma ? parseFloat(indicators.sma.toFixed(2)) : null,
      ema: indicators.ema ? parseFloat(indicators.ema.toFixed(2)) : null,
      candles: candles.slice(-50) // Last 50 candles for charting
    };
  }

  // Setup real-time WebSocket streaming
  setupRealtimeStreaming(io) {
    if (!this.isConnected) {
      console.log('⚠️  MARKET: Skipping WebSocket - Fyers not connected');
      return null;
    }

    const ws = this.fyers.setupWebSocket((tick) => {
      // Update cache with real-time tick
      if (tick.symbol && this.realtimeCache[tick.symbol]) {
        this.realtimeCache[tick.symbol] = {
          ...this.realtimeCache[tick.symbol],
          price: tick.price,
          volume: tick.volume,
          timestamp: tick.timestamp,
          isRealtime: true
        };

        // Emit to all connected frontend clients
        io.emit('market_tick', this.realtimeCache[tick.symbol]);
      }
    });

    // Subscribe to watchlist
    if (ws) {
      this.fyers.subscribe(this.watchlist);
      console.log(`📡 MARKET: Streaming ${this.watchlist.length} symbols`);
    }

    return ws;
  }

  // Update watchlist
  setWatchlist(symbols) {
    this.watchlist = symbols;
    console.log(`📋 MARKET: Watchlist updated - ${symbols.length} symbols`);
  }

  // Get current watchlist
  getWatchlist() {
    return [...this.watchlist];
  }

  // Get cached data for a symbol
  getCachedData(symbol) {
    return this.realtimeCache[symbol.toUpperCase()] || null;
  }

  // Clear cache
  clearCache() {
    this.realtimeCache = {};
  }
}

module.exports = new MarketService();