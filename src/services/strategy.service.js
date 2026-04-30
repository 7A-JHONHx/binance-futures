import { tradingConfig } from "../config/trading.config.js";
import { analyzeMarket } from "./analysis.service.js";
import {
  cancelProtectionOrder,
  executeEntryOrder,
  executeExitOrder,
  hasActiveProtectionOrder,
  isNativeProtectionEnabled,
  isPaperTrading,
  placeStopProtectionOrder,
  placeTakeProfitProtectionOrder,
  syncProtectionOrders,
} from "./execution.service.js";
import {
  recordAnalysis,
  recordTrade,
  saveMetrics,
  saveStatusSnapshot,
  summarizeTradeHistory,
} from "./journal.service.js";
import {
  calculateOrderQuantity,
  getOpenPosition,
  getUSDTBRL,
  getUSDTBalance,
  normalizeTriggerPrice,
} from "./market.service.js";
import { buildPerformanceMetrics, buildStatusSnapshot } from "./monitoring.service.js";
import {
  getState,
  loadState,
  resetPositionState,
  saveState,
  syncDailyState,
} from "./state.service.js";
import { sendMessage } from "./telegram.service.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";

let tickLock = false;

function getPositionSnapshot(position) {
  return {
    side: position.side,
    entryPrice: position.entryPrice,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    takeProfitArmed: position.takeProfitArmed,
    quantity: position.quantity,
    atr: position.atr,
    highestPrice: position.highestPrice,
    lowestPrice: position.lowestPrice,
    signalCandleOpenTime: position.signalCandleOpenTime,
    reservedMargin: position.reservedMargin,
    protectionOrders: position.protectionOrders,
  };
}

function formatTradingMode(mode) {
  return mode === "paper" ? "Simulado" : "Real";
}

function formatPositionSide(side) {
  if (side === "NONE") {
    return "Sem posicao";
  }

  if (side === "LONG") {
    return "Comprado (LONG)";
  }

  if (side === "SHORT") {
    return "Vendido (SHORT)";
  }

  return side;
}

function formatExitReason(reason) {
  if (reason === "TAKE PROFIT") {
    return "Alvo atingido";
  }

  if (reason === "STOP LOSS / TRAILING") {
    return "Stop loss / trailing acionado";
  }

  if (reason === "SAIDA AUTOMATICA NA BINANCE") {
    return "Saida automatica executada na Binance";
  }

  if (reason === "ENCERRAMENTO AUTOMATICO") {
    return "Encerramento automatico";
  }

  return reason;
}

function formatTakeProfitMode(mode) {
  return mode === "fixed" ? "alvo fixo" : "trailing apos alvo";
}

function formatOpenAction(side) {
  if (side === "LONG") {
    return "COMPRA";
  }

  if (side === "SHORT") {
    return "VENDA";
  }

  return "OPERACAO";
}

function formatProtectionOrderStatus(status) {
  if (status === "NEW") {
    return "Aberta";
  }

  if (status === "FILLED") {
    return "Executada";
  }

  if (status === "CANCELED") {
    return "Cancelada";
  }

  if (status === "EXPIRED") {
    return "Expirada";
  }

  if (status === "REJECTED") {
    return "Rejeitada";
  }

  if (status === "PARTIALLY_FILLED") {
    return "Parcialmente executada";
  }

  if (status === "UNKNOWN") {
    return "Nao localizada";
  }

  if (status === "NONE") {
    return "Nao enviada";
  }

  return status;
}

function formatDailyPauseReason(reason) {
  if (reason === "DAILY_PROFIT_TARGET") {
    return "Meta diaria de lucro atingida";
  }

  if (reason === "DAILY_MAX_ENTRIES") {
    return "Limite diario de entradas atingido";
  }

  return reason;
}

function formatExitSource(exitSource) {
  if (exitSource === "STOP_MARKET") {
    return "Ordem STOP_MARKET da Binance";
  }

  if (exitSource === "TAKE_PROFIT_MARKET") {
    return "Ordem TAKE_PROFIT_MARKET da Binance";
  }

  if (exitSource === "MARKET_REDUCE_ONLY") {
    return "Ordem MARKET reduceOnly do bot";
  }

  if (exitSource === "ENCERRAMENTO_MANUAL_NA_CORRETORA") {
    return "Encerramento manual na corretora";
  }

  if (exitSource === "ORDENS_NATIVAS") {
    return "Protecoes nativas da Binance";
  }

  return exitSource;
}

function formatDecision(decision) {
  if (decision === "LONG") {
    return "Compra (LONG)";
  }

  if (decision === "SHORT") {
    return "Venda (SHORT)";
  }

  return "Nenhuma entrada";
}

function formatDailyProfitTargetMode(mode) {
  return mode === "net" ? "lucro liquido" : "lucro positivo";
}

function formatDecimal(value, fractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return "n/d";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatPrice(value) {
  return formatDecimal(value, 2);
}

function formatUsdt(value) {
  return `${formatDecimal(value, 2)} USDT`;
}

function formatBrl(value) {
  return `R$ ${formatDecimal(value, 2)}`;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "n/d";
  }

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tradingConfig.dailyResetTimeZone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function formatClockTime(timestamp = Date.now()) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tradingConfig.dailyResetTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(11, 16);
  }
}

function getTelegramModeBadge() {
  return tradingConfig.tradingMode === "paper" ? "🧪 Simulado" : "💼 Real";
}

function getTelegramSideBadge(side) {
  if (side === "LONG") {
    return "🟢 LONG";
  }

  if (side === "SHORT") {
    return "🔴 SHORT";
  }

  return "⚪ Sem posição";
}

