import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Platform, PermissionsAndroid } from "react-native";
import RNFS from "react-native-fs";
import saf from "../libs/saf";
import { Folder, VaultFile } from "../types";

// SecureStore defensive wrapper: if the native ExpoSecureStore module isn't available at runtime,
// fall back to AsyncStorage so the app doesn't crash in development. Falling back weakens
// secrecy (AsyncStorage is not hardware-backed), but avoids a hard crash; log warnings so
// this can be diagnosed and a proper native rebuild performed.
const secureStoreAvailable = (() => {
  try {
    return (
      !!SecureStore &&
      typeof (SecureStore as any).getItemAsync === "function" &&
      typeof (SecureStore as any).setItemAsync === "function"
    );
  } catch (e) {
    return false;
  }
})();

async function secureGetItem(key: string): Promise<string | null> {
  if (secureStoreAvailable) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      try {
      } catch (_) {}
    }
  } else {
    try {
    } catch (_) {}
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    try {
    } catch (_) {}
    return null;
  }
}

async function secureSetItem(key: string, value: string): Promise<void> {
  if (secureStoreAvailable) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch (e) {
      try {
      } catch (_) {}
    }
  } else {
    try {
    } catch (_) {}
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch (e) {
    try {
    } catch (_) {}
    throw e;
  }
}

const KEY = "@paper-box/v1";
const KEY_ALIAS = "paperbox.vault.key";
const BACKUP_FILE = ".paperbox-vault.enc";
const BACKUP_DIRS =
  Platform.OS === "android"
    ? [
        "file:///storage/emulated/0/.paperbox",
        "file:///storage/emulated/0/Android/data/paperbox.dustmedia.org/files/.paperbox",
        "file:///storage/emulated/0/Documents/.paperbox",
      ]
    : [];
const PERSISTENT_VAULT_DIR = `${(FileSystem as any).documentDirectory ?? ""}vault/`;

// Dedicated decrypted cache subdirectory for temporary decrypted files. App will explicitly
// clear files from here; using a dedicated folder makes purging easier and avoids
// mixing plaintext temp files with other cache entries.
const DECRYPTED_CACHE_DIR = `${(FileSystem as any).cacheDirectory ?? ""}vault-decrypted/`;

// External vault directory (public external storage) - survives app uninstall on Android
const EXTERNAL_VAULT_DIR =
  Platform.OS === "android" && (RNFS as any).ExternalStorageDirectoryPath
    ? `file://${(RNFS as any).ExternalStorageDirectoryPath}/.paperbox/`
    : PERSISTENT_VAULT_DIR;

const EXTERNAL_KEY_META = `${EXTERNAL_VAULT_DIR}key.meta.json`;
const normalizeVault = (
  value: unknown,
): { files: VaultFile[]; folders: Folder[] } => {
  if (!value || typeof value !== "object") {
    return { files: [], folders: [] };
  }

  const candidate = value as {
    files?: VaultFile[];
    folders?: Folder[];
    vault?: { files?: VaultFile[]; folders?: Folder[] };
  };

  const files = Array.isArray(candidate.files)
    ? candidate.files
    : Array.isArray(candidate.vault?.files)
      ? candidate.vault.files
      : [];

  const folders = Array.isArray(candidate.folders)
    ? candidate.folders
    : Array.isArray(candidate.vault?.folders)
      ? candidate.vault.folders
      : [];

  return { files, folders };
};

const bytesToBase64 = (bytes: Uint8Array) => {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("base64");
    }
  } catch {
    // fallthrough
  }

  // If btoa is available, use a chunked String.fromCharCode approach to avoid call size limits
  try {
    if (typeof global.btoa === "function") {
      const chunkSize = 0x8000; // 32KB chunks
      let binary = "";
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(
          null,
          Array.prototype.slice.call(chunk),
        );
      }
      return global.btoa(binary);
    }
  } catch (e) {
    // fallthrough to pure-js encoder
  }

  // Pure JS base64 encoder as a last resort (works in all environments)
  const base64chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i;
  for (i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;
    result += base64chars[(triplet >> 18) & 0x3f];
    result += base64chars[(triplet >> 12) & 0x3f];
    result += i + 1 < bytes.length ? base64chars[(triplet >> 6) & 0x3f] : "=";
    result += i + 2 < bytes.length ? base64chars[triplet & 0x3f] : "=";
  }
  return result;
};

