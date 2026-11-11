"use client";

import { useEffect } from "react";
import { useUiStore } from "@/store/ui-store";

export function useCommandShortcut() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.repeat) return;
      event.preventDefault();
      const state = useUiStore.getState();
      state.setMobileNavOpen(false);
      state.setCommandOpen(!state.commandOpen);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