function formatSignedUsdt(value) {
  if (!Number.isFinite(value)) {
    return "n/d";
  }

  const signal = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${signal}${formatDecimal(Math.abs(value), 2)} USDT`;
}

function formatTelegramReason(reason) {
  const normalizedReason = `${reason || ""}`.trim().toLowerCase();

  if (normalizedReason.includes("tendencia")) {
    return "Tendência";
  }

  if (normalizedReason.includes("macd")) {
    return "MACD";
  }

  if (normalizedReason.includes("rsi")) {
    return "RSI";
  }

  if (normalizedReason.includes("candle")) {
    return "Candle forte";
  }

  if (normalizedReason.includes("volume")) {
    return "Volume";
  }

  if (normalizedReason.includes("book")) {
    return "Book";
  }

  if (normalizedReason.includes("volatilidade")) {
    return "Volatilidade";
  }

  return reason;
}

function formatTelegramBlocker(reason) {
  const normalizedReason = `${reason || ""}`.trim().toLowerCase();

  if (normalizedReason.includes("volume abaixo")) {
    return "volume fraco";
  }

  if (normalizedReason.includes("ema curta")) {
    return "preco esticado da EMA";
  }

  if (normalizedReason.includes("rsi")) {
    return "RSI extremo";
  }

  if (normalizedReason.includes("book")) {
    return "book fraco";
  }

  if (normalizedReason.includes("volatilidade")) {
    return "volatilidade fora da faixa";
  }

  if (normalizedReason.includes("score")) {
    return "score insuficiente";
  }

  if (normalizedReason.includes("candle")) {
    return "candle sem confirmacao";
  }

  return reason;
}

function buildTelegramReasonLabel(analysisSummary) {
  if (!analysisSummary?.reasons?.length) {
    return "🧠 Contexto tecnico favoravel";
  }

  const labels = [...new Set(analysisSummary.reasons.map(formatTelegramReason).filter(Boolean))];

  return `🧠 ${labels.join(" + ")}`;
}

function buildTelegramBlockerLabel(analysisSummary, maxItems = 3) {
  if (!analysisSummary?.blockers?.length) {
    return null;
  }

  const labels = [
    ...new Set(analysisSummary.blockers.map(formatTelegramBlocker).filter(Boolean)),
  ].slice(0, maxItems);

  if (labels.length === 0) {
    return null;
  }

  return `🚫 Sem entrada: ${labels.join(" | ")}`;
}

function buildTelegramPositionLine(state) {
  if (!state.position.isOpen) {
    return "📦 Sem posição aberta";
  }

  return `📦 ${getTelegramSideBadge(state.position.side)} @ ${formatPrice(state.position.entryPrice)}`;
}

function isFavorableExit(side, entryPrice, exitPrice) {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice)) {
    return false;
  }

  if (side === "LONG") {
    return exitPrice > entryPrice;
  }

  if (side === "SHORT") {
    return exitPrice < entryPrice;
  }

  return false;
}

function joinMessageLines(lines) {
  return lines.filter(Boolean).join("\n");
}

function buildPositionLogContext(position) {
  if (!position.isOpen) {
    return {
      posicao: "Sem posicao",
    };
  }

  return {
    posicao: formatPositionSide(position.side),
    precoEntrada: position.entryPrice,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    alvoJaAtingido: position.takeProfitArmed,
    quantidade: position.quantity,
    atr: position.atr,
    maiorPreco: position.highestPrice,
    menorPreco: position.lowestPrice,
    candleDoSinal: position.signalCandleOpenTime,
    margemReservada: position.reservedMargin,
    origemSaida: position.exitSource,
    protecoesNativas: {
      stop: buildProtectionLogContext(position.protectionOrders.stop),
      takeProfit: buildProtectionLogContext(position.protectionOrders.takeProfit),
    },
  };
}

function buildProtectionLogContext(orderState) {
  return {
    ativa: orderState.enabled,
    status: formatProtectionOrderStatus(orderState.status),
    orderId: orderState.orderId,
    clientOrderId: orderState.clientOrderId,
    stopPrice: orderState.stopPrice,
    avgPrice: orderState.avgPrice,
    workingType: orderState.workingType,
    priceProtect: orderState.priceProtect,
    updatedAt: orderState.updatedAt,
  };
}

function buildDailyLogContext(daily) {
  return {
    diaOperacional: daily.tradingDay,
    entradasAbertasNoDia: daily.entriesOpened,
    tradesFechadosNoDia: daily.tradesClosed,
    pnlLiquidoDoDia: daily.netRealizedPnl,
    pnlPositivoDoDia: daily.positivePnl,
    pnlNegativoDoDia: daily.negativePnl,
    operacoesPausadasHoje: daily.tradingPaused,
    motivoPausaDiaria: daily.pauseReason
      ? formatDailyPauseReason(daily.pauseReason)
      : null,
  };
}

function getRobotStatusLabel(state) {
  if (state.position.isOpen) {
    return `Em operacao: ${formatPositionSide(state.position.side)}`;
  }

  if (state.daily.tradingPaused) {
    return `Pausado no dia: ${formatDailyPauseReason(state.daily.pauseReason)}`;
  }

  if (state.runtime.cooldownUntil > Date.now()) {
    return "Em cooldown, aguardando nova janela";
  }

   if (state.runtime.contextualCooldown?.active) {
    return `Aguardando reset para ${state.runtime.contextualCooldown.blockedSide}`;
  }

  return "Monitorando oportunidades";
}

function buildAnalysisLogContext(summary) {
  return {
    decisao: formatDecision(summary.decision),
    pontuacaoLong: summary.longScore,
    pontuacaoShort: summary.shortScore,
    fechamento: summary.close,
    emaRapida: summary.emaFast,
    emaLenta: summary.emaSlow,
    emaTendencia: summary.emaTrend,
    smaTendencia: summary.smaTrend,
    rsi: summary.rsi,
    macd: summary.macd,
    sinalMacd: summary.macdSignal,
    histogramaMacd: summary.macdHistogram,
    atr: summary.atr,
    atrPercentual: summary.atrPercent,
    relacaoVolume: summary.volumeRatio,
    desequilibrioBook: summary.orderBookImbalance,
    proporcaoCorpoCandle: summary.candleBodyRatio,
    distanciaEmaCurtaPercent: summary.distanceFromEmaFastPercent,
    multiplicadorExpansaoCandle: summary.bodyExpansionMultiplier,
    bloqueiosAnalise: summary.blockers,
    candleDoSinal: summary.signalCandleOpenTime,
  };
}

function buildDailyGoalLines(state) {
  const trackedProfit = getTrackedDailyProfit(state.daily);
  const targetEnabled = tradingConfig.dailyProfitTargetUsdt > 0;
  const entriesLimitEnabled = tradingConfig.dailyMaxEntries > 0;

  return [
    "Metas do dia:",
    targetEnabled
      ? `Meta de lucro: ${formatUsdt(tradingConfig.dailyProfitTargetUsdt)} (${formatDailyProfitTargetMode(
          tradingConfig.dailyProfitTargetMode
        )})`
      : "Meta de lucro: desativada",
    targetEnabled
      ? `Progresso atual: ${formatUsdt(trackedProfit)}`
      : `Lucro acompanhado no dia: ${formatUsdt(trackedProfit)}`,
    entriesLimitEnabled
      ? `Entradas de hoje: ${state.daily.entriesOpened}/${tradingConfig.dailyMaxEntries}`
      : `Entradas de hoje: ${state.daily.entriesOpened} (sem limite)`,
    `Trades fechados hoje: ${state.daily.tradesClosed}`,
    `PnL liquido do dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    state.daily.tradingPaused
      ? `Status do dia: ${formatDailyPauseReason(state.daily.pauseReason)}`
      : "Status do dia: liberado para novas entradas",
  ];
}

function buildPortfolioSummaryLines(state) {
  const lines = [
    "Carteira:",
    `Resultado do dia: ${formatUsdt(state.daily.netRealizedPnl)} | Total: ${formatUsdt(
      state.portfolio.realizedPnl
    )}`,
    `Entradas hoje: ${state.daily.entriesOpened} | Fechadas: ${state.daily.tradesClosed}`,
  ];

  if (isPaperTrading()) {
    lines.push(
      `Saldo simulado: ${formatUsdt(
        state.portfolio.paperAvailableBalance
      )} | Margem: ${formatUsdt(state.portfolio.paperAllocatedMargin)}`
    );
  }

  if (state.daily.tradingPaused) {
    lines.push(`Status: ${formatDailyPauseReason(state.daily.pauseReason)}`);
  }

  return lines;
}

function buildEntryReasonLines(analysisSummary) {
  if (!analysisSummary?.reasons?.length) {
    return [];
  }

  return [`Motivo da entrada: ${analysisSummary.reasons.join(" | ")}`];
}

function buildTriggerLines(position) {
  if (!position?.isOpen) {
    return [];
  }

  const lines = [
    `Gatilhos: Stop ${formatPrice(position.stopLoss)} | Alvo ${formatPrice(position.takeProfit)}`,
    `Trailing: ${
      position.takeProfitArmed ? "ativo" : formatTakeProfitMode(tradingConfig.takeProfitMode)
    }`,
  ];

  if (!isNativeProtectionEnabled()) {
    return lines;
  }

  const stopOrder = position.protectionOrders.stop;
  const takeProfitOrder = position.protectionOrders.takeProfit;
  const nativeStop =
    stopOrder.enabled || stopOrder.orderId
      ? `${formatProtectionOrderStatus(stopOrder.status)} @ ${formatPrice(stopOrder.stopPrice)}`
      : "desligado";
  const nativeTakeProfit =
    takeProfitOrder.enabled || takeProfitOrder.orderId
      ? `${formatProtectionOrderStatus(takeProfitOrder.status)} @ ${formatPrice(
          takeProfitOrder.stopPrice
        )}`
      : tradingConfig.takeProfitMode === "fixed"
        ? "desligado"
        : "gerenciado pelo trailing";

  lines.push(`Binance: Stop ${nativeStop} | Take ${nativeTakeProfit}`);

  return lines;
}

function buildPositionValueLine(position, priceReference = null) {
  if (!position?.isOpen) {
    return null;
  }

  const referencePrice =
    Number.isFinite(priceReference) && priceReference > 0 ? priceReference : position.entryPrice;

  if (!Number.isFinite(referencePrice) || !Number.isFinite(position.quantity)) {
    return null;
  }

  return `Valor: ${formatUsdt(referencePrice * position.quantity)} | Quantidade: ${formatDecimal(
    position.quantity,
    3
  )}`;
}

