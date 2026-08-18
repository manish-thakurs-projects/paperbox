import { Platform } from "react-native";
import { showAlert } from "./alertService";
import * as FileSystem from "expo-file-system/legacy";
import RNFS from "react-native-fs";
import { VaultFile } from "../types";
import { decryptVaultFileForUse } from "./vaultStorage";
import {
  getExternalTreeUri,
  pickAndSaveExternalVaultFolder,
  writeBytesToExternal,
} from "./vaultStorage";
import saf from "../libs/saf";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";

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

async function promptUserToPickFolder(): Promise<boolean> {
  const idx = await showAlert(
    "Select folder",
    "Please select a folder where PaperBox can save downloads. You will only need to do this once.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Select folder" },
    ],
  );
  // Return true if user pressed the second button (Select folder)
  return idx === 1;
}

async function ensureExternalTree(): Promise<string> {
  // Get previously saved tree URI if available
  let tree = await getExternalTreeUri();
  if (tree) return tree;

  // Show explanatory prompt before opening native folder picker
  const proceed = await promptUserToPickFolder();
  if (!proceed) return "";

  // Ask the user to pick a folder using SAF (native folder picker). Persist and return
  tree = await pickAndSaveExternalVaultFolder();
  return tree || "";
}

export async function downloadFile(file: VaultFile): Promise<string> {
  try {
    // On Android prefer Storage Access Framework (no runtime WRITE_EXTERNAL_STORAGE needed)
    if (Platform.OS === "android") {
      // Ensure we have a SAF tree to write into (user picks once)
      const tree = await ensureExternalTree();
      if (!tree) throw new Error("No folder selected for external storage");

      // Prepare filename and ensure decrypted source
      const extension =
        file.extension ||
        (file.mimeType ? extractExtension(file.mimeType) : "bin");
      const filename = ensureFilename(file.name, extension);

      let sourceUri = file.uri;
      if (sourceUri.endsWith(".enc") || sourceUri.includes(".enc?")) {
        const decrypted = await decryptVaultFileForUse(file);
        if (decrypted) sourceUri = decrypted;
      }

      // Read source as base64 and write via SAF
      const fsAny = FileSystem as any;
      const info = await fsAny.getInfoAsync(sourceUri, { size: true });
      if (!info.exists) throw new Error("Source file does not exist");

      const base64 = await fsAny.readAsStringAsync(sourceUri, {
        encoding: fsAny.EncodingType.Base64,
      });

      // Try writing via vaultStorage helper (which uses SAF module)
      try {
        await writeBytesToExternal(filename, base64);
        return filename;
      } catch (e) {
        // If SAF write fails, offer MANAGE_EXTERNAL_STORAGE settings flow as a fallback on Android 11+
        try {
          console.debug(
            "downloadFile: SAF write failed, falling back to RNFS",
            e,
          );
        } catch (_) {}

        if (Platform.OS === "android") {
          try {
            const openIdx = await showAlert(
                          "Unable to save using SAF",
                          "PaperBox could not write to the selected folder. You can grant broader file access in system settings (All files access) as a fallback.",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Open settings" },
                          ],
                        );

                        if (openIdx === 1) {
              try {
                const pkgName =
                  (Constants as any)?.manifest?.android?.package ||
                  (Constants as any)?.expoConfig?.android?.package ||
                  (Constants as any)?.manifest?.slug ||
                  "paperbox.dustmedia.org";
                // Launch the Manage All Files Access settings for this app
                await IntentLauncher.startActivityAsync(
                  "android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION",
                  { data: `package:${pkgName}` },
                );
              } catch (launchErr) {
                try {
                  console.debug(
                    "downloadFile: opening MANAGE_EXTERNAL_STORAGE settings failed",
                    launchErr,
                  );
                } catch (_) {}
                // fallthrough to RNFS fallback below
              }
            }
          } catch (ee) {
            // ignore
          }
        }
      }
    }

    // Non-Android or fallback: write into app-accessible Downloads/Documents directory
    let downloadsDir =
      rnfsAny.DownloadDirectoryPath ||
      (rnfsAny.ExternalStorageDirectoryPath
        ? `${rnfsAny.ExternalStorageDirectoryPath}/Download`
        : null);

    // Fallback to DocumentDirectoryPath
    if (!downloadsDir) {
      downloadsDir = (rnfsAny as any).DocumentDirectoryPath || null;
    }

    const extension =
      file.extension ||
      (file.mimeType ? extractExtension(file.mimeType) : "bin");
    const filename = ensureFilename(file.name, extension);
    const destPath = downloadsDir ? `${downloadsDir}/${filename}` : filename;

    let sourceUri = file.uri;
    if (sourceUri.endsWith(".enc") || sourceUri.includes(".enc?")) {
      const decrypted = await decryptVaultFileForUse(file);
      if (decrypted) sourceUri = decrypted;
    }

    const srcPath = sourceUri.replace(/^file:\/\//, "");

    try {
      const exists = downloadsDir ? await rnfsAny.exists(destPath) : false;
      if (exists) {
        await rnfsAny.unlink(destPath).catch(() => {});
      }
    } catch (e) {
      // ignore
    }

    // Try direct copy first
    try {
      const srcExists = await rnfsAny.exists(srcPath);
      if (srcExists && downloadsDir) {
        await rnfsAny.copyFile(srcPath, destPath);
        return destPath;
      }
    } catch (e) {
      try {
        console.debug(
          "downloadFile: RNFS.copyFile failed, falling back to base64 method",
          e,
        );
      } catch (_) {}
    }

    // Fallback: use expo-file-system to read base64 and write with RNFS
    try {
      const fsAny = FileSystem as any;
      const info = await fsAny.getInfoAsync(sourceUri, { size: true });
      if (!info.exists) throw new Error("Source file does not exist");

      const base64 = await fsAny.readAsStringAsync(sourceUri, {
        encoding: fsAny.EncodingType.Base64,
      });
      if (downloadsDir) {
        await rnfsAny.writeFile(destPath, base64, "base64");
        return destPath;
      }

      // As last resort, write into app cache/doc dir and return that path
      const tempPath = `${(fsAny as any).cacheDirectory || (fsAny as any).documentDirectory || ""}${filename}`;
      await (fsAny as any).writeAsStringAsync(tempPath, base64, {
        encoding: (fsAny as any).EncodingType.Base64,
      });
      return tempPath;
    } catch (e) {
      try {
        console.debug("downloadFile: base64 method failed", e);
      } catch (_) {}
      throw e;
    }
  } catch (e) {
    try {
      console.debug("downloadFile failed", e);
    } catch (_) {}
    throw e;
  }
}

function extractExtension(mimeType: string): string {
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
  return "bin";
}
