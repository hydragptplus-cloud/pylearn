"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { Empty, ErrorMessage, Loading, PageHeader } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";

type Notification = {
  id: number;
  recipient_name: string;
  event_type: string;
  subject: string;
  summary: string;
  status: string;
  attempted_at: string | null;
  created_at: string;
  error_message?: string;
};

const PAGE_SIZE = 6;

function paginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  let start = Math.max(2, currentPage - 1);
  let end = Math.min(totalPages - 1, currentPage + 1);
  if (currentPage <= 4) end = 5;
  if (currentPage >= totalPages - 3) start = totalPages - 4;

  const items: (number | string)[] = [1];
  if (start > 2) items.push("start-ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push("end-ellipsis");
  items.push(totalPages);
  return items;
}

function eventLabel(eventType: string) {
  return eventType.replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const { notify } = useFeedbackDialog();
  const { user } = useAuth();
  const path = user?.role === "ADMIN" ? "/notifications/admin/" : "/notifications/";
  const list = useApiData<Notification[]>(path);
  const totalNotifications = list.data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalNotifications / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleNotifications = list.data?.slice(pageStart, pageStart + PAGE_SIZE) ?? [];

  async function retry(id: number) {
    try {
      await api(`/notifications/admin/${id}/retry/`, { method: "POST", body: "{}" });
      await list.reload();
    } catch {
      void notify("Failed to retry notification", { tone: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Email Notification History" 
        description="SMTP acceptance and failure history; this does not claim inbox delivery." 
      />
      
      {list.loading ? (
        <Loading variant="table" />
      ) : list.error ? (
        <ErrorMessage message={list.error} />
      ) : !list.data?.length ? (
        <Empty message="No email notifications." />
      ) : (
        <div className="panel overflow-hidden">
          <div className="table-wrap">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="bg-[var(--background)]">Recipient</th>
                  <th className="bg-[var(--background)]">Notification</th>
                  <th className="bg-[var(--background)]">Status</th>
                  <th className="bg-[var(--background)]">Attempted</th>
                  <th className="bg-[var(--background)]"></th>
                </tr>
              </thead>
              <tbody>
                {visibleNotifications.map((n) => (
                  <tr key={n.id} className="hover:bg-[var(--background)] transition-colors">
                    <td className="font-semibold">{n.recipient_name}</td>
                    <td>
                      <span className="badge mb-2">{eventLabel(n.event_type)}</span>
                      <strong className="block text-[var(--foreground)]">{n.subject}</strong>
                      <div className="muted mt-1">{n.summary}</div>
                      {n.error_message && (
                        <div className="text-[var(--danger)] text-xs mt-2 font-medium bg-[#fee4e2] dark:bg-[#3f1d24] p-2 rounded border border-[#fecaca] dark:border-[#7f1d1d] inline-block">
                          {n.error_message}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${n.status === 'FAILED' ? 'bg-[#fee4e2] text-[var(--danger)] dark:bg-[#3f1d24]' : ''}`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="muted">
                      {n.attempted_at ? new Date(n.attempted_at).toLocaleString() : "Pending"}
                    </td>
                    <td className="text-right">
                      {user?.role === "ADMIN" && n.status === "FAILED" && (
                        <button className="btn btn-secondary text-xs py-1.5 px-3" onClick={() => void retry(n.id)}>
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalNotifications > PAGE_SIZE && (
            <nav className="notification-pagination" aria-label="Email notification pages">
              <p className="muted text-sm">
                Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, totalNotifications)} of {totalNotifications}
              </p>
              <div className="notification-pagination-pages">
                <button
                  type="button"
                  className="notification-page-button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={17} />
                </button>

                {paginationItems(currentPage, totalPages).map((item) =>
                  typeof item === "number" ? (
                    <button
                      type="button"
                      className="notification-page-button"
                      data-active={item === currentPage || undefined}
                      aria-current={item === currentPage ? "page" : undefined}
                      aria-label={`Page ${item}`}
                      onClick={() => setPage(item)}
                      key={item}
                    >
                      {item}
                    </button>
                  ) : (
                    <span className="notification-page-ellipsis" aria-hidden="true" key={item}>…</span>
                  )
                )}

                <button
                  type="button"
                  className="notification-page-button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
