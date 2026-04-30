import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  getHealth() {
    return {
      ok: true,
      service: "@binance-futures/api",
      generatedAt: new Date().toISOString(),
      stack: {
        framework: "NestJS",
        adapter: "Fastify",
        language: "TypeScript",
      },
    };
  }
}
