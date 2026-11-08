import Link from "next/link";
import { TimeControl } from "@/components/time-value";

const LINKS = [
  ["/", "Log"],
  ["/digest", "Digest"],
  ["/sources", "Sources"],
  ["/about", "About"],
  ["/editor", "Editor"],
];

export function SiteHeader({ current }: { current: string }) {
  return (
    <header className="mb-8">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <p className="kicker">Local editorial desk</p>
      <Link className="wordmark" href="/">
        Quay
      </Link>
      <p className="deck">
        Reviewed notes for people who ship machine-learning systems. Sources land as drafts. The public log only shows what a person at this desk publishes.
      </p>
      <div className="mt-3">
        <TimeControl />
      </div>
      <nav className="nav-row" aria-label="Primary">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
