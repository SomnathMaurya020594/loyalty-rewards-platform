import { useState, useEffect } from "react";

// Remembers dark mode choice in localStorage so it persists on refresh
export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved === "true";
  });

  useEffect(() => {
    // Adds/removes the "dark" class on <html>, which Tailwind's dark: styles react to
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("darkMode", isDark);
  }, [isDark]);

  return [isDark, setIsDark];
}