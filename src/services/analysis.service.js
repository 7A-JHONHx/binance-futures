import { tradingConfig } from "../config/trading.config.js";
import { getCandles, getOrderBookSnapshot } from "./market.service.js";
import {
  calculateATR,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
} from "../utils/indicators.js";

function getLastValue(series) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index] !== null) {
      return series[index];
    }
  }

  return null;
}

function getOrderBookImbalance(orderBook) {
  const bidNotional = orderBook.bids.reduce(
    (sum, level) => sum + level.price * level.quantity,
    0
  );
  const askNotional = orderBook.asks.reduce(
    (sum, level) => sum + level.price * level.quantity,
    0
  );
  const total = bidNotional + askNotional;

  if (total === 0) {
    return 0;
  }

  return (bidNotional - askNotional) / total;
}

function getCandleBodyRatio(candle) {
  const range = candle.high - candle.low;

  if (range === 0) {
    return 0;
  }

  return Math.abs(candle.close - candle.open) / range;
}

function buildSignalSummary(metrics, scores, decision) {
  return {
    decision,
    longScore: scores.longScore,
    shortScore: scores.shortScore,
    close: metrics.signalCandle.close,
    emaFast: metrics.emaFast,
    emaSlow: metrics.emaSlow,
    emaTrend: metrics.emaTrend,
    smaTrend: metrics.smaTrend,
    rsi: metrics.rsi,
    macd: metrics.macd,
    macdSignal: metrics.macdSignal,
    macdHistogram: metrics.macdHistogram,
    atr: metrics.atr,
    atrPercent: metrics.atrPercent,
    volumeRatio: metrics.volumeRatio,
    orderBookImbalance: metrics.orderBookImbalance,
    candleBodyRatio: metrics.candleBodyRatio,
    signalCandleOpenTime: metrics.signalCandle.openTime,
  };
}

