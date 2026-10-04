"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { BrandLogo } from "./brand-logo";

type Application = {
  reference: string;
  full_name: string;
  status: string;
  admin_note: string;
  created_at: string;
  reviewed_at?: string | null;
};

export function InstructorApplicationForm({
  statusMode = false,
}: {
  statusMode?: boolean;
}) {
  const [result, setResult] = useState<Application | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));

    try {
      const data = statusMode
        ? await api<Application>(
            `/instructor-applications/${values.reference}/?email=${encodeURIComponent(
              String(values.email)
            )}`
          )
        : await api<Application>("/instructor-applications/", {
            method: "POST",
            body: jsonBody(values),
          });
      setResult(data);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const getStatusBadgeClass = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("approved") || s.includes("accepted")) {
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    }
    if (s.includes("rejected") || s.includes("declined")) {
      return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30";
    }
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
  };

  return (
    <main className="min-h-screen grid place-items-center p-4 sm:p-6 bg-[var(--background)] transition-colors duration-200">
      <section className="panel w-full max-w-2xl p-6 sm:p-8 rounded-2xl border border-[var(--border)] bg-[var(--surface,var(--background))] space-y-6 shadow-2xl">
        {/* Header */}
        <div className="space-y-3">
          <BrandLogo />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
              {statusMode ? "Check Application Status" : "Instructor Application"}
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {statusMode
                ? "Enter your reference number and email to check your review status."
                : "Join our teaching team. Complete the details below to submit your application."}
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 p-3.5 text-sm rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 animate-in fade-in duration-200"
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="font-medium leading-tight">{error}</span>
          </div>
        )}

        {/* Application Result State */}
        {result ? (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="p-5 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface,var(--background))_90%,var(--foreground)_5%)] space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Application Status
                </span>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusBadgeClass(
                    result.status
                  )}`}
                >
                  {result.status}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-xs text-[var(--muted)]">Reference ID</span>
                  <span className="font-mono font-semibold text-[var(--foreground)]">
                    {result.reference}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-[var(--muted)]">Applicant Name</span>
                  <span className="font-medium text-[var(--foreground)]">
                    {result.full_name}
                  </span>
                </div>
                {result.created_at && (
                  <div>
                    <span className="block text-xs text-[var(--muted)]">Submitted Date</span>
                    <span className="text-[var(--foreground)]">
                      {new Date(result.created_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {result.reviewed_at && (
                  <div>
                    <span className="block text-xs text-[var(--muted)]">Reviewed Date</span>
                    <span className="text-[var(--foreground)]">
                      {new Date(result.reviewed_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {result.admin_note && (
                <div className="pt-3 border-t border-[var(--border)]">
                  <span className="block text-xs font-semibold text-[var(--muted)] mb-1">
                    Reviewer Notes
                  </span>
                  <p className="text-sm text-[var(--foreground)] bg-[var(--background)] p-3 rounded-lg border border-[var(--border)]">
                    {result.admin_note}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="btn btn-secondary flex-1 py-2.5 text-center font-medium"
              >
                {statusMode ? "Check another application" : "Submit another application"}
              </button>
              <Link
                href="/login"
                className="btn btn-primary flex-1 py-2.5 text-center font-medium"
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          /* Main Input Form */
          <form className="space-y-4" onSubmit={submit}>
            {statusMode ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Application Reference
                  </label>
                  <input
                    className="field w-full font-mono"
                    name="reference"
                    placeholder="e.g. INS-10X"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Email Address
                  </label>
                  <input
                    className="field w-full"
                    name="email"
                    type="email"
                    placeholder="name@university.edu"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Personal Information */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Full Name
                  </label>
                  <input
                    className="field w-full"
                    name="full_name"
                    placeholder="Prof. Name"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Email Address
                    </label>
                    <input
                      className="field w-full"
                      name="email"
                      type="email"
                      placeholder="dmeo.acc@university.edu"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Phone Number
                    </label>
                    <input
                      className="field w-full"
                      name="phone"
                      type="tel"
                      placeholder="+880 1X XXXX XXXX"
                      autoComplete="tel"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Password
                  </label>
                  <input
                    className="field w-full"
                    name="password"
                    type="password"
                    placeholder="Create your instructor login password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <p className="text-xs text-[var(--muted)]">
                    Use at least 8 characters. Your email will be your username, and you can sign in after admin approval.
                  </p>
                </div>

                {/* Academic Credentials */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Bachelor&apos;s Degree
                    </label>
                    <input
                      className="field w-full"
                      name="bachelor_degree"
                      placeholder="B.Sc. in Computer Science"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Master&apos;s Degree <span className="text-[var(--muted)] font-normal">(Optional)</span>
                    </label>
                    <input
                      className="field w-full"
                      name="master_degree"
                      placeholder="M.Sc. in Data Science"
                    />
                  </div>
                </div>

                {/* Experience & Expertise */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Years of Experience <span className="text-[var(--muted)] font-normal">(Optional)</span>
                    </label>
                    <input
                      className="field w-full"
                      name="years_experience"
                      type="number"
                      min="0"
                      placeholder="3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Key Expertise <span className="text-[var(--muted)] font-normal">(Optional)</span>
                    </label>
                    <input
                      className="field w-full"
                      name="expertise"
                      placeholder="e.g. Python, Algorithms, AI"
                    />
                  </div>
                </div>

                {/* Teaching Background */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Teaching & Professional Background
                  </label>
                  <textarea
                    className="field w-full min-h-[90px] py-2 leading-relaxed resize-y"
                    name="teaching_background"
                    placeholder="Institution/organization, current designation, and summary of work/teaching experience..."
                    required
                  />
                </div>
              </div>
            )}

            <div className="pt-3 space-y-3">
              <button
                className="btn btn-primary w-full text-base py-2.5 flex items-center justify-center gap-2 font-medium"
                disabled={busy}
              >
                {busy && (
                  <svg
                    className="w-4 h-4 animate-spin shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                )}
                <span>
                  {busy
                    ? "Please wait…"
                    : statusMode
                    ? "Check Status"
                    : "Submit Application"}
                </span>
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors inline-flex items-center gap-1"
                >
                  <span>←</span> Back to Sign In
                </Link>
              </div>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
