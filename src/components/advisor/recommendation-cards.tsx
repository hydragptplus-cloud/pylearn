import Link from "next/link";
import type { AdvisorRecommendation } from "./types";

export function recommendationLabel(matchType: string) {
  if (matchType === "EXACT_MATCH") return "Exact Match";
  if (matchType === "BEST_RELATED") return "Best Related";
  if (matchType === "ADVANCED") return "Advanced";
  return matchType.replaceAll("_", " ");
}

export function AdvisorRecommendationCards({ recommendations }: { recommendations: AdvisorRecommendation[] }) {
  if (!recommendations.length) return <p className="muted text-sm">No course recommendation was published for this result.</p>;
  return <div className="grid gap-3">{recommendations.map(item => (
    <article className="rounded-lg border border-[var(--border)] p-4" key={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="badge">{recommendationLabel(item.match_type)}</span>
          <h3 className="mt-2 font-bold">{item.course_title}</h3>
          <p className="muted mt-1 text-sm leading-6">{item.reason}</p>
        </div>
        <Link className="btn btn-primary" href={`/courses/${item.course}`}>View course</Link>
      </div>
    </article>
  ))}</div>;
}
