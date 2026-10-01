import type { NavigationItem } from "@/types";

export const navItems = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "查看个人知识空间",
    iconKey: "overview",
  },
  {
    href: "/workspace",
    label: "Workspace",
    description: "审阅 AI 整理建议",
    iconKey: "workspace",
  },
  {
    href: "/library",
    label: "Library",
    description: "浏览与筛选文件",
    iconKey: "library",
  },
  {
    href: "/search",
    label: "AI Search",
    description: "围绕问题寻找资料",
    iconKey: "search",
  },
  {
    href: "/graph",
    label: "Knowledge Graph",
    description: "探索文档与概念的联系",
    iconKey: "graph",
  },
  {
    href: "/cleanup",
    label: "Smart Cleanup",
    description: "审阅待整理项目",
    iconKey: "cleanup",
  },
] satisfies NavigationItem[];

export const settingsNavItem = {
  href: "/settings",
  label: "Settings",
  description: "管理个人偏好",
};

export function getNavigationItem(pathname: string) {
  return navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
