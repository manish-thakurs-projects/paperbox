import * as DocumentPicker from "expo-document-picker";
import { VaultFile } from "../types";
import { extensionOf, kindOf } from "../utils/files";
import { showAlert } from "./alertService";
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

export async function pickFiles(): Promise<VaultFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) return [];

  const files = await Promise.all(
    result.assets.map(async (a) => {
      const extension = extensionOf(a.name) || "bin";
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      let durableUri: string | null = null;
      let attempts = 0;
      while (true) {
        try {
          durableUri = await persistVaultFile(a.uri, `${id}-${a.name.replace(/\.[^/.]+$/, "")}`, extension);
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
      } satisfies VaultFile;
    }),
  );

  return files;
}
