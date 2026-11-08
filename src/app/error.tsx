"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="content">
      <h1 className="text-3xl font-medium">This page did not render.</h1>
      <p className="mt-3">{error.message || "Unexpected error."}</p>
      <button type="button" className="mt-4 underline" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
