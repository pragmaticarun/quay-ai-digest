import { normalizeCanonicalUrl } from "@/lib/urls";

export function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = normalizeCanonicalUrl(href);
  if (!safe) {
    return (
      <span>
        {children} <span className="text-muted-foreground">(link withheld: URL scheme not allowed)</span>
      </span>
    );
  }
  return (
    <a href={safe} rel="noopener noreferrer">
      {children}
    </a>
  );
}
