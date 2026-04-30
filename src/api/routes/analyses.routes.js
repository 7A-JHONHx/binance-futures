import { Router } from "express";

export function createAnalysesRouter({ buildOverviewFromRequest }) {
  const router = Router();

  router.get("/analyses", async (request, response, next) => {
    try {
      const overview = await buildOverviewFromRequest(request);

      response.json({
        source: overview.source,
        database: overview.database,
        analyses: overview.analyses,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
