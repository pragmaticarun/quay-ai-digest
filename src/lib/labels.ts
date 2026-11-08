import type { EntryType, ReviewStatus } from "@/lib/types";

export const TYPE_LABEL: Record<EntryType, string> = {
  news: "News",
  model: "Model",
  paper: "Paper",
  repo: "Repo",
  tool: "Tool",
};

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  fetched: "Fetched",
  normalized: "Normalized",
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  rejected: "Rejected",
};
