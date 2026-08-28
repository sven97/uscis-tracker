import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Moon, Settings, Sun } from "lucide-react";
import { Button, buttonVariants } from "@/components/animate-ui/components/buttons/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/use-theme";

export function Layout({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24">
      <header className="mb-8 flex items-center justify-between border-b py-5">
        <Link to="/" className="font-heading text-lg font-semibold tracking-tight">
          USCIS Case Tracker
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Link to="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Settings />
            Settings
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
