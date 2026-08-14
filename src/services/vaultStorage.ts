import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { Folder, VaultFile } from "../types";

const KEY = "@paper-box/v1";
const KEY_ALIAS = "paperbox.vault.key";
const BACKUP_FILE = ".paperbox-vault.enc";
const BACKUP_DIRS = Platform.OS === "android"
  ? [
      "file:///storage/emulated/0/.paperbox",
      "file:///storage/emulated/0/Android/data/paperbox.dustmedia.org/files/.paperbox",
      "file:///storage/emulated/0/Documents/.paperbox",
    ]
  : [];
const PERSISTENT_VAULT_DIR = `${(FileSystem as any).documentDirectory ?? ""}vault/`;

const normalizeVault = (value: unknown): { files: VaultFile[]; folders: Folder[] } => {
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
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return global.btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = global.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const getVaultKey = async (): Promise<CryptoKey> => {
  let material = await SecureStore.getItemAsync(KEY_ALIAS);

  if (!material) {
    const random = crypto.getRandomValues(new Uint8Array(32));
    material = bytesToBase64(random);
    await SecureStore.setItemAsync(KEY_ALIAS, material);
  }

  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(material),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
};

const encryptVault = async (value: string): Promise<string> => {
  const key = await getVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return JSON.stringify({
    version: 1,
    iv: bytesToBase64(iv),
    payload: bytesToBase64(new Uint8Array(encrypted)),
  });
};

const decryptVault = async (value: string): Promise<{ files: VaultFile[]; folders: Folder[] }> => {
  const blob = JSON.parse(value) as { version?: number; iv?: string; payload?: string };
  if (!blob.iv || !blob.payload) {
    return normalizeVault(JSON.parse(value));
  }

  const key = await getVaultKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(blob.iv) },
    key,
    base64ToBytes(blob.payload),
  );

  const text = new TextDecoder().decode(decrypted);
  return normalizeVault(JSON.parse(text));
};

const writeDurableBackup = async (encrypted: string) => {
  if (Platform.OS !== "android") return;

  for (const dir of BACKUP_DIRS) {
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const fileUri = `${dir.replace(/\/$/, "")}/${BACKUP_FILE}`;
      await FileSystem.writeAsStringAsync(fileUri, encrypted, { encoding: FileSystem.EncodingType.UTF8 });
    } catch (error) {
      console.warn("durable vault backup failed", error);
    }
  }
};

const readDurableBackup = async (): Promise<{ files: VaultFile[]; folders: Folder[] } | null> => {
  if (Platform.OS !== "android") return null;

  for (const dir of BACKUP_DIRS) {
    const fileUri = `${dir.replace(/\/$/, "")}/${BACKUP_FILE}`;

    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) continue;

      const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
      return await decryptVault(raw);
    } catch (error) {
      console.warn("durable vault read failed", error);
    }
  }

  return null;
};

const readStoredVault = async (raw: string | null): Promise<{ files: VaultFile[]; folders: Folder[] }> => {
  if (!raw) {
    return { files: [], folders: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "payload" in parsed && "iv" in parsed) {
      return await decryptVault(raw);
    }
    return normalizeVault(parsed);
  } catch {
    return { files: [], folders: [] };
  }
};

export async function decryptVaultFileForUse(file: VaultFile): Promise<string> {
  if (!file.uri || file.uri.startsWith("http://") || file.uri.startsWith("https://")) {
    return file.uri;
  }

  const encryptedBase64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  const encryptedBytes = base64ToBytes(encryptedBase64);
  const iv = encryptedBytes.slice(0, 12);
  const payload = encryptedBytes.slice(12);
  const key = await getVaultKey();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, payload);

  const destination = `${(FileSystem as any).cacheDirectory ?? ""}${Date.now()}-${Math.random().toString(36).slice(2)}.${file.extension || "bin"}`;
  const plainBase64 = bytesToBase64(new Uint8Array(decrypted));
  await FileSystem.writeAsStringAsync(destination, plainBase64, { encoding: FileSystem.EncodingType.Base64 });
  return destination;
}

export async function persistVaultFile(sourceUri: string, nameHint: string, extension: string): Promise<string> {
  const safeName = `${nameHint || "vault-item"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cleanExt = extension.replace(/^\./, "");
  const finalName = safeName.includes(".") ? safeName : `${safeName}${cleanExt ? `.${cleanExt}` : ""}`;
  const encryptedName = `${finalName}.enc`;
  const destinationUri = `${PERSISTENT_VAULT_DIR}${encryptedName}`;

  await FileSystem.makeDirectoryAsync(PERSISTENT_VAULT_DIR, { intermediates: true });

  try {
    const rawBase64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
    const rawBytes = base64ToBytes(rawBase64);
    const key = await getVaultKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, rawBytes);
    const payload = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);
    await FileSystem.writeAsStringAsync(destinationUri, bytesToBase64(payload), { encoding: FileSystem.EncodingType.Base64 });
  } catch (error) {
    console.warn("persistVaultFile encryption failed", error);
    return sourceUri;
  }

  try {
    if (sourceUri && sourceUri !== destinationUri && sourceUri.startsWith("file://")) {
      await FileSystem.deleteAsync(sourceUri, { idempotent: true });
    }
  } catch (error) {
    console.warn("persistVaultFile cleanup failed", error);
  }

  return destinationUri;
}

export async function deleteVaultFile(uri?: string): Promise<void> {
  if (!uri || uri.startsWith("http://") || uri.startsWith("https://")) return;

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn("deleteVaultFile failed", error);
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
