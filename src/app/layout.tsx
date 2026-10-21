import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FileMind AI · 知序", template: "%s · FileMind AI" },
  description: "让散乱的文件，成为相互连接的知识。FileMind AI 个人知识空间。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html data-scroll-behavior="smooth" lang="zh-CN" suppressHydrationWarning><body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}><Providers>{children}</Providers></body></html>;
}
