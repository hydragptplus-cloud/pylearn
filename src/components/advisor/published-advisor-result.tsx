import Link from "next/link";
import { AdvisorRecommendationCards } from "./recommendation-cards";
import type { AdvisorAnswer, AdvisorAttempt } from "./types";

function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          if ("name" in item) return String((item as { name: unknown }).name).trim();
          if ("skill" in item) return String((item as { skill: unknown }).skill).trim();
          if ("description" in item) return String((item as { description: unknown }).description).trim();
          return JSON.stringify(item);
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}


function QuestionHeading({ answer, index }: { answer: AdvisorAnswer; index: number }) {
  return (
    <>
      <h3 className="flex items-start gap-2 text-lg font-bold">
        <span className="text-[var(--primary)]">{index + 1}.</span>
        {answer.prompt}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="badge">{answer.topic}</span>
        {answer.field_name && <span className="badge">{answer.field_name}</span>}
        {answer.skill_name && <span className="badge">{answer.skill_name}</span>}
      </div>
    </>
  );
}

function ObjectiveAnswerResult({ answer, index }: { answer: AdvisorAnswer; index: number }) {
  return (
    <article className="panel p-6">
      <QuestionHeading answer={answer} index={index} />

      {/* Multiple Choice / True False Options */}
      <div className="mt-4 space-y-3">
        {answer.options.map((option) => {
          const isCorrect = option.toLowerCase() === answer.correct_answer?.toLowerCase();
          const isSubmitted = option.toLowerCase() === answer.submitted_answer.toLowerCase();

          const tone = isCorrect
            ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
            : isSubmitted && !answer.is_correct
              ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
              : "border-[var(--border)] opacity-70";

          return (
            <div
              key={option}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${tone}`}
            >
              <span>{option}</span>
              <span className="text-xs font-semibold">
                {isCorrect ? "Correct answer" : isSubmitted ? "Your answer" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Fallback display if options list is empty */}
      {!answer.options.length && (
        <div className="mt-4 grid gap-2 text-sm">
          <p>
            <strong>Your answer:</strong> {answer.submitted_answer || "No answer provided"}
          </p>
          <p>
            <strong>Correct answer:</strong> {answer.correct_answer}
          </p>
        </div>
      )}

      <p className="muted mt-4 text-sm">
        Awarded {answer.awarded_points} of {answer.max_points} points
      </p>
    </article>
  );
}

function WrittenAnswerResult({ answer, index }: { answer: AdvisorAnswer; index: number }) {
  return (
    <article className="panel p-6">
      <QuestionHeading answer={answer} index={index} />

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="muted text-xs font-semibold uppercase tracking-wide">Your response</p>
        <p className="mt-2 whitespace-pre-wrap">
          {answer.submitted_answer || "No response provided"}
        </p>
      </div>

      <p className="mt-3 text-sm font-semibold">
        Awarded {answer.awarded_points} of {answer.max_points} points
      </p>

      {answer.ai_feedback && (
        <div className="mt-3 rounded-lg border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] p-4">
          <strong>Reviewed feedback</strong>
          <p className="mt-2 text-sm leading-6">{answer.ai_feedback}</p>
        </div>
      )}
    </article>
  );
}



export function PublishedAdvisorResult({ attempt }: { attempt: AdvisorAttempt }) {
  const analysis = attempt.analysis;
  if (!analysis) return null;

  const isDiscovery = attempt.quiz_type === "SKILL_DISCOVERY";
  const strengths = toTextList(analysis.strengths);
  const gaps = toTextList(analysis.gaps);
  const strongestSkills = toTextList(analysis.strongest_skill_names);

  const formattedLevel = analysis.level
    ? analysis.level.toLowerCase().replace(/^./, (val) => val.toUpperCase())
    : "Diagnostic result";

  const formattedPublishedDate = attempt.published_at
    ? new Date(attempt.published_at).toLocaleString()
    : "after administrator review";

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="panel overflow-hidden border-[var(--primary)] p-0">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:p-8">
          <div className="min-w-0">
            <span className="badge">Admin reviewed</span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              {isDiscovery ? "Your Skill Discovery result" : "Your Skill Development result"}
            </h2>
            <p className="muted mt-3 max-w-3xl text-base leading-7">{analysis.summary}</p>

            {!isDiscovery && analysis.strongest_field_name && (
              <p className="mt-6 text-base">
                <strong>Selected field:</strong> {analysis.strongest_field_name}
              </p>
            )}

            {strongestSkills.length > 0 && (
              <p className="mt-3 text-base">
                <strong>{isDiscovery ? "Strongest skill:" : "Strongest skills:"}</strong>{" "}
                {strongestSkills.join(", ")}
              </p>
            )}

            <p className="muted mt-5 text-sm">Published {formattedPublishedDate}</p>
          </div>

          <div className="self-start rounded-xl bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-6 py-5 text-left md:min-w-44 md:text-right">
            <div className="text-5xl font-bold tracking-tight text-[var(--primary)]">
              {attempt.percentage ?? "-"}%
            </div>
            <div className="mt-2 text-lg font-semibold">{formattedLevel}</div>
          </div>
        </div>
      </section>

      {/* Strengths & Gaps Breakdown */}
      {isDiscovery ? (
        <section className="panel p-5">
          <h2 className="font-bold">Strengths</h2>
          {strengths.length ? (
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {strengths.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          ) : (
            <p className="muted mt-3 text-sm">
              Demonstrated solid understanding across the assessment questions.
            </p>
          )}
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="panel p-6">
            <h2 className="text-xl font-bold">Strengths</h2>
            {strengths.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {strengths.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            ) : (
              <p className="muted mt-3 text-sm">No specific strengths were listed.</p>
            )}
          </div>

          <div className="panel p-6">
            <h2 className="text-xl font-bold">Skill gaps</h2>
            {gaps.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {gaps.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            ) : (
              <p className="muted mt-3 text-sm">No priority gaps were identified.</p>
            )}
          </div>
        </section>
      )}

      {/* Recommended Courses */}
      <section className="panel p-5">
        <h2 className="mb-4 text-xl font-bold">
          {isDiscovery ? "Recommended Course" : "Recommended courses"}
        </h2>
        <AdvisorRecommendationCards recommendations={analysis.recommendations} />
      </section>

      {/* Question List Breakdown */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Question breakdown</h2>
        {attempt.answers.map((answer, index) => {
          const isObjective = ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(answer.question_type);

          return isObjective ? (
            <ObjectiveAnswerResult key={answer.question_id} answer={answer} index={index} />
          ) : (
            <WrittenAnswerResult key={answer.question_id} answer={answer} index={index} />
          );
        })}
      </section>

      {/* Back Link */}
      <div>
        <Link className="btn btn-secondary inline-flex" href="/learning-path">
          Back to AI Learning Path Advisor
        </Link>
      </div>
    </div>
  );
}