function buildEntryCapitalLine(position) {
  if (!position?.isOpen) {
    return null;
  }

  if (Number.isFinite(position.reservedMargin) && position.reservedMargin > 0) {
    return `Valor: ${formatUsdt(position.reservedMargin)} | Quantidade: ${formatDecimal(
      position.quantity,
      3
    )}`;
  }

  return buildPositionValueLine(position);
}

function buildStatusNotification(reason, state) {
  const blockerLine =
    !state.position.isOpen && state.analysis?.lastSummary?.decision === "NONE"
      ? buildTelegramBlockerLabel(state.analysis.lastSummary, 2)
      : null;

  if (reason === "Bot iniciado e pronto para operar") {
    return joinMessageLines([
      "🤖🟢 BOT ONLINE",
      `🪙 ${tradingConfig.symbol} | ${getTelegramModeBadge()}`,
      `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
      `👀 ${getRobotStatusLabel(state)}`,
      blockerLine,
    ]);
  }

  return joinMessageLines([
    "📊✨ RESUMO",
    `🪙 ${tradingConfig.symbol} | ${getTelegramModeBadge()}`,
    `🎯 Entradas: ${state.daily.entriesOpened}`,
    `✅ Fechadas: ${state.daily.tradesClosed}`,
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    buildTelegramPositionLine(state),
    blockerLine,
  ]);
}

function shouldUseNativeStopOrder() {
  return isNativeProtectionEnabled();
}

function shouldUseNativeTakeProfitOrder() {
  return isNativeProtectionEnabled() && tradingConfig.takeProfitMode === "fixed";
}

function getCloseOrderSide(positionSide) {
  return positionSide === "LONG" ? "SELL" : "BUY";
}

function getProtectionExitPrice(
  position,
  protectionOrders,
  fallbackPrice = null,
  { allowEntryFallback = true } = {}
) {
  if (protectionOrders.takeProfit.status === "FILLED") {
    return protectionOrders.takeProfit.avgPrice || protectionOrders.takeProfit.stopPrice;
  }

  if (protectionOrders.stop.status === "FILLED") {
    return protectionOrders.stop.avgPrice || protectionOrders.stop.stopPrice;
  }

  if (Number.isFinite(fallbackPrice)) {
    return fallbackPrice;
  }

  return allowEntryFallback ? position.entryPrice : null;
}

async function getNormalizedStopProtectionPrice(position) {
  return normalizeTriggerPrice(
    position.stopLoss,
    tradingConfig.symbol,
    position.side === "LONG" ? "floor" : "ceil"
  );
}

async function getNormalizedTakeProfitProtectionPrice(position) {
  return normalizeTriggerPrice(
    position.takeProfit,
    tradingConfig.symbol,
    position.side === "LONG" ? "ceil" : "floor"
  );
}

function getTrackedDailyProfit(daily) {
  return tradingConfig.dailyProfitTargetMode === "net"
    ? daily.netRealizedPnl
    : daily.positivePnl;
}

function resolveExitReason({ reason, side, entryPrice, exitPrice, exitSource }) {
  if (
    reason === "TAKE PROFIT" &&
    !isFavorableExit(side, entryPrice, exitPrice)
  ) {
    if (exitSource === "TAKE_PROFIT_MARKET") {
      return "SAIDA AUTOMATICA NA BINANCE";
    }

    return "ENCERRAMENTO AUTOMATICO";
  }

  return reason;
}

function getExchangeExitReason(position, protectionOrders, fallbackPrice = null) {
  const exitPrice = getProtectionExitPrice(position, protectionOrders, fallbackPrice);

  if (protectionOrders.takeProfit.status === "FILLED") {
    return resolveExitReason({
      reason: "TAKE PROFIT",
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      exitSource: "TAKE_PROFIT_MARKET",
    });
  }

  if (protectionOrders.stop.status === "FILLED") {
    return "STOP LOSS / TRAILING";
  }

  return "SAIDA MANUAL NA CORRETORA";
}

function getDailyPauseReasonToApply(state) {
  if (
    tradingConfig.dailyProfitTargetUsdt > 0 &&
    getTrackedDailyProfit(state.daily) >= tradingConfig.dailyProfitTargetUsdt
  ) {
    return "DAILY_PROFIT_TARGET";
  }

  if (
    tradingConfig.dailyMaxEntries > 0 &&
    state.daily.entriesOpened >= tradingConfig.dailyMaxEntries
  ) {
    return "DAILY_MAX_ENTRIES";
  }

  return null;
}

function clearContextualCooldown(state = getState()) {
  state.runtime.contextualCooldown = {
    active: false,
    blockedSide: "NONE",
    reason: null,
    activatedAt: 0,
    releaseAfter: 0,
  };
}

function shouldActivateContextualCooldown(reason) {
  return (
    tradingConfig.contextualCooldownEnabled &&
    [
      "STOP LOSS / TRAILING",
      "SAIDA AUTOMATICA NA BINANCE",
      "ENCERRAMENTO AUTOMATICO",
    ].includes(reason)
  );
}

function activateContextualCooldown(side, reason) {
  const state = getState();

  if (!shouldActivateContextualCooldown(reason) || side === "NONE") {
    clearContextualCooldown(state);
    return;
  }

  const now = Date.now();
  state.runtime.contextualCooldown = {
    active: true,
    blockedSide: side,
    reason,
    activatedAt: now,
    releaseAfter: now + tradingConfig.contextualCooldownMinDurationMs,
  };
}

function getContextualCooldownBlockers(decision, summary) {
  const { contextualCooldown } = getState().runtime;

  if (
    !tradingConfig.contextualCooldownEnabled ||
    !contextualCooldown?.active ||
    contextualCooldown.blockedSide !== decision
  ) {
    return [];
  }

  const blockers = [];

  if (Date.now() < contextualCooldown.releaseAfter) {
    blockers.push("janela minima apos a ultima saida ainda ativa");
  }

  if (decision === "LONG") {
    if (summary.rsi > tradingConfig.reentryLongResetRsiMax) {
      blockers.push("RSI ainda nao resetou para nova compra");
    }

    if (
      summary.longDistanceFromEmaFastPercent >
      tradingConfig.reentryResetMaxDistanceFromEmaFastPercent
    ) {
      blockers.push("preco ainda longe da EMA curta para recompra");
    }

    if (summary.macdHistogram > tradingConfig.reentryLongResetMacdHistogramMax) {
      blockers.push("MACD ainda esticado na compra");
    }
  }

  if (decision === "SHORT") {
    if (summary.rsi < tradingConfig.reentryShortResetRsiMin) {
      blockers.push("RSI ainda nao resetou para nova venda");
    }

    if (
      summary.shortDistanceFromEmaFastPercent >
      tradingConfig.reentryResetMaxDistanceFromEmaFastPercent
    ) {
      blockers.push("preco ainda longe da EMA curta para revenda");
    }

    if (summary.macdHistogram < tradingConfig.reentryShortResetMacdHistogramMin) {
      blockers.push("MACD ainda esticado na venda");
    }
  }

  return blockers;
}

function buildDailyPauseNotification(reason, state) {
  return joinMessageLines([
    "⏸️🛑 ENTRADAS PAUSADAS",
    `🪙 ${tradingConfig.symbol} | ${getTelegramModeBadge()}`,
    `📍 ${formatDailyPauseReason(reason)}`,
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    `🎯 Entradas: ${state.daily.entriesOpened}`,
    `✅ Fechadas: ${state.daily.tradesClosed}`,
    `🕒 ${formatClockTime()}`,
  ]);
}

function buildEntryNotification(side, position, analysisSummary, _totalBrl, state) {
  return joinMessageLines([
    side === "LONG" ? "🚀🟢 LONG" : "🔻🔴 SHORT",
    `🪙 ${tradingConfig.symbol}`,
    `🎯 Entrada: ${formatPrice(position.entryPrice)}`,
    `📦 Qty: ${formatDecimal(position.quantity, 3)}`,
    `🛑 Stop: ${formatPrice(position.stopLoss)}`,
    `🏁 Alvo: ${formatPrice(position.takeProfit)}`,
    buildTelegramReasonLabel(analysisSummary),
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    `🕒 ${formatClockTime()}`,
  ]);
}

function buildTakeProfitArmedNotification(side, position, livePrice, state) {
  return joinMessageLines([
    "🔒📈 TRAILING AJUSTADO",
    `🪙 ${tradingConfig.symbol} | ${getTelegramSideBadge(side)}`,
    `📍 Entrada: ${formatPrice(position.entryPrice)}`,
    `💹 Preço: ${formatPrice(livePrice)}`,
    `🛑 Stop: ${formatPrice(position.stopLoss)}`,
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    `🕒 ${formatClockTime()}`,
  ]);
}

function buildExitNotification(reason, side, exitPrice, pnlUsdt, _pnlBrl, _exitSource = null, state) {
  return joinMessageLines([
    pnlUsdt >= 0 ? "✅💸 SAÍDA" : "⚠️📉 SAÍDA",
    `🪙 ${tradingConfig.symbol} | ${getTelegramSideBadge(side)}`,
    `🚪 Saída: ${formatPrice(exitPrice)}`,
    `${pnlUsdt >= 0 ? "📈" : "📉"} PnL: ${formatSignedUsdt(pnlUsdt)}`,
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    `🕒 ${formatClockTime()}`,
  ]);
}

function buildTelegramStatusMessage(reason, state) {
  const blockerLine =
    !state.position.isOpen && state.analysis?.lastSummary?.decision === "NONE"
      ? buildTelegramBlockerLabel(state.analysis.lastSummary, 2)
      : null;

  if (reason === "Bot iniciado e pronto para operar") {
    return joinMessageLines([
      "🤖🟢 BOT ONLINE",
      `🪙 ${tradingConfig.symbol} | ${getTelegramModeBadge()}`,
      `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
      `👀 ${getRobotStatusLabel(state)}`,
      blockerLine,
    ]);
  }

  return joinMessageLines([
    "📊✨ RESUMO",
    `🪙 ${tradingConfig.symbol} | ${getTelegramModeBadge()}`,
    `🎯 Entradas: ${state.daily.entriesOpened}`,
    `✅ Fechadas: ${state.daily.tradesClosed}`,
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    buildTelegramPositionLine(state),
    blockerLine,
  ]);
}

