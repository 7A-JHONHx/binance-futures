let refreshIntervalMs = 5000;
let refreshTimer = null;
let clockTimer = null;

const MAX_SETUP_SCORE = 8;
const DEFAULT_VIEW = "dashboard";
const SECTION_IDS = [
  "section-hero",
  "section-insight",
  "section-signal",
  "section-performance",
  "section-tables",
];
const CARD_IDS = [
  "card-market",
  "analysis-tone-card",
  "card-indicators",
  "card-flow",
  "card-blockers",
  "card-bot-status",
  "card-pnl",
  "card-equity",
  "card-trades",
  "card-analyses",
];
const VIEW_CONFIG = {
  dashboard: {
    title: "Binance Futures Dashboard",
    copy: "Estrategia, risco, desempenho e trilha operacional em uma tela mais clara.",
    sections: SECTION_IDS,
    cards: CARD_IDS,
    banner: null,
  },
  operacoes: {
    title: "Operacoes do Bot",
    copy: "Entradas, saidas, resultado e historico operacional concentrados em uma visao executiva.",
    sections: ["section-hero", "section-performance", "section-tables"],
    cards: ["card-pnl", "card-equity", "card-trades"],
    banner: {
      eyebrow: "Mesa operacional",
      title: "Fluxo de operacoes",
      text: "Acompanhe o impacto das entradas e saidas do robo com foco em execucao e resultado.",
      tags: ["Entradas e saidas", "PnL em tempo real", "Historico recente"],
    },
  },
  mercado: {
    title: "Leitura de Mercado",
    copy: "Preco, contexto, indicadores e fluxo em uma area dedicada para a decisao do setup.",
    sections: ["section-hero", "section-insight", "section-signal"],
    cards: [
      "card-market",
      "analysis-tone-card",
      "card-indicators",
      "card-flow",
      "card-blockers",
      "card-bot-status",
    ],
    banner: {
      eyebrow: "Painel de leitura",
      title: "Contexto atual do ativo",
      text: "Veja a forca do mercado, confirmacoes tecnicas e filtros que estao liberando ou travando entradas.",
      tags: ["Preco", "Indicadores", "Fluxo e bloqueios"],
    },
  },
  estrategia: {
    title: "Estrategia e Filtros",
    copy: "Entenda porque o bot decidiu entrar, esperar ou bloquear operacoes em cada contexto.",
    sections: ["section-insight", "section-signal", "section-tables"],
    cards: [
      "card-market",
      "analysis-tone-card",
      "card-indicators",
      "card-flow",
      "card-blockers",
      "card-bot-status",
      "card-analyses",
    ],
    banner: {
      eyebrow: "Motor de decisao",
      title: "Leitura da estrategia",
      text: "Os filtros tecnicos, o contexto do candle e o estado do robo aparecem aqui de forma mais direta.",
      tags: ["Score", "Bloqueios", "Telemetria"],
    },
  },
  backtest: {
    title: "Backtest e Validacao",
    copy: "Base visual para evoluir a leitura historica do setup e comparar comportamento antes de operar ao vivo.",
    sections: ["section-performance", "section-tables"],
    cards: ["card-pnl", "card-equity", "card-analyses"],
    banner: {
      eyebrow: "Ambiente de estudo",
      title: "Leitura para calibracao",
      text: "Esta visao usa a telemetria atual como apoio visual ate o modulo dedicado de backtest ganhar telas proprias.",
      tags: ["Performance", "Analises", "Calibracao"],
    },
  },
  relatorios: {
    title: "Relatorios e Consolidado",
    copy: "Resumo da performance, historico de trades e leituras recentes para acompanhamento mais gerencial.",
    sections: ["section-hero", "section-performance", "section-tables"],
    cards: ["card-pnl", "card-equity", "card-trades", "card-analyses"],
    banner: {
      eyebrow: "Visao consolidada",
      title: "Relatorio operacional",
      text: "Uma leitura mais gerencial da operacao, com desempenho, historico e comportamento tecnico recentes.",
      tags: ["Consolidado", "Trades", "Desempenho"],
    },
  },
};
let currentView = DEFAULT_VIEW;

const $ = (id) => document.getElementById(id);
const toNum = (value) => Number(value);

