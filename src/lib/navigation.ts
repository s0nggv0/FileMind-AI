import type { NavigationItem } from "@/types";

export const navItems = [
  {
    href: "/dashboard",
    label: "概览",
    description: "查看个人知识空间",
    iconKey: "overview",
  },
  {
    href: "/workspace",
    label: "工作区",
    description: "审阅 AI 整理建议",
    iconKey: "workspace",
  },
  {
    href: "/library",
    label: "资料库",
    description: "浏览与筛选文件",
    iconKey: "library",
  },
  {
    href: "/search",
    label: "智能搜索",
    description: "围绕问题寻找资料",
    iconKey: "search",
  },
  {
    href: "/graph",
    label: "知识图谱",
    description: "探索文档与概念的联系",
    iconKey: "graph",
  },
  {
    href: "/cleanup",
    label: "重复候选",
    description: "核对重复，保留原件",
    iconKey: "cleanup",
  },
] satisfies NavigationItem[];

export const settingsNavItem = {
  href: "/settings",
  label: "设置",
  description: "管理个人偏好",
};

export function getNavigationItem(pathname: string) {
  return navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