function buildTelegramDailyPauseMessage(reason, state) {
  return joinMessageLines([
    "⏸️🛑 ENTRADAS PAUSADAS",
    `🪙 ${tradingConfig.symbol} | ${getTelegramModeBadge()}`,
    `📍 ${formatDailyPauseReason(reason)}`,
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
    `🎯 Entradas: ${state.daily.entriesOpened}`,
    `✅ Fechadas: ${state.daily.tradesClosed}`,
  ]);
}

function buildTelegramEntryMessage(side, position, analysisSummary, state) {
  return joinMessageLines([
    side === "LONG" ? "🚀🟢 LONG" : "🔻🔴 SHORT",
    `🪙 ${tradingConfig.symbol} | ${getTelegramModeBadge()}`,
    `🎯 Entrada: ${formatPrice(position.entryPrice)}`,
    `📦 ${buildEntryCapitalLine(position)}`,
    `🛑 Stop: ${formatPrice(position.stopLoss)}`,
    `🏁 Alvo: ${formatPrice(position.takeProfit)}`,
    buildTelegramReasonLabel(analysisSummary),
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
  ]);
}

function buildTelegramTrailingMessage(side, position, livePrice, state) {
  return joinMessageLines([
    "🔒📈 TRAILING AJUSTADO",
    `🪙 ${tradingConfig.symbol} | ${getTelegramSideBadge(side)}`,
    `📍 Entrada: ${formatPrice(position.entryPrice)}`,
    `💹 Preço: ${formatPrice(livePrice)}`,
    `🛑 Stop: ${formatPrice(position.stopLoss)}`,
    "🔐 Lucro protegido com trailing reforçado",
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
  ]);
}

function buildTelegramExitMessage(reason, side, exitPrice, pnlUsdt, state) {
  return joinMessageLines([
    pnlUsdt >= 0 ? "✅💸 SAÍDA" : "⚠️📉 SAÍDA",
    `🪙 ${tradingConfig.symbol} | ${getTelegramSideBadge(side)}`,
    `🚪 Saída: ${formatPrice(exitPrice)}`,
    `${pnlUsdt >= 0 ? "📈" : "📉"} PnL: ${formatSignedUsdt(pnlUsdt)}`,
    `📌 Motivo: ${formatExitReason(reason)}`,
    `💰 Dia: ${formatUsdt(state.daily.netRealizedPnl)}`,
  ]);
}

function getEntryStops(side, entryPrice, atr) {
  if (side === "LONG") {
    return {
      stopLoss: entryPrice - atr * tradingConfig.stopLossAtrMultiple,
      takeProfit: entryPrice + atr * tradingConfig.takeProfitAtrMultiple,
    };
  }

  return {
    stopLoss: entryPrice + atr * tradingConfig.stopLossAtrMultiple,
    takeProfit: entryPrice - atr * tradingConfig.takeProfitAtrMultiple,
  };
}

function getTrailingStop(
  side,
  extremePrice,
  atr,
  atrMultiple = tradingConfig.trailingAtrMultiple
) {
  if (side === "LONG") {
    return extremePrice - atr * atrMultiple;
  }

  return extremePrice + atr * atrMultiple;
}

function getLockedProfitStop(side, entryPrice, atr) {
  const atrBuffer = atr * tradingConfig.postTargetBreakEvenAtrBuffer;
  const percentBuffer = entryPrice * tradingConfig.postTargetMinLockedProfitPercent;

  if (side === "LONG") {
    return Math.max(entryPrice + atrBuffer, entryPrice + percentBuffer);
  }

  return Math.min(entryPrice - atrBuffer, entryPrice - percentBuffer);
}

function calculateGrossPnl(side, entryPrice, exitPrice, quantity) {
  if (side === "LONG") {
    return (exitPrice - entryPrice) * quantity;
  }

  return (entryPrice - exitPrice) * quantity;
}

async function publishMonitoring(latestPrice = null, force = false) {
  const state = getState();
  const now = Date.now();

  if (latestPrice !== null) {
    state.runtime.latestPrice = latestPrice;
  }

  if (
    !force &&
    now - state.runtime.lastSnapshotAt < tradingConfig.monitoringSnapshotIntervalMs
  ) {
    return;
  }

  state.runtime.lastSnapshotAt = now;
  await saveState();

  await Promise.all([
    saveStatusSnapshot(buildStatusSnapshot({ state, latestPrice: state.runtime.latestPrice })),
    saveMetrics(buildPerformanceMetrics({ state })),
  ]);

  await maybeSendStatusNotification("Atualizacao do robo");
}

function shouldSendStatusNotification(state, force = false) {
  if (!tradingConfig.telegramStatusEnabled) {
    return false;
  }

  if (force) {
    return true;
  }

  if (tradingConfig.telegramStatusIntervalMs <= 0) {
    return false;
  }

  if (Date.now() - state.runtime.lastTelegramStatusAt < tradingConfig.telegramStatusIntervalMs) {
    return false;
  }

  return state.position.isOpen || state.daily.tradingPaused;
}

async function maybeSendStatusNotification(reason, { force = false } = {}) {
  const state = getState();

  if (!shouldSendStatusNotification(state, force)) {
    return false;
  }

  const sent = await sendMessage(buildTelegramStatusMessage(reason, state));

  if (!sent) {
    return false;
  }

  state.runtime.lastTelegramStatusAt = Date.now();
  await saveState();
  return true;
}

