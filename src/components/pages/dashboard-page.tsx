"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Calendar,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleCheckBig,
  Compass,
  FileEdit,
  GraduationCap,
  KeyRound,
  PlusCircle,
  Sparkles,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { PageHeader, Loading, ErrorMessage } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { useApiData } from "@/hooks/use-api-data";
import type { StudentDashboard } from "@/lib/types";

type AdminDashboard = {
  statistics: Record<string, number>;
  recent_activities: {
    id: number;
    actor_name: string;
    action: string;
    details: string;
    created_at: string;
  }[];
};

function getStatCardMeta(key: string) {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey.includes("course") || normalizedKey.includes("curriculum")) {
    return {
      icon: BookOpen,
      iconContainer: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      accentGlow: "from-blue-500/10 to-transparent",
    };
  }

  if (
    normalizedKey.includes("student") ||
    normalizedKey.includes("enroll") ||
    normalizedKey.includes("learner")
  ) {
    return {
      icon: GraduationCap,
      iconContainer: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      accentGlow: "from-emerald-500/10 to-transparent",
    };
  }

  if (
    normalizedKey.includes("instructor") ||
    normalizedKey.includes("user") ||
    normalizedKey.includes("teacher")
  ) {
    return {
      icon: Users,
      iconContainer: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      accentGlow: "from-amber-500/10 to-transparent",
    };
  }

  if (
    normalizedKey.includes("quiz") ||
    normalizedKey.includes("score") ||
    normalizedKey.includes("assessment")
  ) {
    return {
      icon: CircleCheckBig,
      iconContainer: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      accentGlow: "from-purple-500/10 to-transparent",
    };
  }

  if (
    normalizedKey.includes("revenue") ||
    normalizedKey.includes("payment") ||
    normalizedKey.includes("price") ||
    normalizedKey.includes("earning")
  ) {
    return {
      icon: TrendingUp,
      iconContainer: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
      accentGlow: "from-teal-500/10 to-transparent",
    };
  }

  return {
    icon: ChartNoAxesCombined,
    iconContainer: "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)] border-[color-mix(in_srgb,var(--primary)_20%,transparent)]",
    accentGlow: "from-[var(--primary)]/10 to-transparent",
  };
}

function getActivityMeta(action: string) {
  const act = action.toLowerCase();

  if (act.includes("create") || act.includes("add") || act.includes("publish")) {
    return {
      icon: PlusCircle,
      tone: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      badgeTone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    };
  }
  if (act.includes("delete") || act.includes("remove") || act.includes("revoke")) {
    return {
      icon: Trash2,
      tone: "text-rose-500 bg-rose-500/10 border-rose-500/20",
      badgeTone: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    };
  }
  if (act.includes("edit") || act.includes("update") || act.includes("modify")) {
    return {
      icon: FileEdit,
      tone: "text-amber-500 bg-amber-500/10 border-amber-500/20",
      badgeTone: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    };
  }
  if (act.includes("enroll") || act.includes("student") || act.includes("user")) {
    return {
      icon: UserRound,
      tone: "text-blue-500 bg-blue-500/10 border-blue-500/20",
      badgeTone: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    };
  }
  if (act.includes("quiz") || act.includes("score") || act.includes("certificate")) {
    return {
      icon: GraduationCap,
      tone: "text-purple-500 bg-purple-500/10 border-purple-500/20",
      badgeTone: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    };
  }
  if (act.includes("auth") || act.includes("login") || act.includes("password")) {
    return {
      icon: KeyRound,
      tone: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
      badgeTone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    };
  }

  return {
    icon: Activity,
    tone: "text-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] border-[color-mix(in_srgb,var(--primary)_25%,transparent)]",
    badgeTone: "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] border-[color-mix(in_srgb,var(--primary)_20%,transparent)]",
  };
}

