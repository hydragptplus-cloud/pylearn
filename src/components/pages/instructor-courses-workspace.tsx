"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  Eye,
  FileText,
  HelpCircle,
  Info,
  Lock,
  Search,
  Users,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  InstructorCourseItem,
  InstructorCourseMaterial,
  InstructorCourseQuiz,
  InstructorCoursesResponse,
  InstructorListItem,
  InstructorQuizResultsResponse,
} from "@/lib/types";
import { Empty, ErrorMessage, Loading, Modal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";

const bdtFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-indigo-600 to-blue-600",
  "from-emerald-500 to-teal-700",
  "from-amber-500 to-orange-600",
  "from-purple-600 to-violet-700",
  "from-rose-500 to-pink-600",
  "from-cyan-600 to-sky-700",
];

export function InstructorCoursesWorkspace({ onBack }: { onBack?: () => void }) {
  const { data: instructors, loading, error } = useApiData<InstructorListItem[]>(
    "/course-management/instructors/"
  );

  const [selectedInstructorId, setSelectedInstructorId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");

  // Inspection modal state
  const [inspectingCourse, setInspectingCourse] = useState<InstructorCourseItem | null>(null);
  const [activeTab, setActiveTab] = useState<"materials" | "quizzes">("materials");
  const [materialsData, setMaterialsData] = useState<InstructorCourseMaterial[] | null>(null);
  const [quizzesData, setQuizzesData] = useState<InstructorCourseQuiz[] | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");

  // Quiz Results Inspection state
  const [inspectingQuiz, setInspectingQuiz] = useState<InstructorCourseQuiz | null>(null);
  const [quizResultsData, setQuizResultsData] = useState<InstructorQuizResultsResponse | null>(null);
  const [quizResultsLoading, setQuizResultsLoading] = useState(false);
  const [quizResultsError, setQuizResultsError] = useState("");

  // Selected instructor detail hook
  const {
    data: instructorCoursesData,
    loading: instructorCoursesLoading,
    error: instructorCoursesError,
  } = useApiData<InstructorCoursesResponse>(
    selectedInstructorId ? `/course-management/instructors/${selectedInstructorId}/courses/` : null
  );

  const instructorList = useMemo(() => instructors || [], [instructors]);

  // Distinct departments
  const departments = useMemo(() => {
    const set = new Set<string>();
    instructorList.forEach((inst) => {
      if (inst.department) set.add(inst.department);
    });
    return Array.from(set).sort();
  }, [instructorList]);

  const deptOptions = useMemo(() => {
    return [
      { value: "ALL", label: "All Departments" },
      ...departments.map((dept) => ({ value: dept, label: dept })),
    ];
  }, [departments]);

  const filteredInstructors = useMemo(() => {
    return instructorList.filter((inst) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = inst.name.toLowerCase().includes(q);
        const matchesEmail = inst.email.toLowerCase().includes(q);
        const matchesDept = (inst.department || "").toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesDept) return false;
      }

      if (selectedDept !== "ALL" && inst.department !== selectedDept) {
        return false;
      }

      return true;
    });
  }, [instructorList, searchQuery, selectedDept]);

  async function handleOpenCourseInspection(course: InstructorCourseItem) {
    if (!selectedInstructorId) return;
    setInspectingCourse(course);
    setActiveTab("materials");
    setContentLoading(true);
    setContentError("");

    try {
      const [mats, qzs] = await Promise.all([
        api<InstructorCourseMaterial[]>(
          `/course-management/instructors/${selectedInstructorId}/courses/${course.id}/materials/`
        ),
        api<InstructorCourseQuiz[]>(
          `/course-management/instructors/${selectedInstructorId}/courses/${course.id}/quizzes/`
        ),
      ]);
      setMaterialsData(mats);
      setQuizzesData(qzs);
    } catch (err) {
      setContentError(err instanceof Error ? err.message : "Unable to load course content details.");
    } finally {
      setContentLoading(false);
    }
  }

  async function handleOpenQuizResults(quiz: InstructorCourseQuiz) {
    if (!selectedInstructorId || !inspectingCourse) return;
    setInspectingQuiz(quiz);
    setQuizResultsLoading(true);
    setQuizResultsError("");

    try {
      const results = await api<InstructorQuizResultsResponse>(
        `/course-management/instructors/${selectedInstructorId}/courses/${inspectingCourse.id}/quizzes/${quiz.id}/results/`
      );
      setQuizResultsData(results);
    } catch (err) {
      setQuizResultsError(err instanceof Error ? err.message : "Unable to load quiz evaluations.");
    } finally {
      setQuizResultsLoading(false);
    }
  }

  return (
    <>
      {/* Top Header & Breadcrumb */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={
              selectedInstructorId
                ? () => setSelectedInstructorId(null)
                : onBack || (() => window.history.back())
            }
            className="btn btn-secondary text-sm inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            {selectedInstructorId ? "Back to Instructors" : "Back to Overview"}
          </button>
          <div className="flex items-center gap-2">
            <span className="badge font-medium text-xs bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)]">
              <Lock size={13} className="mr-1 inline" /> Read-only Oversight
            </span>
          </div>
        </div>

        <PageHeader
          title={
            selectedInstructorId
              ? `Instructor Curriculum: ${instructorCoursesData?.instructor.name || "Loading..."}`
              : "Instructor Course Management"
          }
          description={
            selectedInstructorId
              ? "Audit courses, learning materials, and student quiz results created by this instructor."
              : "Read-only oversight across instructor-managed courses, curriculum structure, and student evaluations."
          }
        />
      </div>

      {/* READ-ONLY BANNER */}
      <div className="panel p-4 bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] border border-[color-mix(in_srgb,var(--primary)_20%,transparent)] flex items-start gap-3 rounded-xl">
        <Info className="text-[var(--primary)] shrink-0 mt-0.5" size={18} />
        <div className="text-sm space-y-1">
          <strong className="text-[var(--foreground)] block">Read-only Administrative Oversight</strong>
          <p className="text-[var(--muted)]">
            Instructor-owned courses, materials, and quizzes are maintained directly by their assigned instructors.
            Administrators have full audit visibility across curriculum content and student evaluations, while content alterations remain protected.
          </p>
        </div>
      </div>

      {/* VIEW 1: INSTRUCTOR DIRECTORY */}
      {!selectedInstructorId && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="panel p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative sm:col-span-2">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search by instructor name, email, or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="field w-full !pl-12 text-sm"
                />
              </div>

              <ModernSelect
                className="field text-sm"
                value={selectedDept}
                onValueChange={(val) => setSelectedDept(val)}
                options={deptOptions}
                aria-label="Filter by department"
              />
            </div>

            <div className="flex items-center justify-between text-xs muted pt-1">
              <span>
                Showing <strong>{filteredInstructors.length}</strong> of <strong>{instructorList.length}</strong> active instructors
              </span>
              {(searchQuery || selectedDept !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedDept("ALL");
                  }}
                  className="text-[var(--primary)] hover:underline font-medium"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {/* Instructors Table */}
          {loading ? (
            <Loading variant="table" />
          ) : error ? (
            <ErrorMessage message={error} />
          ) : filteredInstructors.length === 0 ? (
            <Empty message={instructorList.length === 0 ? "No active instructors found." : "No instructors match your search criteria."} />
          ) : (
            <div className="panel table-wrap overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted)]">
                    <th className="py-3.5 px-4 font-semibold">INSTRUCTOR</th>
                    <th className="py-3.5 px-4 font-semibold">DEPARTMENT</th>
                    <th className="py-3.5 px-4 font-semibold">TOTAL COURSES</th>
                    <th className="py-3.5 px-4 font-semibold">PUBLISHED</th>
                    <th className="py-3.5 px-4 font-semibold">TOTAL STUDENTS</th>
                    <th className="py-3.5 px-4 font-semibold">STATUS</th>
                    <th className="py-3.5 px-4 font-semibold text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredInstructors.map((instructor, idx) => {
                    const gradientClass = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
                    const initials = getInitials(instructor.name);
                    return (
                      <tr
                        key={instructor.id}
                        tabIndex={0}
                        aria-label={`View portfolio for ${instructor.name}`}
                        className="cursor-pointer transition-colors hover:bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]"
                        onClick={() => setSelectedInstructorId(instructor.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedInstructorId(instructor.id);
                          }
                        }}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3.5">
                            {instructor.avatar ? (
                              <img
                                src={instructor.avatar}
                                alt=""
                                className="h-10 w-10 rounded-full object-cover border border-[var(--border)] shrink-0"
                              />
                            ) : (
                              <div
                                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradientClass} text-white font-bold text-sm shadow-sm`}
                              >
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <strong className="block font-bold text-[var(--foreground)] truncate">
                                {instructor.name}
                              </strong>
                              <span className="muted block text-xs truncate">{instructor.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-semibold text-[var(--foreground)]">
                          {instructor.department || "General Faculty"}
                        </td>
                        <td className="py-4 px-4 font-bold text-[var(--foreground)]">
                          {instructor.course_count} {instructor.course_count === 1 ? "course" : "courses"}
                        </td>
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] shrink-0" />
                            {instructor.published_count} Active
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-sm">
                            <strong className="block font-bold text-[var(--foreground)]">{instructor.student_count}</strong>
                            <span className="muted text-xs block">enrolled</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] shrink-0" />
                            Active
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            type="button"
                            className="btn btn-secondary text-xs font-semibold inline-flex items-center gap-1.5 hover:btn-primary whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInstructorId(instructor.id);
                            }}
                          >
                            <ArrowRight size={13} /> View Portfolio
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SELECTED INSTRUCTOR COURSES */}
      {selectedInstructorId && (
        <div className="space-y-6">
          {instructorCoursesLoading ? (
            <Loading variant="table" />
          ) : instructorCoursesError ? (
            <ErrorMessage message={instructorCoursesError} />
          ) : !instructorCoursesData ? (
            <Empty message="Instructor profile could not be loaded." />
          ) : (
            <>
              {/* Instructor Profile Header Card */}
              <div className="panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {instructorCoursesData.instructor.avatar ? (
                    <img
                      src={instructorCoursesData.instructor.avatar}
                      alt=""
                      className="h-16 w-16 rounded-full object-cover border-2 border-[var(--primary)] shrink-0"
                    />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] text-[var(--primary)] font-bold text-xl shrink-0">
                      {instructorCoursesData.instructor.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-bold">{instructorCoursesData.instructor.name}</h2>
                    <p className="text-sm muted mt-0.5">{instructorCoursesData.instructor.email}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="badge">{instructorCoursesData.instructor.department || "No department specified"}</span>
                      <span className="badge bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]">
                        {instructorCoursesData.courses.length} {instructorCoursesData.courses.length === 1 ? "Course" : "Courses"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Course Listing */}
              {instructorCoursesData.courses.length === 0 ? (
                <Empty message="This instructor has not created any courses yet." />
              ) : (
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
                        <th><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {instructorCoursesData.courses.map((course) => (
                        <tr
                          key={course.id}
                          tabIndex={0}
                          className="cursor-pointer transition-colors hover:bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]"
                          aria-label={`Inspect ${course.title}`}
                          onClick={() => void handleOpenCourseInspection(course)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void handleOpenCourseInspection(course);
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
                                <div className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-[var(--background)] text-xs text-[var(--muted)] border border-[var(--border)]">
                                  No image
                                </div>
                              )}
                              <div className="min-w-0">
                                <strong className="block truncate text-[var(--foreground)]">{course.title}</strong>
                                <span className="muted mt-1 block text-xs">{course.course_code || "No code"}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong className="block font-medium">{course.category || "Uncategorized"}</strong>
                            <span className="muted mt-1 block text-xs">{course.level}</span>
                          </td>
                          <td>
                            <span
                              className={`badge ${course.course_type === "FREE"
                                  ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]"
                                  : "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]"
                                }`}
                            >
                              {course.course_type === "FREE" ? "Free" : bdtFormatter.format(Number(course.price))}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${course.status === "PUBLISHED"
                                  ? "badge-success"
                                  : course.status === "DRAFT"
                                    ? "badge-warning"
                                    : ""
                                }`}
                            >
                              {course.status}
                            </span>
                          </td>
                          <td className="font-semibold">{course.material_count}</td>
                          <td className="font-semibold">{course.enrollment_count}</td>
                          <td>
                            <div className="flex min-w-max items-center gap-2">
                              <button
                                type="button"
                                className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleOpenCourseInspection(course);
                                }}
                              >
                                <Eye size={14} />
                                Inspect Content
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL 1: COURSE CONTENT INSPECTION MODAL */}
      <Modal
        open={Boolean(inspectingCourse)}
        title={`Inspecting: ${inspectingCourse?.title || "Course"}`}
        onCloseAction={() => setInspectingCourse(null)}
        size="wide"
      >
        {inspectingCourse && (
          <div className="space-y-5">
            {/* Header info strip */}
            <div className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span>Code: <strong>{inspectingCourse.course_code || "None"}</strong></span>
                <span>Category: <strong>{inspectingCourse.category || "Uncategorized"}</strong></span>
                <span>Level: <strong>{inspectingCourse.level}</strong></span>
                <span>Pricing: <strong>{inspectingCourse.course_type === "FREE" ? "Free" : bdtFormatter.format(Number(inspectingCourse.price))}</strong></span>
              </div>
              <span className="badge bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] font-medium">
                <Lock size={12} className="mr-1 inline" /> Read-only Inspection
              </span>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
              <button
                type="button"
                className={`btn text-xs inline-flex items-center gap-2 ${activeTab === "materials" ? "btn-primary" : "btn-secondary"
                  }`}
                onClick={() => setActiveTab("materials")}
              >
                <FileText size={14} />
                Learning Materials ({materialsData?.length ?? "..."})
              </button>
              <button
                type="button"
                className={`btn text-xs inline-flex items-center gap-2 ${activeTab === "quizzes" ? "btn-primary" : "btn-secondary"
                  }`}
                onClick={() => setActiveTab("quizzes")}
              >
                <HelpCircle size={14} />
                Quizzes & Evaluations ({quizzesData?.length ?? "..."})
              </button>
            </div>

            {/* Tab Contents */}
            {contentLoading ? (
              <Loading variant="list" />
            ) : contentError ? (
              <ErrorMessage message={contentError} />
            ) : activeTab === "materials" ? (
              <div className="space-y-3">
                {!materialsData || materialsData.length === 0 ? (
                  <Empty message="No learning materials have been uploaded for this course." />
                ) : (
                  materialsData.map((material) => (
                    <div
                      key={material.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--background)] text-[var(--primary)] shrink-0 mt-0.5">
                          {material.material_type === "VIDEO" ? (
                            <Video size={18} />
                          ) : material.material_type === "PDF" ? (
                            <FileText size={18} />
                          ) : (
                            <BookOpen size={18} />
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="badge text-[10px] font-bold">#{material.order}</span>
                            <strong className="text-sm font-semibold truncate block">
                              {material.title}
                            </strong>
                            <span className="badge text-[10px]">{material.material_type}</span>
                          </div>
                          {material.description && (
                            <p className="text-xs muted line-clamp-2">{material.description}</p>
                          )}
                        </div>
                      </div>

                      {material.has_file && (
                        <a
                          href={`/backend-api/materials/${material.id}/download/`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary text-xs inline-flex items-center gap-1.5 shrink-0"
                        >
                          <Download size={13} />
                          File
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {!quizzesData || quizzesData.length === 0 ? (
                  <Empty message="No quizzes or evaluations configured for this course." />
                ) : (
                  quizzesData.map((quiz) => (
                    <div
                      key={quiz.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm font-semibold">{quiz.title}</strong>
                          <span
                            className={`badge text-[10px] ${quiz.is_published ? "badge-success" : "badge-warning"
                              }`}
                          >
                            {quiz.is_published ? "Published" : "Draft"}
                          </span>
                          {quiz.results_published && (
                            <span className="badge text-[10px] bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]">
                              Results Released
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs muted">
                          <span>Passing: <strong>{quiz.passing_score}%</strong></span>
                          <span>Questions: <strong>{quiz.question_count}</strong></span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
                        onClick={() => void handleOpenQuizResults(quiz)}
                      >
                        <Users size={13} />
                        View Student Results
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL 2: QUIZ RESULTS MODAL */}
      <Modal
        open={Boolean(inspectingQuiz)}
        title={`Results: ${inspectingQuiz?.title || "Quiz"}`}
        onCloseAction={() => setInspectingQuiz(null)}
        size="wide"
      >
        {inspectingQuiz && (
          <div className="space-y-4">
            {/* Header */}
            <div className="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] flex items-center justify-between text-xs">
              <span>Required Passing Score: <strong>{inspectingQuiz.passing_score}%</strong></span>
              <span className="badge bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]">
                <Lock size={12} className="mr-1 inline" /> Read-only Results Audit
              </span>
            </div>

            {quizResultsLoading ? (
              <Loading variant="table" />
            ) : quizResultsError ? (
              <ErrorMessage message={quizResultsError} />
            ) : !quizResultsData || quizResultsData.attempts.length === 0 ? (
              <Empty message="No students have submitted attempts for this quiz yet." />
            ) : (
              <div className="panel table-wrap max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Score</th>
                      <th>Percentage</th>
                      <th>Result</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizResultsData.attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>
                          <strong className="block font-medium">{attempt.student_name}</strong>
                          <span className="muted block text-[11px]">{attempt.student_email}</span>
                        </td>
                        <td>
                          {attempt.score} / {attempt.max_score}
                        </td>
                        <td className="font-semibold">{attempt.percentage}%</td>
                        <td>
                          <span
                            className={`badge text-[10px] ${attempt.passed
                                ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]"
                                : "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]"
                              }`}
                          >
                            {attempt.passed ? "Passed" : "Failed"}
                          </span>
                        </td>
                        <td className="muted">
                          {attempt.completed_at
                            ? new Date(attempt.completed_at).toLocaleDateString()
                            : "In progress"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