async function rehydrateStateFromTradeHistory() {
  const state = getState();
  const summary = await summarizeTradeHistory({
    symbol: tradingConfig.symbol,
    mode: tradingConfig.tradingMode,
    tradingDay: state.daily.tradingDay,
  });

  state.daily.entriesOpened = summary.daily.entriesOpened;
  state.daily.tradesClosed = summary.daily.tradesClosed;
  state.daily.netRealizedPnl = summary.daily.netRealizedPnl;
  state.daily.positivePnl = summary.daily.positivePnl;
  state.daily.negativePnl = summary.daily.negativePnl;

  state.activity.lastEntryAt = summary.activity.lastEntryAt;
  state.activity.lastEntrySide = summary.activity.lastEntrySide;
  state.activity.lastEntryPrice = summary.activity.lastEntryPrice;
  state.activity.lastExitAt = summary.activity.lastExitAt;
  state.activity.lastExitSide = summary.activity.lastExitSide;
  state.activity.lastExitPrice = summary.activity.lastExitPrice;
  state.activity.lastExitReason = summary.activity.lastExitReason;
  state.activity.lastExitPnlUsdt = summary.activity.lastExitPnlUsdt;
  state.activity.lastTradeAt = summary.activity.lastTradeAt;

  state.portfolio.tradesClosed = summary.portfolio.tradesClosed;
  state.portfolio.realizedPnl = summary.portfolio.realizedPnl;
  state.portfolio.feesPaid = summary.portfolio.feesPaid;
  state.portfolio.wins = summary.portfolio.wins;
  state.portfolio.losses = summary.portfolio.losses;

  await saveState();

  logInfo("Resumo do historico reidratado no estado", {
    ativo: tradingConfig.symbol,
    modo: formatTradingMode(tradingConfig.tradingMode),
    ultimaEntradaEm: state.activity.lastEntryAt,
    ultimaSaidaEm: state.activity.lastExitAt,
    ...buildDailyLogContext(state.daily),
  });
}

async function persistPositionReset(cooldownUntil = 0) {
  const state = getState();
  resetPositionState();
  state.runtime.isProcessing = false;
  state.runtime.cooldownUntil = cooldownUntil;
  await saveState();
}

async function refreshDailyState(timestamp = Date.now()) {
  const wasReset = syncDailyState(timestamp);

  if (!wasReset) {
    return false;
  }

  const state = getState();
  clearContextualCooldown(state);
  await saveState();

  logInfo("Controle diario reiniciado", {
    fusoHorario: tradingConfig.dailyResetTimeZone,
    ...buildDailyLogContext(state.daily),
  });

  if (tradingConfig.telegramNotifyDailyReset) {
    await maybeSendStatusNotification("Novo dia operacional iniciado", {
      force: true,
    });
  }

  return true;
}

async function enforceDailyTradingPause({ notify = false } = {}) {
  const state = getState();
  const pauseReason = getDailyPauseReasonToApply(state);

  if (!pauseReason) {
    if (state.daily.tradingPaused || state.daily.pauseReason || state.daily.pausedAt) {
      state.daily.tradingPaused = false;
      state.daily.pauseReason = null;
      state.daily.pausedAt = null;
      await saveState();
    }

    return false;
  }

  const alreadyPaused =
    state.daily.tradingPaused && state.daily.pauseReason === pauseReason;

  state.daily.tradingPaused = true;
  state.daily.pauseReason = pauseReason;
  state.daily.pausedAt = state.daily.pausedAt || Date.now();
  await saveState();

  if (!alreadyPaused) {
    logInfo("Entradas pausadas pelo controle diario", {
      motivo: formatDailyPauseReason(pauseReason),
      ...buildDailyLogContext(state.daily),
    });

    if (notify) {
      await sendMessage(buildTelegramDailyPauseMessage(pauseReason, state));
    }
  }

  return true;
}

async function synchronizePositionProtectionOrders(position) {
  if (!isNativeProtectionEnabled()) {
    return position.protectionOrders;
  }

  const protectionOrders = await syncProtectionOrders(position);
  position.protectionOrders.stop = protectionOrders.stop;
  position.protectionOrders.takeProfit = protectionOrders.takeProfit;
  return position.protectionOrders;
}

async function syncAndApplyExchangeProtectionOrders(position) {
  if (!isNativeProtectionEnabled()) {
    return position.protectionOrders;
  }

  await synchronizePositionProtectionOrders(position);

  const desiredStopPrice = await getNormalizedStopProtectionPrice(position);
  const stopOrderIsCurrent =
    hasActiveProtectionOrder(position.protectionOrders.stop) &&
    Number(position.protectionOrders.stop.stopPrice) === desiredStopPrice;

  if (!stopOrderIsCurrent) {
    if (hasActiveProtectionOrder(position.protectionOrders.stop)) {
      position.protectionOrders.stop = await cancelProtectionOrder(position.protectionOrders.stop);
    }

    position.protectionOrders.stop = await placeStopProtectionOrder({
      positionSide: position.side,
      stopPrice: position.stopLoss,
    });

    logInfo("Ordem STOP_MARKET nativa sincronizada", {
      ativo: tradingConfig.symbol,
      lado: formatPositionSide(position.side),
      ...buildProtectionLogContext(position.protectionOrders.stop),
    });
  }

  if (shouldUseNativeTakeProfitOrder()) {
    const desiredTakeProfitPrice = await getNormalizedTakeProfitProtectionPrice(position);
    const takeProfitOrderIsCurrent =
      hasActiveProtectionOrder(position.protectionOrders.takeProfit) &&
      Number(position.protectionOrders.takeProfit.stopPrice) === desiredTakeProfitPrice;

    if (!takeProfitOrderIsCurrent) {
      if (hasActiveProtectionOrder(position.protectionOrders.takeProfit)) {
        position.protectionOrders.takeProfit = await cancelProtectionOrder(
          position.protectionOrders.takeProfit
        );
      }

      position.protectionOrders.takeProfit = await placeTakeProfitProtectionOrder({
        positionSide: position.side,
        stopPrice: position.takeProfit,
      });

      logInfo("Ordem TAKE_PROFIT_MARKET nativa sincronizada", {
        ativo: tradingConfig.symbol,
        lado: formatPositionSide(position.side),
        ...buildProtectionLogContext(position.protectionOrders.takeProfit),
      });
    }
  } else if (hasActiveProtectionOrder(position.protectionOrders.takeProfit)) {
    position.protectionOrders.takeProfit = await cancelProtectionOrder(
      position.protectionOrders.takeProfit
    );

    logInfo("Ordem TAKE_PROFIT_MARKET nativa cancelada", {
      ativo: tradingConfig.symbol,
      lado: formatPositionSide(position.side),
      motivo: "Modo trailing apos alvo",
      ...buildProtectionLogContext(position.protectionOrders.takeProfit),
    });
  }

  return position.protectionOrders;
}

async function cancelAllTrackedProtectionOrders(position) {
  if (!isNativeProtectionEnabled()) {
    return position.protectionOrders;
  }

  if (hasActiveProtectionOrder(position.protectionOrders.stop)) {
    position.protectionOrders.stop = await cancelProtectionOrder(position.protectionOrders.stop);
  }

  if (hasActiveProtectionOrder(position.protectionOrders.takeProfit)) {
    position.protectionOrders.takeProfit = await cancelProtectionOrder(
      position.protectionOrders.takeProfit
    );
  }

  return position.protectionOrders;
}

