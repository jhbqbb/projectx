import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Nasdaq Research Terminal",
  description: "Private AI research workspace for Nasdaq session statistics."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <TooltipProvider>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
