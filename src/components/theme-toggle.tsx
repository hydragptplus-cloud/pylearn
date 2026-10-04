"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { toggleTheme } = useTheme();
  return <button type="button" className="btn btn-secondary theme-toggle" onClick={toggleTheme} aria-label="Toggle color theme" title="Toggle color theme">
    <Sun className="theme-icon-light" size={17}/>
    <Moon className="theme-icon-dark" size={17}/>
  </button>;
}
