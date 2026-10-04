"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Compass,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";
import {
  Empty,
  ErrorMessage,
  Loading,
  LoadingModal,
  Modal,
  PageHeader,
  Stat,
} from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { AdvisorRecommendationCards } from "@/components/advisor/recommendation-cards";
import { studentAdvisorStatusLabel } from "@/components/advisor/status";
import type { AdvisorAttempt as Attempt } from "@/components/advisor/types";

import { useApiData } from "@/hooks/use-api-data";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Course, Quiz } from "@/lib/types";

// ==========================================
// Types
// ==========================================

type Field = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  skills: { id: number; name: string }[];
};

type Paged<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type Mapping = {
  id: number;
  course: number;
  course_title: string;
  field: number;
  field_name: string;
  skill: number;
  skill_name: string;
  coverage: number;
};

type Summary = {
  learning_fields: number;
  active_skills: number;
  mapped_courses: number;
  awaiting_review: number;
  recent_activity: Array<
    Pick<
      Attempt,
      | "id"
      | "student"
      | "student_name"
      | "student_email"
      | "quiz_title"
      | "quiz_type"
      | "analysis_status"
      | "completed_at"
    >
  >;
};

const adminTabs = [
  ["overview", "Overview"],
  ["fields", "Fields & Skills"],
  ["mapping", "Course Mapping"],
  ["reviews", "Review Queue"],
  ["results", "View Results"],
] as const;

type AdminTab = (typeof adminTabs)[number][0];

// ==========================================
// Helper Functions
// ==========================================

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