function formatNumber(value, digits = 2) {
  const numeric = toNum(value);
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

function formatPrice(value) {
  return formatNumber(value, 2);
}

function formatUsdt(value, { signed = false } = {}) {
  const numeric = toNum(value);
  if (!Number.isFinite(numeric)) return "--";
  const prefix = signed && numeric > 0 ? "+" : "";
  return `${prefix}${formatNumber(numeric, 2)} USDT`;
}

function formatPercent(value, digits = 2) {
  const numeric = toNum(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${formatNumber(numeric, digits)}%`;
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

function formatTimeOnly(value) {
  if (!value) return "--";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(date);
}

function formatMode(mode) {
  return mode === "paper" ? "Simulado" : "Real";
}

function formatSource(source) {
  if (source === "arquivo") return "Arquivo local";
  if (source === "postgres") return "Postgres";
  return source || "--";
}

function formatCompactSide(side) {
  if (side === "LONG") return "LONG";
  if (side === "SHORT") return "SHORT";
  return "FLAT";
}

function formatPositionSide(side) {
  if (side === "LONG") return "Comprado (LONG)";
  if (side === "SHORT") return "Vendido (SHORT)";
  return "Sem posicao";
}

function formatDecision(decision) {
  if (decision === "LONG") return "Entrada LONG";
  if (decision === "SHORT") return "Entrada SHORT";
  return "Nenhuma entrada";
}

function formatReason(reason) {
  if (!reason) return "--";
  const normalized = `${reason}`.toUpperCase();
  if (normalized === "ENTRY_SIGNAL") return "Entrada da estrategia";
  if (normalized === "STOP LOSS / TRAILING") return "Stop / trailing";
  if (normalized === "SAIDA MANUAL NA CORRETORA") return "Saida manual";
  return reason;
}

function robotStatus(snapshot) {
  if (!snapshot) return "Sem dados";
  if (snapshot.position?.isOpen) return `Em operacao: ${formatCompactSide(snapshot.position.side)}`;
  if (snapshot.daily?.tradingPaused) return "Pausado pelo controle diario";
  if (snapshot.runtime?.contextualCooldown?.active) {
    return `Cooldown contextual ${snapshot.runtime.contextualCooldown.blockedSide}`;
  }
  if (snapshot.runtime?.cooldownUntil && snapshot.runtime.cooldownUntil > Date.now()) return "Em cooldown";
  return "Monitorando oportunidades";
}

function dbStatus(database) {
  if (!database?.enabled) return "Banco desativado";
  return database.available ? "Banco conectado" : "Banco indisponivel";
}

function toneClass(value) {
  const numeric = toNum(value);
  if (!Number.isFinite(numeric)) return "";
  if (numeric > 0) return "pnl-positive";
  if (numeric < 0) return "pnl-negative";
  return "";
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setHtml(id, value) {
  const element = $(id);
  if (element) element.innerHTML = value;
}

function setClassName(id, className) {
  const element = $(id);
  if (element) element.className = className;
}

function setValueTone(id, value, baseClass = "") {
  const element = $(id);
  if (!element) return;
  element.className = [baseClass, toneClass(value)].filter(Boolean).join(" ");
}

function setWidth(id, value) {
  const element = $(id);
  if (element) element.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
}

function setHidden(id, hidden) {
  const element = $(id);
  if (element) element.classList.toggle("is-hidden", hidden);
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTimestampField(record) {
  if (!record || typeof record !== "object") return null;
  return record.timestamp ?? record["\uFEFFtimestamp"] ?? null;
}

function pointTime(value) {
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function series(points = [], valueKey = "value") {
  return points
    .map((point) => ({ time: pointTime(point.time ?? point.timestamp), value: toNum(point[valueKey] ?? point.value) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);
}

function drawdown(points = []) {
  const data = series(points);
  if (!data.length) return { current: 0, max: 0 };
  let peak = data[0].value;
  let current = 0;
  let max = 0;
  data.forEach((point) => {
    peak = Math.max(peak, point.value);
    current = peak - point.value;
    max = Math.max(max, current);
  });
  return { current, max };
}

function scale(points, width, height, padding) {
  const values = points.map((point) => point.value);
  const times = points.map((point) => point.time);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const rangeValue = maxValue - minValue || Math.max(Math.abs(maxValue || 1) * 0.12, 1);
  const rangeTime = maxTime - minTime || 1;
  const chartMin = minValue - rangeValue * 0.12;
  const chartMax = maxValue + rangeValue * 0.12;
  return {
    x(time) {
      return padding.left + ((time - minTime) / rangeTime) * (width - padding.left - padding.right);
    },
    y(value) {
      return padding.top + ((chartMax - value) / (chartMax - chartMin || 1)) * (height - padding.top - padding.bottom);
    },
    min: chartMin,
    max: chartMax,
    padding,
  };
}

function linePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function renderSpark(id, points, tone) {
  const chart = $(id);
  if (!chart) return;
  const data = series(points);
  if (data.length < 2) {
    chart.innerHTML = "";
    return;
  }
  const map = scale(data, 100, 44, { top: 4, right: 3, bottom: 4, left: 3 });
  const mapped = data.map((point) => ({ ...point, x: map.x(point.time), y: map.y(point.value) }));
  const path = linePath(mapped);
  const area = `${path} L ${mapped.at(-1).x.toFixed(2)} 40 L ${mapped[0].x.toFixed(2)} 40 Z`;
  chart.innerHTML = `<path class="sparkline-area ${tone}" d="${area}"></path><path class="sparkline-path ${tone}" d="${path}"></path>`;
}

function renderIndicatorChart(analyses = []) {
  const chart = $("indicator-chart");
  if (!chart) return;
  const points = analyses
    .map((analysis) => ({
      time: pointTime(getTimestampField(analysis)),
      macd: toNum(analysis.macd),
      signal: toNum(analysis.macdSignal),
      histogram: toNum(analysis.macdHistogram),
    }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.macd) && Number.isFinite(point.signal) && Number.isFinite(point.histogram))
    .sort((a, b) => a.time - b.time);

  if (points.length < 2) {
    chart.innerHTML = "";
    return;
  }

  const values = points.flatMap((point) => [point.macd, point.signal, point.histogram]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minTime = Math.min(...points.map((point) => point.time));
  const maxTime = Math.max(...points.map((point) => point.time));
  const mapX = (time) => 2 + ((time - minTime) / (maxTime - minTime || 1)) * 96;
  const mapY = (value) => 4 + ((maxValue - value) / (maxValue - minValue || 1)) * 32;
  const toPath = (key) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(point.time).toFixed(2)} ${mapY(point[key]).toFixed(2)}`).join(" ");
  chart.innerHTML = `<path class="indicator-line indicator-line-macd" d="${toPath("macd")}"></path><path class="indicator-line indicator-line-signal" d="${toPath("signal")}"></path><path class="indicator-line indicator-line-histogram" d="${toPath("histogram")}"></path>`;
}

function emptyChart(id, message) {
  setHtml(
    id,
    `<foreignObject x="0" y="0" width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml" class="chart-empty">${escapeHtml(message)}</div></foreignObject>`
  );
}

function renderEquityChart(chartData) {
  const chart = $("equity-chart");
  if (!chart) return;
  const data = series(chartData?.points || []);
  if (!data.length) return emptyChart("equity-chart", "Sem dados suficientes para equity.");
  const map = scale(data, 100, 100, { top: 8, right: 5, bottom: 12, left: 7 });
  const mapped = data.map((point) => ({ ...point, x: map.x(point.time), y: map.y(point.value), phase: point.phase }));
  const path = linePath(mapped);
  const area = `${path} L ${mapped.at(-1).x.toFixed(2)} ${(100 - map.padding.bottom).toFixed(2)} L ${mapped[0].x.toFixed(2)} ${(100 - map.padding.bottom).toFixed(2)} Z`;
  const dots = mapped.map((point, index) => `<circle class="${point.phase === "open" ? "chart-equity-point chart-equity-point-open" : "chart-equity-point"}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${index === mapped.length - 1 ? 1.8 : 1.2}"></circle>`).join("");
  chart.innerHTML = `<defs><linearGradient id="equity-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(48,230,138,0.32)"></stop><stop offset="100%" stop-color="rgba(48,230,138,0.02)"></stop></linearGradient></defs><path class="chart-equity-area" d="${area}"></path><path class="chart-equity-line" d="${path}"></path>${dots}<text class="chart-axis-label" x="${map.padding.left}" y="6">${escapeHtml(formatUsdt(map.max))}</text><text class="chart-axis-label" x="${map.padding.left}" y="98">${escapeHtml(formatUsdt(map.min))}</text>`;
}

function renderPnlChart(chartData) {
  const chart = $("pnl-chart");
  if (!chart) return;
  const data = series(chartData?.points || []);
  if (!data.length) return emptyChart("pnl-chart", "Sem dados suficientes para PnL.");
  const values = data.map((point) => point.value);
  const peak = Math.max(...values.map((value) => Math.abs(value)), 1);
  const zeroY = 8 + (peak / (peak * 2)) * 80;
  const step = data.length > 1 ? 88 / (data.length - 1) : 44;
  const bars = data.map((point, index) => {
    const x = 7 + (data.length === 1 ? 44 : index * step);
    const height = Math.max((Math.abs(point.value) / (peak * 1.18)) * 40, 0.8);
    const y = point.value >= 0 ? zeroY - height : zeroY;
    const className = point.phase === "open" ? "chart-pnl-bar-open" : point.value >= 0 ? "chart-pnl-bar-positive" : "chart-pnl-bar-negative";
    return `<rect class="${className}" x="${(x - 1.4).toFixed(2)}" y="${y.toFixed(2)}" width="2.8" height="${height.toFixed(2)}" rx="0.9" ry="0.9"></rect>`;
  }).join("");
  chart.innerHTML = `<line class="chart-zero-line" x1="7" y1="${zeroY.toFixed(2)}" x2="95" y2="${zeroY.toFixed(2)}"></line>${bars}<text class="chart-axis-label" x="7" y="6">${escapeHtml(formatUsdt(peak * 1.18))}</text><text class="chart-axis-label" x="7" y="98">${escapeHtml(formatUsdt(-(peak * 1.18)))}</text>`;
}

function biasData(analysis) {
  if (!analysis) return { title: "Sem leitura", subtitle: "Aguardando dados do mercado.", tone: "bias-neutral" };
  if (analysis.decision === "LONG") return { title: "Vies comprador", subtitle: "Setup de compra alinhado pela estrategia.", tone: "bias-long" };
  if (analysis.decision === "SHORT") return { title: "Vies vendedor", subtitle: "Setup de venda alinhado pela estrategia.", tone: "bias-short" };
  if ((analysis.longScore || 0) > (analysis.shortScore || 0)) return { title: "Pressao compradora", subtitle: "Compradores na frente, aguardando validacao final.", tone: "bias-long" };
  if ((analysis.shortScore || 0) > (analysis.longScore || 0)) return { title: "Pressao vendedora", subtitle: "Vendedores na frente, aguardando validacao final.", tone: "bias-short" };
  return { title: "Mercado neutro", subtitle: "Sem predominancia clara entre compra e venda.", tone: "bias-neutral" };
}

function rsiState(value) {
  const numeric = toNum(value);
  if (!Number.isFinite(numeric)) return "--";
  if (numeric >= 70) return "Sobrecomprado";
  if (numeric <= 30) return "Sobrevendido";
  if (numeric >= 55) return "Comprador";
  if (numeric <= 45) return "Vendedor";
  return "Neutro";
}

function macdState(macd, signal) {
  if (!Number.isFinite(toNum(macd)) || !Number.isFinite(toNum(signal))) return "--";
  return toNum(macd) >= toNum(signal) ? "Comprador" : "Vendedor";
}

function histogramState(value) {
  const numeric = toNum(value);
  if (!Number.isFinite(numeric)) return "--";
  return numeric >= 0 ? "Expansao alta" : "Expansao baixa";
}

function flowState(type, value) {
  const numeric = toNum(value);
  if (!Number.isFinite(numeric)) return { label: "--", level: 0, display: "--" };
  if (type === "volume") {
    if (numeric >= 1.4) return { label: "Forte", level: 100, display: formatNumber(numeric, 2) };
    if (numeric >= 1) return { label: "Moderado", level: 74, display: formatNumber(numeric, 2) };
    if (numeric >= 0.75) return { label: "Fraco", level: 48, display: formatNumber(numeric, 2) };
    return { label: "Muito baixo", level: 28, display: formatNumber(numeric, 2) };
  }
  if (type === "book") {
    const absolute = Math.abs(numeric);
    if (absolute >= 0.45) return { label: "Forte", level: 100, display: formatNumber(numeric, 3) };
    if (absolute >= 0.2) return { label: "Moderado", level: 70, display: formatNumber(numeric, 3) };
    if (absolute >= 0.08) return { label: "Leve", level: 44, display: formatNumber(numeric, 3) };
    return { label: "Neutro", level: 20, display: formatNumber(numeric, 3) };
  }
  if (type === "atr") {
    if (numeric >= 0.0025) return { label: "Alta", level: 100, display: formatPercent(numeric * 100, 3) };
    if (numeric >= 0.0012) return { label: "Boa", level: 70, display: formatPercent(numeric * 100, 3) };
    if (numeric >= 0.0008) return { label: "Baixa", level: 42, display: formatPercent(numeric * 100, 3) };
    return { label: "Muito baixa", level: 24, display: formatPercent(numeric * 100, 3) };
  }
  if (numeric >= 0.72) return { label: "Forte", level: 100, display: formatNumber(numeric, 3) };
  if (numeric >= 0.4) return { label: "Moderado", level: 66, display: formatNumber(numeric, 3) };
  if (numeric >= 0.25) return { label: "Leve", level: 40, display: formatNumber(numeric, 3) };
  return { label: "Fraco", level: 22, display: formatNumber(numeric, 3) };
}

function cooldownLabel(runtime) {
  if (runtime?.contextualCooldown?.active) return `Contextual ${runtime.contextualCooldown.blockedSide}`;
  if (runtime?.cooldownUntil && runtime.cooldownUntil > Date.now()) return `Ate ${formatTimeOnly(runtime.cooldownUntil)}`;
  return "Liberado";
}

function renderScoreRing(analysis) {
  const ring = $("analysis-score-ring");
  if (!ring) return;
  const dominant = Math.max(toNum(analysis?.longScore) || 0, toNum(analysis?.shortScore) || 0);
  ring.style.setProperty("--score-progress", `${Math.max(0, Math.min(100, (dominant / MAX_SETUP_SCORE) * 100))}%`);
  ring.className = `score-ring ${analysis?.decision === "LONG" ? "score-ring-long" : analysis?.decision === "SHORT" ? "score-ring-short" : "score-ring-neutral"}`;
}

function renderFlow(prefix, type, value) {
  const meta = flowState(type, value);
  setText(`flow-${prefix}-value`, meta.display);
  setText(`flow-${prefix}-state`, meta.label);
  setWidth(`flow-${prefix}-fill`, meta.level);
}

function renderBlockers(blockers = []) {
  if (!Array.isArray(blockers) || blockers.length === 0) {
    return setHtml("blockers-list", `<li class="blocker-ok">Nenhum bloqueio ativo. Mercado liberado.</li>`);
  }
  setHtml("blockers-list", blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join(""));
}

function renderTrades(trades = []) {
  if (!trades.length) return setHtml("trades-body", `<tr><td colspan="7">Nenhum trade encontrado ainda.</td></tr>`);
  setHtml("trades-body", trades.map((trade) => {
    const pnlClass = toNum(trade.pnlUsdt) >= 0 ? "pnl-positive" : "pnl-negative";
    const when = trade.closedAt || trade.openedAt || trade.timestamp;
    return `<tr><td>${formatTimeOnly(when)}</td><td class="${trade.side === "LONG" ? "decision-long" : trade.side === "SHORT" ? "decision-short" : ""}">${escapeHtml(formatCompactSide(trade.side))}</td><td>${escapeHtml(trade.action === "OPEN" ? "Aberta" : trade.action === "CLOSE" ? "Fechada" : trade.action || "--")}</td><td>${formatPrice(trade.entryPrice)}</td><td>${formatPrice(trade.exitPrice)}</td><td class="${pnlClass}">${formatUsdt(trade.pnlUsdt, { signed: true })}</td><td>${escapeHtml(formatReason(trade.reason))}</td></tr>`;
  }).join(""));
}

function renderAnalyses(analyses = []) {
  if (!analyses.length) return setHtml("analyses-body", `<tr><td colspan="7">Nenhuma analise registrada ainda.</td></tr>`);
  setHtml("analyses-body", analyses.map((analysis) => {
    const decisionClass = analysis.decision === "LONG" ? "decision-long" : analysis.decision === "SHORT" ? "decision-short" : "decision-none";
    return `<tr><td>${formatTimeOnly(getTimestampField(analysis))}</td><td class="${decisionClass}">${escapeHtml(formatDecision(analysis.decision))}</td><td>${analysis.longScore ?? "--"} / ${analysis.shortScore ?? "--"}</td><td>${formatNumber(analysis.rsi, 2)}</td><td>${formatPercent(toNum(analysis.atrPercent) * 100, 3)}</td><td>${formatNumber(analysis.volumeRatio, 2)}</td><td>${formatNumber(analysis.orderBookImbalance, 3)}</td></tr>`;
  }).join(""));
}

function normalizeView(view) {
  return VIEW_CONFIG[view] ? view : DEFAULT_VIEW;
}

function getViewFromHash() {
  return normalizeView(window.location.hash.replace("#", "").trim().toLowerCase());
}

function syncGridDensity() {
  for (const sectionId of SECTION_IDS) {
    const section = $(sectionId);
    if (!section) continue;
    const visibleChildren = [...section.children].filter(
      (child) => !child.classList.contains("is-hidden")
    );
    section.classList.toggle("single-card", visibleChildren.length <= 1);
  }
}

function renderViewBanner(view) {
  const config = VIEW_CONFIG[view];
  if (!config?.banner) {
    setHidden("view-banner", true);
    return;
  }

  setHidden("view-banner", false);
  setText("view-banner-eyebrow", config.banner.eyebrow);
  setText("view-banner-title", config.banner.title);
  setText("view-banner-text", config.banner.text);
  setHtml(
    "view-banner-tags",
    config.banner.tags.map((tag) => `<span class="view-tag">${escapeHtml(tag)}</span>`).join("")
  );
}

function applyView(view) {
  const normalized = normalizeView(view);
  const config = VIEW_CONFIG[normalized];
  currentView = normalized;

  for (const sectionId of SECTION_IDS) {
    setHidden(sectionId, !config.sections.includes(sectionId));
  }

  for (const cardId of CARD_IDS) {
    setHidden(cardId, !config.cards.includes(cardId));
  }

  setText("page-title", config.title);
  setText("page-copy", config.copy);
  renderViewBanner(normalized);

  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    const isActive = button.dataset.view === normalized;
    button.classList.toggle("nav-item-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  syncGridDensity();
}

function navigateToView(view, { updateHash = true } = {}) {
  const normalized = normalizeView(view);
  applyView(normalized);
  if (updateHash && window.location.hash !== `#${normalized}`) {
    window.location.hash = normalized;
  }
}

function setupNavigation() {
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => navigateToView(button.dataset.view));
  });

  window.addEventListener("hashchange", () => {
    applyView(getViewFromHash());
  });

  applyView(getViewFromHash());
}

