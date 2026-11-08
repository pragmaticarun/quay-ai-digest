"use client";

import { formatUtc } from "@/lib/dates";
import type { DatePrecision } from "@/lib/types";
import { useTimeMode } from "@/components/desk-state";

export function TimeValue({
  iso,
  precision = "datetime",
  stacked = false,
}: {
  iso: string | null;
  precision?: DatePrecision;
  stacked?: boolean;
}) {
  const { mode } = useTimeMode();
  if (!iso || precision === "unknown") return <>Date unknown</>;
  if (stacked && (mode === "utc" || precision === "date")) {
    const text = formatUtc(iso, precision);
    const labeled = text.match(/^(.*?)( \([^)]+\))$/);
    const body = labeled ? labeled[1] : text;
    const note = labeled ? labeled[2].trim() : null;
    const [day, time] = body.split("T");
    return (
      <span className="block">
        <span className="block">{day}</span>
        {time ? <span className="block">{time}</span> : null}
        {note ? <span className="block">{note}</span> : null}
      </span>
    );
  }
  if (mode === "utc" || precision === "date") return <>{formatUtc(iso, precision)}</>;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "this browser";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(iso));
  return (
    <>
      {formatted} ({zone})
    </>
  );
}

export function TimeControl() {
  const { mode, setMode } = useTimeMode();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span id="time-mode-label">Displayed times</span>
      <button type="button" className="min-h-11 underline underline-offset-4" aria-pressed={mode === "utc"} onClick={() => setMode("utc")}>
        UTC
      </button>
      <button
        type="button"
        className="min-h-11 underline underline-offset-4"
        aria-pressed={mode === "browser"}
        onClick={() => setMode("browser")}
      >
        This browser
      </button>
    </div>
  );
}