const base64ToBytes = (value: string) => {
  try {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(value, "base64");
      return new Uint8Array(buf);
    }
  } catch {
    // fallthrough
  }

  if (typeof global.atob === "function") {
    const binary = global.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  return new Uint8Array();
};

// Try to load node-forge for pure-JS crypto fallback
let _forge: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/ban-ts-comment
  // @ts-ignore
  _forge = require("node-forge");
} catch (e) {
  _forge = null;
}

// Helper: convert Uint8Array to forge byte string
const u8ToForgeBytes = (u8: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
};

// Helper: convert forge byte string to Uint8Array
const forgeBytesToU8 = (s: string) => {
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
};

// Pure-JS AES-GCM encrypt/decrypt using node-forge
const forgeEncrypt = async (
  keyRaw: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
) => {
  if (!_forge) throw new Error("node-forge not available");
  const forgeKey = u8ToForgeBytes(keyRaw);
  const cipher = _forge.cipher.createCipher("AES-GCM", forgeKey);
  cipher.start({ iv: u8ToForgeBytes(iv), tagLength: 128 });
  cipher.update(_forge.util.createBuffer(u8ToForgeBytes(plaintext)));
  const ok = cipher.finish();
  if (!ok) throw new Error("forge encrypt failed");
  const ciphertext = cipher.output.getBytes();
  const tag = cipher.mode.tag.getBytes();
  const out = forgeBytesToU8(ciphertext + tag);
  return out;
};

const forgeDecrypt = async (
  keyRaw: Uint8Array,
  iv: Uint8Array,
  payload: Uint8Array,
) => {
  if (!_forge) throw new Error("node-forge not available");
  // last 16 bytes are tag
  const tagLen = 16;
  if (payload.length < tagLen) throw new Error("invalid payload");
  const ct = payload.slice(0, payload.length - tagLen);
  const tag = payload.slice(payload.length - tagLen);
  const forgeKey = u8ToForgeBytes(keyRaw);
  const decipher = _forge.cipher.createDecipher("AES-GCM", forgeKey);
  decipher.start({ iv: u8ToForgeBytes(iv), tag: u8ToForgeBytes(tag) });
  decipher.update(_forge.util.createBuffer(u8ToForgeBytes(ct)));
  const ok = decipher.finish();
  if (!ok) throw new Error("forge decrypt failed or auth tag mismatch");
  const plain = decipher.output.getBytes();
  return forgeBytesToU8(plain);
};

// Polyfill crypto object for React Native if not available
const getCrypto = () => {
  if (typeof global.crypto !== "undefined" && global.crypto.subtle) {
    return global.crypto;
  }

  // If node-forge is available, provide subtle-like functions backed by forge
  if (_forge) {
    return {
      getRandomValues: (arr: Uint8Array) => {
        const bytes = _forge.random.getBytesSync(arr.length);
        for (let i = 0; i < arr.length; i++) arr[i] = bytes.charCodeAt(i);
        return arr;
      },
      subtle: {
        importKey: async (
          format: any,
          keyData: any,
          algorithm: any,
          extractable: any,
          keyUsages: any,
        ) => {
          // For AES-GCM raw import: return the raw bytes in a format our forge wrappers can use
          if (format === "raw") {
            if (keyData instanceof Uint8Array) return keyData;
            if (typeof keyData === "string") return base64ToBytes(keyData);
            if (keyData.buffer) return new Uint8Array(keyData.buffer);
          }
          throw new Error("importKey format unsupported in fallback");
        },
        encrypt: async (alg: any, key: any, data: any) => {
          // alg.iv expected as Uint8Array
          const iv =
            alg.iv instanceof Uint8Array
              ? alg.iv
              : new Uint8Array(alg.iv || []);
          const keyRaw = key as Uint8Array;
          const payload = await forgeEncrypt(keyRaw, iv, new Uint8Array(data));
          return payload.buffer;
        },
        decrypt: async (alg: any, key: any, data: any) => {
          const iv =
            alg.iv instanceof Uint8Array
              ? alg.iv
              : new Uint8Array(alg.iv || []);
          const keyRaw = key as Uint8Array;
          const plain = await forgeDecrypt(keyRaw, iv, new Uint8Array(data));
          return plain.buffer;
        },
      },
    };
  }

  // Fallback minimal object that throws for subtle operations
  return {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i += 1) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    subtle: {
      encrypt: async () => {
        throw new Error("SubtleCrypto not available - WebCrypto API required");
      },
      decrypt: async () => {
        throw new Error("SubtleCrypto not available - WebCrypto API required");
      },
      importKey: async () => {
        throw new Error("SubtleCrypto not available - WebCrypto API required");
      },
    },
  };
};

