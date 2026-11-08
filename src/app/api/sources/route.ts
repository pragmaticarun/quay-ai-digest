import { adapters } from "@/lib/adapters/registry";
import { getDb } from "@/lib/db";
import { listRuns } from "@/lib/entries";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    adapters: adapters.map((adapter) => ({
      id: adapter.id,
      title: adapter.title,
      kind: adapter.kind,
      enabled: adapter.enabled,
      disabledReason: adapter.disabledReason,
      permissionSummary: adapter.permissionSummary,
      rateLimit: adapter.rateLimit,
      dailyFeasibility: adapter.dailyFeasibility,
      stores: adapter.stores,
      doesNotStore: adapter.doesNotStore,
      docs: adapter.docs,
      requestDescription: adapter.requestDescription,
    })),
    runs: listRuns(getDb(), 12),
  });
}
