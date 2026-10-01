export type NavigationIconKey =
  | "overview"
  | "workspace"
  | "library"
  | "search"
  | "graph"
  | "cleanup";

export interface NavigationItem {
  href: string;
  label: string;
  description: string;
  iconKey: NavigationIconKey;
}
