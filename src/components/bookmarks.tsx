"use client";

import { useBookmarks } from "@/components/desk-state";
import { Button } from "@/components/ui/button";

export function BookmarkButton({ id }: { id: string }) {
  const { has, toggle } = useBookmarks();
  const saved = has(id);
  return (
    <Button
      type="button"
      variant={saved ? "secondary" : "outline"}
      className="h-11"
      aria-pressed={saved}
      onClick={() => toggle(id)}
    >
      {saved ? "Saved on this browser" : "Save on this browser"}
    </Button>
  );
}

export function SavedToggle() {
  const { savedOnly, setSavedOnly, ids } = useBookmarks();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={savedOnly ? "default" : "outline"}
        className="h-11"
        aria-pressed={savedOnly}
        onClick={() => setSavedOnly(!savedOnly)}
      >
        {savedOnly ? "Showing saved only" : "Only saved on this browser"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Bookmarks stay in this browser&apos;s local storage. Quay has no account and does not copy this list to the desk. {ids.length} saved here.
      </p>
    </div>
  );
}

export function BookmarkRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { savedOnly, has } = useBookmarks();
  if (savedOnly && !has(id)) return null;
  return <li className="entry">{children}</li>;
}

export function SavedEmpty({ ids }: { ids: string[] }) {
  const { savedOnly, has } = useBookmarks();
  if (!savedOnly) return null;
  if (ids.some((id) => has(id))) return null;
  return <p>None of the records in this result are saved in this browser.</p>;
}
