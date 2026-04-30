import { safeInsert, safeRead, toIsoTimestamp } from "./shared.js";

export async function saveTradeToDatabase(trade) {
  return safeInsert(
    `
      INSERT INTO trades (
        event_timestamp,
        symbol,
        mode,
        side,
        action,
        entry_price,
        exit_price,
        quantity,
        stop_loss,
        take_profit,
        pnl_usdt,
        pnl_brl,
        fees,
        reason,
        opened_at,
        closed_at,
        signal_candle_open_time,
        analysis_decision,
        payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb
      )
    `,
    [
      toIsoTimestamp(trade.timestamp),
      trade.symbol,
      trade.mode,
      trade.side,
      trade.action,
      trade.entryPrice,
      trade.exitPrice,
      trade.quantity,
      trade.stopLoss,
      trade.takeProfit,
      trade.pnlUsdt,
      trade.pnlBrl,
      trade.fees,
      trade.reason,
      trade.openedAt ? toIsoTimestamp(trade.openedAt) : null,
      trade.closedAt ? toIsoTimestamp(trade.closedAt) : null,
      trade.signalCandleOpenTime,
      trade.analysisDecision,
      JSON.stringify(trade),
    ],
    "Falha ao persistir trade no Postgres"
  );
}

export async function getTradesFromDatabase(symbol, mode, limit = 20) {
  const rows = await safeRead(
    `
      SELECT payload
      FROM trades
      WHERE symbol = $1 AND mode = $2
      ORDER BY event_timestamp DESC, id DESC
      LIMIT $3
    `,
    [symbol, mode, limit],
    [],
    "Falha ao consultar trades no Postgres"
  );

  return rows.map((row) => row.payload);
}
