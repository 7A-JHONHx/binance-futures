CREATE TABLE IF NOT EXISTS bot_snapshots (
  id BIGSERIAL PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_metrics (
  id BIGSERIAL PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  event_timestamp TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  side TEXT NOT NULL,
  action TEXT NOT NULL,
  entry_price DOUBLE PRECISION NULL,
  exit_price DOUBLE PRECISION NULL,
  quantity DOUBLE PRECISION NULL,
  stop_loss DOUBLE PRECISION NULL,
  take_profit DOUBLE PRECISION NULL,
  pnl_usdt DOUBLE PRECISION NULL,
  pnl_brl DOUBLE PRECISION NULL,
  fees DOUBLE PRECISION NULL,
  reason TEXT NULL,
  opened_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  signal_candle_open_time BIGINT NULL,
  analysis_decision TEXT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  id BIGSERIAL PRIMARY KEY,
  event_timestamp TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  decision TEXT NOT NULL,
  long_score DOUBLE PRECISION NULL,
  short_score DOUBLE PRECISION NULL,
  close_price DOUBLE PRECISION NULL,
  ema_fast DOUBLE PRECISION NULL,
  ema_slow DOUBLE PRECISION NULL,
  ema_trend DOUBLE PRECISION NULL,
  sma_trend DOUBLE PRECISION NULL,
  rsi DOUBLE PRECISION NULL,
  macd DOUBLE PRECISION NULL,
  macd_signal DOUBLE PRECISION NULL,
  macd_histogram DOUBLE PRECISION NULL,
  atr DOUBLE PRECISION NULL,
  atr_percent DOUBLE PRECISION NULL,
  volume_ratio DOUBLE PRECISION NULL,
  order_book_imbalance DOUBLE PRECISION NULL,
  candle_body_ratio DOUBLE PRECISION NULL,
  signal_candle_open_time BIGINT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bot_snapshots_symbol_mode_generated
  ON bot_snapshots(symbol, mode, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_metrics_symbol_mode_generated
  ON bot_metrics(symbol, mode, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_mode_event
  ON trades(symbol, mode, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_analyses_symbol_mode_event
  ON analyses(symbol, mode, event_timestamp DESC);