function label(value?: string | null): string {
  if (!value) return "-";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function date(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function attemptScore(attempt: Attempt): string {
  return attempt.score === null ? "Pending" : `${attempt.score} / ${attempt.max_score}`;
}

// ==========================================
// Entry Component
// ==========================================

export function LearningPathPage() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? <AdminAdvisor /> : <StudentAdvisor />;
}

// ==========================================
// Student Advisor View
// ==========================================

function StudentAdvisor() {
  const fields = useApiData<Field[] | { results: Field[] }>("/advisor/fields/");
  const quizzes = useApiData<Quiz[] | { results: Quiz[] }>("/advisor/quizzes/");
  const attempts = useApiData<Attempt[] | { results: Attempt[] }>("/advisor/attempts/");

  const [mode, setMode] = useState<"SKILL_DISCOVERY" | "SKILL_DEVELOPMENT" | null>(null);
  const [field, setField] = useState<number | null>(null);

  if (fields.loading || quizzes.loading || attempts.loading) {
    return <Loading variant="dashboard" />;
  }

  if (fields.error || quizzes.error || attempts.error) {
    return (
      <ErrorMessage
        message={fields.error || quizzes.error || attempts.error || "Unable to load Advisor"}
      />
    );
  }

  const allQuizzes = unwrap(quizzes.data || []);
  const prior = new Set(unwrap(attempts.data || []).map((a) => a.quiz_title));
  const visible = allQuizzes.filter(
    (q) => q.quiz_type === mode && (mode !== "SKILL_DEVELOPMENT" || q.target_field === field)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Learning Path Advisor"
        description="Discover your strongest skill or develop a field you choose."
      />

      {/* Mode Selection Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          className={`advisor-option-card panel p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:scale-[1.01] hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,var(--panel))] hover:shadow-xl ${mode === "SKILL_DISCOVERY" ? "ring-2 ring-[var(--primary)]" : ""
            }`}
          onClick={() => {
            setMode("SKILL_DISCOVERY");
            setField(null);
          }}
        >
          <Compass className="text-[var(--primary)]" />
          <h2 className="mt-3 text-xl font-bold">Skill Discovery</h2>
          <p className="muted mt-2">
            Take the existing Skill discovery, then receive strongest-skill analysis and the best
            course recommendation.
          </p>
        </button>

        <button
          type="button"
          className={`advisor-option-card panel p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:scale-[1.01] hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,var(--panel))] hover:shadow-xl ${mode === "SKILL_DEVELOPMENT" ? "ring-2 ring-[var(--primary)]" : ""
            }`}
          onClick={() => setMode("SKILL_DEVELOPMENT")}
        >
          <Sparkles className="text-[var(--primary)]" />
          <h2 className="mt-3 text-xl font-bold">Skill Development</h2>
          <p className="muted mt-2">
            Choose a field, identify your level and gaps, and receive a matching course
            recommendation.
          </p>
        </button>
      </div>

      {/* Field Selector for Skill Development */}
      {mode === "SKILL_DEVELOPMENT" && (
        <section className="panel p-5">
          <h2 className="font-bold">Choose a field</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {unwrap(fields.data || []).map((item) => (
              <button
                key={item.id}
                type="button"
                className={field === item.id ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setField(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Assessments List */}
      {mode && (mode === "SKILL_DISCOVERY" || field) && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Available assessment</h2>
          {visible.length ? (
            visible.map((q) => (
              <article
                key={q.id}
                className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="font-bold">{q.title}</h3>
                  <p className="muted text-sm">{q.description}</p>
                  <p className="muted mt-2 text-xs font-medium">
                    {q.questions.length} questions · {q.questions.reduce((total, question) => total + Math.max(1, question.points || 0), 0)} total points
                    {mode === "SKILL_DEVELOPMENT" ? " · Personalized skills analysis" : " · Strengths discovery"}
                  </p>
                </div>
                {prior.has(q.title) ? (
                  <span className="badge">Already attempted</span>
                ) : (
                  <Link className="btn btn-primary" href={`/quizzes/${q.id}?from=learning-path`}>
                    Take quiz
                  </Link>
                )}
              </article>
            ))
          ) : (
            <Empty message="An admin has not published an assessment for this option yet." />
          )}
        </section>
      )}

      {/* Past Advisor Results */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Your Advisor results</h2>
        {unwrap(attempts.data || []).length ? (
          unwrap(attempts.data || []).map((a) => (
            <article className="panel p-5" key={a.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{a.quiz_title}</strong>
                <span className="badge">{studentAdvisorStatusLabel(a.analysis_status)}</span>
              </div>

              {a.analysis ? (
                <div className="mt-4 space-y-3">
                  <p>{a.analysis.summary}</p>

                  {a.quiz_type === "SKILL_DISCOVERY" &&
                    toTextList(a.analysis.strongest_skill_names).length > 0 && (
                      <p>
                        <strong>Strongest skill:</strong>{" "}
                        {toTextList(a.analysis.strongest_skill_names).join(", ")}
                      </p>
                    )}

                  {a.quiz_type !== "SKILL_DISCOVERY" && a.analysis.strongest_field_name && (
                    <p>
                      <strong>Selected field:</strong> {a.analysis.strongest_field_name}
                    </p>
                  )}

                  {a.analysis.level && (
                    <p>
                      <strong>Level:</strong> {a.analysis.level}
                    </p>
                  )}

                  {a.quiz_type !== "SKILL_DISCOVERY" &&
                    toTextList(a.analysis.gaps).length > 0 && (
                      <p>
                        <strong>Gaps:</strong> {toTextList(a.analysis.gaps).join(", ")}
                      </p>
                    )}

                  <AdvisorRecommendationCards recommendations={a.analysis.recommendations} />
                  <Link className="btn btn-secondary" href={`/quizzes/${a.quiz}?from=learning-path`}>
                    View full result
                  </Link>
                </div>
              ) : (
                <p className="muted mt-3 text-sm">
                  {a.analysis_status === "ANALYSIS_FAILED"
                    ? "Your answers are safe. An administrator will retry the AI analysis."
                    : "Your result will appear after administrator review and publication."}
                </p>
              )}
            </article>
          ))
        ) : (
          <Empty message="No attempts yet. Choose one of the Advisor options above." />
        )}
      </section>
    </div>
  );
}

// ==========================================
// Admin Advisor Dashboard
// ==========================================

function AdminAdvisor() {
  const { notify, confirm } = useFeedbackDialog();

  const [tab, setTab] = useState<AdminTab>("overview");
  const [busy, setBusy] = useState("");

  // Modals state
  const [fieldModal, setFieldModal] = useState<Field | "new" | null>(null);
  const [mappingModal, setMappingModal] = useState<Mapping | "new" | null>(null);
  const [reviewModal, setReviewModal] = useState<Attempt | null>(null);
  const [resultModal, setResultModal] = useState<Attempt | null>(null);

  // Filter & pagination states
  const [fieldSearch, setFieldSearch] = useState("");

  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewType, setReviewType] = useState("");
  const [reviewPage, setReviewPage] = useState(1);

  const [resultSearch, setResultSearch] = useState("");
  const [resultType, setResultType] = useState("");
  const [resultPage, setResultPage] = useState(1);

  const [mappingPage, setMappingPage] = useState(1);

  // Sync tab with URL search parameter
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as AdminTab | null;
    if (requested && adminTabs.some(([key]) => key === requested)) {
      setTab(requested);
    }
  }, []);

  function chooseTab(next: AdminTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", next);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  // Data endpoints
  const fields = useApiData<Field[] | Paged<Field>>("/advisor/fields/");
  const courses = useApiData<Course[] | Paged<Course>>("/courses/");
  const summary = useApiData<Summary>("/advisor/attempts/summary/");
  const mappings = useApiData<Paged<Mapping>>(`/advisor/course-skills/?page=${mappingPage}`);

  const reviewParams = new URLSearchParams({
    page: String(reviewPage),
    status: reviewStatus || "SUBMITTED,ANALYSIS_FAILED,DRAFT_READY",
  });
  if (reviewSearch) reviewParams.set("search", reviewSearch);
  if (reviewType) reviewParams.set("type", reviewType);
  const reviews = useApiData<Paged<Attempt>>(`/advisor/attempts/?${reviewParams}`);

  const resultParams = new URLSearchParams({
    page: String(resultPage),
    status: "PUBLISHED",
  });
  if (resultSearch) resultParams.set("search", resultSearch);
  if (resultType) resultParams.set("type", resultType);
  const results = useApiData<Paged<Attempt>>(`/advisor/attempts/?${resultParams}`);

  const fieldRows = useMemo(() => {
    return unwrap(fields.data || []).filter((item) =>
      `${item.name} ${item.description}`.toLowerCase().includes(fieldSearch.toLowerCase())
    );
  }, [fields.data, fieldSearch]);

  const courseRows = unwrap(courses.data || []).filter((course) => course.status === "PUBLISHED");

  async function reloadWorkspace() {
    await Promise.all([
      fields.reload(),
      mappings.reload(),
      reviews.reload(),
      results.reload(),
      summary.reload(),
    ]);
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? adminTabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + adminTabs.length) % adminTabs.length;

    chooseTab(adminTabs[nextIndex][0]);
    document.getElementById(`advisor-tab-${adminTabs[nextIndex][0]}`)?.focus();
  }

  async function run(task: string, action: () => Promise<void>) {
    try {
      setBusy(task);
      await action();
    } catch (error) {
      void notify(error instanceof Error ? error.message : "Action failed.", { tone: "error" });
    } finally {
      setBusy("");
    }
  }

  // --- Field actions ---
  async function saveField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = fieldModal === "new" ? null : fieldModal;

    await run(current ? "Updating learning field…" : "Creating learning field…", async () => {
      const name = String(data.get("name") || "");
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      await api(current ? `/advisor/fields/${current.id}/` : "/advisor/fields/", {
        method: current ? "PATCH" : "POST",
        body: jsonBody({
          name,
          slug,
          description: data.get("description"),
          is_active: data.get("is_active") === "on",
          ...(!current ? { order: 0 } : {}),
        }),
      });

      setFieldModal(null);
      await Promise.all([fields.reload(), summary.reload()]);
      void notify(`Learning field ${current ? "updated" : "created"}.`, { tone: "success" });
    });
  }

  async function toggleField(item: Field) {
    const accepted = await confirm(`${item.is_active ? "Deactivate" : "Activate"} ${item.name}?`, {
      confirmLabel: item.is_active ? "Deactivate" : "Activate",
    });
    if (!accepted) return;

    await run("Updating learning field…", async () => {
      await api(`/advisor/fields/${item.id}/`, {
        method: "PATCH",
        body: jsonBody({ is_active: !item.is_active }),
      });
      await Promise.all([fields.reload(), summary.reload()]);
    });
  }

  async function removeField(item: Field) {
    const accepted = await confirm(`Delete ${item.name} and its skills?`, {
      title: "Delete learning field",
      confirmLabel: "Delete",
      tone: "error",
    });
    if (!accepted) return;

    await run("Deleting learning field…", async () => {
      await api(`/advisor/fields/${item.id}/`, { method: "DELETE" });
      await reloadWorkspace();
    });
  }

  // --- Skill actions ---
  async function addSkill(event: FormEvent<HTMLFormElement>, targetField: Field) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    await run("Adding skill…", async () => {
      await api("/advisor/skills/", {
        method: "POST",
        body: jsonBody({
          field: targetField.id,
          name: data.get("name"),
          description: "",
          is_active: true,
        }),
      });
      form.reset();
      await Promise.all([fields.reload(), summary.reload()]);
      setFieldModal(null);
    });
  }

  async function renameSkill(
    event: FormEvent<HTMLFormElement>,
    skill: Field["skills"][number]
  ) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name || name === skill.name) return;

    await run("Updating skill…", async () => {
      await api(`/advisor/skills/${skill.id}/`, {
        method: "PATCH",
        body: jsonBody({ name }),
      });
      await fields.reload();
      setFieldModal(null);
    });
  }

  async function removeSkill(skill: Field["skills"][number]) {
    const accepted = await confirm(`Remove the skill ${skill.name}?`, {
      title: "Remove skill",
      confirmLabel: "Remove",
      tone: "error",
    });
    if (!accepted) return;

    await run("Removing skill…", async () => {
      await api(`/advisor/skills/${skill.id}/`, { method: "DELETE" });
      await reloadWorkspace();
      setFieldModal(null);
    });
  }

  // --- Mapping actions ---
  async function saveMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = mappingModal === "new" ? null : mappingModal;

    await run(current ? "Updating course mapping…" : "Creating course mapping…", async () => {
      await api(current ? `/advisor/course-skills/${current.id}/` : "/advisor/course-skills/", {
        method: current ? "PATCH" : "POST",
        body: jsonBody({
          course: Number(data.get("course")),
          skill: Number(data.get("skill")),
          coverage: Number(data.get("coverage")),
        }),
      });
      setMappingModal(null);
      await Promise.all([mappings.reload(), summary.reload()]);
      void notify(`Course mapping ${current ? "updated" : "created"}.`, { tone: "success" });
    });
  }

  async function removeMapping(item: Mapping) {
    const accepted = await confirm(
      `Remove the mapping between ${item.course_title} and ${item.skill_name}?`,
      {
        title: "Remove mapping",
        confirmLabel: "Remove",
        tone: "error",
      }
    );
    if (!accepted) return;

    await run("Removing course mapping…", async () => {
      await api(`/advisor/course-skills/${item.id}/`, { method: "DELETE" });
      await Promise.all([mappings.reload(), summary.reload()]);
    });
  }

  // --- Assessment Analysis & Reviews ---
  async function analyze(item: Attempt) {
    const isRetry = item.analysis_status === "ANALYSIS_FAILED";
    await run(isRetry ? "Retrying AI analysis…" : "Running AI analysis…", async () => {
      await api(`/advisor/attempts/${item.id}/analyze/`, {
        method: "POST",
        body: "{}",
      });
      await Promise.all([reviews.reload(), summary.reload()]);
      setReviewModal(null);
      void notify("AI analysis completed. Draft is ready for review.", { tone: "success" });
    });
  }

  function draftPayload(form: HTMLFormElement) {
    const data = new FormData(form);
    const course = Number(data.get("course") || 0);
    const isDiscovery = reviewModal?.quiz_type === "SKILL_DISCOVERY";
    const strongestSkill = String(data.get("strongest_skill") || "").trim();

    return {
      summary: data.get("summary"),
      strongest_field: isDiscovery ? null : Number(data.get("strongest_field") || 0) || null,
      strongest_skills: isDiscovery ? (strongestSkill ? [strongestSkill] : []) : undefined,
      strengths: String(data.get("strengths") || "")
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
      gaps: isDiscovery
        ? []
        : String(data.get("gaps") || "")
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
      recommendations: course
        ? [
          {
            course,
            match_type: data.get("match_type"),
            reason: data.get("reason"),
          },
        ]
        : [],
    };
  }

  async function saveReview(form: HTMLFormElement, publish = false) {
    if (!reviewModal) return;
    const payload = draftPayload(form);
    const id = reviewModal.id;

    if (publish) {
      const accepted = await confirm(
        `Publish the reviewed result for ${reviewModal.student_name}? The student will be able to view it immediately.`,
        {
          title: "Publish advisor result",
          confirmLabel: "Publish",
          tone: "warning",
        }
      );
      if (!accepted) return;
    }

    await run(publish ? "Saving and publishing result…" : "Saving reviewed draft…", async () => {
      await api(`/advisor/attempts/${id}/draft/`, {
        method: "PATCH",
        body: jsonBody(payload),
      });

      if (publish) {
        await api(`/advisor/attempts/${id}/publish/`, {
          method: "POST",
          body: "{}",
        });
      }

      setReviewModal(null);
      await Promise.all([reviews.reload(), results.reload(), summary.reload()]);
      void notify(publish ? "Result published." : "Reviewed draft saved.", { tone: "success" });
    });
  }

  return (
    <div className="space-y-6">
      <LoadingModal open={Boolean(busy)} title="AI Learning Path Advisor" message={busy} />

      <PageHeader
        title="AI Learning Path Advisor"
        description="Configure learning coverage, review AI analysis, and publish student results."
      />

      {/* Tab Navigation */}
      <div
        className="panel flex gap-2 overflow-x-auto p-2"
        role="tablist"
        aria-label="AI Learning Path administration"
      >
        {adminTabs.map(([key, text], index) => (
          <button
            key={key}
            id={`advisor-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`advisor-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={
              tab === key
                ? "btn btn-primary whitespace-nowrap"
                : "btn btn-secondary whitespace-nowrap"
            }
            onKeyDown={(event) => handleTabKey(event, index)}
            onClick={() => chooseTab(key)}
          >
            {text}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div id={`advisor-panel-${tab}`} role="tabpanel" aria-labelledby={`advisor-tab-${tab}`}>
        {tab === "overview" && <OverviewTab summary={summary} onOpen={chooseTab} />}

        {tab === "fields" && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Fields & Skills Directory</h2>
                <p className="muted text-sm">
                  Manage the learning areas used by advisor assessments.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setFieldModal("new")}
              >
                <Plus size={16} />
                Add Learning Field
              </button>
            </div>

            <input
              className="field max-w-md"
              aria-label="Search learning fields"
              placeholder="Search fields or descriptions…"
              value={fieldSearch}
              onChange={(event) => setFieldSearch(event.target.value)}
            />

            {fields.loading ? (
              <Loading variant="table" />
            ) : fields.error ? (
              <ErrorMessage message={fields.error} />
            ) : !fieldRows.length ? (
              <Empty message="No learning fields match this search." />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="panel table-wrap hidden md:block">
                  <table>
                    <thead>
                      <tr>
                        <th>Learning field</th>
                        <th>Skills</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldRows.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <div className="muted text-sm">{item.description || "No description"}</div>
                          </td>
                          <td>
                            {item.skills.length
                              ? item.skills.map((skill) => skill.name).join(", ")
                              : "No skills"}
                          </td>
                          <td>
                            <span className="badge">{item.is_active ? "Active" : "Inactive"}</span>
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setFieldModal(item)}
                              >
                                <Pencil size={14} />
                                Manage
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => void toggleField(item)}
                              >
                                {item.is_active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger"
                                aria-label={`Delete ${item.name}`}
                                onClick={() => void removeField(item)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="grid gap-3 md:hidden">
                  {fieldRows.map((item) => (
                    <article className="panel p-4" key={item.id}>
                      <div className="flex justify-between gap-3">
                        <strong>{item.name}</strong>
                        <span className="badge">{item.is_active ? "Active" : "Inactive"}</span>
                      </div>
                      <p className="muted mt-2 text-sm">{item.description || "No description"}</p>
                      <p className="mt-3 text-sm">
                        <strong>Skills:</strong>{" "}
                        {item.skills.map((skill) => skill.name).join(", ") || "None"}
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary mt-3"
                        onClick={() => setFieldModal(item)}
                      >
                        Manage
                      </button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "mapping" && (
          <MappingTab
            data={mappings}
            page={mappingPage}
            onPage={setMappingPage}
            onCreate={() => setMappingModal("new")}
            onEdit={setMappingModal}
            onRemove={removeMapping}
          />
        )}

        {tab === "reviews" && (
          <AttemptsTab
            mode="reviews"
            data={reviews}
            page={reviewPage}
            search={reviewSearch}
            type={reviewType}
            status={reviewStatus}
            onSearch={(value) => {
              setReviewSearch(value);
              setReviewPage(1);
            }}
            onType={(value) => {
              setReviewType(value);
              setReviewPage(1);
            }}
            onStatus={(value) => {
              setReviewStatus(value);
              setReviewPage(1);
            }}
            onPage={setReviewPage}
            onAnalyze={analyze}
            onOpen={setReviewModal}
          />
        )}

        {tab === "results" && (
          <AttemptsTab
            mode="results"
            data={results}
            page={resultPage}
            search={resultSearch}
            type={resultType}
            status="PUBLISHED"
            onSearch={(value) => {
              setResultSearch(value);
              setResultPage(1);
            }}
            onType={(value) => {
              setResultType(value);
              setResultPage(1);
            }}
            onStatus={() => undefined}
            onPage={setResultPage}
            onAnalyze={analyze}
            onOpen={setResultModal}
          />
        )}
      </div>

      {/* Modals */}
      <FieldEditorModal
        value={fieldModal}
        onClose={() => setFieldModal(null)}
        onSubmit={saveField}
        onAddSkill={addSkill}
        onRenameSkill={renameSkill}
        onRemoveSkill={removeSkill}
      />

      <MappingEditorModal
        value={mappingModal}
        fields={fieldRows.length ? fieldRows : unwrap(fields.data || [])}
        courses={courseRows}
        onClose={() => setMappingModal(null)}
        onSubmit={saveMapping}
      />

      <ReviewModal
        attempt={reviewModal}
        fields={unwrap(fields.data || [])}
        courses={courseRows}
        onClose={() => setReviewModal(null)}
        onSubmit={saveReview}
        onRerun={analyze}
      />

      <ResultModal attempt={resultModal} onClose={() => setResultModal(null)} />
    </div>
  );
}

// ==========================================
// Tabs & Pagination Components
// ==========================================

function Pager({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / 25));
  if (pages <= 1) return null;

  return (
    <nav className="mt-4 flex items-center justify-between" aria-label="Table pages">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="muted text-sm">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

function OverviewTab({
  summary,
  onOpen,
}: {
  summary: ReturnType<typeof useApiData<Summary>>;
  onOpen: (tab: AdminTab) => void;
}) {
  if (summary.loading) return <Loading variant="dashboard" />;
  if (summary.error || !summary.data) {
    return <ErrorMessage message={summary.error || "Unable to load advisor overview."} />;
  }

  const data = summary.data;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Learning Fields" value={data.learning_fields} />
        <Stat label="Active Skills" value={data.active_skills} />
        <Stat label="Mapped Courses" value={data.mapped_courses} />
        <Stat label="Awaiting Review" value={data.awaiting_review} />
      </div>

      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Recent Assessment Activity</h2>
            <p className="muted text-sm">The latest advisor attempts across all students.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => onOpen("reviews")}>
            Open queue
          </button>
        </div>

        {!data.recent_activity.length ? (
          <div className="mt-4">
            <Empty message="No advisor assessment activity yet." />
          </div>
        ) : (
          <div className="table-wrap mt-4">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Assessment</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_activity.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.student_name}</strong>
                      <div className="muted text-sm">{item.student_email}</div>
                    </td>
                    <td>{item.quiz_title}</td>
                    <td>
                      <span className="badge">{label(item.quiz_type)}</span>
                    </td>
                    <td>
                      <span className="badge">{label(item.analysis_status)}</span>
                    </td>
                    <td>{date(item.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MappingTab({
  data,
  page,
  onPage,
  onCreate,
  onEdit,
  onRemove,
}: {
  data: ReturnType<typeof useApiData<Paged<Mapping>>>;
  page: number;
  onPage: (page: number) => void;
  onCreate: () => void;
  onEdit: (item: Mapping) => void;
  onRemove: (item: Mapping) => Promise<void>;
}) {
  const rows = data.data?.results || [];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Course-Skill Coverage Mapping</h2>
          <p className="muted text-sm">Connect published learning content to advisor skills.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          <Plus size={16} />
          Create Mapping
        </button>
      </div>

      {data.loading ? (
        <Loading variant="table" />
      ) : data.error ? (
        <ErrorMessage message={data.error} />
      ) : !rows.length ? (
        <Empty message="No course-skill mappings are available." />
      ) : (
        <>
          <div className="panel table-wrap hidden md:block">
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Field</th>
                  <th>Skill</th>
                  <th>Coverage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.course_title}</strong>
                    </td>
                    <td>{item.field_name}</td>
                    <td>{item.skill_name}</td>
                    <td>{item.coverage}%</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onEdit(item)}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => void onRemove(item)}
                        >
                          <Trash2 size={14} />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {rows.map((item) => (
              <article className="panel p-4" key={item.id}>
                <strong>{item.course_title}</strong>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <dt className="muted">Field</dt>
                  <dd>{item.field_name}</dd>
                  <dt className="muted">Skill</dt>
                  <dd>{item.skill_name}</dd>
                  <dt className="muted">Coverage</dt>
                  <dd>{item.coverage}%</dd>
                </dl>
                <button
                  type="button"
                  className="btn btn-secondary mt-3"
                  onClick={() => onEdit(item)}
                >
                  Edit mapping
                </button>
              </article>
            ))}
          </div>

          <Pager page={page} count={data.data?.count || 0} onPage={onPage} />
        </>
      )}
    </section>
  );
}

function AttemptsTab({
  mode,
  data,
  page,
  search,
  type,
  status,
  onSearch,
  onType,
  onStatus,
  onPage,
  onAnalyze,
  onOpen,
}: {
  mode: "reviews" | "results";
  data: ReturnType<typeof useApiData<Paged<Attempt>>>;
  page: number;
  search: string;
  type: string;
  status: string;
  onSearch: (value: string) => void;
  onType: (value: string) => void;
  onStatus: (value: string) => void;
  onPage: (page: number) => void;
  onAnalyze: (item: Attempt) => Promise<void>;
  onOpen: (item: Attempt) => void;
}) {
  const rows = data.data?.results || [];
  const resultsMode = mode === "results";

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">
          {resultsMode ? "Published Advisor Results" : "Assessment Review Queue"}
        </h2>
        <p className="muted text-sm">
          {resultsMode
            ? "Inspect finalized learning-path results."
            : "Analyze, review, and publish student assessments."}
        </p>
      </div>

      {/* Filter controls */}
      <div className="panel grid gap-3 p-4 md:grid-cols-3">
        <input
          className="field"
          aria-label="Search students"
          placeholder="Search student name or email…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <ModernSelect
          className="field"
          aria-label="Assessment type"
          value={type}
          onValueChange={onType}
          options={[
            { value: "", label: "All assessment types" },
            { value: "SKILL_DISCOVERY", label: "Skill Discovery" },
            { value: "SKILL_DEVELOPMENT", label: "Skill Development" },
          ]}
        />
        {!resultsMode && (
          <ModernSelect
            className="field"
            aria-label="Review status"
            value={status}
            onValueChange={onStatus}
            options={[
              { value: "", label: "All actionable statuses" },
              { value: "SUBMITTED", label: "Submitted" },
              { value: "ANALYSIS_FAILED", label: "Analysis Failed" },
              { value: "DRAFT_READY", label: "Draft Ready" },
            ]}
          />
        )}
      </div>

      {data.loading ? (
        <Loading variant="table" />
      ) : data.error ? (
        <ErrorMessage message={data.error} />
      ) : !rows.length ? (
        <Empty
          message={
            resultsMode
              ? "No published advisor results match these filters."
              : "The review queue is empty."
          }
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="panel table-wrap hidden lg:block">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Assessment</th>
                  <th>Type</th>
                  <th>Score</th>
                  {resultsMode ? (
                    <>
                      <th>Strongest area</th>
                      <th>Level</th>
                      <th>Published</th>
                    </>
                  ) : (
                    <>
                      <th>Submitted</th>
                      <th>Status</th>
                    </>
                  )}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.student_name}</strong>
                      <div className="muted text-sm">{item.student_email}</div>
                    </td>
                    <td>{item.quiz_title}</td>
                    <td>
                      <span className="badge">{label(item.quiz_type)}</span>
                    </td>
                    <td>{attemptScore(item)}</td>
                    {resultsMode ? (
                      <>
                        <td>
                          {item.quiz_type === "SKILL_DISCOVERY"
                            ? toTextList(item.analysis?.strongest_skill_names).join(", ") || "-"
                            : item.analysis?.strongest_field_name || "-"}
                        </td>
                        <td>{label(item.analysis?.level)}</td>
                        <td>{date(item.published_at)}</td>
                      </>
                    ) : (
                      <>
                        <td>{date(item.completed_at)}</td>
                        <td>
                          <span className="badge">{label(item.analysis_status)}</span>
                        </td>
                      </>
                    )}
                    <td>
                      {resultsMode || item.analysis_status === "DRAFT_READY" ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => onOpen(item)}
                        >
                          {resultsMode ? <Eye size={15} /> : <Pencil size={15} />}
                          {resultsMode ? "View Result" : "Review Draft"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void onAnalyze(item)}
                        >
                          <RefreshCw size={15} />
                          {item.analysis_status === "ANALYSIS_FAILED" ? "Retry" : "Analyze"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="grid gap-3 lg:hidden">
            {rows.map((item) => (
              <article className="panel p-4" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong>{item.student_name}</strong>
                    <div className="muted text-sm">{item.student_email}</div>
                  </div>
                  <span className="badge">{label(item.analysis_status)}</span>
                </div>
                <h3 className="mt-3 font-semibold">{item.quiz_title}</h3>
                <p className="muted mt-1 text-sm">
                  {label(item.quiz_type)} · {attemptScore(item)}
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-4"
                  onClick={() =>
                    item.analysis_status === "DRAFT_READY" || resultsMode
                      ? onOpen(item)
                      : void onAnalyze(item)
                  }
                >
                  {resultsMode
                    ? "View Result"
                    : item.analysis_status === "DRAFT_READY"
                      ? "Review Draft"
                      : "Analyze"}
                </button>
              </article>
            ))}
          </div>

          <Pager page={page} count={data.data?.count || 0} onPage={onPage} />
        </>
      )}
    </section>
  );
}

// ==========================================
// Modals
// ==========================================

function FieldEditorModal({
  value,
  onClose,
  onSubmit,
  onAddSkill,
  onRenameSkill,
  onRemoveSkill,
}: {
  value: Field | "new" | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAddSkill: (event: FormEvent<HTMLFormElement>, field: Field) => Promise<void>;
  onRenameSkill: (
    event: FormEvent<HTMLFormElement>,
    skill: Field["skills"][number]
  ) => Promise<void>;
  onRemoveSkill: (skill: Field["skills"][number]) => Promise<void>;
}) {
  const item = value === "new" ? null : value;

  return (
    <Modal
      open={Boolean(value)}
      title={item ? `Manage Field: ${item.name}` : "Add Learning Field"}
      onCloseAction={onClose}
      size="wide"
    >
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="text-sm font-semibold">
          Field name
          <input className="field mt-1" name="name" required defaultValue={item?.name || ""} />
        </label>

        <label className="text-sm font-semibold">
          Description
          <textarea
            className="field mt-1"
            name="description"
            rows={3}
            defaultValue={item?.description || ""}
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={item?.is_active ?? true}
          />
          Active
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">
            {item ? "Save Changes" : "Create Field"}
          </button>
        </div>
      </form>

      {item && (
        <section className="mt-6 border-t border-[var(--border)] pt-5">
          <h3 className="font-bold">Skills</h3>

          <form className="mt-3 flex gap-2" onSubmit={(event) => void onAddSkill(event, item)}>
            <input
              className="field"
              name="name"
              required
              placeholder="New skill name"
            />
            <button className="btn btn-secondary">
              <Plus size={15} />
              Add
            </button>
          </form>

          <div className="mt-3 space-y-2">
            {item.skills.length ? (
              item.skills.map((skill) => (
                <form
                  key={skill.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3"
                  onSubmit={(event) => void onRenameSkill(event, skill)}
                >
                  <input
                    className="field"
                    name="name"
                    required
                    defaultValue={skill.name}
                    aria-label={`Rename ${skill.name}`}
                  />
                  <button className="btn btn-secondary">Save</button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void onRemoveSkill(skill)}
                  >
                    Remove
                  </button>
                </form>
              ))
            ) : (
              <p className="muted text-sm">No skills attached yet.</p>
            )}
          </div>
        </section>
      )}
    </Modal>
  );
}

function MappingEditorModal({
  value,
  fields,
  courses,
  onClose,
  onSubmit,
}: {
  value: Mapping | "new" | null;
  fields: Field[];
  courses: Course[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const item = value === "new" ? null : value;
  const defaultFieldId = item?.field || fields[0]?.id || 0;
  const [fieldId, setFieldId] = useState(0);

  useEffect(() => {
    setFieldId(defaultFieldId);
  }, [value, defaultFieldId]);

  const skills = fields.find((f) => f.id === fieldId)?.skills || [];

  return (
    <Modal
      open={Boolean(value)}
      title={item ? "Edit Course-Skill Mapping" : "Create Course-Skill Mapping"}
      onCloseAction={onClose}
    >
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="text-sm font-semibold">
          Course
          <ModernSelect
            className="field mt-1"
            name="course"
            required
            defaultValue={item?.course || ""}
            placeholder="Select course"
            options={courses.map((course) => ({
              value: course.id,
              label: course.title,
            }))}
          />
        </label>

        <label className="text-sm font-semibold">
          Learning field
          <ModernSelect
            className="field mt-1"
            required
            value={fieldId || ""}
            placeholder="Select field"
            onValueChange={(val) => setFieldId(Number(val))}
            options={fields
              .filter((f) => f.is_active)
              .map((f) => ({
                value: f.id,
                label: f.name,
              }))}
          />
        </label>

        <label className="text-sm font-semibold">
          Skill
          <ModernSelect
            key={`${fieldId}-${item?.id || "new"}`}
            className="field mt-1"
            name="skill"
            required
            defaultValue={item?.skill || ""}
            placeholder="Select skill"
            options={skills.map((skill) => ({
              value: skill.id,
              label: skill.name,
            }))}
          />
        </label>

        <label className="text-sm font-semibold">
          Coverage percentage
          <input
            className="field mt-1"
            name="coverage"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={item?.coverage || 100}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Save Mapping</button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewModal({
  attempt,
  fields,
  courses,
  onClose,
  onSubmit,
  onRerun,
}: {
  attempt: Attempt | null;
  fields: Field[];
  courses: Course[];
  onClose: () => void;
  onSubmit: (form: HTMLFormElement, publish?: boolean) => Promise<void>;
  onRerun: (attempt: Attempt) => Promise<void>;
}) {
  const recommendation = attempt?.analysis?.recommendations[0];
  const isDiscovery = attempt?.quiz_type === "SKILL_DISCOVERY";
  const strongestSkill = toTextList(attempt?.analysis?.strongest_skill_names).join(", ");

  return (
    <Modal
      open={Boolean(attempt)}
      title={`Review AI Analysis${attempt ? `: ${attempt.student_name}` : ""}`}
      onCloseAction={onClose}
      size="wide"
    >
      {attempt && attempt.analysis && (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(event.currentTarget);
          }}
        >
          <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
            <strong>{attempt.quiz_title}</strong>
            <div className="muted mt-1">
              {attemptScore(attempt)} · {label(attempt.quiz_type)}
            </div>
          </div>

          <label className="text-sm font-semibold">
            Summary
            <textarea
              className="field mt-1"
              name="summary"
              rows={4}
              required
              defaultValue={attempt.analysis.summary}
            />
          </label>

          {!isDiscovery && (
            <label className="text-sm font-semibold">
              Selected field
              <ModernSelect
                className="field mt-1"
                name="strongest_field"
                defaultValue={attempt.analysis.strongest_field || ""}
                options={[
                  { value: "", label: "No selected field" },
                  ...fields.map((f) => ({ value: f.id, label: f.name })),
                ]}
              />
            </label>
          )}

          {isDiscovery && (
            <label className="text-sm font-semibold">
              Strongest skill
              <input
                className="field mt-1"
                name="strongest_skill"
                defaultValue={strongestSkill}
                placeholder="e.g. Problem Solving, Communication"
              />
            </label>
          )}

          <div className={isDiscovery ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
            <label className="text-sm font-semibold">
              Strengths
              <textarea
                className="field mt-1"
                name="strengths"
                rows={isDiscovery ? 4 : 5}
                defaultValue={toTextList(attempt.analysis.strengths).join("\n")}
              />
            </label>

            {!isDiscovery && (
              <label className="text-sm font-semibold">
                Gaps
                <textarea
                  className="field mt-1"
                  name="gaps"
                  rows={5}
                  defaultValue={toTextList(attempt.analysis.gaps).join("\n")}
                />
              </label>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Recommended course
              <ModernSelect
                className="field mt-1"
                name="course"
                defaultValue={recommendation?.course || ""}
                options={[
                  { value: "", label: "No recommendation" },
                  ...courses.map((course) => ({
                    value: course.id,
                    label: course.title,
                  })),
                ]}
              />
            </label>

            <label className="text-sm font-semibold">
              Match type
              <ModernSelect
                className="field mt-1"
                name="match_type"
                defaultValue={recommendation?.match_type || "EXACT_MATCH"}
                options={[
                  { value: "EXACT_MATCH", label: "Exact match" },
                  { value: "BEST_RELATED", label: "Best related" },
                  { value: "ADVANCED", label: "Advanced" },
                ]}
              />
            </label>
          </div>

          <label className="text-sm font-semibold">
            Recommendation reason
            <textarea
              className="field mt-1"
              name="reason"
              rows={3}
              defaultValue={recommendation?.reason || ""}
            />
          </label>

          <div className="flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onRerun(attempt)}
            >
              <RefreshCw size={15} />
              Rerun AI
            </button>

            <div className="flex gap-2">
              <button className="btn btn-secondary">Save Draft</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (form) void onSubmit(form, true);
                }}
              >
                <Send size={15} />
                Save & Publish
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ResultModal({
  attempt,
  onClose,
}: {
  attempt: Attempt | null;
  onClose: () => void;
}) {
  const analysis = attempt?.analysis;
  const isDiscovery = attempt?.quiz_type === "SKILL_DISCOVERY";
  const fallback = "-";

  return (
    <Modal
      open={Boolean(attempt)}
      title={`Published Advisor Result${attempt ? `: ${attempt.student_name}` : ""}`}
      onCloseAction={onClose}
      size="wide"
    >
      {attempt && analysis && (
        <div className="space-y-5">
          {/* High-level stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <span className="muted text-sm">Assessment</span>
              <strong className="mt-1 block">{attempt.quiz_title}</strong>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-3">
              <span className="muted text-sm">Score</span>
              <strong className="mt-1 block">
                {attemptScore(attempt)} ({attempt.percentage}%)
              </strong>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-3">
              <span className="muted text-sm">Published</span>
              <strong className="mt-1 block">{date(attempt.published_at)}</strong>
            </div>
          </div>

          {/* Summary */}
          <section>
            <h3 className="font-bold">Summary</h3>
            <p className="mt-2">{analysis.summary || "No summary provided."}</p>
          </section>

          {/* Profile & Strengths/Gaps */}
          <div className={isDiscovery ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
            <section className="rounded-lg border border-[var(--border)] p-4">
              <h3 className="font-bold">Assessment profile</h3>
              {!isDiscovery && (
                <p className="mt-2">
                  <strong>Selected field:</strong> {analysis.strongest_field_name || fallback}
                </p>
              )}
              <p className="mt-2">
                <strong>{isDiscovery ? "Strongest skill:" : "Strongest skills:"}</strong>{" "}
                {toTextList(analysis.strongest_skill_names).join(", ") || fallback}
              </p>
              <p className="mt-2">
                <strong>Level:</strong> {label(analysis.level)}
              </p>
            </section>

            <section className="rounded-lg border border-[var(--border)] p-4">
              <h3 className="font-bold">{isDiscovery ? "Strengths" : "Strengths and gaps"}</h3>
              <p className="mt-2">
                <strong>Strengths:</strong>{" "}
                {toTextList(analysis.strengths).join(", ") || fallback}
              </p>
              {!isDiscovery && (
                <p className="mt-2">
                  <strong>Gaps:</strong> {toTextList(analysis.gaps).join(", ") || fallback}
                </p>
              )}
            </section>
          </div>

          {/* Field breakdown scores */}
          {!isDiscovery && analysis.field_scores?.length > 0 && (
            <section>
              <h3 className="font-bold">Field scores</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {analysis.field_scores.map((score, index) => (
                  <div
                    key={`${score.field || index}`}
                    className="rounded-lg border border-[var(--border)] p-3"
                  >
                    <strong>{score.field_name || `Field ${score.field || index + 1}`}</strong>
                    <span className="float-right">
                      {score.percentage ?? score.score ?? 0}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recommendations */}
          <section>
            <h3 className="font-bold">
              {isDiscovery ? "Recommended Course" : "Course recommendations"}
            </h3>
            <div className="mt-2">
              <AdvisorRecommendationCards recommendations={analysis.recommendations} />
            </div>
          </section>

          {/* Submitted answers */}
          <section>
            <h3 className="font-bold">Submitted answers</h3>
            <div className="mt-3 space-y-3">
              {attempt.answers.length ? (
                attempt.answers.map((answer) => (
                  <article
                    key={answer.question_id}
                    className="rounded-lg border border-[var(--border)] p-4"
                  >
                    <strong>{answer.prompt}</strong>
                    <p className="mt-2">
                      <span className="muted">Submitted:</span>{" "}
                      {answer.submitted_answer || "No answer"}
                    </p>
                    {answer.correct_answer !== null && (
                      <p className="mt-1">
                        <span className="muted">Correct answer:</span> {answer.correct_answer}
                      </p>
                    )}
                    <p className="mt-1">
                      <span className="muted">Points:</span> {answer.awarded_points} /{" "}
                      {answer.max_points}
                    </p>
                    {answer.ai_feedback && (
                      <p className="mt-2 rounded-lg bg-[var(--background)] p-3 text-sm">
                        {answer.ai_feedback}
                      </p>
                    )}
                  </article>
                ))
              ) : (
                <p className="muted">No answer details available.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
