import { Router } from "express";

export function createMetricsRouter({ buildOverviewFromRequest }) {
  const router = Router();

  router.get("/metrics", async (request, response, next) => {
    try {
      const overview = await buildOverviewFromRequest(request);

      response.json({
        source: overview.source,
        database: overview.database,
        metrics: overview.metrics,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
