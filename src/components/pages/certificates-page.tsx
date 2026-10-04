"use client";

import { useApiData } from "@/hooks/use-api-data";
import { unwrap } from "@/lib/api";
import { Empty, ErrorMessage, Loading, PageHeader } from "@/components/ui";

type Certificate = {
    verification_number: string;
    student_name: string;
    course_title: string;
    instructor_name: string;
    issued_at: string;
    revoked_at?: string | null;
};

export function CertificatesPage() {
    const { data, loading, error } = useApiData<Certificate[] | { results: Certificate[] }>(
        "/certificates/"
    );

    const certificates = data ? unwrap(data) : [];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Certificates"
                description="Issued course-completion certificates."
            />

            {loading ? (
                <Loading />
            ) : error ? (
                <ErrorMessage message={error} />
            ) : certificates.length === 0 ? (
                <Empty message="No certificates issued yet." />
            ) : (
                <div className="grid-cards">
                    {certificates.map((cert) => {
                        const isRevoked = Boolean(cert.revoked_at);

                        return (
                            <article
                                key={cert.verification_number}
                                className="panel flex flex-col justify-between p-5"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span
                                            className={`badge ${isRevoked ? "badge-danger" : "badge-success"
                                                }`}
                                        >
                                            {isRevoked ? "Revoked" : "Verified"}
                                        </span>
                                        <span className="muted text-xs">
                                            {new Date(cert.issued_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <h2 className="mt-3 text-lg font-bold text-[var(--foreground)]">
                                        {cert.course_title}
                                    </h2>
                                    <p className="mt-1 font-medium">{cert.student_name}</p>
                                    <p className="muted mt-1 text-sm">
                                        Instructor: {cert.instructor_name}
                                    </p>
                                    <p className="muted mt-2 font-mono text-xs">
                                        {cert.verification_number}
                                    </p>
                                </div>

                                <a
                                    className="btn btn-primary mt-4 w-full text-center"
                                    href={`/backend-api/certificates/${cert.verification_number}/download/`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Download PDF
                                </a>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}