import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <SiteHeader current="/about" />
      <main id="content" className="max-w-3xl">
        <h1 className="text-2xl font-medium">About this desk</h1>
        <p className="mt-3">
          Quay is a local workbench for AI and machine-learning engineering notes. It keeps a public log of records a person has reviewed, and a private queue of everything else.
        </p>
        <h2 className="mt-8 text-xl font-medium">What a record contains</h2>
        <p className="mt-2">
          Each published record has a type (news, model, paper, repo, or tool), topics, a canonical URL, a stable id, and separate sections for facts, interpretation, engineering relevance, and caveats. Dates are stored in UTC. If a source did not provide a parseable date, the desk says the date is unknown.
        </p>
        <h2 className="mt-8 text-xl font-medium">What it does not do</h2>
        <ul className="mt-2 list-disc pl-5">
          <li>It does not send email or post anywhere.</li>
          <li>It does not count readers, rank stories, or invent popularity.</li>
          <li>It does not auto-publish a summary.</li>
          <li>It does not ask you to create an account or paste a paid API key.</li>
        </ul>
        <h2 className="mt-8 text-xl font-medium">Bookmarks</h2>
        <p className="mt-2">
          Saving a record writes its id into this browser only. Clearing site data clears the list. The desk has no server-side copy.
        </p>
        <h2 className="mt-8 text-xl font-medium">Review</h2>
        <p className="mt-2">
          Ingestion stops at draft. Publishing requires an editorial factual summary, a primary http(s) citation, a review note, and an explicit confirmation. Pending and rejected records never appear in the log or in a digest.
        </p>
        <p className="mt-6">
          <Link href="/sources">Read the source allowlist and the permission notes.</Link>
        </p>
      </main>
    </>
  );
}