async function settleClosedPosition({
  reason,
  exitPrice,
  closeFee = 0,
  exitSource = "BOT",
}) {
  const state = getState();
  const { side, quantity, entryPrice, openedAt, signalCandleOpenTime, entryFee } = state.position;
  const grossPnlUsdt = calculateGrossPnl(side, entryPrice, exitPrice, quantity);
  const totalFees = isPaperTrading() ? entryFee + closeFee : closeFee;
  const netPnlUsdt = grossPnlUsdt - totalFees;
  const pnlBrl = netPnlUsdt * (await getUSDTBRL());
  const normalizedReason = resolveExitReason({
    reason,
    side,
    entryPrice,
    exitPrice,
    exitSource,
  });
  state.position.exitSource = exitSource;
  state.daily.tradesClosed += 1;
  state.daily.netRealizedPnl += netPnlUsdt;
  state.activity.lastExitAt = Date.now();
  state.activity.lastExitSide = side;
  state.activity.lastExitPrice = exitPrice;
  state.activity.lastExitReason = normalizedReason;
  state.activity.lastExitPnlUsdt = netPnlUsdt;
  state.activity.lastTradeAt = state.activity.lastExitAt;

  if (!isPaperTrading()) {
    state.portfolio.tradesClosed += 1;
    state.portfolio.realizedPnl += netPnlUsdt;
    state.portfolio.feesPaid += totalFees;

    if (netPnlUsdt >= 0) {
      state.portfolio.wins += 1;
    } else {
      state.portfolio.losses += 1;
    }
  }

  if (netPnlUsdt > 0) {
    state.daily.positivePnl += netPnlUsdt;
  } else if (netPnlUsdt < 0) {
    state.daily.negativePnl += Math.abs(netPnlUsdt);
  }

  logInfo("Posicao encerrada", {
    ativo: tradingConfig.symbol,
    motivo: formatExitReason(normalizedReason),
    modo: formatTradingMode(tradingConfig.tradingMode),
    lado: formatPositionSide(side),
    origemSaida: formatExitSource(exitSource),
    precoEntrada: entryPrice,
    precoSaida: exitPrice,
    quantidade: quantity,
    resultadoBrutoUsdt: grossPnlUsdt,
    resultadoLiquidoUsdt: netPnlUsdt,
    resultadoBrl: pnlBrl,
    ...buildDailyLogContext(state.daily),
    protecoesNativas: {
      stop: buildProtectionLogContext(state.position.protectionOrders.stop),
      takeProfit: buildProtectionLogContext(state.position.protectionOrders.takeProfit),
    },
  });

  await recordTrade({
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    side,
    action: "CLOSE",
    entryPrice,
    exitPrice,
    quantity,
    stopLoss: state.position.stopLoss,
    takeProfit: state.position.takeProfit,
    pnlUsdt: netPnlUsdt,
    pnlBrl,
    fees: totalFees,
    reason: normalizedReason,
    openedAt,
    closedAt: Date.now(),
    signalCandleOpenTime,
    analysisDecision: state.analysis.lastDecision,
  });

  await sendMessage(buildTelegramExitMessage(normalizedReason, side, exitPrice, netPnlUsdt, state));
  activateContextualCooldown(side, normalizedReason);
  await enforceDailyTradingPause({ notify: true });
  await persistPositionReset(Date.now() + tradingConfig.cooldownMs);
  await publishMonitoring(exitPrice, true);
}

async function synchronizeStateWithExchange() {
  const state = getState();

  if (isPaperTrading()) {
    state.runtime.lastExchangeSyncAt = Date.now();
    await saveState();
    return;
  }

  const exchangePosition = await getOpenPosition(tradingConfig.symbol);
  state.runtime.lastExchangeSyncAt = Date.now();

  if (!exchangePosition) {
    if (state.position.isOpen) {
      await synchronizePositionProtectionOrders(state.position);
      const exchangeExitPrice = getProtectionExitPrice(
        state.position,
        state.position.protectionOrders,
        state.runtime.latestPrice,
        {
          allowEntryFallback: false,
        }
      );

      if (!Number.isFinite(exchangeExitPrice)) {
        logWarn(
          "Posicao local limpa sem registrar fechamento por falta de preco confiavel",
          {
            ativo: tradingConfig.symbol,
            lado: formatPositionSide(state.position.side),
            ...buildPositionLogContext(state.position),
          }
        );
        await persistPositionReset(0);
        await publishMonitoring(state.runtime.latestPrice, true);
        return;
      }

      await settleClosedPosition({
        reason: getExchangeExitReason(
          state.position,
          state.position.protectionOrders,
          exchangeExitPrice
        ),
        exitPrice: exchangeExitPrice,
        closeFee: 0,
        exitSource:
          state.position.protectionOrders.takeProfit.status === "FILLED"
            ? "TAKE_PROFIT_MARKET"
            : state.position.protectionOrders.stop.status === "FILLED"
              ? "STOP_MARKET"
              : "ENCERRAMENTO_MANUAL_NA_CORRETORA",
      });
      return;
    }

    await saveState();
    return;
  }

  const hasMatchingLocalPosition =
    state.position.isOpen &&
    state.position.side === exchangePosition.side &&
    Math.abs(state.position.quantity - exchangePosition.quantity) < 0.000001;

  if (hasMatchingLocalPosition) {
    await syncAndApplyExchangeProtectionOrders(state.position);
    await saveState();
    return;
  }

  const atrFallback = Math.max(exchangePosition.entryPrice * 0.003, 1);
  const atr = state.position.atr > 0 ? state.position.atr : atrFallback;
  const stops = getEntryStops(exchangePosition.side, exchangePosition.entryPrice, atr);
  const shouldReuseStops =
    state.position.isOpen && state.position.side === exchangePosition.side;

  state.position.isOpen = true;
  state.position.side = exchangePosition.side;
  state.position.entryPrice = exchangePosition.entryPrice;
  state.position.quantity = exchangePosition.quantity;
  state.position.atr = atr;
  state.position.reservedMargin =
    state.position.reservedMargin > 0 ? state.position.reservedMargin : tradingConfig.usdAmount;
  state.position.stopLoss =
    shouldReuseStops && state.position.stopLoss > 0 ? state.position.stopLoss : stops.stopLoss;
  state.position.takeProfit =
    shouldReuseStops && state.position.takeProfit > 0
      ? state.position.takeProfit
      : stops.takeProfit;
  state.position.takeProfitArmed =
    shouldReuseStops && state.position.takeProfitArmed ? state.position.takeProfitArmed : false;
  state.position.exitSource = null;
  state.position.highestPrice =
    exchangePosition.side === "LONG"
      ? Math.max(state.position.highestPrice || 0, exchangePosition.markPrice)
      : 0;
  state.position.lowestPrice =
    exchangePosition.side === "SHORT"
      ? state.position.lowestPrice > 0
        ? Math.min(state.position.lowestPrice, exchangePosition.markPrice)
        : exchangePosition.markPrice
      : 0;
  state.position.protectionOrders.stop =
    shouldReuseStops && state.position.protectionOrders?.stop
      ? state.position.protectionOrders.stop
      : {
          ...state.position.protectionOrders.stop,
          enabled: false,
          orderId: null,
          clientOrderId: null,
          status: "NONE",
          stopPrice: 0,
          avgPrice: 0,
          updatedAt: null,
          lastSyncedAt: null,
        };
  state.position.protectionOrders.takeProfit =
    shouldReuseStops && state.position.protectionOrders?.takeProfit
      ? state.position.protectionOrders.takeProfit
      : {
          ...state.position.protectionOrders.takeProfit,
          enabled: false,
          orderId: null,
          clientOrderId: null,
          status: "NONE",
          stopPrice: 0,
          avgPrice: 0,
          updatedAt: null,
          lastSyncedAt: null,
        };
  state.runtime.isProcessing = false;

  await syncAndApplyExchangeProtectionOrders(state.position);
  await saveState();
  await publishMonitoring(exchangePosition.markPrice, true);

  logInfo("Posicao em aberto recuperada pela corretora", {
    ativo: tradingConfig.symbol,
    ...buildPositionLogContext(state.position),
  });

  await maybeSendStatusNotification("Posicao sincronizada com a corretora", {
    force: true,
  });
}

async function maybePeriodicSync() {
  const state = getState();
  const syncInterval = state.position.isOpen
    ? tradingConfig.positionSyncIntervalMs
    : tradingConfig.stateSyncIntervalMs;

  if (Date.now() - state.runtime.lastExchangeSyncAt < syncInterval) {
    return;
  }

  await synchronizeStateWithExchange();
}

