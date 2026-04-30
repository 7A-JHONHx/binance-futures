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

function getCandleBodyPercent(candle) {
  if (!Number.isFinite(candle?.close) || candle.close === 0) {
    return 0;
  }

  return Math.abs(candle.close - candle.open) / Math.abs(candle.close);
}

function getAverageBodyPercent(candles, period) {
  const recentCandles = candles.slice(-(period + 1), -1);

  if (recentCandles.length === 0) {
    return 0;
  }

  const total = recentCandles.reduce(
    (sum, candle) => sum + getCandleBodyPercent(candle),
    0
  );

  return total / recentCandles.length;
}

function buildDecisionReasons(decision, checks) {
  if (decision === "LONG") {
    return [
      checks.bullishTrend ? "tendencia compradora" : null,
      checks.bullishMacd ? "MACD comprador" : null,
      checks.bullishRsi ? "RSI favoravel" : null,
      checks.bullishCandle ? "candle de forca" : null,
      checks.bullishVolume ? "volume acima da media" : null,
      checks.bullishOrderBook ? "book comprador" : null,
      checks.volatilityOkay ? "volatilidade suficiente" : null,
    ].filter(Boolean);
  }

  if (decision === "SHORT") {
    return [
      checks.bearishTrend ? "tendencia vendedora" : null,
      checks.bearishMacd ? "MACD vendedor" : null,
      checks.bearishRsi ? "RSI favoravel" : null,
      checks.bearishCandle ? "candle de forca" : null,
      checks.bearishVolume ? "volume acima da media" : null,
      checks.bearishOrderBook ? "book vendedor" : null,
      checks.volatilityOkay ? "volatilidade suficiente" : null,
    ].filter(Boolean);
  }

  return [];
}

function getAnalysisBlockers(summary) {
  const blockers = [];
  const candidate =
    summary.longScore > summary.shortScore
      ? "LONG"
      : summary.shortScore > summary.longScore
        ? "SHORT"
        : "NONE";

  if (candidate === "NONE") {
    blockers.push("sem predominancia clara entre compra e venda");
  }

  if (summary.atrPercent < tradingConfig.minAtrPercent) {
    blockers.push("volatilidade abaixo do minimo");
  } else if (summary.atrPercent > tradingConfig.maxAtrPercent) {
    blockers.push("volatilidade acima do limite");
  }

  if (summary.volumeRatio < tradingConfig.minVolumeRatio) {
    blockers.push("volume abaixo do minimo");
  }

  if (summary.candleBodyRatio < tradingConfig.minCandleBodyRatio) {
    blockers.push("candle de confirmacao fraco");
  }

  if (summary.bodyExpansionMultiplier > tradingConfig.maxEntryBodyExpansionMultiplier) {
    blockers.push("candle atual expandiu demais contra a media recente");
  }

  if (candidate === "LONG") {
    if (summary.longDistanceFromEmaFastPercent > tradingConfig.maxLongDistanceFromEmaFastPercent) {
      blockers.push("preco esticado acima da EMA curta");
    }

    if (summary.rsi > tradingConfig.longRsiOverboughtBlock) {
      blockers.push("RSI alto demais para nova compra");
    }

    if (!(summary.rsi >= tradingConfig.longRsiMin && summary.rsi <= tradingConfig.longRsiMax)) {
      blockers.push("RSI fora da faixa de compra");
    }

    if (summary.orderBookImbalance < tradingConfig.minOrderBookImbalance) {
      blockers.push("book sem pressao compradora suficiente");
    }

    if (summary.longScore < tradingConfig.minLongScore) {
      blockers.push("score de compra abaixo do minimo");
    }
  }

  if (candidate === "SHORT") {
    if (
      summary.shortDistanceFromEmaFastPercent > tradingConfig.maxShortDistanceFromEmaFastPercent
    ) {
      blockers.push("preco esticado abaixo da EMA curta");
    }

    if (summary.rsi < tradingConfig.shortRsiOversoldBlock) {
      blockers.push("RSI baixo demais para nova venda");
    }

    if (!(summary.rsi >= tradingConfig.shortRsiMin && summary.rsi <= tradingConfig.shortRsiMax)) {
      blockers.push("RSI fora da faixa de venda");
    }

    if (summary.orderBookImbalance > -tradingConfig.minOrderBookImbalance) {
      blockers.push("book sem pressao vendedora suficiente");
    }

    if (summary.shortScore < tradingConfig.minShortScore) {
      blockers.push("score de venda abaixo do minimo");
    }
  }

  if (
    candidate !== "NONE" &&
    Math.abs((summary.longScore || 0) - (summary.shortScore || 0)) < tradingConfig.minScoreGap
  ) {
    blockers.push("vantagem entre os lados ainda pequena");
  }

  return [...new Set(blockers)];
}

function buildSignalSummary(metrics, scores, decision, reasons, candidateDecision = decision) {
  const summary = {
    decision,
    candidateDecision,
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
    distanceFromEmaFastPercent: metrics.distanceFromEmaFastPercent,
    longDistanceFromEmaFastPercent: metrics.longDistanceFromEmaFastPercent,
    shortDistanceFromEmaFastPercent: metrics.shortDistanceFromEmaFastPercent,
    bodyExpansionMultiplier: metrics.bodyExpansionMultiplier,
    signalCandleOpenTime: metrics.signalCandle.openTime,
    reasons,
  };

  summary.blockers = getAnalysisBlockers(summary);
  return summary;
}

