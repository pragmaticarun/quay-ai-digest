import { EditorDesk } from "@/components/editor/editor-desk";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Editor" };

export default function EditorPage() {
  return (
    <>
      <SiteHeader current="/editor" />
      <main id="content">
        <EditorDesk />
      </main>
    </>
  );
}
