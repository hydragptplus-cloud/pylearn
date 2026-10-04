"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  BadgeCheck,
  Banknote,
  BookOpen,
  Brain,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "./auth-provider";

const NAVIGATION_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, scope: "all" },
  { href: "/courses", label: "Courses", icon: BookOpen, scope: "all" },
  { href: "/quizzes", label: "Quizzes", icon: ClipboardCheck, scope: "all" },
  { href: "/search", label: "Search", icon: Search, scope: "all" },
  { href: "/progress", label: "Student Progress", icon: ChartNoAxesCombined, scope: "all" },
  { href: "/learning-path", label: "AI Learning Path", icon: Brain, scope: "student-admin" },
  { href: "/payments", label: "Payments", icon: Banknote, scope: "student-admin" },
  { href: "/certificates", label: "Certificates", icon: BadgeCheck, scope: "student" },
  { href: "/instructor-applications", label: "Instructor Applications", icon: Users, scope: "admin" },
  { href: "/users", label: "User Management", icon: Users, scope: "admin" },
  { href: "/ai-settings", label: "AI Settings", icon: Brain, scope: "admin" },
  { href: "/profile", label: "Profile", icon: UserRound, scope: "all" },
] as const;

function normalizePath(path: string) {
  return path === "/" ? path : path.replace(/\/+$/, "");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromSource = searchParams?.get("from");
  const isFromLearningPath = fromSource === "learning-path";

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (!loading && user?.must_change_password && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <main className="min-h-screen grid place-items-center">
        Loading PyLearn…
      </main>
    );
  }

  const visibleNavItems = NAVIGATION_ITEMS.filter((item) => {
    if (item.scope === "all") return true;
    if (item.scope === "admin") return user.role === "ADMIN";
    if (item.scope === "student") return user.role === "STUDENT";
    if (item.scope === "student-admin") return user.role !== "INSTRUCTOR";
    return false;
  });

  const currentPath = normalizePath(pathname);

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar p-4 lg:w-64 lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto lg:shrink-0 lg:self-start">
        <Link
          href="/dashboard"
          className="flex items-center px-2 py-3"
          aria-label="PyLearn dashboard"
        >
          <BrandLogo />
        </Link>

        <nav className="mt-5 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {visibleNavItems.map(({ href, label, icon: Icon }) => {
            let isActive = currentPath === href || currentPath.startsWith(`${href}/`);

            if (isFromLearningPath && currentPath.startsWith("/quizzes")) {
              if (href === "/learning-path") {
                isActive = true;
              } else if (href === "/quizzes") {
                isActive = false;
              }
            }

            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? "nav-link-active" : "nav-link-inactive"
                  }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <header className="app-header flex h-16 items-center justify-between border-b px-5">
          <div className="flex items-center gap-2">
            {user.avatar && (
              <img
                src={user.avatar}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            )}
            <strong>{user.name}</strong>
            <span className="badge ml-1">{user.role}</span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void signOut()}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}