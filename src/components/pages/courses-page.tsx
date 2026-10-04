"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Eye,
  GraduationCap,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Category, Course, CourseManagementOverview, Enrollment } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import {
  Empty,
  ErrorMessage,
  Loading,
  LoadingModal,
  Modal,
  PageHeader,
} from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";
import { AdminCoursesWorkspace } from "@/components/pages/admin-courses-workspace";
import { InstructorCoursesWorkspace } from "@/components/pages/instructor-courses-workspace";

const LEVEL_OPTIONS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const TYPE_OPTIONS = [
  { value: "FREE", label: "Free" },
  { value: "PAID", label: "Paid" },
];

const bdtFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function AdminLandingDashboard({
  onSelectWorkspace,
  onOpenNewCourseModal,
}: {
  onSelectWorkspace: (ws: "admin" | "instructors") => void;
  onOpenNewCourseModal: () => void;
}) {
  const { data: overview, loading: statsLoading, error: statsError } =
    useApiData<CourseManagementOverview>("/course-management/overview/");
  const { data: recentCoursesData } =
    useApiData<Course[] | { results: Course[] }>("/courses/");

  const courses = recentCoursesData ? unwrap(recentCoursesData) : [];
  const adminOwnedCount = courses.filter((c) => !c.instructor).length;
  const instructorOwnedCount = courses.filter((c) => Boolean(c.instructor)).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Course Management"
        description="Platform curriculum oversight, administrative workspaces, and instructor directory."
        action={
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            onClick={onOpenNewCourseModal}
          >
            <Plus size={16} />
            New course
          </button>
        }
      />

      {/* Live Statistics Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel skeleton h-28 p-5" />
          ))}
        </div>
      ) : statsError ? (
        <ErrorMessage message={statsError} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Courses */}
          <article className="panel relative space-y-3 overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Total Courses
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]">
                <BookOpen size={18} />
              </div>
            </div>
            <div>
              <strong className="block text-2xl font-extrabold text-[var(--foreground)]">
                {overview?.total_courses ?? 0}
              </strong>
              <span className="mt-1 block text-xs text-[var(--muted)]">
                <strong>{overview?.courses_this_month ?? 0}</strong> created this month
              </span>
            </div>
          </article>

          {/* Active Instructors */}
          <article className="panel relative space-y-3 overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Active Instructors
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]">
                <Users size={18} />
              </div>
            </div>
            <div>
              <strong className="block text-2xl font-extrabold text-[var(--foreground)]">
                {overview?.active_instructors ?? 0}
              </strong>
              <span className="mt-1 block text-xs text-[var(--muted)]">
                <strong>{overview?.instructor_departments ?? 0}</strong> departments represented
              </span>
            </div>
          </article>

          {/* Enrolled Students */}
          <article className="panel relative space-y-3 overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Enrolled Students
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]">
                <GraduationCap size={18} />
              </div>
            </div>
            <div>
              <strong className="block text-2xl font-extrabold text-[var(--foreground)]">
                {overview?.enrolled_students ?? 0}
              </strong>
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Distinct student enrollments
              </span>
            </div>
          </article>

          {/* Published Rate */}
          <article className="panel relative space-y-3 overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Published Rate
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]">
                <TrendingUp size={18} />
              </div>
            </div>
            <div>
              <strong className="block text-2xl font-extrabold text-[var(--foreground)]">
                {overview?.published_rate ?? 0}%
              </strong>
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Live on student catalog
              </span>
            </div>
          </article>
        </div>
      )}

      {/* Workspace Navigation Cards */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            Management Workspaces
          </h2>
          <p className="muted mt-0.5 text-xs">
            Select a workspace to manage platform courses or audit instructor curriculum.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Card 1: Admin Workspace */}
          <article className="panel group flex flex-col justify-between rounded-2xl border-2 bg-[var(--surface)] p-6 shadow-md transition-all hover:border-[var(--primary)]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="badge border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-xs font-bold text-[var(--primary)]">
                  <Shield size={13} className="mr-1 inline" /> Full Control
                </span>
                <span className="muted text-xs font-medium">
                  {adminOwnedCount} {adminOwnedCount === 1 ? "course" : "courses"}
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-[var(--foreground)] transition-colors group-hover:text-[var(--primary)]">
                  Course Management: Admin
                </h3>
                <p className="muted mt-2 line-clamp-2 text-sm">
                  Create, configure, and publish platform-owned courses. Manage curriculum files, set enrollment pricing, and control publication status.
                </p>
              </div>

              <div className="muted space-y-2 border-t border-[var(--border)] pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[var(--primary)]" />
                  <span>Create & edit platform courses</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[var(--primary)]" />
                  <span>Upload learning materials and structured notes</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[var(--primary)]" />
                  <span>Set free or paid enrollment pricing</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-6">
              <button
                type="button"
                onClick={() => onSelectWorkspace("admin")}
                className="btn btn-primary inline-flex w-full items-center justify-center gap-2 text-sm font-semibold"
              >
                <ArrowRight size={16} />
                Enter Admin Workspace
              </button>
            </div>
          </article>

          {/* Card 2: Instructor Workspace */}
          <article className="panel group flex flex-col justify-between rounded-2xl border-2 bg-[var(--surface)] p-6 shadow-md transition-all hover:border-[var(--accent)]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="badge border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-xs font-bold text-[var(--warning)]">
                  <Lock size={13} className="mr-1 inline" /> Read-only Oversight
                </span>
                <span className="muted text-xs font-medium">
                  {instructorOwnedCount} {instructorOwnedCount === 1 ? "course" : "courses"}
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-[var(--foreground)] transition-colors group-hover:text-[var(--accent)]">
                  Instructor Course Management
                </h3>
                <p className="muted mt-2 line-clamp-2 text-sm">
                  Inspect instructor-led courses, audit uploaded learning materials, and review student quiz evaluations and performance without mutating content.
                </p>
              </div>

              <div className="muted space-y-2 border-t border-[var(--border)] pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[var(--accent)]" />
                  <span>Browse instructor directory and faculty profiles</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[var(--accent)]" />
                  <span>Inspect learning materials and lecture videos</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[var(--accent)]" />
                  <span>Audit quiz questions and student attempt scores</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-6">
              <button
                type="button"
                onClick={() => onSelectWorkspace("instructors")}
                className="btn btn-secondary inline-flex w-full items-center justify-center gap-2 text-sm font-semibold group-hover:border-[var(--accent)]"
              >
                <ArrowRight size={16} />
                Enter Instructor Workspace
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function CoursesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = searchParams?.get("workspace");
  const { user } = useAuth();
  const { confirm: confirmDialog, notify, prompt: promptDialog } = useFeedbackDialog();

  const { data, loading, error, reload } =
    useApiData<Course[] | { results: Course[] }>("/courses/");
  const categories =
    useApiData<Category[] | { results: Category[] }>("/categories/");
  const enrollmentResult = useApiData<Enrollment[] | { results: Enrollment[] }>(
    user?.role === "STUDENT" ? "/enrollments/" : null
  );

  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formError, setFormError] = useState("");
  const [enrollingCourseId, setEnrollingCourseId] = useState<number | null>(null);
  const [busyMessage, setBusyMessage] = useState("");
  const [courseType, setCourseType] = useState<"FREE" | "PAID">("FREE");
  const [studentCourseTab, setStudentCourseTab] = useState<"all" | "my">("all");
  const [enrolledFilter, setEnrolledFilter] = useState<"all" | "not-enrolled" | "enrolled">("all");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [studentCategoryFilter, setStudentCategoryFilter] = useState("");

  const courses = data ? unwrap(data) : [];
  const enrollments = enrollmentResult.data ? unwrap(enrollmentResult.data) : [];
  const enrollmentByCourse = new Map(enrollments.map((item) => [item.course, item]));

  const categoryList = categories.data ? unwrap(categories.data) : [];
  const studentCategoryOptions = [
    { value: "", label: "All categories" },
    ...categoryList.map((cat) => ({ value: String(cat.id), label: cat.name })),
  ];

  const enrolledCount = enrollments.length;
  const availableToEnrollCount = courses.filter((c) => !c.is_enrolled).length;

  const visibleCourses = user?.role === "STUDENT"
    ? courses.filter((course) => {
        if (studentCourseTab === "my" && !course.is_enrolled) {
          return false;
        }
        if (studentCourseTab === "all") {
          if (enrolledFilter === "enrolled" && !course.is_enrolled) {
            return false;
          }
          if (enrolledFilter === "not-enrolled" && course.is_enrolled) {
            return false;
          }
        }
        if (studentCategoryFilter && String(course.category) !== studentCategoryFilter) {
          return false;
        }
        if (studentSearchQuery.trim()) {
          const query = studentSearchQuery.toLowerCase().trim();
          const matchTitle = course.title?.toLowerCase().includes(query);
          const matchCode = course.course_code?.toLowerCase().includes(query);
          const matchInstructor = course.instructor_name?.toLowerCase().includes(query);
          const matchDesc = course.description?.toLowerCase().includes(query);
          if (!matchTitle && !matchCode && !matchInstructor && !matchDesc) {
            return false;
          }
        }
        return true;
      })
    : courses;

  const hasActiveFilters = Boolean(
    studentSearchQuery.trim() ||
    studentCategoryFilter ||
    (studentCourseTab === "all" && enrolledFilter !== "all")
  );

  function handleResetStudentFilters() {
    setStudentSearchQuery("");
    setStudentCategoryFilter("");
    setEnrolledFilter("all");
  }

  function openNewCourseModal() {
    setEditingCourse(null);
    setCourseType("FREE");
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditCourseModal(course: Course) {
    setEditingCourse(course);
    setCourseType(course.course_type);
    setFormError("");
    setIsModalOpen(true);
  }

  function closeCourseModal() {
    setIsModalOpen(false);
    setEditingCourse(null);
    setFormError("");
  }

  async function handleSaveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const thumbnail = formData.get("thumbnail");

    if (thumbnail instanceof File && thumbnail.size === 0) {
      formData.delete("thumbnail");
    }

    try {
      setBusyMessage(editingCourse ? "Saving course..." : "Creating course...");

      if (editingCourse) {
        await api(`/courses/${editingCourse.id}/`, {
          method: "PATCH",
          body: formData,
        });
      } else {
        await api("/courses/", {
          method: "POST",
          body: formData,
        });
      }

      closeCourseModal();
      await reload();
      void notify(editingCourse ? "Course updated." : "Course created.", {
        tone: "success",
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save course");
    } finally {
      setBusyMessage("");
    }
  }

  async function handleCreateCategory() {
    const name = await promptDialog("Choose a name for the new category.", {
      title: "Create category",
      placeholder: "Category name",
      confirmLabel: "Create category",
    });

    if (!name) return;

    try {
      setBusyMessage("Creating category...");
      await api("/categories/", {
        method: "POST",
        body: jsonBody({ name }),
      });
      await categories.reload();
      void notify("Category created.", { tone: "success" });
    } catch (err) {
      void notify(err instanceof Error ? err.message : "Unable to create category", {
        tone: "error",
      });
    } finally {
      setBusyMessage("");
    }
  }

  async function handleRemoveCourse(id: number) {
    const isConfirmed = await confirmDialog(
      "This will permanently delete this course and its materials. If students have completed payments or earned certificates in this course, deletion will be protected to maintain academic records.",
      {
        title: "Delete course?",
        confirmLabel: "Delete course",
        tone: "error",
      }
    );

    if (!isConfirmed) return;

    try {
      setBusyMessage("Deleting course...");
      await api(`/courses/${id}/`, { method: "DELETE" });
      await reload();
      void notify("Course deleted.", { tone: "success" });
    } catch (err) {
      void notify(err instanceof Error ? err.message : "Unable to delete course", {
        tone: "error",
      });
    } finally {
      setBusyMessage("");
    }
  }

  async function handleEnroll(id: number) {
    setEnrollingCourseId(id);
    try {
      setBusyMessage("Confirming enrollment...");
      await api("/enrollments/", {
        method: "POST",
        body: jsonBody({ course: id }),
      });
      await reload();
      await enrollmentResult.reload();
      void notify("Enrollment confirmed.", {
        title: "Enrollment confirmed",
        tone: "success",
      });
    } catch (err) {
      void notify(err instanceof Error ? err.message : "Unable to enroll", {
        tone: "error",
      });
    } finally {
      setEnrollingCourseId(null);
      setBusyMessage("");
    }
  }

  // Admin routing to dedicated sub-workspaces
  if (user?.role === "ADMIN") {
    if (workspace === "admin") {
      return <AdminCoursesWorkspace onBack={() => router.push("/courses")} />;
    }

    if (workspace === "instructors") {
      return (
        <InstructorCoursesWorkspace onBack={() => router.push("/courses")} />
      );
    }

    return (
      <>
        <LoadingModal
          open={Boolean(busyMessage)}
          title="Please wait"
          message={busyMessage}
        />

        <AdminLandingDashboard
          onSelectWorkspace={(ws) => router.push(`/courses?workspace=${ws}`)}
          onOpenNewCourseModal={openNewCourseModal}
        />

        {/* Global Modal for Course Creation */}
        <Modal
          open={isModalOpen}
          title={editingCourse ? "Edit course" : "Create course"}
          onCloseAction={closeCourseModal}
        >
          <form
            key={editingCourse?.id ?? "new"}
            onSubmit={handleSaveCourse}
            className="space-y-4 p-4"
            encType="multipart/form-data"
          >
            <input
              className="field"
              name="title"
              placeholder="Course title"
              defaultValue={editingCourse?.title ?? ""}
              required
            />

            <label className="block space-y-1">
              <span className="text-sm font-semibold">Course code</span>
              <input
                className="field"
                name="course_code"
                placeholder="Auto-generate, or set one like CSE-201"
                defaultValue={editingCourse?.course_code ?? ""}
              />
            </label>

            <textarea
              className="field"
              name="description"
              placeholder="Description"
              rows={4}
              defaultValue={editingCourse?.description ?? ""}
              required
            />

            <div className="flex gap-2">
              <ModernSelect
                className="field flex-1"
                name="category"
                placeholder="Select Category"
                defaultValue={
                  editingCourse ? String(editingCourse.category) : undefined
                }
                required
                options={
                  categories.data
                    ? unwrap(categories.data).map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))
                    : []
                }
              />
              <button
                type="button"
                className="btn btn-secondary shrink-0"
                onClick={() => void handleCreateCategory()}
              >
                <Plus size={14} /> Add Category
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ModernSelect
                className="field"
                name="level"
                aria-label="Course level"
                defaultValue={editingCourse?.level ?? "BEGINNER"}
                options={LEVEL_OPTIONS}
              />
              <ModernSelect
                className="field"
                name="status"
                aria-label="Course status"
                defaultValue={editingCourse?.status ?? "PUBLISHED"}
                options={STATUS_OPTIONS}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ModernSelect
                className="field"
                name="course_type"
                aria-label="Course type"
                value={courseType}
                onValueChange={(value) => setCourseType(value as "FREE" | "PAID")}
                options={TYPE_OPTIONS}
              />
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Price (BDT)</span>
                <input
                  className="field"
                  name="price"
                  type="number"
                  min={courseType === "PAID" ? "0.01" : "0"}
                  step="0.01"
                  placeholder={courseType === "PAID" ? "e.g. 1500" : "Free course"}
                  defaultValue={editingCourse?.price ?? "0.00"}
                  disabled={courseType === "FREE"}
                  required={courseType === "PAID"}
                />
              </label>
            </div>

            <label className="mt-2 block space-y-1">
              <span className="text-sm font-semibold">Duration (Hours)</span>
              <input
                className="field"
                name="duration_hours"
                type="number"
                min="0"
                defaultValue={editingCourse?.duration_hours ?? 0}
              />
            </label>

            <label className="mt-2 block space-y-1">
              <span className="text-sm font-semibold">Course Image</span>
              <input
                className="field"
                name="thumbnail"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
              />
            </label>

            {formError && <ErrorMessage message={formError} />}

            <div className="mt-4 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeCourseModal}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editingCourse ? "Save Course" : "Create Course"}
              </button>
            </div>
          </form>
        </Modal>
      </>
    );
  }

  // Instructor and Student views
  return (
    <>
      <LoadingModal
        open={Boolean(busyMessage)}
        title="Please wait"
        message={busyMessage}
      />

      <PageHeader
        title="Course Management"
        description="Browse learning content and course categories."
        action={
          user?.role !== "STUDENT" && (
            <button
              type="button"
              className="btn btn-primary inline-flex items-center gap-2"
              onClick={openNewCourseModal}
            >
              <Plus size={16} />
              New course
            </button>
          )
        }
      />

      {loading ? (
        <Loading variant="list" />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : courses.length === 0 ? (
        <Empty message="No courses available." />
      ) : user?.role === "INSTRUCTOR" ? (
        <div className="panel table-wrap">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Course</th>
                <th>Category / Level</th>
                <th>Type / Price</th>
                <th>Status</th>
                <th>Materials</th>
                <th>Students</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr
                  key={course.id}
                  tabIndex={0}
                  className="cursor-pointer transition-colors hover:bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]"
                  aria-label={`Open ${course.title}`}
                  onClick={() => router.push(`/courses/${course.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/courses/${course.id}`);
                    }
                  }}
                >
                  <td>
                    <div className="flex min-w-56 items-center gap-3">
                      {course.thumbnail ? (
                        <img
                          src={course.thumbnail}
                          alt=""
                          className="h-12 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="grid h-12 w-16 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--muted)]">
                          No image
                        </div>
                      )}
                      <div className="min-w-0">
                        <strong className="block truncate text-[var(--foreground)]">
                          {course.title}
                        </strong>
                        <span className="muted mt-1 block text-xs">
                          {course.course_code}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong className="block font-medium">
                      {course.category_detail?.name || "Uncategorized"}
                    </strong>
                    <span className="muted mt-1 block text-xs">
                      {course.level.charAt(0) + course.level.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${course.course_type === "FREE"
                          ? "text-[var(--success)]"
                          : "text-[var(--primary)]"
                        }`}
                    >
                      {course.course_type === "FREE"
                        ? "Free"
                        : bdtFormatter.format(Number(course.price))}
                    </span>
                  </td>
                  <td>
                    <span className="badge">{course.status}</span>
                  </td>
                  <td className="font-semibold">
                    {course.materials?.length || 0}
                  </td>
                  <td className="font-semibold">{course.enrollment_count}</td>
                  <td>
                    <div className="flex min-w-max flex-wrap items-center gap-2">
                      <Link
                        className="btn btn-secondary text-xs"
                        href={`/courses/${course.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditCourseModal(course);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRemoveCourse(course.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          {user?.role === "STUDENT" && (
            <div className="space-y-4">
              {/* Tab Navigation & Enrolled Quick Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Course collection">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studentCourseTab === "all"}
                    className={studentCourseTab === "all" ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => setStudentCourseTab("all")}
                  >
                    All Courses <span className="badge ml-1">{courses.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studentCourseTab === "my"}
                    className={studentCourseTab === "my" ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => setStudentCourseTab("my")}
                  >
                    My Courses <span className="badge ml-1">{enrolledCount}</span>
                  </button>
                </div>

                {/* Quick filter chips when on "All Courses" tab */}
                {studentCourseTab === "all" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--muted)]">Status:</span>
                    <button
                      type="button"
                      className={`btn text-xs py-1.5 px-3 ${enrolledFilter === "all" ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setEnrolledFilter("all")}
                    >
                      All ({courses.length})
                    </button>
                    <button
                      type="button"
                      className={`btn text-xs py-1.5 px-3 ${enrolledFilter === "not-enrolled" ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setEnrolledFilter("not-enrolled")}
                    >
                      Available ({availableToEnrollCount})
                    </button>
                    <button
                      type="button"
                      className={`btn text-xs py-1.5 px-3 ${enrolledFilter === "enrolled" ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setEnrolledFilter("enrolled")}
                    >
                      <CheckCircle2 size={13} />
                      Enrolled ({enrolledCount})
                    </button>
                  </div>
                )}
              </div>

              {/* Search & Category Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative min-w-[260px] flex-1 max-w-md">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--muted)]">
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    className="field !pl-12 text-sm"
                    placeholder="Search courses by title, code, or instructor..."
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ModernSelect
                    className="field min-w-[200px]"
                    aria-label="Filter by category"
                    value={studentCategoryFilter}
                    onValueChange={(val) => setStudentCategoryFilter(val)}
                    options={studentCategoryOptions}
                  />

                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      onClick={handleResetStudentFilters}
                    >
                      <RotateCcw size={13} />
                      Reset filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {user?.role === "STUDENT" && enrollmentResult.error ? (
            <ErrorMessage message={enrollmentResult.error} />
          ) : user?.role === "STUDENT" && studentCourseTab === "my" && enrollmentResult.loading ? (
            <Loading variant="list" />
          ) : visibleCourses.length === 0 ? (
            hasActiveFilters ? (
              <div className="panel flex flex-col items-center justify-center p-8 text-center">
                <BookOpen size={36} className="text-[var(--muted)] mb-2" />
                <h3 className="text-base font-bold text-[var(--foreground)]">No matching courses found</h3>
                <p className="muted mt-1 max-w-md text-sm">
                  No courses matched your current filter criteria. Try clearing the search query or adjusting your filters.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary mt-4 text-xs"
                  onClick={handleResetStudentFilters}
                >
                  <RotateCcw size={13} />
                  Reset all filters
                </button>
              </div>
            ) : (
              <Empty message={studentCourseTab === "my" ? "You have not enrolled in any courses yet. Browse All Courses to get started." : "No courses are currently available in the catalog."} />
            )
          ) : (
          <div className="grid-cards">
          {visibleCourses.map((course) => {
            const enrollment = enrollmentByCourse.get(course.id);
            const progress = enrollment?.progress ?? 0;
            const isCompleted = progress === 100;
            const isStudent = user?.role === "STUDENT";
            const isEnrolled = isStudent && course.is_enrolled;

            return (
            <article
              key={course.id}
              className={`panel relative flex flex-col overflow-hidden transition-all hover:shadow-lg ${
                isEnrolled
                  ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
                  : ""
              }`}
            >
              {/* Top Floating Enrolled Badge on thumbnail for Enrolled Course */}
              {isEnrolled && (
                <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--background)_85%,transparent)] px-2.5 py-1 text-xs font-bold text-[var(--primary)] backdrop-blur-md shadow-sm">
                  {isCompleted ? (
                    <>
                      <Award size={13} />
                      <span>Completed</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} />
                      <span>Enrolled</span>
                    </>
                  )}
                </div>
              )}

              {course.thumbnail ? (
                <img
                  src={course.thumbnail}
                  alt=""
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="muted flex h-40 w-full items-center justify-center bg-slate-200 dark:bg-slate-800">
                  No Image
                </div>
              )}

              <div className="flex flex-1 flex-col p-5">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="badge">{course.course_code}</span>
                  <span className="badge">
                    {course.category_detail?.name || "Uncategorized"}
                  </span>
                  <span
                    className={`badge ${course.course_type === "PAID"
                        ? "text-[var(--primary)]"
                        : "text-[var(--success)]"
                      }`}
                  >
                    {course.course_type === "FREE"
                      ? "Free"
                      : bdtFormatter.format(Number(course.price))}
                  </span>
                  {user?.role !== "STUDENT" && (
                    <span className="badge">{course.status}</span>
                  )}
                </div>

                <h2 className="mt-3 text-lg font-bold">{course.title}</h2>
                <p className="muted mt-2 flex-1 line-clamp-3">
                  {course.description}
                </p>

                <div className="muted mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>{course.instructor_name}</span>
                  <span>
                    {course.level.charAt(0) + course.level.slice(1).toLowerCase()}
                  </span>
                  <span>
                    {course.duration_hours}{" "}
                    {course.duration_hours === 1 ? "hour" : "hours"}
                  </span>
                  <span>{course.enrollment_count} enrolled</span>
                </div>

                {isEnrolled && (
                  <div className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--primary)_25%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_5%,var(--background))] p-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-xs">Course progress</span>
                      <strong className={isCompleted ? "text-[var(--success)] text-xs" : "text-[var(--primary)] text-xs"}>
                        {Math.round(progress)}% {isCompleted ? "(Completed)" : ""}
                      </strong>
                    </div>
                    <progress className="h-2 w-full accent-[var(--primary)]" value={progress} max={100} aria-label={`${course.title} progress`} />
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {isEnrolled ? (
                    <>
                      <Link
                        className="btn btn-primary"
                        href={`/courses/${course.id}`}
                      >
                        {isCompleted ? (
                          <>
                            <RotateCcw size={15} />
                            <span>Review course</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight size={15} />
                            <span>Continue learning</span>
                          </>
                        )}
                      </Link>
                      <Link
                        className="btn btn-secondary text-xs"
                        href={`/courses/${course.id}`}
                        title="View details"
                      >
                        <Eye size={14} />
                        <span>Details</span>
                      </Link>
                    </>
                  ) : isStudent ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={enrollingCourseId === course.id}
                        onClick={() =>
                          course.course_type === "PAID"
                            ? window.location.assign(`/payments?course=${course.id}`)
                            : void handleEnroll(course.id)
                        }
                      >
                        {enrollingCourseId === course.id ? (
                          <span>Enrolling...</span>
                        ) : course.course_type === "PAID" ? (
                          <>
                            <CreditCard size={15} />
                            <span>Submit payment</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight size={15} />
                            <span>Enroll</span>
                          </>
                        )}
                      </button>
                      <Link
                        className="btn btn-secondary"
                        href={`/courses/${course.id}`}
                      >
                        <Eye size={15} />
                        <span>View course</span>
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        className="btn btn-secondary"
                        href={`/courses/${course.id}`}
                      >
                        View course
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => openEditCourseModal(course)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void handleRemoveCourse(course.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          )})}
          </div>
          )}
        </div>
      )}

      {/* Shared Edit/Create Course Modal */}
      <Modal
        open={isModalOpen}
        title={editingCourse ? "Edit course" : "Create course"}
        onCloseAction={closeCourseModal}
      >
        <form
          key={editingCourse?.id ?? "new"}
          onSubmit={handleSaveCourse}
          className="space-y-4 p-4"
          encType="multipart/form-data"
        >
          <input
            className="field"
            name="title"
            placeholder="Course title"
            defaultValue={editingCourse?.title ?? ""}
            required
          />

          <label className="block space-y-1">
            <span className="text-sm font-semibold">Course code</span>
            <input
              className="field"
              name="course_code"
              placeholder="Auto-generate, or set one like CSE-201"
              defaultValue={editingCourse?.course_code ?? ""}
            />
          </label>

          <textarea
            className="field"
            name="description"
            placeholder="Description"
            rows={4}
            defaultValue={editingCourse?.description ?? ""}
            required
          />

          <div className="flex gap-2">
            <ModernSelect
              className="field flex-1"
              name="category"
              placeholder="Select Category"
              defaultValue={
                editingCourse ? String(editingCourse.category) : undefined
              }
              required
              options={
                categories.data
                  ? unwrap(categories.data).map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  }))
                  : []
              }
            />
            {user?.role !== "STUDENT" && (
              <button
                type="button"
                className="btn btn-secondary shrink-0"
                onClick={() => void handleCreateCategory()}
              >
                <Plus size={14} /> Add Category
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModernSelect
              className="field"
              name="level"
              aria-label="Course level"
              defaultValue={editingCourse?.level ?? "BEGINNER"}
              options={LEVEL_OPTIONS}
            />
            <ModernSelect
              className="field"
              name="status"
              aria-label="Course status"
              defaultValue={editingCourse?.status ?? "PUBLISHED"}
              options={STATUS_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModernSelect
              className="field"
              name="course_type"
              aria-label="Course type"
              value={courseType}
              onValueChange={(value) => setCourseType(value as "FREE" | "PAID")}
              options={TYPE_OPTIONS}
            />
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Price (BDT)</span>
              <input
                className="field"
                name="price"
                type="number"
                min={courseType === "PAID" ? "0.01" : "0"}
                step="0.01"
                placeholder={courseType === "PAID" ? "e.g. 1500" : "Free course"}
                defaultValue={editingCourse?.price ?? "0.00"}
                disabled={courseType === "FREE"}
                required={courseType === "PAID"}
              />
            </label>
          </div>

          <label className="mt-2 block space-y-1">
            <span className="text-sm font-semibold">Duration (Hours)</span>
            <input
              className="field"
              name="duration_hours"
              type="number"
              min="0"
              defaultValue={editingCourse?.duration_hours ?? 0}
            />
          </label>

          <label className="mt-2 block space-y-1">
            <span className="text-sm font-semibold">Course Image</span>
            <input
              className="field"
              name="thumbnail"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
            />
          </label>

          {formError && <ErrorMessage message={formError} />}

          <div className="mt-4 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeCourseModal}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingCourse ? "Save Course" : "Create Course"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CoursesPage() {
  return (
    <Suspense fallback={<Loading variant="page" />}>
      <CoursesPageContent />
    </Suspense>
  );
}
