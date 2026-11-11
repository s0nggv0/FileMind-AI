"use client";

import { create } from "zustand";

interface UiState {
  commandOpen: boolean;
  mobileNavOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  mobileNavOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));
