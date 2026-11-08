"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";

const BOOKMARK_KEY = "quay.bookmarks.v1";
const TIME_KEY = "quay.timeMode.v1";

const bookmarkListeners = new Set<() => void>();
const timeListeners = new Set<() => void>();

function emit(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

function subscribe(listeners: Set<() => void>) {
  return (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
}

function readBookmarkSnapshot(): string {
  try {
    return localStorage.getItem(BOOKMARK_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function readTimeSnapshot(): "utc" | "browser" {
  try {
    return localStorage.getItem(TIME_KEY) === "browser" ? "browser" : "utc";
  } catch {
    return "utc";
  }
}

function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

type BookmarkContextValue = {
  ids: string[];
  savedOnly: boolean;
  setSavedOnly: (value: boolean) => void;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
};

const BookmarkContext = createContext<BookmarkContextValue | null>(null);
const TimeContext = createContext<{ mode: "utc" | "browser"; setMode: (mode: "utc" | "browser") => void } | null>(null);

export function DeskState({ children }: { children: React.ReactNode }) {
  const bookmarkRaw = useSyncExternalStore(subscribe(bookmarkListeners), readBookmarkSnapshot, () => "[]");
  const mode = useSyncExternalStore(subscribe(timeListeners), readTimeSnapshot, () => "utc" as const);
  const [savedOnly, setSavedOnly] = useState(false);
  const ids = useMemo(() => parseIds(bookmarkRaw), [bookmarkRaw]);

  const bookmarks = useMemo<BookmarkContextValue>(
    () => ({
      ids,
      savedOnly,
      setSavedOnly,
      has: (id) => ids.includes(id),
      toggle: (id) => {
        const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
        localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
        emit(bookmarkListeners);
      },
    }),
    [ids, savedOnly],
  );

  const setMode = (next: "utc" | "browser") => {
    localStorage.setItem(TIME_KEY, next);
    emit(timeListeners);
  };

  return (
    <TimeContext.Provider value={{ mode, setMode }}>
      <BookmarkContext.Provider value={bookmarks}>{children}</BookmarkContext.Provider>
    </TimeContext.Provider>
  );
}

export function useBookmarks() {
  const value = useContext(BookmarkContext);
  if (!value) throw new Error("Bookmarks are only available inside the desk.");
  return value;
}

export function useTimeMode() {
  const value = useContext(TimeContext);
  if (!value) throw new Error("Time mode is only available inside the desk.");
  return value;
}
