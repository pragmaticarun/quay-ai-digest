import { SafeLink } from "@/components/safe-link";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adapters } from "@/lib/adapters/registry";
import { getDb } from "@/lib/db";
import { listRuns } from "@/lib/entries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sources" };

export default function SourcesPage() {
  const runs = listRuns(getDb(), 12);
  return (
    <>
      <SiteHeader current="/sources" />
      <main id="content">
        <h1 className="text-2xl font-medium">Source allowlist</h1>
        <p className="mt-2 max-w-3xl">
          Quay fetches only the adapters marked enabled, and only after a local editor asks. Fetched rows are drafts until review. Permission for each enabled source stays with the operator. This page does not claim the log is complete.
        </p>
        <div className="mt-6 grid gap-4">
          {adapters.map((adapter) => {
            const last = runs.find((run) => run.adapterId === adapter.id);
            return (
              <Card key={adapter.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {adapter.title}
                    <Badge variant={adapter.enabled ? "default" : "outline"}>{adapter.enabled ? "Enabled" : "Disabled"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <p>{adapter.permissionSummary}</p>
                  {adapter.disabledReason ? <p><strong>Why it is off. </strong>{adapter.disabledReason}</p> : null}
                  <p><strong>Rate limit. </strong>{adapter.rateLimit}</p>
                  <p><strong>Daily refresh. </strong>{adapter.dailyFeasibility}</p>
                  <p><strong>Stored. </strong>{adapter.stores}</p>
                  <p><strong>Not stored. </strong>{adapter.doesNotStore}</p>
                  <p><strong>Request. </strong>{adapter.requestDescription}</p>
                  {adapter.docs.length ? (
                    <ul className="list-disc pl-5">
                      {adapter.docs.map((doc) => (
                        <li key={doc.url}>
                          <SafeLink href={doc.url}>{doc.label}</SafeLink>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p>
                    <strong>Latest local run. </strong>
                    {last ? `${last.outcome} at ${last.startedAt} UTC. ${last.message}` : "No run recorded in this database."}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
