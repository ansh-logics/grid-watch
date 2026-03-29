import { ActivitySquare, Bell, ChartLine, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { getAuthContext } from "../../utils/auth";
import { shortId } from "../../utils/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../../utils/cn";

const links = [
  { href: "/dashboard", label: "Live Dashboard", icon: ActivitySquare },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/history", label: "History", icon: ChartLine },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => localStorage.getItem("gridwatch.dark") === "1");
  const { userId, zoneId, jwt } = getAuthContext();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function toggleDarkMode() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("gridwatch.dark", next ? "1" : "0");
    document.documentElement.classList.toggle("dark", next);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="text-lg font-semibold tracking-tight">
            GridWatch
          </Link>
          <nav className="flex items-center gap-2">
            <Badge variant="outline" className="hidden md:inline-flex">
              {jwt ? "JWT Auth Mode" : "Dev Auth Mode"}
            </Badge>
            <span className="hidden text-xs text-muted-foreground md:inline">
              Operator: {shortId(userId)} | Zone: {shortId(zoneId)}
            </span>
            {links.map((link) => (
              <NavLink
                key={link.href}
                to={link.href}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors",
                    isActive && "bg-accent text-accent-foreground"
                  )
                }
              >
                <span className="inline-flex items-center gap-2">
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </span>
              </NavLink>
            ))}
            <Button variant="ghost" size="sm" onClick={toggleDarkMode} aria-label="Toggle color mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
