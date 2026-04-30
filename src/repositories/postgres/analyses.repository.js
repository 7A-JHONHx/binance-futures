import { safeInsert, safeRead, toIsoTimestamp } from "./shared.js";

export async function saveAnalysisToDatabase(analysis) {
  return safeInsert(
    `
      INSERT INTO analyses (
        event_timestamp,
        symbol,
        mode,
        decision,
        long_score,
        short_score,
        close_price,
        ema_fast,
        ema_slow,
        ema_trend,
        sma_trend,
        rsi,
        macd,
        macd_signal,
        macd_histogram,
        atr,
        atr_percent,
        volume_ratio,
        order_book_imbalance,
        candle_body_ratio,
        signal_candle_open_time,
        payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb
      )
    `,
    [
      toIsoTimestamp(analysis.timestamp),
      analysis.symbol,
      analysis.mode,
      analysis.decision,
      analysis.longScore,
      analysis.shortScore,
      analysis.close,
      analysis.emaFast,
      analysis.emaSlow,
      analysis.emaTrend,
      analysis.smaTrend,
      analysis.rsi,
      analysis.macd,
      analysis.macdSignal,
      analysis.macdHistogram,
      analysis.atr,
      analysis.atrPercent,
      analysis.volumeRatio,
      analysis.orderBookImbalance,
      analysis.candleBodyRatio,
      analysis.signalCandleOpenTime,
      JSON.stringify(analysis),
    ],
    "Falha ao persistir analise no Postgres"
  );
}

export async function getAnalysesFromDatabase(symbol, mode, limit = 30) {
  const rows = await safeRead(
    `
      SELECT payload
      FROM analyses
      WHERE symbol = $1 AND mode = $2
      ORDER BY event_timestamp DESC, id DESC
      LIMIT $3
    `,
    [symbol, mode, limit],
    [],
    "Falha ao consultar analises no Postgres"
  );

  return rows.map((row) => row.payload);
}
