import { inspect } from "util";
import { tradingConfig } from "../config/trading.config.js";

const logFormat =
  (process.env.LOG_FORMAT || "pretty").toLowerCase() === "json" ? "json" : "pretty";

function toNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function formatDecimal(value, fractionDigits = 2) {
  const numericValue = toNumber(value);

  if (numericValue === null) {
    return "n/d";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numericValue);
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

function formatBoolean(value) {
  return value ? "sim" : "nao";
}

function formatClock(timestamp = Date.now()) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tradingConfig.dailyResetTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function formatDateTime(timestamp) {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return "n/d";
  }

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tradingConfig.dailyResetTimeZone,
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function normalizeMode(mode) {
  if (!mode) {
    return "n/d";
  }

  return `${mode}`.toLowerCase() === "real" || `${mode}`.toLowerCase() === "live"
    ? "Real"
    : `${mode}`.toLowerCase() === "simulado" || `${mode}`.toLowerCase() === "paper"
      ? "Simulado"
      : mode;
}

function buildHeader(title, timestamp) {
  return `[${formatClock(timestamp)}] ${title}`;
}

function buildSection(title, lines, timestamp) {
  return [
    buildHeader(title, timestamp),
    ...lines.filter(Boolean),
    "-".repeat(68),
  ].join("\n");
}

function stringifyContext(context) {
  return inspect(context, {
    depth: 5,
    colors: false,
    compact: true,
    breakLength: 120,
  });
}

function getPositionStatus(context) {
  if (context.posicao) {
    return context.posicao;
  }

  if (context.lado) {
    return context.lado;
  }

  return "Sem posicao";
}

function isPositionOpen(context) {
  const status = getPositionStatus(context);
  return status !== "Sem posicao";
}

function getPositionExtremeLabel(context) {
  const status = getPositionStatus(context);

  if (status.includes("SHORT") || status.includes("Vendido")) {
    return {
      label: "Fundo",
      value: context.menorPreco,
    };
  }

  return {
    label: "Topo",
    value: context.maiorPreco,
  };
}

function getCooldownLabel(context) {
  if (!Number.isFinite(context.cooldownAte) || context.cooldownAte <= Date.now()) {
    return "liberado";
  }

  return formatDateTime(context.cooldownAte);
}

function getAnalysisBias(context) {
  if (context.decisao === "Compra (LONG)" || context.pontuacaoLong > context.pontuacaoShort) {
    return "vies comprador";
  }

  if (context.decisao === "Venda (SHORT)" || context.pontuacaoShort > context.pontuacaoLong) {
    return "vies vendedor";
  }

  return "mercado neutro";
}

function getAnalysisCandidate(context) {
  if (context.pontuacaoLong > context.pontuacaoShort) {
    return "LONG";
  }

  if (context.pontuacaoShort > context.pontuacaoLong) {
    return "SHORT";
  }

  return "NONE";
}

function getAnalysisBlockers(context) {
  if (Array.isArray(context.bloqueiosAnalise) && context.bloqueiosAnalise.length > 0) {
    return context.bloqueiosAnalise;
  }

  const blockers = [];
  const candidate = getAnalysisCandidate(context);

  if (candidate === "NONE") {
    blockers.push("sem predominancia clara entre compra e venda");
  }

  if (context.atrPercentual < tradingConfig.minAtrPercent) {
    blockers.push("volatilidade abaixo do minimo");
  } else if (context.atrPercentual > tradingConfig.maxAtrPercent) {
    blockers.push("volatilidade acima do limite");
  }

  if (context.relacaoVolume < tradingConfig.minVolumeRatio) {
    blockers.push("volume abaixo do minimo");
  }

  if (context.proporcaoCorpoCandle < tradingConfig.minCandleBodyRatio) {
    blockers.push("candle de confirmacao fraco");
  }

  if (candidate === "LONG") {
    if (
      !(
        context.fechamento > context.emaTendencia &&
        context.emaRapida > context.emaLenta &&
        context.emaLenta > context.smaTendencia
      )
    ) {
      blockers.push("tendencia principal ainda nao alinhada para compra");
    }

    if (!(context.rsi >= tradingConfig.longRsiMin && context.rsi <= tradingConfig.longRsiMax)) {
      blockers.push("RSI fora da faixa de compra");
    }

    if (!(context.macd > context.sinalMacd && context.histogramaMacd > 0)) {
      blockers.push("MACD ainda nao confirmou compra");
    }

    if (context.desequilibrioBook < tradingConfig.minOrderBookImbalance) {
      blockers.push("book sem pressao compradora suficiente");
    }

    if (context.pontuacaoLong < tradingConfig.minLongScore) {
      blockers.push("score de compra abaixo do minimo");
    }
  }

  if (candidate === "SHORT") {
    if (
      !(
        context.fechamento < context.emaTendencia &&
        context.emaRapida < context.emaLenta &&
        context.emaLenta < context.smaTendencia
      )
    ) {
      blockers.push("tendencia principal ainda nao alinhada para venda");
    }

    if (!(context.rsi >= tradingConfig.shortRsiMin && context.rsi <= tradingConfig.shortRsiMax)) {
      blockers.push("RSI fora da faixa de venda");
    }

    if (!(context.macd < context.sinalMacd && context.histogramaMacd < 0)) {
      blockers.push("MACD ainda nao confirmou venda");
    }

    if (context.desequilibrioBook > -tradingConfig.minOrderBookImbalance) {
      blockers.push("book sem pressao vendedora suficiente");
    }

    if (context.pontuacaoShort < tradingConfig.minShortScore) {
      blockers.push("score de venda abaixo do minimo");
    }
  }

  if (
    candidate !== "NONE" &&
    Math.abs((context.pontuacaoLong || 0) - (context.pontuacaoShort || 0)) <
      tradingConfig.minScoreGap
  ) {
    blockers.push("vantagem entre os lados ainda pequena");
  }

  return [...new Set(blockers)];
}

function formatTickLog(timestamp, context) {
  const baseLine = `${buildHeader(context.ativo || "MERCADO", timestamp)} | ${normalizeMode(
    context.modo
  )} | Preco ${formatPrice(context.preco)} | Processando ${formatBoolean(
    context.processando
  )} | Status ${getPositionStatus(context)}`;

  if (!isPositionOpen(context)) {
    return [
      baseLine,
      `Dia: entradas ${context.entradasAbertasNoDia || 0} | fechadas ${
        context.tradesFechadosNoDia || 0
      } | PnL ${formatUsdt(context.pnlLiquidoDoDia || 0)} | Cooldown ${getCooldownLabel(context)}`,
    ].join("\n");
  }

  const extreme = getPositionExtremeLabel(context);

  return buildSection("STATUS DA POSICAO", [
    `Ativo: ${context.ativo || "n/d"} | Modo: ${normalizeMode(context.modo)} | Processando: ${formatBoolean(
      context.processando
    )}`,
    `Preco atual: ${formatPrice(context.preco)} | Status: ${getPositionStatus(context)}`,
    `Entrada: ${formatPrice(context.precoEntrada)} | Quantidade: ${formatDecimal(
      context.quantidade,
      3
    )}`,
    `${extreme.label}: ${formatPrice(extreme.value)} | TP: ${formatPrice(
      context.takeProfit
    )} | SL: ${formatPrice(context.stopLoss)}`,
    `Trailing apos alvo: ${formatBoolean(context.alvoJaAtingido)} | Cooldown: ${getCooldownLabel(
      context
    )}`,
    `Dia: entradas ${context.entradasAbertasNoDia || 0} | fechadas ${
      context.tradesFechadosNoDia || 0
    } | PnL ${formatUsdt(context.pnlLiquidoDoDia || 0)}`,
  ], timestamp);
}

function formatAnalysisLog(timestamp, context) {
  const blockers =
    Array.isArray(context.blockers) && context.blockers.length > 0
      ? context.blockers
      : getAnalysisBlockers(context);

  return buildSection("ANALISE DE MERCADO", [
    `Ativo: ${context.ativo || "n/d"} | Modo: ${normalizeMode(context.modo)}`,
    `Leitura: ${getAnalysisBias(context)} | Decisao: ${context.decisao || "n/d"}`,
    `Score: LONG ${context.pontuacaoLong ?? 0}/${tradingConfig.minLongScore} | SHORT ${
      context.pontuacaoShort ?? 0
    }/${tradingConfig.minShortScore}`,
    `Indicadores: RSI ${formatDecimal(context.rsi, 2)} | MACD ${formatDecimal(
      context.macd,
      4
    )} | Sinal ${formatDecimal(context.sinalMacd, 4)} | Hist ${formatDecimal(
      context.histogramaMacd,
      4
    )}`,
    `Fluxo: Volume ${formatDecimal(context.relacaoVolume, 2)} | Book ${formatDecimal(
      context.desequilibrioBook,
      3
    )} | ATR% ${formatDecimal(context.atrPercentual, 6)} | Candle ${formatDecimal(
      context.proporcaoCorpoCandle,
      3
    )}`,
    blockers.length > 0 ? `Bloqueios: ${blockers.join("; ")}` : "Bloqueios: nenhum",
  ], timestamp);
}

function formatEntryLog(timestamp, context) {
  const protectionStop = context.protecoesNativas?.stop;
  const protectionTakeProfit = context.protecoesNativas?.takeProfit;

  return buildSection("NOVA OPERACAO", [
    `Ativo: ${context.ativo || "n/d"} | Modo: ${normalizeMode(context.modo)} | Posicao: ${
      context.lado || context.posicao || "n/d"
    }`,
    `Entrada: ${formatPrice(context.precoEntrada)} | Quantidade: ${formatDecimal(
      context.quantidade,
      3
    )} | Margem: ${formatUsdt(context.margemReservada)}`,
    `Stop inicial: ${formatPrice(context.stopLoss)} | Alvo inicial: ${formatPrice(
      context.takeProfit
    )} | ATR: ${formatDecimal(context.atr, 2)}`,
    protectionStop
      ? `Protecao STOP Binance: ${protectionStop.status || "n/d"} | Gatilho ${formatPrice(
          protectionStop.stopPrice
        )}`
      : null,
    protectionTakeProfit
      ? `Protecao TAKE Binance: ${
          protectionTakeProfit.status || "n/d"
        } | Gatilho ${formatPrice(protectionTakeProfit.stopPrice)}`
      : null,
  ], timestamp);
}

function formatExitLog(timestamp, context) {
  return buildSection("OPERACAO ENCERRADA", [
    `Ativo: ${context.ativo || "n/d"} | Modo: ${normalizeMode(context.modo)} | Posicao: ${
      context.lado || "n/d"
    }`,
    `Motivo: ${context.motivo || "n/d"} | Origem: ${context.origemSaida || "n/d"}`,
    `Entrada: ${formatPrice(context.precoEntrada)} | Saida: ${formatPrice(
      context.precoSaida
    )} | Quantidade: ${formatDecimal(context.quantidade, 3)}`,
    `Resultado bruto: ${formatUsdt(context.resultadoBrutoUsdt)} | Resultado liquido: ${formatUsdt(
      context.resultadoLiquidoUsdt
    )} | ${formatBrl(context.resultadoBrl)}`,
    `Dia: entradas ${context.entradasAbertasNoDia || 0} | fechadas ${
      context.tradesFechadosNoDia || 0
    } | PnL ${formatUsdt(context.pnlLiquidoDoDia || 0)}`,
  ], timestamp);
}

function formatTrailingLog(timestamp, context) {
  return buildSection("TRAILING ATUALIZADO", [
    `Ativo: ${context.ativo || "n/d"} | Posicao: ${context.lado || "n/d"}`,
    `Preco atual: ${formatPrice(context.precoAtual)} | Stop anterior: ${formatPrice(
      context.stopAnterior
    )} | Novo stop: ${formatPrice(context.novoStop)}`,
    `Alvo ja atingido: ${formatBoolean(context.alvoJaAtingido)}`,
  ], timestamp);
}

function formatTargetReachedLog(timestamp, context) {
  return buildSection("ALVO ATINGIDO, TRAILING ARMADO", [
    `Ativo: ${context.ativo || "n/d"} | Posicao: ${context.lado || "n/d"}`,
    `Preco atual: ${formatPrice(context.precoAtual)} | Novo stop: ${formatPrice(
      context.stopLoss
    )} | Alvo inicial: ${formatPrice(context.takeProfit)}`,
  ], timestamp);
}

function formatBotStartLog(timestamp, context) {
  return buildSection("BOT INICIADO", [
    `Ativo: ${context.ativo || "n/d"} | Modo: ${normalizeMode(context.modo)}`,
    `Capital por operacao: ${formatUsdt(context.valorOperacaoUsdt)} | Candle: ${
      context.intervaloCandles || "n/d"
    }`,
  ], timestamp);
}

function formatWebSocketConnectedLog(timestamp, context) {
  return buildSection("WEBSOCKET CONECTADO", [
    `Ativo: ${context.ativo || "n/d"}`,
    `Canal: ${context.url || "n/d"}`,
  ], timestamp);
}

function formatWebSocketDisconnectedLog(timestamp, context) {
  return buildSection("WEBSOCKET DESCONECTADO", [
    `Reconexao agendada para ${formatDecimal((context.atrasoMs || 0) / 1000, 0)}s`,
  ], timestamp);
}

function formatDailyPauseLog(timestamp, context) {
  return buildSection("CONTROLE DIARIO", [
    `Motivo: ${context.motivo || "n/d"}`,
    `Dia: ${context.diaOperacional || "n/d"} | Entradas ${context.entradasAbertasNoDia || 0} | Fechadas ${
      context.tradesFechadosNoDia || 0
    } | PnL ${formatUsdt(context.pnlLiquidoDoDia || 0)}`,
  ], timestamp);
}

function formatHistoryRehydratedLog(timestamp, context) {
  return buildSection("ESTADO REIDRATADO PELO HISTORICO", [
    `Ativo: ${context.ativo || "n/d"} | Modo: ${normalizeMode(context.modo)}`,
    `Ultima entrada: ${formatDateTime(context.ultimaEntradaEm)} | Ultima saida: ${formatDateTime(
      context.ultimaSaidaEm
    )}`,
    `Dia: ${context.diaOperacional || "n/d"} | Entradas ${context.entradasAbertasNoDia || 0} | Fechadas ${
      context.tradesFechadosNoDia || 0
    } | PnL ${formatUsdt(context.pnlLiquidoDoDia || 0)}`,
  ], timestamp);
}

function formatProtectionSyncLog(title, timestamp, context) {
  return buildSection(title, [
    `Ativo: ${context.ativo || "n/d"} | Lado: ${context.lado || "n/d"}`,
    `Status: ${context.ativa ? "ativa" : "inativa"} | Gatilho: ${formatPrice(
      context.stopPrice
    )} | Ordem: ${context.orderId || "n/d"}`,
  ], timestamp);
}

function formatGenericPretty(level, message, timestamp, context) {
  const header = `${buildHeader(message.toUpperCase(), timestamp)}${level === "warn" ? " [AVISO]" : ""}${
    level === "error" ? " [ERRO]" : ""
  }`;
  const lines = Object.keys(context).length > 0 ? [stringifyContext(context)] : [];
  return [header, ...lines].join("\n");
}

function formatPretty(level, message, context, timestamp) {
  switch (message) {
    case "Bot iniciado":
      return formatBotStartLog(timestamp, context);
    case "WebSocket conectado":
      return formatWebSocketConnectedLog(timestamp, context);
    case "WebSocket desconectado, reconexao agendada":
      return formatWebSocketDisconnectedLog(timestamp, context);
    case "Tick de preco recebido":
      return formatTickLog(timestamp, context);
    case "Analise de mercado concluida":
      return formatAnalysisLog(timestamp, context);
    case "Posicao aberta":
      return formatEntryLog(timestamp, context);
    case "Posicao encerrada":
      return formatExitLog(timestamp, context);
    case "Trailing stop atualizado":
      return formatTrailingLog(timestamp, context);
    case "Alvo atingido, trailing reforcado":
      return formatTargetReachedLog(timestamp, context);
    case "Entradas pausadas pelo controle diario":
      return formatDailyPauseLog(timestamp, context);
    case "Resumo do historico reidratado no estado":
      return formatHistoryRehydratedLog(timestamp, context);
    case "Ordem STOP_MARKET nativa sincronizada":
      return formatProtectionSyncLog("STOP NATIVO SINCRONIZADO", timestamp, context);
    case "Ordem TAKE_PROFIT_MARKET nativa sincronizada":
      return formatProtectionSyncLog("TAKE PROFIT NATIVO SINCRONIZADO", timestamp, context);
    case "Ordem TAKE_PROFIT_MARKET nativa cancelada":
      return formatProtectionSyncLog("TAKE PROFIT NATIVO CANCELADO", timestamp, context);
    default:
      return formatGenericPretty(level, message, timestamp, context);
  }
}

function write(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...context,
  };

  if (logFormat === "json") {
    const payload = JSON.stringify(entry);

    if (level === "error") {
      console.error(payload);
      return;
    }

    console.log(payload);
    return;
  }

  const payload = formatPretty(level, message, context, timestamp);

  if (level === "error") {
    console.error(payload);
    return;
  }

  console.log(payload);
}

export function logInfo(message, context = {}) {
  write("info", message, context);
}

export function logWarn(message, context = {}) {
  write("warn", message, context);
}

export function logError(message, error, context = {}) {
  write("error", message, {
    ...context,
    error: error?.message || "Erro desconhecido",
    details: error?.response?.data || null,
  });
}
