import { Platform, PermissionsAndroid } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import RNFS from "react-native-fs";
import { VaultFile } from "../types";
import { decryptVaultFileForUse } from "./vaultStorage";

const rnfsAny = RNFS as any;

const ensureFilename = (name: string, ext: string) => {
  const cleaned = name.replace(/[^a-z0-9\-_.]/gi, "_");
  const normalizedExt = ext.toLowerCase();
  if (!normalizedExt) return cleaned || "file";
  if (cleaned.toLowerCase().endsWith(`.${normalizedExt}`)) {
    return cleaned;
  }
  return `${cleaned}.${normalizedExt}`;
};

async function requestStoragePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    const permission =
      Platform.Version >= 30
        ? PermissionsAndroid.PERMISSIONS.MANAGE_EXTERNAL_STORAGE
        : PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;

    const granted = await PermissionsAndroid.request(permission, {
      title: "Storage Permission Required",
      message: "PaperBox needs permission to save files to your device storage.",
      buttonNeutral: "Ask Later",
      buttonNegative: "Cancel",
      buttonPositive: "OK",
    });

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn("Error requesting storage permission:", err);
    return false;
  }
}

async function hasStoragePermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    const permission =
      Platform.Version >= 30
        ? PermissionsAndroid.PERMISSIONS.MANAGE_EXTERNAL_STORAGE
        : PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;

    const hasPermission = await PermissionsAndroid.check(permission);
    return hasPermission;
  } catch (err) {
    console.warn("Error checking storage permission:", err);
    return false;
  }
}

export async function downloadFile(file: VaultFile): Promise<string> {
  try {
    const hasPermission = await hasStoragePermission();
    if (!hasPermission) {
      const permissionGranted = await requestStoragePermissions();
      if (!permissionGranted) {
        throw new Error("Storage permission denied. Unable to save file to device.");
      }
    }

    let downloadsDir =
      rnfsAny.DownloadDirectoryPath ||
      (rnfsAny.ExternalStorageDirectoryPath ? `${rnfsAny.ExternalStorageDirectoryPath}/Download` : null);

    if (!downloadsDir) {
      throw new Error("No Downloads directory available on this device");
    }

    const extension = file.extension || (file.mimeType ? extractExtension(file.mimeType) : "bin");
    const filename = ensureFilename(file.name, extension);
    const destPath = `${downloadsDir}/${filename}`;

    let sourceUri = file.uri;
    if (sourceUri.endsWith(".enc") || sourceUri.includes(".enc?")) {
      const decrypted = await decryptVaultFileForUse(file);
      if (decrypted) sourceUri = decrypted;
    }

    const srcPath = sourceUri.replace(/^file:\/\//, "");

    try {
      const exists = await rnfsAny.exists(destPath);
      if (exists) {
        await rnfsAny.unlink(destPath).catch(() => {});
      }
    } catch (e) {
      // ignore
    }

    try {
      const srcExists = await rnfsAny.exists(srcPath);
      if (srcExists) {
        await rnfsAny.copyFile(srcPath, destPath);
        return destPath;
      }
    } catch (e) {
      try { console.debug("downloadFile: RNFS.copyFile failed, falling back to base64 method", e); } catch(_){}
    }

    try {
      const fsAny = FileSystem as any;
      const info = await fsAny.getInfoAsync(sourceUri, { size: true });
      if (!info.exists) throw new Error("Source file does not exist");

      const base64 = await fsAny.readAsStringAsync(sourceUri, { encoding: fsAny.EncodingType.Base64 });
      await rnfsAny.writeFile(destPath, base64, "base64");
      return destPath;
    } catch (e) {
      try { console.debug("downloadFile: base64 method failed", e); } catch(_){}
      throw e;
    }
  } catch (e) {
    try { console.debug("downloadFile failed", e); } catch(_){}
    throw e;
  }
}

function extractExtension(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes("pdf")) return "pdf";
  if (type.includes("presentationml.presentation") || type.includes("pptx")) return "pptx";
  if (type.includes("powerpoint") || type.includes("ppt")) return "ppt";
  if (type.includes("wordprocessingml.document") || type.includes("docx")) return "docx";
  if (type.includes("msword")) return "doc";
  if (type.includes("spreadsheetml.sheet") || type.includes("xlsx")) return "xlsx";
  if (type.includes("excel") || type.includes("xls")) return "xls";
  return "bin";
}
