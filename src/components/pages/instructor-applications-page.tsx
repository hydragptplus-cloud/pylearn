"use client";

import { useState } from "react";
import { api, jsonBody, unwrap } from "@/lib/api";
import { useApiData } from "@/hooks/use-api-data";
import { Empty, ErrorMessage, Loading, PageHeader } from "@/components/ui";

type Application = {
  reference: string;
  full_name: string;
  email: string;
  phone: string;
  bachelor_degree: string;
  master_degree: string;
  years_experience?: number;
  expertise: string;
  teaching_background: string;
  status: string;
  admin_note: string;
  created_at: string;
};

export function InstructorApplicationsPage() {
  const list = useApiData<Application[] | { results: Application[] }>("/instructor-applications/");
  const [busyReference, setBusyReference] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function review(form: HTMLFormElement, application: Application, decision: "approve" | "reject") {
    setBusyReference(application.reference);
    setErrors(current => ({ ...current, [application.reference]: "" }));
    try {
      const values = Object.fromEntries(new FormData(form));
      await api(`/instructor-applications/${application.reference}/${decision}/`, {
        method: "POST",
        body: jsonBody(values),
      });
      await list.reload();
    } catch (error) {
      setErrors(current => ({
        ...current,
        [application.reference]: error instanceof Error ? error.message : `Unable to ${decision} this application.`,
      }));
    } finally {
      setBusyReference("");
    }
  }

  const applications = unwrap(list.data || []);

  return <div className="space-y-6">
    <PageHeader title="Instructor Applications" description="Review, approve, or reject teacher applications." />
    {list.loading ? <Loading /> : list.error ? <ErrorMessage message={list.error} /> : !applications.length ? <Empty message="No applications." /> : <div className="space-y-4">
      {applications.map(application => {
        const busy = busyReference === application.reference;
        return <article className="panel p-5" key={application.reference}>
          <div className="flex justify-between gap-4"><div><h2 className="font-bold">{application.full_name}</h2><p className="muted text-sm">{application.email} · {application.phone} · {application.reference}</p></div><span className="badge">{application.status}</span></div>
          <p className="mt-3"><strong>Bachelor:</strong> {application.bachelor_degree}{application.master_degree && ` · Master: ${application.master_degree}`}</p>
          <p><strong>Experience:</strong> {application.teaching_background}</p>
          {application.expertise && <p><strong>Skills:</strong> {application.expertise}</p>}
          {application.status === "PENDING" && <form className="mt-4 grid gap-2 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); void review(event.currentTarget, application, "approve"); }}>
            <input className="field sm:col-span-2" name="admin_note" placeholder="Admin note (required when rejecting)" disabled={busy} />
            <button className="btn btn-primary" disabled={busy}>{busy ? "Processing…" : "Approve & grant access"}</button>
            <button type="button" className="btn btn-danger sm:col-start-3" disabled={busy} onClick={event => { const form = event.currentTarget.form; if (form) void review(form, application, "reject"); }}>Reject</button>
            {errors[application.reference] && <div className="error sm:col-span-3" role="alert">{errors[application.reference]}</div>}
          </form>}
        </article>;
      })}
    </div>}
  </div>;
}
