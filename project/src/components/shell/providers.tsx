"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange><TooltipProvider delayDuration={250}>{children}<Toaster position="bottom-right" richColors /></TooltipProvider></ThemeProvider>;
}