function updateTrailingStop(position, livePrice) {
  const previousStopLoss = position.stopLoss;
  const trailingMultiple = position.takeProfitArmed
    ? tradingConfig.postTargetTrailingAtrMultiple
    : tradingConfig.trailingAtrMultiple;

  if (position.side === "LONG") {
    if (livePrice <= position.highestPrice) {
      return { updated: false };
    }

    position.highestPrice = livePrice;
    const trailingStop = getTrailingStop("LONG", livePrice, position.atr, trailingMultiple);

    if (trailingStop > position.stopLoss) {
      position.stopLoss = trailingStop;
    }
  } else if (position.side === "SHORT") {
    if (position.lowestPrice !== 0 && livePrice >= position.lowestPrice) {
      return { updated: false };
    }

    position.lowestPrice = livePrice;
    const trailingStop = getTrailingStop("SHORT", livePrice, position.atr, trailingMultiple);

    if (position.stopLoss === 0 || trailingStop < position.stopLoss) {
      position.stopLoss = trailingStop;
    }
  }

  return {
    updated: position.stopLoss !== previousStopLoss,
    previousStopLoss,
    newStopLoss: position.stopLoss,
  };
}

async function armTrailingAfterTakeProfit(position, livePrice) {
  if (position.takeProfitArmed) {
    return false;
  }

  position.takeProfitArmed = true;
  const lockedProfitStop = getLockedProfitStop(position.side, position.entryPrice, position.atr);

  if (position.side === "LONG") {
    const tightenedStop = Math.max(
      lockedProfitStop,
      getTrailingStop(
        "LONG",
        livePrice,
        position.atr,
        tradingConfig.postTargetTrailingAtrMultiple
      )
    );
    position.stopLoss = Math.max(position.stopLoss, tightenedStop);
  } else {
    const tightenedStop = Math.min(
      lockedProfitStop,
      getTrailingStop(
        "SHORT",
        livePrice,
        position.atr,
        tradingConfig.postTargetTrailingAtrMultiple
      )
    );
    position.stopLoss =
      position.stopLoss === 0 ? tightenedStop : Math.min(position.stopLoss, tightenedStop);
  }

  logInfo("Alvo atingido, trailing reforcado", {
    ativo: tradingConfig.symbol,
    lado: formatPositionSide(position.side),
    precoAtual: livePrice,
    ...buildPositionLogContext(position),
  });

  await sendMessage(buildTelegramTrailingMessage(position.side, position, livePrice, getState()));
  return true;
}

async function getAvailableBalance() {
  if (isPaperTrading()) {
    return getState().portfolio.paperAvailableBalance;
  }

  return getUSDTBalance();
}

async function openPosition(side, livePrice, analysis) {
  const state = getState();
  const availableBalance = await getAvailableBalance();

  if (availableBalance < tradingConfig.usdAmount) {
    logWarn("Saldo insuficiente para abrir entrada", {
      saldoDisponivel: availableBalance,
      saldoNecessario: tradingConfig.usdAmount,
      modo: formatTradingMode(tradingConfig.tradingMode),
    });
    state.runtime.isProcessing = false;
    await saveState();
    await publishMonitoring(livePrice, true);
    return;
  }

  const quantity = await calculateOrderQuantity(livePrice);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    logWarn("Quantidade calculada invalida", {
      precoAtual: livePrice,
      quantidade: quantity,
    });
    state.runtime.isProcessing = false;
    await saveState();
    await publishMonitoring(livePrice, true);
    return;
  }

  const reservedMargin = tradingConfig.usdAmount;
  logInfo("Enviando ordem de entrada para Binance", {
    ativo: tradingConfig.symbol,
    lado: formatPositionSide(side),
    modo: formatTradingMode(tradingConfig.tradingMode),
    precoReferencia: livePrice,
    quantidadePlanejada: quantity,
    margemReservada: reservedMargin,
    candleDoSinal: analysis.summary.signalCandleOpenTime,
    motivosEntrada: analysis.summary.reasons,
  });

  let orderResult;

  try {
    orderResult = await executeEntryOrder({
      side,
      quantity,
      price: livePrice,
      reservedMargin,
    });
  } catch (error) {
    logError("Falha ao executar ordem de entrada na Binance", error, {
      ativo: tradingConfig.symbol,
      lado: formatPositionSide(side),
      modo: formatTradingMode(tradingConfig.tradingMode),
      precoReferencia: livePrice,
      quantidadePlanejada: quantity,
      margemReservada: reservedMargin,
      candleDoSinal: analysis.summary.signalCandleOpenTime,
    });
    throw error;
  }

  const avgPrice = Number.parseFloat(orderResult.avgPrice || "0");
  const executedQty = Number.parseFloat(orderResult.executedQty || `${quantity}`);
  const entryPrice = avgPrice > 0 ? avgPrice : livePrice;
  const atr = analysis.metrics.atr;
  const { stopLoss, takeProfit } = getEntryStops(side, entryPrice, atr);

  logInfo("Ordem de entrada confirmada pela Binance", {
    ativo: tradingConfig.symbol,
    lado: formatPositionSide(side),
    modo: formatTradingMode(tradingConfig.tradingMode),
    orderId: orderResult.orderId ?? null,
    clientOrderId: orderResult.clientOrderId ?? null,
    statusOrdem: orderResult.status ?? (orderResult.simulated ? "SIMULATED" : "n/d"),
    precoMedio: entryPrice,
    quantidadeExecutada: executedQty,
    tipoResposta: orderResult.simulated ? "paper" : "exchange",
  });

  state.position.isOpen = true;
  state.position.side = side;
  state.position.entryPrice = entryPrice;
  state.position.stopLoss = stopLoss;
  state.position.takeProfit = takeProfit;
  state.position.takeProfitArmed = false;
  state.position.exitSource = null;
  state.position.quantity = executedQty;
  state.position.atr = atr;
  state.position.highestPrice = side === "LONG" ? entryPrice : 0;
  state.position.lowestPrice = side === "SHORT" ? entryPrice : 0;
  state.position.openedAt = Date.now();
  state.position.signalCandleOpenTime = analysis.summary.signalCandleOpenTime;
  state.position.reservedMargin = reservedMargin;
  state.position.entryFee = Number.parseFloat(orderResult.paperFee || "0");
  state.position.protectionOrders.stop = {
    ...state.position.protectionOrders.stop,
    enabled: false,
    orderId: null,
    clientOrderId: null,
    status: "NONE",
    stopPrice: 0,
    avgPrice: 0,
    updatedAt: null,
    lastSyncedAt: null,
  };
  state.position.protectionOrders.takeProfit = {
    ...state.position.protectionOrders.takeProfit,
    enabled: false,
    orderId: null,
    clientOrderId: null,
    status: "NONE",
    stopPrice: 0,
    avgPrice: 0,
    updatedAt: null,
    lastSyncedAt: null,
  };
  clearContextualCooldown(state);
  state.runtime.isProcessing = false;
  state.runtime.lastTradeCandleOpenTime = analysis.summary.signalCandleOpenTime;
  state.daily.entriesOpened += 1;
  state.activity.lastEntryAt = state.position.openedAt;
  state.activity.lastEntrySide = side;
  state.activity.lastEntryPrice = entryPrice;
  state.activity.lastTradeAt = state.position.openedAt;

  await saveState();

  if (isNativeProtectionEnabled()) {
    try {
      await syncAndApplyExchangeProtectionOrders(state.position);
      await saveState();
    } catch (error) {
      logError("Falha ao sincronizar protecoes nativas apos a entrada", error, {
        ativo: tradingConfig.symbol,
        lado: formatPositionSide(side),
        ...buildPositionLogContext(state.position),
      });
    }
  }

  await recordTrade({
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    side,
    action: "OPEN",
    entryPrice,
    exitPrice: null,
    quantity: executedQty,
    stopLoss,
    takeProfit,
    pnlUsdt: null,
    pnlBrl: null,
    fees: state.position.entryFee,
    reason: "ENTRY_SIGNAL",
    openedAt: state.position.openedAt,
    closedAt: null,
    signalCandleOpenTime: analysis.summary.signalCandleOpenTime,
    analysisDecision: analysis.summary.decision,
  });

  logInfo("Posicao aberta", {
    ativo: tradingConfig.symbol,
    lado: formatPositionSide(side),
    modo: formatTradingMode(tradingConfig.tradingMode),
    analise: buildAnalysisLogContext(analysis.summary),
    ...buildPositionLogContext(state.position),
  });

  await sendMessage(buildTelegramEntryMessage(side, state.position, analysis.summary, state));
  await enforceDailyTradingPause({ notify: true });
  await publishMonitoring(livePrice, true);
}

