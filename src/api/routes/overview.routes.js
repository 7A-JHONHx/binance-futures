import { Router } from "express";

export function createOverviewRouter({ buildOverviewFromRequest }) {
  const router = Router();

  router.get("/overview", async (request, response, next) => {
    try {
      response.json(await buildOverviewFromRequest(request));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