export function analyzeMarketSnapshot(candles, options = {}) {
  const orderBookImbalance =
    options.orderBookImbalance !== undefined ? options.orderBookImbalance : 0;

  if (candles.length < Math.max(tradingConfig.trendSmaPeriod + 1, 210)) {
    throw new Error("Nao ha candles suficientes para analisar o contexto do mercado");
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
    averageBodyPercent: getAverageBodyPercent(candles, tradingConfig.entryBodyAveragePeriod),
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
    throw new Error("Os indicadores ainda nao estao prontos");
  }

  metrics.volumeRatio = signalCandle.volume / metrics.volumeAverage;
  metrics.atrPercent = metrics.atr / signalCandle.close;
  metrics.distanceFromEmaFastPercent =
    metrics.emaFast === 0
      ? 0
      : Math.abs(signalCandle.close - metrics.emaFast) / Math.abs(metrics.emaFast);
  metrics.longDistanceFromEmaFastPercent =
    metrics.emaFast === 0
      ? 0
      : Math.max(0, (signalCandle.close - metrics.emaFast) / Math.abs(metrics.emaFast));
  metrics.shortDistanceFromEmaFastPercent =
    metrics.emaFast === 0
      ? 0
      : Math.max(0, (metrics.emaFast - signalCandle.close) / Math.abs(metrics.emaFast));
  metrics.bodyExpansionMultiplier =
    metrics.averageBodyPercent > 0
      ? getCandleBodyPercent(signalCandle) / metrics.averageBodyPercent
      : 0;

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
  const bullishExpansionOkay =
    signalCandle.close <= signalCandle.open ||
    metrics.bodyExpansionMultiplier <= tradingConfig.maxEntryBodyExpansionMultiplier;
  const bearishExpansionOkay =
    signalCandle.close >= signalCandle.open ||
    metrics.bodyExpansionMultiplier <= tradingConfig.maxEntryBodyExpansionMultiplier;
  const bullishDistanceOkay =
    metrics.longDistanceFromEmaFastPercent <= tradingConfig.maxLongDistanceFromEmaFastPercent;
  const bearishDistanceOkay =
    metrics.shortDistanceFromEmaFastPercent <= tradingConfig.maxShortDistanceFromEmaFastPercent;
  const bullishRsiHeatOkay = metrics.rsi <= tradingConfig.longRsiOverboughtBlock;
  const bearishRsiHeatOkay = metrics.rsi >= tradingConfig.shortRsiOversoldBlock;
  const volatilityOkay =
    metrics.atrPercent >= tradingConfig.minAtrPercent &&
    metrics.atrPercent <= tradingConfig.maxAtrPercent;
  const checks = {
    bullishTrend,
    bearishTrend,
    bullishCandle,
    bearishCandle,
    bullishVolume,
    bearishVolume,
    bullishOrderBook,
    bearishOrderBook,
    bullishRsi,
    bearishRsi,
    bullishMacd,
    bearishMacd,
    bullishExpansionOkay,
    bearishExpansionOkay,
    bullishDistanceOkay,
    bearishDistanceOkay,
    bullishRsiHeatOkay,
    bearishRsiHeatOkay,
    volatilityOkay,
  };

  const scores = {
    longScore: 0,
    shortScore: 0,
  };

  if (bullishTrend) {
    scores.longScore += tradingConfig.trendScoreWeight;
  }

  if (bearishTrend) {
    scores.shortScore += tradingConfig.trendScoreWeight;
  }

  if (bullishRsi) {
    scores.longScore += tradingConfig.rsiScoreWeight;
  }

  if (bearishRsi) {
    scores.shortScore += tradingConfig.rsiScoreWeight;
  }

  if (bullishMacd) {
    scores.longScore += tradingConfig.macdScoreWeight;
  }

  if (bearishMacd) {
    scores.shortScore += tradingConfig.macdScoreWeight;
  }

  if (bullishCandle) {
    scores.longScore += tradingConfig.candleScoreWeight;
  }

  if (bearishCandle) {
    scores.shortScore += tradingConfig.candleScoreWeight;
  }

  if (bullishVolume) {
    scores.longScore += tradingConfig.volumeScoreWeight;
  }

  if (bearishVolume) {
    scores.shortScore += tradingConfig.volumeScoreWeight;
  }

  if (bullishOrderBook) {
    scores.longScore += tradingConfig.orderBookScoreWeight;
  }

  if (bearishOrderBook) {
    scores.shortScore += tradingConfig.orderBookScoreWeight;
  }

  let candidateDecision = "NONE";

  if (
    volatilityOkay &&
    bullishTrend &&
    bullishMacd &&
    bullishRsi &&
    bullishCandle &&
    bullishVolume &&
    bullishExpansionOkay &&
    bullishDistanceOkay &&
    bullishRsiHeatOkay &&
    scores.longScore >= tradingConfig.minLongScore &&
    scores.longScore >= scores.shortScore + tradingConfig.minScoreGap
  ) {
    candidateDecision = "LONG";
  } else if (
    volatilityOkay &&
    bearishTrend &&
    bearishMacd &&
    bearishRsi &&
    bearishCandle &&
    bearishVolume &&
    bearishExpansionOkay &&
    bearishDistanceOkay &&
    bearishRsiHeatOkay &&
    scores.shortScore >= tradingConfig.minShortScore &&
    scores.shortScore >= scores.longScore + tradingConfig.minScoreGap
  ) {
    candidateDecision = "SHORT";
  }
  const decision = candidateDecision;
  const reasons = buildDecisionReasons(decision, checks);
  const summary = buildSignalSummary(metrics, scores, decision, reasons, candidateDecision);

  return {
    decision: summary.decision,
    metrics,
    scores,
    summary,
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
