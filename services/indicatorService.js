const { RSI, SMA, EMA } = require('technicalindicators');

class IndicatorService {
  // Calculate RSI from candle data
  calculateRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) {
      return null;
    }

    const closes = candles.map(c => c.close);
    
    const input = {
      values: closes,
      period: period
    };

    const rsiValues = RSI.calculate(input);
    
    // Return the latest RSI value
    return rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;
  }

  // Calculate SMA (Simple Moving Average)
  calculateSMA(candles, period = 20) {
    if (!candles || candles.length < period) {
      return null;
    }

    const closes = candles.map(c => c.close);
    const smaValues = SMA.calculate({ values: closes, period });
    
    return smaValues.length > 0 ? smaValues[smaValues.length - 1] : null;
  }

  // Calculate EMA (Exponential Moving Average)
  calculateEMA(candles, period = 9) {
    if (!candles || candles.length < period) {
      return null;
    }

    const closes = candles.map(c => c.close);
    const emaValues = EMA.calculate({ values: closes, period });
    
    return emaValues.length > 0 ? emaValues[emaValues.length - 1] : null;
  }

  // Calculate all indicators at once
  calculateAll(candles, config = {}) {
    const {
      rsiPeriod = 14,
      smaPeriod = 20,
      emaPeriod = 9
    } = config;

    if (!candles || candles.length < rsiPeriod + 1) {
      return {
        error: 'Insufficient data for calculation',
        rsi: null,
        sma: null,
        ema: null
      };
    }

    return {
      rsi: this.calculateRSI(candles, rsiPeriod),
      sma: this.calculateSMA(candles, smaPeriod),
      ema: this.calculateEMA(candles, emaPeriod),
      currentPrice: candles[candles.length - 1].close,
      volume: candles[candles.length - 1].volume
    };
  }
}

module.exports = new IndicatorService();