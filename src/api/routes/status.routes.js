import { Router } from "express";

export function createStatusRouter({ buildOverviewFromRequest }) {
  const router = Router();

  router.get("/status", async (request, response, next) => {
    try {
      const overview = await buildOverviewFromRequest(request);

      response.json({
        source: overview.source,
        database: overview.database,
        snapshot: overview.snapshot,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
