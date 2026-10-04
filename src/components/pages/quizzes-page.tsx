"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Course, QuestionTypeOption, Quiz } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { Empty, ErrorMessage, Loading, LoadingModal, Modal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";

type QuestionDraft = {
  question_type: string;
  prompt: string;
  topic: string;
  options: string[];
  correct_answer: string;
  correct_answers: string[];
  allow_multiple_correct_answers: boolean;
  points: number;
  learning_field: number | null;
  advisor_skill: number | null;
  grading_rubric: string;
};
type AdvisorField = { id: number; name: string; skills: { id: number; name: string }[] };

function blankQuestion(): QuestionDraft {
  return {
    question_type: "MULTIPLE_CHOICE",
    prompt: "",
    topic: "General",
    options: ["", ""],
    correct_answer: "",
    correct_answers: [],
    allow_multiple_correct_answers: false,
    points: 1,
    learning_field: null,
    advisor_skill: null,
    grading_rubric: "",
  };
}

export function QuizzesPage() {
  const { confirm: confirmDialog, notify } = useFeedbackDialog();
  const { user } = useAuth();
  const list = useApiData<Quiz[] | { results: Quiz[] }>("/quizzes/");
  const questionTypes = useApiData<QuestionTypeOption[]>("/question-types/");
  const courses = useApiData<Course[] | { results: Course[] }>(
    user?.role !== "STUDENT" ? "/courses/" : null
  );
  const advisorFields = useApiData<AdvisorField[] | { results: AdvisorField[] }>(user?.role === "ADMIN" ? "/advisor/fields/" : null);
  const questionTypeOptions = questionTypes.data ? unwrap(questionTypes.data) : [];

  const [open, setOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [busyMessage, setBusyMessage] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([blankQuestion()]);
  const [activeTab, setActiveTab] = useState<"general" | "initial" | "development">("general");
  const rows = list.data ? unwrap(list.data) : [];
  const visibleRows = rows.filter(q => activeTab === "initial" ? q.is_initial_assessment : activeTab === "development" ? q.quiz_type === "SKILL_DEVELOPMENT" : !q.is_initial_assessment && q.quiz_type === "COURSE");

  function openCreate() {
    setEditingQuiz(null);
    setQuestions([blankQuestion()]);
    setOpen(true);
  }

  function openEdit(quiz: Quiz) {
    setEditingQuiz(quiz);
    setQuestions([blankQuestion()]);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingQuiz(null);
    setQuestions([blankQuestion()]);
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions(current => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...patch } : question
    )));
  }

  function addQuestion() {
    setQuestions(current => [...current, blankQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions(current => current.length === 1 ? current : current.filter((_, questionIndex) => questionIndex !== index));
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form));

    const payloadQuestions = editingQuiz ? [] : questions.map((question, index) => {
      const normalizedQuestionType = question.question_type;
      const multipleChoiceOptions = question.options.map(value => value.trim()).filter(Boolean);

      const normalisedCorrectAnswer = (() => {
        if (normalizedQuestionType === "MULTIPLE_CHOICE") {
          if (question.allow_multiple_correct_answers) {
            return question.correct_answers.map(answer => answer.trim()).filter(Boolean).join("|");
          }
          return question.correct_answers[0]?.trim() || question.correct_answer.trim();
        }
        return question.correct_answer.trim();
      })();

      return {
        question_type: normalizedQuestionType,
        prompt: question.prompt.trim(),
        topic: question.topic.trim() || "General",
        options: normalizedQuestionType === "MULTIPLE_CHOICE" ? multipleChoiceOptions : [],
        correct_answer: normalisedCorrectAnswer,
        learning_field: activeTab === "development" ? question.learning_field : null,
        advisor_skill: activeTab === "development" ? question.advisor_skill : null,
        grading_rubric: question.grading_rubric,
        points: Number(question.points),
        order: index,
      };
    });

    if (!editingQuiz) {
      const invalidMultipleChoice = payloadQuestions.some(question => (
        question.question_type === "MULTIPLE_CHOICE" && question.options.length < 2
      ));
      if (invalidMultipleChoice) {
        void notify("Multiple-choice questions need at least two options.", { tone: "error" });
        return;
      }
    }

    const payload: {
      course: number | null;
      title: FormDataEntryValue | undefined;
      description: FormDataEntryValue | undefined;
      passing_score: number;
      is_initial_assessment: boolean;
      is_published: boolean;
      quiz_type: Quiz["quiz_type"];
      target_field: number | null;
      questions?: typeof payloadQuestions;
    } = {
      course: raw.course ? Number(raw.course) : null,
      title: raw.title,
      description: raw.description,
      passing_score: Number(raw.passing_score),
      is_initial_assessment: editingQuiz ? editingQuiz.is_initial_assessment : activeTab === "initial",
      quiz_type: editingQuiz?.quiz_type || (activeTab === "initial" ? "SKILL_DISCOVERY" : activeTab === "development" ? "SKILL_DEVELOPMENT" : "COURSE"),
      target_field: raw.target_field ? Number(raw.target_field) : null,
      is_published: raw.is_published === "on",
    };
    if (!editingQuiz) payload.questions = payloadQuestions;

    try {
      setBusyMessage(editingQuiz ? "Updating quiz..." : "Creating quiz...");
      await api(editingQuiz ? `/quizzes/${editingQuiz.id}/` : "/quizzes/", {
        method: editingQuiz ? "PUT" : "POST",
        body: jsonBody(payload),
      });
      setOpen(false);
      setEditingQuiz(null);
      form.reset();
      setQuestions([blankQuestion()]);
      await list.reload();
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Failed to create quiz", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  async function publish(id: number) {
    try {
      setBusyMessage("Publishing results...");
      await api(`/quizzes/${id}/publish_results/`, { method: "POST", body: "{}" });
      await list.reload();
    } catch {
      void notify("Failed to publish results", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  async function removeQuiz(id: number) {
    if (!await confirmDialog("Delete this quiz and all attempts?", {
      title: "Delete quiz?",
      confirmLabel: "Delete quiz",
      tone: "error",
    })) return;
    try {
      setBusyMessage("Deleting quiz...");
      await api(`/quizzes/${id}/`, { method: "DELETE" });
      await list.reload();
    } catch {
      void notify("Failed to delete quiz", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  return (
    <>
      <LoadingModal open={Boolean(busyMessage)} title="Please wait" message={busyMessage} />
      <PageHeader
        title="Quiz & Assessment"
        description="Automatic scoring and controlled result publication."
        action={
          user?.role !== "STUDENT" && (
            <button className="btn btn-primary" onClick={openCreate}>
              {activeTab === "initial" ? "New Skill discovery" : activeTab === "development" ? "New Skill Development Quiz" : "New Quiz"}
            </button>
          )
        }
      />

      <div className="flex gap-4 border-b border-[var(--border)] mb-6 mt-4">
        <button
          className={`pb-2 px-1 font-semibold ${activeTab === "general" ? "border-b-2 border-[var(--primary)] text-[var(--foreground)]" : "text-[var(--muted)]"}`}
          onClick={() => setActiveTab("general")}
        >
          General Quizzes
        </button>
        {user?.role === "ADMIN" && (
          <button
            className={`pb-2 px-1 font-semibold ${activeTab === "initial" ? "border-b-2 border-[var(--primary)] text-[var(--foreground)]" : "text-[var(--muted)]"}`}
            onClick={() => setActiveTab("initial")}
          >
            Skill discoveries
          </button>
        )}
        {user?.role === "ADMIN" && (
          <button
            className={`pb-2 px-1 font-semibold ${activeTab === "development" ? "border-b-2 border-[var(--primary)] text-[var(--foreground)]" : "text-[var(--muted)]"}`}
            onClick={() => setActiveTab("development")}
          >
            Skill Development
          </button>
        )}
      </div>

      {list.loading ? (
        <Loading variant="list" />
      ) : list.error ? (
        <ErrorMessage message={list.error} />
      ) : !visibleRows.length ? (
        <Empty message="No quizzes available." />
      ) : (
        <div className="grid-cards mt-6">
          {visibleRows.map(q => {
            const isStudent = user?.role === "STUDENT";
            const isAttempted = Boolean(q.user_attempted);
            const isPublished = Boolean(q.results_published);
            const isPassed = Boolean(q.user_passed);

            return (
              <article className="panel p-5 flex flex-col" key={q.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="badge">
                    {q.is_initial_assessment ? "Skill discovery" : q.quiz_type === "SKILL_DEVELOPMENT" ? "Skill Development" : q.course_title}
                  </span>

                  {isStudent && isAttempted && (
                    !isPublished ? (
                      <span className="badge border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                        ⏳ Under Review
                      </span>
                    ) : isPassed ? (
                      <span className="badge border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                        ✓ Completed
                      </span>
                    ) : (
                      <span className="badge border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-semibold">
                        ✕ Failed
                      </span>
                    )
                  )}
                </div>

                <h2 className="font-bold text-xl mt-2">{q.title}</h2>
                <div className="flex flex-wrap items-center gap-2 muted mt-2 mb-6 text-sm">
                  <span>Passing score: {q.passing_score}%</span>
                  {isStudent && isAttempted && isPublished && q.latest_attempt_percentage != null && (
                    <span className="font-semibold text-[var(--foreground)]">
                      · Your score: {q.latest_attempt_percentage}%
                    </span>
                  )}
                </div>

                <div className="mt-auto pt-4 border-t border-[var(--border)] flex flex-wrap gap-2">
                  {isStudent ? (
                    !isAttempted ? (
                      <Link className="btn btn-primary w-full sm:w-auto" href={`/quizzes/${q.id}`}>
                        Take quiz
                      </Link>
                    ) : !isPublished ? (
                      <Link className="btn btn-secondary w-full sm:w-auto" href={`/quizzes/${q.id}`}>
                        View submission
                      </Link>
                    ) : (
                      <Link className="btn btn-secondary w-full sm:w-auto" href={`/quizzes/${q.id}`}>
                        View results
                      </Link>
                    )
                  ) : (
                    <Link className="btn btn-primary w-full sm:w-auto" href={`/quizzes/${q.id}`}>
                      Review
                    </Link>
                  )}

                  {user?.role !== "STUDENT" && q.quiz_type === "COURSE" && !q.results_published && (
                    <button className="btn btn-secondary w-full sm:w-auto" onClick={() => void publish(q.id)}>
                      Publish results
                    </button>
                  )}

                  {user?.role !== "STUDENT" && !q.results_published && (
                    <button className="btn btn-secondary w-full sm:w-auto" onClick={() => openEdit(q)}>
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </button>
                  )}

                  {user?.role !== "STUDENT" && (
                    <button className="btn btn-danger w-full sm:w-auto" onClick={() => void removeQuiz(q.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        key={editingQuiz ? `edit-${editingQuiz.id}` : "create"}
        open={open}
        title={editingQuiz ? (editingQuiz.is_initial_assessment ? "Edit Skill discovery" : "Edit Quiz") : (activeTab === "initial" ? "Create Skill discovery" : "Create Quiz")}
        onCloseAction={closeModal}
        size="wide"
      >
        <form onSubmit={save} className="space-y-5 p-2">
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-[var(--muted)] uppercase tracking-wider">Quiz Settings</h3>

            {(editingQuiz?.quiz_type || (activeTab === "initial" ? "SKILL_DISCOVERY" : activeTab === "development" ? "SKILL_DEVELOPMENT" : "COURSE")) === "COURSE" && (
              <ModernSelect
                className="field"
                name="course"
                placeholder="Select Course"
                defaultValue={editingQuiz?.course ?? undefined}
                required
                options={courses.data ? unwrap(courses.data).map(c => ({ value: c.id, label: c.title })) : []}
              />
            )}
            {(editingQuiz?.quiz_type === "SKILL_DEVELOPMENT" || (!editingQuiz && activeTab === "development")) && <ModernSelect className="field" name="target_field" placeholder="Select target learning field" defaultValue={editingQuiz?.target_field ?? undefined} required options={advisorFields.data ? unwrap(advisorFields.data).map(f => ({ value: f.id, label: f.name })) : []} />}

            <input className="field" name="title" placeholder="Quiz title" defaultValue={editingQuiz?.title || ""} required />
            <textarea className="field" name="description" placeholder="Description (Optional)" defaultValue={editingQuiz?.description || ""} rows={2} />

            <label className="block space-y-1">
              <span className="font-semibold text-sm">Passing Score (%)</span>
              <input className="field" name="passing_score" type="number" defaultValue={editingQuiz?.passing_score ?? 60} min="0" max="100" />
            </label>
          </div>

          {!editingQuiz && (
            <>
              <hr className="border-[var(--border)]" />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold text-sm text-[var(--muted)] uppercase tracking-wider">Questions</h3>
                  <button type="button" className="btn btn-secondary" onClick={addQuestion}>
                    <Plus size={16} aria-hidden="true" />
                    Add question
                  </button>
                </div>

                <div className="space-y-4">
                  {questions.map((question, index) => (
                    <section className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 space-y-4" key={index}>
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-bold text-sm">Question {index + 1}</h4>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => removeQuestion(index)}
                          disabled={questions.length === 1}
                          aria-label={`Remove question ${index + 1}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          Remove
                        </button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <input
                            className="field"
                            value={question.prompt}
                            onChange={event => updateQuestion(index, { prompt: event.target.value })}
                            placeholder="Question"
                            required
                          />
                        </div>

                        <ModernSelect
                          className="field"
                          value={question.question_type}
                          aria-label={`Question ${index + 1} type`}
                          options={questionTypeOptions}
                          onValueChange={value => updateQuestion(index, { question_type: value })}
                        />
                      </div>

                      {question.question_type === "MULTIPLE_CHOICE" && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-sm">Options</span>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                              updateQuestion(index, { options: [...question.options, ""] });
                            }}>
                              <Plus size={14} aria-hidden="true" />
                              Add Option
                            </button>
                          </div>

                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => (
                              <div className="flex items-center gap-2" key={`${index}-${optionIndex}`}>
                                <input
                                  className="field flex-1"
                                  value={option}
                                  onChange={event => {
                                    const nextOptions = [...question.options];
                                    const oldVal = nextOptions[optionIndex];
                                    const newVal = event.target.value;
                                    nextOptions[optionIndex] = newVal;
                                    const nextCorrectAnswers = question.correct_answers.map(ans => ans === oldVal ? newVal : ans);
                                    updateQuestion(index, { options: nextOptions, correct_answers: nextCorrectAnswers });
                                  }}
                                  placeholder={`Option ${optionIndex + 1}`}
                                  required
                                />

                                <label className="flex items-center gap-2 text-xs font-semibold">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-[var(--primary)]"
                                    checked={Boolean(option) && question.correct_answers.includes(option)}
                                    onChange={event => {
                                      if (!option) return;
                                      const nextCorrectAnswers = new Set(question.correct_answers);
                                      if (event.target.checked) {
                                        nextCorrectAnswers.add(option);
                                      } else {
                                        nextCorrectAnswers.delete(option);
                                      }

                                      updateQuestion(index, {
                                        correct_answers: Array.from(nextCorrectAnswers),
                                      });
                                    }}
                                  />
                                  Correct
                                </label>

                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => {
                                    if (question.options.length <= 2) return;
                                    const nextOptions = question.options.filter((_, currentIndex) => currentIndex !== optionIndex);
                                    const removed = option;
                                    const nextCorrectAnswers = question.correct_answers.filter(answer => answer !== removed);
                                    updateQuestion(index, { options: nextOptions, correct_answers: nextCorrectAnswers });
                                  }}
                                  aria-label={`Remove option ${optionIndex + 1}`}
                                  disabled={question.options.length <= 2}
                                >
                                  <Trash2 size={12} aria-hidden="true" />
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[var(--primary)]"
                              checked={question.allow_multiple_correct_answers}
                              onChange={event => {
                                const nextAllowMultiple = event.target.checked;
                                const nextCorrectAnswers = nextAllowMultiple ? question.correct_answers : question.correct_answers.slice(0, 1);
                                updateQuestion(index, {
                                  allow_multiple_correct_answers: nextAllowMultiple,
                                  correct_answers: nextCorrectAnswers,
                                });
                              }}
                            />
                            <span className="text-sm font-semibold select-none">Allow multiple correct answers</span>
                          </label>
                        </div>
                      )}

                      {question.question_type === "TRUE_FALSE" && (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <ModernSelect
                              className="field"
                              value={question.correct_answer}
                              aria-label={`Question ${index + 1} true/false answer`}
                              options={[
                                { value: "True", label: "True" },
                                { value: "False", label: "False" },
                              ]}
                              onValueChange={value => updateQuestion(index, { correct_answer: value })}
                              placeholder="Correct answer"
                            />
                          </div>
                        </div>
                      )}

                      {activeTab === "development" && <div className="grid gap-4 md:grid-cols-2"><ModernSelect className="field" value={question.learning_field || undefined} placeholder="Learning field" options={advisorFields.data ? unwrap(advisorFields.data).map(f => ({ value: f.id, label: f.name })) : []} onValueChange={value => updateQuestion(index, { learning_field: Number(value), advisor_skill: null })} /><ModernSelect className="field" value={question.advisor_skill || undefined} placeholder="Measured skill" options={(advisorFields.data ? unwrap(advisorFields.data) : []).find(f => f.id === question.learning_field)?.skills.map(s => ({ value: s.id, label: s.name })) || []} onValueChange={value => updateQuestion(index, { advisor_skill: Number(value) })} /></div>}
                      {(question.question_type === "SHORT_ANSWER" || question.question_type === "LONG_ANSWER") && <textarea className="field" value={question.grading_rubric} onChange={event => updateQuestion(index, { grading_rubric: event.target.value })} placeholder="AI grading rubric or reference answer" required rows={3} />}

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col space-y-1">
                          <span className="font-semibold text-xs text-[var(--muted)] px-1">Points</span>
                          <input
                            className="field"
                            type="number"
                            value={question.points}
                            min="1"
                            onChange={event => updateQuestion(index, { points: Number(event.target.value) || 1 })}
                          />
                        </label>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-4 pt-2">

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="is_published" className="w-4 h-4 accent-[var(--primary)]" defaultChecked={Boolean(editingQuiz?.is_published)} />
              <span className="text-sm font-semibold select-none">Publish now</span>
            </label>
          </div>

          <div className="pt-4 border-t border-[var(--border)]">
            <button className="btn btn-primary w-full">{editingQuiz ? "Save Changes" : "Create Quiz"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
