"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Course, Quiz, QuizAttemptResult } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { ErrorMessage, Loading, LoadingModal, Modal, PageHeader } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";
import { PublishedAdvisorResult } from "@/components/advisor/published-advisor-result";
import { studentAdvisorStatusLabel } from "@/components/advisor/status";
import type { AdvisorAttempt } from "@/components/advisor/types";

export function QuizDetailPage() {
  const { notify } = useFeedbackDialog();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { data: quiz, loading, error, reload } = useApiData<Quiz>(`/quizzes/${id}/`);
  const advisorAttempts = useApiData<AdvisorAttempt[] | { results: AdvisorAttempt[] }>(`/advisor/attempts/?quiz=${id}`);

  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [recommendedCourses, setRecommendedCourses] = useState<Course[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [answerModalOpen, setAnswerModalOpen] = useState(false);
  const [revealingAnswers, setRevealingAnswers] = useState(false);
  const [adminAnswers, setAdminAnswers] = useState<Record<string, string>>({});

  const [publishing, setPublishing] = useState(false);

  async function publishResults() {
    try {
      setPublishing(true);
      await api(`/quizzes/${id}/publish_results/`, { method: "POST", body: "{}" });
      void notify("Results published successfully", { tone: "success" });
      await reload();
    } catch {
      void notify("Failed to publish results", { tone: "error" });
    } finally {
      setPublishing(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget));

    try {
      setSubmitting(true);
      const response = await api<QuizAttemptResult>(`/quizzes/${id}/attempt/`, {
        method: "POST",
        body: jsonBody({ answers: raw }),
      });

      setResult(response);
      setRecommendedCourses(response.recommended_courses || []);
      await reload();
      await advisorAttempts.reload();
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Submission failed", { tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function revealAnswers(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget));

    try {
      setRevealingAnswers(true);
      const response = await api<{ questions: { id: number; correct_answer: string }[] }>(`/quizzes/${id}/reveal_answers/`, {
        method: "POST",
        body: jsonBody({ password: raw.password }),
      });
      setAdminAnswers(Object.fromEntries(response.questions.map(question => [String(question.id), question.correct_answer])));
      setAnswerModalOpen(false);
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Unable to reveal answers", { tone: "error" });
    } finally {
      setRevealingAnswers(false);
    }
  }

  if (loading) return <Loading variant="detail" />;
  if (error || !quiz) return <ErrorMessage message={error || "Quiz not found"} />;

  const visibleResult = result || (
    quiz.user_attempted && quiz.latest_attempt_percentage != null
      ? { percentage: quiz.latest_attempt_percentage, passed: Boolean(quiz.user_passed), recommended_courses: quiz.recommended_courses }
      : null
  );
  const isAdvisor = quiz.is_initial_assessment || quiz.quiz_type === "SKILL_DISCOVERY" || quiz.quiz_type === "SKILL_DEVELOPMENT";
  const fromLearningPath = searchParams?.get("from") === "learning-path" || (user?.role === "STUDENT" && isAdvisor);
  const advisorAttempt = unwrap(advisorAttempts.data || [])[0];
  const advisorStatus = advisorAttempt?.analysis_status || result?.analysis_status || quiz.latest_attempt_analysis_status;
  const canSubmitAttempt = !visibleResult && !quiz.user_attempted;
  const suggestedCourses = recommendedCourses.length ? recommendedCourses : (quiz.recommended_courses || []);
  const totalPoints = quiz.questions.reduce((total, question) => total + Math.max(1, question.points || 0), 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <LoadingModal open={submitting} title="Submitting attempt" message={quiz.quiz_type === "COURSE" ? "Scoring your answers." : "Saving your answers and generating your AI result."} />
      <LoadingModal open={revealingAnswers} title="Checking password" message="Unlocking correct answers." />

      {fromLearningPath ? (
        <div className="flex items-center gap-2">
          <Link
            href="/learning-path"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to AI Learning Path
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link
            href="/quizzes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Quizzes
          </Link>
        </div>
      )}

      <PageHeader title={quiz.title} description={quiz.description} />

      <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-sm">
        <span><strong>{quiz.questions.length}</strong> questions</span>
        <span><strong>{totalPoints}</strong> total points</span>
        <span>Pass mark: <strong>{quiz.passing_score}%</strong></span>
        {isAdvisor && <span className="muted">Your answers will shape your learning recommendation.</span>}
      </div>

      {user?.role !== "STUDENT" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="badge">Admin Review Mode</span>
              <span className="badge">{quiz.results_published ? "Results Published" : "Results Unpublished"}</span>
              <span className="muted text-sm">{quiz.questions.length} Questions · {totalPoints} points</span>
            </div>
            <div className="flex items-center gap-2">
              {!quiz.results_published && quiz.quiz_type === "COURSE" && (
                <button className="btn btn-primary" onClick={() => void publishResults()} disabled={publishing}>
                  {publishing ? "Publishing..." : "Publish results"}
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setAnswerModalOpen(true)}>
                Reveal answers
              </button>
            </div>
          </div>

          {quiz.questions.map((q, index) => (
            <div key={q.id || index} className="panel p-5">
              <strong className="text-lg flex items-start gap-2">
                <span className="text-[var(--primary)]">{index + 1}.</span> {q.prompt}
              </strong>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <span className="bg-[var(--background)] px-2 py-1 rounded border border-[var(--border)] muted">
                  Topic: <span className="font-semibold text-[var(--foreground)]">{q.topic}</span>
                </span>
                <span className="bg-[var(--background)] px-2 py-1 rounded border border-[var(--border)] muted">
                  Type: <span className="font-semibold text-[var(--foreground)]">{q.question_type}</span>
                </span>
              </div>

              <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <strong>Correct Answer:</strong> {adminAnswers[String(q.id)] || "Hidden until admin password is confirmed."}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <div className="space-y-6">
          {isAdvisor && advisorAttempt?.analysis_status === "PUBLISHED" && advisorAttempt.analysis ? (
            <PublishedAdvisorResult attempt={advisorAttempt} />
          ) : visibleResult && isAdvisor && (
            <div className="panel border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] p-5 text-center">
              <strong>{studentAdvisorStatusLabel(advisorStatus)}</strong>
              <p className="muted mt-2 text-sm">{advisorStatus === "DRAFT_READY" ? "The analysis is awaiting publication." : advisorStatus === "ANALYSIS_FAILED" ? "Your answers are saved. An administrator can retry the AI analysis." : "Your AI result is being prepared and will publish automatically when complete."}</p>
              <Link className="btn btn-primary mt-4" href="/learning-path">View Learning Path Advisor</Link>
            </div>
          )}

          {visibleResult && !isAdvisor && (
            <div
              className={`panel p-4 font-semibold text-center ${visibleResult.passed
                  ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                  : "border-[var(--danger)] bg-red-50 text-[var(--danger)] dark:bg-red-950/30"
                }`}
            >
              {quiz.results_published ? (
                <>Scored {visibleResult.percentage}% - {visibleResult.passed ? "Passed" : "Failed"}. Results are published.</>
              ) : (
                <>Status: {visibleResult.passed ? "Passed" : "Failed"}. Full score breakdown and correct answers will be available once published by the instructor.</>
              )}
              {quiz.is_initial_assessment && visibleResult.passed && (
                <div className="mt-2 text-sm font-semibold">Skill discovery completed.</div>
              )}
            </div>
          )}

          {!isAdvisor && quiz.is_initial_assessment && visibleResult?.passed && (
            <section className="panel p-5">
              <h2 className="font-bold text-lg">Suggested course</h2>
              {suggestedCourses.length ? (
                <div className="mt-4 grid gap-3">
                  {suggestedCourses.map(course => (
                    <article key={course.id} className="rounded-lg border border-[var(--border)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="badge">{course.course_code}</span>
                          <h3 className="mt-2 font-bold">{course.title}</h3>
                          <p className="muted mt-1 text-sm">{course.category_detail.name} · {course.level}</p>
                          {course.recommendation_reason && (
                            <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">
                              {course.recommendation_reason}
                            </p>
                          )}
                        </div>
                        <Link className="btn btn-primary" href={`/courses/${course.id}`}>
                          View course
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted mt-3">No course suggestion matched this attempt yet.</p>
              )}
            </section>
          )}

          {!(isAdvisor && advisorAttempt?.analysis_status === "PUBLISHED") && <form onSubmit={canSubmitAttempt ? submit : undefined} className="space-y-6">
            {quiz.questions.map((q, index) => {
              const qResult = (result?.detailed_results || quiz.detailed_results)?.[String(q.id)];
              const showResult = !canSubmitAttempt && qResult && !quiz.is_initial_assessment && Boolean(quiz.results_published);
              const isReadOnly = !canSubmitAttempt;

              return (
                <fieldset className="panel p-6" key={q.id}>
                  <legend className="font-bold text-lg mb-4 flex items-start gap-2 float-left w-full">
                    <span className="text-[var(--primary)]">{index + 1}.</span> {q.prompt}
                  </legend>

                  <div className="clear-both space-y-3 mt-2">
                    {q.options?.length ? (
                      q.options.map((option) => {
                        let labelClass = "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors";
                        let isChecked = false;

                        if (showResult && qResult) {
                          const isCorrectOption = option.toLowerCase() === qResult.correct_answer.toLowerCase();
                          const isSubmittedOption = option.toLowerCase() === qResult.submitted_answer.toLowerCase();
                          isChecked = isSubmittedOption;

                          if (isCorrectOption) {
                            labelClass = "flex items-center gap-3 p-3 rounded-lg border border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-200 transition-colors";
                          } else if (isSubmittedOption && !qResult.is_correct) {
                            labelClass = "flex items-center gap-3 p-3 rounded-lg border border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 transition-colors";
                          } else {
                            labelClass = "flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] opacity-60";
                          }
                        } else {
                          if (isReadOnly && qResult) {
                            isChecked = option.toLowerCase() === qResult.submitted_answer?.toLowerCase();
                          }
                          labelClass += " border-[var(--border)] hover:bg-[var(--background)]";
                          if (isReadOnly) labelClass += " opacity-70 pointer-events-none cursor-default";
                        }

                        return (
                          <label key={option} className={labelClass}>
                            <input
                              type="radio"
                              name={String(q.id)}
                              value={option}
                              required={!isReadOnly}
                              disabled={isReadOnly}
                              defaultChecked={isChecked}
                              className="w-4 h-4 accent-[var(--primary)]"
                            />
                            <span className="flex-1 font-medium text-[var(--foreground)]">{option}</span>
                            {showResult && qResult && option.toLowerCase() === qResult.correct_answer.toLowerCase() && (
                              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            )}
                            {showResult && qResult && option.toLowerCase() === qResult.submitted_answer.toLowerCase() && !qResult.is_correct && (
                              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            )}
                          </label>
                        );
                      })
                    ) : (
                      <>
                        <textarea
                          className="field mt-3 min-h-[44px] resize-y overflow-auto"
                          name={String(q.id)}
                          placeholder={isReadOnly ? qResult?.submitted_answer || "No answer provided" : "Type your answer here..."}
                          required={!isReadOnly}
                          disabled={isReadOnly}
                          defaultValue={isReadOnly ? qResult?.submitted_answer : undefined}
                          rows={1}
                          onInput={(event) => {
                            const answer = event.currentTarget;
                            if (answer.scrollHeight > answer.clientHeight) {
                              answer.style.height = `${answer.scrollHeight}px`;
                            }
                          }}
                        />
                        {showResult && qResult && (
                          <div className={`mt-2 p-3 rounded-lg border text-sm ${qResult.is_correct ? "bg-green-50 border-green-500 text-green-800 dark:bg-green-900/20 dark:text-green-200" : "bg-red-50 border-red-500 text-red-800 dark:bg-red-900/20 dark:text-red-200"}`}>
                            <strong>Correct Answer:</strong> {qResult.correct_answer}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </fieldset>
              );
            })}

            {canSubmitAttempt && (
              <div className="pt-2">
                <button className="btn btn-primary w-full md:w-auto px-8 text-lg" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Attempt"}
                </button>
              </div>
            )}
          </form>}
        </div>
      )}

      <Modal open={answerModalOpen} title="Reveal Correct Answers" onCloseAction={() => setAnswerModalOpen(false)}>
        <form onSubmit={revealAnswers} className="space-y-4 p-2">
          <input
            className="field"
            name="password"
            type="password"
            placeholder="Admin password"
            autoComplete="current-password"
            required
          />
          <button className="btn btn-primary w-full" disabled={revealingAnswers}>
            {revealingAnswers ? "Checking..." : "Reveal answers"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
