import express from "express";
import path from "path";
import { tradingConfig } from "../config/trading.config.js";
import { getDatabaseHealth } from "../repositories/postgres/index.js";
import { getControlCenterOverview } from "../services/control-center.service.js";
import { logError } from "../utils/logger.js";
import { createAnalysesRouter } from "./routes/analyses.routes.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { createMetricsRouter } from "./routes/metrics.routes.js";
import { createOverviewRouter } from "./routes/overview.routes.js";
import { createStatusRouter } from "./routes/status.routes.js";
import { createTradesRouter } from "./routes/trades.routes.js";

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function applyNoStoreHeaders(response) {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("Surrogate-Control", "no-store");
}

export function createApp({ publicDirectory }) {
  const app = express();

  async function buildOverviewFromRequest(request) {
    return getControlCenterOverview({
      symbol: request.query.symbol || tradingConfig.symbol,
      mode: request.query.mode || tradingConfig.tradingMode,
      tradesLimit: parsePositiveInteger(request.query.tradesLimit, 20),
      analysesLimit: parsePositiveInteger(request.query.analysesLimit, 30),
    });
  }

  app.use(express.json());
  app.use("/api", (_request, response, next) => {
    applyNoStoreHeaders(response);
    next();
  });
  app.use(
    express.static(publicDirectory, {
      index: false,
      etag: false,
      lastModified: false,
      setHeaders(response) {
        applyNoStoreHeaders(response);
      },
    })
  );

  app.use(
    "/api",
    createHealthRouter({
      getHealthPayload: async () => ({
        ok: true,
        service: "binance-futures-control-center",
        generatedAt: new Date().toISOString(),
        database: getDatabaseHealth(),
      }),
    })
  );
  app.use("/api", createOverviewRouter({ buildOverviewFromRequest }));
  app.use("/api", createStatusRouter({ buildOverviewFromRequest }));
  app.use("/api", createMetricsRouter({ buildOverviewFromRequest }));
  app.use("/api", createTradesRouter({ buildOverviewFromRequest }));
  app.use("/api", createAnalysesRouter({ buildOverviewFromRequest }));

  app.get(/.*/, (_request, response) => {
    applyNoStoreHeaders(response);
    response.sendFile(path.join(publicDirectory, "index.html"));
  });

  app.use((error, _request, response, _next) => {
    logError("Falha ao responder na API do painel", error);
    response.status(500).json({
      ok: false,
      error: error?.message || "Erro interno na API do painel",
    });
  });

  return app;
}
