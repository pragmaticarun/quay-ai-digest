import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader current="" />
      <main id="content">
        <h1 className="text-3xl font-medium">That page is not on the desk.</h1>
        <p className="mt-3">
          <Link href="/">Return to the public log.</Link>
        </p>
      </main>
    </>
  );
}
