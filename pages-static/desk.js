(function () {
  const root = document.documentElement;
  const base = root.dataset.base || "";
  const key = "quay.bookmarks.v1";

  function readIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  function writeIds(ids) {
    localStorage.setItem(key, JSON.stringify(ids));
  }

  function data() {
    const node = document.getElementById("quay-data");
    if (!node || !node.textContent) return { records: [] };
    return JSON.parse(node.textContent);
  }

  function applyBookmarkLabels() {
    const ids = readIds();
    document.querySelectorAll("[data-bookmark]").forEach((button) => {
      const saved = ids.includes(button.getAttribute("data-bookmark"));
      button.textContent = saved ? "Saved on this browser" : "Save on this browser";
      button.setAttribute("aria-pressed", saved ? "true" : "false");
    });
    const count = document.getElementById("saved-count");
    if (count) count.textContent = String(ids.length);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bookmark]");
    if (!button) return;
    const id = button.getAttribute("data-bookmark");
    const ids = readIds();
    writeIds(ids.includes(id) ? ids.filter((item) => item !== id) : ids.concat(id));
    applyBookmarkLabels();
  });

  const form = document.getElementById("filters");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const params = new URLSearchParams(new FormData(form));
      const q = (params.get("q") || "").trim().toLowerCase();
      const type = params.get("type") || "";
      const topic = (params.get("topic") || "").trim().toLowerCase();
      const from = params.get("from") || "";
      const to = params.get("to") || "";
      let shown = 0;
      document.querySelectorAll("[data-record]").forEach((row) => {
        const haystack = (row.getAttribute("data-search") || "").toLowerCase();
        const rowType = row.getAttribute("data-type") || "";
        const topics = (row.getAttribute("data-topics") || "").toLowerCase().split("|");
        const day = (row.getAttribute("data-published") || "").slice(0, 10);
        let ok = true;
        if (q && !haystack.includes(q)) ok = false;
        if (type && rowType !== type) ok = false;
        if (topic && !topics.includes(topic)) ok = false;
        if ((from || to) && !day) ok = false;
        if (from && day && day < from) ok = false;
        if (to && day && day > to) ok = false;
        row.hidden = !ok;
        if (ok) shown += 1;
      });
      const status = document.getElementById("filter-status");
      if (status) {
        const filtered = Boolean(q || type || topic || from || to);
        status.textContent = `Showing ${shown} published record${shown === 1 ? "" : "s"}${filtered ? " matching these filters" : ""}.`;
      }
    });
  }

  const digestForm = document.getElementById("digest-form");
  if (digestForm) {
    digestForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const records = data().records || [];
      const selected = new Set(Array.from(digestForm.querySelectorAll("input[name=id]:checked")).map((node) => node.value));
      const chosen = records.filter((record) => selected.has(record.id));
      const preview = document.getElementById("digest-preview");
      const generatedAt = new Date().toISOString();
      const markdown = renderMarkdown(chosen, generatedAt);
      if (preview) preview.textContent = markdown;
      const md = document.getElementById("download-md");
      const html = document.getElementById("download-html");
      if (md) md.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      if (html) html.href = URL.createObjectURL(new Blob([renderHtml(chosen, generatedAt)], { type: "text/html" }));
    });
  }

  function renderMarkdown(records, generatedAt) {
    const lines = ["# Quay digest", "", `Generated: ${generatedAt} (UTC).`, "", "Reviewed records only. Drafts are not in this snapshot.", ""];
    if (!records.length) return lines.concat("No published records were included.", "").join("\n");
    records.forEach((record) => {
      lines.push(`## ${record.title}`, "", `- Type: ${record.type}`, `- Stable ID: ${record.stableId}`, `- Canonical URL: ${record.canonicalUrl}`);
      lines.push(`- Publication date: ${record.publishedAt || "Date unknown"}`, `- Source updated: ${record.updatedAt || "Date unknown"}`, "", "### Facts", "", record.factSummary, "", "### Interpretation", "", record.interpretation || "None recorded.", "", "### Citations", "");
      (record.citations || []).forEach((citation) => lines.push(`- ${citation.label} (${citation.role}): ${citation.url}`));
      lines.push("");
    });
    return lines.join("\n");
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function renderHtml(records, generatedAt) {
    const body = records
      .map((record) => {
        const citations = (record.citations || [])
          .map((citation) => `<li>${escapeHtml(citation.label)} (${escapeHtml(citation.role)}): ${escapeHtml(citation.url)}</li>`)
          .join("");
        return `<section><h2>${escapeHtml(record.title)}</h2><p>${escapeHtml(record.factSummary)}</p><ul>${citations}</ul></section>`;
      })
      .join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quay digest</title></head><body><h1>Quay digest</h1><p>Generated: ${escapeHtml(generatedAt)} (UTC).</p>${body || "<p>No published records were included.</p>"}</body></html>`;
  }

  applyBookmarkLabels();
})();
