import { create } from "zustand";
import { Settings } from "../types";
type State = Settings & {
  setTheme: (theme: Settings["theme"]) => void;
  toggle: (key: "lockEnabled" | "hidePreviews") => void;
};
export const useSettingsStore = create<State>((set) => ({
  theme: "light",
  lockEnabled: false,
  hidePreviews: false,
  setTheme: (theme) => set({ theme }),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
}));