export function analyzeMarketSnapshot(candles, options = {}) {
  const orderBookImbalance =
    options.orderBookImbalance !== undefined ? options.orderBookImbalance : 0;

  if (candles.length < Math.max(tradingConfig.trendSmaPeriod + 1, 210)) {
    throw new Error("Not enough candles to analyze market context");
  }

  const signalCandle = candles.at(-1);
  const previousCandle = candles.at(-2);
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const emaFastSeries = calculateEMA(closes, tradingConfig.fastEmaPeriod);
  const emaSlowSeries = calculateEMA(closes, tradingConfig.slowEmaPeriod);
  const emaTrendSeries = calculateEMA(closes, tradingConfig.trendEmaPeriod);
  const smaTrendSeries = calculateSMA(closes, tradingConfig.trendSmaPeriod);
  const volumeSmaSeries = calculateSMA(volumes, tradingConfig.volumeSmaPeriod);
  const rsiSeries = calculateRSI(closes, tradingConfig.rsiPeriod);
  const macdSeries = calculateMACD(
    closes,
    tradingConfig.macdFastPeriod,
    tradingConfig.macdSlowPeriod,
    tradingConfig.macdSignalPeriod
  );
  const atrSeries = calculateATR(candles, tradingConfig.atrPeriod);

  const metrics = {
    signalCandle,
    previousCandle,
    emaFast: getLastValue(emaFastSeries),
    emaSlow: getLastValue(emaSlowSeries),
    emaTrend: getLastValue(emaTrendSeries),
    smaTrend: getLastValue(smaTrendSeries),
    volumeAverage: getLastValue(volumeSmaSeries),
    rsi: getLastValue(rsiSeries),
    macd: getLastValue(macdSeries.macdLine),
    macdSignal: getLastValue(macdSeries.signalLine),
    macdHistogram: getLastValue(macdSeries.histogram),
    atr: getLastValue(atrSeries),
    orderBookImbalance,
    candleBodyRatio: getCandleBodyRatio(signalCandle),
  };

  if (
    [
      metrics.emaFast,
      metrics.emaSlow,
      metrics.emaTrend,
      metrics.smaTrend,
      metrics.volumeAverage,
      metrics.rsi,
      metrics.macd,
      metrics.macdSignal,
      metrics.macdHistogram,
      metrics.atr,
    ].some((value) => value === null)
  ) {
    throw new Error("Indicators are not ready yet");
  }

  metrics.volumeRatio = signalCandle.volume / metrics.volumeAverage;
  metrics.atrPercent = metrics.atr / signalCandle.close;

  const bullishTrend =
    signalCandle.close > metrics.emaTrend &&
    metrics.emaFast > metrics.emaSlow &&
    metrics.emaSlow > metrics.smaTrend;
  const bearishTrend =
    signalCandle.close < metrics.emaTrend &&
    metrics.emaFast < metrics.emaSlow &&
    metrics.emaSlow < metrics.smaTrend;
  const bullishCandle =
    signalCandle.close > signalCandle.open &&
    signalCandle.close > previousCandle.close &&
    metrics.candleBodyRatio >= tradingConfig.minCandleBodyRatio;
  const bearishCandle =
    signalCandle.close < signalCandle.open &&
    signalCandle.close < previousCandle.close &&
    metrics.candleBodyRatio >= tradingConfig.minCandleBodyRatio;
  const bullishVolume =
    metrics.volumeRatio >= tradingConfig.minVolumeRatio && signalCandle.close > signalCandle.open;
  const bearishVolume =
    metrics.volumeRatio >= tradingConfig.minVolumeRatio && signalCandle.close < signalCandle.open;
  const bullishOrderBook =
    metrics.orderBookImbalance >= tradingConfig.minOrderBookImbalance;
  const bearishOrderBook =
    metrics.orderBookImbalance <= -tradingConfig.minOrderBookImbalance;
  const bullishRsi =
    metrics.rsi >= tradingConfig.longRsiMin && metrics.rsi <= tradingConfig.longRsiMax;
  const bearishRsi =
    metrics.rsi >= tradingConfig.shortRsiMin && metrics.rsi <= tradingConfig.shortRsiMax;
  const bullishMacd =
    metrics.macd > metrics.macdSignal && metrics.macdHistogram > 0;
  const bearishMacd =
    metrics.macd < metrics.macdSignal && metrics.macdHistogram < 0;
  const volatilityOkay =
    metrics.atrPercent >= tradingConfig.minAtrPercent &&
    metrics.atrPercent <= tradingConfig.maxAtrPercent;

  const scores = {
    longScore: 0,
    shortScore: 0,
  };

  if (bullishTrend) {
    scores.longScore += 2;
  }

  if (bearishTrend) {
    scores.shortScore += 2;
  }

  if (bullishRsi) {
    scores.longScore += 1;
  }

  if (bearishRsi) {
    scores.shortScore += 1;
  }

  if (bullishMacd) {
    scores.longScore += 1;
  }

  if (bearishMacd) {
    scores.shortScore += 1;
  }

  if (bullishCandle) {
    scores.longScore += 1;
  }

  if (bearishCandle) {
    scores.shortScore += 1;
  }

  if (bullishVolume) {
    scores.longScore += 1;
  }

  if (bearishVolume) {
    scores.shortScore += 1;
  }

  if (bullishOrderBook) {
    scores.longScore += 1;
  }

  if (bearishOrderBook) {
    scores.shortScore += 1;
  }

  let decision = "NONE";

  if (
    volatilityOkay &&
    scores.longScore >= tradingConfig.minLongScore &&
    scores.longScore >= scores.shortScore + tradingConfig.minScoreGap
  ) {
    decision = "LONG";
  } else if (
    volatilityOkay &&
    scores.shortScore >= tradingConfig.minShortScore &&
    scores.shortScore >= scores.longScore + tradingConfig.minScoreGap
  ) {
    decision = "SHORT";
  }

  return {
    decision,
    metrics,
    scores,
    summary: buildSignalSummary(metrics, scores, decision),
  };
}

export async function analyzeMarket(symbol = tradingConfig.symbol) {
  const [candles, orderBook] = await Promise.all([
    getCandles(symbol, tradingConfig.candleInterval, tradingConfig.candleLimit),
    getOrderBookSnapshot(symbol, tradingConfig.orderBookLevels),
  ]);

  const closedCandles = candles.slice(0, -1);
  const orderBookImbalance = getOrderBookImbalance(orderBook);

  return analyzeMarketSnapshot(closedCandles, { orderBookImbalance });
}
