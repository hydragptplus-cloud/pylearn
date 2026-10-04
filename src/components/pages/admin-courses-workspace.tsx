"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  Edit,
  Eye,
  Plus,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Category, Course } from "@/lib/types";
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

const FILTER_LEVEL_OPTIONS = [
  { value: "ALL", label: "All Levels" },
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const FORM_LEVEL_OPTIONS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const FILTER_STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const FORM_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const FILTER_TYPE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "FREE", label: "Free" },
  { value: "PAID", label: "Paid" },
];

const FORM_TYPE_OPTIONS = [
  { value: "FREE", label: "Free" },
  { value: "PAID", label: "Paid" },
];

const bdtFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function AdminCoursesWorkspace({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const { confirm: confirmDialog, notify, prompt: promptDialog } = useFeedbackDialog();

  const {
    data: coursesData,
    loading,
    error,
    reload: reloadCourses,
  } = useApiData<Course[] | { results: Course[] }>("/courses/");

  const categories = useApiData<Category[] | { results: Category[] }>("/categories/");

  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formError, setFormError] = useState("");
  const [busyMessage, setBusyMessage] = useState("");
  const [courseType, setCourseType] = useState<"FREE" | "PAID">("FREE");

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  const allCourses = coursesData ? unwrap(coursesData) : [];

  // Filter for admin-owned courses (no instructor assigned or instructor is null)
  const adminCourses = useMemo(() => {
    return allCourses.filter((course) => !course.instructor);
  }, [allCourses]);

  const filteredCourses = useMemo(() => {
    return adminCourses.filter((course) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = course.title.toLowerCase().includes(query);
        const matchesCode = (course.course_code || "").toLowerCase().includes(query);
        const matchesDesc = course.description.toLowerCase().includes(query);

        if (!matchesTitle && !matchesCode && !matchesDesc) {
          return false;
        }
      }

      if (selectedCategory !== "ALL" && String(course.category) !== selectedCategory) {
        return false;
      }

      if (selectedStatus !== "ALL" && course.status !== selectedStatus) {
        return false;
      }

      if (selectedLevel !== "ALL" && course.level !== selectedLevel) {
        return false;
      }

      if (selectedType !== "ALL" && course.course_type !== selectedType) {
        return false;
      }

      return true;
    });
  }, [adminCourses, searchQuery, selectedCategory, selectedStatus, selectedLevel, selectedType]);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    selectedCategory !== "ALL" ||
    selectedStatus !== "ALL" ||
    selectedLevel !== "ALL" ||
    selectedType !== "ALL";

  function resetFilters() {
    setSearchQuery("");
    setSelectedCategory("ALL");
    setSelectedStatus("ALL");
    setSelectedLevel("ALL");
    setSelectedType("ALL");
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
      await reloadCourses();

      void notify(
        editingCourse ? "Course updated successfully." : "Course created successfully.",
        { tone: "success" }
      );
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
      "This will permanently delete this admin course and its materials. If students have completed payments or earned certificates in this course, deletion will be protected to maintain academic records.",
      {
        title: "Delete admin course?",
        confirmLabel: "Delete course",
        tone: "error",
      }
    );

    if (!isConfirmed) return;

    try {
      setBusyMessage("Deleting course...");
      await api(`/courses/${id}/`, { method: "DELETE" });
      await reloadCourses();
      void notify("Course deleted.", { tone: "success" });
    } catch (err) {
      void notify(err instanceof Error ? err.message : "Unable to delete course", {
        tone: "error",
      });
    } finally {
      setBusyMessage("");
    }
  }

  const categoryFilterOptions = [
    { value: "ALL", label: "All Categories" },
    ...(categories.data
      ? unwrap(categories.data).map((cat) => ({
        value: String(cat.id),
        label: cat.name,
      }))
      : []),
  ];

  return (
    <>
      <LoadingModal
        open={Boolean(busyMessage)}
        title="Please wait"
        message={busyMessage}
      />

      {/* Navigation Breadcrumb & Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack || (() => router.push("/courses"))}
            className="btn btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft size={16} />
            Back to Overview
          </button>
          <div className="flex items-center gap-2">
            <span className="badge border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-xs font-medium text-[var(--primary)]">
              <Shield size={13} className="mr-1 inline" /> Admin Owned Workspace
            </span>
          </div>
        </div>

        <PageHeader
          title="Course Management: Admin"
          description="Create, configure, and manage platform-owned courses with full administrative privileges."
          action={
            <button
              type="button"
              className="btn btn-primary inline-flex items-center gap-2"
              onClick={openNewCourseModal}
            >
              <Plus size={16} />
              New course
            </button>
          }
        />
      </div>

      {/* Search & Filter Panel */}
      <div className="panel space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              size={16}
            />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field w-full text-sm !pl-12"
            />
          </div>

          <ModernSelect
            className="field text-sm"
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            options={categoryFilterOptions}
            aria-label="Filter by category"
          />

          <ModernSelect
            className="field text-sm"
            value={selectedStatus}
            onValueChange={setSelectedStatus}
            options={FILTER_STATUS_OPTIONS}
            aria-label="Filter by status"
          />

          <ModernSelect
            className="field text-sm"
            value={selectedLevel}
            onValueChange={setSelectedLevel}
            options={FILTER_LEVEL_OPTIONS}
            aria-label="Filter by level"
          />

          <ModernSelect
            className="field text-sm"
            value={selectedType}
            onValueChange={setSelectedType}
            options={FILTER_TYPE_OPTIONS}
            aria-label="Filter by pricing type"
          />
        </div>

        <div className="muted flex items-center justify-between pt-1 text-xs">
          <span>
            Showing <strong>{filteredCourses.length}</strong> of{" "}
            <strong>{adminCourses.length}</strong> admin courses
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Courses Content Table */}
      {loading ? (
        <Loading variant="table" />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : filteredCourses.length === 0 ? (
        <Empty
          message={
            adminCourses.length === 0
              ? "No admin courses created yet. Click 'New course' to create one."
              : "No courses match your active filters."
          }
        />
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
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map((course) => (
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
                          {course.course_code || "No code"}
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
                          ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]"
                          : "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]"
                        }`}
                    >
                      {course.course_type === "FREE"
                        ? "Free"
                        : bdtFormatter.format(Number(course.price))}
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
                  <td className="font-semibold">
                    {course.materials?.length || 0}
                  </td>
                  <td className="font-semibold">{course.enrollment_count}</td>
                  <td>
                    <div className="flex min-w-max flex-wrap items-center gap-2">
                      <Link
                        className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
                        href={`/courses/${course.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Eye size={14} />
                        View
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditCourseModal(course);
                        }}
                      >
                        <Edit size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger inline-flex items-center gap-1.5 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRemoveCourse(course.id);
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Course Modal */}
      <Modal
        open={isModalOpen}
        title={editingCourse ? "Edit admin course" : "Create admin course"}
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
                  ? unwrap(categories.data).map((cat) => ({
                    value: String(cat.id),
                    label: cat.name,
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
              options={FORM_LEVEL_OPTIONS}
            />
            <ModernSelect
              className="field"
              name="status"
              aria-label="Course status"
              defaultValue={editingCourse?.status ?? "PUBLISHED"}
              options={FORM_STATUS_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModernSelect
              className="field"
              name="course_type"
              aria-label="Course type"
              value={courseType}
              onValueChange={(val) => setCourseType(val as "FREE" | "PAID")}
              options={FORM_TYPE_OPTIONS}
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
              {editingCourse ? "Save Changes" : "Create Course"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
