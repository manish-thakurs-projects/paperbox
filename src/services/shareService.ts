import JSZip from "jszip";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { VaultFile } from "../types";

const CACHE_DIRECTORY = (FileSystem as any).cacheDirectory ??
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
  if (type.includes("presentationml.presentation") || type.includes("pptx")) return "pptx";
  if (type.includes("powerpoint") || type.includes("ppt")) return "ppt";
  if (type.includes("wordprocessingml.document") || type.includes("docx")) return "docx";
  if (type.includes("msword")) return "doc";
  if (type.includes("spreadsheetml.sheet") || type.includes("xlsx")) return "xlsx";
  if (type.includes("excel") || type.includes("xls")) return "xls";
  return "";
};

async function copyToCache(file: VaultFile): Promise<string> {

  const extension = file.extension || extensionFromMimeType(file.mimeType) || "bin";
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
    const filename = ensureFilename(file.name || "file", file.extension || "bin");
    const destination = `${CACHE_DIRECTORY}${filename}`;
    const { uri } = await FileSystem.downloadAsync(file.uri, destination);
    return uri;
  }

  if (file.uri.startsWith("content://") || file.uri.startsWith("file://")) {
    return await copyToCache(file);
  }

  return file.uri;
}

export async function shareVaultFile(file: VaultFile): Promise<void> {
  const targetUri = await downloadIfNeeded(file);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing not available on this device");
  }

  await Sharing.shareAsync(targetUri, { dialogTitle: file.name });
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
      const uri = await downloadIfNeeded(file);
      const data = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
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
