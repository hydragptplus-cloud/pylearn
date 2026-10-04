"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { api, jsonBody } from "@/lib/api";
import { firebaseGoogleAuth } from "@/lib/firebase";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "./auth-provider";

type AuthMode = "login" | "register" | "forgot";

const MODE_CONTENT = {
  login: {
    title: "Welcome back",
    subtitle: "Enter your credentials to access your account",
    submitText: "Sign in",
  },
  register: {
    title: "Create student account",
    subtitle: "Fill in your details to get started",
    submitText: "Register",
  },
  forgot: {
    title: "Reset your password",
    subtitle: "Enter your email to receive a password reset link",
    submitText: "Send reset link",
  },
} as const;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { refresh } = useAuth();

  const [department, setDepartment] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const values = Object.fromEntries(new FormData(event.currentTarget));

    try {
      if (isForgot) {
        await api("/auth/password-reset/", {
          method: "POST",
          body: jsonBody(values),
        });
        setDone(true);
      } else {
        await api(`/auth/${mode}/`, {
          method: "POST",
          body: jsonBody(values),
        });
        await refresh();
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (isRegister && !department.trim()) {
      setError("Please enter your department before continuing with Google.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const { auth, provider } = firebaseGoogleAuth();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      await api("/auth/firebase/", {
        method: "POST",
        body: jsonBody({
          id_token: idToken,
          intent: mode,
          department: department.trim(),
        }),
      });

      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4 sm:p-6 bg-[var(--background)] transition-colors duration-200">
      <section className="panel w-full max-w-md p-6 sm:p-8 rounded-2xl border border-[var(--border)] bg-[var(--surface,var(--background))] space-y-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <BrandLogo />
            <h1 className="text-2xl font-bold mt-4 tracking-tight text-[var(--foreground)]">
              {MODE_CONTENT[mode].title}
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {MODE_CONTENT[mode].subtitle}
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 p-3.5 text-sm rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400"
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

        {/* Reset Confirmation */}
        {done ? (
          <div className="p-4 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] rounded-xl text-[var(--primary-dark)] dark:text-[var(--primary)] text-sm space-y-2">
            <p className="font-semibold">Reset email requested</p>
            <p className="text-xs opacity-90 leading-relaxed">
              If an account with that email exists, reset instructions have been
              sent. Please check your inbox and spam folder.
            </p>
          </div>
        ) : (
          <>
            {/* Google OAuth Action */}
            {!isForgot && (
              <div className="space-y-5">
                <button
                  type="button"
                  className="btn btn-secondary w-full py-2.5 px-4 flex items-center justify-center gap-3 font-medium transition-all"
                  disabled={busy}
                  onClick={signInWithGoogle}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27a7.22 7.22 0 0 1 0-4.54V6.58H1.25a11.98 11.98 0 0 0 0 10.84l4.03-3.15Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                    />
                  </svg>
                  <span>
                    {isRegister
                      ? "Create account with Google"
                      : "Continue with Google"}
                  </span>
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase whitespace-nowrap">
                    Or continue with
                  </span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
              </div>
            )}

            {/* Credential Form */}
            <form className="space-y-4" onSubmit={submit}>
              {isRegister && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      First name
                    </label>
                    <input
                      className="field w-full"
                      name="first_name"
                      placeholder="First name"
                      autoComplete="given-name"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Last name
                    </label>
                    <input
                      className="field w-full"
                      name="last_name"
                      placeholder="Last name"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)]">
                  Email address
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

              {!isForgot && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Password
                    </label>
                    {isLogin && (
                      <Link
                        className="text-xs font-medium text-[var(--muted)] hover:text-[var(--primary)] transition-colors"
                        href="/forgot-password"
                        tabIndex={-1}
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      className="field w-full pr-11"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      minLength={8}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
                    >
                      {showPassword ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {isRegister && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Department
                  </label>
                  <input
                    className="field w-full"
                    name="department"
                    placeholder="e.g. Computer Science"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
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
                    {busy ? "Please wait…" : MODE_CONTENT[mode].submitText}
                  </span>
                </button>
              </div>
            </form>
          </>
        )}

        {/* Footer Navigation */}
        <div className="pt-4 border-t border-[var(--border)] text-sm text-center space-y-3">
          <p className="text-[var(--muted)]">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <Link
              className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
              href={isLogin ? "/register" : "/login"}
            >
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>

          {isLogin && (
            <div className="flex items-center justify-center gap-3 text-xs text-[var(--muted)]">
              <Link
                href="/apply-instructor"
                className="hover:text-[var(--foreground)] transition-colors"
              >
                Apply as Instructor
              </Link>
              <span className="text-[var(--border)]">•</span>
              <Link
                href="/application-status"
                className="hover:text-[var(--foreground)] transition-colors"
              >
                Application Status
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}