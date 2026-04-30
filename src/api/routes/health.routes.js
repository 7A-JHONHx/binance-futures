import { Router } from "express";

export function createHealthRouter({ getHealthPayload }) {
  const router = Router();

  router.get("/health", async (_request, response) => {
    response.json(await getHealthPayload());
  });

  return router;
}
