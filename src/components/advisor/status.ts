export function studentAdvisorStatusLabel(status?: string | null) {
  if (status === "PUBLISHED") return "Result published";
  if (status === "DRAFT_READY") return "Awaiting admin review";
  if (status === "ANALYSIS_FAILED") return "Awaiting admin retry";
  if (status === "ANALYZING") return "AI analysis in progress";
  return "Submitted for analysis";
}
