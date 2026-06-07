"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, ChevronRight, Database, LockKeyhole, Search, Sparkles } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/ai-research": "AI Research",
  "/reports": "Reports",
  "/pattern-explorer": "Pattern Explorer",
  "/session-analyzer": "Session Analyzer",
  "/saved-studies": "Saved Studies",
  "/settings": "Settings",
  "/login": "Sign In",
  "/register": "Register"
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageTitle = titles[pathname] ?? "Research";

  return (
    <div className="min-h-screen bg-[#08090b] text-foreground">
      <div className="fixed inset-0 -z-10 workspace-grid opacity-40" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-white/8 bg-[#0b0d10]/95 backdrop-blur-xl lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-white/8 px-5">
            <div className="flex size-9 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-normal">Nasdaq Research</div>
              <div className="truncate text-xs text-muted-foreground">Private terminal</div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.055] hover:text-foreground",
                    active && "bg-white/[0.075] text-foreground"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-y-2 left-0 w-1 rounded-r bg-cyan-300"
                      transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    />
                  ) : null}
                  <Icon className="size-4" />
                  <span className="truncate">{item.label}</span>
                  {active ? <ChevronRight className="ml-auto size-4 text-cyan-200" /> : null}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/8 p-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Database className="size-3.5 text-emerald-300" />
                  Dataset
                </div>
                <Badge variant="info">NASDAQ</Badge>
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-muted-foreground">
                Real data only
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/8 bg-[#08090b]/88 px-4 backdrop-blur-xl sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              <span>Private workspace</span>
            </div>
            <h1 className="truncate text-lg font-semibold tracking-normal">{pageTitle}</h1>
          </div>

          <div className="hidden w-full max-w-sm items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 sm:flex">
            <Search className="size-4 text-muted-foreground" />
            <Input
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              placeholder="Search studies, reports, datasets"
            />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Notifications">
                <Bell className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>
          <Button asChild variant="premium" className="hidden sm:inline-flex">
            <Link href="/ai-research">
              <Sparkles className="size-4" />
              Ask AI
            </Link>
          </Button>
        </header>

        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