// No passphrase onboarding in this build. Use SecureStore-backed key (legacy) for encryption.
let runtimeVaultKey: CryptoKey | null = null;

const getVaultKey = async (): Promise<CryptoKey> => {
  const crypto = getCrypto();
  if (runtimeVaultKey) return runtimeVaultKey;

  // Fall back to SecureStore-backed key (legacy). Note: this key will be lost on uninstall.
  let material = await secureGetItem(KEY_ALIAS);
  if (!material) {
    const random = crypto.getRandomValues(new Uint8Array(32));
    material = bytesToBase64(random);
    await secureSetItem(KEY_ALIAS, material);
  }

  return (crypto.subtle as any).importKey(
    "raw",
    base64ToBytes(material),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
};

const encryptVault = async (value: string): Promise<string> => {
  const key = await getVaultKey();
  const crypto = getCrypto();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);

  const encrypted = await (crypto.subtle as any).encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return JSON.stringify({
    version: 1,
    iv: bytesToBase64(iv),
    payload: bytesToBase64(new Uint8Array(encrypted)),
  });
};

const decryptVault = async (
  value: string,
): Promise<{ files: VaultFile[]; folders: Folder[] }> => {
  const blob = JSON.parse(value) as {
    version?: number;
    iv?: string;
    payload?: string;
  };
  if (!blob.iv || !blob.payload) {
    return normalizeVault(JSON.parse(value));
  }

  const crypto = getCrypto();
  const iv = base64ToBytes(blob.iv);
  const payload = base64ToBytes(blob.payload);

  const key = await getVaultKey();
  const decrypted = await (crypto.subtle as any).decrypt(
    { name: "AES-GCM", iv: base64ToBytes(blob.iv) },
    key,
    base64ToBytes(blob.payload),
  );

  const text = new TextDecoder().decode(decrypted);
  return normalizeVault(JSON.parse(text));
};

