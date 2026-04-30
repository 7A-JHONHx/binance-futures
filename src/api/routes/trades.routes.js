import { Router } from "express";

export function createTradesRouter({ buildOverviewFromRequest }) {
  const router = Router();

  router.get("/trades", async (request, response, next) => {
    try {
      const overview = await buildOverviewFromRequest(request);

      response.json({
        source: overview.source,
        database: overview.database,
        trades: overview.trades,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
