import type { DashboardOverviewPayload } from "@binance-futures/shared";
import { DashboardClient } from "./dashboard-client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3333/api";

export const dynamic = "force-dynamic";

async function loadInitialOverview(): Promise<DashboardOverviewPayload | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/overview`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as DashboardOverviewPayload;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const initialData = await loadInitialOverview();
  return <DashboardClient initialData={initialData} />;
}