const writeDurableBackup = async (encrypted: string) => {
  if (Platform.OS !== "android") return;

  // Prefer writing durable backup into SAF tree if configured (survives uninstall)
  try {
    const tree = await getExternalTreeUri();
    if (tree) {
      // write JSON as base64 into SAF
      const payloadBase64 = bytesToBase64(new TextEncoder().encode(encrypted));
      await writeBytesToExternal(BACKUP_FILE, payloadBase64);
      return;
    }
  } catch (e) {
  }

  // Fallback: write into app documentDirectory/persistent vault dir which is writable
  try {
    await FileSystem.makeDirectoryAsync(PERSISTENT_VAULT_DIR, {
      intermediates: true,
    });
    const fileUri = `${PERSISTENT_VAULT_DIR}${BACKUP_FILE}`;
    await FileSystem.writeAsStringAsync(fileUri, encrypted, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return;
  } catch (error) {
  }
};

const readDurableBackup = async (): Promise<{
  files: VaultFile[];
  folders: Folder[];
} | null> => {
  if (Platform.OS !== "android") return null;

  // Prefer reading from SAF if available
  try {
    const tree = await getExternalTreeUri();
    if (tree) {
      const base64 = await readBytesFromExternal(BACKUP_FILE);
      if (base64) {
        const bytes = base64ToBytes(base64);
        const text = new TextDecoder().decode(bytes);
        return await decryptVault(text);
      }
    }
  } catch (e) {
  }

  // Fallback: look in app documentDirectory
  try {
    const fileUri = `${PERSISTENT_VAULT_DIR}${BACKUP_FILE}`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return await decryptVault(raw);
  } catch (error) {
  }

  return null;
};

const readStoredVault = async (
  raw: string | null,
): Promise<{ files: VaultFile[]; folders: Folder[] }> => {
  if (!raw) {
    return { files: [], folders: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "payload" in parsed &&
      "iv" in parsed
    ) {
      return await decryptVault(raw);
    }
    return normalizeVault(parsed);
  } catch {
    return { files: [], folders: [] };
  }
};

export async function decryptVaultFileForUse(file: VaultFile): Promise<string> {
  if (
    !file.uri ||
    file.uri.startsWith("http://") ||
    file.uri.startsWith("https://")
  ) {
    return file.uri;
  }

  const encryptedBase64 = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const encryptedBytes = base64ToBytes(encryptedBase64);
  const iv = encryptedBytes.slice(0, 12);
  const payload = encryptedBytes.slice(12);

  const key = await getVaultKey();
  const crypto = getCrypto();
  // Log which crypto path is used to help diagnose decryption problems
  try {
    // eslint-disable-next-line no-console
  } catch (e) {
    // ignore
  }
  const decrypted = await (crypto.subtle as any).decrypt(
    { name: "AES-GCM", iv },
    key,
    payload,
  );
  const plain = new Uint8Array(decrypted);

  // Basic integrity checks to avoid writing corrupted previews (helps diagnose blank previews)
  try {
    if (plain.length === 0) {
      throw new Error("Decrypted payload is empty");
    }

    const ext = (file.extension || "").toLowerCase();
    // If PDF, ensure magic header starts with %PDF
    if (ext === "pdf") {
      const header = String.fromCharCode.apply(
        null,
        Array.prototype.slice.call(plain.slice(0, 4)),
      );
      if (!header.startsWith("%PDF")) {
        throw new Error("Decrypted PDF appears invalid");
      }
    }
  } catch (checkErr) {
    // Surface a helpful warning and rethrow so caller can show an error instead of a blank page
    throw checkErr;
  }

  // Ensure dedicated decrypted cache directory exists and is writable, then write file there.
  const ensureDir = async (dir: string) => {
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch (e) {
      try {
      } catch (_) {}
    }

    try {
      const info = await (FileSystem as any).getInfoAsync(dir);
      if (info.exists && info.isDirectory) return true;
    } catch (e) {
      try {
      } catch (_) {}
    }
    return false;
  };

  // Try with configured DECRYPTED_CACHE_DIR, then without file:// prefix as fallback, then fallback to cacheDirectory root.
  let writableDir = DECRYPTED_CACHE_DIR;
  let dirOk = await ensureDir(writableDir);
  if (!dirOk) {
    // try alternate form without file://
    const alt = writableDir.startsWith("file://")
      ? writableDir.replace("file://", "")
      : `file://${writableDir}`;
    dirOk = await ensureDir(alt);
    if (dirOk) writableDir = alt;
  }
  if (!dirOk) {
    // last resort: use FileSystem.cacheDirectory root (may be with file:// already)
    const root =
      (FileSystem as any).cacheDirectory ||
      (FileSystem as any).documentDirectory ||
      "";
    if (root) {
      writableDir = root.endsWith("/") ? `${root}` : `${root}/`;
      dirOk = await ensureDir(writableDir);
    }
  }
  if (!dirOk) {
    try {
    } catch (_) {}
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.extension || "bin"}`;
  const destinationPath = `${DECRYPTED_CACHE_DIR}${filename}`;
  const plainBase64 = bytesToBase64(new Uint8Array(plain));

  // Debug: log sizes to help diagnose write failures on device
  try {
  } catch (e) {
    /* ignore logging failures */
  }

  // Attempt write, and if verification says file missing/empty, retry using alternate URI form (with/without file://)
  let writeErr: any = null;
  try {
    await FileSystem.writeAsStringAsync(destinationPath, plainBase64, {
      encoding: (FileSystem as any).EncodingType?.Base64 ?? "base64",
    });
  } catch (e) {
    writeErr = e;
    try {
    } catch (_) {}
  }

  // Verify written file exists and has expected size
  try {
    let info = await (FileSystem as any).getInfoAsync(destinationPath);
    if (!info.exists || (info.size || 0) === 0) {
      try {
      } catch (_) {}

      // Try alternate path form: if path starts with file://, try without it, otherwise try adding it.
      try {
        const alt = destinationPath.startsWith("file://")
          ? destinationPath.replace("file://", "")
          : `file://${destinationPath}`;
        try {
        } catch (_) {}
        await FileSystem.writeAsStringAsync(alt, plainBase64, {
          encoding: (FileSystem as any).EncodingType?.Base64 ?? "base64",
        });
        info = await (FileSystem as any).getInfoAsync(alt);
        if (info.exists && (info.size || 0) > 0) {
          try {
          } catch (_) {}
          // Use alt as destinationPath for return
          if (alt.startsWith("file://")) {
            // normalize to no-op; we'll return with file:// later
          }
          // Note: we do not change destinationPath variable here because it's const; instead we'll handle normalization later.
        } else {
          try {
          } catch (_) {}
          throw new Error("Retry write failed to produce file");
        }
      } catch (retryErr) {
        throw retryErr;
      }
    }
  } catch (ioErr) {
    // Re-throw so caller can show an error instead of a blank page
    throw ioErr;
  }

  // Normalize returned path to include file:// for consumers that expect URI format
  let normalized = destinationPath;
  if (!normalized.startsWith("file://") && normalized.startsWith("/")) {
    normalized = `file://${normalized}`;
  }
  return normalized;
}

