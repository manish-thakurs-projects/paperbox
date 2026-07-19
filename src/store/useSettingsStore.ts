import { create } from "zustand";
import { Settings } from "../types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "@paper-box/settings-v1";

type Persisted = Settings;

type State = Settings & {
  lockSuppressed: boolean;
  setLockSuppressed: (enabled: boolean) => void;
  setTheme: (theme: Settings["theme"]) => void;
  setLockEnabled: (enabled: boolean) => void;
  toggle: (key: "hidePreviews") => void;
};

const save = async (data: Persisted) => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("save settings error", e);
  }
};

const load = async (): Promise<Persisted | null> => {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("load settings error", e);
    return null;
  }
};

export const useSettingsStore = create<State>((set, get) => {
  load().then((persisted) => {
    if (persisted) {
      set({
        theme: persisted.theme ?? "system",
        hidePreviews: persisted.hidePreviews ?? false,
        lockEnabled: persisted.lockEnabled ?? false,
      } as any);
    }
  });

  return {
    theme: "system",
    hidePreviews: false,
    lockEnabled: false,
    lockSuppressed: false,
    setTheme: (theme) => {
      set({ theme });
      const p = get();
      save({ theme, hidePreviews: p.hidePreviews, lockEnabled: p.lockEnabled });
    },
    setLockEnabled: (enabled) => {
      set({ lockEnabled: enabled });
      const p = get();
      save({ theme: p.theme, hidePreviews: p.hidePreviews, lockEnabled: enabled });
    },
    setLockSuppressed: (enabled) => {
      set({ lockSuppressed: enabled });
    },
    toggle: (key) => {
      set((s) => {
        const next = { [key]: !s[key] } as any;
        const p = { theme: s.theme, hidePreviews: key === "hidePreviews" ? !s.hidePreviews : s.hidePreviews, lockEnabled: s.lockEnabled };
        save(p).catch(() => {});
        return next;
      });
    },
  } as State;
});
