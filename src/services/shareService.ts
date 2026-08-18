import JSZip from "jszip";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { VaultFile } from "../types";
import { decryptVaultFileForUse } from "./vaultStorage";

const CACHE_DIRECTORY =
  (FileSystem as any).cacheDirectory ??
  (FileSystem as any).documentDirectory ??
  "";

const ensureFilename = (name: string, ext: string) => {
  const cleaned = name.replace(/[^a-z0-9\-_.]/gi, "_");
  const normalizedExt = ext.toLowerCase();
  if (!normalizedExt) return cleaned || "file";
  if (cleaned.toLowerCase().endsWith(`.${normalizedExt}`)) {
    return cleaned;
  }
  return `${cleaned}.${normalizedExt}`;
};

const extensionFromMimeType = (mimeType?: string) => {
  if (!mimeType) return "";
  const type = mimeType.toLowerCase();
  if (type.includes("pdf")) return "pdf";
  if (type.includes("presentationml.presentation") || type.includes("pptx"))
    return "pptx";
  if (type.includes("powerpoint") || type.includes("ppt")) return "ppt";
  if (type.includes("wordprocessingml.document") || type.includes("docx"))
    return "docx";
  if (type.includes("msword")) return "doc";
  if (type.includes("spreadsheetml.sheet") || type.includes("xlsx"))
    return "xlsx";
  if (type.includes("excel") || type.includes("xls")) return "xls";
  return "";
};

async function copyToCache(file: VaultFile): Promise<string> {
  const extension =
    file.extension || extensionFromMimeType(file.mimeType) || "bin";
  const filename = ensureFilename(file.name || "file", extension);
  const destination = `${CACHE_DIRECTORY}${filename}`;
  const fsAny = FileSystem as any;

  if (CACHE_DIRECTORY) {
    try {
      await fsAny.makeDirectoryAsync(CACHE_DIRECTORY, { intermediates: true });
    } catch {
      // Directory may already exist or be managed by the file system.
    }
  }

  try {
    await fsAny.copyAsync({ from: file.uri, to: destination });
    return destination;
  } catch (e) {
    console.warn("shareService failed to stage file", e);
    return file.uri;
  }
}

async function downloadIfNeeded(file: VaultFile): Promise<string> {
  if (file.uri.startsWith("http://") || file.uri.startsWith("https://")) {
    const filename = ensureFilename(
      file.name || "file",
      file.extension || "bin",
    );
    const destination = `${CACHE_DIRECTORY}${filename}`;
    const { uri } = await FileSystem.downloadAsync(file.uri, destination);
    return uri;
  }

  if (file.uri.startsWith("content://") || file.uri.startsWith("file://")) {
    return await copyToCache(file);
  }

  return file.uri;
}

async function prepareFileForSharing(file: VaultFile): Promise<string> {
  // First obtain a usable file path/URI: decrypt if needed, otherwise download or copy to cache
  let uri: string;

  if (file.uri.endsWith(".enc") || file.uri.includes(".enc?")) {
    uri = await decryptVaultFileForUse(file);
  } else {
    uri = await downloadIfNeeded(file);
  }

  // On Android, prefer exposing a content:// URI (via Expo FileSystem.getContentUriAsync)
  // so external apps can read the file without requiring additional storage permissions.
  try {
    const fsAny = FileSystem as any;
    if (
      Platform.OS === "android" &&
      typeof fsAny.getContentUriAsync === "function" &&
      uri &&
      uri.startsWith("file://")
    ) {
      try {
        const content = await fsAny.getContentUriAsync(uri);
        const contentUri = typeof content === "string" ? content : content?.uri;
        if (contentUri && contentUri.startsWith("content://")) {
          return contentUri;
        }
      } catch (e) {
        // If conversion fails, fall back to returning the file:// URI.
        console.debug("shareService: getContentUriAsync failed", e);
      }
    }
  } catch (e) {
    // ignore platform conversion errors
  }

  return uri;
}

let _shareLock = false;
export async function shareVaultFile(file: VaultFile): Promise<void> {
  if (_shareLock)
    throw new Error("Another share request is being processed now.");
  _shareLock = true;
  try {
    const targetUri = await prepareFileForSharing(file);

    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing not available on this device");
    }

    let shareUri = targetUri;
    const fsAny = FileSystem as any;

    // Expo Sharing on Android expects a local file:// URL. If prepareFileForSharing
    // returned a content:// URI (preferred for external intents), copy it into
    // the app cache and use the resulting file:// path for Sharing.shareAsync.
    if (
      Platform.OS === "android" &&
      shareUri &&
      shareUri.startsWith("content://")
    ) {
      try {
        const extension =
          file.extension || extensionFromMimeType(file.mimeType) || "bin";
        const filename = ensureFilename(file.name || "file", extension);
        const destination = `${CACHE_DIRECTORY}${filename}`;
        try {
          await fsAny.copyAsync({ from: shareUri, to: destination });
          shareUri = destination;
        } catch (copyErr) {
          // Some content URIs may not be copyable; fall back to reading as base64 and writing
          try {
            const base64 = await fsAny.readAsStringAsync(shareUri, {
              encoding: fsAny.EncodingType.Base64,
            });
            await fsAny.writeAsStringAsync(destination, base64, {
              encoding: fsAny.EncodingType.Base64,
            });
            shareUri = destination;
          } catch (b64Err) {
            console.warn(
              "shareService: failed to stage content:// URI for sharing",
              copyErr,
              b64Err,
            );
            // leave shareUri as content:// and let shareAsync fail with useful error
          }
        }
      } catch (e) {
        console.debug("shareService: content URI staging failed", e);
      }
    }

    // Ensure file:// scheme for local paths
    if (shareUri && shareUri.startsWith("/")) {
      shareUri = `file://${shareUri}`;
    }

    await Sharing.shareAsync(shareUri, { dialogTitle: file.name });
  } finally {
    _shareLock = false;
  }
}

export async function shareVaultFiles(files: VaultFile[]): Promise<void> {
  if (!files.length) return;
  if (files.length === 1) {
    await shareVaultFile(files[0]);
    return;
  }

  const zip = new JSZip();
  await Promise.all(
    files.map(async (file) => {
      let uri = await prepareFileForSharing(file);
      const fsAny = FileSystem as any;

      // If prepareFileForSharing returned a content:// URI on Android, copy it into the app cache
      // so expo-file-system can read it as base64 for zipping.
      if (Platform.OS === "android" && uri && uri.startsWith("content://")) {
        try {
          const extension =
            file.extension || extensionFromMimeType(file.mimeType) || "bin";
          const filename = ensureFilename(file.name || "file", extension);
          const destination = `${CACHE_DIRECTORY}${filename}`;
          try {
            await fsAny.copyAsync({ from: uri, to: destination });
            uri = destination;
          } catch (e) {
            // Some content:// may not be copyable; attempt reading directly instead.
            console.debug("shareService: copyAsync from content URI failed", e);
          }
        } catch (e) {
          console.debug(
            "shareService: preparing content URI for zip failed",
            e,
          );
        }
      }

      const data = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
      zip.file(file.name, data, { base64: true });
    }),
  );

  const zipBase64 = await zip.generateAsync({ type: "base64" });
  const zipName = `PaperBox-${Date.now()}.zip`;
  const zipUri = `${CACHE_DIRECTORY}${zipName}`;
  await FileSystem.writeAsStringAsync(zipUri, zipBase64, {
    encoding: "base64",
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing not available on this device");
  }

  await Sharing.shareAsync(zipUri, { dialogTitle: "Share selected files" });
}
