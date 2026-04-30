export const tradingConfig = {
  tradingMode: process.env.TRADING_MODE || "live",
  symbol: process.env.SYMBOL || "BTCUSDT",
  usdAmount: Number(process.env.USD_AMOUNT || 120),
  reconnectDelayMs: Number(process.env.WS_RECONNECT_DELAY_MS || 2000),
  defaultUsdtBrl: Number(process.env.DEFAULT_USDT_BRL || 5),
  paperStartBalance: Number(process.env.PAPER_START_BALANCE || 1000),
  paperFeeRate: Number(process.env.PAPER_FEE_RATE || 0.0004),
  telegramStatusEnabled:
    (process.env.TELEGRAM_STATUS_ENABLED || "true").toLowerCase() !== "false",
  telegramStatusIntervalMs: Number(process.env.TELEGRAM_STATUS_INTERVAL_MS || 900000),
  telegramNotifyStartup:
    (process.env.TELEGRAM_NOTIFY_STARTUP || "true").toLowerCase() !== "false",
  telegramNotifyDailyReset:
    (process.env.TELEGRAM_NOTIFY_DAILY_RESET || "true").toLowerCase() !== "false",
  apiPort: Number(process.env.API_PORT || 3000),
  dashboardRefreshMs: Number(process.env.DASHBOARD_REFRESH_MS || 5000),
  dashboardChartPoints: Number(process.env.DASHBOARD_CHART_POINTS || 80),
  databaseEnabled:
    (process.env.DATABASE_ENABLED || "false").toLowerCase() === "true",
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl:
    (process.env.DATABASE_SSL || "false").toLowerCase() === "true",
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 10),
  dailyResetTimeZone: process.env.DAILY_RESET_TIME_ZONE || "America/Sao_Paulo",
  dailyProfitTargetUsdt: Number(process.env.DAILY_PROFIT_TARGET_USDT || 0),
  dailyProfitTargetMode:
    (process.env.DAILY_PROFIT_TARGET_MODE || "positive").toLowerCase() === "net"
      ? "net"
      : "positive",
  dailyMaxEntries: Number(process.env.DAILY_MAX_ENTRIES || 0),
  monitoringSnapshotIntervalMs: Number(
    process.env.MONITORING_SNAPSHOT_INTERVAL_MS || 5000
  ),
  exchangeProtectionEnabled:
    (process.env.EXCHANGE_PROTECTION_ENABLED || "true").toLowerCase() !== "false",
  protectionWorkingType:
    (process.env.PROTECTION_WORKING_TYPE || "CONTRACT_PRICE").toUpperCase() === "MARK_PRICE"
      ? "MARK_PRICE"
      : "CONTRACT_PRICE",
  protectionPriceProtect:
    (process.env.PROTECTION_PRICE_PROTECT || "false").toLowerCase() === "true",
  candleInterval: process.env.CANDLE_INTERVAL || "5m",
  candleLimit: Number(process.env.CANDLE_LIMIT || 250),
  analysisIntervalMs: Number(process.env.ANALYSIS_INTERVAL_MS || 12000),
  cooldownMs: Number(process.env.COOLDOWN_MS || 300000),
  orderBookLevels: Number(process.env.ORDER_BOOK_LEVELS || 20),
  fastEmaPeriod: Number(process.env.FAST_EMA_PERIOD || 9),
  slowEmaPeriod: Number(process.env.SLOW_EMA_PERIOD || 21),
  trendEmaPeriod: Number(process.env.TREND_EMA_PERIOD || 55),
  trendSmaPeriod: Number(process.env.TREND_SMA_PERIOD || 200),
  volumeSmaPeriod: Number(process.env.VOLUME_SMA_PERIOD || 20),
  rsiPeriod: Number(process.env.RSI_PERIOD || 14),
  macdFastPeriod: Number(process.env.MACD_FAST_PERIOD || 12),
  macdSlowPeriod: Number(process.env.MACD_SLOW_PERIOD || 26),
  macdSignalPeriod: Number(process.env.MACD_SIGNAL_PERIOD || 9),
  atrPeriod: Number(process.env.ATR_PERIOD || 14),
  entryBodyAveragePeriod: Number(process.env.ENTRY_BODY_AVG_PERIOD || 12),
  maxEntryBodyExpansionMultiplier: Number(
    process.env.MAX_ENTRY_BODY_EXPANSION_MULTIPLIER || 1.7
  ),
  maxLongDistanceFromEmaFastPercent: Number(
    process.env.MAX_LONG_DISTANCE_FROM_EMA_FAST_PERCENT || 0.0012
  ),
  maxShortDistanceFromEmaFastPercent: Number(
    process.env.MAX_SHORT_DISTANCE_FROM_EMA_FAST_PERCENT || 0.0016
  ),
  longRsiOverboughtBlock: Number(process.env.LONG_RSI_OVERBOUGHT_BLOCK || 67),
  shortRsiOversoldBlock: Number(process.env.SHORT_RSI_OVERSOLD_BLOCK || 30),
  takeProfitAtrMultiple: Number(process.env.TAKE_PROFIT_ATR_MULTIPLE || 2.1),
  takeProfitMode:
    (process.env.TAKE_PROFIT_MODE || "trail_after_target").toLowerCase() === "fixed"
      ? "fixed"
      : "trail_after_target",
  stopLossAtrMultiple: Number(process.env.STOP_LOSS_ATR_MULTIPLE || 1.3),
  trailingAtrMultiple: Number(process.env.TRAILING_ATR_MULTIPLE || 1.1),
  postTargetTrailingAtrMultiple: Number(
    process.env.POST_TARGET_TRAILING_ATR_MULTIPLE || 0.6
  ),
  postTargetBreakEvenAtrBuffer: Number(
    process.env.POST_TARGET_BREAK_EVEN_ATR_BUFFER || 0.25
  ),
  postTargetMinLockedProfitPercent: Number(
    process.env.POST_TARGET_MIN_LOCKED_PROFIT_PERCENT || 0.00035
  ),
  minAtrPercent: Number(process.env.MIN_ATR_PERCENT || 0.0007),
  maxAtrPercent: Number(process.env.MAX_ATR_PERCENT || 0.025),
  minVolumeRatio: Number(process.env.MIN_VOLUME_RATIO || 1),
  minCandleBodyRatio: Number(process.env.MIN_CANDLE_BODY_RATIO || 0.35),
  minOrderBookImbalance: Number(process.env.MIN_ORDER_BOOK_IMBALANCE || 0.05),
  longRsiMin: Number(process.env.LONG_RSI_MIN || 53),
  longRsiMax: Number(process.env.LONG_RSI_MAX || 68),
  shortRsiMin: Number(process.env.SHORT_RSI_MIN || 32),
  shortRsiMax: Number(process.env.SHORT_RSI_MAX || 47),
  trendScoreWeight: Number(process.env.TREND_SCORE_WEIGHT || 2),
  rsiScoreWeight: Number(process.env.RSI_SCORE_WEIGHT || 1),
  macdScoreWeight: Number(process.env.MACD_SCORE_WEIGHT || 2),
  candleScoreWeight: Number(process.env.CANDLE_SCORE_WEIGHT || 1),
  volumeScoreWeight: Number(process.env.VOLUME_SCORE_WEIGHT || 1),
  orderBookScoreWeight: Number(process.env.ORDER_BOOK_SCORE_WEIGHT || 1),
  minLongScore: Number(process.env.MIN_LONG_SCORE || 5),
  minShortScore: Number(process.env.MIN_SHORT_SCORE || 5),
  minScoreGap: Number(process.env.MIN_SCORE_GAP || 1.5),
  contextualCooldownEnabled:
    (process.env.CONTEXTUAL_COOLDOWN_ENABLED || "true").toLowerCase() !== "false",
  contextualCooldownMinDurationMs: Number(
    process.env.CONTEXTUAL_COOLDOWN_MIN_DURATION_MS || 300000
  ),
  reentryLongResetRsiMax: Number(process.env.REENTRY_LONG_RESET_RSI_MAX || 56),
  reentryShortResetRsiMin: Number(process.env.REENTRY_SHORT_RESET_RSI_MIN || 44),
  reentryResetMaxDistanceFromEmaFastPercent: Number(
    process.env.REENTRY_RESET_MAX_DISTANCE_FROM_EMA_FAST_PERCENT || 0.0006
  ),
  reentryLongResetMacdHistogramMax: Number(
    process.env.REENTRY_LONG_RESET_MACD_HISTOGRAM_MAX || 0.3
  ),
  reentryShortResetMacdHistogramMin: Number(
    process.env.REENTRY_SHORT_RESET_MACD_HISTOGRAM_MIN || -0.3
  ),
  stateSyncIntervalMs: Number(process.env.STATE_SYNC_INTERVAL_MS || 60000),
  positionSyncIntervalMs: Number(process.env.POSITION_SYNC_INTERVAL_MS || 5000),
  backtestLimit: Number(process.env.BACKTEST_LIMIT || 1000),
  backtestInitialBalance: Number(process.env.BACKTEST_INITIAL_BALANCE || 1000),
};