async function closePosition(reason, livePrice) {
  const state = getState();
  const { side, quantity, entryPrice, reservedMargin } = state.position;

  if (isNativeProtectionEnabled()) {
    await cancelAllTrackedProtectionOrders(state.position);
    await saveState();
  }

  const orderResult = await executeExitOrder({
    side,
    quantity,
    price: livePrice,
    entryPrice,
    reservedMargin,
  });
  const avgPrice = Number.parseFloat(orderResult.avgPrice || "0");
  const exitPrice = avgPrice > 0 ? avgPrice : livePrice;
  const closeFee = Number.parseFloat(orderResult.paperFee || "0");
  await settleClosedPosition({
    reason,
    exitPrice,
    closeFee,
    exitSource: "MARKET_REDUCE_ONLY",
  });
}

async function manageOpenPosition(livePrice) {
  const state = getState();
  const position = state.position;
  let shouldPersist = false;
  const nativeStopIsActive = hasActiveProtectionOrder(position.protectionOrders.stop);
  const nativeTakeProfitIsActive = hasActiveProtectionOrder(position.protectionOrders.takeProfit);

  const trailingUpdate = updateTrailingStop(position, livePrice);

  if (trailingUpdate.updated) {
    shouldPersist = true;

    logInfo("Trailing stop atualizado", {
      ativo: tradingConfig.symbol,
      lado: formatPositionSide(position.side),
      precoAtual: livePrice,
      stopAnterior: trailingUpdate.previousStopLoss,
      novoStop: trailingUpdate.newStopLoss,
      alvoJaAtingido: position.takeProfitArmed,
    });
  }

  if (position.side === "LONG") {
    if (livePrice >= position.takeProfit) {
      if (tradingConfig.takeProfitMode === "fixed" && !nativeTakeProfitIsActive) {
        state.runtime.isProcessing = true;
        await saveState();
        await closePosition("TAKE PROFIT", livePrice);
        return;
      }

      if (await armTrailingAfterTakeProfit(position, livePrice)) {
        shouldPersist = true;
      }
    }

    if (livePrice <= position.stopLoss) {
      if (!nativeStopIsActive) {
        state.runtime.isProcessing = true;
        await saveState();
        await closePosition("STOP LOSS / TRAILING", livePrice);
        return;
      }
    }
  } else if (position.side === "SHORT") {
    if (livePrice <= position.takeProfit) {
      if (tradingConfig.takeProfitMode === "fixed" && !nativeTakeProfitIsActive) {
        state.runtime.isProcessing = true;
        await saveState();
        await closePosition("TAKE PROFIT", livePrice);
        return;
      }

      if (await armTrailingAfterTakeProfit(position, livePrice)) {
        shouldPersist = true;
      }
    }

    if (livePrice >= position.stopLoss) {
      if (!nativeStopIsActive) {
        state.runtime.isProcessing = true;
        await saveState();
        await closePosition("STOP LOSS / TRAILING", livePrice);
        return;
      }
    }
  }

  if (shouldPersist) {
    if (isNativeProtectionEnabled()) {
      try {
        await syncAndApplyExchangeProtectionOrders(position);
      } catch (error) {
        logError("Falha ao atualizar protecoes nativas da posicao", error, {
          ativo: tradingConfig.symbol,
          lado: formatPositionSide(position.side),
          precoAtual: livePrice,
          ...buildPositionLogContext(position),
        });
      }
    }

    await saveState();
    await publishMonitoring(livePrice, true);
  }
}

async function evaluateEntry(livePrice) {
  const state = getState();
  const now = Date.now();

  await refreshDailyState(now);

  if (state.runtime.cooldownUntil > now) {
    return;
  }

  if (await enforceDailyTradingPause({ notify: true })) {
    return;
  }

  if (now - state.runtime.lastAnalysisAt < tradingConfig.analysisIntervalMs) {
    return;
  }

  state.runtime.lastAnalysisAt = now;
  await saveState();

  const analysis = await analyzeMarket(tradingConfig.symbol);
  state.analysis.lastDecision = analysis.summary.decision;
  state.analysis.lastSummary = analysis.summary;
  state.analysis.lastAnalyzedAt = now;
  await saveState();
  await recordAnalysis(analysis.summary);

  logInfo("Analise de mercado concluida", {
    ativo: tradingConfig.symbol,
    modo: formatTradingMode(tradingConfig.tradingMode),
    ...buildAnalysisLogContext(analysis.summary),
  });

  await publishMonitoring(livePrice, true);

  if (analysis.decision === "NONE") {
    return;
  }

  if (state.runtime.lastTradeCandleOpenTime === analysis.summary.signalCandleOpenTime) {
    logInfo("Entrada ignorada porque esse candle de sinal ja foi operado", {
      ativo: tradingConfig.symbol,
      candleDoSinal: analysis.summary.signalCandleOpenTime,
      decisao: formatDecision(analysis.decision),
    });
    return;
  }

  const contextualCooldownBlockers = getContextualCooldownBlockers(
    analysis.decision,
    analysis.summary
  );

  if (contextualCooldownBlockers.length > 0) {
    logInfo("Entrada bloqueada pelo cooldown contextual", {
      ativo: tradingConfig.symbol,
      decisao: formatDecision(analysis.decision),
      bloqueiosContextuais: contextualCooldownBlockers,
      ...buildAnalysisLogContext(analysis.summary),
    });
    return;
  }

  if (
    tradingConfig.contextualCooldownEnabled &&
    state.runtime.contextualCooldown?.active &&
    state.runtime.contextualCooldown.blockedSide === analysis.decision
  ) {
    clearContextualCooldown(state);
    await saveState();
  }

  state.runtime.isProcessing = true;
  await saveState();
  await openPosition(analysis.decision, livePrice, analysis);
}

export async function initializeStrategy() {
  await loadState();
  await refreshDailyState();
  await rehydrateStateFromTradeHistory();
  await synchronizeStateWithExchange();
  await enforceDailyTradingPause({ notify: false });
  await publishMonitoring(getState().runtime.latestPrice, true);
  if (tradingConfig.telegramNotifyStartup) {
    await maybeSendStatusNotification("Bot iniciado e pronto para operar", {
      force: true,
    });
  }
}

export async function handlePrice(price) {
  if (!Number.isFinite(price)) {
    logWarn("Preco recebido e invalido", { preco: price });
    return;
  }

  if (tickLock) {
    return;
  }

  tickLock = true;

  try {
    const state = getState();
    await refreshDailyState();
    state.runtime.latestPrice = price;

    if (!state.position.isOpen && state.daily.tradingPaused) {
      await publishMonitoring(price, false);
      return;
    }

    await maybePeriodicSync();

    logInfo("Tick de preco recebido", {
      ativo: tradingConfig.symbol,
      modo: formatTradingMode(tradingConfig.tradingMode),
      preco: price,
      processando: state.runtime.isProcessing,
      ...buildPositionLogContext(state.position),
      ...buildDailyLogContext(state.daily),
      cooldownAte: state.runtime.cooldownUntil,
    });

    if (state.position.isOpen) {
      await manageOpenPosition(price);
    } else if (!state.runtime.isProcessing) {
      await evaluateEntry(price);
    }

    await publishMonitoring(price, false);
  } catch (error) {
    const state = getState();
    state.runtime.isProcessing = false;
    await saveState();
    await publishMonitoring(price, true);
    logError("Falha na execucao da estrategia", error, {
      ativo: tradingConfig.symbol,
      preco: price,
    });
  } finally {
    tickLock = false;
  }
}