function ManagementDashboardContent({
  data,
  title,
}: {
  data: AdminDashboard;
  title: string;
}) {
  return (
    <>
      {/* Redesigned Statistics Grid Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(data.statistics).map(([key, value]) => {
          const meta = getStatCardMeta(key);
          const StatIcon = meta.icon;
          const formattedLabel = key.replaceAll("_", " ").toUpperCase();

          return (
            <article
              key={key}
              className="panel relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* Subtle top-corner gradient glow */}
              <div
                className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${meta.accentGlow} blur-2xl`}
                aria-hidden="true"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-[var(--muted)]">
                  {formattedLabel}
                </span>
                <div
                  className={`grid h-10 w-10 place-items-center rounded-xl border shadow-xs ${meta.iconContainer}`}
                >
                  <StatIcon size={19} />
                </div>
              </div>

              <div className="mt-3">
                <div className="text-3xl font-black tracking-tight text-[var(--foreground)]">
                  {typeof value === "number" ? value.toLocaleString() : value}
                </div>
                <p className="muted mt-1 text-[11px] font-medium">
                  Platform aggregated metric
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {/* Redesigned Recent Activities Section */}
      <section className="panel overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)]/40 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--foreground)]">
                {title}
              </h2>
              <p className="muted text-xs">
                Real-time audit log and platform event tracking
              </p>
            </div>
          </div>

          <span className="badge rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
            {data.recent_activities.length} Events Logged
          </span>
        </div>

        {/* Activity Stream */}
        {data.recent_activities.length > 0 ? (
          <div className="relative p-6">
            {/* Continuous timeline line */}
            <div
              className="absolute bottom-8 left-[39px] top-8 w-px bg-gradient-to-b from-[var(--border)] via-[var(--border)] to-transparent"
              aria-hidden="true"
            />

            <div className="space-y-4">
              {data.recent_activities.map((activity) => {
                const { icon: ActivityIcon, tone, badgeTone } = getActivityMeta(
                  activity.action
                );
                const activityDate = new Date(activity.created_at);

                return (
                  <article
                    key={activity.id}
                    className="group relative flex items-start gap-4 rounded-xl border border-transparent p-3.5 transition-all duration-200 hover:border-[var(--border)] hover:bg-[var(--background)]/60"
                  >
                    {/* Activity Icon Indicator */}
                    <div
                      className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg border shadow-xs transition-transform duration-200 group-hover:scale-110 ${tone}`}
                    >
                      <ActivityIcon size={16} />
                    </div>

                    {/* Content Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm font-semibold text-[var(--foreground)]">
                            {activity.actor_name}
                          </strong>
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide ${badgeTone}`}
                          >
                            {activity.action.toLowerCase()}
                          </span>
                        </div>

                        {/* Formatted Timestamp */}
                        <div className="muted flex items-center gap-1.5 text-xs font-medium">
                          <Calendar size={12} className="opacity-70" />
                          <time dateTime={activity.created_at}>
                            {activityDate.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            •{" "}
                            {activityDate.toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      </div>

                      {/* Log Note / Description */}
                      <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]/80">
                        {activity.details}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="muted flex flex-col items-center justify-center gap-2.5 py-12 text-center text-sm">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-[var(--border)] bg-[var(--background)] text-[var(--muted)]">
              <Sparkles size={20} />
            </div>
            <strong>No recent activity</strong>
            <p className="max-w-xs text-xs">
              Actions taken across courses, users, and settings will appear here automatically.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function StudentDashboardContent({ data }: { data: StudentDashboard }) {
  const average = Number(data.statistics.quiz_average);

  const summaryCards = [
    {
      label: "Enrolled Courses",
      value: data.statistics.enrolled_courses,
      detail: "Active courses",
      icon: <BookOpen size={22} />,
      tone: "blue",
    },
    {
      label: "Completed Materials",
      value: data.statistics.completed_materials,
      detail: "Total completed",
      icon: <CircleCheckBig size={22} />,
      tone: "green",
    },
    {
      label: "Average Quiz Score",
      value: `${average.toFixed(1)}%`,
      detail: "Published results",
      icon: <ChartNoAxesCombined size={22} />,
      tone: "purple",
    },
    {
      label: "Learning Path Advisor",
      value: "AI",
      detail: "Discover or develop skills",
      icon: <Compass size={22} />,
      tone: "amber",
    },
  ];

  return (
    <>
      <div className="dashboard-stats">
        {summaryCards.map((card) => (
          <article className="dashboard-stat panel" key={card.label}>
            <div className={`dashboard-stat-icon dashboard-stat-icon-${card.tone}`}>
              {card.icon}
            </div>
            <div>
              <p className="muted text-sm font-medium">{card.label}</p>
              <p className="dashboard-stat-value">{card.value}</p>
              <p className="muted text-xs mt-0.5">{card.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="dashboard-layout">
        {/* Main Courses Section */}
        <section className="panel dashboard-section dashboard-courses">
          <div className="dashboard-section-header">
            <div>
              <h2 className="text-xl font-bold">My Courses</h2>
              <p className="muted text-sm mt-1">Pick up where you left off.</p>
            </div>
            <Link href="/courses" className="btn btn-secondary">
              Browse Courses
            </Link>
          </div>

          {data.courses.length > 0 ? (
            <div
              className={`dashboard-course-list ${data.courses.length > 3 ? "is-scrollable" : ""
                }`}
              aria-label={`${data.courses.length} enrolled ${data.courses.length === 1 ? "course" : "courses"
                }`}
            >
              {data.courses.map((course) => {
                const completion = Math.min(
                  100,
                  Math.max(0, Number(course.completion))
                );

                return (
                  <article className="dashboard-course" key={course.course_id}>
                    {course.thumbnail ? (
                      <img
                        className="dashboard-course-image"
                        src={course.thumbnail}
                        alt=""
                      />
                    ) : (
                      <div
                        className="dashboard-course-image dashboard-course-placeholder"
                        aria-hidden="true"
                      >
                        <BookOpen size={30} />
                      </div>
                    )}

                    <div className="dashboard-course-copy">
                      <div className="flex flex-wrap gap-2 mb-2">
                        <span className="badge">{course.course_code}</span>
                        <span className="badge">{course.category}</span>
                        <span className="dashboard-level">{course.level}</span>
                      </div>
                      <h3 className="font-bold text-lg">{course.title}</h3>
                      <p className="muted text-sm mt-1 line-clamp-2">
                        {course.description}
                      </p>
                      <p className="muted text-xs mt-2">
                        {course.completed_materials} of {course.total_materials}{" "}
                        materials completed
                      </p>
                    </div>

                    <div className="dashboard-course-progress">
                      <div className="flex justify-between items-center gap-4 text-sm mb-2">
                        <span className="muted font-medium">Progress</span>
                        <strong className="text-[var(--primary)]">
                          {completion.toFixed(0)}%
                        </strong>
                      </div>
                      <progress
                        value={completion}
                        max="100"
                        aria-label={`${course.title} progress`}
                      />
                      <Link
                        className="btn btn-primary mt-4 w-full"
                        href={`/courses/${course.course_id}`}
                      >
                        <ArrowRight size={16} />
                        Continue Learning
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <BookOpen size={30} />
              <strong>No courses yet</strong>
              <p className="muted text-sm">
                Browse the catalog and enroll to start learning.
              </p>
              <Link href="/courses" className="btn btn-primary mt-2">
                Browse Courses
              </Link>
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="dashboard-side-column">
          <section className="panel dashboard-section">
            <div className="dashboard-section-header">
              <div>
                <h2 className="text-xl font-bold">AI Learning Path Advisor</h2>
                <p className="muted text-sm mt-1">
                  Choose Skill Discovery or Skill Development.
                </p>
              </div>
              <Compass className="text-[var(--primary)]" size={21} />
            </div>
            <p className="muted text-sm">
              Take one assessment and receive an admin-reviewed AI analysis of
              your strengths, gaps, and best available course.
            </p>
            <Link href="/learning-path" className="dashboard-text-link">
              <ArrowRight size={15} />
              Open Learning Path Advisor
            </Link>
          </section>

          <section className="panel dashboard-section">
            <div className="dashboard-section-header">
              <div>
                <h2 className="text-xl font-bold">Recent Results</h2>
                <p className="muted text-sm mt-1">
                  Your latest published quiz scores.
                </p>
              </div>
              <CheckCircle2 className="text-[var(--success)]" size={21} />
            </div>

            {data.recent_results.length > 0 ? (
              <div className="dashboard-result-list">
                {data.recent_results.map((result) => (
                  <Link
                    key={result.id}
                    className="dashboard-result"
                    href={`/quizzes/${result.quiz_id}`}
                  >
                    <div
                      className={`dashboard-result-icon ${result.passed ? "is-passed" : "is-failed"
                        }`}
                    >
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">
                        {result.quiz_title}
                      </p>
                      <p className="muted text-xs mt-0.5 truncate">
                        {result.course_title}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong
                        className={
                          result.passed
                            ? "text-[var(--success)]"
                            : "text-[var(--danger)]"
                        }
                      >
                        {Number(result.percentage).toFixed(0)}%
                      </strong>
                      <p className="muted text-[11px] mt-0.5">
                        {new Date(result.completed_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty dashboard-empty-compact">
                <ChartNoAxesCombined size={26} />
                <strong>No published results</strong>
                <p className="muted text-sm">
                  Completed quiz results will appear here.
                </p>
              </div>
            )}

            <Link href="/quizzes" className="dashboard-text-link">
              <ArrowRight size={15} />
              View all quizzes
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

export function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error } = useApiData<StudentDashboard | AdminDashboard>(
    user ? "/dashboard/" : null
  );

  if (authLoading || loading) return <Loading variant="dashboard" />;
  if (error || !data) {
    return <ErrorMessage message={error || "Dashboard data is unavailable."} />;
  }

  const isStudent = user?.role === "STUDENT";
  const isAdmin = user?.role === "ADMIN";

  const headerTitle = isStudent
    ? `Welcome back, ${user?.first_name || user?.name || "Student"}!`
    : `${isAdmin ? "Admin" : "Instructor"} Dashboard`;

  const headerDescription = isStudent
    ? "Keep up the momentum and continue your learning journey."
    : `Welcome back, ${user?.name || "PyLearn user"}.`;

  return (
    <div className="space-y-6">
      <PageHeader title={headerTitle} description={headerDescription} />

      {isStudent ? (
        <StudentDashboardContent data={data as StudentDashboard} />
      ) : (
        <ManagementDashboardContent
          data={data as AdminDashboard}
          title={isAdmin ? "Recent Activities" : "Your Recent Activity"}
        />
      )}
    </div>
  );
}
