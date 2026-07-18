import { create } from "zustand";
import { Settings } from "../types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "@paper-box/settings-v1";

type Persisted = Settings & { passcodeHash?: string };

type State = Settings & {
  passcodeHash?: string;
  setTheme: (theme: Settings["theme"]) => void;
  setLockEnabled: (enabled: boolean) => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setPasscode: (passcode: string) => Promise<void>;
  clearPasscode: () => Promise<void>;
  verifyPasscode: (passcode: string) => Promise<boolean>;
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

// Try to use expo-crypto if available, otherwise fallback to a JS SHA-256 implementation
async function digestString(input: string): Promise<string> {
  // dynamic require so bundler doesn't fail if expo-crypto isn't installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Crypto = require("expo-crypto");
    if (Crypto && Crypto.digestStringAsync) {
      return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
    }
  } catch (e) {
    // fall through to JS implementation
  }

  function rightRotate(x: number, n: number) {
    return (x >>> n) | (x << (32 - n));
  }

  const utf8Encode = (str: string) => {
    // TextEncoder is available in React Native environments used here
    const encoder = new TextEncoder();
    return encoder.encode(str);
  };

  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;
  const withOne = new Uint8Array(bytes.length + 1);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;

  let paddedLength = withOne.length;
  while ((paddedLength % 64) !== 56) paddedLength++;
  const padded = new Uint8Array(paddedLength + 8);
  padded.set(withOne);
  for (let i = 0; i < 8; i++) {
    padded[padded.length - 1 - i] = (bitLen >>> (8 * i)) & 0xff;
  }

  const H = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);

  const w = new Uint32Array(64);

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = (padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | (padded[j + 3]);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 = (rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

    for (let t = 0; t < 64; t++) {
      const S1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < H.length; i++) {
    hex += ("00000000" + H[i].toString(16)).slice(-8);
  }
  return hex;
}

export const useSettingsStore = create<State>((set, get) => {
  // initialize with defaults
  load().then((persisted) => {
    if (persisted) {
      set({
        theme: persisted.theme ?? "light",
        lockEnabled: persisted.lockEnabled ?? false,
        hidePreviews: persisted.hidePreviews ?? false,
        biometricEnabled: persisted.biometricEnabled ?? false,
        passcodeHash: persisted.passcodeHash,
      } as any);
    }
  });

  return {
    theme: "light",
    lockEnabled: false,
    hidePreviews: false,
    biometricEnabled: false,
    passcodeHash: undefined,
    setTheme: (theme) => {
      set({ theme });
      const p = get();
      save({ theme, lockEnabled: p.lockEnabled, hidePreviews: p.hidePreviews, biometricEnabled: (p as any).biometricEnabled, passcodeHash: p.passcodeHash });
    },
    setLockEnabled: async (enabled) => {
      set({ lockEnabled: enabled });
      const p = get();
      await save({ theme: p.theme, lockEnabled: enabled, hidePreviews: p.hidePreviews, biometricEnabled: (p as any).biometricEnabled, passcodeHash: p.passcodeHash });
    },
    setBiometricEnabled: async (enabled) => {
      set({ biometricEnabled: enabled });
      const p = get();
      await save({ theme: p.theme, lockEnabled: p.lockEnabled, hidePreviews: p.hidePreviews, biometricEnabled: enabled, passcodeHash: p.passcodeHash });
    },
    setPasscode: async (passcode) => {
      try {
        const hash = await digestString(passcode);
        set({ passcodeHash: hash });
        const p = get();
        await save({ theme: p.theme, lockEnabled: p.lockEnabled, hidePreviews: p.hidePreviews, biometricEnabled: (p as any).biometricEnabled, passcodeHash: hash });
      } catch (e) {
        console.warn("setPasscode error", e);
      }
    },
    clearPasscode: async () => {
      set({ passcodeHash: undefined });
      const p = get();
      await save({ theme: p.theme, lockEnabled: p.lockEnabled, hidePreviews: p.hidePreviews, biometricEnabled: (p as any).biometricEnabled });
    },
    verifyPasscode: async (passcode) => {
      try {
        const hash = await digestString(passcode);
        return hash === get().passcodeHash;
      } catch (e) {
        console.warn("verify passcode error", e);
        return false;
      }
    },
    toggle: (key) => {
      set((s) => {
        const next = { [key]: !s[key] } as any;
        // persist
        const p = { theme: s.theme, lockEnabled: s.lockEnabled, hidePreviews: key === "hidePreviews" ? !s.hidePreviews : s.hidePreviews, biometricEnabled: (s as any).biometricEnabled, passcodeHash: (s as any).passcodeHash } as Persisted;
        save(p).catch(() => {});
        return next;
      });
    },
  } as State;
});
