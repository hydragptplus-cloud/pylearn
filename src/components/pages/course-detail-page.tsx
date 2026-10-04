"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Course } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { ErrorMessage, Loading, LoadingModal, Modal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";

export function CourseDetailPage() {
  const { confirm: confirmDialog, notify } = useFeedbackDialog();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { data: course, loading, error, reload } = useApiData<Course>(`/courses/${id}/`);
  
  const from = searchParams?.get("from");
  let backHref = "/courses";
  let backLabel = "Back to Courses";

  if (from === "learning-path") {
    backHref = "/learning-path";
    backLabel = "Back to AI Learning Path";
  } else if (from === "quizzes") {
    backHref = "/quizzes";
    backLabel = "Back to Quizzes";
  } else if (from === "dashboard") {
    backHref = "/dashboard";
    backLabel = "Back to Dashboard";
  } else if (from === "enrollments") {
    backHref = "/enrollments";
    backLabel = "Back to My Enrollments";
  } else if (from === "instructor-courses") {
    backHref = "/instructor/courses";
    backLabel = "Back to Course Management";
  } else if (from === "admin-courses") {
    backHref = "/admin/courses";
    backLabel = "Back to Course Management";
  }

  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [busyMessage, setBusyMessage] = useState("");
  const [downloadingMaterialId, setDownloadingMaterialId] = useState<number | null>(null);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    
    const body = new FormData(e.currentTarget);
    body.set("course", id as string);
    
    try {
      setBusyMessage("Saving material...");
      await api("/materials/", { method: "POST", body });
      setOpen(false);
      await reload();
    } catch (x) {
      setFormError(x instanceof Error ? x.message : "Upload failed");
    } finally {
      setBusyMessage("");
    }
  }

  async function complete(materialId: number) {
    try {
      setBusyMessage("Updating progress...");
      await api(`/materials/${materialId}/complete/`, { 
        method: "POST", 
        body: JSON.stringify({ completed: true }) 
      });
      void notify("Material marked complete.", { title: "Progress updated", tone: "success" });
      await reload();
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Failed to mark as complete", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  async function downloadMaterial(materialId: number, downloadUrl: string, title: string, materialType: string) {
    setDownloadingMaterialId(materialId);
    try {
      const response = await fetch(downloadUrl, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Unable to download this material.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const ext = materialType === "VIDEO" ? ".mp4" : materialType === "PDF" ? ".pdf" : "";
      const filename = encodedName ? decodeURIComponent(encodedName) : plainName || `${title}${ext}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      try {
        await api(`/materials/${materialId}/complete/`, {
          method: "POST",
          body: JSON.stringify({ completed: true }),
        });
      } catch {
        // Backend download endpoint may have already marked it complete
      }

      await reload();
      const typeLabel = materialType === "VIDEO" ? "Video" : materialType === "PDF" ? "PDF" : "Material";
      void notify(`${typeLabel} downloaded and marked complete.`, { title: "Progress updated", tone: "success" });
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Unable to download this material.", { tone: "error" });
    } finally {
      setDownloadingMaterialId(null);
    }
  }

  async function removeMaterial(materialId: number) {
    if (!await confirmDialog("Delete this material?", {
      title: "Delete material?",
      confirmLabel: "Delete material",
      tone: "error",
    })) return;
    
    try {
      setBusyMessage("Deleting material...");
      await api(`/materials/${materialId}/`, { method: "DELETE" });
      await reload();
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Failed to delete material", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  if (loading) return <Loading variant="detail" />;
  if (error || !course) return <ErrorMessage message={error || "Course not found"} />;

  return (
    <>
      <LoadingModal open={Boolean(busyMessage)} title="Please wait" message={busyMessage} />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:underline transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {backLabel}
        </Link>
      </div>

      {course.thumbnail && (
        <img 
          src={course.thumbnail} 
          alt={course.title} 
          className="h-56 md:h-72 w-full rounded-2xl object-cover mb-6 shadow-sm"
        />
      )}
      
      <PageHeader 
        title={course.title} 
        description={course.description} 
        action={
          user?.role !== "STUDENT" && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}>
              Add material
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="badge">{course.course_code}</span>
        <span className="badge">{course.category_detail?.name || "Uncategorized"}</span>
      </div>

      {(!course.materials || course.materials.length === 0) ? (
        <div className="panel p-8 mt-4 text-center muted">
          No learning materials have been uploaded yet.
        </div>
      ) : (
        <div className="space-y-4 mt-6">
          {course.materials.map(m => (
            <article key={m.id} className="panel p-5 flex flex-col md:flex-row md:items-start justify-between gap-5">
              <div className="flex-1">
                <span className="badge">{m.material_type}</span>
                <h2 className="font-bold text-xl mt-3">{m.title}</h2>
                
                {m.description && (
                  <p className="muted mt-2 text-sm">{m.description}</p>
                )}
                
                {m.note_content && (
                  <div className="mt-4 p-4 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm whitespace-pre-wrap">
                    {m.note_content}
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0 md:flex-col lg:flex-row md:self-stretch md:items-start">
                {m.download_url && (user?.role === "STUDENT" ? (
                  <button
                    type="button"
                    className="btn btn-secondary w-full md:w-auto text-center"
                    disabled={downloadingMaterialId === m.id}
                    onClick={() => void downloadMaterial(m.id, m.download_url!, m.title, m.material_type)}
                  >
                    {downloadingMaterialId === m.id
                      ? "Downloading…"
                      : m.completed
                      ? "Download again"
                      : m.material_type === "VIDEO"
                      ? "Download Video"
                      : m.material_type === "PDF"
                      ? "Download PDF"
                      : "Download"}
                  </button>
                ) : (
                  <a className="btn btn-secondary w-full md:w-auto text-center" href={m.download_url} download>
                    Download
                  </a>
                ))}
                
                {user?.role === "STUDENT" && m.completed && (
                  <span className="inline-flex min-h-10 w-full md:w-auto items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--success-soft)] px-4 py-2 text-sm font-bold text-[var(--success)]">
                    <CheckCircle2 size={17} /> Completed
                  </span>
                )}

                {user?.role === "STUDENT" && !m.completed && !m.download_url && (
                  <button className="btn btn-primary w-full md:w-auto" onClick={() => void complete(m.id)}>
                    Mark complete
                  </button>
                )}

                {user?.role === "STUDENT" && !m.completed && m.download_url && (
                  <span className="muted max-w-44 text-center text-xs">
                    Download this {m.material_type === "VIDEO" ? "video" : m.material_type === "PDF" ? "PDF" : "material"} to complete it.
                  </span>
                )}
                
                {user?.role !== "STUDENT" && (
                  <button className="btn btn-danger w-full md:w-auto" onClick={() => void removeMaterial(m.id)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ADD MATERIAL MODAL */}
      <Modal open={open} title="Add learning material" onCloseAction={() => setOpen(false)}>
        <form className="space-y-4 p-4" onSubmit={upload}>
          <input className="field" name="title" placeholder="Material Title" required />
          <textarea className="field" name="description" placeholder="Brief Description (Optional)" rows={2} />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="block space-y-1">
              <label htmlFor="material-type" className="font-semibold text-sm">Type</label>
              <ModernSelect id="material-type" className="field" name="material_type" options={[
                { value: "PDF", label: "PDF document" },
                { value: "VIDEO", label: "Video" },
                { value: "NOTE", label: "Note" },
              ]} />
            </div>
            <label className="block space-y-1">
              <span className="font-semibold text-sm">Sort Order</span>
              <input className="field" name="order" type="number" defaultValue="0" />
            </label>
          </div>

          <div className="border border-[var(--border)] p-4 rounded-lg bg-[var(--background)] space-y-4 mt-4">
            <label className="block space-y-1">
              <span className="font-semibold text-sm">Upload File (PDF or Video)</span>
              <input className="field bg-[var(--panel)]" name="file" type="file" />
            </label>
            
            <div className="text-center muted text-sm font-semibold">- OR -</div>
            
            <label className="block space-y-1">
              <span className="font-semibold text-sm">Text Note Content</span>
              <textarea className="field bg-[var(--panel)]" name="note_content" placeholder="Type text content here..." rows={4} />
            </label>
          </div>

          {formError && <ErrorMessage message={formError} />}

          <div className="pt-4 border-t border-[var(--border)] mt-4">
            <button className="btn btn-primary w-full">Save material</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
