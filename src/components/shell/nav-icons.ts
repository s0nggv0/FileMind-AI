import { House, Layers3, Library, Search, Network, ScanLine, type LucideIcon } from "lucide-react";
import type { NavigationIconKey } from "@/types";

export const navIcons: Record<NavigationIconKey, LucideIcon> = {
  overview: House,
  workspace: Layers3,
  library: Library,
  search: Search,
  graph: Network,
  cleanup: ScanLine,
};
