"use client";

import { useEffect, useState } from "react";
import type {
  DashboardOverviewAnalysis,
  DashboardOverviewPayload,
  DashboardOverviewTrade,
} from "@binance-futures/shared";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3333/api";

type DashboardState = {
  data: DashboardOverviewPayload | null;
  error: string | null;
  loading: boolean;
};

type DashboardClientProps = {
  initialData?: DashboardOverviewPayload | null;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: unknown, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

function formatUsdt(value: unknown, signed = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const prefix = signed && numeric > 0 ? "+" : "";
  return `${prefix}${formatNumber(numeric, 2)} USDT`;
}

function formatPrice(value: unknown) {
  return formatNumber(value, 2);
}

function formatDateTime(value: unknown) {
  if (value === null || value === undefined || value === "") return "--";
  const date = new Date(typeof value === "number" ? value : String(value));
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatTimeOnly(value: unknown) {
  if (value === null || value === undefined || value === "") return "--";
  const date = new Date(typeof value === "number" ? value : String(value));
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(date);
}

function formatDecision(decision: string | undefined) {
  if (decision === "LONG") return "Entrada compradora";
  if (decision === "SHORT") return "Entrada vendedora";
  return "Nenhuma entrada";
}

function formatSide(side: string | undefined) {
  if (side === "LONG") return "LONG";
  if (side === "SHORT") return "SHORT";
  return "FLAT";
}

function getStatus(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return "Sem snapshot";
  const position = snapshot.position as Record<string, unknown> | undefined;
  const runtime = snapshot.runtime as Record<string, unknown> | undefined;
  const daily = snapshot.daily as Record<string, unknown> | undefined;

  if (position?.isOpen) return `Em posicao ${formatSide(String(position.side || "NONE"))}`;
  if (Boolean(daily?.tradingPaused)) return "Pausado no dia";
  if (runtime?.contextualCooldown && typeof runtime.contextualCooldown === "object") {
    const contextual = runtime.contextualCooldown as Record<string, unknown>;
    if (contextual.active) {
      return `Cooldown ${String(contextual.blockedSide || "")}`.trim();
    }
  }

  return "Monitorando oportunidades";
}

function getTone(value: number) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function latestAnalysis(data: DashboardOverviewPayload | null): DashboardOverviewAnalysis | null {
  return data?.analyses?.[0] || null;
}

function latestTrade(data: DashboardOverviewPayload | null): DashboardOverviewTrade | null {
  return data?.trades?.[0] || null;
}

async function loadOverview(): Promise<DashboardOverviewPayload> {
  const response = await fetch(`${API_BASE_URL}/dashboard/overview`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar overview (${response.status})`);
  }

  return response.json();
}

export function DashboardClient({ initialData = null }: DashboardClientProps) {
  const [state, setState] = useState<DashboardState>({
    data: initialData,
    error: null,
    loading: !initialData,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const data = await loadOverview();
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      } catch (error) {
        if (cancelled) return;
        setState({
          data: initialData,
          error: error instanceof Error ? error.message : "Erro desconhecido",
          loading: false,
        });
      }
    };

    run();
    const timer = window.setInterval(run, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [initialData]);

  const snapshot = (state.data?.snapshot as Record<string, unknown> | null) ?? null;
  const metrics = (state.data?.metrics as Record<string, unknown> | null) ?? null;
  const position = (snapshot?.position as Record<string, unknown> | undefined) ?? null;
  const analysis = latestAnalysis(state.data);
  const trade = latestTrade(state.data);
  const latestPrice = toNumber(snapshot?.latestPrice);
  const dailyPnl = toNumber(metrics?.dailyNetRealizedPnl);
  const totalPnl = toNumber(metrics?.realizedPnl);
  const winRate = toNumber(metrics?.winRate);
  const entriesOpened = toNumber(metrics?.dailyEntriesOpened);
  const tradesClosed = toNumber(metrics?.dailyTradesClosed);
  const botStatus = getStatus(snapshot);
  const latestDecision = formatDecision(analysis?.decision);
  const latestRsi = toNumber(analysis?.rsi, Number.NaN);
  const latestMacd = toNumber(analysis?.macd, Number.NaN);
  const latestHistogram = toNumber(analysis?.macdHistogram, Number.NaN);

  return (
    <main className="platform-shell">
      <aside className="platform-sidebar">
        <div className="brand-lockup">
          <div className="brand-glyph" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">Nova plataforma</p>
            <h1>Bot Binance</h1>
            <p className="muted-copy">
              Next.js, NestJS, Fastify e Prisma em uma base pronta para escalar.
            </p>
          </div>
        </div>

        <nav className="sidebar-nav-v2">
          {["Dashboard", "Operacoes", "Mercado", "Estrategia", "Backtest", "Relatorios"].map(
            (item, index) => (
              <div className={`nav-chip ${index === 0 ? "nav-chip-active" : ""}`} key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
              </div>
            )
          )}
        </nav>

        <div className="sidebar-status-card">
          <span className="eyebrow">Status do robo</span>
          <strong>{botStatus}</strong>
          <small>Fonte: {state.data?.source || "--"}</small>
        </div>
      </aside>

      <section className="platform-main">
        <header className="platform-header">
          <div>
            <p className="eyebrow">Etapa 3 da migracao</p>
            <h2>Painel novo em Next.js</h2>
            <p className="muted-copy">
              Esta versao ja consome a nova API NestJS e usa os dados reais do bot para a
              leitura operacional.
            </p>
          </div>

          <div className="header-pills">
            <div className="status-pill">
              <span className="dot dot-live" />
              <div>
                <strong>Web</strong>
                <small>Next.js ativo</small>
              </div>
            </div>
            <div className="status-pill">
              <span className="dot dot-api" />
              <div>
                <strong>API</strong>
                <small>NestJS + Fastify</small>
              </div>
            </div>
            <div className="status-pill">
              <span className="dot dot-db" />
              <div>
                <strong>Atualizado</strong>
                <small>{formatDateTime(state.data?.generatedAt)}</small>
              </div>
            </div>
          </div>
        </header>

        {state.error ? (
          <section className="error-card">
            <strong>Falha ao carregar a nova plataforma</strong>
            <p>{state.error}</p>
          </section>
        ) : null}

        <section className="metric-grid">
          <article className="metric-card metric-card-spotlight">
            <span className="eyebrow">Preco atual</span>
            <strong>{formatPrice(latestPrice)}</strong>
            <small>
              {String(snapshot?.symbol || "BTCUSDT")} | {String(snapshot?.mode || "live")}
            </small>
          </article>

          <article className={`metric-card metric-card-compact tone-${getTone(dailyPnl)}`}>
            <span className="eyebrow">Resultado do dia</span>
            <strong>{formatUsdt(dailyPnl, true)}</strong>
            <small>
              {entriesOpened} entradas | {tradesClosed} fechadas
            </small>
          </article>

          <article className={`metric-card metric-card-compact tone-${getTone(totalPnl)}`}>
            <span className="eyebrow">Resultado acumulado</span>
            <strong>{formatUsdt(totalPnl, true)}</strong>
            <small>{formatNumber(winRate, 2)}% de acerto</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel-card-v2">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Mercado principal</p>
                <h3>{String(snapshot?.symbol || "BTCUSDT")}</h3>
              </div>
              <span className="mode-pill">{String(snapshot?.mode || "live").toUpperCase()}</span>
            </div>

            <div className="market-main-value">{formatPrice(latestPrice)}</div>

            <div className="market-grid">
              <div>
                <span>Posicao</span>
                <strong>{String(position?.side || "NONE")}</strong>
              </div>
              <div>
                <span>Entrada</span>
                <strong>{formatPrice(position?.entryPrice)}</strong>
              </div>
              <div>
                <span>Stop</span>
                <strong>{formatPrice(position?.stopLoss)}</strong>
              </div>
              <div>
                <span>Alvo</span>
                <strong>{formatPrice(position?.takeProfit)}</strong>
              </div>
            </div>
          </article>

          <article className="panel-card-v2 tone-analysis">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Leitura do mercado</p>
                <h3>{latestDecision}</h3>
              </div>
            </div>

            <div className="analysis-highlight">
              {analysis?.shortScore && analysis.shortScore > (analysis.longScore || 0)
                ? "Pressao vendedora"
                : analysis?.longScore && analysis.longScore > (analysis.shortScore || 0)
                  ? "Pressao compradora"
                  : "Mercado neutro"}
            </div>

            <div className="market-grid">
              <div>
                <span>Score LONG</span>
                <strong>{analysis?.longScore ?? "--"}</strong>
              </div>
              <div>
                <span>Score SHORT</span>
                <strong>{analysis?.shortScore ?? "--"}</strong>
              </div>
              <div>
                <span>Volume</span>
                <strong>{formatNumber(analysis?.volumeRatio, 2)}</strong>
              </div>
              <div>
                <span>ATR%</span>
                <strong>{formatNumber(toNumber(analysis?.atrPercent) * 100, 3)}%</strong>
              </div>
            </div>
          </article>

          <article className="panel-card-v2">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Indicadores</p>
                <h3>Radar tecnico</h3>
              </div>
            </div>

            <div className="indicator-list">
              <div className="indicator-row-v2">
                <span>RSI</span>
                <strong>{Number.isFinite(latestRsi) ? formatNumber(latestRsi, 2) : "--"}</strong>
              </div>
              <div className="indicator-row-v2">
                <span>MACD</span>
                <strong>{Number.isFinite(latestMacd) ? formatNumber(latestMacd, 4) : "--"}</strong>
              </div>
              <div className="indicator-row-v2">
                <span>Histograma</span>
                <strong>
                  {Number.isFinite(latestHistogram) ? formatNumber(latestHistogram, 4) : "--"}
                </strong>
              </div>
            </div>
          </article>
        </section>

        <section className="table-grid-v2">
          <article className="panel-card-v2">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Ultimas operacoes</p>
                <h3>Trades recentes</h3>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Horario</th>
                    <th>Lado</th>
                    <th>Acao</th>
                    <th>Entrada</th>
                    <th>Saida</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {state.loading ? (
                    <tr>
                      <td colSpan={6}>Carregando...</td>
                    </tr>
                  ) : state.data?.trades?.length ? (
                    state.data.trades.map((item, index) => (
                      <tr key={`${item.timestamp}-${index}`}>
                        <td>{formatTimeOnly(item.closedAt || item.openedAt || item.timestamp)}</td>
                        <td>{formatSide(item.side)}</td>
                        <td>{item.action}</td>
                        <td>{formatPrice(item.entryPrice)}</td>
                        <td>{formatPrice(item.exitPrice)}</td>
                        <td
                          className={
                            getTone(toNumber(item.pnlUsdt)) === "negative"
                              ? "negative-text"
                              : "positive-text"
                          }
                        >
                          {formatUsdt(item.pnlUsdt, true)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>Sem trades registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel-card-v2">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Ultima leitura</p>
                <h3>Resumo tecnico</h3>
              </div>
            </div>

            <div className="snapshot-stack">
              <div className="snapshot-item">
                <span>Ultima operacao</span>
                <strong>
                  {trade ? `${formatSide(trade.side)} | ${formatUsdt(trade.pnlUsdt, true)}` : "--"}
                </strong>
              </div>
              <div className="snapshot-item">
                <span>Motivo</span>
                <strong>{trade?.reason || "--"}</strong>
              </div>
              <div className="snapshot-item">
                <span>Ultima analise</span>
                <strong>{formatTimeOnly(analysis?.timestamp)}</strong>
              </div>
              <div className="snapshot-item">
                <span>Fonte</span>
                <strong>{state.data?.source || "--"}</strong>
              </div>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
