export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+\-!|<>]/g, (char) => `\\${char}`);
}
