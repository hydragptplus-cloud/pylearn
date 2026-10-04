import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { FeedbackDialogProvider } from "@/components/feedback-dialog-provider";
import { branding } from "@/lib/branding";

export const metadata: Metadata = {
  title: "PyLearn Portal",
  description: "Learning management and AI-guided learning paths",
  icons: { icon: branding.faviconLight },
};

const themeScript = `(()=>{try{const saved=localStorage.getItem("pylearn-theme");const theme=saved==="light"||saved==="dark"?saved:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }}/></head>
      <body><ThemeProvider><FeedbackDialogProvider><AuthProvider>{children}</AuthProvider></FeedbackDialogProvider></ThemeProvider></body>
    </html>
  );
}
