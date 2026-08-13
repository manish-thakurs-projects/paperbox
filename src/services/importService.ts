import * as DocumentPicker from "expo-document-picker";
import { VaultFile } from "../types";
import { extensionOf, kindOf } from "../utils/files";
import { persistVaultFile } from "./vaultStorage";

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
      const durableUri = await persistVaultFile(a.uri, `${id}-${a.name.replace(/\.[^/.]+$/, "")}`, extension);

      return {
        id,
        name: a.name,
        uri: durableUri,
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