export async function persistVaultFile(
  sourceUri: string,
  nameHint: string,
  extension: string,
): Promise<string> {
  const safeName = `${nameHint || "vault-item"}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
  const cleanExt = extension.replace(/^\./, "");
  const finalName = safeName.includes(".")
    ? safeName
    : `${safeName}${cleanExt ? `.${cleanExt}` : ""}`;
  const encryptedName = `${finalName}.enc`;
  let destinationUri = `${PERSISTENT_VAULT_DIR}${encryptedName}`;

  await FileSystem.makeDirectoryAsync(PERSISTENT_VAULT_DIR, {
    intermediates: true,
  });

  // Try to encrypt and write the file. If encryption fails we MUST NOT fall back to
  // unencrypted storage silently — this would leak user data. Instead surface an error
  // so the caller/UI can present the user with a retry/alert.
  let wroteEncrypted = false;
  try {
    const rawBase64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const rawBytes = base64ToBytes(rawBase64);

    const key = await getVaultKey();
    const crypto = getCrypto();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await (crypto.subtle as any).encrypt(
      { name: "AES-GCM", iv },
      key,
      rawBytes,
    );
    const payload = new Uint8Array(
      iv.length + new Uint8Array(ciphertext).length,
    );
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);
    await FileSystem.writeAsStringAsync(
      destinationUri,
      bytesToBase64(payload),
      { encoding: FileSystem.EncodingType.Base64 },
    );
    wroteEncrypted = true;
    try {
    } catch (e) {}
  } catch (error) {
    // Do not silently fall back to plaintext — surface the error to callers so they can
    // show an explicit warning and the user can choose to retry or cancel the save.
    throw error;
  }

  // If we wrote an encrypted file, keep the .enc destination; if we fell back, destinationUri
  // now points at the unencrypted fallback file.

  try {
    if (
      sourceUri &&
      sourceUri !== destinationUri &&
      sourceUri.startsWith("file://")
    ) {
      await FileSystem.deleteAsync(sourceUri, { idempotent: true });
    }
  } catch (error) {
  }

  try {
  } catch (e) {}
  return destinationUri;
}

export async function deleteVaultFile(uri?: string): Promise<void> {
  if (!uri || uri.startsWith("http://") || uri.startsWith("https://")) return;

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
  }
}

// Clears any temporary decrypted files written to the dedicated decrypted cache directory.
// This should be invoked on app startup and on backgrounding to reduce the chance of
// plaintext remnants remaining on disk.
export async function clearDecryptedCache(): Promise<void> {
  try {
    const dir = DECRYPTED_CACHE_DIR;
    if (!dir) return;
    await FileSystem.deleteAsync(dir, { idempotent: true });
    // Recreate empty folder so future writes succeed without racing with cleanup.
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch (e) {}
  } catch (e) {
  }
}

export async function loadVault(): Promise<{
  files: VaultFile[];
  folders: Folder[];
}> {
  const durable = await readDurableBackup();
  if (durable) {
    return durable;
  }

  const raw = await AsyncStorage.getItem(KEY);
  return readStoredVault(raw);
}

export async function saveVault(data: {
  files: VaultFile[];
  folders: Folder[];
}) {
  const payload = JSON.stringify(data);
  const encrypted = await encryptVault(payload);

  await AsyncStorage.setItem(KEY, encrypted);
  await writeDurableBackup(encrypted);
}

// External SAF tree URI storage key (stores the user-selected tree URI so it can be reused)
const EXTERNAL_TREE_KEY = "@paper-box/external-tree-uri";

export async function pickAndSaveExternalVaultFolder(): Promise<string> {
  const uri = await saf.pickFolder();
  if (uri) {
    await secureSetItem(EXTERNAL_TREE_KEY, uri);
  }
  return uri;
}

export async function getExternalTreeUri(): Promise<string | null> {
  try {
    return await secureGetItem(EXTERNAL_TREE_KEY);
  } catch {
    return null;
  }
}

export async function writeBytesToExternal(
  relativePath: string,
  base64Data: string,
): Promise<boolean> {
  const tree = await getExternalTreeUri();
  if (!tree) throw new Error("No external tree configured");
  return await saf.writeFileToTree(tree, relativePath, base64Data);
}

export async function readBytesFromExternal(
  relativePath: string,
): Promise<string | null> {
  const tree = await getExternalTreeUri();
  if (!tree) return null;
  return await saf.readFileFromTree(tree, relativePath);
}

// Migrate any files that were previously stored in cacheDirectory into the persistent vault.
// This should be run on app startup once after an update that corrected the storage location.
export async function migrateCacheFilesToVault(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const vault = await readStoredVault(raw);
    const cacheDir = (FileSystem as any).cacheDirectory ?? "";
    let changed = false;

    for (const file of vault.files) {
      if (!file.uri) continue;
      // Normalize file.uri to start with cacheDir; match both file://cache and plain cache paths
      if (cacheDir && file.uri.startsWith(cacheDir)) {
        try {
          const newUri = await persistVaultFile(
            file.uri,
            (file as any).id || (file as any).name || "vault-item",
            file.extension || "",
          );
          if (newUri && newUri !== file.uri) {
            file.uri = newUri;
            changed = true;
          }
        } catch (err) {
        }
      }
    }

    if (changed) {
      await saveVault(vault);
    }
  } catch (err) {
  }
}

// Passphrase onboarding isn't implemented in this build. Provide a stub so screens that reference
// initializeVaultWithPassphrase compile and can show an appropriate error to the user.
export async function initializeVaultWithPassphrase(
  passphrase: string,
  create: boolean,
): Promise<void> {
  // Intentionally not implemented: real passphrase/KDF-based recovery requires
  // additional native bindings and UX for backup/restore. Surface a clear error so the caller
  // can present the user with an appropriate message.
  throw new Error(
    "Passphrase-derived vault initialization is not implemented in this build",
  );
}
