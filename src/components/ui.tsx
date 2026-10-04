"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="muted mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type LoadingVariant =
  | "page"
  | "table"
  | "list"
  | "detail"
  | "dashboard"
  | "form";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function Loading({ variant = "page" }: { variant?: LoadingVariant }) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6" aria-label="Loading dashboard">
        <div className="dashboard-stats">
          {[0, 1, 2, 3].map((item) => (
            <article className="dashboard-stat panel" key={item}>
              <SkeletonBlock className="h-12 w-12 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-3">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-8 w-16" />
                <SkeletonBlock className="h-3 w-24" />
              </div>
            </article>
          ))}
        </div>

        <div className="dashboard-layout">
          <section className="panel dashboard-section">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="space-y-2">
                <SkeletonBlock className="h-6 w-36" />
                <SkeletonBlock className="h-4 w-52" />
              </div>
              <SkeletonBlock className="h-10 w-32" />
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <SkeletonBlock className="h-32 w-full" key={item} />
              ))}
            </div>
          </section>

          <aside className="dashboard-side-column">
            {[0, 1].map((section) => (
              <section className="panel dashboard-section" key={section}>
                <SkeletonBlock className="h-6 w-40 mb-5" />
                <div className="space-y-3">
                  <SkeletonBlock className="h-14 w-full" />
                  <SkeletonBlock className="h-14 w-11/12" />
                </div>
              </section>
            ))}
          </aside>
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="panel table-wrap" aria-label="Loading table">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-5 gap-4">
            {[0, 1, 2, 3, 4].map((item) => (
              <SkeletonBlock className="h-4 w-full" key={item} />
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((row) => (
            <div
              className="grid grid-cols-5 gap-4 border-t border-[var(--border)] pt-4"
              key={row}
            >
              {[0, 1, 2, 3, 4].map((cell) => (
                <SkeletonBlock className="h-5 w-full" key={cell} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="space-y-4" aria-label="Loading list">
        {[0, 1, 2].map((item) => (
          <article className="panel p-5" key={item}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <SkeletonBlock className="h-24 w-full md:w-36" />
              <div className="min-w-0 flex-1 space-y-3">
                <SkeletonBlock className="h-5 w-2/5" />
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="h-4 w-3/5" />
              </div>
              <SkeletonBlock className="h-10 w-full md:w-32" />
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className="space-y-5" aria-label="Loading details">
        <SkeletonBlock className="h-64 w-full rounded-xl" />
        <div className="panel p-6 space-y-5">
          <SkeletonBlock className="h-8 w-2/5" />
          <SkeletonBlock className="h-4 w-11/12" />
          <SkeletonBlock className="h-4 w-8/12" />
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonBlock className="h-28 w-full" />
            <SkeletonBlock className="h-28 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className="panel p-6 space-y-5" aria-label="Loading form">
        <SkeletonBlock className="h-6 w-44" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock className="h-11 w-full" key={item} />
          ))}
        </div>
        <SkeletonBlock className="h-10 w-36" />
      </div>
    );
  }

  return (
    <div className="panel p-6 space-y-4" aria-label="Loading content">
      <SkeletonBlock className="h-6 w-1/3" />
      <SkeletonBlock className="h-4 w-11/12" />
      <SkeletonBlock className="h-4 w-8/12" />
      <div className="grid gap-4 md:grid-cols-3">
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
      </div>
    </div>
  );
}

export function LoadingModal({
  open,
  title = "Working",
  message = "Please wait while we finish this.",
}: {
  open: boolean;
  title?: string;
  message?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => e.preventDefault()}
      className="loading-dialog m-auto border border-[var(--border)] bg-[var(--panel)] p-6 text-[var(--foreground)] shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]">
          <LoaderCircle
            className="animate-spin"
            size={28}
            aria-hidden="true"
          />
        </div>
        <h2 className="mt-4 text-lg font-bold">{title}</h2>
        <p className="muted mt-2 text-sm">{message}</p>
      </div>
    </dialog>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return <div className="error">{message}</div>;
}

export function Empty({ message }: { message: string }) {
  return <div className="panel p-8 text-center muted">{message}</div>;
}

export function Modal({
  open,
  title,
  children,
  onCloseAction,
  size = "default",
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onCloseAction: () => void;
  size?: "default" | "wide";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Sync main dialog open/close state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      setShowConfirm(false);
    }
  }, [open]);

  // Sync confirm dialog open/close state
  useEffect(() => {
    const confirmDialog = confirmDialogRef.current;
    if (!confirmDialog) return;

    if (showConfirm && !confirmDialog.open) {
      confirmDialog.showModal();
    } else if (!showConfirm && confirmDialog.open) {
      confirmDialog.close();
    }
  }, [showConfirm]);

  const hasUnsavedChanges = (): boolean => {
    const dialog = dialogRef.current;
    if (!dialog) return false;

    const formElements = dialog.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input:not([type="hidden"]), textarea, select');

    for (const element of Array.from(formElements)) {
      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox" || element.type === "radio") {
          if (element.checked !== element.defaultChecked) return true;
        } else if (element.type === "file") {
          if (element.files && element.files.length > 0) return true;
        } else if (element.value !== element.defaultValue) {
          return true;
        }
      } else if (element instanceof HTMLTextAreaElement) {
        if (element.value !== element.defaultValue) return true;
      } else if (element instanceof HTMLSelectElement) {
        const isModified = Array.from(element.options).some(
          (opt) => opt.selected !== opt.defaultSelected
        );
        if (isModified) return true;
      }
    }

    return false;
  };

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowConfirm(true);
    } else {
      onCloseAction();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      handleCloseAttempt();
    }
  };

  return (
    <>
      {/* Main Dialog */}
      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        onCancel={(e) => {
          e.preventDefault();
          handleCloseAttempt();
        }}
        className={`m-auto bg-[var(--panel)] text-[var(--foreground)] ${size === "wide" ? "dialog-wide" : ""
          }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="text-xl leading-none text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </dialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <dialog
        ref={confirmDialogRef}
        onClose={() => setShowConfirm(false)}
        className="m-auto w-[90%] max-w-sm rounded-xl border border-[var(--border)] bg-[var(--panel)] p-0 text-[var(--foreground)]"
      >
        <div className="p-6">
          <h3 className="mb-2 text-lg font-bold">Unsaved Changes</h3>
          <p className="muted mb-6 text-sm">
            You have unsaved changes. Are you sure you want to close this and discard them?
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setShowConfirm(false);
                onCloseAction();
              }}
            >
              Discard
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="panel p-5">
      <div className="muted text-sm">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}
