"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { unwrap } from "@/lib/api";
import type { Enrollment } from "@/lib/types";
import { Empty, ErrorMessage, Loading, PageHeader } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";

export function EnrollmentsPage() {
  const router = useRouter();
  const { data, loading, error } = useApiData<Enrollment[] | { results: Enrollment[] }>("/enrollments/");
  
  const rows = data ? unwrap(data) : [];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Course Enrollment" 
        description="Student enrollment and course completion status." 
      />
      
      {loading ? (
        <Loading variant="table" />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : rows.length === 0 ? (
        <Empty message="No enrollments yet." />
      ) : (
        <div className="panel table-wrap">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="bg-[var(--background)]">Student</th>
                <th className="bg-[var(--background)]">Course</th>
                <th className="bg-[var(--background)]">Enrolled</th>
                <th className="bg-[var(--background)]">Progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const courseHref = `/courses/${e.course}`;

                return (
                  <tr
                    key={e.id}
                    className="group cursor-pointer hover:bg-[var(--background)] focus-within:outline-2 focus-within:outline-[var(--primary)] focus-within:outline-offset-[-2px] transition-colors"
                    onClick={() => router.push(courseHref)}
                  >
                    <td className="font-semibold text-[var(--foreground)]">
                      {e.student_detail?.name || 'Unknown Student'}
                    </td>
                    <td>
                      <Link
                        className="font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] group-hover:underline underline-offset-4"
                        href={courseHref}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {e.course_detail.title}
                      </Link>
                    </td>
                    <td className="muted">{new Date(e.enrolled_at).toLocaleDateString()}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <progress 
                          value={e.progress} 
                          max="100"
                          className="w-24 h-2 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-[var(--background)] [&::-webkit-progress-value]:bg-[var(--primary)] [&::-moz-progress-bar]:bg-[var(--primary)] border border-[var(--border)]" 
                        /> 
                        <span className="font-medium min-w-[3ch]">{e.progress}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