function tickClock() {
  setText("header-clock", new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(new Date()));
}

function ensureClock() {
  if (clockTimer) return;
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

function renderOverview(data) {
  const snapshot = data.snapshot || {};
  const metrics = data.metrics || {};
  const position = snapshot.position || {};
  const analysis = snapshot.analysis?.lastSummary || data.analyses?.[0] || null;
  const equity = data.charts?.equity || { points: [] };
  const pnl = data.charts?.pnl || { points: [] };
  const bias = biasData(analysis);
  const lossCurve = drawdown(equity.points || []);
  const pricePoints = (data.analyses || []).map((item) => ({
    time: getTimestampField(item),
    value: item.close,
  }));

  setText("source-pill", formatSource(data.source));
  setText("db-pill", dbStatus(data.database));
  setText("status-bot-text", robotStatus(snapshot));
  setText("last-updated", formatDateTime(data.generatedAt));
  setText("footer-updated", `Atualizado em ${formatDateTime(data.generatedAt)}`);
  setText("footer-mode", `Modo ${formatMode(snapshot.mode || metrics.mode)}`);
  setText("footer-symbol", `Ativo ${snapshot.symbol || "--"}`);
  setText("footer-database", dbStatus(data.database));
  setText("sidebar-bot-state", position.isOpen ? formatCompactSide(position.side) : "Monitorando");
  setText("sidebar-bot-sub", robotStatus(snapshot));
  setText("sidebar-day-pnl", formatUsdt(metrics.dailyNetRealizedPnl, { signed: true }));
  setValueTone("sidebar-day-pnl", metrics.dailyNetRealizedPnl, "sidebar-value");
  setText("sidebar-source", `Fonte ${formatSource(data.source)}`);

  setText("metric-price", formatPrice(snapshot.latestPrice));
  setText("metric-price-foot", `${snapshot.symbol || "--"} | ${formatMode(snapshot.mode || metrics.mode)}`);
  setText("metric-daily-pnl", formatUsdt(metrics.dailyNetRealizedPnl, { signed: true }));
  setValueTone("metric-daily-pnl", metrics.dailyNetRealizedPnl, "hero-value");
  setText("metric-daily-foot", `${metrics.dailyEntriesOpened ?? 0} entradas | ${metrics.dailyTradesClosed ?? 0} fechadas`);
  setText("metric-total-pnl", formatUsdt(metrics.realizedPnl, { signed: true }));
  setValueTone("metric-total-pnl", metrics.realizedPnl, "hero-value");
  setText("metric-total-foot", `${metrics.totalTrades ?? 0} trades | Win rate ${formatPercent(metrics.winRate)}`);
  setText("metric-drawdown", `-${formatUsdt(lossCurve.max)}`);
  setValueTone("metric-drawdown", -lossCurve.max, "hero-value");
  setText("metric-drawdown-foot", `Atual ${formatUsdt(-lossCurve.current, { signed: true })} | Wins ${metrics.wins ?? 0} / Losses ${metrics.losses ?? 0}`);

  setText("market-symbol", snapshot.symbol || "--");
  setText("market-mode", formatMode(snapshot.mode || metrics.mode));
  setText("market-price", formatPrice(snapshot.latestPrice));
  setText("market-status", robotStatus(snapshot));
  setText("market-entry", formatPrice(position.entryPrice));
  setText("market-stop", formatPrice(position.stopLoss));
  setText("market-target", formatPrice(position.takeProfit));
  setText("market-open-pnl", formatUsdt(equity.unrealizedPnl, { signed: true }));
  setValueTone("market-open-pnl", equity.unrealizedPnl, "");
  setText("summary-last-entry", snapshot.activity?.lastEntryAt ? `${formatDateTime(snapshot.activity.lastEntryAt)} | ${formatCompactSide(snapshot.activity.lastEntrySide)} | ${formatPrice(snapshot.activity.lastEntryPrice)}` : "Nenhuma entrada registrada");
  setText("summary-last-exit", snapshot.activity?.lastExitAt ? `${formatDateTime(snapshot.activity.lastExitAt)} | ${formatCompactSide(snapshot.activity.lastExitSide)} | ${formatUsdt(snapshot.activity.lastExitPnlUsdt, { signed: true })}` : "Nenhuma saida registrada");
  setText("summary-day-status", snapshot.daily?.tradingPaused ? "Pausado no dia" : "Liberado para novas entradas");

  setText("analysis-bias", bias.title);
  setText("analysis-decision", formatDecision(analysis?.decision));
  setText("analysis-summary", bias.subtitle);
  setText("analysis-reasons", Array.isArray(analysis?.reasons) && analysis.reasons.length ? analysis.reasons.join(" | ") : "Sem confirmacoes suficientes no momento.");
  setText("analysis-blockers", Array.isArray(analysis?.blockers) && analysis.blockers.length ? analysis.blockers.join(" | ") : "Nenhum bloqueio ativo");
  setText("analysis-badge", analysis ? formatDecision(analysis.decision) : "Aguardando");
  setText("analysis-score-total", `${Math.max(toNum(analysis?.longScore) || 0, toNum(analysis?.shortScore) || 0)}/${MAX_SETUP_SCORE}`);
  setText("analysis-long-score", `${analysis?.longScore ?? "--"} / ${MAX_SETUP_SCORE}`);
  setText("analysis-short-score", `${analysis?.shortScore ?? "--"} / ${MAX_SETUP_SCORE}`);
  setWidth("analysis-long-fill", ((toNum(analysis?.longScore) || 0) / MAX_SETUP_SCORE) * 100);
  setWidth("analysis-short-fill", ((toNum(analysis?.shortScore) || 0) / MAX_SETUP_SCORE) * 100);
  setClassName("analysis-tone-card", `panel-card analysis-card ${bias.tone}`);
  renderScoreRing(analysis);

  setText("indicator-rsi", formatNumber(analysis?.rsi, 2));
  setText("indicator-rsi-state", rsiState(analysis?.rsi));
  setText("indicator-macd", formatNumber(analysis?.macd, 4));
  setText("indicator-macd-state", macdState(analysis?.macd, analysis?.macdSignal));
  setText("indicator-signal", formatNumber(analysis?.macdSignal, 4));
  setText("indicator-signal-state", macdState(analysis?.macdSignal, analysis?.macd));
  setText("indicator-histogram", formatNumber(analysis?.macdHistogram, 4));
  setText("indicator-histogram-state", histogramState(analysis?.macdHistogram));

  renderFlow("volume", "volume", analysis?.volumeRatio);
  renderFlow("book", "book", analysis?.orderBookImbalance);
  renderFlow("atr", "atr", analysis?.atrPercent);
  renderFlow("candle", "candle", analysis?.candleBodyRatio);
  renderBlockers(analysis?.blockers);

  setText("bot-status-main", robotStatus(snapshot));
  setText("bot-status-process", snapshot.runtime?.isProcessing ? "Sim" : "Nao");
  setText("bot-status-position", formatPositionSide(position.side));
  setText("bot-status-cooldown", cooldownLabel(snapshot.runtime));
  setText("bot-status-day", snapshot.daily?.tradingPaused ? "Pausado" : `Entradas ${snapshot.daily?.entriesOpened ?? 0}`);
  setText("bot-status-db", dbStatus(data.database));

  setText("pnl-badge", position.isOpen ? "Inclui PnL em aberto" : "Baseado em trades fechados");
  setText("pnl-current", formatUsdt(pnl.current, { signed: true }));
  setText("pnl-realized", formatUsdt(pnl.realized, { signed: true }));
  setText("pnl-unrealized", formatUsdt(pnl.unrealized, { signed: true }));
  setText("pnl-points", `${pnl.points?.length ?? 0} pontos`);
  setValueTone("pnl-current", pnl.current);
  setValueTone("pnl-realized", pnl.realized);
  setValueTone("pnl-unrealized", pnl.unrealized);

  setText("equity-badge", position.isOpen ? "Com mark-to-market" : "Realizado + snapshot");
  setText("equity-current", formatUsdt(equity.current, { signed: true }));
  setText("equity-unrealized", formatUsdt(equity.unrealizedPnl, { signed: true }));
  setText("equity-realized", formatUsdt(equity.realizedPnl, { signed: true }));
  setText("equity-baseline", formatUsdt(equity.baseline));
  setValueTone("equity-current", equity.current);
  setValueTone("equity-unrealized", equity.unrealizedPnl);
  setValueTone("equity-realized", equity.realizedPnl);

  renderSpark("metric-price-spark", pricePoints, "sparkline-warning");
  renderSpark("metric-daily-spark", (pnl.points || []).map((point) => ({ time: point.time, value: point.value })), pnl.current >= 0 ? "sparkline-success" : "sparkline-danger");
  renderSpark("metric-total-spark", (equity.points || []).map((point) => ({ time: point.time, value: point.value })), equity.current >= 0 ? "sparkline-success" : "sparkline-warning");
  renderSpark("metric-drawdown-spark", (equity.points || []).map((point) => ({ time: point.time, value: point.value })), "sparkline-danger");
  renderSpark("market-price-spark", pricePoints, "sparkline-warning");

  renderIndicatorChart(data.analyses || []);
  renderEquityChart(equity);
  renderPnlChart(pnl);
  renderTrades(data.trades || []);
  renderAnalyses(data.analyses || []);
}

function ensureRefreshTimer(nextIntervalMs) {
  const numeric = Number(nextIntervalMs);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  if (refreshTimer && refreshIntervalMs === numeric) return;
  refreshIntervalMs = numeric;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadOverview, refreshIntervalMs);
}

async function loadOverview() {
  try {
    const response = await fetch("/api/overview?tradesLimit=12&analysesLimit=12", { cache: "no-store" });
    if (!response.ok) throw new Error(`Falha ao carregar overview: ${response.status}`);
    const data = await response.json();
    renderOverview(data);
    ensureRefreshTimer(data.refreshIntervalMs);
    ensureClock();
  } catch (error) {
    setText("source-pill", "Falha ao carregar");
    setText("db-pill", error.message);
    setText("status-bot-text", "Painel indisponivel");
    emptyChart("equity-chart", "Falha ao carregar equity.");
    emptyChart("pnl-chart", "Falha ao carregar PnL.");
  }
}

setupNavigation();
await loadOverview();
ensureRefreshTimer(refreshIntervalMs);
ensureClock();
