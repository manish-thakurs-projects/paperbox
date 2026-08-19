import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { VaultFile } from "../types";
import { extensionOf, kindOf } from "../utils/files";
import { showAlert, showToast } from "./alertService";
import { persistVaultFile } from "./vaultStorage";

const showRetrySaveDialog = async (message: string) => {
  const idx = await showAlert(
    "Save failed",
    message,
    [
      { text: "Retry" },
      { text: "Cancel", style: "cancel" },
    ],
  );
  return idx === 0;
};

const importKeyFor = (name: string, size?: number, mimeType?: string) =>
  `${name.trim().toLowerCase()}|${size ?? "unknown"}|${(mimeType || "").toLowerCase()}`;

export async function pickFiles(
  existingFiles: VaultFile[] = [],
): Promise<VaultFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) return [];

  const existingKeys = new Set(
    existingFiles
      .filter((file) => file.source !== "camera")
      .flatMap((file) => [
        file.sourceKey,
        importKeyFor(file.name, file.size, file.mimeType),
      ])
      .filter(Boolean),
  );
  let skippedCount = 0;
  const assetsToImport = result.assets.filter((asset) => {
    const key = importKeyFor(asset.name, asset.size, asset.mimeType);
    if (existingKeys.has(key)) {
      skippedCount += 1;
      // copyToCacheDirectory creates plaintext staging files even for skipped
      // assets, so remove those immediately instead of leaving them behind.
      void FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(
        () => {},
      );
      return false;
    }
    existingKeys.add(key);
    return true;
  });

  const files = await Promise.all(
    assetsToImport.map(async (a) => {
      const extension = extensionOf(a.name) || "bin";
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const sourceKey = importKeyFor(a.name, a.size, a.mimeType);

      let durableUri: string | null = null;
      let attempts = 0;
      while (true) {
        try {
          durableUri = await persistVaultFile(
            a.uri,
            `${id}-${a.name.replace(/\.[^/.]+$/, "")}`,
            extension,
          );
          await FileSystem.deleteAsync(a.uri, { idempotent: true }).catch(() => {});
          break;
        } catch (err: any) {
          attempts += 1;
          const retry = await showRetrySaveDialog(
            `Unable to save encrypted file ${a.name}. ${err?.message || String(err)}. Retry?`,
          );
          if (!retry || attempts >= 3) {
            throw new Error(`Failed to save imported file: ${err?.message || String(err)}`);
          }
        }
      }

      return {
        id,
        name: a.name,
        uri: durableUri ?? a.uri,
        mimeType: a.mimeType,
        size: a.size ?? 0,
        extension,
        kind: kindOf(extension),
        createdAt: new Date().toISOString(),
        isFavorite: false,
        isPinned: false,
        tags: [],
        source: "import",
        sourceKey,
      } satisfies VaultFile;
    }),
  );

  if (skippedCount > 0) {
    showToast(
      skippedCount === 1
        ? "File already exists"
        : `${skippedCount} files already exist`,
    );
  }

  return files;
}
