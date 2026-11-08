"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";
import type { Citation, Entry, EntryType, IngestRun, ReviewEvent } from "@/lib/types";
import { ENTRY_TYPES } from "@/lib/types";

const TOKEN_KEY = "quay.editorToken.v1";
const tokenListeners = new Set<() => void>();

function subscribeToken(listener: () => void) {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(value: string | null) {
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
  for (const listener of tokenListeners) listener();
}

type SourceCard = {
  id: string;
  title: string;
  enabled: boolean;
  disabledReason: string | null;
  rateLimit: string;
};

type EditorPayload = { entry: Entry; events: ReviewEvent[] };

async function editorFetch(token: string, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401) {
    const error = new Error("TOKEN");
    throw error;
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as Record<string, unknown>;
}

export function EditorDesk() {
  const token = useSyncExternalStore(subscribeToken, readToken, () => null);
  const [draftToken, setDraftToken] = useState("");
  const [items, setItems] = useState<Entry[]>([]);
  const [runs, setRuns] = useState<IngestRun[]>([]);
  const [sources, setSources] = useState<SourceCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EditorPayload | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = useCallback((reason: unknown) => {
    if (reason instanceof Error && reason.message === "TOKEN") {
      writeToken(null);
      setError("That token was rejected. Paste the local editor token again.");
      return;
    }
    setError(reason instanceof Error ? reason.message : "Request failed.");
  }, []);

  const loadDesk = useCallback(async (active: string) => {
    const [itemData, runData, sourceData] = await Promise.all([
      editorFetch(active, "/api/editor/items"),
      editorFetch(active, "/api/editor/runs"),
      fetch("/api/sources", { cache: "no-store" }).then((response) => response.json()),
    ]);
    return {
      items: (itemData.entries as Entry[]) ?? [],
      runs: (runData.runs as IngestRun[]) ?? [],
      sources: (sourceData.adapters as SourceCard[]) ?? [],
    };
  }, []);

  const applyDesk = useCallback((data: { items: Entry[]; runs: IngestRun[]; sources: SourceCard[] }) => {
    setItems(data.items);
    setRuns(data.runs);
    setSources(data.sources);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void loadDesk(token)
      .then((data) => {
        if (!cancelled) applyDesk(data);
      })
      .catch((reason) => {
        if (!cancelled) fail(reason);
      });
    return () => {
      cancelled = true;
    };
  }, [token, loadDesk, applyDesk, fail]);

  useEffect(() => {
    if (!token || !selectedId) return;
    let cancelled = false;
    void editorFetch(token, `/api/editor/items/${selectedId}`)
      .then((data) => {
        if (!cancelled) setDetail(data as unknown as EditorPayload);
      })
      .catch((reason) => {
        if (!cancelled) fail(reason);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedId, fail]);

  if (!token) {
    return (
      <form
        className="grid max-w-xl gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draftToken.trim();
          if (!next) return;
          writeToken(next);
          setError("");
        }}
      >
        <h1 className="text-2xl font-medium">Editor</h1>
        <p>
          Mutations stay on this machine and require the local editor token. The token is not an account. Read it from <code>data/editor-token</code> or run <code>npm run token</code>.
        </p>
        <Label htmlFor="editor-token">Editor token</Label>
        <Input
          id="editor-token"
          type="password"
          autoComplete="off"
          value={draftToken}
          onChange={(event) => setDraftToken(event.target.value)}
          className="h-11"
        />
        <Button type="submit" className="h-11 w-fit">
          Unlock this tab
        </Button>
        <noscript>
          <p>This page uses JavaScript to attach the token. You can still run npm run ingest and npm run review from the project directory.</p>
        </noscript>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    );
  }

  const visible = items.filter((item) => statusFilter === "all" || item.status === statusFilter);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-medium">Editor</h1>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => {
            writeToken(null);
            setItems([]);
            setDetail(null);
          }}
        >
          Forget token in this tab
        </Button>
      </div>
      <p>Fetched records stay drafts. Nothing on this page is public until you publish it.</p>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}

      <section aria-labelledby="ingest-heading" className="grid gap-3">
        <h2 id="ingest-heading" className="text-xl font-medium">Fetch permitted sources</h2>
        {sources.map((source) => (
          <div key={source.id} className="border-t border-border py-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{source.title}</h3>
              <Badge variant={source.enabled ? "default" : "outline"}>{source.enabled ? "Enabled" : "Disabled"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{source.enabled ? source.rateLimit : source.disabledReason}</p>
            <Button
              type="button"
              className="mt-2 h-11"
              disabled={!source.enabled || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setMessage("");
                try {
                  const data = await editorFetch(token, "/api/editor/ingest", {
                    method: "POST",
                    body: JSON.stringify({ adapterId: source.id, force: false }),
                  });
                  const run = data.run as IngestRun;
                  setMessage(run.message);
                  applyDesk(await loadDesk(token));
                } catch (reason) {
                  fail(reason);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {source.enabled ? "Fetch drafts" : "Fetch unavailable"}
            </Button>
          </div>
        ))}
      </section>

      <ManualForm
        token={token}
        busy={busy}
        onBusy={setBusy}
        onError={setError}
        onDone={async (text) => {
          setMessage(text);
          applyDesk(await loadDesk(token));
        }}
        onFail={fail}
      />

      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="text-xl font-medium">Queue</h2>
        <label className="mt-3 grid max-w-xs gap-1 text-sm" htmlFor="status-filter">
          Status
          <select
            id="status-filter"
            className="h-11 rounded-lg border border-input bg-card px-2"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses ({items.length})</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label} ({items.filter((item) => item.status === value).length})
              </option>
            ))}
          </select>
        </label>
        <ul className="mt-4 grid gap-2">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full border-t border-border py-3 text-left"
                onClick={() => setSelectedId(item.id)}
              >
                <span className="font-medium">{item.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {STATUS_LABEL[item.status]} · {TYPE_LABEL[item.type]} · {item.origin}
                  {item.origin === "fixture" ? " · fixture, excluded from the public log" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 ? <p className="mt-3">No records in this status.</p> : null}
      </section>

      {detail && detail.entry.id === selectedId ? (
        <RecordForm
          key={`${detail.entry.id}:${detail.entry.status}:${detail.entry.contentHash}:${detail.events.length}`}
          token={token}
          payload={detail}
          busy={busy}
          onBusy={setBusy}
          onFail={fail}
          onSaved={async (text) => {
            setMessage(text);
            applyDesk(await loadDesk(token));
            const data = await editorFetch(token, `/api/editor/items/${detail.entry.id}`);
            setDetail(data as unknown as EditorPayload);
          }}
        />
      ) : null}

      <section aria-labelledby="runs-heading">
        <h2 id="runs-heading" className="text-xl font-medium">Ingest log</h2>
        {runs.length === 0 ? <p className="mt-2">No ingest runs yet.</p> : null}
        <ul className="mt-2 grid gap-2 text-sm">
          {runs.map((run) => (
            <li key={run.id} className="border-t border-border py-2">
              <span className="font-medium">{run.adapterId}</span> · {run.outcome} · {run.startedAt} UTC
              <span className="mt-1 block">{run.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ManualForm({
  token,
  busy,
  onBusy,
  onDone,
  onFail,
  onError,
}: {
  token: string;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onDone: (message: string) => Promise<void>;
  onFail: (reason: unknown) => void;
  onError: (value: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EntryType>("news");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [factSummary, setFactSummary] = useState("");
  const [citationLabel, setCitationLabel] = useState("Primary source");
  const [citationUrl, setCitationUrl] = useState("");

  return (
    <details className="border-t border-border pt-4">
      <summary className="cursor-pointer text-xl font-medium">Add a record by hand</summary>
      <p className="mt-2 text-sm">
        Quay does not fetch the page. You supply the citation and the factual summary. The record is still a draft.
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          onBusy(true);
          onError("");
          try {
            await editorFetch(token, "/api/editor/items", {
              method: "POST",
              body: JSON.stringify({
                type,
                title,
                canonicalUrl,
                factSummary,
                citations: [{ label: citationLabel, url: citationUrl || canonicalUrl, role: "primary" }],
              }),
            });
            setTitle("");
            setCanonicalUrl("");
            setFactSummary("");
            await onDone("Manual draft saved. It is not public yet.");
          } catch (reason) {
            onFail(reason);
          } finally {
            onBusy(false);
          }
        }}
      >
        <Label htmlFor="manual-type">Type</Label>
        <select id="manual-type" className="h-11 rounded-lg border border-input bg-card px-2" value={type} onChange={(event) => setType(event.target.value as EntryType)}>
          {ENTRY_TYPES.map((item) => (
            <option key={item} value={item}>
              {TYPE_LABEL[item]}
            </option>
          ))}
        </select>
        <Label htmlFor="manual-title">Title</Label>
        <Input id="manual-title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-11" required />
        <Label htmlFor="manual-url">Canonical URL</Label>
        <Input id="manual-url" value={canonicalUrl} onChange={(event) => setCanonicalUrl(event.target.value)} className="h-11" required />
        <Label htmlFor="manual-fact">Factual summary</Label>
        <Textarea id="manual-fact" value={factSummary} onChange={(event) => setFactSummary(event.target.value)} required />
        <Label htmlFor="manual-cite-label">Primary citation label</Label>
        <Input id="manual-cite-label" value={citationLabel} onChange={(event) => setCitationLabel(event.target.value)} className="h-11" />
        <Label htmlFor="manual-cite-url">Primary citation URL</Label>
        <Input id="manual-cite-url" value={citationUrl} onChange={(event) => setCitationUrl(event.target.value)} placeholder="Defaults to the canonical URL" className="h-11" />
        <Button type="submit" className="h-11 w-fit" disabled={busy}>
          Save draft
        </Button>
      </form>
    </details>
  );
}

function RecordForm({
  token,
  payload,
  busy,
  onBusy,
  onFail,
  onSaved,
}: {
  token: string;
  payload: EditorPayload;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onFail: (reason: unknown) => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const entry = payload.entry;
  const [title, setTitle] = useState(entry.title);
  const [type, setType] = useState<EntryType>(entry.type);
  const [topics, setTopics] = useState(entry.topics.join(", "));
  const [factSummary, setFactSummary] = useState(entry.factSummary);
  const [interpretation, setInterpretation] = useState(entry.interpretation);
  const [engineeringRelevance, setEngineeringRelevance] = useState(entry.engineeringRelevance);
  const [caveats, setCaveats] = useState(entry.caveats);
  const [note, setNote] = useState(entry.reviewNote);
  const [publishedAt, setPublishedAt] = useState(entry.publishedAt ?? "");
  const [citations, setCitations] = useState<Citation[]>(entry.citations);
  const [confirm, setConfirm] = useState(false);

  const patch = {
    title,
    type,
    topics: topics.split(",").map((topic) => topic.trim()).filter(Boolean),
    factSummary,
    interpretation,
    engineeringRelevance,
    caveats,
    reviewNote: note,
    publishedAt: publishedAt.trim() ? publishedAt.trim() : null,
    citations,
  };

  async function save() {
    onBusy(true);
    try {
      await editorFetch(token, `/api/editor/items/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await onSaved("Draft fields saved.");
    } catch (reason) {
      onFail(reason);
    } finally {
      onBusy(false);
    }
  }

  async function act(action: string, extra?: { confirmReviewed?: boolean }) {
    onBusy(true);
    try {
      await editorFetch(token, `/api/editor/items/${entry.id}`, {
        method: "POST",
        body: JSON.stringify({ action, note, ...extra }),
      });
      await onSaved(`Record updated: ${action}.`);
    } catch (reason) {
      onFail(reason);
    } finally {
      onBusy(false);
    }
  }

  return (
    <section aria-labelledby="record-heading" className="grid gap-3 border-t border-border pt-4">
      <h2 id="record-heading" className="text-xl font-medium">Review {entry.stableId}</h2>
      <p className="text-sm">
        Status: {STATUS_LABEL[entry.status]}. Origin: {entry.origin}. Fact summary kind: {entry.factSummaryKind}.
        {entry.origin === "fixture" ? " This is a fixture and cannot be published." : ""}
      </p>
      {entry.similarity.length ? (
        <p className="text-sm">
          Title similarity flagged against {entry.similarity.map((flag) => `${flag.otherId} (${flag.score})`).join(", ")}. Records were not merged.
        </p>
      ) : null}
      {entry.sourceDrift && entry.pendingSource ? (
        <p className="text-sm">
          Pending source title: {entry.pendingSource.title}. Applying it updates source fields and leaves the factual summary text as saved.
        </p>
      ) : null}
      <Label htmlFor="edit-title">Title</Label>
      <Input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-11" />
      <Label htmlFor="edit-type">Type</Label>
      <select id="edit-type" className="h-11 rounded-lg border border-input bg-card px-2" value={type} onChange={(event) => setType(event.target.value as EntryType)}>
        {ENTRY_TYPES.map((item) => (
          <option key={item} value={item}>
            {TYPE_LABEL[item]}
          </option>
        ))}
      </select>
      <Label htmlFor="edit-topics">Topics</Label>
      <Input id="edit-topics" value={topics} onChange={(event) => setTopics(event.target.value)} className="h-11" />
      <Label htmlFor="edit-date">Publication timestamp</Label>
      <Input id="edit-date" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} placeholder="Leave blank if unknown" className="h-11" />
      {entry.publishedRaw && entry.datePrecision === "unknown" ? <p className="text-sm">Unparsed source date text: {entry.publishedRaw}</p> : null}
      <Label htmlFor="edit-fact">Factual summary</Label>
      <Textarea id="edit-fact" value={factSummary} onChange={(event) => setFactSummary(event.target.value)} />
      <Label htmlFor="edit-interpretation">Interpretation</Label>
      <Textarea id="edit-interpretation" value={interpretation} onChange={(event) => setInterpretation(event.target.value)} />
      <Label htmlFor="edit-relevance">Engineering relevance</Label>
      <Textarea id="edit-relevance" value={engineeringRelevance} onChange={(event) => setEngineeringRelevance(event.target.value)} />
      <Label htmlFor="edit-caveats">Caveats</Label>
      <Textarea id="edit-caveats" value={caveats} onChange={(event) => setCaveats(event.target.value)} />
      <fieldset className="grid gap-2">
        <legend className="font-medium">Citations</legend>
        {citations.map((citation, index) => (
          <div key={`${citation.url}-${index}`} className="grid gap-2 md:grid-cols-3">
            <Input aria-label={`Citation ${index + 1} label`} value={citation.label} className="h-11" onChange={(event) => setCitations(citations.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
            <Input aria-label={`Citation ${index + 1} URL`} value={citation.url} className="h-11" onChange={(event) => setCitations(citations.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} />
            <select aria-label={`Citation ${index + 1} role`} className="h-11 rounded-lg border border-input bg-card px-2" value={citation.role} onChange={(event) => setCitations(citations.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value as Citation["role"] } : item))}>
              <option value="primary">primary</option>
              <option value="context">context</option>
            </select>
          </div>
        ))}
      </fieldset>
      <Label htmlFor="edit-note">Review note</Label>
      <Textarea id="edit-note" value={note} onChange={(event) => setNote(event.target.value)} />
      <div className="flex items-start gap-3">
        <Checkbox id="confirm-review" checked={confirm} onCheckedChange={(value) => setConfirm(value === true)} />
        <Label htmlFor="confirm-review">I checked the primary citation, the dates, and the split between facts and interpretation.</Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" disabled={busy} onClick={() => void save()}>
          Save fields
        </Button>
        <Button type="button" variant="secondary" className="h-11" disabled={busy} onClick={() => void act("start_review")}>
          Mark in review
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={busy || !confirm}
          onClick={async () => {
            onBusy(true);
            try {
              await editorFetch(token, `/api/editor/items/${entry.id}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
              });
              await editorFetch(token, `/api/editor/items/${entry.id}`, {
                method: "POST",
                body: JSON.stringify({ action: "publish", note, confirmReviewed: true }),
              });
              await onSaved("Record published.");
            } catch (reason) {
              onFail(reason);
            } finally {
              onBusy(false);
            }
          }}
        >
          Publish
        </Button>
        <Button type="button" variant="destructive" className="h-11" disabled={busy} onClick={() => void act("reject")}>
          Reject
        </Button>
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void act("return_to_draft")}>
          Return to draft
        </Button>
        {entry.pendingSource ? (
          <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void act("apply_pending_source")}>
            Apply pending source
          </Button>
        ) : null}
      </div>
      {entry.sourceExcerpt ? (
        <details>
          <summary>Untrusted source text</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{entry.sourceExcerpt}</p>
        </details>
      ) : null}
      <h3 className="font-medium">History</h3>
      <ol className="grid gap-1 text-sm">
        {payload.events.map((event) => (
          <li key={event.id}>
            {event.at} UTC · {event.action} · {event.note}
          </li>
        ))}
      </ol>
    </section>
  );
}
