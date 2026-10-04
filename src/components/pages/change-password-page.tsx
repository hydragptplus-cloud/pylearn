"use client";

import { FormEvent, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { ErrorMessage, PageHeader } from "@/components/ui";

export function ChangePasswordPage() {
    const { refresh } = useAuth();
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        const formData = new FormData(event.currentTarget);
        const values = Object.fromEntries(formData);

        if (values.new_password !== values.confirm_password) {
            setError("Passwords do not match.");
            return;
        }

        try {
            setIsSubmitting(true);
            await api("/auth/change-password/", {
                method: "POST",
                body: jsonBody(values),
            });

            await refresh();
            window.location.assign("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to change password");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Change Password"
                description="Set a private password before continuing."
            />

            <form
                className="panel max-w-lg grid gap-4 p-6"
                onSubmit={handleSubmit}
            >
                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-[var(--foreground)]">
                        Temporary Password
                    </label>
                    <input
                        className="field w-full"
                        name="current_password"
                        type="password"
                        placeholder="Enter temporary password"
                        autoComplete="current-password"
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-[var(--foreground)]">
                        New Password
                    </label>
                    <input
                        className="field w-full"
                        name="new_password"
                        type="password"
                        placeholder="Enter new password (min. 8 characters)"
                        minLength={8}
                        autoComplete="new-password"
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-[var(--foreground)]">
                        Confirm New Password
                    </label>
                    <input
                        className="field w-full"
                        name="confirm_password"
                        type="password"
                        placeholder="Re-enter new password"
                        autoComplete="new-password"
                        required
                    />
                </div>

                {error && <ErrorMessage message={error} />}

                <button
                    type="submit"
                    className="btn btn-primary mt-2"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Changing password..." : "Change password"}
                </button>
            </form>
        </div>
    );
}